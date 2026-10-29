# B4 - Remote access tunnels

Topic: B4-remote-access-tunnels
Read date for every source below: 2026-10-29 (UTC, read from the host with `date -u`).

Method: all research went through the pkgforge tinyfish gateway
(`https://search.web.pkgforge.dev/search?...&provider=tinyfish` and
`https://read.web.pkgforge.dev/?url=...&provider=tinyfish`) plus the authenticated
GitHub API via `gh api`. No fallback to the built-in web_search/web_fetch tools was
needed. Transient gateway errors occurred three times (HTTP 504 on the newt README,
HTTP 502 on the zrok self-hosting guide, HTTP 422 on a docs.pangolin.net path) and
each was retried once after a `sleep` and then succeeded, so every figure below comes
from a call that returned a body.

Scope note: this file covers the tunnel / remote-access layer only. Cloudflare
Tunnel, Workers VPC and Zero Trust are covered in depth by A1 and A5 in this same
research set; they appear here only where they answer one of the three named use
cases.

---

## 1. Findings

### 1.1 Pangolin (fosrl) - the closest thing to a self-hosted Cloudflare Tunnel control plane

**Claim.** Pangolin is an open-source SASE platform: a WireGuard-based zero-trust VPN,
a tunneled reverse proxy with identity and access control, privileged access
management (SSH with short-lived certificates and just-in-time account creation), and
an identity-aware AI gateway, all behind one dashboard and one policy model. It is the
most complete self-hosted analogue of Cloudflare Tunnel plus Cloudflare Access that
exists, and it is the only project in this survey whose control plane has a
documented, permissioned REST API plus a declarative config format.

**Evidence.**
- GitHub: `fosrl/pangolin`. 23,263 stars. Language TypeScript. License reported by the
  API as `NOASSERTION`. 121 open issues. `pushed_at` 2026-10-29T01:38:18Z (i.e. the day
  of this read). Repo size 96,195 KB. Topics include `zero-trust-network-access`,
  `wireguard`, `sase`, `pam`, `remote-access`, `tunneling`.
- Latest release 1.25.3, published 2026-10-23T14:08:31Z. 1.25.2 on 2026-10-22, 1.25.1
  and 1.25.0 on 2026-10-21. Release cadence is days, not months.
- README (read via the gateway, fetched_at 2026-10-29T11:47:31Z): "Pangolin is an
  open-source SASE platform, built on WireGuard(R), with a simple mission: connect and
  protect your users". Components named in the README: zero-trust VPN, zero-trust
  reverse proxy, privileged access management, identity-aware AI gateway.
- Source layout (from `gh api repos/fosrl/pangolin/git/trees/HEAD?recursive=1`):
  `server/` (Express API + Next.js `src/` UI), `server/routers/` with 40+ route groups
  including `site`, `resource`, `target`, `client`, `ssh`, `policy`, `role`, `user`,
  `apiKeys`, `blueprints`, `healthChecks`, `auditLogs`, `newt`, `gerbil`, `olm`,
  `traefik`, `domain`, `certificates`, `labels`, `remoteExitNode`. `server/openApi.ts`
  builds an `OpenAPIRegistry` from `@asteasolutions/zod-to-openapi`. `cli/` holds
  `pangctl`, an admin CLI (setAdminCredentials, rotateServerSecret, exportBlueprints,
  and similar). `config/ha-reference/` ships a two-node HA compose reference using
  Traefik, PostgreSQL and Redis. `install/` is a Go installer that renders the compose
  file.
- Stack (from `package.json`): Next.js, Express, Drizzle ORM, `better-sqlite3` or
  `pg` (a `set:sqlite` / `set:pg` script picks the driver), `@xterm/xterm` for the
  browser terminal, `@novnc/novnc` for browser VNC, `@devolutions/iron-remote-desktop`
  and `-rdp` for browser RDP, `acme-client` for certificates, `arctic` for OIDC,
  `@simplewebauthn/*` for passkeys.
- Deployment (from `install/config/docker-compose.yml`): `pangolin` container with a
  declared memory limit of 2 GB and a reservation of 512 MB; optional `gerbil`
  (WireGuard interface manager) publishing UDP 51820, UDP 21820, TCP 443 and UDP 443;
  `traefik:v3.7.16`; optional `postgres:18` and `redis:8-trixie` on an internal
  `backend` network. The `gerbil` service runs with `cap_add: NET_ADMIN, SYS_MODULE`.
- API surface (from the source): the API server is Express with prefix `/api/v1`
  (`server/apiServer.ts`), with CORS, CSRF protection, helmet, rate limiting, and a
  separate `#dynamic/routers/external` authenticated router.
- Integration API (from `https://docs.pangolin.net/manage/integration-api`, fetched
  2026-10-29T11:51:34Z): REST, Bearer token auth. Two key types: Organization API Keys
  (scoped to one org) and Root API Keys (cross-org, self-hosted editions only).
  Per-action permissions are selected when the key is created. OpenAPI JSON and YAML
  are served at `/v1/openapi.json` and `/v1/openapi.yaml`, Swagger UI at `/v1/docs`.
  Self-hosted requires `flags.enable_integration_api: true` and the API listens on
  `server.integration_port`, default 3003.
- Concrete API routes (from
  `https://docs.pangolin.net/manage/common-api-routes`, fetched 2026-10-29T11:51:52Z):
  `PUT /org/{orgId}/site` creates a site of `type: "newt"` and returns `siteId`,
  `niceId`, `address` (a `100.90.128.0/24`-style WireGuard subnet) and the one-time
  `newtId` and `secret`. `GET /org/{orgId}/pick-site-defaults` returns
  `newtId`/`newtSecret`/`clientAddress`. Sites are addressable by a human-readable
  `niceId` (for example `warehouse-west`) as well as by numeric id.
- Stability warning, quoted from the same docs page: "Pangolin is in heavy development.
  The REST API routes and behavior may include breaking changes between updates."
- Live bug in that API, from
  `gh api repos/fosrl/pangolin/issues?state=open&per_page=5`: issue 4014, "Integration
  API - Alert routes & health check routes are returning 403 even with a root godmode
  key", created 2026-10-27T20:28:16Z, 9 comments. Open.
- Resource model (from
  `https://docs.pangolin.net/manage/resources/understanding-resources`, fetched
  2026-10-29T11:56:06Z): **public resources** (HTTP/HTTPS, SSH, RDP, VNC, AI Gateway,
  TCP, UDP) get a public FQDN and are browser-accessible; **private resources** are
  reachable only through the Pangolin client. SSH, RDP and VNC public resources
  require a "Pangolin Site"; HTTP/HTTPS, AI Gateway and TCP/UDP can also run on
  "Local Site" and "basic WireGuard" sites. The docs state plainly that TCP and UDP
  resources "do not enforce Pangolin authentication or access rules" because they are
  not protocol-aware.
- SSH specifically (from `https://docs.pangolin.net/manage/ssh` and
  `.../manage/resources/private/ssh`, fetched 2026-10-29T11:55:47Z and 11:55:54Z):
  two modes. "Pangolin SSH mode" executes sessions directly on the site-connector host
  via the connector, needs no OpenSSH server on the host, and requires the site to run
  as root (containerised installs are explicitly unsupported for this mode). "Standard
  SSH Server mode" routes to an OpenSSH server over the network and supports
  automated provisioning with PAM. Public SSH resources are browser-rendered; private
  SSH resources are reached with `pangolin ssh <alias>`. Automated provisioning signs
  short-lived certificates from an org CA and creates accounts on the host just in
  time, with sudo and group membership driven by role.
- Licensing (read from `fosrl/pangolin/contents/LICENSE`, fetched 2026-10-29): the
  repository is a mix. Files with a header naming the "Fossorial Commercial License"
  are proprietary. Files with an AGPL-3 header are AGPL-3. Files with no header are
  AGPL-3 by default. The README states: "Pangolin is dual licensed under the AGPL-3 and
  the Fossorial Commercial License" and that the Enterprise Edition is "free for
  personal and hobbyist use, and for businesses making less than $100K USD gross
  annual revenue".

**Label: [verified]** for every claim above (all from `gh api` calls or gateway reads
on 2026-10-29). One caveat is unverified: which specific files carry the commercial
header. I did not enumerate per-file headers, so "which pieces are AGPL and which are
proprietary" is **[unverified]** at file granularity.

### 1.2 The Pangolin component repos - these are the actual repurposable pieces

**Claim.** Pangolin's tunnel machinery is split into small Go repositories that are
individually liftable. The browser-terminal piece in particular is a single file with
two modes.

