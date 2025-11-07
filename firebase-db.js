// Firebase Firestore 数据库操作模块
// 用于替代 IndexedDB，实现多人数据共享

const COLLECTION_MENU = 'menuItems';
const COLLECTION_ORDERS = 'orders';

// 初始化 Firestore
let firestoreDB = null;

function initFirestore() {
    try {
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK not loaded');
        }
        firestoreDB = firebase.firestore();
        console.log('Firestore initialized successfully');
        return Promise.resolve(firestoreDB);
    } catch (error) {
        console.error('Failed to initialize Firestore:', error);
        return Promise.reject(error);
    }
}

// 保存菜单项到 Firestore
async function saveMenuItemsToFirestore(items) {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    try {
        // 使用批处理来更新所有菜单项
        const batch = firestoreDB.batch();
        
        // 先删除所有现有文档（可选，或者使用更新策略）
        // 这里我们使用更新策略：每个菜单项作为一个文档
        
        // 获取所有现有文档
        const snapshot = await firestoreDB.collection(COLLECTION_MENU).get();
        
        // 创建现有文档ID的集合
        const existingIds = new Set(snapshot.docs.map(doc => doc.id));
        const newIds = new Set(items.map(item => String(item.id)));
        
        // 删除不再存在的文档
        snapshot.docs.forEach(doc => {
            if (!newIds.has(doc.id)) {
                batch.delete(doc.ref);
            }
        });
        
        // 添加或更新所有菜单项
        items.forEach(item => {
            const docRef = firestoreDB.collection(COLLECTION_MENU).doc(String(item.id));
            batch.set(docRef, {
                id: item.id,
                category: item.category || '',
                name: item.name || '',
                subtitle: item.subtitle || '',
                description: item.description || '',
                price: item.price || '',
                image: item.image || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        
        await batch.commit();
        console.log('Menu items saved to Firestore:', items.length, 'items');
        return true;
    } catch (error) {
        console.error('Failed to save menu items to Firestore:', error);
        throw error;
    }
}

// 从 Firestore 加载菜单项
async function loadMenuItemsFromFirestore() {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    try {
        const snapshot = await firestoreDB.collection(COLLECTION_MENU)
            .orderBy('id')
            .get();
        
        const items = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            items.push({
                id: data.id,
                category: data.category || '',
                name: data.name || '',
                subtitle: data.subtitle || '',
                description: data.description || '',
                price: data.price || '',
                image: data.image || ''
            });
        });
        
        console.log('Menu items loaded from Firestore:', items.length, 'items');
        return items;
    } catch (error) {
        console.error('Failed to load menu items from Firestore:', error);
        throw error;
    }
}

// 保存订单到 Firestore
async function saveOrdersToFirestore(orders) {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    try {
        const batch = firestoreDB.batch();
        
        // 获取所有现有订单
        const snapshot = await firestoreDB.collection(COLLECTION_ORDERS).get();
        
        // 创建现有订单ID的集合
        const existingIds = new Set(snapshot.docs.map(doc => doc.id));
        const newIds = new Set(orders.map(order => String(order.id)));
        
        // 删除不再存在的订单
        snapshot.docs.forEach(doc => {
            if (!newIds.has(doc.id)) {
                batch.delete(doc.ref);
            }
        });
        
        // 添加或更新所有订单
        orders.forEach(order => {
            const docRef = firestoreDB.collection(COLLECTION_ORDERS).doc(String(order.id));
            batch.set(docRef, {
                id: order.id,
                name: order.name || '',
                order: order.order || '',
                items: order.items || [],
                date: order.date || new Date().toLocaleString('en-US'),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        
        await batch.commit();
        console.log('Orders saved to Firestore:', orders.length, 'orders');
        return true;
    } catch (error) {
        console.error('Failed to save orders to Firestore:', error);
        throw error;
    }
}

// 从 Firestore 加载订单
async function loadOrdersFromFirestore() {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    try {
        const snapshot = await firestoreDB.collection(COLLECTION_ORDERS)
            .orderBy('createdAt', 'desc')
            .get();
        
        const orders = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            orders.push({
                id: data.id,
                name: data.name || '',
                order: data.order || '',
                items: data.items || [],
                date: data.date || ''
            });
        });
        
        console.log('Orders loaded from Firestore:', orders.length, 'orders');
        return orders;
    } catch (error) {
        console.error('Failed to load orders from Firestore:', error);
        throw error;
    }
}

// 监听菜单项变化（实时同步）
function subscribeToMenuItems(callback) {
    if (!firestoreDB) {
        console.warn('Firestore not initialized, cannot subscribe');
        return () => {};
    }
    
    return firestoreDB.collection(COLLECTION_MENU)
        .orderBy('id')
        .onSnapshot((snapshot) => {
            const items = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                items.push({
                    id: data.id,
                    category: data.category || '',
                    name: data.name || '',
                    subtitle: data.subtitle || '',
                    description: data.description || '',
                    price: data.price || '',
                    image: data.image || ''
                });
            });
            callback(items);
        }, (error) => {
            console.error('Error listening to menu items:', error);
        });
}

// 监听订单变化（实时同步）
function subscribeToOrders(callback) {
    if (!firestoreDB) {
        console.warn('Firestore not initialized, cannot subscribe');
        return () => {};
    }
    
    return firestoreDB.collection(COLLECTION_ORDERS)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            const orders = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                orders.push({
                    id: data.id,
                    name: data.name || '',
                    order: data.order || '',
                    items: data.items || [],
                    date: data.date || ''
                });
            });
            callback(orders);
        }, (error) => {
            console.error('Error listening to orders:', error);
        });
}

