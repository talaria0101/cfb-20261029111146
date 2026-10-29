# C2 - TCO Model: Cloudflare Paid Products vs Self-Hosted Alternatives

Research subagent: C2-tco-model
Date of all reads: 2026-10-29 (UTC)
Method: every page read through the pkgforge gateway pinned to provider=tinyfish. Two gateway
errors occurred and were handled without fallback to the built-in tools: one HTTP 422 on the
Workers Builds pricing URL (re-issued against the corrected path
`/workers/ci-cd/builds/limits-and-pricing/`, which succeeded) and one HTTP 504 on the EIA table
(retried once after a 5 s sleep, succeeded). No call required the built-in web_search or
web_fetch. Where a number appears only in a search snippet it is labelled as such.

Scope: build a cost model for the operator's design. The control-plane SPA stays on Cloudflare
(Workers Paid, $5/month floor is therefore permanent and unavoidable in every scenario). The
data plane (bulk storage, CI, long-running containers, stateful processes) is the part this
model prices on both sides.

## 0. Rate card used, with sources (all read 2026-10-29)

Cloudflare, USD, list price, tax excluded:

| Product | Meter | Rate | Included on Paid | Source |
| --- | --- | --- | --- | --- |
| Workers | subscription | $5.00/month minimum per account | - | https://developers.cloudflare.com/workers/platform/pricing/ ("Last updated Oct 2, 2026") |
| Workers | requests | $0.30 per additional million | 10 million/month | same |
| Workers | CPU time | $0.02 per additional million CPU-ms | 30 million CPU-ms/month | same |
| Workers | egress | $0 | - | same |
| R2 Standard | storage | $0.015 / GB-month | 10 GB-month | https://developers.cloudflare.com/r2/pricing/ ("Last updated Oct 26, 2026") |
| R2 | Class A ops | $4.50 / million | 1 million/month | same |
| R2 | Class B ops | $0.36 / million | 10 million/month | same |
| R2 | egress | $0, all paths (S3 API, Workers API, r2.dev) | - | same |
| Durable Objects | requests | $0.15 / million | 1 million/month | https://developers.cloudflare.com/durable-objects/platform/pricing/ ("Last updated Oct 18, 2026") |
| Durable Objects | duration | $12.50 / million GB-s | 400,000 GB-s/month | same |
| Durable Objects | SQLite rows read | $0.001 / million | 25 billion/month | same |
| Durable Objects | SQLite rows written | $1.00 / million | 50 million/month | same |
| Durable Objects | SQLite stored data | $0.20 / GB-month | 5 GB-month | same |
| Containers | memory | $0.0000025 / GiB-s | 25 GiB-hours/month | https://developers.cloudflare.com/containers/platform/pricing/ ("Last updated Oct 5, 2026") |
| Containers | CPU | $0.000020 / vCPU-s | 375 vCPU-minutes/month | same |
| Containers | disk | $0.00000007 / GB-s | 200 GB-hours/month | same |
| Containers | egress (NA/EU) | $0.025 / GB | 1 TB/month | same |
| Workers Builds | build minutes | $0.005 / minute | 6,000 minutes/month | https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/ ("Last updated May 29, 2026") |

Self-hosted, list price, tax excluded:

