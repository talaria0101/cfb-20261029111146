# A5 - Cloudflare Zero Trust, Access, and VPC connectivity

Topic: A5-zero-trust-vpc
Read date for every source below: 2026-10-29 (UTC, read from the host with `date -u`).
Method: all research went through the pkgforge tinyfish gateway
(`https://search.web.pkgforge.dev/search?...&provider=tinyfish` and
`https://read.web.pkgforge.dev/?url=...&provider=tinyfish`) plus the authenticated
GitHub API via `gh`. No fallback to built-in web_search/web_fetch was needed.
The very first search call returned HTTP 503; I retried once after a 5 s sleep and
it succeeded, so no fallback call was made.
Where the Cloudflare docs page states a "Last updated" date, it is quoted in the
evidence line.

Primary sources read (all fetched 2026-10-29):
- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/ (Last updated Oct 2, 2026)
- https://developers.cloudflare.com/changelog/post/2026-10-02-strict-service-token-authentication/ (Oct 2, 2026)
- https://developers.cloudflare.com/workers-vpc/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/ (Last updated Oct 15, 2026)
- https://developers.cloudflare.com/workers-vpc/api/ (Last updated Sep 16, 2026)
- https://developers.cloudflare.com/workers-vpc/platform/limits/ (Last updated Sep 16, 2026)
- https://developers.cloudflare.com/workers-vpc/platform/pricing/ (Last updated Sep 16, 2026)
- https://developers.cloudflare.com/workers-vpc/get-started/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/workers-vpc/configuration/tunnel/ (Last updated Apr 22, 2026)
- https://developers.cloudflare.com/workers-vpc/examples/private-api/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/workers-vpc/reference/troubleshooting/ (Last updated Sep 29, 2026)
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/tunnel-virtual-networks/ (Last updated Oct 13, 2026)
- https://developers.cloudflare.com/cloudflare-one/networks/virtual-networks/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/mutual-tls-authentication/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/cloudflare-one/account-limits/ (Last updated Sep 4, 2026)
- https://developers.cloudflare.com/cloudflare-one/ (Last updated Sep 16, 2026)
- https://developers.cloudflare.com/changelog/post/2026-02-17-product-name-updates/ (Feb 17, 2026)
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/concepts/ (Last updated Sep 16, 2026)
- https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/download/ (Last updated Sep 28, 2026)
- https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/user-side-certificates/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/cloudflare-one/reusable-components/posture-checks/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/cloudflare-wan/ (Last updated Aug 24, 2026)
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/self-hosted-private-app/ (Last updated Oct 12, 2026)
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/infrastructure-apps/ (Last updated Oct 14, 2026)
- https://developers.cloudflare.com/cloudflare-one/api-terraform/ (Last updated Apr 17, 2026)
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/ (Last updated Jun 25, 2026)
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/ (Last updated Jul 1, 2026)
- https://developers.cloudflare.com/cloudflare-one/tutorials/access-workers/ (Last updated Jan 28, 2026)
- https://developers.cloudflare.com/cloudflare-one/traffic-controls/integrate-workers/forward-traffic/ (Last updated Oct 15, 2026)
- https://developers.cloudflare.com/api/resources/zero_trust/ (API reference index)
- https://developers.cloudflare.com/api/resources/connectivity/ (API reference)
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/service_tokens/
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/
- https://developers.cloudflare.com/api/resources/zero_trust/subresources/gateway/
- https://www.cloudflare.com/sase/products/access/ (pricing)
- GitHub: https://github.com/cloudflare/cloudflared and its published security advisories
- GitHub: https://github.com/cloudflare/advisories

---

## 1. Findings

### 1.1 Product naming changed in February 2026; several spec terms are now retired

Claim: the WARP and Magic product family was renamed on 2026-02-17. Any spec
written against pre-2026 names will not match the current docs or API.
Evidence: https://developers.cloudflare.com/changelog/post/2026-02-17-product-name-updates/ ,
Last updated Feb 17, 2026, lists exactly:
  Magic WAN -> Cloudflare WAN
  Magic WAN IPsec -> Cloudflare IPsec
  Magic WAN GRE -> Cloudflare GRE
  Magic WAN Connector -> Cloudflare One Appliance
  Magic Firewall -> Cloudflare Network Firewall
  Magic Network Monitoring -> Network Flow
  Magic Cloud Networking -> Cloudflare One Multi-cloud Networking
The changelog states "No action is required by you - all functionality, existing
configurations, and billing will remain exactly the same."
Separately, https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/concepts/
(Last updated Sep 16, 2026) states "Cloudflare Mesh was previously known as WARP
Connector and peer-to-peer connectivity. Existing WARP Connectors are now called
mesh nodes. The WARP client is now the Cloudflare One Client."
And https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/
(Last updated Oct 12, 2026) is titled "Cloudflare One Client" with the subtitle
"(formerly WARP)".
Label: [verified]

Claim: there is no product in the current Cloudflare One docs named exactly
"Cloudflare VPC service". The two things the spec could mean are (a) Workers VPC
"VPC Services", a named feature of Workers VPC, and (b) Zero Trust "virtual
networks", which the docs explicitly describe as the VPC analogue.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/virtual-networks/
(Last updated Oct 12, 2026) states "A virtual network is a private routing domain
within your Cloudflare account" and the search snippet from the same page reads
"a virtual network is analogous to a VPC (Virtual Private Cloud)". The Workers VPC
index https://developers.cloudflare.com/workers-vpc/ (Last updated Oct 12, 2026)
names "VPC Services" and "VPC Networks" as its two binding types. A site-scoped
search for a distinct "Cloudflare VPC service" product returned only these two.
Label: [verified] for the absence of a separately named product; treat this as a
naming clarification, not a discovery.

### 1.2 Workers VPC is the mechanism that lets a Worker reach the operator's own machines, and it is free in open beta

Claim: a Worker on Cloudflare can make HTTP and raw TCP calls into a private
network that is reachable only through a Cloudflare Tunnel on the operator's own
hardware. This is the direct answer to "how does the control-plane SPA on
Cloudflare talk to the data plane on my machines".
Evidence: https://developers.cloudflare.com/workers-vpc/ (Last updated Oct 12,
2026): "VPC Services let you bind to a specific host and port in your private
network. Connect a Cloudflare Tunnel to your infrastructure, register each target
as a VPC Service, and use the binding API from your Worker. VPC Services support
HTTP and TCP (TCP databases through Hyperdrive)." and "VPC Networks give Workers
broader access - bind to an entire Cloudflare Tunnel, Cloudflare Mesh network, or
Cloudflare WAN on-ramp (GRE, IPsec, CNI) without pre-registering individual
hosts."
Label: [verified]

Claim: Workers VPC is in open beta, available on Free and paid Workers plans, and
free during the beta.
Evidence: https://developers.cloudflare.com/workers-vpc/ states "Available on Free
and Paid plans". https://developers.cloudflare.com/workers-vpc/platform/pricing/
(Last updated Sep 16, 2026) states "Workers VPC requires a Workers plan. See
Workers pricing for current rates." and "Free during Open Beta: Workers VPC is
free during the open beta period. Standard Workers pricing applies for compute
time and requests."
Label: [verified]

Claim: the binding is a wrangler config surface, `vpc_services` and
`vpc_networks`, with a `remote: true` flag for local development.
Evidence: https://developers.cloudflare.com/workers-vpc/ shows
```jsonc
"vpc_services": [{ "binding": "PRIVATE_API", "service_id": "ENTER_SERVICE_ID", "remote": true }]
```
and https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/
shows `[[vpc_networks]] binding = "MY_VPC"` / `tunnel_id = "..."` / `remote = true`,
plus `network_id = "cf1:network"` for the account-wide Cloudflare Mesh binding.
Label: [verified]

Claim: the runtime API is `env.BINDING.fetch(absoluteUrl)` for HTTP and
`env.BINDING.connect("host:port")` for raw TCP, with `connect()` available on VPC
Network bindings only and plaintext TCP only.
Evidence: https://developers.cloudflare.com/workers-vpc/api/ (Last updated Sep 16,
2026): "VPC bindings provide APIs for accessing private services from your Worker.
Both VPC Services and VPC Networks expose a fetch() method for HTTP traffic. VPC
Networks also expose a connect() method for raw TCP connections." The page also
states "VPC binding fetch requests must use absolute URLs including the protocol
(http/https), host, and path. Relative paths are not supported." and, for
connect(), "connect() over VPC Networks currently supports plaintext TCP only."
Label: [verified]

