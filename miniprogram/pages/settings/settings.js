const { logout, wechatLogin, fetchMeProfile } = require('../../utils/auth-api')

Page({
	data: {
		authState: {
			token: '',
			user_id: '',
			userInfo: null,
			loggedIn: false
		},
		userInfo: {}, // 用于页面回显头像、昵称
		originalNickName: '', // 用于昵称修改脏检测
		tempNickName: '',
		loginLoading: false,
		loginError: '',
		showGenderModal: false, // 控制性别模态框显示
		pendingGender: '' // 待确认的性别
	},

	onShow() {
		const app = getApp()
		const authState = app && typeof app.getAuthState === 'function' ? app.getAuthState() : {
			token: '',
			user_id: '',
			userInfo: null,
			loggedIn: false
		}
		
		// 优先展示已有信息，若字段使用有差别，兼容处理
		let userInfo = {}
		if (authState.userInfo) {
			userInfo = { ...authState.userInfo }
			if (!userInfo.avatarUrl && userInfo.avatar) userInfo.avatarUrl = userInfo.avatar
			if (!userInfo.nickName && userInfo.nickname) userInfo.nickName = userInfo.nickname
			if (!userInfo.gameId && authState.gameId) userInfo.gameId = authState.gameId
		}

		const updateData = { authState, userInfo };
		// 页面初始化时记录原始昵称，用于脏区检测
		if (!this.data.originalNickName && userInfo.nickName) {
			updateData.originalNickName = userInfo.nickName;
			updateData.tempNickName = userInfo.nickName;
		}

		this.setData(updateData)

		if (authState.loggedIn) {
			this.refreshProfileSilently()
		}
	},

	// 选择并上传头像
	async onChooseAvatar(e) {
		const { avatarUrl } = e.detail;
		const { authState } = this.data;
		if (!authState.loggedIn || !authState.user_id) return;

		wx.showLoading({ title: '上传中...' });
		try {
			// 上传到云存储
			const ext = avatarUrl.match(/\.(\w+)$/) ? avatarUrl.match(/\.(\w+)$/)[1] : 'jpg';
			const cloudPath = `avatars/${authState.user_id}_${Date.now()}.${ext}`;

			const uploadRes = await wx.cloud.uploadFile({
				cloudPath,
				filePath: avatarUrl,
			});

			const fileID = uploadRes.fileID;

			// 更新云数据库
			await wx.cloud.database().collection('users').where({
				_openid: authState.user_id
			}).update({
				data: { avatarUrl: fileID }
			});

			// 更新本地信息
			const app = getApp();
			const newAuth = { ...authState };
			if (!newAuth.userInfo) newAuth.userInfo = {};
			newAuth.userInfo.avatarUrl = fileID;
			newAuth.userInfo.avatar = fileID; // 兼容老属性
			
			if (app && app.setAuthState) {
				app.setAuthState(newAuth);
			}

			// 更新当页 Data
			this.setData({
				authState: newAuth,
				'userInfo.avatarUrl': fileID
			});

			wx.hideLoading();
			wx.showToast({ title: '头像更新成功', icon: 'success' });
		} catch (error) {
			console.error('上传头像失败', error);
			wx.hideLoading();
			wx.showToast({ title: '更新失败', icon: 'none' });
		}
	},
	// 选择并更新性别（仅允许设置一次）
	async onGenderChange(e) {
		const newGender = e.detail.value;
		const { authState } = this.data;
		
		if (!authState.loggedIn || !authState.user_id) return;

		// 检查是否已经设置过性别
		const currentGender = authState.gender || 'unknown';
		
		// 如果从未设置过（unknown），弹出警告
		if (currentGender === 'unknown') {
			// 显示自定义模态框
			this.setData({
				showGenderModal: true,
				pendingGender: newGender
			});
		} else {
			// 已经设置过性别，不允许再次修改
			wx.showToast({
				title: '性别已设置，不可修改',
				icon: 'none',
				duration: 2000
			});
		}
	},

	// 关闭性别模态框
	closeGenderModal() {
		this.setData({ showGenderModal: false });
	},

	// 阻止事件冒泡
	stopPropagation() {
		// 空方法，用于阻止点击模态框内容时关闭
	},

	// 取消性别设置
	cancelGenderChange() {
		this.setData({
			showGenderModal: false,
			pendingGender: '',
			// 清除性别选择状态，让 radio 回到未选中状态
			'authState.gender': 'unknown'
		});
	},

	// 确认性别设置
	async confirmGenderChange() {
		const { pendingGender, authState } = this.data;
		
		if (!pendingGender) return;
		
		// 关闭模态框
		this.setData({ showGenderModal: false });
		
		// 执行保存
		await this.saveGender(pendingGender, authState);
		
		// 清空待确认性别
		this.setData({ pendingGender: '' });
	},

	// 保存性别到数据库（内部方法）
	async saveGender(gender, authState) {
		wx.showLoading({ title: '保存中...' });
		try {
			await wx.cloud.database().collection('users').where({
				_openid: authState.user_id
			}).update({
				data: { gender }
			});

			const app = getApp();
			const newAuth = { ...authState, gender };
			if (app && app.setAuthState) {
				app.setAuthState(newAuth);
			}

			this.setData({
				authState: newAuth
			});

			wx.hideLoading();
			wx.showToast({ title: '性别保存成功', icon: 'success' });
		} catch (error) {
			console.error('更新性别失败', error);
			wx.hideLoading();
			wx.showToast({ title: '保存失败', icon: 'none' });
		}
	},
	// 暂存用户昵称，在离开页面时统一保存
	onInputNickname(e) {
		const tempNickName = e.detail.value;
		this.setData({ tempNickName });
	},
	
	// 在页面卸载时检查脏区，决定是否保存
	onUnload() {
		const { authState, tempNickName, originalNickName } = this.data;
		// 只有当有有效输入、登录状态正常，且数据真正改变时才发起网络请求
		if (authState.loggedIn && authState.user_id && tempNickName && tempNickName !== originalNickName) {
			// 更新云数据库
			wx.cloud.database().collection('users').where({
				_openid: authState.user_id
			}).update({
				data: { nickName: tempNickName }
			}).catch(err => {
				console.error('退出页面更新昵称失败', err);
			});

			// 更新本地信息
			const app = getApp();
			const newAuth = { ...authState };
			if (!newAuth.userInfo) newAuth.userInfo = {};
			newAuth.userInfo.nickName = tempNickName;
			newAuth.userInfo.nickname = tempNickName; // 兼容老属性
			
			if (app && app.setAuthState) {
				app.setAuthState(newAuth);
			}
		}
	},
	
	// 前往游戏ID管理页
	goToGameIdManager() {
		wx.navigateTo({
			url: '/pages/game-id-manager/game-id-manager'
		});
	},

	async refreshProfileSilently() {
		// 已迁移至云开发，无需再去请求 localhost 的 /api/me 轮询状态
		// 在这里保持静默，真实场景下可以直接写 callFunction 获取最新 db 状态
	},

	async handleWechatLogin() {
		if (this.data.loginLoading) return

		this.setData({ loginLoading: true, loginError: '' })
		try {
      const app = getApp()
      // 获取用户头像昵称 (新规为 getUserProfile/getUserInfo 降级)
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
                token: 'mock_cloud_token', // 云开发其实不需要token，这是为了兼容你的旧代码
                user_id: userData._openid,
                _openid: userData._openid,
                userInfo: {
                  avatarUrl: userData.avatarUrl || profileRes.userInfo?.avatarUrl || currentAuth.userInfo?.avatarUrl || '',
                  nickName: userData.nickName || profileRes.userInfo?.nickName || currentAuth.userInfo?.nickName || '',
                  gameId: userData.gameId || currentAuth.userInfo?.gameId || ''
                },
                isAdmin: userData.isAdmin === true,
                isBooster: userData.isBooster === true,
                loggedIn: true,
                gender: userData.gender || currentAuth.gender || 'unknown'
              };
              
              app.setAuthState(newAuth);
              this.setData({ authState: newAuth, loginLoading: false });
              wx.showToast({ title: '登录成功', icon: 'success' });
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
			const message = error && error.message ? error.message : '登录失败，请重试'
			this.setData({ loginError: message })
			wx.showToast({ title: message, icon: 'none' })
      this.setData({ loginLoading: false })
		}
	},

	handleLogout() {
		if (!this.data.authState.loggedIn) {
			wx.showToast({ title: '当前未登录', icon: 'none' })
			return
		}

		wx.showModal({
			title: '退出登录',
			content: '确认退出当前账号吗？',
			success: (res) => {
				if (!res.confirm) return
				logout()
				this.setData({
					authState: {
						token: '',
						user_id: '',
						userInfo: null,
						loggedIn: false
					},
					loginError: ''
				})
				wx.showToast({ title: '已退出登录', icon: 'success' })
			}
		})
	}
})