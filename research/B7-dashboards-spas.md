# B7 - Dashboards, SPAs and the Workers control-plane UI stack

Research subagent: B7-dashboards-spas
Read date for every source below: 2026-10-29 (UTC). All GitHub figures come from
`gh api` calls run on 2026-10-29; all web/doc claims come from the pkgforge
tinyfish gateway (`search.web.pkgforge.dev` / `read.web.pkgforge.dev`). No
fallback to built-in web_search/web_fetch was needed.

Scope: (1) container/dashboard/ingress tools - Portainer, Dockge, Komodo, Yacht,
CasaOS, Uptime Kuma, Homepage, Dashy, Heimdall, Traefik, nginx-proxy-manager,
Caddy; what each is good for, whether it has a real drivable API, and which are
worth reusing rather than rebuilding. (2) The modern Cloudflare Workers SPA
stack (Hono, Vite, React/Vue/Svelte, TanStack Start, Astro, OpenNext) for a
control-plane UI that must itself be hosted on Cloudflare.

The one axis that matters for this spec: can a Worker-hosted SPA DRIVE the tool
over an API, or is the tool only its own UI? Tools split into three tiers below.


## 1. Findings

### 1a. Tier A - real, drivable API (reuse these, do not rebuild)

F1. Portainer has a full REST API and a remote-node agent, so a control plane
can drive it without a browser.
Evidence: API docs at https://docs.portainer.io/api/docs ("Portainer exposes an
HTTP API that you can use to automate everything you do via the Portainer UI").
GitHub: portainer/portainer, 38744 stars, license Zlib, language TypeScript,
pushed 2026-10-27, 775 open issues, latest release 2.45.3 (2026-10-21),
not archived. Repo description: "Making Docker and Kubernetes management easy."
[verified]

F2. Komodo is the strongest "reuse" candidate for the control-plane / data-plane
split: it is explicitly API-first, multi-server (unlimited agents via the
"periphery" agent), and has typed SDK clients plus community Terraform
providers.
Evidence: README (moghtech/komodo): "A tool to build and deploy software across
many servers"; "There is no limit to the number of servers you can connect";
"There is no limit to what API you can use for automation"; GPL-V3. Repo tree
contains `typeshare.toml` (generates typed clients for multiple languages), a
`client/` dir, `bin`, `lib`, `ui`, `action`, and `docsite`. Docs at
https://komo.do and https://komo.do/docs/setup/advanced. Community Terraform
providers exist: https://github.com/jkossis/terraform-provider-komodo and
https://registry.terraform.io/providers/johnciavarella/komodo/latest/docs.
GitHub: moghtech/komodo, 12829 stars, license GPL-3.0, language Rust,
pushed 2026-10-23, 698 open issues, latest release v2.3.4 (2026-10-22),
not archived. [verified]

F3. nginx-proxy-manager has a real REST API with token auth (added in the 2.16
line) and manages proxy hosts + Let's Encrypt, making it a drivable ingress/TLS
layer for the data plane.
Evidence: official REST API + "Access > API Tokens" flow documented in
https://github.com/NginxProxyManager/nginx-proxy-manager/discussions/3265.
GitHub: NginxProxyManager/nginx-proxy-manager, 34574 stars, license MIT,
language TypeScript, pushed 2026-10-20, 865 open issues, latest release
v2.16.0 (2026-09-24), not archived. [verified]

