#!/usr/bin/env python3
"""Heuristic scanner for DPDK dataplane C/C++ code.

Reports review CANDIDATES, not verdicts. Every hit needs the surrounding code read, and the
absence of hits proves nothing. The rules mirror the anti-pattern table in SKILL.md and the
checklist in references/review-checklist.md.

Usage:
    python dpdk_static_scan.py <path> [<path> ...] [--fail-on error|warning|info|none]
    python dpdk_static_scan.py --self-test

Output: one line per hit, "SEVERITY path:line [rule] message", then a summary line.
Exit codes: 0 scanned (and the --fail-on threshold was not reached), 1 threshold reached,
2 usage error or self-test failure. Standard library only; no file is modified.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

SOURCE_SUFFIXES = {".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".hh", ".hxx"}
# How far past an rte_eth_rx_burst() call still counts as "the RX processing window" when the
# enclosing block does not close earlier. Generous on purpose: the goal is recall.
RX_WINDOW_CHARS = 4000
SEVERITY_RANK = {"error": 3, "warning": 2, "info": 1}


@dataclass(frozen=True)
class Issue:
    severity: str
    path: Path
    line: int
    rule: str
    message: str


# --- text helpers -----------------------------------------------------------------------


def iter_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file() and child.suffix.lower() in SOURCE_SUFFIXES:
                    files.append(child)
    return files


def read_text(path: Path) -> str | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if b"\0" in data[:4096]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1", errors="replace")


def strip_comments_and_strings(text: str) -> str:
    """Blank out comments and string/char literals, preserving length and newlines.

    Offsets and line numbers stay valid, and format strings ("%d"), commented-out code and
    the word "memcpy" inside a log message stop producing hits.
    """
    out: list[str] = []
    i, n = 0, len(text)
    state = "code"
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if state == "code":
            if c == "/" and nxt == "*":
                state, i = "block", i + 2
                out.append("  ")
                continue
            if c == "/" and nxt == "/":
                state, i = "line", i + 2
                out.append("  ")
                continue
            if c == '"':
                state = "str"
            elif c == "'":
                state = "chr"
            out.append(c)
            i += 1
            continue
        if state == "block":
            if c == "*" and nxt == "/":
                state, i = "code", i + 2
                out.append("  ")
                continue
            out.append("\n" if c == "\n" else " ")
            i += 1
            continue
        if state == "line":
            if c == "\n":
                state = "code"
                out.append("\n")
            else:
                out.append(" ")
            i += 1
            continue
        # string or char literal
        if c == "\\":
            out.append("  " if nxt != "\n" else " \n")
            i += 2
            continue
        if (state == "str" and c == '"') or (state == "chr" and c == "'"):
            state = "code"
            out.append(c)
        else:
            out.append("\n" if c == "\n" else " ")
        i += 1
    return "".join(out)


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def split_args(argstr: str) -> list[str]:
    args: list[str] = []
    depth = 0
    current: list[str] = []
    for ch in argstr:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    tail = "".join(current).strip()
    if tail or args:
        args.append(tail)
    return args


def find_calls(code: str, name: str):
    """Yield (offset, args) for every call of `name` with balanced parentheses."""
    for m in re.finditer(r"\b" + re.escape(name) + r"\s*\(", code):
        start = m.end()
        depth, i = 1, start
        while i < len(code) and depth:
            if code[i] == "(":
                depth += 1
            elif code[i] == ")":
                depth -= 1
            i += 1
        if depth:
            return
        yield m.start(), split_args(code[start : i - 1])


def rx_windows(code: str):
    """Yield (start, end) spans that begin at an rte_eth_rx_burst() call and end where the
    enclosing block closes or after RX_WINDOW_CHARS, whichever comes first."""
    for m in re.finditer(r"\brte_eth_rx_burst\s*\(", code):
        start = m.start()
        end = min(len(code), start + RX_WINDOW_CHARS)
        depth, i = 0, start
        while i < end:
            ch = code[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth < 0:
                    break
            i += 1
        yield start, i


def resolve_int(token: str, text: str) -> int | None:
    token = token.strip()
    if re.fullmatch(r"\d+[uUlL]*", token):
        return int(re.match(r"\d+", token).group(0))
    if re.fullmatch(r"[A-Za-z_]\w*", token):
        m = re.search(r"#\s*define\s+" + re.escape(token) + r"\s+\(?\s*(\d+)", text)
        if m:
            return int(m.group(1))
    return None


# --- rules ------------------------------------------------------------------------------

WINDOW_RULES = [
    (
        "warning",
        "alloc-in-rx-window",
        r"\b(rte_pktmbuf_alloc|rte_pktmbuf_alloc_bulk|rte_mempool_get|rte_mempool_get_bulk|rte_malloc|rte_zmalloc|rte_malloc_socket|rte_zmalloc_socket|malloc|calloc|realloc)\s*\(",
        "allocation inside the RX processing window: per-packet allocation, or a copy pipeline? RX already handed over owned mbufs",
    ),
    (
        "warning",
        "copy-in-rx-window",
        r"\b(memcpy|rte_memcpy|rte_pktmbuf_copy)\s*\(",
        "packet copy inside the RX processing window: forward the RX mbuf itself unless the packet really goes two places",
    ),
    (
        "warning",
        "print-in-rx-window",
        r"\b(printf|fprintf|puts|fputs|RTE_LOG|rte_log|syslog|fflush)\s*\(",
        "logging/printing inside the RX processing window: syscall and formatting in the per-packet budget; use per-lcore counters and a reporting thread",
    ),
    (
        "warning",
        "lock-in-rx-window",
        r"\b(rte_spinlock_lock|rte_spinlock_trylock|rte_spinlock_recursive_lock|pthread_mutex_lock|pthread_spin_lock|rte_rwlock_read_lock|rte_rwlock_write_lock|rte_atomic(?:16|32|64)_(?:inc|dec|add|sub|add_return|sub_return|cmpset|exchange)|__atomic_(?:fetch_add|add_fetch|fetch_sub|sub_fetch|exchange_n|compare_exchange_n)|atomic_fetch_(?:add|sub)(?:_explicit)?|rte_atomic_fetch_(?:add|sub)_explicit)\s*\(",
        "lock or read-modify-write atomic inside the RX processing window: shared state on the hot path serialises cores; make it per-lcore",
    ),
    (
        "warning",
        "sleep-in-rx-window",
        r"\b(usleep|nanosleep|sched_yield|sleep|rte_delay_us|rte_delay_ms|rte_delay_us_block|rte_delay_us_sleep)\s*\(",
        "sleep/yield inside the poll loop: latency spikes and cold caches; use PMD power management or interrupt mode instead",
    ),
    (
        "info",
        "division-in-rx-window",
        r"(?<![/*])/(?![/*])\s*[A-Za-z_(]|%\s*[A-Za-z_(]",
        "integer division or modulo by a non-constant near the hot path (20-90 cycles): power-of-two sizes and masks if this is per packet",
    ),
]

DEPRECATED_RULES = [
    (
        "error",
        "removed-api",
        r"\brte_kni\w*",
        "KNI was removed in DPDK 23.11; use virtio-user or the tap PMD",
    ),
    (
        "warning",
        "removed-api",
        r"(?:\.|->)q_(?:ipackets|opackets|ibytes|obytes|errors)\b|\bRTE_ETHDEV_QUEUE_STAT_CNTRS\b",
        "per-queue fields of struct rte_eth_stats were removed in DPDK 25.11; read per-queue counters through xstats (rx_qN_packets)",
    ),
    (
        "info",
        "deprecated-api",
        r"\brte_atomic(?:16|32|64)_\w+",
        "legacy rte_atomicNN_* API is deprecated; use C11 <stdatomic.h> or rte_atomic_*_explicit from rte_stdatomic.h",
    ),
    (
        "info",
        "deprecated-api",
        r"\b(?:rte_get_master_lcore|RTE_LCORE_FOREACH_SLAVE|SKIP_MASTER|rte_eal_mp_wait_lcore_slave|CALL_MASTER)\b",
        "master/slave lcore naming was replaced by main/worker in DPDK 20.11 (rte_get_main_lcore, RTE_LCORE_FOREACH_WORKER, SKIP_MAIN)",
    ),
    (
        "info",
        "deprecated-api",
        r"(?<![A-Za-z0-9_])(?:PKT_RX_|PKT_TX_|DEV_RX_OFFLOAD_|DEV_TX_OFFLOAD_|ETH_RSS_|ETH_LINK_SPEED_|ETH_MQ_RX_|ETH_TXQ_FLAGS_)\w+",
        "pre-21.11 macro names; the current names carry the RTE_ prefix (RTE_MBUF_F_RX_*, RTE_ETH_RX_OFFLOAD_*, RTE_ETH_RSS_*)",
    ),
]


def scan_source(path: Path, text: str) -> list[Issue]:
    issues: list[Issue] = []
    seen: set[tuple[str, int]] = set()
    code = strip_comments_and_strings(text)

    def add(severity: str, offset: int, rule: str, message: str) -> None:
        line = line_of(code, offset)
        if (rule, line) in seen:
            return
        seen.add((rule, line))
        issues.append(Issue(severity, path, line, rule, message))

    # 1. RX burst size.
    for offset, args in find_calls(code, "rte_eth_rx_burst"):
        if len(args) < 4:
            continue
        value = resolve_int(args[3], text)
        if value is None:
            continue
        if value < 8:
            add("warning", offset, "rx-burst-size",
                f"RX burst of {value}: no amortisation of the per-call cost and no vector RX path; burst 32-64 into an array")
        elif value % 8:
            add("info", offset, "rx-burst-size",
                f"RX burst of {value} is not a multiple of 8; some vector PMDs need that")

    # 2. Things inside the RX processing window.
    for start, end in rx_windows(code):
        window = code[start:end]
        for severity, rule, pattern, message in WINDOW_RULES:
            for m in re.finditer(pattern, window):
                add(severity, start + m.start(), rule, message)

    # 3. tx_burst return value discarded, or unsent remainder never freed.
    for m in re.finditer(r"(?m)^[ \t]*(?:\(void\)\s*)?rte_eth_tx_burst\s*\(", code):
        add("error", m.start(), "tx-burst-return-ignored",
            "rte_eth_tx_burst() return value ignored: the driver owns only the packets it reports sent; every unsent mbuf leaks until rx_nombuf climbs under load")
    for m in re.finditer(r"\brte_eth_tx_burst\s*\(", code):
        block_end = m.end()
        depth = 0
        while block_end < len(code) and block_end < m.end() + 1500:
            ch = code[block_end]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth < 0:
                    break
            block_end += 1
        after = code[m.end() : block_end]
        if not re.search(r"\brte_pktmbuf_free(?:_bulk|_seg)?\s*\(|\brte_eth_tx_buffer|\brte_mempool_put", after):
            add("info", m.start(), "tx-unsent-not-freed",
                "no rte_pktmbuf_free() after this rte_eth_tx_burst() in the same block: confirm the unsent remainder (pkts[sent..n-1]) is freed or retried")

    # 4. Mempool and queue setup arguments.
    pool_calls = [
        ("rte_pktmbuf_pool_create", 2, 5),
        ("rte_pktmbuf_pool_create_by_ops", 2, 5),
        ("rte_mempool_create", 3, 9),
    ]
    for name, cache_idx, socket_idx in pool_calls:
        for offset, args in find_calls(code, name):
            if len(args) > cache_idx and re.fullmatch(r"0[uUlL]*", args[cache_idx]):
                add("warning", offset, "mempool-cache-zero",
                    f"{name}() with cache_size 0: every alloc/free becomes a CAS on the shared ring; use 256-512 on dataplane pools")
            if len(args) > socket_idx:
                sock = args[socket_idx]
                if re.fullmatch(r"0[uUlL]*", sock):
                    add("warning", offset, "hardcoded-socket-0",
                        f"{name}() on socket 0 literally: remote-socket memory for every core on another socket; use rte_eth_dev_socket_id()/rte_lcore_to_socket_id()")
                elif "SOCKET_ID_ANY" in sock:
                    add("info", offset, "socket-id-any",
                        f"{name}() with SOCKET_ID_ANY: fine on one socket, silently remote on a multi-socket box")
    for name in ("rte_eth_rx_queue_setup", "rte_eth_tx_queue_setup"):
        for offset, args in find_calls(code, name):
            if len(args) > 3 and re.fullmatch(r"0[uUlL]*", args[3]):
                add("warning", offset, "hardcoded-socket-0",
                    f"{name}() with socket_id 0 literally; use rte_eth_dev_socket_id(port)")

    # 5. Unchecked mbuf manipulation and allocation results.
    for m in re.finditer(r"(?m)^[ \t]*(?:\(void\)\s*)?rte_pktmbuf_(append|prepend|adj|trim)\s*\(", code):
        add("warning", m.start(), "unchecked-pktmbuf-op",
            f"rte_pktmbuf_{m.group(1)}() result ignored: it returns NULL/-1 when there is not enough room, without modifying the mbuf")
    for m in re.finditer(r"\b([A-Za-z_]\w*)\s*=\s*rte_pktmbuf_(append|prepend|adj|alloc|clone|copy)\s*\(", code):
        ident, fn = m.group(1), m.group(2)
        following = code[m.end() : m.end() + 400]
        checked = re.search(
            r"\bif\s*\(\s*(?:unlikely\s*\(\s*)?!?\s*" + re.escape(ident) + r"\b|\b" + re.escape(ident) + r"\s*[!=]=\s*NULL\b|\bNULL\s*[!=]=\s*" + re.escape(ident) + r"\b",
            following,
        )
        if not checked:
            rule = "unchecked-alloc" if fn in ("alloc", "clone", "copy") else "unchecked-pktmbuf-op"
            what = "NULL when the pool is empty (or rx_nombuf-style exhaustion under load)" if fn in ("alloc", "clone", "copy") else "NULL when there is not enough room"
            add("warning", m.start(), rule,
                f"'{ident}' from rte_pktmbuf_{fn}() is used without a NULL check: it returns {what}")

    # 6. Queue id derived from the lcore id, directly or through a local copy.
    lcore_aliases = {m.group(1) for m in re.finditer(r"\b([A-Za-z_]\w*)\s*=\s*rte_lcore_id\s*\(\s*\)", code)}
    alias_re = "|".join(re.escape(a) for a in sorted(lcore_aliases)) if lcore_aliases else None
    patterns = [r"rte_lcore_id\s*\(\s*\)\s*%", r"\bqueue\w*\s*=\s*\(?\s*(?:\(\s*uint16_t\s*\)\s*)?rte_lcore_id\s*\(\s*\)"]
    if alias_re:
        patterns.append(r"\bqueue\w*\s*=\s*\(?\s*(?:\(\s*uint16_t\s*\)\s*)?(?:" + alias_re + r")\b\s*(?:%|[;)])")
    for pattern in patterns:
        for m in re.finditer(pattern, code):
            add("warning", m.start(), "queue-from-lcore-id",
                "queue id derived from rte_lcore_id(): lcore ids depend on the core list and are neither dense nor sequential; two lcores can end up polling one queue")

    # 7. Loop flag that is a plain variable.
    for m in re.finditer(r"\bwhile\s*\(\s*!?\s*([A-Za-z_]\w*)\s*\)", code):
        ident = m.group(1)
        decl = re.search(
            r"(?m)^[ \t]*((?:static\s+)?(?:volatile\s+)?(?:_Atomic\s+)?(?:const\s+)?(?:bool|_Bool|int|unsigned|unsigned int|uint8_t|uint16_t|uint32_t|uint64_t|sig_atomic_t|atomic_bool|atomic_int|atomic_uint|RTE_ATOMIC\([^)]*\))\s+(?:volatile\s+)?"
            + re.escape(ident)
            + r"\b)",
            code,
        )
        if not decl:
            continue
        decl_text = decl.group(1)
        if re.search(r"_Atomic|atomic_|RTE_ATOMIC\(", decl_text):
            continue
        if "volatile" in decl_text:
            add("info", m.start(), "stop-flag-volatile",
                f"loop flag '{ident}' is volatile: volatile is not synchronisation; a C11 atomic with relaxed ordering costs the same and is correct")
        else:
            add("warning", m.start(), "stop-flag-not-atomic",
                f"loop flag '{ident}' is a plain variable: the compiler may hoist the load out of the loop, and it is a data race; use a C11 atomic flag")

    # 8. Lifecycle hints (per file).
    if re.search(r"\brte_eal_init\s*\(", code):
        if not re.search(r"\brte_eal_cleanup\s*\(", code):
            add("info", 0, "eal-lifecycle", "rte_eal_init() without rte_eal_cleanup(): hugepage files and device state are left behind on exit")
        if not re.search(r"\bargc\s*-=", code):
            add("info", 0, "eal-lifecycle", "argc/argv are not shifted by rte_eal_init()'s return value: application options after '--' are parsed from the wrong offset")
    if re.search(r"\brte_eth_dev_start\s*\(", code):
        if not re.search(r"\brte_eth_dev_stop\s*\(", code) or not re.search(r"\brte_eth_dev_close\s*\(", code):
            add("info", 0, "eal-lifecycle", "rte_eth_dev_start() without matching rte_eth_dev_stop()/rte_eth_dev_close(): the NIC is left in a state that can break the next run (bifurcated drivers especially)")

    # 9. Per-lcore arrays without cache alignment.
    if re.search(r"\[\s*RTE_MAX_LCORE\s*\]", code) and not re.search(r"__rte_cache_aligned|RTE_CACHE_GUARD|alignas\s*\(|__rte_aligned\s*\(", code):
        m = re.search(r"\[\s*RTE_MAX_LCORE\s*\]", code)
        add("info", m.start(), "shared-stats-array",
            "per-lcore array without cache-line alignment or RTE_CACHE_GUARD: adjacent lcores share cache lines (false sharing)")

    # 10. Hardcoded offload masks without a capability query.
    if re.search(r"\.offloads\s*\|?=\s*RTE_ETH_(?:RX|TX)_OFFLOAD_", code) and not re.search(r"rte_eth_dev_info_get|offload_capa", code):
        m = re.search(r"\.offloads\s*\|?=\s*RTE_ETH_(?:RX|TX)_OFFLOAD_", code)
        add("info", m.start(), "offload-hardcoded",
            "offloads requested without consulting rte_eth_dev_info_get(): an unsupported offload fails configure, or knocks the PMD off its vector path")

    # 11. Deprecated and removed APIs.
    for severity, rule, pattern, message in DEPRECATED_RULES:
        for m in re.finditer(pattern, code):
            add(severity, m.start(), rule, message)

    return issues


# --- self-test --------------------------------------------------------------------------

BAD_SAMPLE = r"""
#include <rte_ethdev.h>
#include <rte_kni.h>
#define RX_BURST 1
static int running = 1;
struct stats { uint64_t rx, tx, drops; } stats[RTE_MAX_LCORE];
static rte_spinlock_t stats_lock;

