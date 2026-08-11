import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import TOML from 'smol-toml';
import type { ApiKind, ImportProviderPreview, ImportResult, ImportSourcePreview, Model, Tool } from '../../shared/types';
import { ccSwitchDbPath, codexDir, claudeDir } from '../util/paths';
import { loadConfig, saveConfig } from './app-config';

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

function maskKey(k?: string): string | undefined {
  if (!k) return undefined;
  if (k.length <= 8) return '****';
  return `${k.slice(0, 3)}****${k.slice(-4)}`;
}

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** 内部完整供应商（含明文密钥，仅主进程内使用，绝不通过 IPC 返回） */
export interface FullImportProvider {
  id: string;
  name: string;
  tool: Tool;
  api: ApiKind;
  baseUrl: string;
  apiKeyLiteral?: string;
  models: Model[];
}

interface FullImport {
  preview: ImportSourcePreview;
  providers: FullImportProvider[];
}

function toPreview(p: FullImportProvider): ImportProviderPreview {
  return {
    id: p.id,
    name: p.name,
    api: p.api,
    baseUrl: p.baseUrl,
    apiKeyMasked: maskKey(p.apiKeyLiteral),
    models: p.models.map((m) => ({ id: m.id, name: m.name, priceInput: m.priceInput, priceOutput: m.priceOutput })),
  };
}

function makePreview(key: 'ccs' | 'codex' | 'claude', label: string, sourcePath: string, providers: FullImportProvider[]): ImportSourcePreview {
  return { key, label, sourcePath, providers: providers.map(toPreview) };
}

// ---------------------------------------------------------------------------
// cc-switch 价格表（可选，按 model_id 匹配价格）
// ---------------------------------------------------------------------------

function loadCcSwitchPricing(): Map<string, { priceInput?: number; priceOutput?: number }> {
  const map = new Map<string, { priceInput?: number; priceOutput?: number }>();
  const dbPath = ccSwitchDbPath();
  if (!fs.existsSync(dbPath)) return map;
  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db
        .prepare('SELECT model_id, input_cost_per_million, output_cost_per_million FROM model_pricing')
        .all() as { model_id: string; input_cost_per_million: string; output_cost_per_million: string }[];
      for (const r of rows) {
        map.set(r.model_id, { priceInput: toNum(r.input_cost_per_million), priceOutput: toNum(r.output_cost_per_million) });
      }
    } finally {
      db.close();
    }
  } catch {
    /* 价格表读取失败不影响导入 */
  }
  return map;
}

// ---------------------------------------------------------------------------
// 来源 1：cc-switch（~/.cc-switch/cc-switch.db 的 providers 表）
// ---------------------------------------------------------------------------

interface CcSwitchRow {
  id: string;
  app_type: string;
  name: string;
  settings_config: string;
}

