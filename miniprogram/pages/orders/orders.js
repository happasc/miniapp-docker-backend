const { getOrders, cancelOrder, refundOrder } = require('../../utils/order-store')

const ORDER_TABS = [
	{ id: 'all', label: '全部' },
	{ id: 'pendingAccept', label: '待接单' },
	{ id: 'inService', label: '服务中' },
	{ id: 'pendingSettle', label: '待结单' },
	{ id: 'completed', label: '已完成' },
	{ id: 'refundProcessing', label: '退款中' },
	{ id: 'refunded', label: '已退款' }
]

function getEmptyState(activeTab) {
	const textMap = {
		all: '您的所有订单会在这里汇总展示。',
		pendingAccept: '下单后的订单会显示在这里。',
		inService: '已接单但未完成的订单会显示在这里。',
		pendingSettle: '等待后台结单的订单会显示在这里。',
		completed: '已完成的订单会归档在这里。',
		refundProcessing: '正在处理退款的订单会显示在这里。',
		refunded: '已退款的订单会归档在这里。'
	}

	return textMap[activeTab] || '暂无订单'
}

Page({
	data: {
		authState: {},
		currentTab: 'placed', // 'placed' | 'received'
		tabs: ORDER_TABS,
		activeTab: 'all',
		activeTabLabel: '全部',
		orders: [],
		filteredOrders: [],
		emptyText: getEmptyState('all')
	},
	onLoad(options) {
		const app = getApp()
		const authState = app && typeof app.getAuthState === 'function' ? app.getAuthState() : (app.globalData.auth || { loggedIn: false })
		this.setData({ authState })
		
		if (!authState.loggedIn) {
			wx.showModal({
				title: '请先登录',
				content: '订单页面需要登录后访问，是否前往登录？',
				confirmText: '去登录',
				success: (res) => {
					if (res.confirm) {
						wx.reLaunch({ url: '/pages/index/index?tab=me' })
						return
					}
					wx.navigateBack({ delta: 1 })
				}
			})
			return
		}

		const activeTab = options.tab || 'all'
		const currentTab = ORDER_TABS.find((item) => item.id === activeTab) || ORDER_TABS[0]
		this.setData({
			activeTab: currentTab.id,
			activeTabLabel: currentTab.label
		})
	},
	onShow() {
		this.loadOrders()
	},
	async loadOrders() {
		const app = getApp()
		const authState = this.data.authState.loggedIn ? this.data.authState : (app && typeof app.getAuthState === 'function' ? app.getAuthState() : (app.globalData.auth || { loggedIn: false }))
		if (!authState.loggedIn) return

		const db = wx.cloud.database()
		try {
			wx.showLoading({ title: '加载中' })
			
			const openid = authState._openid || '{openid}'
			const queryCondition = this.data.currentTab === 'placed' 
				? { _openid: openid } 
				: { boosterId: openid }

			const res = await db.collection('orders').where(queryCondition).orderBy('createTime', 'desc').get()
			
			const orders = res.data.map(order => {
				let statusText = order.status
				let activeTabStatus = order.status
				let statusClass = 'status-pending'
				
				if (order.status === 'waiting_grab') {
					activeTabStatus = 'pendingAccept'
					statusText = '待接单'
					statusClass = 'status-pending'
				} else if (order.status === 'processing') {
					activeTabStatus = 'inService'
					statusText = '服务中'
					statusClass = 'status-service'
				} else if (order.status === 'finished') {
					activeTabStatus = 'pendingSettle'
					statusText = '已完成(待结单)'
					statusClass = 'status-finished'
				} else if (order.status === 'completed') {
					activeTabStatus = 'completed'
					statusText = '交易完成'
					statusClass = 'status-completed'
				} else if (order.status === 'pending_refund') {
					activeTabStatus = 'refundProcessing'
					statusText = '退款中'
					statusClass = 'status-refunding'
				} else if (order.status === 'refunded') {
					activeTabStatus = 'refunded'
					statusText = '已退款'
					statusClass = 'status-refunded'
				}

				return {
					...order,
					id: order._id,
					status: activeTabStatus,
					statusText,
					statusClass,
					createdAt: order.createTime ? `${order.createTime.getFullYear()}-${(order.createTime.getMonth() + 1).toString().padStart(2, '0')}-${order.createTime.getDate().toString().padStart(2, '0')} ${order.createTime.getHours().toString().padStart(2, '0')}:${order.createTime.getMinutes().toString().padStart(2, '0')}` : order.createdAt
				}
			})
			
			const filteredOrders = this.data.currentTab === 'placed' 
				? (this.data.activeTab === 'all' 
					? orders 
					: orders.filter((order) => order.status === this.data.activeTab))
				: orders
			
			this.setData({
				orders,
				filteredOrders,
				emptyText: this.data.currentTab === 'placed' ? getEmptyState(this.data.activeTab) : '您还没有抢到任何订单。'
			})
		} catch (err) {
			console.error('Failed to load orders', err)
			wx.showToast({ title: '加载失败', icon: 'none' })
		} finally {
			wx.hideLoading()
		}
	},
	handleTabChange(e) {
		const tab = e.currentTarget.dataset.tab
		if (!tab || tab === this.data.activeTab) return
		
		const filteredOrders = tab === 'all' 
			? this.data.orders 
			: this.data.orders.filter((order) => order.status === tab)
		
		const currentTab = ORDER_TABS.find((item) => item.id === tab) || ORDER_TABS[0]
		this.setData({
			activeTab: currentTab.id,
			activeTabLabel: currentTab.label,
			filteredOrders,
			emptyText: getEmptyState(currentTab.id)
		})
	},
	switchRoleTab(e) {
		const role = e.currentTarget.dataset.role
		if (!role || role === this.data.currentTab) return
		this.setData({
			currentTab: role,
			orders: [],
			filteredOrders: [],
			emptyText: '加载中...'
		})
		this.loadOrders()
	},
	handleCancelOrder(e) {
		const orderId = e.currentTarget.dataset.id
		if (!orderId) return

		wx.showModal({
			title: '取消订单',
			content: '取消后该订单会从待付款列表移除。',
			success: (res) => {
				if (!res.confirm) return
				cancelOrder(orderId)
				this.loadOrders()
				wx.showToast({ title: '订单已取消', icon: 'none' })
			}
		})
	},
	handlePayLater() {
		wx.showToast({ title: '能力已下线', icon: 'none' })
	},
	async handleRefund(e) {
		const { id } = e.currentTarget.dataset
		if (!id) return

		wx.showModal({
			title: '确认退款',
			content: '是否确认取消订单并退款？',
			success: async (res) => {
				if (res.confirm) {
					try {
						wx.showLoading({ title: '退款处理中' })
						const result = await wx.cloud.callFunction({
							name: 'refund_order',
							data: { orderId: id }
						})
						wx.hideLoading()

						if (result.result && result.result.success) {
							wx.showToast({ title: '退款成功', icon: 'success' })
							this.loadOrders()
						} else {
							wx.showToast({ 
								title: (result.result && result.result.message) || '退款失败', 
								icon: 'none' 
							})
						}
					} catch (err) {
						wx.hideLoading()
						wx.showToast({ title: '请求退款出错', icon: 'none' })
					}
				}
			}
		})
	},
	// 联系客服（打手联系顾客）
	handleContactCustomer(e) {
		const orderId = e.currentTarget.dataset.id
		const userId = e.currentTarget.dataset.userid
		const boosterId = e.currentTarget.dataset.boosterid // 打手openid
		if (!orderId) return

		// ✨ 修改：使用打手和顾客的openid组合生成固定的聊天室ID
		// 格式：chat_booster_openid_customer_openid（按字母排序确保唯一性）
		const participants = [boosterId, userId].sort()
		const roomId = `chat_${participants[0]}_${participants[1]}`
		
		wx.navigateTo({
			url: `/pages/messages/chat?roomId=${roomId}&targetId=${userId}&orderId=${orderId}`
		})
	},
	
	// 联系打手（顾客联系打手）
	handleContactBooster(e) {
		const orderId = e.currentTarget.dataset.id
		const boosterId = e.currentTarget.dataset.userid
		const customerId = e.currentTarget.dataset.customerid // 顾客openid
		if (!orderId) return

		// ✨ 修改：使用打手和顾客的openid组合生成固定的聊天室ID
		const participants = [boosterId, customerId].sort()
		const roomId = `chat_${participants[0]}_${participants[1]}`
		
		wx.navigateTo({
			url: `/pages/messages/chat?roomId=${roomId}&targetId=${boosterId}&orderId=${orderId}`
		})
	},
	
	// ✨ 新增：联系客服（CSR）功能
	handleContactCSR() {
		const authState = this.data.authState
		const openid = authState._openid || authState.user_id
		
		if (!openid) {
			wx.showToast({ title: '请先登录', icon: 'none' })
			return
		}
		
		// 生成专属客服房间ID
		const csrRoomId = `cs_${openid}`
		
		wx.navigateTo({
			url: `/pages/messages/chat?roomId=${csrRoomId}&targetId=SYSTEM_CSR`
		})
	},
	
	//  修改：申请退款功能（更新订单状态为退款中并联系客服处理）
	handleRequestRefund(e) {
		const { id, order } = e.currentTarget.dataset
		if (!id || !order) {
			wx.showToast({ title: '订单信息错误', icon: 'none' })
			return
		}
		
		// 弹出确认对话框
		wx.showModal({
			title: '申请退款',
			content: '申请后订单将进入退款审核状态，客服将与您联系处理退款事宜。',
			confirmText: '申请退款',
			confirmColor: '#e64340',
			success: async (res) => {
				if (res.confirm) {
					try {
						wx.showLoading({ title: '申请中', mask: true })
						
						const db = wx.cloud.database()
						
						// 1. 更新订单状态为"pending_refund"
						await db.collection('orders').doc(id).update({
							data: {
								status: 'pending_refund',
								refundApplyTime: db.serverDate()
							}
						})
						
						const authState = this.data.authState
						const openid = authState._openid || authState.user_id
						
						if (!openid) {
							wx.hideLoading()
							wx.showToast({ title: '请先登录', icon: 'none' })
							return
						}
						
						// 2. 生成退款申请房间ID（带时间戳确保唯一性）
						const refundRoomId = `csr_${openid}_${Date.now()}`
						
						// 3. 创建退款申请消息
						await db.collection('chat_messages').add({
							data: {
								roomId: refundRoomId,
								senderId: openid,
								targetId: 'SYSTEM_CSR',
								msgType: 'refund_request',
								text: `申请退款 - 订单号：${order.orderNo}`,
								refundInfo: {
									orderId: order.id,
									orderNo: order.orderNo,
									amount: order.amount,
									reason: '用户主动申请退款',
									status: 'pending' // 待客服处理
								},
								createTime: db.serverDate()
							}
						})
						
						// 4. 创建客服会话房间
						await db.collection('chat_rooms').add({
							data: {
								roomId: refundRoomId,
								userOpenId: openid,
								targetId: 'SYSTEM_CSR',
								lastMessage: `申请退款 - 订单号：${order.orderNo}`,
								lastUpdateTime: db.serverDate(),
								users: {
									[openid]: {
										nickName: authState.nickName || '用户',
										avatarUrl: authState.avatarUrl || ''
									},
									SYSTEM_CSR: {
										nickName: '专属客服',
										avatarUrl: ''
									}
								}
							}
						})
						
						wx.hideLoading()
						wx.showToast({ title: '退款申请已提交', icon: 'success' })
						
						// 5. 刷新订单列表
						this.loadOrders()
						
						// 6. 跳转到客服聊天页面
						setTimeout(() => {
							wx.navigateTo({
								url: `/pages/messages/chat?roomId=${refundRoomId}&targetId=SYSTEM_CSR`
							})
						}, 1500)
						
					} catch (err) {
						wx.hideLoading()
						console.error('创建退款申请失败', err)
						wx.showToast({ title: '申请失败，请重试', icon: 'none' })
					}
				}
			}
		})
	},
	
	async handleBoosterFinish(e) {
		const orderId = e.currentTarget.dataset.id
		if (!orderId) return
		wx.showModal({
			title: '提交结单',
			content: '提交后会通知用户进行确认，是否确认服务已完成？',
			success: async (res) => {
				if (res.confirm) {
					wx.showLoading({ title: '提交中', mask: true })
					try {
						const callRes = await wx.cloud.callFunction({
							name: 'booster_finish_order',
							data: { orderId }
						})

						const result = callRes.result
						wx.hideLoading()
						
						if (result && result.success) {
							wx.showToast({ title: '已提醒用户结单', icon: 'none' })
							this.loadOrders()
						} else {
							wx.showToast({ title: result.message || '提交失败', icon: 'none' })
						}
					} catch (err) {
						wx.hideLoading()
						wx.showToast({ title: '提交失败，请重试', icon: 'none' })
						console.error('结单出错', err)
					}
				}
			}
		})
	},
	async handleUserConfirm(e) {
		const orderId = e.currentTarget.dataset.id
		if (!orderId) return
		wx.showModal({
			title: '订单确认',
			content: '确认后订单将完成并打款给指导/单单，不可撤销，确定完成吗？',
			success: async (res) => {
				if (res.confirm) {
					wx.showLoading({ title: '确认中', mask: true })
					try {
						const callRes = await wx.cloud.callFunction({
							name: 'user_confirm_order',
							data: { orderId }
						})
						
						const result = callRes.result
						wx.hideLoading()

						if (result && result.success) {
							wx.showToast({ title: '订单已完成' })
							this.loadOrders()
						} else {
							wx.showToast({ title: result.message || '确认失败', icon: 'none' })
						}
					} catch (err) {
						wx.hideLoading()
						wx.showToast({ title: '网络异常，请重试', icon: 'none' })
						console.error('确认失败', err)
					}
				}
			}
		})
	}
})