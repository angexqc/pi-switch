import fs from 'node:fs';
import path from 'node:path';
import * as toml from 'smol-toml';
import type { AgentConfig, AppConfig, Model, Provider, Tool } from '../../shared/types';
import { backupFile } from './backup';
import { piModelsPath, toolConfigPath, codexAuthPath } from '../util/paths';
import { readJsonFile, readTextFile, writeJsonFile, writeTextFile } from '../util/fs-utils';

export interface WriterInput {
  provider: Provider;
  model: Model;
  binding: AgentConfig;
  /** 实际写入的 baseUrl（已按代理开关改写） */
  baseUrl: string;
  config: AppConfig;
  /** 该 Agent 专属供应商库（pi 写 models.json 时使用） */
  agentProviders: Provider[];
}

export interface WriterResult {
  ok: boolean;
  error?: string;
  configPath: string;
  backupPath?: string;
  mode?: string;
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** 解析供应商密钥：优先字面量；否则尝试从当前环境读取 env 变量 */
export function resolveApiKey(provider: Provider): { value: string; fromEnv: boolean } {
  if (provider.apiKeyLiteral) return { value: provider.apiKeyLiteral, fromEnv: false };
  if (provider.apiKeyEnv) {
    const v = process.env[provider.apiKeyEnv];
    if (v) return { value: v, fromEnv: true };
  }
  return { value: '', fromEnv: false };
}

function apiKeyForPi(provider: Provider): string {
  if (provider.apiKeyLiteral) return provider.apiKeyLiteral;
  if (provider.apiKeyEnv) return `$${provider.apiKeyEnv}`;
  return '';
}

// ---------------------------------------------------------------------------
// pi
// ---------------------------------------------------------------------------

export async function writePi(input: WriterInput): Promise<WriterResult> {
  const configPath = piModelsPath();
  const settingsPath = toolConfigPath('pi');
  const errors: string[] = [];

  try {
    const backupPath = backupFile('pi');
    // models.json：保留库外已有 provider，覆盖本 Agent 库内 provider
    const existing = (readJsonFile<{ providers?: Record<string, unknown> }>(configPath) || {}).providers || {};
    const providers: Record<string, unknown> = { ...existing };
    for (const p of input.agentProviders) {
      providers[p.id] = {
        api: p.api,
        apiKey: apiKeyForPi(p),
        baseUrl: p.baseUrl,
        ...(p.headers && Object.keys(p.headers).length ? { headers: p.headers } : {}),
        models: p.models.map((m) => ({
          id: m.id,
          name: m.name,
          ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
          ...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
          ...(typeof m.reasoning === 'boolean' ? { reasoning: m.reasoning } : {}),
        })),
      };
    }
    await writeJsonFile(configPath, { providers });

    // settings.json：深合并，保留 packages/theme 等
    const settings = (readJsonFile<Record<string, unknown>>(settingsPath) || {}) as Record<string, unknown>;
    const nextSettings: Record<string, unknown> = {
      ...settings,
      defaultProvider: input.provider.id,
      defaultModel: input.model.id,
    };
    await writeJsonFile(settingsPath, nextSettings);
    return { ok: true, configPath, backupPath, mode: 'json' };
  } catch (e) {
    errors.push((e as Error).message);
  }
  return { ok: false, error: errors.join('; '), configPath };
}

// ---------------------------------------------------------------------------
// claude code
// ---------------------------------------------------------------------------

export async function writeClaude(input: WriterInput): Promise<WriterResult> {
  const configPath = toolConfigPath('claude');
  try {
    const backupPath = backupFile('claude');
    const settings = (readJsonFile<Record<string, unknown>>(configPath) || {}) as Record<string, unknown>;
    const env = { ...((settings.env as Record<string, string>) || {}) };
    const { value: key, fromEnv } = resolveApiKey(input.provider);
    const modelId = input.model.id;

    env['ANTHROPIC_BASE_URL'] = input.baseUrl;
    env['ANTHROPIC_AUTH_TOKEN'] = key;
    env['ANTHROPIC_MODEL'] = modelId;
    env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = modelId;
    env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = modelId;
    env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = modelId;
    env['ANTHROPIC_DEFAULT_SONNET_MODEL_NAME'] = modelId;
    env['ANTHROPIC_DEFAULT_OPUS_MODEL_NAME'] = modelId;
    env['ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME'] = modelId;
    // 附加 env（覆盖受管键时以后者为准）
    if (input.binding.envOverrides) {
      for (const [k, v] of Object.entries(input.binding.envOverrides)) env[k] = v;
    }

    const next = { ...settings, env };
    await writeJsonFile(configPath, next);
    const note = fromEnv ? '密钥来自环境变量（已写入字面值）' : '';
    return { ok: true, configPath, backupPath, mode: note || 'json' };
  } catch (e) {
    return { ok: false, error: (e as Error).message, configPath };
  }
}

// ---------------------------------------------------------------------------
// codex (TOML)
// ---------------------------------------------------------------------------

function wireApiFor(api: Provider['api']): string {
  switch (api) {
    case 'openai-responses':
      return 'responses';
    case 'anthropic-messages':
      return 'chat'; // codex 不支持 anthropic wire，降级为 chat 兼容
    case 'openai-completions':
    default:
      return 'chat';
  }
}

export async function writeCodex(input: WriterInput): Promise<WriterResult> {
  const configPath = toolConfigPath('codex');
  const backupPath = backupFile('codex');
  const providerId = safeId(input.provider.id);
  const { value: key, fromEnv } = resolveApiKey(input.provider);
  const envKey = input.provider.apiKeyEnv || `PISWITCH_${safeId(input.provider.id).toUpperCase()}`;
  const reasoning = input.binding.reasoningEffort || 'medium';

  const writeToml = (obj: Record<string, unknown>): string => {
    const out = { ...obj };
    out['model'] = input.model.id;
    out['model_provider'] = providerId;
    out['model_reasoning_effort'] = reasoning;
    out['model_providers'] = {
      ...((obj['model_providers'] as Record<string, unknown>) || {}),
      [providerId]: {
        name: input.provider.name,
        base_url: input.baseUrl,
        wire_api: wireApiFor(input.provider.api),
        requires_openai_auth: false,
        ...(envKey ? { env_key: envKey } : {}),
      },
    };
    return toml.stringify(out as never);
  };

  try {
    const raw = readTextFile(configPath);
    let parsed: Record<string, unknown>;
    let mode = 'toml';
    if (raw.trim()) {
      try {
        parsed = toml.parse(raw) as unknown as Record<string, unknown>;
      } catch (e) {
        // 降级：文本行级替换
        mode = 'text-patch';
        let text = raw;
        text = text.replace(/^model\s*=.*$/m, `model = "${input.model.id}"`);
        text = text.replace(/^model_provider\s*=.*$/m, `model_provider = "${providerId}"`);
        text = text.replace(/^model_reasoning_effort\s*=.*$/m, `model_reasoning_effort = "${reasoning}"`);
        // 替换或追加 provider 块
        const blockRe = new RegExp(`\\[model_providers\\.${providerId}\\]\\n[^\\[]*`, 'm');
        const block = `[model_providers.${providerId}]\nname = "${input.provider.name}"\nbase_url = "${input.baseUrl}"\nwire_api = "${wireApiFor(input.provider.api)}"\nrequires_openai_auth = false\n${envKey ? `env_key = "${envKey}"\n` : ''}`;
        if (blockRe.test(text)) {
          text = text.replace(blockRe, block.trimEnd());
        } else {
          text = text.trimEnd() + '\n\n' + block;
        }
        await writeTextFile(configPath, text);
        await writeCodexAuth(envKey, key, fromEnv);
        return { ok: true, configPath, backupPath, mode };
      }
    } else {
      parsed = {};
    }
    const out = writeToml(parsed);
    // 校验可再次解析
    toml.parse(out);
    await writeTextFile(configPath, out);
    await writeCodexAuth(envKey, key, fromEnv);
    return { ok: true, configPath, backupPath, mode };
  } catch (e) {
    return { ok: false, error: (e as Error).message, configPath, backupPath };
  }
}

/** 将自定义 provider 密钥写入 codex auth.json（按 env_key 名） */
async function writeCodexAuth(envKey: string, key: string, fromEnv: boolean): Promise<void> {
  if (!envKey || !key || fromEnv) return;
  const authPath = codexAuthPath();
  const auth = (readJsonFile<Record<string, unknown>>(authPath) || {}) as Record<string, unknown>;
  if (auth[envKey] === key) return;
  await writeJsonFile(authPath, { ...auth, [envKey]: key });
}

// ---------------------------------------------------------------------------
// opencode
// ---------------------------------------------------------------------------

function opencodeNpm(api: Provider['api']): string {
  return api === 'anthropic-messages' ? '@ai-sdk/anthropic' : '@ai-sdk/openai-compatible';
}

export async function writeOpencode(input: WriterInput): Promise<WriterResult> {
  const configPath = toolConfigPath('opencode');
  try {
    const backupPath = backupFile('opencode');
    const cfg = (readJsonFile<Record<string, unknown>>(configPath) || {}) as Record<string, unknown>;
    const provider = ((cfg['provider'] as Record<string, unknown>) || {}) as Record<string, unknown>;
    const entry = ((provider[input.provider.id] as Record<string, unknown>) || {}) as Record<string, unknown>;
    const { value: key, fromEnv } = resolveApiKey(input.provider);
    const options: Record<string, unknown> = { baseURL: input.baseUrl };
    if (key) {
      options['apiKey'] = fromEnv && input.provider.apiKeyEnv ? { env: input.provider.apiKeyEnv } : key;
    } else if (input.provider.apiKeyEnv) {
      options['apiKey'] = { env: input.provider.apiKeyEnv };
    }

    const models = ((entry['models'] as Record<string, unknown>) || {}) as Record<string, unknown>;
    const modelEntry: Record<string, unknown> = {
      name: input.model.name,
      ...(input.model.contextWindow || input.model.maxTokens
        ? {
            limit: {
              ...(input.model.contextWindow ? { context: input.model.contextWindow } : {}),
              ...(input.model.maxTokens ? { output: input.model.maxTokens } : {}),
            },
          }
        : {}),
      options: {},
      variants: { low: {}, medium: {}, high: {} },
    };

    const nextProvider = {
      ...entry,
      npm: opencodeNpm(input.provider.api),
      name: input.provider.name,
      options: { ...((entry['options'] as Record<string, unknown>) || {}), ...options },
      models: { ...models, [input.model.id]: modelEntry },
    };
    const next = {
      ...cfg,
      provider: { ...provider, [input.provider.id]: nextProvider },
    };
    await writeJsonFile(configPath, next);
    return { ok: true, configPath, backupPath, mode: 'json' };
  } catch (e) {
    return { ok: false, error: (e as Error).message, configPath };
  }
}

// ---------------------------------------------------------------------------

export async function writeToolConfig(tool: Tool, input: WriterInput): Promise<WriterResult> {
  switch (tool) {
    case 'pi':
      return writePi(input);
    case 'claude':
      return writeClaude(input);
    case 'codex':
      return writeCodex(input);
    case 'opencode':
      return writeOpencode(input);
  }
}

/** 计算某工具绑定实际写入的 baseUrl（代理开启时改写为本地端口） */
export function effectiveBaseUrl(config: AppConfig, tool: Tool, provider: Provider): string {
  const agent = config.agents[tool];
  const proxyGlobal = config.settings.proxy.enabled;
  const proxyOn = proxyGlobal && !!agent?.proxyEnabled;
  if (proxyOn) {
    const port = config.settings.proxy.ports[tool] || 9901;
    return `http://127.0.0.1:${port}`;
  }
  return provider.baseUrl;
}

export function isProxyBaseUrl(url: string): boolean {
  return /^http:\/\/127\.0\.0\.1:\d+/.test(url) || /^http:\/\/localhost:\d+/.test(url);
}

export function configFileExists(tool: Tool): boolean {
  return fs.existsSync(toolConfigPath(tool));
}

export { path };
