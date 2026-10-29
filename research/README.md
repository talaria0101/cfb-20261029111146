# Research

27 primary-source files. Every figure in `../SPEC.md` and `../docs/` traces to one of
them, and every figure in them traces to a URL that was actually fetched on 2026-10-29
unless the file says otherwise.

| File | Topic |
|---|---|
| `A1-cloudflare-tunnels.md` | cloudflared architecture, credentials, ingress, limits, CVEs |
| `A2-containers-sandbox.md` | Cloudflare Containers and the Sandbox SDK: GA state, limits, pricing, lifetime |
| `A3-workerd.md` | the workerd repository: build, config surface, isolation, Node subset |
| `A4-durable-objects-workers.md` | Durable Objects, Queues, Hyperdrive, KV, R2, Workers for Platforms |
| `A5-zero-trust-vpc.md` | Access, service tokens, mTLS, posture, the Zero Trust API surface |
| `A6-pricing-reality.md` | the Cloudflare rate card, read line by line |
| `B1-amika.md` | gofixpoint/amika read properly |
| `B2-selfhosted-paas.md` | Coolify, Dokploy, CapRover, Dokku, LevelRail and others |
| `B3-orchestrators.md` | Nomad, k3s, k0s, Swarm, Rancher, Talos, Kairos, MicroK8s |
| `B4-remote-access-tunnels.md` | Pangolin, frp, headscale, NetBird, Teleport, ttyd, ShellHub and others |
| `B5-storage.md` | SeaweedFS, Garage, MinIO, RustFS, Ceph, Valkey, Dragonfly, rqlite |
| `B6-ci-systems.md` | Actions runners, Woodpecker, Concourse, Argo, Tekton, Dagger and others |
| `B7-dashboards-spas.md` | Portainer, Komodo, Traefik, Caddy, and the Workers SPA stack |
| `B8-prior-art-control-plane.md` | who has already built this, and the Cloudflare API surface |
| `C1-threat-model.md` | attacks that are real and attacks that are not |
| `C2-tco-model.md` | the cost model, with its arithmetic |
| `C3-bare-metal-provisioning.md` | BMC, WoL, netboot, Talos, Kairos, and the power plane |
| `C4-microvm-sandbox.md` | Firecracker, Cloud Hypervisor, gVisor, Kata, youki |
| `C5-academic-prior-art.md` | papers on serverless cost, cold starts and edge placement |
| `C6-critique-failure-modes.md` | every way the design fails or is worse than what it replaces |
| `D1-synthesis-gaps.md` | cross-check pass: where two files disagree, and the open questions |
| `E1-homelable.md` | Pouzor/homelable: data model, API, and the agent that does not exist |
| `E2-coreobs.md` | crocofied/CoreObs: shared-database architecture, dormant, and its open API |
| `E3-omnyssh.md` | timhartmann7/omnyssh: crate split, measured binary sizes, poll discipline |
| `E4-serverbee.md` | ZingerLittleBee/ServerBee: outbound-only agent, enrollment, capability mask |
| `E5-mirrord.md` | metalbear-co/mirrord: connect-info shape, environment resolution, wire format |
| `E6-cfrs.md` | talaria0101/cfrs: full source read. What works, what does not, what is reusable |

## Method

Web access went through `web.pkgforge.dev` pinned to `provider=tinyfish`, with `gh api`
for repository metadata. Where the tinyfish provider refused a call, the file says so
and names the fallback. Where a claim could not be verified, the file writes the word
"unverified" next to it, and those labels are preserved.

## A note on the files' own contents

These files quote Cloudflare documentation and third-party project documentation. The
selection, arrangement and commentary are 0BSD under the repository's `LICENSE`; the
quoted material remains under its own terms.
