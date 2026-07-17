import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliDecompress } from 'node:zlib';
import chromiumBinary, { inflate } from '@sparticuz/chromium';
import { chromium } from 'playwright';

const base = process.env.SEED_URL ?? 'http://127.0.0.1:4317';
let server: ChildProcess | undefined;
try { await fetch(`${base}/api/health`); }
catch {
  server = spawn(process.execPath, ['--import', 'tsx', 'apps/simulator/src/server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, SEED_RUN_ID: 'run-screenshots' },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

await mkdir('artifacts/screenshots', { recursive: true });
const extractTarBr = async (archive: string, target: string) => {
  await mkdir(target, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const extractor = spawn('tar', ['-x', '-C', target, '--no-same-owner', '--no-same-permissions']);
    createReadStream(archive).pipe(createBrotliDecompress()).pipe(extractor.stdin);
    extractor.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
    extractor.once('error', reject);
  });
};
const chromiumModule = path.dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium')));
const chromiumBin = path.resolve(chromiumModule, '../bin');
try { if ((await stat('/tmp/chromium')).size < 10_000_000) await rm('/tmp/chromium', { force: true }); } catch {}
await rm('/tmp/fonts', { recursive: true, force: true });
await extractTarBr(path.join(chromiumBin, 'fonts.tar.br'), '/tmp');
if (!(await stat('/tmp/libGLESv2.so').catch(() => undefined))) await extractTarBr(path.join(chromiumBin, 'swiftshader.tar.br'), '/tmp');
const executablePath = await inflate(path.join(chromiumBin, 'chromium.br'));
const cacheDir = path.resolve('.browser-runtime/cache');
await mkdir(cacheDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath, args: chromiumBinary.args, env: { ...process.env, HOME: path.resolve('.browser-runtime'), XDG_CACHE_HOME: cacheDir, FONTCONFIG_PATH: '/tmp/fonts' } });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const demos = [
  ['macos-chatgpt-work', 'computer=mac-studio&demo=mac&chrome=0'],
  ['macos-app-store-registry', 'computer=mac-studio&demo=appstore&chrome=0'],
  ['windows-cross-computer-web', 'computer=win-workstation&demo=windows&chrome=0'],
  ['ubuntu-network-inspection', 'computer=ubuntu-dev&demo=ubuntu&chrome=0'],
  ['runtime-multi-computer', 'computer=mac-studio&demo=mac'],
] as const;
for (const [name, query] of demos) {
  await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('.desktop', { timeout: 20_000 });
  await page.waitForTimeout(1300);
  if (name === 'macos-chatgpt-work') { await page.locator('.composer .send').click(); await page.waitForTimeout(300); }
  if (name === 'macos-app-store-registry') { await page.getByRole('button', { name: 'GET' }).click(); await page.waitForTimeout(500); }
  await page.screenshot({ path: path.resolve(`artifacts/screenshots/${name}.png`), fullPage: true });
  console.log(`captured artifacts/screenshots/${name}.png`);
}
await browser.close();
server?.kill('SIGTERM');
