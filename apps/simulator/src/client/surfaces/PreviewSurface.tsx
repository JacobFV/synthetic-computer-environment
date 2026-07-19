import { useState } from 'react';
import { ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

export function PreviewSurface({ manifest, computer }: SurfaceProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(90);
  const documentPath = `${computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent'}/Documents/research-note.pdf`;
  const setDocumentPage = async (value: number) => { if (await runOperation(manifest, computer, 'open', { path: documentPath, page: value })) setPage(value); };
  const setDocumentZoom = async (value: number) => { if (await runOperation(manifest, computer, 'zoom', { percent: value })) setZoom(value); };
  return <div className={`preview-app surface-${manifest.id}`}>
    <aside><Brand manifest={manifest}/><h5>THUMBNAILS</h5>{[1, 2, 3, 4].map((value) => <button className={page === value ? 'active' : ''} onClick={() => setDocumentPage(value)} key={value}><span className="page-thumb"><i/><i/><i/></span><small>{value}</small></button>)}</aside>
    <section><header><button onClick={() => setDocumentPage(Math.max(1, page - 1))}>‹</button><b>{page} / 4</b><button onClick={() => setDocumentPage(Math.min(4, page + 1))}>›</button><span/><button onClick={() => setDocumentZoom(Math.max(50, zoom - 10))}><ZoomOut/></button><b>{zoom}%</b><button onClick={() => setDocumentZoom(Math.min(160, zoom + 10))}><ZoomIn/></button></header>
      <div className="document-stage"><article style={{ transform: `scale(${zoom / 100})` }}><small>SEED RESEARCH NOTE · PAGE {page}</small><h1>{page === 1 ? 'Causal fidelity in a browser-native computer' : page === 2 ? 'State and persistence model' : page === 3 ? 'Network service boundaries' : 'Reproducibility checklist'}</h1><p>The desktop, shell, process table, VFS and network trace are projections of one simulation state—not independent mockups.</p><div className="document-diagram"><i/><ChevronRight/><i/><ChevronRight/><i/></div><p className="document-meta">Opened from {computer.spec.os === 'windows' ? 'C:\\Users\\agent\\Documents' : '/home/agent/Documents'}</p></article></div>
    </section>
  </div>;
}