**Evidence.**
- `fosrl/newt` - "Tunneled network connector for Pangolin". Go. AGPL-3.0. 919 stars.
  34 open issues. `pushed_at` 2026-10-28T13:43:03Z. Latest release 1.19.0,
  2026-10-20T21:51:06Z. README (fetched 2026-10-29T11:48:55Z) carries a prominent
  notice: "Newt is being phased out in favor of the Pangolin CLI. Use `pangolin site
  up`". Source packages relevant here: `browsergateway/` (ssh.go, ssh_native.go, vnc.go,
  rdp.go), `nativessh/` (server.go, pam_linux.go, pty.go, auth.go), `netstack2/`
  (gVisor-style userspace TCP/IP: tun.go, proxy.go, http_handler.go), `holepunch/`
  (NAT traversal), `authdaemon/` (local auth daemon), `exitnode/`, `proxy/manager.go`,
  `healthcheck/`. It ships OpenWrt, Advantech and Teltonika packaging.
- `browsergateway/ssh.go` (read in full, fetched 2026-10-29): an
  `http.HandlerFunc` for SSH-over-WebSocket using `github.com/coder/websocket` and
  `golang.org/x/crypto/ssh`. It reads `authToken` from the query string and a `mode`
  parameter: `mode=native` (the default) connects to the local SSH daemon on the host;
  `mode=proxy` connects to an arbitrary host and port supplied in query parameters.
  Browser-to-proxy messages are JSON with `type` in {`auth`, `data`, `resize`} and
  carry `password`, `privateKey` or `certificate`. Proxy-to-browser messages are
  `{type, data, error}`. This is a complete, small, dependency-light browser terminal
  backend.
- `browsergateway/browsergateway.go` (read in full): the gateway HTTP server listens on
  a fixed port 39999 inside the WireGuard netstack, shared between newt and pangolin,
  and "Targets do not overlap with this port because they start at 40000". A `Target`
  is `{ID, Type ("rdp"|"ssh"|"vnc"), Destination, DestinationPort, AuthToken}` and only
  connections whose tuple matches a registered Target are forwarded. NativeSSH mode
  uses a single config-level `AuthToken`.
- `nativessh/server.go` (read in full): a real SSH server implementation with a
  `CredentialStore` holding a CA key and per-username principal sets, and
  `pam_linux.go` for PAM. This is the machinery behind Pangolin's certificate-based
  JIT user provisioning.
- `fosrl/gerbil` - "A simple WireGuard interface management server for Pangolin". Go.
  AGPL-3.0. 343 stars. 5 open issues. `pushed_at` 2026-10-26T21:05:21Z. Latest release
  1.5.2, 2026-09-18T14:23:41Z. README (fetched 2026-10-29): creates and reconfigures
  local WireGuard interfaces from a JSON file or a remote server; "The HTTP API can be
  used to remove, create, and update peers on the interface dynamically"; reports
  per-peer bandwidth every 10 seconds; listens on UDP 21820 for hole-punch packets;
  handles relaying; includes an SNI proxy.
- `fosrl/olm` - "Internal cross-platform networking library for Pangolin clients". Go.
  AGPL-3.0. 117 stars. 12 open issues. `pushed_at` 2026-10-28T20:54:24Z. Latest
  release 1.10.1, 2026-10-02T16:19:58Z.
- `fosrl/cli` - "Pangolin CLI and client for Linux, MacOS, and Windows". Go. License
  reported as `NOASSERTION`; the LICENSE file is the Fossorial Commercial License for
  headered files with AGPL-3 as the default for unheadered files. 67 stars.
  `pushed_at` 2026-10-28T13:46:59Z. Latest release 0.19.1, 2026-10-27T20:42:31Z.
  Command tree (from the git tree): `up site`, `up client`, `up client exitnode`,
  `down client`, `ssh` (connect.go, jit.go, sign.go, openssh_passthrough.go,
  native_filter.go), `scp`, `apply blueprint`, `service site`, `authdaemon`,
  `watchdog`, `status`, `logs`, `select org/account/exitnode`, `auth login/logout/status`,
  `configure claude/codex/gemini/opencode/configfile`.
- `fosrl/badger` - "Traefik middleware authentication bouncer for Pangolin". Go. MIT.
  170 stars. `pushed_at` 2026-10-21T13:52:53Z. README: a forward-auth middleware;
  `apiBaseUrl: "http://localhost:3001/api/v1"`, session cookie `p_session_token`,
  request param `p_session_request`; `disableForwardAuth: true` runs it standalone for
  Cloudflare-IP handling only.
- `fosrl/blueprints` - "A community repository of common self-hosted applications
  exposed through Pangolin". MIT. 48 stars. `pushed_at` 2026-09-28T13:42:42Z. README:
  "a blueprint is a declarative way to define resources and their settings without
  manual configuration within the dashboard"; driven by `PANGOLIN_ENDPOINT`,
  `SITE_ID` and `SITE_SECRET`; a target can reference a site by identifier
  (`site: warehouse-west`).
- `fosrl/pangolin-node` (TypeScript, AGPL-3.0, 10 stars, pushed 2026-10-26),
  `fosrl/pangolin-kube-controller` (Go, AGPL-3.0, 13 stars, pushed 2026-10-29),
  `fosrl/helm-charts` (Shell, MIT, 17 stars, pushed 2026-09-19), `fosrl/docs`
  (MDX, MIT, 14 stars, pushed 2026-10-28).

**Label: [verified].**

### 1.3 rathole - fast, tiny, and has no management API

**Claim.** rathole is a high-performance Rust reverse proxy for NAT traversal that
deliberately does not implement an HTTP layer, a dashboard or a configuration API. It
is a good wire-level building block and a bad control-plane component.

**Evidence.**
- GitHub: `rathole-org/rathole` (note: the repo moved; the README badges still point
  at `rapiz1/rathole`, and `gh api repos/rapiz1/rathole` redirects to the new
  location). Rust. Apache-2.0. 14,382 stars. 98 open issues.
  `pushed_at` 2026-08-23T15:38:44Z. Repo size 882 KB.
- Releases: `dev-latest` published 2026-08-22T20:04:47Z; the last SemVer tag is
  **v0.5.0, published 2023-10-01T10:14:10Z**. Before that v0.4.8 (2023-05-26) and
  v0.4.7 (2022-11-30).
- README (fetched 2026-10-29): "A secure, stable and high-performance reverse proxy
  for NAT traversal, written in Rust"; "an alternative to frp and ngrok". Features
  list: high throughput versus frp, "The binary can be as small as ~500KiB",
  mandatory per-service tokens, optional Noise Protocol encryption or TLS, hot reload.
  The features list states: "**Hot Reload** Services can be added or removed
  dynamically by hot-reloading the configuration file. **HTTP API is WIP.**"
- `docs/out-of-scope.md` (read in full): rathole explicitly excludes domain-based HTTP
  forwarding ("ultimately reinvent a nginx"), HTTP request logging, and frp's
  STCP/visitor model. It says "In the future, more configuration APIs will be added and
  `rathole` can be used with an external dashboard."

**Label: [verified].** The practical consequence: a Workers control plane cannot drive
rathole programmatically today. It can only rewrite a TOML file on each box.

### 1.4 zrok - sharing platform on OpenZiti, heavy to self-host

**Claim.** zrok is a share-anything platform built on the OpenZiti zero-trust overlay,
with a Go SDK for embedding. It is Apache-2.0 and actively developed, but self-hosting
it pulls in a four-service dependency stack.

**Evidence.**
- GitHub: `openziti/zrok`. Go. Apache-2.0. 4,793 stars. 122 open issues.
  `pushed_at` 2026-10-28T20:36:03Z. Repo size 44,594 KB.
- Releases: v2.0.8 (2026-10-08T18:34:11Z), v2.0.7 (2026-10-03), v2.0.6 (2026-09-29),
  v1.1.13 (2026-09-28).
- README (fetched 2026-10-29): "zrok lets you securely share web services, files, and
  network resources with anyone". Modes: `zrok share public localhost:8080`,
  `zrok share public --backend-mode drive ~/Documents`, `zrok share private
  localhost:3000`. "zrok is built on OpenZiti, a programmable zero-trust network
  overlay". Claims end-to-end encryption "even from zrok servers" and peer-to-peer
  connections when possible.
- Go SDK (from the README):
  `sdk.CreateShare(root, &sdk.ShareRequest{BackendMode: sdk.TcpTunnelBackendMode,
  ShareMode: sdk.PrivateShareMode})` and `sdk.NewListener(shr.Token, root)`.
- Self-hosting requirements (from
  `https://netfoundry.io/docs/zrok/self-hosting/deployment/linux/`, fetched
  2026-10-29T11:54:48Z, the docs.zrok.io URL redirects here): a Linux server with a
  public IP, a wildcard DNS record `*.zrok.example.com`, a wildcard TLS certificate,
  an OpenZiti controller and router, and the `zrok2`, `zrok2-controller`,
  `zrok2-frontend` and `zrok2-metrics-bridge` packages. The bootstrap script installs
  PostgreSQL, RabbitMQ and InfluxDB.

**Label: [verified].**

### 1.5 frp - the workhorse, with a read-mostly server API and a writable client API

