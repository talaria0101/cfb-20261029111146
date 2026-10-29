# E4-serverbee: ZingerLittleBee/ServerBee

Research subagent E4. All sources read 2026-10-29 (UTC). Primary source is the
repository itself, cloned at `HEAD` (default branch `main`) plus the GitHub REST
API for metadata. No figure below comes from the README's marketing copy without
a second artefact behind it.

GitHub identity used for every claim in this file:
`ZingerLittleBee/ServerBee`, 339 stars, 29 forks, license AGPL-3.0, primary
language Rust, default branch `main`, repo created 2022-08-04, `pushed_at`
2026-10-17T18:05:13Z, `updated_at` 2026-10-26T17:00:23Z, homepage
`https://docs.serverbee.app`.

---

## 1. Findings

### F1. This is the closest existing artefact to "one small agent per server plus a server that aggregates", and it is exactly a two-binary hub-and-spoke system

Claim: ServerBee is a Rust monorepo of three Cargo crates: `crates/common`
(`serverbee-common`), `crates/server` (`serverbee-server`), `crates/agent`
(`serverbee-agent`). The agent runs on each monitored host, dials out to the
server over WebSocket, and the server stores into SQLite and serves an embedded
React SPA.

Evidence: root `Cargo.toml` declares `[workspace] members = ["crates/common",
"crates/server", "crates/agent"]`, `version = "1.0.0-beta.6"`, `edition = "2024"`,
`license = "AGPL-3.0-or-later"`, `repository =
"https://github.com/ZingerLittleBee/ServerBee"`. Repo tree (2,105 entries, 1,884
blobs, 12,375 KB): `crates/agent` 66 files, `crates/common` 10 files,
`crates/server` 325 files, `apps/web` 657 files, `apps/docs`, `apps/ios`
(Swift, ~1.66 MB of Swift in the language breakdown), `apps/push-relay`,
`packages/widget-sdk`, `tests/`, `docs/`, `deploy/`, `.github/`.
Language bytes: Rust 6,085,078; TypeScript 3,760,177; MDX 725,106; Swift
1,661,293; CSS 109,119; Shell 243,877; Python 31,981.

URL: https://github.com/ZingerLittleBee/ServerBee
Label: [verified]

### F2. The agent dials out and has no listener at all. This is the single most important structural fact for the redesign

Claim: the agent is a pure outbound client. It opens a WebSocket to the server,
sends, and reconnects. It never accepts an inbound connection in production code.

Evidence, three independent lines:
1. `crates/agent/src/reporter/mod.rs` lines 563-573, `build_ws_url`: takes
   `config.server_url`, maps `https://` to `wss://`, `http://` to `ws://`, and a
   schemeless `host:port` to `ws://host:port`, then appends `/api/agent/ws`.
2. `crates/agent/src/reporter/mod.rs` lines 575-586, `build_ws_request`: builds
   a `tokio_tungstenite` client request and inserts
   `AUTHORIZATION: Bearer <config.token>`. The connection is made with
   `connect_async(request)`.
3. `crates/agent/Cargo.toml` contains no HTTP server framework. No `axum`, no
   `hyper`, no `tower`, no `warp`, no `actix`, no `poem`. Its dependency set is
   `serverbee-common, serde, serde_json, chrono, tokio, tracing,
   tracing-subscriber, uuid, anyhow, sysinfo 0.33, tokio-tungstenite 0.26
   (rustls-tls-webpki-roots), figment 0.10, reqwest 0.12 (rustls-tls, json),
   futures-util, url, rand 0.8, portable-pty 0.8, base64 0.22, sha2 0.10, hex
   0.4, semver, x509-parser 0.16, webpki-roots, dashmap 6, libc, rustls 0.23.45,
   nvml-wrapper 0.10 (optional, behind the `gpu` feature), bollard 0.18, regex,
   once_cell, async-trait, thiserror, ipnet, trippy-core 0.13`, plus
   `windows-sys 0.59` on Windows.
4. A grep for `TcpListener::bind` across `crates/agent/src/` returns matches
   only inside `#[cfg(test)]` helper functions in `reporter/mod.rs` (lines
   1314-1327 and their callers). There is no production bind.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/crates/agent/src/reporter/mod.rs
Label: [verified]

### F3. Reconnect is exponential with jitter, and a 401 triggers re-enrollment, not a silent loop

Claim: the agent's supervisor loop reconnects forever, backs off 1s doubling to
a 30s cap with +/-20% jitter and a 0.5s floor, and treats a 401 on the WebSocket
upgrade as "my token was revoked, re-enroll".

Evidence: `crates/agent/src/reporter/mod.rs`, constants `MAX_BACKOFF_SECS = 30`,
`JITTER_FACTOR = 0.2`, `MAX_REREGISTER_ATTEMPTS = 3`. `run_with_external` loops
on `connect_and_report`, resets `backoff_secs` to 1 on a clean close, and calls
`should_refresh_registration` on error. `should_refresh_registration` (lines
588-594) returns true only when `config.enrollment_code` is non-empty and the
error downcasts to `tungstenite::Error::Http(response)` with status 401.
`apply_jitter` (lines 596-602) is `(base + jitter).max(0.5)` with
`jitter = rng.gen_range(-range..=range)`. Unit tests assert the 8.0..=12.0 band
for base 10 and the 0.5 floor for base 0.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/crates/agent/src/reporter/mod.rs
Label: [verified]

### F4. The wire protocol is versioned JSON text frames over WebSocket, with explicit ACKs, a 30s heartbeat and a 30s offline threshold

Claim: agent protocol version is 6. All application messages are JSON text
frames. Terminal bytes are base64-encoded inside a `data` field. Terminal and
file traffic is relayed browser -> server -> agent, never browser -> agent.

Evidence: `crates/common/src/constants.rs`: `PROTOCOL_VERSION: u32 = 6`,
`DEFAULT_SERVER_PORT: u16 = 9527`, `DEFAULT_REPORT_INTERVAL: u32 = 3`,
`HEARTBEAT_INTERVAL_SECS: u64 = 30`, `OFFLINE_THRESHOLD_SECS: u64 = 30`,
`SESSION_TTL_SECS: i64 = 86400`, `MAX_WS_MESSAGE_SIZE: usize = 1024 * 1024`,
`MAX_TASK_OUTPUT_SIZE: usize = 512 * 1024`, `MAX_BINARY_FRAME_SIZE: usize = 64 *
1024`, `MAX_FILE_CHUNK_SIZE: usize = 384 * 1024`,
`MAX_FILE_CONCURRENT_TRANSFERS: usize = 3`, `FILE_TRANSFER_TIMEOUT_SECS: u64 =
1800`, `MAX_COMMAND_SIZE: usize = 8 * 1024`, `MAX_CONCURRENT_COMMANDS: usize =
5`, `MAX_TERMINAL_SESSIONS: usize = 3`, `TERMINAL_IDLE_TIMEOUT_SECS: u64 = 600`,
`DEFAULT_COMMAND_TIMEOUT_SECS: u32 = 300`. `crates/agent/src/reporter/wire.rs`
is a 615-byte module whose whole job is `serde_json::to_string(msg)` then
`Message::Text(json.into())`.

