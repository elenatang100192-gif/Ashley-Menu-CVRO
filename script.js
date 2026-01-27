// Global error handler to prevent crashes
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    // Prevent default error handling
    event.preventDefault();
    // Show user-friendly error message
    if (event.error && event.error.message) {
        alert('An error occurred: ' + event.error.message + '\n\nPlease refresh the page and try again');
    }
    return false;
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
    if (event.reason && event.reason.message) {
        alert('Processing failed: ' + event.reason.message + '\n\nPlease refresh the page and try again');
    } else {
        alert('Processing failed, please refresh the page and try again');
    }
    return false;
});

// Menu items data structure: { id, name, category, subtitle, description, price, image, tag }
let menuItems = [];

// Currently selected items
let selectedItems = [];
// All orders data
let allOrders = [];
// Currently editing item ID (null if not editing)
let editingItemId = null;

// Hidden restaurants (by restaurant name/tag), stored in localStorage
let hiddenRestaurants = [];
const HIDDEN_RESTAURANTS_KEY = 'hiddenRestaurants';

async function loadHiddenRestaurants() {
    if (USE_FIREBASE) {
        try {
            // 从 Firebase 加载
            const restaurants = await loadHiddenRestaurantsFromFirestore();
            hiddenRestaurants = restaurants;
            console.log('✅ Hidden restaurants loaded from Firebase:', hiddenRestaurants.length, 'restaurants:', hiddenRestaurants);
        } catch (e) {
            console.error('Failed to load hidden restaurants from Firebase:', e);
            // 如果 Firebase 加载失败，尝试从 localStorage 加载作为后备
            try {
                const stored = localStorage.getItem(HIDDEN_RESTAURANTS_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        hiddenRestaurants = parsed.filter(name => typeof name === 'string' && name.trim());
                    }
                }
            } catch (localError) {
                console.error('Failed to load from localStorage fallback:', localError);
                hiddenRestaurants = [];
            }
        }
    } else {
        // 使用 localStorage
        try {
            const stored = localStorage.getItem(HIDDEN_RESTAURANTS_KEY);
            if (!stored) {
                hiddenRestaurants = [];
                return;
            }
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                hiddenRestaurants = parsed.filter(name => typeof name === 'string' && name.trim());
            } else {
                hiddenRestaurants = [];
            }
        } catch (e) {
            console.error('Failed to load hidden restaurants from localStorage:', e);
            hiddenRestaurants = [];
        }
    }
}

async function saveHiddenRestaurants() {
    if (USE_FIREBASE) {
        try {
            // 保存到 Firebase
            await saveHiddenRestaurantsToFirestore(hiddenRestaurants);
            console.log('✅ Hidden restaurants saved to Firebase');
        } catch (e) {
            console.error('Failed to save hidden restaurants to Firebase:', e);
            // 如果 Firebase 保存失败，也保存到 localStorage 作为后备
            try {
                localStorage.setItem(HIDDEN_RESTAURANTS_KEY, JSON.stringify(hiddenRestaurants));
            } catch (localError) {
                console.error('Failed to save to localStorage fallback:', localError);
            }
        }
    } else {
        // 使用 localStorage
        try {
            localStorage.setItem(HIDDEN_RESTAURANTS_KEY, JSON.stringify(hiddenRestaurants));
        } catch (e) {
            console.error('Failed to save hidden restaurants to localStorage:', e);
        }
    }
}

function isRestaurantHidden(restaurantName) {
    if (!restaurantName) return false;
    // 标准化比较：去除前后空格，统一大小写
    const normalizedName = String(restaurantName).trim();
    return hiddenRestaurants.some(hidden => String(hidden).trim() === normalizedName);
}

// 数据库配置：设置为 true 使用 Firebase，false 使用 IndexedDB（本地存储）
const USE_FIREBASE = true; // 改为 true 启用 Firebase 数据共享

// IndexedDB database instance
let db = null;
const DB_NAME = 'MenuAppDB';
const DB_VERSION = 1;
const STORE_MENU = 'menuItems';
const STORE_ORDERS = 'orders';

// Firebase 订阅取消函数
let unsubscribeMenuItems = null;
let unsubscribeOrders = null;
let unsubscribeHiddenRestaurants = null;

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB opened successfully');
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // Create object stores if they don't exist
            if (!database.objectStoreNames.contains(STORE_MENU)) {
                const menuStore = database.createObjectStore(STORE_MENU, { keyPath: 'id', autoIncrement: false });
                menuStore.createIndex('id', 'id', { unique: true });
            }
            
            if (!database.objectStoreNames.contains(STORE_ORDERS)) {
                const ordersStore = database.createObjectStore(STORE_ORDERS, { keyPath: 'id', autoIncrement: true });
                ordersStore.createIndex('date', 'date', { unique: false });
                ordersStore.createIndex('name', 'name', { unique: false });
            }
        };
    });
}

