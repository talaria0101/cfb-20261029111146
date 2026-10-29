# C4-microvm-sandbox

Research subagent C4-microvm-sandbox. All sources read on 2026-10-29 (UTC). Every figure below
came from a call I actually made during this session (pkgforge gateway search/read pinned to
tinyfish, `gh api`, NVD CVE API 2.0). Where I could not verify a number I wrote "unverified".

Scope: the isolation boundary for "run untrusted CI jobs and untrusted agent code on my own
metal", what it costs, and which of these projects Cloudflare's own Containers/Sandbox product
is actually built from. Sibling files A2 (Containers/Sandbox product surface), A3 (workerd),
B3 (orchestrators), B6 (CI systems) cover their own angles; I cite them where they already did
the work and I do not repeat it.

---

## 1. Findings

### 1.1 What Cloudflare's Sandbox is built from: Firecracker. Not gVisor, not Kata, not QEMU.

**Claim.** Cloudflare Containers, and therefore Cloudflare Sandboxes, run each instance inside a
Firecracker microVM. Cloudflare states this in its own product documentation and repeats it in
its security post-mortem.

**Evidence.**
- https://developers.cloudflare.com/containers/concepts/architecture/ (page "Lifecycle of a
  Container", last updated Sep 30, 2026): "Each container instance runs in a Firecracker
  microVM with its own kernel and network. No other workload on the Cloudflare network shares
  that kernel. Your image runs as a Linux container inside the VM." Also: "A Container can only
  be accessed through its Durable Object." Read 2026-10-29. [verified]
- https://developers.cloudflare.com/sandbox/concepts/security/ (last updated Aug 28, 2026):
  "The Sandbox SDK is built on Containers, which run each sandbox in its own VM for strong
  isolation." The page lists what the SDK protects against as "Sandbox-to-sandbox access (VM
  isolation)", "Resource exhaustion (enforced quotas)", "Container escapes (VM-based
  isolation)". Read 2026-10-29. [verified]
- https://blog.cloudflare.com/containers-cross-tenant-vulnerability/ : "Each container lives
  inside a dedicated virtual machine powered by the Firecracker virtual machine monitor.
  Firecracker presents this disk to the virtual machine as /dev/vdc." Read 2026-10-29.
  [verified]
- https://developers.cloudflare.com/sandbox/ : "Each instance is a microVM with its own kernel
  and network, so no other workload shares it." Read 2026-10-29. [verified]

**Consequence for the spec.** The operator's self-hosted equivalent of Cloudflare Containers is
Firecracker on bare metal. Everything else in this file is about what that costs and what it
does not buy.

---

### 1.2 The Firecracker boundary held. The shared host storage pool did not. This is the single
most useful lesson in this file.

**Claim.** A real cross-tenant data exposure in Cloudflare Containers (reported 2026-09-04,
remediated 2026-09-19) was not a VM escape and not a Firecracker bug. It was a host-side
`dm-thin` configuration: `skip_block_zeroing` was set on a pool shared across customer
accounts, so a 4 KiB guest write into a freshly allocated 64 KiB thin block left the remaining
60 KiB readable, containing the previous tenant's data. The guest read it back through a raw
read of its own `/dev/vdc`.

**Evidence.** https://blog.cloudflare.com/containers-cross-tenant-vulnerability/ , read
2026-10-29. Exact figures from the post: 64 KiB thin-block size; the PoC wrote one 4 KiB block
per selected region; across six production placements the researchers reported 5,614 testable
directory blocks, 2,700 distinct foreign directory inodes identified via ext4 `metadata_csum`,
and 162 correctly-attributed control blocks; residual material was observed on 18 of 24
placements and 20 of 22 underlying nodes across four continents; recovered material included
directory structures, database pages, and structurally complete SQLite databases. Mitigation:
remove `skip_block_zeroing`, then drain hosts, restart VMs, and clear cached image snapshots,
because "a new container could inherit mappings from a cached layer without allocating those
blocks again". Timeline: report 2026-09-04 15:26 UTC, fleet rollout started 2026-09-04 23:15
UTC, complete 2026-09-07 06:13 UTC, cleanup of pre-mitigation cached snapshots complete
2026-09-19 15:03 UTC. [verified]

**Why this matters more than a CVE.** It reframes the threat model for the operator's own box.
The attacker is a CI job with root inside its own microVM. The microVM is theirs; they own
`/dev/vdc`. The thing that leaks is host storage state that is *shared* with the next tenant.
An operator running one Firecracker per job on one ext4/XFS volume is running exactly the same
architecture, at 1/1000th the placement count, with the same failure mode available.

**What to do about it (my recommendation, see section 2).** Do not put per-job guest rootfs on a
thin-provisioned shared pool. Either (a) give each job its own image file on a filesystem you
control and truncate/rewrite the whole file on reuse, or (b) if you use a thin pool or a COW
layer cache, zero on allocation and purge cached image layers between tenants. Test it: write a
marker file, delete the job, start a new job, grep the raw device for the marker. That test is
the guard.

---

### 1.3 Firecracker's real numbers, from the project's own specification

**Claim.** Firecracker's overhead and boot claims are contractually specified and CI-enforced.

**Evidence.** https://github.com/firecracker-microvm/firecracker/blob/main/SPECIFICATION.md
(read via `gh api .../contents/SPECIFICATION.md`, 2026-10-29). On M5D.metal / M6G.metal with
hyperthreading disabled, for a microVM with 1 vCPU and 128 MiB RAM running the
Firecracker-tuned kernel:
- VMM thread memory overhead: `<= 5 MiB`. The doc notes the overhead does not include MMDS data
  store memory and rises with vsock connections.
- Boot: `<= 125 ms` from `InstanceStart` to the guest's `/sbin/init`, measured with the serial
  console disabled, a minimal kernel and minimal rootfs.
- Compute-only guest CPU performance: `> 95%` of the equivalent bare-metal performance.
- Network: up to `14.5 Gbps` using `<= 80%` of one dedicated host core; up to `25 Gbps` using
  `100%` of one core; virtualization adds on average `0.06 ms` of latency.
- Storage: up to `1 GiB/s` using `<= 70%` of one dedicated host core.
- VMM start to API socket availability: `<= 8 CPU ms`, wall clock 6 ms to 60 ms, typical 12 ms.
[verified]

**Claim.** Creation rate. From `docs/design.md` (same repo, same method): "With a microVM
configured with a minimal Linux kernel, single-core CPU, and 128 MiB of RAM, Firecracker
supports a steady mutation rate of 5 microVMs per host core per second (e.g., one can create
180 microVMs per second on a host with 36 physical cores)." And: "The number of Firecracker
microVMs running simultaneously on a host is limited only by the availability of hardware
resources." [verified]

