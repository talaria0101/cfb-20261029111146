# SPEC

Amended 2026-10-29. Supersedes the first version in place.

## 1. Requirements

| # | Requirement | Source |
|---|---|---|
| R1 | Application code runs on Cloudflare or on the self-hosted backend with as little custom change as possible | operator, this round |
| R2 | One small agent binary per server, acting as tunnel connector, orchestrator interface and broker, instead of several heavy binaries | operator, this round |
| R3 | The dashboard SPA is hosted on Cloudflare Workers and managed from there | original brief |
| R4 | Data plane (CI, long-running containers, storage) runs on the operator's own machines | original brief |
| R5 | The orchestration layer is not Cloudflare | original brief |

R1 and R2 are the load-bearing ones. Sections 2 and 4 exist to satisfy them; the rest
of the document is downstream.

## 2. The portable contract

The requirement is that code written once can be swapped between Cloudflare and the
self-hosted backend. That is only true if the code is written against an interface
both implement identically. Four primitives are enough, and all four exist natively on
both sides.

| Primitive | On Cloudflare | On cfb-node | Why it ports |
|---|---|---|---|
| `fetch` | Workers `fetch` | `reqwest` / `hyper` | Web standard, identical signature |
| Object storage | R2, via the S3 API | SeaweedFS or Garage, via the S3 API | R2 is S3-compatible [A6 1.1, verified by me]. SeaweedFS is S3-compatible [B5 2]. Write S3, never R2 bindings |
| SQL | D1 (SQLite) | SQLite or Postgres on the box | Write portable SQL. No D1-specific functions |
| Queue | Queues HTTP pull consumer | the same pull and ack shape, served locally | The pull endpoint is a plain HTTPS POST with a token [A4 2.2]. Any broker can implement it |

Two rules follow, and they are the whole of R1:

**Rule P1. Application code never imports a Cloudflare binding.** `R2Bucket`,
`D1Database`, `Queue` and `DurableObjectNamespace` types do not appear outside one
adapter file per platform. The adapter is selected at build or deploy time, not at
runtime by feature detection.

**Rule P2. Anything that cannot be expressed in those four primitives is a
deliberate, named exception, recorded with the reason.** Cloudflare Durable Objects
are the only one this design accepts, for Tier 1 coordination only, and section 5.2
explains the fallback.

### 2.1 The shape

```rust
// One trait set, two implementations. Application code depends only on this.
pub trait ObjectStore {
    async fn get(&self, key: &str) -> Result<Bytes>;
    async fn put(&self, key: &str, body: Bytes) -> Result<()>;
    async fn delete(&self, key: &str) -> Result<()>;
    async fn list(&self, prefix: &str) -> Result<Vec<String>>;
}

pub trait SqlDatabase {
    async fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>>;
    async fn exec(&self, sql: &str, params: &[Value]) -> Result<u64>;
}

pub trait JobQueue {
    async fn pull(&self, batch: usize, visibility_ms: u64) -> Result<Vec<Lease>>;
    async fn ack(&self, lease: &Lease) -> Result<()>;
    async fn publish(&self, body: &[u8]) -> Result<()>;   // 128 KB cap
}
```

`impl ObjectStore for R2Bucket` is a thin wrapper over the S3 API. `impl ObjectStore
for SeaweedFs` is the same code against a different endpoint. The application sees one
type.

The S3 choice is the load-bearing decision, and it is a decision rather than an
accident: R2 speaks S3 [A6, verified by me against the pricing and API pages], so
targeting S3 costs nothing on Cloudflare and buys the self-hosted backend for free.

### 2.2 Process-level portability, borrowed from mirrord

For a process that must behave the same on both sides, mirrord's environment
resolution is the mechanism to copy [E5 1.7]: the remote environment wins, a
local-only variable survives, and a hardcoded exclusion list of about 45 names
(`PATH`, `HOME`, `TMPDIR`, `GOPATH`, `GEM_HOME`, `JAVA_HOME` and the rest) stops the
host leaking into the target. mirrord is MIT and at 3.281.0, pushed 2026-10-29
[E5 1.1, 1.2, verified by me].

