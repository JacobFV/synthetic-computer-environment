import appIconData from 'virtual:app-icons';
import type { AppManifest, OSKind } from '@seed/protocol';
import { createContext } from 'react';

export const PlatformIconContext = createContext<OSKind | undefined>(undefined);

const platformIconOverrides: Partial<Record<`${OSKind}:${string}`, string>> = {
  'macos:settings': 'macossettings',
  'macos:textedit': 'macostextedit',
  'macos:calendar': 'macoscalendar',
  'macos:mail': 'macosmail',
  'windows:explorer': 'windowsfolder',
  'windows:settings': 'windowssettings',
  'windows:notepad': 'windowsnotepad',
  'windows:photos': 'windowsphotos',
  'windows:calculator': 'windowscalculator',
  'windows:calendar': 'windowscalendar',
  'windows:mail': 'windowsmail',
  'ubuntu:nautilus': 'ubuntufiles',
  'ubuntu:settings': 'ubuntusettings',
  'ubuntu:gedit': 'ubuntueditor',
  'ubuntu:calculator': 'ubuntucalculator',
  'ubuntu:calendar': 'ubuntucalendar',
  'ubuntu:mail': 'thunderbird',
};

export function appIconKey(app: Pick<AppManifest, 'id' | 'icon'>, os?: OSKind): string {
  return (os ? platformIconOverrides[`${os}:${app.id}`] : undefined) ?? app.icon;
}

export function appIconSource(app: Pick<AppManifest, 'id' | 'icon'>, os?: OSKind) {
  return appIconData[appIconKey(app, os)];
}
