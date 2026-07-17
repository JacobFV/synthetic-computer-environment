# seed computer ecosystem

A single-process, browser-rendered computer simulation runtime for collecting deterministic computer-use trajectories. It boots macOS-, Windows-, and Ubuntu-shaped computers over one typed kernel, gives them persistent virtual disks, process tables, stateful shell dialects, 20 package-manager families, VFS-backed Git, a shared DNS/service/collaboration fabric, policy-gated real-internet gateways, 60 manifest-backed applications, and headless displays.

![48 non-terminal macOS, Windows, and Ubuntu states](artifacts/evidence-v2/48-desktop-states-grid.png)

## run

Requirements: Node.js 24+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4317`.

Useful commands:

```bash
pnpm typecheck       # strict project-reference typecheck
pnpm test            # kernel integration tests
pnpm build           # production browser build
pnpm demo            # deterministic cross-computer contract + JSONL evidence
pnpm capture         # boot runtime and take real 1440×900 screenshots
pnpm capture:evidence # 48-state grid + four annotated interaction recordings
```

Set `SEED_RUN_ID` to resume a named disk state. Otherwise the server defaults to `run-{timestamp}`. Persistent files are stored at:

```text
.state/<run-id>/<computer>/<disk>/<inode-id>
.state/<run-id>/<computer>/file-table.json
```

## monorepo

```text
apps/
  simulator/          one Node runtime + Vite/React display client
  chatgpt-workspace/  supplied full-stack ChatGPT workspace clone v0.3.0
packages/
  protocol/           computer, app, inode, process, package, Git, socket, packet, gateway types
  kernel/             VFS, processes, shells, software/Git, network fabric, runtime, recorder
  catalog/            60 system and ecosystem application manifests
scripts/              deterministic demo and Playwright-compatible capture runner
tests/                vertical integration contracts
docs/                 architecture and technical report
```

## try it in a shell

Each terminal is stateful and selects zsh, PowerShell, or bash syntax from its computer spec.

```bash
nslookup appstore.seed.local
curl https://appstore.seed.local/apps/chatgpt | grep name
ping ubuntu-dev.seed.local
```

```powershell
Resolve-DnsName intranet.seed.local
iwr http://intranet.seed.local:8080/ | findstr nominal
Get-Process | findstr explorer
```

```bash
serve 8081 ~/site my-service.seed.local
ss
curl http://my-service.seed.local:8081/
```

The shell parser supports command sequencing, `&&`, pipelines, output redirection, environment expansion, filesystem commands, process commands, DNS/ping/HTTP/socket inspection, virtual server creation, app installation, and gateway inspection.

Package managers and Git mutate simulator state and write their receipts/objects into the virtual disk:

```bash
apt search nginx
apt install nginx
pnpm install typescript
git status
git add .
git commit -m "record package proof"
git log
```

Native manager families are `brew`; `winget`, `choco`, `scoop`; and `apt`, `snap`, `flatpak`. Language/project families are `npm`, `pnpm`, `yarn`, `pip`, `pipx`, `uv`, `cargo`, `go`, `gem`, `composer`, `dotnet`, and `conda`.

## evidence

- [technical report](docs/technical-report.md)
- [25-page app and fidelity survey](output/pdf/seed-computer-ecosystem-app-survey.pdf)
- [48-state evidence grid](artifacts/evidence-v2/48-desktop-states-grid.png)
- [macOS Slack → Windows Teams recording](artifacts/evidence-v2/recordings/cross-device-collaboration-live.mp4)
- [Windows browser → Ubuntu packet trace recording](artifacts/evidence-v2/recordings/windows-to-ubuntu-network-live.mp4)
- [Windows native window-management recording](artifacts/evidence-v2/recordings/windows-window-management.mp4)
- [package-manager + Git recording](artifacts/evidence-v2/recordings/package-manager-and-git.mp4)
- [demo evidence](artifacts/evidence/demo-run.json)
- [trajectory JSONL](artifacts/evidence/demo-trajectory.jsonl)

## fidelity contract

This is a behavioral simulator, not CPU emulation or a VM. The implemented contract is real inside the simulator: VFS mutations persist as inode blobs; processes, packages, repositories, sockets, packets, and messages are typed state; virtual services route between computers; app and package installation write to the VFS; and interactions export as JSONL. It does **not** execute Mach-O/PE/ELF binaries, reproduce production syscalls, provide complete shell grammars, or implement RFC-complete TCP/TLS and arbitrary third-party application ABIs. See the report for the exact boundary and extension plan.
