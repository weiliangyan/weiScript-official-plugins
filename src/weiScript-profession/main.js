/**
 * weiScript-profession - SuperRPG 职业系统模块
 * 迁移自 ClassManager 和 TalentManager，支持职业转换和天赋系统
 */

// 获取 weiScript API
const weiScript = require('weiScript');
const database = weiScript.getService('database-service');
const playerService = weiScript.getService('player-data-service');

// 职业数据缓存
const professionCache = new Map();
const talentCache = new Map();
const playerProfessionCache = new Map();

// 职业模型
class Profession {
    constructor(id, config) {
        this.id = id;
        this.name = config.name || id;
        this.description = config.description || "";
        this.icon = config.icon || "IRON_SWORD";
        this.color = config.color || "§f";
        
        // 属性加成
        this.statBonuses = config.statBonuses || {};
        
        // 技能相关
        this.availableSkills = config.availableSkills || [];
        this.startingSkills = config.startingSkills || [];
        
        // 装备限制
        this.allowedWeapons = config.allowedWeapons || [];
        this.allowedArmor = config.allowedArmor || [];
        
        // 转职要求
        this.requirements = config.requirements || {};
        
        // 天赋树
        this.talentTree = config.talentTree || {};
    }
    
    // 检查是否可以转职
    canChangeTo(playerData) {
        // 检查等级要求
        if (this.requirements.level && playerData.level < this.requirements.level) {
            return { success: false, reason: `需要等级 ${this.requirements.level}` };
        }
        
        // 检查金币要求
        if (this.requirements.money && playerData.money < this.requirements.money) {
            return { success: false, reason: `需要金币 ${this.requirements.money}` };
        }
        
        // 检查前置职业
        if (this.requirements.previousProfession && 
            playerData.classId !== this.requirements.previousProfession) {
            return { success: false, reason: `需要前置职业: ${this.requirements.previousProfession}` };
        }
        
        return { success: true };
    }
    
    // 应用职业属性加成
    applyStatBonuses(playerData) {
        for (const [stat, bonus] of Object.entries(this.statBonuses)) {
            if (playerData.hasOwnProperty(stat)) {
                playerData[stat] += bonus;
            }
        }
    }
    
    // 获取可用技能列表
    getAvailableSkills(playerLevel) {
        return this.availableSkills.filter(skill => 
            !skill.levelRequirement || playerLevel >= skill.levelRequirement
        );
    }
}

// 天赋模型
class Talent {
    constructor(id, config) {
        this.id = id;
        this.name = config.name || id;
        this.description = config.description || "";
        this.icon = config.icon || "BOOK";
        this.maxLevel = config.maxLevel || 5;
        this.requirements = config.requirements || {};
        this.effects = config.effects || [];
        this.position = config.position || { x: 0, y: 0 };
        this.profession = config.profession || null;
    }
    
    // 检查是否可以学习
    canLearn(playerData, currentLevel = 0) {
        // 检查最大等级
        if (currentLevel >= this.maxLevel) {
            return { success: false, reason: "已达到最大等级" };
        }
        
        // 检查天赋点
        if (playerData.talentPoints < 1) {
            return { success: false, reason: "天赋点不足" };
        }
        
        // 检查前置天赋
        if (this.requirements.prerequisite) {
            // 这里需要检查前置天赋是否已学习
            // 实现略...
        }
        
        return { success: true };
    }
    
    // 应用天赋效果
    applyEffect(playerData, level) {
        for (const effect of this.effects) {
            const value = effect.baseValue + (effect.perLevel || 0) * (level - 1);
            
            switch (effect.type) {
                case 'stat_bonus':
                    if (playerData.hasOwnProperty(effect.stat)) {
                        playerData[effect.stat] += value;
                    }
                    break;
                case 'skill_bonus':
                    // 技能加成效果
                    break;
                case 'passive_ability':
                    // 被动能力效果
                    break;
            }
        }
    }
}

// 玩家职业数据
class PlayerProfessionData {
    constructor(uuid) {
        this.uuid = uuid;
        this.currentProfession = null;
        this.professionHistory = [];
        this.talentPoints = 0;
        this.learnedTalents = new Map(); // talentId -> level
        this.professionExperience = new Map(); // professionId -> experience
    }
    
    // 转换职业
    changeProfession(professionId) {
        if (this.currentProfession) {
            this.professionHistory.push({
                profession: this.currentProfession,
                timestamp: Date.now()
            });
        }
        
        this.currentProfession = professionId;
    }
    
