# D1-synthesis-gaps: cross-check of the research file set

Research subagent: D1-synthesis-gaps
Date of every read below: 2026-10-29 (UTC, read from the host with `date -u`)
Scope: /workspace/cfb-20261029111146/research/ - A1, A2, A3, A4, A5, A6, B1, B2, B3,
B4, B5, B6, B7, B8, C1, C3, C4, C5, C6. That is 19 files, about 940 KB, all read in
full. The task brief said 20; the directory holds 19 (the enumeration A1-A6, B1-B8, C1,
C3-C6 is 19). C2 has no file yet.
This is a comparison pass. I did not re-research the topics. I made four targeted
verification calls of my own, listed in section 1.4, only where two files contradicted
each other on a number the spec depends on.

Method: pkgforge gateway pinned to provider=tinyfish for the two web reads
(`search.web.pkgforge.dev` and `read.web.pkgforge.dev`); `gh api` for GitHub metadata.
No fallback to built-in web_search/web_fetch was needed. Every tinyfish and gh call
succeeded on the first attempt.

Labels: [verified] = I read the artefact named and am quoting it. [unverified] = the
claim rests on a source I could not read, or on my own arithmetic, which is labelled
as such.

Convention note for this file: where I compute something, the arithmetic is shown.
"h/mo" means hours per month. The research set uses three different values for this
(730, 720, 624) - see D17.

---

## 1. Findings

### 1.1 Where two files disagree

Each entry quotes both files, names the source URL, and gives a verdict. Ordered by
how much the disagreement would cost the spec if it shipped.

#### D1. Cloudflare Tunnel route limit per account: 1,000 (A5) vs 50,000 (A1, B8)

- A5-zero-trust-vpc.md section 1.14, quoting
  https://developers.cloudflare.com/cloudflare-one/account-limits/ (A5 records the page
  as "Last updated Sep 4, 2026"): "Cloudflare Tunnel: tunnels per account 1,000; Routes
  (CIDR + hostname) per account 1,000 (shared with Cloudflare Mesh)" and "Cloudflare
  Mesh: Mesh nodes per account 50; Routes (CIDR) per account 1,000". A5 labels the whole
  block [verified].
- A1-cloudflare-tunnels.md F9, quoting the same URL with the page recorded as
  "Last updated Oct 16, 2026": "Routes (CIDR routes + Hostname routes) per account |
  50,000 (shared with Cloudflare Mesh)". A1 also records the cause, changelog dated
  2026-10-16: "The default limit for routes is now 50,000 per account, up from 1,000."
- B8-prior-art-control-plane.md F6, quoting
  https://developers.cloudflare.com/cloudflare-one/account-limits/: "Routes (CIDR +
  hostname) per account | 50,000 (shared with Cloudflare Mesh)". [verified]

Verdict: A5 is stale by one changelog. 50,000 is correct as of 2026-10-29 (see 1.4, V1).
This is the only case in the set where a file labelled [verified] carries a number that
a changelog entry published 13 days earlier had already superseded. Any spec line that
sizes a route table from A5's 1,000 is wrong by 50x.

#### D2. Hetzner AX41 hourly price: EUR 0.0808 derived (A6) vs EUR 0.0945 published (C6)

- A6-pricing-reality.md 1.14: "AX41 at EUR 59.00/month over 730 hours = EUR 0.0808/hour
  for the whole box." A6 labels this "Derived arithmetic on published rates".
- C6-critique-failure-modes.md F28: "Hetzner AX41 is EUR 59.00/month excluding VAT,
  EUR 0.0945/hour, EUR 0.00 setup fee, 6c/12t AMD Ryzen 5 3600, 64 GB DDR4, 2x 512 GB
  NVMe, 1 GBit/s guaranteed port". C6 labels it [verified] from
  https://www.hetzner.com/dedicated-rootserver/matrix-ax/.

Verdict: both are traceable, and they differ by 17%. Hetzner publishes both a monthly
and an hourly figure on the same page; 59.00 / 0.0945 = 624.3 hours, so Hetzner's hourly
rate implies a 26-day month, not a 730-hour one. For an always-on box the monthly figure
is the correct input and A6's derivation is the right one. C6 quoting the published
hourly rate is not an error, but any per-hour or per-vCPU-hour figure derived from it is
17% high. (Verified in 1.4, V2.)

#### D3. Cloudflare Containers always-on cost: A6 subtracts the included allowance, C6 does not

- A6 1.14: "Cloudflare Containers memory at $0.0000025/GiB-second = $0.009/GiB-hour.
  64 GiB held for a month (730 h) = 46,720 GiB-hours, less 25 included = about
  $420/month."
- C6 1.9 arithmetic table: "Containers memory, 64 GiB always-on, 730 h | $420.48/month |
  $0.0000025/GiB-s", "Containers memory, 12 GiB always-on, 730 h | $78.84/month", and
  "Containers CPU, 1 vCPU always-on, 730 h | $52.56/month | $0.000020/vCPU-s".

Arithmetic check (mine):
- 64 GiB x 730 h x 3600 s = 168,192,000 GiB-s. Less the 25 GiB-hours included
  (90,000 GiB-s) = 168,102,000, x $0.0000025 = $420.26. C6's $420.48 equals
  168,192,000 x $0.0000025, i.e. the included 25 GiB-hours were not subtracted.
- 12 GiB: with credit $78.62, without $78.84. C6 used the no-credit value.
- 1 vCPU x 730 h x 3600 s = 2,628,000 vCPU-s. Less the 375 included vCPU-minutes
  (22,500 s) = 2,605,500, x $0.000020 = $52.11. C6's $52.56 is the no-credit value.

Verdict: C6's three Containers always-on figures are each about 0.9% high because the
included allowances were dropped. Small in dollars, but it is the same error class the
spec must avoid, and C6's table is presented as checkable arithmetic.

