# E3-omnyssh: timhartmann7/omnyssh

Research subagent report for the architecture redesign. All sources read on 2026-10-29.
Gateway: pkgforge tinyfish (search + GitHub `gh api`). No fallback to built-in web tools was needed.

## 1. Findings

### F1. Repository identity and health

- **Claim:** timhartmann7/omnyssh is an actively maintained Rust workspace with 3 crates, 1247 stars, 71 forks, Apache-2.0, last push 2026-10-09, last release v1.1.5 published 2026-10-09T08:31:50Z.
- **Evidence:** `gh api repos/timhartmann7/omnyssh` -> `{"archived":false,"created_at":"2026-04-19T05:02:19Z","default_branch":"main","description":"Fast, open-source SSH client and server manager for macOS, Windows and Linux...","fork":false,"forks":71,"full_name":"timhartmann7/omnyssh","language":"Rust","license":"Apache-2.0","name":"omnyssh","open_issues_count":37,"pushed_at":"2026-10-09T08:23:10Z","size":3690,"stars":1247,...}`. `gh api repos/timhartmann7/omnyssh/releases` -> newest `{"name":"OmnySSH v1.1.5","prerelease":false,"published_at":"2026-10-09T08:31:50Z","tag_name":"v1.1.5"}`. `gh api repos/timhartmann7/omnyssh/commits?per_page=5` -> newest `{"date":"2026-10-09T08:10:05Z","msg":"chore(release): 1.1.5","sha":"06caf7e2"}`.
- **Label:** [verified]

### F2. Maturity: 12 tagged releases in ~6 months, roughly monthly cadence

- **Claim:** The project shipped v1.0.0 (2026-04-19) through v1.1.5 (2026-10-09), 12 releases, no prereleases, all published. Repo created 2026-04-19.
- **Evidence:** `gh api repos/timhartmann7/omnyssh/releases` -> tag_name/published_at sequence: v1.0.0 2026-04-19T05:44:10Z, v1.0.1 2026-04-22, v1.0.2 2026-05-20, v1.0.3 2026-05-21, v1.0.4 2026-06-07, v1.1.0 2026-07-24, v1.1.1 2026-07-31, v1.1.2 2026-08-22, v1.1.3 2026-09-27, v1.1.4 2026-09-28, v1.1.5 2026-10-09. (11 listed here plus the v1.0.5 referenced in the changelog.) All `prerelease:false, draft:false`.
- **Label:** [verified] for the 11 releases enumerated; the count "12" includes v1.0.5 which appears in CHANGELOG.md text but not in the `releases` API page I read.

### F3. Architecture: three-crate cargo workspace, frontend-agnostic core, two frontends

- **Claim:** `crates/omnyssh-core` is the engine with no UI dependencies; `crates/omnyssh` is the TUI binary `omny`; `crates/omnyssh-gui` is a Tauri 2 desktop app. Bare `cargo build` at the root builds core + TUI only.
- **Evidence:** root `Cargo.toml` -> `members = ["crates/omnyssh-core", "crates/omnyssh", "crates/omnyssh-gui"]`, `default-members = ["crates/omnyssh-core", "crates/omnyssh"]`, `version = "1.1.5"`, `rust-version = "1.89"`, `edition = "2021"`. `crates/omnyssh-core/src/lib.rs` -> `pub mod config; pub mod event; pub mod ssh; pub mod update; pub mod utils;` with the doc comment "Frontends ... depend on this crate and never the other way around: nothing here may depend on terminal-rendering, input, or CLI crates." `crates/omnyssh/Cargo.toml` -> `[[bin]] name = "omny"`. `crates/omnyssh-gui/Cargo.toml` -> `[[bin]] name = "OmnySSH"`, deps `tauri = { version = "2", features = ["specta", "tray-icon"] }`.
- **Label:** [verified]

### F4. There is NO server component and NO headless mode. This is a pure client.

