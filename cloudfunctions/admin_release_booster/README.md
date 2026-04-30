# admin_release_booster 云函数

## 功能说明
管理员解除打手接单的云函数，将订单从 processing 或 finished 状态恢复到 waiting_grab 状态。

## 部署步骤

### 1. 安装依赖
在微信开发者工具中：
1. 右键点击 `cloudfunctions/admin_release_booster` 文件夹
2. 选择"在终端中打开"
3. 执行命令：`npm install`

### 2. 上传云函数
1. 右键点击 `cloudfunctions/admin_release_booster` 文件夹
2. 选择"上传并部署：云端安装依赖"
3. 等待上传完成

### 3. 验证部署
在云开发控制台中查看云函数列表，确认 `admin_release_booster` 已存在。

## 调用方式

```javascript
const result = await wx.cloud.callFunction({
  name: 'admin_release_booster',
  data: {
    orderId: '订单ID'
  }
});
```

## 返回结果

成功：
```javascript
{
  success: true,
  message: '解除接单成功',
  orderId: '订单ID'
}
```

失败：
```javascript
{
  success: false,
  message: '错误信息'
}
```

## 权限说明
- 云函数运行在服务端，拥有管理员权限
- 可以绕过前端数据库权限限制
- 仅限 isAdmin 或 isCSR 为 true 的用户调用
