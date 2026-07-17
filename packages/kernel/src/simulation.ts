import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  AppLaunchRequest, AppManifest, CollaborationPollResult, CollaborationServiceId, ComputerSnapshot, ComputerSpec,
  HostExecutionResult, HostExecutionRule, InstalledApp, OSKind, SimulationComputerTemplate, SimulationServiceSpec,
  SimulationSnapshot, SimulationTopology, TrajectoryEvent, VirtualHttpResponse,
} from '@seed/protocol';
import { appCatalog } from '@seed/catalog';
import { HostExecutionGateway, SeedApplicationRuntime, seedJavaScriptBundle } from './application.js';
import { createSeedCollaborationServices, type CollaborationService } from './collaboration.js';
import { InternetFabric } from './network.js';
import { ProcessManager } from './processes.js';
import { ShellSession, type ShellResult } from './shell.js';
import { TrajectoryRecorder } from './trajectory.js';
import { VirtualFileSystem } from './vfs.js';
import { SoftwareEnvironment, type GitRemoteSnapshot } from './software.js';

interface ComputerRuntime {
  spec: ComputerSpec;
  bootedAt: number;
  vfs: VirtualFileSystem;
  processes: ProcessManager;
  shell: ShellSession;
  software: SoftwareEnvironment;
  applications: SeedApplicationRuntime;
  installedApps: Map<string, InstalledApp>;
}

export interface SimulationOptions {
  topology: SimulationTopology;
  stateRoot?: string;
  runId?: string;
  hostExecutionRules?: HostExecutionRule[];
}

const runStamp = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
export class SimulationRuntime {
  readonly runId: string;
  readonly stateRoot: string;
  readonly topology: SimulationTopology;
  readonly network = new InternetFabric();
  readonly trajectory: TrajectoryRecorder;
  readonly hostExecution: HostExecutionGateway;
  private readonly computers = new Map<string, ComputerRuntime>();
  private readonly collaborationServices: ReturnType<typeof createSeedCollaborationServices>;
  private readonly gitRemotes = new Map<string, GitRemoteSnapshot>();
  private readonly genericServiceState = new Map<string, Array<Record<string, unknown>>>();

  constructor(options: SimulationOptions) {
    this.topology = structuredClone(options.topology);
    this.assertTopology();
    this.runId = options.runId ?? `run-${runStamp()}`;
    this.stateRoot = path.resolve(options.stateRoot ?? '.state');
    this.trajectory = new TrajectoryRecorder(this.runId);
    this.hostExecution = new HostExecutionGateway(options.hostExecutionRules ?? []);
    this.collaborationServices = createSeedCollaborationServices({
      slack: this.topology.services.find((service) => service.id === 'slack')?.host,
      teams: this.topology.services.find((service) => service.id === 'teams')?.host,
    });
  }

  async initialize(): Promise<void> {
    this.gitRemotes.set('/seed/example.git', { branches: {}, commits: [] });
    for (const computer of this.topology.computers) await this.createComputer(computer);
    for (const service of this.topology.services) this.network.addDns(service.host, service.ipv4);
    for (const gateway of this.topology.gateways) this.network.addGateway(gateway);
    this.registerSeedServices();
    this.seedCollaboration();
    this.trajectory.record({ actor: 'system', kind: 'snapshot', action: 'runtime.initialized', data: { topologyId: this.topology.id, topologyVersion: this.topology.version, computers: this.topology.computers.length } });
  }

  private async createComputer(template: SimulationComputerTemplate): Promise<void> {
    const spec = template.spec;
    const vfs = new VirtualFileSystem(this.stateRoot, this.runId, spec);
    await vfs.initialize();
    await this.seedFilesystem(vfs, spec);
    const processes = new ProcessManager(spec.id);
    const home = spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
    processes.boot(spec.os === 'windows' ? 'System' : spec.os === 'macos' ? 'launchd' : 'systemd', home, { HOSTNAME: spec.hostname });
    for (const daemon of this.daemonsFor(spec.os)) processes.spawn({ executable: daemon, cwd: '/', ppid: 1, memoryBytes: 8 * 1024 * 1024 });
    this.network.attach(spec, this.topology.network.domain);
    const installedApps = new Map<string, InstalledApp>();
    const software = new SoftwareEnvironment(spec, vfs, processes, {
      fetch: (url) => this.fetchGitRemote(spec.id, url),
      push: (url, branch, commits, expectedHead) => this.pushGitRemote(spec.id, url, branch, commits, expectedHead),
    });
    await software.initialize();
    const runtime = {} as ComputerRuntime;
    const shell = new ShellSession({ spec, vfs, processes, network: this.network, software, listApps: () => [...installedApps.values()], catalog: () => appCatalog, install: (appId) => this.installApp(spec.id, appId), onAction: (action, data) => this.trajectory.record({ computerId: spec.id, actor: 'agent', kind: 'keyboard', action, data }) });
    const applications = new SeedApplicationRuntime({
      spec, vfs, processes, network: this.network, software,
      installedApp: (appId) => installedApps.get(appId),
      executeShell: (command) => shell.execute(command),
      serviceOperation: (app, request) => this.executeAppServiceOperation(spec.id, app, request),
    });
    Object.assign(runtime, { spec, bootedAt: Date.now(), vfs, processes, shell, software, applications, installedApps });
    this.computers.set(spec.id, runtime);
    for (const id of [...template.systemAppIds, ...template.thirdPartyAppIds]) await this.installApp(spec.id, id, true);
  }

