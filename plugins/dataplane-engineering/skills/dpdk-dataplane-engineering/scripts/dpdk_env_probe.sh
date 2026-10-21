#!/bin/sh
# Read-only probe of a Linux host for DPDK dataplane work.
# Prints the facts the tuning ladder asks for (references/tuning-methodology.md) and changes
# nothing: no writes, no module loads, no binding. Every section degrades to "n/a" when a tool
# or a sysfs path is missing. POSIX sh; run as any user (some lspci details need root).
#
#   sh dpdk_env_probe.sh [--brief]

set -u

brief=0
[ "${1:-}" = "--brief" ] && brief=1

have() { command -v "$1" >/dev/null 2>&1; }
hdr() { printf '\n== %s ==\n' "$1"; }
kv() { printf '%-28s %s\n' "$1" "$2"; }
cat_or_na() { if [ -r "$1" ]; then tr '\n' ' ' < "$1"; else printf 'n/a'; fi; }

if [ ! -d /sys/devices/system ] || [ ! -r /proc/cmdline ]; then
	echo "This probe reads Linux sysfs/procfs; nothing to inspect on this host ($(uname -s 2>/dev/null || echo unknown))."
	exit 0
fi

hdr "Kernel"
kv "kernel" "$(uname -r)"
cmdline=$(cat /proc/cmdline)
kv "cmdline" "$cmdline"
for key in isolcpus nohz_full rcu_nocbs irqaffinity default_hugepagesz hugepagesz hugepages intel_iommu amd_iommu iommu iommu.passthrough intel_pstate amd_pstate processor.max_cstate intel_idle.max_cstate idle pcie_aspm; do
	val=$(printf '%s\n' "$cmdline" | tr ' ' '\n' | grep "^$key=" | head -1 | cut -d= -f2-)
	[ -n "$val" ] && kv "  $key" "$val"
done
kv "isolated cpus (sysfs)" "$(cat_or_na /sys/devices/system/cpu/isolated)"
kv "nohz_full cpus (sysfs)" "$(cat_or_na /sys/devices/system/cpu/nohz_full)"
kv "numa_balancing" "$(cat_or_na /proc/sys/kernel/numa_balancing)"
kv "perf_event_paranoid" "$(cat_or_na /proc/sys/kernel/perf_event_paranoid)"

hdr "CPU"
if have lscpu; then
	lscpu | grep -E '^(Model name|Architecture|Socket\(s\)|Core\(s\) per socket|Thread\(s\) per core|NUMA node\(s\)|NUMA node[0-9]+ CPU|CPU max MHz|CPU MHz|L3 cache|Flags)' | sed 's/  */ /g' | while IFS= read -r line; do
		case "$line" in
			Flags*) printf '%-28s %s\n' "flags of interest" "$(printf '%s' "$line" | tr ' ' '\n' | grep -E '^(avx2|avx512f|avx512bw|waitpkg|rtm|pdpe1gb|pse|sve|sve2)$' | tr '\n' ' ')" ;;
			*) kv "$(printf '%s' "$line" | cut -d: -f1)" "$(printf '%s' "$line" | cut -d: -f2- | sed 's/^ *//')" ;;
		esac
	done
else
	kv "lscpu" "n/a"
fi
gov_dir=/sys/devices/system/cpu/cpu0/cpufreq
if [ -d "$gov_dir" ]; then
	kv "governor (cpu0)" "$(cat_or_na $gov_dir/scaling_governor)"
	kv "scaling driver" "$(cat_or_na $gov_dir/scaling_driver)"
	kv "distinct governors" "$(cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor 2>/dev/null | sort | uniq -c | tr '\n' ';')"
else
	kv "cpufreq" "n/a (no cpufreq sysfs; VM or fixed frequency)"
fi
kv "idle driver" "$(cat_or_na /sys/devices/system/cpu/cpuidle/current_driver)"
if have pgrep; then
	if pgrep -x irqbalance >/dev/null 2>&1; then kv "irqbalance" "running (ban the dataplane cores or stop it)"; else kv "irqbalance" "not running"; fi
fi

hdr "Hugepages"
grep -E 'Huge|MemTotal' /proc/meminfo 2>/dev/null | sed 's/  */ /g' | while IFS= read -r line; do
	kv "$(printf '%s' "$line" | cut -d: -f1)" "$(printf '%s' "$line" | cut -d: -f2- | sed 's/^ *//')"
done
for node in /sys/devices/system/node/node[0-9]*; do
	[ -d "$node" ] || continue
	n=$(basename "$node")
	for hp in "$node"/hugepages/hugepages-*; do
		[ -d "$hp" ] || continue
		size=$(basename "$hp" | sed 's/hugepages-//')
		kv "  $n $size" "total $(cat_or_na "$hp/nr_hugepages") free $(cat_or_na "$hp/free_hugepages")"
	done
done
kv "hugetlbfs mounts" "$(grep hugetlbfs /proc/mounts 2>/dev/null | awk '{print $2 "(" $4 ")"}' | tr '\n' ' ')"
kv "THP enabled" "$(cat_or_na /sys/kernel/mm/transparent_hugepage/enabled)"
kv "memlock limit (ulimit -l)" "$(ulimit -l 2>/dev/null || echo n/a)"

