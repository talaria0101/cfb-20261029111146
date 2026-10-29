# E1-homelable: Pouzor/homelable

Read on 2026-10-29 (UTC). Every figure below came from a call made on that date.
Method: `gh api` against `github.com` for metadata, trees, file contents and issues;
the GHCR registry API (`ghcr.io/v2/...`) for image sizes; the repository tarball from
`codeload.github.com` for full-source greps; one `search.web.pkgforge.dev` call pinned to
`provider=tinyfish` and one `read.web.pkgforge.dev` call pinned to `provider=tinyfish`
(both succeeded, no fallback to `web_search`/`web_fetch` was needed).

Repository identity (read 2026-10-29, `gh api repos/Pouzor/homelable`):
owner/repo `Pouzor/homelable`, stars 4785, forks 216, open issues 34, license MIT,
primary language TypeScript, created 2026-03-06T21:49:54Z, last push
2026-10-28T12:09:33Z, repo size 6410 KB, default branch `main`, homepage
`https://homelable.net`, topics: diagram, homelab, homelab-infrastructure-observability,
network, proxmox-ve, self-hosted, zigbee, zwave, zwave-js.

---

## 1. Findings

### F1. The project is alive and unusually mature for its age. [verified]

Claim: Homelable is under active development, not abandoned, and its test and CI
surface is production-grade.

Evidence:
- `gh api repos/Pouzor/homelable/commits?per_page=1` returns a `Link` header whose last
  page is 1048, i.e. at least 1048 commits on `main` (read 2026-10-29).
- Latest release `v3.6.0`, published 2026-10-06T23:34:46Z
  (`gh api repos/Pouzor/homelable/releases`). The release carries **no binary assets**;
  distribution is GHCR images only.
