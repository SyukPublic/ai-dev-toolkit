# Performance tuning and debugging methodology

When the user says "slow", "drops", or quotes an Mpps number below expectations, do not guess.
Walk the ladder in order: each rung either clears a layer or finds the bottleneck. Ask for (or
collect) the evidence named at each rung, and tie every recommendation to the counter that will
confirm it. This is the loop Intel's white paper prescribes (profile, fix the current hotspot,
re-profile, repeat) with DPDK's own instruments at each step. Skipping rungs is how teams
spend a week on hugepages while the NIC sits on the other socket.

## 0. Define the target and the workload

Packet size distribution, target rate, per-packet work (pure forwarding? lookups? crypto?),
latency bound. 64 B at 100G (148.8 Mpps) is a different sport from IMIX at 25G. Run
`dpdk_budget.py budget --link 100G --pkt 64 --ghz 3.0 --cores N` and state the cycles per
packet per core; a single core doing non-trivial work tops out at 10-30 Mpps, so a target above
that is a scaling question, not a micro-tuning one. Classify the workload as Intel's method
does, memory-bound, I/O-bound or CPU-bound, because the instruments differ: memory-bound wants
prefetch and locality, I/O-bound wants queue and descriptor work, CPU-bound wants the
instruction mix.

## 1. Health-check the platform before touching software

The Arm and Intel guides both start here, because a mis-populated server never reaches the
published numbers:

- `dmidecode -t memory | grep -E "Locator|Speed"`: every channel populated, DIMMs at the rated
  speed. One DIMM per channel minimum.
- `lscpu`: sockets, cores per socket, hyperthreads, current and max frequency; `lstopo` for
  the cache and PCIe topology.
- `lspci -s <bdf> -vv | grep LnkSta`: PCIe generation and width. Gen2 is not enough for two
  10GbE ports; a 100G NIC wants Gen4 x16 (or Gen3 x16 at best). A x8 link on a x16 card is a
  finding.
- NIC firmware and DDP/profile packages current; link speed negotiated as expected.
- BIOS: NUMA enabled (interleaving off), CPU power policy "performance", C-states policy
  decided on purpose, hardware prefetchers on, VT-d/AMD-Vi on for VFIO, turbo policy stated.
  Vendor specifics are in platforms-and-nics.md.
- `sh dpdk_env_probe.sh` captures the Linux side (hugepages per node, NIC node and driver,
  kernel command line, governor, IOMMU) in one read-only pass.

## 2. Baseline with testpmd or l3fwd

Pure RX->TX with zero application logic on the same cores and queues:

```
dpdk-testpmd -l 2,4,6,8 -n 4 -a <bdf> -- --forward-mode=io --nb-cores=3 --rxq=3 --txq=3 \
    --rxd=1024 --txd=1024 --burst=32 --mbcache=256 --stats-period 1
dpdk-l3fwd -l 1,2 -n 4 -- -p 0x3 --config="(0,0,1),(1,0,2)" --rule_ipv4=rules_v4.cfg \
    --rule_ipv6=rules_v6.cfg --rx-burst 32 --tx-burst 32 --parse-ptype
```

(`-l` lists lcores: the first is the main lcore and does not forward in testpmd; `-n` is the
number of memory channels.) Compare against the NIC vendor's published l3fwd/testpmd numbers
for that platform. The decision tree:

- testpmd underperforms too: the problem is the platform or the NIC path (rungs 1, 3, 4).
- testpmd reaches line rate and the app does not: the problem is the app (rungs 5, 6).
- `--forward-mode=rxonly` / `txonly` split the directions when only one of them is slow.

This single experiment halves the search space; always do it first.

## 3. Find WHERE packets are lost

| Counter | Source | Meaning |
| --- | --- | --- |
| `imissed` | `rte_eth_stats_get()` | "Rx packets dropped by the HW because there are no available buffer (i.e. Rx queues are full)": the app refills or polls too slowly, or a core was preempted |
| `rx_nombuf` | `rte_eth_stats_get()` | "Rx mbuf allocation failures": the pool is empty (undersized, or leaking) |
| `ierrors` / `oerrors` | `rte_eth_stats_get()` | malformed packets, MTU, FCS / failed transmits |
| `rx_qN_packets`, `rx_qN_errors`, `tx_qN_packets` | `rte_eth_xstats_get()` (testpmd `show port xstats all`) | per-queue load: one hot queue means one elephant flow or a bad RSS key; since 25.11 the `q_*` fields of `rte_eth_stats` are gone, xstats is the only per-queue source |
| `rx_discards_phy` / `rx_phy_discard_packets`, `rx_out_of_buffer`, `rx_missed_errors` | NIC-side xstats (mlx5, Intel) | the NIC itself dropped: PCIe/NIC path saturated (`discards_phy`) or no software buffer posted (`out_of_buffer`) |
| `rx_pause` / `tx_pause` xstats | NIC | flow-control ping-pong caps throughput mysteriously; usually disable with `ethtool -A <if> rx off tx off` |
| generator / switch counters | outside the host | distinguish "never arrived" from "dropped by the host" |

