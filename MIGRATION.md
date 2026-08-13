# PiSwitch Rust/Tauri 版 → Electron 版 迁移改动清单

> 目的：把 `pi-switch-rust`（Tauri 2 版）已完成并验证的 UI/交互改进，同步到 `piSwitch`（Electron 版）。
> 生成时间：2026-08-13。源仓库：`E:/webCode/pi-switch-rust`，目标仓库：`E:/webCode/piSwitch`。
> **配色结论（已确认）**：Electron 版从青绿色主题（`#35d0ba`）整体切换为 **蓝色毛玻璃（glassmorphism）**，两版视觉一致。

---

## 0. 总览（改动优先级）

| 优先级 | 内容 | 涉及文件 |
| --- | --- | --- |
| P0 视觉 | 蓝色毛玻璃主题 + 光斑 + 卡片质感 | `src/App.tsx`、`src/index.css` |
| P0 交互 | 侧栏滑动高亮指示器 + 默认页/nav 顺序 + 数字键热键 | `src/App.tsx`、`src/index.css` |
| P1 功能 | 概览「今日每小时用量」柱状图 + 溢出修复 | `src/pages/Dashboard.tsx` |
| P1 功能 | 扩展中心版本卡 redesign + 插件版本检测/刷新/一键更新不卡死 | `src/pages/Extensions.tsx`、类型/桥 |
| P2 细节 | 供应商/Agent 卡标题栏不换行、统计卡色条对齐、去冗余文案 | `src/index.css`、`src/pages/Agents.tsx`、`src/components/StatCard.tsx` |
| P2 类型 | `SkillLocation`、`PiPluginInfo`、`PiswitchApi` 新增方法 | `shared/types.ts` + preload |

---

## 1. 主题与配色（P0）

### 1.1 `src/App.tsx` — `ConfigProvider` 的 `theme`

把 antd token 从青绿改为蓝色（深/浅色均 `#0f6feb` 为主强调色）：

```ts
token: {
  colorPrimary: '#0f6feb',
  colorLink: '#2684ff',
  borderRadius: 6,
  controlHeight: 34,
  colorBgBase: isDark ? '#19191e' : '#f4f5f7',
  colorBgContainer: isDark ? '#202026' : '#ffffff',
  colorBgElevated: isDark ? '#27272e' : '#ffffff',
  colorBorder: isDark ? '#383840' : '#d8dce3',
  colorBorderSecondary: isDark ? '#303037' : '#e6e8ec',
  colorText: isDark ? '#f2f2f4' : '#202127',
  colorTextSecondary: isDark ? '#a1a1aa' : '#626772',
  colorTextTertiary: isDark ? '#71717b' : '#8b919c',
  colorSuccess: '#23b26d',
  colorWarning: '#d99328',
  colorError: '#e45454',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
},
components: {
  Button: { primaryShadow: 'none', defaultShadow: 'none' },
  Tabs: { inkBarColor: '#0f6feb', itemSelectedColor: isDark ? '#f2f2f4' : '#202127' },
  Table: { headerBg: isDark ? '#26262c' : '#f1f2f4', rowHoverBg: isDark ? '#27272e' : '#f7f8fa' },
  Modal: { contentBg: isDark ? '#202026' : '#ffffff' },
  Segmented: { itemSelectedBg: '#0f6feb', itemSelectedColor: '#ffffff' },
},
```

### 1.2 `src/index.css` — 毛玻璃变量（生效于文件末尾 `:root/[data-theme=dark]` 与 `[data-theme=light]` 两个 override 块）

核心：surface 半透明 + 背景渐变去紫改冷灰蓝。

深色：
```css
--ps-bg-gradient: linear-gradient(160deg, #15161b 0%, #1a212c 45%, #17242e 80%, #15161b 100%);
--ps-surface: rgba(255, 255, 255, 0.07);
--ps-surface-2: rgba(255, 255, 255, 0.11);
--ps-border: rgba(255, 255, 255, 0.12);
--ps-border-strong: rgba(255, 255, 255, 0.22);
--ps-sider-bg: rgba(28, 28, 32, 0.55);
--ps-code-bg: rgba(0, 0, 0, 0.28);
```

浅色：
```css
--ps-bg-gradient: linear-gradient(160deg, #eef0f4 0%, #e7eef6 45%, #e6f0f4 80%, #eef0f4 100%);
--ps-surface: rgba(255, 255, 255, 0.62);
--ps-surface-2: rgba(255, 255, 255, 0.78);
--ps-border: rgba(0, 0, 0, 0.08);
--ps-border-strong: rgba(0, 0, 0, 0.16);
--ps-sider-bg: rgba(255, 255, 255, 0.6);
--ps-code-bg: rgba(255, 255, 255, 0.6);
```

