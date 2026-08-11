import type { AppConfig, SwitchResult, Tool } from '../../shared/types';
import { TOOLS } from '../constants';
import { loadConfig, saveConfig, agentProvider, agentModel } from './app-config';
import { effectiveBaseUrl, writeToolConfig } from './writers';
import { emit } from '../util/bus';

export function getConfig(): AppConfig {
  return loadConfig();
}

export async function updateConfig(mutator: (cfg: AppConfig) => AppConfig | void): Promise<AppConfig> {
  const cfg = loadConfig();
  const next = mutator(cfg) || cfg;
  const saved = await saveConfig(next);
  emit('configChanged');
  return saved;
}

/** 应用单个 Agent 的当前绑定到其配置文件 */
export async function applyTool(tool: Tool, config?: AppConfig): Promise<SwitchResult> {
  const cfg = config || loadConfig();
  const agent = cfg.agents[tool];
  const provider = agentProvider(agent, agent?.providerId || '');
  const model = agent ? agentModel(agent, agent.providerId, agent.modelId) : undefined;

  if (!agent?.enabled || !provider || !model) {
    return { tool, ok: false, error: !agent?.enabled ? '该工具未启用绑定' : '绑定未配置完整的供应商/模型' };
  }

  const baseUrl = effectiveBaseUrl(cfg, tool, provider);
  const result = await writeToolConfig(tool, { provider, model, binding: agent, baseUrl, config: cfg, agentProviders: agent.providers });
  return {
    tool,
    ok: result.ok,
    error: result.error,
    backupPath: result.backupPath,
    configPath: result.configPath,
  };
}

/** 对勾选工具逐个应用绑定 */
export async function applyBindings(tools?: Tool[]): Promise<SwitchResult[]> {
  const cfg = loadConfig();
  const list = tools && tools.length ? tools : TOOLS.filter((t) => cfg.agents[t]?.enabled);
  const results: SwitchResult[] = [];
  for (const tool of list) {
    results.push(await applyTool(tool, cfg));
  }
  if (results.some((r) => r.ok)) emit('configChanged');
  return results;
}

/** 应用 Profile：把 Profile 的选择写入配置并落盘到各工具（保留各自的供应商库） */
export async function applyProfile(profileId: string, tools?: Tool[]): Promise<SwitchResult[]> {
  const cfg = loadConfig();
  const profile = cfg.profiles.find((p) => p.id === profileId);
  if (!profile) return [{ tool: 'pi', ok: false, error: 'Profile 不存在' }];
  const list = tools && tools.length ? tools : TOOLS;
  for (const tool of list) {
    const sel = profile.agents[tool];
    if (!sel) continue;
    cfg.agents[tool] = {
      ...cfg.agents[tool],
      enabled: !!sel.enabled,
      providerId: sel.providerId || '',
      modelId: sel.modelId || '',
      reasoningEffort: sel.reasoningEffort || 'medium',
      proxyEnabled: !!sel.proxyEnabled,
      envOverrides: sel.envOverrides || {},
    };
  }
  await saveConfig(cfg);
  return applyBindings(list);
}

/** 保存当前各 Agent 选择为 Profile（不含供应商库） */
export async function saveProfile(name: string, agents?: AppConfig['agents']): Promise<AppConfig> {
  return updateConfig((cfg) => {
    const snapshot = agents ? JSON.parse(JSON.stringify(agents)) : JSON.parse(JSON.stringify(cfg.agents));
    const profileAgents = {} as AppConfig['profiles'][number]['agents'];
    for (const tool of TOOLS) {
      const a = snapshot[tool] || {};
      profileAgents[tool] = {
        enabled: !!a.enabled,
        providerId: a.providerId || '',
        modelId: a.modelId || '',
        reasoningEffort: a.reasoningEffort || 'medium',
        proxyEnabled: !!a.proxyEnabled,
        envOverrides: a.envOverrides || {},
      };
    }
    cfg.profiles.push({
      id: `prof_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name,
      agents: profileAgents,
    });
  });
}

export async function deleteProfile(profileId: string): Promise<AppConfig> {
  return updateConfig((cfg) => {
    cfg.profiles = cfg.profiles.filter((p) => p.id !== profileId);
  });
}
