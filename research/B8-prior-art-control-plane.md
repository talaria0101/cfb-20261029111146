# B8 - Prior art: control plane on Cloudflare Workers, data plane on own hardware via tunnel

Research subagent: B8-prior-art-control-plane
Date all sources read: 2026-10-29 (UTC)
Method: pkgforge gateway search/read pinned to tinyfish, plus `gh api` for GitHub
metadata. Every number below comes from a call I actually made on 2026-10-29.
No fallback to the built-in web_search/web_fetch tools was needed; tinyfish
answered every request.

---

## 1. Findings

### F1. Nobody ships the exact product, but four projects ship the exact architecture

Claim: there is no mature, general-purpose open-source project that is "a
control-plane SPA hosted on Cloudflare Workers that manages a fleet of your own
machines over tunnels". The pattern does exist, in four shapes, and the most
transferable code is in two of them.

Evidence and per-project detail below (F2 to F7). [verified]

---

### F2. gofixpoint/amika - the closest prior art, and the most reusable code

Claim: amika is "multiplayer cloud workstations for coding agents and humans".
It already implements the operator's target split: a hosted control plane that
reaches machines you own through an outbound-only WebSocket tunnel, with the
control plane itself closed-source but the data-plane daemon and the wire
protocol open.

Evidence:
- Repo `gofixpoint/amika`. 295 stars. License Apache-2.0. Language TypeScript.
  Created 2026-02-05. Last push 2026-10-28 (yesterday). 45 open issues.
  Size 5730 KB. Not archived. [verified]
- Last commits (2026-10-28): "Speak amika.tunnel.v2 to a per-host relay (#639)",
  "Namespace the tunnel keep-alive strings", "Refuse one stream for an OPEN head
  that is malformed". [verified]
- Last 8 releases, newest first: amika-hostd@v0.6.0-beta.1 (2026-10-28),
  amika-hostd@v0.5.0 (2026-10-27), amika-hostd@v0.5.0-beta.4 (2026-10-26),
  amika-hostd@v0.5.0-beta.3 (2026-10-25), amika-hostd@v0.5.0-beta.2
  (2026-10-25), amika-hostd@v0.5.0-beta.1 (2026-10-25), amikalog@v0.2.1
  (2026-10-23), amikad@v0.2.1 (2026-10-23). [verified]
- README.md, "What's open source and what's closed source": open = `amika` CLI,
  `amikad` daemon (runs inside each VM, manages Rig setup, network connectivity,
  and communication with `amika-gateway` and the e2e-encrypted `amika-relay`),
  `sandbox-image`, `amika-sdks`. Closed = `amika-control-plane`, `amika-ui`,
  `amika-relay`. [verified]
- `docs/self-hosting.md`: "The `amika` CLI no longer creates Rigs on your own
  machine. The `--local` mode, which ran each Rig as a Docker container on the
  host, has been removed, so every `amika` command now talks to the Amika
  control plane. There is currently no supported local CLI path." And: "when we
  open source the `amika-gateway`, you can run a fully self-hosted version of
  Amika ... The self-hosted `amika-gateway` is designed for single-player, so
  it doesn't support identity and access management for multiple users".
  [verified]
- `js/amika-hostd/README.md` (the BYOC daemon): "Bring your own compute (BYOC):
  run Amika Rigs on your own machines ... registers that machine with the Amika
  control plane as a _host_ ... The daemon dials out to Amika's gateway, so the
  machine needs no open port: it works behind a home router." It explicitly
  documents Cloudflare Tunnel as the alternative exposure: "If you would rather
  expose a port yourself, through ngrok or Cloudflare Tunnel, the daemon can
  listen on one instead", with `transport = "listen"` and
  `amika-hostd register-url https://<your-tunnel-url>`. Requirements: Linux
  x86_64/arm64 with glibc 2.34+ and KVM, or macOS on Apple silicon;
  `e2fsprogs`; outbound HTTPS; a user-scoped Amika API key. [verified]
- `js/amika-hostd/AGENTS.md`: hostd is "a standalone Node.js service built with
  Hono". Serves `GET /health`, `/v0beta1/rigs`, `/v0beta1/snapshots`, and a
  Smol-compatible `/api/v1/machines`. [verified]
- `js/amika-hostd/docs/api-and-auth.md`: API is versioned; "Change a version's
  contract only in a new version"; every route including `/health` and unknown
  paths requires the secret key; auth runs before the body limit; "The caller's
  credential is never forwarded to the Smol runtime". Credential header
  `X-Amika-Hostd-Key`, or `Authorization: Bearer <secret key>`; at least 32
  printable ASCII characters. [verified]
- `js/amika-hostd/docs/tunnel.md` (17742 bytes, the single most valuable file):
  "Tunnel mode removes it. The daemon binds nothing and dials out to an
  Amika-run gateway over WSS. Each host's connection is held by its own relay
  (a Cloudflare Durable Object), which opens one stream for each public request
  it forwards. hostd serves each of those streams with the same Hono app, the
  same authentication and the same upgrade handler a listening daemon serves,
  so no route exists twice. ... The relay is in amika-mono
  (`js/gateway-cloudflare`). The wire format is `amika.tunnel.v2`, and its code
  is `@amika/tunnel-protocol`". [verified]
- Design decisions recorded in tunnel.md, all directly reusable:
  - The tunnel uses a *third* secret, `attachment-credential`, distinct from the
    user API key and from the daemon secret key, because "Attaching a host is
    the opposite direction and a different permission". Minted by the control
    plane at enrolment in exchange for the user's API key, "worth only this
    host's inbound traffic".
  - It travels in the `x-amika-host-credential` handshake header beside
    `x-amika-host-id`, "never in the URL, because a query string reaches the
    access log of every proxy on the path".
  - Why a bearer token and not a signed keypair assertion: "the gateway
    re-presents the same credential string on every lease renewal ... A proof
    bound to a timestamp or a challenge would be valid for the first call and
    rejected for every renewal after it". A keypair model needs a gateway-side
    change first.
  - Liveness: a text `amika.tunnel.v2.ping` every 30s, `PONG` expected within
    10s, relay presumes the host gone after 3 intervals. "The relay registers
    that pair with Cloudflare's `setWebSocketAutoResponse`, so its runtime
    answers without waking the relay: an idle host costs nothing, and the relay
    is not billed a message for it." This is a real, non-obvious Cloudflare
    cost optimisation.
  - `wss://` required; plain `ws://` on loopback only, and the loopback test is
    "anchored at both ends: `127.0.0.1.evil.example` is a name anyone can
    register".
  - The client file layout: `tunnel-dial.ts`, `tunnel-session.ts`,
    `tunnel-bridge.ts`, `tunnel-socket-pair.ts`, `tunnel-serving.ts`,
    `tunnel-backoff.ts`, `tunnel-client.ts`, `tunnel-target.ts`. The trick worth
    stealing: `tunnel-socket-pair.ts` is "Two connected sockets with nothing
    under them, for `node:http`", and `tunnel-serving.ts` is "An `http.Server`
    with no listener, fed those sockets". That is how one Hono app serves both
    a real TCP listener and tunneled streams without duplicating routes.
