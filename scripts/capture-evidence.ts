import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliDecompress } from 'node:zlib';
import chromiumBinary, { inflate } from '@sparticuz/chromium';
import type { Browser, Locator, Page } from 'playwright';

const root = process.cwd();
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.playwright-browsers');
const ffmpegShim = path.resolve('.playwright-browsers/ffmpeg-1011/ffmpeg-linux');
await mkdir(path.dirname(ffmpegShim), { recursive: true });
try { if (!(await stat(ffmpegShim)).isFile()) throw new Error('not a file'); }
catch { await unlink(ffmpegShim).catch(() => undefined); await copyFile('/usr/bin/ffmpeg', ffmpegShim); await chmod(ffmpegShim, 0o755); }
const { chromium } = await import('playwright');
const base = process.env.SEED_URL ?? 'http://127.0.0.1:4317';
const evidence = path.resolve('artifacts/evidence-v3');
let server: ChildProcess | undefined;

async function bootServer() {
  try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
  server = spawn(process.execPath, ['--import', 'tsx', 'apps/simulator/src/server/index.ts'], {
    cwd: root, env: { ...process.env, SEED_RUN_ID: 'run-evidence-v3' }, stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('simulator did not become healthy');
}

async function extractTarBr(archive: string, target: string) {
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
  return chromium.launch({ headless: true, executablePath, args: chromiumBinary.args, env: { ...process.env, HOME: path.resolve('.browser-runtime'), XDG_CACHE_HOME: cacheDir, FONTCONFIG_PATH: '/tmp/fonts' } });
}

async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'ignore' });
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
    child.once('error', reject);
  });
}

interface EvidenceScene { label: string; apps: string[] }

