# Decisions

Each decision names what was chosen, what it beat, and the evidence. Where a decision
rests on a business fact only the operator can supply, that is said rather than
assumed.

## D1. Control plane on Cloudflare Workers

Chosen: Workers plus Static Assets.

Rejected: running the dashboard on your own box behind the tunnel. It is your stated
constraint, and it is also the cheap answer: static asset requests are free and
unlimited, Cloudflare's own worked example prices a 15-million-request-per-month SPA at
$5.00 total, and the $5 Workers Paid floor is unavoidable anyway [A6, verified by me].

Cost: the whole availability and ToS analysis in `docs/CRITIQUE.md`. A control plane
whose only door is Cloudflare has no availability independent of Cloudflare.

## D2. The portable contract is S3 plus SQL plus a queue pull, not Cloudflare bindings

Chosen: `fetch`, object storage via the S3 API, SQL, and a queue with an HTTP pull
consumer. Application code imports no Cloudflare binding. One adapter file per
platform.

Rejected: writing against `R2Bucket`, `D1Database`, `Queue` and `DurableObjectNamespace`
and swapping them later. That is the failure mode R1 exists to prevent: the bindings
are not interchangeable, so the swap is a rewrite rather than a config change.

The reason it works: R2 is S3-compatible [A6 1.1, verified by me] and SeaweedFS is
S3-compatible [B5 2]. Targeting S3 costs nothing on Cloudflare and buys the
self-hosted backend for free.

Rule P2 records the exceptions: Durable Objects (Tier 1 coordination only), Cloudflare
Containers, Browser Rendering, and the Node subset. Section 2.3 of `SPEC.md` names
each.

## D3. One agent binary per server, composed from four existing projects

Chosen: `cfb-node`, a Rust binary per box that is simultaneously the tunnel connector,
the orchestrator interface and the broker.

Rejected: the four-process stack this replaces, namely `cloudflared` plus an
orchestrator agent plus a management daemon plus a Python metrics collector such as
Glances [E2 1.5].

Composition, with the source and its state:

| Module | Source | State |
|---|---|---|
| `transport` | cfrs `src/transport/mod.rs` | complete, 332 tests |
| `edge` | cfrs `src/cloudflare/` | codec complete, never driven by a serving loop |
| `vnet` | cfrs `src/vnet/` plus `shim/cfrsnet.c` | complete, feature-gated |
| `enroll` | ServerBee `crates/agent` | complete, AGPL-3.0 |
| `protocol` | ServerBee protocol shape plus mirrord's versioning discipline | shape reusable |
| `connect info` | mirrord `AgentConnectInfo` | design pattern |
| `broker` | cfrs `Tunnel::resolve` and `Origin` | HTTP done, TCP net-new |
| `orchestrator` | net-new | not started |

Rejected as a component: mirrord's binary, at 106,792,688 bytes unstripped [E5 1.9].
Adopt its component split and its environment resolution, not its CLI.

Size target is roughly 15 MB, justified by ServerBee's agent at 13,772,672 bytes and
omnyssh's TUI core at 4.3 to 5.1 MB compressed, against an 85 MB AppImage whose weight
is the GUI toolchain [E4 1.7, E3 1.4]. Keep the GUI off the box and put every UI in the
Workers SPA.

## D4. cloudflared stays for stage 1; cfrs replaces it in stage 2

Chosen: `cloudflared` as a child process of `cfb-node`, behind the same `Transport`
trait, until cfrs's registration and visitor serving are finished and measured.

Reason: I read cfrs's source. `cmd_tunnel` provisions a quick tunnel and returns;
`src/tunnel/mod.rs` states that registration and visitor serving are not implemented,
so a `Tunnel` is not yet a running Cloudflare tunnel. `cfrs serve` reaches the internet
only through `free.pinggy.io:443`, a third-party relay that can read the traffic
[E6 1.1, 1.2].

The transport trait is what makes stage 2 a drop-in rather than a rewrite: nothing
above `transport` learns which connector is in use.

## D5. Orchestrator is Nomad, k3s the named alternative

Chosen: Nomad 2.1.0.

Reason: the API shape is most of the control plane already. REST under `/v1/`,
`GET /v1/event/stream` as a resumable ndjson stream with per-topic ACLs, and
parameterized jobs whose dispatch mints a unique job ID per run [B3 2.3].

Rejected on licence: Rancher, whose Small tier alone is 4 vCPU and 16 GB per node
across three nodes. Sidero Omni, BUSL with an additional use grant limited to
non-production and home-lab use. Docker Swarm as the plan rather than the fallback.
MicroK8s, on its snapd dependency and five-month release lag [B3 3].

Rejected on protocol: Talos as the control-plane channel. Its API is the most
attractive in the set, and Cloudflare Tunnel does not support gRPC on public hostnames,
with an open bug stripping gRPC bodies and trailers even with `http2Origin` [B3 F57,
B6 F13]. Keep Talos as the node OS if you want it.

