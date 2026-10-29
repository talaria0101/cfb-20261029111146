# SPEC: the control plane lives on Cloudflare, the work lives on your machines

Version 1.0, written 2026-10-29. Every figure carries a source tag pointing into
`research/`. Figures marked "verified by me" were re-read by the author against the
primary source on 2026-10-29.

## 1. Goal, constraints and non-goals

### 1.1 The goal

Run the expensive parts of a Cloudflare-shaped application on hardware you own, and
keep a management SPA on Cloudflare so you keep one login, one DNS zone, one CDN and
one WAF in front of the thing. Specifically:

- Heavy CI, which Cloudflare cannot host at any price, because Workers Builds caps
  at 20 minutes, 4 vCPU, 8 GB RAM and 20 GB disk [A6, verified by me at
  `developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/`].
- Long-running containers, which Cloudflare Containers can host but bills by the
  warm-hour whether or not anything inside is working [A2].
- Object storage, where the price depends entirely on the medium [A6, C2].
- Serverless functions you already wrote for Workers, which you can run unchanged
  on your own metal with `workerd` [A3].

### 1.2 The hard constraints, taken from the request

1. The dashboard and manager is hosted on Cloudflare itself and is manageable from
   there. This is a hard requirement and the design honours it.
2. The connection from Cloudflare to your machines is secure, and uses Cloudflare
   Tunnels or Cloudflare VPC.
3. The orchestration layer is something other than Cloudflare.
4. Some machines may run Cloudflare's own products such as `workerd` and be exposed
   through the tunnel.

### 1.3 Non-goals, stated so they are not built by accident

- Not multi-tenant. One operator, one account, one set of credentials. SSSA 2.2.1(a)
  restricts sharing and reselling, and a multi-user dashboard is a different product
  with its own account model [C6 R9].
- Not a general-purpose PaaS. No user signup, no per-customer billing, no
  self-serve provisioning.
- Not a replacement for Cloudflare's edge. The SPA still sits behind Cloudflare's
  CDN, WAF and DDoS protection, and that is a feature, not a compromise.
- Not an exit from Cloudflare. Section 9 describes the exit route and why it is
  parked.

## 2. Topology

```
                        +-----------------------------------------+
                        |            CLOUDFLARE EDGE              |
                        |  DNS, CDN, WAF, DDoS, TLS termination   |
                        +-------------------+---------------------+
                                            |
              +-----------------------------+-----------------------------+
              |                             |                             |
              v                             v                             v
    +-------------------+      +------------------------+      +-------------------+
    | Access (IdP)      |      | SPA static assets      |      | Access service    |
    | human login       |      | + Hono API in a Worker |      | token (machine)   |
    | + short-lived     |      |                        |      |                   |
    | SSH certs         |      |                        |      |                   |
    +-------------------+      +------------+-----------+      +---------+---------+
                                            |                            |
                                            |  vpc_services binding      |
                                            |  fetch() / connect()       |
                                            v                            v
                          +--------------------------+    +------------------------+
                          | Durable Objects          |    | Queues                 |
                          | Tier 1 only: sessions,   |    | job dispatch,          |
                          | fan-out, rate limiters   |    | pull consumers         |
                          +--------------------------+    +------------+-----------+
                                                                       |
                          +--------------------------+                 |
                          | R2 (artifacts, presigned |<----------------+
                          | URLs, small hot objects) |
                          +--------------------------+

  ====== ONE TUNNEL PER MACHINE, cloudflared DIALS OUT ON 7844 ======
                                            |
              +-----------------------------+-----------------------------+
              |                             |                             |
              v                             v                             v
    +-------------------+      +------------------------+      +-------------------+
    | BOX A            |      | BOX B                  |      | BOX C             |
    | orchestrator     |      | CI runners             |      | object storage    |
    | + control plane  |      | + microVM runtime      |      | + Valkey          |
    | DB               |      |                        |      |                   |
    | + dashboard      |      |                        |      |                   |
    | reuse (Komodo or |      |                        |      |                   |
    | Portainer)       |      |                        |      |                   |
    +---------+---------+      +------------+-----------+      +---------+---------+
              |                             |                            |
              |   private L3 between your own machines, NOT through    |
              |   Cloudflare: a WireGuard or Tailscale overlay         |
              +-----------------------------+----------------------------+

  --------- OUT-OF-BAND PLANE, OUTSIDE CLOUDFLARE ---------
  Hetzner Robot WOL and reset API (rate-limited), plus a WireGuard door
  on a non-standard port, plus a written runbook and a monthly drill.
```

Four properties of this diagram are load-bearing.

**cloudflared only dials out.** The required egress is TCP and UDP 7844 to
`region1.v2.argotunnel.com` and `region2.v2.argotunnel.com`. Port 443 is optional
and only for updates and Access JWT validation, and the docs state cloudflared runs
correctly without it [A1, verified by me]. No box needs a public IP, an inbound
firewall rule, or a DNS record pointing at it.

**One tunnel per machine, never one per job.** 1,000 tunnels per account are free,
then $4.50 per tunnel per month, and inactive tunnels still count toward the limit
[A1, B8]. A handful of machines is free forever. One tunnel per CI job is not.

**VPC Services, not VPC Networks, for every control-plane call.** A VPC Service
binds one host and one port and the runtime URL cannot redirect it. A VPC Network
takes the destination from the URL, so any user-influenced URL becomes an internal
port scan. Cloudflare states outright that VPC Services secure workloads and prevent
SSRF [A5, verified by me against the Workers VPC overview page].