// Format error messages with user-friendly prompts
function getErrorMessage(error, dataType) {
    const errorMsg = error.message || String(error);
    let userMsg = `Failed to load ${dataType}.`;
    
    // Detect common error types
    if (errorMsg.includes('permission') || errorMsg.includes('Permission denied')) {
        userMsg += '<br><br>❌ <strong>Permission Error</strong>: Firestore security rules may not allow access.';
        userMsg += '<br>Please check Firebase Console → Firestore Database → Rules';
    } else if (errorMsg.includes('network') || errorMsg.includes('Failed to fetch')) {
        userMsg += '<br><br>❌ <strong>Network Error</strong>: Unable to connect to Firebase server.';
        userMsg += '<br>Please check:<br>1. Mobile network/WiFi connection<br>2. Firewall settings<br>3. Whether VPN affects the connection';
    } else if (errorMsg.includes('index')) {
        userMsg += '<br><br>⚠️ <strong>Missing Index</strong>: Firestore may need to create an index.';
        userMsg += '<br>Data will still load, but may be slower.';
    } else if (errorMsg.includes('quota') || errorMsg.includes('quota exceeded')) {
        userMsg += '<br><br>❌ <strong>Quota Exceeded</strong>: Firebase free quota may be exhausted.';
        userMsg += '<br>Please check usage in Firebase Console.';
    } else {
        userMsg += '<br><br>Error details: ' + errorMsg;
    }
    
    // Add mobile-specific tips
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        userMsg += '<br><br>📱 <strong>Mobile Tips</strong>:';
        userMsg += '<br>• Ensure using HTTPS access (Netlify is automatically configured)';
        userMsg += '<br>• Check if mobile network allows access to Firebase';
        userMsg += '<br>• Try switching to WiFi network';
    }
    
    return userMsg;
}

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    // 显示加载状态
    const menuContainer = document.getElementById('menuContainer');
    if (menuContainer) {
        menuContainer.innerHTML = '<div class="loading-message">Loading data...</div>';
    }
    
    try {
        if (USE_FIREBASE) {
            // 使用 Firebase
            if (typeof firebase === 'undefined') {
                if (menuContainer) {
                    menuContainer.innerHTML = '<div class="error-message">Firebase SDK not loaded. Please check firebase-config.js and ensure Firebase SDK is included in index.html.</div>';
                }
                alert('Firebase SDK not loaded. Please check firebase-config.js and ensure Firebase SDK is included in index.html');
                return;
            }
            
            try {
                    console.log('Initializing Firestore...');
                await initFirestore();
                console.log('✅ Firestore initialized');
                
                // 加载初始数据（使用 try-catch 确保单个失败不影响其他）
                // 添加超时处理，避免无限加载
                const LOAD_TIMEOUT = 30000; // 30秒超时
                let menuLoadError = null;
                
                try {
                    console.log('Loading menu data...');
                    // Add timeout using Promise.race
                    const loadPromise = loadMenuItemsFromFirestore();
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Data loading timeout (30 seconds). Please check your network connection or refresh the page to retry.')), LOAD_TIMEOUT)
                    );
                    
                    menuItems = await Promise.race([loadPromise, timeoutPromise]);
                    console.log('✅ Menu items loaded:', menuItems.length, 'items');
                    
                    // 如果数据为空，记录警告（renderMenu 会处理显示）
                    if (menuItems.length === 0) {
                        console.warn('⚠️ Menu items array is empty - Firestore collection may be empty');
                        console.log('Tip: If this is the first time using, you need to add menu data first');
                    } else {
                        console.log('Menu data sample:', menuItems.slice(0, 2)); // Show first 2 menu items as example
                    }
                } catch (menuError) {
                    console.error('❌ Failed to load menu items:', menuError);
                    console.error('Error details:', {
                        message: menuError.message,
                        stack: menuError.stack,
                        name: menuError.name,
                        code: menuError.code,
                        url: window.location.href,
                        domain: window.location.hostname
                    });
                    menuItems = [];
                    menuLoadError = menuError;
                    
                    // 检查是否是授权域名问题
                    const isNetlifyDomain = window.location.hostname.includes('netlify.app');
                    const isPermissionDenied = menuError.code === 'permission-denied' || 
                                             menuError.message.includes('permission-denied');
                    const isNetworkError = menuError.code === 'unavailable' || 
                                         menuError.message.includes('Failed to fetch') ||
                                         menuError.message.includes('network');
                    
                    // Display user-friendly error message
                    const errorMsg = getErrorMessage(menuError, 'menu data');
                    let diagnosticInfo = '';
                    
                    if (isNetlifyDomain && (isPermissionDenied || isNetworkError)) {
                        diagnosticInfo = '<div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 15px 0; text-align: left;">' +
                            '<strong style="color: #856404;">⚠️ Common Netlify Deployment Issues:</strong><br>' +
                            '<ol style="margin: 10px 0 0 20px; color: #856404;">' +
                            '<li><strong>Firebase Authorized Domain Not Configured</strong><br>' +
                            'Please visit Firebase Console → Authentication → Settings → Authorized domains<br>' +
                            'Add domain: <code style="background: #f0f0f0; padding: 2px 5px;">' + window.location.hostname + '</code></li>' +
                            '<li><strong>Firestore Security Rules</strong><br>' +
                            'Please check Firebase Console → Firestore Database → Rules<br>' +
                            'Ensure rules allow reading: <code style="background: #f0f0f0; padding: 2px 5px;">allow read: if true;</code></li>' +
                            '</ol>' +
                            '<p style="margin-top: 10px; color: #856404;"><small>📖 Detailed guide: See <code>NETLIFY_DATA_LOSS_FIX.md</code> file in the project</small></p>' +
                            '</div>';
                    }
                    
                    if (menuContainer) {
                        menuContainer.innerHTML = '<div class="error-message">' + errorMsg + 
                            diagnosticInfo +
                            '<br><br><button onclick="location.reload()" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">🔄 Retry</button>' +
                            '<br><br><details style="margin-top: 15px; text-align: left;"><summary style="cursor: pointer; color: #4CAF50;">🔍 View Detailed Diagnostic Information</summary><pre style="background: #2a2a2a; padding: 10px; border-radius: 5px; overflow-x: auto; margin-top: 10px; font-size: 12px; text-align: left;">' +
                            'Current Domain: ' + window.location.hostname + '\n' +
                            'Full URL: ' + window.location.href + '\n' +
                            'Firebase Config: ' + (typeof firebase !== 'undefined' ? 'Loaded ✓' : 'Not Loaded ✗') + '\n' +
                            'Firestore Initialized: ' + (firestoreDB ? 'Initialized ✓' : 'Not Initialized ✗') + '\n' +
                            'Error Code: ' + (menuError.code || 'N/A') + '\n' +
                            'Error Message: ' + menuError.message + '\n' +
                            'Error Stack: ' + (menuError.stack || 'N/A') +
                            '</pre></details>' +
                            '<br><br><small style="color: #999;">If the problem persists, please check:<br>1. Network connection<br>2. Firebase configuration<br>3. Firestore security rules<br>4. Firebase authorized domains (Netlify deployment)</small></div>';
                    }
                }
                
                let ordersLoadError = null;
                try {
                    console.log('Loading order data...');
                    const loadOrdersPromise = loadOrdersFromFirestore();
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Order loading timeout')), LOAD_TIMEOUT)
                    );
                    allOrders = await Promise.race([loadOrdersPromise, timeoutPromise]);
                    console.log('✅ Orders loaded:', allOrders.length, 'orders');
                } catch (ordersError) {
                    console.error('❌ Failed to load orders:', ordersError);
                    allOrders = [];
                    ordersLoadError = ordersError;
                    // Order loading failure does not affect menu display, only log error
                    console.warn('⚠️ Orders loading failed:', ordersError.message);
                }
                
                // If menu loading fails, don't continue rendering
                if (menuLoadError) {
                    return;
                }
                
                // Set up real-time listeners (must be set after data loading to receive updates immediately)
                try {
                    console.log('🔍 Setting up real-time data listeners...');
                    unsubscribeMenuItems = subscribeToMenuItems((items) => {
                        console.log('🔄 Real-time sync triggered:', items.length, 'items received');
                        console.log('📋 Items:', items.map(item => ({ id: item.id, name: item.name })));
                        
                        // Update data
                        menuItems = items;
                        
                // Refresh display
                console.log('🔄 Rendering menu with', items.length, 'items from real-time sync');
                renderMenu();
                renderItemsList();
                renderRestaurantVisibilityControls();
                // Update restaurant filter when menu items change
                updateRestaurantFilter();
                    });
                    
                    unsubscribeOrders = subscribeToOrders((orders) => {
                        console.log('🔄 Orders updated via real-time sync:', orders.length, 'orders');
                        allOrders = orders;
                        // If currently on orders page, refresh display
                        if (document.getElementById('ordersPage').classList.contains('active')) {
                            renderAllOrders();
                        }
                    });
                    
                    // Set up real-time listener for hidden restaurants
                    unsubscribeHiddenRestaurants = subscribeToHiddenRestaurants((restaurants) => {
                        console.log('🔄 Hidden restaurants updated via real-time sync:', restaurants.length, 'restaurants');
                        hiddenRestaurants = restaurants;
                        // Refresh display
                        renderMenu();
                        renderRestaurantVisibilityControls();
                        updateRestaurantFilter();
                    });
                    
                    console.log('✅ Firebase real-time sync listeners set up successfully');
                    console.log('💡 Note: Real-time listeners will automatically update when data changes on any device');
                } catch (subscribeError) {
                    console.error('❌ Failed to set up real-time subscriptions:', subscribeError);
                    console.warn('⚠️ Continuing without real-time sync - data will only sync on page refresh');
                }
                
                // Load hidden restaurants configuration (Firebase mode)
                try {
                    await loadHiddenRestaurants();
                    console.log('✅ Hidden restaurants loaded from Firebase');
                } catch (hiddenError) {
                    console.error('Failed to load hidden restaurants:', hiddenError);
                    // Continue execution, use empty array
                    hiddenRestaurants = [];
                }
                
                console.log('✅ Firebase data loading completed');
            } catch (firebaseError) {
                console.error('Firebase initialization failed:', firebaseError);
                console.error('Error details:', {
                    message: firebaseError.message,
                    stack: firebaseError.stack,
                    name: firebaseError.name,
                    code: firebaseError.code,
                    url: window.location.href,
                    domain: window.location.hostname
                });
                
                const errorMsg = getErrorMessage(firebaseError, 'Firebase database');
                
                // Check if it's an authorized domain issue
                const isNetlifyDomain = window.location.hostname.includes('netlify.app');
                const isPermissionDenied = firebaseError.code === 'permission-denied' || 
                                         firebaseError.message.includes('permission-denied');
                const isNetworkError = firebaseError.code === 'unavailable' || 
                                     firebaseError.message.includes('Failed to fetch') ||
                                     firebaseError.message.includes('network');
                
                let diagnosticInfo = '';
                if (isNetlifyDomain && (isPermissionDenied || isNetworkError)) {
                    diagnosticInfo = '<div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 15px 0; text-align: left;">' +
                        '<strong style="color: #856404;">⚠️ Common Netlify Deployment Issues:</strong><br>' +
                        '<ol style="margin: 10px 0 0 20px; color: #856404;">' +
                        '<li><strong>Firebase Authorized Domain Not Configured</strong><br>' +
                        'Please visit Firebase Console → Authentication → Settings → Authorized domains<br>' +
                        'Add domain: <code style="background: #f0f0f0; padding: 2px 5px;">' + window.location.hostname + '</code></li>' +
                        '<li><strong>Firestore Security Rules</strong><br>' +
                        'Please check Firebase Console → Firestore Database → Rules<br>' +
                        'Ensure rules allow reading: <code style="background: #f0f0f0; padding: 2px 5px;">allow read: if true;</code></li>' +
                        '</ol>' +
                        '<p style="margin-top: 10px; color: #856404;"><small>📖 Detailed guide: See <code>NETLIFY_DATA_LOSS_FIX.md</code> file in the project</small></p>' +
                        '</div>';
                }
                
                if (menuContainer) {
                    menuContainer.innerHTML = '<div class="error-message">' + errorMsg + 
                        diagnosticInfo +
                        '<br><br><button onclick="location.reload()" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">🔄 Retry</button>' +
                        '<br><br><details style="margin-top: 15px; text-align: left;"><summary style="cursor: pointer; color: #4CAF50;">🔍 View Detailed Diagnostic Information</summary><pre style="background: #2a2a2a; padding: 10px; border-radius: 5px; overflow-x: auto; margin-top: 10px; font-size: 12px; text-align: left;">' +
                        'Current Domain: ' + window.location.hostname + '\n' +
                        'Full URL: ' + window.location.href + '\n' +
                        'User Agent: ' + navigator.userAgent + '\n' +
                        'Firebase Config: ' + (typeof firebase !== 'undefined' ? 'Loaded ✓' : 'Not Loaded ✗') + '\n' +
                        'Firestore Initialized: ' + (firestoreDB ? 'Initialized ✓' : 'Not Initialized ✗') + '\n' +
                        'Error Code: ' + (firebaseError.code || 'N/A') + '\n' +
                        'Error Message: ' + firebaseError.message + '\n' +
                        'Error Stack: ' + (firebaseError.stack || 'N/A') +
                        '</pre></details></div>';
                } else {
                    alert('Unable to connect to Firebase database.\n\n' + errorMsg + 
                        (isNetlifyDomain ? '\n\n⚠️ If this is a Netlify deployment, please check Firebase authorized domain configuration.' : ''));
                }
                // Continue with empty data to avoid page being completely unusable
                menuItems = [];
                allOrders = [];
                // Don't return, continue to bind event listeners
            }
        } else {
            // Use IndexedDB (local storage)
            console.log('Using IndexedDB (local storage)...');
            await initDB();
            
            // Migrate data from localStorage to IndexedDB if needed
            await migrateFromLocalStorage();
            
            // Load data from IndexedDB
            await loadMenuFromStorage();
            await loadOrdersFromStorage();
            console.log('✅ IndexedDB data loading completed');
        }
        
        // Load restaurant visibility configuration (async)
        await loadHiddenRestaurants();
        console.log('📋 Current hidden restaurants:', hiddenRestaurants);
        console.log('📋 Total menu items:', menuItems.length);
        console.log('📋 Menu items by restaurant:', menuItems.reduce((acc, item) => {
            const tag = item.tag || 'No Restaurant';
            acc[tag] = (acc[tag] || 0) + 1;
            return acc;
        }, {}));
        
        // Unified rendering (whether using Firebase or IndexedDB)
        console.log('Starting to render menu interface...');
        renderMenu();
        renderSelectedItems();
        renderItemsList();
        renderRestaurantVisibilityControls();
        // Update restaurant filter options after initial render
        updateRestaurantFilter();
        console.log('✅ Page initialization completed');
    
    // Bind events
    document.getElementById('confirmBtn').addEventListener('click', confirmOrder);
    document.getElementById('downloadBtn').addEventListener('click', downloadOrders);
    document.getElementById('backBtn').addEventListener('click', backToMenu);
    document.getElementById('manageBtn').addEventListener('click', showManagePage);
    document.getElementById('viewMenuBtn').addEventListener('click', showMenuPage);
    document.getElementById('viewOrdersBtn').addEventListener('click', showOrdersPage);
    document.getElementById('downloadAllOrdersBtn').addEventListener('click', downloadOrders);
    document.getElementById('backToMenuFromOrdersBtn').addEventListener('click', showMenuPage);
    
    // Bind clear all orders button
    const clearAllOrdersBtn = document.getElementById('clearAllOrdersBtn');
    if (clearAllOrdersBtn) {
        clearAllOrdersBtn.addEventListener('click', clearAllOrders);
    }
    
    // Bind search input event
    const orderSearchInput = document.getElementById('orderSearchInput');
    if (orderSearchInput) {
        orderSearchInput.addEventListener('input', async function(e) {
            await renderAllOrders(e.target.value);
        });
    }
    
    // Bind restaurant filter
    const restaurantFilter = document.getElementById('restaurantFilter');
    if (restaurantFilter) {
        restaurantFilter.addEventListener('change', function(e) {
            renderMenu();
        });
        // Update restaurant filter options
        updateRestaurantFilter();
    }
    
    // Bind add item button
    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Add item button clicked'); // Debug log
            addMenuItem();
        });
    } else {
        console.error('addItemBtn element not found during initialization');
    }
    
    // Bind cancel edit button
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            cancelEdit();
        });
    }
    
    // Bind image upload handler
    const itemImageInput = document.getElementById('itemImage');
    const imageUploadBtn = document.getElementById('imageUploadBtn');
    
    if (itemImageInput) {
        itemImageInput.addEventListener('change', handleImageUpload);
        console.log('Image upload handler bound'); // Debug log
    } else {
        console.error('itemImage element not found during initialization');
    }
    
    // Bind custom upload button
    if (imageUploadBtn) {
        imageUploadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Image upload button clicked'); // Debug log
            if (itemImageInput) {
                itemImageInput.click();
            } else {
                console.error('itemImage input not found');
                alert('Error: File input not found');
            }
        });
        console.log('Image upload button handler bound'); // Debug log
    } else {
        console.error('imageUploadBtn element not found during initialization');
    }
    
    // Name input enter key
    document.getElementById('customerName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            confirmOrder();
        }
    });
    
    // Bind export all data button
    const exportAllDataBtn = document.getElementById('exportAllDataBtn');
    if (exportAllDataBtn) {
        exportAllDataBtn.addEventListener('click', exportAllData);
    }
    
    // Bind import data file input
    const importDataFile = document.getElementById('importDataFile');
    if (importDataFile) {
        importDataFile.addEventListener('change', handleDataImport);
    }
    
    // Save data before page unload to prevent data loss
    window.addEventListener('beforeunload', async function() {
        try {
            await saveMenuToStorage();
            await saveOrdersToStorage();
        } catch (e) {
            console.error('Failed to save data before unload:', e);
        }
    });
    
    // Also save on visibility change (when switching tabs)
    document.addEventListener('visibilitychange', async function() {
        if (document.hidden) {
            try {
                await saveMenuToStorage();
                await saveOrdersToStorage();
            } catch (e) {
                console.error('Failed to save data on visibility change:', e);
            }
        }
    });
    } catch (e) {
        console.error('Failed to initialize application:', e);
        alert('Failed to initialize application. Please refresh the page.');
    }
    
    // Expose functions to global scope for onclick handlers
    window.deleteMenuItem = deleteMenuItem;
    window.deleteOrder = deleteOrder;
    window.clearAllOrders = clearAllOrders;
    window.editMenuItem = editMenuItem;
});