#### D4. Cloudflare Containers egress for 10 TB/month: $225.00 (A6) vs $230.40 (C6)

- A6 1.14: "10 TB/month of container egress on Cloudflare = 9 TB billable x $0.025 =
  $225/month."
- C6 F27: "Containers egress is $0.025/GB beyond 1 TB included in North America and
  Europe ... [derived] for the arithmetic: 10 TB/month = 9,216 GB billable = $230.40;
  20 TB/month = 19,456 GB billable = $486.40."

Verdict: A6 uses decimal TB (9 TB = 9,000 GB); C6 uses binary TB (9 x 1024 = 9,216 GB).
Both are internally consistent, they disagree by 2.4%, and neither states its
convention. The spec must fix one.

#### D5. One always-on Durable Object: A6 says $4.20 in one section and $4.11 in another

- A6 1.5: "using Cloudflare's own conversion of 128 MB / 1 GB = 0.128 as used in their
  worked examples ... $12.50/1,000,000 GB-s times 0.128 GB times 3,600 s times 730 h =
  about $4.20 per object-month at list rate".
- A6 2.3: "One always-on object is roughly $4.11/month at list rate."

Arithmetic: with 0.128, $12.50 x 0.128 x 3600 x 730 / 1,000,000 = $4.2048. With 0.125
(that is, 128/1024), the same product is $4.1063. So section 1.5 uses Cloudflare's own
0.128 and section 2.3 uses a binary conversion. The two figures in one file differ by
2.3%. Verdict: internal inconsistency in A6. Use 0.128, because Cloudflare's own worked
examples use it and A6 says so explicitly.

#### D6. "Tunnel is free on all plans": [verified] in A1 and A6, [unverified] in C6

- A6 1.12: "Cloudflare Tunnel is available on all plans with no per-tunnel charge",
  citing https://developers.cloudflare.com/tunnel/ ("Available on all plans"). Label
  [verified].
- A1 F14: "The tunnel itself costs nothing on any plan. The only tunnel-specific charge
  found is for exceeding 1,000 tunnels per account", citing
  https://developers.cloudflare.com/tunnel/features/tunnels-for-platforms/ for
  "Tunnels for Platforms costs $4.50 per additional tunnel per month. The first 1,000
  tunnels in every account remain included at no cost." Label [verified].
- C6 F19: "[unverified] for a general 'Tunnel is free on all plans' claim:
  developers.cloudflare.com/tunnel/pricing/ returned HTTP 422 from the reader and I could
  not read a dedicated pricing page. This matters because the whole architecture rests on
  Tunnel staying free".

Verdict: not a factual contradiction. A1 and A6 have a primary-source sentence plus a
concrete overage price; C6's objection is that no dedicated pricing page rendered. The
spec should cite the "Available on all plans" sentence and the $4.50 figure, and pair
them with C6 F25: SSSA section 4.2, "We reserve the right to change the fees that we
charge for the Service, at any time in our sole discretion, provided that we give you at
least thirty (30) days' prior notice."

#### D7. Cloudflare Zero Trust seat price: $7/user/month [verified] by A5, [unverified] by A6 and A1

- A5 1.16, citing https://www.cloudflare.com/sase/products/access/ (read 2026-10-29):
  "Free Plan $0 forever. Best for teams under 50 users or enterprise proof-of-concept
  tests." and "Pay-as-you-go $7 per user/month (paid annually)". Label [verified].
- A6 1.21: "I attempted https://www.cloudflare.com/plans/zero-trust-services/ ...
  Neither rendered a pricing table ... Label: [unverified] ... Do not put $7/user/month
  in the spec without checking the live plans page."
- A1 open question 1: "Cloudflare One seat pricing. Not established from a primary source
  on 2026-10-29 ... [unverified]".

Verdict: A6 and A1 read the plans page, which does not render a table. A5 read a
different Cloudflare page, the SASE Access product page, which does publish the seat
price. The number is supported by a primary source; the [unverified] labels in A6 and A1
are about a page they could not read, not about the number being wrong. The spec can
carry $7/user/month with A5's citation.

#### D8. Access SLA: found by A5, not found by C6

- A5 1.16: the Access plan comparison table states a "100% uptime guarantee (SLA)" on
  both paid plans. Label [verified].
- C6 open question 3: "What Cloudflare's SLA coverage is for the Zero Trust and Tunnel
  products specifically ... I did not find a Tunnel or Access SLA.
  www.cloudflare.com/sla/ returned HTTP 422 from the reader."

Verdict: A product page advertising an SLA and a general SLA index that does not list it
are compatible. The spec must not state that no Access SLA exists.

#### D9. Enterprise request body size: 500 MB (B5) vs up to 5 GB (A6, C6)

- B5-storage.md F12: "Cloudflare's request body size limit by plan is 100 MB on Free and
  Pro, 200 MB on Business, 500 MB on Enterprise, with only Enterprise able to request an
  adjustment."
- A6 1.2, from the same page: "Request body size is set by the Cloudflare zone plan, not
  the Workers plan. Free/Pro 100 MB, Business 200 MB, Enterprise up to 5 GB self-serve."
  and, separately, "CDN cache limits are 512 MB for Free/Pro/Business and 5 GB for
  Enterprise."
- C6 F31: "Free 100 MB, Pro 100 MB, Business 200 MB, Enterprise up to 5 GB."

Verdict: B5 appears to have carried the 512 MB CDN cache figure into the request-body
row. A6 read both rows on
https://developers.cloudflare.com/workers/platform/limits/ and distinguishes them. The
spec's upload-size design constraint (B5 R4, C6 R7) should use 5 GB for Enterprise and
should cite A6 or C6, not B5.

#### D10. cloudflared latest release: 2026.10.5 (six files) vs 2026.10.6 (C6)

