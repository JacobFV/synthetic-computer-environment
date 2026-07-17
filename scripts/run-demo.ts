import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SimulationRuntime } from '@seed/kernel';

const runtime = new SimulationRuntime({ stateRoot: '.state', runId: process.env.SEED_RUN_ID ?? 'run-demo' });
await runtime.initialize();

const steps = [
  ['mac-studio', 'nslookup appstore.seed.local'],
  ['mac-studio', 'curl https://appstore.seed.local/apps/chatgpt | grep name'],
  ['win-workstation', 'iwr http://intranet.seed.local:8080/ | grep nominal'],
  ['ubuntu-dev', 'ss'],
  ['ubuntu-dev', 'echo cross-os-ok > ~/Desktop/demo-result.txt'],
] as const;

const results = [];
for (const [computerId, command] of steps) results.push({ computerId, command, result: await runtime.execute(computerId, command) });
const snapshot = runtime.snapshot();
const evidence = {
  runId: runtime.runId,
  results,
  topology: snapshot.computers.map((computer) => ({ id: computer.spec.id, os: computer.spec.os, ipv4: computer.spec.ipv4, processes: computer.processes.length, apps: computer.installedApps.length })),
  dns: snapshot.dns,
  sockets: snapshot.computers.flatMap((computer) => computer.sockets),
  packets: snapshot.packets,
  gateways: snapshot.gateways,
  trajectory: { events: runtime.trajectory.length, sha256: runtime.trajectory.digest() },
};

await mkdir('artifacts/evidence', { recursive: true });
await writeFile(path.resolve('artifacts/evidence/demo-run.json'), JSON.stringify(evidence, null, 2));
await writeFile(path.resolve('artifacts/evidence/demo-trajectory.jsonl'), runtime.trajectory.jsonl());
console.log(JSON.stringify(evidence, null, 2));
