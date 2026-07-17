import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliDecompress } from 'node:zlib';
import chromiumBinary, { inflate } from '@sparticuz/chromium';
import type { Browser } from 'playwright';
import type { SimulationSnapshot } from '@seed/protocol';

const root = process.cwd();
const base = process.env.SEED_URL ?? 'http://127.0.0.1:4317';
const reportPath = path.resolve(process.env.SEED_UI_AUDIT ?? 'artifacts/ui-audit-v3.json');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.playwright-browsers');

type Severity = 'error' | 'warning';
interface Finding {
  severity: Severity;
  code: string;
  computerId: string;
  appId: string;
  detail: string;
}

let server: ChildProcess | undefined;

async function bootServer(): Promise<void> {
  try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
  server = spawn(process.execPath, ['--import', 'tsx', 'apps/simulator/src/server/index.ts'], {
    cwd: root,
    env: { ...process.env, SEED_RUN_ID: 'run-ui-audit-v3' },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 160; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('simulator did not become healthy');
}

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
  const shim = path.resolve('.playwright-browsers/ffmpeg-1011/ffmpeg-linux');
  await mkdir(path.dirname(shim), { recursive: true });
  try { if (!(await stat(shim)).isFile()) throw new Error('not a file'); }
  catch { await unlink(shim).catch(() => undefined); await copyFile('/usr/bin/ffmpeg', shim); await chmod(shim, 0o755); }
  const chromiumModule = path.dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium')));
  const chromiumBin = path.resolve(chromiumModule, '../bin');
  await extractTarBr(path.join(chromiumBin, 'fonts.tar.br'), '/tmp');
  try { await stat('/tmp/libGLESv2.so'); } catch { await extractTarBr(path.join(chromiumBin, 'swiftshader.tar.br'), '/tmp'); }
  const executablePath = await inflate(path.join(chromiumBin, 'chromium.br'));
  const cacheDir = path.resolve('.browser-runtime/cache');
  await mkdir(cacheDir, { recursive: true });
  const { chromium } = await import('playwright');
  return chromium.launch({
    headless: true,
    executablePath,
    args: chromiumBinary.args,
    env: { ...process.env, HOME: path.resolve('.browser-runtime'), XDG_CACHE_HOME: cacheDir, FONTCONFIG_PATH: '/tmp/fonts' },
  });
}

await bootServer();
const snapshot = await fetch(`${base}/api/state`).then((response) => response.json()) as SimulationSnapshot;
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const findings: Finding[] = [];
let inspected = 0;

try {
  for (const computer of snapshot.computers.filter((value) => value.spec.displays.length > 0)) {
    for (const app of computer.installedApps) {
      const query = new URLSearchParams({ computer: computer.spec.id, apps: app.id, scene: '0', chrome: '0' });
      await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector('.app-window', { timeout: 30_000 });
      await page.waitForTimeout(80);
      inspected++;
      const measured = await page.evaluate(({ expectedName, os }) => {
        const windowNode = document.querySelector<HTMLElement>('.app-window');
        const titlebar = document.querySelector<HTMLElement>('.window-titlebar');
        const icon = titlebar?.querySelector<HTMLElement>('.window-native-icon');
        const content = document.querySelector<HTMLElement>('.window-content');
        const actionButtons = [...(titlebar?.querySelectorAll<HTMLElement>('.window-actions button') ?? [])];
        const fallback = document.querySelector<HTMLElement>('.role-app.specialized-app');
        const windowRect = windowNode?.getBoundingClientRect();
        const titleRect = titlebar?.getBoundingClientRect();
        const iconRect = icon?.getBoundingClientRect();
        const macActive = document.querySelector<HTMLElement>('.mac-menu > div:first-child > b:nth-of-type(2)')?.textContent?.trim();
        const ubuntuActive = document.querySelector<HTMLElement>('.ubuntu-top > b')?.textContent?.trim();
        const appTitle = titlebar?.querySelector<HTMLElement>(':scope > b')?.textContent?.trim();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          documentWidth: document.documentElement.scrollWidth,
          windowRect: windowRect ? { x: windowRect.x, y: windowRect.y, right: windowRect.right, bottom: windowRect.bottom } : undefined,
          titleRect: titleRect ? { width: titleRect.width, height: titleRect.height } : undefined,
          iconRect: iconRect ? { x: iconRect.x, y: iconRect.y, width: iconRect.width, height: iconRect.height } : undefined,
          actionButtons: actionButtons.map((button) => {
            const rect = button.getBoundingClientRect();
            return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '' };
          }),
          contentOverflow: content ? { scrollWidth: content.scrollWidth, clientWidth: content.clientWidth, scrollHeight: content.scrollHeight, clientHeight: content.clientHeight } : undefined,
          hasFallback: Boolean(fallback),
          activeLabel: os === 'macos' ? macActive : os === 'ubuntu' ? ubuntuActive : appTitle,
          expectedName,
        };
      }, { expectedName: app.name, os: computer.spec.os });

      const add = (severity: Severity, code: string, detail: string) => findings.push({ severity, code, computerId: computer.spec.id, appId: app.id, detail });
      if (!measured.windowRect || !measured.titleRect) add('error', 'missing-window-geometry', 'window or title bar could not be measured');
      if (measured.documentWidth > measured.viewport.width + 1) add('error', 'document-horizontal-overflow', `${measured.documentWidth}px document in ${measured.viewport.width}px viewport`);
      if (measured.windowRect && (measured.windowRect.x < -1 || measured.windowRect.y < -1 || measured.windowRect.right > measured.viewport.width + 1 || measured.windowRect.bottom > measured.viewport.height + 1)) add('error', 'window-outside-work-area', JSON.stringify(measured.windowRect));
      if (computer.spec.os === 'windows') {
        if (measured.titleRect && Math.abs(measured.titleRect.height - 32) > 4) add('error', 'windows-titlebar-height', `expected 32px, measured ${measured.titleRect.height}px`);
        if (!measured.iconRect) add('error', 'windows-titlebar-icon-missing', 'standard Windows windows require a 16px title icon');
        else if (measured.iconRect.width < 12 || measured.iconRect.height < 12 || measured.iconRect.width > 20 || measured.iconRect.height > 20) add('error', 'windows-titlebar-icon-rogue-size', `${measured.iconRect.width}×${measured.iconRect.height}px`);
        if (measured.actionButtons.length !== 3) add('error', 'windows-caption-button-count', `expected 3 caption buttons, measured ${measured.actionButtons.length}`);
        for (const button of measured.actionButtons) if (Math.abs(button.width - 46) > 2 || Math.abs(button.height - 32) > 2) add('error', 'windows-caption-target-size', `${button.label || 'caption'} measured ${button.width}×${button.height}px`);
      }
      if (measured.contentOverflow && measured.contentOverflow.scrollWidth > measured.contentOverflow.clientWidth + 2) add('error', 'window-content-horizontal-overflow', JSON.stringify(measured.contentOverflow));
      if (measured.hasFallback) add('warning', 'generic-application-fallback', 'application resolved to the generic metadata surface');
      if (measured.activeLabel && measured.activeLabel !== app.name) add('warning', 'active-application-label', `expected “${app.name}”, rendered “${measured.activeLabel}”`);
    }
  }
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}

await mkdir(path.dirname(reportPath), { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  runId: snapshot.runId,
  inspected,
  errors: findings.filter((finding) => finding.severity === 'error').length,
  warnings: findings.filter((finding) => finding.severity === 'warning').length,
  findings,
};
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.errors) process.exitCode = 1;