| Option | Price | Specs | Source (read 2026-10-29) |
| --- | --- | --- | --- |
| Hetzner EX44 dedicated | EUR 59.00/month, setup EUR 0.00 | Intel Core i5-13500 (6P+8E), 64 GB DDR4, 2x 512 GB NVMe, 1 GBit/s port, "Traffic: Unlimited *" | https://www.hetzner.com/dedicated-rootserver/ex44/ |
| Hetzner AX42 dedicated | EUR 99.00/month + EUR 49.00 one-time setup | AMD Ryzen 7 PRO 8700GE 8c/16t Zen 4, 64 GB DDR5 ECC, 2x 512 GB NVMe, 1 GBit/s port | https://www.hetzner.com/dedicated-rootserver/ax42/ |
| Hetzner Storage Box BX31 | EUR 20.80/month | 10 TB, unlimited traffic | same page (addon table) |
| Hetzner Cloud CPX22 | EUR 19.99/month | 2 vCPU AMD, 4 GB, 80 GB NVMe, 20 TB traffic incl. | https://www.hetzner.com/cloud/regular-performance/ |
| OVHcloud Advance range | from $147.00/month ex. taxes | 6-24 cores, 32 GB-1 TB RAM, 3-5 Gbps public, 25 Gbps private | https://us.ovhcloud.com/bare-metal/advance/ |
| Beelink SER5 Pro mini PC | $449.00 (3rd-party new, as of Oct 23 2026); list $279.00 | Ryzen 7 5800H 8C/16T Zen 3, 45 W TDP, 120 W adapter, 64 GB DDR4 max, 2x M.2 + 1x 2.5" SATA, 1GbE | price: https://camelcamelcamel.com/product/B08DR39Y7S ; specs: https://awesomeminipc.com/devices/beelink-ser5-pro |
| Electricity, US | 18.16 cents/kWh residential, 14.47 commercial, 14.87 all-sector (August 2026) | EIA Electric Power Monthly Table 5.3, data for August 2026, released Oct 23 2026 | https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_3 |
| Bandwidth, Hetzner dedicated | unlimited, 1 GBit/s uplink, no overage charge | "All root servers have a dedicated 1 GBit uplink by default and with it unlimited traffic." | https://docs.hetzner.com/robot/general/traffic/ |
| Bandwidth, Hetzner cloud | 20 TB included EU, then EUR 1/TB | Hetzner's own published pair in that sentence: "EUR 1 ($1.20)/TB" | same |
| Bandwidth, OVH dedicated | "unlimited, unmetered traffic", minimum 500 Mbps public | fair-use clause allows OVH to cap outgoing throughput by up to 50% | https://us.ovhcloud.com/bare-metal/bandwidth/ |

Currency: Hetzner publishes EUR excluding VAT. This model converts at 1.20 USD/EUR, which is
Hetzner's own published pair on their traffic page ("EUR 1 ($1.20)/TB"). That is a verified
vendor-published rate, not an FX-market quote; the operator should re-check at purchase time.
A6 independently derived about 1.19 from Hetzner's disk-addon table, which agrees.
VAT is not modelled anywhere in this document.

## 1. Findings

### F1. The Cloudflare floor is $5/month and it cannot be removed by self-hosting the data plane

Claim: any design that keeps the control-plane SPA on Cloudflare pays $5.00/month minimum per
account, forever, regardless of how much is moved to own metal. Workers Paid is one subscription
that also covers Pages Functions, Workers KV, Hyperdrive and Durable Objects usage.

Evidence: https://developers.cloudflare.com/workers/platform/pricing/ (read 2026-10-29):
"The Workers Paid plan includes Workers, Pages Functions, Workers KV, Hyperdrive, and Durable
Objects usage for a minimum charge of $5 USD per month for an account."
Label: [verified]

Consequence for the model: the correct comparison is never "Cloudflare total vs self-hosted
total". It is "Cloudflare total vs self-hosted total + $5", because the $5 survives every
migration scenario this spec considers.

### F2. Static asset serving on Cloudflare is free and unlimited, so the SPA itself costs $5

Claim: the dashboard SPA, served as Workers static assets with no Worker invocation, costs the
$5 floor and nothing else. Cloudflare's own Example 2 prices 15 million requests/month with 80%
static assets at $5.00 total.

Evidence: same page, footnote 3 "Requests to static assets are free and unlimited." and
Example 2 (total $5.00, every line item $0). Read 2026-10-29.
Label: [verified]

Trap on the same page, footnote 4: with Workers Caching enabled, cache hits are billed at the
full per-request rate including for static assets. Only CPU time is skipped on a cache hit.
The "free" property is lost if the SPA is fronted by a caching Worker.

### F3. Reference workload tiers used in this model (ESTIMATE, not measured)

Claim: this model prices three tiers. The tier shapes are my invented workload profiles, chosen
to be plausible for a self-hosted control-plane-plus-data-plane design. They are estimates.
The operator must substitute his real numbers; the arithmetic is shown so each line can be
replaced independently.

Tier definitions (per month):

| Dimension | Tier S (light) | Tier M (small production) | Tier L (heavy) |
| --- | --- | --- | --- |
| R2 storage | 50 GB | 500 GB | 2,000 GB |
| R2 Class A ops | 1 million | 5 million | 20 million |
| R2 Class B ops | 20 million | 100 million | 500 million |
| Workers requests | 5 million at 5 ms CPU | 50 million at 7 ms CPU | 200 million at 10 ms CPU |
| Durable Objects | 2 objects, 2 h/day each, 5M requests, 1 GB | 10 objects, 4 h/day each, 50M requests, 100M rows written, 10 GB | 50 objects, 6 h/day each, 200M requests, 200M rows written, 50 GB |
| Containers | 1x standard-2 (1 vCPU, 6 GiB, 12 GB), 2 h/day | 1x standard-2, 8 h/day | 2x standard-3 (2 vCPU, 8 GiB, 16 GB), 24/7 |
| Workers Builds | 500 build minutes | 3,000 build minutes | 10,000 build minutes |

