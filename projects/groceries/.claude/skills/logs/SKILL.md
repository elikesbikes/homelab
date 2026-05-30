---
name: logs
description: Check logs from the grocery app containers. Use when debugging errors, verifying a deploy worked, or investigating unexpected behavior.
allowed-tools: ["Bash"]
---

# Logs

Fetches logs from both grocery app containers.

## Container Names

| Container | Role |
|---|---|
| `groceries-grocery-proxy-1` | Express proxy + React frontend + Claude/Firecrawl API routes |
| `groceries-grocery-pb-1` | PocketBase database |

## Instructions

### Both containers (default — start here)

```bash
docker logs groceries-grocery-proxy-1 --tail=50 2>&1
echo "--- PocketBase ---"
docker logs groceries-grocery-pb-1 --tail=20 2>&1
```

### Proxy only (API errors, forecast failures, receipt parsing)

```bash
docker logs groceries-grocery-proxy-1 --tail=100 2>&1
```

### Follow live (watching a request in real time)

```bash
docker logs groceries-grocery-proxy-1 --follow 2>&1
```

### PocketBase only (DB errors, migration failures, startup issues)

```bash
docker logs groceries-grocery-pb-1 --tail=50 2>&1
```

## What to look for

- **Proxy logs**: structured JSON — look for `"level":"error"` entries
- **Forecast errors**: `"msg":"Forecast generated"` confirms success; missing means it failed silently
- **Receipt parse errors**: `"msg":"parse-receipt failed"` or Claude API errors
- **PocketBase errors**: plain text — migration failures appear at startup
- **Silent add-item failures**: if items won't save, check for PocketBase 400 validation errors (these only appear server-side, not in the browser)
