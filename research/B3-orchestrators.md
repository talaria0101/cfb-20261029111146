# B3-orchestrators: Nomad, k3s, k0s, Docker Swarm, Rancher, Talos, Kairos, MicroK8s

Research subagent B3. All sources read 2026-10-29 (date read from the machine: `date -u` -> Thu Oct 29 11:46 UTC 2026;
every source below carries its own read timestamp where the gateway reported one, all 2026-10-29).

Method: pkgforge tinyfish gateway for search and page reads, `gh api` for GitHub metadata and file contents, plus
`curl -I` against releases.hashicorp.com for one artifact size. No fallback to the built-in web_search/web_fetch
tools was needed for any claim in this document. Two `web_fetch` calls were made against
developer.hashicorp.com/nomad/api-docs/event-stream and .../concepts/acl-policies and both returned HTTP 404; I
found the correct URLs (api-docs/events) through tinyfish search and read those instead. No finding below rests on
those two failed fetches.

Scope note: this topic asks for a comparison of these eight orchestrators "for the specific job of running
long-lived containers plus CI on a handful of machines, driven remotely over a tunnel", including "the API surface,
HA model, footprint, and what breaks when the control plane is off-cluster". Findings are grouped accordingly.

## 0. Source of truth block (GitHub metadata, read 2026-10-29)

Command pattern: `gh api repos/OWNER/REPO --jq '{full_name,stargazers_count,license:.license.spdx_id,pushed_at,language,open_issues_count}'`
and `gh api repos/OWNER/REPO/releases --jq '.[0:4]|.[]|{tag_name,published_at,prerelease}'`.

| owner/repo | stars | forks | open issues | license (API) | license (LICENSE file) | language | pushed_at | latest stable release |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hashicorp/nomad | 17057 | 2152 | 1626 | NOASSERTION | BUSL 1.1, licensor IBM | Go | 2026-10-28T20:59:19Z | v2.1.0, 2026-10-28T18:00:35Z |
| k3s-io/k3s | 34274 | 2769 | 86 | Apache-2.0 | Apache-2.0 | Go | 2026-10-29T07:01:02Z | v1.37.1+k3s1, 2026-09-30T16:10:38Z |
| k0sproject/k0s | 6556 | 536 | 271 | NOASSERTION | Apache-2.0 (code), CC-BY-SA-4.0 (docs/) | Go | 2026-10-29T10:39:35Z | v1.37.1+k0s.0, 2026-10-27T12:21:30Z |
| moby/moby | 72225 | 19268 | 3956 | Apache-2.0 | Apache-2.0 | Go | 2026-10-29T10:02:23Z | docker-v29.9.2, 2026-10-20T20:51:17Z |
| moby/swarmkit | 3652 | 678 | 203 | Apache-2.0 | Apache-2.0 | Go | 2026-10-16T17:40:18Z | (no GitHub releases) |
| rancher/rancher | 26020 | 3225 | 3411 | Apache-2.0 | Apache-2.0 | Go | 2026-10-29T11:18:15Z | v2.15.2, 2026-09-23T21:02:27Z |
| siderolabs/talos | 11429 | 937 | 302 | MPL-2.0 | MPL-2.0 | Go | 2026-10-29T11:45:54Z | v1.14.5, 2026-10-26T15:31:11Z |
| kairos-io/kairos | 1858 | 153 | 566 | Apache-2.0 | Apache-2.0 | Go | 2026-10-29T03:52:37Z | v4.4.0, 2026-10-26T14:27:15Z |
| canonical/microk8s | 9377 | 834 | 158 | Apache-2.0 | Apache-2.0 | Python | 2026-10-29T10:09:23Z | v1.36, 2026-05-25T06:56:13Z |
| rancher/rke2 | 2380 | 355 | 124 | Apache-2.0 | Apache-2.0 | Go | 2026-10-29T11:12:41Z | v1.37.1+rke2r1, 2026-09-30T16:49:06Z |
| siderolabs/omni | 1419 | (not fetched) | 204 | NOASSERTION | BUSL 1.1, licensor Sidero Labs | Go | 2026-10-29T10:41:21Z | v1.13.0, 2026-10-28T19:07:20Z |

Two API license fields report NOASSERTION because the LICENSE files are multi-section or non-SPDX; the actual
license text was read from the file in each case (see F2, F22, F54).

Release recency summary (all [verified]): every project above except MicroK8s and SwarmKit shipped a stable
release inside the last 5 weeks. MicroK8s's last stable GitHub release is 5 months old (F49). SwarmKit has no
GitHub releases at all; it is released as part of Docker Engine (F31).

## 1. Findings

### Nomad (hashicorp/nomad)

#### F1. What Nomad is [verified]
A workload orchestrator, not a Kubernetes distribution. Per its own architecture docs, within a region there are
servers and clients: servers accept jobs, manage clients, and compute task placements; clients register their
resources and execute task drivers. The data model has five nouns: jobs, nodes, allocations, deployments,
evaluations. Regions are fully independent and are federated only by WAN gossip; data is not replicated between
regions. Description from the API: "Nomad is an easy-to-use, flexible, and performant workload orchestrator that
can deploy a mix of microservice, batch, containerized, and non-containerized applications."
Evidence: https://developer.hashicorp.com/nomad/docs/architecture (fetched 2026-10-29T11:51:40Z);
`gh api repos/hashicorp/nomad`.

#### F2. Nomad is BUSL 1.1 and the licensor is now IBM [verified]
The LICENSE file is the Business Source License 1.1. Licensor: "International Business Machines Corporation (IBM)".
Licensed Work: "Nomad Version 1.7.0 or later. The Licensed Work is (c) 2024 IBM Corp." The Additional Use Grant
permits production use only where it does not include "offering the Licensed Work to third parties on a hosted or
embedded basis in order to compete with IBM Corp's paid version(s)". HashiCorp's own docs page states plainly:
"Nomad Community Edition (CE) is licensed under the Business Source License (BSL / BUSL)." This is source-available,
not open source. The GitHub license API reports NOASSERTION because the file is not an SPDX-recognised license.
Evidence: `gh api repos/hashicorp/nomad/contents/LICENSE` (first 20 lines read);
https://developer.hashicorp.com/nomad/docs/ce-license-support (fetched 2026-10-29T11:47:41Z).

#### F3. Nomad 2.x line, V.M.F versioning, and support windows [verified]
Latest stable is v2.1.0 (2026-10-28T18:00:35Z). v2.0.0 shipped 2026-04-21. From 2.0.0 the versioning scheme moved
from X.Y.Z to IBM's Version-Modification-Fix model: April = new support lifecycle, October = new features without
a new lifecycle, monthly = fixes. Support table from HashiCorp: 1.8.x (LTS) ended 2026-04-30; 1.10.x (LTS) ends
2027-04-30; 1.11.x ends 2026-10-31; 2.0.x base support ends 2028-04-30 (extended 2029, ongoing extended 2032).
Extended support is a paid Enterprise add-on. From 2.0.0 there is a 2-year base CE backport policy for security
and bug fixes. Feature releases target Spring and Fall with monthly updates as needed.
Evidence: `gh api repos/hashicorp/nomad/releases`; the release notes body for v2.1.0 and v2.0.0;
https://developer.hashicorp.com/nomad/docs/ce-license-support.

#### F4. Nomad's API surface is a complete REST API plus a generated Go client [verified]
"Nomad exposes a RESTful HTTP API to control almost every aspect of the Nomad agent." All routes are prefixed
`/v1/`. Default port 4646. Authentication is by ACL token in the `X-Nomad-Token` header or RFC6750 Bearer. The
`api/` package in the repo is a full Go client: it contains roughly 90 source files covering ACLs, agents,
allocations, allocations_exec, batch_job_queue (new), CSI, deployments, evaluations, event_stream, fs, host_volumes,
jobs, keyring, locks, namespaces, node_identity, node_meta, node_pools, nodes, operator, operator_autopilot,
operator_metrics, regions, resources, retry, scaling, search, sentinel, services, status, system, task_sched,
tasks, variables. Nomad also ships a web UI (an Ember app under `ui/`), and the v2.1.0 notes contain UI fixes.
One breaking change in 2.1.0 matters for automation: "Server join via the CLI or API now requires `agent:write`
permission."
Evidence: https://developer.hashicorp.com/nomad/api-docs (fetched 2026-10-29T11:48:13Z);
`gh api repos/hashicorp/nomad/contents/api`; `gh api repos/hashicorp/nomad/contents/ui`;
`gh api repos/hashicorp/nomad/releases/tags/v2.1.0`.

