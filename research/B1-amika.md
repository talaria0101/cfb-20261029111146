# B1-amika: gofixpoint/amika

Research subagent B1-amika. All sources read on 2026-10-29 (UTC). Every figure below comes from a call I actually made (gh api / pkgforge gateway). Where I could not verify, the word "unverified" is written next to the claim.

Repo: https://github.com/gofixpoint/amika  (owner/repo `gofixpoint/amika`, default branch `main`)
Product/site: https://www.amika.dev/  |  Docs: https://docs.amika.dev/  |  Discord linked in README

## 1. Findings

### 1.1 What it is
- **Claim:** amika is "Multiplayer cloud workstations for coding agents and humans." A "Rig" is a VM workstation pre-loaded with git repos plus one or more coding agents (Claude Code, Codex, OpenCode, Pi, or a custom agent). Rigs are created on any compute backend and controlled remotely from chat apps, web UI, API, CLI, SSH, or editors (Cursor, the Codex app). The project self-describes as an "operating system" for AI agents, i.e. a networked runtime sitting on top of any cloud or computer.
- **Evidence:** README.md (main), https://github.com/gofixpoint/amika. gh api description field: "Multiplayer cloud workstations for coding agents and humans". amika.dev homepage (via pkgforge read): "Cloud devboxes for coding agents, on computers you already own... slices computers you already own into isolated devbox VMs... on one private network you can reach from anywhere."
- **Label:** [verified]
- **Who makes it:** Copyright 2026 Fixpoint (LICENSE header, read via gh api). GitHub org `gofixpoint` shows 15 repositories (pkgforge search snippet). HN "Show HN" thread: https://news.ycombinator.com/item?id=49716282, dated 2026-09-15 (pkgforge search result). [verified]

### 1.2 Repo health / maturity
- **Claim:** young but very actively developed; beta; permissive license.
- **Evidence (gh api repos/gofixpoint/amika, read 2026-10-29):**
  - stargazers_count: 295
  - forks_count: 26
  - open_issues_count: 45
  - license: Apache-2.0 (LICENSE text confirmed: "Apache License, Version 2.0", "Copyright 2026 Fixpoint")
  - language: TypeScript (GitHub primary)
  - created_at: 2026-02-05T21:52:07Z  (approx 9 months old at read date)
  - pushed_at: 2026-10-28T20:09:37Z  (pushed the day before I read it: alive)
  - size: 5730 KB
  - default_branch: main
  - commit count: approx 1472 (gh api commits?per_page=1 Link header, rel="last" page=1472) [verified as approximate]
  - contributors: approx 7 (gh api contributors Link header, rel="last" page=7 at per_page=1) [verified as approximate]
  - language byte split (gh api .../languages): TypeScript 1,968,376; Go 1,852,545; Shell 221,621; Python 35,521; Dockerfile 36,408; JavaScript 25,375; Makefile 4,938. So roughly half TypeScript (control-plane/SDK/hostd/protocol), half Go (amika CLI + amikad daemon).
- **Label:** [verified]
- **Releases (gh api .../releases, read 2026-10-29):** the repo is a monorepo of independently versioned components. Most recent first:
  - `amika-hostd@v0.6.0-beta.1` 2026-10-28 (prerelease)
  - `amika-hostd@v0.5.0` 2026-10-27 (stable)
  - `amika-hostd@v0.5.0-beta.{1..4}` 2026-10-25/26
  - `amikalog@v0.2.1` 2026-10-23 (stable)
  - `amikad@v0.2.1` 2026-10-23 (stable)
  - newest tag overall: `sdk-typescript@v0.15.0`
  - README status badge: "status-beta". [verified]
- **Recent commit focus (gh api commits, read 2026-10-29):** the last ~8 commits (all 2026-10-28, author jdc123) are almost entirely the tunnel/relay layer: "Speak amika.tunnel.v2 to a per-host relay (#639)", "Namespace the tunnel keep-alive strings", "Refuse one stream for an OPEN head that is malformed", "Keep one bad stream from costing the whole tunnel", "Bound close reasons and relayed message queues", "Check a service's response head before relaying it". The tunnel/gateway layer is the active development front. [verified]

### 1.3 The actual components, and which are open vs closed
This is the central finding. The README has a "What's open source and what's closed source" section and the ROADMAP.md restates it. Read directly, both agree.

