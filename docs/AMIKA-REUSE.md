# amika: what to lift, what to ignore

You asked specifically about `https://github.com/gofixpoint/amika`. The short answer
is that it is a parts bin and a reference implementation, not a control plane you can
adopt. Its control plane, gateway, relay and UI are all closed. What is open and
genuinely reusable is the data-plane half and two Worker-compatible primitives.

## 1. What it is

`gofixpoint/amika`, "Multiplayer cloud workstations for coding agents and humans". A
"Rig" is a VM workstation pre-loaded with git repositories plus one or more coding
agents, controlled remotely from chat apps, a web UI, an API, a CLI, SSH or editors
[B1 1.1].

Repository state, read by me on 2026-10-29 **[me]**:

| Metric | Value |
|---|---|
| Stars | 295 |
| Forks | 26 |
| Open issues | 45 |
| Licence | Apache-2.0 |
| Primary language | TypeScript, with Go near-equal by bytes |
| Created | 2026-02-05, about 9 months old |
| Last push | 2026-10-28 |
| Commits, approximate | 1472 |
| Contributors, approximate | 7 |
| Newest stable component release | `amika-hostd@v0.5.0`, 2026-10-27 |
| Status badge | beta |

The last eight commits, all on 2026-10-28, are almost entirely the tunnel and relay
layer: "Speak amika.tunnel.v2 to a per-host relay", "Namespace the tunnel keep-alive
strings", "Refuse one stream for an OPEN head that is malformed", "Keep one bad
stream from costing the whole tunnel" [B1 1.2]. That is the active development front,
which is convenient for you.

## 2. The component map, and what each one is worth to you

| Component | Language | Open today? | Role in amika | Worth lifting? |
|---|---|---|---|---|
| `amika` CLI | Go | Yes | client, direct mode or via the closed control plane | Partial. Direct mode talks straight to `amikad` |
| `amikad` daemon | Go | Yes | in-VM agent daemon, ACP messaging, filesystem, sshd, state, proxy, vault | Yes, as a data-plane agent pattern |
| `amika-hostd` | TypeScript, Hono | Yes | BYOC daemon, runs rigs as smolvm VMs, dials out or listens on a port | Yes, core data-plane runner reference |
| `@amika/sandbox` | TypeScript | Yes | pluggable sandbox-provider layer, Daytona, Freestyle, smol, E2B | Yes, the orchestrator adapter pattern |
| `@amika/service-auth` | TypeScript | Yes | sign and verify service tokens, browser-login passes, sessions | **Yes, highest value** |
| `@amika/tunnel-protocol` | TypeScript | Yes | `amika.tunnel.v2` wire codec, hostd to relay | **Yes, highest value** |
| `amikalog` | Go | Yes | capture agent sessions alongside git changes | Optional |
| `sandbox-image` | Docker, Python | Yes | Rig VM images | Partial |
| `@amika/sdk` | TypeScript | Yes | typed client for Amika cloud | **No.** Requires an Amika account and API key |
| `amika-control-plane` | unknown | **No** | scheduler, session store, multiplayer, config | No |
| `amika-relay` | unknown | **No** | per-host end-to-end-encrypted relay, server side of the tunnel | Reimplementable against the open spec |
| `amika-ui` | unknown | **No** | web UI | No |
| `amika-gateway` | unknown | **No, "soon"** | control and data-plane boundary | Watch item |
| `sandbox-provisioner` | unknown | **No, "soon"** | gateway to provider adapter | Watch item |

[B1 1.3, B1 2.1]

## 3. The two primitives worth lifting wholesale

### 3.1 `@amika/service-auth`

This is the single highest-value thing in the repository for your architecture, and it
is Apache-2.0.

Its own AGENTS.md, quoted: "The control plane signs credentials; a gateway verifies
them with the same host secret key, so neither calls the other." And: "Credentials use
only Web Crypto, so they run wherever the control plane does." Requests and responses
are Fetch API types. `node:crypto` and `node:net` are allowed, HTTP servers are not
[B1 1.5].

