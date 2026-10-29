# Cloudflare control plane, own-metal data plane

Specification, tool survey and critique. 2026-10-29. 0BSD.

## Design

Four requirements, in priority order:

| # | Requirement |
|---|---|
| R1 | Application code runs on Cloudflare or on the self-hosted backend with as little custom change as possible |
| R2 | One small agent binary per server, acting as tunnel connector, orchestrator interface and broker |
| R3 | The dashboard SPA is hosted on Cloudflare Workers and managed from there |
| R4 | The orchestration layer is not Cloudflare |

**R1 is satisfied by a four-primitive portable contract.** `fetch`, object storage via
the S3 API, SQL, and a queue with a pull consumer. All four exist natively on both
sides, because R2 speaks S3 and SeaweedFS speaks S3. Application code imports no
Cloudflare binding; one adapter file per platform is the only platform-specific code.

**R2 is satisfied by one Rust binary per server, `cfb-node`.** It composes the
transport seam and edge codec from `talaria0101/cfrs`, the outbound-only enrollment
and capability model from `ZingerLittleBee/ServerBee`, the crate split and poll
discipline from `timhartmann7/omnyssh`, and the connect-info shape and environment
resolution from `metalbear-co/mirrord`. Target is roughly 15 MB with no GUI on the box.

**The honest gap:** cfrs cannot replace `cloudflared` today. Its own module
documentation states that registration and visitor serving are not implemented, and
its `serve` path reaches the internet only through `free.pinggy.io`, a third-party
relay that can read the traffic. Stage 1 therefore keeps `cloudflared` as a child
process of `cfb-node`, behind the same transport trait, and stage 2 replaces it once
the codec has carried real traffic against the real edge.

## Files

| File | Contents |
|---|---|
| `SPEC.md` | Requirements, the portable contract, topology, cfb-node composition, Cloudflare side, data paths, controls, cost, phases |
| `docs/DECISIONS.md` | Choices with rejected alternatives |
| `docs/TOOLS.md` | GitHub tool survey, all figures dated |
| `docs/COST.md` | Break-even model, arithmetic shown |
| `docs/CRITIQUE.md` | What to drop and why, negative results, open questions |
| `reference/` | The portable contract and node config skeletons. Not executed |
| `research/` | 27 primary-source files. Every figure in the spec traces to one |

## Coverage

Done: 27 research files, 14,105 lines of Markdown from the first round plus 6 more
from this one, produced by 34 subagent runs across six swarm calls. Web access through
`web.pkgforge.dev` pinned to `provider=tinyfish`, `gh api` for repository metadata.

I verified directly against primary sources on 2026-10-29: R2, Workers, Durable
Objects and Workers VPC pricing; SSSA sections 2.2.1 and 5; the Hetzner EX44 page; the
current `cloudflared`, `amika`, `seaweedfs`, `coolify`, `nomad` and `celld` repository
metadata; and the full `talaria0101/cfrs` source tree, extracted and read.

Not done: no benchmark, no account, no Worker deployed, no tunnel run, no container
started, no orchestrator installed. Nothing in this repository executes. Every
performance figure is a vendor or project claim, attributed. Five papers in
`research/C5-academic-prior-art.md` are metadata-only because ACM PDFs returned 502
twice. Operator labour is unpriced because no primary source exists. No Cloudflare
term is interpreted; clauses are quoted.

The full list of open questions is `docs/CRITIQUE.md` section 4 and
`research/D1-synthesis-gaps.md` section 3.
