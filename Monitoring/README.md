# Monitoring

This directory contains monitoring tools and integrations for the homelab infrastructure.

## Directory Structure

```
Monitoring/
└── UptimeKuma/
    ├── Claude/
    │   ├── server.js          # MCP server implementation
    │   ├── package.json       # Node.js project config
    │   └── package-lock.json  # Dependency lock file
    └── UPTIMEKUMA.md          # Documentation & setup guide
```

---

## UptimeKuma

[UptimeKuma](https://github.com/louislam/uptime-kuma) is the self-hosted uptime monitoring service running at `https://uptime.home.elikesbikes.com`. It tracks the availability of internal and external services with heartbeat checks, alerting, and public status pages.

### Claude Integration (MCP Server)

The `Claude/` subdirectory contains a Node.js **MCP (Model Context Protocol) server** that bridges Claude and n8n to UptimeKuma's Socket.IO API.

#### What it does

Exposes 9 tools that Claude (and n8n) can invoke programmatically:

| Tool | Description |
|---|---|
| `list_monitors` | List all monitors with current status |
| `list_monitor_groups` | List monitor groups (for parent ID lookups) |
| `get_monitor` | Get details for a specific monitor by ID |
| `pause_monitor` | Pause a monitor |
| `resume_monitor` | Resume a paused monitor |
| `get_heartbeat_history` | Retrieve the last 20 heartbeat records |
| `list_status_pages` | List all public status pages |
| `get_status_page` | Get details for a status page by slug |
| `add_monitor` | Create a new monitor (http, tcp, ping, dns, keyword, push, steam) |

#### Architecture

```
Claude Code  ──(stdio)──┐
                        ├──> MCP Server (Node.js) ──> Socket.IO ──> UptimeKuma
n8n          ──(SSE)────┘
```

#### Authentication

Credentials are passed via environment variables:

| Variable | Description |
|---|---|
| `UPTIME_KUMA_URL` | UptimeKuma instance URL |
| `UPTIME_KUMA_USERNAME` | Login username |
| `UPTIME_KUMA_PASSWORD` | Login password |

See `UptimeKuma/UPTIMEKUMA.md` for full setup, credential locations, and restart procedures.

#### Running the server

```bash
cd UptimeKuma/Claude
npm install
node server.js
```

---

## Technologies Used

- **UptimeKuma** — self-hosted uptime/status monitoring
- **Node.js + Socket.IO** — real-time API integration
- **Model Context Protocol (MCP)** — Claude tool interface
- **n8n** — workflow automation via SSE MCP endpoint
