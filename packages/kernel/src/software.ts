import { createHash, randomUUID } from 'node:crypto';
import type {
  ComputerSpec, GitCommitRecord, GitRepositoryRecord, PackageManagerKind, PackageRecord,
} from '@seed/protocol';
import type { ProcessManager } from './processes.js';
import { canonicalPath, type VirtualFileSystem } from './vfs.js';

const managerAliases: Record<string, PackageManagerKind> = {
  brew: 'brew', apt: 'apt', 'apt-get': 'apt', snap: 'snap', flatpak: 'flatpak', winget: 'winget',
  choco: 'choco', chocolatey: 'choco', scoop: 'scoop', npm: 'npm', pnpm: 'pnpm', yarn: 'yarn',
  pip: 'pip', pip3: 'pip', pipx: 'pipx', uv: 'uv', cargo: 'cargo', go: 'go', gem: 'gem',
  composer: 'composer', dotnet: 'dotnet', conda: 'conda', mamba: 'conda',
};

const managerSupport: Record<ComputerSpec['os'], PackageManagerKind[]> = {
  macos: ['brew', 'npm', 'pnpm', 'yarn', 'pip', 'pipx', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'conda'],
  windows: ['winget', 'choco', 'scoop', 'npm', 'pnpm', 'yarn', 'pip', 'pipx', 'uv', 'cargo', 'go', 'gem', 'dotnet', 'conda'],
  ubuntu: ['apt', 'snap', 'flatpak', 'npm', 'pnpm', 'yarn', 'pip', 'pipx', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'conda'],
};

const catalogs: Record<PackageManagerKind, string[]> = {
  brew: ['git', 'node', 'python@3.13', 'ripgrep', 'jq', 'ffmpeg', 'postgresql@17', 'redis', 'docker', 'gh'],
  apt: ['git', 'curl', 'build-essential', 'python3', 'nodejs', 'ripgrep', 'jq', 'nginx', 'postgresql', 'redis-server'],
  snap: ['code', 'slack', 'spotify', 'postman', 'chromium', 'obsidian'],
  flatpak: ['org.gimp.GIMP', 'org.blender.Blender', 'org.videolan.VLC', 'com.spotify.Client', 'md.obsidian.Obsidian'],
  winget: ['Git.Git', 'Microsoft.VisualStudioCode', 'OpenJS.NodeJS', 'Python.Python.3.13', 'Docker.DockerDesktop', 'GitHub.cli', 'SlackTechnologies.Slack'],
  choco: ['git', 'nodejs', 'python313', 'vscode', '7zip', 'ripgrep', 'jq', 'docker-desktop'],
  scoop: ['git', 'nodejs', 'python', 'ripgrep', 'jq', 'ffmpeg', 'gh'],
  npm: ['typescript', 'vite', 'react', 'tsx', 'vitest', 'eslint', 'prettier', 'playwright', 'express'],
  pnpm: ['typescript', 'vite', 'react', 'tsx', 'vitest', 'eslint', 'prettier', 'playwright', 'fastify'],
  yarn: ['typescript', 'vite', 'react', 'next', 'jest', 'eslint', 'prettier'],
  pip: ['numpy', 'pandas', 'torch', 'transformers', 'fastapi', 'pytest', 'ruff', 'jupyterlab'],
  pipx: ['poetry', 'black', 'ruff', 'httpie', 'cookiecutter'],
  uv: ['ruff', 'fastapi', 'pytest', 'numpy', 'torch', 'transformers'],
  cargo: ['ripgrep', 'fd-find', 'bat', 'cargo-watch', 'wasm-pack', 'just'],
  go: ['golang.org/x/tools/gopls', 'github.com/go-delve/delve/cmd/dlv', 'github.com/golangci/golangci-lint/cmd/golangci-lint'],
  gem: ['rails', 'bundler', 'rake', 'rubocop', 'jekyll'],
  composer: ['laravel/installer', 'phpunit/phpunit', 'symfony/console'],
  dotnet: ['dotnet-ef', 'dotnet-format', 'dotnet-outdated-tool'],
  conda: ['numpy', 'scipy', 'pandas', 'pytorch', 'jupyterlab', 'cudatoolkit'],
};