- **Claim:** omnyssh contains no HTTP server, no daemon, no agent, no inbound listener other than local port-forward sockets. The `omny` CLI has exactly three flags and no subcommands.
- **Evidence:** `gh search code --repo timhartmann7/omnyssh "axum"` -> `[]`; `"warp"` -> `[]`; `"headless"` -> `[]`. `crates/omnyssh/src/cli.rs` -> only `--config`, `--theme`, `--verbose` (`#[derive(Parser)] struct Cli`). `crates/omnyssh/src/main.rs` -> `app::App::new(app_config); app.run().await`, no server branch. The only `TcpListener` uses are `crates/omnyssh-core/src/ssh/tunnel.rs` (local `ssh -L` forwards) and test/helper code in `crates/omnyssh-gui/src/state.rs`. `gh search code` for `"cloud sync"`, `"sync_server"`, `"RemoteServer"` -> all `[]`. `install.sh` contains no `systemd`/`systemctl`/`service`/`daemon` strings (grep returned nothing).
- **Label:** [verified]

### F5. No HTTP server framework anywhere in the dependency closure

- **Claim:** The lockfile (725 packages) contains no axum, actix-web, poem, tide or warp. `quinn` is present but is not a declared dependency of any of the three crates.
- **Evidence:** `gh api repos/timhartmann7/omnyssh/contents/Cargo.lock` piped through `grep -c '^\[\[package\]\]'` -> 725. `grep -E '^name = "(axum|actix-web|poem|tide|warp|...)"'` matched only crossterm, quinn, ratatui, reqwest, russh, russh-sftp, rustls, specta, tauri, vt100-omnyssh, webkit2gtk, x11-dl, zbus. The three `Cargo.toml` files I read in full declare none of axum/actix/poem/tide/warp/quinn.
- **Label:** [verified]

### F6. Data model for infrastructure objects: a `Host` struct in TOML, plus a read-only `~/.ssh/config` importer

- **Claim:** The host object is `Host` in `crates/omnyssh-core/src/ssh/client.rs`, persisted to `~/.config/omnyssh/hosts.toml` (platform-specific paths via `dirs`). Hosts are also imported from `~/.ssh/config`, which is read at startup and never written.
- **Evidence:** `crates/omnyssh-core/src/ssh/client.rs` -> `pub struct Host { name, hostname, user (default "root"), port (default 22), identity_file: Option<String>, identities_only: bool, password: Option<String>, proxy_jump: Option<String>, tags: Vec<String>, notes: Option<String>, source: HostSource, original_ssh_host, monitoring: MonitorMode, monitor_port: Option<u16>, local_forwards: Vec<LocalForward>, tunnel_autostart: bool, forward_agent: bool, key_setup_date, password_auth_disabled }`. `crates/omnyssh-core/src/config/mod.rs` -> `struct HostsFile { hosts: Vec<Host> }`, `load_hosts()` reads `platform::hosts_config_path()`. `crates/omnyssh-core/src/config/ssh_config.rs` doc comment: "The original file is **never modified**." README: "Your `~/.ssh/config` is read at startup and never written to."
- **Label:** [verified]

### F7. Metrics collection model: SSH exec of shell commands, one persistent session per host, 5 commands in parallel per cycle

- **Claim:** Metrics are gathered by running shell commands over a russh SSH session and parsing stdout with pure functions. One session per host is reused across polls.
- **Evidence:** `crates/omnyssh-core/src/ssh/pool.rs` -> `const CPU_CMD: &str = "env LC_ALL=C top -bn1 2>/dev/null | head -5"`; `MEM_CMD` = `free -b` with `vm_stat` then `sysctl` fallbacks; `DISK_CMD` = `env LC_ALL=C df -k /`; `UPTIME_CMD` = `env LC_ALL=C uptime`; loadavg = `cat /proc/loadavg`. `collect_metrics` runs them with `tokio::join!` on one `&SshSession`. Module doc: "Each host gets its own persistent tokio task that manages its SSH connection and collects metrics at a configurable interval." Default interval is 30 s (`GeneralConfig::default` -> `refresh_interval: 30`, `max_concurrent_connections: 10`) in `crates/omnyssh-core/src/config/app_config.rs`.
- **Label:** [verified]

### F8. The metrics parser module is a public, published, dependency-free library surface

