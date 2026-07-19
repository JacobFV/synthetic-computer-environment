import { useState } from 'react';
import { Play, RefreshCw, SquareTerminal } from 'lucide-react';
import type { AppManifest, ComputerSnapshot, SimulationSnapshot } from '@seed/protocol';
import { api } from '../api';

export function WiresharkApp({ manifest, computer, snapshot }: { manifest: AppManifest; computer: ComputerSnapshot; snapshot: SimulationSnapshot }) {
  const [capturing, setCapturing] = useState(true);
  const [filterDraft, setFilterDraft] = useState('tcp or dns or icmp');
  const [filter, setFilter] = useState('tcp or dns or icmp');
  const allPackets = snapshot.packets.slice(-30).reverse();
  const tokens = filter.toLowerCase().split(/\s+or\s+/).map((item) => item.trim()).filter(Boolean);
  const packets = allPackets.filter((packet) => !tokens.length || tokens.some((token) => `${packet.protocol} ${packet.source} ${packet.destination} ${packet.summary}`.toLowerCase().includes(token))).slice(0, 15);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = packets.find((packet) => packet.id === selectedId) ?? packets[0];
  const toggleCapture = async () => { const next = !capturing; const result = await api.executeApp(computer.spec.id, manifest.id, next ? 'capture' : 'stop-capture', { interface: 'seed0' }); if (result.status === 'completed') setCapturing(next); };
  const applyFilter = async (value = filterDraft) => { const result = await api.executeApp(computer.spec.id, manifest.id, 'filter', { expression: value }); if (result.status === 'completed') { setFilter(value); setFilterDraft(value); } };
  const inspectPacket = async (id: string) => { const result = await api.executeApp(computer.spec.id, manifest.id, 'inspect-packet', { packetId: id }); if (result.status === 'completed') setSelectedId(id); };
  return <div className="wireshark-app"><div className="wire-toolbar"><button className={capturing ? 'capturing' : ''} onClick={() => void toggleCapture()} title={capturing ? 'Stop capture' : 'Start capture'}><Play size={15} fill="#32c86b"/></button><SquareTerminal size={15}/><button onClick={() => void applyFilter('')}><RefreshCw size={15}/></button><label><span>seed0</span><input aria-label="Display filter" value={filterDraft} onChange={(event) => setFilterDraft(event.target.value)} onBlur={() => void applyFilter()} onKeyDown={(event) => { if (event.key === 'Enter') void applyFilter(); }}/></label></div><div className="packet-table"><header><span>No.</span><span>Time</span><span>Source</span><span>Destination</span><span>Protocol</span><span>Length</span><span>Info</span></header>{packets.map((packet, index) => <button key={packet.id} onClick={() => void inspectPacket(packet.id)} className={`packet-${packet.protocol} ${selected?.id === packet.id ? 'selected' : ''}`}><span>{packets.length - index}</span><span>{new Date(packet.at).toLocaleTimeString([], { hour12: false })}</span><span>{packet.source}</span><span>{packet.destination}</span><span>{packet.protocol.toUpperCase()}</span><span>{packet.bytes}</span><span>{packet.summary}</span></button>)}</div><div className="packet-detail"><b>{selected?.protocol.toUpperCase() ?? 'No packets match the display filter'}</b><p>{selected ? `${selected.source} → ${selected.destination} · ${selected.bytes} bytes · trace ${selected.id}` : 'Adjust the filter or generate traffic from another application.'}</p></div></div>;
}
