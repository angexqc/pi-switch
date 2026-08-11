# PiSwitch

多 AI 编码工具配置切换与用量统计桌面应用（Windows）。

一站式管理 **Pi Agent / Codex / Claude Code / opencode** 四个工具的供应商与模型配置，并提供
**本地代理精确统计** 与 **历史日志解析回填** 的用量统计看板。

## 功能

- **每 Agent 独立配置**：Pi Agent / Codex / Claude Code / opencode 以 Tab 分页，各自拥有独立供应商库、模型与价格，互不影响。
- **四工具配置切换**：
  - 每工具独立绑定「供应商 + 模型」，一键应用；
  - 命名 **Profile**（全部 Agent 选择快照），页面 / 托盘一键统一切换；
  - 每次应用前自动备份原配置，支持一键还原（每工具保留最近 N 份）。
- **用量统计（混合）**：
  - **本地代理**：对开启精确统计的工具把 baseUrl 改写为 `127.0.0.1:<端口>`，逐请求统计 tokens 与费用（支持 OpenAI / Anthropic 非流式与 SSE 流式）；
  - **历史日志解析**：回填 pi 会话 JSONL、Claude 会话转录、Codex 日志 SQLite、opencode 会话数据库；
  - 看板：今日/本周/本月/累计费用与 token、近 30 天趋势、按工具/模型分布、明细表、CSV 导出。
- **配置源码编辑**：每个 Agent 内可直接查看并修改真实配置文件（JSON/TOML 保存前自动校验 + 备份）。
- **关闭行为**：点击关闭时弹窗选择「最小化到托盘 / 完全退出」，可记住选择不再询问。
- **系统集成**：托盘常驻 + 快捷切换、开机自启、应用内启动各工具终端、NSIS 安装版 + 便携版。
- **旧版数据导入**：一键从 `~/.piswitch/config.json` 导入已有供应商与模型。

## 架构

```
electron/
  main.ts              主进程：窗口 / 托盘 / 生命周期 / 代理装配
  preload.ts           contextBridge 暴露 window.piswitch.*
  ipc.ts               IPC 注册（供应商 CRUD、切换、统计、代理、设置）
  switch-engine/       配置引擎：app-config / backup / writers(pi,codex,claude,opencode) / migrate / status
  proxy/               本地代理：server / usage-parser / pricing
  stats/               统计库：db(SQLite) / parsers / aggregator
  services/            launcher / autostart / tray / provider-test
shared/types.ts        主/渲染进程共享类型
src/                   React 渲染进程（Ant Design 5 + ECharts）
tests/                 vitest 单元测试（临时 HOME 夹具，不触碰真实配置）
```

- 应用数据目录：`~/.pi-switch/`（`config.json`、`stats.db`、`backups/`）
- 切换机制：直接改写各工具真实配置文件（写前备份，校验失败不覆盖）
- 数据模型：`agents.<tool>.providers` 每 Agent 独立供应商库；`profiles` 仅存选择快照
- 各工具配置位置：
  - pi：`~/.pi/agent/models.json` + `settings.json`
  - codex：`~/.codex/config.toml`（+ `auth.json` 注入自定义 provider 密钥）
  - claude code：`~/.claude/settings.json`（env：base URL / auth / 模型映射）
  - opencode：`~/.config/opencode/opencode.json`

## 开发

```bash
npm install                # 安装依赖（Electron 二进制若下载失败：
                           #   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install）
npm test                  # 运行单元测试（32 项）
npm run build             # 编译主进程(tsc) + 渲染进程(vite)
npm start                 # 以本机 HOME 启动开发版
```

> 提示：`npm start` 会使用真实 HOME 下的各工具配置。建议先开启备份功能或使用
> `PI_SWITCH_HOME=<临时目录>` 隔离测试。

## 打包

```bash
npm run build
npx electron-builder --win nsis portable
# 或使用镜像加速工具下载：
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npx electron-builder --win nsis portable
```

产物位于 `release/`：`PiSwitch Setup 1.0.0.exe`（安装版）、`PiSwitch-1.0.0-portable.exe`（便携版）。

## 使用流程

1. **导入或添加供应商**：设置页可从旧版 `.piswitch` 一键导入到全部 Agent；或进入对应 Agent Tab 手动添加（名称、ID、API 类型、Base URL、API Key）。
2. **配置 Agent**：每个 Agent Tab 独立选择「供应商 + 模型」（含 codex 推理强度等附加项），点击「应用」写入真实配置；也可展开「配置文件源码」直接编辑并保存。
3. **精确统计（可选）**：在 Agent Tab 打开「精确统计」开关即自动启用全局代理并应用（baseUrl 改写为本地代理端口）。
4. **Profile 一键切换**：保存当前全部绑定为命名 Profile，页面或托盘一键统一切换。
5. **查看用量**：用量统计页「扫描日志」回填历史数据，代理记录实时入库；可导出 CSV。

## 说明与限制

- 仅支持 Windows（托盘、自启、NSIS 均按 Windows 实现）。
- API Key 明文存储于 `~/.pi-switch/config.json`（与生态内现有工具一致），界面掩码显示。
- codex 的 `config.toml` 经 TOML 解析重写（会丢失注释与排版，已自动备份；解析失败自动降级为文本行级替换）。
- codex / opencode 的历史统计来自其 SQLite 日志，随版本变化字段可能不同；解析失败会在界面提示原因。
- 代理仅监听 `127.0.0.1`，请求体仅内存解析，不落盘。
