# Installation Guide

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Get the Code](#2-get-the-code)
3. [Configure Environment](#3-configure-environment)
4. [Docker Network Setup](#4-docker-network-setup)
5. [Build and Run](#5-build-and-run)
6. [PocketBase First-Time Setup](#6-pocketbase-first-time-setup)
7. [Reverse Proxy (Optional)](#7-reverse-proxy-optional)
8. [Verify the Install](#8-verify-the-install)
9. [Auto-start on Boot](#9-auto-start-on-boot)
10. [Updating](#10-updating)

---

## 1. Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Docker | 24+ | With Compose plugin (`docker compose`) |
| Anthropic API key | — | [console.anthropic.com](https://console.anthropic.com) |
| Firecrawl API key | — | [firecrawl.dev](https://www.firecrawl.dev) — required for live price search |

Both API keys have free tiers sufficient for personal household use.

---

## 2. Get the Code

```bash
git clone https://github.com/your-username/groceries.git
cd groceries
```

---

## 3. Configure Environment

Copy the example and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set the following:

```env
# Required — AI features won't work without these
CLAUDE_API_KEY=sk-ant-...
FIRECRAWL_API_KEY=fc-...

# Optional — defaults to claude-haiku-4-5-20251001 (fast and cheap)
CLAUDE_MODEL=claude-haiku-4-5-20251001

# Your Sprouts store ID — find it in the URL on shop.sprouts.com
# Navigate to your store, copy the store_id= query param
SPROUTS_STORE_ID=1216

# Your external URL (or leave as localhost for local-only access)
VITE_PB_URL=http://localhost:3001
VITE_PROXY_URL=http://localhost:3001

# PocketBase admin credentials — change these before deploying
PB_ADMIN_EMAIL=admin@grocery.local
PB_ADMIN_PASSWORD=changeme
```

> **Finding your Sprouts store ID**: go to [shop.sprouts.com](https://shop.sprouts.com), search for any item, and look for `store_id=XXXX` in the URL. Default `1216` is a San Diego location.

---

## 4. Docker Network Setup

The app uses an external Docker network called `FRONTEND`. Create it once:

```bash
docker network create FRONTEND
```

This is a shared network used by Nginx Proxy Manager (or any reverse proxy) on the same host. If you don't use a reverse proxy, the containers will still work — the network just needs to exist.

---

## 5. Build and Run

```bash
docker compose up --build -d
```

This does everything in one step:
- Builds the React frontend inside a Docker build stage
- Copies the compiled output into the Express proxy image
- Starts PocketBase on port `8090` (internal only)
- Starts the proxy on port `3001` (external)

> **First build takes ~2 minutes** — Node modules need to be downloaded and the frontend compiled. Subsequent builds are faster due to Docker layer caching.

Check that both containers are running:

```bash
docker compose ps
```

Expected output:

```
NAME                        STATUS         PORTS
groceries-grocery-pb-1      Up             0.0.0.0:8090->8090/tcp
groceries-grocery-proxy-1   Up             0.0.0.0:3001->3001/tcp
```

---

## 6. PocketBase First-Time Setup

PocketBase runs the schema migrations automatically on startup — no manual steps needed. To verify:

```bash
docker logs groceries-grocery-pb-1 2>&1 | tail -5
```

You should see:

```
Server started at http://0.0.0.0:8090
├─ REST API:  http://0.0.0.0:8090/api/
└─ Dashboard: http://0.0.0.0:8090/_/
```

**Access the admin UI** at `http://localhost:8090/_/` (or via your reverse proxy at `/_/`).

Log in with the credentials you set in `.env` (`PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`).

> The app uses open collection rules (no authentication required for the API). This is intentional for a private homelab — if you expose this publicly, add PocketBase auth rules.

---

## 7. Reverse Proxy (Optional)

If you want a domain name and HTTPS, point a reverse proxy at `localhost:3001`. The app uses `window.location.origin` for all internal URLs, so it works from any hostname without a rebuild.

**Nginx Proxy Manager** (recommended for homelabs):
- Forward hostname: `groceries.yourdomain.com`
- Scheme: `http`
- IP: your host's LAN IP or `localhost`
- Port: `3001`
- Enable "Websockets Support" — required for PocketBase realtime

**Traefik / Caddy / other**: proxy all traffic for your domain to `localhost:3001`. No path-based routing needed — the Express proxy handles everything internally.

---

## 8. Verify the Install

Open `http://localhost:3001` in your browser. You should see:

1. A **name picker** — select who you are (first visit only, saved to localStorage)
2. The **grocery list** with an Add Item form
3. The **green dot** in the header — indicates PocketBase is connected

Test the full flow:
1. Type an item name → live search suggestions should appear after ~5 seconds (Firecrawl)
2. Add an item → it should appear in the list
3. Check an item off → "Done Shopping" button appears
4. Go to the **History** tab → your trip should be there

If live search doesn't work, check your `FIRECRAWL_API_KEY` in `.env`.

---

## 9. Auto-start on Boot

Create a systemd service so the containers restart automatically after a reboot:

```bash
sudo tee /etc/systemd/system/groceries.service > /dev/null << 'EOF'
[Unit]
Description=Groceries Docker Compose
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/groceries
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable groceries.service
sudo systemctl start groceries.service
```

Replace `/path/to/groceries` with the actual path where you cloned the repo.

---

## 10. Updating

Pull new code and rebuild the proxy (the only image that contains application code):

```bash
git pull
docker compose build --no-cache grocery-proxy
docker compose up -d grocery-proxy
```

PocketBase migrations run automatically on startup — no manual schema changes needed.

> **Hard refresh your browser** after updating (`Ctrl+Shift+R`) to clear the cached JavaScript bundle.
