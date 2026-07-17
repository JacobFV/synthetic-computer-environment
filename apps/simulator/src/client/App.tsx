import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AppWindow as AppWindowIcon, Bot, Box, ChevronLeft, ChevronRight, CircleUserRound, Code2,
  Container, Database, Download, File, FileCode2, Folder, GitBranch, Globe2, HardDrive, Laptop, LayoutGrid,
  LockKeyhole, Maximize2, MessageSquare, Minus, Monitor, Network, PackageCheck, PanelsTopLeft, Play, Plus,
  Power, Radio, RefreshCw, Search, Send, Settings, ShieldCheck, SquareTerminal, Store, Wifi, X,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import appIconData from 'virtual:app-icons';
import type { AppManifest, ComputerSnapshot, DirectoryEntry, OSKind, SimulationSnapshot } from '@seed/protocol';
import { api } from './api';
import { AppSpecificSurface } from './AppSurfaces';

type WindowState = { id: string; x: number; y: number; width: number; height: number; minimized: boolean; maximized: boolean; z: number };

const iconGlyphs: Record<string, string> = {
  finder: '◑', folder: '●', terminal: '›_', settings: '⚙', notes: '▤', preview: '◫', photos: '✿', calculator: '＋',
  calendar: '16', mail: '✉', appstore: 'A', store: '▣', chromium: '◎', slack: '⌗', teams: 'T', chatgpt: '✦',
  vscode: '⌁', wireshark: '♢',
};

function AppIcon({ app, size = 38 }: { app: AppManifest; size?: number }) {
  const source = appIconData[app.icon];
  return <span className={`app-glyph app-glyph-${app.icon} ${source ? 'iconify-glyph' : ''}`} style={{ width: size, height: size, fontSize: Math.max(12, size * .42) }}>{source ? <Icon icon={source} width={size * .72} height={size * .72}/> : iconGlyphs[app.icon] ?? app.name[0]}</span>;
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
      mac: [['finder', { x: 54, y: 70, width: 660, height: 570 }], ['terminal', { x: 610, y: 145, width: 760, height: 470 }], ['chatgpt', { x: 170, y: 86, width: 1040, height: 690 }]],
      appstore: [['terminal', { x: 60, y: 160, width: 610, height: 450 }], ['app-store', { x: 455, y: 70, width: 910, height: 650 }]],
      windows: [['terminal', { x: 48, y: 115, width: 620, height: 470 }], ['chromium', { x: 560, y: 62, width: 820, height: 650 }]],
      ubuntu: [['terminal', { x: 94, y: 90, width: 650, height: 500 }], ['wireshark', { x: 650, y: 120, width: 710, height: 520 }]],
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
    <section className={`desktop desktop-${computer.spec.os}`} onMouseDown={() => setLauncherOpen(false)}>
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
    </section>
  </main>;
}

function Wallpaper({ os }: { os: OSKind }) { return <div className={`wallpaper wallpaper-${os}`}><div className="wallpaper-grain" /></div>; }

