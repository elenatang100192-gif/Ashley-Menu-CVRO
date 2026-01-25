// Firebase Firestore 数据库操作模块
// 用于替代 IndexedDB，实现多人数据共享

const COLLECTION_MENU = 'menuItems';
const COLLECTION_ORDERS = 'orders';
const COLLECTION_SETTINGS = 'settings';
const DOC_HIDDEN_RESTAURANTS = 'hiddenRestaurants';

// 初始化 Firestore
let firestoreDB = null;
let connectionState = 'unknown'; // 'unknown', 'online', 'offline'
let connectionStateListeners = [];

// 连接状态监听
function setupConnectionStateListener() {
    if (!firestoreDB) return;
    
    try {
        // 监听 Firestore 连接状态
        firestoreDB.enableNetwork().then(() => {
            console.log('✅ Firestore network enabled');
            updateConnectionState('online');
        }).catch(err => {
            console.warn('⚠️ Failed to enable Firestore network:', err);
            updateConnectionState('offline');
        });
        
        // 监听离线/在线状态
        firestoreDB.onSnapshotsInSync(() => {
            updateConnectionState('online');
        });
        
        // 监听浏览器在线/离线事件
        window.addEventListener('online', () => {
            console.log('🌐 Browser is online, reconnecting Firestore...');
            if (firestoreDB) {
                firestoreDB.enableNetwork().then(() => {
                    updateConnectionState('online');
                }).catch(err => {
                    console.error('Failed to reconnect:', err);
                });
            }
        });
        
        window.addEventListener('offline', () => {
            console.warn('⚠️ Browser is offline');
            updateConnectionState('offline');
        });
    } catch (error) {
        console.error('Failed to setup connection state listener:', error);
    }
}

function updateConnectionState(newState) {
    if (connectionState !== newState) {
        const oldState = connectionState;
        connectionState = newState;
        console.log(`🔌 Firestore connection state: ${oldState} → ${newState}`);
        connectionStateListeners.forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (e) {
                console.error('Error in connection state listener:', e);
            }
        });
    }
}

function onConnectionStateChange(callback) {
    connectionStateListeners.push(callback);
    // 立即调用一次当前状态
    if (connectionState !== 'unknown') {
        callback(connectionState, connectionState);
    }
    // 返回取消监听的函数
    return () => {
        const index = connectionStateListeners.indexOf(callback);
        if (index > -1) {
            connectionStateListeners.splice(index, 1);
        }
    };
}

// 带重试的操作包装器
async function withRetry(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const isConnectionError = error.code === 'unavailable' || 
                                    error.message.includes('ERR_CONNECTION_CLOSED') ||
                                    error.message.includes('Failed to fetch') ||
                                    error.message.includes('network');
            
            if (isConnectionError && i < maxRetries - 1) {
                const waitTime = delay * Math.pow(2, i); // 指数退避
                console.warn(`⚠️ Operation failed (attempt ${i + 1}/${maxRetries}), retrying in ${waitTime}ms...`, error.message);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // 尝试重新启用网络
                if (firestoreDB) {
                    try {
                        await firestoreDB.enableNetwork();
                    } catch (e) {
                        console.warn('Failed to enable network:', e);
                    }
                }
            } else {
                throw error;
            }
        }
    }
    throw lastError;
}

function initFirestore() {
    try {
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK not loaded');
        }
        
        // 在创建 Firestore 实例之前配置设置
        // 使用新的 settings() API 配置缓存（替代已弃用的 enablePersistence）
        const db = firebase.firestore();
        
        // 配置缓存设置（启用多标签页同步和离线持久化）
        // 注意：在 Firebase 10.7.1+ 中，使用 settings() 配置缓存会自动启用持久化
        // 不需要手动调用 enablePersistence() 或 enableMultiTabIndexedDbPersistence()
        try {
            // 只在第一次调用时设置
            if (!firestoreDB) {
                // 只设置改善连接的选项，避免覆盖默认主机设置
                // 注意：不设置 cacheSizeBytes，使用默认值以避免覆盖警告
                db.settings({
                    experimentalAutoDetectLongPolling: true // 改善网络连接稳定性，特别是在受限网络环境中
                });
            }
            console.log('✅ Firestore cache configured');
        } catch (e) {
            console.warn('⚠️ Failed to configure Firestore cache (will continue without cache):', e.message);
            // 继续执行，即使缓存配置失败
        }
        
        firestoreDB = db;
        
        // 设置连接状态监听
        setupConnectionStateListener();
        
        console.log('✅ Firestore initialized successfully');
        updateConnectionState('online');
        return Promise.resolve(firestoreDB);
    } catch (error) {
        console.error('❌ Failed to initialize Firestore:', error);
        updateConnectionState('offline');
        // 即使初始化失败，也返回一个值，避免阻塞应用
        return Promise.reject(error);
    }
}

