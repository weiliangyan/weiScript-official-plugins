/**
 * weiScript-player - SuperRPG 玩家数据管理模块
 * 迁移自 SuperRPG PlayerDataManager
 */

// 获取 weiScript API
const weiScript = require('weiScript');
const database = weiScript.getService('database-service');
const config = weiScript.getService('config-service');

// 玩家数据缓存
const playerDataCache = new Map();

// 玩家数据模型
class PlayerData {
    constructor(uuid, username) {
        this.uuid = uuid;
        this.username = username;
        this.classId = null;
        this.level = 1;
        this.experience = 0;
        this.money = 100.0;
        this.health = 100.0;
        this.maxHealth = 100.0;
        this.mana = 20.0;
        this.maxMana = 20.0;
        
        // 基础属性 (SuperRPG 原版)
        this.strength = 5;
        this.agility = 5;
        this.intelligence = 5;
        this.vitality = 5;
        this.luck = 5;
        this.defense = 5;
        this.statPoints = 25;
        
        // 转职系统属性
        this.constitution = 5;
        this.dexterity = 5;
        this.wisdom = 5;
        this.charisma = 5;
        this.honor = 0;
        this.faith = 0;
        this.rage = 0;
        this.manaControl = 0;
        this.magicMastery = 0;
        this.battleSpirit = 0;
        this.perception = 5;
        this.natureAffinity = 0;
        this.focus = 0;
        
        // 时间戳
        this.firstJoin = Date.now();
        this.lastSeen = Date.now();
        this.playTime = 0;
        
        // 游戏进度
        this.currentStage = "wanderer"; // wanderer, adventurer, hero, legend
        this.questsCompleted = 0;
        this.achievementsUnlocked = 0;
        
        // 社交数据
        this.guildId = null;
        this.partyId = null;
        this.friends = [];
        
        // 位置数据
        this.lastLocation = null;
        this.homeLocation = null;
    }
    
    // 计算总战力
    getTotalPower() {
        return this.strength + this.agility + this.intelligence + 
               this.vitality + this.luck + this.defense + this.level * 2;
    }
    
    // 获取下一级所需经验
    getRequiredExp() {
        return Math.floor(100 * Math.pow(1.15, this.level - 1));
    }
    
    // 添加经验
    addExperience(amount) {
        this.experience += amount;
        let leveledUp = false;
        
        while (this.experience >= this.getRequiredExp()) {
            this.experience -= this.getRequiredExp();
            this.level++;
            this.statPoints += 5; // 每级获得5点属性点
            leveledUp = true;
        }
        
        return leveledUp;
    }
    
    // 分配属性点
    allocateStatPoint(stat, points) {
        if (this.statPoints < points) return false;
        
        switch (stat.toLowerCase()) {
            case 'strength':
                this.strength += points;
                break;
            case 'agility':
                this.agility += points;
                break;
            case 'intelligence':
                this.intelligence += points;
                break;
            case 'vitality':
                this.vitality += points;
                this.maxHealth += points * 5; // 每点体力增加5血量
                break;
            case 'luck':
                this.luck += points;
                break;
            case 'defense':
                this.defense += points;
                break;
            default:
                return false;
        }
        
        this.statPoints -= points;
        return true;
    }
    
    // 转换为数据库格式
    toDatabase() {
        return {
            uuid: this.uuid,
            username: this.username,
            data: JSON.stringify(this)
        };
    }
    
    // 从数据库格式创建
    static fromDatabase(row) {
        const data = JSON.parse(row.data);
        const playerData = new PlayerData(row.uuid, row.username);
        Object.assign(playerData, data);
        return playerData;
    }
}

// 玩家数据服务
class PlayerDataService {
    constructor() {
        this.initializeDatabase();
    }
    