// Show management page
function showManagePage() {
    // Password protection for Manage Menu
    const password = prompt('Please enter password to access Manage Menu:');
    
    if (password === null) {
        // User cancelled
        return;
    }
    
    if (password !== 'ashley') {
        alert('Incorrect password. Access denied.');
        return;
    }
    
    // Password correct, proceed to manage page
    document.getElementById('menuPage').classList.remove('active');
    document.getElementById('summaryPage').classList.remove('active');
    document.getElementById('ordersPage').classList.remove('active');
    document.getElementById('managePage').classList.add('active');
    document.getElementById('manageBtn').style.display = 'none';
    document.getElementById('viewMenuBtn').style.display = 'block';
    renderItemsList();
}

// Show menu page
function showMenuPage() {
    document.getElementById('managePage').classList.remove('active');
    document.getElementById('summaryPage').classList.remove('active');
    document.getElementById('ordersPage').classList.remove('active');
    document.getElementById('menuPage').classList.add('active');
    document.getElementById('manageBtn').style.display = 'block';
    document.getElementById('viewMenuBtn').style.display = 'none';
}

// Show orders page
async function showOrdersPage() {
    document.getElementById('menuPage').classList.remove('active');
    document.getElementById('managePage').classList.remove('active');
    document.getElementById('summaryPage').classList.remove('active');
    document.getElementById('ordersPage').classList.add('active');
    
    // Clear search input when entering orders page
    const orderSearchInput = document.getElementById('orderSearchInput');
    if (orderSearchInput) {
        orderSearchInput.value = '';
    }
    
    await renderAllOrders();
}

// Compress image with comprehensive error handling
// Using smaller default dimensions to prevent memory issues
function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.75) {
    return new Promise((resolve, reject) => {
        try {
            // Check file size first (max 20MB before compression)
            const maxFileSize = 20 * 1024 * 1024; // 20MB
            if (file.size > maxFileSize) {
                reject(new Error('File too large, please select an image smaller than 20MB'));
                return;
            }
            
            const reader = new FileReader();
            
            // Add timeout protection
            const timeout = setTimeout(() => {
                reader.abort();
                reject(new Error('Image read timeout, please try a smaller image'));
            }, 30000); // 30 second timeout
            
            reader.onload = function(e) {
                clearTimeout(timeout);
                try {
                    const img = new Image();
                    
                    // Add image load timeout
                    const imgTimeout = setTimeout(() => {
                        reject(new Error('Image load timeout, please try a different image'));
                    }, 30000);
                    
                    img.onload = function() {
                        clearTimeout(imgTimeout);
                        try {
                            // Check image dimensions to prevent memory issues
                            const maxDimension = 5000; // Max 5000px
                            if (img.width > maxDimension || img.height > maxDimension) {
                                reject(new Error('Image dimensions too large, please use an image smaller than 5000x5000 pixels'));
                                return;
                            }
                            
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;
                            
                            // Calculate new dimensions
                            if (width > height) {
                                if (width > maxWidth) {
                                    height = Math.round((height * maxWidth) / width);
                                    width = maxWidth;
                                }
                            } else {
                                if (height > maxHeight) {
                                    width = Math.round((width * maxHeight) / height);
                                    height = maxHeight;
                                }
                            }
                            
                            // Ensure dimensions are valid
                            if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
                                reject(new Error('Invalid image dimensions'));
                                return;
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            
                            const ctx = canvas.getContext('2d');
                            if (!ctx) {
                                reject(new Error('Unable to create canvas context'));
                                return;
                            }
                            
                            // Draw image with error handling
                            try {
                                ctx.drawImage(img, 0, 0, width, height);
                            } catch (drawError) {
                                reject(new Error('Image drawing failed: ' + drawError.message));
                                return;
                            }
                            
                            // Convert to blob with error handling and mobile fallback
                            // 检查是否支持 toBlob（某些旧版移动浏览器不支持）
                            if (typeof canvas.toBlob === 'function') {
                                // 使用 toBlob（更高效）
                                canvas.toBlob(function(blob) {
                                    try {
                                        if (!blob) {
                                            // 如果 toBlob 失败，回退到 toDataURL
                                            console.warn('toBlob returned null, falling back to toDataURL');
                                            const dataURL = canvas.toDataURL('image/jpeg', quality);
                                            // 检查数据 URL 大小
                                            const dataSize = (dataURL.length * 3) / 4; // 近似大小
                                            const maxSize = 5 * 1024 * 1024; // 5MB
                                            if (dataSize > maxSize) {
                                                // 尝试更低质量
                                                const lowerQualityDataURL = canvas.toDataURL('image/jpeg', 0.6);
                                                const lowerSize = (lowerQualityDataURL.length * 3) / 4;
                                                if (lowerSize <= maxSize) {
                                                    resolve(lowerQualityDataURL);
                                                } else {
                                                    reject(new Error('Image is still too large after compression, please use a smaller image'));
                                                }
                                            } else {
                                                resolve(dataURL);
                                            }
                                            return;
                                        }
                                        
                                        // Check blob size (max 5MB after compression)
                                        const maxBlobSize = 5 * 1024 * 1024; // 5MB
                                        if (blob.size > maxBlobSize) {
                                            // Try with lower quality
                                            canvas.toBlob(function(blob2) {
                                                if (blob2 && blob2.size <= maxBlobSize) {
                                                    const reader2 = new FileReader();
                                                    reader2.onload = function(e2) {
                                                        resolve(e2.target.result);
                                                    };
                                                    reader2.onerror = function(err) {
                                                        reject(new Error('Failed to read image: ' + (err.message || 'Unknown error')));
                                                    };
                                                    reader2.readAsDataURL(blob2);
                                                } else {
                                                    reject(new Error('Image is still too large after compression, please use a smaller image'));
                                                }
                                            }, 'image/jpeg', 0.6);
                                            return;
                                        }
                                        
                                        const reader2 = new FileReader();
                                        reader2.onload = function(e2) {
                                            resolve(e2.target.result);
                                        };
                                        reader2.onerror = function(err) {
                                            reject(new Error('图片读取失败: ' + (err.message || '未知错误')));
                                        };
                                        reader2.readAsDataURL(blob);
                                    } catch (blobError) {
                                        reject(new Error('Image processing failed: ' + blobError.message));
                                    }
                                }, 'image/jpeg', quality);
                            } else {
                                // 回退到 toDataURL（移动端兼容性更好）
                                console.log('toBlob not supported, using toDataURL fallback');
                                try {
                                    const dataURL = canvas.toDataURL('image/jpeg', quality);
                                    // 检查数据 URL 大小（近似）
                                    const dataSize = (dataURL.length * 3) / 4; // Base64 编码大小约为原始大小的 4/3
                                    const maxSize = 5 * 1024 * 1024; // 5MB
                                    
                                    if (dataSize > maxSize) {
                                        // 尝试更低质量
                                        const lowerQualityDataURL = canvas.toDataURL('image/jpeg', 0.6);
                                        const lowerSize = (lowerQualityDataURL.length * 3) / 4;
                                        if (lowerSize <= maxSize) {
                                            resolve(lowerQualityDataURL);
                                        } else {
                                            reject(new Error('图片压缩后仍然太大，请使用更小的图片'));
                                        }
                                    } else {
                                        resolve(dataURL);
                                    }
                                } catch (dataURLError) {
                                    reject(new Error('Image conversion failed: ' + dataURLError.message));
                                }
                            }
                        } catch (imgLoadError) {
                            clearTimeout(imgTimeout);
                            reject(new Error('Image processing error: ' + imgLoadError.message));
                        }
                    };
                    
                    img.onerror = function(err) {
                        clearTimeout(imgTimeout);
                        reject(new Error('Image load failed, please check if the file is corrupted'));
                    };
                    
                    img.src = e.target.result;
                } catch (loadError) {
                    reject(new Error('Image read error: ' + loadError.message));
                }
            };
            
            reader.onerror = function(err) {
                clearTimeout(timeout);
                reject(new Error('File read failed: ' + (err.message || 'Unable to read file, please try again')));
            };
            
            reader.onabort = function() {
                clearTimeout(timeout);
                reject(new Error('File read interrupted'));
            };
            
            reader.readAsDataURL(file);
        } catch (error) {
            reject(new Error('Image processing initialization failed: ' + error.message));
        }
    });
}

