# Menu Selection System

A static web application for displaying menus and supporting multiple users to select dishes.

## Features

- 📋 **Menu Display**: Clearly displays all available dishes
- ✅ **Dish Selection**: Click to select/deselect dishes
- 👤 **Name Input**: Enter name for each selection
- ✔️ **Confirm Submission**: Generate summary page after confirming selection
- 📥 **Data Export**: Download all selection records (including name and order fields)
- 🖼️ **Image Management**: Upload and manage dish images
- 📊 **Order Management**: View and manage all orders

## Usage

1. Open `index.html` file directly in your browser
2. Browse the menu and click dishes to select them
3. After selecting dishes, enter your name
4. Click the "Confirm" button to submit your selection
5. View everyone's selections on the summary page
6. Click the "Download" button in the top right corner to export data (CSV format)
7. Use "Manage Menu" to add, edit, or delete menu items
8. Use "View Orders" to see all past orders

## File Structure

```
menu/
├── README.md          # Project documentation
├── index.html         # Main page
├── styles.css         # Stylesheet
├── script.js          # Functionality script
├── firebase-config.js # Firebase configuration (for data sharing)
├── firebase-db.js     # Firebase database operations
└── 星美乐Menu (1).pdf # Original menu PDF
```

## Customizing Menu

To modify menu content, edit the `menuItems` array in `script.js` file, format as follows:

```javascript
const menuItems = [
  { id: 1, name: 'Dish Name', category: 'Category', price: 'Price', image: 'base64...' },
  // ... more dishes
];
```

Or use the "Manage Menu" interface to add, edit, or delete items through the web interface.

## Data Storage Options

### Option 1: Local Storage (Default)
- **IndexedDB**: Primary storage for menu items and orders
- **localStorage**: Fallback storage
- **特点**: 数据存储在浏览器本地，每个用户看到的数据独立
- **适用场景**: 单用户使用，不需要数据共享

### Option 2: Firebase Firestore (Data Sharing)
- **Firebase Firestore**: 云端数据库，支持多人数据共享
- **特点**: 
  - ✅ 多人实时同步数据
  - ✅ 所有用户看到相同的数据
  - ✅ 实时更新（无需刷新页面）
  - ✅ 免费额度充足（适合小型应用）
- **适用场景**: 需要多人协作，共享菜单和订单数据

### 如何启用 Firebase 数据共享

1. **创建 Firebase 项目**
   - 访问 [Firebase Console](https://console.firebase.google.com/)
   - 点击 "Add project" 创建新项目
   - 按照向导完成项目创建

2. **启用 Firestore Database**
   - 在 Firebase Console 中，点击左侧菜单的 "Firestore Database"
   - 点击 "Create database"
   - 选择 "Start in test mode"（测试模式，适合开发）
   - 选择数据库位置（建议选择离您最近的区域）

3. **获取 Firebase 配置信息**
   - 在 Firebase Console 中，点击项目设置（齿轮图标）
   - 滚动到 "Your apps" 部分
   - 点击 Web 图标（</>）添加 Web 应用
   - 输入应用昵称，点击 "Register app"
   - 复制配置信息（firebaseConfig 对象）

4. **配置应用**
   - 打开 `firebase-config.js` 文件
   - 将 Firebase 配置信息替换到 `firebaseConfig` 对象中：
   ```javascript
   const firebaseConfig = {
       apiKey: "YOUR_API_KEY",
       authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
       projectId: "YOUR_PROJECT_ID",
       storageBucket: "YOUR_PROJECT_ID.appspot.com",
       messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
       appId: "YOUR_APP_ID"
   };
   ```

5. **启用 Firebase 模式**
   - 打开 `script.js` 文件
   - 找到第 36 行：`const USE_FIREBASE = false;`
   - 改为：`const USE_FIREBASE = true;`

6. **设置 Firestore 安全规则（重要）**
   - 在 Firebase Console 中，进入 Firestore Database
   - 点击 "Rules" 标签
   - 将规则设置为（允许所有人读写，适合内部使用）：
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
   - 点击 "Publish" 发布规则

7. **测试**
   - 打开 `index.html` 在浏览器中
   - 打开浏览器控制台（F12），应该看到 "Firebase initialized and real-time sync enabled"
   - 添加一个菜单项，在其他设备/浏览器中打开应该能看到实时更新

### 数据迁移

- **从本地存储迁移到 Firebase**: 
  - 启用 Firebase 后，首次加载会自动从 IndexedDB 读取数据
  - 添加或修改数据时会自动保存到 Firebase
  - 建议先导出本地数据作为备份

- **从 Firebase 迁移到本地存储**:
  - 将 `USE_FIREBASE` 改回 `false`
  - 使用 "Export All Data" 功能导出 Firebase 数据
  - 使用 "Import Data" 功能导入到本地存储

## Technical Details

- Pure static page, no server required
- **Local Storage**: IndexedDB + localStorage (default)
- **Cloud Storage**: Firebase Firestore (optional, for data sharing)
- Supports CSV format export
- Responsive design, supports mobile devices
- Image compression and storage
- Order history management
- Real-time data synchronization (with Firebase)

## Browser Compatibility

Supports all modern browsers (Chrome, Firefox, Safari, Edge)
