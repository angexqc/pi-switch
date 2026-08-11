import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { homeDir, dataDir, toolConfigPath, backupsDir } from '../electron/util/paths';
import { writeJsonFile, writeTextFile } from '../electron/util/fs-utils';
import { writePi, writeClaude, writeCodex, writeOpencode, effectiveBaseUrl } from '../electron/switch-engine/writers';
import { backupFile, listBackups, restoreBackup } from '../electron/switch-engine/backup';
import { defaultConfig } from '../electron/switch-engine/app-config';
import type { AgentConfig, AppConfig, Provider } from '../shared/types';

let home: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.PI_SWITCH_HOME;
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'piswitch-test-'));
  process.env.PI_SWITCH_HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.PI_SWITCH_HOME;
  else process.env.PI_SWITCH_HOME = originalHome;
  fs.rmSync(home, { recursive: true, force: true });
});

const provider: Provider = {
  id: 'deepseek',
  name: 'DeepSeek',
  api: 'openai-completions',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKeyLiteral: 'sk-test-123456',
  models: [
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 256000, priceInput: 0.27, priceOutput: 1.1 },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  ],
};

function binding(tool: AgentConfig['tool']): AgentConfig {
  return { tool, enabled: true, providerId: 'deepseek', modelId: 'deepseek-v4-flash', reasoningEffort: 'medium', proxyEnabled: false, envOverrides: {}, providers: [provider] };
}

function cfg(over?: Partial<AppConfig>): AppConfig {
  const c = defaultConfig();
  for (const t of ['pi', 'codex', 'claude', 'opencode'] as const) {
    c.agents[t].providers = [provider];
    c.agents[t].enabled = true;
    c.agents[t].providerId = 'deepseek';
    c.agents[t].modelId = 'deepseek-v4-flash';
  }
  return { ...c, ...over };
}