**Claim.** Default guest memory is 128 MiB and the default vCPU count is 1. From
`README.md` (same repo, same method): "Setting the number of vCPUs (the default is 1)",
"Setting the memory size (the default is 128 MiB)". [verified]

**Claim.** Firecracker does no network filtering, by design. From `docs/design.md`: "Firecracker
does not perform any network traffic filtering. All egress traffic from a guest is therefore
considered untrusted, and should be filtered at the host-level." The design doc also states
that "all vCPU threads are considered to be running malicious code as soon as they have been
started". [verified]

**Real-world cross-check on the 125 ms figure.** Firecracker's own spec says 125 ms for a
minimal kernel and rootfs with the serial console disabled. A production CI product built on
Firecracker reported "A fast boot time of ~ <1-2s" for its full CI image with Docker
preinstalled. Evidence: https://blog.alexellis.io/blazing-fast-ci-with-microvms/ , read
2026-10-29. [verified as a quoted claim; I did not reproduce it] The gap between 125 ms and
1-2 s is the image and the entrypoint, not the hypervisor. Budget for the image.

---

### 1.4 Firecracker's device model is the smallest of any VMM here, and that is the point

**Claim.** Firecracker's guest-visible hardware is: virtio-net, virtio-block, vsock, an 8250
serial console, a partial i8042 keyboard controller used only to signal guest reset, plus the
PICs, IOAPIC and PIT that KVM itself provides. There is no PCI device passthrough, no VGA, no
USB, no emulated NVMe. The virtio PCI transport is opt-in and off by default.

**Evidence.**
- `docs/design.md`, "Machine Model": "Firecracker provides guests with storage and network
  access via emulated VirtIO Net and VirtIO Block devices. It also exposes a serial console and
  partial keyboard controller, the latter being used by guests to reset the VM... Within
  Firecracker, the purpose of the I8042 device is to signal the microVM that the guest has
  requested a reboot." Read 2026-10-29. [verified]
- `SPECIFICATION.md` and the machine model section name virtio net, block and vsock only.
  [verified]
- PCI transport opt-in: Firecracker security advisory GHSA-776c-mpj7-jm3r (CVE-2026-5747)
  workaround text: "The virtio PCI transport is opt-in via the `--enable-pci` command-line flag
  when starting Firecracker. The legacy MMIO transport is the default and is not affected by
  this issue... Note that switching from PCI to MMIO transport may result in reduced I/O
  throughput and increased latency." Read 2026-10-29 via
  `https://api.github.com/repos/firecracker-microvm/firecracker/security-advisories`.
  [verified]
- Host networking integration, from `docs/design.md`: "Firecracker emulated network devices are
  backed by TAP devices on the host. To make use of Firecracker, we expect our customers to
  leverage on-host networking solutions." [verified]

**Consequence.** There is no GPU path in Firecracker. If any CI job needs a GPU (CUDA builds,
ML training, browser tests with hardware acceleration), Firecracker is the wrong runtime for
that job class and you need QEMU/KVM or Cloud Hypervisor with VFIO. See 1.6.

---

### 1.5 Firecracker's CVE record is small, and both advisories are host-side or opt-in

**Claim.** NVD keyword search for "firecracker" returns 6 CVE records in total, as read
2026-10-29.

**Evidence.** `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=firecracker`
returned `totalResults: 6`. The six, with NVD-published dates and first 110 characters of the
description:
- CVE-2019-18960 (2019-12-11) vsock buffer overflow in 0.18.0 and 0.19.0
- CVE-2020-2025 (2020-05-19) Kata on Cloud Hypervisor, guest filesystem changes persisted to
  the host image file
- CVE-2020-16843 (2020-08-04) network stack freeze under heavy ingress traffic, 0.20.x before
  0.20.1 and 0.21.x before 0.21.2
- CVE-2020-27174 (2020-10-16) serial console buffer unbounded memory growth, before 0.21.3 and
  0.22.x before 0.22.1
- CVE-2026-1386 (2026-01-23) jailer symlink, see below
- CVE-2026-5747 (2026-04-08) virtio PCI transport OOB write, see below
[verified]

**Claim.** GHSA-776c-mpj7-jm3r / CVE-2026-5747, high severity, published 2026-04-07: a
root-privileged guest can modify virtio queue configuration registers after device activation,
bypassing bounds validation done at init. Impact: process panic (DoS) via divide-by-zero, or
out-of-bounds writes "up to 524,284 bytes beyond the virtio queues". Reaching host memory
beyond guest memory "require[s] additional preconditions... such as the use of a custom guest
kernel or specific snapshot configurations". Affected: >= 1.13.0 AND <= 1.14.3 AND 1.15.0.
Fixed in 1.14.4 and 1.15.1. Not affected: the default MMIO transport.

**Evidence.** `https://api.github.com/repos/firecracker-microvm/firecracker/security-advisories`
, read 2026-10-29. [verified]

**Claim.** GHSA-36j2-f825-qvgc / CVE-2026-1386, medium, published 2026-01-23: a UNIX symlink
issue in the jailer lets a local host user with write access to the pre-created jailer
directories overwrite arbitrary host files, if the jailer runs as root. Affected: v1.13.1 and
earlier, and 1.14.0. Fixed in v1.14.1 and v1.13.2. Workaround: `chown <trusted user> <jail
folder>` and `chmod 700 <jail folder>`.

**Evidence.** same endpoint, read 2026-10-29. [verified]

**Claim.** Current release line. `gh api repos/firecracker-microvm/firecracker/releases`, read
2026-10-29: v1.17.0 published 2026-09-10T14:19:40Z, v1.16.2 2026-09-10T14:17:52Z, v1.16.1
2026-07-02, v1.16.0 2026-06-04. Repo: 37,695 stars, Apache-2.0, language Rust, 116 open
issues, pushed_at 2026-10-29T10:49:20Z. [verified]

**Reading.** Both Firecracker advisories in the last 10 months are host-side (jailer directory
permissions) or require an opt-in transport plus unusual preconditions. The default
configuration has no open guest-to-host escape in the public record. That is a genuinely
different risk profile from the other runtimes in this file.

---

### 1.6 Cloud Hypervisor: the capable one, with the freshest escape-shaped CVEs

**Claim.** Cloud Hypervisor is a Rust VMM with a much larger feature set than Firecracker:
vhost-user, virtio-fs, VFIO PCI passthrough, device and CPU/memory hotplug, live migration,
snapshot and restore, Windows guests, Intel TDX and AMD SEV-SNP paths via QEMU in Kata.