// 保存菜单项到 Firestore
async function saveMenuItemsToFirestore(items) {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    return withRetry(async () => {
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
            // 确保 id 是数字类型（用于排序）
            const itemId = typeof item.id === 'string' ? Number(item.id) || item.id : item.id;
            const docRef = firestoreDB.collection(COLLECTION_MENU).doc(String(itemId));
            
            const docData = {
                id: itemId, // 确保 id 字段类型一致
                category: item.category || '',
                name: item.name || '',
                tag: item.tag || '',
                subtitle: item.subtitle || '',
                description: item.description || '',
                price: item.price || '',
                image: item.image || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            console.log('💾 Saving item:', { docId: String(itemId), data: { id: docData.id, name: docData.name } });
            batch.set(docRef, docData, { merge: true });
        });
        
        await batch.commit();
        console.log('✅ Menu items saved to Firestore:', items.length, 'items');
        console.log('📋 Saved items:', items.map(item => ({ id: item.id, name: item.name })));
        return true;
    }, 3, 1000).catch(error => {
        console.error('Failed to save menu items to Firestore:', error);
        
        // 提供更友好的错误信息
        let errorMessage = error.message || '保存失败';
        
        // 检测常见错误类型
        if (error.code === 'permission-denied') {
            errorMessage = '权限被拒绝：请检查 Firestore 安全规则';
        } else if (error.code === 'unavailable' || error.message.includes('network') || error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_CLOSED')) {
            errorMessage = '网络错误：无法连接到 Firebase，请检查网络连接';
        } else if (error.code === 'deadline-exceeded' || error.message.includes('timeout')) {
            errorMessage = '操作超时：请检查网络连接后重试';
        } else if (error.code === 'resource-exhausted' || error.message.includes('quota')) {
            errorMessage = '配额超限：Firebase 免费额度可能已用完';
        } else if (error.message.includes('image') || error.message.includes('size')) {
            // 图片相关错误
            errorMessage = error.message;
        }
        
        const enhancedError = new Error(errorMessage);
        enhancedError.originalError = error;
        enhancedError.code = error.code;
        throw enhancedError;
    });
}

// 从 Firestore 加载菜单项
async function loadMenuItemsFromFirestore() {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    return withRetry(async () => {
        // 先尝试使用 orderBy 查询
        let snapshot;
        try {
            snapshot = await firestoreDB.collection(COLLECTION_MENU)
                .orderBy('id')
                .get();
        } catch (orderByError) {
            // 如果 orderBy 失败（可能是缺少索引），尝试不使用 orderBy
            console.warn('⚠️ orderBy failed, trying without orderBy:', orderByError);
            console.warn('错误详情:', {
                code: orderByError.code,
                message: orderByError.message,
                name: orderByError.name
            });
            try {
                snapshot = await firestoreDB.collection(COLLECTION_MENU).get();
            } catch (getError) {
                // 如果基本查询也失败，抛出错误
                console.error('❌ Failed to get menu items from Firestore:', getError);
                console.error('错误详情:', {
                    code: getError.code,
                    message: getError.message,
                    name: getError.name
                });
                // 保留原始错误的 code 属性
                const enhancedError = new Error('无法从 Firestore 加载菜单数据: ' + getError.message);
                enhancedError.code = getError.code;
                enhancedError.originalError = getError;
                throw enhancedError;
            }
        }
        
        const items = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log('📄 Loading document:', doc.id, 'Data:', { id: data.id, name: data.name, category: data.category });
            items.push({
                id: data.id,
                category: data.category || '',
                name: data.name || '',
                tag: data.tag || '',
                subtitle: data.subtitle || '',
                description: data.description || '',
                price: data.price || '',
                image: data.image || ''
            });
        });
        
        // 如果没有 orderBy，手动按 id 排序
        items.sort((a, b) => {
            const idA = Number(a.id) || 0;
            const idB = Number(b.id) || 0;
            return idA - idB;
        });
        
        console.log('✅ Menu items loaded from Firestore:', items.length, 'items');
        if (items.length > 0) {
            console.log('📋 Loaded items:', items.map(item => ({ id: item.id, name: item.name, category: item.category })));
        }
        return items;
    }, 3, 1000).catch(error => {
        console.error('❌ Failed to load menu items from Firestore:', error);
        console.error('错误详情:', {
            code: error.code,
            message: error.message,
            name: error.name,
            url: typeof window !== 'undefined' ? window.location.href : 'N/A',
            domain: typeof window !== 'undefined' ? window.location.hostname : 'N/A'
        });
        
        // 如果是权限错误，提供更详细的提示
        if (error.code === 'permission-denied') {
            const isNetlifyDomain = typeof window !== 'undefined' && window.location.hostname.includes('netlify.app');
            if (isNetlifyDomain) {
                console.error('⚠️ 权限被拒绝 - 可能是 Firebase 授权域名未配置');
                console.error('请检查：Firebase Console → Authentication → Settings → Authorized domains');
                console.error('需要添加的域名:', window.location.hostname);
            }
        }
        
        // 保留原始错误的 code 属性
        if (!error.code && error.originalError && error.originalError.code) {
            error.code = error.originalError.code;
        }
        
        // 抛出错误以便上层处理
        throw error;
    });
}

