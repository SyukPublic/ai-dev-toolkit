---
name: dpdk-dataplane-engineering
description: "DPDK (Data Plane Development Kit) dataplane engineering in C/C++: write hot-path packet-processing code, review it for mbuf-ownership and performance bugs, size mempools/queues/descriptors, tune systems that miss their packets-per-second target evidence-first (counters before config changes), and answer DPDK questions (API semantics, EAL options, version porting, mempool/NUMA/hugepage setup). Use whenever the user works with DPDK APIs or tools (rte_*, mbuf, mempool, lcore, EAL, PMD, testpmd, l3fwd), mentions kernel bypass or poll-mode drivers, Mpps rates, hugepages or NUMA placement for a NIC, RX/TX queues, RSS, imissed/rx_nombuf drops, VFIO, mlx5, ice/E810 or netvsc, or asks to write, review, optimize or debug packet-forwarding, NFV, vSwitch, UPF or dataplane code, even without saying DPDK. NOT for eBPF/XDP programs, kernel network-stack tuning (sysctl, irqbalance on plain servers), pcap/Wireshark analysis, P4/switch ASICs, lock-free or io_uring code with no NIC, or OVS/VM networking without DPDK code."
---

# DPDK Dataplane Engineering

Operate as a senior dataplane engineer: skeptical of averages, obsessed with the per-packet
cycle budget, and exact about who owns every mbuf. DPDK code reads like ordinary C, but the
rules that make it correct and fast are invisible in the syntax. This skill makes them explicit
and makes you prove them.

## Core rule

Treat every DPDK task as a contract over three things, and write them down before changing code:

1. **Ownership** - who owns each packet buffer (mbuf) at every step, and which call transfers it.
2. **Topology** - which lcore polls which (port, queue), on which NUMA socket, from which mempool.
3. **Budget** - how many cycles one packet may cost on one core at the target rate, and where they go.

Plus the evidence that will prove the result: a counter, a profile, a benchmark. Never "it ran".

## First pass: classify the task, then read

| Task | Read first |
| --- | --- |
| Write or modify per-packet (hot-path) code | [references/datapath-code.md](${CLAUDE_SKILL_DIR}/references/datapath-code.md) |
| Mempool, mbuf, hugepages, NUMA, EAL memory, VFIO/IOVA | [references/memory-numa.md](${CLAUDE_SKILL_DIR}/references/memory-numa.md) |
| "Too slow", "drops", "only X Mpps", "does not scale": tune or debug | [references/tuning-methodology.md](${CLAUDE_SKILL_DIR}/references/tuning-methodology.md) |
| Review existing DPDK code | [references/review-checklist.md](${CLAUDE_SKILL_DIR}/references/review-checklist.md), then datapath-code.md |
| Vendor, NIC or cloud specifics (Intel ice/i40e, AMD EPYC, Arm, mlx5, Azure, virtio) | [references/platforms-and-nics.md](${CLAUDE_SKILL_DIR}/references/platforms-and-nics.md) |

A mixed task ("review and fix") takes the review checklist first, then datapath-code.md before
writing replacement code. A "which datapath should we use" question (DPDK vs AF_XDP vs the
kernel stack) is in scope: answer it from the cost model below, and say plainly when DPDK is
the wrong tool (connection-heavy workloads that need kernel TCP, no dedicated cores, no
ownership of hugepages and NIC binding).

### Facts to establish first

Ask only when the answer changes the work; otherwise state the assumption and proceed.

- **DPDK version.** API churn is real (see "Version notes"). Default: the current LTS.
- **NIC / PMD, link speed, packet size.** These set the budget (see "Numbers").
- **Machine shape.** Sockets, which socket the NIC sits on, isolated cores, hugepages per node.
- **Deployment.** Bare metal, VM with SR-IOV, cloud (Azure, AWS), container. Virtualised paths
  have their own ceilings and their own failure modes (VF revocation, steal time).
- **Target.** Mpps at a packet size, p99 latency, drop-free at rate X, CPU budget. "Fast" is
  not a target; without one, every tuning step is unfalsifiable.

## Bundled scripts

Deterministic helpers: run them instead of re-deriving by hand, and treat their output as
candidates to inspect, not verdicts.

- `python ${CLAUDE_SKILL_DIR}/scripts/dpdk_static_scan.py <path>`: heuristic scan of C/C++
  sources for hot-path anti-patterns, ownership hazards and deprecated APIs. Run it first in
  every review; then read the code around each hit.
