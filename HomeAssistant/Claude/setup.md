# Home Assistant - Claude Code Setup

Reference guide: https://github.com/komal-SkyNET/claude-skill-homeassistant

---

## Environment Variables

HA credentials are stored in `/home/ecloaiza/.secrets/home_assistant` and loaded automatically via `~/.bashrc`.

```bash
# /home/ecloaiza/.secrets/home_assistant
export HASS_SERVER=http://192.168.5.18:8123
export HASS_TOKEN=<long-lived access token>
```

To verify they are loaded in your shell:
```bash
echo $HASS_SERVER
echo $HASS_TOKEN
```

---

## Claude Skill

The `home-assistant-manager` skill is installed **globally** at:
```
~/.claude/skills/home-assistant-manager/SKILL.md
```

No per-project setup needed. The skill is available in every Claude Code session.

Invoke with:
```
/home-assistant-manager
```

---

## Context7 MCP

Context7 is configured as an MCP server in `~/.claude.json` and provides access to official Home Assistant documentation during Claude sessions.

Setup command used:
```bash
claude mcp add --transport http context7 https://mcp.context7.com/mcp \
  --header "CONTEXT7_API_KEY: <your_api_key>"
```

To verify it is connected:
```bash
claude mcp list
```

---

## SSH Access

Passwordless SSH is configured to the HA server via key-based auth.

```bash
# Connect
ssh root@192.168.5.18

# One-time setup (if keys ever need to be re-added)
ssh-copy-id root@192.168.5.18
```

---

## HA /config Git Repository

The HA `/config` directory on the server is initialized as a local git repo (no remote).
Initial commit made on 2026-03-16 with 9,300 files.

**What is tracked:** configuration.yaml, automations.yaml, blueprints, custom_components (source only), sensors, scenes, scripts, groups, templates

**What is excluded via `.gitignore`:**
- `secrets.yaml` — never commit
- `.cloud/` — SSL certs and auth tokens
- `*.db`, `*.db-shm`, `*.db-wal` — databases
- `*.log`, `*.log.fault` — logs
- `.cache/`, `deps/`, `__pycache__/`, `*.pyc` — auto-generated
- `media/`, `tts/`, `image/`, `www/` — large user files
- `.storage/` — dashboards tracked selectively (see below)
- `node-red/`, `esphome/`, `themes/`

---

## Git Workflow

**Local config directory** (`homelab/HomeAssistant/`) lives inside the `tutorials` repo:
- Remote: https://github.com/elikesbikes/tutorials
- Local: `/home/ecloaiza/devops/github/homelab/HomeAssistant/`

**Standard workflow (final changes):**
```bash
# On local machine
git add file.yaml
git commit -m "description"
git push

# Pull to HA server
ssh root@192.168.5.18 "cd /config && git pull"
```

**Rapid iteration workflow (testing):**
```bash
scp file.yaml root@192.168.5.18:/config/
hass-cli service call automation.reload
# iterate until stable, then commit to git
```

**Dashboard rapid iteration:**
```bash
scp .storage/lovelace.my_dashboard root@192.168.5.18:/config/.storage/
# refresh browser (Ctrl+F5) — no HA restart needed
# commit to git when stable
```

To track a dashboard file in git, add an exception to `/config/.gitignore` on the HA server:
```
!.storage/lovelace.my_dashboard
!.storage/lovelace_dashboards
```

---

## Quick Commands

```bash
# Validate config before restart
ssh root@192.168.5.18 "ha core check"

# Reload (no restart needed)
hass-cli service call automation.reload
hass-cli service call script.reload
hass-cli service call scene.reload

# Restart HA
ssh root@192.168.5.18 "ha core restart"

# View logs
ssh root@192.168.5.18 "ha core logs | grep -i error | tail -20"

# Check entity state
hass-cli state get sensor.entity_name

# Trigger automation manually
hass-cli service call automation.trigger --arguments entity_id=automation.name

# Validate dashboard JSON
python3 -m json.tool .storage/lovelace.my_dashboard > /dev/null
```
