import http from 'node:http';
import type { Tool } from '../../shared/types';
import type { InsertRecord } from '../stats/db';
import { computeCost } from './pricing';
import { createSSEState, feedSSE, finalizeSSE, parseUsageByApi, type ParsedUsage } from './usage-parser';
import { TOOL_LABELS } from '../constants';

export interface ProxyBinding {
  tool: Tool;
  providerId: string;
  modelId: string;
  api: 'anthropic-messages' | 'openai-completions' | 'openai-responses';
  upstreamBaseUrl: string;
  model?: { priceInput?: number; priceOutput?: number; priceCacheRead?: number; priceCacheWrite?: number };
}

export interface ProxyManagerOptions {
  resolveBinding: (tool: Tool) => ProxyBinding | undefined;
  onUsage: (record: InsertRecord) => void;
}

function normalizeTarget(upstreamBaseUrl: string, pathname: string, search: string): string {
  let base = upstreamBaseUrl.replace(/\/+$/, '');
  let p = pathname;
  // 若上游 baseUrl 已含 /v1 且请求路径也以 /v1 开头，去掉一个
  if (base.endsWith('/v1') && (p === '/v1' || p.startsWith('/v1/'))) {
    p = p.slice(3) || '/';
  }
  return `${base}${p}${search}`;
}

export class ProxyManager {
  private servers = new Map<Tool, http.Server>();
  private opts: ProxyManagerOptions;

  constructor(opts: ProxyManagerOptions) {
    this.opts = opts;
  }

  isRunning(tool: Tool): boolean {
    return this.servers.has(tool);
  }

  start(tool: Tool, port: number): Promise<void> {
    if (this.servers.has(tool)) return Promise.resolve();
    const server = http.createServer((req, res) => this.handle(req, res, tool));
    return new Promise((resolve, reject) => {
      server.once('error', (e) => reject(e));
      server.listen(port, '127.0.0.1', () => {
        this.servers.set(tool, server);
        resolve();
      });
    });
  }

  stop(tool: Tool): Promise<void> {
    const server = this.servers.get(tool);
    if (!server) return Promise.resolve();
    this.servers.delete(tool);
    return new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  stopAll(): Promise<void[]> {
    return Promise.all([...this.servers.keys()].map((t) => this.stop(t)));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse, tool: Tool): void {
    const binding = this.opts.resolveBinding(tool);
    if (!binding) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `PiSwitch: ${TOOL_LABELS[tool]} 未绑定有效供应商` }));
      return;
    }
    const target = normalizeTarget(binding.upstreamBaseUrl, req.url?.split('?')[0] || '/', req.url?.includes('?') ? `?${req.url.split('?')[1]}` : '');
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];

    const outbound = http.request(target, {
      method: req.method,
      headers,
    }, (upRes) => {
      const contentType = String(upRes.headers['content-type'] || '');
      const isSSE = contentType.includes('text/event-stream');

      res.writeHead(upRes.statusCode || 502, upRes.headers);

      if (isSSE) {
        const state = createSSEState(binding.api);
        upRes.on('data', (chunk: Buffer) => {
          feedSSE(state, chunk);
          res.write(chunk);
        });
        upRes.on('end', () => {
          res.end();
          this.record(tool, binding, finalizeSSE(state), upRes.statusCode || 200);
        });
        upRes.on('error', () => {
          res.end();
          this.record(tool, binding, undefined, 502);
        });
      } else {
        const chunks: Buffer[] = [];
        upRes.on('data', (c: Buffer) => chunks.push(c));
        upRes.on('end', () => {
          const body = Buffer.concat(chunks);
          res.end(body);
          let usage: ParsedUsage | undefined;
          try {
            const json = JSON.parse(body.toString('utf8'));
            usage = parseUsageByApi(binding.api, json as Record<string, unknown>);
          } catch {
            usage = undefined;
          }
          this.record(tool, binding, usage, upRes.statusCode || 200);
        });
        upRes.on('error', () => {
          res.end();
          this.record(tool, binding, undefined, 502);
        });
      }
    });

    outbound.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `PiSwitch: 上游转发失败 ${e.message}` }));
      this.record(tool, binding, undefined, 502);
    });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(outbound);
    } else {
      outbound.end();
    }
  }

  private record(tool: Tool, binding: ProxyBinding, usage: ParsedUsage | undefined, statusCode: number): void {
    const ts = Date.now();
    const ok = statusCode >= 200 && statusCode < 300;
    if (!usage) {
      this.opts.onUsage({
        ts,
        source: 'proxy',
        tool,
        providerId: binding.providerId,
        model: binding.modelId,
        endpoint: 'request',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        status: ok ? 'no-usage' : 'error',
        dedupKey: `proxy:${ts}:${Math.random().toString(36).slice(2, 10)}`,
      });
      return;
    }
    const cost = computeCost(
      binding as never,
      binding.model as never,
      usage
    );
    this.opts.onUsage({
      ts,
      source: 'proxy',
      tool,
      providerId: binding.providerId,
      model: usage.model || binding.modelId,
      endpoint: 'request',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costUsd: cost,
      status: ok ? 'ok' : 'error',
      dedupKey: `proxy:${ts}:${Math.random().toString(36).slice(2, 10)}`,
    });
  }
}
