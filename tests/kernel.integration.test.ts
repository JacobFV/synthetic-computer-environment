import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SimulationRuntime } from '@seed/kernel';

describe('seed ecosystem kernel', () => {
  it('boots all three display computers plus the registry service node', async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'seed-kernel-'));
    const runtime = new SimulationRuntime({ stateRoot, runId: 'run-test' });
    await runtime.initialize();
    const snapshot = runtime.snapshot();
    expect(snapshot.computers.filter((computer) => computer.spec.displays.length)).toHaveLength(3);
    expect(snapshot.computers.map((computer) => computer.spec.os)).toEqual(expect.arrayContaining(['macos', 'windows', 'ubuntu']));
    expect(snapshot.dns.find((record) => record.name === 'appstore.seed.local')?.value).toBe('10.42.0.2');
  });

  it('routes http between computers and records packet evidence', async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'seed-network-'));
    const runtime = new SimulationRuntime({ stateRoot, runId: 'run-network' });
    await runtime.initialize();
    const response = await runtime.http('win-workstation', 'http://intranet.seed.local:8080/');
    expect(response.status).toBe(200);
    expect(response.body).toContain('factory control plane');
    expect(runtime.snapshot().packets.some((packet) => packet.source === '10.42.0.20' && packet.protocol === 'http')).toBe(true);
  });

  it('persists virtual files as inode blobs with a path table', async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'seed-vfs-'));
    const runtime = new SimulationRuntime({ stateRoot, runId: 'run-vfs' });
    await runtime.initialize();
    const result = await runtime.execute('mac-studio', 'echo trajectory-data > ~/Desktop/capture.txt');
    expect(result.exitCode).toBe(0);
    const vfs = runtime.getVfs('mac-studio');
    const inode = vfs.statSync('/home/agent/Desktop/capture.txt');
    expect(inode?.kind).toBe('file');
    expect(await readFile(path.join(stateRoot, 'run-vfs', 'mac-studio', inode!.diskId, inode!.id), 'utf8')).toBe('trajectory-data');
    expect(vfs.hostLayout().paths['/home/agent/Desktop/capture.txt']).toBe(inode!.id);
    expect(await vfs.verifyContent()).toEqual([]);
  });

  it('uses separate shell dialects over one typed kernel', async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'seed-shell-'));
    const runtime = new SimulationRuntime({ stateRoot, runId: 'run-shell' });
    await runtime.initialize();
    expect((await runtime.execute('mac-studio', 'ps | grep WindowServer')).stdout).toContain('WindowServer');
    expect((await runtime.execute('win-workstation', 'Get-Process | findstr explorer')).stdout).toContain('explorer.exe');
    expect((await runtime.execute('ubuntu-dev', 'curl http://intranet.seed.local:8080/ | grep nominal')).stdout).toContain('nominal');
  });

  it('installs software through native and language package managers into the vfs', async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'seed-packages-'));
    const runtime = new SimulationRuntime({ stateRoot, runId: 'run-packages' });
    await runtime.initialize();
    expect((await runtime.execute('mac-studio', 'brew install ripgrep')).stdout).toContain('installed ripgrep');
    expect((await runtime.execute('win-workstation', 'winget install Docker.DockerDesktop')).stdout).toContain('Docker.DockerDesktop');
    expect((await runtime.execute('ubuntu-dev', 'apt install nginx')).stdout).toContain('installed nginx');
    expect((await runtime.execute('ubuntu-dev', 'pnpm add vite')).stdout).toContain('installed vite');
    const snapshot = runtime.snapshot();
    expect(snapshot.computers.find((computer) => computer.spec.id === 'mac-studio')?.packages.some((item) => item.manager === 'brew' && item.name === 'ripgrep')).toBe(true);
    expect(runtime.getVfs('win-workstation').statSync('/C/Program Files/Docker.DockerDesktop/seed-package.json')?.kind).toBe('file');
  });

  it('models git object storage and synchronizes collaboration messages across computers', async () => {
    const stateRoot = await mkdtemp(path.join(tmpdir(), 'seed-git-'));
    const runtime = new SimulationRuntime({ stateRoot, runId: 'run-git' });
    await runtime.initialize();
    const result = await runtime.execute('ubuntu-dev', 'mkdir ~/code; cd ~/code; git init; echo hello > README.md; git add README.md; git commit -m "initial commit"; git log --oneline');
    expect(result.stdout).toContain('initial commit');
    const repository = runtime.snapshot().computers.find((computer) => computer.spec.id === 'ubuntu-dev')?.repositories.find((item) => item.root === '/home/agent/code');
    expect(repository?.commits).toHaveLength(1);
    expect(runtime.getVfs('ubuntu-dev').statSync(`/home/agent/code/.git/objects/${repository!.head!.slice(0, 2)}/${repository!.head!.slice(2)}`)?.kind).toBe('file');
    runtime.postCollaborationMessage('mac-studio', 'agent-runs', 'Jacob', 'message visible from every display');
    expect(runtime.snapshot().collaboration.at(-1)?.text).toBe('message visible from every display');
  });
});
