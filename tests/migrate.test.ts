import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertOldProvider, buildImport, hasOldPiswitchConfig } from '../electron/switch-engine/migrate';
import { loadConfig } from '../electron/switch-engine/app-config';
import { oldPiswitchDir, dataDir, configFilePath } from '../electron/util/paths';

let home: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.PI_SWITCH_HOME;
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'piswitch-migrate-'));
  process.env.PI_SWITCH_HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.PI_SWITCH_HOME;
  else process.env.PI_SWITCH_HOME = originalHome;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('.piswitch 导入', () => {
  it('convertOldProvider 转换格式', () => {
    const p = convertOldProvider({
      id: 'deepseek',
      name: 'DeepSeek',
      api: 'openai-completions',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      apiKeyLiteral: 'sk-abc',
      baseUrl: 'https://api.deepseek.com/v1',
      headerMode: 'none',
      headers: null,
      models: [{ id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', contextWindow: 256000, reasoning: false }],
    });
    expect(p).toMatchObject({
      id: 'deepseek',
      api: 'openai-completions',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      apiKeyLiteral: 'sk-abc',
      models: [{ id: 'deepseek-v4-flash', contextWindow: 256000 }],
    });
  });

  it('buildImport 读取旧配置', () => {
    fs.mkdirSync(oldPiswitchDir(), { recursive: true });
    fs.writeFileSync(
      path.join(oldPiswitchDir(), 'config.json'),
      JSON.stringify({
        providers: [
          { id: 'anthropic', name: 'Anthropic', api: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', models: [{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6' }] },
          { id: 'broken', name: 'Broken' }, // 缺 baseUrl → 跳过
        ],
      })
    );
    const { providers, errors } = buildImport();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe('anthropic');
    expect(errors.length).toBe(1);
    expect(hasOldPiswitchConfig()).toBe(true);
  });

  it('无旧配置时返回空', () => {
    const { providers, errors } = buildImport();
    expect(providers).toEqual([]);
    expect(errors.length).toBe(1);
    expect(hasOldPiswitchConfig()).toBe(false);
  });
});

describe('v1 → v2 配置迁移（validateConfig 兜底）', () => {
  it('reasoningEffort 为 null 时迁移成功，供应商/绑定/主题保留（不静默丢配置）', () => {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(
      configFilePath(),
      JSON.stringify({
        providers: [
          {
            id: 'deepseek',
            name: 'DeepSeek',
            api: 'openai-completions',
            baseUrl: 'https://api.deepseek.com/v1',
            models: [{ id: 'deepseek-chat', name: 'deepseek-chat', price_input: null, price_output: null }],
          },
        ],
        bindings: {
          pi: { tool: 'pi', enabled: true, providerId: 'deepseek', modelId: 'deepseek-chat', reasoningEffort: null, envOverrides: {} },
          codex: { tool: 'codex', enabled: false, providerId: '', modelId: '', reasoningEffort: null, envOverrides: {} },
          claude: { tool: 'claude', enabled: false, providerId: '', modelId: '', reasoningEffort: null, envOverrides: {} },
          opencode: { tool: 'opencode', enabled: false, providerId: '', modelId: '', reasoningEffort: null, envOverrides: {} },
        },
        settings: { theme: 'light' },
      })
    );
    const cfg = loadConfig();
    expect(cfg.agents.pi.enabled).toBe(true);
    expect(cfg.agents.pi.providerId).toBe('deepseek');
    expect(cfg.agents.pi.providers).toHaveLength(1);
    expect(cfg.agents.pi.providers[0].id).toBe('deepseek');
    expect(cfg.agents.pi.reasoningEffort).toBe('medium'); // null → 默认值
    expect(cfg.settings.theme).toBe('light');
  });

  it('非 v1 且缺 agents 的损坏配置回退默认配置（不抛异常）', () => {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(configFilePath(), JSON.stringify({ foo: 'bar' }));
    const cfg = loadConfig();
    expect(cfg.agents.pi.enabled).toBe(false);
    expect(cfg.agents.pi.providers).toEqual([]);
  });
});
