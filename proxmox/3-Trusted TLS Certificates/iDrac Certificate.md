
# This script contains the full iDRAC 9 Cloudflare Setup Guide.

# Run this script to generate a "idrac_guide.md" file in your current directory.

  

guide_content = r"""# Complete Guide: Dell iDRAC 9 SSL with Cloudflare Origin CA

  

This guide covers the entire process: generating the certificate in Cloudflare, converting it for iDRAC 9 (fixing `SYS426`/`RAC0615` errors), installing it, and configuring your browser to trust it.

  

---

  

## Phase 1: Generate Certificate in Cloudflare

Before touching the server, you need to generate the certificate pair.

  

1. Log in to **Cloudflare** and select your **Domain**.

2. Navigate to **SSL/TLS** > **Origin Server**.

3. Click **Create Certificate**.

4. **Key type:** Select **RSA (2048)**.

* *Critical:* Do not use ECC/ECDSA, as older iDRAC firmware often rejects it.

5. **Hostnames:** Ensure your iDRAC's FQDN is listed (e.g., `idrac.yourdomain.com` or `*.yourdomain.com`).

6. **Validity:** Select **15 years** (recommended for internal hardware).

7. Click **Create**.

8. **Save the files:**

* Copy the **Origin Certificate** text -> Save as `idrac.crt`

* Copy the **Private Key** text -> Save as `idrac.key`

  

---

  

## Phase 2: File Preparation (Ubuntu CLI)

iDRAC 9 has strict requirements. Use these commands to convert your Cloudflare files into a "Legacy" PKCS12 bundle that the iDRAC Web UI accepts.

  

### Step A: Convert Certificate to PEM

*Check your `idrac.crt`. If it starts with `-----BEGIN PKCS7-----`, run this command. If it already starts with `-----BEGIN CERTIFICATE-----`, skip to Step B.*

  

```bash

openssl pkcs7 -print_certs -in idrac.crt -out idrac_pem.crt

```

  

### Step B: Convert Private Key to RSA

Cloudflare provides PKCS#8 keys by default. iDRAC needs the traditional RSA header.

```bash

openssl rsa -in idrac.key -out idrac_rsa.key

```

  

### Step C: Create the Legacy PKCS12 Bundle

Modern OpenSSL 3.0 (default in Ubuntu 22/24) uses encryption too new for iDRAC. The `-legacy` flag is required.

```bash

# If you ran Step A, use 'idrac_pem.crt'. If you skipped A, use 'idrac.crt'.

openssl pkcs12 -export -legacy -out idrac_final.pfx -inkey idrac_rsa.key -in idrac_pem.crt -password pass:dell

```

  

---

  

## Phase 3: Upload to iDRAC 9 Web UI

1. Log in to the iDRAC Web Interface.

2. Navigate to **Configuration** > **System Settings**.

3. Expand **Network Settings** > **Services** > **Web Server**.

4. Locate **SSL Certificate** and click **Import**.

5. Configure the upload:

* **Certificate Type:** PKCS12

* **File:** Select `idrac_final.pfx`

* **Password:** `dell`

6. Click **Apply**.

7. The system will prompt to restart the Web Server. Click **OK**.

* *Wait 3-5 minutes for the interface to reload.*

  

---

  

## Phase 4: Fix the "Not Secure" Browser Warning

Your browser does not trust Cloudflare's internal "Origin CA" by default. You must manually import the Root CA into your browser's trust store.

  

### Step A: Download the Root CA

Download the **Cloudflare Origin RSA Root** (`.pem` or `.crt`) from [Cloudflare's Documentation](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/#0-download-the-cloudflare-origin-ca-root-certificate).

  

### Step B: Import into Chrome / Edge / Brave

1. Go to **Settings** > Search for **Certificates**.

2. Click **Manage Certificates** > Select the **Authorities** tab.

3. Click **Import** > Select the Cloudflare Root file you downloaded.

4. **CRITICAL:** A popup will appear. You MUST check the box: **"Trust this certificate for identifying websites"**.

5. Click OK and **Restart the browser**.

  

### Step C: Import into Firefox

1. Go to **Settings** > Search for **Certificates**.

2. Click **View Certificates** > Select the **Authorities** tab.

3. Click **Import** > Select the Cloudflare Root file.

4. Check the box: **"Trust this CA to identify websites"**.

5. Click OK.

  

---

  

## Phase 5: Final Verification

Access your iDRAC using the fully qualified domain name (FQDN).

  

* **Correct URL:** `https://proxmox-prod-1i.home.elikesbikes.com`

* Result: **Green Padlock (Secure)**

* **Incorrect URL:** `https://192.168.5.56`

* Result: **Not Secure** (Certificates verify names, not IP addresses)

