// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const { roomId, messageId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!roomId || !messageId) {
    return { success: false, message: '缺少必要参数' }
  }

  const db = cloud.database()
  const _ = db.command

  try {
    // 1. 验证客服权限
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    if (!userRes.data || userRes.data.length === 0 || !userRes.data[0].isCSR) {
      return { success: false, message: '无权操作，仅客服可确认结算' }
    }

    // 2. 获取当前消息信息（用于获取打手ID）
    const currentMsgRes = await db.collection('chat_messages').doc(messageId).get()
    if (!currentMsgRes.data) {
      return { success: false, message: '消息不存在' }
    }

    const currentMsg = currentMsgRes.data
    const boosterId = currentMsg.senderId
    const latestAmount = currentMsg.settlementInfo?.amount

    if (!boosterId) {
      return { success: false, message: '无法获取打手ID' }
    }

    if (latestAmount === undefined || latestAmount === null) {
      return { success: false, message: '结算金额缺失' }
    }

    // 3. 查询该打手在该聊天室的所有未确认结算请求，按时间倒序
    const pendingRequestsRes = await db.collection('chat_messages')
      .where({
        roomId: roomId,
        senderId: boosterId,
        msgType: 'settlement_request',
        'settlementInfo.status': 'pending'
      })
      .orderBy('sendTime', 'desc')
      .get()

    if (!pendingRequestsRes.data || pendingRequestsRes.data.length === 0) {
      return { success: false, message: '没有待确认的结算请求' }
    }

    const pendingRequests = pendingRequestsRes.data
    console.log(`找到 ${pendingRequests.length} 条待确认的结算请求`)

    // 4. 批量处理所有请求
    const updatePromises = []
    const confirmedMessageIds = []

    pendingRequests.forEach((msg, index) => {
      if (index === 0) {
        // 最新的一条：标记为已确认
        updatePromises.push(
          db.collection('chat_messages').doc(msg._id).update({
            data: {
              'settlementInfo.status': 'confirmed',
              'settlementInfo.confirmTime': db.serverDate(),
              'settlementInfo.confirmedAmount': latestAmount
            }
          })
        )
        confirmedMessageIds.push(msg._id)
      } else {
        // 旧的请求：标记为已作废
        updatePromises.push(
          db.collection('chat_messages').doc(msg._id).update({
            data: {
              'settlementInfo.status': 'cancelled',
              'settlementInfo.cancelReason': '被更新的结算请求替代',
              'settlementInfo.cancelTime': db.serverDate()
            }
          })
        )
      }
    })

    // 5. 执行批量更新
    await Promise.all(updatePromises)
    console.log('批量更新完成')

    // 6. 创建 settlement_records 记录
    await db.collection('settlement_records').add({
      data: {
        boosterId: boosterId,
        amount: parseFloat(latestAmount),
        settleDate: new Date(),
        confirmTime: db.serverDate(),
        status: 'confirmed',
        createTime: db.serverDate(),
        roomId: roomId,
        messageIds: confirmedMessageIds,
        confirmedBy: openid
      }
    })
    console.log('结算记录创建成功')

    // 7. 清零打手今日收益
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    await db.collection('orders').where({
      boosterId: boosterId,
      status: 'completed',
      updateTime: _.gte(startOfToday)
    }).update({
      data: {
        settlementStatus: 'settled',
        settleTime: db.serverDate()
      }
    })
    console.log('今日收益已清零')

    // 8. 在聊天中发送系统通知消息
    await db.collection('chat_messages').add({
      data: {
        roomId: roomId,
        senderId: 'SYSTEM',
        targetId: boosterId,
        text: `已确认打款 ¥${latestAmount}，共处理 ${pendingRequests.length} 条结算请求（${confirmedMessageIds.length} 条确认，${pendingRequests.length - confirmedMessageIds.length} 条作废），打手今日收益已清零。`,
        msgType: 'system',
        nickName: '系统',
        avatarUrl: '',
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: '结算确认成功',
      processedCount: pendingRequests.length,
      confirmedCount: confirmedMessageIds.length,
      cancelledCount: pendingRequests.length - confirmedMessageIds.length,
      amount: latestAmount
    }
  } catch (err) {
    console.error('客服确认结算失败', err)
    return {
      success: false,
      message: err.message || '结算处理出现异常'
    }
  }
}
