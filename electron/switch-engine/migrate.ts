import fs from 'node:fs';
import type { AppConfig, ImportResult, Provider } from '../../shared/types';
import { oldPiswitchDir } from '../util/paths';
import { readJsonFile } from '../util/fs-utils';
import { loadConfig, saveConfig } from './app-config';
import { emit } from '../util/bus';

interface OldPiswitchConfig {
  providers?: OldProvider[];
}

interface OldProvider {
  id?: string;
  name?: string;
  api?: string;
  apiKeyEnv?: string;
  apiKeyLiteral?: string;
  baseUrl?: string;
  headerMode?: string;
  headers?: Record<string, string> | null;
  models?: Array<{
    id?: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    reasoning?: boolean;
  }>;
}

/** 检测旧 .piswitch 配置是否存在 */
export function hasOldPiswitchConfig(): boolean {
  return fs.existsSync(`${oldPiswitchDir()}/config.json`);
}

const API_MAP: Record<string, Provider['api']> = {
  'anthropic-messages': 'anthropic-messages',
  'openai-completions': 'openai-completions',
  'openai-responses': 'openai-responses',
  anthropic: 'anthropic-messages',
  openai: 'openai-completions',
};

export function convertOldProvider(p: OldProvider): Provider | undefined {
  if (!p?.id || !p?.name || !p?.baseUrl) return undefined;
  const api = API_MAP[p.api || ''] || 'openai-completions';
  return {
    id: p.id,
    name: p.name,
    api,
    baseUrl: p.baseUrl,
    apiKeyEnv: p.apiKeyEnv || undefined,
    apiKeyLiteral: p.apiKeyLiteral || undefined,
    headers: p.headers && Object.keys(p.headers).length ? p.headers : undefined,
    models: (p.models || [])
      .filter((m) => m?.id)
      .map((m) => ({
        id: m.id!,
        name: m.name || m.id!,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        reasoning: m.reasoning,
      })),
  };
}

export function buildImport(): { providers: Provider[]; errors: string[] } {
  const raw = readJsonFile<OldPiswitchConfig>(`${oldPiswitchDir()}/config.json`);
  if (!raw?.providers?.length) return { providers: [], errors: ['未找到可导入的供应商数据'] };
  const errors: string[] = [];
  const providers: Provider[] = [];
  for (const p of raw.providers) {
    const conv = convertOldProvider(p as never);
    if (conv) providers.push(conv);
    else errors.push(`供应商 ${p?.id || p?.name || '(未知)'} 数据不完整，已跳过`);
  }
  return { providers, errors };
}

/** 从 ~/.piswitch 导入；apply=true 时同时把第一个供应商绑定到所有工具 */
export async function importFromPiswitch(apply: boolean): Promise<ImportResult> {
  const { providers, errors } = buildImport();
  const cfg: AppConfig = loadConfig();
  let added = 0;
  let models = 0;
  // 供应商库按 Agent 隔离：导入到全部 Agent（各 Agent 可自行删减）
  for (const tool of ['pi', 'codex', 'claude', 'opencode'] as const) {
    const lib = cfg.agents[tool].providers;
    for (const p of providers) {
      if (lib.some((x) => x.id === p.id)) continue;
      lib.push(p);
      if (tool === 'pi') {
        added++;
        models += p.models.length;
      }
    }
  }
  let bindingsApplied = false;
  if (apply && providers.length) {
    const first = providers[0];
    const model = first.models[0];
    if (model) {
      for (const tool of ['pi', 'codex', 'claude', 'opencode'] as const) {
        cfg.agents[tool] = {
          ...cfg.agents[tool],
          enabled: true,
          providerId: first.id,
          modelId: model.id,
        };
      }
      bindingsApplied = true;
    }
  }
  if (added > 0) {
    cfg.settings.importedFromPiswitch = true;
    await saveConfig(cfg);
    emit('configChanged');
  }
  return { importedProviders: added, importedModels: models, bindingsApplied, errors };
}