That is exactly the split you want. Your control plane on Cloudflare Workers signs
credentials. Your data-plane services verify them locally with Web Crypto under
per-purpose derived keys. Neither side has to call the other, which means no round
trip on the hot path and no shared session store.

Two entry points: `credentials`, which signs and verifies service tokens,
browser-login passes and sessions, and `gateway`, which makes a per-request decision
of `forward`, `refuse`, `login` or `not-mine` [B1 1.5].

Lift the `credentials` and `gateway` modules wholesale. It was deliberately kept
separate from `amika-hostd` "so the auth proxy can become its own package, or a
service in front of hosts" [B1 1.5], which is precisely how you would use it.

### 3.2 `@amika/tunnel-protocol`, `amika.tunnel.v2`

The frames `amika-hostd` and Amika's per-host relay exchange over the host's tunnel
WebSocket. Its design rules, quoted:

- "It runs in a Cloudflare Worker as well as Node. Use `Uint8Array`, `DataView` and
  `TextEncoder`. No `Buffer` and no `node:` import."
- Credit accounting for `DATA`, one per direction, for flow control and backpressure.
- Wire-format changes are a new subprotocol, and the gateway refuses the old one with
  `426`.

[B1 1.5]

So the wire contract is open and already Worker-targeted, while the relay server side
is closed. You can implement your own relay in a Worker against this spec.

The framing details worth copying rather than inventing: 9 frame types, a 5-byte
header, a 256 KiB initial window, a 64 KiB maximum data frame, and 256 concurrent
streams [B8 3.1].

**But see section 5.** Decision D2 in `docs/DECISIONS.md` is to use Workers VPC
Services instead of building a relay at all. Read this codec as a reference for
framing and backpressure, and as the fallback if Workers VPC is withdrawn. Do not
build it as the primary path.

### 3.3 The cost trick

amika registers its keep-alive with Cloudflare's `setWebSocketAutoResponse` so an
idle host costs nothing and the relay is not billed a message for it. A plain WebSocket
ping frame cannot be auto-answered by the runtime, but a text message pair can
[B8 3.3]. If you do build any long-lived WebSocket between a Worker and a box, this is
the difference between a free idle connection and a metered one.

## 4. The three-secret model, which is the hardest-won lesson in the repo

amika uses three distinct secrets, and they are not interchangeable [B1 1.5, B8 3.2]:

1. The user API key, for the human or the caller.
2. The inbound daemon secret key, for a request arriving at the host.
3. An outbound attachment credential, in the `x-amika-host-credential` header, never
   in a URL, because attaching a host is the opposite direction and a different
   permission from the other two.

Plus the invariants that go with them, all quoted or closely paraphrased from
`js/amika-hostd/AGENTS.md` [B1 1.5]:

- Every route requires a credential compared in constant time.
- The caller credential is never forwarded to the VM runtime.
- **hostd opens no streams.** The relay opens one per request, so a compromised host
  cannot become a forward proxy. This is the property to copy above all others.
- A dead tunnel is detected by a namespaced `PING` and `PONG` with a deadline.
- DATA moves only under granted credit.
- The host key never reaches a browser, and each credential type opens only its own
  routes.
- Secrets live in one store, keychain or file, never mixed, handed to the daemon over
  IPC so they never appear in the process environment, and config and secret files are
  written atomically at mode 0600.

Budget the renewal problem up front: a bearer string survives re-presentation on lease
renewal, a timestamp-bound assertion does not, so a keypair model requires a
gateway-side change first [B8 3.2].

## 5. `amika-hostd`, and why it is a reference rather than a drop-in

`amika-hostd` is a BYOC daemon you install on a machine you control. It registers that
machine with the Amika control plane as a "host", then runs each Rig on it as a local
VM via `smolvm serve` [B1 1.4].

