import type { AppManifest, ComputerSpec, InstalledApp } from '@seed/protocol';
import type { InternetFabric } from './network.js';
import type { ProcessManager } from './processes.js';
import type { VirtualFileSystem } from './vfs.js';
import type { SoftwareEnvironment } from './software.js';

export interface ShellResult { stdout: string; stderr: string; exitCode: number; cwd: string; }

interface ShellDependencies {
  spec: ComputerSpec;
  vfs: VirtualFileSystem;
  processes: ProcessManager;
  network: InternetFabric;
  software: SoftwareEnvironment;
  listApps(): InstalledApp[];
  catalog(): AppManifest[];
  install(appId: string): Promise<InstalledApp>;
  onAction(action: string, data?: Record<string, unknown>): void;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quote) {
      if (char === quote) quote = ''; else if (char === '\\' && i + 1 < input.length) current += input[++i]; else current += char;
    } else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) { if (current) { tokens.push(current); current = ''; } }
    else current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

export class ShellSession {
  cwd: string;
  readonly history: string[] = [];
  private readonly env: Record<string, string>;

  constructor(private readonly deps: ShellDependencies) {
    this.cwd = deps.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
    this.env = {
      HOME: this.cwd, USER: 'agent', USERNAME: 'agent', HOSTNAME: deps.spec.hostname,
      SHELL: deps.spec.shell, PATH: deps.spec.os === 'windows' ? 'C:\\Windows\\System32;C:\\Program Files' : '/usr/local/bin:/usr/bin:/bin',
    };
  }

  prompt(): string {
    if (this.deps.spec.shell === 'powershell') return `PS ${this.displayPath(this.cwd)}> `;
    return `${this.env.USER}@${this.deps.spec.hostname}:${this.displayPath(this.cwd)}${this.env.USER === 'root' ? '#' : '$'} `;
  }

  private displayPath(value: string): string {
    if (this.deps.spec.os === 'windows') return value.replace(/^\/C/, 'C:').replaceAll('/', '\\');
    return value === this.env.HOME ? '~' : value.replace(`${this.env.HOME}/`, '~/');
  }

  private resolvePath(value: string): string {
    const home = this.env.HOME ?? '/';
    const expanded = value === '~' ? home : value.startsWith('~/') ? `${home}/${value.slice(2)}` : value;
    return this.deps.vfs.resolve(expanded, this.cwd);
  }

  async execute(line: string): Promise<ShellResult> {
    const trimmed = line.trim();
    if (!trimmed) return { stdout: '', stderr: '', exitCode: 0, cwd: this.cwd };
    this.history.push(trimmed);
    this.deps.onAction('shell.execute', { command: trimmed, cwd: this.cwd });
    let aggregate = '';
    let exitCode = 0;
    for (const statement of trimmed.split(/\s*;\s*/)) {
      const conditional = statement.split(/\s*&&\s*/);
      for (const command of conditional) {
        const result = await this.executePipeline(command);
        aggregate += `${aggregate && result.stdout ? '\n' : ''}${result.stdout}`;
        exitCode = result.exitCode;
        if (result.stderr) return { stdout: aggregate, stderr: result.stderr, exitCode, cwd: this.cwd };
        if (exitCode !== 0) break;
      }
    }
    return { stdout: aggregate, stderr: '', exitCode, cwd: this.cwd };
  }

  private async executePipeline(input: string): Promise<ShellResult> {
    const segments = input.split(/\s*\|\s*/);
    let piped = '';
    let result: ShellResult = { stdout: '', stderr: '', exitCode: 0, cwd: this.cwd };
    for (let i = 0; i < segments.length; i++) {
      let segment = segments[i]!;
      let redirect: string | undefined;
      const redirectMatch = segment.match(/\s*>\s*(.+)$/);
      if (redirectMatch) { redirect = redirectMatch[1]!.trim(); segment = segment.slice(0, redirectMatch.index).trim(); }
      result = await this.executeCommand(tokenize(segment), piped);
      if (result.exitCode !== 0) return result;
      piped = result.stdout;
      if (redirect) { await this.deps.vfs.writeFile(this.resolvePath(redirect), piped); result = { ...result, stdout: '' }; }
    }
    return result;
  }

  private ok(stdout = ''): ShellResult { return { stdout, stderr: '', exitCode: 0, cwd: this.cwd }; }
  private fail(stderr: string, exitCode = 1): ShellResult { return { stdout: '', stderr, exitCode, cwd: this.cwd }; }

