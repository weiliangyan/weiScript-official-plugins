# SuperRPG JavaScript 插件包

> 基于 weiScript 平台的模块化 SuperRPG 系统

## 🌟 概述

SuperRPG JavaScript 插件包是将原有的 SuperRPG 系统完全重构为模块化 JavaScript 插件的项目。每个功能模块都是独立的 JavaScript 插件，可以单独安装、配置和管理。

## 📦 模块列表

### 核心模块
- **weiScript-core** - 核心 API 和服务框架
- **weiScript-database** - 数据库服务 (SQLite/MySQL/PostgreSQL)

### RPG 功能模块
- **weiScript-player** - 玩家数据管理 (属性、等级、经验)
- **weiScript-profession** - 职业系统 (转职、天赋树)
- **weiScript-skill** - 技能系统 (基于 MiaoSkill 架构)
- **weiScript-equipment** - 装备系统 (装备、强化、制作)
- **weiScript-quest** - 任务系统 (多类型任务、奖励)

### 扩展模块
- **weiScript-economy** - 经济系统 (货币、商店、交易)
- **weiScript-social** - 社交系统 (公会、组队、好友)

## 🚀 快速开始

### 1. 安装 weiScript 平台

首先确保您已经安装了 weiScript 插件平台：

```bash
# 下载 weiScript.jar 到服务器 plugins 文件夹
# 启动服务器以生成配置文件
```

### 2. 安装 SuperRPG 模块

使用自动安装脚本：

```bash
# 标准安装 (推荐)
node install.js --set standard

# 完整安装 (所有模块)
node install.js --set full

# 自定义安装
node install.js weiScript-player weiScript-skill weiScript-profession
```

### 3. 配置和启动

```bash
# 重启服务器或重载插件
/weiscript reload

# 查看已安装的模块
/wpm list

# 查看插件状态
/weiscript info
```

## 📋 安装集

| 安装集 | 包含模块 | 适用场景 |
|--------|----------|----------|
| **minimal** | core, database | 开发测试 |
| **basic** | minimal + player, profession | 基础 RPG |
| **standard** | basic + skill, equipment | 标准 RPG |
| **full** | 所有模块 | 完整功能 |

## 🎮 功能特性

### 玩家系统
- ✅ 多维度属性系统 (力量、敏捷、智力等)
- ✅ 等级经验系统
- ✅ 数据持久化存储
- ✅ 实时属性计算

### 职业系统
- ✅ 多职业转换
- ✅ 天赋树系统
- ✅ 职业技能限制
- ✅ 进阶职业支持

### 技能系统
- ✅ 热键栏支持 (1-9 键)
- ✅ 冷却时间管理
- ✅ 技能效果系统
- ✅ 法力值消耗
- ✅ 技能升级

### 装备系统
- ✅ 自定义装备属性
- ✅ 装备强化系统
- ✅ 制作系统
- ✅ 套装效果

### 任务系统
- ✅ 多类型任务 (击杀、收集、运送等)
- ✅ 任务链支持
- ✅ 动态奖励计算
- ✅ 任务进度追踪

## 🔧 配置说明

### 主配置文件 (`config/config.yml`)

```yaml
weiscript:
  version: "1.0.0"
  debug: false
  auto_update: true

database:
  type: "sqlite"  # sqlite, mysql, postgresql
  sqlite:
    file: "plugins/weiScript/data/database.db"

plugins:
  weiScript-player:
    enabled: true
    starting_level: 1
    starting_stats: 25
  
  weiScript-skill:
    enabled: true
    hotbar_size: 9
    global_cooldown: 1.0
```

### 插件特定配置

每个插件都有自己的配置文件：
- `config/plugins/weiScript-player.yml`
- `config/plugins/weiScript-skill.yml`
- `config/plugins/weiScript-profession.yml`

## 📚 API 文档

### 玩家数据 API

```javascript
// 获取玩家数据
const playerData = await weiScript.getService('player-data-service').getPlayerData(uuid);

// 添加经验
await weiScript.getService('player-level-service').addExperience(uuid, 100);

// 分配属性点
playerData.allocateStatPoint('strength', 5);
```

### 技能系统 API

```javascript
// 学习技能
const result = await weiScript.getService('skill-management-service').learnSkill(uuid, 'fireball');

// 释放技能
await weiScript.getService('skill-casting-service').castSkill(uuid, 'fireball', targetUuid);
```

### 职业系统 API

```javascript
// 转换职业
await weiScript.getService('profession-service').changeProfession(uuid, 'mage');

// 学习天赋
await weiScript.getService('profession-service').learnTalent(uuid, 'mage_intelligence');
```

## 🎯 命令列表

### 玩家命令
```
/player info          - 查看玩家信息
/stats                - 查看属性面板
/level info           - 查看等级信息
```

### 职业命令
```
/profession info      - 查看当前职业
/profession list      - 查看可用职业
/profession change    - 转换职业
/talent tree          - 查看天赋树
```

### 技能命令
```
/skill list           - 查看已学技能
/skill learn <技能>   - 学习技能
/cast <技能>          - 释放技能
/skills               - 打开技能界面
```

### 任务命令
```
/quest list           - 查看任务列表
/quest accept <ID>    - 接受任务
/quest complete <ID>  - 完成任务
```

## 🔄 版本兼容性

- **Minecraft**: 1.12.2 - 1.21+
- **Java**: 8+
- **weiScript**: 1.0.0+

## 🛠️ 开发指南

### 创建自定义模块

1. 创建插件目录结构：
```
my-custom-plugin/
├── plugin.yml
└── main.js
```

2. 定义插件元数据 (`plugin.yml`)：
```yaml
name: "my-custom-plugin"
version: "1.0.0"
description: "我的自定义插件"
dependencies:
  required:
    - "weiScript-core"
    - "weiScript-player"
```

3. 实现插件逻辑 (`main.js`)：
```javascript
const weiScript = require('weiScript');

function onEnable() {
    weiScript.plugin.log("自定义插件已启用");
}

function onDisable() {
    weiScript.plugin.log("自定义插件已禁用");
}

module.exports = { onEnable, onDisable };
```

### 服务注册

```javascript
// 注册服务
weiScript.registerService('my-service', {
    doSomething: function(param) {
        return "结果";
    }
});

// 使用服务
const myService = weiScript.getService('my-service');
const result = myService.doSomething("参数");
```

## 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

- **GitHub Issues**: [报告问题](https://github.com/weiliangyan/weiScript-official-plugins/issues)
- **Wiki**: [查看文档](https://github.com/weiliangyan/weiScript-official-plugins/wiki)
- **Discussions**: [社区讨论](https://github.com/weiliangyan/weiScript-official-plugins/discussions)

## 🙏 致谢

- **MiaoScript** - 插件架构灵感来源
- **MiaoSkill** - 技能系统设计参考
- **DragonCore** - GUI 系统参考
- **SuperRPG** - 原始功能实现

---

**SuperRPG JavaScript 插件包** - 让您的 Minecraft 服务器拥有完整的 RPG 体验！ 🎮✨