- `python ${CLAUDE_SKILL_DIR}/scripts/dpdk_budget.py budget|mempool|descriptors ...`: cycles per
  packet at a given link speed and packet size, mempool demand from the port/queue/lcore shape,
  RX descriptor depth from the bandwidth-delay model. Quote its output in the answer.
- `sh ${CLAUDE_SKILL_DIR}/scripts/dpdk_env_probe.sh`: read-only Linux host probe (hugepages per
  node, NIC NUMA node and driver binding, kernel-cmdline isolation, IOMMU, governor, DPDK
  version). Nothing is modified.

## The hot-path contract

Why the rules exist: at 10 GbE line rate with 64-byte frames one core sees 14.88 Mpps, a
budget of about 67 ns (roughly 200 cycles at 3 GHz) per packet. At 100 GbE it is 6.7 ns. One
LLC miss costs 30-40 ns, one DRAM access 60-100 ns, a syscall hundreds of ns, a contended
cache line worse. A single careless line in the loop halves throughput. Hence, on the
per-packet path:

1. **No syscalls, no heap allocation, no printf/logging.** Counters are per-lcore; a control
   thread reads and prints them.
2. **Batch everything.** RX/TX bursts of 32-64, mempool get/put in bulk, ring enqueue/dequeue
   in bulk. Per-call overhead is amortised across the burst, and vector PMD paths only engage
   on bursts. Shrinking a burst is a latency decision; make it on purpose and measure it.
3. **Per-lcore everything.** Each worker owns its queues, counters, caches and state. Writable
   state shared between lcores is a design smell.
4. **No locks on the datapath.** Cross-core handoff goes through `rte_ring`; read-mostly tables
   use RCU (`rte_rcu_qsbr`) or an atomically swapped pointer, never a rwlock. A counter that
   must be shared needs only a relaxed atomic.
5. **Stay NUMA-local.** Mempools, rings and queues on the socket of the NIC and of the lcore
   that uses them. Cross-socket access adds 50-100% latency and saturates the interconnect
   before the NIC saturates.
6. **Keep the code predictable.** `likely`/`unlikely` on exception paths, no integer division
   or modulo by a variable (power-of-two masks), no floating point, prefetch the next packets'
   data while processing the current ones, cold paths out of line.
7. **Respect mbuf ownership.** `rte_eth_tx_burst()` takes ownership only of the packets it
   reports sent; the remainder is still yours: free it or retry it. After a successful TX or
   ring enqueue the mbuf is gone; touching it is a use-after-free with delayed symptoms.

## Anti-patterns to flag on sight

| Anti-pattern | Why it hurts | Fix |
| --- | --- | --- |
| `rte_eth_rx_burst(..., 1)` or a burst that is not a multiple of 8 | No amortisation; vector RX paths stay off | Burst 32-64 into an array |
| Per-packet `rte_pktmbuf_alloc` + `memcpy` "for safety" | Allocation plus a full copy per packet; RX already gave you exclusive ownership | Forward the RX mbuf itself; clone or copy only when the packet really goes two places |
| Lock or `fetch_add` on shared stats in the loop | Cache-line ping-pong serialises every core | Per-lcore counters, aggregated off the hot path |
| Adjacent per-core counters in one array | False sharing costs as much as a lock | One `__rte_cache_aligned` struct per lcore, plus `RTE_CACHE_GUARD` |
| Mempool `cache_size = 0` | Every alloc/free hits the shared ring with a CAS | Cache 256-512 (sizing rules in memory-numa.md) |
| Hardcoded `socket_id = 0`, or `SOCKET_ID_ANY` on a 2-socket box | Remote-socket mbufs and descriptors for every core on the other socket | `rte_eth_dev_socket_id(port)` / `rte_lcore_to_socket_id()`, one pool per socket |
| `rte_eth_tx_burst` return value ignored | Every unsent mbuf leaks, and `rx_nombuf` climbs under load only | Free or retry `pkts[sent..n-1]` |
| `%` or `/` by a variable in the loop | 20-90 cycles per integer division | Power-of-two sizes and `& (n - 1)` |
| printf / RTE_LOG per packet or "every N packets" | Syscall and formatting inside the budget | Counters plus a reporting thread |
| `while (!stop)` on a plain `int` | Compiler may hoist the load; also a data race | C11 atomic flag, relaxed load |
| `usleep` / `sched_yield` "to save CPU" in the poll loop | Latency spikes, cold caches, missed bursts | PMD power management (`rte_power_ethdev_pmgmt_queue_enable`) or interrupt mode |
| A poll-mode core showing less than ~100% CPU in `top` | A busy-polling lcore spins whatever the load; anything lower means the thread floats, something in the loop blocks, or the hypervisor preempts it | Treat it as a finding: pin the thread, remove the blocking call, measure poll gaps with `rte_rdtsc()` |
| Mempool sized by a magic number (`8192`) | Descriptors alone pin `ports x rxq x rxd + ports x txq x txd` mbufs; a pool that only covers them is empty before the first packet | `n >= descriptors + lcores x burst x stages + lcores x cache_size`, plus headroom |
| Two lcores polling one RX queue, or queue id derived from `rte_lcore_id()` | Queues are not thread-safe; lcore ids are not dense | Explicit (port, queue) per worker, assigned at init |
| More RX queues than polling lcores (two or more per core) | Each extra queue halves the burst the others fill and adds a fixed poll cost per iteration; descriptor and mbuf demand double | One RX queue per polling lcore; add lcores, not queues, unless NIC-side counters prove the RX path is the limit |
| Hardcoded offload mask | Silently drops the driver to the scalar path, or fails on another PMD | Intersect with `rte_eth_dev_info_get()` capabilities |
| Legacy API: `rte_atomicNN_*`, KNI, master/slave lcore names, `rte_eth_stats.q_ipackets`, `-c` coremask | Deprecated or removed; breaks on upgrade | C11 atomics, virtio-user/tap, main/worker, xstats, `-l`/`--lcores` |

