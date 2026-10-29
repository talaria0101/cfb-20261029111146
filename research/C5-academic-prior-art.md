# C5-academic-prior-art

Research subagent for the "self-hosted cheaper alternatives to Cloudflare" design spec.
All sources read 2026-10-29 (UTC). Primary-source discovery via the pkgforge research
gateway pinned to tinyfish; page reads via the pkgforge read gateway pinned to tinyfish;
built-in web_search/web_fetch used only where noted. Every paper below lists
title / authors / year / venue / DOI where I could confirm it, plus the one result that
matters for this design. Labels: [verified] = I read the abstract or body and am quoting
it; [unverified] = I could not read the result, or a field is inferred.

## Method and fallback log

- Discovery: `https://research.web.pkgforge.dev/works?q=<query>&provider=tinyfish`
  (returns title, authors, year, venue, DOI/arXiv, cited_by, oa_url). Run 2026-10-29.
- Page reads: `https://read.web.pkgforge.dev/?url=<urlencoded>&provider=tinyfish`.
- Fallbacks (tinyfish refused, per protocol retried once after 5s, then built-in tools):
  1. ACM PDFs `10.1145/3585007` (FaaSLight), `10.1145/3634750` (NEPTUNE),
     `10.1145/3689031.3696073` (Cold Starts) all returned HTTP 502 twice through the
     read gateway. FALLBACK: built-in `web_search` to locate the arXiv mirrors, then read
     the arXiv abstracts `2207.08175`, `2205.04320`, `2410.06145` through the read gateway.
  2. Rahman 2023 Aalto thesis bitstream returned 502 twice. FALLBACK: none succeeded;
     its result is marked [unverified]. Existence confirmed only by the research-gateway
     metadata record.
- cited_by counts below are the values returned by the research gateway on 2026-10-29
  (OpenAlex-style counts). They are a real reading from that call, not an estimate, but
  they drift over time.

---

## 1. Findings

### A. Cold starts (the dominant latency variable for a self-hosted function/container plane)

**A1. FaaSLight: General Application-Level Cold-Start Latency Optimization for FaaS.**
- Authors: Xuanzhe Liu, Jinfeng Wen, Zhenpeng Chen, Ding Li, Junkai Chen, Yi Liu,
  Haoyu Wang, Xin Jin. Year 2023. Venue: ACM Transactions on Software Engineering and
  Methodology (TOSEM). DOI: 10.1145/3585007. arXiv mirror: 2207.08175.
- Claim / one result that matters: cold-start cost is dominated by application code
  loading, not by the platform's container spawn. Loading only indispensable code
  (via a function-level call graph, optional code loaded on demand) cut code-loading
  latency up to 78.95% (28.78% average) and total function response latency up to 42.05%
  (19.21% average); 21.25x improvement over the prior state of the art. [verified]
- Evidence: https://arxiv.org/abs/2207.08175 (read 2026-10-29); DOI confirmed via
  https://discovery.ucl.ac.uk/id/eprint/10164013/ and https://dl.acm.org/doi/10.1145/3585007.
- cited_by (research gateway, 2026-10-29): 145.

**A2. Serverless Cold Starts and Where to Find Them.**
- Authors: Artjom Joosen, Ahmed Hassan, Martin Asenov, Rajkarn Singh, Luke Nicholas
  Darlow, Jianfeng Wang, Qiwen Deng, Adam Barker. Year 2024 arXiv / 2025 ACM. Venue: ACM
  (proceedings), DOI: 10.1145/3689031.3696073. arXiv mirror: 2410.06145.
- Claim / one result that matters: from a month-long trace of 85 billion requests and
  11.9 million cold starts across five data centers on Huawei's serverless platform,
  cold-start duration is dominated by dependency deployment time and scheduling in one
  region (up to 7 s) and by pod allocation in another (up to 3 s). Runtime language,
  trigger type, sync/async, and resource allocation each move the number; the "pod
  utility ratio" (useful pod lifetime vs cold-start time) is the better metric than raw
  cold-start latency. Practical lever named: multi-region scheduling. [verified]
