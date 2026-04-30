// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID

  if (!event.orderId) {
    return { success: false, message: '缺少参数 orderId' }
  }

  try {
    // 获取订单信息
    const orderResult = await db.collection('orders').doc(event.orderId).get()
    if (!orderResult.data) {
      return { success: false, message: '订单不存在' }
    }

    const order = orderResult.data

    // 校验订单状态：必须是 finished（打手已提交结单）
    if (order.status !== 'finished') {
      return { success: false, message: '订单尚未完成（需打手先提交结单）' }
    }

    // ✨ 计算打手实际收益（扣除12%平台抽成）
    const originalAmount = order.amount || 0
    const commissionRate = 0.12 // 12%平台抽成
    const commission = originalAmount * commissionRate
    const boosterActualIncome = originalAmount - commission

    // 更新订单状态为 completed（彻底完成）
    const result = await db.collection('orders').doc(event.orderId).update({
      data: {
        status: 'completed',
        completeTime: db.serverDate(),
        updateTime: db.serverDate(),
        // ✨ 新增字段：记录抽成和打手实际收益
        commission: commission, // 平台抽成金额
        commissionRate: commissionRate, // 抽成比例
        boosterActualIncome: boosterActualIncome, // 打手实际获得的收益
        confirmedBy: OPENID, // 记录确认完成的操作者（客服/管理员）
        confirmedByRole: 'admin_or_csr' // 标识为管理员或客服确认
      }
    })

    if (result.stats.updated === 1) {
      return {
        success: true,
        message: '订单已完成',
        boosterActualIncome: boosterActualIncome,
        commission: commission
      }
    } else {
      return { success: false, message: '状态未更新' }
    }
  } catch (e) {
    console.error('客服确认结账出错：', e)
    return { success: false, message: '数据库操作出错' }
  }
}
