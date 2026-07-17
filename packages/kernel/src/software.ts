import { createHash, randomUUID } from 'node:crypto';
import type {
  ComputerSpec, GitCommitRecord, GitRepositoryRecord, PackageManagerKind, PackageRecord, PackageTransactionRecord,
} from '@seed/protocol';
import type { ProcessManager } from './processes.js';
import { canonicalPath, type VirtualFileSystem } from './vfs.js';

const managerAliases: Record<string, PackageManagerKind> = {
  brew: 'brew', mas: 'mas', apt: 'apt', 'apt-get': 'apt', dpkg: 'dpkg', snap: 'snap', flatpak: 'flatpak', winget: 'winget',
  choco: 'choco', chocolatey: 'choco', scoop: 'scoop', npm: 'npm', pnpm: 'pnpm', yarn: 'yarn',
  bun: 'bun', pip: 'pip', pip3: 'pip', pipx: 'pipx', poetry: 'poetry', uv: 'uv', cargo: 'cargo', go: 'go', gem: 'gem',
  composer: 'composer', dotnet: 'dotnet', nuget: 'nuget', vcpkg: 'vcpkg', conda: 'conda', mamba: 'conda',
};

const managerSupport: Record<ComputerSpec['os'], PackageManagerKind[]> = {
  macos: ['brew', 'mas', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'nuget', 'vcpkg', 'conda'],
  windows: ['winget', 'choco', 'scoop', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'dotnet', 'nuget', 'vcpkg', 'conda'],
  ubuntu: ['apt', 'dpkg', 'snap', 'flatpak', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'nuget', 'vcpkg', 'conda'],
};

const catalogs: Record<PackageManagerKind, string[]> = {
  brew: ['git', 'node', 'python@3.13', 'ripgrep', 'jq', 'ffmpeg', 'postgresql@17', 'redis', 'docker', 'gh'],
  mas: ['497799835:Xcode', '409183694:Keynote', '409201541:Pages', '409203825:Numbers'],
  apt: ['git', 'curl', 'build-essential', 'python3', 'nodejs', 'ripgrep', 'jq', 'nginx', 'postgresql', 'redis-server'],
  dpkg: ['git_2.48_amd64.deb', 'curl_8.14_amd64.deb', 'seed-agent_1.0_amd64.deb'],
  snap: ['code', 'slack', 'spotify', 'postman', 'chromium', 'obsidian'],
  flatpak: ['org.gimp.GIMP', 'org.blender.Blender', 'org.videolan.VLC', 'com.spotify.Client', 'md.obsidian.Obsidian'],
  winget: ['Git.Git', 'Microsoft.VisualStudioCode', 'OpenJS.NodeJS', 'Python.Python.3.13', 'Docker.DockerDesktop', 'GitHub.cli', 'SlackTechnologies.Slack'],
  choco: ['git', 'nodejs', 'python313', 'vscode', '7zip', 'ripgrep', 'jq', 'docker-desktop'],
  scoop: ['git', 'nodejs', 'python', 'ripgrep', 'jq', 'ffmpeg', 'gh'],
  npm: ['typescript', 'vite', 'react', 'tsx', 'vitest', 'eslint', 'prettier', 'playwright', 'express'],
  pnpm: ['typescript', 'vite', 'react', 'tsx', 'vitest', 'eslint', 'prettier', 'playwright', 'fastify'],
  yarn: ['typescript', 'vite', 'react', 'next', 'jest', 'eslint', 'prettier'],
  bun: ['typescript', 'vite', 'react', 'elysia', 'hono', 'biome'],
  pip: ['numpy', 'pandas', 'torch', 'transformers', 'fastapi', 'pytest', 'ruff', 'jupyterlab'],
  pipx: ['poetry', 'black', 'ruff', 'httpie', 'cookiecutter'],
  poetry: ['numpy', 'pandas', 'fastapi', 'pydantic', 'httpx', 'pytest'],
  uv: ['ruff', 'fastapi', 'pytest', 'numpy', 'torch', 'transformers'],
  cargo: ['ripgrep', 'fd-find', 'bat', 'cargo-watch', 'wasm-pack', 'just'],
  go: ['golang.org/x/tools/gopls', 'github.com/go-delve/delve/cmd/dlv', 'github.com/golangci/golangci-lint/cmd/golangci-lint'],
  gem: ['rails', 'bundler', 'rake', 'rubocop', 'jekyll'],
  composer: ['laravel/installer', 'phpunit/phpunit', 'symfony/console'],
  dotnet: ['dotnet-ef', 'dotnet-format', 'dotnet-outdated-tool'],
  nuget: ['Newtonsoft.Json', 'Microsoft.EntityFrameworkCore', 'Serilog', 'xunit'],
  vcpkg: ['boost', 'fmt', 'openssl', 'sqlite3', 'curl', 'zlib'],
  conda: ['numpy', 'scipy', 'pandas', 'pytorch', 'jupyterlab', 'cudatoolkit'],
};

