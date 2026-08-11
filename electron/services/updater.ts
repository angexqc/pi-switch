import { exec, spawn } from 'node:child_process';
import https from 'node:https';
import type { Tool, ToolVersion } from '../../shared/types';

/** 各 CLI 全局 npm 包名（用于 npm update -g 兜底升级 + 最新版本查询） */
export const NPM_PACKAGES: Record<Tool, string> = {
  pi: '@earendil-works/pi-agent-core',
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  opencode: 'opencode-ai',
};

const TOOL_ORDER: Tool[] = ['pi', 'claude', 'codex', 'opencode'];

export function runCmd(cmdLine: string, timeoutMs = 20_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const opts: import('node:child_process').ExecOptions = { shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', timeout: timeoutMs, windowsHide: true };
    exec(cmdLine, opts, (err, stdout, stderr) => {
      resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, out: `${stdout}${stderr}`.trim() });
    });
  });
}

/** 从任意命令输出中提取首个 semver（如 `codex-cli 0.147.0` → 0.147.0） */
export function extractVersion(raw: string): string | undefined {
  const m = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(raw);
  return m ? m[1] : undefined;
}

function numPart(v: string): number[] {
  return v.split(/[.-]/).map((s) => {
    const n = Number.parseInt(s, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

/** 简单 semver 对比：a>b→1, a<b→-1, 相等→0（预发布视为低于正式版） */
export function compareVersions(a: string, b: string): number {
  const [av, ap] = a.split('+')[0].split('-');
  const [bv, bp] = b.split('+')[0].split('-');
  const an = numPart(av);
  const bn = numPart(bv);
  const len = Math.max(an.length, bn.length);
  for (let i = 0; i < len; i++) {
    const x = an[i] ?? 0;
    const y = bn[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (ap && !bp) return -1; // a 是预发布 → 低
  if (!ap && bp) return 1;
  if (ap && bp) {
    if (ap === bp) return 0;
    return ap < bp ? -1 : 1;
  }
  return 0;
}

/** npm registry 查询最新版本（尊重 npm_config_registry 镜像），带缓存 */
const latestCache = new Map<string, { ts: number; version: string }>();
function fetchLatest(pkg: string, timeoutMs = 8000): Promise<string | undefined> {
  const hit = latestCache.get(pkg);
  if (hit && Date.now() - hit.ts < 10 * 60_000) return Promise.resolve(hit.version);
  const registry = process.env.npm_config_registry?.replace(/\/$/, '') || 'https://registry.npmjs.org';
  const url = `${registry}/${pkg}/latest`;
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const redir = https.get(res.headers.location, { timeout: timeoutMs }, (r2) => {
          collectBody(r2, timeoutMs).then((body) => {
            try {
              const v = (JSON.parse(body) as { version?: string }).version;
              if (v) latestCache.set(pkg, { ts: Date.now(), version: v });
              resolve(v);
            } catch {
              resolve(undefined);
            }
          });
        });
        redir.on('error', () => resolve(undefined));
        return;
      }
      collectBody(res, timeoutMs).then((body) => {
        try {
          const v = (JSON.parse(body) as { version?: string }).version;
          if (v) latestCache.set(pkg, { ts: Date.now(), version: v });
          resolve(v);
        } catch {
          resolve(undefined);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(undefined));
  });
}

function collectBody(res: import('node:http').IncomingMessage, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    }, timeoutMs);
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    res.on('error', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
  });
}

/** 版本命令：claude --version / codex --version / opencode --version / pi --version */
const VERSION_CMDS: Record<Tool, string> = {
  pi: 'pi --version',
  claude: 'claude --version',
  codex: 'codex --version',
  opencode: 'opencode --version',
};

export async function getToolVersions(): Promise<ToolVersion[]> {
  const out: ToolVersion[] = [];
  for (const tool of TOOL_ORDER) {
    const r = await runCmd(VERSION_CMDS[tool], 12_000);
    const line = r.out.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    const version = line ? extractVersion(line) : undefined;
    const latest = version ? await fetchLatest(NPM_PACKAGES[tool]) : undefined;
    out.push({
      tool,
      found: r.code === 0 && !!version,
      version,
      latest,
      updateAvailable: version && latest ? compareVersions(version, latest) < 0 : undefined,
      error: r.code !== 0 ? (line || '命令执行失败') : undefined,
    });
  }
  return out;
}

/** 升级命令：优先工具自带，兜底 npm update -g */
const UPGRADE_CMDS: Record<Tool, string> = {
  pi: `npm update -g ${NPM_PACKAGES.pi}`,
  claude: 'claude update',
  codex: 'codex update',
  opencode: `npm update -g ${NPM_PACKAGES.opencode}`,
};

export async function upgradeTool(tool: Tool): Promise<{ ok: boolean; output?: string; error?: string }> {
  const cmd = UPGRADE_CMDS[tool];
  const r = await runCmd(cmd, 180_000);
  if (r.code === 0) return { ok: true, output: r.out || '升级命令执行完成' };
  // claude update 失败时兜底 npm 更新
  if (tool === 'claude') {
    const fb = await runCmd(`npm update -g ${NPM_PACKAGES.claude}`, 180_000);
    if (fb.code === 0) return { ok: true, output: fb.out || 'npm 更新完成' };
    return { ok: false, error: `${r.out}\n${fb.out}`.slice(0, 800) };
  }
  return { ok: false, error: r.out.slice(0, 800) };
}

/** 执行 skills.sh 官方 CLI（npx skills ...），流式收集输出 */
export function runSkillsCommand(
  args: string[],
  timeoutMs = 300_000
): Promise<{ ok: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const esc = (a: string) => (/[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
    const cmdLine = `npx -y skills ${args.map(esc).join(' ')}`;
    const child = spawn(cmdLine, {
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const push = (d: Buffer) => {
      out += d.toString('utf8');
      if (out.length > 200_000) out = out.slice(-200_000);
    };
    child.stdout?.on('data', push);
    child.stderr?.on('data', push);
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: `执行超时（${Math.round(timeoutMs / 1000)}s）\n${out.slice(-1500)}` });
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, output: out.trim() || '执行完成' });
      else resolve({ ok: false, error: out.trim().slice(-1500) || `退出码 ${code}` });
    });
  });
}
