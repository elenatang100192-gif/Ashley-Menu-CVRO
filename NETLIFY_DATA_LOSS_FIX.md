# Netlify 平台菜单数据丢失问题 - 诊断与修复指南

## 问题现象
在 Netlify 部署的公开链接上访问时，菜单数据不显示或丢失。

## 快速诊断步骤

### 1. 检查浏览器控制台（最重要）

1. 打开 Netlify 部署的网站
2. 按 `F12` 打开开发者工具
3. 查看 **Console** 标签页
4. 查找以下关键信息：

**正常情况应该看到：**
```
✅ Firestore initialized
✅ Menu items loaded: X items
✅ Firebase real-time sync listeners set up successfully
```

**如果看到错误：**
- `Firebase SDK not loaded` → 检查 Firebase SDK 加载
- `Firestore not initialized` → 检查 Firebase 配置
- `Failed to load menu items from Firestore` → 检查 Firestore 权限
- `permission-denied` → Firestore 安全规则问题
- `unavailable` 或 `network` → 网络连接问题

### 2. 检查 Firebase 授权域名（最常见原因）

**问题：** Firebase 默认只允许从特定域名访问。Netlify 域名必须添加到授权列表。

**解决步骤：**

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 选择项目：`ashley-menu`
3. 左侧菜单 → **Authentication** → **Settings** 标签
4. 滚动到 **Authorized domains**（授权域名）部分
5. 检查是否包含您的 Netlify 域名，例如：
   - `ashley-menu-selection.netlify.app`
   - 或您的自定义域名
6. 如果没有，点击 **Add domain** 添加
7. 等待 1-2 分钟让设置生效

**注意：** 如果使用通配符域名，可以添加 `*.netlify.app` 允许所有 Netlify 子域名。

### 3. 检查 Firestore 安全规则

**检查位置：** Firebase Console → Firestore Database → Rules

**正确的规则（测试环境）：**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /menuItems/{itemId} {
      allow read, write: if true;
    }
    match /orders/{orderId} {
      allow read, write: if true;
    }
  }
}
```

或者更简单的规则（允许所有读写）：
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

**重要：** 点击 **Publish** 保存规则。

### 4. 检查 Firestore 数据库中的数据

**检查位置：** Firebase Console → Firestore Database → Data

1. 确认 `menuItems` 集合存在
2. 确认集合中有文档（菜单项）
3. 检查文档结构是否正确（包含 `id`, `name`, `category` 等字段）

### 5. 检查网络连接

**可能的问题：**
- 防火墙阻止 Firebase 连接
- 网络代理问题
- CORS 问题

**测试方法：**
1. 在浏览器控制台的 **Network** 标签页
2. 查找对 `firestore.googleapis.com` 的请求
3. 检查请求状态码：
   - `200` = 正常
   - `403` = 权限问题（检查授权域名和安全规则）
   - `404` = 资源不存在
   - `500` = 服务器错误

### 6. 检查 Firebase 配置

**检查文件：** `firebase-config.js`

确认配置信息正确：
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyBh2d7m2p3v-K2SiBYtuyRdaEhU4v0tygg",
    authDomain: "ashley-menu.firebaseapp.com",
    projectId: "ashley-menu",
    storageBucket: "ashley-menu.firebasestorage.app",
    messagingSenderId: "1081975118739",
    appId: "1:1081975118739:web:d6e7e636aa1449d5012666",
    measurementId: "G-CDBKNH3E9C"
};
```

**验证方法：**
1. 访问 Firebase Console → Project Settings → General
2. 在 **Your apps** 部分找到 Web 应用
3. 对比配置信息是否一致

## 常见错误及解决方案

### 错误 1：`permission-denied`

**原因：** Firestore 安全规则不允许读取

**解决：**
1. 检查 Firestore 安全规则（见步骤 3）
2. 确保规则已发布
3. 等待几分钟让规则生效

### 错误 2：`Failed to fetch` 或 `network error`

**原因：** 网络连接问题或授权域名未配置

**解决：**
1. 检查 Firebase 授权域名（见步骤 2）
2. 检查网络连接
3. 尝试刷新页面

### 错误 3：数据加载超时（30秒）

**原因：** 网络慢或 Firebase 服务响应慢

**解决：**
1. 检查网络连接
2. 等待更长时间
3. 刷新页面重试

### 错误 4：页面显示但数据为空

**可能原因：**
1. Firestore 集合为空（需要先添加数据）
2. 数据加载失败但错误被静默处理
3. 实时监听器未正确设置

**诊断：**
1. 查看浏览器控制台日志
2. 检查 Firestore 数据库中是否有数据
3. 尝试手动添加一个菜单项测试

## 测试清单

完成修复后，请测试以下功能：

- [ ] 页面正常加载，没有错误提示
- [ ] 浏览器控制台显示 "Firestore initialized"
- [ ] 浏览器控制台显示 "Menu items loaded: X items"
- [ ] 菜单项正常显示在页面上
- [ ] 可以添加新的菜单项
- [ ] 添加后立即显示（实时同步）
- [ ] 在其他设备/浏览器上也能看到数据

## 如果问题仍然存在

1. **收集诊断信息：**
   - 浏览器控制台的完整错误日志
   - Network 标签页中对 Firebase 的请求详情
   - Firebase Console 中的使用情况统计

2. **检查 Firebase 配额：**
   - Firebase Console → Usage and billing
   - 确认没有超出免费额度

3. **尝试本地测试：**
   - 在本地打开 `index.html`
   - 确认本地可以正常加载数据
   - 如果本地正常但 Netlify 不正常，问题可能是授权域名

4. **联系支持：**
   - 提供完整的错误日志
   - 提供 Firebase 项目 ID
   - 提供 Netlify 部署 URL

## 预防措施

1. **定期检查 Firebase 授权域名**
   - 添加新域名时记得更新授权列表

2. **监控 Firebase 使用情况**
   - 定期检查配额使用情况
   - 避免超出免费额度

3. **备份数据**
   - 定期使用 "Export All Data" 功能备份数据
   - 保存到安全位置

4. **测试部署**
   - 每次部署后测试数据加载功能
   - 在不同设备上测试