**The private L3 between your own machines does not go through Cloudflare.** Node to
node traffic such as etcd peers, flannel VXLAN or Docker Swarm overlay needs a real
network path, not a tunnel [B3]. Use a WireGuard or Tailscale overlay for that, and
keep it off the control-plane path.

## 3. The Cloudflare side, component by component

### 3.1 The SPA and the API

Build it the current Cloudflare way: `@cloudflare/vite-plugin` plus Workers Static
Assets with a SPA routing fallback, targeting Workers directly rather than Pages,
which is being folded into Workers [B7, migration guide dated 2026-10-12].

- Requests to static assets are free and unlimited, and Cloudflare's own worked
  example prices a 15-million-request-per-month SPA at $5.00 total [A6, verified by
  me]. The $5 Workers Paid floor is the entire front-end cost.
- The one trap: with Workers Caching enabled, cache hits bill at the full
  per-request rate including static assets. Serve the SPA from a Worker with caching
  off, or from a route that bypasses the Worker [A6 2.5].
- The API layer is Hono. It runs natively on Workers, gives typed RPC, and is at
  v4.13.14 [B7]. React plus Vite for the UI, TanStack Start if you want one
  type-safe full-stack framework, Astro if the dashboard is mostly read views and
  you want the Cloudflare-backed adapter. OpenNext only if Next.js RSC is a hard
  requirement; it is the heaviest option [B7].
- The SPA is a thin client. Nothing on Cloudflare touches a Docker socket. It calls
  its own Hono API, which calls the Cloudflare API and reaches data-plane services
  only through the tunnel [B7 R2].

### 3.2 Authentication, and the two different mechanisms

There are two credential paths and they are not interchangeable. Conflating them is
the most common design error in this shape.

**Human browser to SPA: Cloudflare Access with an IdP.** Access is $0 up to 50 users
and $7 per user per month paid annually beyond that [A5]. Behind a tunnel with
Access token validation enabled, `cloudflared` validates the token for you, so the
origin does not have to [A5 1.5].

**Worker to private service: no Access at all.** Nothing in the Workers VPC path
injects a service token or an Access JWT. The binding is the only authorization
[A5 1.3]. "It came through the tunnel" is not an identity. The origin must
authenticate the Worker itself. Three workable patterns, in preference order:

1. mTLS at the origin, with your own CA. Access mTLS is an Access-application
   feature and does not apply to the VPC binding path, so run mTLS directly on the
   origin or on a sidecar [A5 2.3].
2. A bearer token held as a Worker secret and forwarded in a header. This is the
   pattern Cloudflare's own example leaves to the reader [A5 1.3].
3. An Access self-hosted private application plus a service token from the Worker.
   Works, but adds an Access application and a hostname to every internal call, and
   brings the strict-service-token behaviour with it [A5 2.3].

Recommendation: pattern 1 for anything that touches storage or CI, pattern 2 for
low-value internal APIs.

**Do not issue Access service tokens to CI runners.** A service token is a one-year,
identity-less, un-MFA-able bearer secret whose only revocation is deletion [C1 1.12].
Zero Trust organizations created on or after 2026-10-05 have strict service token
authentication forced on and cannot disable it: failures return 401 or 403 rather
than a 302, only Service Auth policies authorize, and no `CF_Authorization` cookie
is issued [A5 1.4]. The account cap is 50 service tokens [A5 1.14], so one token per
CI runner is not a plan. Mint short-lived scoped credentials inside the control
plane instead, and revoke them with a database write.

### 3.3 Durable Objects: Tier 1 only

Split the Durable Object decision in two and write the split down, because the
default instinct is to put everything in a DO.

**Tier 1, keep on Cloudflare.** Anything the dashboard itself needs for coordination
and session state: WebSocket fan-out for live build logs, per-tenant rate limiters,
the small strongly-consistent index the SPA reads. Use the Hibernation WebSocket API
from day one and `setWebSocketAutoResponse()` for ping and pong, so protocol traffic
never wakes the object. Cloudflare's own worked examples put the same message volume
at $20.65 per month with hibernation and $142.95 without it [A6 1.6, verified by me].

**Tier 2, move to your own metal.** Anything that is really a database or a job
queue wearing a DO costume. A single DO is single-threaded with a soft limit of about
1,000 requests per second, and D1 confirms each individual D1 database is backed by a
single Durable Object [A4]. A SQLite-backed DO caps at 10 GB per object on Paid, and
at the cap writes fail with `SQLITE_FULL` while reads and deletes keep working
[A4 1.6]. There is no Cloudflare REST API for DO storage: only namespace listing
exists, so there is no external inspection or repair [A4 1.7]. Durable Objects exist
in 10.76% of Cloudflare PoPs, so DO state is geographically pinned and never
relocates after creation [A4 1.8].

Long CI runs, container orchestration state and bulk artifact indexing belong on your
own Postgres, reachable over the tunnel, with the Worker as a client [C6 R3].

### 3.4 Queues: the control-plane to data-plane bridge

This is the cleanest primitive in the platform for your split and it is not obvious
from the product name. A Cloudflare Queue with an HTTP pull consumer can be pulled
from any machine, any language, over HTTPS, with an API token [A4 2.2].

