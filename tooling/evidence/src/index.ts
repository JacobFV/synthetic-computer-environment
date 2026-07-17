import { appCatalog } from '@seed/catalog';
import { seed2026Blueprint } from '@seed/ecosystem-seed-2026';

export interface EvidenceScene {
  id: string;
  computerId: string;
  label: string;
  apps: readonly string[];
  assertion: string;
}

export interface EvidenceSuite {
  id: string;
  scenes: readonly EvidenceScene[];
  capture: { viewport: { width: number; height: number }; settleMs: number; deterministicRunId: string };
}

const scenarios: Record<string, ReadonlyArray<readonly [string, readonly string[], string]>> = {
  'mac-studio': [
    ['review assets', ['finder', 'preview', 'photos'], 'VFS assets open in role-appropriate native applications'],
    ['plan the week', ['mail', 'calendar', 'reminders'], 'independent productivity surfaces retain shared calendar state'],
    ['install and inspect', ['app-store', 'settings'], 'registry install state agrees with system settings'],
    ['project discussion', ['slack', 'notion'], 'Slack and Notion use independent service contracts'],
    ['team meeting prep', ['teams', 'calendar'], 'Teams uses teams.seed.local and does not read Slack history'],
    ['debug HTTP exchange', ['safari', 'postman', 'wireshark'], 'one HTTP action produces browser, API-client, and packet evidence'],
    ['browser compatibility', ['chromium', 'firefox'], 'browser identity differs over one virtual network'],
    ['agent workspace', ['chatgpt', 'finder'], 'work context can reference VFS artifacts'],
    ['review a commit', ['vscode', 'github-desktop'], 'editor and Git client agree on repository state'],
    ['AI-assisted branch work', ['cursor', 'gitkraken'], 'Cursor and GitKraken retain distinct information architecture'],
    ['service development', ['docker-desktop', 'postman'], 'container port mapping is reachable through the virtual network'],
    ['design handoff', ['figma', 'preview'], 'design selection and exported document are separately represented'],
    ['conversation and call', ['messages', 'facetime'], 'messaging and call peripherals remain distinct'],
    ['audio session', ['music', 'spotify', 'vlc'], 'library, streaming, and local playback are not one generic surface'],
    ['research notes', ['obsidian', 'libreoffice'], 'local Markdown and paginated office documents differ'],
    ['creative production', ['gimp', 'blender'], 'raster layers and 3D scene graphs differ'],
  ],
  'win-workstation': [
    ['organize and annotate', ['explorer', 'photos', 'notepad'], 'Windows-native file, photo, and text workflows differ'],
    ['triage the day', ['outlook', 'calendar'], 'Outlook and Calendar expose separate navigation models'],
    ['software setup', ['store', 'settings'], 'Microsoft Store receipts appear on the Windows computer'],
    ['community coordination', ['slack', 'discord'], 'Slack workspace and Discord guild state remain isolated'],
    ['channel planning', ['teams', 'outlook'], 'Teams and Outlook use Microsoft service boundaries'],
    ['inspect HTTP traffic', ['edge', 'postman', 'wireshark'], 'Edge navigation emits traceable virtual packets'],
    ['browser compatibility', ['chromium', 'firefox'], 'two browser products render distinct chrome'],
    ['review a commit', ['vscode', 'github-desktop'], 'repository state agrees across applications'],
    ['AI-assisted branch work', ['cursor', 'gitkraken'], 'AI editor and Git graph client remain distinct'],
    ['container API workflow', ['docker-desktop', 'postman'], 'container and request lifecycle controls are functional'],
    ['design and annotate', ['figma', 'paint'], 'collaborative vector design differs from Paint'],
    ['capture and edit', ['snipping-tool', 'paint', 'photos'], 'capture, raster edit, and library stages are explicit'],
    ['audio session', ['spotify', 'vlc', 'audacity'], 'streaming, playback, and multitrack editing differ'],
    ['product planning', ['notion', 'linear'], 'documents and issue tracking use separate schemas'],
    ['administer software', ['task-manager', 'package-center'], 'process and package state are not conflated'],
    ['library and credentials', ['steam', 'bitwarden'], 'game lifecycle and locked secrets remain separate'],
  ],
  'ubuntu-dev': [
    ['edit documentation', ['nautilus', 'document-viewer', 'gedit'], 'GNOME file, preview, and editor surfaces are native'],
    ['plan the week', ['mail', 'calendar'], 'mail and events retain service separation'],
    ['update workstation', ['app-center', 'software-updater'], 'application discovery and OS updates differ'],
    ['community coordination', ['slack', 'discord'], 'two collaboration products never share storage'],
    ['browser compatibility', ['chromium', 'firefox'], 'browser identity is preserved on GNOME'],
    ['inspect HTTP traffic', ['postman', 'wireshark'], 'request and packet evidence share a trace'],
    ['review a branch', ['vscode', 'gitkraken'], 'worktree and visual graph agree'],
    ['toolchain setup', ['cursor', 'package-center'], 'editor tooling and package receipts agree'],
    ['service and data', ['docker-desktop', 'dbeaver'], 'container and database connection state are distinct'],
    ['creative production', ['gimp', 'blender'], '2D layers and 3D scene graphs differ'],
    ['document review', ['libreoffice', 'document-viewer'], 'authoring and reading states differ'],
    ['audio session', ['rhythmbox', 'spotify', 'vlc'], 'local library, service catalog, and player differ'],
    ['remote collaboration', ['zoom', 'discord'], 'meeting and community voice workflows differ'],
    ['system administration', ['system-monitor', 'settings'], 'process state and system policy differ'],
    ['local knowledge and vault', ['obsidian', 'onepassword'], 'VFS notes and locked credentials remain separate'],
    ['library and production', ['steam', 'audacity'], 'software library and audio project state differ'],
  ],
};

