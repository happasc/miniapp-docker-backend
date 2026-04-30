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

    // 校验身份：只有接单的打手才能点结单
    if (order.boosterId !== OPENID) {
      return { success: false, message: '权限不足：您不是该单的打手' };
    }

    if (order.status !== 'processing') {
      return { success: false, message: '订单状态必须是服务中，才能结单' };
    }

    // 更新订单状态为 finished（待顾客结单）
    const result = await db.collection('orders').doc(event.orderId).update({
      data: {
        status: 'finished', 
        finishTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });

    if (result.stats.updated === 1) {
      return { success: true, message: '结单成功，等待顾客确认' };
    } else {
      return { success: false, message: '状态未更新' };
    }
  } catch(e) {
    console.error('结单出错：', e);
    return { success: false, message: '数据库操作出错' };
  }
}
