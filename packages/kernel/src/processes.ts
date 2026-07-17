import type { ProcessRecord } from '@seed/protocol';

export class ProcessManager {
  private nextPid = 100;
  private readonly records = new Map<number, ProcessRecord>();

  constructor(private readonly computerId: string) {}

  boot(initExecutable: string, cwd: string, env: Record<string, string>): ProcessRecord {
    const init = this.spawn({ executable: initExecutable, argv: [], cwd, env, ppid: 0, memoryBytes: 16 * 1024 * 1024 });
    this.nextPid = Math.max(this.nextPid, init.pid + 99);
    return init;
  }

  spawn(input: {
    executable: string; argv?: string[]; cwd?: string; env?: Record<string, string>;
    ppid?: number; memoryBytes?: number; listeningPorts?: number[];
  }): ProcessRecord {
    const record: ProcessRecord = {
      pid: this.records.size === 0 ? 1 : this.nextPid++,
      ppid: input.ppid ?? 1,
      computerId: this.computerId,
      executable: input.executable,
      argv: input.argv ?? [],
      cwd: input.cwd ?? '/',
      env: input.env ?? {},
      state: 'running',
      startedAt: new Date().toISOString(),
      cpuTimeMs: 0,
      memoryBytes: input.memoryBytes ?? 4 * 1024 * 1024,
      listeningPorts: input.listeningPorts ?? [],
    };
    this.records.set(record.pid, record);
    return { ...record };
  }

  kill(pid: number): boolean {
    const process = this.records.get(pid);
    if (!process || pid === 1) return false;
    process.state = 'stopped';
    this.records.delete(pid);
    return true;
  }

  list(): ProcessRecord[] { return [...this.records.values()].map((record) => ({ ...record })).sort((a, b) => a.pid - b.pid); }
  get(pid: number): ProcessRecord | undefined { const value = this.records.get(pid); return value ? { ...value } : undefined; }
  tick(deltaMs: number): void {
    for (const process of this.records.values()) if (process.state === 'running') process.cpuTimeMs += Math.max(1, Math.floor(deltaMs * 0.002));
  }
}
