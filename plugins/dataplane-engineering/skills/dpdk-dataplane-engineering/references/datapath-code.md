# Writing DPDK hot-path code

Read this before writing or modifying any per-packet code path. Everything here follows from
the hot-path contract in SKILL.md; the sections add the API-level rules that make each contract
item concrete. API semantics were checked against the DPDK 26.x headers and programmer's guide;
version-sensitive points say so.

## The canonical forwarding loop

Every fast DPDK worker has the same skeleton. Deviations need a stated reason.

```c
#include <stdatomic.h>
#include <rte_branch_prediction.h>
#include <rte_common.h>
#include <rte_ethdev.h>
#include <rte_lcore.h>
#include <rte_log.h>
#include <rte_mbuf.h>
#include <rte_prefetch.h>

#define BURST_SIZE      32   /* keep it a multiple of 8: some vector PMDs need that */
#define PREFETCH_OFFSET 3    /* l3fwd's value; tune 2-4, never more than ~8 */

static atomic_bool force_quit;            /* set by the signal handler only */

struct worker_stats {                     /* written by the owning lcore only */
	uint64_t rx, tx, tx_drop;
};

struct __rte_cache_aligned worker_ctx {  /* one per lcore; nothing else writes it */
	uint16_t port, rx_queue, tx_port, tx_queue;
	struct worker_stats stats;
	RTE_CACHE_GUARD;                      /* keeps the next ctx out of the adjacent-line prefetcher */
};

static inline void
handle_pkt(struct worker_ctx *ctx, struct rte_mbuf *m)
{
	/* touch headers once, no allocation, no copy, no call that may block */
	(void)ctx; (void)m;
}

static int
worker_main(void *arg)
{
	struct worker_ctx *ctx = arg;
	struct rte_mbuf *pkts[BURST_SIZE];
	int nic_socket = rte_eth_dev_socket_id(ctx->port);

	if (nic_socket >= 0 && nic_socket != (int)rte_socket_id())
		RTE_LOG(WARNING, USER1, "lcore %u polls port %u across NUMA nodes\n",
			rte_lcore_id(), ctx->port);

	while (!atomic_load_explicit(&force_quit, memory_order_relaxed)) {
		uint16_t nb_rx = rte_eth_rx_burst(ctx->port, ctx->rx_queue, pkts, BURST_SIZE);
		if (unlikely(nb_rx == 0))
			continue;                 /* busy polling: empty polls are normal */
		ctx->stats.rx += nb_rx;

		/* prefetch the first packets' data, then stay PREFETCH_OFFSET ahead */
		for (uint16_t i = 0; i < PREFETCH_OFFSET && i < nb_rx; i++)
			rte_prefetch0(rte_pktmbuf_mtod(pkts[i], void *));
		for (uint16_t i = 0; i < nb_rx; i++) {
			if (i + PREFETCH_OFFSET < nb_rx)
				rte_prefetch0(rte_pktmbuf_mtod(pkts[i + PREFETCH_OFFSET], void *));
			handle_pkt(ctx, pkts[i]);
		}

		uint16_t nb_tx = rte_eth_tx_burst(ctx->tx_port, ctx->tx_queue, pkts, nb_rx);
		ctx->stats.tx += nb_tx;
		if (unlikely(nb_tx < nb_rx)) {    /* the driver owns pkts[0..nb_tx-1] only */
			ctx->stats.tx_drop += nb_rx - nb_tx;
			rte_pktmbuf_free_bulk(&pkts[nb_tx], nb_rx - nb_tx);
		}
	}
	return 0;
}
```

Properties to preserve: one mbuf array reused every iteration; zero allocation and zero copies
per packet; a per-lcore context nothing else writes; the unsent remainder freed and counted;
shutdown through an atomic flag. If `handle_pkt()` can consume or drop a packet, compact the
array with a write index before TX: never leave a freed pointer in the TX burst.

Older DPDK (before 24.03) spelled the alignment as a trailing `} __rte_cache_aligned;`, which
GCC and Clang still accept. `RTE_CACHE_GUARD` (and `RTE_CACHE_GUARD_LINES`, default 1) exist
because a next-N-lines hardware prefetcher drags a neighbouring lcore's line into your cache
even when the structs are 64-byte aligned.

## mbuf ownership rules (the #1 source of bugs)