const dependencyCatalog: Partial<Record<PackageManagerKind, Record<string, string[]>>> = {
  apt: { nginx: ['libc6', 'libpcre2-8-0', 'zlib1g'], nodejs: ['libc6', 'libnode'], postgresql: ['libpq5', 'postgresql-common'] },
  brew: { node: ['brotli', 'c-ares', 'icu4c', 'libuv', 'openssl@3'], git: ['gettext', 'pcre2'] },
  npm: { vite: ['esbuild', 'rollup'], react: ['loose-envify'], playwright: ['playwright-core'] },
  pnpm: { vite: ['esbuild', 'rollup'], react: ['loose-envify'], fastify: ['avvio', 'find-my-way'] },
  pip: { transformers: ['numpy', 'packaging', 'requests', 'tokenizers'], pandas: ['numpy', 'python-dateutil', 'pytz'], fastapi: ['pydantic', 'starlette'] },
  winget: { 'Docker.DockerDesktop': ['Microsoft.VCRedist.2015+.x64'] },
};

function stableVersion(manager: PackageManagerKind, name: string): string {
  const value = Number.parseInt(createHash('sha256').update(`${manager}:${name}`).digest('hex').slice(0, 6), 16);
  return `${1 + value % 12}.${value % 23}.${value % 11}`;
}

export interface GitRemoteSnapshot {
  branches: Record<string, string>;
  commits: GitCommitRecord[];
}

export interface GitRemoteTransport {
  fetch(url: string): Promise<GitRemoteSnapshot>;
  push(url: string, branch: string, commits: GitCommitRecord[], expectedHead?: string): Promise<GitRemoteSnapshot>;
}

export class SoftwareEnvironment {
  private readonly packages = new Map<string, PackageRecord>();
  private readonly transactions: PackageTransactionRecord[] = [];
  private readonly repositories = new Map<string, GitRepositoryRecord>();
  private readonly dbPath: string;
  private readonly home: string;

  constructor(
    private readonly spec: ComputerSpec,
    private readonly vfs: VirtualFileSystem,
    private readonly processes: ProcessManager,
    private readonly gitTransport?: GitRemoteTransport,
  ) {
    this.home = spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
    this.dbPath = spec.os === 'windows'
      ? '/C/ProgramData/Seed/packages.json'
      : spec.os === 'macos'
        ? '/Library/Application Support/Seed/packages.json'
        : '/var/lib/seed/packages.json';
  }

  async initialize(): Promise<void> {
    const bootstrap: Array<[PackageManagerKind, string]> = this.spec.os === 'macos'
      ? [['brew', 'git'], ['brew', 'node'], ['brew', 'python@3.13']]
      : this.spec.os === 'windows'
        ? [['winget', 'Git.Git'], ['winget', 'OpenJS.NodeJS'], ['winget', 'Python.Python.3.13']]
        : [['apt', 'git'], ['apt', 'nodejs'], ['apt', 'python3']];
    for (const [manager, name] of bootstrap) await this.install(manager, name, 'system', true);
    const project = `${this.home}/Projects/seed-ecosystem`;
    await this.vfs.mkdir(project);
    await this.vfs.writeFile(`${project}/README.md`, '# seed ecosystem\n\na typed multi-computer simulation runtime.\n');
    await this.vfs.writeFile(`${project}/package.json`, JSON.stringify({ name: 'seed-ecosystem', private: true, workspaces: ['apps/*', 'packages/*'] }, null, 2));
    await this.initRepository(project);
    const repo = this.repositories.get(project)!;
    repo.staged = ['README.md', 'package.json'];
    await this.gitCommand(['commit', '-m', 'bootstrap seed ecosystem'], project);
  }

  supports(command: string): boolean {
    const manager = managerAliases[command.toLowerCase()];
    return Boolean(manager && managerSupport[this.spec.os].includes(manager));
  }

  supportedManagers(): PackageManagerKind[] { return [...managerSupport[this.spec.os]]; }
  listPackages(): PackageRecord[] { return [...this.packages.values()].map((item) => structuredClone(item)); }
  listPackageTransactions(): PackageTransactionRecord[] { return this.transactions.map((item) => structuredClone(item)); }
  listRepositories(): GitRepositoryRecord[] { return [...this.repositories.values()].map((item) => structuredClone(item)); }

