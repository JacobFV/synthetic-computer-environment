import { useMemo, useRef, useState } from 'react';
import { Download, LayoutGrid, PackageCheck, RefreshCw, Search } from 'lucide-react';
import type { AppManifest, ComputerSnapshot, SimulationSnapshot } from '@seed/protocol';
import { api } from '../api';

export function PackageCenterApp({ computer, manifest, setSnapshot }: { computer: ComputerSnapshot; manifest: AppManifest; setSnapshot(value: SimulationSnapshot): void }) {
  const managers = computer.spec.os === 'macos' ? ['brew', 'mas', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'nuget', 'vcpkg', 'conda'] : computer.spec.os === 'windows' ? ['winget', 'choco', 'scoop', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'dotnet', 'nuget', 'vcpkg', 'conda'] : ['apt', 'dpkg', 'snap', 'flatpak', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pipx', 'poetry', 'uv', 'cargo', 'go', 'gem', 'composer', 'dotnet', 'nuget', 'vcpkg', 'conda'];
  const [manager, setManager] = useState<string>();
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState(false);
  const [view, setView] = useState<'overview' | 'installed' | 'updates'>('overview');
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  // Deterministically mark a subset of packages as having available updates.
  const upgradable = useMemo(() => computer.packages.filter((_, index) => index % 4 === 1).map((item) => item.id), [computer.packages]);
  const pendingUpdates = upgradable.filter((id) => !resolved.has(id));
  const checkUpdates = async () => { const result = await api.executeApp(computer.spec.id, manifest.id, 'upgrade', { manager: manager ?? managers[0] }); if (result.status === 'completed') { setChecked(true); setResolved(new Set(upgradable)); setSnapshot(await api.state()); } };
  const filtered = computer.packages.filter((item) => (!manager || item.manager === manager) && item.name.toLowerCase().includes(query.toLowerCase()));
  const visible = view === 'updates' ? filtered.filter((item) => pendingUpdates.includes(item.id)) : filtered;
  const bump = (version: string) => version.replace(/(\d+)(?!.*\d)/, (match) => String(Number(match) + 1));
  const searchRef = useRef<HTMLInputElement>(null);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus(); } };
  return <div className="package-app" tabIndex={0} style={{ outline: 'none' }} onKeyDown={onKeyDown}><aside><div className="package-brand"><PackageCheck/>Package Center</div><button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}><LayoutGrid/>Overview</button><button className={view === 'installed' ? 'active' : ''} onClick={() => setView('installed')}><Download/>Installed</button><button className={view === 'updates' ? 'active' : ''} onClick={() => setView('updates')}><RefreshCw/>Updates{pendingUpdates.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, background: '#e0245e', color: '#fff', borderRadius: 8, padding: '0 6px' }}>{pendingUpdates.length}</span>}</button><h5>MANAGERS</h5>{managers.map((item) => <button className={manager === item ? 'active' : ''} onClick={() => setManager(item)} key={item}><span>{item.slice(0, 2)}</span>{item}</button>)}</aside><section><header><div><h1>{view === 'updates' ? 'Available updates' : view === 'installed' ? 'Installed software' : manager ? `${manager} packages` : `Software on ${computer.spec.hostname}`}</h1><p>{computer.packages.length} packages · {managers.length} manager adapters · VFS-backed receipts</p></div><label><Search/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter installed software"/></label><button onClick={() => void checkUpdates()}>{checked || !pendingUpdates.length ? 'Up to date' : `Update all (${pendingUpdates.length})`}</button></header>
    {view === 'overview' && <div className="package-summary"><article><b>{computer.packages.length}</b><span>installed packages</span></article><article><b>{managers.length}</b><span>available managers</span></article><article><b>{pendingUpdates.length}</b><span>available updates</span></article></div>}
    <h3>{view === 'updates' ? 'Packages with a newer version' : 'Installed software'}</h3>
    {view === 'updates'
      ? <div className="package-table"><header><span>Package</span><span>Installed</span><span>Available</span><span>Manager</span><span>Receipt</span></header>{visible.map((item) => <div key={item.id}><span><PackageCheck/>{item.name}</span><span>{item.version}</span><span style={{ color: '#32c86b' }}>{bump(item.version)}</span><span className="manager-pill">{item.manager}</span><span title={item.installPath}>{item.installPath}</span></div>)}{!visible.length && <div style={{ padding: 14, opacity: .7 }}>{query ? 'No matching updates.' : 'All packages are up to date.'}</div>}</div>
      : <div className="package-table"><header><span>Package</span><span>Version</span><span>Manager</span><span>Scope</span><span>Receipt</span></header>{visible.map((item) => <div key={item.id}><span><PackageCheck/>{item.name}{pendingUpdates.includes(item.id) && <i title="Update available" style={{ marginLeft: 6, width: 7, height: 7, borderRadius: '50%', background: '#e0a635', display: 'inline-block' }}/>}</span><span>{item.version}</span><span className="manager-pill">{item.manager}</span><span>{item.scope}</span><span title={item.installPath}>{item.installPath}</span></div>)}{!visible.length && <div style={{ padding: 14, opacity: .7 }}>No packages match.</div>}</div>}
  </section></div>;
}
