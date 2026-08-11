import { describe, it, expect } from 'vitest';
import { extractBalance } from '../electron/services/balance';

describe('balance extractBalance', () => {
  it('解析 OpenAI credit_grants（含 data 包装）', () => {
    const r = extractBalance('credit', {
      data: { total_granted: 100, total_used: 12.5, total_available: 87.5, currency: 'CNY' },
    });
    expect(r?.balance).toBe(87.5);
    expect(r?.totalGranted).toBe(100);
    expect(r?.totalUsed).toBe(12.5);
    expect(r?.currency).toBe('CNY');
  });

  it('解析 subscription hard_limit_usd', () => {
    const r = extractBalance('sub', { hard_limit_usd: 5, system_hard_limit_usd: 20 });
    expect(r?.hardLimit).toBe(5);
  });

  it('解析 subscription 内层 plan', () => {
    const r = extractBalance('sub', { plan: { hard_limit_usd: '10.5' } });
    expect(r?.hardLimit).toBe(10.5);
  });

  it('解析 /v1/balance 的 balance 字段（字符串数字）', () => {
    const r = extractBalance('balance', { balance: '3.25', currency: 'USD' });
    expect(r?.balance).toBe(3.25);
  });

  it('解析 new-api /api/user/self quota（USD × 100000）', () => {
    const r = extractBalance('self', { success: true, data: { id: 1, quota: 250000, used_quota: 50000 } });
    expect(r?.balance).toBe(2.5);
    expect(r?.totalUsed).toBe(0.5);
  });

  it('无法识别的响应返回 undefined', () => {
    expect(extractBalance('balance', { hello: 'world' })).toBeUndefined();
    expect(extractBalance('sub', { error: 'no plan' })).toBeUndefined();
  });
});