  async packageCommand(rawManager: string, args: string[], cwd: string): Promise<string> {
    const manager = managerAliases[rawManager.toLowerCase()];
    if (!manager || !managerSupport[this.spec.os].includes(manager)) throw new Error(`${rawManager}: unavailable on ${this.spec.os}`);
    const operation = this.packageOperation(manager, args);
    if (operation.kind === 'list') {
      const installed = this.listPackages().filter((item) => item.manager === manager);
      return installed.length ? installed.map((item) => `${item.name.padEnd(34)} ${item.version.padEnd(12)} ${item.scope}`).join('\n') : `no ${manager} packages installed`;
    }
    if (operation.kind === 'search') {
      const query = operation.names.join(' ').toLowerCase();
      return catalogs[manager].filter((name) => name.toLowerCase().includes(query)).map((name) => `${name.padEnd(42)} ${stableVersion(manager, name)}`).join('\n') || `no package matched ${query}`;
    }
    if (operation.kind === 'info') {
      const name = operation.names[0] ?? '';
      const record = this.findPackage(manager, name, cwd);
      return record ? JSON.stringify(record, null, 2) : `${name} ${stableVersion(manager, name)}\nsource: registry://${manager}/${name}\nstatus: available`;
    }
    if (operation.kind === 'remove') {
      const startedAt = new Date().toISOString();
      const removed: string[] = [];
      const receipts: string[] = [];
      for (const name of operation.names) {
        const current = this.findPackage(manager, name, cwd);
        if (!current) continue;
        for (const file of current.files) await this.vfs.remove(file);
        await this.vfs.remove(current.installPath);
        const entry = [...this.packages.entries()].find(([, value]) => value.id === current.id);
        if (entry) this.packages.delete(entry[0]);
        removed.push(name);
        receipts.push(...current.files);
      }
      if (this.isProjectManager(manager)) await this.updateProjectMetadata(manager, cwd);
      await this.persist();
      if (removed.length) this.recordTransaction(manager, 'remove', removed, receipts, startedAt);
      return removed.length ? `removed ${removed.join(', ')} with ${manager}` : 'nothing to remove';
    }
    if (operation.kind === 'refresh') {
      const startedAt = new Date().toISOString();
      const indexPath = `${this.dbPath}.indexes/${manager}.json`;
      await this.vfs.writeFile(indexPath, JSON.stringify({ manager, refreshedAt: new Date().toISOString(), packages: catalogs[manager] }, null, 2));
      this.recordTransaction(manager, 'index-refresh', [], [indexPath], startedAt);
      return manager === 'apt' ? 'Hit:1 https://packages.seed.local stable InRelease\nReading package lists... Done' : `${manager}: package index refreshed`;
    }
    if (operation.kind === 'outdated') {
      const installed = this.listPackages().filter((item) => item.manager === manager);
      return installed.map((item) => `${item.name.padEnd(34)} ${item.version.padEnd(12)} < ${stableVersion(manager, `${item.name}:updated`)}`).join('\n') || `${manager}: no packages installed`;
    }
    if (operation.kind === 'update') {
      const startedAt = new Date().toISOString();
      const targets = operation.names.length ? new Set(operation.names) : undefined;
      const updated = this.listPackages().filter((item) => item.manager === manager && (!targets || targets.has(item.name)) && (!this.isProjectManager(manager) || item.scope !== 'project' || item.installPath.startsWith(canonicalPath(cwd))));
      for (const item of updated) {
        item.version = stableVersion(manager, `${item.name}:updated`);
        item.integrity = createHash('sha256').update(`${manager}:${item.name}:${item.version}`).digest('hex');
        const entry = [...this.packages.entries()].find(([, value]) => value.id === item.id);
        if (entry) this.packages.set(entry[0], item);
        await this.vfs.writeFile(item.files[0]!, JSON.stringify(item, null, 2));
      }
      if (this.isProjectManager(manager)) await this.updateProjectMetadata(manager, cwd);
      await this.persist();
      if (updated.length) this.recordTransaction(manager, 'upgrade', updated.map((item) => item.name), updated.flatMap((item) => item.files), startedAt);
      return updated.length ? `updated ${updated.length} ${manager} package${updated.length === 1 ? '' : 's'}` : `${manager}: already up to date`;
    }
    const startedAt = new Date().toISOString();
    const scope = operation.global ? 'system' : this.isProjectManager(manager) ? 'project' : 'user';
    const installed: PackageRecord[] = [];
    for (const name of operation.names) installed.push(await this.install(manager, name, scope, false, cwd));
    if (this.isProjectManager(manager)) await this.updateProjectMetadata(manager, cwd);
    this.recordTransaction(manager, 'install', installed.map((item) => item.name), installed.flatMap((item) => item.files), startedAt);
    return installed.map((item) => `${manager}: installed ${item.name}@${item.version}\n  → ${item.installPath}`).join('\n');
  }

