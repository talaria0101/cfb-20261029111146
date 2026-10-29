# Threat model

For a management plane reachable only through Cloudflare Tunnels. The point of this
file is to be concrete about which attacks are real and which are not, because the
instinctive answer to both is usually wrong.

## 1. The assets, in order of what a compromise costs

1. **The tunnel token.** Not a config value. It is `base64(json({a,s,t,e}))`, an
   unsigned, unencrypted bearer credential whose secret field is readable by anyone
   holding it, verified in `connection/connection.go` lines 79 to 104 [A1 F4].
   Cloudflare's own words: anyone with the token can run the tunnel. It is not tied to
   a machine. Rotation does not revoke live connectors, so a compromised token keeps
   working until every replica is reinstalled [C1 1.1].
2. **`cert.pem`.** Account-wide, valid at least 10 years, and can delete or list every
   tunnel in the account. The per-tunnel `<UUID>.json` never expires but only runs
   that one tunnel [A1 F5].
3. **The Cloudflare account itself.** Strictly worse than a tunnel token, because it
   can read every token, delete every tunnel and change every policy [C1 open
   question 8].
4. **A Cloudflare API token scoped to `Cloudflare One Connectors Write`.** Strongly
   implies the ability to fetch every tunnel token, because that permission is listed
   as required for `GET .../cfd_tunnel/{id}/token`. Untested, and it is the difference
   between one tunnel being compromised and all of them [C1 open question 4].
5. **Credentials inside a CI job.** The highest-volume, least-trusted code in the
   system.

## 2. Attacks that are real

### 2.1 Token theft from the process table, and the fix is still open

The tunnel token sits in the systemd `ExecStart` by default, readable via `ps`,
`/proc`, the service file and shell history. Any process on that host can steal it.
The upstream fix is issue cloudflared#1539, filed 2025-10-13, still open [C1 1.2].

Control: use `--token-file` or `TUNNEL_TOKEN_FILE`, mounted read-only. Never
`--token`. Never hand out `cert.pem`.

### 2.2 A rogue replica receives live production traffic

Replicas are not traffic-steered. Cloudflare routes to the geographically closest one,
so a replica an attacker starts anywhere receives a live share of production traffic,
including `CF_Authorization` cookies. Cloudflare's response to the 2024 HackerOne
report was updated documentation, not a product change [C1 1.3].

The mitigation is off by default: `CF_Authorization` HttpOnly and SameSite both
default to `None`, and the `CF_Binding` cookie that blocks replay is `Optional`
[C1 1.4].

Control: set HttpOnly and SameSite explicitly and enable `CF_Binding`. Build the
rogue-replica detector before the first production deploy: poll
`GET /accounts/{id}/cfd_tunnel` on a schedule, alert on any
`connections[].origin_ip` outside a pinned set and on `client_version` drift, and ship
the output somewhere with history because Cloudflare keeps none [C1 2.11].

### 2.3 Lateral movement from a CI job to the management plane

This is the attack the whole design exists to prevent, and it is prevented by network
placement rather than by any Cloudflare feature.

Control: **run cloudflared on dedicated, minimal hosts that run nothing else.** CI
runners, container hosts and storage nodes do not get a cloudflared replica on the
same kernel [C1 2.2]. This is the single highest-value isolation decision in the
design and it is free.

### 2.4 SSRF from the control-plane Worker

The precise answer, and it is unusual in being unambiguous:

- **VPC Services prevent SSRF by construction.** Host and port come from the service
  configuration and are ignored in the `fetch()` URL [A5, verified by me].
- **VPC Networks are the SSRF surface.** The destination comes from the runtime URL,
  so any injection becomes an internal port scan [C1 1.8].

Control: VPC Services for every control-plane call. If a VPC Network is needed, keep
it in a separate Worker from the one handling user-supplied paths, and treat the URL
as an allowlist check rather than a routing decision [A5 2.2].

### 2.5 "Restrict the origin to Cloudflare IPs" is not a control

Cloudflare's edge will fetch an arbitrary HTTP hostname on request. The report was
closed Informative [C1 1.11]. Do not put this in the spec as a security control. The
control is authentication at the origin.

### 2.6 A service token is a one-year, identity-less bearer secret

Cloudflare's own examples use `8760h`, a full year. It cannot be MFA'd. It has no
identity. Its only revocation is deletion. And Zero Trust organizations created on or
after 2026-10-05 have strict service token authentication forced on and non-disableable:
failures return 401 or 403 rather than a 302, only Service Auth policies authorize, and
no `CF_Authorization` cookie is issued [C1 1.12, A5 1.4].

Control: never issue Access service tokens to CI runners. The account cap is 50
anyway [A5 1.14]. Mint short-lived scoped credentials inside the control plane, and
revoke them with a database write [C1 2.8].

### 2.7 Exfiltration by a compromised control-plane Worker

A compromised Worker holds every secret it was given and will use any egress it has.

Control: route Worker egress through Cloudflare Gateway with an allowlist, using the
`cf1:network` VPC Network binding, and make the allowlist destination-based rather
than category-based. A category block does not stop one hardcoded hostname [C1 2.10].

### 2.8 Availability is part of the model

Cloudflare logged 49 incidents between 2026-10-13 and 2026-10-28, one critical,
1,523 critical and major minutes, with every one of the 16 days carrying an incident
[C6 1.1]. The critical one was on the exact path this design depends on: "Cloudflare
Zero Trust connectivity", 192 minutes on 2026-10-20, with the Access API still
degraded 28 minutes after the edge recovered [C6 1.2]. On 2025-11-18, Access auth
failed for most users from 11:20 to 13:05 and new logins did not work while existing
sessions survived [C1 1.20].

