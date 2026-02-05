// 修复表结构并迁移菜单数据
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    try {
        const password = 'Gj9U#ERCarH-SZFGjUpvk9b';
        
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || '116.6.239.70',
            port: parseInt(process.env.DB_PORT) || 20010,
            database: process.env.DB_NAME || 'order_menu',
            user: process.env.DB_USER || 'u_order_menu',
            password: password,
            charset: 'utf8mb4'
        });

        console.log('✅ 数据库连接成功！\n');

        // 1. 检查并修复表结构
        console.log('📋 步骤 1: 检查表结构...');
        
        // 检查 menu_items 表是否有 restaurant 列
        const [menuColumns] = await conn.execute('DESCRIBE menu_items');
        const hasRestaurant = menuColumns.some(col => col.Field === 'restaurant');
        const hasTag = menuColumns.some(col => col.Field === 'tag');
        
        console.log(`   - menu_items 表有 restaurant 列: ${hasRestaurant}`);
        console.log(`   - menu_items 表有 tag 列: ${hasTag}`);
        
        if (!hasTag) {
            console.log('   ⚠️  添加 tag 列...');
            await conn.execute('ALTER TABLE menu_items ADD COLUMN tag VARCHAR(255) DEFAULT NULL COMMENT "Restaurant name" AFTER name');
            await conn.execute('ALTER TABLE menu_items ADD INDEX idx_tag (tag)');
            console.log('   ✅ tag 列已添加');
        }
        
        // 检查 settings 表结构
        const [settingsColumns] = await conn.execute('DESCRIBE settings');
        const hasKey = settingsColumns.some(col => col.Field === 'key');
        const hasSettingKey = settingsColumns.some(col => col.Field === 'setting_key');
        
        console.log(`   - settings 表有 key 列: ${hasKey}`);
        console.log(`   - settings 表有 setting_key 列: ${hasSettingKey}`);
        
        if (hasSettingKey && !hasKey) {
            console.log('   ⚠️  修复 settings 表列名...');
            await conn.execute('ALTER TABLE settings CHANGE COLUMN setting_key `key` VARCHAR(100) NOT NULL');
            await conn.execute('ALTER TABLE settings CHANGE COLUMN setting_value value JSON DEFAULT NULL');
            console.log('   ✅ settings 表列名已修复');
        }
        
        console.log('✅ 表结构检查完成\n');

        // 2. 检查当前数据
        console.log('📋 步骤 2: 检查当前数据...');
        const [menuCount] = await conn.execute('SELECT COUNT(*) as count FROM menu_items');
        const [orderCount] = await conn.execute('SELECT COUNT(*) as count FROM orders');
        console.log(`   - 菜单项: ${menuCount[0].count} 条`);
        console.log(`   - 订单: ${orderCount[0].count} 条`);
        console.log('');

        // 3. 如果有 Firestore 数据文件，执行迁移
        console.log('📋 步骤 3: 检查是否有 Firestore 数据需要迁移...');
        const fs = require('fs');
        const firestoreDataFiles = [
            'firestore-export.json',
            'firestore-data.json',
            'menu-export.json'
        ];
        
        let firestoreData = null;
        for (const file of firestoreDataFiles) {
            if (fs.existsSync(file)) {
                console.log(`   ✅ 找到数据文件: ${file}`);
                try {
                    firestoreData = JSON.parse(fs.readFileSync(file, 'utf8'));
                    console.log(`   ✅ 成功读取数据文件`);
                    break;
                } catch (e) {
                    console.log(`   ⚠️  读取文件失败: ${e.message}`);
                }
            }
        }
        
        if (!firestoreData) {
            console.log('   ℹ️  未找到 Firestore 数据文件');
            console.log('   ℹ️  如果需要迁移，请先导出 Firestore 数据\n');
        } else {
            console.log('   📦 开始迁移数据...\n');
            
            // 迁移菜单项
            if (firestoreData.menuItems || firestoreData.menu_items) {
                const menuItems = firestoreData.menuItems || firestoreData.menu_items || [];
                console.log(`   📋 找到 ${menuItems.length} 条菜单项`);
                
                if (menuItems.length > 0) {
                    await conn.beginTransaction();
                    try {
                        // 使用迁移模式（不删除现有数据）
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
                            
                            if (mysqlId !== null) {
                                try {
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
                                } catch (error) {
                                    if (error.code === 'ER_DUP_ENTRY' || error.message.includes('Out of range')) {
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
                                    } else {
                                        throw error;
                                    }
                                }
                            } else {
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
                        }
                        await conn.commit();
                        console.log(`   ✅ 成功迁移 ${menuItems.length} 条菜单项\n`);
                    } catch (error) {
                        await conn.rollback();
                        throw error;
                    }
                }
            }
            
            // 迁移订单
            if (firestoreData.orders) {
                const orders = firestoreData.orders || [];
                console.log(`   📦 找到 ${orders.length} 条订单`);
                
                if (orders.length > 0) {
                    await conn.beginTransaction();
                    try {
                        for (const order of orders) {
                            let mysqlId = null;
                            if (order.id !== undefined && order.id !== null) {
                                const idNum = parseInt(order.id);
                                if (!isNaN(idNum) && idNum > 0 && idNum <= 2147483647) {
                                    mysqlId = idNum;
                                }
                            }
                            
                            if (mysqlId !== null) {
                                try {
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
                                            order.date || ''
                                        ]
                                    );
                                } catch (error) {
                                    if (error.code === 'ER_DUP_ENTRY' || error.message.includes('Out of range')) {
                                        await conn.execute(
                                            `INSERT INTO orders (name, \`order\`, items, date) 
                                             VALUES (?, ?, ?, ?)`,
                                            [
                                                order.name || '',
                                                order.order || '',
                                                JSON.stringify(order.items || []),
                                                order.date || ''
                                            ]
                                        );
                                    } else {
                                        throw error;
                                    }
                                }
                            } else {
                                await conn.execute(
                                    `INSERT INTO orders (name, \`order\`, items, date) 
                                     VALUES (?, ?, ?, ?)`,
                                    [
                                        order.name || '',
                                        order.order || '',
                                        JSON.stringify(order.items || []),
                                        order.date || ''
                                    ]
                                );
                            }
                        }
                        await conn.commit();
                        console.log(`   ✅ 成功迁移 ${orders.length} 条订单\n`);
                    } catch (error) {
                        await conn.rollback();
                        throw error;
                    }
                }
            }
        }

        // 4. 验证最终数据
        console.log('📋 步骤 4: 验证最终数据...');
        const [finalMenuCount] = await conn.execute('SELECT COUNT(*) as count FROM menu_items');
        const [finalOrderCount] = await conn.execute('SELECT COUNT(*) as count FROM orders');
        const [menuSample] = await conn.execute('SELECT id, name, tag FROM menu_items LIMIT 5');
        
        console.log(`   - 菜单项总数: ${finalMenuCount[0].count} 条`);
        console.log(`   - 订单总数: ${finalOrderCount[0].count} 条`);
        console.log('\n   📋 菜单项示例:');
        menuSample.forEach((item, i) => {
            console.log(`      ${i+1}. ID: ${item.id}, 名称: ${item.name}, 餐厅: ${item.tag || '未设置'}`);
        });
        
        // 检查餐厅列表
        const [restaurants] = await conn.execute('SELECT DISTINCT tag FROM menu_items WHERE tag IS NOT NULL ORDER BY tag');
        console.log(`\n   🏪 餐厅列表 (${restaurants.length} 个):`);
        restaurants.forEach((r, i) => {
            console.log(`      ${i+1}. ${r.tag}`);
        });

        await conn.end();
        console.log('\n✅ 修复和迁移完成！');
    } catch (e) {
        console.error('❌ 错误:', e.message);
        if (e.stack) {
            console.error(e.stack);
        }
        process.exit(1);
    }
})();

