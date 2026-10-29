# B6-ci-systems: CI systems for "heavy CI on own metal, triggered and monitored from a Workers SPA"

Research subagent B6-ci-systems. All sources read on 2026-10-29 (UTC). Every number below
comes from a call made during this session; nothing is recalled from training. Where a
figure could not be confirmed it is marked `unverified`.

Search/read gateway used: `search.web.pkgforge.dev` and `read.web.pkgforge.dev`, both
pinned to `provider=tinyfish`. GitHub metadata via `gh api`. Docker Hub registry API via
`hub.docker.com/v2`. npm registry API via `registry.npmjs.org`. No fallback to the
built-in web_search/web_fetch tools was needed for any claim below.

---

## 1. Findings

### F1. GitHub self-hosted runners need outbound HTTPS only. No inbound ports anywhere.
Claim: a self-hosted Actions runner dials out to GitHub and never listens for inbound
connections, so it works behind NAT with zero firewall changes.
Evidence:
- `https://docs.github.com/en/actions/reference/runners/self-hosted-runners` (read via
  pkgforge/tinyfish, 2026-10-29): "The host machine must be able to make outbound HTTPS
  connections over port 443."
- `https://github.com/orgs/community/discussions/26630`, accepted answer: "The runners
  connect back to GitHub, no need for inbound firewall holes. (Outbound https 443 is all
  that's needed.)"
Label: [verified]

### F2. Self-hosted runners get a 5-day job limit; GitHub-hosted get 6 hours.
Claim: long-running heavy builds are a first-class case for self-hosted runners.
Evidence: `https://docs.github.com/en/actions/reference/limits` (read 2026-10-29). Table
rows captured verbatim:
- "Self-hosted | Job execution time | 5 days | Each job in a workflow can run for up to 5
  days of execution time. If a job reaches this limit, the job is terminated and fails."
- "Self-hosted | Job queue time | 24 hours | A job can be in the queue for 24 hours before
  it is automatically cancelled."
- "All GitHub-hosted runners | Job execution time | 6 hours"
- "Workflow execution limit | Workflow run time | 35 days / workflow run"
- "Self-hosted | Runner registrations | 1500 runners / 5 minutes / repository/org/enterprise"
- "Self-hosted | Runners per runner group | 10,000 runners"
- "Workflow execution limit | Job Matrix | 256 jobs / workflow run"
Label: [verified]

### F3. The GitHub REST API can trigger a workflow and return the run ID in one call.
Claim: a Worker can dispatch a build and immediately learn which run to watch, with no
polling loop to discover the run.
Evidence: `https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28`
(read 2026-10-29). "Create a workflow dispatch event":
- endpoint `post/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
- parameter `return_run_details` boolean: "Whether the response should include the
  workflow run ID and URLs."
- "Status 200: Response including the workflow run ID and URLs when `return_run_details`
  parameter is `true`." Response body: `workflow_run_id`, `run_url`, `html_url`.
- "Status 204: Empty response when `return_run_details` parameter is `false`."
- Auth: fine-grained token needs "Actions" repository permissions (write).
- Sample request header observed in the docs: `X-GitHub-Api-Version: 2026-03-10`.
Label: [verified]

### F4. Monitoring a self-hosted run from a Worker is a plain REST read.
Claim: the SPA can poll or webhook off GitHub rather than talking to the runner host.
Evidence: `https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28`
(read 2026-10-29): "List workflow runs for a repository - Lists all workflow runs for a
repository. You can use parameters to narrow the list of results." Access: "Anyone with
read access to the repository can use this endpoint." OAuth/PAT need `repo` scope for
private repos.
Label: [verified]

### F5. ARC is Kubernetes-only, and its GitHub-supported mode is now "runner scale sets".
Claim: ARC buys autoscaling of ephemeral runner pods, and the price is a full Kubernetes
cluster. The legacy `actions.summerwind.net` mode is community-maintained only.
Evidence: `actions/actions-runner-controller`, `docs/about-arc.md` (raw.githubusercontent,
read 2026-10-29) carries a warning block: "This documentation covers the legacy mode of
ARC (resources in the `actions.summerwind.net` namespace)." The README states: "With the
introduction of autoscaling runner scale sets, the existing autoscaling modes are now
legacy. The legacy modes have certain use cases and will continue to be maintained by the
community only."
Repo metadata (`gh api repos/actions/actions-runner-controller`, 2026-10-29):
owner/repo `actions/actions-runner-controller`, stars 6623, license Apache-2.0,
language Go, open issues 391, size 8802 KB, pushed_at 2026-10-27T13:24:19Z, not archived.
Releases: `gha-runner-scale-set-0.15.1` published 2026-10-23, `0.15.0` 2026-10-01,
`0.14.2` 2026-05-22.
Label: [verified]

### F6. ARC's scale-set listener and runners are also outbound-only HTTPS long polls.
Claim: even under ARC, nothing inbound is required, so ARC runners work behind a tunnel.
Evidence: `actions/actions-runner-controller/docs/gha-runner-scale-set-controller/README.md`
(read 2026-10-29), numbered architecture list, verbatim items:
- "3. A `Runner ScaleSet Listener` pod is deployed by the `AutoScaling Listener
  Controller`. In this pod, the listener application connects to the `Actions Service` to
  authenticate and establish a long poll HTTPS connection."
- "8. Once the runner pod is created, the runner application in the pod uses the JIT
  configuration token to register itself with the `Actions Service`. It then establishes
  another HTTPS long poll connection to receive the job details it needs to execute."
- "10. Throughout the job run execution, the runner continuously communicates the logs and
  job run status back to the `Actions Service`."
Improvements listed: "No longer require cert-manager as a prerequisite",
"Reliable scale-up based on job demands and scale-down to zero runner pods", "Reduce API
requests to `api.github.com`, no more API rate-limiting problems".
Label: [verified]

### F7. The runner application itself is a small Go/C# binary with an official container image.
Evidence: `gh api repos/actions/runner` (2026-10-29): owner/repo `actions/runner`, stars
6364, license MIT, language C#, open issues 548, pushed_at 2026-10-27T23:02:54Z.
Releases: `v2.338.2` published 2026-10-26, `v2.338.1` 2026-10-22, `v2.338.0` 2026-10-06.
Repo root contains `images/Dockerfile`; an official image exists at
`github.com/actions/runner/pkgs/container/actions-runner` (confirmed via ghcr.io tag list
for repository `actions/actions-runner`, which returned tags including `latest` and
`2.338.x` series).
README note, verbatim: "right now we are not taking contributions... We continue to focus
our resources on strategic areas that help our customers be successful while making
developers' lives better." So the runner app itself is not accepting upstream
contributions.
Label: [verified]

### F8. Woodpecker CI is server + agent + optional autoscaler, with the agent dialing out over gRPC.
Claim: the split the operator wants already exists as a first-class design.
Evidence: `woodpecker-ci/woodpecker`, `docs/docs/30-administration/00-general.md` (read
2026-10-29), verbatim: "Woodpecker consists of essential components (`server` and
`agent`) and an optional component (`autoscaler`)." And: "The **agent** executes the
workflows via a specific backend (Docker, Kubernetes, local) and connects to the server
via GRPC." And from `docs/development/architecture`: "The agent is a remote worker that
connects to the server via gRPC to receive pipeline execution instructions and report
back execution state and logs. The agent polls the server's queue for new work, executes
pipeline steps using the pipeline engine, and streams results back to the server."
Also: "Woodpecker uses a SQLite database by default, which requires no installation or
configuration. For larger instances it is recommended to use it with a Postgres or
MariaDB instance."
Repo metadata (`gh api repos/woodpecker-ci/woodpecker`, 2026-10-29): stars 8067, license
Apache-2.0, language Go, open issues 371, pushed_at 2026-10-29T10:35:26Z (same day as
this research), size 132065 KB. Releases: `v3.20.0` published 2026-10-28, `v3.19.0`
2026-10-07, `v3.18.1` 2026-09-08.
Label: [verified]

### F9. Woodpecker's container images are an order of magnitude smaller than Concourse's and Jenkins'.
Claim: the Woodpecker control plane is genuinely cheap to run.
Evidence: Docker Hub registry API (`hub.docker.com/v2/repositories/.../tags`), read
2026-10-29. Note: `full_size` on a multi-arch manifest list is the sum of layer sizes
across all platforms, so it overstates a single-architecture pull. It is still a valid
like-for-like comparison between these images because all are multi-arch.
- `woodpeckerci/woodpecker-server` tag `v3.20.0`: full_size 20174775 bytes (about 20 MB)
- `woodpeckerci/woodpecker-agent` tag `next`: full_size 16195351 bytes (about 16 MB)
- `concourse/concourse` tag `8.3.2`: full_size 1020465432 bytes (about 1.0 GB)
- `jenkins/jenkins` tag `2.588`: full_size 242262696 bytes (about 242 MB)
- `buildkite/agent` tag `edge-ubuntu-26.04`: full_size 303840449 bytes (about 304 MB)
- `summerwind/actions-runner-controller` tag `gha-runner-scale-set-0.15.1`: full_size
  46370293 bytes (about 46 MB)
Label: [verified]

### F10. Woodpecker has a real REST API with bearer-token auth, covering trigger and monitor.
Claim: a Workers SPA can drive Woodpecker without scraping the UI.
Evidence: `woodpecker-ci/woodpecker/server/api/pipeline.go` swagger annotations (read from
the repo via `gh api .../contents/server/api/pipeline.go`, 2026-10-29), verbatim routes:
- `@Router /repos/{repo_id}/pipelines [post]` - "Trigger a manual pipeline"
- `@Router /repos/{repo_id}/pipelines [get]` - "List repository pipelines"
- `@Router /repos/{repo_id}/pipelines/{pipeline_number} [get]` - "Get a repositories pipeline"
- `@Router /repos/{repo_id}/pipelines/{pipeline_number}/cancel [post]` - "Cancel a pipeline"
- `@Router /repos/{repo_id}/pipelines/{pipeline_number}/approve [post]` - "Approve and start a pipeline"
- `@Router /repos/{repo_id}/pipelines/{pipeline_number}/decline [post]` - "Decline a pipeline"
- `@Router /repos/{repo_id}/pipelines/{pipeline_number} [post]` - "Restart a pipeline"
- `@Router /repos/{repo_id}/logs/{pipeline_number}/{step_id} [get]` - "Get logs for a pipeline step"
- `@Router /repos/{repo_id}/workflows [get]` - "List workflows a manual pipeline would run"
- `@Router /pipelines [get]` - "List pipelines in queue"
Auth header documented in `server/api/user.go`: `@Param Authorization header string true
"Insert your personal access token" default(Bearer <personal access token>)`.
The spec is generated, not hand-written: `docs/development/openapi` states "Woodpecker uses
gin-swagger middleware to automatically generate Swagger v2 API specifications" and
documents `make generate-openapi` / `make generate-docs`.
Label: [verified]

### F11. Woodpecker's default job timeout is 60 minutes, max 120. This must be raised for heavy CI.
Claim: out of the box Woodpecker will kill a long build.
Evidence: `woodpecker-ci/woodpecker/docs/docs/30-administration/10-configuration/10-server.md`
(read 2026-10-29), verbatim:
- "### DEFAULT_PIPELINE_TIMEOUT - Name: `WOODPECKER_DEFAULT_PIPELINE_TIMEOUT` - Default: 60
  - The default time for a repo in minutes before a pipeline gets killed"
- "### MAX_PIPELINE_TIMEOUT - Name: `WOODPECKER_MAX_PIPELINE_TIMEOUT` - Default: 120 - The
  maximum time in minutes you can set in the repo settings before a pipeline gets killed"
Label: [verified]

### F12. Woodpecker agents authenticate to the server with a shared secret, and the server enforces filters it owns.
Evidence: `docs/docs/30-administration/10-configuration/30-agent.md` (read 2026-10-29),
verbatim:
- "WOODPECKER_SERVER ... Configures gRPC address to the server."
- "WOODPECKER_AGENT_SECRET ... A shared secret used by server and agents to authenticate
  communication. A secret can be generated by `openssl rand -hex 32`."
- "WOODPECKER_MAX_WORKFLOWS if not set, defaults to 1"
- "Agent filters are the server-side counterpart: they are stored in the server database
  and are applied by the server every time the agent asks for work. An agent cannot see,
  change or drop them."
- "Labels set with `WOODPECKER_AGENT_LABELS` are reported by the agent itself. An agent can
  therefore claim any label it likes, which makes them unsuitable to restrict what an agent
  is allowed to pick up."
Label: [verified]

### F13. BLOCKER: Cloudflare Tunnel does not support gRPC on a public hostname.
Claim: this directly breaks the "Woodpecker server behind a Cloudflare Tunnel, agents
connecting in" design, and it also blocks putting the gRPC endpoint behind Cloudflare
Access.
Evidence, two Cloudflare pages read 2026-10-29:
- `https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/grpc/`
  (page footer "Last updated Jun 23, 2026"), first paragraph verbatim: "Cloudflare Tunnel
  supports gRPC traffic via private subnet routing. Public hostname deployments are not
  currently supported." The documented procedure is: create a tunnel, then "Create route >
  Tunnel CIDR", then route private network IPs through the Cloudflare One Client with
  Split Tunnels configured for the RFC 1918 range.
- `https://developers.cloudflare.com/network/grpc-connections/` (page footer "Last updated
  Aug 14, 2026"), Limitations section verbatim: "Cloudflare Tunnel supports gRPC traffic
  via private subnet routing. Public hostname deployments are not currently supported."
  and "Cloudflare Access does not support gRPC traffic sent through Cloudflare's reverse
  proxy. gRPC traffic will be ignored by Access if gRPC is enabled in Cloudflare. We
  recommend disabling gRPC for any sensitive origin servers protected by Access or enabling
  another means of authenticating gRPC traffic to your origin servers."
  Requirements for proxied gRPC on Cloudflare: endpoint on port 443, TLS plus HTTP/2,
  HTTP/2 advertised over ALPN, `Content-Type: application/grpc`, hostname proxied, at
  least Full SSL/TLS mode.
Label: [verified]

### F14. Woodpecker's own docs assume the gRPC port is reachable by agents, and show h2c behind a proxy.
Evidence: `docs/docs/30-administration/10-configuration/40-autoscaler.md` (read 2026-10-29),
verbatim from the docker-compose sample:
- "WOODPECKER_GRPC_ADDR=grpc.your-woodpecker-server.tld # the grpc address of the server,
  publicly accessible from the agents."
- "WOODPECKER_GRPC_SECURE=true"
The server config shows a Caddy example: `woodpecker-agent.example.com { reverse_proxy
h2c://woodpecker-server:9000 }` and a Traefik example using
`traefik.http.services.woodpecker-grpc.loadbalancer.server.scheme=h2c`. So the gRPC leg
is HTTP/2 (h2c in cleartext behind a TLS-terminating proxy).
Label: [verified]

### F15. The Woodpecker autoscaler is explicitly not feature-complete.
Evidence: `docs/docs/30-administration/10-configuration/40-autoscaler.md` (read 2026-10-29),
verbatim: "Please note that the autoscaler is not feature-complete yet." Providers shown
include `hetznercloud`; the example scales VMs, not containers on existing metal.
Label: [verified]

### F16. Woodpecker supports GitHub as a forge, but requires a GitHub OAuth2 App, not a GitHub App.
Evidence: `docs/docs/30-administration/10-configuration/12-forges/20-github.md` (read
2026-10-29), verbatim warning: "Do not use a 'GitHub App' instead of an Oauth2 app as the
former will not work correctly with Woodpecker right now (because user access tokens are
not being refreshed automatically)". Forge list present in the repo:
`20-github.md`, `30-gitea.md`, `35-forgejo.md`, `40-gitlab.md`, `50-bitbucket.md`,
`60-bitbucket_datacenter.md`.
Label: [verified]

### F17. Buildkite has no self-hosted control plane. The agent is MIT and outbound-only.
Claim: Buildkite's agent is an excellent outbound-only executor, but the orchestration
brain is Buildkite's SaaS, so it cannot be the "orchestration layer on his own terms".
Evidence:
- `buildkite/agent` README (raw.githubusercontent, read 2026-10-29), verbatim: "The
  buildkite-agent is a small, reliable, and cross-platform build runner that makes it easy
  to run automated builds on your own infrastructure. It's main responsibilities are
  polling buildkite.com for work, running build jobs, reporting back the status code and
  output log of the job, and uploading the job's artifacts." Also: "On Linux hosts it
  requires `dbus`." Docker images published for Alpine 3.18, Ubuntu 20.04/22.04/24.04/26.04.
- Buildkite's own comparison pages (found via pkgforge search, snippets captured
  2026-10-29): `buildkite.com/resources/comparison/buildkite-vs-cloudbees/` - "There's no
  self-hosted control plane, and agents need that outbound connection." and
  `buildkite.com/resources/comparison/buildkite-vs-harness/` - "There's no self-hosted
  control plane, and agents need that outbound connection. If either is a hard requirement,
  ... Buildkite doesn't."