    // 学习天赋
    learnTalent(talentId) {
        const currentLevel = this.learnedTalents.get(talentId) || 0;
        this.learnedTalents.set(talentId, currentLevel + 1);
        this.talentPoints -= 1;
    }
    
    // 重置天赋
    resetTalents() {
        this.learnedTalents.clear();
        // 重新计算天赋点（基于等级）
        // this.talentPoints = playerLevel;
    }
    
    // 转换为数据库格式
    toDatabase() {
        return {
            uuid: this.uuid,
            current_profession: this.currentProfession,
            profession_history: JSON.stringify(this.professionHistory),
            talent_points: this.talentPoints,
            learned_talents: JSON.stringify(Array.from(this.learnedTalents.entries())),
            profession_experience: JSON.stringify(Array.from(this.professionExperience.entries()))
        };
    }
    
    // 从数据库格式创建
    static fromDatabase(row) {
        const professionData = new PlayerProfessionData(row.uuid);
        
        professionData.currentProfession = row.current_profession;
        professionData.talentPoints = row.talent_points || 0;
        
        if (row.profession_history) {
            professionData.professionHistory = JSON.parse(row.profession_history);
        }
        
        if (row.learned_talents) {
            const talents = JSON.parse(row.learned_talents);
            professionData.learnedTalents = new Map(talents);
        }
        
        if (row.profession_experience) {
            const experience = JSON.parse(row.profession_experience);
            professionData.professionExperience = new Map(experience);
        }
        
        return professionData;
    }
}

// 职业管理服务
class ProfessionService {
    constructor() {
        this.initializeDatabase();
        this.loadProfessionConfigs();
        this.loadTalentConfigs();
    }
    
