# GitHub 上传指南

## 📤 上传步骤

### 1. 初始化 Git 仓库

```bash
cd github-ready
git init
git add .
git commit -m "feat: 初始化 SuperRPG JavaScript 插件包

- 添加 9 个核心 RPG 模块
- 支持模块化安装和管理
- 包含完整的文档和安装脚本
- 支持 Minecraft 1.12.2-1.21+"
```

### 2. 连接到 GitHub 仓库

```bash
git remote add origin https://github.com/weiliangyan/weiScript-official-plugins.git
git branch -M main
git push -u origin main
```

### 3. 构建插件包

```bash
# 安装依赖
npm install

# 构建所有插件包
npm run build

# 验证构建结果
npm run verify
```

### 4. 提交构建结果

```bash
git add packages/
git commit -m "build: 添加构建后的插件包"
git push
```

## 🔄 自动化构建

GitHub Actions 会自动：
1. 在每次推送时构建插件包
2. 运行测试验证
3. 在创建标签时自动发布 Release

### 创建发布版本

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

## 📋 检查清单

上传前请确认：

- [ ] 所有插件文件都在 `src/` 目录下
- [ ] `package-index.json` 中的下载链接正确
- [ ] README.md 文档完整
- [ ] 所有插件的 `plugin.yml` 配置正确
- [ ] 依赖关系定义清晰
- [ ] 版本号一致
- [ ] GitHub Actions 工作流配置正确

## 🎯 上传后的验证

1. 检查 GitHub Actions 构建状态
2. 验证插件包下载链接可访问
3. 测试安装脚本功能
4. 确认文档显示正常

## 📞 问题排查

如果遇到问题：

1. **构建失败**: 检查 `build.js` 脚本和依赖
2. **下载链接无效**: 确认文件路径和仓库设置
3. **Actions 失败**: 检查工作流配置和权限
4. **安装脚本错误**: 验证 `package-index.json` 格式

## 🔗 相关链接

- [GitHub 仓库](https://github.com/weiliangyan/weiScript-official-plugins)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [npm 包管理](https://docs.npmjs.com/)
