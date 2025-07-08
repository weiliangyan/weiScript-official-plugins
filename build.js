/**
 * SuperRPG JavaScript 插件打包脚本
 * 自动将源代码打包成可分发的 ZIP 文件
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

class PluginBuilder {
    constructor() {
        this.srcDir = './src';
        this.packagesDir = './packages';
        this.packageIndex = null;
        this.loadPackageIndex();
    }
    
    loadPackageIndex() {
        try {
            const indexData = fs.readFileSync('./package-index.json', 'utf8');
            this.packageIndex = JSON.parse(indexData);
            console.log('✅ 包索引加载成功');
        } catch (error) {
            console.error('❌ 包索引加载失败:', error.message);
            process.exit(1);
        }
    }
    
    async buildAll() {
        console.log('🚀 开始构建所有插件包...\n');
        
        // 确保 packages 目录存在
        if (!fs.existsSync(this.packagesDir)) {
            fs.mkdirSync(this.packagesDir, { recursive: true });
            console.log('📁 创建 packages 目录');
        }
        
        // 获取所有插件
        const plugins = Object.keys(this.packageIndex.packages);
        console.log(`📦 发现 ${plugins.length} 个插件包:\n`);
        
        let successCount = 0;
        for (const pluginName of plugins) {
            try {
                await this.buildPlugin(pluginName);
                successCount++;
            } catch (error) {
                console.error(`❌ 构建失败: ${pluginName} - ${error.message}`);
            }
        }
        
        console.log(`\n🎉 构建完成! 成功构建 ${successCount}/${plugins.length} 个插件包`);
        
        // 生成构建报告
        this.generateBuildReport(plugins, successCount);
    }
    
    async buildPlugin(pluginName) {
        const pkg = this.packageIndex.packages[pluginName];
        if (!pkg) {
            throw new Error(`插件不存在: ${pluginName}`);
        }
        
        console.log(`📦 正在构建: ${pkg.name} v${pkg.version}...`);
        
        // 检查源文件是否存在
        const pluginDir = path.join(this.srcDir, pluginName);
        if (!fs.existsSync(pluginDir)) {
            throw new Error(`源目录不存在: ${pluginDir}`);
        }
        
        // 创建 ZIP 文件
        const zipPath = path.join(this.packagesDir, `${pluginName}.zip`);
        await this.createZip(pluginName, pluginDir, zipPath);
        
        // 验证文件
        const stats = fs.statSync(zipPath);
        console.log(`   ✅ ${pluginName}.zip 创建完成 (${this.formatBytes(stats.size)})`);
        
        return zipPath;
    }
    
    async createZip(pluginName, sourceDir, outputPath) {
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // 最高压缩级别
            });
            
            output.on('close', () => {
                resolve();
            });
            
            archive.on('error', (err) => {
                reject(err);
            });
            
            archive.pipe(output);
            
            // 添加插件文件到压缩包
            // 保持目录结构: pluginName/plugin.yml, pluginName/main.js
            archive.directory(sourceDir, pluginName);
            
            archive.finalize();
        });
    }
    
    generateBuildReport(plugins, successCount) {
        const report = {
            build_time: new Date().toISOString(),
            total_plugins: plugins.length,
            successful_builds: successCount,
            failed_builds: plugins.length - successCount,
            packages: {}
        };
        
        // 收集每个包的信息
        for (const pluginName of plugins) {
            const zipPath = path.join(this.packagesDir, `${pluginName}.zip`);
            if (fs.existsSync(zipPath)) {
                const stats = fs.statSync(zipPath);
                report.packages[pluginName] = {
                    size: stats.size,
                    size_formatted: this.formatBytes(stats.size),
                    created: stats.birthtime.toISOString()
                };
            }
        }
        
        // 写入报告文件
        const reportPath = path.join(this.packagesDir, 'build-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log('\n📊 构建报告:');
        console.log(`   总包数: ${report.total_plugins}`);
        console.log(`   成功: ${report.successful_builds}`);
        console.log(`   失败: ${report.failed_builds}`);
        console.log(`   报告文件: ${reportPath}`);
    }
    
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    async clean() {
        console.log('🧹 清理构建文件...');
        
        if (fs.existsSync(this.packagesDir)) {
            const files = fs.readdirSync(this.packagesDir);
            for (const file of files) {
                const filePath = path.join(this.packagesDir, file);
                fs.unlinkSync(filePath);
                console.log(`   🗑️  删除: ${file}`);
            }
        }
        
        console.log('✅ 清理完成');
    }
    
    async verify() {
        console.log('🔍 验证插件包...\n');
        
        const plugins = Object.keys(this.packageIndex.packages);
        let validCount = 0;
        
        for (const pluginName of plugins) {
            const zipPath = path.join(this.packagesDir, `${pluginName}.zip`);
            
            if (fs.existsSync(zipPath)) {
                const stats = fs.statSync(zipPath);
                if (stats.size > 0) {
                    console.log(`✅ ${pluginName}.zip - ${this.formatBytes(stats.size)}`);
                    validCount++;
                } else {
                    console.log(`❌ ${pluginName}.zip - 文件为空`);
                }
            } else {
                console.log(`❌ ${pluginName}.zip - 文件不存在`);
            }
        }
        
        console.log(`\n📊 验证结果: ${validCount}/${plugins.length} 个包有效`);
        return validCount === plugins.length;
    }
    
    showHelp() {
        console.log('SuperRPG JavaScript 插件构建工具\n');
        console.log('用法:');
        console.log('   node build.js [命令]');
        console.log('');
        console.log('命令:');
        console.log('   build     构建所有插件包 (默认)');
        console.log('   clean     清理构建文件');
        console.log('   verify    验证插件包');
        console.log('   help      显示此帮助信息');
        console.log('');
        console.log('示例:');
        console.log('   node build.js build');
        console.log('   node build.js clean');
        console.log('   node build.js verify');
    }
}

// 命令行处理
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'build';
    
    const builder = new PluginBuilder();
    
    try {
        switch (command.toLowerCase()) {
            case 'build':
                await builder.buildAll();
                break;
            case 'clean':
                await builder.clean();
                break;
            case 'verify':
                await builder.verify();
                break;
            case 'help':
            case '--help':
            case '-h':
                builder.showHelp();
                break;
            default:
                console.error(`❌ 未知命令: ${command}`);
                builder.showHelp();
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ 构建失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = PluginBuilder;