Message enums live in `crates/common/src/protocol.rs`, 73,737 bytes:
- Agent -> Server (`AgentMessage`): `SystemInfo` (needs ACK, sent once on
  connect/reconnect), `Report` (no ACK, every N seconds), `PingResult`,
  `TaskResult` (needs ACK), `TerminalOutput`, `TerminalStarted`,
  `TerminalError`, `Pong`, `DockerInfo`, `DockerContainers`, `DockerStats`,
  `DockerLog`, `DockerEvent`.
- Server -> Agent (`ServerMessage`): `Welcome { server_id, protocol_version,
  report_interval, capability_event_ack, capabilities }`, `Ack { msg_id }`,
  `PingTasksSync`, `Exec`, `TerminalOpen`, `TerminalInput`, `TerminalResize`,
  `TerminalClose`, `Ping` (every 30s), `Upgrade`, `DockerLogsStart`,
  `DockerLogsStop`, `DockerAction`.
- Server -> Browser (`BrowserMessage`) on `/api/ws/servers`, one-way only:
  `FullSync`, `Update`, `ServerOnline`, `ServerOffline`, `DockerUpdate`,
  `DockerEvent`, `DockerAvailabilityChanged`.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/crates/common/src/constants.rs
Label: [verified]

### F5. The agent generates and owns its own credential. The server never sees or returns the plaintext token

Claim: before claiming a single-use, server-bound, short-lived enrollment offer,
the agent generates a 32-byte random token, persists it to its own config file,
and only then submits it as `proposed_run_token`. The server stores an argon2
hash only. The plaintext exists in exactly one place: the agent host.

Evidence: `crates/agent/src/register.rs`. `generate_run_token` fills 32 bytes
from `rand::rngs::OsRng` and base64url-encodes them (unit test asserts
`first.len() == 43` and the `[A-Za-z0-9-_]` alphabet). `stage_run_token_at`
writes the token into `agent.toml` via `run_token_store::persist_run_token`
before `register_once` runs, and on persistence failure leaves
`config.token` empty (unit test `persistence_failure_leaves_no_in_memory_credential`).
`register_once` POSTs to `{server_url}/api/agent/register` with
`.bearer_auth(&config.enrollment_code)` and body
`{"proposed_run_token": "<token>"}`. Constants: `MAX_REGISTER_ATTEMPTS = 30`,
`MAX_BACKOFF = 300s`, `DEFAULT_RATE_LIMIT_BACKOFF = 60s`,
`EXIT_CODE_PERMANENT_AUTH_FAILURE = 78` (documented as matching the systemd
`RestartPreventExitStatus=78` policy in `deploy/install.sh`). A 401 or 403 on
the claim is `PermanentAuth` and exits 78; a 429 honours `Retry-After`; anything
else is `Ambiguous` and the agent falls through to trying the WebSocket with the
staged token.

The server side is documented in `apps/docs/content/docs/en/api-reference.mdx`:
"On success it consumes the offer, stores only the run-token hash, and returns
`{ "data": { "server_id": "..." } }`. The Server never returns the plaintext run
token."

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/crates/agent/src/register.rs
Label: [verified]

### F6. Capabilities are owned by the agent host, are a bitmask, and include host-local temporary grants with expiry

Claim: the agent decides what it is willing to do. The server can only mirror
what the agent reports and reject requests outside it. A host operator can
temporarily raise a capability from a CLI on the box, with a bounded duration.

Evidence: `crates/common/src/constants.rs` defines `CAP_TERMINAL = 1 << 0`,
`CAP_EXEC = 1 << 1`, `CAP_UPGRADE = 1 << 2`, `CAP_PING_ICMP = 1 << 3`,
`CAP_PING_TCP = 1 << 4`, `CAP_PING_HTTP = 1 << 5`, `CAP_FILE = 1 << 6`,
`CAP_DOCKER = 1 << 7`, `CAP_SECURITY_EVENTS = 1 << 8`, `CAP_FIREWALL_BLOCK = 1
<< 9`, `CAP_IP_QUALITY = 1 << 10`, `CAP_VALID_MASK = 0b111_1111_1111` (2047),
`CAP_DEFAULT = 1852` (upgrade + all three pings + security_events +
firewall_block + ip_quality). Terminal, exec, file and docker are OFF by
default.

`crates/agent/src/config.rs`, `CapabilitiesConfig`: `allow: Vec<String>`,
`deny: Vec<String>` (deny wins), `temporary_max_duration` default `"24h"`,
`state_dir` default `"/var/lib/serverbee"`, grants file at
`{state_dir}/capability_grants.json`. The doc comment states: "Agent-local
capability policy, authored exclusively on the agent host (config file or
`SERVERBEE_CAPABILITIES__*` env). The server cannot modify these, it only
mirrors what the agent reports."