## Verification gates

Name each gate before claiming a task is done. A gate you cannot name is a finding.

1. **Ownership gate.** Every mbuf from `rx_burst` ends in exactly one of: `tx_burst` (counted
   as sent), a successful ring enqueue, or `rte_pktmbuf_free`, on every path including errors.
   The unsent remainder of every burst is handled. Nothing is touched after handoff. Clones
   are never written through.
2. **Topology gate.** A (port, queue) -> lcore -> socket -> mempool table exists. One RX queue
   per polling lcore is the default; more queues per lcore only when NIC-side counters show
   the RX path, not the core, is the limit. No queue is polled by two lcores. RSS spreads the
   real flow mix (verified per queue, not assumed). NIC, lcores, hugepages and pools share a
   socket.
3. **Budget gate.** Cycles per packet at the target rate are stated. The loop passes the
   anti-pattern table. Burst, cache, pool and descriptor sizes come with the formula that
   produced them, not magic numbers: a pool covers every descriptor on every queue that uses
   it plus in-flight bursts and per-lcore caches (`8 queues x 512 descriptors` is already
   `4096` before a single packet is in flight), and descriptor depth is the packet rate times
   the longest service gap divided by the queues.
4. **Evidence gate.** Every "slow" diagnosis names the counter or profile that proves it
   (`imissed` vs `rx_nombuf` vs `ierrors` vs NIC-side discards; perf/PMU). Every
   recommendation names the measurement that will confirm it. A tuning plan puts measurement
   before any configuration change: read the counters, then run a testpmd (or l3fwd) baseline
   on the same cores and queues; if the baseline also misses the target the limit is the
   platform, otherwise it is the application. "Try hugepages" without evidence is cargo cult.
5. **Lifecycle gate.** `rte_eal_init` return checked and argc/argv shifted; descriptor counts
   adjusted to device limits; offloads intersected with capabilities; link waited for;
   signal -> atomic flag -> workers exit -> `rte_eth_dev_stop`/`close` -> `rte_eal_cleanup`;
   device removal and reset events handled wherever a VF can be revoked (cloud, SR-IOV).

Do not claim correctness from a passing run, and do not claim a speedup without a before/after
measurement on the same traffic.

## Numbers to reason with

- Line rate at 64 B (frame + 20 B preamble/IFG): 10G = 14.88 Mpps (67 ns/pkt), 25G = 37.2 Mpps,
  40G = 59.5 Mpps, 100G = 148.8 Mpps (6.7 ns), 200G = 297.6 Mpps, 400G = 595 Mpps.
- Memory: L1 ~1 ns, L2 ~3-5 ns, LLC ~10-20 ns, DRAM 60-100 ns, remote socket +50-100%. A cache
  line bouncing between cores costs on the order of 100 ns per bounce.
- An MMIO doorbell write is ~40 ns (measured on Arm Neoverse V2); at 148 Mpps that is 5-6
  packets of arrival time. Bursts and free thresholds exist to amortise it.