Cache xstats ids at startup (`rte_eth_xstats_get_names_by_id()`, `rte_eth_xstats_get_by_id()`)
so the reporting thread does no string comparison; ids are driver-specific.

Reading the shape: drops only above a sharp rate knee point at a fixed per-packet cost
ceiling; drops at every rate point at a functional or configuration bug. Arm's scaling test is
the textbook example of reading the counters right: at 8 cores the PMD saw 97% empty polls
while `rx_phy_discard_packets` was 63% of traffic, so the bottleneck was the hardware RX path
(PCIe and NIC), not the CPU, and the fixes were more RX queues per core (+14-25%), a second
NIC on its own PCIe link (+18-62%), and MPRQ, not code changes.

## 4. System layer (where most "mysterious" slowness lives)

In rough order of impact:

- **Core isolation.** Dataplane lcores on `isolcpus=<list> nohz_full=<list> rcu_nocbs=<list>`
  plus `irqaffinity=<housekeeping cores>` on the kernel command line (Arm's example:
  `isolcpus=2,4,6 nohz_full=2,4,6 irqaffinity=0,1,3,5,7`). Check `/proc/cmdline` and
  `/sys/devices/system/cpu/isolated`. A 1 ms preemption at 10 Mpps is 10 000 packets; with
  4096 descriptors that is a burst of `imissed`. Control threads still need a free CPU.
- **IRQ affinity.** All IRQs off the dataplane cores; `irqbalance` off or banned from them.
- **Frequency and sleep states.** `performance` governor, C-states limited on purpose
  (`processor.max_cstate=1 intel_idle.max_cstate=0`, or `cpupower idle-set`), turbo policy
  known (turbo disparity makes per-core numbers noisy), AVX-512 frequency licence in mind.
  On AMD `rte_power` needs `amd_pstate` in `passive` mode (DPDK 23.11+). A PMD core at less
  than 100% in `top` is itself a finding: the loop blocks somewhere, or the thread floats.
- **NUMA.** NIC socket vs lcores vs hugepages vs pools (memory-numa.md). The #1 silent halver
  on 2-socket machines; NPS/L3-as-NUMA modes on AMD make a 1-socket box behave like several.
- **SMT.** The hyperthread sibling of a dataplane core is idle or also dataplane (same working
  set), never a random housekeeping thread.
- **Hugepages.** Present, on the right node, 1 GB for large tables (watch dTLB misses).
- **IOMMU.** `iommu=pt` (passthrough) keeps VFIO protection for assignment without paying the
  translation cost on every DMA.