### 1.3 `src/index.css` — 背景光斑与卡片模糊

- `.ps-app-shell::before / ::after`：加两团大光斑（`filter: blur(90px)`），右上一团品牌蓝 `rgba(15,111,235,0.28)`、左下一团冰蓝 `rgba(75,165,216,0.20)`（**不要用紫色**，已去 AI 紫）。
- 卡片类统一加 `backdrop-filter: blur(24px) saturate(160%)`（含 `-webkit-` 前缀），选择器：
  `.ps-card, .ant-card, .ps-stat, .ps-provider-card, .ps-version-card, .ps-skill-card, .ant-modal .ant-modal-content`
- `.ps-main` 背景改 `transparent`（让光斑透出）；`.ps-sider` 恢复 `backdrop-filter: blur(24px) saturate(160%)`（旧版是 `none`）。
- 卡片圆角 `8px → 14px`，阴影加内侧顶部高光：
  `box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 28px rgba(0,0,0,0.12);`
  hover：`inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 36px rgba(0,0,0,0.18);`

---

## 2. 侧栏导航（P0）

### 2.1 `src/App.tsx`

- 默认页：`useState<PageKey>('dashboard')`（原 Electron 为 `'agents'`）。
- nav 顺序改为：概览（dashboard）→ Agent 配置（agents）→ 用量统计（stats）→ 扩展中心（extensions）。
- 新增数字键 1–4 热键切换（输入框聚焦时不触发）：
  ```ts
  const map = { '1': 'dashboard', '2': 'agents', '3': 'stats', '4': 'extensions' };
  ```
- 新增滑动高亮指示器（`useRef` + `useLayoutEffect`）：给 `<nav className="ps-nav" ref={navRef}>` 内插入 `<span className="ps-nav-indicator" ref={indicatorRef} aria-hidden="true" />`，并测量 active 项定位：
  ```ts
  useLayoutEffect(() => {
    const nav = navRef.current, indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const active = nav.querySelector('.ps-nav-item.active') as HTMLElement | null;
    if (!active) { indicator.style.opacity = '0'; return; }
    indicator.style.opacity = '1';
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.height = `${active.offsetHeight}px`;
  }, [page, config]);
  ```
- **⚠️ 关键坑（曾致白屏）**：`useRef` / `useLayoutEffect` 必须放在组件顶层、`if (!config) return …` **之前**，否则 hook 数量在两次渲染间不一致，触发 `Rendered more hooks than during the previous render` 白屏。

### 2.2 `src/index.css`

```css
.ps-nav { position: relative; gap: 5px; }
.ps-nav-indicator {
  position: absolute; top: 0; left: 0; right: 0; height: 42px;
  border-radius: 7px; background: var(--ps-accent);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--ps-accent) 24%, transparent);
  opacity: 0; pointer-events: none; z-index: 0;
  transition: transform .28s cubic-bezier(.4,0,.2,1), height .28s cubic-bezier(.4,0,.2,1), opacity .2s ease;
}
.ps-nav-item { position: relative; z-index: 1; background: transparent; transition: color 160ms ease, background-color 160ms ease; }
.ps-nav-item:hover:not(.active) { background: var(--ps-surface-2); }
.ps-nav-item.active { color: #ffffff; font-weight: 600; background: transparent; }
```
（active 的背景/阴影改由指示器承载，item 自身只变白字；`:active` 规则里移除 nav item 的 `translateY`，避免跳动。）

---

## 3. 概览 Dashboard（P1）

`src/pages/Dashboard.tsx`：
- 新增「今日每小时用量」柱状图：`window.piswitch.getHourlyTrend()`（Electron preload 已有该方法），`useMemo` 组装 `HourlyAgg[]`（0–23 时，每小时 input+output+cacheRead+cacheWrite 总量，label `HH:00`），用 `EChart` 渲染 bar。
- 「Agent 绑定状态」Tag 加省略：`maxWidth: 360; overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap; display: inline-block`。
- 「用量速览」启动按钮容器 `Space` 改 `wrap`，防横向溢出。

---

## 4. 扩展中心 Extensions（P1）

`src/pages/Extensions.tsx`：
- 版本卡 redesign：用 `ToolIcon` 替换原来的圆点（`ps-version-dot`），3 段式布局（head/versions/action），移除 `UPGRADE_HINT` 常量与命令展示行。
- 新增「刷新」按钮 + 加载态「正在检测插件版本…」。
- `getPiPluginVersions` 改成后台异步 + 15s 超时，init 返回完整数据（后台线程继续完成剩余探测）。

