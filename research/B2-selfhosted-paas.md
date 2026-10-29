# B2: Self-hosted PaaS as the data-plane orchestrator

Scope: Coolify, Dokploy, CapRover, Dokku, "Porthos", plus newer entrants. Question to
answer: which is the best "orchestrator" for long-running containers on the operator's own
metal, driven remotely over a Cloudflare Tunnel / VPC, with the control plane kept off the
data plane and the dashboard SPA living on Cloudflare Workers.

Read date for every source below: 2026-10-29 (UTC, from `date -u` on the host). All GitHub
figures come from `gh api` calls made this session. Method note: the pkgforge tinyfish
search gateway worked for all web searches. `web_fetch` pinned to tinyfish returned HTTP 422
for the Coolify API-reference page, the CapRover api.html and cluster-mode pages, and the
Dokploy multi-nodes page, so I fell back to reading the repositories directly via `gh api`
(routes, source tree, README, docker-compose). Those fallbacks are named inline. Reading the
repo is the stronger source anyway.

---------------------------------------------------------------------------------------------
## 1. Findings

### Porthos: no such self-hosted PaaS is identifiable (honest negative)

- Claim: There is no recognizable open-source self-hosted PaaS named "Porthos".
- Evidence: `gh api search/repositories?q=porthos+paas` returned zero items. A tinyfish web
  search for "porthos self-hosted paaS github" surfaced only spoorcc/porthos, which is
  "An embedded linux robot" (language C, GPL-3.0, 0 stars, open_issues 1, last push
  2017-08-19T13:17:31Z) - unrelated to a PaaS. [verified that no PaaS by that name exists]
- Label: [verified] (the negative). I did not invent a Porthos product. If the operator meant
  a specific private or very obscure project, it is not discoverable via GitHub search or the
  web gateway from here.

### Coolify (coollabsio/coolify) - the strongest default fit

- Claim: Mature, API-first, multi-host PaaS with first-class Cloudflare Tunnel server support.
- Evidence:
  - Repo: coollabsio/coolify. Stars 65237. License Apache-2.0. Language PHP (Laravel).
    open_issues 319. pushed_at 2026-10-29T10:30:43Z. Latest release v4.5.3, published
    2026-10-28T14:09:53Z (releases v4.5.2 and v4.5.1 on 2026-10-28 and 2026-10-27). Repo size
    ~104.7 MB. Homepage coolify.io. Not archived. [verified]
  - REST API: `routes/api.php` defines a `v1` group guarded by `auth:sanctum`,
    `api.token.team`, `api.ability:write`, and `api.ip.allowed` middleware. Controllers
    include ApplicationsController, DatabasesController, ServersController, DeployController,
    ServerProxyController, ServerCloudflareTunnelController, S3StoragesController,
    VolumeBackupsController. So there is a real, scoped, token-authenticated REST API v1 that
    an external Workers SPA can call. [verified]
  - Multi-host: docs page "Servers overview" (fetched via tinyfish, 2026-10-29) states Coolify
    manages a connected server through SSH, with server roles localhost / deployment server /
    build server, and: "The server can use a reachable IP address, hostname, or Cloudflare
    Tunnel." Validation installs/verifies Docker Engine and Docker Compose on the remote host.
    [verified]
  - Ingress/TLS: Traefik is the proxy. Source has many Traefik actions (GetTraefikCertificates,
    RestoreTraefikAcmeBackups, CheckTraefikVersionCommand, SeedDevelopmentTraefikCertificates)
    and a ServerProxyController, i.e. Traefik + ACME/Let's Encrypt. [verified]
  - README: "You only need an SSH connection"; manage resources "through the dashboard, API,
    CLI, MCP, and team-based access controls." So it also ships an MCP server. [verified]
  - Control-plane footprint: docker-compose.yml defines three services: `coolify` (app),
    `coolify-db` (postgres:15-alpine), `coolify-redis` (redis:7-alpine). Stateful stack, needs
    an always-on host; cannot run on Workers. [verified]

### Dokploy (Dokploy/dokploy) - strong runner-up, Swarm-based, dual-licensed

- Claim: Polished multi-node PaaS on Docker Swarm + Traefik, API/CLI driven; enterprise
  features gated behind a source-available license.
