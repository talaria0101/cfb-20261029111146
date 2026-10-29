# E2-coreobs: crocofied/CoreObs (product "CoreControl")

Research subagent E2-coreobs. All figures below come from calls actually made on 2026-10-29
via `gh api` (authenticated as talaria0101) against github.com/crocofied/CoreObs. No
web_fetch/web_search fallback was needed; every tinyfish/gh call succeeded. Anything not
read from a primary source is labelled [unverified].

Repo identity, read 2026-10-29 from https://api.github.com/repos/crocofied/CoreObs:
- owner/repo: crocofied/CoreObs. Product name is "CoreControl"; Go module is
  github.com/corecontrol/agent; Docker images are haedlessdev/corecontrol and
  haedlessdev/corecontrol-agent. Author/copyright: Damian Bergemann (handle haedlessdev).
- stars: 1296; forks: 37; watchers: 1296; subscribers: 9.
- license: MIT (Copyright 2025 Damian Bergemann).
- primary language (linguist): TypeScript. The monitoring agent is Go.
- default_branch: main. Second branch: corecontrol. archived: false. repo size: ~11 MB.
- created_at: 2025-04-11T10:28:24Z; pushed_at: 2026-02-13T23:23:02Z.
- last release: v1.0.1, published 2025-04-30 (release has no binary assets). 13 releases
  total, v0.0.1 (2025-04-13) through v1.0.1 (2025-04-30); all with empty asset lists.
- open issues: 0 (has_issues: true). contributors: 2 (crocofied 34 commits, pixitha 1).
- homepage: https://corecontrol.xyz

## 1. Findings

### F1. Two-branch split: a frozen product and an unshipped rewrite [verified]
`main` (default) is a from-scratch backend rewrite. Its recent commits are "Bun + Elysia
setup" (2026-02-10), "Prisma ORM setup" (2026-02-10), "Register 1/2", "Team and Role
models" (2026-02-12), "Register 2/3" (2026-02-13). The `main` tree contains only
`backend/` + `screenshots/` + `.github/`: no frontend, no agent, no servers/apps/network
modules. `backend/package.json` is version "1.0.50" and uses Bun + Elysia + Prisma 7
(`@prisma/client ^7.3.0`, `@prisma/adapter-pg`, `pg ^8.18.0`, `elysia latest`). It is
incomplete: registration itself is unfinished ("Register 2/3"), and `backend/src/index.ts`
only mounts the auth module plus role seeding.
The shipped product lives on the `corecontrol` branch and the `v1.0.1` tag. `corecontrol`
is 8 commits ahead of `v1.0.1` (files: FUNDING.yml, README.md, two auth routes,
package-lock, package.json, schema.prisma); its last substantive commit is 2025-05-17, and
the only 2026 change is a README edit (2026-02-09). So the usable code is corecontrol /
v1.0.1, and `main` is a dead-end WIP that deleted the frontend and agent.
Evidence: https://github.com/crocofied/CoreObs/branches ;
https://github.com/crocofied/CoreObs/commits ;
https://github.com/crocofied/CoreObs/blob/main/backend/package.json ;
https://github.com/crocofied/CoreObs/blob/main/backend/src/index.ts ;
https://api.github.com/repos/crocofied/CoreObs/compare/v1.0.1...corecontrol

### F2. Maturity: effectively dormant, not archived [verified]
Last release 2025-04-30; the shipped product is feature-frozen since 2025-05-17; the only
2026 activity is an incomplete, unreleased backend rewrite. Only 2 contributors ever.
Community noticed: issue #99 "where is the maintainer of the repo" (created 2025-07-15,
closed). 0 open issues today. Verdict: treat as a stable snapshot to learn from, not a
dependency to build on. It is not dead (not archived, README touched Feb 2026) but there is
no shipping cadence and no maintainer bandwidth visible.
Evidence: https://github.com/crocofied/CoreObs/releases ;
https://github.com/crocofied/CoreObs/issues/99

### F3. Shipped stack [verified]
`corecontrol` / v1.0.1: Next.js 15.3.0, React 19 (App Router), Prisma 6.6/6.7 +
`@prisma/client` on PostgreSQL, `@xyflow/react` 12.5.5 (React Flow network graph),
Chart.js 4.4.9, Radix UI + shadcn + Tailwind CSS v4, next-intl 4.1.0, jsonwebtoken,
bcryptjs, js-cookie, axios, fuse.js, lucide-react, sonner. Agent: Go 1.19.
`next.config.ts` sets no `output` mode, so it builds a standard Node server (`next start`),
not a static export and not standalone.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/package.json ;
https://github.com/crocofied/CoreObs/blob/corecontrol/next.config.ts