// Handle image upload and preview with comprehensive error handling
function handleImageUpload(event) {
    try {
        console.log('=== VERSION 2.0 - handleImageUpload called ==='); // Version marker
        console.log('handleImageUpload called'); // Debug log
        
        const file = event.target.files[0];
        
        if (!file) {
            console.log('No file selected');
            return;
        }
        
        console.log('File selected:', file.name, file.type, file.size); // Debug log
        
        // Update button text to show file name
        const imageUploadBtn = document.getElementById('imageUploadBtn');
        if (imageUploadBtn) {
            const fileName = file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name;
            imageUploadBtn.textContent = `📷 ${fileName}`;
        }
        
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (supported formats: JPG, PNG, GIF, WebP, etc.)');
            event.target.value = '';
            if (imageUploadBtn) {
                imageUploadBtn.textContent = '📷 Click to select image file';
            }
            return;
        }
        
        // Check file size (max 20MB before compression)
        const maxSize = 20 * 1024 * 1024; // 20MB
        if (file.size > maxSize) {
            alert('Image file too large, please select an image smaller than 20MB');
            event.target.value = '';
            if (imageUploadBtn) {
                imageUploadBtn.textContent = '📷 Click to select image file';
            }
            return;
        }
        
        const preview = document.getElementById('imagePreview');
        if (!preview) {
            console.error('imagePreview element not found');
            alert('Error: Preview area not found');
            return;
        }
        
        preview.innerHTML = '<div style="color: #ffffff; padding: 20px; text-align: center;">Processing image...</div>';
        preview.style.display = 'flex'; // Ensure preview is visible
        
        // Compress and preview with error handling
        compressImage(file)
            .then(compressedData => {
                try {
                    console.log('Image compressed successfully, data length:', compressedData ? compressedData.length : 0); // Debug log
                    
                    if (!compressedData) {
                        throw new Error('Compressed image data is empty');
                    }
                    
                    // Create image to check dimensions and display preview
                    const img = new Image();
                    
                    // Add timeout to detect if image fails to load
                    const loadTimeout = setTimeout(() => {
                        console.warn('Image load timeout, displaying directly');
                        // Fallback: display directly without ratio check
                        preview.innerHTML = `<img src="${compressedData}" alt="Preview" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" />`;
                        preview.style.display = 'flex';
                    }, 5000); // 5 second timeout
                    
                    // Set image source with timeout fallback
                    console.log('Setting image source...'); // Debug log
                    
                    img.onload = function() {
                        console.log('=== onload handler started ==='); // Debug log
                        clearTimeout(loadTimeout);
                        try {
                            console.log('Image loaded for preview:', img.width, 'x', img.height); // Debug log
                            
                            // Display preview - use object-fit: contain to show full image
                            console.log('Setting preview HTML...'); // Debug log
                            console.log('Preview element:', preview); // Debug log
                            console.log('Compressed data length:', compressedData.length); // Debug log
                            
                            preview.innerHTML = `<img src="${compressedData}" alt="Preview" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" />`;
                            preview.style.display = 'flex';
                            
                            console.log('Preview HTML set, checking content...'); // Debug log
                            console.log('Preview innerHTML length:', preview.innerHTML.length); // Debug log
                            console.log('Preview display style:', preview.style.display); // Debug log
                            console.log('Preview displayed successfully'); // Debug log
                            
                            // Verify preview element has content
                            setTimeout(() => {
                                if (preview.innerHTML.trim() === '') {
                                    console.error('Preview was cleared unexpectedly');
                                    preview.innerHTML = `<img src="${compressedData}" alt="Preview" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" />`;
                                    preview.style.display = 'flex';
                                }
                            }, 100);
                        } catch (previewError) {
                            clearTimeout(loadTimeout);
                            console.error('=== Preview display error ===');
                            console.error('Error type:', previewError.constructor.name);
                            console.error('Error message:', previewError.message);
                            console.error('Error stack:', previewError.stack);
                            console.error('Full error object:', previewError);
                            alert('Preview display failed: ' + previewError.message + '\n\nPlease check the console for details.');
                            event.target.value = '';
                            preview.innerHTML = '';
                            preview.style.display = 'flex';
                            if (imageUploadBtn) {
                                imageUploadBtn.textContent = '📷 Click to select image file';
                            }
                        } finally {
                            console.log('=== onload handler finished ==='); // Debug log
                        }
                    };
                    
                    img.onerror = function(err) {
                        clearTimeout(loadTimeout);
                        console.error('Image load error:', err);
                        // Fallback: try to display directly anyway
                        console.log('Attempting direct display as fallback');
                        preview.innerHTML = `<img src="${compressedData}" alt="Preview" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" />`;
                        preview.style.display = 'flex';
                        
                        // Check if direct display worked after a short delay
                        setTimeout(() => {
                            const testImg = preview.querySelector('img');
                            if (!testImg || !testImg.complete || testImg.naturalHeight === 0) {
                                alert('Image load failed, please try again. Error: ' + (err.message || 'Unknown error'));
                                event.target.value = '';
                                preview.innerHTML = '';
                                preview.style.display = 'flex';
                                if (imageUploadBtn) {
                                    imageUploadBtn.textContent = '📷 Click to select image file';
                                }
                            }
                        }, 1000);
                    };
                    
                    img.src = compressedData;
                } catch (imgError) {
                    console.error('Image processing error:', imgError);
                    alert('Image processing failed: ' + imgError.message);
                    event.target.value = '';
                    preview.innerHTML = '';
                    preview.style.display = 'flex';
                    if (imageUploadBtn) {
                        imageUploadBtn.textContent = '📷 Click to select image file';
                    }
                }
            })
            .catch(error => {
                console.error('Image compression error:', error);
                const errorMsg = error && error.message ? error.message : 'Unknown error';
                alert('Image processing failed: ' + errorMsg + '\n\nPlease try:\n1. Use a different image format (JPG/PNG)\n2. Reduce image size\n3. Check if the image is corrupted\n4. Use a smaller image file\n\nCheck browser console (F12) for detailed error information');
                event.target.value = '';
                preview.innerHTML = '';
                preview.style.display = 'flex';
                if (imageUploadBtn) {
                    imageUploadBtn.textContent = '📷 Click to select image file';
                }
            });
    } catch (error) {
        console.error('handleImageUpload error:', error);
        alert('Upload processing failed: ' + (error.message || 'Unknown error') + '\n\nPlease refresh the page and try again');
        const imageUploadBtn = document.getElementById('imageUploadBtn');
        if (imageUploadBtn) {
            imageUploadBtn.textContent = '📷 Click to select image file';
        }
        const itemImageInput = document.getElementById('itemImage');
        if (itemImageInput) {
            itemImageInput.value = '';
        }
    }
}

// Edit menu item - fill form with item data
function editMenuItem(itemId) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) {
        alert('Item to edit not found');
        return;
    }
    
    // Set editing mode
    editingItemId = itemId;
    
    // Fill form with item data
    document.getElementById('itemCategory').value = item.category || '';
    document.getElementById('itemName').value = item.name || '';
    document.getElementById('itemTag').value = item.tag || '';
    document.getElementById('itemSubtitle').value = item.subtitle || '';
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('itemPrice').value = item.price || '';
    
    // Display current image
    const preview = document.getElementById('imagePreview');
    if (item.image) {
        preview.innerHTML = `<img src="${item.image}" alt="Preview" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" />`;
        preview.style.display = 'flex';
    } else {
        preview.innerHTML = '';
        preview.style.display = 'flex';
    }
    
    // Clear file input (user needs to select new image if they want to change it)
    document.getElementById('itemImage').value = '';
    
    // Update form title and button
    const formTitle = document.querySelector('.add-item-form h2');
    if (formTitle) {
        formTitle.textContent = 'Edit Item';
    }
    
    const addBtn = document.getElementById('addItemBtn');
    if (addBtn) {
        addBtn.textContent = 'Update Item';
    }
    
    // Show cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.style.display = 'block';
    }
    
    // Scroll to form
    document.querySelector('.add-item-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Refresh items list to show editing state
    renderItemsList();
}

// Cancel editing
function cancelEdit() {
    editingItemId = null;
    
    // Clear form
    document.getElementById('itemCategory').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemTag').value = '';
    document.getElementById('itemSubtitle').value = '';
    document.getElementById('itemDescription').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemImage').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    const imageUploadBtn = document.getElementById('imageUploadBtn');
    if (imageUploadBtn) {
        imageUploadBtn.textContent = '📷 Click to select image file';
    }
    
    // Update form title and button
    const formTitle = document.querySelector('.add-item-form h2');
    if (formTitle) {
        formTitle.textContent = 'Add New Item';
    }
    
    const addBtn = document.getElementById('addItemBtn');
    if (addBtn) {
        addBtn.textContent = 'Add Item';
    }
    
    // Hide cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    
    // Refresh items list
    renderItemsList();
}

// Add new menu item or update existing item
async function addMenuItem() {
    console.log('addMenuItem called'); // Debug log
    
    const category = document.getElementById('itemCategory').value.trim();
    const name = document.getElementById('itemName').value.trim();
    const tag = document.getElementById('itemTag').value.trim();
    const subtitle = document.getElementById('itemSubtitle').value.trim();
    const description = document.getElementById('itemDescription').value.trim();
    const price = document.getElementById('itemPrice').value.trim();
    const imageFile = document.getElementById('itemImage').files[0];
    
    console.log('Form values:', { category, name, tag, price, hasImage: !!imageFile, editingItemId }); // Debug log
    
    if (!category) {
        alert('Please select a category (required)');
        return;
    }
    
    if (!name) {
        alert('Please fill in the required field (name)');
        return;
    }
    
    if (!tag) {
        alert('Please fill in the required field (tag)');
        return;
    }
    
    // Disable button during processing
    const addBtn = document.getElementById('addItemBtn');
    if (!addBtn) {
        console.error('addItemBtn not found!');
        alert('Error: Add button not found');
        return;
    }
    
    const originalText = addBtn.textContent;
    addBtn.disabled = true;
    addBtn.textContent = 'Processing...';
    
    // If editing, update existing item
    if (editingItemId !== null) {
        const itemIndex = menuItems.findIndex(item => item.id === editingItemId);
        if (itemIndex === -1) {
            alert('Item to update not found');
            addBtn.disabled = false;
            addBtn.textContent = originalText;
            return;
        }
        
        // Update item (use existing image if no new image uploaded)
        const updateItem = () => {
            const currentImage = imageFile ? null : menuItems[itemIndex].image;
            
            if (imageFile) {
                // Compress new image
                compressImage(imageFile)
                    .then(compressedData => {
                        menuItems[itemIndex] = {
                            ...menuItems[itemIndex],
                            category: category,
                            name: name,
                            tag: tag,
                            subtitle: subtitle || '',
                            description: description || '',
                            price: price,
                            image: compressedData
                        };
                        
                        saveAndRefresh();
                    })
                    .catch(error => {
                        handleError(error);
                    });
            } else {
                // Use existing image
                menuItems[itemIndex] = {
                    ...menuItems[itemIndex],
                    category: category,
                    name: name,
                    tag: tag,
                    subtitle: subtitle || '',
                    description: description || '',
                    price: price
                };
                
                saveAndRefresh();
            }
        };
        
        const saveAndRefresh = async () => {
            try {
                await saveMenuToStorage();
                console.log('✅ Menu updated in storage:', menuItems.length, 'items');
                console.log('💡 Real-time listener will automatically update the display when Firebase syncs');
                
                // 如果使用 Firebase，等待一下让实时监听有机会触发
                if (USE_FIREBASE) {
                    console.log('⏳ Waiting for real-time sync to trigger...');
                    // 等待 1 秒让实时监听有机会更新
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('✅ Real-time sync should have triggered by now');
                }
                
                // Clear form and exit edit mode
                cancelEdit();
                
                // Refresh displays (实时监听也会触发刷新，但这里确保立即显示)
                console.log('🔄 Rendering menu with', menuItems.length, 'items');
                renderMenu();
                renderItemsList();
                updateRestaurantFilter();
                
                // Re-enable button
                addBtn.disabled = false;
                addBtn.textContent = originalText;
                
                alert('Update successful!');
            } catch (e) {
                addBtn.disabled = false;
                addBtn.textContent = originalText;
                alert('Save failed: ' + (e.message || 'Insufficient storage space. Please delete some menu items or use smaller images.'));
                console.error('❌ Storage error:', e);
            }
        };
        
        const handleError = (error) => {
            console.error('Update item error:', error);
            const errorMsg = error && error.message ? error.message : 'Image processing error';
            alert('Update failed: ' + errorMsg + '\n\nPlease try:\n1. Use a smaller image file\n2. Use JPG or PNG format\n3. Check if the image is corrupted\n4. Refresh the page and try again');
            addBtn.disabled = false;
            addBtn.textContent = originalText;
        };
        
        updateItem();
        return;
    }
    
    // Adding new item - require image
    if (!imageFile) {
        alert('Please upload an image');
        addBtn.disabled = false;
        addBtn.textContent = originalText;
        return;
    }
    
    // Compress and add item with timeout protection
    // 添加超时保护，防止移动端一直显示 Processing
    const OPERATION_TIMEOUT = 60000; // 60秒超时
    let operationCompleted = false;
    
    const timeoutId = setTimeout(() => {
        if (!operationCompleted) {
            operationCompleted = true;
            console.error('❌ Add item operation timeout');
            addBtn.disabled = false;
            addBtn.textContent = originalText;
            alert('Operation timeout, please check your network connection and try again.\n\nIf the problem persists, please try:\n1. Use a smaller image\n2. Switch to WiFi network\n3. Refresh the page and try again');
        }
    }, OPERATION_TIMEOUT);
    
    // 确保按钮状态恢复的辅助函数
    const restoreButton = () => {
        if (!operationCompleted) {
            operationCompleted = true;
            clearTimeout(timeoutId);
            addBtn.disabled = false;
            addBtn.textContent = originalText;
        }
    };
    
    compressImage(imageFile)
        .then(async (compressedData) => {
            if (operationCompleted) return; // 如果已经超时，不再继续
            
            console.log('Image compressed successfully'); // Debug log
            
            const newItem = {
                id: Date.now(),
                category: category,
                name: name,
                tag: tag,
                subtitle: subtitle || '',
                description: description || '',
                price: price,
                image: compressedData
            };
            
            menuItems.push(newItem);
            
            // Try to save to storage with timeout protection
            try {
                // 为 Firebase 保存添加超时保护
                const savePromise = saveMenuToStorage();
                const saveTimeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Save timeout, please check network connection')), 30000)
                );
                
                await Promise.race([savePromise, saveTimeoutPromise]);
                
                if (operationCompleted) {
                    menuItems.pop(); // 如果超时了，移除已添加的项
                    return;
                }
                
                console.log('✅ Menu saved to storage:', menuItems.length, 'items');
                console.log('💡 Real-time listener will automatically update the display when Firebase syncs');
                
                // 如果使用 Firebase，等待一下让实时监听有机会触发
                // Firestore 的实时监听通常在保存后很快触发（通常 < 100ms）
                if (USE_FIREBASE) {
                    console.log('⏳ Waiting for real-time sync to trigger...');
                    // 等待 1 秒让实时监听有机会更新
                    // 实时监听会自动更新 menuItems 和刷新显示
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('✅ Real-time sync should have triggered by now');
                }
            } catch (e) {
                // If storage fails, remove the item and show error
                menuItems.pop();
                restoreButton();
                
                // 移动端特定的错误提示
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                let errorMsg = e.message || 'Save failed';
                
                if (isMobile) {
                    if (errorMsg.includes('timeout') || errorMsg.includes('超时') || errorMsg.includes('network')) {
                        errorMsg = 'Network connection timeout, please check:\n1. WiFi or mobile network connection\n2. Switch to a more stable network\n3. Refresh the page and try again';
                    } else if (errorMsg.includes('permission') || errorMsg.includes('权限')) {
                        errorMsg = 'Permission error, please check Firebase configuration';
                    }
                }
                
                alert('Save failed: ' + errorMsg + '\n\nPlease try:\n1. Use a smaller image file\n2. Check network connection\n3. Refresh the page and try again');
                console.error('❌ Storage error:', e);
                return;
            }
            
            if (operationCompleted) return; // 如果已经超时，不再继续
            
            // Clear form
            document.getElementById('itemCategory').value = '';
            document.getElementById('itemName').value = '';
            document.getElementById('itemSubtitle').value = '';
            document.getElementById('itemDescription').value = '';
            document.getElementById('itemPrice').value = '';
            document.getElementById('itemImage').value = '';
            document.getElementById('imagePreview').innerHTML = '';
            const imageUploadBtn = document.getElementById('imageUploadBtn');
            if (imageUploadBtn) {
                imageUploadBtn.textContent = '📷 Click to select image file';
            }
            
            // Refresh displays
            console.log('🔄 Rendering menu with', menuItems.length, 'items');
            renderMenu();
            renderItemsList();
            updateRestaurantFilter();
            
            // Re-enable button
            restoreButton();
            
            alert('Item added successfully!');
        })
        .catch(error => {
            if (operationCompleted) return; // 如果已经超时，不再处理
            
            console.error('Add item error:', error);
            restoreButton();
            
            // 移动端特定的错误提示
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            let errorMsg = error && error.message ? error.message : 'Image processing error';
            
            if (isMobile) {
                if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
                    errorMsg = 'Image processing timeout, please try using a smaller image';
                } else if (errorMsg.includes('memory') || errorMsg.includes('内存')) {
                    errorMsg = 'Insufficient memory, please use a smaller image';
                } else if (errorMsg.includes('canvas') || errorMsg.includes('context')) {
                    errorMsg = 'Browser does not support image processing, please try another browser';
                }
            }
            
            alert('Add failed: ' + errorMsg + '\n\nPlease try:\n1. Use a smaller image file (recommended less than 5MB)\n2. Use JPG or PNG format\n3. Check if the image is corrupted\n4. Refresh the page and try again');
        });
}

