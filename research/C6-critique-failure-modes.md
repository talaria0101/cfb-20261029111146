# C6 - Critique: every way this design fails or is worse than the thing it replaces

Agent: C6-critique-failure-modes
Research date: 2026-10-29 (all sources read on this date, UTC)
Method: pkgforge gateway pinned to tinyfish (`search.web.pkgforge.dev`, `read.web.pkgforge.dev`),
plus authenticated `gh api` for GitHub metadata. Every number below came from a call I made.
No figure is carried from memory.

Tool fallbacks used (reported per the research method):
- `read.web.pkgforge.dev` returned HTTP 422 for `developers.cloudflare.com/cloudflare-status/`,
  `www.cloudflarestatus.com/` (root), `developers.cloudflare.com/tunnel/pricing/`,
  `developers.cloudflare.com/workers-vpc/` (first attempt), and `nvd.nist.gov`. I re-routed to
  `cloudflarestatus.com/api/v2/incidents.json`, `/history`, `/summary.json`,
  `/incidents/unresolved.json`, `cve.org`, and `ubuntu.com`, all of which rendered.
- `isdown.app` returned HTTP 502 twice (initial plus one retry after a 5 s sleep). I fell back to
  `www.cloudflarestatus.com/history` and `onlineornot.com/status/cloudflare/incidents`, both read
  via tinyfish, for the 2026-10-29 incidents.
- `gh api repos/deuxfleurs/garage` returned 404. Garage is not hosted on GitHub; I did not
  independently verify Garage's feature set and mark those claims as carried.
- I did not use the built-in `web_search` or `web_fetch` tools at any point.

## 0. The design being critiqued

Dashboard and control-plane SPA hosted on Cloudflare Workers. Data plane (heavy CI, long-running
containers, object storage) on the operator's own machines, reached only through Cloudflare
Tunnels and Workers VPC. Orchestration is something other than Cloudflare. Some machines run
Cloudflare's own workerd behind a tunnel. The stated goal is "cheaper than Cloudflare's paid
products" while keeping the control plane on Cloudflare.

Everything below is measured against that. The headline result of this pass is that the design's
three load-bearing assumptions are the three weakest things in it: that Workers VPC will stay
free and stable, that the control plane can hold its state, and that self-hosted storage has a
backup story.

---

## 1. Findings

### 1.1 Single-tenant vs multi-tenant

**F1. Cloudflare's own multi-tenant compute is built on a hardware isolation boundary, not on a
Linux container, and it still leaked across tenants.**
Claim: Cloudflare Containers place each container in a dedicated Firecracker microVM, run on
multi-tenant infrastructure where "customers cannot select the underlying host", and had a real
cross-tenant data exposure in September 2026 caused by the storage layer, not the compute layer.
Evidence: https://blog.cloudflare.com/containers-cross-tenant-vulnerability (read 2026-10-29).
Quoted: "Cloudflare Containers run workloads on multi-tenant infrastructure and automatically
assign them to eligible servers; customers cannot select the underlying host." And: "Each
container lives inside a dedicated virtual machine powered by the Firecracker virtual machine
monitor." Reported 2026-09-04 by Oren Yomtov of Accomplish; cause was dm-thin thin provisioning
with `skip_block_zeroing` and 64 KiB thin blocks, so a 4 KiB write into a reassigned block left
60 KiB of the previous owner's data readable. Researchers "recovered residual material on 18 of
24 placements and 20 of 22 underlying nodes across four continents", including "directory
structures, database pages, and structurally complete SQLite databases". Label: **[verified]**.

**F2. Cloudflare states plainly that a Linux container is not a security boundary.**
Claim: Cloudflare's own sandbox documentation says every process in a container shares one Linux
system, has root's capabilities, and that "the sandbox is therefore the smallest unit of trust".
Evidence: https://developers.cloudflare.com/sandbox/concepts/security/ (read 2026-10-29, page
last updated 2026-09-30). Quoted: "Every process in a Container runs on the same Linux system.
The processes can read the same files, see each other, and connect to the same `localhost`
ports." And: "In a deployed sandbox, every process has the same Linux capabilities as `root`, so
file permissions do not restrict it, and it can switch back to `root`." And: "The sandbox is
therefore the smallest unit of trust." Also: "A Container starts with `enableInternet: false` by
default". Label: **[verified]**.

**F3. A shared-kernel sandbox for untrusted CI on the operator's own metal is a weaker boundary
than the Cloudflare product he is replacing, and the kernel escape surface is live right now.**
Claim: CVE-2026-80521 is an `af_unix` use-after-free reachable from inside a container, and
Ubuntu's 24.04 LTS and 26.04 LTS kernels were still "Vulnerable, work in progress" two days
before this research.
Evidence: https://ubuntu.com/security/CVE-2026-80521 (read 2026-10-29; page "Last updated 28
October 2026") shows `linux` 24.04 LTS noble "Vulnerable work in progress in 6.8.0-148.148" and
26.04 LTS resolute "Vulnerable work in progress in 7.0.0-42.42". https://www.cve.org/CVERecord?id=CVE-2026-80521
(read 2026-10-29) describes "af_unix: Unlink scc_entry in unix_del_edge()" with GC freeing a
dead SCC partially. Label: **[verified]** for the CVE and the Ubuntu status. **[unverified]** for
the exploitability rating: I did not read a CVSS score or a public exploit, and the two secondary
sources I saw in search results (tech-insider.org claiming CVSS 7.8 and public exploit code) I
did not open.

**F4. There are more live container-escape CVEs in the Docker/runc chain, but I did not read
them.**
Claim: search results returned CVE-2026-31431 ("Copy-Fail", Docker escape via page cache
corruption and runc exploitation, redfoxsec.com), CVE-2026-34040 (Docker Engine flaw, patch to
29.3.1, cyera.com), and a CNCF technical overview of runc container breakout vulnerabilities
disclosed November 2025 (cncf.io). Label: **[unverified]**. I did not open any of these pages.
The operator must read them before choosing a runtime for untrusted jobs.

