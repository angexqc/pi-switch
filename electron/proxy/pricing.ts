import type { Model, Provider } from '../../shared/types';

/** USD / 1M tokens，按模型 id 前缀匹配 */
export const DEFAULT_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // DeepSeek v4 系列（占位默认，可在 UI 修改）
  'deepseek-v4': { input: 0.27, output: 1.1, cacheRead: 0.027, cacheWrite: 0.27 },
  'deepseek-chat': { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0.27 },
  'deepseek-reasoner': { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0.55 },
  // Claude 系列
  'claude-opus': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  // GPT-5.x 系列
  'gpt-5': { input: 1.25, output: 10, cacheRead: 0.625, cacheWrite: 1.25 },
  'gpt-5-mini': { input: 0.25, output: 2, cacheRead: 0.125, cacheWrite: 0.25 },
  'gpt-5.1': { input: 1.25, output: 10, cacheRead: 0.625, cacheWrite: 1.25 },
  'gpt-5.2': { input: 1.25, output: 10, cacheRead: 0.625, cacheWrite: 1.25 },
  'gpt-5.3': { input: 1.25, output: 10, cacheRead: 0.625, cacheWrite: 1.25 },
  'gpt-5.4': { input: 1.25, output: 10, cacheRead: 0.625, cacheWrite: 1.25 },
  'gpt-5.5': { input: 1.25, output: 10, cacheRead: 0.625, cacheWrite: 1.25 },
  'gpt-5.6': { input: 1.25, output: 10, cacheRead: 0.625, cacheWrite: 1.25 },
  'codex-mini': { input: 0.25, output: 2, cacheRead: 0.125, cacheWrite: 0.25 },
  // OpenAI 其它
  'o3': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2.5 },
  'o4': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2.5 },
};

export function pricingFor(modelId: string): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  const keys = Object.keys(DEFAULT_PRICING).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (modelId.startsWith(k)) return DEFAULT_PRICING[k];
  }
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

export interface PriceSet {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * 日志解析用：按 providerId + modelId 从 Agent 供应商库解析价格。
 * 优先级：该 provider 下的模型价格 → 全库同名模型价格 → 内置价格表。
 * 返回 undefined 表示无法定价（不写入 cost，避免与"0 费用"混淆）。
 */
export function resolveModelPrice(
  agentProviders: Provider[] | undefined,
  providerId: string,
  modelId: string
): PriceSet | undefined {
  const usable = (m: Model | undefined): PriceSet | undefined => {
    if (!m) return undefined;
    if ((m.priceInput ?? 0) > 0 || (m.priceOutput ?? 0) > 0) {
      return {
        input: m.priceInput ?? 0,
        output: m.priceOutput ?? 0,
        cacheRead: m.priceCacheRead ?? 0,
        cacheWrite: m.priceCacheWrite ?? 0,
      };
    }
    return undefined;
  };
  if (agentProviders?.length) {
    const byProvider = agentProviders.find((p) => p.id === providerId);
    const direct = usable(byProvider?.models.find((x) => x.id === modelId));
    if (direct) return direct;
    for (const p of agentProviders) {
      const hit = usable(p.models.find((x) => x.id === modelId));
      if (hit) return hit;
    }
  }
  const fallback = pricingFor(modelId);
  return fallback.input > 0 || fallback.output > 0 ? fallback : undefined;
}
export interface CostInput {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
/** 按价格集计算费用（USD）。计费输入 = input - cacheRead - cacheWrite */
export function costFromPrices(prices: PriceSet, usage: CostInput): number {
  const baseInput = Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);
  return (
    (baseInput * prices.input +
      usage.cacheReadTokens * prices.cacheRead +
      usage.cacheWriteTokens * prices.cacheWrite +
      usage.outputTokens * prices.output) /
    1_000_000
  );
}

/** 计算费用。优先使用库内模型价格，其次内置价格表 */
export function computeCost(provider: Provider | undefined, model: Model | undefined, usage: CostInput): number {
  const base = model
    ? {
        input: model.priceInput ?? 0,
        output: model.priceOutput ?? 0,
        cacheRead: model.priceCacheRead ?? 0,
        cacheWrite: model.priceCacheWrite ?? 0,
      }
    : undefined;
  const prices = base && (base.input > 0 || base.output > 0) ? base : pricingFor(model?.id || provider?.models?.[0]?.id || '');
  const baseInput = Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);
  return (
    (baseInput * prices.input +
      usage.cacheReadTokens * prices.cacheRead +
      usage.cacheWriteTokens * prices.cacheWrite +
      usage.outputTokens * prices.output) /
    1_000_000
  );
}
