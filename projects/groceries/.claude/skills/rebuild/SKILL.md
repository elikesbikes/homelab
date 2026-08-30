---
name: rebuild
description: Rebuild and restart the grocery-proxy container after any code change to app/ or proxy/. Use whenever the user changes frontend or backend code and needs to deploy it.
allowed-tools: ["Bash"]
---

# Rebuild

Rebuilds the proxy image (which includes the compiled React frontend) and restarts the container.

## Instructions

Run these two commands in sequence from the project directory:

```bash
cd /home/ecloaiza/devops/projects/groceries
docker compose build --no-cache grocery-proxy && docker compose up -d grocery-proxy
```

After the restart, confirm both containers are up:

```bash
docker compose ps
```

Expected: both `groceries-grocery-pb-1` and `groceries-grocery-proxy-1` show `Up`.

## Notes

- `grocery-pb` (PocketBase) never needs rebuilding — it uses a pre-built image and has no code changes
- `--no-cache` is always required — without it Docker reuses cached layers and code changes may not be picked up
- The build compiles React inside an Alpine stage, then copies `dist/` into the Node proxy image — one build covers both frontend and backend
- After rebuilding, remind the user to **hard refresh** the browser (`Ctrl+Shift+R`) to clear the cached JS bundle
