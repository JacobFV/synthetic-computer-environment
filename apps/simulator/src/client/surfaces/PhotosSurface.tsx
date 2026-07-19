import { useState } from 'react';
import { Grid3X3, Image, SlidersHorizontal } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function PhotosSurface({ manifest, computer }: SurfaceProps) {
  const images = ['Golden Gate field test', 'Mac studio evidence', 'Ubuntu packet capture', 'Windows app survey', 'Factory control rack', 'Trajectory playback'];
  const places = ['Golden Gate field test', 'Factory control rack'];
  const people = ['Mac studio evidence', 'Windows app survey'];
  const [selected, setSelected] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [nav, setNav] = useState(0);
  const [compact, setCompact] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const tabs = ['Library', 'Memories', 'People & Pets', 'Places', 'Favorites'];
  const filtered = images.filter((name) => nav === 0 ? true : nav === 1 ? images.indexOf(name) % 2 === 0 : nav === 2 ? people.includes(name) : nav === 3 ? places.includes(name) : favorites.includes(name));
  const ordered = sortNewest ? filtered : [...filtered].reverse();
  const selectNav = async (index: number) => { await runOperation(manifest, computer, 'browse', { collection: tabs[index] }); setNav(index); setSelected(0); };
  const selectAsset = async (index: number) => { if (await runOperation(manifest, computer, 'browse', { asset: ordered[index] })) setSelected(index); };
  const current = ordered[selected] ?? ordered[0];
  const toggleFavorite = async () => { const asset = current; if (!asset) return; if (await runOperation(manifest, computer, 'favorite', { asset, favorite: !favorites.includes(asset) })) setFavorites((items) => items.includes(asset) ? items.filter((item) => item !== asset) : [...items, asset]); };
  return <div className="photos-app surface-photos"><aside><Brand manifest={manifest}/>{tabs.map((item, index) => <button className={index === nav ? 'active' : ''} key={item} onClick={() => void selectNav(index)}>{item}</button>)}</aside><section><header><div><h1>{tabs[nav]}</h1><p>July 2026 · {ordered.length} {ordered.length === 1 ? 'capture' : 'captures'}</p></div><button className={compact ? 'active' : ''} title="Toggle grid density" onClick={() => setCompact((value) => !value)}><Grid3X3/></button><button className={sortNewest ? '' : 'active'} title="Toggle sort order" onClick={() => setSortNewest((value) => !value)}><SlidersHorizontal/></button></header><div className="photo-grid" style={compact ? { gridTemplateColumns: 'repeat(4, 1fr)' } : undefined}>{ordered.length === 0 ? <p style={{ opacity: 0.6, padding: '24px' }}>No photos in this collection.</p> : ordered.map((name, index) => <button key={name} className={selected === index ? 'selected' : ''} onClick={() => void selectAsset(index)}><span className={`photo-swatch photo-${images.indexOf(name) + 1}`}><Image/>{favorites.includes(name) && <b style={{ position: 'absolute', right: 6, top: 6 }}>♥</b>}</span><b>{name}</b><small>{((8 + images.indexOf(name)) % 12) + 1}:{String((images.indexOf(name) * 11 + 4) % 60).padStart(2, '0')} {(9 + images.indexOf(name)) < 12 ? 'AM' : 'PM'}</small></button>)}</div><footer><b>{current ?? '—'}</b><span>2560 × 1600 · Display P3</span><button onClick={() => void toggleFavorite()} disabled={!current}>{current && favorites.includes(current) ? '♥' : '♡'}</button><button>•••</button></footer></section></div>;
}
