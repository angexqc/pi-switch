import fs from 'node:fs';
import * as toml from 'smol-toml';
import type { RawConfigFile, SwitchResult, Tool } from '../../shared/types';
import { backupFile } from './backup';
import { piModelsPath, toolConfigPath } from '../util/paths';
import { readTextFile, writeTextFile } from '../util/fs-utils';

interface FileSpec {
  name: string;
  path: string;
  hint: string;
}

function specsFor(tool: Tool): FileSpec[] {
  switch (tool) {
    case 'pi':
      return [
        {
          name: 'models.json',
          path: piModelsPath(),
          hint: '供应商库（providers）。此 Agent 的「应用」会按本文件格式写入其供应商库。',
        },
        {
          name: 'settings.json',
          path: toolConfigPath('pi'),
          hint: '含 defaultProvider / defaultModel，以及 packages、theme 等其它配置。',
        },
      ];
    case 'codex':
      return [
        {
          name: 'config.toml',
          path: toolConfigPath('codex'),
          hint: 'TOML 格式。受管字段：model / model_provider / model_reasoning_effort / [model_providers.<id>]。',
        },
      ];
    case 'claude':
      return [
        {
          name: 'settings.json',
          path: toolConfigPath('claude'),
          hint: '含 env.ANTHROPIC_BASE_URL / AUTH_TOKEN / DEFAULT_*_MODEL，以及 permissions、hooks。',
        },
      ];
    case 'opencode':
      return [
        {
          name: 'opencode.json',
          path: toolConfigPath('opencode'),
          hint: '含 provider.<id> / agent / mcp 等配置。',
        },
      ];
  }
}

/** 读取某工具的真实配置文件（不存在时返回空内容占位） */
export function getRawConfigFiles(tool: Tool): RawConfigFile[] {
  return specsFor(tool).map((s) => {
    const exists = fs.existsSync(s.path);
    return {
      name: s.name,
      path: s.path,
      content: exists ? readTextFile(s.path) : '',
      exists,
      hint: s.hint,
    };
  });
}

/** 保存配置源码：先校验可解析（JSON/TOML），再备份 + 原子写入 */
export async function saveRawConfigFile(tool: Tool, fileName: string, content: string): Promise<SwitchResult> {
  const spec = specsFor(tool).find((s) => s.name === fileName);
  if (!spec) return { tool, ok: false, error: `未知配置文件：${fileName}` };

  // 语法校验：失败不覆盖
  try {
    if (fileName.endsWith('.json')) {
      JSON.parse(content || '{}');
    } else if (fileName.endsWith('.toml')) {
      toml.parse(content || '');
    }
  } catch (e) {
    return { tool, ok: false, error: `语法校验失败，未写入：${(e as Error).message}` };
  }

  try {
    const backupPath = backupFile(tool);
    await writeTextFile(spec.path, content);
    return { tool, ok: true, configPath: spec.path, ...(backupPath ? { backupPath } : {}) };
  } catch (e) {
    return { tool, ok: false, error: (e as Error).message, configPath: spec.path };
  }
}
