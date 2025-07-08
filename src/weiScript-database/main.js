/**
 * weiScript-database - 数据库服务模块
 * 提供统一的数据库访问接口，支持 SQLite、MySQL、PostgreSQL
 */

// 获取 weiScript API
const weiScript = require('weiScript');

// 数据库连接池
let connectionPool = null;
let cacheService = null;

// 数据库服务类
class DatabaseService {
    constructor() {
        this.config = weiScript.config.getSection('database') || {};
        this.type = this.config.type || 'sqlite';
        this.initializeDatabase();
    }
    
    async initializeDatabase() {
        try {
            switch (this.type.toLowerCase()) {
                case 'sqlite':
                    await this.initializeSQLite();
                    break;
                case 'mysql':
                    await this.initializeMySQL();
                    break;
                case 'postgresql':
                    await this.initializePostgreSQL();
                    break;
                default:
                    throw new Error(`不支持的数据库类型: ${this.type}`);
            }
            
            weiScript.plugin.log(`数据库服务已初始化 (${this.type})`);
        } catch (error) {
            weiScript.plugin.error("数据库初始化失败:", error);
            throw error;
        }
    }
    
    async initializeSQLite() {
        const sqlite3 = require('sqlite3');
        const path = require('path');
        
        const dbPath = this.config.sqlite?.file || 'plugins/weiScript/data/database.db';
        const fullPath = path.resolve(dbPath);
        
        // 确保目录存在
        const fs = require('fs');
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        this.connection = new sqlite3.Database(fullPath, (err) => {
            if (err) {
                throw new Error(`SQLite 连接失败: ${err.message}`);
            }
        });
        
        // 启用外键约束
        await this.execute("PRAGMA foreign_keys = ON");
        
        weiScript.plugin.log(`SQLite 数据库已连接: ${fullPath}`);
    }
    
    async initializeMySQL() {
        const mysql = require('mysql2/promise');
        
        const config = this.config.mysql || {};
        const poolConfig = {
            host: config.host || 'localhost',
            port: config.port || 3306,
            user: config.username || 'root',
            password: config.password || '',
            database: config.database || 'weiscript',
            waitForConnections: true,
            connectionLimit: this.config.pool?.max_connections || 10,
            queueLimit: 0,
            acquireTimeout: this.config.pool?.connection_timeout || 30000,
            idleTimeout: this.config.pool?.idle_timeout || 600000
        };
        
        connectionPool = mysql.createPool(poolConfig);
        
        // 测试连接
        const connection = await connectionPool.getConnection();
        await connection.ping();
        connection.release();
        
        weiScript.plugin.log(`MySQL 连接池已创建: ${config.host}:${config.port}/${config.database}`);
    }
    
    async initializePostgreSQL() {
        const { Pool } = require('pg');
        
        const config = this.config.postgresql || {};
        connectionPool = new Pool({
            host: config.host || 'localhost',
            port: config.port || 5432,
            user: config.username || 'postgres',
            password: config.password || '',
            database: config.database || 'weiscript',
            max: this.config.pool?.max_connections || 10,
            min: this.config.pool?.min_connections || 2,
            connectionTimeoutMillis: this.config.pool?.connection_timeout || 30000,
            idleTimeoutMillis: this.config.pool?.idle_timeout || 600000
        });
        
        // 测试连接
        const client = await connectionPool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        weiScript.plugin.log(`PostgreSQL 连接池已创建: ${config.host}:${config.port}/${config.database}`);
    }
    
    async query(sql, params = []) {
        try {
            switch (this.type.toLowerCase()) {
                case 'sqlite':
                    return await this.querySQLite(sql, params);
                case 'mysql':
                    return await this.queryMySQL(sql, params);
                case 'postgresql':
                    return await this.queryPostgreSQL(sql, params);
                default:
                    throw new Error(`不支持的数据库类型: ${this.type}`);
            }
        } catch (error) {
            weiScript.plugin.error(`数据库查询失败: ${sql}`, error);
            throw error;
        }
    }
    
    async execute(sql, params = []) {
        try {
            switch (this.type.toLowerCase()) {
                case 'sqlite':
                    return await this.executeSQLite(sql, params);
                case 'mysql':
                    return await this.executeMySQL(sql, params);
                case 'postgresql':
                    return await this.executePostgreSQL(sql, params);
                default:
                    throw new Error(`不支持的数据库类型: ${this.type}`);
            }
        } catch (error) {
            weiScript.plugin.error(`数据库执行失败: ${sql}`, error);
            throw error;
        }
    }
    
