// 所有接口调用已迁移至微信云函数，该文件旧本地请求接口弃用。

function wechatLogin() {
  return Promise.resolve()
}

function fetchMeProfile() {
  return Promise.resolve()
}

function logout() {
  const app = getApp()
  if (app && typeof app.clearAuthState === 'function') {
    app.clearAuthState()
  }
}

module.exports = {
  wechatLogin,
  fetchMeProfile,
  logout
}
