const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();

exports.main = async (event, context) => {
  // 1. 获取微信自动注入的用户 OpenID (绝对安全，防篡改)
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  if (!openId) {
    return { error: '未获取到 OPENID，请在小程序端调用' };
  }

  try {
    // 2. 去数据库的 users 集合里找这个用户
    const userRecord = await db.collection('users').where({
      _openid: openId
    }).get();

    if (userRecord.data.length === 0) {
      // 3. 第一次打开小程序的新用户，自动注册进数据库
      const newUser = {
        _openid: openId,
        isAdmin: false,   // 默认不是管理员
        isBooster: false, // 默认不是打手
        isCSR: false,     // 默认不是客服
        gender: 'unknown',// 默认未设置性别
        createdAt: db.serverDate()
      };
      await db.collection('users').add({ data: newUser });
      return newUser;
    } else {
      // 4. 老用户，直接返回当前数据及身份权限
      return userRecord.data[0];
    }
  } catch (err) {
    console.error('数据库查询或写入失败:', err);
    return { error: err.message };
  }
};