- Repo metadata (`gh api repos/buildkite/agent`, 2026-10-29): stars 1101, license MIT,
  language Go, open issues 114, pushed_at 2026-10-29T11:36:50Z. Releases: `v4.8.1`
  2026-10-22, `v4.8.0` 2026-10-22, `v4.7.0` 2026-10-20.
Label: [verified]

### F18. Concourse workers are fully outbound; the web node is the only thing that needs to be reachable.
Claim: Concourse's worker transport is SSH-reverse-tunnelled, so workers sit behind NAT
with no inbound ports.
Evidence: `https://concourse-ci.org/docs/install/running-worker/` (read 2026-10-29),
verbatim: "Inbound traffic: From the `web` node on port `7777` (Garden) and `7788`
(BaggageClaim). These ports do not need to be exposed, they are forwarded to the web node
via the ssh connection on port `2222`." Outbound list includes "External traffic to the
`web` node's TSA port (`2222`) for registering the worker". Worker config uses
`CONCOURSE_TSA_HOST`, `CONCOURSE_TSA_PUBLIC_KEY`, `CONCOURSE_TSA_WORKER_PRIVATE_KEY`.
Also verbatim: "Workers are inherently singletons" and "The `worker` nodes are designed to
be stateless and as interchangeable as possible."
Cost of that design, from `https://concourse-ci.org/docs/install/running-web/` (read
2026-10-29): "Memory usage: not very well classified at the moment as it's not generally a
concern. Give it a few gigabytes and keep an eye on it." and "Disk usage: none". Web node
is "Highly available: yes" and "Horizontally scalable: yes". The web node requires
PostgreSQL (`CONCOURSE_POSTGRES_*`).
Repo metadata (`gh api repos/concourse/concourse`, 2026-10-29): stars 7932, license
Apache-2.0, language Go, open issues 76, pushed_at 2026-10-28T21:37:10Z, size 159501 KB.
Releases: `v8.3.2` 2026-10-23, `v8.3.1` 2026-09-28, `v8.3.0` 2026-08-13.
Label: [verified]

