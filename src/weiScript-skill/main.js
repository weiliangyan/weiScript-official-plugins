/**
 * weiScript-skill - SuperRPG 技能系统模块
 * 基于 MiaoSkill 架构重构，支持热键栏、冷却时间、技能效果等
 */

// 获取 weiScript API
const weiScript = require('weiScript');
const database = weiScript.getService('database-service');
const playerService = weiScript.getService('player-data-service');

// 技能数据缓存
const skillCache = new Map();
const playerSkillCache = new Map();
const cooldownCache = new Map();
const activeEffects = new Map();

// 技能模型
class Skill {
    constructor(id, config) {
        this.id = id;
        this.name = config.name || id;
        this.description = config.description || [];
        this.texture = config.texture || null;
        this.permission = config.permission || null;
        this.passive = config.passive || false;
        this.cooldown = config.cooldown || 0;
        this.maxLevel = config.maxLevel || 1;
        this.effects = config.effects || [];
        this.requiredLevel = config.requiredLevel || 1;
        this.requiredProfession = config.requiredProfession || "";
        this.manaCost = config.manaCost || 0;
        this.castTime = config.castTime || 0;
        this.range = config.range || 5;
        this.targetType = config.targetType || "SELF"; // SELF, TARGET, AREA
    }
    
    // 检查技能是否可以学习
    canLearn(playerData, currentLevel = 1) {
        // 检查等级要求
        if (playerData.level < this.requiredLevel) {
            return { success: false, reason: `需要等级 ${this.requiredLevel}` };
        }
        
        // 检查职业要求
        if (this.requiredProfession && playerData.classId !== this.requiredProfession) {
            return { success: false, reason: `需要职业: ${this.requiredProfession}` };
        }
        
        // 检查技能点
        if (playerData.skillPoints < currentLevel) {
            return { success: false, reason: "技能点不足" };
        }
        
        return { success: true };
    }
    
    // 检查技能是否可以释放
    canCast(playerData, currentLevel = 1) {
        // 检查法力值
        if (playerData.mana < this.manaCost) {
            return { success: false, reason: "法力值不足" };
        }
        
        // 检查权限
        if (this.permission && !weiScript.api.hasPermission(playerData.uuid, this.permission)) {
            return { success: false, reason: "权限不足" };
        }
        
        return { success: true };
    }
}

// 玩家技能数据
class PlayerSkillData {
    constructor(uuid) {
        this.uuid = uuid;
        this.learnedSkills = new Map(); // skillId -> level
        this.hotbar = new Array(9).fill(null); // 热键栏
        this.skillPoints = 0;
        this.lastUsedSkills = new Map(); // skillId -> timestamp
    }
    
    // 学习技能
    learnSkill(skillId, level = 1) {
        this.learnedSkills.set(skillId, level);
    }
    
    // 升级技能
    upgradeSkill(skillId) {
        const currentLevel = this.learnedSkills.get(skillId) || 0;
        const skill = skillCache.get(skillId);
        
        if (!skill) return false;
        if (currentLevel >= skill.maxLevel) return false;
        
        this.learnedSkills.set(skillId, currentLevel + 1);
        return true;
    }
    
    // 设置热键栏
    setHotbarSkill(slot, skillId) {
        if (slot >= 0 && slot < 9) {
            this.hotbar[slot] = skillId;
            return true;
        }
        return false;
    }
    
    // 获取热键栏技能
    getHotbarSkill(slot) {
        return this.hotbar[slot];
    }
    
    // 转换为数据库格式
    toDatabase() {
        return {
            uuid: this.uuid,
            learned_skills: JSON.stringify(Array.from(this.learnedSkills.entries())),
            hotbar: JSON.stringify(this.hotbar),
            skill_points: this.skillPoints
        };
    }
    