  async gitCommand(args: string[], cwd: string): Promise<string> {
    const subcommand = args[0]?.toLowerCase() ?? 'help';
    const rest = args.slice(1);
    if (subcommand === 'init') {
      const root = canonicalPath(rest.find((arg) => !arg.startsWith('-')) ?? cwd, cwd);
      return this.initRepository(root);
    }
    if (subcommand === 'clone') {
      const url = rest.find((arg) => !arg.startsWith('-')) ?? 'https://git.seed.local/seed/example.git';
      const explicit = rest.filter((arg) => !arg.startsWith('-'))[1];
      const name = explicit ?? url.split('/').at(-1)?.replace(/\.git$/, '') ?? 'repository';
      const root = canonicalPath(name, cwd);
      await this.vfs.mkdir(root);
      await this.vfs.writeFile(`${root}/README.md`, `# ${name}\n\ncloned from ${url} through the seed git transport.\n`);
      await this.initRepository(root);
      const repo = this.repositories.get(root)!;
      repo.remotes.origin = url;
      if (this.gitTransport && url.includes('git.seed.local')) {
        const remote = await this.gitTransport.fetch(url);
        repo.commits = remote.commits;
        repo.remoteRefs = Object.fromEntries(Object.entries(remote.branches).map(([branch, head]) => [`origin/${branch}`, head]));
        repo.branches = Object.fromEntries(Object.entries(remote.branches));
        repo.branch = remote.branches.main ? 'main' : Object.keys(remote.branches)[0] ?? 'main';
        repo.head = remote.branches[repo.branch];
      }
      await this.writeGitMetadata(repo);
      return `Cloning into '${name}'...\nremote: Enumerating objects: ${Math.max(1, repo.commits.length)}, done.\nReceiving objects: 100% (${Math.max(1, repo.commits.length)}/${Math.max(1, repo.commits.length)}), done.`;
    }
    const repo = this.findRepository(cwd);
    if (!repo) throw new Error('fatal: not a git repository (or any parent up to mount point)');
    if (subcommand === 'status') {
      if (rest.includes('--short') || rest.includes('-s')) return repo.staged.map((item) => `A  ${item}`).join('\n');
      return `On branch ${repo.branch}\n${repo.staged.length ? `Changes to be committed:\n${repo.staged.map((item) => `  new file: ${item}`).join('\n')}` : 'nothing to commit, working tree clean'}`;
    }
    if (subcommand === 'add') {
      const targets = rest.filter((arg) => !arg.startsWith('-'));
      if (!targets.length) throw new Error('Nothing specified, nothing added.');
      const table = this.vfs.hostLayout();
      repo.staged = targets.includes('.')
        ? Object.keys(table.paths).filter((candidate) => candidate.startsWith(`${repo.root}/`) && !candidate.includes('/.git/')).map((candidate) => candidate.slice(repo.root.length + 1))
        : [...new Set([...repo.staged, ...targets])];
      await this.writeGitMetadata(repo);
      return '';
    }
    if (subcommand === 'commit') {
      if (!repo.staged.length && !rest.includes('--allow-empty')) throw new Error(`On branch ${repo.branch}\nnothing to commit, working tree clean`);
      const messageIndex = rest.findIndex((arg) => arg === '-m' || arg === '--message');
      const message = messageIndex >= 0 ? rest[messageIndex + 1] ?? 'commit' : 'commit';
      const table = this.vfs.hostLayout();
      const treeDigest = createHash('sha256').update(JSON.stringify(Object.keys(table.paths).filter((candidate) => candidate.startsWith(repo.root) && !candidate.includes('/.git/')).sort())).digest('hex');
      const at = new Date().toISOString();
      const hash = createHash('sha1').update(`${repo.head ?? ''}:${message}:${treeDigest}:${at}`).digest('hex');
      const commit: GitCommitRecord = { hash, message, author: 'agent <agent@seed.local>', at, treeDigest };
      repo.commits.unshift(commit); repo.head = hash; repo.branches[repo.branch] = hash; repo.staged = [];
      await this.vfs.mkdir(`${repo.root}/.git/objects/${hash.slice(0, 2)}`);
      await this.vfs.writeFile(`${repo.root}/.git/objects/${hash.slice(0, 2)}/${hash.slice(2)}`, JSON.stringify(commit));
      await this.writeGitMetadata(repo);
      return `[${repo.branch} ${hash.slice(0, 7)}] ${message}\n ${Object.keys(table.paths).filter((candidate) => candidate.startsWith(repo.root) && !candidate.includes('/.git/')).length} files changed`;
    }
    if (subcommand === 'log') return repo.commits.map((commit) => rest.includes('--oneline') ? `${commit.hash.slice(0, 7)} ${commit.message}` : `commit ${commit.hash}\nAuthor: ${commit.author}\nDate:   ${commit.at}\n\n    ${commit.message}`).join('\n');
    if (subcommand === 'branch') {
      if ((rest[0] === '-d' || rest[0] === '-D') && rest[1]) {
        if (rest[1] === repo.branch) throw new Error(`error: Cannot delete branch '${rest[1]}' checked out at '${repo.root}'`);
        if (!(rest[1] in repo.branches)) throw new Error(`error: branch '${rest[1]}' not found.`);
        delete repo.branches[rest[1]];
        await this.writeGitMetadata(repo);
        return `Deleted branch ${rest[1]}.`;
      }
      const create = rest.find((arg) => !arg.startsWith('-'));
      if (create) {
        if (create in repo.branches) throw new Error(`fatal: a branch named '${create}' already exists`);
        repo.branches[create] = repo.head;
        await this.writeGitMetadata(repo);
        return `branch '${create}' created at ${(repo.head ?? 'unborn').slice(0, 7)}`;
      }
      return Object.keys(repo.branches).map((branch) => `${branch === repo.branch ? '*' : ' '} ${branch}`).join('\n');
    }
    if (subcommand === 'switch' || subcommand === 'checkout') {
      const branch = rest.filter((arg) => !arg.startsWith('-')).at(-1);
      if (!branch) throw new Error(`git ${subcommand}: missing branch`);
      const create = rest.includes('-c') || rest.includes('-b');
      if (create) {
        if (branch in repo.branches) throw new Error(`fatal: a branch named '${branch}' already exists`);
        repo.branches[branch] = repo.head;
      } else if (!(branch in repo.branches)) throw new Error(`fatal: invalid reference: ${branch}`);
      repo.branch = branch;
      repo.head = repo.branches[branch];
      await this.writeGitMetadata(repo);
      return `Switched to ${create ? 'a new branch' : 'branch'} '${branch}'`;
    }
    if (subcommand === 'remote') {
      if (rest[0] === 'add' && rest[1] && rest[2]) { repo.remotes[rest[1]] = rest[2]; await this.writeGitMetadata(repo); return ''; }
      if (rest.includes('-v')) return Object.entries(repo.remotes).flatMap(([name, url]) => [`${name}\t${url} (fetch)`, `${name}\t${url} (push)`]).join('\n');
      return Object.keys(repo.remotes).join('\n');
    }
    if (['push', 'pull', 'fetch'].includes(subcommand)) {
      const remote = rest.find((arg) => !arg.startsWith('-')) ?? 'origin';
      const url = repo.remotes[remote] ?? 'https://git.seed.local/seed/example.git';
      if (this.gitTransport && url.includes('git.seed.local')) {
        if (subcommand === 'push') {
          const previous = repo.remoteRefs[`${remote}/${repo.branch}`];
          const state = await this.gitTransport.push(url, repo.branch, repo.commits, previous);
          repo.remoteRefs = { ...repo.remoteRefs, ...Object.fromEntries(Object.entries(state.branches).map(([branch, head]) => [`${remote}/${branch}`, head])) };
          await this.writeGitMetadata(repo);
          return `Enumerating objects: ${Math.max(1, repo.commits.length)}, done.\nTo ${url}\n   ${previous?.slice(0, 7) ?? '0000000'}..${repo.head?.slice(0, 7) ?? '0000000'}  ${repo.branch} -> ${repo.branch}`;
        }
        const state = await this.gitTransport.fetch(url);
        repo.remoteRefs = { ...repo.remoteRefs, ...Object.fromEntries(Object.entries(state.branches).map(([branch, head]) => [`${remote}/${branch}`, head])) };
        for (const commit of state.commits) if (!repo.commits.some((candidate) => candidate.hash === commit.hash)) repo.commits.push(commit);
        if (subcommand === 'pull') {
          const remoteHead = state.branches[repo.branch];
          if (remoteHead && remoteHead !== repo.head) { repo.head = remoteHead; repo.branches[repo.branch] = remoteHead; }
        }
        await this.writeGitMetadata(repo);
        return `From ${url}\n * branch            ${repo.branch} -> FETCH_HEAD\n${subcommand === 'pull' ? 'Fast-forward' : `Updated ${remote}/${repo.branch}`}`;
      }
      return subcommand === 'push'
        ? `Enumerating objects: ${Math.max(1, repo.commits.length)}, done.\nTo ${url}\n   ${repo.head?.slice(0, 7) ?? '0000000'}  ${repo.branch} -> ${repo.branch}`
        : `From ${url}\n * branch            ${repo.branch} -> FETCH_HEAD\nAlready up to date.`;
    }
    if (subcommand === 'diff') return repo.staged.length ? repo.staged.map((item) => `diff --git a/${item} b/${item}\nnew file mode 100644`).join('\n') : '';
    if (subcommand === 'rev-parse') return rest.includes('--show-toplevel') ? repo.root : repo.head ?? 'HEAD';
    if (subcommand === 'config') return rest.includes('--list') ? `user.name=agent\nuser.email=agent@seed.local\ninit.defaultbranch=main` : '';
    return 'git commands: init clone status add commit log branch switch checkout remote push pull fetch diff rev-parse config';
  }

