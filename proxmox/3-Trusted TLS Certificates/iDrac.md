# This script generates a clean Markdown guide for setting up Let's Encrypt on iDRAC 9.

# It ensures all commands are raw text to avoid shell syntax errors.

  

guide_content = r"""# Guide: Let's Encrypt SSL for Dell iDRAC 9

  

This method uses **Certbot** on an Ubuntu machine to generate a trusted certificate using **Cloudflare DNS Validation**, then converts it for the iDRAC.

  

## 1. Install Certbot & Cloudflare Plugin

  

```

sudo apt update

sudo apt install certbot python3-certbot-dns-cloudflare -y

```

  

## 2. Configure Cloudflare API Credentials

  

1. **Get your API Token:** [Cloudflare Profile > API Tokens](https://dash.cloudflare.com/profile/api-tokens). Use **Edit zone DNS** template.

  

2. **Create the Credentials File:**

  

```

mkdir -p ~/.secrets/certbot

nano ~/.secrets/certbot/cloudflare.ini

```

  

3. **Paste this content:**

  

```

dns_cloudflare_api_token = YOUR_LONG_API_TOKEN_HERE

```

  

4. **Secure the file:**

  

```

chmod 600 ~/.secrets/certbot/cloudflare.ini

```

  

## 3. Generate the Certificate

  

```

sudo certbot certonly \

--dns-cloudflare \

--dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini \

-d proxmox-prod-1i.home.elikesbikes.com \

--preferred-challenges dns-01

```

  

## 4. Convert to "Legacy" PFX (CLEAN COMMAND)

  

Copy and paste this single line.

  

```

sudo openssl pkcs12 -export -legacy -out /home/ecloaiza/idrac_le.pfx -inkey /etc/letsencrypt/live/[proxmox-prod-1i.home.elikesbikes.com/privkey.pem](https://proxmox-prod-1i.home.elikesbikes.com/privkey.pem) -in /etc/letsencrypt/live/[proxmox-prod-1i.home.elikesbikes.com/fullchain.pem](https://proxmox-prod-1i.home.elikesbikes.com/fullchain.pem) -password pass:dell

```

  

## 5. Fix Permissions

  

```

sudo chown ecloaiza:ecloaiza /home/ecloaiza/idrac_le.pfx

```

  

## 6. Upload via iDRAC Web UI

  

1. Log in to **iDRAC 9**.

  

2. Go to: **Configuration** > **System Settings**.

  

3. Expand **Network Settings** > **Services** > **Web Server**.

  

4. Locate **SSL Certificate** and click **Import**.

  

5. **Type:** PKCS12 | **File:** `idrac_le.pfx` | **Password:** `dell`.

  

6. Click **Apply** and wait 5 minutes for the restart.

  

## Note on Expiration

  

Let's Encrypt certificates expire every **90 days**.

  

* **The Problem:** The certificate on your Ubuntu machine will auto-renew, but the iDRAC won't know about it.

  

* **The Solution:** You will need to repeat **Step 4** and **Step 5** every ~2.5 months, OR set up an automation script to push it via `racadm`.

"""

  
