# Critique

What to drop from the plan, why, and what to do instead. Negative results are recorded
as findings.

## 1. Drop: "the control plane is reachable only through Cloudflare"

Replace with a second, independent door, documented and drilled monthly.

Reason. Cloudflare logged 49 incidents between 2026-10-13 and 2026-10-28, one critical,
1,523 critical and major minutes, with every one of the 16 days carrying an incident
[C6 1.1]. The critical one was on the exact path this design depends on: "Cloudflare
Zero Trust connectivity", 192 minutes on 2026-10-20, with the Access API still degraded
28 minutes after the edge recovered [C6 1.2]. On 2025-11-18, Access auth failed for most
users from 11:20 to 13:05 and new logins did not work while existing sessions survived
[C1 1.20].

A WireGuard or Tailscale endpoint on a non-standard port, a runbook, and a monthly
drill. It does not have to be good. It has to exist and be exercised.

## 2. Drop: Workers VPC as a load-bearing dependency

Replace with a swappable transport behind one internal client module.

Reason. Workers VPC is a Beta Service, and section 5 of Cloudflare's Self-Serve
Subscription Agreement, verified by me against `cloudflare.com/terms/` on 2026-10-29,
reads: "We may discontinue, suspend, or remove Beta Services (including any of Customer
Content stored as part of the Beta Services) or your access thereto at any time in our
sole discretion and may never make them generally available... we will have no
liability for any harm or damage arising out of or in connection with any Beta
Services."

There is also no published GA price; see `docs/COST.md` section 9.

Every data-plane call goes through one internal client module in the Worker, that
module is the only place a VPC binding appears, and there is a second implementation
that talks plain HTTPS to a public hostname behind Access. If VPC Services disappear or
start charging, the change is one file.

## 3. Drop: Durable Objects as the system of record

Replace with authoritative state on your own Postgres, Cloudflare as cache and queue.

Reason. A SQLite-backed DO caps at 10 GB per object on Paid and 5 GB on Free, and at
the cap writes fail with `SQLITE_FULL` while reads and deletes keep working. Durable
Objects do not spawn in South America, Africa or the Middle East. State never relocates
after creation. And there is no Cloudflare REST API for DO storage at all, only
namespace listing, so there is no external inspection or repair [A4 1.6, 1.7].

## 4. Drop: "cheaper storage" as a claim about NVMe

Replace with a decision per medium.

Reason. R2 at $0.015/GB-month beats a Hetzner 1 TB NVMe addon at about $0.036/GB-month
[A6 2.1]. The self-hosted storage argument survives only on spinning disk at about
$0.00195/GB-month, on a Hetzner Storage Box at about $0.0024/GB-month for 20 TB, on
Backblaze B2 at $6.95/TB-month with free API calls and free egress to 3x storage, and
on data residency and egress volume.

## 5. Drop: the assumption that your own machines have good bandwidth

Replace with a named uplink and its monthly cap on every cost figure.

Reason. Cloudflare's free egress covers bytes leaving Cloudflare, not bytes leaving
your box. The win is real on an EX44 with unlimited traffic on a 1 GBit port and
fictional on a home connection [C6 R5]. 10 TB per month over 730 hours is 30.4 Mbps and
20 TB is 60.9 Mbps [D1 D18], both inside 1 Gbit, but a 100 Mbps consumer uplink is not.

## 6. Drop: untrusted CI in plain Linux containers on a shared host

Replace with microVMs, on a host that runs nothing else, with no credentials in the
guest and egress off by default.

Reason. Cloudflare's own Containers put each container in a dedicated Firecracker
microVM and still had a cross-tenant exposure in September 2026 through dm-thin with
`skip_block_zeroing` on a pool shared across accounts: a 4 KiB guest write into a fresh
64 KiB thin block left 60 KiB of the previous tenant's data readable via raw `/dev/vdc`.
2,700 foreign inodes were recovered across six placements, on 20 of 22 nodes across
four continents, including structurally complete SQLite databases [A2 F62, C4 1.2].
Cloudflare's own sandbox docs say a Linux container is not a boundary and that every
process inside has root's capabilities.