- Last commit 2026-10-28T10:18:05Z, `1251234b`, "feat(canvas): hover highlight - dim
  unconnected nodes and edges on hover (#537)" (`gh api repos/Pouzor/homelable/commits`).
  27 releases between v2.0.0 (2026-05-11) and v3.6.0 (2026-10-06), roughly one minor
  release every 10 days over five months.
- `VERSION` file reads `3.6.0`, matching the release tag.
- Test surface (counted from the `main` tarball, 2026-10-29): 66 backend pytest files
  containing 1705 `def test_` functions (28,551 lines of test code against 48,743 lines
  of backend application code); 207 frontend test files containing roughly 2967
  assertions (`it(`/`test(`); 15 MCP test files (5,085 lines).
- Four CI workflows: `quality.yml` (shellcheck, hadolint, eslint, `tsc -b`, vitest,
  ruff, `mypy app/`, pytest twice for backend and mcp), `docker-ci.yml` (builds the real
  images, boots the compose stack, then runs `backend/tests/test_integration.py` against
  the live stack), `security.yml` (weekly truffleshog, `npm audit --omit=dev
  --audit-level=high`, pip-audit), `install-smoke.yml` (runs
  `scripts/install-baremetal.sh` for real in a `debian:12` container).

Source URLs: `https://github.com/Pouzor/homelable`,
`https://github.com/Pouzor/homelable/releases`, `https://github.com/Pouzor/homelable/blob/main/CHANGELOG.md`.

### F2. Architecture: three processes, one SQLite file, pull-only, single network segment. [verified]

Claim: Homelable is a centralised pull scanner plus a static SPA. There is no agent, no
outbound dial from any monitored host, and no ability to observe a second network
segment.

Evidence (`backend/app/main.py`, `docker-compose.yml`, `docker-compose.prebuilt.yml`):
- `backend`: FastAPI + uvicorn on 0.0.0.0:8000, `Dockerfile.backend` = `python:3.13-slim`
  plus `apt-get install nmap iputils-ping curl`. Runs APScheduler's `AsyncIOScheduler`
  started in the FastAPI lifespan.
- `frontend`: Vite React SPA built on `node:20-slim`, served by `nginx:alpine` on :80,
  published on host port 3000. nginx proxies `/api/`, `/api/v1/status/ws/`, `/ws/`,
  `/docs`, `/redoc`, `/openapi.json` to `${BACKEND_UPSTREAM}` (default `backend:8000`,
  overridable at container start).
- `mcp`: a third, optional FastAPI process on :8001 (`mcp/Dockerfile.mcp` =
  `python:3.13-slim`), which is a proxy to the backend, not a data collector.
- Storage: SQLite via `sqlalchemy[asyncio]` + `aiosqlite`, path `/app/data/homelab.db` on
  a Docker volume. `alembic` is a declared dependency.
- Discovery is entirely LAN-scoped and entirely initiated by the backend process:
  `_arp_table_hosts` reads `/proc/net/arp` on Linux or runs `arp -a` on macOS;
  `_nmap_scan_single` shells out to nmap through `python-nmap`; `_ping_sweep` needs
  `CAP_NET_RAW`; `_mdns_discover` browses mDNS through `zeroconf` with a 4 s default
  timeout. (`backend/app/services/scanner.py`, 1101 lines.)
- A grep for the word "agent" across `backend`, `mcp`, `frontend/src` and `docs`
  returns only Proxmox **qemu-guest-agent** references (`/agent/network-get-interfaces`
  in `proxmox_service.py`). There is no Homelable agent binary, no enrollment, no
  outbound control channel.
- The README states the limit itself: "The scan reports no MAC address when the backend
  runs on a Docker bridge network - ARP is layer 2, and from a bridge every LAN host
  sits behind the Docker gateway."

Source URLs: `https://github.com/Pouzor/homelable/blob/main/docker-compose.yml`,
`.../Dockerfile.backend`, `.../backend/app/main.py`,
`.../backend/app/services/scanner.py`.

### F3. Data model: presentation and facts are deliberately split into two tables. [verified]

Claim: the `nodes` table owns only how a device is drawn; the `device_inventory` table
owns what the device is. One device can appear on many canvases.

Evidence (`backend/app/db/models.py`, 431 lines):
- `designs`: `id`, `name`, `design_type` (`network` | `electrical` | `rack`), `icon`.
- `nodes`: `id`, `type`, `label`, `design_id` (FK, `ON DELETE SET NULL`), `device_id`
  (FK to `device_inventory`, `ON DELETE SET NULL`, indexed), `display_view` (JSON: which
  services and which properties this canvas shows, and in what order), `pos_x`, `pos_y`,
  `parent_id` (self-FK, `ON DELETE CASCADE`, so nesting is tree-shaped),
  `container_mode`, `custom_colors`, `custom_icon`, `description`, `show_port_numbers`,
  `port_labels` (JSON, per-handle text overriding the printed port number), `width`,
  `height`, `top_handles`, `bottom_handles`, `left_handles`, `right_handles`.
- `edges`: `id`, `source`, `target` (both FK to `nodes`, CASCADE), `design_id`, `type`
  (default `ethernet`), `label`, `vlan_id`, `speed`, `lqi` (Zigbee link quality, written
  by import only and deliberately omitted from `EdgeUpdate`), `custom_color`,
  `path_style`, `line_style`, `width_mult`, `animated`, `marker_start`, `marker_end`,
  `source_handle`, `target_handle`, `waypoints` (JSON).
- `canvas_state`: `design_id` primary key, `viewport` JSON, `custom_style` JSON.
- `racks`, `rack_devices`, `rack_cables`: the physical canvas. `rack_devices` carries
  `u_start` (1-based from the bottom rail), `u_height`, `col_start`/`col_span` on a
  12-column grid, `faceplate_id`, `ports` JSON, plus both a `device_id` and an optional
  `node_id` link, both `SET NULL` on delete, with `label` denormalised so a rack keeps
  rendering after an inventory purge.
- `device_inventory`: the fact-owning table. `ip`, `mac`, `hostname`, `os`, `services`
  (JSON), `suggested_type`, `status` (inventory lifecycle: pending/approved/hidden),
  `discovery_source` (first source, kept for back-compat) and `discovery_sources` (JSON
  array of every source that has seen the device), `ieee_address` (unique, indexed),
  `friendly_name`, `device_subtype`, `model`, `vendor`, `lqi`, `properties` (generic
  `{key, value, icon, visible}` list), plus curated facts: `label`, `type`, `notes`,
  `cpu_count`, `cpu_model`, `ram_gb`, `disk_gb`, `show_hardware`, `check_method`,
  `check_target`, `status_live` (explicitly NOT the same column as `status`),
  `last_seen`, `last_scan`, `response_time_ms`, and the rack modelling fields
  (`rack_faceplate_id`, `rack_u_height`, `rack_col_span`, `rack_color`, `rack_ports`).
- `device_inventory_links`: Zigbee mesh links addressed by stable IEEE address rather
  than by row id, so a re-import resolves.
- `scan_runs`: `id`, `status`, `kind` (default `ip`), `ranges` JSON, `devices_found`,
  `started_at`, `finished_at`, `error`.
- `documents` and `document_revisions`: a markdown documentation space with `kind`
  (page/folder), a library tree via `parent_id`, and exactly one of `device_id` /
  `node_id` / `design_id` set, each enforced unique by a partial index. `body` is the
  whole file including YAML frontmatter so it exports as-is; `frontmatter` and `tags`
  are a parsed cache; `facts_snapshot` and `baseline_body` support a three-way
  update-from-device merge; `edited_at` distinguishes a template-generated document
  from a hand-edited one.
- The docstring on `Node` states the invariant in one sentence: "What the device *is*
  ... belongs to the `device_inventory` row named by `device_id`, so one device reads
  the same on every canvas."

Source URL: `https://github.com/Pouzor/homelable/blob/main/backend/app/db/models.py`.

### F4. The vocabulary is small, closed and typed on the frontend, open on the wire. [verified]

Claim: node and edge types are a fixed TypeScript union in the frontend and are not
validated by the backend.

Evidence (`frontend/src/types/index.ts`, `frontend/src/utils/nodeTypeGroups.ts`):
- `NodeType` is a union of 44 string literals. 41 are device types
  (`isp, router, firewall, switch, server, proxmox, vm, lxc, nas, kvm, iot, ap, camera,
  printer, computer, laptop, mobile, cpl, docker_host, docker_container, generic,
  zigbee_coordinator, zigbee_router, zigbee_enddevice, zwave_coordinator,
  zwave_router, zwave_enddevice, grid, ups, battery, generator, solar_panel, inverter,
  circuit_breaker, contactor, electrical_switch, socket, light, meter, transformer,
  load`); 3 are canvas furniture (`groupRect`, `group`, `text`).
- `NODE_TYPE_GROUPS` groups 42 of them (41 devices plus `groupRect`) into 8 picker
  families: Hardware (9), Virtualization (5), IoT (3), Zigbee (3), Z-Wave (3), Personal
  (3), Electrical (14), Generic (2).
- `EdgeType` is a union of 9: `ethernet, wifi, iot, zigbee_mesh, vlan, virtual, cluster,
  fibre, electrical`. `CheckMethod` is a union of 8: `ping, http, https, tcp, ssh,
  prometheus, health, none`. `NodeStatus` is 4: `online, offline, pending, unknown`.
- `docs/api.md` says `type` is "a free string on the wire - the backend does not
  validate it - but only the ~40 values the frontend knows about get an icon and a
  shape."
- Drift found: `docs/api.md` lists 8 edge types and omits `zigbee_mesh`, which the code
  has. The code is authoritative.
- Drift found: `https://homelable.net` (fetched 2026-10-29 via the pkgforge read gateway)
  advertises "15 native node types". The source has 44 `NodeType` members. The marketing
  page undercounts by grouping.

Source URLs: `https://github.com/Pouzor/homelable/blob/main/frontend/src/types/index.ts`,
`.../frontend/src/utils/nodeTypeGroups.ts`, `.../docs/api.md`.

### F5. Discovery and polling: seven pull mechanisms, one scheduler, one WebSocket. [verified]

Claim: all state enters the system by the backend pulling from something reachable from
where the backend runs. Live status is pushed to the browser over one WebSocket.

Evidence:
- Scanner phases (`backend/app/services/scanner.py`): (1) ARP table parse,
  (2) ping sweep that works under `CAP_NET_RAW` with no nmap, (3) nmap in two decoupled
  passes, Pass A `--open -T4 -Pn -p <spec>` for port discovery and Pass B `-sV` for
  version detection on the discovered ports only, with concurrency bounded at 10 and a
  deep-scan mode that slices the whole TCP range into chunks rather than one 65535-port
  call, (4) mDNS browse, (5) optional HTTP probe against `SCANNER_HTTP_RANGES` for
  service identification.
- Fingerprinting data ships in the repo: `backend/app/data/service_signatures.json`
  (40,592 bytes) and `backend/app/data/oui_database.json` (4,427 bytes, MAC vendor).
- `status_checker.check_node` implements `ping` (2 probes, `-W 2` on Linux, RTT parsed
  from ping's own stdout because the subprocess wall clock measures ping's pacing),
  `http` (success if status < 500), `https` (TLS verify), `tcp`, `ssh` (TCP/22),
  `prometheus` (GET `/metrics`), `health` (GET `/health`), `none`. A `host` starting
  with `-` is rejected to stop argument injection into the ping/tcp subprocesses.
- `core/scheduler.py` runs `_run_status_checks` on an `AsyncIOScheduler` interval,
  default `STATUS_CHECKER_INTERVAL=60`. It is **device-scoped, not node-scoped**: a host
  drawn on three canvases is pinged once. Hidden devices are skipped. A device with no
  node at all is still checked.
- Each cycle's results are persisted in **one** commit, not one per device, because
  "one commit per device meant as many writers queueing on SQLite's single write lock
  as there were devices, and the ones at the back of the queue gave up with 'database is
  locked' (#539)". Each individual result is broadcast as soon as its probe answers,
  independently of the save.
- Broadcast transport: `backend/app/api/routes/status.py` holds a module-level
  `_connections` list and exposes `@router.websocket("/ws/status")`. Auth is origin
  allow-list, then either an OIDC session cookie or a first-message JSON bearer token
  (deliberately not in the URL, "where proxies may log it"). Message shapes:
  `{"type":"status", device_id, node_ids, status, checked_at, response_time_ms}`,
  `{"type":"service_status", ...}`, `{"type":"scan_device_found", run_id,
  devices_found}`.
- The frontend builds the socket URL from `window.location`:
  `` `${protocol}://${host}${API_BASE_URL}/status/ws/status` `` in
  `frontend/src/hooks/useStatusPolling.ts`.
- Non-network discovery sources are also all pull, all configured by environment:
  Proxmox REST API on :8006 with a read-only `PVEAuditor` API token, UniFi Network API
  on :8443, Unraid API, MQTT for zigbee2mqtt and zwavejs2mqtt. Each is a single instance
  per Homelable install, set in `.env`.

Source URLs: `.../backend/app/services/scanner.py`, `.../backend/app/services/status_checker.py`,
`.../backend/app/core/scheduler.py`, `.../backend/app/api/routes/status.py`,
`.../frontend/src/hooks/useStatusPolling.ts`.

### F6. API surface: 19 routers, generated OpenAPI, three credential paths. [verified]

Claim: the whole UI is a thin client over a documented JSON API, and that API is
scriptable today without any Homelable-specific client.

Evidence (`backend/app/main.py`): routers mounted under `/api/v1` are `auth`, `nodes`,
`edges`, `canvas`, `designs`, `racks`, `scan`, `status`, `settings`, `liveview`,
`zigbee`, `zwave`, `proxmox`, `unifi`, `unraid`, `stats`, `media`, `documents`,
`docsview` (19), plus `GET /api/v1/health` defined inline.
- OpenAPI is generated from the code: `/docs` (Swagger UI), `/redoc`, `/openapi.json`.
  `docs/api.md` states the reference "is generated from the code itself, so it never
  drifts from what the server actually accepts."
- Conventions documented in `docs/api.md`: prefix `/api/v1`, JSON, FastAPI
  `{"detail": ...}` error shape, 201 on create, 204 on delete, 401/404/409/422,
  server-generated string ids, ISO 8601 UTC timestamps.
- `backend/app/api/deps.py` `get_auth_context` accepts exactly three credential types,
  in order: (1) `X-MCP-Service-Key` compared with `hmac.compare_digest`, which does not
  expire and which `docs/api.md` calls a root credential; (2) a JWT bearer token from
  `POST /api/v1/auth/login`, HS256, default `ACCESS_TOKEN_EXPIRE_MINUTES=1440`, no
  revocation list (rotating `SECRET_KEY` invalidates every token); (3) an OIDC session
  cookie, only when `AUTH_MODE=oidc`.
- Scriptable write paths that matter for an external control plane: `POST /api/v1/nodes`
  (accepts `properties` as `{key, value, icon, visible}` rows and a `force` flag to
  override a 409 on duplicate ip/mac), `PATCH /api/v1/nodes/{id}` (partial update, but
  `properties` is replaced wholesale not merged), `POST/DELETE /api/v1/edges`,
  `GET /api/v1/canvas?design_id=`, `POST /api/v1/canvas/save` (full replace for the
  design: anything absent from the payload is deleted), `POST /api/v1/scan/trigger`,
  `POST /api/v1/scan/pending/{device_id}/approve`, `POST /api/v1/scan/pending/bulk-approve`,
  `POST /api/v1/scan/pending/merge`.
- Security posture stated by the project itself in `docs/api.md`: "/docs, /redoc and
  /openapi.json are not authenticated"; "There is no rate limiting on the login
  endpoint"; "Homelable is meant for a LAN. Do not expose it to the internet."
- OIDC mode has **no scripting path**: `docs/api.md` says "there is currently no
  scripting path in OIDC mode. If you need one, say so on issue #291."
- Opt-in unauthenticated read surfaces: `LIVEVIEW_KEY` gives a no-login read-only canvas
  at `/view?key=`; `DOCS_VIEW_KEY` gives a no-login read-only documentation tree at
  `/docs?key=` (the README warns that uploaded media is served without authentication
  and that the key is all-or-nothing); `HOMEPAGE_API_KEY` gives
  `GET /api/v1/stats/summary` behind an `X-API-Key` header.

Source URLs: `.../backend/app/main.py`, `.../backend/app/api/deps.py`, `.../docs/api.md`,
`.../backend/app/api/routes/status.py`.

### F7. There is a bundled MCP server, and it is a proxy, not a control plane. [verified]

Claim: the MCP server is a separate process that re-exports the backend's REST API to
AI assistants through 25 tools and 6 resources. It adds no new capability and no
per-host presence.

Evidence (`mcp/app/main.py`, `mcp/app/tools.py`, `mcp/app/resources.py`,
`mcp/requirements.txt`):
- FastAPI app with `StreamableHTTPSessionManager` mounted as an ASGI sub-app at `/mcp`,
  `stateless=True`, `json_response=False`. `mcp[cli]>=1.26,<2` with the upper bound
  declared load-bearing because mcp 2.0 dropped the low-level `Server.list_tools`
  decorator API.
- Two keys, two directions: `MCP_API_KEY` authenticates AI clients via `X-API-Key`;
  `MCP_SERVICE_KEY` authenticates the MCP server to the backend via
  `X-MCP-Service-Key`. `mcp/app/backend_client.py` is an httpx wrapper that surfaces
  FastAPI's `{"detail": ...}` and validates that every id path segment matches
  `[A-Za-z0-9_-]+`.
- 25 tools: `create_node`, `update_node`, `delete_node`, `create_edge`, `update_edge`,
  `list_edges`, `delete_edge`, `trigger_scan`, `approve_device`, `hide_device`,
  `get_canvas`, `list_nodes`, `list_node_summaries`, `get_node`, `list_pending_devices`,
  `list_inventory`, `list_hidden_devices`, `restore_device`, `create_zone`, `list_zones`,
  `add_to_zone`, `remove_from_zone`, `list_designs`, `create_design`, `delete_design`.
- 6 resources: `homelable://canvas`, `homelable://nodes`, `homelable://edges`,
  `homelable://scan/pending`, `homelable://scan/runs`, `homelable://documents`.
- Every tool carries `readOnlyHint` / `destructiveHint` / `openWorldHint` annotations
  (v3.6.0 changelog, #536) so an MCP client can let reads through without prompting.
- The project's own guidance: "The MCP server is not intended to be exposed to the
  internet - keep port 8001 firewalled to your LAN."
- `mcp/app/backend_client.py` exists only because the backend's error text was being
  lost; it is a thin translation layer, ~90 lines.

Source URL: `https://github.com/Pouzor/homelable/tree/main/mcp`.

### F8. Footprint: three containers, about 202 MiB compressed, plus nmap and Python. [verified]

Claim: Homelable is not a small agent. A full install is three container images
totalling roughly 202 MiB compressed before the runtime is counted.

Evidence (GHCR registry API, tag `3.6.0`, `linux/amd64`, read 2026-10-29):
- `ghcr.io/pouzor/homelable-backend`: 110,126,289 bytes across 11 gzip layers; image
  config `created` 2026-10-06T23:44:18Z. Base `python:3.13-slim`, plus nmap,
  iputils-ping, curl.
- `ghcr.io/pouzor/homelable-frontend`: 28,023,781 bytes; created 2026-10-06T23:44:33Z.
  Two stages, `node:20-slim` build then `nginx:alpine` serve.
- `ghcr.io/pouzor/homelable-frontend-standalone`: 27,826,076 bytes; created
  2026-10-06T23:43:16Z.
- `ghcr.io/pouzor/homelable-mcp`: 73,594,178 bytes; created 2026-10-06T23:35:25Z.
- Sum of the three non-standalone images: 211,744,248 bytes (about 202 MiB) compressed.
  Each is a multi-arch index carrying `linux/amd64` and `linux/arm64` manifests plus
  attestation manifests.
- The bare-metal path is not lighter: `scripts/install-baremetal.sh` (526 lines) apt-gets
  `git curl ca-certificates gnupg python3 python3-venv python3-pip`, installs Node from
  nodesource, apt-gets nginx, creates a venv, runs `npm ci` then `npm run build`. The
  script refuses to start unless free RAM plus swap is at least `BUILD_MEMORY_MB`
  (default 1536), because "the build peaks at ~750 MB in a single node process (tsc,
  then vite)".
- Runtime deps of the backend (`backend/requirements.txt`): fastapi 0.135.1,
  uvicorn[standard] 0.30.6, sqlalchemy[asyncio] 2.0.35, aiosqlite 0.20.0, alembic
  1.13.3, pydantic 2.9.2, pydantic-settings 2.5.2, PyJWT 2.15.0, bcrypt 4.2.1, authlib
  1.9.1, joserfc 1.7.4, itsdangerous 2.2.0, python-multipart 0.0.31, apscheduler 3.10.4,
  python-nmap 0.7.1, pyyaml 6.0.2, websockets 13.1, httpx 0.27.2, zeroconf 0.149.16,
  aiomqtt 2.3.0.
- Total source: 129,571 lines of Python and TypeScript (48,743 backend app, 28,551
  backend tests, 75,638 frontend, 5,085 mcp), 765 tracked paths in the git tree.

Source URLs: `https://github.com/Pouzor/homelable/pkgs/container/homelable-backend`,
`.../Dockerfile.backend`, `.../backend/requirements.txt`, `.../scripts/install-baremetal.sh`.

### F9. The frontend is a plain static Vite bundle with no cross-origin API knob. [verified]

Claim: the built SPA is portable static output, but its API base URL is hardcoded to be
same-origin and relative. There is no environment variable that points it at a different
origin.

Evidence (`frontend/src/utils/basePath.ts`, `frontend/vite.config.ts`,
`Dockerfile.frontend`):
- `API_BASE_URL = withBase('api/v1')`, where `withBase` prefixes `BASE_PATH`, which is
  derived from `import.meta.env.BASE_URL`. The result is always a root-relative path
  such as `/api/v1` or `/homelab/api/v1`. Never an absolute URL.
- The axios instances are created with `baseURL: API_BASE_URL` and `withCredentials:
  true`. The WebSocket is built from `window.location`. So every API call and the
  status socket are same-origin by construction.
- The only two build-time environment variables in the entire frontend are
  `VITE_BASE_PATH` (default `/`) and `VITE_STANDALONE` (default `false`). A grep for
  `VITE_` across `frontend/src`, `frontend/vite.config.ts`, `frontend/index.html`,
  `docker/` and `.env.example` finds no third one. There is no `VITE_API_URL`.
- `VITE_STANDALONE=true` produces a build with no backend at all: the canvas persists
  to `localStorage` via `frontend/src/utils/standaloneStorage.ts`, there is no login,
  and scanning, imports, device inventory, floor-plan upload and live view are hidden.
- `VITE_BASE_PATH` is baked in at build time, not runtime: "Read by docker-compose at
  *build* time (docker compose build frontend), since the prefix is baked into the
  frontend bundle" (`.env.example`). Changing the prefix requires a rebuild.
- The output is ordinary Vite static assets copied into `/usr/share/nginx/html`, so it
  can be served by any static host. There is no server-side rendering and no Node
  runtime in the serve stage.
- `CORS_ORIGINS` defaults to `["http://localhost:5173","http://localhost:3000"]` and is
  rejected if it contains `*` when `AUTH_MODE=oidc`.

Source URLs: `.../frontend/src/utils/basePath.ts`, `.../frontend/vite.config.ts`,
`.../Dockerfile.frontend`, `.../.env.example`.

### F10. The one thing Homelable cannot do is the thing the redesign needs, and a user has already asked for it. [verified]

Claim: Homelable cannot observe a host or a network segment it cannot route to. The
maintainer has been asked for exactly a lightweight per-segment agent and the issue is
still open.

Evidence:
- Issue #465, "[feature request] Standalone lightweight agent", created
  2026-09-10T16:06:49Z, state `open`, 0 comments, no assignee, no linked PR. Body: "I
  deploy my services across a number of Raspberry Pi's, but each host only has traefik
  exposed to the LAN. This means that all the containers behind it are invisible to
  homelable ... Additionally I have several network segments, including things like
  cloud providers and tailscale network, that my base homelable instance cannot (easily)
  reach and scan. I suggest a simple, lightweight agent, able to be deployed
  baremetal/lxc/docker ... It would allow network scans to be conducted from varying
  locations ... For docker deployments, the docker socket could be mounted ... Bonus
  points if it can read traefik labels ... It could then report this information back to
  the main homelable host to produce a unified network/service map."
- Issue #502, "more then one proxmox", created 2026-09-19, state `open`, 3 comments.
  One Proxmox server per install, configured by `.env`. The v3.6.0 fix #558 addressed
  the *link erasure* on a second import but the multi-source feature request remains
  open.
- Issue #473, "feat(kubernetes): read-only Kubernetes topology (revives #385)", is an
  open draft PR. Its body documents that it was verified "Running in-cluster on a
  6-node Talos cluster, via a `list`-only ServiceAccount" and produced
  "state=fresh objects=275 relationships=288". So even Kubernetes topology is collected
  by the backend running *inside* the cluster, not by an agent phoning home.
- Issue #242, "[V3] - Monitoring Integration & Plugin System", created 2026-06-29,
  state `open`, labelled `enhancement, v3`. No plugin or agent extension point exists
  today.

Source URL: `https://github.com/Pouzor/homelable/issues/465`.

### F11. Merge and dedupe logic is the most reusable code in the repository, and it is MIT. [verified]

Claim: the hard part of "many sources, one inventory" is already solved here, and the
licence permits lifting it.

Evidence:
- `LICENSE` is the MIT License, "Copyright (c) 2026 Remy Jardinet". No CLA file, no
  contributor licence agreement in the tree.
- `backend/app/services/device_merge.py` (23,463 bytes), `node_dedupe.py` (7,054
  bytes), `inventory_sync.py` (53,969 bytes), `fingerprint.py` (7,959 bytes),
  `mac_utils.py` (1,261 bytes) implement: matching a device across sources by MAC
  (including unpadded versus padded MAC forms), by IEEE address, and by IP; keeping
  every source that has observed a row in `discovery_sources`; refusing to let a bare
  IP match overwrite a row's MAC on DHCP lease reuse (issue #545, still open, #466
  still open); and overlaying an inventory row onto a canvas node per canvas via
  `hydrated_node`.