**F5. Cloudflare Containers cap out well below "heavy CI".**
Claim: the largest Cloudflare Containers instance type is standard-4 at 4 vCPU, 12 GiB memory,
20 GB disk. Heavy CI on Cloudflare Containers is capped there.
Evidence: https://developers.cloudflare.com/containers/platform/pricing/ (read 2026-10-29, page
last updated 2026-10-05). Instance table: lite 1/16 vCPU / 256 MiB / 2 GB; basic 1/4 / 1 GiB /
4 GB; standard-1 1/2 / 4 GiB / 8 GB; standard-2 1 / 6 GiB / 12 GB; standard-3 2 / 8 GiB /
16 GB; standard-4 4 / 12 GiB / 20 GB. Label: **[verified]**.

### 1.2 What happens when Cloudflare is down or rate-limits you

**F6. Cloudflare's own status page recorded an incident on every single day of a 16-day window,
including one critical, and this is a floor rather than a total.**
Claim: between 2026-10-13 and 2026-10-28 the Cloudflare status page logged 49 incidents: 1
critical, 8 major, 37 minor, 4 "none". 16 of 16 days had at least one incident. The sum of
critical and major durations alone is 1,523 minutes (25.4 hours) in 16 days.
Evidence: https://www.cloudflarestatus.com/api/v2/incidents.json (read 2026-10-29). The
statuspage API returns only the 50 most recent incidents, so 49 is a lower bound for the window,
not a census. Label: **[verified]** for the counts and timestamps. **[derived]** for the
1,523-minute sum, which is my arithmetic on the published `started_at` and `resolved_at` fields.

**F7. The one critical incident in that window took down the exact path this design depends on.**
Claim: "Cloudflare Zero Trust connectivity" ran 2026-10-20T03:20:42Z to 2026-10-20T06:32:41Z,
192 minutes, impact critical.
Evidence: https://www.cloudflarestatus.com/incidents/0eqtn0khkz87 (read 2026-10-29). First
update quoted: "Cloudflare is investigating an issue with traffic that goes through Cloudflare
One Gateway when an identity policy is present in the policy decision. This impacts all onramps
to Cloudflare One Gateway. Cloudflare One Gateway policies with no identity policy are
unaffected. We are also seeing impact to the Cloudflare Dashboard". At 05:46Z: "Edge
functionality, including Access logins and Cloudflare Secure Web Gateway connectivity, has been
fully restored" while "The Cloudflare Access API continues to experience higher-than-normal error
rates". Access API restored at 06:14Z, incident resolved 06:32Z. Label: **[verified]**.
Note the shape: the control plane was degraded for 28 minutes longer than the data path.

**F8. On the day I read these sources, Cloudflare had elevated 500s across Durable Objects, D1,
Workflows and Workers, plus HTTP 429s on its own dashboard.**
Claim: on 2026-10-29 the Cloudflare status history listed "Increased D1 Error Rates"
(Investigating, 09:22 UTC) and "Increased error rates and reduced success rates for Workflows
operations" (Investigating, 09:24 UTC), and roughly two to three hours before my 12:44 UTC read
it listed "Increased HTTP 429 Rate Limit Errors on Cloudflare Dashboard" and "Issues with
Durable Objects availability in Eastern Europe".
Evidence: https://www.cloudflarestatus.com/history (read 2026-10-29) for the two 09:2x
incidents; https://onlineornot.com/status/cloudflare/incidents (read 2026-10-29, 12:44 UTC) for
the 429 dashboard and DO Eastern Europe incidents. https://www.cloudflarestatus.com/api/v2/summary.json
(read 2026-10-29) returned page indicator "major / Partial System Outage", with
https://www.cloudflarestatus.com/api/v2/incidents/unresolved.json (read 2026-10-29) showing
"Network Performance Issues in Ashburn, IAD" still in `monitoring` status, created
2026-10-28T04:39Z, unresolved for more than 32 hours at read time. Label: **[verified]**.
Caveat I will not paper over: the summary.json component list shows many location components as
`major_outage`, and I could not determine from the API alone whether those are live outages or
unlaunched locations, so I do not rely on them.

**F9. Access availability is itself a recurring failure mode, and it is the front door.**
Claim: "Cloudflare Access Availability Issues" occurred on 2026-10-16 and 2026-10-23;
"Elevated Cloudflare Access API Errors" on 2026-10-27; "Cloudflare FedRAMP Dashboard and Access"
(major, 73 minutes) on 2026-10-16; "Delayed audit log delivery for WARP and Zero Trust services"
(major, 398 minutes) on 2026-10-22.
Evidence: https://www.cloudflarestatus.com/api/v2/incidents.json (read 2026-10-29). Label:
**[verified]**.

**F10. Durable Objects and R2, the two things a control plane would put its state and its
artifacts in, are the two most frequently degraded components in the record.**
Claim: 6 Durable Objects incidents in October 2026 (2026-10-15, 2026-10-21, 2026-10-21 Lisbon,
2026-10-22 Western Europe, 2026-10-28 twice), and R2 incidents on 2026-10-21 (major, with DO,
127 minutes, ENAM) and 2026-10-28 (ENAM). Workers incidents: "Cloudflare Workers API Latency"
(2026-10-22), "Increased Worker services errors" (2026-10-29). Cron Triggers: "Delayed, missed,
and duplicated Workers Cron Triggers" on 2026-10-16, 2026-10-23 and 2026-10-26.
Evidence: https://www.cloudflarestatus.com/api/v2/incidents.json and
https://www.cloudflarestatus.com/history (read 2026-10-29). Label: **[verified]**.

**F11. The Cloudflare API budget is 4 requests per second, sustained, for the whole account.**
Claim: the global Cloudflare API rate limit is 1,200 requests per five-minute period per user,
applied cumulatively regardless of endpoint, plus 200 requests per second per IP.
Evidence: https://developers.cloudflare.com/fundamentals/api/reference/limits/ (read 2026-10-29,
page last updated 2026-08-25). Table: "Client API per user/account token 1200/5 minutes",
"Client API per IP 200/second", "User API tokens per user 50", "Account API tokens per account
500". Label: **[verified]** for the limits. **[derived]** for the arithmetic: 1200/300 s = 4
req/s, so a polling control plane can poll about 240 machines at one call each per 60 s before it
exhausts the whole account budget. Anything that polls faster, or that reconciles state through
the API rather than through a queue, will start returning 429 and the community report quoted
below describes the consequence.