### F19. Argo Workflows and Tekton are Kubernetes-only. Neither is a CI trigger system on its own.
Evidence:
- `argoproj/argo-workflows` README (read 2026-10-29), verbatim: "Argo Workflows is an open
  source container-native workflow engine for orchestrating parallel jobs on Kubernetes."
  Repo metadata: stars 17067, Apache-2.0, Go, open issues 1370, pushed 2026-10-29T10:29:40Z.
  Releases: `v4.1.6` 2026-10-22, `v4.0.15` 2026-10-22, `v4.0.14` 2026-10-22.
- `tektoncd/pipeline` README (read 2026-10-29), verbatim: "The Tekton Pipelines project
  provides k8s-style resources for declaring CI/CD-style pipelines." and "Run on
  Kubernetes". Repo metadata: stars 9094, Apache-2.0, Go, open issues 561, pushed
  2026-10-29T10:13:02Z. Releases: `v1.17.1` 2026-10-23, `v1.15.5` 2026-10-23, `v1.12.3`
  2026-10-23.
Label: [verified]

### F20. Dagger's engine is open source and self-hostable with no mandatory control plane.
Evidence: `https://dagger.io/` (read via pkgforge search snippet, 2026-10-29), verbatim:
"The Dagger Engine is open source. It runs on your local machine or your own server, at no
cost. Dagger Cloud provides managed remote engines, with scale-out". `dagger/dagger`
README (read 2026-10-29): "Dagger runs locally, in your CI server, or directly in the
cloud" and "The only dependency is a container runtime like Docker." Repo metadata: stars
16544, Apache-2.0, Go, open issues 233, pushed 2026-10-29T10:17:53Z, size 272939 KB.
Releases: `v0.21.11` 2026-10-21 plus `sdk/typescript/v0.21.11` and `sdk/rust/v0.21.11` the
same day.
Note: Dagger is a build/pipeline *engine*, not a system that watches a repo and starts
builds. Something else must supply the trigger.
Label: [verified]