The transferable rule: an environment variable set by the platform overrides the same
name from the host, except for the exclusion list, which the host always wins. That
single rule is what makes "same binary, two platforms" work for configuration.

### 2.3 What does not port, stated plainly

- **Durable Objects.** Single-writer keyed state with alarms. The self-hosted
  equivalent is `celld` [A4 2.1] or rqlite [B5 R6], and neither is production-proven
  at the same level. Tier 1 coordination stays on Cloudflare; Tier 2 state does not
  use DOs at all (section 5.2).
- **Workers runtime APIs.** `workerd` runs Workers code unchanged but implements a
  subset of Node, with unsupported APIs importing fine and throwing at call time
  [A3 2.7]. Code that depends on the subset ports; code that depends on Node does
  not. Validate the dependency tree against the Node-compat table before assuming
  portability.
- **Cloudflare Containers.** A container is reachable only through the Durable Object
  bound to it, and the DO-to-container hop is Cloudflare-internal. There is no BYOC
  and no node agent [A2 R1]. Containers do not port to own metal and own-metal
  containers do not port to Cloudflare. Treat them as a separate, optional product.
- **Browser Rendering.** Metered at $2.00 per browser above 10, averaged monthly from
  daily peaks, hard-capped at 200 [A2 R10].

## 3. Topology

```
  BROWSER
     |
     v
  +-------------------------------+     +----------------------------------+
  | CLOUDFLARE EDGE               |     | YOUR MACHINES                    |
  | DNS, CDN, WAF, DDoS, TLS      |     |                                  |
  +---------------+---------------+     |  +----------------------------+  |
                  |                     |  | cfb-node (one per box)     |  |
                  v                     |  |  transport  edge  vnet      |  |
  +---------------------------+         |  |  enroll       broker       |  |
  | SPA static assets         |         |  |  orchestrator interface     |  |
  | + Hono API in a Worker    |         |  +-------------+--------------+  |
  +------------+--------------         |                |                 |
               |                        |   +------------+------------+    |
               | vpc_services           |   |            |            |    |
               | fetch() / connect()    |   v            v            v    |
               v                        | Nomad/k3s   Docker     SeaweedFS |
  +------------------------+            | CI runners  microVM     Valkey   |
  | Durable Objects        |            |                            |     |
  | (Tier 1 only)          |            +----------------------------+     |
  +------------------------+                                            |
  +------------------------+            private L3 between your own      |
  | Queues (pull)          |            machines: WireGuard overlay,     |
  +------------------------+            NOT through Cloudflare           |
  +------------------------+                                            |
  | R2 (S3 API)            |            +----------------------------+   |
  +------------------------+            | OUT-OF-BAND, not Cloudflare|   |
                                       | WireGuard door + power API |   |
                                       +----------------------------+   |
  ONE TUNNEL PER MACHINE, cfb-node dials out on 7844. No public IP, no inbound
  firewall rule, no DNS record pointing at any box.
```

## 4. cfb-node: one binary per server

### 4.1 Why one binary, and what the evidence says

The per-server stack this replaces is four processes: `cloudflared`, an orchestrator
agent, a monitoring or management daemon, and on some designs a Python metrics
collector such as Glances [E2 1.5]. Collapsing them is the correct instinct, and the
size target is reachable.

Measured, from the repos read this round:

| Project | Binary | Size | Note |
|---|---|---|---|
| `timhartmann7/omnyssh` | TUI `omny` | 4.3 to 5.1 MB compressed across five targets | desktop AppImage is 85 MB; the weight is the GUI toolchain, not the engine [E3 1.4] |
| `ZingerLittleBee/ServerBee` | agent, linux-amd64 | 13,772,672 bytes (13.13 MiB) | arm64 11.89 MiB. Server is 50.41 MiB with the React SPA embedded [E4 1.7] |
| `metalbear-co/mirrord` | CLI, linux x86_64 | 106,792,688 bytes unstripped | the counter-example: one binary, and it is 107 MB [E5 1.9] |
| `talaria0101/cfrs` | no artifact | 0 releases, 0 tags, `cargo install --path .` | "426 KB" is GitHub's repository-size field, not a binary [E6 1.5] |

