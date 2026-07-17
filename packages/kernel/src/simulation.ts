import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppManifest, CollaborationMessage, ComputerSnapshot, ComputerSpec, GatewayRule, InstalledApp, OSKind, SimulationSnapshot, TrajectoryEvent, VirtualHttpResponse } from '@seed/protocol';
import { appCatalog, systemAppsForOS } from '@seed/catalog';
import { InternetFabric } from './network.js';
import { ProcessManager } from './processes.js';
import { ShellSession, type ShellResult } from './shell.js';
import { TrajectoryRecorder } from './trajectory.js';
import { VirtualFileSystem } from './vfs.js';
import { SoftwareEnvironment } from './software.js';

interface ComputerRuntime {
  spec: ComputerSpec;
  bootedAt: number;
  vfs: VirtualFileSystem;
  processes: ProcessManager;
  shell: ShellSession;
  software: SoftwareEnvironment;
  installedApps: Map<string, InstalledApp>;
}

export interface SimulationOptions { stateRoot?: string; runId?: string; }

const runStamp = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const GIB = 1024 ** 3;

export class SimulationRuntime {
  readonly runId: string;
  readonly stateRoot: string;
  readonly network = new InternetFabric();
  readonly trajectory: TrajectoryRecorder;
  private readonly computers = new Map<string, ComputerRuntime>();
  private readonly collaboration: CollaborationMessage[] = [];

  constructor(options: SimulationOptions = {}) {
    this.runId = options.runId ?? `run-${runStamp()}`;
    this.stateRoot = path.resolve(options.stateRoot ?? '.state');
    this.trajectory = new TrajectoryRecorder(this.runId);
  }

  async initialize(): Promise<void> {
    const specs: ComputerSpec[] = [
      { id: 'mac-studio', hostname: 'mac-studio', os: 'macos', shell: 'zsh', ipv4: '10.42.0.10', memoryBytes: 16 * GIB, cpuCores: 10, disks: [{ id: 'Macintosh-HD', label: 'Macintosh HD', mount: '/', capacityBytes: 256 * GIB }], displays: [{ id: 'main', name: 'Studio Display', width: 1512, height: 982, scale: 2 }] },
      { id: 'win-workstation', hostname: 'win-workstation', os: 'windows', shell: 'powershell', ipv4: '10.42.0.20', memoryBytes: 16 * GIB, cpuCores: 8, disks: [{ id: 'C', label: 'Windows', mount: 'C:', capacityBytes: 256 * GIB }], displays: [{ id: 'main', name: 'Generic PnP Monitor', width: 1440, height: 900, scale: 1.25 }] },
      { id: 'ubuntu-dev', hostname: 'ubuntu-dev', os: 'ubuntu', shell: 'bash', ipv4: '10.42.0.30', memoryBytes: 8 * GIB, cpuCores: 8, disks: [{ id: 'root', label: 'Ubuntu', mount: '/', capacityBytes: 128 * GIB }], displays: [{ id: 'main', name: 'VirtIO Display', width: 1440, height: 900, scale: 1 }] },
      { id: 'seed-registry', hostname: 'registry', os: 'ubuntu', shell: 'bash', ipv4: '10.42.0.2', memoryBytes: 2 * GIB, cpuCores: 2, disks: [{ id: 'root', label: 'Registry', mount: '/', capacityBytes: 32 * GIB }], displays: [] },
    ];
    for (const spec of specs) await this.createComputer(spec);
    this.network.addDns('dns.seed.local', '10.42.0.2');
    this.network.addGateway({ id: 'docs-egress', name: 'documentation egress', enabled: true, direction: 'egress', protocols: ['https'], cidrs: [], hostnames: ['developer.mozilla.org', 'docs.python.org', 'platform.openai.com'], ports: [443], audit: true });
    this.network.addGateway({ id: 'default-deny', name: 'default deny', enabled: false, direction: 'egress', protocols: ['tcp', 'udp', 'http', 'https'], cidrs: ['0.0.0.0/0'], hostnames: ['*'], ports: '*', audit: true });
    this.registerSeedServices();
    this.seedCollaboration();
    this.trajectory.record({ actor: 'system', kind: 'snapshot', action: 'runtime.initialized', data: { computers: specs.length } });
  }

