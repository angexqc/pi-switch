import { z } from 'zod';
import type { AgentConfig, Agents, AppConfig, Tool } from '../../shared/types';
import { TOOLS, DEFAULT_PROXY_PORTS, DEFAULT_CLI_PATHS, DEFAULT_WORKING_DIRS } from '../constants';
import { configFilePath, dataDir } from '../util/paths';
import { readJsonFile, writeJsonFile } from '../util/fs-utils';

const modelSchema = z.object({
  id: z.string(),
  name: z.string(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
  reasoning: z.boolean().optional(),
  priceInput: z.number().optional(),
  priceOutput: z.number().optional(),
  priceCacheRead: z.number().optional(),
  priceCacheWrite: z.number().optional(),
});

const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  api: z.enum(['anthropic-messages', 'openai-completions', 'openai-responses']),
  baseUrl: z.string().min(1),
  apiKeyEnv: z.string().optional(),
  apiKeyLiteral: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  models: z.array(modelSchema).default([]),
});

const agentSchema = z.object({
  tool: z.enum(['pi', 'codex', 'claude', 'opencode']),
  enabled: z.boolean().default(false),
  providerId: z.string().default(''),
  modelId: z.string().default(''),
  reasoningEffort: z.string().optional(),
  proxyEnabled: z.boolean().optional(),
  envOverrides: z.record(z.string(), z.string()).optional(),
  providers: z.array(providerSchema).default([]),
});

const agentSelectionSchema = agentSchema
  .pick({ enabled: true, providerId: true, modelId: true, reasoningEffort: true, proxyEnabled: true, envOverrides: true })
  .partial();

const profileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  agents: z.record(z.enum(['pi', 'codex', 'claude', 'opencode']), agentSelectionSchema),
});

const appSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  backupRetention: z.number().int().min(1).max(200).default(20),
  autoStart: z.boolean().default(false),
  minimizeToTray: z.boolean().default(true),
  closeAction: z.enum(['ask', 'minimize', 'exit']).default('ask'),
  cliPaths: z.record(z.enum(['pi', 'codex', 'claude', 'opencode']), z.string()).default(DEFAULT_CLI_PATHS),
  workingDirs: z.record(z.enum(['pi', 'codex', 'claude', 'opencode']), z.string()).default(DEFAULT_WORKING_DIRS),
  proxy: z
    .object({
      enabled: z.boolean().default(false),
      ports: z.record(z.enum(['pi', 'codex', 'claude', 'opencode']), z.number()).default(DEFAULT_PROXY_PORTS),
    })
    .default({ enabled: false, ports: DEFAULT_PROXY_PORTS }),
  importedFromPiswitch: z.boolean().default(false),
});

const appConfigSchema = z.object({
  version: z.number().default(2),
  agents: z.record(z.enum(['pi', 'codex', 'claude', 'opencode']), agentSchema),
  profiles: z.array(profileSchema).default([]),
  settings: appSettingsSchema,
});

// ---------------------------------------------------------------------------
// 旧 v1 schema（含全局 providers + bindings）—— 仅用于迁移
// ---------------------------------------------------------------------------
const legacyBindingSchema = z.object({
  tool: z.enum(['pi', 'codex', 'claude', 'opencode']),
  enabled: z.boolean().default(true),
  providerId: z.string(),
  modelId: z.string(),
  reasoningEffort: z.string().optional(),
  proxyEnabled: z.boolean().optional(),
  envOverrides: z.record(z.string(), z.string()).optional(),
});

const legacyConfigSchema = z.object({
  version: z.number().default(1),
  providers: z.array(providerSchema).default([]),
  bindings: z.record(z.enum(['pi', 'codex', 'claude', 'opencode']), legacyBindingSchema).optional(),
  profiles: z.array(profileSchema).default([]),
  settings: appSettingsSchema.optional(),
});

function defaultAgent(tool: Tool): AgentConfig {
  return {
    tool,
    enabled: false,
    providerId: '',
    modelId: '',
    reasoningEffort: 'medium',
    proxyEnabled: false,
    envOverrides: {},
    providers: [],
  };
}

export function defaultAgents(): Agents {
  const a = {} as Agents;
  for (const tool of TOOLS) a[tool] = defaultAgent(tool);
  return a;
}

