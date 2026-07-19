import { useState } from 'react';
import { AppWindow as AppWindowIcon } from 'lucide-react';
import type { ComputerSnapshot } from '@seed/protocol';
import { api } from '../api';
import { useContextMenu } from '../shared';

const API_COLLECTIONS: Array<{ name: string; requests: Array<{ label: string; method: string; url: string }> }> = [
  { name: 'Factory API', requests: [{ label: 'GET intranet root', method: 'GET', url: 'http://intranet.seed.local:8080/' }, { label: 'GET health', method: 'GET', url: 'http://intranet.seed.local:8080/health' }] },
  { name: 'App Store Registry', requests: [{ label: 'GET app store', method: 'GET', url: 'http://appstore.seed.local/' }, { label: 'GET chatgpt', method: 'GET', url: 'http://appstore.seed.local/apps/chatgpt' }] },
  { name: 'Collaboration', requests: [{ label: 'GET slack host', method: 'GET', url: 'http://slack.seed.local/' }] },
];

export function ApiClientApp({ computer }: { computer: ComputerSnapshot }) {
  const [collection, setCollection] = useState(0);
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState(API_COLLECTIONS[0]!.requests[0]!.url);
  const [reqTab, setReqTab] = useState(0);
  const [response, setResponse] = useState<{ status: number; body: string; traceId: string }>();
  const [loading, setLoading] = useState(false);
  const reqTabs = ['Params', 'Authorization', 'Headers (2)', 'Body', 'Scripts'];
  const menu = useContextMenu();
  const send = async () => { setLoading(true); try { setResponse(await api.http(computer.spec.id, url)); } finally { setLoading(false); } };
  const pick = (target: string) => { setUrl(target); setResponse(undefined); };
  const methodMenu = (event: React.MouseEvent) => menu(event, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((item) => ({ label: item, checked: item === method, onClick: () => setMethod(item) })));
  return <div className="api-client"><aside><div><AppWindowIcon/>My Workspace</div>{API_COLLECTIONS.map((item, index) => <button key={item.name} className={collection === index ? 'active' : ''} onClick={() => { setCollection(index); pick(item.requests[0]!.url); setMethod(item.requests[0]!.method); }}>{item.name}</button>)}<h5>COLLECTIONS</h5>{API_COLLECTIONS[collection]!.requests.map((request) => <button key={request.url} className={url === request.url ? 'active' : ''} onClick={() => { pick(request.url); setMethod(request.method); }}>▸ {request.label}</button>)}</aside><section><header><span onClick={methodMenu} style={{ cursor: 'pointer' }} title="Change method">{method} ⌄</span><input value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }}/><button onClick={send}>{loading ? 'Sending…' : 'Send'}</button></header><nav>{reqTabs.map((tab, index) => index === reqTab ? <b key={tab} style={{ cursor: 'pointer' }} onClick={() => setReqTab(index)}>{tab}</b> : <span key={tab} style={{ cursor: 'pointer' }} onClick={() => setReqTab(index)}>{tab}</span>)}</nav><div className="request-grid"><div><h4>{reqTabs[reqTab]}</h4>{reqTab === 2 ? <><p><b>Accept</b><span>text/html</span></p><p><b>X-Seed-Computer</b><span>{computer.spec.id}</span></p></> : reqTab === 1 ? <p><b>Type</b><span>No Auth</span></p> : reqTab === 0 ? <p><b>Query</b><span>none</span></p> : reqTab === 3 ? <p><b>Body</b><span>{method === 'GET' ? 'none (GET)' : 'raw · application/json'}</span></p> : <p><b>Pre-request</b><span>// no script</span></p>}</div><div className="response-pane"><header><b>Response</b>{response && <><span>{response.status} OK</span><small>trace {response.traceId.slice(0, 8)}</small></>}</header><pre>{response?.body ?? 'press Send to execute this request through the virtual TCP/IP fabric.'}</pre></div></div></section></div>;
}