- `js/tunnel-protocol/src/index.ts` (14183 bytes, Apache-2.0, shared by both
  ends): subprotocol `amika.tunnel.v2`, path `/v2/host-tunnel`, headers
  `x-amika-host-id` / `x-amika-host-credential` / `x-amika-connection-id`.
  Constants: KEEP_ALIVE_INTERVAL_MS 30000, PING_TIMEOUT_MS 10000,
  HOST_SILENCE_MS 90000, INITIAL_WINDOW 256*1024, MAX_DATA_BYTES 64*1024,
  MAX_MESSAGE_BYTES 1MiB, MAX_FRAME_BYTES MAX_MESSAGE_BYTES+64,
  MAX_TARGET_LENGTH 16*1024, MAX_CONCURRENT_STREAMS 256. Frame types: open 1,
  response 2, data 3, end 4, reset 5, window 6, text 7, binary 8, close 9;
  HEADER_BYTES 5. Close codes: CLOSE_REPLACED 4001, CLOSE_REVOKED 4003,
  CLOSE_LEASE_EXPIRED 4008, CLOSE_SILENT 4009. Its own doc rule: "It runs in a
  Cloudflare Worker as well as Node. Use `Uint8Array`, `DataView` and
  `TextEncoder`. No `Buffer` and no `node:` import." [verified]
- `js/tunnel-protocol/src/window.ts`: credit-based flow control, `SendWindow` /
  `ReceiveWindow`, both start at INITIAL_WINDOW, receiver grants credit back
  with WINDOW "only once it has handed the bytes on, so a sender can never get
  further ahead of the far end's consumer than one window". [verified]
- `ROADMAP.md` confirms the open/closed split and names the closed control
  plane's job: "API to provision hundreds to thousands of sandboxes and manage
  the agents across those sandboxes ... Index and store agent sessions ...
  Centralize configuration of agent skills, tools, and MCP servers". [verified]
- Public docs page `https://docs.amika.dev/guides/byoc` (fetched 2026-10-29)
  confirms BYOC and the `transport = "tunnel"` default. [verified]

Maturity: beta by its own README badge ("status-beta"). Actively developed
(daily commits, releases multiple times a week). The control plane, the relay
and the web UI are all closed, so the operator gets the client and the protocol
but not the server. [verified for the split; the relay implementation itself is
unverified because `js/gateway-cloudflare` lives in the closed `amika-mono`]

---

### F3. harshalgajjar/Reminal - a real Worker-hosted relay with open source

Claim: Reminal is the closest thing to a complete, working, open-source
"control plane on Cloudflare Workers, data plane on your own machines" system,
and its relay is deployable by anyone on the free tier.

Evidence:
- Repo `harshalgajjar/Reminal`. 323 stars. License AGPL-3.0. Language Go.
  Created 2026-06-19. Last push 2026-10-29. 5 open issues. [verified]
- Releases: v3.17.48 (2026-10-29 06:35), v3.17.47 (2026-10-29 02:49), v3.17.46
  (2026-10-28 12:14), v3.17.44 (2026-10-28 09:29), v3.17.43 (2026-10-28
  08:30). Multiple releases per day; the repo ships a `changelog/` directory
  with per-patch files from 3.10.0 to 3.17.48. [verified]
- `cloudflare/README.md`: "reminal relay (Cloudflare Workers). Free hosted relay
  for reminal. Uses Cloudflare Workers + Durable Objects for WebSocket session
  pairing." Deploy needs "a Cloudflare **free** account. Durable Objects use the
  SQLite backend (`new_sqlite_classes`), which is required on the free plan."
  Cost section: "Cloudflare Workers free tier includes 100,000 requests/day and
  Durable Objects with generous limits - more than enough for personal use."
  [verified]
- `cloudflare/wrangler.toml` (read in full): name `reminal-relay`, main
  `src/index.ts`, compatibility_date 2024-11-01, compatibility_flags
  `["nodejs_compat"]`, account_id pinned to a literal so `wrangler deploy`
  errors rather than shipping to the wrong account. Routes:
  `live.reminal.app` custom domain plus `*.reminal.app/*` for subdomain-per-
  tunnel. Three Durable Object bindings: SESSION (SessionRoom), RENDEZVOUS
  (RendezvousRoom), LIMITER (RateLimiter), with two SQLite migrations. The
  file carries an explicit comment on why the wildcard route is safe: the more
  specific `live.reminal.app` custom domain and the marketing site's routes
  win, "so this only ever catches `port-<id>` and other undefined subdomains".
  [verified]
- Relay source layout under `cloudflare/src/`: `index.ts`, `session.ts`,
  `rendezvous.ts`, `gate.ts`, `limiter.ts`, `push.ts`, `alarm.ts`, `body.ts`,
  `closeback.ts`, `types.ts`, plus `scripts/build-viewer.mjs` which builds the
  browser viewer from `internal/client/web` immediately before every deploy.
  Tests are Go tests living in the `cloudflare/` directory
  (`worker_test.go`, `gate_test.go`, `limiter_test.go`, `push_test.go`,
  `expiry_test.go`, `body_test.go`, `limits_test.go`, `viewer_build_test.go`,
  `closeback_test.go`). [verified]
- Product surface from README: closed-lid mode (macOS only, disables clamshell
  sleep and spins up a virtual display), window and full-desktop mirroring
  driven from a browser, terminal via QR code, `reminal machines` fleet view,
  per-machine alerts, `reminal integrate` which registers an MCP server with
  Claude Code, Codex, Cursor, Gemini, Qwen, OpenCode, Antigropic, Amp and pi,
  `reminal expose 3000` for a public HTTPS URL, and `reminal copy` /
  `reminal paste` for machine-to-machine transfer. [verified]
- The MCP tool list is the part most directly relevant to a CI control plane:
  `list_sessions`, `search_sessions` (regex across live scrollback on all
  boxes), `read_transcript`, `send_keys` (types into another session's PTY
  across machines), `add_note`. [verified]

Caveat for the spec: AGPL-3.0 is a copyleft licence. Reusing its relay code in
a closed or SaaS product is a licensing problem; forking it wholesale for an
internal tool is fine. [verified, licence read from the repo's LICENSE file
reference in README and from the API `license.spdx_id`]

---

### F4. Cloudflare's own API surface for tunnels - verified, complete, scriptable

Claim: every part of the tunnel lifecycle is available over the Cloudflare REST
API, so a Worker control plane can create, configure, tokenise, inspect and
delete tunnels for the whole fleet without any human in the dashboard.

