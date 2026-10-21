import type { WorkflowCase } from "../../../../src/index.js";

/**
 * Trigger (activation) suite for dataplane-engineering:dpdk-dataplane-engineering. Workflow tier:
 * each case runs in the assembled workspace (src/workspace.ts) and asserts whether THIS skill
 * engages (a Skill call or its SKILL.md read). The positive is `indicative` (a model may do the
 * work inline — logged, not blocking); a false activation on a near-miss negative is a hard
 * failure.
 *
 * The description names the near-misses it must stay out of (eBPF/XDP programs, kernel
 * network-stack tuning, packet-capture analysis, P4, lock-free code with no NIC, OVS/VM config
 * without DPDK code). The two negatives below are drawn from that list and share vocabulary with
 * the positive (packets, drops, line rate, NIC, cores), so a trigger that fires on them is
 * keyword-matching rather than recognising the DPDK scope.
 *
 * Remember the lesson recorded in security.activation.cases.ts before reading a red here: the
 * default EVAL_MODEL cannot perform skill selection for broad subjects, and EVAL_ACTIVATION_MODEL
 * (sonnet) is where this tier is measured.
 */
export const activationCases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "dpdk-dataplane-engineering engages on an rx_burst-returns-zero diagnosis",
    prompt:
      "Our rte_eth_rx_burst returns 0 most of the time even though testpmd shows traffic " +
      "arriving on the port. DPDK 23.11, mlx5 on a ConnectX-6, the RX path is a plain " +
      "poll loop on one worker lcore. What should I check first?",
    skill: "dpdk-dataplane-engineering",
    shouldActivate: true,
    indicative: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    // Near-miss: packets, drops, line rate and a NIC are all present, but the user is writing an
    // eBPF/XDP program — explicitly out of scope in the description.
    name: "near-miss negative — an XDP/eBPF DDoS-drop program must NOT engage the DPDK skill",
    prompt:
      "Write an XDP program in eBPF that drops a DDoS flood as early as possible on our edge " +
      "servers (kernel 6.8, attach it with libbpf to the NIC). We need to keep up with line " +
      "rate on the 25G port without dropping legitimate packets.",
    skill: "dpdk-dataplane-engineering",
    shouldActivate: false,
    maxTurns: 4,
  },
  {
    kind: "activation",
    // Near-miss: drops under load, RX queues and IRQ affinity are kernel-stack tuning on an
    // ordinary server — named as out of scope in the description.
    name: "near-miss negative — kernel-stack sysctl tuning for nginx must NOT engage the DPDK skill",
    prompt:
      "Our nginx box drops connections under load and softirq is pegged on one core. Which Linux " +
      "sysctls should we tune (somaxconn, tcp_tw_reuse, netdev_max_backlog) and how do we spread " +
      "the NIC's RX queues and IRQs across cores?",
    skill: "dpdk-dataplane-engineering",
    shouldActivate: false,
    maxTurns: 4,
  },
];
