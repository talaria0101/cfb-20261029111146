# Cost model

2026-10-29. Cloudflare rates verified by me against the pricing pages that day. Hetzner
prices verified by me against the product page. Everything else is attributed. All
arithmetic is shown so assumptions can be replaced.

## 1. Rate card

Verified by me on 2026-10-29 against `developers.cloudflare.com`:

| Product | Rate |
|---|---|
| Workers Paid subscription | $5.00 per month minimum per account |
| Workers requests | 10 million included, then $0.30 per million |
| Workers CPU | 30 million CPU-ms included, then $0.02 per million |
| Workers duration | no charge and no limit for HTTP |
| Workers static asset requests | free and unlimited |
| Workers Builds | 6,000 minutes included, then $0.005 per minute. 20 minute timeout, 4 vCPU, 8 GB, 20 GB disk, 6 concurrent |
| R2 storage, Standard | $0.015 per GB-month |
| R2 Class A operations | $4.50 per million |
| R2 Class B operations | $0.36 per million |
| R2 egress | free |
| R2 free tier | 10 GB-month, 1 million Class A, 10 million Class B |
| Durable Objects requests | 1 million included, then $0.15 per million |
| Durable Objects duration | 400,000 GB-s included, then $12.50 per million GB-s, at 128 MB per object |
| Durable Objects rows read | 25 billion included, then $0.001 per million |
| Durable Objects rows written | 50 million included, then $1.00 per million |
| Durable Objects SQL stored | 5 GB included, then $0.20 per GB-month |
| Queues | 1 million operations included, then $0.40 per million, about 3 operations per delivered message |
| Containers memory | 25 GiB-hours included, then $0.0000025 per GiB-second |
| Containers CPU | 375 vCPU-minutes included, then $0.000020 per vCPU-second |
| Containers disk | 200 GB-hours included, then $0.00000007 per GB-second |
| Containers egress | 1 TB included in NA and EU, then $0.025 per GB |
| Tunnels | 1,000 per account free, then $4.50 per tunnel per month, inactive included |
| Zero Trust Access | $0 up to 50 users, then $7 per user per month paid annually [A5] |

## 2. The self-hosted reference box

Hetzner EX44, verified by me on 2026-10-29:

| | |
|---|---|
| CPU | Intel Core i5-13500, 6 performance and 8 efficiency cores |
| RAM | 64 GB DDR4 |
| Disk | 2x 512 GB Gen4 NVMe |
| Network | 1 GBit/s port, guaranteed, unlimited traffic |
| Price | EUR 59.00 per month, excluding VAT |
| Hourly | EUR 0.0945 per hour |
| Setup fee | EUR 0.00 |

At Hetzner's own published USD/EUR pair of 1.20, that is **$70.80 per month** [C2 F3].

Rejected: the AX42 at EUR 99.00 per month plus EUR 49.00 setup, 68% more for ECC. OVH
Advance at $147.00, dominated at every tier [C2 2.2].

Discrepancy: A6 read the Hetzner matrix page as listing AX42 "from EUR 79.00" while C2
read the product page as EUR 99.00. C2 used the product page. Worth one more read
before ordering [C2 open question 12].

## 3. Break-even, one box at a time

One EX44 at $70.80 per month pays for itself at whichever of these comes first [C2 F4].
I recomputed each line myself and they hold.

**Worker requests at 7 ms CPU each.**
- Billable requests: 157,700,000 minus 10,000,000 = 147,700,000. At $0.30 per million:
  $44.31.
- CPU: 157,700,000 times 7 ms = 1,103,900,000 CPU-ms. Minus 30,000,000 included =
  1,073,900,000 billable. At $0.02 per million: $21.48.
- Plus the $5.00 floor. Total: $70.79, against $70.80 for the box.

**R2 Class B reads.**
- 206,700,000 minus 10,000,000 free = 196,700,000 billable. At $0.36 per million:
  $70.81.

**Always-on Durable Objects.**
- One object at 128 MB for 730 hours is 0.128 GB times 2,628,000 seconds = 336,384
  GB-s per month.
- 18 objects is 6,054,912 GB-s. Minus 400,000 included = 5,654,912 billable. At $12.50
  per million: $70.69.

**Build minutes.**
- 20,160 minus 6,000 included = 14,160 billable. At $0.005: $70.80 exactly.

**One 24/7 `standard-2` container**, 1 vCPU, 6 GiB, 12 GB disk [A2 R3, C2 F4]:
- CPU: 2,628,000 vCPU-seconds minus 22,500 included = 2,605,500. At $0.000020:
  $52.11.
- Memory: 2,628,000 times 6 = 15,768,000 GiB-s minus 90,000 included = 15,678,000.
  At $0.0000025: $39.20.
- Disk: 2,628,000 times 12 = 31,536,000 GB-s minus 720,000 included = 30,816,000.
  At $0.00000007: $2.16.
- Total: $93.47, more than the whole box.

## 4. One correction on Durable Objects

A6 and C2 both quote "about $4.20 per month for one always-on Durable Object". That is
the marginal rate, and it needs a caveat the research files do not carry.

The paid allocation is 400,000 GB-s per month. One always-on object consumes 336,384
GB-s per month, which is inside the allocation. So the first always-on object costs
nothing in duration, and the $4.20 figure applies from roughly the second object
onward. Derived by me from Cloudflare's own numbers on 2026-10-29; the assumptions are
a 730-hour month and 128 MB per object.

