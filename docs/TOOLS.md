# The tool survey

Every GitHub figure below was read on 2026-10-29. Figures marked **[me]** were
re-read by the author against the GitHub API or the vendor's own page on 2026-10-29,
after the subagents reported. Figures not so marked come from the named research file
and were not independently re-read by me.

Licences are the SPDX identifier where the repository declares one. Where the
identifier is absent or the repository mixes licences per file, that is said.

## 1. The shortlist, one line per slot

| Slot | Pick | Why |
|---|---|---|
| Orchestrator | Nomad 2.1.0, k3s as alternative | REST, event stream, parameterized dispatch |
| PaaS on top | Coolify v4.5.3 | Only one with an API, SSH multi-host and tunnel support together |
| CI | self-hosted GitHub Actions runners | Needs only outbound 443 |
| Own-the-control-plane CI | Woodpecker CI v3.20.0 | 20 MB server, real REST API, three config changes needed |
| Object storage | SeaweedFS 4.51, R2 for hot and small | Apache-2.0, single node, Object Lock and versioning |
| Cache and queues | Valkey 9.1.3 | BSD, the only live Redis-line option that is legally usable here |
| HA control-plane state | rqlite | MIT, Raft, HTTP/JSON |
| SQLite backup | Litestream | Apache-2.0 |
| Untrusted-code sandbox | E2B Runtime (Firecracker underneath) | Control and data plane separation, secrets as metadata only |
| Browser terminal | ttyd | One binary, `-H` auth delegation, `-b` base path |
| Container dashboard to reuse | Komodo v2.3.4, or Portainer 2.45.3 | API-first, per-host agent |
| Ingress and TLS | nginx-proxy-manager v2.16.0, or Caddy v2.11.7 | REST API with tokens, or zero-config HTTPS |
| Tunnel | cloudflared 2026.10.6 | Free, no public IP, CDN and WAF in front |
| Self-hosted Workers runtime | workerd v1.20261029.1 | Apache-2.0, runs your Workers unchanged |
| Exit route, parked | celld v0.6.3 | Apache-2.0, deploys from a wrangler.json |

## 2. Orchestrators

From `research/B3-orchestrators.md`, which read each project's own sizing and API
documentation. "CP off-cluster" is the verdict on running the orchestrator's control
plane on a separate machine reachable only over a tunnel.

| | Nomad 2.1.0 | k3s v1.37.1 | k0s v1.37.1 | Swarm 29.9 | Rancher 2.15 | Talos 1.14 | MicroK8s 1.36 |
|---|---|---|---|---|---|---|---|
| Licence | BUSL 1.1, IBM | Apache-2.0 | Apache-2.0 | Apache-2.0 | Apache-2.0 | MPL-2.0 | Apache-2.0 |
| Stars / open issues | 17057 / 1626 **[me]** | 34274 / 86 | 6556 / 271 | 72225 / 3956 | 26020 / 3411 | 11429 / 302 | 9377 / 158 |
| Latest stable | 2026-10-28 | 2026-09-30 | 2026-10-27 | 2026-10-20 | 2026-09-23 | 2026-10-26 | 2026-05-25 |
| Primary API | REST `/v1/*` on 4646, Go client, ndjson event stream | Kubernetes API on 6443 | Kubernetes API on 6443 | Docker Engine REST on unix socket or TCP+TLS | Rancher REST plus auth proxy impersonation | single declarative gRPC API on 50000 | Kubernetes API |
| Documented footprint | server 2-4 core / 8-16 GB / 50 GB | server w/ workload 1596-1606 MB, agent 275 MB | not published | 216 MB idle, 2023 test | Small tier 4 vCPU / 16 GB per node, 3+ nodes | not published | 540 MB floor |
| CP off-cluster | poor, sub-10 ms inter-server requirement | workable with `--tls-san` | workable, natural split | workable for managers | already the design | blocked, gRPC plus mTLS needs a raw TCP LB | poor, snapd |

Two findings decide it:

- **Nomad is not open source.** BUSL 1.1, licensor IBM, additional use grant permits
  production use only if not competing with IBM's paid version [B3 F2]. The GitHub
  API returns `NOASSERTION` for the licence field **[me]**, which is consistent.