function stableVersion(manager: PackageManagerKind, name: string): string {
  const value = Number.parseInt(createHash('sha256').update(`${manager}:${name}`).digest('hex').slice(0, 6), 16);
  return `${1 + value % 12}.${value % 23}.${value % 11}`;
}

export class SoftwareEnvironment {
  private readonly packages = new Map<string, PackageRecord>();
  private readonly repositories = new Map<string, GitRepositoryRecord>();
  private readonly dbPath: string;
  private readonly home: string;

  constructor(
    private readonly spec: ComputerSpec,
    private readonly vfs: VirtualFileSystem,
    private readonly processes: ProcessManager,
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
      const record = this.packages.get(`${manager}:${name}`);
      return record ? JSON.stringify(record, null, 2) : `${name} ${stableVersion(manager, name)}\nsource: registry://${manager}/${name}\nstatus: available`;
    }
    if (operation.kind === 'remove') {
      const removed: string[] = [];
      for (const name of operation.names) {
        const key = `${manager}:${name}`;
        const current = this.packages.get(key);
        if (!current) continue;
        await this.vfs.remove(current.installPath);
        this.packages.delete(key);
        removed.push(name);
      }
      await this.persist();
      return removed.length ? `removed ${removed.join(', ')} with ${manager}` : 'nothing to remove';
    }
    if (operation.kind === 'update') {
      const updated = this.listPackages().filter((item) => item.manager === manager);
      for (const item of updated) {
        item.version = stableVersion(manager, `${item.name}:updated`);
        this.packages.set(`${manager}:${item.name}`, item);
      }
      await this.persist();
      return updated.length ? `updated ${updated.length} ${manager} package${updated.length === 1 ? '' : 's'}` : `${manager}: already up to date`;
    }
    const scope = operation.global ? 'system' : this.isProjectManager(manager) ? 'project' : 'user';
    const installed: PackageRecord[] = [];
    for (const name of operation.names) installed.push(await this.install(manager, name, scope, false, cwd));
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
      await this.writeGitMetadata(repo);
      return `Cloning into '${name}'...\nremote: Enumerating objects: 12, done.\nReceiving objects: 100% (12/12), done.`;
    }
    const repo = this.findRepository(cwd);
    if (!repo) throw new Error('fatal: not a git repository (or any parent up to mount point)');
    if (subcommand === 'status') {
      if (rest.includes('--short') || rest.includes('-s')) return repo.staged.map((item) => `A  ${item}`).join('\n');
      return `On branch ${repo.branch}\n${repo.staged.length ? `Changes to be committed:\n${repo.staged.map((item) => `  new file: ${item}`).join('\n')}` : 'nothing to commit, working tree clean'}`;
    }
    if (subcommand === 'add') {
      const targets = rest.filter((arg) => !arg.startsWith('-'));
      repo.staged = targets.length ? targets : ['.'];
      await this.writeGitMetadata(repo);
      return '';
    }
    if (subcommand === 'commit') {
      const messageIndex = rest.findIndex((arg) => arg === '-m' || arg === '--message');
      const message = messageIndex >= 0 ? rest[messageIndex + 1] ?? 'commit' : 'commit';
      const table = this.vfs.hostLayout();
      const treeDigest = createHash('sha256').update(JSON.stringify(Object.keys(table.paths).filter((candidate) => candidate.startsWith(repo.root) && !candidate.includes('/.git/')).sort())).digest('hex');
      const at = new Date().toISOString();
      const hash = createHash('sha1').update(`${repo.head ?? ''}:${message}:${treeDigest}:${at}`).digest('hex');
      const commit: GitCommitRecord = { hash, message, author: 'agent <agent@seed.local>', at, treeDigest };
      repo.commits.unshift(commit); repo.head = hash; repo.staged = [];
      await this.vfs.mkdir(`${repo.root}/.git/objects/${hash.slice(0, 2)}`);
      await this.vfs.writeFile(`${repo.root}/.git/objects/${hash.slice(0, 2)}/${hash.slice(2)}`, JSON.stringify(commit));
      await this.writeGitMetadata(repo);
      return `[${repo.branch} ${hash.slice(0, 7)}] ${message}\n ${Object.keys(table.paths).filter((candidate) => candidate.startsWith(repo.root) && !candidate.includes('/.git/')).length} files changed`;
    }
    if (subcommand === 'log') return repo.commits.map((commit) => rest.includes('--oneline') ? `${commit.hash.slice(0, 7)} ${commit.message}` : `commit ${commit.hash}\nAuthor: ${commit.author}\nDate:   ${commit.at}\n\n    ${commit.message}`).join('\n');
    if (subcommand === 'branch') {
      const create = rest.find((arg) => !arg.startsWith('-'));
      if (create) return `branch '${create}' created at ${(repo.head ?? 'unborn').slice(0, 7)}`;
      return `* ${repo.branch}`;
    }
    if (subcommand === 'switch' || subcommand === 'checkout') {
      const branch = rest.filter((arg) => !arg.startsWith('-')).at(-1);
      if (!branch) throw new Error(`git ${subcommand}: missing branch`);
      repo.branch = branch;
      await this.writeGitMetadata(repo);
      return `Switched to ${rest.includes('-c') || rest.includes('-b') ? 'a new branch' : 'branch'} '${branch}'`;
    }
    if (subcommand === 'remote') {
      if (rest[0] === 'add' && rest[1] && rest[2]) { repo.remotes[rest[1]] = rest[2]; await this.writeGitMetadata(repo); return ''; }
      if (rest.includes('-v')) return Object.entries(repo.remotes).flatMap(([name, url]) => [`${name}\t${url} (fetch)`, `${name}\t${url} (push)`]).join('\n');
      return Object.keys(repo.remotes).join('\n');
    }
    if (['push', 'pull', 'fetch'].includes(subcommand)) {
      const remote = rest.find((arg) => !arg.startsWith('-')) ?? 'origin';
      const url = repo.remotes[remote] ?? 'https://git.seed.local/seed/example.git';
      return subcommand === 'push'
        ? `Enumerating objects: ${Math.max(1, repo.commits.length)}, done.\nTo ${url}\n   ${repo.head?.slice(0, 7) ?? '0000000'}  ${repo.branch} -> ${repo.branch}`
        : `From ${url}\n * branch            ${repo.branch} -> FETCH_HEAD\nAlready up to date.`;
    }
    if (subcommand === 'diff') return repo.staged.length ? repo.staged.map((item) => `diff --git a/${item} b/${item}\nnew file mode 100644`).join('\n') : '';
    if (subcommand === 'rev-parse') return rest.includes('--show-toplevel') ? repo.root : repo.head ?? 'HEAD';
    if (subcommand === 'config') return rest.includes('--list') ? `user.name=agent\nuser.email=agent@seed.local\ninit.defaultbranch=main` : '';
    return 'git commands: init clone status add commit log branch switch checkout remote push pull fetch diff rev-parse config';
  }

  private packageOperation(manager: PackageManagerKind, args: string[]): { kind: 'install' | 'remove' | 'list' | 'search' | 'info' | 'update'; names: string[]; global: boolean } {
    const clean = args.filter((arg) => !arg.startsWith('-') && !['--global', '--user', '--yes'].includes(arg));
    const global = args.includes('-g') || args.includes('--global') || ['apt', 'brew', 'snap', 'flatpak', 'winget', 'choco', 'scoop'].includes(manager);
    if (manager === 'dotnet' && clean[0] === 'tool') clean.splice(0, 1);
    if (manager === 'uv' && ['tool', 'pip'].includes(clean[0] ?? '')) clean.splice(0, 1);
    let verb = clean[0]?.toLowerCase() ?? 'list';
    if (manager === 'pnpm' && verb === 'add') verb = 'install';
    if (manager === 'yarn' && verb === 'add') verb = 'install';
    if (manager === 'composer' && verb === 'require') verb = 'install';
    if (manager === 'go' && verb.includes('@')) verb = 'install';
    const aliases: Record<string, 'install' | 'remove' | 'list' | 'search' | 'info' | 'update'> = {
      install: 'install', add: 'install', require: 'install', remove: 'remove', uninstall: 'remove', delete: 'remove',
      list: 'list', ls: 'list', freeze: 'list', search: 'search', find: 'search', info: 'info', show: 'info', view: 'info',
      update: 'update', upgrade: 'update', outdated: 'update',
    };
    const kind = aliases[verb] ?? (manager === 'go' ? 'install' : 'list');
    const offset = aliases[verb] ? 1 : 0;
    const names = clean.slice(offset).filter((arg) => !['tool', 'pip', 'package'].includes(arg));
    if (kind === 'install' && names.length === 0) names.push(manager === 'npm' || manager === 'pnpm' || manager === 'yarn' ? 'workspace-dependencies' : 'default-package');
    return { kind, names, global };
  }

  private isProjectManager(manager: PackageManagerKind): boolean { return ['npm', 'pnpm', 'yarn', 'composer'].includes(manager); }

  private installPath(manager: PackageManagerKind, name: string, cwd: string): string {
    const safe = name.replaceAll('/', '__').replaceAll('\\', '__');
    if (manager === 'brew') return `/opt/homebrew/Cellar/${safe}/${stableVersion(manager, name)}`;
    if (manager === 'apt') return `/usr/share/${safe}`;
    if (manager === 'snap') return `/snap/${safe}/current`;
    if (manager === 'flatpak') return `/var/lib/flatpak/app/${safe}/active`;
    if (manager === 'winget' || manager === 'choco') return `/C/Program Files/${safe}`;
    if (manager === 'scoop') return `${this.home}/scoop/apps/${safe}/current`;
    if (manager === 'npm') return `${cwd}/node_modules/${safe}`;
    if (manager === 'pnpm') return `${cwd}/node_modules/.pnpm/${safe}@${stableVersion(manager, name)}/node_modules/${safe}`;
    if (manager === 'yarn') return `${cwd}/.yarn/cache/${safe}`;
    if (manager === 'pip' || manager === 'conda') return `${this.home}/.local/lib/python3.13/site-packages/${safe}`;
    if (manager === 'pipx' || manager === 'uv') return `${this.home}/.local/share/${manager}/${safe}`;
    if (manager === 'cargo') return `${this.home}/.cargo/bin/${safe}`;
    if (manager === 'go') return `${this.home}/go/bin/${safe.split('/').at(-1)}`;
    if (manager === 'gem') return `${this.home}/.gem/ruby/3.4.0/gems/${safe}`;
    if (manager === 'composer') return `${cwd}/vendor/${safe}`;
    if (manager === 'dotnet') return `${this.home}/.dotnet/tools/${safe}`;
    return `${this.home}/.local/share/packages/${safe}`;
  }

  private async install(manager: PackageManagerKind, name: string, scope: PackageRecord['scope'], bootstrap = false, cwd = this.home): Promise<PackageRecord> {
    const existing = this.packages.get(`${manager}:${name}`);
    if (existing) return structuredClone(existing);
    const installPath = this.installPath(manager, name, cwd);
    const marker = manager === 'cargo' || manager === 'go' || manager === 'dotnet' ? installPath : `${installPath}/seed-package.json`;
    const record: PackageRecord = {
      id: randomUUID(), name, version: stableVersion(manager, name), manager, scope, installPath,
      installedAt: new Date().toISOString(), files: [marker],
    };
    await this.vfs.writeFile(marker, JSON.stringify({ ...record, source: `registry://${manager}/${name}`, bootstrap }, null, 2));
    this.packages.set(`${manager}:${name}`, record);
    await this.persist();
    return structuredClone(record);
  }

  private async persist(): Promise<void> { await this.vfs.writeFile(this.dbPath, JSON.stringify(this.listPackages(), null, 2)); }

  private async initRepository(root: string): Promise<string> {
    await this.vfs.mkdir(root);
    const repo: GitRepositoryRecord = { root, branch: 'main', remotes: {}, staged: [], commits: [] };
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
    if (repo.head) await this.vfs.writeFile(`${repo.root}/.git/refs/heads/${repo.branch}`, `${repo.head}\n`);
    await this.vfs.writeFile(`${repo.root}/.git/index.seed.json`, JSON.stringify({ staged: repo.staged, commits: repo.commits }, null, 2));
  }
}