const sceneApps: Record<string, EvidenceScene[]> = {
  'mac-studio': [
    { label: 'review assets · files + preview + photos', apps: ['finder', 'preview', 'photos'] },
    { label: 'plan the week · mail + calendar + reminders', apps: ['mail', 'calendar', 'reminders'] },
    { label: 'install and inspect · App Store + Settings', apps: ['app-store', 'settings'] },
    { label: 'project discussion · Slack + Notion', apps: ['slack', 'notion'] },
    { label: 'team meeting prep · Teams + Calendar', apps: ['teams', 'calendar'] },
    { label: 'debug an HTTP exchange · Safari + Postman + Wireshark', apps: ['safari', 'postman', 'wireshark'] },
    { label: 'browser compatibility · Chromium + Firefox', apps: ['chromium', 'firefox'] },
    { label: 'agent workspace · ChatGPT + Finder', apps: ['chatgpt', 'finder'] },
    { label: 'review a commit · VS Code + GitHub Desktop', apps: ['vscode', 'github-desktop'] },
    { label: 'AI-assisted branch work · Cursor + GitKraken', apps: ['cursor', 'gitkraken'] },
    { label: 'service development · Docker Desktop + Postman', apps: ['docker-desktop', 'postman'] },
    { label: 'design handoff · Figma + Preview', apps: ['figma', 'preview'] },
    { label: 'conversation and call · Messages + FaceTime', apps: ['messages', 'facetime'] },
    { label: 'audio session · Music + Spotify + VLC', apps: ['music', 'spotify', 'vlc'] },
    { label: 'research notes · Obsidian + LibreOffice', apps: ['obsidian', 'libreoffice'] },
    { label: 'creative production · GIMP + Blender', apps: ['gimp', 'blender'] },
  ],
  'win-workstation': [
    { label: 'organize and annotate · Explorer + Photos + Notepad', apps: ['explorer', 'photos', 'notepad'] },
    { label: 'triage the day · Outlook + Calendar', apps: ['outlook', 'calendar'] },
    { label: 'software setup · Microsoft Store + Settings', apps: ['store', 'settings'] },
    { label: 'community coordination · Slack + Discord', apps: ['slack', 'discord'] },
    { label: 'channel planning · Teams + Outlook', apps: ['teams', 'outlook'] },
    { label: 'inspect HTTP traffic · Edge + Postman + Wireshark', apps: ['edge', 'postman', 'wireshark'] },
    { label: 'browser compatibility · Chromium + Firefox', apps: ['chromium', 'firefox'] },
    { label: 'review a commit · VS Code + GitHub Desktop', apps: ['vscode', 'github-desktop'] },
    { label: 'AI-assisted branch work · Cursor + GitKraken', apps: ['cursor', 'gitkraken'] },
    { label: 'container API workflow · Docker Desktop + Postman', apps: ['docker-desktop', 'postman'] },
    { label: 'design and annotate · Figma + Paint', apps: ['figma', 'paint'] },
    { label: 'capture and edit · Snipping Tool + Paint + Photos', apps: ['snipping-tool', 'paint', 'photos'] },
    { label: 'audio session · Spotify + VLC + Audacity', apps: ['spotify', 'vlc', 'audacity'] },
    { label: 'product planning · Notion + Linear', apps: ['notion', 'linear'] },
    { label: 'administer software · Task Manager + Package Center', apps: ['task-manager', 'package-center'] },
    { label: 'library and credentials · Steam + Bitwarden', apps: ['steam', 'bitwarden'] },
  ],
  'ubuntu-dev': [
    { label: 'edit documentation · Files + Document Viewer + Text Editor', apps: ['nautilus', 'document-viewer', 'gedit'] },
    { label: 'plan the week · Mail + Calendar', apps: ['mail', 'calendar'] },
    { label: 'update workstation · App Center + Software Updater', apps: ['app-center', 'software-updater'] },
    { label: 'community coordination · Slack + Discord', apps: ['slack', 'discord'] },
    { label: 'browser compatibility · Chromium + Firefox', apps: ['chromium', 'firefox'] },
    { label: 'inspect HTTP traffic · Postman + Wireshark', apps: ['postman', 'wireshark'] },
    { label: 'review a branch · VS Code + GitKraken', apps: ['vscode', 'gitkraken'] },
    { label: 'toolchain setup · Cursor + Package Center', apps: ['cursor', 'package-center'] },
    { label: 'service and data · Docker Desktop + DBeaver', apps: ['docker-desktop', 'dbeaver'] },
    { label: 'creative production · GIMP + Blender', apps: ['gimp', 'blender'] },
    { label: 'document review · LibreOffice + Document Viewer', apps: ['libreoffice', 'document-viewer'] },
    { label: 'audio session · Rhythmbox + Spotify + VLC', apps: ['rhythmbox', 'spotify', 'vlc'] },
    { label: 'remote collaboration · Zoom + Discord', apps: ['zoom', 'discord'] },
    { label: 'system administration · System Monitor + Settings', apps: ['system-monitor', 'settings'] },
    { label: 'local knowledge and vault · Obsidian + 1Password', apps: ['obsidian', 'onepassword'] },
    { label: 'library and production · Steam + Audacity', apps: ['steam', 'audacity'] },
  ],
};

