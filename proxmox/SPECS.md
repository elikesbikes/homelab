# Proxmox Server Architecture: emihpvproxmox4

## Overview
Dell PowerEdge R620 running Proxmox VE 8.4 as a production hypervisor in a multi-node cluster, specializing in Docker workloads with shared ZFS storage.

## Core Architecture Patterns

### Network Architecture

``
┌─────────────────────────────────────────────┐
│ Network Segmentation Model │
├─────────────────────────────────────────────┤
│ vmbr0 (Management/Production) │
│ └── eno1 (192.168.5.37/24) │
│ ├── Gateway: 192.168.5.1 │
│ └── Connected VMs: docker-prod-* │
│ │
│ vmbr1 (VLAN-capable Data Bridge) │
│ └── eno2 (192.168.6.37/24) │
│ ├── VLAN-aware: yes │
│ └── VLAN IDs: 2-4094 │
│ │
│ Available for Expansion: │
│ - 4x Intel I350 ports │
│ - 2x Broadcom BCM5720 ports │
└─────────────────────────────────────────────┘
``

### Storage Architecture
┌─────────────────────────────────────────────┐
│ Multi-Tier Storage Federation │
├─────────────────────────────────────────────┤
│ Local OS Storage (LVM) │
│ └── 371GB SSD │
│ ├── pve-root: 96GB (Proxmox OS) │
│ └── pve-swap: 8GB │
│ │
│ Shared VM Storage (ZFS) │
│ └── hpv1-ssd-zfs: 1.8TB mirrored │
│ ├── Active on 4 cluster nodes │
│ ├── 66% utilized │
│ └── Primary VM/container storage │
│ │
│ Backup Infrastructure │
│ └── Proxmox Backup Server (configured) │
│ └── Currently unreachable │
└─────────────────────────────────────────────┘


### Virtualization Workload Design

┌─────────────────────────────────────────────┐
│ Workload Distribution Strategy │
├─────────────────────────────────────────────┤
│ Active Production Workloads │
│ ├── docker-prod-1a: 32GB RAM, 120GB disk │
│ ├── docker-prod-1: 30GB RAM, 50GB disk │
│ ├── docker-prod-2: 15GB RAM, 32GB disk │
│ └── nas-dev-1: 4GB RAM, 32GB disk │
│ │
│ Staged/Development Environment │
│ ├── 14 VMs in powered-off state │
│ ├── RAM range: 2GB to 32GB │
│ └── Can be activated on-demand │
└─────────────────────────────────────────────┘


### Cluster Architecture

┌─────────────────────────────────────────────┐
│ Multi-Node Proxmox Cluster │
├─────────────────────────────────────────────┤
│ Node: emihpvproxmox4 │
│ Shared Storage: hpv1-ssd-zfs │
│ Cluster Nodes: emihpvproxmox1-4 │
│ │
│ Storage Federation: │
│ ├── ZFS pools defined across cluster │
│ ├── Some storage disabled per-node │
│ └── Live migration capability present │
└─────────────────────────────────────────────┘



## Hardware Foundation
- **Server**: Dell PowerEdge R620
- **CPU**: Dual Intel Xeon E5-2620 v2 (12 cores/24 threads)
- **Memory**: 94GB RAM (2 NUMA nodes)
- **Storage Controllers**: LSI MegaRAID SAS 2008 + Intel C600 SATA
- **Network**: 8x Gigabit Ethernet ports (2 active, 6 available)

## Software Stack
- **Hypervisor**: Proxmox VE 8.4 (Kernel 6.8.12-17-pve)
- **Virtualization**: QEMU/KVM 9.2.0 + LXC 6.0.0
- **Storage**: ZFS 2.2.8 + LVM2
- **Cluster**: Corosync 3.1.9 + PVE Cluster services

## Operational State
- **Memory Usage**: 37GB/94GB used (57GB available)
- **Storage Usage**: 66% of shared ZFS pool
- **Running VMs**: 4 production workloads
- **Stopped VMs**: 14 development/staging environments
- **Network**: Dual-bridge with active VLAN capability

## Design Principles

### 1. **Separation of Concerns**
- Management vs. VM traffic on separate bridges
- Production vs. development environments clearly partitioned
- Storage tiers based on performance/availability needs

### 2. **Resource Efficiency**
- Development VMs powered off when not in use
- Conservative memory allocation (no overcommitment)
- Shared storage to maximize utilization

### 3. **High Availability Readiness**
- ZFS mirroring for data protection
- Multi-node cluster for host redundancy
- Live migration capability via shared storage

### 4. **Scalability & Flexibility**
- 6 unused network ports for bonding/segmentation
- ZFS storage easily expandable
- Mixed workload support (VMs + LXC containers)

## Key Architectural Decisions

1. **Software-Defined Storage**: ZFS over hardware RAID for flexibility
2. **Dual Network Planes**: Management isolation from VM traffic
3. **Cluster Storage**: Enables future high-availability features
4. **Power Management**: Dev VMs stopped to conserve resources
5. **VLAN Readiness**: Bridge configured for future network segmentation

## Expansion Capabilities
- **Network**: Bonding, additional VLANs, separate storage network
- **Storage**: Add disks to ZFS pool, attach external storage
- **Compute**: Memory upgrades within server limits
- **HA**: Configure live migration, implement HA groups

## Current Status & Notes
- ✅ Production Docker workloads running optimally
- ✅ Network segmentation properly configured
- ✅ Shared storage operational across cluster
- ⚠️ Backup server connection requires attention
- 📈 Architecture supports future growth and HA implementation

## Quick Reference
- **Management IP**: 
- **VM Network IP**: 
- **Shared Storage**: hpv1-ssd-zfs (1.8TB)
- **Key VMs**: docker-prod-1a, docker-prod-1, docker-prod-2
- **Cluster**: Member of 4-node Proxmox cluster

---

*Architecture designed for production stability with development flexibility, emphasizing resource efficiency and future scalability.*