  private packageOperation(manager: PackageManagerKind, args: string[]): { kind: 'install' | 'remove' | 'list' | 'search' | 'info' | 'update' | 'refresh' | 'outdated'; names: string[]; global: boolean } {
    const clean = args.filter((arg) => !arg.startsWith('-') && !['--global', '--user', '--yes'].includes(arg));
    const global = args.includes('-g') || args.includes('--global') || ['apt', 'dpkg', 'brew', 'mas', 'snap', 'flatpak', 'winget', 'choco', 'scoop'].includes(manager);
    if (manager === 'dotnet' && clean[0] === 'tool') clean.splice(0, 1);
    if (manager === 'uv' && ['tool', 'pip'].includes(clean[0] ?? '')) clean.splice(0, 1);
    let verb = clean[0]?.toLowerCase() ?? 'list';
    if (manager === 'dpkg' && args.includes('-i')) verb = 'install';
    if (manager === 'pnpm' && verb === 'add') verb = 'install';
    if (manager === 'yarn' && verb === 'add') verb = 'install';
    if (manager === 'bun' && verb === 'add') verb = 'install';
    if (manager === 'poetry' && verb === 'add') verb = 'install';
    if (manager === 'composer' && verb === 'require') verb = 'install';
    if (manager === 'go' && verb.includes('@')) verb = 'install';
    const aliases: Record<string, 'install' | 'remove' | 'list' | 'search' | 'info' | 'update' | 'refresh' | 'outdated'> = {
      install: 'install', add: 'install', require: 'install', remove: 'remove', uninstall: 'remove', delete: 'remove',
      list: 'list', ls: 'list', freeze: 'list', search: 'search', find: 'search', info: 'info', show: 'info', view: 'info',
      update: ['apt', 'brew', 'winget', 'choco', 'scoop'].includes(manager) ? 'refresh' : 'update', upgrade: 'update', outdated: 'outdated',
    };
    const kind = aliases[verb] ?? (manager === 'go' ? 'install' : 'list');
    const offset = aliases[verb] && !(manager === 'dpkg' && args.includes('-i')) ? 1 : 0;
    const names = clean.slice(offset).filter((arg) => !['tool', 'pip', 'package'].includes(arg));
    if (kind === 'install' && names.length === 0) names.push(manager === 'npm' || manager === 'pnpm' || manager === 'yarn' ? 'workspace-dependencies' : 'default-package');
    return { kind, names, global };
  }