#### F5. Nomad has a resumable ndjson event stream, which is the right primitive for a Workers SPA [verified]
`GET /v1/event/stream` streams a server's backlog of events plus new events as they occur, kept alive until the
connection closes, in ndjson (one JSON object per line, possibly several events per object, heartbeats when
empty). It takes an `index` parameter to resume from a specific index, and `topic` filters of the form
`topic:filter_key`, for example `?topic=Deployment:redis`. ACLs are per topic: `*` and `NodePool` and the ACL
topics need `management`; `Allocation`, `Deployment`, `Evaluation`, `Job`, `Service` need `namespace:read-job`;
`Node` needs `node:read`; `Variable` needs `namespace:* variable:list`. This is a purpose-built tail-and-follow
feed for a dashboard.
Evidence: https://developer.hashicorp.com/nomad/api-docs/events (fetched 2026-10-29T11:56:43Z).

#### F6. Nomad's task drivers cover containers and non-containers in one scheduler [verified]
Bundled drivers: Docker, Isolated Fork/Exec, Java, QEMU, Raw Fork/Exec. Installable plugin drivers: Exec2, Podman,
Virt, QEMU, plus community drivers. HashiCorp's own note: "Task driver resource isolation provides a degree of
separation ... Task drivers include various security-related controls but do not use the Nomad client-to-task
interface as a security boundary." Relevant if the control plane lets end users submit jobs.
Evidence: https://developer.hashicorp.com/nomad/docs/deploy/task-driver (fetched 2026-10-29T11:53:59Z).

#### F7. Parameterized jobs and dispatch are a ready-made CI job primitive [verified]
A `parameterized` block turns a job into a function: `nomad job dispatch` (or the equivalent HTTP API) invokes it
with an opaque payload and metadata. `payload = "required"`, `meta_required`, `meta_optional`; tasks declare a
`dispatch_payload` block to receive the payload at a filesystem path, and meta values interpolate into task
arguments. Each dispatch mints a unique job ID, giving the caller a handle to track status. A dispatched job cannot
be updated; the parent job must be updated instead. This maps almost one-to-one onto "CI run submitted by a SPA,
polled for status".
Evidence: https://developer.hashicorp.com/nomad/docs/job-specification/parameterized (fetched 2026-10-29T11:57:37Z).

#### F8. Nomad's HA model: Raft servers per region, quorum arithmetic, no cross-region replication [verified]
Each region has one server consensus group. "Each region is expected to have either three or five servers" and the
reference architecture says no more than seven. Quorum is `floor(count(members)/2)+1`, so 2 of 3 or 3 of 5. Leader
loss triggers a new election; follower loss has no immediate impact but must leave quorum for a future leader
failure. Servers are expected to be in a "high bandwidth, low latency network" with "below 10 millisecond latencies
between cluster members". Clients are the unconstrained half: they may be "multi-cloud, on-prem, virtual, bare
metal" as long as they are reachable and can receive job requests from the servers. WAN federation is on port 4648.
Evidence: https://developer.hashicorp.com/nomad/docs/architecture;
https://developer.hashicorp.com/nomad/docs/deploy/production/reference-architecture (fetched 2026-10-29T12:00:34Z).

#### F9. Nomad server sizing is heavy, and HashiCorp publishes no minimum [verified]
Reference architecture table: Small server = 2-4 core, 8-16 GB RAM, 50 GB disk (AWS m5.large/m5.xlarge);
Large = 8-16 core, 32-64 GB RAM, 100 GB disk (m5.2xlarge/m5.4xlarge). "For large workloads, ensure that the disks
support a high number of IOPS to keep up with the rapid Raft log update rate." On minimums, a HashiCorp staff
answer in the forum: "We don't provide any minimum requirements because we don't actively test Nomad in
low-powered clusters."
Evidence: reference-architecture page (sizing table and HA section); HashiCorp forum thread
https://discuss.hashicorp.com/t/what-are-the-minimum-requirements-for-a-cloud-on-ec2-micro-for-example-and-do-you-need-a-load-balance/33026/2
(fetched 2026-10-29T12:02:53Z).

#### F10. What breaks when the control plane is off-cluster: the `disconnect` block [verified]
This is the single most important Nomad finding for the spec. By default, with no `disconnect` block, "if an
allocation is on a node that misses heartbeats, the allocation will be marked `lost` and will be replaced." A
`disconnect` block changes this: `lost_after` (duration the client attempts reconnection; allocations go to
`unknown` state until then, default is equivalent to 0s), `replace` (bool, default true, only meaningful with
`lost_after`), and `stop_on_client_after` (duration after which a disconnected client stops its allocations;
the client process must be running for this to happen). `lost_after` and `stop_on_client_after` are mutually
exclusive. The block is ignored on drain and on reschedule. Practical reading for the spec: if the SPA-driven
control plane goes away behind a dead tunnel, long-lived containers keep running on the client, but nothing new
gets scheduled, and by default Nomad will declare them lost and replace them elsewhere rather than wait.
Evidence: https://developer.hashicorp.com/nomad/docs/job-specification/disconnect (fetched 2026-10-29T11:51:46Z).

#### F11. Nomad has a live privilege-escalation CVE that matters if the SPA accepts user job specs [verified]
CVE-2026-14373, published 2026-07-08 to NVD, CVSS 7.7, CWE-862 missing authorization. The Nomad Docker task driver
does not enforce the `allow_privileged` restriction when a job requests host namespace modes: `network_mode`,
`pid_mode`, `ipc_mode`, or `userns_mode` set to `host`. An authenticated job submitter can therefore run a
container in the host namespace and read host or co-tenant data, with no user interaction, traversing the Nomad
API over the network. Fixed in Nomad CE 2.0.4 and Enterprise 2.0.4 / 1.11.8 / 1.10.14. Tracked as HashiCorp
advisory HCSEC-2026-19. Detection advice is explicitly to audit `/v1/jobs` and `/v1/job/{id}` for submissions
containing host namespace modes.
Evidence: https://www.sentinelone.com/vulnerability-database/cve-2026-14373/ (fetched 2026-10-29T11:47:53Z).
The repo's own `security-advisories` endpoint returned empty for hashicorp/nomad, so the advisory text above is a
single secondary source: [unverified as to the exact CVSS vector string and the HCSEC id, verified as to
existence, severity class, affected versions and fix versions, which are also consistent with the release
history].

#### F12. Nomad's own docs push you toward Consul [verified]
The production reference architecture opens: "This document describes deploying a Nomad cluster in combination
with, or with access to, a Consul cluster. We recommend the use of Consul with Nomad to provide automatic
clustering, service discovery, health checking and dynamic configuration." Nomad to Consul connectivity is over
HTTP and should be TLS-secured with a Consul token. So a Nomad control plane is really a Nomad plus Consul
footprint unless you deliberately decline service discovery.
Evidence: https://developer.hashicorp.com/nomad/docs/deploy/production/reference-architecture.

