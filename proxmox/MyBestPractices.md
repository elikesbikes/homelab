

# Proxmox Best Practices & Essential Settings

This guide outlines the essential configurations and best practices for Proxmox VE based on Christian Lempa's recommendations for creating a secure, robust, and high-performance home lab environment.

---

## 1. Configure Update Repositories
By default, Proxmox includes "Enterprise" repositories that require a paid subscription. For home lab users, these should be swapped for the "No-Subscription" versions.

* **Action:** Go to **Node > Repositories**.
* **Disable:** All repositories starting with "Enterprise" 
* **Add:** The `No-Subscription` repository for Proxmox and, if using Ceph, the corresponding `No-Subscription` Ceph repository 
* **Update:** Run **Refresh** and then **Upgrade** to pull the latest patches without a subscription 

## 2. Enable Notifications
Don't let backup failures or system alerts go unnoticed.

* **Action:** Go to **Data Center > Notifications** 
* **Configure SMTP:** Add a new SMTP target to use your own email server (e.g., Gmail, Outlook) instead of the local "root" mail 
* **Notification Matcher:** Ensure your new SMTP target is active in the matchers so system alerts are actually routed to your inbox

## 3. Trusted TLS Certificates (SSL)
Remove the "Not Secure" browser warning by using Let's Encrypt via the ACME protocol.

* **Requirement:** A public domain and a DNS provider that supports API access (like Cloudflare) 
* **DNS Challenge:** Use the DNS-01 challenge. This is preferred for home labs because it doesn't require opening ports to the internet 
* **Cluster Tip:** If you have a cluster, add the cluster's shared DNS name as a **Subject Alternative Name (SAN)** to the certificate for every node 

## 4. External Storage & Backups
**Never** run production VMs without a backup strategy.

* **NFS Storage:** Use an external NAS (like TrueNAS) via NFS to store backups. This ensures that if the Proxmox host hardware fails, your data is safe on a separate machine 
* **Backup Jobs:**
    * **Schedule:** Run daily backups for production systems 
    * **Mode:** Use `Snapshot` mode so VMs stay running during the backup 
    * **Retention:** Set "Keep Last" (e.g., last 10 backups) to prevent the storage from filling up 

## 5. PCI Pass-through
Useful for virtualizing a NAS (passing through a SATA controller) or a Plex server (passing through a GPU).

* **BIOS:** Ensure `IOMMU` (Intel VT-d or AMD-Vi) is enabled in your motherboard BIOS 
* **Verification:** Use the shell to verify IOMMU is initialized 
* **Note:** Devices passed through to a VM will no longer be visible or usable by the Proxmox host itself

## 6. VM Creation Best Practices
Default Proxmox settings aren't always optimal. Use these instead:

* **QEMU Guest Agent:** Always enable this for better integration, proper shutdowns, and IP reporting 
* **VirtIO Drivers:** * **Linux:** Built-in; just select `VirtIO` for Network and Disk.
    * **Windows:** You must mount the `virtio-win.iso` during installation to see the hard drives and network 
* **BIOS/Machine:** * Use `i440fx` and `Seabios` for standard Linux servers.
    * Use `Q35` and `OVMF (UEFI)` for Windows 11 or when using PCI pass-through 

## 7. Use VM Templates
Stop installing Linux manually every time.

* **Golden Image:** Install a base OS (e.g., Ubuntu), install standard tools, and run `cloud-init` 
* **Convert:** Right-click the VM and select **Convert to Template**.
* **Clone:** Use "Full Clone" or "Linked Clone" to deploy a new, ready-to-use VM in seconds 