  private isProjectManager(manager: PackageManagerKind): boolean { return ['npm', 'pnpm', 'yarn', 'bun', 'poetry', 'composer', 'nuget', 'vcpkg'].includes(manager); }

  private installPath(manager: PackageManagerKind, name: string, cwd: string, scope: PackageRecord['scope']): string {
    const safe = name.replaceAll('/', '__').replaceAll('\\', '__');
    if (manager === 'brew') return `/opt/homebrew/Cellar/${safe}/${stableVersion(manager, name)}`;
    if (manager === 'mas') return `/Applications/${safe}.app`;
    if (manager === 'apt') return `/usr/share/${safe}`;
    if (manager === 'dpkg') return `/var/lib/dpkg/info/${safe}`;
    if (manager === 'snap') return `/snap/${safe}/current`;
    if (manager === 'flatpak') return `/var/lib/flatpak/app/${safe}/active`;
    if (manager === 'winget' || manager === 'choco') return `/C/Program Files/${safe}`;
    if (manager === 'scoop') return `${this.home}/scoop/apps/${safe}/current`;
    if (manager === 'npm') return scope === 'project' ? `${cwd}/node_modules/${safe}` : `${this.home}/.local/lib/node_modules/${safe}`;
    if (manager === 'pnpm') return scope === 'project' ? `${cwd}/node_modules/.pnpm/${safe}@${stableVersion(manager, name)}/node_modules/${safe}` : `${this.home}/.local/share/pnpm/global/${safe}`;
    if (manager === 'yarn') return scope === 'project' ? `${cwd}/.yarn/cache/${safe}` : `${this.home}/.config/yarn/global/${safe}`;
    if (manager === 'bun') return scope === 'project' ? `${cwd}/node_modules/${safe}` : `${this.home}/.bun/install/global/node_modules/${safe}`;
    if (manager === 'pip' || manager === 'conda') return `${this.home}/.local/lib/python3.13/site-packages/${safe}`;
    if (manager === 'pipx' || manager === 'uv') return `${this.home}/.local/share/${manager}/${safe}`;
    if (manager === 'poetry') return `${cwd}/.venv/lib/python3.13/site-packages/${safe}`;
    if (manager === 'cargo') return `${this.home}/.cargo/bin/${safe}`;
    if (manager === 'go') return `${this.home}/go/bin/${safe.split('/').at(-1)}`;
    if (manager === 'gem') return `${this.home}/.gem/ruby/3.4.0/gems/${safe}`;
    if (manager === 'composer') return `${cwd}/vendor/${safe}`;
    if (manager === 'dotnet') return `${this.home}/.dotnet/tools/${safe}`;
    if (manager === 'nuget') return `${cwd}/packages/${safe}`;
    if (manager === 'vcpkg') return `${cwd}/vcpkg_installed/${safe}`;
    return `${this.home}/.local/share/packages/${safe}`;
  }

