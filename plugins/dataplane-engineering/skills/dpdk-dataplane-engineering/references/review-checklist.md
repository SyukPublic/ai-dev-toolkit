# DPDK code review checklist

Review in two passes: correctness first (bugs that corrupt, leak or crash), then performance
(cycles). Start with `python ${CLAUDE_SKILL_DIR}/scripts/dpdk_static_scan.py <path>`: it lists
candidates with line numbers; every hit still needs the surrounding code read, and the absence
of hits proves nothing. Report findings with file:line, the consequence, and a concrete fix.
Cross-check each finding against the semantics in datapath-code.md before asserting it.

## Pass 1: correctness

**mbuf lifecycle (check every path):**

- [ ] Every mbuf from `rx_burst` reaches exactly one of: `tx_burst` (and is reported sent), a
      successful ring enqueue, or `rte_pktmbuf_free`. Error and early-return paths are where
      leaks hide.
- [ ] `tx_burst` return value checked; unsent `pkts[sent..n-1]` freed or retried with a bound.
      Ignoring it leaks under backpressure only, so it "works in the lab".
- [ ] No access to an mbuf after a successful TX or ring enqueue (use-after-free with delayed
      symptoms).
- [ ] Failed ring enqueue: burst variants return how many were enqueued; the remainder is
      still the caller's.
- [ ] Clones: no writes into shared data; headers modified only after exclusive ownership is
      established (`rte_pktmbuf_copy`, or refcount 1).
- [ ] `append` / `prepend` / `adj` / `trim` return values checked.
- [ ] `data_len` vs `pkt_len` used correctly; multi-segment packets handled or explicitly
      rejected (`nb_segs > 1`).
- [ ] `rte_eth_tx_prepare()` used where checksum/TSO offloads need it, on writable mbufs.
- [ ] `RTE_ETH_TX_OFFLOAD_MBUF_FAST_FREE` requested only where one pool, refcount 1 and direct
      mbufs hold for the whole queue.

**Initialisation and configuration:**

- [ ] `rte_eal_init` return checked; `argc`/`argv` shifted by its return value.
- [ ] Ports iterated with `RTE_ETH_FOREACH_DEV`; port count checked; link status waited for
      before any traffic conclusion.
- [ ] Offloads intersected with `rte_eth_dev_info_get` capabilities; RSS hash functions within
      `flow_type_rss_offloads`.
- [ ] `rte_eth_dev_adjust_nb_rx_tx_desc` called; descriptor counts within `rx_desc_lim` /
      `tx_desc_lim`.
- [ ] Queue setup `socket_id` matches the NIC's socket; `rte_eth_dev_socket_id()`'s -1 handled
      as "any", not used as an index; one pool per socket where needed.
- [ ] Mempool size covers descriptors + in-flight + caches (formula in memory-numa.md);
      `cache_size` sane for the DPDK version in use.
- [ ] RX/TX queue to lcore mapping: no queue polled by two lcores (queues are not
      thread-safe), TX queue per lcore unless `RTE_ETH_TX_OFFLOAD_MT_LOCKFREE`, and the mapping
      does not assume lcore ids are dense (`rte_lcore_id()` as an array index needs
      `RTE_MAX_LCORE`; as a queue id it is a bug).
- [ ] Objects (pools, rings, tables) created on the main lcore before workers launch.

**Lifecycle and robustness:**

- [ ] Signal handler -> atomic stop flag -> workers exit -> `rte_eth_dev_stop` / `close` ->
      `rte_eal_cleanup`.
- [ ] Loop condition reads the stop flag with an atomic load (`volatile` alone is a finding).
- [ ] Device events registered where a VF can be revoked or reset
      (`RTE_ETH_EVENT_INTR_RMV`, `RTE_ETH_EVENT_INTR_RESET`, recovery events); no device close
      inside the callback.
- [ ] No undefined behaviour on packet data: unaligned accesses go through
      `unaligned_uint32_t` / `memcpy` idioms on strict platforms; header structs are reached
      via `rte_pktmbuf_mtod` (the accepted aliasing pattern), bounds checked against
      `data_len`.
- [ ] Control threads have a CPU outside the dataplane set.

## Pass 2: performance

Work through the anti-pattern table in SKILL.md; additionally:

- [ ] Burst sizes 32-64 end to end (RX, rings, TX), multiples of 8; a burst of 1 anywhere
      serialises the pipeline. Low-rate TX paths use `rte_eth_tx_buffer` with a drain timer.
- [ ] Zero per-packet: syscalls, `malloc` / `rte_malloc`, `pktmbuf_alloc` + copy, printf/log,
      locks or RMW atomics on shared data, floating point.
- [ ] Stats per-lcore and cache-aligned (`__rte_cache_aligned` + `RTE_CACHE_GUARD`, or lcore
      variables); no shared counters.
- [ ] Division or modulo by variables in the loop.
- [ ] Prefetch present in loops that touch packet data after a lookup gap, and on ring
      consumers.
- [ ] Cold paths out of line; hot helpers `static inline`.
- [ ] Shared read-mostly tables: RCU or an atomically swapped pointer, not rwlocks; readers
      report quiescent state once per iteration.
- [ ] Busy-poll `continue` on an empty RX is fine; `usleep` / `sched_yield` in the datapath is
      not. If power matters, PMD power management or interrupt mode.
- [ ] Offload requests that would knock the PMD off its vector path are deliberate.
- [ ] Ring modes match the deployment (SP/SC where true; RTS/HTS when lcores can be
      preempted).

## Red flags that deserve a comment even when "working"

- Hardcoded socket 0, queue counts or port ids: breaks on redeploy.
- Magic numbers for pool, ring or descriptor sizes without the formula.
- `rte_eth_promiscuous_enable` unconditionally (may be intended; ask).
- Deprecated or removed APIs: `rte_atomicNN_*`, KNI (gone in 23.11; virtio-user or tap),
  master/slave lcore names (`rte_get_master_lcore`, `RTE_LCORE_FOREACH_SLAVE`, `SKIP_MASTER`),
  pre-21.11 macro names (`PKT_RX_*`, `DEV_TX_OFFLOAD_*`, `ETH_RSS_*`), `rte_eth_stats` queue
  fields (`q_ipackets` and friends, gone in 25.11), `-c` / `-s` coremasks in run scripts
  (deprecated), `-w` and `--master-lcore` (removed: `-a`/`--allow`, `--main-lcore`), Makefile
  builds. Not removed: `--socket-mem` / `--socket-limit` still parse as aliases of
  `--numa-mem` / `--numa-limit`.
- A pool created with `SOCKET_ID_ANY` on a multi-socket target.
- Per-lcore arrays sized by anything other than `RTE_MAX_LCORE`.

## Reporting format

Group findings as **Bugs** (correctness: will misbehave), **Performance** (cycles left on the
table, with the estimated impact: "serialises all cores", "about 10x per-packet cost") and
**Hygiene** (portability, deprecations). Lead with the two or three findings that explain the
user's observed symptom when one was reported, state which verification gates from SKILL.md the
code fails, and finish with the corrected hot loop when the fix is non-trivial.
