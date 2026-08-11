import type { AppConfig, Provider, Tool } from '../shared/types';

export const TOOLS: Tool[] = ['pi', 'codex', 'claude', 'opencode'];

export const TOOL_LABELS: Record<Tool, string> = {
  pi: 'Pi Agent',
  codex: 'Codex',
  claude: 'Claude Code',
  opencode: 'opencode',
};

export const TOOL_ICONS: Record<Tool, string> = {
  pi: '>_',
  codex: '✦',
  claude: '✳',
  opencode: '◆',
};

/** 各 Agent 的主题色（用于标签/状态/图表点缀） */
export const TOOL_COLORS: Record<Tool, string> = {
  pi: '#35d0ba',
  codex: '#f5b942',
  claude: '#ff8a5c',
  opencode: '#5b9dff',
};

export const API_LABELS: Record<string, string> = {
  'anthropic-messages': 'Anthropic Messages',
  'openai-completions': 'OpenAI Chat Completions',
  'openai-responses': 'OpenAI Responses',
};
export const CODE_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'ultra', 'max'];

export const SOURCE_LABELS: Record<string, string> = {
  proxy: '本地代理',
  'pi-log': 'Pi 会话日志',
  'claude-log': 'Claude 会话转录',
  'codex-log': 'Codex 日志',
  'opencode-log': 'opencode 数据库',
};

export const STATUS_LABELS: Record<string, string> = {
  ok: '正常',
  'no-usage': '无用量数据',
  error: '错误',
};

export function maskKey(key?: string): string {
  if (!key) return '(未设置)';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function fmtUsd(n?: number): string {
  if (n === undefined || n === null) return '-';
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** cc-switch 风格：供应商品牌色（图标圆标） */
const BRAND_COLORS: Record<string, string> = {
  deepseek: '#4D6BFE',
  anthropic: '#D97757',
  claude: '#D97757',
  openai: '#10A37F',
  gpt: '#10A37F',
  codex: '#111827',
  gemini: '#4285F4',
  google: '#4285F4',
  qwen: '#615CED',
  moonshot: '#2A6CF6',
  kimi: '#2A6CF6',
  glm: '#3B7CFF',
  zhipu: '#3B7CFF',
  groq: '#F55036',
  mistral: '#FF7000',
  llama: '#0F8FF8',
  meta: '#0F8FF8',
  minimax: '#2E6BE6',
  stepfun: '#3D5AFE',
  volcengine: '#0077FF',
  ark: '#0077FF',
  silicon: '#4D6BFE',
  siliconflow: '#4D6BFE',
  openrouter: '#7C3AED',
  oneapi: '#F59E0B',
  newapi: '#10B981',
  apex: '#F97316',
  gptcodex: '#0EA5E9',
};

export function providerColor(p: { id: string; name: string }): string {
  const k = `${p.id} ${p.name}`.toLowerCase();
  for (const [key, c] of Object.entries(BRAND_COLORS)) {
    if (k.includes(key)) return c;
  }
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 52%)`;
}

export function providerById(cfg: AppConfig, tool: Tool, id: string) {
  return cfg.agents[tool].providers.find((p) => p.id === id);
}

export function modelLabel(cfg: AppConfig, tool: Tool, providerId: string, modelId: string): string {
  const p = providerById(cfg, tool, providerId);
  const m = p?.models.find((x) => x.id === modelId);
  return m?.name || m?.id || modelId || '(未绑定)';
}

/** 知名供应商预设（新增供应商弹窗一键填充，参考 cc-switch） */
export interface KnownProviderPreset {
  name: string;
  id: string;
  api: Provider['api'];
  baseUrl: string;
  color: string;
  models: { id: string; name: string; reasoning?: boolean }[];
}

export const KNOWN_PROVIDERS: KnownProviderPreset[] = [
  {
    name: 'DeepSeek', id: 'deepseek', api: 'openai-completions', baseUrl: 'https://api.deepseek.com/v1', color: '#4D6BFE',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', reasoning: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', reasoning: true },
    ],
  },
  {
    name: 'Anthropic', id: 'anthropic', api: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', color: '#D97757',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', reasoning: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', reasoning: true },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', reasoning: false },
    ],
  },
  {
    name: 'OpenAI', id: 'openai', api: 'openai-responses', baseUrl: 'https://api.openai.com/v1', color: '#10A37F',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', reasoning: true },
      { id: 'gpt-5.2', name: 'GPT-5.2', reasoning: true },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', reasoning: false },
    ],
  },
  {
    name: 'Google Gemini', id: 'gemini', api: 'openai-completions', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', color: '#4285F4',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', reasoning: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', reasoning: false },
    ],
  },
  {
    name: 'Moonshot Kimi', id: 'kimi', api: 'openai-completions', baseUrl: 'https://api.moonshot.cn/v1', color: '#5B8DEF',
    models: [
      { id: 'kimi-k2', name: 'Kimi K2', reasoning: true },
      { id: 'moonshot-v1-32k', name: 'Moonshot V1 32K', reasoning: false },
    ],
  },
  {
    name: 'Zhipu GLM', id: 'zhipu', api: 'openai-completions', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', color: '#3859FF',
    models: [
      { id: 'glm-4.5', name: 'GLM-4.5', reasoning: true },
      { id: 'glm-4.5-air', name: 'GLM-4.5 Air', reasoning: false },
    ],
  },
  {
    name: 'Alibaba Qwen', id: 'qwen', api: 'openai-completions', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', color: '#7C3AED',
    models: [
      { id: 'qwen-max', name: 'Qwen Max', reasoning: true },
      { id: 'qwen-plus', name: 'Qwen Plus', reasoning: false },
      { id: 'qwen-turbo', name: 'Qwen Turbo', reasoning: false },
    ],
  },
  {
    name: 'Mistral', id: 'mistral', api: 'openai-completions', baseUrl: 'https://api.mistral.ai/v1', color: '#F7A600',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', reasoning: true },
      { id: 'mistral-small-latest', name: 'Mistral Small', reasoning: false },
    ],
  },
  {
    name: 'Groq', id: 'groq', api: 'openai-completions', baseUrl: 'https://api.groq.com/openai/v1', color: '#F55036',
    models: [{ id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', reasoning: false }],
  },
  {
    name: 'xAI Grok', id: 'xai', api: 'openai-completions', baseUrl: 'https://api.x.ai/v1', color: '#A855F7',
    models: [{ id: 'grok-4', name: 'Grok 4', reasoning: true }],
  },
];
