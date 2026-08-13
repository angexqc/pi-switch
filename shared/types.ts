/**
 * PiSwitch 共享类型定义（主进程 / 渲染进程共用，仅类型）。
 * v2：每个 Agent 拥有独立的供应商库与绑定选择。
 */

export type Tool = 'pi' | 'codex' | 'claude' | 'opencode';

export type ApiKind = 'anthropic-messages' | 'openai-completions' | 'openai-responses';

export interface Model {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  /** 价格：USD / 1M tokens */
  priceInput?: number;
  priceOutput?: number;
  priceCacheRead?: number;
  priceCacheWrite?: number;
}

export interface Provider {
  id: string;
  name: string;
  api: ApiKind;
  baseUrl: string;
  apiKeyEnv?: string;
  apiKeyLiteral?: string;
  headers?: Record<string, string>;
  models: Model[];
}

/**
 * 单个 Agent 的完整配置：专属供应商库 + 当前绑定选择 + 附加选项。
 * 每个工具（pi/codex/claude/opencode）各自维护一份，互不影响。
 */
export interface AgentConfig {
  tool: Tool;
  /** 是否参与统一切换 / 一键应用 */
  enabled: boolean;
  providerId: string;
  modelId: string;
  /** codex: model_reasoning_effort */
  reasoningEffort?: string;
  /** 该工具是否开启精确统计代理（开启时会自动启用全局代理） */
  proxyEnabled?: boolean;
  /** claude 附加 env */
  envOverrides?: Record<string, string>;
  /** 该 Agent 专属供应商库 */
  providers: Provider[];
}

export type Agents = Record<Tool, AgentConfig>;

/** Profile 快照：仅保存各 Agent 的选择（不含供应商库） */
export interface AgentSelection {
  enabled: boolean;
  providerId: string;
  modelId: string;
  reasoningEffort?: string;
  proxyEnabled?: boolean;
  envOverrides?: Record<string, string>;
}

export interface Profile {
  id: string;
  name: string;
  agents: Record<Tool, AgentSelection>;
}

export interface ProxySettings {
  enabled: boolean;
  /** 每工具端口 */
  ports: Record<Tool, number>;
}

export type CloseAction = 'ask' | 'minimize' | 'exit';

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  backupRetention: number;
  autoStart: boolean;
  minimizeToTray: boolean;
  /** 点击关闭按钮时的行为：ask=弹窗询问 / minimize=最小化到托盘 / exit=直接退出 */
  closeAction: CloseAction;
  /** 各工具 CLI 路径（可修正） */
  cliPaths: Record<Tool, string>;
  /** 各工具工作目录（启动终端用） */
  workingDirs: Record<Tool, string>;
  proxy: ProxySettings;
  importedFromPiswitch: boolean;
}

export interface AppConfig {
  version: 2;
  agents: Agents;
  profiles: Profile[];
  settings: AppSettings;
}

export type StatsSource = 'proxy' | 'pi-log' | 'claude-log' | 'codex-log' | 'opencode-log';

export type StatsStatus = 'ok' | 'no-usage' | 'error';

export interface UsageRecord {
  id: number;
  ts: number;
  source: StatsSource;
  tool: Tool;
  providerId: string;
  model: string;
  endpoint?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd?: number;
  status: StatsStatus;
}

/** 切换结果（每工具） */
export interface SwitchResult {
  tool: Tool;
  ok: boolean;
  error?: string;
  backupPath?: string;
  configPath?: string;
}

export interface ToolStatus {
  tool: Tool;
  configPath: string;
  exists: boolean;
  /** 当前配置文件中读取到的 provider/model（尽力解析） */
  currentProvider?: string;
  currentModel?: string;
  proxyEnabled: boolean;
}

/** 配置文件源码（原始编辑用） */
export interface RawConfigFile {
  name: string;
  path: string;
  content: string;
  exists: boolean;
  /** 提示信息（如受管字段说明） */
  hint?: string;
}

export interface BackupEntry {
  tool: Tool;
  path: string;
  timestamp: number;
  size: number;
}

export interface DailyAgg {
  day: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requests: number;
}

/** 今日按小时聚合（0-23，本地时区） */
export interface HourlyAgg {
  hour: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requests: number;
}

export interface ModelAgg {
  key: string; // tool|providerId|model
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requests: number;
}

export type StatsRange = 'today' | '7d' | '30d' | 'all';

export interface StatsSummary {
  today: DailyAgg;
  week: DailyAgg;
  month: DailyAgg;
  total: DailyAgg;
  byTool: ModelAgg[];
  byModel: ModelAgg[];
}

export interface StatsQuery {
  from?: number;
  to?: number;
  tool?: Tool | 'all';
  model?: string;
  source?: StatsSource | 'all';
  limit?: number;
  offset?: number;
}

export interface StatsPage {
  records: UsageRecord[];
  total: number;
}

export interface RefreshResult {
  sources: { source: StatsSource; scanned: number; inserted: number; skipped: number; error?: string }[];
}

