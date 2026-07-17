# Shell, Git, and package-manager coverage

This document is the executable contract of the current simulator implementation. It was audited directly against:

- `packages/kernel/src/shell.ts` — tokenization, composition, built-ins, aliases, and process lifecycle;
- `packages/kernel/src/software.ts` — package normalization, VFS effects, Git state, and remote transport;
- `packages/kernel/src/vfs.ts` and `packages/kernel/src/network.ts` — path, server, DNS, socket, and HTTP effects;
- `packages/protocol/src/index.ts` — the 25-member `PackageManagerKind` union and persisted record shapes;
- `packages/os-*/src/index.ts` — declared OS profiles; and
- `tests/kernel.integration.test.ts` — the behaviors that have direct integration-test evidence.

It intentionally describes the implemented subset, including divergences from real zsh, bash, PowerShell, Git, and vendor package managers. Examples in this document are not promises of unimplemented syntax.

## 1. Shell architecture and grammar

The three interactive computers are assigned these sessions:

| Computer | Session label | Initial working directory | Prompt form |
|---|---|---|---|
| macOS | `zsh` | `/home/agent` | `agent@mac-studio:~$ ` |
| Windows | `powershell` | `/C/Users/agent` | `PS C:\Users\agent> ` |
| Ubuntu | `bash` | `/home/agent` | `agent@ubuntu-dev:~$ ` |

These are not three independent language parsers. All three sessions use the same `ShellSession` tokenizer and case-insensitive command dispatcher. The selected shell changes the prompt, initial computer/OS state, path display, and package-manager availability; it does not enable native zsh expansion, bash syntax, or a PowerShell AST. Consequently, POSIX spellings work on Windows and PowerShell aliases work on macOS and Ubuntu. Startup files declared by the OS profiles are metadata and are not evaluated.

Every dispatched command temporarily creates a process record named after the raw command with 1 MiB modeled memory. The process is removed in `finally`, including after errors. `serve` additionally creates a persistent `seed-httpd` child process.

### 1.1 Composition operators

| Syntax | Implemented semantics | Important boundary |
|---|---|---|
| whitespace | Separates unquoted tokens. | No shell-specific lexer or Unicode whitespace rules beyond JavaScript `\s`. |
| `'text'`, `"text"` | Removes matching quotes and preserves whitespace inside. A backslash inside either quote consumes and inserts the next character. | Quote characters do not nest. Unterminated quotes do not error. Backslash outside quotes is literal. |
| `;` | Splits the line into statements, left to right. Successful stdout is concatenated with newlines. | Splitting occurs before tokenization, so a quoted semicolon still splits. A command error returns immediately, so later `;` statements do **not** run after failure. |
| `&&` | Splits each statement into commands and advances only after success. | Splitting is textual and also occurs inside quotes. There is no `\|\|`. |
| `\|` | Feeds one command's stdout string to the next command as stdin. | Splitting is textual and occurs inside quotes. There are no file descriptors or streaming/back-pressure. Only commands that explicitly read `stdin` use it. |
| `> path` | Writes the final stdout of that pipeline segment to a VFS file and clears that segment's displayed stdout. | Single overwrite redirection only. No append (`>>`), input (`<`), stderr (`2>`), heredoc, or descriptor routing. A quoted `>` is still parsed as redirection. |
| `$NAME` | Expanded from the session environment only by `echo`/`write-output`. | No general expansion, `${...}`, `$env:NAME`, assignment, command substitution, arithmetic, globbing, tilde-user syntax, or word splitting. |

The tokenizer has no syntax-error state. There are no functions, variables, aliases defined by the user, subshells, background jobs, control structures, script execution, executable lookup from the VFS, or native binaries. An unknown command returns exit code `127`; other failures return `1`; successful built-ins return `0`.

The environment is fixed at construction to `HOME`, `USER`, `USERNAME`, `HOSTNAME`, `SHELL`, and `PATH`. `env`/`set` prints it but does not mutate it. `history` stores each non-empty input line once, before execution; it does not store each pipeline component separately.

### 1.2 Complete built-in and alias table

All spellings below are case-insensitive on all three session types.

#### Files, text, and navigation

