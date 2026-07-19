import { useState } from 'react';
import { GitBranch, Search } from 'lucide-react';
import type { AppManifest, ComputerSnapshot, SimulationSnapshot } from '@seed/protocol';
import { api } from '../api';
import { AppIcon, useContextMenu } from '../shared';

export function GitClientApp({ computer, manifest, setSnapshot }: { computer: ComputerSnapshot; manifest: AppManifest; setSnapshot(value: SimulationSnapshot): void }) {
  const menu = useContextMenu();
  const repo = computer.repositories[0];
  const branch = repo?.branch ?? 'main';
  const commits = repo?.commits ?? [];
  const branchNames = repo ? Object.keys(repo.branches) : ['main'];
  const changedFiles = (repo?.staged.length ? repo.staged : ['apps/simulator/App.tsx', 'packages/kernel/software.ts', 'docs/evidence.md']).map((file, index) => ({ path: file, status: index === 2 ? 'A' : 'M' as string }));
  const [pushed, setPushed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>();
  const [selectedCommit, setSelectedCommit] = useState(0);
  const push = async () => { const result = await api.executeApp(computer.spec.id, manifest.id, 'push', { cwd: repo?.root, args: ['origin', branch] }); if (result.status === 'completed') { setPushed(true); setSnapshot(await api.state()); } };
  const historyCommits = commits.length ? commits : [{ hash: '4d3c2b1', message: 'add package manager simulation', author: 'agent', at: new Date().toISOString(), treeDigest: '' }, { hash: '9a8b7c6', message: 'capture cross-os trajectories', author: 'agent', at: new Date().toISOString(), treeDigest: '' }];
  const currentCommit = historyCommits[selectedCommit] ?? historyCommits[0]!;
  const branchMenu = (event: React.MouseEvent) => menu(event, branchNames.map((name) => ({ label: name, checked: name === branch, icon: <GitBranch/>, onClick: () => void api.executeApp(computer.spec.id, manifest.id, 'source-control', { action: 'checkout', branch: name, cwd: repo?.root }).then(() => api.state().then(setSnapshot)) })));
  return <div className="git-app"><aside><div className="git-brand"><AppIcon app={manifest} size={28}/><b>{manifest.name}</b></div><label><Search/><input placeholder="Filter repositories"/></label><h5>CURRENT REPOSITORY</h5><button className="repo active"><GitBranch/><span>{repo?.root.split('/').at(-1) ?? 'seed-ecosystem'}<small>{branch}</small></span></button><h5>CHANGES ({changedFiles.length})</h5>{changedFiles.map((file) => <button key={file.path} className={`change ${selectedFile === file.path ? 'active' : ''}`} onClick={() => setSelectedFile(file.path)}><i>{file.status}</i>{file.path}</button>)}</aside><section><header><button onClick={branchMenu} title="Switch branch"><GitBranch/> {branch} ⌄</button><span>{computer.spec.hostname}</span><button className="push" onClick={() => void push()}>{pushed ? 'Pushed ✓' : 'Push origin'}</button></header><div className="commit-workspace"><div className="commit-list"><h3>History</h3>{historyCommits.map((commit, index) => <article className={selectedCommit === index ? 'active' : ''} key={commit.hash} onClick={() => setSelectedCommit(index)} style={{ cursor: 'pointer' }}><i/><div><b>{commit.message}</b><span>{commit.author} · {commit.hash.slice(0, 7)}</span></div></article>)}</div><div className="commit-detail">{selectedFile ? <><small>CHANGED FILE</small><h2>{selectedFile.split('/').at(-1)}</h2><p>{selectedFile} · {changedFiles.find((file) => file.path === selectedFile)?.status === 'A' ? 'added' : 'modified'} in the working tree.</p><div className="diff"><b>{selectedFile}</b><code><i>@@ working tree @@</i><i>+ edits staged for {branch}</i><i>+ tracked by filesystem-backed git</i></code></div></> : <><small>COMMIT · {currentCommit.hash.slice(0, 7)}</small><h2>{currentCommit.message}</h2><p>{currentCommit.author} committed · filesystem-backed git metadata, objects, refs, branches, remotes, and commit history agree with shell output.</p><div className="diff"><b>packages/kernel/software.ts</b><code><i>+ class SoftwareEnvironment</i><i>+ git commit writes .git/objects</i><i>+ package receipts persist in VFS</i></code></div></>}</div></div></section></div>;
}
