# Platform, NIC and cloud specifics

Vendor guidance that changes what "correct" means on a given box. Everything here is a starting
point to be measured, never a setting to apply blind; the vendor documents named at the end of
each section are the sources and carry the exact BIOS menu paths and version floors.

## Intel Xeon platforms (DPDK Linux GSG, Intel white paper)

- Hardware: every memory channel populated (at least one DIMM, 4 GB+), PCIe Gen3 x8 or better
  per 2 x 10GbE (Gen4 x16 for 100G), NIC firmware current, ports of one application on the same
  socket. `lspci -s <bdf> -vv | grep LnkSta` confirms speed and width.
- BIOS starting point from the GSG: CPU power and performance policy "Performance", Turbo
  considered, VT-d on (needed for VFIO), virtualisation options off when testing a physical
  function. The white paper's repeatable-results set: NUMA enabled, Enhanced SpeedStep and C3/C6
  disabled (unless DPDK power management is the point, which needs them enabled), MLC
  streamer/spatial and DCU prefetchers enabled, memory RAS/performance set to "NUMA Optimized".
- Kernel command line: `default_hugepagesz=1G hugepagesz=1G hugepages=8 isolcpus=<list>
  iommu=pt intel_iommu=on`. Core 0 stays with Linux and the control plane (do not put it in
  the lcore list for forwarding).
- `usertools/cpu_layout.py` prints socket, physical core and hyperthread siblings; core
  numbering is not sequential across sockets, so "cores 0-7" is rarely one socket.
- `-n <channels>` matches the memory configuration (for example 4 on an 8-channel socket is
  wrong; use the real channel count).
- The white paper's NIC-era numbers (82599: "1 queue per port is best", "Tx = 4 x Rx
  descriptors") are 2016 vintage; keep its method, re-measure its numbers on current NICs.

### Intel ice (E810) and i40e/iavf

- The ice PMD needs the DDP package (`ice.pkg`, or a device-specific `ice-<serial>.pkg`) from
  `/lib/firmware/updates/intel/ice/ddp` or `/lib/firmware/intel/ice/ddp`; `safe-mode-support`
  starts without it with most features disabled.
- Vector path selection: AVX2 when the CPU supports it, AVX-512 only with
  `--force-max-simd-bitwidth=512`; any offload the driver marks unsupported for the vector path
  silently selects the scalar path. 26.03 removed the SSE paths from i40e, iavf and ice.
- Devargs worth knowing: `rx_low_latency=1` (writes RX descriptors immediately, ~2 us less
  latency, more PCIe traffic), `proto_xtr` (per-queue protocol extraction into a dynamic
  field), `mbuf_check` (TX diagnostics for mbuf, size, segment and offload errors).
- Per-queue drop counters come from xstats; `rx_missed_errors` is the hardware-side miss.

## AMD EPYC (DPDK Linux GSG "AMD platform" page, AMD tuning guides 58017 / 58468)

- EPYC exposes several CCDs per socket, each CCX with its own L3. "NUMA nodes per socket"
  (NPS1/NPS2/NPS4) and "L3 cache as NUMA domain" in the BIOS decide how that shows up as NUMA
  nodes; a 1-socket box can look like four. Pick lcores that share the L3 with each other and
  the NUMA node with the NIC; `lscpu -e` and `numactl --hardware` show the mapping.
- Memory: one DIMM per channel minimum (8/16/32 GB ECC); PCIe slot bandwidth checked with
  `lspci -vv`.
- Kernel: `pcie_aspm=off` for low-latency NIC modes; Turin with Solarflare x4/x2 NICs needs
  Linux 6.13 and `vfio-pci.disable_idle_d3=1`.
- Power: `rte_power` core scaling is supported from DPDK 23.11 with `amd_pstate` in `passive`
  mode (kernel 6.4+); `rte_power_uncore` from 25.03 needs HSMP enabled.
- The AMD tuning guides (58017 for 9004 "Genoa", 58468 for 9005 "Turin", 58310 for 8004,
  and the 7003 "Milan" guide) hold the BIOS table, compiler flags and validated l3fwd numbers;
  DPDK's own page defers to them.

## Arm Neoverse (Arm "DPDK Tuning Guide" 109701, Neoverse V2 scalability analysis)

- Health check first: `dmidecode`, `lscpu`, `lshw`, `lspci` for BIOS version, frequency,
  DIMM population and link speed.
- NUMA: `cat /sys/bus/pci/devices/<bdf>/numa_node`, `numastat -m`, `lstopo`. Automatic NUMA
  balancing (`/proc/sys/kernel/numa_balancing`) is normally disabled for manual placement, but
  Arm notes some two-node Neoverse N2 platforms run l3fwd faster with it on: measure.