- **Cloudflare Tunnel does not support gRPC on a public hostname**, and an open
  cloudflared issue shows gRPC bodies and trailers stripped even with `http2Origin`
  [B3 F57, B6 F13]. This is what removes Talos from the control-plane role.

Also live and worth knowing: CVE-2026-14373, CVSS 7.7, CWE-862, the Nomad Docker
driver ignoring `allow_privileged` when a job sets host namespace modes, so any
authenticated job submitter reaches the host namespace. Fixed in CE 2.0.4 [B3 F9].

## 3. PaaS and fleet management

From `research/B2-selfhosted-paas.md`.

| Tool | Stars | Licence | Lang | Last release | Multi-host model | API to drive it | Ingress / TLS | Tunnel-friendly |
|---|---|---|---|---|---|---|---|---|
| Coolify | 65237 **[me]** | Apache-2.0 | PHP | v4.5.3 (2026-10-28) | SSH-managed deployment plus build servers | REST `/api/v1`, Sanctum scoped tokens, IP allowlist | Traefik plus Let's Encrypt | High |
| Dokploy | 38109 | Apache-2.0 core plus DSAL proprietary | TS | v0.30.10 | Docker Swarm | tRPC plus OpenAPI plus CLI | Traefik auto | Low, Swarm overlay |
| CapRover | 15195 | Apache-2.0 plus appendix | TS | v1.15.5 | Docker Swarm | Express REST plus CLI plus Node SDK | nginx plus Let's Encrypt | Low |
| Dokku | 32208 | MIT | Go | v0.38.32 | none, single host | CLI over SSH, no first-party REST found | plugin-based Let's Encrypt | High per host |
| LevelRail | 122 | Apache-2.0 | Go | v0.8.6 | reverse-dialed mTLS agents, beta | REST scoped tokens plus CLI plus MCP, 240+ tools | embedded Caddy | Highest |
| Kubero | 4455 | GPL-3.0 | TS | not fetched | Kubernetes | API plus CLI | k8s ingress | Depends |
| Canine | 2940 | Apache-2.0 | Ruby | none, 0 releases | Kubernetes | web UI plus git push | k8s ingress | Depends |

Coolify's decisive property is the SSH model rather than any feature: an SSH session
runs over a cloudflared access tunnel, whereas Swarm clustering needs node-to-node
2377, 7946 and 4789 [B2 3.1].

Two licence notes that matter if you intend to repurpose or resell: Dokploy's
`/proprietary` features may only be used in production under a paid commercial
agreement, and CapRover's appendix restricts modifying and redistributing paid
features. Coolify, Dokku, LevelRail and Canine are the least encumbered [B2 3.8].

"Porthos" as a self-hosted PaaS does not exist in any discoverable form. The only
Porthos repository is an unrelated 2017 embedded-Linux robot [B2 F7].

## 4. Remote access and tunnels

From `research/B4-remote-access-tunnels.md`. Full table in that file. The rows that
matter for the three use cases you named:

| Use case | Best self-hosted answer | Best Cloudflare-native answer |
|---|---|---|
| Browser terminal into a box | ttyd on the box behind a Tunnel; or lift `fosrl/newt/browsergateway/ssh.go` | Tunnel public hostname plus Access, terminal UI in the SPA, Worker WebSocket proxy in front |
| Private service reachable only from a Worker | none of the self-hosted overlays are the right shape; a Worker has no TUN device | **Workers VPC**: http or tcp VPC Service bound to a Tunnel, `fetch()`, `remote: true` |
| SSH without exposing port 22 | ShellHub v0.28.0, Apache-2.0, agent dials out, session log; or headscale v0.29.6, BSD-3, 45164 stars | **Access for Infrastructure**: protocol-agnostic targets, REST API, Terraform resource |

Excluded, with reasons:

- **rathole**: no programmatic API, its README says the HTTP API is WIP, last SemVer
  v0.5.0 on 2023-10-01 [B4 3.5].
- **gotty**: last commit 2017-12-13. **boringproxy**: last release v0.10.0 on
  2023-01-04. **reverst**: no formal releases [B4 3.5].
- **Firezone**: the Elixir control plane is Elastic License 2.0, not open source, and
  the README states production self-hosting is not officially supported [B4 3].
