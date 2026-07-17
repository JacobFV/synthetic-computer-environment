import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AppWindow as AppWindowIcon, Bot, Box, CalendarDays, ChevronLeft, ChevronRight, CircleUserRound, Code2,
  Container, Database, Download, File, FileCode2, Folder, GitBranch, Globe2, HardDrive, Laptop, LayoutGrid,
  LockKeyhole, MessageSquare, Minus, Monitor, Network, PackageCheck, PanelsTopLeft, Play, Plus,
  Power, Radio, RefreshCw, Search, Send, Settings, ShieldCheck, SquareTerminal, Store, Users, Wifi, X,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import type { AppManifest, BrowserNavigationResponse, ComputerSnapshot, DirectoryEntry, OSKind, SimulationSnapshot } from '@seed/protocol';
import { api } from './api';
import { appIconKey, appIconSource, PlatformIconContext } from './appIcons';
import { AppSpecificSurface } from './AppSurfaces';

type WindowState = { id: string; x: number; y: number; width: number; height: number; minimized: boolean; maximized: boolean; z: number };

const iconGlyphs: Record<string, string> = {
  finder: '◑', folder: '●', terminal: '›_', settings: '⚙', notes: '▤', preview: '◫', photos: '✿', calculator: '＋',
  calendar: '16', mail: '✉', appstore: 'A', store: '▣', chromium: '◎', slack: '⌗', teams: 'T', chatgpt: '✦',
  vscode: '⌁', wireshark: '♢',
};

function AppIcon({ app, os, size = 38 }: { app: AppManifest; os?: OSKind; size?: number }) {
  const contextOS = useContext(PlatformIconContext);
  const platform = os ?? contextOS ?? (app.supportedOS.length === 1 ? app.supportedOS[0] : undefined);
  const key = appIconKey(app, platform);
  const source = appIconSource(app, platform);
  return <span className={`app-glyph app-glyph-${key} ${source ? 'iconify-glyph' : ''}`} style={{ width: size, height: size, fontSize: Math.max(12, size * .42) }}>{source ? <Icon icon={source} width={size * .72} height={size * .72}/> : iconGlyphs[key] ?? app.name[0]}</span>;
}

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

export function App() {
  const [snapshot, setSnapshot] = useSnapshot();
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [computerId, setComputerId] = useState(params.get('computer') ?? 'mac-studio');
  const [windowsByComputer, setWindowsByComputer] = useState<Record<string, WindowState[]>>({});
  const [launcherOpen, setLauncherOpen] = useState(params.get('launcher') === '1');
  const [zCounter, setZCounter] = useState(20);
  const harnessVisible = params.get('chrome') !== '0';
  const demo = params.get('demo') ?? '';
  const scriptedApps = useMemo(() => (params.get('apps') ?? '').split(',').map((item) => item.trim()).filter(Boolean), [params]);
  const scene = Number(params.get('scene') ?? '0');
  const computers = snapshot?.computers.filter((item) => item.spec.displays.length > 0) ?? [];
  const computer = computers.find((item) => item.spec.id === computerId) ?? computers[0];
  const windows = windowsByComputer[computerId] ?? [];

  const openApp = useCallback((id: string, arranged?: Partial<WindowState>) => {
    if (!computer || !snapshot) return;
    const manifest = snapshot.appCatalog.find((item) => item.id === id);
    if (!manifest) return;
    setWindowsByComputer((current) => {
      const existing = current[computer.spec.id] ?? [];
      if (existing.some((item) => item.id === id)) return { ...current, [computer.spec.id]: existing.map((item) => item.id === id ? { ...item, minimized: false, z: zCounter + 1 } : item) };
      const index = existing.length;
      const size = manifest.defaultSize ?? { width: 760, height: 520 };
      const next: WindowState = { id, x: 90 + index * 42, y: 68 + index * 34, width: size.width, height: size.height, minimized: false, maximized: false, z: zCounter + 1, ...arranged };
      return { ...current, [computer.spec.id]: [...existing, next] };
    });
    setZCounter((value) => value + 1);
    setLauncherOpen(false);
    api.action({ computerId: computer.spec.id, displayId: 'main', actor: 'human', kind: 'app', action: 'app.open', target: id });
  }, [computer, snapshot, zCounter]);

  useEffect(() => {
    if (!computer || windowsByComputer[computer.spec.id]) return;
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
    const selected = scriptedApps.length ? scriptedApps.filter((id) => available.has(id)).slice(0, 3).map(layout) : presets[demo || computer.spec.os] ?? [];
    setWindowsByComputer((current) => ({ ...current, [computer.spec.id]: selected.map(([id, overrides], index) => ({ id, x: 80 + index * 40, y: 70 + index * 30, width: 760, height: 520, minimized: false, maximized: false, z: 10 + index, ...overrides })) }));
  }, [computer, demo, scene, scriptedApps, windowsByComputer]);

  if (!snapshot || !computer) return <div className="boot-screen"><div className="boot-mark">seed</div><div className="boot-progress"><i /></div><span>booting deterministic computer fabric…</span></div>;

  const mutateWindow = (id: string, update: Partial<WindowState> | ((window: WindowState) => Partial<WindowState>)) => {
    setWindowsByComputer((current) => ({ ...current, [computer.spec.id]: (current[computer.spec.id] ?? []).map((item) => item.id === id ? { ...item, ...(typeof update === 'function' ? update(item) : update) } : item) }));
  };
  const closeWindow = (id: string) => setWindowsByComputer((current) => ({ ...current, [computer.spec.id]: (current[computer.spec.id] ?? []).filter((item) => item.id !== id) }));
  const focusWindow = (id: string) => { setZCounter((value) => value + 1); mutateWindow(id, { z: zCounter + 1 }); };
  const currentTime = new Date(snapshot.now);

  return <main className={`simulator ${harnessVisible ? 'with-harness' : ''}`}>
    {harnessVisible && <div className="harness">
      <div className="harness-brand"><Radio size={15} /><b>seed runtime</b><span>{snapshot.runId}</span></div>
      <div className="machine-switcher">{computers.map((item) => <button key={item.spec.id} className={item.spec.id === computer.spec.id ? 'active' : ''} onClick={() => { setComputerId(item.spec.id); setLauncherOpen(false); }}><i className={`os-dot ${item.spec.os}`} /><span>{item.spec.hostname}</span><small>{item.spec.ipv4}</small></button>)}</div>
      <div className="runtime-stats"><span><Activity size={13} /> {snapshot.trajectoryLength} events</span><span><Network size={13} /> {snapshot.packets.length} packets</span><a href="/api/trajectory">export jsonl</a></div>
    </div>}
    <PlatformIconContext.Provider value={computer.spec.os}><section className={`desktop desktop-${computer.spec.os}`} onMouseDown={() => setLauncherOpen(false)}>
      <Wallpaper os={computer.spec.os} />
      <SystemChrome computer={computer} time={currentTime} launcherOpen={launcherOpen} setLauncherOpen={setLauncherOpen} openApp={openApp} windows={windows} snapshot={snapshot} />
      <DesktopIcons computer={computer} openApp={openApp} />
      {windows.map((window) => {
        const manifest = snapshot.appCatalog.find((item) => item.id === window.id);
        if (!manifest || window.minimized) return null;
        return <AppWindow key={window.id} os={computer.spec.os} manifest={manifest} state={window} focused={window.z === Math.max(...windows.map((item) => item.z))} onFocus={() => focusWindow(window.id)} onMove={(x, y) => mutateWindow(window.id, { x, y })} onResize={(width, height) => mutateWindow(window.id, { width, height })} onClose={() => closeWindow(window.id)} onMinimize={() => mutateWindow(window.id, { minimized: true })} onMaximize={() => mutateWindow(window.id, (item) => ({ maximized: !item.maximized }))}>
          <Application manifest={manifest} computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} demo={demo} />
        </AppWindow>;
      })}
    </section></PlatformIconContext.Provider>
  </main>;
}

