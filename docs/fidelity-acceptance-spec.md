# Fidelity acceptance specification

This document defines what “high fidelity” means for the browser-native computer ecosystem. A recognizable screenshot is not sufficient. Each surface must agree with the same underlying state model, behave like its role model, and remain honest about the boundary between deterministic simulation and native execution.

## Four independent fidelity axes

1. **Platform fidelity** — window frame, launcher, task switching, focus, z-order, resize, maximize, menus, notifications, typography, and input conventions match the host OS.
2. **Product fidelity** — an app has its own information architecture, vocabulary, primary workflows, empty/loading/error states, keyboard behavior, and visual hierarchy. A generic “recent items” template is a failure even when the icon and title are correct.
3. **System fidelity** — visible actions mutate typed kernel objects: files, processes, sockets, packages, repositories, peripherals, or remote service records. Reloading another client must reconstruct the same state.
4. **Ecosystem fidelity** — clients talk to the correct independent services. Slack clients synchronize through a Slack service; Teams clients synchronize through a Teams service. Similar products do not silently share databases or messages.

## Application acceptance contract

Every installed `AppManifest` must resolve to an explicit product profile with:

- a unique visual identity and icon source;
- app-specific navigation and primary content;
- at least one meaningful read workflow;
- at least one meaningful write/action workflow;
- declared file, process, peripheral, package, repository, or network side effects;
- loading, empty, success, and failure states appropriate to the product;
- persistence across snapshot refresh;
- OS-specific window integration without replacing the app’s own chrome;
- trajectory events that name the product action rather than a generic click.

Category-level components are acceptable only when the role model genuinely shares a product family. Styling one generic component with a different accent color is not.

## Service-topology invariants

- `slack.seed.local` owns Slack workspaces, channels, memberships, messages, threads, reactions, and unread state.
- `teams.seed.local` owns Microsoft 365 tenants, teams, channels, chats, meetings, posts, replies, and unread state.
- `messages.seed.local`, `discord.seed.local`, and other communication products own independent datasets.
- A client may only read or mutate its product’s service unless an explicit, user-configured integration exists and is visible in both products.
- Cross-device evidence must show two clients of the **same** service when proving synchronization.
- Network traces must identify the actual service hostname, protocol, source computer, destination computer, socket, and request/response operation.

## Screenshot audit: release v0.2 defects

### Platform chrome

- Windows app icons were expanded into large floating rounded squares at the upper-left of windows. The correct standard title bar is 32 px high with a 16 px icon, 16 px inset, and full-bleed caption-button hit regions.
- The Windows maximize glyph used a diagonal expand icon instead of the Windows maximize/restore glyph pair.
- Windows active/inactive states were visually indistinguishable, and title-bar content did not blend with app chrome.
- The macOS menu bar always said Finder, even when another application was frontmost.
- The macOS Apple menu was represented by a plain dot.
- Ubuntu’s top-bar application label clipped (“Acs”), indicating incorrect width/stacking behavior.
- Maximize bounds and desktop work areas did not consistently respect the menu bar, taskbar, or Ubuntu dock.
- Several launcher icons had an additional white rounded tile around an icon that already supplied its own container.

### Native applications

- Finder, File Explorer, and GNOME Files shared one filesystem layout and vocabulary despite different toolbars, paths, sidebars, view controls, and navigation models.
- Safari, Edge, Chromium, and Firefox shared one browser chrome and one new-tab page.
- App Store, Microsoft Store, and Ubuntu App Center shared one store layout.
- Settings used one layout across all operating systems.
- Paint opened a generic four-card metadata page instead of a canvas with tools, palette, layers, and image state.
- LibreOffice opened a generic document list instead of a Start Center/editor workflow.
- Calendar, Mail, Photos, Calculator, Preview, Messages, FaceTime, Music, Maps, Reminders, Notepad/TextEdit, Snipping Tool, Outlook, Software Updater, Document Viewer, and Rhythmbox lacked product-specific workflows.

### Ecosystem applications

- Slack and Teams shared one `collab.seed.local` dataset and the same message layout. This falsely implied interoperability and erased each product’s service model.
- Visual Studio Code and Cursor were visually and functionally identical.
- GitHub Desktop and GitKraken exposed nearly identical repository views.
- Figma, Blender, and other design tools reused a generic canvas composition.
- Notion, Obsidian, Linear, and LibreOffice reused a generic “recent items” surface.
- Spotify, Music, Rhythmbox, VLC, Audacity, and Steam did not express their distinct library, playback, editing, or download models.
- Bitwarden and 1Password did not model locked/unlocked vault state and secure-item boundaries.
- Wireshark omitted the menu/toolbar, packet list/detail/bytes panes, interface capture state, and filter feedback.

### Evidence and research communication

- The 48-state grid mostly proved that 48 windows could be rendered, not that 48 workflows were in progress.
- Several frames were maximized blank-state applications, reducing evidence density.
- The Slack-to-Teams recording proved an incorrect bridge rather than legitimate multi-client synchronization.
- Slide language responded to development feedback (“now has…”) instead of explaining the system to an unfamiliar research audience.
- Claims emphasized requested features rather than causal evidence, acceptance criteria, and architectural boundaries.

## Evidence acceptance gates

The next evidence release must include:

- 48 independently captured desktops with varied multi-window arrangements, no required terminal, and visible work state;
- separate Slack→Slack and Teams→Teams synchronization recordings;
- a browser→DNS→socket→server→response recording with both endpoints visible;
- at least one file edit/save/reopen workflow;
- at least one app install whose receipt, installed files, launcher entry, and running process can all be observed;
- at least one package-manager and Git workflow whose GUI and VFS representations agree;
- interaction overlays that report actual pointer/keyboard events without asserting nonexistent protocol behavior;
- a researcher-facing deck that starts from the validity model and causal evidence, not from a changelog;
- a survey appendix that gives every application an individual product profile, core workflow, backing state, and known fidelity boundary.

## Non-claims

The current project may claim deterministic, typed domain semantics only where tests and recordings demonstrate them. It must not claim native Mach-O/PE/ELF execution, complete zsh/bash/PowerShell grammars, a universal third-party application ABI, or RFC-complete TCP/TLS behavior until those layers exist.