- **fosrl/cli**: not open source. Files with a Fossorial Commercial License header
  are proprietary and unauthorised use, copying, modification or distribution is
  strictly prohibited. Do not build on it. `fosrl/newt` and `fosrl/gerbil` are
  unambiguous AGPL-3.0 [B4 3.4].
- **zrok**: self-hosting needs OpenZiti plus PostgreSQL plus RabbitMQ plus InfluxDB
  [B4 2.4].
- **frp**: 110283 stars, Apache-2.0, v0.71.1, and the fallback if you must
  self-host. Its writable surface is `frpc`'s `/api/store/proxies` CRUD; `frps` is
  read-mostly. CVE-2026-40910 is a routing and access-control split auth bypass
  affecting 0.43.0 to 0.68.0 [B4 2.3, C1 1.19].

**Pangolin is the self-hosted project to study, not to adopt.** 23263 stars, and the
only one combining a WireGuard overlay, an identity-aware reverse proxy, a browser
terminal and browser RDP and VNC, and a permissioned REST API with an OpenAPI
document. Its pieces are separately licensed and small [B4 3.3].

## 5. Storage

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
AIStor Free is proprietary, single-node and needs a license key [B5 R1].

**RustFS must be avoided despite being Apache-2.0 and past 1.0.** Eight advisories
published in one batch on 2026-10-18, including an Object Lock COMPLIANCE bypass
where force-deleting a bucket destroys retained objects, and an S3 policy bypass over
its WebDAV, FTP and SFTP listeners, plus a critical path traversal and a hardcoded
privileged token before Alpha.78 [B5 R1].

Cache and metadata layer:

| | Valkey | Dragonfly | KeyDB | Redict | rqlite | Litestream |
|---|---|---|---|---|---|---|
| Licence | BSD-3-Clause | BSL 1.1 | BSD-3-Clause | LGPL-3.0-only | MIT | Apache-2.0 |
| Stars | 27558 | 31831 | 12499 | 356 | 17881 | 14549 |
| Last release | 9.1.3 (2026-10-26) | v2.0.2 (2026-10-07) | v6.3.4 (2023-10-30) | not captured | not captured | not captured |
| Alive | yes | yes | no | no | yes | yes, beta |
| Usable in a commercial service | yes | no, the Additional Use Grant forbids it | yes | yes | yes | yes |

Dragonfly's BSL Additional Use Grant forbids making the work available as a service
to third parties. That is exactly the product being built [B5 R5].

## 6. CI systems

From `research/B6-ci-systems.md`. "Control plane on Workers" means: can the
scheduling brain itself run inside a Cloudflare Worker, with heavy execution on your
own metal.

| System | Control plane | Executor transport | Long jobs | Control-plane image | Licence | Alive | On Workers? |
|---|---|---|---|---|---|---|---|
| GitHub Actions self-hosted runner | GitHub SaaS | outbound HTTPS 443 long poll | 5 days per job | runner binary, small | MIT | yes, v2.338.2 | No, but nothing to host |
| ARC | k8s you run | outbound HTTPS long poll | inherits runner limits | controller about 46 MB | Apache-2.0 | yes, 0.15.1 | No |
| Woodpecker CI | self-hosted Go server, SQLite default | agent dials out over gRPC | default 60 min, max 120 min, configurable | server about 20 MB, agent about 16 MB | Apache-2.0 | yes, v3.20.0 | No, server is stateful Go |
| Buildkite agent | Buildkite SaaS, no self-hosted option | agent polls outbound | no hard cap documented | agent about 304 MB | MIT | yes, v4.8.1 | No |
| Concourse | self-hosted web node plus Postgres | worker SSH to TSA on 2222, ports forwarded back over SSH | no documented cap | web about 1.0 GB | Apache-2.0 | yes, v8.3.2 | No |
| Argo Workflows | k8s | k8s pods | no cap | n/a | Apache-2.0 | yes, v4.1.6 | No |
| Tekton | k8s | k8s pods | no cap | n/a | Apache-2.0 | yes, v1.17.1 | No |
| Dagger | none required | local engine | no cap | engine container | Apache-2.0 | yes, v0.21.11 | Partly, engine is host-local |
| Gitea Actions | a Gitea instance | runner registers | Gitea-configured | Gitea instance | MIT | yes, v5.2.4 | No |
| Jenkins | self-hosted Java 21+ controller | agent over SSH inbound or WebSocket outbound | no cap | about 242 MB, 4 GB+ RAM | MIT | yes, 2.588 | No |
| Earthly | none, build framework | local daemon | no cap | host daemon | MPL-2.0 | upstream unmaintained since 2025-07-16 | Fork `EarthBuild/earthbuild` v0.8.19 |
| Cirrus CI | shut down 2026-06-01 | n/a | n/a | n/a | archived | dead | No |
| cloudflare/ci | Cloudflare Workers plus Workflows plus Sandbox | runs on Cloudflare | Workflows-step bounded | npm package, no server | Apache-2.0 | yes, v0.2.0, 614 stars | Yes by construction, wrong direction |