#### F13. The "single 35 MB binary" claim about Nomad is not true for current releases [verified refutation]
A widely repeated figure (Portainer's 2026 orchestration roundup calls Nomad a "single 35MB binary") does not
match the artifact. `curl -I` on
https://releases.hashicorp.com/nomad/2.1.0/nomad_2.1.0_linux_amd64.zip returns HTTP 200 with
content-length: 60938603, i.e. 60.9 MB compressed before decompression. GitHub release assets for Nomad are empty
(`gh api repos/hashicorp/nomad/releases/tags/v2.1.0 --jq '.assets|length'` -> 0), so the binary is only
distributed from releases.hashicorp.com.
Evidence: `curl -I https://releases.hashicorp.com/nomad/2.1.0/nomad_2.1.0_linux_amd64.zip`;
`gh api repos/hashicorp/nomad/releases/tags/v2.1.0 --jq '.assets|length'`.

### k3s (k3s-io/k3s)

#### F14. What k3s is and what it bundles [verified]
Lightweight Kubernetes, Apache-2.0, Go, single binary. A server node runs `k3s server` and holds control-plane and
datastore components; an agent runs `k3s agent` with neither. Both run the kubelet, container runtime and CNI.
Packaged components (from the resource-profiling baseline): Traefik Ingress, Klipper lb, local-path storage, plus
per third-party summaries containerd, Flannel, CoreDNS, Spegel (distributed registry mirror). Minimum requirements
are 2 cores / 2 GB for a server and 1 core / 512 MB for an agent, excluding the workload. Architectures: x86_64,
armhf, arm64. Recommendation: turn off firewalld.
Evidence: https://docs.k3s.io/architecture (fetched 2026-10-29T11:49:03Z);
https://docs.k3s.io/installation/requirements (fetched 2026-10-29T11:49:14Z);
https://docs.k3s.io/reference/resource-profiling (fetched 2026-10-29T11:52:27Z).

#### F15. k3s HA model: embedded etcd for 3+ servers, external datastore for 2+ [verified]
Single server uses embedded SQLite. HA comes in two documented shapes: (a) three or more server nodes with an
embedded etcd datastore, or (b) two or more server nodes with an external datastore such as MySQL, PostgreSQL or
etcd. A set of flags must be identical across all servers (agent-token, cluster-cidr, cluster-dns, cluster-domain,
disable-cloud-controller, disable-helm-controller, disable-network-policy, disable=servicelb,
egress-selector-mode, embedded-registry and more) or new servers fail to join with embedded etcd. A fixed
registration address is used for agent nodes in HA.
Evidence: https://docs.k3s.io/architecture; https://docs.k3s.io/cli/server (fetched 2026-10-29T12:00:44Z).

#### F16. k3s footprint, from the project's own profiling [verified]
Resource profiling table (95th percentile, steady state, on an AWS c6id.xlarge with Intel Xeon Platinum 8375C):
K3s server with a workload = 6% of a core, 1596 MB RAM with Kine/SQLite, 1606 MB with embedded etcd. K3s cluster
with a single agent = 5% of a core, 1428 MB / 1450 MB. K3s agent = 3% of a core, 275 MB either way. On a Pi4B
(BCM2711 1.50 GHz): server with workload 1588/1613 MB, cluster with single agent 1215/1413 MB, agent 268 MB. The
baseline includes Prometheus and Grafana and the Guestbook example app, and excludes system management agents,
logging, image management and workload-specific needs. Server sizing guide from the requirements page: 2 CPU /
4 GB RAM server handles 0-350 agents, 4/8 handles 351-900, 8/16 handles 901-1800, 16+/32 handles 1800+, and
"Ex: 3 server with 4 vCPU/8 GB can scale to ~1200 agents."
Evidence: https://docs.k3s.io/reference/resource-profiling; https://docs.k3s.io/installation/requirements.

#### F17. k3s release cadence and binary size [verified]
Latest stable v1.37.1+k3s1 published 2026-09-30T16:10:38Z, with parallel patch streams v1.36.5+k3s1,
v1.35.9+k3s1 and v1.34.12+k3s1 shipped the same day. Release asset sizes for v1.37.1+k3s1: k3s (amd64)
81,543,330 bytes; k3s-arm64 73,728,162; k3s-armhf 74,711,202. So the "single binary under 100 MB" claim holds.
Evidence: `gh api repos/k3s-io/k3s/releases --jq '.[]|{name,size}'`.

#### F18. k3s agent registration is a websocket through a client-side load balancer in the agent process [verified]
"Agent nodes are registered with a websocket connection initiated by the `k3s agent` process, and the connection
is maintained by a client-side load balancer running as part of the agent process. Initially, the agent connects to
the supervisor (and kube-apiserver) via the local load-balancer on port 6443." The load balancer keeps a dynamic
list of server endpoints seeded from the hostname used at install. This is a long-lived outbound-initiated
connection, which is the property a tunnel needs, but it is websocket-framed and it carries the API server's TLS.
Evidence: https://docs.k3s.io/architecture.

#### F19. `--tls-san` and `--tls-san-security` are the documented fix for the tunnel TLS problem [verified]
`--tls-san` adds additional hostnames or IPv4/IPv6 addresses as Subject Alternative Names on the server TLS cert.
`--tls-san-security` defaults to true and "protects the server TLS cert by refusing to add Subject Alternative
Names not associated with the kubernetes apiserver service, server nodes, or values of the tls-san option." So
adding the tunnel hostname via `--tls-san` is the sanctioned path; there is no blanket disable.
Evidence: https://docs.k3s.io/cli/server.

#### F20. A real, documented k3s-over-Cloudflare-Tunnel failure and its fix [verified]
k3s issue #12535 (opened 2025-06-21, since closed): a user running cloudflared on the k3s server node got
`tls: failed to verify certificate: x509: certificate signed by unknown authority` from kubectl connecting to
`https://k3s.<domain>`. The reported SAN list on
`/var/lib/rancher/k3s/server/tls/serving-kube-apiserver.crt` was `DNS:kubernetes, DNS:kubernetes.default,
DNS:kubernetes.default.svc, DNS:kubernetes.default.svc.cluster.local, DNS:openssl, DNS:localhost, DNS:<hostname>,
IP Address:127.0.0.1, IP Address:::1, IP Address:<node-ip>` and did not contain the tunnel hostname. The issue
asks exactly the spec's question: "the most appropriate and secure method for enabling `kubectl` access from a
local machine to my K3s API server ... whether through Cloudflare Tunnel or other secure means" and which
`service` endpoint to use.
Evidence: https://github.com/k3s-io/k3s/issues/12535 (fetched 2026-10-29T11:53:14Z).

#### F21. Cross-network k3s clusters in practice use a mesh VPN, with the tunnel for ingress only [verified]
A 2026 walkthrough of a k3s HA cluster across mixed public/private networks uses Tailscale on every node
(`--advertise-routes=10.42.0.0/16,10.43.0.0/16`, `flannel-iface: tailscale0`, `node-ip`/`advertise-address` set to
the Tailscale IP, `tls-san` on the Tailscale IP and hostname) and Cloudflare Tunnel only for ingress. The open
ports listed are 6443, 2379, 2380 and 10250. This is practitioner confirmation that the flannel VXLAN overlay and
etcd peer traffic are the hard part, not the API server.
Evidence: https://www.alif.web.id/posts/k3s-cluster-with-cloudflared-tailscale (fetched 2026-10-29T11:52:49Z).

### k0s (k0sproject/k0s)

#### F22. What k0s is, and its license is Apache-2.0 for code [verified]
"k0s - The Zero Friction Kubernetes", Go, single self-extracting statically compiled binary that embeds the
Kubernetes binaries: "Statically compiled, No OS-level dependencies, Requires no RPMs, dependencies, snaps, or any
other OS-specific packaging." The LICENSE file is a multi-section file: content under `docs/` is CC-BY-SA-4.0 and
everything else is Apache License 2.0. The GitHub license API reports NOASSERTION because of the multi-section
header.
Evidence: https://docs.k0sproject.io/v1.37.1+k0s.0/architecture/ (fetched 2026-10-29T11:49:38Z);
`gh api repos/k0sproject/k0s/contents/LICENSE`.

#### F23. k0s isolates the control plane by default, which is a genuine differentiator [verified]
"As a single binary, k0s acts as the process supervisor for all other control plane components. As such, there is
no container engine or kubelet running on controllers by default, which thus means that a cluster user cannot
schedule workloads onto controller nodes." Workers use containerd with runc by default; custom runtimes are
supported. This is the property you would otherwise buy with taints and hope.
Evidence: https://docs.k0sproject.io/v1.37.1+k0s.0/architecture/.

#### F24. k0s datastore: etcd (managed) or kine over SQL [verified]
`spec.storage.type` is documented as: "Type of the data store (valid values: `etcd` or `kine`). Note:
Type `etcd` will cause k0s to create and manage an elastic etcd cluster within the controller nodes." `kine.dataSource`
is a kine data source URL, so MySQL, PostgreSQL, SQLite and dqlite are reachable. `etcd.peerAddress`,
`etcd.externalCluster` (externally managed etcd, which k0s will not set up), `etcd.extraArgs`/`rawArgs` are all
documented. Known limitation from the architecture page: "k0s cannot shrink the etcd cluster. As such, to shut
down the k0s controller on a node that node must first be manually removed from the etcd cluster."
Evidence: https://docs.k0sproject.io/head/configuration/ (fetched 2026-10-29, exact gateway timestamp not captured);
https://docs.k0sproject.io/v1.37.1+k0s.0/architecture/.

#### F25. k0s CLI includes a controller API and keepalived tooling [verified]
`k0s` subcommands: airgap, api ("Run the controller API"), backup, config, controller, ctr (containerd CLI),
docs, etcd, install, keepalived-config, kubeconfig, kubectl, reset, restore, start, status, stop, sysinfo, token,
version, worker. The presence of `k0s api` and `k0s keepalived-config` (VIP management for HA) is directly relevant
to a control plane driven remotely.
Evidence: https://docs.k0sproject.io/v1.37.1+k0s.0/cli/ (fetched 2026-10-29T11:58:46Z).

#### F26. k0s idle footprint: one third-party measurement, marked unverified [unverified]
Portainer's own benchmark (2023, 3 VMs of 1 CPU / 1 GB RAM, `free -m` at idle) measured base OS 167 MB, k0s
658 MB, k3s 750 MB, MicroK8s 685 MB, MicroK8s with HA disabled 526 MB, plain Docker 216 MB. Portainer's conclusion:
none of the lightweight distributions are usable at 1 GB RAM once a real workload is deployed; "you need a node
with at least 2GB of RAM that will operate exclusively as the master node." This is a third-party measurement
from 2023 on a constrained VM, not a vendor figure, and I did not reproduce it.
Evidence: https://www.portainer.io/blog/k0s-vs-k3s (fetched 2026-10-29T11:51:50Z).

### Docker Swarm (moby/moby, moby/swarmkit)

#### F27. Swarm is functional but development has slowed; it is not retired [verified]
Docker's own "Deprecated and retired Docker products and features" page has a SwarmKit entry that reads: "SwarmKit
powers Docker Swarm mode by providing orchestration for container deployments. While Swarm mode remains functional,
development has slowed in favor of Kubernetes-based solutions. Individuals evaluating container orchestration
options should investigate whether SwarmKit meets modern workload requirements." Swarm mode itself is not on the
retired list. The swarmkit repo is still receiving commits (last push 2026-10-16T17:40:18Z; recent commits remove
deprecated grpc.WithInsecure and dead code).
Evidence: https://docs.docker.com/retired/ (fetched 2026-10-29T11:48:38Z);
`gh api repos/moby/swarmkit/commits`.

#### F28. Commercial support for Swarm is committed to 2030, by Mirantis, under MKE 3 [verified]
Mirantis's own blog (2025-07-01, still current on their site): "Swarm will be fully supported through at least 2030
as part of Mirantis Kubernetes Engine 3." MKE 3 is described as a dual-orchestrator (Kubernetes + Swarm) platform
with FIPS 140-2 validated encryption, DISA STIG compliance, and newly added CSI support for stateful workloads.
This is a paid product commitment, not an upstream open-source commitment.
Evidence: https://www.mirantis.com/blog/mirantis-guarantees-long-term-support-for-swarm/ (fetched 2026-10-29T12:01:31Z).

#### F29. Swarm's HA model and bootstrap [verified]
Built on swarmkit. Managers select a single leader to conduct orchestration; workers receive and execute tasks;
a host can be manager, worker, or both. `docker swarm init` designates the node leader manager, configures the
manager to listen on an active network interface on port 2377, starts an internal distributed data store (Raft),
generates a self-signed root CA by default, generates worker and manager join tokens, and creates an `ingress`
overlay network plus a default overlay network. "If a worker node becomes unavailable, Docker schedules that
node's tasks on other nodes."
Evidence: https://docs.docker.com/engine/swarm/swarm-mode/ (fetched 2026-10-29T11:57:15Z);
https://docs.docker.com/engine/swarm/key-concepts/ (fetched 2026-10-29T11:57:25Z).

#### F30. Swarm's API surface is the Docker Engine REST API [verified]
"Docker provides an API for interacting with the Docker daemon (called the Docker Engine API), as well as SDKs for
Go and Python." The versioned API reference lists Swarm, Nodes, Services, Tasks, Secrets and Configs as top-level
endpoint groups, plus network filters scoped `["swarm"|"global"|"local"]` and a container filter `is-task`. The API
is versioned and backward compatible. There is no separate Swarm API to learn.
Evidence: https://docs.docker.com/reference/api/engine/ (fetched 2026-10-29T11:59:13Z);
https://docs.docker.com/reference/api/engine/version/v1.47/.

#### F31. Moby is on Docker 29.x [verified]
Latest moby release tag docker-v29.9.2 published 2026-10-20T20:51:17Z, preceded by v29.9.1 (2026-10-14) and
v29.9.0 (2026-10-08). Portainer's 2026 Swarm post notes "the Docker 29 release breaking compatibility with a
significant slice of legacy tooling".
Evidence: `gh api repos/moby/moby/releases`; https://www.portainer.io/blog/docker-swarm-still-works-but-does-it-still-have-a-future
(fetched 2026-10-29T11:48:52Z).

### Rancher (rancher/rancher)

#### F32. Rancher is a management platform on top of Kubernetes, not an orchestrator [verified]
Rancher is deployed via Helm onto an underlying Kubernetes cluster, and "host container runtime requirements are
determined by that cluster's distribution". The Rancher Management Server must run on Linux (x86_64, ARM64, or
mixed), the cluster must have the aggregation API layer configured for Rancher's extension API, and the docs
recommend RKE2 and K3s with embedded containerd. So Rancher adds a second cluster to run, on top of the cluster
that runs your workloads.
Evidence: https://ranchermanager.docs.rancher.com/getting-started/installation-and-upgrade/installation-requirements/
(fetched 2026-10-29T11:50:24Z).