**Evidence.**
- https://github.com/cloud-hypervisor/cloud-hypervisor/blob/main/docs/vfio.md : "`cloud-hypervisor`,
  as many VMMs do, uses the VFIO framework to directly assign host physical devices to the
  guest workloads... `cloud-hypervisor` only supports assigning PCI devices to its guests."
  The HOWTO requires unbinding the device from its native driver and binding it to `vfio-pci`.
  Read 2026-10-29. [verified]
- https://www.cloudhypervisor.org/docs/prologue/introduction/ lists among its user docs:
  "Using VFIO to passthrough PCI devices", "Live migration", "Snapshot & Restore of a VM",
  "virtio-fs", "How to hotplug devices", "vIOMMU configuration", "Running and debugging Windows
  guests", "Emulated NVMe controller via vfio-user". Read 2026-10-29. [verified]
- Kata's hypervisor table (https://github.com/kata-containers/kata-containers/blob/main/docs/hypervisors.md
  , read 2026-10-29) lists Cloud Hypervisor as rust, aarch64 + x86_64, no GPU support, no TDX,
  no SEV-SNP, and says "Cloud Hypervisor is a more modern hypervisor written in Rust". It
  credits QEMU as "the best supported hypervisor for NVIDIA-based GPUs and for confidential
  computing use-cases (such as Intel TDX and AMD SEV-SNP)". [verified]

**Claim.** Cloud Hypervisor's recent CVE record contains a guest-to-host file read that a
single VM can trigger on its own.

**Evidence.** NVD, read 2026-10-29:
- CVE-2026-27211: "Versions 34.0 through 50.0 are vulnerable to arbitrary host file
  exfiltration (constrained by process privileges) when using virtio-block devices backed by
  raw images. A malicious guest can overwrite its disk header with a crafted QCOW2 structure
  pointing to a sensitive host path. Upon the next VM boot or disk scan, the image format
  auto-detection parses this header and serves the host file's contents to the guest.
  Guest-initiated VM reboots are sufficient to trigger a disk scan and do not cause the Cloud
  Hypervisor process to exit. Therefore, a single VM can perform this attack without needing
  interaction from the management stack. Successful exploitation requires the backing image to
  be either writable by the guest or sourced from an untrusted origin... fixed in version 50.1.
  To workaround, enable land lock sandboxing and restrict process privileges and access."
  [verified]
- CVE-2026-45782: "From version 21.0 to before version 51.2, a guest can cause a use-after-free
  in the cloud-hypervisor process by submitting two virtio-block descriptor chains that reuse
  the same head_index while asynchronous block I/O is enabled (e.g. io_uring, aio)... patched in
  versions 51.2 and 52.0." [verified]
- CVE-2023-30612: the HTTP API socket allowed closing arbitrary open file descriptors in the
  process, "a potential Use-After-Free (UAF) vulnerability", fixed in 30.1 and 31.1. [verified]

**Claim.** Current release and repo state. `gh api repos/cloud-hypervisor/cloud-hypervisor`,
read 2026-10-29: 6,441 stars, 197 open issues, pushed_at 2026-10-29T11:59:14Z, language Rust.
GitHub's license API returns null for this repo. The repo ships a `LICENSES/` directory
containing `Apache-2.0.txt`, `BSD-3-Clause.txt` and `CC-BY-4.0.txt`, i.e. dual-licensed
Apache-2.0 / BSD-3-Clause. Releases: v54.0 published 2026-10-14, v53.0 2026-07-12, v52.0
2026-05-14, v51.2 2026-05-14. [verified for the stars/issues/dates/LICENSES directory; the
dual-license reading is my inference from the directory contents and the null from the license
API, so treat the exact license expression as unverified]

**Claim.** NVD keyword search for "cloud hypervisor" returns 10 CVE records in total, read
2026-10-29. [verified]

**Reading.** Cloud Hypervisor is the right VMM when you need VFIO, live migration, or Windows
guests. It is the wrong default for "untrusted CI job" because its attack surface is larger and
its 2026 record includes a self-triggerable host file read. CVE-2026-27211 in particular is the
same shape as the Cloudflare dm-thin bug: the guest reaches host state through the block
backend. If you must run Cloud Hypervisor, pin >= 50.1 (ideally >= 51.2), never give the guest a
writable raw backing image, and enable the landlock sandboxing the advisory names.

---

### 1.7 gVisor: the strongest non-VM option, and it cannot run a normal CI job

**Claim.** gVisor's boundary is a userspace kernel (the Sentry) that intercepts syscalls. Its
stated design goal is "additional defense against the exploitation of kernel bugs by untrusted
userspace code". It explicitly does not claim protection against hardware side channels, and
its own docs say "A sandbox is not a substitute for a secure architecture."

**Evidence.** https://gvisor.dev/docs/architecture_guide/security/ , read 2026-10-29. [verified]

**Claim.** gVisor's documented gaps make it unusable for the CI workloads the operator cares
about. From https://gvisor.dev/docs/user_guide/compatibility/ , read 2026-10-29:
- "gVisor does not fully support `io_uring`-related syscalls"
- "`io_uring` is disabled by default. When enabled, its implementation is limited to basic I/O
  operations."
- "Block device filesystems like `fat32`, `ext3`, `ext4` are not natively supported inside the
  gVisor kernel. As such, it is not possible to mount block devices from within the sandbox."
- "`iptables` are only partially supported. The general goal is to support the featureset
  necessary to be able to run Docker in gVisor, but not necessarily further."
- "Usage of KVM from *within* the sandbox is not supported."
- "While in-sandbox cgroups (CPU, memory) exist and can be used for resource *accounting*,
  resource *limits* are not enforced within the sandbox... gVisor cannot currently enforce
  resource limits between competing processes within the *same* sandbox."
- "Device files for custom hardware is generally not supported, with the notable exceptions of
  NVIDIA GPUs and TPU devices."
[verified]

**Claim.** gVisor's 2026 CVE record includes two host-code-execution bugs, one of which needs
only "standard container privileges".

**Evidence.** NVD, read 2026-10-29:
- CVE-2026-96812: "Improper Exposure of Resource to Wrong Sphere in the host file helper (gofer)
  in Google gVisor prior to commit 573a9e73cf844f on Linux platforms with CUSE enabled allows a
  local attacker with container image deployment privileges to achieve root code execution on
  the host system. By including a /dev/cuse character device node in a container image, opening
  the device passes through to the host..." [verified]
