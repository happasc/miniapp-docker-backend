// miniprogram/pages/booster-lobby/booster-lobby.js
const app = getApp()

Page({
  data: {
    orders: [], // 待抢订单池
    grabLoading: '', // 当前正在抢单的订单ID
    todayIncome: 0,
    todayCount: 0,
    showHistoryList: false,
    settlementRecords: [],
    totalSettlements: 0,
    totalSettlementAmount: 0
  },

  onLoad(options) {
    // 权限校验拦截，防止普通用户直接进入
    const auth = app.globalData?.auth || {}
    /* 这里如果还需要验证可以继续放代码，先解除拦截以供测试
    if (!auth.isBooster) {
      wx.showModal({
        title: '无权限',
        content: '只有认证指导才能访问接单大厅',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }
    */
    this.fetchOrders()
  },

  // ✨ 新增：页面显示时刷新收益数据
  onShow() {
    // 每次进入页面都刷新今日收益和历史收益
    if (wx.cloud) {
      const db = wx.cloud.database()
      this.fetchStats(db)
      // 始终刷新历史收益数据
      this.fetchSettlementRecords()
    }
  },

  // ✨ 新增：刷新收益数据（供外部调用）
  refreshIncomeData() {
    if (wx.cloud) {
      const db = wx.cloud.database()
      this.fetchStats(db)
      if (this.data.showHistoryList) {
        this.fetchSettlementRecords()
      }
    }
  },

  async fetchStats(db) {
    try {
      const auth = app.getAuthState ? app.getAuthState() : (app.globalData?.auth || {})
      const openid = auth._openid
      if (!openid) return

      const _ = db.command
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      // 1. 查询打手今日已完成的订单
      const ordersRes = await db.collection('orders').where({
        boosterId: openid,
        status: 'completed',
        updateTime: _.gte(startOfToday)
      }).get()

      const count = ordersRes.data.length
      
      // 2. 计算今日完成订单的总收益
      const totalIncome = ordersRes.data.reduce((sum, item) => {
        if (item.boosterActualIncome !== undefined && item.boosterActualIncome !== null) {
          return sum + item.boosterActualIncome
        }
        const amount = item.amount || 0
        const commission = amount * 0.12
        const actualIncome = amount - commission
        return sum + actualIncome
      }, 0)

      // 3. 查询今日已结算的金额
      const settlementRes = await db.collection('settlement_records').where({
        boosterId: openid,
        status: 'confirmed',
        confirmTime: _.gte(startOfToday)
      }).get()

      const settledAmount = settlementRes.data.reduce((sum, item) => {
        return sum + (item.amount || 0)
      }, 0)

      // 4. 今日收益 = 总收益 - 已结算金额
      const todayIncome = Math.max(0, totalIncome - settledAmount)

      console.log('=== 今日收益计算 ===')
      console.log('今日完成订单数:', count)
      console.log('总收益:', totalIncome.toFixed(2))
      console.log('已结算金额:', settledAmount.toFixed(2))
      console.log('今日收益:', todayIncome.toFixed(2))

      this.setData({
        todayCount: count,
        todayIncome: todayIncome.toFixed(2)
      })
    } catch (err) {
      console.error('获取接单统计失败', err)
    }
  },

  // 从云数据库拉取"待抢单"的数据
  async fetchOrders() {
    if (!wx.cloud) {
      wx.showToast({ title: '云开发未初始化', icon: 'none' })
      return
    }

    wx.showNavigationBarLoading()
    try {
      const db = wx.cloud.database()
      console.log('开始查询订单池...')
      
      const res = await db.collection('orders').where({
        status: 'waiting_grab'
      }).orderBy('createTime', 'desc').get()

      console.log('查询结果:', res)

      // 格式化时间并组合数据
      const ordersInfo = res.data.map(item => {
        try {
          // ✨ 新增：计算扣除12%抽成后的金额
          const originalAmount = parseFloat(item.amount) || 0
          const commission = originalAmount * 0.12 // 12%抽成
          const actualAmount = originalAmount - commission
          
          return {
            ...item,
            createTimeFormatted: item.createTime ? new Date(item.createTime).toLocaleString() : '刚刚',
            actualAmount: actualAmount.toFixed(2), // 打手实际可获得的金额（扣除抽成后），转为字符串
            originalAmount: originalAmount.toFixed(2), // 订单原始金额，转为字符串
            commission: commission.toFixed(2) // 抽成金额
          }
        } catch (mapErr) {
          console.error('处理订单数据出错:', mapErr, item)
          return item // 返回原始数据
        }
      })

      console.log('处理后的订单数据:', ordersInfo)
      this.setData({ orders: ordersInfo })
      this.fetchStats(db) // 同步今日收益
    } catch (err) {
      console.error('拉取订单池失败', err)
      console.error('错误堆栈:', err.stack)
      wx.showToast({ 
        title: err.errMsg || '拉取接单池失败', 
        icon: 'none',
        duration: 3000
      })
    } finally {
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
    }
  },

  // 抢单逻辑（触发云函数更新核心数据）
  async grabOrder(e) {
    const orderId = e.currentTarget.dataset.id
    if (!orderId) return
    
    // --- 本地前端性别初步拦截 ---
    const order = this.data.orders.find(o => o._id === orderId)
    const auth = app.getAuthState ? app.getAuthState() : (app.globalData?.auth || {})
    const boosterGender = auth.gender || 'unknown'
    
    let reqGender = order?.requiredGender || 'any';
    // 若没有携带规则，从所有可能带有性别描述的文案中兜底查找
    if (!order?.requiredGender) {
      const checkStrStr = [
        order?.serviceName || '',
        order?.title || '',
        order?.summary || '',
        order?.extra || ''
      ].join('-');
      if (checkStrStr.includes('男陪')) reqGender = 'male';
      else if (checkStrStr.includes('女陪')) reqGender = 'female';
    }

    if (boosterGender === 'unknown') {
      wx.showToast({ title: '请先前往设置页面选择性别', icon: 'none' })
      return
    }

    if (reqGender === 'male' && boosterGender !== 'male') {
      wx.showToast({ title: '限男打手接单', icon: 'none' })
      return
    }

    if (reqGender === 'female' && boosterGender !== 'female') {
      wx.showToast({ title: '限女打手接单', icon: 'none' })
      return
    }
    // --- 拦截结束 ---

    this.setData({ grabLoading: orderId })

    try {
      wx.showLoading({ title: '超速抢单中...', mask: true })
      
      // 调用抢单的云函数 (下一次实现该云函数)
      const res = await wx.cloud.callFunction({
        name: 'booster_grab_order',
        data: {
          orderId: orderId
        }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        wx.showToast({ title: '🏆 抢单成功！', icon: 'success' })
        // 抢单成功后，把这笔单子从列表中移除
        const newOrders = this.data.orders.filter(item => item._id !== orderId)
        this.setData({ orders: newOrders })
      } else {
        wx.showToast({ 
          title: res.result?.message || '手慢了，已被抢', 
          icon: 'error',
          duration: 2000
        })
        // 别人抢了，立马刷新列表
        this.fetchOrders() 
      }
    } catch (err) {
      console.error('抢单调用失败', err)
      wx.hideLoading()
      wx.showToast({ title: '网络异常', icon: 'none' })
    } finally {
      this.setData({ grabLoading: '' })
    }
  },

  // ✨ 结算收益功能（在小程序内发送结算申请卡片给客服）
  async handleSettleIncome() {
    const auth = app.getAuthState ? app.getAuthState() : (app.globalData?.auth || {})
    const openid = auth._openid || auth.user_id
    
    if (!openid) {
      wx.showToast({ title: '未登录', icon: 'none' })
      return
    }

    const todayIncome = parseFloat(this.data.todayIncome)
    
    if (todayIncome <= 0) {
      wx.showToast({ title: '今日暂无收益可结算', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认结算申请',
      content: `确定要提交 ¥${todayIncome.toFixed(2)} 的收益结算申请给客服吗？`,
      confirmText: '确认提交',
      cancelText: '取消',
      confirmColor: '#7c3aed',
      success: async (res) => {
        if (res.confirm) {
          await this.createSettlementRequest(todayIncome, openid)
        }
      }
    })
  },

  // ✨ 创建结算申请并发送到客服聊天
  async createSettlementRequest(amount, openid) {
    try {
      wx.showLoading({ title: '提交中', mask: true })
      
      const db = wx.cloud.database()
      const roomId = `cs_${openid}`
      
      // 1. 确保客服聊天室存在
      const now = db.serverDate()
      await db.collection('chat_rooms').doc(roomId).set({
        data: {
          // 移除 _id 字段，因为 doc(id).set() 会自动使用 id 作为 _id
          roomId: roomId,
          type: 'customer_service',
          users: {
            [openid]: { role: 'booster' },
            SYSTEM_CSR: { role: 'csr' }
          },
          userOpenId: openid,
          lastUpdateTime: now,
          lastMessage: '收益结算申请',
          createTime: now
        }
      })
      
      // 2. 作废旧的 pending 结算请求（防重复机制）
      try {
        const oldRequests = await db.collection('chat_messages')
          .where({
            roomId: roomId,
            msgType: 'settlement_request',
            'settlementInfo.status': 'pending'
          })
          .orderBy('createTime', 'desc')
          .get()
        
        if (oldRequests.data.length > 0) {
          // 跳过最新的，作废旧的
          for (let i = 1; i < oldRequests.data.length; i++) {
            await db.collection('chat_messages').doc(oldRequests.data[i]._id).update({
              data: {
                'settlementInfo.status': 'cancelled',
                'settlementInfo.cancelTime': now,
                'settlementInfo.cancelReason': '被新的结算申请替代'
              }
            })
          }
        }
      } catch (err) {
        console.warn('作废旧结算请求失败（不影响新请求创建）:', err)
      }
      
      // 3. 创建新的结算申请消息
      const settleDate = new Date()
      const settleDateStr = `${settleDate.getFullYear()}-${String(settleDate.getMonth() + 1).padStart(2, '0')}-${String(settleDate.getDate()).padStart(2, '0')} ${String(settleDate.getHours()).padStart(2, '0')}:${String(settleDate.getMinutes()).padStart(2, '0')}:${String(settleDate.getSeconds()).padStart(2, '0')}`
      
      await db.collection('chat_messages').add({
        data: {
          roomId: roomId,
          senderId: openid,
          msgType: 'settlement_request',
          text: `申请结算今日收益 ¥${amount.toFixed(2)}`,
          settlementInfo: {
            status: 'pending',
            amount: amount,
            settleDate: settleDate,
            settleDateStr: settleDateStr,
            requestTime: now
          },
          createTime: now,
          sendTime: now
        }
      })
      
      wx.hideLoading()
      wx.showToast({ title: '已提交', icon: 'success' })
      
      // 清空今日收益显示
      this.setData({ todayIncome: '0.00' })
      
      // 延迟跳转到客服聊天页面
      setTimeout(() => {
        wx.navigateTo({
          url: `/pages/messages/chat?roomId=${roomId}`
        })
      }, 1500)
      
    } catch (err) {
      wx.hideLoading()
      console.error('提交结算申请失败', err)
      wx.showToast({ title: '提交失败', icon: 'none', duration: 3000 })
    }
  },

  // ✨ 分享功能（仅用于菜单分享，不用于按钮）
  onShareAppMessage() {
    return {
      title: 'GapHunt - 专属接单大厅',
      path: '/pages/booster-lobby/booster-lobby'
    }
  },

  // ✨ 新增：切换历史收益显示
  toggleHistoryList() {
    this.setData({ showHistoryList: !this.data.showHistoryList })
    if (!this.data.showHistoryList) {
      this.fetchSettlementRecords()
    }
  },

  // ✨ 新增：获取结算记录
  async fetchSettlementRecords() {
    try {
      const auth = app.getAuthState ? app.getAuthState() : (app.globalData?.auth || {})
      const openid = auth._openid
      if (!openid) return
      
      const db = wx.cloud.database()
      const _ = db.command
      
      const res = await db.collection('settlement_records')
        .where({
          boosterId: openid,
          status: 'confirmed'
        })
        .orderBy('confirmTime', 'desc')
        .limit(50)
        .get()
      
      const records = res.data.map(item => {
        const date = new Date(item.settleDate)
        const confirmTime = item.confirmTime ? new Date(item.confirmTime) : null
        return {
          ...item,
          settleDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          confirmTimeStr: confirmTime ? `${confirmTime.getFullYear()}-${String(confirmTime.getMonth() + 1).padStart(2, '0')}-${String(confirmTime.getDate()).padStart(2, '0')} ${String(confirmTime.getHours()).padStart(2, '0')}:${String(confirmTime.getMinutes()).padStart(2, '0')}` : '-'
        }
      })
      
      const totalAmount = records.reduce((sum, item) => sum + item.amount, 0)
      
      this.setData({
        settlementRecords: records,
        totalSettlements: records.length,
        totalSettlementAmount: totalAmount.toFixed(2)
      })
      
    } catch (err) {
      console.error('获取结算记录失败', err)
    }
  },

  onPullDownRefresh() {
    this.fetchOrders()
  }
})