    // 从数据库格式创建
    static fromDatabase(row) {
        const skillData = new PlayerSkillData(row.uuid);
        
        if (row.learned_skills) {
            const skills = JSON.parse(row.learned_skills);
            skillData.learnedSkills = new Map(skills);
        }
        
        if (row.hotbar) {
            skillData.hotbar = JSON.parse(row.hotbar);
        }
        
        skillData.skillPoints = row.skill_points || 0;
        return skillData;
    }
}

// 技能效果
class SkillEffect {
    constructor(type, value, duration, target) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.type = type; // DAMAGE, HEAL, BUFF, DEBUFF
        this.value = value;
        this.duration = duration;
        this.target = target;
        this.startTime = Date.now();
    }
    
    // 应用效果
    apply() {
        const player = weiScript.server.getPlayer(this.target);
        if (!player) return false;
        
        switch (this.type.toLowerCase()) {
            case 'damage':
                player.damage(this.value);
                break;
            case 'heal':
                const currentHealth = player.getHealth();
                const maxHealth = player.getMaxHealth();
                player.setHealth(Math.min(currentHealth + this.value, maxHealth));
                break;
            case 'buff':
                this.applyBuff(player);
                break;
            case 'debuff':
                this.applyDebuff(player);
                break;
        }
        
        return true;
    }
    
    applyBuff(player) {
        // 根据效果类型应用增益效果
        switch (this.value.toLowerCase()) {
            case 'speed':
                player.addPotionEffect('SPEED', this.duration * 20, 1);
                break;
            case 'strength':
                player.addPotionEffect('INCREASE_DAMAGE', this.duration * 20, 1);
                break;
            case 'regeneration':
                player.addPotionEffect('REGENERATION', this.duration * 20, 1);
                break;
        }
    }
    
    applyDebuff(player) {
        // 根据效果类型应用减益效果
        switch (this.value.toLowerCase()) {
            case 'slowness':
                player.addPotionEffect('SLOW', this.duration * 20, 1);
                break;
            case 'weakness':
                player.addPotionEffect('WEAKNESS', this.duration * 20, 1);
                break;
            case 'poison':
                player.addPotionEffect('POISON', this.duration * 20, 1);
                break;
        }
    }
    
    // 检查效果是否过期
    isExpired() {
        return Date.now() - this.startTime > this.duration * 1000;
    }
}

// 技能管理服务
class SkillManagementService {
    constructor() {
        this.initializeDatabase();
        this.loadSkillConfigs();
    }
    
