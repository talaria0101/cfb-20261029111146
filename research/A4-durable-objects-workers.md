# A4: Durable Objects and Workers

Research subagent A4-durable-objects-workers.
All sources read on 2026-10-29 (UTC). Every number below came from a call made on
that date. Where a figure could not be checked it is marked `unverified`.

Gateway used: pkgforge `search.web.pkgforge.dev` and `read.web.pkgforge.dev`
(pinned to provider `tinyfish`), plus `gh api` for GitHub metadata. No fallback
to built-in web_search/web_fetch was needed; every call succeeded on the first
attempt.

---

## 1. Findings

### 1.1 A Durable Object is an actor with a private embedded SQLite database

Claim: a DO is a special Worker class with a globally unique name, its own
durable storage colocated in the same thread as the code, single-threaded and
cooperatively multitasked. Storage and compute live in the same thread, so
SQLite runs as a library call with no context switch, and reads/writes through
`ctx.storage.sql.exec()` are synchronous.

Evidence:
- https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/
  (page states "Last updated Jul 15, 2026", fetched 2026-10-29T11:24:34Z)
- https://blog.cloudflare.com/sqlite-in-durable-objects/
  ("Zero-latency SQLite storage in every Durable Object", 2024-09-26,
  fetched 2026-10-29T11:30:46Z)
- https://developers.cloudflare.com/changelog/post/2025-04-07-sqlite-in-durable-objects-ga/
  (GA announced 2025-04-07 with 10 GB per object, fetched 2026-10-29T11:30:44Z)

Label: [verified]

Note for the spec: the blog post describes the output gate. Writes return
immediately, but the response to the client is held until the write is durable.
This is why DO code does not need to `await` a `put()`. Any self-hosted re-
implementation has to reproduce this or the correctness story collapses.

### 1.2 Input gates and output gates make naive DO code correct by default

Claim: while a storage operation is executing, no events are delivered to the
object except storage completion events (input gate). Responses are held until
all writes they can reveal are durable (output gate). This is why
`get()` then `put()` of a counter is safe without an explicit transaction.

Evidence: https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/
(2021-08-03, fetched 2026-10-29T11:27:29Z), which states the input gate rule
verbatim and works through the interleaving example.

Label: [verified]

### 1.3 SQLite-backed DO limits (Workers Paid vs Free)

| Feature | Limit |
| --- | --- |
| Number of objects per account or per class | Unlimited |
| Max DO classes per account | 500 (Paid) / 100 (Free) |
| Storage per account | Unlimited (Paid) / 5 GB (Free) |
| Storage per class | Unlimited |
| Storage per DO | 10 GB |
| Key + value combined size | 2 MB |
| WebSocket message size (received only) | 32 MiB |
| CPU per request | 30 s default, configurable to 5 min via `limits.cpu_ms` |
| Simultaneous outgoing connections per request | 6 |

Evidence: https://developers.cloudflare.com/durable-objects/platform/limits/
("Last updated Jun 1, 2026", fetched 2026-10-29T11:22:09Z). Same page FAQ states
the per-DO limit is 10 GB on Paid and 1 GB on Free, and that exceeding it fails
writes with `SQLITE_FULL` while reads and deletes still succeed.

Label: [verified]

Docs inconsistency worth flagging: the general limits table carries footnote 3 on
the 10 GB row whose text reads "Accounts on the Workers Free plan are limited to
5 GB total Durable Objects storage", which does not explain the 10 GB figure.
The FAQ text and the 2025-04-07 changelog both give 10 GB, so 10 GB is the
number to use.

### 1.4 SQL storage limits inside a DO

| Limit | Value |
| --- | --- |
| Max columns per table | 100 |
| Max rows per table | Unlimited (bounded by per-object storage) |
| Max string, BLOB or row size | 2 MB |
| Max SQL statement length | 100 KB |
| Max bound parameters per query | 100 |
| Max arguments per SQL function | 32 |
| Max bytes in a LIKE or GLOB pattern | 50 |

Evidence: same limits page, "SQL storage limits" section, fetched 2026-10-29.

Label: [verified]

### 1.5 Key-value backed DO limits (Paid only)

Storage per account 50 GB (raisable by request), storage per object unlimited,
key size 2 KiB, value size 128 KiB, WebSocket message 32 MiB, CPU per request
30 s, 6 simultaneous outgoing connections. KV-backed DOs cannot use the SQL API
or point-in-time recovery.

Evidence: same limits page, and
https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
("Last updated Sep 21, 2026", fetched 2026-10-29T11:26:28Z), whose method matrix
shows SQL API and PITR API are SQLite-only.

Label: [verified]

### 1.6 A single DO is capped at roughly 1,000 requests per second (soft)

Claim: an individual object has a soft limit of 1,000 requests per second. An
object that receives too many requests queues them and then returns an
overloaded error to the caller. Objects scale out horizontally instead.

Evidence: limits page FAQ "How much work can a single Durable Object do?",
fetched 2026-10-29.

Label: [verified]

This is the single most important number for anyone porting a relational design
onto DOs. Anything that must be a single serialization point becomes a
bottleneck at 1,000 rps.

### 1.7 Durable Objects pricing (Workers Paid)

Compute:
- Requests: 1 million/month included, then $0.15 per million. Requests include
  HTTP requests, RPC sessions, WebSocket messages and alarm invocations.
- Duration: 400,000 GB-s/month included, then $12.50 per million GB-s.

Storage, SQLite backend (Paid):
- Rows read: first 25 billion/month included, then $0.001 per million rows.
- Rows written: first 50 million/month included, then $1.00 per million rows.
- SQL stored data: 5 GB-month included, then $0.20 per GB-month.

Storage, key-value backend (Paid):
- Read request units 1 million then $0.20/million, write request units 1 million
  then $1.00/million, delete requests 1 million then $1.00/million, stored data
  1 GB then $0.20/GB-month. A request unit is 4 KB.

Evidence: https://developers.cloudflare.com/durable-objects/platform/pricing/
("Last updated Oct 18, 2026", fetched 2026-10-29T11:22:18Z). The same table is
reproduced on https://developers.cloudflare.com/workers/platform/pricing/
("Last updated Oct 2, 2026", fetched 2026-10-29T11:22:33Z).

Label: [verified]

Billing mechanics that matter for cost modelling:
- Each RPC method call on a stub is its own RPC session and therefore its own
  billed request. Subsequent calls on a stub returned by that call are part of
  the same session and are not billed again.
- A WebSocket connection creation is billed as one request. Outgoing messages
  and incoming protocol pings are free. Incoming messages are billed at a 20:1
  ratio for billing only; metrics still show actual counts.
- Duration is billed against 128 MB of memory per object regardless of actual
  usage. Objects that share an isolate still bill as if each had a full 128 MB.
- Billable usage is rounded up to the next billable unit before the rate is
  applied. 500,000 GB-s bills as 1,000,000 GB-s.
- Each `setAlarm()` is billed as one row written. Deletes count as rows written.
- `deleteAll()` is the only thing that removes internal metadata rows.
- Minimum $5/month Workers Paid plan charge applies on top.

Worked example from the docs (Example 2, 100 DOs, 50 WebSockets each, one
message per minute, 8 active hours a day): 150,000 connection requests plus
72 million messages billed at 20:1 gives 3.75 million billing requests and
$137.50 of duration, for a $142.95 month. Example 3, 100 DOs with one WebSocket
each receiving one message per second all month: $412.50 duration, $419.30
total. Example 4, the same load but with hibernation and 10 ms handlers:
$12.50 duration, $20.65 total. Hibernation is a 20x cost difference on the same
message volume.

Label: [verified]

### 1.8 Alarms: one per object, at-least-once, exponential backoff

Claim: each DO can schedule a single alarm at a time via `setAlarm(ms)`.
`getAlarm()` returns the epoch-ms timestamp or null. `deleteAlarm()` unsets it.
The `alarm(alarmInfo)` handler receives `{ retryCount, isRetry }`. Alarms have
guaranteed at-least-once execution and are retried automatically on an uncaught
exception, with exponential backoff starting at 2 seconds and up to 6 retries.
Retries apply only to the most recent `setAlarm()` call. Only one `alarm()`
instance runs at a time per object. To schedule many events, store the schedule
in storage and have the handler reschedule itself for the next due item.

Evidence: https://developers.cloudflare.com/durable-objects/api/alarms/
("Last updated Apr 21, 2026", fetched 2026-10-29T11:23:01Z).