| Operation | Accepted spellings | Exact modeled behavior |
|---|---|---|
| help | `help`, `get-help` | Prints the simulator's static command-family summary and the OS-available package-manager names. No per-command help. |
| clear | `clear`, `cls` | Returns the terminal reset sequence `ESC c`. The current React terminal appends that string like other stdout; it does not maintain a terminal-emulator screen buffer. |
| current directory | `pwd`, `get-location` | Prints a display-form path: `~` under the home directory and backslashes/`C:` on Windows. |
| change directory | `cd [path]`, `set-location [path]` | Resolves `~`, `~/...`, relative paths, `/...`, and canonical Windows drive paths through the VFS. Defaults to `HOME`; target must be a directory. |
| list | `ls [options] [path]`, `dir ...`, `get-childitem ...` | Uses the first argument not beginning with `-`, default `.`. Lists one directory level as mode, byte size, and name; directories sort before files. Options are ignored. |
| read | `cat [path]`, `type [path]`, `get-content [path]` | Reads one UTF-8 VFS file. With no path, returns pipeline stdin unchanged. Multiple file operands are not supported. |
| write text | `echo ...`, `write-output ...` | Joins operands with one space and expands `$NAME` from the fixed environment. Ignores stdin. Use `>` for a VFS write. |
| create directories | `mkdir path...`, `md path...` | Recursively creates every operand as a VFS directory. Flags are **not** filtered and therefore become path operands. |
| create empty file | `touch path`, `new-item ... path` | Requires at least one operand and writes an empty file at the **last** operand. Earlier operands/options have no effect except determining the last token. Existing file content is truncated. |
| remove | `rm ...`, `del ...`, `erase ...`, `remove-item ...` | Removes each non-flag operand recursively from the VFS. Missing paths are no-ops. |
| filter stdin | `grep ... pattern`, `findstr ... pattern`, `select-string ... pattern` | Case-insensitive substring filter over stdin lines. The last operand is the pattern; files and regular expressions are not supported. |
| measure stdin | `wc`, `measure-object` | Prints three integers: JavaScript `stdin.split('\n').length`, whitespace-delimited non-empty word count, and UTF-16 string length. Flags are ignored. |

#### Processes, identity, and session state

| Operation | Accepted spellings | Exact modeled behavior |
|---|---|---|
| process list | `ps`, `tasklist`, `get-process` | Prints PID, PPID, rounded KiB, state, and executable from the computer's modeled process table. The transient listing command is itself present while the table is read. |
| terminate | `kill ...`, `taskkill ...`, `stop-process ...` | Uses the first all-decimal operand as PID. PID 1 is protected; missing/protected PIDs fail. Other flags are ignored. |
| hostname | `hostname` | Prints the computer specification's hostname. |
| user | `whoami` | Prints `agent` on macOS/Ubuntu or `<hostname>\agent` on Windows. |
| Unix identity | `uname [-a]` | Prints `Seed`, or a fixed simulator kernel line with OS and Node host architecture for `-a`. Available on every OS. |
| Windows version | `ver` | Prints `Seed Microsoft Windows [Version 11.0.26100.4652]`. Available on every OS. |
| history | `history`, `get-history` | Prints numbered whole input lines. The history command itself is included because recording happens first. |
| environment | `env`, `set` | Prints fixed `KEY=value` entries. Assignment and mutation are not implemented. |
| time | `date`, `get-date` | Prints `new Date().toString()` from the simulation host at execution time. |

#### Network and ecosystem

| Operation | Accepted spellings | Exact modeled behavior |
|---|---|---|
| interface state | `ifconfig`, `ipconfig`, `ip addr` | Prints one modeled adapter with the computer IPv4 `/24`, gateway `10.42.0.1`, DNS `10.42.0.2`, and `UP`. Other `ip` subcommands are not recognized. |
| ICMP | `ping ... host` | Uses the last operand. A known virtual DNS name/IP emits one request and one reply trace and a fixed one-packet success report; unknown names return a diagnostic string with exit code 0. |
| DNS | `nslookup ... host`, `dig ... host`, `resolve-dnsname ... host` | Uses the last operand and resolves the simulator's A-record map. Success prints the virtual resolver and one address; missing record fails with `NXDOMAIN`. No record types/options. |
| HTTP(S) | `curl ... URL`, `wget ... URL`, `invoke-webrequest ... URL`, `iwr ... URL` | Selects the first operand matching an HTTP URL or host/path shape and calls `InternetFabric.request`. `-i` prepends status and response headers; other flags are ignored. Virtual targets route in memory; real targets require a matching enabled gateway. |
| sockets | `netstat`, `ss`, `get-nettcpconnection` | Prints all modeled socket records visible to that computer as protocol, local/remote endpoint, and state. Flags are ignored. |
| host a site | `serve [port] [file-or-directory] [hostname]` | Defaults to port `8080`, target `.`, and `<computer-hostname>.seed.local`. Spawns persistent `seed-httpd`, registers an HTTP virtual service/listener and DNS A record, and serves UTF-8 VFS content. Directory `/` maps to `index.html`; missing files return 404. There is no TLS, MIME table beyond `.html`, or routing framework. Shell `kill` removes the process record but currently leaves the service registered; the server-authoritative `terminateProcess` API removes both. |
| installed apps | `apps` | Lists installed app ID, version, and name from simulator state. Read-only. |
| app store | `store`, `store install APP_ID` | `store` lists catalog manifests compatible with the current OS. The exact lowercase subcommand `install` plus an ID calls application installation and writes its VFS package/receipt. Other operands fall back to listing. |
| gateway inspection | `gateway` | Lists gateway rules as `ALLOW`/`DENY`, protocols, hostname patterns, and ports. Read-only; policy mutation is exposed through kernel/server APIs, not shell syntax. |