async function captureGrid(browser: Browser) {
  const framesDir = path.join(evidence, '48-states');
  const gridPath = path.join(evidence, '48-desktop-states-grid.png');
  await mkdir(framesDir, { recursive: true });
  await mkdir(path.join(evidence, 'workflow-plates'), { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  let index = 0;
  for (const [computerId, scenes] of Object.entries(sceneApps)) {
    for (const sceneConfig of scenes) {
      index++;
      const { apps, label: workflow } = sceneConfig;
      const query = new URLSearchParams({ computer: computerId, apps: apps.join(','), scene: String(index), chrome: '0' });
      await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector('.desktop', { timeout: 30_000 });
      await page.waitForTimeout(360);
      await page.evaluate(({ computerId, apps, index, workflow }) => {
        const label = document.createElement('div');
        label.textContent = `${String(index).padStart(2, '0')} · ${computerId} · ${workflow}`;
        Object.assign(label.style, { position: 'fixed', right: '12px', bottom: '12px', zIndex: '999999', padding: '7px 10px', borderRadius: '4px', color: 'white', background: '#080b12cc', font: '11px ui-monospace, monospace', backdropFilter: 'blur(12px)' });
        document.body.append(label);
      }, { computerId, apps, index, workflow });
      await page.screenshot({ path: path.join(framesDir, `state-${String(index).padStart(2, '0')}.png`) });
    }
  }
  await run('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(framesDir, 'state-%02d.png'), '-vf', 'scale=236:147:force_original_aspect_ratio=decrease,pad=236:147:(ow-iw)/2:(oh-ih)/2:#090b12,tile=8x6:padding=5:margin=5:color=#090b12', '-frames:v', '1', gridPath]);
  const computers = Object.keys(sceneApps);
  for (let computerIndex = 0; computerIndex < computers.length; computerIndex++) {
    const computerId = computers[computerIndex]!;
    for (let part = 0; part < 2; part++) {
      const first = computerIndex * 16 + part * 8 + 1;
      await run('ffmpeg', ['-y', '-framerate', '1', '-start_number', String(first), '-i', path.join(framesDir, 'state-%02d.png'), '-vf', 'scale=352:220:force_original_aspect_ratio=decrease,pad=352:220:(ow-iw)/2:(oh-ih)/2:#090b12,tile=4x2:padding=6:margin=6:color=#090b12', '-frames:v', '1', path.join(evidence, 'workflow-plates', `${computerId}-workflows-${part + 1}.png`)]);
    }
  }
}

async function captureAppPortraits(browser: Browser) {
  const portraitDir = path.join(evidence, 'app-portraits');
  const plateDir = path.join(evidence, 'app-portrait-plates');
  await mkdir(portraitDir, { recursive: true });
  await mkdir(plateDir, { recursive: true });
  const snapshot = await fetch(`${base}/api/state`).then((response) => response.json()) as {
    appCatalog: Array<{ id: string; name: string; supportedOS: string[] }>;
    computers: Array<{ spec: { id: string; os: string; displays: unknown[] }; installedApps: Array<{ id: string }> }>;
  };
  const displayComputers = snapshot.computers.filter((computer) => computer.spec.displays.length > 0);
  const usage: Record<string, number> = { macos: 0, windows: 0, ubuntu: 0 };
  const index: Array<{ number: number; appId: string; appName: string; computerId: string; os: string; file: string }> = [];
  const page = await browser.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1 });
  let number = 0;
  for (const app of snapshot.appCatalog) {
    const candidates = displayComputers.filter((computer) => app.supportedOS.includes(computer.spec.os) && computer.installedApps.some((installed) => installed.id === app.id));
    const computer = candidates.sort((a, b) => (usage[a.spec.os] ?? 0) - (usage[b.spec.os] ?? 0))[0];
    if (!computer) continue;
    usage[computer.spec.os] = (usage[computer.spec.os] ?? 0) + 1;
    number++;
    const query = new URLSearchParams({ computer: computer.spec.id, apps: app.id, scene: String(number), chrome: '0' });
    await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.app-window', { timeout: 30_000 });
    await page.waitForTimeout(220);
    await page.evaluate(({ number, appName, computerId }) => {
      const label = document.createElement('div');
      label.textContent = `${String(number).padStart(2, '0')} · ${appName} · ${computerId}`;
      Object.assign(label.style, { position: 'fixed', right: '10px', bottom: '10px', zIndex: '999999', padding: '6px 9px', borderRadius: '3px', color: 'white', background: '#080b12d9', font: '11px ui-monospace, monospace', backdropFilter: 'blur(10px)' });
      document.body.append(label);
    }, { number, appName: app.name, computerId: computer.spec.id });
    const file = `portrait-${String(number).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(portraitDir, file) });
    index.push({ number, appId: app.id, appName: app.name, computerId: computer.spec.id, os: computer.spec.os, file });
  }
  await page.close();
  await writeFile(path.join(evidence, 'app-portrait-index.json'), JSON.stringify(index, null, 2));
  const plateSize = 6;
  for (let offset = 0; offset < index.length; offset += plateSize) {
    const first = offset + 1;
    await run('ffmpeg', ['-y', '-framerate', '1', '-start_number', String(first), '-i', path.join(portraitDir, 'portrait-%02d.png'), '-vf', 'scale=512:320:force_original_aspect_ratio=decrease,pad=512:320:(ow-iw)/2:(oh-ih)/2:#090b12,tile=3x2:padding=6:margin=6:color=#090b12', '-frames:v', '1', path.join(plateDir, `applications-${String(Math.floor(offset / plateSize) + 1).padStart(2, '0')}.png`)]);
  }
}

async function captureIconWalls(browser: Browser) {
  await mkdir(path.join(evidence, 'icon-walls'), { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const id of Object.keys(sceneApps)) {
    await page.goto(`${base}/?computer=${id}&apps=__none__&launcher=1&chrome=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.launcher');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(evidence, 'icon-walls', `${id}.png`) });
  }
  // Keep one page alive: @sparticuz/chromium uses single-process mode in the sandbox.
}

async function installOverlay(page: Page, leftLabel: string, rightLabel?: string) {
  await page.evaluate(({ leftLabel, rightLabel }) => {
    const style = document.createElement('style');
    style.textContent = `body{margin:0;background:#090b12;overflow:hidden;font-family:Inter,system-ui,sans-serif}.recording-grid{height:848px;display:grid;grid-template-columns:${rightLabel ? '1fr 1fr' : '1fr'};gap:4px;padding:4px}.recording-grid section{position:relative;overflow:hidden;background:#111}.recording-grid iframe{width:100%;height:100%;border:0}.recording-label{position:absolute;z-index:6;left:12px;top:12px;padding:6px 9px;background:#080b12d9;color:white;border-radius:4px;font:11px ui-monospace,monospace}.event-bar{position:fixed;z-index:100000;left:0;right:0;bottom:0;height:48px;display:flex;align-items:center;padding:0 18px;background:#090b12e8;color:#eef2ff;border-top:1px solid #ffffff22;backdrop-filter:blur(16px);font:14px ui-monospace,monospace}.event-bar b{color:#77e0b5;margin-right:10px}.event-bar span{color:#aeb7c9}.proof-cursor{position:fixed;z-index:100001;width:22px;height:22px;border:2px solid white;border-radius:50%;box-shadow:0 0 0 5px #6d5dfc66,0 2px 8px #000;pointer-events:none;transform:translate(-50%,-50%);left:80px;top:80px;transition:left .18s linear,top .18s linear}.proof-cursor:after{content:'';position:absolute;width:5px;height:5px;background:white;border-radius:50%;left:6px;top:6px}`;
    document.head.append(style);
    document.body.innerHTML = `<div class="recording-grid"><section><span class="recording-label">${leftLabel}</span><iframe id="left"></iframe></section>${rightLabel ? `<section><span class="recording-label">${rightLabel}</span><iframe id="right"></iframe></section>` : ''}</div><div class="event-bar"><b>input event</b><span>booting display…</span></div><div class="proof-cursor"></div>`;
  }, { leftLabel, rightLabel });
}

async function updateOverlay(page: Page, label: string, x?: number, y?: number) {
  await page.evaluate(({ label, x, y }) => {
    const text = document.querySelector('.event-bar span'); if (text) text.textContent = label;
    const cursor = document.querySelector<HTMLElement>('.proof-cursor'); if (cursor && x !== undefined && y !== undefined) { cursor.style.left = `${x}px`; cursor.style.top = `${y}px`; }
  }, { label, x, y });
}

async function pointAt(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox(); if (!box) throw new Error(`element has no box: ${label}`);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await updateOverlay(page, `mouse move · ${label} · (${Math.round(x)}, ${Math.round(y)})`, x, y);
  await page.mouse.move(x, y, { steps: 16 });
  await page.waitForTimeout(380);
  return { x, y, box };
}

async function clickAt(page: Page, locator: Locator, label: string) {
  const { x, y } = await pointAt(page, locator, label);
  await updateOverlay(page, `pointer down/up · ${label}`, x, y);
  await locator.click();
  await page.waitForTimeout(350);
}

async function waitFrame(page: Page, token: string) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const frame = page.frames().find((item) => item.url().includes(token));
    if (frame) return frame;
    await page.waitForTimeout(100);
  }
  throw new Error(`frame did not navigate to ${token}`);
}