    async initializeDatabase() {
        // 创建玩家技能表
        await database.execute(`
            CREATE TABLE IF NOT EXISTS player_skills (
                uuid VARCHAR(36) PRIMARY KEY,
                learned_skills TEXT,
                hotbar TEXT,
                skill_points INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        weiScript.plugin.log("技能数据表初始化完成");
    }
    
    loadSkillConfigs() {
        // 加载技能配置文件
        const skillConfigs = weiScript.config.getSection('skills') || {};
        
        // 默认技能配置
        const defaultSkills = {
            // 战士技能
            slash: {
                name: "斩击",
                description: ["基础剑术攻击", "造成物理伤害"],
                cooldown: 2.0,
                manaCost: 5,
                effects: ["damage:20"],
                requiredLevel: 1,
                requiredProfession: "warrior"
            },
            block: {
                name: "格挡",
                description: ["提升防御力", "减少受到的伤害"],
                cooldown: 15.0,
                manaCost: 10,
                effects: ["buff:damage_reduction:0.3:10"],
                requiredLevel: 3,
                requiredProfession: "warrior"
            },
            
            // 法师技能
            fireball: {
                name: "火球术",
                description: ["发射火球", "造成火焰伤害"],
                cooldown: 3.0,
                manaCost: 15,
                effects: ["damage:30", "debuff:burn:5"],
                requiredLevel: 1,
                requiredProfession: "mage",
                targetType: "TARGET",
                range: 10
            },
            heal: {
                name: "治疗术",
                description: ["恢复生命值", "基础治疗法术"],
                cooldown: 5.0,
                manaCost: 20,
                effects: ["heal:25"],
                requiredLevel: 1,
                requiredProfession: "mage"
            },
            
            // 盗贼技能
            stealth: {
                name: "潜行",
                description: ["进入隐身状态", "提升移动速度"],
                cooldown: 30.0,
                manaCost: 25,
                effects: ["buff:invisibility:10", "buff:speed:2:10"],
                requiredLevel: 1,
                requiredProfession: "rogue"
            },
            backstab: {
                name: "背刺",
                description: ["从背后攻击", "造成额外伤害"],
                cooldown: 8.0,
                manaCost: 15,
                effects: ["damage:40"],
                requiredLevel: 5,
                requiredProfession: "rogue"
            }
        };
        
        // 合并配置
        const allSkills = { ...defaultSkills, ...skillConfigs };
        
        // 创建技能对象
        for (const [skillId, config] of Object.entries(allSkills)) {
            skillCache.set(skillId, new Skill(skillId, config));
        }
        
        weiScript.plugin.log(`加载了 ${skillCache.size} 个技能`);
    }
    
    async getPlayerSkills(uuid) {
        // 先从缓存获取
        if (playerSkillCache.has(uuid)) {
            return playerSkillCache.get(uuid);
        }
        
        // 从数据库获取
        const result = await database.query(
            "SELECT * FROM player_skills WHERE uuid = ?",
            [uuid]
        );
        
        let skillData;
        if (result.length > 0) {
            skillData = PlayerSkillData.fromDatabase(result[0]);
        } else {
            skillData = new PlayerSkillData(uuid);
            await this.savePlayerSkills(skillData);
        }
        
        // 缓存数据
        playerSkillCache.set(uuid, skillData);
        return skillData;
    }
    
    async savePlayerSkills(skillData) {
        const dbData = skillData.toDatabase();
        await database.execute(
            "INSERT INTO player_skills (uuid, learned_skills, hotbar, skill_points) VALUES (?, ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE learned_skills = ?, hotbar = ?, skill_points = ?, updated_at = CURRENT_TIMESTAMP",
            [dbData.uuid, dbData.learned_skills, dbData.hotbar, dbData.skill_points,
             dbData.learned_skills, dbData.hotbar, dbData.skill_points]
        );
        
        // 更新缓存
        playerSkillCache.set(skillData.uuid, skillData);
        return true;
    }
    
    async learnSkill(uuid, skillId) {
        const skill = skillCache.get(skillId);
        if (!skill) {
            return { success: false, reason: "技能不存在" };
        }
        
        const playerData = await playerService.getPlayerData(uuid);
        const skillData = await this.getPlayerSkills(uuid);
        
        // 检查学习条件
        const canLearn = skill.canLearn(playerData);
        if (!canLearn.success) {
            return canLearn;
        }
        
        // 学习技能
        skillData.learnSkill(skillId, 1);
        skillData.skillPoints -= 1;
        
        await this.savePlayerSkills(skillData);
        
        return { success: true, message: `学会了技能: ${skill.name}` };
    }
    
    getSkillInfo(skillId) {
        return skillCache.get(skillId);
    }
    
    getAllSkills() {
        return Array.from(skillCache.values());
    }
}

// 技能释放服务
class SkillCastingService {
    async castSkill(uuid, skillId, targetUuid = null) {
        const skill = skillCache.get(skillId);
        if (!skill) {
            return { success: false, reason: "技能不存在" };
        }
        
        const playerData = await playerService.getPlayerData(uuid);
        const skillData = await skillManagementService.getPlayerSkills(uuid);
        
        // 检查是否学会技能
        if (!skillData.learnedSkills.has(skillId)) {
            return { success: false, reason: "未学会此技能" };
        }
        
        // 检查冷却时间
        if (this.isOnCooldown(uuid, skillId)) {
            const remaining = this.getCooldownRemaining(uuid, skillId);
            return { success: false, reason: `冷却中，剩余 ${remaining.toFixed(1)} 秒` };
        }
        
        // 检查释放条件
        const canCast = skill.canCast(playerData);
        if (!canCast.success) {
            return canCast;
        }
        
        // 消耗法力值
        playerData.mana -= skill.manaCost;
        await playerService.savePlayerData(playerData);
        
        // 设置冷却时间
        this.setCooldown(uuid, skillId, skill.cooldown);
        
        // 应用技能效果
        const target = targetUuid || uuid;
        await this.applySkillEffects(skill, target, skillData.learnedSkills.get(skillId));
        
        // 发送释放消息
        const player = weiScript.server.getPlayer(uuid);
        if (player) {
            player.sendMessage(`§a释放了技能: §e${skill.name}`);
        }
        
        return { success: true, message: `释放了技能: ${skill.name}` };
    }
    
    async applySkillEffects(skill, targetUuid, skillLevel) {
        for (const effectStr of skill.effects) {
            const effect = this.parseEffect(effectStr, skillLevel);
            if (effect) {
                const skillEffect = new SkillEffect(effect.type, effect.value, effect.duration, targetUuid);
                skillEffect.apply();
                
                // 如果是持续效果，添加到活跃效果列表
                if (effect.duration > 0) {
                    if (!activeEffects.has(targetUuid)) {
                        activeEffects.set(targetUuid, []);
                    }
                    activeEffects.get(targetUuid).push(skillEffect);
                }
            }
        }
    }
    
    parseEffect(effectStr, skillLevel) {
        const parts = effectStr.split(':');
        if (parts.length < 2) return null;
        
        const type = parts[0];
        let value = parseFloat(parts[1]) || 0;
        let duration = parseFloat(parts[2]) || 0;
        
        // 根据技能等级调整效果
        value *= (1 + (skillLevel - 1) * 0.1); // 每级增加10%效果
        
        return { type, value, duration };
    }
    
    setCooldown(uuid, skillId, cooldownTime) {
        if (!cooldownCache.has(uuid)) {
            cooldownCache.set(uuid, new Map());
        }
        
        const playerCooldowns = cooldownCache.get(uuid);
        playerCooldowns.set(skillId, Date.now() + cooldownTime * 1000);
    }
    
    isOnCooldown(uuid, skillId) {
        if (!cooldownCache.has(uuid)) return false;
        
        const playerCooldowns = cooldownCache.get(uuid);
        const cooldownEnd = playerCooldowns.get(skillId);
        
        if (!cooldownEnd) return false;
        
        return Date.now() < cooldownEnd;
    }
    
    getCooldownRemaining(uuid, skillId) {
        if (!this.isOnCooldown(uuid, skillId)) return 0;
        
        const playerCooldowns = cooldownCache.get(uuid);
        const cooldownEnd = playerCooldowns.get(skillId);
        
        return (cooldownEnd - Date.now()) / 1000;
    }
}

// 创建服务实例
const skillManagementService = new SkillManagementService();
const skillCastingService = new SkillCastingService();

// 注册服务
weiScript.registerService('skill-management-service', skillManagementService);
weiScript.registerService('skill-casting-service', skillCastingService);

// 事件监听
weiScript.events.on('player.join', async (eventData) => {
    const player = eventData.player;
    const uuid = player.getUniqueId().toString();
    
    // 预加载玩家技能数据
    await skillManagementService.getPlayerSkills(uuid);
});

weiScript.events.on('player.level_up', async (eventData) => {
    const uuid = eventData.uuid;
    const newLevel = eventData.newLevel;
    
    // 每级获得1技能点
    const skillData = await skillManagementService.getPlayerSkills(uuid);
    skillData.skillPoints += 1;
    await skillManagementService.savePlayerSkills(skillData);
    
    const player = weiScript.server.getPlayer(uuid);
    if (player) {
        player.sendMessage(`§e获得了 1 技能点！当前技能点: ${skillData.skillPoints}`);
    }
});

// 命令处理
weiScript.events.on('command.skill', async (eventData) => {
    const sender = eventData.sender;
    const args = eventData.args;
    
    if (!sender.isPlayer()) {
        sender.sendMessage("§c只有玩家可以使用此命令");
        return;
    }
    
    const uuid = sender.getUniqueId().toString();
    
    if (args.length === 0) {
        sender.sendMessage("§e用法: /skill <list|learn|cast|info|reset>");
        return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
        case 'list':
            await handleSkillList(sender, uuid);
            break;
        case 'learn':
            if (args.length < 2) {
                sender.sendMessage("§c用法: /skill learn <技能ID>");
                return;
            }
            await handleSkillLearn(sender, uuid, args[1]);
            break;
        case 'cast':
            if (args.length < 2) {
                sender.sendMessage("§c用法: /skill cast <技能ID>");
                return;
            }
            await handleSkillCast(sender, uuid, args[1]);
            break;
        case 'info':
            if (args.length < 2) {
                sender.sendMessage("§c用法: /skill info <技能ID>");
                return;
            }
            handleSkillInfo(sender, args[1]);
            break;
        default:
            sender.sendMessage("§c未知子命令: " + subCommand);
    }
});

async function handleSkillList(sender, uuid) {
    const skillData = await skillManagementService.getPlayerSkills(uuid);
    
    sender.sendMessage("§6========== 已学技能 ==========");
    
    if (skillData.learnedSkills.size === 0) {
        sender.sendMessage("§7还没有学会任何技能");
        return;
    }
    
    for (const [skillId, level] of skillData.learnedSkills.entries()) {
        const skill = skillManagementService.getSkillInfo(skillId);
        if (skill) {
            sender.sendMessage(`§e${skill.name} §7(Lv.${level}) §8- §f${skill.description[0] || ''}`);
        }
    }
    
    sender.sendMessage(`§e技能点: §f${skillData.skillPoints}`);
}

async function handleSkillLearn(sender, uuid, skillId) {
    const result = await skillManagementService.learnSkill(uuid, skillId);
    
    if (result.success) {
        sender.sendMessage(`§a${result.message}`);
    } else {
        sender.sendMessage(`§c学习失败: ${result.reason}`);
    }
}

async function handleSkillCast(sender, uuid, skillId) {
    const result = await skillCastingService.castSkill(uuid, skillId);
    
    if (result.success) {
        sender.sendMessage(`§a${result.message}`);
    } else {
        sender.sendMessage(`§c释放失败: ${result.reason}`);
    }
}

function handleSkillInfo(sender, skillId) {
    const skill = skillManagementService.getSkillInfo(skillId);
    
    if (!skill) {
        sender.sendMessage("§c技能不存在: " + skillId);
        return;
    }
    
    sender.sendMessage("§6========== 技能信息 ==========");
    sender.sendMessage(`§e名称: §f${skill.name}`);
    sender.sendMessage(`§e描述: §f${skill.description.join(' ')}`);
    sender.sendMessage(`§e冷却: §f${skill.cooldown}秒`);
    sender.sendMessage(`§e法力消耗: §f${skill.manaCost}`);
    sender.sendMessage(`§e需要等级: §f${skill.requiredLevel}`);
    if (skill.requiredProfession) {
        sender.sendMessage(`§e需要职业: §f${skill.requiredProfession}`);
    }
}

// 定期清理过期效果
setInterval(() => {
    for (const [uuid, effects] of activeEffects.entries()) {
        const validEffects = effects.filter(effect => !effect.isExpired());
        if (validEffects.length !== effects.length) {
            activeEffects.set(uuid, validEffects);
        }
    }
}, 1000);

// 插件启用
function onEnable() {
    weiScript.plugin.log("weiScript-skill 模块已启用");
}

// 插件禁用
function onDisable() {
    weiScript.plugin.log("weiScript-skill 模块已禁用");
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onEnable: onEnable,
        onDisable: onDisable,
        Skill: Skill,
        skillManagementService: skillManagementService,
        skillCastingService: skillCastingService
    };
}
