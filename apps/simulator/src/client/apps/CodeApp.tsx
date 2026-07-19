import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronRight, ChevronUp, Download, FileCode2, Folder, GitBranch, Search, SquareTerminal, X } from 'lucide-react';
import type { AppManifest, ComputerSnapshot, DirectoryEntry } from '@seed/protocol';
import { api } from '../api';
import { AppIcon, type TermLine } from '../shared';

const codeLanguage = (path: string) => { const ext = path.split('.').at(-1)?.toLowerCase() ?? ''; return ({ ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React', json: 'JSON', md: 'Markdown', py: 'Python', rs: 'Rust', go: 'Go', sh: 'Shell Script', txt: 'Plain Text', css: 'CSS', html: 'HTML', yml: 'YAML', yaml: 'YAML', toml: 'TOML' } as Record<string, string>)[ext] ?? 'Plain Text'; };
type CodeTab = { path: string; content: string; dirty: boolean; loading: boolean };

// VS Code Dark+ token colors.
const TC = { keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', comment: '#6a9955', type: '#4ec9b0', def: '#d4d4d4' };
const JS_KEYWORDS = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this', 'import', 'export', 'from', 'as', 'default', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'yield', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'with', 'public', 'private', 'protected', 'readonly', 'static', 'type', 'interface', 'enum', 'implements', 'namespace', 'declare', 'abstract', 'get', 'set', 'satisfies', 'keyof', 'infer', 'is']);
const JS_CONST = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

// Lightweight scanner for C-like languages (JS/TS/JSON and a generic fallback).
function scanCode(code: string, opts: { keywords: boolean; hash: boolean }): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0, buf = '';
  const flush = () => { if (buf) { nodes.push(<span key={key++}>{buf}</span>); buf = ''; } };
  const emit = (text: string, color: string) => { flush(); nodes.push(<span key={key++} style={{ color }}>{text}</span>); };
  const numRe = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)/;
  const idRe = /^[A-Za-z_$][\w$]*/;
  const n = code.length;
  let i = 0;
  while (i < n) {
    const c = code[i]!;
    const two = code.substr(i, 2);
    if (two === '//') { const j = code.indexOf('\n', i); const end = j < 0 ? n : j; emit(code.slice(i, end), TC.comment); i = end; continue; }
    if (two === '/*') { const j = code.indexOf('*/', i + 2); const end = j < 0 ? n : j + 2; emit(code.slice(i, end), TC.comment); i = end; continue; }
    if (opts.hash && c === '#') { const j = code.indexOf('\n', i); const end = j < 0 ? n : j; emit(code.slice(i, end), TC.comment); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < n) { if (code[j] === '\\') { j += 2; continue; } if (code[j] === c) { j++; break; } j++; } emit(code.slice(i, j), TC.string); i = j; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(code[i + 1] || ''))) { const m = numRe.exec(code.slice(i)); if (m) { emit(m[0], TC.number); i += m[0].length; continue; } }
    if (/[A-Za-z_$]/.test(c)) { const m = idRe.exec(code.slice(i))![0]; let k = i + m.length; while (k < n && (code[k] === ' ' || code[k] === '\t')) k++; if (opts.keywords && (JS_KEYWORDS.has(m) || JS_CONST.has(m))) emit(m, TC.keyword); else if (code[k] === '(') emit(m, TC.type); else buf += m; i += m.length; continue; }
    buf += c; i++;
  }
  flush();
  return nodes;
}