The guidance does not change: any long-running stateful process belongs on your own
metal. But if you run exactly one, it is free.

## 5. The structural split, by resource

| Resource | Verdict | Why |
|---|---|---|
| Egress | own metal, unbounded | EX44 includes unlimited traffic on 1 GBit. Containers charge $0.025/GB past 1 TB. R2 charges $0 |
| Always-on memory and disk | own metal, 5x to 6x | 64 GiB for a month on Containers is about $420. An EX44 with 64 GB is $70.80 |
| CPU | Cloudflare for bursty and idle-heavy | Cloudflare bills active CPU only, Hetzner bills the box. 10% average utilisation is 10x cheaper on Cloudflare; 100% is cheaper on Hetzner |
| Object storage on NVMe | Cloudflare | R2 at $0.015/GB-month beats a Hetzner 1 TB NVMe addon at about $0.036 |
| Object storage on spinning disk | own metal | bulk HDD at about $0.00195/GB-month, Storage Box at about $0.0024 for 20 TB |
| Requests | own metal has no per-request price | but R2 Class B at $0.36 per million is small until it is not: 290 million reads is $104.40 |
| Static asset serving | Cloudflare, outright | free and unlimited |

A single core crosses over at about 2.3 hours per day of use. Anything always-on
belongs on your metal; anything bursty and seconds-long belongs on Cloudflare [C2 2.7].

## 6. Three tiers, as estimates

C2's tier model. **Estimates of your traffic, not measurements.** Assumptions and
line-by-line arithmetic are in `research/C2-tco-model.md`.

| Tier | Assumed shape | Cloudflare per month | Self-hosted per month |
|---|---|---|---|
| Light | dashboard only, modest reads, a few short jobs | $16.82 | $70.80 |
| Small production | real traffic, real artifact volume, a few always-on services | $182.24 | $70.80 |
| Heavy | high read volume, always-on containers, bulk storage | $972.28 | $95.76 |

Self-hosting loses below about $70 per month of metered spend and wins 2.6x to 10x
above it [C2 2.5].

## 7. The mini-PC leg is unevidenced

C2 includes a mini-PC option at about $15.78 per month all-in, from $449 of hardware
over 36 months plus 25 W at 18.16 cents per kWh. **None of those three figures appears
in the research set as a verified number.** D1 says so explicitly: the capex, the
wattage and the electricity rate are all unverified, and no file contains a mini-PC
price, wattage or electricity rate [D1 Q12].

Do not plan around this leg until you have read the vendor page and your own tariff.

## 8. What this model does not include

- **Your actual workload.** Every tier figure is an estimate. Nothing here measures a
  running system.
- **Operator labour.** No sysadmin hours are priced anywhere. For a single operator
  this is probably the largest real cost and it is entirely absent. C6 could not
  verify a figure from a primary source and refused to invent one, and neither will I.
  Measure your own first three months and write the number down.
- **VAT and sales tax.** Hetzner figures exclude VAT. An EU buyer adds it to every
  Hetzner line.
- **Hardware failure and replacement.** No failure rate, no spares, no RMA time. The
  EX44 has no disk redundancy in its base configuration.
- **Enterprise and contract pricing.** Every Cloudflare figure is self-serve list. The
  Workers pricing page states Enterprise accounts are billed on a contracted usage
  model instead.
- **Workers VPC pricing at GA.** Unpriced. See section 9.
- **Per-core work equivalence.** Every CPU comparison is price per CPU-second at a
  stated utilisation, not work per CPU-second. The i5-13500's efficiency cores and
  Cloudflare's fleet are not benchmarked against each other.
- **The 4.5x CPU ratio is a denominator choice.** Dividing a 6-core 12-thread box by 6
  physical cores gives 4.5x; dividing by 12 threads gives 2.25x. State the denominator
  next to the number [D1 D19].
- **Bandwidth.** 10 TB per month over 730 hours is 30.4 Mbps, not the "about 4 Mbps"
  A6 wrote, which is a unit slip for about 4 MB/s. 20 TB is 60.9 Mbps, not the "about
  0.5 Mbps" C6 wrote. Both reach the right conclusion from a wrong rate [D1 D18].
- **Hours per month.** The research set contains 730, 720 and an implied 624, and two
  EUR/USD ratios of 1.19 and 1.1710, a 17% spread on every always-on line. This file
  uses 730 hours and Hetzner's published 1.20 pair throughout [D1 2].
- **Shelf life.** Both vendors moved prices in 2026 and several Hetzner cloud instances
  were unavailable at read time. Re-run at purchase time.

## 9. The unpriced line item on the critical path

Workers VPC is the mechanism the entire control-plane-to-data-plane path depends on,
and it has no published GA price.

A5 and A6 both read an explicit sentence saying it is free during the open beta period,
with standard Workers pricing applying for compute time and requests. My read at
2026-10-29 13:18 UTC returned a 33-word page reading only "Workers VPC requires a
Workers plan. See Workers pricing for current rates", with the reader reporting low
confidence and no extraction.

Either the page changed within the day or the extraction was partial. I cannot tell
which. Treat VPC pricing as unverified.

This is why `SPEC.md` keeps every data-plane call behind one internal client module in
the Worker, with a second implementation that talks plain HTTPS to a public hostname
behind Access. If VPC Services start charging or are withdrawn, the change is one file.
