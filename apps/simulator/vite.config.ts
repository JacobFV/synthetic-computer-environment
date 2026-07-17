import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const iconSources: Record<string, string> = {
  folder: 'fluent-color:document-folder-24', settings: 'fluent-color:settings-48', notes: 'fluent-color:document-text-48',
  preview: 'fluent-color:document-48', calendar: 'fluent-color:calendar-48', mail: 'fluent-color:mail-48',
  appstore: 'logos:apple-app-store', store: 'fluent-color:apps-48', chromium: 'logos:chrome', slack: 'logos:slack-icon',
  teams: 'logos:microsoft-teams', chatgpt: 'logos:openai-icon', vscode: 'logos:visual-studio-code', wireshark: 'simple-icons:wireshark',
  safari: 'logos:safari', edge: 'logos:microsoft-edge', messages: 'fluent-color:chat-48', facetime: 'fluent-color:video-48',
  music: 'logos:spotify-icon', maps: 'logos:google-maps', reminders: 'fluent-color:clipboard-task-24', paint: 'fluent-color:paint-brush-32',
  snipping: 'fluent-color:camera-24', taskmanager: 'fluent-color:apps-list-detail-32', outlook: 'fluent-color:mail-multiple-32',
  systemmonitor: 'fluent-color:apps-list-32', updater: 'fluent-color:arrow-sync-24', document: 'fluent-color:document-48',
  packages: 'fluent-color:apps-48', firefox: 'logos:firefox', github: 'logos:github-icon', gitkraken: 'logos:gitkraken',
  docker: 'logos:docker-icon', postman: 'logos:postman-icon', figma: 'logos:figma', notion: 'logos:notion-icon',
  linear: 'logos:linear-icon', discord: 'logos:discord-icon', zoom: 'logos:zoom-icon', spotify: 'logos:spotify-icon',
  obsidian: 'logos:obsidian-icon', vlc: 'simple-icons:vlcmediaplayer', blender: 'logos:blender', gimp: 'simple-icons:gimp',
  libreoffice: 'simple-icons:libreoffice', audacity: 'simple-icons:audacity', steam: 'logos:steam', bitwarden: 'simple-icons:bitwarden',
  onepassword: 'simple-icons:1password', cursor: 'simple-icons:cursor', dbeaver: 'simple-icons:dbeaver',
};

function selectedIcons() {
  const sets = Object.fromEntries(['logos', 'fluent-color', 'simple-icons'].map((prefix) => [prefix, JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), 'utf8'))]));
  return Object.fromEntries(Object.entries(iconSources).map(([key, source]) => {
    const [prefix, name] = source.split(':');
    const set = sets[prefix!] as { width?: number; height?: number; icons: Record<string, { body: string; width?: number; height?: number }> };
    const icon = set.icons[name!];
    if (!icon) throw new Error(`missing iconify source ${source}`);
    return [key, { ...icon, width: icon.width ?? set.width, height: icon.height ?? set.height }];
  }));
}

export default defineConfig({
  plugins: [{ name: 'selected-app-icons', resolveId(id) { return id === 'virtual:app-icons' ? '\0virtual:app-icons' : undefined; }, load(id) { return id === '\0virtual:app-icons' ? `export default ${JSON.stringify(selectedIcons())}` : undefined; } }, react()],
  root: new URL('.', import.meta.url).pathname,
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: { port: 4317 },
});