### 4.1 插件「全部更新」不卡死（语义，需 Electron 侧对应确认）

Tauri 版根因：升级命令在主线程同步跑多个 `npm install`（单个最长 180s）导致 UI 未响应。
修复：
- 升级命令 async 化（`upgrade_all_pi_plugins` / `upgrade_pi_plugin` / `upgrade_tool` → `spawn_blocking`）。
- `upgrade_all_pi_plugins` 由「逐个 `npm install`」改为「一次性 `npm install pkg1@latest pkg2@latest …`」（超时 600s）。
- Windows 子进程切目录用 `Command::current_dir()`，**禁止**在 `cmd /C` 命令行拼 `cd /d "…"`（Rust `\"` 转义与 cmd 引号剥离冲突，报 error 123）。

> Electron 版需确认其 `ipc.ts`/主进程里对应升级实现是否已异步、是否存在等价问题；逻辑语义照此对齐即可。

---

## 5. 细节修复（P2）

- `src/pages/Agents.tsx`：删除页面顶部 `title-desc` 文案「每个 Agent 独立配置供应商、绑定与精确统计，互不影响」。
- `src/index.css`：
  - `.ps-agent-config-card > .ps-card-head` 加 `flex-wrap: nowrap` + `overflow-x: auto`；`.ps-card-title` / `.ant-space` 子项 `flex-shrink: 0`；`.ps-bind-label` / `.ps-head-toggle .ps-bind-label` 加 `white-space: nowrap`（解决 codex 出现「推理」时标题栏换行）。
  - `.ps-stat .label` 加 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`；`.ps-stat .value` 加 `overflow-wrap: break-word`。
- `src/components/StatCard.tsx`：统计卡左侧 3px 品牌色条（`.ps-stat::before`）改回纯色条（无 glow），与卡头对齐。

---

## 6. 类型与桥（P2）

`shared/types.ts`：
```ts
export type SkillLocation = Tool;   // 原为 'user' | 'claude' | 'codex' | 'opencode'

export interface PiPluginInfo {
  name: string;
  version?: string;   // npm 全局已安装版本
  latest?: string;    // registry 最新版本
  updateAvailable?: boolean;  // true=有新版本 / false=最新 / undefined=无法判断
}

// PiswitchApi 新增：
getPiPluginVersions(): Promise<PiPluginInfo[]>;
upgradePiPlugin(pkg: string): Promise<{ ok: boolean; output?: string; error?: string }>;
upgradeAllPiPlugins(): Promise<{ ok: boolean; output?: string; error?: string }>;
```

> Electron 侧在 `electron/preload.ts` 的 `api` 对象里对应补这三个方法（`ipcRenderer.invoke('piswitch:getPiPluginVersions')` 等），并在 `electron/ipc.ts` 实现。

---

## 7. Electron 版专属注意项

1. **保留 `ErrorBoundary`**：Rust 版去掉了 `ErrorBoundary`（组件精简），但 Electron 版应**保留** `src/components/ErrorBoundary.tsx` 及其包裹，仅在其内部套用上述 nav/配色改动，不要照搬 Rust 版删掉它。
2. **桥实现不同**：Rust 版用 `src/piswitchBridge.ts`（Tauri `invoke`），Electron 版用 `electron/preload.ts`（`contextBridge` + `ipcRenderer`）。前端只依赖 `window.piswitch.*` 与 `PiswitchApi` 类型，方法名保持一致即可，**不要**把 `piswitchBridge.ts` 复制过去。
3. **余额解析重构**：Rust 版把 `extractBalance` / `joinBalanceUrl` 抽到 `src/providerBalance.ts`（`BalanceKind` 类型）。Electron 版若也需要同样重构可参考，但非必须（现有实现可保持不变）。
4. **图标**：Rust 版更新了 `src-tauri/icons/*`（应用图标），Electron 版对应资源在 `resources/` / `build/`，如需统一图标需另行替换（本文不涉及）。

---

## 8. 验证建议（同步完成后）

- 双击启动，确认：概览为默认首页、侧栏高亮块平滑滑动、codex 出现「推理」时标题栏不换行、概览无横向溢出且小时图渲染、「全部更新」点击不卡死、版本卡显示 ToolIcon。
- 深/浅色两套主题各过一遍（蓝色毛玻璃在浅色下光斑应更淡）。