So one binary is achievable at roughly 15 MB if the GUI stays off the box. The bloat
is not the number of binaries; it is feature surface and GUI toolchains. Keep the
agent headless and put every UI in the Workers SPA.

### 4.2 Composition, with what each source contributes

| Module | Source | State | What it gives |
|---|---|---|---|
| `transport` | cfrs `src/transport/mod.rs` | complete, 332 tests | one `Transport` trait with `Direct`, `HttpConnect`, `SshRelay`, `WebSocket` behind a byte-pipe seam. This is what makes the agent work in a sandbox, behind a proxy, or on bare metal without the rest learning which [E6 1.10] |
| `edge` | cfrs `src/cloudflare/` | codec complete, **never driven** | QUIC (ALPN `argotunnel`, SNI `quic.cftunnel.com`) and HTTP/2 (SNI `h2.cftunnel.com`, no ALPN), 6-byte preamble, control-stream header, base64-no-padding header codec diffed against cloudflared's Go serialiser by a committed oracle [E6 1.4] |
| `vnet` | cfrs `src/vnet/` + `shim/cfrsnet.c` | complete, feature-gated | `LD_PRELOAD` AF_INET to AF_UNIX, a `smoltcp` stack owning `10.66.0.0/24`, virtual DNS, connect-time ACLs, SOCKS5 and HTTP CONNECT front door, pcap record and replay [E6 1.6] |
| `enroll` | ServerBee `crates/agent` | complete, AGPL-3.0 | outbound-only agent, single-use server-bound offer, argon2-hashed run token, agent-owned capability mask [E4 1.2, 1.5, 1.6] |
| `protocol` | ServerBee `crates/common/src/protocol.rs` + mirrord's versioning | shape reusable | length-prefixed frames, a version constant, and a CI rule that fails an unbumped protocol change [E5 1.6] |
| `connect info` | mirrord `AgentConnectInfo` | design pattern | five variants, one code path downstream. Copy for Tunnel / WireGuard / direct [E5 1.5] |
| `broker` | cfrs `Tunnel::resolve` + `Origin` | HTTP done, TCP net-new | ingress routing to local services. Extend to raw TCP |
| `orchestrator` | net-new | not started | a driver trait with Nomad, k3s and Docker implementations |

### 4.3 The honest gap, stated before the plan

**cfrs cannot replace cloudflared today.** I read the source myself.
`cmd_tunnel` discovers the edge, provisions a quick tunnel, prints the URL and
returns. `src/tunnel/mod.rs` states it in its own module documentation:
registration and visitor serving are not implemented, so a `Tunnel` is not yet a
running Cloudflare tunnel. The QUIC and HTTP/2 codecs exist and are precisely built,
but none of it has reached the real edge [E6 1.1, 1.4].

`cfrs serve` produces a working public URL only by SSH remote-forwarding to
`free.pinggy.io:443`, a third-party free relay that can read the traffic [E6 1.2].
That is not acceptable for a management plane.

So the plan is staged, and stage one keeps `cloudflared`:

| Stage | Edge connector | Condition to advance |
|---|---|---|
| 1 | `cloudflared`, supervised by cfb-node as a child process | default. Free, supported, no risk |
| 2 | cfrs registration and visitor serving, behind a feature flag | the codec has carried real visitor traffic against the real edge, measured |
| 3 | cfrs default, cloudflared removed | stage 2 has run in production for a full rotation cycle |

The transport trait already makes stage 2 a drop-in: nothing above `transport` learns
which is in use. That is the point of the seam, and it is why building on cfrs rather
than around cloudflared is still the right call.

Dependency cost, recorded so it is not a surprise: cfrs has 21 direct dependencies and
298 in `Cargo.lock`, including `aws-lc-sys`, which needs cmake to build [E6 1.5]. Trim
that set before the 15 MB target is credible.

### 4.4 Enrollment and credentials, from ServerBee

ServerBee's model is the one to copy, with the licence consequence noted [E4 1.5,
1.10]:

1. The agent generates 32 random bytes and persists them to `agent.toml` **before**
   claiming anything, so a write failure cannot burn a single-use offer.
