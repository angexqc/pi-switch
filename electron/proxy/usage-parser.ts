import type { ApiKind } from '../../shared/types';

export interface ParsedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model?: string;
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions
// ---------------------------------------------------------------------------

export function parseOpenAIChatUsage(body: Record<string, unknown>): ParsedUsage | undefined {
  const usage = body.usage as Record<string, unknown> | undefined;
  if (!usage) return undefined;
  const prompt = (usage.prompt_tokens as number) || 0;
  const completion = (usage.completion_tokens as number) || 0;
  const details = (usage.prompt_tokens_details as Record<string, unknown>) || {};
  const cached = (details.cached_tokens as number) || 0;
  return {
    inputTokens: prompt,
    outputTokens: completion,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
    model: body.model as string,
  };
}

// ---------------------------------------------------------------------------
// OpenAI Responses API
// ---------------------------------------------------------------------------

export function parseOpenAIResponsesUsage(body: Record<string, unknown>): ParsedUsage | undefined {
  const usage = body.usage as Record<string, unknown> | undefined;
  if (!usage) return undefined;
  const input = (usage.input_tokens as number) || 0;
  const output = (usage.output_tokens as number) || 0;
  const inputDetails = (usage.input_tokens_details as Record<string, unknown>) || {};
  const outputDetails = (usage.output_tokens_details as Record<string, unknown>) || {};
  return {
    inputTokens: input,
    outputTokens: output + ((outputDetails.reasoning_tokens as number) || 0),
    cacheReadTokens: (inputDetails.cached_tokens as number) || 0,
    cacheWriteTokens: 0,
    model: body.model as string,
  };
}

// ---------------------------------------------------------------------------
// Anthropic Messages
// ---------------------------------------------------------------------------

export function parseAnthropicUsage(body: Record<string, unknown>): ParsedUsage | undefined {
  const usage = body.usage as Record<string, unknown> | undefined;
  if (!usage) return undefined;
  const has = Object.keys(usage).some((k) => typeof usage[k] === 'number' && (usage[k] as number) > 0);
  if (!has) return undefined;
  return {
    inputTokens: (usage.input_tokens as number) || 0,
    outputTokens: (usage.output_tokens as number) || 0,
    cacheReadTokens: (usage.cache_read_input_tokens as number) || 0,
    cacheWriteTokens: (usage.cache_creation_input_tokens as number) || 0,
    model: body.model as string,
  };
}

export function parseUsageByApi(api: ApiKind, body: Record<string, unknown>): ParsedUsage | undefined {
  switch (api) {
    case 'anthropic-messages':
      return parseAnthropicUsage(body);
    case 'openai-responses':
      return parseOpenAIResponsesUsage(body);
    case 'openai-completions':
    default:
      return parseOpenAIChatUsage(body);
  }
}

// ---------------------------------------------------------------------------
// SSE 流式解析
// ---------------------------------------------------------------------------

export interface SSEState {
  api: ApiKind;
  chunks: string[];
  model?: string;
  /** anthropic: message_start usage */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** anthropic: message_delta usage + openai: 末块 usage */
  outputTokens: number;
  sawUsage: boolean;
}

export function createSSEState(api: ApiKind): SSEState {
  return { api, chunks: [], inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, sawUsage: false };
}

/** 从 SSE 文本块中累计用量（需在流结束时调用 finalizeSSE 获得结果） */
export function feedSSE(state: SSEState, chunk: Buffer | string): void {
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  state.chunks.push(text);
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(data);
    } catch {
      continue;
    }
    if (state.api === 'anthropic-messages') {
      // message_start: usage {input_tokens, cache_creation_input_tokens, cache_read_input_tokens}
      if (obj.type === 'message_start') {
        const usage = (obj.message as Record<string, unknown>)?.usage as Record<string, unknown> | undefined;
        if (usage) {
          state.inputTokens = (usage.input_tokens as number) || 0;
          state.cacheReadTokens = (usage.cache_read_input_tokens as number) || 0;
          state.cacheWriteTokens = (usage.cache_creation_input_tokens as number) || 0;
          state.sawUsage = true;
        }
        const msgModel = (obj.message as Record<string, unknown>)?.model as string | undefined;
        if (msgModel) state.model = msgModel;
      } else if (obj.type === 'message_delta') {
        const usage = (obj.usage as Record<string, unknown>) || {};
        if (typeof usage.output_tokens === 'number') {
          state.outputTokens = usage.output_tokens as number;
          state.sawUsage = true;
        }
      }
    } else {
      // openai chat / responses
      const usage = obj.usage as Record<string, unknown> | undefined;
      if (obj.model && !state.model) state.model = obj.model as string;
      if (usage) {
        const prompt = (usage.prompt_tokens as number) || (usage.input_tokens as number) || 0;
        const completion = (usage.completion_tokens as number) || (usage.output_tokens as number) || 0;
        const details = (usage.prompt_tokens_details as Record<string, unknown>) || (usage.input_tokens_details as Record<string, unknown>) || {};
        const cached = (details.cached_tokens as number) || 0;
        state.inputTokens = prompt;
        state.outputTokens = completion;
        state.cacheReadTokens = cached;
        state.sawUsage = true;
      }
    }
  }
}

export function finalizeSSE(state: SSEState): ParsedUsage | undefined {
  if (!state.sawUsage) return undefined;
  return {
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    cacheReadTokens: state.cacheReadTokens,
    cacheWriteTokens: state.cacheWriteTokens,
    model: state.model,
  };
}
