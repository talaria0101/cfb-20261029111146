# Decisions, with the alternatives that were rejected

Each decision names what was chosen, what it beat, and the evidence. Where a
decision rests on a business fact only the operator can supply, that is said
plainly rather than assumed.

## D1. Control plane on Cloudflare Workers, not on your own metal

Chosen: Workers plus Static Assets.

Rejected: running the dashboard on your own box behind the tunnel. This was your
stated constraint, so it is a requirement more than a decision, but it is worth
recording that it is also the cheap answer. Requests to static assets are free and
unlimited, Cloudflare's own worked example prices a 15-million-request-per-month SPA
at $5.00 total, and the $5 Workers Paid floor is unavoidable in this design anyway
[A6, verified by me]. You get the CDN, the WAF and DDoS protection in front of the
origin for that.

Cost of the decision: the whole availability and ToS analysis in
`docs/CRITIQUE.md`. A control plane whose only door is Cloudflare has no
availability independent of Cloudflare.

## D2. Transport is Workers VPC Services, not public hostnames plus Access

Chosen: `vpc_services` bindings in `wrangler.toml`, one per internal HTTP endpoint.

Rejected: publishing every internal service on a public hostname behind an Access
application. That works, and it is the fallback implementation behind invariant 13,
but it puts an Access application and a public DNS name in front of every internal
service, which is more moving parts and more attack surface than a binding [A5 2.1].

Rejected: a hand-rolled relay. You could build one. `gofixpoint/amika`'s
`@amika/tunnel-protocol` is an open, Worker-targeted wire spec and its relay is a
Cloudflare Durable Object per host [B1 1.5, B8 3.1]. Building it buys you nothing
that a VPC Service does not already give you, and costs you a Durable Object per
host and a subprotocol to pin.

The structural reason: a VPC Service pins host and port in the service
configuration and ignores both in the `fetch()` URL, which makes SSRF structurally
impossible on that path. Cloudflare states this outright [A5, verified by me].

## D3. Orchestrator is Nomad, with k3s as the named alternative

Chosen: Nomad 2.1.0.

Reason: the API shape is most of the control plane already. A complete REST API
under `/v1/`, `GET /v1/event/stream` as a resumable ndjson stream with per-topic
ACLs, and parameterized jobs with dispatch payloads that mint a unique job ID per
run [B3 2.3].

Rejected, on license: Rancher, whose Small tier alone is 4 vCPU and 16 GB per node
across three nodes, which is more than the whole data plane. Sidero Omni, BUSL with
an additional use grant limited to non-production and home-lab use, which is exactly
the use you want. Docker Swarm as the plan rather than the fallback, because Docker's
own retired page says development has slowed in favour of Kubernetes-based solutions
and the 2030 commitment is a paid MKE 3 commitment. MicroK8s, on its snapd
dependency and a five-month release lag [B3 3].

Rejected, on protocol: Talos as the control-plane channel. Talos has the most
attractive API in the set, a single declarative gRPC API with mTLS, and Cloudflare
Tunnel explicitly does not support gRPC on public hostnames, with an open bug
stripping gRPC bodies and trailers even with `http2Origin` [B3 F57, B6 F13]. Keep
Talos as the OS on the data-plane nodes if you want it. Do not make its API the
control-plane channel.

The honest caveat on Nomad: **Nomad is BUSL 1.1 with licensor IBM, not open
source** [B3 F2]. The additional use grant permits production use only if you are
not competing with IBM's paid version. If that matters to you, this decision flips to
k3s, and k3s is a good answer: Apache-2.0, 34,274 stars, 1,596 to 1,606 MB for a
server with workload and 275 MB for an agent [B3].

## D4. PaaS layer is Coolify, not Dokploy or CapRover

Chosen: Coolify v4.5.3, Apache-2.0.

Reason: it is the only mainstream PaaS combining a real externally callable REST API
v1 with scoped tokens and an IP allowlist, multi-host fleet management over SSH
rather than a Swarm overlay, and first-class "connect this server via Cloudflare
Tunnel" support [B2 3.1]. The SSH model is decisive: an SSH session runs fine over a
cloudflared access tunnel, whereas Swarm clustering needs node-to-node 2377, 7946
and 4789, which a per-service tunnel topology does not give you.

Rejected: Dokploy, the most polished TypeScript PaaS, on the Swarm caveat and
because its enterprise features are under the Dokploy Source Available License, whose
`/proprietary` features may only be used in production under a paid commercial
agreement [B2 3.3]. CapRover, same Swarm caveat plus a license appendix restricting
modification and redistribution of paid features [B2 3.4]. Dokku, MIT, tiny and
extremely stable, but single-host with no first-party REST API, so it is a per-host
runtime and not a fleet control plane [B2 3.5].

Pilot: LevelRail. One Go binary with embedded Caddy, BuildKit, SQLite and React
dashboard, reverse-dialed mTLS agents, scoped API tokens, an MCP server with 240-plus
tools, and CLI Cloudflare-tunnel commands. 122 stars, v0.8.6, multi-node beta, tunnel
behind a flag [B2 3.2]. Time-box a pilot on one or two nodes, not the safe default.

