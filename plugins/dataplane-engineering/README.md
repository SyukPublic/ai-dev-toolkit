# dataplane-engineering

DPDK (Data Plane Development Kit) dataplane C/C++ engineering for Claude Code: writing hot-path
packet-processing code, reviewing it for mbuf-ownership and performance bugs, sizing mempools,
queues and descriptors, and tuning systems that miss their packets-per-second target with an
evidence-first method (counters before configuration changes).

## What's inside

| Component | Type | Description |
| --------- | ---- | ----------- |
| `dpdk-dataplane-engineering` | skill | The method (ownership / topology / budget contract, task classifier, hot-path contract, anti-pattern table, five verification gates, version notes) in `SKILL.md`; the depth in five `references/` files read on demand; three read-only helper scripts. |

## Installation

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
/plugin install dataplane-engineering@ai-dev-toolkit
```

No dependencies on other plugins. It is a leaf: nothing in the marketplace depends on it, and
it preloads nothing from `engineering-paved-path`, which targets a different stack
(TypeScript).

## When it engages

Claude loads the skill when the task matches its description: DPDK APIs or tooling (`rte_*`,
mbuf, mempool, lcore, EAL, PMD, testpmd, l3fwd, dpdk-devbind), kernel bypass and poll-mode
drivers, packet rates in Mpps, hugepages or NUMA placement for a NIC, RX/TX queues and RSS,
`imissed` / `rx_nombuf` drops, or a request to write, review, optimise or debug
packet-forwarding, NFV, vSwitch, UPF or dataplane code, even when nobody says "DPDK".

It deliberately does **not** engage on eBPF/XDP program authoring, kernel network-stack
tuning for ordinary servers (sysctl, irqbalance, nginx), packet-capture analysis, P4 or switch
ASIC programming, lock-free or io_uring work with no NIC involved, or OVS/VM network
configuration that touches no DPDK code. Those are real near-misses and the description names
them, so a question about them gets ordinary help instead of DPDK-shaped advice.

Explicit invocation:

```
/dataplane-engineering:dpdk-dataplane-engineering
Review fwd_core.c: we get 1.5 Mpps per core on an E810 and expected 15.
```

## How the skill works

`SKILL.md` is always in context once the skill triggers and carries what a reviewer needs on
every task:

- the **core rule**: write down who owns each mbuf, which lcore polls which (port, queue) on
  which socket, and how many cycles a packet may cost, before touching code;
- a **task classifier** that routes to one reference file (write hot-path code; memory, NUMA
  and VFIO; tune or debug; review; platform specifics);
- the **hot-path contract** with the numbers behind it (67 ns per packet at 10G line rate,
  6.7 ns at 100G, what a cache miss or a syscall costs);
- an **anti-pattern table** (burst of 1, per-packet alloc + memcpy, locks on stats, false
  sharing, mempool cache 0, hardcoded socket 0, ignored `tx_burst` return, division in the
  loop, printf in the loop, non-atomic stop flag, sleeps, shared queues, hardcoded offloads,
  removed APIs);
- **five verification gates** (ownership, topology, budget, evidence, lifecycle) that a task
  must name before it is called done;
- **version notes** verified in October 2026 against the 25.11 LTS and the 26.07 release:
  removed KNI and queue-stats fields, deprecated coremask and legacy atomics, the 26.07 change
  to mempool cache semantics, lcore variables, `RTE_CACHE_GUARD`.

The `references/` files are read only when the task needs them:

| File | Covers |
| ---- | ------ |
| `datapath-code.md` | the canonical forwarding loop, mbuf ownership rules, prefetching, per-lcore state and false sharing, rings and their modes, RCU, the C11 memory model, codegen, offload contracts, multi-queue scaling, init order, shutdown and device events, power |
| `memory-numa.md` | hugepages, EAL memory modes, mempool sizing and the per-version cache constraints, mbuf anatomy, the NUMA checklist, `rte_malloc`, VFIO/IOVA and binding, multi-process |
| `tuning-methodology.md` | the seven-rung ladder: target, platform health check, testpmd/l3fwd baseline, loss localisation by counter, system layer, application layer, microarchitecture, cloud paths; and how to report |
| `review-checklist.md` | two-pass review (correctness, then performance), red flags, reporting format |
| `platforms-and-nics.md` | Intel Xeon and ice/i40e, AMD EPYC, Arm Neoverse, NVIDIA mlx5, Azure netvsc, virtio and other VMs |

## What the plugin executes

Nothing runs automatically: there are no hooks and no MCP servers. The skill ships three
helper scripts that Claude invokes through `${CLAUDE_SKILL_DIR}/scripts/` when a task calls
for them, and all three are read-only:

| Script | What it does | Runtime |
| ------ | ------------ | ------- |
| `dpdk_static_scan.py` | Scans C/C++ sources for hot-path anti-patterns, ownership hazards and deprecated or removed APIs; prints candidates with line numbers (`--self-test` runs built-in samples). | Python 3.10+, standard library only |
| `dpdk_budget.py` | Calculators: cycles per packet per core at a link speed and frame size, mempool demand from the port/queue/lcore shape with the cache-size rules of the DPDK version in use (or a check of an existing pool size against that demand), RX descriptor depth from the bandwidth-delay model. | Python 3.10+, standard library only |
| `dpdk_env_probe.sh` | Linux host probe: kernel command line and isolation, hugepages per NUMA node, governor, IOMMU and VFIO state, NICs with driver binding and NUMA node, installed DPDK and tools. Reads sysfs/procfs only. | POSIX `sh`; `lscpu`, `lspci`, `ethtool`, `pkg-config` used when present |

None of them modifies files, loads modules, binds devices or needs network access.

## Sources the content is built from

The method skeleton (classify, establish facts, apply domain references, verify through named
gates, report evidence and residual risk) is adapted from the `realtime-systems-coding` skill
in [oghie/skillsets](https://github.com/oghie/skillsets). The domain content comes from the
DPDK Programmer's Guide ("Writing Efficient Code", Mempool, Mbuf, Ring, RCU, EAL, Ethernet
Device, Profile Your Application), the DPDK Linux Getting Started Guide, the DPDK 25.11 / 26.03
/ 26.07 release and deprecation notes and the `rte_*.h` doc comments, Intel's "DPDK Performance
Optimization Guidelines" white paper, Arm's "DPDK Tuning Guide" and Neoverse V2 scalability
analysis, AMD's EPYC DPDK tuning guides, and Microsoft's Azure DPDK setup pages. The skill's
"Canonical sources" section links them.

## Versioning

SemVer per [RELEASES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/RELEASES.md);
release notes in [CHANGELOG.md](CHANGELOG.md). How this plugin fits the wider set:
[docs/DEPENDENCIES.md](https://github.com/SyukPublic/ai-dev-toolkit/blob/main/docs/DEPENDENCIES.md).
