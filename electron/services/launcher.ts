import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type { LaunchResult, Tool } from '../../shared/types';
import { loadConfig } from '../switch-engine/app-config';
import { TOOL_LABELS } from '../constants';

/** 终端模拟器候选（Linux/macOS，按 PATH 可用性选择） */
const TERMINALS: [string, string[]][] = [
  ['x-terminal-emulator', ['-e']],
  ['gnome-terminal', ['--']],
  ['konsole', ['-e']],
  ['xterm', ['-e']],
  ['osascript', ['-e']],
];

function findTerminal(): { bin: string; prefix: string[] } | null {
  const pathDirs = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
  for (const [bin, prefix] of TERMINALS) {
    const hit = pathDirs.some((p) => p && existsSync(`${p}/${bin}`));
    if (hit) return { bin, prefix };
  }
  return null;
}

/** 打开新终端窗口并启动对应 CLI */
export function launchTool(tool: Tool, cwd?: string): LaunchResult {
  const cfg = loadConfig();
  const cli = (cfg.settings.cliPaths[tool] || '').trim() || tool;
  const dir = (cwd || cfg.settings.workingDirs[tool] || '').trim();
  try {
    const isWin = process.platform === 'win32';
    let child;
    if (isWin) {
      // Windows: start 新控制台窗口运行 cmd /k <cli>
      child = spawn('cmd.exe', ['/c', 'start', `"PiSwitch - ${TOOL_LABELS[tool]}"`, 'cmd', '/k', cli], {
        cwd: dir || undefined,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
    } else if (process.platform === 'darwin') {
      // macOS: osascript 打开 Terminal.app 运行 <cli>
      child = spawn(
        'osascript',
        ['-e', `tell application "Terminal" to do script "${cli.replace(/"/g, '\\"')}"`],
        { cwd: dir || undefined, detached: true, stdio: 'ignore' }
      );
    } else {
      // Linux: 优先图形终端，否则 sh -c
      const term = findTerminal();
      child = term
        ? spawn(term.bin, [...term.prefix, cli], { cwd: dir || undefined, detached: true, stdio: 'ignore' })
        : spawn('sh', ['-c', `cd "${dir || '$HOME'}" 2>/dev/null; exec ${cli}`], {
            detached: true,
            stdio: 'ignore',
          });
    }
    child.unref();
    return { ok: true, pid: child.pid };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
