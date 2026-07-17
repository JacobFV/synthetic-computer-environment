export type WorkspaceLayer = 'contract' | 'sdk' | 'os' | 'catalog' | 'runtime' | 'surface' | 'ecosystem' | 'application' | 'tooling';

export interface WorkspaceRule {
  layer: WorkspaceLayer;
  allowedSeedDependencies: readonly string[];
  purpose: string;
}

export const workspaceRules: Readonly<Record<string, WorkspaceRule>> = {
  '@seed/protocol': { layer: 'contract', allowedSeedDependencies: [], purpose: 'Shared serializable contracts; imports nothing internal.' },
  '@seed/app-sdk': { layer: 'sdk', allowedSeedDependencies: ['@seed/protocol'], purpose: 'Application definition and package-authoring SDK.' },
  '@seed/os-core': { layer: 'os', allowedSeedDependencies: ['@seed/protocol'], purpose: 'OS profile schema and invariants.' },
  '@seed/os-macos': { layer: 'os', allowedSeedDependencies: ['@seed/os-core', '@seed/protocol'], purpose: 'macOS 26 profile.' },
  '@seed/os-windows': { layer: 'os', allowedSeedDependencies: ['@seed/os-core', '@seed/protocol'], purpose: 'Windows 11 26H2 profile.' },
  '@seed/os-ubuntu': { layer: 'os', allowedSeedDependencies: ['@seed/os-core', '@seed/protocol'], purpose: 'Ubuntu 26.04 profile.' },
  '@seed/catalog': { layer: 'catalog', allowedSeedDependencies: ['@seed/app-sdk', '@seed/protocol'], purpose: 'Application definitions and service contracts.' },
  '@seed/kernel': { layer: 'runtime', allowedSeedDependencies: ['@seed/catalog', '@seed/protocol'], purpose: 'VFS, processes, shell, networking, software, app runtime, trajectory.' },
  '@seed/ui-surfaces': { layer: 'surface', allowedSeedDependencies: ['@seed/protocol'], purpose: 'Product-specific surface and interaction contracts.' },
  '@seed/ecosystem-seed-2026': { layer: 'ecosystem', allowedSeedDependencies: ['@seed/catalog', '@seed/os-core', '@seed/os-macos', '@seed/os-windows', '@seed/os-ubuntu', '@seed/protocol', '@seed/ui-surfaces'], purpose: 'Seed 2026 computers, services, app sets, gateways, and invariants.' },
  '@seed/simulator': { layer: 'application', allowedSeedDependencies: ['@seed/catalog', '@seed/ecosystem-seed-2026', '@seed/kernel', '@seed/os-macos', '@seed/os-windows', '@seed/os-ubuntu', '@seed/protocol', '@seed/ui-surfaces'], purpose: 'Browser client and single-process simulation server.' },
  '@seed/chatgpt-workspace': { layer: 'application', allowedSeedDependencies: [], purpose: 'Deployable full-stack ChatGPT workspace application.' },
  '@seed/tooling-evidence': { layer: 'tooling', allowedSeedDependencies: ['@seed/catalog', '@seed/ecosystem-seed-2026'], purpose: 'Typed, validated screenshot and trajectory evidence plans.' },
  '@seed/tooling-architecture': { layer: 'tooling', allowedSeedDependencies: [], purpose: 'Dependency boundary validation and architecture reporting.' },
};

export const layerOrder: readonly WorkspaceLayer[] = ['contract', 'sdk', 'os', 'catalog', 'runtime', 'surface', 'ecosystem', 'application', 'tooling'];