  private async createComputer(spec: ComputerSpec): Promise<void> {
    const vfs = new VirtualFileSystem(this.stateRoot, this.runId, spec);
    await vfs.initialize();
    await this.seedFilesystem(vfs, spec);
    const processes = new ProcessManager(spec.id);
    const home = spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
    processes.boot(spec.os === 'windows' ? 'System' : spec.os === 'macos' ? 'launchd' : 'systemd', home, { HOSTNAME: spec.hostname });
    for (const daemon of this.daemonsFor(spec.os)) processes.spawn({ executable: daemon, cwd: '/', ppid: 1, memoryBytes: 8 * 1024 * 1024 });
    const installedApps = new Map<string, InstalledApp>();
    const software = new SoftwareEnvironment(spec, vfs, processes);
    await software.initialize();
    const runtime = {} as ComputerRuntime;
    const shell = new ShellSession({ spec, vfs, processes, network: this.network, software, listApps: () => [...installedApps.values()], catalog: () => appCatalog, install: (appId) => this.installApp(spec.id, appId), onAction: (action, data) => this.trajectory.record({ computerId: spec.id, actor: 'agent', kind: 'keyboard', action, data }) });
    Object.assign(runtime, { spec, bootedAt: Date.now(), vfs, processes, shell, software, installedApps });
    this.computers.set(spec.id, runtime);
    this.network.attach(spec);
    for (const manifest of systemAppsForOS(spec.os)) await this.installApp(spec.id, manifest.id, true);
    for (const id of this.defaultThirdParty(spec.os)) await this.installApp(spec.id, id, true);
  }