Instance type specs from https://developers.cloudflare.com/containers/platform/pricing/
(read 2026-10-29): standard-2 = 1 vCPU / 6 GiB / 12 GB, standard-3 = 2 vCPU / 8 GiB / 16 GB.
DO duration uses the page's own billing unit: each object is charged for a full 128 MB
regardless of actual usage, so one object-hour = 0.128 GB x 3600 s = 460.8 GB-s.
Excluded from all tier totals, deliberately: Containers egress beyond the included 1 TB, Workers
Logs beyond 20 million events, Logpush, KV, D1, Queues, and any Enterprise discount. These are
additive and listed on the rate card above.
Label: [estimate] for the tier shapes; [verified] for every rate applied to them.

### F4. Cloudflare monthly cost per tier (arithmetic on verified rates)

Tier S:
- Workers: 5M requests and 5M x 5 ms = 25M CPU-ms, both inside the 10M / 30M included. $5.00.
- R2: (50 - 10) GB x $0.015 = $0.60; Class A 1M included, $0; Class B (20 - 10)M x $0.36 = $3.60. Subtotal $4.20.
- DO: requests (5 - 1)M x $0.15 = $0.60; duration 2 objects x 2 h x 30 d x 0.128 GB = 15.36 GB-h = 55,296 GB-s, inside the 400,000 included, $0; storage 1 GB inside 5 GB, $0. Subtotal $0.60.
- Containers 60 h: CPU (3,600 - 375) min = 193,500 vCPU-s x $0.00002 = $3.87; memory (360 - 25) GiB-h = 1,206,000 GiB-s x $0.0000025 = $3.02; disk (720 - 200) GB-h = 1,872,000 GB-s x $0.00000007 = $0.13. Subtotal $7.02.
- Builds 500 min, inside 6,000. $0.
- Total Tier S = 5.00 + 4.20 + 0.60 + 7.02 = $16.82/month.

Tier M:
- Workers: 5.00 + (50 - 10) x $0.30 + ((50 x 7) - 30) x $0.02 = 5.00 + 12.00 + 6.40 = $23.40.
- R2: (500 - 10) x 0.015 = $7.35; (5 - 1) x 4.50 = $18.00; (100 - 10) x 0.36 = $32.40. Subtotal $57.75.
- DO: requests (50 - 1) x 0.15 = $7.35; duration 10 x 4 x 30 = 1,200 object-hours x 0.128 GB = 552,960 GB-s, billable 152,960 rounded up to the next million GB-s unit = 1,000,000 x $12.50/1M = $12.50; rows written (100 - 50)M x $1.00 = $50.00; rows read assumed within the 25 billion included, $0; storage (10 - 5) x $0.20 = $1.00. Subtotal $70.85.
- Containers 240 h: CPU (14,400 - 375) min = 841,500 s x 0.00002 = $16.83; memory (1,440 - 25) = 5,094,000 GiB-s x 0.0000025 = $12.74; disk (2,880 - 200) = 9,648,000 GB-s x 0.00000007 = $0.68. Subtotal $30.24.
- Builds 3,000 min, inside 6,000. $0.
- Total Tier M = 23.40 + 57.75 + 70.85 + 30.24 = $182.24/month.

Tier L:
- Workers: 5.00 + (200 - 10) x 0.30 + ((200 x 10) - 30) x 0.02 = 5.00 + 57.00 + 39.40 = $101.40.
- R2: (2,000 - 10) x 0.015 = $29.85; (20 - 1) x 4.50 = $85.50; (500 - 10) x 0.36 = $176.40. Subtotal $291.75.
- DO: requests (200 - 1) x 0.15 = $29.85; duration 50 x 6 x 30 = 9,000 object-hours x 0.128 = 4,147,200 GB-s, billable 3,747,200 rounded up to 4,000,000 x $12.50/1M = $50.00; rows written (200 - 50) x 1.00 = $150.00; rows read (500 - 25)B x $0.001/M = $0.48; storage (50 - 5) x 0.20 = $9.00. Subtotal $239.33.
- Containers, per standard-3 instance at 730 h: CPU 2 x 730 x 60 = 87,600 vCPU-min, billable 87,225 min = 5,233,500 s x 0.00002 = $104.67; memory 8 x 730 = 5,840 GiB-h, billable 5,815 = 20,934,000 s x 0.0000025 = $52.34; disk 16 x 730 = 11,680 GB-h, billable 11,480 = 41,328,000 s x 0.00000007 = $2.89. Per instance $159.90; two instances $319.80.
- Builds: (10,000 - 6,000) x $0.005 = $20.00.
- Total Tier L = 101.40 + 291.75 + 239.33 + 319.80 + 20.00 = $972.28/month.

