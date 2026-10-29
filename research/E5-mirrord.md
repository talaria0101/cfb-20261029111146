# E5-mirrord: metalbear-co/mirrord

Research subagent E5-mirrord for the architecture redesign. All sources read on 2026-10-29
(UTC). Method: pkgforge tinyfish gateway for web search, `gh api` (authenticated) for all
GitHub metadata, file contents, trees, releases, commits and issues, plus `curl` against
crates.io and the crates.io sparse index. No fallback to the built-in web_search/web_fetch
tools was needed; every call succeeded. Anything not read from a primary source is labelled
[unverified].

---

## 1. Findings

### F1. Repository identity and health [verified]

- **Claim:** metalbear-co/mirrord is a very large, very actively maintained Rust workspace.
- **Evidence:** `gh api repos/metalbear-co/mirrord` ->
  `{"full_name":"metalbear-co/mirrord","stargazers_count":5390,"forks_count":223,"open_issues_count":23,"watchers_count":5390,"language":"Rust","created_at":"2022-02-01T16:42:30Z","pushed_at":"2026-10-29T08:35:35Z","default_branch":"main","size":72061,"archived":false,"has_discussions":true,"has_wiki":false,"homepage":"https://metalbear.com/mirrord"}`.
  Tree walk (`gh api repos/metalbear-co/mirrord/git/trees/HEAD?recursive=1`): 2132 entries,
  73 `Cargo.toml` files, 9,471,076 bytes of `.rs` source across the tree.
  Newest commit: `gh api repos/metalbear-co/mirrord/commits?per_page=5` -> `1cd28b29`,
  `2026-10-29T01:37:07Z`, "Merge pull request #5151 ... cor-2040-cwd-ancestors-local".
  So the repo was pushed to on the same day this file was written.
- **Label:** [verified]

### F2. Licence is MIT, but GitHub does not auto-detect it [verified]

- **Claim:** The licence is the MIT permission text. GitHub's licence API reports
  `spdx_id: null` and `name: "mirrord"`, because the copyright line is non-standard and
  defeats the SPDX matcher. The workspace declares `license = "MIT"`, and the README badge
  reads `license-MIT`.
- **Evidence:** `gh api repos/metalbear-co/mirrord/license` ->
  `{"name":"LICENSE","path":"LICENSE","sha":"7dbb9bb89ccf5c96bce636cc3519e234db47b0f6","size":1066,"spdx_id":null}`.
  `gh api repos/metalbear-co/mirrord/contents/LICENSE` base64-decoded begins
  `Copyright 2022-present Metalbear Tech LTD` followed by the verbatim MIT permission,
  conditions and warranty paragraphs. Root `Cargo.toml` `[workspace.package]` ->
  `license = "MIT"`. README.md -> `[![License](https://img.shields.io/badge/license-MIT-green)]`.
- **Consequence for the redesign:** no copyleft, no network clause, no field-of-use
  restriction. The protocol crate, the codec, the layer and the intproxy can be vendored
  into a `cfrs`-derived agent or forked outright with only an attribution notice.
- **Label:** [verified]

### F3. The protocol crate carries its own separate MIT licence file [verified]