#### F33. Rancher's own footprint starts at 4 vCPU / 16 GB per node [verified]
Hardware requirements for the RKE2 cluster that hosts the Rancher server: Small = max 150 clusters / 1500 nodes,
4 vCPUs, 16 GB RAM. Medium = 300 / 3000, 8 vCPUs, 32 GB. Large = 500 / 5000, 16 vCPUs, 64 GB. "A highly available
setup with at least three nodes is required for production." The docs also note firewalld must be disabled on
nodes and NTP must be active on all hosts. This is the heaviest footprint in this comparison by a wide margin.
Evidence: same installation-requirements page.

#### F34. Rancher already implements the off-cluster control plane over a tunnel [verified]
This is the strongest prior art in the whole topic. Per SUSE's Rancher Manager architecture docs: "Each downstream
user cluster has a cluster agent, which opens a tunnel to the corresponding cluster controller within the Rancher
server." There is one cluster controller and one cluster agent per downstream cluster. The `cattle-cluster-agent`
runs in the downstream cluster, connects to its Kubernetes API, manages workloads and deployments, applies roles
and bindings, and "communicates between the cluster and Rancher server (through a tunnel to the cluster controller)
about events, stats, node info, and health". A `rancher-system-agent` daemon runs on every node of RKE2/K3s clusters
for lifecycle operations such as version upgrades and etcd snapshots, and supports "both local and remote plans".
Baseline resource requests recommended for the cluster agent: CPU 50m, memory 100Mi.
Evidence: https://documentation.suse.com/cloudnative/rancher-manager/v2.15/en/about-rancher/architecture/communicating-with-downstream-clusters.html
(fetched 2026-10-29T11:58:20Z);
https://github.com/rancher/rancher-docs/blob/main/docs/how-to-guides/new-user-guides/launch-kubernetes-with-rancher/about-rancher-agents.md
(fetched 2026-10-29T11:58:34Z).

#### F35. Rancher's documented answer to "Rancher is down" is the Authorized Cluster Endpoint [verified]
"An authorized cluster endpoint (ACE) allows users to connect to the Kubernetes API server of a downstream cluster
without having to route their requests through the Rancher authentication proxy." Two stated reasons: to access a
downstream cluster while Rancher is down, and to reduce latency when the Rancher server and the downstream cluster
are far apart. ACE is available on RKE2 and K3s clusters only, not on hosted providers like EKS. A `kube-api-auth`
microservice provides webhook authentication for it. Rancher's own authentication proxy works by impersonating a
per-user service account in the downstream cluster.
Evidence: same SUSE architecture page.

