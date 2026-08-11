import { spawn } from 'node:child_process';
import type { LaunchResult, Tool } from '../../shared/types';
import { loadConfig } from '../switch-engine/app-config';
import { TOOL_LABELS } from '../constants';

/** 打开新终端窗口并启动对应 CLI */
export function launchTool(tool: Tool, cwd?: string): LaunchResult {
  const cfg = loadConfig();
  const cli = (cfg.settings.cliPaths[tool] || '').trim() || tool;
  const dir = (cwd || cfg.settings.workingDirs[tool] || '').trim();
  try {
    // Windows: start 新控制台窗口运行 cmd /k <cli>
    const args = ['/c', 'start', `"PiSwitch - ${TOOL_LABELS[tool]}"`, 'cmd', '/k', cli];
    const child = spawn('cmd.exe', args, {
      cwd: dir || undefined,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { ok: true, pid: child.pid };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
