// 删除了本地 request 和本地 wx.setStorageSync
function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = padNumber(date.getMonth() + 1)
  const day = padNumber(date.getDate())
  const hours = padNumber(date.getHours())
  const minutes = padNumber(date.getMinutes())
  return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes
}

function generateOrderNo(date) {
  const datePart = [
    date.getFullYear(),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate()),
    padNumber(date.getHours()),
    padNumber(date.getMinutes()),
    padNumber(date.getSeconds())
  ].join('')
  const randomPart = Math.floor(Math.random() * 900 + 100)
  return 'GH' + datePart + randomPart
}

// 废弃本地读写
function getOrders() {
  return [] // 或者改为从云端拉取 db.collection('orders').where(...).get()
}

function cancelOrder(orderId) {
  // 废弃
}

function createPendingOrder(payload) {
  const now = new Date()
  return {
    id: String(now.getTime()),
    orderNo: generateOrderNo(now),
    createdAt: formatDate(now),
    status: 'pendingPayment',
    statusText: '待付款',
    serviceId: payload.serviceId || 'tech_carry',
    serviceName: payload.serviceName || '技术指导',
    gameId: payload.gameId || 'valorant',
    gameName: payload.gameName || '无畏契约',
    amount: payload.totalAmount || payload.amount || 25,
    sectionTitle: payload.sectionTitle,
    optionLabel: payload.optionLabel,
    priceLines: payload.priceLines || [],
    extra: payload.extra || '',
    title: payload.gameName + payload.serviceName,
    summary: payload.sectionTitle + ' · ' + payload.optionLabel,
    priceSummary: (payload.priceLines || []).join(' / '),
    requiredGender: payload.requiredGender || 'any'
  }
}

async function payOrder(order) {
  wx.showLoading({ title: '确认订单中...', mask: true })
  
  try {
    // 获取全局 app 实例读取其内部包含更全面字段的用户状态
    const app = getApp()
    const authState = app.getAuthState ? app.getAuthState() : {}
    const isAdmin = authState.isAdmin === true

    if (isAdmin) {
      // 管理员特权：直接写入云数据库并略过支付
      const db = wx.cloud.database()
      await db.collection('orders').add({
        data: {
          gameId: order.gameId,
          gameName: order.gameName,
          serviceId: order.serviceId,
          serviceName: order.serviceName,
          amount: order.amount,
          status: 'waiting_grab',
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          orderNo: order.orderNo,
          title: order.title,
          summary: order.summary,
          extra: order.extra,
          requiredGender: order.requiredGender,
          isAdminFree: true // 可选：标记为管理员免单
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '管理员免单成功' })
      return order
    }

    // 普通用户走真实支付流程
    wx.showLoading({ title: '安全支付中...', mask: true })
    const amountInFen = Math.floor(order.amount * 100)

    const res = await wx.cloud.callFunction({
      name: 'create_pay_order',
      data: {
        body: order.title + ' - ' + order.summary,
        outTradeNo: order.orderNo,
        totalFee: amountInFen
      }
    })

    const { result } = res
    if (!result || !result.success || !result.payment) {
      throw new Error('获取支付参数失败：' + JSON.stringify(result && result.error || ''))
    }

    const payment = result.payment

    // 2. 客户端拉起微信收银台
    await new Promise((resolve, reject) => {
      wx.requestPayment({
        ...payment,
        success(payRes) {
          resolve(payRes)
        },
        fail(err) {
          reject(err)
        }
      })
    })

    // 3. 支付成功后落库，状态设为 waiting_grab 供大厅读取
    const db = wx.cloud.database()
    await db.collection('orders').add({
      data: {
        gameId: order.gameId,
        gameName: order.gameName,
        serviceId: order.serviceId,
        serviceName: order.serviceName,
        amount: order.amount,
        status: 'waiting_grab',
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        
        // 保留业务数据
        orderNo: order.orderNo,
        title: order.title,
        summary: order.summary,
        extra: order.extra,
        requiredGender: order.requiredGender
      }
    })

    wx.hideLoading()
    wx.showToast({ title: '支付成功' })
    return order
  } catch (err) {
    wx.hideLoading()
    console.error('支付失败：', err)
    
    // 如果是用户主动取消支付（requestPayment 抛出的）
    if (err && err.errMsg && err.errMsg.indexOf('cancel') > -1) {
      throw new Error('支付已取消')
    }
    
    throw err
  }
}

async function refundOrder(orderId, orderNo, amount) {
  wx.showLoading({ title: '处理退款中', mask: true })
  
  try {
    const amountInFen = Math.floor(amount * 100)
    // 根据微信退款要求，退款单号需要唯一
    const refundNo = orderNo + '_R_' + new Date().getTime()
    
    // 如果退款金额为0（例如纯内测），直接改状态
    if (amountInFen === 0) {
      const db = wx.cloud.database()
      await db.collection('orders').doc(orderId).update({
        data: {
          status: 'refunded',
          updateTime: db.serverDate()
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '退款成功' })
      return true
    }

    // 调用云函数退款
    const res = await wx.cloud.callFunction({
      name: 'refund_order',
      data: {
        outTradeNo: orderNo,
        outRefundNo: refundNo,
        totalFee: amountInFen,
        refundFee: amountInFen
      }
    })

    const { result } = res
    // 退款成功
    if (result && result.success) {
      wx.hideLoading()
      wx.showToast({ title: '退款发起成功' })
      return true
    } else {
      throw new Error(result.error || '退款调用失败')
    }
  } catch (err) {
    wx.hideLoading()
    wx.showModal({ title: '退款失败', content: err.message || JSON.stringify(err), showCancel: false })
    throw err
  }
}

module.exports = {
  getOrders,
  createPendingOrder,
  cancelOrder,
  payOrder,
  refundOrder
}