/** 用量统计自动更新信息（主进程调度参数 + 最近一次扫描时间） */
export interface StatsAutoUpdate {
  /** 自动扫描间隔（毫秒） */
  intervalMs: number;
  /** 最近一次自动/手动扫描完成时间戳（0 = 尚未扫描） */
  lastScanAt: number;
}

export interface ImportResult {
  importedProviders: number;
  importedModels: number;
  bindingsApplied: boolean;
  errors: string[];
}

/** 配置导入：单个可导入供应商的预览（密钥仅掩码回显） */
export interface ImportProviderPreview {
  id: string;
  name: string;
  api: ApiKind;
  baseUrl: string;
  apiKeyMasked?: string;
  models: { id: string; name?: string; priceInput?: number; priceOutput?: number }[];
}

/** 配置导入：一个来源的完整预览（cc-switch / codex 自身 / claude 自身） */
export interface ImportSourcePreview {
  key: 'ccs' | 'codex' | 'claude';
  label: string;
  sourcePath: string;
  providers: ImportProviderPreview[];
}
export interface LaunchResult {
  ok: boolean;
  error?: string;
  pid?: number;
}

// ---------- 扩展中心 ----------

export interface McpServerInfo {
  name: string;
  /** stdio | sse | http | unknown */
  type: string;
  command?: string;
  url?: string;
  enabled?: boolean;
  raw?: Record<string, unknown>;
}

export interface McpSnapshot {
  tool: Tool;
  file?: string;
  servers: McpServerInfo[];
}

/** 某 Agent 对某 MCP 的使用状态 */
export interface McpAgentState {
  present: boolean;
  enabled: boolean;
}

/** 跨 Agent 聚合后的 MCP 服务器（按名称去重） */
export interface McpAggItem {
  name: string;
  type: string;
  command?: string;
  url?: string;
  /** 参考配置（第一个含该服务器的 Agent 的原始配置） */
  raw?: Record<string, unknown>;
  agents: Partial<Record<Tool, McpAgentState>>;
}

/** 跨 Agent 聚合后的 Skill（按名称去重） */
export interface SkillAggItem {
  name: string;
  description: string;
  /** 参考源目录（第一个存在的位置） */
  path: string;
  /** true = 已安装到该 Agent */
  agents: Partial<Record<Tool, boolean>>;
}
export type SkillLocation = Tool;

export interface SkillItem {
  location: SkillLocation;
  locationLabel: string;
  name: string;
  description: string;
  path: string;
}

export type PromptScope = 'claude-commands' | 'claude-prompts' | 'pi-prompts';

export interface PromptFile {
  scope: PromptScope;
  scopeLabel: string;
  name: string;
  path: string;
}

export interface ToolVersion {
  tool: Tool;
  version?: string;
  found: boolean;
  /** npm registry 最新版本（无法获取时为 undefined） */
  latest?: string;
  /** true=有新版本 / false=已是最新 / undefined=无法判断 */
  updateAvailable?: boolean;
  error?: string;
}

/** Pi Agent 插件版本信息（~/.pi/agent/settings.json → packages） */
export interface PiPluginInfo {
  name: string;
  version?: string; // npm 全局已安装版本
  latest?: string; // registry 最新版本
  updateAvailable?: boolean; // true=有新版本 / false=最新 / undefined=无法判断
}

export interface SystemPromptCandidate {
  name: string;
  content: string;
  active: boolean;
}

export interface SystemPromptInfo {
  /** 当前生效的系统提示词（~/.pi/agent/SYSTEM.md） */
  active: { name?: string; content: string } | null;
  /** 候选模板（~/.pi/agent/prompts/system-prompts/*.md） */
  candidates: SystemPromptCandidate[];
}