Claim: VPC Services are SSRF-resistant by construction; VPC Networks are not.
Evidence: https://developers.cloudflare.com/workers-vpc/ : "VPC Services enforce
that requests are routed to their intended service without exposing the entire
network, securing your workloads and preventing server-side request forgery
(SSRF)." And https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/
(Last updated Oct 12, 2026): "The VPC Service configuration host and port(s) will
always be used to connect and route requests to your services, even if a
different host or port is present in the URL provided to the fetch() operation in
the Worker code. The host provided in the fetch() operation is not used to route
requests... The port provided in the fetch() operation is ignored."
By contrast https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/
(Last updated Oct 15, 2026): "At runtime, the URL you pass to fetch() or the
address you pass to connect() determines the destination".
Label: [verified]

Claim: Workers VPC requires `cloudflared` >= 2025.7.0, the QUIC transport, and
outbound UDP 7844.
Evidence: https://developers.cloudflare.com/workers-vpc/configuration/tunnel/
(Last updated Apr 22, 2026): "Ensure you are running cloudflared version
2025.7.0 or later (latest version recommended) to ensure proper DNS resolution
and connectivity. Older versions are not supported." and "Workers VPC also
requires Cloudflare Tunnel to connect using the QUIC transport protocol using
auto or quic. Ensure outbound UDP traffic on port 7844 is allowed through your
firewall for QUIC connections."
Label: [verified]

Claim: Workers VPC trusts only publicly trusted CAs and Cloudflare Origin CA
certificates for the tunnel-to-origin TLS leg; anything else fails the handshake.
Evidence: https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/
: "Workers VPC trusts the following certificate types: Publicly trusted
certificates - Certificates issued by well-known public certificate authorities
(for example, Let's Encrypt, DigiCert). Cloudflare Origin CA certificates... If
your origin service presents a certificate that is not issued by a publicly
trusted CA or by Cloudflare Origin CA, the TLS handshake will fail and fetch()
will throw an exception." Verification modes are `verify_full` (default),
`verify_ca`, `disabled`.
Label: [verified]

Claim: Workers VPC has exactly one published account limit, and standard Workers
limits apply on top.
Evidence: https://developers.cloudflare.com/workers-vpc/platform/limits/
(Last updated Sep 16, 2026): "VPC Services per account | 1000" and "Standard
Workers limits apply for request size, timeout, and subrequests."
Label: [verified]

Claim: the control-plane/dashboard workflow is dashboard-first, with roles
`Connectivity Directory Admin` (create services, bind to a tunnel directly) and
`Connectivity Directory Bind` (bind to existing services).
Evidence: https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/
: "Members with the Connectivity Directory Bind role can bind to existing VPC
Services from Workers. Creating VPC Services requires the Connectivity Directory
Admin role." https://developers.cloudflare.com/workers-vpc/api/ repeats this and
adds "Binding directly to a Cloudflare Tunnel through a VPC Network binding
requires Connectivity Directory Admin."
Label: [verified]

Claim: Workers VPC sessions are auditable in Zero Trust logs, attributed to the
Worker, but only for Workers redeployed after 2026-09-29.
Evidence: https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/
: "Traffic sent through a VPC Network binding appears in Gateway network logs with
Workers VPC as the Traffic Source. Zero Trust Network Session Logs also record
which Worker started each session. Workers VPC sessions report OnrampType as
WORKERS_VPC, SourceName as the Worker name, and SourceID as the Worker's stable
identifier." and "SourceName and SourceID are only populated for Workers deployed
after the release of Worker attribution in Network Session Logs. Redeploy
existing Workers to include them. No code changes are required."
Label: [verified]

Claim: there is a hard, documented interaction between Workers VPC egress and
Gateway Forward policies: Gateway drops Workers VPC HTTP traffic that matches a
Forward policy.
Evidence: https://developers.cloudflare.com/cloudflare-one/traffic-controls/integrate-workers/forward-traffic/
(Last updated Oct 15, 2026), Known limitations: "Gateway drops HTTP traffic sent
from the Cloudflare compute platform through Workers VPC if it matches a Forward
policy. Gateway does not invoke the selected Worker. Exclude this traffic from
your Forward policies." The same page repeats it in
https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/ as a
Note.
Label: [verified]

Claim: Workers VPC publishes a structured error taxonomy for failed private
connections, surfaced both as thrown exceptions and in the dashboard Metrics tab,
grouped into Bad Upstream, Client, and Internal.
Evidence: https://developers.cloudflare.com/workers-vpc/reference/troubleshooting/
(Last updated Sep 29, 2026). Named codes include `connection_refused`,
`connection_terminated`, `connection_timeout`, `connection_limit_reached`,
`destination_unavailable`, `destination_not_found`, `destination_ip_prohibited`,
`destination_ip_unroutable`, `proxy_loop_detected`, `dns_error`, `dns_timeout`,
`tls_protocol_error`, `tls_certificate_error`, `http_request_error`,
`http_upgrade_failed`, `http_request_denied`, `http_protocol_error`,
`http_response_incomplete`, `connection_read_timeout`, `connection_write_timeout`,
`rate_limited`, `proxy_internal_error`. The page notes `dns_error` can be
classified as either Bad Upstream or Client depending on whether it is NXDOMAIN.
Label: [verified]

### 1.3 The Worker-to-private-service path does not go through Access; it is a network binding, so the operator must supply his own auth at the origin

Claim: nothing in the Workers VPC documentation requires or injects an Access
service token, an Access application, or a Cloudflare Access JWT for the
Worker-to-private-service hop. The authorization model is the binding plus the
Connectivity Directory roles.
Evidence: the Workers VPC overview, VPC Services, VPC Networks, Binding API, and
Get started pages (URLs above) describe the path purely as: create a remotely
managed tunnel, register a VPC Service (host/IP/port/protocol), bind it in
wrangler, call `fetch()`. The Get started page
(https://developers.cloudflare.com/workers-vpc/get-started/, Last updated Oct 12,
2026) never mentions Access, service tokens, or an Access application. The
official example at
https://developers.cloudflare.com/workers-vpc/examples/private-api/ (Last updated
Oct 12, 2026) implements the Worker as a bare proxy with no auth headers, and its
"Next steps" section says "Add authentication and authorization" as an external
task linking to generic Workers examples.
Label: [verified]

Claim: conversely, Access service tokens and mTLS are the documented ways to
authenticate a non-browser caller to an Access-protected application, and Access
can protect private destinations as well as public hostnames.
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
(Last updated Oct 2, 2026) and
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/self-hosted-private-app/
(Last updated Oct 12, 2026), which describes a "Self-hosted and private"
application type securing private IPs and hostnames.
Label: [verified]

### 1.4 Access service tokens: exact mechanics, rotation, and a new format

Claim: an Access service token is a Client ID plus a Client Secret, sent as two
headers, and the policy action must be "Service Auth" or Access will show an IdP
login.
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
: "Cloudflare Access will generate service tokens that consist of a Client ID and
a Client Secret." Headers are `CF-Access-Client-Id: <CLIENT_ID>` and
`CF-Access-Client-Secret: <CLIENT_SECRET>`. "Make sure to set the policy action to
Service Auth; otherwise, Access will prompt for an identity provider login."
Label: [verified]

Claim: new Client Secrets changed format on 2026-08-26; the old 64-hex format
still works.
Evidence: same page: "As of August 26, 2026, new service token Client Secrets use
the format `cfast_[40 alphanumeric characters][8-character checksum]`. The prefix
and checksum make the secrets easier for credential scanning tools to identify.
Existing Client Secrets use a 64-character hexadecimal format. These secrets
continue to work and do not require rotation."
Label: [verified]

Claim: secret rotation supports a grace period from 1 hour to 30 days, or
immediate revocation.
Evidence: same page: "Available grace periods range from one hour to 30 days. To
revoke it when you rotate, select Revoke immediately." The API accepts
`previous_client_secret_expires_at` as an RFC 3339 timestamp on
`POST /accounts/$ACCOUNT_ID/access/service_tokens/$SERVICE_TOKEN_ID/rotate`.
Label: [verified]