Image sizes are Docker Hub `full_size`, which sums layers across every platform in a
multi-arch manifest list. They overstate a single-architecture pull but are
comparable against each other [B6 2].

## 7. Dashboards and the Workers SPA stack

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
Cloudflare tooling, TanStack Start for one type-safe full-stack framework, Astro
v7.4.4 for read-heavy dashboards since it is now a Cloudflare project, OpenNext only
if Next.js RSC is required [B7 3].

## 8. Prior art: who has already built this

From `research/B8-prior-art-control-plane.md`.

| Project | Control plane | Data plane | Licence | Stars | Last push | Reusable? |
|---|---|---|---|---|---|---|
| `gofixpoint/amika` (open half) | closed gateway, relay is a DO per host | `amika-hostd` daemon, smolvm VMs | Apache-2.0 | 295 **[me]** | 2026-10-28 **[me]** | Highest. See `docs/AMIKA-REUSE.md` |
| `harshalgajjar/Reminal` | Worker plus 3 Durable Objects, free tier | Go agent, WebRTC DataChannel for media | AGPL-3.0 | 323 | 2026-10-29 | High for the relay design, copyleft is a constraint |
| `ChrispyBacon-dev/DockFlare` v3 | your own Docker host plus Redis | `dockflare-agent` per Docker host | GPL-3.0 | 2493 | 2026-10-06 | High as an architecture reference |
| `context-labs/cloudflared-operator` | Kubernetes control plane | cloudflared Deployment, 2 replicas | MIT | 59 | 2026-08-26 | High if the data plane is k8s, very young |
| `stwins60/tunnelflow` | your own host, Next.js plus Prisma | manages cloudflared | MIT | 4 | 2026-10-24 | Medium, right shape, unproven |
| `okou-ai/okou` issue #2801 | a commercial backend | user's machine running cloudflared | n/a | 1162 | 2026-10-29 | High as a published design doc |
| `denoland/celld` | your own hardware | your own hardware | Apache-2.0 | 6170 **[me]** | 2026-10-21 **[me]** | Exit route, not a component |

Two findings from B8 that are worth the price of the whole file:

**amika registers its keep-alive with Cloudflare's `setWebSocketAutoResponse`** so an
idle host costs nothing and the relay is not billed a message for it. A plain
WebSocket ping frame cannot be auto-answered by the runtime, but a text message pair
can [B8 3.3]. That is a direct, quantified saving on a Workers-hosted control plane.

**The two-token model from okou issue #2801**: a tunnel token scoped to one tunnel
and handed to the box once, versus a per-bridge Access service token held only
server-side with a 2 hour TTL and rotated. Do not conflate them, and do not let a box
see the second one [B8 3.7].

## 9. Cloudflare's own API and SDK surface you will drive

From `research/B8-prior-art-control-plane.md`, cross-checked against
`cloudflare-go`, the `cloudflare` npm SDK and the Terraform provider.

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

Note the Terraform rename: `cloudflare_tunnel` became
`cloudflare_zero_trust_tunnel_cloudflared` in v5 [B8 2].

## 10. Academic prior art

From `research/C5-academic-prior-art.md`. Five papers are recorded there as
metadata-only because ACM PDFs returned 502 twice through the reader; those are
labelled unverified in that file and I did not re-read them.

