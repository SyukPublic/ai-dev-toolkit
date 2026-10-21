#!/usr/bin/env python3
"""Deterministic calculators for DPDK sizing decisions. Standard library only.

    python dpdk_budget.py budget --link 100G --pkt 64 --ghz 3.0 --cores 4
    python dpdk_budget.py mempool --ports 2 --rxq 4 --rxd 1024 --txq 4 --txd 1024 --lcores 4
    python dpdk_budget.py descriptors --rate 148.8 --gap-us 50 --cores 4
    python dpdk_budget.py descriptors --rate 10 --cores 2 --rxd 1024
    python dpdk_budget.py --self-test

budget       cycles per packet per core at a link speed and frame size (line rate counts the
             20-byte preamble, SFD and inter-frame gap on the wire).
mempool      mbuf pool demand from the port/queue/descriptor/lcore shape (the l3fwd formula plus
             in-flight stages), with the cache_size constraints of the DPDK version in use.
descriptors  RX descriptor depth from the bandwidth-delay model used in Arm's Neoverse V2 DPDK
             analysis (descriptors = rate x service gap / cores), or the gap a depth tolerates.
"""

from __future__ import annotations

import argparse
import math
import sys

WIRE_OVERHEAD_BYTES = 20  # 7 B preamble + 1 B SFD + 12 B inter-frame gap
MEMPOOL_CACHE_MAX = 512   # RTE_MEMPOOL_CACHE_MAX_SIZE
MBUF_HEADER_BYTES = 128   # sizeof(struct rte_mbuf): two cache lines
DEFAULT_DATAROOM = 2048 + 128  # RTE_MBUF_DEFAULT_BUF_SIZE = data room + RTE_PKTMBUF_HEADROOM


def parse_link(value: str) -> float:
    """'10G', '25g', '100', '2.5G', '400G' -> Gbps as float."""
    v = value.strip().lower().rstrip("bps").rstrip("b")
    mult = 1.0
    if v.endswith("g"):
        v = v[:-1]
    elif v.endswith("m"):
        v, mult = v[:-1], 1e-3
    elif v.endswith("t"):
        v, mult = v[:-1], 1e3
    return float(v) * mult


def line_rate_pps(link_gbps: float, frame_bytes: int) -> float:
    return link_gbps * 1e9 / ((frame_bytes + WIRE_OVERHEAD_BYTES) * 8)


def next_pow2(n: float) -> int:
    n = max(1, int(math.ceil(n)))
    return 1 << (n - 1).bit_length()


def round_up(n: float, multiple: int) -> int:
    return int(math.ceil(n / multiple) * multiple)


def version_tuple(text: str) -> tuple[int, int]:
    parts = text.strip().split(".")
    try:
        return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        raise SystemExit(f"cannot parse DPDK version '{text}' (expected e.g. 25.11)")


# --- budget -----------------------------------------------------------------------------


def cmd_budget(a: argparse.Namespace) -> int:
    gbps = parse_link(a.link)
    sizes = [a.pkt] if not a.table else sorted({64, 128, 256, 512, 1024, 1518, a.pkt})
    print(f"link {gbps:g} Gbps, {a.cores} core(s) at {a.ghz:g} GHz, target utilisation {a.util:.0%}")
    print(f"{'frame':>6} {'on wire':>8} {'line rate':>12} {'ns/pkt':>8} | {'per core':>12} {'ns/pkt':>8} {'cycles/pkt':>11}")
    for size in sizes:
        pps = line_rate_pps(gbps, size) * a.util
        per_core = pps / a.cores
        ns = 1e9 / pps
        ns_core = 1e9 / per_core
        cycles = ns_core * a.ghz
        print(f"{size:>6} {size + WIRE_OVERHEAD_BYTES:>8} {pps / 1e6:>9.2f} Mpps {ns:>8.2f} | "
              f"{per_core / 1e6:>9.2f} Mpps {ns_core:>8.1f} {cycles:>11.0f}")
    pps = line_rate_pps(gbps, a.pkt) * a.util
    cycles = 1e9 / (pps / a.cores) * a.ghz
    print()
    print("reading the budget (per packet, per core):")
    print(f"  {cycles:.0f} cycles. One DRAM access is 60-100 ns ({60 * a.ghz:.0f}-{100 * a.ghz:.0f} cycles), "
          f"one LLC hit 10-20 ns, a syscall hundreds of ns, a contended cache line ~100 ns per bounce.")
    if cycles < 100 * a.ghz:
        print("  -> a single cache miss per packet already breaks the budget: everything the loop touches must be in cache (prefetch, per-lcore state, small tables).")
    elif cycles < 300 * a.ghz:
        print("  -> one or two cache misses per packet are affordable; a lock, an allocation or a copy per packet is not.")
    else:
        print("  -> comfortable per-packet budget; scaling across cores and queue/NUMA topology matter more than micro-tuning.")
    return 0


