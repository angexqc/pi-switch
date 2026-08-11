import fs from 'node:fs';
import * as toml from 'smol-toml';
import type { Tool, ToolStatus } from '../../shared/types';
import { TOOLS } from '../constants';
import { loadConfig } from './app-config';
import { isProxyBaseUrl } from './writers';
import { toolConfigPath, piModelsPath } from '../util/paths';
import { readJsonFile, readTextFile } from '../util/fs-utils';

function readCurrent(tool: Tool): { provider?: string; model?: string; proxyEnabled: boolean } {
  try {
    switch (tool) {
      case 'pi': {
        const s = readJsonFile<{ defaultProvider?: string; defaultModel?: string }>(toolConfigPath('pi'));
        const m = readJsonFile<{ providers?: Record<string, { baseUrl?: string }> }>(piModelsPath());
        const provider = s?.defaultProvider;
        const baseUrl = m?.providers?.[provider || '']?.baseUrl || '';
        return {
          provider,
          model: s?.defaultModel,
          proxyEnabled: isProxyBaseUrl(baseUrl),
        };
      }
      case 'claude': {
        const s = readJsonFile<{ env?: Record<string, string> }>(toolConfigPath('claude'));
        const env = s?.env || {};
        const baseUrl = env['ANTHROPIC_BASE_URL'] || '';
        const cfg = loadConfig();
        const matched = cfg.agents.claude.providers.find((p) => p.baseUrl === baseUrl);
        return {
          provider: matched?.id || (baseUrl ? baseUrl.replace(/^https?:\/\//, '').split('/')[0] : undefined),
          model: env['ANTHROPIC_MODEL'] || env['ANTHROPIC_DEFAULT_SONNET_MODEL'],
          proxyEnabled: isProxyBaseUrl(baseUrl),
        };
      }
      case 'codex': {
        const raw = readTextFile(toolConfigPath('codex'));
        if (!raw.trim()) return { proxyEnabled: false };
        const parsed = toml.parse(raw) as { model?: string; model_provider?: string; model_providers?: Record<string, { base_url?: string }> };
        const baseUrl = parsed.model_providers?.[parsed.model_provider || '']?.base_url || '';
        return {
          provider: parsed.model_provider,
          model: parsed.model,
          proxyEnabled: isProxyBaseUrl(baseUrl),
        };
      }
      case 'opencode': {
        const cfg = readJsonFile<{ provider?: Record<string, { options?: { baseURL?: string }; models?: Record<string, unknown> }> }>(toolConfigPath('opencode'));
        const providers = cfg?.provider || {};
        const entries = Object.entries(providers);
        const ourCfg = loadConfig();
        // 优先展示与当前 Agent 库内 provider 匹配（按 baseURL）的条目
        for (const p of ourCfg.agents.opencode.providers) {
          const hit = entries.find(([, v]) => v?.options?.baseURL === p.baseUrl);
          if (hit) {
            return {
              provider: p.id,
              model: Object.keys(hit[1]?.models || {})[0],
              proxyEnabled: isProxyBaseUrl(hit[1]?.options?.baseURL || ''),
            };
          }
        }
        const first = entries[0];
        return {
          provider: first?.[0],
          model: first ? Object.keys(first[1]?.models || {})[0] : undefined,
          proxyEnabled: isProxyBaseUrl(first?.[1]?.options?.baseURL || ''),
        };
      }
    }
  } catch {
    return { proxyEnabled: false };
  }
}

export function getToolStatus(): ToolStatus[] {
  return TOOLS.map((tool) => {
    const configPath = toolConfigPath(tool);
    const exists = fs.existsSync(configPath);
    const cur = readCurrent(tool);
    return {
      tool,
      configPath,
      exists,
      currentProvider: cur.provider,
      currentModel: cur.model,
      proxyEnabled: cur.proxyEnabled,
    };
  });
}