export const seedEvidenceSuite: EvidenceSuite = Object.freeze({
  id: 'seed-2026-fidelity-matrix',
  scenes: Object.entries(scenarios).flatMap(([computerId, values]) => values.map(([label, apps, assertion], index) => ({
    id: `${computerId}-${String(index + 1).padStart(2, '0')}`, computerId, label, apps, assertion,
  }))),
  capture: { viewport: { width: 1440, height: 900 }, settleMs: 360, deterministicRunId: 'run-evidence-seed-2026' },
});

export function validateEvidenceSuite(suite: EvidenceSuite = seedEvidenceSuite): string[] {
  const findings: string[] = [];
  const computers = new Map(seed2026Blueprint.computers.map((computer) => [computer.spec.id, computer]));
  const apps = new Map(appCatalog.map((app) => [app.id, app]));
  const ids = new Set<string>();
  for (const scene of suite.scenes) {
    if (ids.has(scene.id)) findings.push(`duplicate scene id: ${scene.id}`);
    ids.add(scene.id);
    const computer = computers.get(scene.computerId);
    if (!computer) { findings.push(`${scene.id}: unknown computer ${scene.computerId}`); continue; }
    const installedAppIds = new Set([...computer.systemAppIds, ...computer.thirdPartyAppIds]);
    if (!scene.apps.length) findings.push(`${scene.id}: no applications`);
    for (const appId of scene.apps) {
      const app = apps.get(appId);
      if (!app) findings.push(`${scene.id}: unknown application ${appId}`);
      else if (!app.supportedOS.includes(computer.spec.os)) findings.push(`${scene.id}: ${appId} does not support ${computer.spec.os}`);
      else if (!installedAppIds.has(appId)) findings.push(`${scene.id}: ${appId} is supported but not installed on ${scene.computerId}`);
    }
  }
  if (suite.scenes.length !== 48) findings.push(`expected 48 scenes, found ${suite.scenes.length}`);
  for (const computer of seed2026Blueprint.computers.filter((candidate) => candidate.spec.displays.length)) {
    const count = suite.scenes.filter((scene) => scene.computerId === computer.spec.id).length;
    if (count !== 16) findings.push(`${computer.spec.id}: expected 16 scenes, found ${count}`);
  }
  return findings;
}
