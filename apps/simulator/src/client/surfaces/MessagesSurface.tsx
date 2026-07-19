import { useState } from 'react';
import { Plus, Search, Send, Video } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function MessagesSurface({ manifest, computer }: SurfaceProps) {
  const discord = manifest.id === 'discord';
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState<Record<number, string[]>>({});
  const peers = discord ? ['# agent-lab', '# evaluations', '# factory-floor', 'Maya Chen'] : ['Maya Chen', 'Research Ops', 'Isaac', 'Factory Team'];
  const shown = peers.map((peer, index) => ({ peer, index })).filter(({ peer }) => peer.toLowerCase().includes(query.toLowerCase()));
  const current = peers[active]!;
  const selectPeer = async (index: number) => { await runOperation(manifest, computer, 'open-conversation', { peer: peers[index] }); setActive(index); };
  const sendMessage = async () => { const text = draft.trim(); if (!text) return; if (await runOperation(manifest, computer, 'send-message', { peer: current, text })) { setSent((items) => ({ ...items, [active]: [...(items[active] ?? []), text] })); setDraft(''); } };
  return <div className={`messages-app surface-${manifest.id} ${discord ? 'discord' : 'messages'}`}><nav>{discord && <div className="server-stack"><button>S</button><button>RL</button><button>+</button></div>}<Brand manifest={manifest}/><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={discord ? 'Find or start a conversation' : 'Search'}/></label>{shown.map(({ peer, index }) => <button className={index === active ? 'active' : ''} key={peer} onClick={() => void selectPeer(index)}><span>{peer.replace(/[^A-Z#]/g, '').slice(0,2) || peer[0]}</span><div><b>{peer}</b><small>{(sent[index]?.length ?? 0) > 0 ? `${sent[index]!.length} sent` : index === active ? 'online · agent lab' : 'No new messages'}</small></div></button>)}</nav><section><header><div><b>{current}</b><small>{discord ? 'Seed Research · 14 members' : 'iMessage · seed identity'}</small></div><button><Video/></button><button>ⓘ</button></header><div className="conversation"><time>Today 10:34 AM</time><p className="incoming">The macOS evidence run is ready. Does the app state agree with the VFS snapshot?</p><p className="outgoing">Yes—the document, process and package views all resolve from the same computer snapshot.</p>{(sent[active] ?? []).map((message, index) => <p className="outgoing" key={index}>{message}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><button type="button"><Plus/></button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${current}`}/><button type="submit"><Send/></button></form></section>{discord && <aside><h4>ONLINE — 4</h4>{['Maya', 'agent-mac', 'agent-win', 'agent-ubuntu'].map((member) => <p key={member}><i/>{member}</p>)}</aside>}</div>;
}
