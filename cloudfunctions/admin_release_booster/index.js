// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 1. 验证管理员权限
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    const user = userRes.data[0]
    if (!user.isAdmin && !user.isCSR) {
      return {
        success: false,
        message: '无权限操作，仅限管理员或客服'
      }
    }

    // 2. 获取订单ID
    const orderId = event.orderId
    if (!orderId) {
      return {
        success: false,
        message: '订单ID不能为空'
      }
    }

    // 3. 查询订单当前状态
    const orderRes = await db.collection('orders').doc(orderId).get()
    if (!orderRes.data) {
      return {
        success: false,
        message: '订单不存在'
      }
    }

    const currentStatus = orderRes.data.status
    console.log('订单当前状态:', currentStatus)

    // 4. 验证订单状态（只能解除 processing 或 finished 状态的订单）
    if (currentStatus !== 'processing' && currentStatus !== 'finished') {
      return {
        success: false,
        message: `订单状态已变更（当前：${currentStatus}），无法解除`
      }
    }

    // 5. 更新订单状态为 waiting_grab
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'waiting_grab',
        boosterId: '',      // 清除绑定的打手ID
        boosterName: '',    // 清除打手昵称
        boosterGameId: '',  // 清除打手游戏ID
        updateTime: db.serverDate()
      }
    })

    console.log('订单解除成功，orderId:', orderId)

    return {
      success: true,
      message: '解除接单成功',
      orderId: orderId
    }

  } catch (err) {
    console.error('解除接单失败', err)
    return {
      success: false,
      message: err.message || '系统错误，请重试'
    }
  }
}