```
POST /client/v4/accounts/{account_id}/queues/{queue_id}/messages/pull
{ "visibility_timeout_ms": 60000, "batch_size": 50 }
```

The token needs both `com.cloudflare.api.account.queues_read` and
`com.cloudflare.api.account.queues_write`, because acknowledging mutates queue state.
You get at-least-once delivery, backpressure through the 25 GB per-queue backlog, a
12 hour visibility timeout for long jobs, and dead-letter queues, without writing
any of it. Cost is $0.40 per million operations after 1 million included, and it
takes roughly 3 operations to deliver a message, so about $1.20 per million messages
[A4 2.2].

The design constraint: 128 KB message size. Job descriptors go in the message.
Payloads go in R2.

Design the control plane as a queue-plus-pull system rather than a request-time
fan-out. The Worker ceilings make fan-out a correctness problem rather than a
performance one: 6 simultaneous outgoing connections per request, 128 MB per
isolate, 30 seconds of CPU by default [C1 1.24].

### 3.5 R2, and why the bytes do not go through the Worker

Put build artifacts, container images and logs in R2. R2 has no egress fees at all,
10 GB-month plus 1 million Class A and 10 million Class B operations free per month,
5 TiB per object, and unlimited objects and buckets [A4 2.5, A6 1.1, verified by me].

Serve them through a Worker on a custom domain, never an `r2.dev` subdomain, which
is rate limited and explicitly not intended for production [A6 1.2].

The Cloudflare REST API for R2 is capped at 1,200 requests per 5 minutes across all
R2 REST operations on the account. Anything with throughput uses the S3-compatible
API or the Workers binding [A6 1.2].

**The upload path is presigned from day one, not retrofitted.** The zone plan caps a
request body at 100 MB on Free and Pro, 200 MB on Business, and there is no DNS-only
escape for a tunnel [B5 R4, C6 R7]. A tunnel-origin S3 endpoint cannot accept a
single-request PUT above that limit. The Worker presigns a short-lived R2 GET or PUT
URL and passes it in the request body, so the data-plane container stays stateless
and credential-free and no media bytes traverse the Worker [B8 3.8]. This is also the
cheapest possible answer to artifact traffic costs.

## 4. The transport layer

### 4.1 One remotely-managed tunnel per machine

Use `config_src: cloudflare`, never locally-managed, for anything the dashboard has
to manage. The dashboard and API can only edit the ingress rules of a remotely
managed tunnel; a locally-managed tunnel's config lives in a YAML file on your
machine and is invisible to the control plane [A1 2.1].

The control plane talks to the tunnel through three API surfaces and they are not
interchangeable [A1 2.2]:

| Surface | What it controls |
|---|---|
| `POST/GET/PATCH/DELETE /accounts/{id}/cfd_tunnel` | the tunnel object |
| `PUT /accounts/{id}/cfd_tunnel/{id}/configurations` | ingress rules and origin settings |
| `POST /accounts/{id}/teamnet/routes` | private network routes |

Published applications live in the first two. Private networks live in the third.
Note the CIDR-encoded route endpoints were removed on 2026-10-05, so code copied
from older tutorials will 404 [A1 2.2].

Limits that shape the design [A1, verified by me against the account-limits and
configuration pages]:

- 4 connections per replica, hard default in the source, and 25 replicas per tunnel.
- 50,000 private routes per account, raised from 1,000 on 2026-10-16.
- About 1 MB of ingress configuration per tunnel, roughly 5,000 to 10,000 published
  applications. Shard across tunnels rather than growing one config.
- 1,000 tunnels per account free, then $4.50 per tunnel per month, inactive tunnels
  included.
- The capacity model is port-bound, not CPU-bound: 2 dedicated hosts per location,
  4 GB RAM and 4 cores each, 50,000 ephemeral ports per host, `ulimit -n` at least
  70,000.

### 4.2 The tunnel token is the account's root credential

The token is `base64(json({a,s,t,e}))`, verified in `connection/connection.go` lines
79 to 104. It is an unsigned, unencrypted bearer credential whose secret field is
readable by anyone holding it [A1 F4]. Cloudflare's own words: anyone with the token
can run the tunnel. It is not tied to a machine, and rotation does not revoke live
connectors, so a compromised token keeps working until every replica is reinstalled
[C1 1.1].

Three consequences, all mandatory:

1. Use `--token-file` or `TUNNEL_TOKEN_FILE`, mounted read-only. Never `--token`,
   which puts it in the systemd `ExecStart` where every process on the host can read
   it from `ps`, `/proc`, the service file and shell history. The fix is still an
   open upstream issue, cloudflared#1539, filed 2025-10-13 [C1 1.2].
2. Never hand out `cert.pem`. It is account-wide, valid at least 10 years, and can
   delete or list every tunnel in the account [A1 F5]. The per-tunnel
   `<UUID>.json` never expires but only runs that one tunnel.
3. Treat a compromised Worker that holds a Cloudflare API token scoped to
   `Cloudflare One Connectors Write` as holding every tunnel token, because that
   permission is listed as required for `GET .../cfd_tunnel/{id}/token`. This is
   untested and it is the difference between one tunnel being compromised and all of
   them [C1 open question 4].

### 4.3 Turn on URL normalization now

