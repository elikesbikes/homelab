# Ansible/Semaphore MCP Integration — COMPLETED

## What Was Built

Semaphore UI was already running on `docker-prod-1.home.elikesbikes.com:3010`. A standalone MCP server was added as a Docker container on the same host, exposing Semaphore's REST API as Claude Code tools via SSE.

---

## Architecture

```
Claude Code (local or remote)
    │
    │  SSE (port 8765)
    ▼
ansible-mcp-1 container          ← Python FastMCP server
    │
    │  HTTP (Docker-internal: semaphore:3000)
    ▼
ansible-prod-1 container          ← Semaphore UI v2.8.90
    │
    │  MySQL
    ▼
ansible-mysql-1 container         ← MySQL 8.0 (inventory, projects, tasks in DB)
```

**Semaphore UI:** `https://ansible.home.elikesbikes.com` (NGINX on separate host)
**MCP SSE endpoint:** `http://docker-prod-1.home.elikesbikes.com:8765/sse`

---

## Files Created/Modified

| File | Host | Notes |
|------|------|-------|
| `/home/ecloaiza/devops/docker/ansible/.env` | remote | Secrets extracted from docker-compose |
| `/home/ecloaiza/devops/docker/ansible/docker-compose.yml` | remote | Added `ansible-mcp` service, env_file |
| `/home/ecloaiza/devops/docker/ansible/mcp-server/Dockerfile` | remote | python:3.12-slim |
| `/home/ecloaiza/devops/docker/ansible/mcp-server/requirements.txt` | remote | mcp[cli], httpx |
| `/home/ecloaiza/devops/docker/ansible/mcp-server/server.py` | remote | 7 MCP tools |
| `/home/ecloaiza/devops/docker/ansible/CLAUDE.md` | remote | Project docs |
| `~/.claude.json` (projects[/home/ecloaiza/devops].mcpServers) | local | ansible SSE URL |
| `~/.claude.json` (mcpServers) | remote | ansible localhost SSE URL |
| `/home/ecloaiza/devops/.claude/settings.local.json` | local | Tool permissions |
| `~/.claude/settings.json` | remote | Tool permissions |
| `~/.claude/skills/ansible/SKILL.md` | local + remote | Ansible skill |

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List Semaphore projects |
| `list_playbook_templates` | List playbooks (6 templates in project 1) |
| `run_playbook` | Trigger run — supports `limit` and `dry_run` |
| `get_job_status` | Status + last 3000 chars of output |
| `list_recent_jobs` | Task history |
| `list_inventory` | HomeLab (id:1) and Proxmox (id:2) inventories |
| `add_host` | Add host to inventory group via Semaphore API |

---

## Maintenance

**Rebuild MCP server** (after editing `server.py`):
```bash
ssh docker-prod-1.home.elikesbikes.com
cd /home/ecloaiza/devops/docker/ansible
sudo docker compose --env-file .env build ansible-mcp && sudo docker compose --env-file .env up -d ansible-mcp
```

**Update skill on remote** (after editing local skill):
```bash
scp ~/.claude/skills/ansible/SKILL.md docker-prod-1.home.elikesbikes.com:~/.claude/skills/ansible/SKILL.md
```

**Logs:** `sudo docker logs ansible-mcp-1 --tail 50`