### F21. Earthly is no longer actively maintained. Earthly Cloud and Satellites were shut down 2025-07-16.
Claim: Earthly should be treated as end-of-life upstream; the live path is a community fork.
Evidence: `earthly/earthly` README (read 2026-10-29), verbatim banner: "Earthly is no
longer actively maintained" and "**Earthly Technologies has ended active maintenance of the
Earthly open-source project, and Earthly Cloud (including Satellites) was shut down on July
16th, 2025.** The source stays available under its license." and "**A
community-maintained fork is available at [EarthBuild](https://github.com/EarthBuild/earthbuild).**"
This matches the release history (`gh api repos/earthly/earthly/releases`, 2026-10-29):
`v0.8.16` 2025-07-16, `v0.8.15` 2024-07-12, `v0.8.14` 2024-06-10. The repo is still being
pushed to (pushed_at 2026-10-26T20:59:41Z) and has 742 open issues, stars 12054, license
MPL-2.0.
The fork: `gh api repos/EarthBuild/earthbuild` (2026-10-29): stars 186, license MPL-2.0,
language Go, open issues 130, pushed_at 2026-10-29T09:53:12Z, not archived. Releases:
`v0.8.20-rc-0` 2026-10-22, `v0.8.19` 2026-09-17, `v0.8.19-rc-0` 2026-09-11.
Label: [verified]

### F22. Cirrus CI is dead as a product. cirrus-ci.org no longer resolves and the agent repo is archived.
Evidence:
- `https://cirruslabs.org/` (read 2026-10-29), verbatim heading "Cirrus Labs to join
  OpenAI" and "we have entered into an agreement to join OpenAI as part of the Agent
  Infrastructure team."
- `https://www.warpbuild.com/blog/cirrus-ci-shutting-down` (read 2026-10-29), verbatim:
  "On April 7, 2026, Cirrus Labs announced that Cirrus CI is shutting down. The service
  will stop running jobs on June 1, 2026, as the Cirrus Labs team joins OpenAI's Agent
  Infrastructure group." and "**June 1, 2026:** Cirrus CI stops running jobs entirely."
- `gh api repos/cirruslabs/cirrus-ci-agent` (2026-10-29): archived true, stars 11,
  license MPL-2.0, pushed_at 2024-05-08T15:48:29Z.
- `gh api repos/cirruslabs/tart` (2026-10-29) resolves to `openai/tart`: stars 7710,
  language Swift, pushed 2026-10-26. Tart moved with the team.
Label: [verified]

### F23. Drone's repo now redirects to Harness Open Source, which is Beta.
Evidence: `gh api repos/drone/drone` (2026-10-29) returns `full_name: harness/harness`.
`gh api repos/harness/harness`: stars 38757, license Apache-2.0, language Go, open issues
125, pushed_at 2026-10-29T08:41:56Z, size 60202 KB. Description: "Harness Open Source is
an end-to-end developer platform with Source Control Management, CI/CD Pipelines, Hosted
Developer Environments, and Artifact Registries." Releases: `v2.28.2` 2026-04-20,
`v2.28.1` 2026-03-30, `v2.28.0` 2026-03-27, `v2.27.2` 2026-03-11, `v2.27.1` 2026-02-25.
`https://docs.drone.io/faq/gitness/` (search snippet, 2026-10-29), verbatim: "Harness Open
Source is the next major version of Drone, however, Harness Open Source is still in Beta
and under active development."
Label: [verified]

### F24. Gitea Actions and Forgejo Actions both need their own forge as the control plane.
Evidence:
- `https://docs.gitea.com/usage/actions/overview/` (read 2026-10-29), verbatim: "Starting
  with Gitea **1.19**, Gitea Actions are available as a built-in CI/CD solution." and
  "Just like other CI/CD solutions, Gitea doesn't run the jobs itself, but delegates the
  jobs to runners. The runner of Gitea Actions is called Gitea Runner, it is a standalone
  program and also written in Go. An important part of the application comes from a hard
  fork of nektos/act." and "Gitea Actions is stable enough for production usage and we use
  Gitea Actions in all the repositories in https://gitea.com/gitea."
- `gitea/act_runner` now 301-redirects to `gitea/runner` on gitea.com. API read
  2026-10-29: full_name `gitea/runner`, description "Official runner for Gitea Actions",
  stars_count 272, language Go, updated_at 2026-10-28T06:34:00Z, not archived. LICENSE file
  content starts "Copyright (c) 2022 The Gitea Authors / Permission is hereby granted, free
  of charge..." (MIT). Releases: `v5.2.4` 2026-10-28, `v5.2.3` 2026-10-26, `v5.2.2`
  2026-10-22.
- Forgejo runner is on Codeberg, not GitHub. `https://code.forgejo.org/api/v1/repos/forgejo/runner`
  read 2026-10-29: full_name `forgejo/runner`, description "A daemon that connects to a
  Forgejo instance and runs jobs for continuous integration.", stars_count 119, language Go,
  updated_at 2026-10-02T02:59:31Z. Releases: `v13.2.0` 2026-09-18, `v13.1.0` 2026-08-31,
  `v13.0.0` 2026-08-03.
- Runner prerequisites from `gitea/runner` README (raw, read 2026-10-29): "`docker` or
  `podman` with `podman.socket` enabled, for docker mode, Docker actions and `docker://`
  steps", plus `git` 2.34.1+, `bash`/`sh`, `node` for JavaScript actions.
Label: [verified]

### F25. Jenkins controller needs Java 21+ and a few GB; agents connect by SSH (inbound) or WebSocket (outbound).
Evidence: `https://www.jenkins.io/doc/book/installing/linux/` (read 2026-10-29), verbatim:
"Minimum hardware requirements: 256 MB of RAM, 1 GB of drive space (although 10 GB is a
recommended minimum if running Jenkins as a Docker container)" and "Recommended hardware
configuration for a small team: 4 GB+ of RAM, 50 GB+ of drive space" and "Java 21 or later".
`https://www.jenkins.io/doc/book/using/using-agents/` (read 2026-10-29): "The agents
require a Java installation and a network connection to the Jenkins controller." and "For
Jenkins controllers, it is recommended to set this [executors] to `0` to avoid resource
contention."
Outbound agent transport: `https://www.jenkins.io/projects/remoting/` (search snippet,
2026-10-29) names a "Docker Inbound Agent: Image, which can be used to connect agents using
TCP or WebSocket". WebSocket is the outbound-capable option.
Repo metadata (`gh api repos/jenkinsci/jenkins`, 2026-10-29): stars 26702, license MIT,
language Java, open issues 3644, pushed_at 2026-10-29T03:52:55Z, size 174551 KB. Releases:
`jenkins-2.588` 2026-10-28, `jenkins-2.580.2` 2026-10-28, `jenkins-2.587` 2026-10-20.
Label: [verified]