function parseCcSwitchRow(r: CcSwitchRow, pricing: Map<string, { priceInput?: number; priceOutput?: number }>): FullImportProvider | undefined {
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(r.settings_config || '{}') as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const app = r.app_type;
  const tool: Tool = app === 'claude' || app === 'claude-desktop' ? 'claude' : app === 'codex' ? 'codex' : 'opencode';
  const api: ApiKind = tool === 'claude' ? 'anthropic-messages' : tool === 'codex' ? 'openai-responses' : 'openai-completions';
  let baseUrl = '';
  let apiKeyLiteral: string | undefined;
  const models: Model[] = [];
  const pricingFor = (mid: string): { priceInput?: number; priceOutput?: number } => pricing.get(mid) || {};

  if (tool === 'claude') {
    const env = (cfg.env || {}) as Record<string, string>;
    baseUrl = env.ANTHROPIC_BASE_URL || '';
    apiKeyLiteral = env.ANTHROPIC_AUTH_TOKEN || undefined;
    // 实际模型名优先取 *_NAME 映射（中转站把 claude 名映射到真实模型）
    const seen = new Set<string>();
    const add = (realName: string | undefined, displayName?: string) => {
      if (!realName || seen.has(realName)) return;
      seen.add(realName);
      models.push({ id: realName, name: displayName || realName, ...pricingFor(realName) });
    };
    add(env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME || env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'Opus');
    add(env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME || env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'Sonnet');
    add(env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME || env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'Haiku');
    add(env.ANTHROPIC_MODEL);
  } else if (tool === 'codex') {
    const auth = (cfg.auth || {}) as Record<string, string>;
    apiKeyLiteral = auth.OPENAI_API_KEY || undefined;
    const tomlText = (cfg.config as string) || '';
    try {
      const parsed = TOML.parse(tomlText) as Record<string, unknown>;
      const mp = (parsed.model_providers || {}) as Record<string, { base_url?: string }>;
      const active = (parsed.model_provider as string) || '';
      baseUrl = mp[active]?.base_url || mp['custom']?.base_url || '';
      const model = parsed.model as string | undefined;
      if (model) models.push({ id: model, name: model, ...pricingFor(model) });
    } catch {
      /* TOML 解析失败时用 provider_endpoints 表兜底（见 scanCcSwitch） */
    }
  } else {
    // opencode：provider.<id>.options / models
    const prov = (cfg.provider || {}) as Record<string, { options?: Record<string, unknown>; models?: Record<string, { name?: string }> }>;
    for (const [pid, pv] of Object.entries(prov)) {
      const options = (pv.options || {}) as Record<string, unknown>;
      baseUrl = (options.baseURL as string) || (options.baseUrl as string) || '';
      apiKeyLiteral = (options.apiKey as string) || (options.api_key as string) || apiKeyLiteral;
      const mods = pv.models || {};
      for (const [mid, mv] of Object.entries(mods)) {
        models.push({ id: mid, name: mv?.name || mid, ...pricingFor(mid) });
      }
    }
  }
  if (!baseUrl) return undefined;
  const id = r.id === 'default' ? `${app}-default` : r.id;
  return { id, name: r.name || r.id, tool, api, baseUrl, apiKeyLiteral, models };
}

function scanCcSwitchFull(): FullImport {
  const dbPath = ccSwitchDbPath();
  const providers: FullImportProvider[] = [];
  if (fs.existsSync(dbPath)) {
    try {
      const db = new Database(dbPath, { readonly: true });
      try {
        const pricing = loadCcSwitchPricing();
        const rows = db
          .prepare(
            `SELECT id, app_type, name, settings_config FROM providers
             WHERE app_type IN ('claude','claude-desktop','codex','opencode') ORDER BY app_type, sort_index`
          )
          .all() as CcSwitchRow[];
        for (const r of rows) {
          const p = parseCcSwitchRow(r, pricing);
          if (p) providers.push(p);
        }
      } finally {
        db.close();
      }
    } catch (e) {
      return {
        preview: { key: 'ccs', label: `cc-switch（读取失败: ${(e as Error).message}）`, sourcePath: dbPath, providers: [] },
        providers: [],
      };
    }
  }
  return { preview: makePreview('ccs', 'cc-switch', dbPath, providers), providers };
}

// ---------------------------------------------------------------------------
// 来源 2：Codex 自身配置（~/.codex/config.toml 的 [model_providers.*] + auth.json）
// ---------------------------------------------------------------------------

function readCodexApiKey(): string | undefined {
  try {
    const auth = JSON.parse(fs.readFileSync(path.join(codexDir(), 'auth.json'), 'utf8')) as Record<string, string>;
    return auth.OPENAI_API_KEY || undefined;
  } catch {
    return undefined;
  }
}

