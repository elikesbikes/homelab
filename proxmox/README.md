Proxmox Server Architecture: emihpvproxmox4
Overview
A Dell PowerEdge R620 hypervisor running Proxmox VE 8.4 as part of a multi-node cluster, serving production Docker workloads with shared ZFS storage.

Architecture Patterns
1. Network Segmentation
vmbr0 (192.168.5.37/24): Management/Production bridge on eno1 with default gateway

vmbr1 (192.168.6.37/24): VLAN-aware bridge on eno2 (VLANs 2-4094) for VM isolation

Additional NICs: 6 ports available (Broadcom & Intel) for expansion/bonding

2. Storage Federation
Local: 371GB SSD LVM (96GB root, 8GB swap) for Proxmox OS

Shared: 1.8TB ZFS mirror (hpv1-ssd-zfs) across 4 cluster nodes for VM storage

Backup: Proxmox Backup Server configured but currently unreachable

3. Workload Distribution
Production (Running): 4 VMs (Docker hosts + NAS) with 32-50GB RAM each

Development (Stopped): 14 VMs ready for on-demand activation

Resource Strategy: Conservative memory allocation, no overcommitment

4. Cluster Design
Multi-node Proxmox cluster with shared ZFS storage

Live migration capability via shared storage

Storage defined across multiple nodes but active only where needed

Hardware & Software Stack
Hardware: Dell R620, Dual Xeon E5-2620v2 (24 cores), 94GB RAM, LSI RAID + Intel SATA

Software: Proxmox 8.4, Kernel 6.8, QEMU 9.2, LXC 6.0, ZFS 2.2

Capabilities: Full KVM virtualization, LXC containers, ZFS storage, cluster operations

Operational Characteristics
Memory: 37GB/94GB used (57GB available)

Storage: 66% of shared ZFS utilized

VMs: 4 running (production), 14 stopped (development/staging)

Network: Dual-bridge with VLAN capability, 8 total NICs

Key Design Decisions
Separation of Concerns: Management vs VM traffic on separate bridges

Software-Defined Storage: ZFS mirror over hardware RAID for flexibility

Resource Efficiency: Dev VMs stopped when unused, production always-on

Future-Proofing: Cluster storage enables HA, additional NICs for bonding

Expansion Ready
Network: 6 unused ports for bonding/VLANs/segmentation

Storage: ZFS expandable, LVM thin pool growable

Compute: Memory upgradable, CPU adequate for current loads

Notes
Backup system connectivity needs attention

Architecture supports both container (LXC) and VM workloads

Clear production/dev separation with rapid activation capability