- **Claim:** `omnyssh_core::ssh::metrics` is `pub mod metrics` and every parser is a `pub fn(&str) -> Option<f64>`. `omnyssh-core` is published on crates.io at 1.1.5. So the parsers are reachable as a library without pulling in any SSH or UI code beyond the crate itself.
- **Evidence:** `crates/omnyssh-core/src/ssh/mod.rs` -> `pub mod metrics;`. `metrics.rs` -> `pub fn parse_cpu_top`, `parse_cpu_top_macos`, `parse_cpu_proc_stat`, `parse_cpu_cp_time`, `parse_ram_free`, `parse_ram_vmstat`, `parse_ram_sysctl`, `parse_disk_df`, `parse_uptime`, `parse_loadavg`, `parse_loadavg_uptime`, `parse_top_processes`, `pub fn threshold_level`. `curl -qfsS https://index.crates.io/om/ny/omnyssh-core` -> `omnyssh-core 1.1.5 False` (not yanked); `omnyssh-core 1.1.3/1.1.4/1.1.5` present. README documents `cargo install omnyssh`.
- **Label:** [verified]

### F9. OS coverage encoded in the parsers: Linux procps-ng, busybox/Alpine, macOS, FreeBSD (incl. ZFS ARC and 32-bit counter wrap), decimal-comma locales

- **Claim:** The parser suite is a de-facto portability matrix. It handles BusyBox `top`, old `Cpu(s):  2.3%us` format, macOS `top -l 1 -n 0`, macOS `vm_stat` + `sysctl hw.memsize`, FreeBSD `kern.cp_time` two-sample delta with `rem_euclid(1 << 32)` for signed 32-bit counters, FreeBSD `sysctl` page counters counting free + inactive + bufspace + ZFS ARC above `c_min` as available, and a `normalize_decimal_commas` helper for comma-decimal locales.
- **Evidence:** `crates/omnyssh-core/src/ssh/metrics.rs` (32,218 bytes). Test names include `test_cpu_top_alpine_busybox`, `test_cpu_cp_time_32_bit_counters_wrap`, `test_ram_sysctl_freebsd_counts_the_arc_above_its_floor_as_available`, `test_loadavg_uptime` (comma case). Doc comment on `normalize_decimal_commas`: "Only a comma between two digits is a radix point".
- **Label:** [verified]

### F10. The `ps` top-processes command deliberately excludes the monitor's own PID chain

- **Claim:** The top-processes pipeline removes the shell (`$$`), its parent sshd (`$PPID`), and the grandparent sshd, by PID only, never by name, and caps output server-side at 3.
- **Evidence:** `pool.rs` -> `fn top_processes_command(ps_args: &str) -> String` builds `g=$(... ps -o ppid= -p $PPID ...); ... ps {ps_args} | awk -v s=$$ -v p=$PPID -v g="$g" '$1!=s && $1!=p && $1!=g && $2!=s && $2!=p && !($2==0 && $5=="idle") ...' | head -n 3`. Doc comment: "Filtering is by PID only, never by process name". Locale pinning: `PS_LOCALE = "env LC_ALL= LC_NUMERIC=C LC_MESSAGES=C"` so `LC_CTYPE` falls through to the host.
- **Label:** [verified]

### F11. Poller topology: one task per host, one reused session, backoff 30/60/120/300 s reset only by a successful data cycle

- **Claim:** Reconnect backoff escalates 30, 60, 120, 300 seconds and is reset by a cycle that produced data, not by a successful connect. A manual refresh cannot cut a backoff short.
- **Evidence:** `pool.rs` -> `const BACKOFF_SECS: [u64; 4] = [30, 60, 120, 300];`. Comment at the reset site: "A cycle that produced data proves the host is pollable. Resetting on connect instead pins a host that authenticates but cannot run commands (a network appliance) to the first backoff step forever." `wait_backoff` doc: "A reconnect must never dial faster than the backoff schedule: the GUI drives `refresh_all` on its own timer, which is indistinguishable from a keypress here and would otherwise retry a failing host every few seconds." This was a bug fix shipped in 1.1.2 (CHANGELOG: "A host that answers SSH but not shell commands is no longer re-logged-in every 30 seconds").
- **Label:** [verified]

### F12. Two monitoring modes on one object: full SSH metrics, or TCP-only reachability

