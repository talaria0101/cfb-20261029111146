# C1 - Threat model for a management plane reached only through Cloudflare Tunnels

Scope: the design where the dashboard/control-plane SPA and its API run as a
Cloudflare Worker, and every data-plane machine (CI runners, container hosts,
storage) sits behind cloudflared on the operator's own hardware. The question
this file answers is which attacks are real, which are folklore, and what each
one costs.

All sources read 2026-10-29 (UTC). Every figure below comes from a call made
during this session. Claims I could not verify from a primary source are
labelled [unverified] with the reason.

---

## 1. Findings

### 1.1 The tunnel token is a bearer credential with no host binding. This is the root of most of the model.

Claim: a remotely-managed tunnel requires only its token to run, and the token
is not tied to a machine, an IP, or a cloudflared version.

Evidence (Cloudflare docs, "Tunnel tokens", last updated Sep 11 2026):
https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/
  "A remotely-managed tunnel only requires a token to run. Anyone with the
  token can run the tunnel."
Evidence (Cloudflare docs, "Tunnel permissions", last updated Jun 23 2026):
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/remote-tunnel-permissions/
  "A remotely-managed tunnel only requires the tunnel token to run. Anyone with
  access to the token will be able to run the tunnel."
Evidence (token structure, third-party but matches the documented JWT shape):
https://y4nush.com/posts/when-replicas-go-rogue-a-deep-dive-into-cloudflared-replicas-exploitation-scenarios/
  Token payload is `{"a":<account id>,"t":<tunnel uuid>,"s":<base64 tunnel
  secret>}`. "Notably, this token is not tied to a specific machine. As long as
  the operating system supports the Cloudflared client, any machine can use
  this token to run the Cloudflared service."
Label: [verified]

Consequence: a stolen token is a full, permanent, portable foothold in the
account's tunnel plane. Rotation is the only remedy, and Cloudflare's own
procedure is disruptive: after rotating, "cloudflared cannot establish new
connections with the old token. Existing connectors remain active until
restarted" (same Tunnel tokens page). A compromised token therefore keeps
working until every replica is reinstalled, which is the opposite of a
revocation.

### 1.2 The token is exposed on the host by default, and the fix is still an open upstream issue.

Claim: on Linux the token sits in the systemd unit's ExecStart, so it is
readable from the process table, /proc, the service file, and shell history.
Cloudflare has an open issue requesting a token file instead.

Evidence (GitHub issue cloudflare/cloudflared#1539, created 2025-10-13, state
`open` at time of reading):
https://github.com/cloudflare/cloudflared/issues/1539
  Title: "Use token file instead of CLI argument in cloudflared service install
  for improved security".
  Body: "Current behavior: Token passed as --token CLI argument, visible in
  process list. Proposed: Use --token-file by default, write token to
  /etc/cloudflared/token with mode 600. Benefit: Prevents token exposure via
  ps, /proc, service file, system logs. I was very surprised when running `ps`
  on my system after install to see my tunnel token visible. The default setup
  allows any other process on the machine (not containerized or otherwise
  isolated) to steal the tunnel token."
Evidence (Windows equivalent): the y4nush post documents the token in the
registry `ImagePath` of the cloudflared service, plus extraction from shell
history files and from process memory via `strings`.
Label: [verified]

Consequence for the spec: any process on a host running cloudflared can steal
the token unless the host is containerized or otherwise isolated. That single
sentence is the strongest argument in this document for keeping CI runners on
different machines (or different VMs) from the machines that run cloudflared.

### 1.3 A rogue replica receives a share of real user traffic, including Access JWTs. Cloudflare's response was documentation, not a product change.

Claim: because replicas are not traffic-steered, an attacker who installs a
replica with a stolen token receives a fraction of live production requests,
including the CF_Authorization cookie and any application session cookies, and
can mount an adversary-in-the-middle session hijack.

Evidence: https://y4nush.com/posts/when-replicas-go-rogue-a-deep-dive-into-cloudflared-replicas-exploitation-scenarios/
  "traffic forwarding to servers is entirely controlled by Cloudflare, and
  neither the client nor the tunnel owner can influence or manage this
  behavior... when a request arrives at Cloudflare, it will be forwarded to the
  replica that is geographically closest. If that distance calculation is
  unsuccessful or the connection fails, we will retry others, but there is no
  guarantee about which connection is chosen."
  The PoC (`cloudflared_aitm_poc`) intercepts `CF_Authorization` and the
  application's own session cookie, then redirects the victim back to the real
  origin so the compromise looks like "temporary connectivity problems with
  Cloudflare".
  Disclosure timeline in the same post: reported to HackerOne 2024-11-22,
  mistakenly closed 2024-11-24, PoC 2024-11-26, coordination 2024-11-27,
  "2024-12-04 Cloudflare confirmed updated documentation on Tunnel token
  security and token rotation", published 2024-12-08.
Label: [verified]

Verdict: real, and it is a design property rather than a bug. The vendor
classified it as expected behaviour and shipped docs. This is the single most
important asymmetry in the whole threat model: Cloudflare's tunnel design
converts a stolen bearer token into a live share of production traffic, with no
steering control available to the victim.

### 1.4 The mitigation for 1.3 is the CF_Binding cookie, and it is optional and admin-controlled.

Claim: a stolen CF_Authorization cookie alone is not replayable from another
browser, but the protection is off unless the operator turns it on, and it does
not stop an active relay.

Evidence (Cloudflare docs, "Authorization cookie", last updated Aug 3 2026):
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/
  Cookie table: CF_Authorization (application domain) HttpOnly "Admin choice
  (Default: None)", SameSite "Admin choice (Default: None)", Required "Yes".
  CF_Binding: HttpOnly "Yes", SameSite "None", Required "Optional".
  "The binding cookie (CF_Binding) is an optional cookie issued when a user
  successfully authenticates. The binding cookie is sent by the user's browser
  and tied to a specific application's CF_Authorization cookie. This cookie is
  stripped at Cloudflare's network and never forwarded to the origin server.
  The CF_Authorization cookie cannot be used without the associated binding
  cookie, which prevents a stolen CF_Authorization cookie from being reused by
  an attacker."