async function record(name: string, action: (page: Page) => Promise<void>) {
  const mp4 = path.join(evidence, 'recordings', `${name}.mp4`);
  try { if ((await stat(mp4)).size > 100_000) { console.log(`preserved ${mp4}`); return; } } catch {}
  const videoDir = path.join(evidence, 'recordings', 'raw', name);
  await mkdir(videoDir, { recursive: true });
  const recordingBrowser = await launchBrowser();
  const context = await recordingBrowser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1600, height: 900 } } });
  const page = await context.newPage();
  const video = page.video();
  try { await action(page); await page.waitForTimeout(800); }
  finally { await context.close(); await recordingBrowser.close(); }
  if (!video) throw new Error('playwright video recorder unavailable');
  const webm = await video.path();
  await mkdir(path.dirname(mp4), { recursive: true });
  await run('ffmpeg', ['-y', '-i', webm, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  await run('ffmpeg', ['-y', '-ss', '00:00:02', '-i', mp4, '-frames:v', '1', path.join(evidence, 'recordings', `${name}-poster.png`)]);
  console.log(`recorded ${mp4}`);
}

async function recordSameServiceCollaboration(options: { name: string; service: 'slack' | 'teams'; leftComputer: string; rightComputer: string; message: string }) {
  const label = options.service === 'slack' ? 'Slack' : 'Microsoft Teams';
  await record(options.name, async (page) => {
    await page.goto('about:blank'); await installOverlay(page, `${options.leftComputer} · ${label}`, `${options.rightComputer} · ${label}`);
    await page.locator('#left').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=${options.leftComputer}&apps=${options.service}&scene=1&chrome=0`);
    await page.locator('#right').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=${options.rightComputer}&apps=${options.service}&scene=2&chrome=0`);
    const left = await waitFrame(page, `computer=${options.leftComputer}`);
    const right = await waitFrame(page, `computer=${options.rightComputer}`);
    await Promise.all([left.waitForSelector('.collab-app'), right.waitForSelector('.collab-app')]);
    await page.waitForTimeout(900);
    const input = left.getByLabel(`Message agent-runs on ${options.service}`); await clickAt(page, input, `focus ${label} composer`);
    await updateOverlay(page, `keyboard · typing “${options.message}”`);
    await input.fill(options.message); await page.waitForTimeout(700);
    await clickAt(page, left.getByLabel('Send message'), `send ${label} message`);
    await right.getByText(options.message).waitFor({ timeout: 10_000 });
    await updateOverlay(page, `same-service WebSocket update · ${label} server revision reaches the other client`);
    await pointAt(page, right.getByText(options.message), `message received on ${options.rightComputer}`);
    await page.waitForTimeout(3200);
  });
}