**Claim.** frp is the most widely deployed and most actively released tunnel in this
survey. Its server-side API is essentially read-only and basic-auth; its writable API
lives on the client (`frpc`) and can create, update and delete proxies at runtime.

**Evidence.**
- GitHub: `fatedier/frp`. Go. Apache-2.0. 110,283 stars. 33 open issues.
  `pushed_at` 2026-10-23T07:52:16Z. Repo size 32,920 KB.
- Releases: v0.71.1 (2026-10-14T09:52:45Z), v0.71.0 (2026-08-14), v0.70.1 (2026-07-23),
  v0.70.0 (2026-07-11).
- `server/api_router.go` (read in full): routes registered behind `AuthMiddleware`.
  `GET /healthz` (no auth), `GET /api/serverinfo`, `GET /api/proxy/{type}`,
  `GET /api/proxy/{type}/{name}`, `GET /api/proxies/{name}`,
  `GET /api/traffic/{name}`, `GET /api/clients`, `GET /api/clients/{key}`,
  `DELETE /api/proxies/{name}`, plus a v2 set: `GET /api/v2/users`,
  `GET /api/v2/system/info`, `POST /api/v2/system/prune`, `GET /api/v2/clients`,
  `GET /api/v2/clients/{key}`, `GET /api/v2/proxies`,
  `GET /api/v2/proxies/{name}/traffic`, `GET /api/v2/proxies/{name}`. There is no
  server-side create-proxy route.
- `client/api_router.go` (read in full): `/healthz` unauthenticated, everything else
  behind basic auth. `GET /api/reload`, `POST /api/stop`, `GET /api/status`,
  `GET /api/config`, `PUT /api/config`, `GET /api/proxy/{name}/config`,
  `GET /api/visitor/{name}/config`. When `store.path` is configured: `GET`/`POST`
  `/api/store/proxies`, `GET`/`PUT`/`DELETE /api/store/proxies/{name}`, and the same
  four for `/api/store/visitors`. The README confirms store entries persist to
  `db.json` and survive frpc restarts, and take precedence over config-file proxies
  on name conflicts.
- README also documents: `webServer.addr`/`port` 7500 for the frps dashboard and admin
  API with `webServer.user`/`password`; `webServer.port` 7400 for the frpc admin UI; a
  separate `metricsServer` listener (default port 0, bound to 127.0.0.1) for
  `/healthz` and `/metrics`, with the README noting the `/healthz`, `/metrics` and
  pprof endpoints on `webServer` are deprecated; token or OIDC client auth; TLS,
  compression, bandwidth limits, TCP multiplexing, KCP and QUIC transports, health
  checks, load balancing, and a P2P mode.

**Label: [verified].**

### 1.6 NetBird - WireGuard mesh with a real public API, split-licensed

**Claim.** NetBird is a WireGuard overlay mesh with a centralised control plane, a
documented public API, a Terraform provider, browser SSH and RDP, and a reverse proxy
with automatic TLS. The client is BSD-3 but the control-plane directories are AGPLv3.

**Evidence.**
- GitHub: `netbirdio/netbird`. Go. License reported as `NOASSERTION`. 30,316 stars.
  807 open issues. `pushed_at` 2026-10-29T10:02:58Z. Repo size 177,343 KB.
- `LICENSE` file (read in full): "This BSD-3-Clause license applies to all parts of
  the repository except for the directories management/, signal/, relay/ and
  combined/. Those directories are licensed under the GNU Affero General Public
  License version 3.0 (AGPLv3)." Copyright "2022-2026 NetBird GmbH".
- Releases: v0.82.0-rc.2 (2026-10-28T19:32:31Z), v0.82.0-rc.1 (2026-10-26),
  v0.81.5 (2026-10-26T18:16:10Z), v0.81.4 (2026-10-24).
- README feature table (fetched 2026-10-29) lists, among others: kernel WireGuard,
  peer-to-peer with relay fallback, routes to external networks, domain-based DNS
  routes, exit nodes, IPv6 dual-stack overlay, **Browser SSH & RDP**, **Reverse proxy
  with auto-TLS**, admin web UI, private DNS, custom DNS zones, device posture checks,
  periodic re-authentication, **Public API**, setup keys, Terraform provider, Ansible
  collection, and an "Agent Network (Beta)" for keyless AI-agent access.
- API: `shared/management/http/api/openapi.yml` and
  `shared/management/http/apiv1alpha1/openapi.yaml` exist in the tree;
  `management/server/http/handlers/` contains `accounts`, `dns`, `events`, `groups`,
  `idp`, `instance`, `networks` (with `resources_handler.go` and `routers_handler.go`),
  `peers`, `policies` (including `posture_checks_handler.go`), `proxy`, and more.
  Docs at `https://docs.netbird.io/api` (linked from the README, not fetched).

**Label: [verified]** except the docs.netbird.io API reference, which is **[unverified]**
(linked but not read).

### 1.7 Firezone - fast Rust data plane, but the control plane is Elastic-Licensed and self-hosting is unsupported

**Claim.** Firezone has the best-engineered data plane in this survey and the weakest
self-hosting story. The Elixir control plane is source-available under the Elastic
License 2.0, not open source, and the README states production self-hosting is not
officially supported.

**Evidence.**
- GitHub: `firezone/firezone`. Primary language Elixir (with a Rust data plane).
  Apache-2.0 per the API. 9,137 stars. 364 open issues.
  `pushed_at` 2026-10-29T07:24:33Z. Repo size 444,859 KB.
- Releases are per-client artefacts, not a single version: `android-client-1.5.17`
  (2026-10-21T10:23:08Z), `apple-client-1.5.23` (2026-10-21T22:53:52Z),
  `headless-client-1.5.14` (2026-10-14T01:47:52Z).
- README (fetched 2026-10-29), self-hosting section, quoted: "The licenses permit
  self-hosting, subject to their terms. **Production self-hosting is not officially
  supported.** For development or evaluation, follow CONTRIBUTING.md to run a local
  environment." And: "Published Clients are only guaranteed to work with the managed
  service. Internal APIs change, and app store releases may lag behind this repository.
  A self-hosted portal may require Clients built from a compatible revision."
- LICENSE section of the README (read in full): content under `elixir/` is licensed
  under the Elastic License 2.0; everything else is Apache 2.0. WireGuard is a
  registered trademark of Jason A. Donenfeld.
- Gateway sizing (from `https://www.firezone.dev/kb/deploy/sizing`, fetched
  2026-10-29T11:57:29Z): Micro up to 50 clients / 1 core / 1 GB / 500 Mbps; Small up
  to 250 / 2 cores / 2 GB / 1 Gbps; Medium up to 1,000 / 4 cores / 4 GB / 2.5 Gbps+.
  "Gateways scale with CPU cores up to 4 cores, beyond which additional cores provide
  no benefit. Up to 4 GB of RAM can be used for packet buffers." "A typical Gateway on
  a 4-core Linux machine ... should be able to push 2 Gbps+ of peer-to-peer WireGuard
  traffic." Host requirements: Linux kernel 3.10+, iptables/ip6tables, Docker or
  systemd. HA guidance: "at least 3 Gateways per Site".
- The README claims 5+ Gbps on Windows and macOS and 5 Gbps on commodity Linux VMs /
  10+ Gbps on tuned hardware, and "34 relay clusters worldwide" for the managed
  service. These are vendor claims, not measurements I ran.

**Label: [verified]** for the repo, licence and sizing facts. The throughput and relay
figures are vendor claims reproduced from the README and are **[unverified]** as
independent measurements.

### 1.8 Teleport - reverse tunnels and a full API, at 1.5 GB of repo

**Claim.** Teleport does what the spec needs for (a) and (c) - browser SSH, reverse
tunnels to resources behind NAT without a bastion, session recording, and a complete
API - but it is the largest and heaviest option, AGPL-3.0, with a very large open
issue count.

**Evidence.**
- GitHub: `gravitational/teleport`. Go. AGPL-3.0. 21,044 stars. 3,248 open issues.
  `pushed_at` 2026-10-20T00:28:29Z. Repo size 1,550,373 KB (about 1.5 GB).
- Releases: v18.10.0 (2026-07-09T00:01:09Z), v18.10.0-rc.2 (2026-07-07),
  v18.10.0-rc.1 (2026-07-01). The latest tag is roughly three and a half months old
  at the time of this read.
- README (fetched 2026-10-29): "Establish secure tunnels to reach resources behind
  NATs and firewalls without VPNs or bastion hosts." Supports "SSH, Kubernetes,
  databases, RDP, cloud consoles, internal web services, Git repositories, and Model
  Context Protocol (MCP) servers". The repo "contains the Teleport daemon binary
  (written in Go) and a web UI written in TypeScript".
