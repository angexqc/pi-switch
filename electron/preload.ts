import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig, AppSettings, BackupEntry, PiswitchApi, StatsQuery, StatsRange, Tool } from '../shared/types';

const api: PiswitchApi = {
  // 配置
  getConfig: () => ipcRenderer.invoke('piswitch:getConfig'),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('piswitch:saveConfig', config),
  // 供应商（按 Agent 隔离）
  addProvider: (tool, p) => ipcRenderer.invoke('piswitch:addProvider', tool, p),
  updateProvider: (tool, p) => ipcRenderer.invoke('piswitch:updateProvider', tool, p),
  deleteProvider: (tool, id) => ipcRenderer.invoke('piswitch:deleteProvider', tool, id),
  testProvider: (tool, id) => ipcRenderer.invoke('piswitch:testProvider', tool, id),
  queryProviderBalance: (tool, id) => ipcRenderer.invoke('piswitch:queryProviderBalance', tool, id),
  getToolStatus: () => ipcRenderer.invoke('piswitch:getToolStatus'),
  applyBindings: (tools?: Tool[]) => ipcRenderer.invoke('piswitch:applyBindings', tools),
  applyProfile: (profileId: string, tools?: Tool[]) => ipcRenderer.invoke('piswitch:applyProfile', profileId, tools),
  saveProfile: (name: string, agents?: AppConfig['agents']) => ipcRenderer.invoke('piswitch:saveProfile', name, agents),
  deleteProfile: (id: string) => ipcRenderer.invoke('piswitch:deleteProfile', id),
  // 配置源码
  getRawConfig: (tool: Tool) => ipcRenderer.invoke('piswitch:getRawConfig', tool),
  saveRawConfig: (tool: Tool, fileName: string, content: string) => ipcRenderer.invoke('piswitch:saveRawConfig', tool, fileName, content),
  // 备份
  getBackups: (tool?: Tool) => ipcRenderer.invoke('piswitch:getBackups', tool),
  restoreBackup: (entry: BackupEntry) => ipcRenderer.invoke('piswitch:restoreBackup', entry),
  importFromPiswitch: (apply: boolean) => ipcRenderer.invoke('piswitch:importFromPiswitch', apply),
  hasOldPiswitch: () => ipcRenderer.invoke('piswitch:hasOldPiswitch'),
  previewImport: () => ipcRenderer.invoke('piswitch:previewImport'),
  // 配置导入（cc-switch / codex 自身 / claude 自身）
  scanImportSources: () => ipcRenderer.invoke('piswitch:scanImportSources'),
  applyImportSource: (key: 'ccs' | 'codex' | 'claude', selectedIds: string[]) =>
    ipcRenderer.invoke('piswitch:applyImportSource', key, selectedIds),
  // 用量统计
  getStatsSummary: (range?: StatsRange) => ipcRenderer.invoke('piswitch:getStatsSummary', range),
  getDailyTrend: (days?: number) => ipcRenderer.invoke('piswitch:getDailyTrend', days),
  getHourlyTrend: () => ipcRenderer.invoke('piswitch:getHourlyTrend'),
  getStatsPage: (q: StatsQuery) => ipcRenderer.invoke('piswitch:getStatsPage', q),
  refreshStats: () => ipcRenderer.invoke('piswitch:refreshStats'),
  getStatsAutoUpdate: () => ipcRenderer.invoke('piswitch:getStatsAutoUpdate'),
  exportCsv: (q: StatsQuery) => ipcRenderer.invoke('piswitch:exportCsv', q),
  // 代理
  setProxyEnabled: (tool: Tool, enabled: boolean) => ipcRenderer.invoke('piswitch:setProxyEnabled', tool, enabled),
  setProxyPort: (tool: Tool, port: number) => ipcRenderer.invoke('piswitch:setProxyPort', tool, port),
  setProxyGlobal: (enabled: boolean) => ipcRenderer.invoke('piswitch:setProxyGlobal', enabled),
  getProxyStatus: () => ipcRenderer.invoke('piswitch:getProxyStatus'),
  // 启动工具
  launchTool: (tool: Tool, cwd?: string) => ipcRenderer.invoke('piswitch:launchTool', tool, cwd),
  // 设置
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    ipcRenderer.invoke('piswitch:setSetting', key, value),
  // 窗口控制
  hideWindow: () => ipcRenderer.invoke('piswitch:hideWindow'),
  exitApp: () => ipcRenderer.invoke('piswitch:exitApp'),
  // 系统
  openPath: (p: string) => ipcRenderer.invoke('piswitch:openPath', p),
  openDataDir: () => ipcRenderer.invoke('piswitch:openDataDir'),
  getPaths: () => ipcRenderer.invoke('piswitch:getPaths'),
  pickDirectory: () => ipcRenderer.invoke('piswitch:pickDirectory'),
  getMcpServers: () => ipcRenderer.invoke('piswitch:getMcpServers'),
  saveMcpServer: (tool, name, cfg) => ipcRenderer.invoke('piswitch:saveMcpServer', tool, name, cfg),
  deleteMcpServer: (tool, name) => ipcRenderer.invoke('piswitch:deleteMcpServer', tool, name),
  getMcpAggregated: () => ipcRenderer.invoke('piswitch:getMcpAggregated'),
  applyMcpToAgent: (tool, name) => ipcRenderer.invoke('piswitch:applyMcpToAgent', tool, name),
  saveMcpForAgents: (name, cfg, tools) => ipcRenderer.invoke('piswitch:saveMcpForAgents', name, cfg, tools),
  deleteMcpEverywhere: (name) => ipcRenderer.invoke('piswitch:deleteMcpEverywhere', name),
  getSkills: () => ipcRenderer.invoke('piswitch:getSkills'),
  deleteSkill: (location, name) => ipcRenderer.invoke('piswitch:deleteSkill', location, name),
  getSkillsAggregated: () => ipcRenderer.invoke('piswitch:getSkillsAggregated'),
  installSkillToAgent: (name, tool) => ipcRenderer.invoke('piswitch:installSkillToAgent', name, tool),
  getPiPlugins: () => ipcRenderer.invoke('piswitch:getPiPlugins'),
  addPiPlugin: (pkg) => ipcRenderer.invoke('piswitch:addPiPlugin', pkg),
  removePiPlugin: (pkg) => ipcRenderer.invoke('piswitch:removePiPlugin', pkg),
  getPiPluginVersions: () => ipcRenderer.invoke('piswitch:getPiPluginVersions'),
  upgradePiPlugin: (pkg) => ipcRenderer.invoke('piswitch:upgradePiPlugin', pkg),
  upgradeAllPiPlugins: () => ipcRenderer.invoke('piswitch:upgradeAllPiPlugins'),
  deleteSkillEverywhere: (name) => ipcRenderer.invoke('piswitch:deleteSkillEverywhere', name),
  getPromptFiles: () => ipcRenderer.invoke('piswitch:getPromptFiles'),
  readPromptFile: (p) => ipcRenderer.invoke('piswitch:readPromptFile', p),
  savePromptFile: (p, content) => ipcRenderer.invoke('piswitch:savePromptFile', p, content),
  createPromptFile: (scope, name, content) => ipcRenderer.invoke('piswitch:createPromptFile', scope, name, content),
  deletePromptFile: (p) => ipcRenderer.invoke('piswitch:deletePromptFile', p),
  getToolVersions: () => ipcRenderer.invoke('piswitch:getToolVersions'),
  upgradeTool: (tool) => ipcRenderer.invoke('piswitch:upgradeTool', tool),
  getSystemPrompt: () => ipcRenderer.invoke('piswitch:getSystemPrompt'),
  enableSystemPrompt: (name) => ipcRenderer.invoke('piswitch:enableSystemPrompt', name),
  saveSystemPrompt: (name, content, isActive) => ipcRenderer.invoke('piswitch:saveSystemPrompt', name, content, isActive),
  saveActiveSystemPrompt: (content) => ipcRenderer.invoke('piswitch:saveActiveSystemPrompt', content),
  deleteSystemPromptCandidate: (name) => ipcRenderer.invoke('piswitch:deleteSystemPromptCandidate', name),
  runSkillsCommand: (args) => ipcRenderer.invoke('piswitch:runSkillsCommand', args),
  openExternal: (url) => ipcRenderer.invoke('piswitch:openExternal', url),
  onConfigChanged: (cb: (config: AppConfig) => void) => {
    const listener = () => {
      void ipcRenderer.invoke('piswitch:getConfig').then(cb);
    };
    ipcRenderer.on('piswitch:config-changed', listener);
    return () => ipcRenderer.removeListener('piswitch:config-changed', listener);
  },
  onStatsChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('piswitch:stats-changed', listener);
    return () => ipcRenderer.removeListener('piswitch:stats-changed', listener);
  },
  onCloseRequested: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('piswitch:close-requested', listener);
    return () => ipcRenderer.removeListener('piswitch:close-requested', listener);
  },
};

contextBridge.exposeInMainWorld('piswitch', api);