- Evidence: https://arxiv.org/abs/2410.06145 (read 2026-10-29); DOI/venue confirmed via
  https://dl.acm.org/doi/10.1145/3689031.3696073.
- cited_by (research gateway, 2026-10-29): 84.

**A3. Mitigating Cold Starts in Serverless Platforms: A Pool-Based Approach.**
- Authors: Ping-Min Lin, Alex Glikson. Year 2019. Venue: arXiv preprint. DOI:
  10.48550/arXiv.1903.12221 (arXiv-issued DataCite DOI).
- Claim / one result that matters: maintaining a pool of pre-warmed ("warm") function
  instances under Knative Serving reduced P99 response time by 85% for a single-instance
  pool. This is the canonical result that a warm pool trades idle cost for latency, which
  is exactly the cost/latency knob a self-hosted plane controls directly. [verified]
- Evidence: https://arxiv.org/abs/1903.12221 (read 2026-10-29).
- cited_by (research gateway, 2026-10-29): 120.

**A4. Fork in the Road: Reflections and Optimizations for Cold Start Latency in
Production Serverless Systems.**
- Authors: Xiaohu Chai, et al. Year 2025. Venue: USENIX OSDI 2025. DOI: not captured
  (USENIX; not confirmed). [venue unverified beyond the OSDI'25 program]
- Claim / one result that matters: the paper's core warning is that prior cold-start
  optimizations (1) rely on simplified assumptions that ignore large-scale-system
  complexity, (2) optimize isolated components while ignoring end-to-end workflow
  interactions, and (3) under-address concurrent execution. Even after adopting prior
  techniques, cold-start latency remains a key bottleneck on Ant Group's production
  serverless platform. This is the "the obvious fix does not survive contact with
  production" result. [verified for the abstract's stated limitations; the specific
  production numbers are in the body, which I did not fully read]
- Evidence: https://www.usenix.org/system/files/osdi25-chai-xiaohu.pdf (read 2026-10-29).

### B. Edge / cloud-edge orchestration and function placement

**B1. NEPTUNE: A Comprehensive Framework for Managing Serverless Functions at the Edge.**
- Authors: Luciano Baresi, Davide Yi Xian Hu, Giovanni Quattrocchi, Luca Terracciano.
  Year 2024. Venue: ACM Transactions on Autonomous and Adaptive Systems (TAAS), 19(1),
  pp. 7.1-7.32. DOI: 10.1145/3634750. arXiv precursor (SEAMS 2022, retitled): 2205.04320.
- Claim / one result that matters: a K3S-based prototype that (i) places functions on
  edge nodes by user location, (ii) avoids saturating single nodes, (iii) uses GPUs when
  present, and (iv) allocates CPU cores dynamically to meet target execution times; it
  reduces response time, network overhead, and resource consumption versus three
  state-of-the-art approaches. Directly relevant prior art for placement across a
  heterogeneous cloud+edge set of the operator's own machines. [verified]
- Evidence: https://arxiv.org/abs/2205.04320 (read 2026-10-29); journal/DOI confirmed via
  https://air.unimi.it/handle/2434/1227065 and https://dl.acm.org/doi/10.1145/3634750.
- cited_by (research gateway, 2026-10-29): 35.

**B2. Declarative secure placement of FaaS orchestrations in the cloud-edge continuum.**
- Authors: A. Bocci, S. Forti, G.L. Ferrari, A. Brogi. Year 2023. Venue: Electronics
  (MDPI), 12(6):1332. DOI: not captured from the gateway; MDPI article URL given below.
  [DOI unverified - not stated to avoid inventing it]
- Claim / one result that matters: placement of orchestrated serverless functions onto
  cloud-edge nodes is a multi-constraint problem (functional + non-functional), and the
  paper solves it declaratively while using information-flow analysis and padding to
  prevent information leaks through side channels. Relevant because a self-hosted hybrid
  plane re-introduces the placement + data-flow-security problem that a managed provider
  hides. [verified]
- Evidence: https://www.mdpi.com/2079-9292/12/6/1332 (read 2026-10-29).
- cited_by (research gateway, 2026-10-29): 18.