- `rte_eth_rx_burst()` hands you owned mbufs. Each must eventually reach exactly one of:
  `rte_eth_tx_burst()` (and be counted as sent), a successful ring enqueue whose consumer takes
  over, or `rte_pktmbuf_free()`. Every exit path of the processing function must satisfy this,
  error paths included. The API gives no error notification on RX: after a long run of zero
  returns, check the link state instead of assuming a bug.
- `rte_eth_tx_burst(port, q, pkts, n)` returns `sent <= n`. "The rte_eth_tx_burst() function
  returns the number of packets it actually sent." The driver now owns `pkts[0..sent-1]`; do
  not touch or free them. `pkts[sent..n-1]` are still yours: free them, or retry with a
  bounded number of attempts. An unbounded retry loop stalls the RX side; dropping with a
  counter is usually right.
- The PMD frees transmitted mbufs lazily, "driven by the tx_free_thresh value", once the NIC
  reports completion. A mempool must therefore cover RX descriptors + TX descriptors in flight
  + bursts in processing + per-lcore caches, for every queue that uses it (formula in
  memory-numa.md). Undersized pools fail only under load, as `rx_nombuf`.
  `rte_eth_tx_done_cleanup()` forces the driver to release completed mbufs when you need them
  back early (packet generators, multi-destination flooding).
- `rte_pktmbuf_clone()` creates an indirect mbuf sharing the data buffer and bumps the direct
  mbuf's refcount; while that refcount is above 1 "the buffer area of a direct mbuf must be
  read-only". To modify headers, `rte_pktmbuf_copy()` a writable copy (or copy the headers out
  first). Clone for read-only fan-out only.
- `rte_pktmbuf_prepend()` and `rte_pktmbuf_append()` return NULL when there is not enough head
  or tail room "without modifying the mbuf"; `rte_pktmbuf_adj()` returns NULL when `len`
  exceeds the first segment; `rte_pktmbuf_trim()` returns -1 when `len` exceeds the last
  segment. Check every one of them.
- `pkt_len` is the whole packet, `data_len` the current segment. They diverge on
  multi-segment mbufs (jumbo frames, LRO, scatter RX). Code that treats `data_len` as the
  packet length is wrong the day jumbo frames arrive. `nb_segs` and the other metadata are
  valid only in the first segment; iterate `m->next` or reject `nb_segs > 1` explicitly.
  `rte_pktmbuf_linearize()` exists but copies.
- `rte_pktmbuf_free(NULL)` is a no-op and `rte_pktmbuf_free_bulk()` tolerates NULL entries;
  `rte_pktmbuf_alloc_bulk()` is all-or-nothing (`-ENOENT`, nothing retrieved).
- When using checksum or TSO offloads call `rte_eth_tx_prepare()` before `tx_burst` for PMDs
  that need it; it may modify packet data, so the mbufs "must be safely writable" (direct,
  refcount 1).
- `RTE_ETH_TX_OFFLOAD_MBUF_FAST_FREE` is a contract, not a free speedup: per queue, all mbufs
  must come from one mempool, have refcount 1 and be direct. Enable it only when that is true
  (mlx5 additionally refuses it together with MPRQ).

## Prefetching

RX descriptors tell you packet addresses a burst ahead of when you touch the data; exploit
that. The l3fwd pattern above prefetches the first `PREFETCH_OFFSET` packets, then one packet
ahead of the one being processed. Prefetching the mbuf struct itself is rarely needed on the
RX lcore (the PMD just wrote it), but a consumer dequeuing mbufs from a ring misses on the
header: prefetch dequeued mbufs there. Prefetching table entries right after the lookup key is
computed is often the bigger win. Beyond ~8 packets ahead you evict your own data.

## Per-lcore state and false sharing

The EAL guide lists three ways to keep per-lcore state:

- **Lcore variables** (24.11, experimental; names as of 26.x): `RTE_LCORE_VAR_HANDLE(struct
  worker_stats, stats);` then `RTE_LCORE_VAR_ALLOC(stats)` at init, `RTE_LCORE_VAR(stats)` for
  this thread's instance, `RTE_LCORE_VAR_LCORE(id, stats)` for another lcore's,
  `RTE_LCORE_VAR_FOREACH(id, value, stats)` to aggregate. Allocation is init-only and never
  freed.