**F12. A 429 blocks the account for five minutes, not just the offending call.**
Claim: exceeding the limit blocks all API calls for the next five minutes.
Evidence: https://community.cloudflare.com/t/rate-limits-being-triggered-unintentionally-after-exceeding140-requests-per-second/886273
(found via search, read 2026-10-29). Label: **[unverified]**: this is a community post, not a
Cloudflare primary source. The limits page itself documents `retry-after` and the `Ratelimit`
headers but does not state the block window.

**F13. On the Free and Pro plans there is no uptime SLA at all.**
Claim: Cloudflare's plan comparison lists "Uptime SLA" as absent for Free and Pro and 100% for
Business and Contract. Business costs $200/month billed annually or $250/month billed monthly.
Evidence: https://www.cloudflare.com/plans/ (read 2026-10-29). Label: **[verified]**.

**F14. The Workers SLA that does exist excludes every dependency a control plane has.**
Claim: the Workers SLA sets a 99.99% Monthly Uptime Percentage service level objective, but
excludes unavailability caused by "the unavailability or performance degradation of
interdependent Cloudflare services upon which the Worker relies (including but not limited to
Cloudflare CDN, DNS, WAF, specialized storage bindings, etc.)", and routes all claims through
the Enterprise Customer Support and Service Level Agreement.
Evidence: https://www.cloudflare.com/workers-service-level-agreement/ (read 2026-10-29; effective
2026-04-01) sections 2.1, 3.2(b), 3.3. R2's SLA is 99.9% with the same Enterprise claim
machinery: https://www.cloudflare.com/r2-service-level-agreement/ (read 2026-10-29; effective
2025-07-08). Label: **[verified]**.

**F15. Cloudflare can terminate the account at will, with no notice and no reason.**
Claim: "We may at our sole discretion terminate your user account or Suspend or terminate your
use or access to the Service at any time, with or without notice for any reason or no reason at
all." Services are provided "AS IS" and "AS AVAILABLE", and aggregate liability is capped at
amounts paid in the 12 months before the claim.
Evidence: https://www.cloudflare.com/terms/ (Self-Serve Subscription Agreement, last updated
2025-09-12), sections 8, 11 and 12 (read 2026-10-29). Label: **[verified]**.

### 1.3 What happens when the tunnel is the only path and it breaks

**F16. cloudflared's built-in HA does not steer traffic, and Cloudflare's own answer to that is
a separate paid product.**
Claim: a tunnel is four outbound connections to servers in at least two data centers; replicas
add four more each, but "Replicas do not support traffic steering (such as round-robin or
hash-based routing). When a request arrives at Cloudflare, it is forwarded to the geographically
closest replica. If that connection fails, Cloudflare retries with other replicas, but there is
no guarantee about which one is chosen." Cloudflare's recommended fix for real steering is Load
Balancers, which requires one tunnel per data center.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/
(read 2026-10-29, page last updated 2026-04-17). Load Balancing is a separate add-on at
"Starting at $5/mo": https://www.cloudflare.com/plans/ (read 2026-10-29). Label: **[verified]**.

**F17. Cloudflare's own HA sizing adds two dedicated machines before any data plane exists.**
Claim: "Run a `cloudflared` replica on two dedicated host machines per network location. Size
each host with minimum 4GB of RAM and 4 CPU cores. Allocate 50,000 ports to the `cloudflared`
process on each host." Plus `ulimit -n` of at least 70,000. Throughput is port-bound, not
CPU-bound: 50,000 ports is overloaded by "50,001 TCP requests per second", or 10,000 DNS queries
per second, because UDP DNS sessions hold a port for five seconds.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/system-requirements/
(read 2026-10-29, page last updated 2026-04-17). Label: **[verified]**.

**F18. The tunnel terminates at Cloudflare's edge, so the data plane has no availability
independent of Cloudflare, and "connected" is not "working".**
Claim: a documented incident where two config-less cloudflared wrapper containers showed healthy
in `docker ps`, connected no tunnel at all, and every public hostname returned 530 for about a
day, including the SSO portal. A second documented failure: split-horizon DNS meant a local
`curl` returned a clean 302 and "proved nothing about the tunnel".
Evidence: https://dev.to/iam-tech/cloudflare-tunnel-530-errors-the-connector-that-was-healthy-and-did-nothing-3817
(read 2026-10-29) and https://kazishiplu.com/blog/connected-is-not-working/ (read 2026-10-29).
The second decomposes a tunnel into three independent systems sharing one status line:
connector-to-provider (what the status line reports), hostname-to-tunnel (the DNS route), and
tunnel-to-origin (untested). Label: **[verified]** for both accounts. **[unverified]** for the
Kazi Shiplu diagnosis: the author writes "I am calling this diagnosed rather than confirmed
fixed", and I did not reproduce either case.

**F19. Cloudflare Tunnel is free, but the page that would say so would not render.**
Claim: Cloudflare Tunnels carries no additional cost alongside Workers VPC during the beta.
Evidence: https://blog.cloudflare.com/workers-vpc-open-beta (read 2026-10-29): "Workers VPC is
now available to everyone using Workers, at no additional cost during the beta, as is Cloudflare
Tunnels." Label: **[verified]** for that sentence. **[unverified]** for a general "Tunnel is free
on all plans" claim: `developers.cloudflare.com/tunnel/pricing/` returned HTTP 422 from the
reader and I could not read a dedicated pricing page. This matters because the whole
architecture rests on Tunnel staying free, and SSSA section 4.2 lets Cloudflare change fees on
30 days notice.

### 1.4 ToS: what a Worker, and an account, are allowed to do

**F20. The Self-Serve Subscription Agreement prohibits using the Services to provide a VPN or
similar proxy service. That is a description of this architecture.**
Claim: SSSA 2.2.1(j): "use the Services to provide a virtual private network or other similar
proxy services."
Evidence: https://www.cloudflare.com/terms/ (read 2026-10-29). Label: **[verified]** for the
quote. **[unverified]** for how Cloudflare applies it. This is the single most under-examined
risk in the design. A Cloudflare Tunnel with private-network routes plus Workers VPC Networks is
functionally a VPN for whoever uses it. For the operator alone, on his own account, reading this
as prohibited is a stretch. The moment a second human uses his tunnel to reach his network, the
reading stops being a stretch. The spec needs a written position on this, not silence.

