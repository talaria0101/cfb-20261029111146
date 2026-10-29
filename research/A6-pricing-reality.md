# A6 - Pricing Reality: Cloudflare's Actual Current Prices vs Self-Hosted

Research subagent: A6-pricing-reality
Date of all reads: 2026-10-29 (UTC)
Method: pkgforge gateway pinned to provider=tinyfish for every page read. GitHub metadata via `gh api`.
Fallback used: none. Every page below was read through the tinyfish gateway; no call required
fallback to the built-in web_search/web_fetch tools. Two pkgforge `read` calls returned HTTP 422
(bad URL path) and were re-issued against the corrected URL; those are noted inline.
Primary source rule applied: developers.cloudflare.com and the vendor's own pricing page in
preference to blogs. Where a number could only be obtained from a secondary source, it is
labelled [unverified] with the reason.

Currency note: Hetzner publishes monthly prices in EUR excluding VAT. Where Hetzner itself
publishes a USD figure I quote their number. Where they do not, I keep EUR and do not invent
an FX rate. A ratio of about 1.19 USD per EUR is derivable from Hetzner's own addon table
(EUR 26.00 / USD 31.00, EUR 30.00 / USD 36.00, EUR 36.00 / USD 43.00) and I use it only where
explicitly marked as derived.

---

## 1. Findings

### 1.1 Workers: the $5/month floor and the two metered dimensions

Claim: The Workers Paid plan is a $5.00 USD per month minimum per account and meters exactly two
things: inbound requests and CPU time. Duration is neither charged nor limited for HTTP requests.

Evidence: https://developers.cloudflare.com/workers/platform/pricing/ (read 2026-10-29, page
"Last updated Oct 2, 2026"). The page states: "The Workers Paid plan includes Workers, Pages
Functions, Workers KV, Hyperdrive, and Durable Objects usage for a minimum charge of $5 USD per
month for an account." and "There are no additional charges for data transfer (egress) or
throughput (bandwidth)."

Rate card, Standard usage model:

| Dimension | Free | Paid |
| --- | --- | --- |
| Requests | 100,000/day | 10 million/month included, then $0.30 per additional million |
| CPU time | 10 ms per invocation | 30 million CPU-ms/month included, then $0.02 per additional million CPU-ms |
| Duration | no charge | no charge, no limit |

Four billing footnotes on the same page that change the arithmetic materially:

1. "Cloudflare does not bill for subrequests you make from your Worker."
2. A WebSocket connection is charged as one request (the Upgrade). WebSocket messages routed
   through a Worker are not charged as requests.
3. "Requests to static assets are free and unlimited."
4. With Workers Caching enabled, cache hits are billed at the full per-request rate. Only CPU
   time is skipped on a cache hit.

Cloudflare's own worked examples from that page, quoted because they are the cheapest way to
sanity-check a model:

- 15M requests/month, 7 ms CPU each: $5.00 + $1.50 + $1.50 = $8.00/month.
- 15M requests/month, 80% static assets: $5.00/month total.
- Cron Trigger, 720 invocations/month, 3 minutes CPU each: $6.99/month.
- 100M requests/month, 7 ms CPU each: $45.40/month.
- Same, 80% cache hit rate: $34.20/month.

Derived unit price (arithmetic on the published rate, not a new figure): $0.02 per million
CPU-ms equals $0.00002 per CPU-second. Requests equal $0.0000003 each.

Label: [verified]

### 1.2 Workers limits that constrain a self-hosted control plane

Claim: The hard platform limits that would bite a self-hosted orchestration design are 128 MB
memory per isolate, 64 MiB uncompressed script size, 1 second startup, 6 simultaneous
outgoing connections waiting for headers, 10,000 subrequests per invocation on Paid, and 500
Workers per account.

Evidence: https://developers.cloudflare.com/workers/platform/limits/ (read 2026-10-29, page
"Last updated Oct 12, 2026"). Account plan limits table: Requests 100,000/day Free, "No limit"
Paid; CPU time 10 ms Free, 5 min Paid; Memory 128 MB both plans; Subrequests 50/request Free,
10,000/request Paid; Simultaneous outgoing connections/request 6 on both plans; Environment
variables 64 Free / 128 Paid, 5 KB each; Worker size 64 MiB both plans; Worker startup time 1
second; Number of Workers 100 Free / 500 Paid; Cron Triggers per account 5 Free / 250 Paid;
Static Asset files per Worker version 20,000 Free / 100,000 Paid; individual static asset file
25 MiB.

Wall-time limits table on the same page: HTTP request "Unlimited"; Cron Trigger 15 min; Durable
Object Alarm 15 min; Queue Consumer 15 min. `ctx.waitUntil()` extends execution up to 30 seconds
after the response is sent or the client disconnects.

Also on that page: request body size is set by the Cloudflare zone plan, not the Workers plan.
Free/Pro 100 MB, Business 200 MB, Enterprise up to 5 GB self-serve. CDN cache limits are 512 MB
for Free/Pro/Business and 5 GB for Enterprise.

The page names the escape hatch explicitly: "If you are building a platform where your end
customers deploy their own sites or applications, use Workers for Platforms, which runs an
unlimited number of user Workers."

Label: [verified]

### 1.3 R2: storage, Class A/B, and a genuinely free egress

Claim: R2 Standard storage is $0.015/GB-month, Class A operations $4.50/million, Class B
operations $0.36/million, and egress is $0 for all access paths including the S3 API, the
Workers API and r2.dev.

Evidence: https://developers.cloudflare.com/r2/pricing/ (read 2026-10-29, page "Last updated
Oct 26, 2026").

| | Standard | Infrequent Access |
| --- | --- | --- |
| Storage | $0.015 / GB-month | $0.01 / GB-month |
| Class A ops | $4.50 / million | $9.00 / million |
| Class B ops | $0.36 / million | $0.90 / million |
| Data retrieval | None | $0.01 / GB |
| Egress | Free | Free |

Free tier (monthly): 10 GB-month storage, 1 million Class A, 10 million Class B.

Class A operations (the expensive, mutating set): ListBuckets, PutBucket, ListObjects,
PutObject, CopyObject, CompleteMultipartUpload, CreateMultipartUpload,
LifecycleStorageTierTransition, ListMultipartUploads, UploadPart, UploadPartCopy, ListParts,
PutBucketEncryption, PutBucketCors, PutBucketLifecycleConfiguration.

Class B operations: HeadBucket, HeadObject, GetObject, UsageSummary, GetBucketEncryption,
GetBucketLocation, GetBucketCors, GetBucketLifecycleConfiguration.

Free operations: DeleteObject, DeleteBucket, AbortMultipartUpload.

Egress footnote, quoted because it is the single most load-bearing claim in the whole spec:
"Egressing directly from R2, including via the Workers API, S3 API, and `r2.dev` domains does
not incur data transfer (egress) charges and is free. If you connect other metered services to
an R2 bucket, you may be charged by those services."

IA minimum storage duration is 30 days, and the object is billed for the full 30 days even if
deleted early. Standard has no minimum duration.

Billing quirk worth designing around: storage is billed on the average of the *peak* storage
per day over a 30-day period, not on an instantaneous or end-of-month snapshot.

