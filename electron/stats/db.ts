import Database from 'better-sqlite3';
import fs from 'node:fs';
import type { StatsQuery, StatsSource, StatsStatus, Tool, UsageRecord } from '../../shared/types';
import { statsDbPath } from '../util/paths';

let db: Database.Database | null = null;

export function openDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(require('node:path').dirname(statsDbPath()), { recursive: true });
  db = new Database(statsDbPath());
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      source TEXT NOT NULL,
      tool TEXT NOT NULL,
      provider_id TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      endpoint TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL,
      status TEXT NOT NULL DEFAULT 'ok',
      dedup_key TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_records(ts);
    CREATE INDEX IF NOT EXISTS idx_usage_tool ON usage_records(tool);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model);
    CREATE TABLE IF NOT EXISTS scan_state (
      key TEXT PRIMARY KEY,
      mtime REAL,
      size INTEGER,
      last_row INTEGER
    );
  `);
  // 存量修复：早期版本把 ts 存成了 ISO 文本（列声明 INTEGER 但 SQLite 动态类型不强制）。
  // 文本 ts 会让聚合/日期过滤失效（字符串与数字比较恒为 NaN）。此处幂等迁移为毫秒整数。
  db.exec(`
    UPDATE usage_records
      SET ts = CAST((julianday(ts) - 2440587.5) * 86400000 AS INTEGER)
      WHERE typeof(ts) = 'text';
  `);
  return db;
}

export function closeDb(): void {
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  db = null;
}

export interface InsertRecord {
  ts: number;
  source: StatsSource;
  tool: Tool;
  providerId?: string;
  model?: string;
  endpoint?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  status?: StatsStatus;
  dedupKey: string;
}

const INSERT = `INSERT OR IGNORE INTO usage_records
  (ts, source, tool, provider_id, model, endpoint, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status, dedup_key)
  VALUES (@ts, @source, @tool, @providerId, @model, @endpoint, @inputTokens, @outputTokens, @cacheReadTokens, @cacheWriteTokens, @costUsd, @status, @dedupKey)`;

export function insertRecords(records: InsertRecord[]): { inserted: number; skipped: number } {
  const d = openDb();
  const stmt = d.prepare(INSERT);
  const tx = d.transaction((recs: InsertRecord[]) => {
    let inserted = 0;
    for (const r of recs) {
      const info = stmt.run({
        ts: typeof r.ts === 'number' ? r.ts : Date.parse(String(r.ts)) || Date.now(),
        source: r.source,
        tool: r.tool,
        providerId: r.providerId || '',
        model: r.model || '',
        endpoint: r.endpoint || null,
        inputTokens: r.inputTokens || 0,
        outputTokens: r.outputTokens || 0,
        cacheReadTokens: r.cacheReadTokens || 0,
        cacheWriteTokens: r.cacheWriteTokens || 0,
        costUsd: r.costUsd ?? null,
        status: r.status || 'ok',
        dedupKey: r.dedupKey,
      });
      if (info.changes > 0) inserted++;
    }
    return inserted;
  });
  const inserted = tx(records);
  return { inserted, skipped: records.length - inserted };
}

export function setScanState(key: string, state: { mtime?: number; size?: number; lastRow?: number }): void {
  const d = openDb();
  d.prepare(
    `INSERT INTO scan_state (key, mtime, size, last_row) VALUES (@key, @mtime, @size, @lastRow)
     ON CONFLICT(key) DO UPDATE SET mtime=excluded.mtime, size=excluded.size, last_row=excluded.last_row`
  ).run({ key, mtime: state.mtime ?? null, size: state.size ?? null, lastRow: state.lastRow ?? null });
}

export function getScanState(key: string): { mtime?: number; size?: number; lastRow?: number } {
  const d = openDb();
  const row = d.prepare('SELECT mtime, size, last_row FROM scan_state WHERE key = ?').get(key) as
    | { mtime: number | null; size: number | null; last_row: number | null }
    | undefined;
  if (!row) return {};
  return { mtime: row.mtime ?? undefined, size: row.size ?? undefined, lastRow: row.last_row ?? undefined };
}

export function rowToRecord(r: Record<string, unknown>): UsageRecord {
  return {
    id: r.id as number,
    ts: typeof r.ts === 'number' ? r.ts : Date.parse(String(r.ts)) || 0,
    source: r.source as StatsSource,
    tool: r.tool as Tool,
    providerId: r.provider_id as string,
    model: r.model as string,
    endpoint: (r.endpoint as string) || undefined,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
    costUsd: (r.cost_usd as number) ?? undefined,
    status: r.status as StatsStatus,
  };
}

export function queryPage(q: StatsQuery): { records: UsageRecord[]; total: number } {
  const d = openDb();
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (q.from !== undefined) {
    where.push('ts >= @from');
    params.from = q.from;
  }
  if (q.to !== undefined) {
    where.push('ts <= @to');
    params.to = q.to;
  }
  if (q.tool && q.tool !== 'all') {
    where.push('tool = @tool');
    params.tool = q.tool;
  }
  if (q.model) {
    where.push('model = @model');
    params.model = q.model;
  }
  if (q.source && q.source !== 'all') {
    where.push('source = @source');
    params.source = q.source;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (d.prepare(`SELECT COUNT(*) c FROM usage_records ${whereSql}`).get(params) as { c: number }).c;
  const limit = Math.min(q.limit ?? 100, 1000);
  const offset = q.offset ?? 0;
  const rows = d
    .prepare(`SELECT * FROM usage_records ${whereSql} ORDER BY ts DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as Record<string, unknown>[];
  return { records: rows.map(rowToRecord), total };
}

export function queryAllRaw(whereSql = '', params: Record<string, unknown> = {}): Record<string, unknown>[] {
  const d = openDb();
  return d.prepare(`SELECT * FROM usage_records ${whereSql}`).all(params) as Record<string, unknown>[];
}
