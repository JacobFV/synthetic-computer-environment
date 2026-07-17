# Mock-OS calibration notes

The simulator was compared against three browser desktop projects at pinned revisions. These projects are useful interaction references, but they are not treated as specifications; platform documentation and observable causal behavior take precedence.

| Project | Revision inspected | Useful calibration points | Constraints we do not inherit |
| --- | --- | --- | --- |
| [`JacobFV/macos-web-next`](https://github.com/JacobFV/macos-web-next) | `870d09e` | per-application Svelte surfaces; active-app menu bar; pointer-driven move/resize; traffic lights; dock hover/auto-hide; file-open registry; shared Finder/Terminal VFS | browser-local `localStorage` is the authority for windows and files; mock file bytes; one singleton window per app; application state is mostly local UI state |
| [`JacobFV/windows-web-next`](https://github.com/JacobFV/windows-web-next) | `9482039` | 14 px title-bar icons; correct maximize/restore glyphs; eight resize edges; drag-to-snap and snap-layout flyout; taskbar/start/search flyouts; explicit state snapshot bridge | in-browser VFS and persistence; app-specific decorative data; a UI bridge rather than a typed kernel boundary; no multi-host service fabric |
| [`PuruVJ/macos-preact`](https://github.com/PuruVJ/macos-preact) | `989f446` | spring-based dock magnification; roving tab focus; real pointer resize/drag; lazy app surfaces; menu/action-center composition | legacy React-Rnd geometry quirks; random initial placement; no server-backed VFS/process/network model; visual app approximations |
| [`DustinBrett/daedalOS`](https://github.com/DustinBrett/daedalOS) | `0df82d7` | broad file operations and associations; import/export; emulator and WASM application adapters; window previews; mature keyboard shortcuts | IndexedDB/BrowserFS is client authority; Windows-like shell is not a multi-OS fidelity model; broad app integrations do not automatically imply shared process/network causality |
| [`os-js/OS.js`](https://github.com/os-js/OS.js) | `0aa8744` | distribution-oriented package discovery; explicit application APIs; GUI, VFS, server, and window-manager package boundaries | a generic web desktop rather than macOS/Windows/GNOME behavior; its distribution model needs stronger typed computer/service topology for this project |
| [`copy/v86`](https://github.com/copy/v86) `2f1346b` and [`leaningtech/webvm`](https://github.com/leaningtech/webvm) `007fedb` | pinned 2026-07-16 | optional x86/Linux execution backends, real guest binaries, block-image adapters, and external-network gateways | too memory-heavy for every default trajectory worker; separate guest state would violate the single authoritative seed VFS unless integrated through an explicit executor/volume bridge |

## Adopted principles

1. All visible state changes originate in real DOM input events or explicit automation calls to those same DOM affordances.
2. Windows expose platform-correct title controls, pointer drag, eight-edge resize, focus, minimize, maximize/restore, close, and work-area clamping.
3. Windows 11 additionally exposes edge snap and a maximize-button snap layout; macOS exposes active-app menu semantics and dock affordances.
4. Launchers search both applications and VFS-backed files, and file activation resolves through registered associations.
5. Application surfaces are product-specific components with meaningful empty, active, loading, error, and completed states.
6. Evidence is captured from a real headless Chromium process via Playwright, not assembled from design mockups.
7. Expensive emulators are optional executor gateways. The default deterministic runtime stays lightweight, while a task can opt into v86/WebVM/native execution when binary compatibility is the actual variable under study.

## Architecture corrections beyond the references

- The Node simulation process—not `localStorage`—owns computer memory, processes, sockets, services, package databases, app installation records, collaboration state, and the VFS path/inode table.
- Every disk payload is persisted under `.state/<run-id>/<computer>/<disk>/<inode-id>` and resolved through an explicit path table.
- An installed application includes code and metadata in the VFS. Trusted browser-native application code can execute against a scoped SDK; host execution is a separate default-deny gateway.
- Slack and Teams are independent client/server products with separate DNS names, state, revisions, and polling streams. They never share or bridge messages unless a separately modeled integration is installed.
- Shell, package-manager, Git, DNS, virtual HTTP/TCP, process, and file mutations all converge on the same kernel-owned state that graphical apps read.
- Every high-fidelity claim is paired with an executable test, UI audit, trajectory event, persistent state diff, packet trace, or Playwright recording.

## Calibration rule

If a reference implementation conflicts with the current Apple, Microsoft, or GNOME interaction guidance, the platform guidance wins. If a surface looks convincing but its actions do not mutate shared kernel state, it is considered a screenshot mock and fails the release gate.
