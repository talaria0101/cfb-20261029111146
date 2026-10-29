# Tool survey

All GitHub figures read 2026-10-29. Figures marked **[me]** were re-read against the
GitHub API or the vendor's page by the author on that date. Others come from the named
research file and were not independently re-read.

Licences are the SPDX identifier where declared. Where a repository mixes licences per
file, that is said.

## 1. The shortlist

| Slot | Pick | Reason |
|---|---|---|
| Single agent binary | `cfb-node`, composed from cfrs + ServerBee + omnyssh + mirrord | see section 2 |
| Orchestrator | Nomad 2.1.0, k3s as alternative | REST, event stream, parameterized dispatch |
| PaaS on top | Coolify v4.5.3 | only one with an API, SSH multi-host and tunnel support together |
| CI | self-hosted GitHub Actions runners | needs only outbound 443 |
| Own-the-control-plane CI | Woodpecker CI v3.20.0 | 20 MB server, real REST API, three config changes needed |
| Object storage | SeaweedFS 4.51, R2 for hot and small | Apache-2.0, single node, Object Lock and versioning |
| Cache and queues | Valkey 9.1.3 | BSD, the only live Redis-line option legally usable here |
| HA control-plane state | rqlite | MIT, Raft, HTTP/JSON |
| SQLite backup | Litestream | Apache-2.0 |
| Untrusted-code sandbox | E2B Runtime (Firecracker underneath) | control and data plane separation, secrets as metadata only |
| Browser terminal | ttyd | one binary, `-H` auth delegation, `-b` base path |
| Container dashboard to reuse | Komodo v2.3.4, or Portainer 2.45.3 | API-first, per-host agent |
| Ingress and TLS | nginx-proxy-manager v2.16.0, or Caddy v2.11.7 | REST API with tokens, or zero-config HTTPS |
| Edge connector, stage 1 | cloudflared 2026.10.6 | free, no public IP, CDN and WAF in front |
| Edge connector, stage 2 | cfrs, inside cfb-node | see section 2 and SPEC 4.3 |
| Self-hosted Workers runtime, exit route | workerd v1.20261029.1 | Apache-2.0, runs your Workers unchanged |
| Workers plus DO platform, exit route | celld v0.6.3 | Apache-2.0, deploys from a wrangler.json |

## 2. The six repositories read for the single-agent design

Read this round at the operator's request. Each was read from source, not from its
README.

### 2.1 `talaria0101/cfrs` - the base

Cloudflare quick-tunnel client in Rust, for sandboxes where cloudflared cannot run.
0BSD, Rust, 426 KB repository, 0 releases, 0 tags, 3 open issues, 10 commits all on
2026-10-09, one author, 0 stars. Created 2026-10-09 **[me]**.

**What works.** Anonymous quick-tunnel provisioning against the real
`POST https://api.trycloudflare.com/tunnel`, credential-free.

**What does not.** I read the source myself. `cmd_tunnel` discovers the edge,
provisions a quick tunnel, prints the URL and returns. `src/tunnel/mod.rs` says so in
its own module documentation: registration and visitor serving are not implemented, so
a `Tunnel` is not yet a running Cloudflare tunnel. `--token` and `--credentials-file`
are parsed into a flag table and never read, so `Cargo.toml`'s claim of "named
tunnels" is not supported by the code. `cfrs serve` produces a working public URL only
by SSH remote-forwarding to `free.pinggy.io:443`, a third-party free relay that can
read the traffic.

**What is genuinely valuable.** The edge codec is precisely built: SRV
`_v2-origintunneld._tcp.argotunnel.com`, port 7844, QUIC ALPN `argotunnel` with SNI
`quic.cftunnel.com`, HTTP/2 with SNI `h2.cftunnel.com` and no ALPN, a 6-byte preamble
`0A 36 CD 12 A1 3E` plus `01`, a control-stream header, and a base64-no-padding
response header codec diffed against cloudflared's own Go `SerializeHeaders` by a
committed oracle script. None of it has reached the real edge.

Plus: one `Transport` trait with `Direct`, `HttpConnect`, `SshRelay` and `WebSocket`
behind a byte-pipe seam, which is what makes the agent work in a sandbox, behind a
proxy or on bare metal without anything above it learning which; `src/config.rs`,
which parses cloudflared's config YAML shape; and `src/vnet/` with `shim/cfrsnet.c`, a
userspace network using `LD_PRELOAD` to interpose `AF_INET` onto `AF_UNIX`, a
`smoltcp` stack owning `10.66.0.0/24`, virtual DNS, connect-time ACLs, SOCKS5 and
HTTP CONNECT, and pcap record and replay.

**Cost.** 21 direct dependencies, 298 in `Cargo.lock`, including `aws-lc-sys`, which
needs cmake. Trim before the size target is credible. The "426 KB" figure is GitHub's
repository-size field, not a binary size.

Full read: `research/E6-cfrs.md`.