2. It claims a server-bound, short-lived offer and submits the bytes as
   `proposed_run_token`.
3. The server stores an argon2 hash and never returns the plaintext.
4. A 401 on the WebSocket upgrade triggers re-enrollment, capped at three attempts.
   A permanent auth failure exits 78, matching systemd's
   `RestartPreventExitStatus`.

Capabilities are owned by the agent, not the server: an 11-bit mask defaulting to
terminal, exec, file and docker all off, with host-local `grant <cap> --for 30m` and
a 24-hour ceiling. The agent deliberately ignores the server-advertised capabilities
field [E4 1.6]. That inversion is the correct one for a management plane.

Licence: ServerBee is AGPL-3.0-or-later. Forking and modifying is free for private
use. Offering the dashboard to anyone else triggers the section 13 source-offer
obligation over the whole modified work. A clean-room reimplementation is cheap here
because the shared surface is serde data definitions, not logic [E4 1.10].

### 4.5 The reconnect and poll discipline, from omnyssh

omnyssh is a desktop client with no server, no daemon and no headless mode, so it is
not a component [E3 1.1, 1.2]. Three things in it are worth lifting [E3 1.3, 1.7]:

- **The crate split.** `omnyssh-core` is frontend-agnostic, published to crates.io,
  with zero UI dependencies, and two thin frontends on top. That is the shape for one
  agent core with thin faces.
- **Backoff that only success-with-data resets.** 30, 60, 120, 300 seconds, reset by a
  cycle that produced data, not by a successful connection, and a manual refresh
  cannot cut a backoff short.
- **One resource, several bindings.** `MonitorMode::{Ssh, TcpPort}` on a single `Host`
  object, accepting `tcp`, `tcpPort` and `tcp_port` aliases so two backends spelling a
  field differently both parse. That is R1 in miniature.

Two things not to copy: `Host.password` is serialised in plaintext to `hosts.toml`
(open issues #100 and #149), and issue #90 documents a malware clone forging merge
commits in the maintainer's name, so pin a commit SHA rather than a tag [E3 1.9,
1.10].

### 4.6 The orchestrator interface

cfb-node does not run the orchestrator. It exposes one. A driver trait, three
implementations:

```rust
#[async_trait]
pub trait Orchestrator {
    async fn deploy(&self, spec: &Workload) -> Result<WorkloadId>;
    async fn status(&self, id: &WorkloadId) -> Result<WorkloadStatus>;
    async fn logs(&self, id: &WorkloadId, follow: bool) -> Result<LogStream>;
    async fn stop(&self, id: &WorkloadId) -> Result<()>;
    async fn events(&self, since: Seq) -> Result<EventStream>;   // resumable
}
```

Nomad is the reference implementation because its API already has all four: REST
under `/v1/`, `GET /v1/event/stream` as a resumable ndjson stream with per-topic
ACLs, and parameterized jobs whose dispatch mints a unique job ID per run [B3 2.3].
k3s and Docker are the other two.

One hard constraint on the driver: **no gRPC over a Tunnel public hostname.** Two
Cloudflare pages state tunnel gRPC works only via private subnet routing, and
Cloudflare Access ignores gRPC through the reverse proxy entirely [B6 F13]. Talos's
management API is therefore excluded as a control-plane channel [B3 3.5].

## 5. The Cloudflare side

### 5.1 The SPA and the API

`@cloudflare/vite-plugin` plus Workers Static Assets with SPA routing fallback,
targeting Workers directly [B7 R3]. Requests to static assets are free and unlimited,
and Cloudflare's own worked example prices a 15-million-request-per-month SPA at $5.00
total [A6, verified by me]. Do not enable Workers Caching in front of it: cache hits
bill at the full per-request rate including static assets [A6 2.5].

Hono as the API layer, v4.13.14, MIT, 32,741 stars [B7 2]. The SPA is a thin client.
Nothing on Cloudflare touches a Docker socket.

### 5.2 State, and why almost none of it is on Cloudflare