Evidence:
- `POST /accounts/{account_id}/cfd_tunnel` - "Creates a remotely or locally
  managed Cloudflare Tunnel in an account. After creation, retrieve its token
  and run cloudflared to establish the connector connection." Body: `name`,
  `config_src` ("local" or "cloudflare"), `tunnel_secret` (optional, at least
  32 bytes base64, for locally-managed). Accepted permissions (at least one):
  `Cloudflare One Connectors Write`, `Cloudflare One Connector: cloudflared
  Write`, `Cloudflare Tunnel Write`. Source:
  https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/methods/create/
  [verified]
- `GET /accounts/{account_id}/cfd_tunnel/{tunnel_id}/token` - retrieves the
  connector token, same permission set. Source:
  https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/token/methods/get/
  [verified]
- The official Go SDK `cloudflare/cloudflare-go` (2104 stars, Apache-2.0, Go,
  created 2015-12-03, last push 2026-10-20, 12 open issues) exposes:
  `TunnelCloudflaredService.New` (POST), `.List` / `.ListAutoPaging`, `.Get`,
  `.Edit`, `.Delete`; `TunnelCloudflaredConnectionService.Get` / `.Delete`
  (connection inspection and eviction); `TunnelCloudflaredManagementService.New`
  (remote management); plus `tunnelcloudflaredconfiguration.go`,
  `tunnelcloudflaredtoken.go`, `tunnelcloudflaredconnector.go`,
  `tunnelwarpconnector*.go`, `zero_trust/tunnel.go`. [verified, read from the
  source files in the repo]