function Wallpaper({ os }: { os: OSKind }) { return <div className={`wallpaper wallpaper-${os}`}><div className="wallpaper-grain" /></div>; }

function DesktopIcons({ computer, openApp }: { computer: ComputerSnapshot; openApp: (id: string) => void }) {
  const selected = computer.spec.os === 'macos' ? ['finder', 'chatgpt'] : computer.spec.os === 'windows' ? ['explorer', 'chromium'] : ['nautilus', 'terminal'];
  return <div className="desktop-icons">{selected.map((id) => {
    const app = computer.installedApps.find((item) => item.id === id); if (!app) return null;
    return <button key={id} onDoubleClick={() => openApp(id)} onClick={(event) => event.currentTarget.focus()}><AppIcon app={app} os={computer.spec.os} size={46} /><span>{app.name}</span></button>;
  })}<button><span className="desktop-drive"><HardDrive size={30} /></span><span>{computer.spec.disks[0]?.label}</span></button></div>;
}

function SystemChrome({ computer, time, launcherOpen, setLauncherOpen, openApp, windows, snapshot }: { computer: ComputerSnapshot; time: Date; launcherOpen: boolean; setLauncherOpen(value: boolean): void; openApp(id: string): void; windows: WindowState[]; snapshot: SimulationSnapshot }) {
  const installed = computer.installedApps;
  const activeWindow = windows.filter((item) => !item.minimized).sort((a, b) => a.z - b.z).at(-1);
  const activeApp = activeWindow ? installed.find((app) => app.id === activeWindow.id) : undefined;
  const dockIds = computer.spec.os === 'macos' ? ['finder', 'chromium', 'slack', 'chatgpt', 'terminal', 'app-store', 'settings'] : computer.spec.os === 'windows' ? ['explorer', 'chromium', 'slack', 'teams', 'terminal', 'store'] : ['nautilus', 'chromium', 'slack', 'terminal', 'vscode', 'app-center'];
  const dock = dockIds.map((id) => installed.find((item) => item.id === id)).filter(Boolean) as AppManifest[];
  if (computer.spec.os === 'macos') return <>
    {launcherOpen && <Launcher os="macos" apps={installed} openApp={openApp} />}
    <div className="mac-menu"><div><b className="apple-mark">●</b><b>{activeApp?.name ?? 'Finder'}</b><span>File</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span></div><div><ShieldCheck size={14} /><Wifi size={15} /><Search size={14} /><span>{time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}&nbsp; {time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div></div>
    <div className="mac-dock">{dock.map((app) => <button key={app.id} onClick={(event) => { event.stopPropagation(); openApp(app.id); }} title={app.name}><AppIcon app={app} os="macos" size={50} />{windows.some((item) => item.id === app.id) && <i />}</button>)}</div>
  </>;
  if (computer.spec.os === 'windows') return <>
    {launcherOpen && <Launcher os="windows" apps={installed} openApp={openApp} />}
    <div className="windows-taskbar"><div className="win-weather"><span>☀</span><small>67°F<br />San Francisco</small></div><div className="win-center"><button className="start-mark" onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}><i /><i /><i /><i /></button><button className="task-search"><Search size={15} /><span>Search</span></button>{dock.slice(0, 6).map((app) => <button key={app.id} onClick={() => openApp(app.id)}><AppIcon app={app} os="windows" size={34} />{windows.some((item) => item.id === app.id) && <i className="task-running" />}</button>)}</div><div className="win-tray"><ChevronLeft size={13} /><Wifi size={14} /><span>◖</span><small>{time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<br />{time.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' })}</small></div></div>
  </>;
  return <>
    {launcherOpen && <Launcher os="ubuntu" apps={installed} openApp={openApp} />}
    <div className="ubuntu-top"><button onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}>Activities</button><b>{activeApp?.name ?? 'Desktop'}</b><span>{time.toLocaleDateString([], { month: 'short', day: 'numeric' })} {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div><Wifi size={14} /><span>◖</span><Power size={14} /></div></div>
    <div className="ubuntu-dock">{dock.map((app) => <button key={app.id} onClick={(event) => { event.stopPropagation(); openApp(app.id); }}><AppIcon app={app} os="ubuntu" size={44} />{windows.some((item) => item.id === app.id) && <i />}</button>)}<hr /><button onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}><span className="ubuntu-grid"><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></button></div>
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
  const workArea = () => {
    const desktop = document.querySelector<HTMLElement>('.desktop')?.getBoundingClientRect();
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
    if (!wasDragging || !event) return;
    const desktop = document.querySelector<HTMLElement>('.desktop')?.getBoundingClientRect();
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
  return <article className={`app-window window-${os} ${focused ? 'focused' : ''} ${state.maximized ? 'maximized' : ''} ${customTitlebar ? 'window-chatgpt' : ''}`} style={style} onPointerMove={movePointer} onPointerUp={stopPointer} onPointerCancel={() => stopPointer()} onMouseDown={onFocus}>
    <header className={`window-titlebar ${customTitlebar ? 'chatgpt-titlebar' : ''}`} onDoubleClick={onMaximize} onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; drag.current = { x: state.x, y: state.y, startX: event.clientX, startY: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}>
      {os === 'macos' && <div className="traffic"><button aria-label="Close" onClick={onClose}/><button aria-label="Minimize" onClick={onMinimize}/><button aria-label={state.maximized ? 'Restore' : 'Enter Full Screen'} onClick={onMaximize}/></div>}
      {customTitlebar ? <div className="chatgpt-title-brand"><Icon icon={appIconSource(manifest, os)!}/><b>ChatGPT</b></div> : <>{os !== 'macos' && (nativeIcon ? <Icon className="window-native-icon" icon={nativeIcon} width={15} height={15}/> : <span className="window-native-icon">{manifest.name[0]}</span>)}<b>{manifest.name}</b></>}
      {os !== 'macos' && <div className="window-actions"><button aria-label="Minimize" onClick={onMinimize}><Minus size={14}/></button><button aria-label={state.maximized ? 'Restore' : 'Maximize'} onClick={onMaximize}><span className={`caption-square ${state.maximized ? 'restore' : ''}`}/></button><button aria-label="Close" className="close" onClick={onClose}><X size={14}/></button></div>}
    </header>
    <div className="window-content">{children}</div>
    {!state.maximized && ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((direction) => <button key={direction} aria-label={`Resize window ${direction}`} className={`resize-handle resize-${direction}`} onPointerDown={(event) => { event.stopPropagation(); resize.current = { pointerX: event.clientX, pointerY: event.clientY, x: state.x, y: state.y, width: state.width, height: state.height, direction }; event.currentTarget.setPointerCapture(event.pointerId); }} />)}
  </article>;
}

function Application({ manifest, computer, snapshot, setSnapshot, demo }: { manifest: AppManifest; computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void; demo: string }) {
  if (manifest.entrypoint === 'system://terminal') return <TerminalApp computer={computer} demo={demo} />;
  if (manifest.entrypoint === 'system://files') return <FilesApp manifest={manifest} computer={computer} />;
  if (manifest.entrypoint === 'system://app-store') return <StoreApp computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} />;
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

function TerminalApp({ computer, demo }: { computer: ComputerSnapshot; demo: string }) {
  const [lines, setLines] = useState<Array<{ prompt?: string; text: string; error?: boolean }>>([{ text: computer.spec.shell === 'powershell' ? 'PowerShell 7.6.0\nCopyright (c) Microsoft Corporation.' : `${computer.spec.shell} · seed kernel 26.0 · ${computer.spec.hostname}` }]);
  const [prompt, setPrompt] = useState('');
  const [input, setInput] = useState('');
  const ranDemo = useRef(false);
  useEffect(() => { api.prompt(computer.spec.id).then((value) => setPrompt(value.prompt)); }, [computer.spec.id]);
  const run = useCallback(async (command: string) => {
    if (!command.trim()) return;
    const before = prompt;
    setLines((current) => [...current, { prompt: before, text: command }]); setInput('');
    const result = await api.shell(computer.spec.id, command);
    setPrompt(result.prompt); setLines((current) => [...current, { text: result.stderr || result.stdout, error: Boolean(result.stderr) }]);
  }, [computer.spec.id, prompt]);
  useEffect(() => {
    if (ranDemo.current || !prompt || !demo) return; ranDemo.current = true;
    const commands = computer.spec.os === 'macos' ? ['nslookup appstore.seed.local', 'curl https://appstore.seed.local/apps/chatgpt | grep name', 'ps | grep WindowServer'] : computer.spec.os === 'windows' ? ['Resolve-DnsName intranet.seed.local', 'iwr http://intranet.seed.local:8080/ | findstr nominal', 'Get-Process | findstr explorer'] : ['ip addr', 'ss', 'curl http://intranet.seed.local:8080/ | grep nominal'];
    (async () => { for (const command of commands) { await run(command); await new Promise((resolve) => setTimeout(resolve, 120)); } })();
  }, [computer.spec.os, demo, prompt, run]);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [lines]);
  return <div className="terminal-app" onClick={() => document.getElementById(`terminal-${computer.spec.id}`)?.focus()}><div className="terminal-tabs"><span><SquareTerminal size={14}/> {computer.spec.shell}</span><Plus size={14}/></div><div className="terminal-screen" ref={scroll}>{lines.map((line, index) => <div key={index} className={line.error ? 'terminal-error' : ''}>{line.prompt && <b>{line.prompt}</b>}<span>{line.text}</span></div>)}<form onSubmit={(event) => { event.preventDefault(); run(input); }}><b>{prompt}</b><input id={`terminal-${computer.spec.id}`} value={input} onChange={(event) => setInput(event.target.value)} autoComplete="off" spellCheck={false}/></form></div></div>;
}

function FilesApp({ manifest, computer }: { manifest: AppManifest; computer: ComputerSnapshot }) {
  const home = computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
  const [currentPath, setCurrentPath] = useState(`${home}/Desktop`);
  const [files, setFiles] = useState<DirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [listView, setListView] = useState(computer.spec.os !== 'macos');
  useEffect(() => { api.files(computer.spec.id, currentPath).then(setFiles).catch(() => setFiles([])); }, [computer.spec.id, currentPath]);
  const visible = files.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
  const sidebar = computer.spec.os === 'macos' ? ['Desktop', 'Documents', 'Downloads', 'Applications'] : computer.spec.os === 'windows' ? ['Desktop', 'Documents', 'Downloads', 'Pictures'] : ['Desktop', 'Documents', 'Downloads', 'Public'];
  return <div className={`files-app files-${computer.spec.os}`}><aside><div className="files-app-brand"><AppIcon app={manifest} size={24}/><b>{manifest.name}</b></div><h4>{computer.spec.os === 'windows' ? 'Quick access' : 'Favorites'}</h4>{sidebar.map((name) => <button key={name} className={currentPath.endsWith(name) ? 'active' : ''} onClick={() => setCurrentPath(name === 'Applications' ? '/Applications' : `${home}/${name}`)}><Folder size={17}/>{name}</button>)}<h4>{computer.spec.os === 'ubuntu' ? 'Other Locations' : 'Locations'}</h4><button><HardDrive size={17}/>{computer.spec.disks[0]?.label}</button><button><Network size={17}/>Network</button></aside><section><div className="files-toolbar"><button onClick={() => setCurrentPath(home)} title="Home"><ChevronLeft size={17}/></button><button disabled><ChevronRight size={17}/></button><span>{computer.spec.os === 'windows' ? currentPath.replace('/C/', 'This PC › ').replaceAll('/', ' › ') : currentPath.split('/').filter(Boolean).join(' › ')}</span><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${currentPath.split('/').at(-1)}`}/></label><button className={!listView ? 'active' : ''} onClick={() => setListView(false)}><LayoutGrid size={17}/></button><button className={listView ? 'active' : ''} onClick={() => setListView(true)}>☷</button></div><div className={`file-grid ${listView ? 'list-view' : ''}`}>{visible.map((entry) => <button key={entry.path} onDoubleClick={() => entry.inode.kind === 'directory' && setCurrentPath(entry.path)}>{entry.inode.kind === 'directory' ? <Folder size={listView ? 22 : 46} fill="currentColor"/> : entry.name.endsWith('.md') ? <FileCode2 size={listView ? 22 : 43}/> : <File size={listView ? 22 : 43}/>}<span>{entry.name}</span><small>{entry.inode.kind === 'directory' ? 'Folder' : `${entry.inode.size} bytes`}</small></button>)}</div><footer>{visible.length} items · {currentPath} · {computer.spec.ipv4}</footer></section></div>;
}

function BrowserApp({ manifest, computer, demo }: { manifest: AppManifest; computer: ComputerSnapshot; demo: string }) {
  const [address, setAddress] = useState('http://intranet.seed.local:8080/');
  const [response, setResponse] = useState<BrowserNavigationResponse>();
  const [loading, setLoading] = useState(false);
  const navigate = async (target = address) => { setLoading(true); try { setAddress(target); setResponse(await api.browserNavigate(computer.spec.id, target)); } finally { setLoading(false); } };
  useEffect(() => { if (demo) navigate(); }, []);
  return <div className={`browser-app browser-${manifest.id}`}><div className="browser-tabs"><span><AppIcon app={manifest} size={16}/> Seed Intranet <X size={12}/></span><Plus size={14}/></div><form className="addressbar" onSubmit={(event) => { event.preventDefault(); void navigate(); }}><button type="button"><ChevronLeft size={16}/></button><button type="button"><ChevronRight size={16}/></button><button type="button" onClick={() => void navigate()}><RefreshCw size={15}/></button><label><LockKeyhole size={13}/><input aria-label="Address" value={address} onChange={(event) => setAddress(event.target.value)}/></label><button type="button" title={`${manifest.name} menu`}>•••</button></form><div className="browser-body">{loading ? <div className="browser-loading">routing packets…</div> : response ? <iframe key={response.documentUrl} sandbox="allow-scripts" src={response.documentUrl} title="virtual internet page" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"/> : <div className="browser-newtab"><AppIcon app={manifest} size={68}/><h1>{manifest.id === 'safari' ? 'Favorites' : manifest.id === 'firefox' ? 'Welcome to Firefox' : manifest.id === 'edge' ? 'New tab' : 'Chromium'}</h1><label><Search/><input placeholder={manifest.id === 'firefox' ? 'Search with Seed Search or enter address' : 'Search seed internet or type a URL'}/></label><div><button onClick={() => void navigate('http://intranet.seed.local:8080/')}><Monitor/>Intranet</button><button><Store/>App Store</button><button><MessageSquare/>Slack</button></div></div>}</div>{response && <div className="browser-status">virtual http {response.status} · {response.headers['content-type'] ?? 'application/octet-stream'} · trace {response.traceId.slice(0, 8)} · source {computer.spec.ipv4}</div>}</div>;
}

function StoreApp({ computer, snapshot, setSnapshot }: { computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(0);
  const sections = computer.spec.os === 'macos' ? ['Discover', 'Arcade', 'Create', 'Work', 'Updates'] : computer.spec.os === 'windows' ? ['Home', 'Apps', 'Gaming', 'Library', 'Downloads'] : ['Explore', 'Installed', 'Updates'];
  const candidates = snapshot.appCatalog.filter((item) => !item.system && item.supportedOS.includes(computer.spec.os) && item.name.toLowerCase().includes(query.toLowerCase()));
  const install = async (id: string) => { await api.install(computer.spec.id, id); setSnapshot(await api.state()); };
  const storeName = computer.spec.os === 'macos' ? 'App Store' : computer.spec.os === 'windows' ? 'Microsoft Store' : 'App Center';
  const cards = candidates.map((app) => {
    const installed = computer.installedApps.some((item) => item.id === app.id);
    return <article key={app.id}><AppIcon app={app} size={54}/><div><b>{app.name}</b><span>{app.description}</span><small>{app.publisher} · {app.version}</small></div><button disabled={installed} onClick={() => install(app.id)}>{installed ? 'OPEN' : computer.spec.os === 'windows' ? 'Get' : 'GET'}</button></article>;
  });
  if (computer.spec.os === 'windows') return <div className="store-app store-windows"><aside className="store-win-rail"><AppIcon app={snapshot.appCatalog.find((item) => item.id === 'store')!} size={30}/>{sections.map((item, index) => <button onClick={() => setSection(index)} className={section === index ? 'active' : ''} key={item}>{index === 0 ? <Store/> : item === 'Downloads' ? <Download/> : <AppWindowIcon/>}<span>{item}</span></button>)}</aside><section><header className="store-win-header"><h2>Microsoft Store</h2><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps, games, movies and more"/></label><button className="store-avatar">A</button></header><div className="store-win-hero"><small>APPS · EDITOR'S CHOICE</small><h1>{section === sections.length - 1 ? 'Your library is ready.' : 'Build the workspace you need.'}</h1><p>trusted packages from store.seed.local</p><button>See collection</button></div><h3>{query ? 'Search results' : section === 0 ? 'Top free apps' : sections[section]}</h3><div className="store-win-grid">{cards}</div></section></div>;
  if (computer.spec.os === 'ubuntu') return <div className="store-app store-ubuntu"><section><header className="store-ubuntu-header"><nav>{sections.map((item, index) => <button onClick={() => setSection(index)} className={section === index ? 'active' : ''} key={item}>{item}</button>)}</nav><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search App Center"/></label></header><div className="store-ubuntu-hero"><div><small>EDITOR'S PICKS</small><h1>{section === sections.length - 1 ? 'Software is up to date.' : 'Apps for work and creativity.'}</h1><p>verified packages from packages.seed.local</p></div><AppWindowIcon size={70}/></div><h3>{query ? 'Search results' : section === 0 ? 'Featured applications' : sections[section]}</h3><div className="store-ubuntu-grid">{cards}</div></section></div>;
  return <div className="store-app store-macos"><aside><h2>{storeName}</h2><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${storeName}`}/></label>{sections.map((item, index) => <button onClick={() => setSection(index)} className={section === index ? 'active' : ''} key={item}>{index === 0 ? <Store/> : item === 'Updates' ? <Download/> : <AppWindowIcon/>}{item}</button>)}</aside><section><div className="store-hero"><small>ESSENTIALS</small><h1>{section === sections.length - 1 ? 'Your software is up to date.' : 'Tools for a complete virtual workspace.'}</h1><p>signed packages from appstore.seed.local</p></div><h3>{query ? 'Search results' : section === 0 ? 'Apps we love' : sections[section]}</h3><div className="store-list">{cards}</div></section></div>;
}

