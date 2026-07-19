import { useState } from 'react';
import { Box, Monitor, Network, Search, ShieldCheck, Wifi } from 'lucide-react';
import type { ComputerSnapshot, SimulationSnapshot } from '@seed/protocol';
import { api } from '../api';
import { osVersion } from '../shared';

export function SettingsApp({ computer, snapshot, setSnapshot }: { computer: ComputerSnapshot; snapshot: SimulationSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const sections: Array<[string, typeof Monitor]> = [['System', Monitor], ['Network', Network], ['Apps', Box], ['Privacy & Security', ShieldCheck]];
  const [selected, setSelected] = useState(1);
  const [pendingGateway, setPendingGateway] = useState<string>();
  const [find, setFind] = useState('');
  const toggleGateway = async (id: string, enabled: boolean) => {
    setPendingGateway(id);
    try { await api.setGateway(computer.spec.id, id, enabled); setSnapshot(await api.state()); }
    finally { setPendingGateway(undefined); }
  };
  const networkTitle = computer.spec.os === 'macos' ? 'Wi-Fi' : computer.spec.os === 'ubuntu' ? 'Network' : 'Network & internet';
  const label = (name: string) => name === 'Network' ? networkTitle : name;
  const visibleSections = find.trim() ? sections.filter(([name]) => label(name).toLowerCase().includes(find.toLowerCase())) : sections;
  return <div className={`settings-app settings-${computer.spec.os}`}><aside><div className="settings-user"><span>A</span><div><b>agent</b><small>{computer.spec.os === 'macos' ? 'Apple Account' : 'Local Account'}</small></div></div><label><Search size={14}/><input value={find} onChange={(event) => { setFind(event.target.value); const match = sections.findIndex(([name]) => label(name).toLowerCase().includes(event.target.value.toLowerCase())); if (event.target.value.trim() && match >= 0) setSelected(match); }} placeholder={computer.spec.os === 'macos' ? 'Search' : 'Find a setting'}/></label>{visibleSections.map(([name, SectionIcon]) => { const index = sections.findIndex(([sectionName]) => sectionName === name); return <button onClick={() => setSelected(index)} className={selected === index ? 'active' : ''} key={name}><SectionIcon size={18}/>{label(name)}</button>; })}{!visibleSections.length && <p className="settings-empty">No settings match “{find}”.</p>}</aside><section>{selected === 1 ? <><h1>{networkTitle}</h1><div className="network-card"><span className="network-icon"><Wifi/></span><div><b>SeedNet</b><small>Connected, secured · {computer.spec.ipv4}/24</small></div><span>{computer.spec.os === 'macos' ? 'Details…' : 'Private network'}</span></div><h3>Properties</h3><div className="settings-panel"><p><span>IPv4 address</span><b>{computer.spec.ipv4}</b></p><p><span>DNS server</span><b>10.42.0.2 (dns.seed.local)</b></p><p><span>Link speed</span><b>10 Gbps virtual</b></p><p><span>Adapter</span><b>Seed paravirtualized NIC</b></p></div><h3>Gateway policy</h3>{snapshot.gateways.map((rule) => <button disabled={pendingGateway === rule.id} className="gateway-rule" onClick={() => void toggleGateway(rule.id, !rule.enabled)} key={rule.id}><ShieldCheck/><div><b>{rule.name}</b><small>{rule.protocols.join(', ')} · {rule.hostnames.join(', ')} · {rule.ports === '*' ? 'all ports' : rule.ports.join(', ')}</small></div><i className={rule.enabled ? 'on' : ''}/></button>)}</> : <><h1>{sections[selected]?.[0]}</h1><div className="settings-panel"><p><span>Computer</span><b>{computer.spec.hostname}</b></p><p><span>Operating system</span><b>{osVersion(computer.spec.os)}</b></p><p><span>Installed applications</span><b>{computer.installedApps.length}</b></p><p><span>Running processes</span><b>{computer.processes.length}</b></p></div></>}</section></div>;
}
