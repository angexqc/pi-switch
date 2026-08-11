import { describe, expect, it } from 'vitest';
import {
  createSSEState,
  feedSSE,
  finalizeSSE,
  parseAnthropicUsage,
  parseOpenAIChatUsage,
  parseOpenAIResponsesUsage,
} from '../electron/proxy/usage-parser';
import { computeCost, pricingFor } from '../electron/proxy/pricing';
import type { Provider } from '../shared/types';

describe('usage-parser', () => {
  it('解析 OpenAI Chat usage（含缓存）', () => {
    const u = parseOpenAIChatUsage({
      model: 'gpt-5.4',
      usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 600 } },
    });
    expect(u).toEqual({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 600, cacheWriteTokens: 0, model: 'gpt-5.4' });
  });

  it('解析 OpenAI Responses usage（含推理 token）', () => {
    const u = parseOpenAIResponsesUsage({
      model: 'gpt-5.6-sol',
      usage: {
        input_tokens: 500,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 100 },
        output_tokens_details: { reasoning_tokens: 50 },
      },
    });
    expect(u).toEqual({ inputTokens: 500, outputTokens: 150, cacheReadTokens: 100, cacheWriteTokens: 0, model: 'gpt-5.6-sol' });
  });

  it('解析 Anthropic usage（含缓存读写）', () => {
    const u = parseAnthropicUsage({
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: 800, output_tokens: 120, cache_creation_input_tokens: 300, cache_read_input_tokens: 200 },
    });
    expect(u).toEqual({ inputTokens: 800, outputTokens: 120, cacheReadTokens: 200, cacheWriteTokens: 300, model: 'claude-sonnet-4-5' });
  });

  it('无 usage 时返回 undefined', () => {
    expect(parseOpenAIChatUsage({ model: 'x' })).toBeUndefined();
  });

  it('SSE：Anthropic message_start + message_delta 聚合', () => {
    const state = createSSEState('anthropic-messages');
    feedSSE(state, 'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-opus-4-6","usage":{"input_tokens":100,"cache_creation_input_tokens":40,"cache_read_input_tokens":50}}}\n\n');
    feedSSE(state, 'data: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n');
    feedSSE(state, 'data: {"type":"message_delta","usage":{"output_tokens":30}}\n\n');
    const u = finalizeSSE(state);
    expect(u).toEqual({ inputTokens: 100, outputTokens: 30, cacheReadTokens: 50, cacheWriteTokens: 40, model: 'claude-opus-4-6' });
  });

  it('SSE：OpenAI 流式末块 usage', () => {
    const state = createSSEState('openai-completions');
    feedSSE(state, 'data: {"id":"1","choices":[{"delta":{"content":"a"}}]}\n\n');
    feedSSE(state, 'data: {"id":"1","model":"gpt-5.2","choices":[],"usage":{"prompt_tokens":50,"completion_tokens":10,"prompt_tokens_details":{"cached_tokens":5}}}\n\n');
    feedSSE(state, 'data: [DONE]\n\n');
    const u = finalizeSSE(state);
    expect(u).toEqual({ inputTokens: 50, outputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 0, model: 'gpt-5.2' });
  });

  it('SSE 无 usage 时 undefined', () => {
    const state = createSSEState('openai-completions');
    feedSSE(state, 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n');
    expect(finalizeSSE(state)).toBeUndefined();
  });
});

describe('pricing', () => {
  it('按模型前缀匹配价格', () => {
    expect(pricingFor('deepseek-v4-flash').input).toBeGreaterThan(0);
    expect(pricingFor('claude-opus-4-8').input).toBe(15);
    expect(pricingFor('unknown-model-x').input).toBe(0);
  });

  it('computeCost 使用库内模型价格', () => {
    const provider: Provider = {
      id: 'x',
      name: 'X',
      api: 'openai-completions',
      baseUrl: 'https://x',
      models: [],
    };
    const model = { id: 'm', name: 'M', priceInput: 1, priceOutput: 2, priceCacheRead: 0.1, priceCacheWrite: 1.25 };
    const cost = computeCost(provider, model, { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(cost).toBe(2); // 1M*1 + 0.5M*2 = $2
  });

  it('computeCost 处理缓存 token 不重复计费', () => {
    const cost = computeCost(undefined, undefined, { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 400, cacheWriteTokens: 300 });
    // 价格表为 0 → 0 费用
    expect(cost).toBe(0);
  });
});