- BIOS: write allocation to the system-level cache (cache stashing, enabled through the PCI
  bridge on Ampere Altra via `setpci`), ACPI + CPPC both on only if DPDK power management is
  used (otherwise `cpufreq.off=1 cpuidle.off=1`), PCIe relaxed ordering (`mlxconfig -d <bdf>
  set PCI_WR_ORDERING=1`, or vendor API), Ampere-specific: LPI off, ANC mode monolithic, SLC
  replacement policy, L1/L2 prefetch on, "SLC as L3$" off.
- Kernel: `hugepagesz=1G hugepages=32` evenly spread across nodes (check
  `/sys/devices/system/node/node*/hugepages/hugepages-1048576kB/nr_hugepages`),
  `isolcpus=2,4,6 nohz_full=2,4,6 irqaffinity=0,1,3,5,7`, `iommu.passthrough=1`.
- NIC (ConnectX-5 example): OFED/rdma-core, latest firmware, pause frames off
  (`ethtool -A <if> rx off tx off`), MaxReadReq 4096 (`setpci -s <bdf> 68.w=5fff`), CQE
  compression and relaxed ordering on via `mlxconfig`.
- Build: newest GCC (GCC 12 beat GCC 11 on l3fwd), `-Dplatform=native|generic|<SoC>`, WFE
  option in `config/arm/meson.build`; `RTE_ARM_EAL_RDTSC_USE_PMU` for a cycle-accurate
  `rte_rdtsc()` (then `perf` cannot be used alongside).
- Tuned l3fwd parameters: `RX_DESC_DEFAULT` / `TX_DESC_DEFAULT` 1024 and burst 256 was best on
  N1 + ConnectX-5; 4096 descriptors and burst 64 in the 100G multi-core scenario.
- Scaling lesson (Ampere Altra, 2 x 100G ConnectX-5): 1 core 27.4 Mpps, 8 cores 111 Mpps, 16
  cores 136 Mpps against a 296 Mpps line rate, with 97% empty polls and 63% `rx_phy_discard`
  at 8 cores: the hardware RX path was the limit. Fixes: more RX queues per core (+14-25%
  beyond 4 cores), a second NIC on its own PCIe link (+18-62%), MPRQ (costs a copy; pays off
  above ~8 cores).
- Neoverse V2 analysis: descriptors needed are `rate x per-burst latency / cores`; the measured
  doorbell write is 37-38 ns; past ~8 queues x 1024 descriptors system-cache evictions grow
  and throughput drops, so depth is found empirically; bulk mempool returns
  (`rte_mempool_put_bulk`) beat per-packet `rte_pktmbuf_free` (82 -> 132 Mpps in their RX-only
  test).
- Atomics: Arm is weakly ordered; a missing acquire/release pair is a reordering bug, not a
  style issue (datapath-code.md).

## NVIDIA ConnectX (mlx5 PMD guide)

- Bifurcated driver: never unbind from the kernel; needs rdma-core (MLNX_OFED or MLNX_EN);
  firmware features behind `mlxconfig` (`CQE_COMPRESSION=1`, `UCTX_EN=1` for DevX features,
  `PCI_WR_ORDERING=1`). `rte_flow_isolate()` before `rte_eth_dev_configure()` keeps unmatched
  traffic on the kernel path; `RTE_FLOW_ACTION_TYPE_SEND_TO_KERNEL` for specific flows.
- Tuning (guide section "Rx/Tx tuning"): CPUs local to the adapter's NUMA node
  (`lstopo-no-graphics --merge`), adapters on the same node when the root complex allows, pause
  frames off, IO non-posted prefetch off in the BIOS, PCI max read request checked (`setpci
  68.w`), `--numa-mem`, per-lcore mempool caches, no runtime allocation.
- Devargs (`-a <bdf>,key=value`): `rxq_cqe_comp_en` (on), `mprq_en` (off; multi-packet RX /
  striding RQ, saves PCIe bandwidth for small packets at the cost of a copy; not in
  multi-process; incompatible with fast mbuf free), `rxqs_min_mprq` (12), `rx_vec_en` (on),
  `txq_inline_max` (290), `txqs_min_inline` (8, 16 on BlueField), `txq_mpw_en` (on).
  `tx_vec_en`, `txqs_max_vec`, `txq_mpw_hdr_dseg_en` are deprecated no-ops.
