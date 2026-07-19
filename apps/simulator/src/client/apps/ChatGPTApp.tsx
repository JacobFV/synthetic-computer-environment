import { useEffect, useRef, useState } from 'react';
import { AppWindow as AppWindowIcon, Bot, CircleUserRound, Code2, Globe2, Laptop, LayoutGrid, MessageSquare, Plus, Send, Settings, ShieldCheck, X } from 'lucide-react';
import type { AppManifest, ComputerSnapshot } from '@seed/protocol';
import { api } from '../api';

export function ChatGPTApp({ manifest, computer }: { manifest: AppManifest; computer: ComputerSnapshot }) {
  const [mode, setMode] = useState<'chat' | 'work'>('work');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [modelName, setModelName] = useState('Claude Haiku 4.5');
  const prettyModel = (id?: string) => id?.includes('opus') ? 'Claude Opus 4.8' : id?.includes('sonnet') ? 'Claude Sonnet 5' : id?.includes('haiku') ? 'Claude Haiku 4.5' : id ?? 'Claude';
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  const send = async (text = input) => {
    const content = text.trim();
    if (!content || busy) return;
    setInput(''); setError(undefined);
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next); setBusy(true);
    void api.executeApp(computer.spec.id, manifest.id, 'send-message', { text: content, mode, computerId: computer.spec.id }).catch(() => {});
    try {
      const system = `You are ChatGPT running inside the Seed virtual computer ecosystem — a browser-rendered simulation of macOS, Windows and Ubuntu machines on a virtual network. You are on the ${computer.spec.os} machine "${computer.spec.hostname}" at ${computer.spec.ipv4}. Be concise and helpful.`;
      const result = await api.chat({ messages: next.map((message) => ({ role: message.role, content: message.content })), system });
      if (result.error) setError(result.error);
      else { setMessages((current) => [...current, { role: 'assistant', content: result.text || '(no response)' }]); if (result.model) setModelName(prettyModel(result.model)); }
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  };
  const newChat = () => { setMessages([]); setInput(''); setError(undefined); void api.executeApp(computer.spec.id, manifest.id, 'new-chat', { mode }).catch(() => {}); };
  return <div className={`chatgpt-app chatgpt-${mode}`} tabIndex={0} style={{ outline: 'none' }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void send(); } }}><aside><div className="chat-brand"><span>✦</span><b>ChatGPT</b><button><AppWindowIcon size={16}/></button></div><button className="new-chat" onClick={newChat}><Plus size={17}/>New chat</button>{mode === 'work' && <><h5>WORKSPACE</h5><button><LayoutGrid/>General</button><button className="active"><Code2/>Seed ecosystem</button><button><Bot/>Agent evaluations</button><h5>PROJECTS</h5></>}<div className="chat-recents"><button>computer simulation architecture</button><button>cross-os trajectory design</button><button>gateway safety policies</button></div><footer><CircleUserRound/>Agent <Settings size={15}/></footer></aside><section><header><div className="mode-switch"><button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}>Chat</button><button className={mode === 'work' ? 'active' : ''} onClick={() => setMode('work')}>Work</button></div><button className="model-button" title={modelName}>{modelName} <span>⌄</span></button><button className="share-button">Share</button></header><div className="chat-thread" ref={thread}>{messages.length || busy || error ? <>{messages.map((message, index) => message.role === 'user' ? <div className="user-bubble" key={index}>{message.content}</div> : <div className="assistant-answer" key={index}><span className="spark">✦</span><div>{message.content.split('\n').filter(Boolean).map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}</div></div>)}{busy && <div className="assistant-answer"><span className="spark">✦</span><div className="chat-typing"><i/><i/><i/></div></div>}{error && <div className="chat-error"><ShieldCheck size={14}/> {error}</div>}</> : <div className="chat-empty"><div className="chat-orb">✦</div><h1>{mode === 'chat' ? 'What’s on your mind?' : 'What are we building?'}</h1><p>Connected to a real model through the Seed gateway.</p><div className="suggestions"><button onClick={() => void send('Explain what the Seed virtual computer ecosystem is in two sentences.')}>explain this environment</button><button onClick={() => void send('What can this computer reach on the network?')}>inspect the network</button><button onClick={() => void send('Write a haiku about virtual machines.')}>write a haiku</button></div></div>}</div><div className="composer"><textarea placeholder={mode === 'chat' ? 'Message ChatGPT' : 'Describe a task for your workspace'} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}/><div><button className="attach"><Plus/></button>{mode === 'work' && <span>tools · computer · files</span>}<button className="send" onClick={() => void send()} disabled={busy || !input.trim()}><Send/></button></div></div><small className="chat-disclaimer">ChatGPT can make mistakes. Check important information.</small></section>{mode === 'work' && <aside className="inspector"><header><b>Inspector</b><button><X/></button></header><h5>RUN STATUS</h5><div className="run-status"><i className={busy ? 'busy' : ''}/>{busy ? 'generating' : error ? 'error' : 'ready'}</div><h5>CONTEXT</h5><p><Laptop/>{computer.spec.hostname}</p><p><Globe2/>{modelName}</p><h5>MESSAGES</h5><p><MessageSquare/>{messages.length} in thread</p></aside>}</div>;
}