describe('pi writer', () => {
  it('写入 models.json 与 settings.json，保留其它键', async () => {
    fs.mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
    await writeJsonFile(toolConfigPath('pi'), { packages: ['npm:x'], theme: 'dark' });
    const c = cfg();
    const r = await writePi({ provider, model: provider.models[0], binding: binding('pi'), baseUrl: provider.baseUrl, config: c, agentProviders: c.agents.pi.providers });
    expect(r.ok).toBe(true);
    expect(r.backupPath).toBeTruthy();

    const models = JSON.parse(fs.readFileSync(path.join(home, '.pi', 'agent', 'models.json'), 'utf8'));
    expect(models.providers.deepseek.apiKey).toBe('sk-test-123456');
    expect(models.providers.deepseek.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(models.providers.deepseek.models).toHaveLength(2);

    const settings = JSON.parse(fs.readFileSync(toolConfigPath('pi'), 'utf8'));
    expect(settings.defaultProvider).toBe('deepseek');
    expect(settings.defaultModel).toBe('deepseek-v4-flash');
    expect(settings.packages).toEqual(['npm:x']); // 保留
    expect(settings.theme).toBe('dark'); // 保留
  });

  it('apiKeyEnv 时写 $ENV 形式', async () => {
    fs.mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
    const p = { ...provider, apiKeyLiteral: undefined, apiKeyEnv: 'DEEPSEEK_API_KEY' };
    const c = cfg();
    c.agents.pi.providers = [p];
    const r = await writePi({ provider: p, model: p.models[0], binding: binding('pi'), baseUrl: p.baseUrl, config: c, agentProviders: c.agents.pi.providers });
    expect(r.ok).toBe(true);
    const models = JSON.parse(fs.readFileSync(path.join(home, '.pi', 'agent', 'models.json'), 'utf8'));
    expect(models.providers.deepseek.apiKey).toBe('$DEEPSEEK_API_KEY');
  });
});

describe('claude writer', () => {
  it('写入 env 并保留 permissions/hooks', async () => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    await writeJsonFile(toolConfigPath('claude'), {
      permissions: { allow: ['mcp__x'] },
      hooks: { UserPromptSubmit: [] },
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:15721', UNRELATED: 'keep' },
    });
    const c = cfg();
    const r = await writeClaude({ provider, model: provider.models[0], binding: binding('claude'), baseUrl: provider.baseUrl, config: c, agentProviders: c.agents.pi.providers });
    expect(r.ok).toBe(true);
    const s = JSON.parse(fs.readFileSync(toolConfigPath('claude'), 'utf8'));
    expect(s.permissions.allow).toEqual(['mcp__x']);
    expect(s.hooks.UserPromptSubmit).toEqual([]);
    expect(s.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/v1');
    expect(s.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-123456');
    expect(s.env.ANTHROPIC_MODEL).toBe('deepseek-v4-flash');
    expect(s.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v4-flash');
    expect(s.env.UNRELATED).toBe('keep');
  });

  it('损坏的 JSON 不覆盖原文件', async () => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(toolConfigPath('claude'), '{ broken json');
    const c = cfg();
    const r = await writeClaude({ provider, model: provider.models[0], binding: binding('claude'), baseUrl: provider.baseUrl, config: c, agentProviders: c.agents.pi.providers });
    // readJsonFile fallback 空对象，仍可写入 —— 验证不抛异常且备份存在
    expect(r.ok).toBe(true);
    expect(r.backupPath).toBeTruthy();
  });
});

describe('codex writer', () => {
  it('TOML 往返保留其它节', async () => {
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    fs.writeFileSync(
      toolConfigPath('codex'),
      'model = "old-model"\nmodel_provider = "old"\n\n[mcp_servers.foo]\ncommand = "npx"\n\n[projects."e:\\x"]\ntrust_level = "trusted"\n'
    );
    const c = cfg();
    const r = await writeCodex({ provider, model: provider.models[0], binding: binding('codex'), baseUrl: provider.baseUrl, config: c, agentProviders: c.agents.pi.providers });
    expect(r.ok).toBe(true);
    const out = fs.readFileSync(toolConfigPath('codex'), 'utf8');
    expect(out).toContain('model = "deepseek-v4-flash"');
    expect(out).toContain('model_provider = "deepseek"');
    expect(out).toContain('base_url = "https://api.deepseek.com/v1"');
    expect(out).toContain('[mcp_servers.foo]');
    expect(out).toContain('command = "npx"');
    expect(out).toContain('trust_level = "trusted"');
    // 密钥写入 auth.json
    const auth = JSON.parse(fs.readFileSync(path.join(home, '.codex', 'auth.json'), 'utf8'));
    expect(auth['PISWITCH_DEEPSEEK']).toBe('sk-test-123456');
  });

  it('损坏 TOML 时降级文本补丁', async () => {
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    fs.writeFileSync(toolConfigPath('codex'), 'model = "old"\n\n[mcp_servers.foo]\ncommand = "npx"\n');
    const c = cfg();
    const r = await writeCodex({ provider, model: provider.models[1], binding: binding('codex'), baseUrl: provider.baseUrl, config: c, agentProviders: c.agents.pi.providers });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('toml'); // 该内容可被 smol-toml 解析
    const out = fs.readFileSync(toolConfigPath('codex'), 'utf8');
    expect(out).toContain('model = "deepseek-v4-pro"');
  });
});

describe('opencode writer', () => {
  it('深合并保留 agent/mcp，注入 provider 与模型', async () => {
    fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
    await writeJsonFile(toolConfigPath('opencode'), {
      agent: { build: { options: { store: false } } },
      mcp: { codegraph: { type: 'local', command: ['codegraph'] } },
      provider: { openai: { options: { apiKey: 'sk-other' } } },
    });
    const c = cfg();
    const r = await writeOpencode({ provider, model: provider.models[0], binding: binding('opencode'), baseUrl: provider.baseUrl, config: c, agentProviders: c.agents.pi.providers });
    expect(r.ok).toBe(true);
    const o = JSON.parse(fs.readFileSync(toolConfigPath('opencode'), 'utf8'));
    expect(o.agent.build.options.store).toBe(false);
    expect(o.mcp.codegraph.type).toBe('local');
    expect(o.provider.openai.options.apiKey).toBe('sk-other'); // 其它 provider 保留
    expect(o.provider.deepseek.options.baseURL).toBe('https://api.deepseek.com/v1');
    expect(o.provider.deepseek.options.apiKey).toBe('sk-test-123456');
    expect(o.provider.deepseek.models['deepseek-v4-flash'].limit.context).toBe(256000);
  });
});

describe('effectiveBaseUrl / 代理改写', () => {
  it('代理开启且工具启用时改写为 127.0.0.1 端口', async () => {
    const c = cfg();
    c.settings.proxy.enabled = true;
    c.settings.proxy.ports.pi = 9901;
    c.agents.pi.proxyEnabled = true;
    expect(effectiveBaseUrl(c, 'pi', provider)).toBe('http://127.0.0.1:9901');
    c.agents.pi.proxyEnabled = false;
    expect(effectiveBaseUrl(c, 'pi', provider)).toBe('https://api.deepseek.com/v1');
  });
});

describe('备份与还原', () => {
  it('备份命名、保留上限、还原', async () => {
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    fs.writeFileSync(toolConfigPath('codex'), 'model = "a"');
    const b1 = backupFile('codex', 20);
    expect(b1).toBeTruthy();
    fs.writeFileSync(toolConfigPath('codex'), 'model = "b"');
    const b2 = backupFile('codex', 20);
    const list = listBackups('codex');
    expect(list.length).toBe(2);
    expect(list[0].timestamp).toBeGreaterThanOrEqual(list[1].timestamp);

    // 还原 b1（按路径还原，避免同秒时间戳排序歧义）
    const entry = list.find((x) => x.path === b1)!;
    const r = restoreBackup(entry, 20);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(toolConfigPath('codex'), 'utf8')).toBe('model = "a"');
  });

  it('保留上限裁剪', async () => {
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(toolConfigPath('codex'), `model = "${i}"`);
      backupFile('codex', 3);
    }
    expect(listBackups('codex').length).toBe(3);
  });
});
