import type { AppManifest, OSKind } from '@seed/protocol';
import { ecosystemApplications } from './definitions/ecosystem.js';
import { systemApplications } from './definitions/system.js';

export { ecosystemApplications } from './definitions/ecosystem.js';
export { systemApplications } from './definitions/system.js';
export { app, allOperatingSystems, type CatalogAppInput } from './factory.js';

export const appCatalog: AppManifest[] = [...systemApplications, ...ecosystemApplications];

export function appsForOS(os: OSKind): AppManifest[] {
  return appCatalog.filter((manifest) => manifest.supportedOS.includes(os));
}

export function systemAppsForOS(os: OSKind): AppManifest[] {
  return appsForOS(os).filter((manifest) => manifest.system);
}

export function catalogApp(id: string): AppManifest | undefined {
  return appCatalog.find((manifest) => manifest.id === id);
}