static int fwd_loop(void *arg)
{
	uint16_t port = *(uint16_t *)arg;
	unsigned lcore = rte_lcore_id();
	uint16_t queue = lcore % 3;
	struct rte_mbuf *m;
	uint64_t cnt = 0;
	while (running) {
		uint16_t n = rte_eth_rx_burst(port, queue, &m, RX_BURST);
		if (n == 0)
			continue;
		struct rte_mbuf *copy = rte_pktmbuf_alloc(pool);
		char *dst = rte_pktmbuf_append(copy, m->pkt_len);
		memcpy(dst, rte_pktmbuf_mtod(m, void *), m->pkt_len);
		rte_pktmbuf_free(m);
		rte_spinlock_lock(&stats_lock);
		stats[lcore].rx++;
		rte_spinlock_unlock(&stats_lock);
		rte_eth_tx_burst(port ^ 1, queue, &copy, 1);
		if (cnt % stride == 0)
			printf("fwd %lu\n", cnt);
		rte_atomic64_inc(&global);
		usleep(1);
	}
	return 0;
}

int main(int argc, char **argv)
{
	int ret = rte_eal_init(argc, argv);
	struct rte_mempool *pool = rte_pktmbuf_pool_create("P", 8192, 0, 0, RTE_MBUF_DEFAULT_BUF_SIZE, 0);
	rte_eth_rx_queue_setup(0, 0, 1024, 0, NULL, pool);
	rte_eth_dev_start(0);
	printf("%d %s\n", stats[0].rx, "q_ipackets in a string must not fire");
	return s.q_ipackets;
}
"""

BAD_EXPECTED = {
    "rx-burst-size",
    "alloc-in-rx-window",
    "copy-in-rx-window",
    "print-in-rx-window",
    "lock-in-rx-window",
    "sleep-in-rx-window",
    "division-in-rx-window",
    "tx-burst-return-ignored",
    "mempool-cache-zero",
    "hardcoded-socket-0",
    "unchecked-pktmbuf-op",
    "unchecked-alloc",
    "queue-from-lcore-id",
    "stop-flag-not-atomic",
    "eal-lifecycle",
    "shared-stats-array",
    "deprecated-api",
    "removed-api",
}

GOOD_SAMPLE = r"""
#include <stdatomic.h>
#include <rte_ethdev.h>
#define BURST_SIZE 32
static atomic_bool force_quit;
struct __rte_cache_aligned worker_ctx {
	uint16_t port, rx_queue, tx_port, tx_queue;
	uint64_t rx, tx, tx_drop;
	RTE_CACHE_GUARD;
};
static int worker_main(void *arg)
{
	struct worker_ctx *ctx = arg;
	struct rte_mbuf *pkts[BURST_SIZE];
	while (!atomic_load_explicit(&force_quit, memory_order_relaxed)) {
		uint16_t nb_rx = rte_eth_rx_burst(ctx->port, ctx->rx_queue, pkts, BURST_SIZE);
		if (unlikely(nb_rx == 0))
			continue;
		ctx->rx += nb_rx;
		uint16_t nb_tx = rte_eth_tx_burst(ctx->tx_port, ctx->tx_queue, pkts, nb_rx);
		ctx->tx += nb_tx;
		if (unlikely(nb_tx < nb_rx)) {
			ctx->tx_drop += nb_rx - nb_tx;
			rte_pktmbuf_free_bulk(&pkts[nb_tx], nb_rx - nb_tx);
		}
	}
	return 0;
}
int main(int argc, char **argv)
{
	int ret = rte_eal_init(argc, argv);
	if (ret < 0)
		rte_exit(EXIT_FAILURE, "EAL init failed\n");
	argc -= ret;
	argv += ret;
	/* memcpy(a, b, n) in a comment must not fire */
	struct rte_eth_dev_info dev_info;
	rte_eth_dev_info_get(0, &dev_info);
	struct rte_mempool *pool = rte_pktmbuf_pool_create("P", 16384, 256, 0, RTE_MBUF_DEFAULT_BUF_SIZE, rte_eth_dev_socket_id(0));
	rte_eth_rx_queue_setup(0, 0, 1024, rte_eth_dev_socket_id(0), NULL, pool);
	rte_eth_dev_start(0);
	rte_eth_dev_stop(0);
	rte_eth_dev_close(0);
	rte_eal_cleanup();
	return 0;
}
"""


def self_test() -> int:
    bad = scan_source(Path("bad.c"), BAD_SAMPLE)
    good = scan_source(Path("good.c"), GOOD_SAMPLE)
    bad_rules = {i.rule for i in bad}
    missing = BAD_EXPECTED - bad_rules
    unexpected_good = [i for i in good if i.severity != "info"]
    ok = not missing and not unexpected_good
    print(f"bad sample: {len(bad)} hits, rules {sorted(bad_rules)}")
    if missing:
        print(f"  MISSING expected rules: {sorted(missing)}")
    print(f"good sample: {len(good)} hits (warnings/errors: {len(unexpected_good)})")
    for issue in unexpected_good:
        print(f"  UNEXPECTED {issue.severity} line {issue.line} [{issue.rule}] {issue.message}")
    print("self-test PASS" if ok else "self-test FAIL")
    return 0 if ok else 2


# --- main -------------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Heuristic DPDK dataplane code scanner (candidates, not verdicts).")
    parser.add_argument("paths", nargs="*", type=Path, help="files or directories to scan")
    parser.add_argument("--fail-on", choices=["none", "error", "warning", "info"], default="none",
                        help="exit 1 when an issue at this severity or higher is found")
    parser.add_argument("--self-test", action="store_true", help="run the built-in samples and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()
    if not args.paths:
        parser.error("give at least one path, or --self-test")

    files = iter_files(args.paths)
    issues: list[Issue] = []
    for path in files:
        text = read_text(path)
        if text is None:
            continue
        issues.extend(scan_source(path, text))

    for issue in sorted(issues, key=lambda i: (i.path.as_posix(), i.line, -SEVERITY_RANK[i.severity])):
        print(f"{issue.severity.upper()} {issue.path.as_posix()}:{issue.line} [{issue.rule}] {issue.message}")
    counts = {s: sum(1 for i in issues if i.severity == s) for s in SEVERITY_RANK}
    print(f"Scanned {len(files)} files; {len(issues)} candidates "
          f"({counts['error']} error, {counts['warning']} warning, {counts['info']} info). "
          "Read the code around each hit before reporting it.")

    if args.fail_on == "none":
        return 0
    threshold = SEVERITY_RANK[args.fail_on]
    return 1 if any(SEVERITY_RANK[i.severity] >= threshold for i in issues) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
