// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const { orderId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!orderId) {
    return { success: false, message: '缺少订单ID参数' }
  }

  const db = cloud.database()

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data

    // 假设通过某种机制验证管理员身份（此处预留 isAdmin 逻辑）
    const isAdmin = false 

    // 验证退款权限和状态
    if (order._openid !== openid && !isAdmin) {
      return { success: false, message: '无权操作退款' }
    }

    if (order.status !== 'pending' && order.status !== 'waiting_grab') {
      return { success: false, message: '当前订单状态不允许退款' }
    }

    // 调用微信官方云支付退款接口原路退回金额
    const outTradeNo = order.orderNo
    const outRefundNo = 'ref_' + order.orderNo + '_' + Date.now()
    
    // 强制校验支付金额，如果订单没有金额记录直接阻断，防止直接把免费/测试单标为已退款
    const totalFee = Math.round(Number(order.amount || 0) * 100)
    if (totalFee <= 0) {
      return { success: false, message: '未检测到有效支付金额，无法执行微信退款' }
    }
    
    // 【重要修复】：如果你的云环境由于某些原因没有自动绑定默认商户，可以在此写死你的子商户号
    // 例如：sub_mch_id: '1900000109'，这里如果没有配置则依赖微信云开发控制台关联配置
    const refundArgs = {
      out_trade_no: outTradeNo,
      out_refund_no: outRefundNo,
      total_fee: totalFee,
      refund_fee: totalFee,
      env_id: cloud.getWXContext().ENV,
      sub_mch_id: process.env.SUB_MCH_ID || 'YOUR_MERCHANT_ID',
      nonce_str: '' + Date.now() // 添加随机字符串以防部分兼容问题
    }

    const refundRes = await cloud.cloudPay.refund(refundArgs)

    // 严格检查微信退款官方接口的返回结果
    if (refundRes.returnCode !== 'SUCCESS' || refundRes.resultCode !== 'SUCCESS') {
      return { 
        success: false, 
        message: refundRes.errCodeDes || refundRes.returnMsg || '微信退款被拒绝或失败' 
      }
    }

    // 只有在微信退款接口明确返回全SUCCESS时，才更新数据库状态
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'refunded',
        refundTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
    
    // ✨ 新增：退款成功后，自动创建客服会话并发送通知
    const csrRoomId = `csr_${openid}_${Date.now()}`
    const userInfo = order.userInfo || { nickName: '用户', avatarUrl: '' }
    
    // 1. 创建客服聊天房间
    await db.collection('chat_rooms').add({
      data: {
        _id: csrRoomId,
        roomId: csrRoomId,
        targetId: 'SYSTEM_CSR', // 标记为系统客服
        userOpenId: openid,
        customerId: openid,
        lastMessage: `订单 ${order.orderNo} 退款申请`,
        lastUpdateTime: db.serverDate(),
        users: {
          [openid]: {
            nickName: userInfo.nickName || '用户',
            avatarUrl: userInfo.avatarUrl || ''
          },
          SYSTEM_CSR: {
            nickName: '专属客服',
            avatarUrl: ''
          }
        }
      }
    })
    
    // 2. 发送退款申请消息到客服房间
    await db.collection('chat_messages').add({
      data: {
        roomId: csrRoomId,
        senderId: openid,
        targetId: 'SYSTEM_CSR',
        text: `我申请退款订单 ${order.orderNo}，请处理`,
        msgType: 'refund_request', // 标记为退款请求类型
        refundInfo: {
          orderId: orderId,
          orderNo: order.orderNo,
          amount: order.amount,
          reason: '用户主动申请退款'
        },
        createTime: db.serverDate()
      }
    })
    
    return {
      success: true,
      message: '退款成功，资金已原路返回',
      csrRoomId: csrRoomId // 返回客服房间ID，前端可引导用户跳转
    }
  } catch (err) {
    // 捕获异常
    return {
      success: false,
      message: err.message || '退款处理出现异常'
    }
  }
}