#### Software entry points

| Entry point | Behavior |
|---|---|
| `git ...` | Dispatches the Git subset in section 2. |
| any OS-available package-manager spelling | Dispatches the normalizer and package state machine in section 3. |

Common commands that are **not** in the dispatcher include `cp`, `mv`, `head`, `tail`, `sed`, `awk`, `sort`, `find`, `chmod`, `chown`, `ln`, `printf`, `export`, `source`, `.`, `test`, `[`, `which`, `where`, `man`, `sudo`, `su`, `ssh`, `scp`, `tar`, `zip`, and native language runtimes. PowerShell short aliases such as `gci`, `gc`, `ni`, `ri`, `sls`, `gps`, and `spps`, and cmdlets such as `Set-Content`, `Out-File`, `Get-Command`, `Start-Process`, and `Start-Job`, are also not implemented. Their longer names are supported only when explicitly present in the table above.

## 2. Git coverage

Git is a typed VFS-backed model, not the native Git executable or Git object/pack protocol. Each repository has in-memory typed state plus visible `.git` metadata. The shared `git.seed.local` service exchanges JSON snapshots through the simulator's HTTPS fabric, producing DNS, socket, and packet evidence. It does not materialize commit trees into a worktree.

At computer initialization, the runtime creates `<home>/Projects/seed-ecosystem`, writes `README.md` and `package.json`, initializes `main`, stages both paths, and creates a `bootstrap seed ecosystem` commit.

### 2.1 Subcommands and side effects

| Form | Implemented parsing | Modeled side effects and result |
|---|---|---|
| `git init [path]` | First non-flag operand, default current directory. | Creates the VFS directory, replaces/creates a repository record on `main`, and writes `.git/HEAD`, `.git/config`, `.git/refs/heads/`, and `.git/index.seed.json`. Re-running at an existing root resets the typed record. |
| `git clone [url] [directory]` | First two non-flag operands. URL defaults to `https://git.seed.local/seed/example.git`; directory defaults to URL basename. | Creates the directory and a generated `README.md`, initializes metadata, and sets `origin`. For a URL containing `git.seed.local`, fetches remote commits/branches/refs through virtual HTTPS and selects `main` when present. Remote file trees are **not** checked out. Other URLs return simulated success without network transport. |
| `git status [--short\|-s]` | Only short flags are inspected. | Long form reports branch and staged paths or a clean tree. Short form prints every staged path as `A  path`. Unstaged modifications/deletions/untracked state are not calculated. |
| `git add TARGET...` | All non-flag operands; at least one required. | Explicit targets are added without existence checks. Target `.` replaces the index with every VFS path below the repo root—including directory entries—except paths containing `/.git/`. Writes `index.seed.json`. |
| `git commit [-m\|--message MESSAGE] [--allow-empty]` | Message is the token immediately following `-m`/`--message`, else `commit`. | Requires staged paths unless `--allow-empty`. Computes `treeDigest` from sorted **path names**, not file bytes; hashes previous head, message, digest, and timestamp with SHA-1; records fixed author `agent <agent@seed.local>`; advances the branch; clears staging; writes a JSON object at `.git/objects/<2>/<38>` and refreshes metadata. |
| `git log [--oneline]` | Only `--oneline` is inspected. | Prints all typed commits newest first, in compact or fixed multi-line format. No revision/range/path filtering. |
| `git branch` | No operand lists. First non-flag creates. `-d NAME`/`-D NAME` deletes. | New branch points to current head. Deletion rejects current/missing branch but does not enforce merge safety. State metadata is refreshed; stale deleted ref files are not explicitly removed. |
| `git switch BRANCH`, `git checkout BRANCH` | Last non-flag operand. `-c`/`-b` creates. | Changes typed current branch/head and metadata. Does not update worktree contents. |
| `git remote`, `git remote -v`, `git remote add NAME URL` | Exact `add` layout; otherwise `-v` or list. | Mutates typed remote map. Metadata is refreshed, but `.git/config` serializes only the `origin` URL. |
| `git fetch [REMOTE]` | First non-flag operand, default `origin`; branch operands are ignored. | For `git.seed.local`, fetches JSON snapshot, updates remote refs, and appends unseen commit records without changing local head/worktree. Other URLs return a success-shaped message without transport or state change. |
| `git pull [REMOTE]` | Same remote selection as fetch. | Performs fetch behavior, then assigns current branch/head to the remote branch head when different. It reports `Fast-forward`; there is no merge/rebase, ancestry check, index update, or worktree checkout. |
| `git push [REMOTE]` | Same remote selection; always pushes the current local branch and all local commit records. | For `git.seed.local`, sends the previously observed remote head as an optimistic expected head. The service returns 409 on a mismatched non-empty expected head, deduplicates commits by hash, and points the remote branch at the first (newest) sent commit. Local remote refs are updated. Other URLs return simulated success without transport. |
| `git diff` | No meaningful option parsing. | Emits one `new file mode 100644` stub per staged path, or empty output. It never diffs contents. |
| `git rev-parse --show-toplevel` | Checks only for that flag. | Prints repository root. Any other form prints current head, or literal `HEAD` for an unborn branch. |
| `git config --list` | Checks only for `--list`. | Prints fixed user name, email, and default branch. Other forms return empty success and do not mutate configuration. |
| any other `git SUBCOMMAND` | — | Returns a one-line supported-subcommand list with shell exit code 0. |

