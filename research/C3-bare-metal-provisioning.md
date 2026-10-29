# C3 - Bare Metal Provisioning for an Unreachable Machine

Research subagent: C3-bare-metal-provisioning
Date of research: 2026-10-29 (all sources read on this date, UTC)
Gateway used: pkgforge search/read/research pinned to `tinyfish`, plus `gh api` for GitHub metadata.
No fallback to built-in web_search/web_fetch was needed. Every call below was made and its output read.

Scope: how to provision, reinstall, power-cycle and monitor a machine you cannot physically reach, and
what a Cloudflare-Workers-hosted control plane can and cannot do about a machine that is off.

---

## 1. Findings

Each finding is: claim, evidence URL, and a label. `[verified]` means I read the page and it says what
the claim says. `[unverified]` means I could not confirm it from a primary source.

### 1.1 The power plane is a separate plane, and the tunnel is not it

**F1. A powered-off machine has no path from the control plane.**
Claim: when the host is off, its cloudflared process is not running, so the tunnel reports Down, and
anything the Worker tries to reach through that tunnel's public hostname fails.
Evidence: Cloudflare's own tunnel status table lists `Down` as "The tunnel was previously connected but
is currently disconnected because the `cloudflared` process has stopped", with recommended action
"Check for server-side issues, such as the machine being powered off".
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/
[verified]

**F2. The tunnel is outbound-only, so it cannot be the wake mechanism.**
Claim: cloudflared dials out; it never listens for inbound. A machine that is off dials nothing.
Evidence: "cloudflared connects outbound to Cloudflare on port `7844`. Your firewall must allow egress
... Block all ingress traffic for a positive security model." Also "cloudflared establishes four
outbound-only, post-quantum encrypted connections to at least two distinct Cloudflare data centers".
https://developers.cloudflare.com/tunnel/configuration/
[verified]

**F3. There is no inbound path at all unless something on your side is already awake.**
Claim: the design therefore needs a second, always-on component on the same L2/L3 as the machines.
This is not a Cloudflare limitation, it is a consequence of F1 and F2. The always-on component must be
a different physical device (a Pi, a NUC that never sleeps, a switch, or the provider's out-of-band
API), because the machine you are trying to wake is by definition not running anything.
Evidence: derived from F1 and F2; the only corroborating primary fact is that Hetzner's own power
operations are exposed through Robot, an API outside the server (F6, F7).
[verified as a derivation]

### 1.2 Hetzner Robot: the one out-of-band power API I could read end to end

**F4. Hetzner exposes power operations over HTTPS Basic Auth at a fixed base URL.**
Claim: `https://robot-ws.your-server.de`, HTTP Basic Auth, JSON, HTTPS only, POST params as
`application/x-www-form-urlencoded`.
Evidence: Robot Webservice preface. "Authentication is done via HTTP Basic Auth. The webservice is
accessible only via HTTPS." URL given as `https://robot-ws.your-server.de`.
https://robot.hetzner.com/doc/webservice/en.html
[verified]

**F5. Rate limits on the Robot API are hard, and some are very tight.**
Claim: `GET /server` is 200 requests/hour; `POST /reset/{server-number}` is 50 requests/hour;
`POST /wol/{server-number}` is 10 requests per hour; `POST /boot/{server-number}/rescue` and
`POST /boot/{server-number}/linux` are 500 requests per hour. Exceeding the limit returns HTTP 403 with
code `RATE_LIMIT_EXCEEDED`. Three failed logins blocks the source IP for 10 minutes.
Evidence: the request-limit lines and the authentication-error note in the Robot Webservice doc.
https://robot.hetzner.com/doc/webservice/en.html
[verified]

**F6. Wake-on-LAN is a first-class Robot operation, not something you invent.**
Claim: `POST /wol/{server-number}` sends a WoL packet to the server; response body echoes
`server_ip`, `server_ipv6_net`, `server_number`. Limit is 10 requests per 1 hour.
Evidence: `curl -u "user:password" https://robot-ws.your-server.de/wol/321 -d ''` with response
`{"wol":{"server_ip":...,"server_number":321}}` and "Send Wake On LAN packet to server / Request limit
10 requests per 1 hour".
https://robot.hetzner.com/doc/webservice/en.html
[verified]

