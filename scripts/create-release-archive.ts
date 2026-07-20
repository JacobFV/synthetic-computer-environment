import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };
const releaseName = `seed-computer-ecosystem-${packageJson.version}`;
const archive = path.join(root, 'artifacts', `${releaseName}.zip`);
const stage = await mkdtemp(path.join(tmpdir(), `${releaseName}-`));
const releaseRoot = path.join(stage, releaseName);

async function copyPath(relative: string, filter?: (source: string) => boolean) {
  const source = path.join(root, relative);
  try { await stat(source); } catch { return; }
  const destination = path.join(releaseRoot, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, preserveTimestamps: true, filter });
}

try {
  await mkdir(releaseRoot, { recursive: true });
  const { stdout } = await execFileAsync('git', [
    'ls-files',
    '-z',
  ], { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });

  for (const relative of stdout.toString('utf8').split('\0').filter(Boolean)) await copyPath(relative);

  await copyPath('artifacts/ui-audit-v3.json');
  const rawRecordingRoot = path.join(root, 'artifacts', 'evidence-v3', 'recordings', 'raw');
  await copyPath('artifacts/evidence-v3', (source) => source !== rawRecordingRoot && !source.startsWith(`${rawRecordingRoot}${path.sep}`));
  await copyPath('output/diagrams');
  await copyPath('output/pdf/seed-computer-ecosystem-app-survey-v0.3.0.pdf');
  await copyPath('output/seed-computer-ecosystem-research-evidence-v0.3.0.pptx');

  const { stdout: revision } = await execFileAsync('git', [
    'rev-parse',
    'HEAD',
  ], { cwd: root });
  const bundleName = `${releaseName}.bundle`;
  await execFileAsync('git', [
    'bundle',
    'create',
    path.join(releaseRoot, bundleName),
    '--all',
  ], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  await writeFile(path.join(releaseRoot, 'release-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    name: releaseName,
    version: packageJson.version,
    revision: revision.trim(),
    sourceAuthority: 'tracked files from the repository Git store',
    portableGitBundle: bundleName,
    generatedDeliverables: [
      'artifacts/evidence-v3',
      'artifacts/ui-audit-v3.json',
      'output/diagrams',
      'output/pdf/seed-computer-ecosystem-app-survey-v0.3.0.pdf',
      'output/seed-computer-ecosystem-research-evidence-v0.3.0.pptx',
    ],
    exclusions: ['node_modules', '.state', 'dist', '.next', 'artifacts/evidence-v3/recordings/raw'],
  }, null, 2));

  await mkdir(path.dirname(archive), { recursive: true });
  await rm(archive, { force: true });
  await rm(`${archive}.sha256`, { force: true });
  await execFileAsync('zip', ['-q', '-r', archive, releaseName], { cwd: stage, maxBuffer: 16 * 1024 * 1024 });
  const archiveBytes = await readFile(archive);
  const sha256 = createHash('sha256').update(archiveBytes).digest('hex');
  await writeFile(`${archive}.sha256`, `${sha256}  ${path.basename(archive)}\n`);
  console.log(JSON.stringify({ archive, bytes: archiveBytes.byteLength, sha256 }, null, 2));
} finally {
  await rm(stage, { recursive: true, force: true });
}
