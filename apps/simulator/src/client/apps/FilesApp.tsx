import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, ExternalLink, File, FileCode2, FilePlus2, Folder, FolderPlus, HardDrive, LayoutGrid, List, Network, Pencil, RotateCw, Search, Trash2 } from 'lucide-react';
import type { AppManifest, ComputerSnapshot, DirectoryEntry } from '@seed/protocol';
import { api } from '../api';
import { AppIcon, useContextMenu } from '../shared';

export function FilesApp({ manifest, computer, onOpenFile }: { manifest: AppManifest; computer: ComputerSnapshot; onOpenFile(path: string): void }) {
  const menu = useContextMenu();
  const home = computer.spec.os === 'windows' ? '/C/Users/agent' : '/home/agent';
  const [history, setHistory] = useState<string[]>([`${home}/Desktop`]);
  const [cursor, setCursor] = useState(0);
  const currentPath = history[cursor]!;
  const [files, setFiles] = useState<DirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [listView, setListView] = useState(computer.spec.os !== 'macos');
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.files(computer.spec.id, currentPath).then(setFiles).catch(() => setFiles([])); }, [computer.spec.id, currentPath]);
  useEffect(() => { load(); setSelected(undefined); }, [load]);
  const goTo = (path: string) => { if (path === currentPath) { load(); return; } setHistory((value) => [...value.slice(0, cursor + 1), path]); setCursor((value) => value + 1); };
  const openEntry = (entry: DirectoryEntry) => { if (entry.inode.kind === 'directory') goTo(entry.path); else onOpenFile(entry.path); };
  const copyText = (text: string) => { try { void navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable in sandbox */ } };
  const mutateFs = async (command: string) => { setBusy(true); try { await api.shell(computer.spec.id, command); load(); } finally { setBusy(false); } };
  const newFolder = () => { const names = new Set(files.map((entry) => entry.name)); let name = 'untitled-folder', index = 2; while (names.has(name)) name = `untitled-folder-${index++}`; void mutateFs(`mkdir ${currentPath}/${name}`); };
  const newFile = () => { const names = new Set(files.map((entry) => entry.name)); let name = 'untitled.txt', index = 2; while (names.has(name)) name = `untitled-${index++}.txt`; void mutateFs(`touch ${currentPath}/${name}`); };
  const visible = files.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { rootRef.current?.focus(); }, []);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    const inInput = (event.target as HTMLElement).tagName === 'INPUT';
    if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus(); return; }
    if ((mod && event.key === 'ArrowUp') || (event.key === 'Backspace' && !inInput)) { event.preventDefault(); const parent = currentPath.split('/').slice(0, -1).join('/') || '/'; if (parent !== currentPath) goTo(parent); return; }
    if (event.key === 'Enter' && !inInput && selected) { event.preventDefault(); const entry = files.find((item) => item.path === selected); if (entry) openEntry(entry); return; }
    if (!mod && !inInput && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); const index = visible.findIndex((item) => item.path === selected); const nextIndex = event.key === 'ArrowDown' ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1); if (visible[nextIndex]) setSelected(visible[nextIndex]!.path); return; }
  };
  const sidebar = computer.spec.os === 'macos' ? ['Desktop', 'Documents', 'Downloads', 'Applications'] : computer.spec.os === 'windows' ? ['Desktop', 'Documents', 'Downloads', 'Pictures'] : ['Desktop', 'Documents', 'Downloads', 'Public'];
  const crumbs = (() => { const parts = currentPath.split('/').filter(Boolean); const list: Array<{ label: string; path: string }> = []; let path = ''; for (const part of parts) { path += `/${part}`; list.push({ label: part === 'C' ? 'This PC' : part, path }); } return list; })();
  const entryMenu = (event: React.MouseEvent, entry: DirectoryEntry) => { setSelected(entry.path); menu(event, [
    { label: 'Open', icon: <ExternalLink />, onClick: () => openEntry(entry) },
    entry.inode.kind !== 'directory' && { label: 'Open in Text Editor', icon: <FileCode2 />, onClick: () => onOpenFile(entry.path) },
    { separator: true },
    { label: 'Copy', icon: <Copy />, onClick: () => copyText(entry.name) },
    { label: 'Copy Path', icon: <Copy />, onClick: () => copyText(entry.path) },
    { label: 'Rename', icon: <Pencil />, disabled: true },
    { separator: true },
    { label: computer.spec.os === 'windows' ? 'Delete' : 'Move to Trash', icon: <Trash2 />, danger: true, onClick: () => void mutateFs(`rm -r ${entry.path}`) },
  ]); };
  const bgMenu = (event: React.MouseEvent) => { if ((event.target as HTMLElement).closest('.file-grid > button')) return; menu(event, [
    { label: 'New Folder', icon: <FolderPlus />, hint: '⇧⌘N', onClick: newFolder },
    { label: 'New Text File', icon: <FilePlus2 />, onClick: newFile },
    { separator: true },
    { label: 'Refresh', icon: <RotateCw />, hint: 'F5', onClick: load },
    { label: listView ? 'As Icons' : 'As List', icon: <LayoutGrid />, onClick: () => setListView(!listView) },
    { separator: true },
    { label: 'Copy Location', icon: <Copy />, onClick: () => copyText(currentPath) },
  ]); };
  return <div ref={rootRef} className={`files-app files-${computer.spec.os}`} tabIndex={0} style={{ outline: 'none' }} onKeyDown={onKeyDown}><aside><div className="files-app-brand"><AppIcon app={manifest} size={24}/><b>{manifest.name}</b></div><h4>{computer.spec.os === 'windows' ? 'Quick access' : 'Favorites'}</h4>{sidebar.map((name) => <button key={name} className={currentPath.endsWith(name) ? 'active' : ''} onClick={() => goTo(name === 'Applications' ? '/Applications' : `${home}/${name}`)}><Folder size={17}/>{name}</button>)}<h4>{computer.spec.os === 'ubuntu' ? 'Other Locations' : 'Locations'}</h4><button onClick={() => goTo(computer.spec.os === 'windows' ? '/C' : '/')}><HardDrive size={17}/>{computer.spec.disks[0]?.label}</button><button><Network size={17}/>Network</button></aside><section><div className="files-toolbar"><button onClick={() => setCursor((value) => Math.max(0, value - 1))} disabled={cursor === 0} title="Back"><ChevronLeft size={17}/></button><button onClick={() => setCursor((value) => Math.min(history.length - 1, value + 1))} disabled={cursor >= history.length - 1} title="Forward"><ChevronRight size={17}/></button><nav className="files-breadcrumbs">{crumbs.map((crumb, index) => <span key={crumb.path}><button onClick={() => goTo(crumb.path)}>{crumb.label}</button>{index < crumbs.length - 1 && <b>›</b>}</span>)}</nav><label><Search size={15}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${currentPath.split('/').at(-1)}`}/></label><button className={!listView ? 'active' : ''} onClick={() => setListView(false)} title="Icon view"><LayoutGrid size={17}/></button><button className={listView ? 'active' : ''} onClick={() => setListView(true)} title="List view"><List size={17}/></button></div><div className={`file-grid ${listView ? 'list-view' : ''}`} onContextMenu={bgMenu} onClick={(event) => { if (event.target === event.currentTarget) setSelected(undefined); }}>{visible.map((entry) => <button key={entry.path} className={selected === entry.path ? 'selected' : ''} onClick={() => setSelected(entry.path)} onDoubleClick={() => openEntry(entry)} onContextMenu={(event) => entryMenu(event, entry)}>{entry.inode.kind === 'directory' ? <Folder size={listView ? 22 : 46} fill="currentColor"/> : entry.name.endsWith('.md') ? <FileCode2 size={listView ? 22 : 43}/> : <File size={listView ? 22 : 43}/>}<span>{entry.name}</span><small>{entry.inode.kind === 'directory' ? 'Folder' : `${entry.inode.size} bytes`}</small></button>)}{!visible.length && <div className="file-empty">{query ? 'No items match your search.' : 'This folder is empty.'}</div>}</div><footer>{busy ? 'working…' : `${visible.length} item${visible.length === 1 ? '' : 's'}`}{selected && ` · ${selected.split('/').at(-1)} selected`} · {currentPath} · {computer.spec.ipv4}</footer></section></div>;
}