**Open source today:**
- `amika` (Go CLI, `go/cmd/amika`): two modes. Direct mode talks straight to `amikad` on a sandbox. "Scalable" mode talks to the closed Amika Control Plane. Cobra-based; module `github.com/gofixpoint/amika/go`, go directive 1.26.10. [verified]
- `amikad` (Go daemon, `go/cmd/amikad` + `go/internal/amikad`): runs inside each Rig/VM. Source tree shows `command.go` (agent messaging), `operations.go` (filesystem ops), `sshd/` (SSH server), `state/`, `norelay/`, platform background files. Per ROADMAP its capabilities are: Agent Messaging Layer (HTTP APIs to message Claude Code / Codex / OpenCode / Pi / custom agents over the Agent Communication Protocol, agentcommunicationprotocol.dev; streaming; session management; hooks to pipe sessions to your own datastore or the control plane), and a Sandbox Filesystem Layer (host<->sandbox sync, file materialization). Roadmap also lists a network proxy and a secrets vault as amikad capabilities. [verified]
- `sandbox-image` (top-level dir): Rig VM snapshots/images; defines the Rig environment (Dockerfiles + Python materialization scripts). [verified]
- `sdk-typescript` / `@amika/sdk` (`sdk/typescript`): TypeScript client. **Important:** sdk README says it "requires... an Amika account with an API key" and constructs `new AmikaClient({ apiKey })`. It is wired to Amika's hosted API, not a generic control plane. [verified]
- `amika-hostd` / `@amika/hostd` (`js/amika-hostd`): Node.js service built with **Hono**. Bring-your-own-compute daemon; see section 1.4. [verified]
- `@amika/sandbox` (`js/sandbox`): pluggable sandbox-provider layer. Provider contract in `provider.ts`; registry maps names to providers; capability flags per provider (lifecycle, ssh, services, exec, listSandboxes, streaming, snapshots, dockerRegistries, ...). Ships providers for Daytona, Freestyle, smol, E2B; the `smol` provider's runtime primitives are re-used by `amika-hostd`, whose daemon "serves a superset of smolvm's API." Designed so a new vendor is one folder (the README walks through adding an "acme" provider). [verified]
- `@amika/service-auth` (`js/service-auth`): see section 1.5. [verified]
- `@amika/tunnel-protocol` (`js/tunnel-protocol`): see section 1.5. [verified]
- `amikalog` (Go, `go/cmd/amikalog`): capture Claude Code / Codex sessions alongside git repo changes. [verified]
- Experimental/labs: `amikalyze` (guardrails on which files agents can modify), `akfs` (treat file contents as structured data). Marked experimental in README. [verified]

**Closed source today:**
- `amika-control-plane` (referred to internally as `amika-mono` in `js/service-auth/AGENTS.md`): schedules Rigs, stores references to all Rigs; per ROADMAP it also provisions hundreds-to-thousands of sandboxes, enables multiplayer/team-shared sandboxes, indexes and stores agent sessions, centralizes agent skills/tools/MCP config, and holds a centralized mountable file repo. [verified]
- `amika-ui`: web UI. [verified]
- `amika-relay`: per-host, end-to-end-encrypted relay; handles messages to agents, exec commands to Rigs, and network/SSH access. This is the server side of the host tunnel. [verified]

**Stated "open sourced soon" (NOT in the repo tree today):**
- `amika-gateway`: described as the control/data-plane boundary. Per README: "gateway inside your cloud that receives signed or encrypted commands, decrypts them, runs auth checks, and sends them to the right Rig or agent." Per self-hosting.md: when open sourced, "wherever you run the amika-gateway server, if you can connect to its port or socket, you can create Rigs and connect to them," but "the self-hosted amika-gateway is designed for single-player, so it doesn't support identity and access management for multiple users." I searched the tree (gh api search/code for "gateway"): matches are only in `js/service-auth/src/gateway/*` (the auth gateway, a different thing) and doc/README references. The `amika-gateway` server itself is not in the open tree. [verified that it is absent; the "soon" timeline is unverified - no committed date anywhere I read].
- `sandbox-provisioner`: adapter layer converting gateway Rig commands to per-provider format (E2B, K8s, Modal, Daytona). Also not in the open tree today. [verified absent; release timing unverified]
- **Minor discrepancy:** ROADMAP.md lists an `amikactl` CLI ("exists on a sandbox and lets the agent self-control its sandbox"), but `go/cmd` currently ships only `amika`, `amikad`, `amikalog`. `amikactl` as a shipped binary is [unverified] / not present in the tree I read.

