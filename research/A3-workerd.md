# A3-workerd: the public workerd runtime, build/run, config surface, limits, security

Research subagent A3. All sources read 2026-10-29 (date read from the machine: `date -u` -> Thu Oct 29 11:22 UTC 2026).
Method: pkgforge tinyfish gateway for search/read, `gh api` for GitHub metadata and file contents. No fallback to
built-in web_search/web_fetch was required; every tinyfish and gh call succeeded on the first attempt.

## 0. Source of truth block (GitHub metadata, read 2026-10-29)

Command: `gh api repos/cloudflare/workerd --jq '{...}'`

- owner/repo: cloudflare/workerd
- description: "The JavaScript / Wasm runtime that powers Cloudflare Workers"
- stars: 9093
- forks: 810
- open issues: 827
- license: Apache-2.0 (Apache License 2.0)
- language: C++
- created_at: 2022-09-15
- pushed_at: 2026-10-29T11:10:53Z (active, same day)
- size: 75136 (KB, ~75 MB)
- default_branch: main
- latest release: v1.20261029.1, published 2026-10-29T00:53:29Z (releases are daily, date-versioned)
- pinned V8: 15.7.112.5 (from build/deps/v8.MODULE.bazel)

All of the above: [verified].

## 1. Findings

### F1. What workerd is [verified]
workerd (pronounced "worker-dee") is the open-source JavaScript/Wasm server runtime based on the same code that
powers Cloudflare Workers. It is a C++ server binary that embeds the V8 engine and runs "Workers" (event-driven
JS/Wasm handlers). Intended uses per README: (a) an application server to self-host Workers-designed apps,
(b) a local dev/test tool, (c) a programmable forward/reverse HTTP proxy.
Evidence: https://github.com/cloudflare/workerd README.md; repo language C++, above.

### F2. License is Apache-2.0 [verified]
LICENSE file is Apache License 2.0. The npm package.json also declares "license": "Apache-2.0". Free to self-host,
modify, and redistribute (subject to Apache 2.0 terms; NOTICE/attribution obligations apply).
Evidence: repo LICENSE (first lines are the Apache 2.0 header); npm/workerd/package.json license field.

### F3. Versioning is a date, and releases are daily [verified]
workerd's version number is a date equal to the maximum compatibility date it supports; major version is 1.
A release is cut automatically every time the date in src/workerd/io/release-version.txt changes, producing
binaries for linux-64, linux-arm64, darwin-64, darwin-arm64, windows-64, plus generated workers-types, published
to npm. Observed releases: v1.20261029.1 (2026-10-29), v1.20261028.1 (2026-10-28), etc.
Evidence: README "Always backwards compatible"; RELEASE.md (Versioning + Cutting Releases sections);
`gh api repos/cloudflare/workerd/releases`.

