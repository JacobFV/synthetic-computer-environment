import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ComputerSpec, DirectoryEntry, InodeRecord } from '@seed/protocol';

interface FileTable {
  version: 1;
  paths: Record<string, string>;
  inodes: Record<string, InodeRecord>;
}

const now = () => new Date().toISOString();

export function canonicalPath(input: string, cwd = '/'): string {
  let value = input.trim().replaceAll('\\', '/');
  if (/^[a-zA-Z]:($|\/)/.test(value)) value = `/${value[0]!.toUpperCase()}${value.slice(2)}`;
  if (!value.startsWith('/')) value = `${cwd.replace(/\/$/, '')}/${value}`;
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return `/${parts.join('/')}` || '/';
}

export class VirtualFileSystem {
  readonly computerId: string;
  readonly rootDir: string;
  private table: FileTable = { version: 1, paths: {}, inodes: {} };
  private tableFile: string;

  constructor(stateRoot: string, runId: string, private readonly spec: ComputerSpec) {
    this.computerId = spec.id;
    this.rootDir = path.join(stateRoot, runId, spec.id);
    this.tableFile = path.join(this.rootDir, 'file-table.json');
  }

  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    try {
      this.table = JSON.parse(await readFile(this.tableFile, 'utf8')) as FileTable;
    } catch {
      for (const disk of this.spec.disks) await mkdir(path.join(this.rootDir, disk.id), { recursive: true });
      await this.mkdir('/', this.spec.disks[0]?.id ?? 'disk0');
    }
  }

  private async persist(): Promise<void> {
    const tmp = `${this.tableFile}.tmp`;
    await writeFile(tmp, JSON.stringify(this.table, null, 2));
    await rename(tmp, this.tableFile);
  }

  private contentPath(inode: InodeRecord): string {
    return path.join(this.rootDir, inode.diskId, inode.id);
  }

  async mkdir(input: string, diskId = this.spec.disks[0]?.id ?? 'disk0'): Promise<InodeRecord> {
    const virtualPath = canonicalPath(input);
    const existing = this.statSync(virtualPath);
    if (existing) {
      if (existing.kind !== 'directory') throw new Error(`not a directory: ${virtualPath}`);
      return existing;
    }
    const parent = virtualPath === '/' ? undefined : canonicalPath(`${virtualPath}/..`);
    if (parent && !this.statSync(parent)) await this.mkdir(parent, diskId);
    const inode: InodeRecord = {
      id: randomUUID(), diskId, kind: 'directory', mode: 0o755, size: 0, createdAt: now(), modifiedAt: now(),
    };
    this.table.paths[virtualPath] = inode.id;
    this.table.inodes[inode.id] = inode;
    await this.persist();
    return inode;
  }

  async writeFile(input: string, content: string | Uint8Array, diskId = this.spec.disks[0]?.id ?? 'disk0'): Promise<InodeRecord> {
    const virtualPath = canonicalPath(input);
    await this.mkdir(canonicalPath(`${virtualPath}/..`), diskId);
    let inode = this.statSync(virtualPath);
    if (inode?.kind === 'directory') throw new Error(`is a directory: ${virtualPath}`);
    const bytes = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content);
    if (!inode) {
      inode = { id: randomUUID(), diskId, kind: 'file', mode: 0o644, size: 0, createdAt: now(), modifiedAt: now() };
      this.table.paths[virtualPath] = inode.id;
      this.table.inodes[inode.id] = inode;
    }
    await mkdir(path.dirname(this.contentPath(inode)), { recursive: true });
    await writeFile(this.contentPath(inode), bytes);
    inode.size = bytes.byteLength;
    inode.modifiedAt = now();
    await this.persist();
    return inode;
  }

  async readFile(input: string): Promise<string> {
    const virtualPath = canonicalPath(input);
    const inode = this.statSync(virtualPath);
    if (!inode) throw new Error(`no such file: ${virtualPath}`);
    if (inode.kind !== 'file') throw new Error(`not a file: ${virtualPath}`);
    return readFile(this.contentPath(inode), 'utf8');
  }

  statSync(input: string): InodeRecord | undefined {
    const inodeId = this.table.paths[canonicalPath(input)];
    return inodeId ? this.table.inodes[inodeId] : undefined;
  }

  list(input: string): DirectoryEntry[] {
    const dir = canonicalPath(input);
    const inode = this.statSync(dir);
    if (!inode || inode.kind !== 'directory') throw new Error(`not a directory: ${dir}`);
    const prefix = dir === '/' ? '/' : `${dir}/`;
    const entries: DirectoryEntry[] = [];
    for (const [candidate, inodeId] of Object.entries(this.table.paths)) {
      if (!candidate.startsWith(prefix) || candidate === dir) continue;
      const rest = candidate.slice(prefix.length);
      if (!rest || rest.includes('/')) continue;
      const child = this.table.inodes[inodeId];
      if (child) entries.push({ name: rest, path: candidate, inode: { ...child } });
    }
    return entries.sort((a, b) => Number(b.inode.kind === 'directory') - Number(a.inode.kind === 'directory') || a.name.localeCompare(b.name));
  }

  async remove(input: string): Promise<void> {
    const virtualPath = canonicalPath(input);
    const inode = this.statSync(virtualPath);
    if (!inode) return;
    const prefix = `${virtualPath}/`;
    for (const candidate of Object.keys(this.table.paths)) {
      if (candidate === virtualPath || candidate.startsWith(prefix)) {
        const id = this.table.paths[candidate]!;
        const child = this.table.inodes[id];
        if (child?.kind === 'file') await rm(this.contentPath(child), { force: true });
        delete this.table.paths[candidate];
        delete this.table.inodes[id];
      }
    }
    await this.persist();
  }

  resolve(input: string, cwd = '/'): string { return canonicalPath(input, cwd); }

  usage(): { files: number; directories: number; bytes: number; digest: string } {
    const values = Object.values(this.table.inodes);
    return {
      files: values.filter((value) => value.kind === 'file').length,
      directories: values.filter((value) => value.kind === 'directory').length,
      bytes: values.reduce((sum, value) => sum + value.size, 0),
      digest: createHash('sha256').update(JSON.stringify(this.table)).digest('hex').slice(0, 16),
    };
  }

  hostLayout(): FileTable { return structuredClone(this.table); }

  async verifyContent(): Promise<string[]> {
    const problems: string[] = [];
    for (const inode of Object.values(this.table.inodes)) {
      if (inode.kind !== 'file') continue;
      try {
        const info = await stat(this.contentPath(inode));
        if (info.size !== inode.size) problems.push(`${inode.id}: expected ${inode.size}, got ${info.size}`);
      } catch { problems.push(`${inode.id}: missing content blob`); }
    }
    return problems;
  }
}