function DesktopIcons({ computer, openApp }: { computer: ComputerSnapshot; openApp: (id: string) => void }) {
  const selected = computer.spec.os === 'macos' ? ['finder', 'chatgpt'] : computer.spec.os === 'windows' ? ['explorer', 'chromium'] : ['nautilus', 'terminal'];
  return <div className="desktop-icons">{selected.map((id) => {
    const app = computer.installedApps.find((item) => item.id === id); if (!app) return null;
    return <button key={id} onDoubleClick={() => openApp(id)} onClick={(event) => event.currentTarget.focus()}><AppIcon app={app} size={46} /><span>{app.name}</span></button>;
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
    <div className="mac-dock">{dock.map((app) => <button key={app.id} onClick={(event) => { event.stopPropagation(); openApp(app.id); }} title={app.name}><AppIcon app={app} size={50} />{windows.some((item) => item.id === app.id) && <i />}</button>)}</div>
  </>;
  if (computer.spec.os === 'windows') return <>
    {launcherOpen && <Launcher os="windows" apps={installed} openApp={openApp} />}
    <div className="windows-taskbar"><div className="win-weather"><span>☀</span><small>67°F<br />San Francisco</small></div><div className="win-center"><button className="start-mark" onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}><i /><i /><i /><i /></button><button className="task-search"><Search size={15} /><span>Search</span></button>{dock.slice(0, 6).map((app) => <button key={app.id} onClick={() => openApp(app.id)}><AppIcon app={app} size={34} />{windows.some((item) => item.id === app.id) && <i className="task-running" />}</button>)}</div><div className="win-tray"><ChevronLeft size={13} /><Wifi size={14} /><span>◖</span><small>{time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<br />{time.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' })}</small></div></div>
  </>;
  return <>
    {launcherOpen && <Launcher os="ubuntu" apps={installed} openApp={openApp} />}
    <div className="ubuntu-top"><button onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}>Activities</button><b>{activeApp?.name ?? 'Desktop'}</b><span>{time.toLocaleDateString([], { month: 'short', day: 'numeric' })} {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div><Wifi size={14} /><span>◖</span><Power size={14} /></div></div>
    <div className="ubuntu-dock">{dock.map((app) => <button key={app.id} onClick={(event) => { event.stopPropagation(); openApp(app.id); }}><AppIcon app={app} size={44} />{windows.some((item) => item.id === app.id) && <i />}</button>)}<hr /><button onClick={(event) => { event.stopPropagation(); setLauncherOpen(!launcherOpen); }}><span className="ubuntu-grid"><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></button></div>
  </>;
}

function Launcher({ os, apps, openApp }: { os: OSKind; apps: AppManifest[]; openApp(id: string): void }) {
  const [query, setQuery] = useState('');
  const matches = apps.filter((app) => `${app.name} ${app.description} ${app.publisher}`.toLowerCase().includes(query.toLowerCase()));
  return <div className={`launcher launcher-${os}`} onMouseDown={(event) => event.stopPropagation()}><label><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={os === 'windows' ? 'Search for apps, settings, and documents' : 'Type to search'} /></label><h3>{query ? `${matches.length} results` : os === 'windows' ? 'Pinned' : 'Applications'}</h3><div>{matches.map((app) => <button key={app.id} onClick={() => openApp(app.id)}><AppIcon app={app} size={38} /><span>{app.name}</span></button>)}</div>{os === 'windows' && <footer><CircleUserRound size={22} /><b>agent</b><Power size={18} /></footer>}</div>;
}

function AppWindow({ os, manifest, state, focused, children, onFocus, onMove, onResize, onClose, onMinimize, onMaximize }: { os: OSKind; manifest: AppManifest; state: WindowState; focused: boolean; children: React.ReactNode; onFocus(): void; onMove(x: number, y: number): void; onResize(width: number, height: number): void; onClose(): void; onMinimize(): void; onMaximize(): void }) {
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | undefined>(undefined);
  const resize = useRef<{ x: number; y: number; width: number; height: number } | undefined>(undefined);
  const movePointer = (event: React.PointerEvent) => {
    if (drag.current) onMove(Math.max(0, drag.current.x + event.clientX - drag.current.startX), Math.max(os === 'macos' || os === 'ubuntu' ? 28 : 0, drag.current.y + event.clientY - drag.current.startY));
    if (resize.current) onResize(Math.max(430, resize.current.width + event.clientX - resize.current.x), Math.max(280, resize.current.height + event.clientY - resize.current.y));
  };
  const stopPointer = () => { drag.current = undefined; resize.current = undefined; };
  const style = state.maximized ? { left: os === 'ubuntu' ? 66 : 0, top: os === 'macos' || os === 'ubuntu' ? 28 : 0, width: os === 'ubuntu' ? 'calc(100% - 66px)' : '100%', height: os === 'windows' ? 'calc(100% - 48px)' : 'calc(100% - 28px)', zIndex: state.z } : { left: state.x, top: state.y, width: state.width, height: state.height, zIndex: state.z };
  const customTitlebar = manifest.id === 'chatgpt';
  const nativeIcon = appIconData[manifest.icon];
  return <article className={`app-window window-${os} ${focused ? 'focused' : ''} ${state.maximized ? 'maximized' : ''} ${customTitlebar ? 'window-chatgpt' : ''}`} style={style} onPointerMove={movePointer} onPointerUp={stopPointer} onPointerCancel={stopPointer} onMouseDown={onFocus}>
    <header className={`window-titlebar ${customTitlebar ? 'chatgpt-titlebar' : ''}`} onDoubleClick={onMaximize} onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; drag.current = { x: state.x, y: state.y, startX: event.clientX, startY: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}>
      {os === 'macos' && <div className="traffic"><button onClick={onClose}/><button onClick={onMinimize}/><button onClick={onMaximize}/></div>}
      {customTitlebar ? <div className="chatgpt-title-brand"><Icon icon={appIconData.chatgpt!}/><b>ChatGPT</b></div> : <>{os !== 'macos' && (nativeIcon ? <Icon className="window-native-icon" icon={nativeIcon} width={15} height={15}/> : <span className="window-native-icon">{manifest.name[0]}</span>)}<b>{manifest.name}</b></>}
      {os !== 'macos' && <div className="window-actions"><button onClick={onMinimize}><Minus size={14}/></button><button onClick={onMaximize}><Maximize2 size={12}/></button><button className="close" onClick={onClose}><X size={14}/></button></div>}
    </header>
    <div className="window-content">{children}</div>
    {!state.maximized && <button className="resize-handle" onPointerDown={(event) => { resize.current = { x: event.clientX, y: event.clientY, width: state.width, height: state.height }; event.currentTarget.setPointerCapture(event.pointerId); }} />}
  </article>;
}

function Application({ manifest, computer, snapshot, setSnapshot, demo }: { manifest: AppManifest; computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void; demo: string }) {
  if (manifest.entrypoint === 'system://terminal') return <TerminalApp computer={computer} demo={demo} />;
  if (manifest.entrypoint === 'system://files') return <FilesApp computer={computer} />;
  if (manifest.entrypoint === 'system://app-store') return <StoreApp computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} />;
  if (manifest.entrypoint === 'system://settings') return <SettingsApp computer={computer} snapshot={snapshot} />;
  if (manifest.entrypoint === 'app://browser') return <BrowserApp manifest={manifest} computer={computer} demo={demo} />;
  if (manifest.entrypoint === 'app://chatgpt') return <ChatGPTApp />;
  if (manifest.entrypoint === 'app://slack' || manifest.entrypoint === 'app://teams') return <CollabApp teams={manifest.entrypoint.endsWith('teams')} computer={computer} snapshot={snapshot} setSnapshot={setSnapshot} />;
  if (manifest.entrypoint === 'app://wireshark') return <WiresharkApp snapshot={snapshot} />;
  if (manifest.entrypoint === 'app://vscode') return <CodeApp computer={computer} manifest={manifest} />;
  if (manifest.entrypoint === 'app://packages') return <PackageCenterApp computer={computer} />;
  if (manifest.entrypoint === 'app://git') return <GitClientApp computer={computer} manifest={manifest} />;
  if (manifest.entrypoint === 'app://containers') return <ContainerApp computer={computer} />;
  if (manifest.entrypoint === 'app://api-client') return <ApiClientApp computer={computer} />;
  if (manifest.entrypoint === 'app://processes') return <ProcessApp computer={computer} />;
  if (manifest.id === 'figma') return <DesignApp manifest={manifest} />;
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

function FilesApp({ computer }: { computer: ComputerSnapshot }) {
  const home = computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
  const [currentPath, setCurrentPath] = useState(`${home}/Desktop`);
  const [files, setFiles] = useState<DirectoryEntry[]>([]);
  useEffect(() => { api.files(computer.spec.id, currentPath).then(setFiles); }, [computer.spec.id, currentPath]);
  return <div className="files-app"><aside><h4>Favorites</h4>{['Desktop', 'Documents', 'Downloads'].map((name) => <button key={name} className={currentPath.endsWith(name) ? 'active' : ''} onClick={() => setCurrentPath(`${home}/${name}`)}><Folder size={17}/>{name}</button>)}<h4>Locations</h4><button><HardDrive size={17}/>{computer.spec.disks[0]?.label}</button><button><Network size={17}/>Network</button></aside><section><div className="files-toolbar"><button><ChevronLeft size={17}/></button><button><ChevronRight size={17}/></button><span>{currentPath.split('/').filter(Boolean).join(' › ')}</span><button><LayoutGrid size={17}/></button><button><Search size={17}/></button></div><div className="file-grid">{files.map((entry) => <button key={entry.path} onDoubleClick={() => entry.inode.kind === 'directory' && setCurrentPath(entry.path)}>{entry.inode.kind === 'directory' ? <Folder size={46} fill="currentColor"/> : entry.name.endsWith('.md') ? <FileCode2 size={43}/> : <File size={43}/>}<span>{entry.name}</span><small>{entry.inode.kind === 'directory' ? 'Folder' : `${entry.inode.size} bytes`}</small></button>)}</div><footer>{files.length} items · {computer.spec.ipv4}</footer></section></div>;
}

function BrowserApp({ computer, demo }: { computer: ComputerSnapshot; demo: string }) {
  const [address, setAddress] = useState('http://intranet.seed.local:8080/');
  const [response, setResponse] = useState<{ body: string; status: number; traceId: string }>();
  const [loading, setLoading] = useState(false);
  const navigate = async () => { setLoading(true); try { setResponse(await api.http(computer.spec.id, address)); } finally { setLoading(false); } };
  useEffect(() => { if (demo) navigate(); }, []);
  return <div className="browser-app"><div className="browser-tabs"><span><Globe2 size={14}/> factory control plane <X size={12}/></span><Plus size={14}/></div><form className="addressbar" onSubmit={(event) => { event.preventDefault(); navigate(); }}><button type="button"><ChevronLeft size={16}/></button><button type="button"><ChevronRight size={16}/></button><button type="button" onClick={navigate}><RefreshCw size={15}/></button><label><LockKeyhole size={13}/><input value={address} onChange={(event) => setAddress(event.target.value)}/></label></form><div className="browser-body">{loading ? <div className="browser-loading">routing packets…</div> : response ? <iframe sandbox="" srcDoc={response.body} title="virtual internet page"/> : <div className="browser-newtab"><div className="chromium-logo">◎</div><label><Search/><input placeholder="Search seed internet or type a URL"/></label><div><button onClick={() => { setAddress('http://intranet.seed.local:8080/'); setTimeout(navigate); }}><Monitor/>Intranet</button><button><Store/>App Store</button><button><MessageSquare/>Slack</button></div></div>}</div>{response && <div className="browser-status">virtual http {response.status} · trace {response.traceId.slice(0, 8)} · source {computer.spec.ipv4}</div>}</div>;
}

function StoreApp({ computer, snapshot, setSnapshot }: { computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const [query, setQuery] = useState('');
  const candidates = snapshot.appCatalog.filter((item) => !item.system && item.supportedOS.includes(computer.spec.os) && item.name.toLowerCase().includes(query.toLowerCase()));
  const install = async (id: string) => { await api.install(computer.spec.id, id); setSnapshot(await api.state()); };
  return <div className="store-app"><aside><h2>{computer.spec.os === 'macos' ? 'App Store' : computer.spec.os === 'windows' ? 'Microsoft Store' : 'App Center'}</h2><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search"/></label>{['Discover', 'Create', 'Work', 'Develop', 'Updates'].map((item, index) => <button className={index === 0 ? 'active' : ''} key={item}>{index === 0 ? <Store/> : index === 4 ? <Download/> : <AppWindowIcon/>}{item}</button>)}</aside><section><div className="store-hero"><small>ESSENTIALS FOR AGENTS</small><h1>Build, communicate,<br/>and inspect the network.</h1><p>signed packages from appstore.seed.local</p></div><h3>Apps we love</h3><div className="store-list">{candidates.map((app) => { const installed = computer.installedApps.some((item) => item.id === app.id); return <article key={app.id}><AppIcon app={app} size={54}/><div><b>{app.name}</b><span>{app.description}</span><small>{app.publisher} · {app.version}</small></div><button disabled={installed} onClick={() => install(app.id)}>{installed ? 'OPEN' : 'GET'}</button></article>; })}</div></section></div>;
}

function SettingsApp({ computer, snapshot }: { computer: ComputerSnapshot; snapshot: SimulationSnapshot }) {
  const sections: Array<[string, typeof Monitor]> = [['System', Monitor], ['Network', Network], ['Apps', Box], ['Privacy & Security', ShieldCheck]];
  return <div className="settings-app"><aside><div className="settings-user"><span>A</span><div><b>agent</b><small>Local Account</small></div></div><label><Search size={14}/><input placeholder="Find a setting"/></label>{sections.map(([name, Icon], index) => <button className={index === 1 ? 'active' : ''} key={name}><Icon size={18}/>{name}</button>)}</aside><section><h1>Network & internet</h1><div className="network-card"><span className="network-icon"><Wifi/></span><div><b>SeedNet</b><small>Connected, secured · {computer.spec.ipv4}/24</small></div><span>Private network</span></div><h3>Properties</h3><div className="settings-panel"><p><span>IPv4 address</span><b>{computer.spec.ipv4}</b></p><p><span>DNS server</span><b>10.42.0.2 (dns.seed.local)</b></p><p><span>Link speed</span><b>10 Gbps virtual</b></p><p><span>Adapter</span><b>Seed paravirtualized NIC</b></p></div><h3>Gateway policy</h3>{snapshot.gateways.map((rule) => <div className="gateway-rule" key={rule.id}><ShieldCheck/><div><b>{rule.name}</b><small>{rule.protocols.join(', ')} · {rule.hostnames.join(', ')} · {rule.ports === '*' ? 'all ports' : rule.ports.join(', ')}</small></div><i className={rule.enabled ? 'on' : ''}/></div>)}</section></div>;
}

function ChatGPTApp() {
  const [mode, setMode] = useState<'chat' | 'work'>('work');
  const [sent, setSent] = useState(false);
  return <div className={`chatgpt-app chatgpt-${mode}`}><aside><div className="chat-brand"><span>✦</span>{mode === 'work' && <b>workspace ai</b>}<button><AppWindowIcon size={16}/></button></div><button className="new-chat"><Plus size={17}/>New chat</button>{mode === 'work' && <><h5>WORKSPACE</h5><button><LayoutGrid/>General</button><button className="active"><Code2/>Seed ecosystem</button><button><Bot/>Agent evaluations</button><h5>PROJECTS</h5></>}<div className="chat-recents"><button>computer simulation architecture</button><button>cross-os trajectory design</button><button>gateway safety policies</button></div><footer><CircleUserRound/>Jacob <Settings size={15}/></footer></aside><section><header><div className="mode-switch"><button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}>Chat</button><button className={mode === 'work' ? 'active' : ''} onClick={() => setMode('work')}>Work</button></div>{mode === 'work' && <><button className="model-button">GPT-5.6 <span>⌄</span></button><span className="work-chip">high effort</span></>}<button className="share-button">Share</button></header><div className="chat-thread">{sent ? <><div className="user-bubble">inspect this computer and tell me what can reach the seed app store.</div><div className="assistant-answer"><span className="spark">✦</span><div><p>this mac is on <code>10.42.0.0/24</code>. dns resolves <code>appstore.seed.local</code> to the registry node at <code>10.42.0.2</code>.</p><p>the virtual https service is reachable on port 443. real-internet egress remains default-deny except for three audited documentation hosts.</p>{mode === 'work' && <div className="work-events"><span><Activity/>inspected network state</span><span><Network/>resolved dns + traced 3 packets</span><span><ShieldCheck/>verified gateway policy</span></div>}</div></div></> : <div className="chat-empty"><div className="chat-orb">✦</div><h1>{mode === 'chat' ? 'What’s on your mind?' : 'What are we building?'}</h1><p>{mode === 'chat' ? 'Ask anything, sketch an idea, or pick up where you left off.' : 'Work across your projects, computers, and connected tools.'}</p><div className="suggestions"><button>inspect this computer</button><button>compare the three os environments</button><button>run the networking demo</button></div></div>}</div><div className="composer"><textarea placeholder={mode === 'chat' ? 'Message ChatGPT' : 'Describe a task for your workspace'} defaultValue={sent ? '' : 'inspect this computer and tell me what can reach the seed app store.'}/><div><button className="attach"><Plus/></button>{mode === 'work' && <span>tools · computer · files</span>}<button className="send" onClick={() => setSent(true)}><Send/></button></div></div><small className="chat-disclaimer">supplied workspace clone v0.3.0 · desktop adapter · model output may be simulated</small></section>{mode === 'work' && <aside className="inspector"><header><b>Inspector</b><button><X/></button></header><h5>RUN STATUS</h5><div className="run-status"><i/>ready</div><h5>CONTEXT</h5><p><Laptop/>mac-studio</p><p><Folder/>Seed ecosystem</p><h5>ARTIFACTS</h5><button><FileCode2/>network-report.md</button></aside>}</div>;
}

function CollabApp({ teams, computer, snapshot, setSnapshot }: { teams: boolean; computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const [text, setText] = useState('');
  const messages = snapshot.collaboration.filter((message) => message.channel === 'agent-runs');
  const send = async () => {
    if (!text.trim()) return;
    await api.collaborate(computer.spec.id, 'agent-runs', computer.spec.os === 'windows' ? 'Windows Agent' : computer.spec.os === 'macos' ? 'Mac Agent' : 'Ubuntu Agent', text.trim());
    setText(''); setSnapshot(await api.state());
  };
  return <div className={`collab-app ${teams ? 'teams' : 'slack'}`}><nav><span>{teams ? 'T' : 'S'}</span>{[MessageSquare, Activity, Bot, File].map((NavIcon, index) => <button key={index}><NavIcon/></button>)}</nav><aside><h3>{teams ? 'Seed Engineering' : 'Seed Engineering⌄'}</h3><label><Search/><input placeholder="Search"/></label><h5>CHANNELS</h5>{['general', 'agent-runs', 'factory-floor', 'random'].map((channel, index) => <button className={index === 1 ? 'active' : ''} key={channel}># {channel}{index === 1 && <i>{messages.length}</i>}</button>)}</aside><section><header><b># agent-runs</b><span>12 members · live via collab.seed.local</span><button>Start a huddle</button></header><div className="messages">{messages.map((message, index) => <article key={message.id} className={message.computerId === computer.spec.id ? 'message-local' : ''}><span className={`avatar ${index % 3 === 0 ? 'purple' : index % 3 === 1 ? 'green' : 'orange'}`}>{message.author.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span><div><b>{message.author} <small>{new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {message.computerId}</small></b><p>{message.text}</p>{index === 0 && <code>macos 42/42 · windows 42/42 · ubuntu 42/42</code>}</div></article>)}</div><form onSubmit={(event) => { event.preventDefault(); send(); }}><input aria-label="Message agent-runs" placeholder="Message #agent-runs" value={text} onChange={(event) => setText(event.target.value)}/><button aria-label="Send message"><Send/></button></form></section></div>;
}

function WiresharkApp({ snapshot }: { snapshot: SimulationSnapshot }) {
  const packets = snapshot.packets.slice(-15).reverse();
  return <div className="wireshark-app"><div className="wire-toolbar"><Play size={15} fill="#32c86b"/><SquareTerminal size={15}/><RefreshCw size={15}/><label><span>seed0</span><input value="tcp or dns or icmp" readOnly/></label></div><div className="packet-table"><header><span>No.</span><span>Time</span><span>Source</span><span>Destination</span><span>Protocol</span><span>Length</span><span>Info</span></header>{packets.map((packet, index) => <div key={packet.id} className={`packet-${packet.protocol}`}><span>{packets.length - index}</span><span>{new Date(packet.at).toLocaleTimeString([], { hour12: false })}</span><span>{packet.source}</span><span>{packet.destination}</span><span>{packet.protocol.toUpperCase()}</span><span>{packet.bytes}</span><span>{packet.summary}</span></div>)}</div><div className="packet-detail"><b>Seed Internet Protocol</b><p>trace-backed conceptual packet · id {packets[0]?.id ?? 'waiting for traffic'}</p></div></div>;
}

function CodeApp({ computer }: { computer: ComputerSnapshot }) {
  const code = `import { defineComputer } from '@seed/kernel';\n\nexport default defineComputer({\n  hostname: '${computer.spec.hostname}',\n  os: '${computer.spec.os}',\n  network: {\n    ipv4: '${computer.spec.ipv4}',\n    dns: 'dns.seed.local',\n  },\n});`;
  return <div className="code-app"><aside><div><FileCode2/> EXPLORER</div><b>SEED-ECOSYSTEM</b><button><ChevronRight/>apps</button><button><ChevronRight/>packages</button><button className="active"><FileCode2/>computer.seed.ts</button></aside><section><header><span>computer.seed.ts <X/></span></header><pre>{code.split('\n').map((line, index) => <div key={index}><i>{index + 1}</i>{line}</div>)}</pre><footer><span>main*</span><span>TypeScript</span><span>Seed: connected</span></footer></section></div>;
}

function PackageCenterApp({ computer }: { computer: ComputerSnapshot }) {
  const managers = computer.spec.os === 'macos' ? ['brew', 'npm', 'pnpm', 'yarn', 'pip', 'pipx', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'conda'] : computer.spec.os === 'windows' ? ['winget', 'choco', 'scoop', 'npm', 'pnpm', 'yarn', 'pip', 'pipx', 'uv', 'cargo', 'go', 'gem', 'dotnet', 'conda'] : ['apt', 'snap', 'flatpak', 'npm', 'pnpm', 'yarn', 'pip', 'pipx', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'conda'];
  return <div className="package-app"><aside><div className="package-brand"><PackageCheck/>Package Center</div><button className="active"><LayoutGrid/>Overview</button><button><Download/>Installed</button><button><RefreshCw/>Updates</button><h5>MANAGERS</h5>{managers.map((manager) => <button key={manager}><span>{manager.slice(0, 2)}</span>{manager}</button>)}</aside><section><header><div><h1>Software on {computer.spec.hostname}</h1><p>{computer.packages.length} packages · {managers.length} manager adapters · VFS-backed receipts</p></div><button>Check for updates</button></header><div className="package-summary"><article><b>{computer.packages.length}</b><span>installed packages</span></article><article><b>{managers.length}</b><span>available managers</span></article><article><b>0</b><span>conflicts</span></article></div><h3>Installed software</h3><div className="package-table"><header><span>Package</span><span>Version</span><span>Manager</span><span>Scope</span><span>Receipt</span></header>{computer.packages.map((item) => <div key={item.id}><span><PackageCheck/>{item.name}</span><span>{item.version}</span><span className="manager-pill">{item.manager}</span><span>{item.scope}</span><span title={item.installPath}>{item.installPath}</span></div>)}</div></section></div>;
}

function GitClientApp({ computer, manifest }: { computer: ComputerSnapshot; manifest: AppManifest }) {
  const repo = computer.repositories[0];
  const commits = repo?.commits ?? [];
  return <div className="git-app"><aside><div className="git-brand"><AppIcon app={manifest} size={28}/><b>{manifest.name}</b></div><label><Search/><input placeholder="Filter repositories"/></label><h5>CURRENT REPOSITORY</h5><button className="repo active"><GitBranch/><span>{repo?.root.split('/').at(-1) ?? 'seed-ecosystem'}<small>{repo?.branch ?? 'main'}</small></span></button><h5>CHANGES</h5>{['apps/simulator/App.tsx', 'packages/kernel/software.ts', 'docs/evidence.md'].map((file, index) => <button key={file} className="change"><i>{index === 2 ? 'A' : 'M'}</i>{file}</button>)}</aside><section><header><button><GitBranch/> {repo?.branch ?? 'main'}⌄</button><span>{computer.spec.hostname}</span><button className="push">Push origin</button></header><div className="commit-workspace"><div className="commit-list"><h3>History</h3>{(commits.length ? commits : [{ hash: '4d3c2b1', message: 'add package manager simulation', author: 'agent', at: new Date().toISOString(), treeDigest: '' }, { hash: '9a8b7c6', message: 'capture cross-os trajectories', author: 'agent', at: new Date().toISOString(), treeDigest: '' }]).map((commit, index) => <article className={index === 0 ? 'active' : ''} key={commit.hash}><i/><div><b>{commit.message}</b><span>{commit.author} · {commit.hash.slice(0, 7)}</span></div></article>)}</div><div className="commit-detail"><small>COMMIT</small><h2>{commits[0]?.message ?? 'add package manager simulation'}</h2><p>filesystem-backed git metadata, objects, refs, branches, remotes, and commit history agree with shell output.</p><div className="diff"><b>packages/kernel/software.ts</b><code><i>+ class SoftwareEnvironment</i><i>+ git commit writes .git/objects</i><i>+ package receipts persist in VFS</i></code></div></div></div></section></div>;
}

function ContainerApp({ computer }: { computer: ComputerSnapshot }) {
  const [running, setRunning] = useState(true);
  return <div className="container-app"><aside><div><Container/>Docker Desktop</div>{['Containers', 'Images', 'Volumes', 'Builds', 'Extensions'].map((item, index) => <button className={index === 0 ? 'active' : ''} key={item}>{item}</button>)}</aside><section><header><div><h1>Containers</h1><p>{computer.spec.hostname} · seed container engine</p></div><span className="engine"><i/>Engine running</span></header><div className="container-search"><Search/><input placeholder="Search containers"/><button>Run a container</button></div><article className="container-row"><button onClick={() => setRunning(!running)}>{running ? '■' : '▶'}</button><div><b>factory-control-plane</b><span>seed/intranet:2026.07</span></div><code>8080:8080</code><span className={running ? 'running' : ''}>{running ? 'running' : 'stopped'}</span><small>{running ? '2.4 MB / 128 MB' : '0 MB'}</small></article><article className="container-row"><button>▶</button><div><b>postgres</b><span>postgres:17-alpine</span></div><code>5432:5432</code><span>stopped</span><small>volume: seed-db</small></article><footer><span><Network/> seed-net · 10.42.0.0/24</span><span><HardDrive/> 2 volumes</span></footer></section></div>;
}

function ApiClientApp({ computer }: { computer: ComputerSnapshot }) {
  const [response, setResponse] = useState<{ status: number; body: string; traceId: string }>();
  const [loading, setLoading] = useState(false);
  const send = async () => { setLoading(true); try { setResponse(await api.http(computer.spec.id, 'http://intranet.seed.local:8080/')); } finally { setLoading(false); } };
  return <div className="api-client"><aside><div><AppWindowIcon/>My Workspace</div><button className="active">Factory API</button><button>App Store Registry</button><button>Collaboration</button><h5>COLLECTIONS</h5><button>▸ health checks</button><button>▸ computer fabric</button></aside><section><header><span>GET</span><input value="http://intranet.seed.local:8080/" readOnly/><button onClick={send}>{loading ? 'Sending…' : 'Send'}</button></header><nav><b>Params</b><span>Authorization</span><span>Headers (2)</span><span>Body</span><span>Scripts</span></nav><div className="request-grid"><div><h4>Request headers</h4><p><b>Accept</b><span>text/html</span></p><p><b>X-Seed-Computer</b><span>{computer.spec.id}</span></p></div><div className="response-pane"><header><b>Response</b>{response && <><span>{response.status} OK</span><small>trace {response.traceId.slice(0, 8)}</small></>}</header><pre>{response?.body ?? 'press Send to execute this request through the virtual TCP/IP fabric.'}</pre></div></div></section></div>;
}

function ProcessApp({ computer }: { computer: ComputerSnapshot }) {
  return <div className="process-app"><header><div><h1>{computer.spec.os === 'windows' ? 'Task Manager' : 'System Monitor'}</h1><p>Processes · {computer.processes.length} running</p></div><button>Run new task</button></header><nav>{['Processes', 'Performance', 'App history', 'Startup apps', 'Users', 'Details', 'Services'].map((item, index) => <button className={index === 0 ? 'active' : ''} key={item}>{item}</button>)}</nav><div className="process-table"><header><span>Name</span><span>PID</span><span>Status</span><span>CPU</span><span>Memory</span></header>{computer.processes.slice(0, 14).map((process) => <div key={process.pid}><span><i/>{process.executable}</span><span>{process.pid}</span><span>{process.state}</span><span>{(process.cpuTimeMs / 100).toFixed(1)}%</span><span>{Math.max(1, Math.round(process.memoryBytes / 1024 / 1024))} MB</span></div>)}</div></div>;
}

function DesignApp({ manifest }: { manifest: AppManifest }) {
  const [selected, setSelected] = useState(1);
  return <div className="design-app"><aside><div className="design-logo"><AppIcon app={manifest} size={26}/><b>{manifest.name}</b></div><h5>LAYERS</h5>{['Desktop shell', 'Window group', 'Network card', 'Dock icons', 'Wallpaper'].map((item, index) => <button className={selected === index ? 'active' : ''} onClick={() => setSelected(index)} key={item}><i/>{item}</button>)}</aside><section><header><button>Move</button><button>Frame</button><button>Shape</button><span>Seed OS / Evidence scene</span><b>100%</b></header><div className="design-canvas"><div className="artboard"><div className="mini-sidebar"/><div className="mini-title"/><div className="mini-card a"/><div className="mini-card b"/><div className="mini-card c"/><div className="selection-box"><i/><i/><i/><i/></div></div></div></section><aside className="design-inspector"><h4>Design</h4><p><span>X</span><b>240</b><span>Y</span><b>172</b></p><p><span>W</span><b>720</b><span>H</span><b>460</b></p><h5>FILL</h5><div className="fill-row"><i/><code>#8B5CF6</code><span>100%</span></div><h5>AUTO LAYOUT</h5><button>＋ Add auto layout</button></aside></div>;
}

function GenericApp({ manifest, computer }: { manifest: AppManifest; computer: ComputerSnapshot }) {
  const mode = manifest.entrypoint.split('://').at(-1) ?? 'app';
  const content: Record<string, { title: string; items: string[] }> = {
    documents: { title: 'Recent documents', items: ['simulation-evidence.md', 'agent-trajectory-plan', 'ecosystem-survey', 'network-notes'] },
    media: { title: 'Now playing', items: ['Computer Love', 'Digital Witness', 'Everything in Its Right Place', 'Technologic'] },
    tasks: { title: 'Today', items: ['verify package installs', 'capture 48 desktop states', 'review cross-device recording', 'publish evidence deck'] },
    vault: { title: 'All vaults', items: ['seed infrastructure', 'development', 'personal', 'shared operations'] },
    database: { title: 'seed-db · connected', items: ['computers  4 rows', 'trajectory_events  1,284 rows', 'packages  73 rows', 'messages  8 rows'] },
    library: { title: 'Library', items: ['Simulation Lab', 'Factorio', 'Portal 2', 'Kerbal Space Program'] },
    maps: { title: 'San Francisco', items: ['Mission District', 'Main Library', 'China Basin', 'Dogpatch'] },
  };
  const view = content[mode] ?? { title: manifest.name, items: [manifest.description, `installed on ${computer.spec.hostname}`, manifest.packagePath, manifest.capabilities.join(' · ') || 'local application'] };
  return <div className={`role-app role-${mode}`}><aside><div><AppIcon app={manifest} size={38}/><b>{manifest.name}</b></div><button className="active">Home</button><button>Recent</button><button>Shared</button><button>Settings</button></aside><section><header><div><h1>{view.title}</h1><p>{computer.spec.hostname} · {manifest.version}</p></div><button>New</button></header><div className="role-grid">{view.items.map((item, index) => <article key={item}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{item}</b><small>{index % 2 ? 'updated today' : 'available offline'}</small></div><button>•••</button></article>)}</div><footer><PackageCheck/> installed from {manifest.packagePath}</footer></section></div>;
}