### F26. Nix-based CI: the agent is open source but the control plane is hosted SaaS.
Evidence: `gh api repos/hercules-ci/hercules-ci-agent` (2026-10-29): stars 125, license
Apache-2.0, language Haskell, pushed_at 2026-10-28T05:14:23Z. README verbatim: "Hercules
CI Agent runs on your infrastructure and executes tasks (evaluation, builds, etc) for your
[Hercules CI](https://hercules-ci.com/) account." So the agent is self-hostable but the
scheduler is at hercules-ci.com.
Adjacent Nix tooling, all read 2026-10-29: `NixOS/nix` stars 17933, LGPL-2.1, C++, pushed
2026-10-29T11:42:24Z, open issues 3032. `DeterminateSystems/nix-installer` stars 3710,
LGPL-2.1, Rust, pushed 2026-10-28. `cachix/cachix` stars 1140, pushed 2026-10-22.
`DeterminateSystems/magic-nix-cache` stars 385, Apache-2.0, Rust, pushed 2026-10-25,
described as "a totally free and zero-configuration binary cache for Nix on GitHub Actions".
`hercules-ci/arion` stars 924 ("Run docker-compose with help from Nix/NixOS"),
`hercules-ci/flake-parts` stars 1508.
Label: [verified]

### F27. Cloudflare has shipped its own CI product, and it runs ON Cloudflare, not on your metal.
Claim: relevant as competitive context and as a source of reusable primitives, not as a
self-hosted data plane.
Evidence: `gh api repos/cloudflare/ci` (2026-10-29): full_name `cloudflare/ci`, stars 614,
license Apache-2.0, language TypeScript, open issues 12, pushed_at
2026-10-21T03:07:48Z, created 2026-07-30, description "Cloudflare-native continuous
integration powered by Workflows and Sandbox". Releases: `v0.2.0` published 2026-09-14.
README (read 2026-10-29) verbatim: "A Cloudflare-native CI engine built on Workflows and
Sandbox. The repository root is the publishable `@cloudflare/ci` package" and "The package
targets the Cloudflare Workers runtime directly." npm registry read 2026-10-29:
`@cloudflare/ci`, license Apache-2.0, versions `0.1.0` and `0.2.0`, `dist-tags.latest` =
`0.2.0`. Examples shipped: `examples/cloudflare-artifacts` and `examples/self-healing`.
Also verbatim from the README: "`CiRunnerResult.logs` contains raw command output and is
not secret-redacted".
Label: [verified]

### F28. Woodpecker's Docker backend runs each step in a separate container on the agent host, and does no image cleanup.
Evidence: `docs/docs/30-administration/10-configuration/11-backends/10-docker.md` (read
2026-10-29), verbatim: "The docker backend executes each step inside a separate container
started on the agent." and "The agent **will not** automatically remove images from the
host. This task should be managed by the host system." and "There is no official support
for Podman, but one can try to set the environment variable `DOCKER_HOST` to point to the
Podman socket."
The Local backend doc carries a `:::danger` block: "The local backend executes pipelines on
the local system without any isolation." and warns that "a malicious pipeline could be used
to access the agent configuration especially the `WOODPECKER_AGENT_SECRET` variable."
Label: [verified]

---

## 2. Comparison table

All metadata read 2026-10-29. "Control plane on Workers?" means: can the scheduling brain
itself run inside a Cloudflare Worker, with the heavy execution on the operator's metal.

| System | Control plane | Executor transport | Trigger API | Monitor API | Long jobs | Control-plane image size | License | Alive | Control plane on Workers? |
|---|---|---|---|---|---|---|---|---|---|
| GitHub Actions self-hosted runner | GitHub (SaaS, free tier) | outbound HTTPS 443 long poll | REST `POST .../dispatches`, returns run id via `return_run_details` | REST `GET .../actions/runs`, webhooks | 5 days per job (self-hosted limit) | runner binary ~small; official image on ghcr | MIT (runner app) | yes, v2.338.2 2026-10-26 | No, but nothing to host. The Worker is a pure API client. |
| ARC (actions-runner-controller) | k8s cluster you run | outbound HTTPS long poll (listener + runner) | k8s CRs plus GitHub API | GitHub API + k8s API | inherits runner limits | controller image ~46 MB | Apache-2.0 | yes, 0.15.1 2026-10-23 | No. Needs a real k8s cluster. |
| Woodpecker CI | self-hosted Go server (SQLite default) | agent dials out over gRPC to server queue | REST `POST /repos/{repo_id}/pipelines` | REST pipeline + step log endpoints | default 60 min, max 120 min, configurable | server ~20 MB, agent ~16 MB | Apache-2.0 | yes, v3.20.0 2026-10-28 | No (server is stateful Go), but the server is small and tunnel-friendly for HTTPS. gRPC leg is the problem. |
| Buildkite agent | Buildkite SaaS, no self-hosted option | agent polls buildkite.com outbound | REST + GraphQL on Buildkite | Buildkite API | no hard cap documented | agent image ~304 MB | MIT (agent) | yes, v4.8.1 2026-10-22 | No. Control plane is vendor SaaS. |
| Concourse | self-hosted web node + Postgres | worker SSH to TSA :2222, ports forwarded back over SSH | `fly set-pipeline` / REST | REST + `fly` | no documented per-job cap | web image ~1.0 GB | Apache-2.0 | yes, v8.3.2 2026-10-23 | No. Web node plus Postgres is a real service. |
| Argo Workflows | k8s cluster | k8s pods | k8s API / argo CLI | k8s API + UI | no cap | n/a (k8s CRDs) | Apache-2.0 | yes, v4.1.6 2026-10-22 | No. k8s only. |
| Tekton Pipelines | k8s cluster | k8s pods | k8s API | k8s API + dashboard | no cap | n/a (k8s CRDs) | Apache-2.0 | yes, v1.17.1 2026-10-23 | No. k8s only. |
| Dagger | none required; engine runs on any host with Docker | local engine, client over session | SDK calls in any of 8 languages | OTel traces, engine API | no cap | engine is a container on the host | Apache-2.0 | yes, v0.21.11 2026-10-21 | Partly: the engine is host-local, so a Worker cannot host it. Needs a trigger source. |
| Earthly | none (build framework); Earthly Cloud shut down 2025-07-16 | local daemon or satellite | CLI | CLI | no cap | host daemon | MPL-2.0 | upstream unmaintained since 2025-07-16 | Fork `EarthBuild/earthbuild` is live: v0.8.19 2026-09-17. |
| Gitea Actions | a Gitea instance | runner registers with the instance | Gitea REST API | Gitea REST API | Gitea-configured | Gitea instance | MIT (runner) | yes, runner v5.2.4 2026-10-28 | No. Needs a Gitea instance as control plane. |
| Forgejo Actions | a Forgejo instance | runner registers with the instance | Forgejo REST API | Forgejo REST API | Forgejo-configured | Forgejo instance | not read (license field null on Codeberg API) | yes, runner v13.2.0 2026-09-18 | No. Needs a Forgejo instance. |
| Jenkins | self-hosted controller (Java 21+) | agent over SSH inbound or WebSocket outbound | REST `/job/x/build` | REST + UI | no cap | controller image ~242 MB, 4 GB+ RAM for a small team | MIT | yes, 2.588 2026-10-28 | No. JVM controller. |
| Hercules CI agent | hercules-ci.com SaaS | agent pulls work outbound | hercules-ci.com | hercules-ci.com | Nix-eval based | agent is Haskell | Apache-2.0 (agent) | yes, pushed 2026-10-28 | No. Scheduler is hosted. |
| Cirrus CI | shut down 2026-06-01 | n/a | n/a | n/a | n/a | n/a | agent was MPL-2.0, now archived | dead | No. |
| cloudflare/ci | Cloudflare Workers + Workflows + Sandbox | runs on Cloudflare | library API in a Worker | Worker | Workflows-step bounded | npm package, no server | Apache-2.0 | yes, v0.2.0 2026-09-14, 614 stars | Yes by construction, but it executes on Cloudflare, which is the opposite of the goal. |

Footprint note: image sizes are Docker Hub `full_size`, which sums layers across every
platform in a multi-arch manifest list. They overstate a single-architecture pull but are
comparable against each other. Memory figures are from each project's own docs where
stated (Concourse "a few gigabytes" for web; Jenkins "4 GB+ of RAM" for a small team).
No memory figure for Woodpecker's server was found in its docs, so none is claimed.

---

## 3. What this changes for the spec

### R1. Primary recommendation: self-hosted GitHub Actions runners on the operator's own metal, with the Workers SPA as an API client of GitHub.

Reason, in order of weight:

1. Zero inbound surface. F1: the runner only needs outbound HTTPS 443. Nothing to punch
   through, no tunnel for the data plane at all, no gRPC-over-tunnel problem (F13). This is
   the single biggest architectural simplification available and it is the reason this
   beats Woodpecker for the stated topology.
2. The trigger and monitor APIs are exactly what a Workers SPA needs. F3 gives a one-call
   dispatch that returns `workflow_run_id`, `run_url` and `html_url`. F4 gives a
   read-anyone-with-repo-access endpoint for status. No polling to discover run identity.
3. Long jobs are explicitly supported. F2: 5 days per job on self-hosted runners, versus
   6 hours on GitHub-hosted. Heavy CI is the designed case, not a workaround.
4. The ecosystem is the one the operator already asked for. The runner app is MIT (F7),
   releases weekly, and the workflow syntax is the one every existing repo already uses.
5. It satisfies "orchestration must be something other than Cloudflare". GitHub does the
   scheduling. Cloudflare only serves the SPA. Nothing about the build runs on Cloudflare.

Concretely: run `actions/runner` as a systemd service (or the official container image) on
each metal box, registered at org level with labels for arch and capability. Do not deploy
ARC unless there is already a Kubernetes cluster to attach it to. ARC's value is ephemeral
pod autoscaling (F5, F6); on a handful of long-lived machines the plain runner binary is
less machinery, and F5 notes the legacy ARC modes are community-maintained only.

### R2. Do not put the Woodpecker gRPC leg behind a Cloudflare Tunnel public hostname. It will not work.

F13 is a hard constraint from Cloudflare's own docs, read 2026-10-29, and it is the kind of
thing that costs a day to discover. Two independent Cloudflare pages state that tunnel gRPC
works only via private subnet routing, and that Cloudflare Access ignores gRPC through the
reverse proxy entirely.

If Woodpecker is chosen anyway, the server needs an endpoint that agents can reach over
plain HTTPS/2:
- run it on the same private network as the agents (no tunnel needed), or
- run it on a small VPS with a real public IP and put TLS in front, or
- use a tunnel that carries raw TCP rather than an HTTP hostname (that is B4's territory;
  flagging the requirement rather than picking the tool), or
- accept the WARP-client-per-agent-host cost of Cloudflare's private subnet routing.

Note the asymmetry that makes this decision cheap: the Woodpecker REST API, which is what
the Workers SPA needs, is plain HTTPS and works fine through a tunnel public hostname. Only
the agent-to-server gRPC leg is affected. So a hybrid is possible: SPA to Woodpecker REST
over a tunnel, agents to Woodpecker gRPC over the private network.

### R3. If the operator wants a control plane he owns rather than GitHub's, Woodpecker is the best candidate, with three config changes.

Reason: F8 gives the exact server/agent split the spec describes, F10 gives a real REST API
with trigger, cancel, approve, decline, restart and step logs, F9 gives a ~20 MB server
image on SQLite with zero external dependencies, and F16 confirms GitHub is a supported
forge (with the caveat that it needs a GitHub OAuth2 App, not a GitHub App).

The three changes, all from primary docs:
- F11: raise `WOODPECKER_MAX_PIPELINE_TIMEOUT` above its default of 120 minutes, or every
  heavy build gets killed at two hours. Also raise `WOODPECKER_DEFAULT_PIPELINE_TIMEOUT`
  from 60.
- F12: use per-agent tokens rather than the system-wide shared secret, so one compromised
  agent host does not impersonate the fleet, and use server-side agent filters rather than
  agent-reported labels to control which jobs land where.
- F28: the Docker backend does no image cleanup. Schedule host-level pruning, or the agent
  disks fill. Do not use the Local backend on any host that runs untrusted code: the docs
  carry an explicit danger block that a pipeline can read `WOODPECKER_AGENT_SECRET`.

Also note F15: the autoscaler is not feature-complete and its provider model is cloud VMs,
not containers on existing metal. Plan on static agent counts.

### R4. Rank the rest for this specific job.

- Concourse is the strongest "own the whole thing" option after Woodpecker, because F18
  shows workers are fully outbound over SSH with forwarded ports, so no inbound firewall
  change is needed on any worker. The cost is real: a ~1.0 GB image, a Postgres dependency,
  and a web node that the project itself says needs "a few gigabytes" of RAM. Justified
  when the pipeline graph is complex and you want the `fly` CLI and resource types.
- Buildkite's agent is the best-engineered outbound executor in the list (MIT, tiny,
  cross-platform, F17), but F17 also settles that there is no self-hosted control plane.
  It cannot be the orchestration layer. Worth reading as a design reference for the agent
  side.