Cross-check against Cloudflare's own published examples (same pages, read 2026-10-29): their
15M-request/7 ms example computes to $8.00 and my Workers formula gives
5.00 + 5 x 0.30 + (105 - 30) x 0.02 = 5.00 + 1.50 + 1.50 = $8.00. Their 100M/7 ms example is
$45.40; mine gives 5.00 + 90 x 0.30 + (700 - 30) x 0.02 = 5.00 + 27.00 + 13.40 = $45.40.
Their asset-hosting example is $104.40 for 290M Class B; mine gives (300 - 10) x 0.36 = $104.40.
The model reproduces all three published totals exactly.
Label: [verified] for rates and examples; the tier totals are [derived] arithmetic on them.

### F5. Self-hosted monthly cost per tier

Reference box: Hetzner EX44 at EUR 59.00 = $70.80/month at Hetzner's own 1.20 pair, no setup fee.

- Tier S: one EX44. $70.80/month. Cloudflare is $16.82. Self-hosted costs 4.2x more.
- Tier M: one EX44. 500 GB fits in the 2x 512 GB NVMe (with no redundancy; see F9). $70.80/month. Cloudflare is $182.24. Self-hosted saves $111.44/month.
- Tier L: one EX44 plus a Storage Box BX31 (10 TB) at EUR 20.80 = $24.96, because 2,000 GB does not fit in 1 TB of raw NVMe. $95.76/month. Cloudflare is $972.28. Self-hosted saves $876.52/month.

Alternative self-hosted options for the same tiers:
- Mini PC (Beelink SER5 Pro, 5800H, 45 W TDP, 120 W adapter): hardware $449.00 amortised over 36 months = $12.47/month; power at an assumed 25 W average = 25 W x 730 h = 18.25 kWh/month x $0.1816/kWh (EIA residential, August 2026) = $3.31/month; total $15.78/month. At the $279.00 list price instead: 7.75 + 3.31 = $11.06/month. A commercial electricity rate (14.47 c/kWh) gives 12.47 + 2.64 = $15.11/month.
- OVHcloud Advance from $147.00/month. More expensive than the EX44 at every tier in this model.
- Hetzner AX42 at EUR 99.00 = $118.80/month plus EUR 49.00 = $58.80 setup. Only justified if ECC memory is a requirement; see F9.

Label: [verified] for all hardware prices and specs; [estimate] for the 25 W average power draw
(derived from the 45 W TDP spec; see F8); [derived] for all arithmetic.

### F6. Break-even per resource, standalone (the box is bought for this purpose alone)

Each line answers: at what usage does the Cloudflare meter exceed the entire monthly price of
one EX44 ($70.80)? Arithmetic shown. R is in millions.

| Resource | Break-even usage | Arithmetic |
| --- | --- | --- |
| Workers requests + CPU | 157.7M requests/month at 7 ms CPU | cost = 5.00 + 0.30(R - 10) + 0.02(7R - 30) = 1.40 + 0.44R = 70.80, so R = 157.7 |
| R2 Class B reads | 206.7M reads/month | (R - 10) x 0.36 = 70.80, so R = 206.7 |
| R2 storage | 4,730 GB-month | (S - 10) x 0.015 = 70.80, so S = 4,730. But a Storage Box BX31 holds 10 TB for $24.96, so storage alone should never buy a compute box |
| Durable Objects, always-on | 18 always-on objects | one object = 0.128 GB x 730 h x 3,600 s = 336,384 GB-s x $12.50/1M = $4.20/month; the 400,000 GB-s included covers 1.19 objects; (N - 1.19) x 4.20 = 70.80, so N = 18.0 |
| Containers, standard-2 8 h/day | 2.3 such containers | one = $30.24 (F4 Tier M); 70.80 / 30.24 = 2.34 |
| Containers, standard-2 24/7 | 0.75, i.e. one is already over the line | one 24/7 standard-2: CPU (43,800 - 375) min = 2,605,500 s x 0.00002 = $52.11; memory (4,380 - 25) = 15,678,000 s x 0.0000025 = $39.20; disk (8,760 - 200) = 30,816,000 s x 0.00000007 = $2.16; total $93.46 |
| Workers Builds | 20,160 build minutes/month | 6,000 + 70.80 / 0.005 = 6,000 + 14,160 |