- A1 F1: "2026.10.5 published 2026-10-27T13:31:37Z; 2026.10.4 2026-10-26 ...". Also
  A5 line 861, B4 line 527, B8 lines 624-625, C1 line 150, C3 line 410 - all six report
  2026.10.5 as the latest release, all read 2026-10-29.
- C6 F41: "published 2026.10.4 on 2026-10-26, 2026.10.5 on 2026-10-27 and 2026.10.6 on
  2026-10-29."

Verdict: C6 is correct. 2026.10.6 was published 2026-10-29T12:18:25Z, after the six
earlier reads (10:22 to 11:46 UTC) and before C6's read (12:44 UTC). Verified in 1.4, V3.
This is snapshot drift rather than error, but the spec must not cite 2026.10.5 as
current.

#### D11. `enableInternet` default: true (A2) vs false (C6)

- A2-containers-sandbox.md F84: "Its README documents `sleepAfter` defaulting to `"10m"`
  and `enableInternet` defaulting to `true` on the class." Source: the
  cloudflare/containers README, read via `gh api` 2026-10-29.
- C6 F2, quoting https://developers.cloudflare.com/sandbox/concepts/security/ (page
  last updated 2026-09-30): "A Container starts with `enableInternet: false` by default".
  Label [verified].

Verdict: two different artefacts give opposite defaults for the same field. A2's source
is the SDK class README; C6's is the Sandbox security page. The spec must pick one and
test it, because C1's recommendation 15 and C6's R6 both lean on egress being off by
default for untrusted CI.

#### D12. Orchestrator: Coolify (B2) vs Nomad with k3s as alternative (B3)

- B2-selfhosted-paas.md 3.1: "Default orchestrator = Coolify."
- B3-orchestrators.md 3.2: "Make Nomad the primary orchestrator candidate, with k3s as
  the alternative."
- B2's own open questions name the gap: "Overlap with B3: if a real scheduler
  (k3s/k0s/Nomad/Swarm) is chosen there, the PaaS layer may be redundant. B2 assumes a
  PaaS is wanted to avoid operating a scheduler directly; that assumption should be
  reconciled with B3's recommendation."

Verdict: unresolved design decision, not a factual error. The two files answer different
questions (B2: which PaaS; B3: which scheduler) and neither reconciles the other.

#### D13. Self-hosted Workers runtime: adopt celld for Tier-2 DO state (A4) vs "do not build one, exit route only" (B8)

- A4-durable-objects-workers.md 2.1: "Tier 2, move to own metal. Anything that is really
  a database or a job queue wearing a DO costume ... Long CI runs, container
  orchestration state and bulk artifact indexing all belong on celld or on plain
  Postgres, not on a Cloudflare DO."
- B8-prior-art-control-plane.md 3.12: "Do not build a self-hosted Workers runtime. The
  inverse direction (WDL, OpenWorkers, creek) is already crowded and all three
  self-describe as early ... The self-hosted-Workers projects matter only as an exit
  route."
- Related coverage gap: B8 F11 inventories the self-hosted Workers field as wdl-dev/wdl
  (55 stars), openworkers/openworkers-runner (237 stars) and solcreek/creek (7 stars),
  and concludes "all three self-describe as early". denoland/celld, which A4 read the
  same day at 6,169 stars, Apache-2.0, Rust, v0.6.3 published 2026-10-21, with 328 files
  and a full service table, is absent from B8's list entirely.

Verdict: B8's conclusion is drawn from an incomplete candidate set. A4 and B8 disagree
on whether a self-hosted Workers-plus-DO platform is a production component or an exit
route, and A4 is the file that actually read one.

#### D14. CVE id for workerd advisory GHSA-g76q-p3jj-mm56: unresolved (A3) vs CVE-2023-48230 (C1)

- A3-workerd.md F20: "GHSA-g76q-p3jj-mm56: 'WebSocket message can cause crash', severity
  Medium, published 2023-11-21. Its CVE id and affected range did not resolve through the
  global advisory endpoint (HTTP 404) - [unverified for CVE id / version range]".
- C1-threat-model.md open question 5: "`gh api repos/cloudflare/workerd/security-advisories`
  returned two: GHSA-g76q-p3jj-mm56 / CVE-2023-48230 (WebSocket message can cause crash,
  medium, 2023-11-21) and GHSA-8vx6-69vg-c46f / CVE-2023-2512 (buffer under-read, medium,
  2023-05-12)."

Verdict: same endpoint, same date, two different answers. One is wrong. A3 explicitly
flagged its own as unverified; C1 states the CVE id without a caveat. Both agree on
severity, summary and publish date, and both agree these are DoS-class and old.

#### D15. GitHub metadata drift within a single session

- cloudflared stars: 16,336 (A1 F1, F13) vs 16,337 (A5 line 854, B4 lines 527 and 783,
  B8 line 623, C1 line 155, C3 line 410). My own `gh api` call today returned 16,337.
- frp stars: 110,282 (A1 F13) vs 110,283 (B4 table 2.1).
- rustfs stars: 35,525 (A6 1.18) vs 35,526 (B5 comparison table).
- SeaweedFS pushed_at: 2026-10-29T10:32:07Z (A6 1.18) vs 2026-10-29T12:22:47Z (C6 F38).
- MinIO: A6 1.17 gives pushed_at 2026-04-24T17:54:39Z; B5 R1 says "archived as of
  2026-04-25".