**F21. Reselling or sharing the account is prohibited, which constrains the whole product.**
Claim: SSSA 2.2.1(a): "rent, lease, loan, export, or sell access to the Services to any third
party, or sign up for the Services on behalf of a third party". Section 2.3 adds that if you let
third parties access your account "you do so at your sole risk".
Evidence: https://www.cloudflare.com/terms/ (read 2026-10-29). Label: **[verified]**.

**F22. Working around a service-specific limit is itself a violation.**
Claim: SSSA 2.2.1(c): "access or use the Services in a manner that violates or is intended to
circumvent Service-specific usage limits, quotas, or other restrictions set forth in the
Agreement".
Evidence: https://www.cloudflare.com/terms/ (read 2026-10-29). Label: **[verified]**. This
forecloses the standard escape hatch: when the control plane hits the DO 10 GB cap or the API
rate limit, sharding across multiple Cloudflare accounts is a ToS breach, not an engineering
option.

**F23. The old section 2.8 content restriction was narrowed, not removed, and it still bites
non-Cloudflare-hosted bytes.**
Claim: Cloudflare moved the content restriction out of the Self-Serve Subscription Agreement
into a CDN-specific section of the Service-Specific Terms, dropped the HTML versus non-HTML
construct, and kept the restriction for content hosted outside Cloudflare.
Evidence: https://blog.cloudflare.com/updated-tos (read 2026-10-29): "Video and large files
hosted outside of Cloudflare will still be restricted on our CDN". And
https://www.cloudflare.com/service-specific-terms-application-services/ (read 2026-10-29, last
updated 2026-09-28): "Cloudflare reserves the right to disable or limit your access to or use of
the CDN, or to limit your End Users' access to certain of your resources through the CDN, if you
use or are suspected of using the CDN without such Paid Services to serve video or a
disproportionate percentage of pictures, audio files, or other large files." The same blog post
confirms Cloudflare removed the old benchmarking restriction. Label: **[verified]**.

**F24. Beta Services can be deleted, including the customer's content, at any time.**
Claim: "Cloudflare may discontinue, suspend, or remove Beta Services (including any of Customer
Content stored as part of the Beta Services) or your access thereto at any time in our sole
discretion and may never make them generally available."
Evidence: https://www.cloudflare.com/terms/ section 5 (read 2026-10-29). Workers VPC is in beta:
https://developers.cloudflare.com/workers-vpc/ (read 2026-10-29, page last updated 2026-10-12)
and https://developers.cloudflare.com/workers-vpc/platform/limits/ (read 2026-10-29): "Workers
VPC is currently in beta. Features and APIs may change before general availability. While in
beta, Workers VPC is available for free to..." Label: **[verified]**. This is the sharpest
finding in the ToS section. The only supported path from the control plane to the data plane is
a Beta Service, free only "during the beta", which Cloudflare may remove along with any content
stored as part of it, at its sole discretion, and which SSSA section 5 says carries no
liability.

**F25. Prices can change on 30 days notice, which voids the entire cost model on a timer.**
Claim: "We reserve the right to change the fees that we charge for the Service, at any time in
our sole discretion, provided that we give you at least thirty (30) days' prior notice."
Evidence: https://www.cloudflare.com/terms/ section 4.2 (read 2026-10-29). Label: **[verified]**.
Any break-even calculation in this spec is a snapshot valid until the next notice, not a
property of the design.

### 1.5 Egress asymmetry

**F26. Cloudflare charges nothing for egress from Workers and nothing for subrequests, which is
the one genuinely asymmetric advantage the design has.**
Claim: "There are no additional charges for data transfer (egress) or throughput (bandwidth)."
And footnote 1: "Cloudflare does not bill for subrequests you make from your Worker."
Evidence: https://developers.cloudflare.com/workers/platform/pricing/ (read 2026-10-29, page
last updated 2026-10-02). Footnote 3: "Requests to static assets are free and unlimited."
Label: **[verified]**. So control-plane-to-data-plane traffic over a VPC Service is free on
Cloudflare's side. This is real and the spec should lean on it.

**F27. But Cloudflare Containers, the paid product being replaced, charges real egress, and the
self-hosted side has to beat it by a wide margin.**
Claim: Containers egress is $0.025/GB beyond 1 TB included in North America and Europe, $0.05/GB
beyond 500 GB in Oceania/Korea/Taiwan, and $0.04/GB beyond 500 GB everywhere else.
Evidence: https://developers.cloudflare.com/containers/platform/pricing/ (read 2026-10-29).
Label: **[verified]** for the rates. **[derived]** for the arithmetic: 10 TB/month = 9,216 GB
billable = $230.40; 20 TB/month = 19,456 GB billable = $486.40.

**F28. Hetzner's unlimited traffic is the other half of the asymmetry, and it is a colocated
datacentre, not a garage.**
Claim: Hetzner AX41 is EUR 59.00/month excluding VAT, EUR 0.0945/hour, EUR 0.00 setup fee, 6c/12t
AMD Ryzen 5 3600, 64 GB DDR4, 2x 512 GB NVMe, 1 GBit/s guaranteed port, and "Traffic usage is
unlimited and free of charge".
Evidence: https://www.hetzner.com/dedicated-rootserver/matrix-ax/ (read 2026-10-29). Label:
**[verified]**. The page also publishes per-model idle and maximum power draw, but the rendered
table did not align unambiguously with each model, so I do not quote a wattage. The important
point for the critique: that EUR 59.00 includes power, cooling, bandwidth and hardware
replacement. A home mini PC does not, and the spec must not compare a Hetzner price against a
home-electricity price without saying so.

**F29. The asymmetry that cuts against the design: Cloudflare's free egress only covers bytes
leaving Cloudflare. It does not make the operator's own upstream free.**
Claim: a Worker's free egress does not help a data-plane service that has to push 10 TB/month to
the internet from the operator's own connection. Hetzner includes that in the EUR 59.00. A
consumer or small-business uplink does not.
Evidence: https://developers.cloudflare.com/workers/platform/pricing/ (read 2026-10-29) for the
free-egress statement; https://www.hetzner.com/dedicated-rootserver/matrix-ax/ (read 2026-10-29)
for the unlimited-traffic statement. Label: **[verified]** for both quotes. **[derived]** for the
conclusion: a 1 GBit/s port sustained for a 30-day month carries roughly 328 TB, so 20 TB/month
is about 6% of the port and about 0.5 Mbps average. The self-hosted egress argument is strong
only if the machines sit somewhere with a real uplink.