From cloudflared 2026.10.0 you can normalize URLs before ingress matching. It is off
by default in 2026.10.0 and flips on by default for new releases on 2027-01-25 [A1
F6, verified by me against the tunnel changelog dated 2026-10-22]. It only changes
which ingress rule matches, for tunnels with Access-validation rules, but it is a
silent behaviour change if you have path-based routing. Set
`--disable-path-normalization=false` now rather than debugging it in January.

Also: every ingress list ends in a catch-all `http_status:404`. It is mandatory for
locally-managed configs and the API rejects configurations without one [A1 F5].

### 4.4 What the tunnel cannot carry

**gRPC does not work through a Tunnel public hostname.** Two Cloudflare pages state
that tunnel gRPC works only via private subnet routing, and Cloudflare Access
ignores gRPC through the reverse proxy entirely [B6 F13]. This kills Talos's
management API as a control-plane channel [B3 recommendation 5] and it kills the
Woodpecker agent-to-server gRPC leg if Woodpecker is behind a tunnel public hostname
[B6 R2]. The REST API of either works fine through a tunnel; only the gRPC leg is
affected, so a hybrid is possible.

**Long-lived TCP has a different documented path.** The protocols page says to use
Client-to-Tunnel for long-lived connections. That documentation was not read
[A1 open question 8].

### 4.5 The browser terminal

A Worker can be a WebSocket server and can proxy a WebSocket, but it cannot
terminate SSH [B4 3.2]. So the terminal in the SPA talks to a WebSocket endpoint
that terminates SSH somewhere on the data plane. Concretely: `ttyd` on each box,
behind a Cloudflare Tunnel hostname, with the SPA's terminal pane connecting through
a Worker that proxies to that hostname. `ttyd` is MIT, 12,562 stars, one static
binary, and `-H/--auth-header` delegates authentication to the Worker while
`-b/--base-path` lets it sit under a path prefix [B4].

The alternative, if you want to own the whole stack, is the single most reusable
file in the survey: `fosrl/newt/browsergateway/ssh.go`, an SSH-over-WebSocket
handler with a `mode=native` local-sshd switch and a `mode=proxy` arbitrary
host-and-port switch, plus per-target auth tokens [B4 3.3]. Note `fosrl/newt` is
AGPL-3.0 and `fosrl/cli` is not open source at all.

## 5. The data plane

### 5.1 Orchestrator: Nomad primary, k3s alternative

The requirement is "something other than Cloudflare" for orchestration. Both
candidates satisfy it. Nomad wins on API shape for this specific job [B3 2.3]:

- A complete REST API under `/v1/` with a Go client.
- `GET /v1/event/stream`, a resumable ndjson event stream with topic filters and
  per-topic ACLs. That is most of a dashboard's live view, already built.
- Parameterized jobs whose dispatch mints a unique job ID per run, with a dispatch
  payload. That is a CI job primitive already.

k3s wins on footprint and ecosystem: 1,596 to 1,606 MB for a server with workload and
275 MB for an agent at the 95th percentile on x86_64, Apache-2.0, 34,274 stars
[B3]. Its trap is documented and has a documented fix: `x509: certificate signed by
unknown authority` because the tunnel hostname is absent from the apiserver SAN
list. Fix with `--tls-san <tunnel-hostname>` before first start [B3 F19].

Nomad's costs are real and must be written into the decision:

- **Nomad is BUSL 1.1 with licensor IBM, not open source.** The additional use
  grant permits production use only if you are not competing with IBM's paid
  version [B3 F2]. If that matters to you, this is a hard blocker and the answer is
  k3s.
- Servers need sub-10 ms inter-member latency, which a tunnel path may break [B3 F8].
- CVE-2026-14373, CVSS 7.7, CWE-862: the Nomad Docker driver ignores
  `allow_privileged` when a job sets host namespace modes, so any authenticated job
  submitter reaches the host namespace. Fixed in CE 2.0.4 [B3 F9]. Put CI on a
  distinct node pool or Nomad datacenter with its own ACL token scope.
- With no `disconnect` block, an allocation on a node that misses heartbeats is
  marked `lost` and replaced. Set `lost_after` longer than a tunnel outage and
  `stop_on_client_after` longer than that, explicitly [B3 F10].

Rejected: Rancher and Sidero Omni on license and footprint, Talos as a control-plane
channel on the gRPC ground, Docker Swarm as the fallback rather than the plan,
MicroK8s on its snapd dependency and five-month release lag [B3 3].

Whichever you pick, copy Rancher's tunnel topology even though you reject Rancher
itself: `cattle-cluster-agent` opens a tunnel to a cluster controller inside the
management server and asks for only 50m CPU and 100Mi, and the Authorized Cluster
Endpoint is the documented answer to "what happens when the management plane is
down" [B3 3.7]. Build the equivalent: a small outbound-only agent per machine, a
control plane that never dials in, and a documented break-glass path that reaches the
data plane with the control plane switched off.

### 5.2 The PaaS layer on top: Coolify

Coolify is the only mainstream PaaS that combines a real externally callable REST
API v1 with scoped tokens and an IP allowlist, multi-host fleet management over SSH,
and first-class "connect this server via Cloudflare Tunnel" support [B2 3.1]. It is
Apache-2.0, 65,242 stars, v4.5.3 released 2026-10-28 [verified by me].

The SSH model is the decisive technical point. An SSH session runs fine over a
cloudflared access tunnel, whereas Docker Swarm clustering needs each node to reach
every other on 2377, 7946 and 4789, which a per-service tunnel topology does not give
you for free [B2 3.1]. That is why Dokploy and CapRover, which are both Swarm-based,
rank below it here despite being more polished.