### F4. Runtime topology: shared database, not an API [verified]
`compose.yml` defines three services: `web` (haedlessdev/corecontrol:latest, port 3000,
env JWT_SECRET + DATABASE_URL), `agent` (haedlessdev/corecontrol-agent:latest, env
DATABASE_URL only), `db` (postgres:17). Both `web` and `agent` point at the SAME
DATABASE_URL. Integration between the Next.js backend and the Go agent is the Postgres
schema, not a REST/gRPC contract. The web image is Node 20 Alpine running `next start`
with `prisma migrate deploy` on boot.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/compose.yml ;
https://github.com/crocofied/CoreObs/blob/corecontrol/Dockerfile

### F5. The agent is a central poller, not a per-server agent [verified]
One Go process (`agent/cmd/agent/main.go`) opens a pgx connection to Postgres and runs
ticker loops: server monitoring every 5s, application uptime every 10s, notification-config
reload every 60s, old-entry cleanup every 1h, test-notification drain every 10s. Each tick
it reads the target list FROM Postgres and writes results BACK to Postgres. It never dials
a control plane and exposes no broker. To monitor N servers you run ONE agent that polls all
of them; you do not run one agent per server.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/agent/cmd/agent/main.go ;
https://github.com/crocofied/CoreObs/blob/corecontrol/agent/internal/database/database.go

### F6. Server metrics are scraped from Glances, not collected in-process [verified]
`agent/internal/server/monitor.go` issues plain HTTP GETs to each server's `monitoringURL`:
`/api/4/cpu`, `/api/4/mem`, `/api/4/fs`, `/api/4/uptime`, `/api/4/gpu`,
`/api/4/sensors/label/value/Composite`. These are the Glances REST API v4 endpoints, and
the response structs (CPUResponse.total, MemoryResponse.percent, FSResponse[].percent,
TemperatureResponse.Composite) are Glances JSON shapes. So CoreObs delegates all host metric
collection to Glances (nicolargo/glances) and only parses/stores the result.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/agent/internal/server/monitor.go ;
https://github.com/crocofied/CoreObs/blob/corecontrol/agent/internal/models/models.go

### F7. Per-host dependency is a Python Glances container, and it needs inbound reachability [verified]
Docs (docs/general/Servers.md) tell the user to install Glances on every monitored server as
`nicolargo/glances:latest` with `GLANCES_OPT=-w --disable-webui`, port 61208, `pid: "host"`,
and `/var/run/docker.sock` mounted read-only. The monitoring URL format is
`http://<IP_OF_SERVER>:61208`, and the docs explicitly warn: "make sure that CoreControl can
reach the specified API URL of Glances." That is a heavy per-host Python runtime plus a hard
requirement that the poller have direct network reachability to each host's 61208. There is
no tunnel, no dial-out, no agent on the monitored host itself.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/docs/general/Servers.md

### F8. Application uptime model [verified]
`agent/internal/app/monitor.go` does an HTTP GET (5s timeout) to `publicURL`, or
`uptimecheckUrl` when set. Online = status 200-399. Special case: if the host is a bare IP
and the failure is a TLS hostname/authority error, it is still marked online (tolerates
self-signed certs on IP endpoints). State transitions fire notifications; results go to
`uptime_history`.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/agent/internal/app/monitor.go

### F9. Notifications: 7 channels, all driven by the Go agent from Postgres [verified]
Discord webhook, Telegram, Ntfy, Gotify, Pushover, Email (SMTP via gopkg.in/gomail.v2), and
Echobell. Config is read from the `notification` table every 60s; the agent sends on
online/offline transitions and drains a `test_notification` table for "send test" from the
UI. Templates are stored in `settings` (`notification_text_server`,
`notification_text_application`) with `!name`/`!status`/`!url` placeholders.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/agent/internal/notifications/notifications.go ;
https://github.com/crocofied/CoreObs/blob/corecontrol/prisma/schema.prisma

### F10. Data model (prisma/schema.prisma) [verified]
- `server`: self-referential virtualization via `host` (bool) and `hostServer` (Int?, points
  at the parent host). Carries static hardware (cpu/gpu/ram/disk/os/ip/url) plus denormalized
  live fields (online, cpuUsage, ramUsage, diskUsage, gpuUsage, temp, uptime) and
  `monitoring` (bool) + `monitoringURL`.