    async initializeDatabase() {
        // 创建玩家数据表
        await database.execute(`
            CREATE TABLE IF NOT EXISTS player_data (
                uuid VARCHAR(36) PRIMARY KEY,
                username VARCHAR(16) NOT NULL,
                data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        weiScript.plugin.log("玩家数据表初始化完成");
    }
    
    async getPlayerData(uuid) {
        // 先从缓存获取
        if (playerDataCache.has(uuid)) {
            return playerDataCache.get(uuid);
        }
        
        // 从数据库获取
        const result = await database.query(
            "SELECT * FROM player_data WHERE uuid = ?", 
            [uuid]
        );
        
        let playerData;
        if (result.length > 0) {
            playerData = PlayerData.fromDatabase(result[0]);
        } else {
            // 创建新玩家数据
            const player = weiScript.server.getPlayer(uuid);
            const username = player ? player.getName() : "Unknown";
            playerData = new PlayerData(uuid, username);
            await this.savePlayerData(playerData);
        }
        
        // 缓存数据
        playerDataCache.set(uuid, playerData);
        return playerData;
    }
    
    async savePlayerData(playerData) {
        playerData.lastSeen = Date.now();
        
        const dbData = playerData.toDatabase();
        await database.execute(
            "INSERT INTO player_data (uuid, username, data) VALUES (?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE username = ?, data = ?, updated_at = CURRENT_TIMESTAMP",
            [dbData.uuid, dbData.username, dbData.data, dbData.username, dbData.data]
        );
        
        // 更新缓存
        playerDataCache.set(playerData.uuid, playerData);
        return true;
    }
    
    async createPlayerData(uuid, username) {
        const playerData = new PlayerData(uuid, username);
        await this.savePlayerData(playerData);
        return playerData;
    }
    
    // 批量保存所有缓存的玩家数据
    async saveAllCachedData() {
        const promises = [];
        for (const playerData of playerDataCache.values()) {
            promises.push(this.savePlayerData(playerData));
        }
        await Promise.all(promises);
        weiScript.plugin.log(`保存了 ${promises.length} 个玩家数据`);
    }
    
    // 清理离线玩家缓存
    cleanupCache() {
        const onlinePlayers = weiScript.server.getOnlinePlayers();
        const onlineUUIDs = new Set(onlinePlayers.map(p => p.getUniqueId().toString()));
        
        for (const uuid of playerDataCache.keys()) {
            if (!onlineUUIDs.has(uuid)) {
                playerDataCache.delete(uuid);
            }
        }
    }
}

// 等级经验服务
class PlayerLevelService {
    static getRequiredExp(level) {
        return Math.floor(100 * Math.pow(1.15, level - 1));
    }
    
    static async addExperience(uuid, amount) {
        const playerData = await playerDataService.getPlayerData(uuid);
        const leveledUp = playerData.addExperience(amount);
        
        if (leveledUp) {
            // 触发升级事件
            weiScript.events.publish('player.level_up', {
                uuid: uuid,
                newLevel: playerData.level,
                playerData: playerData
            });
            
            // 发送升级消息
            const player = weiScript.server.getPlayer(uuid);
            if (player) {
                player.sendMessage(`§6恭喜！你升到了 ${playerData.level} 级！`);
                player.sendMessage(`§e获得了 5 点属性点，使用 /stats 分配属性`);
                weiScript.api.sendTitle(player, "§6升级！", `§e等级 ${playerData.level}`);
            }
        }
        
        await playerDataService.savePlayerData(playerData);
        return leveledUp;
    }
    
    static async setLevel(uuid, level) {
        const playerData = await playerDataService.getPlayerData(uuid);
        const oldLevel = playerData.level;
        playerData.level = level;
        playerData.experience = 0;
        
        // 重新计算属性点
        const levelDiff = level - oldLevel;
        playerData.statPoints += levelDiff * 5;
        
        await playerDataService.savePlayerData(playerData);
        return true;
    }
}

// 创建服务实例
const playerDataService = new PlayerDataService();

// 注册服务
weiScript.registerService('player-data-service', playerDataService);
weiScript.registerService('player-level-service', PlayerLevelService);

// 事件监听
weiScript.events.on('player.join', async (eventData) => {
    const player = eventData.player;
    const uuid = player.getUniqueId().toString();
    
    // 加载玩家数据
    const playerData = await playerDataService.getPlayerData(uuid);
    playerData.lastSeen = Date.now();
    
    // 欢迎消息
    player.sendMessage(`§a欢迎回来，${player.getName()}！`);
    player.sendMessage(`§e等级: ${playerData.level} | 经验: ${playerData.experience}/${playerData.getRequiredExp()}`);
});

weiScript.events.on('player.quit', async (eventData) => {
    const player = eventData.player;
    const uuid = player.getUniqueId().toString();
    
    // 保存玩家数据
    if (playerDataCache.has(uuid)) {
        await playerDataService.savePlayerData(playerDataCache.get(uuid));
    }
});

// 命令处理
weiScript.events.on('command.player', (eventData) => {
    const sender = eventData.sender;
    const args = eventData.args;
    
    if (args.length === 0) {
        sender.sendMessage("§e用法: /player <info|stats|level|reset>");
        return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
        case 'info':
            handlePlayerInfo(sender);
            break;
        case 'stats':
            handlePlayerStats(sender);
            break;
        case 'level':
            handlePlayerLevel(sender, args.slice(1));
            break;
        case 'reset':
            handlePlayerReset(sender);
            break;
        default:
            sender.sendMessage("§c未知子命令: " + subCommand);
    }
});

async function handlePlayerInfo(sender) {
    if (!sender.isPlayer()) {
        sender.sendMessage("§c只有玩家可以使用此命令");
        return;
    }
    
    const uuid = sender.getUniqueId().toString();
    const playerData = await playerDataService.getPlayerData(uuid);
    
    sender.sendMessage("§6========== 玩家信息 ==========");
    sender.sendMessage(`§e玩家: §f${playerData.username}`);
    sender.sendMessage(`§e等级: §f${playerData.level}`);
    sender.sendMessage(`§e经验: §f${playerData.experience}/${playerData.getRequiredExp()}`);
    sender.sendMessage(`§e金币: §f${playerData.money}`);
    sender.sendMessage(`§e战力: §f${playerData.getTotalPower()}`);
    sender.sendMessage(`§e阶段: §f${playerData.currentStage}`);
}

async function handlePlayerStats(sender) {
    if (!sender.isPlayer()) {
        sender.sendMessage("§c只有玩家可以使用此命令");
        return;
    }
    
    const uuid = sender.getUniqueId().toString();
    const playerData = await playerDataService.getPlayerData(uuid);
    
    sender.sendMessage("§6========== 玩家属性 ==========");
    sender.sendMessage(`§e力量: §f${playerData.strength}`);
    sender.sendMessage(`§e敏捷: §f${playerData.agility}`);
    sender.sendMessage(`§e智力: §f${playerData.intelligence}`);
    sender.sendMessage(`§e体力: §f${playerData.vitality}`);
    sender.sendMessage(`§e幸运: §f${playerData.luck}`);
    sender.sendMessage(`§e防御: §f${playerData.defense}`);
    sender.sendMessage(`§e可分配点数: §f${playerData.statPoints}`);
}

// 插件启用
function onEnable() {
    weiScript.plugin.log("weiScript-player 模块已启用");
    
    // 定期保存数据 (每5分钟)
    setInterval(async () => {
        await playerDataService.saveAllCachedData();
    }, 5 * 60 * 1000);
    
    // 定期清理缓存 (每10分钟)
    setInterval(() => {
        playerDataService.cleanupCache();
    }, 10 * 60 * 1000);
}

// 插件禁用
function onDisable() {
    // 保存所有缓存数据
    playerDataService.saveAllCachedData();
    weiScript.plugin.log("weiScript-player 模块已禁用");
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onEnable: onEnable,
        onDisable: onDisable,
        PlayerData: PlayerData,
        playerDataService: playerDataService
    };
}
