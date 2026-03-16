# Home Assistant - Claude Code Context

This directory contains Home Assistant configuration managed via Claude Code.
See `setup.md` for full setup reference.

## Environment

Credentials are loaded from `~/.secrets/home_assistant` via `~/.bashrc`:
- `HASS_SERVER` — HA server URL (http://192.168.5.18:8123)
- `HASS_TOKEN` — Long-lived access token

## Skill

Use the `home-assistant-manager` skill for all HA work:
```
/home-assistant-manager
```

## Deployment Workflows

**Rapid iteration (testing):**
```bash
scp file.yaml root@192.168.5.18:/config/
hass-cli service call automation.reload
```

**Final changes (version controlled):**
```bash
git add file.yaml && git commit -m "description" && git push
ssh root@192.168.5.18 "cd /config && git pull"
```

## Key Rules

- Always run `ha core check` before restarting
- Prefer reload over restart when possible
- Use scp for rapid iteration, git for final stable changes
- Test automations manually after deploy with `automation.trigger`
- Check logs after every change