export function defaultConfig(): AppConfig {
  return {
    version: 2,
    agents: defaultAgents(),
    profiles: [],
    settings: {
      theme: 'system',
      backupRetention: 20,
      autoStart: false,
      minimizeToTray: true,
      closeAction: 'ask',
      cliPaths: { ...DEFAULT_CLI_PATHS },
      workingDirs: { ...DEFAULT_WORKING_DIRS },
      proxy: { enabled: false, ports: { ...DEFAULT_PROXY_PORTS } },
      importedFromPiswitch: false,
    },
  };
}

function normalizeAgents(agents: Record<string, unknown> | undefined): Agents {
  const out = defaultAgents();
  if (!agents || typeof agents !== 'object') return out;
  for (const tool of TOOLS) {
    const raw = (agents as Record<string, unknown>)[tool] as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object') continue;
    const parsed = agentSchema.safeParse({ ...raw, tool });
    if (!parsed.success) continue;
    const a = parsed.data;
    out[tool] = {
      tool,
      enabled: !!a.enabled,
      providerId: a.providerId || '',
      modelId: a.modelId || '',
      reasoningEffort: a.reasoningEffort || 'medium',
      proxyEnabled: !!a.proxyEnabled,
      envOverrides: a.envOverrides || {},
      providers: a.providers || [],
    };
  }
  return out;
}

/** 校验并归一化配置（未知字段丢弃，缺省字段补默认值；v1 → v2 自动迁移） */
export function validateConfig(raw: unknown): AppConfig {
  // v1 迁移：旧配置含全局 providers/bindings，把供应商库复制到每个 Agent
  if (raw && typeof raw === 'object' && 'providers' in (raw as object) && !('agents' in (raw as object))) {
    const legacy = legacyConfigSchema.safeParse(raw);
    if (legacy.success) {
      const l = legacy.data;
      const agents = defaultAgents();
      for (const tool of TOOLS) {
        const b = l.bindings?.[tool];
        agents[tool] = {
          ...defaultAgent(tool),
          enabled: !!b?.enabled,
          providerId: b?.providerId || '',
          modelId: b?.modelId || '',
          reasoningEffort: b?.reasoningEffort || 'medium',
          proxyEnabled: !!b?.proxyEnabled,
          envOverrides: b?.envOverrides || {},
          providers: JSON.parse(JSON.stringify(l.providers)),
        };
      }
      return {
        version: 2,
        agents,
        profiles: (l.profiles as unknown as AppConfig['profiles']) || [],
        settings: normalizeSettings(l.settings),
      };
    }
  }

  const parsed = appConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('[PiSwitch] config.json 校验失败，使用默认配置:', parsed.error.message);
    return defaultConfig();
  }
  return {
    version: 2,
    agents: normalizeAgents(parsed.data.agents),
    profiles: (parsed.data.profiles as unknown as AppConfig['profiles']) || [],
    settings: normalizeSettings(parsed.data.settings),
  };
}

function normalizeSettings(s?: z.infer<typeof appSettingsSchema>): AppConfig['settings'] {
  const base = defaultConfig().settings;
  if (!s) return base;
  return {
    theme: s.theme,
    backupRetention: s.backupRetention,
    autoStart: !!s.autoStart,
    minimizeToTray: s.minimizeToTray !== false,
    closeAction: s.closeAction || 'ask',
    cliPaths: { ...DEFAULT_CLI_PATHS, ...s.cliPaths } as Record<Tool, string>,
    workingDirs: { ...DEFAULT_WORKING_DIRS, ...s.workingDirs } as Record<Tool, string>,
    proxy: {
      enabled: !!s.proxy.enabled,
      ports: { ...DEFAULT_PROXY_PORTS, ...s.proxy.ports } as Record<Tool, number>,
    },
    importedFromPiswitch: !!s.importedFromPiswitch,
  };
}

export function loadConfig(): AppConfig {
  const raw = readJsonFile(configFilePath());
  if (raw === undefined) return defaultConfig();
  return validateConfig(raw);
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  const normalized = validateConfig(config);
  await writeJsonFile(configFilePath(), normalized);
  return normalized;
}

export function ensureDataDir(): void {
  const { mkdirSync } = require('node:fs') as typeof import('node:fs');
  mkdirSync(dataDir(), { recursive: true });
}

/** 某 Agent 的供应商库中查找供应商 */
export function agentProvider(agent: AgentConfig | undefined, providerId: string) {
  return agent?.providers.find((p) => p.id === providerId);
}

/** 某 Agent 的供应商库中查找模型 */
export function agentModel(agent: AgentConfig | undefined, providerId: string, modelId: string) {
  const p = agentProvider(agent, providerId);
  return p?.models.find((m) => m.id === modelId);
}
