// pages/messages/chat.js
const app = getApp()

Page({
  data: {
    roomId: '',
    targetId: '',
    title: '',
    messages: [],
    inputText: '',
    currentOpenId: '',
    isCSR: false,
    isCSRRoom: false,
    isSystem: false,
    scrollToView: 'bottom',
    db: null
  },

  onLoad(options) {
    const auth = app.globalData.auth || {}
    const openid = auth._openid || auth.user_id
    
    if (!openid) {
      wx.showToast({ title: '未登录', icon: 'none' })
      return
    }
    
    // ✨ 延迟初始化数据库
    try {
      this.db = wx.cloud.database()
    } catch (err) {
      console.error('数据库初始化失败', err)
      wx.showModal({
        title: '错误',
        content: '云数据库未初始化，请检查云开发配置',
        showCancel: false
      })
      return
    }
    
    const roomId = options.roomId || ''
    const targetId = options.targetId || ''
    const isCSRRoom = options.isCSR === 'true' || roomId.startsWith('cs_')
    const isSystem = options.isSystem === 'true'
    
    // 设置标题
    let title = '专属客服'
    if (isCSRRoom && !isSystem) {
      title = '专属客服'
    } else if (roomId.startsWith('order_')) {
      title = '订单沟通'
    }
    
    // ✨ 禁用缓存：每次都从数据库重新加载，确保数据最新
    // const cacheKey = `chat_messages_${roomId}`
    // const cachedMessages = wx.getStorageSync(cacheKey) || []
    const cachedMessages = []  // 不使用缓存
    const cacheKey = null  // 禁用缓存保存
    
    this.setData({
      roomId,
      targetId,
      currentOpenId: openid,
      isCSR: auth.isCSR || false,
      isCSRRoom,
      isSystem,
      title,
      messages: cachedMessages
    })
    
    // 初始化聊天室
    this.initChatRoom(roomId, targetId, openid, isCSRRoom)
    
    // 启动消息监听（不使用缓存）
    this.initWatch(roomId, cachedMessages, cacheKey)
    
    // 清除未读标记
    if (roomId) {
      wx.setStorageSync(`chat_read_time_${roomId}`, Date.now())
    }
  },

  onUnload() {
    if (this.data.roomId) {
      wx.setStorageSync(`chat_read_time_${this.data.roomId}`, Date.now())
    }
    
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  },

  async initChatRoom(roomId, targetId, openid, isCSRRoom) {
    if (!roomId) return
    
    try {
      // 检查房间是否存在
      const roomRes = await this.db.collection('chat_rooms').doc(roomId).get()
      
      if (!roomRes.data) {
        // 创建新房间
        await this.db.collection('chat_rooms').add({
          data: {
            _id: roomId,
            roomId: roomId,
            targetId: targetId || 'SYSTEM_CSR',
            users: {
              [openid]: { nickName: '用户', avatarUrl: '' },
              [targetId || 'SYSTEM_CSR']: { nickName: '客服', avatarUrl: '' }
            },
            lastUpdateTime: this.db.serverDate(),
            _createTime: this.db.serverDate()
          }
        })
      }
    } catch (err) {
      console.log('聊天室已存在或创建中', err)
    }
  },

  initWatch(roomId, cachedMessages = [], cacheKey) {
    if (!this.db) {
      console.error('数据库未初始化')
      return
    }
    
    const _ = this.db.command
    let queryCond = { roomId: roomId }
    
    if (cachedMessages && cachedMessages.length > 0) {
      let latestTime = 0
      for (let i = cachedMessages.length - 1; i >= 0; i--) {
        if (cachedMessages[i].createTime) {
          latestTime = new Date(cachedMessages[i].createTime).getTime()
          break
        }
      }
      if (latestTime > 0) {
        queryCond.createTime = _.gt(new Date(latestTime))
      }
    }
    
    this.watcher = this.db.collection('chat_messages')
      .where(queryCond)
      .watch({
        onChange: (snapshot) => {
          let newDocs = snapshot.docs || []
          if (newDocs.length === 0) return
          
          let currentMsgs = this.data.messages || []
          let msgMap = new Map()
          
          currentMsgs.forEach(m => msgMap.set(m._id, m))
          newDocs.forEach(m => msgMap.set(m._id, m))
          
          let mergedList = Array.from(msgMap.values())
          
          // ✨ 过滤已作废的结算请求（仅对打手隐藏，客服仍然可见）
          const { isCSR } = this.data
          
          // 如果是打手，隐藏 cancelled 状态的结算请求
          if (!isCSR) {
            mergedList = mergedList.filter(msg => {
              // 如果不是结算请求，保留
              if (msg.msgType !== 'settlement_request') {
                return true
              }
              
              // 隐藏 cancelled 状态
              const status = msg.settlementInfo?.status
              return status !== 'cancelled'
            })
          }
          
          // ✨ 格式化时间字段
          mergedList = mergedList.map(msg => {
            if (msg.msgType === 'settlement_request' && msg.settlementInfo) {
              if (msg.settlementInfo.settleDate) {
                const settleDate = new Date(msg.settlementInfo.settleDate)
                msg.settlementInfo.settleDateStr = this.formatDateTime(settleDate)
              }
              if (msg.settlementInfo.confirmTime) {
                const confirmTime = new Date(msg.settlementInfo.confirmTime)
                msg.settlementInfo.confirmTimeStr = this.formatDateTime(confirmTime)
              }
              if (msg.settlementInfo.cancelTime) {
                const cancelTime = new Date(msg.settlementInfo.cancelTime)
                msg.settlementInfo.cancelTimeStr = this.formatDateTime(cancelTime)
              }
            }
            return msg
          })
          
          mergedList.sort((a, b) => {
            const timeA = a.createTime ? new Date(a.createTime).getTime() : 0
            const timeB = b.createTime ? new Date(b.createTime).getTime() : 0
            return timeA - timeB
          })
          
          this.setData({
            messages: mergedList
          }, () => {
            this.scrollToBottom()
          })
        },
        onError: (err) => {
          console.error('实时监听失败', err)
        }
      })
  },

  scrollToBottom() {
    this.setData({ scrollToView: 'bottom' })
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onKeyboardHeightChange(e) {
    this.scrollToBottom()
  },

  onFocus() {
    setTimeout(() => {
      this.scrollToBottom()
    }, 150)
  },

  sendMessage() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '不能发空消息', icon: 'none' })
      return
    }
    
    if (!this.db) {
      wx.showToast({ title: '数据库未初始化', icon: 'none' })
      return
    }
    
    const { roomId, currentOpenId, isCSRRoom } = this.data
    this.setData({ inputText: '' })
    
    const auth = app.globalData.auth || {}
    const userInfo = auth.userInfo || {}
    
    this.db.collection('chat_messages').add({
      data: {
        roomId: roomId,
        senderId: currentOpenId,
        targetId: isCSRRoom ? 'SYSTEM_CSR' : '',
        text: text,
        avatarUrl: userInfo.avatarUrl || '',
        nickName: userInfo.nickName || '神秘玩家',
        createTime: this.db.serverDate()
      }
    }).then(res => {
      // 成功发送，通过watch自动渲染
    }).catch(err => {
      console.error('发送消息失败', err)
      wx.showToast({ title: '发送失败', icon: 'none' })
    })
  },

  formatDateTime(date) {
    if (!date) return ''
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  },

  handleConfirmSettlement(e) {
    const { messageId, index } = e.currentTarget.dataset
    
    console.log('=== 结算按钮点击 ===')
    console.log('messageId:', messageId)
    console.log('index:', index)
    
    if (index === undefined || index === null) {
      wx.showToast({ title: '消息索引缺失', icon: 'none' })
      return
    }
    
    const message = this.data.messages[index]
    if (!message) {
      wx.showToast({ title: '消息数据不存在', icon: 'none' })
      return
    }
    
    const msgId = message._id || messageId
    const amount = message.settlementInfo?.amount
    const boosterId = message.senderId
    
    if (!msgId || !amount || !boosterId) {
      wx.showToast({ title: '数据异常', icon: 'none' })
      return
    }
    
    wx.showModal({
      title: '确认打款',
      content: `确认已线下转账 ¥${amount} 给打手？`,
      confirmText: '确认打款',
      confirmColor: '#7c3aed',
      success: async (res) => {
        if (res.confirm) {
          await this.processSettlementConfirmation(msgId, amount, boosterId)
        }
      }
    })
  },

  async processSettlementConfirmation(messageId, amount, boosterId) {
    try {
      wx.showLoading({ title: '处理中', mask: true })
      
      if (!this.db) {
        throw new Error('数据库未初始化')
      }
      
      // 1. 更新消息状态为 confirmed
      await this.db.collection('chat_messages').doc(messageId).update({
        data: {
          'settlementInfo.status': 'confirmed',
          'settlementInfo.confirmTime': this.db.serverDate()
        }
      })
      
      // 2. 创建 settlement_records 记录
      await this.db.collection('settlement_records').add({
        data: {
          boosterId: boosterId,
          amount: parseFloat(amount.toFixed(2)),
          settleDate: new Date(),
          confirmTime: this.db.serverDate(),
          status: 'confirmed',
          createTime: this.db.serverDate()
        }
      })
      
      // 3. 发送系统通知消息给打手
      const roomId = this.data.roomId
      await this.db.collection('chat_messages').add({
        data: {
          roomId: roomId,
          senderId: 'SYSTEM_CSR',
          text: `✅ 结算已完成！¥${amount} 已打入您的账户，今日收益已清零。`,
          msgType: 'system_notification',
          targetId: boosterId,
          createTime: this.db.serverDate()
        }
      })
      
      wx.hideLoading()
      wx.showToast({ title: '已确认', icon: 'success' })
      
      // 本地即时更新
      const updatedMessages = this.data.messages.map(msg => {
        if (msg._id === messageId) {
          return {
            ...msg,
            settlementInfo: {
              ...msg.settlementInfo,
              status: 'confirmed',
              confirmTime: new Date(),
              confirmTimeStr: this.formatDateTime(new Date())
            }
          }
        }
        return msg
      })
      
      this.setData({ messages: updatedMessages })
      this.scrollToBottom()
      
    } catch (err) {
      wx.hideLoading()
      console.error('确认结算失败', err)
      wx.showToast({ title: '处理失败', icon: 'none', duration: 3000 })
    }
  },

  // ✨ 分享按钮点击事件（原生分享按钮会自动触发，这里只做记录）
  handleShareSettlement(e) {
    const { index, amount, roomid } = e.currentTarget.dataset
    
    console.log('打手点击分享结算申请:', {
      index,
      amount,
      roomId: roomid,
      clickTime: new Date()
    })
    
    // 原生分享按钮会自动调用 onShareAppMessage，无需额外处理
  },

  // ✨ 配置分享卡片内容（原生分享按钮会调用此方法）
  onShareAppMessage(options) {
    const auth = app.globalData.auth || {}
    const { messages, roomId } = this.data
    
    // 如果从按钮触发，获取按钮上的数据
    let shareAmount = 0
    let shareRoomId = roomId
    
    if (options.from === 'button' && options.target) {
      const dataset = options.target.dataset
      shareAmount = parseFloat(dataset.amount) || 0
      shareRoomId = dataset.roomid || roomId
    } else {
      // 如果没有从按钮获取，尝试从消息列表中获取
      const pendingSettlement = messages
        ? messages.filter(msg => 
            msg.msgType === 'settlement_request' && 
            msg.senderId === auth.user_id &&
            msg.settlementInfo && 
            msg.settlementInfo.status === 'pending'
          ).sort((a, b) => new Date(b.sendTime || b.createTime) - new Date(a.sendTime || a.createTime))[0]
        : null
      
      shareAmount = pendingSettlement ? pendingSettlement.settlementInfo.amount : 0
    }
    
    return {
      title: `【收益结算申请】¥${shareAmount.toFixed(2)}`,
      path: `/pages/messages/chat?roomId=${shareRoomId}&from=share&amount=${shareAmount}&isCSR=true`,
    }
  }
})