- Cold start is dominated by code and dependency loading, pod allocation and
  scheduling, not by the platform. FaaSLight cut code-load latency by up to 78.95%
  and total response by up to 42.05%, DOI 10.1145/3585007, TOSEM 2023 [verified].
- At production scale, from a Huawei trace of 85 billion requests and 11.9 million
  cold starts across 5 datacenters, cold start is up to 7 seconds or up to 3 seconds
  depending on region. Multi-region scheduling is the lever. DOI
  10.1145/3689031.3696073 [verified].
- Warm pools buy latency with idle cost: pre-warmed instances cut P99 response time
  by 85% under Knative, Lin and Glikson, arXiv 1903.12221. Budget warm workers as a
  cost line [verified].
- OSDI'25 "Fork in the road": prior cold-start optimisations assume away large-scale
  and concurrency complexity and still leave cold start a bottleneck in production.
  Single-component fixes do not survive scale [verified].
- Cloud-edge placement is research-grade and now available to you: NEPTUNE does
  location-aware placement, anti-saturation, GPU and dynamic CPU, DOI
  10.1145/3634750, ACM TAAS 19(1) 2024 [verified].
- The closest academic match to this design is UD-IaaS-FaaS scheduling, arXiv
  2610.15886, October 2026: heavy tasks on IaaS, fine-grained on FaaS, jointly
  optimising makespan, energy and cost [verified].
- Cost right-sizing is cheap: CPU-TAMS finds max-value FaaS memory within about 5% of
  brute force with one profiling run, Cordingly et al. 2022. Maps to sizing container
  CPU and memory requests to raise packing density [verified].
- **"Serverless is cheaper" is workload-dependent, not a law** (Spillner 2017, 156
  citations), and hybrid-edge resource orchestration with mixed SLOs is explicitly
  immature (Guim 2021, 101 citations) [verified].
- There is no peer-reviewed current Cloudflare-versus-one-Hetzner-box break-even in
  the literature. Any break-even in this repository is a labelled estimate, and
  `docs/COST.md` is where it lives [verified as an absence].

## 11. Corrections to the research set

Recorded here so the spec does not inherit them.

- **Route limit.** `A5` quotes the account-limits page as 1,000 routes per account.
  `A1` and `B8` quote the same URL as 50,000, with the 2026-10-16 changelog saying
  "up from 1,000". The correct figure is 50,000 [D1 1].
- **cloudflared release.** Six files say 2026.10.5. The current release is 2026.10.6,
  published 2026-10-29T12:18:25Z **[me]**. Six of the seven files naming a version
  are morning snapshots [D1 D10].
- **Enterprise upload limit.** `B5` says 500 MB. That appears to be the CDN cache
  figure from the same page `A6` read, which correctly separates 100 MB on Free and
  Pro, 200 MB on Business and up to 5 GB on Enterprise [D1 D9].
- **Bandwidth sentences.** `A6` says 10 TB/month is "about 4 Mbps", which is a unit
  slip for about 4 MB/s; it is 30.4 Mbps. `C6` says 20 TB/month is "about 0.5 Mbps";
  it is 60.9 Mbps. Both reach the right conclusion from a wrong rate [D1 D18].
- **Per-vCPU ratio.** The 4.5x figure divides a 6-core 12-thread box by 6. Dividing
  by 12 gives 2.25x. Neither is a measurement of work per second [D1 D19].
- **One always-on Durable Object.** Use $4.20, from Cloudflare's own 128 MB / 1 GB =
  0.128, not $4.11, which implies 0.125 [D1 D5].
- **celld.** `B8`'s inventory of the self-hosted Workers field omits celld, which
  `A4` read the same day at 6,170 stars. Those two files disagree on whether this
  category is a component or an exit route [D1 D13].
- **Workers VPC pricing.** `A5` and `A6` both read an explicit "free during the open
  beta period" sentence on the pricing page. My read at 2026-10-29 13:18 UTC returned
  a 33-word page reading only "Workers VPC requires a Workers plan. See Workers
  pricing for current rates", with the reader reporting low confidence and no
  extraction. Treat VPC pricing as unverified and design the transport as swappable.
  This is the most important open cost item in the whole set.
