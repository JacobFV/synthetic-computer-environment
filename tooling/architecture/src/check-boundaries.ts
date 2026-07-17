import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceRules } from './model.js';

interface PackageRecord { name: string; dir: string; manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; scripts?: Record<string, string> } }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const roots = ['packages', 'apps', 'ecosystems', 'tooling'];
const packages: PackageRecord[] = [];

for (const container of roots) {
  const base = path.join(root, container);
  for (const entry of await readdir(base, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(base, entry.name);
    const packageFile = path.join(dir, 'package.json');
    try {
      const manifest = JSON.parse(await readFile(packageFile, 'utf8')) as PackageRecord['manifest'] & { name: string };
      packages.push({ name: manifest.name, dir, manifest });
    } catch {}
  }
}

const findings: string[] = [];
const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
for (const pkg of packages) {
  const rule = workspaceRules[pkg.name];
  if (!rule) { findings.push(`${pkg.name}: no architecture rule`); continue; }
  const dependencies = { ...pkg.manifest.dependencies, ...pkg.manifest.devDependencies, ...pkg.manifest.peerDependencies };
  const internal = Object.keys(dependencies).filter((name) => name.startsWith('@seed/'));
  for (const dependency of internal) {
    if (!byName.has(dependency)) findings.push(`${pkg.name}: internal dependency ${dependency} is not a workspace package`);
    if (!rule.allowedSeedDependencies.includes(dependency)) findings.push(`${pkg.name}: ${rule.layer} layer may not depend on ${dependency}`);
    if (!String(dependencies[dependency]).startsWith('workspace:')) findings.push(`${pkg.name}: ${dependency} must use the workspace protocol`);
  }
  for (const allowed of rule.allowedSeedDependencies) if (internal.includes(allowed) && !byName.has(allowed)) findings.push(`${pkg.name}: allowed dependency ${allowed} is missing`);
  if (await exists(path.join(pkg.dir, 'tsconfig.json'))) {
    if (!pkg.manifest.scripts?.build) findings.push(`${pkg.name}: TypeScript workspace has no build task`);
    if (!pkg.manifest.scripts?.typecheck) findings.push(`${pkg.name}: TypeScript workspace has no typecheck task`);
  }
  for (const file of await sourceFiles(path.join(pkg.dir, 'src'))) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!;
      if (specifier.startsWith('@seed/') && !internal.includes(specifier)) findings.push(`${pkg.name}: imports undeclared workspace package ${specifier} in ${path.relative(root, file)}`);
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), specifier);
        if (!resolved.startsWith(`${pkg.dir}${path.sep}`)) findings.push(`${pkg.name}: relative import crosses package boundary in ${path.relative(root, file)}`);
      }
    }
  }
}

for (const name of Object.keys(workspaceRules)) if (!byName.has(name)) findings.push(`${name}: architecture rule has no workspace package`);

const visiting = new Set<string>();
const visited = new Set<string>();
function visit(name: string, chain: string[]): void {
  if (visiting.has(name)) { findings.push(`dependency cycle: ${[...chain, name].join(' -> ')}`); return; }
  if (visited.has(name)) return;
  visiting.add(name);
  const pkg = byName.get(name);
  const dependencies = { ...pkg?.manifest.dependencies, ...pkg?.manifest.devDependencies, ...pkg?.manifest.peerDependencies };
  for (const dependency of Object.keys(dependencies).filter((value) => byName.has(value))) visit(dependency, [...chain, name]);
  visiting.delete(name); visited.add(name);
}
for (const pkg of packages) visit(pkg.name, []);

if (findings.length) {
  console.error(`Architecture boundary check failed:\n- ${findings.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ packages: packages.length, internalEdges: packages.reduce((sum, pkg) => sum + Object.keys({ ...pkg.manifest.dependencies, ...pkg.manifest.devDependencies }).filter((name) => name.startsWith('@seed/')).length, 0), status: 'valid' }, null, 2));
}

async function sourceFiles(dir: string): Promise<string[]> {
  if (!await exists(dir)) return [];
  const result: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(target));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(target);
  }
  return result;
}

async function exists(target: string): Promise<boolean> {
  try { return (await stat(target)).isFile() || (await stat(target)).isDirectory(); } catch { return false; }
}