  private async install(manager: PackageManagerKind, name: string, scope: PackageRecord['scope'], bootstrap = false, cwd = this.home, dependencyType: PackageRecord['dependencyType'] = 'direct'): Promise<PackageRecord> {
    const key = this.packageKey(manager, name, scope, cwd);
    const existing = this.packages.get(key);
    if (existing) {
      if (dependencyType === 'direct' && existing.dependencyType === 'transitive') { existing.dependencyType = 'direct'; await this.persist(); }
      return structuredClone(existing);
    }
    const dependencies = dependencyCatalog[manager]?.[name] ?? [];
    for (const dependency of dependencies) await this.install(manager, dependency, scope, true, cwd, 'transitive');
    const installPath = this.installPath(manager, name, cwd, scope);
    const marker = manager === 'cargo' || manager === 'go' || manager === 'dotnet' ? installPath : manager === 'dpkg' ? `${installPath}.list` : `${installPath}/seed-package.json`;
    const record: PackageRecord = {
      id: randomUUID(), name, version: stableVersion(manager, name), manager, scope, installPath,
      installedAt: new Date().toISOString(), files: [marker], source: `registry://${manager}/${name}`,
      integrity: createHash('sha256').update(`${manager}:${name}:${stableVersion(manager, name)}`).digest('hex'),
      dependencies, dependencyType,
    };
    await this.vfs.writeFile(marker, JSON.stringify({ ...record, source: `registry://${manager}/${name}`, bootstrap }, null, 2));
    this.packages.set(key, record);
    await this.persist();
    return structuredClone(record);
  }

  private async persist(): Promise<void> { await this.vfs.writeFile(this.dbPath, JSON.stringify(this.listPackages(), null, 2)); }

  private packageKey(manager: PackageManagerKind, name: string, scope: PackageRecord['scope'], cwd: string): string {
    return `${manager}:${scope}:${scope === 'project' ? canonicalPath(cwd) : this.home}:${name}`;
  }

  private findPackage(manager: PackageManagerKind, name: string, cwd: string): PackageRecord | undefined {
    const values = [...this.packages.values()].filter((item) => item.manager === manager && item.name === name);
    return values.find((item) => item.scope === 'project' && item.installPath.startsWith(canonicalPath(cwd))) ?? values.find((item) => item.scope !== 'project');
  }

  private recordTransaction(manager: PackageManagerKind, operation: PackageTransactionRecord['operation'], packages: string[], receiptPaths: string[], startedAt: string): void {
    this.transactions.push({ id: randomUUID(), manager, operation, packages, startedAt, completedAt: new Date().toISOString(), status: 'committed', receiptPaths });
    if (this.transactions.length > 300) this.transactions.shift();
  }