- `backend/tests/test_device_merge.py` is 28,508 bytes and
  `backend/tests/test_inventory_sync.py` is 82,552 bytes. The merge rules are heavily
  tested.
- The v3.6.0 changelog entry for #558 records the failure mode this logic guards:
  "Importing a second Proxmox server, Zigbee2MQTT instance or Z-Wave controller erased
  the links of the one imported before."
- A sibling repository, `Pouzor/homelable-hacs` (Home Assistant integration, also MIT,
  187 stars, 15 open issues, last push 2026-10-02T08:53:02Z), demonstrates the same
  backend being consumed from a second front end.

Source URLs: `https://github.com/Pouzor/homelable/blob/main/LICENSE`,
`.../backend/app/services/inventory_sync.py`, `.../backend/app/services/device_merge.py`.

### F12. Configuration surface: roughly 60 environment variables, all server-side. [verified]

Claim: everything about sources, credentials, intervals and read-only public surfaces is
set by environment, with no admin UI for most of it.

Evidence (`backend/app/core/config.py`, 430 lines; `.env.example`, 138 lines):
- Auth: `SECRET_KEY`, `AUTH_MODE` (local|oidc), `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`,
  `ACCESS_TOKEN_EXPIRE_MINUTES` (default 1440), `ALGORITHM` (HS256), plus `OIDC_*`
  (discovery url, client id, client secret, redirect uri, scopes, cookie secure,
  session expire minutes default 480 with a 5..1440 bound, transaction expire seconds
  default 600 with a 60..3600 bound).