**F30. R2 beats self-hosted NVMe per GB-month, so "cheaper storage" is not a settled win.**
Claim: R2 Standard storage is $0.015/GB-month, Class A $4.50/million, Class B $0.36/million,
egress free, with a free tier of 10 GB-month, 1 million Class A and 10 million Class B. R2 also
offers Infrequent Access at $0.01/GB-month with $9.00/million Class A, $0.90/million Class B,
$0.01/GB retrieval and a 30-day minimum storage duration.
Evidence: https://developers.cloudflare.com/r2/pricing/ (read 2026-10-29, page last updated
2026-10-26). Label: **[verified]**. For the comparison, I rely on the sibling research file
`research/A6-pricing-reality.md` section 1.13, which read the Hetzner AX matrix and derived
Hetzner NVMe at $0.036/GB-month for a 1 TB addon and bulk HDD at $0.00195/GB-month. I did not
re-derive those figures. Label: **[carried from A6, not independently verified]**.

### 1.6 A control plane on Workers cannot hold state well

**F31. The request-body cap is set by the Cloudflare account plan, not the Workers plan, and it
is 100 MB on Free and Pro.**
Claim: "Request body size limits depend on your Cloudflare account plan, not your Workers plan."
Free 100 MB, Pro 100 MB, Business 200 MB, Enterprise up to 5 GB. Requests exceeding these return
413. Worker size is capped at 64 MiB, individual static asset files at 25 MiB, environment
variable size at 5 KB, and environment variables at 128 per Worker on Paid.
Evidence: https://developers.cloudflare.com/workers/platform/limits/ (read 2026-10-29, page last
updated 2026-10-12). Label: **[verified]**. Consequence for the design: a control plane on the
Free or Pro plan physically cannot accept a 200 MB CI artifact through the dashboard. Getting to
200 MB costs $250/month, 50x the $5 Workers floor. This is an architectural break, not a tuning
problem.

**F32. Workers resource ceilings bound what the control plane can do in one request.**
Claim: memory 128 MB per isolate; CPU time 10 ms Free, 5 minutes Paid with a 30-second default;
subrequests 50 per request Free, 10,000 per request Paid by default, raisable to 10 million via
`limits.subrequests`; Free is separately capped at 1,000 subrequests to Cloudflare services;
simultaneous outgoing connections 6 per request on both plans; 100,000 requests/day Free with no
limit on Paid; 500 Workers Paid, 100 Free; 250 Cron Triggers Paid, 5 Free; duration has no hard
limit for HTTP requests but `waitUntil` extends only 30 seconds.
Evidence: https://developers.cloudflare.com/workers/platform/limits/ and
https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/ (both read
2026-10-29). The changelog confirms the 1,000-subrequest cap was removed on 2026-02-11 and
replaced with a configurable 10,000 default on paid plans. Label: **[verified]**. The 6
simultaneous outgoing connections is the one that hurts most: a control plane that fans out to
more than six machines per request cannot do it in one invocation.

**F33. Durable Objects, the natural place for control-plane state, are small and weird at the
edges.**
Claim: SQLite-backed Durable Objects are capped at 10 GB storage per object on Workers Paid and
1 GB on Free, 5 GB per account on Free, unlimited per account on Paid; key and value combined
max 2 MB; maximum string, BLOB or table row 2 MB; maximum SQL statement 100 KB; maximum bound
parameters per query 100; 100 columns per table; maximum DO classes 500 Paid / 100 Free; a soft
limit of 1,000 requests per second per object; "Each individual Object is inherently
single-threaded"; 6 simultaneous outgoing connections per request; CPU 30 seconds default,
configurable to 5 minutes.
Evidence: https://developers.cloudflare.com/durable-objects/platform/limits/ (read 2026-10-29,
page last updated 2026-06-01). Label: **[verified]**. The failure mode is the interesting part:
when a SQLite-backed DO reaches its cap, "write operations (such as `INSERT`, `UPDATE`, or calls
to `put()` and `sql.exec()` storage APIs) will fail with... `database or disk is full:
SQLITE_FULL`" while "Read operations... will continue to work, and `DELETE` operations will also
succeed". A control plane whose state store fills up becomes half-writable rather than failing
closed, which is the worst possible shape for an orchestration system.

**F34. Durable Objects do not exist in several parts of the world and never move.**
Claim: "Durable Objects currently do not spawn in this location" for `sam` (South America),
`afr` (Africa) and `me` (Middle East); a DO hinted at South America "will spawn in Eastern North
America instead". And: "Durable Objects do not currently change locations after they are
created", with dynamic relocation "planned for the future".
Evidence: https://developers.cloudflare.com/durable-objects/reference/data-location/ (read
2026-10-29, page last updated 2026-06-26). Label: **[verified]**. If any of the operator's
machines live in those three regions, control-plane state cannot be co-located with the data
plane, and once created it cannot be moved.

**F35. On the Free plan, the database fails closed for the rest of the UTC day.**
Claim: from 2026-09-01, D1 queries on the Workers Free plan fail when the account exceeds daily
row read or row write limits, returning errors until the limit resets at midnight UTC, for both
the Workers Binding API and the REST API.
Evidence: https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
(read 2026-10-29). Label: **[verified]**. The documented error text is "Upgrade to a paid plan
or wait until tomorrow". A control plane on the Free plan has a hard daily quota whose recovery
procedure is to wait.

**F36. There is no Cloudflare REST API for reading or mutating Durable Object storage.**
Claim: a control plane cannot inspect or repair its own DO state from outside a Worker.
Evidence: carried from `research/A4-durable-objects-workers.md` section 1.28. Label:
**[carried from A4, not independently verified]**. I attempted no call of my own on this.

### 1.7 Backup and restore of a self-hosted R2 replacement