**B3. Improved QoS at the edge using serverless computing to deploy virtual network
functions.** Authors: S.R. Chaudhry, A. Palade, A. Kazmi. Year 2020. Venue: IEEE Internet
of Things Journal. DOI: not captured. [result unverified - abstract not read; listed as a
survey anchor only] Evidence: https://ieeexplore.ieee.org/abstract/document/9145582/
(IEEE page; not read). cited_by (research gateway, 2026-10-29): 61.

**B4. Management and orchestration of edge computing for IoT: A comprehensive survey.**
Authors: Y. Chiang, Y. Zhang, H. Luo, T.Y. Chen. Year 2023. Venue: IEEE Internet of
Things Journal. DOI: not captured. [result unverified - not read; a survey pointer]
Evidence: https://ieeexplore.ieee.org/abstract/document/10045724/. cited_by: 132.

### C. FaaS / serverless scheduling

**C1. Learning based Scalable Multi-Objective Scheduling of Workflows across UD-IaaS-FaaS
Systems.** Authors: G. Vasantha Reddy, Ram Bansal, Krashna, Suvarthi Sarkar, Aryabartta
Sahu. Year 2026 (submitted 11 Oct 2026). Venue: arXiv preprint. DOI:
10.48550/arXiv.2610.15886 (arXiv-issued). arXiv: 2610.15886.
- Claim / one result that matters: workflow scheduling over a hybrid User-Device + IaaS +
  FaaS continuum is a multi-objective problem (makespan, energy, cost) formulated as a
  MILP that is intractable, so they use graph neural networks + surrogate performance
  models + multi-sample REINFORCE, with task pairing for data locality. Validated on the
  Pegasus Montage workflow on a real UD-IaaS-FaaS testbed, beating a genetic-algorithm
  baseline. This is the closest academic match to "IaaS for heavy tasks, FaaS for
  fine-grained event-driven tasks, on machines I own." [verified]
- Evidence: https://arxiv.org/abs/2610.15886 (read 2026-10-29).

**C2. Allocation priority policies for serverless function-execution scheduling
optimisation.** Authors: Giuseppe De Palma, Saverio Giallorenzo, Jacopo Mauro. Year 2020.
Venue: Service-Oriented Computing (ICSOC 2020), Springer. DOI:
10.1007/978-3-030-65310-1_29.
- Claim / one result that matters: scheduling of serverless function execution can be
  improved with explicit allocation-priority policies. I confirmed the DOI/title/venue
  from the institutional record but did NOT read the abstract body, so the specific
  numeric result is [unverified]. Listed because it is the canonical "priority policy for
  FaaS scheduling" reference. [title/venue/DOI verified; numeric result unverified]
- Evidence: https://cris.unibo.it/bitstream/11585/784516/1/icsoc2020.pdf (landing record
  read 2026-10-29).
- cited_by (research gateway, 2026-10-29): 36.

**C3. (scheduling context) DCRDA: deadline-constrained function scheduling in serverless
cloud platform.** Authors: P.A. Birajdar, D. Meena, A. Satpathy, S.K. Addya. Year 2025.
Venue: Cluster Computing. DOI: not captured. [result unverified - not read] Evidence:
https://scholarsmine.mst.edu/cgi/viewcontent.cgi?article=3039&context=comsci_facwork.
cited_by: 2.

### D. Resource management for hybrid cloud / edge

**D1. Autonomous lifecycle management for resource-efficient workload orchestration for
green edge computing.** Authors: F. Guim, T. Metsch, H. Moustafa, T. Verrall. Year 2021.
Venue: IEEE Transactions (journal). DOI: not captured from gateway.
- Claim / one result that matters: dynamic workload orchestration across converged edge
  platforms is still immature; the paper targets autonomous life-cycle management so that
  network functions and multi-tenant IoT services with different compute needs and
  different SLOs share edge resources efficiently. The design-relevant point: a self-hosted
  hybrid plane must do this orchestration itself, and it is a research-grade problem, not
  a solved one. [verified abstract]
