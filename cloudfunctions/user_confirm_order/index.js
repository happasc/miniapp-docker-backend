// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // API 调用都保持和云函数当前所在环境一致
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
    const orderResult = await db.collection('orders').doc(event.orderId).get();
    if (!orderResult.data) {
      return { success: false, message: '订单不存在' };
    }

    const order = orderResult.data;

    // 校验身份：只有下这笔单的顾客（最初的创建者 _openid）才能点确认完成
    if (order._openid !== OPENID) {
      return { success: false, message: '权限不足：您不是该单的主人' };
    }

    if (order.status !== 'finished') {
      return { success: false, message: '订单尚未在此节点（需打手先提交结单）' };
    }

    // ✨ 新增：计算打手实际收益（扣除12%平台抽成）
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
        boosterActualIncome: boosterActualIncome // 打手实际获得的收益
      }
    });

    if (result.stats.updated === 1) {
      // 在这里可以扩展打款给指导的逻辑，如调用商家转账到零钱等...
      // 打款金额应该是 boosterActualIncome（扣除12%后的金额）
      return { 
        success: true, 
        message: '订单已完成',
        boosterActualIncome: boosterActualIncome,
        commission: commission
      };
    } else {
      return { success: false, message: '状态未更新' };
    }
  } catch(e) {
    console.error('用户确认结账出错：', e);
    return { success: false, message: '数据库操作出错' };
  }
}