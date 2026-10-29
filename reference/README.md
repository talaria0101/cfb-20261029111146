# Reference skeletons

**Illustrative. None has been executed, deployed or tested.** They exist so the shapes
in `SPEC.md` are concrete, not so you can copy them blind.

Where a field name or default is documented in the research files, the file and section
are cited. Where a shape was inferred from a documented example rather than a full API
reference, that is said.

## `contract.rs`

Requirement R1. One trait set, two implementations. Application code depends only on
this; the adapter is selected at build or deploy time, never by runtime feature
detection.

```rust
// Portable across Cloudflare Workers and cfb-node. No Cloudflare type appears
// outside the adapter modules in SPEC.md section 2.1.

pub trait ObjectStore {
    async fn get(&self, key: &str) -> Result<Bytes>;
    async fn put(&self, key: &str, body: Bytes) -> Result<()>;
    async fn delete(&self, key: &str) -> Result<()>;
    async fn list(&self, prefix: &str) -> Result<Vec<String>>;
}

pub trait SqlDatabase {
    async fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>>;
    async fn exec(&self, sql: &str, params: &[Value]) -> Result<u64>;
}

pub trait JobQueue {
    /// Pull a batch. `visibility_ms` is the lease duration; 12 h is the Cloudflare
    /// Queues maximum and the value to design long jobs around [A4 2.2].
    async fn pull(&self, batch: usize, visibility_ms: u64) -> Result<Vec<Lease>>;
    async fn ack(&self, lease: &Lease) -> Result<()>;
    /// 128 KB cap. Descriptors go in the message; payloads go in ObjectStore.
    async fn publish(&self, body: &[u8]) -> Result<()>;
}

/// How the platform resolves a process environment. Borrowed from mirrord [E5 1.7]:
/// the platform value wins, a local-only variable survives, and the exclusion list
/// is the set the host always wins so PATH, HOME and TMPDIR do not leak.
pub trait EnvResolver {
    fn resolve(&self, name: &str) -> Option<String>;
}

pub const HOST_WINS: &[&str] = &[
    "PATH", "HOME", "TMPDIR", "TEMP", "TMP", "USER", "LOGNAME", "SHELL",
    "GOPATH", "GEM_HOME", "JAVA_HOME", "CARGO_HOME", "RUSTUP_HOME",
    "LANG", "LC_ALL", "TERM", "PWD", "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME",
];
```

## `wrangler.toml`

The Cloudflare adapter. Binding shapes from `research/A5-zero-trust-vpc.md` section 1.1
and `research/A4-durable-objects-workers.md` section 2.2, read from Cloudflare's Workers
VPC and Queues documentation on 2026-10-29.

```toml
name = "cfb-control-plane"
main = "src/index.ts"
compatibility_date = "2026-10-29"

# Static assets for the SPA. Free and unlimited on Workers Paid, so the front end
# costs the $5 floor and nothing else. Do NOT enable Workers Caching in front of
# this: cache hits bill at the full per-request rate including static assets.
# [A6 2.5]
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"

# One VPC Service per internal HTTP endpoint on your own metal. Host and port come
# from the service configuration and are IGNORED in the fetch() URL, which is what
# makes SSRF structurally impossible on this path. [A5, verified 2026-10-29]
[[vpc_services]]
binding = "PRIVATE_ORCHESTRATOR"
service_id = "replace-with-the-service-id-from-the-connectivity-directory"
remote = true

[[vpc_services]]
binding = "PRIVATE_STORAGE"
service_id = "replace-with-the-service-id-from-the-connectivity-directory"
remote = true

# Tier 1 Durable Objects only: sessions, fan-out, rate limiters. Authoritative
# state lives on your own Postgres. [C6 R3, A4 2.1]
[[durable_objects.bindings]]
name = "COORDINATION"
class_name = "CoordinationObject"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["CoordinationObject"]

# Job dispatch to the data plane. The Worker enqueues; it never fans out at request
# time, because of the 6-connection and 30-second CPU ceilings. [C1 1.24]
[[queues.producers]]
binding = "JOBS"
queue = "cfb-jobs"

# Artifacts. Uploaded to by presigned URL, never proxied through the Worker, because
# the zone body cap is 100 MB on Free and Pro. [B5 R4, C6 R7]
[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "cfb-artifacts"

# Origin TLS verification for VPC Services. verify_full is the default and trusts
# only publicly-trusted CAs and Cloudflare Origin CA certificates, so a self-signed
# cert on the data plane fails the handshake and fetch() throws. Issue Origin CA
# certs, or set verify_ca deliberately. Do not default to disabled. [A5 2.1]
```