- **Claim:** A host can be monitored by SSH (login + shell metrics) or by a bare TCP connect with no login and no commands. The mode is part of the host object and is serialised.
- **Evidence:** `client.rs` -> `pub enum MonitorMode { Ssh, TcpPort }` with `#[serde(alias = "tcp", alias = "tcpPort")]`. `pool.rs` -> `run_tcp_poller` uses `time::timeout(TCP_PROBE_TIMEOUT /* 5 s */, TcpStream::connect(&addr))`, and refuses to run when `proxy_jump` is set: "a port check cannot reach a host behind ProxyJump - use SSH monitoring". CHANGELOG 1.1.2: "Watch a host by a port check instead of an SSH login."
- **Label:** [verified]

### F13. Discovery: one-shot bash probe script with `===OMNYSH:SECTION===` markers, 5 service providers

- **Claim:** Service discovery runs a single bash heredoc over SSH once per connection and parses delimited sections. Five providers exist: Docker, Nginx, PostgreSQL, Redis, NodeJS.
- **Evidence:** `crates/omnyssh-core/src/ssh/probe.rs` -> `generate_quick_scan_script()` emits sections `===OMNYSH:OS===` (`/etc/os-release`), `SERVICES` (`systemctl list-units --type=service --state=running`), `DOCKER` (`docker ps --format`), `LISTEN` (`ss -tlnp`), `PROCESS` (`ps aux --sort=-%mem`). `crates/omnyssh-core/src/ssh/services/mod.rs` -> `ServiceRegistry::new()` builds `vec![DockerProvider, NginxProvider, PostgreSQLProvider, RedisProvider, NodeJSProvider]`; `trait ServiceProvider { fn kind(); fn detect(&ProbeOutput) -> bool; fn quick_metrics(&ProbeOutput) -> Vec<ServiceMetric>; }`. `MetricValue` is `Integer(i64)` only. `discovery.rs` -> "Quick Scan ... This is fast (~2-3 seconds) and designed to run on first connection."
- **Label:** [verified]

### F14. API surface: Tauri 2 IPC only, generated TypeScript bindings, local-only