Evidence (y4nush): "this mitigation only addresses session hijacking within
  Cloudflare applications. The request will still be intercepted."
Label: [verified]

Note the defaults: HttpOnly defaults to None and SameSite defaults to None on
the application token. The binding cookie is Optional. Both are dashboard
settings an operator must remember to set, and neither is enforced by
Terraform unless the operator writes it.

### 1.5 cloudflared has almost no CVE history. The risk is credential handling and configuration, not code execution in the connector.

Claim: across the public advisory record, cloudflared has two advisories, both
Windows local privilege escalation in the installer, both old, both patched.

Evidence (`gh api repos/cloudflare/cloudflared/security-advisories`, two
results):
  GHSA-7mjv-x3jf-545x / CVE-2023-1314, severity high, "Local Privilege
    Escalation Vulnerability in cloudflared's Installer", published
    2023-03-21. NVD description: installer <= 2023.3.0 for Windows 32-bit
    devices, local attacker with no administrative permissions.
  GHSA-hgwp-4vp4-qmm2 / CVE-2020-24356, severity medium, "Local Privilege
    Escalation in cloudflared", published 2020-09-16. NVD description:
    versions < 2020.8.1 on Windows, unprivileged user exploits a
    misconfiguration; one location cloudflared reads from is not secure by
    default.
Evidence (NVD keyword search "cloudflared", 1 result):
https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=cloudflared
Evidence (release cadence, `gh api repos/cloudflare/cloudflared/releases`):
  2026.10.5 published 2026-10-27T13:31:37Z
  2026.10.4 published 2026-10-26T11:19:58Z
  2026.10.3 published 2026-10-21T13:17:53Z
  2026.10.2 published 2026-10-20T09:17:26Z
  2026.10.1 published 2026-10-15T17:15:26Z
  (`gh api repos/cloudflare/cloudflared`: Apache-2.0, Go, 16337 stars,
  572 open issues, pushed_at 2026-10-29T12:12:16Z)
Evidence (NVD keyword "argo tunnel": 0 results; NVD virtualMatchString
cpe:2.3:a:cloudflare:cloudflare_access: 0 results)
Label: [verified]

Verdict: patching cloudflared is not where the security budget should go. The
budget should go to token custody and to network placement. That is a
conclusion, and it is the opposite of the instinct to "keep everything
patched".

### 1.6 Private Network routing is the highest-blast-radius thing a stolen token buys, and it is invisible in cloudflared's own logs.

Claim: adding a CIDR to a tunnel's Private Network configuration gives the
token holder layer-3 access to that whole range as if collocated, and the
private network portion of the config does not appear in cloudflared's stdout
configuration dump.

Evidence: https://www.guidepointsecurity.com/blog/tunnel-vision-cloudflared-abused-in-the-wild/
  "Private Networks, allows an administrator to provide access to an entire
  CIDR range through the tunnel, allowing a client device, such as an
  attacker's machine, network access as though they were physically collocated
  with the victim machine hosting the tunnel."
  "Worryingly, while the command line output for the victim machine does update
  with a new configuration, the private network details do not show up in the
  output. This means TAs using the Private Network feature can keep this
  portion of their configuration hidden from defenders, even if the defenders
  are monitoring the Cloudflared execution in real time."
  The same post documents on-the-fly config changes: deleting a public hostname
  from the dashboard immediately updates the connector's ingress, so an
  attacker can enable RDP, collect data, and disable it again.
Evidence (abuse in the wild, same source): threat actors pre-create a tunnel,
  get the token onto a victim host, and run `cloudflared tunnel run --token
  <token>`; the tunnel pulls its configuration at connect time, so nothing
  about the attacker's infrastructure is present on the victim beforehand.
Label: [verified]

Consequence: if the operator ever adds a Private Network / VPC Network binding
covering the CI or storage network, a stolen token stops being "someone can
impersonate my web app" and becomes "someone is inside my flat network". This
is the argument for VPC Services (per host and port, registered explicitly)
over VPC Networks (bind the whole tunnel) in the spec.

### 1.7 A compromised Worker holding a tunnel token: what it can and cannot do.

Claim: a Worker cannot run cloudflared, so the exposure is the token as a
secret value plus the blast radius of whatever the Worker can reach. The
exfiltration path is wide open by default.

Evidence (Worker limits, Cloudflare docs "Limits", last updated Oct 12 2026):
https://developers.cloudflare.com/workers/platform/limits/
  Worker size 64 MiB (Free and Paid). Environment variables 64/Worker Free,
  128/Worker Paid, 5 KB each. Simultaneous outgoing connections per request: 6
  (both plans). Memory per isolate 128 MB. CPU time 10 ms Free / 5 min Paid
  (default 30 s). Subrequests 50/request Free, 10,000/request Paid.
Evidence (subrequest limit change, Cloudflare changelog 2026-02-11):
https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/
  "Workers on paid plans are now limited to 10,000 subrequests per invocation,
  but this limit can be increased up to 10 million by setting the new
  `subrequests` limit in your Wrangler configuration file... Workers on the
  free plan remain limited to 50 external subrequests and 1000 subrequests to
  Cloudflare services per invocation."
Evidence (egress can be constrained, but only via a specific binding, Cloudflare
changelog 2026-06-05):
https://developers.cloudflare.com/changelog/post/2026-06-05-gateway-egress/
  "Workers using a VPC Network binding with `network_id: "cf1:network"` now
  egress to public Internet destinations through Cloudflare Gateway. This means
  your existing Zero Trust traffic policies - DNS, HTTP, Network, and egress -
  extend to traffic that originates from your Workers."
  "Enforcement. Any existing Gateway policy whose selectors match a Worker
  request will apply - including allow / block lists, DNS category filtering,
  and HTTP destination rules."
Label: [verified]

Verdict: real, and cheap for the attacker. A Worker's dependency tree is the
supply chain surface (64 MiB of npm), and every secret bound to it is readable
at runtime. Unless the operator routes egress through `cf1:network` and writes
a Gateway policy that allowlists destinations, a compromised control-plane
Worker ships every secret it holds to any host on the Internet. A Gateway
policy that only blocks categories does not stop a single hardcoded exfil
hostname.

### 1.8 SSRF from a Worker: Cloudflare itself draws the line between VPC Services and VPC Networks, and the line is exactly the SSRF line.