- CVE-2026-95702: "Use-after-free vulnerability in VFS in Google gVisor prior to release
  20260831.0 on all platforms allows a local attacker with standard container privileges to
  achieve code execution in the host sentry process by double-freeing the backing MemoryFile
  from an in-sandbox overlay filesystem. The sentry process remains confined by host-level
  Linux seccomp and namespace boundaries." [verified]
- Also in the record: CVE-2025-2713 (runsc local privilege escalation, "the process initially
  ran with root-like permissions until the first fork"), CVE-2024-10603 and CVE-2024-10026
  (predictable TCP/UDP source ports and header values), CVE-2023-7258 (DoS via refcounting bug
  in mount point tracking). [verified]

**Claim.** NVD keyword search for "gvisor" returns 11 CVE records in total, read 2026-10-29.
[verified]

**Claim.** gVisor's performance costs are structural, and the project says so. From
https://gvisor.dev/docs/architecture_guide/performance/ , read 2026-10-29: "the existence of the
Sentry means that additional memory will be required, and application system calls must
traverse additional layers of software"; the network stack "does not support all the advanced
recovery mechanisms offered by other stacks and is less CPU efficient"; the guide labels these
"structural costs" and "implementation costs". The guide's quantitative results are presented as
figures that the text extraction did not carry, so I have no gVisor numbers from a primary
source. [verified for the quoted text; the absence of numbers is a real gap, see section 3]

**Vendor estimates, not primary data.** Northflank, which runs both microVM-backed sandboxes and
gVisor in production, states gVisor's syscall interception "adds latency, especially on I/O-heavy
workloads (often 10-30% slower)" and puts microVM boot at "~125ms to ~300ms depending on VMM"
and microVM memory overhead at "less than 5 to 10 MiB per workload". Source:
https://northflank.com/blog/microvm-vs-gvisor , published 28 April 2026, read 2026-10-29.
[unverified: single-vendor estimate, no methodology published]

**Reading.** gVisor is the wrong tool for untrusted CI. A CI job that builds a container image,
runs Docker, runs KinD/k3s, mounts a loop device, or uses io_uring will fail or degrade inside
gVisor, and gVisor cannot enforce CPU limits between processes in one sandbox. gVisor is the
right tool for one narrow case: a host with no usable KVM (a nested-virt cloud VM), where you
want better-than-container isolation and your workload is a single process.

---

### 1.8 Kata Containers: the Kubernetes path, and its CVE record is the longest here

**Claim.** Kata Containers 4.3.1 was published 2026-10-21, i.e. three days before I read this,
so the project is alive.

**Evidence.** `gh api repos/kata-containers/kata-containers/releases`, read 2026-10-29: 4.3.1
published 2026-10-21T21:47:55Z, 4.3.0 2026-10-20, 4.2.0 2026-09-15, 4.1.0 2026-08-21. Repo:
9,044 stars, 1,247 open issues, language Rust, topics include firecracker, kvm, qemu,
security. https://katacontainers.io/ : "Kata Containers is an open source community working to
build a secure container runtime with lightweight virtual machines... Kata Containers also
supports multiple hypervisors including QEMU, Cloud-Hypervisor and Firecracker and integrates
with the containerd project among others. The Kata Containers community is stewarded by the
Open Infrastructure Foundation." Read 2026-10-29. [verified]

**Claim.** Kata's supported hypervisors, from its own table: Cloud Hypervisor, Firecracker,
QEMU, Dragonball (Ant Group, in-process Rust VMM), StratoVirt. Only QEMU has GPU support and
confidential computing (TDX, SEV-SNP). Evidence:
https://github.com/kata-containers/kata-containers/blob/main/docs/hypervisors.md , read
2026-10-29. [verified]

**Claim.** NVD keyword search for "kata containers" returns 17 CVE records in total, read
2026-10-29. A sample of the ones that bear on the boundary:
- CVE-2026-24834: "In versions prior to 3.27.0, an issue in Kata with Cloud Hypervisor allows a
  user of the container to modify the file system used by the Guest micro VM ultimately
  achieving arbitrary code execution as root in said VM. The current understanding is this
  doesn't impact the security of the Host or of other containers / VMs running on that Host
  (note that arm64 QEMU lacks NVDIMM read-only support: It is believed that until the upstream
  QEMU gains this capability, a guest write could reach the image file)."
- CVE-2026-24054: containerd falling back to bind-mounting an empty snapshotter directory for a
  malformed or layer-less image causes "the underlying device being hotplugged to the guest",
  which "may lead to the host's block device being mounted as read-only". Fixed 3.26.0.
- CVE-2026-64676: kata-agent authorization bypass in Confidential Containers memory management,
  two ttRPC methods missing the OPA/Rego agent policy check, fixed 4.0.0.
- CVE-2025-58354: on TDX systems a malicious host can selectively fail IO to skip initdata
  verification, fixed 3.21.0.
- The 2020 cluster (CVE-2020-2023/2024/2025/2026, CVE-2020-28914, CVE-2020-27151) is a set of
  guest-to-host and guest-to-guest escapes fixed in 1.11.x, including one where "the runtime
  will execute binaries given using annotations without a" check.
[verified, all from NVD read 2026-10-29]

**Reading.** Kata is the right answer only if the operator's data plane is already Kubernetes.
Kata adds a moving part (the runtime plus an agent inside the guest) whose CVE record is longer
than Firecracker's and whose worst recent bugs were host-image and hotplug issues, i.e. the same
class as 1.2. If the orchestration layer is not k8s, Kata is overhead you do not need.

---

### 1.9 QEMU/KVM: the largest attack surface, and the only GPU path

**Claim.** NVD keyword search for "qemu" returns 1,433 CVE records in total, and for "kvm" 677,
as read 2026-10-29.

**Evidence.** `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=qemu` ->
`totalResults: 1433`; same for `kvm` -> `677`. [verified]

**Caveat, stated because it matters.** These are keyword matches over CVE record text. A record
counts if the word "qemu" appears anywhere in its description, including records about Xen,
Spice, libvirt, or products that merely mention QEMU. 1,433 is therefore an upper bound on
QEMU-attributable CVEs and a lower bound on the size of the ecosystem QEMU's C code touches. It
is still three orders of magnitude larger than Firecracker's 6 and two orders larger than Cloud
Hypervisor's 10, and that ordering is the useful signal.

**Reading.** QEMU's device model is the reason it can do GPU passthrough and TDX/SEV-SNP, and
also the reason it is the wrong default for untrusted code. Use QEMU for the GPU CI class and
nothing else, and put those VMs on a separate host from the general untrusted pool if you can.

---

### 1.10 youki and crun are container runtimes, not isolation boundaries

**Claim.** youki is an OCI runtime-spec implementation in Rust, "similar to runc". crun is a
"fully featured OCI runtime and C library" in C. Neither provides a kernel boundary. Running an
untrusted CI job under either means the job shares the host kernel with every other job and
with the host.

**Evidence.**
- https://github.com/youki-dev/youki README: "**youki** is an implementation of the
  [OCI runtime-spec] in Rust, similar to [runc]." Its own benchmark table (hyperfine,
  create/start/delete of a container, kernel 6.5.0-35-generic, youki 0.3.3 vs runc 1.1.7 vs
  crun 1.15) reports youki 111.5 ms +/- 11.6 ms, runc 224.6 ms +/- 12.0 ms, crun 47.3 ms
  +/- 2.8 ms. Read 2026-10-29. [verified]
