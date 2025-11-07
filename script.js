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

// Menu items data structure: { id, name, category, subtitle, description, price, image }
let menuItems = [];

// Currently selected items
let selectedItems = [];
// All orders data
let allOrders = [];
// Currently editing item ID (null if not editing)
let editingItemId = null;

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

// 格式化错误信息，提供用户友好的提示
function getErrorMessage(error, dataType) {
    const errorMsg = error.message || String(error);
    let userMsg = `无法加载${dataType}。`;
    
    // 检测常见错误类型
    if (errorMsg.includes('permission') || errorMsg.includes('Permission denied')) {
        userMsg += '<br><br>❌ <strong>权限错误</strong>：Firestore 安全规则可能不允许访问。';
        userMsg += '<br>请检查 Firebase Console → Firestore Database → Rules';
    } else if (errorMsg.includes('network') || errorMsg.includes('Failed to fetch')) {
        userMsg += '<br><br>❌ <strong>网络错误</strong>：无法连接到 Firebase 服务器。';
        userMsg += '<br>请检查：<br>1. 移动网络/WiFi 连接<br>2. 防火墙设置<br>3. VPN 是否影响连接';
    } else if (errorMsg.includes('index')) {
        userMsg += '<br><br>⚠️ <strong>索引缺失</strong>：Firestore 可能需要创建索引。';
        userMsg += '<br>数据仍会加载，但可能较慢。';
    } else if (errorMsg.includes('quota') || errorMsg.includes('quota exceeded')) {
        userMsg += '<br><br>❌ <strong>配额超限</strong>：Firebase 免费额度可能已用完。';
        userMsg += '<br>请检查 Firebase Console 中的使用情况。';
    } else {
        userMsg += '<br><br>错误详情：' + errorMsg;
    }
    
    // 添加移动端特定提示
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        userMsg += '<br><br>📱 <strong>移动端提示</strong>：';
        userMsg += '<br>• 确保使用 HTTPS 访问（Netlify 已自动配置）';
        userMsg += '<br>• 检查移动网络是否允许访问 Firebase';
        userMsg += '<br>• 尝试切换到 WiFi 网络';
    }
    
    return userMsg;
}

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    // 显示加载状态
    const menuContainer = document.getElementById('menuContainer');
    if (menuContainer) {
        menuContainer.innerHTML = '<div class="loading-message">正在加载数据...</div>';
    }
    
    try {
        if (USE_FIREBASE) {
            // 使用 Firebase
            if (typeof firebase === 'undefined') {
                if (menuContainer) {
                    menuContainer.innerHTML = '<div class="error-message">Firebase SDK 未加载。请检查 firebase-config.js 和 index.html 中的 Firebase SDK 引用。</div>';
                }
                alert('Firebase SDK not loaded. Please check firebase-config.js and ensure Firebase SDK is included in index.html');
                return;
            }
            
            try {
                await initFirestore();
                console.log('Firestore initialized');
                
                // 加载初始数据（使用 try-catch 确保单个失败不影响其他）
                let menuLoadError = null;
                try {
                    menuItems = await loadMenuItemsFromFirestore();
                    console.log('Menu items loaded:', menuItems.length, 'items');
                } catch (menuError) {
                    console.error('Failed to load menu items:', menuError);
                    menuItems = [];
                    menuLoadError = menuError;
                    // 显示用户友好的错误提示
                    const errorMsg = getErrorMessage(menuError, '菜单数据');
                    if (menuContainer) {
                        menuContainer.innerHTML = '<div class="error-message">' + errorMsg + 
                            '<br><br><button onclick="location.reload()" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">🔄 重试</button>' +
                            '<br><br><small style="color: #999;">如果问题持续，请检查：<br>1. 网络连接<br>2. Firebase 配置<br>3. Firestore 安全规则</small></div>';
                    }
                }
                
                let ordersLoadError = null;
                try {
                    allOrders = await loadOrdersFromFirestore();
                    console.log('Orders loaded:', allOrders.length, 'orders');
                } catch (ordersError) {
                    console.error('Failed to load orders:', ordersError);
                    allOrders = [];
                    ordersLoadError = ordersError;
                    // 订单加载失败不影响菜单显示，只记录错误
                    console.warn('Orders loading failed:', ordersError.message);
                }
                
                // 如果菜单加载失败，不继续渲染
                if (menuLoadError) {
                    return;
                }
                
                // 设置实时监听
                try {
                    unsubscribeMenuItems = subscribeToMenuItems((items) => {
                        menuItems = items;
                        console.log('Menu items updated via real-time sync:', items.length, 'items');
                        renderMenu();
                        renderItemsList();
                    });
                    
                    unsubscribeOrders = subscribeToOrders((orders) => {
                        allOrders = orders;
                        console.log('Orders updated via real-time sync:', orders.length, 'orders');
                        // 如果当前在订单页面，刷新显示
                        if (document.getElementById('ordersPage').classList.contains('active')) {
                            renderAllOrders();
                        }
                    });
                    
                    console.log('Firebase initialized and real-time sync enabled');
                } catch (subscribeError) {
                    console.error('Failed to set up real-time subscriptions:', subscribeError);
                    console.warn('Continuing without real-time sync');
                }
            } catch (firebaseError) {
                console.error('Firebase initialization failed:', firebaseError);
                const errorMsg = getErrorMessage(firebaseError, 'Firebase 数据库');
                if (menuContainer) {
                    menuContainer.innerHTML = '<div class="error-message">' + errorMsg + 
                        '<br><br><button onclick="location.reload()" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">🔄 重试</button>' +
                        '<br><br><details style="margin-top: 15px;"><summary style="cursor: pointer; color: #4CAF50;">🔍 查看诊断信息</summary><pre style="background: #2a2a2a; padding: 10px; border-radius: 5px; overflow-x: auto; margin-top: 10px; font-size: 12px;">' +
                        'User Agent: ' + navigator.userAgent + '\n' +
                        'URL: ' + window.location.href + '\n' +
                        'Firebase Config: ' + (typeof firebase !== 'undefined' ? '已加载' : '未加载') + '\n' +
                        '错误: ' + firebaseError.message + '\n' +
                        '堆栈: ' + (firebaseError.stack || 'N/A') +
                        '</pre></details></div>';
                } else {
                    alert('无法连接到 Firebase 数据库。\n\n' + errorMsg);
                }
                // 使用空数据继续，避免页面完全无法使用
                menuItems = [];
                allOrders = [];
                return;
            }
        } else {
            // 使用 IndexedDB（本地存储）
            await initDB();
            
            // Migrate data from localStorage to IndexedDB if needed
            await migrateFromLocalStorage();
            
            // Load data from IndexedDB
            await loadMenuFromStorage();
            await loadOrdersFromStorage();
        }
        
        renderMenu();
        renderSelectedItems();
        renderItemsList();
    
    // Bind events
    document.getElementById('confirmBtn').addEventListener('click', confirmOrder);
    document.getElementById('downloadBtn').addEventListener('click', downloadOrders);
    document.getElementById('backBtn').addEventListener('click', backToMenu);
    document.getElementById('manageBtn').addEventListener('click', showManagePage);
    document.getElementById('viewMenuBtn').addEventListener('click', showMenuPage);
    document.getElementById('viewOrdersBtn').addEventListener('click', showOrdersPage);
    document.getElementById('downloadAllOrdersBtn').addEventListener('click', downloadOrders);
    document.getElementById('backToMenuFromOrdersBtn').addEventListener('click', showMenuPage);
    
    // Bind search input event
    const orderSearchInput = document.getElementById('orderSearchInput');
    if (orderSearchInput) {
        orderSearchInput.addEventListener('input', async function(e) {
            await renderAllOrders(e.target.value);
        });
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
});