**F37. SeaweedFS, the leading self-hosted candidate, has no consistent online backup.**
Claim: `weed backup` "requires stopping the entire cluster during backup". `weed filer.backup`
is replication rather than backup: it is eventually consistent, must run continually, cannot be
scheduled as a point-in-time snapshot, and its output cannot be synchronised with
`weed filer.meta.backup`. The project wiki states you must stop cluster operations to guarantee
consistency between `weed backup` and `weed shell fs.meta.save`. GitHub discussion #8672,
"Consistent backups without stopping cluster", opened 2026-03-17, is unanswered.
Evidence: https://github.com/seaweedfs/seaweedfs/issues/7649 (read 2026-10-29) and
https://github.com/seaweedfs/seaweedfs/discussions/8672 (read 2026-10-29). Label: **[verified]**.

**F38. The project behind it is moving fast enough that the backup story is a moving target.**
Claim: SeaweedFS has about 35,800 stars, is Apache-2.0, was pushed to at 2026-10-29T12:22:47Z,
has 710 open issues, and shipped roughly 325 releases with 43 of them between January and
October 2026 (about 4.3 per month).
Evidence: `gh api repos/seaweedfs/seaweedfs` and `gh api repos/seaweedfs/seaweedfs/releases`
(read 2026-10-29). The 325 figure comes from the `Link` header `rel="last"` page count at
`per_page=1`; the 43 is my count of releases whose `published_at` month falls in 2026-01 through
2026-10 from a `per_page=100` read. Label: **[verified]** for the raw API values, **[derived]**
for the 43 and the 4.3/month rate.

**F39. The default self-hosted S3 answer is archived, so this is a choice among moving targets.**
Claim: minio/minio is archived, its README says "THIS REPOSITORY IS NO LONGER MAINTAINED.", and
the community edition is source-only with no prebuilt binaries.
Evidence: carried from `research/A6-pricing-reality.md` section 1.17, which read the GitHub API
and the README. Label: **[carried from A6, not independently verified]**.

**F40. The realistic backup target for a self-hosted store is the vendor the design is trying to
be cheaper than.**
Claim: if the self-hosted object store has no consistent online backup, the DR target is either
a second self-hosted cluster (doubling the hardware and the ops) or a hosted S3-compatible
service. R2 is the obvious one, and its SLA is 99.9% with an Enterprise-only claim process.
Evidence: https://www.cloudflare.com/r2-service-level-agreement/ (read 2026-10-29) for the SLA;
F37 above for the absence of a consistent backup. Label: **[verified]** for the SLA,
**[derived]** for the conclusion.

### 1.8 The operational cost of running your own everything

**F41. The upstream connector ships releases every one to three days, and the guidance is to pin
it.**
Claim: cloudflared is Apache-2.0, has about 16,300 stars and 572 open issues, was last pushed at
2026-10-29T12:12:16Z, and published 2026.10.4 on 2026-10-26, 2026.10.5 on 2026-10-27 and
2026.10.6 on 2026-10-29.
Evidence: `gh api repos/cloudflare/cloudflared` and `gh api repos/cloudflare/cloudflared/releases`
(read 2026-10-29). Label: **[verified]**. Combined with the sibling guidance to pin cloudflared
and update deliberately (`research/A5-zero-trust-vpc.md` section 2.13, **[carried]**), this is a
standing weekly patch-and-verify obligation on the component that holds the only door open.

**F42. The kernel on every host is a standing patch obligation with a live unpatched escape.**
Claim: see F3. Ubuntu 24.04 LTS and 26.04 LTS were "Vulnerable, work in progress" for
CVE-2026-80521 as of 2026-10-28.
Evidence: https://ubuntu.com/security/CVE-2026-80521 (read 2026-10-29). Label: **[verified]**.

**F43. The whole design funnels through one account, one set of tunnel tokens and one operator.**
Claim: SSSA 2.3 makes the account holder solely responsible for all activity under the
credentials, and there is no second administrative path.
Evidence: https://www.cloudflare.com/terms/ section 2.3 (read 2026-10-29). Label: **[verified]**
for the quote. **[derived]** for the bus-factor conclusion.

### 1.9 The arithmetic, stated so it can be checked

All figures below are **[derived]** from published rates cited above. Assumptions are named.

| Quantity | Value | Inputs |
| --- | --- | --- |
| Cloudflare status incidents, 2026-10-13 to 2026-10-28 | 49 (1 critical, 8 major) | statuspage API, floor of 50 most recent |
| Critical + major incident minutes in that window | 1,523 min (25.4 h) | `started_at`, `resolved_at` |
| Cloudflare API sustained ceiling | 4 req/s | 1,200 per 300 s |
| Machines pollable at 60 s before exhausting the API budget | about 240 | 1 call per machine per 60 s |
| Max request body, Free or Pro plan | 100 MB | Workers limits page |
| Max request body, Business plan | 200 MB | Workers limits page |
| Business plan monthly price | $250 (or $200 annual) | cloudflare.com/plans |
| Workers Paid floor | $5/month | Workers pricing page |
| Containers memory, 12 GiB always-on, 730 h | $78.84/month | $0.0000025/GiB-s |
| Containers memory, 64 GiB always-on, 730 h | $420.48/month | same rate |
| Hetzner AX41, 64 GB, 2x512 GB NVMe, 1 Gbit unlimited | EUR 59.00/month | matrix-ax page |
| Ratio, Cloudflare memory for 64 GiB vs whole AX41 | about 6.0x | $420.48 vs EUR 59.00 at 1.19 USD/EUR |
| Containers egress, 10 TB/month, NA or EU | $230.40/month | $0.025/GB beyond 1 TB |
| Containers egress, 20 TB/month, NA or EU | $486.40/month | same |
| Containers disk, 512 GB always-on | $94.19/month | $0.00000007/GB-s |
| Containers CPU, 1 vCPU always-on, 730 h | $52.56/month | $0.000020/vCPU-s |
| SeaweedFS releases, Jan to Oct 2026 | 43 (about 4.3/month) | GitHub releases API |
| cloudflared releases in the last week of Oct 2026 | 3 | GitHub releases API |

---

## 2. What this changes for the spec

