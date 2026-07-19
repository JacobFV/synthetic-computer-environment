import { useState } from 'react';
import { Copy, Lock, MoreHorizontal, Plus, Search, ShieldCheck, Unlock } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function VaultSurface({ manifest, computer }: SurfaceProps) {
  const [locked, setLocked] = useState(true);
  const [copied, setCopied] = useState('');
  if (locked) return <div className={`vault-app vault-locked surface-${manifest.id}`}><Brand manifest={manifest}/><Lock/><h1>{manifest.name} is locked</h1><p>Unlock to inspect simulated credentials. Secrets never cross the host boundary.</p><input type="password" defaultValue="seed-research" aria-label="Master password"/><button onClick={() => void runOperation(manifest, computer, 'unlock', { method: 'password' }).then((ok) => ok && setLocked(false))}><Unlock/> Unlock</button><small>Virtual biometric sensor available</small></div>;
  const items: Array<[string, string, number]> = [['App Store Registry','registry@appstore.seed.local', 1],['Git Service','agent@git.seed.local', 0],['SeedNet Router','admin@10.42.0.1', 3],['Factory Database','agent@seed-db', 2]];
  const [nav, setNav] = useState(0);
  const [query, setQuery] = useState('');
  const tabs = ['All items', 'Favorites', 'Secure notes', 'Shared'];
  const favorites = ['App Store Registry', 'Git Service'];
  const filtered = items.filter(([name,, category]) => (nav === 0 ? true : nav === 1 ? favorites.includes(name) : nav === 2 ? category === 2 : category === 3) && name.toLowerCase().includes(query.toLowerCase()));
  const lockVault = async () => { if (await runOperation(manifest, computer, 'lock')) setLocked(true); };
  const [newItems, setNewItems] = useState<Array<[string, string, number]>>([]);
  const addItem = async () => { const name = `New Login ${newItems.length + 1}`; if (await runOperation(manifest, computer, 'create-item', { name, type: 'login' })) setNewItems((list) => [...list, [name, 'agent@seed.local', 0]]); };
  const copyField = async (name: string, username: string) => { if (await runOperation(manifest, computer, 'copy-field', { item: name, field: 'username', value: username })) { setCopied(name); setTimeout(() => setCopied(''), 900); } };
  const shown = nav === 0 ? [...filtered, ...newItems.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))] : filtered;
  return <div className={`vault-app vault-open surface-${manifest.id}`}><aside><Brand manifest={manifest}/><button className="primary" onClick={() => void addItem()}><Plus/> New item</button>{tabs.map((tab, index) => <button key={tab} className={nav === index ? 'active' : ''} onClick={() => setNav(index)}>{tab}</button>)}<button onClick={() => void lockVault()}><Lock/> Lock</button></aside><section><header><h1>{tabs[nav]}</h1><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vault"/></label></header><div className="vault-list">{shown.length === 0 ? <p style={{ padding: 16, opacity: 0.6 }}>No items.</p> : shown.map(([name, username]) => <article key={name}><span>{name[0]}</span><div><b>{name}</b><small>{username}</small></div><button onClick={() => void copyField(name, username)}><Copy/>{copied === name ? 'Copied' : 'Copy'}</button><button><MoreHorizontal/></button></article>)}</div><footer><ShieldCheck/> Protected by the simulated secure-storage boundary</footer></section></div>;
}