### 2.2 VFS metadata contract

| Path | Contents |
|---|---|
| `.git/HEAD` | `ref: refs/heads/<current>` |
| `.git/config` | Fixed core stanza plus current `origin` URL only. |
| `.git/refs/heads/<branch>` | Head hash when the branch is not unborn. |
| `.git/refs/remotes/<remote>/<branch>` | Last fetched/pushed remote hash. |
| `.git/index.seed.json` | JSON snapshot of staged paths, commit records, branches, and remote refs. |
| `.git/objects/<hash[0:2]>/<hash[2:]>` | JSON `GitCommitRecord`; no compressed Git object, tree, blob, pack, or index format. |

## 3. Package-manager coverage

`PackageManagerKind` contains exactly 25 canonical families. Command spellings normalize to one of them, then OS availability is checked. The table below is the execution truth from `SoftwareEnvironment.managerSupport`; the OS profile declarations are descriptive metadata and are not consulted by dispatch.

The typed macOS, Windows, and Ubuntu profiles now use the same availability matrix as `SoftwareEnvironment`; the architecture checks reject undeclared workspace drift.

### 3.1 Machine-checkable availability and alias matrix

`yes` means the command is dispatched on that OS; `no` means it falls through to `command not found` in the shell.

| # | Canonical family | Accepted CLI spellings | macOS | Windows | Ubuntu |
|---:|---|---|:---:|:---:|:---:|
| 1 | `brew` | `brew` | yes | no | no |
| 2 | `mas` | `mas` | yes | no | no |
| 3 | `apt` | `apt`, `apt-get` | no | no | yes |
| 4 | `dpkg` | `dpkg` | no | no | yes |
| 5 | `snap` | `snap` | no | no | yes |
| 6 | `flatpak` | `flatpak` | no | no | yes |
| 7 | `winget` | `winget` | no | yes | no |
| 8 | `choco` | `choco`, `chocolatey` | no | yes | no |
| 9 | `scoop` | `scoop` | no | yes | no |
| 10 | `npm` | `npm` | yes | yes | yes |
| 11 | `pnpm` | `pnpm` | yes | yes | yes |
| 12 | `yarn` | `yarn` | yes | yes | yes |
| 13 | `bun` | `bun` | yes | yes | yes |
| 14 | `pip` | `pip`, `pip3` | yes | yes | yes |
| 15 | `pipx` | `pipx` | yes | yes | yes |
| 16 | `poetry` | `poetry` | yes | yes | yes |
| 17 | `uv` | `uv` | yes | yes | yes |
| 18 | `cargo` | `cargo` | yes | yes | yes |
| 19 | `go` | `go` | yes | yes | yes |
| 20 | `gem` | `gem` | yes | yes | yes |
| 21 | `composer` | `composer` | yes | no | yes |
| 22 | `dotnet` | `dotnet` | yes | yes | yes |
| 23 | `nuget` | `nuget` | yes | yes | yes |
| 24 | `vcpkg` | `vcpkg` | yes | yes | yes |
| 25 | `conda` | `conda`, `mamba` | yes | yes | yes |