Coolify's control plane is a stateful three-container stack, app plus Postgres 15
plus Redis 7. It cannot live on Workers. Run it on one small always-on box and put
that box behind a tunnel, so the Workers SPA reaches its API [B2 3.1].

Pilot candidate: LevelRail, 122 stars, Apache-2.0, one Go binary with embedded
Caddy, BuildKit, SQLite and React dashboard, reverse-dialed mTLS agents, scoped API
tokens, an MCP server with 240-plus tools, and CLI Cloudflare-tunnel commands. It is
the architecturally purest fit and it is immature: multi-node beta, tunnel behind a
flag, a known restart-policy gap [B2 3.2]. Time-box a pilot on one or two nodes.

### 5.3 CI: self-hosted GitHub Actions runners on your own metal

This is the primary recommendation and it rests on one fact that simplifies
everything else [B6 R1]:

**A self-hosted GitHub Actions runner needs only outbound HTTPS 443.** No inbound
ports, no tunnel for the data plane at all, no gRPC-over-tunnel problem. The runner
long-polls GitHub. This is the single biggest architectural simplification available
in the stated topology.

The rest of the case:

- The trigger API returns the run ID in the dispatch call, via the
  `return_run_details` boolean, yielding `workflow_run_id`, `run_url` and `html_url`.
  No polling to discover run identity [B6 F3].
- Self-hosted runners get a 5-day job limit against 6 hours for GitHub-hosted, plus
  24h queue time and 10,000 runners per runner group. Heavy CI is the designed case
  [B6 F2].
- The runner app is MIT and releases weekly.
- GitHub does the scheduling. Cloudflare only serves the SPA. Nothing about the
  build runs on Cloudflare. This satisfies the orchestration constraint cleanly.

Run `actions/runner` as a systemd service on each box, registered at org level with
labels for architecture and capability. Do not deploy actions-runner-controller
unless there is already a Kubernetes cluster to attach it to [B6 R1].

**If you want a control plane you own rather than GitHub's**, Woodpecker CI is the
best candidate: a ~20 MB server image on SQLite with no external dependencies, a
~16 MB agent that dials out, and a real REST API with trigger, cancel, approve,
decline, restart and step logs [B6 R3, F8, F9, F10]. Three configuration changes are
mandatory before it will work for you:

1. Raise `WOODPECKER_MAX_PIPELINE_TIMEOUT` above its default of 120 minutes, and
   `WOODPECKER_DEFAULT_PIPELINE_TIMEOUT` from 60, or every heavy build dies at two
   hours [B6 F11].
2. Use per-agent tokens rather than the system-wide shared secret, and server-side
   agent filters rather than agent-reported labels [B6 F12].
3. The Docker backend does no image cleanup, so schedule host-level pruning or the
   agent disks fill. Never use the Local backend on a host that runs untrusted code:
   a pipeline can read `WOODPECKER_AGENT_SECRET` [B6 F28].

And remember the gRPC constraint from section 4.4. The Woodpecker REST API, which
is what the SPA needs, tunnels fine. The agent-to-server gRPC leg does not.

### 5.4 Storage: SeaweedFS primary, R2 for hot and small

**R2 at $0.015/GB-month is cheaper per GB than a Hetzner 1 TB NVMe addon at about
$0.036/GB-month** [A6 2.1, C2]. The self-hosted storage argument does not survive on
NVMe. It survives on spinning disk at about $0.00195/GB-month, on a Hetzner Storage
Box at about $0.0024/GB-month for 20 TB, and on data residency and egress volume
[A6 2.1, C2 2.6].

So the honest storage design is a split:

- R2 for anything small, read-heavy, or needing free egress. Model it on reads, not
  on storage: Cloudflare's own asset-hosting example bills $104.40 per month for 290
  million Class B reads and $0 for storage and Class A [A6 2.7, verified by me].
- SeaweedFS for bulk and for anything that must not leave your hardware. Apache-2.0,
  Go, 35,802 stars, release 4.51 on 2026-10-25 [verified by me]. One `weed` binary,
  and `weed mini -dir=./data` gives a working S3 endpoint on one node. Object Lock
  and versioning are present, which Garage does not have. 247 MB idle memory across
  three containers [B5].

**Drop MinIO entirely.** The repository is archived, its README says it is no longer
maintained, the license moved to AGPL-3.0, and the successor AIStor Free is
proprietary and needs a license key [B5 R1, A6 2.4].

**Drop RustFS for now.** Apache-2.0 and past 1.0, but eight advisories in one batch
on 2026-10-18 including an Object Lock COMPLIANCE bypass that force-deletes a bucket
and destroys retained objects, an S3 policy bypass over its WebDAV, FTP and SFTP
listeners, a critical path traversal, and a hardcoded privileged token before
Alpha.78. Its documented target is 16 machines of NVMe behind 100 GbE [B5 R1].

**Garage is the best architectural fit and AGPL-3.0 blocks it.** 1 GB RAM, any
x86_64 from the last decade, CRDT metadata with no consensus bottleneck, tolerance
for nodes that change IP, a published OpenAPI admin API v2. But no versioning, no
Object Lock, eventually consistent, conditional PUT deliberately unsupported, and
the AGPL network clause engages if you offer storage as a service [B5 R3]. That is
one binary business question and it changes the recommendation.

