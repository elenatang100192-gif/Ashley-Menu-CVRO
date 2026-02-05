// 检查 MySQL 数据库中的菜单数据
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

        // 查看所有表
        const [tables] = await conn.execute('SHOW TABLES');
        console.log('📋 数据库中的表:');
        tables.forEach(t => console.log(`  - ${Object.values(t)[0]}`));
        console.log('');

        // 查看 menu_items 表结构
        const [menuColumns] = await conn.execute('DESCRIBE menu_items');
        console.log('📋 menu_items 表结构:');
        menuColumns.forEach(col => {
            console.log(`  - ${col.Field} (${col.Type})`);
        });
        console.log('');

        // 查看 orders 表结构
        const [orderColumns] = await conn.execute('DESCRIBE orders');
        console.log('📋 orders 表结构:');
        orderColumns.forEach(col => {
            console.log(`  - ${col.Field} (${col.Type})`);
        });
        console.log('');

        // 查看 settings 表结构
        const [settingsColumns] = await conn.execute('DESCRIBE settings');
        console.log('📋 settings 表结构:');
        settingsColumns.forEach(col => {
            console.log(`  - ${col.Field} (${col.Type})`);
        });
        console.log('');

        // 查询菜单项总数
        const [rows] = await conn.execute('SELECT COUNT(*) as count FROM menu_items');
        console.log('📊 菜单项总数:', rows[0].count);

        if (rows[0].count > 0) {
            // 查询所有菜单数据
            const [items] = await conn.execute('SELECT * FROM menu_items LIMIT 5');
            console.log('\n📋 前5条菜单数据:');
            items.forEach((item, i) => {
                const keys = Object.keys(item);
                console.log(`\n${i+1}. 记录详情:`);
                keys.forEach(key => {
                    const value = item[key];
                    if (key === 'image' && value && value.length > 50) {
                        console.log(`   ${key}: ${value.substring(0, 50)}... (${value.length} 字符)`);
                    } else {
                        console.log(`   ${key}: ${value}`);
                    }
                });
            });
        }

        // 查询订单数据
        const [orders] = await conn.execute('SELECT COUNT(*) as count FROM orders');
        console.log('\n📦 订单总数:', orders[0].count);

        // 查询设置数据
        const [settings] = await conn.execute('SELECT * FROM settings LIMIT 5');
        console.log('\n⚙️  settings 表数据:');
        if (settings.length > 0) {
            settings.forEach((s, i) => {
                console.log(`${i+1}.`, s);
            });
        } else {
            console.log('  无数据');
        }

        await conn.end();
    } catch (e) {
        console.error('❌ 查询失败:', e.message);
        process.exit(1);
    }
})();
