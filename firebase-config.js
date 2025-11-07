// Firebase 配置
// 请替换为您的 Firebase 项目配置
// 获取方式：Firebase Console -> Project Settings -> General -> Your apps -> Web app

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBh2d7m2p3v-K2SiBYtuyRdaEhU4v0tygg",
    authDomain: "ashley-menu.firebaseapp.com",
    projectId: "ashley-menu",
    storageBucket: "ashley-menu.firebasestorage.app",
    messagingSenderId: "1081975118739",
    appId: "1:1081975118739:web:d6e7e636aa1449d5012666",
    measurementId: "G-CDBKNH3E9C"
  };

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);

// 注意：Firestore 数据库实例由 firebase-db.js 中的 initFirestore() 函数管理
// 不需要在这里创建 db 实例，避免与 script.js 中的 IndexedDB db 变量冲突

