import { useState } from 'react';
import { Container, HardDrive, Network, Search } from 'lucide-react';
import type { AppManifest, ComputerSnapshot } from '@seed/protocol';
import { api } from '../api';

export function ContainerApp({ computer, manifest }: { computer: ComputerSnapshot; manifest: AppManifest }) {
  const [running, setRunning] = useState(true);
  const [postgresRunning, setPostgresRunning] = useState(false);
  const [extraContainers, setExtraContainers] = useState<string[]>([]);
  const [view, setView] = useState(0);
  const [query, setQuery] = useState('');
  const views = ['Containers', 'Images', 'Volumes', 'Builds', 'Extensions'];
  const toggle = async () => { const next = !running; const result = await api.executeApp(computer.spec.id, manifest.id, next ? 'start' : 'stop', { container: 'factory-control-plane' }); if (result.status === 'completed') setRunning(next); };
  const togglePostgres = async () => { const next = !postgresRunning; const result = await api.executeApp(computer.spec.id, manifest.id, next ? 'start' : 'stop', { container: 'postgres' }); if (result.status === 'completed') setPostgresRunning(next); };
  const runContainer = async () => { const name = `seed-task-${extraContainers.length + 1}`; const result = await api.executeApp(computer.spec.id, manifest.id, 'start', { container: name, image: 'seed/task-runner:2026.07' }); if (result.status === 'completed') setExtraContainers((items) => [...items, name]); };
  const match = (name: string) => name.toLowerCase().includes(query.toLowerCase());
  const images = [['seed/intranet', '2026.07', '92 MB'], ['postgres', '17-alpine', '241 MB'], ['seed/task-runner', '2026.07', '58 MB']] as const;
  const volumes = [['seed-db', 'local', '48 MB'], ['seed-cache', 'local', '12 MB']] as const;
  return <div className="container-app"><aside><div><Container/>Docker Desktop</div>{views.map((item, index) => <button className={index === view ? 'active' : ''} key={item} onClick={() => setView(index)}>{item}</button>)}</aside><section><header><div><h1>{views[view]}</h1><p>{computer.spec.hostname} · seed container engine</p></div><span className="engine"><i/>Engine running</span></header><div className="container-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${views[view]!.toLowerCase()}`}/>{view === 0 && <button onClick={() => void runContainer()}>Run a container</button>}</div>
    {view === 0 ? <>{match('factory-control-plane') && <article className="container-row"><button onClick={() => void toggle()}>{running ? '■' : '▶'}</button><div><b>factory-control-plane</b><span>seed/intranet:2026.07</span></div><code>8080:8080</code><span className={running ? 'running' : ''}>{running ? 'running' : 'stopped'}</span><small>{running ? '2.4 MB / 128 MB' : '0 MB'}</small></article>}{match('postgres') && <article className="container-row"><button onClick={() => void togglePostgres()}>{postgresRunning ? '■' : '▶'}</button><div><b>postgres</b><span>postgres:17-alpine</span></div><code>5432:5432</code><span className={postgresRunning ? 'running' : ''}>{postgresRunning ? 'running' : 'stopped'}</span><small>{postgresRunning ? '3.1 MB / 128 MB' : 'volume: seed-db'}</small></article>}{extraContainers.filter(match).map((name) => <article className="container-row" key={name}><button onClick={() => void api.executeApp(computer.spec.id, manifest.id, 'stop', { container: name }).then((result) => { if (result.status === 'completed') setExtraContainers((items) => items.filter((item) => item !== name)); })}>■</button><div><b>{name}</b><span>seed/task-runner:2026.07</span></div><code>—</code><span className="running">running</span><small>1.2 MB / 64 MB</small></article>)}</>
      : view === 1 ? images.filter(([name]) => match(name)).map(([name, tag, size]) => <article className="container-row" key={name}><button disabled>▤</button><div><b>{name}</b><span>{name}:{tag}</span></div><code>{tag}</code><span>local</span><small>{size}</small></article>)
      : view === 2 ? volumes.filter(([name]) => match(name)).map(([name, driver, size]) => <article className="container-row" key={name}><button disabled><HardDrive size={14}/></button><div><b>{name}</b><span>driver: {driver}</span></div><code>—</code><span>in use</span><small>{size}</small></article>)
      : <div style={{ padding: 24, opacity: .7 }}>No {views[view]!.toLowerCase()} recorded on this engine.</div>}
    <footer><span><Network/> seed-net · 10.42.0.0/24</span><span><HardDrive/> {volumes.length} volumes</span></footer></section></div>;
}