| State | Where | Reason |
|---|---|---|
| SPA bundle, session data, signed URLs | Cloudflare | genuinely stateless |
| WebSocket fan-out, rate limiters, the small index the SPA reads | Durable Objects, Tier 1, hibernation on | $20.65 per month with hibernation against $142.95 without, on Cloudflare's own worked examples [A6 1.6, verified by me] |
| Machine inventory, credentials, job history, orchestration state | Postgres on the operator's own box | a SQLite DO caps at 10 GB per object, fails writes with `SQLITE_FULL` at the cap while reads keep working, never relocates, and has no REST API for inspection or repair [A4 1.6, 1.7] |
| Artifacts, images, logs | R2 by the S3 API | free egress, and the same bucket can be the fleet bucket for `celld` [A4 2.5] |
| Job descriptors | Queues, then pulled by cfb-node | 128 KB message cap. Descriptors in the message, payloads in R2 [A4 2.2] |

### 5.3 The transport to the data plane

One remotely-managed tunnel per machine, `config_src: cloudflare`, because a
locally-managed tunnel's config lives in a YAML file on the box and is invisible to
the control plane [A1 2.1]. Reached from the Worker through `vpc_services` bindings,
which pin host and port in the service configuration and ignore both in the `fetch()`
URL, making SSRF structurally impossible on that path [A5, verified by me].

`cloudflared` dials out on TCP and UDP 7844 to `region1.v2.argotunnel.com` and
`region2.v2.argotunnel.com`. Port 443 is optional, and the docs state cloudflared runs
correctly without it [A1, verified by me]. One tunnel per machine, never one per job:
1,000 per account are free, then $4.50 per tunnel per month, and inactive tunnels
still count [A1, B8].

Stage 2 of section 4.3 replaces the connector with cfrs inside cfb-node. The binding
does not change.

## 6. Data paths

**Dashboard read.** browser, edge, Access with an IdP, static asset or Worker, Hono
handler, `vpc_services` binding, tunnel, origin, mTLS or bearer check.

**Job dispatch.** browser, Worker, Queue. cfb-node pulls a batch of 50 with a 12-hour
visibility timeout, runs the job on the orchestrator or on a CI runner, acks, writes
the result to R2 or to a DO-backed status key. The Worker enqueues; it never fans out
at request time, because of the 6-connection and 30-second-CPU ceilings [C1 1.24].

**Artifact upload.** browser, Worker, presigned R2 PUT URL returned, browser PUTs
directly to R2. Never through the Worker: the zone body cap is 100 MB on Free and Pro,
200 MB on Business, and there is no DNS-only escape for a tunnel [B5 R4, C6 R7].

**Human terminal.** A Worker can proxy a WebSocket but cannot terminate SSH [B4 3.2].
So `ttyd` on each box behind a tunnel hostname, with `-H/--auth-header` delegating
auth to the Worker and `-b/--base-path` mounting a path [B4].

## 7. Controls

The tunnel token is the account's root credential, not a config value. It is
`base64(json({a,s,t,e}))`, verified in cfrs's and cloudflared's source, an unsigned
bearer credential readable by anyone holding it [A1 F4, C1 1.1]. Use `--token-file`,
never `--token`, which puts it in the systemd `ExecStart` where every process on the
host can read it; the upstream fix is still open as cloudflared#1539 [C1 1.2]. Never
distribute `cert.pem`, which is account-wide and valid at least 10 years [A1 F5].

Run cfb-node on dedicated, minimal hosts that run nothing else. CI runners, container
hosts and storage nodes do not share a kernel with the management plane [C1 2.2]. This
is the highest-value isolation decision in the design and it is free.

The origin authenticates the Worker. Nothing in the Workers VPC path injects a service
token or an Access JWT, so "it came through the tunnel" is not an identity [A5 1.3].

Never issue Access service tokens to CI runners. A service token is a one-year,
identity-less, un-MFA-able bearer secret whose only revocation is deletion, and the
account cap is 50 anyway [C1 1.12, A5 1.14]. Mint short-lived scoped credentials
inside the control plane.

Set `HttpOnly` and `SameSite` on the `CF_Authorization` cookie explicitly and enable
`CF_Binding`; the defaults are `None` and `Optional` [C1 1.4].

