# UptimeKuma

Self-hosted uptime monitoring for the homelab.

**URL**: https://uptime.home.elikesbikes.com
**Username**: ecloaiza

---

## Claude Integration

Two MCP servers give Claude access to UptimeKuma. Both registered globally in `~/.claude.json`. Invoke with `/uptimekuma`.

| MCP Server | Type | Endpoint |
|---|---|---|
| `uptime-kuma` | stdio (Node.js) | `node .../Claude/server.js` |
| `uptime-kuma-n8n` | SSE (n8n) | `http://localhost:5678/mcp/uptime-kuma-mcp/sse` |

---

## Authentication

Full monitor management uses the **Socket.IO API** with **username/password** — not REST API keys.

> UptimeKuma does have API keys (Settings → Security → API Keys), but they only cover limited REST endpoints (Prometheus metrics, push monitors). Managing monitors requires Socket.IO.

### Credential locations

| Location | Purpose |
|---|---|
| `~/.secrets/uptime_kuma` | Sourced in shell, loaded by `~/.bashrc` |
| `~/.claude.json` → `mcpServers.uptime-kuma.env` | Used by the Node.js MCP server |
| `/home/ecloaiza/devops/docker/n8n/.env` | Used by the n8n MCP workflow via `$env.*` |

---

## Node.js MCP Server

**Location**: `Claude/server.js`
**Dependencies**: `@modelcontextprotocol/sdk`, `socket.io-client`

```bash
# Install dependencies (already done)
cd /home/ecloaiza/devops/github/homelab/Monitoring/UptimeKuma/Claude
npm install

# Test connection (replace with real credentials)
UPTIME_KUMA_URL=https://uptime.home.elikesbikes.com \
UPTIME_KUMA_USERNAME=ecloaiza \
UPTIME_KUMA_PASSWORD=<password> \
node server.js
```

---

## n8n MCP Workflow

**Name**: UptimeKuma MCP Server
**ID**: `k9ieH1JSh78A8p3V`
**SSE URL**: `http://localhost:5678/mcp/uptime-kuma-mcp/sse`

Implements Socket.IO via Engine.IO 4 HTTP long-polling — no external npm packages needed in n8n. Each tool opens a session, authenticates, emits the event, and parses the response.

---

## Available Tools (both servers)

| Tool | Parameters | Description |
|---|---|---|
| `list_monitors` | — | All monitors with status |
| `list_monitor_groups` | — | Groups only (for parent_id lookup) |
| `get_monitor` | `id` | Single monitor details |
| `pause_monitor` | `id` | Pause a monitor |
| `resume_monitor` | `id` | Resume a monitor |
| `get_heartbeat_history` | `id` | Last 20 heartbeat records |
| `list_status_pages` | — | All status pages |
| `get_status_page` | `slug` | Status page details |
| `add_monitor` | `name`, `type`, `url`/`hostname`, `interval`, `parent_id` | Create a new monitor |

---

## After Credential Changes

- **Node.js server**: restart Claude Code (`/exit` and reopen)
- **n8n workflow**: `docker compose restart` in `/home/ecloaiza/devops/docker/n8n`
