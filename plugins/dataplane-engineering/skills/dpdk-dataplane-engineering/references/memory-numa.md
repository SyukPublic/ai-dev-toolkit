# Memory, mempools, mbufs, hugepages, NUMA

## Hugepages

- DPDK memory lives in hugepages: 2 MB or 1 GB on x86 (Arm with a 64 KB kernel page size
  offers 2 MB, 512 MB and 16 GB; IBM Power 16 MB and 16 GB). The Linux GSG recommends 1 GB
  pages for 64-bit applications: fewer TLB misses, no fragmentation for large pools. 1 GB
  pages usually must be reserved at boot (`default_hugepagesz=1G hugepagesz=1G hugepages=N` on
  the kernel command line; some kernels cannot reserve them at runtime). 2 MB pages can be
  reserved at runtime, and should be reserved **per NUMA node**:
  `echo 1024 > /sys/devices/system/node/node1/hugepages/hugepages-2048kB/nr_hugepages`.
  The global `/sys/kernel/mm/hugepages/.../nr_hugepages` splits pages across nodes by kernel
  policy, which is not what a NIC on socket 1 needs. `usertools/dpdk-hugepages.py` does the
  same with less typing.
- A hugetlbfs mount is needed only for multi-process (secondary processes map the same files);
  `/dev/hugepages` is mounted by default for the default size, and 1 GB pages need an explicit
  `mount -t hugetlbfs -o pagesize=1GB none /mnt/huge`. Single-process apps can run with
  `--in-memory` (anonymous mappings, no root needed for memory, no multi-process).
  `MEMLOCK` limits (`ulimit -l`) still apply.
- Symptoms of missing or exhausted hugepages: EAL init fails, or mempool creation returns
  `ENOMEM` on one socket only. Transparent huge pages are not a substitute.
- Containers: mount `/dev/hugepages` into the container, grant `IPC_LOCK` (or raise the memlock
  limit), pass the vfio device nodes, and give every instance its own `--file-prefix` (or
  `--in-memory`).

## EAL memory modes and options

- Dynamic mode (default on Linux) grows and shrinks hugepage use on demand. Pages given with
  `-m` or `--numa-mem <MB>,<MB>` (one value per socket) are preallocated and pinned, which is
  what a dataplane wants: `--numa-mem 0,2048` for a NIC and its lcores on socket 1.
  `--numa-limit` caps what DPDK may take per socket.
- `--legacy-mem` reserves everything at startup in large IOVA-contiguous chunks and never
  releases it. Dynamic-mode allocations are not guaranteed IOVA-contiguous; use
  `rte_memzone_reserve(..., RTE_MEMZONE_IOVA_CONTIG)` when a device needs contiguity.
- `--single-file-segments` avoids running out of file descriptors with many 2 MB pages.
- `mlockall(MCL_CURRENT | MCL_FUTURE)` early in `main()`: the programmer's guide recommends
  pre-loading and locking pages so no page-in stalls the datapath (log a notice on failure).
- `-n <channels>`: number of memory channels; mempools spread object start addresses across
  channels (x86 only, Arm interconnects hash the address bits themselves).
- `rte_malloc()` returns memory from the calling core's NUMA socket; each socket has its own
  heap.

## Mempool sizing and cache

`rte_pktmbuf_pool_create(name, n, cache_size, priv_size, data_room_size, socket_id)`

- **n (pool size)** must cover everything simultaneously outstanding. The l3fwd sample's
  formula, with per-lcore caches and in-flight bursts included:

  `n >= ports x rxq x rxd + ports x txq x txd + lcores x burst x stages + lcores x cache_size`

  (l3fwd floors it at 8192). Add every other place packets wait: rings between stages,
  reassembly tables, TX buffers, cloned fan-out, packets held by a crypto or DMA device.
  Compute it from the descriptor counts **after** `rte_eth_dev_adjust_nb_rx_tx_desc()` has
  clamped them, and create the pool before the queues that draw from it.
  `dpdk_budget.py mempool` computes this. Undersizing is invisible at low load and fatal at
  line rate: TX completions arrive late, the pool drains, and `rx_nombuf` climbs.