Claim: a self-hosted Access application can be configured to read a service token
from a single arbitrary header instead of the two standard headers.
Evidence: same page: set `read_service_tokens_from_header` on the application via
`PUT /accounts/$ACCOUNT_ID/access/apps/$APP_ID`, then send e.g.
`Authorization: {"cf-access-client-id": "...", "cf-access-client-secret": "..."}`.
Label: [verified]

Claim: strict service token authentication is a new organization-level setting
that is on by default and non-disableable for Zero Trust organizations created on
or after 2026-10-05.
Evidence: https://developers.cloudflare.com/changelog/post/2026-10-02-strict-service-token-authentication/
(Oct 2, 2026) and the service-tokens page. When on: failures return 401/403
instead of a 302 to the login page; only Service Auth policies authorize; Allow
policies and any `CF_Authorization` cookie are ignored; no `CF_Authorization`
cookie is issued after success; failed requests for recognized tokens appear in
Access authentication logs (malformed headers and unknown Client IDs are not
logged). Toggled via `PATCH /accounts/{account_id}/access/organizations` with
`{"strict_service_token_auth": true}`.
Label: [verified]

Claim: the service-token API surface is small and fully documented, with named
API token permissions.
Evidence: https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/service_tokens/
and the service-tokens page. Routes:
  POST   /accounts/{account_id}/access/service_tokens
  POST   /accounts/{account_id}/access/service_tokens/{service_token_id}/rotate
  POST   /accounts/{account_id}/access/service_tokens/{service_token_id}/refresh
  PUT    /accounts/{account_id}/access/service_tokens/{service_token_id}
  DELETE /accounts/{account_id}/access/service_tokens/{service_token_id}
Permissions named: `Access: Service Tokens Write`, and for applications
`Access: Apps and Policies Write` / `Access: Apps and Policies Read`.
Models: `ServiceToken`, `ServiceTokenCreateResponse`, `ServiceTokenRotateResponse`.
Label: [verified]

### 1.5 Access applications: destination types, including a Worker destination and a private destination

Claim: the Access application model has been generalised from a single domain to
a list of typed destinations, and `destinations` supersedes `self_hosted_domains`.
Evidence: https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/
: "destinations: optional array of ... List of destinations secured by Access.
This supersedes self_hosted_domains to allow for more flexibility in defining
different types of domains. If destinations are provided, then self_hosted_domains
will be ignored."
Destination object types found on that page: `PublicDestination`
(`{overrides, type, uri}`, supports subdomain and path wildcards),
`PrivateDestination` (`{cidr, hostname, l4_protocol, port_range, type, vnet_id}`),
`WorkerDestination` (`{type: "worker", worker_id, overrides}`),
`PreviewWorkerDestination`, `AllWorkersDestination`, `AllPreviewWorkersDestination`,
`ViaMcpServerPortalDestination`, and the `AccessEndUser*` variants.
Label: [verified]

Claim: `WorkerDestination` means Access can secure a Cloudflare Worker directly,
including its preview deployments, which is directly relevant to hosting the
control-plane SPA on Workers.
Evidence: same page: "WorkerDestination object {type, worker_id, overrides} A
specific Cloudflare Worker that Access will secure. All requests routed to the
specified Worker, including its preview deployments, will be protected. The
preview_worker and public destination types takes precedence, so you can create
separate applications to override the policies for the Worker's previews or
specific paths."
Label: [verified]

Claim: the full application type enum is now 15 values, and `infrastructure` is
one of them.
Evidence: same page, `type: "self_hosted" or "end_user" or "saas" or 12 more`
enumerates: self_hosted, end_user, saas, ssh, vnc, app_launcher, warp, biso,
bookmark, dash_sso, infrastructure, rdp, mcp, mcp_portal, proxy_endpoint.
Label: [verified]

Claim: the self-hosted application model carries `allow_authenticate_via_warp`,
which lets a user authenticate to an app using their Cloudflare One Client session
instead of an IdP redirect. This is the documented way to serve non-browser
clients that cannot follow a 302.
Evidence: same page, `SelfHostedApplication`: "allow_authenticate_via_warp:
optional boolean. When set to true, users can authenticate to this application
using their WARP session. When set to false this application will always require
direct IdP authentication. This setting always overrides the organization setting
for WARP authentication."
Corroborated by
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/self-hosted-private-app/
(Last updated Oct 12, 2026): "Turn on Authenticate with Cloudflare One Client to
allow users to authenticate to the application using their Cloudflare One Client
session identity. Turn this on if your application is not in the browser and
cannot handle a 302 redirect."
Label: [verified]

Claim: Managed OAuth turns an Access application into a standard OAuth 2.0
authorization server for non-browser clients, using RFC 8707 (PKCE for public
clients).
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
(Last updated Jul 1, 2026): "Managed OAuth solves this by turning Access into a
standard OAuth 2.0 authorization server for your application. Access enforces the
same policies as a browser login, and your origin sees no difference." Enabled via
`oauth_configuration.enabled = true` on the application. Warning on the page: "If
you run your own OAuth server behind an Access application and rely on your own
WWW-Authenticate headers, do not enable this feature."
Label: [verified]

Claim: Access injects an RS256 application JWT on every authenticated request to
the origin, with a documented payload, and the origin must validate it unless the
app is behind a Cloudflare Tunnel.
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
(Last updated Jun 25, 2026): "Unless your application is connected to Access
through Cloudflare Tunnel, your application must validate the token to ensure the
security of your origin. Validation of the header alone is not sufficient - the
JWT and signature must be confirmed to avoid identity spoofing." Header is
`{"alg":"RS256","kid":"...","typ":"JWT"}`. Identity payload includes `aud`,
`email`, `exp`, `iat`, `nbf`, `iss`, `type`, `identity_nonce`, `sub`, `country`.
Custom SAML/OIDC claims land in a `custom` claim and "Access trims custom
attributes and claims when the serialized custom claim exceeds roughly 1 KB
(1,000 bytes)". Full identity is retrievable by POSTing the `CF_Authorization`
cookie to `https://<team>.cloudflareaccess.com/cdn-cgi/access/get-identity`, which
returns `devicePosture`, `common_name`, `service_token_id`,
`service_token_status`, `is_warp` among other fields.
Label: [verified]

Claim: a Worker in front of an Access-protected origin can inject headers derived
from the Access identity, and Access exposes the authenticated user email as
`cf-access-authenticated-user-email`.
Evidence: https://developers.cloudflare.com/cloudflare-one/tutorials/access-workers/
(Last updated Jan 28, 2026), which gives a Worker that reads
`headers.get("cf-access-authenticated-user-email")` and sets a custom header
before `fetch()`.
Label: [verified]

### 1.6 mTLS in Access: CA upload, selectors, and RFC 9440 forwarding with hard limits

Claim: Access mTLS works by uploading a root CA chain and associating it with
FQDNs; the policy then uses the "Valid Certificate" or "Common Name" selector
with action "Service Auth" for non-IdP clients.
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/mutual-tls-authentication/
(Last updated Oct 12, 2026). Requirements quoted: the CA must have
`CA: TRUE` in Basic Constraints, and must use one of the allowed signature
algorithms. The allowed list is exactly:
  x509.SHA1WithRSA, x509.SHA256WithRSA, x509.SHA384WithRSA, x509.SHA512WithRSA,
  x509.ECDSAWithSHA1, x509.ECDSAWithSHA256, x509.ECDSAWithSHA384, x509.ECDSAWithSHA512
A full intermediate+root chain must be uploaded when an intermediate signs the
client cert; server certificates must not be included. Without a valid client
cert the request is blocked; success sets a `CF_Authorization` cookie.
Label: [verified]

Claim: Access can forward client certificate data to the origin using RFC 9440
`Client-Cert` and `Client-Cert-Chain` headers, but the encoded fields are
populated regardless of validation result, so the origin must strip client-supplied
values and check `cert_verified` / `cert_revoked` itself.
Evidence: same page: "The cert_rfc9440 and cert_chain_rfc9440 fields are populated
regardless of the certificate validation result... Always check the following
fields before trusting the values: cf.tls_client_auth.cert_verified...
cf.tls_client_auth.cert_revoked." and "A client can also include its own
Client-Cert or Client-Cert-Chain headers on a request to inject arbitrary values.
As described in the RFC 9440 security considerations, you must unconditionally
remove any existing Client-Cert and Client-Cert-Chain headers from incoming
requests, regardless of certificate validity."
Size limits: encoded leaf 10 KiB, encoded chain 16 KiB, with
`cert_rfc9440_too_large` and `cert_chain_rfc9440_too_large` flags. The page also
documents building the same headers in a Worker via `request.tlsClientAuth`.
Label: [verified]