- `gh api repos/youki-dev/youki`, read 2026-10-29: 7,662 stars, Apache-2.0, Rust, 181 open
  issues, pushed_at 2026-10-29T00:43:16Z. Releases: v0.7.0 2026-07-25, v0.6.0 2026-02-25,
  v0.5.7 2025-11-05. [verified]
- `gh api repos/containers/crun`, read 2026-10-29: 4,190 stars, GPL-2.0, C, 50 open issues,
  pushed_at 2026-10-28T18:24:15Z. [verified]

**Reading.** crun is roughly 2.4x faster than youki at container create/start/delete on
youki's own benchmark, and youki is a Rust project at v0.7.0 with 181 open issues. If the
operator's reason for choosing youki is "Rust, therefore safer", that reasoning does not hold:
the security boundary is the kernel, not the runtime binary. crun is the pragmatic choice for
the inner container inside the microVM.

---

### 1.11 The Rust microVM runtime inventory

**Claim.** Beyond Firecracker and Cloud Hypervisor, the Rust VMM/runtime projects that exist and
are alive as of 2026-10-29:

| Project | What it is | gh api evidence (read 2026-10-29) |
| --- | --- | --- |
| firecracker-microvm/firecracker | microVM VMM, KVM, serverless-shaped | 37,695 stars, Apache-2.0, Rust, pushed 2026-10-29 |
| cloud-hypervisor/cloud-hypervisor | cloud VMM, VFIO, live migration | 6,441 stars, dual Apache-2.0/BSD-3-Clause, Rust, pushed 2026-10-29 |
| google/crosvm | Chrome OS VMM, "The Chrome OS Virtual Machine Monitor" | 1,352 stars, BSD-3-Clause, Rust, pushed 2026-10-29 |
| smol-machines/smolvm | "An embeddable, portable, branchable virtual machine to safely run Agents locally" | 6,868 stars, Apache-2.0, Rust, pushed 2026-10-29, v1.32.4 on 2026-10-28 |
| libkrun/krunvm | "Create microVMs from OCI images" | 1,777 stars, Apache-2.0, Rust, pushed 2026-09-15, v0.2.7 on 2026-08-25 |
| AsahiLinux/muvm | "muvm - run programs from your system in a microVM" | 985 stars, Rust, pushed 2026-10-13 |
| liquidmetal-dev/flintlock | "Lock, Stock, and Two Smoking MicroVMs. Create and manage the lifecycle of MicroVMs backed by containerd" | 1,519 stars, MPL-2.0, Go, pushed 2026-10-27, v0.16.0 on 2026-10-03 |
[verified for every gh api field; the project descriptions are the gh api `description` fields
quoted verbatim]

**Claim.** Firecracker's own README names the two integration paths: "Firecracker has also been
integrated in container runtimes, for example Kata Containers and Flintlock." Evidence:
`gh api repos/firecracker-microvm/firecracker/contents/README.md`, read 2026-10-29. [verified]

**Claim.** The one maintained Firecracker-based CI runner I could find is stale. `gh api
repos/self-actuated/actuated` ("Blazingly fast CI runners"): 184 stars, pushed_at
2024-07-11T18:03:52Z, zero releases returned by the releases endpoint, archived: false. The
product page https://actuated.com/ exists and the launch blog
https://blog.alexellis.io/blazing-fast-ci-with-microvms/ describes a pilot that "already run
thousands of VMs", but the repository has not moved since July 2024. [verified]

**Reading.** smolvm (6,868 stars, shipping near-daily) and krunvm are the interesting young Rust
options, and smolvm is what gofixpoint/amika uses for its rigs (B1-amika.md line 108: "runs rigs
as smolvm VMs... Needs KVM"). But neither has Firecracker's CVE record, specification, or
host-setup guidance. For a spec, the defensible default is Firecracker, with Cloud Hypervisor as
the documented fallback for VFIO, and everything else named as not-yet-defensible.

---

### 1.12 Prior art: E2B Runtime is the closest existing design to what the operator is building

**Claim.** E2B has open-sourced the runtime behind its sandbox cloud under Apache-2.0, and it
implements, in one codebase, almost every element the operator needs for the data plane.

**Evidence.** https://github.com/e2b-dev/runtime , README read via `gh api` 2026-10-29:
- "The complete backend that powers E2B Cloud: the control-plane API, the per-node orchestrator
  that drives Firecracker, the agent that runs inside every VM, the edge router for sandbox
  traffic, and the template builder."
- "A sandbox is a resumed snapshot. Templates are pre-booted VMs (memory, disk, and machine
  state) stored in object storage. 'Creating' a sandbox means restoring one, not booting a
  kernel. Memory pages are served lazily on page fault through `userfaultfd`, and the root
  filesystem is a copy-on-write overlay over a read-only image."
- "Control plane and data plane never mix. The API decides *where* a sandbox runs and records
  *that* it runs. The orchestrator on each node owns *how* it runs: the Firecracker process, the
  network namespace, the block device, the cgroup. Sandbox traffic goes straight from the edge
  to the node and never passes through the API."
- "Hardware-isolated sandboxes. One Firecracker microVM per sandbox, in its own cgroup and
  network namespace, with a per-sandbox nftables egress firewall and SNI/Host-inspecting domain
  allow and deny lists."
- "Secrets are metadata-only on the control plane: no value ever crosses the API, a log, or a
  span... orchestrator-ee resolves a marker to a value at sandbox egress, never here."
- "Persistent volumes, secrets, workload identity... Workload identity gives a sandbox
  short-lived tokens without the API ever minting a credential."
