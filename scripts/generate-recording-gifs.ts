import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(process.env.SEED_RECORDINGS ?? 'artifacts/evidence-v3/recordings');

async function run(input: string, output: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-y', '-i', input,
      '-filter_complex', '[0:v]fps=8,scale=960:-1:flags=lanczos,split[v0][v1];[v0]palettegen=max_colors=128:stats_mode=diff[p];[v1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
      '-loop', '0', output,
    ], { stdio: 'ignore' });
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code} for ${path.basename(input)}`)));
    child.once('error', reject);
  });
}

for (const entry of (await readdir(directory)).filter((name) => name.endsWith('.mp4')).sort()) {
  const input = path.join(directory, entry);
  const output = path.join(directory, entry.replace(/\.mp4$/, '.gif'));
  try {
    const [inputStat, outputStat] = await Promise.all([stat(input), stat(output)]);
    if (outputStat.size > 100_000 && outputStat.mtimeMs >= inputStat.mtimeMs) {
      console.log(`preserved ${path.basename(output)}`);
      continue;
    }
  } catch {}
  await run(input, output);
  console.log(`generated ${path.basename(output)}`);
}