Claim: Cloudflare's own docs describe a legacy short-lived-certificate path
alongside a current Access for Infrastructure path.
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/
lists both "Access for Infrastructure documentation" and "Short-lived certificates
(legacy)". The API still exposes short-lived certificate CAs at
`/{accounts_or_zones}/{account_or_zone_id}/access/apps/ca` with a `CA` object of
`{id, aud, public_key}` documented as "The public key to add to your SSH server
configuration".
Label: [verified]

### 1.7 Access for Infrastructure: targets, tags, and SSH

Claim: Access for Infrastructure is the current model for non-HTTP access.
Targets are hostname+IP+virtual-network tuples with key-value tags, and
applications match targets by hostname, tag, or both.
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/infrastructure-apps/
(Last updated Oct 14, 2026): "Access for Infrastructure currently supports SSH. To
connect using other protocols, add a self-hosted private application." The
`POST /accounts/$ACCOUNT_ID/infrastructure/targets` payload is
`{"hostname": "...", "ip": {"ipv4": {"ip_addr": "...", "virtual_network_id": "..."},
"ipv6": {...}}, "tags": {"environment": "production", "team": "platform"}}`.
An IP+vnet pairing "is now assigned to this target and cannot be reused in another
target by design". Terraform resource
`cloudflare_zero_trust_infrastructure_access_target` requires provider >= 4.45.0
and the `Zero Trust Write` permission. Hostname format: case-insensitive, max 253
chars, alphanumeric plus `-` and `.`, must start and end alphanumeric.
Label: [verified]

Claim: "User-side certificates" is the current name for the root CA that Gateway
installs on devices for TLS inspection, DLP, antivirus, Access for Infrastructure
and Browser Isolation. The default Cloudflare certificate expired on 2025-02-02.
Evidence: https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/user-side-certificates/
(Last updated Oct 12, 2026): "Zero Trust generates a unique root CA for each
account and deploys it across the Cloudflare global network. Alternatively,
Enterprise users can upload and deploy their own custom certificate." and "Default
certificate expired on 2025-02-02: The default Cloudflare certificate expired on
2025-02-02 at 16:05 UTC."
Label: [verified]

### 1.8 Device posture: the check list, and the enforcement-latency trap

Claim: posture checks split into three families with different scopes: Cloudflare
One Client checks, service-to-service checks from third-party providers, and
Access-integration checks that only work in Access policies and not Gateway.
Evidence: https://developers.cloudflare.com/cloudflare-one/reusable-components/posture-checks/
(Last updated Oct 12, 2026). Cloudflare One Client checks enumerated at
https://developers.cloudflare.com/cloudflare-one/reusable-components/posture-checks/llms.txt
: Antivirus, Application check, Carbon Black, Client certificate, Device serial
numbers, Device UUID, Disk encryption, Domain joined, File check, Firewall, OS
version, Require Gateway, Require WARP, SentinelOne, Tanium (legacy).
Label: [verified]

Claim: posture enforcement has a documented, asymmetric latency: Access reacts at
the polling frequency; Gateway caches posture for five minutes, and Gateway does
not terminate an already-established session when posture later fails.
Evidence: same page: "Because Gateway evaluates network and HTTP policies on every
request, it maintains a local cache of posture results that is only updated every
five minutes. Therefore, Gateway policies are subject to an additional five-minute
delay. For example, if you set your polling frequency to 10 minutes, it may take
up to 15 minutes for Gateway to detect posture changes on a device." and "Gateway
does not terminate an active session even if a subsequent posture check fails
during that session. Gateway only evaluates posture checks at the beginning of a
session, and ongoing sessions will remain uninterrupted." The page also notes
posture results persist on Cloudflare until overwritten unless an `expiration` is
set via the API, and that Gateway does not support the Tanium integration.
Label: [verified]

Claim: posture checks require the Cloudflare One Client, and split tunnel
configuration must include `.cloudflareaccess.com` and the IdP for the checks to
fire.
Evidence: same page, step 4 "Ensure traffic is going through the Cloudflare One
Client": "In your Split Tunnel configuration, ensure that the following domains
are included in the Cloudflare One Client: The IdP used to authenticate to
Cloudflare Zero Trust if posture check is part of an Access policy.
.cloudflareaccess.com if posture check is part of an Access policy. The application
protected by the Access or Gateway policy."
Label: [verified]

### 1.9 Cloudflare One Client (formerly WARP): transport, modes, and version

Claim: the client is the only way end users reach private network IPs, and it
tunnels with WireGuard or MASQUE, plus a DNS proxy over DoH.
Evidence: https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/
(Last updated Oct 12, 2026): "The Cloudflare One Client creates encrypted
connections between your device and Cloudflare's network. It does this in two
ways: Proxy tunnel - Encrypts and routes your device's internet and private
network traffic through Cloudflare, using the WireGuard or MASQUE protocol. DNS
proxy - Sends your device's DNS queries to Cloudflare over an encrypted channel
(DNS-over-HTTPS)." Modes: Traffic and DNS (default), DNS-only, plus Traffic only,
Local proxy, and Posture only. Binaries remain named `warp-svc`,
`warp-cli`, `warp-diag`.
Label: [verified]

Claim: MASQUE is required for Cloudflare Mesh hostname routes, IPv6 CIDR routes,
and high availability; WireGuard loses those.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/concepts/
(Last updated Sep 16, 2026): "Cloudflare Mesh requires that the device profile of
each Mesh node is configured to use MASQUE, the default protocol for the
Cloudflare One Client... If a Mesh node's device profile uses WireGuard instead,
the following capabilities will not work: Hostname routes, IPv6 CIDR routes, High
availability."
Label: [verified]

Claim: current stable Windows client is 2026.8.2115.0, dated 2026-10-20.
Evidence: https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/cloudflare-one-client/download/
(Last updated Sep 28, 2026): "Version: Windows 2026.8.2115.0 Date: 2026-10-20
Size: 60.1 MB", a hotfix "addresses an issue building trusted certificate
chains". The page documents stable, beta and LTS tracks and a support lifecycle
policy.
Label: [verified]

### 1.10 Private networks and the Zero Trust side of tunnels

Claim: to reach private network IPs, end users must enroll in the Zero Trust
organization, and Gateway network policies are the optional enforcement point.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/
(Last updated Oct 12, 2026): "To reach private network IPs, end users must
connect their device to Cloudflare and enroll in your Zero Trust organization. The
most common method is to install the Cloudflare One Client on their device, or you
can onboard their network traffic to Cloudflare using Cloudflare Mesh, Cloudflare
Tunnel, or Cloudflare WAN. Administrators can optionally set Gateway network
policies to control access to services based on user identity and device posture."
The same page states cloudflared "only proxies traffic initiated from a user to a
server. Any service or application running behind the tunnel will use the server's
default routing table for server-initiated connectivity."
Label: [verified]

Claim: the three connectors are Cloudflare Mesh (bidirectional, L3/L4, Mesh IPs),
cloudflared (inbound to published services), and Cloudflare WAN (anycast GRE or
IPsec on existing networking gear).
Evidence: same page and
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/concepts/
, which tabulates: Mesh is "Bidirectional - any participant can initiate",
"Every participant gets a Mesh IP", protocols "TCP, UDP, ICMP"; Tunnel is
"Inbound to origin - clients connect to published services", "Server-side only, no
Mesh IPs", protocols "HTTP/S, TCP, SSH, RDP, SMB (proxied over WebSocket)". The
docs recommend Mesh "for any traffic sensitive to connection interruptions" and
Tunnel "when you want to publish services by hostname or proxy traffic to
specific IP ranges through cloudflared".
Label: [verified]

Claim: private hostname routing for non-HTTPS apps depends on a reserved initial
resolved IP range that must not be firewalled.
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/non-http/self-hosted-private-app/
(Last updated Oct 12, 2026): "IPv4: 172.64.128.0/20. IPv6:
2606:4700:0cf1:4000::/64. This is the default range. You can configure a custom
initial resolved IP range for IPv4 if it conflicts with your existing network."
The same page notes comma-separated port lists are not supported, and that
private hostnames on port 443 must have a valid SNI.
Label: [verified]

