const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    games: [
      { id: 'valorant', name: '无畏契约' },
      { id: 'delta', name: '三角洲行动' },
      { id: 'delta_pc', name: '三角洲行动（端游）' },
      { id: 'peacekeeper', name: '和平精英' },
      { id: 'overwatch', name: '守望先锋' }
    ],
    gameAccounts: {}, // 真实存库的数据 map，比如 { valorant: '张三#123' }
    inputValues: {} // 当前输入框内的临时值
  },

  onLoad() {
    // ✨ 只在第一次加载时获取数据，之后不再自动刷新
    console.log('页面加载，获取游戏ID数据')
    this.fetchGameIds()
  },

  // ✨ 注释掉 onShow，避免每次页面显示都重新加载数据
  // onShow() {
  //   this.fetchGameIds()
  // },

  async fetchGameIds() {
    const authState = app.getAuthState ? app.getAuthState() : {}
    if (!authState.loggedIn || !authState._openid) {
      console.log('用户未登录，无法加载游戏ID')
      return
    }

    wx.showLoading({ title: '加载中' })
    try {
      console.log('=== 开始加载游戏ID ===')
      console.log('当前用户 openid:', authState._openid)
      
      // ✨ 修改：使用 where 查询而不是 doc()，因为可能 _id 字段名不同
      const res = await db.collection('users').where({
        _openid: authState._openid
      }).get()
      
      console.log('数据库查询结果:', res)
      console.log('res.data:', res.data)
      console.log('res.data 长度:', res.data ? res.data.length : 0)
      
      if (res.data && res.data.length > 0) {
        const userData = res.data[0] // 取第一条记录
        console.log('用户数据:', userData)
        console.log('userData.gameAccounts:', userData.gameAccounts)
        
        const gameAccounts = userData.gameAccounts || {}
        console.log('解析后的 gameAccounts:', gameAccounts)
        console.log('gameAccounts 的键:', Object.keys(gameAccounts))
        
        // ✨ 修改：同时初始化 gameAccounts 和 inputValues，确保输入框能正确显示已保存的值
        this.setData({
          gameAccounts: gameAccounts,
          inputValues: { ...gameAccounts } // 复制一份到 inputValues
        }, () => {
          console.log('setData 完成后的状态:')
          console.log('this.data.gameAccounts:', this.data.gameAccounts)
          console.log('this.data.inputValues:', this.data.inputValues)
        })
      } else {
        console.log('未找到用户记录，可能用户还未创建')
        console.log('将使用空的 gameAccounts')
        // 即使没有用户记录，也初始化空数据
        this.setData({
          gameAccounts: {},
          inputValues: {}
        })
      }
    } catch (e) {
      console.error('读取用户信息失败', e)
      console.error('错误详情:', JSON.stringify(e))
      // 即使失败也初始化空数据，避免页面空白
      this.setData({
        gameAccounts: {},
        inputValues: {}
      })
    } finally {
      wx.hideLoading()
    }
  },

  onInputChanging(e) {
    const gameId = e.currentTarget.dataset.gameid
    const value = e.detail.value || ''
    
    // ✨ 修改：直接更新，使用节流避免频繁渲染
    // 微信小程序 input 组件在 bindinput 中 setData 会导致输入卡顿
    // 解决方案：使用 requestAnimationFrame 或延迟更新
    if (this._inputTimer) {
      clearTimeout(this._inputTimer)
    }
    
    this._inputTimer = setTimeout(() => {
      this.setData({
        [`inputValues.${gameId}`]: value
      })
    }, 100) // 100ms 延迟，用户感知不到
  },

  onInputBlur(e) {
    const gameId = e.currentTarget.dataset.gameid
    const value = e.detail.value || ''
    
    // ✨ 失焦时立即更新，确保保存时数据是最新的
    if (this._inputTimer) {
      clearTimeout(this._inputTimer)
      this._inputTimer = null
    }
    
    console.log('失焦，更新数据:', gameId, value)
    this.setData({
      [`inputValues.${gameId}`]: value
    })
  },

  async saveSingle(e) {
    const gameId = e.currentTarget.dataset.gameid
    
    // ✨ 修改：从 inputValues 获取值，如果不存在则从 gameAccounts 获取
    let newValue = this.data.inputValues[gameId]
    if (newValue === undefined || newValue === null) {
      newValue = this.data.gameAccounts[gameId] || ''
    }
    
    console.log('=== 开始保存游戏ID ===')
    console.log('gameId:', gameId)
    console.log('newValue:', newValue)
    console.log('当前的 inputValues:', this.data.inputValues)
    console.log('当前的 gameAccounts:', this.data.gameAccounts)
    
    if (!newValue || newValue.trim() === '') {
      console.log('值为空，退出保存')
      wx.showToast({ title: '请输入游戏ID', icon: 'none' })
      return
    }

    const authState = app.getAuthState ? app.getAuthState() : {}
    if (!authState.loggedIn || !authState._openid) {
      console.log('用户未登录，无法保存')
      return
    }

    wx.showLoading({ title: '保存中', mask: true })
    
    try {
      const dbCmd = db.command

      // ✨ 修改：先检查用户记录是否存在
      const checkRes = await db.collection('users').where({
        _openid: authState._openid
      }).get()
      
      console.log('检查用户记录:', checkRes.data.length)
      
      if (checkRes.data.length === 0) {
        // 用户记录不存在，先创建
        console.log('用户记录不存在，先创建用户记录')
        await db.collection('users').add({
          data: {
            _openid: authState._openid,
            gameAccounts: {
              [gameId]: newValue
            },
            nickName: authState.nickName || '',
            avatarUrl: authState.avatarUrl || '',
            createTime: db.serverDate()
          }
        })
      } else {
        // 用户记录存在，更新 gameAccounts
        const dataToUpdate = {
          [`gameAccounts.${gameId}`]: newValue
        }
        
        console.log('准备更新的数据:', dataToUpdate)

        await db.collection('users').where({ 
          _openid: authState._openid 
        }).update({
          data: dataToUpdate
        })
      }
      
      console.log('数据库更新成功')

      // 更新本地状态使其对应确认
      this.setData({
        [`gameAccounts.${gameId}`]: newValue,
        [`inputValues.${gameId}`]: newValue // ✨ 修改：更新为新值
      }, () => {
        console.log('本地状态更新完成')
        console.log('更新后的 gameAccounts:', this.data.gameAccounts)
        console.log('更新后的 inputValues:', this.data.inputValues)
      })

      // 同步到 globalData
      const currentAuth = { ...authState }
      if (!currentAuth.userInfo) currentAuth.userInfo = {}
      if (!currentAuth.userInfo.gameAccounts) currentAuth.userInfo.gameAccounts = {}
      currentAuth.userInfo.gameAccounts[gameId] = newValue
      app.setAuthState(currentAuth)
      
      console.log('globalData 已同步')

      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      console.error('保存失败', err)
      console.error('错误详情:', JSON.stringify(err))
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})