function SettingsApp({ computer, snapshot, setSnapshot }: { computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const sections: Array<[string, typeof Monitor]> = [['System', Monitor], ['Network', Network], ['Apps', Box], ['Privacy & Security', ShieldCheck]];
  const [selected, setSelected] = useState(1);
  const [pendingGateway, setPendingGateway] = useState<string>();
  const toggleGateway = async (id: string, enabled: boolean) => {
    setPendingGateway(id);
    try { await api.setGateway(computer.spec.id, id, enabled); setSnapshot(await api.state()); }
    finally { setPendingGateway(undefined); }
  };
  const networkTitle = computer.spec.os === 'macos' ? 'Wi-Fi' : computer.spec.os === 'ubuntu' ? 'Network' : 'Network & internet';
  return <div className={`settings-app settings-${computer.spec.os}`}><aside><div className="settings-user"><span>A</span><div><b>agent</b><small>{computer.spec.os === 'macos' ? 'Apple Account' : 'Local Account'}</small></div></div><label><Search size={14}/><input placeholder={computer.spec.os === 'macos' ? 'Search' : 'Find a setting'}/></label>{sections.map(([name, SectionIcon], index) => <button onClick={() => setSelected(index)} className={selected === index ? 'active' : ''} key={name}><SectionIcon size={18}/>{name === 'Network' ? networkTitle : name}</button>)}</aside><section>{selected === 1 ? <><h1>{networkTitle}</h1><div className="network-card"><span className="network-icon"><Wifi/></span><div><b>SeedNet</b><small>Connected, secured · {computer.spec.ipv4}/24</small></div><span>{computer.spec.os === 'macos' ? 'Details…' : 'Private network'}</span></div><h3>Properties</h3><div className="settings-panel"><p><span>IPv4 address</span><b>{computer.spec.ipv4}</b></p><p><span>DNS server</span><b>10.42.0.2 (dns.seed.local)</b></p><p><span>Link speed</span><b>10 Gbps virtual</b></p><p><span>Adapter</span><b>Seed paravirtualized NIC</b></p></div><h3>Gateway policy</h3>{snapshot.gateways.map((rule) => <button disabled={pendingGateway === rule.id} className="gateway-rule" onClick={() => void toggleGateway(rule.id, !rule.enabled)} key={rule.id}><ShieldCheck/><div><b>{rule.name}</b><small>{rule.protocols.join(', ')} · {rule.hostnames.join(', ')} · {rule.ports === '*' ? 'all ports' : rule.ports.join(', ')}</small></div><i className={rule.enabled ? 'on' : ''}/></button>)}</> : <><h1>{sections[selected]?.[0]}</h1><div className="settings-panel"><p><span>Computer</span><b>{computer.spec.hostname}</b></p><p><span>Operating system</span><b>{computer.spec.os} 2026</b></p><p><span>Installed applications</span><b>{computer.installedApps.length}</b></p><p><span>Running processes</span><b>{computer.processes.length}</b></p></div></>}</section></div>;
}

function ChatGPTApp({ manifest, computer }: { manifest: AppManifest; computer: ComputerSnapshot }) {
  const [mode, setMode] = useState<'chat' | 'work'>('work');
  const [sent, setSent] = useState(false);
  const [prompt, setPrompt] = useState('inspect this computer and tell me what can reach the seed app store.');
  const [attachment, setAttachment] = useState<string>();
  const sendPrompt = async () => { if (!prompt.trim()) return; const result = await api.executeApp(computer.spec.id, manifest.id, 'send-message', { text: prompt.trim(), mode, computerId: computer.spec.id }); if (result.status === 'completed') setSent(true); };
  const newChat = async () => { const result = await api.executeApp(computer.spec.id, manifest.id, 'new-chat', { mode }); if (result.status === 'completed') { setSent(false); setPrompt(''); setAttachment(undefined); } };
  const attachFile = async () => { const path = '/home/agent/Documents/trajectory-task.txt'; const result = await api.executeApp(computer.spec.id, manifest.id, 'attach-file', { path }); if (result.status === 'completed') setAttachment(path.split('/').at(-1)); };
  return <div className={`chatgpt-app chatgpt-${mode}`}><aside><div className="chat-brand"><span>✦</span><b>ChatGPT</b><button><AppWindowIcon size={16}/></button></div><button className="new-chat" onClick={() => void newChat()}><Plus size={17}/>New chat</button>{mode === 'work' && <><h5>WORKSPACE</h5><button><LayoutGrid/>General</button><button className="active"><Code2/>Seed ecosystem</button><button><Bot/>Agent evaluations</button><h5>PROJECTS</h5></>}<div className="chat-recents"><button>computer simulation architecture</button><button>cross-os trajectory design</button><button>gateway safety policies</button></div><footer><CircleUserRound/>Agent <Settings size={15}/></footer></aside><section><header><div className="mode-switch"><button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}>Chat</button><button className={mode === 'work' ? 'active' : ''} onClick={() => setMode('work')}>Work</button></div>{mode === 'work' && <><button className="model-button">GPT-5.6 <span>⌄</span></button><span className="work-chip">high effort</span></>}<button className="share-button">Share</button></header><div className="chat-thread">{sent ? <><div className="user-bubble">{prompt}</div><div className="assistant-answer"><span className="spark">✦</span><div><p>this mac is on <code>10.42.0.0/24</code>. dns resolves <code>appstore.seed.local</code> to the registry node at <code>10.42.0.2</code>.</p><p>the virtual https service is reachable on port 443. real-internet egress remains default-deny except for three audited documentation hosts.</p>{mode === 'work' && <div className="work-events"><span><Activity/>inspected network state</span><span><Network/>resolved dns + traced 3 packets</span><span><ShieldCheck/>verified gateway policy</span></div>}</div></div></> : <div className="chat-empty"><div className="chat-orb">✦</div><h1>{mode === 'chat' ? 'What’s on your mind?' : 'What are we building?'}</h1><p>{mode === 'chat' ? 'Ask anything, sketch an idea, or pick up where you left off.' : 'Work across your projects, computers, and connected tools.'}</p><div className="suggestions"><button onClick={() => setPrompt('inspect this computer')}>inspect this computer</button><button onClick={() => setPrompt('compare the three os environments')}>compare the three os environments</button><button onClick={() => setPrompt('run the networking demo')}>run the networking demo</button></div></div>}</div><div className="composer"><textarea placeholder={mode === 'chat' ? 'Message ChatGPT' : 'Describe a task for your workspace'} value={sent ? '' : prompt} onChange={(event) => setPrompt(event.target.value)}/><div><button className="attach" onClick={() => void attachFile()}><Plus/></button>{mode === 'work' && <span>{attachment ? `attached · ${attachment}` : 'tools · computer · files'}</span>}<button className="send" onClick={() => void sendPrompt()}><Send/></button></div></div><small className="chat-disclaimer">ChatGPT can make mistakes. Check important information.</small></section>{mode === 'work' && <aside className="inspector"><header><b>Inspector</b><button><X/></button></header><h5>RUN STATUS</h5><div className="run-status"><i/>ready</div><h5>CONTEXT</h5><p><Laptop/>{computer.spec.hostname}</p><p><Folder/>Seed ecosystem</p><h5>ARTIFACTS</h5><button><FileCode2/>{attachment ?? 'network-report.md'}</button></aside>}</div>;
}

