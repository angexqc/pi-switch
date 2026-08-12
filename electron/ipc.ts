import { ipcMain, shell, dialog } from 'electron';
import type { AppConfig, AppSettings, BackupEntry, StatsQuery, StatsRange, Tool } from '../shared/types';
import { loadConfig, saveConfig, validateConfig, ensureDataDir } from './switch-engine/app-config';
import {
  applyBindings,
  applyProfile,
  applyTool,
  deleteProfile,
  getConfig,
  saveProfile,
  updateConfig,
} from './switch-engine/switch-service';
import { getToolStatus } from './switch-engine/status';
import { listBackups, restoreBackup } from './switch-engine/backup';
import { hasOldPiswitchConfig, importFromPiswitch, buildImport } from './switch-engine/migrate';
import { scanImportSources, applyImportSource } from './switch-engine/importers';
import { getSummary, getDailyTrend, getHourlyTrend, getStatsPage, exportCsv } from './stats/aggregator';
import { scanAllLogs } from './stats/parsers';
import { getStatsScanInfo, touchStatsScan } from './stats/scan-state';
import { emit } from './util/bus';
import { launchTool } from './services/launcher';
import { setAutoStart } from './services/autostart';
import { dataDir, oldPiswitchDir } from './util/paths';
import { DEFAULT_PROXY_PORTS } from './constants';
import { testProviderConnection } from './services/provider-test';
import { queryProviderBalance } from './services/balance';
import { getRawConfigFiles, saveRawConfigFile } from './switch-engine/raw-config';
import { agentProvider, agentModel } from './switch-engine/app-config';
import {
  getMcpServers,
  saveMcpServer,
  deleteMcpServer,
  getSkills,
  deleteSkill,
  getPiPlugins,
  addPiPlugin,
  removePiPlugin,
  getPromptFiles,
  readPromptFile,
  savePromptFile,
  createPromptFile,
  deletePromptFile,
  getSystemPrompt,
  enableSystemPrompt,
  saveSystemPrompt,
  saveActiveSystemPrompt,
  deleteSystemPromptCandidate,
  getMcpAggregated,
  applyMcpToAgent,
  saveMcpForAgents,
  deleteMcpEverywhere,
  getSkillsAggregated,
  installSkillToAgent,
  deleteSkillEverywhere,
} from './services/extensions';
import { getToolVersions, upgradeTool, runSkillsCommand } from './services/updater';
import type { PromptScope, SkillLocation } from '../shared/types';
import type { ProxyManager } from './proxy/server';

