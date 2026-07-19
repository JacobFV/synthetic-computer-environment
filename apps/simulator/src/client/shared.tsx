import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import type { AppManifest, OSKind } from '@seed/protocol';
import { appIconKey, appIconSource, PlatformIconContext } from './appIcons';

export type WindowState = { id: string; x: number; y: number; width: number; height: number; minimized: boolean; maximized: boolean; z: number };

export type MenuItem = { label?: string; icon?: React.ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; separator?: boolean; hint?: string; checked?: boolean };
export type MenuEntry = MenuItem | false | null | undefined;
export type MenuRequest = { x: number; y: number; items: MenuItem[] } | null;
export const ContextMenuContext = createContext<(event: React.MouseEvent, items: MenuEntry[]) => void>(() => {});
export const useContextMenu = () => useContext(ContextMenuContext);

export function ContextMenuLayer({ menu, onClose }: { menu: MenuRequest; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, ready: false });
  useLayoutEffect(() => {
    if (!menu) { setPos((value) => ({ ...value, ready: false })); return; }
    const rect = ref.current?.getBoundingClientRect();
    const width = rect?.width ?? 210;
    const height = rect?.height ?? 0;
    setPos({ x: Math.max(6, Math.min(menu.x, innerWidth - width - 6)), y: Math.max(6, Math.min(menu.y, innerHeight - height - 6)), ready: true });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('blur', onClose); };
  }, [menu, onClose]);
  if (!menu) return null;
  return <div className="context-menu-backdrop" onMouseDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }} onWheel={onClose}>
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden' }} onMouseDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      {menu.items.map((item, index) => item.separator
        ? <hr key={index} />
        : <button key={index} className={item.danger ? 'ctx-danger' : ''} disabled={item.disabled} onClick={() => { onClose(); item.onClick?.(); }}>
            <span className="ctx-icon">{item.checked ? '✓' : item.icon}</span><span className="ctx-label">{item.label}</span>{item.hint && <span className="ctx-hint">{item.hint}</span>}
          </button>)}
    </div>
  </div>;
}

const iconGlyphs: Record<string, string> = {
  finder: '◑', folder: '●', terminal: '›_', settings: '⚙', notes: '▤', preview: '◫', photos: '✿', calculator: '＋',
  calendar: '16', mail: '✉', appstore: 'A', store: '▣', chromium: '◎', slack: '⌗', teams: 'T', chatgpt: '✦',
  vscode: '⌁', wireshark: '♢',
};

export function AppIcon({ app, os, size = 38 }: { app: AppManifest; os?: OSKind; size?: number }) {
  const contextOS = useContext(PlatformIconContext);
  const platform = os ?? contextOS ?? (app.supportedOS.length === 1 ? app.supportedOS[0] : undefined);
  const key = appIconKey(app, platform);
  const source = appIconSource(app, platform);
  return <span className={`app-glyph app-glyph-${key} ${source ? 'iconify-glyph' : ''}`} style={{ width: size, height: size, fontSize: Math.max(12, size * .42) }}>{source ? <Icon icon={source} width={size * .72} height={size * .72}/> : iconGlyphs[key] ?? app.name[0]}</span>;
}

export const osVersion = (os: OSKind) => os === 'macos' ? 'macOS 26 Tahoe' : os === 'windows' ? 'Windows 11 26H2' : 'Ubuntu 26.04 LTS';

export type TermLine = { prompt?: string; text: string; error?: boolean };