#### F36. Rancher is very actively maintained [verified]
Latest stable v2.15.2 (2026-09-23T21:02:27Z), with parallel maintenance streams v2.14.6, v2.13.10, v2.12.14,
v2.11.18 all released the same day, and v2.15.3-rc2 cut 2026-10-28. Commits land the same day I read the repo
(2026-10-29T08:25:07Z "Rework airgap tool to avoid CGO dependency"), and a `[2.16]` branch is already taking
changes. 3411 open issues is the highest count in this table, consistent with a large enterprise user base.
Evidence: `gh api repos/rancher/rancher/releases`; `gh api repos/rancher/rancher/commits`.

### Talos (siderolabs/talos)

#### F37. What Talos is [verified]
"Talos Linux is a modern Linux distribution built for Kubernetes." Immutable filesystem, minimal packages, secure
by default, and managed by "a single, declarative gRPC API". It runs the Kubernetes control plane components
including etcd. MPL-2.0. It "can be deployed anywhere you can run a modern Linux kernel."
Evidence: https://docs.siderolabs.com/talos/v1.14/overview/what-is-talos (fetched 2026-10-29T11:49:48Z);
`gh api repos/siderolabs/talos`.

#### F38. Talos has no SSH, and its API surface is the whole management plane [verified]
`talosctl` exposes, among others: apply-config, bootstrap, cgroups, cluster create/destroy/logs/reboot/show/sync,
config (endpoint/node/context/proxy-url), conformance, containers, copy, dashboard, debug, dmesg, edit, etcd
(alarm, defrag, downgrade, forfeit-leadership, leave, members, remove-member, snapshot, status), events, gen (ca,
config, crt, csr, key, keypair, secrets, secureboot), get, health, image (cache-cert-gen, cache-create,
cache-serve, k8s-bundle, list, pull, remove, talos-bundle), inject (serviceaccount), inspect dependencies,
kubeconfig, list, logs, machineconfig (gen, patch), memory, meta (delete, write), mounts, netstat, patch, pcap,
processes, read, reboot, remote-provision-launch, reset, restart, rollback, rotate-ca, service, shutdown, stats,
support, time, upgrade, upgrade-k8s, usage, validate, version, wipe (disk, lv, md, pv, vg). That is a
declarative, scriptable OS management API with no shell in it.
Evidence: https://docs.siderolabs.com/talos/v1.14/reference/cli (fetched 2026-10-29T11:54:16Z).

#### F39. Talos's gRPC API cannot be put behind an HTTP proxy; it needs a TCP load balancer [verified]
Direct quote from Talos's production notes: "If your nodes are behind a firewall, in a private network, or
otherwise not directly reachable, you would need to configure a load balancer to forward TCP port 50000 to reach
the nodes for Talos API access. Note: Because the Talos Linux API uses gRPC and mutual TLS, it cannot be proxied
by a HTTP/S proxy, but only by a TCP load balancer." Same page, on the Kubernetes endpoint: "You cannot use a HTTP
load balancer, because the Kubernetes API server handles TLS termination and mutual TLS authentication." The
documented alternatives are a dedicated TCP LB on 6443 or multiple A/AAAA records pointing at all control planes.
Evidence: https://docs.siderolabs.com/talos/v1.14/getting-started/prodnotes (fetched 2026-10-29T11:55:18Z).

#### F40. SideroLink is Talos's own answer to unreachable nodes, and it is point-to-point only [verified]
"SideroLink offers a secure point-to-point management overlay network for Talos clusters using Wireguard. Each
Talos machine configured with Sidero Link establishes a secure Wireguard connection to the SideroLink API server."
It uses ULA IPv6 addresses so machines are manageable "even when direct access to their IP addresses is not
feasible". URL format `https://siderolink.api/?jointoken=token&grpc_tunnel=true`; `grpc://` means no TLS;
`grpc_tunnel=true` tunnels WireGuard over the same SideroLink gRPC connection instead of plain UDP, for
UDP-restricted environments, at "significant overhead". "When SideroLink is configured, the Talos maintenance mode
API listens exclusively on the SideroLink network." And the limit: "SideroLink only supports point-to-point
connections between Talos machines and the SideroLink management server; direct communication between two Talos
machines over SideroLink is not possible."
Evidence: https://docs.siderolabs.com/talos/v1.14/networking/siderolink (fetched 2026-10-29T12:06:39Z).

#### F41. Talos's ingress firewall blocks VXLAN unless you allow it, and it is the documented trap [verified]
`NetworkDefaultActionConfig` with `ingress: block` blocks everything except `lo`, `siderolink` and `kubespan`.
"With either `accept` or `block`, traffic is always allowed on the following network interfaces: lo, siderolink,
kubespan." In block mode, ICMP is rate-limited to 5 pps, timestamp-request/reply and address-mask-request/reply are
blocked, and "the ingress firewall will also block encapsulated traffic (e.g. VXLAN) between the nodes, which needs
to be explicitly allowed for the Kubernetes networking to function properly", with documented CNI ports (Flannel,
Calico: vxlan UDP 4789; Cilium: vxlan UDP 8472). The docs warn that a mistake here can make the host unreachable
over the Talos API and recommend applying with `--mode=try`.
Evidence: https://docs.siderolabs.com/talos/v1.14/networking/ingress-firewall (fetched 2026-10-29T11:55:37Z).

#### F42. Talos release cadence [verified]
Latest stable v1.14.5 (2026-10-26T15:31:11Z), with v1.13.12 (2026-10-21), v1.14.4 (2026-10-16), v1.14.3
(2026-10-15), v1.13.11 (2026-10-01), v1.14.2 (2026-09-29). A v1.15.0-alpha.2 prerelease was cut 2026-10-27. Two
stable minor streams maintained in parallel. Repo pushed 2026-10-29T11:45:54Z, i.e. during my read window.
Evidence: `gh api repos/siderolabs/talos/releases`.

### Kairos (kairos-io/kairos)

#### F43. What Kairos is, and it is now a monorepo on one release tag [verified]
"The immutable Linux meta-distribution for edge Kubernetes", CNCF Sandbox project contributed by Spectrocloud,
Apache-2.0, Go. The README documents the v4 monorepo layout: `cmd/kairos/` is a multi-call binary that dispatches
on `argv[0]` to immucore, kairos-agent, or kcrypt-discovery-challenger; `agent/`, `immucore/`,
`kcrypt/discovery/`, `kcrypt/challenger/`, `sdk/` (importable as `github.com/kairos-io/kairos/v4/sdk`),
`kairos-init/`, `installer/`, `provider/` are all absorbed from formerly separate repos, which are now archived
with their tagged releases still resolvable. Kairos "can be used to ... spin-up a Kubernetes cluster, with the
Linux distribution of your choice", create immutable infrastructure, manage cluster lifecycle with Kubernetes,
and create "a multiple-node, a single cluster that spans up across regions".
Evidence: `gh api repos/kairos-io/kairos/contents/README.md` (read in full);
https://kairos.io/docs/architecture/ (fetched 2026-10-29T12:00:17Z).

#### F44. Kairos's P2P layer bootstraps clusters with no control management interface [verified]
"Kairos creates self-coordinated, fully meshed clusters at the edge by using a combination of P2P technology, VPN,
and Kubernetes." Components: the Kairos base OS with k3s combinations, a VPN interface (EdgeVPN, built on libp2p),
k3s/CNI configured to work with the VPN interface, and a shared ledger. Bootstrapping is three phases:
(1) discovery via DHT (WAN) or mDNS (LAN), (2) rendezvous points rotated by OTP from a shared token, (3) a gossip
network whose ledger blocks are "symmetrically encrypted with AES" with the key "rotated via OTP". Optionally a TUN
interface gives every OS-level application a VirtualIP inside the VPN. Comparison table in the docs: EdgeVPN is
userspace, supports "TCP, UDP/quick, UDP, ws, everything supported by libp2p", and is fully meshed, where
WireGuard and OpenVPN are not.
Evidence: https://kairos.io/docs/architecture/network/ (fetched 2026-10-29T12:00:59Z).

#### F45. Kairos providers are the extension mechanism, and they are event-driven [verified]
"Kairos providers are plugin binaries used to extend node behavior through lifecycle events." `kairos-agent`
"initializes a provider bus and auto-loads provider binaries with the `agent-provider` prefix from standard
provider directories", communication via the `mudler/go-pluggable` framework. Core images ship no Kubernetes
provider; standard images ship one. The kairos-agent v2 package tree shows `agent/{hooks,bus,cmd,common,kairos,
phonehome,webui}` plus `pkg/{action,cloudinit,config,github,implementations/{http,imageextractor,runner,spec,syscall},
partitioner,progress,state,uki,utils,utils/fs,utils/k8s}`. So there is an HTTP implementation package and a webui
package inside the agent.
Evidence: https://kairos.io/docs/architecture/providers/ (fetched 2026-10-29T12:01:46Z);
https://pkg.go.dev/github.com/kairos-io/kairos-agent/v2 (fetched 2026-10-29T12:01:53Z).