- Reverse tunnel machinery is first-class in the source:
  `lib/reversetunnel/` (doc.go, peer.go, conn.go, transport.go, discovery.go,
  rc_manager.go) with an ASCII diagram in doc.go showing a proxy agent dialling out to
  a proxy server, plus `lib/relaytunnel/tunnel_server.go`.
- API: `api/client/` is a documented Go client; its README points at
  `https://goteleport.com/docs/admin-guises/api/` (the actual path in the README is
  `goteleport.com/docs/admin-guides/api/`), an API architecture reference, and
  pkg.go.dev.
- Licence: the source files I read carry the AGPL-3.0 header ("GNU AFFERO GENERAL
  PUBLIC LICENSE Version 3").

**Label: [verified]** for all of the above except the goteleport.com API docs pages,
which are **[unverified]** (linked from the README, not fetched).

### 1.9 Apache Guacamole - clientless RDP/VNC/SSH, no official REST API, JVM footprint

**Claim.** Guacamole is the reference implementation of clientless remote desktop in
the browser. It is Apache-2.0 and split into a C proxy daemon plus a Java web app. Its
REST API exists but is undocumented and only reverse-engineered by third parties.

**Evidence.**
- `apache/guacamole-server`: C, Apache-2.0, 4,027 stars, 81 open issues,
  `pushed_at` 2026-10-17T00:41:46Z. Description: "The Apache Guacamole proxy daemon
  (guacd), C API (libguac), and protocol support."
- `apache/guacamole-client`: Java, Apache-2.0, 1,746 stars, 93 open issues,
  `pushed_at` 2026-10-14T21:54:05Z. Latest tag `1.6.0`; the commit that tag points at
  is dated 2025-06-19T19:32:22Z.
- README: "guacamole-client is the superproject containing all Maven-based projects
  that make up Apache Guacamole, an HTML5 web application that provides access to your
  desktop using remote desktop protocols." Building produces a `.war` for Tomcat or
  Jetty.
- No REST API in the documented surface. The tree does contain
  `guacamole/src/main/frontend/src/app/rest/services/` with `tunnelService.js`,
  `connectionService.js`, `userService.js`, `permissionService.js`, `patchService.js`
  and others, i.e. an internal API the web UI uses. Extensions present in the tree:
  `guacamole-auth-ban`, `-duo`, `-header`, `-jdbc`, `-json`, `-ldap`, `-quickconnect`,
  `-radius`, `-restrict`, `-sso`, `-totp`, `guacamole-vault`,
  `guacamole-history-recording-storage`, `guacamole-display-statistics`.
- Third-party OpenAPI: `guacamole-operator/guacamole-rest-api`, described as
  "OpenAPI definition of the Apache Guacamole REST API, which currently has no
  official documentation. The API definition is reverse-engineered from the original
  ..." (found via web search on 2026-10-29; the repo itself was not opened, so its
  stars, licence and last release are **[unverified]**).

**Label: [verified]** for the repos and the absence of a documented API; **[unverified]**
for the third-party OpenAPI repo's metadata.

### 1.10 MeshCentral - full remote management, custom protocol, no REST API

**Claim.** MeshCentral is a Node.js remote-management server with an outbound-dialling
agent, browser remote desktop, terminal and file transfer. It is Apache-2.0 and very
actively released. It exposes no REST API; automation goes through its WebSocket
messenger protocol.

**Evidence.**
- GitHub: `Ylianst/MeshCentral`. Primary language HTML (a Node.js server plus
  TypeScript/JS agents). Apache-2.0. 7,537 stars.
  `pushed_at` 2026-10-24T14:30:08Z.
- Releases: 1.3.1 (2026-10-23T16:59:57Z), 1.3.0 (2026-10-21T15:51:49Z), 1.2.6
  (2026-09-24T00:51:47Z).
- README (fetched 2026-10-29): "MeshCentral is a full computer management web site
  ... MeshCentral includes full web-based remote desktop, terminal and file management
  capability." Companion repos: `Ylianst/MeshAgent` (C, 402 stars, pushed
  2026-10-08T13:35:52Z), `Ylianst/MeshCentralAndroidAgent` (Kotlin, 69 stars,
  Apache-2.0, pushed 2026-10-08). It documents Intel AMT out-of-band management
  (`amt/` directory with `amt-manage.js`, `amt-lme.js`, `amt-mei.js`), a "MeshCentral
  Router" for TCP port mapping, NGINX reverse-proxy setup, and 2FA.
- No `api/` or `rest/` directory exists in the tree. The agent protocol is
  `agents/meshcore.js` plus `agents/modules_meshcore/*`, and the server is
  `meshcentral.js`.

**Label: [verified].**

### 1.11 ttyd and gotty - the two canonical browser terminals, one alive and one dead

**Claim.** ttyd is the right small building block for a browser terminal: a single
static C binary, MIT, xterm.js in the browser, basic auth or a reverse-proxy auth
header, and a `--base-path` flag for mounting behind a proxy. gotty is dead.

**Evidence.**
- `tsl0922/ttyd`: C, MIT, 12,562 stars, 128 open issues,
  `pushed_at` 2026-08-12T03:39:18Z, repo size 20,567 KB. Latest release **1.7.7,
  published 2024-03-30T03:18:34Z**. The most recent commits are 2026-08-12
  ("html: add viewport meta tag for mobile browsers (#1564)", "update msvc build"),
  2026-03-20 and 2026-03-19. So the project receives commits but has not cut a
  release in roughly two and a half years.
- ttyd README (fetched 2026-10-29): built on libuv and WebGL2, xterm.js client with
  CJK and IME support, ZMODEM/trzsz file transfer, Sixel image output, SSL via OpenSSL
  or mbed TLS. Command-line options read in full include: `-p/--port` (default 7681),
  `-i/--interface` (also accepts a UNIX socket path), `-c/--credential` (basic auth
  `username:password`), `-H/--auth-header` (delegate auth to a reverse proxy),
  `-W/--writable` (readonly by default), `-m/--max-clients`, `-b/--base-path` (for a
  reverse proxy), `-O/--check-origin`, `-I/--index` (custom index.html), and
  `-A/--ssl-ca` for client-certificate verification. The README names Wetty and gotty
  as alternatives.
- `yudai/gotty`: Go, MIT, 19,556 stars, 159 open issues,
  repo size 6,932 KB, `pushed_at` **2024-08-01T18:50:55Z**. Latest release
  **v2.0.0-alpha.3, published 2017-12-13T08:57:36Z**; before that v1.0.1 (2017-08-08)
  and v1.0.0 (2017-05-21). The three most recent commits are dated 2017-12-13,
  2017-11-25 and 2017-11-24. The project has been effectively unmaintained since 2017.

**Label: [verified].**

### 1.12 ShellHub - the purpose-built answer for "SSH without port 22"

**Claim.** ShellHub is an SSH gateway where every device dials out and every login is
tied to a named person, with default-deny policies and session logging, reachable with
the stock OpenSSH client. It is Apache-2.0 and has a generated REST API.

**Evidence.**
- GitHub: `shellhub-io/shellhub`. Go. Apache-2.0. 2,243 stars.
  `pushed_at` 2026-10-29T11:36:07Z.
- Releases: v0.28.0 (2026-10-28T13:57:11Z), v0.27.4 (2026-10-27T02:07:40Z), v0.27.2
  (2026-10-24T17:00:36Z).
- README (fetched 2026-10-29), quoted: "ShellHub is an SSH gateway that ties every
  login to a person on your team. A small agent on each device dials out to the
  ShellHub server, and you reach the device through the server with `ssh`, `scp`,
  `sftp` or the browser. The device needs no public IP or inbound port". Features:
  standard OpenSSH/PuTTY/scp/sftp work unchanged, web terminal, "SSH Identities"
  (no `authorized_keys`, removing a person ends their access everywhere at once),
  default-deny access policies with optional re-authentication per session, session
  logging with user, source IP and device, tags, and packages for Yocto, Buildroot,
  FreeBSD and Snap.
- Editions table from the README: Community (this repository, Apache 2.0); Cloud adds
  MFA, server-side recording, web endpoints, more namespaces; Enterprise adds SAML SSO.
  So the web terminal and the standard SSH path are in Community, while "web
  endpoints" are a paid-tier feature.
- Self-hosted quickstart from the README: Docker with Compose and "ports 80 and 22
  free on the host"; `git clone -b v0.27.0 ...; make start`; pair a device with a
  pairing code or a provisioning key; then
  `ssh <user>@<namespace>.<device>@<your-server>`.
- API: `openapi/spec/` contains `community-openapi.yaml`, `cloud-openapi.yaml` and
  `enterprise-openapi.yaml`. `openapi/main.go` selects the spec by edition and runs
  `redocly bundle` to produce `static/openapi.json`, then serves it. The repo also
  contains `pkg/api/client/` (a generated client, with mocks), `pkg/api/authorizer`,
  `pkg/api/scope`, `pkg/api/requests`, `pkg/api/responses`, and
  `pkg/api/client/reverser/`.