Bootstrapped package records are `brew:{git,node,python@3.13}` on macOS, `winget:{Git.Git,OpenJS.NodeJS,Python.Python.3.13}` on Windows, and `apt:{git,nodejs,python3}` on Ubuntu. Bootstrap installs write receipts and the package database but do not create package transaction records.

### 3.2 Verb normalization

Flags are removed before verb/name parsing whenever a token starts with `-`. There is no manager-specific option grammar and no `--` terminator. A non-flag token that would be an option value remains and may become a package name.

| Input verb | Canonical operation | Notes |
|---|---|---|
| `install`, `add`, `require` | install | `pnpm add`, `yarn add`, `bun add`, `poetry add`, and `composer require` are therefore covered by the same operation. |
| `remove`, `uninstall`, `delete` | remove | Removes only the located direct record; dependency garbage collection is not modeled. |
| `list`, `ls`, `freeze` | list | Lists installed records belonging to that canonical manager. |
| `search`, `find` | search | Case-insensitive substring search of the manager's fixed catalog. Empty query lists the full catalog. |
| `info`, `show`, `view` | info | Returns an installed record as JSON when located; otherwise returns a deterministic available version/source. |
| `upgrade` | package update | Updates installed matching records to deterministic `:updated` versions and rewrites receipts. |
| `update` on `apt`, `brew`, `winget`, `choco`, `scoop` | index refresh | Writes `<package-db>.indexes/<manager>.json` and records `index-refresh`. |
| `update` on every other manager | package update | Same effect as `upgrade`. |
| `outdated` | outdated report | Computes deterministic newer version strings without mutation. |
| missing verb | list | Every manager defaults to list when there is no first non-flag token. |
| unknown verb | list, except `go` | Unrecognized syntax silently becomes list. For `go`, an unknown token sequence defaults to install. |

Manager-specific preprocessing:

- `dpkg -i NAME` forces install; `-i` itself is removed, and names begin with the first remaining token.
- `dotnet tool ...` removes the leading `tool` token before verb parsing.
- `uv tool ...` and `uv pip ...` remove the leading mode token before verb parsing.
- `pnpm add`, `yarn add`, `bun add`, `poetry add`, and `composer require` explicitly map to install (also implied by the global alias table).
- If the first `go` token contains `@`, the parser changes the verb to install but then consumes that token as if it were a verb. Thus `go install PACKAGE@VERSION` is the reliable supported form; bare `go PACKAGE@VERSION` currently installs the fallback `default-package`, not that token.

An install with no remaining names installs `workspace-dependencies` for `npm`, `pnpm`, or `yarn`, and `default-package` for every other manager. Installation accepts arbitrary names; catalog membership is not required.

Scope normalization is likewise shared rather than vendor-specific:

- `brew`, `mas`, `apt`, `dpkg`, `snap`, `flatpak`, `winget`, `choco`, and `scoop` are always `system` scope.
- `npm`, `pnpm`, `yarn`, `bun`, `poetry`, `composer`, `nuget`, and `vcpkg` default to `project` scope.
- `pip`, `pipx`, `uv`, `cargo`, `go`, `gem`, `dotnet`, and `conda` default to `user` scope.
- `-g` or `--global` forces the record's scope to `system` for any manager. `--user` is discarded but does not otherwise alter the above defaults.

Operation state transitions are shared across all managers:

| Canonical operation | Exact state behavior |
|---|---|
| list | Filters current `PackageRecord`s to the canonical manager and prints name, version, and scope. Empty result is a manager-specific `no ... packages installed` message. |
| search | Joins remaining name tokens with spaces, performs catalog substring matching, and computes deterministic available versions. No state changes. |
| info | Looks for the first name in the current project before a non-project record. Installed packages return their full JSON record; absent packages return deterministic registry metadata. No state changes. |
| install | Recursively installs only the hard-coded dependency edges in section 3.5, writes one JSON marker per record, updates the package map/database, regenerates supported project metadata, and records one top-level `install` transaction. That transaction names requested packages/receipts, not recursively added dependencies. Reinstall is idempotent at the record level but still produces the top-level committed transaction; a transitive record requested directly is reclassified as direct. |
| remove | Locates the current-project record before a non-project record, removes its install path and record, regenerates supported project metadata, persists the database, and records `remove` only when at least one record was found. Dependencies are not removed. |
| index refresh | Writes the fixed catalog and timestamp to `<database>.indexes/<manager>.json` and records `index-refresh`. Package records are unchanged. |
| outdated | Reports deterministic hypothetical updated versions for every installed record of that manager. No state changes. |
| package update | With names, selects exact name matches; without names, selects all records for that manager. For project managers it includes records in the current project plus all non-project records, but excludes records from other projects. It rewrites versions/integrities/markers, regenerates supported project metadata, persists the database, and records `upgrade` when at least one record changed. |