Claim: a self-hosted private app also supports clientless access through a
prefixed App Launcher URL.
Evidence: same page: "Allow clientless access: Allow users to access this private
hostname or IP without the Cloudflare One Client. Users who pass your Access
policies will see a tile in their App Launcher which points to a prefixed URL
such as `https://<team>.cloudflareaccess.com/browser/https://wiki.internal.local/`."
Label: [verified]

### 1.11 Virtual networks: the actual VPC construct, and a real limitation

Claim: a Zero Trust virtual network is a private routing domain with its own
routing table, used for overlapping-IP disambiguation and environment or partner
isolation. Every account has a default one.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/virtual-networks/
(Last updated Oct 12, 2026): "A virtual network is a private routing domain
within your Cloudflare account. It defines which private resources are reachable
from the Cloudflare network and keeps traffic separated between different
environments, partners, or applications. Every Cloudflare account has a default
virtual network." Use cases listed include environment separation, partner
isolation, overlapping IP space, "Connect Cloudflare Workers or CDN to backends
in your private network", and public TCP/UDP to private origins via Spectrum.
Label: [verified]

Claim: Cloudflare WAN connections (IPsec, GRE, CNI) only use the default virtual
network, so VNET isolation is a Tunnel-and-client-only feature today.
Evidence: same page: "Cloudflare Tunnel and the Cloudflare One Client support
multiple virtual networks. Cloudflare WAN connections (IPsec, GRE, CNI) currently
use only the default virtual network."
Label: [verified]

Claim: VNETs are created and wired via Terraform with
`cloudflare_zero_trust_tunnel_cloudflared_virtual_network` (fields `name`,
`comment`, `is_default`) and routes via
`cloudflare_zero_trust_tunnel_cloudflared_route`, requiring the
`Cloudflare Tunnel Write` permission.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/tunnel-virtual-networks/
(Last updated Oct 13, 2026). Dashboard path: Networking > Routes > Virtual
networks; one tunnel per isolated environment; a CIDR route is bound to a specific
vnet.
Label: [verified]

### 1.12 Cloudflare Mesh (formerly WARP Connector)

Claim: Mesh assigns every participant an IP from `100.96.0.0/12` (CGNAT space,
RFC 6598) and routes TCP/UDP/ICMP through Cloudflare.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-mesh/concepts/
: "Every participant is assigned a private IP from the 100.96.0.0/12 range. In
other parts of the Cloudflare One documentation, these addresses are referred to
as device IPs. This range uses CGNAT address space to avoid conflicts with RFC
1918 private ranges (10.x, 172.16.x, 192.168.x). If the default range conflicts
with your network, you can configure a custom subnet."
Label: [verified]

Claim: Mesh nodes are Linux servers running the Cloudflare One Client in headless
mode; they can advertise CIDR routes and support active-passive replicas.
Evidence: same page's participant table: Mesh nodes run on "Linux servers, VMs,
containers", client `warp-cli` headless, subnet routing "Can advertise CIDR
routes", HA "Supports active-passive replicas"; client devices are "Laptops,
phones, desktops", subnet routing "No - clients reach subnets through nodes".
Label: [verified]

Claim: the docs explicitly map Tailscale/WireGuard concepts onto Cloudflare Mesh
and state the key differences.
Evidence: same page's "Coming from another mesh networking product?" table maps
Tailnet to the account's Mesh network, Node/peer to mesh node or client device,
Subnet router to "Mesh node with CIDR routes", MagicDNS to "Local Domain Fallback
+ Gateway resolver policies", ACLs to "Gateway network policies + device
posture", Exit node to "Attach a public CIDR to a Mesh node". Stated differences:
configuration is dashboard/API only with no CLI administration, policies and
posture are built in, and "Traffic routes through the nearest Cloudflare data
center, not directly between devices."
Label: [verified]

### 1.13 Cloudflare WAN (formerly Magic WAN) is Enterprise-only

Claim: Cloudflare WAN is a standalone WANaaS product, Enterprise-only, connecting
sites via anycast GRE or IPsec, CNI, Cloudflare Network Interconnect, or the
Cloudflare One Appliance.
Evidence: https://developers.cloudflare.com/cloudflare-wan/ (Last updated Aug 24,
2026), which carries an "Enterprise-only" banner: "Cloudflare WAN (formerly Magic
WAN) connects your data centers, offices, and cloud resources through Cloudflare's
global network... Cloudflare WAN supports any device that uses anycast GRE or
IPsec tunnels." On-ramps listed: IPsec tunnels, GRE tunnels, Cloudflare Network
Interconnect, Cloudflare One Appliance. BGP peering for routes is beta.
Label: [verified]

Claim: destinations behind Cloudflare WAN on-ramps require the Cloudflare source
IP range to be routed back through the on-ramp.
Evidence: https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/
: "For destinations behind Cloudflare WAN on-ramps (GRE, IPsec, or CNI), your
network must also route the Cloudflare source IP range (100.64.0.0/12 by default)
back through the on-ramp so reply traffic returns to Cloudflare."
Label: [verified]

### 1.14 Account limits that constrain the design

Claim: the Zero Trust account limits page publishes hard numbers, several of which
are small enough to matter.
Evidence: https://developers.cloudflare.com/cloudflare-one/account-limits/
(Last updated Sep 4, 2026). Access: Applications 500; Audit Logpush jobs 5;
Email addresses per rule 1,000; Rule groups 300; Rules per rule group 1,000; IP
addresses per rule 1,000; mTLS root certificates 50; Service tokens 50; Identity
providers 50; Reusable policies 500; Rules per application 1,000; Domains per
application 50; Infrastructure targets 5,000; MCP portals 20; MCP servers per
portal 80; Custom domains per MCP portal 5; MCP portal session inactivity timeout
24 hours.
Gateway: DNS/Network/HTTP/Egress/Resolver policies per account 500 each; DNS
locations 250; Source IP CIDRs per DNS location 1,500; Concurrent streams for
HTTP/2 connections 256; PAC files Standard 50 / Enterprise 1,000; Proxy endpoints
Standard 50 / Enterprise 500; Source IP CIDRs per proxy endpoint 2,000; Lists 100;
Entries per list Standard 1,000 / Enterprise 5,000; List API requests per minute
600; DNS Logpush jobs 5; HTTP Logpush jobs 5.
Cloudflare Tunnel: tunnels per account 1,000; Routes (CIDR + hostname) per
account 1,000 (shared with Cloudflare Mesh); Active cloudflared replicas per
tunnel 25; Virtual networks per account 1,000.
Cloudflare Mesh: Mesh nodes per account 50; Routes (CIDR) per account 1,000
(shared with Cloudflare Tunnel).
DEX: DEX tests per account Free 10 / Standard 30 / Enterprise 50; Remote captures
per day Free 100 / Standard 200 / Enterprise 800.
Certificates: Active 10; Generated per day 3; Custom 5.
Cloudflare One Client: Characters per device profile expression 10,000; Combined
Split Tunnel and Local Domain Fallback entries per device profile 1,000; Device IP
profiles per account 30.
Character limits: Application name 350; Group name 350; mTLS certificate name 350;
Service token name 350; IdP name 350; Target name 255; Application URL 63; Team
domain 63; Gateway API policy expression 140,000.
The page notes "These limits may be increased on Enterprise accounts."
Label: [verified]

### 1.15 The Zero Trust API and Terraform surface

Claim: the entire Zero Trust configuration is API- and Terraform-manageable, and
the dashboard can be locked read-only to force that.
Evidence: https://developers.cloudflare.com/cloudflare-one/api-terraform/
(Last updated Apr 17, 2026): "Super Administrators can lock all settings as
read-only in the Cloudflare One dashboard. Read-only mode ensures that all updates
for the account are made through the API or Terraform." Settings > Admin controls
> Set dashboard to read-only. The page also documents scoped API tokens so that
Zero Trust admins need not hold account-wide permissions.
Label: [verified]

