import fs from 'node:fs';
import type { DailyAgg, HourlyAgg, ModelAgg, StatsPage, StatsQuery, StatsRange, StatsSummary, Tool, UsageRecord } from '../../shared/types';
import { queryAllRaw, queryPage, rowToRecord, openDb } from './db';
import { TOOL_LABELS } from '../constants';
import { loadConfig } from '../switch-engine/app-config';
import { resolveModelPrice, costFromPrices } from '../proxy/pricing';
import { dataDir } from '../util/paths';
function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayStart(offsetDays: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d.getTime();
}

function emptyAgg(day = ''): DailyAgg {
  return {
    day,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
    requests: 0,
  };
}

type AggLike = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  requests: number;
};

function addTo(a: AggLike, r: UsageRecord): void {
  a.inputTokens += r.inputTokens || 0;
  a.outputTokens += r.outputTokens || 0;
  a.cacheReadTokens += r.cacheReadTokens || 0;
  a.cacheWriteTokens += r.cacheWriteTokens || 0;
  a.costUsd += r.costUsd || 0;
  a.requests += 1;
}

function sumBetween(from: number, to: number, rows: UsageRecord[]): DailyAgg {
  const agg = emptyAgg();
  for (const r of rows) {
    const ts = r.ts;
    if (ts < from || ts > to) continue;
    addTo(agg, r);
  }
  return agg;
}

export function getSummary(range?: StatsRange): StatsSummary {
  const recs = queryAllRaw().map(rowToRecord);
  // 排行随范围过滤（today/week/month/total 卡始终基于全量，供概览页使用）
  let ranked: UsageRecord[] = recs;
  const now = Date.now();
  const todayStart = dayStart(0);
  const weekStart = dayStart(6);
  const monthStart = dayStart(29);
  if (range === 'today') ranked = recs.filter((r) => r.ts >= todayStart);
  else if (range === '7d') ranked = recs.filter((r) => r.ts >= weekStart);
  else if (range === '30d') ranked = recs.filter((r) => r.ts >= monthStart);

  const byToolMap = new Map<string, ModelAgg>();
  const byModelMap = new Map<string, ModelAgg>();
  for (const r of ranked) {
    const tool = r.tool;
    const model = r.model || 'unknown';
    const tk = `tool:${tool}`;
    const mk = `model:${tool}|${model}`;
    let t = byToolMap.get(tk);
    if (!t) {
      t = { key: tk, label: TOOL_LABELS[tool] || tool, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, requests: 0 };
      byToolMap.set(tk, t);
    }
    let m = byModelMap.get(mk);
    if (!m) {
      m = { key: mk, label: model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, requests: 0 };
      byModelMap.set(mk, m);
    }
    addTo(t, r);
    addTo(m, r);
  }

  return {
    today: sumBetween(todayStart, now, recs),
    week: sumBetween(weekStart, now, recs),
    month: sumBetween(monthStart, now, recs),
    total: sumBetween(0, now, recs),
    byTool: [...byToolMap.values()].sort((a, b) => b.costUsd - a.costUsd),
    byModel: [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd),
  };
}

export function getDailyTrend(days = 30): DailyAgg[] {
  const recs = queryAllRaw().map(rowToRecord);
  const start = dayStart(days - 1);
  const map = new Map<string, DailyAgg>();
  for (const r of recs) {
    const ts = r.ts;
    if (ts < start) continue;
    const k = dayKey(ts);
    let agg = map.get(k);
    if (!agg) {
      agg = emptyAgg(k);
      map.set(k, agg);
    }
    addTo(agg, r);
  }
  const out: DailyAgg[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(dayStart(i));
    const p = (n: number) => String(n).padStart(2, '0');
    const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    out.push(map.get(k) || emptyAgg(k));
  }
  return out;
}

/** 今日按小时聚合（本地时区 0-23，空小时补 0） */
export function getHourlyTrend(): HourlyAgg[] {
  const recs = queryAllRaw().map(rowToRecord);
  const todayStart = dayStart(0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const map = new Map<number, HourlyAgg>();
  for (const r of recs) {
    const ts = r.ts;
    if (ts < todayStart || ts >= tomorrow.getTime()) continue;
    const h = new Date(ts).getHours();
    let agg = map.get(h);
    if (!agg) {
      agg = { hour: h, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, requests: 0 };
      map.set(h, agg);
    }
    addTo(agg, r);
  }
  const out: HourlyAgg[] = [];
  for (let h = 0; h < 24; h++) {
    out.push(map.get(h) || { hour: h, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, requests: 0 });
  }
  return out;
}
export function getStatsPage(q: StatsQuery): StatsPage {
  return queryPage(q);
}

/**
 * 存量回填：为 cost_usd IS NULL 且 token>0 的历史记录按价格表补算费用。
 * 幂等（只处理 NULL），可在应用启动与扫描后调用。
 */
export function backfillCosts(): number {
  const cfg = loadConfig();
  const agentProviders = new Map(
    (Object.keys(cfg.agents) as Tool[]).map((t) => [t, cfg.agents[t].providers])
  );
  const d = openDb();
  const rows = d
    .prepare(
      `SELECT id, tool, provider_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
       FROM usage_records
       WHERE cost_usd IS NULL AND (input_tokens > 0 OR output_tokens > 0)`
    )
    .all() as {
    id: number;
    tool: Tool;
    provider_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
  }[];
  const upd = d.prepare('UPDATE usage_records SET cost_usd = @c WHERE id = @id');
  let n = 0;
  for (const r of rows) {
    const prices = resolveModelPrice(agentProviders.get(r.tool), r.provider_id, r.model);
    if (!prices) continue;
    upd.run({
      c: costFromPrices(prices, {
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cacheReadTokens: r.cache_read_tokens,
        cacheWriteTokens: r.cache_write_tokens,
      }),
      id: r.id,
    });
    n++;
  }
  return n;
}

export function exportCsv(q: StatsQuery): { path: string } {
  const { records } = queryPage({ ...q, limit: 100000 });
  const header = ['时间', '来源', '工具', '模型', '输入tokens', '输出tokens', '缓存读', '缓存写', '费用USD', '状态'];
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = records.map((r) => {
    const d = new Date(r.ts);
    const time = `${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN')}`;
    return [time, r.source, r.tool, r.model, r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWriteTokens, (r.costUsd ?? 0).toFixed(6), r.status]
      .map((v) => esc(String(v)))
      .join(',');
  });
  const file = `${dataDir()}/export-${Date.now()}.csv`;
  fs.writeFileSync(file, '\ufeff' + header.join(',') + '\n' + lines.join('\n'), 'utf8');
  return { path: file };
}