#### F46. Kairos release and a documentation caveat [verified]
Latest stable v4.4.0 published 2026-10-26T14:27:15Z (v4.4.0-rc2 on 2026-10-22, v4.3.0 on 2026-09-08). The docs
site I read carries a banner: "You are viewing the development docs which are in progress. There is no guarantee
that the development documentation will be accurate" and points to v4.3.0 as the latest stable documentation.
1858 stars and 566 open issues is the smallest project in this set.
Evidence: `gh api repos/kairos-io/kairos/releases`; https://kairos.io/docs/.

### MicroK8s (canonical/microk8s)

#### F47. MicroK8s is snap-packaged with dqlite, and HA turns itself on at three nodes [verified]
Per a 2026 comparison and Canonical's own material, MicroK8s installs as `sudo snap install microk8s --classic`,
uses dqlite as its HA datastore, and "High availability turns on automatically once a cluster has three or more
nodes". Node roles are voters (replicate the DB and take part in leader election), standby (replicate, do not
vote) and spare (neither, exist to be promoted). Documented timings: up to 5 seconds to elect a new leader after
an ungraceful leader loss, and up to 30 seconds to promote a non-voter to voter. DNS is not enabled by default
(`microk8s enable dns`), which is the most common first-hour surprise. Canonical states MicroK8s runs in as
little as 540 MB of memory while recommending 4 GB and 20 GB disk for real workloads. Portainer measured 685 MB
idle with HA on and 526 MB with HA disabled on a 1 CPU / 1 GB VM.
Evidence: https://www.alekseialeinikov.com/en/blog/topics/devops/k3s-vs-k0s-vs-microk8s-vs-rke2-2026 (fetched
2026-10-29T12:04:20Z) [secondary source, marked unverified for the dqlite role names and timings];
https://www.portainer.io/blog/k0s-vs-k3s [secondary, 2023].

#### F48. MicroK8s requires snapd, which is a hard blocker on many hardened server images [unverified as a
general claim, verified as the packaging fact]
The snap requirement is verified (`sudo snap install microk8s --classic --channel=1.35`). The consequence, that
"if your production hosts do not run snapd, and many hardened, minimal or non-Ubuntu server images do not, this is
a hard blocker", is a secondary-source judgement.
Evidence: same 2026 comparison article; `gh api repos/canonical/microk8s`.

#### F49. MicroK8s's release cadence has fallen behind the rest of the field [verified]
The latest GitHub release is v1.36, published 2026-05-25T06:56:13Z. Previous: v1.35 (2025-12-19), v1.34
(2025-09-01), v1.33 (2025-04-25), v1.32 (2024-12-12). Meanwhile k3s and k0s both shipped 1.37.1 in late
September/October 2026, and RKE2 shipped v1.37.1+rke2r1 on 2026-09-30. The MicroK8s repo does have recent
commits, including "feat: bump build component versions for 1.37 release (#5605)" on 2026-10-14T09:15:17Z and
"Feat: Add patches for kubernetes 1.37 (#5610)" on 2026-09-30, but there is no v1.37 tag or GitHub release as of
my read date. So: the repo is alive, the release artifact is five months stale.
Evidence: `gh api repos/canonical/microk8s/releases`; `gh api repos/canonical/microk8s/commits`;
`gh api repos/canonical/microk8s/tags`.

### RKE2 (rancher/rke2), the Rancher-adjacent entrant

#### F50. RKE2 is the compliance-hardened option, and it makes one irreversible decision for you [verified]
Per a 2026 comparison drawing on Rancher's docs: RKE2 follows CIS Kubernetes Benchmark v1.7/v1.8 defaults, supports
FIPS 140-2 validated cryptography, scans components with Trivy in the build pipeline, launches control plane
components as static pods managed by the kubelet with embedded containerd (no Docker dependency, unlike RKE1),
and bundles Canal as the default CNI with Cilium, Calico, Flannel and Multus available. The expensive warning:
"RKE2 does not support changing the primary CNI, the CNI backend, or the cluster and service CIDRs on a running
cluster ... the documented remedy is to rebuild the cluster."
Evidence: https://www.alekseialeinikov.com/en/blog/topics/devops/k3s-vs-k0s-vs-microk8s-vs-rke2-2026
[secondary source].

#### F51. RKE2 switched its default ingress to Traefik in v1.36 because ingress-nginx was retired [verified]
Read directly from the RKE2 v1.36.5+rke2r1 release notes: "Because `ingress-nginx` was retired upstream as of
March 2026, Traefik is now the default for new clusters starting in v1.36 (existing clusters will keep their
current ingress upon upgrade to avoid breakage)." Consequences stated in the same notes: the
`rke2-images-core` airgap tarball now contains Traefik images instead of ingress-nginx and the standalone
`rke2-images-traefik` tarball is removed; users who must keep ingress-nginx must supply `rke2-images-ingress-nginx`
themselves; "The `ingress-nginx` chart will not receive any additional updates and will be completely removed in
v1.37 for community users." The release also bumps the Traefik chart to v40.x with two breaking changes (Service
spec syntax in values.yaml now aligned with Kubernetes syntax, and the migration provider name changes from
`kubernetesIngressNginx` to `kubernetesIngressNGINX`).
Evidence: `gh api repos/rancher/rke2/releases/tags/v1.36.5+rke2r1 --jq '.body'`; corroborated by
https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/ (published 2025-11-11).

#### F52. RKE2 ships an experimental nftables path [unverified]
A secondary source states nftables support landed in the July 2026 releases (v1.36.3+rke2r1, v1.35.7+rke2r1,
v1.34.10+rke2r1), still experimental, enabled per component (`proxy-mode=nftables` for kube-proxy plus a
HelmChartConfig for the CNI). I did not confirm this from the RKE2 release notes.
Evidence: same 2026 comparison article.

### Sidero Omni (siderolabs/omni), the hosted-control-plane option

#### F53. Omni is a self-hostable hosted control plane for Talos, on 2 vCPU / 4 GB [verified]
Omni is "SaaS-simple deployment of Kubernetes - on your own hardware", Go. The on-prem guide: "deploying Omni on a
Linux host with internet access. By the end, you will have a fully functional Omni instance running with TLS, an
OIDC identity provider, and either embedded or external etcd." Prerequisites: a Linux host with at least 2 vCPUs
and 4 GB RAM, a domain name or IP, Docker installed, cfssl installed. Ports: 443 TCP (UI and API), 8090 TCP
(SideroLink API), 8091 TCP (event sink), 8100 TCP (Kubernetes proxy), 5556 TCP (Dex OIDC), 50180 UDP (WireGuard).
Latest release v1.13.0 (2026-10-28T19:07:20Z); 1419 stars; repo pushed 2026-10-29.
Evidence: https://docs.siderolabs.com/omni/self-hosted/run-omni-on-prem (fetched 2026-10-29T11:59:55Z);
`gh api repos/siderolabs/omni`; `gh api repos/siderolabs/omni/releases`.

#### F54. Omni's license blocks exactly the use case this spec describes [verified]
The LICENSE file is Business Source License 1.1, licensor "Sidero Labs, Inc.", Licensed Work "Omni", (c) 2026. The
Additional Use Grant reads: "You may make non-production use of the Licensed Work, including testing and
evaluation of the Licensed Work itself, or personal use in a home lab environment. Use of the Licensed Work to
host, run, test, or support any environment on which Customer's own development, operations, or business depends
is not non-production use and requires a commercial license, regardless of how that environment is designated."
Change Date 2030-10-23, Change License MPL-2.0. The on-prem guide repeats it: "Omni is licensed under the Business
Source License and requires a support contract for production use."
Evidence: `gh api repos/siderolabs/omni/contents/LICENSE`; the run-omni-on-prem page.

### Cross-cutting: driving these over a Cloudflare Tunnel