# --- mempool ----------------------------------------------------------------------------


def mempool_demand(ports: int, rxq: int, rxd: int, txq: int, txd: int, lcores: int,
                   burst: int, cache: int, stages: int, extra: int) -> dict:
    rx_desc = ports * rxq * rxd
    tx_desc = ports * txq * txd
    in_flight = lcores * burst * stages
    caches = lcores * cache
    total = rx_desc + tx_desc + in_flight + caches + extra
    return {"rx_descriptors": rx_desc, "tx_descriptors": tx_desc, "in_flight_bursts": in_flight,
            "lcore_caches": caches, "extra": extra, "demand": total}


def cmd_mempool(a: argparse.Namespace) -> int:
    d = mempool_demand(a.ports, a.rxq, a.rxd, a.txq, a.txd, a.lcores, a.burst, a.cache, a.stages, a.extra)
    print("mempool demand (objects that can be outstanding at once):")
    print(f"  RX descriptors   ports x rxq x rxd      = {a.ports} x {a.rxq} x {a.rxd} = {d['rx_descriptors']}")
    print(f"  TX descriptors   ports x txq x txd      = {a.ports} x {a.txq} x {a.txd} = {d['tx_descriptors']}  (the PMD frees TX mbufs lazily)")
    print(f"  in-flight bursts lcores x burst x stages = {a.lcores} x {a.burst} x {a.stages} = {d['in_flight_bursts']}")
    print(f"  lcore caches     lcores x cache_size    = {a.lcores} x {a.cache} = {d['lcore_caches']}")
    if a.extra:
        print(f"  extra (rings, reassembly, TX buffers, clones) = {d['extra']}")
    print(f"  demand = {d['demand']}")

    n = max(8192, round_up(d["demand"] * (1 + a.headroom), max(a.cache, 1)))
    print(f"recommended n = max(8192, demand x {1 + a.headroom:.2f} rounded up to a multiple of cache_size) = {n}")
    per_socket = "" if a.sockets == 1 else f" per socket ({a.sockets} sockets: one pool each, sized for the ports and lcores on that socket)"
    print(f"  create it with rte_pktmbuf_pool_create(name, {n}, {a.cache}, priv, data_room, socket_id){per_socket}")

    major, minor = version_tuple(a.dpdk)
    problems = []
    if a.cache > MEMPOOL_CACHE_MAX:
        problems.append(f"cache_size {a.cache} exceeds RTE_MEMPOOL_CACHE_MAX_SIZE ({MEMPOOL_CACHE_MAX}): rte_mempool_create fails with EINVAL")
    if (major, minor) >= (26, 7):
        if a.cache > n:
            problems.append(f"cache_size {a.cache} > n {n}: EINVAL in DPDK >= 26.07")
        note = ("DPDK >= 26.07: the effective cache equals the requested size (it used to be 1.5x). "
                "Lcores that only put or only get (RX-only or TX-only stages) should double their cache_size.")
    else:
        if a.cache > n / 1.5:
            problems.append(f"cache_size {a.cache} > n / 1.5 = {n / 1.5:.0f}: EINVAL in DPDK <= 25.11")
        if n % max(a.cache, 1):
            problems.append(f"n % cache_size != 0: the <= 25.11 API doc advises n to be a multiple of cache_size so no objects stay stranded in the pool")
        note = ("DPDK <= 25.11: cache_size must be <= RTE_MEMPOOL_CACHE_MAX_SIZE and <= n / 1.5; n % cache_size == 0 is advised. "
                "The effective cache is 1.5x the requested size.")
    print(f"constraints for DPDK {a.dpdk}: " + ("OK" if not problems else "PROBLEM"))
    for p in problems:
        print(f"  - {p}")
    print(f"  note: {note}")

    obj_bytes = MBUF_HEADER_BYTES + a.priv + a.data_room
    total_mib = n * obj_bytes / (1024 * 1024)
    print(f"memory: {n} x ({MBUF_HEADER_BYTES} header + {a.priv} priv + {a.data_room} data room) = {total_mib:.1f} MiB "
          f"-> {math.ceil(total_mib / 2)} x 2 MB hugepages or {math.ceil(total_mib / 1024)} x 1 GB page(s), on the pool's socket")
    print("remember: the pool size covers what is outstanding at once; undersizing shows up only at line rate as rx_nombuf.")
    return 0