**Dragonfly is legally unusable here, not merely unfashionable.** BSL 1.1 with an
Additional Use Grant that forbids making the work available as a service to third
parties, which is exactly the product being built. Use Valkey, BSD-3-Clause, 27,558
stars, shipping 9.1.3 [B5 R5]. KeyDB's last release is v6.3.4 from 2023-10-30 and
Redict is LGPL-3.0-only on Codeberg; both are dead [B5 R5].

**Use rqlite for control-plane state that needs HA.** MIT, one binary, Raft, plain
HTTP and JSON, hot and automated S3 backups, change data capture. Its own docs say
it is not for write-scaling, which is the correct trade for control-plane metadata
[B5 R6]. Use Litestream, Apache-2.0, for the SQLite backup path.

### 5.5 Untrusted CI runs in microVMs, not in containers

Cloudflare's own Containers put each container in a dedicated Firecracker microVM
and still had a cross-tenant data exposure in September 2026 through dm-thin with
`skip_block_zeroing` on a shared pool, recovering structurally complete SQLite
databases on 18 of 24 placements [A2 F62, C4 1.2]. Cloudflare's own sandbox docs say
a container is the smallest unit of trust and that every process inside it holds
root's capabilities [C6 R6].

Your CI jobs are at least as untrusted as Cloudflare's customers' code. So:

- Untrusted code runs in a microVM: Firecracker, Cloud Hypervisor or Kata, or under
  gVisor.
- On a host that runs nothing else.
- With no credentials in the guest. Follow Cloudflare's own published sandbox
  guidance literally: credentials live outside the execution environment, an
  outbound handler adds them per request, internet access is off by default, and
  every allowed destination is treated as an exfiltration channel [C1 1.17].
- Budget the numbers. Firecracker is at most 5 MiB VMM overhead per microVM, at most
  125 ms boot to `/sbin/init`, at most 5 microVM creations per host core per second,
  and a density floor of 256 MiB, not 128 MiB. The 125 ms assumes a minimal kernel
  and rootfs; a production Firecracker CI product reported under 1 to 2 seconds with
  Docker in the image [C4 1.8, 1.9].
- Firecracker pins the host kernel. Host kernel 6.18 is the newest supported line,
  and other kernels may behave unexpectedly [C4 1.10]. You need a kernel upgrade
  before anything else works.
- Do not fork a warm snapshot into a job. Firecracker's own words: resuming
  execution from the same state more than once is insecure, and after VMGenID
  reseeding, cached random numbers and cryptographic tokens are still replicated
  across microVMs [C4 1.7]. That is a cross-job credential-leak primitive.

**Use E2B Runtime as the reference implementation, not Firecracker directly.**
Apache-2.0, Go, 1,781 stars, pushed the day it was read. It ships control plane and
data plane separation, per-sandbox network namespaces plus nftables with SNI and Host
inspection, snapshot resume via `userfaultfd`, pause, resume, fork, and an Embed
package that runs the whole stack on one machine you own with no license key. Its
security posture is the one to copy: secrets are metadata-only on the control plane,
no value ever crosses the API, a log or a span, and they are resolved at sandbox
egress [A2 R7, C4 1.6].

gVisor cannot run a normal CI job: block-device filesystems are not natively
supported, KVM inside the sandbox is unsupported, and resource limits are not
enforced within the sandbox [C4 1.5].

### 5.6 workerd on your own metal: yes, with three conditions

You asked whether some machines can run Cloudflare's own `workerd` and simply be
exposed via the tunnel. Yes. `workerd` is Apache-2.0, written mainly in C++ with a
Rust CLI, 9,093 stars, 827 open issues, pushed 2026-10-29, with daily date-versioned
releases, latest v1.20261029.1 [A3, verified by me against the repository metadata].

It runs Workers-designed code unchanged. Tunnel fronting is config-native: bind a
Socket to `127.0.0.1:<port>` or a unix socket and point cloudflared at it. For
production, use systemd socket activation with `--socket-fd` and run workerd as an
unprivileged user [A3 2.2]. This is the cleanest expression of "data plane on own
metal, exposed via Cloudflare Tunnel".

Three conditions, and they are not optional:

1. **workerd is not a security sandbox.** Its own README states it does not contain
   suitable defense-in-depth against implementation bugs and that possibly-malicious
   code must run inside an appropriate secure sandbox such as a virtual machine.
   Isolates give logical, not security, isolation [A3 1.2]. Use workerd for your own
   trusted code. Never for tenant code.
2. **You own the V8 patch gap.** Cloudflare's hosted Workers patch gap is under 24
   hours. Self-hosting means you track V8 security releases and roll builds yourself.
   The date-stamped npm prebuilts are the low-effort path [A3 2.4].
3. **Resource governance is yours.** `workerd.capnp` has no CPU, memory, request or
   duration knobs, so the hosted Workers limits do not carry over. Enforce them
   outside workerd with cgroups, ulimits and an outer supervisor [A3 2.5].

Keep the SSRF posture tight: leave the default `Network allow=["public"]` and reach
your own-metal backends through explicit `ExternalServer` bindings rather than
opening `allow=["public","private"]` globally [A3 2.6].