- **Claim:** The only programmatic interface is the Tauri command/event surface of the desktop app. There is no network API. Roughly 30 commands and 15 typed events, with `bindings.ts` generated by tauri-specta.
- **Evidence:** `crates/omnyssh-gui/ui/src/lib/ipc/commands.ts` exports: `listHosts, reloadHosts, saveHost, deleteHost, listSnippets, saveSnippet, deleteSnippet, executeSnippet, terminalOpen, terminalWrite, terminalResize, terminalClose, sftpOpen, sftpList, sftpUpload, sftpDownload, sftpMkdir, sftpRename, sftpDelete, sftpPreview, sftpCancel, sftpClose, listLocalDir, listLocalRoots, previewLocalFile, startKeySetup, tunnelStart, tunnelStop, terminalPaste, setTrayBehavior, refreshMetrics, checkUpdate, installUpdate, loadUpdateConfig, saveUpdateConfig, unlockIdentity, answerPassword`. `crates/omnyssh-gui/src/events.rs` -> `HostsLoaded, HostStatusChanged, MetricsUpdated, ServicesDetected, ServicesFailed, TunnelStatusChanged, SnippetResult, TerminalExited, SftpConnected, SftpDirListed, SftpOpDone, SftpDisconnected, ...` each `#[derive(tauri_specta::Event)]`. `crates/omnyssh-gui/capabilities/default.json` grants `core:default` plus an allowlist of three URLs to `opener:allow-open-url`. `ui/package.json` deps are `@tauri-apps/api`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-store`, `@xterm/xterm`, `@xterm/addon-fit`.
- **Label:** [verified]

### F15. It cannot be driven headlessly by an external control plane

- **Claim:** There is no supported way for a Workers-hosted SPA (or any remote process) to command omnyssh. Every entry point requires an interactive human at a desktop or terminal.
- **Evidence:** (a) No listener: F4, F5. (b) The TUI requires a TTY: `crates/omnyssh/src/main.rs` installs a crossterm raw-mode panic hook and enters the alternate screen. (c) Interactive secrets are blocking by design: `CoreEvent::PasswordRequired { request_id, host_name, login, retry, new_host_key }` and `KeyPassphraseRequired` require a frontend answer via `answerPassword` / `unlockIdentity`. (d) The GUI is a local webview app: `tauri.conf.json` -> `"devUrl": "http://localhost:5173"`, `"frontendDist": "ui/build"`, one window labelled `main`, no remote origin in capabilities.
- **Label:** [verified]

### F16. Measured footprint: the TUI binary is ~4.6-4.8 MB compressed; the desktop GUI is ~85 MB as an AppImage

- **Claim:** A Rust + ratatui/crossterm + russh agent-sized binary in this exact stack ships at single-digit megabytes. The GUI is two orders of magnitude heavier.
- **Evidence:** v1.1.5 release assets (`gh api repos/timhartmann7/omnyssh/releases`): `omny-aarch64-unknown-linux-musl.tar.gz` 4,610,535 bytes; `omny-x86_64-unknown-linux-gnu.tar.gz` 4,841,661; `omny-x86_64-pc-windows-msvc.zip` 5,088,747; `omny-aarch64-apple-darwin.tar.gz` 4,343,368. GUI: `OmnySSH-x86_64.AppImage` 85,309,944; `.deb` 7,314,810; `.rpm` 7,315,949; `-setup.exe` 5,029,396; aarch64 `.dmg` 6,036,936. Release matrix in `.github/workflows/release.yml` builds the TUI for `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-musl`, `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`.
- **Label:** [verified]

### F17. Author's own footprint comparison (claim, not my measurement)

- **Claim:** The README claims ~130 MB RAM with several sessions open, 4 processes, versus Termius at ~649 MB across 9 processes, measured on an M4 Mac with both apps idle. It also claims "a 20 MB download".
- **Evidence:** README "Small" section and the Comparison table. The release artifacts I measured do not show a 20 MB download for any current build (F16), so that figure appears stale.
- **Label:** [verified that the README says this]; [unverified] as a measurement, and the 20 MB figure is inconsistent with the artifacts I measured.

### F18. The GUI dominates adoption over the TUI by roughly 6:1 on the newest release

- **Claim:** Users overwhelmingly take the desktop app, not the terminal app.
- **Evidence:** v1.1.5 asset `download_count`: `OmnySSH-x86_64-setup.exe` 1119, `OmnySSH-x86_64.AppImage` 166, `.deb` 193, `.rpm` 38, aarch64 `.dmg` 253, x86_64 `.dmg` 46. TUI: `omny-x86_64-pc-windows-msvc.zip` 172, `omny-x86_64-unknown-linux-gnu.tar.gz` 139, `omny-aarch64-apple-darwin.tar.gz` 139, `omny-aarch64-unknown-linux-musl.tar.gz` 31, `omny-x86_64-apple-darwin.tar.gz` 17.
- **Label:** [verified]

### F19. Security posture: known_hosts TOFU with type-change refusal (fixed in 1.1.5); one open plaintext-secret bug

- **Claim:** Host keys are verified against the shared `~/.ssh/known_hosts` with trust-on-first-use, and since 1.1.5 a server offering a host key of a different type than the one saved is refused rather than treated as a new host. Separately, an open bug reports passwords stored in plaintext in `hosts.toml`.
- **Evidence:** CHANGELOG 1.1.5: "Security: a server that offers a host key of another type than the one saved for it is refused. ... Someone intercepting the connection could get past the saved key this way." and "Windows: host keys are kept in `%USERPROFILE%\.ssh\known_hosts`, shared with OpenSSH" (1.1.4). `session.rs` -> `KnownHostsHandler` doc: "Verifies the server's host key against `~/.ssh/known_hosts` ... Unknown hosts are recorded on first connection (trust on first use); changed keys are rejected." Open issue #100, created 2026-09-14, state open: "Bug: Passwords are stored in plain text in hosts.toml". Open issue #149: "SSH host password encryption".
- **Label:** [verified]

### F20. Supply-chain warning: a malware clone of this repository exists

- **Claim:** A repo `meadtrue7477/omnyssh` was a malware clone using forged "Merge pull request" commits in the project owner's name. A separate false-positive "Virus Detected" report on the Windows installer was also filed and closed.
- **Evidence:** Issue #90, closed 2026-09-17: "Heads-up: meadtrue7477/omnyssh is a malware clone of this repo using forged 'Merge pull request' commits in your name". Issue #123, closed 2026-09-28: "Virus Detected - OmnySSH-x86_64-setup.exe".
- **Label:** [verified]

### F21. Issue load: 32 open non-PR issues, 5 open PRs, 37 closed non-PR issues

- **Claim:** The project has a live backlog dominated by GUI feature requests and platform quirks, not by architecture gaps.
- **Evidence:** `gh api repos/timhartmann7/omnyssh/issues?state=open&per_page=100` -> 32 items with `.pull_request == null`, 5 with `.pull_request != null` (matches `open_issues_count: 37`). `state=closed` -> 37 non-PR. Recent open examples: #161 right-click paste, #160 configurable warning percentage, #158 multiple host/IP, #156 font type, #154 sudo password autofill, #153 live snippet streaming, #150 group hosts, #149 password encryption, #148 SSH certificates, #147 filter dashboard, #145 SSH agent on Windows, #126 DynamicForward, #121 font family/size, #116 mobile apps and cloud sync, #98 wildcard Host patterns, #100 plaintext passwords, #93 portable version, #91 edit files via SFTP, #88 ppk keys, #84 i18n, #71 GPU stats.
- **Label:** [verified]

### F22. The nearest thing to a control-plane request is an open, unanswered feature request for a self-hostable sync backend

- **Claim:** There is no roadmap commitment to a server or agent mode. The closest signal is issue #116 asking for mobile apps plus "cloud sync across devices - bonus points for being able to host our own cloud controller/sync database", open since 2026-09-28 with no visible maintainer reply in the data I read.
- **Evidence:** `gh api repos/timhartmann7/omnyssh/issues/116` -> `{"number":116,"state":"open","title":"Feat: mobile apps and cloud sync","created_at":"2026-09-28T02:38:55Z","body":"...cloud sync across devices - bonus points for being able to host our own cloud controller/sync database"}`. Third-party descriptions mention "seamless multi-device sync" (trendshift.io/repositories/52016) but the README says "No account, no login screen, no telemetry" and no sync code exists (F4).
- **Label:** [verified] for the issue and the absence of sync code; [unverified] whether the maintainer intends to build it.

### F23. CI runs clippy with `-D warnings`, fmt, and a repo hygiene guard, on three OSes

- **Claim:** The project's actual gate is `cargo clippy --all-targets -- -D warnings`, `cargo fmt`, a man-page freshness check, and a shell hygiene guard, on ubuntu/macos/windows.
- **Evidence:** `.github/workflows/ci.yml` -> `strategy.matrix.os: [ubuntu-latest, macos-latest, windows-latest]`, jobs `hygiene` (`bash scripts/hygiene-guard.sh`, `bash scripts/hygiene-guard.test.sh`) and `build-and-test` with `dtolnay/rust-toolchain` stable + clippy/rustfmt components. `.github/workflows/release.yml` line 37: `cargo clippy --all-targets -- -D warnings`.
- **Label:** [verified]

### F24. Test surface: unit tests inline, plus 12 integration test files in core and one in the GUI crate

- **Claim:** The core crate has substantial integration tests covering the exact behaviours a control plane would depend on: tunnel, login, metrics parsing, poll backoff, agent forwarding, algorithms, log cleanup, ssh_config parsing, terminal.
- **Evidence:** tree listing -> `crates/omnyssh-core/tests/{agent_forward.rs, agent_identities.rs, algorithms.rs, log_cleanup.rs, login.rs, metrics_parser.rs, poll_backoff.rs, ssh_config_parser.rs, terminal.rs, tunnel.rs}`; `crates/omnyssh-gui/tests/startup_contract.rs`. `metrics.rs` alone carries ~40 `#[test]` functions.
- **Label:** [verified]