- Evidence:
  - Repo: Dokploy/dokploy. Stars 38109. Language TypeScript. open_issues 746. pushed_at
    2026-10-29T10:24:20Z. Latest release v0.30.10, published 2026-10-22T18:25:09Z. Repo size
    ~35.1 MB. Homepage dokploy.com. Not archived. [verified]
  - License (important): GitHub reports NOASSERTION. Root has LICENSE.MD and
    LICENSE_PROPRIETARY.md. LICENSE.MD: "Copyright 2026-present Dokploy Technology, Inc.";
    content outside `/proprietary` is Apache-2.0; anything under `/proprietary` is under the
    "Dokploy Source Available license (DSAL) v1.0", which states the Software "may only be
    used in production, if you ... have agreed to ... a valid commercial agreement from
    Dokploy." So the free/open core is Apache-2.0 but paid/enterprise features require a
    commercial license for production use. [verified]
  - API: two surfaces. (1) Management is tRPC over HTTP in the main app. (2) `apps/api` is a
    separate Hono (`@hono/node-server`) service that uses Inngest as a deployment queue
    ("Dokploy Deployment Service"); a `.github/workflows/sync-openapi-docs.yml` workflow syncs
    OpenAPI docs. README advertises "CLI/API: Manage your applications and databases using the
    command line or through the API." So it is API-drivable, but the management API is tRPC
    (not a plain REST resource API), and `apps/api` is specifically the deploy-queue worker.
    [verified]
  - Multi-host: README "Multi Node: Scale applications to multiple nodes using Docker Swarm to
    manage the cluster." Source has cluster UI (modify-swarm-settings, show-cluster-settings,
    swarm-forms) and swarm tests (swarm-nodeid-injection, cluster/registry-node-injection).
    [verified]
  - Ingress/TLS: README "Traefik Integration: Automatically integrates with Traefik for routing
    and load balancing." [verified]
  - Control-plane stack: app + Traefik confirmed. Postgres and Redis are part of a standard
    Dokploy install per general documentation, but I could not confirm the exact images from a
    committed compose file (root compose files returned empty via `gh api contents`, and
    install.sh is generated). Mark the exact Postgres/Redis images [unverified].

### CapRover (caprover/caprover) - Swarm + nginx + Let's Encrypt, license has an appendix

- Claim: Heroku-on-Swarm PaaS with a REST API, nginx ingress, built-in Let's Encrypt.
- Evidence:
  - Repo: caprover/caprover. Stars 15195. Language TypeScript. open_issues 176. pushed_at
    2026-10-26T04:35:10Z. Latest release v1.15.5, published 2026-10-23T17:46:07Z (v1.15.4 on
    2026-08-30, v1.15.3 on 2026-08-20 - roughly monthly cadence). Repo size ~46.9 MB. Homepage
    CapRover.com. Not archived. [verified]
  - License (important): GitHub NOASSERTION. LICENSE is Apache-2.0 "Copyright 2017-2024 BigZee
    Ventures LLC" plus an Appendix that supersedes the Apache terms in conflict: paid features
    of CapRover (as a service) cannot be modified without a written agreement; no
    redistribution of another paid version; modifications of free features "should be
    distributed as free & opensource software." [verified]
  - API: Express REST routers under src/routes (AppsRouter, AppDefinitionRouter, WebhooksRouter,
    OneClickAppRouter, SystemRouter, ProjectsRouter). Plus the `caprover` CLI and a Node SDK.
    [verified]
  - Multi-host / clustering: README "Docker Swarm under the hood for containerization and
    clustering." [verified]
  - Ingress/TLS: README "Nginx (fully customizable template) under the hood for load-balancing"
    and "Let's Encrypt under the hood for free SSL (HTTPS)"; also "NetData under the hood" for
    monitoring. So nginx (not Traefik) is the ingress. [verified]
  - Control-plane footprint: runs as a container on the Swarm leader/captain node plus nginx;
    no external database required for the core (state is on the leader). Light-to-moderate.
    [verified for nginx+swarm; exact DB-less claim is consistent with README, not separately
    profiled - treat precise RAM as unverified].

### Dokku (dokku/dokku) - lightweight single-host primitive, not a fleet orchestrator

- Claim: The smallest, most stable single-host PaaS; CLI-over-SSH; no first-party REST API and
  no native multi-host fleet orchestration.
