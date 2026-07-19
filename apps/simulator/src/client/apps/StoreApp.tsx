import { useRef, useState } from 'react';
import { AppWindow as AppWindowIcon, Download, ExternalLink, Search, Store, Trash2 } from 'lucide-react';
import type { ComputerSnapshot, SimulationSnapshot } from '@seed/protocol';
import { api } from '../api';
import { AppIcon, useContextMenu } from '../shared';

export function StoreApp({ computer, snapshot, setSnapshot, openApp }: { computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void; openApp(id: string): void }) {
  const menu = useContextMenu();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(0);
  const [pending, setPending] = useState<string>();
  const sections = computer.spec.os === 'macos' ? ['Discover', 'Arcade', 'Create', 'Work', 'Updates'] : computer.spec.os === 'windows' ? ['Home', 'Apps', 'Gaming', 'Library', 'Downloads'] : ['Explore', 'Installed', 'Updates'];
  const candidates = snapshot.appCatalog.filter((item) => !item.system && item.supportedOS.includes(computer.spec.os) && item.name.toLowerCase().includes(query.toLowerCase()));
  const install = async (id: string) => { setPending(id); try { await api.install(computer.spec.id, id); setSnapshot(await api.state()); } finally { setPending(undefined); } };
  const uninstall = async (id: string) => { setPending(id); try { await api.uninstall(computer.spec.id, id); setSnapshot(await api.state()); } finally { setPending(undefined); } };
  const storeName = computer.spec.os === 'macos' ? 'App Store' : computer.spec.os === 'windows' ? 'Microsoft Store' : 'App Center';
  const searchRef = useRef<HTMLInputElement>(null);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus(); } };
  const cards = candidates.map((app) => {
    const installed = computer.installedApps.some((item) => item.id === app.id);
    const cardMenu = (event: React.MouseEvent) => menu(event, [
      installed
        ? { label: `Open ${app.name}`, icon: <ExternalLink />, onClick: () => openApp(app.id) }
        : { label: `Get ${app.name}`, icon: <Download />, onClick: () => void install(app.id) },
      { separator: true },
      installed && { label: 'Uninstall', icon: <Trash2 />, danger: true, onClick: () => void uninstall(app.id) },
    ]);
    return <article key={app.id} onContextMenu={cardMenu}><AppIcon app={app} size={54}/><div><b>{app.name}</b><span>{app.description}</span><small>{app.publisher} · {app.version}</small></div><button disabled={pending === app.id} onClick={() => installed ? openApp(app.id) : void install(app.id)}>{pending === app.id ? '…' : computer.spec.os === 'windows' ? (installed ? 'Open' : 'Get') : (installed ? 'OPEN' : 'GET')}</button></article>;
  });
  if (computer.spec.os === 'windows') return <div className="store-app store-windows" tabIndex={0} style={{ outline: 'none' }} onKeyDown={onKeyDown}><aside className="store-win-rail"><AppIcon app={snapshot.appCatalog.find((item) => item.id === 'store')!} size={30}/>{sections.map((item, index) => <button onClick={() => setSection(index)} className={section === index ? 'active' : ''} key={item}>{index === 0 ? <Store/> : item === 'Downloads' ? <Download/> : <AppWindowIcon/>}<span>{item}</span></button>)}</aside><section><header className="store-win-header"><h2>Microsoft Store</h2><label><Search size={15}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps, games, movies and more"/></label><button className="store-avatar">A</button></header><div className="store-win-hero"><small>APPS · EDITOR'S CHOICE</small><h1>{section === sections.length - 1 ? 'Your library is ready.' : 'Build the workspace you need.'}</h1><p>trusted packages from store.seed.local</p><button>See collection</button></div><h3>{query ? 'Search results' : section === 0 ? 'Top free apps' : sections[section]}</h3><div className="store-win-grid">{cards}</div></section></div>;
  if (computer.spec.os === 'ubuntu') return <div className="store-app store-ubuntu" tabIndex={0} style={{ outline: 'none' }} onKeyDown={onKeyDown}><section><header className="store-ubuntu-header"><nav>{sections.map((item, index) => <button onClick={() => setSection(index)} className={section === index ? 'active' : ''} key={item}>{item}</button>)}</nav><label><Search size={15}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search App Center"/></label></header><div className="store-ubuntu-hero"><div><small>EDITOR'S PICKS</small><h1>{section === sections.length - 1 ? 'Software is up to date.' : 'Apps for work and creativity.'}</h1><p>verified packages from packages.seed.local</p></div><AppWindowIcon size={70}/></div><h3>{query ? 'Search results' : section === 0 ? 'Featured applications' : sections[section]}</h3><div className="store-ubuntu-grid">{cards}</div></section></div>;
  return <div className="store-app store-macos" tabIndex={0} style={{ outline: 'none' }} onKeyDown={onKeyDown}><aside><h2>{storeName}</h2><label><Search size={15}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${storeName}`}/></label>{sections.map((item, index) => <button onClick={() => setSection(index)} className={section === index ? 'active' : ''} key={item}>{index === 0 ? <Store/> : item === 'Updates' ? <Download/> : <AppWindowIcon/>}{item}</button>)}</aside><section><div className="store-hero"><small>ESSENTIALS</small><h1>{section === sections.length - 1 ? 'Your software is up to date.' : 'Tools for a complete virtual workspace.'}</h1><p>signed packages from appstore.seed.local</p></div><h3>{query ? 'Search results' : section === 0 ? 'Apps we love' : sections[section]}</h3><div className="store-list">{cards}</div></section></div>;
}