- **TLS** (`RTE_DEFINE_PER_LCORE`), for very small objects only.
- **Static arrays** indexed by `rte_lcore_id()`, sized `RTE_MAX_LCORE`, each element cache
  aligned and separated with `RTE_CACHE_GUARD`. The guide calls this "largely obsolete"; it is
  still the most common pattern in the wild and fine when done that way.

Rules that go with them:

- `rte_lcore_id()` values depend on the core list: they are neither dense nor sequential.
  Use them as an array index sized `RTE_MAX_LCORE`, never as a queue id. `--remap-lcore-ids`
  (25.11) exists when contiguity matters.
- An unregistered non-EAL thread has `rte_lcore_id() == LCORE_ID_ANY`: mempool operations
  bypass the per-lcore cache, `rte_timer_manage()` is not allowed. Register control threads
  with `rte_thread_register()` or give them a user-owned cache
  (`rte_mempool_cache_create()`).
- Counters: single writer per lcore, plain `uint64_t` increments, as the sample apps do. The
  C11-clean form costs nothing on x86 and arm64: declare `RTE_ATOMIC(uint64_t)` and use
  relaxed load/store (a relaxed store compiles to a plain store). What must never be in the
  loop is a `fetch_add` on a counter other lcores write too.
- Object creation (`rte_mempool_create`, `rte_ring_create`, hash and LPM tables, memzones) is
  not thread-safe: create everything on the main lcore at init, then use from workers.
- Two cores writing the same 64-byte line, even different fields, serialise on it. A
  `struct stats[RTE_MAX_LCORE]` with 24-byte elements packs 2-3 lcores per line: pad or align.

## Cross-core communication: rte_ring