- **cache_size** is the per-lcore cache that keeps most get/put operations off the shared
  ring (each ring access is a compare-and-set). Use 256-512 on dataplane pools; `0` only for a
  single-threaded control pool. Constraints: at most `RTE_MEMPOOL_CACHE_MAX_SIZE` (512);
  through 25.11 the API required `cache_size <= n / 1.5` and advised `n % cache_size == 0`
  ("some elements will always stay in the pool"); since 26.07 the requirement is
  `cache_size <= n`, the effective cache equals the requested size (it used to be 1.5x) and
  lcores that only put or only get (RX-only, TX-only stages) should double their cache to keep
  the miss rate. Requests larger than `cache_size / 2` bypass the cache.
- **The old "2^q - 1" advice** is gone from the API docs. The ring backend allocates
  `rte_align32pow2(n + 1)` slots, so a pool of exactly 2^k costs a 2^(k+1)-slot pointer table
  (8 bytes per slot: 16384 objects cost 128 KiB more ring memory than 16383). That is the whole
  effect; size the pool by demand.
- **data_room_size**: `RTE_MBUF_DEFAULT_BUF_SIZE` (2048 + `RTE_PKTMBUF_HEADROOM` of 128) unless
  jumbo frames or scatter RX. Headroom is where tunnel headers are prepended; do not shrink it
  without a reason.
- **priv_size**: per-mbuf private area for application metadata. The alternative is a
  registered dynamic field (`rte_mbuf_dynfield_register()`), which libraries can share.
- **socket_id**: the socket of the NIC and of the lcores using the pool
  (`rte_eth_dev_socket_id(port)`, `rte_lcore_to_socket_id(lcore)`). One pool per socket when
  ports or lcores span sockets. `SOCKET_ID_ANY` or a hardcoded 0 on a 2-socket box silently
  halves performance for the remote cores.
- Leak detection from the control thread: `rte_mempool_in_use_count()` growing while traffic
  does not is a leak; `rte_mempool_avail_count()` near zero is exhaustion. The mbuf history
  debug field (25.11, `RTE_MBUF_HISTORY_DEBUG`) records lifecycle states per mbuf when you need
  to find who held it.
- testpmd reproduces a pool shape with `--total-num-mbufs` and `--mbcache`.

## mbuf anatomy essentials

- Layout: a cache-aligned metadata header, then the data area; fresh mbufs start their data
  `RTE_PKTMBUF_HEADROOM` (128) bytes in. Access data through `rte_pktmbuf_mtod(m, type)` /
  `rte_pktmbuf_mtod_offset()`, never by `buf_addr` arithmetic by hand.
- `pkt_len` = whole packet (sum of segments); `data_len` = this segment; `nb_segs`, `port`,
  `ol_flags`, `hash.rss`, `vlan_tci` are valid in the first segment only; `next` links
  segments; `buf_len` is the buffer size.
- `refcnt`: `rte_pktmbuf_free()` decrements, the buffer returns to its pool at zero; atomicity
  of the counter is a build option (`RTE_MBUF_REFCNT_ATOMIC`). `rte_pktmbuf_clone()` and
  `rte_pktmbuf_attach()` create indirect mbufs referencing the same data (direct refcount
  goes up); an indirect mbuf never attaches to another indirect one, and a buffer can become
  indirect only while its refcount is 1. `RTE_MBUF_DIRECT()`, `RTE_MBUF_INDIRECT()` and
  `RTE_MBUF_HAS_EXTBUF()` tell them apart; external buffers (`rte_pktmbuf_attach_extbuf()`)
  carry their own shared-info refcount and free callback.
- Indirect mbufs hold no data, so their pool can use a reduced data room.
- Dynamic fields and flags (`rte_mbuf_dyn*`) add named metadata without touching the struct;
  registrations cannot be removed.

## NUMA discipline

Checklist for any machine with more than one socket (and for single-socket parts exposed as
several NUMA nodes, such as AMD EPYC in NPS2/NPS4 or with L3-as-NUMA):