async function recordNetwork() {
  await record('windows-to-ubuntu-network-live', async (page) => {
    await page.goto('about:blank'); await installOverlay(page, 'win-workstation · Chromium', 'ubuntu-dev · Wireshark');
    await page.locator('#left').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=win-workstation&apps=chromium&scene=3&chrome=0`);
    await page.locator('#right').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=ubuntu-dev&apps=wireshark&scene=4&chrome=0`);
    const left = await waitFrame(page, 'computer=win-workstation');
    const right = await waitFrame(page, 'computer=ubuntu-dev');
    await Promise.all([left.waitForSelector('.browser-app'), right.waitForSelector('.wireshark-app')]); await page.waitForTimeout(850);
    const address = left.locator('.addressbar input'); await clickAt(page, address, 'focus address bar');
    await updateOverlay(page, 'keyboard · ctrl+a · http://intranet.seed.local:8080/ · enter');
    await address.fill('http://intranet.seed.local:8080/'); await page.waitForTimeout(700); await address.press('Enter');
    await left.locator('.browser-status').waitFor({ timeout: 10_000 });
    const virtualPage = left.frameLocator('iframe[title="virtual internet page"]');
    const executed = virtualPage.locator('#js-runtime-status[data-state="executed"]');
    await executed.waitFor({ timeout: 10_000 });
    await pointAt(page, executed, 'website JavaScript executed in real Chromium');
    const runAgain = virtualPage.locator('#run-javascript');
    await clickAt(page, runAgain, 'click the virtual website event handler');
    await virtualPage.getByText('2 executions', { exact: true }).waitFor({ timeout: 10_000 });
    await right.locator('.packet-table>div').first().waitFor({ timeout: 10_000 });
    await updateOverlay(page, 'real DOM + timer + Canvas · virtual TCP session · SYN → SYN/ACK → ACK → HTTP 200 → FIN');
    await pointAt(page, right.locator('.packet-table').first(), 'packet trace updates on Ubuntu');
    await page.waitForTimeout(3200);
  });
}