- **Claim:** `mirrord/protocol` has its own `LICENSE` (1051 bytes, "Copyright 2022
  Metalbear.co") in addition to the workspace one, so the wire-format crate is separately
  attributable.
- **Evidence:** tree entry `blob mirrord/protocol/LICENSE 1051`;
  `gh api repos/metalbear-co/mirrord/contents/mirrord/protocol/LICENSE` -> MIT permission
  text with `Copyright 2022 Metalbear.co`.
- **Label:** [verified]

### F4. Maturity: 3.281.0, released roughly every two days, 23 open issues almost all fresh [verified]

- **Claim:** The project is on a fast release train. Newest release 3.281.0 published
  2026-10-28T23:28:24Z, i.e. under 14 hours before this file was written.
- **Evidence:** `gh api repos/metalbear-co/mirrord/releases` (read 2026-10-29) -> newest
  first: `3.281.0` 2026-10-28T23:28:24Z, `3.280.0` 2026-10-27T15:40:37Z,
  `3.279.1` 2026-10-25T10:54:20Z, `3.279.0` 2026-10-24T20:51:50Z, `3.278.0`
  2026-10-22T22:13:20Z, `3.277.0` 2026-10-21T15:47:20Z, `3.276.0` 2026-10-19T18:25:53Z,
  `3.275.0` 2026-10-17T17:47:01Z, `3.274.0` 2026-10-14T23:38:50Z. All `prerelease:false,
  draft:false`, all with 18 assets.
  `gh api repos/metalbear-co/mirrord/issues?state=open&per_page=30` -> 30 shown, of which
  28 were created on or after 2026-10-15; the two outliers are #2525 (2024-06-13) and #5100
  (2026-10-18). Titles such as "protocol: add HttpFilter::Not, a negated HTTP filter"
  (#5172, 2026-10-29T07:47:26Z) and "Enable Linux filesystem interception fixes by default
  for OSS" (#5146, 2026-10-26) show the wire protocol and the interception layer are both
  still moving.
- **Label:** [verified]

### F5. Architecture: eleven separable components, and the split is the point [verified]

- **Claim:** mirrord is not one binary. `AGENTS.md` and `docs/reference/architecture.md`
  name the components, and each is its own crate.
- **Evidence:** `gh api repos/metalbear-co/mirrord/contents/AGENTS.md` "Core Crates"
  section names `mirrord-layer` (LD_PRELOAD/DYLD_INSERT_LIBRARIES, hooks libc, turns calls
  into protocol messages), `mirrord-intproxy` ("a local process spawned by the CLI that
  bridges N layers and 1 agent. Matches requests to responses, handles reconnects, and
  routes messages to the right feature proxy"), `mirrord-agent` ("the in-cluster component
  ... Runs in the target pods' context and network namespace. Does the actual I/O work
  requested by the layers"), `mirrord-protocol` ("defines the shared messages
  (`ClientMessage`, `DaemonMessage`)"), `mirrord-config` ("config types and validation"),
  `mirrord` (the CLI), `mirrord-mcp` (the MCP server over stdio).
  `docs/reference/architecture.md` adds `mirrord-layer-win` (a Windows DLL that "selectively
  overrides functions at the lowest level we can get to in user-mode, often right before
  your operation is dispatched to the kernel through a syscall"), the VS Code extension and
  the JetBrains plugin.
  The tree additionally contains `mirrord/operator` (CRDs), `mirrord/intproxy`,
  `mirrord/protocol-io`, `mirrord/cluster-auth`, `mirrord/sessions-manager/{client,protocol}`,
  `mirrord/operator-websocket`, `mirrord/tui`, `mirrord/up`, `mirrord/sip`,
  `mirrord/analytics`, `mirrord/console`, `mirrord/jaq`, `mirrord/tls-util`,
  `mirrord/session-monitor-{client,protocol}`, `mirrord/medschool`, `packages/monitor`
  (React frontend).
- **Label:** [verified]

### F6. The agent is a plain TCP server on port 61337 and needs no Kubernetes to listen [verified]

- **Claim:** `mirrord-agent` binds a TCP listener on a configurable port, default 61337,
  and accepts the bincode protocol directly. Optional TLS is pinned to a single operator
  certificate. The binary is Linux-only.
- **Evidence:** `mirrord/agent/src/cli.rs` -> `#[arg(short = 'l', long, default_value_t = 61337)] pub communicate_port: u16`,
  `#[arg(short = 't', long, default_value_t = 30)] pub communication_timeout: u16`,
  `pub metrics: Option<SocketAddr>` (`--metrics`, env `MIRRORD_AGENT_METRICS`),
  `pub operator_tls_cert_pem: Option<String>` (`--operator-tls-cert-pem`, env
  `AGENT_OPERATOR_CERT_ENV`), `pub clean_iptables_on_start: bool`,
  `pub is_mesh: bool`, `pub ipv6: bool`. `Mode` subcommand enum: `Targeted { container_id,
  container_runtime }`, `Ephemeral`, `Targetless` (`#[default]`), `WorkloadCompanion`.
  `mirrord/agent/src/main.rs` -> `#[cfg(target_os = "linux")] #[tokio::main(flavor = "current_thread")]`,
  and the non-Linux arm prints `"mirrord-agent is only supported on Linux"` and exits 1.
  `mirrord/agent/src/entrypoint.rs` lines 972-1005 -> builds the listener with
  `TcpSocket::new_v6()`, `set_reuseaddr(true)`, `SockRef::from(&listener).set_only_v6(false)`,
  `listener.listen(1024)`, falling back to `TcpSocket::new_v4()` on failure.
  `mirrord/agent/src/client_connection.rs` -> `AgentTlsConnector` "Can make successful TLS
  connections only to the server using a predefined certificate"; it requires exactly one
  SAN in the first PEM block.
- **Label:** [verified]

### F7. The transport is an enum, and that is the single most reusable design decision [verified]

- **Claim:** The client side does not know how it reaches the agent. `AgentConnectInfo` has
  five real variants plus a test variant, and everything downstream of the enum is
  transport-agnostic.
- **Evidence:** `mirrord/intproxy/src/agent_conn.rs` ->
  ```rust
  pub enum AgentConnectInfo {
      ExternalProxy { proxy_addr: SocketAddr, tls_pem: Option<PathBuf>, sidecar_protocol: bool },
      Operator(Box<OperatorSession>),
      DirectKubernetes(AgentKubernetesConnectInfo),
      SessionsManager(SessionsManagerConnectInfo),
      OperatorSessionsManager(SessionsManagerConnectInfo),
      #[cfg(test)] Dummy(...),
  }
  ```
  with `impl fmt::Display for AgentConnectInfoDiscriminants` mapping them to the strings
  `"external proxy"`, `"operator"`, `"agent"`, `"sessions_manager"`,
  `"operator_sessions_manager"`, `"dummy"`.
  `AgentKubernetesConnectInfo` (in `mirrord/kube/src/api/kubernetes.rs`) is
  `{ pod_name, pod_namespace, agent_port, .. }`, and `create_connection` either dials the
  pod IP directly (`tokio::time::timeout(Duration::from_secs(self.agent.startup_timeout),
  TcpStream::connect((ip, *agent_port))`) or goes through
  `portforwarder::retry_portforward`.
- **Label:** [verified]

### F8. Wire format: bincode 2 over a 4-byte big-endian length prefix, with a documented compatibility contract [verified]

- **Claim:** The layer-to-proxy codec is a u32 BE length prefix followed by a bincode
  payload. The protocol crate is versioned independently of the workspace and CI enforces a
  bump on any change to it.
- **Evidence:** `mirrord/intproxy/protocol/src/codec.rs` doc comment: "An encoded message
  consists of two parts: * prefix: 4 bytes containing payload length in bytes (big-endian
  [`u32`]) * payload: a value of a known type, encoded with [`bincode`]". The encoder does
  `bincode::encode_into_std_write(value, &mut self.buffer, bincode::config::standard())`
  then writes `bytes.to_be_bytes()` into the first `PREFIX_BYTES = 4`.
  `mirrord/protocol/AGENTS.md` -> "The wire format is generated by the Rust types layouts
  through `bincode`, so the declarations in this crate _are_ the wire format", lists safe
  changes (rename, same-representation type change, new variant at the end gated by a
  negotiated version) and breaking changes (add a field, `T` to/from `Option<T>`, reorder
  fields, reorder variants), and states "CI requires that any change under
  `mirrord/protocol/**` includes a `mirrord/protocol/Cargo.toml` version bump".
  `mirrord/protocol/Cargo.toml` -> `version = "1.30.0"` (workspace version is 3.281.0, so
  they have diverged).
  `mirrord/protocol/src/lib.rs` -> "The protocol is based on [`bincode`]. It is defined
  **only** by the Rust types in this crate." Version negotiation via
  `ClientMessage::SwitchProtocolVersion(#[bincode(with_serde)] semver::Version)` and
  `DaemonMessage::SwitchProtocolVersionResponse`, with `LazyLock<VersionReq>` constants.
- **Label:** [verified]

### F9. The protocol message surface is small and enumerable [verified]

- **Claim:** `ClientMessage` has 17 variants and `DaemonMessage` 15. This is the whole
  remote-I/O vocabulary.
- **Evidence:** `mirrord/protocol/src/codec.rs` lines 151-206 -> `ClientMessage::{Close,
  Tcp(LayerTcp), TcpSteal(LayerTcpSteal), TcpOutgoing(LayerTcpOutgoing),
  UdpOutgoing(LayerUdpOutgoing), FileRequest(FileRequest), GetEnvVarsRequest,
  Ping, GetAddrInfoRequest, PauseTargetRequest(bool), SwitchProtocolVersion(Version),
  ReadyForLogs, Vpn(ClientVpn), GetAddrInfoRequestV2, OperatorPong(u128),
  ReverseDnsLookup(ReverseDnsLookupRequest), SeqpacketOutgoing(LayerSeqpacket),
  ShareLink(ShareLinkRequest)}`. Lines 244-273 -> `DaemonMessage::{Close(String), Tcp,
  TcpSteal, TcpOutgoing, UdpOutgoing, LogMessage(LogMessage), File(FileResponse), Pong,
  GetEnvVarsResponse(RemoteResult<RemoteEnvVars>), GetAddrInfoResponse, PauseTarget,
  SwitchProtocolVersionResponse, Vpn(ServerVpn), OperatorPing(u128), ReverseDnsLookup,
  SeqpacketOutgoing}`. `FileResponse` has 19 variants covering Open, Read, ReadLimited,
  Write, WriteLimited, Seek, Access, Xstat, XstatFs, ReadDir, OpenDir, GetDEnts64,
  ReadLink, ReadDirBatch, MakeDir, RemoveDir, Unlink, and more.
  Note `RemoteEnvVars` has a custom `Debug` that prints `<REDACTED>`.
- **Label:** [verified]

### F10. How it makes a local process behave like a pod: environment variables [verified]

- **Claim:** The layer asks the agent for the target's environment before the process
  starts. Remote values win over local ones. A curated exclusion list stops the developer's
  machine from poisoning the process.
- **Evidence:** `docs/reference/env.md` -> "mirrord-layer sends a message to mirrord-agent
  requesting remote environment variables, which are then set before the local process
  starts." `docs/using-mirrord/environment-variables.md` -> "Local environment variables
  that aren't present in the remote pod are preserved. When a variable exists in both, the
  remote value wins." Options: `include`, `exclude` (semicolon separated, regex supported,
  mutually exclusive), `override` (a map applied after remote load), `env_file` (dotenv),
  `mapping` (regex on names, value replacement, cannot rename), `unset`.
  `mirrord/agent/src/env.rs` -> `EnvFilter` with a hardcoded `exclude` list of roughly 45
  names including `BUNDLER_ORIG_*`, `BUNDLE_*`, `CATALINA_HOME`, `CLASSPATH`,
  `DOTNET_EnableDiagnostics`, `DOTNET_STARTUP_HOOKS`, `GEM_HOME`, `GEM_PATH`, `GOPATH`,
  `GOMODCACHE`, `HOME`, `HOMEPATH`, `JAVA_EXE`, `JAVA_HOME`, `JAVA_TOOL_OPTIONS`, `PATH`,
  `PWD`, `PYTHONPATH`, `RUBYLIB`, `RUBYOPT`, `MIRRORD_LOG`, `RUST_LOG`, `_JAVA_OPTIONS`,
  `TEMP`, `TMP`, `TMPDIR`. The agent reads the target's environment from
  `/proc/<pid>/environ` (`mirrord/agent/src/entrypoint.rs` line 257:
  `let environ_path = PathBuf::from("/proc").join(env_pid).join("environ");`).
- **Label:** [verified]

### F11. How it makes a local process behave like a pod: files [verified]

- **Claim:** Four file modes, and the agent resolves remote paths through the target
  container's `/proc/<pid>/root`. Reads go remote by default; writes stay local by default.
- **Evidence:** `docs/reference/fileops.md` mode table: `local` ("All file operations
  happen on the local filesystem. mirrord doesn't touch fs syscalls"),
  `localwithoverrides`, `read` (default, "Reads go to the remote pod, writes go to the local
  filesystem"), `write` ("Both reads and writes go to the remote pod"). Plus `read_only`,
  `read_write`, `local` path override lists, all regex. "How does it work?" section:
  "mirrord-agent uses APIs provided by docker and containerd runtimes to get the PID of the
  remote container, and refers to the root directory of the remote container through
  `/proc/container_pid/root`".
  Hooked functions in `mirrord/layer/src/file/hooks.rs`: `open`, `open64`,
  `open_nocancel`, `opendir`, `readdir_r`, `readdir64_r`, `readdir64`, `readdir`, `openat`,
  `openat64`, `openat_nocancel`, `read`, `read_nocancel`, `lseek`, `write`,
  `write_nocancel`, `access`, `stat`, `statx`, `statfs`, `statfs64`, `readv`,
  `readv_nocancel`, `readlink`, `unlink`, `unlinkat`.
  Default read-locally list lives at `mirrord/layer-lib/src/file/unix/read_local_by_default.rs`
  (5703 bytes), with `not_found_by_default.rs` and `read_remote_by_default.rs` siblings, and
  Windows equivalents under `mirrord/layer-lib/src/file/windows/`.
- **Label:** [verified]

### F12. How it makes a local process behave like a pod: outgoing network and DNS [verified]

- **Claim:** The layer hooks the socket calls and dials a local socket served by the
  intproxy, which multiplexes over one agent connection. DNS resolves in the target's
  context. UDP has a documented limitation.
- **Evidence:** `mirrord/layer/src/socket/ops.rs` hooks `bind`, `listen`, `connectx`,
  `connect`, `accept`, `getaddrinfo`, `gethostbyname`. `mirrord/intproxy/src/layer_conn.rs`
  doc: "Implementation of `layer <-> proxy` connection through a [`TcpStream`]", with
  `codec::make_async_framed(stream)`. `mirrord/intproxy/src/lib.rs` doc: the intproxy
  "bridges N layers and 1 agent".
  `docs/reference/traffic.md` "Outgoing": "For UDP, outgoing traffic is currently only
  intercepted and forwarded by mirrord if the application binds a non-0 port and makes a
  `connect` call on the socket before sending out messages." The DNS section shows
  `getaddrinfo('user-service', None)` returning the cluster-internal ClusterIP
  `10.106.158.180`.
- **Label:** [verified]

### F13. How it makes a local process behave like a pod: incoming traffic, mirror vs steal, iptables [verified]

- **Claim:** Default is mirror (copy the traffic, drop the local responses). Steal
  intercepts, using iptables NAT rules inside the target's network namespace and
  `SO_ORIGINAL_DST` to recover the original destination. HTTP filtering is by header or
  path regex.
- **Evidence:** `docs/reference/traffic.md` -> mirroring: "Any responses by the local
  process to the mirrored requests are dropped". Stealing: "all incoming traffic is only
  handled by the local process". Filtering: "the mirrord agent checks each new connection
  on those ports for HTTP, and if the connection has valid HTTP messages, they are filtered
  with the header filter", default HTTP ports 80 and 8080, regex evaluated with the
  `fancy-regex` crate, and it can filter on `baggage` or `tracestate`.
  `mirrord/agent/iptables/src/backend.rs` -> `get_iptables(nftables: Option<bool>, ip6)`
  selects `/usr/sbin/iptables-nft` or `/usr/sbin/iptables-legacy` (and the ip6tables
  equivalents), auto-detecting by probing for mesh rules and testing a dummy rule in the
  `nat` table, and dropping `CAP_SYS_MODULE` first because probing "can automatically load
  backend-specific kernel modules, and switch the active iptables backend in the kernel".
  `mirrord/agent/iptables/src/mesh/` contains `istio.rs`, `exclusion.rs`, `prerouting.rs`,
  `redirect.rs`, `standard.rs`, `flush_connections.rs`.
  `mirrord/agent/env/src/envs.rs` documents `STEALER_FLUSH_CONNECTIONS` and
  `STEALER_FLUSH_CONNECTIONS_CONNTRACK`: the latter "is scoped with `--reply-port-src` so
  that it only deletes entries of connections that were not redirected to the agent",
  because an unscoped `conntrack -D` also deleted just-redirected connections "leaving the
  agent unable to resolve their original destination via `SO_ORIGINAL_DST` (the lookup
  fails with `ENOENT`)".
- **Label:** [verified]

### F14. Privilege model: three Linux capabilities, all individually disableable [verified]

- **Claim:** The agent needs CAP_NET_ADMIN, CAP_SYS_PTRACE and CAP_SYS_ADMIN (plus
  CAP_NET_RAW per the docs page), and any subset can be disabled in config at the cost of
  function.
- **Evidence:** `README.md` -> "`CAP_NET_ADMIN` - for redirecting the target's incoming
  traffic with iptables", "`CAP_SYS_PTRACE` - for accessing the target's network namespace,
  files and environment through `/proc`", "`CAP_SYS_ADMIN` - for joining target pod network
  namespace", and `agent.disabled_capabilities` with the JSON example
  `{"agent": {"disabled_capabilities": ["NET_ADMIN"]}}`. The docs page
  `reference/architecture.md` lists `CAP_NET_ADMIN` and `CAP_NET_RAW` "required for
  modifying routing tables". Both pages state this "will possibly limit mirrord
  functionalities or even make it unusable in some setups".
- **Label:** [verified]

### F15. Hard limitation: no statically linked binaries on Linux [verified]

- **Claim:** mirrord cannot work on a static binary, because it relies on dynamic linking
  to preload the layer.
- **Evidence:** `docs/faq/limitations.md` -> "Does mirrord support binaries that are
  statically compiled? (Linux) No, mirrord needs to be able to leverage dynamic linking in
  order to work. This means static binaries are not supported." with a `file` command
  example, and the note "Sometimes Go is statically compiled by default". `mirrord/cli/src/main.rs`
  has an `is_static` module (`#[cfg(target_os = "linux")] mod is_static;`) and
  `exec_process` runs `is_static::is_binary_static(Path::new(&args.binary))` and warns
  "target binary might not be dynamically linked, mirrord might not work!". The CLI also
  supports Go, which does not use libc, via a dedicated path (`mirrord/layer/src/go.rs`,
  11768 bytes, and `mirrord/layer-go/` with `linux_x64.rs` at 37158 bytes).
- **Label:** [verified]

### F16. It is drivable headlessly, three ways, and the MCP server is the cleanest [verified]

- **Claim:** `mirrord mcp` serves the Model Context Protocol over stdio. Every tool is
  answered offline from data compiled into the binary. This is a machine-facing API with no
  cluster access required.
- **Evidence:** `mirrord/mcp/src/lib.rs` -> "The server speaks MCP over stdio: the agent's
  harness spawns `mirrord mcp` and exchanges JSON-RPC messages over its stdin/stdout, so
  nothing else may ever be written to stdout (logs go to stderr)." It exposes "the tools in
  [`tools`], answered offline from what is compiled into this binary", the
  `mirrord://info` resource, "every vendored skill, as a prompt and as a
  `mirrord://skills/<name>` resource", "every docs page, as a `mirrord://docs/<path>`
  resource", and `INSTRUCTIONS`.
  `mirrord/mcp/src/tools.rs` registers `validate_config`, `explain_config_option`,
  `get_skill`, `read_doc`, `search_docs` via `#[tool_router]`. The vendored corpus lives at
  `mirrord/mcp/corpus/` with `docs.pin.json` and `skills.pin.json`, and `AGENTS.md` says
  "never edit them by hand, bump them with `cargo xtask corpus sync --bump`".
  `mirrord/cli/src/config.rs` -> `Mcp` subcommand: "Serve the mirrord MCP server over stdio,
  for AI agents."
- **Label:** [verified]

### F17. It is also drivable headlessly over HTTP: a local axum daemon with SSE and WebSocket [verified]

- **Claim:** `mirrord ui` runs a localhost axum server with a REST API, an SSE event stream
  and a WebSocket, gated by a token, with a React frontend.
- **Evidence:** `mirrord/cli/src/ui/server.rs` lines 1325-1360 build the router:
  `/health` (no token), `/auth`, then authenticated routes `/sessions`
  (`list_sessions`), `/sessions/{id}` (`get_session`), `/sessions/{id}/events`
  (`session_events_sse`, an SSE response), `/sessions/{id}/kill` (POST, `kill_session`),
  `/operator-sessions`, `/operator-previews`, `/contexts`, `/namespaces`, `/me`, `/token`,
  and `/ws` (`ws_handler`, a `WebSocketUpgrade`). Imports include
  `axum::response::sse`. There is a `TokenQuery` struct, `token_auth` middleware, a
  `buffer_session_events` coalescing buffer, and the doc comment on `ws_handler`:
  "Validates the WebSocket upgrade Origin header, rejecting non-localhost origins."
  The React frontend is `packages/monitor/src/` with `App.tsx` (17407 bytes), `api.ts`
  (9188 bytes), `EventStream.tsx`, `analytics.ts` and a `package.json`.
  `mirrord/cli/src/ui.rs` doc: "The daemon starts automatically with mirrord sessions and
  owns local services shared between them. The `mirrord ui` command opens its web-based
  session monitor. The daemon watches `~/.mirrord/sessions/` for session sentinel files
  (`.sock` on unix, `.pipe` on windows), connects to each session's HTTP API, and serves
  REST/SSE/WebSocket endpoints on localhost."
- **Label:** [verified]

### F18. The daemon's single-instance and credential model is a directly reusable pattern [verified]

- **Claim:** One daemon per machine, enforced by an OS-released exclusive lock, with a
  separately readable token file, a discovery JSON file carrying a protocol version, and a
  `/health` route that needs no credential.
- **Evidence:** `mirrord/cli/src/ui/daemon.rs` doc comments -> `UI_LOCK_FILE_NAME`
  ("The file locked by the running local daemon. A second daemon cannot acquire it and
  exits"), the PID file, the token file (`~/.mirrord/token`, "It is deliberately not locked
  so other local processes can read it"), `daemon.json` ("Discovery data published in
  `daemon.json` after the daemon binds its loopback listener. The protocol version prevents
  a CLI from sending internal requests to an incompatible daemon; `addr` supports ephemeral
  and user-selected ports"), `MIRRORD_SERVER_PORT_ENV_NAME` ("Its presence tells `mirrord ui`
  to run the long-lived HTTP server instead of the foreground startup path"), and
  `TOKEN_HEADER_NAME` ("Header used to authenticate daemon requests. Browser access can
  instead use the cookie established by `/auth`"). The lock is described as "released by the
  OS even on a hard kill", with stale-file reclaim logic.
- **Label:** [verified]

### F19. The CLI surface is large and mostly scriptable [verified]

- **Claim:** The `Commands` enum has roughly 35 visible and hidden subcommands, several of
  which emit machine-readable output.
- **Evidence:** `mirrord/cli/src/config.rs` lines 101-380 enumerate: `container`, `exec`,
  `dump`, `completions`, `extract` (hidden), `operator` (with `install`, `signup`,
  `uninstall` subcommands), `ls` (hidden, name `ls`), `container-ext` (hidden, `ext`),
  `extproxy` (hidden), `intproxy` (hidden), `crash-monitor` (Windows, hidden),
  `port-forward`, `db-branches`, `queues` (alias `qs`), `verify-config` (hidden), `teams`,
  `diagnose`, `vpn`, `newsletter`, `ci`, `config` (global config at
  `~/.mirrord/mirrord.json`), `preview` (with `start`, `up`, `status`, `stop`, `logs`,
  `diff`), `subscribe` ("Stream operator interception events for a session as JSON"),
  `up`, `fix`, `login`, `attach` (Windows), `pitm` (Windows), `tui`, `mcp`, `ui`, `wizard`,
  `chaos`, `session` (alias `sessions`), `kill`, `cleanup-guardian` (hidden, unix),
  `print-schema`.
  `mirrord/cli/src/main.rs` documents `ext` as using `JsonProgress` by default, `ls` as
  producing output "used by the IDE plugins to show a nice selection box" with a
  `RICH_OUTPUT_ENV` toggle, and `operator status` as reading the operator's `/status` route.
- **Label:** [verified]

### F20. The operator's API is a Kubernetes aggregated APIService, not a standalone REST API [verified]

- **Claim:** Driving the paid control plane requires a Kubernetes API client. There is no
  plain HTTP API to point a Workers SPA at.
- **Evidence:** `mirrord/operator/src/client.rs` -> `post_in_namespace` builds
  `"/apis/operator.metalbear.co/v1/namespaces/{namespace}/{resource}"` and a cluster-scoped
  variant `"/apis/operator.metalbear.co/v1/{resource}"`; `cli_gated_feature` posts to
  `"/apis/operator.metalbear.co/v1/featuregatehits"`; `target_connect_url` builds
  `"/apis/{api_version}/proxy/namespaces/{namespace}/{plural}/{name}?{connect_params}"`.
  `mirrord/operator-websocket/src/upgrade.rs` uses `const WS_PROTOCOL: &str = "v4.channel.k8s.io";`
  for the API-server proxy subresource path, and `UpgradeContract::{KubeApiserver, Direct}`
  where the direct contract is "A plain RFC 6455 upgrade with no subprotocol negotiation".
  `OperatorApi` holds a `kube::Client` (`pub fn client(&self) -> &Client`).
- **Label:** [verified]

### F21. The operator's whole state model is CRDs [verified]

- **Claim:** Everything the operator tracks is a Kubernetes custom resource in two API
  groups.
- **Evidence:** grep of `kind = "..."` across `mirrord/operator/src/crd*`:
  group `operator.metalbear.co` -> `Target`, `MirrordOperator`, `Session`, `CopyTarget`,
  `MirrordClusterOperatorUserCredential`, `MirrordKafkaEphemeralTopic`, `PreviewSession`,
  `PreviewEnv`, `MirrordClusterProfile`, `MirrordProfile`, `QueueSplit`;
  group `queues.mirrord.metalbear.co` -> `MirrordWorkloadQueueRegistry`, `MirrordSQSSession`;
  database branching -> `BranchDatabase`, `MongodbBranchDatabase`, `MysqlBranchDatabase`,
  `PgBranchDatabase`; RabbitMQ -> `MirrordRMQSession`.
- **Label:** [verified]

### F22. There is a non-Kubernetes path, and it is the one that matters for this redesign [verified]

- **Claim:** The `WorkloadCompanion` agent mode and the sessions-manager exist to run
  mirrord outside Kubernetes, on ECS. The agent registers with a control plane over SSE,
  gets paired, and then serves the data plane.
- **Evidence:** `mirrord/agent/src/entrypoint.rs` -> `start_agent_workload_companion`, doc
  comment: "The remote workload-companion version of `start_agent` used in Serverless. It
  simultaneously: 1. maintains a sessions-manager control-plane connection for layer-local
  connections; and 2. listens on a Unix socket for remote-layer connections.
  `sessions-manager <-> workload companion <-> remote layer`". It reads
  `envs::REMOTE_SERVICE`, `envs::REMOTE_ENVIRONMENT` (defaulting to `"default"`), and
  `resolve_replica_id()`.
  `mirrord/agent/src/workload_companion/replica_id/ecs.rs` -> "Replica id from the ECS task
  metadata endpoint (v4)", reading `ECS_CONTAINER_METADATA_URI_V4` and the `TaskARN`, with
  the doc "An ECS service scales out by running more tasks, so the task ARN is unique per
  replica."
  `mirrord/agent/env/src/envs.rs` -> `REMOTE_SERVICE` (`MIRRORD_REMOTE_SERVICE`),
  `REMOTE_SERVICE_REPLICA` (`MIRRORD_REMOTE_SERVICE_REPLICA`, "Stable across agent restarts
  on the replica ... When unset, the agent uses the replica id reported by the hosting
  platform's metadata (e.g. the task ARN on ECS), and `HOSTNAME` when the platform is not
  recognized"), `REMOTE_ENVIRONMENT` (`MIRRORD_REMOTE_ENVIRONMENT`, "This is distinct from
  `MIRRORD_TARGET_NAMESPACE`, which configures a local mirrord process"), and a doc block
  for making the companion register with the operator-hosted sessions-manager through an
  EKS API server, where "The companion authenticates as its AWS identity (the task role, on
  ECS), which the cluster must map to a Kubernetes identity with an access entry, and RBAC
  must grant that identity `proxy` on `serverlessagentassignments` and `get` on
  `serverlessdataplanes` in `operator.metalbear.co`".
- **Label:** [verified]

### F23. The sessions-manager protocol is an SSE control plane plus a WebSocket data plane, and it is MIT [verified]

- **Claim:** The broker shape is: agent and client both subscribe to an SSE assignments
  stream, the server pairs them and hands each a per-assignment credential and a relative
  data-plane URI, and both then upgrade to a WebSocket.
- **Evidence:** `mirrord/sessions-manager/protocol/src/control_plane.rs` ->
  `enum AssignmentRole { Agent, Intproxy }`; `enum ControlPlaneEventName { Assignment,
  Superseded }`; `enum AssignmentSubscription { Agent(AgentIdentity), Intproxy { identity,
  agent_replica_filter } }`; `struct ServiceScope { environment, service }` with the doc
  "every agent registration and intproxy connection is scoped to one `(environment,
  service)`, and pairing only ever happens between peers that share it. The pair selects a
  scope for routing; it is not an authorization identity", and "Sessions-manager compares
  both fields after slugification (lowercase ASCII letters, digits, and hyphens), so
  `Payments API` and `payments-api` name the same scope"; `struct AgentIdentity {
  replica_id, agent_instance_id }` where the instance id is "v4 UUID generated when the
  agent starts. Distinguishes successive agents that share a `replica_id` (container
  restart, image replacement), so a stale registration's cleanup cannot take a newer one
  offline."
  `mirrord/sessions-manager/client/src/control_plane/api.rs` -> the endpoint is
  `{base}/v1/env/{slug(environment)}/service/{slug(service)}/assignments`.
  `mirrord/sessions-manager/client/src/transport/direct.rs` -> "A standalone
  sessions-manager reached at its own base URL", base URL from
  `SESSIONS_MANAGER_URL_ENV = "MIRRORD_SESSIONS_MANAGER_URL"`, timeouts
  `CONNECT_TIMEOUT` 5s, `RESPONSE_HEADER_TIMEOUT` 30s, `WEBSOCKET_UPGRADE_TIMEOUT` 30s, and
  "Dials and authorizes the data-plane WebSocket described by a control-plane assignment".
  `mirrord/sessions-manager/protocol/src/data_plane.rs` ->
  `OPERATOR_DATA_PLANE_AUTHORIZATION_HEADER = "x-mirrord-data-plane-authorization"`, a
  `DataPlaneAuthorization(SecretString)` newtype whose `Debug` and `Display` both print
  `[REDACTED]`, and the doc "The current sessions-manager contract requires this endpoint
  to be an absolute path on the control-plane origin. The authorization in an assignment is
  forwarded to the resolved endpoint. Supporting another origin requires an explicit
  protocol change rather than an ambiguous URI."
  Licence: `mirrord/protocol/LICENSE` (MIT) covers the protocol crate; the client and
  protocol live under the same MIT workspace.
- **Label:** [verified]

### F24. The sessions-manager SERVER is not in this repository and no public repo was found [verified]

- **Claim:** The client and the protocol are open source. The server is not shipped here.
- **Evidence:** root `Cargo.toml` -> `exclude = ["mirrord/sessions-manager"]`, and the tree
  under `mirrord/sessions-manager/` contains only `client/` and `protocol/`. `gh api` for
  `metalbear-co/mirrord-sessions-manager` -> HTTP 404 "Not Found"; same for
  `metalbear-co/sessions-manager` and `metalbear-co/mirrord-operator`.
- **Label:** [verified] that the server is absent from this repo and those three repo names
  do not exist. Whether MetalBear publishes it somewhere else is [unverified].

### F25. Nothing in the workspace is published to crates.io [verified]

- **Claim:** There is no supported library distribution channel. Reuse means vendoring by
  path dependency or forking.
- **Evidence:** root `Cargo.toml` `[workspace.package]` -> `publish = false`; a scan of all
  73 `Cargo.toml` files found none overriding it with `publish = true`.
  `curl -A "research-agent/1.0" https://crates.io/api/v1/crates/mirrord` -> HTTP 404;
  `.../mirrord-agent` -> HTTP 404. `.../mirrord-protocol` -> HTTP 200 with
  `max_stable_version` 0.2.0, and the sparse index shows the newest `mirrord-protocol` entry
  is `0.2.0` published 2022-04-25T13:55:31Z, four and a half years stale against the
  in-tree 1.30.0.
- **Label:** [verified]

### F26. Footprint: the CLI is about 102 MiB unstripped on Linux x86_64 [verified]

- **Claim:** The `mirrord` binary is not small. The layer shared object is about 10.7 MiB.
- **Evidence:** `gh api repos/metalbear-co/mirrord/releases/tags/3.281.0 --jq '.assets[]'`:
  `mirrord_linux_x86_64` 106,792,688 bytes; `mirrord_linux_aarch64` 101,479,208;
  `mirrord_mac_universal` 397,563,776; `mirrord.exe` 116,419,872; `mirrord.msi` 33,652,736;
  `libmirrord_layer_linux_x86_64.so` 11,264,472; `libmirrord_layer_linux_aarch64.so`
  16,689,768; `libmirrord_layer_mac_universal.dylib` 44,681,728;
  `mirrord_layer_win.dll` 9,219,360. Compressed zips: `mirrord_linux_x86_64.zip`
  38,858,803; `mirrord_linux_aarch64.zip` 37,257,633.
  These are release-profile builds and the sizes indicate debug symbols are included. The
  stripped size is [unverified] (not measured).
  The agent ships as a container image (`gh api .../contents/mirrord/agent/Dockerfile`
  exists, and `ci/agent-build/{builder,runtime}.Dockerfile`), not as a release asset, so the
  agent binary's size is [unverified].
- **Label:** [verified] for the numbers as published; [unverified] for stripped sizes.

### F27. What mirrord is not: no orchestrator, no runtime, no CI, no storage, no tunnel [verified]

- **Claim:** mirrord does not schedule, does not run containers, does not build, does not
  store, and does not replace cloudflared. It is a development and test-time tool.
- **Evidence:** The entire crate list (F5) contains no scheduler, no container runtime
  beyond talking to docker/containerd to read a target's `/proc`, no build system, no object
  store. `docs/use-cases/mirrord-for-ci.md` frames CI as "running integration and
  end-to-end tests against a shared staging cluster without spinning up a dedicated test
  environment", i.e. it makes existing CI faster, it is not CI. `docs/faq/comparisons.md`
  positions it against Telepresence, Signadot, Okteto, Tilt, DevSpace and Bridge to
  Kubernetes, all of which are dev-environment tools.
- **Label:** [verified]

### F28. Everything past basic exec is Alpha or paid [verified]

- **Claim:** The open-source tier is `exec`, `container`, `port-forward`, the MCP server,
  the TUI and the local UI. Database branching, queue splitting, preview environments,
  multi-cluster, mirrord for CI, HA and air-gapped licensing are paid, and the advanced
  features are additionally marked Alpha.
- **Evidence:** `docs/getting-started/what-is-mirrord.md` -> "mirrord's core functionality is
  free and open source"; the paid tier adds the Operator, traffic filtering, queue
  splitting, DB branching, policies and profiles, session management; Enterprise adds
  preview environments, mirrord for CI, multi-cluster, air-gapped License Server, HA.
  `docs/reference/feature-matrix.md` marks DB Branching, Queue Splitting, Preview Env,
  Multi-cluster and `mirrord up` as `Alpha` across every platform, with `mirrord up`
  support for the others `Planned`. `docs/reference/release-stages.md` exists to define
  Alpha/Beta/GA. `docs/use-cases/mirrord-for-ci.md` is tagged `beta` and requires a minimum
  CLI version of 3.181.0 and a CI API key that "requires an Enterprise plan".
  The config schema tags each option with `x-mirrord-plan`: `mirrord-schema.json` root
  `agent` is `"x-mirrord-plan": "oss"`; `AGENTS.md` describes the `Plan` enum as `oss`,
  `team` or `enterprise`, and "tests in `mirrord-mcp` fail on an option without one".
- **Label:** [verified]

### F29. Config surface: one JSON schema, 350,865 bytes, plus a separate mirrord-up schema [verified]

- **Claim:** The whole configuration is one JSON Schema document with 31 root properties,
  and there is a second, smaller schema for `mirrord-up.yaml`.
- **Evidence:** tree entries `blob mirrord-schema.json 350865` and
  `blob mirrord-up-schema.json 31237`. Parsing the downloaded `mirrord-schema.json` gives
  root properties: `accept_invalid_certificates`, `agent`, `api`, `baggage`, `ci`,
  `container`, `experimental`, `external_proxy`, `feature`, `internal_proxy`, `key`,
  `kube_context`, `kubeconfig`, `multi_cluster`, `operator`, `profile`, `sip_binaries`,
  `skip_build_tools`, `skip_extra_build_tools`, `skip_processes`, `skip_sip`, `startup_retry`,
  `target`, `telemetry`, `traceparent`, `use_proxy`. The CLI has a `print-schema` subcommand
  (`Commands::PrintSchema`) and `mirrord verify-config` validates a file against it.
  `mirrord/mcp`'s `validate_config` tool checks a config "against the schema of the
  installed mirrord version" and returns "every issue found, each with the JSON pointer of
  the offending value".
- **Label:** [verified]

### F30. `mirrord up` is the "docker compose for mirrord" and its routing-key derivation is the reusable idea [verified]

- **Claim:** One YAML file defines several services; each gets its own session; the default
  mode derives an HTTP filter from the session key so no user configuration is needed.
- **Evidence:** `docs/using-mirrord/multiple-concurrent-sessions.md` -> "think `docker
  compose` but for mirrord", `mirrord up init` writes `./mirrord-up.yaml`, and: "Services
  default to `split` mode, which steals incoming traffic matching an `http_filter`. When no
  filter is provided, mirrord generates one based on the session key:
  `baggage: .*mirrord-session={key}.*`. For requests to reach every service in the session,
  each service has to forward the `baggage` header to the next one." Service modes are
  `split` and `replace`, set per service with `default_mode` or per run with `--mode`.
  `mirrord/cli/src/config.rs` -> `UpArgs` with `command: Option<UpSubcommand>`.
- **Label:** [verified]

### F31. Adopters and scale claims [verified as claims, not independently audited]

- **Claim:** The README lists named adopters and a concurrency figure.
- **Evidence:** README.md -> "**Adopted by**: monday.com, SurveyMonkey, Cadence, CoLab,
  Daylight Security, Zooplus, and [others](./ADOPTERS.md)." `ADOPTERS.md` is 2710 bytes.
  `docs/getting-started/what-is-mirrord.md` -> "monday.com runs 350+ engineers concurrently
  on one shared staging cluster."
- **Label:** [verified] that these strings are in the repository. The underlying usage
  figures are the project's own claims.

### F32. Cluster requirements are modest and access-provider agnostic [verified]

- **Claim:** Basic setups work on Kubernetes as old as 1.22. All cluster access goes through
  the kubeconfig and the Kubernetes API; mirrord opens no network path of its own.
- **Evidence:** `docs/faq/limitations.md` -> "Basic mirrord setups can support Kubernetes
  versions as old as `1.22`, but some features require newer versions." And: "mirrord
  reaches your cluster entirely through the Kubernetes API, using the same kubeconfig
  `kubectl` uses. That covers everything it does: the mirrord Operator is exposed as a
  Kubernetes APIService, and the connection to the mirrord agent runs over Kubernetes port
  forwarding. mirrord never opens a network path of its own." It also states OpenShift and
  Istio/Linkerd work, and that Teleport and Tailscale need no configuration.
- **Label:** [verified]

### F33. A local chaos-engineering rules engine is compiled in and driven over HTTP [verified]

- **Claim:** Per-session chaos rules (delay, drop, and similar) are enforced inside the
  intproxy and are editable at runtime through the local daemon's API.
- **Evidence:** `mirrord/cli/src/ui.rs` -> "It also enables chaos testing by updating chaos
  rules enforced in the internal proxy", with `ChaosArgs`, `ChaosSubcommand::{List, Add,
  Edit, Delete}` and `mirrord_intproxy::session_monitor::chaos::rules::{ChaosRule,
  ChaosRuleRequest}`. `mirrord/intproxy/src/proxies/outgoing/chaos.rs` (9624 bytes) and
  `mirrord/intproxy/src/session_monitor/chaos/rules.rs` (39878 bytes) implement them.
  `docs/use-cases/chaos-testing.md` (10773 bytes) documents the feature.
- **Label:** [verified]

---

## 2. What this changes for the redesign

Written against the two new requirements, quoted from the operator:

> "the core requirement is i must be able to use these with as little custom changes as
> possible as code written can be used/swapped over to cloudflare or to these hosted backends"

> "instead of using multiple heavy bloated binary, is it not better to create something like
> cfrs or rivet and have it the single cloudfalred tunnel/orchestrator/broker on each server"

### R1. Copy the `AgentConnectInfo` enum verbatim into the redesign's transport layer. It is the answer to requirement (a).

mirrord's client never knows how it reaches the agent. `AgentConnectInfo` (F7) has five
variants covering direct TCP, Kubernetes port-forward, an operator relay, an external proxy
with optional TLS, and a sessions-manager pairing. Everything downstream is one code path.
That is precisely the shape the Workers side and the data-plane side both need: one enum
with a Cloudflare Tunnel variant, a WireGuard variant, a direct variant and a loopback
variant, selected by configuration, with the application code above it unchanged.

Concretely for the spec: SPEC.md section 10 invariant 13 already says "Every data-plane call
goes through one internal client module in the Worker, so the transport is swappable".
Strengthen it from a module to an enum plus a negotiated handshake, and state that no
application code, no `wrangler.toml` and no job descriptor may name a transport. mirrord
proves the pattern holds at 5,390 stars and 9.5 MB of Rust.

### R2. Copy the environment-variable contract. It is the concrete mechanism behind "code written once".

F10 is the transferable idea, not the tool. mirrord's answer to "how does the same binary
behave correctly in two places" is: the process asks the target for its environment, remote
wins, local-only survives, and a hardcoded exclusion list of about 45 names (PATH, HOME,
GOPATH, GEM_HOME, JAVA_HOME, TMPDIR, ...) stops the host leaking in.

For the redesign: the Workload/Container descriptor held in the control plane's own Postgres
becomes the single source of environment. `workerd` resolves it from the Worker's bindings
and secrets. The bare-metal runner resolves it from the same descriptor with the same
exclusion list. One descriptor, two resolvers, identical process environment. That is what
makes "swap the backend without touching application code" true rather than aspirational.

### R3. Copy the four-way file policy and the built-in read-local list, pointed at R2 and SeaweedFS.

F11's modes are `local`, `localwithoverrides`, `read` (default: remote reads, local writes)
and `write`, with a built-in list of paths that always resolve locally. Map that directly
onto the storage split SPEC.md section 5.4 already recommends: `read` is the default (config
and certificates from R2, logs and temp written locally), `write` for a shared volume,
`localwithoverrides` for the handful of secrets a job actually needs. The built-in
read-local list is the part worth stealing verbatim in spirit, because it is what stops a
job's `/tmp` and lock files from landing in the object store.

### R4. Copy the session-key routing filter, not the traffic-stealing mechanism.

F30: mirrord derives `baggage: .*mirrord-session={key}.*` from the session key when no
filter is configured, so routing needs no user configuration and no per-job DNS record. The
redesign's equivalent is the Cloudflare Tunnel ingress rule per job, or the path prefix per
job. Derive it from the job ID. Do not make the operator configure a hostname per job, and
do not create a tunnel per job, which SPEC.md section 2 already prices at $4.50 per tunnel
per month above 1,000.

### R5. Copy the independently versioned protocol crate and its CI rule. This is what makes a mixed-version fleet work.

F8: `mirrord-protocol` is versioned separately from the workspace (1.30.0 against 3.281.0),
its declarations *are* the wire format, version negotiation happens with
`SwitchProtocolVersion` plus `LazyLock<VersionReq>`, and CI fails if the crate changes
without a version bump. A fleet of self-hosted boxes will run mixed agent versions for
months. Without this, every agent upgrade is a coordinated outage.

Concretely: the redesign needs a `protocol` crate with a version constant, a
`SwitchProtocolVersion` handshake, the four safe-change and four breaking-change rules
written into the repo's own AGENTS.md, and a CI check that fails on an unbumped change.
That is roughly 200 lines and it removes an entire class of fleet-wide failure.

### R6. The sessions-manager protocol is the broker in requirement (b), already written and MIT. Build the server, do not invent a protocol.

F22 and F23: agent and client both subscribe to
`{base}/v1/env/{environment}/service/{service}/assignments` over SSE, the server pairs them
by `(environment, service)` after slugification, hands each a per-assignment credential and
a relative data-plane URI on the same origin, and both upgrade to a WebSocket. `AgentIdentity`
separates the stable `replica_id` from the per-start `agent_instance_id` UUID precisely so
"a stale registration's cleanup cannot take a newer one offline". The data-plane credential
is a `SecretString` newtype that prints `[REDACTED]` in both `Debug` and `Display`.

The server is not open source (F24). It is also small: an SSE endpoint, a WebSocket upgrade,
a pairing table, a slug normaliser and a credential mint. Write it. The protocol crate and
the client are MIT and can be vendored.

### R7. The one-binary requirement (b) is satisfied by mirrord's component split, not by mirrord's CLI.

mirrord proves the architecture: a small in-process layer, one local multiplexer, one agent
per target, one protocol crate. That is the shape `cfrs` should grow into. But mirrord's own
CLI is 106,792,688 bytes on Linux x86_64 (F26), which is the opposite of the operator's
complaint. Adopt the split, not the binary.

Concretely for `cfrs`: one process per server that holds (1) the Cloudflare Tunnel
connector, (2) the local multiplexer equivalent of intproxy, (3) the agent equivalent that
does the actual I/O, and (4) the broker client from R6. The layer stays a separate `.so`
because it must be preloaded into the user's process and cannot live in the agent. That is
four roles in one process, not four binaries, and it is exactly the mirrord split minus the
process boundaries that exist for mirrord's own reasons.

### R8. `mirrord mcp` is the precedent for giving the single agent a machine-facing API.

F16: the MCP server speaks JSON-RPC over stdio, every tool is answered offline from a
compiled-in corpus, logs go to stderr so stdout stays clean, and the docs and skills are
vendored from pinned upstream commits and never hand-edited. Give `cfrs` the equivalent: a
JSON-lines or MCP subcommand, so the Workers-hosted SPA, a shell script and an AI agent all
drive one surface. SPEC.md section 3.1 already makes the SPA a thin client; this is the
data-plane half of that.

### R9. `mirrord ui`'s daemon model is the pattern for the per-box agent's local API, if the SPA ever needs it.

F17 and F18: single instance enforced by an OS-released exclusive lock, a separately
readable token file, a `daemon.json` discovery file carrying a protocol version and the
bound address, `/health` unauthenticated, everything else token-gated, and an Origin check
that rejects non-localhost on the WebSocket upgrade. If the redesign ever lets the browser
reach a box directly rather than through the Worker, this is the model, and the Origin check
is the control that must come with it.

### R10. Do not take the operator. Take the protocol, the layer and the transport abstraction.

F20 and F21: the operator is a Kubernetes CRD controller behind an aggregated APIService.
SPEC.md section 5.1 already picks Nomad or k3s, and Nomad is BUSL 1.1 with an IBM licensor,
which is its own problem. Adding a second Kubernetes-shaped control plane to satisfy
"orchestration must not be Cloudflare" would be the wrong trade. The MIT parts that are
worth taking are `mirrord-protocol`, the codec, `mirrord-layer-lib`'s file and socket hook
machinery, and the `AgentConnectInfo` abstraction.

### R11. Two facts to write into the spec as limits, not features.

- The agent is Linux-only, and the layer cannot work on a statically linked binary (F6,
  F15). Any Go service in the fleet must be built dynamically linked. This is a real
  constraint on "as little custom changes as possible": a Go or Rust service compiled
  static will not participate.
- Nothing is published to crates.io (F25), and `mirrord-protocol` on crates.io is 0.2.0
  from 2022-04-25 against 1.30.0 in-tree. Reuse means a vendored path dependency or a fork,
  and the fork has to be pinned because the upstream release train is roughly every two
  days (F4).

### R12. The strongest single finding for the redesign, stated plainly.

The mirrord-protocol wire format, the length-prefixed bincode codec, the transport
abstraction enum, and the sessions-manager pairing protocol are all MIT, all separable, and
all already solve problems the redesign has to solve. None of them require mirrord to be
installed, and none of them bring a Kubernetes dependency. The redesign should vendor the
protocol and codec, copy the `AgentConnectInfo` shape, and implement the sessions-manager
server. It should not install mirrord, and it should not adopt the operator.

---

## 3. Not covered / open questions

1. **Stripped binary sizes.** The published release assets include debug symbols. The
   stripped size of the CLI, and the size of the `mirrord-agent` binary at all (it ships
   only as a container image, never as a release asset), are [unverified]. This matters
   directly to requirement (b) and should be measured before any footprint claim enters the
   spec.

2. **musl and Alpine support.** Nothing in the repository or docs states whether the layer
   works against musl libc. The agent Dockerfile and `ci/agent-build/runtime.Dockerfile`
   were not read. [unverified]

3. **Whether the OSS CLI can target a non-Kubernetes workload without the operator.**
   `Mode::Targetless` exists and works with no target, but `mirrord/kube/src/api/` and the
   `target` resolution path are Kubernetes-shaped throughout, and `AgentConnectInfo`'s
   non-Kubernetes variants (`SessionsManager`, `OperatorSessionsManager`) are documented as
   the Serverless/ECS path. Whether a bare `mirrord exec` with no operator and no
   Kubernetes cluster is a supported configuration is [unverified].

4. **Where the sessions-manager server lives.** It is excluded from this workspace and the
   three obvious repo names 404. Whether MetalBear publishes it elsewhere, or whether it is
   closed source, is [unverified]. The redesign needs the server, so this is the one gap
   that must be filled by writing code rather than reading it.

5. **The operator's licence server and air-gapped mode.** `docs/managing-mirrord/license-server.md`
   (10053 bytes) and `license-server.md` under `dashboard/` (2914 bytes) exist but were not
   read. Whether the licence check is offline-capable in a way the redesign could copy is
   [unverified].

6. **Multi-cluster internals.** `docs/using-mirrord/multi-cluster.md` (14980 bytes) and
   `multi-cluster-setup.md` (31741 bytes) were not read. Given the redesign spans one
   Cloudflare account and several physical boxes, how mirrord routes a single session
   across clusters may be relevant. [unverified]

7. **The `mirrord/up` process model in detail.** `mirrord/up/src/lib.rs` (40418 bytes) and
   `process.rs` (39807 bytes) were not read. Whether it daemonises, how it supervises
   children, and how it reports status are [unverified].

8. **Prometheus metrics surface.** `mirrord/agent/src/metrics.rs` (15316 bytes) and
   `docs/managing-mirrord/monitoring.md` (21729 bytes) were not read. The metric names and
   cardinality are [unverified], so no claim is made about whether mirrord's metrics model
   is a good fit for the redesign's own observability.

9. **Whether the OSS tier's traffic filtering is really free.** The feature matrix and the
   what-is-mirrord page list traffic filtering under the paid Operator, while
   `docs/reference/traffic.md` documents `--steal` with an `http_filter` as an OSS CLI flag.
   The exact split between the free CLI filter and the Operator-enforced filter is
   [unverified] and the two pages read as being in tension.

10. **Windows layer coverage.** `mirrord/layer-win` is 100+ KB of source with hooks at the
    NT syscall boundary, but no Windows-specific testing was done. Whether the same
    interception fidelity holds is [unverified].

11. **Security review of the agent's listening surface.** The agent binds 0.0.0.0 or the
    dual-stack wildcard by default (F6). Whether it has any authentication when
    `--operator-tls-cert-pem` is absent was not determined. This is a question the redesign
    must answer for its own agent, and mirrord's answer was not established here.

---

## Summary (10 lines)

1. metalbear-co/mirrord: Rust, 5,390 stars, 23 open issues, pushed 2026-10-29T08:35:35Z, last release 3.281.0 on 2026-10-28T23:28:24Z, releases roughly every two days. Alive and fast-moving.
2. Licence is MIT (GitHub reports spdx_id null only because the copyright line is non-standard); the protocol crate carries its own separate MIT file. No copyleft, no network clause, no field-of-use limit.
3. Architecture is eleven separable crates: layer (.so/.dll, LD_PRELOAD, hooks libc and NT syscalls), intproxy (local multiplexer, N layers to 1 agent), agent (Linux only, plain TCP listener on 61337), operator (Kubernetes CRD controller), MCP server, TUI, local UI daemon.
4. The agent needs no Kubernetes to listen: it binds a dual-stack TcpListener, optional TLS pinned to one operator cert, bincode protocol. Its modes include Targetless and WorkloadCompanion (ECS, non-Kubernetes).
5. The single most reusable decision is `AgentConnectInfo`: five variants (ExternalProxy, Operator, DirectKubernetes, SessionsManager, OperatorSessionsManager), one code path downstream. Copy this shape for Cloudflare Tunnel vs WireGuard vs direct.
6. Wire format is a 4-byte big-endian u32 length prefix plus bincode 2. `ClientMessage` has 17 variants, `DaemonMessage` 15. The protocol crate is versioned independently (1.30.0 vs workspace 3.281.0) and CI fails on an unbumped change. Copy this for a mixed-version fleet.
7. The portability mechanism is concrete: the layer asks the agent for the target's environment, remote wins, local-only survives, and a hardcoded exclusion list of about 45 names (PATH, HOME, GOPATH, GEM_HOME, JAVA_HOME, TMPDIR) stops the host leaking in.
8. The sessions-manager protocol is the broker the operator wants and it is MIT: SSE assignments at `{base}/v1/env/{env}/service/{svc}/assignments`, pairing by slugified (environment, service), per-assignment credential, WebSocket data-plane upgrade on the same origin. The SERVER is not in this repo and no public repo exists.
9. Counter-evidence for requirement (b): the CLI is 106,792,688 bytes unstripped on Linux x86_64 and nothing is on crates.io (mirrord-protocol there is 0.2.0 from 2022-04-25). Adopt the component split, not the binary. Reuse means vendoring or forking.
10. Hard limits to write into the spec: the agent is Linux-only, the layer cannot work on statically linked binaries, and everything past basic exec (DB branching, queue splitting, preview envs, multi-cluster, CI) is Alpha or paid.

Path written: /workspace/cfb-20261029111146/research/E5-mirrord.md
