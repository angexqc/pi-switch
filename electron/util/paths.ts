import os from 'node:os';
import path from 'node:path';
import type { Tool } from '../../shared/types';
import { BACKUPS_DIR_NAME, CONFIG_FILE_NAME, DATA_DIR_NAME, OLD_PISWITCH_DIR_NAME, STATS_DB_NAME } from '../constants';

/** 测试可注入的 HOME 覆盖（vitest 中设置） */
export function homeDir(): string {
  return process.env.PI_SWITCH_HOME || os.homedir();
}

export function dataDir(): string {
  return path.join(homeDir(), DATA_DIR_NAME);
}

export function configFilePath(): string {
  return path.join(dataDir(), CONFIG_FILE_NAME);
}

export function statsDbPath(): string {
  return path.join(dataDir(), STATS_DB_NAME);
}

export function backupsDir(): string {
  return path.join(dataDir(), BACKUPS_DIR_NAME);
}

export function oldPiswitchDir(): string {
  return path.join(homeDir(), OLD_PISWITCH_DIR_NAME);
}

/** cc-switch 数据库路径（~/.cc-switch/cc-switch.db，导入来源） */
export function ccSwitchDbPath(): string {
  return path.join(homeDir(), '.cc-switch', 'cc-switch.db');
}

export function piAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(homeDir(), '.pi', 'agent');
}

export function claudeDir(): string {
  return path.join(homeDir(), '.claude');
}

export function codexDir(): string {
  return process.env.CODEX_HOME || path.join(homeDir(), '.codex');
}

export function opencodeConfigPath(): string {
  if (process.env.OPENCODE_CONFIG) return process.env.OPENCODE_CONFIG;
  return path.join(homeDir(), '.config', 'opencode', 'opencode.json');
}

/** 各工具主配置文件路径 */
export function toolConfigPath(tool: Tool): string {
  switch (tool) {
    case 'pi':
      return path.join(piAgentDir(), 'settings.json');
    case 'claude':
      return path.join(claudeDir(), 'settings.json');
    case 'codex':
      return path.join(codexDir(), 'config.toml');
    case 'opencode':
      return opencodeConfigPath();
  }
}

/** pi 的 models.json 路径 */
export function piModelsPath(): string {
  return path.join(piAgentDir(), 'models.json');
}

/** codex auth.json 路径（写入自定义 provider 密钥） */
export function codexAuthPath(): string {
  return path.join(codexDir(), 'auth.json');
}

/** opencode 会话数据库路径 */
export function opencodeDbPath(): string {
  return path.join(homeDir(), '.local', 'share', 'opencode', 'opencode.db');
}

/** codex 日志数据库路径 */
export function codexLogsDbPath(): string {
  return path.join(codexDir(), 'logs_2.sqlite');
}

/** codex 状态数据库路径 */
export function codexStateDbPath(): string {
  return path.join(codexDir(), 'state_5.sqlite');
}
