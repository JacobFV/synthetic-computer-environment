import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliDecompress } from 'node:zlib';
import chromiumBinary, { inflate } from '@sparticuz/chromium';
import type { Browser } from 'playwright';

const root = process.cwd();
const port = 4400 + process.pid % 500;
const base = `http://127.0.0.1:${port}`;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.playwright-browsers');
let server: ChildProcess | undefined;

async function extractTarBr(archive: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const extractor = spawn('tar', ['-x', '-C', target, '--no-same-owner', '--no-same-permissions']);
    createReadStream(archive).pipe(createBrotliDecompress()).pipe(extractor.stdin);
    extractor.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
    extractor.once('error', reject);
  });
}

async function launchBrowser(): Promise<Browser> {
  const chromiumModule = path.dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium')));
  const chromiumBin = path.resolve(chromiumModule, '../bin');
  await extractTarBr(path.join(chromiumBin, 'fonts.tar.br'), '/tmp');
  try { await stat('/tmp/libGLESv2.so'); } catch { await extractTarBr(path.join(chromiumBin, 'swiftshader.tar.br'), '/tmp'); }
  const executablePath = await inflate(path.join(chromiumBin, 'chromium.br'));
  const cacheDir = path.resolve('.browser-runtime/cache');
  await mkdir(cacheDir, { recursive: true });
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true, executablePath, args: chromiumBinary.args, env: { ...process.env, HOME: path.resolve('.browser-runtime'), XDG_CACHE_HOME: cacheDir, FONTCONFIG_PATH: '/tmp/fonts' } });
}

async function bootServer(): Promise<void> {
  server = spawn(process.execPath, ['--import', 'tsx', 'apps/simulator/src/server/index.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), SEED_RUN_ID: 'run-browser-execution-test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let attempt = 0; attempt < 160; attempt++) {
    if (server.exitCode !== null) throw new Error(`simulator exited before becoming healthy (${server.exitCode})`);
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('simulator did not become healthy');
}

await bootServer();
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const cases = [
    { appId: 'chromium', computerId: 'win-workstation', source: '10.42.0.20' },
    { appId: 'edge', computerId: 'win-workstation', source: '10.42.0.20' },
    { appId: 'safari', computerId: 'mac-studio', source: '10.42.0.10' },
    { appId: 'firefox', computerId: 'ubuntu-dev', source: '10.42.0.30' },
  ];
  const documents: Array<{ appId: string; documentUrl: string }> = [];
  for (const browserCase of cases) {
    const query = new URLSearchParams({ computer: browserCase.computerId, apps: browserCase.appId, demo: 'browser-javascript', chrome: '0' });
    await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const iframe = page.locator('iframe[title="virtual internet page"]');
    await iframe.waitFor({ state: 'attached', timeout: 30_000 });
    assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts', `${browserCase.appId} must run scripts without granting same-origin access`);
    const documentUrl = await iframe.getAttribute('src');
    assert.match(documentUrl ?? '', /^\/api\/browser\/documents\/[0-9a-f-]+$/);

    const frame = page.frameLocator('iframe[title="virtual internet page"]');
    const status = frame.locator('#js-runtime-status');
    await status.waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await status.getAttribute('data-state'), 'executed');
    assert.equal(await status.textContent(), 'JavaScript executed in real Chromium');
    assert.equal(await frame.locator('#js-execution-count').textContent(), '1 execution');
    await frame.locator('#run-javascript').click();
    assert.equal(await frame.locator('#js-execution-count').textContent(), '2 executions');
    const renderedCanvas = await frame.locator('#execution-canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL().length);
    assert.ok(renderedCanvas > 500, `${browserCase.appId} must draw non-empty pixels through the Canvas API`);

    const documentResponse = await fetch(new URL(documentUrl!, base));
    assert.equal(documentResponse.status, 200);
    assert.match(documentResponse.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(documentResponse.headers.get('x-seed-virtual-url') ?? '', /^http:\/\/intranet\.seed\.local:8080\/$/);
    assert.ok(documentResponse.headers.get('x-seed-virtual-trace-id'));
    assert.match(documentResponse.headers.get('content-security-policy') ?? '', /connect-src 'none'/);
    assert.match(await documentResponse.text(), /status\.dataset\.state = 'executed'/);
    documents.push({ appId: browserCase.appId, documentUrl: documentUrl! });

    const snapshot = await fetch(`${base}/api/state`).then((response) => response.json()) as { packets: Array<{ protocol: string; source: string; summary: string }> };
    assert.ok(snapshot.packets.some((packet) => packet.protocol === 'http' && packet.source === browserCase.source && packet.summary === 'GET /'));
    if (process.env.SEED_BROWSER_TEST_SCREENSHOT && browserCase.appId === 'chromium') await page.screenshot({ path: path.resolve(process.env.SEED_BROWSER_TEST_SCREENSHOT), fullPage: true });
  }

  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    engine: 'real Chromium via Playwright',
    sandbox: 'allow-scripts (opaque origin)',
    browserSurfaces: documents,
    proof: ['DOM mutation', 'event listener', 'timer', 'Canvas API'],
  }, null, 2)}\n`);
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}