Cloudflare's own asset-hosting example on that page: 100,000 files at 100 KB average, 10 million
reads per day, for a month. Storage and Class A are inside the free tier. Class B is 300 million
reads, minus 10 million free, so 290 million billable at $0.36/million = $104.40/month. That is
the number that matters for a public asset bucket: reads are the bill, not storage.

Label: [verified]

### 1.4 R2 limits

Claim: R2 has no practical per-bucket cap, but a 1,000,000 bucket account cap, a 1 write/second
cap on the same object key, a 5 GiB single-part upload, and a hard rate limit on the REST API.

Evidence: https://developers.cloudflare.com/r2/platform/limits/ (read 2026-10-29, page "Last
updated Jun 8, 2026").

- Data storage per bucket: Unlimited. Objects per bucket: Unlimited.
- Maximum buckets per account: 1,000,000.
- Bucket management operations: 50 per second per bucket. Explicitly does not apply to object
  reads/writes.
- Custom domains per bucket: 100. Object key length 1,024 bytes. Object metadata 8,192 bytes.
- Object size: 5 TiB per object (4.995 TiB usable).
- Maximum upload size: 5 GiB single-part, 4.995 TiB multipart. Maximum upload parts: 10,000.
- Maximum concurrent writes to the same object name: 1 per second. Above that, HTTP 429.
- Cloudflare REST API: 1,200 requests per five minutes across all R2 REST API operations on the
  account. The page directs high-throughput work to the S3 API or Workers API.
- r2.dev managed public buckets: variable rate limit, throttled at "hundreds of
  requests/second", explicitly "not intended for production usage". Use a custom domain.

Label: [verified]

### 1.5 Durable Objects: the 128 MB memory tax and the duration model

Claim: DO compute duration is billed in GB-seconds and is charged for a full 128 MB per object
regardless of actual usage. This is the single most surprising line on the DO rate card.

Evidence: https://developers.cloudflare.com/durable-objects/platform/pricing/ (read 2026-10-29,
page "Last updated Oct 18, 2026").

Compute billing:

| | Free | Paid |
| --- | --- | --- |
| Requests | 100,000/day | 1 million/month included, then $0.15/million |
| Duration | 13,000 GB-s/day | 400,000 GB-s/month included, then $12.50/million GB-s |

The Requests row includes HTTP requests, RPC sessions, WebSocket messages and alarm
invocations. The Duration row includes wall-clock time while the object is running or is idle
in memory but not eligible for hibernation. An idle object that qualifies for hibernation is
not billed for duration.

Footnote 5, quoted verbatim because it drives the whole cost model: "Duration billing charges
for the 128 MB of memory your Durable Object is allocated, regardless of actual usage. If your
account creates many instances of a single Durable Object class, Durable Objects may run in the
same isolate on the same physical machine and share the 128 MB of memory. These Durable Objects
are still billed as if they are allocated a full 128 MB of memory."

WebSocket billing uses a 20:1 ratio on incoming messages for request billing only. 100 incoming
messages bill as 5 requests. Outgoing messages and protocol pings are free. The ratio does not
apply to DO metrics and analytics.

Derived arithmetic on published rates (not new figures): at 128 MB per object, using Cloudflare's own conversion of 128 MB / 1 GB = 0.128 as used in their worked examples, 400,000 GB-s included equals 3,125,000 object-seconds, which is 868.1 object-hours per month. So the included allocation covers roughly one always-on object. Each additional always-on object costs $12.50/1,000,000 GB-s times 0.128 GB times 3,600 s times 730 h = about $4.20 per object-month at list rate before any included credit.
Cloudflare's own Example 3 on that page: 100 objects, one WebSocket each, one message per second
for a whole month. 259.2 million messages / 20 = 12.96 million requests, billed $1.80. Duration
33,177,600 GB-s minus 400,000 included = 32,777,600 billable, rounded to 33 million, times
$12.50/million = $412.50. Total $419.30/month. The same workload with WebSocket Hibernation
(Example 4) is $20.65/month. Hibernation is a 20x cost lever, not an optimisation.

Storage billing, SQLite backend (the recommended and, on Free, the only backend):

| | Free | Paid |
| --- | --- | --- |
| Rows read | 5 million/day | First 25 billion/month included, then $0.001/million |
| Rows written | 100,000/day | First 50 million/month included, then $1.00/million |
| SQL stored data | 5 GB total | 5 GB-month included, then $0.20/GB-month |

SQLite backend footnotes that change how you model an existing app: key-value methods
(`get()`, `put()`, `delete()`, `list()`) are stored in a hidden SQLite table and are billed as
rows read and rows written. Each `setAlarm()` is billed as a single row written. Deletes count
as rows written. An empty SQLite database consumes approximately 12 KB of storage.

Key-value backend (Workers Paid only): 1 million read request units then $0.20/million, 1
million write request units then $1.00/million, 1 million deletes then $1.00/million, 1 GB
stored then $0.20/GB-month. A request unit is 4 KB. A 9 KB write consumes 3 units.

Label: [verified]

### 1.6 Durable Objects limits

Claim: Per-object storage is capped at 10 GB, and the failure mode at that cap is
`SQLITE_FULL` with reads and deletes still working.

Evidence: https://developers.cloudflare.com/durable-objects/platform/limits/ (read 2026-10-29,
page "Last updated Jun 1, 2026").

SQLite-backed DO limits: number of objects unlimited; 500 DO classes per account on Paid, 100 on
Free; storage per account unlimited on Paid and 5 GB on Free; storage per class unlimited;
storage per DO 10 GB; key and value combined 2 MB; WebSocket message size 32 MiB received only;
CPU per request 30 s default, configurable to 5 minutes; 6 simultaneous outgoing connections.

SQL limits: 100 columns per table; unlimited rows per table subject to the per-object cap; 2 MB
max string/BLOB/row; 100 KB max SQL statement; 100 bound parameters per query; 32 arguments per
SQL function; 50 bytes in a LIKE or GLOB pattern.

Key-value backend limits differ: storage per account 50 GB on Paid (raisable by contacting
Cloudflare), storage per DO unlimited, key size 2 KiB, value size 128 KiB.

Soft throughput limit: "An individual Object has a soft limit of 1,000 requests per second."
Overloaded objects queue and then return an overloaded error.

Failure mode at the cap, quoted: writes fail with `database or disk is full: SQLITE_FULL`, while
"Read operations ... will continue to work, and DELETE operations will also succeed so that you
can remove data to free up space."

Label: [verified]

### 1.7 Containers: GA since April 2026, active-CPU pricing, and a separate egress meter

Claim: Containers and the Sandbox SDK are generally available as of 2026-04-13, require the
Workers Paid plan, bill memory and disk on provisioned resources but CPU on active usage, and
have their own egress meter that is not free.

Evidence: https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/
(read 2026-10-29). "Cloudflare Containers and Sandboxes are now generally available." Highlights
listed include "Higher limits allow you to run thousands of containers concurrently",
"Active-CPU pricing means that you only pay for used CPU cycles", Docker Hub support and SSH
support.

https://developers.cloudflare.com/containers/ (read 2026-10-29) states "Available on Workers
Paid plan". Note this is a change from the public beta announced 2025-06-24
(https://blog.cloudflare.com/containers-are-available-in-public-beta-for-simple-global-and-programmable,
dated Jun 24, 2025, read via search result only, not fetched).

