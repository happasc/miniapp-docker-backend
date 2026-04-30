const app = getApp()
const { getServiceTabs, getServiceDisplay } = require('../../data/service-catalog')
const { wechatLogin, fetchMeProfile } = require('../../utils/auth-api')

// 初始化云数据库
const db = wx.cloud.database()

function getGameImage(gameId) {
  if (app && typeof app.getGameImageUrl === 'function') {
    return app.getGameImageUrl(gameId)
  }
  return ''
}

function createGameCard(serviceId, game) {
  return {
    id: game.gameId,
    serviceId,
    title: game.gameName,
    subtitle: game.subtitle,
    status: game.status,
    image: game.imageKey ? getGameImage(game.imageKey) : ''
  }
}

Page({
  data: {
    banners: [],
    serviceTabs: [],
    displayGames: [],
    currentTab: 'home',
    activeService: 'peiwan',
    serviceTitle: '热门指导',
    serviceIntro: '',
    messages: [],
    authState: {
      token: '',
      user_id: '',
      userInfo: null,
      loggedIn: false
    },
    loginLoading: false,
    loginError: '',
    hasGlobalUnread: false, // 新增：全局消息未读红点提示标记
    totalOrders: 0 // ✨ 新增：累计订单量
  },

  onLoad(options) {
    console.log('代码片段是一种迷你、可分享的小程序或小游戏项目。')
    this.initServiceCatalog('peiwan')
    this.initBanners()
    this.syncAuthState()
    this.fetchTotalOrders() // ✨ 新增：加载累计订单量

    // 监听云函数返回的最新权限数据并动态渲染
    if (app) {
      app.authCallback = (authState) => {
        this.setData({ authState })
        if (this.data.currentTab === 'messages') {
          this.loadMessages()
        } else {
          this.checkGlobalUnreadMessages()
        }
      }
    }

    if (options && options.tab === 'me') {
      this.setData({ currentTab: 'me' })
    }
  },

  openGame(e) {
    const id = e.currentTarget.dataset.id
    const serviceId = e.currentTarget.dataset.service
    if (!id || !serviceId) return
    wx.navigateTo({ url: '/pages/game-detail/game-detail?serviceId=' + serviceId + '&gameId=' + id })
  },

  initServiceCatalog(serviceId) {
    const tabs = getServiceTabs()
    const current = getServiceDisplay(serviceId)

    this.setData({
      serviceTabs: tabs,
      activeService: current.id,
      serviceTitle: current.title,
      serviceIntro: current.intro,
      displayGames: (current.games || []).map((game) => createGameCard(current.id, game))
    })
  },

  handleServiceChange(e) {
    const service = e.currentTarget.dataset.service
    if (!service) return
    this.initServiceCatalog(service)
  },

  onShow() {
    this.initBanners()
    this.syncAuthState()
    
    // 如果当前停留在消息列表，则刷新一次数据
    if (this.data.currentTab === 'messages') {
      this.loadMessages()
    } else {
      // 否则仅在后台拉取一次红点状态
      this.checkGlobalUnreadMessages()
    }
  },

  syncAuthState() {
    const authState = app && typeof app.getAuthState === 'function' ? app.getAuthState() : {
      token: '',
      user_id: '',
      userInfo: null,
      loggedIn: false
    }
    this.setData({ authState })

    if (authState.loggedIn) {
      // this.refreshProfileSilently() // 屏蔽对本地 /api/me 的多余请求
    }
  },

  async refreshProfileSilently() {
    try {
      // 已经全部转移到云端 user_login，无需在 onShow 每次轮询本地服务器了。
      // 后续如需静默刷新用户余额等信息，可以在这里写 wx.cloud.callFunction('get_user_info')
    } catch (error) {
      // 保持静默，避免页面每次展示都打断用户
    }
  },

  // ✨ 新增：查询累计订单量（所有订单数量）
  async fetchTotalOrders() {
    try {
      const db = wx.cloud.database()
      
      // 查询orders集合中的所有订单数量
      const res = await db.collection('orders').count()
      
      const total = res.total || 0
      
      this.setData({
        totalOrders: total
      })
      
      console.log('累计订单量:', total)
    } catch (err) {
      console.error('查询累计订单量失败', err)
      // 失败时设置为0，不影响页面显示
      this.setData({ totalOrders: 0 })
    }
  },

  async handleWechatLogin() {
    if (this.data.loginLoading) return

    this.setData({ loginLoading: true, loginError: '' })
    try {
      // 获取用户头像昵称 (新规为 getUserProfile/getUserInfo 降级，这里简单模拟或获取真实头像)
      wx.getUserProfile({
        desc: '用于展示个人中心头像昵称',
        success: (profileRes) => {
          wx.cloud.callFunction({
            name: 'user_login',
            success: res => {
              const userData = res.result;
              const currentAuth = app.globalData.auth || {};
              
              const newAuth = {
                ...currentAuth,
                token: 'mock_cloud_token',
                user_id: userData._openid,
                _openid: userData._openid,
                userInfo: {
                  avatarUrl: userData.avatarUrl || profileRes.userInfo?.avatarUrl || currentAuth.userInfo?.avatarUrl || '',
                  nickName: userData.nickName || profileRes.userInfo?.nickName || currentAuth.userInfo?.nickName || ''
                },
                gender: userData.gender || currentAuth.gender || 'unknown',
                isAdmin: userData.isAdmin === true,
                isBooster: userData.isBooster === true,
                loggedIn: true
              };
              
              app.setAuthState(newAuth);
              wx.showToast({ title: '登录成功', icon: 'success' });
              this.setData({ loginLoading: false });
            },
            fail: err => {
              this.setData({ loginError: '云登录失败', loginLoading: false });
              wx.showToast({ title: '云登录失败', icon: 'none' });
            }
          })
        },
        fail: () => {
           this.setData({ loginError: '请授权获取头像昵称', loginLoading: false });
        }
      })
    } catch (error) {
      console.error(error)
      this.setData({ loginLoading: false })
    }
  },

  initBanners() {
    // 检查本地存储以决定是否显示三角洲首单特惠（需在订单完成后设置 'deltaPromoCompleted'=true）
    const hideDelta = wx.getStorageSync('deltaPromoCompleted') === true
    const purchased = wx.getStorageSync('deltaPromoPurchased') === true
    const createPreviewText = (lines) => (lines || []).join('；')

    const banners = [
      {
        title: '特别优惠：',
        lines: [
          '瓦三小时畅玩卡：128（原价150+）',
          '瓦五小时上分卡：208（原价250+）',
          '瓦包月卡（6h/天）：2666',
          '三角洲首单特惠：88=688w（2-3小时）'
        ],
        previewText: createPreviewText([
          '瓦三小时畅玩卡：128（原价150+）',
          '瓦五小时上分卡：208（原价250+）',
          '瓦包月卡（6h/天）：2666',
          '三角洲首单特惠：88=688w（2-3小时）'
        ]),
        showBuy: !hideDelta && !purchased,
        key: 'delta_first'
      },
      {
        title: '三角洲专享：',
        lines: [
          '三角洲包月跑刀（每日1000w）：1490/月',
          '三角洲10小时卡：娱乐陪陪350（9折）；技术陪陪600（9折）'
        ],
        previewText: createPreviewText([
          '三角洲包月跑刀（每日1000w）：1490/月',
          '三角洲10小时卡：娱乐陪陪350（9折）；技术陪陪600（9折）'
        ]),
        showBuy: false
      },
      {
        title: '福利活动：',
        lines: [
          '全场首单半价',
          '新店福利：新人首单8.8折；充500送78，充1000送200'
        ],
        previewText: createPreviewText([
          '全场首单半价',
          '新店福利：新人首单8.8折；充500送78，充1000送200'
        ]),
        showBuy: false
      }
    ]

    this.setData({ banners })
  },

  openBannerDetail(e) {
    const index = e.currentTarget.dataset.index
    const banner = (this.data.banners || [])[index]
    if (!banner) return

    const content = (banner.lines || []).join('\n')
    wx.showModal({
      title: banner.title || '活动详情',
      content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 购买处理：这里仅设置一个本地标记，真正订单与完成应由后端/订单回调控制
  handleBuy(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'delta_first') {
      const purchased = wx.getStorageSync('deltaPromoPurchased') === true
      const completed = wx.getStorageSync('deltaPromoCompleted') === true

      if (completed) {
        wx.showToast({ title: '该优惠已结束', icon: 'none' })
        return
      }

      if (purchased && !completed) {
        wx.showToast({ title: '订单正在进行中，无法重复下单', icon: 'none' })
        return
      }

      // 标记为已下单（真实场景应由下单 API 返回后设置）
      wx.setStorageSync('deltaPromoPurchased', true)
      wx.showToast({ title: '已下单，订单完成后该优惠会被移除', icon: 'none' })
      // 立即刷新横幅显示状态
      this.initBanners()
    }
  },

  // 底部导航切换（内嵌视图）
  onNavTap(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab) return
    
    // 若点击了消息页面，先检查登录状态
    if (tab === 'messages') {
      if (!this.data.authState.loggedIn) {
        wx.showModal({
          title: '请先登录',
          content: '查看消息需要先登录，是否立即前往登录？',
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) {
              this.setData({ currentTab: 'me' })
            }
          }
        })
        return
      }
      this.loadMessages()
    }
    
    this.setData({ currentTab: tab })
  },

  // 动态加载消息列表数据
  loadMessages() {
    const authState = this.data.authState || {};
    const openid = authState._openid || authState.user_id || '';
    const isAdmin = authState.isAdmin;
    const isCSR = authState.isCSR;
    const _ = db.command;

    // 获取当前时间格式化工具
    const formatTime = (dateStr) => {
      if (!dateStr) return '未知时间';
      const d = new Date(dateStr);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const checkUnread = (roomId, lastUpdateTime) => {
      const lastReadTime = wx.getStorageSync(`chat_read_time_${roomId}`) || 0;
      const msgTime = lastUpdateTime ? new Date(lastUpdateTime).getTime() : 0;
      return msgTime > lastReadTime;
    };

    if (isAdmin) {
      // 管理员端：从 chat_rooms 获取近期的会话
      // ✨ 移除 limit，先获取所有记录再进行去重
      db.collection('chat_rooms').orderBy('lastUpdateTime', 'desc').get().then(res => {
        console.log('=== 开始处理聊天室记录 ===');
        console.log(`查询到 ${res.data.length} 条记录`);
        
        // 打印前5条记录的详细信息，用于调试
        res.data.slice(0, 5).forEach((room, index) => {
          console.log(`\n记录 ${index + 1}:`, {
            _id: room._id,
            userOpenId: room.userOpenId,
            customerId: room.customerId,
            _openid: room._openid,
            users: room.users ? Object.keys(room.users) : [],
            lastUpdateTime: room.lastUpdateTime,
            lastMessage: room.lastMessage
          });
        });
        
        // ✨ 按用户去重，保留每个用户最新的聊天记录
        const userRoomMap = new Map();
        const debugInfo = []; // 用于调试
        
        res.data.forEach(room => {
          // 确定房间对应的用户标识（优先级：userOpenId > customerId > _openid > users中的非系统用户）
          let userKey = room.userOpenId || room.customerId || room._openid;
          let keySource = 'userOpenId';
          
          // 如果上面的字段都为空，尝试从 users 对象中提取
          if (!userKey && room.users) {
            const userKeys = Object.keys(room.users).filter(k => 
              k !== 'SYSTEM_CSR' && k !== 'ADMIN' && k !== openid
            );
            if (userKeys.length > 0) {
              userKey = userKeys[0];
              keySource = 'users';
            }
          }
          
          if (!userKey) {
            console.warn('⚠️ 无法确定房间用户标识，跳过:', room._id);
            return;
          }
          
          debugInfo.push({
            roomId: room._id,
            userKey: userKey,
            keySource: keySource,
            lastUpdateTime: room.lastUpdateTime
          });
          
          // 如果该用户还没有记录，或者当前房间更新，则更新
          if (!userRoomMap.has(userKey)) {
            userRoomMap.set(userKey, room);
            console.log(`✅ 新用户 ${userKey}: ${room._id}`);
          } else {
            const existingRoom = userRoomMap.get(userKey);
            const existingTime = existingRoom.lastUpdateTime ? new Date(existingRoom.lastUpdateTime).getTime() : 0;
            const currentTime = room.lastUpdateTime ? new Date(room.lastUpdateTime).getTime() : 0;
            
            console.log(`🔄 已存在用户 ${userKey}:`, {
              旧房间: existingRoom._id,
              旧时间: existingRoom.lastUpdateTime,
              新房间: room._id,
              新时间: room.lastUpdateTime,
              保留: currentTime > existingTime ? room._id : existingRoom._id
            });
            
            // 保留更新时间最新的房间
            if (currentTime > existingTime) {
              userRoomMap.set(userKey, room);
            }
          }
        });
        
        console.log('\n=== 去重结果 ===');
        console.log(`去重前: ${res.data.length} 条记录`);
        console.log(`去重后: ${userRoomMap.size} 条记录`);
        console.log(`删除: ${res.data.length - userRoomMap.size} 条重复记录`);
        console.log('\n用户列表:', Array.from(userRoomMap.keys()));
        
        const uniqueRooms = Array.from(userRoomMap.values());
        uniqueRooms.sort((a, b) => {
          const tA = a.lastUpdateTime ? new Date(a.lastUpdateTime).getTime() : 0;
          const tB = b.lastUpdateTime ? new Date(b.lastUpdateTime).getTime() : 0;
          return tB - tA;
        });
        
        // 只取前20条显示
        const displayRooms = uniqueRooms.slice(0, 20);
        
        const rooms = displayRooms.map(room => {
          let customerKey = room.users ? Object.keys(room.users).find(k => k !== openid) : room.userOpenId;
          let activeAvatar = customerKey && room.users && room.users[customerKey] ? room.users[customerKey].avatarUrl : room.avatarUrl;
          let activeName = customerKey && room.users && room.users[customerKey] ? room.users[customerKey].nickName : room.nickName;

          return {
            id: room._id, // 就是 roomId
            title: activeName || `用户_${room._id.slice(-4)}`,
            avatarUrl: activeAvatar || '', // 头像链接
            avatarText: '客', // 兜底文字
            snippet: room.lastMessage || '新客服咨询',
            time: formatTime(room.lastUpdateTime),
            unread: checkUnread(room._id, room.lastUpdateTime),
            unreadCount: checkUnread(room._id, room.lastUpdateTime) ? 1 : 0
          }
        });
        
        // 拼接最前面的系统消息
        const allMessages = [
          { id: 'm1', avatarText: '系', title: '系统', snippet: '作为管理员，请及时处理以下请求：', time: '管理', unread: false, unreadCount: 0 }
        ].concat(rooms);
        
        this.setData({ messages: allMessages, hasGlobalUnread: allMessages.some(m => m.unread) });
      }).catch(err => {
        console.error('管理员拉取会话列表失败：', err);
      });
    } else if (isCSR) {
      // ✨ 客服端：显示所有 targetId 为 SYSTEM_CSR 的会话
      db.collection('chat_rooms')
        .where({
          targetId: 'SYSTEM_CSR'
        })
        .orderBy('lastUpdateTime', 'desc')
        .limit(30)
        .get()
        .then(res => {
          // ✨ 按用户去重，保留每个用户最新的聊天记录
          const userRoomMap = new Map();
          
          res.data.forEach(room => {
            const userKey = room.userOpenId || room._openid;
            
            if (!userRoomMap.has(userKey)) {
              userRoomMap.set(userKey, room);
            } else {
              const existingRoom = userRoomMap.get(userKey);
              const existingTime = existingRoom.lastUpdateTime ? new Date(existingRoom.lastUpdateTime).getTime() : 0;
              const currentTime = room.lastUpdateTime ? new Date(room.lastUpdateTime).getTime() : 0;
              
              if (currentTime > existingTime) {
                userRoomMap.set(userKey, room);
              }
            }
          });
          
          const uniqueRooms = Array.from(userRoomMap.values());
          uniqueRooms.sort((a, b) => {
            const tA = a.lastUpdateTime ? new Date(a.lastUpdateTime).getTime() : 0;
            const tB = b.lastUpdateTime ? new Date(b.lastUpdateTime).getTime() : 0;
            return tB - tA;
          });
          
          const rooms = uniqueRooms.map(room => {
            // 获取客户信息
            const users = room.users || {};
            const userKeys = Object.keys(users).filter(k => k !== 'SYSTEM_CSR');
            const userInfo = userKeys.length > 0 ? users[userKeys[0]] : {};
            
            return {
              id: room._id,
              title: userInfo.nickName || `用户_${room.userOpenId ? room.userOpenId.slice(-4) : '未知'}`,
              avatarUrl: userInfo.avatarUrl || '',
              avatarText: '客',
              snippet: room.lastMessage || '新客服咨询',
              time: formatTime(room.lastUpdateTime),
              unread: checkUnread(room._id, room.lastUpdateTime),
              unreadCount: checkUnread(room._id, room.lastUpdateTime) ? 1 : 0
            }
          });
          
          this.setData({ messages: rooms, hasGlobalUnread: rooms.some(m => m.unread) });
        })
        .catch(err => {
          console.error('客服拉取会话列表失败：', err);
        });
    } else {
      // 普通用户端：加载系统消息以及他自己的专有客服入口，和订单沟通
      const defaultRoomId = openid ? `cs_${openid}` : 'cs_guest';
      
      db.collection('chat_rooms')
        .where(_.or([
          { userOpenId: openid }, 
          { customerId: openid },
          { targetId: openid },
          { _openid: openid },
          { roomId: defaultRoomId }
        ]))
        .orderBy('lastUpdateTime', 'desc')
        .limit(20) // 添加数量限制减轻查询消耗
        .get()
        .then(res => {
          let map = new Map();
          res.data.forEach(item => { map.set(item._id, item) });
          
          let arr = Array.from(map.values());
          arr.sort((a,b) => {
            const tA = a.lastUpdateTime ? new Date(a.lastUpdateTime).getTime() : 0;
            const tB = b.lastUpdateTime ? new Date(b.lastUpdateTime).getTime() : 0;
            return tB - tA;
          });

          // ✨ 按用户去重（针对普通用户）
          const userRoomMap = new Map();
          
          arr.forEach(room => {
            // 对于普通用户，所有房间都是自己的，不需要按用户去重
            // 但需要确保客服房间只有一个
            if (room.roomId && room.roomId.startsWith('cs_')) {
              // 客服房间使用固定key
              if (!userRoomMap.has('cs_room')) {
                userRoomMap.set('cs_room', room);
              } else {
                const existingRoom = userRoomMap.get('cs_room');
                const existingTime = existingRoom.lastUpdateTime ? new Date(existingRoom.lastUpdateTime).getTime() : 0;
                const currentTime = room.lastUpdateTime ? new Date(room.lastUpdateTime).getTime() : 0;
                
                if (currentTime > existingTime) {
                  userRoomMap.set('cs_room', room);
                }
              }
            } else {
              // 其他房间（如订单沟通）使用roomId作为key
              userRoomMap.set(room._id, room);
            }
          });
          
          let finalArr = Array.from(userRoomMap.values());
          finalArr.sort((a, b) => {
            const tA = a.lastUpdateTime ? new Date(a.lastUpdateTime).getTime() : 0;
            const tB = b.lastUpdateTime ? new Date(b.lastUpdateTime).getTime() : 0;
            return tB - tA;
          });

          // 如果没有默认客服房间，伪造一个
          const hasCsRoom = finalArr.some(room => room.roomId && room.roomId.startsWith('cs_'));
          if (!hasCsRoom) {
            finalArr.push({
              _id: defaultRoomId,
              roomId: defaultRoomId,
              title: '专属客服 (呼叫管理员)',
              lastMessage: '点击此处与管理员进行实时沟通交流',
              lastUpdateTime: new Date()
            });
          }

          const rooms = finalArr.map(room => {
            // 获取聊天房间里的对方信息（如果有存 users 对象的话）
            let otherKey = room.users ? Object.keys(room.users).find(k => k !== openid) : null;
            let otherAvatar = otherKey ? room.users[otherKey].avatarUrl : '';
            let otherName = otherKey ? room.users[otherKey].nickName : '';

            // 如果是联系专属管家/系统客服，固定显示系统字样和图标，覆盖掉一切用户特征
            if (room.roomId && room.roomId.startsWith('cs_')) {
              otherAvatar = '';
              otherName = '专属客服';
            }

            return {
              id: room._id,
              avatarText: room.roomId && room.roomId.startsWith('cs_') ? '服' : '订',
              // 优先渲染对方头像，若无则不渲染（因为 room.avatarUrl 存的往往是发起者自己的）
              avatarUrl: otherAvatar || (room.roomId && !room.roomId.includes('order_') ? room.avatarUrl : ''),
              title: otherName || room.title || (room.roomId && room.roomId.includes('order_') ? '订单沟通' : '专属客服'),
              snippet: room.lastMessage || '点击此处进行沟通',
              time: room.roomId && room.roomId.startsWith('cs_') && !hasCsRoom ? '在线' : formatTime(room.lastUpdateTime),
              unread: checkUnread(room._id, room.lastUpdateTime),
              unreadCount: checkUnread(room._id, room.lastUpdateTime) ? 1 : 0
            }
          });

          const userMessages = [
            { id: 'm1', avatarText: '系', title: '系统通知', snippet: '欢迎使用GapHunt 寻隙电竞，查看今日特惠与活动。', time: '刚刚', unread: checkUnread('m1', '2026-04-12T00:00:00.000Z'), unreadCount: checkUnread('m1', '2026-04-12T00:00:00.000Z') ? 1 : 0, disabled: true },
            { id: 'm2', avatarText: '订', title: '订单通知', snippet: '你的电竞订单已创建，状态正常。', time: '1小时前', unread: checkUnread('m2', '2026-04-12T00:00:00.000Z'), unreadCount: checkUnread('m2', '2026-04-12T00:00:00.000Z') ? 1 : 0, disabled: true }
          ].concat(rooms);

          this.setData({ messages: userMessages });
          
          // 若加载出了消息流数据，顺便检测一次是否需要显示红点
          this.setData({ hasGlobalUnread: userMessages.some(m => m.unread) });
        }).catch(err => {
          console.error('普通用户拉取会话列表失败：', err);
        });
    }
  },

  // 独立获取未读红点状态：当不在消息页时后台静默查询
  checkGlobalUnreadMessages() {
    const authState = this.data.authState || {};
    if (!authState.loggedIn) {
      this.setData({ hasGlobalUnread: false });
      return;
    }
    const openid = authState._openid || authState.user_id || '';
    const isAdmin = authState.isAdmin;
    const isCSR = authState.isCSR;
    const _ = db.command;

    const checkUnread = (roomId, lastUpdateTime) => {
      const lastReadTime = wx.getStorageSync(`chat_read_time_${roomId}`) || 0;
      const msgTime = lastUpdateTime ? new Date(lastUpdateTime).getTime() : 0;
      // 只要有一条消息的更新时间晚于该房间的阅读时间，视为有未读
      return msgTime > lastReadTime; 
    };

    let query;
    if (isAdmin) {
      query = db.collection('chat_rooms').orderBy('lastUpdateTime', 'desc').limit(20);
    } else if (isCSR) {
      // ✨ 客服端：检查所有 SYSTEM_CSR 会话的未读状态
      query = db.collection('chat_rooms')
        .where({ targetId: 'SYSTEM_CSR' })
        .orderBy('lastUpdateTime', 'desc')
        .limit(30);
    } else {
      const defaultRoomId = openid ? `cs_${openid}` : 'cs_guest';
      query = db.collection('chat_rooms')
        .where(_.or([
          { userOpenId: openid }, 
          { customerId: openid },
          { targetId: openid },
          { _openid: openid },
          { roomId: defaultRoomId }
        ]))
        .orderBy('lastUpdateTime', 'desc')
        .limit(20);
    }

    query.get().then(res => {
      let hasUnread = false;
      if (res.data) {
        hasUnread = res.data.some(room => checkUnread(room._id, room.lastUpdateTime));
      }
      // 再检测系统固定的 m1 / m2，和前面的逻辑对齐
      if (!isAdmin && !isCSR) {
         if (checkUnread('m1', '2026-04-12T00:00:00.000Z') || checkUnread('m2', '2026-04-12T00:00:00.000Z')) {
             hasUnread = true;
         }
      } else if (isAdmin) {
         if (checkUnread('m1', '2026-04-12T00:00:00.000Z')) { // 系统消息也可留存未读
             hasUnread = true;
         }
      }
      this.setData({ hasGlobalUnread: hasUnread });
    }).catch(console.error);
  },

  openMeDetail(e) {
    const page = e.currentTarget.dataset.page
    const pageMap = {
      orders: '/pages/orders/orders',
      settings: '/pages/settings/settings',
      'booster-lobby': '/pages/booster-lobby/booster-lobby',
      'admin-panel': '/pages/admin-panel/admin-panel',
      'csr-panel': '/pages/csr-panel/csr-panel'
    }

    if (!pageMap[page]) return

    const protectedPages = {
      orders: true,
      'booster-lobby': true,
      'admin-panel': true,
      'csr-panel': true
    }
    if (protectedPages[page] && !this.data.authState.loggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '该页面需要登录后访问，是否立即微信登录？',
        confirmText: '去登录',
        success: (res) => {
          if (!res.confirm) return
          this.handleWechatLogin()
        }
      })
      return
    }

    wx.navigateTo({ url: pageMap[page] })
  },

  // 消息点击统一处理器
  onMessageTap(e) {
    const id = e.currentTarget.dataset.id
    const disabled = e.currentTarget.dataset.disabled
    
    if (!id) return
    
    // 如果是禁用的消息，只清除未读标记，不跳转
    if (disabled) {
      const messages = (this.data.messages || []).map(m => 
        m.id === id ? Object.assign({}, m, { unread: false, unreadCount: 0 }) : m
      )
      this.setData({ messages })
      return
    }
    
    // 正常的消息，调用 openMessage 处理
    this.openMessage(e)
  },

  // 点击消息项：标记为已读并跳转到真实聊天页面
  openMessage(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    
    // 检查是否是禁用的消息（如系统通知、订单通知）
    const message = (this.data.messages || []).find(m => m.id === id)
    if (message && message.disabled) {
      // 禁用的消息：只清除未读标记，不跳转
      const messages = (this.data.messages || []).map(m => 
        m.id === id ? Object.assign({}, m, { unread: false, unreadCount: 0 }) : m
      )
      this.setData({ messages })
      return
    }
    
    if (!this.data.authState.loggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '查看消息需要先登录，是否立即前往登录？',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            this.setData({ currentTab: 'me' })
          }
        }
      })
      return
    }

    // 标记为已读
    const messages = (this.data.messages || []).map(m => m.id === id ? Object.assign({}, m, { unread: false, unreadCount: 0 }) : m)
    this.setData({ messages })
    
    // 直接在这里写入已读缓存，以防止由于网络或其他原因跳过去未能触发 onLoad/onUnload 保存
    wx.setStorageSync(`chat_read_time_${id}`, Date.now());

    // 跳转到完整的聊天页面（我们重构好的云开发聊天页）
    wx.navigateTo({
      url: `/pages/messages/chat?roomId=${id}`
    })
  },

  // 页面初次渲染完成
  onReady() {
    // 初始如果就在消息页，则加载数据
    if (this.data.currentTab === 'messages') {
      this.loadMessages()
    }
  }
})