## D5. CI is self-hosted GitHub Actions runners, with the Worker as an API client

Chosen: `actions/runner` as a systemd service on each box.

Reason, in order of weight: the runner needs only outbound HTTPS 443, so nothing is
punched through and there is no gRPC-over-tunnel problem; the dispatch endpoint
returns the run ID in the trigger call via `return_run_details`; self-hosted runners
get a 5-day job limit against 6 hours for GitHub-hosted; the runner app is MIT and
releases weekly; and GitHub does the scheduling while Cloudflare only serves the SPA,
which satisfies the orchestration constraint cleanly [B6 R1].

Rejected: actions-runner-controller, unless there is already a Kubernetes cluster to
attach it to. Its value is ephemeral pod autoscaling, and on a handful of long-lived
machines the plain runner binary is less machinery [B6 R1].

Rejected as primary: Woodpecker CI, on the gRPC ground. It is the best candidate if
you want a control plane you own, and it is documented in `SPEC.md` 5.3 with the
three configuration changes it needs. But the agent-to-server gRPC leg does not
survive a Tunnel public hostname [B6 R2, B6 F13].

Rejected: Buildkite, which has no self-hosted control plane at all per its own
comparison pages [B6 F17]. Concourse, which is the strongest own-everything option
after Woodpecker and costs a ~1.0 GB image plus Postgres [B6 R4]. Argo Workflows and
Tekton, Kubernetes-only. Dagger, which answers "how do I make the build reproducible"
rather than "what triggers my builds" [B6 R4].

Dead and excluded: Earthly upstream, unmaintained since 2025-07-16 with Cloud and
Satellites shut down, live fork `EarthBuild/earthbuild` v0.8.19. Cirrus CI, shut
down 2026-06-01 with the agent archived. Drone, whose repo now redirects to
`harness/harness` [B6 2].

## D6. Storage is R2 for hot and small, SeaweedFS for bulk

Chosen: a split, not a single store.

Reason: the price data does not support a blanket "self-hosted is cheaper". R2 at
$0.015/GB-month beats a Hetzner 1 TB NVMe addon at about $0.036/GB-month, and loses
to bulk HDD at about $0.00195/GB-month and to a Hetzner Storage Box at about
$0.0024/GB-month [A6 2.1, C2 2.6]. So the honest design uses each where it wins.

Rejected: MinIO, archived, AGPL-3.0, README says no longer maintained, successor
proprietary [B5 R1]. RustFS, Apache-2.0 and past 1.0, but eight advisories on
2026-10-18 including an Object Lock COMPLIANCE bypass and an S3 policy bypass over
its alternate protocol listeners [B5 R1]. Ceph RGW, which needs three nodes minimum
and placement-group expertise. Zenko, which needs MongoDB plus Redis and is a data
controller rather than storage [B5 R7].

Deferred on a business fact: Garage. It is the best-engineered answer to S3 on a
handful of own machines across sites behind consumer links, 1 GB RAM, any x86_64 from
the last decade, CRDT metadata with no consensus bottleneck, tolerance for nodes
that change IP, a published OpenAPI admin API v2. It is AGPL-3.0, has no versioning
and no Object Lock, and is eventually consistent with conditional PUT deliberately
unsupported [B5 R3]. If you intend to offer storage to users as a service, the AGPL
network clause engages. That is one binary question and it changes the
recommendation. Nothing in this repository can answer it.

## D7. Cache is Valkey

Chosen: Valkey, BSD-3-Clause, 27,558 stars, 9.1.3.

Rejected: Dragonfly, BSL 1.1 with an Additional Use Grant that forbids making the
work available as a service to third parties, which is exactly the product being
built [B5 R5]. KeyDB, last release v6.3.4 from 2023-10-30, last master commit
2024-03. Redict, LGPL-3.0-only, on Codeberg, last updated 2025-10-10.

## D8. Control-plane state is your own Postgres, not Durable Objects

Chosen: authoritative state on your own Postgres, reachable over the tunnel, with the
Worker as a client. Cloudflare holds the SPA bundle, short-lived session data, a job
queue and signed URLs.

Rejected: Durable Objects as the system of record. A SQLite-backed DO caps at 10 GB
per object on Paid and 5 GB on Free, fails writes with `SQLITE_FULL` at the cap while
reads and deletes keep working, does not spawn in South America, Africa or the Middle
East, never relocates after creation, and has no REST API for inspection or repair
[A4 1.6, 1.7, C6 R3].

Tier 1 Durable Objects stay on Cloudflare: WebSocket fan-out, per-tenant rate
limiters, the small strongly-consistent index the SPA reads, all with WebSocket
Hibernation and `setWebSocketAutoResponse()` from day one [A4 2.1].

## D9. Untrusted CI runs in microVMs