Claim: VPC Services (a registered host and port) are SSRF-resistant by
Cloudflare's own statement. VPC Networks (bind a whole tunnel, choose the
destination at runtime) are not, and are the SSRF surface.

Evidence (Cloudflare docs, "VPC Services", last updated Oct 12 2026):
https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/
  "VPC Services enforce that requests are routed to their intended service
  without exposing the entire network, securing your workloads and preventing
  server-side request forgery (SSRF)."
  A VPC Service is a fixed Type, Tunnel ID, hostname or IPv4/IPv6, and ports.
Evidence (Cloudflare docs, "Cloudflare Workers VPC", last updated Oct 12 2026):
https://developers.cloudflare.com/workers-vpc/
  "VPC Networks give Workers broader access - bind to an entire Cloudflare
  Tunnel, Cloudflare Mesh network, or Cloudflare WAN on-ramp (GRE, IPsec, CNI)
  without pre-registering individual hosts. The URL or address you pass at
  runtime determines the destination."
Label: [verified]

Verdict: if any part of the control plane lets a user-supplied URL reach a VPC
Network binding, that is textbook SSRF into the operator's private network. If
it reaches only VPC Services, the destination is fixed at configuration time
and the attack does not exist. This is the most actionable single line in this
document for the spec.

### 1.9 Whether a Worker's default `fetch()` can reach RFC1918 space: I could not verify this from a Cloudflare primary source.

Claim (third-party, plausible, unconfirmed): Cloudflare's edge egress does not
route to RFC1918 and there is no fixed tenant metadata endpoint, so a Worker
fetch to an internal address fails and the residual DNS-rebind blast radius is
small.

Evidence: https://ozgurodun.com/blog/ssrf-guard-cloudflare-workers/
  "Cloudflare's edge egress doesn't route to RFC1918 space and there's no
  tenant metadata endpoint sitting at a fixed address the way AWS has
  169.254.169.254. The blast radius of a successful rebind here is close to
  nil."
Label: [unverified]

Why unverified: that is a practitioner's blog, not a Cloudflare statement. The
only Cloudflare primary sources I read on this are the VPC Services page above
("preventing server-side request forgery (SSRF)" as a property of the
per-service binding) and the existence of the Workers VPC product itself, which
is described as the way to reach services "that are not accessible from the
public Internet". Both are consistent with the claim but neither states it. Do
not put "Workers cannot reach private IPs" in the spec as a control. Put "we
route private access through registered VPC Services" in the spec as a control.

### 1.10 SSRF from a Worker: the real residual risks are redirects, IPv6, and DNS-rebind TOCTOU, and there is no IP pinning.

Claim: a homegrown SSRF guard in a Worker is bypassable in three standard ways,
and the residual DNS-rebind window cannot be fully closed on the platform.

Evidence: https://ozgurodun.com/blog/ssrf-guard-cloudflare-workers/
  Three bypasses, verbatim structure: (1) "Checking A records and forgetting
  AAAA" - an AAAA-only answer with `::1` or `fc00::/7` passes an A-only check;
  (2) "Guarding the first hop and trusting every redirect after it" -
  "a `fetch()` that follows redirects will happily walk from a clean public
  host to an internal one on hop two"; (3) "Trusting `new URL()` to catch
  obfuscated IPs - for literals only" - WHATWG normalizes decimal, octal and
  hex literals, but "URL normalizes literals it can see in the string. It
  cannot see what a hostname resolves to."
  Residual: "`fetch()` re-resolves DNS at connect time, and Workers gives you
  no IP-pinning for arbitrary hosts (`cf.resolveOverride` only helps for hosts
  already in a zone on your account). A TTL-0 DNS-rebind between your resolve
  check and the actual fetch stays theoretically open."
  On Workers there is no native resolver, so DoH
  (`cloudflare-dns.com/dns-query?type=1` for A, `type=28` for AAAA) is the
  practical option.
Label: [verified] as a practitioner report. Not a Cloudflare advisory.

### 1.11 Cloudflare's own edge can be used as an SSRF proxy against the operator's origin, and Cloudflare closed that report as Informative.

Claim: on cleartext HTTP, a request to any Cloudflare IP with an overridden Host
header or an absolute-form request line causes Cloudflare to fetch an arbitrary
HTTP hostname and return the response. This defeats the very common
"allow only Cloudflare IPs" origin allowlist, including in DNS-only mode.

Evidence: https://riversecurity.eu/turning-cloudflare-into-an-ssrf-engine-reaching-what-you-were-never-meant-to-see/
  "After a long technical back-and-forth, Cloudflare ultimately closed the
  report as Informative, stating that the behavior is expected and
  intentional."
  "We set up a web service following cloudflares instructions of IP
  whitelisting... Using the Absolute Form Request: 'GET
  http://cloudflaretest.REDACTED.no'... we are able to access the service, even
  though the configuration in Cloudflare is not set to proxy the traffic."
  Cloudflare's stated position: anycast routing relies on the Host header or
  absolute-form requests, any edge IP can serve any customer, and forwarding
  based on Host is "fundamental proxy behaviour".
Label: [verified] as the researchers' report of their own submission.

Consequence: an IP allowlist is not a control on this design. Do not write
"restrict the origin to Cloudflare IP ranges" as a security boundary anywhere
in the spec. It is a rate-control at best.

### 1.12 Service token versus user session: what each actually buys.

Claim: these are not two flavours of the same thing. A service token is a
long-lived, identity-less, un-MFA-able bearer credential that only Service Auth
policies will accept. A user session is short-lived, IdP-bound, and (if
configured) browser-bound.