- Deployment shape: "On one machine you own. E2B Embed is the whole stack, real Firecracker
  sandboxes included, on a single Linux host with KVM. Two files and one command" (docker
  compose up). Also ships Terraform for GCP/AWS/Azure and a Kubernetes manifest. "Embed is one
  machine by design."
- Architecture diagram: `SDK/CLI --REST--> API --gRPC--> orchestrator --> Firecracker microVM
  --> envd --> your processes`, with PostgreSQL, Redis and ClickHouse behind the API.
- `docs/ARCHITECTURE.md` (read via `gh api` 2026-10-29) adds: each sandbox gets "a network
  namespace with a veth pair and a tap device, unique host-side IP (from a /16), NAT, and
  per-slot nftables egress firewall (with SNI/Host-inspecting TCP firewall for domain
  allow/deny lists). Slots are pooled and reused"; guest metadata and the envd access token
  hash are passed via MMDS; a sandbox may use fewer vCPUs than its VM has, held by a `cpu.max`
  quota in a threaded child of the sandbox cgroup; every cold boot of a rootfs that was not
  frozen at pause runs "a jailed `e2fsck -p -E journal_only` before the VM starts".
[verified for every quoted string]

**Repo state.** `gh api repos/e2b-dev/runtime`, read 2026-10-29: 1,781 stars, Apache-2.0, Go,
pushed_at 2026-10-29T11:22:24Z. Topics: ai-agents, code-interpreter, consul, devtools,
firecracker, gcp, go, infra, kvm, llm, microvm, nomad, sandbox, terraform, vm, vmm. Latest
release `2026.30` published 2026-09-10. The related `e2b-dev/E2B` SDK repo has 14,606 stars.
[verified]

**Reading.** This is the single highest-leverage finding for the operator. Building a Firecracker
orchestrator from scratch is a multi-month project, and E2B has published a working one with the
exact patterns this design needs: control plane that holds no secrets, data plane that holds
them, per-sandbox netns plus nftables plus SNI inspection, snapshot-resume with userfaultfd,
and a single-machine Embed mode for a home lab. The spec should treat "adopt E2B Runtime Embed
or its orchestrator" as the default and "write our own Firecracker controller" as the expensive
alternative.

---

### 1.13 Forking a warm snapshot to many CI jobs is explicitly called insecure unless you reseed

**Claim.** Firecracker's own docs say resuming the same snapshot more than once is insecure.

**Evidence.** https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/snapshot-support.md
, read 2026-10-29: "When snapshots are used in a such a manner that a given guest's state is
resumed from more than once, guest information assumed to be unique may in fact not be; this
information can include identifiers, random numbers and random number seeds, the guest OS
entropy pool, as well as cryptographic tokens. Without a strong mechanism that enables users to
guarantee that unique things stay unique across snapshot restores, we consider resuming
execution from the same state more than once insecure." The doc's Example 3 (load S into B, then
C) is marked insecure for both. Mitigation: the VMGenID device, which "Firecracker will always
enable", updated on resume so Linux >= 5.18 reseeds its in-kernel PRNG. But: "State other than
the guest kernel entropy pool, such as unique identifiers, cached random numbers, cryptographic
tokens, etc **will** still be replicated across multiple microVMs resumed from the same
snapshot. Users need to implement mechanisms for ensuring de-duplication of such state, where
needed." The doc also notes VMClock's `vm_generation_counter` support "was merged in Linux
kernel v7.0" and that the patches are backported to Amazon Linux 5.10 and 6.1 microVM kernels.
[verified]

**Reading.** A CI system that snapshots a warm builder image and forks it per job inherits every
token, machine-id, and cached credential that was live at snapshot time. This is a
credential-leak primitive across jobs, and it is exactly the "egress of secrets" failure the
threat model (C1) needs to cover. Snapshot before any secret is loaded, or reseed everything
explicitly.

---

### 1.14 Firecracker pins the host kernel, and the newest supported one is very recent

**Claim.** Firecracker's host and guest kernel support is versioned and time-boxed, and the
newest supported host kernel is 6.18.

**Evidence.** https://github.com/firecracker-microvm/firecracker/blob/main/docs/kernel-policy.md
, read 2026-10-29. Host kernel table: 4K pages, v5.10 (min Firecracker v1.0.0, min end of
support 2024-01-31); v6.1 (min v1.5.0, end of support 2025-10-12); v6.18 (min v1.16.0, end of
support 2028-05-28). Guest kernel table: v5.10 (end of support 2024-01-31), v6.1 (min v1.9.0,
end of support 2026-09-02), v6.18 (min v1.16.1, end of support 2028-06-01). The policy: "Once a
kernel version is officially added, it is supported for a minimum of 2 years. At least 2 major
guest and host versions will be supported at any time." [verified]

**Claim.** Firecracker's tested platforms are AWS bare-metal instance types only, including
aarch64 Graviton and 8th-gen Intel Granite Rapids (the latter restricted to 6.1 or 6.18 host
kernels because of "poor kernel support for Granite Rapids CPUs on 5.10"). Evidence: README
"Tested platforms" table, read 2026-10-29. [verified]

**Reading.** The operator's own metal must run a supported host kernel. A Hetzner or OVH box on
an LTS distro kernel may be outside the tested matrix, and Firecracker's own policy says "other
versions and other kernel configs might work, they are not periodically validated in our test
suite, and using them might result in unexpected behaviour". Budget a kernel upgrade, and expect
to be off the validated path.

---

### 1.15 Host setup obligations Firecracker documents and the operator inherits

**Claim.** Firecracker's production host setup document lists concrete obligations that are easy
to miss and that map directly onto "untrusted CI job".

**Evidence.** https://github.com/firecracker-microvm/firecracker/blob/main/docs/prod-host-setup.md
, read 2026-10-29:
- "Firecracker relies on KVM and on the processor virtualization features for workload
  isolation. The host and guest kernels and host microcode must be regularly patched in
  accordance with your distribution's security advisories."
- Seccomp: "By default, Firecracker uses the most restrictive filters, which is the recommended
  option for production usage. Production usage of the `--seccomp-filter` or `--no-seccomp`
  parameters is not recommended."
- Serial device: "because the guest has access to the serial device. This can lead to unbound
  memory or storage usage on the host side... we do not recommend that users enable the serial
  device in production. To disable it in the guest kernel, use the `8250.nr_uarts=0` boot
  argument... Please be aware that the device can be reactivated from within the guest even if
  it was disabled at boot."
