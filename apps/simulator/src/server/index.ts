import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { assertSeed2026Blueprint, seed2026Blueprint } from '@seed/ecosystem-seed-2026';
import { SimulationRuntime } from '@seed/kernel';
import type { BrowserNavigationResponse, VirtualHttpResponse } from '@seed/protocol';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '../../../..');
try { process.loadEnvFile(path.join(workspaceRoot, '.env')); } catch { /* no .env — model + real egress features degrade gracefully */ }
assertSeed2026Blueprint();
const runtime = new SimulationRuntime({ topology: seed2026Blueprint, stateRoot: path.join(workspaceRoot, '.state'), runId: process.env.SEED_RUN_ID });
await runtime.initialize();

interface StoredBrowserDocument {
  computerId: string;
  url: string;
  createdAt: number;
  response: VirtualHttpResponse;
  real: boolean;
}

function isRealHost(target: string): boolean {
  try {
    const host = new URL(target.includes('://') ? target : `http://${target}`).hostname.toLowerCase();
    if (!host) return false;
    return !host.endsWith('.seed.local') && !host.endsWith('.local') && host !== 'localhost' && !host.startsWith('127.') && !host.startsWith('10.42.');
  } catch { return false; }
}

// Real internet pages load their own subresources; virtual pages stay fully locked down.
const realBrowserPolicy = [
  "default-src 'self' https: http: data: blob:",
  "img-src https: http: data: blob:",
  "style-src 'unsafe-inline' https: http:",
  "font-src https: http: data:",
  "script-src 'unsafe-inline' 'unsafe-eval' https: http: blob:",
  "connect-src https: http: data: blob:",
  "media-src https: http: data: blob:",
  "frame-src https: http:",
  'base-uri *',
  "form-action https: http:",
  "frame-ancestors 'self'",
].join('; ');

function injectBaseHref(html: string, documentUrl: string): string {
  const tag = `<base href="${documentUrl.replace(/"/g, '&quot;')}">`;
  if (/<base\b/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  return `${tag}${html}`;
}

const browserDocuments = new Map<string, StoredBrowserDocument>();
const browserDocumentTtlMs = 5 * 60_000;
const blockedVirtualDocumentHeaders = new Set([
  'connection', 'content-disposition', 'content-encoding', 'content-length', 'keep-alive', 'link', 'location', 'nel',
  'proxy-authenticate', 'proxy-authorization', 'refresh', 'report-to', 'reporting-endpoints', 'set-cookie', 'set-cookie2',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);
const browserIsolationPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "navigate-to 'none'",
].join('; ');

function pruneBrowserDocuments(now = Date.now()): void {
  for (const [id, document] of browserDocuments) if (now - document.createdAt > browserDocumentTtlMs) browserDocuments.delete(id);
  while (browserDocuments.size > 128) browserDocuments.delete(browserDocuments.keys().next().value!);
}

function browserDocumentHeaders(document: StoredBrowserDocument): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  let virtualPolicy: string | undefined;
  for (const [name, value] of Object.entries(document.response.headers)) {
    const normalized = name.toLowerCase();
    if (normalized === 'content-security-policy') { virtualPolicy = value; continue; }
    // Real pages arrive framed/CSP-locked by their origin; we replace both so they render inside the virtual browser.
    if (document.real && (normalized === 'x-frame-options' || normalized === 'content-security-policy-report-only')) continue;
    if (!blockedVirtualDocumentHeaders.has(normalized)) headers[normalized] = value;
  }
  headers['content-type'] ??= 'text/html; charset=utf-8';
  headers['cache-control'] = 'no-store';
  // A comma-combined CSP field is interpreted as multiple policies; Chromium
  // enforces both the virtual server policy and the simulator isolation policy.
  headers['content-security-policy'] = document.real ? realBrowserPolicy : (virtualPolicy ? `${virtualPolicy}, ${browserIsolationPolicy}` : browserIsolationPolicy);
  if (!document.real) headers['cross-origin-resource-policy'] = 'same-origin';
  headers['referrer-policy'] = 'no-referrer';
  headers['x-seed-virtual-url'] = document.url;
  headers['x-seed-virtual-trace-id'] = document.response.traceId;
  return headers;
}

