# Netlify 菜单数据丢失 - 快速检查清单

## ⚡ 5分钟快速诊断

### 步骤 1：检查浏览器控制台（最重要）

1. 打开 Netlify 部署的网站
2. 按 `F12` 打开开发者工具
3. 查看 **Console** 标签页

**应该看到：**
```
✅ Firestore initialized
✅ Menu items loaded: X items
```

**如果看到错误，继续下一步。**

### 步骤 2：检查 Firebase 授权域名（最常见原因）

**问题：** Firebase 默认只允许从特定域名访问。

**解决：**
1. 访问 https://console.firebase.google.com/
2. 选择项目：`ashley-menu`
3. 左侧菜单 → **Authentication** → **Settings**
4. 滚动到 **Authorized domains**
5. 检查是否包含您的 Netlify 域名（如：`xxx.netlify.app`）
6. 如果没有，点击 **Add domain** 添加
7. 等待 1-2 分钟

### 步骤 3：检查 Firestore 安全规则

1. Firebase Console → **Firestore Database** → **Rules**
2. 确保规则如下：

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

3. 点击 **Publish** 保存

### 步骤 4：检查 Firestore 数据

1. Firebase Console → **Firestore Database** → **Data**
2. 确认 `menuItems` 集合存在
3. 确认集合中有文档

## 🔍 详细诊断

如果上述步骤无法解决问题，请查看：
- `NETLIFY_DATA_LOSS_FIX.md` - 完整诊断指南
- 浏览器控制台的完整错误日志
- Network 标签页中对 Firebase 的请求

## ✅ 验证修复

修复后测试：
- [ ] 页面正常加载
- [ ] 菜单项正常显示
- [ ] 可以添加新菜单项
- [ ] 在其他设备上也能看到数据

