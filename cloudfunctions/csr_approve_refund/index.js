// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const { orderId, messageId, action } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!orderId) {
    return { success: false, message: '缺少订单ID参数' }
  }

  const db = cloud.database()

  try {
    // 1. 验证客服权限
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    if (!userRes.data || userRes.data.length === 0 || !userRes.data[0].isCSR) {
      return { success: false, message: '无权操作，仅客服可审批退款' }
    }

    // 2. 获取订单信息
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data

    if (!order) {
      return { success: false, message: '订单不存在' }
    }

    // 3. 处理拒绝退款
    if (action === 'reject') {
      // 更新退款消息状态
      if (messageId) {
        await db.collection('chat_messages').doc(messageId).update({
          data: {
            'refundInfo.status': 'rejected',
            'refundInfo.rejectedBy': openid,
            'refundInfo.rejectedTime': db.serverDate()
          }
        })
      }

      // 在聊天中发送系统通知消息
      if (event.roomId) {
        await db.collection('chat_messages').add({
          data: {
            roomId: event.roomId,
            senderId: 'SYSTEM',
            targetId: order._openid || '',
            text: '客服已拒绝退款申请，订单将继续进行。',
            msgType: 'system',
            nickName: '系统',
            avatarUrl: '',
            createTime: db.serverDate()
          }
        })
      }

      return {
        success: true,
        message: '已拒绝退款'
      }
    }

    // 4. 处理拒绝退款
    if (action === 'reject') {
      // 更新退款消息状态
      if (messageId) {
        await db.collection('chat_messages').doc(messageId).update({
          data: {
            'refundInfo.status': 'rejected',
            'refundInfo.rejectedBy': openid,
            'refundInfo.rejectedTime': db.serverDate()
          }
        })
      }

      // 在聊天中发送系统通知消息
      if (event.roomId) {
        await db.collection('chat_messages').add({
          data: {
            roomId: event.roomId,
            senderId: 'SYSTEM',
            targetId: order._openid || '',
            text: '客服已拒绝退款申请，订单将继续进行。',
            msgType: 'system',
            nickName: '系统',
            avatarUrl: '',
            createTime: db.serverDate()
          }
        })
      }

      return {
        success: true,
        message: '已拒绝退款'
      }
    }

    // 5. 处理同意退款
    // 客服审批退款不受订单状态限制，可以处理任何状态的订单
    
    // 检查是否已经退款
    if (order.status === 'refunded') {
      return { success: false, message: '订单已退款' }
    }

    // 6. 调用微信官方云支付退款接口
    const outTradeNo = order.orderNo
    const outRefundNo = 'csr_ref_' + order.orderNo + '_' + Date.now()
    
    const totalFee = Math.round(Number(order.amount || 0) * 100)
    
    // ✨ 测试环境兼容：如果金额很小（<=0），跳过微信退款直接更新状态
    if (totalFee <= 0) {
      console.warn('测试环境：订单金额为0，跳过微信退款，直接更新状态')
      
      // 直接更新订单状态
      await db.collection('orders').doc(orderId).update({
        data: {
          status: 'refunded',
          refundTime: db.serverDate(),
          refundBy: openid,
          refundType: 'csr_approved',
          updateTime: db.serverDate()
        }
      })
    } else {
      // 正式环境：调用微信退款
      const refundArgs = {
        out_trade_no: outTradeNo,
        out_refund_no: outRefundNo,
        total_fee: totalFee,
        refund_fee: totalFee,
        env_id: cloud.getWXContext().ENV,
        sub_mch_id: process.env.SUB_MCH_ID || 'YOUR_MERCHANT_ID_HERE',
        nonce_str: '' + Date.now()
      }

      const refundRes = await cloud.cloudPay.refund(refundArgs)

      // 检查微信退款结果
      if (refundRes.returnCode !== 'SUCCESS' || refundRes.resultCode !== 'SUCCESS') {
        return { 
          success: false, 
          message: refundRes.errCodeDes || refundRes.returnMsg || '微信退款被拒绝或失败' 
        }
      }

      // 更新订单状态
      await db.collection('orders').doc(orderId).update({
        data: {
          status: 'refunded',
          refundTime: db.serverDate(),
          refundBy: openid,
          refundType: 'csr_approved',
          updateTime: db.serverDate()
        }
      })
    }

    // 7. 更新退款消息状态
    if (messageId) {
      await db.collection('chat_messages').doc(messageId).update({
        data: {
          'refundInfo.status': 'approved',
          'refundInfo.approvedBy': openid,
          'refundInfo.approvedTime': db.serverDate()
        }
      })
    }

    // 8. 在聊天中发送系统通知消息
    if (event.roomId) {
      await db.collection('chat_messages').add({
        data: {
          roomId: event.roomId,
          senderId: 'SYSTEM',
          targetId: order._openid || '',
          text: '客服已同意退款，资金将原路返回至您的支付账户，预计1-3个工作日到账。',
          msgType: 'system',
          nickName: '系统',
          avatarUrl: '',
          createTime: db.serverDate()
        }
      })
    }

    return {
      success: true,
      message: action === 'reject' ? '已拒绝退款' : '退款成功，资金已原路返回',
      refundNo: outRefundNo
    }
  } catch (err) {
    console.error('客服审批退款失败', err)
    return {
      success: false,
      message: err.message || '退款处理出现异常'
    }
  }
}
