// 完整的菜单数据迁移脚本
// 支持从 Firestore 或 JSON 文件迁移数据到 MySQL
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const password = 'Gj9U#ERCarH-SZFGjUpvk9b';

async function migrateMenuData() {
    let conn;
    
    try {
        // 连接数据库
        console.log('🔌 连接 MySQL 数据库...');
        conn = await mysql.createConnection({
            host: process.env.DB_HOST || '116.6.239.70',
            port: parseInt(process.env.DB_PORT) || 20010,
            database: process.env.DB_NAME || 'order_menu',
            user: process.env.DB_USER || 'u_order_menu',
            password: password,
            charset: 'utf8mb4'
        });
        console.log('✅ 数据库连接成功\n');

        // 1. 检查表结构
        console.log('📋 检查表结构...');
        const [menuColumns] = await conn.execute('DESCRIBE menu_items');
        const hasTag = menuColumns.some(col => col.Field === 'tag');
        if (!hasTag) {
            console.log('   ⚠️  添加 tag 列...');
            await conn.execute('ALTER TABLE menu_items ADD COLUMN tag VARCHAR(255) DEFAULT NULL COMMENT "Restaurant name" AFTER name');
            await conn.execute('ALTER TABLE menu_items ADD INDEX idx_tag (tag)');
            console.log('   ✅ tag 列已添加');
        }
        console.log('✅ 表结构检查完成\n');

        // 2. 查找数据源
        console.log('📦 查找数据源...');
        let menuItems = [];
        let orders = [];
        let hiddenRestaurants = [];

        // 检查 JSON 文件
        const jsonFiles = [
            'firestore-export.json',
            'menu-items-export.json',
            'menu-export.json',
            'export-data.json'
        ];

        let jsonData = null;
        for (const file of jsonFiles) {
            if (fs.existsSync(file)) {
                console.log(`   ✅ 找到 JSON 文件: ${file}`);
                try {
                    jsonData = JSON.parse(fs.readFileSync(file, 'utf8'));
                    console.log('   ✅ 成功读取 JSON 文件');
                    break;
                } catch (e) {
                    console.log(`   ⚠️  读取失败: ${e.message}`);
                }
            }
        }

        // 从 JSON 数据提取菜单项
        if (jsonData) {
            // 支持多种 JSON 格式
            if (jsonData.menuItems) {
                menuItems = jsonData.menuItems;
            } else if (jsonData.menu_items) {
                menuItems = jsonData.menu_items;
            } else if (jsonData.items) {
                menuItems = jsonData.items;
            } else if (Array.isArray(jsonData)) {
                menuItems = jsonData;
            }

            if (jsonData.orders) {
                orders = jsonData.orders;
            }

            if (jsonData.settings && jsonData.settings.hiddenRestaurants) {
                hiddenRestaurants = jsonData.settings.hiddenRestaurants.restaurants || [];
            } else if (jsonData.hiddenRestaurants) {
                hiddenRestaurants = jsonData.hiddenRestaurants;
            }
        }

        // 如果没有找到 JSON 文件，尝试从 Firestore 迁移（需要 Firebase Admin SDK）
        if (menuItems.length === 0) {
            console.log('   ℹ️  未找到 JSON 文件，尝试从 Firestore 迁移...');
            try {
                const admin = require('firebase-admin');
                let serviceAccount;
                try {
                    serviceAccount = require('./firebase-service-account-key.json');
                } catch (e) {
                    console.log('   ⚠️  未找到 Firebase 服务账号密钥文件');
                    console.log('   💡 提示：可以使用 quick-migrate.html 在浏览器中迁移数据\n');
                }

                if (serviceAccount) {
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount)
                    });
                    const db = admin.firestore();
                    
                    console.log('   📋 从 Firestore 读取菜单项...');
                    const menuSnapshot = await db.collection('menuItems').get();
                    menuSnapshot.forEach(doc => {
                        const data = doc.data();
                        menuItems.push({
                            id: data.id,
                            category: data.category || null,
                            name: data.name || '',
                            tag: data.tag || data.restaurant || null,
                            subtitle: data.subtitle || null,
                            description: data.description || null,
                            price: data.price || null,
                            image: data.image || null
                        });
                    });
                    console.log(`   ✅ 从 Firestore 读取 ${menuItems.length} 条菜单项`);

                    console.log('   📦 从 Firestore 读取订单...');
                    const ordersSnapshot = await db.collection('orders').get();
                    ordersSnapshot.forEach(doc => {
                        const data = doc.data();
                        orders.push({
                            id: data.id,
                            name: data.name || '',
                            order: data.order || '',
                            items: data.items || [],
                            date: data.date || ''
                        });
                    });
                    console.log(`   ✅ 从 Firestore 读取 ${orders.length} 条订单`);

                    console.log('   ⚙️  从 Firestore 读取设置...');
                    const settingsDoc = await db.collection('settings').doc('hiddenRestaurants').get();
                    if (settingsDoc.exists) {
                        const data = settingsDoc.data();
                        hiddenRestaurants = data.restaurants || [];
                    }
                    console.log(`   ✅ 从 Firestore 读取 ${hiddenRestaurants.length} 个隐藏餐厅设置`);
                }
            } catch (e) {
                console.log(`   ⚠️  Firestore 迁移失败: ${e.message}`);
            }
        }

        console.log(`\n📊 数据统计:`);
        console.log(`   - 菜单项: ${menuItems.length} 条`);
        console.log(`   - 订单: ${orders.length} 条`);
        console.log(`   - 隐藏餐厅: ${hiddenRestaurants.length} 个\n`);

        // 3. 迁移菜单项
        if (menuItems.length > 0) {
            console.log('📋 开始迁移菜单项...');
            await conn.beginTransaction();
            try {
                let successCount = 0;
                let skipCount = 0;

                for (const item of menuItems) {
                    // 将 restaurant 映射到 tag（如果存在）
                    const tag = item.restaurant || item.tag || null;
                    
                    // 处理 ID
                    let mysqlId = null;
                    if (item.id !== undefined && item.id !== null) {
                        const idNum = parseInt(item.id);
                        if (!isNaN(idNum) && idNum > 0 && idNum <= 2147483647) {
                            mysqlId = idNum;
                        }
                    }
                    
                    try {
                        if (mysqlId !== null) {
                            // 尝试使用指定 ID
                            await conn.execute(
                                `INSERT INTO menu_items (id, category, name, tag, subtitle, description, price, image) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                 ON DUPLICATE KEY UPDATE 
                                 category = VALUES(category),
                                 name = VALUES(name),
                                 tag = VALUES(tag),
                                 subtitle = VALUES(subtitle),
                                 description = VALUES(description),
                                 price = VALUES(price),
                                 image = VALUES(image)`,
                                [
                                    mysqlId,
                                    item.category || null,
                                    item.name || '',
                                    tag,
                                    item.subtitle || null,
                                    item.description || null,
                                    item.price || null,
                                    item.image || null
                                ]
                            );
                        } else {
                            // 使用自动生成的 ID
                            await conn.execute(
                                `INSERT INTO menu_items (category, name, tag, subtitle, description, price, image) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    item.category || null,
                                    item.name || '',
                                    tag,
                                    item.subtitle || null,
                                    item.description || null,
                                    item.price || null,
                                    item.image || null
                                ]
                            );
                        }
                        successCount++;
                    } catch (error) {
                        if (error.code === 'ER_DUP_ENTRY') {
                            skipCount++;
                            // 跳过重复项
                        } else if (error.message.includes('Out of range')) {
                            // ID 超出范围，使用自动生成
                            try {
                                await conn.execute(
                                    `INSERT INTO menu_items (category, name, tag, subtitle, description, price, image) 
                                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        item.category || null,
                                        item.name || '',
                                        tag,
                                        item.subtitle || null,
                                        item.description || null,
                                        item.price || null,
                                        item.image || null
                                    ]
                                );
                                successCount++;
                            } catch (e) {
                                console.log(`   ⚠️  跳过菜单项: ${item.name || item.id} - ${e.message}`);
                                skipCount++;
                            }
                        } else {
                            console.log(`   ⚠️  跳过菜单项: ${item.name || item.id} - ${error.message}`);
                            skipCount++;
                        }
                    }
                }

                await conn.commit();
                console.log(`✅ 菜单项迁移完成:`);
                console.log(`   - 成功: ${successCount} 条`);
                console.log(`   - 跳过: ${skipCount} 条\n`);
            } catch (error) {
                await conn.rollback();
                throw error;
            }
        } else {
            console.log('⚠️  没有菜单项需要迁移\n');
        }

        // 4. 迁移订单
        if (orders.length > 0) {
            console.log('📦 开始迁移订单...');
            await conn.beginTransaction();
            try {
                let successCount = 0;
                let skipCount = 0;

                for (const order of orders) {
                    let mysqlId = null;
                    if (order.id !== undefined && order.id !== null) {
                        const idNum = parseInt(order.id);
                        if (!isNaN(idNum) && idNum > 0 && idNum <= 2147483647) {
                            mysqlId = idNum;
                        }
                    }
                    
                    try {
                        if (mysqlId !== null) {
                            await conn.execute(
                                `INSERT INTO orders (id, name, \`order\`, items, date) 
                                 VALUES (?, ?, ?, ?, ?)
                                 ON DUPLICATE KEY UPDATE 
                                 name = VALUES(name),
                                 \`order\` = VALUES(\`order\`),
                                 items = VALUES(items),
                                 date = VALUES(date)`,
                                [
                                    mysqlId,
                                    order.name || '',
                                    order.order || '',
                                    JSON.stringify(order.items || []),
                                    order.date || new Date().toLocaleString('en-US')
                                ]
                            );
                        } else {
                            await conn.execute(
                                `INSERT INTO orders (name, \`order\`, items, date) 
                                 VALUES (?, ?, ?, ?)`,
                                [
                                    order.name || '',
                                    order.order || '',
                                    JSON.stringify(order.items || []),
                                    order.date || new Date().toLocaleString('en-US')
                                ]
                            );
                        }
                        successCount++;
                    } catch (error) {
                        if (error.code === 'ER_DUP_ENTRY') {
                            skipCount++;
                        } else {
                            console.log(`   ⚠️  跳过订单: ${order.name || order.id} - ${error.message}`);
                            skipCount++;
                        }
                    }
                }

                await conn.commit();
                console.log(`✅ 订单迁移完成:`);
                console.log(`   - 成功: ${successCount} 条`);
                console.log(`   - 跳过: ${skipCount} 条\n`);
            } catch (error) {
                await conn.rollback();
                throw error;
            }
        } else {
            console.log('⚠️  没有订单需要迁移\n');
        }

        // 5. 迁移设置
        if (hiddenRestaurants.length > 0 || true) {
            console.log('⚙️  更新隐藏餐厅设置...');
            await conn.execute(
                `INSERT INTO settings (\`key\`, value) 
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
                ['hiddenRestaurants', JSON.stringify(hiddenRestaurants)]
            );
            console.log(`✅ 隐藏餐厅设置已更新: ${hiddenRestaurants.length} 个\n`);
        }

        // 6. 验证最终数据
        console.log('📊 验证最终数据...');
        const [finalMenuCount] = await conn.execute('SELECT COUNT(*) as count FROM menu_items');
        const [finalOrderCount] = await conn.execute('SELECT COUNT(*) as count FROM orders');
        const [menuSample] = await conn.execute('SELECT id, name, tag FROM menu_items ORDER BY id DESC LIMIT 10');
        const [restaurants] = await conn.execute('SELECT DISTINCT tag FROM menu_items WHERE tag IS NOT NULL ORDER BY tag');

        console.log(`   - 菜单项总数: ${finalMenuCount[0].count} 条`);
        console.log(`   - 订单总数: ${finalOrderCount[0].count} 条`);
        console.log(`   - 餐厅数量: ${restaurants.length} 个`);
        
        if (menuSample.length > 0) {
            console.log('\n   📋 最新菜单项示例:');
            menuSample.forEach((item, i) => {
                console.log(`      ${i+1}. ID: ${item.id}, 名称: ${item.name}, 餐厅: ${item.tag || '未设置'}`);
            });
        }

        if (restaurants.length > 0) {
            console.log('\n   🏪 餐厅列表:');
            restaurants.forEach((r, i) => {
                console.log(`      ${i+1}. ${r.tag}`);
            });
        }

        await conn.end();
        console.log('\n✅ 迁移完成！');
        
    } catch (error) {
        if (conn) {
            await conn.rollback();
        }
        console.error('\n❌ 迁移失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// 运行迁移
migrateMenuData()
    .then(() => {
        console.log('\n🎉 所有操作完成！');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 发生错误:', error.message);
        process.exit(1);
    });

