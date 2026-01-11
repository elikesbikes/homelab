# Proxmox Trusted TLS Certificate Setup (ACME + Cloudflare)

Follow these steps to remove the "Not Secure" warning in your browser by using Let's Encrypt and the DNS-01 challenge.

## 1. Cloudflare Configuration
1. Log in to your Cloudflare dashboard.
2. Navigate to **My Profile > API Tokens**.
3. Create a new **API Token** with `Zone:DNS:Edit` permissions for your domain.

## 2. Proxmox ACME Account
1. In Proxmox, navigate to **Data Center > ACME**.
2. Under **Accounts**, click **Add**.
3. **Account Name:** Give it a label (e.g., `AdminEmail`).
4. **Email:** Enter your email.
5. **Directory:** Select the Let's Encrypt Production directory.
6. Click **Register**.

## 3. Challenge Plugin Setup
1. In **Data Center > ACME**, go to **Challenge Plugins**.
2. Click **Add**.
3. **Plugin ID:** `cloudflare-dns`.
4. **DNS API:** Select `cloudflare`.
5. **API Data:** Paste your Cloudflare API Token and Email address.
6. Click **Add**.

## 4. Issuing the Certificate
1. Select your Proxmox **Node** > **Certificates**.
2. Under the **ACME** section, click **Add**.
3. **Challenge Type:** Choose `DNS`.
4. **Plugin:** Choose `cloudflare-dns`.
5. **Domain:** Enter your node's FQDN (e.g., `pve01.yourdomain.com`).
    * *Note: You can add multiple domains as Subject Alternative Names (SAN) for cluster-wide access.*
6. Click **Order Certificates Now**.

The process will take about a minute. Once finished, Proxmox will reload its web interface with a valid, trusted SSL certificate.