Your CI jobs are at least as untrusted as Cloudflare's customers' code. Firecracker
with block zeroing enabled plus per-sandbox nftables egress rules is the E2B Runtime
posture, and it is auditable locally [A2 R6].

## 7. Drop: the dashboard as a general file-upload surface

Replace with presigned uploads from the first commit.

Reason. Free and Pro cap request bodies at 100 MB, Business at 200 MB. A tunnel-origin
S3 endpoint cannot take a single-request PUT above the zone's plan limit and there is no
DNS-only escape for a tunnel [B5 R4, C6 R7]. Retrofitting presigned URLs after building
a proxy endpoint is the expensive version.

## 8. Drop: API polling as the reconciliation mechanism

Replace with a queue plus long-poll, with the 4 req/s ceiling budgeted in.

Reason. The account-wide Cloudflare API budget is 1,200 requests per 5 minutes, about 4
per second sustained, and a community report says exceeding it blocks the account for
five minutes. A control plane that polls 50 machines every 60 seconds spends 21% of the
entire budget on polling before any real work [C6 F11, F12].

## 9. Drop: the "single-tenant is simpler" framing

Replace with two separate, explicitly answered questions.

Reason. The design is single-tenant in the sense that one operator owns everything, and
multi-tenant in the sense that untrusted CI jobs share his kernel and his storage.
Conflating them hides the expensive one [C6 R9]:

- Will any human other than you ever use this dashboard? If yes, SSSA 2.2.1(a) is a
  problem and the product needs its own account model, which is a different product.
- Will untrusted code ever share a kernel with your credentials? If yes, that is the
  multi-tenant question, and the answer is microVMs.

## 10. Drop: a single set of tunnel tokens

Replace with rotation on a schedule, as a tested runbook.

Reason. SSSA 2.3 puts all activity under the credentials on the account holder, and a
tunnel token is a bearer credential for the account's whole private-network surface.
With one operator and one token set, a single leak is total [C6 R10].

The rotation sequence from the Tunnel permissions page is: two replicas, outside working
hours, both live before either is retired [C1 2.1].

## 11. Drop: "we will self-host everything"

Replace with three things staying on Cloudflare and the rest self-hosted deliberately.

1. **The static SPA.** Static asset requests are free and unlimited.
2. **Bursty request-facing compute.** Workers bills active CPU only, and Free gives
   100,000 requests per day.
3. **R2 for anything small, read-heavy, or needing free egress.**

Everything always-on, memory-heavy, disk-heavy or egress-heavy belongs on your metal.
The split line is per resource, not per product [C6 R11].

## 12. Drop: silence on the terms of service

Replace with a written position covering four clauses, verified by me against
`https://www.cloudflare.com/terms/` on 2026-10-29:

- **SSSA 2.2.1(j):** "use the Services to provide a virtual private network or other
  similar proxy services." A description of a tunnel plus VPC Networks. Enforcement
  against single-tenant use is unknown. Cloudflare's own product description calls
  Tunnel a "VPN replacement and private network access", which does not settle it.
- **SSSA 2.2.1(c):** no circumventing service-specific usage limits, quotas or other
  restrictions. Forecloses the multi-account escape hatch.
- **SSSA 2.2.1(a):** no sharing or reselling. Gates any multi-user dashboard.
- **SSSA section 5:** Beta Services and any Customer Content stored as part of them may
  be removed at any time in Cloudflare's sole discretion, with no liability.

Write down what you believe you are permitted to do and what you will do if Cloudflare
disagrees. Silence here is the most expensive item in this file, because the remedy is
a suspension notice rather than a bug report [C6 R12].

## 13. Things that are not wrong but are priced or built wrong