Label: [verified]

Alarm handler wall time is 15 minutes (see 1.11).

### 1.9 WebSocket hibernation is the main cost lever

Claim: the Hibernation WebSocket API lets a DO be evicted from memory while
WebSocket clients stay connected to the Cloudflare network. Billable duration
does not accrue during hibernation. In-memory state is reset, so per-connection
state must go through `serializeAttachment()` / `deserializeAttachment()`. The
runtime re-runs the constructor on wake, so constructor work must be minimal.

Evidence: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
(fetched 2026-10-29T11:23:04Z) and
https://developers.cloudflare.com/durable-objects/api/state/
("Last updated Sep 30, 2026", fetched 2026-10-29T11:27:34Z).

Additional API facts from the state page, all [verified]:
- `acceptWebSocket(ws, tags?)` takes up to 10 tags, each max 256 characters.
- Maximum 32,768 WebSocket connections per Durable Object via the hibernation
  API. CPU and memory will usually be the real limit first.
- `getWebSockets(tag?)` returns the attached set.
- `setWebSocketAutoResponse({request, response})` replies without waking the
  object and without incurring duration charges. Both strings max 2,048
  characters.
- Automatic protocol ping/pong: incoming ping frames get automatic pong
  responses and this does not interrupt hibernation.
- `blockConcurrencyWhile(cb)` blocks all other events until the callback
  resolves, with a 30 second timeout after which the object is reset. If the
  callback throws, the object is terminated and reset.
- `web_socket_auto_reply_to_close` (compat date >= 2026-04-07) makes the runtime
  auto-reply to Close frames; calling `close()` is safe but no longer required.
- Batching guidance: each WebSocket message has per-message overhead from
  JS-runtime context switches, so batch many small logical messages into one
  frame.

Hibernation preconditions (from 1.10): no `setTimeout`/`setInterval` callbacks,
no unfinished I/O or `waitUntil()` promise, no open outbound connection, no
WebSocket Standard API use, no request still being processed.

### 1.10 DO lifecycle: 10 seconds to hibernate, 70 to 140 seconds to evict

Claim: states are active-in-memory, idle-in-memory-non-hibernateable,
idle-in-memory-hibernateable, hibernated, inactive. After 10 seconds of no
incoming request or event with all hibernation conditions met, the object
hibernates. In the non-hibernateable idle state, after 70 to 140 seconds of
inactivity it is evicted entirely. On any wake the constructor runs again.

There are no shutdown hooks. In-flight HTTP and RPC requests may finish if they
do not touch storage; if they touch storage they are stopped immediately with an
error to preserve global uniqueness. WebSocket connections are terminated
automatically during shutdown. During a runtime update, in-flight requests get
up to 30 seconds.

Evidence: https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
("Last updated Oct 15, 2026", fetched 2026-10-29T11:26:40Z).

Label: [verified]

Design consequence: write state incrementally. Do not rely on a shutdown hook.
Any port of this to own metal needs the same discipline.

### 1.11 Wall time limits by invocation type

| Invocation type | Wall time limit |
| --- | --- |
| Incoming HTTP request | Unlimited while the client stays connected |
| Durable Objects (RPC / HTTP) | Unlimited while the caller stays connected |
| Durable Object alarm handlers | 15 minutes |
| Queue consumers | 15 minutes |
| Cron Triggers | 15 minutes |
| Workflows (per step) | Unlimited wall time |

`waitUntil()` extends execution for up to 30 seconds after the response or
disconnect. `ctx.waitUntil()` on a DO behaves the same.

Evidence: DO limits page "Wall time limits by invocation type", fetched
2026-10-29; corroborated on
https://developers.cloudflare.com/queues/platform/limits/ ("Last updated Apr 21,
2026", fetched 2026-10-29T11:23:20Z) and
https://developers.cloudflare.com/workers/platform/limits/ ("Last updated Oct 12,
2026", fetched 2026-10-29T11:22:25Z).

Label: [verified]

### 1.12 Durable Objects exist in only a minority of Cloudflare PoPs

Claim: as of 2026-10-29, DOs were available in 10.76 percent of Cloudflare points
of presence, and the tracker reported 606,273 objects created and destroyed in
the preceding hour.

Evidence: https://where.durableobjects.live/ (fetched 2026-10-29T11:27:46Z).
Source code is on GitHub and the page is maintained by Alastair, originally by
Jed Schmidt.

Label: [verified]

This is live data that moves. It is a snapshot, not a fixed limit. It matters
because a DO is created near its first requester, so DO-backed state is
geographically pinned to a subset of the network. The
`newUniqueId({ jurisdiction })` placement hint exists for this reason.

### 1.13 Each individual D1 database is backed by a single Durable Object

Claim: "Each individual D1 database is backed by a single Durable Object." D1 is
designed to scale out across many 10 GB databases rather than up. A single D1
database is inherently single-threaded and processes queries one at a time. At 1
ms average query time the ceiling is about 1,000 queries per second; at 100 ms it
is about 10 per second.

D1 limits: 50,000 databases per account (Paid) / 10 (Free), 10 GB max database
size (Paid) / 500 MB (Free), 1 TB max storage per account (Paid) / 5 GB (Free),
30 days Time Travel (Paid) / 7 days (Free), 10 restores per 10 minutes per
database, 1,000 queries per Worker invocation (Paid) / 50 (Free), 30 s max SQL
query duration, 5 GB max `d1 execute` import, approximately 5,000 bindings per
Worker script.

Evidence: https://developers.cloudflare.com/d1/platform/limits/ ("Last updated
Oct 24, 2026", fetched 2026-10-29T11:26:55Z).

Label: [verified]

This is the architectural link between the DO and database stories. A self-
hosted D1 replacement is a DO replacement with extra steps.

### 1.14 Workers limits (account plan)

| Feature | Free | Paid |
| --- | --- | --- |
| Requests | 100,000/day | No limit |
| CPU time per invocation | 10 ms | 5 min (default 30 s) |
| Memory per isolate | 128 MB | 128 MB |
| Subrequests per invocation | 50 | 10,000 (up to 10M) |
| Subrequests to internal services | 1,000 | matches configured limit |
| Simultaneous outgoing connections | 6 | 6 |
| Environment variables | 64 | 128 |
| Environment variable size | 5 KB | 5 KB |
| Worker size (uncompressed) | 64 MiB | 64 MiB |
| Worker startup time | 1 s | 1 s |
| Number of Workers | 100 | 500 |
| Cron Triggers per account | 5 | 250 |
| Static asset files per version | 20,000 | 100,000 |
| Individual static asset size | 25 MiB | 25 MiB |

Request/response: URL 16 KB, request headers 128 KB total, response headers
128 KB total, response body no enforced limit. Request body size is set by the
Cloudflare zone plan, not the Workers plan: 100 MB Free/Pro, 200 MB Business, up
to 5 GB Enterprise self-serve.

CPU time counts only active execution, not waiting on fetch, KV or a database.
Exceeding it returns Error 1102 "Worker exceeded resource limits" and an
invocation outcome of `exceededCpu`. Exceeding memory returns the same error
code with outcome `exceededMemory`. Free plan daily request exhaustion returns
Error 1027, whose behavior depends on the route's fail-open or fail-closed mode.

Runtime updates: processes on the old runtime get up to 20 minutes to drain.

Evidence: https://developers.cloudflare.com/workers/platform/limits/ ("Last
updated Oct 12, 2026", fetched 2026-10-29T11:22:25Z).

Label: [verified]

The six simultaneous outgoing connections limit counts connections waiting for
response headers. It covers fetch, KV get/put/list/delete, Cache put/match/
delete, R2 list/get/put/delete/head, Queues send/sendBatch, `connect()` TCP
sockets and outbound WebSockets. Once headers arrive the connection stops
counting. A seventh attempt is queued, not failed.

### 1.15 Workers pricing (Standard usage model)

| | Requests | Duration | CPU time |
| --- | --- | --- | --- |
| Free | 100,000/day | no charge | 10 ms per invocation |
| Standard | 10 million/month included, then $0.30/million | no charge or limit | 30 million CPU-ms/month included, then $0.02/million CPU-ms, max 5 min per invocation |

There are no egress or bandwidth charges. Minimum $5/month for Workers Paid.

Workers Logs: Paid 20 million events/month included then $0.60/million, 7 day
retention; Free 200,000/day, 3 day retention. Workers Trace Events Logpush:
Paid only, 10 million requests/month then $0.05/million.