- The official TypeScript SDK `cloudflare` on npm is at `latest` 7.3.0,
  Apache-2.0, zero runtime dependencies (`"dependencies": {}`). The design doc
  in F7 names the exact surface: `client.zeroTrust.tunnels.cloudflared` for
  tunnel CRUD + config + token, `client.zeroTrust.access.applications`,
  `client.zeroTrust.access.serviceTokens`. [verified for the version and
  licence; the specific method names are from F7's issue text, which I read]
- The Cloudflare Terraform provider `cloudflare/terraform-provider-cloudflare`
  (1351 stars, Apache-2.0, Go, created 2017-06-05, last push 2026-10-22, 252
  open issues) is at v5 and the tunnel resources are named
  `cloudflare_zero_trust_tunnel_cloudflared`,
  `cloudflare_zero_trust_tunnel_cloudflared_config`,
  `cloudflare_zero_trust_tunnel_cloudflared_route`,
  `cloudflare_zero_trust_tunnel_cloudflared_virtual_network`. The v5 upgrade
  guide records the renames from v4 (`cloudflare_tunnel` and friends) and that
  `cname` was removed: "To reference the tunnel CNAME in v5, construct it
  manually using the tunnel ID". [verified]
- `wrangler` is at 4.155.0, licence `MIT OR Apache-2.0`, from
  `cloudflare/workers-sdk` (4680 stars, Apache-2.0, TypeScript, last push
  2026-10-29, 601 open issues). Wrangler exposes a first-class `vpc` namespace
  with `create`, `get`, `update`, `delete`, `list` subcommands
  (`packages/wrangler/src/vpc/*.ts`). The namespace metadata reads
  `status: "open beta"` for the VPC namespace and `status: "stable"` for the
  VPC services namespace. [verified]
- Cloudflare Tunnel docs, `https://developers.cloudflare.com/tunnel/`, last
  updated 2026-09-11, state the recommended flow is a remotely-managed tunnel:
  "Remotely-managed configurations are stored on Cloudflare, allowing you to
  manage the tunnel from any machine using the dashboard, API, or Terraform."
  This is the enabling fact for a Worker-driven control plane. [verified]

---

### F5. Workers VPC is the first-party answer for "Worker reaches a private service", and it is open beta

Claim: Cloudflare now ships a purpose-built product for exactly the operator's
(b) requirement (a private service reachable only from a Worker). It is the
right primitive, it is beta, and it has a specific permission model the spec
must respect.

Evidence:
- `https://developers.cloudflare.com/workers-vpc/api/` (last updated
  2026-09-16): "VPC bindings provide APIs for accessing private services from
  your Worker. Both VPC Services and VPC Networks expose a `fetch()` method for
  HTTP traffic. VPC Networks also expose a `connect()` method for raw TCP
  connections. The difference between binding types is in routing scope, not in
  API surface." [verified]
- Routing semantics, verbatim: for a VPC Service, "The **host** provided in
  `fetch()` does not control routing. It only populates the `Host` header and,
  when using `https`, the Server Name Indication (SNI) value. The **port**
  provided in `fetch()` is ignored - the port specified in the VPC Service
  configuration is always used." For a VPC Network, "The URL passed to
  `fetch()` or the address passed to `connect()` determines the actual
  destination". [verified]
- VPC Service config: `type` (`http` or `tcp`), Tunnel ID, hostname or
  IPv4/IPv6, ports (http defaults 80/443, tcp required), optional
  `app_protocol` of `postgresql` or `mysql` for TCP (consumed by Hyperdrive),
  `--cert-verification-mode` of `verify_full` (default) / `verify_ca` /
  `disabled`, optional `resolver_ips`. [verified]
- TLS constraint that will bite: "Workers VPC trusts the following certificate
  types: Publicly trusted certificates ... Cloudflare Origin CA certificates
  ... If your origin service presents a certificate that is not issued by a
  publicly trusted CA or by Cloudflare Origin CA, the TLS handshake will fail
  and `fetch()` will throw an exception." Self-signed certs on the data plane
  do not work under `verify_full`. [verified]
- Roles: "Creating VPC Services requires the **Connectivity Directory Admin**
  role. Members with the **Connectivity Directory Bind** role can bind to
  existing VPC Services from Workers. Binding directly to a tunnel through a
  VPC Network binding requires the **Connectivity Directory Admin** role."
  A community thread (`Workers VPC Service - API Token access`,
  https://community.cloudflare.com/t/workers-vpc-service-api-token-access/854546)
  notes "Workers VPC requires additional permissions that are not part of the
  'Workers Write' role - you need to have 'Connectivity Directory Bind'".
  [verified]
- The API path for VPC services is
  `GET/POST /accounts/{account_id}/connectivity/directory/services`, per
  https://developers.cloudflare.com/api/resources/connectivity/subresources/directory/
  [verified]
- `https://developers.cloudflare.com/workers-vpc/configuration/tunnel/` (last
  updated 2026-04-22) recommends remotely-managed tunnels created through the
  dashboard for Workers VPC. [verified]

---

### F6. Hard Cloudflare limits and prices that constrain the design

Claim: the numbers below are the ones that decide whether a per-box, per-job or
per-tenant tunnel model is affordable.

Evidence, all from `https://developers.cloudflare.com/cloudflare-one/account-limits/`
and `https://developers.cloudflare.com/fundamentals/api/reference/limits/`
(read 2026-10-29):

| Limit | Value |
| --- | --- |
| Service tokens (Cloudflare One) | 50 |
| Reusable policies | 500 |
| mTLS root certificates | 50 |
| Identity providers | 50 |
| `cloudflared` tunnels per account | 1,000 |
| Routes (CIDR + hostname) per account | 50,000 (shared with Cloudflare Mesh) |
| Published applications per tunnel | Limited by 1 MB configuration size |
| Active `cloudflared` replicas per tunnel | 25 |
| Virtual networks per account | 1,000 |
| Client API per user/account token | 1,200 requests / 5 minutes |
| Client API per IP | 200/second |
| User API tokens per user | 50 |
| Account API tokens per account | 500 |

[verified]

Pricing, from `https://developers.cloudflare.com/tunnel/features/tunnels-for-platforms/`
(last updated 2026-10-16): "Tunnels for Platforms costs $4.50 per additional
tunnel per month. The first 1,000 tunnels in every account remain included at
no cost." Also: "Every tunnel that exists in your account counts toward your
limit. This includes tunnels that are inactive or have no connected
`cloudflared` replicas." And the recommended lifecycle hygiene: retry with
exponential backoff and jitter, use unique deterministic names like
`tunnel-<CUSTOMER_ID>-<REGION>`, reconcile regularly, delete unused tunnels,
pre-create a pool for latency-sensitive workloads, run at least two replicas
per tunnel for HA. [verified]

Tunnel health states, from `https://developers.cloudflare.com/tunnel/observability/`
(last updated 2026-10-02): Healthy (four connections), Inactive (created, never
run), Down (previously connected, now disconnected), Degraded (running, at
least one connection failed). Notifications exist for "Tunnel Health Alert" and
"Tunnel Creation or Deletion Event", delivered by email or webhook, included
with all Zero Trust plans. [verified]

---

### F7. okou-ai/okou issue #2801 is a complete, published design doc for exactly this pattern

Claim: an issue on a commercial repo contains a full architecture for "control
plane provisions Cloudflare tunnels, Access apps and service tokens on demand;
the user's machine runs `cloudflared tunnel run --token`; the sandbox side
authenticates with CF Access service-token headers". It is the best single
reference for the two-token model.

Evidence: issue
https://github.com/okou-ai/okou/issues/2801 ("feat: add bridge API for
authenticated Cloudflare tunnels", opened by e7h4n on Feb 11 2026, now Closed).
Repo `okou-ai/okou`, formerly `vm0-ai/vm0` (both names resolve to the same
repo: 1162 stars, license NOASSERTION i.e. not OSI-recognised, TypeScript,
created 2025-11-14, last push 2026-10-29, 87 open issues). [verified]

The design, quoted from the issue:

- Two token types, "completely separate": the Tunnel Token
  (`cloudflared tunnel run --token`) is scoped to ONE tunnel, is a base64 JSON
  containing the tunnelId, and is returned to the user once; the Service Token
  carries CF Access headers for the sandbox, is per-bridge, is stored
  server-side, is never shown to the user, has a 2h TTL and is rotated.
- Backend steps for `POST /v1/bridges`: create a named CF tunnel with
  `config_src: "cloudflare"`, configure ingress with one hostname per service,
  create a CF Access Application (self-hosted type), create a CF Service Token
  with `duration: "2h"`, create an Access Policy allowing the service token,
  upsert a connector and its secrets, then return `{ tunnel_token, services }`.
- `DELETE /v1/bridges/:id` deletes in reverse: service token, Access app,
  tunnel, connector, secrets.
- Cost analysis in the issue: "Tunnels: free (1,000/account). Access: free
  tier, 50 service tokens/account (all plans), service tokens are not seats.
  Enterprise ($3K+/mo) required only if >50 concurrent bridges. Per-bridge
  token model: max 50 concurrent bridges on free tier."
- It also notes the SDK surface as `client.zeroTrust.tunnels.cloudflared`,
  `client.zeroTrust.access.applications`, `client.zeroTrust.access.serviceTokens`
  with `serviceTokens.rotate()`.

[verified - I read the issue in full via the pkgforge reader; the repo metadata
is from `gh api`. The "$3K+/mo" figure is the issue author's claim, not
something I confirmed against Cloudflare pricing pages]

---

### F8. DockFlare is the dominant Cloudflare Tunnel management project, and v3 already did the master/agent split

Claim: if the operator wants a working reference for "one control plane,
many Docker hosts, each with its own tunnel", DockFlare v3 is the most
complete one, and it is the highest-star project in this niche by two orders of
magnitude. Its master, however, runs on your own Docker host, not on Workers.

Evidence:
- Repo `ChrispyBacon-dev/DockFlare`. 2493 stars. License GPL-3.0 (the repo's
  `LICENSE.MD` begins "# GNU General Public License v3.0"; GitHub reports
  NOASSERTION because the file is named `LICENSE.MD`). Language Python. Created
  2025-04-12. Last push 2026-10-06. 4 open issues. [verified]
- Releases: v3.1.6 (2026-09-20), v3.1.5 (2026-09-01), v3.1.3 (2026-08-05),
  v3.1.2 (2026-05-08), v3.1.1 (2026-04-26). [verified]
- README tagline: "DockFlare is a self-hosted ingress and access-control plane
  for Cloudflare Tunnel environments. It continuously translates your desired
  state into Cloudflare ...". It watches Docker container labels and manages
  Cloudflare Tunnel routes, DNS records and Zero Trust Access policies.
  [verified]
- The v3.0 release discussion (`discussions/226`, Sep 23 2025) states: "The
  master can now orchestrate Cloudflare tunnels across multiple Docker hosts
  via the new DockFlare Agent, transforming the UI into a central fleet control
  room. With Redis underpinning the event bus ...". Breaking changes: Redis is
  now required, a new compose structure with a docker socket proxy, and "The
  embedded `cloudflared` is for the master host only. For managing tunnels on
  other hosts, the new DockFlare Agent is the required approach." [verified]
- `dockflare-agent/README.md` states the architecture in one table: DockFlare
  Master "Stores desired state, reconciles DNS/Access policies, issues commands
  via HTTPS"; Redis "Provides the backplane for heartbeats, command queues, and
  shared caches"; DockFlare Agent "Runs on the managed host, watches Docker
  events, manages `cloudflared`, and reports status"; cloudflared "The
  Cloudflare tunnel process launched and supervised by the agent". [verified]
- Agent design notes worth stealing: per-agent API keys that can be rotated or
  revoked without affecting the rest of the fleet; "cached tunnel state lets
  agents ride out transient master outages"; the agent goes through a
  `tecnativa/docker-socket-proxy` with only CONTAINERS, EVENTS, NETWORKS,
  IMAGES, POST, PING, INFO, EXEC enabled, which limits the Docker API surface
  the agent can reach; the managed cloudflared image is pinned by digest
  (`repo:tag` or `repo@sha256:<digest>`). [verified]
- The agent is a headless Python service; env: `DOCKFLARE_MASTER_URL`,
  `DOCKFLARE_API_KEY`, `DOCKER_HOST`, `AGENT_DISPLAY_NAME`, `CLOUDFLARED_IMAGE`,
  `LOG_LEVEL`, `TZ`. Status in the README badge: Beta. [verified]

---

### F9. context-labs/cloudflared-operator already bridges Kubernetes Ingress to Cloudflare tunnels and Workers VPC services

Claim: there is a small, current, MIT-licensed K8s operator that creates
remotely-managed tunnels, fetches their run tokens into Secrets, runs a
`cloudflared` Deployment, and creates *private hostname routes* plus optional
*Workers VPC services*. For a data plane on Kubernetes this removes most of the
glue.

Evidence:
- Repo `context-labs/cloudflared-operator`. 59 stars. License MIT. Language Go.
  Created 2026-08-26. Last push 2026-08-26 (same day, so it is a very young
  project: one day of history at creation). 0 open issues. Size 87 KB.
  [verified]
- README, verbatim: "A Kubernetes operator that provisions Cloudflare Tunnels
  and routes Kubernetes Ingresses through them - in the style of the Tailscale
  operator. Create a `CloudflareTunnel` custom resource, point an Ingress at
  it, and the operator wires everything up on the Cloudflare side". [verified]
- Per `CloudflareTunnel` CR: get-or-create a remotely-managed tunnel
  (`cfd_tunnel`) by name, fetch the run token into a `<name>-token` Secret, own
  a `cloudflared` Deployment running
  `cloudflared tunnel --no-autoupdate run --token $(TUNNEL_TOKEN)` with 2
  replicas by default and `/ready` health probes. Status reports tunnel ID and
  live connection count. [verified]
- Per Ingress with `ingressClassName: cloudflare` and the annotation
  `tunnels.cloudflare.com/tunnel: <name>`: always creates a private hostname
  route (`POST /accounts/{acc}/zerotrust/routes/hostname`) mapping hostname to
  tunnel, so "Inside the cluster, cloudflared resolves that hostname via
  cluster DNS to your backend Service - no public DNS needed. This is how
  Workers reach in-cluster services through the tunnel." Optionally creates a
  Workers VPC service in the connectivity directory
  (`type: tcp`, `tcp_port`, `host.resolver_network.tunnel_id`) for a
  `{ type: "vpc_service", service_id }` binding. Optionally exposes publicly
  with a proxied CNAME `<host> -> <tunnelID>.cfargotunnel.com`. [verified]
- Prerequisites: Kubernetes 1.25+, a Cloudflare API token with Zero Trust
  tunnels (edit), connectivity directory (edit) and DNS (edit). Installs via
  Helm from `oci://ghcr.io/context-labs/charts/cloudflared-operator`, with
  build provenance and SBOM attestations (Sigstore/GitHub OIDC) and
  `gh attestation verify`. A tunnel CR cannot be deleted while Ingresses
  reference it; a finalizer holds and emits a `TunnelInUse` warning.
  [verified]
- Note: "Cloudflare itself also refuses to delete tunnels that still have
  routes." [verified]

Maturity caveat: created and last pushed on the same day (2026-08-26), 59
stars, 0 issues, no releases published. Treat as a design reference and a
possible contribution target rather than as production-ready. [verified]

---

### F10. Two smaller Cloudflare Tunnel management projects, both early

| Repo | Stars | Licence | Created | Last push | Language | Last release | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `stwins60/tunnelflow` | 4 | MIT | 2026-06-10 | 2026-10-24 | TypeScript | v1.2.0 (2026-06-19) | "Self-hosted Cloudflare Tunnel management platform". Next.js + Prisma. Ships an MCP server, a `POST /api/deploy` + `DELETE /api/deploy` deployment API, scoped Bearer API keys (`read`/`write`/`deploy`/`admin`), multi-account credentials, per-server HTTP health polling with maintenance windows, and YAML config-as-code export/import with dry-run diff. Its README lists `CF_MAX_RETRIES` (default 3) and `CF_RETRY_BASE_DELAY_MS` (default 500) for Cloudflare API retries. |
| `Hiutaky/dockerflare` | 86 | GPL-3.0 | 2026-01-28 | 2026-03-08 | TypeScript | v0.1.3 (2026-03-08) | "A modern, web-based Docker container orchestration and management platform powered by Cloudflare WARP." "Automatically discover and manage Docker hosts using Cloudflare tunnels. Live status updates with comprehensive dashboards and metrics." Last push 2026-03-08, so it looks dormant; 0 open issues; 592 KB. |

[verified, all figures from `gh api` on 2026-10-29]

Neither is mature. tunnelflow is the more interesting of the two for the spec
because its API surface is already shaped for machine callers (deploy API,
scoped keys, MCP), but 4 stars and a June release mean unproven. [verified for
the metadata; the quality judgement is mine]

---

### F11. The inverse direction is crowded: self-hosted Workers platforms

Claim: several projects have already built "run the Workers model on your own
hardware". They are not competitors to the operator's plan (which keeps the
control plane on Cloudflare), but they are the fallback if the operator ever
wants to leave Cloudflare entirely, and they are a source of reusable pieces.

| Project | Stars | Licence | Created | Last push | Language | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| `wdl-dev/wdl` | 55 | Apache-2.0 | 2026-06-24 | 2026-10-22 | JavaScript | "Self-hosted multi-tenant Workers platform on stock Cloudflare workerd with multi-replica failover". Sibling repos in the org: `cli` (Apache-2.0, tenant CLI wrapping Wrangler, "deploy Cloudflare Workers-style apps and manage D1, R2, KV, queues, Durable Objects, Workflows, secrets, and live logs"), `docs`, `site`, `chat` ("A WDL Worker that builds WDL Workers"), `aws-sigv4`. |
| `openworkers/openworkers-runner` | 237 | MIT | - | 2026-10-27 | Rust | Self-hosted Workers runtime on `rusty_v8`. The org has ~30 repos including `openworkers-api` (TypeScript, 16 stars), `openworkers-cli` (Rust), `openworkers-dash` (TypeScript), `openworkers-scheduler`, `openworkers-logs`, `postgate` ("Multi-tenant HTTP proxy for PostgreSQL with SQL validation"), and five runtime backends (v8, deno, nova, boa, quickjs, jsc, wasm). |
| `solcreek/creek` | 7 | Apache-2.0 | 2026-04-06 | 2026-10-15 | TypeScript | "Open-source edge deployment platform. Deploy full-stack apps to Cloudflare Workers in seconds." Topics list `workers-for-platforms` and `durable-objects`. 13 open issues, no releases published. |

[verified, all figures from `gh api` on 2026-10-29]

The WDL author's own summary (Reddit r/selfhosted, thread id 1urqt4u, read
2026-10-29) is a useful maturity statement to calibrate against: "Not a global
edge network. Single region ... Not a 100% drop-in for Cloudflare Workers ...
Early - not battle-tested at scale." [verified]

