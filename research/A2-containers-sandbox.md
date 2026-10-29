# A2 - Containers and Sandbox

Research subagent A2-containers-sandbox. All sources read on 2026-10-29 (UTC). Every figure below came from a call made during this session. Where I could not verify a number I wrote "unverified".

Method: pkgforge gateway (search + read, provider=tinyfish) for developers.cloudflare.com and blog.cloudflare.com; `gh api` for GitHub metadata. I did not need the built-in web_search/web_fetch fallback on any call.

---

## 1. Findings

### 1.1 GA state and plan requirement

**F1. Cloudflare Containers and Cloudflare Sandboxes are generally available as of 2026-04-13.** Both products exited beta. Containers require the Workers Paid plan; Sandboxes require the Workers Paid plan. Browser Run (the former Browser Rendering) is available on Free and Paid plans.

Evidence:
- https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/ - "Cloudflare Containers and Sandboxes are now generally available." Read 2026-10-29. [verified]
- https://developers.cloudflare.com/containers/ - "Available on Workers Paid plan". Read 2026-10-29. [verified]
- https://developers.cloudflare.com/sandbox/ - "Available on Workers Paid plan". Read 2026-10-29. [verified]
- https://developers.cloudflare.com/browser-run/ - "Available on Free and Paid plans". Read 2026-10-29. [verified]

**F2. The `durable_object` scheduling policy is still in public beta** even though the product is GA. The `default` policy is the GA path. The docs mark `durable_object` "(beta)" in the policy comparison table.

Evidence:
- https://developers.cloudflare.com/containers/configuration/scheduling-policy/ - table row reads "`durable_object` (beta)". Last updated Sep 30, 2026. Read 2026-10-29. [verified]
- https://developers.cloudflare.com/containers/platform/limits/ (fetched final URL for /containers/platform-details/limits/) - "A sandbox container uses the Durable Object scheduling policy, which is in public beta" is stated on https://developers.cloudflare.com/sandbox/ . Read 2026-10-29. [verified]

### 1.2 Architecture: what a container actually is

**F3. Every Cloudflare Container is a Firecracker microVM with its own kernel and network, controlled by a Durable Object.** The Durable Object is the only way in. There is no public hostname, no public port, and no inbound TCP or UDP from end users.

Evidence:
- https://developers.cloudflare.com/containers/concepts/architecture/ - "Each container instance runs in a Firecracker microVM with its own kernel and network. No other workload on the Cloudflare network shares that kernel. Your image runs as a Linux container inside the VM." Also: "A Container can only be accessed through its Durable Object." And: "Because all Container requests are passed through a Worker, end-users cannot make non-HTTP TCP or UDP requests to a Container instance." Last updated Sep 30, 2026. Read 2026-10-29. [verified]
- https://developers.cloudflare.com/sandbox/ - "Each instance is a microVM with its own kernel and network, so no other workload shares it." Read 2026-10-29. [verified]
- Request path: Client -> Worker -> Durable Object -> `ctx.container` -> container. Images must be built for `linux/amd64`. [verified, same page]

**F4. Containers run only on Cloudflare's multi-tenant infrastructure. There is no bring-your-own-compute option.** The docs are explicit that customers cannot select the underlying host.

Evidence:
- https://blog.cloudflare.com/containers-cross-tenant-vulnerability/ - "Cloudflare Containers run workloads on multi-tenant infrastructure and automatically assign them to eligible servers; customers cannot select the underlying host." Read 2026-10-29. [verified]
- https://developers.cloudflare.com/containers/llms.txt (docs index, 615 words) lists every page in the Containers collection. No page describes self-hosting, remote nodes, BYOC, or attaching a container binding to hardware outside Cloudflare. Read 2026-10-29. [verified]

This is the single most important negative finding for the spec: the DO container binding cannot be pointed at a container on the operator's own metal. See section 2.

### 1.3 Instance types and account limits

**F5. Six predefined instance types, plus custom types.** Read from https://developers.cloudflare.com/containers/platform/limits/ (page title "Limits and Instance Types", last updated Oct 21, 2026, read 2026-10-29). [verified]

| Instance Type | vCPU | Memory | Disk |
| --- | --- | --- | --- |
| lite | 1/16 | 256 MiB | 2 GB |
| basic | 1/4 | 1 GiB | 4 GB |
| standard-1 | 1/2 | 4 GiB | 8 GB |
| standard-2 | 1 | 6 GiB | 12 GB |
| standard-3 | 2 | 8 GiB | 16 GB |
| standard-4 | 4 | 12 GiB | 20 GB |

Custom instance type constraints (same page): minimum 1 vCPU, maximum 4 vCPU, maximum 12 GiB memory, maximum 20 GB disk, minimum 3 GiB memory per vCPU. Workloads needing less than 1 vCPU must use a predefined type.

**F6. Per-account concurrency limits.** Same page. [verified]

| Resource | Limit |
| --- | --- |
| Concurrent memory | 6 TiB |
| Concurrent vCPU | 1,500 |
| Concurrent disk | 30 TB |
| Image size | Same as instance disk space |
| Total image storage per account | 50 GB |

**F7. Snapshot limits.** Same page: maximum snapshot size 20 GB; retention 30 days from creation or most recent restore; restoring refreshes the TTL. [verified]

**F8. Runtime `instance` values are a subset of the Wrangler `instance_type` values.** The `durable_object` policy accepts `lite`, `standard-1` through `standard-4`, and a custom object. It does not accept `basic` or the legacy `dev` and `standard` aliases. Omitted `instance` defaults to `lite`.

Evidence: https://developers.cloudflare.com/containers/configuration/scheduling-policy/ - "The runtime does not accept `basic` or the legacy `dev` and `standard` aliases." Last updated Sep 30, 2026. Read 2026-10-29. [verified]

**F9. The two policies use different casing for custom instance fields.** Runtime `ctx.container.start()` uses camelCase (`vcpu`, `memoryMib`, `diskMb`). Wrangler `instance_type` uses snake_case (`vcpu`, `memory_mib`, `disk_mb`) and only applies to the `default` policy.

Evidence: same scheduling-policy page. [verified]

### 1.4 Pricing

**F10. Containers billing model and rates.** Read from https://developers.cloudflare.com/containers/platform/pricing/ (page title "Pricing", last updated Oct 5, 2026, read 2026-10-29). [verified]

Billed for every 10 ms a container is actively running. Included usage ships with the $5 USD/month Workers Paid plan.

| Resource | Included per month (Workers Paid) | Overage rate |
| --- | --- | --- |
| Memory | 25 GiB-hours | $0.0000025 per additional GiB-second |
| CPU | 375 vCPU-minutes | $0.000020 per additional vCPU-second |
| Disk | 200 GB-hours | $0.00000007 per additional GB-second |

Key detail: **memory and disk are billed on provisioned resources for the selected instance type; CPU is billed on active usage only.** Charges start when a request is sent to the container or when it is manually started, and stop after the instance goes to sleep.

**F11. Container egress pricing.** Same page. [verified]

| Region | Price per GB | Included allotment per month |
| --- | --- | --- |
| North America and Europe | $0.025 | 1 TB |
| Oceania, Korea, Taiwan | $0.05 | 500 GB |
| Everywhere else | $0.04 | 500 GB |

**F12. Containers also incur Workers, Durable Object, and Workers Logs charges.** "incoming requests to your containers are handled by your Worker, and each container has its own Durable Object. You are billed for your usage of both Workers and Durable Objects." Same pricing page. [verified] Workers/DO unit prices are out of scope for A2 (A4 and A6 cover them).