Evidence (Cloudflare docs, "Service tokens", last updated Oct 2 2026):
https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
  Client ID plus Client Secret, sent as `CF-Access-Client-Id` and
  `CF-Access-Client-Secret` headers. Example duration in both the API and
  Terraform examples is `8760h`, with `expires_at` one year after
  `created_at`. Secret format since 2026-08-26 is
  `cfast_[40 alphanumeric][8-character checksum]`; legacy 64-hex secrets
  "continue to work and do not require rotation".
  "Make sure to set the policy action to Service Auth; otherwise, Access will
  prompt for an identity provider login."
  Rotation: "The Client ID remains the same, but Access generates a new Client
  Secret", with a grace period whose "Available grace periods range from one
  hour to 30 days".
  Revocation: "If you need to revoke access before the token expires, delete
  the token."
  Strict service token authentication (a Zero Trust org setting):
    "If authentication or authorization fails, Access always returns 401 or 403
    instead of redirecting the client to the login page with 302."
    "Only Service Auth policies can authorize the request. Access ignores Allow
    policies and any CF_Authorization cookie sent with the request."
    "Access does not return a CF_Authorization cookie to the client after
    successful authentication."
    "Failed requests for recognized service tokens appear in Access
    authentication logs... It does not log malformed headers or unknown Client
    IDs."
    "Zero Trust organizations created on or after 2026-10-05 have strict
    service token authentication turned on by default and cannot turn it off."
Evidence (Cloudflare docs, "Session management", last updated Oct 14 2026):
https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/
  Two JWTs per login: a global session token on the team domain, and an
  application token on the protected hostname. Global session duration range
  "between 15 minutes and one month. The default value is 24 hours."
  Order of enforcement: client session, policy session, application session,
  global session. "The global token cannot be used to directly access an
  application."
  For SSH/RDP/VNC: "Cloudflare does not control the length of an active SSH,
  VNC, or RDP session... When the session duration elapses, any active SSH
  connections through that application are closed."
Label: [verified]

What this buys in practice, stated plainly:

| property | service token | user session |
| --- | --- | --- |
| lifetime | operator-chosen, example 1 year | default 24 h, max 1 month |
| identity | none, it is a shared secret | IdP email, user_uuid, device posture |
| MFA | impossible | whatever the IdP enforces |
| replayable from another client | yes, headers only | blocked if CF_Binding is on |
| per-request audit attribution | token name only | user email, country, IP, device |
| revocation | delete the token | expires, or policy change |

Verdict: a service token is strictly weaker than a user session on every axis
except convenience, and it is the thing a CI system will ask for. The spec must
not use long-lived service tokens as the CI-to-control-plane credential. It
should mint short-lived, scoped credentials inside the control plane and let
the Worker hand them out, so that revocation is a database write rather than a
dashboard action.

### 1.13 Access in front of a Worker does not authenticate the Worker. The Worker must validate the JWT itself.

Claim: putting Cloudflare Access in front of a Worker gives you an enforcement
point at the edge, but the Worker still has to verify the `Cf-Access-Jwt-Assertion`
header against the account's public keys, or any request that reaches the
Worker by another path is trusted.

Evidence (Cloudflare docs, "Validate JWTs", last updated May 6 2026):
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
  "When Cloudflare Access is in front of your Worker, your Worker still needs
  to validate the JWT that Cloudflare Access adds to the
  `Cf-Access-Jwt-Assertion` header on the incoming request."
  "We recommend validating the `Cf-Access-Jwt-Assertion` header instead of the
  `CF_Authorization` cookie, since the cookie is not guaranteed to be passed."
  "By default, Access rotates the signing key every 6 weeks. This means you
  will need to programmatically or manually update your keys as they rotate.
  Previous keys remain valid for 7 days after rotation to allow time for you
  to make the update."
  Keys at `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/certs`,
  RS256, per-application `aud` tag.
Label: [verified]

Two operational traps follow. First, the 7-day overlap is a cliff: an origin
that caches keys longer than 7 days starts rejecting valid tokens. Second, a
Worker that validates JWTs has to fetch the JWKS on a cold path, which is a
subrequest and a latency cost on every cold start.

### 1.14 The Worker-to-data-plane path does not go through Access at all. It is a network binding.

Claim: a Worker reaching a private service via a VPC Service binding is a
network-level binding, not an Access-authenticated request. There is no
CF_Authorization on that hop unless the operator's origin demands one.

Evidence (Cloudflare docs, "Cloudflare Workers VPC"):
https://developers.cloudflare.com/workers-vpc/
  "VPC Services let you bind to a specific host and port in your private
  network. Connect a Cloudflare Tunnel to your infrastructure, register each
  target as a VPC Service, and use the binding API from your Worker."
Evidence (same page, VPC Services):
https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/
  Binding requires the "Connectivity Directory Bind" role; creating services
  requires "Connectivity Directory Admin".
Evidence (consistent finding in the same research set, A5 section 1.3):
/workspace/cfb-20261029111146/research/A5-zero-trust-vpc.md
Label: [verified]

Consequence: the Worker's authority over the data plane must be enforced at the
origin. If the origin trusts "it came through the tunnel", then anyone who can
reach the tunnel (see 1.1) has the Worker's authority. This is the same class of
mistake as trusting the Cloudflare IP allowlist in 1.11.

### 1.15 DNS rebinding: which of these attacks are real and which are not.

Not real: rebinding the Cloudflare-proxied hostname that serves the SPA. An
attacker would need to control DNS for the operator's zone, and Cloudflare's
anycast edge serves any Host, so there is no per-customer origin to confuse.
Cloudflare's own guidance treats DNS rebinding as a local-server problem, and
Cloudflare's reference implementation defends against it with Origin and Host
validation rather than with anything network-level.

Evidence (Cloudflare docs, MCP handler APIs):
https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/
  "The Workers wrapper validates every present browser Origin. It rejects
  malformed, opaque, and non-HTTP Origins with 403. Origin-less non-browser MCP
  clients remain valid."
  "The handler also applies matching Host checks to localhost and workers.dev
  endpoints. This keeps local DNS rebinding protection without requiring a
  separate Origin list for the common Workers routes."
  "The handler does not infer a Host allowlist from `request.url`. If a
  deployment accepts arbitrary Host values, validate them before calling the
  handler. Local servers outside Cloudflare Workers should follow the upstream
  SDK DNS rebinding guidance."
  "CORS response headers are not authentication."
Label: [verified]

Real, medium priority: any data-plane console the operator reaches on a private
address. If the operator's laptop is on the same LAN as a self-hosted dashboard,
and that dashboard does no Host or Origin validation, a rebound page served
from an attacker's domain can drive it. This is the classic home-lab case and it
is orthogonal to Cloudflare.