Cloudflare's own `workerd` is the runtime underneath: the HN discussion at
https://news.ycombinator.com/item?id=46454693 (Show HN: OpenWorkers, 500
points, 9 months ago, 158 comments) includes a reply from kentonv, who says he
is the lead engineer for Cloudflare Workers: "workerd itself is a runtime for
Workers and Durable Objects, but is not intended to provide implementations of
other services like KV, D1, etc. Wrangler / miniflare provides implementations
of most of these for local testing purposes, but these aren't really meant for
production. But workers + DO alone is enough to do a whole lot of things..." and
on the stale beta warning in the workerd README: "that is because nobody ever
looks at the readme so it hasn't been updated basically since workerd was
originally released." [verified - I read the thread in full]

---

### F12. A real-world deployment writeup uses exactly the Worker-control-plane pattern, with presigned R2 URLs to keep bytes off the Worker

Claim: an independent operator has publicly documented the operator's target
architecture, including the trick that solves the "heavy data must not flow
through the Worker" problem.

Evidence: `https://skyphusion.net/blog/vivijure-constellation/`, read
2026-10-29. The relevant passage, verbatim: the five CPU services "join a
private `vivijure` Docker network and are reached from the Cloudflare Worker
over Workers VPC through a cloudflared tunnel connector. The Worker presigns
short-lived R2 GET/PUT URLs and passes them in the request body, so the
containers stay stateless and credential-free: no R2 bindings, no secrets
mounted, no media bytes flowing through the Worker." The same post describes
three GPU satellites on RunPod, and `docker compose up` with "a native
cloudflared quick-tunnel so first run needs no tunnel setup" and "a shared
byte-identical core extracted into `vivijure_local.core` so the two doors
cannot drift". [verified]

