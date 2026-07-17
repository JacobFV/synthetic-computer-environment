import type { CollaborationMessage, DirectoryEntry, InstalledApp, SimulationSnapshot, VirtualHttpResponse } from '@seed/protocol';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? response.statusText);
  return value as T;
}

export const api = {
  state: () => request<SimulationSnapshot>('/api/state'),
  shell: (computerId: string, command: string) => request<{ stdout: string; stderr: string; exitCode: number; cwd: string; prompt: string }>(`/api/computers/${computerId}/shell`, { method: 'POST', body: JSON.stringify({ command }) }),
  prompt: (computerId: string) => request<{ prompt: string }>(`/api/computers/${computerId}/prompt`),
  files: (computerId: string, path?: string) => request<DirectoryEntry[]>(`/api/computers/${computerId}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  install: (computerId: string, appId: string) => request<InstalledApp>(`/api/computers/${computerId}/apps/${appId}/install`, { method: 'POST', body: '{}' }),
  http: (computerId: string, url: string) => request<VirtualHttpResponse>(`/api/computers/${computerId}/http`, { method: 'POST', body: JSON.stringify({ url }) }),
  collaborate: (computerId: string, channel: string, author: string, text: string) => request<CollaborationMessage>(`/api/computers/${computerId}/collaboration/${channel}`, { method: 'POST', body: JSON.stringify({ author, text }) }),
  action: (value: Record<string, unknown>) => request('/api/action', { method: 'POST', body: JSON.stringify(value) }),
};