  private async updateProjectMetadata(manager: PackageManagerKind, cwd: string): Promise<void> {
    const records = this.listPackages().filter((item) => item.manager === manager && item.scope === 'project' && item.installPath.startsWith(cwd));
    const directRecords = records.filter((item) => item.dependencyType === 'direct');
    const dependencies = Object.fromEntries(directRecords.map((item) => [item.name, `^${item.version}`]));
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) {
      let manifest: Record<string, unknown> = { name: 'seed-project', private: true };
      try { manifest = JSON.parse(await this.vfs.readFile(`${cwd}/package.json`)) as Record<string, unknown>; } catch { /* create it */ }
      await this.vfs.writeFile(`${cwd}/package.json`, JSON.stringify({ ...manifest, dependencies }, null, 2));
      const lockPath = manager === 'npm' ? `${cwd}/package-lock.json` : manager === 'pnpm' ? `${cwd}/pnpm-lock.yaml` : manager === 'bun' ? `${cwd}/bun.lock` : `${cwd}/yarn.lock`;
      const lock = manager === 'pnpm'
        ? `lockfileVersion: '9.0'\ndependencies:\n${directRecords.map((item) => `  ${item.name}:\n    version: ${item.version}`).join('\n')}\npackages:\n${records.map((item) => `  ${item.name}@${item.version}: {}`).join('\n')}\n`
        : JSON.stringify({ lockfileVersion: 3, manager, packages: Object.fromEntries(records.map((item) => [item.name, { version: item.version, integrity: item.integrity }])) }, null, 2);
      await this.vfs.writeFile(lockPath, lock);
    }
    if (manager === 'poetry') {
      await this.vfs.writeFile(`${cwd}/pyproject.toml`, `[tool.poetry]\nname = "seed-project"\nversion = "0.1.0"\n\n[tool.poetry.dependencies]\npython = "^3.13"\n${directRecords.map((item) => `${item.name} = "^${item.version}"`).join('\n')}\n`);
      await this.vfs.writeFile(`${cwd}/poetry.lock`, records.map((item) => `[[package]]\nname = "${item.name}"\nversion = "${item.version}"\n`).join('\n'));
    }
    if (manager === 'composer') await this.vfs.writeFile(`${cwd}/composer.lock`, JSON.stringify({ packages: records }, null, 2));
    if (manager === 'nuget') await this.vfs.writeFile(`${cwd}/packages.lock.json`, JSON.stringify({ version: 1, dependencies: Object.fromEntries(records.map((item) => [item.name, { resolved: item.version, contentHash: item.integrity }])) }, null, 2));
    if (manager === 'vcpkg') await this.vfs.writeFile(`${cwd}/vcpkg.json`, JSON.stringify({ name: 'seed-project', version: '0.1.0', dependencies: directRecords.map((item) => item.name) }, null, 2));
  }

  private async initRepository(root: string): Promise<string> {
    await this.vfs.mkdir(root);
    const repo: GitRepositoryRecord = { root, branch: 'main', branches: { main: undefined }, remotes: {}, remoteRefs: {}, staged: [], commits: [] };
    this.repositories.set(root, repo);
    await this.writeGitMetadata(repo);
    return `Initialized empty Git repository in ${root}/.git/`;
  }

  private findRepository(cwd: string): GitRepositoryRecord | undefined {
    return [...this.repositories.values()].filter((repo) => cwd === repo.root || cwd.startsWith(`${repo.root}/`)).sort((a, b) => b.root.length - a.root.length)[0];
  }

  private async writeGitMetadata(repo: GitRepositoryRecord): Promise<void> {
    await this.vfs.mkdir(`${repo.root}/.git/refs/heads`);
    await this.vfs.writeFile(`${repo.root}/.git/HEAD`, `ref: refs/heads/${repo.branch}\n`);
    await this.vfs.writeFile(`${repo.root}/.git/config`, `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = ${repo.remotes.origin ?? ''}\n`);
    for (const [branch, head] of Object.entries(repo.branches)) if (head) await this.vfs.writeFile(`${repo.root}/.git/refs/heads/${branch}`, `${head}\n`);
    for (const [name, head] of Object.entries(repo.remoteRefs)) {
      const [remote, ...branchParts] = name.split('/');
      if (remote && branchParts.length) await this.vfs.writeFile(`${repo.root}/.git/refs/remotes/${remote}/${branchParts.join('/')}`, `${head}\n`);
    }
    await this.vfs.writeFile(`${repo.root}/.git/index.seed.json`, JSON.stringify({ staged: repo.staged, commits: repo.commits, branches: repo.branches, remoteRefs: repo.remoteRefs }, null, 2));
  }
}