- Storage: `SQLITE_PATH`, `UPLOAD_DIR`, `CORS_ORIGINS`.
- Scanner: `SCANNER_RANGES` (default `["192.168.1.0/24"]`),
  `SCANNER_VERSION_HOST_TIMEOUT` (60), `SCANNER_DEEP_HOST_TIMEOUT` (2700),
  `SCANNER_HTTP_RANGES`, `SCANNER_HTTP_PROBE_ENABLED`, `SCANNER_HTTP_VERIFY_TLS`.
- Monitoring: `STATUS_CHECKER_ENABLED` (default true), `STATUS_CHECKER_INTERVAL` (60),
  `SERVICE_CHECK_ENABLED` (false), `SERVICE_CHECK_INTERVAL` (300).
- Keys: `MCP_SERVICE_KEY`, `LIVEVIEW_KEY`, `DOCS_VIEW_KEY`, `HOMEPAGE_API_KEY`.
- Per-source, one instance each: `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`,
  `PROXMOX_HOST`, `PROXMOX_PORT` (8006), `PROXMOX_VERIFY_TLS`, `PROXMOX_SYNC_ENABLED`,
  `PROXMOX_SYNC_INTERVAL` (3600, floor 300); `UNRAID_*`; `UNIFI_USERNAME`,
  `UNIFI_PASSWORD`, `UNIFI_URL`, `UNIFI_HOST`, `UNIFI_PORT` (8443), `UNIFI_SITE`,
  `UNIFI_VERIFY_TLS`, `UNIFI_SYNC_*`; `ZIGBEE_MQTT_*` (host, port 1883, username,
  password, base topic `zigbee2mqtt`, tls, tls insecure, sync enabled, sync interval,
  include mesh links, networkmap timeout); `ZWAVE_MQTT_*` (prefix `zwave`, gateway name
  `zwavejs2mqtt`); `MQTT_RESPONSE_TIMEOUT` (300).
