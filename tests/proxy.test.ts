import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { ProxyManager } from '../electron/proxy/server';
import { openDb, closeDb, queryPage, insertRecords } from '../electron/stats/db';

let home: string;
let originalHome: string | undefined;
let upstream: http.Server;

beforeEach(() => {
  originalHome = process.env.PI_SWITCH_HOME;
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'piswitch-proxy-'));
  process.env.PI_SWITCH_HOME = home;
  closeDb();
});

afterEach(async () => {
  closeDb();
  if (originalHome === undefined) delete process.env.PI_SWITCH_HOME;
  else process.env.PI_SWITCH_HOME = originalHome;
  fs.rmSync(home, { recursive: true, force: true });
  await new Promise<void>((r) => upstream?.close(() => r()));
});

async function startUpstream(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<number> {
  upstream = http.createServer(handler);
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
  return (upstream.address() as { port: number }).port;
}

function post(port: number, body: string, pathname = '/v1/chat/completions'): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('ProxyManager 集成', () => {
  it('转发非流式请求并记录 usage 与费用', async () => {
    const port = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'deepseek-v4-flash', usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 300 } } }));
    });

    openDb();
    const manager = new ProxyManager({
      resolveBinding: () => ({
        tool: 'pi',
        providerId: 'deepseek',
        modelId: 'deepseek-v4-flash',
        api: 'openai-completions',
        upstreamBaseUrl: `http://127.0.0.1:${port}`,
        model: { priceInput: 0.27, priceOutput: 1.1, priceCacheRead: 0.027, priceCacheWrite: 0.27 },
      }),
      onUsage: (r) => {
        insertRecords([r]);
      },
    });

    await manager.start('pi', 0);
    // 动态端口：从已监听端口查询
    const actualPort = (manager as unknown as { servers: Map<string, { address: () => { port: number } }> }).servers.get('pi')!.address().port;
    const res = await post(actualPort, '{"messages":[]}');
    expect(res.status).toBe(200);
    expect(res.text).toContain('prompt_tokens');

    await new Promise((r) => setTimeout(r, 100));
    const page = queryPage({ tool: 'pi', limit: 10 });
    expect(page.total).toBe(1);
    const rec = page.records[0];
    expect(rec.source).toBe('proxy');
    expect(rec.inputTokens).toBe(1000);
    expect(rec.outputTokens).toBe(200);
    expect(rec.cacheReadTokens).toBe(300);
    // 费用 = (700*0.27 + 300*0.027 + 200*1.1) / 1e6 = 0.0004171
    expect(rec.costUsd).toBeCloseTo(0.0004171, 6);

    await manager.stopAll();
  });

  it('转发 SSE 流并聚合 usage', async () => {
    const port = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"type":"message_start","message":{"model":"claude-sonnet-4-5","usage":{"input_tokens":50,"cache_read_input_tokens":10}}}\n\n');
      res.write('data: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n');
      res.write('data: {"type":"message_delta","usage":{"output_tokens":8}}\n\n');
      res.end('data: [DONE]\n\n');
    });

    openDb();
    const manager = new ProxyManager({
      resolveBinding: () => ({
        tool: 'claude',
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        api: 'anthropic-messages',
        upstreamBaseUrl: `http://127.0.0.1:${port}`,
      }),
      onUsage: (r) => {
        insertRecords([r]);
      },
    });
    await manager.start('claude', 0);
    const actualPort = (manager as unknown as { servers: Map<string, { address: () => { port: number } }> }).servers.get('claude')!.address().port;
    const res = await post(actualPort, '{"messages":[]}', '/v1/messages');
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 100));
    const page = queryPage({ tool: 'claude', limit: 10 });
    expect(page.total).toBe(1);
    expect(page.records[0].inputTokens).toBe(50);
    expect(page.records[0].outputTokens).toBe(8);
    expect(page.records[0].cacheReadTokens).toBe(10);
    expect(page.records[0].model).toBe('claude-sonnet-4-5');

    await manager.stopAll();
  });

  it('未绑定供应商时返回 502', async () => {
    openDb();
    const manager = new ProxyManager({
      resolveBinding: () => undefined,
      onUsage: () => undefined,
    });
    await manager.start('opencode', 0);
    const actualPort = (manager as unknown as { servers: Map<string, { address: () => { port: number } }> }).servers.get('opencode')!.address().port;
    const res = await post(actualPort, '{}');
    expect(res.status).toBe(502);
    await manager.stopAll();
  });
});
