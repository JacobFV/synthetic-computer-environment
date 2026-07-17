import { useMemo, useState } from 'react';
import {
  Archive, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight, Circle, Clock3, Columns3,
  Copy, Crop, Database, Disc3, FileText, Film, Folder, Grid3X3, Image, Inbox, KeyRound, Layers3,
  ListTodo, Lock, Mail, MapPin, Mic2, MoreHorizontal, MousePointer2, Music2, Pause, PenTool, Play,
  Plus, Search, Send, ShieldCheck, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Square,
  Table2, Unlock, Users, Video, Volume2, WandSparkles, ZoomIn, ZoomOut,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import appIconData from 'virtual:app-icons';
import type { AppManifest, ComputerSnapshot } from '@seed/protocol';

type SurfaceProps = { manifest: AppManifest; computer: ComputerSnapshot };

function Brand({ manifest }: { manifest: AppManifest }) {
  const source = appIconData[manifest.icon];
  return <div className="surface-brand">{source ? <Icon icon={source} width={28} height={28}/> : <span>{manifest.name[0]}</span>}<b>{manifest.name}</b></div>;
}

function Rail({ manifest, items, active = 0, onSelect }: { manifest: AppManifest; items: string[]; active?: number; onSelect?(index: number): void }) {
  return <aside><Brand manifest={manifest}/>{items.map((item, index) => <button key={item} className={index === active ? 'active' : ''} onClick={() => onSelect?.(index)}>{item}</button>)}</aside>;
}

export function AppSpecificSurface({ manifest, computer }: SurfaceProps) {
  if (['textedit', 'notepad', 'gedit'].includes(manifest.id)) return <EditorSurface manifest={manifest} computer={computer}/>;
  if (['preview', 'document-viewer'].includes(manifest.id)) return <PreviewSurface manifest={manifest} computer={computer}/>;
  if (manifest.id === 'photos') return <PhotosSurface manifest={manifest} computer={computer}/>;
  if (manifest.id === 'calculator') return <CalculatorSurface manifest={manifest} computer={computer}/>;
  if (manifest.id === 'calendar') return <CalendarSurface manifest={manifest} computer={computer}/>;
  if (['mail', 'outlook'].includes(manifest.id)) return <MailSurface manifest={manifest} computer={computer}/>;
  if (['messages', 'discord'].includes(manifest.id)) return <MessagesSurface manifest={manifest} computer={computer}/>;
  if (['facetime', 'zoom'].includes(manifest.id)) return <CallsSurface manifest={manifest} computer={computer}/>;
  if (['music', 'rhythmbox', 'spotify', 'vlc', 'audacity'].includes(manifest.id)) return <MediaSurface manifest={manifest} computer={computer}/>;
  if (manifest.id === 'maps') return <MapsSurface manifest={manifest} computer={computer}/>;
  if (['reminders', 'linear'].includes(manifest.id)) return <TasksSurface manifest={manifest} computer={computer}/>;
  if (['paint', 'gimp', 'snipping-tool'].includes(manifest.id)) return <CanvasSurface manifest={manifest} computer={computer}/>;
  if (['notion', 'obsidian', 'libreoffice'].includes(manifest.id)) return <DocumentsSurface manifest={manifest} computer={computer}/>;
  if (manifest.id === 'steam') return <LibrarySurface manifest={manifest} computer={computer}/>;
  if (['bitwarden', 'onepassword'].includes(manifest.id)) return <VaultSurface manifest={manifest} computer={computer}/>;
  if (manifest.id === 'dbeaver') return <DatabaseSurface manifest={manifest} computer={computer}/>;
  if (manifest.id === 'blender') return <BlenderSurface manifest={manifest} computer={computer}/>;
  return <FallbackSurface manifest={manifest} computer={computer}/>;
}

function EditorSurface({ manifest, computer }: SurfaceProps) {
  const initial = manifest.id === 'notepad' ? 'Deployment notes\r\n\r\n- Verify Windows package receipts\r\n- Capture window-management trajectory\r\n- Check DNS resolution' : '# Seed ecosystem\n\nEvery visible state is produced by the same kernel state that shell commands inspect.\n\n## Acceptance\n- persistent files\n- causal network traces\n- replayable interaction events';
  const [body, setBody] = useState(initial);
  const [wrapped, setWrapped] = useState(true);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const mac = manifest.id === 'textedit';
  return <div className={`editor-app surface-${manifest.id}`}>
    <div className="editor-menubar"><span>{mac ? 'File  Edit  Format  View  Window  Help' : 'File  Edit  View'}</span><button onClick={() => setWrapped(!wrapped)}>{wrapped ? 'Wrap' : 'No wrap'}</button></div>
    {manifest.id === 'gedit' && <div className="editor-tabs"><button className="active">simulation-evidence.md</button><button><Plus/> New tab</button></div>}
    {mac && <div className="editor-format"><select defaultValue="body"><option value="body">Body</option><option>Title</option></select><button>B</button><button><i>I</i></button><button>≡</button><span>Helvetica · 13</span></div>}
    <textarea aria-label={`${manifest.name} document`} wrap={wrapped ? 'soft' : 'off'} value={body} onChange={(event) => setBody(event.target.value)} spellCheck/>
    <footer><span>{computer.spec.os === 'windows' ? 'Ln 1, Col 1' : 'Edited'}</span><span>{words} words · UTF-8</span><span>{computer.spec.hostname}</span></footer>
  </div>;
}

function PreviewSurface({ manifest, computer }: SurfaceProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(90);
  return <div className={`preview-app surface-${manifest.id}`}>
    <aside><Brand manifest={manifest}/><h5>THUMBNAILS</h5>{[1, 2, 3, 4].map((value) => <button className={page === value ? 'active' : ''} onClick={() => setPage(value)} key={value}><span className="page-thumb"><i/><i/><i/></span><small>{value}</small></button>)}</aside>
    <section><header><button onClick={() => setPage(Math.max(1, page - 1))}>‹</button><b>{page} / 4</b><button onClick={() => setPage(Math.min(4, page + 1))}>›</button><span/><button onClick={() => setZoom(Math.max(50, zoom - 10))}><ZoomOut/></button><b>{zoom}%</b><button onClick={() => setZoom(Math.min(160, zoom + 10))}><ZoomIn/></button></header>
      <div className="document-stage"><article style={{ transform: `scale(${zoom / 100})` }}><small>SEED RESEARCH NOTE · PAGE {page}</small><h1>{page === 1 ? 'Causal fidelity in a browser-native computer' : page === 2 ? 'State and persistence model' : page === 3 ? 'Network service boundaries' : 'Reproducibility checklist'}</h1><p>The desktop, shell, process table, VFS and network trace are projections of one simulation state—not independent mockups.</p><div className="document-diagram"><i/><ChevronRight/><i/><ChevronRight/><i/></div><p className="document-meta">Opened from {computer.spec.os === 'windows' ? 'C:\\Users\\agent\\Documents' : '/home/agent/Documents'}</p></article></div>
    </section>
  </div>;
}

function PhotosSurface({ manifest }: SurfaceProps) {
  const images = ['Golden Gate field test', 'Mac studio evidence', 'Ubuntu packet capture', 'Windows app survey', 'Factory control rack', 'Trajectory playback'];
  const [selected, setSelected] = useState(0);
  return <div className="photos-app surface-photos"><aside><Brand manifest={manifest}/>{['Library', 'Memories', 'People & Pets', 'Places', 'Favorites'].map((item, index) => <button className={index === 0 ? 'active' : ''} key={item}>{item}</button>)}</aside><section><header><div><h1>Library</h1><p>July 2026 · 48 evidence captures</p></div><button><Grid3X3/></button><button><SlidersHorizontal/></button></header><div className="photo-grid">{images.map((name, index) => <button key={name} className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)}><span className={`photo-swatch photo-${index + 1}`}><Image/></span><b>{name}</b><small>{index + 9}:2{index} PM</small></button>)}</div><footer><b>{images[selected]}</b><span>2560 × 1600 · Display P3</span><button>♡</button><button>•••</button></footer></section></div>;
}