#### F55. Cloudflare documents the Kubernetes-API-over-Tunnel pattern, including the client side [verified]
Cloudflare's own tutorial "Connect through Cloudflare Access using kubectl" (last updated May 6, 2026) shows a
tunnel ingress rule `service: tcp://kubernetes.docker.internal:6443` with `originRequest: proxyType: socks`, a
CNAME to `<TUNNEL_ID>.cfargotunnel.com`, and then on the client
`cloudflared access tcp --hostname azure.widgetcorp.tech --url 127.0.0.1:1234` followed by
`alias kubeone="env HTTPS_PROXY=socks5://127.0.0.1:1234 kubectl"`. The page states the limitation explicitly:
"`kubeconfig` does not support proxy command configurations at this time, though the community has submitted plans
to do so." A second tutorial, "Use Cloudflare Tunnels with Kubernetes client-go credential plugins" (last updated
Apr 17, 2026), works around the auth side with an ExecCredential plugin shelling out to
`cloudflared access token -app=https://k8s.example.com`, and notes step 2 as "Ensure the Kubernetes API server is
configured to accept authentication from Cloudflare Tunnels. This may involve setting up an authentication webhook
or configuring the API server to trust the Cloudflare Tunnel's client certificates."
Evidence: https://developers.cloudflare.com/cloudflare-one/tutorials/kubectl/ (fetched 2026-10-29T11:51:03Z);
https://developers.cloudflare.com/cloudflare-one/tutorials/tunnel-kubectl/ (fetched 2026-10-29T11:51:20Z).

#### F56. `proxyType: socks` is a documented origin parameter for exactly this [verified]
From Cloudflare's origin parameters page: "`cloudflared` starts a proxy server to translate HTTP traffic into TCP
when proxying, for example, SSH or RDP. This configures what type of proxy will be started. Valid options are: `""`
for the regular proxy, `"socks"` for a SOCKS5 proxy." Companion settings `proxyAddress` (default 127.0.0.1) and
`proxyPort` (0 = random unused port). Also relevant: `originServerName`, `matchSNItoHost`, `caPool`, `noTLSVerify`,
`httpHostHeader`, `connectTimeout` (default 30s), `keepAliveTimeout`.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/
(fetched 2026-10-29T12:06:44Z, page last updated 2026-04-17).

#### F57. gRPC over a Tunnel public hostname is not supported, and there is an open bug [verified]
Cloudflare's gRPC use-case page (last updated Jun 23, 2026) states: "Cloudflare Tunnel supports gRPC traffic via
private subnet routing. Public hostname deployments are not currently supported." The documented path is a Tunnel
CIDR route plus Split Tunnels configuration on the Cloudflare One Client, not a public hostname. Separately,
cloudflared issue #1641 (opened 2026-04-27, still open at my read) reports gRPC response bodies and trailers
stripped through a tunnel on cloudflared 2026.3.0 and 2025.8.1, with `originRequest.http2Origin: true` and
`noTLSVerify: true`, against an nginx TLS+h2 origin doing `grpc_pass`. Symptom: HTTP 200 with
`content-type: application/grpc` but `size=0` and no `grpc-status` trailer, so grpcurl reports
"server closed the stream without sending trailers". The same origin works via kubectl port-forward. The
reporter's hypothesis is that cloudflared or the edge drops HTTP/2 DATA frames and trailers. The direct
consequence for this spec: Talos's management API is gRPC with mutual TLS (F39), so it cannot be reliably fronted
by a Tunnel public hostname today.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/grpc/
(fetched 2026-10-29T12:05:37Z); https://github.com/cloudflare/cloudflared/issues/1641 (fetched 2026-10-29T12:05:57Z).

#### F58. Cloudflare's own Kubernetes deployment guide recommends cloudflared as an adjacent deployment [verified]
"This guide will cover how to expose a Kubernetes service to the public Internet using a remotely-managed Cloudflare
Tunnel ... we recommend setting up `cloudflared` as an adjacent deployment to the application deployments. Having a
separate Kubernetes deployment for `cloudflared` allows you to scale `cloudflared` independently of the
application. In the `cloudflared` deployment, you can spin up multiple replicas running the same Cloudflare Tunnel
- there is no need to build a dedicated tunnel for each `cloudflared` pod. Each `cloudflared` replica / pod can
reach all Kubernetes services in the cluster."
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/deployment-guides/kubernetes/
(fetched 2026-10-29T11:51:07Z, page last updated 2026-09-07).

#### F59. Workers inbound TCP with gRPC exists but is private beta [unverified for GA]
InfoQ (2026-08-29) reports Cloudflare Workers can now accept inbound TCP via a `connect(socket)` handler routed
through Spectrum, with gRPC the first protocol on top, and a full-duplex path from a Durable Object to a Container
through `getTcpPort()`. Workers themselves serve only unary and server-streaming gRPC, by translating to and from
gRPC-web, because fetch() does not expose HTTP/2 stream-level control. Cloudflare is quoted saying it is private
beta and "we do not use gRPC internally". This matters only if the spec wants a Worker to speak gRPC directly to
an orchestrator; do not plan on it as GA.
Evidence: https://www.infoq.com/news/2026/08/workers-inbound-tcp-grpc/ (fetched 2026-10-29T12:06:13Z).

## 2. Comparison table

All rows are for the job in the topic: long-lived containers plus CI on a handful of machines, driven remotely
over a tunnel. "CP off-cluster" is my verdict on running the orchestrator's control plane on a separate machine
reachable only over a tunnel.