### 3.3 Install targets, receipts, manifests, and lockfiles

Placeholders: `<home>` is `/home/agent` on macOS/Ubuntu and `/C/Users/agent` on Windows; `<cwd>` is the canonical current VFS directory; `<safe>` replaces `/` and `\` in a package name with `__`; `<version>` is a deterministic hash-derived semantic version.

| Manager | Install path | Receipt/marker written | Project metadata written after install/remove/update |
|---|---|---|---|
| `brew` | `/opt/homebrew/Cellar/<safe>/<version>` | `<install>/seed-package.json` | none |
| `mas` | `/Applications/<safe>.app` | `<install>/seed-package.json` | none |
| `apt` | `/usr/share/<safe>` | `<install>/seed-package.json` | none |
| `dpkg` | `/var/lib/dpkg/info/<safe>` | `/var/lib/dpkg/info/<safe>.list` | none |
| `snap` | `/snap/<safe>/current` | `<install>/seed-package.json` | none |
| `flatpak` | `/var/lib/flatpak/app/<safe>/active` | `<install>/seed-package.json` | none |
| `winget` | `/C/Program Files/<safe>` | `<install>/seed-package.json` | none |
| `choco` | `/C/Program Files/<safe>` | `<install>/seed-package.json` | none |
| `scoop` | `<home>/scoop/apps/<safe>/current` | `<install>/seed-package.json` | none |
| `npm` | project: `<cwd>/node_modules/<safe>`; global: `<home>/.local/lib/node_modules/<safe>` | `<install>/seed-package.json` | `<cwd>/package.json`; `<cwd>/package-lock.json` |
| `pnpm` | project: `<cwd>/node_modules/.pnpm/<safe>@<version>/node_modules/<safe>`; global: `<home>/.local/share/pnpm/global/<safe>` | `<install>/seed-package.json` | `<cwd>/package.json`; `<cwd>/pnpm-lock.yaml` |
| `yarn` | project: `<cwd>/.yarn/cache/<safe>`; global: `<home>/.config/yarn/global/<safe>` | `<install>/seed-package.json` | `<cwd>/package.json`; `<cwd>/yarn.lock` |
| `bun` | project: `<cwd>/node_modules/<safe>`; global: `<home>/.bun/install/global/node_modules/<safe>` | `<install>/seed-package.json` | `<cwd>/package.json`; `<cwd>/bun.lock` |
| `pip` | `<home>/.local/lib/python3.13/site-packages/<safe>` | `<install>/seed-package.json` | none |
| `pipx` | `<home>/.local/share/pipx/<safe>` | `<install>/seed-package.json` | none |
| `poetry` | `<cwd>/.venv/lib/python3.13/site-packages/<safe>` | `<install>/seed-package.json` | `<cwd>/pyproject.toml`; `<cwd>/poetry.lock` |
| `uv` | `<home>/.local/share/uv/<safe>` | `<install>/seed-package.json` | none |
| `cargo` | `<home>/.cargo/bin/<safe>` | the install path itself is a JSON marker file | none |
| `go` | `<home>/go/bin/<last-name-segment>` | the install path itself is a JSON marker file | none |
| `gem` | `<home>/.gem/ruby/3.4.0/gems/<safe>` | `<install>/seed-package.json` | none |
| `composer` | `<cwd>/vendor/<safe>` | `<install>/seed-package.json` | `<cwd>/composer.lock` only |
| `dotnet` | `<home>/.dotnet/tools/<safe>` | the install path itself is a JSON marker file | none |
| `nuget` | `<cwd>/packages/<safe>` | `<install>/seed-package.json` | `<cwd>/packages.lock.json` |
| `vcpkg` | `<cwd>/vcpkg_installed/<safe>` | `<install>/seed-package.json` | `<cwd>/vcpkg.json` |
| `conda` | `<home>/.local/lib/python3.13/site-packages/<safe>` | `<install>/seed-package.json` | none |

The package database is rewritten as JSON after install/remove/update at:

| OS | Package database |
|---|---|
| macOS | `/Library/Application Support/Seed/packages.json` |
| Windows | `/C/ProgramData/Seed/packages.json` |
| Ubuntu | `/var/lib/seed/packages.json` |

Index-refresh files live under `<database>.indexes/<manager>.json`, for example `/var/lib/seed/packages.json.indexes/apt.json`.

JavaScript lockfile details are deliberately normalized: pnpm emits a small YAML document with `lockfileVersion: '9.0'`; npm, Yarn, and Bun all emit JSON with `lockfileVersion: 3`, manager name, versions, and integrity fields. `package.json` contains only direct dependencies. Poetry writes a minimal TOML manifest and lock stanzas. Composer writes only `composer.lock`; NuGet and vcpkg write the files shown above.

Project-metadata regeneration is called even when `-g`/`--global` forced a project manager's record to `system` scope. Because only `project` records are selected for the generated dependency set, that global operation can create or rewrite an otherwise empty manifest/lockfile in `<cwd>`. Poetry, Composer, NuGet, and vcpkg retain their `<cwd>`-based install targets even when the record is labeled `system`.

`PackageRecord` contains UUID, name, deterministic version, manager, scope, install path, timestamp, receipt paths, `registry://<manager>/<name>` source, SHA-256 integrity, dependency names, and direct/transitive classification. This is metadata simulation: installers do not download archives, execute lifecycle scripts, expose native binaries, resolve semver constraints, or run vendor solvers.