Against the mini PC instead ($15.78/month): Workers 32.7M requests/month at 7 ms;
R2 reads 53.9M/month; DO 5 always-on objects; Builds 9,156 minutes/month; storage 1,062 GB.
Against OVH Advance ($147.00/month): Workers 330.9M requests/month; R2 reads 418.3M/month;
DO 36 always-on objects; Builds 35,400 minutes/month.

Note the asymmetry the table exposes: three of the seven lines (R2 storage, and anything
egress-shaped) never justify a compute box, because Cloudflare charges $0 egress from R2 and
$0.015/GB-month storage while a Storage Box is 6x cheaper per GB but is not an S3 endpoint.
The lines that do justify own metal are duration-shaped: always-on memory, always-on CPU, and
metered operations at volume.
Label: [derived] arithmetic on [verified] rates.

### F7. Marginal break-even (the box already runs for another reason)

Claim: if the EX44 is already paid for CI or storage, the marginal cost of hosting one more
always-on workload on it is close to zero, and the correct break-even collapses to the power
share. A single 24/7 container drawing an average 25 W costs about $3.31/month in electricity
against $93.46/month on Cloudflare Containers for the same shape. For that one component the
marginal self-hosted cost is 28x lower than the Cloudflare list price.

Arithmetic: 25 W x 730 h = 18.25 kWh x $0.1816/kWh = $3.31/month. 93.46 / 3.31 = 28.2.
Caveat: the box is shared, so 25 W is a whole-box average, not a per-container figure; the
per-container marginal power is smaller still. The same comparison for one always-on Durable
Object is $4.20/month on Cloudflare against a fraction of a watt on a box that is already on.
Label: [derived] on [verified] electricity price and Containers rates; the 25 W is [estimate].

### F8. Power and bandwidth, the two numbers a home or office machine cannot escape

Power (mini PC, 45 W TDP part, 120 W adapter):
- Idle 10 W: 7.3 kWh/month, $1.33 at residential rate. [estimate]
- Mixed load 25 W: 18.25 kWh/month, $3.31. [estimate]
- Full load 45 W: 32.85 kWh/month, $5.97. [estimate]
All three are arithmetic on the EIA residential rate of 18.16 c/kWh for August 2026. The watt
figures are estimates scaled from the published 45 W TDP; I did not measure this machine.
Evidence: https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_3 (read
2026-10-29, data for August 2026, released October 23 2026) and
https://awesomeminipc.com/devices/beelink-ser5-pro (read 2026-10-29).
Label: [verified] for the electricity price and the TDP; [estimate] for the draw figures.

Bandwidth ceilings:
- Hetzner EX44, 1 GBit/s port, unlimited traffic, no overage meter. Theoretical ceiling
  125 MB/s x 2,592,000 s (30 days) = 324 TB/month. Source:
  https://docs.hetzner.com/robot/general/traffic/ (read 2026-10-29): "All root servers have a
  dedicated 1 GBit uplink by default and with it unlimited traffic."