https://developers.cloudflare.com/containers/platform/pricing/ (read 2026-10-29, page "Last
updated Oct 5, 2026"):

| | Memory | CPU | Disk |
| --- | --- | --- | --- |
| Free | N/A | N/A | N/A |
| Workers Paid | 25 GiB-hours/month included, then $0.0000025 per additional GiB-second | 375 vCPU-minutes/month included, then $0.000020 per additional vCPU-second | 200 GB-hours/month included, then $0.00000007 per additional GB-second |

"You only pay for what you use - charges start when a request is sent to the container or when
it is manually started. Charges stop after the container instance goes to sleep". "Memory and
disk usage are based on the *provisioned resources* for the instance type you select, while CPU
usage is based on *active usage* only."

Container egress, which is a separate meter and is NOT free:

| Region | Price per GB | Included per month |
| --- | --- | --- |
| North America and Europe | $0.025 | 1 TB |
| Oceania, Korea, Taiwan | $0.05 | 500 GB |
| Everywhere Else | $0.04 | 500 GB |

Instance types (six predefined, plus custom):

| Type | vCPU | Memory | Disk |
| --- | --- | --- | --- |
| lite | 1/16 | 256 MiB | 2 GB |
| basic | 1/4 | 1 GiB | 4 GB |
| standard-1 | 1/2 | 4 GiB | 8 GB |
| standard-2 | 1 | 6 GiB | 12 GB |
| standard-3 | 2 | 8 GiB | 16 GB |
| standard-4 | 4 | 12 GiB | 20 GB |

Custom instance type constraints (https://developers.cloudflare.com/containers/platform/limits/,
read 2026-10-29, page "Last updated Oct 21, 2026"): minimum 1 vCPU, maximum 4 vCPU, maximum 12
GiB memory, maximum 20 GB disk, minimum 3 GiB memory per vCPU.

Account limits on the same page: concurrent memory 6 TiB, concurrent vCPU 1,500, concurrent
disk 30 TB, image size equal to instance disk space, total image storage per account 50 GB.
Snapshot limits: 20 GB max snapshot, 30 days retention from creation or most recent restore.

Billing interaction to model carefully, quoted from the pricing page: "When you use Containers,
incoming requests to your containers are handled by your Worker, and each container has its own
Durable Object. You are billed for your usage of both Workers and Durable Objects." So a
container request is triple-billed: Worker request, Worker CPU, DO request plus DO duration.

Label: [verified]

### 1.8 Workers Builds: cheap per minute, but capped at 20 minutes and 4 vCPU

Claim: Workers Builds gives 3,000 build minutes/month on Free and 6,000/month on Paid, then
$0.005/minute. Builds are capped at 20 minutes, 4 vCPU, 8 GB RAM and 20 GB disk, with 6
concurrent builds on Paid.

Evidence: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/ (read
2026-10-29, page "Last updated May 29, 2026").

| Metric | Free | Paid |
| --- | --- | --- |
| Build minutes | 3,000 per month | 6,000 per month, then +$0.005 per minute |
| Concurrent builds | 1 | 6 |
| Build timeout | 20 minutes | 20 minutes |
| Deploy Hooks | 10/min per Worker, 100/min per account | same |
| CPU | 2 vCPU | 4 vCPU |
| Memory | 8 GB | 8 GB |
| Disk space | 20 GB | 20 GB |
| Environment variables | 64 | 64 |
| Size per environment variable | 5 KB | 5 KB |

https://developers.cloudflare.com/workers/ci-cd/builds/ (read 2026-10-29, page "Last updated
Oct 28, 2026") adds: build logs retained 90 days; Git integration with Artifacts, GitHub or
GitLab; and a Containers-specific constraint quoted because it is a trap: "For Workers that use
Containers, use `wrangler deploy` on the production branch so container images and container
instances can update. If you configure preview builds to run `wrangler versions upload`,
container images and container instances will not update."

Label: [verified]

### 1.9 The rest of the developer platform rate card

Claim: KV, D1, Queues, Hyperdrive, Workflows and Workers Logs each have their own meters, and
KV writes are the most expensive per-operation item on the whole platform.

Evidence: https://developers.cloudflare.com/workers/platform/pricing/ (read 2026-10-29).

Workers KV, Paid: 10 million keys read/month then $0.50/million; 1 million written then
$5.00/million; 1 million deleted then $5.00/million; 1 million list requests then $5.00/million;
1 GB stored then $0.50/GB-month. Free is 100,000 reads/day, 1,000 writes/day, 1,000 deletes/day,
1,000 lists/day, 1 GB stored.

Note the asymmetry: a KV write at $5.00/million is 13.9x the price of a KV read at $0.50/million
and 10x the price of an R2 Class B operation at $0.36/million. KV is a read cache, not a write
path.

Hyperdrive: Free 100,000 database queries/day, Paid unlimited, no charge.

Queues: an operation is counted per 64 KB written, read or deleted. Messages over 64 KB are
charged as multiple operations. Paid: 1,000,000 operations/month included then $0.40/million.
Free: 10,000 operations/day. Retention: 24 hours non-configurable on Free, 4 days default and
configurable to 14 days on Paid. Cloudflare's own formula: a message costs 3 operations (write,
read, delete), so `((messages * 3) - 1,000,000) / 1,000,000 * $0.40`.

Workflows, Paid: 10 million requests included then $0.30/million; 30 million CPU-ms included
then $0.02/million; 1 GB-month storage included then $0.20/GB-month; 500,000 steps included then
$0.80 per additional 100,000 steps. Cloudflare notes: "Cloudflare will not bill step and storage
usage before the start date announced in the Workflows billing changelog."

D1, Paid: rows read first 25 billion/month included then $0.001/million; rows written first 50
million/month included then $1.00/million; storage first 5 GB included then $0.75/GB-month. Free:
5 million rows read/day, 100,000 rows written/day, 5 GB total. Rows read counts rows scanned,
not rows returned, so an unindexed filter is billed on the scan.

Workers Logs, Paid: 20 million log events/month included then $0.60/million, 7-day retention.
Free: 200,000/day, 3-day retention. Workers Trace Events Logpush is Paid only: 10 million
requests/month then $0.05/million.

Label: [verified]

### 1.10 R2 Data Catalog (Basin Catalog) is a new, separately-metered R2 add-on

Claim: R2 now has a managed Apache Iceberg catalog called Basin Catalog with three separate
meters on top of ordinary R2 storage, and billing for it was not yet enabled as of 2026-05-28.

Evidence: https://developers.cloudflare.com/basin-catalog/platform/pricing/ (read 2026-10-29,
page "Last updated Oct 1, 2026"). Catalog operations: 1 million/month included then
$9.00/million. Compaction data processed: 10 GB/month included then $0.005/GB. Compaction
objects processed: 1 million/month included then $2.00/million. Compaction charges apply only
when compaction is enabled. Snapshot expiration is free.

https://developers.cloudflare.com/changelog/post/2026-05-11-r2-data-catalog-pricing-announced/
(read 2026-10-29, dated May 28, 2026) states: "Billing is not yet enabled. We will provide at
least 30 days notice before we start charging for R2 Data Catalog usage."

