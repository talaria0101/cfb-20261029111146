# Cloudflare-alternative stack: control plane on Workers, data plane on your own metal

A design specification, a tool survey and a critique, produced 2026-10-29.
Licensed 0BSD. Everything technical lives in Markdown; there is no code to run here.

## The short answer

Yes, this architecture works, and Cloudflare ships a first-party primitive for the
hard part of it. The split you want is not "Cloudflare schedules, my machine runs".
It is:

| Plane | Where it runs | What runs there |
|---|---|---|
| Control plane | Cloudflare Workers | The SPA, the API, short-lived credentials, a job queue |
| Transport | Cloudflare Tunnel, one tunnel per machine, cloudflared dialling out | No inbound ports, no public IP on any box |
| Data plane | Your own machines | Orchestrator, CI runners, object storage, container runtime |
| Out-of-band | Outside Cloudflare entirely | A second door, and power control |

The one primitive to build on is **Workers VPC**. A remotely-managed Cloudflare
Tunnel plus a `vpc_services` binding in `wrangler.toml` lets a Worker call a
private HTTP service on your own machine with `fetch()`, and a private TCP service
with `connect()`. VPC Services pin host and port in the service configuration and
ignore both in the URL, which makes SSRF structurally impossible on that path.
Source: `research/A5-zero-trust-vpc.md`, verified against
`https://developers.cloudflare.com/workers-vpc/` on 2026-10-29.

The honest caveats, in order of how much money they can cost you:

1. **Workers VPC is a Beta Service.** Section 5 of Cloudflare's Self-Serve
   Subscription Agreement lets Cloudflare remove a Beta Service and any Customer
   Content stored as part of it at any time, at its sole discretion, with no
   liability. Verified against `https://www.cloudflare.com/terms/` on 2026-10-29.
2. **SSSA 2.2.1(j) prohibits using the Services "to provide a virtual private
   network or other similar proxy services."** That is a description of a tunnel
   plus VPC Networks. Whether it is enforced against a single-tenant private
   network is unknown. Verified text, unverified enforcement. Get a written answer
   before you build.
3. **A request body is capped by your zone plan at 100 MB on Free and Pro, 200 MB
   on Business.** There is no DNS-only escape for a tunnel. Design uploads as
   presigned-URL-direct-to-origin from the first commit.
4. **The Cloudflare API budget is 1,200 requests per 5 minutes per token**, about
   4 per second sustained. Polling 50 machines every 60 seconds spends a fifth of
   it before any real work.
5. **Do not self-host to save money on NVMe.** R2 at $0.015/GB-month is cheaper
   per GB than a Hetzner 1 TB NVMe addon. The self-hosting argument survives on
   egress, on always-on memory and disk, on duration limits, and on spinning disk.

## How to read this repository

| File | What it holds |
|---|---|
| `SPEC.md` | The architecture: planes, components, data flow, contracts, operations |
| `docs/DECISIONS.md` | Every choice with its rejected alternatives and the reason |
| `docs/TOOLS.md` | The GitHub tool survey, one table per layer, with figures and dates |
| `docs/AMIKA-REUSE.md` | The specific answer on `gofixpoint/amika`: what to lift, what to ignore |
| `docs/COST.md` | The break-even model with its arithmetic shown |
| `docs/THREAT-MODEL.md` | Attacks that are real, attacks that are not, and the controls |
| `docs/CRITIQUE.md` | What to drop from the plan, and what to do instead |
| `docs/BUILD-PLAN.md` | A phased build order with the go/no-go gates |
| `reference/` | Illustrative config skeletons. Not executed, not tested |
| `research/` | 21 primary-source research files. Every figure in the spec traces here |

The `research/` files are the evidence. Each one records the exact URL, and for
GitHub the owner/repo, stars, license, last push and last release, all read on
2026-10-29 unless the file says otherwise. Where a subagent could not verify a
claim it wrote the word "unverified" next to it. Those labels are preserved.

## Coverage: what was and was not done

Done. 21 research files, 14,105 lines and 976,943 bytes of Markdown, produced by
28 subagent runs across five swarm calls. All web access was routed through
`web.pkgforge.dev` pinned to `provider=tinyfish` as instructed, with `gh api` for
repository metadata. Primary sources only: `developers.cloudflare.com`,
`cloudflare.com/terms/`, the GitHub API, and vendor pricing pages.

The first swarm was dispatched against the `explore` agent, which turned out to have
no file-writing tool in this harness, so its five successful children returned their
reports inline and no files were created. The same six items were re-dispatched
against the `general` agent, which can write. That is why the research set took five
swarm calls rather than four, and it is recorded here rather than quietly dropped.

Spot-checked by me directly on 2026-10-29, against the primary source:
R2 pricing, Workers pricing, Durable Objects pricing, SSSA sections 2.2.1 and 5,
Hetzner EX44 price and specification, and the current `cloudflared`, `amika`,
`seaweedfs`, `coolify`, `nomad` and `celld` repository metadata. Those figures are
marked "verified by me" in `docs/TOOLS.md`.

Not done, named precisely:

- No benchmark. Nothing in this repository measures a running system. Every
  performance and throughput figure is a vendor or project claim, attributed.
- No cost model of operator labour. C2 could not find a primary source and
  refused to invent one. Neither will I.
- No legal advice. The ToS clauses are quoted, not interpreted. The SSSA 2.2.1(j)
  question is a question for Cloudflare support or your own counsel.
- No account was created, no Worker deployed, no tunnel run, no container started.
- `research/C5-academic-prior-art.md` has five papers recorded as metadata-only
  because ACM PDFs returned 502 twice through the reader. Those are labelled.
- The container-escape CVEs CVE-2026-31431, CVE-2026-34040 and the November 2025
  runc breakout set were found but not read. The microVM recommendation is
  therefore a recommendation, not a specification.

The full open-question list is `docs/CRITIQUE.md` section 4 and
`research/D1-synthesis-gaps.md` section 3. There are 34 of them.

## License

0BSD. The research files quote Cloudflare documentation and GitHub READMEs under
their respective terms; the selection, arrangement and commentary are 0BSD.
