import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { SimulationRuntime } from '@seed/kernel';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '../../../..');
const runtime = new SimulationRuntime({ stateRoot: path.join(workspaceRoot, '.state'), runId: process.env.SEED_RUN_ID });
await runtime.initialize();

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
    const shellMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/shell$/);
    if (shellMatch && req.method === 'POST') { const input = await body(req); const result = await runtime.execute(shellMatch[1]!, String(input.command ?? '')); json(res, 200, { ...result, prompt: runtime.getPrompt(shellMatch[1]!) }); broadcast(); return true; }
    const promptMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/prompt$/);
    if (promptMatch && req.method === 'GET') { json(res, 200, { prompt: runtime.getPrompt(promptMatch[1]!) }); return true; }
    const filesMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/files$/);
    if (filesMatch && req.method === 'GET') { json(res, 200, runtime.listFiles(filesMatch[1]!, url.searchParams.get('path') ?? undefined)); return true; }
    const installMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/apps\/([^/]+)\/install$/);
    if (installMatch && req.method === 'POST') { json(res, 200, await runtime.installApp(installMatch[1]!, installMatch[2]!)); broadcast(); return true; }
    const httpMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/http$/);
    if (httpMatch && req.method === 'POST') { const input = await body(req); json(res, 200, await runtime.http(httpMatch[1]!, String(input.url ?? ''))); broadcast(); return true; }
    const collabMatch = url.pathname.match(/^\/api\/computers\/([^/]+)\/collaboration\/([^/]+)$/);
    if (collabMatch && req.method === 'POST') {
      const input = await body(req);
      const message = runtime.postCollaborationMessage(collabMatch[1]!, collabMatch[2]!, String(input.author ?? 'agent'), String(input.text ?? ''));
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