Caveat: **Nomad is BUSL 1.1 with licensor IBM, not open source** [B3 F2]. If that
matters, this flips to k3s, which is a good answer: Apache-2.0, 34,274 stars, 1,596 to
1,606 MB for a server with workload and 275 MB for an agent [B3].

cfb-node exposes the orchestrator through a driver trait; it does not run it.

## D6. PaaS layer is Coolify

Chosen: Coolify v4.5.3, Apache-2.0, 65,237 stars **[me]**.

Reason: the only mainstream PaaS combining a real externally callable REST API v1 with
scoped tokens and an IP allowlist, multi-host fleet management over SSH rather than a
Swarm overlay, and first-class Cloudflare Tunnel support [B2 3.1]. The SSH model is
decisive: an SSH session runs over a cloudflared access tunnel, whereas Swarm
clustering needs node-to-node 2377, 7946 and 4789.

Rejected: Dokploy, on the Swarm caveat and because its `/proprietary` features may only
be used in production under a paid commercial agreement [B2 3.3]. CapRover, same Swarm
caveat plus a licence appendix restricting modification and redistribution of paid
features [B2 3.4]. Dokku, MIT and extremely stable, but single-host with no first-party
REST API, so it is a per-host runtime rather than a fleet control plane [B2 3.5].

Pilot: LevelRail, 122 stars, one Go binary with embedded Caddy, BuildKit, SQLite and
React dashboard, reverse-dialed mTLS agents, scoped API tokens, an MCP server with
240-plus tools. Immature: multi-node beta, tunnel behind a flag [B2 3.2].

## D7. CI is self-hosted GitHub Actions runners

Chosen: `actions/runner` as a systemd service on each box.

Reason, in order of weight: the runner needs only outbound HTTPS 443, so nothing is
punched through and there is no gRPC-over-tunnel problem; the dispatch endpoint returns
the run ID in the trigger call via `return_run_details`; self-hosted runners get a
5-day job limit against 6 hours for GitHub-hosted; the runner app is MIT; and GitHub
does the scheduling while Cloudflare only serves the SPA, which satisfies R4 cleanly
[B6 R1].

Rejected: actions-runner-controller, unless there is already a Kubernetes cluster to
attach it to [B6 R1]. Woodpecker as primary, on the gRPC ground: it is the best
candidate if you want a control plane you own, with three mandatory config changes
(raise `WOODPECKER_MAX_PIPELINE_TIMEOUT` above 120 minutes, use per-agent tokens, and
schedule host-level image pruning), but its agent-to-server gRPC leg does not survive a
Tunnel public hostname [B6 R2, R3, F11, F13]. Buildkite, which has no self-hosted
control plane [B6 F17]. Concourse, the strongest own-everything option after Woodpecker,
costing a ~1.0 GB image plus Postgres [B6 R4].

Dead and excluded: Earthly upstream, unmaintained since 2025-07-16. Cirrus CI, shut
down 2026-06-01. Drone, whose repo redirects to `harness/harness` [B6 2].

## D8. Storage is R2 for hot and small, SeaweedFS for bulk

Chosen: a split, not a single store.

Reason: R2 at $0.015/GB-month beats a Hetzner 1 TB NVMe addon at about $0.036/GB-month,
and loses to bulk HDD at about $0.00195/GB-month and to a Hetzner Storage Box at about
$0.0024/GB-month for 20 TB [A6 2.1, C2 2.6]. Each is used where it wins.

Rejected: MinIO, archived and AGPL-3.0 [B5 R1]. RustFS, Apache-2.0 and past 1.0, but
eight advisories on 2026-10-18 including an Object Lock COMPLIANCE bypass and an S3
policy bypass over its alternate protocol listeners [B5 R1]. Ceph RGW, needing three
nodes minimum. Zenko, needing MongoDB plus Redis and being a data controller rather
than storage [B5 R7].

Deferred on a business fact: Garage. Best-engineered answer to S3 on a handful of own
machines across sites, 1 GB RAM, CRDT metadata with no consensus bottleneck, tolerance
for nodes that change IP, a published OpenAPI admin API v2. AGPL-3.0, no versioning, no
Object Lock, eventually consistent, conditional PUT deliberately unsupported [B5 R3].
If you offer storage as a service the network clause engages. One binary question, and
it changes the recommendation.

## D9. Cache is Valkey

Chosen: Valkey, BSD-3-Clause, 27,558 stars, 9.1.3.

Rejected: Dragonfly, BSL 1.1 with an Additional Use Grant forbidding offering the work
as a service to third parties, which is exactly the product [B5 R5]. KeyDB, last
release v6.3.4 from 2023-10-30. Redict, LGPL-3.0-only on Codeberg.

## D10. Control-plane state is your own Postgres

Chosen: authoritative state on your own Postgres, reachable over the tunnel, with the
Worker as a client. Cloudflare holds the SPA bundle, short-lived session data, a job
queue and signed URLs.

