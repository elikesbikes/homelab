  

INSTRUCTIONS = r"""

# UniFi Gateway Let's Encrypt Setup (Cloudflare & Strict Home Directory)

  

This guide ensures **ALL** data (Keys, Certs, Configs, Logs) stays inside `/home/ecloaiza/.secrets`.

Nothing will be written to system directories like `/etc/letsencrypt`.

  

## Step 1: Get your Cloudflare API Token

  

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).

2. Go to **My Profile** > **API Tokens**.

3. Click **Create Token**.

4. Use the **Edit Zone DNS** template.

5. **Zone Resources**: Select `Include` > `Specific zone` > `your-domain.com`.

6. Click **Continue to Summary** and then **Create Token**.

7. **Copy this token.**

  

## Step 2: Install Dependencies (Ubuntu Client)

  

```bash

sudo apt update

sudo apt install certbot python3-certbot-dns-cloudflare

```

  

## Step 3: Create Folder Structure

  

We need specific folders to keep everything isolated in your home directory.

  

```bash

# Create directories for SSH, Hooks, and Certbot internal storage

mkdir -p ~/.secrets/ssh

mkdir -p ~/.secrets/certbot/hooks

mkdir -p ~/.secrets/certbot/config

mkdir -p ~/.secrets/certbot/work

mkdir -p ~/.secrets/certbot/logs

  

# Lock it down

chmod -R 700 ~/.secrets

```

  

## Step 4: Create a Dedicated SSH Key

  

We store the key in `~/.secrets/ssh/`.

  

1. **Generate the key** (No passphrase):

```bash

ssh-keygen -t rsa -b 4096 -f ~/.secrets/ssh/unifi_key

```

2. **Copy the key to the UniFi Gateway**:

```bash

# Replace 192.168.5.1 with your router IP

ssh-copy-id -i ~/.secrets/ssh/unifi_key root@192.168.5.1

```

  

## Step 5: Configure Cloudflare Credentials

  

1. **Create the file using vim**:

```bash

vim ~/.secrets/certbot/cloudflare.ini

```

2. **Paste your token** (Press `i`, paste, `Esc`, `:wq`):

```ini

dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN_HERE

```

3. **Secure the file**:

```bash

chmod 600 ~/.secrets/certbot/cloudflare.ini

```

  

## Step 6: Create the Deploy Script

  

1. **Create the script**:

```bash

vim ~/.secrets/certbot/hooks/deploy_to_unifi.sh

```

2. **Paste the Content**:

```bash

#!/bin/bash

UNIFI_HOST="192.168.5.1" # CHANGE THIS TO YOUR ROUTER IP

UNIFI_USER="root"

SSH_KEY="/home/ecloaiza/.secrets/ssh/unifi_key"

CERT_PATH="${RENEWED_LINEAGE}/fullchain.pem"

KEY_PATH="${RENEWED_LINEAGE}/privkey.pem"

  

echo "--- Starting UniFi Certificate Deployment ---"

# Upload

scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q "$CERT_PATH" "${UNIFI_USER}@${UNIFI_HOST}:/tmp/unifi-core.crt"

scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q "$KEY_PATH" "${UNIFI_USER}@${UNIFI_HOST}:/tmp/unifi-core.key"

  

# Install

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${UNIFI_USER}@${UNIFI_HOST}" "bash -s" <<EOF

TARGET_DIR="/data/unifi-core/config"

# Backup

cp "\$TARGET_DIR/unifi-core.crt" "\$TARGET_DIR/unifi-core.crt.bak" 2>/dev/null

cp "\$TARGET_DIR/unifi-core.key" "\$TARGET_DIR/unifi-core.key.bak" 2>/dev/null

# Move & Permission

mv /tmp/unifi-core.crt "\$TARGET_DIR/unifi-core.crt"

mv /tmp/unifi-core.key "\$TARGET_DIR/unifi-core.key"

chmod 644 "\$TARGET_DIR/unifi-core.crt"

chmod 600 "\$TARGET_DIR/unifi-core.key"

# Restart

systemctl restart unifi-core

EOF

```

3. **Make it executable**:

```bash

chmod +x ~/.secrets/certbot/hooks/deploy_to_unifi.sh

```

  

## Step 7: Generate the Certificate (The First Run)

  

We force RSA keys (`--key-type rsa`) because UniFi often rejects ECDSA.

  

```bash

certbot certonly --key-type rsa \

--config-dir /home/ecloaiza/.secrets/certbot/config \

--work-dir /home/ecloaiza/.secrets/certbot/work \

--logs-dir /home/ecloaiza/.secrets/certbot/logs \

--dns-cloudflare \

--dns-cloudflare-credentials /home/ecloaiza/.secrets/certbot/cloudflare.ini \

--deploy-hook /home/ecloaiza/.secrets/certbot/hooks/deploy_to_unifi.sh \

-d router.home.elikesbikes.com

```

  

## Step 8: Setup Auto-Renewal (Crontab)

  

Add this to your user crontab (`crontab -e`) to check for renewal daily at 3:30 AM:

  

```bash

30 3 * * * /usr/bin/certbot renew --config-dir /home/ecloaiza/.secrets/certbot/config --work-dir /home/ecloaiza/.secrets/certbot/work --logs-dir /home/ecloaiza/.secrets/certbot/logs --quiet

```

  

## Step 9: Configure Local DNS

  

To prevent browser warnings, your computer must map the domain to the local IP.

* **Best Way:** Add a Local DNS Record in your UniFi Network Application settings.

* **Quick Test:** Add `192.168.5.1 router.home.elikesbikes.com` to `/etc/hosts`.

  

## Troubleshooting: Manual Trigger

  

If you need to re-run the script without regenerating the cert:

  

```bash

RENEWED_LINEAGE=/home/ecloaiza/.secrets/certbot/config/live/router.home.elikesbikes.com /home/ecloaiza/.secrets/certbot/hooks/deploy_to_unifi.sh

```

"""