Verdict: all of these are reads minutes apart on the same day, not errors. The finding
for the spec is that no GitHub star count, push timestamp or release date in this set is
stable, and every one of them is presented as a plain fact. B6 open question 10 says this
out loud ("Star counts, release dates and issue counts are point-in-time as of
2026-10-29 and will drift"); the other files do not.

#### D16. AX41 base price and EUR/USD ratio: A6 and C6 use EUR 59.00 and 1.19; the C2 scratch model uses EUR 57.30 and 1.1710

Noted for completeness because it changes the TCO output. This is the only entry in
section 1.1 that involves a file outside the 20. /workspace/.tco_scratch/tco.py, which
is not one of the research files and which I read but did not modify, states:
"EUR->USD uses Hetzner's own published USD figures (ratio 67.10/57.30 = 1.1710)" and
"AX41 = 57.30 + 1.70". A6's currency note derives "about 1.19 USD per EUR ... from
Hetzner's own addon table (EUR 26.00 / USD 31.00, EUR 30.00 / USD 36.00, EUR 36.00 / USD
43.00)". I verified the addon table today (1.4, V4): EUR 26.00/USD 31.00, EUR 30.00/USD
36.00, EUR 36.00/USD 43.00 all appear as published, giving ratios of 1.192, 1.200 and
1.194. A6's 1.19 is sound. The live AX matrix page today shows EUR 59.00 per month for
AX41, matching A6 and C6, not EUR 57.30. The EUR 1.70 figure on that page is the
"Additional Single IP" addon, so the C2 model has priced an extra IP into its base box.
Verdict: the C2 TCO model's USD figures are about 1.6% low from the FX ratio and about
2.9% low from the base price, before the extra IP. One FX assumption and one base price
should be fixed across the set.

#### D17. Hours per month: 730 (A6, C6) vs 720 (C2 scratch) vs 624 (implied by C6's use of Hetzner's published hourly rate)