- A `scan_config.json` override file is loaded at startup by `settings.load_overrides()`,
  but the v3.5.1 changelog records that `UNIFI_HOST`/`UNIFI_PORT` became env-only
  because a saved Settings section used to shadow `.env` (#543).
- There is no runtime setting for the API base URL, no multi-tenancy, and no per-source
  list. Adding a second Proxmox is a code change plus a restart, not a configuration
  change.

Source URLs: `.../backend/app/core/config.py`, `.../.env.example`.

### F13. Python-version configuration in the repository is internally inconsistent. [verified, low severity]

Claim: the shipped runtime is Python 3.13, but the lint, type-check and CI
configuration targets older versions, so CI does not exercise the version that ships.

Evidence: `Dockerfile.backend` and `mcp/Dockerfile.mcp` both use `python:3.13-slim`.
`backend/requirements.txt` carries the comment "Requires Python 3.13+ (3.14 not yet
supported by pydantic-core)" and `scripts/install-baremetal.sh` fails fast on Python
3.14 with "Install Python 3.13 with its venv module". Against that, `backend/pyproject.toml`
sets `target-version = "py310"` for ruff and `python_version = "3.10"` for mypy, and
`.github/workflows/quality.yml` runs the backend job on `python-version: '3.11'` while
the mcp job runs on `'3.13'`. The 3.11 job passing means the code is in fact compatible
with 3.11, so the "3.13+" comment is conservative rather than a hard floor. The
practical consequence for a reuser is that the tested matrix and the shipped matrix are
not the same.