Real, low priority but worth naming: cloudflared's `matchSNItoHost` and
`httpHostHeader` origin parameters rewrite what the origin sees, so an origin
that routes on Host can be made to route somewhere the operator did not intend.

Evidence (Cloudflare docs, "Origin parameters", last updated Aug 4 2026):
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/
  `matchSNItoHost` default false: "When true, cloudflared sets the Server Name
  Indication (SNI) during the TLS handshake to the request Host value sent to
  the origin... This setting overrides Origin Server Name for each request."
  `httpHostHeader` default "": "Sets the HTTP Host header on requests sent to
  the local service."
Label: [verified]

Verdict: DNS rebinding is not a Cloudflare-Tunnel attack and should not be
listed as one in the spec. It is a self-hosted-console attack, and the fix is
Host/Origin validation in the operator's own services.

### 1.16 Lateral movement from a CI job to the management plane: the highest-probability path in the model.

Claim: CI runs untrusted code by design. On the operator's own metal, that code
shares a host, a kernel, and often a network with the things that hold the
management plane's credentials. The attack is not exotic.

Evidence (credential exposure inside an untrusted execution environment, from
Cloudflare's own sandbox security page, which is the most directly applicable
text I found):
https://developers.cloudflare.com/sandbox/concepts/security/
  "Isolation does not limit what the code does inside its own sandbox. Assume
  that the code uses everything it can reach there, including the files,
  credentials, and network access that your Worker provides."
  "Every process in a Container runs on the same Linux system. The processes
  can read the same files, see each other, and connect to the same localhost
  ports... In a deployed sandbox, every process has the same Linux
  capabilities as root, so file permissions do not restrict it, and it can
  switch back to root."
  Worked example: "If your Worker puts a token in the clone URL, Git saves that
  URL in the .git/config file of the repository. The tests, and every
  dependency they load, run with the same access as the agent. Any of that code
  can read the token." And the fix: "Credentials are safer outside the
  sandbox. A Container can send its request without the credential, and an
  outbound handler in your Worker adds the credential after the request leaves
  the sandbox."
  "Each destination you allow gives the code a way to send out what it can
  read. If you turn on Internet access so that npm install can download
  packages, a dependency can also send the token to any server."
  "A Container starts with enableInternet: false by default, so it cannot reach
  the Internet. Only requests that an outbound handler in your Worker
  intercepts leave it... With Internet access on, connections to other ports
  go out directly."
Label: [verified]

Combined with 1.2 (the token is in the process table of any host running
cloudflared) and 1.6 (Private Network gives layer-3 reach), the path is:
untrusted CI job -> reads a tunnel token or a data-plane API credential from
the host -> reaches the management plane's origin directly over the private
network, or installs its own cloudflared replica with the stolen token.

Verdict: real, and it is the attack the operator is most likely to actually
suffer, because the trigger (a malicious or merely compromised npm package in a
CI job) is routine.

### 1.17 Cloudflare's own multi-tenant compute had a real cross-tenant disclosure, disclosed and fixed in September 2026.

Claim: Cloudflare Containers and Sandboxes ran on dm-thin pools with
`skip_block_zeroing`, letting a Workers Paid customer recover residual disk
blocks from other customers' containers on the same host. Each container runs
in its own Firecracker VM.