---

## 2. What this changes for the redesign

### 2.1 Against requirement (a): portability of application code

**R1. omnyssh is not reusable as the dashboard and not reusable as the data-plane agent. Say this plainly and drop it from the candidate list.**
It has no server component, no headless mode, no network API and no CLI subcommands (F4, F14, F15). A Workers-hosted SPA cannot command it. The GUI is a local webview app whose capability file allowlists three outbound URLs (F14); there is no surface for an external control plane to call into. Building one would be a rewrite, not an integration.

**R2. Adopt its crate split verbatim for the single-agent binary.**
The three-crate shape (`omnyssh-core` frontend-agnostic, plus one frontend per face) is the exact discipline requirement (b) needs, and it is proven at this scale (F3, F8). Concretely: one `agent-core` crate with no UI, no terminal and no CLI dependencies, exposing the tunnel connector, the orchestrator client and the broker as modules; then thin faces (`agentd` service, `agent` CLI for humans). The root `Cargo.toml` trick of `default-members` so a bare `cargo build` skips the GUI is worth copying: it keeps the agent buildable with no Node/Tauri toolchain.

**R3. Copy the "read the standard file, never write it" portability pattern.**
omnyssh imports hosts from `~/.ssh/config` and never modifies it; edits are saved as a shadow copy in its own TOML (F6). That is the correct portability posture for the operator's requirement (a): the agent should read the platform's own configuration surface (docker socket, containerd, kubeconfig, an existing TOML/YAML file) and persist its own state elsewhere, so swapping between Cloudflare and self-hosted backends never mutates the operator's files. Also copy the `Host` schema as a starting point for the resource description: name, address, port, credential reference, tags, monitor mode, forwards. It is small, serialises to TOML, and round-trips without touching the file when a field is at its default (there is an explicit test for that: `the_monitoring_default_round_trips_without_touching_the_file`).