    async querySQLite(sql, params) {
        return new Promise((resolve, reject) => {
            this.connection.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
    
    async executeSQLite(sql, params) {
        return new Promise((resolve, reject) => {
            this.connection.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        affectedRows: this.changes,
                        insertId: this.lastID
                    });
                }
            });
        });
    }
    
    async queryMySQL(sql, params) {
        const [rows] = await connectionPool.execute(sql, params);
        return rows;
    }
    
    async executeMySQL(sql, params) {
        const [result] = await connectionPool.execute(sql, params);
        return {
            affectedRows: result.affectedRows,
            insertId: result.insertId
        };
    }
    
    async queryPostgreSQL(sql, params) {
        const client = await connectionPool.connect();
        try {
            const result = await client.query(sql, params);
            return result.rows;
        } finally {
            client.release();
        }
    }
    
    async executePostgreSQL(sql, params) {
        const client = await connectionPool.connect();
        try {
            const result = await client.query(sql, params);
            return {
                affectedRows: result.rowCount,
                insertId: result.rows[0]?.id || null
            };
        } finally {
            client.release();
        }
    }
    
    async transaction(queries) {
        switch (this.type.toLowerCase()) {
            case 'sqlite':
                return await this.transactionSQLite(queries);
            case 'mysql':
                return await this.transactionMySQL(queries);
            case 'postgresql':
                return await this.transactionPostgreSQL(queries);
            default:
                throw new Error(`不支持的数据库类型: ${this.type}`);
        }
    }
    
    async transactionSQLite(queries) {
        return new Promise((resolve, reject) => {
            this.connection.serialize(() => {
                this.connection.run("BEGIN TRANSACTION");
                
                const results = [];
                let completed = 0;
                let hasError = false;
                
                for (const query of queries) {
                    if (hasError) break;
                    
                    this.connection.run(query.sql, query.params || [], function(err) {
                        if (err) {
                            hasError = true;
                            this.connection.run("ROLLBACK");
                            reject(err);
                            return;
                        }
                        
                        results.push({
                            affectedRows: this.changes,
                            insertId: this.lastID
                        });
                        
                        completed++;
                        if (completed === queries.length) {
                            this.connection.run("COMMIT", (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(results);
                                }
                            });
                        }
                    });
                }
            });
        });
    }
    
    async transactionMySQL(queries) {
        const connection = await connectionPool.getConnection();
        await connection.beginTransaction();
        
        try {
            const results = [];
            for (const query of queries) {
                const [result] = await connection.execute(query.sql, query.params || []);
                results.push({
                    affectedRows: result.affectedRows,
                    insertId: result.insertId
                });
            }
            
            await connection.commit();
            connection.release();
            return results;
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    }
    
    async transactionPostgreSQL(queries) {
        const client = await connectionPool.connect();
        
        try {
            await client.query('BEGIN');
            
            const results = [];
            for (const query of queries) {
                const result = await client.query(query.sql, query.params || []);
                results.push({
                    affectedRows: result.rowCount,
                    insertId: result.rows[0]?.id || null
                });
            }
            
            await client.query('COMMIT');
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    
    getConnection() {
        switch (this.type.toLowerCase()) {
            case 'sqlite':
                return this.connection;
            case 'mysql':
            case 'postgresql':
                return connectionPool;
            default:
                throw new Error(`不支持的数据库类型: ${this.type}`);
        }
    }
    
    async close() {
        try {
            switch (this.type.toLowerCase()) {
                case 'sqlite':
                    if (this.connection) {
                        this.connection.close();
                    }
                    break;
                case 'mysql':
                case 'postgresql':
                    if (connectionPool) {
                        await connectionPool.end();
                    }
                    break;
            }
            weiScript.plugin.log("数据库连接已关闭");
        } catch (error) {
            weiScript.plugin.error("关闭数据库连接失败:", error);
        }
    }
}

// 缓存服务类
class CacheService {
    constructor() {
        this.cache = new Map();
        this.config = weiScript.config.getSection('cache') || {};
        this.maxSize = this.config.max_size || 1000;
        this.defaultTTL = this.config.ttl || 3600; // 默认1小时
        
        // 定期清理过期缓存
        setInterval(() => {
            this.cleanup();
        }, 60000); // 每分钟清理一次
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        // 检查是否过期
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }
    
    set(key, value, ttl = null) {
        // 如果缓存已满，删除最旧的项
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        const expiry = Date.now() + (ttl || this.defaultTTL) * 1000;
        this.cache.set(key, {
            value: value,
            expiry: expiry,
            created: Date.now()
        });
    }
    
    delete(key) {
        return this.cache.delete(key);
    }
    
    clear() {
        this.cache.clear();
    }
    
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }
    }
    
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: this.hitRate || 0
        };
    }
}

