import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const evidenceRoot = path.resolve(process.env.SEED_EVIDENCE ?? 'artifacts/evidence-v3');
const manifestPath = path.join(evidenceRoot, 'evidence-manifest.json');

interface EvidenceFile {
  path: string;
  bytes: number;
  sha256: string;
  media?: { codec?: string; width?: number; height?: number; durationSeconds?: number };
}

async function walk(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (absolute === manifestPath || absolute.includes(`${path.sep}recordings${path.sep}raw${path.sep}`)) continue;
    if (entry.isDirectory()) paths.push(...await walk(absolute));
    else if (entry.isFile()) paths.push(absolute);
  }
  return paths.sort();
}

function pngMedia(bytes: Buffer): EvidenceFile['media'] | undefined {
  const signature = '89504e470d0a1a0a';
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature) return undefined;
  return { codec: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function videoMedia(file: string): Promise<EvidenceFile['media'] | undefined> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height:format=duration',
      '-of', 'json', file,
    ]);
    const parsed = JSON.parse(stdout) as { streams?: Array<{ codec_name?: string; width?: number; height?: number }>; format?: { duration?: string } };
    const stream = parsed.streams?.[0];
    return {
      codec: stream?.codec_name,
      width: stream?.width,
      height: stream?.height,
      durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : undefined,
    };
  } catch {
    return undefined;
  }
}

const files: EvidenceFile[] = [];
for (const absolute of await walk(evidenceRoot)) {
  const bytes = await readFile(absolute);
  const relative = path.relative(evidenceRoot, absolute).split(path.sep).join('/');
  files.push({
    path: relative,
    bytes: (await stat(absolute)).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    media: absolute.endsWith('.png') ? pngMedia(bytes) : absolute.endsWith('.mp4') ? await videoMedia(absolute) : undefined,
  });
}

const loadJson = async <T>(file: string): Promise<T | undefined> => {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return undefined; }
};

const portraitIndex = await loadJson<unknown[]>(path.join(evidenceRoot, 'app-portrait-index.json')) ?? [];
const snapshot = await loadJson<{
  runId?: string;
  appCatalog?: unknown[];
  computers?: Array<{ installedApps?: unknown[] }>;
  packets?: unknown[];
  applicationExecutions?: unknown[];
}>(path.join(evidenceRoot, 'runtime-snapshot.json'));
const audit = await loadJson<{ inspected?: number; errors?: number; warnings?: number }>(path.resolve('artifacts/ui-audit-v3.json'));
const countPrefix = (prefix: string, suffix?: string) => files.filter((file) => file.path.startsWith(prefix) && (!suffix || file.path.endsWith(suffix))).length;

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceRoot: path.relative(root, evidenceRoot),
  runId: snapshot?.runId,
  summary: {
    workflowStates: countPrefix('48-states/', '.png'),
    workflowPlates: countPrefix('workflow-plates/', '.png'),
    appPortraits: portraitIndex.length,
    appPortraitPlates: countPrefix('app-portrait-plates/', '.png'),
    iconWalls: countPrefix('icon-walls/', '.png'),
    motionRecordings: countPrefix('recordings/', '.mp4'),
    recordingPosters: countPrefix('recordings/', '-poster.png'),
    catalogApplications: snapshot?.appCatalog?.length ?? 0,
    installedApplicationInstances: snapshot?.computers?.reduce((sum, computer) => sum + (computer.installedApps?.length ?? 0), 0) ?? 0,
    packetRecords: snapshot?.packets?.length ?? 0,
    applicationExecutions: snapshot?.applicationExecutions?.length ?? 0,
    uiAudit: audit,
    hashedFiles: files.length,
    hashedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  },
  files,
};

await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest.summary, null, 2));