Two transports [B1 1.4]:

- Default: dial out to Amika's gateway over a tunnel WebSocket, so the machine needs
  no open inbound port.
- `transport = "listen"`: bind `127.0.0.1:3020` and expose it yourself. The README
  names **ngrok or Cloudflare Tunnel** explicitly, links Cloudflare's own
  connect-networks documentation, and documents
  `amika-hostd register-url https://<your-tunnel-url>`. In this mode "dev" runs with
  only `AMIKA_HOSTD_SECRET_KEY` and no Amika services at all.

That listen mode is the pattern you asked about, already documented by somebody else,
including the Cloudflare Tunnel specifics. Its caveat: a listening daemon works for
rigs, service tokens and `rig ssh`, "but browsers cannot open the host's previews,
since a browser logs in to a preview with a cookie that needs the host's own https
origin" [B1 1.4].

Why it is not a drop-in for you:

- It requires Linux x86_64 or arm64, glibc 2.34 or later, **with KVM**, or macOS Apple
  silicon. It needs hardware virtualisation, not just Docker [B1 1.4]. If your data
  plane is container-based rather than microVM-based, hostd is a reference for the
  control loop and the tunnel attachment rather than a component.
- Its HTTP surface is a Smol-compatible `/api/v1/machines` plus a versioned rig API.
  You would be writing your own client against a shape designed for Amika's gateway.
- The `@amika/sandbox` provider layer is the extension point, and adding a provider is
  one folder. Adding one that targets your own container orchestrator is the intended
  use [B1 1.3].

## 6. Maturity, and what that means for how you use it

Beta. About 9 months old. 295 stars. About 7 contributors. Apache-2.0. Fast-moving,
and the tunnel protocol is on subprotocol v2 and churning, with wire-format changes
shipping as new subprotocols [B1 3.6].

So: repurpose the well-bounded primitives, which are `service-auth` and
`tunnel-protocol` and the daemon's security invariants. Do not depend on the closed
cloud. Pin a tunnel subprotocol version if you use the codec. Re-evaluate in six
months, because the interesting parts are moving.

## 7. Two documentation defects found while reading it

Recorded because they affect how much you should trust the rest of the docs [B1 1.6]:

- amika's own `docs/self-hosting.md`, inside the amika repository, states "The `amika` CLI no longer creates Rigs on your own
  machine. The `--local` mode, which ran each Rig as a Docker container on the host,
  has been removed." But `docs/architecture/overview.md` still documents
  `go/internal/sandbox/docker.go` and an `amika sandbox create|list|connect|delete`
  command set. The overview looks like the stale one.
- `ROADMAP.md` lists an `amikactl` CLI, but `go/cmd` ships only `amika`, `amikad` and
  `amikalog`. Whether it ships, was folded into `amikad`, or was dropped is unverified.

## 8. Open questions this file cannot close

- `amika-gateway` source and its actual self-hosted API surface. Closed, not in the
  tree. The "single-player, no multi-user IAM" claim comes from amika's `self-hosting.md` and
  is a stated design intent for unreleased code, unverified against shipped code
  [B1 4].
- `sandbox-provisioner`. Closed, not in the tree.
- Whether `amika-hostd`'s dial-out mode can be pointed at a non-Amika gateway. The
  registration and gateway-enrollment flow is Amika-specific and needs an Amika API
  key and host secret. The listen mode is transport-agnostic but gives up browser
  previews. A custom dial-out relay built on `tunnel-protocol` is plausible but is not
  demonstrated anywhere in the repo [B1 4].
- Whether a Worker can fully replace the relay, given long-lived WebSocket behaviour
  and credit semantics under Workers' runtime limits. Not established [B1 4].
- The maturity of `amikad`'s network-proxy and secrets-vault, which are named in the
  ROADMAP. The source area exists but was not read in depth [B1 4].