Claim: the API index at https://developers.cloudflare.com/api/resources/zero_trust/
enumerates the resources. The Zero Trust section contains: Cloud Workload
Security (basic auth credentials, secrets, deployments, domain ACLs, policies,
policy sets, rego metadata, rego modules, tenant structures, nodes, workloads);
Devices (devices, resilience/global WARP override, registrations, DEX tests, IP
profiles, deployment groups, networks, fleet status, policies default and custom
with excludes/includes/fallback domains/certificates, posture, integrations,
revoke, settings, unrevoke, override codes); Identity Providers (SCIM groups and
users, SAML certificate); Organizations (DOH); Seats; Access (AI controls and MCP
portals, Gateway CA, IdP federation grants, SAML certificates, Infrastructure and
Targets, Applications with CAs, user policy checks, policies, policy tests and
users, settings, certificates and settings, groups, service tokens, bookmarks,
keys, logs with access requests, JIT requests, SCIM updates, users with active
sessions, last seen identity, failed logins, MFA authenticators, passkeys, user
populations, MFA, custom pages, tags, policies); Casb; DEX (WARP change events,
commands, devices, downloads, quota, colos, fleet status, HTTP tests, percentiles,
tests, unique devices, traceroute test results, network path); Tunnels
(Cloudflared with configurations, connections, token, connectors, management;
WARP Connector with token, connections, connectors, failover, configurations);
Connectivity Settings.
Label: [verified]

Claim: tunnel management lives at `cfd_tunnel` and `warp_connector` style paths
under `/accounts/{account_id}`, with typed models.
Evidence: https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/
. Routes observed: GET/POST/PUT/PATCH/DELETE on `/accounts/{account_id}/cfd` and
`/accounts/{account_id}/warp`. Models include `CloudflareTunnel`
({id, account_tag, config_src, ...}, "A Cloudflare Tunnel that connects your
origin to Cloudflare's edge"), `Client` ({id, arch, config_version, ...}, "A client
(typically cloudflared) that maintains connections to a Cloudflare data center"),
`ConfigurationGetResponse`, `ConfigurationUpdateResponse` with
`configuration_version`, `ha_mode`, `TunnelMeshAwsConfig` ({fnr_id}) and
`TunnelMeshLocalConfig` ({vips, vips_previous}).
Label: [verified]

Claim: Workers VPC services are managed through a separate top-level
`connectivity` API resource, not the Zero Trust one.
Evidence: https://developers.cloudflare.com/api/resources/connectivity/ : "List
Workers VPC connectivity services" GET `/accounts/{account_id}/connectivity/directory/services`,
plus POST, GET, PUT, DELETE on `.../services/{service_id}`. Models:
`InfraHTTPServiceConfig` and `InfraTCPServiceConfig`, with `host` variants
`InfraIPv4Host`, `InfraIPv6Host`, `InfraDualStackHost`, `InfraHostnameHost`
({hostname, resolver_network: {tunnel_id, resolver_ips}}), `type` of "tcp" or
"http", `app_protocol` of "postgresql" or "mysql", `tcp_port`, `http_port`,
`https_port`, `tls_settings.cert_verification_mode`. The docs cross-reference this
as "the REST API for creating a VPC Service, a type of service within the broader
connectivity directory".
Label: [verified]

Claim: Gateway policy management is at `/accounts/{account_id}/gateway`, including
`gateway/rules` (the single rules endpoint covering DNS, network, HTTP and egress
policies), `gateway/lists`, `gateway/locations`, `gateway/proxy_endpoints`,
`gateway/pacfiles`, `gateway/certificates`, and `gateway/audit_ssh_settings`
with a `rotate_seed` action.
Evidence: https://developers.cloudflare.com/api/resources/zero_trust/subresources/gateway/
. Observed route list includes GET/POST `/accounts/{account_id}/gateway`,
`GET /accounts/{account_id}/gateway/rules`,
`GET /accounts/{account_id}/gateway/rules/tenant`,
`POST /accounts/{account_id}/gateway/audit_ssh_settings/rotate_seed`.
Label: [verified]

Claim: Terraform resource names referenced in the docs include
`cloudflare_zero_trust_access_service_token`,
`cloudflare_zero_trust_infrastructure_access_target`,
`cloudflare_zero_trust_tunnel_cloudflared`,
`cloudflare_zero_trust_tunnel_cloudflared_virtual_network`,
`cloudflare_zero_trust_tunnel_cloudflared_route`, and `cloudflare_resource_tag`.
Evidence: the service-tokens, infrastructure-apps and tunnel-virtual-networks
pages quoted above. The infrastructure target resource requires provider
>= 4.45.0. The service-token page recommends
`lifecycle { create_before_destroy = true }` on the service token resource.
Label: [verified]

### 1.16 Zero Trust pricing and the free-plan ceiling

Claim: Cloudflare Access is Free at $0 with a 50-user limit, then $7 per user per
month paid annually on Pay-as-you-go, then custom Contract pricing.
Evidence: https://www.cloudflare.com/sase/products/access/ , read 2026-10-29:
"Free Plan $0 forever. Best for teams under 50 users or enterprise
proof-of-concept tests." "Pay-as-you-go $7 per user/month (paid annually). Best
for teams over 50 users solving narrow SSE use cases..." "Contract Plan Custom
price per user/month (paid annually)". The plan comparison table states
"Core capabilities / Usage / 50 user limit" for Free and "No user limit" for the
paid plans, and a "100% uptime guarantee (SLA)" on both paid plans. mTLS
authentication is listed as a feature across the plans.
Label: [verified]

Claim: Workers VPC is not separately metered during open beta, but Cloudflare One
and Workers are separately metered.
Evidence: https://developers.cloudflare.com/workers-vpc/platform/pricing/
(Last updated Sep 16, 2026) for the beta pricing, and
https://developers.cloudflare.com/cloudflare-one/ (Last updated Sep 16, 2026)
"Available on all plans" plus the Access plan page for the seat model.
Label: [verified]

### 1.17 Security notes and known CVEs

Claim: cloudflared is Apache-2.0, written in Go, actively released, with two
published GitHub security advisories, both Windows local privilege escalation in
the installer or config handling, neither affecting the current client.
Evidence: `gh api repos/cloudflare/cloudflared` returned:
  full_name cloudflare/cloudflared
  description "Cloudflare Tunnel client"
  stargazers_count 16337
  license Apache-2.0
  pushed_at 2026-10-29T10:22:59Z
  language Go
  open_issues_count 572
  size 42259
`gh api repos/cloudflare/cloudflared/releases` returned the five most recent:
  2026.10.5 published 2026-10-27T13:31:37Z
  2026.10.4 published 2026-10-26T11:19:58Z
  2026.10.3 published 2026-10-21T13:17:53Z
  2026.10.2 published 2026-10-20T09:17:30Z
  2026.10.1 published 2026-10-15T17:15:26Z
`gh api repos/cloudflare/cloudflared/security-advisories` returned two:
  GHSA-7mjv-x3jf-545x / CVE-2023-1314, severity high, CVSS 3.1 score 7.5
    (CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:C/C:N/I:H/A:H), CWE-59 Improper Link
    Resolution Before File Access. "A vulnerability has been discovered in
    cloudflared's installer (<= 2023.3.0) for Windows 32-bits devices... The
    cloudflared client itself is not affected by this vulnerability, only the
    installer for 32-bit Windows devices." Patched in 2023.3.1.
  GHSA-hgwp-4vp4-qmm2 / CVE-2020-24356, severity medium. "In cloudflared
    versions < 2020.8.1 on Windows... an unprivileged user can exploit a
    misconfiguration in order to escalate privileges... One of the locations
    that cloudflared reads from (C:\etc\) is not a secure by default directory."
    Patched in 2020.8.1.
Label: [verified]

Claim: there is at least one further Cloudflare WARP client CVE on Windows
(CVE-2025-0651, improper privilege management), but I did not read a Cloudflare
primary source for it.
Evidence: search result from
https://www.sentinelone.com/vulnerability-database/cve-2025-0651/ (published
2026-08-11 per the search index), snippet: "CVE-2025-0651 is an Improper
Privilege Management vulnerability [CWE-269] in Cloudflare WARP on Windows. A
local user with low system privileges..." This is a third-party database, not a
Cloudflare advisory, so treat the details as unverified.
Label: [unverified]

Claim: the `cloudflare/advisories` repository is not a usable CVE feed for these
products.
Evidence: `gh api repos/cloudflare/advisories` returned
  full_name cloudflare/advisories
  description "This repo functions as the hub for 'open sourced' closed source
    vulnerabilities/advisories as well as educational writeups composed in
    collaboration with third parties on discovered vulnerabilities."
  stargazers_count 7
  license null
  open_issues_count 4
  pushed_at 2026-04-23T22:47:55Z
A code search for "cloudflared" in that repo returned no paths. The authoritative
source for cloudflared advisories is the repository's own security-advisories
endpoint, used above.
Label: [verified]

