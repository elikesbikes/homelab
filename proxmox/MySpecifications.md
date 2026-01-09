# Proxmox Node emihpvproxmox4 — Detailed Technical Report

## 1. Cluster & Corosync
**Command:** `pvecm status`

- `/etc/pve/corosync.conf` does not exist.
- Confirms node is **not joined to a Proxmox cluster**.
- Expected behavior for a standalone node.
- No quorum or cluster dependencies active.

## 2. Storage Status (`pvesm status`)

### Active Storages
- **local (dir)**
  - Path: `/var/lib/vz`
  - Status: active
  - Usage: ~85%
  - Content: ISO, templates, backups

- **hpv1-ssd-zfs (zfspool)**
  - Status: active
  - Total: ~1.8 TB
  - Used: ~1.2 TB (66%)
  - Mountpoint: `/hpv1-ssd-zfs`
  - Nodes: emihpvproxmox1,2,3,4

### Disabled / Inactive Storages
- **hpv4-ssd-zfs-non-R**
  - Disabled due to node scoping

- **data (zfspool)**
  - Pool not present on this node

- **hpv0c, hpv6 (lvmthin)**
  - Thin pools / VGs not present locally

- **backup-prod-1 (pbs)**
  - Status: inactive
  - Error: `500 Can't connect to 192.168.5.61:8007`
  - Root cause: network-level failure (`No route to host`)

## 3. ZFS Health

- Pool: `hpv1-ssd-zfs`
- Layout: Mirror
- Devices:
  - `scsi-355cd2e415266bdb3`
  - `scsi-355cd2e4152663512`

**State:** ONLINE  
**Errors:** None  

**Last Scrub:**
- Repaired: 0B
- Completed successfully with no errors

**Note:**
- Pool supports newer ZFS features not yet enabled.
- Optional: `zpool upgrade` (with compatibility implications).

## 4. LVM Configuration

- **Volume Group:** pve
- **Physical Volumes:** 1
- **Logical Volumes:**
  - root: 96G
  - swap: 8G

- **Free Space:** ~267G
- No thin pools active on this node.

## 5. Virtual Machines

- **Total VMs:** 20

### Running
- 101 — docker-prod-2
- 103 — docker-prod-1
- 107 — nas-dev-1
- 119 — docker-prod-1a

### Stopped but Present
- Domain controllers
- Routers
- Dev/Test systems
- Windows guests

No evidence of VM corruption or storage loss.

## 6. Firewall

**Command:** `pve-firewall status`

- Firewall service running
- Firewall **globally disabled**
- No rules enforced at host level

## 7. Backup Infrastructure

- **PBS Server:** 192.168.5.61
- **Datastore:** backups
- **Auth:** root@pam (fingerprint verified)

**Current State:**
- Completely unreachable
- No backups possible

**Likely Causes:**
- Routing issue
- Interface down
- VLAN / switch misconfiguration
- PBS server offline

## 8. Overall Technical Conclusion

- Node is stable and operational.
- ZFS storage is healthy.
- Standalone configuration is intentional and clean.
- Backup system failure is the **primary operational risk**.
- Local storage utilization should be monitored.
- Disabled storages align with node scoping and inventory design.

This node can continue operating, but it is currently **unprotected from data loss** due to backup failure.