export function registerIpc(proxyManager: ProxyManager, win: () => Electron.BrowserWindow | null): void {
  ipcMain.handle('piswitch:getConfig', () => getConfig());
  ipcMain.handle('piswitch:saveConfig', async (_e, config: AppConfig) => saveConfig(validateConfig(config)));

  // 供应商（按 Agent 隔离）
  ipcMain.handle('piswitch:addProvider', async (_e, tool: Tool, p) => updateConfig((cfg) => {
    const lib = cfg.agents[tool].providers;
    if (lib.some((x) => x.id === p.id)) throw new Error('供应商 ID 已存在');
    lib.push(p);
  }));
  ipcMain.handle('piswitch:updateProvider', async (_e, tool: Tool, p) => updateConfig((cfg) => {
    const lib = cfg.agents[tool].providers;
    const idx = lib.findIndex((x) => x.id === p.id);
    if (idx < 0) throw new Error('供应商不存在');
    lib[idx] = p;
  }));
  ipcMain.handle('piswitch:deleteProvider', async (_e, tool: Tool, id) => updateConfig((cfg) => {
    const agent = cfg.agents[tool];
    agent.providers = agent.providers.filter((x) => x.id !== id);
    if (agent.providerId === id) {
      agent.providerId = '';
      agent.modelId = '';
      agent.enabled = false;
    }
  }));
  ipcMain.handle('piswitch:testProvider', async (_e, tool: Tool, id) => {
    const cfg = loadConfig();
    const p = agentProvider(cfg.agents[tool], id);
    if (!p) return { ok: false, message: '供应商不存在' };
    return testProviderConnection(p, cfg.agents);
  });
  ipcMain.handle('piswitch:queryProviderBalance', async (_e, tool: Tool, id) => {
    const cfg = loadConfig();
    const p = agentProvider(cfg.agents[tool], id);
    if (!p) return { ok: false, error: '供应商不存在' };
    const key = p.apiKeyLiteral ?? (p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined);
    return queryProviderBalance(p.baseUrl, p.api, key);
  });

  ipcMain.handle('piswitch:getToolStatus', () => getToolStatus());
  ipcMain.handle('piswitch:applyBindings', async (_e, tools?: Tool[]) => applyBindings(tools));
  ipcMain.handle('piswitch:applyProfile', async (_e, profileId: string, tools?: Tool[]) => applyProfile(profileId, tools));
  ipcMain.handle('piswitch:saveProfile', async (_e, name: string, agents?: AppConfig['agents']) => saveProfile(name, agents));
  ipcMain.handle('piswitch:deleteProfile', async (_e, id: string) => deleteProfile(id));

  // 配置源码
  ipcMain.handle('piswitch:getRawConfig', (_e, tool: Tool) => getRawConfigFiles(tool));
  ipcMain.handle('piswitch:saveRawConfig', async (_e, tool: Tool, fileName: string, content: string) => {
    const r = await saveRawConfigFile(tool, fileName, content);
    if (r.ok) emit('configChanged');
    return r;
  });

  ipcMain.handle('piswitch:getBackups', (_e, tool?: Tool) => listBackups(tool));
  ipcMain.handle('piswitch:restoreBackup', async (_e, entry: BackupEntry) => {
    const r = restoreBackup(entry, loadConfig().settings.backupRetention);
    emit('configChanged');
    return { tool: entry.tool, ok: r.ok, error: r.error, configPath: r.configPath, backupPath: (r as { backupPath?: string }).backupPath };
  });

  ipcMain.handle('piswitch:importFromPiswitch', async (_e, apply: boolean) => importFromPiswitch(apply));
  ipcMain.handle('piswitch:hasOldPiswitch', () => hasOldPiswitchConfig());
  ipcMain.handle('piswitch:previewImport', () => buildImport().providers.map((p) => ({ id: p.id, name: p.name, models: p.models.length })));
  // 配置导入（cc-switch / codex 自身 / claude 自身）
  ipcMain.handle('piswitch:scanImportSources', () => scanImportSources());
  ipcMain.handle('piswitch:applyImportSource', (_e, key: 'ccs' | 'codex' | 'claude', selectedIds: string[]) => applyImportSource(key, selectedIds));

  // 统计
  ipcMain.handle('piswitch:getStatsSummary', (_e, range?: StatsRange) => getSummary(range));
  ipcMain.handle('piswitch:getDailyTrend', (_e, days?: number) => getDailyTrend(days));
  ipcMain.handle('piswitch:getHourlyTrend', () => getHourlyTrend());
  ipcMain.handle('piswitch:getStatsPage', (_e, q: StatsQuery) => getStatsPage(q));
  ipcMain.handle('piswitch:refreshStats', async () => {
    const r = scanAllLogs();
    touchStatsScan();
    emit('statsChanged');
    return { sources: r };
  });
  ipcMain.handle('piswitch:getStatsAutoUpdate', () => getStatsScanInfo());
  ipcMain.handle('piswitch:exportCsv', async (_e, q: StatsQuery) => exportCsv(q));

  // 代理
  ipcMain.handle('piswitch:setProxyEnabled', async (_e, tool: Tool, enabled: boolean) => {
    const cfg = await updateConfig((c) => {
      if (c.agents[tool]) c.agents[tool].proxyEnabled = enabled;
    });
    await syncProxy(cfg, proxyManager);
    return cfg;
  });
  ipcMain.handle('piswitch:setProxyPort', async (_e, tool: Tool, port: number) => {
    const cfg = await updateConfig((c) => {
      c.settings.proxy.ports[tool] = port;
    });
    await syncProxy(cfg, proxyManager);
    return cfg;
  });
  ipcMain.handle('piswitch:setProxyGlobal', async (_e, enabled: boolean) => {
    const cfg = await updateConfig((c) => {
      c.settings.proxy.enabled = enabled;
    });
    await syncProxy(cfg, proxyManager);
    return cfg;
  });
  ipcMain.handle('piswitch:getProxyStatus', () => {
    const cfg = loadConfig();
    const out = {} as Record<Tool, { running: boolean; port: number; enabled: boolean }>;
    for (const t of Object.keys(DEFAULT_PROXY_PORTS) as Tool[]) {
      out[t] = {
        running: proxyManager.isRunning(t),
        port: cfg.settings.proxy.ports[t],
        enabled: cfg.settings.proxy.enabled && !!cfg.agents[t]?.proxyEnabled,
      };
    }
    return out;
  });

  // 设置
  ipcMain.handle('piswitch:setSetting', async (_e, key: keyof AppSettings, value: unknown) => {
    const cfg = await updateConfig((c) => {
      (c.settings as unknown as Record<string, unknown>)[key as string] = value;
    });
    if (key === 'autoStart') setAutoStart(Boolean(value));
    if (key === 'proxy') await syncProxy(cfg, proxyManager);
    return cfg;
  });

  // 窗口控制
  ipcMain.handle('piswitch:hideWindow', () => {
    win()?.hide();
  });
  ipcMain.handle('piswitch:exitApp', () => {
    const { app } = require('electron') as typeof import('electron');
    app.quit();
  });

  // 启动工具 / 系统
  ipcMain.handle('piswitch:launchTool', async (_e, tool: Tool, cwd?: string) => launchTool(tool, cwd));
  ipcMain.handle('piswitch:openPath', async (_e, p: string) => {
    try {
      await shell.openPath(p);
    } catch {
      /* ignore */
    }
  });
  ipcMain.handle('piswitch:openDataDir', async () => {
    try {
      await shell.openPath(dataDir());
    } catch {
      /* ignore */
    }
  });
  ipcMain.handle('piswitch:getPaths', () => ({
    dataDir: dataDir(),
    piswitchOldDir: hasOldPiswitchConfig() ? oldPiswitchDir() : undefined,
  }));
  ipcMain.handle('piswitch:pickDirectory', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return r.canceled ? undefined : r.filePaths[0];
  });

  // ---------- 扩展中心 ----------
  ipcMain.handle('piswitch:getMcpServers', () => getMcpServers());
  ipcMain.handle('piswitch:saveMcpServer', (_e, tool: Tool, name: string, cfg: Record<string, unknown>) =>
    saveMcpServer(tool, name, cfg)
  );
  ipcMain.handle('piswitch:deleteMcpServer', (_e, tool: Tool, name: string) => deleteMcpServer(tool, name));
  ipcMain.handle('piswitch:getSkills', () => getSkills());
  ipcMain.handle('piswitch:deleteSkill', (_e, location: SkillLocation, name: string) => deleteSkill(location, name));
  ipcMain.handle('piswitch:getPiPlugins', () => getPiPlugins());
  ipcMain.handle('piswitch:addPiPlugin', (_e, pkg: string) => addPiPlugin(pkg));
  ipcMain.handle('piswitch:removePiPlugin', (_e, pkg: string) => removePiPlugin(pkg));
  ipcMain.handle('piswitch:getPromptFiles', () => getPromptFiles());
  ipcMain.handle('piswitch:readPromptFile', (_e, p: string) => readPromptFile(p));
  ipcMain.handle('piswitch:savePromptFile', (_e, p: string, content: string) => savePromptFile(p, content));
  ipcMain.handle('piswitch:createPromptFile', (_e, scope: PromptScope, name: string, content: string) =>
    createPromptFile(scope, name, content)
  );
  ipcMain.handle('piswitch:deletePromptFile', (_e, p: string) => deletePromptFile(p));
  ipcMain.handle('piswitch:getToolVersions', () => getToolVersions());
  ipcMain.handle('piswitch:upgradeTool', (_e, tool: Tool) => upgradeTool(tool));
  ipcMain.handle('piswitch:getSystemPrompt', () => getSystemPrompt());
  ipcMain.handle('piswitch:enableSystemPrompt', (_e, name: string) => enableSystemPrompt(name));
  ipcMain.handle('piswitch:saveSystemPrompt', (_e, name: string, content: string, isActive?: boolean) => saveSystemPrompt(name, content, isActive));
  ipcMain.handle('piswitch:saveActiveSystemPrompt', (_e, content: string) => saveActiveSystemPrompt(content));
  ipcMain.handle('piswitch:getMcpAggregated', () => getMcpAggregated());
  ipcMain.handle('piswitch:applyMcpToAgent', (_e, tool: Tool, name: string) => applyMcpToAgent(tool, name));
  ipcMain.handle('piswitch:saveMcpForAgents', (_e, name: string, cfg: Record<string, unknown>, tools: Tool[]) => saveMcpForAgents(name, cfg, tools));
  ipcMain.handle('piswitch:deleteMcpEverywhere', (_e, name: string) => deleteMcpEverywhere(name));
  ipcMain.handle('piswitch:getSkillsAggregated', () => getSkillsAggregated());
  ipcMain.handle('piswitch:installSkillToAgent', (_e, name: string, tool: Tool) => installSkillToAgent(name, tool));
  ipcMain.handle('piswitch:deleteSkillEverywhere', (_e, name: string) => deleteSkillEverywhere(name));
  ipcMain.handle('piswitch:deleteSystemPromptCandidate', (_e, name: string) => deleteSystemPromptCandidate(name));
  ipcMain.handle('piswitch:runSkillsCommand', (_e, args: string[]) => runSkillsCommand(args));
  ipcMain.handle('piswitch:openExternal', (_e, url: string) => shell.openExternal(url));
}

export { applyTool, loadConfig, ensureDataDir };

/** 根据配置同步代理服务（启动开启代理的工具端口，停止关闭的） */
export async function syncProxy(cfg: AppConfig, proxyManager: ProxyManager): Promise<void> {
  const globalOn = cfg.settings.proxy.enabled;
  for (const t of Object.keys(DEFAULT_PROXY_PORTS) as Tool[]) {
    const agent = cfg.agents[t];
    const wantOn = globalOn && !!agent?.proxyEnabled && !!agent?.providerId;
    const running = proxyManager.isRunning(t);
    if (wantOn && !running) {
      try {
        await proxyManager.start(t, cfg.settings.proxy.ports[t] || DEFAULT_PROXY_PORTS[t]);
      } catch (e) {
        console.error(`[PiSwitch] 代理启动失败 (${t}):`, (e as Error).message);
      }
    } else if (!wantOn && running) {
      await proxyManager.stop(t);
    }
  }
}
