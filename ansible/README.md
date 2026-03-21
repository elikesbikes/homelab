# Ansible / Semaphore

Semaphore UI automation platform running as Docker containers on this host.

## Services

| Container | Image | Port |
|-----------|-------|------|
| `ansible-prod-1` | semaphoreui/semaphore:v2.8.90 | 3010→3000 |
| `ansible-mysql-1` | mysql:8.0 | internal only |
| `ansible-mcp-1` | ansible-ansible-mcp (local build) | 8765→8765 |

**Semaphore UI:** `https://ansible.home.elikesbikes.com` (via NGINX on separate host)
**Semaphore API:** `http://localhost:3010`
**MCP Server SSE:** `http://localhost:8765/sse`

## Directory Structure

```
/home/ecloaiza/devops/docker/ansible/
├── docker-compose.yml      # All 3 services (mysql, semaphore, ansible-mcp)
├── .env                    # Secrets — do not commit
├── mcp-server/
│   ├── Dockerfile          # python:3.12-slim
│   ├── requirements.txt    # mcp[cli], httpx
│   └── server.py           # MCP server — wraps Semaphore REST API
├── inventory/              # Bind-mounted read-only; Semaphore uses MySQL for inventory
├── authorized-keys/        # SSH public keys
└── config/                 # Semaphore config (config.json)
```

## MCP Server

The `ansible-mcp-1` container exposes 7 tools to Claude Code via SSE:

- `list_projects` / `list_playbook_templates` / `list_inventory`
- `run_playbook` — triggers Semaphore task by template ID
- `get_job_status` — polls task status and output
- `list_recent_jobs` — task history
- `add_host` — updates inventory in MySQL via Semaphore API

**Auth:** Semaphore session-based (POST /api/auth/login per request).
**Internal URL:** MCP server calls Semaphore at `http://semaphore:3000` (Docker network).

## Common Operations

### Rebuild MCP server after code changes
```bash
cd /home/ecloaiza/devops/docker/ansible
sudo docker compose --env-file .env build ansible-mcp
sudo docker compose --env-file .env up -d ansible-mcp
```

### View MCP server logs
```bash
sudo docker logs ansible-mcp-1 --tail 50 -f
```

### Restart all services
```bash
sudo docker compose --env-file .env up -d
```

### Test Semaphore API
```bash
curl http://localhost:3010/api/ping
curl -X POST http://localhost:3010/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"auth":"admin","password":"<from .env>"}'
```

## Secrets (.env)

| Variable | Description |
|----------|-------------|
| `MYSQL_PASSWORD` | MySQL semaphore user password |
| `SEMAPHORE_DB_USER/PASS` | DB credentials |
| `SEMAPHORE_ADMIN_PASSWORD` | Admin UI + API password |
| `SEMAPHORE_ACCESS_KEY_ENCRYPTION` | Semaphore vault encryption key — never change after init |

## Claude Code Integration

MCP server registered in `~/.claude.json` as `ansible` (SSE, `localhost:8765`).
Skill available at `~/.claude/skills/ansible/SKILL.md`.
Tool permissions in `~/.claude/settings.json`.