Cloudflare's own Example 2 on the pricing page is the one to read: streaming ingest at 20 MB/s
for a month produces about 50,625 GB (49 TB) of data, and the total bill is $1,012.31/month, of
which $759.23 is plain R2 storage and $253.08 is compaction. The page's own conclusion:
"For large-scale use cases, storage costs are typically the largest component of your bill."

Label: [verified]

### 1.11 R2 needs a subscription before it can be used, but the free tier needs no payment

Claim: R2 requires an R2 subscription to be added to the account through a checkout flow, and
the free monthly usage is available on that subscription.

Evidence: https://developers.cloudflare.com/r2/get-started/ (read 2026-10-29, page "Last updated
Apr 21, 2026"). "You need a Cloudflare account with an R2 subscription." followed by a checkout
flow, then "R2 is free to get started with included free monthly usage. You are billed for your
usage on a monthly basis."

The R2 pricing page does not state a minimum monthly charge for R2 itself. Whether the R2
subscription is gated behind the $5 Workers Paid plan is not stated on either page I read.

Label: [verified] for the subscription requirement and the free-usage statement.
[unverified] for any claim that R2 requires the $5 Workers Paid plan; I did not read a page that
says so either way.

### 1.12 Cloudflare Tunnel is free on all plans, which is the load-bearing assumption of the whole architecture

Claim: Cloudflare Tunnel is available on all plans with no per-tunnel charge, is outbound-only,
and now uses post-quantum encryption.

Evidence: https://developers.cloudflare.com/tunnel/ (read 2026-10-29, page "Last updated Sep 11,
2026). "Available on all plans". "Cloudflare Tunnel connects your infrastructure to Cloudflare
through an outbound-only, post-quantum encrypted connection." "Each tunnel maintains four
long-lived connections to two Cloudflare data centers for built-in redundancy." Use cases
listed include "Workers VPC - Enable Cloudflare Workers to securely access private databases,
APIs, and services through your tunnel."

Argo Smart Routing is a separate, priced product:
https://developers.cloudflare.com/argo-smart-routing/ (read 2026-10-29) says only "Explore
pricing options for Argo in the dashboard" and does not publish a number.

Label: [verified] for Tunnel being available on all plans and outbound-only.
[unverified] for the Argo Smart Routing price; the page publishes none.

### 1.13 Self-hosted storage is 4x to 8x cheaper per GB than R2, but only on spinning disk

Claim: On raw storage dollars R2 is beaten by both a managed competitor and by Hetzner hardware.
The gap is large for bulk HDD and negative for NVMe.

Evidence and arithmetic:

- Backblaze B2, https://www.backblaze.com/cloud-storage/pricing (read 2026-10-29): "Starts at
  $6.95 / TB / mo", "First 10GB storage is always free", "Free egress up to 3x storage",
  "Class A, B, and C API calls are free for pay-as-you-go customers. Class D transactions cost
  $0.004 per 10,000 calls plus the first 2,500 calls per day are free." Egress beyond 3x storage
  is $0.01/GB. $6.95/TB-month = $0.00695/GB-month. That is 2.2x cheaper than R2 Standard, with
  free API calls and free egress up to 3x storage. [verified]
- Hetzner Storage Box, https://www.hetzner.com/storage/storage-box/ (read 2026-10-29): BX11
  1 TB at EUR 3.20/month excl. VAT; BX21 5 TB at EUR 10.90; BX31 10 TB at EUR 20.80; BX41 20 TB
  at EUR 40.60. Traffic unlimited, 10 concurrent connections, 100 sub-accounts, snapshots
  included. BX41 at EUR 40.60 for 20 TB is EUR 0.00203/GB-month. Using Hetzner's own
  EUR-to-USD ratio of about 1.19 derived from their addon table, that is about $0.0024/GB-month,
  about 6.2x cheaper than R2 Standard. Derived, not a published figure. [verified] for the EUR prices, [unverified] for the USD conversion.
- Hetzner dedicated server disk addons,
  https://docs.hetzner.com/robot/dedicated-server/dedicated-server-hardware/price-server-addons/
  (read 2026-10-29, page "Last change on 2026-10-07"): 16 TB SATA Enterprise HDD EUR 26.00 /
  USD 31.00 per month. 22 TB SATA Enterprise HDD EUR 36.00 / USD 43.00. 1 TB NVMe SSD EUR 30.00
  / USD 36.00. 2 TB NVMe SSD EUR 54.00 / USD 64.00. 15.36 TB NVMe SSD Datacenter Edition EUR
  320.00 / USD 378.00.
  - 22 TB HDD at USD 43.00 = $0.00195/GB-month, 7.7x cheaper than R2.
  - 1 TB NVMe at USD 36.00 = $0.036/GB-month, 2.4x MORE expensive than R2 Standard.
  - 15.36 TB NVMe DC at USD 378.00 = $0.0246/GB-month, 1.6x more expensive than R2.
  [verified] for the published EUR and USD prices.

The finding that matters: R2 at $0.015/GB-month sits between Hetzner bulk HDD ($0.00195) and
Hetzner NVMe ($0.036 to $0.0246). Self-hosting object storage only beats R2 on price if the
backing store is spinning disk or a Storage Box, and it loses on price for an all-NVMe design.

Reference points, both from aws.amazon.com/s3/pricing via search snippet (the live pricing
table did not render through the reader, so these are marked accordingly):
- S3 Standard storage $0.023/GB-month for the first 50 TB, $0.022 for the next 450 TB, $0.021
  above 500 TB. R2 is 1.53x cheaper than S3 Standard on storage. [unverified] - obtained from
  the search snippet of the aws.amazon.com/s3/pricing page and from multiple secondary sources
  (upstash.com, cloudzero.com, cloudforecast.io); the AWS pricing table itself is JS-rendered
  and did not render.
- S3 data transfer out to internet $0.09/GB for the first 10 TB.
  https://www.cloudflare.com/learning/cloud/what-is-aws-data-transfer-pricing/ (read 2026-10-29)
  gives "First 10 TB / Month $0.09 per GB. Next 40 TB / Month $0.09 per GB. Next 100 TB / Month
  $0.07 per GB." and attributes it to Amazon S3 to Internet. [verified] as a Cloudflare-published
  figure about AWS, not read from AWS's own page.
- S3 per-request rates ($0.005 per 1,000 PUT/COPY/POST/LIST, $0.0004 per 1,000 GET):
  [unverified]. Multiple secondary sources agree, but I could not render the AWS table. Do not
  put this number in a cost model without checking aws.amazon.com/s3/pricing directly.

### 1.14 Self-hosted compute beats Cloudflare per vCPU-second by about 4.5x at full utilisation, and loses badly on memory and disk

Claim: Cloudflare's $0.00002 per vCPU-second is about 4.5x more expensive than a fully utilised
Hetzner AX41 core, but Cloudflare's memory and disk rates are 5x to 6x more expensive than
Hetzner's, and Cloudflare charges egress where Hetzner does not.

Evidence: https://www.hetzner.com/dedicated-rootserver/matrix-ax/ (read 2026-10-29).

