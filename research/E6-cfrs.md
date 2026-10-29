# E6-cfrs: talaria0101/cfrs

Research subagent E6. Every source below was read on 2026-10-29 (UTC). The primary
source is the repository itself, read through the GitHub REST API (`gh api`) and a
shallow clone at `HEAD` of the default branch `main`. The pkgforge web-search
gateway was tried first and returned nothing relevant, so it was abandoned in
favour of `gh api`; the exact call and its result are recorded in finding F25.
Nothing below comes from the README's framing without a second artefact behind it,
and where the README and the code disagree, the disagreement is the finding.

Repository identity used for every claim in this file, from
`gh api repos/talaria0101/cfrs` on 2026-10-29:

| field | value |
|---|---|
| full_name | talaria0101/cfrs |
| description | "Cloudflare quick-tunnel client in Rust, for sandboxes where cloudflared cannot run" |
| html_url | https://github.com/talaria0101/cfrs |
| created_at | 2026-10-09T03:18:54Z |
| pushed_at | 2026-10-09T13:27:13Z |
| updated_at | 2026-10-09T13:27:18Z |
| stargazers_count | 0 |
| forks_count | 1 |
| open_issues_count | 3 |
| watchers_count | 0 |
| license | 0BSD (`license.spdx_id`) |
| language | Rust |
| default_branch | main |
| size | 426 (GitHub's repo-size field, in kilobytes) |
| archived | false |
| fork | false |
| topics | none |
| contributors | 1 (`talaria0101`, 10 commits) |
| releases | 0 |
| tags | 0 |

---

## 1. Findings

### F1. The headline correction: cfrs is not a working Cloudflare Tunnel client, and it says so itself

Claim: `cfrs tunnel` does not serve traffic. It loads ingress rules, resolves the
edge, provisions an anonymous quick tunnel, prints a URL, and stops. No connection
is registered with the edge, no visitor stream is opened, no visitor is served.

Evidence, three independent places, all agreeing:

1. `README.md`, "What does not work yet": "`cfrs tunnel` does not serve traffic. It
   loads ingress rules, resolves the edge, provisions credentials and prints a URL,
   but the HTTP/2 and QUIC transports are not driven by a serving loop, so no
   connection is registered and no visitor is ever served. ... `cfrs serve` is the
   path that produces a working public URL here."
2. `src/lib.rs` module doc: "A genuine Cloudflare tunnel needs the edge at
   `region*.v2.argotunnel.com:7844`, which a restricted sandbox blocks on both the
   QUIC and HTTP/2 paths. [`quicktunnel`] gets real credentials for that edge;
   [`relay`] is the transport that completes a working public URL without it."
3. `src/bin/cfrs.rs`, `cmd_tunnel`: after `discover_edges()` succeeds it calls
   `quicktunnel::request_quick_tunnel(DEFAULT_QUICK_SERVICE, AuthMode::Public, 15,
   proxy)`, prints `url:`, optionally renders a QR code, prints
   `tunnel.metrics().summary()`, and returns. There is no registration call, no
   serving loop, no `Tunnel::run`.

`src/tunnel/mod.rs` says the same in its own module doc: "It does **not** open an
edge connection: registration and visitor serving are not implemented, so a
`Tunnel` is not yet a running Cloudflare tunnel."

Consequence for the redesign: the operator named cfrs as the model for the
single-agent design. It is a model for the *shape* of the agent. It is not a
drop-in replacement for `cloudflared`, and nothing in the tree demonstrates a
Cloudflare tunnel carrying a visitor.

URL: https://github.com/talaria0101/cfrs/blob/main/README.md
URL: https://github.com/talaria0101/cfrs/blob/main/src/bin/cfrs.rs
Label: [verified]

### F2. Exactly what does work, and the two things it does are both narrow

Claim: two code paths produce a working result, and a third is a working
diagnostic.

Evidence, read from the CLI dispatcher in `src/bin/cfrs.rs`:

1. `cfrs provision` (and `cfrs provision --otp`) performs the real anonymous
   quick-tunnel provisioning call and prints the URL, the tunnel UUID, the account
   tag and the secret length. The README records live output from the author's
   sandbox on 2026-10-09, including a real hostname
   `day-carroll-healing-consolidated.trycloudflare.com`.
2. `cfrs serve --unix-socket PATH` is the only path that produces a working public
   URL, and it does so by opening an SSH remote forward to a third-party free
   relay (`free.pinggy.io:443` by default), splicing each visitor's
   `forwarded-tcpip` channel to the unix socket. The proof script
   `tools/prove-exposure.sh` is committed and shows two genuine traversals with a
   per-request origin marker (`marker=2` then `marker=3`).
3. `cfrs net demo` runs an in-process TCP handshake and request/response inside the
   userspace stack, with no kernel `AF_INET` syscall. This is real and tested.

Everything else (`tunnel`, `connect`, `qr`, `doctor`, `metrics`, `ports`,
`net shim`, `net proxy`, `net addresses`, `net doctor`) is either a thin wrapper, a
pure function, or a diagnostic.

URL: https://github.com/talaria0101/cfrs/blob/main/src/bin/cfrs.rs
URL: https://github.com/talaria0101/cfrs/blob/main/tools/prove-exposure.sh
Label: [verified]

### F3. The Cloudflare protocol surface that is actually implemented

Claim: cfrs implements the argotunnel edge protocol at the framing layer, not at
the session layer. The constants below are all in the tree and all carry a source
citation to cloudflared's Go source.

Evidence, from `src/cloudflare/mod.rs`, `src/cloudflare/http2.rs` and
`src/cloudflare/quic.rs`:

| item | value | source cited in code |
|---|---|---|
| edge SRV record | `_v2-origintunneld._tcp.argotunnel.com` | `EDGE_SRV` |
| edge port | 7844 (hardcoded in `discover_edges_with`) | measured from the SRV answer `1 1 7844 region1.v2.argotunnel.com` |
| QUIC ALPN | `argotunnel` | `QUIC_ALPN` |
| QUIC SNI | `quic.cftunnel.com` | `QUIC_SNI` |
| HTTP/2 SNI | `h2.cftunnel.com` | `H2_SNI` |
| HTTP/2 ALPN | none at all, deliberately | `edge_tls_config(&[])` |
| QUIC data-stream signature | `[0x0A, 0x36, 0xCD, 0x12, 0xA1, 0x3E]` | `DATA_STREAM_SIGNATURE`, cited to `tunnelrpc/quic/protocol.go` |
| QUIC data-stream version | `b"01"` | `DATA_STREAM_VERSION` |
| control-stream header | `Cf-Cloudflared-Proxy-Connection-Upgrade: control-stream` | `CONTROL_STREAM_HEADER` / `CONTROL_STREAM_VALUE` |
| visitor destination header | `Cf-Cloudflared-Proxy-Src` | `PROXY_SRC_HEADER` |
| response-header encoding | base64(name) then base64(value), joined by `;`, after a colon, `base64.RawStdEncoding` (no padding) | `encode_headers`, cited to `connection/header.go` |
| registration auth | Cap'n Proto RPC, `TunnelAuth.tunnelSecret` sent raw and unhashed | `quic.rs::tunnel_auth`, `Credentials` |
| edge trust roots | 3 Cloudflare-internal roots embedded from `tlsconfig/cloudflare_ca.go` | `CF_EDGE_ROOTS_PEM`, `src/cloudflare/cf-edge-roots.pem`, 4,543 bytes |

The two details most likely to be got wrong are called out in code comments and
pinned by tests: the QUIC ALPN and SNI are different strings, and the HTTP/2
transport must offer no ALPN at all because the edge initiates every stream and
runs an HTTP/2 *server* on the connection.

There is also a real oracle: `tools/check-header-oracle.sh` builds a verbatim copy
of cloudflared's Go `SerializeHeaders` and diffs it against `encode_headers` on
five cases, plus a captured run in `tools/header-oracle.txt` so the check survives
a machine with no Go toolchain. `cargo test` asserts the recorded output. This is
the single best-engineered thing in the repository.

URL: https://github.com/talaria0101/cfrs/blob/main/src/cloudflare/mod.rs
URL: https://github.com/talaria0101/cfrs/blob/main/src/cloudflare/http2.rs
URL: https://github.com/talaria0101/cfrs/blob/main/tools/check-header-oracle.sh
Label: [verified]

### F4. How it obtains a quick tunnel, exactly

Claim: one credential-free HTTP POST, reproduced from cloudflared's Go source
rather than from documentation.

Evidence, `src/quicktunnel.rs`:

- Endpoint: `POST https://api.trycloudflare.com/tunnel`, built as
  `format!("{}/tunnel", endpoint.trim_end_matches('/'))` from
  `DEFAULT_QUICK_SERVICE = "https://api.trycloudflare.com"`.
- Body: empty for a public tunnel; `{"auth_mode":"otp"}` when a one-time PIN is
  required. The `AuthMode` enum carries the note that the allow-list never leaves
  the client, mirroring `cloudflared --allowed-mail`.
- Headers: `Content-Type: application/json` and a `User-Agent` of
  `cfrs/<version> (rust)`.
- Transport: `ureq` 2.12.1, pinned exactly, with `default-features = false` and
  the `tls` feature. The Cargo.toml comment says ureq is used over an async client
  because this is one synchronous request/response.
- Response shape (`QuickTunnel`): `id` (tunnel UUID), `hostname`, `account_tag`
  (32-char hex), `secret` (base64 of 32 raw bytes). The doc comment records that
  cloudflared sends the secret on the wire untransformed, so a reimplementation
  must not hash it.
- Proxy: `--proxy host:port` or `$HTTPS_PROXY`. The proxy is what resolves the
  hostname in a sandbox with no resolver. A bare `host:port` is upgraded to
  `http://host:port`.
- Redaction: a decode failure prints the body, which is mostly credentials, so
  `redact()` replaces `secret`, `account_tag`, `tunnel_secret` and `id` values with
  `<redacted>` and clips on a character boundary. This was a real leak that was
  found and fixed (F19).
- Tests use a response captured from the live service on 2026-10-09.

URL: https://github.com/talaria0101/cfrs/blob/main/src/quicktunnel.rs
Label: [verified]

### F5. The edge transports are complete enough to be dangerous and are dead code today

Claim: `http2.rs` (41,010 bytes) and `quic.rs` (9,866 bytes) build connections,
do the TLS handshake with the right SNI/ALPN, frame messages and classify streams.
Nothing calls them from a serving loop.

Evidence:

- `http2.rs` public surface: `connect(addr, timeout) -> TlsH2Stream`,
  `build_visitor_request`, `build_origin_response`, `decode_origin_response`,
  `classify_stream(headers) -> StreamKind` (control / configuration / visitor),
  `served_by_origin`, `is_hop_by_hop`, `is_control_header`, `edge_tls()`.
- `quic.rs` public surface: `tls_config()`, `client_config()`,
  `QuicConnection::connect`, `open_control_stream`, `write_stream_preamble`,
  `tunnel_auth(credentials) -> (String, Vec<u8>, [u8;16])`.
- A grep for callers of `http2::connect` and `quic::QuicConnection::connect`
  outside their own modules and tests returns nothing. `cmd_tunnel` calls
  `discover_edges()` and then `request_quick_tunnel()`; it never constructs a
  transport.
- The reason is environmental, and it is stated rather than hidden: the author's
  sandbox blocks TCP and UDP to port 7844 on every host tested, over both
  transports. So the edge path is untested rather than proven.

Consequence: the edge client is the part of cfrs that is most valuable to the
redesign and the part that has never run against the real edge. Finishing it is
the largest single work item in the repository, and it is listed as item A in the
author's own priority list (F20).

URL: https://github.com/talaria0101/cfrs/blob/main/src/cloudflare/http2.rs
URL: https://github.com/talaria0101/cfrs/blob/main/src/cloudflare/quic.rs
Label: [verified]

### F6. The path that does work is an SSH remote forward to a third-party free relay, and that is a trust decision

Claim: `cfrs serve` produces a working public URL by tunnelling through
`free.pinggy.io:443` over an SSH `forwarded-tcpip` channel, using an ephemeral
Ed25519 key generated from OS entropy and never persisted.

Evidence, `src/relay.rs`:

- `DEFAULT_RELAY = "free.pinggy.io:443"`.
- `RelayConfig { address, proxy, username, unix_socket, connect_timeout }`, with
  `username` defaulting to `cfrs`.
- `run(config) -> Result<(TunnelHandle, Handle<Client>), RelayError>` where
  `TunnelHandle { url, remote_port }`.
- `PrivateKey::random(&mut UnwrapErr(SysRng), Algorithm::Ed25519)` per run.
- `ssh_config.inactivity_timeout = Some(Duration::from_secs(3600))`, so the
  timeout is on the SSH session, not on the channel.
- The splice is `copy_bidirectional` over one unix connection, and the request leg
  must signal end-of-request. Both halves are pinned by
  `copy_bidirectional_carries_request_and_response_on_one_origin_connection`, which
  was confirmed to fail when the regression was injected.
- Relay choice was measured, not guessed: tunnelmole needs port 8083 (blocked);
  `localhost.run:443` speaks TLS not SSH; `free.pinggy.io:443` and
  `serveo.net:443` return real SSH banners.

The README states the consequence in its own "What this does not establish"
section: "The relay carries the tunnel, so the relay operator can see the traffic.
`cloudflared`'s edge is the private alternative, and it is unreachable here."

For the redesign this matters twice. First, a data-plane agent that reaches the
internet only through a free relay is not a design, it is a demo. Second, the
author's own honesty here is the model to copy: a silent downgrade from the
Cloudflare edge to a third-party relay would be the exact failure mode the
redesign must refuse.

URL: https://github.com/talaria0101/cfrs/blob/main/src/relay.rs
Label: [verified]

### F7. Two open security holes, both live, both named by the author

Claim: the SSH host key is accepted unconditionally on both the relay path and the
SSH transport path.

Evidence:

- `src/relay.rs` lines 129-141, `Client::check_server_key` returns `Ok(true)`. The
  comment argues the traffic "is only as sensitive as the public URL itself, which
  is unguessable and already in the open", and the author's own KICKOFF.md rejects
  that argument: "The current comment argues the traffic 'is only as sensitive as
  the public URL itself', which does not hold; replace it with the real
  trade-off."
- `src/transport/ssh.rs` lines 80-85, `check_server_key` returns
  `Ok(self.accept_any_host_key)`, i.e. configurable but defaulting to accept.
- `KICKOFF.md` section 5D states it plainly: "Both `src/relay.rs` and
  `src/transport/ssh.rs` return `Ok(true)` from `check_server_key`. The relay path
  is the only one that produces a working public URL on this host, so this is a
  live exposure: a network attacker on the path reads and modifies all tunnel
  traffic in both directions, and can substitute responses. The URL being
  unguessable does not help, because the attacker obtains it from the same
  unauthenticated channel."
- Also open, same section: no cap on concurrent visitor channels, no
  per-connection timeout on the splice, no timeout on `UnixStream::connect` in the
  relay path, and `cfrs connect -L unix:/path` unlinks whatever is at that path
  without checking whether it is a stale socket.

URL: https://github.com/talaria0101/cfrs/blob/main/src/relay.rs
URL: https://github.com/talaria0101/cfrs/blob/main/KICKOFF.md
Label: [verified]

### F8. cloudflared config compatibility: the shape is right, and two headline flags are declared but never read

Claim: `src/config.rs` parses the cloudflared `config.yml` shape including ordered
ingress rules, hostname patterns, path prefixes, several services per rule with
weighted balancing, and `originRequest` settings. But `--token` and
`--credentials-file` are accepted by the CLI and then ignored, so `cfrs tunnel`
always provisions an anonymous quick tunnel even when a named-tunnel token is
supplied.

Evidence:

- `src/config.rs`: `Config { tunnel, credentials_file, protocol, ha_connections,
  ingress }`, `IngressRule { hostname, path, services, originRequest }`, with
  `de_services` accepting the singular YAML key `service`. `Config::validate`
  refuses a catch-all that is not last and refuses a rule with no service, matching
  cloudflared's startup refusal. `Origin` covers `http://`, `https://`, `unix:`,
  `unix+tls:`, `tcp://`, `static:`, `spa:`, `http_status:` and `hello_world`.
- `src/bin/cfrs.rs` `TUNNEL_FLAGS` includes `"credentials-file"` and `"token"`, and
  the USAGE text documents both. A grep for `flags.get("token")` and
  `flags.get("credentials-file")` in `src/bin/cfrs.rs` returns nothing. The only
  use of `credentials_file` anywhere is the struct field in `config.rs`, which is
  parsed and never read.
- `cmd_tunnel` therefore always calls
  `quicktunnel::request_quick_tunnel(..., AuthMode::Public, 15, ...)`. Passing
  `--token` changes nothing about what the binary does.
- `Cargo.toml`'s own description claims "quick tunnels, named tunnels, QUIC and
  HTTP/2 edge transports", which is a documentation claim the code does not
  support. Issue #1 lists named tunnels as deliberately dropped (F20).

Consequence: the "drop-in cloudflared replacement" story is not true today, and
the config-compatibility surface that *is* implemented is the part worth keeping,
because it is what makes an existing `config.yml` portable.

URL: https://github.com/talaria0101/cfrs/blob/main/src/config.rs
URL: https://github.com/talaria0101/cfrs/blob/main/src/bin/cfrs.rs
Label: [verified]

### F9. It is library-first, which is the property that makes it drivable by an external control plane

Claim: everything the CLI can do is reachable from Rust, and the CLI is a thin
wrapper. This is the strongest argument for cfrs as an agent *component* rather
than as a command an orchestrator shells out to.

Evidence, `src/lib.rs` exports `cloudflare, config, feature, origin, ports,
proxy, quicktunnel, relay, share, transport, tunnel, util, vnet` and re-exports
`NetStack, StackConfig, VirtAddr, VirtualSubnet`. `src/bin/cfrs.rs` opens with:
"Anything the CLI can do is reachable from the library, and this file is a thin
wrapper over `cfrs::tunnel`." `src/tunnel/mod.rs` repeats it: "[`Tunnel`] is usable
on its own: build one, run it, read metrics."

The library entry points a control plane would actually call:

- `quicktunnel::request_quick_tunnel(endpoint, auth_mode, timeout_secs, proxy) ->
  Result<QuickTunnel, ProvisionError>`
- `relay::run(RelayConfig) -> Result<(TunnelHandle, Handle<Client>), RelayError>`
- `cloudflare::discover_edges() -> Result<Vec<EdgeAddr>, EdgeError>`
- `cloudflare::discover_edges_with(resolver)` with an injected resolver, so a
  control plane can supply DoH/DoT or a mock
- `Tunnel::new(TunnelOptions)`, `Tunnel::resolve(request)`, `Tunnel::prepare_request`,
  `Tunnel::metrics()`, `Tunnel::stop()`
- `proxy::connect_tunnel(...)` returning a plain byte pipe, and
  `proxy::read_connect_response` generic over `Read` so the parsing is testable
  without binding a socket
- `transport::{Transport, Direct, HttpConnect, SshRelay, WebSocket}` behind one
  object-safe trait
- `feature::AccessController`, `feature::IpFilter`, `feature::HttpBasicAuth`,
  `feature::MetricsEndpoint`, `feature::ShareLink`, `feature::render_qr`
- the whole of `vnet` (F12)

URL: https://github.com/talaria0101/cfrs/blob/main/src/lib.rs
Label: [verified]

### F10. What a control plane can and cannot drive today

Claim: there is no inbound control API, no config reload, no persistence and no
multi-tenancy. What exists is a library, a CLI with machine-readable output in one
place, and a metrics endpoint on a unix socket.

Evidence:

- Inbound listeners in the whole tree: `MetricsEndpoint` binds a
  `tokio::net::UnixListener` (never a TCP port, deliberately, because the sandbox
  cannot bind one), and `vnet::proxy::ProxyListen` which can be `unix:/path` or
  `tcp://host:port`. A grep for `TcpListener::bind` in production code returns
  nothing outside `vnet`'s optional TCP proxy mode and `ports.rs`'s test.
- `cfrs metrics` is broken as a live readout. `cmd_metrics` calls
  `cfrs::util::metrics::Metrics::new().render()`, and `Metrics::new()` returns
  `Arc::new(Metrics::default())`. Every counter is therefore zero on every
  invocation. The module doc claims the numbers exist "so a monitoring setup works
  unchanged", and the command cannot deliver that.
- Machine-readable output exists in exactly one place: `cfrs net shim --json`
  prints the environment as JSON. `doctor` prints a human table.
- No config file for the agent itself. There is no state directory, no enrolment
  record, no persisted credential, no key store, no log file, no journal.
- No authentication on anything the process exposes. `share.rs` implements a
  constant-time path token and a rate-limited PIN gate for a *public share
  session*, and it is not wired to any HTTP service (F19), so nothing in the tree
  authenticates a caller.

Consequence: cfrs today is a client library plus a CLI. It has no control-plane
facing surface at all. Everything in the redesign's "agent talks to the hub"
column is net-new.

URL: https://github.com/talaria0101/cfrs/blob/main/src/bin/cfrs.rs
URL: https://github.com/talaria0101/cfrs/blob/main/src/feature/mod.rs
Label: [verified]

### F11. Metrics are Prometheus-shaped with cloudflared's own metric names

Claim: the counters and their exposition names are chosen so an existing
cloudflared scrape config keeps working.

Evidence, `src/util/metrics.rs`: counters are `connections_registered`,
`connection_attempts`, `reconnects`, `streams_total`, `stream_errors`, `bytes_in`,
`bytes_out`, `requests_served`. `render()` emits
`cloudflared_tunnel_ha_connections`, `cloudflared_tunnel_total_requests`,
`cloudflared_tunnel_request_errors`, `cloudflared_tunnel_response_bytes`,
`cloudflared_tunnel_request_bytes`,
`cloudflared_tunnel_concurrent_streams_per_tunnel` and
`cloudflared_tunnel_server_locations`, each as `# HELP` / `# TYPE ... counter` /
`name value`. `MetricsEndpoint::serve` publishes them over a unix socket at
`/metrics` with `Content-Type: text/plain; version=0.0.4; charset=utf-8`, and
refuses to remove a leftover regular file at that path, only a leftover socket.

This is a small thing that is worth copying: metric-name compatibility is free and
it means the operator's existing monitoring does not have to be rewritten.

URL: https://github.com/talaria0101/cfrs/blob/main/src/util/metrics.rs
Label: [verified]

### F12. Half the repository is a userspace virtual network, and it is the more novel half

Claim: `src/vnet/` (13 modules, roughly 250 KB of source) plus `shim/cfrsnet.c`
(35,096 bytes) give a process a real IP address space with no `AF_INET` syscall, no
network namespace, no TUN device and no `CAP_NET_ADMIN`.

Evidence, `src/vnet/mod.rs` and `VIRTUAL-NETWORK.md`:

- Layer 1, socket interposition. `cfrs net shim` compiles an `LD_PRELOAD` library
  that rewrites every `AF_INET`/`AF_INET6` socket to an `AF_UNIX` abstract socket
  named `\0cfrsnet/<family>/<address>/<port>`. The C source is embedded in the
  binary with `include_str!` and compiled with the host's `cc`, so no second file
  ships.
- Layer 2, a userspace IP stack. `smoltcp` 0.11.0, pinned exactly because its
  device and wire APIs are not semver-covered, owns `10.66.0.0/24` and
  `fd00:66::/64`, with real TCP and UDP state machines, over an in-process link.
- The two layers compose: two interposed programs talk with no host process
  between them, and the stack routes between them.
- Supporting pieces, all shipped: `vnet::dns` (a resolver at the gateway
  `10.66.0.1:53` with an optional upstream), `vnet::policy` (connect-time
  allow/deny ACLs, which a shimmed program sees as `EACCES`), `vnet::socks` and
  `vnet::proxy` (SOCKS5 and HTTP CONNECT front door on a unix socket, for programs
  that cannot be preloaded), `vnet::record` (pcap capture and deterministic replay
  with no `CAP_NET_RAW` and no `tcpdump`), `vnet::doctor` (re-runs the capability
  table against the running host), `vnet::framing` (u16 big-endian length prefix
  over a byte stream).
- The kernel claim is measured from below, not asserted. `tests/af_inet_kernel.rs`
  binds `AF_INET 10.66.0.2:18091` in a real process with the shim preloaded, reads
  the socket's inode from `/proc/self/fd/N`, and asserts the kernel files it under
  `/proc/net/unix` and not `/proc/net/tcp`. The control is the same probe with no
  shim, which must fail with `EACCES` or the host is not sealed and the rest of the
  file proves nothing. The inode is used deliberately because the shim interposes
  `getsockname`, so a probe built on that measures the shim's own bookkeeping; the
  author tried it first and it answered `inet`.

Why this matters to the redesign: this is a general solution to "the thing I want
to run assumes it can bind a port and reach loopback", which is exactly the
failure mode a data-plane agent hits on a locked-down box. It is also the part of
cfrs that is *not* Cloudflare-specific and therefore reusable whatever happens to
the tunnel story.

URL: https://github.com/talaria0101/cfrs/blob/main/src/vnet/mod.rs
URL: https://github.com/talaria0101/cfrs/blob/main/VIRTUAL-NETWORK.md
URL: https://github.com/talaria0101/cfrs/blob/main/tests/af_inet_kernel.rs
Label: [verified]

### F13. The cross-host control protocol exists as a codec and has no server, so the virtual network is a namespace and not a network

Claim: `vnet::control` encodes and decodes every op and resynchronises past a bad
frame, but nothing binds `\0cfrsnet/ctl`, so switch mode is not wired end to end.

Evidence, `VIRTUAL-NETWORK.md` section 11 and `KICKOFF.md` section 5C:

- The control protocol is specified: `u8 op | u16 len | payload`, with
  `op=1 REGISTER_BIND`, `op=2 REGISTER_CONNECT`, `op=3 UNREGISTER`,
  `op=4 DATAGRAM`. File descriptors are not passed; the shim keeps its `AF_UNIX`
  connection to the stack and multiplexes logical connections over it with a
  per-connection stream id, avoiding `SCM_RIGHTS`.
- The well-known control socket is `\0cfrsnet/ctl`. Section 11 records the state as
  "**codec only** ... There is no server: nothing binds `\0cfrsnet/ctl`, so switch
  mode is not wired end to end".
- Issue #1 states the consequence: "Cross-host is not available yet. The control
  protocol has a codec but no server, so switch mode is not wired end to end.
  Everything today is same-host."
- `TunnelDevice` is a type alias for `LinkDevice` (`src/vnet/device.rs` line 200),
  and its queues are unbounded, so the documented drop-when-full policy is
  unreachable. `LinkDevice::new` floors the MTU at 1280. `PacketQueue` has a
  single-waker slot, so a caller that parks on `recv()` while the reactor parks on
  `wait()` overwrites the other's registration.

This is the single most important structural gap for the redesign, because the
control server is exactly the thing that would make one agent per box into a mesh.
It is also the item the author's own priority list calls "the one worth doing".

URL: https://github.com/talaria0101/cfrs/blob/main/src/vnet/control.rs
URL: https://github.com/talaria0101/cfrs/blob/main/VIRTUAL-NETWORK.md
Label: [verified]

### F14. Dependencies: 21 direct, 298 in the lockfile, and two of them are heavy

Claim: the dependency footprint is moderate for Rust and dominated by the crypto
and async stack. Two entries matter for the "small binary" requirement.

Evidence, `Cargo.toml` (version 0.2.0, edition 2021, rust-version 1.85, 0BSD):

| dependency | version | why it is there |
|---|---|---|
| ureq | `=2.12.1` (exact) | the one provisioning POST; `default-features = false`, `tls` |
| russh | 0.64 | SSH remote forward, the only working public-URL path |
| quinn | 0.11 (`runtime-tokio`, `rustls-ring`, `log`) | QUIC edge transport |
| h2 | 0.4 | HTTP/2 edge transport |
| http | 1 | header types for the edge framing |
| tokio | 1 (rt-multi-thread, macros, net, io-util, time, fs, sync, signal) | runtime |
| tokio-rustls | 0.26 (ring, tls12, logging) | TLS |
| rustls | 0.23 (ring, std, tls12, logging) | TLS |
| rustls-pemfile / rustls-pki-types | 2 / 1 | embedded edge roots |
| hickory-resolver | 0.24 (tokio-runtime, system-config) | SRV lookup, and DNS serving |
| serde_yaml | 0.9 | cloudflared `config.yml` |
| qrcode | 0.14 (no default features) | terminal QR for the public URL |
| smoltcp | `=0.11.0` (exact) | the userspace IP stack |
| anyhow | 1 | error context in `vnet` only, deliberately left as-is |
| tracing | 0.1 | logging |
| futures | 0.3 (std only) | `AtomicWaker` for the stack's poll loop |
| ssh-key | `0.7.0-rc.11` (getrandom) | the ephemeral Ed25519 key |
| libc | 0.2 | the shim's libc boundary |

`Cargo.lock` contains 298 `[[package]]` entries. It pulls in `aws-lc-rs` and
`aws-lc-sys`, which need `cmake` and a C toolchain at build time. That is a real
cost for a binary that is supposed to be small and is supposed to install on a
server with one command.

`opt-level = 2` in `[profile.release]`, not 3. `.cargo/config.toml` sets
`SMOLTCP_IFACE_MAX_ADDR_COUNT = "4"` because smoltcp's default of 2 cannot hold
the four addresses the stack needs.

URL: https://github.com/talaria0101/cfrs/blob/main/Cargo.toml
URL: https://github.com/talaria0101/cfrs/blob/main/Cargo.lock
Label: [verified]

### F15. Binary size: the "426 KB" figure is a GitHub repository-size field, not a binary size, and no compiled artifact exists anywhere

Claim: there is no release, no tag, no CI workflow and no prebuilt binary in the
repository, so no binary size can be quoted from a source. The 426 figure is
GitHub's repository `size` field.

Evidence:

- `gh api repos/talaria0101/cfrs/releases` returns an empty array.
- `gh api repos/talaria0101/cfrs/tags` returns an empty array.
- The repository tree at `HEAD` contains no `.github/` directory at all, so there
  is no release workflow producing an artifact.
- The install instruction in the README is `cargo install --path .`, i.e. build it
  yourself.
- The GitHub API `size` field is documented as repository size in kilobytes. For
  this repository it is 426. My own sum of every blob in the recursive tree is
  1,182,230 bytes, which is larger than 426 KB, so the `size` field is a packed
  repository metric and not a source or binary measurement.
- I attempted to measure the release binary directly. `cargo` 1.99.0 and `rustc`
  1.99.0 are installed and crates.io is reachable. The build failed for
  environmental reasons, not repository reasons: `CARGO_HOME` points at
  `/home/qaidvoid/.cache/errand/cargo` which is not writable by this process, and
  every writable scratch filesystem I could use (`/tmp`, `/state/home`) is mounted
  `noexec`, so `cargo` cannot execute its own build scripts. The only exec-capable
  writable path is inside the operator's tree, which I was instructed not to write
  to. I therefore did not compile it and I quote no binary size.

Consequence: the operator's "426 KB" figure should not be carried into the
redesign as a binary size. A fair expectation from the dependency list is a
single-digit-megabyte static binary, comparable to cloudflared's category rather
than to a static Go hello-world, but that is an inference from the dependency set
and not a measurement. Label for any specific number: unverified.

URL: https://github.com/talaria0101/cfrs/releases
Label: [verified] for the absence of any release artifact; [unverified] for any
binary size.

### F16. Maturity: 20 days old, 10 commits, one author, one day of activity, no releases

Claim: the repository is very young and its entire history is a single day.

Evidence, `gh api repos/talaria0101/cfrs/commits`:

| sha | date (UTC) | subject |
|---|---|---|
| b9e540ef | 2026-10-09T03:18:52Z | cfrs: Rust quick-tunnel client that works in a locked-down sandbox |
| ca8eae04 | 2026-10-09T04:15:22Z | Extend cfrs into a full Cloudflare Tunnel client |
| fc910fe4 | 2026-10-09T04:29:48Z | Apply rustfmt to files with no other changes |
| 91ebaa03 | 2026-10-09T04:29:59Z | Fix the HTTP/2 edge header encoding against cloudflared's reference |
| f0c2a0d0 | 2026-10-09T04:36:08Z | Correct three false claims in the README, and clear new warnings |
| 0f9c9924 | 2026-10-09T06:31:44Z | Userspace virtual networking: give a program an address space without AF_INET |
| 0456316b | 2026-10-09T06:51:01Z | Add a standalone kickoff prompt for resuming this work |
| e0d9ba30 | 2026-10-09T12:36:04Z | Add pod-netns: a userspace network via seccomp notification, no shims |
| 290fbae6 | 2026-10-09T12:37:13Z | Make the fixture gate's printed build commands work verbatim |
| 0cbf27d8 | 2026-10-09T13:27:11Z | pod-netns: correct the docs against measurement, and fix two defects it hid |

All ten commits are on 2026-10-09, between 03:18 and 13:27 UTC. `pushed_at` equals
`created_at`'s day. As of the read date, 2026-10-29, the last commit is 20 days
old. One contributor, 0 stars, 1 fork, 0 watchers.

Two branches: `main` and `userspace-virtual-net` (the branch issue #1 documents).
A third head, `pod-netns`, exists as the head of open PR #3 (F21).

Assessment: this is not abandoned and it is not established. It is a 20-day-old
project by a single author that has not been touched in 20 days. For the redesign
it is a source of ideas and code to read, not a dependency to adopt.

URL: https://github.com/talaria0101/cfrs/commits/main
Label: [verified]

### F17. Licence is 0BSD, with one Apache-2.0 data file, and the attribution is honest

Claim: the crate is 0BSD, which is a permissive licence with no copyleft and no
attribution requirement beyond the licence text.

Evidence: `Cargo.toml` `license = "0BSD"`; GitHub API `license.spdx_id = "0BSD"`;
`LICENSE` is the BSD Zero Clause License, "Copyright (c) 2026 Talaria".
`THIRD_PARTY_NOTICES.md` records two third-party items:

1. `src/cloudflare/cf-edge-roots.pem`, the three Cloudflare edge root certificates
   extracted verbatim from `tlsconfig/cloudflare_ca.go` in cloudflare/cloudflared
   at `master`, fetched 2026-10-09. Those remain Apache-2.0. The file is data, not
   code, and cfrs adds them to the platform roots rather than replacing them.
2. `src/vnet/` and `shim/cfrsnet.c` began as a port of `Nemo-010/cfrs`, also 0BSD.
   The notice states plainly: "the port carried over code rather than ideas and
   that is stated in THIRD_PARTY_NOTICES.md, with the full defect list. A silent
   copy would have made the differences between the two impossible to see."

Consequence for the redesign: 0BSD is the easiest possible licence position. Code
can be taken, modified, relicensed and shipped with no obligation. The one caveat
is the Apache-2.0 certificate file, which needs its own notice if it is copied.

URL: https://github.com/talaria0101/cfrs/blob/main/LICENSE
URL: https://github.com/talaria0101/cfrs/blob/main/THIRD_PARTY_NOTICES.md
Label: [verified]

### F18. The test suite is 332 tests, counted rather than repeated, and the count matches the README

Claim: the README's "332 tests" is accurate.

Evidence, my own count on the cloned tree at `HEAD` of `main`:

- 294 occurrences of `#[test]` under `src/` and `tests/`.
- 38 occurrences of `#[tokio::test]`.
- Total 332, matching `README.md`'s "332 tests".

Distribution: `src/feature/mod.rs` 38, `src/cloudflare/http2.rs` 33,
`src/share.rs` 20, `src/config.rs` 16, `src/quicktunnel.rs` 15,
`src/bin/cfrs.rs` 14, `src/tunnel/mod.rs` 12, `src/cloudflare/mod.rs` 12, then a
long tail. Integration files: `tests/af_inet_kernel.rs` 4, `tests/shim_direct.rs` 4,
`tests/shim_no_socket.rs` 6, `tests/vnet_regressions.rs` 6.

The four integration files are the ones that had to be argued for, and the README
says each was checked by removing the fix and confirming the test goes red. Issue
#1 records "cargo test: 332 passed, 0 failed, green on three consecutive runs, up
from 211".

I did not run the suite. `cargo test` needs the same exec-capable filesystem that
`cargo build` needed (F15), so the pass count is the author's claim and my count of
test attributes is mine.

URL: https://github.com/talaria0101/cfrs/blob/main/README.md
Label: [verified] for the attribute count; [unverified] for the pass count,
which is the author's claim.

### F19. What cfrs does NOT do, enumerated from the author's own priority list

Claim: the missing surface is documented by the author with more precision than
most projects document what they have. This is the authoritative list for
planning.

Evidence, `KICKOFF.md` section 5, "What is missing", in the author's own priority
order:

**A. Serve traffic over the Cloudflare edge.** The largest gap. Registration, the
per-stream `ConnectRequest` preamble, the visitor request and response, reconnect
with backoff, and HA over `conn_index` are all absent. The author requires honesty
about it: "An untested claim marked untested is acceptable. An untested claim
marked working is not."

**B. Features dropped with the tunnel core:**
- Named tunnels: `--token`, `--credentials-file`, the `credentials-file:` config
  key. Read the credentials JSON locally; never log the secret or the account tag.
- The rest of cloudflared-compatible `config.yml`: ordered ingress rules, hostname
  and path matching, the catch-all last rule, `originRequest` including `noTLSVerify`
  and `connectTimeout`.
- `--forward` and `cfrs connect` as a working WebSocket bridge, so raw TCP, unix
  sockets and interactive protocols cross the tunnel rather than HTTP only.
- `cfrs share` as a working service. The gate in `src/share.rs` is complete and
  correct: constant-time token comparison, rate-limited PIN, and a wrong token
  answers `404` so a prober learns nothing. Missing is the HTTP service behind it:
  multipart upload with per-file and count caps, single-file download, proxy mode.

**C. The rest of the virtual network:**
- The control server (F13).
- Fault injection, using smoltcp's `FaultInjector` and `FuzzInjector`.
- Bounded link queues (currently unbounded).
- The single-waker slot in `PacketQueue`.
- `LinkDevice::wait`, and MTU negotiation instead of a 1280 floor.
- `PcapFile::decode` accepting only the exact flavour it writes.

**D. Security and durability:**
- SSH host key pinning (F7).
- Resource limits on internet-facing paths: concurrent channel cap,
  per-connection splice timeout, a timeout on `UnixStream::connect`.
- `cfrs connect -L unix:/path` unlinking whatever is at the path.

Also absent, and not on that list because they were never in scope: no container
runtime, no process supervision, no job queue, no CI, no object storage, no
database, no user model, no dashboard, no REST API, no WebSocket control channel,
no enrolment, no key management beyond an ephemeral SSH key, no logging beyond
`tracing` to stderr, no systemd unit, no installer, no packages.

URL: https://github.com/talaria0101/cfrs/blob/main/KICKOFF.md
Label: [verified]

### F20. The three open issues, read in full

All three were opened on 2026-10-09 and all three are still open on 2026-10-29.
None has been closed.

**Issue #1, "Userspace virtual networking: comparison with Nemo-010/cfrs, and what
the new capability enables"**, opened 2026-10-09T06:42:07Z, 12,794 bytes, 0
comments. Documents the port of the userspace virtual network from `Nemo-010/cfrs`
in commit `0f9c992` on branch `userspace-virtual-net`: nine defects in the ported
code found and fixed, four defects in older code fixed, one claim withdrawn, and
121 new tests (211 to 332). The clearest ported defect: the shim never ran its lazy
symbol resolver in `close`, `dup`, `dup2`, `dup3`, `listen`, `getpeername` or
`getsockname`, so any program that closed a descriptor before opening a socket
died with `SIGSEGV`, which is most programs, and the existing suite could not see
it because every test opened a socket first. The issue is explicit that the tunnel
core was deliberately not ported, dropping named tunnels, the `config.yml` ingress
rules, `--forward`/`cfrs connect` and `cfrs share` as a working service. It also
records the honest limit: "the tunnel path could not be tested here at all, because
port 7844 is blocked on this host. So every claim about the reference
implementation's tunnel behaviour is its claim, not a verified finding."

**Issue #2, "pod-netns: transparent proxying without shims, and everything measured
getting there"**, opened 2026-10-09T10:16:20Z, 12,345 bytes, 2 comments. A survey
of what a sealed sandbox actually permits (measured on a `bailey` sandbox, uid 966,
`CapEff 0`, `NoNewPrivs 1`, seccomp filter mode 2, Landlock ABI 10), then a survey
of eight namespace-based virtual-network tools (`rmb122/nsproxy-rs`,
`stevenengler/socksns`, `nlzy/nsproxy`, `OkamiW/proxy-ns`, `fooker/netns-proxy`,
`vi/netns_tcp_bridge`, `ple1n/nsproxy`, `pb2106/Mirage`) with what each is worth
adopting, then the design for `pod-netns`. Includes the tailscale work:
`tailscaled --tun=userspace-networking` joined the tailnet in the sandbox, and the
LocalAPI `ts-dial` bridge (`POST /localapi/v0/dial` with `Upgrade: ts-dial`) is the
only way in because the daemon is static Go and `LD_PRELOAD` cannot reach it. The
pty wall is the argument for namespaces: Tailscale's server calls `pty.Open()` and
fails the session with no `/dev/ptmx`, while a dynamic `/usr/sbin/sshd -i` on a
unix socket logs `openpty: No such file or directory` and carries on over pipes.
Records five measurements that each contradicted something the project previously
believed.

**Issue #3, "pod-netns: fix a stack overflow in fd passing, bound the tables, add
--map and doctor --json"**, opened 2026-10-09T12:36:40Z, 3,177 bytes, 0 comments.
This is the PR issue (F21). Correctness: `recv_fd` copied `size_of::<RawFd>()`
*elements* of `RawFd` through a `*mut RawFd`, writing sixteen bytes into a
four-byte stack variable, a stack overflow on the netns path, found by clippy.
The child's `close` is now intercepted so the supervisor drops its end of an
injected socketpair and the table entry instead of growing for the process
lifetime, and both tables are capped. Surface: `--map NAME=ADDR`, `doctor --json`
which now exits 0 when either backend can run, `--version`, and routing rules wired
into the netns backend. Claims `cargo test --lib --tests`: 360 pass.

URL: https://github.com/talaria0101/cfrs/issues/1
URL: https://github.com/talaria0101/cfrs/issues/2
URL: https://github.com/talaria0101/cfrs/issues/3
Label: [verified]

### F21. Open PR #3 is the real direction of travel, and it is the strongest evidence for the "one binary" idea

Claim: PR #3 turns cfrs from one binary into a crate with two binaries and adds the
broker-like egress layer the redesign needs. It is open, not merged, and
`mergeable` is true.

Evidence, `gh api repos/talaria0101/cfrs/pulls/3`:

- number 3, state open, draft false, merged false, mergeable true
- base `main`, head `pod-netns`, head sha `ad535150056e7f6f8ee2bbf18cd9d42455dabb6e`
- created 2026-10-09T12:36:40Z, updated 2026-10-09T12:57:38Z
- 6,816 additions, 6 deletions, 20 files changed

The files, which are the roadmap:

| file | status | lines |
|---|---|---|
| `POD-NETNS.md` | added | 231 |
| `TAILSCALE.md` | added | 316 |
| `src/bin/pod-netns.rs` | added | 2,759 |
| `src/vnet/upstream.rs` | added | 560 |
| `src/vnet/tailscale.rs` | added | 483 |
| `src/vnet/tailscale_ssh.rs` | added | 304 |
| `tests/pod_netns_seccomp.rs` | added | 791 |
| `tests/shim_socks.rs` | added | 141 |
| `shim/cfrssocks.c` | added | 479 |
| `shim/fakepwd.c` | added | 145 |
| `shim/unixsockd.c` | added | 52 |
| `shim/tsgetent`, `shim/tsid`, `shim/loginshell` | added | 32, 24, 24 |
| `tools/ts-sshd.sh` | added | 147 |
| `src/bin/cfrs.rs` | modified | +191 |
| `src/vnet/mod.rs` | modified | +6 |
| `src/vnet/shim.rs` | modified | +57 / -4 |
| `README.md`, `VIRTUAL-NETWORK.md` | modified | +53, +21 |

The PR body describes the target surface: TCP, UDP through SOCKS5 UDP ASSOCIATE,
fake-IP DNS, inbound bind/listen/accept, proxy chaining, per-destination routing, a
SOCKS5/HTTP/UDP front door, IPv6, "the tailnet as transport via -x tailscale:",
ambient `ALL_PROXY` support, `--map`, and a machine-readable doctor. It also states
the shared logic lives in `cfrs::vnet::upstream` "so both backends and any other
caller use one implementation", and that the branch covers what `tools/pod-netns/`
lists as not implemented: `sendto`/`sendmsg`/`sendmmsg` interception so UDP is
carried and not only `SOCK_STREAM`, fake-IP DNS, UDP ASSOCIATE, proxy chaining, a
front door, per-destination routing, `io_uring` denial, IPv6 and the tailnet as
transport.

Note for the record: the branch list from `gh api repos/talaria0101/cfrs/branches`
returns only `main` and `userspace-virtual-net`. The `pod-netns` head exists as the
PR head but is not listed as a branch, which usually means the head branch was
deleted after the PR was opened. The PR is still open and still mergeable against
its recorded head sha.

Consequence: this is the closest thing in the wild to the operator's requirement
(b), and it is 20 days of unmerged work in a 20-day-old repository. It is a design
reference, not a foundation.

URL: https://github.com/talaria0101/cfrs/pull/3
Label: [verified]

### F22. `tools/pod-netns/` is a standalone crate that gives a program a network with no shims at all

Claim: a second, independent binary in the same repository uses
`SECCOMP_RET_USER_NOTIF` to mediate socket syscalls in the kernel, so it reaches
statically linked binaries that `LD_PRELOAD` cannot.

Evidence, `tools/pod-netns/`:

- `Cargo.toml`: version 0.1.0, edition 2021, 0BSD, dependencies `libc 0.2` and
  `nix 0.29` (socket, process, poll, user, fs). Nothing else.
  `[profile.release] opt-level = 2`, `panic = "abort"`.
- `README.md` (13,244 bytes) documents the mechanism: pre-create a pool of
  `AF_UNIX` socket pairs before `exec`; install one seccomp user-notify filter into
  the child from a pre-exec hook and hand the listener back to the supervisor over
  `SCM_RIGHTS`; answer `socket(AF_INET, SOCK_STREAM)` with the number of a pooled
  socketpair end; read the child's `sockaddr` from `/proc/<pid>/mem`, answer
  `connect`, and relay both directions; for `--listen`, bind an `AF_UNIX` socket
  and hand the child a pooled fd carrying the queued connection.
- Source sizes: `src/main.rs` 59,724 bytes, `src/seccomp.rs` 34,051,
  `src/relay.rs` 17,805, `src/proxy.rs` 15,894, `tests/integration.rs` 27,444.
  Plus 13 standalone C probes in `probe/` and 10 C/Go fixtures in `testdata/`.
- Measured working: "64 of 64 notifications served, with no errors."
- Five recorded measurements, each of which contradicted something the project
  previously believed: `seccomp_notif` must be zeroed before every `NOTIF_RECV`;
  the BPF miss offset must be 0, not `n-j+1`; the filter must be installed into the
  child, not the supervisor, or the tool deadlocks; `/proc/<pid>/mem` is read-only
  under `CapEff 0`; `setsockopt` must be answered 0 for a socket the supervisor
  handed out, because glibc's resolver aborts when an IP-level option fails.
- The README states its scope plainly, including that `io_uring` is a real hole on
  any host that permits it, because the kernel performs the submitted operation
  itself and leaves no syscall for a filter to mediate.

Consequence: this is a genuinely reusable primitive for the data plane. A
locked-down box, a static Go or Rust binary that insists on binding a port, and no
`CAP_NET_ADMIN`, is a common combination. This is 0BSD and it is small.

URL: https://github.com/talaria0101/cfrs/tree/main/tools/pod-netns
Label: [verified]

### F23. Provenance: ported from `Nemo-010/cfrs`, nine defects fixed, and the attribution is unusually honest

Claim: `src/vnet/` and `shim/cfrsnet.c` are a port of code from a second, separate
repository created the same day, and the differences are documented rather than
hidden.

Evidence:

- `Nemo-010/cfrs`, from `gh api repos/Nemo-010/cfrs`: description "Expose a local
  unix-socket or TCP server on the public Electrosphere via anonymous Cloudflare
  quick tunnels, from Rust (0BSD)", language Rust, 0BSD, created
  2026-10-09T02:19:03Z, pushed 2026-10-09T12:49:28Z, size 165, 0 stars, 0 open
  issues, not a fork. Both repositories were created on 2026-10-09, 59 minutes
  apart.
- `THIRD_PARTY_NOTICES.md`: "It began as a port of `Nemo-010/cfrs`, which is also
  0BSD, and the port carried over code rather than ideas."
- The nine ported defects, each reproduced before being fixed and each pinned by a
  test that fails without the fix: the missing lazy resolver in `close`/`dup*`/
  `listen`/`getpeername`/`getsockname` (SIGSEGV); `getsockname` zeroing a 128-byte
  `sockaddr_storage` into the caller's buffer (stack smashing);
  `getsockname(fd, NULL, &len)` dereferencing null; a short buffer returning
  `EINVAL` instead of truncating; `fcntl` reading a `va_arg` that was never passed
  (undefined behaviour at `-O2`); `accept` clamping against the wrong length;
  `ControlMessage::encode` splitting a UTF-8 character; the control decoder
  keeping the bad byte at the head (permanent wedge, unbounded buffer); closed
  sockets never leaving the smoltcp `SocketSet` (buffers leaked for the process
  lifetime).
- Four more changed without a reproduction: the proxy reported success before the
  connection existed; `FrameDecoder` wedged on a zero-length frame;
  `max_poll_interval` was overridden by a hardcoded clamp; and the static-file
  origin's traversal check was lexical, so a symlink out of the served root was
  served. That last one is a path-traversal fix.
- One claim withdrawn rather than fixed: `cfrs net demo` printed "kernel AF_INET
  bind/connect used: none" from a field set to a literal `0`. The author withdrew
  it because "a userspace stack cannot observe its own syscalls, so that line was
  a claim about a number nothing counted".

Consequence: the discipline here is the most transferable thing in the repository.
A port that lists its own nine defects is a port you can audit.

URL: https://github.com/Nemo-010/cfrs
URL: https://github.com/talaria0101/cfrs/blob/main/THIRD_PARTY_NOTICES.md
Label: [verified]

### F24. Reusability, split by the two roles the operator asked about

Claim: cfrs is reusable as a data-plane agent component and is not reusable as a
dashboard.

Evidence:

**As the dashboard or manager SPA: nothing.** The tree contains no web UI, no
HTML, no template, no CSS, no JavaScript, no build tooling for a frontend. The
only HTTP server code is `vnet::proxy` (a SOCKS5 and HTTP CONNECT front door) and
`MetricsEndpoint` (Prometheus text on a unix socket). The only HTTP client code is
`ureq` for one provisioning POST. There is no framework that could serve a SPA.

**As a data-plane agent: four things, in descending order of value.**
1. `src/proxy.rs` plus `src/transport/`: the HTTP CONNECT client, the SSH relay,
   the WebSocket transport and the direct transport, behind one object-safe
   `Transport` trait whose `connect` returns a plain duplex byte pipe. This is the
   generic egress layer any agent on a locked-down box needs, and it is the part
   that is Cloudflare-independent.
2. `src/cloudflare/`: the edge discovery, the embedded trust roots, the two
   transports and the header codec. This is the only Rust implementation of the
   argotunnel protocol I am aware of that is small enough to read in an afternoon
   and that is checked against cloudflared's own Go code.
3. `src/vnet/` and `shim/cfrsnet.c`: the userspace network, for the case where the
   agent's workload cannot bind a port.
4. `src/config.rs`: the cloudflared `config.yml` parser, which is what makes an
   existing cloudflared deployment portable to a different connector.

What is not reusable without a rewrite: everything that assumes a single process
with no persisted state, no enrolment, no authentication of a caller and no
concurrent operator.

URL: https://github.com/talaria0101/cfrs
Label: [verified]

### F25. Method note: the search gateway returned nothing for this repository

Claim: the pkgforge search gateway pinned to tinyfish does not index this
repository, and the fallback was used from the first call.

Evidence, the exact call and its result:

```
curl -qfsS "https://search.web.pkgforge.dev/search?q=talaria0101%2Fcfrs&count=8&provider=tinyfish"
```

Returned 8 results, all about Talaria electric motorcycles and e-bike parts
(`talariacanada.com`, `talariabike.co.uk`, `talaria-ebikes.com`,
`talaria.cn/scbox/`, a Facebook post, `talariaebikeparts.com`, `steadygarage.com`,
`vectorebikes.com`), with `"rank":"provider(timeout)"` and `"dropped":0`. None is
the repository. The read gateway was therefore not attempted either, and every
primary source in this file came from `gh api` against
`api.github.com/repos/talaria0101/cfrs` plus one `git clone --depth 1`. No
web_search or web_fetch fallback was needed.

URL: https://search.web.pkgforge.dev/search?q=talaria0101%2Fcfrs&count=8&provider=tinyfish
Label: [verified]

---

## 2. What this changes for the redesign

Written against the two new requirements: (a) portability of application code
between Cloudflare and the self-hosted backend, and (b) one small agent binary per
server instead of many heavy ones.

### 2.1 Do not plan around cfrs being a cloudflared replacement. Plan around it being the egress layer of the agent

The most important finding is F1 and F8 together. `cfrs tunnel` does not serve
traffic, and `--token` and `--credentials-file` are parsed into a flag table and
then never read, so the binary always provisions an anonymous quick tunnel
regardless of what credentials it is given. Any plan that says "install cfrs on
each box instead of cloudflared" is wrong today.

What cfrs *is*, is the egress and edge-client half of the agent the operator
wants. Take `src/proxy.rs`, `src/transport/`, `src/cloudflare/` and `src/config.rs`.
Leave `src/relay.rs` alone unless the deployment genuinely needs a third-party
relay, in which case pin the host key first.

Reason: the redesign needs an agent that can (i) reach the internet from a box with
no direct egress, and (ii) speak the Cloudflare tunnel protocol. cfrs is the only
small, readable, permissively licensed implementation of (ii) that I found, and it
has the best implementation of (i) in the survey. It is not a product.

### 2.2 The single highest-value asset is the `Transport` trait and its four implementations

`src/transport/mod.rs` defines one object-safe trait, `connect(host, port,
timeout) -> Box<dyn Duplex>`, with `Direct`, `HttpConnect`, `SshRelay` and
`WebSocket` behind it. `src/proxy.rs::connect_tunnel` returns a plain byte pipe and
`read_connect_response` is generic over `Read`, so the allow-list refusal and the
byte-coalescing case are testable without binding a socket.

Reason: this is exactly the seam the redesign's agent needs. The agent must reach
the hub from behind NAT, from behind a corporate egress proxy, and from a network
that only permits 443. Expressing those as one trait means the control loop, the
broker and the executor never learn which is in use, and adding a transport is one
impl. It also means the Cloudflare-specific part and the generic part are separated
by a type, which is what makes requirement (b) achievable without the agent
becoming a Cloudflare-only tool.

Concretely: the agent's outbound control connection should be a `Transport`, not a
hardcoded `wss://` client. That single decision is what lets the same binary run on
a box with direct egress and on a box that needs a CONNECT proxy.

### 2.3 The edge client is the one part that needs port 7844, and it is the one part that has never run

`src/cloudflare/` is complete at the framing layer: the right SRV record, the right
port, the right SNI and ALPN for both transports, the embedded Cloudflare-internal
roots, the six-byte data-stream preamble, the control-stream header, the
base64-no-padding response header codec, and the Cap'n Proto `TunnelAuth` shape.
What is missing is the session layer: registration, the per-stream
`ConnectRequest`, the visitor request and response, reconnect with backoff, and HA
over `conn_index`.

Reason: this is a large, well-specified, testable work item, and the author has
already written the oracle for the hardest part of the wire format. It is also the
part that cannot be validated in the operator's own environment unless one machine
has UDP or TCP egress to `region1.v2.argotunnel.com:7844`. Budget for that.

Recommendation: build the serving loop against a recorded or synthetic edge first,
exactly as the author's KICKOFF.md requires, and mark every claim about the real
edge as untested until a real edge has been reached. Do not let "it compiles and
the unit tests pass" become "the tunnel works".

### 2.4 Requirement (b): one small binary per server. cfrs is the right crate shape and the wrong scope

cfrs today is one binary. PR #3 makes it one crate with two binaries (`cfrs` and
`pod-netns`) sharing `cfrs::vnet::upstream`. `tools/pod-netns/` is a third,
standalone crate with two dependencies.

Reason: the operator's instinct is right, and cfrs shows the shape that gets there
without a monolith. One crate, several binaries, shared library modules, one
dependency tree. The agent binary links what it needs; a diagnostic or a bootstrap
tool is a second binary from the same crate rather than a second project with its
own lockfile.

What the redesign's single agent must own, mapped against what cfrs already has:

| agent concern | cfrs today | what to add |
|---|---|---|
| egress to the hub | `Transport` trait, 4 impls | reuse as-is |
| Cloudflare tunnel edge | framing only, no session layer | registration, serving loop, reconnect, HA |
| ingress routing | `config.rs` + `tunnel::Router`, cloudflared-compatible | reuse, and finish `originRequest` |
| local origin discovery | `ports.rs` reads `/proc/net/tcp{,6}` | reuse, plus unix-socket and container discovery |
| giving a workload an address space | `vnet` + the shim | reuse; wire the control server for cross-host |
| broker / job queue | nothing | net-new: durable outbox, request/response correlation |
| orchestrator interface | nothing | net-new: enrolment, capability authority, exec, PTY |
| metrics | `util::metrics` + `MetricsEndpoint` | reuse; fix `cfrs metrics` printing zeros |
| authentication of a caller | nothing | net-new, and it must exist before the agent listens anywhere |
| persisted state | nothing | net-new: state dir, enrolment record, credential store |
| installer, systemd unit, packages | nothing | net-new, or copy from E4-serverbee |

The three net-new rows are the whole cost of the redesign's data plane. cfrs
removes none of them, and it removes a surprising amount of the rest.

### 2.5 Requirement (a): cfrs contributes nothing to portability of application code, and saying so is the useful output

There is no Workers runtime, no `workerd`, no fetch/Request/Response shim, no
Durable Object, no KV, no queue and no binding anywhere in the tree. cfrs is a
network client. It makes a *connection* portable between Cloudflare and your own
metal; it does nothing to make application code portable.

The one thing it does contribute to requirement (a) is indirect and worth stating:
`src/config.rs` parses cloudflared's `config.yml` unchanged, including the ordered
ingress rules, the hostname patterns, the catch-all-last rule and the `originRequest`
block. That is a working example of the portability pattern the operator asked for
at the configuration layer: adopt the incumbent's config shape exactly, so an
existing deployment ports across without edits. Apply the same rule to the
application layer, which is `workerd` on own metal versus Workers on Cloudflare,
and that is E5-mirrord and A3-workerd territory, not this file.

Do not present cfrs as an answer to requirement (a). Present `config.rs` as a
worked example of how to answer it.

### 2.6 Licence is the easiest decision in the survey: 0BSD, take the code

0BSD, one Apache-2.0 certificate data file, and honest attribution for the port
from `Nemo-010/cfrs`. There is no copyleft, no source-offer obligation and no
attribution requirement beyond the licence text.

Recommendation: take `src/transport/`, `src/proxy.rs`, `src/cloudflare/` and
`src/vnet/` as the starting point for the agent's egress and edge layers, and keep
`THIRD_PARTY_NOTICES.md` accurate as the port grows. Compare E4-serverbee, where
AGPL-3.0 makes the equivalent decision expensive. This is the opposite problem and
it should be exploited rather than ignored.

### 2.7 Four security items must be fixed before any of this runs on a real server

1. `check_server_key` returns `Ok(true)` in `src/relay.rs` and defaults to accept in
   `src/transport/ssh.rs` (F7). A network attacker on the path reads and modifies
   all tunnel traffic in both directions. Add a pinned-key or known-hosts path and
   a flag that says so when it is off.
2. No cap on concurrent visitor channels, no per-connection timeout on the splice,
   no timeout on `UnixStream::connect` (F7). A client that opens a channel and says
   nothing holds a task and an origin fd until the one-hour SSH session timeout.
3. `cfrs connect -L unix:/path` unlinks whatever is at that path without checking
   whether it is a stale socket, and discards the result (F7).
4. The static-file origin's traversal check was lexical, so a symlink out of the
   served root was served. It is fixed in this tree, canonicalise-then-compare. If
   you copy the origin code, copy the fixed version and keep the test.

The author's own KICKOFF.md names all four. None is hard. All four are the
difference between a demo and an agent.

### 2.8 The measurement discipline is the most transferable thing in the repository

The README's claims are separated into "what works", "what does not work yet" and
"what this does not establish". The kernel claim is measured by socket inode from
`/proc/self/fd`, with a control that must fail or the test skips with a reason.
The relay choice was measured by sending a real CONNECT and reading the proxy's own
status line. The header encoding is diffed against cloudflared's own Go code. A
claim that turned out to be unmeasurable was withdrawn rather than left standing.
A decode-error path that leaked the tunnel secret was found and redacted.

Reason: the redesign's biggest risk is not technical, it is believing its own
narrative about a tunnel that has never carried a visitor. Copy this discipline
into the redesign's own documentation: every claim carries whether it was measured,
against what, on which host, on which day.

### 2.9 Two things to measure before committing to the design, both cheap

1. **Whether one machine can reach `region1.v2.argotunnel.com:7844`.** The whole
   Cloudflare edge path in cfrs is untested because the author's sandbox blocked
   that port. If the operator's own network also blocks UDP or TCP 7844, the
   cloudflared-compatible agent is a paper design and the redesign needs a
   different transport story. `cfrs doctor` answers this in one command, or the
   SRV lookup plus a connect does.
2. **What the agent binary actually weighs once it links quinn, russh, smoltcp and
   aws-lc-rs.** I could not measure it (F15). The dependency set suggests a
   single-digit-megabyte binary, which is still far below cloudflared's own 40 MB
   figure as recorded in the README, but it is not the 426 KB the brief implies.
   Measure it before promising a footprint, and consider whether `aws-lc-sys`'s
   cmake build is acceptable on the target boxes.

---

## 3. Not covered / open questions

Named precisely, with what would settle each.

1. **The release binary size.** No release, no tag, no CI, no prebuilt artifact
   exists anywhere in the repository (F15). I could not compile it because every
   writable scratch filesystem on this host is mounted `noexec` and the only
   exec-capable writable path is inside the operator's tree, which I was instructed
   not to write to. What would settle it: `cargo build --release` on a host with an
   exec-capable scratch filesystem, then `ls -l target/release/cfrs`. Any specific
   number in circulation is unverified.

2. **Whether the edge client works at all.** The framing layer is complete and
   unit-tested, but nothing has ever connected to the real edge, because port 7844
   is blocked on the author's host (F5). The author says so himself. What would
   settle it: run `cfrs tunnel` from a host that permits UDP or TCP to
   `region1.v2.argotunnel.com:7844` and read whether a visitor request is served.

3. **Whether the `pod-netns` PR branch actually passes its own claimed 360 tests.**
   The claim is in issue #3 and I did not run it. The branch head is not listed as
   a branch by the API, only as the PR head, so I read the PR file list rather than
   the branch. What would settle it: check out `ad535150` and run
   `cargo test --lib --tests`.

4. **Whether the tailscale LocalAPI bridge in issue #2 landed anywhere.** The
   issue describes `cfrs net tailscale`, `cfrs net socksify`, `cfrs net ts-shims`
   and `cfrs::vnet::upstream`. A grep of `main` for `tailscale`, `socksify` and
   `fake-ip` returns nothing. So that work exists only in issue #2 and in PR #3's
   file list. What would settle it: read `src/vnet/tailscale.rs` at the PR head.

5. **Whether `cfrs metrics` printing zeros is intentional.** I read
   `cmd_metrics` calling `Metrics::new()`, which returns a defaulted `Arc<Metrics>`
   (F10). I did not run the binary, so I cannot rule out that a live endpoint
   elsewhere is meant to be the real surface. What would settle it: run
   `cfrs metrics` and read whether every counter is zero, which the code says it
   will be.

6. **Whether the abstract-socket control protocol is safe across a real trust
   boundary.** `\0cfrsnet/ctl` is one global namespace for the whole host, and the
   README records that two tests sharing a port produce a `bind-failed` that reads
   exactly like a shim failure. Nothing in the tree authenticates a process that
   connects to the control socket. What would settle it: read `src/vnet/control.rs`
   end to end and decide whether an unauthenticated local control socket is
   acceptable once the agent holds tunnel credentials.

7. **How the userspace stack behaves under real load.** `LinkDevice`'s queues are
   unbounded, `PacketQueue` has a single-waker slot, and the MTU is floored at 1280
   (F13). The README and VIRTUAL-NETWORK.md section 11 say so. No throughput or
   memory figure exists for the stack carrying real traffic. What would settle it:
   a benchmark over the in-process link and over a tunnel-backed device, with the
   queues bounded first.

8. **Whether `cfrs` can be driven by a Workers-hosted control plane at all.** The
   library is drivable in-process (F9) but there is no inbound control API, no
   authentication and no persisted state (F10). I did not attempt to build a
   control channel. What would settle it: a minimal hub that speaks to a Rust
   binary linking `cfrs::relay` and `cfrs::quicktunnel`, and read whether the
   enrolment and credential story survives.

9. **Anything about the other five E-topics.** This file covers cfrs only. Where I
   mention ServerBee (E4) or mirrord (E5) it is as the operator named them, not as
   something I read. The cross-topic synthesis is the parent's job.

10. **Whether the operator's own network permits the Cloudflare edge at all.** This
    is the question that decides whether the cloudflared-compatible half of cfrs is
    worth finishing, and it is answerable in one command from one of the operator's
    machines. I have no visibility into that network.