- A6 1.14 uses 730 h throughout ("AX41 at EUR 59.00/month over 730 hours", "64 GiB held
  for a month (730 h)").
- C6 1.9 uses 730 h in its table headers and simultaneously quotes Hetzner's published
  EUR 0.0945/hour, which implies 624 h (see D2).
- /workspace/.tco_scratch/tco.py defines SEC_MO = 30 * 24 * 3600, that is 720 h, and uses
  it for every Cloudflare duration line.

Verdict: three conventions in one research set. On the $0.0000025/GiB-second memory rate,
730 h vs 720 h is a 1.4% difference on every always-on memory line; 730 h vs 624 h is
17%. The spec must name one.

#### D18. Average bandwidth for a monthly volume: A6 says 10 TB is "about 4 Mbps", C6 says 20 TB is "about 0.5 Mbps"

- A6 1.14: "10 TB/month sustained averages about 4 Mbps, well inside the 1 Gbit port."
- C6 F29: "a 1 GBit/s port sustained for a 30-day month carries roughly 328 TB, so
  20 TB/month is about 6% of the port and about 0.5 Mbps average."

Arithmetic (mine, decimal TB, 730 h = 2,628,000 s):
- 10 TB/month = 10e12 bytes x 8 / 2,628,000 s = 30.4 Mbps, which is about 3.8 MB/s.
- 20 TB/month = 60.9 Mbps.
- C6's 328 TB per month at 1 Gbit/s checks out: 1e9 bit/s x 2,628,000 s / 8 = 328.5 TB.

Verdict: both files reach the correct conclusion (the volume is far inside a 1 Gbit port)
and both stated average rates are wrong. A6's 4 Mbps matches 4 MB/s, so it is probably a
unit slip. C6's 0.5 Mbps is low by about 120x. The spec should quote either the
percentage of port (C6's 6% is right) or a computed Mbps, not either of these two
sentences.

#### D19. The "4.5x cheaper on Hetzner" CPU claim depends on the core denominator

- A6 1.14: "Across 6 physical cores: EUR 0.01347 per vCPU-hour. At Hetzner's own 1.19
  USD/EUR ratio: $0.0160 per vCPU-hour = $0.00000446 per vCPU-second. Cloudflare
  Containers CPU: $0.000020 per vCPU-second. Ratio: Cloudflare is about 4.5x more
  expensive per vCPU-second than a 100%-utilised AX41 core."
- /workspace/.tco_scratch/tco.py divides the same box by 12 threads in one place and by 6
  cores in another: "per thread ${AX41_USD/12:.2f} per core ${AX41_USD/6:.2f}".

Arithmetic (mine): 59.00 / 730 / 6 = EUR 0.01347 per vCPU-hour; x 1.19 / 3600 =
$0.00000445 per vCPU-second; $0.000020 / $0.00000445 = 4.49. A6's arithmetic is correct.
Divide by 12 threads instead and the ratio is 2.25x.

Verdict: the headline 4.5x is a choice of denominator, not a measurement. A6 says so in
its own caveat: "the AX41 is a 2019 Zen 2 part. Per unit of actual work the gap is wider
than 4.5x, and the comparison is against a box that must be paid for whether or not it is
used." The spec must state the denominator and must not present 4.5x as a measured
cost-per-unit-of-work.

#### D20. DO per-object storage limit on the Free plan is present in two files and absent in a third

- A4 1.3: "the FAQ states the per-DO limit is 10 GB on Paid and 1 GB on Free".
- C6 F33: "capped at 10 GB storage per object on Workers Paid and 1 GB on Free".
- A6 1.6's limits table lists "Storage per account | Unlimited (Paid) / 5 GB (Free)" and
  "storage per DO 10 GB" with no Free-plan per-object figure.

Verdict: an omission rather than a contradiction, but A6 is the file the spec would most
naturally cite for limits, and its table is incomplete for the Free plan.

### 1.2 Internal inconsistencies inside a single file

- I1. A6 1.5 vs A6 2.3: $4.20 vs $4.11 for one always-on DO (see D5).
- I2. A6 1.14 vs A6 2.1: 1.14 concludes "self-hosting wins on always-on bulk memory, disk
  and egress. Cloudflare wins decisively on bursty or idle-heavy CPU", and 2.1 repeats
  the same split correctly. No conflict. Flagging only because 1.14's own caveat
  ("the comparison is against a box that must be paid for whether or not it is used")
  is the load-bearing qualifier and is easy to drop when the section is summarised.
- I3. A2 F84 vs A2's own security section: F84 records `enableInternet` defaulting to
  true on the Container class, while A2 F53 to F57 describe the outbound-handler model
  that only matters when egress is constrained. A2 does not reconcile the two. See D11.
- I4. B8 F6's limits table and B8 3.5 both state "1,000 tunnels free per account, $4.50
  per additional tunnel per month", which matches A1 F14. No conflict. B8 F6's table
  omits the VPC Services per account limit of 1,000 that A5 1.2 and B4 table 2.2 both
  carry from https://developers.cloudflare.com/workers-vpc/platform/limits/.

### 1.3 Snapshot drift that is not an error but must not be cited as current

- S1. cloudflared latest release: 2026.10.5 in six files, 2026.10.6 in C6. Current as of
  2026-10-29T12:18:25Z is 2026.10.6 (verified, V3).
- S2. cloudflared pushed_at: 2026-10-29T10:22:59Z in A1; 2026-10-29T12:12:16Z in C6. My
  own call today returned 2026-10-29T12:12:16Z, matching C6.
- S3. Star counts and pushed_at values (see D15).
- S4. A1 and A5 read https://developers.cloudflare.com/cloudflare-one/account-limits/ on
  the same day and recorded different "Last updated" dates (Oct 16, 2026 and Sep 4, 2026)
  and different route limits. This is the mechanism behind D1.

### 1.4 Verification calls I made myself on 2026-10-29

Four calls, all through the pkgforge gateway pinned to tinyfish or `gh api`. No fallback
to built-in web_search/web_fetch was used.

- V1. `https://search.web.pkgforge.dev/search?q=cloudflare+one+account+limits+routes+per+account+50000&count=5&provider=tinyfish`
  returned as the first result
  https://developers.cloudflare.com/changelog/post/2026-10-16-tunnels-for-platforms-and-50k-routes/
  with the snippet "The default limit for routes is now 50,000 per account, up from 1,000.
  This limit covers CIDR routes and hostname routes for Cloudflare Tunnel". Resolves D1
  in favour of A1 and B8. [verified]
- V2. `https://read.web.pkgforge.dev/?url=https%3A%2F%2Fwww.hetzner.com%2Fdedicated-rootserver%2Fmatrix-ax%2F&provider=tinyfish`
  returned, for AX41, "EUR 59.00 per month, excl. VAT" and "EUR 0.0945 per hour, excl.
  VAT", CPU "AMD Ryzen 5 3600", RAM "64 GB DDR4", NVMe "2x 512 GB NVMe", Connection
  "1 GBit/s port", and "Traffic usage is unlimited and free of charge. Please note that
  our unlimited traffic policy does not apply to servers that have the 10G uplink
  addon." Monthly prices for the four models read EUR 59.00, 79.00, 159.00 and 319.00,
  matching A6's table exactly. Setup fees read EUR 0.00, 49.00, 129.00 and 304.00,
  matching A6. Storage Box prices on the same page read 1 TB EUR 3.20, 5 TB EUR 10.90,
  10 TB EUR 20.80, 20 TB EUR 40.60, matching A6 1.13. Resolves D2 and D16. [verified]
- V3. `gh api repos/cloudflare/cloudflared/releases --jq '.[0:4]|.[]|{tag_name,published_at}'`
  returned 2026.10.6 at 2026-10-29T12:18:25Z, then 2026.10.5 at 2026-10-27T13:31:37Z,
  2026.10.4 at 2026-10-26T11:19:58Z, 2026.10.3 at 2026-10-21T13:17:53Z.
  `gh api repos/cloudflare/cloudflared --jq '{stargazers_count,open_issues_count,pushed_at}'`
  returned 16,337 stars, 572 open issues, pushed_at 2026-10-29T12:12:16Z. Resolves D10
  and S1/S2 in favour of C6. [verified]
- V4. `https://read.web.pkgforge.dev/?url=https%3A%2F%2Fdocs.hetzner.com%2Frobot%2Fdedicated-server%2Fdedicated-server-hardware%2Fprice-server-addons%2F&provider=tinyfish`
  (page "Last change on 2026-10-07") returned, as EUR then USD per month: 16 TB SATA
  Enterprise HDD 26.00 / 31.00; 22 TB SATA Enterprise HDD 36.00 / 43.00; 1 TB NVMe SSD
  30.00 / 36.00; 2 TB NVMe SSD 54.00 / 64.00; 15.36 TB NVMe SSD Datacenter Edition
  320.00 / 378.00. All five match A6 1.13 exactly. Confirms A6's derived 1.19 ratio.
  [verified]

One further observation from V2, recorded as a gap rather than a finding: the AX matrix
page publishes an "Idle Power Usage" row and a "Max Power Usage" row, described as
"Power consumption values of the basic configuration. The values originate from the
server qualification and may deviate in practice." The extraction carried the values
26 / 34 / 61 Watt idle and 83 / 166 / 349 Watt maximum, but the first model column's
value did not survive extraction and I could not map each number to a specific model.
C6 F28 declines to quote a wattage for exactly this reason: "The page also publishes
per-model idle and maximum power draw, but the rendered table did not align
unambiguously with each model, so I do not quote a wattage." The page does publish the
figures; a browser read would settle the mapping. See Q26.

### 1.5 Numbers four or more files agree on (safe to cite)

Recorded so the spec knows which figures survived the cross-check unchanged.

- R2 pricing: $0.015/GB-month Standard storage, $0.01/GB-month Infrequent Access,
  $4.50/million Class A, $0.36/million Class B, free egress, free tier 10 GB-month plus
  1 million Class A plus 10 million Class B. Identical in A4 1.20, A6 1.3, B5 F13 and
  C6 F30, all citing https://developers.cloudflare.com/r2/pricing/ (page "Last updated
  Oct 26, 2026"). [verified]
- Cloudflare Containers instance types: lite 1/16 vCPU / 256 MiB / 2 GB; basic 1/4 /
  1 GiB / 4 GB; standard-1 1/2 / 4 GiB / 8 GB; standard-2 1 / 6 GiB / 12 GB; standard-3
  2 / 8 GiB / 16 GB; standard-4 4 / 12 GiB / 20 GB. Identical in A2 F5, A6 1.7 and C6
  F5. [verified]
- Durable Objects pricing: 1 million requests/month included then $0.15/million; 400,000
  GB-s/month included then $12.50/million GB-s; the 128 MB footnote; and the worked
  examples at $419.30 without hibernation and $20.65 with it. Identical in A4 1.7 and
  A6 1.5. [verified]
- Containers and Sandboxes GA on 2026-04-13. Identical in A2 F1 and A6 1.7. [verified]
- The soft 1,000 requests per second per Durable Object. Identical in A4 1.6, A6 1.6 and
  C6 F33. [verified]
- Cloudflare Tunnel does not support gRPC on a public hostname. Identical in B6 F13 and
  B3 F57, both quoting
  https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/grpc/
  ("Cloudflare Tunnel supports gRPC traffic via private subnet routing. Public hostname
  deployments are not currently supported.") and B6 additionally quoting
  https://developers.cloudflare.com/network/grpc-connections/. [verified]
- minio/minio is archived and its README says it is no longer maintained. Identical in
  A6 1.17 and B5 F1, both from `gh api`. [verified]
- The Cloudflare Containers cross-tenant disclosure: reported 2026-09-04 15:26 UTC by
  Oren Yomtov of Accomplish; dm-thin with `skip_block_zeroing` and 64 KiB thin blocks;
  residual material on 18 of 24 placements and 20 of 22 nodes across four continents;
  cleanup of pre-mitigation cached snapshots complete 2026-09-19 15:03 UTC. Identical in
  A2 F62, C6 F1 and C4 1.2, all citing
  https://blog.cloudflare.com/containers-cross-tenant-vulnerability/. [verified]
- The Cloudflare account API budget of 1,200 requests per 5 minutes, that is about 4
  requests per second. Identical in B8 F6 and C6 F11, both citing
  https://developers.cloudflare.com/fundamentals/api/reference/limits/. [verified]
- cloudflared holds four long-lived connections to two data centers, over QUIC by
  default on UDP 7844 with an HTTP2 fallback. Identical in A1 F2 and A6 1.12. [verified]
- workerd is not a hardened sandbox, and self-hosting means owning the V8 patch gap.
  Identical in A3 F13/F14 and A4 1.21. [verified]
- Workers Paid is a $5/month minimum; requests 10 million/month included then
  $0.30/million; CPU 30 million CPU-ms included then $0.02/million; no egress charge;
  static asset requests free and unlimited. Identical in A4 1.15, A6 1.1 and C6 F26.
  [verified]

### 1.6 Where a file's own recommendation is not supported by its own evidence

- R1. A6 1.21's [unverified] label on the Zero Trust seat price is correct about the page
  A6 read, but A6's open question 2 ("Cloudflare Zero Trust / Cloudflare One current
  per-user price ... This is A5's topic") is now closed by A5 1.16. See D7.
- R2. B8 3.12's "all three self-describe as early" rests on a three-project list that
  omits celld. See D13.
- R3. C6 1.9's arithmetic table is presented as "stated so it can be checked", and three
  of its Containers lines do not survive that check. See D3.
- R4. A6's currency note says "I use it only where explicitly marked as derived", and
  1.14 then uses the 1.19 ratio inside a block whose label reads "[unverified] for every
  derived ratio". That is consistent. Flagging only because the derived $0.036/GB-month
  NVMe figure from that block is quoted as fact by C6 F30 and by C6 R4. C6 labels it
  "[carried from A6, not independently verified]", which is the correct handling.

---

## 2. What this changes for the spec

1. Fix the route limit at 50,000 per account and cite the 2026-10-16 changelog, not the
   account-limits page. Reason: D1. A5's 1,000 is a pre-changelog reading of a page whose
   "Last updated" date A1 recorded as Oct 16, 2026. I confirmed 50,000 independently
   today. Any capacity or sharding decision sized from 1,000 is wrong by 50x.

2. Pick one hours-per-month constant and one EUR/USD ratio, and print both in the spec's
   assumptions block. Reason: D17, D16, D2. The set currently contains 730, 720 and an
   implied 624, and two FX ratios (1.19 and 1.1710). On the memory rate alone that is a
   17% spread on every always-on line. Use 730 h (a 365-day year averaged) and Hetzner's
   own published USD figures where they exist, which is what A6 did and what I verified.

3. Re-derive the three Cloudflare Containers always-on figures with the included
   allowances subtracted, and use decimal TB for egress. Reason: D3, D4. C6's $420.48,
   $78.84 and $52.56 should be $420.26, $78.62 and $52.11. A6's $225.00 and C6's $230.40
   for 10 TB of egress are a decimal-versus-binary TB disagreement; choose decimal and
   say so.

4. Use $4.20, not $4.11, for one always-on Durable Object. Reason: D5. Cloudflare's own
   worked examples use 128 MB / 1 GB = 0.128, and A6 1.5 says so explicitly while A6 2.3
   silently switches to 0.125.

5. Do not cite "latest cloudflared is 2026.10.5". Reason: D10, V3. 2026.10.6 shipped at
   2026-10-29T12:18:25Z. Six of the seven files that name a version are stale snapshots
   taken that morning.

6. State the core denominator in every per-vCPU price comparison. Reason: D19. The 4.5x
   figure divides a 6c/12t box by 6; dividing by 12 gives 2.25x. Neither is a measurement
   of work per second. A6's own caveat says this; the spec must repeat it next to the
   number.

7. Replace both average-bandwidth sentences with a computed figure. Reason: D18. 10 TB
   per month over 730 h is 30.4 Mbps; 20 TB is 60.9 Mbps. A6's "about 4 Mbps" is a unit
   slip for about 4 MB/s, and C6's "about 0.5 Mbps" is low by roughly 120x. The
   conclusion (well inside a 1 Gbit port) is right either way.

8. Carry the Zero Trust seat price as $7 per user per month with A5's citation, and drop
   the "unverified" that A6 and A1 attach to it. Reason: D7. A5 read
   https://www.cloudflare.com/sase/products/access/ and quoted the plan lines.

9. Correct the Enterprise upload limit to 5 GB and cite A6 or C6, not B5. Reason: D9.
   B5 F12's "500 MB on Enterprise" appears to be the CDN cache figure from the same page.

10. Resolve the `enableInternet` default before the spec leans on it. Reason: D11. A2
    reads the Container class README as defaulting to true; C6 reads the Sandbox security
    page as defaulting to false. C1 recommendation 15 and C6 R6 both assume egress is off
    for untrusted CI.

11. Decide the orchestrator question explicitly, and record that B2 and B3 answer
    different questions. Reason: D12. B2 picks a PaaS (Coolify), B3 picks a scheduler
    (Nomad, k3s alternative), and B2's own open question flags that one may make the
    other redundant.

12. Decide whether a self-hosted Workers-plus-DO platform is a production component or an
    exit route, and read celld before deciding. Reason: D13. A4 read it at 6,169 stars,
    Apache-2.0, v0.6.3 on 2026-10-21; B8's inventory of the field omits it and concludes
    the whole category is early.

13. Re-read the workerd advisory list and settle the CVE id for GHSA-g76q-p3jj-mm56.
    Reason: D14. A3 says the id did not resolve and labels it unverified; C1 states
    CVE-2023-48230 without a caveat. Only one can be right.

14. Treat every GitHub metadata figure in the spec as timestamped. Reason: D15, S3. Star
    counts moved between reads taken minutes apart on the same day.

15. Add the Hetzner AX idle and maximum power figures once the model mapping is settled,
    and keep the mini-PC leg labelled as unevidenced. Reason: 1.4 observation, Q26, Q27.
    The AX page publishes both rows; C6 declined to quote them because the table would not
    align, and no file in the set contains a mini-PC price, a wattage or an electricity
    rate.

---

## 3. Not covered / open questions

Named precisely, each with what would close it.

Pricing and cost model

- Q1. Workers VPC price at GA. A5 1.2 read
  https://developers.cloudflare.com/workers-vpc/platform/pricing/ (page "Last updated Sep
  16, 2026"): "Free during Open Beta: Workers VPC is free during the open beta period.
  Standard Workers pricing applies for compute time and requests." C6 F24 adds that SSSA
  section 5 lets Cloudflare discontinue Beta Services and any Customer Content stored as
  part of them at its sole discretion. B8 open question 3: "Treat all VPC cost figures as
  unknown." Close by: a published GA price or a written contingency. The entire
  control-plane-to-data-plane path is currently an unpriced line item.
- Q2. Cloudflare Tunnel's long-term price. A1 and A6 verified "Available on all plans" and
  the $4.50 per additional tunnel past 1,000. C6 could not read a dedicated pricing page
  and records SSSA 4.2's 30-day fee-change right. Close by: a Cloudflare statement, or a
  stated contingency in the spec.
- Q3. Argo Smart Routing price. A6 open question 4: the docs page says only "Explore
  pricing options for Argo in the dashboard".
- Q4. Whether the R2 subscription is gated behind the $5 Workers Paid plan. A6 open
  question 3, from https://developers.cloudflare.com/r2/get-started/.
- Q5. Workers for Platforms dispatch-namespace pricing. A6 open question 5 and A4 open
  questions 1 and 2. A6's "billed as ordinary Workers usage" is an inference from the
  absence of a pricing page, which A6 says is weaker than a positive statement.
- Q6. Per-core Cloudflare CPU performance against an AX41. A6 open question 7. Price per
  vCPU-second is not work per vCPU-second.
- Q7. AWS S3 per-request rates. A6 open question 1. Only needed if S3 is the baseline;
  do not use $0.005 per 1,000 PUT or $0.0004 per 1,000 GET until the AWS page renders.
- Q8. Basin Catalog billing start date. A6 open question 11, from the 2026-05-28
  changelog's "at least 30 days notice".
- Q9. Enterprise and contract pricing for everything above. A6 open question 9. Every
  figure in the set is self-serve list price.
- Q10. A break-even estimate with stated assumptions that survives cross-check. C5 E4
  establishes there is no peer-reviewed current Cloudflare-versus-Hetzner break-even to
  cite. C6 1.9 supplies an arithmetic table, but three of its Containers lines fail the
  check in D3 and its egress line disagrees with A6's in D4. No file in the set currently
  produces one.

Hardware, power and the operator's own site

- Q11. The Hetzner AX idle and maximum power draw, mapped to specific models. C6 F28
  declined to quote a wattage. I read the page today: it publishes both rows with 26 / 34
  / 61 W idle and 83 / 166 / 349 W maximum appearing in the extraction, but the first
  model column's value did not survive extraction. Close by: a browser read of
  https://www.hetzner.com/dedicated-rootserver/matrix-ax/.
- Q12. Mini-PC capex, wattage and electricity price. The C2 brief asks for "a mini PC,
  power draw, bandwidth". No file in the 20 contains any of the three. C3 F49 covers only
  the absence of a BMC on consumer boards. The C2 scratch model uses EUR 359 capex, 10 W
  average and US EIA rates of $0.1816/kWh residential and $0.1447/kWh commercial for
  August 2026; none of those figures appears in the research set and none is verified
  here. Close by: reading the vendor page and the EIA table.
- Q13. Whether the operator's machines sit somewhere with a real uplink. C6 F29 and R5.
  Hetzner's unlimited traffic is in the Hetzner price only. A consumer uplink makes the
  egress argument fictional. Close by: the operator naming his uplink and its monthly cap.
- Q14. Uptime of the operator's own data plane. C6 open question 8. Nothing in the set
  measures it.

Availability, ToS and operations

- Q15. Cloudflare Tunnel and Access SLA coverage. C6 open question 3; A5 1.16 found a
  "100% uptime guarantee (SLA)" on the Access paid plans. Close by: reading the Tunnel and
  Access SLA pages directly.
- Q16. Whether SSSA 2.2.1(j), "use the Services to provide a virtual private network or
  other similar proxy services", is enforced against a single-user private-network tunnel.
  C6 open question 1. Close by: a written answer from Cloudflare, or a decision to keep
  the private-network surface reachable only by the operator.
- Q17. Whether the operator intends to let any other human use the dashboard, and whether
  he intends to offer storage to third parties as a service. These gate C6 R9 (SSSA
  2.2.1(a) resale prohibition) and B5 O1 and R3 (AGPL for Garage and Silo). Both are
  business facts no file can supply.
- Q18. A real figure for human operational cost. C6 open question 7: "I could not verify
  one from a primary source, and I refuse to invent it." The shape is documented
  (cloudflared releases every one to three days, SeaweedFS about 4.3 releases a month, a
  live unpatched kernel escape in supported Ubuntu LTS, no consistent online backup for
  SeaweedFS). Close by: measuring the first three months.
- Q19. Access authentication log retention. C1 open question 1, carried by C6 open
  question 5. Everything about detecting a rogue replica depends on logs being exported
  immediately.
- Q20. Whether a Cloudflare API token scoped to "Cloudflare One Connectors Write" can
  fetch a tunnel token. C1 open question 4. Not tested. This is the difference between one
  tunnel being compromised and all of them.
- Q21. Cloudflare's position on the Host-header / absolute-form SSRF report. C1 open
  question 3.

Security and isolation

- Q22. Whether a Worker's default `fetch()` can reach RFC1918 or loopback. C1 1.9,
  [unverified] on a practitioner blog, carried by C6 open question 6. No Cloudflare
  primary source in the set states it. If it is false, a plain `fetch()` to an internal
  address is a live SSRF path that no VPC Service registration constrains.
- Q23. Container-escape CVEs found but not read: CVE-2026-31431, CVE-2026-34040, and the
  November 2025 runc breakout set. C6 open question 4, all [unverified]. Each needs a
  primary read before the runtime for untrusted CI is chosen.
- Q24. Whether Access can enforce anything on the Worker-to-VPC-Service hop. C1 open
  question 7. C1 1.14 says the operator's own origin authentication is the only control;
  it was not tested end to end.
- Q25. The blast radius of a compromised Cloudflare account. C1 open question 8.
- Q26. Whether `cf.resolveOverride` closes the DNS-rebind window. C1 open question 9.

Data plane and joins between recommendations

- Q27. Whether SeaweedFS satisfies celld's storage requirements. A4 1.25 lists celld's
  four requirements (conditional create, conditional overwrite, read-after-write
  consistency, ranged reads) and names the qualified stores as Amazon S3, Cloudflare R2,
  Tigris, Google Cloud Storage and Azure Blob Storage, with Backblaze B2, Hetzner Object
  Storage and DigitalOcean Spaces explicitly failing conditional writes. SeaweedFS is in
  neither list. B5 R2 makes SeaweedFS the primary storage engine. If the spec takes B5's
  storage recommendation and A4's Tier-2 Durable Object recommendation, this join is
  untested and nothing in the 20 files closes it. Close by: running `celld diagnose`
  against a SeaweedFS bucket.
- Q28. Whether celld's experimental Containers support is usable. A4 open question 9,
  which A4 itself calls "the largest single gap in this research relative to the stated
  project".
- Q29. celld in production at scale. A4 open question 10: v0.6.3 is described in its own
  docs/limitations.md as a beta release, with no public benchmark or post-mortem.
- Q30. Rivet Actors feature parity. A4 open question 5: only repository metadata was read.
- Q31. Whether a raw TCP tunnel rule reliably carries gRPC plus mTLS. B3 open questions
  and B6 open question 3. Both B6 F13 and B3 F57 document that public-hostname gRPC is
  unsupported; the raw-TCP case is untested and it gates both Woodpecker (B6 R2) and
  Talos (B3 recommendation 5).
- Q32. Whether the 1 MB ingress configuration limit is enforced per tunnel or per account.
  A1 open question 5, B8 open question 6.
- Q33. S3 request throughput and latency through a Cloudflare Tunnel. B5 O6. This decides
  whether storage sits behind the tunnel at all.
- Q34. Whether a container registry works on the chosen store, and how it handles the
  blob-chunk access pattern. B5 O10, explicitly deferred to B6, which did not cover it.
- Q35. Whether the operator's GitHub plan includes the Actions minutes and API limits that
  B6's primary recommendation depends on. B6 open question 7: "No prices were retrieved
  for anything." B6 R1 is the strongest CI recommendation in the set and it has no cost
  line.
- Q36. Whether the 10.76 percent Durable Objects PoP figure is stable. A4 open question
  11: it is live data from a community tracker, not a Cloudflare statement.
- Q37. Whether Cloudflare's status-page location components in `summary.json` are live
  outages or unlaunched locations. C6 F8 caveat: C6 could not determine this from the API
  alone and does not rely on them. The 49-incident figure for 2026-10-13 to 2026-10-28 is
  therefore a floor from a 50-item API window, not a census.