const sockets = new Set<import('ws').WebSocket>();
const broadcast = () => {
  const message = JSON.stringify({ type: 'snapshot', payload: runtime.snapshot() });
  for (const socket of sockets) if (socket.readyState === socket.OPEN) socket.send(message);
};

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function api(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://seed.local');
  if (!url.pathname.startsWith('/api/')) return false;
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') { json(res, 200, { ok: true, runId: runtime.runId, computers: runtime.snapshot().computers.length }); return true; }
    if (req.method === 'GET' && url.pathname === '/api/state') { json(res, 200, runtime.snapshot()); return true; }
    if (req.method === 'GET' && url.pathname === '/api/trajectory') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson', 'content-disposition': `attachment; filename="${runtime.runId}.jsonl"` });
      res.end(runtime.trajectory.jsonl()); return true;
    }
    const browserDocumentMatch = url.pathname.match(/^\/api\/browser\/documents\/([0-9a-f-]+)$/);
    if (browserDocumentMatch && req.method === 'GET') {
      pruneBrowserDocuments();
      const document = browserDocuments.get(browserDocumentMatch[1]!);
      if (!document) { res.writeHead(410, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end('virtual browser document expired'); return true; }
      res.writeHead(document.response.status, browserDocumentHeaders(document));
      res.end(document.real ? injectBaseHref(document.response.body, document.url) : document.response.body);
      return true;
    }
    const shellMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/shell$/);
    if (shellMatch && req.method === 'POST') { const input = await body(req); const result = await runtime.execute(shellMatch[1]!, String(input.command ?? '')); json(res, 200, { ...result, prompt: runtime.getPrompt(shellMatch[1]!) }); broadcast(); return true; }
    const promptMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/prompt$/);
    if (promptMatch && req.method === 'GET') { json(res, 200, { prompt: runtime.getPrompt(promptMatch[1]!) }); return true; }
    const filesMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/files$/);
    if (filesMatch && req.method === 'GET') { json(res, 200, runtime.listFiles(filesMatch[1]!, url.searchParams.get('path') ?? undefined)); return true; }
    const processMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/processes\/(\d+)$/);
    if (processMatch && req.method === 'DELETE') { json(res, 200, runtime.terminateProcess(processMatch[1]!, Number(processMatch[2]))); broadcast(); return true; }
    const gatewayMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/gateways\/([^/]+)$/);
    if (gatewayMatch && (req.method === 'PATCH' || req.method === 'PUT')) {
      const input = await body(req);
      json(res, 200, runtime.setGatewayEnabled(gatewayMatch[1]!, gatewayMatch[2]!, Boolean(input.enabled)));
      broadcast(); return true;
    }
    const installMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/apps\/([^/]+)\/install$/);
    if (installMatch && req.method === 'POST') { json(res, 200, await runtime.installApp(installMatch[1]!, installMatch[2]!)); broadcast(); return true; }
    const executeAppMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/apps\/([^/]+)\/execute$/);
    if (executeAppMatch && req.method === 'POST') {
      const input = await body(req);
      json(res, 200, await runtime.launchApp(executeAppMatch[1]!, executeAppMatch[2]!, { operation: String(input.operation ?? 'open'), payload: (input.payload as Record<string, unknown>) ?? {} }));
      broadcast(); return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/computers') {
      const input = await body(req);
      const os = String(input.os ?? '');
      if (os !== 'macos' && os !== 'windows' && os !== 'ubuntu') { json(res, 400, { error: 'os must be macos, windows, or ubuntu' }); return true; }
      const spec = await runtime.spawnComputer({ os, hostname: input.hostname ? String(input.hostname) : undefined });
      json(res, 201, spec); broadcast(); return true;
    }
    const uninstallMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/apps\/([^/]+)$/);
    if (uninstallMatch && req.method === 'DELETE') { await runtime.uninstallApp(uninstallMatch[1]!, uninstallMatch[2]!); json(res, 200, { ok: true }); broadcast(); return true; }
    const browserNavigationMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/browser\/navigate$/);
    if (browserNavigationMatch && req.method === 'POST') {
      const input = await body(req);
      const target = String(input.url ?? '');
      const response = await runtime.http(browserNavigationMatch[1]!, target);
      pruneBrowserDocuments();
      const id = randomUUID();
      browserDocuments.set(id, { computerId: browserNavigationMatch[1]!, url: target, response, createdAt: Date.now(), real: isRealHost(target) });
      const navigation: BrowserNavigationResponse = { url: target, documentUrl: `/api/browser/documents/${id}`, status: response.status, headers: response.headers, traceId: response.traceId };
      json(res, 200, navigation); broadcast(); return true;
    }
    const httpMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/http$/);
    if (httpMatch && req.method === 'POST') { const input = await body(req); json(res, 200, await runtime.http(httpMatch[1]!, String(input.url ?? ''))); broadcast(); return true; }
    const fileMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/file$/);
    if (fileMatch && req.method === 'GET') {
      try { json(res, 200, await runtime.readTextFile(fileMatch[1]!, url.searchParams.get('path') ?? '')); }
      catch (error) { json(res, 404, { error: (error as Error).message }); }
      return true;
    }
    if (fileMatch && req.method === 'PUT') {
      const input = await body(req);
      try { json(res, 200, await runtime.writeTextFile(fileMatch[1]!, String(input.path ?? ''), String(input.content ?? ''))); broadcast(); }
      catch (error) { json(res, 400, { error: (error as Error).message }); }
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const input = await body(req);
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) { json(res, 503, { error: 'no ANTHROPIC_API_KEY configured in .env' }); return true; }
      const messages = Array.isArray(input.messages) && input.messages.length ? input.messages : [{ role: 'user', content: String(input.prompt ?? '') }];
      try {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: String(input.model ?? 'claude-haiku-4-5-20251001'), max_tokens: 1024, system: String(input.system ?? 'You are ChatGPT running inside the Seed virtual computer ecosystem, a browser-rendered simulation of macOS, Windows, and Ubuntu machines on a virtual network. Be concise and helpful.'), messages }),
        });
        const data = await upstream.json() as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: unknown; error?: { message?: string } };
        if (!upstream.ok) { json(res, upstream.status, { error: data?.error?.message ?? 'model request failed' }); return true; }
        const text = (data.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n');
        json(res, 200, { text, model: data.model, usage: data.usage });
      } catch (error) { json(res, 502, { error: (error as Error).message }); }
      return true;
    }
    const collabMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/collaboration\/(slack|teams)\/([^/]+)$/);
    if (collabMatch && req.method === 'GET') {
      json(res, 200, await runtime.pollCollaboration(collabMatch[1]!, collabMatch[2] as 'slack' | 'teams', collabMatch[3]!, Number(url.searchParams.get('after') ?? 0)));
      return true;
    }
    if (collabMatch && req.method === 'POST') {
      const input = await body(req);
      const message = await runtime.postCollaborationMessage(collabMatch[1]!, collabMatch[2] as 'slack' | 'teams', collabMatch[3]!, String(input.author ?? 'agent'), String(input.text ?? ''));
      json(res, 200, message); broadcast(); return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const input = await body(req);
      const event = runtime.record({ computerId: input.computerId ? String(input.computerId) : undefined, displayId: input.displayId ? String(input.displayId) : undefined, actor: input.actor === 'agent' ? 'agent' : 'human', kind: (input.kind as 'pointer') ?? 'pointer', action: String(input.action ?? 'ui.action'), target: input.target ? String(input.target) : undefined, data: (input.data as Record<string, unknown>) ?? undefined });
      json(res, 200, event); broadcast(); return true;
    }
    json(res, 404, { error: 'api route not found' }); return true;
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : String(error) }); return true;
  }
}