### 2.2 `ZingerLittleBee/ServerBee` - the agent model

Rust plus React monorepo, agent and server and web dashboard. AGPL-3.0, 339 stars, 29
open issues, pushed 2026-10-17, latest release v1.0.0-beta.6 on 2026-10-06, a
prerelease. Alive, pre-1.0 **[me]**.

The agent is purely outbound with no listener: `build_ws_url` maps http and https to
ws and wss, `build_ws_request` sets `Authorization: Bearer <token>`, and the connection
is `connect_async`. Its `Cargo.toml` has no axum, hyper, tower, warp, actix or poem.
Every `TcpListener::bind` under `crates/agent/src/` is inside `#[cfg(test)]`. That is
the structural fact that makes a Cloudflare Tunnel sufficient with zero inbound
firewall change.

The credential model is the one to copy: the agent generates 32 random bytes and
persists them to `agent.toml` **before** claiming a single-use server-bound short-lived
offer, then submits them as `proposed_run_token`; the server stores an argon2 hash and
never returns the plaintext; a 401 on the upgrade triggers re-enrollment capped at
three attempts; a permanent auth failure exits 78 to match systemd's
`RestartPreventExitStatus`.

Capabilities are agent-owned, an 11-bit mask defaulting to terminal, exec, file and
docker all off, with host-local `grant <cap> --for 30m` and a 24-hour ceiling. The
agent deliberately ignores the server-advertised capabilities field.

Footprint: agent linux-amd64 13,772,672 bytes, arm64 11.89 MiB; server 52,857,832 bytes
with the React SPA embedded by `rust-embed`. Protocol version 6, JSON text frames,
`Welcome{server_id, report_interval}`, ACK by `msg_id`, 30-second heartbeat, 30-second
offline threshold, 1 MB message cap. Reconnect is 1 second doubling to a 30-second cap
with 20% jitter.

Licence consequence, stated plainly: AGPL-3.0-or-later. Fork and modify is free for
private use. Offering the dashboard to anyone else triggers section 13's source-offer
obligation over the whole modified work. A clean-room reimplementation is cheap because
the shared surface is serde data definitions, not logic.

Gaps: no tunnel, no broker, no container creation, no CI, no storage. Those four are
the net-new work.

Two claims in its README do not survive counting: it says 3,800-plus automated tests
and above 91% coverage, while a count found 3,478 Rust test attributes, and it still
says the project is at v1.0.0-alpha.12 while the workspace and newest release are
1.0.0-beta.6.

Full read: `research/E4-serverbee.md`.

### 2.3 `timhartmann7/omnyssh` - the crate split and the poll discipline

Rust SSH client and server manager, desktop GUI plus terminal TUI, Apache-2.0, 1,247
stars, 37 open issues, pushed and released v1.1.5 on 2026-10-09 **[me]**.

It is a pure client: no server, no daemon, no headless mode. No axum, actix, poem,
tide or warp in the 725-package lockfile, no HTTP listener, and `omny`'s CLI has three
flags and no subcommands. It cannot be driven by an external control plane; its only
API surface is Tauri 2 IPC.

Three transferable things:

- **The crate split.** `omnyssh-core` is frontend-agnostic, published to crates.io at
  1.1.5 with zero UI dependencies, with two thin frontends on top. That is the shape
  for one agent core with thin faces.
- **The measured size argument.** The TUI binary is 4.3 to 5.1 MB compressed across
  five release targets; the desktop AppImage is 85 MB. The weight is the GUI toolchain,
  not the engine.
- **Backoff that only success-with-data resets.** 30, 60, 120, 300 seconds, reset by a
  cycle that produced data rather than by a successful connection, and a manual refresh
  cannot cut a backoff short.

Also: `MonitorMode::{Ssh, TcpPort}` on one `Host` object, accepting `tcp`, `tcpPort`
and `tcp_port` aliases so two backends spelling a field differently both parse. That is
requirement R1 in miniature.