- Limits: multi-segment packets must not exceed `tx_desc_lim.nb_seg_max` (2-58); LRO needs
  `dv_flow_en` 1 or 2; a VF's maximum receive size follows the PF's MTU.
- Counters: `imissed` counts drops because a queue was full; `rx_discards_phy` (xstat) counts
  packets lost to bus or NIC congestion; `rx_out_of_buffer` is "no software buffer posted".
  `rte_eth_xstats_get()` includes kernel-handled traffic on a bifurcated port.
- Virtualisation: hypervisor kernel 3.16+, `iommu=pt`, 1 GB hugepages, VM backed by hugepages,
  vCPUs pinned.

## Microsoft Azure (Set up DPDK in a Linux VM; netvsc PMD guide)

- Requirements: Accelerated Networking on the VM, at least two NICs (one for management, never
  accelerated for DPDK), the RDMA drivers loaded (`mlx4_ib`, `mlx5_ib` or `mana_ib` by SKU),
  `modprobe -a ib_uverbs` on each reboot, DPDK 22.11 LTS or newer.
- Hugepages per node: `echo 1024 | sudo tee
  /sys/devices/system/node/node*/hugepages/hugepages-2048kB/nr_hugepages`. For boot-time
  settings, Microsoft's page says to edit files under `/etc/config/grub.d`; on Ubuntu images the
  drop-in directory is `/etc/default/grub.d/`, where a cloud-image file overrides
  `/etc/default/grub`. Confirm with `/proc/cmdline` after the reboot.
- The VF and the netvsc interface share a MAC; only netvsc has the IP. `ethtool -i <vf>` gives
  the VF's PCI address; a DPDK app that grabs the management NIC's VF kills the SSH session
  (serial console to recover).
- Run on the **netvsc master PMD**. The VF path carries the traffic; the synthetic path
  carries the rest and keeps the app alive while the host revokes the VF for servicing. The
  failsafe PMD (`net_failsafe`) is the older alternative and not recommended from 22.11 on.
  netvsc devargs: `latency` (host TX mailbox scan, default 50 us), `rx_copybreak` (256),
  `tx_copybreak` (512), `rx_extmbuf_enable`, `numa_aware`. Queue count is host-limited (64);
  full multi-queue needs kernel 4.17+.
- Bind the synthetic device with `driverctl -b vmbus set-override <uuid> uio_hv_generic`
  (kernel 4.18+) or the sysfs sequence in the netvsc guide; `dpdk-devbind.py` handles PCI
  only.
- MANA SKUs: the "MANA and DPDK on Linux" page; one bus address per interface no longer holds,
  specific DPDK and rdma-core versions, Linux only.
- VF revocation during host maintenance is handled inside the netvsc PMD (traffic moves to
  the synthetic path and back without the app noticing). An app that runs directly on the VF
  PMD instead gets `RTE_ETH_EVENT_INTR_RMV`, loses the VF, and "mysteriously slows down weeks
  later" when its traffic is on the synthetic path it never opened.
- Baseline with `dpdk-testpmd ... --forward-mode=macswap`, not `io`: the host SDN enforces MAC
  anti-spoofing and may drop frames whose source MAC is not the VM's, which makes an `io`
  baseline read as a platform ceiling that is not there. The 12.5 Gbps-class SKU bandwidth
  cap is the other ceiling to rule out first: at 4 Mpps it is reached at ~370-byte frames.
- Hyper-V guests expose no steal clock: `%steal` is always 0, so measure polling gaps inside
  the loop (tuning-methodology.md, "Any VM").

## virtio / vhost and other VMs

- Guest `virtio` PMD: multiqueue on, mergeable RX buffers off for maximum pps (on for jumbo),
  packed ring when host and guest support it; the host vswitch (OVS-DPDK, vhost-user) is often
  the real limit, so measure on both sides.
- Any VM: `rte_eth_dev_socket_id()` usually returns -1; `numa_node` is -1; pin vCPUs on the
  host, and watch `%steal` in `mpstat`.
- AWS: the `ena` PMD guide (LLQ mode, queue limits per instance type); Rx hardware timestamps
  arrived in 25.11.

Sources: DPDK Linux GSG (Intel and AMD platform pages, Linux Drivers), DPDK NIC guides (ice,
mlx5, netvsc, virtio, ena), Intel "DPDK Performance Optimization Guidelines", Arm "DPDK Tuning
Guide" (109701_1.0, 2024) and "DPDK scalability analysis on Neoverse V2" (2025), AMD EPYC DPDK
tuning guides (58017, 58468), Microsoft Learn "Set up DPDK in a Linux virtual machine"
(updated 2025) and "MANA and DPDK on Linux".