function CalculatorSurface({ manifest }: SurfaceProps) {
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<number>();
  const [operator, setOperator] = useState<string>();
  const digit = (value: string) => setDisplay((current) => current === '0' ? value : `${current}${value}`);
  const operate = (next: string) => { setStored(Number(display)); setOperator(next); setDisplay('0'); };
  const equals = () => { if (stored === undefined || !operator) return; const right = Number(display); const result = operator === '+' ? stored + right : operator === '−' ? stored - right : operator === '×' ? stored * right : right === 0 ? 0 : stored / right; setDisplay(String(result)); setStored(undefined); setOperator(undefined); };
  return <div className="calculator-app surface-calculator"><header><Brand manifest={manifest}/><button>Scientific⌄</button><button>☰</button></header><output>{display}</output><div className="calculator-history"><small>{stored === undefined ? 'History' : `${stored} ${operator}`}</small></div><div className="calculator-keys">{['C','±','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','0','.','='].map((key) => <button className={['÷','×','−','+','='].includes(key) ? 'operator' : ''} key={key} onClick={() => key === 'C' ? setDisplay('0') : /^\d$/.test(key) ? digit(key) : key === '.' ? setDisplay((value) => value.includes('.') ? value : `${value}.`) : key === '=' ? equals() : ['÷','×','−','+'].includes(key) ? operate(key) : key === '±' ? setDisplay(String(-Number(display))) : key === '%' ? setDisplay(String(Number(display) / 100)) : undefined}>{key}</button>)}</div></div>;
}