# --- descriptors ------------------------------------------------------------------------


def cmd_descriptors(a: argparse.Namespace) -> int:
    rate_pps = a.rate * 1e6
    queues = a.cores * a.queues_per_core
    if a.rxd is not None:
        tolerated_us = a.rxd * queues / rate_pps * 1e6
        print(f"{a.rxd} RX descriptors on each of {queues} queue(s) absorb {a.rxd * queues} packets at once;")
        print(f"at {a.rate:g} Mpps offered that is a service gap of {tolerated_us:.1f} us before imissed starts climbing.")
        print("compare with: one burst's processing time, the longest interrupt or scheduler preemption on the core,")
        print("and the PMD's descriptor refill cadence (rx_free_thresh).")
        return 0
    if a.gap_us is None:
        raise SystemExit("give --gap-us (service gap to cover) or --rxd (depth to evaluate)")
    needed_total = rate_pps * a.gap_us * 1e-6
    per_queue = needed_total / queues
    rounded = next_pow2(per_queue)
    print("bandwidth-delay model (Arm Neoverse V2 DPDK analysis): descriptors = rate x service gap / queues")
    print(f"  {a.rate:g} Mpps x {a.gap_us:g} us / {queues} queue(s) = {per_queue:.0f} descriptors per queue -> round up to {rounded}")
    if rounded > 4096:
        print("  -> above 4096: deep rings cost cache (Arm measured system-cache evictions and falling throughput past ~8 queues x 1024);")
        print("     shorten the gap (core isolation, smaller bursts, fewer stages per core) or add cores/queues instead of descriptors.")
    elif rounded < 512:
        print("  -> small; the sample apps default to 1024 and the PMD's default_rxportconf is the floor to compare with.")
    print("verify with rte_eth_dev_adjust_nb_rx_tx_desc() against rx_desc_lim, then measure imissed at the target rate.")
    return 0


# --- self-test --------------------------------------------------------------------------


def self_test() -> int:
    ok = True

    def check(name: str, cond: bool) -> None:
        nonlocal ok
        print(f"  {'PASS' if cond else 'FAIL'} {name}")
        ok = ok and cond

    check("10G @ 64 B = 14.88 Mpps", abs(line_rate_pps(10, 64) / 1e6 - 14.880952) < 1e-3)
    check("100G @ 64 B = 148.81 Mpps", abs(line_rate_pps(100, 64) / 1e6 - 148.809524) < 1e-3)
    check("25G @ 1518 B = 2.03 Mpps", abs(line_rate_pps(25, 1518) / 1e6 - 2.031524) < 1e-3)
    check("parse_link accepts 100G / 25g / 400", parse_link("100G") == 100 and parse_link("25g") == 25 and parse_link("400") == 400)
    d = mempool_demand(2, 4, 1024, 4, 1024, 4, 32, 256, 1, 0)
    check("mempool demand 2 ports x 4 q x 1024 rx/tx + 4 lcores", d["demand"] == 2 * 4 * 1024 * 2 + 4 * 32 + 4 * 256)
    check("next_pow2", next_pow2(1000) == 1024 and next_pow2(1024) == 1024 and next_pow2(1025) == 2048)
    check("round_up", round_up(1000, 256) == 1024 and round_up(1024, 256) == 1024)
    print("self-test PASS" if ok else "self-test FAIL")
    return 0 if ok else 2


