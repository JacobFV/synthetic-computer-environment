import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe2, LockKeyhole, Monitor, Plus, RefreshCw, Search, Store, X } from 'lucide-react';
import type { AppManifest, BrowserNavigationResponse, ComputerSnapshot } from '@seed/protocol';
import { api } from '../api';
import { AppIcon } from '../shared';

type BrowserTab = { id: number; title: string; address: string; response?: BrowserNavigationResponse; loading: boolean; history: string[]; cursor: number };
const hostOf = (url: string) => { try { return new URL(url.includes('://') ? url : `http://${url}`).hostname; } catch { return url; } };
const toUrl = (value: string) => { const s = value.trim(); if (!s) return ''; if (/^(https?:)?\/\//.test(s)) return s.startsWith('http') ? s : `https:${s}`; if (s.includes('.') || s.includes(':') || s.endsWith('.local')) return `http://${s}`; return `https://duckduckgo.com/html/?q=${encodeURIComponent(s)}`; };

export function BrowserApp({ manifest, computer, demo }: { manifest: AppManifest; computer: ComputerSnapshot; demo: string }) {
  const seq = useRef(2);
  const makeTab = (address: string): BrowserTab => ({ id: seq.current++, title: address ? hostOf(address) : 'New Tab', address, loading: false, history: [], cursor: -1 });
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [{ id: 1, title: 'Seed Intranet', address: 'http://intranet.seed.local:8080/', loading: false, history: [], cursor: -1 }]);
  const [activeId, setActiveId] = useState(1);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]!;
  const update = (id: number, patch: Partial<BrowserTab> | ((tab: BrowserTab) => Partial<BrowserTab>)) => setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, ...(typeof patch === 'function' ? patch(tab) : patch) } : tab));
  const load = async (id: number, target: string) => {
    update(id, { loading: true, address: target });
    try { const response = await api.browserNavigate(computer.spec.id, target); update(id, { response, loading: false, title: hostOf(target) }); }
    catch { update(id, { loading: false, title: 'Failed to load' }); }
  };
  const navigate = (raw: string, id = active.id) => { const target = toUrl(raw); if (!target) return; update(id, (tab) => ({ history: [...tab.history.slice(0, tab.cursor + 1), target], cursor: tab.cursor + 1 })); void load(id, target); };
  const back = () => { if (active.cursor <= 0) return; const next = active.cursor - 1; update(active.id, { cursor: next }); void load(active.id, active.history[next]!); };
  const forward = () => { if (active.cursor >= active.history.length - 1) return; const next = active.cursor + 1; update(active.id, { cursor: next }); void load(active.id, active.history[next]!); };
  const newTab = () => { const tab = makeTab(''); setTabs((current) => [...current, tab]); setActiveId(tab.id); };
  const closeTab = (id: number) => setTabs((current) => {
    const index = current.findIndex((tab) => tab.id === id);
    const rest = current.filter((tab) => tab.id !== id);
    if (!rest.length) { const tab = makeTab(''); setActiveId(tab.id); return [tab]; }
    if (id === activeId) setActiveId((rest[index - 1] ?? rest[0]!).id);
    return rest;
  });
  useEffect(() => { if (demo) navigate('http://intranet.seed.local:8080/'); }, []);
  const addressRef = useRef<HTMLInputElement>(null);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'l') { event.preventDefault(); addressRef.current?.focus(); addressRef.current?.select(); return; }
    if (mod && event.key.toLowerCase() === 'r') { event.preventDefault(); if (active.history[active.cursor]) void load(active.id, active.history[active.cursor]!); return; }
    if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); back(); return; }
    if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); forward(); return; }
  };
  const quicklinks: Array<[string, React.ReactNode, string]> = [['Intranet', <Monitor key="i" />, 'http://intranet.seed.local:8080/'], ['App Store', <Store key="s" />, 'http://appstore.seed.local/'], ['Wikipedia', <Globe2 key="w" />, 'https://en.wikipedia.org/wiki/Operating_system'], ['Search', <Search key="q" />, 'https://duckduckgo.com/html/']];
  return <div className={`browser-app browser-${manifest.id}`} tabIndex={0} style={{ outline: 'none' }} onKeyDown={onKeyDown}>
    <div className="browser-tabs">
      <div className="browser-tabstrip">{tabs.map((tab) => <button key={tab.id} className={`browser-tab ${tab.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(tab.id)} title={tab.address || tab.title}>{tab.loading ? <span className="tab-spin" /> : <AppIcon app={manifest} size={14} />}<span className="browser-tab-title">{tab.title}</span><span className="browser-tab-close" role="button" aria-label="Close tab" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}><X size={12} /></span></button>)}</div>
      <button className="browser-newtab-btn" aria-label="New tab" onClick={newTab}><Plus size={15} /></button>
    </div>
    <form className="addressbar" onSubmit={(event) => { event.preventDefault(); navigate(active.address); }}>
      <button type="button" aria-label="Back" disabled={active.cursor <= 0} onClick={back}><ChevronLeft size={16} /></button>
      <button type="button" aria-label="Forward" disabled={active.cursor >= active.history.length - 1} onClick={forward}><ChevronRight size={16} /></button>
      <button type="button" aria-label="Reload" onClick={() => active.history[active.cursor] && void load(active.id, active.history[active.cursor]!)}><RefreshCw size={15} /></button>
      <label><LockKeyhole size={13} /><input ref={addressRef} aria-label="Address" value={active.address} onChange={(event) => update(active.id, { address: event.target.value })} placeholder="Search or type a URL" /></label>
      <button type="button" title={`${manifest.name} menu`}>•••</button>
    </form>
    <div className="browser-body">{active.loading ? <div className="browser-loading">routing packets…</div> : active.response ? <iframe key={active.response.documentUrl} sandbox="allow-scripts allow-forms allow-popups" src={active.response.documentUrl} title="internet page" referrerPolicy="no-referrer" /> : <div className="browser-newtab"><AppIcon app={manifest} size={68} /><h1>{manifest.id === 'safari' ? 'Favorites' : manifest.id === 'firefox' ? 'Welcome to Firefox' : manifest.id === 'edge' ? 'New tab' : 'Chromium'}</h1><label><Search /><input value={active.address} onChange={(event) => update(active.id, { address: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') navigate(active.address); }} placeholder={manifest.id === 'firefox' ? 'Search with Seed Search or enter address' : 'Search the internet or type a URL'} /></label><div>{quicklinks.map(([label, icon, url]) => <button key={label} onClick={() => navigate(url)}>{icon}{label}</button>)}</div></div>}</div>
    {active.response && <div className="browser-status">{hostOf(active.address).endsWith('.local') || hostOf(active.address).startsWith('10.42.') ? 'virtual' : 'internet'} http {active.response.status} · {active.response.headers['content-type'] ?? 'application/octet-stream'} · trace {active.response.traceId.slice(0, 8)} · source {computer.spec.ipv4}</div>}
  </div>;
}
