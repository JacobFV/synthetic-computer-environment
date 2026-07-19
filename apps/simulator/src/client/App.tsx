import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindow as AppWindowIcon, BatteryFull, ChevronUp, CircleUserRound,
  ExternalLink, FolderPlus, HardDrive, Info, Menu, Minus, Monitor, Pencil, Plus,
  Power, Radio, RotateCw, Search, Settings, ShieldCheck, Trash2, Volume2, Wifi, X,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import type { AppManifest, ComputerSnapshot, OSKind, SimulationSnapshot } from '@seed/protocol';
import { api } from './api';
import { appIconSource, PlatformIconContext } from './appIcons';
import { AppSpecificSurface } from './AppSurfaces';
import { AppIcon, ContextMenuContext, ContextMenuLayer, useContextMenu } from './shared';
import type { MenuEntry, MenuItem, MenuRequest, WindowState } from './shared';
import { TerminalApp } from './apps/TerminalApp';
import { FilesApp } from './apps/FilesApp';
import { TextEditorApp } from './apps/TextEditorApp';
import { StoreApp } from './apps/StoreApp';
import { SettingsApp } from './apps/SettingsApp';
import { BrowserApp } from './apps/BrowserApp';
import { ChatGPTApp } from './apps/ChatGPTApp';
import { CollabApp } from './apps/CollabApp';
import { WiresharkApp } from './apps/WiresharkApp';
import { CodeApp } from './apps/CodeApp';
import { PackageCenterApp } from './apps/PackageCenterApp';
import { GitClientApp } from './apps/GitClientApp';
import { ContainerApp } from './apps/ContainerApp';
import { ApiClientApp } from './apps/ApiClientApp';
import { ProcessApp } from './apps/ProcessApp';
import { DesignApp } from './apps/DesignApp';

