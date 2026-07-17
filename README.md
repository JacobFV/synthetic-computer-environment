# Seed Computer Ecosystem

Seed is a single-authority, browser-rendered computer ecosystem for computer-use research. One Node.js simulation process boots typed macOS 26, Windows 11 26H2, and Ubuntu 26.04 computers; owns their inode-backed disks, processes, applications, repositories, package databases, sockets, DNS, services, and gateways; and projects each display through a real Chromium page.

The 2026 reference seed contains four computers, three interactive desktops, eight independent services, 60 manifest-backed applications, 46 product-specific surface contracts, 25 package-manager families, VFS-backed Git, and a validated 48-workflow browser evidence suite. A terminal is an application, not a desktop requirement.

## Run

Requirements: Node.js 24+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4317`.

```bash
pnpm check:boundaries  # validate the workspace dependency graph
pnpm typecheck         # strict typecheck across every workspace
pnpm test              # vertical kernel/runtime integration suite
pnpm build:all         # production-build every deployable/package
pnpm audit:ui          # inspect every installed app in real Chromium
pnpm demo              # deterministic cross-computer contract + JSONL
pnpm capture:evidence  # workflow states, app atlas, icon walls, videos
pnpm manifest:evidence # hash and measure the release evidence
```

Set `SEED_RUN_ID` to resume a named world. Otherwise the server creates `run-<timestamp>`. Virtual disks use the requested inode-blob layout:

```text
.state/<run-id>/<computer>/file-table.json
.state/<run-id>/<computer>/<disk>/<inode-id>
```

## Monorepo authority map

The repository is a pnpm workspace scheduled by Turborepo. Packages are separated by authority so new OS profiles, app distributions, and ecosystem seeds do not accumulate in the simulator entry point.

```text
apps/
  simulator/          Node HTTP/WebSocket authority + React displays
  chatgpt-workspace/  supplied full-stack ChatGPT workspace clone
ecosystems/
  seed-2026/          concrete computers, services, apps, DNS, gateways
packages/
  protocol/           serializable cross-layer contracts
  app-sdk/            manifest, operation, and package-authoring SDK
  os-core/            operating-system profile contract
  os-macos/           macOS profile, services, paths, managers, system apps
  os-windows/         Windows profile
  os-ubuntu/          Ubuntu/GNOME profile
  catalog/            modular system and ecosystem app definitions
  kernel/             VFS, process, shell, software, Git, network, app runtime
  ui-surfaces/        product information architecture and interaction contracts
tooling/
  architecture/       boundary/cycle validation and graph generation
  evidence/           typed workflow plan and topology-install validation
scripts/              deterministic demos, capture, UI audit, local Git wrapper
tests/                vertical runtime contracts
docs/                 architecture, shell contract, fidelity spec, report
```

`@seed/kernel` consumes a generic serialized `SimulationTopology`; it does not import the reference ecosystem. `@seed/ecosystem-seed-2026` selects exact computers, OS profiles, installed app sets, independent services, DNS records, and gateway policy. See [docs/architecture.md](docs/architecture.md).

## Applications are VFS packages

Installing an application materializes its manifest, package metadata, platform registration, receipt, state directory, and executable Seed JavaScript entrypoint on that computer's virtual disk. Non-system bundles are loaded back from the VFS and executed through a restricted Node `vm` application runtime. Host process execution is a separate default-deny gateway.

The supplied ChatGPT workspace remains independently buildable under `apps/chatgpt-workspace`; the macOS desktop adapter gives it a native integrated title region and connects its operations to simulator VFS/network/application state.

## Shell, packages, and Git

The stateful zsh-, PowerShell-, and bash-labeled sessions implement command composition, pipelines, redirection, filesystem/process/DNS/HTTP/socket/application operations, software management, and a typed Git model. The exact accepted spellings, side effects, and explicit boundaries are documented in [docs/command-coverage.md](docs/command-coverage.md).

Native managers: `brew`, `mas`, `apt`, `dpkg`, `snap`, `flatpak`, `winget`, `choco`, `scoop`.

Language/project managers: `npm`, `pnpm`, `yarn`, `bun`, `pip`, `pipx`, `poetry`, `uv`, `cargo`, `go`, `gem`, `composer`, `dotnet`, `nuget`, `vcpkg`, `conda`.

```bash
apt update && apt install nginx
pnpm add vite
git add . && git commit -m "record causal proof"
serve 8081 ~/site my-service.seed.local
```

Package operations write install markers, receipts, dependency records, transaction records, and manager-appropriate manifests/lockfiles. Git writes visible `.git` refs, objects, config, and index metadata; the virtual `git.seed.local` service transports independent repository snapshots between computers.

## Virtual internet and gateways

The in-memory fabric supplies A-record DNS, per-computer loopback namespaces, listeners, sockets, HTTP routing, and causal TCP packet traces. Computers can host services for themselves or one another. Slack and Microsoft Teams are separate service planes with separate hosts, stores, revisions, and client operations—there is no implicit bridge.

Real HTTP(S) egress is disabled unless an enabled gateway rule matches protocol, hostname, port, and every resolved IPv4 address against the rule's CIDRs. Virtual destinations never escape through a host gateway.

## Evidence and reports

- [research technical report](docs/technical-report.md)
- [architecture contract](docs/architecture.md)
- [shell, Git, and package-manager coverage](docs/command-coverage.md)
- [UI fidelity acceptance specification](docs/fidelity-acceptance-spec.md)
- [v3 evidence manifest](artifacts/evidence-v3/evidence-manifest.json)
- [app and fidelity survey PDF](output/pdf/seed-computer-ecosystem-app-survey-v0.3.0.pdf)
- [research evidence deck](output/seed-computer-ecosystem-research-evidence-v0.3.0.pptx)

The evidence suite contains individual full-resolution workflow states, legible per-OS plates, one portrait for every catalog application, complete launcher/icon walls, a DOM geometry audit, runtime snapshots/trajectories, and paired MP4 recordings with visible pointer/keyboard event overlays.

## Fidelity contract

Seed provides real browser execution and real Node-side simulator/application code over typed, persistent computer semantics. It does not claim native Mach-O/PE/ELF execution, vendor application source code, CPU/MMU emulation, native syscalls, or RFC-complete operating systems and network protocols. Those boundaries are explicit in the technical report so evaluation can distinguish demonstrated causal fidelity from native-machine equivalence.

## Repository-local version history

This workspace uses a repository-local Git store so the complete history can ship inside the release archive even when the parent scratch checkout is immutable:

```bash
scripts/git-local.sh log --oneline --decorate
scripts/git-local.sh status --short
```