Removal deletes every recorded receipt file and the install path, removes the record, refreshes project metadata when applicable, persists the package database, and records a committed transaction. Transitive dependencies remain installed. The integration suite explicitly covers the out-of-directory `dpkg` `.list` receipt so it cannot be orphaned.

Two managers can target the same marker path because keys include manager but paths do not: `winget`/`choco` share `/C/Program Files/<safe>`, and `pip`/`conda` share the Python site-packages target. Installing the same name through both overwrites the shared marker while retaining two typed package records. Also, promoting an existing transitive record to direct updates the in-memory map/database but does not rewrite that record's original marker file.

Transactions are held in simulation memory (maximum 300), exposed in snapshots, and have operations `index-refresh`, `install`, `remove`, or `upgrade`, timestamps, `committed` status, package names, and receipt paths. There is no implemented rollback transition and transaction history is not reloaded from the package database.

### 3.4 Fixed search catalogs

Search is a case-insensitive substring match over exactly these entries. Install and info are not restricted to them.

| Manager | Searchable entries |
|---|---|
| `brew` | `git`, `node`, `python@3.13`, `ripgrep`, `jq`, `ffmpeg`, `postgresql@17`, `redis`, `docker`, `gh` |
| `mas` | `497799835:Xcode`, `409183694:Keynote`, `409201541:Pages`, `409203825:Numbers` |
| `apt` | `git`, `curl`, `build-essential`, `python3`, `nodejs`, `ripgrep`, `jq`, `nginx`, `postgresql`, `redis-server` |
| `dpkg` | `git_2.48_amd64.deb`, `curl_8.14_amd64.deb`, `seed-agent_1.0_amd64.deb` |
| `snap` | `code`, `slack`, `spotify`, `postman`, `chromium`, `obsidian` |
| `flatpak` | `org.gimp.GIMP`, `org.blender.Blender`, `org.videolan.VLC`, `com.spotify.Client`, `md.obsidian.Obsidian` |
| `winget` | `Git.Git`, `Microsoft.VisualStudioCode`, `OpenJS.NodeJS`, `Python.Python.3.13`, `Docker.DockerDesktop`, `GitHub.cli`, `SlackTechnologies.Slack` |
| `choco` | `git`, `nodejs`, `python313`, `vscode`, `7zip`, `ripgrep`, `jq`, `docker-desktop` |
| `scoop` | `git`, `nodejs`, `python`, `ripgrep`, `jq`, `ffmpeg`, `gh` |
| `npm` | `typescript`, `vite`, `react`, `tsx`, `vitest`, `eslint`, `prettier`, `playwright`, `express` |
| `pnpm` | `typescript`, `vite`, `react`, `tsx`, `vitest`, `eslint`, `prettier`, `playwright`, `fastify` |
| `yarn` | `typescript`, `vite`, `react`, `next`, `jest`, `eslint`, `prettier` |
| `bun` | `typescript`, `vite`, `react`, `elysia`, `hono`, `biome` |
| `pip` | `numpy`, `pandas`, `torch`, `transformers`, `fastapi`, `pytest`, `ruff`, `jupyterlab` |
| `pipx` | `poetry`, `black`, `ruff`, `httpie`, `cookiecutter` |
| `poetry` | `numpy`, `pandas`, `fastapi`, `pydantic`, `httpx`, `pytest` |
| `uv` | `ruff`, `fastapi`, `pytest`, `numpy`, `torch`, `transformers` |
| `cargo` | `ripgrep`, `fd-find`, `bat`, `cargo-watch`, `wasm-pack`, `just` |
| `go` | `golang.org/x/tools/gopls`, `github.com/go-delve/delve/cmd/dlv`, `github.com/golangci/golangci-lint/cmd/golangci-lint` |
| `gem` | `rails`, `bundler`, `rake`, `rubocop`, `jekyll` |
| `composer` | `laravel/installer`, `phpunit/phpunit`, `symfony/console` |
| `dotnet` | `dotnet-ef`, `dotnet-format`, `dotnet-outdated-tool` |
| `nuget` | `Newtonsoft.Json`, `Microsoft.EntityFrameworkCore`, `Serilog`, `xunit` |
| `vcpkg` | `boost`, `fmt`, `openssl`, `sqlite3`, `curl`, `zlib` |
| `conda` | `numpy`, `scipy`, `pandas`, `pytorch`, `jupyterlab`, `cudatoolkit` |