- Hetzner cloud: 20 TB included in EU, then EUR 1/TB (Hetzner's own pair: $1.20/TB). Same page.
- OVH dedicated: "Our bandwidth is unlimited and unmetered across all dedicated servers", minimum
  500 Mbps public, and a fair-use clause reserving the right to cap outgoing throughput by up to
  50%. Source: https://us.ovhcloud.com/bare-metal/bandwidth/ (read 2026-10-29).
- Mini PC on a residential link: the binding constraint is the upstream, which I did not verify
  for the operator's location. For scale, 100 Mbps up = 12.5 MB/s = 32.4 TB/month theoretical,
  10x below the dedicated server. [unverified] for the operator's actual uplink.

Note that Cloudflare Tunnel itself is free and Workers/R2 egress is $0, so in this design the
tunnel is not a metered bottleneck; the only Cloudflare egress meter that bites is Containers
egress at $0.025/GB beyond 1 TB.
Label: [verified] for all published bandwidth terms; [unverified] for the operator's uplink.

### F9. The EX44 is the best value box in this comparison, and ECC costs 2x

Claim: at EUR 59.00 with no setup fee, the EX44 delivers more CPU per dollar than the AX42 and
more than OVHcloud's Advance entry point. ECC memory (AX42, EUR 99.00) costs 68% more per month
and adds a EUR 49.00 setup fee.

Derived arithmetic:
- EX44: $70.80 / (14 threads x 730 h x 3,600 s) = $0.00000192 per CPU-second at 100% utilisation
  across all threads. Cloudflare Containers CPU is $0.000020 per vCPU-second, so Cloudflare is
  10.4x more expensive per CPU-second at full utilisation.
- Restricted to the 6 performance cores (the 8 efficiency cores are not equivalent):
  $70.80 / (6 x 730 x 3,600) = $0.00000449 per CPU-second, so Cloudflare is 4.5x more expensive.
  This matches the independent derivation in A6-pricing-reality.md for the 6-core AX41 at the
  same EUR 59.00 price, which is a useful cross-check that the two of us are doing the same
  arithmetic.
- AX42 at $118.80 is 1.68x the EX44 price for the same 64 GB of RAM and the same 2x 512 GB NVMe,
  buying DDR5 ECC and a newer 8-core Zen 4 part.

Storage caveat that applies to every option: 2x 512 GB NVMe is 1 TB raw with no redundancy. A
2 TB requirement either adds a Storage Box, adds disks, or accepts RAID-0. Hetzner's published
disk add-ons (per A6's read of
https://docs.hetzner.com/robot/dedicated-server/dedicated-server-hardware/price-server-addons/,
"Last change on 2026-10-07") price a 1 TB NVMe addon at EUR 30.00 / USD 36.00 per month, which
is 2.4x more expensive per GB than R2 Standard storage. An all-NVMe self-hosted storage design
loses to R2 on price; only spinning disk or a Storage Box wins.
Label: [verified] for all published prices; [derived] for the ratios.

### F10. Three-year total cost of ownership, no price changes assumed

Assumption stated: 36 months at today's list prices, no Cloudflare price change, no Hetzner
price change, no hardware failure, no operator time cost. This is an estimate, and it is the
least reliable table in this document, because both vendors moved prices in 2026 (see F11).

| Tier | Cloudflare | Hetzner EX44 | Mini PC | OVH Advance |
| --- | --- | --- | --- | --- |
| S | $16.82 x 36 = $605.52 | $70.80 x 36 = $2,548.80 | $449.00 + 36 x $3.31 = $568.16 | $147.00 x 36 = $5,292.00 |
| M | $182.24 x 36 = $6,560.64 | $2,548.80 | $568.16 | $5,292.00 |
| L | $972.28 x 36 = $35,002.08 | ($70.80 + $24.96) x 36 = $3,447.36 | not viable at 2 TB without external storage | $5,292.00 + storage |

Reading: below roughly $70/month of Cloudflare metered spend, a dedicated server loses to
Cloudflare and a mini PC is the only self-hosted option that wins. Above it, the dedicated
server wins by increasing multiples, and the Cloudflare bill is the fastest-growing line in the
table because it is usage-metered while the box is flat.
Label: [derived] on [verified] prices and [estimate] tier shapes.

### F11. Both vendors moved prices in 2026, so this model has a shelf life

Claim: Hetzner raised cloud and dedicated prices during 2026, and Cloudflare's developer-platform
rates have been stable since the 2023 repricing. A TCO model built today must be re-run before
any commitment.

Evidence:
- Hetzner's own docs carry a "Price Adjustment 15 June 2026" page
  (https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/, dated
  Jun 14 2026, found by search; not fetched in full). Hetzner's pressroom carries a "Statement on
  price adjustment as of April 1st 2026". Both were found via pkgforge search snippets on
  2026-10-29; the text of the adjustment was not read in full. [unverified] for the details,
  [verified] that the pages exist and are dated 2026.
- The Hetzner cloud pages I read today show CPX22 at EUR 19.99/month. A secondary source dated
  Oct 20 2026 (bitdoze.com, search snippet) states CPX22 "went from EUR 5.99 to EUR 19.49
  (+225%)". [unverified] as a secondary source, but consistent with the direction of Hetzner's
  own price-adjustment pages.
- Several Hetzner cloud instances displayed "This product is currently unavailable" on the pages
  I read (CX23, CAX11, CX33, CAX21, CX43, CPX02, CPX12, CPX22, CPX32). The prices quoted are
  list prices on those pages as read, not necessarily orderable today. [verified] as read.
- Cloudflare's Workers Standard model rates ($0.30/million requests, $0.02/million CPU-ms)
  date from the September 2023 repricing and the page read today still carries them.
  [verified] as the current published rate; I did not read the 2023 blog post.

### F12. Where the two models disagree most sharply, and why

Claim: the three places where self-hosting wins are all duration-shaped, and the three places
where Cloudflare wins are all idle-shaped. This is the single structural fact in the model.

Self-hosted wins:
- Always-on memory. 64 GiB held for a month on Containers is about $420/month
  (64 x 730 x 3,600 = 168,192,000 GiB-s x $0.0000025, less the 25 GiB-hour included). The EX44
  includes the same 64 GB for $70.80. Ratio about 6x. [derived]
- Always-on CPU and disk. One 24/7 standard-2 container is $93.46/month on Cloudflare and about
  $3.31/month of marginal power on the box. [derived]
- Metered operations at volume. 300M R2 Class B reads is $104.40/month on Cloudflare and $0 on
  the box beyond bandwidth. [derived]

Cloudflare wins:
- Bursty or idle-heavy CPU. Cloudflare bills active CPU only; the box bills whether used or not.
  One core of the EX44 costs $70.80 / 14 = $5.06 per month. The same core at a 10% duty cycle on
  Cloudflare Containers CPU costs 73 vCPU-hours x 3,600 s x $0.000020 = $5.26/month, a near-tie,
  and the crossover sits just below 10% duty. [derived]
- Storage per GB on NVMe. R2 at $0.015/GB-month beats the Hetzner 1 TB NVMe addon at
  $0.036/GB-month. [derived] on [verified] prices.
- Egress. R2 egress is $0. There is no self-hosted price that beats $0; the best self-hosting can
  do is also charge $0 by including unlimited bandwidth. [verified]

Design rule that follows: put anything that runs more than a few hours a day on own metal, and
anything that runs for seconds a month on Cloudflare. The crossover for a single core is
$5.06 / $0.072 per vCPU-hour = 70.2 vCPU-hours per month = 2.34 h/day. Below about 2.3 hours a
day on one core, Cloudflare is cheaper; above it, the EX44 is.
Label: [derived].

### F13. Sanity check on the model against a second, independent method

Claim: the per-GB and per-minute unit costs implied by this model match the ones A6 derived
independently from different pages, which is evidence the arithmetic is not idiosyncratic.

- Storage: my Storage Box BX31 figure is $24.96 / 10,240 GB = $0.00244/GB-month. A6's BX41
  figure is about $0.0024/GB-month. Same order, same direction, 6x cheaper than R2.
- CPU: my 6-P-core figure is $0.00000449/CPU-second, a 4.5x gap. A6's AX41 figure is
  $0.00000446, the same 4.5x gap. Two different pages, same answer.
- CI: my EX44 figure is $70.80 / 43,800 minutes = $0.00162 per build-minute. A6's AX41 figure is
  about $0.0016 per minute. Same.
Label: [verified] as a cross-check of method; the underlying prices are [verified].

## 2. What this changes for the spec

1. State the crossover per resource, not as a global claim. "Self-hosted is cheaper" is false
   below about $70/month of metered spend and trivially true above it. The spec should carry the
   F6 table so each component is decided on its own duty cycle. The single number to remember:
   one EX44 at $70.80/month pays for itself at 157.7M Worker requests, 206.7M R2 reads,
   18 always-on Durable Objects, 20,160 build minutes, or one 24/7 container, whichever comes
   first.

2. Buy the EX44, not the AX42, unless ECC is a hard requirement. EUR 59.00 with no setup fee,
   14 threads, 64 GB, 1 Gbit/s unmetered. The AX42 costs 68% more for ECC and a newer core, and
   the setup fee is EUR 49.00. OVHcloud's Advance at $147.00 is dominated at every tier here.

3. Keep the SPA on Cloudflare and keep it static. It costs $5.00/month, footnote 3 makes asset
   requests free, and that $5 is unavoidable anyway. Do not front it with a caching Worker, which
   re-bills cache hits as requests.

4. Route every always-on workload to own metal. Durable Objects are the worst place in the
   design for a long-lived process: $4.20 per always-on object per month, $12.50 per million
   GB-s, and a full 128 MB billed per object regardless of use. One 24/7 standard-2 container is
   $93.46/month against about $3.31/month of marginal power on a box that is already running.

5. Model R2 on reads, and keep reads off own metal unless they exceed 206.7M/month. R2 egress is
   $0, so the classic "self-host to avoid egress bills" argument does not apply to R2 at all. It
   applies only to Containers egress at $0.025/GB beyond 1 TB, and to the operator's own last-mile
   bandwidth for the data plane.

6. Keep bulk storage on a Storage Box, not on the compute box, and not on R2, if dollars per GB
   is the goal. BX31 at $24.96/month for 10 TB is 6x cheaper per GB than R2 Standard, but it is
   not an S3 endpoint. If the design needs an S3 API on own metal, the object store choice is a
   separate decision (A6's section 2.4: MinIO is archived; RustFS and SeaweedFS are the
   maintained Apache-2.0 options).

7. Treat the mini PC as the tier-S answer only, and price its uplink before committing. $15.78/
   month all-in beats Cloudflare's $16.82 Tier S by almost nothing, and it loses the moment the
   workload grows past about 1 TB of disk or 33 TB/month of egress. Its real role is the always-on
   wake-and-control node that C3's findings require, not a data-plane host.

8. Re-run this model at purchase time. Both vendors moved prices in 2026 (F11), and several
   Hetzner cloud instances were unavailable at read time. The Cloudflare rates are the more
   stable side of the comparison.

## 3. Not covered / open questions

1. The operator's actual workload. Every tier figure is an estimate of his traffic, storage and
   build volume. The arithmetic is shown line by line so real numbers can replace mine. Nothing
   in this document measures a running system.

2. Measured power draw. The 10 W / 25 W / 45 W figures are scaled from the published 45 W TDP.
   Closing this needs a kill-a-watt or a smart PDU reading on the actual machine under the actual
   load.

3. The operator's residential or office uplink, and whether Cloudflare Tunnel throughput has a
   ceiling. Neither number is published by the operator's ISP or by Cloudflare. Both matter for
   the mini PC option. Close by measurement.

4. VAT and sales tax. All Hetzner figures exclude VAT; all OVH US figures exclude tax; Cloudflare
   is USD excluding tax. An EU buyer adds VAT to every Hetzner line, which moves every break-even
   in F6 by that percentage. Not modelled.

5. FX risk. The 1.20 USD/EUR used here is Hetzner's own published pair from their traffic page,
   not a market rate. Re-check at purchase.

6. Operator labour. No sysadmin hours are priced anywhere in this model. A dedicated box costs
   setup, patching, on-call and replacement; Cloudflare's list price includes none of that work.
   For a single operator this is probably the largest real cost and it is entirely absent here.

7. Hardware failure and replacement. No failure rate, no spare parts, no RMA time is modelled.
   The mini PC has no redundancy at all; the EX44 has no disk redundancy in its base config.

8. Enterprise and contract pricing. Every Cloudflare figure is self-serve list. The Workers
   pricing page states Enterprise accounts are billed on a contracted usage model instead of the
   Standard model, so a negotiated contract could move every break-even in F6.

9. Cloudflare Containers egress at volume. The $0.025/GB NA/EU meter is in the rate card but is
   excluded from the tier totals. A data plane that serves 10 TB/month through Containers adds
   (10,000 - 1,024) GB x $0.025 = $224.40/month, which on its own exceeds the EX44.

10. Per-core work equivalence. Every CPU comparison here is price per CPU-second at a stated
    utilisation, not work per CPU-second. The i5-13500's efficiency cores and Cloudflare's fleet
    are not benchmarked against each other. Closing this needs the same workload run on workerd
    and on the box, which is A3's territory.

11. Whether Cloudflare's R2 subscription requires the Workers Paid plan. A6 could not determine
    this from the pages read, and it does not change this model's totals because the design keeps
    the SPA on Cloudflare and therefore pays the $5 regardless.

12. The Hetzner AX42 price discrepancy. The AX42 product page I read today shows EUR 99.00/month
    with EUR 49.00 setup; A6 read the matrix-ax page as listing AX42 "from EUR 79.00". I used the
    product-page figure. Worth one more read before ordering, since the two Hetzner pages
    disagree.