**"Cloudflare Containers as the data plane."** Structurally impossible. A container is
reachable only through the Durable Object bound to it, the DO-to-container hop is
Cloudflare-internal, there is no remote container binding, no BYOC and no node agent,
and customers cannot select the underlying host [A2 R1].

**"Cloudflare Sandboxes for long jobs."** The lifetime model is hostile. Code inside the
container does not count as activity, the inactivity timeout does not survive a DO
restart, Cloudflare never wakes the DO when its instance stops, and all disk is
ephemeral unless snapshotted. Memory and disk bill on provisioned resources for the
whole time the instance runs, including when nothing inside is working: a `standard-2`
idles at roughly $0.057 per warm sandbox-hour [A2 R3, R4].

**"MinIO as the self-hosted S3."** Archived, AGPL-3.0, README says no longer maintained
[B5 R1].

**"Dragonfly as the cache."** BSL 1.1 with an Additional Use Grant forbidding offering
the work as a service to third parties [B5 R5].

**"Traefik's REST API to push routes."** Removed in v2 and v3. Its REST API is
introspection-only [B7 2].

**"Nomad is open source."** BUSL 1.1 with licensor IBM [B3 F2].

**"CoreObs's API can be exposed to a Workers SPA."** No `middleware.ts` exists, and
`/api/servers/monitoring` and `/api/servers/get` read Prisma with no token check.
Exposing it as-is leaks the whole inventory [E2 1.6].

**"Homelable can be the data-plane agent."** There is no agent. Three processes, one
SQLite file, entirely pull-only, LAN-scoped discovery, and the project's own doc says
it is "meant for a LAN. Do not expose it to the internet." Issue #465 has been asking
for the agent since 2026-09-10 with zero comments [E1 1.2, 1.3, 1.7].

**"omnyssh can be the agent."** No server, no daemon, no headless mode, no HTTP
listener. Its CLI has three flags and no subcommands [E3 1.1, 1.2].

**"cfrs can replace cloudflared now."** It cannot. I read the source: `cmd_tunnel`
provisions a quick tunnel and returns, and `src/tunnel/mod.rs` states that registration
and visitor serving are not implemented. `cfrs serve` reaches the internet only through
`free.pinggy.io`, a third-party relay that can read the traffic [E6 1.1, 1.2].

## 14. Negative results, recorded as findings

**The claim that workerd Durable Objects are in-memory only is false and three and a
half years stale.** `durableObjectStorage.localDisk` stores each object as `.sqlite`
files on local disk and has been in the tree since 2023-02-17, with no `--experimental`
flag needed. The popular claim traces to a sample comment last touched 2023-03-07
[A4 1.1]. The assertion was wrong, not the code.

**"experimental_configureRuntime" is not a workerd feature.** Absent from
`workerd.capnp` and from a code search of the repository. The real gating is the
`--experimental` flag plus compatibility flags [A3 2.10].

**"MinIO is the safe default."** The safe default is archived [B5 R1].

**"Self-hosted object storage is cheaper."** Only on spinning disk. See section 4.

**"A self-hosted Workers runtime is needed."** It is not, and the category is crowded
and early [B8 3.12].

**"Rathole or frp is a simpler cloudflared."** rathole has no API and has not shipped a
SemVer release since 2023-10-01, and frp needs a public IP for the server component and
gives you no identity layer [A1 2.12, B4 3.5].

**"Garage is the best S3 replacement."** Architecturally yes, and AGPL-3.0 blocks it
without legal sign-off. It also has no versioning and no Object Lock, and conditional
PUT is deliberately unsupported [B5 R3].

**"Homelable's MCP server is a control plane."** It is a third FastAPI process on
:8001, 25 tools, re-exporting the backend's REST API to AI clients behind a
non-expiring root key the docs say to firewall to the LAN [E1 1.10].