  private daemonsFor(os: OSKind): string[] {
    if (os === 'windows') return ['smss.exe', 'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'dwm.exe', 'explorer.exe'];
    if (os === 'macos') return ['kernel_task', 'WindowServer', 'loginwindow', 'cfprefsd', 'mDNSResponder', 'Finder'];
    return ['systemd-journald', 'systemd-networkd', 'NetworkManager', 'gdm3', 'gnome-shell', 'pipewire'];
  }

  private async seedFilesystem(vfs: VirtualFileSystem, spec: ComputerSpec): Promise<void> {
    const home = spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
    for (const directory of spec.os === 'windows'
      ? ['/C/Windows/System32', '/C/Program Files', `${home}/Desktop`, `${home}/Documents`, `${home}/Downloads`]
      : ['/bin', '/etc', '/usr/bin', '/usr/local/bin', '/Applications', `${home}/Desktop`, `${home}/Documents`, `${home}/Downloads`]) await vfs.mkdir(directory);
    await vfs.writeFile(`${home}/Desktop/network-demo.md`, `# seed network demo\n\nThis file is stored as an inode blob and served over the virtual TCP/IP fabric.\nHost: ${spec.hostname}\nAddress: ${spec.ipv4}\n`);
    await vfs.writeFile(`${home}/Documents/trajectory-task.txt`, 'open a terminal, inspect dns, fetch the team dashboard, and save the result.\n');
    await vfs.writeFile(`${home}/Documents/research-note.pdf`, '%PDF-SEED-1.0\nCausal fidelity in a browser-native computer\nPages: 4\nThis deterministic fixture is opened through the application runtime and stored as an inode blob.\n%%EOF\n');
    const intranet = this.topology.services.find((service) => service.kind === 'intranet' && service.computerId === spec.id);
    if (intranet) {
      await vfs.mkdir(`${home}/site`);
      await vfs.writeFile(`${home}/site/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>seed ops</title>
<style>
  :root{color-scheme:dark;font:15px Inter,ui-sans-serif,system-ui,sans-serif;background:#07111f;color:#eaf3ff}
  *{box-sizing:border-box}body{margin:0;min-height:100vh;padding:clamp(24px,6vw,56px);background:radial-gradient(circle at 80% 0,#173a55 0,transparent 42%),#07111f}
  main{max-width:900px;margin:auto}.eyebrow{display:flex;align-items:center;gap:9px;color:#8db6d1;font:700 11px ui-monospace,monospace;letter-spacing:.13em}.eyebrow i{width:8px;height:8px;border-radius:50%;background:#7d8da0;box-shadow:0 0 0 4px #7d8da022}
  h1{margin:20px 0 8px;font-size:clamp(30px,5vw,54px);letter-spacing:-.05em}p{color:#b6c7d7;line-height:1.55}.nominal{color:#72e6b4;font-weight:760}
  .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;margin-top:28px}.panel{border:1px solid #274059;background:#0d1b2bcc;border-radius:12px;padding:22px;box-shadow:0 18px 60px #0005}
  .runtime{display:flex;align-items:center;gap:12px;margin-bottom:18px}.runtime-mark{display:grid;place-items:center;width:44px;height:44px;border-radius:10px;background:#182b40;color:#8fa3b8;font-size:20px}.runtime-copy{display:flex;flex-direction:column;gap:3px}.runtime-copy b{font-size:16px}.runtime-copy span{color:#8fa3b8;font:12px ui-monospace,monospace}
  html.js-running .runtime-mark{background:#123b31;color:#72e6b4;box-shadow:0 0 0 1px #72e6b455,0 0 30px #42d79b33}html.js-running .runtime-copy b{color:#72e6b4}
  button{border:0;border-radius:8px;background:#eaf3ff;color:#07111f;padding:11px 15px;font:750 13px inherit;cursor:pointer}button:active{transform:translateY(1px)}.proof-row{display:flex;align-items:center;gap:12px}.count{min-width:92px;color:#72e6b4;font:700 12px ui-monospace,monospace}
  canvas{display:block;width:100%;height:128px;border-radius:8px;background:#07111f}.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.facts span{padding:10px;border-radius:7px;background:#122337;color:#91a8bc;font:11px ui-monospace,monospace}.facts b{display:block;color:#eef5ff;font-size:14px;margin-bottom:3px}
  @media(max-width:680px){.grid{grid-template-columns:1fr}}
</style>
</head><body><main>
<div class="eyebrow"><i></i>${intranet.host.toUpperCase()} · VFS-HOSTED DOCUMENT</div>
<h1>factory control plane</h1>
<p><span class="nominal">all systems nominal</span> · ${this.topology.computers.filter((computer) => computer.spec.displays.length).length} display computers · ${this.topology.services.length} virtual services. Served from <b>${spec.id}</b> through the simulated DNS and TCP/IP fabric.</p>
<section class="grid">
  <div class="panel" id="javascript-proof">
    <div class="runtime"><div class="runtime-mark">JS</div><div class="runtime-copy"><b id="js-runtime-status" data-state="pending">JavaScript waiting for browser engine</b><span id="js-runtime-uptime">booting…</span></div></div>
    <div class="proof-row"><button id="run-javascript" type="button">Run JavaScript again</button><output class="count" id="js-execution-count">0 executions</output></div>
  </div>
  <div class="panel"><canvas id="execution-canvas" width="520" height="128" aria-label="JavaScript-rendered execution graph"></canvas><div class="facts"><span><b>HTTP 200</b>virtual service</span><span><b>DOM + Canvas</b>browser APIs</span><span><b id="timer-value">0.0s</b>live timer</span></div></div>
</section>
</main><script>
(() => {
  'use strict';
  const status = document.getElementById('js-runtime-status');
  const count = document.getElementById('js-execution-count');
  const timer = document.getElementById('timer-value');
  const uptime = document.getElementById('js-runtime-uptime');
  const canvas = document.getElementById('execution-canvas');
  const context = canvas.getContext('2d');
  const started = performance.now();
  let executions = 0;
  const paint = () => {
    executions += 1;
    document.documentElement.classList.add('js-running');
    status.dataset.state = 'executed';
    status.textContent = 'JavaScript executed in real Chromium';
    count.value = executions + (executions === 1 ? ' execution' : ' executions');
    context.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#39d399'); gradient.addColorStop(1, '#54a9ff');
    context.strokeStyle = gradient; context.lineWidth = 4; context.beginPath();
    for (let x = 0; x <= canvas.width; x += 8) {
      const y = 68 + Math.sin(x / 38 + executions * .7) * 27 + Math.cos(x / 17) * 8;
      if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
  };
  document.getElementById('run-javascript').addEventListener('click', paint);
  paint();
  setInterval(() => {
    const seconds = (performance.now() - started) / 1000;
    timer.textContent = seconds.toFixed(1) + 's';
    uptime.textContent = 'sandboxed runtime active · ' + seconds.toFixed(1) + ' seconds';
  }, 100);
  window.__seedBrowserProof = { engine: 'chromium', isolated: true, run: paint };
})();
</script></body></html>`);
    }
  }

  private registerSeedServices(): void {
    const edgePids = new Map<string, number>();
    const edgePidFor = (service: SimulationServiceSpec): number => {
      const key = `${service.computerId}:${service.port}`;
      const existing = edgePids.get(key);
      if (existing) return existing;
      const host = this.requireComputer(service.computerId);
      const pid = host.processes.spawn({ executable: 'seed-edge-proxy', ppid: 1, cwd: '/srv/edge', listeningPorts: [service.port], memoryBytes: 20 * 1024 * 1024 }).pid;
      edgePids.set(key, pid);
      return pid;
    };
    const httpProtocol = (service: SimulationServiceSpec): 'http' | 'https' => {
      if (service.protocol !== 'http' && service.protocol !== 'https') throw new Error(`${service.id}: ${service.protocol} cannot host an HTTP service`);
      return service.protocol;
    };

    const dns = this.topology.services.find((service) => service.kind === 'dns');
    if (dns) this.requireComputer(dns.computerId).processes.spawn({ executable: 'seed-dnsd', ppid: 1, cwd: '/srv/dns', listeningPorts: [dns.port], memoryBytes: 8 * 1024 * 1024 });

    for (const service of this.topology.services.filter((candidate) => candidate.kind === 'app-registry')) {
      const os = service.targetOS!;
      const registry = this.requireComputer(service.computerId);
      const edgePid = edgePidFor(service);
      registry.processes.spawn({ executable: `${service.id}-registry`, ppid: 1, cwd: `/srv/registries/${service.id}`, memoryBytes: 18 * 1024 * 1024 });
      this.network.registerService({ id: service.id, computerId: service.computerId, host: service.host, port: service.port, protocol: httpProtocol(service), pid: edgePid, handle: async (requestPath) => {
        const appId = requestPath.match(/^\/apps\/([^/?]+)/)?.[1];
        const manifest = appId ? appCatalog.find((item) => item.id === appId && item.supportedOS.includes(os)) : undefined;
        const value = appId
          ? manifest ? this.packageDescriptor(manifest) : null
          : appCatalog.filter((item) => item.supportedOS.includes(os));
        return { status: appId && !manifest ? 404 : 200, headers: { 'content-type': 'application/json', server: `${service.id}/2.0` }, body: JSON.stringify(value, null, 2) };
      }});
    }

    for (const service of this.collaborationServices.values()) {
      const endpoint = this.topology.services.find((candidate) => candidate.id === service.id && candidate.kind === 'collaboration');
      if (!endpoint) continue;
      this.registerCollaborationService(this.requireComputer(endpoint.computerId), service, edgePidFor(endpoint), endpoint);
    }

    const git = this.topology.services.find((service) => service.kind === 'git');
    if (git) {
      const gitHost = this.requireComputer(git.computerId);
      gitHost.processes.spawn({ executable: 'seed-git-http-backend', ppid: 1, cwd: '/srv/git', memoryBytes: 18 * 1024 * 1024 });
      this.network.registerService({ id: git.id, computerId: git.computerId, host: git.host, port: git.port, protocol: httpProtocol(git), pid: edgePidFor(git), handle: async (requestPath, method, body) => {
      const url = new URL(requestPath, `${git.protocol}://${git.host}`);
      const repositoryPath = url.pathname.replace(/^\/api\/repos/, '').replace(/\/(push|fetch)$/, '') || '/seed/example.git';
      const state = this.gitRemotes.get(repositoryPath);
      if (!state) return { status: 404, headers: { 'content-type': 'application/json', server: 'seed-git/2.48' }, body: JSON.stringify({ error: 'repository not found' }) };
      if (method === 'POST' && url.pathname.endsWith('/push')) {
        const input = JSON.parse(body ?? '{}') as { branch?: string; commits?: GitRemoteSnapshot['commits']; expectedHead?: string };
        const branch = input.branch ?? 'main';
        const current = state.branches[branch];
        if (input.expectedHead && current && input.expectedHead !== current) return { status: 409, headers: { 'content-type': 'application/json', server: 'seed-git/2.48' }, body: JSON.stringify({ error: 'non-fast-forward', current }) };
        for (const commit of input.commits ?? []) if (!state.commits.some((candidate) => candidate.hash === commit.hash)) state.commits.push(commit);
        const head = input.commits?.[0]?.hash;
        if (head) state.branches[branch] = head;
      }
      return { status: 200, headers: { 'content-type': 'application/json', server: 'seed-git/2.48' }, body: JSON.stringify(state) };
    }});
    }

    const genericHost = this.topology.services.find((service) => service.kind === 'app-registry' && (service.protocol === 'http' || service.protocol === 'https'));
    for (const contract of appCatalog.flatMap((manifest) => manifest.serviceContracts)) {
      if (contract.host === '*' || contract.protocol === 'virtual' || this.network.resolve(contract.host) || !genericHost) continue;
      const registry = this.requireComputer(genericHost.computerId);
      const appPid = registry.processes.spawn({ executable: `seed-app-service:${contract.id}`, ppid: 1, cwd: `/srv/apps/${contract.id}`, listeningPorts: [contract.port], memoryBytes: 8 * 1024 * 1024 }).pid;
      this.genericServiceState.set(contract.host, []);
      this.network.registerService({ id: contract.id, computerId: genericHost.computerId, host: contract.host, port: contract.port, protocol: contract.protocol, pid: appPid, handle: async (requestPath, method, body) => {
        const events = this.genericServiceState.get(contract.host)!;
        if (method === 'POST') events.push({ id: createHash('sha256').update(`${contract.host}:${events.length}:${body ?? ''}`).digest('hex').slice(0, 16), path: requestPath, ...(JSON.parse(body ?? '{}') as Record<string, unknown>), at: new Date().toISOString() });
        return { status: method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json', server: `${contract.id}/1.0` }, body: JSON.stringify({ service: contract.id, path: requestPath, events }) };
      }});
    }

    const intranet = this.topology.services.find((service) => service.kind === 'intranet');
    if (intranet) {
      const host = this.requireComputer(intranet.computerId);
      const home = `${host.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent'}/site`;
      const webPid = host.processes.spawn({ executable: 'seed-httpd', argv: [String(intranet.port), home], ppid: 1, cwd: home, listeningPorts: [intranet.port], memoryBytes: 6 * 1024 * 1024 }).pid;
      this.network.registerService({ id: intranet.id, computerId: intranet.computerId, host: intranet.host, port: intranet.port, protocol: httpProtocol(intranet), pid: webPid, handle: async (requestPath) => {
      try { return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:", 'x-content-type-options': 'nosniff', server: 'seed-httpd/1.0' }, body: await host.vfs.readFile(`${home}/${requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '')}`) }; }
      catch { return { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': "default-src 'none'", 'x-content-type-options': 'nosniff', server: 'seed-httpd/1.0' }, body: '404 not found' }; }
    }});
    }
  }

  private seedCollaboration(): void {
    const mac = this.topology.computers.find((computer) => computer.spec.os === 'macos' && computer.spec.displays.length)?.spec.id ?? 'seed-client';
    const windows = this.topology.computers.find((computer) => computer.spec.os === 'windows' && computer.spec.displays.length)?.spec.id ?? 'seed-client';
    const server = this.topology.computers.find((computer) => computer.roles.includes('server-host'))?.spec.id ?? this.topology.computers[0]!.spec.id;
    const intranet = this.topology.services.find((service) => service.kind === 'intranet');
    const slack = this.collaborationServices.get('slack')!;
    slack.seed('agent-runs', 'Ada Kernel', mac, 'macOS and Ubuntu capture jobs completed; packet traces are attached to the run.');
    slack.seed('agent-runs', 'seedbot', server, `${server} is serving the factory control plane at ${intranet?.host ?? 'the intranet service'}${intranet ? `:${intranet.port}` : ''}.`);
    const teams = this.collaborationServices.get('teams')!;
    teams.seed('agent-runs', 'Windows Agent', windows, 'The Windows validation matrix is ready for review in this Teams channel.');
    teams.seed('general', 'Jacob', windows, 'Please keep the release checklist in Teams; Slack has its own workspace history.');
  }

  async postCollaborationMessage(computerId: string, serviceId: CollaborationServiceId, channelId: string, author: string, text: string) {
    const computer = this.requireComputer(computerId);
    if (!computer.installedApps.has(serviceId)) throw new Error(`${serviceId} is not installed on ${computerId}`);
    const service = this.requireCollaborationService(serviceId);
    const response = await this.network.request(computerId, `${this.collaborationOrigin(serviceId)}/api/channels/${channelId}/messages`, 'POST', JSON.stringify({ author, computerId, text }));
    if (response.status !== 201) throw new Error(`${serviceId} rejected message: ${response.body}`);
    const message = JSON.parse(response.body) as import('@seed/protocol').CollaborationMessage;
    this.trajectory.record({ computerId, actor: 'human', kind: 'network', action: `${serviceId}.message.send`, target: `${service.host}/${channelId}`, data: { serviceId, messageId: message.id, sequence: message.sequence, bytes: Buffer.byteLength(text) } });
    return message;
  }

  async pollCollaboration(computerId: string, serviceId: CollaborationServiceId, channelId: string, afterRevision = 0): Promise<CollaborationPollResult> {
    const computer = this.requireComputer(computerId);
    if (!computer.installedApps.has(serviceId)) throw new Error(`${serviceId} is not installed on ${computerId}`);
    this.requireCollaborationService(serviceId);
    const response = await this.network.request(computerId, `${this.collaborationOrigin(serviceId)}/api/channels/${channelId}/messages?after=${afterRevision}`);
    if (response.status !== 200) throw new Error(`${serviceId} polling failed: ${response.body}`);
    return JSON.parse(response.body) as CollaborationPollResult;
  }

  async installApp(computerId: string, appId: string, silent = false): Promise<InstalledApp> {
    const computer = this.requireComputer(computerId);
    const manifest = appCatalog.find((item) => item.id === appId);
    if (!manifest || !manifest.supportedOS.includes(computer.spec.os)) throw new Error(`app ${appId} is unavailable for ${computer.spec.os}`);
    const existing = computer.installedApps.get(appId);
    if (existing) return structuredClone(existing);
    const registryHost = this.registryFor(computer.spec.os);
    let descriptor = this.packageDescriptor(manifest);
    if (!silent && this.network.resolve(registryHost)) {
      const registryResponse = await this.network.request(computerId, `https://${registryHost}/apps/${appId}`);
      const value = JSON.parse(registryResponse.body) as ReturnType<SimulationRuntime['packageDescriptor']> | null;
      if (registryResponse.status !== 200 || value?.manifest.id !== appId) throw new Error(`registry rejected app ${appId}`);
      descriptor = value;
    }
    const installPath = computer.spec.os === 'macos' ? `/Applications/${manifest.name}.app` : computer.spec.os === 'windows' ? `/C/Program Files/${manifest.name}` : `/opt/${manifest.id}`;
    const home = computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
    const dataPath = computer.spec.os === 'macos' ? `${home}/Library/Application Support/${manifest.id}` : computer.spec.os === 'windows' ? `${home}/AppData/Roaming/${manifest.id}` : `${home}/.config/${manifest.id}`;
    const receiptPath = computer.spec.os === 'macos' ? `/var/db/receipts/${manifest.id}.seed.json` : computer.spec.os === 'windows' ? `/C/ProgramData/Seed/AppRepository/${manifest.id}.json` : `/var/lib/seed/apps/${manifest.id}.json`;
    await computer.vfs.mkdir(installPath);
    await computer.vfs.mkdir(dataPath);
    await computer.vfs.writeFile(`${installPath}/manifest.json`, JSON.stringify(descriptor.manifest, null, 2));
    await computer.vfs.writeFile(`${installPath}/package.seed.json`, JSON.stringify({ source: manifest.packagePath, registryHost, integrity: descriptor.integrity, runtime: manifest.runtime }, null, 2));
    await computer.vfs.writeFile(`${installPath}/${manifest.runtime.entryFile}`, descriptor.bundle);
    if (computer.spec.os === 'macos') {
      await computer.vfs.writeFile(`${installPath}/Contents/Info.plist`, `<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>seed.${manifest.id}</string><key>CFBundleVersion</key><string>${manifest.version}</string></dict></plist>`);
    } else if (computer.spec.os === 'windows') {
      await computer.vfs.writeFile(`${installPath}/${manifest.id}.exe.seed.json`, JSON.stringify({ subsystem: 'windows', entrypoint: manifest.runtime.entryFile, architecture: 'seed-js' }, null, 2));
    } else {
      await computer.vfs.writeFile(`/usr/share/applications/${manifest.id}.desktop`, `[Desktop Entry]\nName=${manifest.name}\nExec=seed-app ${manifest.id}\nType=Application\n`);
    }
    const installed: InstalledApp = { ...manifest, installedAt: new Date().toISOString(), installPath, dataPath, receiptPath, registryHost, installState: 'installed' };
    await computer.vfs.writeFile(receiptPath, JSON.stringify({ appId, version: manifest.version, installPath, dataPath, registryHost, integrity: descriptor.integrity, installedAt: installed.installedAt }, null, 2));
    const installedBundle = await computer.vfs.readFile(`${installPath}/${manifest.runtime.entryFile}`);
    if (createHash('sha256').update(installedBundle).digest('hex') !== descriptor.integrity) throw new Error(`package integrity verification failed for ${appId}`);
    computer.installedApps.set(appId, installed);
    if (!silent) this.trajectory.record({ computerId, actor: 'human', kind: 'app', action: 'app.install', target: appId, data: { installPath } });
    return structuredClone(installed);
  }

  async uninstallApp(computerId: string, appId: string): Promise<void> {
    const computer = this.requireComputer(computerId);
    const installed = computer.installedApps.get(appId);
    if (!installed) return;
    if (installed.system) throw new Error(`cannot uninstall system application ${appId}`);
    await computer.vfs.remove(installed.installPath);
    await computer.vfs.remove(installed.receiptPath);
    computer.installedApps.delete(appId);
    this.trajectory.record({ computerId, actor: 'human', kind: 'app', action: 'app.uninstall', target: appId, data: { preservedDataPath: installed.dataPath } });
  }

  async launchApp(computerId: string, appId: string, request: AppLaunchRequest) {
    const computer = this.requireComputer(computerId);
    const execution = await computer.applications.execute(appId, request);
    this.trajectory.record({ computerId, actor: 'human', kind: 'app', action: `${appId}.${request.operation}`, target: appId, data: { executionId: execution.id, status: execution.status } });
    return execution;
  }

  async executeHost(computerId: string, appId: string, executable: string, args: string[], cwd: string): Promise<HostExecutionResult> {
    this.requireComputer(computerId);
    try {
      const result = await this.hostExecution.execute(computerId, appId, executable, args, cwd);
      this.trajectory.record({ computerId, actor: 'system', kind: 'process', action: 'host-execution.complete', target: executable, data: { appId, args, cwd, exitCode: result.exitCode, timedOut: result.timedOut } });
      return result;
    } catch (error) {
      this.trajectory.record({ computerId, actor: 'system', kind: 'process', action: 'host-execution.denied', target: executable, data: { appId, cwd } });
      throw error;
    }
  }

  async execute(computerId: string, command: string): Promise<ShellResult> {
    const computer = this.requireComputer(computerId);
    const result = await computer.shell.execute(command);
    this.trajectory.record({ computerId, actor: 'agent', kind: 'process', action: 'shell.result', data: { command, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } });
    return result;
  }

  setGatewayEnabled(computerId: string, gatewayId: string, enabled: boolean) {
    this.requireComputer(computerId);
    const rule = this.network.setGatewayEnabled(gatewayId, enabled);
    this.trajectory.record({ computerId, actor: 'human', kind: 'network', action: 'gateway.policy.set', target: gatewayId, data: { enabled } });
    return rule;
  }

  terminateProcess(computerId: string, pid: number): { terminated: boolean; servicesStopped: string[] } {
    const computer = this.requireComputer(computerId);
    const process = computer.processes.get(pid);
    if (!process) throw new Error(`process ${pid} not found on ${computerId}`);
    const terminated = computer.processes.kill(pid);
    if (!terminated) throw new Error(`process ${pid} is protected and cannot be terminated`);
    const servicesStopped = this.network.unregisterServicesForProcess(computerId, pid);
    this.trajectory.record({ computerId, actor: 'human', kind: 'process', action: 'process.terminate', target: String(pid), data: { executable: process.executable, servicesStopped } });
    return { terminated, servicesStopped };
  }

  async http(computerId: string, url: string): Promise<VirtualHttpResponse> {
    const response = await this.network.request(computerId, url);
    this.trajectory.record({ computerId, actor: 'human', kind: 'network', action: 'browser.navigate', target: url, data: { status: response.status, traceId: response.traceId } });
    return response;
  }

  private registerCollaborationService(registry: ComputerRuntime, service: CollaborationService, edgePid: number, endpoint: SimulationServiceSpec): void {
    if (endpoint.protocol !== 'http' && endpoint.protocol !== 'https') throw new Error(`${endpoint.id}: collaboration endpoint must use HTTP`);
    registry.processes.spawn({ executable: `${service.id}-service`, ppid: 1, cwd: `/srv/${service.id}`, memoryBytes: 16 * 1024 * 1024 });
    this.network.registerService({ id: `${service.id}-service`, computerId: endpoint.computerId, host: endpoint.host, port: endpoint.port, protocol: endpoint.protocol, pid: edgePid, handle: async (requestPath, method, body) => {
      const url = new URL(requestPath, `${endpoint.protocol}://${endpoint.host}`);
      if (method === 'GET' && url.pathname === `/api/workspaces/${service.workspaceId}/channels`) return {
        status: 200, headers: { 'content-type': 'application/json', server: `${service.id}/1.0` }, body: JSON.stringify(service.snapshot().channels),
      };
      const channelId = url.pathname.match(/^\/api\/channels\/([^/]+)\/messages$/)?.[1];
      if (channelId && method === 'GET') return {
        status: 200, headers: { 'content-type': 'application/json', server: `${service.id}/1.0` }, body: JSON.stringify(service.poll(channelId, Number(url.searchParams.get('after') ?? 0))),
      };
      if (channelId && method === 'POST') {
        const input = JSON.parse(body ?? '{}') as { author?: string; computerId?: string; text?: string; threadId?: string };
        const message = service.post(channelId, { author: input.author ?? 'agent', computerId: input.computerId ?? 'unknown-client', text: input.text ?? '', threadId: input.threadId });
        return { status: 201, headers: { 'content-type': 'application/json', server: `${service.id}/1.0` }, body: JSON.stringify(message) };
      }
      return { status: 404, headers: { 'content-type': 'application/json', server: `${service.id}/1.0` }, body: JSON.stringify({ error: 'route not found' }) };
    }});
  }

  private async executeAppServiceOperation(computerId: string, app: InstalledApp, request: AppLaunchRequest): Promise<unknown> {
    const payload = request.payload ?? {};
    if (app.id === 'slack' || app.id === 'teams') {
      const serviceId = app.id;
      const channelId = String(payload.channelId ?? 'agent-runs');
      if (request.operation === 'list-channels' || request.operation === 'list-teams') return this.requireCollaborationService(serviceId).snapshot().channels;
      if (request.operation === 'poll-messages') return this.pollCollaboration(computerId, serviceId, channelId, Number(payload.afterRevision ?? 0));
      if (request.operation === 'send-message') return this.postCollaborationMessage(computerId, serviceId, channelId, String(payload.author ?? 'agent'), String(payload.text ?? ''));
      throw new Error(`${serviceId}: operation not implemented: ${request.operation}`);
    }
    const contract = app.serviceContracts.find((candidate) => candidate.protocol !== 'virtual');
    if (!contract) throw new Error(`${app.id} has no service adapter for ${request.operation}`);
    const response = await this.network.request(computerId, `${contract.protocol}://${contract.host}:${contract.port}/api/apps/${app.id}/operations/${request.operation}`, 'POST', JSON.stringify({ appId: app.id, operation: request.operation, payload, computerId }));
    if (response.status < 200 || response.status >= 300) throw new Error(`${app.id} service rejected ${request.operation}: ${response.body}`);
    return JSON.parse(response.body) as unknown;
  }

  private registryFor(os: OSKind): string {
    const registry = this.topology.services.find((service) => service.kind === 'app-registry' && service.targetOS === os);
    if (!registry) throw new Error(`topology ${this.topology.id} has no application registry for ${os}`);
    return registry.host;
  }

  private collaborationOrigin(id: CollaborationServiceId): string {
    const endpoint = this.topology.services.find((service) => service.id === id && service.kind === 'collaboration');
    if (!endpoint || (endpoint.protocol !== 'http' && endpoint.protocol !== 'https')) throw new Error(`topology ${this.topology.id} has no HTTP endpoint for ${id}`);
    const standardPort = endpoint.protocol === 'https' ? 443 : 80;
    return `${endpoint.protocol}://${endpoint.host}${endpoint.port === standardPort ? '' : `:${endpoint.port}`}`;
  }

  private packageDescriptor(manifest: AppManifest) {
    const bundle = seedJavaScriptBundle();
    return { manifest, bundle, integrity: createHash('sha256').update(bundle).digest('hex'), format: 'seed-app-package-v1' as const };
  }

  private requireCollaborationService(id: CollaborationServiceId): CollaborationService {
    const service = this.collaborationServices.get(id);
    if (!service) throw new Error(`unknown collaboration service: ${id}`);
    return service;
  }

  private async fetchGitRemote(computerId: string, rawUrl: string): Promise<GitRemoteSnapshot> {
    const url = new URL(rawUrl);
    const response = await this.network.request(computerId, `https://${url.host}/api/repos${url.pathname}`);
    if (response.status !== 200) throw new Error(`git fetch failed: ${response.body}`);
    return JSON.parse(response.body) as GitRemoteSnapshot;
  }

  private async pushGitRemote(computerId: string, rawUrl: string, branch: string, commits: GitRemoteSnapshot['commits'], expectedHead?: string): Promise<GitRemoteSnapshot> {
    const url = new URL(rawUrl);
    const response = await this.network.request(computerId, `https://${url.host}/api/repos${url.pathname}/push`, 'POST', JSON.stringify({ branch, commits, expectedHead }));
    if (response.status !== 200) throw new Error(`git push failed: ${response.body}`);
    return JSON.parse(response.body) as GitRemoteSnapshot;
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
      packages: computer.software.listPackages(), packageTransactions: computer.software.listPackageTransactions(), repositories: computer.software.listRepositories(),
    }));
    return {
      runId: this.runId, topology: { id: this.topology.id, version: this.topology.version }, now: new Date().toISOString(), computers, dns: this.network.listDns(), packets: this.network.listPackets(), gateways: structuredClone(this.network.gateways),
      appCatalog: structuredClone(appCatalog), collaborationServices: [...this.collaborationServices.values()].map((service) => service.snapshot()),
      appExecutions: [...this.computers.values()].flatMap((computer) => computer.applications.listExecutions()), hostExecutionRules: structuredClone(this.hostExecution.rules),
      trajectoryLength: this.trajectory.length,
    };
  }

  private assertTopology(): void {
    const findings: string[] = [];
    if (!this.topology.id.trim()) findings.push('topology id is empty');
    if (!this.topology.version.trim()) findings.push('topology version is empty');
    if (!this.topology.network.domain.trim()) findings.push('network domain is empty');
    if (!this.topology.computers.length) findings.push('topology has no computers');
    const computers = new Map<string, SimulationComputerTemplate>();
    const addresses = new Set<string>();
    const catalog = new Map(appCatalog.map((app) => [app.id, app]));
    for (const computer of this.topology.computers) {
      if (computers.has(computer.spec.id)) findings.push(`duplicate computer id ${computer.spec.id}`);
      if (addresses.has(computer.spec.ipv4)) findings.push(`duplicate computer address ${computer.spec.ipv4}`);
      computers.set(computer.spec.id, computer); addresses.add(computer.spec.ipv4);
      const installed = [...computer.systemAppIds, ...computer.thirdPartyAppIds];
      if (new Set(installed).size !== installed.length) findings.push(`${computer.spec.id} has duplicate installed app ids`);
      for (const appId of installed) {
        const app = catalog.get(appId);
        if (!app) findings.push(`${computer.spec.id} references unknown app ${appId}`);
        else if (!app.supportedOS.includes(computer.spec.os)) findings.push(`${appId} does not support ${computer.spec.os}`);
        else if (computer.systemAppIds.includes(appId) !== Boolean(app.system)) findings.push(`${computer.spec.id} misclassifies ${appId}`);
      }
    }
    const services = new Set<string>();
    for (const service of this.topology.services) {
      if (services.has(service.id)) findings.push(`duplicate service id ${service.id}`);
      services.add(service.id);
      const host = computers.get(service.computerId);
      if (!host) findings.push(`${service.id} references unknown computer ${service.computerId}`);
      else if (host.spec.ipv4 !== service.ipv4) findings.push(`${service.id} address does not match ${service.computerId}`);
      if (service.kind === 'app-registry' && !service.targetOS) findings.push(`${service.id} has no target OS`);
    }
    if (new Set(this.topology.gateways.map((gateway) => gateway.id)).size !== this.topology.gateways.length) findings.push('duplicate gateway ids');
    if (findings.length) throw new Error(`invalid simulation topology ${this.topology.id || '<unnamed>'}:\n- ${findings.join('\n- ')}`);
  }

  getVfs(computerId: string): VirtualFileSystem { return this.requireComputer(computerId).vfs; }
  getPrompt(computerId: string): string { return this.requireComputer(computerId).shell.prompt(); }
  private requireComputer(id: string): ComputerRuntime { const computer = this.computers.get(id); if (!computer) throw new Error(`unknown computer: ${id}`); return computer; }
}