- A well-written forwarding core does 10-30+ Mpps bare metal at 64 B; vendor l3fwd numbers go
  far beyond with more cores and queues. 1-2 Mpps per core is almost always an anti-pattern or
  a misconfiguration, not "DPDK overhead". Virtio inside a VM: single-digit Mpps per core is
  normal.
- Descriptor depth is a bandwidth-delay product: descriptors ~= packet rate x worst-case
  service gap / cores. A 1 ms scheduler preemption at 10 Mpps is 10 000 packets, more than a
  4096-entry ring absorbs; that is what core isolation is for.

## Version notes (verified October 2026; re-check when the user pins a version)

- Releases: 25.11 is the current LTS (25.11.4), 26.07 the latest, 26.11 due November 2026.
- Build: meson + ninja only since 20.11; apps link with `pkg-config --cflags --libs libdpdk`.
  Makefile-era examples are obsolete.
- EAL: `-l`/`--lcores` and `-S` replace the deprecated `-c`/`-s` coremasks (deprecated 25.11).
  `--numa-mem` is the name of the per-socket preallocation option. `--remap-lcore-ids` (25.11)
  gives contiguous lcore ids.
- Lcore naming is main/worker since 20.11: `rte_get_main_lcore`, `RTE_LCORE_FOREACH_WORKER`.
- Removed: KNI (23.11; use virtio-user or tap), the queue-stats fields `q_ipackets`,
  `q_opackets`, `q_errors` of `struct rte_eth_stats` (25.11; read xstats `rx_qN_packets`
  instead), the `enable_kmods` build option (25.11; igb_uio lives in the separate dpdk-kmods
  repository).
- Deprecated: `rte_atomicNN_*` legacy atomics (use C11 `<stdatomic.h>` or DPDK's
  `rte_atomic_*_explicit` wrappers from `rte_stdatomic.h`), VXLAN-GPE flow items, the legacy
  flow director API (removal targeted for 26.11).
- Newer tools worth using: lcore variables `RTE_LCORE_VAR_*` for per-lcore state (24.11,
  experimental), `RTE_CACHE_GUARD` against prefetcher-induced false sharing, the mbuf history
  debug field (25.11), `rte_pmu_read()` for in-process PMU counters.
- Mempool cache semantics changed in 26.07: the effective cache size now equals the requested
  size (it used to be 1.5x), and lcores that only put or only get should double their cache.
  Up to 25.11 the API documented `cache_size <= n / 1.5` and advised `n % cache_size == 0`;
  26.07 requires only `cache_size <= n`. `RTE_MEMPOOL_CACHE_MAX_SIZE` is 512 in both.

## Output standard

Lead with the finding that explains the user's symptom (for new code: with the topology and
ownership model). Then state assumptions (version, NIC, machine), the code or plan, the
evidence behind each claim (counter, profile, formula), the commands to run, and the residual
risks (platform, driver, untested paths). Reviews group findings as **Bugs** (will misbehave),
**Performance** (cycles left on the table, with the order of magnitude) and **Hygiene**
(portability, deprecations), each with file:line, consequence and fix.

The bundled scripts are your instruments, not the user's: quote the numbers and formulas they
produce, and give the user commands that run on the target host (testpmd, `rte_eth_stats`,
`perf`, sysfs). A deliverable meant for other people does not mention the scripts by path.

## Canonical sources

- DPDK Programmer's Guide, "Writing Efficient Code":
  https://doc.dpdk.org/guides/prog_guide/writing_efficient_code.html
- DPDK Programmer's Guide: Profile Your Application; Mempool, Mbuf, Ring, RCU, EAL and Ethernet
  Device chapters: https://doc.dpdk.org/guides/prog_guide/
- DPDK Linux Getting Started Guide: System Requirements, Linux Drivers, "How to get best
  performance with NICs on Intel platforms", "How to get best performance on AMD platform".
- Intel, "DPDK Performance Optimization Guidelines" white paper: the profile -> classify
  (memory-, I/O- or CPU-bound) -> fix -> re-profile loop and the platform checklist.
- Arm, "DPDK Tuning Guide" (109701) and "DPDK scalability analysis on Neoverse V2" (the
  descriptor bandwidth-delay model).
- AMD, EPYC DPDK tuning guides (58017 for 9004, 58468 for 9005).
- Microsoft, "Set up DPDK in a Linux virtual machine" (Azure netvsc PMD); the DPDK netvsc, mlx5
  and ice PMD guides.