Claim: the default Cloudflare Zero Trust user-side root certificate expired on
2025-02-02, which is a live operational risk for any deployment relying on the
default rather than a custom or freshly generated CA.
Evidence: https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/user-side-certificates/
(Last updated Oct 12, 2026), quoted in 1.7 above.
Label: [verified]

Claim: mTLS revocation handling is the operator's problem. Cloudflare's docs
describe generating a CRL with the Cloudflare PKI toolkit but state "You will
need to add the CRL to your server or enforce the revocation in a Cloudflare
Worker."
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/mutual-tls-authentication/
: "You will need to add the CRL to your server or enforce the revocation in a
Cloudflare Worker. An example Worker Script can be found on the Cloudflare GitHub
repository."
Label: [verified]

### 1.18 Operational gotchas that are easy to hit

Claim: cloudflared replicas are for high availability only. They do not load
balance, and autoscaling is explicitly not recommended.
Evidence: https://developers.cloudflare.com/workers-vpc/configuration/tunnel/
: "We do not recommend using cloudflared in autoscaling setups because
downscaling (removing replicas) will break existing user connections to that
replica. Additionally, cloudflared does not load balance across replicas;
replicas are strictly for high availability and requests are routed to the
nearest replica."
Label: [verified]

Claim: the same cloudflared instance can serve both Zero Trust and Workers VPC
use cases, but ingress rules only apply to the public-hostname use case.
Evidence: same page: "The same cloudflared instance can be used to cover both
Zero Trust and Workers VPC use cases simultaneously." and "Ingress configurations
for locally-managed tunnels are only relevant when using tunnels to expose
services to the public internet, and are not required for Workers VPC as routing
is handled by the VPC Service configuration."
Label: [verified]

Claim: for Workers VPC, remotely-managed tunnels are recommended, because the
configuration lives on Cloudflare and is manageable from any machine via
dashboard, API, or Terraform.
Evidence: same page: "Remotely-managed tunnels (recommended): Remotely-managed
configurations are stored on Cloudflare, allowing you to manage the tunnel from
any machine using the dashboard, API, or Terraform." and "For Workers VPC, we
recommend creating a remotely-managed tunnel through the dashboard."
Label: [verified]

Claim: Gateway Forward policies have a set of sharp edges that matter if the
spec plans to use them: fail-closed behaviour, a 500 on a deleted Worker, no
WebSocket/CONNECT/protocol-upgrade support, and a hard dependency on TLS
decryption.
Evidence: https://developers.cloudflare.com/cloudflare-one/traffic-controls/integrate-workers/forward-traffic/
(Last updated Oct 15, 2026): "Invocation errors, Worker errors, or failures in
communication between Gateway and the Worker fail closed. Gateway does not bypass
the Worker and forward the original request." "Gateway resolves the selected
Worker only when a Forward policy is saved. Deleting the Worker does not remove or
disable the policy. Matching requests then fail with HTTP 500... Saving a policy
that still references the deleted Worker fails with API error 2294." "WebSocket
traffic connects directly to the original upstream service and bypasses the
selected Worker." "HTTPS traffic must be decrypted. Gateway does not invoke a
Worker for traffic matching Do Not Inspect." "Call next() zero or one time.
Repeated or concurrent calls are unsupported."
Label: [verified]

Claim: custom claims in the Access JWT are silently trimmed above roughly 1 KB,
which is a live authorization bug source.
Evidence: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
(Last updated Jun 25, 2026): "Do not rely on custom claims in the JWT for
authorization decisions when they may grow large. To retrieve the user's full
identity, including all groups, call the /cdn-cgi/access/get-identity endpoint."
Label: [verified]

Claim: the `experimental_configureRuntime` style workerd configuration surface is
not part of Zero Trust and is not covered here; it belongs to the A3 workerd
research. The only runtime configuration relevant to A5 is the wrangler binding
block.
Evidence: the Workers VPC pages referenced above configure the Worker purely via
`vpc_services` / `vpc_networks` blocks in the wrangler config; no workerd or
runtime-flag configuration appears anywhere in the Zero Trust or Workers VPC
documentation I read.
Label: [verified]

---

## 2. What this changes for the spec

### 2.1 The dashboard-on-Cloudflare, data-plane-on-own-machines split has a
first-party, currently-free mechanism. Use it, and do not hand-roll a tunnel.

Workers VPC with VPC Service bindings is exactly the primitive the architecture
needs. A remotely-managed Cloudflare Tunnel on the operator's machine, one VPC
Service per internal HTTP endpoint, and a `vpc_services` block in wrangler. It is
free during open beta (1.2), it needs no public IP and no inbound firewall rule
(1.18), and the same cloudflared process can simultaneously serve the Zero Trust
hostname-publishing use case (1.18). The alternative, a Worker that calls a
public hostname on a tunnel, works but puts an Access application and a public
DNS name in front of every internal service, which is more moving parts and more
attack surface than a binding.

### 2.2 Choose VPC Services, not VPC Networks, for the control-plane-to-data-plane
hop, unless runtime routing is genuinely required.

VPC Services pin host and port in the service configuration and ignore both in
the `fetch()` URL, which makes SSRF structurally impossible (1.2). VPC Networks
take the destination from the URL, which is convenient for a generic gateway but
turns any injection into an internal port scan. If a VPC Network is needed for a
class of services, keep it in a separate Worker from the one handling
user-supplied paths, and treat the URL as an allowlist check, not a routing
decision.

### 2.3 Do not rely on Access to authenticate the Worker to the private service.
Put the auth at the origin.

Nothing in the Workers VPC path injects a service token or an Access JWT (1.3).
The binding is the only authorization. That means the private service itself must
authenticate the caller. Three workable patterns, in order of preference for this
architecture:

1. mTLS at the origin, with the CA and client cert managed by the operator's own
   PKI. Access mTLS (1.6) is available, but it is an Access-application feature,
   not a Workers VPC feature, so it does not apply to the binding path. Run mTLS
   directly on the origin or on a sidecar in front of it.
2. A bearer token held as a Worker secret and forwarded in a header. This is the
   pattern the official example leaves to the reader (1.3).
3. Put the private service behind an Access self-hosted private application and
   use a service token from the Worker. This works (1.4, 1.5) but adds an Access
   application, a public or private hostname, and the strict-service-token
   behaviour (1.4) to every internal call.

Recommendation: option 1 for anything that touches storage or CI, option 2 for
low-value internal APIs. In both cases the origin must be the enforcement point,
because the tunnel leg is already encrypted and the binding is not a credential.

### 2.4 Design the service-token budget now, because 50 is the account limit and
rotation is not free.

Service tokens cap at 50 per account (1.14). If the spec expects one token per
tenant, per CI runner, or per container, that ceiling arrives fast. Two
consequences for the spec: (a) scope tokens by service, not by instance, and use
one service token per internal service class; (b) build rotation into the
deployment, since the API supports a grace period of 1 hour to 30 days (1.4) and
the secret format changed to `cfast_...` on 2026-08-26 (1.4), so any
credential-scanning or secret-format assumption in the operator's tooling needs
updating. Also note the new strict mode: organizations created on or after
2026-10-05 cannot disable it, failures return 401/403 rather than a 302, and only
Service Auth policies authorize (1.4). Any client that relies on following a
redirect to a login page is broken under strict mode.

### 2.5 Treat the RFC 9440 header forwarding as a hazard, not a feature, unless
the origin is written defensively.

If mTLS client certificates are forwarded to the origin, the origin must
unconditionally strip client-supplied `Client-Cert` and `Client-Cert-Chain`
headers and must check `cert_verified` and `cert_revoked` before trusting
anything, because Cloudflare populates the fields regardless of validation result
(1.6). The 10 KiB leaf and 16 KiB chain caps mean a large chain silently produces
an empty field. Revocation is the operator's job (1.17). Given all of that, for a
self-hosted alternative the simpler design is to terminate mTLS at the origin and
never forward certificate material.

### 2.6 Device posture is not a control the operator can lean on for machine
access, and it is unavailable to the Worker path entirely.

Posture requires the Cloudflare One Client on the requesting device (1.8), which
a Worker does not have. Posture also has documented enforcement latency
(polling interval plus a five-minute Gateway cache) and does not kill
already-established sessions (1.8). For the operator's own machines, which are
headless and have no Cloudflare One Client, posture is irrelevant. Use it only
for human browser access to the dashboard, and even then treat it as a speed
bump rather than a boundary.

