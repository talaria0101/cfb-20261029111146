# Reference skeletons

**These are illustrative. None of them has been executed, deployed or tested.** They
exist so the shapes in `SPEC.md` are concrete, not so you can copy them blind.

Where a field name or a default is documented in the research files, the file and
section are cited. Where I inferred a shape from a documented example rather than from
a full API reference, the file says so.

## `wrangler.toml`

The binding shape is from `research/A5-zero-trust-vpc.md` section 1.1 and
`research/A4-durable-objects-workers.md` section 2.2, both read from Cloudflare's
Workers VPC and Queues documentation on 2026-10-29.

```toml
name = "cfb-control-plane"
main = "src/index.ts"
compatibility_date = "2026-10-29"

# Static assets for the SPA. Requests to static assets are free and unlimited on
# Workers Paid, so the dashboard front end costs the $5 floor and nothing else.
# Do NOT enable Workers Caching in front of this: cache hits bill at the full
# per-request rate including static assets. [A6 2.5]
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"

# One VPC Service per internal HTTP endpoint on your own metal.
# Host and port come from the service configuration and are IGNORED in the
# fetch() URL, which is what makes SSRF structurally impossible on this path.
# [A5, verified against the Workers VPC overview page 2026-10-29]
[[vpc_services]]
binding = "PRIVATE_ORCHESTRATOR"
service_id = "replace-with-the-service-id-from-the-connectivity-directory"
remote = true

[[vpc_services]]
binding = "PRIVATE_STORAGE"
service_id = "replace-with-the-service-id-from-the-connectivity-directory"
remote = true

# Tier 1 Durable Objects only. Coordination, sessions, fan-out, rate limiters.
# Authoritative state lives on your own Postgres. [C6 R3, A4 2.1]
[[durable_objects.bindings]]
name = "COORDINATION"
class_name = "CoordinationObject"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["CoordinationObject"]

# Job dispatch to the data plane. The Worker enqueues; it does not fan out at
# request time, because of the 6-connection and 30-second CPU ceilings. [C1 1.24]
[[queues.producers]]
binding = "JOBS"
queue = "cfb-jobs"

# Artifacts. Uploaded to by presigned URL, never proxied through the Worker,
# because the zone body cap is 100 MB on Free and Pro. [B5 R4, C6 R7]
[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "cfb-artifacts"

# Origin TLS verification for VPC Services. verify_full is the default and trusts
# only publicly-trusted CAs and Cloudflare Origin CA certificates, so a self-signed
# cert on the data plane fails the handshake and fetch() throws. Issue Origin CA
# certs, or set verify_ca deliberately. Do not default to disabled. [A5 2.1]
```

## `tunnel-ingress.json`

For a **remotely-managed** tunnel the ingress rules live on Cloudflare, not in a local
file, and the control plane writes them with
`PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` [A1 2.2].

**Caveat.** I did not execute this endpoint. The top-level `config` wrapper is the
documented remote-configuration shape as recorded in `research/A1-cloudflare-tunnels.md`
section 2.2, but the exact field names should be confirmed against the live API
reference before you rely on them. The ingress rule fields below are quoted from
Cloudflare's configuration-file documentation, which `A1` read on 2026-10-29.

```json
{
  "config": {
    "ingress": [
      {
        "hostname": "orchestrator.internal.example.com",
        "service": "http://127.0.0.1:4646"
      },
      {
        "hostname": "storage.internal.example.com",
        "service": "http://127.0.0.1:8333",
        "originRequest": {
          "connectTimeout": "10s",
          "disableChunkedEncoding": true
        }
      },
      {
        "hostname": "terminal.internal.example.com",
        "service": "http://127.0.0.1:7681"
      },
      {
        "service": "http_status:404"
      }
    ]
  }
}
```

Four things in that file are not optional:

- The catch-all `http_status:404` is mandatory and the API rejects configurations
  without one [A1 F5].
- `path` matching uses a regex parsed with Go's `syntax` package, for example
  `path: \.(jpg|png|css|js)$` [A1 F5].
- Wildcards work only as the leftmost label. `test.*.example.com` is unsupported
  [A1 F5].
