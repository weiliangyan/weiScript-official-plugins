/**
 * weiScript-core - 核心模块
 * 提供基础 API 和服务框架
 */

// 全局 weiScript 对象
global.weiScript = global.weiScript || {};

// 服务注册表
const services = new Map();
const eventListeners = new Map();
const configData = new Map();

// 核心服务类
class CoreService {
    constructor() {
        this.services = services;
    }
    
    registerService(name, service) {
        if (services.has(name)) {
            console.warn(`服务已存在，将被覆盖: ${name}`);
        }
        
        services.set(name, service);
        console.log(`服务已注册: ${name}`);
        
        // 触发服务注册事件
        this.emit('service.registered', { name, service });
        
        return true;
    }
    
    getService(name) {
        const service = services.get(name);
        if (!service) {
            console.warn(`服务不存在: ${name}`);
            return null;
        }
        return service;
    }
    
    unregisterService(name) {
        if (services.has(name)) {
            const service = services.get(name);
            services.delete(name);
            
            // 触发服务注销事件
            this.emit('service.unregistered', { name, service });
            
            console.log(`服务已注销: ${name}`);
            return true;
        }
        return false;
    }
    
    listServices() {
        return Array.from(services.keys());
    }
    
    emit(event, data) {
        const listeners = eventListeners.get(event) || [];
        for (const listener of listeners) {
            try {
                listener(data);
            } catch (error) {
                console.error(`事件处理器错误 [${event}]:`, error);
            }
        }
    }
}

// 事件服务类
class EventService {
    on(event, handler) {
        if (!eventListeners.has(event)) {
            eventListeners.set(event, []);
        }
        
        eventListeners.get(event).push(handler);
        return true;
    }
    
    off(event, handler) {
        if (!eventListeners.has(event)) {
            return false;
        }
        
        const listeners = eventListeners.get(event);
        const index = listeners.indexOf(handler);
        
        if (index !== -1) {
            listeners.splice(index, 1);
            return true;
        }
        
        return false;
    }
    
    emit(event, data) {
        const listeners = eventListeners.get(event) || [];
        for (const listener of listeners) {
            try {
                listener(data);
            } catch (error) {
                console.error(`事件处理器错误 [${event}]:`, error);
            }
        }
    }
    
    publish(event, data) {
        // 异步发布事件
        setImmediate(() => {
            this.emit(event, data);
        });
    }
    
    listEvents() {
        return Array.from(eventListeners.keys());
    }
    
    getListenerCount(event) {
        return (eventListeners.get(event) || []).length;
    }
}

// 配置服务类
class ConfigService {
    constructor() {
        this.loadDefaultConfig();
    }
    
    loadDefaultConfig() {
        // 加载默认配置
        configData.set('weiscript.version', '1.0.0');
        configData.set('weiscript.debug', false);
        configData.set('weiscript.auto_update', true);
    }
    
    get(key, defaultValue = null) {
        return configData.get(key) || defaultValue;
    }
    
    set(key, value) {
        configData.set(key, value);
        
        // 触发配置更改事件
        weiScript.events.emit('config.changed', { key, value });
        
        return true;
    }
    
    getSection(section) {
        const result = {};
        const prefix = section + '.';
        
        for (const [key, value] of configData.entries()) {
            if (key.startsWith(prefix)) {
                const subKey = key.substring(prefix.length);
                result[subKey] = value;
            }
        }
        
        return result;
    }
    
    reload() {
        // 重新加载配置
        this.loadDefaultConfig();
        
        // 触发配置重载事件
        weiScript.events.emit('config.reloaded', {});
        
        console.log('配置已重新加载');
        return true;
    }
    
    listKeys() {
        return Array.from(configData.keys());
    }
}

// 日志服务类
class LoggerService {
    constructor() {
        this.logLevel = 'INFO';
        this.enableFileOutput = true;
        this.enableConsoleOutput = true;
    }
    
    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        if (this.enableConsoleOutput) {
            console.log(logMessage);
        }
        
        if (this.enableFileOutput) {
            // 这里应该写入文件，但在 JavaScript 环境中简化处理
            // 实际实现中会使用文件系统 API
        }
        
        // 触发日志事件
        weiScript.events.emit('log.message', {
            message,
            level,
            timestamp
        });
    }
    
    info(message) {
        this.log(message, 'INFO');
    }
    
    warn(message) {
        this.log(message, 'WARN');
    }
    
    error(message) {
        this.log(message, 'ERROR');
    }
    
    debug(message) {
        if (weiScript.config.get('weiscript.debug', false)) {
            this.log(message, 'DEBUG');
        }
    }
    
    setLevel(level) {
        this.logLevel = level;
        this.info(`日志级别设置为: ${level}`);
    }
}

// 插件管理器类
class PluginManager {
    constructor() {
        this.plugins = new Map();
        this.loadOrder = [];
    }
    
    loadPlugin(pluginName, pluginModule) {
        try {
            // 执行插件的 onEnable 函数
            if (typeof pluginModule.onEnable === 'function') {
                pluginModule.onEnable();
            }
            
            this.plugins.set(pluginName, {
                name: pluginName,
                module: pluginModule,
                enabled: true,
                loadTime: Date.now()
            });
            
            this.loadOrder.push(pluginName);
            
            weiScript.logger.info(`插件已加载: ${pluginName}`);
            weiScript.events.emit('plugin.loaded', { name: pluginName });
            
            return true;
        } catch (error) {
            weiScript.logger.error(`插件加载失败 [${pluginName}]: ${error.message}`);
            return false;
        }
    }
    