// Delete menu item
async function deleteMenuItem(itemId) {
    if (confirm('Are you sure you want to delete this item?')) {
        menuItems = menuItems.filter(item => item.id !== itemId);
        try {
            await saveMenuToStorage();
            renderMenu();
            renderItemsList();
            updateRestaurantFilter();
        } catch (e) {
            console.error('Failed to delete item:', e);
            alert('Failed to delete item. Please try again.');
        }
    }
}

// Delete order
async function deleteOrder(orderId) {
    if (confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
        console.log('🗑️ Deleting order:', orderId, 'Type:', typeof orderId);
        console.log('📋 Orders before deletion:', allOrders.length);
        console.log('📋 Current order IDs:', allOrders.map(o => ({ id: o.id, type: typeof o.id })));
        
        // Set flag to prevent renderAllOrders from reloading during delete
        window._isDeletingOrder = true;
        
        // Temporarily unsubscribe from real-time updates to prevent override
        let tempUnsubscribe = null;
        if (USE_FIREBASE && unsubscribeOrders) {
            console.log('🔇 Temporarily unsubscribing from real-time updates');
            tempUnsubscribe = unsubscribeOrders;
            unsubscribeOrders();
            unsubscribeOrders = null;
        }
        
        // Filter out the order to delete (handle both string and number ID comparison)
        const orderToDelete = allOrders.find(order => {
            const orderIdStr = String(order.id);
            const targetIdStr = String(orderId);
            return orderIdStr === targetIdStr;
        });
        
        if (!orderToDelete) {
            console.warn('⚠️ Order not found:', orderId);
            window._isDeletingOrder = false;
            // Restore real-time listener if we unsubscribed
            if (tempUnsubscribe && USE_FIREBASE) {
                unsubscribeOrders = subscribeToOrders((orders) => {
                    console.log('🔄 Orders updated via real-time sync:', orders.length, 'orders');
                    allOrders = orders;
                    if (document.getElementById('ordersPage').classList.contains('active')) {
                        renderAllOrders();
                    }
                });
            }
            alert('Order not found. It may have already been deleted.');
            // Reload orders to refresh display
            await loadOrdersFromStorage();
            renderAllOrders();
            return;
        }
        
        console.log('🗑️ Found order to delete:', orderToDelete);
        allOrders = allOrders.filter(order => {
            const orderIdStr = String(order.id);
            const targetIdStr = String(orderId);
            return orderIdStr !== targetIdStr;
        });
        console.log('📋 Orders after deletion:', allOrders.length);
        
        try {
            // Save the updated orders list
            await saveOrdersToStorage();
            console.log('✅ Orders saved after deletion');
            
            // Wait a bit to ensure Firebase sync completes (if using Firebase)
            if (USE_FIREBASE) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Increased wait time
            }
            
            // Restore real-time listener
            if (tempUnsubscribe && USE_FIREBASE) {
                console.log('🔊 Restoring real-time listener');
                unsubscribeOrders = subscribeToOrders((orders) => {
                    console.log('🔄 Orders updated via real-time sync:', orders.length, 'orders');
                    allOrders = orders;
                    if (document.getElementById('ordersPage').classList.contains('active')) {
                        renderAllOrders();
                    }
                });
            }
            
            // Clear the flag
            window._isDeletingOrder = false;
            
            // Render the updated orders list (without reloading from storage)
            renderAllOrders();
            
            console.log('✅ Order deleted successfully');
        } catch (e) {
            console.error('❌ Failed to delete order:', e);
            window._isDeletingOrder = false;
            
            // Restore real-time listener if we unsubscribed
            if (tempUnsubscribe && USE_FIREBASE) {
                unsubscribeOrders = subscribeToOrders((orders) => {
                    console.log('🔄 Orders updated via real-time sync:', orders.length, 'orders');
                    allOrders = orders;
                    if (document.getElementById('ordersPage').classList.contains('active')) {
                        renderAllOrders();
                    }
                });
            }
            
            // Restore the order if save failed
            allOrders.push(orderToDelete);
            alert('Failed to delete order. Please try again.\n\nError: ' + (e.message || e));
            // Reload to show correct state
            await loadOrdersFromStorage();
            renderAllOrders();
        }
    }
}

// Clear all orders
async function clearAllOrders() {
    // Double confirmation for safety
    const firstConfirm = confirm('⚠️ WARNING: This will delete ALL orders permanently!\n\nAre you sure you want to clear all orders?');
    if (!firstConfirm) {
        return;
    }
    
    const secondConfirm = confirm('⚠️ FINAL CONFIRMATION\n\nThis action CANNOT be undone. All order data will be permanently deleted.\n\nClick OK to proceed, or Cancel to abort.');
    if (!secondConfirm) {
        return;
    }
    
    try {
        // Temporarily disable real-time listener to prevent it from reloading data during clear
        let wasListening = false;
        if (USE_FIREBASE && unsubscribeOrders) {
            console.log('🔌 Temporarily disabling real-time listener during clear...');
            unsubscribeOrders();
            unsubscribeOrders = null;
            wasListening = true;
        }
        
        // Clear the local array
        allOrders = [];
        
        // Clear from storage (Firebase or IndexedDB)
        if (USE_FIREBASE) {
            // Clear from Firestore
            await clearAllOrdersFromFirestore();
            console.log('✅ All orders cleared from Firestore');
            
            // Wait a moment to ensure Firestore has processed the deletion
            await new Promise(resolve => setTimeout(resolve, 500));
        } else {
            // Clear from IndexedDB
            if (db) {
                await new Promise((resolve, reject) => {
                    const transaction = db.transaction([STORE_ORDERS], 'readwrite');
                    const store = transaction.objectStore(STORE_ORDERS);
                    const clearRequest = store.clear();
                    
                    clearRequest.onsuccess = () => {
                        console.log('✅ All orders cleared from IndexedDB');
                        resolve();
                    };
                    
                    clearRequest.onerror = () => {
                        console.error('Failed to clear orders from IndexedDB:', clearRequest.error);
                        reject(clearRequest.error);
                    };
                });
            }
        }
        
        // IMPORTANT: Always clear localStorage as well (backup storage)
        // This ensures no old data persists from previous sessions
        localStorage.removeItem('menuOrders');
        console.log('✅ All orders cleared from localStorage');
        
        // Ensure allOrders array is empty before refreshing
        allOrders = [];
        
        // Re-enable real-time listener if it was active
        if (USE_FIREBASE && wasListening) {
            console.log('🔌 Re-enabling real-time listener...');
            unsubscribeOrders = subscribeToOrders((orders) => {
                console.log('🔄 Orders updated via real-time sync:', orders.length, 'orders');
                allOrders = orders;
                // 如果当前在订单页面，刷新显示
                if (document.getElementById('ordersPage').classList.contains('active')) {
                    renderAllOrders();
                }
            });
        }
        
        // Refresh the orders display (it will reload from storage, which should now be empty)
        await renderAllOrders();
        
        // Show success message
        alert('✅ All orders have been cleared successfully!');
    } catch (e) {
        console.error('Failed to clear all orders:', e);
        alert('❌ Failed to clear all orders. Please try again.\n\nError: ' + (e.message || e));
        
        // Re-enable listener even if there was an error
        if (USE_FIREBASE && !unsubscribeOrders) {
            unsubscribeOrders = subscribeToOrders((orders) => {
                console.log('🔄 Orders updated via real-time sync:', orders.length, 'orders');
                allOrders = orders;
                if (document.getElementById('ordersPage').classList.contains('active')) {
                    renderAllOrders();
                }
            });
        }
    }
}