- **PCIe.** Max read request (`setpci -s <bdf> 68.w`; vendors differ, Arm's guide sets 4096
  for ConnectX-5, NVIDIA's suggests 1K on some systems: measure), relaxed ordering
  (`mlxconfig -d <bdf> set PCI_WR_ORDERING=1`), `pcie_aspm=off` for low-latency NIC modes
  (AMD's guide), IO non-posted prefetch off in the BIOS, write-allocate to the system-level
  cache on Arm (cache stashing).
- **Kernel.** 5.4 or newer is the floor; VFIO cdev mode with VF tokens needs 6.17; AMD Turin
  with Solarflare NICs needs 6.13.

## 5. Application layer

- **Queue/core topology.** #RX queues == #dataplane lcores per port, 1:1, and RSS spreading
  verified per queue with xstats. More queues per core only when rung 3 showed the NIC RX path
  as the limit; fewer leaves cores idle.
- **Descriptor ring sizes.** Depth is a bandwidth-delay product (Arm's model):
  `descriptors = rate x service_gap / cores`, where the gap is the longest time the core
  spends away from the queue (a burst's processing, a preemption). `dpdk_budget.py
  descriptors` computes it both ways (depth for a gap, tolerated gap for a depth). 1024-4096 RX
  is the usual range; the sample apps default to 1024/1024. Deeper is not free: Arm measured
  that past roughly 8 queues x 1024 descriptors the system-level cache started evicting
  packets before they were processed and throughput fell. TX 512-1024.
  `rte_eth_dev_adjust_nb_rx_tx_desc()` clamps to the device limits.
- **Thresholds.** `rx_free_thresh` batches descriptor returns (one tail-pointer MMIO per
  batch, ~40 ns each); `tx_free_thresh` and `tx_rs_thresh` (defaults 32, with
  `tx_rs_thresh <= tx_free_thresh < ring - 3`) batch completion write-backs and mbuf frees.
  Take the PMD's `default_rxportconf` / `default_txportconf` as the starting point.
- **Burst, cache, pool.** Burst 32-64 (Arm measured l3fwd on Neoverse N1 + ConnectX-5 peaking
  at 256; l3fwd accepts `--rx-burst/--tx-burst`); mempool cache 256-512; pool sized by the
  formula in memory-numa.md (`dpdk_budget.py mempool`).
- **The loop.** Run `dpdk_static_scan.py` and walk the anti-pattern table in SKILL.md
  (locks, allocations, copies, false sharing, printf, division). A per-packet copy alone
  explains "1.5 Mpps where 15 were expected".
- **Scaling test.** Measure 1, 2, 4, 8 cores. Linear scaling means a per-core cost problem
  (rung 6). Sub-linear means shared state (locks, false sharing, a shared pool with cache 0,
  one hot queue) or the hardware RX path (rung 3).
- **Latency mode.** If p99 matters more than Mpps: burst of 1-8 (testpmd's note: "set the
  burst to 1, accepting lower throughput"), low-latency devargs where the PMD has them (ice
  `rx_low_latency`), and interrupt-free busy polling on an isolated core.

## 6. Microarchitecture layer

- `perf top -C <dataplane cores>`: the hot function tells the story. High share in the PMD's
  rx/tx routines is good (the app is cheap); then look at IPC and at rung 3. High share in
  `memcpy`, `malloc`, a lock or a hash function is an anti-pattern found.
- `perf stat -C <core> -e cycles,instructions,cache-misses,LLC-load-misses,dTLB-load-misses`:
  IPC below 1 on a forwarding core means stalls. High LLC misses: working set, locality,
  prefetch or NUMA. High dTLB misses: the hot tables are not on hugepages after all.
- `perf c2c` finds false sharing; Intel VTune (build DPDK with
  `-Dc_args=-DRTE_ETHDEV_PROFILE_WITH_VTUNE`), Intel PCM and AMD uProf read the PMU; the
  Intel method then classifies front-end vs back-end stalls (top-down analysis).
- In-process counters: `rte_pmu_read()` (Linux; `perf_event_paranoid=2` plus `CAP_PERFMON`;
  EAL lcores only, one event group), and `rte_rdtsc()` histograms around pipeline stages,
  cheap and precise. On Arm `rte_rdtsc()` reads `cntvct_el0`, which runs below the CPU clock
  (scale it), or build with `RTE_ARM_EAL_RDTSC_USE_PMU` for the PMU cycle counter (not
  compatible with `perf`).
- `objdump -d` the loop: calls, divisions and locked instructions are visible without any
  profiler.

## 7. Virtualised and cloud paths

- **Azure.** Accelerated Networking SKU; the NIC is a Mellanox (or MANA) VF behind a synthetic
  netvsc device. Run on the **netvsc master PMD**, not the VF alone: "If the application runs
  directly over the VF PMD, it doesn't receive all packets", and the master PMD keeps the app
  running "even if the VF is revoked when the host is being serviced" (failsafe PMD is not
  recommended from 22.11 on). Find the VF's PCI address with `ethtool -i <vf-if>`, never take
  the management NIC's VF, `modprobe ib_uverbs`, reserve hugepages per node, and handle
  `RTE_ETH_EVENT_INTR_RMV`. Queues are limited by the host (64). MANA SKUs have their own
  setup page and rdma-core requirements.
- **Any VM.** Guest-side pinning only pins to vCPUs. On KVM and Xen `mpstat -P ALL 1` shows
  host preemption as `%steal`; Hyper-V and Azure guests expose no steal clock, so there
  `%steal` reads 0 whatever the host does, and the measurement that works everywhere is an
  in-loop `rte_rdtsc()` gap histogram (the longest time between two polls) plus an
  empty-poll counter. A 1 ms gap at 4 Mpps is 4000 packets.
- **virtio / vhost.** Mergeable buffers off for maximum pps, multiqueue on, and remember the
  host-side vswitch (OVS-DPDK) is often the real bottleneck: measure both sides.
- **AWS.** The `ena` PMD guide; expect VF-class ceilings, not bare metal.
- Do not promise bare-metal numbers in a VM: 10-30 Mpps per core bare metal versus
  single-digit Mpps per core on virtio is normal.

## Reporting results

For every finding name the layer (platform, system, app, microarchitecture), the evidence (the
counter, profile or baseline that proves it), the fix, and the expected gain as an order of
magnitude ("serialises all cores", "10x per-packet cost"). Prioritise by expected impact, put
"measure first" steps before configuration changes, and end with the before/after table the
user should fill in. "Try hugepages" without evidence is cargo cult; this skill's value is
tying every recommendation to a measurement.

Sources: Intel "DPDK Performance Optimization Guidelines"; DPDK Linux GSG "How to get best
performance with NICs on Intel platforms"; DPDK Programmer's Guide "Profile Your Application"
and "Ethernet Device Library"; `rte_ethdev.h` stats doc comments; Arm "DPDK Tuning Guide" and
"DPDK scalability analysis on Neoverse V2"; Microsoft "Set up DPDK in a Linux virtual machine".