### 3.5 Modeled dependency edges

Only the following names currently have dependency expansion; every other package has an empty dependency list. Dependencies are installed first with the same scope and marked `transitive`. A later direct request upgrades that record's classification to `direct`.

| Manager/package | Direct modeled dependencies |
|---|---|
| `apt nginx` | `libc6`, `libpcre2-8-0`, `zlib1g` |
| `apt nodejs` | `libc6`, `libnode` |
| `apt postgresql` | `libpq5`, `postgresql-common` |
| `brew node` | `brotli`, `c-ares`, `icu4c`, `libuv`, `openssl@3` |
| `brew git` | `gettext`, `pcre2` |
| `npm vite` | `esbuild`, `rollup` |
| `npm react` | `loose-envify` |
| `npm playwright` | `playwright-core` |
| `pnpm vite` | `esbuild`, `rollup` |
| `pnpm react` | `loose-envify` |
| `pnpm fastify` | `avvio`, `find-my-way` |
| `pip transformers` | `numpy`, `packaging`, `requests`, `tokenizers` |
| `pip pandas` | `numpy`, `python-dateutil`, `pytz` |
| `pip fastapi` | `pydantic`, `starlette` |
| `winget Docker.DockerDesktop` | `Microsoft.VCRedist.2015+.x64` |

## 4. Evidence and test status

The integration suite is a vertical proof of representative paths, not an exhaustive alias conformance suite.

| Test in `tests/kernel.integration.test.ts` | What it directly proves |
|---|---|
| `persists virtual files as inode blobs with a path table` | `echo ... > path`, canonical path mapping, inode-backed host blob bytes, and VFS content verification. |
| `uses separate shell dialects over one typed kernel` | A zsh-labeled `ps \| grep`, PowerShell-labeled `Get-Process \| findstr`, and bash-labeled `curl \| grep`; thus common alias dispatch, pipelines, process state, and virtual HTTP. |
| `installs software through native and language package managers into the vfs` | Representative `brew install`, `winget install`, `apt install`, and `pnpm add`; package snapshot records and a Windows receipt path. |
| `writes dependency metadata, lockfiles, receipts, and committed package transactions` | `apt update` index refresh, project `pnpm add vite`, `package.json`, `pnpm-lock.yaml`, `esbuild`/`rollup` dependency edges, 64-hex integrity, and transaction operations. |
| `models git object storage ...` | Composed `mkdir; cd; git init; echo >; git add; git commit; git log`, typed commit state, and VFS object record. |
| `pushes and fetches commits through the shared Git ... service ...` | Virtual push, cross-computer clone/log, remote packet trace, and the intentional absence of copied remote worktree files. |

Run this evidence with:

```bash
pnpm test
```

Source-level exhaustiveness is additionally enforced by TypeScript where `catalogs` is a `Record<PackageManagerKind, string[]>`: adding a 26th canonical manager without a catalog is a type error. The availability map is keyed by every OS kind. This proves structural enumeration, not behavioral equivalence to real tools.

The current suite does **not** execute every alias, every one of the 25 manager families, every normalized verb, quote/operator edge cases, package removal/upgrade variants, or all Git branch/remote/error paths. Those rows are source-audited coverage, not test-covered claims. A release gate that requires per-row behavioral proof should generate table-driven tests from the availability/alias matrix and assert each VFS transaction described above.
