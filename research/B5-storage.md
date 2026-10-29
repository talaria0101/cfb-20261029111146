# B5-storage: self-hosted object storage and the small-footprint R2 replacement

Research date: 2026-10-29. All sources read on that date. Every figure below comes
from a call made on that date; nothing is carried over from memory.

Method note: all web reads went through the pkgforge tinyfish gateway
(`search.web.pkgforge.dev` and `read.web.pkgforge.dev`), and all repository
metadata through `gh api`. No fallback to the built-in web_search/web_fetch
tools was needed for any claim in this document.

---

## 1. Findings

### F1. MinIO is no longer a usable open-source option. The repository is archived. [verified]

Evidence:
- `gh api repos/minio/minio` returns `"archived": true`. Stars 61,300. License
  `AGPL-3.0`. Language Go. Last push `2026-04-24T17:54:39Z`.
- Last three commits on the default branch:
  `2026-02-12 "update README.md format and clarify state of the project"`,
  `2026-01-06 "update README.md with latest free license and enterprise option"`,
  `2025-12-03 "update README.md maintenance mode"`. The last commit that is not a
  README edit is from 2025-12-03.
- Last release: `RELEASE.2025-10-15T17-29-55Z`, published 2025-10-16.
- README (fetched live from the GitHub API today) opens with:

  > **THIS REPOSITORY IS NO LONGER MAINTAINED.**
  >
  > **Alternatives:**
  > - **[AIStor Free](https://min.io/download)** - Full-featured, standalone
  >   edition for community use (free license)
  > - **[AIStor Enterprise](https://min.io/pricing)** - Distributed edition with
  >   commercial support

- Same README, section "Source-Only Distribution": "The MinIO community edition
  is now distributed as source code only. We will no longer provide pre-compiled
  binary releases for the community version."

Corroborating timeline, from InfoQ (2025-12-28,
https://www.infoq.com/news/2025/12/minio-s3-api-alternatives/) and the
maintainer's own issue #21714 opened 2025-12-03
(https://github.com/minio/minio/issues/21714, "Maintenance Mode"):
- 2021-04-18: license changed from Apache-2.0 to AGPL-3.0. Confirmed directly:
  `gh api repos/minio/minio/commits?path=LICENSE` returns the commit dated
  `2021-04-18T19:41:13Z` with message "update license change for MinIO". Before
  that the only commit touching LICENSE is the 2014 initial commit.
- 2025-06: admin features stripped from the community console.
- 2025-10: prebuilt Docker images stopped.
- 2025-12-03: maintenance mode, no new features, no PR reviews.
- 2026-02: README states the project is no longer maintained.
- 2026-04-25: repository archived.

The successor product, AIStor Free, is not open source. From
https://www.min.io/download (fetched today): AIStor Free is a "free license"
that requires requesting a license key, is limited to a standalone single-node
deployment, and Enterprise is a 60-day trial plus a commercial quote. The
community edition is source-only with no binaries.

**Consequence for the spec: MinIO cannot be the storage layer.** Any design that
assumes `minio/minio` as the S3 engine is building on a dead repository with no
security patching.

### F2. SeaweedFS is the closest single-binary, single-node replacement, and it is Apache-2.0. [verified]

Evidence: `gh api repos/seaweedfs/seaweedfs`
- Stars 35,799. License `Apache-2.0`. Language Go.
- Last push `2026-10-29T10:32:07Z` (today). Open issues 710.
- Releases: `4.51` published 2026-10-25, `4.50` 2026-10-25, `4.49` 2026-10-23.
  Release cadence is roughly weekly.

Operational shape, from the README (fetched live today):
- One `weed` binary. `./weed mini -dir=./data` starts master, volume server,
  filer, S3 endpoint, WebDAV, the Iceberg REST catalog and the Admin UI in one
  process. S3 endpoint is `http://localhost:8333`. Docker equivalent:
  `docker run -p 8333:8333 -v weed-data:/data chrislusf/seaweedfs`.
- O(1) disk seek, one blob is one disk read.
- S3 Tables / Iceberg support in the same binary.
- Security default worth copying: without admin authentication or mTLS,
  `weed mini` binds the Admin UI/API and its worker gRPC control plane to
  loopback rather than the configured bind address. Remote workers must opt in
  with `-admin.worker.ip=<address>`.
- Enterprise split is stated explicitly in the README: the paid
  SeaweedFS Enterprise Edition at seaweedfs.com holds "data recovery,
  self-healing storage, customizable erasure coding, EC vacuum and repair".
  The community edition keeps hot-data replication and the S3 API.

Measured resource use, from a same-host side-by-side benchmark run by a
third party (r/selfhosted, 7 months ago,
https://www.reddit.com/r/selfhosted/comments/1ryfzw4/minio_vs_seaweedfs_vs_garage/).
The author states the benchmark scripts and write-up were AI-generated and that
he corrected several measurement errors, including `docker stats` under-reporting
Garage memory because of LMDB mmap. Treat as one operator's measurement, not a
controlled study:
- Idle memory: SeaweedFS 247 MB (3 containers), MinIO 269 MB, Garage ~90 MB.
- Memory under write load: SeaweedFS 421 MB, MinIO 441 MB.
- Sequential 1000 x 5 KB uploads, 1 worker: SeaweedFS 431 ops/s, Garage 376,
  MinIO 113.
- Disk efficiency on unique random data: SeaweedFS 1.02x, MinIO 1.00x,
  Garage 1.29x.
- A separate maintainer-tracked issue confirms the filer's baseline memory
  regressed: https://github.com/seaweedfs/seaweedfs/issues/9035 (opened
  2026-04-11, now closed) reports the filer at 250-360 MB after startup in 4.18+
  against 80-90 MB previously.

Feature coverage for a backup/WORM role: SeaweedFS documents Object Lock with
governance, compliance and legal hold, plus versioning
(https://www.gigenet.com/blog/minio-alternatives/, published 2026-10-16, which
checked every claim against each project's own site or GitHub on that date).

### F3. Garage is the best geo-distributed small-cluster store, but it is AGPL-3.0, eventually consistent, and has no versioning or Object Lock. [verified]

Evidence:
- Repository is a mirror: `gh api repos/deuxfleurs-org/garage` returns
  description "(Mirror) S3-compatible object store for small self-hosted
  geo-distributed deployments. Main repo: https://git.deuxfleurs.fr/Deuxfleurs/garage".
  Stars 4,784. License `AGPL-3.0`. Language Rust. Last push
  `2026-10-24T15:01:38Z`. Latest tag `v2.5.0`, commit dated `2026-10-23T14:13:45Z`
  ("bump version to v2.5.0"). Open issues on the mirror: 2 (the real tracker is
  on their own Forgejo instance, so the GitHub issue count is not a health
  signal).
- There is no GitHub Releases entry (`releases` length 0); releases are published
  from git.deuxfleurs.fr.

Documented requirements, from https://garagehq.deuxfleurs.fr/ (fetched today):
- "Any x86_64 CPU from the last 10 years, ARMv7 or ARMv8"
- RAM: 1 GB
- Disk: at least 16 GB
- Network: 200 ms or less, 50 Mbps or more
- "Heterogeneous hardware: build a cluster with whatever second-hand machines
  are available"
- "We ship a single dependency-free binary that runs on all Linux distributions"

Architecture, from the official feature list
(https://garagehq.deuxfleurs.fr/documentation/reference-manual/features/,
fetched today):
- No RAFT and no consensus algorithm internally. Requests are handled
  independently with no leader bottleneck. This is the reason it works across
  consumer-grade Internet links.
- Metadata is local per node and replicated through CRDTs (Justin Cormack's
  analysis, https://buttondown.com/justincormack/archive/ignore-previous-directions-10-new-rusty-object/,
  fetched today). Storage engine is LMDB by default, or sqlite.
- Replication only, configurable replica count, no erasure coding. Deduplication
  of all blocks plus optional Zstd compression.
- Geo-distribution is a first-class layout constraint.
- Static website serving from a bucket, with a `/check` endpoint designed for
  reverse proxies such as Caddy to avoid requesting TLS certificates for
  domains that are not websites.
- Bucket aliases, including per-user aliases so different users can have
  buckets with the same name.
- Cluster administration API v2, with a published OpenAPI 3.1.0 specification at
  https://garagehq.deuxfleurs.fr/api/garage-admin-v2.json (fetched today; spec
  version `v2.5.0`, license identifier `AGPL-3.0`). Endpoint families include
  `/v2/CreateKey`, `/v2/ListBuckets`, `/v2/ApplyClusterLayout`,
  `/v2/GetClusterStatus`, `/v2/GetNodeStatistics`, `/v2/LaunchRepairOperation`,
  plus `/health` and `/metrics` (Prometheus) and `/check`.
- Prometheus metrics and OpenTelemetry traces.
- Automatic node discovery via Kubernetes and via Nomad when used with Consul.
- "As long as all of your nodes don't change their IP address at the same time,
  Garage should be able to tolerate nodes with changing/dynamic IP addresses."
  This matters directly for machines that sit behind a tunnel and get a new
  address.
- Experimental K2V key/value API for bulk small values.

S3 API gaps, from Garage's own compatibility page
(https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/,
fetched today). Note the page's own update history ends at 2022-05-25, so treat
individual rows as a project claim of unknown freshness:
- Missing: signature v2, bucket versioning.
- Present: signature v4, path-style and vhost-style URLs, presigned URLs,
  SSE-C encryption, all multipart endpoints, website endpoints.
- "All endpoints that are missing on Garage will return a 501 Not Implemented."

Cormack's independent read on Garage's consistency model: it is eventually
consistent and "intentionally does not support conditional PUT as it is
eventually consistent, so cannot make any such guarantees". Encryption is SSE-C
only, which AWS has deprecated and is gradually removing, so tooling support for
it may be poor. He recommends SSD for metadata and HDD for data, and notes a
10 TB drive rebuild takes about a day at 1 Gbps.

Funding, from the same project site: NGI POINTER 2021-2022 (3 FTE for a year),
NLnet / NGI0 Entrust 2023-2024 (1 FTE), NLnet / NGI0 Commons Fund 2025 (1.5
FTE). The project blog (fetched today) announces a further NLnet grant for a
2026 roadmap on reliability and performance.

### F4. RustFS has a serious maturity and security problem. Do not build on it yet. [verified]

Evidence: `gh api repos/rustfs/rustfs`
- Stars 35,526. License `Apache-2.0`. Language Rust. Last push
  `2026-10-29T10:28:34Z` (today). Open issues 66.
- `1.0.0` released 2026-09-16. `1.0.4` released 2026-10-25. So it is past 1.0
  and shipping fast.

Security record, from the repository's own advisory list
(`gh api repos/rustfs/rustfs/security-advisories`), eight advisories published
in a single batch on 2026-10-18:
- `GHSA-28w4-rp2p-636w`, high: "Object Lock COMPLIANCE bypass: force-deleting a
  bucket destroys retained objects in RustFS 1.0.0".
- `GHSA-rhg6-jrf2-29c4`, high: "Alternate protocol listeners (WebDAV, FTP, SFTP)
  bypass bucket policies and condition-key policy denials".
- `GHSA-xm99-m3gq-83g8`, high: "RustFS 1.0.0-rc.5: an upload URL still reads any
  bucket".
- `GHSA-g7fq-6xjm-mxf4`, medium: DeleteObjects writes delete markers at the
  resolved path of dot-segment keys, bypassing prefix-scoped delete permissions.
- `GHSA-wqmc-vjgv-jrpw`, medium: SSE-C objects expose plaintext MD5 as ETag,
  allowing content recovery with only `s3:ListBucket`.
- `GHSA-q23w-fp7p-472v` and `GHSA-9wgh-5r68-49p7`, medium: policy handling bugs,
  one of which hangs a worker thread.
- `GHSA-pq29-69jg-9mxc`: path traversal, critical, CVSS estimated 9.9,
  arbitrary file read.
- `CVE-2025-68926`: hardcoded token `rustfs rpc` with privileged access prior to
  Alpha.78, usable to bypass the gRPC authentication mechanism.
- A third-party CVE tracker (https://app.opencve.io/cve/?vendor=rustfs) reports
  33 CVEs found for this vendor.

Correctness, from Cormack's analysis (same source as F3):
- "I opened an issue that conditional PUT is not concurrency safe after some
  testing." He notes MinIO has a distributed locking mechanism which RustFS
  removed, probably for performance, and that "providing a broken implementation
  under concurrency is worse than just not providing it at all".
- Target hardware assumption: "clusters of 16 machines with 8-12 NVMe drives
  each, connected with redundant 100Gb or 200Gb ethernet connections, and with
  redundant power", with a stated expectation that the store runs as first-line
  storage on NVMe rather than hard drives.
- Governance: "The code is Apache 2 licensed, although there is a CLA requiring
  copyright assignment, which is not ideal... what sort of commercial
  organisation there is, if any is very unclear."
- Documentation quality: "The documentation is terrible... at least some of the
  details are totally hallucinated by an AI in Chinese and then translated."

### F5. PGSTY's Silo fork keeps MinIO's code alive, as a bridge and not a destination. [verified]

Evidence: `gh api repos/pgsty/silo`
- Description "S3-Compatible Object Storage. A MinIO fork maintained by PGSTY".
  Stars 4,384. License `AGPL-3.0`. Language Go. Open issues 13.
  Created 2025-10-25. Last push `2026-10-29T03:23:45Z` (today).
- Releases: `RELEASE.2026-10-26T00-00-00Z` published 2026-10-26,
  `RELEASE.2026-10-18T00-00-00Z` 2026-10-18, `RELEASE.2026-09-16T00-00-00Z`
  2026-09-16.
- README (fetched today) states: "PGSTY Silo is an independent,
  community-maintained fork of the open-source MinIO server, published by
  Pigsty from pgsty/silo. It is not affiliated with, endorsed by, or sponsored
  by MinIO, Inc." It was renamed from `pgsty/minio` to `pgsty/silo` on
  2026-08-06, with the pre-rename artifacts kept on an archived `minio` branch
  up to `RELEASE.2026-08-04T00-00-00Z`.
- It restores the console, ships platform archives, Linux packages and Docker
  images for amd64 and arm64, and embeds a specific Console version.
- GigeNET's 2026-10-16 comparison adds the operational caveat: "a cluster can't
  mix MinIO and Silo nodes, so all nodes move together. Treat it as a bridge
  rather than a destination."

Also present but not viable: `soulteary/otterio` (96 stars, Apache-2.0, Go,
last push 2026-10-28), an independently maintained fork of the Apache-licensed
MinIO codebase. Too small to rely on. `wrkode/openbucket` (1 star, AGPL-3.0) and
`imprezahost/impreza-s3-server` (0 stars) are not usable.

### F6. Ceph RGW is the feature-complete option and the heaviest to operate. [verified]

Evidence:
- `gh api repos/ceph/ceph`: stars 17,178. License reports `NOASSERTION`, which
  resolves from the repo's `COPYING` file to "LGPL-2.1 or LGPL-3" for the
  project as a whole, with BSD-3-Clause and CC-BY-SA-3.0 for vendored
  components. Language C++. Open issues 1,830. Last push
  `2026-10-29T11:12:39Z` (today).
- Tags: `v22.0.0` (commit 2026-10-28), `v21.3.0` (2026-06-10), `v21.1.2`
  (2026-10-08). Stable-line releases use names: Tentacle 20.2.4 and Squid
  19.2.6 were released 2026-08-19 as hotfixes for four CVEs
  (https://ceph.io/en/news/blog/2026/v20-2-4-v19-2-6-combo-released/).
- RGW daemon memory, measured by the Ceph project itself
  (https://ceph.io/en/news/blog/2025/benchmarking-object-part2/): "Each RGW
  daemon consumed between 170 and 260 MiB of memory during PUTs and between 205
  and 260 MiB for GETs."
- Canonical's reference architecture states "RGW requires a minimum of 2 cores".
  Red Hat's hardware guide gives 1 GB RAM per daemon and 5 GB disk per daemon.
- Feature set: Object Lock in governance and compliance modes, versioning,
  lifecycle rules, multisite replication. It is the only option here with a
  decade of production S3 gateway history.
- Operational cost: 3 nodes minimum to keep three copies on three machines,
  placement groups, slow-disk alerts. Cormack, comparing RustFS to Ceph: "it is
  operationally relatively simple to understand, much more so than say Ceph."

### F7. Zenko is a data controller, not a storage cluster. [verified]

Evidence: `gh api repos/scality/Zenko`
- Description "Zenko is the open source multi-cloud data controller: own and
  keep control of your data on any cloud." Stars 672. License `Apache-2.0`.
  Last push `2026-10-29T11:13:24Z` (today). Open issues 21.
- Latest release `2.16.0`, published 2026-10-22.
- README (fetched today) describes the deployed stack as: nginx, Zenko
  Cloudserver (`scality/S3`), Zenko Backbeat async replication engine, MongoDB,
  and Redis.

Zenko is a namespace, replication and search layer in front of storage that
lives elsewhere. It requires MongoDB and Redis to run. It does not answer "where
do my bytes live on my own disks". GigeNET's summary: "Scality's Zenko
CloudServer is still maintained, though it's more of a single-process gateway
than a storage cluster." If the need is a plain S3 endpoint on own metal,
running `scality/S3` (CloudServer) directly is the relevant piece, not the
Zenko stack.

### F8. Versity S3 Gateway is a lightweight S3 front end with Object Lock, Apache-2.0. [verified]

Evidence: `gh api repos/versity/versitygw`
- Description "A simple to deploy but feature rich S3 object storage server for
  your filesystem". Stars 3,079. License `Apache-2.0`. Language Go. Open issues
  133. Last push `2026-10-29T10:03:30Z` (today).
- Releases: `v1.10.0` 2026-10-22, `v1.9.0` 2026-10-13, `v1.8.0` 2026-09-04,
  `v1.7.0` 2026-07-15. Monthly release cadence.

GigeNET's characterisation: "Versity's S3 Gateway puts an S3 API in front of a
filesystem or another object store and enforces Object Lock, but durability
comes from whatever sits underneath it." It documents Object Lock and versioning,
including on a POSIX backend.

### F9. Alarik is a new Apache-2.0 entrant, still beta and small. [verified, but not a candidate yet]

Evidence: `gh api repos/achtungsoftware/alarik`
- Description "High performance distributed S3 compatible object storage focused
  on speed and designed to be an open alternative to MinIO and RustFS." Stars
  575. License `Apache-2.0`. Language Swift. Open issues 8. Created 2025-12-06.
  Last push `2026-09-19T18:59:44Z`.
- Releases: `1.0.0-beta-16` 2026-09-03, `-beta-15` 2026-08-30, `-beta-14`
  2026-08-19, `-beta-13` 2026-07-30.
- Project site https://alarik.io/docs states Apache-2.0 and positions itself
  against RustFS. Note the last push is over a month old and the release
  cadence slowed after September.

Worth tracking, not worth adopting. Single-contributor-scale risk plus a beta
version number.

### F10. SQLite and KV layer: license and liveness vary sharply across the candidates. [verified]

SQLite replication and HA:

| Project | Repo | Stars | License | Lang | Last push | Last release | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LiteFS | superfly/litefs | 4,907 | Apache-2.0 | Go | 2026-10-28 | not captured | Beta. FUSE-based. Requires `/dev/fuse` and `SYS_ADMIN`. README: "LiteFS doesn't have database deletion implemented yet so that causes many tests to fail during teardown." |
| Litestream | benbjohnson/litestream | 14,549 | Apache-2.0 | Go | 2026-10-28 | not captured | Beta status. Standalone DR process, replicates SQLite incrementally to another file or S3 through the SQLite API only. Creates an internal `_litestream_lock` table in the source database. |
| rqlite | rqlite/rqlite | 17,881 | MIT | Go | 2026-10-29 | not captured | Raft consensus, single self-contained binary, plain HTTP/JSON API, hot backups, automated backups to S3, change data capture. "rqlite prioritizes data consistency and high availability over write throughput - every write goes through the Raft log - so it's not intended for write-scaling". |

KV and cache:

| Project | Repo | Stars | License | Lang | Last push | Last release | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Valkey | valkey-io/valkey | 27,558 | BSD-3-Clause | C | 2026-10-29 | 9.1.3 (2026-10-26) | Alive and fast-moving. README: "This project was forked from the open source Redis project right before the transition to their new source available licenses." |
| Dragonfly | dragonflydb/dragonfly | 31,831 | BSL 1.1 (not open source) | C++ | 2026-10-29 | v2.0.2 (2026-10-07) | Alive. License is the blocker, see below. |
| KeyDB | Snapchat/KeyDB | 12,499 | BSD-3-Clause | C++ | 2026-10-22 | v6.3.4 (2023-10-30) | Effectively dormant. Last master commit 2024-03-21. Last release is over three years old. 296 open issues. |
| Redict | redict/redict (Codeberg, not GitHub) | 356 on Codeberg | LGPL-3.0-only | C | 2025-10-10 | not captured | Dormant. Fork of Redis 7.2.4. `gh api repos/redict/redict` returns 404 because the project is not on GitHub. |

Dragonfly's license is a hard blocker for this project, not a nuance. The
`LICENSE.md` in the repository is the Business Source License 1.1, licensor
DragonflyDB Ltd, Change Date Nov 1 2030, Change License Apache-2.0. The
Additional Use Grant reads: "You may make use of the Licensed Work (i) only as
part of your own product or service, provided it is not an in-memory data store
product or service; and (ii) provided that you do not use, provide, distribute,
or make available the Licensed Work as a Service. A 'Service' is a commercial
offering, product, hosted, or managed service, that allows third parties ...
to access and/or use the Licensed Work ... that compete with Licensor products
or services." A self-hosted cheaper-alternative-to-Cloudflare product is exactly
that service. Dragonfly is out.

### F11. AGPL is a live commercial risk for this specific product, and it rules out two of the strongest candidates. [verified]

The operator is building a cheaper commercial alternative to Cloudflare's paid
products. If the storage layer is AGPL-3.0 and it is offered to users as a
service, the AGPL network-use clause is engaged.

- Garage: `AGPL-3.0`. This is the store explicitly designed for the "small
  self-hosted geo-distributed deployment" job, with the smallest footprint and
  the best admin API. Its license is the reason to think twice.
- Silo (pgsty/silo): `AGPL-3.0`, inherited from MinIO.
- MinIO itself: `AGPL-3.0` since 2021-04-18, and archived besides.
- SeaweedFS: `Apache-2.0`.
- RustFS: `Apache-2.0`, but see F4.
- Versity S3 Gateway: `Apache-2.0`.
- Ceph RGW: `LGPL-2.1 or LGPL-3`. Weak copyleft, permissive in practice for a
  service wrapper.
- Valkey: `BSD-3-Clause`. rqlite: `MIT`. LiteFS and Litestream: `Apache-2.0`.

### F12. Cloudflare's own upload size limit caps what can go through a tunnel, and it is the single most important constraint on this design. [verified]

- Cloudflare's request body size limit by plan is 100 MB on Free and Pro, 200 MB
  on Business, 500 MB on Enterprise, with only Enterprise able to request an
  adjustment. Confirmed from Cloudflare's own docs at
  https://developers.cloudflare.com/workers/platform/limits/: "Enterprise
  customers can adjust the maximum request body size up to 5 GB themselves from
  the zone's Network page (Maximum Upload Size)."
- This applies to tunnels. From a Cloudflare community thread,
  https://community.cloudflare.com/t/100mb-tunnel-limit/901339: "when using a
  tunnel, it's not possible to use 'DNS-only' mode, which results in a 100MB
  limit for file uploads."

This is a design constraint, not a footnote. An S3 endpoint reachable only
through a Cloudflare Tunnel cannot accept a single-request PUT larger than the
zone's plan limit. Anything the operator's users upload, any CI artifact, any
container image layer pushed through the tunnel, is bounded by it. The standard
mitigations are multipart upload with parts under the limit, presigned URLs that
point at an origin the client can reach directly, or a second path that does not
traverse Cloudflare's edge. Note that a Worker cannot simply relay a large body
either: Workers has its own request body size limit.

### F13. R2's own pricing, as the baseline the "cheaper" claim is measured against. [verified]

From https://developers.cloudflare.com/r2/pricing/, page marked "Last updated
Oct 26, 2026":

| | Standard storage | Infrequent Access storage |
| --- | --- | --- |
| Storage | $0.015 / GB-month | $0.01 / GB-month |
| Class A operations | $4.50 / million requests | $9.00 / million requests |
| Class B operations | $0.36 / million requests | $0.90 / million requests |
| Data retrieval | none | $0.01 / GB |
| Egress | free | free |

Free tier per month: 10 GB-month storage, 1 million Class A operations, 10
million Class B operations, free egress. Class A includes `PutObject`,
`UploadPart`, `CompleteMultipartUpload`, `ListObjects`. Class B includes
`GetObject`, `HeadObject`. `DeleteObject`, `DeleteBucket` and
`AbortMultipartUpload` are free.

The comparison that matters for the spec: R2's headline cost driver for a
self-hosted replacement is not storage price but the Class A operation price at
$4.50 per million, which is 12.5x the Class B price. A self-hosted store has no
per-operation charge, so the crossover point is dominated by request count, not
by gigabytes.

---

## 2. Comparison table

### Object storage: the shortlist for a small-footprint R2 replacement

| | SeaweedFS | Garage | Silo (pgsty) | Ceph RGW | RustFS | Versity GW | Zenko |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S3-compatible | yes | yes | yes (MinIO-compatible) | yes | yes | yes | yes (CloudServer) |
| License | Apache-2.0 | AGPL-3.0 | AGPL-3.0 | LGPL-2.1 / LGPL-3 | Apache-2.0 | Apache-2.0 | Apache-2.0 |
| Language | Go | Rust | Go | C++ | Rust | Go | JS |
| Smallest sensible setup | 1 node | 3 nodes | as MinIO | ~3 nodes | 1 node | 1 node | k8s + MongoDB + Redis |
| Object Lock | yes | no | yes | yes | yes | yes | n/a |
| Versioning | yes | no | yes | yes | yes | yes | n/a |
| Data protection | replication; EC for warm data | 3x replication only | erasure coding | replication or EC | erasure coding | none of its own | none of its own |
| Idle memory, measured | 247 MB (3 containers) | ~90 MB cgroup | not measured | 170-260 MiB per RGW daemon | not measured | not measured | not measured |
| Admin API | Admin UI + REST | REST admin API v2 + OpenAPI spec | MinIO admin API + console | REST + dashboard | console | CLI + S3 API | Backbeat + CloudServer APIs |
| Nomad / k8s discovery | k8s via Helm | k8s and Nomad via Consul | k8s | native | k8s | k8s | k8s |
| Latest release | 4.51 (2026-10-25) | v2.5.0 (2026-10-23) | RELEASE.2026-10-26 | v22.0.0 tag 2026-10-28 | 1.0.4 (2026-10-25) | v1.10.0 (2026-10-22) | 2.16.0 (2026-10-22) |
| Stars | 35,799 | 4,784 | 4,384 | 17,178 | 35,526 | 3,079 | 672 |
| Verdict for this spec | primary candidate | strong on fit, blocked on license | bridge only | too heavy | avoid for now | interesting niche | not a storage cluster |

### Metadata and cache layer

| | Valkey | Dragonfly | KeyDB | Redict | rqlite | LiteFS | Litestream |
| --- | --- | --- | --- | --- | --- | --- | --- |
| License | BSD-3-Clause | BSL 1.1 (not OSI open source) | BSD-3-Clause | LGPL-3.0-only | MIT | Apache-2.0 | Apache-2.0 |
| Hosted on | GitHub | GitHub | GitHub | Codeberg | GitHub | GitHub | GitHub |
| Stars | 27,558 | 31,831 | 12,499 | 356 | 17,881 | 4,907 | 14,549 |
| Last release | 9.1.3 (2026-10-26) | v2.0.2 (2026-10-07) | v6.3.4 (2023-10-30) | not captured | not captured | not captured | not captured |
| Alive | yes | yes | no | no | yes | yes (beta) | yes (beta) |
| Usable in a commercial service | yes | no, the Additional Use Grant forbids it | yes | yes | yes | yes | yes |
| Model | in-memory KV, Redis protocol | in-memory KV, Redis protocol | Redis fork | Redis 7.2.4 fork | SQLite + Raft, HTTP API | SQLite over FUSE, replicated | SQLite DR to file or S3 |
| Fit here | cache, queues, rate limits | none | none | none | control-plane state with HA | only if FUSE is acceptable | backup path for SQLite |

---

## 3. What this changes for the spec

**R1. Drop MinIO from the design entirely, and drop RustFS from the shortlist.**
MinIO's repository is archived as of 2026-04-25 and its successor is a
proprietary single-node product that needs a license key. There is no path where
`minio/minio` is the storage engine of a new product. RustFS is past 1.0 and
Apache-2.0, but eight advisories in one batch on 2026-10-18 including an Object
Lock COMPLIANCE bypass, an S3 policy bypass over its alternate protocol
listeners, a critical path traversal, and a hardcoded privileged token before
Alpha.78, plus a conditional PUT that Cormack reports as not concurrency safe
after the distributed lock was removed for performance. Its documented target is
16 machines of NVMe behind 100 GbE, which is not the operator's fleet. Revisit in
a year, not now.

**R2. Make SeaweedFS the primary storage engine, with Garage as the multi-site
option if the license question is resolved.**
SeaweedFS is Apache-2.0, one binary, one command to a working S3 endpoint on one
node, 35,799 stars, a release roughly weekly, Object Lock and versioning
present, 1.02x disk efficiency on random data, 247 MB idle, and 431 ops/s on
sequential 5 KB uploads against MinIO's 113 on the same host. It is the only
candidate that is simultaneously small-footprint, single-node capable,
Apache-2.0, and WORM-capable. The loopback-by-default binding of `weed mini`'s
admin surface is a security default worth preserving rather than working around.

**R3. Treat the AGPL question as a decision the operator has to make before
Garage can be used, and do not paper over it.**
Garage is the best-engineered answer to "S3 on a handful of own machines across
sites behind consumer links": 1 GB RAM, any x86_64 from the last decade, no
consensus bottleneck, CRDT metadata, tolerance for nodes that change IP, a
published OpenAPI admin API, Prometheus metrics, and Nomad and Consul discovery.
But it is AGPL-3.0, it has no versioning and no Object Lock, and it is eventually
consistent with conditional PUT deliberately unsupported. If the operator intends
to offer storage to users as a service, Garage engages the AGPL network clause.
If he does not, or if legal sign-off is obtained, Garage becomes the better
architectural fit than SeaweedFS for a genuinely geo-distributed fleet. This is
one question with a binary answer, and it changes the recommendation.

**R4. Design the storage path around Cloudflare's 100 MB request body limit from
the first commit, not as a later fix.**
A tunnel-origin S3 endpoint cannot take a single-request PUT above the zone's
plan limit, and there is no DNS-only escape for a tunnel. Concretely: force
multipart with a part size well under the limit, prefer presigned URLs that let
the client write directly to the origin it can reach, and keep large CI artifact
and container-image pushes off the Cloudflare-proxied path. Anything that must
traverse a Worker is separately bounded by the Workers request body limit, with
only Enterprise able to raise the zone's Maximum Upload Size to 5 GB.

**R5. Use Valkey for cache and queues. Do not use Dragonfly, KeyDB or Redict.**
Valkey is BSD-3-Clause, forked from Redis before the source-available switch,
27,558 stars, and shipping 9.1.3 in the last week. Dragonfly is BSL 1.1 with an
Additional Use Grant that explicitly forbids offering the work as a service that
competes with DragonflyDB, which is precisely the product being built. KeyDB's
last release is v6.3.4 from 2023-10-30 and its last master commit is from
2024-03. Redict lives on Codeberg, is LGPL-3.0-only, and was last updated
2025-10-10.

**R6. Use rqlite for control-plane state that needs HA, and Litestream for the
SQLite backup path.**
rqlite is MIT, one binary, Raft, plain HTTP and JSON, hot backups and automated
S3 backups, and change data capture. Its own docs are explicit that it is not for
write-scaling because every write goes through the Raft log, which is the right
trade for control-plane metadata and the wrong one for telemetry. Litestream is
Apache-2.0 and replicates SQLite incrementally to a file or S3 using only the
SQLite API, which composes directly with whatever object store is chosen. LiteFS
needs FUSE and SYS_ADMIN, which is a poor fit for a container fleet and a
non-starter on most managed container platforms.

**R7. Do not put Ceph or Zenko on the critical path.**
Ceph RGW has the best S3 feature coverage and a decade of production history, but
it needs three nodes minimum, placement-group expertise, and it carries 1,830
open issues. Zenko needs MongoDB plus Redis and is a data controller over storage
that lives elsewhere, not storage. If a plain S3 endpoint on a POSIX filesystem
is ever needed, `versity/versitygw` (Apache-2.0, v1.10.0, 3,079 stars, monthly
releases) is a far cheaper way to get it than the Zenko stack.

**R8. Keep Silo on the shelf as a named migration bridge only.**
If any existing MinIO data has to move, `pgsty/silo` runs the same code under
AGPL-3.0, restores the console, ships packages and images, and is releasing
weekly. But a cluster cannot mix MinIO and Silo nodes, so it is an all-at-once
move, and it inherits MinIO's AGPL. Put a date on it, not a home.

**R9. Price the replacement against Class A operations, not against gigabytes.**
R2 charges $0.015/GB-month for standard storage but $4.50 per million Class A
operations, which is 12.5x the Class B rate. For a self-hosted alternative the
honest pitch is operation-count relief plus free egress, not raw storage
cheapness, because a self-hosted box still costs power, disks and attention.
The 10 GB-month free tier also means the smallest tenants pay nothing on R2,
which bounds how cheap the alternative has to be to win them.

---

## 4. Not covered / open questions

**O1. Garage's license position is unresolved and it gates R3.** Whether the
operator intends to offer storage to third parties as a service is a business
fact I do not have. If yes, AGPL-3.0 rules out Garage and Silo and SeaweedFS
becomes the only real candidate. Needs a decision, not more research.

**O2. Garage's own S3 compatibility page is stale.** The page I read is live
today but its update history ends at 2022-05-25. The claims that versioning and
Object Lock are missing are corroborated by two independent 2026 sources, but
the rest of the table, including the presigned URL and multipart rows, has not
been maintained by the project. A direct test against Garage v2.5.0 would settle
it. Not done here.

**O3. No first-party resource measurements for RustFS, Silo, Versity GW or
Zenko.** The only same-host numbers I have are from one operator's benchmark on
r/selfhosted covering MinIO, SeaweedFS and Garage. That author also discloses
that the benchmark scripts were AI-generated. SeaweedFS's filer memory
regression (issue #9035) is from a maintainer discussion, not a controlled
measurement. Any footprint number quoted to the operator beyond the ones sourced
above needs a run on his actual hardware.

**O4. Whether the operator's fleet can satisfy Garage's network requirement is
unverified.** Garage documents 200 ms or less and 50 Mbps or more between nodes.
Whether the machines behind the tunnels meet that is a property of his network,
which I cannot see from here.

**O5. SeaweedFS's enterprise boundary needs mapping against the actual feature
list.** The README puts data recovery, self-healing storage, customizable
erasure coding, EC vacuum and repair in the paid edition. Which of those the
operator's use cases need is a product question I cannot answer. If custom EC
layouts are needed, SeaweedFS's community edition is not sufficient.

**O6. No measurement of S3 request throughput through a Cloudflare Tunnel.** The
100 MB body limit is documented, but latency and throughput overhead of the
tunnel path for many-small-object workloads, which is what SeaweedFS is best at
(431 ops/s locally), is unmeasured. This is the number that decides whether
storage should sit behind the tunnel at all or on a direct WireGuard path.

**O7. Conditional PUT support across the shortlist is not fully mapped.** I have
Cormack's statement that Garage deliberately does not support it because it is
eventually consistent, and his report that RustFS's implementation is not
concurrency safe. Whether SeaweedFS and Ceph RGW provide it correctly, which
matters if Iceberg or Delta Lake tables ever land on this store, is unverified.

**O8. KeyDB and Redict release data was not captured.** I confirmed KeyDB's last
release is v6.3.4 (2023-10-30) and Redict's Codeberg repo was last updated
2025-10-10, but I did not capture a Redict version number. Both are excluded on
liveness grounds regardless, so this does not change any recommendation.

**O9. LiteFS and Litestream release tags were not captured.** I verified both are
actively pushed (2026-10-28) and Apache-2.0, but did not record their latest
version. Not needed for the recommendation, which rests on Litestream's
architecture and LiteFS's FUSE requirement.

**O10. No survey of container-registry-specific S3 backends.** The spec mentions
CI, and container image storage is the largest object workload a CI system
produces. Whether the chosen store works as a registry backend, and how it
handles the blob-chunk access pattern, was not tested. That belongs with B6.