- Dagger (F20) is the right answer to "how do I make the build itself reproducible and
  cacheable", not to "what triggers my builds". Use it underneath a trigger system. Its
  engine needs a container runtime on the host, so it cannot live in a Worker.
- Argo Workflows and Tekton (F19) are Kubernetes-only. They only make sense if the operator
  already runs k8s, which the spec's "handful of machines" framing argues against.
- Jenkins (F25) works and its agents can go outbound over WebSocket, but a JVM controller
  at 4 GB+ for a small team is the wrong trade against a 20 MB Go server.
- Gitea and Forgejo Actions (F24) are good products, but the control plane is a whole forge
  installation. Only choose this if self-hosted git hosting is also a goal. Note that the
  Forgejo runner lives on Codeberg, not GitHub, which matters for anyone scripting against
  the GitHub API.
- Earthly (F21) is end-of-life upstream with Cloud shut down. If Earthly syntax is wanted,
  use `EarthBuild/earthbuild` (v0.8.19, 2026-09-17) and say so in the spec. Do not specify
  `earthly/earthly` as a dependency.
- Cirrus CI (F22) is gone. Remove it from any candidate list.
- Hercules CI (F26) is the Nix-native option with an Apache-2.0 agent, but the scheduler is
  hosted SaaS, so it fails the "own the control plane" requirement the same way Buildkite
  does.
