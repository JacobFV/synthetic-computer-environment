import { useState } from 'react';
import type { AppManifest, ComputerSnapshot } from '@seed/protocol';
import { api } from '../api';
import { AppIcon } from '../shared';

export function DesignApp({ manifest, computer }: { manifest: AppManifest; computer: ComputerSnapshot }) {
  const layers = ['Desktop shell', 'Window group', 'Network card', 'Dock icons', 'Wallpaper'];
  const [selected, setSelected] = useState(1);
  const [tool, setTool] = useState('move');
  const [autoLayout, setAutoLayout] = useState(false);
  const [zoom, setZoom] = useState(100);
  const selectLayer = async (index: number, layer: string) => { const result = await api.executeApp(computer.spec.id, manifest.id, 'select', { layer }); if (result.status === 'completed') setSelected(index); };
  const pickTool = async (name: string, op: string, payload: Record<string, unknown>) => { setTool(name); await api.executeApp(computer.spec.id, manifest.id, op, payload); };
  const toggleAutoLayout = async () => { const next = !autoLayout; await api.executeApp(computer.spec.id, manifest.id, 'edit-properties', { property: 'auto-layout', enabled: next }); setAutoLayout(next); };
  return <div className="design-app"><aside><div className="design-logo"><AppIcon app={manifest} size={26}/><b>{manifest.name}</b></div><h5>LAYERS</h5>{layers.map((item, index) => <button className={selected === index ? 'active' : ''} onClick={() => void selectLayer(index, item)} key={item}><i/>{item}</button>)}</aside><section><header><button className={tool === 'move' ? 'active' : ''} onClick={() => void pickTool('move', 'transform', { tool: 'move' })}>Move</button><button className={tool === 'frame' ? 'active' : ''} onClick={() => void pickTool('frame', 'new-document', { kind: 'frame' })}>Frame</button><button className={tool === 'shape' ? 'active' : ''} onClick={() => void pickTool('shape', 'new-document', { kind: 'shape' })}>Shape</button><span>Seed OS / {layers[selected]}</span><b onClick={() => setZoom((value) => value >= 200 ? 50 : value + 50)} style={{ cursor: 'pointer' }} title="Zoom">{zoom}%</b></header><div className="design-canvas"><div className="artboard" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center', outline: autoLayout ? '1px dashed #8B5CF6' : undefined }}><div className="mini-sidebar"/><div className="mini-title"/><div className="mini-card a"/><div className="mini-card b"/><div className="mini-card c"/><div className="selection-box"><i/><i/><i/><i/></div></div></div></section><aside className="design-inspector"><h4>Design · {layers[selected]}</h4><p><span>X</span><b>240</b><span>Y</span><b>172</b></p><p><span>W</span><b>720</b><span>H</span><b>460</b></p><h5>FILL</h5><div className="fill-row"><i/><code>#8B5CF6</code><span>100%</span></div><h5>AUTO LAYOUT</h5><button className={autoLayout ? 'active' : ''} onClick={() => void toggleAutoLayout()}>{autoLayout ? '✓ Auto layout on' : '＋ Add auto layout'}</button></aside></div>;
}
