# 问题排查指南

## 移动端扫码后没有数据

### 问题描述
将网站链接（如 https://ashley-menu-selection.netlify.app/）转成二维码，手机扫码后看不到菜单数据。

### 快速诊断

**如果页面显示错误信息：**
1. 查看页面上的错误提示（红色背景的错误框）
2. 点击"🔄 重试"按钮
3. 点击"🔍 查看诊断信息"查看详细错误

**如果页面显示"No menu items available"：**
- 这可能是数据加载失败但错误被静默处理了
- 请查看浏览器控制台（见下方说明）

## H5 页面没有历史的上传数据

### 问题描述
在移动端（H5 页面）访问时，看不到之前上传的菜单项和订单数据。

### 可能的原因和解决方案

#### 1. Firebase 连接问题

**检查方法：**
- 打开浏览器开发者工具（移动端可以使用远程调试）
- 查看 Console 标签页
- 查找是否有 Firebase 相关的错误信息

**常见错误：**
- `Firebase SDK not loaded` - Firebase SDK 未正确加载
- `Firestore not initialized` - Firestore 初始化失败
- `Failed to load menu items from Firestore` - 数据加载失败

**解决方案：**
1. 检查网络连接是否正常
2. 确认 `firebase-config.js` 中的配置是否正确
3. 检查 Firebase Console 中 Firestore Database 是否已启用
4. 检查 Firestore 安全规则是否允许读取

#### 2. Firestore 安全规则问题

**检查方法：**
1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 选择项目 → Firestore Database → Rules
3. 检查规则是否允许读取

**正确的规则（测试环境）：**
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

**注意：** 生产环境应该使用更严格的规则。

#### 3. Firestore 索引缺失

**问题：** 如果使用 `orderBy` 查询，可能需要创建索引。

**检查方法：**
- 查看浏览器控制台，如果有索引相关错误，会显示创建索引的链接

**解决方案：**
1. 点击错误信息中的链接自动创建索引
2. 或者在 Firebase Console → Firestore Database → Indexes 中手动创建

**已修复：** 代码已更新，如果索引缺失会自动降级到不使用 `orderBy` 的查询。

#### 4. 数据确实为空

**检查方法：**
1. 访问 Firebase Console → Firestore Database → Data
2. 检查 `menuItems` 和 `orders` 集合中是否有数据

**解决方案：**
- 如果有数据但页面不显示，可能是加载逻辑问题
- 如果没有数据，需要先添加数据

#### 5. 浏览器缓存问题

**解决方案：**
1. 清除浏览器缓存
2. 强制刷新页面（Ctrl+F5 或 Cmd+Shift+R）
3. 尝试使用无痕模式访问

#### 6. 移动端特定问题

**问题：** 手机扫码后无法加载数据

**可能原因：**

1. **Firebase 授权域名未配置**
   - Firebase Console → Authentication → Settings → Authorized domains
   - 确保添加了 `ashley-menu-selection.netlify.app` 和 `*.netlify.app`
   - 或者添加 `*` 允许所有域名（仅用于测试）

2. **移动网络限制**
   - 某些移动网络可能阻止 Firebase 连接
   - 尝试切换到 WiFi 网络
   - 检查移动网络是否允许访问 Google 服务

3. **HTTPS 问题**
   - 确保使用 HTTPS 访问（Netlify 已自动配置）
   - 某些旧版移动浏览器可能不支持某些 HTTPS 功能

4. **移动浏览器兼容性**
   - 尝试使用不同的移动浏览器（Chrome、Safari、Firefox）
   - 更新浏览器到最新版本

**移动端调试方法：**

1. **使用 Chrome 远程调试（推荐）**
   - 手机连接电脑
   - 在电脑 Chrome 浏览器输入 `chrome://inspect`
   - 选择您的设备，点击"inspect"
   - 现在可以在电脑上查看手机浏览器的控制台

2. **使用 Safari Web Inspector（iOS）**
   - iPhone 设置 → Safari → 高级 → Web Inspector（开启）
   - Mac Safari → 开发 → [您的 iPhone] → [网页]
   - 查看控制台和网络请求

3. **查看页面错误信息**
   - 页面现在会显示详细的错误信息
   - 点击"🔍 查看诊断信息"查看技术详情
   - 截图保存错误信息以便排查

### 调试步骤

1. **打开开发者工具**
   - 桌面浏览器：F12
   - 移动端：使用远程调试（Chrome DevTools）

2. **查看 Console 输出**
   - 应该看到：
     - `Firestore initialized successfully`
     - `Menu items loaded from Firestore: X items`
     - `Orders loaded from Firestore: X orders`
     - `Firebase initialized and real-time sync enabled`

3. **检查网络请求**
   - 在 Network 标签页中查找 Firebase 相关的请求
   - 确认请求是否成功（状态码 200）

4. **检查数据加载**
   - 查看 Console 中是否有错误信息
   - 检查 `menuItems` 和 `allOrders` 变量的值

### 已实施的修复

1. **改进错误处理**
   - 数据加载失败时会抛出错误并被捕获
   - 在页面上显示用户友好的错误信息
   - 提供重试按钮和诊断信息

2. **自动降级机制**
   - 如果 `orderBy` 查询失败（缺少索引），自动使用不带 `orderBy` 的查询
   - 在客户端进行排序

3. **加载状态提示**
   - 页面加载时显示"正在加载数据..."
   - 加载失败时显示详细的错误信息和解决建议

4. **移动端优化**
   - 检测移动设备并显示特定提示
   - 错误信息包含移动端排查建议
   - 提供诊断信息查看功能

5. **详细日志**
   - 添加了详细的控制台日志，便于调试
   - 错误信息包含错误类型、网络状态等

### 测试检查清单

- [ ] 页面能正常加载
- [ ] 控制台没有错误信息
- [ ] 能看到"正在加载数据..."提示
- [ ] 数据加载完成后能看到菜单项
- [ ] 能看到历史订单
- [ ] 添加新菜单项后能立即看到
- [ ] 实时同步功能正常

### 如果问题仍然存在

1. **收集信息**
   - 浏览器类型和版本
   - 错误信息截图
   - 控制台日志

2. **检查 Firebase 配置**
   - 确认 `firebase-config.js` 中的配置正确
   - 确认 Firebase 项目状态正常

3. **检查网络**
   - 确认能访问 Firebase 服务
   - 检查防火墙设置

4. **尝试本地存储模式**
   - 将 `script.js` 中的 `USE_FIREBASE` 改为 `false`
   - 使用 IndexedDB 本地存储（数据不会跨设备共享）

### 联系支持

如果以上方法都无法解决问题，请提供：
- 错误信息截图
- 浏览器控制台日志
- Firebase 项目 ID
- 问题发生的具体步骤

