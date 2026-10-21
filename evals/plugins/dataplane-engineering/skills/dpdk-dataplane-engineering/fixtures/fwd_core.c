/* fwd_core.c - forwarding worker for the packet appliance (DPDK 24.11, E810 100G, 2-socket Xeon) */
#include <stdio.h>
#include <string.h>
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>
#include <rte_mempool.h>
#include <rte_lcore.h>
#include <rte_spinlock.h>
#include <rte_atomic.h>

#define NB_MBUF      8192
#define NB_RXD       1024
#define NB_TXD       1024
#define NB_QUEUES    3
#define STATS_STRIDE 100000

struct app_stats {
	uint64_t rx_pkts;
	uint64_t tx_pkts;
	uint64_t drops;
};

static struct app_stats stats[RTE_MAX_LCORE];
static rte_spinlock_t stats_lock = RTE_SPINLOCK_INITIALIZER;
static rte_atomic64_t total_pkts;
static int running = 1;
static struct rte_mempool *pool;

int app_mempool_init(void)
{
	pool = rte_pktmbuf_pool_create("fwd_pool", NB_MBUF, 0, 0,
				       RTE_MBUF_DEFAULT_BUF_SIZE, 0);
	return pool == NULL ? -1 : 0;
}

static void process_headers(struct rte_mbuf *m)
{
	struct rte_ether_hdr *eth = rte_pktmbuf_mtod(m, struct rte_ether_hdr *);
	struct rte_ether_addr tmp = eth->src_addr;
	eth->src_addr = eth->dst_addr;
	eth->dst_addr = tmp;
}

int fwd_loop(void *arg)
{
	uint16_t port = *(uint16_t *)arg;
	unsigned lcore = rte_lcore_id();
	uint16_t queue = lcore % NB_QUEUES;
	struct rte_mbuf *m;
	uint64_t count = 0;

	while (running) {
		uint16_t nb_rx = rte_eth_rx_burst(port, queue, &m, 1);
		if (nb_rx == 0)
			continue;

		/* copy the packet so we own it cleanly */
		struct rte_mbuf *copy = rte_pktmbuf_alloc(pool);
		char *dst = rte_pktmbuf_append(copy, m->pkt_len);
		memcpy(dst, rte_pktmbuf_mtod(m, void *), m->pkt_len);
		rte_pktmbuf_free(m);

		process_headers(copy);

		rte_spinlock_lock(&stats_lock);
		stats[lcore].rx_pkts++;
		rte_spinlock_unlock(&stats_lock);
		rte_atomic64_inc(&total_pkts);

		uint16_t sent = rte_eth_tx_burst(port ^ 1, queue, &copy, 1);
		if (sent == 0)
			stats[lcore].drops++;
		else
			stats[lcore].tx_pkts++;

		count++;
		if (count % STATS_STRIDE == 0)
			printf("lcore %u: %lu packets\n", lcore, count);
	}
	return 0;
}

void app_print_stats(uint16_t port)
{
	struct rte_eth_stats st;
	rte_eth_stats_get(port, &st);
	for (int q = 0; q < NB_QUEUES; q++)
		printf("q%d: %lu\n", q, st.q_ipackets[q]);
}

void app_stop(void)
{
	running = 0;
}
