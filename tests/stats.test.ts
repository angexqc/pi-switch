import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb, closeDb, insertRecords, queryPage, getScanState, setScanState } from '../electron/stats/db';
import { scanPiSessions, scanClaudeTranscripts, scanCodexLogs, scanOpencode } from '../electron/stats/parsers';

let home: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.PI_SWITCH_HOME;
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'piswitch-stats-'));
  process.env.PI_SWITCH_HOME = home;
  closeDb();
});

afterEach(() => {
  closeDb();
  if (originalHome === undefined) delete process.env.PI_SWITCH_HOME;
  else process.env.PI_SWITCH_HOME = originalHome;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('stats db', () => {
  it('插入、去重、查询', () => {
    openDb();
    const r1 = insertRecords([
      { ts: 1700000000000, source: 'proxy', tool: 'pi', providerId: 'deepseek', model: 'm1', inputTokens: 10, outputTokens: 5, costUsd: 0.01, dedupKey: 'proxy:1' },
      { ts: 1700000000001, source: 'proxy', tool: 'pi', providerId: 'deepseek', model: 'm1', inputTokens: 20, outputTokens: 6, costUsd: 0.02, dedupKey: 'proxy:2' },
    ]);
    expect(r1.inserted).toBe(2);
    // 重复 dedupKey 跳过
    const r2 = insertRecords([
      { ts: 1700000000002, source: 'proxy', tool: 'pi', model: 'm1', inputTokens: 999, dedupKey: 'proxy:1' },
    ]);
    expect(r2.inserted).toBe(0);
    const page = queryPage({ tool: 'pi', limit: 10 });
    expect(page.total).toBe(2);
    expect(page.records[0].inputTokens).toBe(20);
  });

  it('scan_state 记忆', () => {
    openDb();
    setScanState('pi:/x.jsonl', { mtime: 123, size: 456 });
    const s = getScanState('pi:/x.jsonl');
    expect(s.mtime).toBe(123);
    expect(s.size).toBe(456);
  });
});

describe('pi parser', () => {
  it('解析 assistant message 的 usage', () => {
    const dir = path.join(home, '.pi', 'agent', 'sessions', 'proj');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 's.jsonl');
    fs.writeFileSync(
      file,
      [
        JSON.stringify({ type: 'session', id: 's' }),
        JSON.stringify({ type: 'message', id: '1', timestamp: 1700000000000, message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }),
        JSON.stringify({ type: 'message', id: '2', timestamp: 1700000001000, message: { role: 'assistant', provider: 'deepseek', model: 'deepseek-v4-flash', usage: { input: 100, output: 20, cacheRead: 5, cacheWrite: 0 } } }),
      ].join('\n')
    );
    const recs = scanPiSessions();
    expect(recs.length).toBe(1);
    expect(recs[0]).toMatchObject({ tool: 'pi', source: 'pi-log', providerId: 'deepseek', model: 'deepseek-v4-flash', inputTokens: 100, outputTokens: 20, cacheReadTokens: 5 });
    // 二次扫描（mtime+size 未变）不再产生记录
    expect(scanPiSessions().length).toBe(0);
  });
});

describe('claude parser', () => {
  it('解析 assistant 转录 usage', () => {
    const dir = path.join(home, '.claude', 'projects', 'p');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 't.jsonl');
    fs.writeFileSync(
      file,
      [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' } }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-08-01T10:00:00Z',
          message: {
            role: 'assistant',
            model: 'claude-sonnet-4-5',
            costUSD: 0.05,
            usage: { input_tokens: 200, output_tokens: 30, cache_creation_input_tokens: 50, cache_read_input_tokens: 100 },
          },
        }),
      ].join('\n')
    );
    const recs = scanClaudeTranscripts();
    expect(recs.length).toBe(1);
    expect(recs[0]).toMatchObject({ tool: 'claude', inputTokens: 200, outputTokens: 30, cacheReadTokens: 100, cacheWriteTokens: 50, costUsd: 0.05, model: 'claude-sonnet-4-5' });
  });
});

describe('codex parser', () => {
  it('从 logs_2.sqlite 提取 token_usage', () => {
    const dir = path.join(home, '.codex');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'logs_2.sqlite'));
    db.exec('CREATE TABLE logs (id INTEGER PRIMARY KEY, ts INTEGER, feedback_log_body TEXT)');
    db.prepare('INSERT INTO logs VALUES (1, 1700000000, ?)').run(
      'turn{otel.name="session_task.turn" thread.id=x turn.id=y model=gpt-5.6-sol codex.turn.reasoning_effort=medium}:run_turn: codex.turn.token_usage.input_tokens=1000 codex.turn.token_usage.cached_input_tokens=600 codex.turn.token_usage.cache_write_input_tokens=100 codex.turn.token_usage.non_cached_input_tokens=300 codex.turn.token_usage.output_tokens=50 codex.turn.token_usage.reasoning_output_tokens=10 codex.turn.token_usage.total_tokens=1050'
    );
    db.close();
    const recs = scanCodexLogs();
    expect(recs.length).toBe(1);
    expect(recs[0]).toMatchObject({ tool: 'codex', model: 'gpt-5.6-sol', inputTokens: 1000, outputTokens: 60, cacheReadTokens: 600, cacheWriteTokens: 100 });
  });
});

describe('opencode parser', () => {
  it('从 opencode.db session 表提取用量', () => {
    const dir = path.join(home, '.local', 'share', 'opencode');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'opencode.db'));
    db.exec('CREATE TABLE session (id TEXT, model TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, time_updated INTEGER)');
    db.prepare('INSERT INTO session VALUES (?,?,?,?,?,?,?,?)').run('ses_1', null, 1.23, 500, 50, 100, 0, 1700000000000);
    db.close();
    const recs = scanOpencode();
    expect(recs.length).toBe(1);
    expect(recs[0]).toMatchObject({ tool: 'opencode', inputTokens: 500, outputTokens: 50, cacheReadTokens: 100, costUsd: 1.23, model: 'unknown' });
  });
});