## `node.toml`

`cfb-node` configuration. Field shapes follow `talaria0101/cfrs`'s
`src/config.rs`, which parses cloudflared's config YAML shape, and ServerBee's agent
configuration, which persists its run token before claiming anything [E6 1.10, E4 1.5].

**Not executed. The remote-configuration field names need one read of the live API
reference before you rely on them.**

```toml
# cfb-node: one binary per server. Tunnel connector, orchestrator interface, broker.

[transport]
# Which mechanism opens the byte stream to the edge. One trait, four impls
# [E6 1.10]: direct is the only one fast enough for QUIC; http-connect is what a
# sandbox offers and also solves name resolution where there is no resolver;
# ssh-relay reaches a TCP relay over port 443; websocket carries the stream inside
# an HTTPS upgrade for proxies that inspect traffic.
kind = "direct"            # direct | http-connect | ssh-relay | websocket
bind_address = ""          # edge bind address, for hosts with several interfaces
no_delay = true            # a tunnel carries many small messages

[edge]
# Stage 1: cloudflared, supervised as a child process. Stage 2: cfrs's own codec,
# behind a flag, once it has carried real traffic against the real edge.
# [SPEC.md 4.3, E6 1.4]
connector = "cloudflared"  # cloudflared | cfrs
protocol = "quic"          # quic | http2. QUIC gets post-quantum key exchange;
                           # http2 does not [A1 F3]
ha_connections = 4         # hard default in cloudflared's source [A1 F5]
token_file = "/etc/cfb-node/tunnel-token"   # never --token, never an env var
config_source = "cloudflare"                # remotely-managed only [A1 2.1]
# From cloudflared 2026.10.0 you can normalise URLs before ingress matching. It is
# off by default and flips on for new releases on 2027-01-25. Set it now.
# [A1 F6]
disable_path_normalization = false

[ingress]
# Rules end in a catch-all. It is mandatory and the API rejects configurations
# without one. [A1 F5]
rules = [
  { hostname = "orchestrator.internal.example.com", service = "http://127.0.0.1:4646" },
  { hostname = "storage.internal.example.com",     service = "http://127.0.0.1:8333" },
  { hostname = "terminal.internal.example.com",    service = "http://127.0.0.1:7681" },
  { service = "http_status:404" },
]

[enroll]
# ServerBee's model [E4 1.5]: the agent generates 32 random bytes and persists them
# BEFORE claiming a single-use server-bound short-lived offer, so a write failure
# cannot burn it. The server stores an argon2 hash and never returns the plaintext.
# A 401 on upgrade triggers re-enrollment capped at three attempts. A permanent auth
# failure exits 78 to match systemd's RestartPreventExitStatus.
run_token_file = "/etc/cfb-node/run-token"
offer_endpoint = "https://control-plane.example.com/api/enroll/offer"
max_enroll_attempts = 3
auth_failure_exit_code = 78

[capabilities]
# Agent-owned, not server-owned. Default everything sensitive off. [E4 1.6]
mask = 1852               # terminal, exec, file and docker all off
host_grant_ceiling_hours = 24
# The agent deliberately ignores a server-advertised capabilities field.

[broker]
# Ingress routing to local services. HTTP is done in cfrs's Tunnel::resolve and
# Origin; raw TCP is net-new. [E6 1.10]
listen = "127.0.0.1:7844"
max_streams = 256         # cfrs's tunnel-protocol window [B8 3.1]
initial_window_kib = 256
max_data_frame_kib = 64

[orchestrator]
# A driver trait, three implementations. cfb-node exposes the orchestrator; it does
# not run it. No gRPC over a Tunnel public hostname. [B6 F13]
driver = "nomad"          # nomad | k3s | docker
address = "http://127.0.0.1:4646"
# Nomad: set the disconnect block explicitly, or an allocation on a node that
# misses heartbeats is marked lost and replaced. [B3 F10]
lost_after = "90s"
stop_on_client_after = "180s"
# k3s: --tls-san <tunnel-hostname> before first start, or the apiserver cert does
# not cover the tunnel hostname and clients fail with x509 unknown authority.
# [B3 F19]

[queue]
# Cloudflare Queues HTTP pull consumer. The token needs both queues_read and
# queues_write, because acknowledging mutates queue state. [A4 2.2]
endpoint = "https://api.cloudflare.com/client/v4/accounts/{account}/queues/{queue}/messages/pull"
batch_size = 50
visibility_timeout_ms = 43200000     # 12 h, the documented maximum

[env]
# Platform value wins, local-only survives, HOST_WINS always wins. [E5 1.7]
resolver = "platform-first"
```