Do not copy two things: `Host.password` is serialised in plaintext to `hosts.toml`
(open issues #100 and #149), and issue #90 documents `meadtrue7477/omnyssh` as a
malware clone forging merge commits in the maintainer's name, so pin a commit SHA
rather than a tag.

Full read: `research/E3-omnyssh.md`.

### 2.4 `metalbear-co/mirrord` - portability mechanism and the connect-info shape

Run any local process as if it were a pod in a Kubernetes cluster, with real env vars,
DNS, network and traffic. Rust, MIT, 5,390 stars, 223 forks, 23 open issues, pushed
2026-10-29, last release 3.281.0 on 2026-10-28. Alive, releasing roughly every two
days **[me]**.

The most reusable decision is `AgentConnectInfo`, with five variants
(`ExternalProxy`, `Operator`, `DirectKubernetes`, `SessionsManager`,
`OperatorSessionsManager`) and one code path downstream. Copy this shape for Cloudflare
Tunnel against WireGuard against direct.

The portability mechanism, which is the answer to R1 at the process level: the layer
asks the agent for the target's environment, remote wins, local-only survives, and a
hardcoded exclusion list of about 45 names (`PATH`, `HOME`, `GOPATH`, `GEM_HOME`,
`JAVA_HOME`, `TMPDIR` and the rest) stops the host leaking in.

Wire format: 4-byte big-endian u32 length prefix plus bincode 2. `ClientMessage` has 17
variants, `DaemonMessage` 15. The protocol crate is versioned independently of the
workspace, with a CI rule failing an unbumped change.

The sessions-manager protocol is a broker shape worth studying: SSE assignments at
`{base}/v1/env/{env}/service/{svc}/assignments`, pairing by slugified environment and
service, per-assignment credentials, and a WebSocket data-plane upgrade on the same
origin. The server side is not in the repository and no public repository for it
exists.

Counter-evidence for R2: the CLI is 106,792,688 bytes unstripped on Linux x86_64, and
nothing is published to crates.io. Adopt the component split, not the binary.

Hard limits: the agent is Linux-only, and the layer cannot work on statically linked
binaries.

Full read: `research/E5-mirrord.md`.

### 2.5 `Pouzor/homelable` - the data model, and the missing agent

Self-hosted homelab infrastructure visualiser with live status monitoring. MIT,
TypeScript, 4,785 stars, 216 forks, 34 open issues, v3.6.0 on 2026-10-06, pushed
2026-10-28 **[me]**.

**There is no agent.** Three processes (FastAPI backend, nginx-served Vite SPA,
optional MCP proxy), one SQLite file, entirely pull-only. Discovery is LAN-scoped:
`/proc/net/arp`, nmap via `python-nmap`, mDNS via `zeroconf`, and it needs
`CAP_NET_RAW`.

**Issue #465, open since 2026-09-10 with zero comments, is the operator's exact
requirement from the other side:** several network segments, containers behind a
reverse proxy invisible to the scanner, and a requested "simple, lightweight agent"
that reports back to a central host. Nobody has built it.

Footprint: three containers totalling 211,744,248 bytes compressed (about 202 MiB) on
`python:3.13-slim` plus nmap, 129,571 lines of source.

The reusable asset is the data model: `device_inventory` owns what a device *is*,
`nodes` owns only how one canvas draws it, and `status` (lifecycle) is deliberately
separate from `status_live` (reachability). The API is headless-drivable today, 19
routers under `/api/v1` with generated OpenAPI and three credential paths.

Two security facts that block naive exposure: `/docs`, `/redoc` and `/openapi.json` are
unauthenticated, and there is no rate limiting on login. The project's own doc says it
is "meant for a LAN. Do not expose it to the internet."

The SPA cannot be pointed at another origin: `API_BASE_URL` is always root-relative and
there is no `VITE_API_URL`. Under the `reference/wrangler.toml` shape this is a feature,
because the Worker is already the same-origin proxy.

Verdict: refuted as a data-plane agent, refuted as a dashboard fork, confirmed as a
schema and merge-logic reference.

Full read: `research/E1-homelable.md`.

### 2.6 `crocofied/CoreObs` - the "before" picture

Dashboard to manage server infrastructure. MIT, TypeScript plus a Go 1.19 agent, 1,296
stars, 37 forks, 0 open issues, pushed 2026-02-13, last release v1.0.1 on 2025-04-30
**[me]**.

Dormant, not dead. The shipped product is frozen since 2025-05-17; the only 2026 work
is an unreleased incomplete backend rewrite on `main` (Bun plus Elysia plus Prisma 7,
"Register 2/3", no frontend, no agent). Usable code is the `corecontrol` branch or the
v1.0.1 tag.

Architecture is shared-database: Next.js web and a Go agent both point at the same
Postgres 17, with no API contract between them, only the schema. The "agent" is a
single central poller that scrapes every host on 5-second and 10-second tickers and
never dials out. Per-host metrics are delegated to Glances, a Python container on port
61208, and the docs require the poller to have direct inbound reachability to each
host. That is a heavy per-host dependency, the opposite of requirement R2.

The data API is effectively unauthenticated: no `middleware.ts` exists, and
`/api/servers/monitoring` and `/api/servers/get` read Prisma with no token check.
Exposing it to a Workers SPA as-is leaks the whole inventory.

Reusable: the small server, application and history schema, the self-referential
`server.hostServer` virtualisation relation, and the derived React Flow network graph
computed on read rather than stored. Safe to vendor from `corecontrol` or v1.0.1; pin
the code and never track `main`.

Full read: `research/E2-coreobs.md`.

## 3. Orchestrators

From `research/B3-orchestrators.md`. "CP off-cluster" is the verdict on running the
orchestrator's control plane on a separate machine reachable only over a tunnel.

| | Nomad 2.1.0 | k3s v1.37.1 | k0s v1.37.1 | Swarm 29.9 | Rancher 2.15 | Talos 1.14 | MicroK8s 1.36 |
|---|---|---|---|---|---|---|---|
| Licence | BUSL 1.1, IBM | Apache-2.0 | Apache-2.0 | Apache-2.0 | Apache-2.0 | MPL-2.0 | Apache-2.0 |
| Stars / open issues | 17057 / 1626 **[me]** | 34274 / 86 | 6556 / 271 | 72225 / 3956 | 26020 / 3411 | 11429 / 302 | 9377 / 158 |
| Latest stable | 2026-10-28 | 2026-09-30 | 2026-10-27 | 2026-10-20 | 2026-09-23 | 2026-10-26 | 2026-05-25 |
| Primary API | REST `/v1/*` on 4646, Go client, ndjson event stream | Kubernetes API on 6443 | Kubernetes API on 6443 | Docker Engine REST on unix socket or TCP+TLS | Rancher REST plus auth proxy impersonation | single declarative gRPC API on 50000 | Kubernetes API |
| Documented footprint | server 2-4 core / 8-16 GB / 50 GB | server w/ workload 1596-1606 MB, agent 275 MB | not published | 216 MB idle, 2023 test | Small tier 4 vCPU / 16 GB per node, 3+ nodes | not published | 540 MB floor |
| CP off-cluster | poor, sub-10 ms inter-server requirement | workable with `--tls-san` | workable, natural split | workable for managers | already the design | blocked, gRPC plus mTLS needs a raw TCP LB | poor, snapd |

**Nomad is not open source.** BUSL 1.1, licensor IBM, additional use grant permits
production use only if not competing with IBM's paid version [B3 F2]. The GitHub API
returns `NOASSERTION` for the licence field **[me]**, which is consistent.

**Cloudflare Tunnel does not support gRPC on a public hostname**, and an open
cloudflared issue shows gRPC bodies and trailers stripped even with `http2Origin`
[B3 F57, B6 F13]. This removes Talos from the control-plane role.

CVE-2026-14373, CVSS 7.7, CWE-862: the Nomad Docker driver ignores `allow_privileged`
when a job sets host namespace modes, so any authenticated job submitter reaches the
host namespace. Fixed in CE 2.0.4 [B3 F9].

## 4. PaaS and fleet management

From `research/B2-selfhosted-paas.md`.

| Tool | Stars | Licence | Lang | Last release | Multi-host model | API to drive it | Tunnel-friendly |
|---|---|---|---|---|---|---|---|
| Coolify | 65237 **[me]** | Apache-2.0 | PHP | v4.5.3 (2026-10-28) | SSH-managed deployment plus build servers | REST `/api/v1`, Sanctum scoped tokens, IP allowlist | High |
| Dokploy | 38109 | Apache-2.0 core plus DSAL proprietary | TS | v0.30.10 | Docker Swarm | tRPC plus OpenAPI plus CLI | Low, Swarm overlay |
| CapRover | 15195 | Apache-2.0 plus appendix | TS | v1.15.5 | Docker Swarm | Express REST plus CLI plus Node SDK | Low |
| Dokku | 32208 | MIT | Go | v0.38.32 | none, single host | CLI over SSH, no first-party REST found | High per host |
| LevelRail | 122 | Apache-2.0 | Go | v0.8.6 | reverse-dialed mTLS agents, beta | REST scoped tokens plus CLI plus MCP, 240+ tools | Highest |
| Kubero | 4455 | GPL-3.0 | TS | not fetched | Kubernetes | API plus CLI | Depends |
| Canine | 2940 | Apache-2.0 | Ruby | none, 0 releases | Kubernetes | web UI plus git push | Depends |

Coolify's decisive property is the SSH model rather than any feature: an SSH session
runs over a cloudflared access tunnel, whereas Swarm clustering needs node-to-node
2377, 7946 and 4789 [B2 3.1].

Licence notes: Dokploy's `/proprietary` features may only be used in production under a
paid commercial agreement, and CapRover's appendix restricts modifying and
redistributing paid features. Coolify, Dokku, LevelRail and Canine are the least
encumbered [B2 3.8].

"Porthos" as a self-hosted PaaS does not exist in any discoverable form. The only
Porthos repository is an unrelated 2017 embedded-Linux robot [B2 F7].

## 5. Remote access and tunnels

From `research/B4-remote-access-tunnels.md`.

| Use case | Best self-hosted answer | Best Cloudflare-native answer |
|---|---|---|
| Browser terminal into a box | ttyd behind a Tunnel; or lift `fosrl/newt/browsergateway/ssh.go` | Tunnel public hostname plus Access, terminal UI in the SPA, Worker WebSocket proxy in front |
| Private service reachable only from a Worker | none of the self-hosted overlays are the right shape; a Worker has no TUN device | **Workers VPC**: http or tcp VPC Service bound to a Tunnel, `fetch()`, `remote: true` |
| SSH without exposing port 22 | ShellHub v0.28.0, Apache-2.0, agent dials out, session log; or headscale v0.29.6, BSD-3, 45164 stars | **Access for Infrastructure**: protocol-agnostic targets, REST API, Terraform resource |

Excluded, with reasons:

- **rathole**: no programmatic API, its README says the HTTP API is WIP, last SemVer
  v0.5.0 on 2023-10-01 [B4 3.5].
- **gotty**: last commit 2017-12-13. **boringproxy**: last release v0.10.0 on
  2023-01-04. **reverst**: no formal releases [B4 3.5].
- **Firezone**: the Elixir control plane is Elastic License 2.0, not open source, and
  the README states production self-hosting is not officially supported [B4 3].
- **fosrl/cli**: not open source. Files with a Fossorial Commercial License header are
  proprietary and unauthorised use, copying, modification or distribution is strictly
  prohibited. `fosrl/newt` and `fosrl/gerbil` are unambiguous AGPL-3.0 [B4 3.4].
- **zrok**: self-hosting needs OpenZiti plus PostgreSQL plus RabbitMQ plus InfluxDB
  [B4 2.4].
- **frp**: 110283 stars, Apache-2.0, v0.71.1, the fallback if you must self-host. Its
  writable surface is `frpc`'s `/api/store/proxies` CRUD; `frps` is read-mostly.
  CVE-2026-40910 is a routing and access-control split auth bypass affecting 0.43.0 to
  0.68.0 [B4 2.3, C1 1.19].

**Pangolin** is the self-hosted project to study rather than adopt: 23263 stars, and
the only one combining a WireGuard overlay, an identity-aware reverse proxy, a browser
terminal and browser RDP and VNC, and a permissioned REST API with an OpenAPI document
[B4 3.3].

## 6. Storage

From `research/B5-storage.md`.

| | SeaweedFS | Garage | Ceph RGW | RustFS | Versity GW | Zenko |
|---|---|---|---|---|---|---|
| S3-compatible | yes | yes | yes | yes | yes | yes |
| Licence | Apache-2.0 | AGPL-3.0 | LGPL-2.1 / LGPL-3 | Apache-2.0 | Apache-2.0 | Apache-2.0 |
| Smallest setup | 1 node | 3 nodes | about 3 nodes | 1 node | 1 node | k8s plus MongoDB plus Redis |
| Object Lock | yes | no | yes | yes | yes | n/a |
| Versioning | yes | no | yes | yes | yes | n/a |
| Idle memory, measured | 247 MB, 3 containers | about 90 MB cgroup | 170-260 MiB per RGW daemon | not measured | not measured | not measured |
| Stars | 35799 **[me]** | 4784 | 17178 | 35526 | 3079 | 672 |
| Latest release | 4.51 (2026-10-25) | v2.5.0 (2026-10-23) | v22.0.0 (2026-10-28) | 1.0.4 (2026-10-25) | v1.10.0 (2026-10-22) | 2.16.0 (2026-10-22) |
| Verdict | primary candidate | blocked on licence | too heavy | avoid for now | niche | not a storage cluster |

**MinIO is dead.** The repository returns `archived: true`, its README says it is no
longer maintained, and the licence moved to AGPL-3.0 on 2021-04-18. The successor
AIStor Free is proprietary and needs a license key [B5 R1].

**RustFS must be avoided despite being Apache-2.0 and past 1.0.** Eight advisories
published in one batch on 2026-10-18, including an Object Lock COMPLIANCE bypass where
force-deleting a bucket destroys retained objects, and an S3 policy bypass over its
WebDAV, FTP and SFTP listeners, plus a critical path traversal and a hardcoded
privileged token before Alpha.78 [B5 R1].

**Garage is the best architectural fit and AGPL-3.0 blocks it.** 1 GB RAM, any x86_64
from the last decade, CRDT metadata with no consensus bottleneck, tolerance for nodes
that change IP, a published OpenAPI admin API v2. But no versioning, no Object Lock,
eventually consistent, and conditional PUT deliberately unsupported [B5 R3].

Cache and metadata layer:

| | Valkey | Dragonfly | KeyDB | Redict | rqlite | Litestream |
|---|---|---|---|---|---|---|
| Licence | BSD-3-Clause | BSL 1.1 | BSD-3-Clause | LGPL-3.0-only | MIT | Apache-2.0 |
| Stars | 27558 | 31831 | 12499 | 356 | 17881 | 14549 |
| Last release | 9.1.3 (2026-10-26) | v2.0.2 (2026-10-07) | v6.3.4 (2023-10-30) | not captured | not captured | not captured |
| Alive | yes | yes | no | no | yes | yes, beta |
| Usable in a commercial service | yes | no, the Additional Use Grant forbids it | yes | yes | yes | yes |

Dragonfly's BSL Additional Use Grant forbids making the work available as a service to
third parties, which is exactly the product being built [B5 R5].

## 7. CI systems

From `research/B6-ci-systems.md`. "On Workers" means: can the scheduling brain itself
run inside a Cloudflare Worker, with heavy execution on the operator's own metal.

| System | Control plane | Executor transport | Long jobs | Control-plane image | Licence | On Workers? |
|---|---|---|---|---|---|---|
| GitHub Actions self-hosted runner | GitHub SaaS | outbound HTTPS 443 long poll | 5 days per job | runner binary, small | MIT | No, but nothing to host |
| ARC | k8s you run | outbound HTTPS long poll | inherits runner limits | controller about 46 MB | Apache-2.0 | No |
| Woodpecker CI | self-hosted Go server, SQLite default | agent dials out over gRPC | default 60 min, max 120 min, configurable | server about 20 MB, agent about 16 MB | Apache-2.0 | No, server is stateful Go |
| Buildkite agent | Buildkite SaaS, no self-hosted option | agent polls outbound | no hard cap documented | agent about 304 MB | MIT | No |
| Concourse | self-hosted web node plus Postgres | worker SSH to TSA on 2222, ports forwarded back over SSH | no documented cap | web about 1.0 GB | Apache-2.0 | No |
| Argo Workflows | k8s | k8s pods | no cap | n/a | Apache-2.0 | No |
| Tekton | k8s | k8s pods | no cap | n/a | Apache-2.0 | No |
| Dagger | none required | local engine | no cap | engine container | Apache-2.0 | Partly, engine is host-local |
| Gitea Actions | a Gitea instance | runner registers | Gitea-configured | Gitea instance | MIT | No |
| Jenkins | self-hosted Java 21+ controller | agent over SSH inbound or WebSocket outbound | no cap | about 242 MB, 4 GB+ RAM | MIT | No |
| Earthly | none, build framework | local daemon | no cap | host daemon | MPL-2.0 | upstream unmaintained since 2025-07-16 |
| Cirrus CI | shut down 2026-06-01 | n/a | n/a | n/a | archived | dead |
| cloudflare/ci | Cloudflare Workers plus Workflows plus Sandbox | runs on Cloudflare | Workflows-step bounded | npm package, no server | Apache-2.0 | Yes by construction, wrong direction |

Image sizes are Docker Hub `full_size`, which sums layers across every platform in a
multi-arch manifest list. They overstate a single-architecture pull but are comparable
against each other [B6 2].

## 8. Dashboards and the Workers SPA stack

From `research/B7-dashboards-spas.md`.

| Tool | Stars | Licence | Real drivable API? | Reuse verdict |
|---|---|---|---|---|
| Portainer | 38744 | Zlib | Yes, full REST plus agent | Turnkey Docker and K8s UI plus API |
| Komodo | 12829 | GPL-3.0 | Yes, API-first, typed SDK, TF providers | Best fit for the control and data-plane split |
| nginx-proxy-manager | 34574 | MIT | Yes, REST plus API tokens since v2.16.0 | API-driven ingress and TLS |
| Caddy | 78533 | Apache-2.0 | Yes, admin API on localhost, unauthenticated | Zero-config TLS, secure the API first |
| Traefik | 65403 | MIT | No, introspection only, config via providers | Only if label-driven and you write config files |
| Dockge | 24706 | MIT | No, UI over Docker socket | Harvest the web terminal and multi-agent ideas only |
| Uptime Kuma | 93051 | MIT | Partial, socket.io and metrics | Health and status |
| Homepage | 33433 | GPL-3.0 | No, config-as-code | Status and launch page |
| Dashy | 26858 | MIT | No, JSON config | Status and launch page |
| Yacht | 60 | MIT | Had REST v1, dormant | Skip |
| CasaOS | 37393 | Apache-2.0 | No, home app-store UI | Skip |

The SPA stack: Hono v4.13.14 (32741 stars, MIT) as the edge API layer, Vite and
`@cloudflare/vite-plugin` as the build target, React plus Vite for the richest
Cloudflare tooling, TanStack Start for one type-safe full-stack framework, Astro v7.4.4
for read-heavy dashboards since it is now a Cloudflare project, OpenNext only if
Next.js RSC is required [B7 3].

## 9. Prior art for "control plane on Workers, data plane on own metal"

From `research/B8-prior-art-control-plane.md`.

| Project | Control plane | Data plane | Licence | Stars | Reusable? |
|---|---|---|---|---|---|
| `gofixpoint/amika` (open half) | closed gateway, relay is a DO per host | `amika-hostd` daemon, smolvm VMs | Apache-2.0 | 295 **[me]** | Highest. See section 10 |
| `harshalgajjar/Reminal` | Worker plus 3 Durable Objects, free tier | Go agent, WebRTC DataChannel for media | AGPL-3.0 | 323 | High for the relay design, copyleft is a constraint |
| `ChrispyBacon-dev/DockFlare` v3 | your own Docker host plus Redis | `dockflare-agent` per Docker host | GPL-3.0 | 2493 | High as an architecture reference |
| `context-labs/cloudflared-operator` | Kubernetes control plane | cloudflared Deployment, 2 replicas | MIT | 59 | High if the data plane is k8s, very young |
| `stwins60/tunnelflow` | your own host, Next.js plus Prisma | manages cloudflared | MIT | 4 | Medium, right shape, unproven |
| `okou-ai/okou` issue #2801 | a commercial backend | user's machine running cloudflared | n/a | 1162 | High as a published design doc |
| `denoland/celld` | your own hardware | your own hardware | Apache-2.0 | 6170 **[me]** | Exit route, not a component |

Two findings worth the price of the file:

**amika registers its keep-alive with Cloudflare's `setWebSocketAutoResponse`** so an
idle host costs nothing and the relay is not billed a message for it. A plain WebSocket
ping frame cannot be auto-answered by the runtime, but a text message pair can
[B8 3.3].

**The two-token model from okou issue #2801**: a tunnel token scoped to one tunnel and
handed to the box once, versus a per-bridge Access service token held only server-side
with a 2 hour TTL and rotated. Do not conflate them, and do not let a box see the
second one [B8 3.7].

## 10. `gofixpoint/amika`

"Multiplayer cloud workstations for coding agents and humans". Apache-2.0, TypeScript
with Go near-equal by bytes, 295 stars, 26 forks, 45 open issues, created 2026-02-05,
pushed 2026-10-28, about 1472 commits, about 7 contributors, status beta **[me]**.

A parts bin and a reference implementation, not a control plane you can adopt. Its
control plane, relay, UI and gateway are all closed.

| Component | Open? | Worth lifting? |
|---|---|---|
| `amika-hostd` (Hono, BYOC daemon) | Yes | Yes, core data-plane runner reference. Needs KVM, not just Docker. Documents a Cloudflare Tunnel listen mode with `register-url`, and warns that browsers cannot open host previews in that mode because a preview login needs the host's own https origin |
| `@amika/service-auth` | Yes | **Yes, highest value.** Control plane signs credentials, a gateway verifies them with the same host secret key, so neither calls the other. Web Crypto and Fetch only, so it runs wherever the control plane does, including a Worker |
| `@amika/tunnel-protocol` (`amika.tunnel.v2`) | Yes | **Yes, highest value.** Explicitly written to run in a Cloudflare Worker with no Buffer and no `node:` import. 9 frame types, 5-byte header, 256 KiB initial window, 64 KiB max data frame, 256 concurrent streams, 426 on subprotocol mismatch |
| `amikad` (Go, in-VM daemon) | Yes | Yes, as a data-plane agent pattern |
| `@amika/sandbox` (provider layer) | Yes | Yes, the orchestrator adapter pattern. Adding a provider is one folder |
| `@amika/sdk` | Yes | **No.** Requires an Amika account and API key |
| `amika-control-plane`, `amika-relay`, `amika-ui` | **No** | No. Reimplement the relay against the open codec |
| `amika-gateway`, `sandbox-provisioner` | **No, "soon"** | Watch. The self-hosted gateway is documented as single-player with no multi-user IAM |

The three-secret model is the hardest-won lesson: the user API key, the inbound daemon
secret key, and an outbound attachment credential in the `x-amika-host-credential`
header are three different permissions and must not share a value. Plus the invariants:
every route requires a credential compared in constant time; the caller credential is
never forwarded to the VM runtime; **hostd opens no streams**, so a compromised host
cannot become a forward proxy; secrets are handed to the daemon over IPC so they never
appear in the process environment; config and secret files are written atomically at
mode 0600.

Budget the renewal problem up front: a bearer string survives re-presentation on lease
renewal, a timestamp-bound assertion does not, so a keypair model requires a
gateway-side change first [B8 3.2].

Two documentation defects, recorded because they affect how much to trust the rest:
amika's own `docs/self-hosting.md` says the `--local` Docker mode was removed, while
amika's `docs/architecture/overview.md` still documents `go/internal/sandbox/docker.go` and an
`amika sandbox` command set; and `ROADMAP.md` lists an `amikactl` CLI that `go/cmd`
does not ship [B1 1.6].

## 11. Cloudflare's own API and SDK surface

From `research/B8-prior-art-control-plane.md`, cross-checked against `cloudflare-go`,
the `cloudflare` npm SDK and the Terraform provider.

| Need | Surface |
|---|---|
| Create, list, edit, delete a tunnel | `POST/GET/PATCH/DELETE /accounts/{id}/cfd_tunnel` |
| Get a connector token | `GET /accounts/{id}/cfd_tunnel/{tid}/token` |
| Remote tunnel configuration, ingress | `PUT .../cfd_tunnel/{tid}/configurations` |
| Inspect live connections | `GET .../cfd_tunnel/{tid}/connectors/{cid}/connections` |
| Register a private service for Workers | `POST /accounts/{id}/connectivity/directory/services` |
| Bind a Worker to it | `vpc_services` in wrangler config, `service_id` binding |
| Raw TCP out of a Worker | `connect()` on a VPC Network binding |
| Access app plus service token | `client.zeroTrust.access.applications`, `.serviceTokens` |
| Deploy the Worker | `wrangler deploy` |
| Manage all of it declaratively | `cloudflare/terraform-provider-cloudflare` v5, 1351 stars, Apache-2.0 |

Terraform rename: `cloudflare_tunnel` became
`cloudflare_zero_trust_tunnel_cloudflared` in v5 [B8 2].

## 12. Academic prior art

From `research/C5-academic-prior-art.md`. Five papers are recorded there as
metadata-only because ACM PDFs returned 502 twice through the reader; those are
labelled unverified in that file and I did not re-read them.

- Cold start is dominated by code and dependency loading, pod allocation and
  scheduling, not by the platform. FaaSLight cut code-load latency by up to 78.95% and
  total response by up to 42.05%, DOI 10.1145/3585007, TOSEM 2023 [verified].
- At production scale, from a Huawei trace of 85 billion requests and 11.9 million cold
  starts across 5 datacenters, cold start is up to 7 seconds or up to 3 seconds
  depending on region. Multi-region scheduling is the lever. DOI 10.1145/3689031.3696073
  [verified].
- Warm pools buy latency with idle cost: pre-warmed instances cut P99 response time by
  85% under Knative, Lin and Glikson, arXiv 1903.12221. Budget warm workers as a cost
  line [verified].
- OSDI'25 "Fork in the road": prior cold-start optimisations assume away large-scale
  and concurrency complexity and still leave cold start a bottleneck in production.
  Single-component fixes do not survive scale [verified].
- Cloud-edge placement is research-grade and now available to you: NEPTUNE does
  location-aware placement, anti-saturation, GPU and dynamic CPU, DOI 10.1145/3634750,
  ACM TAAS 19(1) 2024 [verified].
- The closest academic match to this design is UD-IaaS-FaaS scheduling, arXiv
  2610.15886, October 2026: heavy tasks on IaaS, fine-grained on FaaS, jointly
  optimising makespan, energy and cost [verified].
- Cost right-sizing is cheap: CPU-TAMS finds max-value FaaS memory within about 5% of
  brute force with one profiling run, Cordingly et al. 2022. Maps to sizing container
  CPU and memory requests to raise packing density [verified].
- **"Serverless is cheaper" is workload-dependent, not a law** (Spillner 2017, 156
  citations), and hybrid-edge resource orchestration with mixed SLOs is explicitly
  immature (Guim 2021, 101 citations) [verified].
- There is no peer-reviewed current Cloudflare-versus-one-Hetzner-box break-even in the
  literature. Any break-even in this repository is a labelled estimate
  [verified as an absence].

## 13. Corrections to the research set

Recorded so the spec does not inherit them.

- **Route limit.** `A5` quotes the account-limits page as 1,000 routes per account.
  `A1` and `B8` quote the same URL as 50,000, with the 2026-10-16 changelog saying
  "up from 1,000". The correct figure is 50,000 [D1 1].
- **cloudflared release.** Six files say 2026.10.5. The current release is 2026.10.6,
  published 2026-10-29T12:18:25Z **[me]**. Six of the seven files naming a version are
  morning snapshots [D1 D10].
- **Enterprise upload limit.** `B5` says 500 MB. That appears to be the CDN cache
  figure from the same page `A6` read, which correctly separates 100 MB on Free and
  Pro, 200 MB on Business and up to 5 GB on Enterprise [D1 D9].
- **Bandwidth sentences.** `A6` says 10 TB/month is "about 4 Mbps", which is a unit
  slip for about 4 MB/s; it is 30.4 Mbps. `C6` says 20 TB/month is "about 0.5 Mbps";
  it is 60.9 Mbps. Both reach the right conclusion from a wrong rate [D1 D18].
- **Per-vCPU ratio.** The 4.5x figure divides a 6-core 12-thread box by 6. Dividing by
  12 gives 2.25x. Neither is a measurement of work per second [D1 D19].
- **One always-on Durable Object.** Use $4.20, from Cloudflare's own 128 MB / 1 GB =
  0.128, not $4.11, which implies 0.125. And note the paid allocation is 400,000 GB-s
  per month while one always-on object consumes 336,384 GB-s, so the first one is
  inside the included allocation and the marginal rate applies from roughly the second
  onward [D1 D5, derived by me].
- **celld.** `B8`'s inventory of the self-hosted Workers field omits celld, which `A4`
  read the same day at 6,170 stars. Those two files disagree on whether this category
  is a component or an exit route [D1 D13].
- **Workers VPC pricing.** `A5` and `A6` both read an explicit "free during the open
  beta period" sentence on the pricing page. My read at 2026-10-29 13:18 UTC returned
  a 33-word page reading only "Workers VPC requires a Workers plan. See Workers
  pricing for current rates", with the reader reporting low confidence and no
  extraction. Treat VPC pricing as unverified and design the transport as swappable.
