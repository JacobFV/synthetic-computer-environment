import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, SquareTerminal, X } from 'lucide-react';
import type { ComputerSnapshot } from '@seed/protocol';
import { api } from '../api';
import type { TermLine } from '../shared';

type TermSession = { id: number; lines: TermLine[]; input: string; prompt: string; histIndex?: number };

export function TerminalApp({ computer, demo }: { computer: ComputerSnapshot; demo: string }) {
  const banner = computer.spec.shell === 'powershell' ? 'PowerShell 7.6.0\nCopyright (c) Microsoft Corporation.' : `${computer.spec.shell} · seed kernel 26.0 · ${computer.spec.hostname}`;
  const seq = useRef(1);
  const [sessions, setSessions] = useState<TermSession[]>([{ id: 1, lines: [{ text: banner }], input: '', prompt: '' }]);
  const [activeId, setActiveId] = useState(1);
  const ranDemo = useRef(false);
  const active = sessions.find((session) => session.id === activeId) ?? sessions[0]!;
  const patch = useCallback((id: number, update: Partial<TermSession> | ((session: TermSession) => Partial<TermSession>)) => setSessions((current) => current.map((session) => session.id === id ? { ...session, ...(typeof update === 'function' ? update(session) : update) } : session)), []);
  useEffect(() => { api.prompt(computer.spec.id).then((value) => setSessions((current) => current.map((session) => session.prompt ? session : { ...session, prompt: value.prompt }))); }, [computer.spec.id]);
  const run = useCallback(async (id: number, command: string) => {
    if (!command.trim()) return;
    const before = sessions.find((session) => session.id === id)?.prompt ?? '';
    patch(id, (session) => ({ lines: [...session.lines, { prompt: before, text: command }], input: '', histIndex: undefined }));
    const result = await api.shell(computer.spec.id, command);
    patch(id, (session) => ({ prompt: result.prompt, lines: [...session.lines, { text: result.stderr || result.stdout, error: Boolean(result.stderr) }] }));
  }, [computer.spec.id, sessions, patch]);
  const newTab = () => { const id = ++seq.current; setSessions((current) => [...current, { id, lines: [{ text: banner }], input: '', prompt: active.prompt }]); setActiveId(id); };
  const closeTab = (id: number) => setSessions((current) => {
    if (current.length <= 1) return current;
    const index = current.findIndex((session) => session.id === id);
    const rest = current.filter((session) => session.id !== id);
    if (id === activeId) setActiveId((rest[index - 1] ?? rest[0]!).id);
    return rest;
  });
  useEffect(() => {
    if (ranDemo.current || !active.prompt || !demo) return; ranDemo.current = true;
    const commands = computer.spec.os === 'macos' ? ['nslookup appstore.seed.local', 'curl https://appstore.seed.local/apps/chatgpt | grep name', 'ps | grep WindowServer'] : computer.spec.os === 'windows' ? ['Resolve-DnsName intranet.seed.local', 'iwr http://intranet.seed.local:8080/ | findstr nominal', 'Get-Process | findstr explorer'] : ['ip addr', 'ss', 'curl http://intranet.seed.local:8080/ | grep nominal'];
    (async () => { for (const command of commands) { await run(1, command); await new Promise((resolve) => setTimeout(resolve, 120)); } })();
  }, [computer.spec.os, demo, active.prompt, run]);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [active.lines]);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    const history = active.lines.filter((line) => line.prompt).map((line) => line.text);
    if (event.key === 'ArrowUp') { if (!history.length) return; event.preventDefault(); const idx = Math.max(0, (active.histIndex ?? history.length) - 1); patch(activeId, { input: history[idx] ?? '', histIndex: idx }); return; }
    if (event.key === 'ArrowDown') { if (active.histIndex === undefined) return; event.preventDefault(); const idx = active.histIndex + 1; patch(activeId, idx >= history.length ? { input: '', histIndex: undefined } : { input: history[idx]!, histIndex: idx }); return; }
    if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'c') { event.preventDefault(); patch(activeId, (session) => ({ lines: [...session.lines, { prompt: session.prompt, text: `${session.input}^C` }], input: '', histIndex: undefined })); return; }
    if (mod && (event.key.toLowerCase() === 'k' || event.key.toLowerCase() === 'l')) { event.preventDefault(); patch(activeId, { lines: [], input: '', histIndex: undefined }); return; }
    if (mod && event.shiftKey && event.key.toLowerCase() === 't') { event.preventDefault(); newTab(); return; }
    if (event.key === 'Tab') { event.preventDefault(); }
  };
  return <div className="terminal-app" tabIndex={0} style={{ outline: 'none' }} onKeyDown={onKeyDown} onClick={() => document.getElementById(`terminal-${computer.spec.id}-${activeId}`)?.focus()}>
    <div className="terminal-tabs">{sessions.map((session, index) => <span key={session.id} className={session.id === activeId ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setActiveId(session.id); }} style={session.id === activeId ? undefined : { opacity: .55, cursor: 'pointer' }}><SquareTerminal size={14}/> {computer.spec.shell} {index + 1}{sessions.length > 1 && <X size={11} style={{ marginLeft: 4 }} onClick={(event) => { event.stopPropagation(); closeTab(session.id); }}/>}</span>)}<Plus size={14} style={{ cursor: 'pointer' }} onClick={(event) => { event.stopPropagation(); newTab(); }} aria-label="New terminal tab"/></div>
    <div className="terminal-screen" ref={scroll}>{active.lines.map((line, index) => <div key={index} className={line.error ? 'terminal-error' : ''}>{line.prompt && <b>{line.prompt}</b>}<span>{line.text}</span></div>)}<form onSubmit={(event) => { event.preventDefault(); run(activeId, active.input); }}><b>{active.prompt}</b><input id={`terminal-${computer.spec.id}-${activeId}`} value={active.input} onChange={(event) => patch(activeId, { input: event.target.value, histIndex: undefined })} autoComplete="off" spellCheck={false}/></form></div>
  </div>;
}
