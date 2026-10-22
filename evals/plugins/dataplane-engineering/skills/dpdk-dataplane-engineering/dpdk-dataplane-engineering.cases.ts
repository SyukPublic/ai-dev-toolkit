import type { SkillCase } from "../../../../src/index.js";
import { fixtureReader } from "../../../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Content tier for dataplane-engineering:dpdk-dataplane-engineering. Only SKILL.md is injected
// (no tools), so every practice below is grounded in what SKILL.md itself states: the hot-path
// contract, the anti-pattern table, the verification gates, the numbers and the version notes.
// The references/ files (the canonical loop, the mempool formula, the tuning ladder) are NOT in
// context here; a practice that needs them would measure retrieval, which this tier cannot do.
//
// The review fixture plants fourteen defects in a 95-line forwarding worker, each one a row of
// the anti-pattern table, and one deliberately-correct pattern (the MAC swap in place through
// rte_pktmbuf_mtod) that the review must not invent a problem with. Prompts stay neutral so
// eval:benchmark measures honest lift.

const REVIEW_TASK = `The code is provided inline — treat it as already read and answer directly in your reply (do not ask for tool access or more files).

For each problem report the line(s), the consequence, and the concrete fix. Lead with the findings that explain the observed symptom.`;

const file = (path: string, fixture: string, lang = "c") =>
  `### ${path}\n\n\`\`\`${lang}\n${fx(fixture)}\n\`\`\``;