`crates/agent/src/main.rs` handles one-shot subcommands `grant`, `revoke`,
`grants` that write the grants file and exit; the running daemon picks the change
up within a few seconds. Usage strings:
`serverbee-agent grant <cap> --for <30m|2h|1d> [--reason "..."]` and
`serverbee-agent revoke <cap>`. `granted_by` is taken from `SUDO_USER` or
`USER`. A process-wide `CapabilityAuthority` (26,149 bytes in
`capability_grants/authority.rs`) owns the effective bitmask and runs a
transition loop with a 3-second period for the agent's lifetime. The agent
ignores the server-advertised `capabilities` field in `Welcome` (comment in
`reporter/mod.rs`: "The server-advertised `capabilities` field is intentionally
ignored: capabilities are agent-owned and already loaded into `capabilities`
above").

Firewall and file capabilities are additionally reconciled against local
reality: `firewall::probe_local_capability()` shells out to check `nft` exists,
and `reconcile_file_capability` drops `CAP_FILE` unless the `[file]` subsystem
is enabled with non-empty `root_paths`, "so the server/UI never advertises a
file feature that would fail".

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/crates/common/src/constants.rs
Label: [verified]

### F7. Footprint: agent 13.13 MiB and about 27 MB steady-state RAM on linux-amd64; server 50.41 MiB with the SPA embedded

Claim: the release agent binary is small and the steady-state memory is in the
tens of megabytes. The server binary is about 50 MiB because the React SPA is
compiled into it.

Evidence, from the `v1.0.0-beta.6` release assets (published 2026-10-06T05:40:21Z,
`prerelease: true`), exact byte sizes as reported by the GitHub releases API:

| asset | bytes | MiB |
|---|---|---|
| serverbee-agent-linux-amd64 | 13,772,672 | 13.13 |
| serverbee-agent-linux-arm64 | 12,471,584 | 11.89 |
| serverbee-agent-darwin-arm64 | 16,943,504 | 16.16 |
| serverbee-agent-darwin-amd64 | 18,410,152 | 17.56 |
| serverbee-agent-windows-amd64.exe | 16,161,792 | 15.41 |
| serverbee-server-linux-amd64 | 52,857,832 | 50.41 |
| serverbee-server-linux-arm64 | 48,778,952 | 46.52 |
| serverbee-server-darwin-arm64 | 60,684,864 | 57.88 |
| serverbee-server-windows-amd64.exe | 62,271,488 | 59.38 |

Memory and CPU, from `apps/docs/content/docs/en/resource-usage.mdx`, which is
explicit about its own provenance: "the measurement notes originally recorded on
this page for v0.9.3, dated 2026-05-19 unless noted otherwise. Raw benchmark
logs and exact binary linkage were not archived with those notes." Host was a
4-core AMD EPYC 7B13 / 8 GB / Ubuntu 24.04 (KVM), agent v0.9.3, 3-second
interval, temperature collection on, reporting over an HTTPS WebSocket to a
remote server:

| resource | cold start (~90s) | after 8h |
|---|---|---|
| memory, systemd cgroup | ~4.3 MB, peak ~5.1 MB | ~27 MB, peak ~28 MB |
| memory, `ps` RSS | ~10 MB | ~34 MB |
| CPU | ~0.7% of one core | ~0.5% of one core |
| threads | 10 | 9-10 |
| binary size | ~11 MB (historical linux-amd64) | |
| network | estimated <= 1-2 KB/s | |

The page warns that those readings "do not establish a long-term plateau or
distinguish allocator retention from a leak". `apps/docs/content/docs/en/deployment.mdx`
gives the current sizing table: server minimum 1 vCPU / 128 MB / 100 MB + data,
recommended 2 vCPU / 256 MB / 1 GB+; agent CPU "negligible", "< 1% of 1 core";
agent RAM "~27 MB measured cgroup steady state", 30-40 MB headroom. Official
Linux release binaries and Docker images use musl (built with `cargo zigbuild`,
`ziglang==0.15.2` pinned in `.github/workflows/release.yml`), so
`MALLOC_ARENA_MAX` does not apply to them.

Historical server memory, same page, same caveat: near-idle self-hosted server
with no agents connected, v0.9.3, cgroup ~15 MB peak ~23.8 MB, 7 threads,
near-zero CPU, binary ~47 MB. A separate Railway observation recorded
"roughly 140-170 MB with a small number of Agents and `MALLOC_ARENA_MAX=2`
present" and "800 MB-1 GB after 2-3 days in another run", with the page stating
"The notes do not capture exact build linkage, Agent count, query load, or a
controlled comparison."

URL: https://github.com/ZingerLittleBee/ServerBee/releases/tag/v1.0.0-beta.6
Label: [verified]

### F8. Release-toolchain memory regression in beta.1, fixed in beta.2: measure the actual build, do not trust "lightweight"

Claim: there was a real, diagnosed, ~20 MB/day idle memory growth in
`v1.0.0-beta.1`, caused by cross-thread free behaviour in Zig 0.16's bundled
allocator (SmpAllocator) replacing musl's mallocng. The release workflow now
pins Zig 0.15.2.

Evidence: `apps/docs/content/docs/en/resource-usage.mdx`: "A separate
release-toolchain regression affected `v1.0.0-beta.1`: the recorded idle Server
grew about 20 MB per day because of cross-thread free behavior in Zig 0.16's
bundled allocator. The release workflow now pins Zig 0.15.2; the correction
shipped in `v1.0.0-beta.2`. Its cause, observation scope, and reproduction
procedure are recorded in the release memory soak runbook."
`.github/workflows/release.yml` lines 121-127: comment "Pin zig: 0.16 replaced
musl's mallocng with Zig's SmpAllocator in its" followed by
`pip install cargo-zigbuild ziglang==0.15.2`.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/.github/workflows/release.yml
Label: [verified]

### F9. The REST API is the headless control-plane surface, and it is already generated as OpenAPI 3.1 with Swagger UI

Claim: every dashboard capability is exposed over REST, and the schema is
machine-generated from annotations in the server binary. An external control
plane does not need to scrape the SPA.

Evidence: `apps/docs/content/docs/en/api-reference.mdx` states "The
authoritative, schema-level reference is generated from OpenAPI annotations in
the server binary", Swagger UI at `/swagger-ui/`, raw document at
`/api-docs/openapi.json`. The server depends on `utoipa 5` (features
`axum_extras`, `chrono`, `uuid`) and `utoipa-swagger-ui 9`. The checked-in
`apps/web/openapi.json` is 374,002 bytes; I parsed it: OpenAPI 3.1.0, title
"ServerBee API", version 1.0.0-beta.6, 145 paths, 195 operations.

Response envelope is `{ "data": ... }`; errors are
`{ "error": { "code", "message", "details"? } }` with documented codes
BAD_REQUEST and ONBOARDING_IDEMPOTENCY_CONFLICT among others.

Auth paths, from the same page and from `crates/common/src/constants.rs`
(`API_KEY_PREFIX = "serverbee_"`, `API_KEY_PREFIX_LEN = 8`):
- session cookie (`session_token`, HttpOnly, SameSite=Strict, sliding 24h TTL,
  argon2 password verification)
- `X-API-Key: serverbee_<32 random bytes, base64url>`, argon2-hashed with an
  8-character plaintext prefix stored for lookup narrowing. "A key
  authenticates as its owning user and inherits that user's current admin or
  member role. An API key is a credential type, not a third role."
- `Authorization: Bearer <session token>` for mobile
- agent WebSocket: `Authorization: Bearer <agent run token>`, with `?token=`
  accepted only as a deprecated legacy path

Rate limits (tower middleware, in-memory per-IP map): `POST /api/auth/login` 5
per IP per 15 minutes, `POST /api/agent/register` 10 per IP per 15 minutes,
429 on excess, admins can clear a window.

WebSocket endpoints: `/api/agent/ws` (agent bearer), `/api/ws/servers`
(browser, one-way server-to-client), `/api/ws/terminal/{server_id}` (admin +
CAP_TERMINAL), `/api/ws/docker/logs/{server_id}` (admin + CAP_DOCKER).

Admin REST families cover: servers CRUD and upgrade, agent-authority offers and
revocation, groups and tags, ping tasks, network probes, traceroute, all
`/api/files/*`, Docker container actions, service monitors, dashboards, brand,
status page, incidents, maintenances, alert rules, notifications, notification
groups, tasks (remote command dispatch), users, audit logs, settings, backup and
restore (raw SQLite download / octet-stream restore, restart required), GeoIP
download.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/apps/web/openapi.json
Label: [verified]

### F10. The agent is far more than a metrics reporter: PTY, file transfer, Docker inspection, firewall writes, security detection, self-upgrade

Claim: the agent binary already carries most of the machinery a data-plane agent
needs, including a transactional self-upgrade with certificate pinning and
rollback.

Evidence, file sizes in `crates/agent/src/`: `reporter/mod.rs` 182,329 bytes,
`file_manager.rs` 76,840, `reporter/runtime.rs` 61,586, `probe_utils.rs` 43,910,
`upgrade/transaction.rs` 32,880, `terminal.rs` 32,909, `upgrade.rs` 24,923,
`security/manager.rs` 24,515, `network_prober.rs` 22,991, `config.rs` 22,657,
`security/ssh_detector.rs` 19,556, `firewall/manager.rs` 23,228,
`traceroute.rs` 31,184, `capability_grants/authority.rs` 26,149,
`ip_quality/mod.rs` 33,716, `pinger.rs` 19,718, `docker/mod.rs` 29,151,
`firewall/nft.rs` 19,291, `security/journal_watcher.rs` 20,471,
`capability_policy.rs` 16,500, `register.rs` 12,194, `main.rs` 12,811.

Self-upgrade, from `crates/agent/src/upgrade.rs` and
`apps/docs/content/docs/en/agent.mdx`: downloads from a configurable
`release_repo_url` (overridable with `--release-repo`), verifies a SHA-256
checksum against the release's `sha256sums.txt`, supports an optional
`release_cert_spki_sha256` pin (64 lowercase hex chars, fail-fast on malformed
input at startup), runs a preflight probe by executing the candidate binary with
`--serverbee-upgrade-probe` and requiring it to print the requested version,
then requires the candidate to reconnect and send `SystemInfo` within 90 seconds
and survive a 5-second stability window. On any failure it restores `.bak`,
restarts the previous version, and reports the failed upgrade after reconnecting.
A parent watchdog guards the trial. Redirect policy is explicit
(`redirect_decision` takes a scheme and a hop count) and the agent warns at
startup if `agent.toml` or `/etc/serverbee/agent.toml` is group- or
world-writable, because `release_repo_url` is a privilege-escalation surface.

Firewall, from `crates/agent/Cargo.toml`'s own comment: conntrack and scan
detection run the `conntrack -E` CLI as a subprocess rather than using
`netlink-packet-netfilter`, because "as of v0.2 it only implements the nflog
subprotocol". A guardrail feeds the agent's own primary external IP into the
firewall manager before any blocklist push can arrive, so the control plane
cannot lock the agent out of itself.

Security detection: SSH brute-force from the systemd journal, port-scan
detection from conntrack, first-seen store, scan detector. Off by default for
port scan (`port_scan.enabled = false`), on for SSH.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/crates/agent/src/upgrade.rs
Label: [verified]

### F11. What the agent does NOT do: no tunnel, no broker, no container creation, no CI, no object storage

Claim: ServerBee stops at observe-and-poke. It has no Cloudflare Tunnel, no
quick tunnel, no QUIC, no ingress routing, no hostname mapping, no work queue,
no durable agent-side outbox, no ability to create a container from an image, no
build system and no object store.

Evidence, each verified:
- No tunnel. A grep for `cloudflare|cloudflared|ngrok|tailscale` across
  `crates/` returns matches only in: `ip_quality/detectors/chatgpt.rs` and
  `gemini.rs` (comments about Cloudflare's `cdn-cgi/trace` endpoint used as a
  geolocation oracle), `server/src/presets/targets.toml` (a network-probe
  preset target with `id = "intl-cloudflare"`, `provider = "Cloudflare"`),
  `server/src/dev_demo.rs` (a demo DNS target), `server/tests/*` (test
  fixtures), and `server/src/router/ws/agent/mod.rs` line 68 (a comment saying
  `X-Forwarded-For` is honoured "when the TCP source is a trusted proxy (e.g.
  Railway, Cloudflare)"). No tunnel client, no cloudflared dependency, no QUIC.
- No proxy support in the agent client. A grep for `proxy|socks|CONNECT` across
  `crates/agent/src/` returns only unrelated hits (`tcp_connections`,
  `udp_connections`, `trusted_proxies` on the server side).
- No container creation. Docker support in the agent (`docker/mod.rs`,
  `containers.rs`, `events.rs`, `logs.rs`, `networks.rs`, `volumes.rs`, via
  `bollard 0.18`) plus the server API surface is read/inspect plus
  `POST /api/servers/{id}/docker/containers/{cid}/action`. There is no
  image-pull, no create-from-image, no volume create, no network create, no
  one-shot job execution. `docker/volumes.rs` is 5,398 bytes and `networks.rs`
  is 2,788 bytes, i.e. listing only.
- No broker. The only dispatch primitives are `ServerMessage::Exec` and the
  `tasks` / `task_results` tables: fire a command, poll for the result. The one
  durable outbox in the system is server-side and exists only for mobile push
  notifications ("The Server's durable business outbox remains in its own
  database"). On the agent side the only queue found is a
  `tokio::sync::mpsc::channel::<AgentMessage>(128)` for security events.
- No CI and no object storage anywhere in the tree.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/crates/server/src/router/ws/agent/mod.rs
Label: [verified]

### F12. The server is a single binary with the SPA compiled in, SQLite WAL, sea-orm, and background tasks on fixed intervals

Claim: one binary serves HTTP, WebSocket and the dashboard, with no external
database. Background work runs on `tokio::spawn` with documented ordering
guarantees.

Evidence: `crates/server/Cargo.toml` dependencies include `axum 0.8` (ws,
macros, multipart), `tower 0.5`, `tower-http 0.6`, `sea-orm 1`
(sqlx-sqlite, runtime-tokio-rustls, macros), `sea-orm-migration 1`, `sqlx 0.8`
(sqlite), `argon2 0.5`, `dashmap 6`, `figment 0.10`, `hickory-resolver 0.26.3`,
`utoipa 5`, `utoipa-swagger-ui 9`, `tokio-cron-scheduler 0.13`, `rust-embed 8`
(mime-guess), `maxminddb 0.27`, `totp-rs 5` (qr, gen_secret), `oauth2 5`,
`whois-rust 3`, `tokio-rustls 0.26`, `rustls 0.23.45`, `zip 2`, `arc-swap 1`,
`html-escape 0.2`, `flate2 1`, `dns-lookup 2`, `ring 0.17`, `sha2 0.10`.

SQLite configuration from `apps/docs/content/docs/en/architecture.mdx`: WAL mode
set at startup, busy timeout 5000 ms, `synchronous=NORMAL`, connection pool up
to 10.

Background tasks, same page: RecordWriter 60s (flushes the in-memory latest
agent reports into `records`), AlertEvaluator 60s after the record write,
OfflineChecker 10s (marks an agent offline after 30s without a heartbeat),
Aggregator 1h (`records` into `records_hourly`), Cleanup 1h after aggregation,
PingTasksSync on config change, SessionCleaner 1h. Ordering guarantees are
stated: hourly is aggregate-then-clean so long-term data is not lost, minute is
write-then-evaluate so evaluation reads fresh data.

Schema tables listed: `users`, `sessions`, `api_keys`, `oauth_accounts`,
`servers`, `server_groups`, `server_tags`, `configs`, `records`,
`records_hourly`, `gpu_records`, `ping_records`, `ping_tasks`, `traffic_hourly`,
`traffic_daily`, `traffic_state`, `docker_events`, `alert_rules`, `alert_states`,
`notifications`, `notification_groups`, `tasks`, `task_results`, `audit_logs`.
Retention constants from `crates/common/src/constants.rs`: records 7 days,
records_hourly 90 days, gpu_records 7 days, ping_records 7 days, audit logs 180
days.

The server does not terminate TLS. From `apps/docs/content/docs/en/deployment.mdx`:
"ServerBee does not terminate TLS itself. All HTTPS/WSS encryption is handled by
the reverse proxy in front of it (Nginx/Caddy/Traefik)." It does support
`server.trusted_proxies` and `extract_client_ip` honouring `X-Forwarded-For`.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/apps/docs/content/docs/en/architecture.mdx
Label: [verified]

### F13. The dashboard is a React 19 SPA embedded via rust-embed, and there is a typed widget SDK that is the project's only extension/portability mechanism

Claim: the frontend is a Vite 7 / React 19 / TanStack SPA compiled into the
server binary. Separately, `packages/widget-sdk` is a versioned, typed extension
surface for dashboard widgets.

Evidence: `apps/web/package.json`, name `@serverbee/web`, version
`1.0.0-beta.6`. Runtime dependencies include React 19.2.0, react-dom 19.2.0,
`@tanstack/react-query` 5.90.21, `@tanstack/react-router` 1.166.7,
`@tanstack/react-table` 8.21.3, `@xterm/xterm` 6.0.0, `@monaco-editor/react`
4.7.0, `@visx/*` (pinned to `4.0.1-alpha.0`), `tailwindcss` 4.1.17,
`zustand` 5.0.12, `i18next` 25.8.18, `qrcode`, `react-grid-layout`, `motion`,
`nuqs`, `sonner`, `lucide-react`, `shadcn`, `boneyard-js` 1.9.0, and
`@serverbee/widget-sdk` as `workspace:*`. Build is `tsc -b && vite build`.
657 files under `apps/web`.

`packages/widget-sdk/README.md` is 241 bytes and reads in full: "Stable API
surface for ServerBee custom widgets. Authors `import { defineWidget, z,
useMetric } from '@serverbee/widget-sdk'`." Its source files are
`define-widget.ts` (1,618), `manifest.ts` (4,167), `runtime-context.ts` (2,197),
`actions/action-button.tsx` (2,323), `actions/index.ts` (1,220),
`form/field-renderers.tsx` (4,313), `form/index.tsx` (1,385),
`hooks/domain.ts` (2,208), `hooks/escape-hatch.ts` (1,977), `hooks/host.ts`
(495), `hooks/live.ts` (2,610), `index.ts` (775), `z/primitives.ts` (4,841),
`z/validate.ts` (197), plus 13 test files. `apps/web/src/api/widget-modules.ts`
loads widget modules at runtime and `apps/web/public/runtime/widget-sdk.js` is
a prebuilt runtime bundle served to the browser.
`apps/web/src/builtin-widgets/hello-world.widget.tsx` is a 1,327-byte
single-file example.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/packages/widget-sdk/README.md
Label: [verified]

### F14. The project already contains a Cloudflare Worker, which is direct precedent for "SPA on Cloudflare, data plane on my own metal"

Claim: `apps/push-relay` is a stateless Cloudflare Worker that sits between the
self-hosted ServerBee server and Apple APNs, holding the publisher's APNs
private key and forwarding ciphertext it cannot read.

Evidence: `apps/push-relay/` contains `wrangler.jsonc` (570 bytes), `src/relay.ts`,
`src/limits.ts`, `tests/relay.test.ts`, `vitest.config.ts`,
`vitest.ingress.config.ts`, `tsconfig.json`, `README.md` (10,252 bytes).
`package.json` is `@serverbee/push-relay`, devDependencies
`@cloudflare/workers-types 5.20261003.1`, `wrangler 4.116.0`, `miniflare
4.20260730.0`, `vitest 4.1.11`, `@cloudflare/vitest-pool-workers 0.19.1`,
`esbuild 0.28.2`, `typescript 5.9.3`. Scripts include `wrangler dev`,
`wrangler deploy --dry-run`, `wrangler deploy`.

`apps/docs/content/docs/en/push-relay.mdx` describes the architecture as
"Server -> dedicated ServerBee Cloudflare Worker -> APNs -> iOS Notification
Service Extension", with "one public `POST /v1/send`", "no App Attest, ...
durable Relay database", and "The Server owns subscriptions, user/session
authorization, encrypted pending work and final task aggregation. Relay holds
the publisher's APNs credentials and forwards ciphertext." The relay runs on
Web APIs, WebCrypto and fetch. It explicitly declines to assume a paid plan:
"no paid plan or WAF feature is assumed", and rate state is "best effort and
local to each Worker isolate: isolates restart and scale independently. It is
not a global budget".

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/apps/docs/content/docs/en/push-relay.mdx
Label: [verified]

### F15. Maturity: alive, but pre-1.0 and a prerelease at that

Claim: the project is actively maintained as of 2026-10-29, but the newest
release is a beta and there is no stable 1.x.

Evidence:
- Latest release `v1.0.0-beta.6`, published 2026-10-06T05:40:21Z,
  `prerelease: true`. Prior releases: beta.5 2026-10-05, beta.4 2026-09-30,
  beta.3 2026-09-29, beta.2 2026-09-24, beta.1 2026-08-10, alpha.12 2026-08-02,
  alpha.11 2026-07-02, alpha.10 2026-06-21, alpha.9 2026-06-20, alpha.8
  2026-06-19, alpha.7 2026-06-14, alpha.6 2026-05-31, alpha.5 2026-05-28,
  alpha.4 2026-05-26, alpha.3 2026-05-24, alpha.2 2026-05-24, alpha.1
  2026-05-22. That is 17 releases in 137 days.
- Last commits on `main`: `ff409d11` 2026-10-17T18:05:11Z (merge of PR #219),
  `4ba2dc2d`, `67d530e9`, `4b19ed5f`, `6472b3da`, `786cb130` all 2026-10-17,
  `1709ac5c` 2026-10-16, `303f9e73` 2026-10-16, then the beta.6 release batch
  on 2026-10-06. So 12 days between the last commit and today.
- Open PRs: #221 (2026-10-28, "docs: add Deploy to Light Cloud button"), #220
  (2026-10-18), #122 (2026-05-26, a dependabot `rand` 0.8.5 to 0.9.4 bump that
  has sat open for five months). Open non-PR issues: 26 (the repo API's
  `open_issues_count` of 29 includes those 3 PRs). Oldest open issue is #16
  from 2023-02-13. Closed non-PR issues: 17.
- The Railway deployment template pins `SERVERBEE_IMAGE_TAG=1.0.0-beta.6`
  deliberately: "This avoids silently deploying the older image behind
  `:latest` while ServerBee has no stable `1.x` release."

Label: [verified]

### F16. Test and coverage claims, counted rather than repeated

Claim: the project has a large automated test suite. The README's headline
numbers do not match a direct count, and the coverage figure is unaudited.

Evidence: `README.md` claims "3,800+ automated tests", "3,200+ Rust (unit + 42
integration suites that drive the real Axum router over HTTP/WebSocket with a
mock-agent harness) and 600+ frontend Vitest tests", and "over 91% measured Rust
region coverage ... common ~98%, agent ~90%, server ~92%".

My own counts on the cloned tree: 3,478 occurrences of `#[test]` or
`#[tokio::test]` under `crates/`; 51 files under `crates/server/tests/`; 136
`*.test.ts*` files under `apps/web/src` and `packages/`; 39 files under
`tests/1.0.0/` (numbered 01 through 38 plus `README.md`), which are manual
acceptance checklists rather than automated tests.

The gap between "3,800+" and my 3,478 Rust test attributes plus 136 frontend
test files is not explained by anything I can point at, so I report the raw
counts and treat the headline as [unverified]. The 91% coverage figure I did not
attempt to reproduce; `cargo-llvm-cov` was not run. Label for both headline
numbers: [unverified].

Label: [verified] for my counts; [unverified] for the README's totals.

### F17. Licence is AGPL-3.0-or-later, and the consequence for a hosted control plane is concrete

Claim: the workspace licence string is `AGPL-3.0-or-later` and the `LICENSE`
file is the GNU Affero General Public License v3.

Evidence: root `Cargo.toml`, `[workspace.package] license =
"AGPL-3.0-or-later"`. `LICENSE` begins "GNU AFFERO GENERAL PUBLIC LICENSE,
Version 3, 19 November 2007". GitHub API reports `license.spdx_id` =
`AGPL-3.0`, `license.name` = "GNU Affero General Public License v3.0". The
README badge reads "License: AGPL v3".

Consequence, stated plainly: AGPL section 13 requires that a modified version
offered to users interacting with it over a network must offer those users the
Corresponding Source. The operator's architecture is precisely "a management SPA
hosted on Cloudflare, driving my own server". If the operator forks
`serverbee-server`, modifies it, and points the SPA at it while anyone other
than the operator uses that SPA, the source-offer obligation attaches to the
whole modified work, not just the changed lines. If the deployment is the
operator's own private use with no other users, the obligation is not triggered.
Separately, linking `serverbee-common` into a distributed agent binary makes the
combined work subject to AGPL when conveyed.

The protocol types in `crates/common/src/protocol.rs` are data definitions
(serde structs and enums). A clean-room reimplementation that speaks the same
JSON is not a derivative work of the Rust source, which is the cheapest way out
if the operator ever wants to ship.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/LICENSE
Label: [verified]

### F18. The README carries a stale version claim that the artefacts contradict

Claim: `README.md` states "ServerBee is in active development (`v1.0.0-alpha.12`).
Expect rapid iteration." while the current workspace version and newest release
are both `1.0.0-beta.6`.

Evidence: `README.md` note block, versus `Cargo.toml` `version = "1.0.0-beta.6"`,
the `v1.0.0-beta.6` release, and `CHANGELOG.md`'s top released section
`## [1.0.0-beta.6] - 2026-10-06`. This is a documentation-versus-code
disagreement, and it is a live example of why README claims in this repository
should be treated as unverified until matched against an artefact.

Label: [verified]

### F19. A cross-agent request-forgery vulnerability was found and fixed in beta.4, which is evidence both of real security review and of the trust model's sharp edges

Claim: before `v1.0.0-beta.4`, the server matched an agent's reply to a pending
request by the id inside the reply alone, so one connected agent could answer
another server's scheduled task and record a forged exit code and output.

Evidence: `CHANGELOG.md`, `## [1.0.0-beta.4] - 2026-09-30`, Security section:
"Agents can only answer requests sent to their own server -- The Server matched
an Agent's reply to a pending request by the id inside the reply alone, so one
connected Agent could answer a scheduled task run on another server and record a
forged exit code and output for it (#187, reported by @Koukyosyumei). Replies
are now accepted only from the server the request was sent to, and the same
check covers terminal sessions, file downloads and uploads, and Docker
requests." A second entry in the same release covers task results stored for
task ids that never targeted the reporting agent.

Also in the changelog: beta.5 fixed a "Documentation server-function XSS" by
upgrading TanStack Start, and beta.6's release batch includes
`dede3c37 fix(apns): remove vulnerable legacy tls dependencies`.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/CHANGELOG.md
Label: [verified]

### F20. Enrollment and idempotent onboarding are already designed as a control-plane-friendly contract

Claim: server onboarding is an idempotent, actor-scoped operation that returns a
single-use short-lived code exactly once, with compare-and-swap semantics on
offer replacement.

Evidence: `apps/docs/content/docs/en/api-reference.mdx`, "Agent Authority and
Enrollment" section. `POST /api/servers` takes a required `onboarding_request_id`
"scoped to the authenticated actor"; retrying the same id with identical
normalized input returns the same `server_id`, reusing it with different input
returns `409 ONBOARDING_IDEMPOTENCY_CONFLICT`. A new operation returns
`replayed: false` and `enrollment: { id, code, code_prefix, expires_at }`; a
replay returns `replayed: true`, "never returns plaintext `code`". Offer
lifecycle: "Only one offer may be outstanding per Server. Its terminal outcome
is exactly one of `consumed`, `revoked`, `replaced`, or `expired`.
Exact-ID replacement is compare-and-swap: stale or terminal offers return `409`
and cannot overwrite newer state." Re-enrollment has `graceful` (old authority
stays valid) and `emergency` (revoke and fence immediately) modes. Authority and
offer transitions append secret-free events that "survive Server deletion".

Label: [verified]

### F21. ServerBee has no inbound-port requirement on the agent, and its own docs never ask the operator to open one

Claim: nothing in the deployment or agent documentation asks the operator to
open an inbound port on a monitored host.

Evidence: `apps/docs/content/docs/en/agent.mdx` describes the agent as
collecting metrics and reporting "to the central ServerBee server over a
persistent WebSocket connection", and its "Connection Behavior" section
describes only outbound behaviour: heartbeat every 30s, offline after 30s of
silence, and the five-step handshake beginning "The server sends a `Welcome`
message". The "Reverse Proxy" guidance in `deployment.mdx` concerns the server
only ("proxy `/` to `127.0.0.1:9527` and make sure the WebSocket routes
`/api/ws/` and `/api/agent/ws` forward the `Upgrade`/`Connection` headers with a
long read timeout"). `docker-compose.yml` binds `127.0.0.1:9527` on the server
side. `Dockerfile.agent` is 5 lines on `alpine:3.21` with `ca-certificates` and
a single `COPY` of the agent binary, no `EXPOSE`.

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/Dockerfile.agent
Label: [verified]

### F22. The install path is a single POSIX shell script that installs a `serverbee` CLI and adopts an existing binary rather than overwriting it

Claim: one installer handles server and agent, Docker and native, systemd and
OpenRC, and installs a management CLI. It deliberately does not clobber an
existing binary.

Evidence: `deploy/install.sh` is 4,522 lines and 173,080 bytes, "POSIX sh (runs
under dash and busybox ash). Supports systemd and OpenRC", `BASE_DIR="/opt/serverbee"`.
Documented invocations:
`curl -fsSL .../deploy/install.sh | sudo sh -s -- server` and
`... | sudo sh -s -- agent --server-url http://your-server-ip:9527 --enrollment-code YOUR_ONE_TIME_CODE`,
with `--method docker|binary`. `deploy/test-install-upgrade.sh` is 41,814 bytes. The two example unit files are
small: `deploy/serverbee-agent.service` is 509 bytes and
`deploy/serverbee-server.service` is 303 bytes. The docs note: "`install server`
/ `install agent` are bootstrap commands. If the binary already exists in
`/usr/local/bin`, the installer adopts it instead of overwriting it."

URL: https://github.com/ZingerLittleBee/ServerBee/blob/main/deploy/install.sh
Label: [verified]

---

## 2. What this changes for the redesign

Written against the two new requirements: (a) portability of application code
between Cloudflare and the self-hosted backend, and (b) one small agent binary
per server instead of many heavy ones.

### 2.1 ServerBee is the right structural precedent and the wrong functional scope

It is the right precedent because it already answers "what does one small agent
per server plus one aggregating server look like, in Rust, with a real wire
protocol". It is the wrong functional scope because everything above the metrics
layer is observability: Docker listing, not container creation; remote command
exec, not a job queue; a restricted file browser, not an object store. Do not
plan to extend ServerBee into the data plane. Plan to copy its agent/server
seam and write the compute, storage and CI capabilities as new modules behind
that seam.

### 2.2 Take the enrollment and credential model verbatim. It is the correct bootstrap for machines behind NAT

The agent generates 32 random bytes, persists them locally, and only then
submits them as `proposed_run_token` against a single-use, server-bound,
short-lived offer. The server stores an argon2 hash and never returns the
plaintext. Persistence happens before the claim, so a failed write can never
burn the offer. A 401 on the WebSocket upgrade triggers re-enrollment rather
than a silent retry loop, and a permanent auth failure exits 78 so systemd's
`RestartPreventExitStatus=78` stops the restart loop instead of hammering the
server.

Reason: this is exactly the trust problem the redesign has. The operator's
machines are behind NAT, joined by Cloudflare Tunnel, and the control plane is
on Cloudflare. There is no shared network to bootstrap trust over. An
agent-proposed credential claimed against a short-lived server-bound code is the
shape that works there, and it is already implemented and tested.

Copy: `crates/agent/src/register.rs` and `crates/agent/src/run_token_store.rs`,
plus the offer lifecycle and the `onboarding_request_id` idempotency contract
from the API reference.

### 2.3 Take the outbound-only dial, the backoff, and the capability authority. Do not take the protocol payload

Keep:
- outbound-only WebSocket client, no listener (F2, F11)
- exponential backoff to 30s with 20% jitter and a 0.5s floor (F3)
- agent-owned capability bitmask with `allow`/`deny` over a conservative default
  of 1852, and host-local temporary grants with a bounded `--for` duration, an
  audit event on every transition, and local reality probes that drop a
  capability bit when the underlying tool is missing (F6)
- transactional self-upgrade with checksum verification, optional SPKI pinning,
  preflight probe, and rollback (F10)

Drop: `crates/common/src/protocol.rs` is 73,737 bytes and carries Docker,
IP-quality, traceroute, upgrade, firewall, file-transfer and capability DTOs.
The new agent needs none of those payloads. Port the *shape* (a versioned enum
with `#[serde(tag = ...)]`, `msg_id` on messages that need an ACK, a `Welcome`
that carries `server_id` plus a server-chosen `report_interval`, a 30s `Ping` /
`Pong` heartbeat with a 30s offline threshold) and leave the payload behind.

Reason: the shape is what makes the protocol evolvable and the heartbeat
semantics unambiguous. The payload is dead weight that will drag in bollard,
trippy-core and nine streaming-unlock detectors.

### 2.4 Put the tunnel inside the agent binary, not beside it

The agent already speaks `wss://` with an `Authorization: Bearer` header,
already reconnects with backoff, and already has a credential the control plane
issued. A quick-tunnel connection (the `cfrs` model, E6) can live in the same
process and reuse the same enrollment. That satisfies requirement (b) directly:
one binary per server that is simultaneously the tunnel connector, the
orchestrator interface and the broker.

Concretely, the single agent binary should own four concerns and nothing else:
1. an outbound control WebSocket to the Cloudflare-hosted hub (ServerBee's
   `reporter` shape)
2. a quick-tunnel / tunnel-registration client (cfrs's job)
3. a capability-gated executor: `exec`, `terminal`, `container`, `transfer`
4. a broker: a durable local outbox plus a request/response correlation layer

ServerBee gives you (1) and most of (3). It gives you none of (2) and almost
none of (4). Those two are the net-new work, and they are the two the operator
named.

### 2.5 The agent's missing proxy support is a real gap for the tunnel design

The agent client has no HTTP CONNECT proxy and no SOCKS support (F11). A
quick-tunnel client that must reach `region1.v2.argotunnel.com` from behind a
corporate or restrictive egress will need one. Decide early whether the new
agent carries a proxy-aware connector or documents "direct egress required".
Note that this is also true of cloudflared, so it is not a differentiator, but
it is a deployment constraint worth writing down rather than discovering.

### 2.6 Use the OpenAPI surface as the control-plane contract, and generate the Workers SPA from it

ServerBee generates `/api-docs/openapi.json` from `utoipa` annotations in the
server binary and serves Swagger UI at `/swagger-ui/`. The checked-in document
is 374,002 bytes, OpenAPI 3.1.0, 145 paths, 195 operations (F9). That is the
right pattern: the control-plane API is a generated artefact with a schema, not
a set of routes the SPA happens to call.

Recommendation: the new control plane should publish an OpenAPI 3.1 document
from its own annotations, and the Cloudflare-hosted SPA should have its client
generated from it. ServerBee's `apps/web` already runs
`generate:api-types` (`cargo run --example dump_openapi > openapi.json && npx
openapi-typescript openapi.json -o src/lib/api-types.ts`), which is the exact
loop to copy.

### 2.7 Portability (requirement a): ServerBee contributes almost nothing, and the one thing it does contribute is the widget SDK pattern

ServerBee is an observability product. Nothing in it makes user application code
runnable on both Cloudflare Workers and self-hosted metal. Its compute story
stops at `docker action start|stop|restart|remove` on containers that already
exist (F11), so it cannot host a portable workload at all.

The one transferable idea is `packages/widget-sdk` (F13): a typed, versioned
extension surface with a manifest, zod-style validation
(`defineWidget`, `z`, `useMetric`), a runtime context, an escape hatch, and a
prebuilt runtime bundle served to the browser. That is the correct shape for
"code written once, runs in both places", but it applies to dashboard widgets
only. It says nothing about Workers or Durable Objects semantics, and it should
not be presented as though it does.

The honest statement for the redesign: portability of *application* code has to
come from the runtime layer (`workerd` on own metal versus Workers on Cloudflare,
which is A3/E5 territory), not from ServerBee. ServerBee's contribution to
requirement (a) is a worked example of a typed extension boundary, plus one
precedent.

### 2.8 The push-relay Worker is direct precedent for the operator's hard constraint

`apps/push-relay` is a stateless Cloudflare Worker sitting between a self-hosted
ServerBee server and APNs, holding the publisher's private key and forwarding
ciphertext it cannot read (F14). The server keeps the durable business outbox;
the Worker keeps the secret and does the fan-out.

That is the operator's architecture in miniature, already shipping in this
repository: control plane on Cloudflare, data plane on own metal, secret held at
the edge, state held at the origin. Use it as the reference shape for the
Workers-hosted manager, and note its explicit refusal to assume a paid plan or
a WAF, and its honest statement that per-isolate rate state is not a global
budget. Those are the same limits the redesign will hit.

### 2.9 Decide the licence question before writing code, not after

AGPL-3.0-or-later (F17). Three viable paths, in order of how much freedom they
buy:
1. Fork `serverbee-server` and `serverbee-agent`, modify, and run them purely
   for the operator's own use with no other users. No source obligation is
   triggered. Cheapest path, zero licence risk.
2. Reimplement the protocol clean-room. The shared surface is serde data
   definitions in `crates/common/src/protocol.rs`, not logic. A permissively
   licensed clean-room agent and server that speak the same JSON carries no
   AGPL obligation and can be shipped.
3. Fork, modify, and offer the SPA to other people. Section 13 then requires
   offering the Corresponding Source of the whole modified work. This is the
   path to avoid unless the operator wants to open-source the control plane.

Recommendation: path 1 to prototype, path 2 for anything that ships. Decide
before the first commit, because retrofitting a licence is a rewrite.

### 2.10 Treat "lightweight" as a claim to measure, not a property

The same documentation page that advertises a tiny footprint also records a
Railway run at 800 MB to 1 GB after two to three days with no controlled
comparison, and a diagnosed 20 MB/day idle leak in `v1.0.0-beta.1` caused by the
release toolchain's allocator (F8). The agent's own 8-hour reading is explicitly
flagged as not establishing a plateau.

Recommendation: the redesign should carry a memory soak as a standing gate, not
a one-off. ServerBee wrote one
(`tests/manual/server-memory-soak.md`, referenced from the resource-usage page)
and it caught a real regression. Copy that. Budget for it in CI rather than
discovering it in production.

### 2.11 One concrete thing not to copy

The server relays all terminal, file and Docker traffic (F4). Browser connects
to the server, the server connects to the agent. That makes the server a
bottleneck and a universal trust point, and it is why the beta.4 cross-agent
forgery bug (F19) was possible at all: the server was correlating replies by an
attacker-supplied id. The new broker should correlate by connection identity,
not by an id in the payload, and should consider letting the agent be reachable
through the tunnel so high-volume transfers do not traverse the hub.

---

## 3. Not covered / open questions

Named precisely, with what would settle each.

1. **Whether the agent's WebSocket client survives a Cloudflare Tunnel or a
   Workers-based hub.** I verified the client is a plain
   `tokio-tungstenite 0.26` with `rustls-tls-webpki-roots` and an
   `Authorization: Bearer` header. I did not test it against a Cloudflare
   Worker WebSocket endpoint or a `cloudflared`-exposed origin. What would
   settle it: point a built agent at a Workers WebSocket Durable Object and at
   a quick-tunnel origin, and read the handshake result.

2. **Whether the 27 MB steady-state agent memory figure holds for the current
   beta.6 on musl.** The figure is from v0.9.3 on 2026-05-19 with the host libc
   unrecorded, and the docs themselves say the readings do not establish a
   plateau. What would settle it: run beta.6 linux-musl for 72 hours under a
   cgroup and read the peak.

3. **The 91% coverage claim and the "3,800+ tests" headline.** I counted 3,478
   Rust test attributes, 51 server integration files, 136 frontend test files,
   and 39 manual acceptance files. I did not run `cargo-llvm-cov`. What would
   settle it: run `cargo llvm-cov` on `HEAD` and count the test binary's
   collected tests.

4. **Whether the agent can be driven without the ServerBee server at all.** The
   protocol is symmetric enough in principle (the agent is a client), but
   nothing in the tree demonstrates an agent talking to a non-ServerBee hub.
   What would settle it: a minimal Rust or TypeScript hub that speaks
   `Welcome` / `SystemInfo` / `Report` and accepts an agent connection.

5. **How the capability authority behaves under a tunnel-mediated control
   plane.** `CapabilityAuthority` polls a local JSON file every 3 seconds and
   the grant CLI is host-local. I did not examine whether a control plane could
   request a grant rather than the operator running the CLI on the box. The
   design comment is emphatic that capabilities are agent-owned and "the server
   cannot change these", which suggests the answer is no, but I did not trace
   the full request path. What would settle it: read
   `crates/agent/src/capability_grants/authority.rs` end to end and check
   whether any `ServerMessage` variant writes to the grants store.

6. **Container lifecycle depth.** I verified the Docker surface is
   inspect plus `action` on existing containers, from the API reference and the
   `bollard` call sites. I did not enumerate every `bollard` method called in
   `crates/agent/src/docker/`. What would settle it: grep
   `docker\.(create_image\|create_container\|create_volume\|create_network)`
   across `crates/agent/src/docker/`.

7. **iOS app relevance.** `apps/ios` is roughly 1.66 MB of Swift with its own
   `APIClient`, `AuthManager`, `WebSocketClient` and push pipeline. I did not
   assess it. It is probably irrelevant to the redesign, but it is a large
   fraction of the repository and it duplicates the protocol in Swift, which is
   incidental evidence that the protocol is stable enough to reimplement.

8. **Anything about the two other E-topics' repos.** This file covers ServerBee
   only. Homelable, CoreObs, omnyssh, mirrord and cfrs are other subagents'
   scope. Where I refer to cfrs (E6) it is as the operator named it, not as
   something I read.

9. **Whether `serverbee` CLI's "adopt an existing binary" behaviour can be
   reused for the new single agent's install path.** I read the documentation
   sentence and the installer's structure but did not trace the adopt logic.
   What would settle it: read the `install_cli` and binary-adoption branches of
   `deploy/install.sh`.