Source URLs: `.../backend/pyproject.toml`, `.../.github/workflows/quality.yml`,
`.../backend/requirements.txt`.

### F14. Licence and consequence: MIT, permissive, no copyleft obligation. [verified]

Claim: Homelable can be forked, embedded, or stripped for parts with attribution only.

Evidence: `LICENSE` is the MIT License, copyright 2026 Remy Jardinet. There is no
`CONTRIBUTING.md` clause requiring a CLA (the file exists, 7,266 bytes, and covers
development workflow), no `AGPL`/`GPL`/`BUSL` component anywhere in the dependency
list, and the frontend overrides pin `hono`, `esbuild` and `form-data` for supply-chain
reasons rather than licence reasons. The sibling `Pouzor/homelable-hacs` is also MIT.
The consequence for the redesign is that the data model, the merge rules and the API
shape can be lifted into a differently-licensed project without any obligation to
publish the derivative, which is not true of, for example, an AGPL-licensed
alternative.

Source URL: `https://github.com/Pouzor/homelable/blob/main/LICENSE`.

---

## 2. What this changes for the redesign

Written against the operator's two new requirements.

### 2.1 Requirement (a): "code written can be used/swapped over to cloudflare or to these hosted backends"

Homelable does not help with this requirement at all, and pretending otherwise would
cost the redesign time. It is a homelab visualiser with a Python backend
(`fastapi`, `sqlalchemy`, `aiosqlite`, `apscheduler`, `python-nmap`, `zeroconf`,
`aiomqtt`). None of that runs on Workers. There is no Workers runtime, no
`workerd` compatibility, no portable application-code story. What it does supply is
two narrower and genuinely useful things.

**R1. Copy the inventory-versus-presentation split into the control plane's state model.
[recommended, based on F3]**

`device_inventory` owns what a machine is; `nodes` owns how one canvas draws it, with
`display_view` deciding which facts that canvas shows. That is exactly the shape the
redesign needs, and it is the part most home-grown designs get wrong by storing
`ip`, `status` and `check_method` on the canvas object, which then cannot be shared
between a topology view, a rack view and an inventory list.

Concretely: in the Durable Objects schema, the authoritative record is the *device*
(identity, addresses, discovered services, hardware facts, check method, live status,
`discovery_sources`), and the *node* is a per-view projection carrying position, size,
icon and which facts are visible. This is what lets one server report facts once and
appear correctly on every view. Adopt the same two-column discipline Homelable uses:
`status` is the inventory lifecycle (pending/approved/hidden) and `status_live` is
reachability. Conflating those two is the bug Homelable's own comments warn about.