    async initializeDatabase() {
        // 创建玩家职业表
        await database.execute(`
            CREATE TABLE IF NOT EXISTS player_professions (
                uuid VARCHAR(36) PRIMARY KEY,
                current_profession VARCHAR(50),
                profession_history TEXT,
                talent_points INT DEFAULT 0,
                learned_talents TEXT,
                profession_experience TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        weiScript.plugin.log("职业数据表初始化完成");
    }
    
    loadProfessionConfigs() {
        // 默认职业配置
        const defaultProfessions = {
            warrior: {
                name: "战士",
                description: "近战物理职业，拥有强大的攻击力和防御力",
                icon: "IRON_SWORD",
                color: "§c",
                statBonuses: {
                    strength: 3,
                    vitality: 2,
                    defense: 2
                },
                availableSkills: ["slash", "block", "taunt", "charge"],
                startingSkills: ["slash"],
                allowedWeapons: ["SWORD", "AXE", "MACE"],
                allowedArmor: ["HEAVY"],
                requirements: {
                    level: 1,
                    money: 0
                }
            },
            
            mage: {
                name: "法师",
                description: "远程魔法职业，拥有强大的法术攻击能力",
                icon: "BLAZE_ROD",
                color: "§9",
                statBonuses: {
                    intelligence: 4,
                    wisdom: 2,
                    manaControl: 3
                },
                availableSkills: ["fireball", "heal", "teleport", "shield"],
                startingSkills: ["fireball"],
                allowedWeapons: ["STAFF", "WAND"],
                allowedArmor: ["ROBE"],
                requirements: {
                    level: 1,
                    money: 0
                }
            },
            
            rogue: {
                name: "盗贼",
                description: "敏捷型职业，擅长潜行和暴击",
                icon: "IRON_DAGGER",
                color: "§8",
                statBonuses: {
                    agility: 4,
                    dexterity: 3,
                    luck: 2
                },
                availableSkills: ["stealth", "backstab", "poison", "lockpick"],
                startingSkills: ["stealth"],
                allowedWeapons: ["DAGGER", "BOW"],
                allowedArmor: ["LIGHT"],
                requirements: {
                    level: 1,
                    money: 0
                }
            },
            
            // 高级职业
            paladin: {
                name: "圣骑士",
                description: "战士的进阶职业，拥有神圣力量",
                icon: "GOLDEN_SWORD",
                color: "§e",
                statBonuses: {
                    strength: 2,
                    vitality: 2,
                    faith: 3,
                    charisma: 2
                },
                availableSkills: ["holy_strike", "divine_protection", "heal", "smite"],
                startingSkills: ["holy_strike"],
                requirements: {
                    level: 20,
                    money: 5000,
                    previousProfession: "warrior"
                }
            },
            
            archmage: {
                name: "大法师",
                description: "法师的进阶职业，掌握更强大的魔法",
                icon: "ENCHANTED_BOOK",
                color: "§5",
                statBonuses: {
                    intelligence: 5,
                    wisdom: 4,
                    magicMastery: 4
                },
                availableSkills: ["meteor", "time_stop", "teleport", "summon"],
                startingSkills: ["meteor"],
                requirements: {
                    level: 20,
                    money: 5000,
                    previousProfession: "mage"
                }
            }
        };
        
        // 加载配置
        const professionConfigs = weiScript.config.getSection('professions') || {};
        const allProfessions = { ...defaultProfessions, ...professionConfigs };
        
        // 创建职业对象
        for (const [professionId, config] of Object.entries(allProfessions)) {
            professionCache.set(professionId, new Profession(professionId, config));
        }
        
        weiScript.plugin.log(`加载了 ${professionCache.size} 个职业`);
    }
    
    loadTalentConfigs() {
        // 默认天赋配置
        const defaultTalents = {
            // 战士天赋
            warrior_strength: {
                name: "力量强化",
                description: "增加力量属性",
                profession: "warrior",
                maxLevel: 5,
                effects: [
                    { type: "stat_bonus", stat: "strength", baseValue: 1, perLevel: 1 }
                ],
                position: { x: 0, y: 0 }
            },
            
            warrior_defense: {
                name: "防御强化",
                description: "增加防御属性",
                profession: "warrior",
                maxLevel: 5,
                effects: [
                    { type: "stat_bonus", stat: "defense", baseValue: 1, perLevel: 1 }
                ],
                position: { x: 1, y: 0 }
            },
            
            // 法师天赋
            mage_intelligence: {
                name: "智力强化",
                description: "增加智力属性",
                profession: "mage",
                maxLevel: 5,
                effects: [
                    { type: "stat_bonus", stat: "intelligence", baseValue: 1, perLevel: 1 }
                ],
                position: { x: 0, y: 0 }
            },
            
            mage_mana: {
                name: "法力强化",
                description: "增加最大法力值",
                profession: "mage",
                maxLevel: 5,
                effects: [
                    { type: "stat_bonus", stat: "maxMana", baseValue: 5, perLevel: 5 }
                ],
                position: { x: 1, y: 0 }
            }
        };
        
        // 加载配置
        const talentConfigs = weiScript.config.getSection('talents') || {};
        const allTalents = { ...defaultTalents, ...talentConfigs };
        
        // 创建天赋对象
        for (const [talentId, config] of Object.entries(allTalents)) {
            talentCache.set(talentId, new Talent(talentId, config));
        }
        
        weiScript.plugin.log(`加载了 ${talentCache.size} 个天赋`);
    }
    
    async getPlayerProfession(uuid) {
        // 先从缓存获取
        if (playerProfessionCache.has(uuid)) {
            return playerProfessionCache.get(uuid);
        }
        
        // 从数据库获取
        const result = await database.query(
            "SELECT * FROM player_professions WHERE uuid = ?",
            [uuid]
        );
        
        let professionData;
        if (result.length > 0) {
            professionData = PlayerProfessionData.fromDatabase(result[0]);
        } else {
            professionData = new PlayerProfessionData(uuid);
            await this.saveProfessionData(professionData);
        }
        
        // 缓存数据
        playerProfessionCache.set(uuid, professionData);
        return professionData;
    }
    
    async saveProfessionData(professionData) {
        const dbData = professionData.toDatabase();
        await database.execute(
            "INSERT INTO player_professions (uuid, current_profession, profession_history, talent_points, learned_talents, profession_experience) " +
            "VALUES (?, ?, ?, ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE current_profession = ?, profession_history = ?, talent_points = ?, " +
            "learned_talents = ?, profession_experience = ?, updated_at = CURRENT_TIMESTAMP",
            [dbData.uuid, dbData.current_profession, dbData.profession_history, dbData.talent_points,
             dbData.learned_talents, dbData.profession_experience,
             dbData.current_profession, dbData.profession_history, dbData.talent_points,
             dbData.learned_talents, dbData.profession_experience]
        );
        
        // 更新缓存
        playerProfessionCache.set(professionData.uuid, professionData);
        return true;
    }
    
    async changeProfession(uuid, professionId) {
        const profession = professionCache.get(professionId);
        if (!profession) {
            return { success: false, reason: "职业不存在" };
        }
        
        const playerData = await playerService.getPlayerData(uuid);
        const professionData = await this.getPlayerProfession(uuid);
        
        // 检查转职条件
        const canChange = profession.canChangeTo(playerData);
        if (!canChange.success) {
            return canChange;
        }
        
        // 扣除金币
        if (profession.requirements.money) {
            playerData.money -= profession.requirements.money;
            await playerService.savePlayerData(playerData);
        }
        
        // 转换职业
        professionData.changeProfession(professionId);
        
        // 应用职业属性加成
        profession.applyStatBonuses(playerData);
        
        await this.saveProfessionData(professionData);
        await playerService.savePlayerData(playerData);
        
        // 触发职业转换事件
        weiScript.events.publish('player.profession_change', {
            uuid: uuid,
            newProfession: professionId,
            playerData: playerData
        });
        
        return { success: true, message: `成功转职为: ${profession.name}` };
    }
    
    getProfessionInfo(professionId) {
        return professionCache.get(professionId);
    }
    
    getAllProfessions() {
        return Array.from(professionCache.values());
    }
    
    async learnTalent(uuid, talentId) {
        const talent = talentCache.get(talentId);
        if (!talent) {
            return { success: false, reason: "天赋不存在" };
        }
        
        const playerData = await playerService.getPlayerData(uuid);
        const professionData = await this.getPlayerProfession(uuid);
        
        // 检查职业匹配
        if (talent.profession && professionData.currentProfession !== talent.profession) {
            return { success: false, reason: "职业不匹配" };
        }
        
        const currentLevel = professionData.learnedTalents.get(talentId) || 0;
        
        // 检查学习条件
        const canLearn = talent.canLearn(playerData, currentLevel);
        if (!canLearn.success) {
            return canLearn;
        }
        
        // 学习天赋
        professionData.learnTalent(talentId);
        
        // 应用天赋效果
        talent.applyEffect(playerData, currentLevel + 1);
        
        await this.saveProfessionData(professionData);
        await playerService.savePlayerData(playerData);
        
        return { success: true, message: `学会了天赋: ${talent.name}` };
    }
    
    getTalentTree(professionId) {
        const talents = [];
        for (const talent of talentCache.values()) {
            if (!talent.profession || talent.profession === professionId) {
                talents.push(talent);
            }
        }
        return talents;
    }
}

// 创建服务实例
const professionService = new ProfessionService();

// 注册服务
weiScript.registerService('profession-service', professionService);

// 事件监听
weiScript.events.on('player.join', async (eventData) => {
    const player = eventData.player;
    const uuid = player.getUniqueId().toString();
    
    // 预加载玩家职业数据
    const professionData = await professionService.getPlayerProfession(uuid);
    
    if (!professionData.currentProfession) {
        player.sendMessage("§e欢迎！请使用 §f/profession change <职业名> §e选择你的职业");
        player.sendMessage("§e可用职业: §f/profession list");
    } else {
        const profession = professionService.getProfessionInfo(professionData.currentProfession);
        if (profession) {
            player.sendMessage(`§a当前职业: ${profession.color}${profession.name}`);
        }
    }
});

weiScript.events.on('player.level_up', async (eventData) => {
    const uuid = eventData.uuid;
    
    // 每级获得1天赋点
    const professionData = await professionService.getPlayerProfession(uuid);
    professionData.talentPoints += 1;
    await professionService.saveProfessionData(professionData);
    
    const player = weiScript.server.getPlayer(uuid);
    if (player) {
        player.sendMessage(`§e获得了 1 天赋点！当前天赋点: ${professionData.talentPoints}`);
    }
});

// 命令处理
weiScript.events.on('command.profession', async (eventData) => {
    const sender = eventData.sender;
    const args = eventData.args;
    
    if (!sender.isPlayer()) {
        sender.sendMessage("§c只有玩家可以使用此命令");
        return;
    }
    
    const uuid = sender.getUniqueId().toString();
    
    if (args.length === 0) {
        sender.sendMessage("§e用法: /profession <info|change|list|talent>");
        return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
        case 'info':
            await handleProfessionInfo(sender, uuid);
            break;
        case 'change':
            if (args.length < 2) {
                sender.sendMessage("§c用法: /profession change <职业ID>");
                return;
            }
            await handleProfessionChange(sender, uuid, args[1]);
            break;
        case 'list':
            handleProfessionList(sender);
            break;
        case 'talent':
            await handleTalentCommand(sender, uuid, args.slice(1));
            break;
        default:
            sender.sendMessage("§c未知子命令: " + subCommand);
    }
});

async function handleProfessionInfo(sender, uuid) {
    const professionData = await professionService.getPlayerProfession(uuid);
    
    if (!professionData.currentProfession) {
        sender.sendMessage("§c你还没有选择职业");
        return;
    }
    
    const profession = professionService.getProfessionInfo(professionData.currentProfession);
    if (!profession) {
        sender.sendMessage("§c职业数据错误");
        return;
    }
    
    sender.sendMessage("§6========== 职业信息 ==========");
    sender.sendMessage(`§e职业: ${profession.color}${profession.name}`);
    sender.sendMessage(`§e描述: §f${profession.description}`);
    sender.sendMessage(`§e天赋点: §f${professionData.talentPoints}`);
    
    // 显示属性加成
    if (Object.keys(profession.statBonuses).length > 0) {
        sender.sendMessage("§e属性加成:");
        for (const [stat, bonus] of Object.entries(profession.statBonuses)) {
            sender.sendMessage(`  §f${stat}: +${bonus}`);
        }
    }
}

async function handleProfessionChange(sender, uuid, professionId) {
    const result = await professionService.changeProfession(uuid, professionId);
    
    if (result.success) {
        sender.sendMessage(`§a${result.message}`);
    } else {
        sender.sendMessage(`§c转职失败: ${result.reason}`);
    }
}

function handleProfessionList(sender) {
    const professions = professionService.getAllProfessions();
    
    sender.sendMessage("§6========== 可用职业 ==========");
    
    for (const profession of professions) {
        sender.sendMessage(`${profession.color}${profession.name} §8- §f${profession.description}`);
        
        if (profession.requirements.level > 1) {
            sender.sendMessage(`  §7需要等级: ${profession.requirements.level}`);
        }
        
        if (profession.requirements.money > 0) {
            sender.sendMessage(`  §7费用: ${profession.requirements.money} 金币`);
        }
        
        if (profession.requirements.previousProfession) {
            sender.sendMessage(`  §7前置职业: ${profession.requirements.previousProfession}`);
        }
    }
}

async function handleTalentCommand(sender, uuid, args) {
    if (args.length === 0) {
        sender.sendMessage("§e用法: /profession talent <tree|learn|reset>");
        return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
        case 'tree':
            await handleTalentTree(sender, uuid);
            break;
        case 'learn':
            if (args.length < 2) {
                sender.sendMessage("§c用法: /profession talent learn <天赋ID>");
                return;
            }
            await handleTalentLearn(sender, uuid, args[1]);
            break;
        case 'reset':
            await handleTalentReset(sender, uuid);
            break;
        default:
            sender.sendMessage("§c未知子命令: " + subCommand);
    }
}

async function handleTalentTree(sender, uuid) {
    const professionData = await professionService.getPlayerProfession(uuid);
    
    if (!professionData.currentProfession) {
        sender.sendMessage("§c你还没有选择职业");
        return;
    }
    
    const talents = professionService.getTalentTree(professionData.currentProfession);
    
    sender.sendMessage("§6========== 天赋树 ==========");
    
    for (const talent of talents) {
        const currentLevel = professionData.learnedTalents.get(talent.id) || 0;
        const status = currentLevel > 0 ? `§a(${currentLevel}/${talent.maxLevel})` : "§7(未学习)";
        
        sender.sendMessage(`§e${talent.name} ${status}`);
        sender.sendMessage(`  §f${talent.description}`);
    }
    
    sender.sendMessage(`§e天赋点: §f${professionData.talentPoints}`);
}

async function handleTalentLearn(sender, uuid, talentId) {
    const result = await professionService.learnTalent(uuid, talentId);
    
    if (result.success) {
        sender.sendMessage(`§a${result.message}`);
    } else {
        sender.sendMessage(`§c学习失败: ${result.reason}`);
    }
}

async function handleTalentReset(sender, uuid) {
    const professionData = await professionService.getPlayerProfession(uuid);
    const playerData = await playerService.getPlayerData(uuid);
    
    // 检查重置费用
    const resetCost = 5000;
    if (playerData.money < resetCost) {
        sender.sendMessage(`§c重置天赋需要 ${resetCost} 金币`);
        return;
    }
    
    // 扣除费用并重置
    playerData.money -= resetCost;
    professionData.resetTalents();
    professionData.talentPoints = playerData.level; // 重新计算天赋点
    
    await professionService.saveProfessionData(professionData);
    await playerService.savePlayerData(playerData);
    
    sender.sendMessage("§a天赋已重置！");
}

// 插件启用
function onEnable() {
    weiScript.plugin.log("weiScript-profession 模块已启用");
}

// 插件禁用
function onDisable() {
    weiScript.plugin.log("weiScript-profession 模块已禁用");
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onEnable: onEnable,
        onDisable: onDisable,
        Profession: Profession,
        Talent: Talent,
        professionService: professionService
    };
}
