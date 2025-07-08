# 插件包目录

此目录包含构建后的插件包文件。

## 自动构建

插件包通过 GitHub Actions 自动构建：

```bash
# 本地构建
npm run build

# 清理构建文件
npm run clean

# 验证构建结果
npm run verify
```

## 文件说明

- `*.zip` - 各个插件的压缩包
- `build-report.json` - 构建报告

## 下载链接

所有插件包都可以通过以下链接下载：
`https://raw.githubusercontent.com/weiliangyan/weiScript-official-plugins/main/packages/{插件名}.zip`

例如：
- weiScript-core: `https://raw.githubusercontent.com/weiliangyan/weiScript-official-plugins/main/packages/weiScript-core.zip`
- weiScript-player: `https://raw.githubusercontent.com/weiliangyan/weiScript-official-plugins/main/packages/weiScript-player.zip`