async function recordWindowManagement() {
  await record('windows-window-management', async (page) => {
    await page.goto('about:blank'); await installOverlay(page, 'win-workstation · native window behavior');
    await page.locator('#left').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=win-workstation&apps=explorer,task-manager&scene=6&chrome=0`);
    const frame = await waitFrame(page, 'computer=win-workstation');
    await frame.waitForSelector('.process-app'); await page.waitForTimeout(800);
    const titlebar = frame.locator('.app-window').nth(1).locator('.window-titlebar');
    const start = await pointAt(page, titlebar, 'grab Task Manager title bar');
    await updateOverlay(page, 'pointer drag · move window +190px, +90px', start.x, start.y);
    await page.mouse.down(); await page.mouse.move(start.x + 190, start.y + 90, { steps: 24 }); await page.mouse.up(); await page.waitForTimeout(600);
    const maximize = frame.locator('.app-window').nth(1).locator('.window-actions button').nth(1); await clickAt(page, maximize, 'maximize Task Manager');
    await page.waitForTimeout(900); await clickAt(page, maximize, 'restore Task Manager');
    await page.waitForTimeout(900);
  });
}

async function recordPackages() {
  await record('package-manager-and-git', async (page) => {
    await page.goto('about:blank'); await installOverlay(page, 'ubuntu-dev · packages + git');
    await page.locator('#left').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=ubuntu-dev&apps=package-center,gitkraken&scene=7&chrome=0`);
    const frame = await waitFrame(page, 'computer=ubuntu-dev');
    await frame.waitForSelector('.git-app'); await page.waitForTimeout(800);
    await clickAt(page, frame.locator('.app-window').first().locator('.window-titlebar'), 'focus Package Center');
    await updateOverlay(page, 'shell API · apt install nginx · package receipt written into the VFS');
    await frame.evaluate(async () => { await fetch('/api/computers/ubuntu-dev/shell', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'apt install nginx' }) }); });
    await frame.getByText('nginx', { exact: true }).first().waitFor({ timeout: 10_000 }); await pointAt(page, frame.getByText('nginx', { exact: true }).first(), 'new APT package appears');
    await clickAt(page, frame.locator('.app-window').nth(1).locator('.window-titlebar'), 'focus GitKraken');
    await updateOverlay(page, 'shell API · git add + commit · object and ref written beneath .git');
    await frame.evaluate(async () => { await fetch('/api/computers/ubuntu-dev/shell', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'cd ~/Projects/seed-ecosystem; echo proof > evidence.txt; git add evidence.txt; git commit -m "record package proof"' }) }); });
    await frame.getByText('record package proof', { exact: true }).first().waitFor({ timeout: 10_000 }); await pointAt(page, frame.getByText('record package proof', { exact: true }).first(), 'commit appears in visual history');
    await page.waitForTimeout(1200);
  });
}