- Modes: SP/SC, MP/MC (the default, "can perform quite poorly on some overcommitted
  scenarios": a producer preempted between head and tail update stalls the others), MP_RTS /
  MC_RTS (relaxed tail sync; two 64-bit CAS per operation) and MP_HTS / MC_HTS (fully
  serialised head+tail, enables the peek API). Pick the narrowest mode that is true; SP/SC is
  several times cheaper than MP/MC. Use RTS or HTS when lcores can be preempted (VMs,
  containers without dedicated cores, overcommitted hosts).
- Size is a power of two (`RTE_RING_F_EXACT_SZ` when an exact usable count matters).
- `bulk` is all-or-nothing; `burst` transfers what fits and returns the count. A datapath
  usually wants burst, and the un-enqueued remainder is still the producer's to free or retry.
- Count ring-full events on enqueue: a full ring means the consumer is the bottleneck, and a
  silent drop makes that invisible.
- A successful enqueue is a handoff, not a completion: the producer must not touch the mbuf
  afterwards.
- Rings move pointers. For ordered multi-stage pipelines look at `rte_soring` (staged ring,
  peek API in 26.07) or eventdev; both are heavier, so measure.

## Read-mostly tables: RCU

- `rte_rcu_qsbr`: readers `rte_rcu_qsbr_thread_register()` + `rte_rcu_qsbr_thread_online()`
  once, then report `rte_rcu_qsbr_quiescent()` once per loop iteration at a point where no
  table reference is held (top or bottom of the `while` loop). Writers delete the entry, call
  `rte_rcu_qsbr_start()` and `rte_rcu_qsbr_check()` (or the blocking
  `rte_rcu_qsbr_synchronize()`), then free. `rte_rcu_qsbr_dq_*` is the deferred-free queue
  that batches this; `rte_hash`, `rte_lpm` and (since 25.11) FIB6 integrate it directly.
- Call `rte_rcu_qsbr_thread_offline()` before any blocking call on a reader lcore, or the
  grace period never ends.
- The cheaper special case: a double-buffered table behind an atomically swapped pointer,
  with the writer waiting out a grace period measured in loop iterations. Only when the writer
  can wait.

## Atomics and the memory model

DPDK moved to the C11 memory model. The programmer's guide's rules:

- Counters need atomicity only: relaxed ordering.
- Spinlock-style code: acquire on the compare-and-swap, release on the unlock store.
- Reader/writer handoff: the writer stores the payload relaxed, then the guard with release;
  the reader loads the guard with acquire, then the payload relaxed.
- Use `<stdatomic.h>` in application code, or DPDK's `rte_stdatomic.h` wrappers
  (`RTE_ATOMIC(type)`, `rte_atomic_load_explicit`, `rte_atomic_store_explicit`,
  `rte_atomic_fetch_add_explicit`, `rte_memory_order_relaxed` ...). The legacy `rte_atomicNN_*`
  API is deprecated.
- `volatile` is not synchronisation. The l2fwd sample's `static volatile bool force_quit`
  works on the platforms it is tested on; the correct form is an atomic flag.
- On x86 the cost of a locked instruction is the whole story; on Arm a missing acquire or
  release is a real reordering bug, not a theoretical one.

## Branches, arithmetic and codegen

- `likely()` / `unlikely()` on error and empty-poll paths keep the fast path fall-through.
  Cold code (errors, slow path, logging) goes into separate `__rte_noinline` / `__rte_cold`
  functions so it does not pollute the instruction cache.
- Per-packet helpers are `static inline` in headers; `__rte_always_inline` only with evidence
  that the compiler got it wrong.
- Integer division or modulo by a non-constant costs 20-90 cycles: power-of-two sizes and
  `& (n - 1)` everywhere (rings already enforce it).
- No floating point on the datapath.
- Build DPDK with `-Dplatform=native` (or the deployment target's `-Dcpu_instruction_set`) and
  the app with `-O3 -march=<deployment target>`. Vector PMD paths (AVX2, AVX-512, NEON, SVE)
  are selected at runtime; `--force-max-simd-bitwidth=512` is required for AVX-512 on Intel
  ice, and any offload the PMD marks as unsupported by its vector path silently selects the
  scalar path (check the driver's feature table). 26.03 removed the SSE paths from i40e, iavf
  and ice; AVX2, AVX-512 and scalar remain.
- Verify, do not assume: `objdump -d` the loop. A `call` to memcpy, malloc, printf or a lock
  inside it is a finding.

## Offloads

- Query `rte_eth_dev_info_get()` and request only what `rx_offload_capa` / `tx_offload_capa`
  contain. Offloads set in `rte_eth_dev_configure()`'s `[rt]xmode.offloads` apply to every
  queue and cannot be disabled per queue; per-queue offloads go into
  `rte_eth_[rt]x_queue_setup()`.
- RX checksum validation: `RTE_ETH_RX_OFFLOAD_IPV4_CKSUM`, `UDP_CKSUM`, `TCP_CKSUM`; the result
  arrives in `ol_flags` (`RTE_MBUF_F_RX_IP_CKSUM_GOOD` / `BAD` / `NONE`, same for L4).
- TX checksum contract (mbuf library guide): set `l2_len` and `l3_len` (plus `l4_len` and
  `tso_segsz` for TSO), set `RTE_MBUF_F_TX_IPV4` with `RTE_MBUF_F_TX_IP_CKSUM`, zero the IP
  checksum field, put the pseudo-header checksum from `rte_ipv4_phdr_cksum()` into the L4
  checksum field and set `RTE_MBUF_F_TX_UDP_CKSUM` or `RTE_MBUF_F_TX_TCP_CKSUM`. Each flag needs
  the matching `RTE_ETH_TX_OFFLOAD_*` capability.
- RSS: `rte_eth_conf.rx_adv_conf.rss_conf.rss_hf` within `flow_type_rss_offloads`; the hash is
  in `m->hash.rss` when `RTE_MBUF_F_RX_RSS_HASH` is set. Reuse it as your flow-table key.
- `RTE_ETH_TX_OFFLOAD_MULTI_SEGS` if you ever transmit chains; `RTE_ETH_RX_OFFLOAD_SCATTER` for
  frames larger than the mbuf data room.

## Multi-queue scaling

- One lcore polls one (port, queue) pair, assigned at init. The ethdev API is lock-free: "the
  receive function of a PMD cannot be invoked in parallel on two logical cores to poll the same
  Rx queue", and the application enforces that. The same holds for TX queues: one per lcore
  per port unless the PMD advertises `RTE_ETH_TX_OFFLOAD_MT_LOCKFREE`.
- Distribution across queues is RSS's job. When specific flows must land on specific cores,
  `rte_flow` with a queue action; when flows are too few or too skewed for RSS, eventdev
  (atomic or ordered queues) or a software distributor stage. Measure before adding a stage.
- Low-rate TX paths still need batching: `rte_eth_tx_buffer()` accumulates and
  `rte_eth_tx_buffer_flush()` on a timer drains it (l2fwd drains every 100 us); set
  `rte_eth_tx_buffer_set_err_callback()` so dropped packets are counted, not leaked.

## Initialisation order (port_init)

1. `rte_eth_dev_info_get(port, &dev_info)`: intersect offloads, read `rx_desc_lim` /
   `tx_desc_lim`, `max_rx_queues`, and the PMD's `default_rxportconf` / `default_txportconf`
   recommendations.
2. `rte_eth_dev_configure(port, nb_rxq, nb_txq, &port_conf)`.
3. `rte_eth_dev_adjust_nb_rx_tx_desc(port, &nb_rxd, &nb_txd)` clamps to device limits.
4. `rte_eth_rx_queue_setup(port, q, nb_rxd, rte_eth_dev_socket_id(port), &rxconf, pool)` and
   `rte_eth_tx_queue_setup(port, q, nb_txd, socket, &txconf)` per queue, with `txconf` taken
   from `dev_info.default_txconf` plus the offloads. `rte_eth_dev_socket_id()` returns -1
   (`SOCKET_ID_ANY`, `rte_errno` 0) when the socket is unknown (vdevs, many VMs): treat that as
   "any", never index an array with it.
5. `rte_eth_dev_start()`, then `rte_eth_promiscuous_enable()` only if the app really wants
   everything, then wait for the link with `rte_eth_link_get_nowait()` in a bounded loop.
6. Launch workers: `RTE_LCORE_FOREACH_WORKER(lcore) rte_eal_remote_launch(worker_main,
   &ctx[lcore], lcore);` and `rte_eal_mp_wait_lcore()` at the end.
7. Iterate ports with `RTE_ETH_FOREACH_DEV(port)`; port ids are not contiguous.
8. Bifurcated drivers (mlx5): `rte_flow_isolate()` before configure when the kernel must keep
   receiving the traffic you do not match.

## Shutdown, errors and device events

- The signal handler only stores the atomic flag (async-signal-safe). The main lcore then
  `rte_eal_mp_wait_lcore()`, and per port `rte_eth_dev_stop()` (returns `-EBUSY` when the port
  cannot be stopped in its current state), `rte_eth_dev_close()` ("the device cannot be
  restarted"), then `rte_eal_cleanup()`. Missing stop/close leaves hardware and driver state
  that breaks the next run, bifurcated drivers especially.
- Register `rte_eth_dev_callback_register(port, RTE_ETH_EVENT_INTR_RMV, ...)` wherever a VF can
  be revoked (Azure host servicing, SR-IOV); `RTE_ETH_EVENT_INTR_RESET` is sent to a VF on PF
  reset (passive mode: stop queues and RX/TX, then `rte_eth_dev_reset()` from the same thread);
  proactive-mode drivers signal `RTE_ETH_EVENT_ERR_RECOVERING`, `RECOVERY_SUCCESS` and
  `RECOVERY_FAILED`, and control-path calls return `-EBUSY` in between. Callbacks run on the
  interrupt thread: never close the device inside one; schedule it.
- Control threads (`rte_thread_create_control()`) run on CPUs outside the dataplane set; if
  none is free they fall back to the main lcore and compete with its polling (delayed alarms,
  missed hot-plug events, telemetry timeouts). Leave part of one core free.

## Idle cores and power

Busy polling shows 100% CPU whatever the load; that is expected, and a PMD core showing less
than 100% is a finding (something blocks the loop). To save power on purpose use PMD power
management, `rte_power_ethdev_pmgmt_queue_enable(lcore, port, queue, mode)` with
`RTE_POWER_MGMT_TYPE_MONITOR` (needs WAITPKG on x86; one queue per lcore unless
`rte_power_monitor_multi()` is available), `PAUSE` or `SCALE`, or interrupt mode
(`rte_eth_dev_rx_intr_*` with `rte_epoll_wait()`, see the l3fwd-power sample). Never an ad-hoc
`usleep()`.

Sources: DPDK Programmer's Guide (Writing Efficient Code, Mbuf, Ring, RCU, EAL, Ethernet Device
and Power Management chapters), `rte_ethdev.h` / `rte_mbuf.h` / `rte_mempool.h` doc comments,
the l3fwd, l2fwd and skeleton sample applications.
