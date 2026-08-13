import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { McpAggItem, McpAgentState, McpSnapshot, McpServerInfo, PromptFile, PromptScope, SkillAggItem, SkillItem, SkillLocation, SystemPromptCandidate, SystemPromptInfo, Tool } from '../../shared/types';
import { claudeDir, codexDir, homeDir, opencodeConfigPath, piAgentDir } from '../util/paths';
import { readJsonFile, writeJsonFile, writeTextFile } from '../util/fs-utils';
import { backupAnyFile } from '../switch-engine/backup';

type Op = { ok: boolean; error?: string };

const TOOL_LABELS: Record<Tool, string> = {
  pi: 'Pi Agent',
  claude: 'Claude Code',
  codex: 'Codex',
  opencode: 'opencode',
};

/* ------------------------------------------------------------------ */
/* MCP 服务器管理                                                       */
/* ------------------------------------------------------------------ */

function claudeJsonPath(): string {
  return path.join(homeDir(), '.claude.json');
}

function piMcpPath(): string {
  return path.join(piAgentDir(), 'mcp.json');
}

function describeServer(name: string, cfg: Record<string, unknown>): McpServerInfo {
  const cmd = Array.isArray(cfg.command) ? cfg.command.join(' ') : typeof cfg.command === 'string' ? cfg.command : undefined;
  const url = typeof cfg.url === 'string' ? cfg.url : undefined;
  let type = 'unknown';
  if (url) type = 'http';
  else if (typeof cfg.type === 'string') type = cfg.type;
  else if (cmd) type = 'stdio';
  return { name, type, command: cmd, url, enabled: cfg.enabled === undefined ? true : !!cfg.enabled, raw: cfg };
}

function readMcpFromClaude(): McpSnapshot {
  const file = claudeJsonPath();
  let servers: McpServerInfo[] = [];
  if (fs.existsSync(file)) {
    try {
      const j = readJsonFile(file) as Record<string, unknown>;
      const mcp = (j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {}) as Record<string, Record<string, unknown>>;
      servers = Object.entries(mcp).map(([n, c]) => describeServer(n, c));
    } catch {
      /* JSON 损坏则返回空 */
    }
  }
  return { tool: 'claude', file, servers };
}