**R2. Adopt the "OpenAPI generated from the code" discipline, and generate the agent's
client from the same schema. [recommended, based on F6]**

Homelable's `docs/api.md` claims the reference "is generated from the code itself, so
it never drifts from what the server actually accepts". That is the property the
portability requirement actually depends on: if the Workers SPA, the Rust agent and the
orchestrator all talk to one schema that is derived from the server rather than
hand-written three times, then swapping the backend underneath is a matter of
implementing the same contract. Generate the OpenAPI document from the control plane,
serve it at an authenticated path (Homelable's mistake is serving `/openapi.json`
unauthenticated, F6), and generate the agent's Rust client from it.

**R3. Do not fork the frontend. [recommended, based on F8, F9]**

75,638 lines of TypeScript/TSX, 207 test files, React 19 plus `@xyflow/react` 12 plus
Tailwind 4 plus zustand, 44 node types, three canvas kinds, a rack renderer, a markdown
documentation space with three-way merge, and a walkthrough. Forking that means owning
all of it. Two cheaper options, in order of preference:

- Use Homelable as-is as one module behind the tunnel, driven over its REST API by the
  new control plane. It is MIT, so this is allowed indefinitely. Its role becomes "the
  topology visualiser", not "the dashboard".
- Build the SPA fresh against the control plane's own API, and borrow only the data
  model from R1.

**R4. If the SPA does go on Workers, the same-origin constraint is a feature, not an
obstacle. [verified, based on F9 and the existing `reference/wrangler.toml`]**

`API_BASE_URL` is always root-relative and the WebSocket is built from
`window.location` (F9). So a Homelable SPA hosted as Workers static assets will call
`/api/v1/...` on the Worker's own hostname. The Worker already sits in exactly the right
place to answer that: a `fetch()` to the VPC Service binding, or a route through the
tunnel. No fork, no CORS change, no `VITE_API_URL` to add. The three settings that must
be correct are `CORS_ORIGINS` (must list the Worker origin, and must not be `*` under
OIDC), `OIDC_REDIRECT_URI` (must be the Worker hostname, because the callback path is
`/api/v1/auth/oidc/callback` and therefore same-origin too), and the WebSocket route
(Workers can proxy the upgrade; the nginx config in `docker/nginx.conf` shows the
required `Upgrade`/`Connection` headers).

Note the one real gap: `docs/api.md` states "there is currently no scripting path in
OIDC mode" (issue #291). If the control plane needs to drive Homelable while a human
uses OIDC login, that is a change to Homelable, not a configuration change. The
workaround that exists today is the non-expiring `X-MCP-Service-Key`, which `docs/api.md`
itself calls a root credential.

**R5. Portability of *application* code needs a different answer entirely, and this
repository is not it. [finding]**

Nothing in Homelable makes a workload runnable on both Cloudflare and self-hosted
metal. The mechanism the redesign needs is the one the operator's own
`reference/dataplane-client.ts` already sketches: one interface, two implementations,
chosen by binding. Homelable is evidence that the ecosystem has no such thing either.
The transferable idea from this file is limited to the state shape and the API
discipline in R1 and R2.

### 2.2 Requirement (b): one small agent binary per server instead of many heavy ones

This is where Homelable is most useful, and it is useful mainly as confirmation that
the operator's instinct matches an unmet need in the field.

**R6. Homelable is direct evidence for the requirement. [verified, based on F10]**

Issue #465 is a user describing the operator's exact architecture from the other side:
several network segments, several Raspberry Pis, containers behind a reverse proxy that
are invisible to the scanner, cloud and Tailscale segments the central instance cannot
reach. Their requested answer is "a simple, lightweight agent, able to be deployed
baremetal/lxc/docker" that "could then report this information back to the main
homelable host to produce a unified network/service map". The issue is open with zero
comments since 2026-09-10. The gap is real, it is current, and nobody has filled it.

**R7. Do not use Homelable's LAN discovery as the agent's discovery model. [recommended,
based on F2, F5]**

The scanner needs `CAP_NET_RAW`, reads `/proc/net/arp`, shells out to nmap, and browses
mDNS. That is the right design for one box that owns a subnet and the wrong design for
an agent on every server. An agent should report what it can see without privilege and
without raw sockets: its own containers and their labels, its own listening sockets, its
own service endpoints, its own metrics. The control plane merges. Homelable's ARP
comment in the README is the general lesson: a collector one network hop away from the
thing it observes loses the layer-2 facts, and no amount of agent design fixes being on
the wrong segment.

**R8. Do use Homelable's status-check shape for the agent's probe half. [recommended,
based on F5]**

`status_checker.py` plus the relevant part of `scheduler.py` is roughly 300 lines of
Python and it encodes decisions the redesign would otherwise have to rediscover:
- Seven check methods with an explicit `none`, so a device can be tracked without being
  probed.
- Ping RTT is parsed from ping's own stdout, not from timing the subprocess, because
  two probes at ping's default 1 s interval take about a second of wall clock however
  fast the replies arrive. Timing the subprocess measures the tool's pacing, not the
  network.
- A `host` starting with `-` is rejected, because `check_target` is attacker-influenced
  and the ping and tcp branches shell out.
- One probe per *device*, not per view, so one host cannot report three different states.
- Results are persisted one commit per cycle, not per device, because SQLite has a
  single write lock and per-device commits made the queue back up and drop cycles.
- Each result is broadcast the moment its probe answers, independently of the batch
  write, so the UI is not held hostage to the slowest device or to the database.

The Rust equivalent is a few hundred lines with no APScheduler and no Python. This is
the single most directly portable piece of logic in the repository.

**R9. Lift the merge and dedupe rules, do not re-derive them. [recommended, based on
F11]**