**F7. Hard power cycle is a Robot operation with a type parameter.**
Claim: `POST /reset/{server-number}` with `type=hw` performs a hardware reset (power cycle). The
available reset types on Hetzner are `sw` (software reset, CTRL+ALT+DEL), `hw` (hardware reset, power
cycle) and `man` (manual reset, technician intervention). `GET /reset/{server-number}` returns which
options are available for that server.
Evidence: Robot Webservice `POST /reset/{server-number}` with `-d type=hw`, 50 requests/hour limit;
and the reset-type enumeration in the community Perl client docs
(https://metacpan.org/pod/WWW::Hetzner::Robot::API::Reset).
https://robot.hetzner.com/doc/webservice/en.html
[verified]

**F8. Reinstall-from-scratch is an API call, and it is destructive.**
Claim: `POST /boot/{server-number}/rescue` activates the PXE Rescue System for one boot and returns a
generated root `password` plus optional `authorized_key[]` fingerprints. `POST /boot/{server-number}/linux`
with `dist=<name>&lang=<lang>` schedules a Linux installation. Both are 500 requests/hour.
Evidence: Robot Webservice, both endpoints, including the response schema showing `"password":
"jEt0dtUvomlyOwRr"` and `"authorized_key":[]`.
https://robot.hetzner.com/doc/webservice/en.html
[verified]

**F9. The Hetzner Rescue System is one-shot and expires.**
Claim: the Rescue System boots via PXE into RAM and does not touch the drives. Activation only
schedules the *next* boot; it does not switch the running system. It is valid for exactly one boot, and
if you do not reboot within 60 minutes of activation the scheduled boot becomes inactive.
Evidence: "The activation of the Rescue System is only valid for one boot... If you do not reboot your
server within 60 minutes after the activation, the scheduled boot of the Rescue System will
automatically become inactive." Also "The activation in Robot only schedules the next boot to use the
Rescue System via network boot (PXE); it does not switch the currently running system."
https://docs.hetzner.com/robot/dedicated-server/troubleshooting/hetzner-rescue-system/
[verified]

**F10. The Hetzner KVM console is a human-mediated, scarce, time-boxed resource.**
Claim: Hetzner technicians attach a remote KVM to your server on request. It is free for 3 hours,
longer usage costs money. Two hardware models are in use (Lantronix Spider, Raritan Dominion) and the
model is not guaranteed. Because the number of KVMs per datacentre is limited, Hetzner recommends
ordering in advance. ISO mounting only works over SAMBA/CIFS, has no progress bar, and is explicitly
not guaranteed to work.
Evidence: all of the above is stated verbatim on the KVM Console page, including "A KVM Console is free
for 3 hours", "we are not able to guarantee a certain model", "we recommend that you order the KVM
Console in advance", "The KVM Console only supports the mounting of ISO files via the SAMBA (SMB)/CIFS
networking protocol", "We cannot guarantee that mounting an ISO file and installing it will always work".
https://docs.hetzner.com/robot/dedicated-server/maintenance/kvm-console/
[verified]

**F11. Hetzner also runs a vKVM rescue system that boots your installed OS inside a VM.**
Claim: the vKVM rescue system lets you start the OS installed on the server's hard drive inside a
virtual machine, for cases where the installed system will not boot.
Evidence: Hetzner vKVM documentation page exists and describes this.
https://docs.hetzner.com/robot/dedicated-server/virtualization/vkvm/
[verified, page title and description read via search result snippet; I did not fetch the full page body]

### 1.3 Redfish, IPMI and the BMC

**F12. Redfish power control is an HTTP POST action, and vendor support varies.**
Claim: Redfish `ComputerSystem.Reset` is `POST /redfish/v1/Systems/{id}/Actions/ComputerSystem.Reset`
with a JSON body `{"ResetType": "..."}`. HPE iLO 7 documents exactly two reset types:
`GracefulRestart` and `GracefulShutdown`, and states that because iLO does not differentiate these at
the OS level, HPE recommends using OS commands to complete the operations.
Evidence: HPE iLO 7 ComputerSystem resource definitions page.
https://servermanagementportal.ext.hpe.com/docs/redfishservices/ilos/ilo7/ilo7_119/ilo7_computersystem_resourcedefns119
[verified]

**F13. Redfish can force a one-time boot device, which is how you netboot a machine you cannot reach.**
Claim: `Boot.BootSourceOverrideEnabled` accepts `Disabled`, `Once` (and `Null` for temporarily
unavailable), and `BootSourceOverrideTarget` must be specified before `BootSourceOverrideEnabled` can
be used. This is the primitive that lets a control plane say "next boot, PXE" without touching the
installed bootloader.
Evidence: the supported-values table on the HPE iLO ComputerSystem resource page.
https://servermanagementportal.ext.hpe.com/docs/redfishservices/ilos/ilo7/ilo7_119/ilo7_computersystem_resourcedefns119
[verified]

**F14. Redfish has a power-restore policy, which matters for a machine that loses power.**
Claim: `PowerRestorePolicy` (Redfish ComputerSystem, added in schema v1.6+) is "The desired power state
of a system when power is restored". There is also a delay-in-seconds property for power off during a
reset, where zero means no delay.
Evidence: Redfish Resource and Schema Guide (DSP2046, 2024.2) and Redfish Property Guide (DSP2053,
2024.1), both reached via DMTF search results.
https://redfish.dmtf.org/schemas/v1/DSP2053_2024.1.html and
https://www.dmtf.org/sites/default/files/standards/documents/DSP2046_2024.2.html
[verified, property names and descriptions read from the DMTF-hosted schema documents]

**F15. The CISA IPMI advisory lists exactly the failure modes a BMC introduces.**
Claim: CISA TA13-207A states that IPMI passwords are saved in cleartext, that knowledge of one IPMI
password gives you the password for all computers in the IPMI managed group, that root access on an
IPMI system grants complete control over hardware, software and firmware, that BMCs often run excess
and older network services that may be vulnerable, that IPMI access may grant remote console access
including access to the BIOS, that there are few if any monitoring tools to detect a compromised BMC,
and that certain types of traffic to and from the BMC are not encrypted. CISA's remediation is to
restrict IPMI to a management VLAN, use strong unique passwords, and enable encryption.
Evidence: CISA alert TA13-207A, last revised 2016-10-07, now in CISA's archive.
https://www.cisa.gov/news-events/alerts/2013/07/26/risks-using-intelligent-platform-management-interface-ipmi
[verified]

**F16. BMC firmware is a live, actively exploited vulnerability class, not a historical one.**
Claim: Supermicro's January 2025 advisory discloses three High-severity BMC firmware vulnerabilities:
CVE-2024-10237 ("vulnerability in the BMC firmware image authentication design. An attacker can modify
the firmware to bypass BMC inspection and bypass the signature verification process"), CVE-2024-10238
and CVE-2024-10239 (stack overflows in firmware image verification, caused by not checking
`fld->used_bytes` and `fat->fsd.max_fld`). Affected products span X11, X12, H12, B12, X13, H13, B13,
X14, H14, B14, G1, G2 motherboards and CMM6 modules.
Evidence: Supermicro security advisory page, January 2025.
https://www.supermicro.com/en/support/security_BMC_IPMI_Jan_2025
[verified]

**F17. A patched BMC bug was bypassed, and the bypass also defeats the BMC Root of Trust.**
Claim: Binally Research found a bypass of the vendor's fix for CVE-2024-10237, assigned CVE-2025-7937,
and a separate issue CVE-2025-6198 in other Supermicro products. The writeup states CVE-2025-6198 "can
be used not only to update the BMC system with a specially crafted image, but also to bypass the BMC
RoT (Root of Trust) security feature", and that the original class of bug "could allow potential
attackers to gain complete and persistent control of both the BMC system and the main server OS".
Evidence: Binarly blog post, "Broken Trust: Fixed Supermicro BMC Bug Gains a New Life in Two New
Vulnerabilities".
https://www.binarly.io/blog/broken-trust-fixed-supermicro-bmc-bug-gains-new-life
[verified]

**F18. iLO has current, unpatched-on-old-firmware CVEs too.**
Claim: CVE-2026-79820 is a remote user validation failure in HPE iLO 7 firmware; CVE-2026-63457 is a
denial-of-service in iLO 6 firmware affecting versions prior to v1.78. I read the NVD record for
CVE-2026-79820 and the SentinelOne vulnerability-database record for CVE-2026-63457.
Evidence: https://nvd.nist.gov/vuln/detail/CVE-2026-79820 and
https://www.sentinelone.com/vulnerability-database/cve-2026-63457/
[verified that the CVE records exist and describe what the claims say; I did not read HPE's own
bulletin for the fixed version numbers, so the specific fixed firmware version is unverified]

**F19. IPMI cipher-zero authentication is a real, long-known problem.**
Claim: Raritan's own writeup of BMC/IPMI dangers lists "Cipher 0 authentication allowing access with
any password" and "BMC-provided password hashes which can be broken".
Evidence: https://www.raritan.com/blog/detail/the-dangers-of-bmcs-and-ipmi-highlighted-by-security-researchers
[verified, vendor blog; I did not independently confirm cipher-zero on specific current hardware]

### 1.4 Netboot and PXE

**F20. netboot.xyz is iPXE, and PXE needs DHCP options plus TFTP.**
Claim: to make netboot.xyz available network-wide you point DHCP at a next-server (the TFTP host) and
a filename (`netboot.xyz.kpxe`, or `netboot.xyz-undionly.kpxe` which piggybacks on the NIC boot
firmware). Ports 53, 67/68 and 69 must be open. Troubleshooting explicitly says "Set DHCP Option 67 to
netboot.xyz.kpxe". The dnsmasq recipe is `dhcp-option=66,"0.0.0.0"`, `enable-tftp`,
`tftp-root=/var/lib/tftp`, `dhcp-boot=netboot.xyz.kpxe`.
Evidence: https://netboot.xyz/docs/booting/tftp/ and https://netboot.xyz/docs/troubleshooting/
[verified]

**F21. netboot.xyz self-hosting is a static-site generator, not a service.**
Claim: self-hosting uses an Ansible role (or a Docker build) that renders menus and compiles iPXE
bootloaders into a directory you drop onto any web server. Default output goes to `/var/www/html`.
`ansible-playbook -i inventory site.yml` after `git clone` of the repo. You can override the mirror
URLs in `user_overrides.yml`.
Evidence: https://netboot.xyz/docs/selfhosting/
[verified]

**F22. netboot.xyz is actively maintained; matchbox is not.**
Claim: `netbootxyz/netboot.xyz` has 12,574 stars, Apache-2.0, last pushed 2026-10-29, latest release
3.0.3 published 2026-08-29. `poseidon/matchbox` has 1,427 stars, Apache-2.0, is not archived, but its
latest release is v0.11.0 published 2024-03-24, roughly two and a half years before the research date.
Evidence: `gh api repos/netbootxyz/netboot.xyz`, `gh api repos/netbootxyz/netboot.xyz/releases`,
`gh api repos/poseidon/matchbox`, `gh api repos/poseidon/matchbox/releases`.
[verified, read from the GitHub API on 2026-10-29]

**F23. matchbox is the gRPC-fronted PXE matcher, and it is a single point of trust in the boot path.**
Claim: matchbox matches bare-metal machines to profiles by labels such as MAC or UUID during PXE, and
profiles specify a kernel/initrd, iPXE config and Ignition config. It exposes an authenticated gRPC
API for clients such as Terraform. It provisions Fedora CoreOS and Flatcar Linux.
Evidence: https://github.com/poseidon/matchbox (README read through the read gateway) plus the gh api
metadata in F22.
[verified]

**F24. You can drop TFTP entirely by chainloading iPXE over HTTP.**
Claim: iPXE supports HTTPS and can verify the server identity; UEFI HTTP Boot can chainload iPXE
straight from an HTTP server, "eliminating the need for a separate TFTP server in your boot chain".
Evidence: https://ipxe.org/appnote/uefihttp and https://ipxe.org/crypto
[verified]

**F25. Talos UKIs are EFI binaries and can be HTTP-booted directly.**
Claim: with systemd-boot, the Talos kernel, initramfs and cmdline are combined into a Unified Kernel
Image; "As UKIs are EFI binaries, they can also be booted directly from the EFI shell or firmware boot
menu, including HTTP boot."
Evidence: https://docs.siderolabs.com/talos/v1.14/platform-specific-installations/bare-metal-platforms/bootloader
[verified]

### 1.5 First-boot configuration systems

**F26. Ignition runs in the initramfs and is absent from the root filesystem.**
Claim: Ignition "is a utility created to manipulate disks during the initramfs", including
partitioning, formatting, writing files and systemd units, and configuring users. On first boot it
reads its configuration from a source of truth (remote URL, network metadata service, hypervisor
bridge) and applies it. It accepts Ignition JSON and Butane YAML, transpiling Butane at boot. Known
users: Fedora CoreOS, RHEL CoreOS, Flatcar, openSUSE MicroOS, SLE Micro.
Evidence: https://coreos.github.io/ignition/
[verified]

**F27. Ignition is not something you invoke; you supply a runtime config.**
Claim: "Odds are good that you don't want to invoke Ignition directly. In fact, it isn't even present
in the root filesystem."
Evidence: same page, F26.
[verified]

**F28. cloud-init NoCloud is the pragmatic choice for non-cloud metal.**
Claim: NoCloud can take configuration locally with no network access, or fetch it from a remote
server. Discovery config arrives either as a kernel command line string
(`ds=nocloud;s=https://10.42.42.42/configs/`) or as a `.cfg` file under `/etc/cloud/cloud.cfg.d/`.
Configuration sources include the local filesystem (`file:///path/`), a labelled vfat or iso9660
volume whose label must be `CIDATA`, a custom webserver over HTTP(S), and FTP or FTPS.
Evidence: https://docs.cloud-init.io/en/26.1/reference/datasources/nocloud.html
[verified]

**F29. cloud-init warns about GRUB semicolon quoting in the kernel command line.**
Claim: "If using kernel command line arguments with GRUB, note that an unescaped semicolon is
interpreted as the end of a statement." This bites exactly the `ds=nocloud;s=...` form used for
network-booted metal.
Evidence: same page, F28.
[verified]

**F30. cloud-init is on a fast, current release train.**
Claim: latest release 26.2 published 2026-07-29; 26.1 on 2026-02-28; 25.3 on 2025-09-26.
Evidence: `gh api repos/canonical/cloud-init/releases`.
[verified, read 2026-10-29]

### 1.6 Image-based versus package-based operating systems

**F31. Talos removes the entire class of "the machine drifted" problems by having no shell.**
Claim: "We have no shell. We have no SSH. We have none of the GNU utilities, not even a rollup tool
such as busybox." Talos "always runs from a SquashFS image, meaning that even if a directory is
mounted to be writable, the image itself is never modified". All images are signed and delivered as
single versioned files. SquashFS image size is under 80 MB. There is no systemd; PID 1 is `machined`.
There are no passwords; all networked communication is encrypted and key-authenticated; Talos
certificates are short-lived and auto-rotating. "There is only a cluster."
Evidence: https://docs.siderolabs.com/talos/v1.14/learn-more/philosophy
[verified]

**F32. Talos gives you a remote, authenticated, whole-node reset.**
Claim: `talosctl -n <IP> reset` cordons and drains the node, leaves etcd if required, then erases its
disks and powers the system down, and removes the node from discovery-service registration. You still
have to `kubectl delete node` separately.
Evidence: https://docs.siderolabs.com/talos/v1.14/deploy-and-manage-workloads/scaling-down
[verified]

**F33. Talos supports SecureBoot plus TPM-backed disk encryption on bare metal.**
Claim: Talos boots on UEFI in SecureBoot mode; combined with TPM-based disk encryption this gives a
verified boot chain where the disk only unlocks if SecureBoot remains enabled with the same key set
(default PCR 7 plus PCR 11 signed policy). PCR binding is configurable because PCR 7 changes whenever
the SecureBoot dbx denylist is updated by tools such as fwupd. The whole OS is inside the UKI and is
verified by UEFI firmware. Automatic key enrollment only happens under virtualization; on bare metal
you enroll manually or build an image with `secure-boot-enroll` set to `force`. SecureBoot is not
supported on x86 in BIOS mode. There is no upgrade path from a GRUB-based install to UKI/SecureBoot; a
fresh install is required.
Evidence: https://docs.siderolabs.com/talos/v1.14/platform-specific-installations/bare-metal-platforms/secureboot
[verified]

**F34. Talos is on a current release train.**
Claim: v1.14.5 published 2026-10-26, v1.13.12 on 2026-10-21, v1.15.0-alpha.2 on 2026-10-27. 11,429
stars, MPL-2.0, 302 open issues, last pushed 2026-10-29.
Evidence: `gh api repos/siderolabs/talos` and `.../releases`.
[verified, read 2026-10-29]

**F35. Kairos is the "classic distro underneath, immutable on top" option.**
Claim: Kairos upgrades are atomic: "you don't modify the running system; instead, you build a new
image and upgrade to it. This avoids drift and ensures you can always get back to the previously
running system if needed." The command is `kairos-agent upgrade --source oci:ttl.sh/my-hadron:0.2.0`
followed by a reboot, and the same command works for downgrades. If a newly upgraded image fails to
boot, Kairos configures the bootloader to boot the passive (previous) system automatically.
Evidence: https://kairos.io/quickstart/lifecycle-management/
[verified]

**F36. Kairos bare-metal install is a USB ISO, with an AHCI-not-RAID caveat.**
Claim: "When deploying on a bare metal server, directly flash the image into a USB stick", with `dd`
or balenaEtcher, and the warning "If you're booting in UEFI mode, make sure that your storage device
where you're planning to install Kairos, is configured as ACHI and not RAID."
Evidence: https://kairos.io/docs/installation/bare-metal/
[verified, note the page carries a "development docs, no guarantee of accuracy" banner and points at
v4.4.0 as the latest stable]

**F37. Kairos has an out-of-band pairing mechanism that works with no network at all.**
Claim: Kairos displays a QR code after booting the ISO. The QR is a base64-encoded EdgeVPN token
(one-time-password, DHT, room, rendezvous and mdns fields). You run `kairosctl register --reboot
--device /dev/sda --config cloud-config.yaml` from a workstation; during pairing the configuration is
sent over and the node continues the installation. The CLI is available only for Linux and Windows.
Evidence: https://kairos.io/docs/installation/qrcode/
[verified]

**F38. Kairos is current.**
Claim: v4.4.0 published 2026-10-26; 1,858 stars; Apache-2.0; 583 open issues; last pushed 2026-10-29.
Evidence: `gh api repos/kairos-io/kairos` and `.../releases`.
[verified, read 2026-10-29]

**F39. Ignition is current.**
Claim: v2.28.0 published 2026-10-15; v2.27.0 on 2026-09-01; v2.26.0 on 2026-02-23. 983 stars.
Evidence: `gh api repos/coreos/ignition/releases`.
[verified, read 2026-10-29]

### 1.7 What a Workers-hosted control plane can and cannot do

**F40. The Workers limits that actually constrain a control plane.**
Claim: Workers Free gives 10 ms CPU per request, 128 MB memory, 50 subrequests per request, 100
Workers, 5 Cron Triggers per account. Workers Paid gives 5 min CPU (default 30 s), 10,000 subrequests
per request, 500 Workers, 250 Cron Triggers per account. Cron Triggers have a 15-minute wall time.
Simultaneous outgoing connections per request is 6 on both plans.
Evidence: https://developers.cloudflare.com/workers/platform/limits/
[verified]

**F41. A Worker can open outbound TCP but has no UDP API, so it cannot send a Wake-on-LAN packet.**
Claim: the Workers runtime provides `connect()` from `cloudflare:sockets` for outbound TCP only, with
`secureTransport` of off/on/starttls. A magic packet is normally a UDP datagram to port 0, 7 or 9, or
a raw Ethernet frame with EtherType 0x0842; it is not TCP. An open workerd discussion requesting
outbound UDP client support confirms it is not available.
Evidence: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/ ,
https://en.wikipedia.org/wiki/Wake-on-LAN (magic packet format and ports),
https://github.com/cloudflare/workerd/discussions/4463 (open request for outbound UDP).
[verified for the TCP-only API and the magic packet format; the conclusion "a Worker cannot wake a
machine" is a derivation from these two, and it is the load-bearing derivation of this whole section]

**F42. Cron Triggers are a blunt instrument for a watchdog.**
Claim: Cron Triggers map a cron expression to a `scheduled()` handler and "execute on UTC time", and
"Workers scheduled by Cron Triggers will run on underutilized machines". The finest granularity you
can express is once per minute; there is no per-machine placement and no execution guarantee beyond
the schedule.
Evidence: https://developers.cloudflare.com/workers/configuration/cron-triggers/
[verified]

**F43. Tunnel topology: 4 connections, 2 datacentres, up to 25 replicas.**
Claim: each cloudflared establishes four outbound connections to at least two distinct Cloudflare data
centres; a replica adds four more; you can run up to 25 replicas (100 connections) per tunnel; traffic
routes to the geographically closest replica. Egress must be allowed to `region1.v2.argotunnel.com` and
`region2.v2.argotunnel.com` (and `us-region1`/`us-region2` for `--region us`) on port 7844 TCP/UDP.
Evidence: https://developers.cloudflare.com/tunnel/configuration/
[verified]

**F44. The tunnel token is a bearer credential and rotation needs redundancy.**
Claim: "A remotely-managed tunnel only requires the tunnel token to run. Anyone with access to the
token will be able to run the tunnel." Cloudflare recommends rotating the token at a regular cadence,
and rotation can be done with minimal disruption "as long as the tunnel is served by at least two
cloudflared replicas". The token is retrievable via
`GET /accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token` with any of three connector-write
permissions.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/remote-tunnel-permissions/
[verified]

**F45. cloudflared itself is current and widely deployed.**
Claim: 16,337 stars, Apache-2.0, 572 open issues, last pushed 2026-10-29, latest release 2026.10.5
published 2026-10-27.
Evidence: `gh api repos/cloudflare/cloudflared` and `.../releases`.
[verified, read 2026-10-29]

**F46. A leaked cloudflared is not automatically a full-account compromise.**
Claim: the only cloudflared-specific NVD entry I could surface was a local privilege escalation on
Windows for versions prior to 2020.8.1. The adjacent CVE I found while searching,
CVE-2025-0651, is a Cloudflare WARP (not cloudflared) Windows symlink-deletion issue fixed before
2024.12.492.0, and I checked it specifically so as not to misattribute it.
Evidence: NVD CPE-filtered search result for `cpe:2.3:a:cloudflare:cloudflared:2019.11.2` and
https://nvd.nist.gov/vuln/detail/cve-2025-0651 .
[verified that these two records describe what is stated; I did not enumerate every cloudflared CVE,
so treat "no other cloudflared CVE" as unverified]

**F47. Cloudflare Containers are ephemeral and DO-gated, which constrains what the control plane can host.**
Claim: "All disk is ephemeral by default. When a Container instance goes to sleep, the next time it
starts, it uses a fresh disk from the container image." A Container can only be accessed through its
Durable Object. End users cannot make non-HTTP TCP or UDP requests to a Container instance.
Evidence: https://developers.cloudflare.com/containers/concepts/architecture/ and
https://developers.cloudflare.com/containers/faq/
[verified]

**F48. Monitoring an off machine is impossible from the control plane alone.**
Claim: the only health signal the control plane gets is tunnel status, whose "Down" state explicitly
covers "the machine being powered off" (F1). Anything richer (temperatures, fans, disk SMART, PSU)
has to come from the BMC or from an always-on prober. Talos's own guidance is to use Prometheus and
Grafana, audit logs, network flows and cluster events, and to store etcd snapshots off-cluster.
Evidence: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/
and https://docs.siderolabs.com/talos/v1.14/security/talos-security-checklist
[verified]

### 1.8 Hardware reality check

**F49. Consumer and mini-PC boards do not ship a BMC.**
Claim: the boards an operator is most likely to buy for cheap self-hosted compute have no
out-of-band controller, so there is no Redfish endpoint and no remote power-on. Forum sources say
Intel vPro machines are the exception that does have IPMI-class management.
Evidence: https://forums.servethehome.com/index.php?threads/mini-pc-with-ipmi.43005/ and the general
BMC explainer at https://things-embedded.com/us/faq/what-is-a-baseboard-management-controller/
[unverified as a general hardware claim; the general principle that a BMC is what lets you manage a
server "even when it is off" is well supported, but I did not verify the absence of a BMC on any
specific board model]

**F50. Hetzner's out-of-band is a technician plus a shared KVM, not a per-customer BMC.**
Claim: Hetzner attaches a Lantronix Spider or Raritan Dominion KVM on request, does not guarantee the
model, limits quantity per datacentre, charges beyond 3 free hours, and mounts ISOs only over SMB/CIFS.
Evidence: F10, https://docs.hetzner.com/robot/dedicated-server/maintenance/kvm-console/
[verified]

---

## 2. What this changes for the spec

These are ordered by how much money and sleep they save.

**R1. Split the spec into three planes and say so explicitly: the control plane (Workers), the data
plane (your machines), and the power plane (something that is awake when the data plane is not).**
The current framing implies the tunnel is the data plane's only link and therefore also its recovery
path. It is not. F1 and F2 together mean a powered-off machine is unreachable by construction, and no
amount of Cloudflare configuration changes that. The power plane must be a separate, always-on,
small, cheap device with a route to the machines' management network.

**R2. Buy the power plane, do not build it.**
For Hetzner dedicated boxes, the power plane is the Robot API: `POST /reset/{server-number}` with
`type=hw` for a hard power cycle, `POST /wol/{server-number}` for a wake, `GET /reset/{server-number}`
to discover what is actually available for that server (F5, F6, F7). Store the Robot webservice user
credentials in the Workers secret store, never in the bundle. Do not build a WoL sender in the Worker:
F41 says a Worker has TCP only, and a magic packet is UDP.

**R3. Treat the WOL rate limit as a design constraint, not a footnote.**
10 Wake-on-LAN calls per hour per account (F6) and 50 resets per hour (F7) means the watchdog cannot
be a naive "retry every 30 seconds" loop. Use WoL as a first attempt and `type=hw` reset as the
second, with backoff, and log every call. If you have more than a handful of machines you will hit
these limits, and the failure mode is a 403 `RATE_LIMIT_EXCEEDED`, which looks like a network fault
unless you handle it.

**R4. Do not put the BMC or the management VLAN behind the same tunnel as the workload.**
F15 lists cleartext IPMI passwords, one-password-gives-you-the-fleet, remote console access to the
BIOS, excess vulnerable network services on the BMC, and near-zero ability to detect a compromised
BMC. F16, F17 and F18 show the vulnerability class is current and that vendor fixes get bypassed
(F17 specifically bypasses the BMC Root of Trust). The BMC must be on its own segment, reachable only
from the power plane, with Redfish over HTTPS, a unique strong password per machine, and the BMC
firmware version pinned and tracked. If you compromise on one thing here, the whole "management plane
reached only through tunnels" story collapses, because the BMC is a management plane that predates and
outranks the OS.

**R5. Prefer Hetzner Robot over BMC for Hetzner-hosted machines, and prefer BMC only for machines you own.**
Robot gives you reset, WOL, rescue activation and OS install over HTTPS with a documented rate limit
(F4 to F8). It also gives you the KVM as a last resort (F10), which is the thing that saves you when
the OS is gone. A BMC you own gives you Redfish (F12, F13, F14) but you are responsible for its
firmware, its network placement and its monitoring, and F17 says a compromised BMC gives persistent
control of both the BMC and the host OS.

**R6. Make the boot path network-first, not USB-first.**
F20 and F21 say PXE needs DHCP option 66 and 67 plus TFTP, and that self-hosting netboot.xyz is just
an Ansible role that emits static files. F24 says you can drop TFTP by chainloading iPXE over HTTP or
UEFI HTTP Boot. F25 says Talos UKIs are EFI binaries and can be HTTP-booted directly. For a small
number of machines the cheapest robust design is: run a tiny always-on box that serves DHCP options
and iPXE over HTTP, and have the control plane drive it through a tunnel. The USB-ISO path (F36) is
fine for one machine and does not scale, and it requires somebody to physically touch the box, which
is the thing the whole design is trying to avoid.

**R7. Do not use matchbox for new work.**
F22 and F23: matchbox has had no release since v0.11.0 on 2024-03-24, roughly two and a half years
before this research. It is not archived, but a PXE service that is the single point of trust in your
boot chain and has not shipped in that long is a risk you do not need to take. If you want the
matchbox model (label machines by MAC or UUID, serve Ignition configs), build it with netboot.xyz's
iPXE menu plus a small config service, or use Talos, which has the same effect with a maintained
codebase (F34).

**R8. Pick the OS by how much you trust the operator of the machine, not by taste.**
If the machine is yours and unattended, use an image-based OS. Talos (F31, F32, F33) removes shell,
SSH, packages and drift entirely, gives you a signed under-80-MB image, SecureBoot plus TPM disk
encryption, and a single remote `talosctl reset` that erases disks and powers the node down. That last
one is the answer to "reinstall a machine I cannot reach": you do not reinstall, you reset and let it
rejoin. Kairos (F35, F37) is the right choice if you need a recognisable distro underneath or need to
pair a machine with no network at all via the QR/EdgeVPN flow. cloud-init NoCloud (F28) is the right
choice only for machines where you accept package-based drift.

**R9. Pin the first-boot config source in the image, not in the network.**
F28 shows NoCloud can take config from a `CIDATA`-labelled vfat/iso9660 volume, from the local
filesystem, or from a webserver via `ds=nocloud;s=https://...`. The webserver route is what lets a
Workers-hosted control plane hand out per-machine config, but it introduces a chicken-and-egg: the
machine needs network before it has identity, and the config server must be up. Prefer baking a
per-machine `CIDATA` image (or a per-machine netboot.xyz menu entry) so that the identity is local and
the network is only needed for the payload.

**R10. Budget for the fact that "reinstall" has a physical floor.**
F9 says the Hetzner rescue activation is one boot and expires after 60 minutes if you do not reboot.
F10 says the KVM is free for 3 hours, scarce per datacentre, must be requested in advance, and its ISO
mounting is not guaranteed to work. So the spec must include a runbook with an explicit "this is the
point at which a human flies or drives to the box" step, and the design must be arranged so that step
is never on the critical path for a routine failure. In practice that means: every machine must be
re-provisionable from the network alone, with the KVM reserved for genuine hardware and firmware
faults.

**R11. Rotate tunnel tokens on a schedule, and keep two replicas per tunnel so rotation is survivable.**
F44 is explicit that anyone with the token can run the tunnel, that rotation needs at least two
replicas to avoid disruption, and that Cloudflare recommends a regular cadence. If the control plane
Worker holds a tunnel token (which it must, to configure ingress), then a compromised Worker is a
compromised data-plane ingress. Scope that token as narrowly as the API allows and rotate it.

**R12. Do not plan on the control plane holding machine state.**
F40 gives Workers 128 MB memory per isolate, 5 min CPU, 10,000 subrequests and 250 Cron Triggers per
account. F47 says Cloudflare Containers are ephemeral by default and a sleeping container comes back
with a fresh disk. The control plane should hold a pointer (which machine, which tunnel, which
hostname) and nothing else. Machine state belongs on the machine or in an object store. This is C6's
territory but it falls directly out of the limits I measured.

**R13. Give every machine a second, independent heartbeat path.**
F1 and F48 mean the tunnel is the only signal the control plane has, and it goes silent exactly when
you need it most. Add a cheap second path: a cron on the always-on power-plane box that pings the BMC
and the machine, and reports to the control plane. That is the only way the control plane can
distinguish "the machine is off" from "the tunnel is broken", and those two need completely different
remediation (power on versus restart cloudflared).

**R14. Budget the Robot API rate limits into the alerting design.**
F5: 3 failed Robot logins blocks the source IP for 10 minutes, and every endpoint has its own hourly
quota. A watchdog that retries aggressively will lock itself out. Cap retries, back off, and alert on
403 `RATE_LIMIT_EXCEEDED` distinctly from other failures.

---

## 3. Not covered / open questions

Named precisely, with what would close each one.

**Q1. OVH (and any non-Hetzner provider) out-of-band API.** I read Hetzner's Robot API end to end
because its documentation is public and complete. I did not research OVH's equivalent, its IPMI
offering, its rescue mode, or its rate limits. Needed before the spec names a provider: the same
endpoint set (reset, WOL, rescue, install) with the same rate limits, for whichever provider is
actually chosen.

**Q2. Real BMC hardware behaviour.** Every Redfish finding here comes from HPE iLO 7 documentation
(F12, F13) and DMTF schema documents (F14). I did not test against a real BMC, and I do not know
which BMC the operator's machines have. The `ResetType` values a given BMC accepts vary (F12 shows
HPE documenting only two), and `GET /reset/...`-style discovery is not part of Redfish. Before
committing to a Redfish client, enumerate the supported reset types on the actual hardware.

**Q3. Whether the operator's chosen mini-PC or board has any out-of-band management at all.** F49 is
unverified. This is a purchase-time question, not a design question, and it decides whether the power
plane is a BMC, a provider API, or a separate always-on box with a relay or a PoE power switch.

**Q4. Netboot over a tunnel, concretely.** I verified that iPXE supports HTTPS (F24) and that Talos
UKIs are HTTP-bootable EFI binaries (F25), but I did not verify that a netboot.xyz or iPXE flow works
when the boot server is only reachable through a Cloudflare Tunnel, nor what the DNS and certificate
story looks like at that point in the boot. If the spec depends on network-first provisioning, this
needs a working prototype before it is written down as fact.

**Q5. Cloudflared CVE coverage.** F46 covers the one cloudflared CVE I could surface and explicitly
checks a nearby CVE that turned out to be WARP rather than cloudflared. I did not enumerate the full
cloudflared CVE history, so "no other cloudflared CVEs matter" is not a claim I am making.

**Q6. Power and thermal monitoring.** I found no primary source for how to read sensor data off an
unreachable machine through a Workers control plane, beyond "the BMC exposes it via Redfish". The
monitoring half of "power-cycle and monitor" is the thinnest part of this file and it is where the
operator will spend the most operational time.

**Q7. Talos Omni.** Talos documentation repeatedly refers to managing disk encryption and other
configuration "centrally through Omni", a hosted Sidero Labs control plane. I did not research it. If
the operator wants a hosted control plane for the orchestration layer, that is a direct alternative to
the Workers-hosted one and it should be evaluated against it rather than ignored.

**Q8. Actual measured cold-provision time.** No finding here states how long it takes to go from
power-on to a joined node. Talos's own docs claim "Rebuilds of Talos are remarkably fast" (F31) but
give no number. The spec's provisioning-time assumptions are unmeasured.

**Q9. The C6 overlap.** Several things here (Workers cannot hold state, the control plane cannot reach
an off machine, the tunnel as single path) are also C6's subject. I have stated them as findings with
sources and left the failure-mode analysis and the "what would I drop" verdict to C6.

---

## Source index

All read on 2026-10-29 (UTC) via the pkgforge gateway pinned to tinyfish, or via `gh api`.

- https://developers.cloudflare.com/tunnel/configuration/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/remote-tunnel-permissions/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/containers/concepts/architecture/
- https://developers.cloudflare.com/containers/faq/
- https://robot.hetzner.com/doc/webservice/en.html
- https://docs.hetzner.com/robot/dedicated-server/troubleshooting/hetzner-rescue-system/
- https://docs.hetzner.com/robot/dedicated-server/maintenance/kvm-console/
- https://docs.hetzner.com/robot/dedicated-server/virtualization/vkvm/
- https://metacpan.org/pod/WWW::Hetzner::Robot::API::Reset
- https://www.cisa.gov/news-events/alerts/2013/07/26/risks-using-intelligent-platform-management-interface-ipmi
- https://www.supermicro.com/en/support/security_BMC_IPMI_Jan_2025
- https://www.binarly.io/blog/broken-trust-fixed-supermicro-bmc-bug-gains-new-life
- https://nvd.nist.gov/vuln/detail/CVE-2026-79820
- https://nvd.nist.gov/vuln/detail/cve-2025-0651
- https://www.sentinelone.com/vulnerability-database/cve-2026-63457/
- https://www.raritan.com/blog/detail/the-dangers-of-bmcs-and-ipmi-highlighted-by-security-researchers
- https://servermanagementportal.ext.hpe.com/docs/redfishservices/ilos/ilo7/ilo7_119/ilo7_computersystem_resourcedefns119
- https://redfish.dmtf.org/schemas/v1/DSP2053_2024.1.html
- https://www.dmtf.org/sites/default/files/standards/documents/DSP2046_2024.2.html
- https://www.dmtf.org/standards/redfish
- https://en.wikipedia.org/wiki/Wake-on-LAN
- https://netboot.xyz/docs/
- https://netboot.xyz/docs/booting/tftp/
- https://netboot.xyz/docs/selfhosting/
- https://netboot.xyz/docs/troubleshooting/
- https://github.com/poseidon/matchbox
- https://ipxe.org/appnote/uefihttp
- https://ipxe.org/crypto
- https://coreos.github.io/ignition/
- https://docs.cloud-init.io/en/26.1/reference/datasources/nocloud.html
- https://docs.siderolabs.com/talos/v1.14/learn-more/philosophy
- https://docs.siderolabs.com/talos/v1.14/security/talos-security-checklist
- https://docs.siderolabs.com/talos/v1.14/deploy-and-manage-workloads/scaling-down
- https://docs.siderolabs.com/talos/v1.14/platform-specific-installations/bare-metal-platforms/secureboot
- https://docs.siderolabs.com/talos/v1.14/platform-specific-installations/bare-metal-platforms/bootloader
- https://kairos.io/docs/installation/bare-metal/
- https://kairos.io/docs/installation/qrcode/
- https://kairos.io/quickstart/lifecycle-management/
- https://github.com/cloudflare/workerd/discussions/4463
- https://forums.servethehome.com/index.php?threads/mini-pc-with-ipmi.43005/ [unverified]

GitHub metadata via `gh api`, read 2026-10-29:
- netbootxyz/netboot.xyz: 12574 stars, Apache-2.0, release 3.0.3 (2026-08-29), pushed 2026-10-29
- poseidon/matchbox: 1427 stars, Apache-2.0, release v0.11.0 (2024-03-24), pushed 2026-10-28
- siderolabs/talos: 11429 stars, MPL-2.0, release v1.14.5 (2026-10-26), pushed 2026-10-29
- kairos-io/kairos: 1858 stars, Apache-2.0, release v4.4.0 (2026-10-26), pushed 2026-10-29
- coreos/ignition: 983 stars, release v2.28.0 (2026-10-15), pushed 2026-10-28
- canonical/cloud-init: 3847 stars, release 26.2 (2026-07-29), pushed 2026-10-23
- cloudflare/cloudflared: 16337 stars, Apache-2.0, release 2026.10.5 (2026-10-27), pushed 2026-10-29