The presigned-URL pattern is the single most transferable idea in this research
for the CI and storage legs of the design: it keeps the Worker as a pure
control plane and keeps bulk bytes on the data plane. [verified]

---

### F13. Cloudflare's own open-source Workers app as a model for the SPA

Claim: Cloudflare ships an Apache-2.0, actively developed, large TypeScript
application built entirely on Workers, which is the best available reference
for what a production Workers-hosted SPA plus API looks like.

Evidence:
- Repo `cloudflare/cloudflare-os`. 11608 stars. License Apache-2.0. Language
  TypeScript. Created 2026-04-15. Last push 2026-10-29. 178 open issues.
  Size 37762 KB. [verified]
- Description: "Agent workspace built on Cloudflare Workers for creating
  documents, building apps, and running agents with your company's context and
  systems." It is listed in `theoephraim/awesome-cloudflare-selfhosted` (1210
  stars, MIT, created 2026-09-15, last push 2026-10-01, 23 open issues) under
  "Business and operations" as a Notion-style AI workspace, with bindings
  "KV, Durable Objects". [verified]
- Repo layout includes `packages/gatekeeper-kit`, `packages/gatekeeper-mcp`,
  `packages/gatekeeper-microsoft`, `packages/workshop-backend`,
  `packages/workshop-frontend`, `packages/bundled-blueprints`,
  `packages/mcp-shared`, `packages/integration-tests`. There are CI workflows
  for ci, preview, workshop-evals and bonk. Docs include `docs/public-server.md`
  which documents an auth model built from OAuth gatekeepers
  (`AUTH_GATEKEEPERS=cloudflare,google,github`), `ENABLE_CLOUDFLARE_LIMITS`,
  `DISABLE_PASSWORD_AUTH`, and a `.dev.vars` file for local secrets. [verified]
- The `packages/gatekeeper-kit/src/connect-*.ts` files (`connect-handshake.ts`,
  `connect-nonce.ts`, `connect-pages.ts`) are the closest thing to a published
  Cloudflare pattern for authenticating an external client into a Worker, which
  is what a data-plane agent needs to do. [verified for the file names and
  their existence; I did not read their contents]

Caveat: I read only `docs/public-server.md` in full plus the file listing. The
`connect-*` sources are unread. [stated so the operator knows the boundary]

---

### F14. The tunnel-project landscape, for completeness

`anderspitman/awesome-tunneling` (21990 stars, no licence file, created
2020-09-16, last push 2026-10-06, 1 open issue) is the maintained index. Read
in full on 2026-10-29. Its own recommendations: "For most people, I currently
recommend Cloudflare Tunnel ... If you want to self-host ... For something
production ready I would look at Pangolin or frp." It describes Cloudflare
Tunnel's client as "Apache 2.0 licensed and written in Golang" and lists
DockFlare as "Self-hosted control plane that automates Cloudflare Tunnel, DNS,
and Zero Trust Access from Docker labels and a web UI. GPL-3.0. Requires a
Cloudflare account and API token." It also has a policy note: "Given the
sensitive nature of tunneling tools, I'm going to start requiring at least 100
GitHub stars on any new additions." [verified]

`cloudflare/cloudflared` itself: 16337 stars, Apache-2.0, Go, created
2017-10-13, last push 2026-10-29, 572 open issues. Latest releases 2026.10.5
(2026-10-27), 2026.10.4 (2026-10-26), 2026.10.3 (2026-10-21), 2026.10.2
(2026-10-20), 2026.10.1 (2026-10-15). Releases are roughly weekly and the repo
is pushed daily. [verified]

---

## 2. Comparison table

### Prior art for "control plane on Workers, data plane on own metal"

