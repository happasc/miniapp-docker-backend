const db = wx.cloud.database();
const _ = db.command;

const app = getApp();

Page({
  data: {
    userInfo: null,
    csPendingRooms: [],
    myRooms: [],
    hasNewNotice: true
  },
  onShow() {
    const authState = app.getAuthState ? app.getAuthState() : {};
    if (!authState.loggedIn) {
      wx.showModal({
        title: '提示',
        content: '查阅消息需先登录',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/index/index' });
        }
      });
      return;
    }
    this.checkUserRoleAndFetchData();
  },
  checkUserRoleAndFetchData() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return;
    db.collection('users').where({ _openid: openid }).get().then(res => {
      if (res.data.length > 0) {
        const user = res.data[0];
        this.setData({ userInfo: user });
        if (user.isCustomerService || user.isAdmin) {
          this.fetchCSList(user);
        }
        this.fetchMyChats(openid);
      } else {
        // Fallback for regular users not properly registered in users collection
        this.fetchMyChats(openid);
      }
    });
  },
  fetchCSList(user) {
    let condition = {};
    if (!user.isAdmin) {
      condition.gameType = user.serviceGameType;
    }
    db.collection('chat_rooms')
      .where(condition)
      .orderBy('lastUpdateTime', 'desc')
      .limit(30)
      .get()
      .then(res => {
        const list = res.data.map(room => {
          const lastReadTime = wx.getStorageSync(`chat_read_time_${room._id}`) || 0;
          const msgTime = room.lastUpdateTime ? new Date(room.lastUpdateTime).getTime() : 0;
          return {
            ...room,
            hasNew: msgTime > lastReadTime
          };
        });
        this.setData({ csPendingRooms: list });
      });
  },
  fetchMyChats(openid) {
    // 聚合查询我发起的，以及别人向我发起的（包括我是下单者，或者是接单打手的情况）
    const _ = db.command;
    db.collection('chat_rooms')
      .where(_.or([
        { userOpenId: openid }, 
        { customerId: openid },
        { targetId: openid }, // 对方目标是我
        { _openid: openid }  // 自己创建的房间
      ]))
      .orderBy('lastUpdateTime', 'desc')
      .limit(30)
      .get()
      .then(res => {
        // ✨ 第一步：利用 Map 按 _id 去重（防止 or 条件导致的重复）
        let idMap = new Map();
        res.data.forEach(item => { idMap.set(item._id, item) });
        
        let arr = Array.from(idMap.values());
        arr.sort((a,b) => {
          const tA = a.lastUpdateTime ? new Date(a.lastUpdateTime).getTime() : 0;
          const tB = b.lastUpdateTime ? new Date(b.lastUpdateTime).getTime() : 0;
          return tB - tA;
        });

        // ✨ 第二步：按用户去重（关键修复）
        // 对于客服聊天室（cs_${openid}），可能存在多个房间，需要合并
        // 使用 userOpenId 作为去重键，保留 lastUpdateTime 最新的一条
        const userRoomMap = new Map();
        
        arr.forEach(room => {
          // 确定房间对应的用户标识
          let userKey = room.userOpenId || room._openid || room.customerId;
          
          // 如果是打手-顾客聊天室，使用 targetId 作为用户标识
          if (room.targetId && room.targetId !== 'SYSTEM_CSR' && room.targetId !== openid) {
            userKey = room.targetId;
          }
          
          // 如果是客服聊天室，使用 openid 本身
          if (room.roomId && room.roomId.startsWith('cs_')) {
            userKey = openid;
          }
          
          // 如果该用户还没有记录，或者当前房间更新，则更新
          if (!userRoomMap.has(userKey)) {
            userRoomMap.set(userKey, room);
          } else {
            const existingRoom = userRoomMap.get(userKey);
            const existingTime = existingRoom.lastUpdateTime ? new Date(existingRoom.lastUpdateTime).getTime() : 0;
            const currentTime = room.lastUpdateTime ? new Date(room.lastUpdateTime).getTime() : 0;
            
            // 保留更新时间最新的房间
            if (currentTime > existingTime) {
              userRoomMap.set(userKey, room);
            }
          }
        });
        
        // 转换回数组并按时间排序
        let finalArr = Array.from(userRoomMap.values());
        finalArr.sort((a, b) => {
          const tA = a.lastUpdateTime ? new Date(a.lastUpdateTime).getTime() : 0;
          const tB = b.lastUpdateTime ? new Date(b.lastUpdateTime).getTime() : 0;
          return tB - tA;
        });

        const list = finalArr.map(room => {
          const lastReadTime = wx.getStorageSync(`chat_read_time_${room._id}`) || 0;
          const msgTime = room.lastUpdateTime ? new Date(room.lastUpdateTime).getTime() : 0;
          return {
            ...room,
            hasNew: msgTime > lastReadTime,
            displayName: room.title || (room.roomId && room.roomId.includes('order_') ? '订单沟通' : '客服专员'),
          };
        });
        this.setData({ myRooms: list });
      });
  },
  enterChat(e) {
    const roomId = e.currentTarget.dataset.roomid;
    wx.navigateTo({ url: `/pages/messages/chat?roomId=${roomId}` });
  },
  goSystemNotice() {
    wx.showToast({ title: '系统活动开发中', icon: 'none' });
  }
})