Build the rogue-replica detector before the first production deploy: poll
`GET /accounts/{id}/cfd_tunnel`, alert on any `connections[].origin_ip` outside a
pinned set and on `client_version` drift, and keep history somewhere, because
Cloudflare keeps none [C1 2.11].

Untrusted CI runs in a microVM, on a host that runs nothing else, with no credentials
in the guest and egress off by default. Cloudflare's own Containers put each container
in a Firecracker microVM and still had a cross-tenant exposure in September 2026
through dm-thin with `skip_block_zeroing`, recovering structurally complete SQLite
databases on 18 of 24 placements [A2 F62, C4 1.2]. E2B Runtime is the reference
implementation, Apache-2.0, with control and data plane separated and secrets held as
metadata only [A2 R7, C4 1.6].

Budget the Cloudflare API ceiling: 1,200 requests per 5 minutes per token, about 4 per
second. Polling 50 machines every 60 seconds spends 21% of it before any real work
[C6 F11]. Reconcile by pushing, not by polling.

## 8. Cost, in one table

Full model with arithmetic in `docs/COST.md`. One Hetzner EX44 at $70.80 per month
(verified by me: EUR 59.00, i5-13500, 64 GB, 2x512 GB NVMe, 1 GBit unmetered) pays for
itself at whichever comes first: 157.7M Worker requests at 7 ms CPU, 206.7M R2 Class B
reads, 18 always-on Durable Objects, 20,160 build minutes, or one 24/7 `standard-2`
container at $93.47. I recomputed all five lines and they hold.

The split is per resource, not per product [A6 2.1, C2 2]:

| Resource | Verdict |
|---|---|
| Egress | own metal, unbounded |
| Always-on memory and disk | own metal, 5x to 6x |
| Bursty CPU | Cloudflare, because it bills active CPU only |
| Object storage on NVMe | Cloudflare. R2 at $0.015/GB-month beats a Hetzner 1 TB NVMe addon at about $0.036 |
| Object storage on spinning disk | own metal, about $0.00195/GB-month |
| Static asset serving | Cloudflare, free and unlimited |

## 9. Phases

1. **Two questions first.** Does SSSA 2.2.1(j), "use the Services to provide a virtual
   private network or other similar proxy services", apply to a single-tenant private
   network reached only by its owner? And do you intend to offer storage to anyone as
   a service, which decides Garage (AGPL) against SeaweedFS (Apache-2.0)?
2. **The second door.** WireGuard on a non-standard port, a runbook, one drill.
3. **Tunnel and cfb-node stage 1.** One remotely-managed tunnel per machine, token in
   a file, pinned cloudflared, egress allowlisted to 7844, catch-all `http_status:404`,
   rogue-replica poller.
4. **The orchestrator driver and CI runners.** Nomad with the `disconnect` block set
   and CI on a separate datacenter with its own ACL token, because of CVE-2026-14373
   [B3 F9]. Self-hosted Actions runners as a systemd service.
5. **The Worker, thin.** The SPA, Hono, Access, one internal client module for every
   data-plane call, presigned uploads.
6. **State split.** Postgres as the system of record, DOs to Tier 1, Queues pull.
7. **Storage.** SeaweedFS single node, Valkey, Litestream, and a tested restore.
8. **cfb-node stage 2.** cfrs registration and visitor serving behind a flag, measured
   against the real edge, then promoted.

## 10. What this design does not claim

- That cfrs can replace cloudflared today. It cannot; see section 4.3.
- That one binary is free. mirrord is one binary at 107 MB [E5 1.9]. The target is
  roughly 15 MB with no GUI on the box, and cfrs's 298-entry `Cargo.lock` has to be
  trimmed first.
- That portability is total. Durable Objects, Cloudflare Containers, Browser Rendering
  and the Node subset do not port. Section 2.3 names them.
- That any of this has been measured. Nothing in this repository runs. Every
  performance figure is a vendor or project claim, attributed.
- That Workers VPC has a known price. Two morning reads recorded an explicit
  free-during-beta sentence; my 13:18 UTC read returned a 33-word page pointing only
  at Workers pricing. Section 5.3 keeps the binding behind one client module so the
  transport is swappable.