| Project | Control plane runs on | Data plane runs on | Transport | Licence | Stars | Last push | Reusable for the operator |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gofixpoint/amika` (open half) | Amika's closed gateway; relay is a Cloudflare Durable Object per host | `amika-hostd` daemon (Hono/Node) on your machine, smolvm VMs | WSS, `amika.tunnel.v2`, multiplexed streams with credit flow control | Apache-2.0 (open half) | 295 | 2026-10-28 | Highest. The tunnel protocol, the dial/serve/bridge file split, the three-secret model and the `setWebSocketAutoResponse` cost trick are all directly copyable. The relay itself is closed. |
| `harshalgajjar/Reminal` | Cloudflare Worker + 3 Durable Objects (free tier) | Go agent on your machines, WebRTC DataChannel for the media path | WSS session pairing, E2E encrypted | AGPL-3.0 | 323 | 2026-10-29 | High for the relay design and the wildcard-subdomain routing trick. Copyleft is a constraint. |
| `ChrispyBacon-dev/DockFlare` v3 | Your own Docker host (Flask/Python) + Redis | `dockflare-agent` (Python) on each Docker host | HTTPS master/agent, agent supervises cloudflared | GPL-3.0 | 2493 | 2026-10-06 | High as an architecture reference (desired-state master, per-agent keys, cached state to ride out master outage). Wrong host for the control plane. |
| `context-labs/cloudflared-operator` | Kubernetes control plane | cloudflared Deployment, 2 replicas | K8s CR + Cloudflare API | MIT | 59 | 2026-08-26 | High if the data plane is k8s: it already emits private hostname routes and Workers VPC services. Very young. |
| `stwins60/tunnelflow` | Your own host (Next.js + Prisma) | n/a, manages cloudflared | HTTPS API + MCP | MIT | 4 | 2026-10-24 | Medium. API shape (deploy API, scoped keys, MCP) is the right shape for a control plane. Unproven. |
| `Hiutaky/dockerflare` | Your own host | Docker hosts via Cloudflare tunnels | HTTPS | GPL-3.0 | 86 | 2026-03-08 | Low. Dormant since March 2026. |
| `okou-ai/okou` issue #2801 | A commercial backend (n/a to the operator) | User's machine running cloudflared | Named tunnel + Access service token | NOASSERTION | 1162 | 2026-10-29 | High as a design doc. Two-token model and the teardown ordering are copyable. |
| `wdl-dev/wdl`, `openworkers`, `solcreek/creek` | Your own hardware | Your own hardware | n/a | Apache-2.0 / MIT | 55 / 237 / 7 | 2026-10-22 / 2026-10-27 / 2026-10-15 | Low for this spec. These are the exit route if the operator ever drops Cloudflare entirely. |

### Cloudflare API and SDK surface the control plane needs

| Need | Surface | Source | Status |
| --- | --- | --- | --- |
| Create / list / edit / delete a tunnel | `POST/GET/PATCH/DELETE /accounts/{id}/cfd_tunnel` | cloudflare-go `TunnelCloudflaredService`, Terraform `cloudflare_zero_trust_tunnel_cloudflared` | Stable |
| Get a connector token | `GET /accounts/{id}/cfd_tunnel/{tid}/token` | cloudflare-go `tunnelcloudflaredtoken.go` | Stable |
| Remote tunnel configuration (ingress) | `PUT .../cfd_tunnel/{tid}/configurations` | cloudflare-go `tunnelcloudflaredconfiguration.go`, Terraform `..._cloudflared_config` | Stable |
| Inspect live connections | `GET .../cfd_tunnel/{tid}/connectors/{cid}/connections` | cloudflare-go `TunnelCloudflaredConnectionService.Get` | Stable |
| Register a private service for Workers | `POST /accounts/{id}/connectivity/directory/services` | Cloudflare API connectivity directory | Stable per wrangler metadata; product is open beta |
| Bind a Worker to it | `vpc_services` in wrangler config, `service_id` binding | wrangler 4.155.0 `packages/wrangler/src/vpc/` | Namespace `open beta` |
| Raw TCP out of a Worker | `connect()` on a VPC Network binding | workers-vpc/api | open beta |
| Access app + service token | `client.zeroTrust.access.applications`, `.serviceTokens` | cloudflare npm 7.3.0 | Stable; 50 service tokens per account |
| Deploy the Worker itself | `wrangler deploy` | wrangler 4.155.0, `MIT OR Apache-2.0` | Stable |
| Terraform-manage the whole thing | `cloudflare/terraform-provider-cloudflare` v5 | 1351 stars, Apache-2.0 | Stable; `cloudflare_tunnel` renamed to `cloudflare_zero_trust_tunnel_cloudflared` in v5 |

---

## 3. What this changes for the spec

1. **Build the tunnel relay as a Durable Object, one per host, and copy
   amika's framing.** amika's `tunnel.md` is the most valuable single artefact
   found. Its architecture - one Durable Object relay per host, one stream per
   inbound request, the host serving each stream with the *same* Hono app it
   would serve on a real listener via `tunnel-socket-pair.ts` plus
   `tunnel-serving.ts` - means the operator writes the data-plane HTTP API once
   and gets both a listening mode and a tunneled mode for free. Adopt
   `amika.tunnel.v2`'s shape (9 frame types, 5-byte header, 256 KiB initial
   window, 64 KiB max data frame, 256 concurrent streams) rather than inventing
   one. [evidence: F2]

2. **Use three separate credentials, not one.** amika's hardest-won lesson:
   the user API key, the inbound daemon secret key, and the outbound attachment
   credential are three different permissions and must not share a value. The
   attachment credential goes in a handshake header (`x-amika-host-credential`),
   never in a URL. Budget for the renewal problem up front: a bearer string
   survives re-presentation on lease renewal, a timestamp-bound assertion does
   not, so a keypair model requires a gateway-side change first. [evidence: F2]

3. **Register the tunnel keep-alive with `setWebSocketAutoResponse`.** amika
   found that a plain WebSocket ping frame cannot be auto-answered by the
   runtime, but a *text message* pair can, and that this is the difference
   between an idle host costing a billed message and costing nothing. This is a
   direct, quantified cost saving on a Workers-hosted control plane and it is
   the kind of detail that only comes from reading the source. [evidence: F2]

4. **Reach private services with Workers VPC, not with public hostnames plus
   Access, wherever VPC covers it.** VPC Services are purpose-built for
   "Worker calls a private service", they do not need a public DNS record, and
   the operator's (b) requirement is literally their use case. But the spec must
   carry three constraints from F5: the product is open beta; the port in the
   `fetch()` URL is ignored and only the VPC Service config decides routing
   (so SSRF is structurally prevented, which is a security win worth stating);
   and origin TLS must be publicly trusted or Cloudflare Origin CA, so
   self-signed certs on the data plane fail under `verify_full`. Use
   `--cert-verification-mode disabled` only on a private tunnel. [evidence: F5]

5. **Keep one tunnel per machine, never one per job.** F6 gives the arithmetic:
   1,000 tunnels free per account, $4.50 per additional tunnel per month, and
   inactive tunnels still count. A handful of machines is free forever. One
   tunnel per CI job is not. The correct shape is one long-lived tunnel per box,
   with the control plane writing remote ingress configuration and VPC service
   registrations over the API. [evidence: F6]

6. **Use a remotely-managed tunnel (`config_src: "cloudflare"`), never a
   locally-managed one.** Remotely-managed configuration is stored on Cloudflare
   and is manageable from the dashboard, API or Terraform, which is exactly what
   a Worker control plane needs. A locally-managed tunnel puts the config in a
   YAML file on the origin machine and the control plane cannot touch it.
   Cloudflare's own Workers VPC docs recommend remotely-managed. [evidence: F4,
   F5]

7. **Adopt the two-token model from okou issue #2801.** The tunnel token is
   scoped to one tunnel, is base64 JSON containing the tunnelId, and is handed
   to the box once. The Access service token is a separate credential held only
   by the control plane, minted per bridge with a 2h TTL and rotated. Do not
   conflate them, and do not let a box see the second one. Budget the 50-service-
   token account limit into any per-tenant design. [evidence: F7]

8. **Solve the bytes problem with presigned R2 URLs.** The vivijure writeup
   (F12) is the pattern to copy for CI artefacts and storage: the Worker
   presigns short-lived R2 GET/PUT URLs and passes them in the request body, so
   the data-plane container stays stateless and credential-free and no media
   bytes flow through the Worker. This is also the cheapest possible answer to
   "self-hosted R2 replacement" traffic costs, since the heavy payloads never
   traverse Cloudflare's edge twice. [evidence: F12]

9. **Treat the Cloudflare API rate limit as a first-class design constraint.**
   1,200 requests per 5 minutes per token is roughly 4 requests per second
   sustained. A control plane that reconciles N hosts on a short loop will hit
   it. Tunnels for Platforms' own best-practice list (exponential backoff with
   jitter, queue create/delete, deterministic names like
   `tunnel-<CUSTOMER_ID>-<REGION>`, regular reconciliation, pre-created tunnel
   pools) is the mitigation, and it should be built into the Worker's reconcile
   loop rather than bolted on. [evidence: F6]

10. **If the data plane is Kubernetes, start from cloudflared-operator rather
    than from scratch.** It already emits private hostname routes (the thing
    that makes Workers able to reach in-cluster services with no public DNS)
    and optional Workers VPC services, and it owns the cloudflared Deployment
    with health probes. But it is 59 stars, created and last pushed on the same
    day, with no releases. Treat it as a design reference to copy, not a
    dependency to adopt. [evidence: F9]

11. **Model the SPA on cloudflare-os, not on a bespoke stack.** 11.6k stars,
    Apache-2.0, pushed daily, and it contains the patterns the operator needs:
    a `workshop-frontend` package, a `gatekeeper-kit` with connect-handshake and
    connect-nonce sources, a documented `.dev.vars` local-secrets flow, and CI
    plus preview-deploy workflows. Read `packages/gatekeeper-kit/src/connect-*.ts`
    before designing the agent-to-Worker authentication. [evidence: F13]

12. **Do not build a self-hosted Workers runtime.** The inverse direction
    (WDL, OpenWorkers, creek) is already crowded and all three self-describe as
    early. The operator's hard constraint puts the control plane on Cloudflare
    anyway, so the only question is which Cloudflare primitives to use, and the
    answer is Workers plus Durable Objects plus Workers VPC plus R2 plus
    Queues. The self-hosted-Workers projects matter only as an exit route.
    [evidence: F11]

13. **Plan for Cloudflare being a dependency you cannot debug from inside.**
    The HN thread at F11 records the standard failure mode: one operator ran
    everything through Cloudflare Tunnels with no inbound ports at all, and the
    top reply was "Not even ssh? What happens if cloudflare goes down?" The
    spec needs a documented break-glass path (provider console access, or a
    WireGuard/Tailscale fallback) that does not traverse Cloudflare. This is a
    B4 concern but it is a direct consequence of the B8 architecture. [evidence:
    F11, F14]

---

## 4. Not covered / open questions

1. **The amika relay implementation is closed.** `js/gateway-cloudflare` lives
   in the closed `amika-mono`. I read the client half and the shared protocol,
   and the client docs describe the relay's behaviour in detail, but I have not
   seen the relay source. Anything about how the relay handles lease renewal,
   `CLOSE_LEASE_EXPIRED`, or the generation fence is inferred from the client
   docs. [named gap]

2. **`cloudflare/cloudflare-os`'s `connect-*` sources are unread.** I confirmed
   the files exist and read `docs/public-server.md`, but not
   `packages/gatekeeper-kit/src/connect-handshake.ts`, `connect-nonce.ts` or
   `connect-pages.ts`. These are the most relevant published Cloudflare pattern
   for authenticating an external client into a Worker and should be read
   before the spec is finalised. [named gap]

3. **Workers VPC pricing and GA date are unverified.** The docs page says beta
   and wrangler's namespace metadata says open beta. I did not find a pricing
   page or a GA announcement in this session. Treat all VPC cost figures as
   unknown. [unverified]

4. **The $3K+/month Enterprise figure in okou issue #2801 is the issue author's
   claim**, not something I confirmed against a Cloudflare pricing page. [unverified]

5. **No search of Reddit or HN specifically for the operator's phrasing
   succeeded in finding a project that is exactly this.** I searched HN
   (OpenWorkers thread, State of Homelab 2026, Cloudflare Quick Tunnels, CLI
   agents make self-hosting easier, Octelium threads) and Reddit (r/selfhosted
   WDL thread, r/CloudFlare Dockerflare announcement, r/homelab and r/selfhosted
   tunnel threads) via the pkgforge gateway. The closest hits are the ones
   catalogued above. A broader manual sweep of r/selfhosted and r/homelab with
   different search terms might surface a small personal project, but nothing
   with the maturity to reuse. [stated boundary]

6. **Tunnel ingress limits per configuration are only loosely specified.**
   Cloudflare says "Published applications per tunnel: Limited by 1 MB
   configuration size". I did not find a documented per-tunnel ingress-rule
   count. A control plane that writes many routes per tunnel will need to
   measure this. [unverified]

7. **Durable Object limits and pricing for the relay are not covered here.**
   Reminal's README asserts the free tier is "more than enough for personal
   use" at 100,000 requests/day, but a control plane that holds one DO per host
   with a persistent WebSocket has a different billing shape (DO duration and
   WebSocket messages, not request count). No figures gathered. [unverified]

8. **Browser terminal into a box (the (a) requirement) is only partially
   covered.** Cloudflare's own browser-rendered SSH
   (`.../cloudflare-tunnel/use-cases/ssh/ssh-browser-rendering/`, last updated
   2026-04-17) requires routing SSH through a public hostname behind Access,
   which contradicts the "no public hostname" preference. Reminal solves it with
   a Worker-hosted viewer plus a WebRTC DataChannel, under AGPL-3.0. Whether
   there is a permissively licensed option was not settled here. [named gap,
   belongs to B4]

9. **No verification that `cloudflared` can be driven entirely by token with no
   local config file at the scale the operator wants.** The docs describe
   `cloudflared tunnel run --token TOKEN` (used by both okou issue #2801 and
   cloudflared-operator), but I did not test multi-host token behaviour or read
   the cloudflared source for the token path. [unverified]

10. **Licence compatibility of mixing pieces is not assessed.** amika's tunnel
    protocol is Apache-2.0, Reminal's relay is AGPL-3.0, DockFlare is GPL-3.0,
    cloudflared-operator is MIT, hostc is Apache-2.0. If the operator's control
    plane is closed or SaaS-hosted, AGPL and GPL components are off the table
    and only Apache-2.0 / MIT pieces are safe. I have flagged the licences but
    not made a legal determination. [named gap]
