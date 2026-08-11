import fs from 'node:fs';
import path from 'node:path';
import type { BackupEntry, Tool } from '../../shared/types';
import { backupsDir } from '../util/paths';
import { copyFile } from '../util/fs-utils';
import { toolConfigPath } from '../util/paths';

function tsStamp(ts = Date.now()): string {
  const d = new Date(ts);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** 备份当前配置文件，返回备份路径 */
export function backupFile(tool: Tool, retention = 20): string | undefined {
  const src = toolConfigPath(tool);
  if (!fs.existsSync(src)) return undefined;
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${tool}-${tsStamp()}-${Math.random().toString(36).slice(2, 6)}.bak`);
  copyFile(src, dest);
  pruneBackups(tool, retention);
  return dest;
}

/** 清理超出保留数量的备份 */
export function pruneBackups(tool: Tool, retention: number): void {
  const dir = backupsDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith(`${tool}-`) && f.endsWith('.bak'));
  } catch {
    return;
  }
  files.sort();
  const excess = files.length - Math.max(1, retention);
  for (let i = 0; i < excess; i++) {
    try {
      fs.unlinkSync(path.join(dir, files[i]));
    } catch {
      /* ignore */
    }
  }
}

/** 备份任意文件（扩展中心等场景），返回备份路径 */
export function backupAnyFile(src: string, tag = 'file', retention = 20): string | undefined {
  if (!fs.existsSync(src)) return undefined;
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${tag}-${tsStamp()}-${Math.random().toString(36).slice(2, 6)}.bak`);
  copyFile(src, dest);
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${tag}-`) && f.endsWith('.bak'))
      .sort();
    while (files.length > retention) {
      const oldest = files.shift();
      if (oldest) fs.rmSync(path.join(dir, oldest), { force: true });
    }
  } catch {
    /* 忽略清理失败 */
  }
  return dest;
}

export function listBackups(tool?: Tool): BackupEntry[] {
  const dir = backupsDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.bak') && (!tool || f.startsWith(`${tool}-`)));
  } catch {
    return [];
  }
  return files
    .map((f) => {
      const p = path.join(dir, f);
      const m = f.match(/^(pi|codex|claude|opencode)-(\d{8}-\d{6})-/);
      let timestamp = 0;
      if (m) {
        const s = m[2];
        timestamp = new Date(
          `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`
        ).getTime();
      } else {
        timestamp = fs.statSync(p).mtimeMs;
      }
      let size = 0;
      try {
        size = fs.statSync(p).size;
      } catch {
        /* ignore */
      }
      return { tool: (m?.[1] as Tool) || 'pi', path: p, timestamp, size };
    })
    .sort((a, b) => b.timestamp - a.timestamp || b.path.localeCompare(a.path));
}

/** 从备份还原：先把当前状态再备份一次，然后覆盖写回 */
export function restoreBackup(entry: BackupEntry, retention = 20): { ok: boolean; error?: string; configPath?: string } {
  const src = entry.path;
  const dest = toolConfigPath(entry.tool);
  if (!fs.existsSync(src)) return { ok: false, error: '备份文件不存在' };
  const currentBackup = backupFile(entry.tool, retention);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    copyFile(src, dest);
    return { ok: true, configPath: dest, ...(currentBackup ? { backupPath: currentBackup } : {}) };
  } catch (e) {
    return { ok: false, error: (e as Error).message, configPath: dest };
  }
}