- Evidence:
  - Repo: dokku/dokku. Stars 32208. License MIT. Language Go. open_issues 34. pushed_at
    2026-10-29T06:19:04Z. Latest release v0.38.32, published 2026-10-25T03:17:32Z. Repo size
    ~27.6 MB. Not archived. [verified]
  - Interface: README documents SSH-key based deploy and CLI administration
    (`dokku ssh-keys:add`, `dokku domains:set-global`). A `gh api search/repositories?q=dokku
    rest api org:dokku` returned nothing, i.e. no first-party REST API in the core org. There
    are community API plugins, but none verified here. [verified: no first-party REST API found]
  - Multi-host: none native (single-host by design). Topics include kubernetes/nomad, but the
    product is single-host. [verified]
  - Build/ingress: buildpacks / Cloud Native Buildpacks / Dockerfile deploys; Let's Encrypt is
    a plugin. Lightest footprint of the set (no external DB for the core). [verified]

### LevelRail (glincker/levelrail) - newer entrant, most aligned with the tunnel split

- Claim: New, Apache-2.0, single-binary control plane with reverse-dialed mTLS node agents and
  built-in Cloudflare Tunnel support; the closest architectural match to "control plane off the
  data plane, data plane behind NAT via a tunnel". Immature.
- Evidence:
  - Repo: glincker/levelrail. Stars 122. License Apache-2.0. Language Go. open_issues 5.
    pushed_at 2026-10-29T09:09:26Z. Latest release v0.8.6, published 2026-10-27T05:44:36Z.
    [verified]
  - Architecture (from AGENTS.md and ADRs, read via `gh api`): "one Go control plane, one Go
    node agent, Docker's Engine API, embedded Caddy and BuildKit, SQLite state, and a React
    dashboard embedded in the control plane binary." Binaries: cmd/levelrail (control plane),
    cmd/levelrail-agent (node agent), cmd/levelrail-cli, cmd/levelrail-mcp. [verified]
  - Agent connectivity (the key property): ADR `003-reverse-dialed-agent-mtls` - the agent
    reverse-dials out to the control plane over mTLS. ADR `032-csr-only-agent-enrollment` and
    `021-agent-cert-lifecycle` cover CSR-based enrollment and cert rotation. Because the agent
    dials outbound, a data-plane node behind NAT/CGNAT needs no inbound port, which is exactly
    the Cloudflare-Tunnel-friendly topology. [verified from ADR file names + AGENTS.md]
  - Ingress/TLS: "embedded Caddy"; HTTPS self-signed by default, Let's Encrypt when enabled.
    [verified]
  - API/tooling: scoped API tokens (ADR `012-scoped-api-token-abilities`); CLI subcommands
    include cloudflare_tunnel, apps_tunnel, nodes_multinode; MCP server `levelrail-mcp` with
    "over 240 tools" and modes agent-core/read-only/standard/full. [verified]
  - Maturity (from docs/feature-status.md, evidence gathered 2026-09-26, re-checked 2026-10-05):
    Single node is "production ready". Multi-node and WireGuard are "beta" - join flow verified
    locally across two Docker daemons, but "the WireGuard mesh itself and cross-host remote
    transport are still unverified." Cloudflare tunnel feature is "hide-behind-flag"
    (reconciler unit tests only, needs a real Cloudflare account). Data-plane-without-control-
    plane resilience is beta; known gap: "containers use restart policy `no`, so a host reboot
    during an outage leaves apps down; agents do not buffer telemetry." Control-plane HA is via
    SQLite WAL shipping (ADR `039-control-plane-ha-wal-shipping-vs-postgres`); state is embedded
    SQLite (ADR `007-sqlite-embedded-state`, `009-sqlite-backed-metrics-store`). [verified]
  - Footprint: lightest of the set - one Go binary containing control plane + embedded dashboard
    + embedded Caddy + BuildKit + embedded SQLite. No external Postgres/Redis for the control
    plane. [verified]

### Other newer entrants (metadata + one-line characterization)

- Kubero (kubero-dev/kubero): Stars 4455. GPL-3.0. TypeScript. open_issues 127. pushed_at
  2026-10-13. "Self-hosted PaaS ... running on Kubernetes." README: "runs with two containers
  on any Kubernetes instance (kubero-ui and Operator). All data is stored on your Kubernetes
  etcd without an extra database." Has API & CLI, GitOps review apps. Last release date not
  fetched this session [unverified]. Relevant only if B3 picks k8s (k3s/k0s). [verified except
  release date]
- Canine (CanineHQ/canine): Stars 2940. Apache-2.0. Ruby. open_issues 52. pushed_at
  2026-10-28T19:09:43Z. "A developer friendly PaaS for your Kubernetes"; web UI + git push,
  custom pod templates (YAML). Zero GitHub releases (`releases` length = 0) - ships by other
  means [verified: no GitHub releases]. Requires a k8s cluster. [verified]