// Render menu items list in management page
function renderItemsList() {
    const container = document.getElementById('itemsList');
    
    if (menuItems.length === 0) {
        container.innerHTML = '<div class="empty-message">No items yet. Add your first item above!</div>';
        return;
    }
    
    container.innerHTML = '';
    
    menuItems.forEach(item => {
        const itemCard = document.createElement('div');
        itemCard.className = 'item-card';
        const isEditing = editingItemId === item.id;
        itemCard.innerHTML = `
            <div class="item-card-image">
                <img src="${item.image || ''}" alt="${item.name}" />
            </div>
            <div class="item-card-info">
                ${item.category ? `<p class="item-category">Category: ${item.category}</p>` : ''}
                <h3>${item.name}</h3>
                ${item.tag ? `<p class="item-tag">🍽️ Restaurant: ${item.tag}</p>` : ''}
                ${item.subtitle ? `<p class="item-subtitle">${item.subtitle}</p>` : ''}
                ${item.description ? `<p class="item-description">${item.description}</p>` : ''}
                ${item.price ? `<p class="item-price">${item.price}</p>` : ''}
            </div>
            <div class="item-card-actions">
                <button class="edit-item-btn" onclick="editMenuItem(${item.id})" ${isEditing ? 'disabled' : ''}>Edit</button>
                <button class="delete-item-btn" onclick="deleteMenuItem(${item.id})" ${isEditing ? 'disabled' : ''}>Delete</button>
            </div>
        `;
        container.appendChild(itemCard);
    });
}

// Render restaurant visibility controls in management page
function renderRestaurantVisibilityControls() {
    const section = document.getElementById('restaurantVisibilitySection');
    if (!section) return;
    
    // Collect unique restaurant names from menu items
    const restaurants = [...new Set(
        menuItems
            .map(item => item.tag)
            .filter(tag => tag && typeof tag === 'string' && tag.trim())
    )].sort();
    
    if (restaurants.length === 0) {
        section.innerHTML = '<h2>Restaurant Visibility</h2>' +
            '<p class="restaurant-visibility-tip">Add menu items with a restaurant name to manage their visibility.</p>' +
            '<div class="empty-message">No restaurants yet.</div>';
        return;
    }
    
    const htmlParts = [];
    htmlParts.push('<h2>Restaurant Visibility</h2>');
    htmlParts.push('<p class="restaurant-visibility-tip">Uncheck a restaurant to hide it and all its dishes from the customer menu and the restaurant filter.</p>');
    htmlParts.push('<div class="restaurant-toggle-list">');
    
    restaurants.forEach(name => {
        const isHidden = isRestaurantHidden(name);
        const encodedName = encodeURIComponent(name);
        htmlParts.push(`
            <label class="restaurant-toggle-item">
                <input type="checkbox" data-restaurant="${encodedName}" ${isHidden ? '' : 'checked'}>
                <span class="restaurant-toggle-name">${name}</span>
                ${isHidden ? '<span class="restaurant-visibility-badge">Hidden</span>' : ''}
            </label>
        `);
    });
    
    htmlParts.push('</div>');
    section.innerHTML = htmlParts.join('');
    
    // Bind change handlers
    const inputs = section.querySelectorAll('input[type="checkbox"][data-restaurant]');
    inputs.forEach(input => {
        input.addEventListener('change', async (e) => {
            const encoded = e.target.getAttribute('data-restaurant');
            const name = decodeURIComponent(encoded || '');
            if (!name) return;
            
            const currentlyHidden = isRestaurantHidden(name);
            const shouldBeVisible = e.target.checked;
            
            console.log('🔄 Restaurant visibility change:', {
                name: name,
                currentlyHidden: currentlyHidden,
                shouldBeVisible: shouldBeVisible,
                currentHiddenList: hiddenRestaurants
            });
            
            if (shouldBeVisible && currentlyHidden) {
                // 移除隐藏状态（使用标准化比较）
                hiddenRestaurants = hiddenRestaurants.filter(r => String(r).trim() !== String(name).trim());
            } else if (!shouldBeVisible && !currentlyHidden) {
                // 添加到隐藏列表（确保不重复）
                const normalizedName = String(name).trim();
                if (!hiddenRestaurants.some(r => String(r).trim() === normalizedName)) {
                    hiddenRestaurants.push(normalizedName);
                }
            }
            
            console.log('✅ Updated hidden restaurants:', hiddenRestaurants);
            
            await saveHiddenRestaurants();
            // Re-render menu and filter based on updated visibility
            renderMenu();
            updateRestaurantFilter();
            // Re-render this section to update badges
            renderRestaurantVisibilityControls();
        });
    });
}

// Render menu
// Update restaurant filter dropdown options
function updateRestaurantFilter() {
    const restaurantFilter = document.getElementById('restaurantFilter');
    if (!restaurantFilter) return;
    
    // Get unique restaurants from menu items, excluding hidden ones
    const restaurants = [...new Set(
        menuItems
            .filter(item => item.tag && !isRestaurantHidden(item.tag))
            .map(item => item.tag)
            .filter(tag => tag && tag.trim())
    )].sort();
    
    // Save current selection
    const currentValue = restaurantFilter.value;
    
    // Clear and add options
    restaurantFilter.innerHTML = '<option value="">All Restaurants</option>';
    restaurants.forEach(restaurant => {
        const option = document.createElement('option');
        option.value = restaurant;
        option.textContent = restaurant;
        restaurantFilter.appendChild(option);
    });
    
    // Restore selection if it still exists
    if (currentValue && restaurants.includes(currentValue)) {
        restaurantFilter.value = currentValue;
    }
}

function renderMenu() {
    const container = document.getElementById('menuContainer');
    if (!container) {
        console.error('menuContainer not found');
        return;
    }
    
    // Get selected restaurant filter
    const restaurantFilter = document.getElementById('restaurantFilter');
    const selectedRestaurant = restaurantFilter ? restaurantFilter.value : '';
    
    // Update restaurant filter options
    updateRestaurantFilter();
    
    // Restore filter selection if still visible
    if (restaurantFilter && selectedRestaurant && !isRestaurantHidden(selectedRestaurant)) {
        restaurantFilter.value = selectedRestaurant;
    }
    
    container.innerHTML = '';
    
    if (menuItems.length === 0) {
        container.innerHTML = '<div class="empty-message" style="padding: 40px; text-align: center; max-width: 600px; margin: 0 auto;">' +
            '<h3 style="color: #4CAF50; margin-bottom: 15px;">📋 Menu is Empty</h3>' +
            '<p style="margin-bottom: 20px; color: #666;">No menu data in Firestore database yet.</p>' +
            '<div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left;">' +
            '<p style="margin-bottom: 10px; font-weight: bold; color: #333;">How to add menu items:</p>' +
            '<ol style="margin-left: 20px; color: #666; line-height: 1.8;">' +
            '<li>Click the <strong>"Manage Menu"</strong> button in the top right</li>' +
            '<li>Click the <strong>"Add Item"</strong> button</li>' +
            '<li>Fill in menu information (name, category, price, etc.)</li>' +
            '<li>Click the <strong>"Add Item"</strong> button</li>' +
            '</ol>' +
            '</div>' +
            '<button onclick="location.reload()" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 10px;">🔄 Refresh Page</button>' +
            '</div>';
        return;
    }
    
    // Filter out items from hidden restaurants
    let filteredItems = menuItems.filter(item => {
        const isHidden = isRestaurantHidden(item.tag);
        if (isHidden) {
            console.log('🚫 Filtering out item from hidden restaurant:', {
                itemName: item.name,
                restaurant: item.tag,
                hiddenRestaurants: hiddenRestaurants
            });
        }
        return !isHidden;
    });
    
    // Filter items by restaurant if filter is selected
    if (selectedRestaurant) {
        filteredItems = filteredItems.filter(item => item.tag === selectedRestaurant);
    }
    
    // Group items by category
    const categories = ['Main Course', 'Salad', 'Snack', 'Drink'];
    const itemsByCategory = {};
    
    // Initialize categories
    categories.forEach(cat => {
        itemsByCategory[cat] = [];
    });
    
    // Group items
    filteredItems.forEach(item => {
        const category = item.category || 'Uncategorized';
        if (categories.includes(category)) {
            if (!itemsByCategory[category]) {
                itemsByCategory[category] = [];
            }
            itemsByCategory[category].push(item);
        }
    });
    
    // Render categories (only if they have items)
    categories.forEach(category => {
        const categoryItems = itemsByCategory[category];
        if (categoryItems.length === 0) {
            return; // Skip empty categories
        }
        
        // Create category section
        const categorySection = document.createElement('div');
        categorySection.className = 'category-section';
        
        const categoryTitle = document.createElement('h2');
        categoryTitle.className = 'category-title';
        categoryTitle.textContent = category;
        categorySection.appendChild(categoryTitle);
        
        const categoryItemsContainer = document.createElement('div');
        categoryItemsContainer.className = 'category-items';
        
        // Render items in this category
        categoryItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'menu-item';
            menuItem.dataset.id = item.id;
            
            const isSelected = selectedItems.some(selected => selected.id === item.id);
            if (isSelected) {
                menuItem.classList.add('selected');
            }
            
            menuItem.innerHTML = `
                ${item.image ? `<div class="menu-item-image"><img src="${item.image}" alt="${item.name}" /></div>` : ''}
                <div class="menu-item-content">
                    <div class="menu-item-name">${item.name}</div>
                    ${item.tag ? `<div class="menu-item-tag">🍽️ Restaurant: ${item.tag}</div>` : ''}
                    ${item.subtitle ? `<div class="menu-item-subtitle">${item.subtitle}</div>` : ''}
                    ${item.description ? `<div class="menu-item-description">${item.description}</div>` : ''}
                    ${item.price ? `<div class="menu-item-price">${item.price}</div>` : ''}
                </div>
            `;
            
            menuItem.addEventListener('click', () => toggleMenuItem(item));
            categoryItemsContainer.appendChild(menuItem);
        });
        
        categorySection.appendChild(categoryItemsContainer);
        container.appendChild(categorySection);
    });
}

// Toggle menu item selection
function toggleMenuItem(item) {
    const index = selectedItems.findIndex(selected => selected.id === item.id);
    
    if (index > -1) {
        // Deselect
        selectedItems.splice(index, 1);
    } else {
        // Select
        selectedItems.push(item);
    }
    
    renderMenu();
    renderSelectedItems();
}

// Render selected items
function renderSelectedItems() {
    const container = document.getElementById('selectedList');
    const confirmBtn = document.getElementById('confirmBtn');
    
    if (!container || !confirmBtn) {
        console.error('Container or confirm button not found');
        return;
    }
    
    if (selectedItems.length === 0) {
        container.innerHTML = '<div class="empty-message">No items selected</div>';
        confirmBtn.disabled = true;
        return;
    }
    
    // 确保按钮始终启用（无论选中多少项）
    confirmBtn.disabled = false;
    container.innerHTML = '';
    
    try {
        selectedItems.forEach(item => {
            const selectedItem = document.createElement('div');
            selectedItem.className = 'selected-item';
            selectedItem.innerHTML = `
                <span class="selected-item-name">${item.name || 'Unknown'}${item.price ? ' - ' + item.price : ''}</span>
                <button class="remove-btn" onclick="removeSelectedItem(${item.id})">Remove</button>
            `;
            container.appendChild(selectedItem);
        });
    } catch (error) {
        console.error('Error rendering selected items:', error);
        // 即使渲染出错，也要确保按钮可用
        confirmBtn.disabled = false;
    }
}

