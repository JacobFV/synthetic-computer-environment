import type { AppExecutionRecord, BrowserNavigationResponse, CollaborationMessage, CollaborationPollResult, CollaborationServiceId, DirectoryEntry, GatewayRule, InstalledApp, SimulationSnapshot, VirtualHttpResponse } from '@seed/protocol';

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
  terminateProcess: (computerId: string, pid: number) => request<{ terminated: boolean; servicesStopped: string[] }>(`/api/computers/${computerId}/processes/${pid}`, { method: 'DELETE' }),
  setGateway: (computerId: string, gatewayId: string, enabled: boolean) => request<GatewayRule>(`/api/computers/${computerId}/gateways/${gatewayId}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  install: (computerId: string, appId: string) => request<InstalledApp>(`/api/computers/${computerId}/apps/${appId}/install`, { method: 'POST', body: '{}' }),
  uninstall: (computerId: string, appId: string) => request<{ ok: true }>(`/api/computers/${computerId}/apps/${appId}`, { method: 'DELETE' }),
  executeApp: (computerId: string, appId: string, operation: string, payload: Record<string, unknown> = {}) => request<AppExecutionRecord>(`/api/computers/${computerId}/apps/${appId}/execute`, { method: 'POST', body: JSON.stringify({ operation, payload }) }),
  http: (computerId: string, url: string) => request<VirtualHttpResponse>(`/api/computers/${computerId}/http`, { method: 'POST', body: JSON.stringify({ url }) }),
  browserNavigate: (computerId: string, url: string) => request<BrowserNavigationResponse>(`/api/computers/${computerId}/browser/navigate`, { method: 'POST', body: JSON.stringify({ url }) }),
  collaboration: (computerId: string, serviceId: CollaborationServiceId, channelId: string, afterRevision = 0) => request<CollaborationPollResult>(`/api/computers/${computerId}/collaboration/${serviceId}/${channelId}?after=${afterRevision}`),
  collaborate: (computerId: string, serviceId: CollaborationServiceId, channelId: string, author: string, text: string) => request<CollaborationMessage>(`/api/computers/${computerId}/collaboration/${serviceId}/${channelId}`, { method: 'POST', body: JSON.stringify({ author, text }) }),
  action: (value: Record<string, unknown>) => request('/api/action', { method: 'POST', body: JSON.stringify(value) }),
};
