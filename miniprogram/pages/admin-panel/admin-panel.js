// pages/admin-panel/admin-panel.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    stats: {
      waiting: 0,
      processing: 0,
      total: 0
    },
    currentTab: 'waiting',
    orders: [],
    loading: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.checkPermission();
    // ✨ 初始化时加载数据
    this.loadDashboardData();
    this.loadOrders();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // ✨ 修改：允许管理员和客服访问
    const auth = app.globalData.auth;
    if (auth && (auth.isAdmin || auth.isCSR)) {
      // ✨ 修复：onShow 只刷新数据，不改变 currentTab
      // 这样用户手动切换的选项卡不会被覆盖
      this.loadDashboardData();
      this.loadOrders();
    }
  },

  // 1. 权限拦截
  checkPermission() {
    const auth = app.globalData.auth;
    // ✨ 修改：允许管理员和客服访问
    if (!auth || (!auth.isAdmin && !auth.isCSR)) {
      wx.showModal({
        title: '无权限访问',
        content: '您不是平台管理员或客服，无法访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack({
            delta: 1,
            fail: () => {
              wx.switchTab({ url: '/pages/index/index' });
            }
          });
        }
      });
      return false;
    }
    return true;
  },

  // 2. 顶部数据看板查询
  async loadDashboardData() {
    try {
      const dbCollection = db.collection('orders');
      
      const [waitingRes, processingRes, totalRes] = await Promise.all([
        dbCollection.where({ status: 'waiting_grab' }).count(),
        dbCollection.where({ status: 'processing' }).count(),
        dbCollection.count()
      ]);

      this.setData({
        'stats.waiting': waitingRes.total,
        'stats.processing': processingRes.total,
        'stats.total': totalRes.total
      });
    } catch (err) {
      console.error('获取统计数据失败', err);
      // 可以不阻断页面，静默失败或轻度提示
    }
  },

  // 3. 选项卡与工单列表拉取
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.currentTab === tab) return;

    this.setData({
      currentTab: tab,
      orders: [],
      loading: true
    }, () => {
      this.loadOrders();
    });
  },

  async loadOrders() {
    if (!this.checkPermission()) return;
    
    console.log('loadOrders 被调用，当前选项卡:', this.data.currentTab);
    wx.showLoading({ title: '加载中' });
    this.setData({ loading: true });

    try {
      let queryCondition = {};
      
      // ✨ 修改：进行中选项卡同时显示 processing 和 finished 状态的订单
      if (this.data.currentTab === 'waiting') {
        queryCondition = { status: 'waiting_grab' };
        console.log('查询条件: waiting_grab');
      } else if (this.data.currentTab === 'processing') {
        // 使用 db.command.or 查询多个状态
        queryCondition = {
          status: _.or(['processing', 'finished'])
        };
        console.log('查询条件: processing OR finished');
      } else if (this.data.currentTab === 'completed') {
        queryCondition = { status: 'completed' };
        console.log('查询条件: completed');
      }

      console.log('执行数据库查询...');
      const res = await db.collection('orders')
        .where(queryCondition)
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();

      console.log('查询结果数量:', res.data.length);

      // 格式化时间
      const formattedOrders = res.data.map(order => ({
        ...order,
        createTimeFmt: this.formatTime(new Date(order.createTime))
      }));

      console.log('设置订单数据...');
      this.setData({
        orders: formattedOrders,
        loading: false
      });
      console.log('订单数据设置完成，当前订单数:', this.data.orders.length);
    } catch (err) {
      console.error('拉取工单失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    } finally {
      wx.hideLoading();
    }
  },

  // 格式化时间工具
  formatTime(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  // 5. 强制撤单兜底
  cancelOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认撤单',
      content: '强制撤单将结束此工单，确定要执行吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' });
          try {
             // 云开发更新
             await db.collection('orders').doc(orderId).update({
               data: {
                 status: 'cancelled',
                 updateTime: db.serverDate()
               }
             });
             
             wx.showToast({ title: '撤单成功', icon: 'success' });
             
             // 刷新数据
             this.loadDashboardData();
             this.loadOrders();
             
          } catch (err) {
            console.error('撤单失败', err);
            wx.showToast({ title: '撤单失败，请重试', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 6. 解除指导接单（将订单从processing状态恢复到waiting_grab状态）
  releaseBooster(e) {
    console.log('=== releaseBooster 函数被调用 ===');
    
    const orderId = e.currentTarget.dataset.id;
    console.log('获取到的 orderId:', orderId);
    
    if (!orderId) {
      wx.showToast({ title: '订单ID不存在', icon: 'none' });
      return;
    }
    
    wx.showModal({
      title: '确认解除接单',
      content: '此操作将把订单从"服务中"状态恢复为"待派发"状态，原打手将被解除绑定，订单将重新进入抢单池。确定要执行吗？',
      confirmColor: '#ff6b35',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中', mask: true });
          try {
            // ✨ 使用云函数执行解除接单，绕过前端数据库权限限制
            console.log('调用云函数解除接单...');
            const result = await wx.cloud.callFunction({
              name: 'admin_release_booster',
              data: {
                orderId: orderId
              }
            });
            
            console.log('云函数返回结果:', result);
            
            wx.hideLoading();
            
            if (result.result && result.result.success) {
              wx.showToast({ title: '解除接单成功', icon: 'success' });
              
              // ✨ 切换到"待派发"选项卡
              this.setData({
                currentTab: 'waiting',
                orders: [],
                loading: true
              }, () => {
                this.loadOrders();
                this.loadDashboardData();
              });
            } else {
              wx.showToast({ 
                title: result.result.message || '解除接单失败', 
                icon: 'none',
                duration: 3000
              });
            }
            
          } catch (err) {
            console.error('解除接单失败', err);
            wx.hideLoading();
            wx.showToast({ 
              title: '操作失败：' + (err.errMsg || '请重试'), 
              icon: 'none',
              duration: 3000
            });
          }
        }
      }
    });
  },

  // 7. 客服确认完成（代替用户确认完成）
  confirmComplete(e) {
    const orderId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认完成订单',
      content: '此操作将把订单标记为"已完成"状态，并计算打手收益。请确保打手已完成服务。确定要执行吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' });
          try {
            // 调用云函数确认完成
            const result = await wx.cloud.callFunction({
              name: 'admin_confirm_order',
              data: {
                orderId: orderId
              }
            });
            
            // ✨ 修复：先隐藏loading，再刷新数据，避免showLoading/hideLoading不配对
            wx.hideLoading();
            
            if (result.result && result.result.success) {
              wx.showToast({ title: '确认完成成功', icon: 'success' });
              
              // 刷新数据
              this.loadDashboardData();
              this.loadOrders();
            } else {
              wx.showToast({ 
                title: result.result.message || '操作失败', 
                icon: 'none',
                duration: 3000
              });
            }
            
          } catch (err) {
            console.error('确认完成失败', err);
            wx.hideLoading();
            wx.showToast({ title: '操作失败，请重试', icon: 'none', duration: 3000 });
          }
        }
      }
    });
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.loadDashboardData();
    this.loadOrders().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享及按钮触发分享
   */
  onShareAppMessage(options) {
    if (options.from === 'button') {
      const item = options.target.dataset.item;
      // 生成带有特定路径参数的小程序卡片
      return {
        title: `📢【急单悬赏】￥${item.amount} | ${item.gameName} - ${item.serviceName}`,
        path: `/pages/booster-lobby/booster-lobby?orderId=${item._id}` 
      };
    }

    return {
      title: 'GapHunt - 平台工单调度',
      path: '/pages/index/index'
    };
  }
})