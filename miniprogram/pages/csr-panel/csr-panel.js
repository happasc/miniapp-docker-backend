const db = wx.cloud.database()
const _ = db.command
const app = getApp()

Page({
  data: {
    currentTab: 'inquiries',
    inquiriesList: [],
    refundsList: [],
    settlementsList: [],
    loading: false,
    authState: {
      isCSR: false
    }
  },

  onLoad() {
    // 验证客服权限
    const authState = app.getAuthState ? app.getAuthState() : {}
    if (!authState.isCSR) {
      wx.showModal({
        title: '权限不足',
        content: '您没有客服权限，无法访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }
    
    this.setData({ authState })
    this.fetchData()
  },

  onShow() {
    this.fetchData()
  },

  onPullDownRefresh() {
    this.fetchData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (this.data.currentTab !== tab) {
      this.setData({ currentTab: tab })
      this.fetchData()
    }
  },

  async fetchData() {
    this.setData({ loading: true })
    wx.showNavigationBarLoading()

    try {
      if (this.data.currentTab === 'inquiries') {
        await this.fetchInquiries()
      } else if (this.data.currentTab === 'refunds') {
        await this.fetchRefunds()
      } else if (this.data.currentTab === 'settlements') {
        await this.fetchSettlements()
      }
    } catch (err) {
      console.error('[CSR Panel] Fetch failed', err)
      wx.showToast({ title: '拉取失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      wx.hideNavigationBarLoading()
    }
  },

  async fetchInquiries() {
    // 拉取 targetId 为 SYSTEM_CSR 的会话列表
    const res = await db.collection('chat_rooms')
      .where({
        targetId: 'SYSTEM_CSR'
      })
      .orderBy('lastUpdateTime', 'desc')
      .limit(30)
      .get()

    const list = res.data.map(room => {
      const d = room.lastUpdateTime ? new Date(room.lastUpdateTime) : new Date(room._createTime || Date.now())
      const timeStr = `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      
      // 获取用户信息
      const users = room.users || {}
      const userKeys = Object.keys(users).filter(k => k !== 'SYSTEM_CSR')
      const userInfo = userKeys.length > 0 ? users[userKeys[0]] : {}
      
      return {
        ...room,
        updatedAtStr: timeStr,
        userName: userInfo.nickName || `用户_${room.userOpenId ? room.userOpenId.slice(-4) : '未知'}`,
        userAvatar: userInfo.avatarUrl || ''
      }
    })

    this.setData({ inquiriesList: list })
  },

  async fetchRefunds() {
    // 提取出带有 msgType: 'refund_request' 的特定消息
    const res = await db.collection('chat_messages')
      .where({
        msgType: 'refund_request',
        targetId: 'SYSTEM_CSR'
      })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()
      
    // 去重，以拿到需要处理的房间
    const opSet = new Set()
    const list = []
    
    for (const msg of res.data) {
      if (!opSet.has(msg.roomId)) {
        opSet.add(msg.roomId)
        const d = msg.createTime ? new Date(msg.createTime) : new Date()
        const timeStr = `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        
        list.push({
          _id: msg._id,
          roomId: msg.roomId,
          initiatorOpenId: msg.senderId,
          updatedAtStr: timeStr,
          lastMessage: { content: msg.text || '退款申请' },
          refundInfo: msg.refundInfo || {}
        })
      }
    }

    this.setData({ refundsList: list })
  },

  // ✨ 新增：获取结算请求列表
  async fetchSettlements() {
    // 提取出带有 msgType: 'settlement_request' 的特定消息
    const res = await db.collection('chat_messages')
      .where({
        msgType: 'settlement_request',
        targetId: 'SYSTEM_CSR'
      })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()
      
    // 去重，以拿到需要处理的房间
    const opSet = new Set()
    const list = []
    
    for (const msg of res.data) {
      if (!opSet.has(msg.roomId)) {
        opSet.add(msg.roomId)
        const d = msg.createTime ? new Date(msg.createTime) : new Date()
        const timeStr = `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        
        list.push({
          _id: msg._id,
          roomId: msg.roomId,
          initiatorOpenId: msg.senderId,
          updatedAtStr: timeStr,
          lastMessage: { content: msg.text || '收益结算申请' },
          settlementInfo: msg.settlementInfo || {}
        })
      }
    }

    this.setData({ settlementsList: list })
  },

  openChat(e) {
    const targetId = e.currentTarget.dataset.targetid
    if (!targetId) return
    
    // 跳转到聊天页面，以客服身份进入
    wx.navigateTo({
      url: `/pages/messages/chat?roomId=${targetId}&fromCSR=true`
    })
  }
})
