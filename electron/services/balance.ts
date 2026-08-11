import http from 'node:http';
import https from 'node:https';
import type { ApiKind } from '../../shared/types';

export interface BalanceResult {
  ok: boolean;
  /** 可用余额（USD） */
  balance?: number;
  /** 累计充值 */
  totalGranted?: number;
  /** 已用金额 */
  totalUsed?: number;
  /** 额度上限（subscription.hard_limit_usd） */
  hardLimit?: number;
  currency?: string;
  error?: string;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  // baseUrl 可能已含 /v1 或 /v1/ 结尾
  if (b.endsWith('/v1')) return `${b}${path.replace(/^\/v1/, '')}`;
  if (/\/v1\/?$/.test(b)) return `${b}${path}`;
  return `${b}${path}`;
}

function requestJson(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function tryParse(body: string): Record<string, unknown> | undefined {
  try {
    const obj = JSON.parse(body) as Record<string, unknown>;
    return obj && typeof obj === 'object' ? obj : undefined;
  } catch {
    return undefined;
  }
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/**
 * 查询供应商余额（类似 cc-switch）。
 * OpenAI 兼容端点按优先级尝试：credit_grants → subscription → /v1/balance（new-api/one-api 中转）。
 */
export async function queryProviderBalance(baseUrl: string, api: ApiKind, apiKey?: string): Promise<BalanceResult> {
  if (api === 'anthropic-messages') {
    return { ok: false, error: 'Anthropic 无公开余额查询接口（组织级 Key 可自行调用 /v1/organizations/usage/costs）' };
  }
  if (!apiKey) return { ok: false, error: '未配置 API Key，无法查询余额' };
  const auth = { Authorization: `Bearer ${apiKey}` };

  const candidates: { path: string; kind: 'credit' | 'sub' | 'balance' | 'self' }[] = [
    { path: '/v1/dashboard/billing/credit_grants', kind: 'credit' },
    { path: '/v1/dashboard/billing/subscription', kind: 'sub' },
    { path: '/v1/balance', kind: 'balance' },
    // new-api / one-api 风格：/api/user/self 返回 quota（USD × 100000）
    { path: '/api/user/self', kind: 'self' },
    { path: '/v1/user/balance', kind: 'balance' },
  ];
  let lastError = '';
  for (const c of candidates) {
    try {
      const url = joinUrl(baseUrl, c.path);
      const { status, body } = await requestJson(url, auth);
      if (status === 401 || status === 403 || status === 404) {
        lastError = `HTTP ${status}`;
        continue;
      }
      if (status >= 200 && status < 300) {
        const parsed = tryParse(body);
        if (!parsed) {
          lastError = '响应非 JSON';
          continue;
        }
        const r = extractBalance(c.kind, parsed);
        if (r) return { ok: true, ...r };
        lastError = '响应中未找到余额字段';
      } else {
        lastError = `HTTP ${status}`;
      }
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  return { ok: false, error: `余额查询失败（${lastError || '未知错误'}），中转站可能未开放余额接口` };
}

export function extractBalance(kind: 'credit' | 'sub' | 'balance' | 'self', obj: Record<string, unknown>): Omit<BalanceResult, 'ok'> | undefined {
  // 兼容 {code:0, data:{...}} 包装（new-api / one-api 中转）
  const data = (obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : obj) as Record<string, unknown>;
  if (kind === 'credit') {
    const granted = num(data.total_granted) ?? num(data.totalGranted);
    const used = num(data.total_used) ?? num(data.totalUsed);
    const available = num(data.total_available) ?? num(data.totalAvailable);
    if (granted !== undefined || available !== undefined) {
      return {
        balance: available,
        totalGranted: granted,
        totalUsed: used,
        currency: (data.currency as string) || 'USD',
      };
    }
  } else if (kind === 'sub') {
    const limit = num(data.hard_limit_usd) ?? num(data.hardLimitUsd) ?? num(data.system_hard_limit_usd);
    if (limit !== undefined) {
      return { hardLimit: limit, currency: 'USD' };
    }
    // 部分中转返回 {plan:{...}} 或 {is_subscribed}
    const plan = data.plan && typeof data.plan === 'object' ? (data.plan as Record<string, unknown>) : undefined;
    const planLimit = plan ? num(plan.hard_limit_usd) : undefined;
    if (planLimit !== undefined) return { hardLimit: planLimit, currency: 'USD' };
  } else if (kind === 'self') {
    // new-api / one-api：/api/user/self 返回 quota / used_quota（USD × 100000）
    const quota = num(data.quota);
    if (quota !== undefined) {
      return {
        balance: quota / 100000,
        totalUsed: (num(data.used_quota) ?? 0) / 100000,
        currency: 'USD',
      };
    }
  } else {
    // /v1/balance：new-api 返回 {balance} 或 {code:0, data:{balance, currency}}
    const balance = num(data.balance) ?? num(data.credit) ?? num(data.available_credit);
    if (balance !== undefined) {
      return { balance, currency: (data.currency as string) || 'USD' };
    }
  }
  return undefined;
}