**R4. Copy the one-object-two-bindings idea, which is the portability requirement in miniature.**
`MonitorMode::{Ssh, TcpPort}` on the same `Host` (F12) is precisely the abstraction the redesign needs: one resource description, two collection strategies, and the data model does not care which is bound. The same shape gives "code written once, runs on Cloudflare or on my metal": the workload descriptor is identical, and a binding layer selects the Cloudflare target or the local target. omnyssh even handles the aliasing problem (accepting `tcp`, `tcpPort` and `tcp_port` for the same value) which is what a portable config format needs when two backends spell a field differently.

**R5. Extract the parser coverage matrix as a specification, not the code.**
`omnyssh-core`'s parsers are `pub fn(&str) -> Option<f64>` and the crate is published (F8), so they are technically reusable. But they parse *remote command output* over SSH, which is the wrong direction for an agent that runs on the box. What transfers is the coverage list they encode (F9, F10): Linux procps-ng, busybox/Alpine, macOS, FreeBSD including ZFS ARC above `c_min` counted as available and 32-bit `kern.cp_time` wrap, decimal-comma locales, and the exclusion of the collector's own PID chain from `ps` by PID and never by name. Write that list down as the acceptance tests for the agent's local collector (via `sysinfo` or `/proc`), and the agent will not repeat the portability bugs omnyssh spent six releases fixing.

### 2.2 Against requirement (b): one small agent binary per server

**R6. omnyssh is evidence that the operator's size target is reachable in this stack, and evidence about which half gets heavy.**
The TUI binary, same language, same SSH library, same async runtime, ships at 4.3-5.1 MB compressed across five targets (F16). The desktop GUI is 85 MB as an AppImage (F16). The operator's instinct in requirement (b) is correct and this repo is the measurement: a Rust agent with russh plus tokio plus a small config surface is a few megabytes. The weight comes from GUI toolchains, not from the engine.

**R7. omnyssh's topology is the inverse of what the agent needs, so take the patterns and leave the direction.**
omnyssh is a client that dials out to many hosts over SSH; the intelligence (poll manager, event loop, secrets) sits on the operator's desktop. The single-agent design inverts this: the intelligence sits in the control plane and each server runs a small process that dials *out* to it. omnyssh therefore contributes no agent code. What it does contribute, and contributes well, is the upstream-connection discipline: one task per target, one long-lived connection reused, backoff 30/60/120/300 s that a *successful data cycle* resets and that a manual refresh cannot cut short (F11). That is exactly the behaviour the agent's connection to the orchestrator needs, and omnyssh got it right only after shipping the bug, so copy the fixed version.