function useSnapshot() {
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>();
  useEffect(() => {
    api.state().then(setSnapshot);
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events`);
    socket.onmessage = (event) => { const message = JSON.parse(event.data); if (message.type === 'snapshot') setSnapshot(message.payload); };
    return () => socket.close();
  }, []);
  return [snapshot, setSnapshot] as const;
}

type WorkspaceTab = { id: string; name: string; computerIds: string[] };
type PersistedWorkspace = { runId: string; tabs: WorkspaceTab[]; activeTabId: string; windows: Record<string, WindowState[]>; tabSeq: number };
const SPAWNABLE: OSKind[] = ['macos', 'windows', 'ubuntu'];
const osLabel = (os: OSKind) => os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : 'Ubuntu';

const WORKSPACE_KEY = 'seed:workspace';
function loadWorkspace(): PersistedWorkspace | undefined {
  try { const raw = localStorage.getItem(WORKSPACE_KEY); return raw ? (JSON.parse(raw) as PersistedWorkspace) : undefined; } catch { return undefined; }
}
function saveWorkspace(value: PersistedWorkspace): void {
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function BootScreen() {
  return <div className="boot-screen"><div className="boot-mark">seed</div><div className="boot-progress"><i /></div><span>booting deterministic computer fabric…</span></div>;
}

export function App() {
  const [snapshot, setSnapshot] = useSnapshot();
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const demo = params.get('demo') ?? '';
  const scriptedApps = useMemo(() => (params.get('apps') ?? '').split(',').map((item) => item.trim()).filter(Boolean), [params]);
  const scene = Number(params.get('scene') ?? '0');
  const legacy = params.get('chrome') === '0' || params.get('single') === '1';
  const [menu, setMenu] = useState<MenuRequest>(null);
  const openMenu = useCallback((event: React.MouseEvent, items: MenuEntry[]) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, items: items.filter(Boolean) as MenuItem[] });
  }, []);
  const displayComputers = snapshot?.computers.filter((item) => item.spec.displays.length > 0) ?? [];

  const tabSeq = useRef(0);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [spawning, setSpawning] = useState<OSKind | undefined>(undefined);
  // Window state lives here (keyed by computer) so a machine's open windows survive tab switches.
  const [windowsByComputer, setWindowsByComputer] = useState<Record<string, WindowState[]>>({});
  const [restored, setRestored] = useState(false);

  // Restore the persisted workspace (tabs + open windows) for this run once the snapshot is available.
  useEffect(() => {
    if (legacy || restored || !snapshot) return;
    const store = loadWorkspace();
    if (store && store.runId === snapshot.runId) {
      setWindowsByComputer(store.windows ?? {});
      if (store.tabs?.length) {
        setTabs(store.tabs);
        setActiveTabId(store.tabs.some((tab) => tab.id === store.activeTabId) ? store.activeTabId : store.tabs[0]!.id);
        tabSeq.current = Math.max(store.tabSeq ?? 0, ...store.tabs.map((tab) => Number(tab.id.replace('tab-', '')) || 0));
      }
    }
    setRestored(true);
  }, [legacy, restored, snapshot]);

  // Persist the workspace on every change (scoped to this run id).
  useEffect(() => {
    if (legacy || !restored || !snapshot) return;
    saveWorkspace({ runId: snapshot.runId, tabs, activeTabId, windows: windowsByComputer, tabSeq: tabSeq.current });
  }, [legacy, restored, snapshot, tabs, activeTabId, windowsByComputer]);

  useEffect(() => {
    if (legacy || !restored || tabs.length || !displayComputers.length) return;
    const initial = params.get('computer');
    const ids = initial && displayComputers.some((item) => item.spec.id === initial) ? [initial] : displayComputers.map((item) => item.spec.id);
    const id = `tab-${++tabSeq.current}`;
    setTabs([{ id, name: initial ? displayComputers.find((item) => item.spec.id === initial)?.spec.hostname ?? 'Workspace' : 'All displays', computerIds: ids }]);
    setActiveTabId(id);
  }, [legacy, restored, tabs.length, displayComputers.length, params]);

  if (!snapshot) return <BootScreen />;

  if (legacy) {
    const computer = displayComputers.find((item) => item.spec.id === (params.get('computer') ?? 'mac-studio')) ?? displayComputers[0];
    if (!computer) return <BootScreen />;
    return <ContextMenuContext.Provider value={openMenu}><main className="simulator">
      <ComputerPane computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} demo={demo} scriptedApps={scriptedApps} scene={scene} initialLauncher={params.get('launcher') === '1'} />
      <ContextMenuLayer menu={menu} onClose={() => setMenu(null)} />
    </main></ContextMenuContext.Provider>;
  }

  const activeTab = tabs.find((item) => item.id === activeTabId) ?? tabs[0];
  const paneComputers = (activeTab?.computerIds ?? []).map((id) => displayComputers.find((item) => item.spec.id === id)).filter(Boolean) as ComputerSnapshot[];

  const addTab = () => { const id = `tab-${++tabSeq.current}`; setTabs((current) => [...current, { id, name: 'New tab', computerIds: [] }]); setActiveTabId(id); setListOpen(false); setConfigOpen(false); };
  const closeTab = (id: string) => {
    const index = tabs.findIndex((item) => item.id === id);
    const rest = tabs.filter((item) => item.id !== id);
    if (!rest.length) return;
    setTabs(rest);
    if (id === activeTabId) setActiveTabId(rest[Math.max(0, index - 1)]?.id ?? rest[0]!.id);
  };
  const toggleInActiveTab = (cid: string) => {
    const tabId = activeTab?.id; if (!tabId) return;
    setTabs((current) => current.map((tab) => tab.id !== tabId ? tab : {
      ...tab,
      computerIds: tab.computerIds.includes(cid) ? tab.computerIds.filter((item) => item !== cid) : [...tab.computerIds, cid],
      name: tab.name === 'New tab' && !tab.computerIds.includes(cid) ? displayComputers.find((item) => item.spec.id === cid)?.spec.hostname ?? tab.name : tab.name,
    }));
  };
  const spawn = async (os: OSKind) => {
    const tabId = activeTab?.id;
    setSpawning(os);
    try {
      const spec = await api.spawnComputer(os);
      setSnapshot(await api.state());
      if (tabId) setTabs((current) => current.map((tab) => tab.id === tabId ? { ...tab, computerIds: [...tab.computerIds, spec.id], name: tab.name === 'New tab' ? spec.hostname : tab.name } : tab));
    } finally { setSpawning(undefined); }
  };

  return <ContextMenuContext.Provider value={openMenu}><main className="simulator tabbed">
    <TabBar tabs={tabs} computers={displayComputers} activeId={activeTab?.id} onActivate={(id) => { setActiveTabId(id); setListOpen(false); setConfigOpen(false); }} onClose={closeTab} onNew={addTab}
      listOpen={listOpen} configOpen={configOpen} onToggleList={() => { setListOpen((value) => !value); setConfigOpen(false); }} onToggleConfig={() => { setConfigOpen((value) => !value); setListOpen(false); }} />
    <div className="workspace">
      {paneComputers.length
        ? <div className="pane-row">{paneComputers.map((computer) => <section className="pane" key={computer.spec.id}>
            <header className="pane-head"><i className={`os-dot ${computer.spec.os}`} /><b>{computer.spec.hostname}</b><small>{osLabel(computer.spec.os)} · {computer.spec.ipv4}</small><button className="pane-remove" aria-label="Remove from tab" title="Remove from this tab" onClick={() => toggleInActiveTab(computer.spec.id)}><X size={13} /></button></header>
            <div className="pane-body"><ComputerPane computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} demo={demo} scriptedApps={scriptedApps} scene={scene} windows={windowsByComputer[computer.spec.id]} setWindows={(updater) => setWindowsByComputer((prev) => ({ ...prev, [computer.spec.id]: updater(prev[computer.spec.id] ?? []) }))} /></div>
          </section>)}</div>
        : <EmptyTab computers={displayComputers} activeIds={activeTab?.computerIds ?? []} onToggle={toggleInActiveTab} onSpawn={spawn} spawning={spawning} />}
    </div>
    {listOpen && <ComputerListPanel computers={displayComputers} allComputers={snapshot.computers} activeIds={activeTab?.computerIds ?? []} onToggle={toggleInActiveTab} onSpawn={spawn} spawning={spawning} onClose={() => setListOpen(false)} />}
    {configOpen && <ConfigOverlay snapshot={snapshot} onClose={() => setConfigOpen(false)} onSpawn={spawn} spawning={spawning} />}
    <ContextMenuLayer menu={menu} onClose={() => setMenu(null)} />
  </main></ContextMenuContext.Provider>;
}

function TabBar({ tabs, computers, activeId, onActivate, onClose, onNew, listOpen, configOpen, onToggleList, onToggleConfig }: { tabs: WorkspaceTab[]; computers: ComputerSnapshot[]; activeId?: string; onActivate(id: string): void; onClose(id: string): void; onNew(): void; listOpen: boolean; configOpen: boolean; onToggleList(): void; onToggleConfig(): void }) {
  const osOf = (id: string) => computers.find((item) => item.spec.id === id)?.spec.os;
  return <div className="tabbar">
    <div className="tabbar-brand"><Radio size={14} /><b>seed</b></div>
    <div className="tabstrip">{tabs.map((tab) => <button key={tab.id} className={`wtab ${tab.id === activeId ? 'active' : ''}`} onClick={() => onActivate(tab.id)} title={tab.name}>
      <span className="wtab-dots">{tab.computerIds.length ? tab.computerIds.slice(0, 3).map((id, index) => <i key={index} className={`os-dot ${osOf(id) ?? ''}`} />) : <i className="os-dot empty" />}</span>
      <span className="wtab-name">{tab.name}</span>
      {tab.computerIds.length > 1 && <span className="wtab-count">{tab.computerIds.length}</span>}
      {tabs.length > 1 && <span className="wtab-close" role="button" aria-label="Close tab" onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}><X size={12} /></span>}
    </button>)}</div>
    <div className="tabbar-actions">
      <button title="New tab" aria-label="New tab" onClick={onNew}><Plus size={17} /></button>
      <button title="Computers" aria-label="Computers" className={listOpen ? 'active' : ''} onClick={onToggleList}><Menu size={16} /></button>
      <button title="Simulator settings" aria-label="Simulator settings" className={configOpen ? 'active' : ''} onClick={onToggleConfig}><Settings size={16} /></button>
    </div>
  </div>;
}

function SpawnRow({ onSpawn, spawning }: { onSpawn(os: OSKind): void; spawning?: OSKind }) {
  return <div className="spawn-row">{SPAWNABLE.map((os) => <button key={os} disabled={Boolean(spawning)} onClick={() => onSpawn(os)}><i className={`os-dot ${os}`} />{spawning === os ? 'launching…' : osLabel(os)}<Plus size={13} /></button>)}</div>;
}

function EmptyTab({ computers, activeIds, onToggle, onSpawn, spawning }: { computers: ComputerSnapshot[]; activeIds: string[]; onToggle(id: string): void; onSpawn(os: OSKind): void; spawning?: OSKind }) {
  return <div className="empty-tab"><div className="empty-card">
    <span className="empty-mark"><Monitor size={26} /></span>
    <h2>Choose displays for this tab</h2>
    <p>Pick one or more computers to surface their live desktops side by side in this tab.</p>
    <div className="empty-grid">{computers.map((computer) => <button key={computer.spec.id} className={activeIds.includes(computer.spec.id) ? 'picked' : ''} onClick={() => onToggle(computer.spec.id)}><i className={`os-dot ${computer.spec.os}`} /><b>{computer.spec.hostname}</b><small>{osLabel(computer.spec.os)} · {computer.spec.ipv4}</small></button>)}</div>
    <div className="empty-launch"><span>Need another machine?</span><SpawnRow onSpawn={onSpawn} spawning={spawning} /></div>
  </div></div>;
}

function ComputerListPanel({ computers, allComputers, activeIds, onToggle, onSpawn, spawning, onClose }: { computers: ComputerSnapshot[]; allComputers: ComputerSnapshot[]; activeIds: string[]; onToggle(id: string): void; onSpawn(os: OSKind): void; spawning?: OSKind; onClose(): void }) {
  const serviceNodes = allComputers.filter((item) => item.spec.displays.length === 0);
  return <><div className="panel-scrim" onMouseDown={onClose} /><aside className="computer-panel" onMouseDown={(event) => event.stopPropagation()}>
    <header><b>Computers</b><span>{allComputers.length} running</span></header>
    <div className="cp-scroll">
      <h5>Displays · shown in this tab</h5>
      {computers.map((computer) => <label key={computer.spec.id} className="cp-row"><i className={`os-dot ${computer.spec.os}`} /><span className="cp-name"><b>{computer.spec.hostname}</b><small>{osLabel(computer.spec.os)} · {computer.spec.ipv4}</small></span><input type="checkbox" checked={activeIds.includes(computer.spec.id)} onChange={() => onToggle(computer.spec.id)} /></label>)}
      {serviceNodes.length > 0 && <><h5>Service nodes</h5>{serviceNodes.map((computer) => <div key={computer.spec.id} className="cp-row cp-service"><i className={`os-dot ${computer.spec.os}`} /><span className="cp-name"><b>{computer.spec.hostname}</b><small>headless · {computer.spec.ipv4}</small></span><span className="cp-badge">service</span></div>)}</>}
    </div>
    <footer><span>Launch a computer</span><SpawnRow onSpawn={onSpawn} spawning={spawning} /></footer>
  </aside></>;
}

function ConfigOverlay({ snapshot, onClose, onSpawn, spawning }: { snapshot: SimulationSnapshot; onClose(): void; onSpawn(os: OSKind): void; spawning?: OSKind }) {
  return <div className="config-scrim" onMouseDown={onClose}><div className="config-overlay" onMouseDown={(event) => event.stopPropagation()}>
    <header><Settings size={16} /><b>Simulator configuration</b><button aria-label="Close" onClick={onClose}><X size={16} /></button></header>
    <div className="config-body">
      <section><h4>Runtime</h4><div className="config-grid"><p><span>Run ID</span><b>{snapshot.runId}</b></p><p><span>Topology</span><b>{snapshot.topology.id} · v{snapshot.topology.version}</b></p><p><span>Computers</span><b>{snapshot.computers.length}</b></p><p><span>DNS records</span><b>{snapshot.dns.length}</b></p><p><span>Packets traced</span><b>{snapshot.packets.length}</b></p><p><span>Trajectory</span><b>{snapshot.trajectoryLength} events</b></p></div></section>
      <section><h4>Computers</h4><div className="config-list">{snapshot.computers.map((computer) => <div className="config-comp" key={computer.spec.id}><i className={`os-dot ${computer.spec.os}`} /><b>{computer.spec.hostname}</b><small>{osLabel(computer.spec.os)}</small><code>{computer.spec.ipv4}</code><span>{computer.processes.length} proc · {computer.installedApps.length} apps{computer.spec.displays.length ? '' : ' · headless'}</span></div>)}</div></section>
      <section><h4>Gateway policy</h4><div className="config-list">{snapshot.gateways.map((rule) => <div className="config-gate" key={rule.id}><i className={rule.enabled ? 'on' : ''} /><b>{rule.name}</b><small>{rule.hostnames.join(', ')}</small></div>)}</div></section>
      <section><h4>Launch a computer</h4><SpawnRow onSpawn={onSpawn} spawning={spawning} /></section>
    </div>
    <a className="config-jsonl" href="/api/trajectory">Export trajectory JSONL →</a>
  </div></div>;
}

function ComputerPane({ computer, snapshot, setSnapshot, demo, scriptedApps, scene, initialLauncher, windows: windowsProp, setWindows: setWindowsProp }: { computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void; demo: string; scriptedApps: string[]; scene: number; initialLauncher?: boolean; windows?: WindowState[]; setWindows?: (updater: (list: WindowState[]) => WindowState[]) => void }) {
  // Controlled (App owns the per-computer window store, so windows persist across tab switches) or self-managed (legacy single-pane mode).
  const controlled = setWindowsProp !== undefined;
  const [localWindows, setLocalWindows] = useState<WindowState[]>([]);
  const windows = controlled ? (windowsProp ?? []) : localWindows;
  const setWindows = useCallback((updater: (list: WindowState[]) => WindowState[]) => { if (setWindowsProp) setWindowsProp(updater); else setLocalWindows(updater); }, [setWindowsProp]);
  const [launcherOpen, setLauncherOpen] = useState(Boolean(initialLauncher));
  const initialized = useRef(false);
  const computerId = computer.spec.id;
  const nextZ = (list: WindowState[]) => (list.length ? Math.max(...list.map((item) => item.z)) : 20) + 1;

  const openApp = useCallback((id: string, arranged?: Partial<WindowState>) => {
    const manifest = snapshot.appCatalog.find((item) => item.id === id);
    if (!manifest) return;
    setWindows((current) => {
      if (current.some((item) => item.id === id)) return current.map((item) => item.id === id ? { ...item, minimized: false, z: nextZ(current) } : item);
      const index = current.length;
      const size = manifest.defaultSize ?? { width: 760, height: 520 };
      return [...current, { id, x: 90 + index * 42, y: 68 + index * 34, width: size.width, height: size.height, minimized: false, maximized: false, z: nextZ(current), ...arranged }];
    });
    setLauncherOpen(false);
    api.action({ computerId, displayId: 'main', actor: 'human', kind: 'app', action: 'app.open', target: id });
  }, [snapshot, computerId]);

  useEffect(() => {
    if (controlled ? windowsProp !== undefined : initialized.current) return;
    initialized.current = true;
    const presets: Record<string, Array<[string, Partial<WindowState>]>> = {
      mac: [['finder', { x: 54, y: 70, width: 660, height: 570 }], ['chatgpt', { x: 440, y: 86, width: 920, height: 690 }]],
      appstore: [['settings', { x: 58, y: 138, width: 650, height: 500 }], ['app-store', { x: 455, y: 70, width: 910, height: 650 }]],
      windows: [['explorer', { x: 48, y: 90, width: 720, height: 610 }], ['chromium', { x: 590, y: 62, width: 790, height: 650 }]],
      ubuntu: [['nautilus', { x: 94, y: 74, width: 690, height: 590 }], ['wireshark', { x: 650, y: 120, width: 710, height: 520 }]],
      packages: [['package-center', { x: 110, y: 72, width: 1040, height: 690 }]],
      git: [['github-desktop', { x: 130, y: 76, width: 1040, height: 690 }]],
      collab: [[computer.spec.os === 'windows' ? 'teams' : 'slack', { x: 130, y: 68, width: 1080, height: 700 }]],
    };
    const available = new Set(computer.installedApps.map((item) => item.id));
    const layout = (id: string, index: number): [string, Partial<WindowState>] => {
      if (scriptedApps.length === 1) return [id, { x: 70 + scene % 5 * 12, y: 48 + scene % 4 * 10, width: 1240 - scene % 3 * 80, height: 760 - scene % 2 * 55, maximized: scene % 6 === 5 }];
      if (scriptedApps.length === 2) return [id, index === 0 ? { x: 34, y: 56, width: 760, height: 710 } : { x: 650, y: 114, width: 750, height: 670 }];
      return [id, { x: 35 + index * 330 + scene % 3 * 15, y: 55 + (index % 2) * 235, width: 720, height: 520 }];
    };
    const presetKey = demo || (computer.spec.os === 'macos' ? 'mac' : computer.spec.os);
    const selected = scriptedApps.length ? scriptedApps.filter((id) => available.has(id)).slice(0, 3).map(layout) : presets[presetKey] ?? [];
    setWindows(() => selected.map(([id, overrides], index) => ({ id, x: 80 + index * 40, y: 70 + index * 30, width: 760, height: 520, minimized: false, maximized: false, z: 10 + index, ...overrides })));
  }, [controlled, windowsProp]);

  const mutateWindow = (id: string, update: Partial<WindowState> | ((window: WindowState) => Partial<WindowState>)) => setWindows((current) => current.map((item) => item.id === id ? { ...item, ...(typeof update === 'function' ? update(item) : update) } : item));
  const closeWindow = (id: string) => setWindows((current) => current.filter((item) => item.id !== id));
  const focusWindow = (id: string) => setWindows((current) => { const z = nextZ(current); return current.map((item) => item.id === id ? { ...item, z } : item); });
  const openFile = (filePath: string) => {
    const id = `editor:${filePath}`;
    setWindows((current) => {
      if (current.some((item) => item.id === id)) return current.map((item) => item.id === id ? { ...item, minimized: false, z: nextZ(current) } : item);
      const index = current.filter((item) => item.id.startsWith('editor:')).length;
      return [...current, { id, x: 150 + index * 30, y: 96 + index * 26, width: 640, height: 470, minimized: false, maximized: false, z: nextZ(current) }];
    });
  };
  const currentTime = new Date(snapshot.now);
  const topZ = windows.filter((item) => !item.minimized).reduce((max, item) => Math.max(max, item.z), 0);
  const menu = useContextMenu();
  const desktopMenu = (event: React.MouseEvent) => {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains('wallpaper') && !(event.target as HTMLElement).classList.contains('wallpaper-grain')) return;
    menu(event, [
      { label: 'New Folder', icon: <FolderPlus />, disabled: true },
      { label: 'Change Desktop Background…', icon: <Monitor />, onClick: () => openApp('settings') },
      { separator: true },
      { label: 'Display Settings', icon: <Settings />, onClick: () => openApp('settings') },
      { label: 'Refresh', icon: <RotateCw />, hint: 'F5', onClick: () => { void api.state().then(setSnapshot); } },
    ]);
  };

  return <PlatformIconContext.Provider value={computer.spec.os}><section className={`desktop desktop-${computer.spec.os}`} onMouseDown={() => setLauncherOpen(false)} onContextMenu={desktopMenu}>
    <Wallpaper os={computer.spec.os} />
    <SystemChrome computer={computer} time={currentTime} launcherOpen={launcherOpen} setLauncherOpen={setLauncherOpen} openApp={openApp} windows={windows} snapshot={snapshot} onCloseApp={closeWindow} onMinimizeApp={(id) => mutateWindow(id, { minimized: true })} />
    <DesktopIcons computer={computer} openApp={openApp} />
    {windows.map((window) => {
      if (window.minimized) return null;
      const isEditor = window.id.startsWith('editor:');
      const editorPath = isEditor ? window.id.slice('editor:'.length) : '';
      const manifest = isEditor
        ? ({ id: 'text-editor', name: editorPath.split('/').at(-1) || 'Untitled', description: 'Text editor', publisher: 'Seed', version: '1.0', supportedOS: [computer.spec.os], entrypoint: 'system://editor', system: true } as unknown as AppManifest)
        : snapshot.appCatalog.find((item) => item.id === window.id);
      if (!manifest) return null;
      const commonProps = { key: window.id, os: computer.spec.os, manifest, state: window, focused: window.z === topZ, onFocus: () => focusWindow(window.id), onMove: (x: number, y: number) => mutateWindow(window.id, { x, y }), onResize: (width: number, height: number) => mutateWindow(window.id, { width, height }), onClose: () => closeWindow(window.id), onMinimize: () => mutateWindow(window.id, { minimized: true }), onMaximize: () => mutateWindow(window.id, (item) => ({ maximized: !item.maximized })) };
      return <AppWindow {...commonProps}>
        {isEditor
          ? <TextEditorApp computer={computer} filePath={editorPath} os={computer.spec.os} />
          : <Application manifest={manifest} computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} demo={demo} openApp={openApp} onOpenFile={openFile} />}
      </AppWindow>;
    })}
  </section></PlatformIconContext.Provider>;
}

function Wallpaper({ os }: { os: OSKind }) { return <div className={`wallpaper wallpaper-${os}`}><div className="wallpaper-grain" /></div>; }

function DesktopIcons({ computer, openApp }: { computer: ComputerSnapshot; openApp: (id: string) => void }) {
  const menu = useContextMenu();
  const selected = computer.spec.os === 'macos' ? ['finder', 'chatgpt'] : computer.spec.os === 'windows' ? ['explorer', 'chromium'] : ['nautilus', 'terminal'];
  const iconMenu = (event: React.MouseEvent, app: AppManifest) => menu(event, [
    { label: 'Open', icon: <ExternalLink />, onClick: () => openApp(app.id) },
    { separator: true },
    { label: 'Rename', icon: <Pencil />, disabled: true },
    { label: 'Get Info', icon: <Info />, hint: '⌘I', onClick: () => openApp(app.id) },
    { separator: true },
    { label: 'Move to Trash', icon: <Trash2 />, danger: true, disabled: true },
  ]);
  return <div className="desktop-icons">{selected.map((id) => {
    const app = computer.installedApps.find((item) => item.id === id); if (!app) return null;
    return <button key={id} onDoubleClick={() => openApp(id)} onClick={(event) => event.currentTarget.focus()} onContextMenu={(event) => iconMenu(event, app)}><AppIcon app={app} os={computer.spec.os} size={46} /><span>{app.name}</span></button>;
  })}<button><span className="desktop-drive"><HardDrive size={30} /></span><span>{computer.spec.disks[0]?.label}</span></button></div>;
}

function SystemChrome({ computer, time, launcherOpen, setLauncherOpen, openApp, windows, snapshot, onCloseApp, onMinimizeApp }: { computer: ComputerSnapshot; time: Date; launcherOpen: boolean; setLauncherOpen(value: boolean): void; openApp(id: string): void; windows: WindowState[]; snapshot: SimulationSnapshot; onCloseApp(id: string): void; onMinimizeApp(id: string): void }) {
  const menu = useContextMenu();
  const installed = computer.installedApps;
  const activeWindow = windows.filter((item) => !item.minimized).sort((a, b) => a.z - b.z).at(-1);
  const activeApp = activeWindow ? installed.find((app) => app.id === activeWindow.id) : undefined;
  const dockIds = computer.spec.os === 'macos' ? ['finder', 'chromium', 'slack', 'chatgpt', 'terminal', 'app-store', 'settings'] : computer.spec.os === 'windows' ? ['explorer', 'chromium', 'slack', 'teams', 'terminal', 'store'] : ['nautilus', 'chromium', 'slack', 'terminal', 'vscode', 'app-center'];
  const dock = dockIds.map((id) => installed.find((item) => item.id === id)).filter(Boolean) as AppManifest[];
  const dockMenu = (event: React.MouseEvent, app: AppManifest) => {
    const running = windows.some((item) => item.id === app.id);
    menu(event, [
      { label: running ? 'Open New Window' : `Open ${app.name}`, icon: <ExternalLink />, onClick: () => openApp(app.id) },
      running && { separator: true },
      running && { label: 'Hide', icon: <Minus />, onClick: () => onMinimizeApp(app.id) },
      running && { label: 'Quit', icon: <X />, danger: true, onClick: () => onCloseApp(app.id) },
      { separator: true },
      { label: 'Options', icon: <Settings />, disabled: true },
    ]);
  };
  if (computer.spec.os === 'macos') return <>
    {launcherOpen && <Launcher os="macos" apps={installed} openApp={openApp} />}
    <div className="mac-menu"><div><b className="apple-mark">●</b><b>{activeApp?.name ?? 'Finder'}</b><span>File</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span></div><div><ShieldCheck size={14} /><Wifi size={15} /><Search size={14} /><span>{time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}&nbsp; {time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div></div>
    <div className="mac-dock">{dock.map((app) => <button key={app.id} onClick={(event) => { event.stopPropagation(); openApp(app.id); }} onContextMenu={(event) => dockMenu(event, app)} title={app.name}><AppIcon app={app} os="macos" size={50} />{windows.some((item) => item.id === app.id) && <i />}</button>)}</div>
  </>;
  if (computer.spec.os === 'windows') return <>
    {launcherOpen && <Launcher os="windows" apps={installed} openApp={openApp} />}
    <div className="windows-taskbar"><div className="win-weather"><span>☀</span><small>67°F<br />San Francisco</small></div><div className="win-center"><button className="start-mark" title="Start" onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}><i /><i /><i /><i /></button><button className="task-search"><Search size={15} /><span>Search</span></button>{dock.slice(0, 6).map((app) => <button key={app.id} onClick={() => openApp(app.id)} onContextMenu={(event) => dockMenu(event, app)} title={app.name}><AppIcon app={app} os="windows" size={26} />{windows.some((item) => item.id === app.id) && <i className="task-running" />}</button>)}</div><div className="win-tray"><ChevronUp size={13} /><Wifi size={14} /><Volume2 size={14} /><BatteryFull size={15} /><small>{time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<br />{time.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' })}</small></div></div>
  </>;
  return <>
    {launcherOpen && <Launcher os="ubuntu" apps={installed} openApp={openApp} />}
    <div className="ubuntu-top"><button onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}>Activities</button><b>{activeApp?.name ?? 'Desktop'}</b><span>{time.toLocaleDateString([], { month: 'short', day: 'numeric' })} {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div><Wifi size={14} /><Volume2 size={14} /><BatteryFull size={15} /><Power size={14} /></div></div>
    <div className="ubuntu-dock">{dock.map((app) => <button key={app.id} onClick={(event) => { event.stopPropagation(); openApp(app.id); }} onContextMenu={(event) => dockMenu(event, app)} title={app.name}><AppIcon app={app} os="ubuntu" size={44} />{windows.some((item) => item.id === app.id) && <i />}</button>)}<hr /><button onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}><span className="ubuntu-grid"><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></button></div>
  </>;
}

function Launcher({ os, apps, openApp }: { os: OSKind; apps: AppManifest[]; openApp(id: string): void }) {
  const [query, setQuery] = useState('');
  const matches = apps.filter((app) => `${app.name} ${app.description} ${app.publisher}`.toLowerCase().includes(query.toLowerCase()));
  return <div className={`launcher launcher-${os}`} onMouseDown={(event) => event.stopPropagation()}><label><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={os === 'windows' ? 'Search for apps, settings, and documents' : 'Type to search'} /></label><h3>{query ? `${matches.length} results` : os === 'windows' ? 'Pinned' : 'Applications'}</h3><div>{matches.map((app) => <button key={app.id} onClick={() => openApp(app.id)}><AppIcon app={app} os={os} size={38} /><span>{app.name}</span></button>)}</div>{os === 'windows' && <footer><CircleUserRound size={22} /><b>agent</b><Power size={18} /></footer>}</div>;
}

function AppWindow({ os, manifest, state, focused, children, onFocus, onMove, onResize, onClose, onMinimize, onMaximize }: { os: OSKind; manifest: AppManifest; state: WindowState; focused: boolean; children: React.ReactNode; onFocus(): void; onMove(x: number, y: number): void; onResize(width: number, height: number): void; onClose(): void; onMinimize(): void; onMaximize(): void }) {
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | undefined>(undefined);
  const resize = useRef<{ pointerX: number; pointerY: number; x: number; y: number; width: number; height: number; direction: string } | undefined>(undefined);
  const menu = useContextMenu();
  const titlebarMenu = (event: React.MouseEvent) => menu(event, [
    { label: 'Minimize', icon: <Minus />, onClick: onMinimize },
    { label: state.maximized ? 'Restore' : 'Maximize', icon: <AppWindowIcon />, onClick: onMaximize },
    { separator: true },
    { label: 'Close', icon: <X />, danger: true, hint: os === 'macos' ? '⌘W' : 'Alt+F4', onClick: onClose },
  ]);
  const rootRef = useRef<HTMLElement>(null);
  const cursorFor = (direction: string) => direction === 'n' || direction === 's' ? 'ns-resize' : direction === 'e' || direction === 'w' ? 'ew-resize' : direction === 'ne' || direction === 'sw' ? 'nesw-resize' : 'nwse-resize';
  const desktopRect = () => rootRef.current?.closest<HTMLElement>('.desktop')?.getBoundingClientRect();
  const workArea = () => {
    const desktop = desktopRect();
    return { width: desktop?.width ?? innerWidth, height: desktop?.height ?? innerHeight, top: os === 'macos' || os === 'ubuntu' ? 28 : 0, bottom: os === 'windows' ? 48 : os === 'macos' ? 28 : 0 };
  };
  const movePointer = (event: React.PointerEvent) => {
    const area = workArea();
    if (drag.current) onMove(
      Math.min(Math.max(0, drag.current.x + event.clientX - drag.current.startX), Math.max(0, area.width - state.width)),
      Math.min(Math.max(area.top, drag.current.y + event.clientY - drag.current.startY), Math.max(area.top, area.height - area.bottom - 38)),
    );
    if (resize.current) {
      const start = resize.current;
      const dx = event.clientX - start.pointerX;
      const dy = event.clientY - start.pointerY;
      let x = start.x, y = start.y, width = start.width, height = start.height;
      if (start.direction.includes('e')) width = Math.min(area.width - start.x, Math.max(430, start.width + dx));
      if (start.direction.includes('s')) height = Math.min(area.height - area.bottom - start.y, Math.max(280, start.height + dy));
      if (start.direction.includes('w')) { width = Math.max(430, start.width - dx); x = Math.max(0, start.x + start.width - width); width = start.x + start.width - x; }
      if (start.direction.includes('n')) { height = Math.max(280, start.height - dy); y = Math.max(area.top, start.y + start.height - height); height = start.y + start.height - y; }
      if (x !== state.x || y !== state.y) onMove(x, y);
      onResize(width, height);
    }
  };
  const stopPointer = (event?: React.PointerEvent) => {
    const wasDragging = Boolean(drag.current);
    drag.current = undefined; resize.current = undefined;
    document.body.style.cursor = ''; document.body.classList.remove('resizing');
    if (!wasDragging || !event) return;
    const desktop = desktopRect();
    if (!desktop) return;
    const top = os === 'macos' || os === 'ubuntu' ? 28 : 0;
    const bottom = os === 'windows' ? 48 : os === 'macos' ? 28 : 0;
    if (event.clientY <= desktop.top + top + 7) onMaximize();
    else if (event.clientX <= desktop.left + 7) { onMove(0, top); onResize(desktop.width / 2, desktop.height - top - bottom); }
    else if (event.clientX >= desktop.right - 7) { onMove(desktop.width / 2, top); onResize(desktop.width / 2, desktop.height - top - bottom); }
  };
  const style = state.maximized ? { left: os === 'ubuntu' ? 66 : 0, top: os === 'macos' || os === 'ubuntu' ? 28 : 0, width: os === 'ubuntu' ? 'calc(100% - 66px)' : '100%', height: os === 'windows' ? 'calc(100% - 48px)' : 'calc(100% - 28px)', zIndex: state.z } : { left: state.x, top: state.y, width: state.width, height: state.height, zIndex: state.z };
  const customTitlebar = manifest.id === 'chatgpt';
  const nativeIcon = appIconSource(manifest, os);
  return <article ref={rootRef} className={`app-window window-${os} ${focused ? 'focused' : ''} ${state.maximized ? 'maximized' : ''} ${customTitlebar ? 'window-chatgpt' : ''}`} style={style} onPointerMove={movePointer} onPointerUp={stopPointer} onPointerCancel={() => stopPointer()} onMouseDown={onFocus}>
    <header className={`window-titlebar ${customTitlebar ? 'chatgpt-titlebar' : ''}`} onDoubleClick={onMaximize} onContextMenu={titlebarMenu} onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; drag.current = { x: state.x, y: state.y, startX: event.clientX, startY: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}>
      {os === 'macos' && <div className="traffic"><button aria-label="Close" onClick={onClose}/><button aria-label="Minimize" onClick={onMinimize}/><button aria-label={state.maximized ? 'Restore' : 'Enter Full Screen'} onClick={onMaximize}/></div>}
      {customTitlebar ? <div className="chatgpt-title-brand"><Icon icon={appIconSource(manifest, os)!}/><b>ChatGPT</b></div> : <>{os !== 'macos' && (nativeIcon ? <Icon className="window-native-icon" icon={nativeIcon} width={15} height={15}/> : <span className="window-native-icon">{manifest.name[0]}</span>)}<b>{manifest.name}</b></>}
      {os !== 'macos' && <div className="window-actions"><button aria-label="Minimize" onClick={onMinimize}><Minus size={14}/></button><button aria-label={state.maximized ? 'Restore' : 'Maximize'} onClick={onMaximize}><span className={`caption-square ${state.maximized ? 'restore' : ''}`}/></button><button aria-label="Close" className="close" onClick={onClose}><X size={14}/></button></div>}
    </header>
    <div className="window-content">{children}</div>
    {!state.maximized && ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((direction) => <button key={direction} aria-label={`Resize window ${direction}`} className={`resize-handle resize-${direction}`} onPointerDown={(event) => { event.stopPropagation(); onFocus(); resize.current = { pointerX: event.clientX, pointerY: event.clientY, x: state.x, y: state.y, width: state.width, height: state.height, direction }; document.body.style.cursor = cursorFor(direction); document.body.classList.add('resizing'); event.currentTarget.setPointerCapture(event.pointerId); }} />)}
  </article>;
}

function Application({ manifest, computer, snapshot, setSnapshot, demo, openApp, onOpenFile }: { manifest: AppManifest; computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void; demo: string; openApp(id: string): void; onOpenFile(path: string): void }) {
  if (manifest.entrypoint === 'system://terminal') return <TerminalApp computer={computer} demo={demo} />;
  if (manifest.entrypoint === 'system://files') return <FilesApp manifest={manifest} computer={computer} onOpenFile={onOpenFile} />;
  if (manifest.entrypoint === 'system://app-store') return <StoreApp computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} openApp={openApp} />;
  if (manifest.entrypoint === 'system://settings') return <SettingsApp computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} />;
  if (manifest.entrypoint === 'app://browser') return <BrowserApp manifest={manifest} computer={computer} demo={demo} />;
  if (manifest.entrypoint === 'app://chatgpt') return <ChatGPTApp manifest={manifest} computer={computer} />;
  if (manifest.entrypoint === 'app://slack' || manifest.entrypoint === 'app://teams') return <CollabApp teams={manifest.entrypoint.endsWith('teams')} computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} />;
  if (manifest.entrypoint === 'app://wireshark') return <WiresharkApp manifest={manifest} computer={computer} snapshot={snapshot} />;
  if (manifest.entrypoint === 'app://vscode') return <CodeApp computer={computer} manifest={manifest} />;
  if (manifest.entrypoint === 'app://packages') return <PackageCenterApp computer={computer} manifest={manifest} setSnapshot={setSnapshot} />;
  if (manifest.entrypoint === 'app://git') return <GitClientApp computer={computer} manifest={manifest} setSnapshot={setSnapshot} />;
  if (manifest.entrypoint === 'app://containers') return <ContainerApp computer={computer} manifest={manifest} />;
  if (manifest.entrypoint === 'app://api-client') return <ApiClientApp computer={computer} />;
  if (manifest.entrypoint === 'app://processes') return <ProcessApp computer={computer} setSnapshot={setSnapshot} />;
  if (manifest.id === 'figma') return <DesignApp manifest={manifest} computer={computer} />;
  return <AppSpecificSurface manifest={manifest} computer={computer} />;
}
