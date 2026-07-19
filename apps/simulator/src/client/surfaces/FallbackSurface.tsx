import { useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '../api';
import { Rail, type SurfaceProps } from './shared';

export function FallbackSurface({ manifest, computer }: SurfaceProps) {
  const tabs = ['Overview', 'Files', 'Activity', 'Settings'];
  const [tab, setTab] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notify, setNotify] = useState(true);
  const dir = computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
  const loadFiles = async () => { setLoading(true); try { const out = await api.shell(computer.spec.id, `ls ${dir}`); setFiles(out.stdout.split(/\s+/).filter(Boolean)); } catch { setFiles([]); } setLoading(false); };
  const selectTab = (index: number) => { setTab(index); if (index === 1 && files.length === 0) void loadFiles(); };
  return <div className={`role-app specialized-app surface-${manifest.id}`}><Rail manifest={manifest} items={tabs} active={tab} onSelect={selectTab}/><section><header><div><h1>{manifest.name} · {tabs[tab]}</h1><p>{manifest.publisher} · {manifest.version}</p></div></header>{tab === 0 && <div className="role-grid"><article><span>01</span><div><b>{manifest.description}</b><small>running on {computer.spec.hostname}</small></div></article><article><span>02</span><div><b>{manifest.packagePath}</b><small>installed package</small></div></article></div>}{tab === 1 && <div className="role-grid">{loading ? <article><span>…</span><div><b>Listing {dir}</b></div></article> : files.length === 0 ? <article><span>00</span><div><b>No files listed</b><small>{dir}</small></div></article> : files.map((file, index) => <article key={file}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{file}</b><small>{dir}/{file}</small></div></article>)}</div>}{tab === 2 && <div className="role-grid"><article><span>01</span><div><b>Manifest loaded</b><small>just now</small></div></article><article><span>02</span><div><b>{computer.processes?.length ?? 0} processes on {computer.spec.hostname}</b><small>from computer snapshot</small></div></article></div>}{tab === 3 && <div className="role-grid"><article><span>⚙</span><div><b>Notifications</b><small><label><input type="checkbox" checked={notify} onChange={() => setNotify((value) => !value)}/> {notify ? 'Enabled' : 'Disabled'}</label></small></div></article></div>}<footer><Check/> Application manifest loaded</footer></section></div>;
}