### F4. Build system is Bazel; Linux build is hermetic [verified]
Build: `bazel build //src/workerd/server:workerd`; add `--config=release` or `--config=thin-lto` for optimized
builds. Bazelisk auto-selects the right Bazel version (.bazelversion present). On Linux the build downloads its
own LLVM toolchain (clang/lld/libc++) and a Debian sysroot and uses no host compiler. macOS needs Xcode 26.6+.
Windows uses winget + tools/windows/install-deps.bat + tools/windows/bazel-env.bat. Output binary:
bazel-bin/src/workerd/server/workerd. Tested platforms: Linux and macOS (x86-64, arm64), Windows (x86-64);
"in theory any POSIX system supported by V8 and Windows."
Secondary (a blog, treat as unverified): a walkthrough reports a ~34 minute / 7685-action build on an M4 MacBook
Air (https://v0id-user.mataroa.blog/blog/exploring-cloudflares-workerd/, 2026-03-19). [unverified as a benchmark]
Evidence: README "Building workerd"; root file listing (.bazelversion, MODULE.bazel, BUILD.bazel, justfile).

### F5. Prebuilt binaries via npm (no build needed to run on own metal) [verified]
The primary distribution channel is npm. Package "workerd" exposes bin "workerd"; its postinstall (install.js)
pulls the matching platform package (@cloudflare/workerd-linux-64, -linux-arm64, -darwin-64, -darwin-arm64,
-windows-64). So `npx workerd serve config.capnp` runs a prebuilt binary. Prebuilt runtime requirements:
Linux glibc >= 2.35 (Ubuntu 22.04, Debian Bookworm), macOS >= 13.5, x86_64 with SSE4.2 + CLMUL, or arm64 with the
CRC extension. engines: node >= 16 (only to run the installer wrapper).
Evidence: README "Prebuilt binaries are distributed via npm"; npm/workerd/package.json; RELEASE.md.

### F6. Config format is Cap'n Proto text; a Wrangler-config path also exists [verified]
workerd is configured by a Cap'n Proto text-format file. The authoritative reference is the comment block in
src/workerd/server/workerd.capnp (57289 bytes). For simple projects `workerd serve wrangler.jsonc` also accepts a
Wrangler config; `main` is bundled with esbuild; supported fields are name, main, compatibility_date,
compatibility_flags, vars, durable_objects, migrations, no_bundle, $schema (any other field is an error).
Sample configs live in samples/. Run with `workerd serve my-config.capnp`; `workerd --help` for CLI usage.
Evidence: README "Configuring workerd"; src/workerd/server/workerd.capnp; samples/ dir.

### F7. Top-level config surface [verified]
`struct Config` fields: services (list of Service), sockets (list of Socket), v8Flags (raw V8 CLI flags,
"use at your own risk"), extensions (late-linked capabilities for all workers), autogates (feature gates),
logging (LoggingOptions: structuredLogging JSON, stdout/stderrPrefix), cluster (ClusterConfig; requires
`--experimental`). An implicit "internet" service (network allow=["public"], trustBrowserCas) backs global
fetch() unless a Worker overrides it via `globalOutbound`.
`struct Socket`: name, address, and a union of http / https{options,tlsOptions} / tcp{tlsOptions,tlsMode} /
udp{idleTimeoutMs=30000, maxPendingBytes=262144}; plus a service (ServiceDesignator) to handle the socket.
Address forms: "*:80", "1.2.3.4:80", "[ipv6]:80", "unix:/path/to/socket", "unix-abstract:name", or a hostname
(DNS-resolved). CLI overrides: `--socket-addr <name>=<addr>` and `--socket-fd <name>=<fd>`.
`struct Service` union: worker (Worker), network (Network), external (ExternalServer; forwards to a remote
backend on your internal network), disk (DiskDirectory; basic HTTP GET/PUT static file service).
`struct Worker` carries modules, compatibilityDate, compatibilityFlags, bindings (List(Binding)), globalOutbound
(default "internet"). `struct Binding` supports: wasm module, service, Durable Object class, Durable Object
namespace, memoryCache (MemoryCacheLimits), analyticsEngine (requires --experimental), hyperdrive, text/data/json,
fromEnvironment (reads a system env var), and more.
Evidence: src/workerd/server/workerd.capnp lines ~44-760.

### F8. Capability-based, SSRF-resistant network model [verified]
Workers get no privileged resources by default; you explicitly declare bindings. README states the design is
"immune to SSRF attacks." `struct Network` has allow (default ["public"]) and deny (List(Text)) of CIDR blocks
(IPv4/IPv6) plus special strings: "private" (RFC1918 etc, superset of "local"), "public" (opposite of private),
"local" (127.0.0.0/8 and unix), "network" (opposite of local), "unix", "unix-abstract". Traffic is allowed only
if it matches an allow entry and no deny entry. For DNS hostnames the rules filter resolved addresses; if none
are permitted, it behaves as if the DNS entry did not exist. By default global fetch() cannot reach internal
addresses; the recommended pattern is ExternalServer bindings for specific internal backends; allow=["public",
"private"] grants arbitrary internal access (explicitly discouraged for SSRF reasons).
Evidence: src/workerd/server/workerd.capnp (struct Network, Config comments); README "Capability bindings".

### F9. Fronting workerd with a Cloudflare Tunnel (run on own metal) [verified]
workerd is unopinionated about how it runs. To expose it through a tunnel: define a Socket bound to
127.0.0.1:<port> or a unix socket (unix:/run/workerd.sock), and point cloudflared at that address. workerd can
also terminate TLS itself (https socket with tlsOptions) or run as a raw tcp proxy. Production guidance in the
README is systemd socket activation: systemd opens the privileged sockets and passes fds via
`--socket-fd http=3 --socket-fd https=4`; the service runs as an unprivileged user with NoNewPrivileges=true.
There is a tcp-ingress sample and a wrangler sample in samples/ for reference.
Evidence: README "Serving in production" (systemd unit + socket, --socket-fd); workerd.capnp struct Socket;
samples/ listing (tcp, tcp-ingress, wrangler, static-files-from-disk).

### F10. Reaching your own-metal data plane from a Worker [verified]
Two mechanisms, both in config: (1) an `external` Service (ExternalServer) that forwards all requests to a
specific remote/internal server; (2) a `network` Service with allow=["public","private"] (or specific CIDRs)
for broader internal reach. The ExternalServer binding is the SSRF-safe, per-backend option. This maps directly
onto the spec's "control plane on Cloudflare, data plane on own metal via tunnel/VPC" split.
Evidence: workerd.capnp struct Service (external -> ExternalServer "connect to a back-end server on your
internal network") and struct Network.

### F11. workerd vs V8 isolates vs full Node [verified]
workerd is a C++ server embedding V8 isolates. Isolates prevent code from accessing memory outside the isolate
within the same process, and many isolates share one process. That is LOGICAL isolation, not a security boundary
(corroborated by both the README and a code-walkthrough blog: "V8 isolates ... provide logical isolation, not
security isolation"). workerd is NOT full Node.js: it implements web-standard (WinterCG) APIs plus a SUBSET of
Node.js APIs. Node compat is provided two ways: built-in native implementations (most full, a few partial) and
import-only polyfill stubs (module imports succeed but method calls throw). For compatibility dates 2026-08-04+,
nodejs_compat and nodejs_compat_v2 are on by default; for 2024-09-23..2026-08-03 add the nodejs_compat flag.
Native-support table (as read): Buffer, Crypto, Net, HTTP, HTTPS, Events, Errors, Assertion testing, Async
context tracking, Diagnostics Channel, File system, Globals = supported; Console, DNS, Module = partially
supported. Deprecated/experimental/non-serverless Node APIs are excluded (non-functional stubs).
Evidence: README WARNING; developers.cloudflare.com/workers/runtime-apis/ (last updated 2026-07-03);
developers.cloudflare.com/workers/runtime-apis/nodejs/ (last updated 2026-08-12); mataroa walkthrough blog
(corroboration, unverified as authority).

### F12. Pinned V8 is 15.7.112.5; workerd rebases V8 from Chrome beta [verified]
build/deps/v8.MODULE.bazel sets VERSION = "15.7.112.5" and pulls github.com/v8/v8 archive tag v8-15.7.112.5.
docs/v8-updates.md documents the process: pick the V8 version used by Chrome beta, sync, rebase workerd's
patches (patches/v8/*) onto it, regenerate format-patches. So workerd ships a specific, patched V8, not a
floating "latest." A separate tag "workerd-with-only-v8-13.0-roll" exists; its relationship to the 15.7 pin is
unclear (likely a one-off/downgrade experiment) - [unverified].
Evidence: build/deps/v8.MODULE.bazel (VERSION line); docs/v8-updates.md; `gh api .../tags`.

### F13. CRITICAL: workerd is NOT a hardened sandbox [verified]
README WARNING, verbatim intent: workerd tries to isolate each Worker to its configured resources, but on its
own it does not contain suitable defense-in-depth against implementation bugs; to run possibly-malicious code
you must run it inside an appropriate secure sandbox, such as a virtual machine. Cloudflare's hosted Workers
adds layers workerd does not ship: (a) cordons - multiple runtime instances per machine with trust-level
separation (Free tenants not co-scheduled with Enterprise); (b) process isolation for the devtools inspector;
(c) a "layer 2 sandbox" using Linux namespaces + seccomp configured after process start but before isolates
load, blocking ALL filesystem syscalls and ALL network access except UNIX-domain sockets to local
supervisor/inbound-proxy/outbound-proxy processes; TLS keys never enter the sandbox. Net: a bare workerd process
gives you V8-isolate logical isolation only.
Evidence: README WARNING section; developers.cloudflare.com/workers/reference/security-model/ (last updated
2026-10-18); mataroa blog (corroboration).

### F14. You own the V8 "patch gap" when self-hosting [verified]
Cloudflare states its hosted Workers patch gap is under 24 hours (automated rebuild + one-click sign-off on each
V8 security release). Self-hosting workerd means you are responsible for tracking V8 security releases and
rebuilding/redeploying workerd (or pulling the date-stamped npm prebuilts, which track releases).
Evidence: developers.cloudflare.com/workers/reference/security-model/ ("V8 bugs and the patch gap").

### F15. workerd is more network-permissive than hosted Workers [verified]
Hosted Workers: HTTP-only in/out; outbound goes through a proxy that blocks internal addresses and stamps a
Worker-identifying header; no raw sockets. workerd: config can expose raw tcp and udp sockets, disk services,
and arbitrary internal network reach (allow=["public","private"]). The enforcement point moves to you.
Evidence: security-model page (network/API design) vs workerd.capnp (Socket tcp/udp, Service disk/network).

### F16. "experimental_configureRuntime" is NOT a workerd feature [verified as absent]
No occurrence of "configureRuntime" or "experimental_configureRuntime" exists in cloudflare/workerd: it is absent
from src/workerd/server/workerd.capnp and `gh search code --repo cloudflare/workerd configureRuntime` returns
empty; it is not mentioned in the workerd walkthrough blog either. The real runtime-configuration surface is:
the `--experimental` CLI flag (gates cluster mode, container bindings, analyticsEngine, hyperdrive binding, and
DO localDisk storage), the config `v8Flags` list, `compatibilityDate`/`compatibilityFlags`, and the top-level
`extensions`/`autogates`. If "experimental_configureRuntime" was seen elsewhere it is not part of this repo;
treat it as a mis-remembered term.
Evidence: workerd.capnp (no such symbol); `gh search code --repo cloudflare/workerd configureRuntime` -> [];
capnp comments naming `--experimental` for cluster (line ~99), analyticsEngine (line ~552), DO localDisk
(line ~870).

### F17. Experimental cluster mode for horizontal Durable Objects [verified]
`struct ClusterConfig` (requires `--experimental`): workerd instances cluster to distribute Durable Objects,
one owner per object; shared state lives in an S3-compatible bucket (`s3://bucket/prefix` with aws_* options
or an aws_credentials_file that rotates without restart); ownership via lease records + conditional writes +
ownership epoch. A `key` of >= 32 random bytes MACs inter-instance traffic (anti-replay; clocks within 30s) and
keys channel tokens. IMPORTANT: inter-instance traffic is NOT encrypted - the docs say run the cluster on a
private network (VPC, WireGuard, Tailscale). A public address is refused unless `unsafePublicAddress` is set.
All instances must have identical config. Cluster mode refuses a `localDisk` dir that already holds pre-cluster
DOs.
Evidence: workerd.capnp struct ClusterConfig (lines ~93-175).

### F18. Experimental container binding (Durable Object -> Docker) [verified]
A Durable Object namespace can have attached containers (`container @5 : ContainerOptions`): workerd talks to a
configured container engine to start a container per Durable Object, from a default image, a runtime-selected
image, or a full container snapshot; the DO reaches it via the `ctx.container` API. ContainerOptions carries a
default image and `privileges` (ContainerPrivileges = "extra Docker HostConfig privileges applied when creating
the container"). The repo also contains src/workerd/server/docker-api.capnp and a large container-client.c++
(~126 KB). This is the workerd-side hook for running containers on your own metal (overlaps topic A2).
Evidence: workerd.capnp lines ~795-810 (container binding + ContainerOptions); server dir listing
(docker-api.capnp 15525 B, container-client.c++ 126230 B).

### F19. Durable Object storage options are experimental [verified]
DO `state.storage` can be `inMemory` (process-lifetime, for local testing) or `localDisk` (a DiskDirectory
service; one subdir per class keyed by uniqueKey, files per object). `localDisk` is marked
"** EXPERIMENTAL; SUBJECT TO BACKWACKS-INCOMPATIBLE CHANGE **". KV-style `memoryCache` bindings have
MemoryCacheLimits. Evidence: workerd.capnp lines ~860-875 and struct MemoryCacheLimits (~705).

### F20. Known security advisories (GitHub advisory DB) [verified]
- CVE-2023-2512 / GHSA-8vx6-69vg-c46f: "Buffer under-read in workerd", severity Medium, CVSS 3.1 score 6.5
  (AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:H), npm package workerd, vulnerable < 1.20230419.0, patched 1.20230419.0,
  published 2023-05-12.
- GHSA-g76q-p3jj-mm56: "WebSocket message can cause crash", severity Medium, published 2023-11-21. Its CVE id
  and affected range did not resolve through the global advisory endpoint (HTTP 404) - [unverified for CVE id /
  version range]; severity and summary are from the repo advisory list.
Both are availability/DoS-class, not remote-code-execution. Neither is recent; both predate the current build.
Evidence: `gh api /repos/cloudflare/workerd/security-advisories`; `gh api /advisories/GHSA-8vx6-69vg-c46f`.

### F21. Runtime imposes no CPU/memory/request limits itself [verified]
There are no CPU-time, memory, subrequest-count, or duration limit knobs in workerd.capnp (a grep for
limit/cpu/memory/maxRequest/maxSubrequest finds only MemoryCacheLimits). The Workers CPU-ms / subrequest /
duration limits are enforced by Cloudflare's hosted platform, not by the workerd binary. Self-hosted, you must
impose your own limits (cgroups, ulimits, per-worker budgets) if you need them.
Evidence: workerd.capnp (no such limit fields); contrast with Cloudflare Workers platform limits (topic A4/A6).

### F22. Local dev via Wrangler/Miniflare [verified]
Wrangler v3.0+ drives workerd for local dev: set MINIFLARE_WORKERD_PATH to your built workerd binary, then
`wrangler dev`. Evidence: README "Local Worker development with wrangler".

## 2. What this changes for the spec

1. workerd is a sound, Apache-2.0, actively-maintained (daily date releases) choice for "some machines run
   Cloudflare's own workerd behind a tunnel." It runs Workers-designed code unchanged and is free to self-host.
   Prebuilt npm binaries mean you do not need a Bazel build to deploy it.

2. Tunnel fronting is straightforward and config-native. Bind a Socket to 127.0.0.1:<port> or a unix socket and
   point cloudflared at it; for production use systemd socket activation with `--socket-fd` and run workerd as an
   unprivileged user (User=nobody, NoNewPrivileges=true). Terminate TLS at the tunnel edge or at a workerd https
   socket. This is the cleanest expression of "data plane on own metal, exposed via Cloudflare Tunnel."

3. The single most important caveat: workerd is NOT a security sandbox. Isolates give logical, not security,
   isolation. If any Worker runs untrusted or multi-tenant code, you must add your own isolation layer (a VM per
   tenant, or at minimum a namespace + seccomp layer-2 sandbox). Do not treat the isolate boundary as a security
   boundary in the threat model. This directly constrains any "run user code" feature in the spec.

4. You own the V8 patch gap. Budget operational effort (or automation) to track V8 security releases and roll new
   workerd builds; the date-stamped npm prebuilts are the low-effort path since they track upstream releases.

5. Resource governance is yours. workerd will not cap CPU/memory/requests; if the spec needs per-worker limits,
   enforce them outside workerd (cgroups, ulimits, an outer supervisor). Do not assume hosted-Workers limits
   carry over.

6. Keep the SSRF posture tight: leave the default Network allow=["public"], and reach your own-metal backends via
   explicit ExternalServer bindings rather than opening allow=["public","private"] globally. This keeps the
   control-plane/data-plane split clean and avoids a Worker being able to scan the private network.

7. Portability: apps must stay within the supported Node subset plus web standards. Validate dependency trees
   against the Node-compat table and the pinned V8 (15.7.112.5); packages needing unsupported Node APIs import
   fine but throw at call time, which is a runtime-failure class to test for.

8. Cluster mode (experimental, `--experimental`) is the on-ramp to horizontally scaling Durable Objects across
   your machines, but it needs an S3-compatible bucket, identical config across instances, and a private network
   because inter-instance traffic is unencrypted (put it behind the tunnel/VPC). Treat as experimental and
   subject to change; do not build the core control plane on it yet.

9. The experimental container binding lets a Durable Object start a Docker container on your metal via
   ctx.container (overlaps A2). Powerful but experimental and privilege-bearing; constrain ContainerPrivileges.

10. Node the term: if the operator's notes reference "experimental_configureRuntime," that is not a workerd
    feature (F16). The gating mechanism is the `--experimental` flag plus compatibility flags; correct the spec's
    vocabulary accordingly.

## 3. Not covered / open questions

- GHSA-g76q-p3jj-mm56: CVE id and affected/fixed version ranges not resolved (global advisory endpoint returned
  404). Only severity (Medium), summary, and publish date (2023-11-21) are verified.
- No performance/throughput/latency numbers were measured on own metal. This environment is headless and I did
  not build or run workerd; the "~34 min build" figure is a single blog report and is [unverified].
- The current npm-published workerd version was not fetched from the npm registry. The checked-in template
  npm/workerd/package.json pins 1.20220926.0; actual published versions follow the date scheme (latest GitHub
  release v1.20261029.1). Treat the exact live npm version as [unverified].
- Full ContainerOptions / ContainerPrivileges schema (image selection, snapshot format, exact privilege fields)
  was seen only partially; the complete experimental container contract was not read in full.
- The "workerd-with-only-v8-13.0-roll" tag vs the 15.7.112.5 pin: relationship and intent unverified.
- How cloudflared authenticates and egress-restricts to a workerd unix socket, service tokens, and WARP-to-Tunnel
  are topics A1/A5; not investigated here.
- Workers CPU/subrequest/duration limit values and their pricing are topics A4/A6; only the architectural fact
  that workerd does not enforce them (F21) is asserted here.
- Whether "experimental_configureRuntime" refers to something outside workerd (a Node.js or Wrangler concept)
  could not be determined from this repo; flagged for the operator to clarify the source of that term.