Rejected: Durable Objects as the system of record. A SQLite-backed DO caps at 10 GB per
object on Paid and 5 GB on Free, fails writes with `SQLITE_FULL` at the cap while reads
and deletes keep working, does not spawn in South America, Africa or the Middle East,
never relocates after creation, and has no REST API for inspection or repair [A4 1.6,
1.7, C6 R3].

Tier 1 Durable Objects stay on Cloudflare: WebSocket fan-out, per-tenant rate limiters,
the small index the SPA reads, with WebSocket Hibernation and
`setWebSocketAutoResponse()` from day one [A4 2.1].

## D11. Untrusted CI runs in microVMs

Chosen: Firecracker, Cloud Hypervisor or Kata, or gVisor, on a host that runs nothing
else. E2B Runtime as the reference implementation rather than Firecracker directly.

Reason: Cloudflare's own Containers put each container in a dedicated Firecracker
microVM and still had a cross-tenant exposure in September 2026 through dm-thin with
`skip_block_zeroing` on a shared pool, recovering structurally complete SQLite
databases on 18 of 24 placements [A2 F62, C4 1.2]. Cloudflare's own sandbox docs say a
container is the smallest unit of trust [C6 R6].

Rejected: plain Linux containers on a shared host for untrusted jobs. gVisor as the
general answer, because block-device filesystems are not natively supported and
resource limits are not enforced within the sandbox [C4 1.5].

## D12. workerd runs on your own metal, for your own trusted code only

Chosen: `workerd` behind a tunnel, fronted by systemd socket activation, running
unprivileged.

Conditions: it is not a security sandbox, you own the V8 patch gap, and
`workerd.capnp` has no resource knobs so governance is yours [A3 2.3, 2.4, 2.5].

## D13. The dashboard reuses Komodo or Portainer

Chosen: Komodo as the architectural match, Portainer for a turnkey UI plus a stable
REST API.

Reason: Komodo is designed for "build and deploy across many servers", is API-first
with typed clients, has community Terraform providers, and ships a per-host `periphery`
agent [B7 R1]. Portainer has a full REST API plus an agent, Zlib-licensed in CE, at
2.45.3 [B7 2].

The Workers SPA stays a thin client over its own Hono API. Nothing on Cloudflare
touches a Docker socket [B7 R2].

Rejected: rebuilding a container-control dashboard. Traefik as a control surface, whose
v2 and v3 REST API is introspection-only and cannot be pushed routing config [B7 2].
Caddy's admin API, unauthenticated on localhost by default [B7 R4]. Yacht, dormant.
CasaOS, a home app-store [B7 R7].

## D14. Ingress and TLS on your metal is nginx-proxy-manager or Caddy

Chosen: nginx-proxy-manager for a UI plus a REST API to add and remove proxy hosts and
certs programmatically. Caddy for zero-config automatic HTTPS with a drivable admin
API, hardened first [B7 R4].

## D15. Human SSH is Access for Infrastructure

Chosen: short-lived certificates minted from the user's Access login token.

Reason: it replaces long-lived SSH keys, gives protocol-agnostic targets with a REST
API at `/infrastructure/targets` and a Terraform resource, a 24-hour default session,
and command logs. Limits: no local, remote or agent port forwarding, no X11, and a
10-hour maximum expected session duration [A5 1.7].

Rejected: exposing port 22 with password or key auth. Teleport as the general answer,
AGPL-3.0 and 3,248 open issues [B4 2.1].

## D16. The second door is WireGuard or Tailscale, drilled monthly

Chosen: a WireGuard or Tailscale endpoint on a non-standard port, a runbook, and a
monthly drill that proves the credential still works.

Reason: 49 Cloudflare incidents between 2026-10-13 and 2026-10-28, one critical, on the
Zero Trust connectivity path this design depends on [C6 1.1, 1.2]. On 2025-11-18 new
logins failed for roughly 1h45m while existing sessions worked [C1 1.20].

Self-hosted control plane for that overlay: `headscale`, BSD-3-Clause, 45,164 stars,
v0.29.6, whose `/api/v2` reuses Tailscale's wire shapes so the Terraform provider, tscli
and the official Go client all drive it [B4 3]. Ceiling is a single tailnet. NetBird's
management, signal, relay and dashboard directories are AGPLv3 within a BSD-3 project
[B4 2.1]. Firezone is out: Elastic License 2.0 and the README states production
self-hosting is not officially supported [B4 3].

## D17. Not building a self-hosted Workers runtime

Chosen: do not build it. The inverse direction is crowded and `wdl-dev/wdl`,
`openworkers` and `solcreek/creek` all self-describe as early [B8 2].

Kept as an exit route: `denoland/celld`, Apache-2.0, Rust, 6,170 stars, v0.6.3, which
deploys from an existing `wrangler.json` [A4 2.1, verified by me]. Note that `B8`'s
inventory of the field omits celld while `A4` read it the same day, so those two files
disagree on whether this is a component or an exit route [D1 D13]. Recorded as an exit
route.