hdr "IOMMU / VFIO"
groups=$(ls /sys/kernel/iommu_groups 2>/dev/null | wc -l | tr -d ' ')
kv "iommu groups" "$groups $( [ "$groups" -gt 0 ] 2>/dev/null && echo '(IOMMU on: IOVA-as-VA expected)' || echo '(none: IOMMU off, or a VM without vIOMMU)')"
if [ -r /proc/modules ]; then
	kv "vfio modules" "$(grep -E '^(vfio|vfio_pci|vfio_iommu_type1|uio|uio_pci_generic|igb_uio|uio_hv_generic)' /proc/modules 2>/dev/null | cut -d' ' -f1 | tr '\n' ' ')"
fi
kv "vfio noiommu mode" "$(cat_or_na /sys/module/vfio/parameters/enable_unsafe_noiommu_mode)"
kv "vfio dma_entry_limit" "$(cat_or_na /sys/module/vfio_iommu_type1/parameters/dma_entry_limit)"
[ -d /dev/vfio ] && kv "/dev/vfio" "$(ls -l /dev/vfio 2>/dev/null | tail -n +2 | awk '{print $1, $3, $4, $NF}' | tr '\n' ';')"

hdr "Network devices (PCI class 0x02xx)"
found=0
for dev in /sys/bus/pci/devices/*; do
	[ -r "$dev/class" ] || continue
	class=$(cat "$dev/class")
	case "$class" in 0x02*) ;; *) continue ;; esac
	found=1
	bdf=$(basename "$dev")
	vendor=$(cat_or_na "$dev/vendor"); device=$(cat_or_na "$dev/device")
	driver=$(basename "$(readlink "$dev/driver" 2>/dev/null)" 2>/dev/null); [ -z "$driver" ] && driver="(unbound)"
	numa=$(cat_or_na "$dev/numa_node")
	ifaces=$(ls "$dev/net" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
	group=$(basename "$(readlink "$dev/iommu_group" 2>/dev/null)" 2>/dev/null)
	link="n/a"
	if have lspci; then
		link=$(lspci -s "$bdf" -vv 2>/dev/null | grep -E 'LnkSta:' | head -1 | sed 's/^[ \t]*//')
		[ -z "$link" ] && link="n/a (run as root for LnkSta)"
	fi
	printf '%s  %s:%s  driver=%s  numa_node=%s  iommu_group=%s  net=%s\n' "$bdf" "$vendor" "$device" "$driver" "$numa" "${group:-n/a}" "${ifaces:-none}"
	[ "$brief" = 1 ] || printf '    %s\n' "$link"
	if [ "$brief" = 0 ] && have ethtool && [ -n "$ifaces" ]; then
		for ifc in $(printf '%s' "$ifaces" | tr ',' ' '); do
			drv=$(ethtool -i "$ifc" 2>/dev/null | grep -E '^(driver|version|firmware-version):' | tr '\n' ' ')
			[ -n "$drv" ] && printf '    %s: %s\n' "$ifc" "$drv"
			pause=$(ethtool -a "$ifc" 2>/dev/null | grep -E '^(RX|TX):' | tr '\n' ' ')
			[ -n "$pause" ] && printf '    %s pause: %s\n' "$ifc" "$pause"
			chans=$(ethtool -l "$ifc" 2>/dev/null | grep -A4 'Current hardware settings' | grep -E '^Combined:' | tr '\n' ' ')
			[ -n "$chans" ] && printf '    %s channels: %s\n' "$ifc" "$chans"
		done
	fi
done
[ "$found" = 0 ] && echo "no PCI network devices visible (VM with vmbus/virtio only, or no permission)"
if [ -d /sys/bus/vmbus/devices ]; then
	kv "vmbus devices" "$(ls /sys/bus/vmbus/devices 2>/dev/null | wc -l | tr -d ' ') (Hyper-V/Azure: netvsc PMD path; see platforms-and-nics.md)"
fi

hdr "DPDK and tools"
if have pkg-config && pkg-config --exists libdpdk 2>/dev/null; then
	kv "libdpdk (pkg-config)" "$(pkg-config --modversion libdpdk)"
else
	kv "libdpdk (pkg-config)" "not found (DPDK not installed system-wide, or PKG_CONFIG_PATH unset)"
fi
for tool in dpdk-testpmd dpdk-devbind.py dpdk-hugepages.py dpdk-telemetry.py dpdk-pdump perf lstopo lstopo-no-graphics numactl numastat ethtool mlxconfig mst setpci cpupower tuned-adm; do
	if have "$tool"; then kv "$tool" "$(command -v "$tool")"; else kv "$tool" "missing"; fi
done

hdr "Summary of things to check against the methodology"
echo "- NIC numa_node vs the lcores you pass with -l, and hugepages reserved on that node"
echo "- isolcpus/nohz_full/rcu_nocbs cover the dataplane cores; irqbalance off or banned from them"
echo "- governor performance on dataplane cores; C-state policy decided on purpose"
echo "- IOMMU on with iommu=pt (vfio-pci), or a bifurcated driver (mlx5) with rdma-core"
echo "- link width/speed (LnkSta) matches the NIC; pause frames off unless required"
exit 0