"Many sources, one inventory" is where the bugs live, and Homelable has already found
several of them and written them down: matching padded against unpadded MACs; refusing
to let a bare IP match overwrite a row's MAC when a DHCP lease is reused (#466, #545);
addressing Zigbee links by stable IEEE address rather than row id so a re-import
resolves; keeping every source in `discovery_sources` so a device found by both a scan
and a Proxmox import appears under both filters; and never letting a second import erase
the first import's links (#558). These are MIT-licensed and covered by
`test_device_merge.py` (28,508 bytes) and `test_inventory_sync.py` (82,552 bytes). A
Rust agent that reports facts into a control plane needs the same rules on the receiving
end.

**R10. The MCP server is not the control channel. [recommended, based on F7]**

It is a third FastAPI process on port 8001 that re-exports the backend's REST API to AI
clients through 25 tools, using a non-expiring `X-MCP-Service-Key` that `docs/api.md`
calls a root credential, and the project's own guidance is to firewall it to the LAN.
That is the opposite of the redesign's shape. The control channel between the Worker and
the per-server agent should be outbound-only from the agent, authenticated per-agent
with a revocable credential, and should not require a third process on any box. If the
operator wants an AI surface on the control plane, build it in the Worker against the
control plane's own API rather than adopting Homelable's proxy.

**R11. The single agent binary needs three jobs, and Homelable supplies a reference
implementation for exactly one of them. [finding, based on F2, F5, F10, F11]**

| Agent job | Homelable's position |
|---|---|
| Tunnel connector | Absent. Homelable has no outbound dial and no tunnel client. This is what `cfrs` (E6) is for. |
| Outbound control channel to the orchestrator | Absent, and explicitly requested as issue #465. |
| Local facts collector and probe | Present, in `status_checker.py` and `scanner.py`, and the merge rules on the receiving side are present in `device_merge.py` and `inventory_sync.py`. |

So the honest assessment is: Homelable is a reference implementation of the *data* half
of the agent and of the *merge* half of the control plane, and nothing else. It is not a
data-plane agent (refuted: F2, F10) and it is not a dashboard to adopt wholesale
(refuted as a fork; plausible as a driven module: F8, F9).

### 2.3 Two corrections to the existing spec

**R12. The spec's per-box stack should be justified against this evidence. [finding]**

The current topology in `SPEC.md` shows one `cloudflared` per machine plus an
orchestrator on Box A. Homelable's issue #465 and its own Docker topology (three
containers, 202 MiB compressed, F8) are the case for the operator's instinct: a stack of
general-purpose daemons per box is what users are actively asking to replace with one
small agent. The redesign should state the agent's total footprint as a number and
compare it against this figure, because 202 MiB across three images plus nmap plus
Python plus Node for the build is the concrete cost of the alternative.

**R13. Do not plan on Homelable reaching the data plane through the tunnel. [finding]**

Homelable assumes it can reach everything it monitors. Under the redesign's topology the
data plane has no inbound path, so Homelable-as-backend cannot scan or probe it. Either
Homelable runs on the control-plane box and is fed by the control plane over its REST
API (which works today, F6), or it is not used. There is no configuration that inverts
its direction.

---

## 3. Not covered / open questions

Named precisely, each with what would settle it.

**O1. Whether Homelable's REST API can carry the redesign's full fact model.**
Read: the node and edge schemas, the inventory schema, the OpenAPI document. Not read:
whether `POST /api/v1/nodes` accepts arbitrary additional properties without a schema
change, and whether `PATCH` merges or replaces `services` the way it replaces
`properties`. `docs/api.md` states `properties` is replaced wholesale and is silent on
`services`. Settled by: reading `backend/app/schemas/nodes.py` and posting a probe
against a running instance.

**O2. Homelable's behaviour under concurrent writers.**
The v3.6.0 changelog records that status checks hit "database is locked" at scale and
that the fix batches a cycle into one commit. Unknown: the inventory size at which that
started, and whether the scan writer and the status writer still contend. The figure is
not published. Settled by: issue #539's report or a load test.

**O3. Whether issue #465 will be implemented, and by whom.**
Open since 2026-09-10 with zero comments. One maintainer (copyright holder), 216 forks,
34 open issues. If the operator wants a per-segment agent from Homelable, he would be
writing it. Settled by: watching the issue, or asking.

**O4. Whether the standalone frontend build can be hosted on Workers static assets
unmodified.**
The build output is plain Vite static files (F9), so it should be. Not tested: no
`wrangler` deploy was run. The one risk is asset path handling under a non-root
`VITE_BASE_PATH` combined with Workers' `not_found_handling =
"single-page-application"`. Settled by: building and deploying it.

**O5. The WebSocket through the Worker.**
`docker/nginx.conf` shows the required `Upgrade` and `Connection` headers. Whether
Workers static assets plus a `fetch()` to a VPC Service binding can carry the
`/api/v1/status/ws/status` upgrade was not tested. Settled by: a probe Worker.

**O6. OIDC scripting path (Homelable issue #291).**
`docs/api.md` states there is none. If the control plane must drive Homelable while a
human logs in through OIDC, the only machine credential is the non-expiring
`X-MCP-Service-Key`. Settled by: reading issue #291 or testing.

**O7. Whether the Home Assistant sibling (`Pouzor/homelable-hacs`) reuses the same data
model.**
Not read. It is MIT, TypeScript, 187 stars, last push 2026-10-02T08:53:02Z. If it shares
the model, that is a second consumer of the same contract and therefore more evidence
that the contract is stable. Settled by: reading its source.

**O8. Licence of the Cloudflare-side code the operator will write.**
Out of scope for this file. Noted only because R1 and R9 recommend lifting MIT-licensed
logic, and the derivative's own licence is the operator's decision.

**O9. Not covered at all in this file: the other five research topics.**
E2 CoreObs, E3 omnyssh, E4 ServerBee, E5 mirrord and E6 cfrs were not read. In particular
the "one small agent binary per server" comparison needs E4 (ServerBee's agent-to-server
transport) and E6 (cfrs as the tunnel connector) before any of R6 to R11 can be turned
into a build decision. This file establishes only that Homelable is not the agent and
that the need is unmet.