- The mechanism for outbound-only devices is `pkg/revdial` (reverse dial) plus
  `agent/pkg/tunnel/` and `agent/pkg/agentd/` (agent.go is 32,199 bytes; handlers.go
  is 10,928 bytes).

**Label: [verified].** The exact set of endpoints in the community OpenAPI spec is
**[unverified]** (I read the generator, not the spec contents).

### 1.13 cloudflared - the reference connector, and it also speaks raw TCP

**Claim.** cloudflared is Apache-2.0, released on a weekly-ish cadence, and besides
HTTP tunnelling it can originate Layer-4 TCP connections to tunnel origins, which is
what makes SSH-over-Tunnel work without the WARP client.

**Evidence.**
- GitHub: `cloudflare/cloudflared`. Go. Apache-2.0. 16,337 stars. 572 open issues.
  `pushed_at` 2026-10-29T11:46:20Z. Repo size 42,259 KB.
- Releases: 2026.10.5 (2026-10-27T13:31:37Z), 2026.10.4 (2026-10-26T11:19:58Z),
  2026.10.3 (2026-10-21T13:17:53Z). Calendar-versioned, multiple releases per month.
- README (fetched 2026-10-29), quoted: "You can also use `cloudflared` to access
  Tunnel origins (that are protected with `cloudflared tunnel`) for TCP traffic at
  Layer 4 (i.e., not HTTP/websocket), which is relevant for use cases such as SSH,
  RDP, etc. Such usages are available under `cloudflared access help`. You can instead
  use WARP client to access private origins behind Tunnels for Layer 4 traffic without
  requiring `cloudflared access` commands on the client side."
- The README still states that adding a website and moving nameservers to Cloudflare
  is a prerequisite, while also noting "it is possible to use Tunnel without a website
  (e.g. for private routing), but for legacy reasons this requirement is still
  necessary". TryCloudflare quick tunnels are documented.

**Label: [verified].**

### 1.14 WireGuard and headscale - the kernel plus an open control server

**Claim.** The monolithic WireGuard repo is archived and split; headscale is the
self-hosted Tailscale control server and now ships a Tailscale-compatible v2 HTTP API
with OAuth, which makes it drivable from a Workers control plane.

**Evidence.**
- `WireGuard/WireGuard` now resolves to `WireGuard/wireguard-monolithic-historical`,
  archived, 2,320 stars, GPL-2.0, `pushed_at` 2019-12-27T09:51:53Z, description
  "Historical monolithic WireGuard repository, split into wireguard-tools,
  wireguard-linux, and wireguard-linux-compat."
- `WireGuard/wireguard-tools`: 733 stars, GPL-2.0, `pushed_at` 2026-05-06T21:28:18Z,
  description "Mirror only. Official repository is at https://git.zx2c4.com/wireguard-tools".
- `WireGuard/wireguard-linux`: 2,036 stars, `pushed_at` 2026-10-08T12:52:18Z, "Mirror
  only" with the official repo at git.zx2c4.com.
- `juanfont/headscale`: Go, BSD-3-Clause, 45,164 stars, 150 open issues,
  `pushed_at` 2026-10-29T11:43:14Z, repo size 63,432 KB.
- Releases: v0.29.6 (2026-10-24T10:29:04Z), v0.29.5 (2026-10-13T13:05:15Z), v0.29.4
  (2026-09-23T19:36:28Z).
- README: "An open source, self-hosted implementation of the Tailscale control
  server." Design goal: "Headscale aims to implement a self-hosted, open source
  alternative to the Tailscale control server ... It implements a narrow scope, a
  single Tailscale network (tailnet), suitable for a personal use, or a small
  open-source organisation."
- API (from `hscontrol/api/v2/README.md`, read in full): the v2 API is served at
  `/api/v2` and is partially ported from Tailscale's API, reusing Tailscale's wire
  shapes, "so the Tailscale ecosystem that cannot talk to Headscale today works: the
  Terraform/OpenTofu provider, tscli, and the official Go client
  (`tailscale.com/client/tailscale/v2`)". Auth accepts HTTP Basic or Bearer with an
  admin API key (`hskey-api-...`) or an OAuth access token (`hskey-oauthtok-...`).
  Scopes are Tailscale's: `auth_keys`, `oauth_keys`, `devices:core`, `devices:routes`,
  `policy_file`, `feature_settings`, each with a `:read` subset, plus `all`/`all:read`.
  "an admin API key is all-access ... an OAuth access token is scope-limited".
  OAuth clients are `keyType:"client"` on the keys endpoint, and the secret is
  `hskey-client-<clientID>-<secret>`. The headscale-native admin API stays at
  `/api/v1`. The `{tailnet}` path segment must be `-`.
- `hscontrol/api/v1/` contains api.go, apikeys.go, auth.go, errors.go, health.go,
  nodes.go, policy.go, preauthkeys.go, tags.go, types.go, users.go.

**Label: [verified].**

### 1.15 RustDesk - large, active, but the wrong shape for this spec

**Claim.** RustDesk is a self-hostable remote desktop application, not an
infrastructure access layer. It is AGPL-3.0 and very actively developed, but it has no
resource-policy model, no per-target tokens and no API for exposing services to a
Worker.

**Evidence.**
- GitHub: `rustdesk/rustdesk`. Rust. AGPL-3.0. 127,448 stars. 202 open issues.
  `pushed_at` 2026-10-29T11:30:58Z. Repo size 87,052 KB.
- Releases: 1.5.0 (2026-09-30T16:11:03Z), nightly (2026-07-10T05:02:29Z), 1.4.9
  (2026-07-06T02:30:30Z).
- README: "An open-source remote desktop application designed for self-hosting, as an
  alternative to TeamViewer."

**Label: [verified]** for the metadata; the architectural judgement is my own
assessment, not a claim from the repo.

### 1.16 Newer entrants worth a second look (from the awesome-tunneling list)

**Claim.** The maintained list of tunnelling options
(`anderspitman/awesome-tunneling`, policy update dated 2026-09-28 in the README)
recommends Pangolin or frp for production self-hosting, and contains two projects that
match this spec's shape better than rathole: Wiredoor and reverst.

**Evidence.**
- `anderspitman/awesome-tunneling` README (fetched 2026-10-29T11:50:10Z), quoted:
  "For something production ready I would look at Pangolin or frp." Policy notes in
  the README: "UPDATE 2026-09-28" on non-open-source additions, and "UPDATE
  2026-02-16: ... I'm going to start requiring at least 100 GitHub stars on any new
  additions."
- `Wiredoor/wiredoor`: TypeScript, Apache-2.0, 1,624 stars, 9 open issues,
  `pushed_at` 2026-10-26T12:14:24Z. Release v1.8.0, 2026-09-22T22:09:49Z (before that
  v1.7.3, 2026-07-23). README (fetched 2026-10-29): "Self-hosted ingress-as-a-service
  platform that allows you to expose applications and services running in private or
  local networks to the internet". "Remote nodes initiate encrypted WireGuard tunnels
  to Wiredoor Server". Features: HTTP/TCP/UDP exposure, NGINX routing for domains,
  paths and public ports, automatic Let's Encrypt for public domains, self-signed for
  internal domains, OAuth2 authentication, IP-based restrictions, WebSocket support for
  HTTP services, web dashboard and CLI, optional Prometheus metrics. Node types:
  Client Node (Linux/Windows/macOS), Linux Gateway Node, Docker Gateway, Kubernetes
  Gateway. Server requirements: a reachable Linux server with Docker Engine and
  Compose, TCP 80 and 443 open, UDP 51820 open. CLI flow:
  `wiredoor login --url https://wiredoor.example.com` then
  `wiredoor http first-app --domain app.example.com --port 3000`. A separate
  `wiredoor/wiredoor-cli` repo and `charts.wiredoor.net` Helm charts are referenced.
- `flipt-io/reverst`: Go, Apache-2.0, 1,006 stars, 7 open issues,
  `pushed_at` 2025-12-11T16:51:32Z. Description: "Reverse Tunnels in Go over HTTP/3
  and QUIC". The awesome-tunneling entry notes: "Requires manual TLS/DNS; no formal
  releases; latest tag v0.2.0 (2024-05-27)".
- `boringproxy/boringproxy`: Go, MIT, 1,388 stars, 60 open issues,
  `pushed_at` **2024-07-06T10:13:37Z**, latest release v0.10.0 published
  **2023-01-04T18:58:27Z**. The awesome-tunneling entry is the reason to note it:
  "Clients can be remote-controlled through a simple WebUI and/or REST API on the
  server." That is exactly the control-plane property the spec wants, but the project
  has not shipped a release in over three years.
- `piko`: listed by awesome-tunneling as "an open-source alternative to Ngrok,
  designed to serve production traffic and be simple to host (particularly on
  Kubernetes). MIT License. Written in Go." My GitHub search for it
  (`search/repositories?q=piko+tunnel`) did not surface the canonical repo, so its
  owner, stars and last release are **[unverified]**.