function scanCodexOwnFull(): FullImport {
  const cfgPath = path.join(codexDir(), 'config.toml');
  const providers: FullImportProvider[] = [];
  if (!fs.existsSync(cfgPath)) {
    return { preview: makePreview('codex', 'Codex 自身配置', cfgPath, []), providers };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = TOML.parse(fs.readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    return {
      preview: { key: 'codex', label: `Codex 自身配置（解析失败: ${(e as Error).message}）`, sourcePath: cfgPath, providers: [] },
      providers: [],
    };
  }
  const apiKey = readCodexApiKey();
  const mps = (parsed.model_providers || {}) as Record<string, { name?: string; base_url?: string; wire_api?: string }>;
  const activeProvider = (parsed.model_provider as string) || '';
  const activeModel = parsed.model as string | undefined;
  for (const [pid, pv] of Object.entries(mps)) {
    const baseUrl = pv.base_url || '';
    if (!baseUrl) continue;
    const wire = pv.wire_api || 'responses';
    const api: ApiKind = wire === 'chat' || wire === 'completions' ? 'openai-completions' : 'openai-responses';
    const models: Model[] = [];
    if (activeModel && (activeProvider === pid || activeProvider === '')) {
      models.push({ id: activeModel, name: activeModel });
    }
    providers.push({ id: `codex-${pid}`, name: pv.name || pid, tool: 'codex', api, baseUrl, apiKeyLiteral: apiKey, models });
  }
  // 官方 provider（无 base_url）也导出当前模型，供用户补全 baseUrl 后使用
  if (!providers.length && activeModel) {
    providers.push({
      id: `codex-${activeProvider || 'default'}`,
      name: activeProvider || 'default',
      tool: 'codex',
      api: 'openai-responses',
      baseUrl: '',
      apiKeyLiteral: apiKey,
      models: [{ id: activeModel, name: activeModel }],
    });
  }
  return { preview: makePreview('codex', 'Codex 自身配置', cfgPath, providers), providers };
}

// ---------------------------------------------------------------------------
// 来源 3：Claude Code 自身配置（~/.claude/settings.json 的 env）
// ---------------------------------------------------------------------------

function scanClaudeOwnFull(): FullImport {
  const cfgPath = path.join(claudeDir(), 'settings.json');
  const providers: FullImportProvider[] = [];
  if (!fs.existsSync(cfgPath)) {
    return { preview: makePreview('claude', 'Claude Code 自身配置', cfgPath, []), providers };
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { env?: Record<string, string> };
    const env = cfg.env || {};
    const baseUrl = env.ANTHROPIC_BASE_URL || '';
    const apiKeyLiteral = env.ANTHROPIC_AUTH_TOKEN || undefined;
    const models: Model[] = [];
    const seen = new Set<string>();
    const add = (m: string | undefined, displayName?: string) => {
      if (!m || seen.has(m)) return;
      seen.add(m);
      models.push({ id: m, name: displayName || m });
    };
    add(env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME || env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'Opus');
    add(env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME || env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'Sonnet');
    add(env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME || env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'Haiku');
    add(env.ANTHROPIC_MODEL);
    if (baseUrl) {
      providers.push({
        id: 'claude-current',
        name: 'Claude Code 当前配置',
        tool: 'claude',
        api: 'anthropic-messages',
        baseUrl,
        apiKeyLiteral,
        models,
      });
    }
  } catch (e) {
    return {
      preview: { key: 'claude', label: `Claude Code 自身配置（解析失败: ${(e as Error).message}）`, sourcePath: cfgPath, providers: [] },
      providers: [],
    };
  }
  return { preview: makePreview('claude', 'Claude Code 自身配置', cfgPath, providers), providers };
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

export function scanImportSources(): ImportSourcePreview[] {
  return [scanCcSwitchFull().preview, scanCodexOwnFull().preview, scanClaudeOwnFull().preview];
}

export async function applyImportSource(key: 'ccs' | 'codex' | 'claude', selectedIds: string[]): Promise<ImportResult> {
  const full: FullImport =
    key === 'ccs' ? scanCcSwitchFull() : key === 'codex' ? scanCodexOwnFull() : scanClaudeOwnFull();
  const selected = full.providers.filter((p) => selectedIds.includes(p.id));
  const cfg = loadConfig();
  const errors: string[] = [];
  let importedProviders = 0;
  let importedModels = 0;
  for (const p of selected) {
    const agent = cfg.agents[p.tool];
    if (!agent) {
      errors.push(`${p.name}: 未知工具 ${p.tool}`);
      continue;
    }
    if (agent.providers.some((x) => x.id === p.id)) {
      errors.push(`${p.name}: 已存在同名供应商，跳过`);
      continue;
    }
    agent.providers.push({
      id: p.id,
      name: p.name,
      api: p.api,
      baseUrl: p.baseUrl,
      apiKeyEnv: undefined,
      apiKeyLiteral: p.apiKeyLiteral,
      headers: undefined,
      models: p.models,
    });
    importedProviders++;
    importedModels += p.models.length;
  }
  await saveConfig(cfg);
  return { importedProviders, importedModels, bindingsApplied: false, errors };
}