// Remove selected item
function removeSelectedItem(itemId) {
    selectedItems = selectedItems.filter(item => item.id !== itemId);
    renderMenu();
    renderSelectedItems();
}

// Confirm order (with debounce to prevent double clicks)
let isConfirming = false;

async function confirmOrder() {
    // 防抖：如果正在处理，直接返回
    if (isConfirming) {
        console.log('⚠️ Order confirmation already in progress, ignoring duplicate click');
        return;
    }
    
    const customerName = document.getElementById('customerName').value.trim();
    
    if (!customerName) {
        alert('Please enter your name');
        return;
    }
    
    if (selectedItems.length === 0) {
        alert('Please select at least one item');
        return;
    }
    
    isConfirming = true;
    
    // Disable confirm button to prevent double submission
    const confirmBtn = document.getElementById('confirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Saving...';
    }
    
    // Create order with complete item information
    const order = {
        id: Date.now(),
        name: customerName,
        order: selectedItems.map(item => item.name).join(', '),
        items: selectedItems.map(item => ({
            id: item.id,
            category: item.category || '',
            name: item.name,
            tag: item.tag || '',
            subtitle: item.subtitle || '',
            description: item.description || '',
            price: item.price || '',
            image: item.image || ''
        })),
        date: new Date().toLocaleString('en-US')
    };
    
    // Add to orders list
    allOrders.push(order);
    
    // Save to storage (optimized: only save new order if using Firebase)
    let saveSuccess = false;
    try {
        if (USE_FIREBASE && typeof saveSingleOrderToFirestore === 'function') {
            // 只保存新订单，而不是整个订单列表
            await saveSingleOrderToFirestore(order);
            console.log('✅ Order saved successfully to Firestore');
            saveSuccess = true;
        } else {
            // 使用原有的保存方法（IndexedDB 或批量保存）
            await saveOrdersToStorage();
            console.log('✅ Order saved successfully');
            saveSuccess = true;
        }
        
        // Show success message
        if (confirmBtn) {
            confirmBtn.textContent = '✓ Saved!';
            confirmBtn.style.backgroundColor = '#4caf50';
        }
    } catch (e) {
        console.error('Failed to save order:', e);
        
        // 对于 resource-exhausted 错误，订单已经添加到本地列表，可以继续流程
        // 但需要告知用户可能会延迟保存
        if (e.code === 'resource-exhausted') {
            console.warn('⚠️ Resource exhausted, order added to local list, will retry in background');
            // 订单已经添加到 allOrders，即使保存失败也继续流程
            saveSuccess = true;
            
            // 在后台重试保存
            setTimeout(async () => {
                try {
                    if (USE_FIREBASE && typeof saveSingleOrderToFirestore === 'function') {
                        await saveSingleOrderToFirestore(order);
                        console.log('✅ Order saved successfully after retry');
                    }
                } catch (retryError) {
                    console.error('Failed to save order in background retry:', retryError);
                }
            }, 5000);
        } else {
            // 其他错误，显示错误消息但不阻止流程
            let errorMessage = 'Order save failed, but order has been recorded locally';
            if (e.message) {
                errorMessage += ': ' + e.message;
            }
            console.warn(errorMessage);
            // 即使保存失败，订单也已经添加到本地列表，继续流程
            saveSuccess = true;
        }
    }
    
    // 无论保存是否成功，都继续流程（因为订单已经添加到本地列表）
    // Clear current selection
    selectedItems = [];
    document.getElementById('customerName').value = '';
    
    // Re-render
    renderMenu();
    renderSelectedItems();
    
    // Re-enable button
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm';
        confirmBtn.style.backgroundColor = '';
    }
    
    // Reset confirming flag
    isConfirming = false;
    
    // Show summary page
    showSummaryPage();
}

// Show summary page
function showSummaryPage() {
    document.getElementById('menuPage').classList.remove('active');
    document.getElementById('managePage').classList.remove('active');
    document.getElementById('ordersPage').classList.remove('active');
    document.getElementById('summaryPage').classList.add('active');
    document.getElementById('manageBtn').style.display = 'none';
    document.getElementById('viewMenuBtn').style.display = 'none';
    renderSummary();
}

// Back to menu
function backToMenu() {
    document.getElementById('summaryPage').classList.remove('active');
    document.getElementById('ordersPage').classList.remove('active');
    document.getElementById('menuPage').classList.add('active');
    document.getElementById('manageBtn').style.display = 'block';
    document.getElementById('viewMenuBtn').style.display = 'none';
}

// Helper function to get timestamp from order for sorting
function getOrderTimestamp(order) {
    // Priority 1: Use createdAt if it's a Firestore Timestamp
    if (order.createdAt) {
        if (order.createdAt.toMillis) {
            return order.createdAt.toMillis();
        }
        if (order.createdAt.seconds) {
            return order.createdAt.seconds * 1000;
        }
        if (typeof order.createdAt === 'number') {
            return order.createdAt;
        }
    }
    
    // Priority 2: Use id if it's a timestamp
    if (order.id && typeof order.id === 'number') {
        return order.id;
    }
    
    // Priority 3: Try to parse date string
    if (order.date) {
        const parsed = Date.parse(order.date);
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    
    // Fallback: return 0 (will appear first if sorting descending)
    return 0;
}

// Render summary page
function renderSummary() {
    const container = document.getElementById('summaryContent');
    
    if (allOrders.length === 0) {
        container.innerHTML = '<div class="empty-message">No orders yet</div>';
        return;
    }
    
    container.innerHTML = '';
    
    // Sort by timestamp (newest first - descending order)
    const sortedOrders = [...allOrders].sort((a, b) => {
        const timeA = getOrderTimestamp(a);
        const timeB = getOrderTimestamp(b);
        return timeB - timeA; // Descending: newest first
    });
    
    sortedOrders.forEach(order => {
        const orderGroup = document.createElement('div');
        orderGroup.className = 'order-group';
        orderGroup.innerHTML = `
            <div class="order-group-header">
                <div class="order-group-name">${order.name}</div>
                <div class="order-group-date">${order.date}</div>
            </div>
            <ul class="order-items-list">
                ${order.items.map(item => `
                    <li class="order-item">${item.name}${item.price ? ' - ' + item.price : ''}</li>
                `).join('')}
            </ul>
        `;
        container.appendChild(orderGroup);
    });
}

// Render all orders for orders page
async function renderAllOrders(searchKeyword = '') {
    const container = document.getElementById('ordersContent');
    
    // Reload orders from storage to get latest data
    // But skip reload if we're in the middle of a delete operation to avoid overriding the deletion
    if (!window._isDeletingOrder) {
        await loadOrdersFromStorage();
    }
    
    if (allOrders.length === 0) {
        container.innerHTML = '<div class="empty-message">No orders yet</div>';
        return;
    }
    
    container.innerHTML = '';
    
    // Filter orders by name if search keyword is provided
    let filteredOrders = allOrders;
    if (searchKeyword && searchKeyword.trim() !== '') {
        const keyword = searchKeyword.trim().toLowerCase();
        filteredOrders = allOrders.filter(order => 
            order.name.toLowerCase().includes(keyword)
        );
    }
    
    // Sort by timestamp (newest first - descending order)
    const sortedOrders = [...filteredOrders].sort((a, b) => {
        const timeA = getOrderTimestamp(a);
        const timeB = getOrderTimestamp(b);
        return timeB - timeA; // Descending: newest first
    });
    
    // Calculate total orders count (show filtered count if searching)
    const totalOrders = allOrders.length;
    const filteredOrdersCount = filteredOrders.length;
    const totalItems = allOrders.reduce((sum, order) => sum + order.items.length, 0);
    const filteredItems = filteredOrders.reduce((sum, order) => sum + order.items.length, 0);
    
    // Add summary header
    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #4a90e2;';
    
    if (searchKeyword && searchKeyword.trim() !== '') {
        summaryDiv.innerHTML = `
            <div style="color: #ffffff; font-size: 1.2em; margin-bottom: 10px; font-weight: 600;">Order Statistics (Filtered)</div>
            <div style="color: #cccccc; display: flex; gap: 30px; flex-wrap: wrap;">
                <div>Showing: <span style="color: #4a90e2; font-weight: 600;">${filteredOrdersCount}</span> of <span style="color: #888; font-weight: 600;">${totalOrders}</span> orders</div>
                <div>Items: <span style="color: #4a90e2; font-weight: 600;">${filteredItems}</span> of <span style="color: #888; font-weight: 600;">${totalItems}</span></div>
            </div>
        `;
    } else {
        summaryDiv.innerHTML = `
            <div style="color: #ffffff; font-size: 1.2em; margin-bottom: 10px; font-weight: 600;">Order Statistics</div>
            <div style="color: #cccccc; display: flex; gap: 30px; flex-wrap: wrap;">
                <div>Total Orders: <span style="color: #4a90e2; font-weight: 600;">${totalOrders}</span></div>
                <div>Total Items: <span style="color: #4a90e2; font-weight: 600;">${totalItems}</span></div>
            </div>
        `;
    }
    container.appendChild(summaryDiv);
    
    if (sortedOrders.length === 0) {
        container.innerHTML += '<div class="empty-message">No orders found matching your search</div>';
        return;
    }
    
    sortedOrders.forEach(order => {
        const orderGroup = document.createElement('div');
        orderGroup.className = 'order-group';
        const totalPrice = order.items.reduce((sum, item) => {
            const price = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
            return sum + price;
        }, 0);
        
        // Ensure order has an ID (for older orders without ID)
        if (!order.id) {
            order.id = Date.now() + Math.random();
        }
        
        orderGroup.innerHTML = `
            <div class="order-group-header">
                <div class="order-group-name">${order.name}</div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                    <div class="order-group-date">${order.date}</div>
                    <div style="color: #ff6600; font-weight: 600; font-size: 1.1em;">Total: $${totalPrice.toFixed(2)}</div>
                </div>
            </div>
            <ul class="order-items-list">
                ${order.items.map(item => `
                    <li class="order-item">${item.name}${item.price ? ' - ' + item.price : ''}</li>
                `).join('')}
            </ul>
            <div style="display: flex; justify-content: flex-end; margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
                <button class="delete-order-btn" onclick="deleteOrder(${order.id})" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; font-weight: 600;">🗑️ Delete</button>
            </div>
        `;
        container.appendChild(orderGroup);
    });
}

// Download orders data
async function downloadOrders() {
    // Reload orders from storage to get latest data
    await loadOrdersFromStorage();
    
    if (allOrders.length === 0) {
        alert('No order data available');
        return;
    }
    
    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Prepare data with detailed information - one item per row
    const headers = ['Date', 'Customer Name', 'Item Name', 'Item Price', 'Restaurant'];
    const rows = allOrders.flatMap(order => {
        return order.items.map(item => {
            return [
                order.date,
                order.name,
                item.name,
                item.price || '',
                item.tag || ''
            ];
        });
    });
    
    // Convert to HTML table format for Excel (.xls)
    let htmlContent = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    htmlContent += '<head>';
    htmlContent += '<meta charset="UTF-8">';
    htmlContent += '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Orders</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->';
    htmlContent += '</head>';
    htmlContent += '<body>';
    htmlContent += '<table border="1">';
    
    // Add header row
    htmlContent += '<tr>';
    headers.forEach(header => {
        htmlContent += `<th style="background-color: #4CAF50; color: white; font-weight: bold; padding: 8px;">${escapeHtml(header)}</th>`;
    });
    htmlContent += '</tr>';
    
    // Add data rows
    rows.forEach(row => {
        htmlContent += '<tr>';
        row.forEach(cell => {
            htmlContent += `<td style="padding: 5px;">${escapeHtml(String(cell))}</td>`;
        });
        htmlContent += '</tr>';
    });
    
    htmlContent += '</table>';
    htmlContent += '</body>';
    htmlContent += '</html>';
    
    // Create blob with Excel MIME type
    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    
    // Create download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_${new Date().toISOString().split('T')[0]}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up URL object
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Migrate data from localStorage to IndexedDB
async function migrateFromLocalStorage() {
    if (!db) return;
    
    try {
        // Check if migration is needed
        const menuSaved = localStorage.getItem('menuItems');
        const ordersSaved = localStorage.getItem('menuOrders');
        
        if (menuSaved || ordersSaved) {
            // Check if IndexedDB already has data
            const menuCount = await getStoreCount(STORE_MENU);
            const ordersCount = await getStoreCount(STORE_ORDERS);
            
            // Only migrate if IndexedDB is empty
            if (menuCount === 0 && ordersCount === 0) {
                console.log('Migrating data from localStorage to IndexedDB...');
                
                if (menuSaved) {
                    const menuData = JSON.parse(menuSaved);
                    if (menuData.length > 0) {
                        await saveMenuItemsToIndexedDB(menuData);
                        console.log('Migrated', menuData.length, 'menu items');
                    }
                }
                
                if (ordersSaved) {
                    const ordersData = JSON.parse(ordersSaved);
                    if (ordersData.length > 0) {
                        await saveOrdersToIndexedDB(ordersData);
                        console.log('Migrated', ordersData.length, 'orders');
                    }
                }
                
                console.log('Migration completed successfully');
            }
        }
    } catch (e) {
        console.error('Migration error:', e);
    }
}

// Get count of items in a store
function getStoreCount(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve(0);
            return;
        }
        
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const countRequest = store.count();
        
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error);
    });
}