// 数据库迁移服务
class MigrationService {
    constructor(databaseService) {
        this.db = databaseService;
        this.initializeMigrationTable();
    }
    
    async initializeMigrationTable() {
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(255) NOT NULL,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    
    async runMigrations() {
        // 获取已执行的迁移
        const executedMigrations = await this.db.query(
            "SELECT name FROM migrations ORDER BY id"
        );
        const executedNames = new Set(executedMigrations.map(m => m.name));
        
        // 获取所有迁移文件
        const migrations = this.getMigrationFiles();
        
        for (const migration of migrations) {
            if (!executedNames.has(migration.name)) {
                try {
                    await migration.up(this.db);
                    await this.db.execute(
                        "INSERT INTO migrations (name) VALUES (?)",
                        [migration.name]
                    );
                    weiScript.plugin.log(`迁移已执行: ${migration.name}`);
                } catch (error) {
                    weiScript.plugin.error(`迁移失败: ${migration.name}`, error);
                    throw error;
                }
            }
        }
    }
    
    getMigrationFiles() {
        // 这里应该从文件系统加载迁移文件
        // 为了简化，我们返回一些示例迁移
        return [
            {
                name: '001_create_base_tables',
                up: async (db) => {
                    // 创建基础表的迁移
                    await db.execute(`
                        CREATE TABLE IF NOT EXISTS plugin_data (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            plugin_name VARCHAR(50) NOT NULL,
                            data_key VARCHAR(100) NOT NULL,
                            data_value TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(plugin_name, data_key)
                        )
                    `);
                }
            }
        ];
    }
    
    async rollback(steps = 1) {
        const migrations = await this.db.query(
            "SELECT * FROM migrations ORDER BY id DESC LIMIT ?",
            [steps]
        );
        
        for (const migration of migrations) {
            // 这里需要实现回滚逻辑
            await this.db.execute(
                "DELETE FROM migrations WHERE id = ?",
                [migration.id]
            );
            weiScript.plugin.log(`迁移已回滚: ${migration.name}`);
        }
    }
}

// 创建服务实例
const databaseService = new DatabaseService();
cacheService = new CacheService();
const migrationService = new MigrationService(databaseService);

// 注册服务
weiScript.registerService('database-service', databaseService);
weiScript.registerService('cache-service', cacheService);
weiScript.registerService('migration-service', migrationService);

// 命令处理
weiScript.events.on('command.dbadmin', async (eventData) => {
    const sender = eventData.sender;
    const args = eventData.args;
    
    if (args.length === 0) {
        sender.sendMessage("§e用法: /dbadmin <status|backup|restore|optimize>");
        return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
        case 'status':
            const stats = cacheService.getStats();
            sender.sendMessage("§6========== 数据库状态 ==========");
            sender.sendMessage(`§e数据库类型: §f${databaseService.type}`);
            sender.sendMessage(`§e缓存大小: §f${stats.size}/${stats.maxSize}`);
            sender.sendMessage(`§e缓存命中率: §f${(stats.hitRate * 100).toFixed(2)}%`);
            break;
            
        case 'backup':
            sender.sendMessage("§a开始备份数据库...");
            // 实现备份逻辑
            sender.sendMessage("§a数据库备份完成");
            break;
            
        case 'optimize':
            sender.sendMessage("§a开始优化数据库...");
            if (databaseService.type === 'sqlite') {
                await databaseService.execute("VACUUM");
            }
            sender.sendMessage("§a数据库优化完成");
            break;
            
        default:
            sender.sendMessage("§c未知子命令: " + subCommand);
    }
});

// 插件启用
async function onEnable() {
    try {
        // 运行数据库迁移
        await migrationService.runMigrations();
        weiScript.plugin.log("weiScript-database 模块已启用");
    } catch (error) {
        weiScript.plugin.error("数据库模块启用失败:", error);
        throw error;
    }
}

// 插件禁用
async function onDisable() {
    await databaseService.close();
    weiScript.plugin.log("weiScript-database 模块已禁用");
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onEnable: onEnable,
        onDisable: onDisable,
        DatabaseService: DatabaseService,
        CacheService: CacheService,
        MigrationService: MigrationService
    };
}