- Cgroups: `memory.limit_in_bytes` bounds memory usage, `memory.memsw.limit_in_bytes` limits
  memory+swap, `cpu.shares`, `cpu.cfs_period_us` and `cpu.cfs_quota_us` bound CPU. And:
  "Memory pressure on a host can cause memory to be written to drive storage when having guest
  memory contents on microVM storage devices."
- `kvm-pit` overhead: the doc warns about host CPU increase from `kvm-pit` kernel threads and
  recommends moving them or lowering `min_timer_period_us`.
[verified]

**Claim.** The jailer is the second line of defence and must be used. From `docs/design.md`:
"In production environments, Firecracker should be started only via the `jailer` binary"; the
jailer "sets up system resources that require elevated permissions (e.g., cgroup, chroot),
drops privileges, and then exec()s into the Firecracker binary, which then runs as an
unprivileged process". [verified]

---

### 1.16 What Cloudflare's own Sandbox does not give you, which the operator must supply

**Claim.** Cloudflare's sandbox security page is explicit that the sandbox is not the security
boundary: "Sandbox IDs provide basic access control but aren't cryptographically secure", "For
complete isolation, use separate sandboxes per user", and the page's "What you must implement"
list is "Authentication and authorization", "Input validation and sanitization", "Rate
limiting", "Application-level security (SQL injection, XSS, etc.)".

**Evidence.** https://developers.cloudflare.com/sandbox/concepts/security/ , read 2026-10-29.
The page also recommends the outbound-handler pattern for secrets: "Passing external API
credentials directly to a sandbox - via environment variables or files - means the sandbox
process holds a live credential that any code running inside it can read. Outbound handlers
remove that exposure by keeping credentials in the Worker and injecting them into outbound
requests." [verified]

**Claim.** The smallest Cloudflare instance type is 256 MiB / 1/16 vCPU / 2 GB disk, and custom
types are capped at 4 vCPU, 12 GiB memory, 20 GB disk, with a minimum of 3 GiB memory per vCPU.
Per-account caps: 6 TiB concurrent memory, 1,500 concurrent vCPU, 30 TB concurrent disk, 50 GB
total image storage, 20 GB max snapshot.

**Evidence.** https://developers.cloudflare.com/containers/platform/limits/ (page "Limits and
Instance Types", last updated Oct 21, 2026), read 2026-10-29. [verified] (A2-containers-sandbox.md
records the same table; I re-read the page myself rather than relying on it.)

**Claim.** Egress from a Cloudflare container is interceptable but capped: at most 128 entries
per container, shared across `interceptOutboundHttp()`, `interceptOutboundHttps()` and
`interceptAllOutboundHttp()`; a hostname or glob uses two entries (one IPv4, one IPv6), an IP or
CIDR uses one. Intercepts cannot be removed while the container runs.

**Evidence.** https://developers.cloudflare.com/containers/api/durable-object-container/ ,
"Intercept limit" section, read 2026-10-29. [verified]

**Reading.** 256 MiB is a useful real-world floor for "a full Linux environment with a container
inside a microVM", from a vendor shipping this at scale. Use it for density math, not the 128 MiB
Firecracker default, which assumes a minimal kernel and rootfs. And note the asymmetry the
operator gets by self-hosting: Cloudflare caps egress policy at 128 entries and cannot remove an
intercept from a running container, while nftables on his own host has neither limit.

---

### 1.17 The cost model for the boundary, with the assumptions stated

**Claim.** Per-microVM overhead, using only figures from this file.

| Component | Figure | Source |
| --- | --- | --- |
| Firecracker VMM threads | <= 5 MiB per microVM | SPECIFICATION.md [verified] |
| Guest RAM floor (Firecracker default) | 128 MiB | README.md [verified] |
| Guest RAM floor for a real Linux container | 256 MiB | Cloudflare `lite` instance type [verified] |
| Boot to `/sbin/init`, minimal image | <= 125 ms | SPECIFICATION.md [verified] |
| Boot, real CI image with Docker | ~1-2 s | alexellis.io (quoted claim) [verified as quote] |
| Creation rate | 5 microVMs per host core per second | design.md [verified] |
| CPU cost, compute-only guest | > 95% of bare metal, so < 5% tax | SPECIFICATION.md [verified] |
| Storage throughput | 1 GiB/s at <= 70% of one dedicated host core | SPECIFICATION.md [verified] |
| Network throughput | 14.5 Gbps at <= 80% of one dedicated host core | SPECIFICATION.md [verified] |
| Network latency added | 0.06 ms average | SPECIFICATION.md [verified] |

**Derived density, labelled as my arithmetic, not a measurement.** On a 16-core, 64 GiB host
reserving 8 GiB for the host itself, with 2 vCPU and 4 GiB per CI job, you get 14 concurrent
jobs. With 1 vCPU and 256 MiB per job (the lite shape), you get roughly 56 GiB / 256 MiB = 224
jobs in theory, and the binding constraint becomes vCPUs and disk, not RAM. Creation throughput
is not the constraint at any of these numbers: 5 per core per second means a 16-core host can
create 80 microVMs per second. **Estimate, not a measurement. I did not run any of this.**

**Claim.** gVisor's and Kata's per-instance overhead in absolute numbers is not something I
could source from a primary document in this session. gVisor's performance guide presents its
figures as images; the text extraction carried none of them. [unverified]

---

## 2. What this changes for the spec

1. **Name Firecracker as the isolation boundary for untrusted CI and untrusted agent code, and
   say why in one line: it is what Cloudflare's own Sandbox runs, it has the smallest device
   model of any VMM here, and its public CVE record is 6 entries against QEMU's 1,433 keyword
   matches.** Any other choice needs a stated reason (VFIO, live migration, Windows, no KVM).

2. **Do not put per-job guest rootfs on a shared thin-provisioned pool.** The Cloudflare
   incident is the proof: the VM boundary held for years and the host storage pool leaked across
   tenants. Give each job its own image file, rewrite the whole file on reuse, and if you use a
   COW layer cache, zero on allocation and purge cached layers between tenants. Write the guard
   test (marker file, delete job, new job, grep raw device) before you write the scheduler.

3. **Reserve Cloud Hypervisor for VFIO and live migration, and pin it to >= 51.2.** CVE-2026-27211
   is a guest-triggerable host file read through the block backend, and the same class of bug
   appears again in Kata on Cloud Hypervisor (CVE-2026-24834). If a job needs a GPU, it goes on a
   QEMU/KVM host, ideally a separate one.

4. **Drop gVisor from the untrusted-CI path entirely.** It cannot mount a block device inside the
   sandbox, cannot run KVM inside the sandbox, only partially supports iptables, disables
   io_uring by default, and cannot enforce CPU limits between processes in one sandbox. A CI
   system whose jobs build containers or run KinD will not work on it. Keep it as the documented
   answer for exactly one case: a host with no usable KVM.

