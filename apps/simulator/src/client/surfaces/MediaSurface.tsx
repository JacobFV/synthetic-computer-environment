import { useEffect, useState } from 'react';
import { Disc3, Film, Mic2, Pause, Play, Search, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function MediaSurface({ manifest, computer }: SurfaceProps) {
  const [playing, setPlaying] = useState(manifest.id === 'spotify');
  const [track, setTrack] = useState(0);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(manifest.id === 'vlc' ? 82 : 70);
  const [nav, setNav] = useState(0);
  const tracks = ['Computer Love', 'Digital Witness', 'Everything in Its Right Place', 'Technologic'];
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setProgress((value) => value >= 100 ? 0 : value + 1), 400);
    return () => clearInterval(timer);
  }, [playing]);
  if (manifest.id === 'audacity') return <AudacitySurface manifest={manifest} computer={computer}/>;
  const togglePlaying = async () => { const next = !playing; if (await runOperation(manifest, computer, next ? 'play' : 'pause', { track: tracks[track] })) setPlaying(next); };
  const selectTrack = async (index: number) => { if (await runOperation(manifest, computer, 'open', { track: tracks[index] })) { setTrack(index); setPlaying(true); setProgress(0); } };
  const seek = async (percent: number) => { setProgress(percent); await runOperation(manifest, computer, 'seek', { percent }); };
  const clock = (percent: number, total: number) => { const secs = Math.round(percent / 100 * total); return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`; };
  if (manifest.id === 'vlc') return <div className="vlc-app surface-vlc"><header><span>Media  Playback  Audio  Video  Subtitle  Tools  View  Help</span></header><main><Film/><b>factory-walkthrough.mp4</b><small>00:{clock(progress, 102)} / 00:01:42</small></main><footer><button onClick={() => void togglePlaying()}>{playing ? <Pause/> : <Play/>}</button><input type="range" value={progress} onChange={(event) => void seek(Number(event.target.value))}/><span><Volume2/> <input type="range" value={volume} style={{ width: 70 }} onChange={(event) => { setVolume(Number(event.target.value)); void runOperation(manifest, computer, 'set-volume', { volume: Number(event.target.value) }); }}/> {volume}%</span></footer></div>;
  const navItems = ['Home', 'Recently played', 'Albums', 'Artists'];
  return <div className={`media-app surface-${manifest.id}`}><aside><Brand manifest={manifest}/>{navItems.map((item, index) => <button key={item} className={nav === index ? 'active' : ''} onClick={() => setNav(index)}>{item}</button>)}<h5>PLAYLISTS</h5><button onClick={() => setNav(4)} className={nav === 4 ? 'active' : ''}>Evidence capture</button><button onClick={() => setNav(5)} className={nav === 5 ? 'active' : ''}>Focus work</button></aside><section><header><div><h1>{manifest.id === 'spotify' ? 'Good evening' : navItems[nav] ?? 'Playlist'}</h1><p>{manifest.id === 'rhythmbox' ? 'Local library · 4 songs' : 'Seed Research Radio'}</p></div><button><Search/></button><button>agent⌄</button></header><div className="album-feature"><Disc3/><div><small>PLAYLIST</small><h2>Systems music</h2><p>Four tracks · 18 min</p></div><button onClick={() => void togglePlaying()}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button></div><div className="track-list">{tracks.map((name, index) => <button className={track === index ? 'active' : ''} onClick={() => void selectTrack(index)} key={name}><span>{track === index && playing ? '▶' : index + 1}</span><div><b>{name}</b><small>{['Kraftwerk','St. Vincent','Radiohead','Daft Punk'][index]}</small></div><time>{['5:21','3:24','4:11','4:44'][index]}</time></button>)}</div></section><footer><div><Disc3/><span><b>{tracks[track]}</b><small>{['Kraftwerk','St. Vincent','Radiohead','Daft Punk'][track]}</small></span></div><div><button onClick={() => void selectTrack((track + tracks.length - 1) % tracks.length)}><SkipBack/></button><button onClick={() => void togglePlaying()}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button><button onClick={() => void selectTrack((track + 1) % tracks.length)}><SkipForward/></button><input type="range" value={progress} onChange={(event) => void seek(Number(event.target.value))}/></div><span><Volume2/><input type="range" value={volume} onChange={(event) => { setVolume(Number(event.target.value)); void runOperation(manifest, computer, 'set-volume', { volume: Number(event.target.value) }); }}/></span></footer></div>;
}

export function AudacitySurface({ manifest, computer }: SurfaceProps) {
  const trackNames = ['Narration', 'System audio'];
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState<boolean[]>([false, false]);
  const [solo, setSolo] = useState<boolean[]>([false, false]);
  const [gain, setGain] = useState(64);
  const toggleRecord = async () => { const next = !recording; if (await runOperation(manifest, computer, next ? 'record' : 'stop-recording', { track: 'Narration', sampleRate: 48000 })) { setRecording(next); if (next) setPlaying(false); } };
  const play = async () => { if (await runOperation(manifest, computer, 'play', { project: 'evidence-audio' })) { setPlaying(true); setRecording(false); } };
  const stop = async () => { await runOperation(manifest, computer, 'pause', { project: 'evidence-audio' }); setPlaying(false); setRecording(false); };
  const toggleMute = async (row: number) => { const next = !muted[row]; await runOperation(manifest, computer, 'track', { track: trackNames[row], muted: next }); setMuted((flags) => flags.map((flag, index) => index === row ? next : flag)); };
  const toggleSolo = async (row: number) => { const next = !solo[row]; await runOperation(manifest, computer, 'track', { track: trackNames[row], solo: next }); setSolo((flags) => flags.map((flag, index) => index === row ? next : flag)); };
  return <div className="audacity-app surface-audacity"><header><Brand manifest={manifest}/><span>File  Edit  Select  View  Transport  Tracks  Generate  Effect  Analyze</span></header><div className="transport"><button>⏮</button><button className={playing ? 'recording' : ''} onClick={() => void play()}><Play/></button><button onClick={() => void stop()}>■</button><button className={recording ? 'recording' : ''} onClick={() => void toggleRecord()}>●</button><label><Mic2/><input type="range" value={gain} onChange={(event) => { setGain(Number(event.target.value)); void runOperation(manifest, computer, 'set-gain', { gain: Number(event.target.value) }); }}/></label></div><div className="timeline"><header>{Array.from({ length: 12 }, (_, index) => <span key={index}>{index * 5}s</span>)}</header>{trackNames.map((track, row) => <article key={track} style={muted[row] ? { opacity: 0.4 } : solo[row] ? { outline: '1px solid #f59e0b' } : undefined}><aside><b>{track}</b><button className={muted[row] ? 'active' : ''} onClick={() => void toggleMute(row)}>Mute</button><button className={solo[row] ? 'active' : ''} onClick={() => void toggleSolo(row)}>Solo</button></aside><div className={`waveform wave-${row}`}>{Array.from({ length: 80 }, (_, index) => <i key={index} style={{ height: `${10 + (index * (row + 3) * 17) % 52}%` }}/>)}</div></article>)}</div><footer>Project Rate 48000 Hz <span>{recording ? 'Recording… 00:00:07' : playing ? 'Playing…' : 'Stopped'}</span></footer></div>;
}