    unloadPlugin(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            return false;
        }
        
        try {
            // 执行插件的 onDisable 函数
            if (typeof plugin.module.onDisable === 'function') {
                plugin.module.onDisable();
            }
            
            this.plugins.delete(pluginName);
            
            const index = this.loadOrder.indexOf(pluginName);
            if (index !== -1) {
                this.loadOrder.splice(index, 1);
            }
            
            weiScript.logger.info(`插件已卸载: ${pluginName}`);
            weiScript.events.emit('plugin.unloaded', { name: pluginName });
            
            return true;
        } catch (error) {
            weiScript.logger.error(`插件卸载失败 [${pluginName}]: ${error.message}`);
            return false;
        }
    }
    
    reloadPlugin(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            return false;
        }
        
        const module = plugin.module;
        
        if (this.unloadPlugin(pluginName)) {
            return this.loadPlugin(pluginName, module);
        }
        
        return false;
    }
    
    getPlugin(pluginName) {
        return this.plugins.get(pluginName);
    }
    
    listPlugins() {
        return Array.from(this.plugins.keys());
    }
    
    getLoadOrder() {
        return [...this.loadOrder];
    }
}

// 创建服务实例
const coreService = new CoreService();
const eventService = new EventService();
const configService = new ConfigService();
const loggerService = new LoggerService();
const pluginManager = new PluginManager();

// 设置全局 weiScript 对象
weiScript.core = coreService;
weiScript.events = eventService;
weiScript.config = configService;
weiScript.logger = loggerService;
weiScript.plugin = {
    log: (message) => loggerService.info(`[Plugin] ${message}`),
    error: (message) => loggerService.error(`[Plugin] ${message}`),
    warn: (message) => loggerService.warn(`[Plugin] ${message}`),
    debug: (message) => loggerService.debug(`[Plugin] ${message}`)
};

// 便捷方法
weiScript.registerService = (name, service) => coreService.registerService(name, service);
weiScript.getService = (name) => coreService.getService(name);

// 注册核心服务
weiScript.registerService('core-service', coreService);
weiScript.registerService('event-service', eventService);
weiScript.registerService('config-service', configService);
weiScript.registerService('logger-service', loggerService);

// 模拟服务器 API (简化版本)
weiScript.server = {
    getOnlinePlayers: () => [],
    getPlayer: (uuid) => null,
    broadcastMessage: (message) => console.log(`[Broadcast] ${message}`)
};

weiScript.api = {
    hasPermission: (uuid, permission) => true,
    sendTitle: (player, title, subtitle) => {
        console.log(`[Title] ${title} - ${subtitle}`);
    },
    sendActionBar: (player, message) => {
        console.log(`[ActionBar] ${message}`);
    }
};

// 命令处理
weiScript.events.on('command.weiscript', (eventData) => {
    const sender = eventData.sender;
    const args = eventData.args;
    
    if (args.length === 0) {
        sender.sendMessage("§e用法: /weiscript <info|reload|status>");
        return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
        case 'info':
            sender.sendMessage("§6========== weiScript 信息 ==========");
            sender.sendMessage(`§e版本: §f${weiScript.config.get('weiscript.version')}`);
            sender.sendMessage(`§e已注册服务: §f${coreService.listServices().length}`);
            sender.sendMessage(`§e已加载插件: §f${pluginManager.listPlugins().length}`);
            sender.sendMessage(`§e事件监听器: §f${eventService.listEvents().length}`);
            break;
            
        case 'reload':
            sender.sendMessage("§a正在重载 weiScript...");
            
            // 重载配置
            configService.reload();
            
            // 重载所有插件
            const plugins = pluginManager.listPlugins();
            let reloadedCount = 0;
            
            for (const pluginName of plugins) {
                if (pluginManager.reloadPlugin(pluginName)) {
                    reloadedCount++;
                }
            }
            
            sender.sendMessage(`§a重载完成! 成功重载 ${reloadedCount}/${plugins.length} 个插件`);
            break;
            
        case 'status':
            sender.sendMessage("§6========== weiScript 状态 ==========");
            sender.sendMessage(`§e运行状态: §a正常`);
            sender.sendMessage(`§e内存使用: §f${process.memoryUsage().heapUsed / 1024 / 1024} MB`);
            sender.sendMessage(`§e运行时间: §f${process.uptime()} 秒`);
            break;
            
        default:
            sender.sendMessage("§c未知子命令: " + subCommand);
    }
});

// 插件启用
function onEnable() {
    weiScript.logger.info("weiScript-core 核心模块已启用");
    
    // 触发核心启用事件
    weiScript.events.emit('core.enabled', {});
}

// 插件禁用
function onDisable() {
    weiScript.logger.info("weiScript-core 核心模块已禁用");
    
    // 触发核心禁用事件
    weiScript.events.emit('core.disabled', {});
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onEnable: onEnable,
        onDisable: onDisable,
        CoreService: CoreService,
        EventService: EventService,
        ConfigService: ConfigService,
        LoggerService: LoggerService,
        PluginManager: PluginManager
    };
}

// 如果在 Node.js 环境中直接运行
if (typeof require !== 'undefined' && require.main === module) {
    onEnable();
}