// Show management page
function showManagePage() {
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
                            
                            // Convert to blob with error handling
                            canvas.toBlob(function(blob) {
                                try {
                                    if (!blob) {
                                        reject(new Error('Image compression failed, please try a different image format'));
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
                                                    reject(new Error('Image read failed: ' + (err.message || 'Unknown error')));
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
                                        reject(new Error('Image read failed: ' + (err.message || 'Unknown error')));
                                    };
                                    reader2.readAsDataURL(blob);
                                } catch (blobError) {
                                    reject(new Error('Image processing failed: ' + blobError.message));
                                }
                            }, 'image/jpeg', quality);
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
    const subtitle = document.getElementById('itemSubtitle').value.trim();
    const description = document.getElementById('itemDescription').value.trim();
    const price = document.getElementById('itemPrice').value.trim();
    const imageFile = document.getElementById('itemImage').files[0];
    
    console.log('Form values:', { category, name, price, hasImage: !!imageFile, editingItemId }); // Debug log
    
    if (!category) {
        alert('Please select a category (required)');
        return;
    }
    
    if (!name) {
        alert('Please fill in the required field (name)');
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
                console.log('Menu updated in storage'); // Debug log
                
                // Clear form and exit edit mode
                cancelEdit();
                
                // Refresh displays
                renderMenu();
                renderItemsList();
                
                // Re-enable button
                addBtn.disabled = false;
                addBtn.textContent = originalText;
                
                alert('Update successful!');
            } catch (e) {
                addBtn.disabled = false;
                addBtn.textContent = originalText;
                alert('Save failed: Insufficient storage space. Please delete some menu items or use smaller images.');
                console.error('Storage error:', e);
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
    
    // Compress and add item
    compressImage(imageFile)
        .then(async (compressedData) => {
            console.log('Image compressed successfully'); // Debug log
            
            const newItem = {
                id: Date.now(),
                category: category,
                name: name,
                subtitle: subtitle || '',
                description: description || '',
                price: price,
                image: compressedData
            };
            
            menuItems.push(newItem);
            
            // Try to save to storage
            try {
                await saveMenuToStorage();
                console.log('Menu saved to storage'); // Debug log
            } catch (e) {
                // If storage fails, remove the item and show error
                menuItems.pop();
                addBtn.disabled = false;
                addBtn.textContent = originalText;
                alert('Save failed: Insufficient storage space. Please delete some menu items or use smaller images.');
                console.error('Storage error:', e);
                return;
            }
            
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
            renderMenu();
            renderItemsList();
            
            // Re-enable button
            addBtn.disabled = false;
            addBtn.textContent = originalText;
            
            alert('Add successful!');
        })
        .catch(error => {
            console.error('Add item error:', error);
            const errorMsg = error && error.message ? error.message : 'Image processing error';
            alert('Add failed: ' + errorMsg + '\n\nPlease try:\n1. Use a smaller image file\n2. Use JPG or PNG format\n3. Check if the image is corrupted\n4. Refresh the page and try again');
            addBtn.disabled = false;
            addBtn.textContent = originalText;
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
        } catch (e) {
            console.error('Failed to delete item:', e);
            alert('Failed to delete item. Please try again.');
        }
    }
}

// Delete order
async function deleteOrder(orderId) {
    if (confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
        allOrders = allOrders.filter(order => order.id !== orderId);
        try {
            await saveOrdersToStorage();
            renderAllOrders();
        } catch (e) {
            console.error('Failed to delete order:', e);
            alert('Failed to delete order. Please try again.');
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

// Render menu
function renderMenu() {
    const container = document.getElementById('menuContainer');
    container.innerHTML = '';
    
    if (menuItems.length === 0) {
        container.innerHTML = '<div class="empty-message">No menu items available. Please add items in the management page.</div>';
        return;
    }
    
    // Group items by category
    const categories = ['Main Course', 'Salad', 'Snack', 'Drink'];
    const itemsByCategory = {};
    
    // Initialize categories
    categories.forEach(cat => {
        itemsByCategory[cat] = [];
    });
    
    // Group items
    menuItems.forEach(item => {
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
    
    if (selectedItems.length === 0) {
        container.innerHTML = '<div class="empty-message">No items selected</div>';
        document.getElementById('confirmBtn').disabled = true;
        return;
    }
    
    document.getElementById('confirmBtn').disabled = false;
    container.innerHTML = '';
    
    selectedItems.forEach(item => {
        const selectedItem = document.createElement('div');
        selectedItem.className = 'selected-item';
        selectedItem.innerHTML = `
            <span class="selected-item-name">${item.name}${item.price ? ' - ' + item.price : ''}</span>
            <button class="remove-btn" onclick="removeSelectedItem(${item.id})">Remove</button>
        `;
        container.appendChild(selectedItem);
    });
}

// Remove selected item
function removeSelectedItem(itemId) {
    selectedItems = selectedItems.filter(item => item.id !== itemId);
    renderMenu();
    renderSelectedItems();
}

// Confirm order
async function confirmOrder() {
    const customerName = document.getElementById('customerName').value.trim();
    
    if (!customerName) {
        alert('Please enter your name');
        return;
    }
    
    if (selectedItems.length === 0) {
        alert('Please select at least one item');
        return;
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
            subtitle: item.subtitle || '',
            description: item.description || '',
            price: item.price || '',
            image: item.image || ''
        })),
        date: new Date().toLocaleString('en-US')
    };
    
    // Add to orders list
    allOrders.push(order);
    
    // Save to IndexedDB (permanent storage)
    try {
        await saveOrdersToStorage();
        console.log('Order saved successfully'); // Debug log
    } catch (e) {
        console.error('Failed to save order:', e);
        alert('Order save failed, please try again');
        return;
    }
    
    // Clear current selection
    selectedItems = [];
    document.getElementById('customerName').value = '';
    
    // Re-render
    renderMenu();
    renderSelectedItems();
    
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

// Render summary page
function renderSummary() {
    const container = document.getElementById('summaryContent');
    
    if (allOrders.length === 0) {
        container.innerHTML = '<div class="empty-message">No orders yet</div>';
        return;
    }
    
    container.innerHTML = '';
    
    // Display in reverse chronological order
    const sortedOrders = [...allOrders].reverse();
    
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
    await loadOrdersFromStorage();
    
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
    
    // Display in reverse chronological order (newest first)
    const sortedOrders = [...filteredOrders].reverse();
    
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
    
    // Prepare CSV data with detailed information
    const csvHeaders = ['Date', 'Customer Name', 'Items', 'Total Price'];
    const csvRows = allOrders.map(order => {
        const itemsList = order.items.map(item => item.price ? `${item.name} (${item.price})` : item.name).join('; ');
        const totalPrice = order.items.reduce((sum, item) => {
            const price = item.price ? parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0 : 0;
            return sum + price;
        }, 0);
        return [
            order.date,
            order.name,
            itemsList,
            `$${totalPrice.toFixed(2)}`
        ];
    });
    
    // Convert to CSV format
    const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    // Add BOM for UTF-8 support
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_${new Date().toISOString().split('T')[0]}.csv`);
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