**F13. Sandbox SDK pricing is not separate.** "Sandbox SDK pricing is determined by the underlying Containers platform it's built on."

Evidence: https://developers.cloudflare.com/sandbox/sdk/platform/pricing/ (last updated Sep 30, 2026, read 2026-10-29). [verified]

**F14. Browser Run pricing.** Read from https://developers.cloudflare.com/browser-run/pricing/ (last updated Apr 21, 2026, read 2026-10-29). [verified]

| | Workers Free | Workers Paid |
| --- | --- | --- |
| Browser hours | 10 minutes per day | 10 hours per month, then $0.09 per additional hour |
| Concurrent browsers (Browser Sessions only) | 3 browsers | 10 browsers averaged monthly, then $2.00 per additional browser |

Billing quirk: Cloudflare totals browser seconds per day, sums daily totals over the cycle, then rounds the monthly total to the nearest whole hour. 1,800 seconds or more in a month rounds up. Concurrency is the monthly average of daily peak concurrent browsers. Failed Quick Actions calls that time out with `waitForTimeout` are not charged. [verified, same page]

### 1.5 Startup performance

**F15. The `durable_object` policy cut container startup by roughly 6x.** ComputeSDK's independent Burst TTI Benchmark launches 100 sandboxes concurrently and measures time-to-interactive from the client:

| Startup measurement | Previous scheduling path | New policy | Improvement |
| --- | --- | --- | --- |
| Median | 4.049 seconds | 648 milliseconds | 6.2x faster |
| 95th percentile | 5.839 seconds | 910 milliseconds | 6.4x faster |
| 99th percentile | 6.717 seconds | 1129 milliseconds | 5.9x faster |

Evidence: https://blog.cloudflare.com/faster-agent-sandboxes (read 2026-10-29). [verified]

**F16. A single account started 100,000 Containers in 5.387 seconds across six locations** in Cloudflare's own preliminary burst test.

Evidence: same blog post. Cloudflare labels this "preliminary". [verified as a quoted claim; I did not reproduce it]

**F17. Generic cold starts are slower than the headline number.** The lifecycle docs state cold starts "can often be in the 1-3 second range", dependent on image size and entrypoint work. The 648 ms median is a benchmark of the new scheduling path on a prepared image, not a general cold-start guarantee.

Evidence: https://developers.cloudflare.com/containers/concepts/architecture/ - "Container cold starts can often be in the 1-3 second range, but this is dependent on image size and code execution time, among other factors." Read 2026-10-29. [verified]

**F18. A Cloudflare-managed base image exists and is pre-distributed.** `cloudflare/debian-trixie` contains Debian Trixie Slim and Node.js 24.20.0 LTS. It can be started without a Dockerfile or a push, and Cloudflare prepares it on eligible hosts before requests arrive.

Evidence: https://developers.cloudflare.com/containers/configuration/scheduling-policy/ and https://blog.cloudflare.com/faster-agent-sandboxes. [verified]

### 1.6 How a container is reached

**F19. `getTcpPort(port)` is the only ingress primitive.** It returns a `Fetcher` with two modes: `.fetch()` for HTTP requests to the container, and `.connect()` for a raw TCP connection. There is no UDP.

Evidence: https://developers.cloudflare.com/containers/api/durable-object-container/ - `getTcpPort` section, read 2026-10-29. Example shows `container.getTcpPort(8080).fetch(...)` and `container.getTcpPort(8080).connect("10.0.0.1:8080")`. [verified]

**F20. HTTP from the Internet reaches a sandbox only through the Worker.** "HTTP from the Internet reaches the instance only through your Worker."

Evidence: https://developers.cloudflare.com/sandbox/ - Containers section. Read 2026-10-29. [verified]

**F21. Preview hostnames require a Cloudflare-managed DNS zone and a proxied wildcard record.** The pattern is: an `AAAA` record named `*` with content `100::` set to Proxied, plus a Worker route `*.example-previews.com/*`. Cloudflare never contacts the address in the record. The Worker reads the leftmost label as the DO name.

Evidence: https://developers.cloudflare.com/sandbox/previews/serve-previews-on-their-own-hostnames/ (last updated Oct 12, 2026, read 2026-10-29). [verified]

**F22. Preview hostnames are a security boundary that must not be shared with the app.** Code in a preview runs in the visitor's browser under the preview hostname, so it is a separate origin from the app. Serving previews under a subdomain of the app's own domain shares cookies: "Code in one preview can set a cookie with `Domain=example-previews.com`, and every other preview then receives that cookie." The docs also warn: a container's own hostname is 64 characters, one more than a DNS label allows, and is absent from `/etc/hosts`.

Evidence: same preview-hostnames page and https://developers.cloudflare.com/containers/guides/local-dev/. [verified]

**F23. SSH is not a public port.** "SSH does not expose a publicly accessible port on the Container. The only way to connect is through Wrangler with `wrangler containers ssh`, which authenticates against your Cloudflare account." Only `ssh-ed25519` keys are supported. The instance must already be running; SSH will not start a stopped container and an SSH session alone will not keep it alive.

Evidence: https://developers.cloudflare.com/containers/guides/ssh/ (last updated Aug 28, 2026, read 2026-10-29). [verified]

**F24. Egress interception is capped at 128 entries per container.** `interceptOutboundHttp()`, `interceptOutboundHttps()`, and `interceptAllOutboundHttp()` share the budget. A hostname or hostname glob (including `*`) uses two entries, one IPv4 and one IPv6. An IP, IP:port, or CIDR uses one. `interceptAllOutboundHttp()` uses two. So a container holds at most 64 hostname targets or 128 IP/CIDR targets. Intercepts cannot be removed while the container runs.

Evidence: https://developers.cloudflare.com/containers/api/durable-object-container/ - "Intercept limit" section. [verified]

### 1.7 Sleep, wake, and persistence

**F25. The inactivity timeout can be up to 6 hours, and it is the only thing that keeps an instance alive between requests.** An instance runs while its Durable Object is active (handling a request, running an alarm, streaming a response, or holding an accepted WebSocket). After the DO goes inactive, the instance keeps running for `setInactivityTimeout()` duration, up to 6 hours. Without a timeout, Cloudflare stops the instance shortly after the DO becomes inactive.

Evidence: https://developers.cloudflare.com/sandbox/concepts/lifetime/ (last updated Oct 22, 2026, read 2026-10-29). [verified]

**F26. Code running inside the container does not count as activity.** "If no requests arrive, the instance stops when the inactivity timeout ends, even while a build, a test suite, or an agent task still runs inside it." The documented mitigation is a DO alarm that runs more often than the timeout and checks the work.

Evidence: same lifetime page. [verified]

**F27. The inactivity timeout does not survive a Durable Object restart.** A restarted DO starts with no timeout, so the instance stops shortly after it goes inactive. The sandbox examples set the timeout after `start()` and again in the DO constructor when the instance is already running.

Evidence: same lifetime page. [verified]

**F28. All container disk is ephemeral by default.** When an instance goes to sleep and restarts, it gets a fresh disk from the image.

Evidence: https://developers.cloudflare.com/containers/concepts/architecture/ - "All disk is ephemeral by default. When a Container instance goes to sleep, the next time it starts, it uses a fresh disk from the container image." [verified]

