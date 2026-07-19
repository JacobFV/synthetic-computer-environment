import { useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ComputerSnapshot, SimulationSnapshot } from '@seed/protocol';
import { api } from '../api';

export function ProcessApp({ computer, setSnapshot }: { computer: ComputerSnapshot; setSnapshot(value: SimulationSnapshot): void }) {
  const tabs = computer.spec.os === 'windows' ? ['Processes', 'Performance', 'App history', 'Startup apps', 'Users', 'Details', 'Services'] : ['Processes', 'Resources', 'File Systems'];
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [terminating, setTerminating] = useState<number>();
  const [taskOutput, setTaskOutput] = useState<string>();
  const visible = computer.processes.filter((process) => process.executable.toLowerCase().includes(query.toLowerCase())).slice(0, 14);
  const terminate = async (pid: number) => { setTerminating(pid); try { await api.terminateProcess(computer.spec.id, pid); setSnapshot(await api.state()); } finally { setTerminating(undefined); } };
  const totalMem = computer.processes.reduce((sum, process) => sum + process.memoryBytes, 0) / 1024 / 1024 / 1024;
  const totalCpu = Math.min(99, computer.processes.reduce((sum, process) => sum + process.cpuTimeMs / 1000, 0));
  const services = computer.processes.filter((process) => process.listeningPorts.length > 0);
  const runTask = async () => { const command = prompt('Create new task', computer.spec.os === 'windows' ? 'Get-Process' : 'ps'); if (!command) return; const result = await api.shell(computer.spec.id, command); setTaskOutput(`$ ${command}\n${result.stderr || result.stdout}`); setSnapshot(await api.state()); };
  const tabName = tabs[tab];
  const searchRef = useRef<HTMLInputElement>(null);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus(); } };
  const panel = () => {
    if (tab === 0) return <div className="process-table"><header><span>Name</span><span>PID</span><span>Status</span><span>CPU</span><span>Memory</span></header>{visible.map((process) => <button disabled={process.pid === 1 || terminating === process.pid} onDoubleClick={() => void terminate(process.pid)} title={process.pid === 1 ? 'Protected system process' : 'Double-click to end process'} key={process.pid}><span><i/>{process.executable}</span><span>{process.pid}</span><span>{terminating === process.pid ? 'stopping' : process.state}</span><span>{Math.min(99.9, process.cpuTimeMs / 1000).toFixed(1)}%</span><span>{Math.max(1, Math.round(process.memoryBytes / 1024 / 1024))} MB</span></button>)}</div>;
    if (tabName === 'Performance' || tabName === 'Resources') return <div className="performance-view"><h2>{tabName}</h2><div className="performance-chart">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ height: `${20 + (index * 29 + computer.processes.length * 7) % 74}%` }}/>)}</div><p>CPU {totalCpu.toFixed(0)}% · Memory {totalMem.toFixed(1)} / 8.0 GB · Processes {computer.processes.length} · Threads {computer.processes.length * 4}</p></div>;
    if (tabName === 'Services') return <div className="process-table"><header><span>Service</span><span>PID</span><span>Ports</span><span>Status</span><span>Memory</span></header>{services.map((process) => <button key={process.pid} disabled><span><i/>{process.executable}</span><span>{process.pid}</span><span>{process.listeningPorts.join(', ')}</span><span>running</span><span>{Math.max(1, Math.round(process.memoryBytes / 1024 / 1024))} MB</span></button>)}{!services.length && <div style={{ padding: 14, opacity: .7 }}>No listening services.</div>}</div>;
    if (tabName === 'Users') return <div className="performance-view"><h2>Users</h2><div className="process-table"><header><span>User</span><span>Processes</span><span>CPU</span><span>Memory</span><span>Session</span></header><button disabled><span><i/>agent</span><span>{computer.processes.length}</span><span>{totalCpu.toFixed(0)}%</span><span>{totalMem.toFixed(1)} GB</span><span>console</span></button></div></div>;
    if (tabName === 'File Systems') return <div className="process-table"><header><span>Device</span><span>Mount</span><span>Type</span><span>Total</span><span>Label</span></header>{computer.spec.disks.map((disk) => <button key={disk.id} disabled><span><i/>{disk.id}</span><span>{disk.mount}</span><span>ext4</span><span>{Math.round(disk.capacityBytes / 1024 / 1024 / 1024)} GB</span><span>{disk.label}</span></button>)}</div>;
    return <div className="performance-view"><h2>{tabName}</h2><p>No {tabName?.toLowerCase()} entries recorded for {computer.spec.hostname}.</p></div>;
  };
  return <div className={`process-app process-${computer.spec.os}`} tabIndex={0} style={{ outline: 'none' }} onKeyDown={onKeyDown}><header><div><h1>{computer.spec.os === 'windows' ? 'Task Manager' : 'System Monitor'}</h1><p>{tabName} · {visible.length} visible</p></div><label><Search/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search processes"/></label><button onClick={() => void runTask()}>Run new task</button></header><nav>{tabs.map((item, index) => <button onClick={() => setTab(index)} className={index === tab ? 'active' : ''} key={item}>{item}</button>)}</nav>{taskOutput && <pre style={{ margin: '6px 12px', padding: 8, background: 'rgba(127,127,127,.12)', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{taskOutput}<X size={12} style={{ float: 'right', cursor: 'pointer' }} onClick={() => setTaskOutput(undefined)}/></pre>}{panel()}</div>;
}