**Label: [verified]** except piko, which is **[unverified]**.

### 1.17 The three use cases, answered against the Cloudflare primitives

**Claim (a) browser terminal into a box.** Two viable shapes. Either the box runs
ttyd (or the lifted `browsergateway/ssh.go` from newt) behind a Cloudflare Tunnel
public hostname behind Access, or the whole stack is Pangolin, whose public SSH
resource is browser-rendered with xterm.js. The Workers SPA itself is only the
container for the terminal UI; the WebSocket must terminate on something that can
speak SSH.

**Claim (b) private service reachable only from a Worker.** Cloudflare's own answer
is Workers VPC, and it is the only one that needs no self-hosted component. A Worker
reaches a private service with `fetch()` through a VPC Service bound to a Cloudflare
Tunnel.

**Claim (c) SSH without exposing port 22.** Cloudflare's answer is Access for
Infrastructure with protocol-agnostic targets plus `cloudflared access` or the
Cloudflare One Client. The self-hosted answers are ShellHub, Pangolin private SSH
resources, and a WireGuard overlay (headscale or NetBird) with SSH on the overlay
address.

**Evidence.**
- Workers VPC service types (from
  `https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/`, "Last
  updated Oct 12, 2026", fetched 2026-10-29T11:50:44Z): a VPC Service has a **Type**
  of `http` or `tcp`; a Tunnel ID; a hostname or IPv4/IPv6 addresses; ports; for `tcp`
  an optional application protocol of `postgresql` or `mysql`; a TLS certificate
  verification mode (`verify_full` default, `verify_ca`, `disabled`); and optional
  resolver IPs. "Every request made to a VPC Service using its `fetch` function will
  be securely routed to the configured service in the private network. VPC Services
  enforce that requests are routed to their intended service without exposing the
  entire network, securing your workloads and preventing server-side request forgery
  (SSRF)." For `http` services: "Requests are encrypted in flight until they reach
  your network via a tunnel, regardless of the scheme used in the URL provided to
  `fetch`. If the `http` scheme is used, a plaintext connection is established to the
  service from the tunnel." The `https` scheme uses the hostname as SNI. Trusted
  certificate types are public CAs and Cloudflare Origin CA. "TCP VPC Services allow
  connections to TCP-based services such as PostgreSQL and MySQL databases" and are
  "used with Hyperdrive".
- Limits (from `https://developers.cloudflare.com/workers-vpc/platform/limits/`,
  "Last updated Sep 16, 2026", fetched 2026-10-29T11:50:49Z): "VPC Services per
  account: 1000". "Standard Workers limits apply for request size, timeout, and
  subrequests."
- Pricing (from `https://developers.cloudflare.com/workers-vpc/platform/pricing/`,
  fetched 2026-10-29T11:57:04Z, and flagged low-confidence by the reader): "Workers
  VPC requires a Workers plan. See Workers pricing for current rates." No per-service
  price is stated on that page, so the marginal cost of a VPC Service is
  **[unverified]**.
- End-to-end example (from
  `https://developers.cloudflare.com/workers-vpc/examples/private-api/`, "Last updated
  Oct 12, 2026", fetched 2026-10-29T11:49:58Z): create a tunnel in the Workers VPC
  dashboard, install `cloudflared` on the VM in the VPC, then
  `npx wrangler vpc service create api-service --type http --tunnel-id <YOUR_TUNNEL_ID>
  --ipv4 10.0.1.50 --http-port 8080`, then bind it in `wrangler.json`:
  `"vpc_services": [{ "binding": "INTERNAL_API", "service_id": "<YOUR_SERVICE_ID>",
  "remote": true }]`. The example's `compatibility_date` is 2026-10-27.
- Access for Infrastructure (from
  `https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/infrastructure-apps/`,
  "Last updated Oct 14, 2026", fetched 2026-10-29T11:53:49Z): available on all Zero
  Trust plans, Traffic and DNS mode or Traffic only mode, on Windows, macOS, Linux,
  iOS, Android and ChromeOS. Targets are protocol-agnostic (hostname plus IPv4/IPv6
  plus virtual network, with key-value tags). Infrastructure applications match
  targets by hostname, tag or both, with `include`, `require` and `exclude` criteria,
  a Protocol and Port per application, and a session duration defaulting to 24 hours.
  The API is `POST https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/infrastructure/targets`,
  with the `Zero Trust Write` permission on the API token and a Terraform resource
  `cloudflare_zero_trust_infrastructure_access_target`. Prerequisites: "Connect your
  infrastructure to Cloudflare using `cloudflared` or Cloudflare Mesh" and "Deploy the
  Cloudflare One Client on user devices in Traffic and DNS mode."
- Workers WebSockets (from
  `https://developers.cloudflare.com/workers/runtime-apis/websockets/`, "Last updated
  Oct 12, 2026", fetched 2026-10-29T11:53:32Z): `new WebSocketPair()` returns a pair;
  `accept()` "Accepts the WebSocket connection and begins terminating requests for the
  WebSocket on Cloudflare's global network". `accept({allowHalfOpen: true})` is
  documented as "useful for WebSocket proxying where you need to coordinate the close
  across both sides of the proxy". So a Worker can be a WebSocket server and can proxy
  a WebSocket, which is what a browser terminal in the SPA needs on the Cloudflare
  side of the connection.

**Label: [verified]** for all of the above. The claim that no self-hosted tool lets a
Worker join a WireGuard mesh is an inference from the Workers runtime having no TUN
device, which I did not test; treat it as **[unverified]**.

### 1.18 Independent third-party assessment of Pangolin's operational shape

**Claim.** A third-party comparison confirms the architectural constraint that matters
most for this spec: a self-hosted Pangolin hub is a single point of failure, and it
requires a public-IP VPS.

**Evidence.**
- `https://contabo.com/blog/pangolin-vs-cloudflare-tunnels-vs-tailscale/`, page dated
  "July 13, 2026 (last updated: October 2, 2026)", fetched 2026-10-29T11:57:19Z.
  Quoted: "Key trade-off: you manage the VPS hub. If it goes down, tunnel access goes
  down. High availability requires additional architecture." And: "Does Pangolin work without a
  VPS? No. Pangolin's architecture requires a VPS with a public IP to serve as the
  hub." The article describes Pangolin as shipping "as four containers on a public
  VPS - Pangolin (control plane), Gerbil (WireGuard manager), Traefik (reverse proxy),
  and Newt (the lightweight client deployed on each private network)" and identifies
  Fossorial as "a YC 2025 company".
- Note a discrepancy between this article and the primary source: the article still
  names Newt as the client, whereas the newt README (fetched the same day) says Newt
  is being phased out in favour of the Pangolin CLI. The primary source is more
  current. **[verified]** as a discrepancy between two sources I read on the same day.
- The article's pricing and VPS figures are vendor marketing for Contabo and are
  **[unverified]**; I did not check them and they are not load-bearing for this spec.

**Label: [verified]** for the quotations; the vendor pricing is **[unverified]**.

---

## 2. Comparison tables

### 2.1 Identity, licence, maturity (all figures from `gh api` on 2026-10-29)

| Project | owner/repo | Stars | Language | Licence (SPDX / actual) | Open issues | Last push | Last release | Last release date |
|---|---|---|---|---|---|---|---|---|
| Pangolin | fosrl/pangolin | 23,263 | TypeScript | NOASSERTION; dual AGPL-3.0 + Fossorial Commercial | 121 | 2026-10-29 | 1.25.3 | 2026-10-23 |
| Newt (connector) | fosrl/newt | 919 | Go | AGPL-3.0 | 34 | 2026-10-28 | 1.19.0 | 2026-10-20 |
| Gerbil (WireGuard mgr) | fosrl/gerbil | 343 | Go | AGPL-3.0 | 5 | 2026-10-26 | 1.5.2 | 2026-09-18 |
| Olm (client net lib) | fosrl/olm | 117 | Go | AGPL-3.0 | 12 | 2026-10-28 | 1.10.1 | 2026-10-02 |
| Pangolin CLI | fosrl/cli | 67 | Go | NOASSERTION; Fossorial Commercial + AGPL-3 default | n/a | 2026-10-28 | 0.19.1 | 2026-10-27 |
| Badger (Traefik bouncer) | fosrl/badger | 170 | Go | MIT | n/a | 2026-10-21 | none tagged | n/a |
| rathole | rathole-org/rathole | 14,382 | Rust | Apache-2.0 | 98 | 2026-08-23 | dev-latest (v0.5.0 last SemVer) | 2026-08-22 (v0.5.0: 2023-10-01) |
| zrok | openziti/zrok | 4,793 | Go | Apache-2.0 | 122 | 2026-10-28 | v2.0.8 | 2026-10-08 |
| frp | fatedier/frp | 110,283 | Go | Apache-2.0 | 33 | 2026-10-23 | v0.71.1 | 2026-10-14 |
| NetBird | netbirdio/netbird | 30,316 | Go | BSD-3-Clause except management/, signal/, relay/, combined/ = AGPLv3 | 807 | 2026-10-29 | v0.81.5 (rc v0.82.0-rc.2) | 2026-10-26 |
| Firezone | firezone/firezone | 9,137 | Elixir + Rust | Apache-2.0 except elixir/ = Elastic License 2.0 | 364 | 2026-10-29 | per-client (apple-client-1.5.23) | 2026-10-21 |
| Teleport | gravitational/teleport | 21,044 | Go + TypeScript | AGPL-3.0 | 3,248 | 2026-10-20 | v18.10.0 | 2026-07-09 |
| Guacamole server | apache/guacamole-server | 4,027 | C | Apache-2.0 | 81 | 2026-10-17 | tag 1.6.0 | 2025-06-19 |
| Guacamole client | apache/guacamole-client | 1,746 | Java | Apache-2.0 | 93 | 2026-10-14 | tag 1.6.0 | 2025-06-19 |
| MeshCentral | Ylianst/MeshCentral | 7,537 | HTML/Node | Apache-2.0 | n/a | 2026-10-24 | 1.3.1 | 2026-10-23 |
| ttyd | tsl0922/ttyd | 12,562 | C | MIT | 128 | 2026-08-12 | 1.7.7 | 2024-03-30 |
| gotty | yudai/gotty | 19,556 | Go | MIT | 159 | 2024-08-01 | v2.0.0-alpha.3 | 2017-12-13 |
| RustDesk | rustdesk/rustdesk | 127,448 | Rust | AGPL-3.0 | 202 | 2026-10-29 | 1.5.0 | 2026-09-30 |
| ShellHub | shellhub-io/shellhub | 2,243 | Go | Apache-2.0 | n/a | 2026-10-29 | v0.28.0 | 2026-10-28 |
| cloudflared | cloudflare/cloudflared | 16,337 | Go | Apache-2.0 | 572 | 2026-10-29 | 2026.10.5 | 2026-10-27 |
| headscale | juanfont/headscale | 45,164 | Go | BSD-3-Clause | 150 | 2026-10-29 | v0.29.6 | 2026-10-24 |
| Wiredoor | Wiredoor/wiredoor | 1,624 | TypeScript | Apache-2.0 | 9 | 2026-10-26 | v1.8.0 | 2026-09-22 |
| boringproxy | boringproxy/boringproxy | 1,388 | Go | MIT | 60 | 2024-07-06 | v0.10.0 | 2023-01-04 |
| reverst | flipt-io/reverst | 1,006 | Go | Apache-2.0 | 7 | 2025-12-11 | none (tag v0.2.0 per list) | 2024-05-27 per list |

`n/a` means the API returned no value for that field or I did not query it.

### 2.2 Fit against the three named use cases

| Use case | Best self-hosted answer | Best Cloudflare-native answer | Why |
|---|---|---|---|
| (a) Browser terminal into a box | ttyd on the box behind a Tunnel; or Pangolin public SSH resource; or lift `newt/browsergateway/ssh.go` | Cloudflare Tunnel public hostname + Access, with the terminal UI in the Workers SPA and a Worker WebSocket proxy in front | ttyd is one static binary with `--base-path` and `-H/--auth-header`; Pangolin already ships xterm.js plus per-target tokens on netstack port 39999 |
| (b) Private service reachable only from a Worker | headscale or NetBird overlay is the wrong shape (no TUN in Workers); the honest self-hosted answer is a Worker-reachable public endpoint in front of the tunnel | **Workers VPC**: `http` or `tcp` VPC Service bound to a Cloudflare Tunnel, `fetch()` from the Worker, `remote: true`, 1,000 services per account | The box dials out, so nothing is exposed; Workers VPC also blocks SSRF by routing only to the declared service |
| (c) SSH without exposing port 22 | ShellHub (agent dials out, stock ssh client, default-deny policy, session log); Pangolin private SSH with short-lived certs and JIT accounts; headscale/NetBird overlay address | **Access for Infrastructure**: protocol-agnostic targets plus an Infrastructure application with Protocol and Port, API at `/infrastructure/targets`, Terraform resource available | Both give per-person identity and audit without a bastion and without opening 22 |

### 2.3 API drivability from a Workers control plane

| Project | API type | Auth model | Writable from a control plane? | Notes |
|---|---|---|---|---|
| Pangolin | REST `/api/v1`, OpenAPI + Swagger | Bearer token; org and root keys with per-action permissions | **Yes** | Must set `flags.enable_integration_api`; default port 3003; docs warn of breaking changes; open bug 4014 returns 403 on alert/health routes even with a root key |
| headscale | REST `/api/v1` (native) and `/api/v2` (Tailscale-compatible) | Admin API key `hskey-api-`, or OAuth `hskey-oauthtok-` with Tailscale scopes | **Yes** | The Terraform provider, tscli and the official Go client all work against it |
| NetBird | REST with OpenAPI spec in-repo | API token | **Yes** | Terraform provider and Ansible collection exist |
| ShellHub | REST generated from `openapi/spec/*-openapi.yaml` | Token | **Yes** (endpoint list unverified) | Spec is per edition: community, cloud, enterprise |
| frp | HTTP on frps (7500) and frpc (7400) | Basic auth | Partly | frps is read-mostly plus `DELETE /api/proxies/{name}` and `POST /api/v2/system/prune`; frpc has full CRUD on `/api/store/proxies` and `/api/store/visitors` |
| rathole | none | per-service tokens in TOML | **No** | README: "HTTP API is WIP" |
| zrok | Go SDK (`sdk.CreateShare`, `sdk.NewListener`) | account token | Embeddable, not a fleet API | Self-hosting needs OpenZiti + PostgreSQL + RabbitMQ + InfluxDB |
| Teleport | Go client + gRPC/HTTP | certs and roles | **Yes** | Heaviest option; 1.5 GB repo |
| Guacamole | internal REST, token auth | token | Awkward | No official documentation; third-party reverse-engineered OpenAPI |
| MeshCentral | WebSocket messenger | session | **No** | No REST surface found in the tree |
| ttyd | none | basic auth or `-H` auth header | **No** | It is a leaf, not a control surface |
| cloudflared | none (driven by the Cloudflare API) | Cloudflare API token | n/a | The control plane is Cloudflare's own API |

### 2.4 Footprint and operational shape

| Project | Server components | Declared / documented resource use | Public IP needed? | HA story |
|---|---|---|---|---|
| Pangolin | pangolin (Next.js + Express), gerbil, traefik, optional postgres + redis | pangolin container: 2 GB limit, 512 MB reservation | Yes | `config/ha-reference/` ships a 2-node compose with Traefik, PostgreSQL and Redis |
| zrok | zrok2-controller, zrok2-frontend, zrok2-metrics-bridge, OpenZiti controller + router, PostgreSQL, RabbitMQ, InfluxDB | not documented in what I read | Yes | "Scaling frontends" doc exists |
| frp | frps (+ frpc per box) | not documented in what I read | Yes | none in the README I read |
| NetBird | management, signal, relay, dashboard | not documented in what I read | Yes (for the management server) | relay fallback is built in |
| Firezone | portal (Elixir) + gateways (Rust) | Gateway: Micro 1 core/1 GB, Small 2/2 GB, Medium 4/4 GB; caps at 4 cores and 4 GB | Yes | "at least 3 Gateways per Site" |
| Teleport | auth + proxy + nodes | not documented in what I read | Yes | cluster of auth servers |
| Guacamole | guacd (C) + Tomcat/Jetty WAR + MySQL/PostgreSQL | not documented in what I read | Yes | none found |
| MeshCentral | one Node.js server | not documented in what I read | Yes | none found |
| ShellHub | server (Go) + agent per device | not documented in what I read | Yes (ports 80 and 22) | none found |
| headscale | one Go binary + SQLite/PostgreSQL | not documented in what I read | Yes | none found |
| Wiredoor | wiredoor server (Docker) + node | not documented in what I read | Yes (80, 443, UDP 51820) | none found |
| cloudflared | none (Cloudflare runs the edge) | client-side only | **No** | Cloudflare operates it |

---

## 3. What this changes for the spec

1. **Use Cloudflare's own primitives for (b) and (c); do not rebuild them.** Workers VPC
   gives a Worker `fetch()` access to a private HTTP or TCP service through a
   Cloudflare Tunnel, with 1,000 services per account and SSRF protection by design.
   Access for Infrastructure gives protocol-agnostic targets with a REST API and a
   Terraform resource, session duration defaulting to 24 hours, and command logs.
   Both are driven by the Cloudflare API, which is exactly what a Workers-hosted
   control plane already has credentials for. Self-hosting a Pangolin or ShellHub hub
   *in addition* buys data-sovereignty at the cost of a second public-IP VPS and a
   second outage domain.

2. **The dashboard stays on Workers; the terminal backend cannot.** A Worker can be a
   WebSocket server and can proxy a WebSocket (`accept({allowHalfOpen: true})` exists
   for exactly that), but it cannot terminate SSH. So the browser terminal in the SPA
   must talk to a WebSocket endpoint that terminates SSH somewhere on the data plane.
   Concretely: ttyd on each box, behind a Cloudflare Tunnel hostname, with the SPA's
   terminal pane connecting through a Worker that proxies to that hostname. ttyd's
   `-H/--auth-header` flag is the hook for delegating authentication to the Worker, and
   `-b/--base-path` lets it sit under a path prefix.

3. **If a self-hosted tunnel stack is wanted anyway, Pangolin is the one to study, and
   newt is the one to lift.** Pangolin is the only project here that combines a
   WireGuard overlay, an identity-aware reverse proxy, a browser terminal and
   browser RDP/VNC, and a permissioned REST API with an OpenAPI document. Its pieces
   are small and separately licensed: `fosrl/newt` (AGPL-3.0, 919 stars, v1.19.0) for
   the connector, `fosrl/gerbil` (AGPL-3.0, 343 stars) for WireGuard peer management
   over HTTP, `fosrl/olm` (AGPL-3.0) for the client networking library. The single
   most reusable file in the whole survey is `newt/browsergateway/ssh.go`: an
   SSH-over-WebSocket handler on `coder/websocket` with a `mode=native` (local sshd)
   and a `mode=proxy` (arbitrary host and port) switch, and per-target auth tokens on
   netstack port 39999.

4. **Do not build on the Pangolin CLI.** `fosrl/cli` (67 stars, v0.19.1) is the
   replacement for newt and it is not open source: files with a Fossorial Commercial
   License header are proprietary and "Unauthorized use, copying, modification, or
   distribution is strictly prohibited". The same mixed-header scheme applies to the
   Pangolin repository itself. Any plan that says "repurpose Pangolin's pieces" has to
   be scoped to the AGPL-headered files, and that per-file mapping is not something I
   established. Prefer `fosrl/newt` and `fosrl/gerbil`, whose licence headers are
   unambiguous AGPL-3.0.

5. **Drop rathole, gotty, boringproxy and reverst from the shortlist.** rathole's
   README says the HTTP API is "WIP" and its out-of-scope doc explicitly declines an
   HTTP layer; its last SemVer release is v0.5.0 from 2023-10-01. gotty's last commit
   is 2017-12-13. boringproxy has the right idea (a REST API that remote-controls
   clients) but last shipped v0.10.0 on 2023-01-04. reverst has no formal releases.
   None of them can be driven from a Workers control plane today.

6. **frp is the fallback if a generic L4 tunnel is needed, with one caveat.** It is
   Apache-2.0, releases monthly, and its `frpc` admin API has full CRUD on
   `/api/store/proxies` with `db.json` persistence, so a control plane can push proxy
   definitions. The caveat is that the writable API is on the client and the server
   API is read-mostly and basic-auth, so a control plane that only reaches boxes
   outbound has to either write config files or use `PUT /api/config` on each box's
   frpc.

7. **ShellHub is the best answer to (c) if the spec insists on self-hosting it.** Its
   agent dials out, the stock OpenSSH client works unchanged, access is default-deny
   and policy-driven, sessions are logged with user, source IP and device, and the
   repo is Apache-2.0 with an OpenAPI-generated REST API. Note the edition split: MFA,
   server-side recording and SAML SSO are Cloud/Enterprise, not Community. Note also
   that the self-hosted quickstart binds ports 80 and 22 on the host, which is
   precisely what the spec is trying to avoid, so the server must sit behind the
   tunnel or on the overlay.

8. **headscale is the most Worker-friendly self-hosted control plane in this survey.**
   Its v2 API reuses Tailscale's wire shapes and auth model, so the Terraform
   provider, `tscli` and the official Go client all drive it, and it supports OAuth
   client-credentials with Tailscale scopes. A Workers control plane can manage
   devices, routes and policy over `/api/v2` with a scoped token. Its documented
   limitation is a single tailnet, which is fine for a personal or small-org setup and
   is a hard ceiling beyond that.

9. **Firezone is out, on licence and support grounds.** The Elixir control plane is
   Elastic License 2.0, not open source, and the README states plainly that
   "Production self-hosting is not officially supported" and that "Published Clients
   are only guaranteed to work with the managed service". Its Rust data plane is
   genuinely excellent (4 cores and 4 GB caps, 2 Gbps+ peer-to-peer), but that is the
   part this spec does not need to own.

10. **Teleport is the answer only if audit and session recording are hard
    requirements.** It does reverse tunnels to resources behind NAT without a bastion,
    has a full API, RBAC/ABAC, JIT access requests and session recording, and is
    AGPL-3.0. Against that: 3,248 open issues, a 1.5 GB repository, and a latest
    release (v18.10.0, 2026-07-09) about three and a half months old at the time of
    reading. For a handful of boxes it is a large amount of machinery.

11. **Guacamole and MeshCentral are the wrong tools for this spec.** Guacamole needs a
    JVM and a servlet container, has no documented REST API (only a
    reverse-engineered third-party OpenAPI), and is a remote-desktop gateway rather
    than an access layer. MeshCentral has no REST surface at all; automation would
    mean speaking its WebSocket messenger protocol. Both are excellent at what they
    are for and neither is a building block for a Workers-driven control plane.

12. **Budget for the Pangolin hub being a single point of failure.** The third-party
    assessment I read states it directly: "If it goes down, tunnel access goes down.
    High availability requires additional architecture." If the spec keeps Cloudflare
    as the only public entry point (dashboard on Workers, data plane reached through
    Cloudflare Tunnel), that failure domain disappears, which is the strongest
    architectural argument for the design the operator has already chosen.

---

## 4. Not covered / open questions

1. **Pangolin per-file licence mapping.** I did not enumerate which files carry the
   Fossorial Commercial License header and which are AGPL-3. Before anyone lifts code,
   that has to be checked file by file. The repositories where this is already settled
   are `fosrl/newt`, `fosrl/gerbil` and `fosrl/olm` (all AGPL-3.0).

2. **The exact endpoint list in ShellHub's community OpenAPI spec.** I read the
   generator (`openapi/main.go`) and the edition switch, not the spec body.

3. **NetBird's API reference.** `https://docs.netbird.io/api` is linked from the
   README and the spec files exist in-repo, but I did not read the rendered docs.

4. **Teleport's API documentation pages.** Linked from `api/client/README.md`, not
   fetched.

5. **piko's identity.** Listed by awesome-tunneling as an MIT Go ngrok alternative for
   Kubernetes; my GitHub search did not surface the canonical repository, so owner,
   stars and last release are unverified.

6. **Measured footprints.** Every resource figure above is a declared compose limit, a
   vendor sizing table, or a repo size. I ran nothing and measured nothing. A real
   deployment of the chosen stack needs an actual RSS/CPU measurement on the target
   hardware.

7. **Workers VPC marginal cost.** The pricing page says only "Workers VPC requires a
   Workers plan. See Workers pricing for current rates." I could not determine whether
   VPC Services carry a per-request or per-service charge beyond the Workers plan, or
   how they interact with the Workers request limits. The reader flagged that page
   low-confidence.

8. **Whether a Worker can originate an outbound WebSocket to an arbitrary host.** I
   confirmed the WebSocket server side (`WebSocketPair`, `accept`). I did not confirm
   the client side or its timeout behaviour against a long-lived terminal session,
   which is the actual requirement for a browser terminal proxied through a Worker.

9. **The 100 MB per-request upload limit and the video-content terms on the Cloudflare
   free plan.** These come from the third-party Contabo article, not from Cloudflare's
   own documentation, and they matter if heavy CI artefacts ever flow through the
   tunnel. Unverified and worth checking against Cloudflare's current terms.

10. **Concurrent-session behaviour of ttyd.** `-m/--max-clients` defaults to 0 (no
    limit) and the binary is readonly by default until `-W`. I did not test how many
    concurrent WebSocket terminals a single ttyd process sustains, nor its memory
    profile under load.

11. **Pangolin's integration API stability.** The docs themselves warn that routes may
    break between updates, and issue 4014 shows permission bugs in the current
    release. Pinning to a Pangolin version and testing the API contract on upgrade is
    required, not optional.

12. **Anything about RDP or VNC in depth.** The spec asked about browser terminals, not
    remote desktop. I confirmed that Pangolin ships browser RDP and VNC (via
    `@devolutions/iron-remote-desktop` and `@novnc/novnc` in package.json, and
    `browsergateway/rdp.go` / `vnc.go` in newt) and that Guacamole and MeshCentral do
    too, but I did not evaluate them.