// 写入锁，防止并发写入
let isWritingOrders = false;
let writeQueue = [];
let singleOrderWriteLock = false; // 单订单写入锁

// 保存单个订单到 Firestore（优化版本，避免批量写入）
async function saveSingleOrderToFirestore(order) {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    // 使用写入锁防止并发写入
    if (singleOrderWriteLock) {
        console.warn('⚠️ Single order write in progress, queuing request...');
        return new Promise((resolve, reject) => {
            writeQueue.push({ order, resolve, reject, isSingle: true });
        });
    }
    
    singleOrderWriteLock = true;
    
    try {
        return await withRetry(async () => {
            const docRef = firestoreDB.collection(COLLECTION_ORDERS).doc(String(order.id));
            await docRef.set({
                id: order.id,
                name: order.name || '',
                order: order.order || '',
                items: order.items || [],
                date: order.date || new Date().toLocaleString('en-US'),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            console.log('✅ Single order saved to Firestore:', order.id);
            return true;
        }, 3, 1000);
    } catch (error) {
        console.error('Failed to save single order to Firestore:', error);
        // 特殊处理 resource-exhausted 错误
        if (error.code === 'resource-exhausted') {
            console.warn('⚠️ Write queue exhausted, will retry with delay');
            // 延迟重试，等待队列清空
            await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒让队列清空
            
            try {
                // 再次尝试保存
                await withRetry(async () => {
                    const docRef = firestoreDB.collection(COLLECTION_ORDERS).doc(String(order.id));
                    await docRef.set({
                        id: order.id,
                        name: order.name || '',
                        order: order.order || '',
                        items: order.items || [],
                        date: order.date || new Date().toLocaleString('en-US'),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }, 2, 2000);
                console.log('✅ Single order saved to Firestore after retry:', order.id);
                return true;
            } catch (retryError) {
                console.error('Failed to save after retry:', retryError);
                throw retryError;
            }
        }
        throw error;
    } finally {
        singleOrderWriteLock = false;
        
        // 处理队列中的下一个请求
        const singleOrderRequests = writeQueue.filter(item => item.isSingle);
        if (singleOrderRequests.length > 0) {
            const next = singleOrderRequests[0];
            const index = writeQueue.indexOf(next);
            if (index > -1) {
                writeQueue.splice(index, 1);
            }
            saveSingleOrderToFirestore(next.order)
                .then(next.resolve)
                .catch(next.reject);
        }
    }
}

// 保存订单到 Firestore（优化版本，分批处理大量订单）
async function saveOrdersToFirestore(orders) {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    // 如果只有一个订单，使用单订单保存函数
    if (orders.length === 1) {
        return await saveSingleOrderToFirestore(orders[0]);
    }
    
    // 使用写入锁防止并发写入
    if (isWritingOrders) {
        console.warn('⚠️ Write operation in progress, queuing request...');
        return new Promise((resolve, reject) => {
            writeQueue.push({ orders, resolve, reject });
        });
    }
    
    isWritingOrders = true;
    
    try {
        return await withRetry(async () => {
            // 分批处理，每批最多 400 个操作（留出余量，因为 Firestore 限制是 500）
            const BATCH_SIZE = 400;
            const batches = [];
            
            // 获取所有现有订单（只获取一次）
            const snapshot = await firestoreDB.collection(COLLECTION_ORDERS).get();
            const existingIds = new Set(snapshot.docs.map(doc => doc.id));
            const newIds = new Set(orders.map(order => String(order.id)));
            
            // 准备所有操作
            const operations = [];
            
            // 删除不再存在的订单
            snapshot.docs.forEach(doc => {
                if (!newIds.has(doc.id)) {
                    operations.push({ type: 'delete', ref: doc.ref });
                }
            });
            
            // 添加或更新订单（只更新需要更新的）
            orders.forEach(order => {
                const orderId = String(order.id);
                const existingDoc = snapshot.docs.find(doc => doc.id === orderId);
                
                // 只添加新订单或需要更新的订单
                if (!existingDoc || existingDoc.data().date !== order.date) {
                    operations.push({
                        type: 'set',
                        ref: firestoreDB.collection(COLLECTION_ORDERS).doc(orderId),
                        data: {
                            id: order.id,
                            name: order.name || '',
                            order: order.order || '',
                            items: order.items || [],
                            date: order.date || new Date().toLocaleString('en-US'),
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        }
                    });
                }
            });
            
            // 如果没有操作，直接返回
            if (operations.length === 0) {
                console.log('✅ No orders to save (all up to date)');
                return true;
            }
            
            // 分批执行操作
            for (let i = 0; i < operations.length; i += BATCH_SIZE) {
                const batch = firestoreDB.batch();
                const batchOps = operations.slice(i, i + BATCH_SIZE);
                
                batchOps.forEach(op => {
                    if (op.type === 'delete') {
                        batch.delete(op.ref);
                    } else if (op.type === 'set') {
                        batch.set(op.ref, op.data, { merge: true });
                    }
                });
                
                await batch.commit();
                console.log(`✅ Batch saved: ${batchOps.length} operations (${i + 1}-${Math.min(i + BATCH_SIZE, operations.length)}/${operations.length})`);
                
                // 在批次之间添加小延迟，避免队列过载
                if (i + BATCH_SIZE < operations.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            console.log('✅ All orders saved to Firestore:', orders.length, 'orders,', operations.length, 'operations');
            return true;
        }, 3, 1000).catch(error => {
            console.error('Failed to save orders to Firestore:', error);
            
            // 特殊处理 resource-exhausted 错误
            if (error.code === 'resource-exhausted') {
                console.warn('⚠️ Write queue exhausted, trying alternative approach...');
                // 如果批量写入失败，尝试逐个保存（更慢但更可靠）
                return saveOrdersOneByOne(orders);
            }
            
            throw error;
        });
    } finally {
        isWritingOrders = false;
        
        // 处理队列中的下一个请求
        if (writeQueue.length > 0) {
            const next = writeQueue.shift();
            saveOrdersToFirestore(next.orders)
                .then(next.resolve)
                .catch(next.reject);
        }
    }
}

// 逐个保存订单（备用方法，当批量写入失败时使用）
async function saveOrdersOneByOne(orders) {
    console.log('📝 Saving orders one by one (fallback method)...');
    let successCount = 0;
    let failCount = 0;
    
    for (const order of orders) {
        try {
            await saveSingleOrderToFirestore(order);
            successCount++;
            // 在每次保存之间添加延迟，避免队列过载
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error(`Failed to save order ${order.id}:`, error);
            failCount++;
            // 如果是 resource-exhausted，等待更长时间
            if (error.code === 'resource-exhausted') {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    console.log(`✅ Saved ${successCount} orders, ${failCount} failed`);
    if (failCount > 0) {
        throw new Error(`Failed to save ${failCount} orders`);
    }
    return true;
}

// 从 Firestore 加载订单
async function loadOrdersFromFirestore() {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    return withRetry(async () => {
        // 先尝试使用 orderBy 查询（需要索引）
        let snapshot;
        try {
            snapshot = await firestoreDB.collection(COLLECTION_ORDERS)
                .orderBy('createdAt', 'desc')
                .get();
        } catch (orderByError) {
            // 如果 orderBy 失败（可能是缺少索引或字段），尝试不使用 orderBy
            console.warn('orderBy failed, trying without orderBy:', orderByError);
            try {
                snapshot = await firestoreDB.collection(COLLECTION_ORDERS).get();
            } catch (getError) {
                // 如果基本查询也失败，抛出错误
                console.error('Failed to get orders from Firestore:', getError);
                throw new Error('无法从 Firestore 加载订单数据: ' + getError.message);
            }
        }
        
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
        
        // 如果没有 createdAt 字段，使用 date 字段排序（降序）
        orders.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            return dateB.localeCompare(dateA);
        });
        
        console.log('Orders loaded from Firestore:', orders.length, 'orders');
        return orders;
    }, 3, 1000).catch(error => {
        console.error('Failed to load orders from Firestore:', error);
        // 抛出错误以便上层处理
        throw error;
    });
}

// 清除 Firestore 中的所有订单
async function clearAllOrdersFromFirestore() {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    return withRetry(async () => {
        // 获取所有订单文档
        const snapshot = await firestoreDB.collection(COLLECTION_ORDERS).get();
        
        if (snapshot.empty) {
            console.log('No orders to clear in Firestore');
            return true;
        }
        
        const docs = snapshot.docs;
        const BATCH_SIZE = 500; // Firestore batch limit
        let totalDeleted = 0;
        
        // 分批删除（每批最多500个文档）
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = firestoreDB.batch();
            const batchDocs = docs.slice(i, i + BATCH_SIZE);
            
            batchDocs.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
            totalDeleted += batchDocs.length;
            console.log(`Cleared batch: ${batchDocs.length} orders (${totalDeleted}/${docs.length} total)`);
        }
        
        console.log('✅ Cleared all', totalDeleted, 'orders from Firestore');
        return true;
    }, 3, 1000).catch(error => {
        console.error('Failed to clear orders from Firestore:', error);
        throw error;
    });
}

// 监听菜单项变化（实时同步）
function subscribeToMenuItems(callback) {
    if (!firestoreDB) {
        console.warn('Firestore not initialized, cannot subscribe');
        return () => {};
    }
    
    // 用于存储当前活动的取消订阅函数
    let currentUnsubscribe = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    
    // 设置回退监听器（不使用 orderBy）
    const setupFallbackListener = () => {
        // 先取消当前的监听（如果存在）
        if (currentUnsubscribe) {
            try {
                currentUnsubscribe();
            } catch (e) {
                console.warn('Failed to unsubscribe previous listener:', e);
            }
        }
        
        // 设置不使用 orderBy 的监听
        try {
            currentUnsubscribe = firestoreDB.collection(COLLECTION_MENU)
                .onSnapshot(
                    (snapshot) => {
                        reconnectAttempts = 0; // 重置重连计数
                        processSnapshot(snapshot, 'no orderBy');
                    },
                    (fallbackError) => {
                        console.error('❌ Error listening to menu items (fallback):', fallbackError);
                        const isConnectionError = fallbackError.code === 'unavailable' || 
                                                fallbackError.message.includes('ERR_CONNECTION_CLOSED') ||
                                                fallbackError.message.includes('Failed to fetch');
                        
                        if (isConnectionError && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                            reconnectAttempts++;
                            console.warn(`⚠️ Connection error in fallback listener, retrying (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                            updateConnectionState('offline');
                            setTimeout(() => {
                                if (firestoreDB) {
                                    firestoreDB.enableNetwork().then(() => {
                                        updateConnectionState('online');
                                        setupFallbackListener();
                                    }).catch(err => {
                                        console.error('Failed to re-enable network:', err);
                                        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                                            callback([]);
                                        }
                                    });
                                }
                            }, 2000 * reconnectAttempts);
                        } else {
                            callback([]);
                        }
                    }
                );
            console.log('✅ Fallback listener set up successfully');
        } catch (fallbackSetupError) {
            console.error('❌ Failed to set up fallback listener:', fallbackSetupError);
            callback([]);
        }
    };
    
    // 设置主监听器（使用 orderBy）
    const setupListener = () => {
        try {
            console.log('🔍 Setting up real-time listener with orderBy...');
            currentUnsubscribe = firestoreDB.collection(COLLECTION_MENU)
                .orderBy('id')
                .onSnapshot(
                    (snapshot) => {
                        reconnectAttempts = 0; // 重置重连计数
                        processSnapshot(snapshot, 'orderBy');
                    },
                    (error) => {
                        console.error('❌ Error listening to menu items with orderBy:', error);
                        
                        const isConnectionError = error.code === 'unavailable' || 
                                                error.message.includes('ERR_CONNECTION_CLOSED') ||
                                                error.message.includes('Failed to fetch') ||
                                                error.message.includes('network');
                        
                        // 如果是连接错误，尝试重新连接
                        if (isConnectionError) {
                            console.warn('⚠️ Connection error detected, attempting to reconnect...');
                            updateConnectionState('offline');
                            
                            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                                reconnectAttempts++;
                                // 延迟重连
                                setTimeout(() => {
                                    if (firestoreDB) {
                                        firestoreDB.enableNetwork().then(() => {
                                            console.log(`✅ Network re-enabled (attempt ${reconnectAttempts}), retrying listener...`);
                                            updateConnectionState('online');
                                            // 重新设置监听
                                            if (currentUnsubscribe) {
                                                try {
                                                    currentUnsubscribe();
                                                } catch (e) {
                                                    console.warn('Failed to unsubscribe:', e);
                                                }
                                            }
                                            setupListener();
                                        }).catch(err => {
                                            console.error('❌ Failed to re-enable network:', err);
                                            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                                                setupFallbackListener();
                                            }
                                        });
                                    }
                                }, 2000 * reconnectAttempts);
                                return;
                            } else {
                                console.warn('⚠️ Max reconnection attempts reached, falling back to no orderBy...');
                                setupFallbackListener();
                                return;
                            }
                        }
                        
                        // 如果 orderBy 失败（可能是缺少索引），尝试不使用 orderBy
                        if (error.code === 'failed-precondition' || 
                            error.message.includes('index') || 
                            error.message.includes('requires an index')) {
                            console.warn('⚠️ orderBy failed, setting up listener without orderBy...');
                            setupFallbackListener();
                        } else {
                            // 其他类型的错误，也尝试设置不使用 orderBy 的监听
                            console.warn('⚠️ Unexpected error, trying fallback listener...');
                            setupFallbackListener();
                        }
                    }
                );
            console.log('✅ Real-time listener with orderBy set up successfully');
        } catch (error) {
            console.error('❌ Failed to set up real-time listener:', error);
            setupFallbackListener();
        }
    };
    
    // 处理快照数据的通用函数
    const processSnapshot = (snapshot, source) => {
        console.log(`🔄 Real-time update received (${source}):`, snapshot.size, 'documents');
        const items = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log('📄 Document:', doc.id, 'Data:', { id: data.id, name: data.name, category: data.category, tag: data.tag });
            items.push({
                id: data.id,
                category: data.category || '',
                name: data.name || '',
                tag: data.tag || '',
                subtitle: data.subtitle || '',
                description: data.description || '',
                price: data.price || '',
                image: data.image || ''
            });
        });
        
        // 手动按 id 排序（确保顺序一致）
        items.sort((a, b) => {
            const idA = Number(a.id) || 0;
            const idB = Number(b.id) || 0;
            return idA - idB;
        });
        
        console.log(`✅ Processed ${items.length} menu items from real-time update (${source})`);
        if (items.length > 0) {
            console.log('📋 Items:', items.map(item => ({ id: item.id, name: item.name })));
        }
        callback(items);
    };
    
    // 开始设置监听器
    setupListener();
    
    // 返回取消订阅函数
    return () => {
        if (currentUnsubscribe) {
            try {
                console.log('🔌 Unsubscribing from menu items listener...');
                currentUnsubscribe();
                currentUnsubscribe = null;
            } catch (e) {
                console.error('Error unsubscribing:', e);
            }
        }
    };
}

// 监听订单变化（实时同步）
function subscribeToOrders(callback) {
    if (!firestoreDB) {
        console.warn('Firestore not initialized, cannot subscribe');
        return () => {};
    }
    
    // 先尝试使用 orderBy 监听
    let unsubscribe;
    let fallbackUnsubscribe = null;
    
    try {
        unsubscribe = firestoreDB.collection(COLLECTION_ORDERS)
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
                // 如果没有 createdAt 字段，使用 date 字段排序
                orders.sort((a, b) => {
                    const dateA = a.date || '';
                    const dateB = b.date || '';
                    return dateB.localeCompare(dateA);
                });
                callback(orders);
            }, (error) => {
                console.error('Error listening to orders with orderBy:', error);
                // 如果 orderBy 失败，取消当前订阅并使用不带 orderBy 的监听
                if (unsubscribe) {
                    unsubscribe();
                }
                console.warn('Falling back to subscription without orderBy');
                fallbackUnsubscribe = firestoreDB.collection(COLLECTION_ORDERS)
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
                        orders.sort((a, b) => {
                            const dateA = a.date || '';
                            const dateB = b.date || '';
                            return dateB.localeCompare(dateA);
                        });
                        callback(orders);
                    }, (fallbackError) => {
                        console.error('Error listening to orders:', fallbackError);
                    });
            });
    } catch (error) {
        console.error('Failed to set up order subscription:', error);
        // 如果设置失败，使用不带 orderBy 的监听
        unsubscribe = firestoreDB.collection(COLLECTION_ORDERS)
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
                orders.sort((a, b) => {
                    const dateA = a.date || '';
                    const dateB = b.date || '';
                    return dateB.localeCompare(dateA);
                });
                callback(orders);
            }, (fallbackError) => {
                console.error('Error listening to orders:', fallbackError);
            });
    }
    
    // 返回取消订阅函数
    return () => {
        if (unsubscribe) {
            unsubscribe();
        }
        if (fallbackUnsubscribe) {
            fallbackUnsubscribe();
        }
    };
}

// 保存隐藏餐厅列表到 Firestore
async function saveHiddenRestaurantsToFirestore(restaurantNames) {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    return withRetry(async () => {
        const docRef = firestoreDB.collection(COLLECTION_SETTINGS).doc(DOC_HIDDEN_RESTAURANTS);
        await docRef.set({
            restaurants: restaurantNames || [],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log('✅ Hidden restaurants saved to Firestore:', restaurantNames.length, 'restaurants');
        return true;
    }, 3, 1000).catch(error => {
        console.error('Failed to save hidden restaurants to Firestore:', error);
        throw error;
    });
}

// 从 Firestore 加载隐藏餐厅列表
async function loadHiddenRestaurantsFromFirestore() {
    if (!firestoreDB) {
        throw new Error('Firestore not initialized');
    }
    
    return withRetry(async () => {
        const docRef = firestoreDB.collection(COLLECTION_SETTINGS).doc(DOC_HIDDEN_RESTAURANTS);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            console.log('No hidden restaurants document found in Firestore');
            return [];
        }
        
        const data = doc.data();
        const restaurants = data.restaurants || [];
        
        // 确保返回的是字符串数组，并去除空格
        const validRestaurants = restaurants
            .filter(name => typeof name === 'string' && name.trim())
            .map(name => String(name).trim());
        
        console.log('✅ Hidden restaurants loaded from Firestore:', validRestaurants.length, 'restaurants:', validRestaurants);
        return validRestaurants;
    }, 3, 1000).catch(error => {
        console.error('Failed to load hidden restaurants from Firestore:', error);
        // 如果加载失败，返回空数组而不是抛出错误
        return [];
    });
}

// 监听隐藏餐厅列表变化（实时同步）
function subscribeToHiddenRestaurants(callback) {
    if (!firestoreDB) {
        console.warn('Firestore not initialized, cannot subscribe to hidden restaurants');
        return () => {};
    }
    
    try {
        const docRef = firestoreDB.collection(COLLECTION_SETTINGS).doc(DOC_HIDDEN_RESTAURANTS);
        const unsubscribe = docRef.onSnapshot(
            (doc) => {
                if (!doc.exists) {
                    callback([]);
                    return;
                }
                
        const data = doc.data();
        const restaurants = data.restaurants || [];
        // 确保返回的是字符串数组，并去除空格
        const validRestaurants = restaurants
            .filter(name => typeof name === 'string' && name.trim())
            .map(name => String(name).trim());
        
        console.log('🔄 Hidden restaurants updated via real-time sync:', validRestaurants.length, 'restaurants:', validRestaurants);
        callback(validRestaurants);
            },
            (error) => {
                console.error('Error listening to hidden restaurants:', error);
                // 出错时返回空数组
                callback([]);
            }
        );
        
        console.log('✅ Real-time listener for hidden restaurants set up successfully');
        return unsubscribe;
    } catch (error) {
        console.error('Failed to set up hidden restaurants listener:', error);
        return () => {};
    }
}