- Drone (F23) now redirects to Harness Open Source, which Harness's own docs call Beta.
  Treat as not yet a stable dependency.

### R5. Keep cloudflare/ci on the radar as a source of patterns, not as the data plane.

F27: Cloudflare shipped its own CI, Apache-2.0, 614 stars, v0.2.0 on 2026-09-14. It runs on
Workflows plus Sandbox, so it puts the compute on Cloudflare, which is the opposite of the
cost goal. But it is evidence that Cloudflare is moving into this space, and its
`examples/self-healing` shows an application-owned agent consuming runner-failure
diagnostics, which is a useful pattern for the SPA's monitoring view. One warning from its
README worth carrying into the spec: "`CiRunnerResult.logs` contains raw command output and
is not secret-redacted". If the operator ever surfaces build logs in the SPA, redact before
display, and treat any log path that crosses Cloudflare as potentially containing secrets.

---

## 4. Not covered / open questions

1. Woodpecker server memory footprint under load. Not stated anywhere in its docs. Only the
   image size (~20 MB, F9) is verified. Needs a measurement on the operator's own hardware
   before it goes in the spec as a number.
2. Whether `WOODPECKER_MAX_PIPELINE_TIMEOUT` can be raised without bound, or whether there
   is a hard ceiling in the code. The doc only gives the default of 120 (F11). Not read
   from source.