- `server_history`: time series (online, cpuUsage, ramUsage, diskUsage, gpuUsage, temp).
- `application`: serverId, name, icon, publicURL, localURL, uptimecheckUrl, online.
- `uptime_history`: applicationId, online, createdAt.
- `settings`, `notification`, `test_notification`.
- `user`: uuid id, unique email, password. Single admin only; NO roles or teams in v1.0.1
  (roles/teams are exactly what the unfinished Feb 2026 rewrite was adding).
- Retention: `DeleteOldEntries` prunes uptime_history and server_history older than 30 days.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/prisma/schema.prisma

### F11. The network diagram is computed, not stored [verified]
`GET /api/flowchart` derives a React Flow `{nodes, edges}` document from the tables: a root
node "My Infrastructure", physical servers (those with no hostServer) as level 2, per-server
services (applications) on the left, VMs (servers whose hostServer points here) in the middle,
and VM applications on the right, with auto-computed x/y layout and dashed container frame.
Topology comes entirely from `server.hostServer` + `application.serverId`. There is no stored
graph and no layout persistence.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/app/api/flowchart/route.ts

### F12. API surface: ~25 Next.js route handlers, JSON REST [verified]
Under `app/api/`: applications/{add,delete,edit,get,search,uptime}; auth/{login,validate,
edit_email,edit_password}; dashboard/get; flowchart; notifications/{add,delete,get,test};
servers/{add,delete,edit,get,hosts,monitoring,search}; settings/{get_notification_text,
notification_text}. Login (`app/api/auth/login/route.ts`) returns `{token}`: a JWT signed
with JWT_SECRET, payload `{ account_secret: userId }`, 7-day expiry; first-run auto-creates
admin@example.com/admin (bcrypt-hashed). The token is kept client-side in a cookie (js-cookie
is a dependency).
Evidence: https://github.com/crocofied/CoreObs/tree/corecontrol/app/api ;
https://github.com/crocofied/CoreObs/blob/corecontrol/app/api/auth/login/route.ts

### F13. The data API is effectively unauthenticated [verified]
There is no `middleware.ts` anywhere in the `corecontrol` tree, so no global route
protection. `GET /api/servers/monitoring` and the head of `/api/servers/get` read Prisma and
return data with no token check; the JWT is only issued at login and verified at the
`/api/auth/validate` endpoint. I verified two data routes and the absence of middleware; I
did not audit every route individually, but the pattern is consistent. Consequence: exposing
this API to a Workers-hosted SPA as-is would publish server inventory, IPs, metrics and
uptime to anyone who can reach it.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/app/api/servers/monitoring/route.ts ;
https://github.com/crocofied/CoreObs/blob/corecontrol/app/api/servers/get/route.ts ;
https://github.com/crocofied/CoreObs/blob/corecontrol/app/api/auth/validate/route.ts

### F14. Footprint [verified, except binary size]
- web: Node 20 Alpine + `next start`; needs a Node runtime and a reachable Postgres. Not a
  static bundle, not standalone, not Workers-compatible.
- agent: small static Go binary. `agent/Dockerfile` builds with CGO_ENABLED=0,
  `-ldflags="-w -s"`, multi-arch (amd64, arm64, arm/v7) on alpine, runs as `nobody:nobody`,
  GOMAXPROCS=1. Direct deps are minimal: pgx/v4 v4.18.1, godotenv v1.5.1, gomail.v2.
  Exact compiled size: [unverified] (not built here).
- db: postgres:17.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/agent/Dockerfile ;
https://github.com/crocofied/CoreObs/blob/corecontrol/agent/go.mod

### F15. License: MIT, no copyleft consequence [verified]
MIT (Copyright 2025 Damian Bergemann). Safe to fork, vendor, modify and relicense without
source-disclosure obligations. This is the opposite of the AGPL situation on some peers (see
E4-serverbee) and is the friendliest license in this research set for embedding pieces.
Evidence: https://github.com/crocofied/CoreObs/blob/corecontrol/LICENSE

### F16. No CI gate [verified]
The `v1.0.1` tree lists `.github/` with CODE_OF_CONDUCT.md, CONTRIBUTING.md, FUNDING.yml,
ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md, config.yml. No `.github/workflows/` directory is
present, so there is no automated test/build gate in the repo.
Evidence: https://github.com/crocofied/CoreObs/tree/v1.0.1/.github

### F17. It cannot run on Cloudflare Workers as-is [verified, from the stack]
Next.js API routes + server-side Prisma + a persistent Postgres connection + a long-lived Go
agent are all incompatible with the Workers request model. Only the browser SPA could be
served from Workers (static export or OpenNext-style adapter); the data plane cannot.
Evidence: F3, F4, F14 above.

## 2. What this changes for the redesign

