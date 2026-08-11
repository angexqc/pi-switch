import http from 'node:http';
import https from 'node:https';
import type { Agents, Provider } from '../../shared/types';
import { resolveApiKey } from '../switch-engine/writers';
/**
 * 测试供应商连通性：对 baseUrl 发一个最小请求
 * - anthropic-messages: POST /v1/messages
 * - openai 系: GET /models
 */
export function testProviderConnection(
  provider: Provider,
  agents: Agents
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  return new Promise((resolve) => {
    const { value: key } = resolveApiKey(provider);
    const isAnthropic = provider.api === 'anthropic-messages';
    const base = provider.baseUrl.replace(/\/+$/, '');
    let url: string;
    let method = 'GET';
    let body: string | undefined;
    if (isAnthropic) {
      url = `${base}/v1/messages`;
      method = 'POST';
      body = JSON.stringify({ model: provider.models[0]?.id || 'claude-sonnet-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
    } else {
      url = `${base}/models`;
    }
    const headers: Record<string, string> = { ...(provider.headers || {}) };
    if (key) {
      if (isAnthropic) headers['x-api-key'] = key;
      else headers['Authorization'] = `Bearer ${key}`;
    } else {
      headers['Authorization'] = 'Bearer test';
    }
    if (body) headers['content-type'] = 'application/json';
    if (body) headers['content-length'] = String(Buffer.byteLength(body));

    const lib = url.startsWith('https') ? https : http;
    const started = Date.now();
    const req = lib.request(url, { method, headers, timeout: 15000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const latencyMs = Date.now() - started;
        const text = Buffer.concat(chunks).toString('utf8').slice(0, 300);
        if (res.statusCode && res.statusCode < 300) {
          resolve({ ok: true, message: `连通正常（${res.statusCode}，${latencyMs}ms）`, latencyMs });
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          resolve({ ok: false, message: `鉴权失败（${res.statusCode}）：请检查 API Key`, latencyMs });
        } else if (res.statusCode === 404 && !isAnthropic) {
          resolve({ ok: true, message: `连通正常（${res.statusCode}，${latencyMs}ms；/models 不存在但网络可达）`, latencyMs });
        } else {
          resolve({ ok: false, message: `请求失败（${res.statusCode}，${latencyMs}ms）: ${text}`, latencyMs });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (e) => {
      resolve({ ok: false, message: `网络错误: ${e.message}`, latencyMs: Date.now() - started });
    });
    if (body) req.write(body);
    req.end();
  });
}