const production = process.env.NODE_ENV === 'production';
const clientDist = path.join(workspaceRoot, 'apps/simulator/dist/client');
let vite: Awaited<ReturnType<typeof import('vite').createServer>> | undefined;
if (!production) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ root: path.join(workspaceRoot, 'apps/simulator'), server: { middlewareMode: true }, appType: 'spa' });
}

const server = createServer(async (req, res) => {
  if (await api(req, res)) return;
  if (vite) { vite.middlewares(req, res, () => { res.writeHead(404); res.end('not found'); }); return; }
  const url = new URL(req.url ?? '/', 'http://seed.local');
  const candidate = path.join(clientDist, url.pathname === '/' ? 'index.html' : url.pathname);
  try {
    await access(candidate);
    const ext = path.extname(candidate);
    res.writeHead(200, { 'content-type': ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.svg' ? 'image/svg+xml' : 'text/html' });
    createReadStream(candidate).pipe(res);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(await readFile(path.join(clientDist, 'index.html')));
  }
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/events') { socket.destroy(); return; }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});
wss.on('connection', (socket) => { sockets.add(socket); socket.send(JSON.stringify({ type: 'snapshot', payload: runtime.snapshot() })); socket.on('close', () => sockets.delete(socket)); });

const port = Number(process.env.PORT ?? 4317);
server.listen(port, '127.0.0.1', () => console.log(`seed ecosystem ${runtime.runId} ready at http://127.0.0.1:${port}`));
