// cloudfunctions/cleanup_duplicate_rooms/index.js
// 用于清理数据库中重复的聊天室记录
// 使用方法：在微信开发者工具中右键该云函数 -> 上传并部署 -> 在云函数测试中调用

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 辅助函数：从聊天室记录中提取用户标识
function extractUserKey(room, currentOpenId) {
  // 优先级：userOpenId > customerId > _openid > users中的非系统用户
  let userKey = room.userOpenId || room.customerId || room._openid;
  
  // 如果上面的字段都为空，尝试从 users 对象中提取
  if (!userKey && room.users) {
    const userKeys = Object.keys(room.users).filter(k => 
      k !== 'SYSTEM_CSR' && k !== 'ADMIN' && k !== currentOpenId
    );
    if (userKeys.length > 0) {
      userKey = userKeys[0];
    }
  }
  
  return userKey;
}

exports.main = async (event, context) => {
  console.log('=== 开始清理重复聊天室记录 ===');
  
  try {
    // 1. 获取所有聊天室记录
    const allRooms = await db.collection('chat_rooms').get();
    console.log(`总共查询到 ${allRooms.data.length} 条聊天室记录`);
    
    if (allRooms.data.length === 0) {
      return {
        success: true,
        message: '没有聊天室记录需要清理',
        deleted: 0
      };
    }
    
    // 2. 按用户分组
    const userRoomsMap = new Map();
    
    allRooms.data.forEach(room => {
      // 提取用户标识
      const userKey = extractUserKey(room);
      
      if (!userKey) {
        console.warn(`房间 ${room._id} 无法提取用户标识，跳过`);
        return;
      }
      
      if (!userRoomsMap.has(userKey)) {
        userRoomsMap.set(userKey, []);
      }
      userRoomsMap.get(userKey).push(room);
    });
    
    console.log(`共发现 ${userRoomsMap.size} 个唯一用户`);
    
    // 3. 对每个用户，保留最新的房间，删除其他旧房间
    let deletedCount = 0;
    const deletedRooms = [];
    const mergedRooms = [];
    
    for (const [userKey, rooms] of userRoomsMap) {
      if (rooms.length <= 1) {
        continue; // 只有一个房间，不需要清理
      }
      
      console.log(`\n用户 ${userKey} 有 ${rooms.length} 个房间，开始合并...`);
      
      // 按 lastUpdateTime 降序排序
      rooms.sort((a, b) => {
        const tA = a.lastUpdateTime ? new Date(a.lastUpdateTime).getTime() : 0;
        const tB = b.lastUpdateTime ? new Date(b.lastUpdateTime).getTime() : 0;
        return tB - tA;
      });
      
      // 保留第一个（最新的）
      const keepRoom = rooms[0];
      console.log(`保留房间: ${keepRoom._id} (更新时间: ${keepRoom.lastUpdateTime})`);
      
      // 合并消息：将旧房间的消息转移到新房间
      let totalMergedMessages = 0;
      
      for (let i = 1; i < rooms.length; i++) {
        const oldRoom = rooms[i];
        console.log(`处理旧房间: ${oldRoom._id} (更新时间: ${oldRoom.lastUpdateTime})`);
        
        try {
          // 查询旧房间的所有消息
          const messagesRes = await db.collection('chat_messages')
            .where({ roomId: oldRoom._id })
            .get();
          
          if (messagesRes.data.length > 0) {
            console.log(`  找到 ${messagesRes.data.length} 条消息，开始迁移...`);
            
            // 批量更新消息的 roomId
            const batchSize = 20; // 云数据库批量更新限制
            for (let j = 0; j < messagesRes.data.length; j += batchSize) {
              const batch = messagesRes.data.slice(j, j + batchSize);
              const updatePromises = batch.map(msg => {
                return db.collection('chat_messages').doc(msg._id).update({
                  data: {
                    roomId: keepRoom._id
                  }
                });
              });
              await Promise.all(updatePromises);
            }
            
            totalMergedMessages += messagesRes.data.length;
            console.log(`  成功迁移 ${messagesRes.data.length} 条消息到新房间 ${keepRoom._id}`);
          }
          
          // 删除旧房间
          await db.collection('chat_rooms').doc(oldRoom._id).remove();
          console.log(`  删除旧房间: ${oldRoom._id}`);
          
          deletedCount++;
          deletedRooms.push({
            oldRoomId: oldRoom._id,
            newRoomId: keepRoom._id,
            userKey: userKey,
            lastUpdateTime: oldRoom.lastUpdateTime,
            messageCount: messagesRes.data.length
          });
        } catch (err) {
          console.error(`处理房间 ${oldRoom._id} 失败:`, err);
        }
      }
      
      mergedRooms.push({
        userKey: userKey,
        keptRoomId: keepRoom._id,
        mergedMessageCount: totalMergedMessages,
        deletedRoomCount: rooms.length - 1
      });
    }
    
    console.log('\n=== 清理完成 ===');
    console.log(`共合并 ${mergedRooms.length} 个用户的记录`);
    console.log(`共删除 ${deletedCount} 个重复房间`);
    
    return {
      success: true,
      message: `清理完成，合并了 ${mergedRooms.length} 个用户，删除了 ${deletedCount} 个重复房间`,
      mergedRooms: mergedRooms,
      deleted: deletedCount,
      deletedRooms: deletedRooms
    };
    
  } catch (err) {
    console.error('清理失败:', err);
    return {
      success: false,
      message: err.message || '清理失败',
      error: err
    };
  }
};
