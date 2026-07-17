import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const iconSources: Record<string, string> = {
  folder: 'fluent-color:document-folder-24', settings: 'fluent-color:settings-48', notes: 'fluent-color:document-text-48',
  preview: 'fluent-color:document-48', calendar: 'fluent-color:calendar-48', mail: 'fluent-color:mail-48',
  windowsphotos: 'fluent-color:image-48', windowscalendar: 'fluent-color:calendar-48', windowsmail: 'fluent-color:mail-48',
  windowssettings: 'fluent-color:settings-48', windowsnotepad: 'fluent-color:document-text-48', windowsfolder: 'fluent-color:document-folder-24',
  thunderbird: 'simple-icons:thunderbird',
  appstore: 'logos:apple-app-store', store: 'fluent-color:apps-48', slack: 'logos:slack-icon',
  teams: 'logos:microsoft-teams', chatgpt: 'simple-icons:openai', vscode: 'logos:visual-studio-code', wireshark: 'simple-icons:wireshark',
  safari: 'logos:safari', edge: 'logos:microsoft-edge', messages: 'fluent-color:chat-48', facetime: 'fluent-color:video-48',
  music: 'logos:spotify-icon', maps: 'logos:google-maps', reminders: 'fluent-color:clipboard-task-24', paint: 'fluent-color:paint-brush-32',
  snipping: 'fluent-color:camera-24', taskmanager: 'fluent-color:apps-list-detail-32', outlook: 'fluent-color:mail-multiple-32',
  systemmonitor: 'fluent-color:apps-list-32', updater: 'fluent-color:arrow-sync-24', document: 'fluent-color:document-48',
  packages: 'fluent-color:apps-48', firefox: 'logos:firefox', github: 'simple-icons:github', gitkraken: 'logos:gitkraken',
  docker: 'logos:docker-icon', postman: 'logos:postman-icon', figma: 'logos:figma', notion: 'logos:notion-icon',
  linear: 'simple-icons:linear', discord: 'logos:discord-icon', zoom: 'logos:zoom-icon', spotify: 'logos:spotify-icon',
  obsidian: 'logos:obsidian-icon', vlc: 'simple-icons:vlcmediaplayer', blender: 'logos:blender', gimp: 'simple-icons:gimp',
  libreoffice: 'simple-icons:libreoffice', audacity: 'simple-icons:audacity', steam: 'logos:steam', bitwarden: 'simple-icons:bitwarden',
  onepassword: 'simple-icons:1password', cursor: 'simple-icons:cursor', dbeaver: 'simple-icons:dbeaver',
};

