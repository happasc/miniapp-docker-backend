function shouldUseAuth(options) {
  if (typeof options.auth === 'boolean') return options.auth
  return true
}

function navigateToLogin() {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const currentRoute = current && typeof current.route === 'string' ? current.route : ''
  if (currentRoute === 'pages/index/index') {
    current.setData({ currentTab: 'me' })
    return
  }
  wx.reLaunch({ url: '/pages/index/index?tab=me' })
}

function handleUnauthorized() {
  const app = getApp()
  if (app && typeof app.clearAuthState === 'function') {
    app.clearAuthState()
  }
  wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' })
  navigateToLogin()
}

function request(options) {
  const app = getApp()
  const baseUrl = app.globalData.apiBaseUrl
  const headers = Object.assign({}, options.header || {})

  if (shouldUseAuth(options)) {
    const token = app && typeof app.getToken === 'function' ? app.getToken() : ''
    if (token) {
      headers.Authorization = 'Bearer ' + token
    }
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: headers,
      success(res) {
        const body = res.data || {}
        const code = Number(body.code)

        if (code === 0) {
          resolve(body.data)
          return
        }

        if (code === 40101 || code === 40102) {
          handleUnauthorized()
        }

        reject({
          code: body.code,
          message: body.message || '请求失败',
          raw: res
        })
      },
      fail(err) {
        const errMsg = (err && err.errMsg) ? err.errMsg : '网络异常，请稍后重试'
        reject({
          code: -1,
          message: errMsg,
          raw: err
        })
      }
    })
  })
}

module.exports = {
  request
}