async function recordFilePersistence() {
  await record('vfs-file-save-and-observe', async (page) => {
    await page.goto('about:blank'); await installOverlay(page, 'win-workstation · Notepad', 'win-workstation · File Explorer');
    await page.locator('#left').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=win-workstation&apps=notepad&scene=8&chrome=0`);
    await page.locator('#right').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=win-workstation&apps=explorer&scene=9&chrome=0`);
    const left = await waitFrame(page, 'apps=notepad');
    const right = await waitFrame(page, 'apps=explorer');
    await Promise.all([left.waitForSelector('.editor-app'), right.waitForSelector('.files-app')]);
    const editor = left.getByLabel('Notepad document');
    await clickAt(page, editor, 'focus Notepad document');
    await updateOverlay(page, 'keyboard · append an evidence line to the document');
    await editor.fill('Deployment notes\n\nSaved through the installed Notepad VFS application runtime.');
    await page.waitForTimeout(650);
    await clickAt(page, left.getByRole('button', { name: 'Save', exact: true }), 'save into the Windows virtual disk');
    await updateOverlay(page, 'VFS commit · path table, inode metadata and blob are updated');
    await clickAt(page, right.getByRole('button', { name: 'Documents', exact: true }), 'open Documents in File Explorer');
    await right.getByText('deployment-notes.txt', { exact: true }).waitFor({ timeout: 10_000 });
    await pointAt(page, right.getByText('deployment-notes.txt', { exact: true }), 'the saved file appears in Explorer');
    await page.waitForTimeout(2600);
  });
}

async function recordApplicationInstall() {
  await record('app-store-install-live', async (page) => {
    await fetch(`${base}/api/computers/mac-studio/apps/dbeaver`, { method: 'DELETE' }).catch(() => undefined);
    await page.goto('about:blank'); await installOverlay(page, 'mac-studio · App Store', 'mac-studio · Applications');
    await page.locator('#left').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=mac-studio&apps=app-store&scene=10&chrome=0`);
    await page.locator('#right').evaluate((node, url) => { (node as HTMLIFrameElement).src = url; }, `${base}/?computer=mac-studio&apps=__none__&launcher=1&scene=11&chrome=0`);
    const left = await waitFrame(page, 'apps=app-store');
    const right = await waitFrame(page, 'launcher=1');
    await Promise.all([left.waitForSelector('.store-app'), right.waitForSelector('.launcher')]);
    const search = left.getByPlaceholder('Search App Store');
    await clickAt(page, search, 'focus App Store search');
    await updateOverlay(page, 'keyboard · search for DBeaver');
    await search.fill('DBeaver');
    await left.getByText('DBeaver', { exact: true }).waitFor();
    await clickAt(page, left.getByRole('button', { name: 'GET', exact: true }), 'install signed DBeaver package');
    await right.getByText('DBeaver', { exact: true }).waitFor({ timeout: 10_000 });
    await updateOverlay(page, 'registry → integrity check → VFS bundle + receipt → launcher update');
    await pointAt(page, right.getByText('DBeaver', { exact: true }), 'new application appears on the other display');
    await page.waitForTimeout(2800);
  });
}

await bootServer();
await mkdir(evidence, { recursive: true });
const browser = await launchBrowser();
try {
  await captureGrid(browser);
  await captureAppPortraits(browser);
  await captureIconWalls(browser);
} finally {
  await browser.close();
}
try {
  await recordSameServiceCollaboration({ name: 'slack-cross-device-live', service: 'slack', leftComputer: 'mac-studio', rightComputer: 'ubuntu-dev', message: 'Slack proof from mac-studio reached Ubuntu.' });
  await recordSameServiceCollaboration({ name: 'teams-cross-device-live', service: 'teams', leftComputer: 'win-workstation', rightComputer: 'mac-studio', message: 'Teams proof from Windows reached macOS.' });
  await recordNetwork();
  await recordWindowManagement();
  await recordPackages();
  await recordFilePersistence();
  await recordApplicationInstall();
  const finalSnapshot = await fetch(`${base}/api/state`).then((response) => response.json());
  const trajectory = await fetch(`${base}/api/trajectory`).then((response) => response.text());
  await writeFile(path.join(evidence, 'runtime-snapshot.json'), JSON.stringify(finalSnapshot, null, 2));
  await writeFile(path.join(evidence, 'trajectory.jsonl'), trajectory.endsWith('\n') ? trajectory : `${trajectory}\n`);
} finally { server?.kill('SIGTERM'); }