| Model | From EUR/month excl. VAT | CPU | RAM | NVMe | Port |
| --- | --- | --- | --- | --- | --- |
| AX41 | 59.00 | AMD Ryzen 5 3600, 6c/12t, Zen 2 | 64 GB DDR4 | 2x 512 GB | 1 GBit/s, unlimited traffic |
| AX42 | 79.00 | AMD Ryzen 7 PRO 8700GE, 8c/16t, Zen 4 | 64 GB DDR5 ECC | (config) | 1 GBit/s |
| AX102 | 159.00 | AMD Ryzen 9 7950X3D, 16c/32t, Zen 4 3D V-Cache | 128 GB DDR5 ECC | 2x 1.92 TB Gen4 DC | 1 GBit/s |
| AX162 | 319.00 | AMD EPYC 9454P, 48c/96t, Genoa | 128 GB DDR5 ECC reg. | 2x 1.92 TB up to 2x 15.36 TB | 1 GBit/s |

The AX page states "Traffic usage is unlimited and free of charge" and "Network availability
min. 99.9 %", with 50.12 TBit/s total bandwidth. Setup fees: AX41 EUR 0.00, AX42 EUR 49.00,
AX102 EUR 129.00, AX162 EUR 304.00.

Derived arithmetic on published rates (my calculation, clearly labelled as derived):

- AX41 at EUR 59.00/month over 730 hours = EUR 0.0808/hour for the whole box.
- Across 6 physical cores: EUR 0.01347 per vCPU-hour.
- At Hetzner's own 1.19 USD/EUR ratio: $0.0160 per vCPU-hour = $0.00000446 per vCPU-second.
- Cloudflare Containers CPU: $0.000020 per vCPU-second.
- Ratio: Cloudflare is about 4.5x more expensive per vCPU-second than a 100%-utilised AX41 core.
- Caveat that cuts the other way: the AX41 is a 2019 Zen 2 part. Per unit of actual work the
  gap is wider than 4.5x, and the comparison is against a box that must be paid for whether or
  not it is used.
- Cloudflare Containers memory at $0.0000025/GiB-second = $0.009/GiB-hour. 64 GiB held for a
  month (730 h) = 46,720 GiB-hours, less 25 included = about $420/month. That is about 6x the
  entire AX41 price, which includes the 64 GB.
- Cloudflare Containers disk at $0.00000007/GB-second = $0.18396/GB-month (730 h). Hetzner's
  1 TB NVMe addon is $36.00/month = $0.036/GB-month. Cloudflare disk is about 5.1x more
  expensive.
- Cloudflare Containers egress: $0.025/GB beyond the included 1 TB in NA and Europe. Hetzner:
  unlimited. 10 TB/month of container egress on Cloudflare = 9 TB billable x $0.025 = $225/month.
  On Hetzner = $0. 10 TB/month sustained averages about 4 Mbps, well inside the 1 Gbit port.
Net: self-hosting wins on always-on bulk memory, disk and egress. Cloudflare wins decisively on
bursty or idle-heavy CPU, because Cloudflare bills active CPU only and Hetzner bills the box.

Label: [verified] for all Hetzner published prices and specs. [unverified] for every derived
ratio, which is my arithmetic on those published prices and is labelled derived above.

### 1.15 Workers CPU and Cloudflare Containers CPU are priced identically per CPU-second

Claim: The $0.02 per million CPU-ms Workers rate and the $0.000020 per vCPU-second Containers
rate are the same number. A design can move work between Workers and Containers without a unit
price change.

Evidence: $0.02 per 1,000,000 CPU-ms (Workers pricing page, read 2026-10-29) and $0.000020 per
vCPU-second (Containers pricing page, read 2026-10-29). $0.02 / 1,000 CPU-seconds = $0.00002 per
CPU-second. Identical.

Included allocations are not identical and this is the trap: Workers includes 30 million CPU-ms
(= 30,000 CPU-seconds = 500 CPU-minutes) per month. Containers includes 375 vCPU-minutes. So
Containers gets 125 fewer CPU-minutes included than Workers for the same $5 floor.

Label: [verified] for both published rates. The identity is arithmetic on them.

### 1.16 Self-hosted CI is about 3x cheaper per build-minute than Workers Builds and GitHub

Claim: At $0.005/minute Workers Builds overage sits between a self-hosted Hetzner runner and
GitHub-hosted Linux runners.

Evidence and arithmetic:

- Workers Builds: 6,000 minutes/month included on Paid, then $0.005/minute.
  https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/ (read 2026-10-29).
  [verified]
- GitHub Actions per-minute rates, https://docs.github.com/en/billing/concepts/product-billing/github-actions
  (read 2026-10-29): Linux 1-core (x64) `actions_linux_slim` $0.002; Linux 2-core (x64)
  `actions_linux` $0.006; Linux 2-core (arm64) `actions_linux_arm` $0.005; Windows 2-core (x64)
  $0.010; Windows 2-core (arm64) $0.010. The same page: "As a guide, $300 USD covers 50,000
  minutes on a standard Linux runner at $0.006 USD per minute." [verified]
- Self-hosted on an AX41: EUR 59.00/month / 43,800 minutes = EUR 0.001347/minute. At Hetzner's
  own 1.19 ratio, about $0.0016/minute. That is about 3.1x cheaper than Workers Builds overage
  and about 3.8x cheaper than a GitHub Linux 2-core runner. Derived. [unverified] as a
  conversion; the EUR 59.00 is [verified].

The decisive constraint is not price but the 20-minute build timeout and 4 vCPU / 8 GB ceiling.
A build that needs more than 20 minutes or more than 4 vCPU cannot run on Workers Builds at any
price. That, not the $0.005, is the reason to run heavy CI on own metal.

Label: [verified] for the Cloudflare and GitHub rates. [unverified] for the derived
self-hosted per-minute figure.

### 1.17 MinIO, the default self-hosted S3 answer, is archived and unmaintained

Claim: The minio/minio repository is archived, its README says it is no longer maintained, the
community edition is now distributed as source only with no prebuilt binaries, and the project
points users at AIStor Free and AIStor Enterprise.

Evidence, GitHub API `gh api repos/minio/minio` (read 2026-10-29):
- full_name: minio/minio
- description: "MinIO is a high-performance, S3 compatible object store, open sourced under GNU
  AGPLv3 license."
- stargazers_count: 61,300
- license: AGPL-3.0
- pushed_at: 2026-04-24T17:54:39Z
- language: Go
- open_issues_count: 78
- size: 125,263
- archived: true
- default_branch: master

Releases via `gh api repos/minio/minio/releases`: 30 releases total; the three most recent are
RELEASE.2025-10-15T17-29-55Z published 2025-10-16, RELEASE.2025-09-07T16-13-09Z published
2025-09-07, and RELEASE.2025-07-23T15-54-02Z published 2025-07-23. The latest release is more
than 12 months old as of the read date.

Latest commits via `gh api repos/minio/minio/commits`: 7aac2a2c dated 2026-02-12 with message
"update README.md format and clarify state of the project", and be7800c8 dated 2026-01-06 with
"update README.md with latest free license and enterprise opt". No code commits since.