export const cases: SkillCase[] = [
  {
    name: "slow-forwarder review finds the copy, the burst of 1, the lock, the leak and the topology bug",
    kind: "quality",
    prompt: `We run a DPDK-based packet appliance on a 2-socket Xeon box with an Intel E810 100G NIC (DPDK 24.11, three worker lcores, one RX queue each). Our forwarding worker only does about 1.5 Mpps per core and we expected at least 10x that. Review the worker: list every problem (correctness bugs too, not just performance), explain the impact of each, and show how to fix the hot loop.

${REVIEW_TASK}

${file("src/fwd_core.c", "fwd_core.c")}`,
    // Any competent review names the TX call; an answer that never does has not read the loop.
    grounding: ["rte_eth_tx_burst"],
    practices: [
      "flags the RX burst of 1 (rte_eth_rx_burst with nb_pkts 1) as a bottleneck — no amortisation of the per-call cost and no vector RX path — and prescribes a burst of 32-64 into an mbuf array",
      "flags the per-packet rte_pktmbuf_alloc + memcpy as unnecessary because rx_burst already hands over an owned mbuf, and prescribes forwarding the RX mbuf itself (zero-copy)",
      "flags the spinlock around the per-packet stats update (and/or the rte_atomic64_inc on the shared counter) as serialising every core on one cache line, and prescribes per-lcore counters aggregated off the hot path",
      "flags the mempool created with cache_size 0 and a hardcoded socket 0 on a 2-socket box, and prescribes a non-zero cache (256-512) plus a NUMA-aware socket id (rte_eth_dev_socket_id or rte_lcore_to_socket_id)",
      "flags that a packet rte_eth_tx_burst did not send is only counted and never freed — an mbuf leak that surfaces as rx_nombuf under load — and prescribes freeing or retrying the unsent remainder",
      "flags queue = lcore % NB_QUEUES as a topology bug: lcore ids are neither dense nor sequential, so two lcores can poll one RX queue, which is not thread-safe; prescribes an explicit (port, queue) assignment per worker at init",
      "flags the plain int 'running' loop flag as a data race whose load the compiler may hoist, and prescribes a C11 atomic flag (or rte_atomic_*_explicit) read with relaxed ordering",
      "does NOT flag the in-place MAC swap through rte_pktmbuf_mtod in process_headers as a bug — it is the accepted header-access pattern and should be kept (applied to the RX mbuf once the copy is gone)",
    ],
    threshold: 0.7,
  },
  {
    name: "worker design answer: per-lcore state, atomic shutdown, mempool sizing from the formula",
    kind: "quality",
    prompt: `I am designing a DPDK 25.11 forwarding worker. Three questions, answer directly and concretely:
1. How should per-lcore statistics be laid out so that counting packets does not slow the workers down?
2. How should the main lcore stop the workers on Ctrl+C and tear the ports down?
3. How big should the mbuf pool be for 2 ports x 4 RX queues x 1024 RX descriptors, 4 TX queues x 1024 TX descriptors, and 4 worker lcores — and which cache_size?`,
    grounding: [["rte_eal_cleanup", "rte_eth_dev_close"]],
    practices: [
      "lays out stats as one cache-aligned struct per lcore (__rte_cache_aligned / alignas and RTE_CACHE_GUARD, or lcore variables), written only by its owning lcore and read by the control thread, with no shared counter or lock in the loop",
      "the shutdown path is: signal handler sets an atomic flag (C11 atomic, relaxed load in the loop condition; not a plain or volatile int) -> workers exit -> rte_eth_dev_stop and rte_eth_dev_close per port -> rte_eal_cleanup",
      "sizes the pool from the outstanding-objects formula — RX descriptors (2 x 4 x 1024) + TX descriptors (2 x 4 x 1024) + in-flight bursts per lcore + per-lcore caches — i.e. a figure above 16384 plus headroom, not a magic number like 8192",
      "recommends cache_size in the 256-512 range (never 0 on a dataplane pool), at most RTE_MEMPOOL_CACHE_MAX_SIZE (512), and places the pool on the NIC's NUMA socket (one pool per socket when ports or lcores span sockets)",
    ],
    threshold: 0.7,
  },
  {
    name: "drops at 4 Mpps on a VM: counters first, then queues, pool and the anomalous 60% CPU",
    kind: "quality",
    prompt: `Our DPDK 24.11 app runs on a 16-vCPU Azure VM with Accelerated Networking (Mellanox VF). Above ~4 Mpps we see drops; the 4 PMD cores show about 60% CPU in top. Config: 8 RX queues, a mempool of 4096 mbufs with cache_size 0, RX ring of 512 descriptors. What should we check first and what should we change? Answer directly with a prioritised plan.`,
    grounding: ["imissed"],
    // First measured 2026-10-21 at 1/5 on haiku and 2/5 on sonnet with five compound practices
    // (each bundled 3-4 clauses: "imissed vs rx_nombuf vs ierrors, plus xstats, and what each
    // implies, before any change"). Both models' answers contained the substantive half of
    // most of them, and the judge failed the enumeration — the calibration playbook's compound
    // -practice defect. Split into one claim per practice.
    practices: [
      "distinguishes imissed (the NIC had no free RX descriptor: the core did not poll or refill in time) from rx_nombuf (the mempool was empty) as the counters that localise the drops",
      "orders the plan measurement-first: reading counters (and/or a baseline) comes before the configuration changes, not after them",
      "addresses the 8-RX-queues-on-4-cores shape explicitly: either prescribes one RX queue per polling lcore (or more polling lcores), or says what NIC-side evidence would justify keeping two queues per core",
      "flags the mempool as undersized with the arithmetic (8 queues x 512 RX descriptors already equals the 4096-object pool) and flags cache_size 0 as a bug, prescribing a per-lcore cache in the 256-512 range",
      "states that ~60% CPU on a busy-polling PMD core is itself anomalous: a poll-mode core sits near 100% regardless of traffic, so something keeps these threads off the CPU or blocks inside the loop",
      "recommends a testpmd baseline on the same VM, with the decision rule: if testpmd also caps near 4 Mpps the ceiling is the platform, otherwise the application",
    ],
    threshold: 0.7,
  },
  {
    name: "says plainly when DPDK is the wrong tool for a connection-heavy TLS proxy",
    kind: "quality",
    prompt: `We run an HTTP reverse proxy (nginx-style: ~50k concurrent TCP connections, TLS termination, request routing) on ordinary Linux servers. A colleague proposed rewriting the data path on DPDK to get more throughput. Is that a good idea? Answer directly.`,
    practices: [
      "says plainly that DPDK is the wrong tool for this workload: a connection-heavy TLS proxy depends on the kernel's TCP stack (or would need a user-space TCP/TLS stack on top of DPDK), so the rewrite does not deliver what the colleague expects",
      "names the operational costs that come with DPDK regardless of throughput: dedicated busy-polling cores, hugepages, NIC binding/ownership (and the loss of ordinary host networking on that NIC)",
      "offers the proportionate alternatives instead of a flat no: kernel-stack tuning (busy polling, RSS/IRQ affinity, sysctls) and, where early drop or load balancing is the goal, XDP/eBPF or AF_XDP",
      "ties the recommendation to a measurement or a cost model (where the proxy's cycles actually go: TLS, parsing, syscalls) rather than to a slogan about kernel bypass being faster",
    ],
    threshold: 0.75,
  },
];
