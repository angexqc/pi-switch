import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { InsertRecord } from './db';
import { piAgentDir, claudeDir, codexLogsDbPath, opencodeDbPath } from '../util/paths';
import { getScanState, setScanState } from './db';
import { walkFiles } from '../util/fs-utils';
import { loadConfig } from '../switch-engine/app-config';
import { resolveModelPrice, costFromPrices } from '../proxy/pricing';
import type { Provider, Tool } from '../../shared/types';

// ---------------------------------------------------------------------------
// pi：~/.pi/agent/sessions/**/*.jsonl，message 记录带 usage
// ---------------------------------------------------------------------------

export function scanPiSessions(): InsertRecord[] {
  const sessionsDir = path.join(piAgentDir(), 'sessions');
  const files = walkFiles(sessionsDir, '.jsonl');
  const out: InsertRecord[] = [];
  for (const file of files) {
    const stat = fs.statSync(file);
    const key = `pi:${file}`;
    const prev = getScanState(key);
    if (prev.mtime === stat.mtimeMs && prev.size === stat.size) continue;
    try {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        let rec: Record<string, unknown>;
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }
        if (rec.type !== 'message') continue;
        const msg = (rec.message || {}) as Record<string, unknown>;
        if (msg.role !== 'assistant') continue;
        const usage = (msg.usage || {}) as Record<string, number>;
        if (typeof usage.input !== 'number' && typeof usage.output !== 'number') continue;
        const tsRaw = (rec.timestamp as number) || (msg.timestamp as number) || 0;
        out.push({
          ts: tsRaw,
          source: 'pi-log',
          tool: 'pi',
          providerId: (msg.provider as string) || '',
          model: (msg.model as string) || '',
          endpoint: 'session',
          inputTokens: usage.input || 0,
          outputTokens: usage.output || 0,
          cacheReadTokens: usage.cacheRead || 0,
          cacheWriteTokens: usage.cacheWrite || 0,
          status: 'ok',
          dedupKey: `pi:${file}:${i + 1}`,
        });
      }
      setScanState(key, { mtime: stat.mtimeMs, size: stat.size });
    } catch (e) {
      console.error('[PiSwitch] pi 会话解析失败:', (e as Error).message);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// claude：~/.claude/projects/**/*.jsonl 会话转录
// ---------------------------------------------------------------------------

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function scanClaudeTranscripts(): InsertRecord[] {
  const base = path.join(claudeDir(), 'projects');
  const files = walkFiles(base, '.jsonl');
  const out: InsertRecord[] = [];
  for (const file of files) {
    const stat = fs.statSync(file);
    const key = `claude:${file}`;
    const prev = getScanState(key);
    if (prev.mtime === stat.mtimeMs && prev.size === stat.size) continue;
    try {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        let rec: Record<string, unknown>;
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }
        if (rec.type !== 'assistant') continue;
        const msg = (rec.message || {}) as Record<string, unknown>;
        const usage = (msg.usage || {}) as ClaudeUsage;
        const hasUsage =
          typeof usage.input_tokens === 'number' || typeof usage.output_tokens === 'number';
        if (!hasUsage) continue;
        const tsRaw =
          typeof rec.timestamp === 'string'
            ? new Date(rec.timestamp).getTime()
            : (rec.timestamp as number) || 0;
        const costUSD = (msg.costUSD as number) ?? (rec.costUSD as number);
        out.push({
          ts: tsRaw,
          source: 'claude-log',
          tool: 'claude',
          providerId: (msg.provider as string) || 'claude',
          model: (msg.model as string) || '',
          endpoint: 'messages',
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
          cacheWriteTokens: usage.cache_creation_input_tokens || 0,
          costUsd: typeof costUSD === 'number' ? costUSD : undefined,
          status: 'ok',
          dedupKey: `claude:${file}:${i + 1}`,
        });
      }
      setScanState(key, { mtime: stat.mtimeMs, size: stat.size });
    } catch (e) {
      console.error('[PiSwitch] claude 转录解析失败:', (e as Error).message);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// codex：logs_2.sqlite 结构化日志中的 codex.turn.token_usage
// ---------------------------------------------------------------------------

const USAGE_RE =
  /codex\.turn\.token_usage\.input_tokens=(\d+)[^]*?codex\.turn\.token_usage\.cached_input_tokens=(\d+)[^]*?codex\.turn\.token_usage\.cache_write_input_tokens=(\d+)[^]*?codex\.turn\.token_usage\.output_tokens=(\d+)/;
const MODEL_RE = /\bturn\.id=[^\s]+\s+model=([^\s]+)/;
const REASON_RE = /codex\.turn\.token_usage\.reasoning_output_tokens=(\d+)/;

export function scanCodexLogs(): InsertRecord[] {
  const dbPath = codexLogsDbPath();
  const out: InsertRecord[] = [];
  if (!fs.existsSync(dbPath)) return out;
  let lastRow = getScanState('codex:logs').lastRow ?? 0;
  let maxId = lastRow;
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT id, ts, feedback_log_body FROM logs
         WHERE id > ? AND feedback_log_body LIKE '%token_usage%' ORDER BY id ASC LIMIT 5000`
      )
      .all(lastRow) as { id: number; ts: number; feedback_log_body: string | null }[];
    // 扫描指针始终推进到最后一条已扫描行（无论是否含 usage）：
    // 若只推进匹配行，中间夹一段无 usage 的日志会导致指针停滞，
    // 其后的新用量记录将永远不会被增量扫描发现（表现为“必须手动扫描才更新”）。
    if (rows.length) maxId = rows[rows.length - 1].id;
    for (const r of rows) {
      const body = r.feedback_log_body || '';
      const m = body.match(USAGE_RE);
      if (!m) continue;
      const modelMatch = body.match(MODEL_RE);
      const reasonMatch = body.match(REASON_RE);
      const input = parseInt(m[1], 10);
      const cached = parseInt(m[2], 10);
      const cacheWrite = parseInt(m[3], 10);
      const output = parseInt(m[4], 10);
      const reasoning = reasonMatch ? parseInt(reasonMatch[1], 10) : 0;
      out.push({
        ts: r.ts * 1000,
        source: 'codex-log',
        tool: 'codex',
        providerId: '',
        model: modelMatch?.[1] || '',
        endpoint: 'turn',
        inputTokens: input,
        outputTokens: output + reasoning,
        cacheReadTokens: cached,
        cacheWriteTokens: cacheWrite,
        status: 'ok',
        dedupKey: `codex:${r.id}`,
      });
    }
    if (maxId > lastRow) setScanState('codex:logs', { lastRow: maxId });
  } catch (e) {
    console.error('[PiSwitch] codex 日志解析失败:', (e as Error).message);
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// opencode：~/.local/share/opencode/opencode.db 的 session 表
// ---------------------------------------------------------------------------

export function scanOpencode(): InsertRecord[] {
  const dbPath = opencodeDbPath();
  const out: InsertRecord[] = [];
  if (!fs.existsSync(dbPath)) return out;
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, timeout: 2000 });
    const rows = db
      .prepare(
        `SELECT id, model, cost, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, time_updated
         FROM session WHERE (tokens_input > 0 OR tokens_output > 0)`
      )
      .all() as {
      id: string;
      model: string | null;
      cost: number | null;
      tokens_input: number;
      tokens_output: number;
      tokens_cache_read: number;
      tokens_cache_write: number;
      time_updated: number;
    }[];
    for (const r of rows) {
      out.push({
        ts: r.time_updated || Date.now(),
        source: 'opencode-log',
        tool: 'opencode',
        providerId: '',
        model: r.model || 'unknown',
        endpoint: 'session',
        inputTokens: r.tokens_input || 0,
        outputTokens: r.tokens_output || 0,
        cacheReadTokens: r.tokens_cache_read || 0,
        cacheWriteTokens: r.tokens_cache_write || 0,
        costUsd: r.cost ?? undefined,
        status: 'ok',
        dedupKey: `opencode:${r.id}`,
      });
    }
  } catch (e) {
    console.error('[PiSwitch] opencode 统计解析失败:', (e as Error).message);
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** 扫描全部日志源 */
export function scanAllLogs(): {
  source: 'pi-log' | 'claude-log' | 'codex-log' | 'opencode-log';
  scanned: number;
  inserted: number;
  skipped: number;
  error?: string;
}[] {
  const results: ReturnType<typeof scanAllLogs> = [];
  // 加载价格上下文：config 缺失时静默跳过费用计算（token 仍正常入库）
  let agentProviders: Map<Tool, Provider[]> | undefined;
  try {
    const cfg = loadConfig();
    agentProviders = new Map(
      (Object.keys(cfg.agents) as Tool[]).map((t) => [t, cfg.agents[t].providers])
    );
  } catch {
    agentProviders = undefined;
  }
  // 日志源没有自带费用（pi/codex）时，按模型价格表补算；已有费用（claude/opencode）保留
  const price = (r: InsertRecord): InsertRecord => {
    if (r.costUsd !== undefined) return r;
    const providers = agentProviders?.get(r.tool);
    const prices = resolveModelPrice(providers, r.providerId || '', r.model || '');
    if (!prices) return r;
    return {
      ...r,
      costUsd: costFromPrices(prices, {
        inputTokens: r.inputTokens || 0,
        outputTokens: r.outputTokens || 0,
        cacheReadTokens: r.cacheReadTokens || 0,
        cacheWriteTokens: r.cacheWriteTokens || 0,
      }),
    };
  };
  const sources: { name: 'pi-log' | 'claude-log' | 'codex-log' | 'opencode-log'; scan: () => InsertRecord[] }[] = [
    { name: 'pi-log', scan: scanPiSessions },
    { name: 'claude-log', scan: scanClaudeTranscripts },
    { name: 'codex-log', scan: scanCodexLogs },
    { name: 'opencode-log', scan: scanOpencode },
  ];
  for (const s of sources) {
    try {
      const recs = s.scan().map(price);
      const { inserted, skipped } = require('./db').insertRecords(recs);
      results.push({ source: s.name, scanned: recs.length, inserted, skipped });
    } catch (e) {
      results.push({ source: s.name, scanned: 0, inserted: 0, skipped: 0, error: (e as Error).message });
    }
  }
  return results;
}
