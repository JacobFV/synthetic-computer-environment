import { layerOrder, workspaceRules } from './model.js';

console.log('flowchart LR');
for (const layer of layerOrder) {
  const packages = Object.entries(workspaceRules).filter(([, rule]) => rule.layer === layer);
  if (!packages.length) continue;
  console.log(`  subgraph ${layer}[${layer}]`);
  for (const [name] of packages) console.log(`    ${node(name)}["${name}"]`);
  console.log('  end');
}
for (const [name, rule] of Object.entries(workspaceRules)) for (const dependency of rule.allowedSeedDependencies) console.log(`  ${node(name)} --> ${node(dependency)}`);

function node(name: string): string { return name.replace(/[^a-z0-9]/gi, '_'); }
