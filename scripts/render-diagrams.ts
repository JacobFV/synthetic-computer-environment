import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Graphviz } from '@hpcc-js/wasm-graphviz';

const root = process.cwd();
const sourceDirectory = path.resolve(root, 'docs/diagrams');
const outputDirectory = path.resolve(root, 'output/diagrams');
const diagrams = ['architecture', 'causal-proof', 'service-isolation'];
const graphviz = await Graphviz.load();

await mkdir(outputDirectory, { recursive: true });
for (const name of diagrams) {
  const dot = await readFile(path.join(sourceDirectory, `${name}.dot`), 'utf8');
  const svg = graphviz.layout(dot, 'svg', 'dot');
  await writeFile(path.join(outputDirectory, `${name}.svg`), svg);
  console.log(path.relative(root, path.join(outputDirectory, `${name}.svg`)));
}