Note also that the popular claim that workerd Durable Objects are in-memory only is
false and three and a half years stale. `durableObjectStorage.localDisk` stores each
object as `.sqlite` files on local disk and has been in the tree since 2023-02-17
[A4 1.1]. And cluster mode landed on main on 2026-10-29 as commit `aa494794`, PR
#7994: `Config.cluster` distributes DOs across processes using an S3-compatible
bucket for ownership and cold storage. It is not in any published release, requires
`--experimental`, and the commit states alarms are not supported yet [A4 1.2].

If you want a complete self-hosted Workers-plus-DO platform rather than raw workerd,
`denoland/celld` is Apache-2.0, Rust, 6,170 stars, v0.6.3 on 2026-10-21, and deploys
from an existing `wrangler.json` including DOs, KV, Queues, D1, R2, Workflows and
Cron [A4 2.1, verified by me]. It needs a bucket with working conditional writes,
and its qualified list names Amazon S3, Cloudflare R2, Tigris, GCS and Azure Blob,
with Backblaze B2, Hetzner Object Storage and DigitalOcean Spaces explicitly failing
[A4 1.10]. Whether SeaweedFS qualifies is untested and is an open question
[D1 Q27].

### 5.7 Out-of-band: the plane that is not Cloudflare

**The tunnel is not the power plane.** A powered-off machine has no cloudflared, so
the tunnel reports Down, and no Workers configuration changes that [C3 1.1].

**A Worker cannot send a Wake-on-LAN packet.** `connect()` gives outbound TCP only;
a magic packet is UDP or EtherType 0x0842 [C3 1.2]. So the wake mechanism lives
outside the Worker, on the always-on box.

Hetzner Robot is the power plane and it is rate-limited hard: `POST /wol/{n}` is 10
requests per hour, `POST /reset/{n}` with `type=hw` is 50 per hour, and 3 failed
logins blocks the IP for 10 minutes [C3 1.3]. A naive retry watchdog locks itself
out. Hetzner's last resort is a human: the KVM console is free for 3 hours, scarce
per data center, must be booked in advance, and ISO mounting is SMB/CIFS only [C3
1.4].

For provisioning, Talos answers "reinstall a machine I cannot reach" without
reinstalling: no shell, no SSH, no packages, signed sub-80-MB SquashFS, and
`talosctl reset` cordons, drains, erases disks and powers the node down [C3 1.7].
Kairos has a no-network pairing path: a QR code on the ISO encodes a base64 EdgeVPN
token, and `kairosctl register` pushes config over it [C3 1.8]. matchbox is stale,
last release v0.11.0 on 2024-03-24, so do not use it for new work [C3 1.6].

## 6. The four data paths

### 6.1 Dashboard read

```
browser -> Cloudflare edge -> Access (IdP, session) -> static asset or Worker
Worker -> Hono handler -> vpc_services binding -> tunnel -> origin service
origin -> mTLS or bearer check -> data -> back up the same path
```

### 6.2 Job dispatch

```
browser -> Worker -> Queue (job descriptor, under 128 KB)
box B pull consumer -> long-pull, batch 50, 12h visibility timeout
box B -> runs the job on the orchestrator, or on a GitHub Actions runner
box B -> ack, then write the result to R2 or to a DO-backed status key
box B -> Worker is notified by a Queue message or a DO alarm
```

The Worker never fans out at request time. It enqueues. That is a correctness
requirement, not an optimisation, because of the 6-connection and 30-second-CPU
ceilings [C1 1.24].

### 6.3 Artifact upload

```
browser -> Worker -> presign short-lived R2 PUT URL -> return it
browser -> PUT directly to R2, never through the Worker
box B -> reads from R2 over the S3 API
```

### 6.4 Human terminal

```
browser -> Worker (WebSocket server and proxy) -> tunnel hostname -> ttyd on box A
ttyd -> -H/--auth-header delegates auth to the Worker, -b/--base-path mounts a path
ttyd -> terminates SSH locally
```

## 7. Operations

### 7.1 Rotation, as a rehearsed runbook

The tunnel token rotation sequence from the Tunnel permissions page is: two
replicas, outside working hours, and it needs both live before either is retired
[C1 2.1]. Write it down and rehearse it. A token in a process table is readable by
every process on that host, and rotation does not revoke live connectors.

### 7.2 cloudflared supply chain

Pin cloudflared to a specific version and update deliberately, not automatically
[C1 2.12]. The binary is Apache-2.0 and buildable from source with `make cloudflared`
and Go 1.27.3 or later, so it can be built and pinned internally [A1 F2]. Because
the same binary is a known ransomware persistence tool, the control that makes a
rogue instance visible is egress allowlisting to `region1` and `region2` on 7844
plus an inventory of every host running it [A1 2.11].

Build the rogue-replica detector before the first production deploy: poll
`GET /accounts/{id}/cfd_tunnel` on a schedule, alert on any `connections[].origin_ip`
outside a pinned set, and alert on `client_version` drift. Ship the output somewhere
with history, because Cloudflare keeps none [C1 2.11]. The reason this matters: a
rogue replica receives a live share of production traffic, including
`CF_Authorization` cookies, because replicas are not traffic-steered and Cloudflare
routes to the geographically closest one [C1 1.3].

### 7.3 Break-glass, and the monthly drill