function CalendarSurface({ manifest }: SurfaceProps) {
  const [day, setDay] = useState(16);
  const events: Record<number, string[]> = { 16: ['09:30  Simulator review', '13:00  Network fidelity study', '16:30  Evidence capture'], 17: ['10:00  App ecosystem audit', '15:00  Agent evaluation'], 18: ['11:30  Package manager test'] };
  return <div className="calendar-app surface-calendar"><aside><Brand manifest={manifest}/><button className="primary"><Plus/> New event</button><h5>CALENDARS</h5>{['Work', 'Research', 'Personal', 'Reminders'].map((item, index) => <label key={item}><input type="checkbox" defaultChecked/><i className={`calendar-color c${index}`}/>{item}</label>)}</aside><section><header><button>Today</button><button>‹</button><button>›</button><h1>July 2026</h1><div><button>Day</button><button className="active">Week</button><button>Month</button></div></header><div className="week-grid"><div className="hours">{['8 AM','10 AM','12 PM','2 PM','4 PM','6 PM'].map((hour) => <span key={hour}>{hour}</span>)}</div>{[13,14,15,16,17,18,19].map((value) => <button className={day === value ? 'selected' : ''} onClick={() => setDay(value)} key={value}><b>{['MON','TUE','WED','THU','FRI','SAT','SUN'][value - 13]}</b><span>{value}</span>{(events[value] ?? []).map((event) => <i key={event}>{event}</i>)}</button>)}</div><footer><b>Thursday {day}, July</b>{(events[day] ?? ['No scheduled events']).map((event) => <span key={event}>{event}</span>)}</footer></section></div>;
}

function MailSurface({ manifest }: SurfaceProps) {
  const outlook = manifest.id === 'outlook';
  const messages = [
    ['Maya Chen', 'Evidence run complete', 'The 48-state capture finished without trajectory drift.', '10:42 AM'],
    ['Package Registry', '3 updates available', 'Kernel tools and the Chromium package can be updated.', '9:18 AM'],
    ['Research Ops', 'Review: network boundaries', 'Please verify that each service keeps an isolated namespace.', 'Yesterday'],
    ['Git Service', 'main received 2 commits', 'The simulator branch advanced to 91ac4f2.', 'Monday'],
  ];
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState('');
  const visible = messages.filter((message) => message.join(' ').toLowerCase().includes(query.toLowerCase()));
  const selectedMessage = visible[selected] ?? visible[0] ?? messages[0];
  return <div className={`mail-app surface-${manifest.id} ${outlook ? 'outlook' : ''}`}><nav><Brand manifest={manifest}/><button className="compose"><Plus/> New {outlook ? 'mail' : 'message'}</button>{[Inbox, Archive, Mail, Clock3].map((NavIcon, index) => <button className={index === 0 ? 'active' : ''} key={index}><NavIcon/>{['Inbox','Archive','Drafts','Snoozed'][index]}{index === 0 && <b>4</b>}</button>)}</nav><section className="mail-list"><header><h2>Inbox</h2><button>Filter</button></header><label><Search/><input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} placeholder="Search mail"/></label>{visible.map((message, index) => <button className={selected === index ? 'active' : ''} onClick={() => setSelected(index)} key={message[1]}><span>{message[0][0]}</span><div><b>{message[0]}</b><strong>{message[1]}</strong><p>{message[2]}</p></div><small>{message[3]}</small></button>)}</section><article className="mail-reader"><header><button>↩</button><button>↪</button><button><Archive/></button><button>•••</button></header><h1>{selectedMessage[1]}</h1><div className="sender"><span>{selectedMessage[0][0]}</span><div><b>{selectedMessage[0]}</b><small>to agent@seed.local · via mail.seed.local</small></div><time>{selectedMessage[3]}</time></div><p>{selectedMessage[2]}</p><p>All referenced artifacts are available on the isolated virtual service network. No external delivery was attempted.</p><button className="reply">Reply</button></article></div>;
}

