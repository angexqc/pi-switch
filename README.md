# PiSwitch

> 多 AI 编码工具配置切换与用量统计桌面应用（Electron）
>
> 一站式管理 **Pi Agent / Codex / Claude Code / opencode** 四个工具的供应商、模型与用量。

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)
![Release](https://img.shields.io/github/v/release/angexqc/pi-switch)
![Tests](https://img.shields.io/badge/tests-44%20passed-green)

---

## ✨ 功能特性

### 🔄 多工具配置切换
- **每 Agent 独立供应商库**：Pi Agent / Codex / Claude Code / opencode 以 Tab 分页，各自维护独立的供应商、模型与价格，互不影响
- **一键切换**：每工具独立绑定「供应商 + 模型」，点击卡片即应用
- **Profile 快照**：命名保存全部 Agent 的选择，页面 / 托盘一键统一切换
- **自动备份**：每次应用前备份原配置（每工具保留最近 20 份），支持一键还原；校验失败不覆盖原文件
- **配置源码编辑**：Tab 内直接查看/修改真实配置文件（JSON/TOML），保存前自动校验 + 备份

### 📊 用量统计（混合）
- **本地代理精确统计**：对开启精确统计的工具将 baseUrl 改写为 `127.0.0.1:<端口>`，逐请求统计 tokens 与费用（OpenAI / Anthropic 非流式 + SSE 流式）
- **历史日志回填**：解析 pi 会话 JSONL、Claude 会话转录、Codex 日志 SQLite、opencode 会话数据库
- **缓存统计**：Tokens 含缓存（输入/输出/缓存读/缓存写），展示命中率
- **看板**：今日/本周/本月/累计费用与 token、趋势图、按工具/模型分布、明细表、CSV 导出

### 🧩 扩展中心
- **版本与升级**：对比当前与 npm 最新版本，有更新时一键升级
- **MCP 服务器**：按名称聚合四工具，品牌图标亮暗显示使用状态，点击灰色图标为对应 Agent 添加
- **Skills 市场**：聚合列表 + 官方 `npx skills` CLI 安装，支持从 skills.sh 市场获取
- **系统提示词**：管理 pi 的 `~/.pi/agent/SYSTEM.md`，候选模板一键启用/编辑/保存

### 🏪 供应商库
- 知名供应商预设（DeepSeek / Anthropic / OpenAI / Gemini / Kimi / GLM / Qwen / Mistral / Groq / xAI）一键填充
- 余额自动查询、连通性测试、价格表可编辑
- 从 cc-switch / Codex / Claude 自身配置反向导入

### 🖥️ 系统集成
- 托盘常驻 + 快捷切换、开机自启、应用内启动各工具终端
- 深色 / 浅色主题、纯色背景、关闭行为可配置（最小化/退出）

---

## 📦 安装

从 [GitHub Releases](https://github.com/angexqc/pi-switch/releases/latest) 下载对应平台安装包：

| 平台 | 格式 |
| --- | --- |
| Windows | `PiSwitch Setup x.y.z.exe`（安装版）/ `PiSwitch-x.y.z-portable.exe`（便携版）/ zip |
| Linux | `.AppImage` / `.deb` / zip |
| macOS | `.dmg` / zip（Intel `x64` 与 Apple Silicon `arm64`） |

> 数据目录位于 `~/.pi-switch/`（`config.json` + `stats.db` + `backups/`），卸载不影响数据。

---

## 🚀 开发

### 环境
- Node.js ≥ 20、pnpm ≥ 10
- Windows：Visual Studio Build Tools（better-sqlite3 原生编译）

### 常用命令
```bash
pnpm install        # 安装依赖
pnpm rebuild        # electron-rebuild better-sqlite3
pnpm build          # tsc main + vite build
pnpm start          # 构建后启动 electron
pnpm test           # vitest 单测（44 项）
pnpm dist           # 打包（win: nsis + portable）
```

### 跨平台打包
- Windows 本机：`pnpm dist`（win）或 `npx electron-builder --linux zip`（仅 zip）
- **三平台完整构建**：打 tag 触发 GitHub Actions（见下）

### 发布流程（自动）
1. 更新 `package.json` 的 `version`
2. `git tag v<version>` 并推送
3. GitHub Actions 自动：三平台构建 → 上传 Release 资产 → 发布 GitHub Packages（`@angexqc/pi-switch`）

---

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Electron 43 |
| 前端 | React 18 · TypeScript · Vite 7 · Ant Design 5 · ECharts 5 |
| 主进程 | Node 内置模块 · better-sqlite3 · smol-toml · zod |
| 测试 | Vitest（44 项，临时 HOME 夹具） |
| CI/CD | GitHub Actions（三平台矩阵） |

## 📁 目录结构

```
electron/            主进程（窗口/托盘/代理/统计/扩展服务）
  switch-engine/     配置写入/备份/切换/导入/迁移
  proxy/             本地代理（server/usage-parser/pricing）
  stats/             用量统计库（db/parsers/aggregator）
  services/          tray/autostart/updater/extensions/balance
shared/types.ts      主/渲染共享类型（IPC 契约）
src/                 渲染进程（pages: Agents/Dashboard/Stats/Extensions/Settings）
scripts/             图标生成（纯 Node PNG）
resources/           打包资源（托盘图标）
tests/               vitest 单测
```

---

## 🔒 隐私与安全

- 密钥明文存储于 `~/.pi-switch/config.json`（与生态工具一致），UI 一律掩码，IPC 不返回明文
- 本地代理仅监听 `127.0.0.1`，请求体只解析不落盘
- 写配置文件前必备份，校验失败不覆盖原文件

## 📄 License

[MIT](LICENSE) © PiSwitch