Static asset requests are free and unlimited. Cache hits count as requests at
the same rate but consume no CPU. Subrequests are not billed.

Docs worked examples, all [verified] from the pricing page:
- 15 million requests at 7 ms average CPU: $5 + $1.50 + $1.50 = $8.00.
- Same with 80 percent static assets: $5.00.
- Hourly Cron with 3 minutes CPU per run: $6.99.
- 100 million requests at 7 ms: $45.40.
- Same with 80 percent cache hit rate: $34.20.

Legacy usage models Workers Unbound and Workers Bundled still exist on some
accounts; the docs advise moving to Standard. Changing usage model affects
billing only, with no technical implication.

Evidence: https://developers.cloudflare.com/workers/platform/pricing/ ("Last
updated Oct 2, 2026", fetched 2026-10-29T11:22:33Z).

Label: [verified]

### 1.16 Workers for Platforms is the multi-tenant sandbox product

Claim: Workers for Platforms runs untrusted customer code in per-customer
isolated Workers. Four components: dispatch namespace, dynamic dispatch Worker,
user Workers, optional outbound Worker. A dispatch namespace holds an unlimited
number of scripts with no per-account script limit. User Workers run in
untrusted mode: they never share a cache even on the same zone and cannot read
`request.cf`.

Features: custom per-customer CPU and subrequest limits, observability export to
Datadog/Splunk/Grafana, up to 8 tags per script.

Limits page specifics: unlimited scripts, `caches.default` disabled for
namespaced scripts, no limit on DO namespaces, Gradual Deployments not supported
for user Workers (a new version deploys to 100 percent of traffic at once), API
rate limits of 1,200 per 5 minutes per account token, 200/second per IP, GraphQL
max 320 per 5 min, 50 user API tokens per user, 500 account API tokens per
account.

Trusted mode for a namespace unlocks `request.cf` and shared zone caches, and
should only be enabled when you control all code in the namespace.

Evidence: https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/
("Last updated Oct 15, 2026"), .../how-workers-for-platforms-works/ ("Last
updated Apr 21, 2026"), .../configuration/dynamic-dispatch/ ("Last updated Sep
16, 2026"), .../reference/limits/ (redirected from .../platform/limits/, "Last
updated Oct 13, 2026"). All fetched 2026-10-29 between 11:23:11Z and 11:24:07Z.

Label: [verified]

Dispatch mechanics from the dynamic dispatch page: the binding is
`dispatch_namespaces` with `binding` and `namespace`. `env.DISPATCHER.get(name)`
returns a user Worker. A second argument `{ props }` passes per-request values
visible to user code via `ctx.props` (or `this.ctx.props` in a
`WorkerEntrypoint`). To hide data from user code, export a `WorkerEntrypoint`
class from the dispatch Worker and pass an RPC stub through `ctx.exports`; the
user Worker calls methods on the stub while the underlying credentials stay in
the dispatch Worker.

API surface, all [verified] from
https://developers.cloudflare.com/api/resources/workers_for_platforms/
(fetched 2026-10-29T11:28:16Z):
- `GET /accounts/{account_id}/workers/dispatch/namespaces`
- `GET /accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}`
- `POST /accounts/{account_id}/workers/dispatch/namespaces`
- `DELETE /accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}`
- `GET /accounts/{account_id}/workers/dispatch/namespaces/{ns}/scripts/{script_name}`
- `PUT /accounts/{account_id}/workers/dispatch/namespaces/{ns}/scripts/{script_name}`
- `DELETE /accounts/{account_id}/workers/dispatch/namespaces/{ns}/scripts/{script_name}`

The Script model carries `exports`, a declarative map that includes Durable
Object classes with their `storage` backend. Live entries auto-provision the
namespace on first deploy; tombstoned lifecycle entries are omitted from
responses.

### 1.17 Queues: push consumers, pull consumers, and the HTTP pull API

Limits: 10,000 queues per account, 128 KB message size, 100 retries, max
consumer batch size 100 messages, max 100 messages or 256 KB per `sendBatch`,
max batch wait 60 seconds, 5,000 messages per second per queue, backlog 25 GB
per queue, 250 concurrent push consumer invocations, consumer wall time 15
minutes, consumer CPU configurable to 5 minutes, `visibilityTimeout` 12 hours
for pull queues, `delaySeconds` 24 hours.

Pricing: an operation is counted per 64 KB written, read or deleted. Free
10,000 operations/day, Paid 1,000,000/month included then $0.40/million.
Message retention 24 hours non-configurable on Free, 4 days default and up to 14
days on Paid. No egress charges. Delivering one message typically costs 3
operations (1 write, 1 read, 1 delete). Each retry costs a read. Messages that
expire unread cost a write and a delete.

Evidence: https://developers.cloudflare.com/queues/platform/limits/ and
https://developers.cloudflare.com/queues/platform/pricing/ content on
https://developers.cloudflare.com/workers/platform/pricing/. Limits page fetched
2026-10-29T11:23:20Z, pricing fetched 2026-10-29T11:22:33Z.

Label: [verified]

Pull consumers are the piece that connects the Cloudflare control plane to
self-hosted workers. A pull consumer lets any environment or language pull from
a queue over HTTP. Enabling HTTP pull is done with
`wrangler queues consumer http add $QUEUE_NAME` and is no longer supported from
a Wrangler config file. Authentication is an API token with both
`com.cloudflare.api.account.queues_read` and
`com.cloudflare.api.account.queues_write` (write is required because
acknowledging mutates queue state), presented as a Bearer token.

Pull endpoint: `POST https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/queues/${QUEUE_ID}/messages/pull`
with body `{ "visibility_timeout_ms": 60000, "batch_size": 50 }`. The response
carries `message_backlog_count` and a `messages` array with `body`, `id`,
`timestamp_ms`, `attempts`, `metadata` and a `lease_id`. Multiple concurrent
pull consumers may run against one queue.

Evidence: https://developers.cloudflare.com/queues/configuration/pull-consumers/
("Last updated Jul 1, 2026", fetched 2026-10-29T11:28:52Z).

Label: [verified]

### 1.18 Hyperdrive: connection pooling and query caching for existing Postgres/MySQL

Hyperdrive connects a Worker to any Postgres or MySQL database, including
Postgres-compatible ones such as CockroachDB and Timescale, using existing
drivers and ORMs. It works with the `pg` and `mysql2` clients. Query caching is
on by default.

Limits: max 10 configured databases (Free) / 25 (Paid) per account, username and
database name 63 bytes, initial connection timeout 15 seconds, idle connection
timeout 10 minutes, about 20 origin connections per configuration (Free) / about
100 (Paid), max query duration 60 seconds, max cached query response size 50 MB.

Pricing: database queries unlimited on Paid, 100,000/day on Free. A query is any
statement including DDL.

Evidence: https://developers.cloudflare.com/hyperdrive/ ("Last updated Oct 21,
2026", fetched 2026-10-29T11:23:31Z) and
https://developers.cloudflare.com/hyperdrive/platform/limits/ ("Last updated Jun
9, 2026", fetched 2026-10-29T11:23:45Z), plus the pricing table on
https://developers.cloudflare.com/workers/platform/pricing/.

Label: [verified]

The origin connection cap is the constraint for a self-hosted Postgres behind a
tunnel: about 100 connections per Hyperdrive configuration on Paid. Cloudflare
notes it does not limit concurrent client connections from Workers, only
connections to the origin.

### 1.19 Workers KV limits and pricing

KV: 100,000 reads/day Free, unlimited Paid. Writes to different keys 1,000/day
Free, unlimited Paid. Writes to the same key 1/second on both plans. 1,000
operations per Worker invocation on both plans. 1,000 namespaces per account,
1 GB storage per namespace Free / unlimited Paid, key size 512 bytes, key
metadata 1,024 bytes, value size 25 MiB, minimum cacheTtl 30 seconds.

KV pricing: keys read 10 million/month then $0.50/million, keys written 1
million then $5.00/million, keys deleted 1 million then $5.00/million, list
requests 1 million then $5.00/million, stored data 1 GB then $0.50/GB-month.

Workers KV Instant (a separate product): 1 write/second per namespace, 1 MB
storage, 10,000 keys, 300 byte keys, no metadata, no list pagination.

Evidence: https://developers.cloudflare.com/kv/platform/limits/ ("Last updated
Oct 8, 2026", fetched 2026-10-29T11:26:51Z) and the pricing table on
https://developers.cloudflare.com/workers/platform/pricing/.

Label: [verified]

KV is eventually consistent and is the wrong primitive for coordination. DO
SQLite is the strongly consistent one. Note the 1 write per second to the same
key limit, which makes KV unusable as a counter.

### 1.20 R2 basics and pricing

R2 is S3-compatible object storage with no egress fees. Limits: unlimited data
per bucket, unlimited objects per bucket, 1,000,000 buckets per account, 50
bucket management operations per second per bucket, 100 custom domains per
bucket, 1,024 byte object keys, 8,192 bytes object metadata, 5 TiB per object,
5 GiB single-part upload / 4.995 TiB multipart, 10,000 upload parts, 1
concurrent write per second to the same object key (higher rates get HTTP 429).
The Cloudflare REST API is limited to 1,200 requests per 5 minutes across all R2
REST operations on an account, so use the S3 API or Workers API for throughput.

Pricing: Standard storage $0.015/GB-month, Infrequent Access $0.01/GB-month.
Class A operations $4.50/million (Standard) or $9.00/million (IA). Class B
operations $0.36/million (Standard) or $0.90/million (IA). IA data retrieval
$0.01/GB. Egress free. Free tier 10 GB-month, 1 million Class A, 10 million
Class B per month. DeleteObject, DeleteBucket and AbortMultipartUpload are
free. IA has a 30 day minimum storage duration. `r2.dev` subdomains are rate
limited and not for production.

Class A operations are ListBuckets, PutBucket, ListObjects, PutObject,
CopyObject, CompleteMultipartUpload, CreateMultipartUpload,
LifecycleStorageTierTransition, ListMultipartUploads, UploadPart,
UploadPartCopy, ListParts, PutBucketEncryption, PutBucketCors,
PutBucketLifecycleConfiguration. Class B are HeadBucket, HeadObject, GetObject,
UsageSummary, GetBucketEncryption, GetBucketLocation, GetBucketCors,
GetBucketLifecycleConfiguration.

Evidence: https://developers.cloudflare.com/r2/pricing/ ("Last updated Oct 26,
2026", fetched 2026-10-29T11:27:09Z) and
https://developers.cloudflare.com/r2/platform/limits/ ("Last updated Jun 8,
2026", fetched 2026-10-29T11:26:48Z).

Label: [verified]

### 1.21 workerd is Apache-2.0 and is the open-source Workers runtime

GitHub metadata for `cloudflare/workerd`, read 2026-10-29 via `gh api`:

| Field | Value |
| --- | --- |
| full_name | cloudflare/workerd |
| description | The JavaScript / Wasm runtime that powers Cloudflare Workers |
| stargazers_count | 9093 |
| license | Apache-2.0 |
| pushed_at | 2026-10-29T11:10:53Z |
| language | C++ |
| open_issues_count | 827 |
| size | 75136 (KB) |
| created_at | 2022-09-15T15:15:16Z |
| forks_count | 810 |
| subscribers_count | 70 |

Latest release: v1.20261029.1, published 2026-10-29T00:53:29Z. Release cadence
is daily; the five most recent are v1.20261024.1 through v1.20261029.1. The npm
package `workerd` has dist-tag `latest` at 1.20261029.1, verified by reading the
npm registry on 2026-10-29.

workerd is configured in Cap'n Proto text format. `workerd serve wrangler.jsonc`
also accepts a Wrangler config, supporting only `name`, `main`,
`compatibility_date`, `compatibility_flags`, `vars`, `durable_objects`,
`migrations`, `no_bundle` and `$schema`. Prebuilt binaries come from npm and
need glibc 2.35+ on Linux, macOS 13.5+ on macOS, and an x86-64 CPU with SSE4.2
and CLMUL or an arm64 CPU with CRC.

The README carries an explicit security warning, quoted verbatim: "workerd is
not a hardened sandbox". workerd tries to isolate each Worker to its configured
resources but does not contain suitable defense-in-depth against implementation
bugs, so possibly-malicious code must run inside an appropriate secure sandbox
such as a virtual machine. Cloudflare's hosting service adds many more layers.

Evidence: `gh api repos/cloudflare/workerd` for the metadata, and
`gh api repos/cloudflare/workerd/contents/README.md` for the runtime description,
platform support, build instructions, config format and security warning, all on
2026-10-29. Repo: cloudflare/workerd.

Label: [verified]

### 1.22 FINDING: open-source workerd has real SQLite-backed Durable Objects on local disk

Claim: workerd's `durableObjectStorage` union has three members: `none` (the
default, meaning the worker has no Durable Objects), `inMemory`, and `localDisk`.
`localDisk` stores Durable Object data as SQLite
files on a local disk directory exposed as a `DiskDirectory` service. For each
DO class a subdirectory is created using `uniqueKey` as the name, and within it
one or more files per object named `<id>.<ext>`, currently a `.sqlite` file plus
optional `.sqlite-wal` and `.sqlite-shm`.