| | Nomad 2.1.0 | k3s v1.37.1 | k0s v1.37.1 | Docker Swarm 29.9 | Rancher 2.15 | Talos 1.14 | Kairos 4.4 | MicroK8s 1.36 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kind | workload scheduler | Kubernetes distro | Kubernetes distro | Docker-native orchestrator | k8s management plane | k8s-only Linux distro | immutable edge meta-distro | snap k8s distro |
| License | BUSL 1.1 (IBM) | Apache-2.0 | Apache-2.0 | Apache-2.0 | Apache-2.0 | MPL-2.0 | Apache-2.0 | Apache-2.0 |
| Stars / open issues | 17057 / 1626 | 34274 / 86 | 6556 / 271 | 72225 (moby) / 3956 | 26020 / 3411 | 11429 / 302 | 1858 / 566 | 9377 / 158 |
| Latest stable | 2026-10-28 | 2026-09-30 | 2026-10-27 | 2026-10-20 (moby) | 2026-09-23 | 2026-10-26 | 2026-10-26 | 2026-05-25 |
| Primary API | REST `/v1/*` on 4646, Go client, ndjson event stream | Kubernetes API on 6443 | Kubernetes API on 6443, plus `k0s api` | Docker Engine REST API on unix socket / TCP+TLS | Rancher REST API + auth proxy impersonation | single declarative gRPC API (port 50000) | cloud-config + provider plugins, agent HTTP/webui packages | Kubernetes API, `microk8s` CLI |
| HA model | 3 or 5 Raft servers per region, quorum floor(n/2)+1, WAN gossip on 4648, no cross-region replication | embedded etcd with 3+ servers, or external datastore with 2+ | managed etcd or kine over SQL; etcd cannot be shrunk | Raft among managers, single leader, manager on 2377, join tokens, self-signed CA | the Rancher server's own cluster needs 3+ nodes; downstream clusters are independent | etcd in the control plane nodes, 3 CP recommended | P2P self-coordination, no central controller | dqlite, HA auto-on at 3+ nodes, voters/standby/spare |
| Footprint (documented) | server 2-4 core / 8-16 GB / 50 GB; no published minimum | server w/ workload 1596-1606 MB, agent 275 MB (x86_64); min 2C/2G server, 1C/512M agent | not published by the project; 658 MB idle in a 2023 third-party test | 216 MB idle in a 2023 third-party test | Small tier 4 vCPU / 16 GB per node, 3+ nodes for production | not published | not published | 540 MB floor per Canonical; 685 MB idle in a 2023 test |
| CP off-cluster verdict | poor: servers need <10 ms between members; clients keep running but nothing schedules, and default `disconnect` marks allocations lost and replaces them | workable: add `--tls-san <tunnel-host>`, front 6443 with a TCP/SOCKS tunnel, and use a mesh VPN for flannel VXLAN and etcd peer traffic | workable, same as k3s, and controllers run no workloads by default so the split is natural | workable for managers, but the ingress overlay and Raft gossip want low latency between managers | this is already the design: `cattle-cluster-agent` opens a tunnel to the cluster controller; ACE covers Rancher downtime | blocked for the API: gRPC + mTLS needs a raw TCP LB, and Tunnel public hostnames do not support gRPC; SideroLink is the sanctioned path | not applicable as a control plane; it is node software, and its P2P layer is the tunnel replacement | poor: snap packaging plus the staleest release cadence in the table |
| Notable risk for this spec | BUSL is not open source; CVE-2026-14373 privilege escalation if users submit job specs; Consul recommended | flannel VXLAN and etcd need a real network path, not just a tunnel; x509 SAN failure is a known first-hour trap (issue #12535) | smallest community; no published footprint figures | development slowed; Mirantis support is a paid MKE 3 commitment | heaviest footprint; second cluster to operate; 3411 open issues | no SSH at all, so losing the API path means losing the box | 566 open issues, 1858 stars, dev docs marked incomplete | snapd is a hard blocker on many hardened images; 5 months without a release |

## 3. What this changes for the spec

1. Drop Rancher and Omni from the shortlist on license and footprint grounds, and drop Talos from the
   control-plane role on a protocol ground. Rancher's Small tier alone is 4 vCPU / 16 GB per node across three
   nodes (F33), which is more than the whole data plane this spec describes. Omni is BUSL with an additional use
   grant limited to non-production and home-lab use (F54), which is precisely the use the operator wants. Talos is
   the most attractive API surface in the set (F38) but its API is gRPC with mutual TLS and Cloudflare Tunnel
   explicitly does not support gRPC on public hostnames, with an open bug stripping gRPC bodies and trailers
   (F57, F39). Keep Talos as the OS on the data-plane nodes if you want it, but do not make its API the
   control-plane channel.

2. Make Nomad the primary orchestrator candidate, with k3s as the alternative, and be explicit about the
   tradeoff. Nomad wins on API shape for this job: a complete REST API under `/v1/` (F4), a resumable ndjson event
   stream with per-topic ACLs (F5), and parameterized jobs with dispatch payloads that are a CI job primitive
   already (F7). Those three together are most of the control plane the SPA needs, without inventing anything.
   k3s wins on footprint and on ecosystem, and it is Apache-2.0. Nomad's costs are real: BUSL, not open source
   (F2), a heavy server sizing recommendation with a hard sub-10 ms inter-server latency requirement (F8, F9), and
   CVE-2026-14373, which is an authenticated-job-submitter privilege escalation that maps directly onto "let the
   SPA submit a job spec" (F11).

3. Design for the off-cluster control plane as an explicit failure mode, not as a default. For Nomad this means
   every job that matters carries a `disconnect` block with `lost_after` set to something longer than a tunnel
   outage and `stop_on_client_after` set to something longer than that, because the default marks allocations
   lost immediately and replaces them (F10). For k3s it means `--tls-san <tunnel-hostname>` on every server before
   first start (F19, F20), and a mesh VPN or another overlay for flannel VXLAN and etcd peer traffic, because a
   tunnel carries the API server and not the node-to-node fabric (F21, F41).

4. Adopt Cloudflare's documented pattern for the API channel, and budget for its limits. Use
   `service: tcp://<api-host>:6443` with `originRequest.proxyType: socks`, then
   `cloudflared access tcp --hostname ... --url 127.0.0.1:<port>` and an `HTTPS_PROXY` alias or an ExecCredential
   plugin that shells out to `cloudflared access token` (F55, F56). Accept that kubeconfig has no proxy-command
   support (F55), so a Worker cannot hold a normal kubeconfig and talk to the API server through a tunnel without
   either a local cloudflared sidecar or a Worker-side proxy of your own.

5. Do not put a gRPC management API behind a Tunnel public hostname. This rules out Talos's API and any
   gRPC-based control channel for now. If you need gRPC over the tunnel, the only documented Cloudflare path is
   private subnet routing with the Cloudflare One Client and Split Tunnels configured (F57), which does not fit a
   browser SPA on Workers.

6. Run the CI data plane on the same orchestrator rather than adding a second system, but keep the two planes
   separable. Nomad's parameterized dispatch plus the event stream covers "trigger a run, watch it finish" without
   a second control plane (F5, F7). If you choose k3s instead, the same is true of the Kubernetes Jobs API, and
   RKE2 or k0s give you a cleaner control-plane/work-plane split than k3s does (F23, F50). Whichever you pick, put
   CI on a distinct node pool or Nomad datacenter with its own ACL token scope, because CVE-2026-14373 shows what
   an authenticated submitter can reach.

7. Copy Rancher's tunnel topology even if you reject Rancher itself. `cattle-cluster-agent` opening a tunnel to a
   cluster controller inside the management server, with the agent asking for only 50m CPU and 100Mi (F34), is the
   exact shape the spec wants, and the Authorized Cluster Endpoint (F35) is the documented answer to "what happens
   when the management plane is down". Build the equivalent: a small outbound-only agent per machine, a control
   plane that never dials in, and a documented break-glass path that reaches the data plane with the control plane
   switched off.

8. Treat Docker Swarm as the fallback, not the plan. It is functional and Docker's own docs only say development
   has slowed (F27), but Mirantis's 2030 commitment is a paid MKE 3 commitment (F28), and the ecosystem argument
   in Portainer's 2026 post is that almost all modern tooling is written for Kubernetes (F31). Its genuine
   advantage is a 216 MB idle footprint and the Docker Engine API you already have (F30).

9. Ignore MicroK8s for this build. The snap dependency is a hard blocker on hardened server images (F48), and the
   release cadence is five months behind k3s and k0s on the same Kubernetes minor (F49). Nothing about it is
   better than k3s for this use case.

## 4. Not covered / open questions

- No orchestrator was installed, started, benchmarked or driven over a tunnel in this environment. Every
  footprint figure above is a vendor document or a third-party blog, labelled as such. No claim here is a
  measurement I made.
- The Nomad "single 35 MB binary" claim is refuted for the current release (the linux_amd64.zip is 60.9 MB
  compressed, F13), but the uncompressed binary size and its steady-state RSS were not measured.
- k0s publishes no resource-profiling page that I could find. Its footprint row in the comparison table is a 2023
  Portainer measurement on 1 CPU / 1 GB VMs and is marked unverified.
- Nomad's ports were taken from a 2016 issue thread (4646 HTTP, 4647 RPC, 4648 serf/gossip) plus the reference
  architecture's WAN note, not from a current Nomad networking reference page. The current Nomad networking docs
  URL returned 422 through the gateway and I did not locate the replacement.
- Whether cloudflared's raw TCP ingress (a plain `service: tcp://host:port` rule with no proxyType) reliably
  carries a gRPC-plus-mTLS stream was not tested. F57 documents that public-hostname HTTP proxying does not, but
  the raw-TCP case is untested and is the single most valuable experiment left.
- Whether a k3s agent's websocket connection to a server through a Cloudflare Tunnel survives Cloudflare's
  connection and idle-timeout behaviour over hours was not tested.
- Whether Nomad servers can reach clients behind a tunnel for `nomad alloc exec`, `nomad logs` and the allocation
  filesystem APIs was not investigated. F10 documents the client-to-server heartbeat direction only.
- Nomad Enterprise pricing was not verified. A competitor blog quotes "Enterprise plans starting at $66,000/yr"
  and I did not confirm it from IBM; do not use that number.
- Sidero Omni's commercial license cost was not found.
- Rancher's REST API surface was not enumerated beyond the authentication-proxy and impersonation model in F35.
  If Rancher stays in scope for any reason, that is the next thing to read.
- Kairos's "unified Cloud Native API" was not pinned down. The agent package tree shows `implementations/http`
  and `webui` (F45), but I did not find the API reference, so I cannot say whether it is drivable from a Worker.
- RKE2's experimental nftables support (F52) is a secondary-source claim.
- The dqlite role names, the 5-second leader election and the 30-second voter promotion timings for MicroK8s
  (F47) are from a secondary source, not from Canonical's docs.
- Whether Cloudflare Tunnel's QUIC transport and Cloudflare's edge add latency that breaks Nomad's sub-10 ms
  inter-server requirement was not measured. F8 states the requirement; the tunnel's contribution is unknown.
- Whether a Worker can hold a Cloudflare Access service token and originate a SOCKS5 connection to a tunnel
  hostname (rather than a human running `cloudflared access tcp`) was not investigated, and it is the load-bearing
  assumption of the whole "SPA on Workers drives the data plane" design.