**F29. `snapshotContainer()` captures the writable root filesystem only.** It does not capture memory, running processes, or separately mounted filesystems. A container started from a snapshot runs its entrypoint again; running processes do not continue. The returned handle is an opaque object `{id, size, name?}` and the snapshot data is not returned to the Worker. Snapshots are immutable and carry an implicit 30-day TTL refreshed by each restore. You cannot set a custom TTL. Snapshots are only supported with the `durable_object` policy.

Evidence: https://developers.cloudflare.com/containers/guides/snapshots/ and https://developers.cloudflare.com/containers/api/durable-object-container/ - `snapshotContainer` section. Both read 2026-10-29. [verified]

**F30. Durable Object storage outlives every container instance.** DO storage (SQLite) persists across container restarts, sleeps, and image changes. Use it for session state, snapshot IDs, and outbound policy.

Evidence: https://developers.cloudflare.com/containers/api/durable-object-container/ - "Your Durable Object also has access to SQLite storage through `this.ctx.storage`". [verified]

**F31. FUSE-mounted R2 is an option but is explicitly not fast.** "You can also use FUSE to persist disk to R2 or other object storage backends. Though you should not expect native SSD-like performance while using FUSE."

Evidence: https://developers.cloudflare.com/containers/concepts/architecture/. [verified]

**F32. Shutdown sequence is SIGTERM, then up to 15 minutes, then SIGKILL.** `destroy()` stops the instance at once with no cleanup window. The docs warn: "Do not rely on a `SIGTERM` handler to finish work."

Evidence: same architecture page and the sandbox lifetime page. [verified]

**F33. Deploys do not replace running containers under the `durable_object` policy.** A running instance keeps the image, entrypoint, and env it started with. `start()` throws while an instance runs. New code reaches a busy sandbox late. A deploy is not a way to cancel work.

Evidence: https://developers.cloudflare.com/sandbox/concepts/lifetime/ - "Deploys keep instances running". [verified]

**F34. Cloudflare does not wake the Durable Object when its instance stops.** A pending `monitor()` call reports a stop only while the DO is in memory, and it keeps the DO in memory for up to 15 minutes from when the call starts.

Evidence: same lifetime page. [verified]

### 1.8 Scheduling policies and rollouts

**F35. The scheduling policy is immutable, and deleting an application deletes its instances.** Switching policies means replacing every running instance.

Evidence: https://developers.cloudflare.com/containers/configuration/scheduling-policy/ - "The scheduling policy is immutable." Read 2026-10-29. [verified]

**F36. The `durable_object` policy does not support `max_instances`.** Running instances count toward account limits only. The `default` policy supports `max_instances` and errors a request that would exceed it.

Evidence: same scheduling-policy page, and https://developers.cloudflare.com/workers/wrangler/configuration/ - "If a request to start a container will exceed this limit, that request will error." [verified]

**F37. Rollouts are application code under the `durable_object` policy.** There is no rollout configuration. The documented patterns are canary by hashing the DO ID, pinning active projects to their current image, migrating at a checkpoint, and rollback by changing which image future starts choose.

Evidence: https://blog.cloudflare.com/faster-agent-sandboxes - "Rollouts are now just code". [verified]

**F38. Up to 100 named images per configuration; each name is 1 to 128 characters.** The image map is uploaded with the Worker version, and updating the map does not restart running instances. During a gradual deployment, `ctx.container.images` reflects the image map of the Worker version running that DO.

Evidence: https://developers.cloudflare.com/containers/configuration/scheduling-policy/. [verified]

**F39. Registry support differs by policy, and the two Cloudflare doc pages read differently.** This is a genuine discrepancy between primary sources, not a reading error.