function readMcpFromCodex(): McpSnapshot {
  const file = path.join(codexDir(), 'config.toml');
  let servers: McpServerInfo[] = [];
  if (fs.existsSync(file)) {
    try {
      const toml = parseToml(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      const mcp = (toml.mcp_servers && typeof toml.mcp_servers === 'object' ? toml.mcp_servers : {}) as Record<string, Record<string, unknown>>;
      servers = Object.entries(mcp).map(([n, c]) => describeServer(n, c));
    } catch {
      /* TOML 解析失败返回空 */
    }
  }
  return { tool: 'codex', file, servers };
}

function readMcpFromOpencode(): McpSnapshot {
  const file = opencodeConfigPath();
  let servers: McpServerInfo[] = [];
  if (fs.existsSync(file)) {
    try {
      const j = readJsonFile(file) as Record<string, unknown>;
      const mcp = (j.mcp && typeof j.mcp === 'object' ? j.mcp : {}) as Record<string, Record<string, unknown>>;
      servers = Object.entries(mcp).map(([n, c]) => describeServer(n, c));
    } catch {
      /* 忽略 */
    }
  }
  return { tool: 'opencode', file, servers };
}

function readMcpFromPi(): McpSnapshot {
  const file = piMcpPath();
  let servers: McpServerInfo[] = [];
  if (fs.existsSync(file)) {
    try {
      const j = readJsonFile(file) as Record<string, unknown>;
      const mcp = (j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {}) as Record<string, Record<string, unknown>>;
      servers = Object.entries(mcp).map(([n, c]) => describeServer(n, c));
    } catch {
      /* 忽略 */
    }
  }
  return { tool: 'pi', file, servers };
}

export function getMcpServers(): McpSnapshot[] {
  return [readMcpFromClaude(), readMcpFromCodex(), readMcpFromOpencode(), readMcpFromPi()];
}

/** 写回 MCP 服务器（按工具分发到对应配置文件，写前备份） */
export async function saveMcpServer(tool: Tool, name: string, cfg: Record<string, unknown>): Promise<Op> {
  try {
    if (tool === 'claude') {
      const file = claudeJsonPath();
      backupAnyFile(file, 'claude-json');
      const j = (fs.existsSync(file) ? readJsonFile(file) : {}) as Record<string, unknown>;
      const mcp = (j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {}) as Record<string, unknown>;
      mcp[name] = cfg;
      j.mcpServers = mcp;
      await writeJsonFile(file, j);
    } else if (tool === 'codex') {
      const file = path.join(codexDir(), 'config.toml');
      backupAnyFile(file, 'codex-toml');
      const toml = (fs.existsSync(file) ? parseToml(fs.readFileSync(file, 'utf8')) : {}) as Record<string, unknown>;
      const mcp = (toml.mcp_servers && typeof toml.mcp_servers === 'object' ? toml.mcp_servers : {}) as Record<string, unknown>;
      mcp[name] = cfg;
      toml.mcp_servers = mcp;
      await writeTextFile(file, stringifyToml(toml as never));
    } else if (tool === 'opencode') {
      const file = opencodeConfigPath();
      backupAnyFile(file, 'opencode-json');
      const j = (fs.existsSync(file) ? readJsonFile(file) : {}) as Record<string, unknown>;
      const mcp = (j.mcp && typeof j.mcp === 'object' ? j.mcp : {}) as Record<string, unknown>;
      mcp[name] = cfg;
      j.mcp = mcp;
      await writeJsonFile(file, j);
    } else {
      const file = piMcpPath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      backupAnyFile(file, 'pi-mcp');
      const j = (fs.existsSync(file) ? readJsonFile(file) : {}) as Record<string, unknown>;
      const mcp = (j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {}) as Record<string, unknown>;
      mcp[name] = cfg;
      j.mcpServers = mcp;
      await writeJsonFile(file, j);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteMcpServer(tool: Tool, name: string): Promise<Op> {
  try {
    if (tool === 'claude') {
      const file = claudeJsonPath();
      const j = readJsonFile(file) as Record<string, unknown>;
      const mcp = (j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {}) as Record<string, unknown>;
      if (!(name in mcp)) return { ok: false, error: '服务器不存在' };
      backupAnyFile(file, 'claude-json');
      delete mcp[name];
      j.mcpServers = mcp;
      await writeJsonFile(file, j);
    } else if (tool === 'codex') {
      const file = path.join(codexDir(), 'config.toml');
      const toml = parseToml(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      const mcp = (toml.mcp_servers && typeof toml.mcp_servers === 'object' ? toml.mcp_servers : {}) as Record<string, unknown>;
      if (!(name in mcp)) return { ok: false, error: '服务器不存在' };
      backupAnyFile(file, 'codex-toml');
      delete mcp[name];
      toml.mcp_servers = mcp;
      await writeTextFile(file, stringifyToml(toml as never));
    } else if (tool === 'opencode') {
      const file = opencodeConfigPath();
      const j = readJsonFile(file) as Record<string, unknown>;
      const mcp = (j.mcp && typeof j.mcp === 'object' ? j.mcp : {}) as Record<string, unknown>;
      if (!(name in mcp)) return { ok: false, error: '服务器不存在' };
      backupAnyFile(file, 'opencode-json');
      delete mcp[name];
      j.mcp = mcp;
      await writeJsonFile(file, j);
    } else {
      const file = piMcpPath();
      const j = readJsonFile(file) as Record<string, unknown>;
      const mcp = (j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {}) as Record<string, unknown>;
      if (!(name in mcp)) return { ok: false, error: '服务器不存在' };
      backupAnyFile(file, 'pi-mcp');
      delete mcp[name];
      j.mcpServers = mcp;
      await writeJsonFile(file, j);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* Skills 管理（扫描各工具 skills 目录）                                  */
/* ------------------------------------------------------------------ */

function skillDescription(skillDir: string): string {
  const md = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(md)) return '';
  try {
    const lines = fs.readFileSync(md, 'utf8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('---')) continue;
      if (t.startsWith('#')) continue;
      return t.slice(0, 120);
    }
  } catch {
    /* 忽略 */
  }
  return '';
}

function scanSkillDir(location: SkillLocation, locationLabel: string, dir: string): SkillItem[] {
  if (!fs.existsSync(dir)) return [];
  const out: SkillItem[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(dir, entry.name);
      const hasMd = fs.existsSync(path.join(skillDir, 'SKILL.md'));
      if (!hasMd) continue;
      out.push({
        location,
        locationLabel,
        name: entry.name,
        description: skillDescription(skillDir),
        path: skillDir,
      });
    }
  } catch {
    /* 忽略 */
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function getSkills(): SkillItem[] {
  const dirs: { loc: SkillLocation; label: string; dir: string }[] = [
    { loc: 'pi', label: '用户级（~/.agents/skills）', dir: path.join(homeDir(), '.agents', 'skills') },
    { loc: 'claude', label: 'Claude Code（~/.claude/skills）', dir: path.join(claudeDir(), 'skills') },
    { loc: 'codex', label: 'Codex（~/.codex/skills）', dir: path.join(codexDir(), 'skills') },
    { loc: 'opencode', label: 'opencode（~/.config/opencode/skills）', dir: path.join(homeDir(), '.config', 'opencode', 'skills') },
  ];
  return dirs.flatMap((d) => scanSkillDir(d.loc, d.label, d.dir));
}

export function deleteSkill(location: SkillLocation, name: string): Op {
  try {
    let dir: string;
    if (location === 'pi') dir = path.join(homeDir(), '.agents', 'skills', name);
    else if (location === 'claude') dir = path.join(claudeDir(), 'skills', name);
    else if (location === 'codex') dir = path.join(codexDir(), 'skills', name);
    else dir = path.join(homeDir(), '.config', 'opencode', 'skills', name);
    if (!fs.existsSync(dir)) return { ok: false, error: 'Skill 不存在' };
    backupAnyFile(dir, `skill-${location}-${name}`);
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* Pi Agent 插件（settings.json packages）                              */
/* ------------------------------------------------------------------ */

function piSettingsPath(): string {
  return path.join(piAgentDir(), 'settings.json');
}

export function getPiPlugins(): string[] {
  try {
    const j = readJsonFile(piSettingsPath()) as Record<string, unknown>;
    const pkgs = j.packages;
    return Array.isArray(pkgs) ? (pkgs as string[]) : [];
  } catch {
    return [];
  }
}

async function writePiPlugins(pkgs: string[]): Promise<Op> {
  try {
    const file = piSettingsPath();
    backupAnyFile(file, 'pi-settings');
    const j = (fs.existsSync(file) ? readJsonFile(file) : {}) as Record<string, unknown>;
    j.packages = pkgs;
    await writeJsonFile(file, j);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function addPiPlugin(pkg: string): Promise<Op> {
  const p = pkg.trim();
  if (!p) return { ok: false, error: '请输入包名' };
  const current = getPiPlugins();
  if (current.includes(p)) return { ok: false, error: '该插件已在列表中' };
  return writePiPlugins([...current, p]);
}

export async function removePiPlugin(pkg: string): Promise<Op> {
  const current = getPiPlugins();
  if (!current.includes(pkg)) return { ok: false, error: '插件不存在' };
  return writePiPlugins(current.filter((x) => x !== pkg));
}

/* ------------------------------------------------------------------ */
/* 提示词文件管理                                                        */
/* ------------------------------------------------------------------ */

const PROMPT_SCOPES: { scope: PromptScope; label: string; dir: string }[] = [
  { scope: 'claude-commands', label: 'Claude Code 斜杠命令（~/.claude/commands）', dir: path.join(claudeDir(), 'commands') },
  { scope: 'claude-prompts', label: 'Claude Code 提示词（~/.claude/prompts）', dir: path.join(claudeDir(), 'prompts') },
  { scope: 'pi-prompts', label: 'Pi Agent 提示词模板（~/.pi/agent/prompts）', dir: path.join(piAgentDir(), 'prompts') },
];

export function getPromptFiles(): PromptFile[] {
  const out: PromptFile[] = [];
  for (const s of PROMPT_SCOPES) {
    if (!fs.existsSync(s.dir)) continue;
    try {
      for (const f of fs.readdirSync(s.dir)) {
        if (!f.endsWith('.md')) continue;
        out.push({ scope: s.scope, scopeLabel: s.label, name: f, path: path.join(s.dir, f) });
      }
    } catch {
      /* 忽略 */
    }
  }
  return out.sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
}

export function readPromptFile(p: string): string {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

export async function savePromptFile(p: string, content: string): Promise<Op> {
  try {
    backupAnyFile(p, 'prompt');
    await writeTextFile(p, content);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function createPromptFile(scope: PromptScope, name: string, content: string): Promise<Op & { path?: string }> {
  try {
    const s = PROMPT_SCOPES.find((x) => x.scope === scope);
    if (!s) return { ok: false, error: '未知范围' };
    const clean = name.trim().replace(/\.md$/i, '');
    if (!clean) return { ok: false, error: '请输入文件名' };
    fs.mkdirSync(s.dir, { recursive: true });
    const p = path.join(s.dir, `${clean}.md`);
    if (fs.existsSync(p)) return { ok: false, error: '文件已存在' };
    await writeTextFile(p, content);
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deletePromptFile(p: string): Promise<Op> {
  try {
    if (!fs.existsSync(p)) return { ok: false, error: '文件不存在' };
    backupAnyFile(p, 'prompt');
    fs.rmSync(p, { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* Pi 系统提示词管理（~/.pi/agent/SYSTEM.md + prompts/system-prompts） */
/* ------------------------------------------------------------------ */

function piSystemPromptPath(): string {
  return path.join(piAgentDir(), 'SYSTEM.md');
}

function systemPromptCandidatesDir(): string {
  return path.join(piAgentDir(), 'prompts', 'system-prompts');
}

function sanitizePromptName(name: string): string | undefined {
  const clean = name.trim().replace(/\.md$/i, '').replace(/[\\/:*?"<>|]/g, '-');
  return clean || undefined;
}

export function getSystemPrompt(): SystemPromptInfo {
  const sysPath = piSystemPromptPath();
  const activeContent = fs.existsSync(sysPath) ? fs.readFileSync(sysPath, 'utf8') : null;
  const dir = systemPromptCandidatesDir();
  const candidates: SystemPromptCandidate[] = [];
  if (fs.existsSync(dir)) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md')) continue;
        const content = fs.readFileSync(path.join(dir, f), 'utf8');
        candidates.push({
          name: f.replace(/\.md$/i, ''),
          content,
          active: activeContent !== null && content === activeContent,
        });
      }
    } catch {
      /* 忽略 */
    }
  }
  candidates.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const activeMatch = candidates.find((c) => c.active);
  return {
    active: activeContent !== null ? { name: activeMatch?.name, content: activeContent } : null,
    candidates,
  };
}

export async function enableSystemPrompt(name: string): Promise<Op> {
  try {
    const dir = systemPromptCandidatesDir();
    const file = path.join(dir, `${sanitizePromptName(name)}.md`);
    if (!fs.existsSync(file)) return { ok: false, error: '候选模板不存在' };
    const sysPath = piSystemPromptPath();
    backupAnyFile(sysPath, 'pi-system-prompt');
    await writeTextFile(sysPath, fs.readFileSync(file, 'utf8'));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveSystemPrompt(name: string, content: string, isActive?: boolean): Promise<Op> {
  try {
    const clean = sanitizePromptName(name);
    if (!clean) return { ok: false, error: '请输入模板名称' };
    const dir = systemPromptCandidatesDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${clean}.md`);
    backupAnyFile(file, 'pi-system-prompt');
    await writeTextFile(file, content);
    if (isActive) {
      const sysPath = piSystemPromptPath();
      backupAnyFile(sysPath, 'pi-system-prompt');
      await writeTextFile(sysPath, content);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveActiveSystemPrompt(content: string): Promise<Op> {
  try {
    const sysPath = piSystemPromptPath();
    backupAnyFile(sysPath, 'pi-system-prompt');
    await writeTextFile(sysPath, content);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteSystemPromptCandidate(name: string): Promise<Op> {
  try {
    const dir = systemPromptCandidatesDir();
    const file = path.join(dir, `${sanitizePromptName(name)}.md`);
    if (!fs.existsSync(file)) return { ok: false, error: '候选模板不存在' };
    backupAnyFile(file, 'pi-system-prompt');
    fs.rmSync(file, { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* 跨 Agent 聚合：MCP（按名称去重，右侧 Agent icon 亮暗）               */
/* ------------------------------------------------------------------ */

const MCP_TOOL_ORDER: Tool[] = ['claude', 'codex', 'opencode', 'pi'];

export function getMcpAggregated(): McpAggItem[] {
  const snapshots = getMcpServers();
  const map = new Map<string, McpAggItem>();
  for (const snap of snapshots) {
    for (const s of snap.servers) {
      let item = map.get(s.name);
      if (!item) {
        item = { name: s.name, type: s.type, command: s.command, url: s.url, raw: s.raw, agents: {} };
        map.set(s.name, item);
      } else if (!item.raw && s.raw) {
        // 参考配置：取第一个非空
        item.raw = s.raw;
        if (!item.command && s.command) item.command = s.command;
        if (!item.url && s.url) item.url = s.url;
        if (item.type === 'unknown' && s.type !== 'unknown') item.type = s.type;
      }
      item.agents[snap.tool] = { present: true, enabled: s.enabled !== false };
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** 让某个 Agent 使用该 MCP（无则添加，有则启用） */
export async function applyMcpToAgent(tool: Tool, name: string): Promise<Op> {
  try {
    const snapshots = getMcpServers();
    const ref = snapshots.flatMap((s) => s.servers).find((s) => s.name === name);
    if (!ref?.raw) return { ok: false, error: '未找到该 MCP 的参考配置' };
    const existing = snapshots.find((s) => s.tool === tool)?.servers.find((s) => s.name === name);
    const cfg = { ...ref.raw, enabled: true };
    if (existing) {
      // 已存在（可能停用）：保留原有其它字段，仅启用
      const merged = { ...existing.raw, ...cfg, enabled: true };
      return saveMcpServer(tool, name, merged);
    }
    return saveMcpServer(tool, name, cfg);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 批量写同一 MCP 到多个 Agent（新增/编辑共用） */
export async function saveMcpForAgents(name: string, cfg: Record<string, unknown>, tools: Tool[]): Promise<Op> {
  for (const t of tools) {
    const r = await saveMcpServer(t, name, cfg);
    if (!r.ok) return { ok: false, error: `${TOOL_LABELS[t]} 写入失败：${r.error}` };
  }
  return { ok: true };
}

/** 从所有使用该 MCP 的 Agent 中删除 */
export async function deleteMcpEverywhere(name: string): Promise<Op> {
  const snapshots = getMcpServers();
  for (const snap of snapshots) {
    if (snap.servers.some((s) => s.name === name)) {
      const r = await deleteMcpServer(snap.tool, name);
      if (!r.ok) return { ok: false, error: `${TOOL_LABELS[snap.tool]} 删除失败：${r.error}` };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 跨 Agent 聚合：Skills（按名称去重，右侧 Agent icon 亮暗）             */
/* ------------------------------------------------------------------ */

const SKILL_DIRS: { tool: Tool; dir: string }[] = [
  { tool: 'pi', dir: path.join(homeDir(), '.agents', 'skills') },
  { tool: 'claude', dir: path.join(claudeDir(), 'skills') },
  { tool: 'codex', dir: path.join(codexDir(), 'skills') },
  { tool: 'opencode', dir: path.join(homeDir(), '.config', 'opencode', 'skills') },
];

function skillDirOf(tool: Tool): string {
  return SKILL_DIRS.find((d) => d.tool === tool)?.dir ?? '';
}

export function getSkillsAggregated(): SkillAggItem[] {
  const all = getSkills();
  const map = new Map<string, SkillAggItem>();
  for (const s of all) {
    const tool: Tool = s.location;
    let item = map.get(s.name);
    if (!item) {
      item = { name: s.name, description: s.description, path: s.path, agents: {} };
      map.set(s.name, item);
    } else if (!item.description && s.description) {
      item.description = s.description;
    }
    item.agents[tool] = true;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** 把某个 Skill 目录复制到指定 Agent 的 skills 目录 */
export async function installSkillToAgent(name: string, tool: Tool): Promise<Op> {
  try {
    const agg = getSkillsAggregated().find((s) => s.name === name);
    const src = agg?.path;
    if (!src || !fs.existsSync(src)) return { ok: false, error: '未找到该 Skill 源目录' };
    const dest = path.join(skillDirOf(tool), name);
    if (fs.existsSync(dest)) return { ok: false, error: `${TOOL_LABELS[tool]} 已安装该 Skill` };
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 从所有安装位置删除该 Skill（逐个备份后删除） */
export async function deleteSkillEverywhere(name: string): Promise<Op> {
  const agg = getSkillsAggregated().find((s) => s.name === name);
  if (!agg) return { ok: false, error: 'Skill 不存在' };
  for (const [tool, installed] of Object.entries(agg.agents) as [Tool, boolean][]) {
    if (!installed) continue;
    const loc: SkillLocation = tool;
    const r = deleteSkill(loc, name);
    if (!r.ok) return { ok: false, error: `${TOOL_LABELS[tool]} 删除失败：${r.error}` };
  }
  return { ok: true };
}