**R1. Drop the requirement that the control plane be reachable only through Cloudflare. Build a
second, independent door and rehearse it monthly.**
Reason: F6, F7, F8, F9. Cloudflare had a critical Zero Trust connectivity incident of 192 minutes
on 2026-10-20, Access availability incidents on 2026-10-16 and 2026-10-23, and elevated Access
API errors on 2026-10-27. A control plane whose only path is a Cloudflare tunnel has no
availability independent of Cloudflare, and the Workers SLA explicitly excludes interdependent
Cloudflare services (F14). The second door does not have to be good. It has to exist and be
exercised: a WireGuard or Tailscale endpoint on a non-standard port, plus a runbook, plus a
monthly drill that proves the credential still works. This is the single highest-value change in
this file.

**R2. Drop Workers VPC as a load-bearing dependency. Design the Worker-to-data-plane contract so
the transport is swappable.**
Reason: F24. Workers VPC is a Beta Service, free only "during the beta", and SSSA section 5 lets
Cloudflare remove Beta Services and any Customer Content stored as part of them at its sole
discretion with no liability. The spec should treat the VPC binding as one implementation of an
interface, not as the architecture. Concretely: every data-plane call goes through one internal
client module in the Worker, that module is the only place a VPC binding appears, and there is a
second implementation that talks plain HTTPS to a public hostname behind Access. If VPC Services
disappear or start charging, the change is one file.

**R3. Drop Durable Objects as the control plane's system of record. Put the authoritative state
on the operator's own hardware and treat Cloudflare as a cache and a queue.**
Reason: F33, F34, F35, F36. A SQLite-backed DO caps at 10 GB per object on Paid and 1 GB on
Free, fails writes with SQLITE_FULL while reads keep working, does not spawn in South America,
Africa or the Middle East, never relocates once created, and has no REST API for inspection or
repair. A control plane whose state cannot be inspected, cannot be moved, and degrades into a
half-writable store is not a control plane. Keep in Cloudflare only what is genuinely stateless
or cacheable: the SPA bundle, short-lived session data, a queue of pending jobs, and signed URLs.
Authoritative state (machine inventory, credentials, job history) belongs on the operator's own
Postgres, reachable over the tunnel, with the Worker as a client.

**R4. Drop the "cheaper storage" claim for NVMe. Either use bulk disk or use R2.**
Reason: F30 and the sibling A6 finding. R2 at $0.015/GB-month beats Hetzner's 1 TB NVMe addon at
about $0.036/GB-month. The self-hosted storage argument survives only on spinning disk at about
$0.00195/GB-month, on Hetzner Storage Box, or on data residency and egress. If the design's
storage is all-NVMe, the honest statement is that R2 is cheaper per GB and the only reasons to
self-host are residency, egress volume, and avoiding vendor dependency. Say that, or move the
data to bulk disk.

**R5. Drop the assumption that the operator's own machines have good bandwidth. Price the
uplink explicitly.**
Reason: F29. Cloudflare's free egress covers bytes leaving Cloudflare, not bytes leaving the
operator's box. The self-hosted egress win is real on a Hetzner AX41 with unlimited traffic on a
1 GBit port, and fictional on a home connection. Every cost figure in the spec must name the
uplink and its monthly cap.

**R6. Drop any plan to run untrusted CI in plain Linux containers on a shared host.**
Reason: F1, F2, F3, F5. Cloudflare's own Containers put each container in a dedicated Firecracker
microVM and still had a cross-tenant data exposure in September 2026 through dm-thin, recovering
structurally complete SQLite databases on 18 of 24 placements. Cloudflare's own sandbox docs say
a container is the smallest unit of trust and that processes inside it hold root's capabilities.
The operator's CI jobs are at least as untrusted as Cloudflare's customers' code. If untrusted
code runs on his metal, it runs in a microVM (Firecracker, Cloud Hypervisor or Kata) or under
gVisor, on a host that runs nothing else, with no credentials in the guest and egress off by
default. That is Cloudflare's own published guidance, and it is the cheapest insurance in the
design.

**R7. Drop the idea that the dashboard can be a general file-upload surface on a cheap plan.**
Reason: F31. Free and Pro cap request bodies at 100 MB. Artifacts above that must be uploaded
directly to object storage with a presigned URL, never proxied through the Worker. Design the
upload path as presigned-from-day-one, because retrofitting it after the operator has built a
proxy endpoint is the expensive version.

**R8. Drop API polling as the control plane's reconciliation mechanism. Use a queue plus
long-poll, and budget the 4 req/s ceiling into the design.**
Reason: F11, F12. The account-wide Cloudflare API budget is 1,200 requests per five minutes,
which is 4 req/s sustained, and a community report says exceeding it blocks the account for five
minutes. A control plane that polls 50 machines every 60 s spends 21% of the entire budget on
polling, before any real work. Reconcile by pushing: the data plane opens a long-lived
connection or long-polls a queue, and the Worker only spends API budget on mutations.

**R9. Drop the "single-tenant is simpler" framing and make the tenancy question explicit and
narrow.**
Reason: F1, F2, F21, F22. The design is single-tenant in the sense that one operator owns
everything, and multi-tenant in the sense that untrusted CI jobs share his kernel and his
storage. Those are different questions and the spec currently conflates them. Answer them
separately: (a) will any human other than the operator ever use this dashboard? If yes, SSSA
2.2.1(a) is a problem and the product needs its own account model, which is a different product.
(b) will untrusted code ever share a kernel with the operator's credentials? If yes, that is the
multi-tenant question, and the answer is microVMs, per F6.

**R10. Drop the plan to keep a single set of tunnel tokens. Rotate on a schedule and make the
rotation procedure a tested runbook.**
Reason: F20, F21, F43. SSSA 2.3 puts all activity under the credentials on the account holder,
and a tunnel token is a bearer credential for the account's whole private-network surface. With
one operator and one token set, a single leak is total. Rotate on a fixed schedule, store the
token in a real secret store rather than an environment variable on a shared host, and rehearse
the rotation outside working hours.

**R11. Drop "we will self-host everything" as a goal. Keep three things on Cloudflare and
self-host the rest deliberately.**
Reason: the whole of section 1. The three things worth keeping on Cloudflare are the static SPA
(requests to static assets are free and unlimited, F26), bursty request-facing compute (Workers
bills active CPU only, and Free gives 100,000 requests/day), and R2 for anything that is small,
read-heavy, or needs free egress. Everything that is always-on, memory-heavy, disk-heavy, or
egress-heavy belongs on own metal. The split line is per resource, not per product, and the spec
should say which resource each decision was made on.

