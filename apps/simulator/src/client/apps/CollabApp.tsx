import { useRef, useState } from 'react';
import { Activity, Bell, CalendarDays, Clock, Ellipsis, File, Home, MessageSquare, Radio, Search, Send, Users } from 'lucide-react';
import type { ComputerSnapshot, SimulationSnapshot } from '@seed/protocol';
import { api } from '../api';

export function CollabApp({ teams, computer, snapshot, setSnapshot }: { teams: boolean; computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [navIndex, setNavIndex] = useState(0);
  const [huddle, setHuddle] = useState(false);
  const [teamsTab, setTeamsTab] = useState(0);
  const [wsMenu, setWsMenu] = useState(false);
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [threads, setThreads] = useState<Record<string, string[]>>({});
  const [replyTo, setReplyTo] = useState<string>();
  const [replyText, setReplyText] = useState('');
  const serviceId = teams ? 'teams' : 'slack';
  const service = snapshot.collaborationServices.find((item) => item.id === serviceId);
  const selfAuthor = computer.spec.os === 'windows' ? 'Windows Agent' : computer.spec.os === 'macos' ? 'Mac Agent' : 'Ubuntu Agent';
  const channelNames = service?.channels.map((channel) => channel.id) ?? ['general', 'agent-runs', 'factory-floor'];
  const [channelId, setChannelId] = useState(channelNames.includes('agent-runs') ? 'agent-runs' : channelNames[0] ?? 'agent-runs');
  const activeChannel = channelNames.includes(channelId) ? channelId : channelNames[0] ?? channelId;
  const allMessages = service?.messages.filter((message) => message.channelId === activeChannel) ?? [];
  const messages = search.trim() ? allMessages.filter((message) => `${message.author} ${message.text}`.toLowerCase().includes(search.toLowerCase())) : allMessages;
  const dmPeople = [...new Set((service?.messages ?? []).map((message) => message.author).filter((author) => author !== selfAuthor))];
  const visibleChannels = search.trim() ? channelNames.filter((channel) => channel.toLowerCase().includes(search.toLowerCase())) : channelNames;
  const send = async () => {
    if (!text.trim()) return;
    await api.collaborate(computer.spec.id, serviceId, activeChannel, selfAuthor, text.trim());
    setText(''); setSnapshot(await api.state());
  };
  const addReaction = (id: string, emoji: string) => setReactions((current) => { const forId = { ...(current[id] ?? {}) }; forId[emoji] = (forId[emoji] ?? 0) + 1; return { ...current, [id]: forId }; });
  const sendReply = (id: string) => { if (!replyText.trim()) return; setThreads((current) => ({ ...current, [id]: [...(current[id] ?? []), replyText.trim()] })); setReplyText(''); };
  const navLabels = teams ? ['Activity', 'Chat', 'Teams', 'Calendar', 'Calls', 'Files'] : ['Home', 'DMs', 'Activity', 'Later', 'More'];
  const navIcons = teams ? [Activity, MessageSquare, Users, CalendarDays, Radio, File] : [Home, MessageSquare, Bell, Clock, Ellipsis];
  const homeIndex = teams ? 2 : 0;
  const dmIndex = teams ? 1 : 1;
  const isHome = navIndex === homeIndex;
  const isDMs = navIndex === dmIndex;
  const channelTitle = teams ? activeChannel.replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : `# ${activeChannel}`;
  const asideTitle = isDMs ? (teams ? 'Chat' : 'Direct messages') : (service?.workspaceName ?? 'Seed Engineering');
  const messageBar = (message: { id: string; text: string }) => <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
    {Object.entries(reactions[message.id] ?? {}).map(([emoji, count]) => <span key={emoji} onClick={() => addReaction(message.id, emoji)} style={{ cursor: 'pointer', fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'rgba(127,127,127,.18)' }}>{emoji} {count}</span>)}
    {['👍', '🎉', '✅'].map((emoji) => <button key={emoji} type="button" onClick={() => addReaction(message.id, emoji)} title="Add reaction" style={{ cursor: 'pointer', fontSize: 12, lineHeight: 1, background: 'none', border: 'none', padding: 0, opacity: .6 }}>{emoji}</button>)}
    <button type="button" onClick={() => { setReplyTo(replyTo === message.id ? undefined : message.id); setReplyText(''); }} title="Reply in thread" style={{ cursor: 'pointer', fontSize: 11, background: 'none', border: 'none', color: 'inherit', opacity: .6, display: 'inline-flex', alignItems: 'center', gap: 3 }}><MessageSquare size={11}/>{(threads[message.id]?.length ?? 0) > 0 ? `${threads[message.id]!.length} repl${threads[message.id]!.length === 1 ? 'y' : 'ies'}` : 'Reply'}</button>
  </div>;
  const renderMessage = (message: NonNullable<typeof service>['messages'][number], index: number) => <article key={message.id} className={message.computerId === computer.spec.id ? 'message-local' : ''}>
    <span className={`avatar ${index % 3 === 0 ? 'purple' : index % 3 === 1 ? 'green' : 'orange'}`}>{message.author.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2)}</span>
    <div><b>{message.author} <small>{new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {message.computerId}</small></b><p>{message.text}</p>
      {messageBar(message)}
      {(threads[message.id]?.length ?? 0) > 0 && <div style={{ borderLeft: '2px solid rgba(127,127,127,.3)', paddingLeft: 8, marginTop: 4 }}>{threads[message.id]!.map((reply, replyIndex) => <p key={replyIndex} style={{ fontSize: 12, margin: '2px 0' }}><b>{selfAuthor}: </b>{reply}</p>)}</div>}
      {replyTo === message.id && <form onSubmit={(event) => { event.preventDefault(); sendReply(message.id); }} style={{ display: 'flex', gap: 4, marginTop: 4 }}><input autoFocus value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Reply…" style={{ flex: 1, fontSize: 12, padding: '3px 6px' }}/><button type="submit" aria-label="Send reply"><Send size={13}/></button></form>}
    </div>
  </article>;
  return <div className={`collab-app ${teams ? 'teams' : 'slack'}`} tabIndex={0} style={{ outline: 'none' }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus(); } }}>
    <nav><span>{teams ? 'T' : 'S'}</span>{navLabels.map((label, index) => { const NavIcon = navIcons[index]!; return <button className={navIndex === index ? 'active' : ''} key={label} onClick={() => setNavIndex(index)}><NavIcon/><small>{label}</small></button>; })}</nav>
    <aside>
      <h3 style={{ cursor: 'pointer', position: 'relative' }} onClick={() => setWsMenu((value) => !value)}>{asideTitle}{!teams && ' ⌄'}
        {wsMenu && <div onClick={(event) => event.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, background: '#2b2b3d', color: '#fff', borderRadius: 8, padding: 6, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,.4)', fontWeight: 400 }}>
          <div style={{ padding: '5px 8px', fontSize: 12, opacity: .7 }}>{service?.host ?? 'seed.local'}</div>
          <button onClick={() => { setWsMenu(false); setNavIndex(homeIndex); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', padding: '6px 8px', cursor: 'pointer', fontSize: 13 }}>Channels &amp; posts</button>
          <button onClick={() => { setWsMenu(false); setNavIndex(dmIndex); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', padding: '6px 8px', cursor: 'pointer', fontSize: 13 }}>Direct messages</button>
          <button onClick={() => { setWsMenu(false); void api.state().then(setSnapshot); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', padding: '6px 8px', cursor: 'pointer', fontSize: 13 }}>Refresh messages</button>
        </div>}
      </h3>
      <label><Search/><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={teams ? 'Search Teams' : 'Search Slack'}/></label>
      {isDMs
        ? <><h5>DIRECT MESSAGES</h5>{dmPeople.length ? dmPeople.map((person) => <button key={person} onClick={() => {}}><span style={{ marginRight: 4 }}>●</span>{person}</button>) : <p className="collab-empty">No direct messages yet.</p>}</>
        : <><h5>{teams ? 'YOUR TEAMS' : 'CHANNELS'}</h5>{visibleChannels.map((channel) => { const count = service?.messages.filter((message) => message.channelId === channel).length ?? 0; return <button className={channel === activeChannel ? 'active' : ''} key={channel} onClick={() => { setChannelId(channel); setNavIndex(homeIndex); }}>{teams ? channel === activeChannel ? '▾ Simulator Research  ·  Agent runs' : `▸ ${channel.replaceAll('-', ' ')}` : `# ${channel}`}{count > 0 && <i>{count}</i>}</button>; })}{!visibleChannels.length && <p className="collab-empty">No channels match “{search}”.</p>}</>}
    </aside>
    <section>
      <header><div><b>{isDMs ? (teams ? 'Chat' : 'Direct messages') : channelTitle}</b><span>{service?.workspaceName} · {service?.host}</span></div>{teams && isHome && <nav>{['Posts', 'Files', 'Notes'].map((tab, index) => <button key={tab} className={teamsTab === index ? 'active' : ''} onClick={() => setTeamsTab(index)}>{tab}</button>)}</nav>}<button className={huddle ? 'active' : ''} onClick={() => setHuddle((value) => !value)}>{teams ? (huddle ? 'Leave meeting' : 'Meet') : (huddle ? 'End huddle' : 'Start a huddle')}</button></header>
      {huddle && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: teams ? '#464775' : '#3b1f3b', color: '#fff', fontSize: 13 }}><Radio size={15}/><b>{teams ? 'Meeting' : 'Huddle'} live</b><span style={{ opacity: .8 }}>in {isDMs ? 'DM' : channelTitle} · {selfAuthor} connected</span><button onClick={() => setHuddle(false)} style={{ marginLeft: 'auto', background: '#e0245e', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>Hang up</button></div>}
      {!isHome && !isDMs
        ? <div className="messages"><p className="collab-empty" style={{ padding: 16 }}>{navLabels[navIndex]}</p>{navIndex === (teams ? 0 : 2) && (service?.messages ?? []).slice(-12).reverse().map((message, index) => <article key={message.id}><span className={`avatar ${index % 3 === 0 ? 'purple' : index % 3 === 1 ? 'green' : 'orange'}`}>{message.author.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2)}</span><div><b>{message.author} <small>#{message.channelId} · {new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></b><p>{message.text}</p></div></article>)}{!teams && navIndex === 3 && allMessages.filter((message) => message.author === selfAuthor).map((message, index) => renderMessage(message, index))}</div>
        : teams && isHome && teamsTab === 1
        ? <div className="messages" style={{ padding: 12 }}>{['agent-runs.log', 'trajectory.jsonl', 'evidence.md'].map((file) => <article key={file}><span className="avatar green"><File size={16}/></span><div><b>{file}</b><small>shared in {channelTitle}</small></div></article>)}</div>
        : teams && isHome && teamsTab === 2
        ? <div className="messages" style={{ padding: 16 }}><p>Team notes for {channelTitle}. Use the composer below to append a note.</p></div>
        : <div className="messages">{messages.map((message, index) => renderMessage(message, index))}{!messages.length && <p className="collab-empty">{search.trim() ? 'No messages match your search.' : 'No messages in this channel yet.'}</p>}</div>}
      <form onSubmit={(event) => { event.preventDefault(); send(); }}><input aria-label={`Message ${activeChannel} on ${serviceId}`} placeholder={teams ? (teamsTab === 2 ? 'Add a note' : 'Start a post') : `Message #${activeChannel}`} value={text} onChange={(event) => setText(event.target.value)}/><button aria-label="Send message"><Send/></button></form>
    </section>
  </div>;
}
