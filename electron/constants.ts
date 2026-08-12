import type { Tool } from '../shared/types';

export const TOOLS: Tool[] = ['pi', 'codex', 'claude', 'opencode'];

export const TOOL_LABELS: Record<Tool, string> = {
  pi: 'Pi Agent',
  codex: 'Codex',
  claude: 'Claude Code',
  opencode: 'opencode',
};

export const TOOL_ICONS: Record<Tool, string> = {
  pi: '🤖',
  codex: '🟢',
  claude: '🟠',
  opencode: '🔷',
};

export const DEFAULT_PROXY_PORTS: Record<Tool, number> = {
  pi: 9901,
  codex: 9902,
  claude: 9903,
  opencode: 9904,
};

export const DEFAULT_CLI_PATHS: Record<Tool, string> = {
  pi: 'pi',
  codex: 'codex',
  claude: 'claude',
  opencode: 'opencode',
};

export const DEFAULT_WORKING_DIRS: Record<Tool, string> = {
  pi: '',
  codex: '',
  claude: '',
  opencode: '',
};

export const CODE_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'ultra', 'max'];

export const DATA_DIR_NAME = '.pi-switch';
export const CONFIG_FILE_NAME = 'config.json';
export const STATS_DB_NAME = 'stats.db';
export const BACKUPS_DIR_NAME = 'backups';

/** 用量统计自动扫描：启动后首次延迟 + 间隔（毫秒），供主进程调度与界面展示 */
export const STATS_SCAN_INITIAL_DELAY_MS = 30_000;
export const STATS_SCAN_INTERVAL_MS = 3 * 60_000;

export const OLD_PISWITCH_DIR_NAME = '.piswitch';

export const APP_ID = 'com.piswitch.app';
export const APP_NAME = 'PiSwitch';
