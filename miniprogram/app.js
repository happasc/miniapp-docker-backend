const AUTH_STORAGE_KEY = 'gaphunt-auth-state'

const GAME_IMAGE_FILES = {
  delta: 'cloud://cloudbase-4gben08iaa5fe82b.636c-cloudbase-4gben08iaa5fe82b-1421354828/images/games/delta.jpg',
  valorant: 'cloud://cloudbase-4gben08iaa5fe82b.636c-cloudbase-4gben08iaa5fe82b-1421354828/images/games/valorant.jpg'
}

function buildLocalGameImageUrl(fileName) {
  if (!fileName) return ''
  // 如果已经是云存储链接或网络链接，直接返回
  if (fileName.startsWith('cloud://') || fileName.startsWith('http')) {
    return fileName
  }
  return '/images/games/' + fileName
}

App({
  globalData: {
    // API不再走本地，废弃apiBaseUrl
    auth: {
      token: '',
      user_id: '',
      userInfo: null,
      loggedIn: false
    }
  },

  onLaunch() {
    this.globalData.auth = this.loadAuthState()
    
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloudbase-4gben08iaa5fe82b',
        traceUser: true,
      });
      // 静默调用云函数获取/注册用户身份 (包括 isAdmin, isBooster)
      this.initCloudUser();
    }
  },

  initCloudUser() {
    wx.cloud.callFunction({
      name: 'user_login',
      success: res => {
        console.log('[云开发] 用户静默登录成功', res.result);
        const userData = res.result;
        
        // 更新全局鉴权状态，加入身份标识，完全根据云端返回的数据设置身份
        const currentAuth = this.globalData.auth;
        
        const userInfo = {
          avatarUrl: userData.avatarUrl || currentAuth.userInfo?.avatarUrl || '',
          nickName: userData.nickName || currentAuth.userInfo?.nickName || '',
        };

        this.setAuthState({
          ...currentAuth,
          _openid: userData._openid,
          user_id: userData._openid,
          isAdmin: userData.isAdmin === true,
          isBooster: userData.isBooster === true,
          isCSR: userData.isCSR === true,
          gender: userData.gender || currentAuth.gender || 'unknown',
          userInfo: userInfo,
          loggedIn: true
        });
      },
      fail: err => {
        console.error('[云开发] 用户静默登录失败', err);
      }
    });
  },

  loadAuthState() {
    const stored = wx.getStorageSync(AUTH_STORAGE_KEY)
    if (!stored || typeof stored !== 'object') {
      return {
        token: '',
        user_id: '',
        userInfo: null,
        loggedIn: false,
        gender: 'unknown'
      }
    }

    const token = stored.token || ''
    const user_id = stored.user_id || ''
    const userInfo = stored.userInfo || null
    return {
      token,
      user_id,
      userInfo,
      loggedIn: Boolean(token && user_id),
      gender: stored.gender || 'unknown'
    }
  },

  setAuthState(payload) {
    const nextState = {
      ...payload, // 兼容后续可能传入的其它字段
      token: payload.token || '',
      user_id: payload.user_id || payload._openid || '',
      userInfo: payload.userInfo || null,
      loggedIn: Boolean(payload.token || payload._openid || payload.user_id),
      isAdmin: payload.isAdmin || false,
      isBooster: payload.isBooster || false,
      isCSR: payload.isCSR || false,
      gender: payload.gender || 'unknown',
      _openid: payload._openid || ''
    };
    
    this.globalData.auth = nextState;
    wx.setStorageSync(AUTH_STORAGE_KEY, nextState);
    
    // 如果首页已经注册了回调函数，通知它刷新UI
    if (this.authCallback) {
      this.authCallback(nextState);
    }
    
    return nextState;
  },

  clearAuthState() {
    const emptyState = {
      token: '',
      user_id: '',
      userInfo: null,
      loggedIn: false
    }
    this.globalData.auth = emptyState
    wx.removeStorageSync(AUTH_STORAGE_KEY)
    return emptyState
  },

  getAuthState() {
    return this.globalData.auth || this.loadAuthState()
  },

  getToken() {
    const auth = this.getAuthState()
    return auth.token || ''
  },

  // 移除了 MinIO 依赖：云开发直接用 cloud:// 或者普通本地/网络路径
  buildAssetBaseUrl() {
    return ''
  },

  buildAssetUrl(fileName) {
    if (!fileName) return ''
    return '/images/games/' + fileName
  },

  getGameImageUrl(gameId) {
    const fileName = GAME_IMAGE_FILES[gameId] || ''
    return buildLocalGameImageUrl(fileName) || this.buildAssetUrl(fileName)
  }
})