- Evidence: https://www.nearbycomputing.com/wp-content/uploads/2021/06/EdgeComputingAutonomousLifeCycleManagement.pdf
  (read 2026-10-29).
- cited_by (research gateway, 2026-10-29): 101.

**D2. Orchestration from the Cloud to the Edge.** Authors: S. Svorobej, M. Bendechache,
  F. Griesinger, et al. Year 2020. Venue: in "The Cloud-to-Thing Continuum", Springer/
  Palgrave. DOI: not captured. [result unverified - not read; survey/book chapter pointer]
Evidence: https://library.oapen.org/bitstream/handle/20.500.12657/39982/1/2020_Book_TheCloud-to-ThingContinuum.pdf#page=85.
cited_by: 59.

### E. Cost (serverless vs self-hosted / cost modelling)

**E1. FaaSter, Better, Cheaper: The Prospect of Serverless Scientific Computing and HPC.**
- Authors: Josef Spillner, Cristian Mateos, David A. Monge. Year 2017. Venue: Latin
  American High Performance Computing Conference (CLEI/Springer). DOI: not captured; the
  author manuscript states the final Springer DOI was pending at time of writing. [DOI
  unverified]
- Claim / one result that matters: serverless is economically and technically convincing
  for web apps, mobile backends and on-demand databases, but the fitness of generic FaaS
  configurations for HPC / high-throughput / scientific workloads must be re-evaluated
  case by case; they contribute a refined "FaaS-ification" process for legacy code. The
  honest read for this spec: "serverless is cheaper" is workload-dependent, not a law.
  [verified abstract]
- Evidence: https://digitalcollection.zhaw.ch/bitstreams/278a1844-5fee-4fbd-9acc-72782fc29f0e/download
  (read 2026-10-29).
- cited_by (research gateway, 2026-10-29): 156.

**E2. Function Memory Optimization for Heterogeneous Serverless Platforms with CPU Time
Accounting (CPU-TAMS).** Authors: Robert Cordingly, Sonia Xu, Wes Lloyd. Year 2022.
Venue: IEEE International Conference (2022). DOI: not captured from gateway.
- Claim / one result that matters: on commercial FaaS platforms, memory size is the single
  cost/performance knob and developers guess at it. CPU-TAMS (CPU-time accounting +
  regression, one profiling run) finds max-value memory settings within 8% runtime error
  and 5% cost error versus brute-force search. Concrete, transferable result: right-sizing
  the one knob is worth ~5% of cost with a single measurement. [verified abstract]
- Evidence: https://par.nsf.gov/servlets/purl/10427115 (read 2026-10-29).
- cited_by (research gateway, 2026-10-29): 28.

**E3. Serverless cloud computing: a comparative analysis of performance, cost, and
developer experiences in container-level services.** Author: M. Rahman. Year 2023.
Venue: Aalto University MSc thesis. DOI: none. [result unverified - abstract not read;
502 twice] Existence confirmed via research-gateway metadata only. Evidence:
https://aaltodoc.aalto.fi/bitstreams/4ed19f65-3ddd-4a5a-baf5-59805451a305/download (could
not read). cited_by: 12.

**E4. Meta-finding on the cost literature.** The peer-reviewed academic literature does
NOT contain a clean, current "Cloudflare R2/Workers vs one Hetzner box" break-even model.
The strong cost anchors in academia are older or domain-specific (E1, E2, E3). The
actionable break-even math lives in industry blogs and pricing pages, which is the
C2-tco-model subagent's job, not a citable academic result here. Several 2025-2026
"serverless cost" papers returned by the gateway are single-author, 1-3 citation,
low-tier venue items (e.g. ijtmh.com, iaeme.in, ijpe-online.com) and are not reliable
anchors; I did not treat any of them as a source. [verified as an observation about the
search results on 2026-10-29]

---

## 2. What this changes for the spec

