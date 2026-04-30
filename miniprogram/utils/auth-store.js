const AUTH_STORAGE_KEY = 'gaphunt-auth-state'

function getAuthState() {
  const stored = wx.getStorageSync(AUTH_STORAGE_KEY)
  if (!stored || typeof stored !== 'object') {
    return {
      token: '',
      user_id: '',
      userInfo: null,
      loggedIn: false,
      isAdmin: false,
      isBooster: false,
      isCSR: false
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
    isAdmin: stored.isAdmin === true,
    isBooster: stored.isBooster === true,
    isCSR: stored.isCSR === true
  }
}

function saveAuthState(payload) {
  const nextState = {
    token: payload.token || '',
    user_id: payload.user_id || '',
    userInfo: payload.userInfo || null,
    loggedIn: Boolean(payload.token && payload.user_id),
    isAdmin: payload.isAdmin === true,
    isBooster: payload.isBooster === true,
    isCSR: payload.isCSR === true
  }
  wx.setStorageSync(AUTH_STORAGE_KEY, nextState)
  return nextState
}

function clearAuthState() {
  wx.removeStorageSync(AUTH_STORAGE_KEY)
}

function isLoggedIn() {
  const state = getAuthState()
  return state.loggedIn
}

module.exports = {
  getAuthState,
  saveAuthState,
  clearAuthState,
  isLoggedIn
}
