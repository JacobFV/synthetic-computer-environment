import { useState } from 'react';
import { ChevronRight, Database, Play, Search } from 'lucide-react';
import { Brand, runOperation, type SurfaceProps } from './shared';

type QueryResult = { columns: string[]; rows: string[][] };

export function DatabaseSurface({ manifest, computer }: SurfaceProps) {
  const tree = ['Schemas','public','Tables','computers','trajectory_events','packages'];
  const tableData: Record<string, QueryResult> = {
    computers: { columns: ['hostname','os','ipv4','status'], rows: [['mac-studio','macos','10.42.0.10','online'],['win-workstation','windows','10.42.0.20','online'],['ubuntu-dev','ubuntu','10.42.0.30','online'],[computer.spec.hostname,computer.spec.os,computer.spec.ipv4,'online']] },
    trajectory_events: { columns: ['id','kind','app','ts'], rows: [['e-4201','click','photos','10:42:01'],['e-4202','shell','terminal','10:42:04'],['e-4203','http','mail','10:42:09']] },
    packages: { columns: ['name','version','manager'], rows: [['kernel-tools','2.3.1','apt'],['chromium','126.0','apt'],['seed-agent','0.3.0','pip']] },
  };
  const [sql, setSql] = useState('SELECT hostname, os, ipv4\nFROM computers\nORDER BY hostname;');
  const [selectedItem, setSelectedItem] = useState('computers');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [status, setStatus] = useState('Connected · press Execute to run query');
  const runSql = async (text: string) => {
    await runOperation(manifest, computer, 'query', { sql: text });
    const match = /from\s+([a-z_]+)/i.exec(text);
    const table = match?.[1] ?? '';
    const data = tableData[table];
    if (data) { setResult(data); setStatus(`${data.rows.length} rows fetched · 4 ms`); }
    else { setResult({ columns: ['result'], rows: [['0 rows']] }); setStatus(`Query executed · unknown relation "${table}"`); }
  };
  const selectTree = async (item: string) => { setSelectedItem(item); await runOperation(manifest, computer, 'browse-schema', { item }); if (tableData[item]) { const next = `SELECT *\nFROM ${item}\nLIMIT 100;`; setSql(next); void runSql(next); } };
  const shownResult = result ?? { columns: ['hostname','os','ipv4','status'], rows: [[computer.spec.hostname, computer.spec.os, computer.spec.ipv4, 'online']] };
  return <div className="database-app surface-dbeaver"><aside><Brand manifest={manifest}/><label><Search/><input placeholder="Filter connections"/></label><h5>DATABASE NAVIGATOR</h5><button className="active" onClick={() => void runOperation(manifest, computer, 'connect', { host: 'db.seed.local', port: 5432 })}><Database/> seed-db <small>connected</small></button>{tree.map((item, index) => <button className={`depth-${index} ${selectedItem === item ? 'active' : ''}`} onClick={() => void selectTree(item)} key={item}><ChevronRight/>{item}</button>)}</aside><section><header><button>SQL Editor</button><button>Data</button><span>seed-db @ db.seed.local:5432</span></header><div className="sql-toolbar"><button className="run" onClick={() => void runSql(sql)}><Play fill="currentColor"/> Execute</button><button onClick={() => void runOperation(manifest, computer, 'commit').then(() => setStatus('Transaction committed'))}>Commit</button><button onClick={() => void runOperation(manifest, computer, 'rollback').then(() => setStatus('Transaction rolled back'))}>Rollback</button></div><textarea value={sql} onChange={(event) => setSql(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void runSql(sql); } }} spellCheck={false} style={{ margin: 0, padding: 12, background: '#1c222b', color: '#dbe5ef', font: '10px/1.6 "JetBrains Mono", monospace', border: 'none', outline: 'none', resize: 'none', overflow: 'auto' }}/><div className="result-grid">{(() => { const cols = `repeat(${shownResult.columns.length}, 1fr)`; return <><header style={{ gridTemplateColumns: cols }}>{shownResult.columns.map((column) => <span key={column}>{column}</span>)}</header>{shownResult.rows.map((row, rowIndex) => <div key={rowIndex} style={{ gridTemplateColumns: cols }}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>)}</>; })()}</div><footer>{status}</footer></section></div>;
}