1. Which node is the NIC on? `cat /sys/bus/pci/devices/<bdf>/numa_node` (`-1` means unknown,
   typical in VMs), or `lstopo-no-graphics --merge`, or `numactl --hardware` plus `lspci`.
2. Workers: only lcores from that node in `-l`; `usertools/cpu_layout.py` or `lscpu -e` shows
   socket, core and hyperthread siblings (numbering is not sequential across sockets).
3. Pools, rings, memzones and `rte_eth_[rt]x_queue_setup()`'s `socket_id`: the same node.
4. Hugepages reserved on that node (`/sys/devices/system/node/node*/meminfo`, `numastat -m`).
5. Automatic NUMA balancing (`/proc/sys/kernel/numa_balancing`) moves pages behind your back;
   disable it when placement is manual. (Arm's guide notes some Neoverse N2 systems do better
   with it on: measure.)

Cross-socket is not subtly slower: it adds 50-100% memory latency and contends the
inter-socket link. It is the first thing to rule out when a "fast" machine underperforms a
laptop-grade one, and the usual reason a 2-socket server scales worse than a 1-socket one.

## rte_malloc vs malloc

Control-path allocations of DMA-visible or shared structures use `rte_malloc_socket()` /
`rte_zmalloc_socket()` (hugepage-backed, socket-aware, with an alignment parameter;
`RTE_CACHE_LINE_SIZE` for anything a worker touches). Plain `malloc()` is fine for private
control-plane data the datapath never touches. Nothing allocates on the datapath.

## IOVA, VFIO and device binding

- Preferred: `vfio-pci` with the IOMMU enabled (`intel_iommu=on iommu=pt`, `amd_iommu=on`, or
  `iommu.passthrough=1` on aarch64; VT-d / AMD-Vi on in the BIOS). With IOMMU groups present
  EAL defaults to IOVA-as-VA. `--iova-mode=pa` needs root and physically contiguous memory;
  force a mode only for virtual devices that have no bus preference.
- Bind with `usertools/dpdk-devbind.py --status` and `--bind=vfio-pci <bdf>`; every device in
  an IOMMU group must be bound or left unbound together, and a PCI bridge in the group must be
  unbound too. `dmesg` "error -22" from vfio-pci means the IOMMU is off.
- Unsafe fallbacks: VFIO no-IOMMU mode (`enable_unsafe_noiommu_mode=1`), `uio_pci_generic`,
  and `igb_uio` (out of tree in dpdk-kmods since the main-tree kernel modules went away; it
  may still be needed for VFs without legacy interrupts). All give up IOMMU protection and need
  root; UEFI Secure Boot blocks UIO.
- Raise `vfio_iommu_type1 dma_entry_limit` (default 64K) when running with `--no-huge` or many
  small mappings. VFIO cdev mode with VF tokens needs Linux 6.17 or later.
- Bifurcated drivers (NVIDIA mlx4/mlx5 and others): do not unbind; the kernel driver stays
  bound, DPDK attaches through rdma-core, and `ethtool`/`ip` keep working. Use
  `rte_flow_isolate()` to control which traffic reaches DPDK.
- Non-root: device node permissions on `/dev/vfio/*`, a memlock limit large enough for the
  hugepage mappings, and `--in-memory` or a writable hugetlbfs mount.

## Multi-process (brief)

`--proc-type=primary|secondary|auto` with a shared `--file-prefix`; secondaries map the
primary's hugepage files (so a hugetlbfs mount is required and `--in-memory` /
`--huge-unlink` disable multi-process), look up objects by name (`rte_mempool_lookup()`,
`rte_ring_lookup()`), cannot allocate new pages themselves, and must pass the same `-d`
driver arguments in the same order. mlx5's MPRQ is not supported in multi-process. Prefer
threads unless isolation is a hard requirement.

Sources: DPDK Linux GSG (System Requirements, Linux Drivers), EAL and Mempool/Mbuf chapters of
the Programmer's Guide, `rte_mempool.h` doc comments on `main` and `v25.11`, the 26.07 release
notes, `drivers/mempool/ring/rte_mempool_ring.c`.