5. **Do not use youki for security.** youki and crun are OCI runtimes; the kernel is the
   boundary, not the runtime. Use crun as the inner container runtime inside the Firecracker
   guest. youki's Rust-ness buys memory safety in one binary, not tenant isolation.

6. **Do not build the Firecracker orchestrator first.** Adopt E2B Runtime (Apache-2.0, Go,
   actively pushed, Embed mode for a single machine) as the reference implementation and copy
   its three decisions verbatim: control plane holds only secret markers and never values; the
   orchestrator resolves them at sandbox egress; per-sandbox netns plus nftables with SNI/Host
   inspection, default-deny. Cloudflare's own sandbox docs recommend the same credential pattern
   ("keep the credential in the Worker and inject it into outbound requests"), so the operator is
   not inventing anything.

7. **Never fork a warm snapshot into a CI job.** Firecracker's docs call multi-resume insecure
   and state that everything except the kernel entropy pool is replicated. Snapshot before any
   secret is loaded, and treat machine-id and cached tokens as shared state that must be
   regenerated per job.

8. **Budget a host kernel upgrade before anything else works.** Firecracker v1.16.0+ is
   validated on host kernel 6.18; 6.1 support ended 2025-10-12 per its own policy. A stock LTS
   distro kernel is outside the tested matrix. This is a prerequisite, not a nice-to-have, and it
   belongs in C3 (bare-metal provisioning).

9. **Set the guest memory floor at 256 MiB, not 128 MiB, for density planning.** 128 MiB is
   Firecracker's default for a minimal kernel and rootfs. 256 MiB is what Cloudflare ships as the
   smallest instance type that runs a full Linux container.

10. **Disable the guest serial console and keep seccomp on.** `8250.nr_uarts=0` on the kernel
    command line, and never pass `--no-seccomp`. Firecracker's own production host setup
    document says both, and notes the serial device can be reactivated from inside the guest.

11. **Treat the Firecracker API socket as a security boundary and never let a job near it.**
    CVE-2023-30612 in Cloud Hypervisor is exactly this: write access to the API socket meant
    arbitrary fd closes and a potential UAF. The API socket belongs to the orchestrator, in the
    jailer's chroot, owned by a uid the job cannot reach.

12. **Price the isolation, do not assert it.** Per the table in 1.17: <= 5 MiB VMM overhead,
    <= 125 ms minimal boot, ~1-2 s real-image boot, < 5% compute tax, 0.06 ms added latency. On
    a 16-core box that is roughly 14 concurrent 2 vCPU / 4 GiB CI jobs. Every number in that
    sentence has a source in section 1; none of it is a benchmark I ran.

---

## 3. Not covered / open questions

1. **gVisor's absolute overhead numbers.** Its performance guide presents results as figures I
   could not extract as text, so I have no primary-source MiB or microseconds for Sentry memory
   or syscall cost. The "10-30% slower on I/O-heavy workloads" figure in this file is a single
   vendor's estimate (Northflank, 2026-04-28) and is labelled unverified. If the spec needs a
   gVisor-vs-microVM number, run it on the actual host.

2. **No benchmark of my own.** Every performance figure here is a vendor or project claim. I did
   not boot a microVM, measure a boot time, or run a CI workload. The density arithmetic in 1.17
   is derived from those claims and is labelled an estimate.

3. **Cloudflare's host-side details beyond the post-mortem.** The post-mortem names dm-thin,
   `skip_block_zeroing`, a 64 KiB thin-block size, and `/dev/vdc`. It does not say which host
   kernel, which host filesystem, whether they run the jailer, whether they enable the virtio
   PCI transport, or what their guest kernel is. Those are the details that would tell the
   operator whether he is copying the same configuration or a safer one.

4. **Whether Cloudflare runs Firecracker upstream or a fork.** Nothing I read says. Firecracker's
   advisories explicitly warn to ensure "any forked or derivative code is patched", which implies
   forks exist. If the operator ever considers trusting Cloudflare's sandbox instead of his own,
   this is a question for Cloudflare, not answerable from outside.

5. **Firecracker on non-AWS hardware and non-6.18 kernels.** The tested platform list is AWS
   bare-metal instance types. A Hetzner AX or an OVH Advance box is not on it. Whether
   Firecracker is stable on the operator's specific host kernel is untested by me and only
   partially tested by upstream.

6. **GPU CI on microVMs.** Neither Firecracker, Cloud Hypervisor, Dragonball nor StratoVirt
   offers GPU support per Kata's own table. The path is QEMU with Kata's `kata-qemu-nvidia-gpu-*`
   runtimes, and I did not investigate whether that works for a CI job or what it costs.

7. **Cloud Hypervisor's exact license expression.** GitHub's license API returns null; the repo
   ships both Apache-2.0.txt and BSD-3-Clause.txt in a LICENSES directory. I did not find a
   single canonical license expression. If the operator forks or vendors it, this needs a real
   answer.

8. **The 1,433 and 677 NVD keyword counts are keyword counts.** They include records where the
   word appears incidentally. The ordering against Firecracker's 6, Cloud Hypervisor's 10,
   Kata's 17 and gVisor's 11 is the signal; the absolute values are not a bug count.

9. **Live migration and multi-host scheduling.** Cloud Hypervisor documents "Live migration" in
   its user docs; Firecracker does not. I grepped all 49 `docs/*.md` files in the Firecracker repo
   for the phrase "live migration" (2026-10-29) and it appears in exactly two, neither of which
   documents a migration capability. `docs/ballooning.md` says "Free page hinting was primarily
   designed for live migration" and warns the device is developer-preview because of a race that
   "can lead to a scenario where the device frees memory that has been reclaimed in the guest,
   potentially corrupting memory". `docs/snapshotting/snapshot-support.md` mentions it only as
   the reason VMClock carries a `disruption_marker` field. This is an argument from the absence
   of documentation, not a proof that migration is impossible. If the operator's data plane is
   more than one machine, cross-job placement and host-failure handling is unsolved by the
   runtime and belongs to the orchestrator (B3).

10. **Whether E2B Runtime Embed is viable for a real CI workload rather than an agent sandbox.**
    Its README and architecture are agent-shaped (envd, templates, pause/resume). CI needs
    artifact caching, Docker layer caching, long builds and per-job quotas, none of which I
    verified it handles. Read `docs/ARCHITECTURE.md` and run the Embed compose stack before
    committing to it.