F4. Caddy has a real admin API (default localhost:2019) and automatic HTTPS, so
it is drivable and needs no cert config - but the admin API is unauthenticated
by default and must be secured before any remote/Workers-driven use.
Evidence: admin API `curl localhost:2019/load`
(https://github.com/nalgeon/tryxinyminutes/blob/main/try/caddy/index.md);
remote access requires changing listen from localhost:2019 to 0.0.0.0:2019
(https://caddy.community/t/access-caddy-server-api-from-remote-http/9322);
security caveat that the default admin endpoint is unauthenticated
(https://github.com/caddyserver/caddy/issues/5815). GitHub:
caddyserver/caddy, 78533 stars, license Apache-2.0, language Go,
pushed 2026-10-29, 294 open issues, latest release v2.11.7 (2026-10-03),
not archived. [verified]

### 1b. Tier B - API is read-only / introspection / socket-based (usable but limited)

F5. Traefik's REST API is introspection-only in v2/v3; you CANNOT push routing
configuration through it. Config must come from providers (files, Docker labels,
Kubernetes CRD). To drive Traefik from a control plane you write dynamic config
files / labels, not REST calls.
Evidence: API/dashboard reference
https://doc.traefik.io/traefik/reference/install-configuration/api-dashboard/
(the `rest@internal` entrypoint is for querying); community thread
"Configuration via REST-API is gone?"
https://community.traefik.io/t/configuration-via-rest-api-is-gone/1666.
GitHub: traefik/traefik, 65403 stars, license MIT, language Go,
pushed 2026-10-29, 980 open issues, latest release v3.7.16 (2026-10-20),
not archived. Topics include reverse-proxy, letsencrypt, kubernetes, docker.
[verified] (exact per-version behaviour worth re-confirming against the pinned
Traefik version, but the "no config push via API" model holds across v2/v3.)

F6. Dockge is a reactive docker-compose stack manager with two directly reusable
pieces - an interactive browser web terminal and multi-agent (multi-host)
support - but it is a UI over the Docker socket, not an external control API,
and its last tagged release is old.
Evidence: README (louislam/dockge): "Interactive Web Terminal"; "(1.4.0)
Multiple agents support - You can manage multiple stacks from different Docker
hosts in one single interface"; "File based structure ... they are stored on
your drive ... you can interact with them using normal docker compose
commands". No external REST control API is advertised. GitHub:
louislam/dockge, 24706 stars, license MIT, language TypeScript,
pushed 2026-10-23, 176 open issues, latest release 1.5.0 (2025-03-30) -
note the release tag is ~19 months before the last push. [verified]

F7. Uptime Kuma is controllable, but only through its socket.io "internal API"
and community clients plus Prometheus metrics / push monitors - not a stable
public REST API. Good for health/status, not a container control plane.
Evidence: "Uptime Kuma Internal API Documentation"
https://github.com/louislam/uptime-kuma/wiki/Internal-API; Python client
`uptime-kuma-api` on https://pypi.org/project/uptime-kuma-api/. GitHub:
louislam/uptime-kuma, 93051 stars, license MIT, language JavaScript,
pushed 2026-10-29, 853 open issues, latest release 2.5.8 (2026-10-26),
not archived. [verified]

### 1c. Tier C - config-as-code dashboards / low-maturity (status pages, not control planes)

F8. Homepage is a YAML config-as-code dashboard. Its "API" is for pulling
external data into widgets, not for controlling anything.
Evidence: widget API authoring https://gethomepage.dev/widgets/authoring/api/
and Custom API service https://gethomepage.dev/widgets/services/customapi/.
GitHub: gethomepage/homepage, 33433 stars, license GPL-3.0, language
JavaScript, pushed 2026-10-29, 2 open issues, latest release v2.7.0
(2026-10-23), not archived. [verified]

F9. Dashy is a JSON config-as-code dashboard (schema-validated), no write/control
API.
Evidence: config schema
https://github.com/Lissy93/dashy/blob/master/src/utils/config/ConfigSchema.json;
docs https://dashy.to/docs/. GitHub: lissy93/dashy, 26858 stars, license MIT,
language Vue, pushed 2026-10-27, 14 open issues, latest release 4.9.0
(2026-10-23), not archived. [verified]

F10. Heimdall is a mostly-static link dashboard; the maintained fork is a
linuxserver PHP project with minimal API surface.
Evidence: GitHub linuxserver/Heimdall, 9375 stars, license MIT, language PHP,
pushed 2026-10-19, 5 open issues, not archived. (The original benhutchins repo
is gone/renamed; linuxserver/Heimdall is the live source.) [verified]

F11. Yacht is effectively dormant/low-adoption now and is not worth reusing.
Evidence: GitHub SelfhostedPro/Yacht returned only 60 stars, 5 forks, 1
subscriber, created_at 2025-06-30, pushed 2026-08-27, license MIT, language
null, 21 open issues. The repo was recreated in mid-2025 (old star history not
present); treat as unmaintained. [verified as observed; exact historical star
count unverified.]

F12. CasaOS is a personal-cloud / home app-store OS, not an API control plane;
release cadence is slowing.
Evidence: repo description "CasaOS - A simple, easy-to-use, elegant open-source
Personal Cloud system"; README emphasises app-store one-click install with no
prominent external control API. GitHub: IceWhaleTech/CasaOS, 37393 stars,
license Apache-2.0, language Go, pushed 2026-09-28, 837 open issues, latest
release v0.4.17-alpha1 (2025-04-17). [verified]

### 1d. The modern Workers SPA stack (the control-plane UI itself)

F13. The current canonical way to host an SPA on Cloudflare is Workers Static
Assets + the Cloudflare Vite plugin, with SPA client-side routing fallback.
Cloudflare is folding Pages into Workers, so a new build should target Workers
directly, not Pages.
Evidence: https://developers.cloudflare.com/workers/static-assets/ ; SPA routing
https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
; Vite plugin https://developers.cloudflare.com/workers/vite-plugin/ ;
Pages->Workers migration guide dated 2026-10-12
https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/ .
[verified]

F14. Hono runs natively on Cloudflare Workers and is the natural edge API layer
for a Workers-hosted control-plane SPA (typed RPC, no Node shims).
Evidence: https://hono.dev/docs/getting-started/cloudflare-workers and Cloudflare
framework guide
https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/ .
GitHub: honojs/hono, 32741 stars, license MIT, language TypeScript,
pushed 2026-10-28, 407 open issues, latest release v4.13.14 (2026-10-25).
[verified]

F15. Vite is the bundler under all of these and is the substrate the Cloudflare
Vite plugin builds on.
Evidence: GitHub vitejs/vite, 83635 stars, license MIT, language TypeScript,
pushed 2026-10-29, 818 open issues, latest scaffold release create-vite@9.3.3
(2026-10-27). [verified] (this cites the create-vite scaffold version; the exact
vite core package version was not separately captured - unverified.)

F16. React / Vue / Svelte are all viable UI libraries that run on Workers via
Vite; React has the largest Cloudflare tooling ecosystem.
Evidence: GitHub facebook/react 251813 stars MIT; vuejs/core 54808 stars MIT;
sveltejs/svelte 88513 stars MIT; all pushed 2026-10-28/29, all MIT. [verified]

F17. TanStack Start has first-class Cloudflare Workers deployment and gives
type-safe routing + server functions in one full-stack framework. TanStack Start
now ships inside the TanStack Router repo.
Evidence: Cloudflare Workers framework guide
https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/
; hosting docs https://tanstack.com/start/latest/docs/framework/react/guide/hosting .
GitHub TanStack/router (contains Start), 15259 stars, license MIT, language
TypeScript, pushed 2026-10-29, 812 open issues, latest release
release-2026-10-22-2011 (2026-10-22). (TanStack/start as a standalone repo
returned 404 - it is part of the router monorepo.) [verified]

F18. Astro is now part of Cloudflare, with a first-party @astrojs/cloudflare
adapter and a Workers framework guide - a strong, Cloudflare-backed option for a
read-heavy dashboard UI. Astro's LICENSE is MIT (the GitHub license API
misreports it as "Other"/NOASSERTION).
Evidence: adapter https://docs.astro.build/en/guides/integrations-guide/cloudflare/
; Workers guide
https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/ ;
"Astro is joining Cloudflare" https://blog.cloudflare.com/astro-joins-cloudflare .
LICENSE file head read via gh: "MIT License, Copyright (c) 2021 Fred K. Schott".
GitHub: withastro/astro, 63573 stars, license API=NOASSERTION/Other but
LICENSE file = MIT, language TypeScript, pushed 2026-10-29, 116 open issues,
latest release astro@7.4.4 (2026-10-28). [verified]

F19. OpenNext runs Next.js on Cloudflare Workers (the batteries-included /
RSC-heavy option); it is the most capable but the heaviest choice and only worth
it if you specifically want Next.js React Server Components.
Evidence: https://opennext.js.org/cloudflare and Cloudflare guide
https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/ .
GitHub: opennextjs/opennextjs-cloudflare, 1910 stars, license MIT, language
TypeScript, pushed 2026-10-29, 196 open issues, latest release
@opennextjs/cloudflare@1.20.14 (2026-10-28). [verified]


## 2. Comparison table

Container / dashboard / ingress tools (GitHub figures read 2026-10-29):

| Tool | owner/repo | Stars | License | Lang | Last release | Real drivable API? | Reuse verdict |
|---|---|---|---|---|---|---|---|
| Portainer | portainer/portainer | 38744 | Zlib | TS | 2.45.3 (2026-10-21) | Yes - full REST API + agent | Reuse as turnkey Docker/K8s UI+API |
| Komodo | moghtech/komodo | 12829 | GPL-3.0 | Rust | v2.3.4 (2026-10-22) | Yes - API-first, typed SDK, TF providers | Best fit for the control/data-plane split |
| nginx-proxy-manager | NginxProxyManager/nginx-proxy-manager | 34574 | MIT | TS | v2.16.0 (2026-09-24) | Yes - REST API + API tokens | Reuse for API-driven ingress/TLS |
| Caddy | caddyserver/caddy | 78533 | Apache-2.0 | Go | v2.11.7 (2026-10-03) | Yes - admin API (localhost, unauth) | Reuse for zero-config TLS; secure the API |
| Traefik | traefik/traefik | 65403 | MIT | Go | v3.7.16 (2026-10-20) | No - introspection only; config via providers | Reuse if label-driven; write config files to drive it |
| Dockge | louislam/dockge | 24706 | MIT | TS | 1.5.0 (2025-03-30) | No - UI over Docker socket | Harvest ideas (web terminal, multi-agent) |
| Uptime Kuma | louislam/uptime-kuma | 93051 | MIT | JS | 2.5.8 (2026-10-26) | Partial - socket.io/metrics/push | Reuse for health/status |
| Homepage | gethomepage/homepage | 33433 | GPL-3.0 | JS | v2.7.0 (2026-10-23) | No - config-as-code (consumes APIs) | Reuse as status/launch page |
| Dashy | lissy93/dashy | 26858 | MIT | Vue | 4.9.0 (2026-10-23) | No - JSON config | Reuse as status/launch page |
| Heimdall | linuxserver/Heimdall | 9375 | MIT | PHP | (no tagged rel; pushed 2026-10-19) | No - static links | Optional launch page |
| Yacht | SelfhostedPro/Yacht | 60 | MIT | - | (pushed 2026-08-27) | Had REST v1; project dormant | Skip |
| CasaOS | IceWhaleTech/CasaOS | 37393 | Apache-2.0 | Go | v0.4.17-alpha1 (2025-04-17) | No - home app-store UI | Skip for control plane |

Workers SPA stack (GitHub figures read 2026-10-29):

| Piece | owner/repo | Stars | License | Lang | Latest release | Role for control-plane UI |
|---|---|---|---|---|---|---|
| Hono | honojs/hono | 32741 | MIT | TS | v4.13.14 (2026-10-25) | Edge API layer on Workers (typed RPC) |
| Vite | vitejs/vite | 83635 | MIT | TS | create-vite@9.3.3 (2026-10-27) | Bundler + @cloudflare/vite-plugin target |
| React | facebook/react | 251813 | MIT | JS | (pushed 2026-10-28) | Primary UI lib (largest CF tooling) |
| Vue | vuejs/core | 54808 | MIT | TS | (pushed 2026-10-29) | Alt UI lib |
| Svelte | sveltejs/svelte | 88513 | MIT | JS | (pushed 2026-10-29) | Alt UI lib |
| TanStack Start | TanStack/router | 15259 | MIT | TS | release-2026-10-22-2011 (2026-10-22) | Full-stack, type-safe, first-class CF Workers |
| Astro | withastro/astro | 63573 | MIT (LICENSE) | TS | astro@7.4.4 (2026-10-28) | Read-heavy dashboard UI; Cloudflare-backed |
| OpenNext (Next on CF) | opennextjs/opennextjs-cloudflare | 1910 | MIT | TS | @opennextjs/cloudflare@1.20.14 (2026-10-28) | Heaviest option; Next.js RSC on Workers |

Deploy substrate: @cloudflare/vite-plugin + Workers Static Assets + SPA routing
fallback (Pages is being folded into Workers; migration guide 2026-10-12).


## 3. What this changes for the spec

R1. Do not rebuild a container-control dashboard. Reuse an API-first tool.
Komodo is the best architectural match for this spec because it is designed
exactly for "build and deploy across many servers", is API-first with typed
clients, has community Terraform providers, and ships a per-host agent
(periphery) - so it maps cleanly onto the control-plane (on Workers) /
data-plane (own metal) split. Choose Portainer instead if you want a turnkey
UI plus a stable REST API and are comfortable with its Zlib-licensed CE build.
Both are far ahead of a bespoke build in maturity and API completeness.

R2. The Workers-hosted control-plane SPA should be a thin client, not a Docker
client. It calls a Hono (or TanStack Start server-function) API running in the
same Worker; that API calls Cloudflare APIs (Tunnel management) and reaches
data-plane services only through the Tunnel. Nothing on Cloudflare touches a
Docker socket directly - it drives Komodo/Portainer, which own the sockets on
the data plane.

R3. Build the SPA the current Cloudflare way: @cloudflare/vite-plugin + Workers
Static Assets with SPA routing fallback. Target Workers, not Pages (Pages is
being folded into Workers). UI library: React+Vite for the richest Cloudflare
tooling, TanStack Start if you want one type-safe full-stack framework, or Astro
if the dashboard is mostly read/status views (Astro is now a Cloudflare project
with a first-party adapter). Use OpenNext only if Next.js RSC is a hard
requirement - it is the heaviest option. Keep Hono as the API layer regardless
of UI choice, because it runs natively on Workers.

R4. For ingress/TLS on own metal behind the tunnel, pick by how you want to
drive it:
- Need a UI + REST API to add/remove proxy hosts and certs programmatically:
  nginx-proxy-manager (REST API + API tokens, Let's Encrypt built in).
- Want zero-config automatic HTTPS with a drivable admin API: Caddy, but secure
  the admin endpoint first (it is localhost:2019 and unauthenticated by default;
  exposing it unauthenticated is a real risk).
- Already label/provider-driven and fine writing dynamic config files: Traefik,
  but do not plan to POST routes into its REST API - that capability was removed
  in v2/v3.

R5. Reuse, do not rebuild, the status/health surface too. Uptime Kuma for
monitors (drive it via its socket.io internal API or a client like
uptime-kuma-api), and Homepage or Dashy for a config-as-code launch/status page.
These are read surfaces; the control actions belong to Komodo/Portainer.

R6. Harvest two specific pieces from Dockge rather than depending on it: its
interactive browser web terminal (a ready-made "terminal into a box" pattern)
and its multi-agent model for fanning compose operations out to several Docker
hosts. Its last tagged release is 1.5.0 (2025-03-30), so treat it as a source of
design ideas, not a dependency.

R7. Skip Yacht (dormant) and CasaOS (personal-cloud app-store, not a control
plane). Neither is worth reusing for a Workers-driven orchestrator.


## 4. Not covered / open questions

Q1. Resource footprint (RAM/CPU/disk) of each dashboard under realistic load was
NOT measured. Every number here is project metadata, not a benchmark. A
footprint comparison on the operator's own hardware is still owed (and is
arguably a B2/B3 concern, not B7).

Q2. Komodo periphery agent's auth model and whether it can be exposed safely
ONLY through a Cloudflare Tunnel (mTLS? token? is the agent API reachable from a
Worker over a Tunnel service?) was not read in depth. Needs a close read of
https://komo.do/docs/setup/advanced before committing to Komodo as the driven
component.

Q3. Caddy admin API remote exposure needs an auth design decision (it is
unauthenticated on localhost:2019 by default). If Caddy is driven from a Worker
over a Tunnel, the auth/listen hardening is a prerequisite, not an afterthought.

Q4. Traefik dynamic-config injection mechanics (how a control plane writes the
file provider and triggers a reload, and whether a Tunnel-fronted Traefik
instance behaves) was not tested end to end.

Q5. Whether Homepage/Dashy expose ANY write/control endpoint was assumed "no"
from their config-as-code docs; if a write surface is needed it should be
confirmed rather than assumed.

Q6. OpenNext on Cloudflare Containers (vs Workers) for a heavier UI was not
evaluated - the spec pins the SPA to Workers, so the Containers path is out of
scope here but is a real alternative (Cloudflare Containers is current; see
https://developers.cloudflare.com/containers/faq/ ).

Q7. Product decision left open: white-label/reuse an existing dashboard's UI
wholesale (e.g. Komodo's or Portainer's UI) versus build a thin custom SPA that
only calls APIs. This changes how much of Tier A you lean on.

Q8. Exact Vite core package version was not captured separately (only
create-vite@9.3.3); flagged unverified in F15.

Q9. Astro's GitHub license API reports "Other"/NOASSERTION, but its LICENSE file
is the MIT License (verified). Anyone automating license checks against the
GitHub license field will get a false signal for Astro.
