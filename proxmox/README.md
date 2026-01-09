# Proxmox Node emihpvproxmox4 — High-Level Status Summary

## Cluster

- This node is **not** part of a Proxmox cluster.
- Corosync configuration is missing.
- Operates as a standalone Proxmox VE node.

## Compute

- Multiple VMs are defined.
- **4 VMs currently running**.
- Majority of VMs are stopped but intact.

## Storage

- Primary active storage: **hpv1-ssd-zfs** (ZFS mirror, healthy).
- Local directory storage is active but ~85% utilized.
- Several storages are configured but disabled due to node scoping or missing pools.
- ZFS pool reports **no data errors**.

## Backups

- Proxmox Backup Server datastore is configured but **unreachable**.
- Network connectivity issue to backup server (`No route to host`).

## Firewall

- Proxmox firewall service is running but **globally disabled**.

## Overall Assessment

- Node is operational.
- Storage health is good for active pools.
- Backup infrastructure is currently broken.
- No cluster-related services are in use or required on this node.