Written against the two new requirements: (a) portability of application code between
Cloudflare and the self-hosted backend, and (b) one small agent binary per server instead of
many heavy ones.

R1. Keep CoreObs off the "portability of application code" critical path. CoreObs is a
monitoring/visualization dashboard, not a compute, storage or Workers-runtime platform. You
do not deploy user application code onto it, so requirement (a) does not apply to it. Its
value is as a design reference for two of the redesign's pieces: the dashboard SPA and the
data-plane agent. Do not let it become a dependency on the "run the same code on CF or on my
metal" path.

R2. Reuse the data model and the derived-graph pattern; reimplement the backend on Workers.
The `server` / `application` / `*_history` schema and the self-referential `server.hostServer`
virtualization relation are a clean, small model for "my infrastructure." Port that shape to
D1 / Durable Objects / KV rather than running Next.js + Postgres. Copy the /api/flowchart idea
exactly: derive the network graph on read from a parent relation (server -> VM -> app) instead
of storing a graph or layout. That gives the Workers SPA a single JSON endpoint that renders
the topology, with no server-side rendering and no Node.

R3. The Go agent is the right skeleton for the single-agent-binary, but two changes are
mandatory to satisfy requirement (b). (1) Collection: CoreObs scrapes Glances (a Python
container) on every host. That is the opposite of "one small binary per server." Replace it
with in-process collection in the agent itself (read /proc, /sys, syscalls) so the one binary
per server both collects its own metrics and reports them, with no Python and no second
container. (2) Write path: CoreObs's agent writes into a shared Postgres and needs inbound
reachability to each host's Glances port. Invert it. The agent should dial OUT through the
Cloudflare Tunnel and push to a Workers ingest endpoint (a Durable Object or a Queue). The
shared-database coupling (F4/F5) does not fit Workers and does not fit "agent dials out," so
do not carry it over.

R4. CoreObs is the "before" picture that justifies the tunnel/broker agent (see E6-cfrs). It
demonstrates the exact operational pain the operator is removing: to monitor anything you
must expose 61208 on every host or run the poller inside every network. The redesign's single
agent should be the thing that dials out (cfrs quick-tunnel, or a TUN device), so no inbound
port and no per-host Glances are needed. Frame CoreObs as evidence of the problem, not as the
solution.

R5. Do not copy the open API. CoreObs ships unauthenticated data routes with no middleware
(F13). The Workers-hosted control plane must authenticate every route (Cloudflare Access
service tokens, mTLS, or signed requests) and must authenticate the agent's dial-out. This is
a concrete, evidence-backed warning, not a stylistic note: CoreObs's own default posture would
leak the whole inventory.

R6. Pin, do not track. Because the project is dormant and `main` is a broken WIP (F1/F2), if
any CoreObs code is reused, vendor it from the `corecontrol` branch or the `v1.0.1` tag under
the MIT license, and do not depend on upstream releases. Never build on `main`: it has no
frontend and no agent.

R7. Multi-tenancy is not available. v1.0.1 is single-admin with no roles or teams (F10). If
the operator needs multiple users or per-user scoping, that work exists only as an unfinished
rewrite (F1) and must be built, not adopted.

## 3. Not covered / open questions

- Exact compiled size of the Go agent binary: [unverified]. Would require `go build` of
  agent/cmd/agent. The dependency set (F14) implies a small static binary, but no number is
  claimed here.
- Per-route auth coverage: I verified two data routes lack a token check and that no
  middleware exists (F13). I did not open every one of the ~25 routes. A full audit would
  confirm whether any route does enforce the JWT.
- Liveness of https://corecontrol.xyz and the VitePress docs site: not fetched. Repo-level
  activity is what the aliveness verdict (F2) rests on.
- Fate of the `main` rewrite: unknowable from the repo. It looks abandoned (no commits since
  2026-02-13, registration still unfinished), but only the author can confirm.
- Metric fidelity and CPU/memory overhead of Glances-scraping versus in-agent /proc
  collection: not benchmarked. That comparison is needed before committing to R3's collection
  rewrite.
- Cross-check with E4-serverbee: ServerBee (Rust agent + server, agent dials out) appears to
  already implement the "one small agent per server plus an aggregator" pattern that CoreObs
  only approximates. Whether CoreObs's data model or ServerBee's transport is the better base
  is left to the synthesis pass; this file only establishes what CoreObs is.
- CSRF posture of the cookie-stored JWT (js-cookie) and whether the SPA and API are ever
  split across origins: not analyzed.
- I did not fetch or read the issue bodies beyond titles/states, nor the CONTRIBUTING/CODE_OF_CONDUCT
  content; none of it bears on the architecture questions asked.
