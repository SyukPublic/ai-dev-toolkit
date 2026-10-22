# Changelog

## 1.0.0 - 2026-10-21

Initial release.

- `dpdk-dataplane-engineering` skill: DPDK dataplane C/C++ engineering for Claude Code. The
  always-loaded `SKILL.md` carries the method (an ownership / topology / budget contract, a
  task classifier, the hot-path contract with the numbers behind it, an anti-pattern table,
  five verification gates, and version notes verified against the 25.11 LTS and 26.07
  releases); five `references/` files carry the depth and are read on demand:
  `datapath-code.md` (the canonical loop, mbuf ownership, prefetch, per-lcore state, rings,
  RCU, atomics, offloads, init and shutdown order, device events), `memory-numa.md`
  (hugepages, EAL memory, mempool sizing including the 26.07 cache-semantics change, mbuf
  anatomy, NUMA discipline, VFIO/IOVA, multi-process), `tuning-methodology.md` (a seven-rung
  evidence-first ladder from target definition through testpmd baseline, loss localisation by
  counter, system, application and microarchitecture layers, to cloud paths),
  `review-checklist.md` (two-pass review with a reporting format) and `platforms-and-nics.md`
  (Intel, AMD EPYC, Arm Neoverse, NVIDIA mlx5, Azure netvsc, virtio).
- Three read-only helper scripts, invoked through `${CLAUDE_SKILL_DIR}/scripts/`:
  `dpdk_static_scan.py` (heuristic C/C++ scan for hot-path anti-patterns, ownership hazards and
  deprecated APIs; candidates, not verdicts), `dpdk_budget.py` (cycle budget per packet, mempool
  demand or a check of an existing pool against it, RX descriptor depth from the
  bandwidth-delay model) and `dpdk_env_probe.sh` (Linux
  host probe: hugepages per node, NIC NUMA node and driver, kernel-cmdline isolation, IOMMU,
  governor, DPDK version). Python scripts use the standard library only; the shell script is
  POSIX `sh`. Nothing runs automatically and nothing writes to the host.
- Method skeleton adapted from the `realtime-systems-coding` skill in oghie/skillsets (classify,
  gather facts, apply domain references, verify through named gates, report evidence and
  residual risk); domain content from the DPDK Programmer's Guide ("Writing Efficient Code",
  Mempool, Mbuf, Ring, RCU, EAL, Ethernet Device, Profile Your Application), the DPDK Linux GSG,
  Intel's "DPDK Performance Optimization Guidelines", Arm's "DPDK Tuning Guide" and Neoverse V2
  scalability analysis, AMD's EPYC DPDK tuning guides, Microsoft's Azure DPDK setup pages and
  the DPDK 25.11 / 26.03 / 26.07 release and deprecation notes.