/** 渲染进程可通过 window.piswitch 调用的 IPC API */
export interface PiswitchApi {
  // 配置
  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<AppConfig>;
  // 供应商（按 Agent 隔离）
  addProvider(tool: Tool, p: Provider): Promise<AppConfig>;
  updateProvider(tool: Tool, p: Provider): Promise<AppConfig>;
  deleteProvider(tool: Tool, id: string): Promise<AppConfig>;
  testProvider(tool: Tool, id: string): Promise<{ ok: boolean; message: string; latencyMs?: number }>;
  queryProviderBalance(tool: Tool, id: string): Promise<{
    ok: boolean;
    balance?: number;
    totalGranted?: number;
    totalUsed?: number;
    hardLimit?: number;
    currency?: string;
    error?: string;
  }>;
  // 切换
  getToolStatus(): Promise<ToolStatus[]>;
  applyBindings(tools?: Tool[]): Promise<SwitchResult[]>;
  applyProfile(profileId: string, tools?: Tool[]): Promise<SwitchResult[]>;
  saveProfile(name: string, agents?: AppConfig['agents']): Promise<AppConfig>;
  deleteProfile(id: string): Promise<AppConfig>;
  // 配置源码
  getRawConfig(tool: Tool): Promise<RawConfigFile[]>;
  saveRawConfig(tool: Tool, fileName: string, content: string): Promise<SwitchResult>;
  // 备份
  getBackups(tool?: Tool): Promise<BackupEntry[]>;
  restoreBackup(entry: BackupEntry): Promise<SwitchResult>;
  importFromPiswitch(apply: boolean): Promise<ImportResult>;
  hasOldPiswitch(): Promise<boolean>;
  previewImport(): Promise<{ id: string; name: string; models: number }[]>;
  // 配置导入（cc-switch / codex 自身 / claude 自身）
  scanImportSources(): Promise<ImportSourcePreview[]>;
  applyImportSource(key: 'ccs' | 'codex' | 'claude', selectedIds: string[]): Promise<ImportResult>;
  // 用量统计
  getStatsSummary(range?: StatsRange): Promise<StatsSummary>;
  getDailyTrend(days?: number): Promise<DailyAgg[]>;
  getHourlyTrend(): Promise<HourlyAgg[]>;
  getStatsPage(query: StatsQuery): Promise<StatsPage>;
  refreshStats(): Promise<RefreshResult>;
  getStatsAutoUpdate(): Promise<StatsAutoUpdate>;
  exportCsv(query: StatsQuery): Promise<{ path: string }>;
  // 代理
  setProxyEnabled(tool: Tool, enabled: boolean): Promise<AppConfig>;
  setProxyPort(tool: Tool, port: number): Promise<AppConfig>;
  setProxyGlobal(enabled: boolean): Promise<AppConfig>;
  getProxyStatus(): Promise<Record<Tool, { running: boolean; port: number; enabled: boolean }>>;
  // 启动工具
  launchTool(tool: Tool, cwd?: string): Promise<LaunchResult>;
  // 设置
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppConfig>;
  // 窗口控制
  hideWindow(): Promise<void>;
  exitApp(): Promise<void>;
  // 系统
  openPath(path: string): Promise<void>;
  openDataDir(): Promise<void>;
  getPaths(): Promise<{ dataDir: string; piswitchOldDir?: string }>;
  pickDirectory(): Promise<string | undefined>;
  // 扩展中心
  getMcpServers(): Promise<McpSnapshot[]>;
  saveMcpServer(tool: Tool, name: string, cfg: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>;
  deleteMcpServer(tool: Tool, name: string): Promise<{ ok: boolean; error?: string }>;
  getMcpAggregated(): Promise<McpAggItem[]>;
  applyMcpToAgent(tool: Tool, name: string): Promise<{ ok: boolean; error?: string }>;
  saveMcpForAgents(name: string, cfg: Record<string, unknown>, tools: Tool[]): Promise<{ ok: boolean; error?: string }>;
  deleteMcpEverywhere(name: string): Promise<{ ok: boolean; error?: string }>;
  getSkills(): Promise<SkillItem[]>;
  deleteSkill(location: SkillLocation, name: string): Promise<{ ok: boolean; error?: string }>;
  getSkillsAggregated(): Promise<SkillAggItem[]>;
  installSkillToAgent(name: string, tool: Tool): Promise<{ ok: boolean; error?: string }>;
  deleteSkillEverywhere(name: string): Promise<{ ok: boolean; error?: string }>;
  getPiPlugins(): Promise<string[]>;
  addPiPlugin(pkg: string): Promise<{ ok: boolean; error?: string }>;
  removePiPlugin(pkg: string): Promise<{ ok: boolean; error?: string }>;
  getPiPluginVersions(): Promise<PiPluginInfo[]>;
  upgradePiPlugin(pkg: string): Promise<{ ok: boolean; output?: string; error?: string }>;
  upgradeAllPiPlugins(): Promise<{ ok: boolean; output?: string; error?: string }>;
  getPromptFiles(): Promise<PromptFile[]>;
  readPromptFile(path: string): Promise<string>;
  savePromptFile(path: string, content: string): Promise<{ ok: boolean; error?: string }>;
  createPromptFile(scope: PromptScope, name: string, content: string): Promise<{ ok: boolean; error?: string; path?: string }>;
  deletePromptFile(path: string): Promise<{ ok: boolean; error?: string }>;
  // 版本监测与升级
  getToolVersions(): Promise<ToolVersion[]>;
  upgradeTool(tool: Tool): Promise<{ ok: boolean; output?: string; error?: string }>;
  // 系统提示词（Pi：~/.pi/agent/SYSTEM.md）
  getSystemPrompt(): Promise<SystemPromptInfo>;
  enableSystemPrompt(name: string): Promise<{ ok: boolean; error?: string }>;
  saveSystemPrompt(name: string, content: string, isActive?: boolean): Promise<{ ok: boolean; error?: string }>;
  saveActiveSystemPrompt(content: string): Promise<{ ok: boolean; error?: string }>;
  deleteSystemPromptCandidate(name: string): Promise<{ ok: boolean; error?: string }>;
  // skills.sh 市场（npx skills CLI）
  runSkillsCommand(args: string[]): Promise<{ ok: boolean; output?: string; error?: string }>;
  openExternal(url: string): Promise<void>;
  onConfigChanged(cb: (config: AppConfig) => void): () => void;
  onStatsChanged(cb: () => void): () => void;
  /** 用户点击关闭按钮且 closeAction=ask 时触发 */
  onCloseRequested(cb: () => void): () => void;
}