Evidence (Cloudflare blog, "How Cloudflare addressed a cross-tenant data
exposure vulnerability in Containers"):
https://blog.cloudflare.com/containers-cross-tenant-vulnerability
  Reported 2026-09-04 by Oren Yomtov of Accomplish.
  "Cloudflare Containers run workloads on multi-tenant infrastructure and
  automatically assign them to eligible servers; customers cannot select the
  underlying host."
  "Each container lives inside a dedicated virtual machine powered by the
  Firecracker virtual machine monitor. Firecracker presents this disk to the
  virtual machine as /dev/vdc."
  "The affected pool configuration included the following option:
  skip_block_zeroing."
  "The researchers ultimately observed residual material on 18 of 24 placements
  and 20 of 22 underlying nodes across four continents. The recovered block
  types included directory structures, database pages, and structurally
  complete SQLite databases."
  Fix: removed skip_block_zeroing, retired all running container disks, drained
  hosts, restarted VMs, cleared image caches.
Label: [verified]

Why this matters here, in both directions. First, it is evidence that
multi-tenant neighbours are a real leak channel, which is an argument for the
operator's own single-tenant metal. Second, it is evidence that Cloudflare
discloses and fixes properly and quickly, which the alternatives in 1.19 do not
reliably do.

### 1.18 Cloudflare Tunnel public hostnames are internet-reachable by default. Access is opt-in per hostname.

Claim: a tunnel with a public hostname serves the Internet. Nothing requires an
Access application to exist.

Evidence (Cloudflare docs, "Require Access protection", last updated Apr 21
2026):
https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/require-access-protection/
  "This deny-by-default approach prevents accidental exposure of internal
  resources to the public Internet. Without this setting, a developer could
  deploy a new application or create a DNS record and inadvertently expose the
  resource before configuring an Access application."
  Block page is "Error 1050: This resource is blocked by this account's
  Default-Deny policy."
  Mitigation is the account setting "Block traffic to all domains in this
  account", with an optional "Hostnames to Exempt" list.
Label: [verified]

Verdict: this is a one-click control that must be on from day one, and it must
be in Terraform, because the failure mode is "somebody added a hostname".

### 1.19 The non-Cloudflare tunnel/VPN options carry a materially worse recent advisory record.

Claim: if the spec replaces Cloudflare Tunnel with frp, Netmaker, OpenZiti or
similar, it inherits a recent history of authentication-bypass and
key-disclosure advisories that cloudflared does not have.

Evidence (GitHub security advisories, read 2026-10-29):
  fatedier/frp:
    GHSA-pq96-pwvg-vrr9 / CVE-2026-40910, medium, published 2026-04-13.
      NVD: "frp contains an authentication bypass in the HTTP vhost routing
      path when routeByHTTPUser is used as part of access control. In
      proxy-style requests, the routing logic uses the username from
      Proxy-Authorization to select the routeByHTTPUser backend, while the
      access control check uses credentials from the regular Authorization
      header." Affected 0.43.0 to 0.68.0. CVSS 3.1 scores recorded in NVD as
      both 6.5 (CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:L/A:N) and 9.1
      (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N).
    GHSA-26gq-p25f-99cp / CVE-2026-73564, medium, published 2026-07-23,
      "Unauthenticated Remote Denial of Service in the frp SSH Tunnel Gateway
      via Integer Overflow".
  gravitl/netmaker:
    GHSA-hmqr-wjmj-376c / CVE-2026-29194, high, published 2026-03-07. NVD:
      "the Authorize middleware in Netmaker incorrectly validates host JWT
      tokens. When a route permits host authentication (hostAllowed=true), a
      valid host token bypasses all subsequent authorization checks without
      verifying that the host is authorized to access the specific requested
      resource. Any entity possessing knowledge of object identifiers (node
      IDs, host IDs) can craft a request with an arbitrary valid host token to
      access, modify, or delete resources belonging to other hosts." Patched
      1.5.0. CVSS 3.1 8.1, CVSS 4.0 8.6.
    GHSA-4hgg-c4rr-6h7f / CVE-2026-29196, high, published 2026-03-07. NVD:
      "a user assigned the platform-user role can retrieve WireGuard private
      keys of all wireguard configs in a network by calling GET
      /api/extclients/{network} or GET /api/nodes/{network}... the API
      endpoints return full records, including private keys, without filtering
      based on the requesting user's ownership." Patched 1.5.0.
    Also: GHSA-ch3w-9456-38v3 / CVE-2026-29195 (admin to super-admin
      privilege escalation), GHSA-r8cr-4f9w-7r75 / CVE-2026-32599 (SQL
      injection), GHSA-rhr9-hgcm-x289 / CVE-2026-29771 (DoS via shutdown
      endpoint), GHSA-gx3q-6x7r-8mrq / CVE-2026-81034 (SMTP TLS verification
      bypass), and the older CVE-2023-32078 / CVE-2023-32079.
  openziti/ziti (8 advisories, all published 2026-08-12 to 2026-08-21):
    GHSA-mrpr-756c-xm47, critical, "Improper peer certificate validation
      allows identity spoofing on controller cluster, router links, and
      metrics".
    GHSA-7868-235p-7497, medium, "Controller does not validate the API session
      token when creating circuits via CreateCircuitV3".
    GHSA-cc5m-7mhm-xh9f, medium, "Control-channel connections with a
      channel-type header bypass router certificate and identity
      verification".
    Plus GHSA-hhm9-wf63-g7qj, GHSA-4h58-w989-xgg4, GHSA-354c-gpg9-j988,
      GHSA-q8g9-jc4c-jp6q, GHSA-j952-6x8x-jmj6.
  tailscale/tailscale:
    GHSA-vqp6-rc3h-83cp / CVE-2022-41924, critical, "Tailscale Windows daemon
      is vulnerable to RCE via CSRF", published 2022-11-21.
    GHSA-vfgq-g5x8-g595 / CVE-2023-28436, medium, FreeBSD SSH group ID.
  wireguard/wireguard-go: no advisories returned.
Label: [verified]

Verdict: this is a real trade, not a free win. Moving off Cloudflare Tunnel
trades a vendor with a public bug bounty, published post-mortems, and a nearly
empty connector CVE record for smaller projects whose recent advisories are
dominated by authentication bypass and private-key disclosure, which are exactly
the failure classes a management plane cannot survive.

### 1.20 Availability is part of the threat model, and a Workers-hosted control plane has no independent availability from Cloudflare.

Claim: during the 2025-11-18 Cloudflare outage, Access authentication failed
for most users, Workers KV returned elevated 5xx, and the dashboard login page
was unusable. Existing sessions survived; new logins did not.

Evidence (Cloudflare blog, "Cloudflare outage on November 18, 2025"):
https://blog.cloudflare.com/18-november-2025-outage
  "On 18 November 2025 at 11:20 UTC... Cloudflare's network began experiencing
  significant failures to deliver core network traffic."
  Access: "Authentication failures were widespread for most users, beginning at
  the start of the incident and continuing until the rollback was initiated at
  13:05. Any existing Access sessions were unaffected. All failed
  authentication attempts resulted in an error page, meaning none of these
  users ever reached the target application while authentication was failing."
  Workers KV: "Workers KV returned a significantly elevated level of HTTP 5xx
  errors as requests to KV's front end gateway failed due to the core proxy
  failing."
  Dashboard: "While the dashboard was mostly operational, most users were
  unable to log in due to Turnstile being unavailable on the login page."
  Timeline: "Core traffic was largely flowing as normal by 14:30... As of 17:06
  all systems at Cloudflare were functioning as normal."
Label: [verified]

Consequence: if the only path to the management plane is Cloudflare, then a
Cloudflare incident is a management-plane outage, and the operator cannot
console into his own machines either, because Access is the door. Existing
browser sessions kept working, which means the break-glass path is a
long-lived session the operator already holds, which is itself a bad control.

### 1.21 Detection of a rogue replica is real-time only, and past connector logs do not exist.

Claim: the only reliable detector for a stolen token being used to run a
replica is polling the cfd_tunnel API for unrecognised `origin_ip` values, and
it gives current state, not history.

Evidence (y4nush post, Detection section):
  "Unfortunately, while attempting to locate logs after exploitation, I
  couldn't find any reliable sources for viewing past logs from Cloudflare
  connectors."
  "For now, the most effective method I have found involves querying the
  Cloudflare One API for Cloudflared tunnels. It is important to note that this
  method only provides real-time information."
  The query returns `connections[]` with `colo_name`, `origin_ip`,
  `opened_at`, `client_id`, `client_version`.
Evidence (Access authentication logs exist and are exportable, Cloudflare docs,
last updated May 1 2026):
https://developers.cloudflare.com/cloudflare-one/insights/logs/dashboard-logs/access-authentication-logs/
  "Access authentication logs help you track who accessed your protected
  applications, when they accessed them, and whether they were allowed in."
  Export needs the `Access: Audit Logs Read` API token permission, endpoint
  `GET /accounts/$ACCOUNT_ID/access/logs/access_requests`.
  Fields include user_email, ip_address, app_uid, app_domain, action,
  connection, allowed, created_at, ray_id, country.
  Strict-mode caveat from 1.12: Access "does not log malformed headers or
  unknown Client IDs".
Label: [verified]

Retention window for Access authentication logs: [unverified]. I did not find a
Cloudflare primary source stating a retention period, and I am not going to
guess one. Treat "export to Logpush or a SIEM immediately" as mandatory rather
than optional.

### 1.22 Two cloudflared origin settings are a real MITM surface on the Cloudflare-to-origin hop, and both have safe defaults.

Claim: `noTLSVerify` defaults to false (correct) and VPC Services TLS
verification defaults to `verify_full` (correct). Both are one flag away from
accepting any certificate.

Evidence (Origin parameters):
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/
  `noTLSVerify` default false. "When true, TLS verification is disabled. This
  will allow any certificate from the origin to be accepted."
  `caPool` default "": "Local file path to the certificate authority (CA) for
  your origin server certificate... cloudflared adds these certificates to its
  default trust pool."
Evidence (VPC Services):
https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/
  Modes: `verify_full` "Verify the full certificate chain and hostname
  (default)", `verify_ca` "Verify the certificate chain only, skip hostname
  verification", `disabled` "Do not verify the server certificate".
  "Workers VPC trusts... Publicly trusted certificates... Cloudflare Origin CA
  certificates. Free certificates issued by Cloudflare that encrypt traffic
  between Cloudflare and your origin. Origin CA certificates are not trusted by
  browsers, but are trusted by Workers VPC when connecting to your private
  services."
  "If your origin service presents a certificate that is not issued by a
  publicly trusted CA or by Cloudflare Origin CA, the TLS handshake will fail
  and fetch() will throw an exception."
Label: [verified]

Consequence: `disabled` on a VPC Service turns the private hop into plaintext
trust, and `noTLSVerify` on a tunnel does the same. Both belong in a policy
check, not in a runbook.

### 1.23 A Worker on the same hostname breaks Bypass policies that use device posture.

Claim: Bypass policies containing device posture rules silently stop working
when a Worker intercepts the request.

Evidence (Cloudflare docs, "Policies", last updated Oct 1 2026):
https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
  "Bypass policies which contain device posture check rules will not function
  when: Zaraz is enabled for the zone protected by Access; A Worker intercepts
  the request."
  "To work around these limitations and to bypass Access, we recommend changing
  the policy action to Service Auth."
  Also: "As part of implementing a Zero Trust security model, Cloudflare does
  not recommend using Bypass to grant direct permanent access to your internal
  applications."
Label: [verified]

Consequence: the spec's SPA is a Worker. Any Bypass policy on that hostname is
either a silent no-op for posture rules or an explicit anti-pattern. Do not
design around Bypass.

### 1.24 Worker-side resource ceilings that bound what the control plane can do.

Claim: the control plane runs inside a 128 MB isolate with 6 simultaneous
outgoing connections per request and a 30 s default CPU budget.

Evidence (Cloudflare docs, "Limits", last updated Oct 12 2026):
https://developers.cloudflare.com/workers/platform/limits/
  Memory per isolate 128 MB: "When an isolate exceeds 128 MB, the Workers
  runtime lets in-flight requests complete and creates a new isolate for
  subsequent requests. During extremely high load, the runtime may cancel some
  incoming requests to maintain stability."
  Simultaneous outgoing connections per request: 6 (Free and Paid).
  CPU time per HTTP request: 10 ms Free, 5 min Paid with default 30 seconds,
  configurable via `"limits": {"cpu_ms": 300000}`.
  Environment variables: 64/Worker Free, 128/Worker Paid, 5 KB each.
  Error 1102 "Worker exceeded resource limits" on CPU or memory breach.
Label: [verified]

Consequence: a control plane that fans out to N machines per dashboard load
cannot do it in one request. 6 connections is the hard ceiling. This is a
design constraint that looks like a performance problem and is actually a
correctness problem: a partially-completed fan-out is a control plane that
reports a stale or wrong state.

---

## 2. What this changes for the spec

1. Treat the tunnel token as the account's root credential, not as a config
   value. Store it in a real secret store, never in an environment variable on
   a shared host, never in a CI job, never in Terraform state without
   encryption. Write the rotation procedure down as a runbook with the
   two-replica, outside-working-hours sequence from the Tunnel permissions
   page, and rehearse it. Reason: 1.1, 1.2. A token in a process table is
   readable by every process on that host.

2. Run cloudflared on dedicated, minimal hosts that run nothing else. CI
   runners, container hosts and storage nodes do not get a cloudflared replica
   on the same kernel. Reason: 1.2 and 1.16. This is the single highest-value
   isolation decision in the design, and it is free.

3. Prefer VPC Services over VPC Networks for every Worker-to-data-plane call,
   and register each host and port explicitly. Reason: 1.8. Cloudflare states
   outright that VPC Services prevent SSRF and that VPC Networks let the
   runtime URL choose the destination. If the spec uses VPC Networks, then any
   user-influenced URL in the control plane is an SSRF into the operator's own
   network.

4. Never put "restrict the origin to Cloudflare IP ranges" in the spec as a
   security control. Reason: 1.11. Cloudflare's own edge will fetch an
   arbitrary HTTP hostname on request, and the report was closed Informative.
   The control is authentication at the origin, not a network allowlist.

5. The origin must authenticate the Worker, not the tunnel. Every data-plane
   API checks a credential that only the control plane holds, and the
   credential is not derivable from anything on the network path. Reason: 1.14
   and 1.11. "It came through the tunnel" is not an identity.

6. Turn on "Block traffic to all domains in this account" in Access settings on
   day one, and put it in Terraform. Reason: 1.18. The failure mode is a DNS
   record or a hostname added by a future version of the operator.

7. Set HttpOnly and SameSite on the CF_Authorization application cookie
   explicitly, and enable the CF_Binding cookie explicitly. Reason: 1.4. The
   defaults are None and Optional. Without the binding cookie, a rogue replica
   (1.3) harvests reusable session cookies.

8. Mint short-lived, scoped credentials inside the control plane for CI. Do not
   issue Access service tokens to CI runners. Reason: 1.12. A service token is
   a one-year, identity-less, un-MFA-able bearer secret whose only revocation
   is deletion. The control plane can issue a 15-minute credential and revoke
   it with a database write.

9. Enable strict service token authentication and verify the org setting is
   actually on. Reason: 1.12. Without it, Access will honour an Allow policy
   and a CF_Authorization cookie on a request that carries service token
   headers, which is a privilege-confusion surface.

10. Route Worker egress through Cloudflare Gateway with an allowlist, using the
    `cf1:network` VPC Network binding, and make the allowlist destination-based
    rather than category-based. Reason: 1.7. Without it, a compromised
    control-plane Worker exfiltrates every secret it holds. A category block
    does not stop one hardcoded hostname.

11. Build the rogue-replica detector before the first production deploy: poll
    `GET /accounts/$ACCOUNT_ID/cfd_tunnel` on a schedule, alert on any
    `connections[].origin_ip` outside a pinned set, and alert on
    `client_version` drift. Ship the output somewhere with history, because
    Cloudflare keeps none. Reason: 1.21.

12. Pin cloudflared to a specific version and update deliberately, not
    automatically. Reason: 1.5 and A5 section 2.13. The CVE record does not
    justify autoupdate urgency, and the rotation procedure in 1.1 makes an
    unplanned restart expensive.

13. Assume the control plane is unavailable during a Cloudflare incident, and
    build the break-glass path deliberately rather than relying on a session
    that happens to still be valid. Reason: 1.20. On 2025-11-18 new logins
    failed for roughly 1h45m while existing sessions worked. A control plane
    whose only door is Access has no independent availability.

14. Treat the "use something other than Cloudflare Tunnel" requirement as a
    security regression to be justified, not a default. Reason: 1.19. frp,
    Netmaker and OpenZiti all shipped authentication-bypass or
    private-key-disclosure advisories in 2026. If the spec still requires a
    non-Cloudflare orchestrator, that is about control and cost, and the
    security argument should be made explicitly and separately.

15. For untrusted CI execution, follow Cloudflare's own sandbox guidance
    literally: credentials live outside the execution environment, an outbound
    handler adds them per request, internet access is off by default, and every
    allowed destination is treated as an exfiltration channel. Reason: 1.17 and
    the sandbox security page. This is the most directly reusable text in the
    whole research set and it is Cloudflare's, not mine.

16. Budget the Worker's hard ceilings into the API design. Fan-out to more than
    6 destinations per request, or more than 30 s of CPU, or more than 128 MB
    of state, does not work. Reason: 1.24. Design the control plane as a
    queue-plus-poll system rather than a request-time fan-out, so a partial
    fan-out is impossible by construction.

17. Do not use Access Bypass policies anywhere in this design. Reason: 1.23.
    They break under a Worker, they are explicitly not recommended by
    Cloudflare, and "Bypass" on a management plane is a permanent hole.

---

## 3. Not covered / open questions

1. Access authentication log retention. I could not find a Cloudflare primary
   source stating how long Zero Trust Access authentication logs are kept.
   Everything in 1.21 assumes they are exported immediately. Need: the
   retention figure from Cloudflare docs or support, or confirmation that
   Logpush is the only durable copy.

2. Whether a Worker's default `fetch()` can reach RFC1918 or loopback
   addresses. See 1.9. Third-party claim, no Cloudflare primary source read.
   This matters because if it is false, a plain `fetch()` to an internal
   address from a Worker is a live SSRF path that no VPC Service registration
   constrains. Need: a Cloudflare statement, or an actual test from a Worker on
   the operator's own account.

3. Cloudflare's current position on the Host-header / absolute-form SSRF
   report. I read the researchers' write-up, which says the report was closed
   Informative. I did not read a Cloudflare response. Need: the HackerOne
   report or a Cloudflare statement, so the spec does not overstate or
   understate it.

4. Whether a Cloudflare API token scoped to `Cloudflare One Connectors Write`
   can be used to fetch a tunnel token, and therefore whether a compromised
   Worker holding that API token is equivalent to holding every tunnel token.
   The docs list that permission as required for `GET
   /accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token`, which strongly implies
   yes. I did not test it. This is the difference between "one tunnel is
   compromised" and "every tunnel is compromised", so it needs a real test.

5. Workerd's own advisory surface. `gh api repos/cloudflare/workerd/security-advisories`
   returned two: GHSA-g76q-p3jj-mm56 / CVE-2023-48230 (WebSocket message can
   cause crash, medium, 2023-11-21) and GHSA-8vx6-69vg-c46f / CVE-2023-2512
   (buffer under-read, medium, 2023-05-12). Both old, both DoS-class. I did
   not research workerd's threat model in depth because A3-workerd.md covers
   the runtime. If the spec runs workerd on the operator's own machines, that
   file's isolation boundary and this file's threat model need to be read
   together.

6. Cloudflare's ToS position on what a Worker may do. The operator's hard
   constraint is a control plane on Workers. I did not read the Self-Serve
   Subscription Agreement or the Developer Platform terms in this session, and
   I am not going to characterise them from memory. This is a live question:
   a management plane that proxies arbitrary user traffic, or that holds
   long-lived credentials for infrastructure, may sit differently against the
   terms than a dashboard. It is flagged here rather than answered.

7. Whether Cloudflare Access can be made to enforce anything on the
   Worker-to-VPC-Service hop, or whether the operator's own origin
   authentication is genuinely the only control there. 1.14 says it is the
   only control, but I did not test a VPC Service binding with an
   Access-protected origin end to end.

8. The blast radius of a compromised Cloudflare account itself. Everything here
   assumes the account is intact. A compromised Cloudflare login is strictly
   worse than a compromised tunnel token, because it can read every token,
   delete every tunnel, and change every policy. Account-level MFA and API
   token scoping are assumed and not analysed.

9. Whether `cf.resolveOverride` (named in 1.10 as the only IP-pinning
   mechanism, and only for hosts already in a zone on the account) is a viable
   mitigation for the Worker SSRF residual. Not tested.

10. Cost of the controls. Section 2 recommends roughly a dozen controls, most
    of which are operational rather than monetary. I did not price them, and
    C2-tco-model does not cover them either. The rogue-replica poller, the
    Logpush pipeline and the break-glass path all cost either money or
    recurring attention.