Chosen: Firecracker, Cloud Hypervisor or Kata, or gVisor, on a host that runs nothing
else. E2B Runtime as the reference implementation rather than Firecracker directly.

Reason: Cloudflare's own Containers put each container in a dedicated Firecracker
microVM and still had a cross-tenant exposure in September 2026 through dm-thin with
`skip_block_zeroing` on a shared pool, recovering structurally complete SQLite
databases on 18 of 24 placements [A2 F62, C4 1.2]. Cloudflare's own sandbox docs say
a container is the smallest unit of trust [C6 R6]. Your CI jobs are at least as
untrusted as Cloudflare's customers' code.

Rejected: plain Linux containers on a shared host for untrusted jobs. gVisor as the
general answer, because block-device filesystems are not natively supported and
resource limits are not enforced within the sandbox [C4 1.5].

## D10. workerd runs on your own metal, for your own trusted code only

Chosen: `workerd` behind a tunnel, fronted by systemd socket activation, running
unprivileged.

Reason: it is Apache-2.0, it runs Workers-designed code unchanged, it is free to
self-host, and tunnel fronting is config-native [A3 2.1, 2.2].

Conditions: it is not a security sandbox, you own the V8 patch gap, and
`workerd.capnp` has no resource knobs so governance is yours [A3 2.3, 2.4, 2.5].
See `SPEC.md` 5.6.

## D11. The dashboard reuses Komodo or Portainer rather than being rebuilt

Chosen: Komodo as the architectural match, Portainer if you want a turnkey UI plus a
stable REST API.

Reason: Komodo is designed exactly for "build and deploy across many servers", is
API-first with typed clients, has community Terraform providers, and ships a per-host
`periphery` agent, so it maps cleanly onto the control-plane and data-plane split
[B7 R1]. Portainer has a full REST API plus an agent, is Zlib-licensed in CE, and is
at 2.45.3 [B7 2].

The Workers SPA stays a thin client over its own Hono API. Nothing on Cloudflare
touches a Docker socket [B7 R2].

Rejected: rebuilding a container-control dashboard. Rejected as control surfaces:
Traefik, whose v2 and v3 REST API is introspection-only and cannot be pushed routing
config, so do not plan to POST routes to it [B7 2]. Caddy's admin API, which is
unauthenticated on localhost by default and must be hardened before any Worker-driven
use [B7 R4]. Yacht, dormant. CasaOS, a home app-store rather than a control plane
[B7 R7].

## D12. Ingress and TLS on your metal is nginx-proxy-manager or Caddy

Chosen: nginx-proxy-manager if you need a UI plus a REST API to add and remove proxy
hosts and certs programmatically. Caddy if you want zero-config automatic HTTPS with
a drivable admin API, hardened first [B7 R4].

## D13. Human SSH is Access for Infrastructure, not long-lived keys

Chosen: Access for Infrastructure with short-lived certificates minted from the
user's Access login token.

Reason: it replaces long-lived SSH keys, gives protocol-agnostic targets with a REST
API at `/infrastructure/targets` and a Terraform resource, a 24-hour default session,
and command logs [A5 1.7]. Its limits are no local, remote or agent port forwarding,
no X11, and a 10-hour maximum expected session duration [A5 1.7].

Rejected: exposing port 22 with password or key auth. Rejected as a general answer:
Teleport, AGPL-3.0 and the heaviest option in the survey at 3,248 open issues
[B4 2.1].

## D14. The second door is WireGuard or Tailscale, and it is drilled monthly

Chosen: a WireGuard or Tailscale endpoint on a non-standard port, a runbook, and a
monthly drill that proves the credential still works.

Reason: 49 Cloudflare incidents between 2026-10-13 and 2026-10-28, one critical, on
the Zero Trust connectivity path this design depends on [C6 1.1, 1.2]. On 2025-11-18
new logins failed for roughly 1h45m while existing sessions worked [C1 1.20].

If you want a self-hosted control plane for that overlay rather than Tailscale's,
`headscale` is the most Worker-friendly: BSD-3-Clause, 45,164 stars, v0.29.6, and its
`/api/v2` reuses Tailscale's wire shapes so the Terraform provider, tscli and the
official Go client all drive it [B4 3]. Its ceiling is a single tailnet. NetBird's
management, signal, relay and dashboard directories are AGPLv3 within a BSD-3 project
[B4 2.1]. Firezone is out: the Elixir control plane is Elastic License 2.0 and the
README states production self-hosting is not officially supported [B4 3].

## D15. Not building a self-hosted Workers runtime

Chosen: do not build it. The inverse direction is already crowded and all three of
`wdl-dev/wdl`, `openworkers` and `solcreek/creek` self-describe as early [B8 2].

Kept as an exit route, not a component: `denoland/celld`, Apache-2.0, Rust, 6,170
stars, v0.6.3, which deploys from an existing `wrangler.json` [A4 2.1, verified by
me]. Note that `B8`'s inventory of the field omits celld while `A4` read it the same
day, so those two files disagree on whether this is a component or an exit route
[D1 D13]. This decision records it as an exit route.