function MessagesSurface({ manifest }: SurfaceProps) {
  const discord = manifest.id === 'discord';
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const peers = discord ? ['# agent-lab', '# evaluations', '# factory-floor', 'Maya Chen'] : ['Maya Chen', 'Research Ops', 'Isaac', 'Factory Team'];
  return <div className={`messages-app surface-${manifest.id} ${discord ? 'discord' : 'messages'}`}><nav>{discord && <div className="server-stack"><button>S</button><button>RL</button><button>+</button></div>}<Brand manifest={manifest}/><label><Search/><input placeholder={discord ? 'Find or start a conversation' : 'Search'}/></label>{peers.map((peer, index) => <button className={index === 0 ? 'active' : ''} key={peer}><span>{peer.replace(/[^A-Z#]/g, '').slice(0,2) || peer[0]}</span><div><b>{peer}</b><small>{index ? 'No new messages' : 'online · agent lab'}</small></div></button>)}</nav><section><header><div><b>{peers[0]}</b><small>{discord ? 'Seed Research · 14 members' : 'iMessage · seed identity'}</small></div><button><Video/></button><button>ⓘ</button></header><div className="conversation"><time>Today 10:34 AM</time><p className="incoming">The macOS evidence run is ready. Does the app state agree with the VFS snapshot?</p><p className="outgoing">Yes—the document, process and package views all resolve from the same computer snapshot.</p>{sent.map((message, index) => <p className="outgoing" key={index}>{message}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; setSent((items) => [...items, draft.trim()]); setDraft(''); }}><button><Plus/></button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${peers[0]}`}/><button><Send/></button></form></section>{discord && <aside><h4>ONLINE — 4</h4>{['Maya', 'agent-mac', 'agent-win', 'agent-ubuntu'].map((member) => <p key={member}><i/>{member}</p>)}</aside>}</div>;
}

function CallsSurface({ manifest }: SurfaceProps) {
  const zoom = manifest.id === 'zoom';
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [video, setVideo] = useState(true);
  if (!inCall) return <div className={`calls-app calls-lobby surface-${manifest.id}`}><header><Brand manifest={manifest}/><span>{zoom ? 'Workplace' : 'FaceTime'}</span></header><main><div className="camera-preview"><Video/><span>Seed Camera · 1080p</span></div><h1>{zoom ? 'Join the simulator review' : 'Recent calls'}</h1><p>Camera and microphone are virtual peripherals attached to this computer.</p><button className="primary" onClick={() => setInCall(true)}>{zoom ? 'Join meeting' : 'Start FaceTime'}</button></main></div>;
  return <div className={`calls-app calls-active surface-${manifest.id}`}><div className="participant-grid"><article><span>MC</span><b>Maya Chen</b></article><article className={video ? 'local-video' : ''}><span>{video ? <Video/> : 'A'}</span><b>You</b></article></div><div className="call-controls"><button className={muted ? 'off' : ''} onClick={() => setMuted(!muted)}><Mic2/><span>{muted ? 'Unmute' : 'Mute'}</span></button><button className={!video ? 'off' : ''} onClick={() => setVideo(!video)}><Video/><span>{video ? 'Stop video' : 'Start video'}</span></button><button><Users/><span>Participants</span></button><button><Square/><span>Share</span></button><button className="hangup" onClick={() => setInCall(false)}>Leave</button></div></div>;
}

function MediaSurface({ manifest }: SurfaceProps) {
  const [playing, setPlaying] = useState(manifest.id === 'spotify');
  const [track, setTrack] = useState(0);
  const tracks = ['Computer Love', 'Digital Witness', 'Everything in Its Right Place', 'Technologic'];
  if (manifest.id === 'audacity') return <AudacitySurface manifest={manifest}/>;
  if (manifest.id === 'vlc') return <div className="vlc-app surface-vlc"><header><span>Media  Playback  Audio  Video  Subtitle  Tools  View  Help</span></header><main><Film/><b>factory-walkthrough.mp4</b><small>00:00:18 / 00:01:42</small></main><footer><button onClick={() => setPlaying(!playing)}>{playing ? <Pause/> : <Play/>}</button><input type="range" defaultValue="18"/><span><Volume2/> 82%</span></footer></div>;
  return <div className={`media-app surface-${manifest.id}`}><aside><Brand manifest={manifest}/><button className="active">Home</button><button>Recently played</button><button>Albums</button><button>Artists</button><h5>PLAYLISTS</h5><button>Evidence capture</button><button>Focus work</button></aside><section><header><div><h1>{manifest.id === 'spotify' ? 'Good evening' : 'Recently Added'}</h1><p>{manifest.id === 'rhythmbox' ? 'Local library · 4 songs' : 'Seed Research Radio'}</p></div><button><Search/></button><button>agent⌄</button></header><div className="album-feature"><Disc3/><div><small>PLAYLIST</small><h2>Systems music</h2><p>Four tracks · 18 min</p></div><button onClick={() => setPlaying(true)}><Play fill="currentColor"/></button></div><div className="track-list">{tracks.map((name, index) => <button className={track === index ? 'active' : ''} onClick={() => { setTrack(index); setPlaying(true); }} key={name}><span>{index + 1}</span><div><b>{name}</b><small>{['Kraftwerk','St. Vincent','Radiohead','Daft Punk'][index]}</small></div><time>{['5:21','3:24','4:11','4:44'][index]}</time></button>)}</div></section><footer><div><Disc3/><span><b>{tracks[track]}</b><small>{['Kraftwerk','St. Vincent','Radiohead','Daft Punk'][track]}</small></span></div><div><button><SkipBack/></button><button onClick={() => setPlaying(!playing)}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button><button><SkipForward/></button><input type="range" value={playing ? 38 : 0} readOnly/></div><span><Volume2/><input type="range" defaultValue="70"/></span></footer></div>;
}

function AudacitySurface({ manifest }: { manifest: AppManifest }) {
  const [recording, setRecording] = useState(false);
  return <div className="audacity-app surface-audacity"><header><Brand manifest={manifest}/><span>File  Edit  Select  View  Transport  Tracks  Generate  Effect  Analyze</span></header><div className="transport"><button>⏮</button><button><Play/></button><button>■</button><button className={recording ? 'recording' : ''} onClick={() => setRecording(!recording)}>●</button><label><Mic2/><input type="range" defaultValue="64"/></label></div><div className="timeline"><header>{Array.from({ length: 12 }, (_, index) => <span key={index}>{index * 5}s</span>)}</header>{['Narration', 'System audio'].map((track, row) => <article key={track}><aside><b>{track}</b><button>Mute</button><button>Solo</button></aside><div className={`waveform wave-${row}`}>{Array.from({ length: 80 }, (_, index) => <i key={index} style={{ height: `${10 + (index * (row + 3) * 17) % 52}%` }}/>)}</div></article>)}</div><footer>Project Rate 48000 Hz <span>{recording ? 'Recording… 00:00:07' : 'Stopped'}</span></footer></div>;
}

function MapsSurface({ manifest }: SurfaceProps) {
  const places = [['Main Library','100 Larkin St'],['Mission Workshop','18th Street'],['Factory Lab','Dogpatch'],['China Basin','Mission Bay']];
  const [place, setPlace] = useState(0);
  return <div className="maps-app surface-maps"><aside><Brand manifest={manifest}/><label><Search/><input placeholder="Search Maps"/></label><h4>Favorites</h4>{places.map(([name, address], index) => <button className={place === index ? 'active' : ''} onClick={() => setPlace(index)} key={name}><MapPin/><span><b>{name}</b><small>{address}</small></span></button>)}</aside><section><div className="map-canvas"><div className="water"/><div className="road r1"/><div className="road r2"/><div className="road r3"/><span className="map-label bay">SAN FRANCISCO BAY</span>{places.map(([name], index) => <button className={`map-pin pin-${index} ${place === index ? 'selected' : ''}`} onClick={() => setPlace(index)} key={name}><MapPin fill="currentColor"/></button>)}<div className="map-controls"><button><Plus/></button><button>−</button></div></div><article className="place-card"><span className="place-photo"><MapPin/></span><div><h2>{places[place][0]}</h2><p>{places[place][1]} · San Francisco</p><span>Open · 0.{place + 8} mi</span></div><button>Directions</button></article></section></div>;
}

function TasksSurface({ manifest }: SurfaceProps) {
  const linear = manifest.id === 'linear';
  const initial = linear ? [['SIM-128','Audit browser service isolation','In Progress'],['SIM-127','Fix Windows title-bar icon','Done'],['SIM-126','Add per-app information architecture','Todo'],['SIM-125','Record same-service messaging','Backlog']] : [['','Verify package receipts','Today'],['','Review window chrome','Today'],['','Capture app-specific states','Tomorrow'],['','Publish fidelity report','Friday']];
  const [tasks, setTasks] = useState(initial);
  const toggle = (index: number) => setTasks((items) => items.map((task, itemIndex) => itemIndex === index ? [task[0], task[1], linear ? task[2] === 'Done' ? 'Todo' : 'Done' : task[2] === 'Completed' ? 'Today' : 'Completed'] : task));
  if (linear) return <div className="linear-app surface-linear"><aside><Brand manifest={manifest}/><button className="active">Inbox</button><button>My issues</button><button>Views</button><h5>WORKSPACE</h5><button>Seed Simulator</button><button>Cycles</button><button>Projects</button></aside><section><header><div><small>Seed Simulator /</small><h1>All issues</h1></div><button><SlidersHorizontal/> Filter</button><button><Plus/> New issue</button></header><div className="issue-table"><header><span>ID</span><span>Issue</span><span>Status</span><span>Assignee</span></header>{tasks.map((task, index) => <button onClick={() => toggle(index)} key={task[0]}><code>{task[0]}</code><b>{task[1]}</b><span className={`status-${task[2].toLowerCase().replace(' ','-')}`}>{task[2]}</span><i>A</i></button>)}</div></section></div>;
  return <div className="tasks-app surface-reminders"><aside><Brand manifest={manifest}/><div className="reminder-counts"><button className="today"><b>3</b><span>Today</span></button><button><b>4</b><span>Scheduled</span></button></div><h5>MY LISTS</h5><button className="active">Research <b>4</b></button><button>Personal <b>2</b></button></aside><section><header><h1>Research</h1><button>•••</button></header><button className="add-reminder"><Plus/> New Reminder</button>{tasks.map((task, index) => <label className={task[2] === 'Completed' ? 'completed' : ''} key={task[1]}><button onClick={() => toggle(index)}>{task[2] === 'Completed' ? <CheckCircle2/> : <Circle/>}</button><span><b>{task[1]}</b><small><CalendarDays/> {task[2]}</small></span><button>ⓘ</button></label>)}</section></div>;
}

function CanvasSurface({ manifest }: SurfaceProps) {
  const [tool, setTool] = useState(manifest.id === 'snipping-tool' ? 'Rectangle' : 'Brush');
  const [marks, setMarks] = useState<Array<{ x: number; y: number }>>([]);
  if (manifest.id === 'snipping-tool') return <div className="capture-app surface-snipping-tool"><header><Brand manifest={manifest}/><button className="primary">+ New</button><button>▱ Snip mode⌄</button><button>Delay⌄</button></header><main><div className="capture-preview"><div className="capture-selection"><i/><i/><i/><i/><span>1240 × 760</span></div></div><footer><button><Crop/></button><button><PenTool/></button><button>Highlighter</button><button>Erase</button><span/><button>Copy</button><button>Save</button></footer></main></div>;
  const gimp = manifest.id === 'gimp';
  return <div className={`canvas-app surface-${manifest.id} ${gimp ? 'gimp' : 'paint'}`}><header><Brand manifest={manifest}/><span>{gimp ? 'File  Edit  Select  View  Image  Layer  Colors  Tools  Filters' : 'File  Home  View'}</span></header><div className="canvas-toolbar">{['Select','Brush','Fill','Text','Shapes'].map((item) => <button className={tool === item ? 'active' : ''} onClick={() => setTool(item)} key={item}>{item === 'Select' ? <MousePointer2/> : item === 'Brush' ? <PenTool/> : item === 'Fill' ? '▰' : item[0]}<span>{item}</span></button>)}<label>Size<input type="range" defaultValue="38"/></label><div className="palette">{['#111827','#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6'].map((color) => <button key={color} style={{ background: color }}/>)}</div></div><main>{gimp && <aside><h5>TOOL OPTIONS</h5><p>Opacity <b>100</b></p><p>Dynamics <b>Pressure</b></p><p>Spacing <b>10</b></p></aside>}<div className="canvas-stage"><div className="paint-canvas" onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setMarks((items) => [...items, { x: event.clientX - bounds.left, y: event.clientY - bounds.top }]); }}><h2>Seed OS</h2><p>interaction evidence</p>{marks.map((mark, index) => <i key={index} style={{ left: mark.x, top: mark.y }}/>)}</div></div>{gimp && <aside className="layers"><h5>LAYERS</h5><button className="active"><Image/> evidence-overlay</button><button><Image/> desktop-capture</button><button><Plus/> New layer</button></aside>}</main><footer>{tool} · 1600 × 900 · {marks.length + (gimp ? 2 : 1)} layers</footer></div>;
}

function DocumentsSurface({ manifest }: SurfaceProps) {
  const [page, setPage] = useState(0);
  if (manifest.id === 'libreoffice') return <div className="office-app surface-libreoffice"><header><Brand manifest={manifest}/><span>File  Edit  View  Insert  Format  Styles  Table  Form  Tools  Help</span></header><div className="office-toolbar"><button>↶</button><button>↷</button><select><option>Heading 1</option></select><select><option>Liberation Sans</option></select><select><option>24 pt</option></select><button><b>B</b></button><button><i>I</i></button><button>≡</button></div><main><article contentEditable suppressContentEditableWarning><h1>Seed computer ecosystem</h1><p><b>Research environment specification</b></p><p>This document records the observable contract between the desktop UI, virtual filesystem, process table, application services and network trace.</p><h2>Acceptance criteria</h2><ul><li>Application actions cause inspectable state transitions.</li><li>Service boundaries match real product architecture.</li><li>Evidence can be replayed from trajectory events.</li></ul></article></main><footer>Page 1 of 3 <span>English (USA)</span><span>312 words</span><span>100%</span></footer></div>;
  const obsidian = manifest.id === 'obsidian';
  const pages = ['Simulator architecture', 'Application services', 'Evidence protocol', 'Research questions'];
  return <div className={`documents-app surface-${manifest.id} ${obsidian ? 'obsidian' : 'notion'}`}><aside><Brand manifest={manifest}/><label><Search/><input placeholder="Search"/></label><button><Plus/> New page</button><h5>{obsidian ? 'SEED-VAULT' : 'WORKSPACE'}</h5>{pages.map((name, index) => <button className={page === index ? 'active' : ''} onClick={() => setPage(index)} key={name}><FileText/>{name}</button>)}</aside><section><header><span>Research / {pages[page]}</span><button>Share</button><button>•••</button></header><article contentEditable suppressContentEditableWarning><div className="page-icon">{obsidian ? '◇' : '🖥️'}</div><h1>{pages[page]}</h1><p className="lead">A working note grounded in the currently mounted simulator workspace.</p><h2>{page === 0 ? 'One state, many projections' : page === 1 ? 'Independent service planes' : page === 2 ? 'Trajectory-backed proof' : 'Open questions'}</h2><p>The GUI is useful evidence only when its contents are causally linked to the same model exposed through shell commands and APIs.</p><div className="document-callout"><Sparkles/><span>Next: verify this claim against a fresh interaction trace.</span></div><label><input type="checkbox" defaultChecked/> VFS state persists after reload</label><label><input type="checkbox"/> replay reproduces window state</label></article>{obsidian && <aside className="backlinks"><h5>BACKLINKS</h5><button>Kernel model</button><button>Network fabric</button><h5>GRAPH</h5><div className="mini-graph"><i/><i/><i/><i/></div></aside>}</section></div>;
}

function LibrarySurface({ manifest }: SurfaceProps) {
  const games = [['Simulation Lab','RUNNING'],['Factorio','READY'],['Kerbal Space Program','READY'],['Portal 2','CLOUD']];
  const [selected, setSelected] = useState(0);
  const [running, setRunning] = useState(false);
  return <div className="library-app surface-steam"><header><Brand manifest={manifest}/><span>STORE</span><b>LIBRARY</b><span>COMMUNITY</span><small>agent</small></header><aside><label><Search/><input placeholder="Search library"/></label><h5>GAMES AND SOFTWARE</h5>{games.map(([game, status], index) => <button className={selected === index ? 'active' : ''} onClick={() => { setSelected(index); setRunning(false); }} key={game}><span>{game[0]}</span><div><b>{game}</b><small>{status}</small></div></button>)}</aside><main><div className={`game-hero game-${selected}`}><span>SEED LAB</span><h1>{games[selected][0]}</h1><p>Deterministic systems sandbox</p></div><div className="game-actions"><button className={running ? 'stop' : 'play'} onClick={() => setRunning(!running)}>{running ? 'STOP' : 'PLAY'}</button><span>Last played Today · {selected + 2}.4 hours</span></div><section><h2>Activity</h2><article><b>Agent</b><p>Captured a replayable desktop trajectory.</p><small>12 minutes ago</small></article></section></main></div>;
}

function VaultSurface({ manifest }: SurfaceProps) {
  const [locked, setLocked] = useState(true);
  const [copied, setCopied] = useState('');
  if (locked) return <div className={`vault-app vault-locked surface-${manifest.id}`}><Brand manifest={manifest}/><Lock/><h1>{manifest.name} is locked</h1><p>Unlock to inspect simulated credentials. Secrets never cross the host boundary.</p><input type="password" defaultValue="seed-research" aria-label="Master password"/><button onClick={() => setLocked(false)}><Unlock/> Unlock</button><small>Virtual biometric sensor available</small></div>;
  const items = [['App Store Registry','registry@appstore.seed.local'],['Git Service','agent@git.seed.local'],['SeedNet Router','admin@10.42.0.1'],['Factory Database','agent@seed-db']];
  return <div className={`vault-app vault-open surface-${manifest.id}`}><aside><Brand manifest={manifest}/><button className="primary"><Plus/> New item</button><button className="active">All items</button><button>Favorites</button><button>Secure notes</button><button>Shared</button><button onClick={() => setLocked(true)}><Lock/> Lock</button></aside><section><header><h1>All items</h1><label><Search/><input placeholder="Search vault"/></label></header><div className="vault-list">{items.map(([name, username], index) => <article key={name}><span>{name[0]}</span><div><b>{name}</b><small>{username}</small></div><button onClick={() => { setCopied(name); setTimeout(() => setCopied(''), 900); }}><Copy/>{copied === name ? 'Copied' : 'Copy'}</button><button><MoreHorizontal/></button></article>)}</div><footer><ShieldCheck/> Protected by the simulated secure-storage boundary</footer></section></div>;
}

function DatabaseSurface({ manifest, computer }: SurfaceProps) {
  const [ran, setRan] = useState(false);
  return <div className="database-app surface-dbeaver"><aside><Brand manifest={manifest}/><label><Search/><input placeholder="Filter connections"/></label><h5>DATABASE NAVIGATOR</h5><button className="active"><Database/> seed-db <small>connected</small></button>{['Schemas','public','Tables','computers','trajectory_events','packages'].map((item, index) => <button className={`depth-${index}`} key={item}><ChevronRight/>{item}</button>)}</aside><section><header><button>SQL Editor</button><button>Data</button><span>seed-db @ db.seed.local:5432</span></header><div className="sql-toolbar"><button className="run" onClick={() => setRan(true)}><Play fill="currentColor"/> Execute</button><button>Commit</button><button>Rollback</button></div><pre className="sql-editor"><i>1</i><code><b>SELECT</b> hostname, os, ipv4{`\n`}<b>FROM</b> computers{`\n`}<b>ORDER BY</b> hostname;</code></pre><div className="result-grid"><header><span>hostname</span><span>os</span><span>ipv4</span><span>status</span></header>{(ran ? [['mac-studio','macos','10.42.0.11'],['win-workstation','windows','10.42.0.12'],['ubuntu-dev','ubuntu','10.42.0.13']] : [[computer.spec.hostname,computer.spec.os,computer.spec.ipv4]]).map((row) => <div key={row[0]}><span>{row[0]}</span><span>{row[1]}</span><span>{row[2]}</span><span>online</span></div>)}</div><footer>{ran ? '3 rows fetched · 4 ms' : 'Connected · press Execute to run query'}</footer></section></div>;
}

function BlenderSurface({ manifest }: SurfaceProps) {
  const [mode, setMode] = useState('Object Mode');
  return <div className="blender-app surface-blender"><header><Brand manifest={manifest}/><span>File  Edit  Render  Window  Help</span><b>Layout</b><span>Modeling</span><span>Shading</span></header><aside><h5>SCENE COLLECTION</h5>{['Camera','Key Light','DesktopShell','WindowGroup','EvidenceGrid'].map((item, index) => <button className={index === 2 ? 'active' : ''} key={item}><i/>{item}</button>)}</aside><main><div className="viewport-toolbar"><select value={mode} onChange={(event) => setMode(event.target.value)}><option>Object Mode</option><option>Edit Mode</option><option>Sculpt Mode</option></select><button>Global</button><span/><button>●</button><button>◐</button><button>◒</button></div><div className="viewport"><div className="axis"><i className="x">X</i><i className="y">Y</i><i className="z">Z</i></div><div className="grid-floor"/><div className="blender-cube"><i className="front"/><i className="side"/><i className="top"/></div><span className="object-label">DesktopShell</span></div><div className="timeline-bar"><button>⏮</button><button><Play/></button><span>1</span><input type="range" defaultValue="1"/><span>250</span></div></main><aside className="properties"><nav><button><SlidersHorizontal/></button><button><WandSparkles/></button><button><Layers3/></button></nav><h4>Transform</h4>{['Location','Rotation','Scale'].map((item, index) => <p key={item}><b>{item}</b><span>X {index ? '1.000' : '0 m'}</span><span>Y {index ? '1.000' : '0 m'}</span><span>Z {index ? '1.000' : '0 m'}</span></p>)}</aside></div>;
}

function FallbackSurface({ manifest, computer }: SurfaceProps) {
  return <div className={`role-app specialized-app surface-${manifest.id}`}><Rail manifest={manifest} items={['Overview','Files','Activity','Settings']}/><section><header><div><h1>{manifest.name}</h1><p>{manifest.publisher} · {manifest.version}</p></div></header><div className="role-grid"><article><span>01</span><div><b>{manifest.description}</b><small>running on {computer.spec.hostname}</small></div></article><article><span>02</span><div><b>{manifest.packagePath}</b><small>installed package</small></div></article></div><footer><Check/> Application manifest loaded</footer></section></div>;
}
