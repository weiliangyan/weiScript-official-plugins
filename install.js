/**
 * SuperRPG JavaScript 插件安装脚本
 * 用于自动安装和配置 SuperRPG 模块化插件
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class SuperRPGInstaller {
    constructor() {
        this.packageIndex = null;
        this.installPath = 'plugins/weiScript/plugins';
        this.configPath = 'plugins/weiScript/config';
        this.loadPackageIndex();
    }
    
    loadPackageIndex() {
        try {
            const indexPath = path.join(__dirname, 'package-index.json');
            const indexData = fs.readFileSync(indexPath, 'utf8');
            this.packageIndex = JSON.parse(indexData);
            console.log('✅ 包索引加载成功');
        } catch (error) {
            console.error('❌ 包索引加载失败:', error.message);
            process.exit(1);
        }
    }
    
    async install(packageNames = [], installSet = null) {
        console.log('🚀 开始安装 SuperRPG JavaScript 插件...\n');
        
        // 确保目录存在
        this.ensureDirectories();
        
        // 确定要安装的包
        let packagesToInstall = [];
        
        if (installSet) {
            const set = this.packageIndex.installation_sets[installSet];
            if (!set) {
                console.error(`❌ 未知的安装集: ${installSet}`);
                return false;
            }
            packagesToInstall = set.packages;
            console.log(`📦 使用安装集: ${set.name} - ${set.description}`);
        } else if (packageNames.length > 0) {
            packagesToInstall = packageNames;
        } else {
            // 默认安装标准集
            packagesToInstall = this.packageIndex.installation_sets.standard.packages;
            console.log('📦 使用默认安装集: 标准安装');
        }
        
        // 解析依赖关系
        const resolvedPackages = this.resolveDependencies(packagesToInstall);
        console.log(`📋 将安装 ${resolvedPackages.length} 个包:\n`);
        
        // 显示安装列表
        for (const packageName of resolvedPackages) {
            const pkg = this.packageIndex.packages[packageName];
            console.log(`   • ${pkg.name} v${pkg.version} - ${pkg.description}`);
        }
        console.log('');
        
        // 安装包
        let successCount = 0;
        for (const packageName of resolvedPackages) {
            try {
                await this.installPackage(packageName);
                successCount++;
            } catch (error) {
                console.error(`❌ 安装失败: ${packageName} - ${error.message}`);
            }
        }
        
        console.log(`\n🎉 安装完成! 成功安装 ${successCount}/${resolvedPackages.length} 个包`);
        
        // 生成配置文件
        this.generateConfigs(resolvedPackages);
        
        // 显示后续步骤
        this.showNextSteps();
        
        return successCount === resolvedPackages.length;
    }
    
    resolveDependencies(packageNames) {
        const resolved = new Set();
        const visiting = new Set();
        
        const visit = (packageName) => {
            if (resolved.has(packageName)) return;
            if (visiting.has(packageName)) {
                throw new Error(`检测到循环依赖: ${packageName}`);
            }
            
            const pkg = this.packageIndex.packages[packageName];
            if (!pkg) {
                throw new Error(`未知包: ${packageName}`);
            }
            
            visiting.add(packageName);
            
            // 先处理依赖
            for (const dep of pkg.dependencies || []) {
                visit(dep);
            }
            
            visiting.delete(packageName);
            resolved.add(packageName);
        };
        
        for (const packageName of packageNames) {
            visit(packageName);
        }
        
        // 按安装优先级排序
        return Array.from(resolved).sort((a, b) => {
            const priorityA = this.packageIndex.packages[a].install_priority || 999;
            const priorityB = this.packageIndex.packages[b].install_priority || 999;
            return priorityA - priorityB;
        });
    }
    
    async installPackage(packageName) {
        const pkg = this.packageIndex.packages[packageName];
        console.log(`📥 正在安装: ${pkg.name} v${pkg.version}...`);
        
        // 创建包目录
        const packageDir = path.join(this.installPath, packageName);
        if (!fs.existsSync(packageDir)) {
            fs.mkdirSync(packageDir, { recursive: true });
        }
        
        // 复制文件
        for (const file of pkg.files) {
            const sourcePath = path.join(__dirname, file);
            const targetPath = path.join(this.installPath, file);
            
            if (fs.existsSync(sourcePath)) {
                // 确保目标目录存在
                const targetDir = path.dirname(targetPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                
                fs.copyFileSync(sourcePath, targetPath);
                console.log(`   ✅ 复制: ${file}`);
            } else {
                console.warn(`   ⚠️  文件不存在: ${file}`);
            }
        }
        
        console.log(`   ✅ ${pkg.name} 安装完成\n`);
    }
    
    ensureDirectories() {
        const dirs = [
            this.installPath,
            this.configPath,
            path.join(this.configPath, 'plugins'),
            'plugins/weiScript/data',
            'plugins/weiScript/logs'
        ];
        
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 创建目录: ${dir}`);
            }
        }
    }
    
    generateConfigs(installedPackages) {
        console.log('⚙️  生成配置文件...');
        
        // 生成主配置文件
        const mainConfig = {
            weiscript: {
                version: "1.0.0",
                debug: false,
                auto_update: true
            },
            database: {
                type: "sqlite",
                sqlite: {
                    file: "plugins/weiScript/data/database.db"
                }
            },
            plugins: {}
        };
        
        // 为每个已安装的包添加默认配置
        for (const packageName of installedPackages) {
            const pkg = this.packageIndex.packages[packageName];
            mainConfig.plugins[packageName] = {
                enabled: true,
                version: pkg.version
            };
        }
        
        // 写入配置文件
        const configFile = path.join(this.configPath, 'config.yml');
        const yamlContent = this.objectToYaml(mainConfig);
        fs.writeFileSync(configFile, yamlContent);
        console.log('   ✅ 主配置文件已生成');
        
        // 生成插件加载顺序文件
        const loadOrder = {
            load_order: installedPackages,
            auto_load: true,
            load_timeout: 30
        };
        
        const loadOrderFile = path.join(this.configPath, 'load-order.yml');
        fs.writeFileSync(loadOrderFile, this.objectToYaml(loadOrder));
        console.log('   ✅ 加载顺序文件已生成');
    }
    
    objectToYaml(obj, indent = 0) {
        let yaml = '';
        const spaces = '  '.repeat(indent);
        
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                yaml += `${spaces}${key}:\n`;
                yaml += this.objectToYaml(value, indent + 1);
            } else if (Array.isArray(value)) {
                yaml += `${spaces}${key}:\n`;
                for (const item of value) {
                    yaml += `${spaces}  - ${item}\n`;
                }
            } else {
                yaml += `${spaces}${key}: ${value}\n`;
            }
        }
        
        return yaml;
    }
    
    showNextSteps() {
        console.log('\n📋 后续步骤:');
        console.log('1. 将 weiScript.jar 复制到服务器的 plugins 文件夹');
        console.log('2. 启动服务器以加载 weiScript 插件');
        console.log('3. 使用命令 /wpm list 查看已安装的插件');
        console.log('4. 使用命令 /weiscript reload 重载插件');
        console.log('\n📚 常用命令:');
        console.log('   /player info     - 查看玩家信息');
        console.log('   /profession list - 查看可用职业');
        console.log('   /skill list      - 查看已学技能');
        console.log('   /quest list      - 查看任务列表');
        console.log('\n🔗 更多信息:');
        console.log('   GitHub: https://github.com/weiliangyan/weiScript-official-plugins');
        console.log('   文档: https://github.com/weiliangyan/weiScript-official-plugins/wiki');
    }
    
    listPackages() {
        console.log('📦 可用的 SuperRPG JavaScript 插件包:\n');
        
        const categories = this.packageIndex.categories;
        
        for (const [categoryId, category] of Object.entries(categories)) {
            console.log(`${category.color}${category.name}§r - ${category.description}`);
            
            const categoryPackages = Object.values(this.packageIndex.packages)
                .filter(pkg => pkg.category === categoryId);
            
            for (const pkg of categoryPackages) {
                console.log(`   • ${pkg.name} v${pkg.version}`);
                console.log(`     ${pkg.description}`);
                console.log(`     标签: ${pkg.tags.join(', ')}`);
                console.log('');
            }
        }
        
        console.log('🎯 安装集:');
        for (const [setId, set] of Object.entries(this.packageIndex.installation_sets)) {
            console.log(`   • ${setId}: ${set.name} - ${set.description}`);
        }
    }
    
    showHelp() {
        console.log('SuperRPG JavaScript 插件安装器\n');
        console.log('用法:');
        console.log('   node install.js [选项] [包名...]');
        console.log('');
        console.log('选项:');
        console.log('   --set <安装集>    使用预定义的安装集');
        console.log('   --list           列出所有可用包');
        console.log('   --help           显示此帮助信息');
        console.log('');
        console.log('安装集:');
        console.log('   minimal    - 最小安装 (核心模块)');
        console.log('   basic      - 基础安装 (基础 RPG 功能)');
        console.log('   standard   - 标准安装 (标准 RPG 功能集)');
        console.log('   full       - 完整安装 (所有模块)');
        console.log('');
        console.log('示例:');
        console.log('   node install.js --set standard');
        console.log('   node install.js weiScript-player weiScript-skill');
        console.log('   node install.js --list');
    }
}

// 命令行处理
async function main() {
    const args = process.argv.slice(2);
    const installer = new SuperRPGInstaller();
    
    if (args.includes('--help') || args.includes('-h')) {
        installer.showHelp();
        return;
    }
    
    if (args.includes('--list') || args.includes('-l')) {
        installer.listPackages();
        return;
    }
    
    let installSet = null;
    let packageNames = [];
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--set' && i + 1 < args.length) {
            installSet = args[i + 1];
            i++; // 跳过下一个参数
        } else if (!args[i].startsWith('--')) {
            packageNames.push(args[i]);
        }
    }
    
    try {
        await installer.install(packageNames, installSet);
    } catch (error) {
        console.error('❌ 安装失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = SuperRPGInstaller;