- `originRequest` set per rule overrides the top-level value [A1 F5].

The locally-managed YAML equivalent exists and is documented, but do not use it for
anything the dashboard has to manage: a locally-managed tunnel's config lives in a
file on your machine and is invisible to the control plane [A1 2.1].

## `dataplane-client.ts`

This is the module that `SPEC.md` invariant 13 protects. Every data-plane call in the
Worker goes through it, and it is the only place a VPC binding appears. Write it before
there are two call sites.

```typescript
// The contract. One method per data-plane capability. Implementations may change;
// this interface must not.
export interface DataPlaneClient {
  orchestrator(path: string, init?: RequestInit): Promise<Response>;
  storage(path: string, init?: RequestInit): Promise<Response>;
}

// Primary implementation: Workers VPC Service bindings.
//
// host and port come from the VPC Service configuration and are ignored in the
// URL, so SSRF is structurally impossible on this path. [A5, verified 2026-10-29]
export class VpcServiceClient implements DataPlaneClient {
  constructor(
    private readonly orchestrator: Fetcher,
    private readonly storage: Fetcher,
    // Held as a Worker secret. The tunnel leg is already encrypted but the
    // binding is not a credential: nothing in the Workers VPC path injects a
    // service token or an Access JWT, so the origin must authenticate the
    // caller itself. [A5 1.3]
    private readonly originToken: string,
  ) {}

  orchestrator(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.orchestrator, path, init);
  }

  storage(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.storage, path, init);
  }

  private call(
    binding: Fetcher,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.originToken}`);
    return binding.fetch(`https://dataplane.invalid${path}`, {
      ...init,
      headers,
    });
  }
}

// Fallback implementation: plain HTTPS to a public hostname behind Access.
//
// Exercised by a test in Phase 4 even though it is never used in production.
// If Workers VPC is withdrawn under SSSA section 5, this is the file you edit.
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

  private call(
    base: string,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("CF-Access-Client-Id", this.serviceTokenId);
    headers.set("CF-Access-Client-Secret", this.serviceTokenSecret);
    return fetch(`${base}${path}`, { ...init, headers });
  }
}
```

Two notes on that code. The hostname `dataplane.invalid` is deliberate: with a VPC
Service binding the URL's host and port are ignored, so the value is a placeholder and
a reader who tries to "fix" it into a real hostname has misunderstood the mechanism
[A5]. And the fallback uses `CF-Access-Client-Id` and `CF-Access-Client-Secret`
headers, which is the documented service-token shape, with the `cfast_` secret format
in force for new secrets since 2026-08-26 [A5 1.4].

## `queue-pull.sh`

The control-plane to data-plane bridge, from `research/A4-durable-objects-workers.md`
section 2.2. The endpoint and body shape are quoted from Cloudflare's Queues
documentation; the shell wrapper is mine and untested.

```bash
#!/usr/bin/env bash
# Run as a systemd service on each data-plane box. The token needs both
# com.cloudflare.api.account.queues_read and
# com.cloudflare.api.account.queues_write, because acknowledging mutates
# queue state.
set -euo pipefail

ACCOUNT_ID="${CF_ACCOUNT_ID:?set it}"
QUEUE_ID="${CF_QUEUE_ID:?set it}"
TOKEN="${CF_QUEUE_TOKEN:?set it}"

while true; do
  resp="$(curl -qfsS \
    -H "authorization: Bearer ${TOKEN}" \
    -H 'content-type: application/json' \
    -X POST \
    --data '{"visibility_timeout_ms":60000,"batch_size":50}' \
    "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/pull")" \
    || { sleep 5; continue; }

  # Job descriptors live in the message. Payloads live in R2, because the
  # message cap is 128 KB. [A4 2.2]
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

## What these files do not establish

- That any of it runs. Nothing here has been executed.
- The exact remote-configuration field names, which need one read of the live API
  reference.
- That the fallback `AccessHostnameClient` works end to end. C1 open question 7 records
  that whether Access can enforce anything on the Worker-to-VPC-Service hop was not
  tested.
- That a raw TCP tunnel rule carries gRPC plus mTLS, which gates both Woodpecker and
  Talos [D1 Q31].
