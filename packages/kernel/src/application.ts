import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import type {
  AppExecutionRecord,
  AppLaunchRequest,
  ComputerSpec,
  HostExecutionResult,
  HostExecutionRule,
  InstalledApp,
} from '@seed/protocol';
import type { InternetFabric } from './network.js';
import type { ProcessManager } from './processes.js';
import type { SoftwareEnvironment } from './software.js';
import type { VirtualFileSystem } from './vfs.js';

export interface ApplicationRuntimeDependencies {
  spec: ComputerSpec;
  vfs: VirtualFileSystem;
  processes: ProcessManager;
  network: InternetFabric;
  software: SoftwareEnvironment;
  executeShell(command: string): Promise<unknown>;
  installedApp(appId: string): InstalledApp | undefined;
  serviceOperation(app: InstalledApp, request: AppLaunchRequest): Promise<unknown>;
}

export function seedJavaScriptBundle(): string {
  return `'use strict';
module.exports = async function run(seed, request) {
  if (!request || typeof request.operation !== 'string') throw new Error('operation is required');
  return seed.dispatch(request.operation, request.payload || {});
};
`;
}

function calculate(expression: string): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  if (tokens.join('') !== expression.replace(/\s+/g, '')) throw new Error('unsupported calculator expression');
  const output: Array<number | string> = [];
  const operators: string[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  for (const token of tokens) {
    if (/^\d/.test(token)) output.push(Number(token));
    else if (token === '(') operators.push(token);
    else if (token === ')') {
      while (operators.length && operators.at(-1) !== '(') output.push(operators.pop()!);
      if (operators.pop() !== '(') throw new Error('unbalanced expression');
    } else {
      while (operators.length && operators.at(-1) !== '(' && precedence[operators.at(-1)!]! >= precedence[token]!) output.push(operators.pop()!);
      operators.push(token);
    }
  }
  while (operators.length) {
    const operator = operators.pop()!;
    if (operator === '(') throw new Error('unbalanced expression');
    output.push(operator);
  }
  const values: number[] = [];
  for (const token of output) {
    if (typeof token === 'number') values.push(token);
    else {
      const right = values.pop(); const left = values.pop();
      if (left === undefined || right === undefined) throw new Error('invalid expression');
      values.push(token === '+' ? left + right : token === '-' ? left - right : token === '*' ? left * right : left / right);
    }
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error('invalid calculation');
  return values[0]!;
}

export class SeedApplicationRuntime {
  private readonly executions: AppExecutionRecord[] = [];

  constructor(private readonly deps: ApplicationRuntimeDependencies) {}

  listExecutions(): AppExecutionRecord[] { return this.executions.map((record) => structuredClone(record)); }

  async execute(appId: string, request: AppLaunchRequest): Promise<AppExecutionRecord> {
    const app = this.deps.installedApp(appId);
    if (!app) throw new Error(`application is not installed: ${appId}`);
    if (!app.operations.includes(request.operation)) throw new Error(`${app.name} does not expose operation ${request.operation}`);
    const startedAt = new Date().toISOString();
    const record: AppExecutionRecord = {
      id: randomUUID(), computerId: this.deps.spec.id, appId, runtime: app.runtime.kind,
      operation: request.operation, startedAt, completedAt: startedAt, status: 'completed',
    };
    const process = this.deps.processes.spawn({
      executable: app.entrypoint, argv: [request.operation], cwd: app.dataPath, ppid: 1,
      memoryBytes: 12 * 1024 * 1024,
    });
    try {
      if (app.runtime.kind === 'seed-wasm') throw new Error('seed-wasm package requires an exported run function; no WASM bundle is installed');
      const result = app.runtime.kind === 'seed-js'
        ? await this.executeJavaScript(app, request)
        : await this.dispatch(app, request.operation, request.payload ?? {});
      record.result = structuredClone(result);
    } catch (error) {
      record.status = 'failed';
      record.error = error instanceof Error ? error.message : String(error);
    } finally {
      record.completedAt = new Date().toISOString();
      this.deps.processes.kill(process.pid);
      this.executions.push(record);
      if (this.executions.length > 500) this.executions.shift();
    }
    return structuredClone(record);
  }

  private async executeJavaScript(app: InstalledApp, request: AppLaunchRequest): Promise<unknown> {
    const entryPath = `${app.installPath}/${app.runtime.entryFile}`;
    const source = await this.deps.vfs.readFile(entryPath);
    const module = { exports: undefined as unknown };
    const context = createContext({ module, exports: {}, JSON, Object, Array, String, Number, Boolean, Promise }, {
      name: `${this.deps.spec.id}:${app.id}`,
      codeGeneration: { strings: false, wasm: false },
    });
    new Script(source, { filename: entryPath }).runInContext(context, { timeout: 50 });
    if (typeof module.exports !== 'function') throw new Error(`${entryPath} must export a function`);
    const sdk = Object.freeze({
      apiVersion: 1,
      app: Object.freeze({ id: app.id, version: app.version, capabilities: [...app.capabilities] }),
      dispatch: (operation: string, payload: Record<string, unknown>) => this.dispatch(app, operation, payload),
    });
    return (module.exports as (seed: typeof sdk, input: AppLaunchRequest) => Promise<unknown>)(sdk, structuredClone(request));
  }

  private async dispatch(app: InstalledApp, operation: string, payload: Record<string, unknown>): Promise<unknown> {
    if (!app.operations.includes(operation)) throw new Error(`operation denied by manifest: ${operation}`);
    if (['navigate', 'send-request'].includes(operation)) {
      const url = String(payload.url ?? '');
      if (!url) throw new Error('url is required');
      const response = await this.deps.network.request(this.deps.spec.id, url, String(payload.method ?? 'GET'), payload.body === undefined ? undefined : String(payload.body));
      await this.updateState(app, { lastUrl: url, lastStatus: response.status, updatedAt: new Date().toISOString() });
      return response;
    }
    if (operation === 'calculate') return { expression: String(payload.expression ?? ''), value: calculate(String(payload.expression ?? '')) };
    if (operation === 'execute') {
      const command = String(payload.command ?? '');
      if (!command) throw new Error('command is required');
      return this.deps.executeShell(command);
    }
    if (['open', 'open-file'].includes(operation) && payload.path) return { path: String(payload.path), content: await this.deps.vfs.readFile(String(payload.path)) };
    if (['save', 'save-as', 'edit'].includes(operation) && payload.path) {
      await this.deps.vfs.writeFile(String(payload.path), String(payload.content ?? ''));
      return { path: String(payload.path), bytes: Buffer.byteLength(String(payload.content ?? '')) };
    }
    if (operation === 'list' && payload.path) return this.deps.vfs.list(String(payload.path));
    if (app.id === 'slack' || app.id === 'teams') {
      const result = await this.deps.serviceOperation(app, { operation, payload });
      await this.updateState(app, { lastServiceOperation: operation, lastServiceResult: result, updatedAt: new Date().toISOString() });
      return result;
    }
    if (['status', 'stage', 'commit', 'branch', 'fetch', 'pull', 'push'].includes(operation) && app.entrypoint === 'app://git') {
      const args = Array.isArray(payload.args) ? payload.args.map(String) : [];
      return this.deps.software.gitCommand([operation, ...args], String(payload.cwd ?? app.dataPath));
    }
    if (['list', 'search', 'inspect', 'install', 'upgrade', 'remove'].includes(operation) && app.entrypoint === 'app://packages') {
      const manager = String(payload.manager ?? this.deps.software.supportedManagers()[0]);
      const verb = operation === 'inspect' ? 'info' : operation;
      const args = Array.isArray(payload.args) ? payload.args.map(String) : [verb, ...(payload.name ? [String(payload.name)] : [])];
      return this.deps.software.packageCommand(manager, args, String(payload.cwd ?? app.dataPath));
    }
    if (app.serviceContracts.some((contract) => contract.protocol !== 'virtual')) {
      const result = await this.deps.serviceOperation(app, { operation, payload });
      await this.updateState(app, { lastServiceOperation: operation, lastServiceResult: result, updatedAt: new Date().toISOString() });
      return result;
    }
    const state = await this.readState(app);
    const event = { id: randomUUID(), operation, payload: structuredClone(payload), at: new Date().toISOString() };
    const events = Array.isArray(state.events) ? state.events : [];
    events.push(event);
    await this.writeState(app, { ...state, events: events.slice(-200), lastOperation: operation, updatedAt: event.at });
    return { ok: true, event, stateRevision: events.length };
  }

  private async readState(app: InstalledApp): Promise<Record<string, unknown>> {
    try { return JSON.parse(await this.deps.vfs.readFile(`${app.dataPath}/state.json`)) as Record<string, unknown>; }
    catch { return { schema: app.runtime.stateSchema, events: [] }; }
  }

  private async updateState(app: InstalledApp, patch: Record<string, unknown>): Promise<void> {
    await this.writeState(app, { ...(await this.readState(app)), ...patch });
  }

  private async writeState(app: InstalledApp, value: Record<string, unknown>): Promise<void> {
    await this.deps.vfs.writeFile(`${app.dataPath}/state.json`, JSON.stringify(value, null, 2));
  }
}

export class HostExecutionGateway {
  constructor(readonly rules: HostExecutionRule[] = []) {}

  async execute(computerId: string, appId: string, executable: string, args: string[], cwd: string): Promise<HostExecutionResult> {
    const resolvedExecutable = path.resolve(executable);
    const resolvedCwd = path.resolve(cwd);
    const rule = this.rules.find((candidate) => candidate.enabled &&
      (candidate.computerIds === '*' || candidate.computerIds.includes(computerId)) &&
      candidate.appIds.includes(appId) && candidate.executables.map((item) => path.resolve(item)).includes(resolvedExecutable) &&
      candidate.cwdRoots.some((root) => resolvedCwd === path.resolve(root) || resolvedCwd.startsWith(`${path.resolve(root)}${path.sep}`)));
    if (!rule) throw new Error(`host execution denied for ${appId}: ${resolvedExecutable}`);
    return new Promise((resolve, reject) => {
      const child = spawn(resolvedExecutable, args, { cwd: resolvedCwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = ''; let timedOut = false; let total = 0;
      const collect = (kind: 'stdout' | 'stderr', chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > rule.maxOutputBytes) { child.kill('SIGKILL'); return; }
        if (kind === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
      };
      child.stdout.on('data', (chunk: Buffer) => collect('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk));
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, rule.timeoutMs);
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (exitCode) => { clearTimeout(timer); resolve({ exitCode, stdout, stderr, timedOut }); });
    });
  }
}
