# Netlify 部署指南

本指南将帮助您将 Menu Selection System 部署到 Netlify。

## 方法一：通过 GitHub 自动部署（推荐）

### 步骤 1：确保代码已推送到 GitHub

如果还没有推送，请执行：

```bash
git add .
git commit -m "准备部署到 Netlify"
git push origin main
```

### 步骤 2：登录 Netlify

1. 访问 [Netlify](https://www.netlify.com/)
2. 点击右上角 "Sign up" 或 "Log in"
3. 选择 "Sign up with GitHub"（推荐，方便后续自动部署）

### 步骤 3：创建新站点

1. 登录后，点击 "Add new site" → "Import an existing project"
2. 选择 "GitHub" 作为 Git 提供商
3. 授权 Netlify 访问您的 GitHub 账户（如果首次使用）
4. 在仓库列表中找到并选择 `Ashley` 仓库
5. 点击 "Connect"

### 步骤 4：配置构建设置

Netlify 会自动检测到这是一个静态网站，配置如下：

- **Branch to deploy**: `main`
- **Build command**: （留空，因为是静态网站）
- **Publish directory**: `/` 或 `.`（根目录）

点击 "Deploy site" 开始部署。

### 步骤 5：等待部署完成

- 部署通常需要 1-2 分钟
- 部署完成后，Netlify 会提供一个随机域名（如 `random-name-123.netlify.app`）
- 您可以点击域名访问网站

### 步骤 6：自定义域名（可选）

1. 在站点设置中，点击 "Domain settings"
2. 点击 "Add custom domain"
3. 输入您的域名（如 `menu.yourdomain.com`）
4. 按照提示配置 DNS 记录

## 方法二：手动拖拽部署（快速测试）

### 步骤 1：准备部署文件

确保所有文件都在项目根目录：
- `index.html`
- `script.js`
- `styles.css`
- `firebase-config.js`
- `firebase-db.js`

### 步骤 2：压缩文件（可选）

如果需要，可以将所有文件打包成 zip 文件。

### 步骤 3：拖拽部署

1. 访问 [Netlify](https://www.netlify.com/)
2. 登录账户
3. 在控制台页面，直接将项目文件夹拖拽到 "Want to deploy a new site without connecting to Git? Drag and drop your site output folder here" 区域
4. 等待部署完成

## 部署后检查清单

### ✅ 功能检查

1. **网站可访问**
   - 打开 Netlify 提供的域名
   - 确认页面正常加载

2. **Firebase 连接**
   - 打开浏览器开发者工具（F12）
   - 查看 Console，确认没有 Firebase 连接错误
   - 确认看到 "Firebase initialized and real-time sync enabled"

3. **功能测试**
   - 测试菜单选择功能
   - 测试添加菜单项功能
   - 测试订单查看功能
   - 测试数据导出功能

### ⚠️ 常见问题

#### 问题 1：Firebase 连接失败

**原因**：Firebase 配置可能有问题，或 Firestore 安全规则未设置。

**解决方案**：
1. 检查 `firebase-config.js` 中的配置是否正确
2. 在 Firebase Console 中检查 Firestore 安全规则
3. 确认 Firestore Database 已启用

#### 问题 2：页面刷新后路由错误

**原因**：Netlify 需要配置重定向规则来处理单页应用路由。

**解决方案**：
项目已包含 `netlify.toml` 配置文件，会自动处理路由。如果仍有问题，检查：
- `netlify.toml` 文件是否存在
- 文件内容是否正确

#### 问题 3：静态资源加载失败

**原因**：文件路径可能不正确。

**解决方案**：
- 检查 `index.html` 中的资源路径（如 `styles.css`, `script.js`）
- 确保所有文件都在根目录
- 确保文件名大小写正确（Linux 服务器区分大小写）

## 持续部署

如果使用 GitHub 连接方式，Netlify 会自动：
- ✅ 监听 GitHub 仓库的推送
- ✅ 自动重新部署网站
- ✅ 提供部署预览（Pull Request）

每次您推送代码到 GitHub 的 `main` 分支，Netlify 会自动重新部署网站。

## 环境变量（如果需要）

如果将来需要配置环境变量（如 Firebase API Key），可以在 Netlify 中设置：

1. 进入站点设置 → "Environment variables"
2. 添加变量（如 `VITE_FIREBASE_API_KEY`）
3. 在代码中使用 `process.env.VITE_FIREBASE_API_KEY` 访问

**注意**：当前项目使用静态配置，不需要环境变量。

## 性能优化建议

1. **启用 HTTPS**：Netlify 默认提供免费 SSL 证书
2. **CDN 加速**：Netlify 自动使用全球 CDN
3. **压缩**：Netlify 自动压缩静态资源
4. **缓存**：Netlify 自动配置缓存策略

## 监控和分析

Netlify 提供：
- 📊 访问统计
- 🔍 错误日志
- ⚡ 性能监控
- 🔔 部署通知

可以在站点控制台查看这些信息。

## 支持

如有问题，可以：
- 查看 [Netlify 文档](https://docs.netlify.com/)
- 查看 [Firebase 文档](https://firebase.google.com/docs)
- 检查浏览器控制台错误信息

