import { useEffect, useState } from 'react';
import { FileCode2 } from 'lucide-react';
import type { ComputerSnapshot, OSKind } from '@seed/protocol';
import { api } from '../api';

export function TextEditorApp({ computer, filePath, os }: { computer: ComputerSnapshot; filePath: string; os: OSKind }) {
  const [content, setContent] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const name = filePath.split('/').at(-1) || 'Untitled';
  const appName = os === 'windows' ? 'Notepad' : os === 'macos' ? 'TextEdit' : 'Text Editor';
  useEffect(() => { let live = true; api.readFile(computer.spec.id, filePath).then((result) => { if (live) { setContent(result.content); setDirty(false); } }).catch(() => { if (live) setContent(''); }); return () => { live = false; }; }, [computer.spec.id, filePath]);
  const save = async () => { setStatus('Saving…'); try { await api.writeFile(computer.spec.id, filePath, content ?? ''); setDirty(false); setStatus('Saved'); setTimeout(() => setStatus((value) => value === 'Saved' ? '' : value), 1600); } catch { setStatus('Save failed'); } };
  const lines = (content ?? '').split('\n').length;
  return <div className={`editor-app editor-${os}`}>
    <div className="editor-toolbar"><span className="editor-title"><FileCode2 size={14}/>{name}{dirty ? ' — Edited' : ''}</span><small>{appName}</small><button className="editor-save" onClick={() => void save()} disabled={!dirty}>Save</button>{status && <em className="editor-status">{status}</em>}</div>
    {content === undefined
      ? <div className="editor-loading">Opening {name}…</div>
      : <textarea className="editor-area" value={content} spellCheck={false} autoFocus onChange={(event) => { setContent(event.target.value); setDirty(true); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); void save(); } }} />}
    <footer className="editor-footer"><span>{filePath}</span><span>{lines} line{lines === 1 ? '' : 's'} · {(content ?? '').length} chars · UTF-8</span></footer>
  </div>;
}