- Temps (gotempsh/temps): Stars 876. Apache-2.0. Rust. open_issues 15. pushed_at
  2026-10-29T11:32:49Z. "AI-native open-source alternative to Vercel + Sentry + PostHog +
  Pingdom + Resend + E2B ... one self-hosted Rust binary", 440+ CLI operations. Last release
  date not fetched [unverified]. Broader than a PaaS (observability/email/sandboxes bundled).
  [verified except release date]
- Moonshed (SiddheshNan/moonshed): Stars 0. AGPL-3.0. Go. pushed_at 2026-10-27. "A small,
  self-hosted platform (PaaS) ... One binary and SQLite. Runs on Linux and Windows." Brand new
  and untested; note AGPL-3.0. [verified]
- Also surfaced but not deep-dived: better-paas (sumon-ohid/better-paas, TypeScript, 57 stars,
  "Deploy any apps from Cursor / Claude Code with scoped tokens"), PortOS (atomantic/PortOS),
  Octelium (k8s PaaS). Metadata for these is from search snippets, [unverified].

---------------------------------------------------------------------------------------------
## 2. Comparison table

All numbers from `gh api`, read 2026-10-29. "Tunnel-friendly" means data-plane nodes can join
without inbound ports and without a flat node-to-node L3 mesh.

| Tool | Stars | License | Lang | Last release | Multi-host model | API to drive it | Ingress / TLS | Control-plane footprint | Tunnel-friendly | Maturity |
|---|---|---|---|---|---|---|---|---|---|---|
| Coolify | 65237 | Apache-2.0 | PHP | v4.5.3 (2026-10-28) | SSH-managed deployment + build servers | REST /api/v1 (Sanctum scoped tokens, IP allowlist) + CLI + MCP | Traefik + Let's Encrypt | 3 containers: app + Postgres 15 + Redis 7 | High (server can connect via Cloudflare Tunnel; SSH not Swarm overlay) | Very high, releases every few days |
| Dokploy | 38109 | Apache-2.0 core + DSAL proprietary | TS | v0.30.10 (2026-10-22) | Docker Swarm multi-node | tRPC + apps/api (Hono/Inngest) + OpenAPI + CLI | Traefik (auto) | app + Traefik (+ Postgres/Redis per docs, images unverified) | Low (Swarm overlay needs node-to-node 2377/7946/4789) | High, active |
| CapRover | 15195 | Apache-2.0 + appendix | TS | v1.15.5 (2026-10-23) | Docker Swarm cluster | Express REST routers + caprover CLI + Node SDK | nginx (customizable) + Let's Encrypt + NetData | container on Swarm leader + nginx, no external DB | Low (Swarm overlay) | Medium-high, ~monthly |
| Dokku | 32208 | MIT | Go | v0.38.32 (2026-10-25) | none (single-host) | CLI over SSH; no first-party REST API found | plugin-based Let's Encrypt | lightest single-host, no external DB | High per-host, but no fleet control | Very high, stable |
| LevelRail | 122 | Apache-2.0 | Go | v0.8.6 (2026-10-27) | reverse-dialed mTLS agents (beta) | REST (scoped tokens) + CLI + MCP (240+ tools) | embedded Caddy; self-signed or Let's Encrypt | one Go binary + embedded SQLite + embedded dashboard | Highest (agent dials out; built-in CF tunnel, behind flag) | Low (single-node prod-ready, multi-node beta) |
| Kubero | 4455 | GPL-3.0 | TS | not fetched | Kubernetes | API + CLI | k8s ingress | 2 containers (ui + operator), state in etcd | Depends on k8s (B3) | Medium-high |
| Canine | 2940 | Apache-2.0 | Ruby | none (0 GitHub releases) | Kubernetes | web UI + git push (REST not confirmed) | k8s ingress | runs on a k8s cluster | Depends on k8s (B3) | Medium |

---------------------------------------------------------------------------------------------
## 3. What this changes for the spec

1. Default orchestrator = Coolify. It is the only mainstream PaaS that combines (a) a real,
   externally callable REST API v1 with scoped tokens and an IP allowlist the Workers SPA can
   use, (b) multi-host fleet management over SSH rather than a Swarm overlay, and (c) explicit
   first-class "connect this server via Cloudflare Tunnel" support (ServerCloudflareTunnelController
   plus the docs statement). The SSH model is the decisive technical point: an SSH session runs
   fine over a cloudflared access tunnel, whereas Docker Swarm clustering needs each node to
   reach every other on 2377/7946/4789, which a per-service tunnel topology does not give you
   for free. Coolify's control plane is a stateful 3-container stack (app + Postgres + Redis),
   so it cannot live on Workers; run it on one small always-on box and put that box behind a
   tunnel (or on a cheap VPS) so the Workers SPA can reach its API. That satisfies the
   "orchestration layer is not Cloudflare, dashboard is on Workers" split.