- The Wrangler configuration reference says `containers[].image` supports "the Cloudflare Registry, Docker Hub, Amazon ECR, and Google Artifact Registry" (https://developers.cloudflare.com/workers/wrangler/configuration/, read 2026-10-29). [verified]
- The scheduling-policy page says, for `images.<name>.image` under the `durable_object` policy: "Use the form `registry.cloudflare.com/<ACCOUNT_ID>/<REPOSITORY>@sha256:<DIGEST>`. Direct references to Docker Hub, Amazon ECR, or Google Artifact Registry are not supported. To use an image from another registry, push it to the Cloudflare managed registry first." (https://developers.cloudflare.com/containers/configuration/scheduling-policy/, read 2026-10-29). [verified]
- The Containers changelog records Google Artifact Registry support landing 2026-07-01 via `wrangler containers registries configure`, and states "you can use a fully qualified Google Artifact Registry image reference in your Wrangler configuration instead of first pushing the image to Cloudflare Registry. Only `*-docker.pkg.dev` hosts are supported." (https://developers.cloudflare.com/changelog/product/containers/, read 2026-10-29). [verified]

The consistent reading: external registries are usable under the `default` policy and via configured registry credentials; the `durable_object` policy's `images.<name>.image` field wants a Cloudflare Registry digest pin. The pages do not state this reconciliation explicitly, so I flag it as a documentation ambiguity rather than a resolved fact.

### 1.9 Sandbox SDK

**F40. Repository metadata.** `cloudflare/sandbox-sdk`, retrieved with `gh api repos/cloudflare/sandbox-sdk` on 2026-10-29.

- Stars: 1156
- Forks: 121
- License: GitHub reports SPDX id `NOASSERTION`; the `LICENSE` file in the repository is the Apache License 2.0 (I read the file with `gh api repos/cloudflare/sandbox-sdk/contents/LICENSE`). Treat the license as Apache-2.0 with the SPDX field as a detection artifact. [verified]
- Language: TypeScript
- Last push: 2026-10-29T10:33:06Z
- Open issues: 4
- Size: 77740 KB
- Homepage: https://sandbox.cloudflare.com/
- Topics: agent, agents, ai, code-interpreter, containers, devtools, sandbox
- Created: 2025-06-22

**F41. The SDK ships two release lines in parallel.** `@cloudflare/sandbox@1.0.3` published 2026-10-22 and `@cloudflare/sandbox@0.12.14` published 2026-10-22. Recent releases from `gh api repos/cloudflare/sandbox-sdk/releases`: 1.0.3 (2026-10-22), 0.12.14 (2026-10-22), 0.12.13 (2026-10-21), 1.0.2 (2026-10-20), 0.12.12 (2026-10-20), 0.12.11 (2026-10-19). [verified]

**F42. A sandbox is a Durable Object plus the Container it starts.** The 1.0 model: you write the Durable Object class and call the container directly through `this.ctx.container`. The package keeps only small helpers.

Evidence: https://github.com/cloudflare/sandbox-sdk README (read via `gh api ... /contents/README.md` on 2026-10-29) - "A sandbox is a Durable Object and the Container it starts. The Durable Object starts the instance and runs commands with the Container API on `this.ctx.container`. `@cloudflare/sandbox` adds three things that API does not have". [verified]

**F43. The three things the package adds over raw Containers.**

- `Files` - streams files in and out of the running instance and reports Linux errors such as `ENOENT`.
- `S3Mount` - mounts an S3-compatible bucket at a path. The Worker signs each storage request, so the credentials never enter the sandbox.
- `DirectoryBackup` - saves a directory to R2 and restores it into any Container, including one on a newer image.

Evidence: sandbox-sdk README. [verified]

**F44. The Sandbox SDK needs a `sandbox-shim` helper binary inside the image.** The Dockerfile at `images/sandbox-tools/Dockerfile` builds a static Rust binary (`cargo rustc --release --bin sandbox-shim -- -C target-feature=+crt-static`) and the `verify` stage asserts ELF64, little-endian, x86-64, no INTERP segment and no NEEDED entries. The final stage is `FROM scratch` and is described as "a donor stage for user-owned runtime images, not a runnable container". The Worker needs `nodejs_compat`.

Evidence: `gh api repos/cloudflare/sandbox-sdk/contents/images/sandbox-tools/Dockerfile`, read 2026-10-29, plus https://developers.cloudflare.com/sandbox/sdk/migrate/changes-in-1-0/ - "Files, S3Mount, and DirectoryBackup also need the `sandbox-shim` helper in the image." [verified]

**F45. Sandbox SDK 0.x's image carried tools that the current images do not.** "The 0.x image includes Python, Git, `curl`, `wget`, `jq`, `unzip`, and `ps`. `cloudflare/debian-trixie` and `node:24-trixie-slim`, which these pages use, include none of them."

Evidence: https://developers.cloudflare.com/sandbox/sdk/migrate/changes-in-1-0/ (last updated Oct 23, 2026, read 2026-10-29). [verified]

**F46. Sandbox SDK operations consume Workers subrequests.** By default the SDK uses HTTP transport, where each operation (`exec()`, `readFile()`, `writeFile()`, and so on) counts as one subrequest. Limits: Workers Free 50 subrequests per request, Workers Paid 1,000 per request. Setting `SANDBOX_TRANSPORT=rpc` multiplexes all SDK calls over one persistent connection that counts as a single subrequest.

Evidence: https://developers.cloudflare.com/sandbox/sdk/platform/limits/ (last updated Sep 30, 2026, read 2026-10-29). [verified]

**F47. The Sandbox SDK package writes nothing to Durable Object storage and retries nothing.** "The package writes nothing to Durable Object storage. A preview token, a process record, or a snapshot ID exists only if your class stores it." "The package also retries nothing and sets no time limits."

Evidence: same changes-in-1-0 page. [verified]

### 1.10 exec() semantics

**F48. `exec()` does not start a shell.** It starts the executable directly with the provided arguments and does not interpret pipes, redirects, or expansion. Use `["bash", "-lc", "<COMMAND>"]` or `["sh", "-c", "<COMMAND>"]`.

Evidence: https://developers.cloudflare.com/containers/api/durable-object-container/ - `exec` section. [verified]

**F49. `exec()` has no built-in timeout, and killing the parent does not kill its children.** "A process can handle or ignore a signal, so this does not enforce a hard deadline." "`kill()` and `signal` reach only the process that `exec()` started. Processes that this process starts, such as the commands in a `bash -c` script, keep running." The documented workaround is GNU coreutils `timeout`.

Evidence: same page, plus the changes-in-1-0 page. [verified]

**F50. Cancelling the request does not stop the process.** "Canceling the request that started a process does not stop the process. If the client retries, a second copy of the command runs." Propagating an abort requires the `enable_request_signal` compatibility flag in the Worker that defines the Durable Object, and the DO must be reached through `fetch()` on its stub. RPC methods do not receive a request signal.

Evidence: same page. [verified]

**F51. `output()` buffers everything in Durable Object memory.** "When output can be large, read both streams concurrently instead." `output()` throws a `TypeError` if called more than once or after either readable stream starts being consumed.

Evidence: same page. [verified]

**F52. The `user` option does not sandbox.** In a deployed container "every process has the same Linux capabilities as `root`, so file permissions do not restrict it, and it can switch back to `root`." Locally under Docker, a non-root process gets no capabilities and file permissions do apply. This local/production divergence is called out by Cloudflare itself.

Evidence: https://developers.cloudflare.com/sandbox/concepts/security/ and https://developers.cloudflare.com/containers/guides/local-dev/ (last updated Sep 30, 2026, read 2026-10-29). [verified]

### 1.11 Outbound traffic and credential handling

**F53. `enableInternet: false` leaves only ports 80 and 443, and DNS answers only for covered hostnames.** "Your outbound configuration decides which DNS lookups resolve." Each answer is a placeholder address that routes the request to the Worker. With only `outboundByHost` set, only its hostnames resolve and every other lookup times out.

Evidence: https://developers.cloudflare.com/containers/configuration/outbound-traffic/ (last updated Oct 12, 2026, read 2026-10-29). [verified]

**F54. Outbound handlers run in the Workers runtime, outside the container sandbox.** They have access to all Workers bindings. This is the documented credential-injection pattern: the container makes a plain HTTP request, the handler attaches the credential before forwarding. Handlers see HTTP on port 80 and HTTPS on port 443 only; with Internet access on, connections to other ports go out directly.

Evidence: same page and https://developers.cloudflare.com/sandbox/concepts/security/. [verified]

**F55. HTTPS interception requires trusting an ephemeral runtime CA.** Setting `interceptHttps = true` plus an `outbound` or `outboundByHost` handler creates `/etc/cloudflare/certs/cloudflare-containers-ca.crt` at container start. The CA must not be baked into the image during `docker build`; the entrypoint must copy it into the distro trust store and refresh. HTTPS interception is off by default.

Evidence: same outbound-traffic page. [verified]

**F56. Handler precedence is fixed.** 1. `deniedHosts` (denied immediately, overrides everything including per-host handlers). 2. `allowedHosts` (deny-by-default when set). 3. Instance-level rules from `setOutboundByHost()`. 4. Class-level handlers. Both lists support simple globs where `*` matches any sequence of characters.

Evidence: same page. [verified]

**F57. Containers reach Workers bindings through virtual hostnames.** The container makes a plain HTTP request to a virtual hostname such as `http://my.kv/some-key`, and an `outboundByHost` handler resolves it against the bound resource. No SDK is needed inside the container. `ctx.containerId` is available in the handler and scopes access to the container's own DO.

Evidence: https://developers.cloudflare.com/containers/configuration/workers-connections/ (last updated Aug 28, 2026, read 2026-10-29). [verified]

### 1.12 Local development

**F58. Local Containers run in Docker, not in Firecracker.** A Docker-compatible CLI and engine are required. The `durable_object` policy needs Wrangler 4.136.0 or later locally; running `cloudflare/debian-trixie` locally needs Wrangler 4.141.0 or later.

Evidence: https://developers.cloudflare.com/containers/guides/local-dev/ (last updated Sep 30, 2026, read 2026-10-29). [verified]

**F59. Two concrete local-versus-production divergences are documented.**

- Hostname: deployed containers get a 64-character hostname, one more than a DNS label allows, and it is absent from `/etc/hosts`. Locally it is the 12-character Docker container ID and it is listed. Cloudflare's own example of the resulting failure: `python3 -m http.server` and `wsgiref` exit at startup with `UnicodeEncodeError: 'idna' codec can't encode characters in position 0-63: label too long`.
- Capabilities: locally Docker gives no capabilities to a non-root process; deployed, every process has root-equivalent capabilities.

Evidence: same page. [verified]

**F60. FUSE in local dev depends on how Docker runs.** Miniflare grants local containers the Docker privileges FUSE needs when the Docker daemon runs inside a VM (macOS, WSL). On Linux it grants them for rootless Docker when `/dev/fuse` is available. Rootful Docker on Linux does not support FUSE by default in local dev.

Evidence: same page, and the Containers changelog entry dated Aug 20, 2026. [verified]

**F61. `wrangler deploy` is not transactional across Worker and container.** Wrangler uploads and activates the Worker before it processes container configuration, then builds and pushes the image. "an image build, image push, or rollout error can happen after the new Worker is already live." Non-production Workers Builds runs default to `wrangler versions upload`, which uploads Worker code only and does not publish an image or roll out containers. Version URLs are not generated for Workers that implement Durable Objects, which includes Containers Workers.

Evidence: https://developers.cloudflare.com/containers/guides/deploy/ (last updated Sep 22, 2026, read 2026-10-29). [verified]

### 1.13 Security

**F62. A cross-tenant data exposure vulnerability affected Cloudflare Containers and Cloudflare Sandboxes.** Reported 2026-09-04 15:26 UTC by Oren Yomtov of Accomplish through HackerOne. Runtime fix merged the same day; rollout completed 2026-09-07 06:13 UTC; the researcher's proof of concept stopped working by 2026-09-14; cleanup of all pre-mitigation cached snapshots completed 2026-09-19 15:03 UTC.

Mechanism, from Cloudflare's own writeup:
- Containers use Linux device mapper thin provisioning (dm-thin) for each container's writable root disk, inside a Firecracker VM that presents the disk as `/dev/vdc`.
- The affected storage pools used a 64 KiB thin-block size and were configured with `skip_block_zeroing`, so dm-thin skipped zeroing newly allocated blocks.
- A container that wrote one 4 KiB block into a 64 KiB-aligned region corresponding to ext4 free space caused dm-thin to allocate a physical block from a shared pool serving multiple customer accounts. The 4 KiB write replaced only that portion; the remaining 60 KiB could retain data from a previous container.
- A subsequent raw read of `/dev/vdc` observed bytes the new container had never written.

Scale of the finding: across six production placements the researchers reported 5,614 testable directory blocks, zero attributed to their own filesystem, and 2,700 distinct foreign directory inodes identified through ext4 `metadata_csum` directory block checksums. They observed residual material on 18 of 24 placements and 20 of 22 underlying nodes across four continents. Recovered block types included directory structures, database pages, and structurally complete SQLite databases.

Impact boundary: the attacker could not target a particular customer, workload, host, or data, and could not access an actively attached disk. The researchers did not demonstrate modification of another customer's active data or impact to availability. Cloudflare reports no evidence of exploitation beyond the researchers and its own engineers doing authorized validation.

Evidence: https://blog.cloudflare.com/containers-cross-tenant-vulnerability/ (read 2026-10-29). [verified]

**F63. Two secondary sources describe the same incident** (shattered.io, aviatrix.ai threat research, a LinkedIn post). I did not rely on them for any number; every figure above is from Cloudflare's own post. [unverified as independent corroboration; not needed]

**F64. Raw block device access from inside a container is possible and is what made the above exploitable.** The proof of concept opened `/dev/vdc` directly. Any sandbox that permits arbitrary code execution can read the raw disk of its own VM. [verified, same blog post]

**F65. The sandbox is the smallest unit of trust, and everything inside it is shared.** "Every process in a Container runs on the same Linux system. The processes can read the same files, see each other, and connect to the same `localhost` ports." When two users share a sandbox, each user's code can read the other's work. A sandbox per user or per job is the documented pattern.

Evidence: https://developers.cloudflare.com/sandbox/concepts/security/ (last updated Sep 30, 2026, read 2026-10-29). [verified]

**F66. A token in a clone URL is readable by dependency code.** The documented failure: a coding agent clones a private repo with the token in the URL, Git writes it to `.git/config`, and test dependencies read it from there. The documented fix is to keep the token in the Worker and have an outbound handler add it.

Evidence: same security page. [verified]

**F67. The sandbox name is an authorization decision, not an identity.** "The name decides which sandbox, and which saved files, a request reaches. It does not show who sent the request." Reusing a name or a snapshot for someone else gives them the earlier user's files. The how-to guides read the name from the URL only to keep examples short.

Evidence: same security page. [verified]

### 1.14 Placement

**F68. Placement constraints exist for regional and jurisdictional control.** Regions: `ENAM`, `WNAM`, `EEUR`, `WEUR`, `APAC`, `SAM`, `ME` (limited capacity), `OC` (limited capacity), `AFR` (limited capacity). Jurisdictions: `eu` (EEUR, WEUR), `us` (ENAM, WNAM), `fedramp` (ENAM, WNAM). Limited-capacity regions cannot be used exclusively; you must include at least one other region or contact support.

Evidence: https://developers.cloudflare.com/containers/concepts/placement/ (last updated Oct 1, 2026, read 2026-10-29). [verified]

**F69. Container location is not stable across restarts.** "once that container instance stops and restarts, future requests could be routed to a different location. This location will again be the nearest location to the originating request with a pre-fetched image."

Evidence: https://developers.cloudflare.com/containers/concepts/architecture/. [verified]

**F70. Scaling is manual and stateless routing is random.** There is no autoscaler. You scale by getting containers with explicit IDs and starting them. `getRandom(env.BACKEND, N)` picks one of a fixed N instances at random regardless of location. The `containers` README calls `getRandom` "a temporary method until built-in autoscaling and load balancing are added".

Evidence: https://developers.cloudflare.com/containers/configuration/scaling-and-routing/ (last updated Oct 16, 2026, read 2026-10-29) and `gh api repos/cloudflare/containers/contents/README.md` (read 2026-10-29). [verified]

### 1.15 Browser Run

**F71. Browser Rendering is now called Browser Run, and it runs on Cloudflare Containers.** Rebuilt on the Containers platform, announced 2026-05-13. Results: up to 60 browsers per minute via the Workers binding and up to 120 concurrent, described as 4x the previous limit; Quick Action response times dropped more than 50 percent. No customer action was required.

Evidence: https://blog.cloudflare.com/browser-run-containers/ (read 2026-10-29). [verified]

**F72. Cloudflare's own Browser Run team documented the latency and state-management problems of the DO-to-container split.** DOs are created close to the incoming request but the container may spin up on the other side of the world, which hurts WebSocket-heavy flows. Their fix was regional pools of pre-warmed DO-backed browser containers, choosing the closest DO-container pair within a region.

Evidence: same blog post. [verified]

**F73. They replaced KV with D1 plus Queues for container state, for a concrete reason.** KV's eventual consistency of around 30 seconds (and a minimum cache TTL of 30 seconds) meant a container could look available and be claimed by the time they routed to it. D1's transactional nature made assignment atomic. They shard D1 per location and batch state writes: each container reports every 5 seconds, a queue consumer has `max_batch_size: 100` and `max_batch_timeout: 1`, giving 100-row batches and a p95 batch write of 0.1 ms, which they say supports up to 500,000 containers per location.

Evidence: same blog post. [verified]

**F74. Browser Run limits.** Read from https://developers.cloudflare.com/browser-run/limits/ (last updated Oct 14, 2026, read 2026-10-29). [verified]

| Feature | Workers Free | Workers Paid |
| --- | --- | --- |
| Browser hours | 10 minutes per day | No limit (see pricing) |
| Concurrent browsers per account (Browser Sessions only) | 3 | 200 |
| New browser instances (Browser Sessions only) | 1 every 20 seconds | 3 per second |
| Browser timeout | 60 seconds | 60 seconds |
| Total requests per second (Quick Actions only) | 1 every 10 seconds | 30 per second |
| Crawl jobs per day | 5 | not listed on this page |
| Maximum pages per crawl | 100 | not listed on this page |

Browser timeout defaults to 60 seconds of inactivity and `keep_alive` extends it to up to 20 minutes. There is no fixed maximum session duration while the session stays active. Sessions also close when Browser Run rolls out a new release. [verified, same page]

**F75. The Browser Run client libraries are open source and live in one monorepo.** `github.com/cloudflare/puppeteer` now redirects to `cloudflare/browser-run`. Retrieved with `gh api repos/cloudflare/browser-run` on 2026-10-29:

- Stars: 378, license Apache-2.0, language TypeScript, last push 2026-10-28T22:47:36Z, open issues 11
- Packages: `@cloudflare/puppeteer`, `@cloudflare/playwright`, `@cloudflare/playwright-mcp`
- The ports use upstream repositories as Git submodules with Cloudflare-specific changes in `patches/`

[verified]

`github.com/cloudflare/playwright`: 125 stars, Apache-2.0, TypeScript, last push 2026-09-22T13:57:51Z, open issues 45. [verified]

**F76. Browser Run RPC bindings accept an `outboundByHost` map**, so selected browser requests can be routed through a Worker Fetcher with the caller's authentication or private network access. The map carries live Worker capabilities and is not supported by URL endpoints or legacy HTTP-only bindings. The Fetcher and the browser launch must happen in the same Worker invocation.

Evidence: `gh api repos/cloudflare/browser-run/contents/README.md`, read 2026-10-29. [verified]

### 1.16 Cloudflare Computer

**F77. A separate open-source project, `cloudflare/computer`, sits on top of Containers and Dynamic Workers.** `gh api repos/cloudflare/computer` on 2026-10-29: 9752 stars, MIT license, TypeScript, last push 2026-10-29T04:13:36Z, 28 open issues.

It is a virtual filesystem inside a Durable Object. The DO holds authoritative state in SQLite and exposes one pluggable execution surface through `workspace.runtime`. Three backends: Container (projects SQLite state into a sandbox container as a real FUSE mount, with a sandbox-side `computerd` daemon syncing over capnweb RPC), Isolate shell (`just-bash` in a Dynamic Worker), and Isolate JavaScript (an ECMAScript module in a fresh Dynamic Worker).

The README's own status note: "The `@cloudflare/computer` package should be considered suitable for production use. The package contains work-in-progress and experimental components such as the `ContainerBackend`. These should be considered unsuitable for production use."

Evidence: `gh api repos/cloudflare/computer/contents/README.md`, read 2026-10-29. [verified]

### 1.17 Alternatives and how they compare

**F78. Firecracker is the same primitive Cloudflare uses, and it is open source.** `gh api repos/firecracker-microvm/firecracker` on 2026-10-29: 37694 stars, Apache-2.0, Rust, last push 2026-10-29T10:49:20Z, open issues 117. Description: "Secure and fast microVMs for serverless computing." [verified]

**F79. E2B Runtime is the closest complete self-hostable analogue to Cloudflare Containers plus Sandbox SDK.** `gh api repos/e2b-dev/runtime` on 2026-10-29: 1781 stars, Apache-2.0, Go, last push 2026-10-29T11:22:24Z, open issues 132. Note that `gh api repos/e2b-dev/infra` redirects to `e2b-dev/runtime`.

From the README (read 2026-10-29): the complete backend behind E2B Cloud, comprising the control-plane API, the per-node orchestrator that drives Firecracker, the `envd` agent that runs inside every VM, the edge router for sandbox traffic, and the template builder. Design points relevant to this spec:
- One Firecracker microVM per sandbox, in its own cgroup and network namespace, with a per-sandbox nftables egress firewall and SNI/Host-inspecting domain allow and deny lists.
- A sandbox is a resumed snapshot. Templates are pre-booted VMs stored in object storage; creating a sandbox means restoring one, not booting a kernel. Memory pages are served lazily on page fault through `userfaultfd`; the root filesystem is a copy-on-write overlay over a read-only image.
- Pause and resume: pause diffs memory and disk against the template and ships the diff to object storage; resume prefers the node that still has it cached; idle sandboxes auto-pause and incoming traffic wakes them transparently.
- Fork a running sandbox in place, up to a hundred per request, while the original keeps running.
- `envd` exposes processes, PTYs, filesystem operations, file watchers, and port forwarding over Connect RPC and REST, and can be live-upgraded inside a running sandbox.
- Sandbox URLs: `https://<port>-<sandbox>.<domain>` reaches any port a process opens, routed at the edge.
- Control plane and data plane never mix: sandbox traffic goes straight from the edge to the node and never passes through the API.

**F80. E2B Embed runs the whole stack on one machine you own.** From `gh api repos/e2b-dev/runtime/contents/embed/README.md` (read 2026-10-29): "E2B Embed runs the whole E2B stack, every feature included, on a single machine in the environment of your choice." Install paths: Docker Compose on a Linux host you own, Terraform on GCP/AWS/Azure, or Kubernetes. "Open source, Apache-2.0, in the public E2B runtime repository. No E2B account and no license key needed." Nothing leaves the node; templates, sandbox logs and data live on its disk. [verified]

**F81. The main SDK repo is `e2b-dev/E2B`.** `gh api repos/e2b-dev/E2B` on 2026-10-29: 14606 stars, Apache-2.0, Python, last push 2026-10-29T01:33:21Z, open issues 117. [verified]

**F82. Other isolation substrates, with metadata from `gh api` on 2026-10-29.**

| Repo | Stars | License | Language | Last push | Open issues |
| --- | --- | --- | --- | --- | --- |
| google/gvisor | 19818 | Apache-2.0 | Go | 2026-10-29T10:04:45Z | 1025 |
| kata-containers/kata-containers | 9044 | Apache-2.0 | Rust | 2026-10-29T09:06:31Z | 1247 |
| cloud-hypervisor/cloud-hypervisor | 6441 | null in API (unverified) | Rust | 2026-10-29T11:20:04Z | 198 |
| daytonaio/daytona | 71443 | null in API (unverified) | null in API | 2026-07-24T07:12:07Z | 457 |

All verified except the two license and one language fields marked unverified. Daytona's last push is three months older than the others, which is worth noting if it is a candidate. [verified metadata]

**F83. Self-hostable headless browser stacks exist and are materially cheaper at low volume.**

| Repo | Stars | License | Language | Last push | Open issues |
| --- | --- | --- | --- | --- | --- |
| browserless/browserless | 13874 | NOASSERTION (license file not read) | TypeScript | 2026-10-28T05:47:06Z | 16 |
| steel-dev/steel-browser | 7886 | Apache-2.0 | TypeScript | 2026-10-28T20:58:51Z | 75 |

Metadata verified via `gh api` on 2026-10-29. browserless's GitHub license field reads NOASSERTION; its README says "Free for non-commercial uses", which I did not verify against the license file. [verified metadata, license unverified]

**F84. Supporting Cloudflare repositories, from `gh api` on 2026-10-29.**

| Repo | Stars | License | Language | Last push | Open issues |
| --- | --- | --- | --- | --- | --- |
| cloudflare/workerd | 9093 | Apache-2.0 | C++ | 2026-10-29T11:10:53Z | 827 |
| cloudflare/workers-sdk | 4680 | Apache-2.0 | TypeScript | 2026-10-29T06:42:31Z | 604 |
| cloudflare/containers | 278 | Apache-2.0 | TypeScript | 2026-08-24T04:36:20Z | 65 |
| cloudflare/sandbox-sdk | 1156 | Apache-2.0 (LICENSE file) | TypeScript | 2026-10-29T10:33:06Z | 4 |
| cloudflare/miniflare | 3926 | MIT | TypeScript | 2025-03-13T11:28:31Z | 1 |

`cloudflare/containers` publishes the `Container` class and `@cloudflare/containers`, providing HTTP proxying and WebSocket forwarding, outbound interception by host or catch-all with HTTPS support, host allow/deny lists with glob matching, lifecycle management, and lifecycle hooks (`onStart`, `onStop`, `onError`, `onActivityExpired`). Its README documents `sleepAfter` defaulting to `"10m"` and `enableInternet` defaulting to `true` on the class. [verified]

Note that the `cloudflare/containers` repo has not been pushed to since 2026-08-24, while the docs were last updated in October 2026 and the runtime API (`ctx.container`) has moved ahead of the `Container` class. The docs themselves describe the `Container` class as the path for "existing applications" and the Durable Object Container API as the path for "new applications". [verified]

**F85. Sandbox SDK 1.0's model means the SDK is thin, so a self-hosted equivalent is mostly a container orchestrator plus a small helper.** The SDK contributes `Files`, `S3Mount`, and `DirectoryBackup` over `ctx.container`. Everything else (lifetime, previews, outbound policy, retries, timeouts) is the operator's own Durable Object code. [verified from F42, F43, F47]

---

## 2. What this changes for the spec

**R1. Do not plan on the Cloudflare Container API for the data plane. It is structurally incapable of reaching your own hardware.**
A container is reachable only through the Durable Object bound to it (F3, F4). There is no remote container binding, no BYOC, and no node agent in the docs index (F4). The DO-to-container hop is Cloudflare-internal. So the split the operator wants is not "Cloudflare schedules, my machine runs" for containers; it is "Cloudflare schedules containers on Cloudflare, and my machines are reached through a different mechanism", namely a Tunnel (A1) or a VPC service (A5). Write the spec so that the orchestration layer talks to the data plane over HTTP through a tunnel, and treat Cloudflare Containers as a separate, optional, paid convenience for short agent sandboxes rather than the substrate for the operator's own compute.

**R2. If Cloudflare Containers are used at all, use the `durable_object` policy and budget for beta.**
It is the only policy that gives per-instance image and size choice at runtime, snapshots, and code-controlled rollouts (F2, F35, F37). The `default` policy locks image and instance type at deploy time and pushes rollouts through Cloudflare's control plane, which is the wrong shape for agent sandboxes. The cost of the choice is that `max_instances` is unavailable (F36), so instance-count control moves into the operator's own DO code, and the policy is immutable once the application is created (F35).

**R3. Price Containers as an idle-while-warm cost, not a per-job cost.**
Memory and disk are billed on provisioned resources for the whole time the instance runs, including when nothing inside it is working (F10, and the sandbox lifetime page states "An idle instance is still billed"). Only CPU is metered on active use. A 6-hour inactivity timeout on a `standard-2` (1 vCPU, 6 GiB, 12 GB) therefore bills 6 hours of 6 GiB memory and 12 GB disk whether or not the sandbox did anything. For a self-hosted comparison the honest unit is dollars per warm-sandbox-hour at a chosen instance type, not dollars per exec. Worked example for the spec: `standard-2` at $0.0000025/GiB-second and $0.00000007/GB-second costs 6*3600*(6*0.0000025 + 12*0.00000007) = 6*3600*0.00001584 = $0.342 per 6 hours of warm idle, before any CPU, before any Workers or DO charges, before egress. That is roughly $0.057 per warm sandbox-hour at idle.

**R4. Cap the inactivity timeout well below 6 hours unless the workload genuinely needs a live process.**
The lifetime model is adversarial to long idle gaps: code inside the container does not count as activity (F26), the timeout does not survive a DO restart (F27), and Cloudflare does not wake the DO when the instance stops (F34). The documented way to keep a long build alive is a DO alarm that pings more often than the timeout. For a CI runner this is a poor fit: a self-hosted runner on the operator's own metal keeps a process alive for free. Use Cloudflare Containers for short, snapshot-friendly jobs and keep long builds on the data plane.

**R5. Treat the sandbox as the unit of tenancy and never reuse a name across users.**
F65, F66, F67 together say: one sandbox per user or per job; credentials never enter the sandbox (use outbound handlers); the sandbox name is an authorization decision. Any multi-tenant design that derives a sandbox name from a URL path without authenticating the caller first is broken by Cloudflare's own documentation. This should be an explicit rule in the spec, with the outbound-handler credential pattern (F54) as the required mechanism for private repo access.

**R6. Add the dm-thin / `skip_block_zeroing` incident to the threat model as a reason to prefer self-hosted isolation for sensitive data.**
F62 shows that a Workers Paid account could read residual disk blocks from other customers' containers on the same host, including structurally complete SQLite databases, on 18 of 24 placements. It was remediated, and there is no evidence of exploitation, but the mechanism (raw `/dev/vdc` access from inside the guest, F64) is inherent to giving a container a writable root disk. For the operator's own machines, Firecracker with block zeroing enabled plus per-sandbox nftables egress rules is the E2B Runtime posture (F79) and it is auditable locally. For Cloudflare-hosted sandboxes, the spec should state that a container is not a place to put a secret that has not already been encrypted at rest.

**R7. Use E2B Runtime as the reference implementation for the self-hosted sandbox plane, not Firecracker directly.**
Firecracker gives the microVM (F78) but nothing else. E2B Runtime gives the control-plane API, the per-node orchestrator, the in-VM `envd` agent, the edge router, the template builder, snapshot resume with `userfaultfd` lazy paging, pause/resume, fork, and sandbox URLs, and it runs the whole stack on one machine you own with no license key (F79, F80). It also matches the operator's architecture exactly: "Control plane and data plane never mix. Sandbox traffic goes straight from the edge to the node and never passes through the API" (F79), which is the same separation the operator wants between the Cloudflare-hosted dashboard and his own machines. The remaining work to adapt it is replacing E2B's edge router with a Cloudflare Tunnel or VPC service, which is A1 and A5 territory.

**R8. Do not assume the Sandbox SDK's image is a general-purpose environment.**
F45: the current recommended images (`cloudflare/debian-trixie`, `node:24-trixie-slim`) contain no Python, Git, curl, wget, jq, unzip, or ps. The 0.x image did. Anything the spec plans to run inside a Cloudflare sandbox must either build its own image or `exec()` its way to installing tools at runtime, and F44 adds that `Files`, `S3Mount`, and `DirectoryBackup` need the `sandbox-shim` binary compiled into the image.

**R9. Watch the subrequest budget in any Worker that drives a sandbox.**
F46: 1,000 subrequests per request on Workers Paid, and each SDK operation over HTTP transport is one. A CI step that reads and writes many files will hit this. `SANDBOX_TRANSPORT=rpc` collapses it to one. The spec should make RPC transport the default and document the switch.

**R10. If the spec needs browser automation, decide explicitly between Browser Run and self-hosted.**
Browser Run is cheap to start (10 hours/month included on Workers Paid, then $0.09/hour) but the concurrency meter is unusual: $2.00 per browser above 10, averaged monthly from daily peaks (F14), and the hard paid limit is 200 concurrent browsers (F74). Self-hosted browserless or steel-browser (F83) has no per-browser-hour meter and no concurrency ceiling, at the cost of running Chrome on the operator's own machines. For the "cheaper alternative" goal, self-hosted wins on any sustained concurrency; Browser Run wins for spiky, low-volume use and for anything that must run close to Cloudflare's edge. Note also that Cloudflare's own team hit exactly the problem the operator would hit: DO-to-container distance, solved with regional pre-warmed pools and D1+Queues for state (F72, F73). That is a free reference architecture.

**R11. Do not build the dashboard's container control plane on Cloudflare Containers' scaling primitives.**
F70: there is no autoscaler. Scaling is explicit `getByName`/`get` plus `start()`, and `getRandom` is random and location-blind. Any UI that lists, starts, stops, and resizes sandboxes has to implement its own inventory and placement logic, which is precisely the orchestration layer the operator wants to own anyway.

**R12. Local development will not catch the two failures that matter most.**
F59: the deployed hostname is 64 characters and breaks anything that resolves its own hostname (Cloudflare's own example is `python3 -m http.server`), and deployed processes all have root-equivalent capabilities while local Docker does not. The spec should include a deploy-and-verify step in the CI path, not just `wrangler dev`. F61 adds that `wrangler deploy` is not transactional across Worker and container, so a failed image build can leave the new Worker live against the old image.

**R13. Registry handling needs a decision recorded up front.**
F39: the `default` policy accepts Cloudflare Registry, Docker Hub, ECR, and GAR references; the `durable_object` policy's `images.<name>.image` wants a digest pin in the Cloudflare Registry and the docs say direct external references are not supported there. Total image storage is 50 GB per account (F6). Pick one registry path for the whole spec rather than mixing policies.

---

## 3. Not covered / open questions

**N1. Workers and Durable Object unit prices.** A2 covers Containers pricing. Workers requests, CPU-ms, DO requests, DO duration, DO SQLite storage, and Workers Logs rates are A4 and A6. I recorded only that Containers incur them (F12) and that the Workers Paid plan is $5/month (F10).

**N2. R2 pricing and operation classes.** Out of scope for A2. Referenced only where Containers touch R2 (FUSE mounts, `S3Mount`, `DirectoryBackup`).

**N3. Cloudflare Tunnels, VPC, WARP, service tokens, and cloudflared CVEs.** That is A1 and A5. I did not research them here. The one intersection I verified is that Browser Run's RPC bindings can route browser requests through a Worker Fetcher with private network access (F76), which is a bridge between A2 and A5.

**N4. workerd, V8 isolates, Dynamic Workers limits, and `experimental_configureRuntime`.** A3. I noted only that Dynamic Workers are the alternative sandbox environment for JS/Python/Wasm code (from https://developers.cloudflare.com/sandbox/), and that `cloudflare/computer` uses `env.LOADER` to load them.

**N5. Whether the `durable_object` policy's registry restriction is a real platform limit or a documentation gap.** F39 records two Cloudflare pages that read differently. I did not test pushing a Docker Hub reference under the `durable_object` policy. Resolving this needs a `wrangler deploy` against a real account, which is outside read-only research.

**N6. The `cloudflare/containers` package's release cadence and version compatibility with the current runtime API.** The repo's last push was 2026-08-24 (F84) while the docs moved in October. I did not read the CHANGELOG or check which `@cloudflare/containers` version matches the current `ctx.container` surface.

**N7. Concrete self-hosted cost figures.** I have Cloudflare's published rates and the open-source projects' metadata, but no benchmark of E2B Runtime or Firecracker on real hardware, and no price for a bare-metal box. Any dollars-per-sandbox-hour comparison in the spec will need a measurement run. This is the largest gap between what the operator asked for and what I can supply from primary sources alone.

**N8. Whether Browser Run's paid-tier crawl limits differ from the free tier.** The limits page lists crawl jobs per day and pages per crawl only in the Workers Free table (F74). The paid rows for those two features are absent. Unverified.

**N9. Sandbox SDK 1.0 API surface in detail.** I read the migration page and the README, not the full API reference. The exact `Files`, `S3Mount`, and `DirectoryBackup` method signatures, and the 0.x-to-1.0 API map, are not in this document.

**N10. gVisor and Kata suitability for this specific workload.** I have repository metadata (F82) but no performance or isolation comparison against Firecracker for multi-tenant untrusted-code execution. Any claim about which substrate to use on the operator's own metal beyond "Firecracker is what Cloudflare uses and E2B Runtime packages it" would be an unverified preference.

**N11. Known CVEs in Firecracker, gVisor, Kata, Cloud Hypervisor, E2B Runtime, browserless, or steel-browser.** I did not search CVE databases. I only have the Cloudflare Containers cross-tenant incident (F62), which is not a CVE.

**N12. Whether Cloudflare will expose a self-hosted or hybrid Containers mode.** Nothing in the current docs suggests it, but that is an absence of evidence rather than evidence of absence, and the product moved substantially between April and October 2026.

---

## Source list

All read on 2026-10-29 via the pkgforge gateway (provider=tinyfish) or `gh api`.

Cloudflare docs and blog:
- https://developers.cloudflare.com/containers/
- https://developers.cloudflare.com/containers/platform/limits/
- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/containers/configuration/scheduling-policy/
- https://developers.cloudflare.com/containers/configuration/outbound-traffic/
- https://developers.cloudflare.com/containers/configuration/workers-connections/
- https://developers.cloudflare.com/containers/configuration/scaling-and-routing/
- https://developers.cloudflare.com/containers/concepts/architecture/
- https://developers.cloudflare.com/containers/concepts/placement/
- https://developers.cloudflare.com/containers/api/durable-object-container/
- https://developers.cloudflare.com/containers/api/container-class/
- https://developers.cloudflare.com/containers/guides/snapshots/
- https://developers.cloudflare.com/containers/guides/local-dev/
- https://developers.cloudflare.com/containers/guides/deploy/
- https://developers.cloudflare.com/containers/guides/ssh/
- https://developers.cloudflare.com/containers/llms.txt
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/sandbox/
- https://developers.cloudflare.com/sandbox/sdk/platform/limits/
- https://developers.cloudflare.com/sandbox/sdk/platform/pricing/
- https://developers.cloudflare.com/sandbox/sdk/migrate/changes-in-1-0/
- https://developers.cloudflare.com/sandbox/concepts/lifetime/
- https://developers.cloudflare.com/sandbox/concepts/security/
- https://developers.cloudflare.com/sandbox/previews/serve-previews-on-their-own-hostnames/
- https://developers.cloudflare.com/browser-run/
- https://developers.cloudflare.com/browser-run/limits/
- https://developers.cloudflare.com/browser-run/pricing/
- https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/
- https://developers.cloudflare.com/changelog/product/containers/
- https://blog.cloudflare.com/faster-agent-sandboxes
- https://blog.cloudflare.com/browser-run-containers
- https://blog.cloudflare.com/containers-cross-tenant-vulnerability

GitHub repositories (metadata and file contents via `gh api`, 2026-10-29):
- cloudflare/sandbox-sdk (README, LICENSE, images/sandbox-tools/Dockerfile, releases, contents)
- cloudflare/containers (README, contents)
- cloudflare/browser-run (README, contents)
- cloudflare/playwright
- cloudflare/puppeteer (redirects to cloudflare/browser-run)
- cloudflare/computer (README)
- cloudflare/workerd
- cloudflare/workers-sdk
- cloudflare/miniflare
- firecracker-microvm/firecracker
- google/gvisor
- kata-containers/kata-containers
- cloud-hypervisor/cloud-hypervisor
- e2b-dev/runtime (README, embed/README.md)
- e2b-dev/E2B
- e2b-dev/infra (redirects to e2b-dev/runtime)
- daytonaio/daytona
- browserless/browserless
- steel-dev/steel-browser