README via `gh api repos/minio/minio/contents/README.md` (read 2026-10-29), quoted:
"**THIS REPOSITORY IS NO LONGER MAINTAINED.**" with alternatives listed as "AIStor Free
(https://min.io/download) - Full-featured, standalone edition for community use (free license)"
and "AIStor Enterprise (https://min.io/pricing) - Distributed edition with commercial support".
Further: "**Important:** The MinIO community edition is now distributed as source code only. We
will no longer provide pre-compiled binary releases for the community version." Install options
given are `go install github.com/minio/minio@latest` or building a Docker image from the
provided Dockerfile. The README also carries a licensing warning: "All usage of MinIO in your
application stack requires validation against AGPLv3 obligations, which include but are not
limited to the release of modified code to the community from which you have benefited. Any
commercial/proprietary usage of the AGPLv3 software, including repackaging or reselling
services/features, is done at your own risk."

The LICENSE file is still GNU AGPL v3, 19 November 2007, confirmed via
`gh api repos/minio/minio/contents/LICENSE`.

Label: [verified]

### 1.18 Two maintained, permissively licensed S3-compatible alternatives exist and are moving fast

Claim: RustFS (Apache-2.0, Rust) and SeaweedFS (Apache-2.0, Go) are both actively maintained,
both S3-compatible, and both larger than MinIO by star count is not true but both are within an
order of magnitude and far more active by commit date.

Evidence, GitHub API, all read 2026-10-29:

- `gh api repos/rustfs/rustfs`: full_name rustfs/rustfs; description "RustFS is an open-source,
  S3-compatible high-performance object storage system supporting migration and coexistence with
  other S3-compatible platforms such as MinIO and Ceph."; stargazers_count 35,525;
  license Apache-2.0; pushed_at 2026-10-29T10:28:34Z; language Rust; open_issues_count 66;
  archived false.
- `gh api repos/seaweedfs/seaweedfs`: full_name seaweedfs/seaweedfs; description "SeaweedFS is
  a distributed storage system for object storage (S3), file systems, and Iceberg tables,
  designed to handle billions of files with O(1) disk access and effortless horizontal
  scaling."; stargazers_count 35,799; license Apache-2.0; pushed_at 2026-10-29T10:32:07Z;
  language Go; open_issues_count 710; archived false.

`gh api repos/garagehq/garage` returned HTTP 404 "Not Found". Garage is a real self-hosted S3
project but the owner/repo slug I tried is wrong, so I have no metadata for it. Do not cite
Garage from this document.

Label: [verified] for RustFS and SeaweedFS. [unverified] for Garage; slug not found.

### 1.19 The dashboard SPA itself can be hosted on Cloudflare for $5/month

Claim: A static SPA served as Workers static assets incurs no request charge and no CPU charge,
so the control-plane SPA on Cloudflare costs the $5 floor and nothing else unless it makes
dynamic Worker invocations.

Evidence: https://developers.cloudflare.com/workers/platform/pricing/ (read 2026-10-29), footnote
3: "Requests to static assets are free and unlimited." Footnote 4 qualifies this: "When Workers
Caching is enabled, requests served from the Worker's cache are billed at the same per-request
rate as requests that invoke the Worker. This includes requests to static assets and
worker-to-worker invocations. CPU time is only billed when the Worker runs (on a cache miss or
bypass)."

Cloudflare's own Example 2 on that page models exactly this: 15 million requests/month, 80% (12
million) serving static assets, 7 ms CPU on the remainder. Total monthly cost $5.00. Every
line item is $0.

Relevant limits from https://developers.cloudflare.com/workers/platform/limits/ (read
2026-10-29): 100,000 static asset files per Worker version and 25 MiB per individual file on
Paid. Routes per zone 1,000.

Label: [verified]

### 1.20 Workers for Platforms removes the 500-Worker cap and is billed as ordinary Workers usage

Claim: Workers for Platforms runs an unlimited number of user Workers in a dispatch namespace,
lets the platform set per-customer CPU and subrequest limits, and is billed at ordinary Workers
rates. There is no separate Workers for Platforms pricing page.

Evidence: https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/
(read 2026-10-29, page "Last updated Oct 15, 2026"). "Workers for Platforms lets you run
untrusted code written by your customers, or by AI, in a secure hosted sandbox." Features:
"Custom limits - Set per-customer limits on CPU time and subrequests."

https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/
(read 2026-10-29) states a dispatch namespace provides "Unlimited number of Workers - No
per-account script limits apply to Workers in a namespace", "Isolation by default", "Dynamic
invocation", "Runs platform logic" and "Sets per-customer limits".

A targeted search for a Workers for Platforms pricing page
(`https://search.web.pkgforge.dev/search?q=cloudflare+workers+for+platforms+pricing+dispatch+namespace+cost&count=6&provider=tinyfish`,
read 2026-10-29) returned the Workers platform pricing page and the Workers for Platforms
product page, but no dedicated pricing page for Workers for Platforms. I found no page that
publishes a dispatch-namespace surcharge.

Label: [verified] for the unlimited-Workers claim and the per-customer limits.
[unverified] for the pricing conclusion; I am inferring "no separate price" from the absence of
a pricing page, which is weaker than a positive statement. Confirm against the Cloudflare
dashboard or an account team before relying on it.

### 1.21 Cloudflare Zero Trust is free to 50 users, but I could not read the live price table

Claim: Cloudflare Zero Trust / Cloudflare One has a free tier capped at 50 users and a
pay-as-you-go tier at $7 per user per month.

Evidence: I attempted https://www.cloudflare.com/plans/zero-trust-services/ (read 2026-10-29)
and https://developers.cloudflare.com/cloudflare-one/fundamentals/plans/ (read 2026-10-29,
returned HTTP 422). Neither rendered a pricing table; the first returned only marketing copy
("Start a proof of concept with our free plan today.").

Secondary sources found via pkgforge search, all dated 2026, agree on $0 up to 50 users and $7
per user per month pay-as-you-go: zerotrustcost.com/cloudflare-zero-trust-pricing (Sep 26, 2026),
zerometric.net/research/cloudflare-zero-trust-free-plan-limits-2026/ (Jul 18, 2026),
underdefense.com/industry-pricings/cloudflare-ultimate-guide-for-security-products/. A
Cloudflare-hosted PDF, "Cloudflare Zero Trust Pricing & Plans (Q4 2022)", lists "Free $0
forever", "Pay as you go $7/user/month", "Contract annual custom price per user" and "50 user
limit" for Free.

Label: [unverified]. The live Cloudflare pricing page did not render and I did not read a
current primary source. Do not put $7/user/month in the spec without checking the live plans
page. This is A5's topic, not mine; I flag it because it is a cost line in the architecture.

---

## 2. What this changes for the spec

### 2.1 Keep the data plane on own metal, but be specific about which plane

The cost data does not support a blanket "self-hosted is cheaper". It supports a split, and the
split line is different for each resource:

- Egress: self-hosted wins by an unbounded margin. Hetzner AX servers include unlimited traffic
  on a 1 Gbit port. Cloudflare Containers charges $0.025/GB beyond 1 TB in NA/EU. R2 charges $0.
  Put every high-volume byte path on own metal behind a tunnel. This is the strongest single
  argument in the spec and it is fully verified.
- Always-on memory and disk: self-hosted wins by 5x to 6x. 64 GiB held for a month on Cloudflare
  Containers costs about $420. An AX41 with 64 GB costs EUR 59.00 and includes 2x 512 GB NVMe.
  Any always-on container workload belongs on own metal.