### 1.4 amika-hostd: the data-plane daemon that maps onto the operator's architecture
This is the single most relevant open component. Read from `js/amika-hostd/README.md` and `js/amika-hostd/AGENTS.md`.

- **Claim:** `amika-hostd` is a BYOC ("bring your own compute") daemon you install on a machine you control. It registers that machine with the Amika control plane as a "host", then runs each Rig on it as a local VM (via `smolvm serve`, smolmachines.com, driven through the `smol` provider). It keeps working behind a home router because it dials out; alternatively it can listen on a port you expose yourself.
- **Two transports (README "Listening on a port"):**
  - Default: dial out to Amika's gateway over a tunnel WebSocket, so the machine needs no open inbound port.
  - `transport = "listen"` (or `AMIKA_HOSTD_TRANSPORT=listen`): bind `127.0.0.1:3020` and expose it yourself. The README names **ngrok or Cloudflare Tunnel** explicitly, links https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/, and documents `amika-hostd register-url https://<your-tunnel-url>`. In this mode "dev" runs with only `AMIKA_HOSTD_SECRET_KEY` and no Amika services at all.
  - Caveat stated in README: a listening (tunnel) daemon works for rigs, service tokens, and `rig ssh`, "but browsers cannot open the host's previews, since a browser logs in to a preview with a cookie that needs the host's own https origin."
- **HTTP surface (AGENTS.md):** serves `GET /health`, a versioned rig API under `/v0beta1/rigs`, `/v0beta1/snapshots`, and a Smol-compatible `/api/v1/machines`. Built with Hono; ships as a single bundle `dist/bundle/amika-hostd.mjs`.
- **Requirements (README):** Linux x86_64/arm64 glibc 2.34+ **with KVM**, or macOS Apple silicon; `e2fsprogs` only for disks under 20 GiB; outbound HTTPS. So it needs hardware virtualization (KVM/Hypervisor.framework) - not container-only.
- **Label:** [verified]

### 1.5 The tunnel and auth primitives: the directly reusable, control-plane-agnostic pieces
Read from `js/tunnel-protocol/AGENTS.md` and `js/service-auth/AGENTS.md`.

- **`@amika/tunnel-protocol` (`amika.tunnel.v2`):** the frames `amika-hostd` and Amika's per-host relay exchange over the host's tunnel WebSocket. Explicit design rules, quoted:
  - "It runs in a Cloudflare Worker as well as Node. Use `Uint8Array`, `DataView` and `TextEncoder`. No `Buffer` and no `node:` import."
  - Credit accounting for `DATA`, one per direction (flow control / backpressure).
  - Wire-format changes are a new subprotocol (bump `TUNNEL_SUBPROTOCOL`), and the gateway refuses the old one with `426`.
  - [verified] - this codec is open, Worker-compatible, and is the wire contract for the closed relay. The operator can implement his own relay/gateway server side in a Worker against this open spec.
- **`@amika/service-auth`:** "Who may reach a rig's service, and the credentials that say so." Two entry points: `credentials` (sign/verify service tokens, browser-login passes, sessions) and `gateway` (per-request decision: `forward` / `refuse` / `login` / `not-mine`). Quoted design points:
  - "The control plane... signs credentials; a gateway verifies them with the same host secret key, so neither calls the other."
  - "Credentials use only Web Crypto, so they run wherever the control plane does."
  - Requests/responses are Fetch API types; `node:crypto` and `node:net` allowed, HTTP servers are not.
  - Kept separate from amika-hostd "so the auth proxy can become its own package, or a service in front of hosts."
  - [verified] - this is a signed-credential auth split that runs on Cloudflare Workers (Web Crypto + Fetch) and verifies independently on the data plane. Directly the pattern the operator needs.
- **Security invariants in hostd (AGENTS.md, quoted/paraphrased, all [verified]):** every route requires a credential compared in constant time, and the caller credential is never forwarded to the VM runtime; the tunnel attachment credential is a *third* secret distinct from the API key and the secret key, and never lives in config.toml; **hostd opens no streams** (the relay opens one per request, so a compromised host cannot become a forward proxy); a dead tunnel is detected by a namespaced `PING`/`PONG` with a deadline; shutdown closes the WebSocket so the relay drops the route; DATA moves only under granted credit; the host key never reaches a browser and each credential type opens only its own routes; secrets live in one store (keychain or file, never mixed), are handed to the daemon over IPC so they never appear in the process environment, and config/secret files are written atomically at mode 0600. This is a clean, reusable reference implementation of control-plane-signs / data-plane-verifies.