# --- main -------------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="DPDK sizing calculators: budget, mempool, descriptors.")
    parser.add_argument("--self-test", action="store_true", help="run built-in checks and exit")
    sub = parser.add_subparsers(dest="command")

    b = sub.add_parser("budget", help="cycles per packet per core at a link speed and frame size")
    b.add_argument("--link", required=True, help="link speed, e.g. 10G, 25G, 100G, 400G")
    b.add_argument("--pkt", type=int, default=64, help="frame size in bytes without preamble/IFG (default 64)")
    b.add_argument("--ghz", type=float, default=3.0, help="core clock in GHz (default 3.0)")
    b.add_argument("--cores", type=int, default=1, help="dataplane cores sharing the load (default 1)")
    b.add_argument("--util", type=float, default=1.0, help="fraction of line rate targeted (default 1.0)")
    b.add_argument("--table", action="store_true", help="print the standard frame sizes too")

    m = sub.add_parser("mempool", help="mbuf pool demand from the port/queue/lcore shape")
    m.add_argument("--ports", type=int, required=True)
    m.add_argument("--rxq", type=int, required=True, help="RX queues per port")
    m.add_argument("--rxd", type=int, required=True, help="RX descriptors per queue")
    m.add_argument("--txq", type=int, required=True, help="TX queues per port")
    m.add_argument("--txd", type=int, required=True, help="TX descriptors per queue")
    m.add_argument("--lcores", type=int, required=True, help="dataplane lcores using the pool")
    m.add_argument("--burst", type=int, default=32)
    m.add_argument("--cache", type=int, default=256, help="per-lcore mempool cache_size (default 256)")
    m.add_argument("--stages", type=int, default=1, help="bursts a lcore can hold at once (pipeline stages, default 1)")
    m.add_argument("--extra", type=int, default=0, help="objects held elsewhere: rings, reassembly, TX buffers, clones")
    m.add_argument("--headroom", type=float, default=0.2, help="safety margin over the demand (default 0.2)")
    m.add_argument("--sockets", type=int, default=1, help="NUMA sockets the ports/lcores span (default 1)")
    m.add_argument("--dpdk", default="25.11", help="DPDK version whose cache_size rules apply (default 25.11)")
    m.add_argument("--priv", type=int, default=0, help="per-mbuf private area in bytes")
    m.add_argument("--data-room", type=int, default=DEFAULT_DATAROOM, help=f"data room incl. headroom (default {DEFAULT_DATAROOM})")

    d = sub.add_parser("descriptors", help="RX descriptor depth from the bandwidth-delay model")
    d.add_argument("--rate", type=float, required=True, help="offered packet rate in Mpps (total across queues)")
    d.add_argument("--cores", type=int, required=True, help="dataplane cores polling")
    d.add_argument("--queues-per-core", type=int, default=1)
    d.add_argument("--gap-us", type=float, default=None, help="service gap to cover, in microseconds")
    d.add_argument("--rxd", type=int, default=None, help="evaluate an existing depth: how long a gap it tolerates")

    a = parser.parse_args(argv)
    if a.self_test:
        return self_test()
    if a.command == "budget":
        return cmd_budget(a)
    if a.command == "mempool":
        return cmd_mempool(a)
    if a.command == "descriptors":
        return cmd_descriptors(a)
    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