`localDisk` is marked in the schema as "** EXPERIMENTAL; SUBJECT TO
BACKWARDS-INCOMPATIBLE CHANGE **".

The DO storage interface in open-source workerd (`src/workerd/api/actor-state.h`)
exposes `getSql()`, `getKv()`, `transaction()`, `transactionSync()`, `getAlarm()`,
`setAlarm()`, and a snapshot API. `src/workerd/api/sql.c++` implements
`SqlStorage`. The DO SQL interface stopped requiring the `experimental`
compatibility flag on 2024-09-05 (commit message "Allow SQL interface to be
enabled without \"experimental\" compat flag."). SQLite-backed DO storage was
added on 2023-02-17 (commit "Allow `workerd` to be configured to use SQLite for
DO storage.").

An `alarm-scheduler.c++` exists in `src/workerd/server/`, with
`RETRY_START_SECONDS` and `RETRY_MAX_TRIES` constants matching the documented
alarm retry behavior, so alarms are implemented in the open-source server.

Evidence: `gh api repos/cloudflare/workerd/contents/src/workerd/server/workerd.capnp`
(1,276 lines, read 2026-10-29), lines 852 to 879 for the `durableObjectStorage`
union, lines 1056 onward for `DiskDirectory`, and lines 763 to 777 for
`ephemeralLocal` DO namespaces. `gh api repos/cloudflare/workerd/contents/src/workerd/api/actor-state.h`
read 2026-10-29. Commit history via
`gh api "repos/cloudflare/workerd/commits?path=src/workerd/server/workerd.capnp&per_page=100"`.

Label: [verified]

IMPORTANT: the sample config
`samples/durable-objects-chat/config.capnp` contains a comment stating "As of
this writing, `workerd` supports in-memory-only Durable Objects". That comment
is stale. Its last commit is 2023-03-07T11:16:31Z (sha a6b21624208b235898cc970241e0ff8e5d80b952,
"Update compat date in samples, add flags to README"), which predates the
cluster work by three and a half years. Trust the capnp schema and the commit
history, not that comment.

Also relevant: `preventEviction` is a per-worker flag. By default DOs are evicted
after 10 seconds of inactivity and expire 70 seconds after all clients
disconnect; setting `preventEviction` pins them to memory forever.

### 1.23 FINDING: workerd cluster mode merges celld, and it landed on main today

Claim: on 2026-10-29T03:11:42Z, commit aa494794c44a900592c8281b191302d3b0a6e2a5
(PR #7994, "Cluster workerd processes over a shared bucket") merged cluster mode
into workerd's main branch. The commit message reads, in part:

"This is the beginning of merging celld's functionality into workerd. It lets
several workerd processes network into a cluster by giving each of them access
to the same S3-compatible bucket (`Config.cluster`, `--experimental`). Each
Durable Object has one owner at a time, requests reach it from any process, and
when its owner dies another process picks it up from the bucket. Objects use the
bucket as cold storage. For now an object acknowledges a write only once it is
fully synced to the bucket. Alarms are not supported yet"

The `ClusterConfig` schema documents: the cluster's shared state lives in an
S3-compatible bucket; each instance renews a lease record naming its address;
each DO's owner is a record claimed by a conditional write; taking an object
over from an owner whose lease expired bumps its ownership epoch; instances need
no shared filesystem because `durableObjectStorage.localDisk` is each instance's
own disk; DOs stored in memory stay local to each instance; the bucket's copy of
an object replaces the instance's, so a `localDisk` already holding DOs from
before cluster mode is refused at startup and is not imported.

Security properties documented in the schema: the cluster port must stay on a
private network (VPC, WireGuard, Tailscale) because traffic between instances is
not encrypted. A public IP is refused unless `cluster.unsafePublicAddress` is
set. A wildcard `0.0.0.0` listens on every interface, so the port must be
firewalled. Holders of the cluster `key` get full access to every service in the
process through the cluster address. Connections open with a MAC keyed by the
key over the target, a timestamp and a nonce, so a header seen on the wire
cannot be replayed; the instances' clocks must agree within 30 seconds. The key
also keys channel tokens that pass service and DO stubs over RPC. `bucketOptions`
supports `aws_endpoint`, `aws_region`, `aws_access_key_id`, `aws_secret_access_key`,
`aws_token`, or `aws_credentials_file` naming a file of credential lines reread
on change so short-lived credentials rotate without a restart (replace by
rename, not in place). CLI flags `--cluster-addr` and `--cluster-advertise`
override the config values.

Evidence: `gh api repos/cloudflare/workerd/contents/src/workerd/server/workerd.capnp`
lines 99 to 159 (ClusterConfig), lines 96 to 100 (`Config.cluster`, requires
`--experimental`), and `gh api "repos/cloudflare/workerd/commits?path=src/workerd/server/cluster&per_page=100"`
returning the single commit at 2026-10-29T03:11:42Z. The working integration test
is `src/workerd/server/tests/cluster/cluster-test.wd-test`, read 2026-10-29,
which configures `durableObjectStorage = ( localDisk = "local" )` plus
`cluster = (bucket = "s3://wdtest/cluster", address = "127.0.0.1:0", key = ...)`.
Implementation is Rust: `src/workerd/server/cluster/{bucket,capture,cluster,http,lease,owner,ownership,registry,s3}.rs`
plus `src/workerd/server/cluster/logic/`.

Label: [verified]

Timing caveat, and it matters: the cluster commit is dated 2026-10-29T03:11:42Z.
The latest published release v1.20261029.1 is dated 2026-10-29T00:52:48Z and was
published at 00:53:29Z. Cluster mode is therefore on `main` but NOT in any
published release or npm binary as of 2026-10-29. It should appear in the next
nightly. The `localDisk` SQLite storage, by contrast, has been in the tree since
2023-02-17 and is in every current release.

### 1.24 FINDING: workerd also ships a dynamic Worker loader, a Hyperdrive binding, and a Docker container engine

Claim: `src/workerd/api/worker-loader.c++` implements a `workerLoader` binding
that dynamically loads Workers from code presented at runtime and caches them by
name, unloading unused ones. Tests exist at
`src/workerd/api/tests/worker-loader-{test,limits-test,gc-test,rab-test,wasm-test,wasm-builtins-test,unnamed-gc-test}.js`.
The limits test documents hard-coded limits in worker-loader.c++: max dynamic
Worker code size 64 MiB (67,108,864 bytes) and max env size 1 MiB. The binding
requires the `experimental` compatibility flag.

The `workerLoader` binding config is `(name = "loader", workerLoader = ())`, with
an optional `id` so multiple Workers share a loader cache.

workerd also has a `hyperdrive` binding group (`designator`, `database`, `user`,
`password`, `scheme`) that lets Workers use Hyperdrive caching and pooling for
Postgres, and a `containerEngine` union with `localDocker` (socket path,
`containerEgressInterceptorImage`, `sessionId`) for local Docker container
operations. The egress interceptor sidecar image is published on Docker Hub as
`cloudflare/proxy-everything`.

DO snapshots are gated behind a `durable_object_snapshots` compatibility flag
(exposed also by the catch-all `experimental` flag), with
`onNextSessionRestore`, `waitForBookmark` and a `snapshot` method. DO offpeak
location hints are gated behind `offpeak_location_hint`.

Evidence: `gh api repos/cloudflare/workerd/contents/src/workerd/server/workerd.capnp`
lines 554 to 600 (hyperdrive, unsafeEval, memoryCache, workerLoader,
workerdDebugPort), lines 892 onward (containerEngine, DockerConfiguration);
`gh api repos/cloudflare/workerd/contents/src/workerd/api/tests/worker-loader-limits-test.js`
and its `.wd-test`; the file tree from
`gh api repos/cloudflare/workerd/git/trees/main?recursive=1` (4,387 entries).
All read 2026-10-29.

Label: [verified]

This is the self-hosted analogue of Workers for Platforms: a `workerLoader`
binding plus a dynamic dispatch Worker gives you the same shape without a
Cloudflare dispatch namespace.

### 1.25 FINDING: denoland/celld is a complete self-hosted Workers plus DO platform

Claim: celld is an open-source daemon that runs a Cloudflare Workers application
on your own machines: Workers, Durable Objects, KV, Queues, D1, R2, Workflows,
Cron Triggers and static assets, deployed from the `wrangler.json` you already
have. Each object is a cell, a named server with its own SQLite database.
Long-term state goes in an S3-compatible, Google Cloud Storage or Azure Blob
Storage bucket. It needs no serving control plane or consensus service.

Each node embeds V8 and executes Wrangler bundles. Nodes sharing one bucket form
a fleet; that bucket holds deployments, cell state and small ownership records.
A conditional bucket write gives a node ownership of a cell, so exactly one node
owns a cell at a time. No membership protocol, failure detector or consensus
service is needed. Signed peer HTTP provides routing and replicated-log
transport.

Durability: celld captures each committed SQLite write in the LTX replication
format. A single node proves a write durable by uploading it to the bucket. A
fleet of two or more nodes proves it sooner by sending to one or two other nodes,
and the write is durable as soon as they hold it on their disks, with the bucket
upload following.

The README's service table lists, with example projects: Workers, Durable
Objects (SQLite storage, alarms, hibernating WebSockets), KV, Queues, D1, R2,
Workflows, Cron Triggers, static assets, dynamic Workers with tail Worker
observability, Containers (experimental, a DO that supervises a container via
`@cloudflare/containers`), and Sandboxes (the Cloudflare Sandbox SDK,
`@cloudflare/sandbox`, on a container per sandbox).

Explicitly out of scope per the README: "A product that needs the Cloudflare
network, a GPU, or a browser farm is out of scope." Workers AI, Vectorize,
Hyperdrive, Browser Rendering and Email Workers are all **No** on the
compatibility table. Python Workers is **Partial** (fetch handlers on the
Pyodide 0.28 runtime line). Node.js compatibility is **Partial**. Cache is
**Partial**. BroadcastChannel is **No**.

GitHub metadata for `denoland/celld`, read 2026-10-29 via `gh api`:

| Field | Value |
| --- | --- |
| full_name | denoland/celld |
| description | self-hosted, distributed Durable Objects |
| stargazers_count | 6169 |
| license | Apache-2.0 |
| pushed_at | 2026-10-21T21:12:49Z |
| language | Rust |
| open_issues_count | 78 |
| forks_count | 423 |
| homepage | https://celld.dev |

Releases: v0.6.3 published 2026-10-21T21:12:44Z, then v0.6.2 (2026-10-07),
v0.6.1 (2026-10-01), v0.6.0 (2026-09-26), v0.5.1 (2026-09-19). 328 files in the
default branch tree. Installer at `https://celld.dev/install.sh`, provenance
verifiable with `gh attestation verify`. Release image published for Linux
x86-64 and ARM64. Windows is not supported. `celld deploy` needs esbuild on PATH
for Worker projects.

Label: [verified]

celld's documented DO API surface matches Cloudflare: `idFromName`, `get`,
`getByName`, `newUniqueId`, `idFromString`, `ctx.storage.get/put/delete/list/
deleteAll`, `ctx.storage.sql.exec()`, `transaction()` and `transactionSync()`,
`setAlarm/getAlarm/deleteAlarm` with an `alarm(alarmInfo)` handler,
`ctx.acceptWebSocket()` with `webSocketMessage()`, `blockConcurrencyWhile()`,
plus a celld-specific `storage.sync()`.

Documented differences from Cloudflare, all [verified] from
`docs/services/durable-objects.md` and `docs/cloudflare-compat.md`:
- celld makes no placement, migration or jurisdiction promise. A cell runs on a
  node of your fleet. `newUniqueId({ jurisdiction })` and `namespace.jurisdiction()`
  throw.
- The namespace key contains the script name, so renaming the script changes
  every id `idFromName()` derives.
- A `migrations` entry accepts `tag` and `new_sqlite_classes` only. Class
  rename, class delete and class transfer stop the deployment.
- `acceptWebSocket()` throws above 90 percent of the V8 heap limit.
- A WebSocket transport cannot move to a new cell owner; a client must reconnect
  with the same application operation ID. A hibernatable socket survives
  hibernation on the same node and closes when the cell moves.
- Each isolate-polled input queue has a 1 MiB budget for non-terminal frames.
- `passThroughOnException()` has no effect (no CDN fallback). `tail` and `email`
  handlers are unavailable.
- An inbound Request has a `cf` object without Cloudflare edge fields. celld
  cannot prove geolocation, colo or TLS metadata.
- celld does not terminate TLS. Public TLS must terminate at an ingress proxy.
  Peer traffic is plaintext HTTP; the fleet HMAC authenticates tunnel
  establishment and control requests but does not encrypt data.
- Ownership balancing counts cells by node weight, not CPU or memory, and moves
  only hibernated cells.
- celld v0.6.3 is described in `docs/limitations.md` as a beta release.

Storage requirements from `docs/guarantees.md`, all [verified]: the bucket must
provide conditional create, conditional overwrite, read-after-write consistency
and ranged reads. Qualified stores are Amazon S3, Cloudflare R2, Tigris, Google
Cloud Storage and Azure Blob Storage. Release tests run against R2. Azure was
qualified 2026-08-18 single-node under an account key, a VM managed identity and
an AKS workload identity. Backblaze B2, Hetzner Object Storage and DigitalOcean
Spaces do not implement the required conditional writes, so two nodes can own one
cell on them. MinIO community edition passes the storage test but is not
qualified for production; RELEASE.2025-09-07T16-13-09Z or later is required.
`celld diagnose` sends four conditional writes to the bucket and two of the four
must fail. celld reserves the `probe/`, `cells/`, `nodes/`, `node-cells/`,
`fleet/`, `deploy/`, `deploy-blobs/`, `log/`, `wake/` and `telemetry/` prefixes
and deletes objects under some of them, so a bucket lifecycle rule must not
select them. A node that loses its lease fences itself and exits, so a
supervisor that restarts without an attempt limit is required.

Evidence: `gh api repos/denoland/celld` (metadata, releases, contents of
README.md, docs/cloudflare-compat.md, docs/guarantees.md,
docs/services/durable-objects.md, docs/limitations.md), all read 2026-10-29.
Repo: denoland/celld.

### 1.26 FINDING: Rivet Actors is the other mature open-source DO alternative

`rivet-dev/rivet` describes itself as "Rivet Actors are the primitive for
stateful workloads. Built for AI agents, collaborative apps, and durable
execution." GitHub metadata read 2026-10-29: Rust, Apache-2.0, 6,487 stars, 367
open issues, pushed 2026-10-29T08:16:26Z. Releases: v3.0.0-preview.3 published
2026-10-28T11:02:25Z, v2.3.31 published 2026-10-27T22:00:19Z, v3.0.0-preview.2
published 2026-10-26T14:00:19Z. A v3 line is in preview alongside a maintained
v2 line.

Label: [verified] for the metadata. I did not read the Rivet source or docs, so
its feature parity with Cloudflare DOs is unverified.

### 1.27 DO class lifecycle is declared in the Wrangler `exports` field

Claim: the `exports` field is the declarative way to manage DO class lifecycle.
Cloudflare reconciles three sources of truth: the classes the code actually
exports, what you declared in `exports`, and the namespaces already provisioned.
A class that appears only in code is ignored until declared in `exports`;
Cloudflare does not provision a namespace implicitly.

A minimal entry is
`"exports": { "MyDurableObject": { "type": "durable-object", "storage": "sqlite" } }`.
Destructive operations use a tombstone `state`:

| Operation | `state` | Required fields |
| --- | --- | --- |
| Define a new class (default) | `"created"` or omitted | `storage` |
| Delete a class | `"deleted"` | none |
| Rename a class | `"renamed"` | `renamed_to` |
| Transfer to another Worker | `"transferred"` | `transferred_to` |
| Receive a transfer | `"expecting-transfer"` | `storage`, `transfer_from` |

Evidence: https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
(page redirected from .../durable-objects-migrations/; the fetched title is
"Durable Object class exports", "Last updated Sep 28, 2026", fetched
2026-10-29T11:26:33Z).

Label: [verified]

### 1.28 There is no Cloudflare REST API for reading or mutating DO storage

Claim: the Cloudflare REST API exposes Durable Object namespace listing only.
The DO Storage API, SQL API, alarms API and WebSocket hibernation API are
reachable only from inside a running Durable Object. Management of namespaces is
through Wrangler configuration (`durable_objects.bindings`, `migrations`,
`exports`) and the deploy path, not a general data API.

Evidence: search result
https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/methods/list/
("List Durable Object Namespaces | Cloudflare API") returned by the pkgforge
gateway on 2026-10-29, and the full set of DO API pages under
https://developers.cloudflare.com/durable-objects/api/, every one of which is a
Worker-runtime API rather than an HTTP management API.

Label: [verified] for the namespace-list endpoint and for the fact that all
`/durable-objects/api/` pages are runtime APIs. I did not open the namespace-list
page itself, so the exact response shape is unverified.

This is a hard architectural constraint: you cannot inspect or repair DO storage
from outside. A self-hosted replacement has to decide whether to offer one.

### 1.29 Workers for Platforms is priced as ordinary Workers usage

Claim: the Workers for Platforms docs at
`/cloudflare-for-platforms/workers-for-platforms/pricing/` returned HTTP 422 from
the read gateway on 2026-10-29T11:23:31Z, and the pkgforge search index surfaced
no `developers.cloudflare.com` pricing page for the product. The pricing that
exists is in the Workers pricing table (requests and CPU time), which applies to
dispatch Workers and, per the limits page, user Workers in a namespace are not
bound by per-account script limits.

Label: [verified] that the dedicated pricing page is unreachable. The specific
per-user-Worker billing rate is unverified.

### 1.30 Miniflare, the local Workers simulator, is now a pointer into workers-sdk

`cloudflare/miniflare`: TypeScript, MIT, 3,926 stars, 1 open issue, pushed
2025-03-13T11:12:49Z, last release v2.14.4 published 2024-10-07T18:59:21Z. The
repo description is "Fully-local simulator for Cloudflare Workers. For the latest
version, see https://github.com/cloudflare/workers-sdk/tree/main/packages/miniflare."
The standalone repo is effectively archived in favour of the workers-sdk
monorepo package.

Label: [verified] for the metadata. I did not read the workers-sdk miniflare
package, so its current DO support (including SQLite-backed local DO storage) is
unverified.

---

## 2. What this changes for the spec

### 2.1 The control plane can stay on Cloudflare; the DO question is the only hard one

Everything the operator needs for the dashboard SPA is cheap and well-defined on
Cloudflare: Workers at $5/month minimum with 10 million requests and 30 million
CPU-ms included, static assets free and unlimited, and no egress charges. DOs are
the only part of the developer platform with no self-hosted equivalent that is
production-ready on Cloudflare's own terms.

The good news, and it is the strongest finding in this document: the gap is
closing from two directions at once.

1. workerd itself now has SQLite-backed DO storage on local disk
   (`durableObjectStorage.localDisk`, in the tree since 2023-02-17) and, as of
   commit aa494794 on 2026-10-29, a cluster mode that distributes DOs across
   processes using an S3-compatible bucket for ownership and cold storage.
2. `denoland/celld` is a complete, Apache-2.0, self-hosted implementation of the
   whole Workers-plus-DO platform that deploys from an existing
   `wrangler.json`, including alarms, hibernating WebSockets, KV, Queues, D1, R2,
   Workflows, Cron and dynamic Workers. 6,169 stars, latest release v0.6.3 on
   2026-10-21.

Recommendation: split the DO decision into two tiers.

Tier 1, keep on Cloudflare. Anything the dashboard itself needs for coordination
and session state: WebSocket fan-out for live build logs, per-tenant rate
limiters, the small strongly-consistent index the SPA reads. These are cheap at
dashboard scale. At 100 DOs with one WebSocket each receiving a message a minute
for 8 hours a day, the docs' own worked example is $20.65 a month with
hibernation enabled and $142.95 without it. Use the Hibernation WebSocket API
from day one, and use `setWebSocketAutoResponse()` for ping/pong so protocol
traffic never wakes the object.

Tier 2, move to own metal. Anything that is really a database or a job queue
wearing a DO costume. A DO is single-threaded with a soft 1,000 requests per
second ceiling per object, and D1 confirms it is one DO per database. Long CI
runs, container orchestration state and bulk artifact indexing all belong on
celld or on plain Postgres, not on a Cloudflare DO.

### 2.2 Use Queues pull consumers as the control-plane to data-plane bridge

This is the cleanest primitive in the whole platform for the operator's split,
and it is not obvious from the product name.

A Cloudflare Queue with an HTTP pull consumer can be pulled from any
environment, any language, over HTTPS, with an API token. The token needs both
`com.cloudflare.api.account.queues_read` and
`com.cloudflare.api.account.queues_write` because acknowledging mutates queue
state. Pull with
`POST /client/v4/accounts/{account_id}/queues/{queue_id}/messages/pull` and body
`{ "visibility_timeout_ms": 60000, "batch_size": 50 }`.

Recommendation: the dashboard Worker writes jobs to a Queue. Each self-hosted
machine runs a pull consumer loop behind its tunnel, pulls a batch, does the
heavy work, acknowledges, and writes results back to R2 or to a DO-backed status
key. This gives at-least-once delivery, backpressure through the 25 GB per-queue
backlog and 5,000 messages/second per-queue throughput cap, a 12 hour visibility
timeout for long jobs, and dead-letter queues for failures, without the operator
writing any of it. Cost is $0.40 per million operations after 1 million included,
with 3 operations per delivered message, so roughly $1.20 per million messages.

The constraint to design around: 128 KB message size. Job descriptors belong in
the message; payloads belong in R2.

### 2.3 Hyperdrive is how the Cloudflare side reaches a self-hosted database

Hyperdrive's origin connection cap is about 100 per configuration on Workers
Paid, and it does not limit concurrent client connections from Workers, only
connections to the origin. It also caches query results up to 50 MB by default.

Recommendation: point Hyperdrive at the operator's own Postgres reached through
the tunnel, and cap the application's pool well under 100. The 15 second initial
connection timeout and 10 minute idle timeout are the numbers to set alerts
against. Hyperdrive is not a substitute for a replica close to the Worker; it is
a connection pool and a query cache. For anything latency-sensitive the data
still has to cross the tunnel.

### 2.4 Do not use KV for anything that must be correct

KV writes to the same key are capped at 1 per second on both plans. It is
eventually consistent. It is fine for configuration, feature flags and cached
lookups. It is wrong for counters, locks, leader election or anything a DO or a
transaction should own.

Recommendation: KV for config, DO SQLite or a self-hosted Postgres for state,
R2 for blobs, Queues for work. Say this explicitly in the spec because the
default instinct is to reach for KV.

### 2.5 R2 is the right place for data-plane artifacts, and the free tier is real

R2 has no egress fees at all, 10 GB-month plus 1 million Class A and 10 million
Class B operations free per month, unlimited objects and buckets, and 5 TiB per
object. The Cloudflare REST API is capped at 1,200 requests per 5 minutes across
all R2 REST operations on the account, so anything with throughput must use the
S3-compatible API or the Workers binding.

Recommendation: put build artifacts, container images and logs in R2, serve them
through a Worker on a custom domain rather than an `r2.dev` subdomain (which is
rate limited and explicitly not for production), and have the self-hosted
machines write through the S3 API. Note that the same R2 bucket can be the fleet
bucket for celld, which is one of celld's qualified stores and the one its
release tests run against. That collapses two infrastructure pieces into one.

### 2.6 Workers for Platforms is worth using only if the operator is reselling compute

Workers for Platforms gives unlimited scripts per dispatch namespace, per-customer
CPU and subrequest limits, an outbound Worker for egress control, and a REST API
for deploying user Workers. If the operator's product is "run your code here", it
is the right Cloudflare-native answer. If the product is a dashboard for his own
CI and containers, it is overhead.

Recommendation: skip Workers for Platforms unless multi-tenant code execution is
a product feature. If it becomes one, note that the same shape is available
self-hosted through workerd's `workerLoader` binding (64 MiB max code, 1 MiB max
env, requires the `experimental` flag) plus celld's dynamic Workers support, and
that workerd's `workerLoader` tests live in the open tree.

### 2.7 Model the DO duration bill against 128 MB, and batch WebSocket messages

Duration is billed as wall-clock time multiplied by 128 MB regardless of actual
memory use, and objects sharing an isolate still bill as if each had a full
128 MB. Billable usage is rounded up to the next billable unit before the rate
is applied.

Recommendation: in the cost model, compute GB-s as `active_seconds * 0.128`.
Two specific levers, both from the docs' own examples: hibernation is a 20x cost
difference on identical message volume, and batching many small logical messages
into one WebSocket frame reduces per-message context-switch overhead that can
otherwise overwhelm a single DO regardless of total data volume.

### 2.8 Do not assume DOs are everywhere on Cloudflare's network

As of 2026-10-29 the where.durableobjects.live tracker reported DOs available in
10.76 percent of Cloudflare PoPs. A DO is created near its first requester and
then stays there. For a control plane that must be globally reachable, the
Worker layer is global and the DO layer is not.

Recommendation: treat DO placement as a latency and jurisdiction risk, not just a
detail. If any part of the system has a data-residency requirement, that part
cannot be a Cloudflare DO without the jurisdiction placement API, and the
self-hosted path (celld) explicitly throws on `newUniqueId({ jurisdiction })`
rather than pretending to honour it.

### 2.9 workerd on own metal is viable for compute, with two hard caveats

The README's own words: "workerd is not a hardened sandbox". Running untrusted or
AI-generated code in workerd on the operator's own machines requires a VM or
equivalent boundary around it. Cloudflare's hosted service adds many more
defence-in-depth layers that the open-source binary does not have.

The second caveat is cluster mode's transport: peer traffic between workerd
instances is plaintext HTTP. The fleet HMAC authenticates tunnel establishment
and control requests but does not encrypt data. The cluster port must be on a
private network, a public IP is refused unless `unsafePublicAddress` is set, and
a wildcard bind needs the port firewalled. Holders of the cluster key get full
access to every service in the process.

Recommendation: if the operator runs workerd on his own machines, put the cluster
port behind the tunnel or a WireGuard overlay, generate the key with
`openssl rand -hex 32`, keep instance clocks within 30 seconds of each other
(NTP is a correctness dependency, not an ops nicety), and never expose the port
publicly. celld has the same property and the same requirement, and documents it
the same way.

### 2.10 Pin the workerd version and watch for the cluster release

The cluster commit landed on main at 2026-10-29T03:11:42Z, after the
v1.20261029.1 release commit at 2026-10-29T00:52:48Z. As of 2026-10-29 the npm
`latest` dist-tag is 1.20261029.1, which does not contain cluster mode.

Recommendation: build the self-hosted workerd path against `localDisk` SQLite DO
storage, which has been in every release since 2023-02-17 and does not need
`--experimental`. Treat cluster mode as a watch item: it needs `--experimental`,
alarms are explicitly not supported yet in the merge commit, and a `localDisk`
directory holding pre-cluster DOs is refused at startup rather than imported.
Any evaluation should rebuild from a pinned nightly and confirm the tag date is
after 2026-10-29.

### 2.11 Choose the DO storage backend deliberately

SQLite-backed DOs are the recommended backend for all new classes and are the
only option on the Workers Free plan. KV-backed DOs are Paid-only, have no SQL
API, no point-in-time recovery, a 128 KiB value cap and a 2 KiB key cap, and are
billed in 4 KB request units at a higher rate ($1.00/million writes versus
$1.00/million rows, with a 4 KB floor per unit).

Recommendation: always `new_sqlite_classes`. There is no migration path from KV
to SQL announced; the 2025-04-07 changelog says one "will be offered in the
future". Starting on KV is a one-way door.

### 2.12 Write DO state incrementally; there are no shutdown hooks

The lifecycle page is explicit that shutdown hooks are not provided and cannot be
guaranteed, and that in-flight requests touching storage are stopped immediately
with an error to preserve global uniqueness.

Recommendation: this is a portability requirement, not just a Cloudflare quirk.
Any DO-shaped component, on Cloudflare or on celld, must persist progress as it
goes. Design the state machine so a hard kill at any instruction is recoverable
from the last committed write. celld documents the same property and the same
constructor-reruns-on-wake behaviour, so code written to this rule ports.

---

## 3. Not covered / open questions

Named precisely, with what would close each one.

1. **Workers for Platforms pricing.** The dedicated page
   `/cloudflare-for-platforms/workers-for-platforms/pricing/` returned HTTP 422
   from the read gateway on 2026-10-29, and the search index surfaced no
   developers.cloudflare.com pricing page for it. Closing this: fetch the page
   directly with a different reader, or confirm with Cloudflare that user Workers
   bill as ordinary Workers requests and CPU time with no namespace surcharge.

2. **The exact per-user-Worker billing rate inside a dispatch namespace.**
   Follows from item 1. Unverified.

3. **Workerd cluster mode in a published release.** The merge commit is
   aa494794c44a900592c8281b191302d3b0a6e2a5 dated 2026-10-29T03:11:42Z, after
   the v1.20261029.1 release commit. Closing this: check
   `gh api repos/cloudflare/workerd/releases` for a nightly tag dated after
   2026-10-29 and confirm `Config.cluster` is present in its `workerd.capnp`.

4. **Whether workerd's cluster alarms will match Cloudflare's semantics.** The
   merge commit says "Alarms are not supported yet". `alarm-scheduler.c++`
   exists in the open server, so the pieces are there, but the cluster path is
   not wired. Unverified when it lands or whether it will carry the same
   at-least-once plus exponential-backoff-from-2-seconds-plus-6-retries contract.

5. **Rivet Actors feature parity.** I verified only its repository metadata
   (rivet-dev/rivet, Rust, Apache-2.0, 6,487 stars, 367 open issues, v3.0.0-preview.3
   on 2026-10-28). I did not read its source or documentation. Closing this: read
   its docs and compare the DO API surface, storage backend and durability
   guarantees against section 1.25.

6. **Current Miniflare DO support.** The standalone `cloudflare/miniflare` repo is
   effectively archived (last push 2025-03-13, last release v2.14.4 on 2024-10-07)
   and points at `cloudflare/workers-sdk/tree/main/packages/miniflare`. Whether
   the current package supports SQLite-backed local DO storage is unverified.

7. **The Cloudflare REST API response shape for listing DO namespaces.** I
   confirmed the endpoint exists at
   `/api/resources/durable_objects/subresources/namespaces/methods/list/` via the
   search index but did not open the page. Unverified: the response fields and
   whether any write operations exist.

8. **DO storage pricing under sustained heavy write load.** I have the rates
   ($1.00 per million rows written, $0.001 per million rows read, $0.20 per
   GB-month) and four worked examples, but no real account data. Whether the
   operator's workload is read-heavy or write-heavy changes the bill by three
   orders of magnitude on the rate alone. Closing this: model the actual query
   mix before committing.

9. **Whether celld's experimental Containers support is usable.** The README lists
   Containers as Experimental, a DO that supervises a container via
   `@cloudflare/containers`, with an example project. I did not read
   `docs/services/containers.md` or the example. This is directly relevant to the
   operator's long-running-container requirement and is the largest single gap in
   this research relative to the stated project.

10. **celld in production at scale.** Its own `docs/limitations.md` calls v0.6.3
    a beta release. There is no public benchmark or post-mortem in what I read.
    Closing this: run the operator's actual workload against a two-node fleet
    with `celld diagnose` against the chosen bucket, and test the takeover path
    by killing an owner mid-request.

11. **Cross-checking the 10.76 percent PoP figure.** It is live data from a
    community tracker, not a Cloudflare statement, and it moved between page
    loads in principle. It should be treated as an order-of-magnitude signal
    only.

12. **A1/A2/A5 overlap I did not cover.** Tunnel architecture, service tokens,
    WARP-to-Tunnel, Cloudflare VPC service, Magic WAN, mTLS, Access applications
    and device posture are A1 and A5 territory. Containers beta/GA state,
    Sandbox SDK, Browser Rendering, sleep/wake and persistence are A2. Workerd
    build-from-source, V8 isolates versus full Node, and
    `experimental_configureRuntime` are A3. R2 and Workers full pricing
    comparison against self-hosted equivalents is A6. I touched all of these only
    where they intersect Durable Objects and Workers.

---

## Appendix: source list with read timestamps

All read 2026-10-29 (UTC) via the pkgforge gateway pinned to provider `tinyfish`,
or via `gh api` where noted.

developers.cloudflare.com:
- /durable-objects/ (Jul 15, 2026) 11:23:47Z
- /durable-objects/concepts/what-are-durable-objects/ (Jul 15, 2026) 11:24:34Z
- /durable-objects/concepts/durable-object-lifecycle/ (Oct 15, 2026) 11:26:40Z
- /durable-objects/platform/limits/ (Jun 1, 2026) 11:22:09Z
- /durable-objects/platform/pricing/ (Oct 18, 2026) 11:22:18Z
- /durable-objects/api/alarms/ (Apr 21, 2026) 11:23:01Z
- /durable-objects/api/state/ (Sep 30, 2026) 11:27:34Z
- /durable-objects/api/sqlite-storage-api/ (Sep 21, 2026) 11:26:28Z
- /durable-objects/reference/durable-objects-migrations/ (Sep 28, 2026) 11:26:33Z
- /durable-objects/best-practices/websockets/ 11:23:04Z
- /durable-objects/best-practices/rules-of-durable-objects/ 11:30:26Z
- /durable-objects/get-started/ (Oct 18, 2026) 11:29:33Z
- /workers/platform/limits/ (Oct 12, 2026) 11:22:25Z
- /workers/platform/pricing/ (Oct 2, 2026) 11:22:33Z
- /queues/platform/limits/ (Apr 21, 2026) 11:23:20Z
- /queues/configuration/pull-consumers/ (Jul 1, 2026) 11:28:52Z
- /queues/ 11:23:14Z
- /hyperdrive/ (Oct 21, 2026) 11:23:31Z
- /hyperdrive/platform/limits/ (Jun 9, 2026) 11:23:45Z
- /kv/platform/limits/ (Oct 8, 2026) 11:26:51Z
- /d1/platform/limits/ (Oct 24, 2026) 11:26:55Z
- /r2/pricing/ (Oct 26, 2026) 11:27:09Z
- /r2/platform/limits/ (Jun 8, 2026) 11:26:48Z
- /cloudflare-for-platforms/workers-for-platforms/ (Oct 15, 2026) 11:23:11Z
- /cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/ (Apr 21, 2026) 11:23:25Z
- /cloudflare-for-platforms/workers-for-platforms/configuration/dynamic-dispatch/ (Sep 16, 2026) 11:24:04Z
- /cloudflare-for-platforms/workers-for-platforms/reference/limits/ (Oct 13, 2026) 11:24:07Z
- /cloudflare-for-platforms/workers-for-platforms/get-started/ (Aug 14, 2026) 11:28:29Z
- /api/resources/workers_for_platforms/ 11:28:16Z
- /changelog/post/2025-04-07-sqlite-in-durable-objects-ga/ 11:30:44Z

blog.cloudflare.com:
- /sqlite-in-durable-objects/ (2024-09-26) 11:30:46Z
- /durable-objects-easy-fast-correct-choose-three/ (2021-08-03) 11:27:29Z

where.durableobjects.live: 11:27:46Z

GitHub via `gh api`, all 2026-10-29:
- cloudflare/workerd: repo metadata, releases, tags, README.md,
  src/workerd/server/workerd.capnp (1,276 lines),
  src/workerd/server/cli/args.rs, src/workerd/api/actor-state.h,
  src/workerd/api/worker-loader.c++ (tree entry),
  src/workerd/api/tests/worker-loader-limits-test.js and .wd-test,
  src/workerd/api/tests/durable-object-{offpeak-hint,snapshots-flag}-test.wd-test,
  src/workerd/server/tests/cluster/cluster-test.wd-test and cluster-worker.js,
  src/workerd/server/alarm-scheduler.h, src/cloudflare/durable-objects.ts,
  samples/durable-objects-chat/config.capnp, types/defines/durable-objects.d.ts,
  src/node/sqlite.ts, git tree (4,387 entries), commit history for
  src/workerd/server/cluster, src/workerd/server/workerd.capnp and
  samples/durable-objects-chat/config.capnp
- denoland/celld: repo metadata, releases, README.md, docs/cloudflare-compat.md,
  docs/guarantees.md, docs/services/durable-objects.md, docs/limitations.md,
  git tree (328 entries)
- rivet-dev/rivet: repo metadata, releases
- cloudflare/miniflare: repo metadata, releases

npm registry:
- registry.npmjs.org/workerd, dist-tags read 2026-10-29

Not used, no fallback required: built-in web_search and web_fetch were never
needed. Every pkgforge call succeeded on its first attempt.