### 1.6 Doc-vs-code / doc-vs-doc disagreements (found, per section 3)
- **self-hosting.md vs architecture/overview.md:** self-hosting.md states "The `amika` CLI no longer creates Rigs on your own machine. The `--local` mode, which ran each Rig as a Docker container on the host, has been removed... There is currently no supported local CLI path." But docs/architecture/overview.md still documents `go/internal/sandbox/docker.go` ("Docker container and volume operations") and an `amika sandbox create|list|connect|delete` command set, plus `materialize/` "Local sandbox script execution (v0)." The overview appears partially stale relative to the removal described in self-hosting.md. [verified that both texts exist and disagree; the overview looks like the stale one.]
- **Roadmap amikactl vs tree:** noted in 1.3.

## 2. Comparison table

### 2.1 Component map for the operator's control-plane / data-plane split
Operator's target: control plane SPA on Cloudflare Workers; data plane (containers/CI/storage) on own metal over Cloudflare Tunnels; orchestrator != Cloudflare.

| amika component | Lang | Open today? | Role in amika | Reusable for the operator? | Notes |
| --- | --- | --- | --- | --- | --- |
| amika (CLI) | Go | Yes | client; direct mode or via closed control plane | Partial | Direct mode (talk to amikad) is usable; cloud mode is not |
| amikad (daemon) | Go | Yes | in-VM agent daemon (ACP messaging, fs, sshd, proxy, vault) | Yes (data-plane agent) | Open protocol (agentcommunicationprotocol.dev); the in-rig agent layer |
| amika-hostd | TypeScript (Hono) | Yes | BYOC daemon; runs rigs as smolvm VMs; dials gateway or listens on a port | **Yes (core data-plane runner)** | Needs KVM; documents Cloudflare Tunnel / ngrok listen mode; register-url |
| @amika/service-auth | TypeScript | Yes | sign/verify service tokens + browser sessions; gateway authorize | **Yes (control/data-plane auth)** | Web Crypto + Fetch only; runs in a Worker; control plane signs, data plane verifies |
| @amika/tunnel-protocol | TypeScript | Yes | amika.tunnel.v2 wire codec (hostd<->relay) | **Yes (tunnel codec)** | Explicitly runs in a Cloudflare Worker; the relay server side is closed but the spec is open |
| @amika/sandbox | TypeScript | Yes | pluggable sandbox-provider layer (Daytona/Freestyle/smol/E2B) | Yes (orchestrator adapter) | Add a provider folder to target the operator's own orchestrator |
| @amika/sdk | TypeScript | Yes | typed client for Amika cloud | No | Requires an Amika account + API key; coupled to hosted API |
| sandbox-image | Docker/Python | Yes | Rig VM images | Partial | Base images for rigs; provider-specific |
| amikalog / amikalyze / akfs | Go / mixed | Yes (labs) | session capture, guardrails, fs-as-data | Optional | Experimental |
| amika-control-plane (amika-mono) | ? | **No (closed)** | scheduler, session store, multiplayer, config, file repo | No (yet) | No open-source ETA read |
| amika-relay | ? | **No (closed)** | per-host e2e-encrypted relay (server side of tunnel) | Reimplementable | Protocol codec is open; can rebuild relay in a Worker |
| amika-gateway | ? | **No (closed, "soon")** | control/data-plane boundary; signs/decrypts, auth, routes | Watch item | Self-hosted gateway will be single-player (no multi-user IAM) |
| sandbox-provisioner | ? | **No (closed, "soon")** | gateway->provider adapter | Watch item | Not in tree today |

### 2.2 Repo health snapshot (read 2026-10-29)
| Metric | Value | Source |
| --- | --- | --- |
| Stars | 295 | gh api repos/gofixpoint/amika |
| Forks | 26 | same |
| Open issues | 45 | same |
| License | Apache-2.0 | LICENSE text + gh api |
| Age | created 2026-02-05 (~9 months) | gh api |
| Last push | 2026-10-28 | gh api |
| Commits (approx) | 1472 | gh api commits Link header |
| Contributors (approx) | 7 | gh api contributors Link header |
| Primary language | TypeScript (Go near-equal by bytes) | gh api languages |
| Newest stable component release | amika-hostd@v0.5.0 (2026-10-27) | gh api releases |
| Newest release overall | amika-hostd@v0.6.0-beta.1 (2026-10-28, prerelease) | gh api releases |
| Status | beta (README badge) | README |