**"ServerBee's agent can be reused wholesale."** It has no tunnel, no broker, no
container creation, no CI and no storage. Those four gaps are the net-new work, and the
AGPL licence governs any distribution [E4 1.8, 1.10].

**"mirrord proves one binary is the answer."** Its CLI is 106,792,688 bytes unstripped
on Linux x86_64. It proves the opposite: adopt the component split, not the binary
[E5 1.9].

## 15. Open questions the spec cannot answer

The full list of 34 is `research/D1-synthesis-gaps.md` section 3. The ones that would
change the work:

1. **Workers VPC price at GA.** The entire control-plane-to-data-plane path is an
   unpriced line item.
2. **Whether SSSA 2.2.1(j) is enforced against a single-user private-network tunnel.**
3. **Whether SeaweedFS satisfies `celld`'s storage requirements.** `celld` needs
   conditional create, conditional overwrite, read-after-write consistency and ranged
   reads; its qualified list names Amazon S3, Cloudflare R2, Tigris, GCS and Azure
   Blob, with Backblaze B2, Hetzner and DigitalOcean Spaces explicitly failing.
   SeaweedFS is in neither list. Close by running `celld diagnose` against a SeaweedFS
   bucket [D1 Q27].
4. **Whether a raw TCP tunnel rule reliably carries gRPC plus mTLS.** Gates both
   Woodpecker and Talos [D1 Q31].
5. **S3 request throughput and latency through a Cloudflare Tunnel.** Decides whether
   storage sits behind the tunnel at all [D1 Q33].
6. **Whether your machines sit somewhere with a real uplink.** One sentence closes it
   [D1 Q13].
7. **Whether you intend to let any other human use the dashboard, or offer storage to
   third parties as a service.** Gates the SSSA 2.2.1(a) analysis and the Garage
   decision [D1 Q17].
8. **A real figure for human operational cost.** The shape is documented: cloudflared
   releases every one to three days with guidance to pin it, SeaweedFS ships about 4.3
   releases a month, the kernel has a live unpatched escape in supported Ubuntu LTS,
   and the storage layer has no consistent online backup. Measure your first three
   months and write the number down [C6 open question 7].
9. **Container-escape CVEs found but not read:** CVE-2026-31431, CVE-2026-34040 and the
   November 2025 runc breakout set. Each needs a primary read before the runtime for
   untrusted CI is chosen [C6 open question 4].
10. **Access authentication log retention.** Detecting a rogue replica depends on logs
    being exported immediately [C1 open question 1].
11. **Whether cfrs's edge codec actually works against the real edge.** It has never
    been driven. This is the single largest unknown in the cfb-node plan, and it is
    closeable only by running it [E6 1.4].
12. **Whether `cfrs`'s cross-host control protocol can be completed.** Its codec exists
    but nothing binds the control socket, so the virtual network is a namespace rather
    than a network. The author's own priority list calls this the one worth doing
    [E6 1.7].

## 16. What was not covered

- No benchmark. Nothing in this repository measures a running system. Every
  performance figure is a vendor or project claim, attributed.
- No account created, no Worker deployed, no tunnel run, no container started, no
  orchestrator installed.
- Five papers in `research/C5-academic-prior-art.md` are metadata-only because ACM PDFs
  returned 502 twice through the reader.
- `research/A1-cloudflare-tunnels.md` did not read the Client-to-Tunnel documentation,
  which the protocols page names as the path for long-lived TCP.
- `research/A3-workerd.md` did not build or run workerd, so its performance claims are
  vendor or third-party, and the exact live npm version is unverified.
- No legal interpretation of any Cloudflare term. Clauses are quoted, not construed.
- Hetzner AX idle and maximum power draw were published on the page but the model
  mapping did not survive extraction, and no file contains a mini-PC price, wattage or
  electricity rate [D1 Q11, Q12].
- `cfrs` could not be compiled in this environment: every writable scratch filesystem
  is mounted `noexec`. Its test suite was counted, not run [E6 1.5].
