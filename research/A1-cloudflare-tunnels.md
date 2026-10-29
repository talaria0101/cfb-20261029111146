# A1 - cloudflared / Cloudflare Tunnel

Research subagent: A1-cloudflare-tunnels
Date all sources were read: 2026-10-29 (UTC)
Gateway used: pkgforge tinyfish (search + read), plus `gh api` for GitHub metadata.
Every figure below comes from a call made on 2026-10-29. Anything I could not verify is marked `unverified`.

---

## 1. Findings

### F1. cloudflared is one Go daemon, Apache-2.0, actively released

**Claim.** The connector is a single open-source Go binary. It is under active development with releases every few days, and Cloudflare only supports versions within one year of the latest.

**Evidence.**
- GitHub `gh api repos/cloudflare/cloudflared`: `full_name: cloudflare/cloudflared`, `description: "Cloudflare Tunnel client"`, `stargazers_count: 16336`, `license: Apache-2.0`, `language: Go`, `open_issues_count: 572`, `pushed_at: 2026-10-29T10:22:59Z`, `size: 42254` (KB), `topics: [cloudflare, cloudflare-tunnel, reverse-proxy, zero-trust-network-access]`. Read 2026-10-29.
- `gh api repos/cloudflare/cloudflared/releases` (first 5): `2026.10.5` published `2026-10-27T13:31:37Z`; `2026.10.4` `2026-10-26`; `2026.10.3` `2026-10-21`; `2026.10.2` `2026-10-20`; `2026.10.1` `2026-10-15`. Read 2026-10-29.
- README (https://raw.githubusercontent.com/cloudflare/cloudflared/master/README.md): "Cloudflare currently supports versions of cloudflared that are **within one year** of the most recent release." Build: `make cloudflared`. Test: `make test`. Lint: `make fmt`, `make lint`. Requirement: `go >= 1.27.3`, plus `capnp`. Read 2026-10-29.
- Deprecation (changelog, 2026-09-18): "Starting in 2027, Cloudflare will deprecate 32-bit Windows and Intel-based macOS builds of cloudflared."

**Label.** [verified]

---

### F2. Architecture: outbound-only, four long-lived connections, two data centers, port 7844, QUIC/HTTP2, TLS 1.3 with post-quantum

**Claim.** cloudflared dials out. It holds four long-lived connections spread across at least two Cloudflare data centers, over UDP/QUIC by default with TCP/HTTP2 fallback, on port 7844. Tunnel connections use TLS 1.3 and post-quantum key exchange by default.

**Evidence.**
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/ (Last updated Aug 4, 2026): "a lightweight daemon in your infrastructure (`cloudflared`) creates outbound-only connections to Cloudflare's global network."
- https://developers.cloudflare.com/tunnel/ (Last updated Sep 11, 2026): "Each tunnel maintains four long-lived connections to two Cloudflare data centers for built-in redundancy." Also: "outbound-only, post-quantum encrypted connection". "Available on all plans."
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/tunnel-useful-terms/ (Last updated Sep 30, 2026): "Each `cloudflared` instance creates four long-lived connections to at least two distinct data centers." Also: "`cloudflared` operates as a secure connector daemon rather than a local reverse proxy. It forwards requests directly to the configured local service without altering request URI paths or performing local load balancing."
- Source code confirmation of the "four": `gh api repos/cloudflare/cloudflared/contents/cmd/cloudflared/tunnel/cmd.go`, an `altsrc.NewIntFlag` with `Name: cfdflags.HaConnections`, `Value: 4`, `Hidden: true`. The `--ha-connections` flag is hidden, default 4.
- Transport selection in source: `gh api repos/cloudflare/cloudflared/contents/connection/protocol.go` defines `ProtocolList = []Protocol{QUIC, HTTP2}`, comment: "Available protocols: 'auto' - starts with QUIC and falls back to HTTP/2 (the default and recommended option); 'quic' - based on QUIC, relying on UDP egress to Cloudflare edge; 'http2' - using Go's HTTP2 library, relying on TCP egress to Cloudflare edge". Edge server names: `h2.cftunnel.com` (HTTP2), `quic.cftunnel.com` (QUIC), `probe.cftunnel.com` (pre-flight checks), legacy `cftunnel.com`. QUIC ALPN is `argotunnel`. QUIC fallback returns HTTP2; HTTP2 has no fallback.
- Port and destinations: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/ (Last updated Oct 12, 2026): "`cloudflared` connects to Cloudflare's global network on port `7844`" over TCP (http2) or UDP (quic), to `region1.v2.argotunnel.com` (198.41.192.0/24 range, 2606:4700:a0::/64) and `region2.v2.argotunnel.com` (198.41.200.0/24, 2606:4700:a8::/64). US region uses `us-region1`/`us-region2`. FedRAMP High uses `fed-region1`/`fed-region2`. SNI-enforcing firewalls also need `_v2-origintunneld._tcp.argotunnel.com`, `cftunnel.com`, `h2.cftunnel.com`, `quic.cftunnel.com`. Optional port 443 egress to `api.cloudflare.com`, `update.argotunnel.com`, `github.com`, `<team>.cloudflareaccess.com` (only if `access` is enabled), `pqtunnels.cloudflareresearch.com` (post-quantum error reporting), and a DNS TXT lookup for `cfd-features.argotunnel.com` to select the QUIC datagram version.
- Cipher suites: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cipher-suites/ (Last updated Apr 17, 2026): "All tunnel connections use TLS 1.3 and post-quantum encryption by default." TLS 1.3 suites: TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256.
- Post-quantum behaviour: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/ (Last updated Apr 17, 2026): "By default, Cloudflare Tunnel connections over `quic` are encrypted using post-quantum cryptography (PQC) but will fall back to non-PQ if there are issues connecting." The `--post-quantum` flag removes the fallback. "Post-quantum key agreements are not supported when using the `http2` protocol."
- Positive security model: same firewall page: "You can implement a positive security model with Cloudflare Tunnel by blocking all ingress traffic and allowing only egress traffic from `cloudflared`. Only the services specified in your tunnel configuration will be exposed to the outside world."

**Label.** [verified]

---

### F3. Two distinct route models: public hostname vs private network route

**Claim.** A tunnel carries two unrelated kinds of route. Published applications map a public hostname to a local service and are internet-facing. Private network routes map a CIDR or private hostname and require the Cloudflare One Client (WARP) on the client side. They have separate limits and separate APIs.

**Evidence.**

Published application (public hostname):
- https://developers.cloudflare.com/tunnel/concepts/routing/ (Last updated Oct 16, 2026): "When you publish an application, you map a public hostname to a local service ... and Cloudflare applies CDN caching, WAF, and DDoS protection before forwarding the request to your origin." "A single remotely-managed tunnel supports roughly 5,000-10,000 published applications. The limit is based on the size of the tunnel configuration, which can be up to 1 MB." "Published applications do not count toward the account limit for routes."
- Same page: adding a route in the dashboard creates a CNAME to `<UUID>.cfargotunnel.com`. "The `cfargotunnel.com` subdomain only proxies traffic for DNS records in the same Cloudflare account. If someone discovers your tunnel UUID, they cannot create a DNS record in another account to proxy traffic through it."
- Same page: "The DNS record and the tunnel are independent. You can create DNS records that point to a tunnel that is not running. If a tunnel stops, the DNS record is not deleted - visitors will see a `1016` error."
- Same page: load balancer treats all replicas of the same tunnel UUID as a single endpoint; use distinct tunnel UUIDs for granular steering. "cloudflared prefers to serve requests using connections in the same data center."

Private network route (CIDR):
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/connect-cidr/ (Last updated Oct 12, 2026): dashboard path Networking > Routes > Create route > Tunnel CIDR. "By default, WARP excludes traffic bound for RFC 1918 space." Users must configure Split Tunnels to send the CIDR through the client. "By default, all devices enrolled in your Zero Trust organization can connect to your private network through Cloudflare Tunnel." Cloudflare recommends a catch-all Gateway block policy for private IP space plus layered Allow policies.
- API: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/ (Last updated Apr 17, 2026): `POST /accounts/{account_id}/teamnet/routes` with body `{"network": "172.16.0.0/16", "tunnel_id": "...", "comment": "..."}`.

Private hostname route (newer, GA 2026-08-11):
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/connect-private-hostname/ (Last updated Oct 20, 2026): route by FQDN instead of IP. "Cloudflare Gateway assigns an initial resolved IP to route the traffic through your tunnel ... By default, this IP is drawn from a Cloudflare-owned public IPv4 range (`172.64.128.0/20`) rather than Carrier-Grade NAT (CGNAT) space, so it does not trigger Google Chrome's Local Network Access restrictions." IPv6 default `2606:4700:0cf1:4000::/64`.
- Minimum connector versions: cloudflared `2025.7.0`; Cloudflare Mesh `2026.6.822.0` (Linux); Cloudflare WAN not supported. On-ramps that work: Cloudflare One Client, PAC files, Browser Isolation, Cloudflare Mesh. Requires the Gateway proxy (TCP and UDP) to be enabled.
- Hostname format: under 255 characters; a single `*` must be a full DNS label; leading wildcards are trimmed and an implicit dot assumed; no partial or middle wildcards.
- Requires cloudflared to resolve the name: default is the host system resolver; a specific internal resolver needs an IP/CIDR route to that resolver plus a Gateway resolver policy with the `- Private` routing option.

Virtual networks:
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/tunnel-virtual-networks/ (Last updated Oct 13, 2026): "Each virtual network maintains its own routing table, allowing you to separate traffic between different environments, partners, or applications." Users pick a VNET in the Cloudflare One Client. Use case is overlapping IP space (for example prod and staging both using 10.128.0.0/24). CLI: `cloudflared tunnel vnet add|list|delete`, `cloudflared tunnel route ip add --vnet <name> <cidr> <tunnel>`.

**Label.** [verified]

---

### F4. Token-based vs cert-based, and what each credential can do

**Claim.** There are two management modes and three credential artefacts. Remotely-managed tunnels are configured in Cloudflare and run with an opaque tunnel token. Locally-managed tunnels are configured by YAML on the host and run with a per-tunnel credentials JSON. A third artefact, `cert.pem`, is an account-wide credential only needed for CLI tunnel administration.

**Evidence.**
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/local-tunnel-terms/ (Last updated Apr 17, 2026): "`cert.pem` ... The `cert.pem` origin certificate is valid for at least 10 years, and the service token it contains is valid until revoked." "Credentials file ... This file functions as a token authenticating the tunnel it is associated with."
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/tunnel-permissions/ (Last updated Apr 17, 2026), comparison table:
  - `cert.pem`: purpose "Authenticates your instance of cloudflared against your Cloudflare account", scope "Account-wide", issued by `cloudflared tunnel login`, "Valid for: At least 10 years, and the service token it contains is valid until revoked", needed to "Manage tunnels (for example, create, route, delete and list tunnels)".
  - `<TUNNEL-UUID>.json`: scope "Tunnel-specific", issued by `cloudflared tunnel create <NAME>`, "Does not expire", needed to "Run a tunnel. Create a config file."
  - "If a user in a Cloudflare account creates a tunnel, any other user in the same account who has access to the `cert.pem` file for the account can delete, list, or otherwise manage tunnels within it."
  - Revocation: delete the "Cloudflare Tunnel API Token" or "Argo Tunnel API Token" under My Profile > API Tokens.
  - Account-scoped roles needed to create/delete/configure tunnels: `Cloudflare Access`. Additional for routing to a public hostname and for `cloudflared login`: `DNS`, `Load Balancer`.
- Config source is an explicit API field: https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/ documents `source: optional "local" or "cloudflare"`, "Indicates if this is a locally or remotely configured tunnel."
- Token retrieval API (same page): `GET /accounts/{account_id}/cfd_tunnel/{tunnel_id}/token` returns a string, "The Tunnel Token is used as a mechanism to authenticate the operation of a tunnel." Also `POST /accounts/{account_id}/cfd_tunnel/{tunnel_id}/management` for a management token.
- Run parameters: `--token <TUNNEL_TOKEN>` / `TUNNEL_TOKEN`, plus `--token-file <PATH>`. Default config path `~/.cloudflared/config.yml`.
- Tunnel creation API returns the credentials inline: `POST /accounts/{account_id}/cfd_tunnel` with `{"name": "api-tunnel", "config_src": "cloudflare"}` returns `credentials_file` containing `AccountTag`, `TunnelID`, `TunnelName`, `TunnelSecret`, plus a `token` string. Source: create-remote-tunnel-api page, read 2026-10-29.
- Token format, from source, not from a blog: `gh api repos/cloudflare/cloudflared/contents/connection/connection.go`, lines 79-104:
  ```go
  // TunnelToken are Credentials but encoded with custom fields namings.
  type TunnelToken struct {
      AccountTag   string    `json:"a"`
      TunnelSecret []byte    `json:"s"`
      TunnelID     uuid.UUID `json:"t"`
      Endpoint     string    `json:"e,omitempty"`
  }
  func (t TunnelToken) Encode() (string, error) {
      val, err := json.Marshal(t)
      ...
      return base64.StdEncoding.EncodeToString(val), nil
  }
  ```
  So a tunnel token is `base64(json({a, s, t, e}))`. It is not a signed JWT and it is not encrypted. The tunnel secret is readable by anyone who obtains the token.

**Label.** [verified]

---

### F5. Ingress rules: first match wins, catch-all mandatory, wildcard and regex limits

**Claim.** Ingress is an ordered list. The first matching rule wins, and a catch-all rule is mandatory. Hostname wildcards are limited to a single leading label; paths are Go regexps. The full request path is forwarded to the origin unchanged.

**Evidence.**
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/ (Last updated Oct 22, 2026): "Configuration files that contain ingress rules must always include a catch-all rule that concludes the file." Example config with `- service: http_status:404`.
- Wildcards: "You can use wildcards to match traffic to multiple subdomains ... `cloudflared` does not support wildcards in the middle of the hostname, such as `test.*.example.com`." Path: "You can also enter regular expressions for the `path` key ... Cloudflare parses the path regex using the Go `syntax` package."
- Path forwarding: local-tunnel-terms page: "`cloudflared` forwards the full request path to the service without stripping or rewriting it."
- Services supported (routing-to-tunnel/protocols page, Last updated Apr 17, 2026): `http://`, `https://`, `unix:`, `unix+tls:`, `tcp://`, `ssh://`, `rdp://`, `smb://`, `http_status:<code>`, `bastion`, `hello_world` (locally-managed only). Non-HTTP services "require installing `cloudflared` on the client for end users to connect."
- IPv6 service addresses must be bracketed: `http://[2001:db8::1]:8000`.
- Origin configuration, from the API reference (developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/): `originRequest` fields are `access` (`audTag`, `teamName`, `required`), `caPool`, `connectTimeout`, `disableChunkedEncoding`, `http2Origin`, `httpHostHeader`, `keepAliveConnections`, `keepAliveTimeout`, `matchSNItoHost`, `noHappyEyeballs`, `noTLSVerify`, `originServerName`, `proxyType` (`""` or `socks`), `tcpKeepAlive`, `tlsTimeout`. The `access` object is described as "For all L7 requests to this hostname, cloudflared will validate each request's Cf-Access-Jwt-Assertion request header."
- Validation and testing commands: `cloudflared tunnel ingress validate` and `cloudflared tunnel ingress rule https://foo.example.com` (prints the first matching rule).
- URL normalization, new in 2026.10.0: "In `cloudflared` version `2026.10.0` and later, you can normalize URLs before matching ingress rules. This improves security for rules that require Cloudflare Access JWT validation." Off by default in 2026.10.0; enable with `--disable-path-normalization=false` or `TUNNEL_DISABLE_PATH_NORMALIZATION=false`. "In three months, starting 2027-01-25, new `cloudflared` releases will turn on URL normalization by default." Normalization removes RFC 3986 dot segments, converts backslashes to forward slashes, and merges repeated slashes. The path sent to the origin is unchanged.
- Default without a config file: "In the absence of a configuration file, `cloudflared` will proxy outbound traffic through port `8080`."

**Label.** [verified]

---

### F6. Service tokens: header pair, new secret format, strict mode is now forced on new orgs

**Claim.** Machine-to-machine auth to an Access-protected app uses a Client ID and Client Secret sent as two headers. As of 2026-08-26 new secrets use a `cfast_` prefixed format. Zero Trust organizations created on or after 2026-10-05 have strict service token authentication enabled and cannot turn it off.

**Evidence.**
- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/ (Last updated Oct 2, 2026).
- Headers: "`CF-Access-Client-Id: <CLIENT_ID>`" and "`CF-Access-Client-Secret: <CLIENT_SECRET>`".
- Secret format: "As of August 26, 2026, new service token Client Secrets use the format `cfast_[40 alphanumeric characters][8-character checksum]`. ... Existing Client Secrets use a 64-character hexadecimal format. These secrets continue to work and do not require rotation."
- Single-header option: `read_service_tokens_from_header` on the Access application, example value `"Authorization"`, request body `{"domain": "app.example.com", "type": "self_hosted", "read_service_tokens_from_header": "Authorization"}`.
- Strict service token authentication: "Zero Trust organizations created on or after `2026-10-05` have strict service token authentication turned on by default and cannot turn it off." Effects when on: failures return 401/403 rather than a 302 to the login page; "Only Service Auth policies can authorize the request. Access ignores Allow policies and any `CF_Authorization` cookie sent with the request"; "Access does not return a `CF_Authorization` cookie to the client after successful authentication."
- API: `POST /accounts/{account_id}/access/service_tokens` with `{"name": "...", "duration": "8760h"}`. Rotation: `POST .../service_tokens/{id}/rotate` with `previous_client_secret_expires_at` (grace period 1 hour to 30 days). Refresh: `POST .../service_tokens/{id}/refresh`. Org settings: `PATCH /accounts/{account_id}/access/organizations` with `strict_service_token_auth` and `service_token_inactivity`.
- Account limit: 50 service tokens per account (see F9).

**Label.** [verified]

---

### F7. How an origin behind a tunnel trusts that the request came through Access

**Claim.** Access injects a signed JWT. The origin either validates it itself against a rotating public key, or delegates validation to cloudflared via the `access` originRequest setting.

**Evidence.**
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/ (Last updated May 6, 2026): "When Cloudflare sends a request to your origin, the request will include an application token as a `Cf-Access-Jwt-Assertion` request header. Requests made through a browser will also pass the token as a `CF_Authorization` cookie." "We recommend validating the `Cf-Access-Jwt-Assertion` header instead of the `CF_Authorization` cookie, since the cookie is not guaranteed to be passed."
- Key endpoint: `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/certs`, returning `keys` (JWK), `public_cert` (PEM), `public_certs` (both PEM). "By default, Access rotates the signing key every 6 weeks. ... Previous keys remain valid for 7 days after rotation."
- AUD tag is per-application and stable: "The AUD tag will never change unless you delete or recreate the Access application."
- cloudflared-side validation: the API reference `originRequest.access` object ("cloudflared will validate each request's Cf-Access-Jwt-Assertion request header") and the self-hosted app page: "One option is to configure the Cloudflare Tunnel daemon, `cloudflared`, to validate the token on your behalf. This is done by enabling **Protect with Access** in your Cloudflare Tunnel settings."
- Cost of enabling it: the firewall page lists `<your-team-name>.cloudflareaccess.com` on port 443 as an optional egress dependency, "Only required if the `access` setting is enabled." So cloudflared needs outbound 443 to the Access team domain to fetch keys.
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/ (Last updated Apr 17, 2026): "Token validation ensures that any requests which bypass Cloudflare Access (for example, due to a network misconfiguration) are rejected." Also "All Access applications are deny by default."

**Label.** [verified]

---

### F8. Workers VPC is the supported path for a Worker SPA to reach a private service

**Claim.** A Worker running on Cloudflare can reach a service behind a tunnel through a VPC Service binding, without exposing the service publicly. HTTP services use `fetch()`, TCP services (PostgreSQL, MySQL) are used with Hyperdrive. Verification of the origin's TLS is configurable.

**Evidence.**
- https://developers.cloudflare.com/workers-vpc/ (Last updated Oct 12, 2026): "Available on Free and Paid plans". "VPC Services let you bind to a specific host and port in your private network. Connect a Cloudflare Tunnel to your infrastructure, register each target as a VPC Service, and use the binding API from your Worker." "VPC Networks give Workers broader access - bind to an entire Cloudflare Tunnel, Cloudflare Mesh network, or Cloudflare WAN on-ramp (GRE, IPsec, CNI) without pre-registering individual hosts." "The same binding can also egress to public Internet destinations through Cloudflare Gateway, with your Zero Trust policies and logs applied."
- https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/ (Last updated Oct 12, 2026). A VPC Service has: `type` (`http` or `tcp`), `tunnel_id`, host as `ipv4`/`ipv6` or `hostname` with `resolver_network` (`tunnel_id` + optional `resolver_ips`), `http_port`/`https_port` (default 80/443), `tcp_port` (required for tcp), `app_protocol` (`postgresql` or `mysql`), `tls_settings.cert_verification_mode`.
  - "VPC Services enforce that requests are routed to their intended service without exposing the entire network, securing your workloads and preventing server-side request forgery (SSRF)."
  - "Requests are encrypted in flight until they reach your network via a tunnel, regardless of the scheme used in the URL provided to `fetch`. If the `http` scheme is used, a plaintext connection is established to the service from the tunnel."
  - TLS verification modes: `verify_full` (default, chain + hostname), `verify_ca` (chain only), `disabled`.
  - Trusted certificate types: "Publicly trusted certificates" and "Cloudflare Origin CA certificates". Anything else fails the handshake and `fetch()` throws.
  - "When Workers VPC is unable to establish a connection to your service, `fetch()` will throw an exception."
  - Roles: `Connectivity Directory Read` (view), `Connectivity Directory Bind` (list/read/bind in Workers), `Connectivity Directory Admin` (create/update/delete, and bind directly to a tunnel through a VPC Network binding).
- Binding shape (wrangler):
  ```json
  { "vpc_services": [ { "binding": "PRIVATE_API", "service_id": "e6a0817c-...", "remote": true } ] }
  ```
  Multiple bindings are supported. `remote: true` uses remote bindings so the service is reachable during local development.
- Example REST payloads given on that page include an HTTP service with both ipv4 and ipv6 and a custom port set, an HTTP service with hostname plus `resolver_network`, and a TCP PostgreSQL service on port 5432.
- https://developers.cloudflare.com/workers-vpc/configuration/tunnel/ (Last updated Apr 22, 2026): "Cloudflare Tunnels can be created one of two ways: 1. **Remotely-managed tunnels (recommended):** ... 2. **Locally-managed tunnels:** ... For Workers VPC, we recommend creating a remotely-managed tunnel through the dashboard."
- Traffic attribution (Cloudflare Tunnel changelog, 2026-09-29): the `zero_trust_network_sessions` Logpush dataset now carries `OnrampType` (values include `CF1_CLIENT`, `MESH`, `WORKERS_VPC`, `MAGIC`, `OTHER`), `Offramp`, `SourceName`, `SourceID`, `DestinationTunnelID`, `DestinationReplicaID`. `cloudflared tail --connector-id` streams a specific replica's logs.

**Label.** [verified]

---

### F9. Limits, all from the primary limits page

**Claim.** The account-level ceilings are documented and were raised substantially in October 2026.

**Evidence.** https://developers.cloudflare.com/cloudflare-one/account-limits/ (Last updated Oct 16, 2026):

Cloudflare Tunnel:
| Feature | Limit |
| --- | --- |
| `cloudflared` tunnels per account | 1,000 |
| Routes (CIDR routes + Hostname routes) per account | 50,000 (shared with Cloudflare Mesh) |
| Published applications per tunnel | Limited by 1 MB configuration size |
| Active `cloudflared` replicas per tunnel | 25 |
| Virtual networks per account | 1,000 |

Access:
| Feature | Limit |
| --- | --- |
| Applications | 500 |
| Service tokens | 50 |
| mTLS root certificates | 50 |
| Identity providers | 50 |
| Reusable policies | 500 |
| Rules per application | 1,000 |
| Domains per application | 50 |
| Infrastructure targets | 5,000 |
| Rules per rule group | 1,000 |
| Email addresses per rule | 1,000 |
| IP addresses per rule | 1,000 |

Gateway (selected): DNS / Network / HTTP / Egress / Resolver policies 500 each; proxy endpoints 50 (Standard) or 500 (Enterprise); concurrent streams for HTTP/2 connections 256.

Application Library: custom applications per account 50 (Zero Trust Free), 50 (Pay-as-you-go), 100 (Enterprise).

Certificates: active certificates 10; certificates generated per day 3; custom certificates 5.

Cloudflare One Client: combined Split Tunnel and Local Domain Fallback entries per device profile 1,000; device IP profiles per account 30.

Character limits include: application URL 63, team domain 63, target name 255, Gateway API policy expression 140,000.

Route limit change (changelog 2026-10-16): "The default limit for routes is now 50,000 per account, up from 1,000."

Connection ceiling: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/deploy-replicas/ (Last updated Apr 17, 2026): "You can run the same tunnel across various `cloudflared` processes for up to 100 connections (25 replicas) per tunnel." That is 4 connections x 25 replicas, consistent with the `ha-connections` default of 4 in F2.

**Label.** [verified]

---

### F10. Capacity planning numbers are published and are port-bound, not CPU-bound

**Claim.** cloudflared throughput is limited by ephemeral ports, not by CPU or memory. Cloudflare publishes a sizing model and concrete saturation thresholds.

**Evidence.** https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/system-requirements/ (Last updated Apr 17, 2026):
- "Cloudflare Tunnel throughput is primarily limited by the number of ports configured in system software."
- Baseline: "Run a `cloudflared` replica on two dedicated host machines per network location"; "Size each host with minimum 4GB of RAM and 4 CPU cores"; "Allocate 50,000 ports to the `cloudflared` process on each host." "This setup is usually sufficient to handle traffic from 8,000 Cloudflare One Client users (4,000 per host)."
- Port allocation: `net.ipv4.ip_local_port_range = 11000 60999` via `/etc/sysctl.d/99-cloudflared.conf`.
- ulimits: `-n` (open files) >= 70,000.
- Saturation math: "in order to overload a `cloudflared` instance with 50,000 available ports, your organization would need to continuously generate 50,001 TCP requests per second." For UDP: "DNS queries - usually the bulk of UDP traffic - are held by ports in `cloudflared` for five seconds ... you would need to continuously generate either 10,000 DNS queries to your private resolver per second, or a cumulative 50,000 non-DNS UDP requests over a shorter time than your connection reset rate."
- "DNS queries utilize more system resources compared to TCP and non-DNS UDP requests. To optimize service availability, Cloudflare recommends splitting private DNS traffic into its own Cloudflare Tunnel."
- Metrics to query for sizing: `cloudflared_tcp_total_sessions`, `cloudflared_udp_total_sessions`.

Metrics endpoint (monitor-tunnels/metrics page, Last updated Apr 17, 2026): Prometheus server on `127.0.0.1:20241`-`20245` in non-containerized environments, `0.0.0.0:<PORT>` in Docker/Kubernetes; override with `--metrics <IP:PORT>`. Notable series: `cloudflared_tunnel_concurrent_requests_per_tunnel`, `cloudflared_tunnel_ha_connections`, `cloudflared_tunnel_server_locations` (labelled by `connection_id`, `edge_location`), `cloudflared_tunnel_total_requests`, `cloudflared_tunnel_request_errors`, `quic_client_latest_rtt`, `quic_client_lost_packets`, `build_info`.

**Label.** [verified]

---

### F11. CVEs: two, both local privilege escalation, both Windows-only, both old

**Claim.** The public CVE record for cloudflared itself is small and does not include a network-reachable remote code execution.

**Evidence.**
- NVD CPE search, run 2026-10-29: `curl --get "https://services.nvd.nist.gov/rest/json/cves/2.0" --data-urlencode "virtualMatchString=cpe:2.3:a:cloudflare:cloudflared" --data-urlencode "resultsPerPage=50"` returned `totalResults: 2`:
  - `CVE-2020-24356`, published 2020-10-02, scores 6.4 / 7.8: "cloudflared versions prior to 2020.8.1 contain a local privilege escalation vulnerability on Windows systems."
  - `CVE-2023-1314`, published 2023-03-21, scores 7.5 / 7.8: "A vulnerability has been discovered in cloudflared's installer (<= 2023.3.0) for Windows 32-bits devices that allows a local attacker with no administrative permissions to escalate their privileges ... The cloudflared client itself is not affected by this vulnerability, only the installer for 32-bit Windows devices."
- GitHub advisory API, run 2026-10-29: `gh api repos/cloudflare/cloudflared/security-advisories` returned length 2, matching exactly those two (`GHSA-hgwp-4vp4-qmm2` / CVE-2020-24356, medium; `GHSA-7mjv-x3jf-545x` / CVE-2023-1314, high).
- NVD keyword search for "Cloudflare Tunnel" returned 2 results, neither of which is cloudflared (CVE-2026-28798 in ZimaOS, CVE-2026-79766 in Termix). This is a negative result worth recording: no third-party product CVE names Cloudflare Tunnel as the affected component in NVD's keyword index as of 2026-10-29.

**Label.** [verified]

---

### F12. Operational security notes that matter for a self-hosted design

**Claim.** The residual risk in this design is credential handling and misconfiguration, not a vulnerability in the daemon.

**Evidence and notes.**
- The tunnel token is a bearer credential containing the tunnel secret in plaintext base64 (F4). Anyone who reads `TUNNEL_TOKEN` from a process list, a systemd unit, or a container environment can run that tunnel. Cloudflare's own docs pass it on a command line (`docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TUNNEL_TOKEN>`) and in a systemd `ExecStart`, so the operator must decide where it lives. Prefer `--token-file` or `TUNNEL_TOKEN_FILE`.
- `cert.pem` is account-wide and long-lived (>= 10 years). Do not distribute it to machines that only need to run a tunnel; give them the per-tunnel credentials file or a token instead. This is exactly what the Tunnel permissions page advises.
- `cfargotunnel.com` only proxies for DNS records in the same account (F3), so a leaked UUID is not by itself a hijack. But the tunnel UUID plus a DNS record the attacker controls in your zone is, so protect DNS write access.
- Debug logging leaks headers: run-parameters page for `--loglevel debug`: "cloudflared will log and display the request URL, method, protocol, content length, as well as all request and response headers. However, note that this can expose sensitive information in your logs."
- Auto-update can drop live connections: "The updater does not wait for the replacement process to connect to Cloudflare before shutting down the old process. Active connections may be interrupted." Auto-update is unavailable on Windows, on package-manager installs, and for interactive terminal runs.
- One service instance per host: "Only a single instance of `cloudflared` may run as a service on any given machine." Additional replicas must be separate hosts or separate processes with distinct configs.
- Quick Tunnels are unauthenticated by default: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ (Last updated Sep 30, 2026): "Anyone with the URL can access your local service." Limits: "Each Quick Tunnel supports up to 200 in-flight requests. Additional requests return a `429` response." "Quick Tunnels do not support Server-Sent Events (SSE)." Email auth via `--allowed-mail` requires an interactive browser and "does not support non-interactive clients." Code confirms quick tunnels deliberately use one connection: `gh api repos/cloudflare/cloudflared/contents/cmd/cloudflared/tunnel/quick_tunnel.go` contains `_ = sc.c.Set(flags.HaConnections, "1")` with the comment "Quick tunnels shouldn't be used for production usage".
- URL normalization default flips on 2027-01-25 (F5). This is a scheduled behaviour change that can change which ingress rule matches. Test path-based routing before that date.
- Chrome 142 Local Network Access interacts with private hostname routing (F3). Accounts still on a CGNAT initial resolved IP range will see browser prompts.
- cloudflared is a known abuse vector for ransomware persistence. Bushido's Ransomware Tool Matrix lists BlackSuit, Royal, Akira, Scattered Spider and Medusa as using Cloudflared tunnels, per https://www.sudorem.dev/blog/cloudflared/ (read 2026-10-29). This is a secondary source (a vendor blog), not a primary one, so the specific group attributions are `unverified`. The detection technique described there is sound and matches the code: decode the base64 token and read the `a` field. For this project the implication is that a cloudflared binary on the operator's own machines is indistinguishable from an attacker's at the network level, so endpoint-level inventory and egress allowlisting (F2) are the controls.
- Granular roles exist now: changelog 2026-10-22, "Cloudflare Tunnel - Granular Connector cloudflared Read And Monitor" is GA, granting read plus remote log streaming for specific tunnels without write access.

**Label.** Mostly [verified]. The ransomware group attributions in the last bullet are [unverified] (secondary source).

---

### F13. Alternatives and how they compare

**Claim.** Cloudflare Tunnel is unusual in that it needs no public IP and no self-run control plane, at the cost of depending on Cloudflare's dashboard and API for configuration and on a Cloudflare-hosted zone. Self-hosted alternatives give up that and require a public IP and a self-run control plane.

**Evidence.** GitHub metadata, all read 2026-10-29 via `gh api`:

| Project | Stars | License | Language | Open issues | Last push | Latest release |
| --- | --- | --- | --- | --- | --- | --- |
| cloudflare/cloudflared | 16336 | Apache-2.0 | Go | 572 | 2026-10-29T10:22:59Z | 2026.10.5, 2026-10-27 |
| fatedier/frp | 110282 | Apache-2.0 | Go | 33 | 2026-10-23T07:52:16Z | v0.71.1, 2026-10-14 |
| juanfont/headscale | 45164 | BSD-3-Clause | Go | 152 | 2026-10-29T11:28:12Z | not queried |
| tailscale/tailscale | 38284 | BSD-3-Clause | Go | 4818 | 2026-10-29T07:35:39Z | v1.104.4, 2026-10-28 |
| rathole-org/rathole (redirects from rapiz1/rathole) | 14382 | Apache-2.0 | Rust | 98 | 2026-08-23T15:38:44Z | v0.5.0, 2023-10-01 (dev-latest 2026-08-22) |
| ekzhang/bore | 11562 | MIT | Rust | 18 | 2026-02-04T18:00:26Z | v0.6.0, 2025-06-09 |

Comparison notes:
- **frp** (README at https://raw.githubusercontent.com/fatedier/frp/master/README.md, read 2026-10-29): requires `frps` on a machine with a public IP and `frpc` in the LAN. Config is TOML. Proxy types: `tcp`, `udp`, `http`, `https`, `stcp` (preshared-key secret TCP), `xtcp` (P2P with a STUN hole punch, "may not work with all types of NAT devices"), `tcpmux` (HTTP Connect multiplexing so several clients share one port). Plugins include `unix_domain_socket`, `static_file`, `https2http`. The README notes antivirus often flags `frpc` as malware. No built-in identity layer, no CDN, no WAF.
- **rathole**: Rust, "A lightweight and high-performance reverse proxy for NAT traversal ... An alternative to frp and ngrok." Last stable release v0.5.0 is from 2023-10-01, which is old relative to its 2026-08-22 `dev-latest` tag. Sizing a production system on the stable channel alone would need checking.
- **bore**: minimal, "a simple CLI tool for making tunnels to localhost". No release since 2025-06-09.
- **tailscale/tailscale** plus **juanfont/headscale**: a WireGuard mesh, not an L7 reverse proxy. headscale is "An open source, self-hosted implementation of the Tailscale control server". This solves device-to-device connectivity, not publishing a hostname with WAF in front.
- **Cloudflare Mesh** (https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/concepts/, Last updated Sep 16, 2026) is the in-family alternative, not a replacement: "Cloudflare Mesh connects your services and devices with post-quantum encrypted networking." Every participant gets a Mesh IP from `100.96.0.0/12`. Mesh nodes are Linux servers running the Cloudflare One Client in headless mode. The docs' own comparison: Mesh is bidirectional, every participant gets an IP, protocols are TCP/UDP/ICMP, connector is `warp-cli`; Tunnel is inbound-to-origin, server-side only, protocols are HTTP/S, TCP, SSH, RDP, SMB over WebSocket, connector is `cloudflared`. "Use Mesh when devices need to reach each other by private IP, or when your workload requires stable, long-lived TCP connections ... Use Tunnel when you want to publish services by hostname or proxy traffic to specific IP ranges through `cloudflared`." Mesh requires MASQUE (the default client protocol); on WireGuard some capabilities are lost. Mesh nodes per account: 50.
- **ngrok** (https://ngrok.com/pricing, read 2026-10-29), the closest commercial analogue and the one self-hosted alternatives are usually compared against. Free: $0, 3 online endpoints, 1 GB transfer, 20k HTTP/S requests, interstitial page. Hobbyist: $10/month, 3 endpoints, 5 GB, 100k requests. Pay-as-you-go: $20/month plus usage, unlimited endpoints, then $0.10/GB data transfer out, $1 per 100k HTTP/S requests, $0.02 per active endpoint hour, $0.01 per active hour for a custom domain, $0.27 per domain per active hour for bring-your-own certificates, $0.10 per 100k traffic policy units, $1 per traffic identity MAU beyond 5, $0.25 per 2k exported traffic log events. Rate limits: 20k HTTP requests/minute and 600 TCP connections/minute on Pay-as-you-go.

**Label.** [verified] for the metadata table and for the frp, Mesh and ngrok figures. [unverified] for any relative performance claim between these projects; I ran no benchmarks.

---

### F14. Pricing

**Claim.** The tunnel itself costs nothing on any plan. The only tunnel-specific charge found is for exceeding 1,000 tunnels per account.

**Evidence.**
- https://developers.cloudflare.com/tunnel/ (Last updated Sep 11, 2026): "Available on all plans."
- https://developers.cloudflare.com/tunnel/features/tunnels-for-platforms/ (Last updated Oct 16, 2026): "Tunnels for Platforms costs $4.50 per additional tunnel per month. The first 1,000 tunnels in every account remain included at no cost." "Every tunnel that exists in your account counts toward your limit. This includes tunnels that are inactive or have no connected `cloudflared` replicas." "Changes do not delete any existing tunnels. If your limit drops below the number of tunnels in your account, existing tunnels continue to work. Cloudflare blocks new tunnel creation until you delete enough tunnels or purchase more capacity." Related limits restated: 50,000 routes per account, 1,000 virtual networks, 25 replicas per tunnel.
- https://developers.cloudflare.com/workers-vpc/: "Available on Free and Paid plans."
- `unverified`: the per-seat price of Cloudflare One / Zero Trust plans. https://www.cloudflare.com/plans/zero-trust-services/ rendered as a SASE marketing page with no seat prices in the text extraction ("Looking for Cloudflare One plans? ... Contact us to learn more about SASE packaging options. Talk to an expert ... Start a proof of concept with our free plan today."). I did not find a primary Cloudflare page stating a dollar seat price on 2026-10-29, so I am not quoting one. Third-party pages quoted $7 per user but those are secondary and I did not read them as primary sources.
- `unverified`: Cloudflare Tunnel for SASE pricing. The product appears in the Cloudflare changelog product list (https://developers.cloudflare.com/changelog/product/cloudflare-tunnel-sase/) but the dedicated page returned HTTP 422 through the reader on 2026-10-29.

**Label.** [verified] for the $4.50 figure and the "all plans" availability. [unverified] for seat pricing and for Tunnel for SASE pricing.

---

## 2. What this changes for the spec

1. **Use remotely-managed tunnels with `config_src: cloudflare`, never locally-managed, for anything the dashboard has to manage.** The dashboard and API can only edit the ingress rules of a remotely-managed tunnel (`source: "cloudflare"`). A locally-managed tunnel's config lives in a YAML file on the operator's machine and is invisible to the control plane. Cloudflare's own Workers VPC page recommends remotely-managed. The one thing you lose is the ability to edit config without the API, which is the point.

2. **The control plane talks to the tunnel through three API surfaces, and they are not interchangeable.** `POST/GET/PATCH/DELETE /accounts/{id}/cfd_tunnel` for the tunnel object, `PUT /accounts/{id}/cfd_tunnel/{id}/configurations` for ingress rules and origin settings, and `POST /accounts/{id}/teamnet/routes` for private network routes. Published applications live in the first two; private networks live in the third. Build the orchestration layer against all three, and note the CIDR-encoded route endpoints were removed on 2026-10-05, so any code copied from older tutorials will 404.

3. **Two separate auth mechanisms, and the spec needs both.** For a human browser hitting the SPA, Cloudflare Access with an IdP. For the SPA's server side reaching a private service, a service token in `CF-Access-Client-Id` / `CF-Access-Client-Secret`, or a Workers VPC binding if the caller is itself a Worker. These are different code paths and different credentials. Also note that orgs created on or after 2026-10-05 have strict service token auth forced on: no `CF_Authorization` cookie is issued, so any client that relies on cookie-based auth to a service-token-protected app is broken by design and must resend headers per request.

4. **If the SPA is a Worker and the data plane is behind a tunnel, Workers VPC Service bindings are the designed path, not a public hostname.** A VPC Service pins one host and port behind one tunnel, which also gives SSRF containment. The TLS story needs a decision up front: only publicly-trusted or Cloudflare Origin CA certificates are trusted by default, so either issue Origin CA certs for internal services or set `cert_verification_mode` to `verify_ca` / `disabled` deliberately. Do not default to `disabled`.

5. **Keep the tunnel token out of the process environment and command line.** The token is `base64(json)` containing the tunnel secret in cleartext (verified in `connection/connection.go`). It is a bearer credential. Use `--token-file` / `TUNNEL_TOKEN_FILE`, mount it read-only, and do not log it. Never hand out `cert.pem`, which is account-wide and valid at least 10 years.

6. **Budget for 4 connections per replica and 25 replicas per tunnel, and size for ports not CPU.** Four long-lived connections per `cloudflared` process is a hard default in the code, and the documented capacity model is 50,000 ephemeral ports per host, 4 GB RAM and 4 cores, `ulimit -n >= 70000`. If the data plane runs long-lived container streams or private DNS, plan separate tunnels and separate hosts; Cloudflare explicitly recommends a dedicated tunnel for private DNS.

7. **Split routes by type, and remember the limits differ.** 50,000 private routes per account (CIDR plus hostname, shared with Mesh) but only 1 MB of ingress config per tunnel, roughly 5,000 to 10,000 published applications. If the design has many published hostnames, shard them across tunnels rather than growing one config. 1,000 tunnels per account are free; past that it is $4.50 per tunnel per month, and inactive tunnels still count.

8. **Prefer private hostname routes over CIDR routes where the target has an ephemeral IP.** Hostname routing went GA on 2026-08-11, needs cloudflared >= 2025.7.0 and the Gateway TCP/UDP proxy enabled, and resolves to `172.64.128.0/20`. CIDR routing is the fallback when you actually want to expose a subnet. Virtual networks (1,000 per account) exist specifically for overlapping IP space, which is likely if the operator runs more than one environment.

9. **Turn on `--disable-path-normalization=false` now rather than waiting for 2027-01-25.** Normalization is off by default in 2026.10.0 and flips on by default on 2027-01-25. It only changes which ingress rule matches for tunnels with Access-validation rules, but it is a silent behaviour change if you have path-based routing. Testing it early is cheaper than debugging it in January.

10. **Put a catch-all `http_status:404` at the end of every ingress list.** It is mandatory for locally-managed configs and the API rejects configurations without a final catch-all. It also means an unmatched hostname gets a clean 404 from cloudflared rather than a connection to whatever the previous rule pointed at.

11. **Treat cloudflared on the operator's own machines as a supply-chain and detection problem.** The binary is Apache-2.0 and buildable from source (`make cloudflared`, Go >= 1.27.3), so it can be built and pinned internally. Because the same binary is a known ransomware persistence tool, egress allowlisting to `region1/region2.v2.argotunnel.com` on 7844 plus an inventory of every host running it is the control that makes a rogue instance visible.

12. **For alternatives, the honest comparison is not "which is faster".** cloudflared is the only option in the table that needs no public IP, no self-run control plane, and puts CDN/WAF/DDoS in front of the origin, and it is free on all plans. frp, rathole and bore all need a public IP for the server component and give you no identity layer. Tailscale plus headscale solves a different problem (mesh connectivity, not L7 publishing). ngrok is the closest commercial analogue and is metered at $0.10/GB, $1 per 100k requests and $0.02 per active endpoint hour. Given the constraint that the control plane must live on Cloudflare anyway, replacing cloudflared would mean giving up the dashboard integration for no cost saving.

---

## 3. Not covered / open questions

1. **Cloudflare One seat pricing.** Not established from a primary source on 2026-10-29. The Zero Trust plans page rendered without seat prices. Any figure in the spec must come from the operator's own Cloudflare dashboard or account team. [unverified]

2. **Cloudflare Tunnel for SASE pricing and exact scope.** The product exists in the changelog taxonomy but the dedicated docs page returned HTTP 422 through the reader. Its relationship to standard Tunnel (whether it is a packaging change or a different connector) is not established. [unverified]

3. **Actual throughput and latency of cloudflared under this project's workload.** Not measured. The published numbers are port-based capacity ceilings, not throughput figures. Any "requests per second" number in the spec needs a benchmark on the operator's own hardware.

4. **QUIC vs HTTP2 behaviour on the operator's specific networks.** The docs say `auto` prefers QUIC and falls back to HTTP2 when UDP is blocked, but I did not test which path a given ISP or firewall will take, nor the latency difference between them.

5. **Whether the 1 MB configuration limit is enforced per tunnel or per account.** The docs say per tunnel ("Published applications per tunnel: Limited by 1 MB configuration size" and "A single remotely-managed tunnel supports roughly 5,000-10,000 published applications"), but the exact enforcement point (API rejection size, dashboard warning, silent truncation) is not documented.

6. **Rate limits on the Cloudflare Tunnel API itself.** The Tunnels for Platforms page mentions "The Cloudflare API also applies rate limits" and advises exponential backoff for 429 and 5xx, but I found no published numeric rate limit for `cfd_tunnel` endpoints. For an orchestration layer creating tunnels at scale this is a gap. [unverified]

7. **Access application limits versus the design.** 500 Access applications and 50 service tokens per account. Whether the design needs one Access application per published hostname or can share one across hostnames with path rules is a design decision I could not resolve from the docs alone.

8. **Client-to-Tunnel for long-lived TCP.** The protocols page says "For long-lived connections, use Client-to-Tunnel instead" for TCP and SSH services, but I did not read the Client-to-Tunnel documentation. If the design needs long-lived TCP streams to containers, this is a required follow-up.

9. **Post-quantum key exchange details.** The docs state PQC is used by default over QUIC and is unsupported over HTTP2, but the specific algorithm and key sizes are not in the pages I read. If the spec makes a cryptographic claim, it needs the algorithm from Cloudflare directly.

10. **Cloudflare Mesh limits in depth.** I read the concepts page (50 mesh nodes per account, 100.96.0.0/12 Mesh IPs, MASQUE requirement) but not the Mesh best-practices or high-availability pages. If the design uses Mesh as well as Tunnel, those are unread.

11. **Whether the operator's existing zone can host the tunnel DNS.** The README states a website on Cloudflare with Cloudflare nameservers is still a prerequisite "for legacy reasons". A partial CNAME setup works but requires manually creating CNAMEs at the external DNS provider pointing at `<HOSTNAME>.cdn.cloudflare.net`. Which setup the operator has determines whether the dashboard can create DNS records automatically.

12. **Any remote-exploit CVE in cloudflared released after 2026-10-29.** The NVD and GitHub advisory queries are a point-in-time snapshot. The absence of a network-reachable CVE is a statement about the record on 2026-10-29, not a guarantee.

---

## Sources read (all 2026-10-29)

Primary, developers.cloudflare.com:
- /cloudflare-one/networks/connectors/cloudflare-tunnel/
- /tunnel/
- /tunnel/concepts/routing/
- /tunnel/features/tunnels-for-platforms/
- /tunnel/get-started/quick-tunnels/
- /cloudflare-one/account-limits/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/tunnel-useful-terms/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/local-tunnel-terms/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/tunnel-permissions/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cipher-suites/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/system-requirements/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/deploy-replicas/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/connect-cidr/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/connect-private-hostname/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/tunnel-virtual-networks/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/protocols/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/monitor-tunnels/metrics/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/connectivity-prechecks/
- /cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/
- /cloudflare-one/access-controls/service-credentials/service-tokens/
- /cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- /cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- /cloudflare-one/networks/connectors/cloudflare-mesh/concepts/
- /workers-vpc/
- /workers-vpc/configuration/vpc-services/
- /workers-vpc/configuration/tunnel/
- /api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/
- /changelog/product/tunnel/
- /changelog/product-group/cloudflare-one/2/

Primary, GitHub (via `gh api` and raw.githubusercontent.com):
- cloudflare/cloudflared (repo metadata, releases, tags, security-advisories, README.md, cmd/cloudflared/tunnel/cmd.go, cmd/cloudflared/tunnel/quick_tunnel.go, cmd/cloudflared/tunnel/subcommand_context.go, connection/connection.go, connection/protocol.go, connection/quic_config.go, credentials/credentials.go, component-tests/test_pq.py)
- fatedier/frp (metadata, releases, README.md)
- tailscale/tailscale, juanfont/headscale, rathole-org/rathole, ekzhang/bore (metadata and releases)

Other:
- https://services.nvd.nist.gov/rest/json/cves/2.0 (CPE and keyword queries for cloudflared / Cloudflare Tunnel)
- https://ngrok.com/pricing
- https://www.cloudflare.com/plans/zero-trust-services/ (rendered without seat prices)
- https://www.sudorem.dev/blog/cloudflared/ (secondary source, ransomware abuse context)

Gateway calls were made through `https://search.web.pkgforge.dev/search?q=...&provider=tinyfish` and `https://read.web.pkgforge.dev/?url=...&provider=tinyfish`. No fallback to the built-in web_search or web_fetch tools was needed; every page above was retrieved through the tinyfish gateway or through `gh api`.