## 3. What this changes for the spec

1. **Treat amika as a reference implementation and a parts bin, not as the self-hosted control plane.** Its control plane, gateway, relay, and UI are closed. There is no open-source control plane to adopt today. What is open and genuinely reusable is the *data-plane agent* (amikad), the *BYOC host daemon* (amika-hostd), and two Worker-compatible primitives (`@amika/service-auth`, `@amika/tunnel-protocol`). This matches the operator's constraint that the orchestration layer be "something other than Cloudflare": amika gives the data-plane halves; the operator supplies the Workers control plane and the orchestrator.

2. **The auth split is the highest-value thing to copy.** `@amika/service-auth` implements exactly "control plane on Workers signs credentials, data plane verifies locally with Web Crypto under per-purpose derived keys, and the two never need to call each other." That is the cleanest available blueprint for a Workers control plane reaching private data-plane services over a tunnel, and it is Apache-2.0. Lift the credentials + gateway modules wholesale.

3. **The tunnel codec is open and already Worker-targeted.** `@amika/tunnel-protocol` (amika.tunnel.v2) is documented to run in a Cloudflare Worker with no Node built-ins, and it defines the hostd<->relay frame contract, credit-based backpressure, and 426 subprotocol refusal. The operator can build his own relay in a Worker and run `amika-hostd` against it, or point `amika-hostd` at a Cloudflare Tunnel in `transport = "listen"` mode (which the README already documents, including `register-url`). Note the browser-preview cookie limitation of listen mode if browser-facing previews matter.

4. **amika-hostd is the ready-made "run my own rigs on my own metal" daemon**, but it needs KVM/Hypervisor.framework (smolvm microVMs), not just Docker. If the operator's data plane is container-based rather than microVM-based, hostd is a reference for the control loop and tunnel attachment rather than a drop-in. The `@amika/sandbox` provider layer is the extension point: add one provider folder to target the operator's own container orchestrator.

5. **Watch the amika-gateway open-sourcing.** If/when it lands it is the natural self-hosted control/data-plane boundary and the missing piece for a fully self-hosted amika. But the docs already flag that the self-hosted gateway is single-player with no multi-user IAM, which is a real limitation for a multi-operator control plane. No date is committed anywhere I read, so plan as if it may not arrive soon (timeline unverified).

6. **Maturity caution.** Beta, ~9 months old, 295 stars, ~7 contributors, ~1472 commits, and the tunnel protocol is on subprotocol v2 and churning (wire-format changes ship as new subprotocols). Good code, Apache-2.0, fast-moving, but not production-hardened. Repurpose the well-bounded primitives (service-auth, tunnel-protocol) and the daemon patterns; do not depend on the closed cloud, and pin a tunnel subprotocol version.

## 4. Not covered / open questions
- **amika-gateway source and its actual self-hosted API surface**: closed and not in the tree. Could not read it. The "single-player / no multi-user IAM" claim comes from docs/self-hosting.md and is a stated design intent for unreleased code; unverified against shipped code.
- **sandbox-provisioner**: closed / not in tree. How much of the gateway->provider translation is reusable once open is unknown.
- **amika-relay server implementation**: closed. I verified only the open client-side codec (tunnel-protocol) and hostd's side of the contract. Whether a Worker can fully replace the relay (e.g. long-lived WebSocket behavior, credit semantics under Workers' runtime limits) is not established by what I read.
- **Can amika-hostd's dial-out mode be pointed at a non-Amika gateway?** The registration and gateway-enrollment flow is Amika-specific (needs an Amika API key and host secret). The listen mode is transport-agnostic (any ngrok/Cloudflare Tunnel URL), but that path gives up browser previews. A custom dial-out relay built on tunnel-protocol is plausible but not demonstrated anywhere I read. Unverified.
- **Whether `@amika/sdk` can be retargeted**: the README ties it to an Amika account/API key, so assume not, without reading every client method.
- **ROADMAP amikactl**: listed in roadmap, absent from `go/cmd`. Whether it ships, is folded into amikad, or was dropped is unverified.
- **amikad network-proxy and secrets-vault maturity**: named as capabilities in ROADMAP; I confirmed the source area exists (`go/internal/amikad`, `norelay/`, `sshd/`) but did not read the proxy/vault implementations in depth.
- **Reception scale**: only one HN thread (item 49716282, 2026-09-15) and a few LinkedIn posts found via pkgforge. I did not quantify community adoption beyond the 295 stars / 26 forks / 45 open issues above.