Cloudflare logged 49 incidents between 2026-10-13 and 2026-10-28, one of them
critical, totalling 1,523 critical and major minutes, with every one of the 16 days
carrying an incident [C6 1.1]. The critical one was on the exact path this design
depends on: "Cloudflare Zero Trust connectivity", 192 minutes on 2026-10-20, with
the Access API still degraded 28 minutes after the edge recovered [C6 1.2]. On
2025-11-18, Access auth failed for most users from 11:20 to 13:05 and new logins did
not work while existing sessions survived [C1 1.20].

So: build a second, independent door, and rehearse it monthly. A WireGuard or
Tailscale endpoint on a non-standard port, a runbook, and a drill that proves the
credential still works [C6 R1]. This is the single highest-value change in the
critique file.

### 7.4 Backup

SeaweedFS has no consistent online backup. `weed backup` requires stopping the whole
cluster, and `filer.backup` is replication, eventually consistent, and cannot be
synchronised with `filer.meta.backup`. The discussion "Consistent backups without
stopping cluster" is unanswered since 2026-03-17 [C6 1.9]. Design the backup path
around this, and do not assume the object store has one.

## 8. What replaces what

| Cloudflare product | Your replacement | Where it runs | Why |
|---|---|---|---|
| Workers (request-facing) | Keep on Cloudflare | Workers | Static assets free and unlimited, active-CPU-only billing, no egress charge [A6] |
| Workers (long-running, heavy) | `workerd` behind a tunnel | Your metal | Same runtime, same code, no 30-second CPU default [A3] |
| Workers for Platforms | `workerd` `workerLoader` binding plus `celld` dynamic Workers | Your metal | Only if multi-tenant code execution becomes a product feature [A4 2.6] |
| Containers / Sandbox | Nomad or k3s plus E2B Runtime for untrusted jobs | Your metal | Cloudflare Containers cannot reach your hardware at all; a container is reachable only through its own Durable Object [A2 R1] |
| Browser Rendering / Browser Run | self-hosted browserless or steel-browser, or Browser Run for spiky low volume | Your metal or Cloudflare | Browser Run meters $2.00 per browser above 10, averaged monthly from daily peaks, hard-capped at 200 [A2 R10] |
| R2 | R2 for hot and small, SeaweedFS for bulk | Both | R2 beats NVMe per GB; SeaweedFS wins on residency, egress and spinning disk [A6, B5] |
| Durable Objects | Tier 1 on Cloudflare, Tier 2 on Postgres or rqlite | Both | A DO is single-threaded at ~1,000 rps, caps at 10 GB, and has no REST API [A4, C6 R3] |
| Queues | Cloudflare Queues with HTTP pull consumers, or Valkey | Both | The pull consumer is the cleanest bridge and needs no tunnel for the data plane [A4 2.2] |
| Workers Builds (CI) | self-hosted GitHub Actions runners | Your metal | 20-minute, 4 vCPU, 20 GB disk hard cap, and the runner needs only outbound 443 [A6, B6] |
| Access (human) | Keep, with an IdP | Cloudflare | One login, and cloudflared validates the token for you [A5] |
| Tunnel | Keep | Cloudflare edge, cloudflared on your box | Free on all plans, no public IP, CDN and WAF in front [A1] |
| Orchestration | Nomad or k3s, wrapped by Coolify | Your metal | REST plus event stream plus parameterized dispatch [B3, B2] |

## 9. The exit route, parked

If you ever drop Cloudflare entirely, the category exists and it is crowded:
`denoland/celld` (Apache-2.0, Rust, 6,170 stars) for Workers and DOs,
`openworkers`, `wdl-dev/wdl` and `solcreek/creek` [B8 2]. All self-describe as early.
The recommendation is to not build in that direction: your hard constraint puts the
control plane on Cloudflare anyway, so the only question is which Cloudflare
primitives to use, and those are Workers, Durable Objects, Workers VPC, R2 and
Queues [B8 3.12].

Keep the exit cheap rather than building it. The concrete way is section 10's
swappable transport: every data-plane call goes through one internal client module
in the Worker, and that module is the only place a VPC binding appears.

## 10. Invariants

These are the properties that must hold regardless of which tool fills each slot.
A future session should treat a violation of any of them as a defect.

1. cloudflared dials out only. No box has a public IP or an inbound firewall rule
   for the control plane.
2. One tunnel per machine. Never one per job, per tenant or per container.
3. Remotely-managed tunnels only, `config_src: cloudflare`. A locally-managed tunnel
   is invisible to the control plane.
4. Every ingress list ends in a catch-all `http_status:404`.
5. The tunnel token is in a file, never in an environment variable or a command
   line, and `cert.pem` is never distributed.
6. VPC Services, not VPC Networks, for every control-plane call. A VPC Network is a
   separate Worker, with the URL treated as an allowlist check.
7. The origin authenticates the Worker. The tunnel is not an identity.
8. Access service tokens are never issued to CI runners. The control plane mints
   short-lived scoped credentials instead.
9. Authoritative state lives on your own Postgres. Cloudflare holds the SPA bundle,
   short-lived session data, a job queue and signed URLs.
10. Uploads are presigned from day one. No artifact above the zone body limit ever
    traverses a Worker.
11. The Worker enqueues; it does not fan out at request time.
12. Untrusted code runs in a microVM, on a host that runs nothing else, with no
    credentials in the guest and egress off by default.
13. Every data-plane call goes through one internal client module in the Worker, so
    the transport is swappable if Workers VPC changes or is withdrawn.
14. A second, independent door to the data plane exists, is documented, and is
    drilled monthly.