## `queue-pull.sh`

The control-plane to data-plane bridge. The endpoint and body shape are quoted from
Cloudflare's Queues documentation [A4 2.2]; the shell wrapper is mine and untested.

```bash
#!/usr/bin/env bash
set -euo pipefail

ACCOUNT_ID="${CF_ACCOUNT_ID:?set it}"
QUEUE_ID="${CF_QUEUE_ID:?set it}"
TOKEN="${CF_QUEUE_TOKEN:?set it}"

while true; do
  resp="$(curl -qfsS \
    -H "authorization: Bearer ${TOKEN}" \
    -H 'content-type: application/json' \
    -X POST \
    --data '{"visibility_timeout_ms":43200000,"batch_size":50}' \
    "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/pull")" \
    || { sleep 5; continue; }

  # Job descriptors live in the message. Payloads live in object storage, because
  # the message cap is 128 KB. [A4 2.2]
  echo "$resp" | jq -c '.result.messages[]?' | while read -r msg; do
    lease_id="$(jq -r '.lease_id' <<<"$msg")"
    body="$(jq -r '.body' <<<"$msg")"
    handle_job "$body" || true
    curl -qfsS -X POST \
      -H "authorization: Bearer ${TOKEN}" \
      "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/ack" \
      --data "$(jq -n --arg l "$lease_id" '{acks:[{lease_id:$l}]}')" || true
  done
done
```

## `dataplane-client.ts`

The module `SPEC.md` keeps every data-plane call behind, so the transport is swappable
if Workers VPC changes or is withdrawn.

```typescript
// The contract. One method per data-plane capability. Implementations may change;
// this interface must not.
export interface DataPlaneClient {
  orchestrator(path: string, init?: RequestInit): Promise<Response>;
  storage(path: string, init?: RequestInit): Promise<Response>;
}

// Primary: Workers VPC Service bindings. Host and port come from the VPC Service
// configuration and are ignored in the URL, so SSRF is structurally impossible.
// [A5, verified 2026-10-29]
export class VpcServiceClient implements DataPlaneClient {
  constructor(
    private readonly orchestrator: Fetcher,
    private readonly storage: Fetcher,
    // Held as a Worker secret. The tunnel leg is already encrypted but the binding
    // is not a credential: nothing in the Workers VPC path injects a service token
    // or an Access JWT, so the origin must authenticate the caller itself. [A5 1.3]
    private readonly originToken: string,
  ) {}

  orchestrator(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.orchestrator, path, init);
  }

  storage(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.storage, path, init);
  }

  private call(binding: Fetcher, path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.originToken}`);
    return binding.fetch(`https://dataplane.invalid${path}`, { ...init, headers });
  }
}

// Fallback: plain HTTPS to a public hostname behind Access. Exercised by a test
// even though it is never used in production. If Workers VPC is withdrawn under
// SSSA section 5, this is the file you edit.
export class AccessHostnameClient implements DataPlaneClient {
  constructor(
    private readonly orchestratorBase: string,
    private readonly storageBase: string,
    private readonly serviceTokenId: string,
    private readonly serviceTokenSecret: string,
  ) {}

  orchestrator(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.orchestratorBase, path, init);
  }

  storage(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.storageBase, path, init);
  }

  private call(base: string, path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("CF-Access-Client-Id", this.serviceTokenId);
    headers.set("CF-Access-Client-Secret", this.serviceTokenSecret);
    return fetch(`${base}${path}`, { ...init, headers });
  }
}
```

Two notes. The hostname `dataplane.invalid` is deliberate: with a VPC Service binding
the URL's host and port are ignored, so the value is a placeholder, and a reader who
tries to "fix" it into a real hostname has misunderstood the mechanism [A5]. The
fallback uses `CF-Access-Client-Id` and `CF-Access-Client-Secret`, the documented
service-token headers, with the `cfast_` secret format in force for new secrets since
2026-08-26 [A5 1.4].

## What these files do not establish

- That any of it runs. Nothing here has been executed.
- The remote-configuration field names in `node.toml`, which need one read of the live
  API reference.
- That the fallback `AccessHostnameClient` works end to end. `research/C1-threat-model.md`
  open question 7 records that whether Access can enforce anything on the
  Worker-to-VPC-Service hop was not tested.
- That a raw TCP tunnel rule carries gRPC plus mTLS, which gates both Woodpecker and
  Talos [D1 Q31].
- That cfrs's edge codec works against the real edge. It has never been driven [E6 1.4].