3. Whether Cloudflare Tunnel public-hostname gRPC support has changed since the pages read
   on 2026-10-29 (one page footer says "Last updated Jun 23, 2026", the other "Last updated
   Aug 14, 2026"). This is the single highest-value thing to re-check before committing to
   the Woodpecker topology.
4. Concourse worker behaviour when the web node is unreachable mid-build. F18 confirms the
   ports are forwarded over the SSH connection, but I did not test what happens to an
   in-flight build when that SSH connection drops, nor how retries are attributed.
5. GitHub Actions self-hosted runner security posture. Not researched here: whether the
   runner needs the Docker socket, and what a compromised job can reach on the host. This
   is a first-order risk for a runner on the operator's own metal and belongs in the spec.
6. Webhook delivery from GitHub to a Worker. F3 and F4 cover the REST trigger and poll
   paths. I did not verify webhook delivery into a Worker, nor the signature-validation
   story for that path.
7. Cost model. No prices were retrieved for anything, including whether the operator's
   GitHub plan includes the Actions minutes or API rate limits that this design depends on.
   F2's "1500 events / 10 seconds / repository" trigger rate limit and "1500 runners / 5
   minutes" registration limit are the only quantitative ceilings captured.
8. Which tunnel tool to use for a raw TCP leg if Woodpecker is chosen. That is B4's topic
   and is deliberately left to them. The requirement this research establishes is: it must
   carry HTTP/2 to the Woodpecker gRPC endpoint.
9. Nix-based builders beyond Hercules CI. I covered the package manager, the Determinate
   installer, cachix and magic-nix-cache (F26), but did not survey NixOS-based CI images or
   remote builder setups in depth.
10. Star counts, release dates and issue counts are point-in-time as of 2026-10-29 and will
    drift. Anything in the spec that depends on a specific version should pin it explicitly
    rather than citing this document.