2. Pilot / architecturally-purest option = LevelRail. Its reverse-dialed mTLS agent (ADR 003)
   plus embedded SQLite + embedded Caddy + embedded dashboard in one Go binary is the exact
   shape of "control plane off the data plane, data plane behind NAT via tunnel, cheapest
   possible footprint." It also has scoped API tokens, an MCP server (240+ tools), and CLI
   Cloudflare-tunnel commands. But it is 122 stars, v0.8.x, multi-node beta, the tunnel feature
   is behind a flag, and it has a known restart-policy gap. Recommend a time-boxed pilot on one
   or two nodes, not the safe default, and re-evaluate as it matures.

3. Runner-up = Dokploy, but only if you accept Swarm. It is the most polished TypeScript PaaS
   with Traefik and an API/CLI, but Swarm overlay networking fights the tunnel-only topology,
   and the enterprise features are under the DSAL (production use of `/proprietary` features
   needs a paid commercial agreement). If the data-plane nodes are on a flat private network /
   VPC with real L3 between them, Dokploy becomes more attractive.

4. CapRover is viable and mature, with the cleanest "just works" TLS story (nginx + Let's
   Encrypt built in) and a real REST API + CLI. Same Swarm-over-tunnel caveat as Dokploy, plus
   the license appendix restricts modifying/redistributing paid features. Fine if you want
   nginx rather than Traefik.

5. Keep Dokku as a per-host primitive, not the orchestrator. It is MIT, tiny, and extremely
   stable, but it is single-host with a CLI-over-SSH interface and no first-party REST API, so
   it cannot be the fleet control plane that a Workers SPA drives. Use it (or its buildpack/
   CNB/Dockerfile pipeline) as the runtime on an individual box if you ever want to drop the
   higher-level PaaS.

6. If topic B3 lands on Kubernetes, the PaaS-on-top options are Kubero (2 containers, state in
   etcd, API+CLI, GPL-3.0) or Canine (Apache-2.0, Ruby, needs k8s, no GitHub releases). Decide
   that after B3; do not pick a k8s PaaS before the scheduler (k3s/k0s/Nomad) is chosen.

7. Licensing flags to carry into the spec: Dokploy's open core is Apache-2.0 but paid features
   are DSAL (production use requires a commercial agreement); CapRover is Apache-2.0 with an
   appendix restricting modification/redistribution of paid features. If the operator wants to
   repurpose or resell pieces, Coolify (clean Apache-2.0), Dokku (MIT), LevelRail (Apache-2.0),
   and Canine (Apache-2.0) are the least encumbered.

---------------------------------------------------------------------------------------------
## 4. Not covered / open questions

- Porthos: could not identify any self-hosted PaaS by that name. Need the operator to point at
  the exact repo/URL if it exists.
- Dokploy's exact control-plane images (Postgres/Redis versions) are unverified - no committed
  compose file was readable this session. Confirm before sizing.
- Kubero and Temps last-release dates were not fetched this session (unverified). Canine has
  zero GitHub releases, so its release/maturity cadence is unverified.
- CapRover's precise RAM/CPU footprint was not profiled; only the architecture (leader + nginx,
  no external DB) is verified.
- Resource-use numbers (actual RAM/CPU at idle) for Coolify, Dokploy, CapRover, LevelRail were
  not measured here; only container counts and stack composition are verified. Real footprints
  need a live measurement on the operator's boxes.
- Whether Coolify's per-server Cloudflare Tunnel path supports the Workers SPA calling the
  Coolify API through the same tunnel (i.e. API reachable via cloudflared access) is inferred
  from the tunnel feature and the API.ip.allowed middleware, not end-to-end tested. Needs a
  proof-of-concept.
- LevelRail's multi-node/WireGuard cross-host transport and its Cloudflare tunnel feature are
  self-labeled beta / behind-flag; not validated on a real WAN. Its restart-policy "no" gap
  matters for long-running containers that must survive a host reboot.
- Overlap with B3: if a real scheduler (k3s/k0s/Nomad/Swarm) is chosen there, the PaaS layer
  may be redundant. B2 assumes a PaaS is wanted to avoid operating a scheduler directly; that
  assumption should be reconciled with B3's recommendation.