// Markdown scanner: headings, bold, inline code, links.
function scanMarkdown(code: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0;
  code.split('\n').forEach((line, idx) => {
    if (idx > 0) nodes.push(<span key={key++}>{'\n'}</span>);
    if (/^\s*#{1,6}\s/.test(line)) { nodes.push(<span key={key++} style={{ color: TC.keyword, fontWeight: 700 }}>{line}</span>); return; }
    const re = /(`[^`]*`)|(\*\*[^*]+\*\*)|(\[[^\]]*\]\([^)]*\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index > last) nodes.push(<span key={key++}>{line.slice(last, m.index)}</span>);
      const color = m[1] ? TC.string : m[3] ? TC.type : TC.def;
      nodes.push(<span key={key++} style={{ color, fontWeight: m[2] ? 700 : undefined }}>{m[0]}</span>);
      last = re.lastIndex;
    }
    if (last < line.length) nodes.push(<span key={key++}>{line.slice(last)}</span>);
  });
  return nodes;
}

const highlight = (code: string, path: string): React.ReactNode[] => {
  const ext = path.split('.').at(-1)?.toLowerCase() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json'].includes(ext)) return scanCode(code, { keywords: true, hash: false });
  if (ext === 'md' || ext === 'markdown') return scanMarkdown(code);
  return scanCode(code, { keywords: false, hash: ['py', 'rb', 'sh', 'bash', 'yml', 'yaml', 'toml'].includes(ext) });
};

// Shared layout so the highlight layer aligns exactly with the textarea.
const editorLayout = { font: '13px/1.55 ui-monospace, Menlo, monospace', padding: '8px 12px', margin: 0, tabSize: 2, boxSizing: 'border-box' as const, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const, letterSpacing: 'normal' as const };

export function CodeApp({ computer, manifest }: { computer: ComputerSnapshot; manifest: AppManifest }) {
  const home = computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
  const repo = computer.repositories[0];
  const branch = repo?.branch ?? 'main';
  const [rootEntries, setRootEntries] = useState<DirectoryEntry[]>([]);
  const [children, setChildren] = useState<Record<string, DirectoryEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<CodeTab[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [taskStatus, setTaskStatus] = useState('ready');
  const [showTerminal, setShowTerminal] = useState(false);
  const [showExplorer, setShowExplorer] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const [termInput, setTermInput] = useState('');
  const [termPrompt, setTermPrompt] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const active = tabs.find((tab) => tab.path === activePath);
  useEffect(() => { api.files(computer.spec.id, home).then(setRootEntries).catch(() => setRootEntries([])); api.prompt(computer.spec.id).then((value) => setTermPrompt(value.prompt)); }, [computer.spec.id, home]);
  useEffect(() => { rootRef.current?.focus(); }, []);
  useEffect(() => { if (quickOpen) quickRef.current?.focus(); }, [quickOpen]);
  const toggleFolder = async (path: string) => {
    setExpanded((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
    if (!children[path]) { try { const entries = await api.files(computer.spec.id, path); setChildren((current) => ({ ...current, [path]: entries })); } catch { setChildren((current) => ({ ...current, [path]: [] })); } }
  };
  const openFile = async (path: string) => {
    setActivePath(path);
    if (tabs.some((tab) => tab.path === path)) return;
    setTabs((current) => [...current, { path, content: '', dirty: false, loading: true }]);
    try { const result = await api.readFile(computer.spec.id, path); setTabs((current) => current.map((tab) => tab.path === path ? { ...tab, content: result.content, loading: false } : tab)); }
    catch { setTabs((current) => current.map((tab) => tab.path === path ? { ...tab, content: '', loading: false } : tab)); }
  };
  const closeTab = (path: string) => setTabs((current) => { const rest = current.filter((tab) => tab.path !== path); if (path === activePath) setActivePath(rest.at(-1)?.path); return rest; });
  const editActive = (content: string) => setTabs((current) => current.map((tab) => tab.path === activePath ? { ...tab, content, dirty: true } : tab));
  const save = async () => { if (!active) return; setTaskStatus('saving'); try { await api.writeFile(computer.spec.id, active.path, active.content); setTabs((current) => current.map((tab) => tab.path === active.path ? { ...tab, dirty: false } : tab)); setTaskStatus('saved'); } catch { setTaskStatus('save failed'); } };
  const runTerm = async (command: string) => { if (!command.trim()) return; const before = termPrompt; setTermLines((current) => [...current, { prompt: before, text: command }]); setTermInput(''); const result = await api.shell(computer.spec.id, command); setTermPrompt(result.prompt); setTermLines((current) => [...current, { text: result.stderr || result.stdout, error: Boolean(result.stderr) }]); };
  const runTask = async (task: string) => { setTaskStatus('running'); try { const result = await api.executeApp(computer.spec.id, manifest.id, 'run-task', { task, cwd: home }); setTaskStatus(result.status === 'completed' ? `${task} passed` : `${task} failed`); } catch { setTaskStatus(`${task} failed`); } };
  const reviewChanges = async () => { setTaskStatus('reviewing'); try { const result = await api.executeApp(computer.spec.id, manifest.id, 'source-control', { action: 'review-working-tree' }); setTaskStatus(result.status === 'completed' ? 'working tree reviewed' : 'review failed'); } catch { setTaskStatus('review failed'); } };
  const allFilePaths = useMemo(() => Array.from(new Set([...rootEntries, ...Object.values(children).flat()].filter((entry) => entry.inode.kind !== 'directory').map((entry) => entry.path))), [rootEntries, children]);
  const quickMatches = quickQuery ? allFilePaths.filter((path) => path.toLowerCase().includes(quickQuery.toLowerCase())).slice(0, 8) : allFilePaths.slice(0, 8);
  const openQuick = (path: string) => { void openFile(path); setQuickOpen(false); setQuickQuery(''); rootRef.current?.focus(); };
  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && quickOpen) { event.preventDefault(); setQuickOpen(false); setQuickQuery(''); rootRef.current?.focus(); return; }
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); void save(); }
    else if (key === 'p') { event.preventDefault(); setQuickOpen(true); }
    else if (event.key === '`') { event.preventDefault(); setShowTerminal((value) => !value); }
    else if (key === 'b') { event.preventDefault(); setShowExplorer((value) => !value); }
    else if (key === 'w') { if (active) { event.preventDefault(); closeTab(active.path); } }
  };
  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => { if (highlightRef.current) { highlightRef.current.scrollTop = event.currentTarget.scrollTop; highlightRef.current.scrollLeft = event.currentTarget.scrollLeft; } };
  const renderTree = (entries: DirectoryEntry[], depth: number): React.ReactNode => entries.map((entry) => entry.inode.kind === 'directory'
    ? <div key={entry.path}><button style={{ paddingLeft: 8 + depth * 12 }} onClick={() => void toggleFolder(entry.path)}>{expanded.has(entry.path) ? <ChevronUp size={13}/> : <ChevronRight size={13}/>}<Folder size={14}/>{entry.name}</button>{expanded.has(entry.path) && children[entry.path] && renderTree(children[entry.path]!, depth + 1)}</div>
    : <button key={entry.path} style={{ paddingLeft: 8 + depth * 12 }} className={activePath === entry.path ? 'active' : ''} onClick={() => void openFile(entry.path)}><FileCode2 size={14}/>{entry.name}</button>);
  return <div ref={rootRef} className={`code-app code-${manifest.id}`} tabIndex={0} onKeyDown={onRootKeyDown} style={{ outline: 'none' }}>
    {showExplorer && <aside>
      <div><AppIcon app={manifest} size={18}/> {manifest.id === 'cursor' ? 'CURSOR EXPLORER' : 'EXPLORER'}</div>
      <b>{home.split('/').at(-1)?.toUpperCase()} · {branch}</b>
      {rootEntries.length ? renderTree(rootEntries, 0) : <button disabled>loading files…</button>}
      {manifest.id === 'cursor' && <><b>AI CHANGES</b><button onClick={() => void reviewChanges()}><Bot/>Review working tree</button></>}
    </aside>}
    <section style={{ position: 'relative' }}>
      {quickOpen && <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 20, width: 'min(460px, 80%)', background: '#252526', border: '1px solid rgba(127,127,127,.4)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.4)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px' }}><Search size={13}/><input ref={quickRef} value={quickQuery} onChange={(event) => setQuickQuery(event.target.value)} placeholder="Go to file…" spellCheck={false} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (quickMatches[0]) openQuick(quickMatches[0]); } else if (event.key === 'Escape') { event.preventDefault(); setQuickOpen(false); setQuickQuery(''); rootRef.current?.focus(); } }} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#d4d4d4', font: '13px ui-monospace, monospace' }}/></div>
        <div style={{ maxHeight: 200, overflow: 'auto' }}>{quickMatches.length ? quickMatches.map((path) => <button key={path} onClick={() => openQuick(path)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 10px', background: 'none', border: 'none', color: '#d4d4d4', cursor: 'pointer', font: '12px ui-monospace, monospace' }}>{path.split('/').at(-1)} <span style={{ opacity: .5 }}>{path}</span></button>) : <div style={{ padding: '6px 10px', opacity: .6, fontSize: 12 }}>No matching files</div>}</div>
      </div>}
      <header style={{ display: 'flex', alignItems: 'center' }}>{tabs.length ? tabs.map((tab) => <span key={tab.path} className={tab.path === activePath ? 'active' : ''} onClick={() => setActivePath(tab.path)} style={{ cursor: 'pointer', opacity: tab.path === activePath ? 1 : .6 }}>{tab.path.split('/').at(-1)}{tab.dirty ? ' ●' : ''} <X size={12} onClick={(event) => { event.stopPropagation(); closeTab(tab.path); }}/></span>) : <span>Open a file from the explorer</span>}<button style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => void save()} disabled={!active?.dirty} title="Save (⌘S)"><Download size={13}/>Save</button><button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setShowTerminal((value) => !value)} title="Toggle terminal (⌘`)"><SquareTerminal size={14}/></button></header>
      {active
        ? active.loading
          ? <pre><div><i>1</i>opening…</div></pre>
          : <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
              <pre ref={highlightRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'auto', pointerEvents: 'none', color: TC.def, background: 'transparent', ...editorLayout }}>{highlight(active.content, active.path)}{'\n'}</pre>
              <textarea value={active.content} spellCheck={false} onChange={(event) => editActive(event.target.value)} onScroll={syncScroll} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); void save(); } }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'transparent', caretColor: TC.def, ...editorLayout }}/>
            </div>
        : <pre><div><i>1</i>{`// ${manifest.name} · ${computer.spec.hostname}`}</div><div><i>2</i>{'// Select a file in the explorer to start editing.'}</div></pre>}
      {showTerminal && <div style={{ borderTop: '1px solid rgba(127,127,127,.3)', height: 150, display: 'flex', flexDirection: 'column' }}><div style={{ padding: '3px 10px', fontSize: 11, opacity: .7, display: 'flex', justifyContent: 'space-between' }}><span>TERMINAL — {computer.spec.shell}</span><X size={12} style={{ cursor: 'pointer' }} onClick={() => setShowTerminal(false)}/></div><div style={{ flex: 1, overflow: 'auto', padding: '4px 10px', font: '12px/1.5 ui-monospace, monospace' }}>{termLines.map((line, index) => <div key={index} style={{ whiteSpace: 'pre-wrap', color: line.error ? '#ff6b6b' : 'inherit' }}>{line.prompt && <b>{line.prompt} </b>}{line.text}</div>)}<form onSubmit={(event) => { event.preventDefault(); void runTerm(termInput); }} style={{ display: 'flex', gap: 6 }}><b>{termPrompt}</b><input value={termInput} onChange={(event) => setTermInput(event.target.value)} autoComplete="off" spellCheck={false} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'inherit', font: 'inherit' }}/></form></div></div>}
      <footer><span onClick={() => setShowTerminal((value) => !value)} style={{ cursor: 'pointer' }}><GitBranch size={11}/> {branch}{repo?.staged.length ? '*' : ''}</span><span>{active ? codeLanguage(active.path) : 'TypeScript'}</span><span>{active ? `${active.content.split('\n').length} lines` : `${tabs.length} open`}</span><span>{manifest.id === 'cursor' ? `Cursor: ${taskStatus}` : `Seed: ${taskStatus}`}</span></footer>
    </section>
    {manifest.id === 'cursor' && <aside className="cursor-agent"><header><b>Agent</b><button><X/></button></header><p>{taskStatus === 'ready' ? 'How should the virtual computer change?' : taskStatus}</p><button onClick={() => void runTask('explain-computer-definition')}>Explain this computer definition</button><button onClick={() => void runTask('typecheck')}>Run typecheck</button></aside>}
  </div>;
}
