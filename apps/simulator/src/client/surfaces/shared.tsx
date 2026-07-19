import { useContext } from 'react';
import { Icon } from '@iconify/react';
import type { AppManifest, ComputerSnapshot } from '@seed/protocol';
import { api } from '../api';
import { appIconSource, PlatformIconContext } from '../appIcons';

export type SurfaceProps = { manifest: AppManifest; computer: ComputerSnapshot };

export async function runOperation(manifest: AppManifest, computer: ComputerSnapshot, operation: string, payload: Record<string, unknown> = {}): Promise<boolean> {
  try { return (await api.executeApp(computer.spec.id, manifest.id, operation, payload)).status === 'completed'; }
  catch { return false; }
}

export function Brand({ manifest }: { manifest: AppManifest }) {
  const platform = useContext(PlatformIconContext);
  const source = appIconSource(manifest, platform);
  return <div className="surface-brand">{source ? <Icon icon={source} width={28} height={28}/> : <span>{manifest.name[0]}</span>}<b>{manifest.name}</b></div>;
}

export function Rail({ manifest, items, active = 0, onSelect }: { manifest: AppManifest; items: string[]; active?: number; onSelect?(index: number): void }) {
  return <aside><Brand manifest={manifest}/>{items.map((item, index) => <button key={item} className={index === active ? 'active' : ''} onClick={() => onSelect?.(index)}>{item}</button>)}</aside>;
}