**R8. Do not copy the secret handling.**
`Host` carries `password: Option<String>` serialised into `hosts.toml` in the clear, and there is an open bug saying so (F19). The agent's config must reference secrets by name and read the value from the environment or a secret store at runtime, never persist it. This is a hard requirement, not a style preference.

**R9. Do not vendor `key_setup.rs` or anything near it.**
`crates/omnyssh-core/src/ssh/key_setup.rs` is 44,126 bytes that rewrites `sshd_config` on remote hosts with a backup-and-rollback dance. The changelog for 1.1.5 documents several ways its outcome reporting was wrong (reporting success while password auth was still on; failing to say that password auth had been turned off and the rollback failed). Nothing in the redesign needs it. If the operator wants key bootstrap, do it with a short-lived, reviewed script, not this module.

**R10. Pin a commit hash if any of this is vendored, because this repository has a malware clone.**
Issue #90 documents `meadtrue7477/omnyssh` as a malware clone forging merge commits in the maintainer's name (F20). Vendoring by tag or branch from the upstream repo is not sufficient assurance; pin a commit SHA and verify it against the releases page.

**R11. Take the streamer-mode idea for the SPA, and take it further.**
omnyssh has a mode that replaces every real IP on screen with a fake one so a demo or screen share does not leak infrastructure, and 1.1.5 extended it to error messages and the host form after leaks were found there (F19, CHANGELOG 1.1.5). The Workers-hosted dashboard SPA will be showing the operator's own infrastructure; a redaction layer at the API boundary, not in the view, is the right place for it.

### 2.3 Where omnyssh sits relative to the other candidates

omnyssh is the weakest of the six for the redesign as *code* and the strongest as *precedent for structure*. It answers "can a small Rust binary be the whole engine with two frontends on top" with yes, publicly, with releases. It does not answer "what does the agent on each server look like". For that, ServerBee (E4) is the close analogue and cfrs (E6) supplies the Cloudflare side of the wire.

---

## 3. Not covered / open questions

1. **Whether a headless mode could be added upstream.** I found no maintainer statement either way. Issue #116 ("host our own cloud controller/sync database") is the only adjacent signal and is open and unanswered since 2026-09-28 (F22). Adding a headless mode would require a new network listener, which the project has none of today (F4, F5).
2. **Whether the author would accept the parsers being split into a standalone crate.** They are already `pub` in a published crate (F8), so they are reachable, but the crate pulls in russh, russh-sftp, reqwest and tokio as hard dependencies, so depending on `omnyssh-core` for the parsers alone drags in an SSH client and an HTTP client. I did not measure the transitive weight of that.
3. **Actual runtime memory and CPU of the agent-sized path.** The README's ~130 MB figure is the author's measurement on an M4 Mac with the GUI open (F17); I did not run anything. The 20 MB download claim in the same paragraph is inconsistent with the current release artifacts (F16) and should be treated as stale.
4. **Whether omnyssh's `CoreEvent` mpsc design maps onto a wire protocol.** It is an in-process enum over a tokio mpsc channel (F14). Nothing in it is serialisable across a network today. I did not design that mapping.
5. **Behaviour on non-POSIX and non-shell targets.** The metrics path assumes a POSIX shell; the changelog notes an account whose login shell is csh or tcsh shows no metrics, and there is an open PR (#138) for remote Windows metrics over SSH. The redesign's agent runs on the operator's own Linux boxes, so this matters less, but it is unmeasured here.
6. **Licence compatibility with the rest of the stack.** omnyssh is Apache-2.0, which is permissive. I did not check the licences of russh, russh-sftp, ratatui, crossterm, tauri or the 725 lockfile entries. If any code is vendored, that check is required first.
7. **Whether the 32 open issues include any that would block a fork.** I listed them (F21) but did not triage them against a fork plan. #100 (plaintext passwords) and #149 (password encryption) are the two that would matter.
8. **Star and fork counts are a snapshot.** 1247 stars / 71 forks as read on 2026-10-29 via `gh api`. They will drift.