  private async executeCommand(tokens: string[], stdin: string): Promise<ShellResult> {
    if (tokens.length === 0) return this.ok(stdin);
    const raw = tokens[0]!;
    const command = raw.toLowerCase();
    const args = tokens.slice(1);
    const executable = this.deps.processes.spawn({ executable: raw, argv: args, cwd: this.cwd, env: this.env, memoryBytes: 1024 * 1024 });
    try {
      if (['clear', 'cls'].includes(command)) return this.ok('\u001bc');
      if (command === 'help' || command === 'get-help') return this.ok([
        'filesystem  pwd/get-location  cd/set-location  ls/dir/get-childitem  cat/type/get-content  echo/write-output  mkdir/md  touch/new-item  rm/del/remove-item',
        'composition ;  &&  |  >  quotes  $ENV  cwd/history',
        'processes   ps/tasklist/get-process  kill/taskkill/stop-process  hostname  whoami  uname  ver',
        'network     ipconfig/ifconfig/ip addr  ping  nslookup/dig/resolve-dnsname  curl/wget/iwr  netstat/ss/get-nettcpconnection  serve',
        'git         init  clone  status  add  commit  log  branch  switch  checkout  remote  push  pull  fetch  diff  rev-parse  config',
        `packages    ${this.deps.software.supportedManagers().join('  ')}`,
        'ecosystem   apps  store [install]  gateway  history/get-history  env/set  date/get-date',
      ].join('\n'));
      if (command === 'pwd' || command === 'get-location') return this.ok(this.displayPath(this.cwd));
      if (command === 'cd' || command === 'set-location') {
        const next = this.resolvePath(args[0] ?? this.env.HOME ?? '/');
        if (this.deps.vfs.statSync(next)?.kind !== 'directory') return this.fail(`cd: no such directory: ${args[0] ?? ''}`);
        this.cwd = next;
        return this.ok();
      }
      if (command === 'ls' || command === 'dir' || command === 'get-childitem') {
        const target = this.resolvePath(args.find((arg) => !arg.startsWith('-')) ?? '.');
        return this.ok(this.deps.vfs.list(target).map((entry) => `${entry.inode.kind === 'directory' ? 'd' : '-'}${entry.inode.mode.toString(8).padStart(3, '0')}  ${String(entry.inode.size).padStart(7)}  ${entry.name}${entry.inode.kind === 'directory' ? '/' : ''}`).join('\n'));
      }
      if (command === 'cat' || command === 'type' || command === 'get-content') {
        if (!args[0]) return this.ok(stdin);
        return this.ok(await this.deps.vfs.readFile(this.resolvePath(args[0])));
      }
      if (command === 'echo' || command === 'write-output') return this.ok(args.join(' ').replace(/\$(\w+)/g, (_, key: string) => this.env[key] ?? ''));
      if (command === 'mkdir' || command === 'md') { for (const arg of args) await this.deps.vfs.mkdir(this.resolvePath(arg)); return this.ok(); }
      if (command === 'touch' || command === 'new-item') { if (!args[0]) return this.fail(`${raw}: missing path`); await this.deps.vfs.writeFile(this.resolvePath(args.at(-1)!), ''); return this.ok(); }
      if (['rm', 'del', 'erase', 'remove-item'].includes(command)) { for (const arg of args.filter((arg) => !arg.startsWith('-'))) await this.deps.vfs.remove(this.resolvePath(arg)); return this.ok(); }
      if (command === 'grep' || command === 'findstr' || command === 'select-string') {
        const pattern = args.at(-1) ?? '';
        return this.ok(stdin.split('\n').filter((line) => line.toLowerCase().includes(pattern.toLowerCase())).join('\n'));
      }
      if (command === 'wc' || command === 'measure-object') return this.ok(`${stdin.split('\n').length} ${stdin.trim().split(/\s+/).filter(Boolean).length} ${stdin.length}`);
      if (command === 'ps' || command === 'tasklist' || command === 'get-process') return this.ok(this.deps.processes.list().map((value) => `${String(value.pid).padStart(5)} ${String(value.ppid).padStart(5)} ${String(Math.round(value.memoryBytes / 1024)).padStart(8)}K ${value.state.padEnd(8)} ${value.executable}`).join('\n'));
      if (command === 'kill' || command === 'taskkill' || command === 'stop-process') {
        const pid = Number(args.find((arg) => /^\d+$/.test(arg)));
        return this.deps.processes.kill(pid) ? this.ok() : this.fail(`${raw}: process ${pid} not found or protected`);
      }
      if (command === 'hostname') return this.ok(this.deps.spec.hostname);
      if (command === 'whoami') return this.ok(this.deps.spec.os === 'windows' ? `${this.deps.spec.hostname}\\agent` : 'agent');
      if (command === 'uname') return this.ok(args.includes('-a') ? `Seed ${this.deps.spec.hostname} 26.0 ${this.deps.spec.os} ${process.arch} seed-kernel` : 'Seed');
      if (command === 'ver') return this.ok('Seed Microsoft Windows [Version 11.0.26100.4652]');
      if (['ifconfig', 'ipconfig'].includes(command) || (command === 'ip' && args[0] === 'addr')) return this.ok(`${this.deps.spec.os === 'windows' ? 'Ethernet adapter SeedNet' : 'seed0'}\n  inet ${this.deps.spec.ipv4}/24\n  gateway 10.42.0.1\n  dns 10.42.0.2\n  state UP`);
      if (command === 'ping') return this.ok(this.deps.network.ping(this.deps.spec.id, args.at(-1) ?? ''));
      if (['nslookup', 'dig', 'resolve-dnsname'].includes(command)) {
        const host = args.at(-1) ?? '';
        const address = this.deps.network.resolve(host);
        return address ? this.ok(`Server:  dns.seed.local\nAddress: 10.42.0.2\n\nName:    ${host}\nAddress: ${address}`) : this.fail(`** server can't find ${host}: NXDOMAIN`);
      }
      if (['curl', 'wget', 'invoke-webrequest', 'iwr'].includes(command)) {
        const url = args.find((arg) => /^(https?:\/\/|[\w.-]+(?::\d+)?\/)/.test(arg));
        if (!url) return this.fail(`${raw}: missing URL`);
        const response = await this.deps.network.request(this.deps.spec.id, url);
        return this.ok(args.includes('-i') ? `HTTP/1.1 ${response.status}\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\n')}\n\n${response.body}` : response.body);
      }
      if (['netstat', 'ss', 'get-nettcpconnection'].includes(command)) return this.ok(this.deps.network.listSockets(this.deps.spec.id).map((socket) => `${socket.protocol.toUpperCase().padEnd(5)} ${socket.localAddress}:${socket.localPort} ${socket.remoteAddress ?? '*'}:${socket.remotePort ?? '*'} ${socket.state}`).join('\n'));
      if (command === 'serve') {
        const port = Number(args[0] ?? 8080);
        const target = this.resolvePath(args[1] ?? '.');
        const hostname = args[2] ?? `${this.deps.spec.hostname}.seed.local`;
        const pid = this.deps.processes.spawn({ executable: 'seed-httpd', argv: [String(port), target], cwd: this.cwd, env: this.env, ppid: executable.pid, listeningPorts: [port], memoryBytes: 6 * 1024 * 1024 }).pid;
        this.deps.network.registerService({ id: `httpd-${pid}`, computerId: this.deps.spec.id, host: hostname, port, protocol: 'http', pid, handle: async (requestPath) => {
          try {
            const resolved = this.deps.vfs.statSync(target)?.kind === 'directory' ? `${target}/${requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '')}` : target;
            return { status: 200, headers: { 'content-type': resolved.endsWith('.html') ? 'text/html' : 'text/plain', server: 'seed-httpd/1.0' }, body: await this.deps.vfs.readFile(resolved) };
          } catch { return { status: 404, headers: { 'content-type': 'text/plain', server: 'seed-httpd/1.0' }, body: '404 not found' }; }
        }});
        return this.ok(`serving ${this.displayPath(target)} at http://${hostname}:${port} (pid ${pid})`);
      }
      if (command === 'apps') return this.ok(this.deps.listApps().map((item) => `${item.id.padEnd(16)} ${item.version.padEnd(10)} ${item.name}`).join('\n'));
      if (command === 'store') {
        if (args[0] === 'install' && args[1]) { const installed = await this.deps.install(args[1]); return this.ok(`installed ${installed.name} ${installed.version} → ${this.displayPath(installed.installPath)}`); }
        return this.ok(this.deps.catalog().filter((item) => item.supportedOS.includes(this.deps.spec.os)).map((item) => `${item.id.padEnd(16)} ${item.name.padEnd(24)} ${item.publisher}`).join('\n'));
      }
      if (command === 'gateway') return this.ok(this.deps.network.gateways.map((rule) => `${rule.enabled ? 'ALLOW' : 'DENY '} ${rule.name}: ${rule.protocols.join(',')} ${rule.hostnames.join(',')} ports=${rule.ports === '*' ? '*' : rule.ports.join(',')}`).join('\n'));
      if (command === 'history' || command === 'get-history') return this.ok(this.history.map((item, index) => `${String(index + 1).padStart(4)}  ${item}`).join('\n'));
      if (command === 'env' || command === 'set') return this.ok(Object.entries(this.env).map(([key, value]) => `${key}=${value}`).join('\n'));
      if (command === 'date' || command === 'get-date') return this.ok(new Date().toString());
      if (command === 'git') return this.ok(await this.deps.software.gitCommand(args, this.cwd));
      if (this.deps.software.supports(command)) return this.ok(await this.deps.software.packageCommand(command, args, this.cwd));
      return this.fail(`${raw}: command not found` , 127);
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error));
    } finally {
      this.deps.processes.kill(executable.pid);
    }
  }
}