function CollabApp({ teams, computer, snapshot, setSnapshot }: { teams: boolean; computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const [text, setText] = useState('');
  const serviceId = teams ? 'teams' : 'slack';
  const channelId = 'agent-runs';
  const service = snapshot.collaborationServices.find((item) => item.id === serviceId);
  const messages = service?.messages.filter((message) => message.channelId === channelId) ?? [];
  const send = async () => {
    if (!text.trim()) return;
    await api.collaborate(computer.spec.id, serviceId, channelId, computer.spec.os === 'windows' ? 'Windows Agent' : computer.spec.os === 'macos' ? 'Mac Agent' : 'Ubuntu Agent', text.trim());
    setText(''); setSnapshot(await api.state());
  };
  const navLabels = teams ? ['Activity', 'Chat', 'Teams', 'Calendar', 'Calls', 'Files'] : ['Home', 'DMs', 'Activity', 'Later', 'More'];
  const navIcons = [Activity, MessageSquare, Users, CalendarDays, Radio, File];
  const channelNames = service?.channels.map((channel) => channel.id) ?? ['general', 'agent-runs', 'factory-floor'];
  return <div className={`collab-app ${teams ? 'teams' : 'slack'}`}><nav><span>{teams ? 'T' : 'S'}</span>{navLabels.map((label, index) => { const NavIcon = navIcons[index]!; return <button className={teams && index === 2 || !teams && index === 0 ? 'active' : ''} key={label}><NavIcon/><small>{label}</small></button>; })}</nav><aside><h3>{service?.workspaceName ?? 'Seed Engineering'}{!teams && '⌄'}</h3><label><Search/><input placeholder={teams ? 'Search Teams' : 'Search Slack'}/></label><h5>{teams ? 'YOUR TEAMS' : 'CHANNELS'}</h5>{channelNames.map((channel) => <button className={channel === channelId ? 'active' : ''} key={channel}>{teams ? channel === channelId ? '▾ Simulator Research  ·  Agent runs' : `▸ ${channel.replaceAll('-', ' ')}` : `# ${channel}`}{channel === channelId && <i>{messages.length}</i>}</button>)}</aside><section><header><div><b>{teams ? 'Agent runs' : '# agent-runs'}</b><span>{service?.workspaceName} · {service?.host}</span></div>{teams && <nav><button className="active">Posts</button><button>Files</button><button>Notes</button></nav>}<button>{teams ? 'Meet' : 'Start a huddle'}</button></header><div className="messages">{messages.map((message, index) => <article key={message.id} className={message.computerId === computer.spec.id ? 'message-local' : ''}><span className={`avatar ${index % 3 === 0 ? 'purple' : index % 3 === 1 ? 'green' : 'orange'}`}>{message.author.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2)}</span><div><b>{message.author} <small>{new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {message.computerId}</small></b><p>{message.text}</p></div></article>)}</div><form onSubmit={(event) => { event.preventDefault(); send(); }}><input aria-label={`Message ${channelId} on ${serviceId}`} placeholder={teams ? 'Start a post' : 'Message #agent-runs'} value={text} onChange={(event) => setText(event.target.value)}/><button aria-label="Send message"><Send/></button></form></section></div>;
}

function WiresharkApp({ manifest, computer, snapshot }: { manifest: AppManifest; computer: ComputerSnapshot; snapshot: SimulationSnapshot }) {
  const [capturing, setCapturing] = useState(true);
  const [filterDraft, setFilterDraft] = useState('tcp or dns or icmp');
  const [filter, setFilter] = useState('tcp or dns or icmp');
  const allPackets = snapshot.packets.slice(-30).reverse();
  const tokens = filter.toLowerCase().split(/\s+or\s+/).map((item) => item.trim()).filter(Boolean);
  const packets = allPackets.filter((packet) => !tokens.length || tokens.some((token) => `${packet.protocol} ${packet.source} ${packet.destination} ${packet.summary}`.toLowerCase().includes(token))).slice(0, 15);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = packets.find((packet) => packet.id === selectedId) ?? packets[0];
  const toggleCapture = async () => { const next = !capturing; const result = await api.executeApp(computer.spec.id, manifest.id, next ? 'capture' : 'stop-capture', { interface: 'seed0' }); if (result.status === 'completed') setCapturing(next); };
  const applyFilter = async (value = filterDraft) => { const result = await api.executeApp(computer.spec.id, manifest.id, 'filter', { expression: value }); if (result.status === 'completed') { setFilter(value); setFilterDraft(value); } };
  const inspectPacket = async (id: string) => { const result = await api.executeApp(computer.spec.id, manifest.id, 'inspect-packet', { packetId: id }); if (result.status === 'completed') setSelectedId(id); };
  return <div className="wireshark-app"><div className="wire-toolbar"><button className={capturing ? 'capturing' : ''} onClick={() => void toggleCapture()} title={capturing ? 'Stop capture' : 'Start capture'}><Play size={15} fill="#32c86b"/></button><SquareTerminal size={15}/><button onClick={() => void applyFilter('')}><RefreshCw size={15}/></button><label><span>seed0</span><input aria-label="Display filter" value={filterDraft} onChange={(event) => setFilterDraft(event.target.value)} onBlur={() => void applyFilter()} onKeyDown={(event) => { if (event.key === 'Enter') void applyFilter(); }}/></label></div><div className="packet-table"><header><span>No.</span><span>Time</span><span>Source</span><span>Destination</span><span>Protocol</span><span>Length</span><span>Info</span></header>{packets.map((packet, index) => <button key={packet.id} onClick={() => void inspectPacket(packet.id)} className={`packet-${packet.protocol} ${selected?.id === packet.id ? 'selected' : ''}`}><span>{packets.length - index}</span><span>{new Date(packet.at).toLocaleTimeString([], { hour12: false })}</span><span>{packet.source}</span><span>{packet.destination}</span><span>{packet.protocol.toUpperCase()}</span><span>{packet.bytes}</span><span>{packet.summary}</span></button>)}</div><div className="packet-detail"><b>{selected?.protocol.toUpperCase() ?? 'No packets match the display filter'}</b><p>{selected ? `${selected.source} → ${selected.destination} · ${selected.bytes} bytes · trace ${selected.id}` : 'Adjust the filter or generate traffic from another application.'}</p></div></div>;
}

function CodeApp({ computer, manifest }: { computer: ComputerSnapshot; manifest: AppManifest }) {
  const code = `import { defineComputer } from '@seed/kernel';\n\nexport default defineComputer({\n  hostname: '${computer.spec.hostname}',\n  os: '${computer.spec.os}',\n  network: {\n    ipv4: '${computer.spec.ipv4}',\n    dns: 'dns.seed.local',\n  },\n});`;
  const [taskStatus, setTaskStatus] = useState('ready');
  const runTask = async (task: string) => { setTaskStatus('running'); try { const result = await api.executeApp(computer.spec.id, manifest.id, 'run-task', { task, cwd: computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent' }); setTaskStatus(result.status === 'completed' ? `${task} passed` : `${task} failed`); } catch { setTaskStatus(`${task} failed`); } };
  const reviewChanges = async () => { setTaskStatus('reviewing'); try { const result = await api.executeApp(computer.spec.id, manifest.id, 'source-control', { action: 'review-working-tree' }); setTaskStatus(result.status === 'completed' ? 'working tree reviewed' : 'review failed'); } catch { setTaskStatus('review failed'); } };
  return <div className={`code-app code-${manifest.id}`}><aside><div><AppIcon app={manifest} size={18}/> {manifest.id === 'cursor' ? 'CURSOR EXPLORER' : 'EXPLORER'}</div><b>SEED-ECOSYSTEM</b><button><ChevronRight/>apps</button><button><ChevronRight/>packages</button><button className="active"><FileCode2/>computer.seed.ts</button>{manifest.id === 'cursor' && <><b>AI CHANGES</b><button onClick={() => void reviewChanges()}><Bot/>Review working tree</button></>}</aside><section><header><span>computer.seed.ts <X/></span></header><pre>{code.split('\n').map((line, index) => <div key={index}><i>{index + 1}</i>{line}</div>)}</pre><footer><span>main*</span><span>TypeScript</span><span>{manifest.id === 'cursor' ? `Cursor Tab: ${taskStatus}` : `Seed: ${taskStatus}`}</span></footer></section>{manifest.id === 'cursor' && <aside className="cursor-agent"><header><b>Agent</b><button><X/></button></header><p>{taskStatus === 'ready' ? 'How should the virtual computer change?' : taskStatus}</p><button onClick={() => void runTask('explain-computer-definition')}>Explain this computer definition</button><button onClick={() => void runTask('typecheck')}>Run typecheck</button></aside>}</div>;
}

function PackageCenterApp({ computer, manifest, setSnapshot }: { computer: ComputerSnapshot; manifest: AppManifest; setSnapshot(value: SimulationSnapshot): void }) {
  const managers = computer.spec.os === 'macos' ? ['brew', 'mas', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'nuget', 'vcpkg', 'conda'] : computer.spec.os === 'windows' ? ['winget', 'choco', 'scoop', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'dotnet', 'nuget', 'vcpkg', 'conda'] : ['apt', 'dpkg', 'snap', 'flatpak', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'nuget', 'vcpkg', 'conda'];
  const [manager, setManager] = useState<string>();
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState(false);
  const checkUpdates = async () => { const result = await api.executeApp(computer.spec.id, manifest.id, 'upgrade', { manager: manager ?? managers[0] }); if (result.status === 'completed') { setChecked(true); setSnapshot(await api.state()); } };
  const visible = computer.packages.filter((item) => (!manager || item.manager === manager) && item.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="package-app"><aside><div className="package-brand"><PackageCheck/>Package Center</div><button className={!manager ? 'active' : ''} onClick={() => setManager(undefined)}><LayoutGrid/>Overview</button><button><Download/>Installed</button><button><RefreshCw/>Updates</button><h5>MANAGERS</h5>{managers.map((item) => <button className={manager === item ? 'active' : ''} onClick={() => setManager(item)} key={item}><span>{item.slice(0, 2)}</span>{item}</button>)}</aside><section><header><div><h1>{manager ? `${manager} packages` : `Software on ${computer.spec.hostname}`}</h1><p>{computer.packages.length} packages · {managers.length} manager adapters · VFS-backed receipts</p></div><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter installed software"/></label><button onClick={() => void checkUpdates()}>{checked ? 'Up to date' : 'Check for updates'}</button></header><div className="package-summary"><article><b>{computer.packages.length}</b><span>installed packages</span></article><article><b>{managers.length}</b><span>available managers</span></article><article><b>0</b><span>conflicts</span></article></div><h3>Installed software</h3><div className="package-table"><header><span>Package</span><span>Version</span><span>Manager</span><span>Scope</span><span>Receipt</span></header>{visible.map((item) => <div key={item.id}><span><PackageCheck/>{item.name}</span><span>{item.version}</span><span className="manager-pill">{item.manager}</span><span>{item.scope}</span><span title={item.installPath}>{item.installPath}</span></div>)}</div></section></div>;
}

function GitClientApp({ computer, manifest, setSnapshot }: { computer: ComputerSnapshot; manifest: AppManifest; setSnapshot(value: SimulationSnapshot): void }) {
  const repo = computer.repositories[0];
  const commits = repo?.commits ?? [];
  const push = async () => { const result = await api.executeApp(computer.spec.id, manifest.id, 'push', { cwd: repo?.root, args: ['origin', repo?.branch ?? 'main'] }); if (result.status === 'completed') setSnapshot(await api.state()); };
  return <div className="git-app"><aside><div className="git-brand"><AppIcon app={manifest} size={28}/><b>{manifest.name}</b></div><label><Search/><input placeholder="Filter repositories"/></label><h5>CURRENT REPOSITORY</h5><button className="repo active"><GitBranch/><span>{repo?.root.split('/').at(-1) ?? 'seed-ecosystem'}<small>{repo?.branch ?? 'main'}</small></span></button><h5>CHANGES</h5>{['apps/simulator/App.tsx', 'packages/kernel/software.ts', 'docs/evidence.md'].map((file, index) => <button key={file} className="change"><i>{index === 2 ? 'A' : 'M'}</i>{file}</button>)}</aside><section><header><button><GitBranch/> {repo?.branch ?? 'main'}⌄</button><span>{computer.spec.hostname}</span><button className="push" onClick={() => void push()}>Push origin</button></header><div className="commit-workspace"><div className="commit-list"><h3>History</h3>{(commits.length ? commits : [{ hash: '4d3c2b1', message: 'add package manager simulation', author: 'agent', at: new Date().toISOString(), treeDigest: '' }, { hash: '9a8b7c6', message: 'capture cross-os trajectories', author: 'agent', at: new Date().toISOString(), treeDigest: '' }]).map((commit, index) => <article className={index === 0 ? 'active' : ''} key={commit.hash}><i/><div><b>{commit.message}</b><span>{commit.author} · {commit.hash.slice(0, 7)}</span></div></article>)}</div><div className="commit-detail"><small>COMMIT</small><h2>{commits[0]?.message ?? 'add package manager simulation'}</h2><p>filesystem-backed git metadata, objects, refs, branches, remotes, and commit history agree with shell output.</p><div className="diff"><b>packages/kernel/software.ts</b><code><i>+ class SoftwareEnvironment</i><i>+ git commit writes .git/objects</i><i>+ package receipts persist in VFS</i></code></div></div></div></section></div>;
}

function ContainerApp({ computer, manifest }: { computer: ComputerSnapshot; manifest: AppManifest }) {
  const [running, setRunning] = useState(true);
  const [postgresRunning, setPostgresRunning] = useState(false);
  const [extraContainers, setExtraContainers] = useState<string[]>([]);
  const toggle = async () => { const next = !running; const result = await api.executeApp(computer.spec.id, manifest.id, next ? 'start' : 'stop', { container: 'factory-control-plane' }); if (result.status === 'completed') setRunning(next); };
  const togglePostgres = async () => { const next = !postgresRunning; const result = await api.executeApp(computer.spec.id, manifest.id, next ? 'start' : 'stop', { container: 'postgres' }); if (result.status === 'completed') setPostgresRunning(next); };
  const runContainer = async () => { const name = `seed-task-${extraContainers.length + 1}`; const result = await api.executeApp(computer.spec.id, manifest.id, 'start', { container: name, image: 'seed/task-runner:2026.07' }); if (result.status === 'completed') setExtraContainers((items) => [...items, name]); };
  return <div className="container-app"><aside><div><Container/>Docker Desktop</div>{['Containers', 'Images', 'Volumes', 'Builds', 'Extensions'].map((item, index) => <button className={index === 0 ? 'active' : ''} key={item}>{item}</button>)}</aside><section><header><div><h1>Containers</h1><p>{computer.spec.hostname} · seed container engine</p></div><span className="engine"><i/>Engine running</span></header><div className="container-search"><Search/><input placeholder="Search containers"/><button onClick={() => void runContainer()}>Run a container</button></div><article className="container-row"><button onClick={() => void toggle()}>{running ? '■' : '▶'}</button><div><b>factory-control-plane</b><span>seed/intranet:2026.07</span></div><code>8080:8080</code><span className={running ? 'running' : ''}>{running ? 'running' : 'stopped'}</span><small>{running ? '2.4 MB / 128 MB' : '0 MB'}</small></article><article className="container-row"><button onClick={() => void togglePostgres()}>{postgresRunning ? '■' : '▶'}</button><div><b>postgres</b><span>postgres:17-alpine</span></div><code>5432:5432</code><span className={postgresRunning ? 'running' : ''}>{postgresRunning ? 'running' : 'stopped'}</span><small>{postgresRunning ? '3.1 MB / 128 MB' : 'volume: seed-db'}</small></article>{extraContainers.map((name) => <article className="container-row" key={name}><button onClick={() => void api.executeApp(computer.spec.id, manifest.id, 'stop', { container: name }).then((result) => { if (result.status === 'completed') setExtraContainers((items) => items.filter((item) => item !== name)); })}>■</button><div><b>{name}</b><span>seed/task-runner:2026.07</span></div><code>—</code><span className="running">running</span><small>1.2 MB / 64 MB</small></article>)}<footer><span><Network/> seed-net · 10.42.0.0/24</span><span><HardDrive/> 2 volumes</span></footer></section></div>;
}

function ApiClientApp({ computer }: { computer: ComputerSnapshot }) {
  const [response, setResponse] = useState<{ status: number; body: string; traceId: string }>();
  const [loading, setLoading] = useState(false);
  const send = async () => { setLoading(true); try { setResponse(await api.http(computer.spec.id, 'http://intranet.seed.local:8080/')); } finally { setLoading(false); } };
  return <div className="api-client"><aside><div><AppWindowIcon/>My Workspace</div><button className="active">Factory API</button><button>App Store Registry</button><button>Collaboration</button><h5>COLLECTIONS</h5><button>▸ health checks</button><button>▸ computer fabric</button></aside><section><header><span>GET</span><input value="http://intranet.seed.local:8080/" readOnly/><button onClick={send}>{loading ? 'Sending…' : 'Send'}</button></header><nav><b>Params</b><span>Authorization</span><span>Headers (2)</span><span>Body</span><span>Scripts</span></nav><div className="request-grid"><div><h4>Request headers</h4><p><b>Accept</b><span>text/html</span></p><p><b>X-Seed-Computer</b><span>{computer.spec.id}</span></p></div><div className="response-pane"><header><b>Response</b>{response && <><span>{response.status} OK</span><small>trace {response.traceId.slice(0, 8)}</small></>}</header><pre>{response?.body ?? 'press Send to execute this request through the virtual TCP/IP fabric.'}</pre></div></div></section></div>;
}

function ProcessApp({ computer, setSnapshot }: { computer: ComputerSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const tabs = computer.spec.os === 'windows' ? ['Processes', 'Performance', 'App history', 'Startup apps', 'Users', 'Details', 'Services'] : ['Processes', 'Resources', 'File Systems'];
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [terminating, setTerminating] = useState<number>();
  const visible = computer.processes.filter((process) => process.executable.toLowerCase().includes(query.toLowerCase())).slice(0, 14);
  const terminate = async (pid: number) => { setTerminating(pid); try { await api.terminateProcess(computer.spec.id, pid); setSnapshot(await api.state()); } finally { setTerminating(undefined); } };
  return <div className={`process-app process-${computer.spec.os}`}><header><div><h1>{computer.spec.os === 'windows' ? 'Task Manager' : 'System Monitor'}</h1><p>{tabs[tab]} · {visible.length} visible</p></div><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search processes"/></label><button>Run new task</button></header><nav>{tabs.map((item, index) => <button onClick={() => setTab(index)} className={index === tab ? 'active' : ''} key={item}>{item}</button>)}</nav>{tab === 0 ? <div className="process-table"><header><span>Name</span><span>PID</span><span>Status</span><span>CPU</span><span>Memory</span></header>{visible.map((process) => <button disabled={process.pid === 1 || terminating === process.pid} onDoubleClick={() => void terminate(process.pid)} title={process.pid === 1 ? 'Protected system process' : 'Double-click to end process'} key={process.pid}><span><i/>{process.executable}</span><span>{process.pid}</span><span>{terminating === process.pid ? 'stopping' : process.state}</span><span>{(process.cpuTimeMs / 100).toFixed(1)}%</span><span>{Math.max(1, Math.round(process.memoryBytes / 1024 / 1024))} MB</span></button>)}</div> : <div className="performance-view"><h2>{tabs[tab]}</h2><div className="performance-chart">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ height: `${18 + index * 23 % 74}%` }}/>)}</div><p>CPU 18% · Memory 1.8 / 8.0 GB · Network 24 Kbps</p></div>}</div>;
}

function DesignApp({ manifest, computer }: { manifest: AppManifest; computer: ComputerSnapshot }) {
  const [selected, setSelected] = useState(1);
  const selectLayer = async (index: number, layer: string) => { const result = await api.executeApp(computer.spec.id, manifest.id, 'select', { layer }); if (result.status === 'completed') setSelected(index); };
  return <div className="design-app"><aside><div className="design-logo"><AppIcon app={manifest} size={26}/><b>{manifest.name}</b></div><h5>LAYERS</h5>{['Desktop shell', 'Window group', 'Network card', 'Dock icons', 'Wallpaper'].map((item, index) => <button className={selected === index ? 'active' : ''} onClick={() => void selectLayer(index, item)} key={item}><i/>{item}</button>)}</aside><section><header><button onClick={() => void api.executeApp(computer.spec.id, manifest.id, 'transform', { tool: 'move' })}>Move</button><button onClick={() => void api.executeApp(computer.spec.id, manifest.id, 'new-document', { kind: 'frame' })}>Frame</button><button onClick={() => void api.executeApp(computer.spec.id, manifest.id, 'new-document', { kind: 'shape' })}>Shape</button><span>Seed OS / Evidence scene</span><b>100%</b></header><div className="design-canvas"><div className="artboard"><div className="mini-sidebar"/><div className="mini-title"/><div className="mini-card a"/><div className="mini-card b"/><div className="mini-card c"/><div className="selection-box"><i/><i/><i/><i/></div></div></div></section><aside className="design-inspector"><h4>Design</h4><p><span>X</span><b>240</b><span>Y</span><b>172</b></p><p><span>W</span><b>720</b><span>H</span><b>460</b></p><h5>FILL</h5><div className="fill-row"><i/><code>#8B5CF6</code><span>100%</span></div><h5>AUTO LAYOUT</h5><button onClick={() => void api.executeApp(computer.spec.id, manifest.id, 'edit-properties', { property: 'auto-layout', enabled: true })}>＋ Add auto layout</button></aside></div>;
}