// Save menu items to IndexedDB
async function saveMenuItemsToIndexedDB(items) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        
        const transaction = db.transaction([STORE_MENU], 'readwrite');
        const store = transaction.objectStore(STORE_MENU);
        
        // Clear existing items
        store.clear();
        
        // Add all items
        let completed = 0;
        let hasError = false;
        
        if (items.length === 0) {
            resolve();
            return;
        }
        
        items.forEach(item => {
            const request = store.add(item);
            request.onsuccess = () => {
                completed++;
                if (completed === items.length && !hasError) {
                    resolve();
                }
            };
            request.onerror = () => {
                if (!hasError) {
                    hasError = true;
                    reject(request.error);
                }
            };
        });
    });
}

// Save orders to IndexedDB
async function saveOrdersToIndexedDB(orders) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        
        const transaction = db.transaction([STORE_ORDERS], 'readwrite');
        const store = transaction.objectStore(STORE_ORDERS);
        
        // Clear existing orders
        store.clear();
        
        // Add all orders
        let completed = 0;
        let hasError = false;
        
        if (orders.length === 0) {
            resolve();
            return;
        }
        
        orders.forEach(order => {
            const request = store.add(order);
            request.onsuccess = () => {
                completed++;
                if (completed === orders.length && !hasError) {
                    resolve();
                }
            };
            request.onerror = () => {
                if (!hasError) {
                    hasError = true;
                    reject(request.error);
                }
            };
        });
    });
}

// Save menu to storage (Firebase or IndexedDB)
async function saveMenuToStorage() {
    try {
        if (USE_FIREBASE) {
            // 使用 Firebase
            await saveMenuItemsToFirestore(menuItems);
            console.log('Menu saved to Firestore:', menuItems.length, 'items');
            return true;
        } else {
            // 使用 IndexedDB
            if (!db) {
                console.warn('IndexedDB not available, falling back to localStorage');
                const data = JSON.stringify(menuItems);
                localStorage.setItem('menuItems', data);
                return true;
            }
            
            await saveMenuItemsToIndexedDB(menuItems);
            console.log('Menu saved to IndexedDB:', menuItems.length, 'items');
            return true;
        }
    } catch (e) {
        console.error('Failed to save menu:', e);
        if (!USE_FIREBASE) {
            // Fallback to localStorage only for IndexedDB mode
            try {
                const data = JSON.stringify(menuItems);
                localStorage.setItem('menuItems', data);
                return true;
            } catch (fallbackError) {
                throw new Error('Failed to save menu data');
            }
        } else {
            throw e;
        }
    }
}

// Load menu from storage (Firebase or IndexedDB)
async function loadMenuFromStorage() {
    try {
        if (USE_FIREBASE) {
            // 使用 Firebase
            menuItems = await loadMenuItemsFromFirestore();
            return;
        } else {
            // 使用 IndexedDB
            if (!db) {
                console.warn('IndexedDB not available, loading from localStorage');
                const saved = localStorage.getItem('menuItems');
                if (saved) {
                    menuItems = JSON.parse(saved);
                } else {
                    menuItems = [];
                }
                return;
            }
            
            await new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_MENU], 'readonly');
                const store = transaction.objectStore(STORE_MENU);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    menuItems = request.result || [];
                    console.log('Menu loaded from IndexedDB:', menuItems.length, 'items');
                    resolve();
                };
                
                request.onerror = () => {
                    console.error('Failed to load menu from IndexedDB:', request.error);
                    // Fallback to localStorage
                    const saved = localStorage.getItem('menuItems');
                    if (saved) {
                        menuItems = JSON.parse(saved);
                    } else {
                        menuItems = [];
                    }
                    resolve(); // Still resolve to continue
                };
            });
        }
    } catch (e) {
        console.error('Failed to load menu:', e);
        if (!USE_FIREBASE) {
            // Fallback to localStorage only for IndexedDB mode
            const saved = localStorage.getItem('menuItems');
            if (saved) {
                menuItems = JSON.parse(saved);
            } else {
                menuItems = [];
            }
        } else {
            menuItems = [];
        }
    }
}

// Save orders to storage (Firebase or IndexedDB)
async function saveOrdersToStorage() {
    try {
        if (USE_FIREBASE) {
            // 使用 Firebase
            await saveOrdersToFirestore(allOrders);
            console.log('Orders saved to Firestore:', allOrders.length, 'orders');
            return true;
        } else {
            // 使用 IndexedDB
            if (!db) {
                console.warn('IndexedDB not available, falling back to localStorage');
                const data = JSON.stringify(allOrders);
                localStorage.setItem('menuOrders', data);
                return true;
            }
            
            await saveOrdersToIndexedDB(allOrders);
            console.log('Orders saved to IndexedDB:', allOrders.length, 'orders');
            return true;
        }
    } catch (e) {
        console.error('Failed to save orders:', e);
        if (!USE_FIREBASE) {
            // Fallback to localStorage only for IndexedDB mode
            try {
                const data = JSON.stringify(allOrders);
                localStorage.setItem('menuOrders', data);
                return true;
            } catch (fallbackError) {
                throw new Error('Failed to save orders data');
            }
        } else {
            throw e;
        }
    }
}

// Load orders from storage (Firebase or IndexedDB)
async function loadOrdersFromStorage() {
    try {
        if (USE_FIREBASE) {
            // 使用 Firebase
            allOrders = await loadOrdersFromFirestore();
            return;
        } else {
            // 使用 IndexedDB
            if (!db) {
                console.warn('IndexedDB not available, loading from localStorage');
                const saved = localStorage.getItem('menuOrders');
                if (saved) {
                    allOrders = JSON.parse(saved);
                } else {
                    allOrders = [];
                }
                return;
            }
            
            await new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_ORDERS], 'readonly');
                const store = transaction.objectStore(STORE_ORDERS);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    allOrders = request.result || [];
                    console.log('Orders loaded from IndexedDB:', allOrders.length, 'orders');
                    resolve();
                };
                
                request.onerror = () => {
                    console.error('Failed to load orders from IndexedDB:', request.error);
                    // Fallback to localStorage
                    const saved = localStorage.getItem('menuOrders');
                    if (saved) {
                        allOrders = JSON.parse(saved);
                    } else {
                        allOrders = [];
                    }
                    resolve(); // Still resolve to continue
                };
            });
        }
    } catch (e) {
        console.error('Failed to load orders:', e);
        if (!USE_FIREBASE) {
            // Fallback to localStorage only for IndexedDB mode
            const saved = localStorage.getItem('menuOrders');
            if (saved) {
                allOrders = JSON.parse(saved);
            } else {
                allOrders = [];
            }
        } else {
            allOrders = [];
        }
    }
}

// Export all data (menu items and orders) to JSON file
async function exportAllData() {
    try {
        // Reload data from storage to ensure we have the latest
        await loadMenuFromStorage();
        await loadOrdersFromStorage();
        
        // Prepare export data
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            menuItems: menuItems,
            orders: allOrders
        };
        
        // Convert to JSON
        const jsonData = JSON.stringify(exportData, null, 2);
        
        // Create blob and download
        const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `menu_backup_${new Date().toISOString().split('T')[0]}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up URL object
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        alert(`Export successful!\n\nMenu Items: ${menuItems.length}\nOrders: ${allOrders.length}\n\nFile saved as: menu_backup_${new Date().toISOString().split('T')[0]}.json`);
    } catch (e) {
        console.error('Export failed:', e);
        alert('Export failed: ' + (e.message || 'Unknown error') + '\n\nPlease try again.');
    }
}

// Handle data import from JSON file
function handleDataImport(event) {
    const file = event.target.files[0];
    
    if (!file) {
        return;
    }
    
    // Check file type
    if (!file.name.endsWith('.json')) {
        alert('Please select a valid JSON backup file.');
        event.target.value = '';
        return;
    }
    
    // Read file
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const fileContent = e.target.result;
            const importData = JSON.parse(fileContent);
            
            // Validate data structure
            if (!importData || typeof importData !== 'object') {
                throw new Error('Invalid backup file format');
            }
            
            // Confirm import
            const menuItemsCount = importData.menuItems ? importData.menuItems.length : 0;
            const ordersCount = importData.orders ? importData.orders.length : 0;
            
            const confirmMessage = `Import data from backup?\n\n` +
                `Menu Items: ${menuItemsCount}\n` +
                `Orders: ${ordersCount}\n\n` +
                `⚠️ Warning: This will replace all current data!`;
            
            if (!confirm(confirmMessage)) {
                event.target.value = '';
                return;
            }
            
            // Import menu items
            if (importData.menuItems && Array.isArray(importData.menuItems)) {
                menuItems = importData.menuItems;
                await saveMenuToStorage();
                console.log('Menu items imported:', menuItems.length);
            } else {
                console.warn('No menu items found in backup file');
            }
            
            // Import orders
            if (importData.orders && Array.isArray(importData.orders)) {
                allOrders = importData.orders;
                await saveOrdersToStorage();
                console.log('Orders imported:', allOrders.length);
            } else {
                console.warn('No orders found in backup file');
            }
            
            // Refresh displays
            renderMenu();
            renderItemsList();
            
            // Clear file input
            event.target.value = '';
            
            alert(`Import successful!\n\nMenu Items: ${menuItems.length}\nOrders: ${allOrders.length}\n\nPlease refresh the page to see all changes.`);
        } catch (e) {
            console.error('Import failed:', e);
            alert('Import failed: ' + (e.message || 'Invalid backup file format') + '\n\nPlease make sure you selected a valid backup file exported from this application.');
            event.target.value = '';
        }
    };
    
    reader.onerror = function() {
        alert('Failed to read file. Please try again.');
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