1. Treat cold start as an engineering variable you own, not a platform given. A1/A2/A3
   all say cold start is dominated by (a) code/dependency loading, (b) pod/container
   allocation, and (c) scheduling. On a self-hosted plane the spec controls all three:
   keep function images small (A1), keep a warm pool sized to your traffic (A3), and
   co-locate the scheduler with the nodes to cut scheduling delay (A2). Concretely: pre-
   build per-job container images with dependencies baked in, run a small always-warm
   pool for the control-plane functions, and put the CI scheduler on the same LAN as the
   runners.

2. Budget for a warm pool as a real cost line. A3's 85% P99 reduction is bought with idle
   instances. The spec's cost model must include "N warm workers held idle" as a line
   item, and say how it scales down off-hours. This is the direct cost/latency trade the
   operator now owns explicitly.

3. Do not assume one global scheduler. A2 shows cold start differs by region/node and that
   multi-region (here: multi-machine) scheduling is the lever; A4 shows single-component
   optimizations break at production scale and under concurrency. So the orchestration
   layer should be per-cluster scheduling with cross-cluster routing, not one scheduler
   pretending every machine is identical.

4. Placement is a first-class, unsolved problem you are taking on. B1 (NEPTUNE) and B2
   (Bocci) and D1 all treat cloud-edge placement with constraints (location, saturation,
   GPU, dynamic CPU, SLOs, and in B2 side-channel-safe data flow) as research-grade. The
   spec must state its placement policy in one sentence (e.g. "jobs go to the machine with
   free CPU; containers pinned per-tenant; storage stays where the data is") rather than
   assuming a managed provider handles it.

5. Use the IaaS-for-heavy / FaaS-for-fine-grained split as the mental model, and cite C1
   as prior art. Long CI builds and containers are the "IaaS" leg; the control-plane
   functions and webhooks are the "FaaS" leg. C1 (UD-IaaS-FaaS) is the closest academic
   framing of exactly this hybrid, and it optimizes makespan + energy + cost jointly - so
   the spec's scheduler objective should be stated (latency vs cost vs energy) because the
   literature shows you cannot get all three for free.

6. Cost right-sizing is cheap and worth doing (E2). The single biggest cost lever on a
   metered FaaS leg is memory size; one profiling pass gets you within ~5% of optimal.
   Even on self-hosted metal, this maps to "size the container memory/CPU request to the
   measured need," which improves packing density and therefore how few boxes you need.

7. Do not cite a clean academic break-even. Per E4, there is no peer-reviewed current
   "self-hosted beats serverless at X requests/month" result to lean on. The spec's TCO
   section must rest on measured provider prices and measured hardware costs (C2), and any
   break-even number must be labelled an estimate with its assumptions, not sourced to a
   paper.

---

## 3. Not covered / open questions

- No academic paper gives a current Cloudflare-R2/Workers-specific break-even. That number
  must come from C2-tco-model. Any break-even in the spec is an estimate.
- I did not read the full bodies of A2, A4, B1, C1, E2, only abstracts; the specific
  experimental magnitudes (beyond what is quoted) are not confirmed here.
- C2 (De Palma) numeric result, C3 (DCRDA), B3 (Chaudhry), B4 (Chiang survey), D2
  (Svorobej) and E3 (Rahman) are metadata-only: existence and (where shown) DOI/venue are
  from the research gateway, but the "one result" is [unverified] because I could not read
  the abstract/body. Do not quote a result for these without opening them.
- DOI gaps: B2 (Bocci), D1 (Guim), D2, E1 (Spillner), E2 (Cordingly) returned no DOI from
  the gateway; I did not guess DOIs for them. If a citation needs a DOI, resolve each via
  the publisher page.
- Scheduling literature for GPU-accelerated serverless (MQGPU) and eBPF-based OS
  scheduling for serverless functions appeared in results but was not read; relevant only
  if the spec adds GPU or custom-kernel scheduling.
- Cold-start work for microVM-based serverless (e.g. RainbowCake ASPLOS'24, FaaScale)
  surfaced in A4's references but was not opened; that is the C4-microvm-sandbox
  subagent's territory and likely more useful there than here.
- The research gateway returned some 2026-dated works (e.g. arXiv 2610.15886, dated 11 Oct
  2026). These are recent and lightly cited; treat their results as provisional.
