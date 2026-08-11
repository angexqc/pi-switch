import React from 'react';
import type { Tool } from '../../shared/types';
import { TOOL_COLORS } from '../constants';

/**
 * 各 Agent 品牌图标（参考 cc-switch：品牌色圆形底 + 白色品牌图形）
 * pi      — 终端 ">_"
 * claude  — Anthropic 八角星
 * codex   — OpenAI 六芒星
 * opencode — 菱形
 */
const PATHS: Record<Tool, React.ReactNode> = {
  pi: (
    <>
      <path
        d="M6.2 6.2 L12.8 12 L6.2 17.8"
        stroke="currentColor"
        strokeWidth="2.7"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.6 17.6 H18.4" stroke="currentColor" strokeWidth="2.7" fill="none" strokeLinecap="round" />
    </>
  ),
  claude: <path d="M12 2.4 L13.6 8.4 L19.6 12 L13.6 15.6 L12 21.6 L10.4 15.6 L4.4 12 L10.4 8.4 Z" fill="currentColor" />,
  codex: (
    <>
      <path d="M12 2.6 L21 17.4 H3 Z" fill="currentColor" />
      <path d="M12 21.4 L3 6.6 H21 Z" fill="currentColor" />
    </>
  ),
  opencode: (
    <>
      <path d="M12 3 L18.8 12 L12 21 L5.2 12 Z" fill="currentColor" />
      <path d="M12 8.2 L14.2 12 L12 15.8 L9.8 12 Z" fill="var(--ps-bg, #fff)" opacity="0.9" />
    </>
  ),
};

export function ToolIcon({ tool, size = 18, dim = false }: { tool: Tool; size?: number; dim?: boolean }) {
  const bg = dim ? '#56616b' : TOOL_COLORS[tool];
  return (
    <span
      className="tool-icon"
      style={{ width: size, height: size, background: bg }}
      aria-label={tool}
    >
      <svg viewBox="0 0 24 24" width={size * 0.64} height={size * 0.64} style={{ color: dim ? '#a8b2ba' : '#fff' }}>
        {PATHS[tool]}
      </svg>
    </span>
  );
}
