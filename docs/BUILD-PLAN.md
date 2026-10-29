# Build plan

A phased order with a go/no-go gate at each phase. The gates exist because two of the
load-bearing decisions rest on facts nobody has checked yet, and both are cheap to
check.

## Phase 0. Close the two blocking questions, before writing code

Two days of reading and two emails. Do these first because each can invalidate a
component choice.

**Gate 0a. The ToS question.** Send Cloudflare support one question: does SSSA
2.2.1(j), "use the Services to provide a virtual private network or other similar
proxy services", apply to a single-tenant private network reached only by its owner
through Cloudflare Tunnel and Workers VPC? Their answer determines whether the
transport layer in `SPEC.md` section 4 is viable at all. Until you have it, treat the
answer as unknown and keep the transport swappable.

**Gate 0b. The AGPL question.** One sentence, from yourself: do you intend to offer
storage to other people as a service? If yes, Garage and Silo are out on the AGPL
network clause and SeaweedFS is the only answer. If no, or with legal sign-off, Garage
becomes the better architectural fit [B5 R3].

**Gate 0c. The uplink.** Name where the machines live and what the monthly bandwidth
cap is. Every cost figure in `docs/COST.md` assumes a 1 GBit unmetered port.

While you wait for the answers, do the things that are independent of them: buy the
EX44 or equivalent, install the OS, and stand up the break-glass WireGuard door and
drill it once.

## Phase 1. The second door, before anything else

Deliverables:

- A WireGuard or Tailscale endpoint on a non-standard port, on a machine that is not
  behind Cloudflare.
- A runbook: how to reach every box with Cloudflare switched off.
- One drill, completed and dated, proving the credential works.

Gate: you can SSH to every box with Cloudflare's dashboard closed. This is the gate
that matters most and it is the cheapest.

## Phase 2. The tunnel, correctly

Deliverables:

- One remotely-managed tunnel per machine, `config_src: cloudflare`.
- The tunnel token in a file, mounted read-only, never in an `ExecStart`.
- cloudflared pinned to a specific version, with a deliberate update procedure.
- Egress allowlisting to `region1.v2.argotunnel.com` and `region2.v2.argotunnel.com`
  on 7844.
- An inventory of every host running cloudflared.
- Every ingress list ending in a catch-all `http_status:404`.
- `--disable-path-normalization=false` set now, ahead of the 2027-01-25 default flip.
- The rogue-replica poller: `GET /accounts/{id}/cfd_tunnel` on a schedule, alerting on
  `origin_ip` outside a pinned set and on `client_version` drift, with history
  somewhere, because Cloudflare keeps none.

Gate: a box you have never logged into can be reached from your laptop through the
tunnel, and the poller reports a known set of origins.

## Phase 3. The orchestrator and the CI runners

Deliverables:

- Nomad, or k3s with `--tls-san <tunnel-hostname>` set before first start. If Nomad,
  the `disconnect` block with `lost_after` and `stop_on_client_after` set explicitly,
  and CI on a distinct datacenter with its own ACL token scope, because of
  CVE-2026-14373.
- A private L3 overlay between your own machines, for etcd peers and node-to-node
  traffic. Not through Cloudflare.
- Self-hosted GitHub Actions runners as a systemd service, registered at org level
  with labels.
- Coolify on one small always-on box, its API reachable through the tunnel, and its
  SSH-managed nodes enrolled.

Gate: a workflow triggered from GitHub completes on your own metal, and the same
workflow is triggerable from a `curl` against the GitHub API with
`return_run_details: true`.

## Phase 4. The Worker, thin

Deliverables:

- The SPA on Workers Static Assets, served from a Worker with caching off so static
  asset requests stay free.
- Hono as the API layer.
- Access in front, with an IdP, and HttpOnly plus SameSite plus `CF_Binding` set
  explicitly on the application cookie.
- **One internal client module for every data-plane call.** This is the module
  invariant 13 protects. Write it first, before there are two call sites.
- A second implementation of that module talking plain HTTPS to a public hostname
  behind Access, exercised by a test, even if it is never used in production.
- Presigned R2 URLs for every upload path. No artifact ever proxied through the
  Worker.

Gate: with the VPC binding commented out and the fallback module selected, the
dashboard still works. If it does not, the transport is load-bearing and you have a
defect.

## Phase 5. The state split

Deliverables:

- Postgres on your own metal, reachable over the tunnel, as the system of record.
- rqlite in front of it if you need HA for control-plane metadata.
- Tier 1 Durable Objects only: sessions, fan-out, rate limiters, with WebSocket
  Hibernation and `setWebSocketAutoResponse()` from day one.
- Queues with HTTP pull consumers for job dispatch, and the 128 KB message limit
  designed around rather than discovered.

Gate: with Cloudflare's Durable Objects unavailable, the dashboard degrades to
read-only from cache and loses no authoritative state.

## Phase 6. Storage

Deliverables:

- SeaweedFS, one node, `weed mini -dir=./data` for the S3 endpoint, admin surface left
  bound to loopback.
- Valkey for cache and queues.
- Litestream for SQLite backup paths.
- A backup design that accounts for SeaweedFS having no consistent online backup:
  `weed backup` requires stopping the whole cluster, `filer.backup` is eventually
  consistent and cannot be synchronised with `filer.meta.backup`, and the upstream
  discussion has been unanswered since 2026-03-17.
- Multipart enforced, with a part size well under the zone body limit.

Gate: a restore, tested, with a timestamp.

## Phase 7. The sandbox plane, only if you run untrusted code

Deliverables:

- E2B Runtime in Embed mode on one machine you own, or Firecracker directly with the
  host kernel upgraded to a supported line first.
- Per-sandbox network namespaces plus nftables with SNI and Host inspection.
- Credentials as metadata only on the control plane, resolved at sandbox egress.
- No forking of a warm snapshot into a job.
- The host kernel checked against Firecracker's supported list before anything else.

Gate: a CI job with no credentials in the guest can reach exactly one allowed
destination and nothing else.

## Phase 8. The dashboard, last

Deliverables:

- Komodo or Portainer behind the tunnel, driven by its API.
- nginx-proxy-manager or Caddy for API-driven ingress and TLS, with Caddy's admin
  endpoint authenticated.
- ttyd on each box, behind a tunnel hostname, with `-H/--auth-header` delegating auth
  to the Worker and `-b/---base-path` mounting a path.
- Access for Infrastructure for human SSH, with short-lived certificates.
- The SPA as a thin client over the Hono API. Nothing on Cloudflare touches a Docker
  socket.

Gate: you can start a container, watch its logs and open a terminal on the box, all
from the SPA, with no inbound port on any machine.

## Phase 9. The review, at three months

Re-run `docs/COST.md` with your real numbers. Measure the operator-hours you actually
spent and write the figure down; no research file could supply it and it is probably
your largest real cost. Re-read the amika repository, because its tunnel layer was the
active development front on 2026-10-28 and the gateway was promised "soon". Re-check
whether Workers VPC has reached GA and what it now costs.

## What is deliberately not in this plan

- Building a self-hosted Workers runtime. Parked as an exit route [B8 3.12].
- Building a tunnel relay. Workers VPC Services are the answer, and the amika codec is
  the fallback, not the primary path.
- Multi-user IAM. Out of scope until somebody other than you needs a login.
- Migrating off Cloudflare. The exit route is kept cheap by invariant 13, not built.