- CPU: Cloudflare wins for bursty and idle-heavy workloads, because Cloudflare bills active CPU
  only and Hetzner bills the box. A workload that averages 10% CPU on a dedicated core is 10x
  cheaper on Cloudflare. A workload that averages 100% is 4.5x cheaper on Hetzner. Model the
  duty cycle before choosing, and say which duty cycle the model assumed.
- Object storage: it depends entirely on the medium. R2 at $0.015/GB-month beats Hetzner NVMe
  ($0.036/GB-month for a 1 TB addon, $0.0246 for 15.36 TB DC NVMe) and loses to Hetzner bulk HDD
  ($0.00195/GB-month for 22 TB) and to a Hetzner Storage Box (about $0.0024/GB-month for 20 TB,
  derived) and to Backblaze B2 ($0.00695/GB-month, free API calls, free egress to 3x storage).
  If the storage design is all-NVMe, R2 is cheaper per GB than the self-hosted alternative and
  the only remaining argument for self-hosting is data residency and egress, not price.
- Requests: self-hosted has no per-request price at all, so any request-heavy path is cheaper
  on own metal once the box is paid for. R2 Class B at $0.36/million and DO requests at
  $0.15/million are small numbers individually, but Cloudflare's own asset-hosting example
  shows 290 million reads costing $104.40/month. At that volume, own metal wins.

Recommendation for the spec: state the crossover explicitly per resource rather than claiming a
global win. The honest summary is that the operator should run long-running containers, bulk
storage and CI on own metal because of egress, memory, disk and duration limits, and should use
Cloudflare Workers plus R2 for the request-facing control plane and for bursty compute, because
that is where Cloudflare's pricing is genuinely competitive or better.

### 2.2 The 20-minute Workers Builds timeout is the real CI constraint, not the $0.005

Workers Builds is capped at 20 minutes, 4 vCPU, 8 GB RAM, 20 GB disk and 6 concurrent builds.
Heavy CI for containers and long-running builds cannot run there at any price. The spec should
state this as a hard constraint and route heavy CI to self-hosted runners, keeping Workers
Builds only for the dashboard/control-plane Worker deployment path where it is a good fit.

Also design around the Containers build trap: preview builds that run `wrangler versions upload`
do not update container images or instances. Production branch builds must run `wrangler deploy`.

### 2.3 Durable Objects are the wrong place to put long-lived stateful processes

A DO is billed for a full 128 MB regardless of actual usage, at $12.50 per million GB-s. One
always-on object is roughly $4.11/month at list rate. Cloudflare's own Example 3 shows 100
always-on objects with one WebSocket each costing $419.30/month, and the same workload with
WebSocket Hibernation costing $20.65/month. That 20x lever is the difference between viable and
not.

Two consequences for the spec:
- Any long-running stateful process in the design belongs on own metal, not in a DO. A DO is for
  coordination and for small per-tenant state.
- If DOs are used with WebSockets, WebSocket Hibernation is mandatory, not optional, and the
  design must avoid `accept()` on a non-hibernatable WebSocket, which the pricing page warns
  "will incur duration charges for the entire time the WebSocket is connected".
- Per-object SQLite storage is capped at 10 GB and fails with `SQLITE_FULL` on writes while
  reads and deletes keep working. Any per-tenant store must shard below 10 GB and handle that
  specific error.

### 2.4 Do not build on MinIO

MinIO is archived, unmaintained, source-only with no prebuilt binaries, and AGPL-3.0 with an
explicit warning in its own README that commercial or proprietary usage is at the user's risk.
Any spec line that says "self-hosted S3 via MinIO" is a line that will not survive contact with
reality. Replace it with one of:
- RustFS (Apache-2.0, Rust, 35,525 stars, pushed 2026-10-29) - permissive licence, actively
  maintained, S3-compatible, explicitly positioned as a MinIO/Ceph migration target.
- SeaweedFS (Apache-2.0, Go, 35,799 stars, pushed 2026-10-29) - permissive licence, distributed,
  S3 plus Filer plus Iceberg tables, O(1) disk access.
- Backblaze B2 at $6.95/TB-month with free Class A/B/C API calls and free egress to 3x storage,
  if a managed service is acceptable and the S3 API surface is enough.
- Hetzner Storage Box or a dedicated server with bulk HDD plus any S3 gateway, if the cheapest
  possible dollar per GB-month is the goal and S3 API compatibility is not required.

The AGPL point is not a licensing opinion, it is a concrete constraint: if the operator's
control plane links to or wraps an AGPL object store and is distributed or offered as a service,
the AGPL obligations attach. RustFS and SeaweedFS are Apache-2.0 and do not carry that.

### 2.5 Put the SPA on Cloudflare and keep it static

Requests to static assets are free and unlimited on the Workers Paid plan. Cloudflare's own
Example 2 prices a 15-million-request/month SPA at $5.00 total. The spec should therefore host
the dashboard as Workers static assets behind a custom domain and put all dynamic behaviour
behind explicit Worker invocations or behind a tunnel to own metal. The $5/month floor is the
entire cost of the control plane's front end.

The one trap: with Workers Caching enabled, cache hits are billed at the full per-request rate,
including for static assets. If the SPA is fronted by a Worker with caching on, the "static
assets are free" property is lost. Serve assets from a Worker without caching enabled, or from
a route that bypasses the Worker.

### 2.6 Watch the KV write price

KV writes are $5.00 per million on Paid, which is 13.9x a KV read ($0.50/million) and 10x an R2
Class B operation ($0.36/million). A control plane that writes state to KV on every request will
be the most expensive part of the bill. Use KV as a read cache and put the write path in D1
($1.00/million rows written) or R2 ($4.50/million Class A) or on own metal.

### 2.7 Model R2 on reads, not on storage

Cloudflare's own asset-hosting example bills $104.40/month for 290 million Class B reads and $0
for storage and Class A. The spec's R2 cost model must be driven by read volume. Storage is the
small line until it reaches tens of TB.

### 2.8 Containers are triple-billed

A container request is billed as a Worker request, a Worker CPU charge, a DO request and DO
duration, because each container has its own Durable Object and incoming requests are handled by
the Worker. Any container cost estimate that only multiplies vCPU-seconds will understate the
bill. Add the Worker request and CPU line and the DO request line.

### 2.9 There is no Workers for Platforms surcharge that I could find

Workers for Platforms gives an unlimited number of user Workers in a dispatch namespace and
per-customer CPU and subrequest limits, with no dedicated pricing page found. This makes it a
plausible multi-tenant control plane on Cloudflare. But the conclusion rests on the absence of a
pricing page, which is weaker than a positive statement. Verify against the dashboard or an
account team before committing the spec to it.

---

## 3. Not covered / open questions

Named precisely, each with what would close it.

1. AWS S3 per-request rates. I could not render the aws.amazon.com/s3/pricing tables through
   the reader; the storage and egress figures came from search snippets and secondary sources.
   Close by reading https://aws.amazon.com/s3/pricing/ in a browser or via the AWS Pricing API.
   Do not use $0.005 per 1,000 PUT or $0.0004 per 1,000 GET in a model until then.

2. Cloudflare Zero Trust / Cloudflare One current per-user price. The live plans page did not
   render. Secondary sources from 2026 and a Cloudflare PDF from Q4 2022 agree on $0 to 50 users
   and $7/user/month, but I did not read a current primary source. Close by reading
   https://www.cloudflare.com/plans/zero-trust-services/ in a browser. This is A5's topic.