Control: a second, independent door, documented, drilled monthly [C6 R1].

### 2.9 The out-of-band plane is a live CVE class

The BMC outranks the OS. CISA TA13-207A documents cleartext IPMI passwords and one
password giving you the fleet. Supermicro CVE-2024-10237, 10238 and 10239 span X11 to
X14 boards, and Binarly found a bypass of the 10237 fix plus CVE-2025-6198, which also
defeats the BMC Root of Trust [C3 1.5].

## 3. Attacks that are not, or are not what they look like

### 3.1 cloudflared has no network-reachable RCE in its CVE record

NVD returns exactly two CVEs for cloudflared, CVE-2020-24356 and CVE-2023-1314, both
Windows local privilege escalation in the installer or config handling, and GitHub's
advisory endpoint returns the same two. Neither affects the current client [A1 F6, A5
1.11]. CVE-2025-22866 is upstream Go, a ppc64le-only timing side channel in
`crypto/internal/nistec`, and not a cloudflared code vulnerability [A5 1.11].

**Patching the connector is not where the security budget belongs.** Token custody and
network placement are [C1 1.5].

### 3.2 DNS rebinding is not a Cloudflare Tunnel attack

It cannot touch a Cloudflare-proxied hostname. It is a self-hosted-console problem,
and Cloudflare's own guidance treats it as local-server guidance and defends with
Origin and Host validation [C1 1.13]. If you run a self-hosted console such as
Portainer or Komodo behind a tunnel, that is where this applies.

### 3.3 Device posture is not available to the Worker path

Posture requires the Cloudflare One Client on the requesting device, which a Worker
does not have. It also has documented enforcement latency of up to about five minutes
and does not kill already-established sessions [A5 2.6, A5 1.8]. Use it only for human
browser access to the dashboard, and even then treat it as a speed bump rather than a
boundary.

### 3.4 Switching away from cloudflared is a security regression, not a win

frp CVE-2026-40910 is a routing and access-control split auth bypass affecting
0.43.0 to 0.68.0. Netmaker CVE-2026-29194 lets a valid host token bypass all later
authorization checks, and CVE-2026-29196 lets a platform user retrieve all WireGuard
private keys. OpenZiti shipped a cluster including a critical peer-certificate
identity spoofing in August 2026 [C1 1.19].

If the orchestration layer is "something other than Cloudflare", that is about control
and cost. Make the security argument separately and explicitly [C1 2.14].

## 4. The Worker's hard ceilings bound the design

These are not performance notes, they are correctness constraints [C1 1.24]:

- 6 simultaneous outgoing connections per request.
- 128 MB of memory per isolate.
- 30 seconds of CPU by default, configurable to 5 minutes.
- 10,000 subrequests per request, configurable to 10 million.
- 1,200 Cloudflare API requests per 5 minutes per token, about 4 per second
  sustained. A control plane that polls 50 machines every 60 seconds spends 21% of the
  entire budget on polling before any real work [C6 F11].

Design the control plane as a queue-plus-poll system rather than a request-time
fan-out, so a partial fan-out is impossible by construction [C1 2.16].

## 5. The isolation rule for untrusted code

Cloudflare's own published sandbox guidance, which is the most directly reusable text
in the whole research set and it is Cloudflare's, not ours [C1 1.17, C6 R6]:

- Credentials live outside the execution environment.
- An outbound handler adds them per request.
- Internet access is off by default.
- Every allowed destination is treated as an exfiltration channel.

The precedent for why this matters: Cloudflare's own Containers put each container in
a dedicated Firecracker microVM and still had a cross-tenant exposure in September 2026
through dm-thin with `skip_block_zeroing` on a shared pool, recovering structurally
complete SQLite databases on 18 of 24 placements [A2 F62, C4 1.2]. Cloudflare's own
sandbox docs say a container is the smallest unit of trust and that every process
inside it holds root's capabilities.

## 6. What this file does not cover

Named precisely, from `research/C1-threat-model.md` section 3:

1. Access authentication log retention. No Cloudflare primary source found. Everything
   about detecting a rogue replica assumes logs are exported immediately.
2. Whether a Worker's default `fetch()` can reach RFC1918 or loopback. Third-party
   blog only, no Cloudflare primary source. If it is false, a plain `fetch()` to an
   internal address is a live SSRF path that no VPC Service registration constrains.
3. Cloudflare's position on the Host-header and absolute-form SSRF report. The
   researchers' write-up says it was closed Informative; no Cloudflare response read.
4. Whether a `Cloudflare One Connectors Write` token can fetch a tunnel token. Not
   tested. See section 1.
5. Whether Access can enforce anything on the Worker-to-VPC-Service hop. C1 1.14 says
   the origin's own authentication is the only control, but it was not tested end to
   end.
6. The blast radius of a compromised Cloudflare account. Assumed intact throughout.
7. Whether `cf.resolveOverride` closes the DNS-rebind window. Not tested.
8. Cloudflare's current ToS position on what a Worker may do. Not read this session,
   and deliberately not characterised from memory. See `docs/CRITIQUE.md` section 3.
9. The cost of the controls. Roughly a dozen controls, most operational rather than
   monetary. The rogue-replica poller, the Logpush pipeline and the break-glass path
   all cost either money or recurring attention.