**R12. Add a written ToS position to the spec, covering the VPN clause, the CDN content clause,
and the beta clause.**
Reason: F20, F21, F22, F23, F24, F25. These are not hypothetical. SSSA 2.2.1(j) prohibits using
the Services to provide a VPN or similar proxy service, which is a description of a tunnel plus
VPC Networks; 2.2.1(c) prohibits circumventing service-specific limits, which forecloses the
standard multi-account escape hatch; the Service-Specific Terms still restrict large files
hosted outside Cloudflare on the CDN; and section 5 allows Beta Services and their content to be
removed at will. The spec should state, in writing, what the operator believes he is permitted to
do and what he will do if Cloudflare disagrees. Silence here is the most expensive item in this
file, because the remedy is a suspension notice rather than a bug report.

---

## 3. Not covered / open questions

1. **Whether SSSA 2.2.1(j) is enforced against single-user private-network tunnels.** I read the
   clause and I read Cloudflare's own product description of Cloudflare Tunnel as "VPN
   replacement and private network access" on
   https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/,
   which I reached through search but did not open in full. I could not find any Cloudflare
   statement about how the clause is applied to personal or single-tenant use. Need: a written
   answer from Cloudflare support or an account team, or a decision to keep the private-network
   surface unreachable by anyone but the operator.

2. **Whether Workers VPC will be priced at GA, and at what.** The blog says "at no additional
   cost during the beta" and the docs say "available for free" in beta. No GA price is
   published. The entire cost model has an unpriced line item on the critical path. Need: a
   published GA price or a stated contingency.

3. **What Cloudflare's SLA coverage is for the Zero Trust and Tunnel products specifically.** I
   read the Workers SLA (99.99%) and the R2 SLA (99.9%), both under the Enterprise Subscription
   umbrella, and the plans page showing no uptime SLA on Free or Pro. I did not find a Tunnel or
   Access SLA. `www.cloudflare.com/sla/` returned HTTP 422 from the reader. Need: the Tunnel and
   Access SLA pages, read directly.

4. **The container-escape CVEs I found but did not read.** CVE-2026-31431, CVE-2026-34040 and the
   November 2025 runc breakout set. Each needs a primary read before the runtime for untrusted
   CI is chosen. Without them, R6 is a recommendation rather than a specification.

5. **Access authentication log retention.** Carried from `research/C1-threat-model.md` open
   question 1, which I did not attempt to close. Everything about detecting a rogue replica
   depends on logs being exported immediately, because Cloudflare keeps none.

6. **Whether a Worker's default `fetch()` can reach RFC1918 or loopback.** Carried from
   `research/C1-threat-model.md` open question 2, which I did not attempt to close. It changes
   the SSRF surface of the control plane.

7. **A real figure for the human operational cost.** I could not verify one from a primary
   source, and I refuse to invent it. What I can state is the shape: cloudflared releases every
   one to three days with guidance to pin it, SeaweedFS ships about 4.3 releases a month, the
   kernel has a live unpatched escape in supported Ubuntu LTS releases, and the storage layer has
   no consistent online backup. The operator should measure his own first three months and write
   the number down, rather than accept any estimate including mine.

8. **The uptime of the operator's own machines.** Nothing in this file measures the availability
   of a self-hosted data plane, which is the other half of the availability question. A design
   whose control plane has a 99.99% SLO and whose data plane is one consumer-grade power supply
   is not a 99.99% system.

---

## Source list, all read 2026-10-29

Primary, read in full via the tinyfish gateway:

- https://www.cloudflarestatus.com/api/v2/incidents.json
- https://www.cloudflarestatus.com/api/v2/incidents/unresolved.json
- https://www.cloudflarestatus.com/api/v2/summary.json
- https://www.cloudflarestatus.com/history
- https://www.cloudflarestatus.com/incidents/0eqtn0khkz87
- https://onlineornot.com/status/cloudflare/incidents
- https://developers.cloudflare.com/fundamentals/api/reference/limits/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/
- https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/
- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/durable-objects/reference/data-location/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/workers-vpc/
- https://developers.cloudflare.com/workers-vpc/platform/limits/
- https://blog.cloudflare.com/workers-vpc-open-beta
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/system-requirements/
- https://developers.cloudflare.com/sandbox/concepts/security/
- https://blog.cloudflare.com/containers-cross-tenant-vulnerability
- https://blog.cloudflare.com/updated-tos
- https://www.cloudflare.com/service-specific-terms-application-services/
- https://www.cloudflare.com/terms/
- https://www.cloudflare.com/plans/
- https://www.cloudflare.com/workers-service-level-agreement/
- https://www.cloudflare.com/r2-service-level-agreement/
- https://www.hetzner.com/dedicated-rootserver/matrix-ax/
- https://ubuntu.com/security/CVE-2026-80521
- https://www.cve.org/CVERecord?id=CVE-2026-80521
- https://github.com/seaweedfs/seaweedfs/issues/7649
- https://github.com/seaweedfs/seaweedfs/discussions/8672
- https://dev.to/iam-tech/cloudflare-tunnel-530-errors-the-connector-that-was-healthy-and-did-nothing-3817
- https://kazishiplu.com/blog/connected-is-not-working/

GitHub metadata via `gh api`:

- cloudflare/cloudflared (repo and releases)
- seaweedfs/seaweedfs (repo and releases)
- firecracker-microvm/firecracker, google/gvisor, cloud-hypervisor/cloud-hypervisor,
  kata-containers/kata-containers (repo metadata only, used for the R6 context)

Secondary, read via the gateway, used only where labelled:

- https://community.cloudflare.com/t/rate-limits-being-triggered-unintentionally-after-exceeding140-requests-per-second/886273

Sibling research files in this repository, read for context and cited only where marked
**[carried]**: `research/A6-pricing-reality.md`, `research/C1-threat-model.md`,
`research/A4-durable-objects-workers.md`, `research/A5-zero-trust-vpc.md`,
`research/B5-storage.md`. I did not re-verify their claims and have labelled every one.
