import { useState } from 'react';
import { Search } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function LibrarySurface({ manifest, computer }: SurfaceProps) {
  const games: Array<[string, string]> = [['Simulation Lab','RUNNING'],['Factorio','READY'],['Kerbal Space Program','READY'],['Portal 2','CLOUD']];
  const [selected, setSelected] = useState(0);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState(1);
  const [query, setQuery] = useState('');
  const selectedGame = games[selected]!;
  const shown = games.map(([game, status], index) => ({ game, status, index })).filter(({ game }) => game.toLowerCase().includes(query.toLowerCase()));
  const selectGame = async (index: number) => { if (await runOperation(manifest, computer, 'browse', { title: games[index]![0] })) { setSelected(index); setRunning(false); } };
  const toggleGame = async () => { const next = !running; if (await runOperation(manifest, computer, next ? 'launch' : 'stop', { title: selectedGame[0] })) setRunning(next); };
  return <div className="library-app surface-steam"><header><Brand manifest={manifest}/>{['STORE','LIBRARY','COMMUNITY'].map((item, index) => index === tab ? <b key={item} onClick={() => setTab(index)} style={{ cursor: 'pointer' }}>{item}</b> : <span key={item} onClick={() => setTab(index)} style={{ cursor: 'pointer', opacity: 0.7 }}>{item}</span>)}<small>agent</small></header><aside><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library"/></label><h5>GAMES AND SOFTWARE</h5>{shown.map(({ game, status, index }) => <button className={selected === index ? 'active' : ''} onClick={() => void selectGame(index)} key={game}><span>{game[0]}</span><div><b>{game}</b><small>{status}</small></div></button>)}</aside><main><div className={`game-hero game-${selected}`}><span>{['STORE','SEED LAB','COMMUNITY'][tab]}</span><h1>{selectedGame[0]}</h1><p>{tab === 0 ? 'Store page · $0.00 · owned' : tab === 2 ? 'Community hub · 3 discussions' : 'Deterministic systems sandbox'}</p></div><div className="game-actions"><button className={running ? 'stop' : 'play'} onClick={() => void toggleGame()}>{tab === 0 ? 'INSTALL' : running ? 'STOP' : 'PLAY'}</button><span>Last played Today · {selected + 2}.4 hours</span></div><section><h2>{tab === 2 ? 'Community' : 'Activity'}</h2><article><b>Agent</b><p>{tab === 2 ? 'Posted a screenshot to the hub.' : 'Captured a replayable desktop trajectory.'}</p><small>12 minutes ago</small></article></section></main></div>;
}