3. Whether the R2 subscription requires the $5 Workers Paid plan. The R2 get-started page says
   an R2 subscription is needed and that R2 is free to get started, but neither page I read
   states whether the subscription is gated on the Workers Paid plan. Close by checking the
   dashboard checkout flow or the Cloudflare billing policy page.

4. Argo Smart Routing price. The docs page says only "Explore pricing options for Argo in the
   dashboard" and publishes no number. Close from the dashboard.

5. Workers for Platforms pricing. No dedicated pricing page found. I inferred "billed as
   ordinary Workers usage" from its absence. Close with an account team or the dashboard.

6. Garage self-hosted S3 metadata. `gh api repos/garagehq/garage` returned 404. The owner/repo
   slug is wrong. Close with the correct slug if Garage is a candidate.

7. Per-core Cloudflare CPU performance. I compared price per vCPU-second, not work per
   vCPU-second. The Hetzner AX41 is a 2019 Zen 2 part and Cloudflare's fleet is newer, so the
   true cost-per-unit-of-work gap is wider than 4.5x in Cloudflare's favour than my arithmetic
   suggests. Closing this needs a benchmark of the same workload on workerd and on an AX41,
   which is A3's territory, not a pricing page.

8. Cloudflare Containers regional availability and whether a container can be pinned to a
   region near the operator's own machines. Not a pricing question but it changes the egress
   line and the latency line. Not covered here.

9. Enterprise and contract pricing for all of the above. Every figure in this document is
   self-serve list price. Enterprise Workers contracts are billed on a contracted usage model
   rather than the Standard model, per the Workers pricing page. Not covered.

10. Cloudflare's own bandwidth caps behind Tunnels. The Tunnel docs say four long-lived
    connections to two data centers per tunnel and that multiple replicas add HA, but publish no
    throughput ceiling. If the data plane pushes serious volume through a tunnel, the tunnel
    itself may be the bottleneck and that number is not published. Close by measurement, not by
    reading.

11. Basin Catalog billing start date. The changelog of 2026-05-28 says billing is not yet
    enabled with at least 30 days notice. Whether billing has started since is not something I
    could determine. Close by checking the changelog again at design time.

12. Tax and currency. All Hetzner figures exclude VAT. All Cloudflare figures are USD and
    exclude tax. No FX rate was verified; where I converted I used Hetzner's own published USD
    figures or labelled the conversion as derived.

---

## Source list with read dates

Every URL below was read on 2026-10-29 through the pkgforge gateway pinned to provider=tinyfish,
unless marked otherwise.

- https://developers.cloudflare.com/r2/pricing/ - R2 pricing. Page "Last updated Oct 26, 2026".
- https://developers.cloudflare.com/r2/platform/limits/ - R2 limits. "Last updated Jun 8, 2026".
- https://developers.cloudflare.com/r2/get-started/ - R2 subscription requirement. "Last updated Apr 21, 2026".
- https://developers.cloudflare.com/basin-catalog/platform/pricing/ - Basin Catalog pricing. "Last updated Oct 1, 2026".
- https://developers.cloudflare.com/changelog/post/2026-05-11-r2-data-catalog-pricing-announced/ - Dated May 28, 2026.
- https://developers.cloudflare.com/workers/platform/pricing/ - Workers, KV, Queues, Workflows, D1, Hyperdrive, Workers Logs pricing. "Last updated Oct 2, 2026".
- https://developers.cloudflare.com/workers/platform/limits/ - Workers limits. "Last updated Oct 12, 2026".
- https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/ - Workers Builds limits and pricing. "Last updated May 29, 2026".
- https://developers.cloudflare.com/workers/ci-cd/builds/ - Workers Builds behaviour. "Last updated Oct 28, 2026".
- https://developers.cloudflare.com/durable-objects/platform/pricing/ - DO pricing. "Last updated Oct 18, 2026".
- https://developers.cloudflare.com/durable-objects/platform/limits/ - DO limits. "Last updated Jun 1, 2026".
- https://developers.cloudflare.com/containers/platform/pricing/ - Containers pricing. "Last updated Oct 5, 2026".
- https://developers.cloudflare.com/containers/platform/limits/ - Containers limits and instance types. "Last updated Oct 21, 2026".
- https://developers.cloudflare.com/containers/ - Containers overview. Read 2026-10-29.
- https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/ - Containers and Sandboxes GA. Dated April 13, 2026.
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/ - Workers for Platforms. "Last updated Oct 15, 2026".
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/ - Dispatch namespaces. Read 2026-10-29.
- https://developers.cloudflare.com/tunnel/ - Cloudflare Tunnel. "Last updated Sep 11, 2026".
- https://developers.cloudflare.com/argo-smart-routing/ - Argo Smart Routing. Read 2026-10-29.
- https://www.hetzner.com/dedicated-rootserver/matrix-ax/ - Hetzner AX dedicated server specs and prices. Read 2026-10-29.
- https://www.hetzner.com/storage/storage-box/ - Hetzner Storage Box prices. Read 2026-10-29.
- https://docs.hetzner.com/robot/dedicated-server/dedicated-server-hardware/price-server-addons/ - Hetzner disk, RAM, NIC addon prices in EUR and USD. "Last change on 2026-10-07".
- https://www.hetzner.com/cloud/ - Hetzner Cloud landing, entry prices EUR 5.99 and EUR 6.49 per month excl. VAT. Read 2026-10-29.
- https://docs.hetzner.com/cloud/servers/overview/ - Hetzner Cloud server types, IPv4 EUR 0.50/month. Read 2026-10-29.
- https://www.backblaze.com/cloud-storage/pricing - B2 pricing. Read 2026-10-29.
- https://docs.github.com/en/billing/concepts/product-billing/github-actions - GitHub Actions per-minute runner rates. Read 2026-10-29.
- https://www.cloudflare.com/learning/cloud/what-is-aws-data-transfer-pricing/ - AWS S3 egress to internet, Cloudflare-published. Read 2026-10-29.
- https://r2-calculator.cloudflare.com/ - R2 pricing calculator, "public fees as of January 1, 2026". Read 2026-10-29.

GitHub API, all read 2026-10-29:
- minio/minio - 61,300 stars, AGPL-3.0, Go, archived, pushed 2026-04-24, latest release RELEASE.2025-10-15T17-29-55Z published 2025-10-16, 30 releases, 78 open issues, size 125,263.
- rustfs/rustfs - 35,525 stars, Apache-2.0, Rust, pushed 2026-10-29T10:28:34Z, 66 open issues.
- seaweedfs/seaweedfs - 35,799 stars, Apache-2.0, Go, pushed 2026-10-29T10:32:07Z, 710 open issues.

Read via search result only, not fetched, and therefore not used as evidence for any number:
- https://blog.cloudflare.com/containers-are-available-in-public-beta-for-simple-global-and-programmable (dated Jun 24, 2025).
- https://www.cloudflare.com/pg-cloudflare-r2-vs-aws-s3/ (prices stated as of 10/10/2024, stale).

pkgforge search calls used for discovery only, read 2026-10-29. No number in this document
rests on a search snippet alone unless the entry is explicitly labelled [unverified].