  private daemonsFor(os: OSKind): string[] {
    if (os === 'windows') return ['smss.exe', 'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'dwm.exe', 'explorer.exe'];
    if (os === 'macos') return ['kernel_task', 'WindowServer', 'loginwindow', 'cfprefsd', 'mDNSResponder', 'Finder'];
    return ['systemd-journald', 'systemd-networkd', 'NetworkManager', 'gdm3', 'gnome-shell', 'pipewire'];
  }

  private defaultThirdParty(os: OSKind): string[] {
    if (os === 'macos') return ['chromium', 'firefox', 'slack', 'teams', 'chatgpt', 'vscode', 'package-center', 'github-desktop', 'docker-desktop', 'postman', 'figma', 'notion', 'linear', 'zoom', 'spotify', 'obsidian', 'vlc', 'blender', 'bitwarden'];
    if (os === 'windows') return ['chromium', 'firefox', 'slack', 'teams', 'vscode', 'package-center', 'github-desktop', 'docker-desktop', 'postman', 'figma', 'notion', 'linear', 'discord', 'zoom', 'spotify', 'obsidian', 'vlc', 'steam', 'onepassword'];
    return ['chromium', 'firefox', 'slack', 'vscode', 'wireshark', 'package-center', 'gitkraken', 'docker-desktop', 'postman', 'discord', 'zoom', 'spotify', 'obsidian', 'vlc', 'blender', 'gimp', 'libreoffice', 'audacity', 'dbeaver'];
  }

  private async seedFilesystem(vfs: VirtualFileSystem, spec: ComputerSpec): Promise<void> {
    const home = spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
    for (const directory of spec.os === 'windows'
      ? ['/C/Windows/System32', '/C/Program Files', `${home}/Desktop`, `${home}/Documents`, `${home}/Downloads`]
      : ['/bin', '/etc', '/usr/bin', '/usr/local/bin', '/Applications', `${home}/Desktop`, `${home}/Documents`, `${home}/Downloads`]) await vfs.mkdir(directory);
    await vfs.writeFile(`${home}/Desktop/network-demo.md`, `# seed network demo\n\nThis file is stored as an inode blob and served over the virtual TCP/IP fabric.\nHost: ${spec.hostname}\nAddress: ${spec.ipv4}\n`);
    await vfs.writeFile(`${home}/Documents/trajectory-task.txt`, 'open a terminal, inspect dns, fetch the team dashboard, and save the result.\n');
    if (spec.id === 'ubuntu-dev') {
      await vfs.mkdir(`${home}/site`);
      await vfs.writeFile(`${home}/site/index.html`, `<!doctype html>
<html><head><title>seed ops</title>
<style>body{font:16px system-ui;background:#0b1020;color:#eef;padding:48px}b{color:#77e0b5}.card{padding:28px;border:1px solid #27345b;border-radius:18px;background:#111a31;max-width:720px}</style>
</head><body><div class="card">
<small>INTRANET.SEEDED.LOCAL</small>
<h1>factory control plane</h1>
<p><b>all systems nominal</b> · 3 computers · 7 virtual services</p>
<p>served from ubuntu-dev through the simulated network fabric.</p>
</div></body></html>`);
    }
  }

  private registerSeedServices(): void {
    const registry = this.computers.get('seed-registry')!;
    const registryPid = registry.processes.spawn({ executable: 'app-store-registry', ppid: 1, cwd: '/srv/registry', listeningPorts: [443], memoryBytes: 24 * 1024 * 1024 }).pid;
    this.network.registerService({ id: 'app-store-registry', computerId: 'seed-registry', host: 'appstore.seed.local', port: 443, protocol: 'https', pid: registryPid, handle: async (requestPath) => ({ status: 200, headers: { 'content-type': 'application/json', server: 'seed-registry/1.0' }, body: JSON.stringify(requestPath.startsWith('/apps/') ? appCatalog.find((item) => item.id === requestPath.split('/').at(-1)) ?? null : appCatalog, null, 2) }) });
    const slackPid = registry.processes.spawn({ executable: 'collab-service', ppid: 1, cwd: '/srv/collab', listeningPorts: [443], memoryBytes: 16 * 1024 * 1024 }).pid;
    this.network.registerService({ id: 'collab', computerId: 'seed-registry', host: 'collab.seed.local', port: 443, protocol: 'https', pid: slackPid, handle: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace: 'Seed Engineering', channels: ['general', 'agent-runs', 'factory-floor'], unread: 3 }) }) });
    const gitPid = registry.processes.spawn({ executable: 'seed-git-http-backend', ppid: 1, cwd: '/srv/git', listeningPorts: [9418], memoryBytes: 18 * 1024 * 1024 }).pid;
    this.network.registerService({ id: 'git-host', computerId: 'seed-registry', host: 'git.seed.local', port: 9418, protocol: 'http', pid: gitPid, handle: async (requestPath) => ({ status: 200, headers: { 'content-type': 'application/json', server: 'seed-git/2.48' }, body: JSON.stringify({ path: requestPath, repository: 'seed/example', refs: { main: '4d3c2b1' }, protocol: 'smart-http' }) }) });
    const ubuntu = this.computers.get('ubuntu-dev')!;
    const home = '/home/agent/site';
    const webPid = ubuntu.processes.spawn({ executable: 'seed-httpd', argv: ['8080', home], ppid: 1, cwd: home, listeningPorts: [8080], memoryBytes: 6 * 1024 * 1024 }).pid;
    this.network.registerService({ id: 'intranet', computerId: 'ubuntu-dev', host: 'intranet.seed.local', port: 8080, protocol: 'http', pid: webPid, handle: async (requestPath) => {
      try { return { status: 200, headers: { 'content-type': 'text/html', server: 'seed-httpd/1.0' }, body: await ubuntu.vfs.readFile(`${home}/${requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '')}`) }; }
      catch { return { status: 404, headers: { 'content-type': 'text/plain', server: 'seed-httpd/1.0' }, body: '404 not found' }; }
    }});
  }

  private seedCollaboration(): void {
    const values: Array<[string, string, string]> = [
      ['Ada Kernel', 'mac-studio', 'cross-os trajectory suite passed on all three displays.'],
      ['seedbot', 'ubuntu-dev', 'ubuntu-dev is serving the factory control plane at intranet.seed.local:8080.'],
      ['Jacob', 'win-workstation', 'capture the packet trace and the app-store install flow too.'],
    ];
    for (const [author, computerId, text] of values) this.collaboration.push({ id: randomUUID(), channel: 'agent-runs', author, computerId, text, at: new Date().toISOString() });
  }

  postCollaborationMessage(computerId: string, channel: string, author: string, text: string): CollaborationMessage {
    this.requireComputer(computerId);
    const message: CollaborationMessage = { id: randomUUID(), computerId, channel, author, text, at: new Date().toISOString() };
    this.collaboration.push(message);
    this.trajectory.record({ computerId, actor: 'human', kind: 'network', action: 'collaboration.message.send', target: `collab.seed.local/${channel}`, data: { messageId: message.id, bytes: Buffer.byteLength(text) } });
    return structuredClone(message);
  }

  async installApp(computerId: string, appId: string, silent = false): Promise<InstalledApp> {
    const computer = this.requireComputer(computerId);
    const manifest = appCatalog.find((item) => item.id === appId);
    if (!manifest || !manifest.supportedOS.includes(computer.spec.os)) throw new Error(`app ${appId} is unavailable for ${computer.spec.os}`);
    const existing = computer.installedApps.get(appId);
    if (existing) return structuredClone(existing);
    if (!silent && this.network.resolve('appstore.seed.local')) {
      const registryResponse = await this.network.request(computerId, `https://appstore.seed.local/apps/${appId}`);
      if (registryResponse.status !== 200 || !JSON.parse(registryResponse.body)?.id) throw new Error(`registry rejected app ${appId}`);
    }
    const installPath = computer.spec.os === 'macos' ? `/Applications/${manifest.name}.app` : computer.spec.os === 'windows' ? `/C/Program Files/${manifest.name}` : `/opt/${manifest.id}`;
    await computer.vfs.mkdir(installPath);
    await computer.vfs.writeFile(`${installPath}/manifest.json`, JSON.stringify(manifest, null, 2));
    await computer.vfs.writeFile(`${installPath}/entrypoint.seed`, `${manifest.entrypoint}\nsource=${manifest.packagePath}\n`);
    const installed: InstalledApp = { ...manifest, installedAt: new Date().toISOString(), installPath };
    computer.installedApps.set(appId, installed);
    if (!silent) this.trajectory.record({ computerId, actor: 'human', kind: 'app', action: 'app.install', target: appId, data: { installPath } });
    return structuredClone(installed);
  }

  async execute(computerId: string, command: string): Promise<ShellResult> {
    const computer = this.requireComputer(computerId);
    const result = await computer.shell.execute(command);
    this.trajectory.record({ computerId, actor: 'agent', kind: 'process', action: 'shell.result', data: { command, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } });
    return result;
  }

  async http(computerId: string, url: string): Promise<VirtualHttpResponse> {
    const response = await this.network.request(computerId, url);
    this.trajectory.record({ computerId, actor: 'human', kind: 'network', action: 'browser.navigate', target: url, data: { status: response.status, traceId: response.traceId } });
    return response;
  }

  listFiles(computerId: string, input?: string) {
    const computer = this.requireComputer(computerId);
    const home = computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
    return computer.vfs.list(input ?? `${home}/Desktop`);
  }

  record(event: Omit<TrajectoryEvent, 'sequence' | 'at' | 'runId'>): TrajectoryEvent { return this.trajectory.record(event); }

  snapshot(): SimulationSnapshot {
    const computers: ComputerSnapshot[] = [...this.computers.values()].map((computer) => ({
      spec: computer.spec, bootedAt: new Date(computer.bootedAt).toISOString(), uptimeMs: Date.now() - computer.bootedAt,
      processes: computer.processes.list(), sockets: this.network.listSockets(computer.spec.id), installedApps: [...computer.installedApps.values()],
      packages: computer.software.listPackages(), repositories: computer.software.listRepositories(),
    }));
    return { runId: this.runId, now: new Date().toISOString(), computers, dns: this.network.listDns(), packets: this.network.listPackets(), gateways: structuredClone(this.network.gateways), appCatalog: structuredClone(appCatalog), collaboration: structuredClone(this.collaboration), trajectoryLength: this.trajectory.length };
  }

  getVfs(computerId: string): VirtualFileSystem { return this.requireComputer(computerId).vfs; }
  getPrompt(computerId: string): string { return this.requireComputer(computerId).shell.prompt(); }
  private requireComputer(id: string): ComputerRuntime { const computer = this.computers.get(id); if (!computer) throw new Error(`unknown computer: ${id}`); return computer; }
}
