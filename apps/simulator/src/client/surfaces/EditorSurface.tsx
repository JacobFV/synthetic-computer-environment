import { useState } from 'react';
import { Plus } from 'lucide-react';
import { runOperation, type SurfaceProps } from './shared';

export function EditorSurface({ manifest, computer }: SurfaceProps) {
  const initial = manifest.id === 'notepad' ? 'Deployment notes\r\n\r\n- Verify Windows package receipts\r\n- Capture window-management trajectory\r\n- Check DNS resolution' : '# Seed ecosystem\n\nEvery visible state is produced by the same kernel state that shell commands inspect.\n\n## Acceptance\n- persistent files\n- causal network traces\n- replayable interaction events';
  const [body, setBody] = useState(initial);
  const [wrapped, setWrapped] = useState(true);
  const [saved, setSaved] = useState(true);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const mac = manifest.id === 'textedit';
  return <div className={`editor-app surface-${manifest.id}`}>
    <div className="editor-menubar"><span>{mac ? 'File  Edit  Format  View  Window  Help' : 'File  Edit  View'}</span><button onClick={() => void runOperation(manifest, computer, 'save', { path: computer.spec.os === 'windows' ? '/C/Users/agent/Documents/deployment-notes.txt' : '/home/agent/Documents/simulation-evidence.md', content: body }).then((ok) => { if (ok) setSaved(true); })}>Save</button><button onClick={() => setWrapped(!wrapped)}>{wrapped ? 'Wrap' : 'No wrap'}</button></div>
    {manifest.id === 'gedit' && <div className="editor-tabs"><button className="active">simulation-evidence.md</button><button><Plus/> New tab</button></div>}
    {mac && <div className="editor-format"><select defaultValue="body"><option value="body">Body</option><option>Title</option></select><button>B</button><button><i>I</i></button><button>≡</button><span>Helvetica · 13</span></div>}
    <textarea aria-label={`${manifest.name} document`} wrap={wrapped ? 'soft' : 'off'} value={body} onChange={(event) => { setBody(event.target.value); setSaved(false); }} spellCheck/>
    <footer><span>{computer.spec.os === 'windows' ? 'Ln 1, Col 1' : saved ? 'Saved' : 'Edited'}</span><span>{words} words · UTF-8</span><span>{computer.spec.hostname}</span></footer>
  </div>;
}