### 2.7 Virtual networks are the only way to run overlapping IP space, and they
are Tunnel-only.

If the operator runs more than one environment that reuses RFC 1918 ranges, or
wants to segment a homelab from a cloud VPC, virtual networks are the mechanism
(1.11). The constraint to write into the spec: Cloudflare WAN connections use
only the default virtual network (1.11), and each isolated environment needs its
own tunnel (1.11). So the topology is one tunnel per isolated environment, with
CIDR routes bound to the right vnet, and Workers VPC Services pointed at the
right tunnel ID.

### 2.8 Cloudflare WAN and Cloudflare Mesh are the wrong tools for this spec.

Cloudflare WAN is Enterprise-only (1.13), so it is out on price. Cloudflare Mesh
is bidirectional L3/L4 with post-quantum encryption and is the better choice for
long-lived TCP between the operator's own machines, but it is a different job from
publishing a service to a Worker (1.10), and its node cap is 50 per account
(1.14). Keep Mesh on the list for machine-to-machine replication and drop it from
the control-plane path.

### 2.9 Everything must be Terraform, and the dashboard must be locked
read-only.

The whole Zero Trust surface is API- and Terraform-manageable, and the dashboard
can be forced read-only so that configuration changes only happen through the
pipeline (1.15). Given the operator's CI runs on his own machines, the spec should
treat Terraform state as the source of truth for Access applications, service
tokens, tunnels, routes, virtual networks, and Workers VPC services. Note that
Workers VPC services live under a different API resource (`connectivity`) from
the rest of Zero Trust (1.15), so the Terraform layout needs two provider
surfaces, and the infrastructure-target resource needs provider >= 4.45.0 (1.7).

### 2.10 Budget for the seat model, and keep the operator's own machines out of
the user count.

Zero Trust Access is $0 up to 50 users, then $7 per user per month paid annually
(1.16). The operator's machines should be service tokens or infrastructure
targets, not seats. The spec should state explicitly that machines are not users,
otherwise a fleet of CI runners will consume the 50-seat free tier immediately.

### 2.11 Put the error taxonomy in the spec's operational runbook.

Workers VPC publishes a full error taxonomy with a Bad Upstream / Client /
Internal split (1.2). The spec should require the Worker to surface the error
code rather than a generic 503, and should require the Metrics tab and the Zero
Trust Network Session Logs to be part of the debugging path, with the caveat that
`SourceName` is empty until the Worker is redeployed (1.2).

### 2.12 The Gateway Forward-policy interaction is a landmine. Exclude Workers
VPC from Forward policies.

If the spec plans any Gateway Forward policy, Workers VPC HTTP traffic matching
it is silently dropped (1.2). Forward policies also fail closed, 500 on a deleted
Worker, and skip WebSocket and CONNECT entirely (1.18). Recommendation: do not
use Forward policies in v1. If they are needed later, add an explicit exclusion
for Workers VPC traffic and a test that asserts the exclusion exists.

### 2.13 Pin cloudflared, and do not autoscale it.

Workers VPC needs cloudflared >= 2025.7.0 with QUIC on UDP 7844 (1.2), and
replicas are HA-only with no load balancing, so autoscaling breaks connections
(1.18). The spec should pin a cloudflared version in the tunnel image, run a
fixed number of replicas (max 25 per tunnel, 1.14), and add a health check that
verifies the tunnel is connected. The current release at time of reading is
2026.10.5, published 2026-10-27 (1.17), which satisfies the >= 2025.7.0 floor.

---

## 3. Not covered / open questions

Named precisely, with what would settle each.

1. Workers VPC general-availability pricing. The pricing page only says "free
   during open beta" and "standard Workers pricing applies for compute time and
   requests" (1.2). There is no published per-request or per-connection surcharge
   for VPC Services or VPC Networks, and no published GA date. This is a direct
   cost risk for the "cheaper than Cloudflare" premise. What would settle it: a
   Cloudflare GA announcement or an updated pricing page with a metered rate.

2. Whether Workers VPC charges for the tunnel leg at all after beta. The docs say
   standard Workers pricing applies, but a Worker-to-private-network hop is not a
   normal subrequest in the Workers pricing model. Unverified whether it counts
   against the Workers subrequest limit. What would settle it: the Workers
   platform limits page cross-referenced against the VPC Services page, which I
   did not read.

3. The full Workers request, CPU and subrequest limits that bound Workers VPC.
   The VPC limits page defers to "standard Workers limits" (1.2) without listing
   them. That belongs to A4 but the numbers constrain the A5 design. Not read
   here.

4. The "Cloudflare VPC service" term. I could not find a Cloudflare product with
   that exact name (1.1). If the operator's source for that term is a specific
   doc or dashboard label, it needs to be identified before the spec uses it,
   because the current docs use "VPC Services" (Workers VPC) and "virtual
   networks" (Zero Trust) for two different things.

5. Whether a Worker can authenticate to an Access-protected private application
   using a service token over a VPC Service binding in the same request. The two
   mechanisms are documented separately (1.3) and I found no documentation
   combining them. It should work in principle, since a VPC Service is just an
   HTTP connection to a host and port, but this is untested here. What would
   settle it: an actual test deploy, or a Cloudflare doc that shows the pattern.

6. Access for Infrastructure protocol coverage. The docs say it "currently
   supports SSH" only (1.7), and point to self-hosted private applications for
   everything else. Whether database and container-runtime protocols have landed
   since the 2026-10-14 page update is unknown. What would settle it: re-reading
   that page or the changelog.

7. Short-lived certificates. The docs list "Short-lived certificates (legacy)"
   alongside Access for Infrastructure (1.6), and the CA API still exists. I did
   not determine what replaced the legacy flow, or whether Access for
   Infrastructure issues short-lived SSH certificates through a different
   mechanism. Not covered.

8. CVE-2025-0651 in the Cloudflare WARP client. I found it only in a third-party
   vulnerability database (1.17), not in a Cloudflare advisory. Its affected
   versions, patched version and severity are unverified. What would settle it:
   the Cloudflare WARP changelog or a Cloudflare-published advisory.

9. Whether the operator's own machines can enroll as Cloudflare Mesh nodes
   without a Cloudflare One Client GUI, and what the headless Linux deployment
   path costs in practice. The concepts page says mesh nodes run `warp-cli`
   headless (1.12) and there is a tutorial "Deploy the Cloudflare One Client on
   headless Linux machines", but I did not read that tutorial, so the exact
   steps, the service-token requirement and any seat implications are unknown.

10. The Zero Trust free plan's log retention and log detail. The Access plan page
    mentions "Standard log retention" and support differences between plans
    (1.16), but I did not read the specific retention windows or whether
    Workers VPC network session logs are available on the free plan. The VPC
    Networks page says sessions appear in Zero Trust Network Session Logs (1.2)
    without stating a plan requirement. What would settle it: the Zero Trust
    logs page with plan annotations.

11. mTLS availability by plan. A community post claims mTLS is Enterprise-only on
    Zero Trust, while the Access plan page lists "mTLS authentication" as a
    feature across the plan comparison (1.16). I did not find a definitive
    plan-gating statement in the docs. Unverified. What would settle it: the
    Mutual TLS page's feature-availability table, which I did not see, or
    Cloudflare support.

12. Terraform provider version currency. The docs reference provider >= 4.45.0
    for infrastructure targets (1.7) and use current resource names elsewhere,
    but I did not query the Terraform registry for the latest provider version or
    confirm which of the referenced resources exist in it. What would settle it:
    `gh api` against the registry is not possible; the registry API or a
    `terraform providers` query is needed.

13. The Gateway CA resource and IdP federation grants. Both appear in the API
    index (1.15) and both are plausibly relevant to a self-hosted control plane
    issuing its own short-lived credentials, but I did not read either. Not
    covered.

14. Whether the operator can run his own workerd instances behind a Workers VPC
    binding. The project context says some machines may run workerd and be
    exposed via a tunnel. A workerd instance on the operator's machine is just an
    HTTP service, so a VPC Service pointing at it should work, but nothing in the
    Workers VPC docs mentions workerd, and the interaction between workerd's own
    outbound fetch and the tunnel is unverified. That is A3's territory; flagged
    here because it determines whether the data plane can be workerd-shaped at
    all.
