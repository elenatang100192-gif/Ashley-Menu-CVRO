# Firebase 数据共享设置指南

## 为什么使用 Firebase？

- ✅ **多人实时同步**：所有用户看到相同的数据
- ✅ **实时更新**：无需刷新页面，数据自动更新
- ✅ **免费额度**：Firebase 免费额度足够小型应用使用
- ✅ **无需服务器**：纯前端应用，无需后端代码

## 快速设置步骤

### 1. 创建 Firebase 项目（5分钟）

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 使用 Google 账号登录
3. 点击 **"Add project"**（添加项目）
4. 输入项目名称（如：`ashley-menu`）
5. 按照向导完成创建（可以禁用 Google Analytics）

### 2. 启用 Firestore Database（2分钟）

1. 在 Firebase Console 左侧菜单，点击 **"Firestore Database"**
2. 点击 **"Create database"**（创建数据库）
3. 选择 **"Start in test mode"**（测试模式）
   - ⚠️ 注意：测试模式允许所有人读写，适合内部使用
   - 如需生产环境，请设置更严格的安全规则
4. 选择数据库位置（建议选择离您最近的区域，如 `asia-east1`）
5. 点击 **"Enable"**（启用）

### 3. 获取配置信息（3分钟）

1. 在 Firebase Console 中，点击左上角的 **⚙️ 项目设置**（齿轮图标）
2. 滚动到 **"Your apps"**（您的应用）部分
3. 点击 **Web 图标**（`</>`）添加 Web 应用
4. 输入应用昵称（如：`Ashley Menu Web`）
5. 点击 **"Register app"**（注册应用）
6. 复制显示的配置信息（`firebaseConfig` 对象）

### 4. 配置应用（2分钟）

#### 是否需要安装 SDK？

无需手动安装 Firebase SDK 文件，本项目已在 `index.html` 头部通过 CDN 自动引入了必要的 Firebase 依赖（`firebase-app-compat.js` 和 `firebase-firestore-compat.js`）。您只需完成以下两步：

1. **将配置粘贴到 `firebase-config.js`**
   - 用上一步复制的 `firebaseConfig` 信息，替换 `firebase-config.js` 文件中的内容。

2. **切换为 Firebase 模式**
   - 在 `script.js` 中将 `USE_FIREBASE` 设为 `true`（具体参见下方第 5 步）。

无需额外 `npm install` 或下载 SDK 文件，直接使用浏览器打开 `index.html` 即可。


1. 打开项目中的 `firebase-config.js` 文件
2. 将复制的配置信息替换到文件中：

```javascript
const firebaseConfig = {
    apiKey: "AIza...",  // 替换为您的 API Key
    authDomain: "your-project.firebaseapp.com",  // 替换为您的项目域名
    projectId: "your-project-id",  // 替换为您的项目 ID
    storageBucket: "your-project.appspot.com",  // 替换为您的存储桶
    messagingSenderId: "123456789",  // 替换为您的发送者 ID
    appId: "1:123456789:web:abc123"  // 替换为您的应用 ID
};
```

3. 保存文件

### 5. 启用 Firebase 模式（1分钟）

1. 打开 `script.js` 文件
2. 找到第 36 行：
   ```javascript
   const USE_FIREBASE = false;
   ```
3. 改为：
   ```javascript
   const USE_FIREBASE = true;
   ```
4. 保存文件

### 6. 设置安全规则（2分钟）

1. 在 Firebase Console 中，进入 **Firestore Database**
2. 点击 **"Rules"**（规则）标签
3. 将规则替换为：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

⚠️ **安全提示**：
- 这个规则允许所有人读写数据
- 适合内部使用或开发环境
- 如需生产环境，请设置身份验证和更严格的规则

4. 点击 **"Publish"**（发布）保存规则

### 7. 测试（2分钟）

1. 在浏览器中打开 `index.html`
2. 按 `F12` 打开浏览器控制台
3. 应该看到：`Firebase initialized and real-time sync enabled`
4. 添加一个菜单项
5. 在另一个浏览器/设备中打开同一页面
6. 应该能看到刚才添加的菜单项（实时同步）

## 验证设置

### 检查清单

- [ ] Firebase 项目已创建
- [ ] Firestore Database 已启用
- [ ] `firebase-config.js` 已配置
- [ ] `USE_FIREBASE = true` 已设置
- [ ] Firestore 安全规则已发布
- [ ] 浏览器控制台显示 "Firebase initialized"
- [ ] 可以添加菜单项
- [ ] 多设备/浏览器可以看到实时更新

## 常见问题

### Q: 控制台显示 "Firebase SDK not loaded"
**A**: 检查 `index.html` 中是否包含了 Firebase SDK 脚本标签

### Q: 数据没有实时同步
**A**: 
1. 检查 `USE_FIREBASE` 是否为 `true`
2. 检查 `firebase-config.js` 配置是否正确
3. 检查浏览器控制台是否有错误信息
4. 检查 Firestore 安全规则是否已发布

### Q: 如何从本地存储迁移到 Firebase？
**A**: 
1. 启用 Firebase 后，首次加载会自动读取本地数据
2. 添加或修改数据时会自动保存到 Firebase
3. 建议先使用 "Export All Data" 备份本地数据

### Q: 如何切换回本地存储？
**A**: 
1. 将 `USE_FIREBASE` 改回 `false`
2. 使用 "Export All Data" 导出 Firebase 数据
3. 使用 "Import Data" 导入到本地存储

### Q: Firebase 免费额度够用吗？
**A**: Firebase 免费额度包括：
- 50,000 次读取/天
- 20,000 次写入/天
- 20,000 次删除/天
- 1 GB 存储空间

对于小型应用（每天几百个订单），完全够用。

## 技术支持

如遇到问题，请检查：
1. 浏览器控制台的错误信息
2. Firebase Console 中的使用情况
3. Firestore 数据库中的数据是否正确

## 下一步

设置完成后，您可以：
- 分享网页链接给团队成员
- 所有人可以实时看到菜单和订单
- 无需刷新页面即可看到最新数据