// Small, selected, code-native product marks for roles where a shared generic
// glyph (or another vendor's logo) would be semantically wrong. Each body is
// deliberately self-contained so the browser never fetches icon assets.
const nativeProductIcons: Record<string, { width: number; height: number; body: string }> = {
  finder: {
    width: 64,
    height: 64,
    body: '<defs><linearGradient id="finder-left" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#72cdfb"/><stop offset="1" stop-color="#278bdd"/></linearGradient><linearGradient id="finder-right" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e9f8ff"/><stop offset="1" stop-color="#9fdcff"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="13" fill="url(#finder-left)"/><path fill="url(#finder-right)" d="M32 2h17a13 13 0 0 1 13 13v34a13 13 0 0 1-13 13H32V2Z"/><path d="M32 2v60M20 22v7M44 22v7M15 44c8 5 26 5 34 0" fill="none" stroke="#173e66" stroke-width="2.6" stroke-linecap="round"/><path d="M32 13c-1 10-5 17-11 22" fill="none" stroke="#173e66" stroke-width="2.3" stroke-linecap="round"/>',
  },
  terminal: {
    width: 64,
    height: 64,
    body: '<defs><linearGradient id="terminal-bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4d525b"/><stop offset="1" stop-color="#17191d"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="13" fill="url(#terminal-bg)" stroke="#838890" stroke-width="2"/><path d="m16 21 10 9-10 9M30 42h18" fill="none" stroke="#f7f9fa" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  photos: {
    width: 64,
    height: 64,
    body: '<rect x="2" y="2" width="60" height="60" rx="14" fill="#fff"/><g transform="translate(32 32)"><ellipse rx="7" ry="19" fill="#f04c52" transform="rotate(0) translate(0 -11)"/><ellipse rx="7" ry="19" fill="#f59636" transform="rotate(45) translate(0 -11)"/><ellipse rx="7" ry="19" fill="#f2cc3c" transform="rotate(90) translate(0 -11)"/><ellipse rx="7" ry="19" fill="#68b65a" transform="rotate(135) translate(0 -11)"/><ellipse rx="7" ry="19" fill="#31a8a7" transform="rotate(180) translate(0 -11)"/><ellipse rx="7" ry="19" fill="#438bd2" transform="rotate(225) translate(0 -11)"/><ellipse rx="7" ry="19" fill="#765bb9" transform="rotate(270) translate(0 -11)"/><ellipse rx="7" ry="19" fill="#c0529c" transform="rotate(315) translate(0 -11)"/><circle r="7" fill="#fff"/></g>',
  },
  calculator: {
    width: 64,
    height: 64,
    body: '<rect x="3" y="2" width="58" height="60" rx="13" fill="#3b3d42"/><rect x="9" y="8" width="46" height="14" rx="4" fill="#d6e0d5"/><g fill="#b8bbc0"><rect x="9" y="27" width="10" height="10" rx="3"/><rect x="22" y="27" width="10" height="10" rx="3"/><rect x="35" y="27" width="10" height="10" rx="3"/><rect x="9" y="40" width="10" height="10" rx="3"/><rect x="22" y="40" width="10" height="10" rx="3"/><rect x="35" y="40" width="10" height="10" rx="3"/></g><rect x="48" y="27" width="7" height="23" rx="3.5" fill="#f39b2f"/>',
  },
  chromium: {
    width: 64,
    height: 64,
    body: '<circle cx="32" cy="32" r="30" fill="#5b9fe8"/><path fill="#347fcf" d="M32 2a30 30 0 0 1 26 15H32a15 15 0 0 0-13 7.5L10.3 9.8A29.9 29.9 0 0 1 32 2Z"/><path fill="#77b5f1" d="M58 17a30 30 0 0 1-26 45l8.7-15A15 15 0 0 0 45 26.4Z"/><path fill="#438bd5" d="M32 62A30 30 0 0 1 10.3 9.8L19 24.5A15 15 0 0 0 32 47Z"/><circle cx="32" cy="32" r="15" fill="#eaf5ff"/><circle cx="32" cy="32" r="11" fill="#2877c8"/><circle cx="28.5" cy="28.5" r="4.5" fill="#8dc5f4"/>',
  },
  applemusic: {
    width: 64,
    height: 64,
    body: '<rect x="2" y="2" width="60" height="60" rx="14" fill="#fa3158"/><circle cx="20" cy="45" r="7" fill="#fff"/><circle cx="45" cy="39" r="7" fill="#fff"/><path fill="#fff" d="M25 18v27h4V25l20-4v18h4V12L25 18Z"/>',
  },
  rhythmbox: {
    width: 64,
    height: 64,
    body: '<rect x="3" y="3" width="58" height="58" rx="15" fill="#f4b942"/><circle cx="32" cy="32" r="22" fill="#2f3137"/><circle cx="32" cy="32" r="12" fill="#59606a"/><circle cx="32" cy="32" r="4" fill="#f4b942"/><path d="M38 15v21.5a6.5 6.5 0 1 1-4-6V18l14-3v16.5a6.5 6.5 0 1 1-4-6V14l-6 1Z" fill="#fff"/>',
  },
  applemaps: {
    width: 64,
    height: 64,
    body: '<rect x="2" y="2" width="60" height="60" rx="14" fill="#eef5ec"/><path fill="#7fc86a" d="M2 13 21 5l17 8 24-9v25l-24 9-17-8-19 8Z"/><path fill="#8ed0f2" d="m2 39 19-8 17 8 24-9v30H2Z"/><path fill="#f6f3df" d="m16 7 9-3 5 56-9 2Z"/><path fill="#fff" d="m38 5 8-3-3 60-9-3Z"/><path d="M9 48c9-15 18-4 26-18 5-8 7-13 17-18" fill="none" stroke="#ef4b50" stroke-width="4" stroke-linecap="round"/><circle cx="10" cy="48" r="4" fill="#286bd7" stroke="#fff" stroke-width="2"/>',
  },
  microsoftstore: {
    width: 64,
    height: 64,
    body: '<path fill="#fff" stroke="#c8cdd4" stroke-width="2" d="M8 19h48l-3 39H11L8 19Z"/><path fill="none" stroke="#626974" stroke-width="3" stroke-linecap="round" d="M22 20v-5a10 10 0 0 1 20 0v5"/><path fill="#f25022" d="M19 29h10v10H19z"/><path fill="#7fba00" d="M32 29h10v10H32z"/><path fill="#00a4ef" d="M19 42h10v10H19z"/><path fill="#ffb900" d="M32 42h10v10H32z"/>',
  },
  appcenter: {
    width: 64,
    height: 64,
    body: '<rect x="4" y="8" width="56" height="50" rx="13" fill="#e95420"/><path fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" d="M22 18a10 10 0 0 1 20 0"/><path fill="#fff" d="m32 22 15 26H17l15-26Zm0 9-6 11h12l-6-11Z"/>',
  },
  macossettings: {
    width: 64, height: 64,
    body: '<defs><linearGradient id="ms" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d9dde2"/><stop offset="1" stop-color="#7f8791"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="14" fill="url(#ms)"/><g fill="#f8fafc" transform="translate(32 32)"><path d="M-5-21h10l2 7 6 3 7-2 5 9-5 5v7l5 5-5 9-7-2-6 3-2 7H-5l-2-7-6-3-7 2-5-9 5-5V1l-5-5 5-9 7 2 6-3 2-7Z"/><circle r="10" fill="#7f8791"/><circle r="5"/></g>',
  },
  macostextedit: {
    width: 64, height: 64,
    body: '<defs><linearGradient id="mte" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#e8edf3"/></linearGradient></defs><rect x="6" y="3" width="48" height="58" rx="9" fill="url(#mte)" stroke="#cbd2db"/><path d="M16 18h28M16 27h24M16 36h20M16 45h17" stroke="#8e99a7" stroke-width="2.4" stroke-linecap="round"/><path fill="#2f8de4" d="m39 48 13-24 6 3-13 24-9 6 3-9Z"/><path fill="#bcdcff" d="m52 24 3-5 6 3-3 5Z"/>',
  },
  macosnotes: {
    width: 64, height: 64,
    body: '<rect x="2" y="2" width="60" height="60" rx="14" fill="#fff"/><path fill="#f7d250" d="M2 16V14A12 12 0 0 1 14 2h36a12 12 0 0 1 12 12v2H2Z"/><path stroke="#d9dce1" stroke-width="2" d="M12 27h40M12 37h40M12 47h31"/>',
  },
  macoscalendar: {
    width: 64, height: 64,
    body: '<rect x="2" y="2" width="60" height="60" rx="14" fill="#fff"/><path fill="#ef5148" d="M2 16V14A12 12 0 0 1 14 2h36a12 12 0 0 1 12 12v2H2Z"/><text x="32" y="48" text-anchor="middle" font-family="-apple-system,Arial" font-size="31" font-weight="500" fill="#202124">16</text>',
  },
  macosmail: {
    width: 64, height: 64,
    body: '<defs><linearGradient id="mm" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#66c7ff"/><stop offset="1" stop-color="#1680e5"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="14" fill="url(#mm)"/><rect x="10" y="17" width="44" height="31" rx="5" fill="#fff"/><path d="m11 20 21 16 21-16" fill="none" stroke="#1680e5" stroke-width="3" stroke-linejoin="round"/>',
  },
  windowscalculator: {
    width: 64, height: 64,
    body: '<rect x="4" y="4" width="56" height="56" rx="8" fill="#1570b8"/><rect x="12" y="11" width="40" height="12" rx="3" fill="#e8f4ff"/><g fill="#fff"><rect x="12" y="29" width="8" height="8" rx="2"/><rect x="24" y="29" width="8" height="8" rx="2"/><rect x="36" y="29" width="8" height="8" rx="2"/><rect x="12" y="41" width="8" height="8" rx="2"/><rect x="24" y="41" width="8" height="8" rx="2"/><rect x="36" y="41" width="8" height="8" rx="2"/><rect x="48" y="29" width="4" height="20" rx="2"/></g>',
  },
  ubuntufiles: {
    width: 64, height: 64,
    body: '<path fill="#7a4e9f" d="M5 15a8 8 0 0 1 8-8h15l6 7h17a8 8 0 0 1 8 8v27a8 8 0 0 1-8 8H13a8 8 0 0 1-8-8V15Z"/><path fill="#9b6fbd" d="M5 23h54v26a8 8 0 0 1-8 8H13a8 8 0 0 1-8-8V23Z"/><path d="M23 37h18" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  },
  ubuntusettings: {
    width: 64, height: 64,
    body: '<rect x="3" y="3" width="58" height="58" rx="15" fill="#4b4650"/><path d="M27 13h10l2 7 6 3 7-2 4 9-6 5v7l4 6-8 6-7-3-6 2-4 7-10-3-1-7-5-4-7 1-3-9 6-5v-7l-4-6 8-6 7 3 7-2 4-6Z" fill="#e8e5e9"/><circle cx="32" cy="35" r="9" fill="#4b4650"/><circle cx="32" cy="35" r="4" fill="#e95420"/>',
  },
  ubuntueditor: {
    width: 64, height: 64,
    body: '<rect x="5" y="4" width="48" height="56" rx="9" fill="#f8f7f5"/><path d="M16 19h28M16 29h24M16 39h28M16 49h18" stroke="#7b7780" stroke-width="3" stroke-linecap="round"/><path fill="#e95420" d="m42 48 13-24 6 4-13 24-9 5 3-9Z"/>',
  },
  ubuntucalculator: {
    width: 64, height: 64,
    body: '<rect x="5" y="4" width="54" height="56" rx="12" fill="#ece9e7"/><rect x="13" y="11" width="38" height="12" rx="3" fill="#4b4650"/><g fill="#6c6770"><circle cx="18" cy="32" r="5"/><circle cx="32" cy="32" r="5"/><circle cx="46" cy="32" r="5"/><circle cx="18" cy="46" r="5"/><circle cx="32" cy="46" r="5"/></g><circle cx="46" cy="46" r="5" fill="#e95420"/>',
  },
  ubuntucalendar: {
    width: 64, height: 64,
    body: '<rect x="4" y="6" width="56" height="54" rx="12" fill="#f8f7f5"/><path fill="#e95420" d="M4 19V17A11 11 0 0 1 15 6h34a11 11 0 0 1 11 11v2H4Z"/><text x="32" y="49" text-anchor="middle" font-family="Ubuntu,Arial" font-size="27" font-weight="600" fill="#4b4650">16</text>',
  },
};

function selectedIcons() {
  const sets = Object.fromEntries(['logos', 'fluent-color', 'simple-icons'].map((prefix) => [prefix, JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), 'utf8'))]));
  return { ...Object.fromEntries(Object.entries(iconSources).map(([key, source]) => {
    const [prefix, name] = source.split(':');
    const set = sets[prefix!] as { width?: number; height?: number; icons: Record<string, { body: string; width?: number; height?: number }> };
    const icon = set.icons[name!];
    if (!icon) throw new Error(`missing iconify source ${source}`);
    return [key, { ...icon, width: icon.width ?? set.width, height: icon.height ?? set.height }];
  })), ...nativeProductIcons };
}

export default defineConfig({
  plugins: [{ name: 'selected-app-icons', resolveId(id) { return id === 'virtual:app-icons' ? '\0virtual:app-icons' : undefined; }, load(id) { return id === '\0virtual:app-icons' ? `export default ${JSON.stringify(selectedIcons())}` : undefined; } }, react()],
  root: new URL('.', import.meta.url).pathname,
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: { port: 4317 },
});
