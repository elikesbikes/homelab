# CLAUDE.md — Homelab Project Template

## Homelab Constants

These are fixed values on this homelab. Use them in every applicable project:

- **Docker network**: `FRONTEND` (external, already exists — never create it)
- **Log destination**: Graylog syslog at `192.168.5.16:514` (UDP) — every container must send logs here
- **Reverse proxy**: Nginx Proxy Manager (NPM) — already running, handles routing and TLS
- **Storage**: Bind mounts only, always relative to the project directory — never Docker named volumes

---

## Core Rules

### Nothing hardcoded — everything dynamic

Any value that could change when the app moves to a different host, network, or port must be configurable — never a constant in the code. This includes hostnames, IP addresses, ports, and service URLs.

For frontend apps: service URLs must be derived at runtime from the browser's current address, not baked in at build time. A URL hardcoded at build time breaks silently the moment the app is accessed from any other network (VPN, remote, different device).

For backends: every environment-specific value comes from an environment variable with a sensible default.

### No reverse proxy inside containers

NPM already handles all routing on this homelab. Do not add nginx or any other proxy inside a container — it adds complexity with no benefit. Containers expose their port directly and NPM routes to it.

### Secrets in `.env`, never in code

All API keys, passwords, tokens, and credentials go in `.env`. It is always gitignored. Document required variables in `.env.example` with empty values.

### Prefer simple serving tools

For static frontend apps, use a lightweight static file server rather than a full web server like nginx. Keep containers minimal — one job, minimal dependencies.

---

## Development Principles

### Regression testing is mandatory

Before declaring any bug fixed:
1. Search the entire codebase for the same pattern — the same bug often exists in multiple places
2. Trace the complete data flow end to end, not just the layer where you found it
3. Test every variant: if you fixed it for one option, test the other; if it works locally, consider remote access

### Timeout every external call — on both sides

Any call to an external service must have a timeout. Apply this on the frontend (user-facing) AND on the backend (outbound). Without timeouts, a slow or hung external service makes the app appear broken with no feedback to the user. The backend timeout must be long enough to give the external service room to respond before the frontend gives up.

### Async state that closures read must use refs, not state

When a `setTimeout` or event handler (like `onBlur`) needs to check whether an async operation is still in progress, track that with a ref — not state. A closure captures the state value from when it was created and will always read stale data. A ref always reflects the current value.

### Background jobs must not overwrite explicit user choices

When a user explicitly selects a value, protect it from being overwritten by any background process that runs afterward. Track which records the user has explicitly set and skip them in all background enrichment or auto-update logic.

### Structured output from AI requires adequate token budget

When asking an AI model to return structured JSON, always set a token limit high enough to complete the response. Truncated JSON causes parse failures. 256 tokens is rarely sufficient for multi-item structured responses — use 512 or higher.

### Always provide a fallback when external services fail

If a feature depends on an external service (scraping, third-party API), define what happens when that service fails or returns nothing. A fallback that returns something useful is always better than an error or empty state.

### Never touch production data without a backup and explicit confirmation

Before any operation that modifies or could destroy data — schema changes, bulk updates, migrations, collection drops, index rebuilds — you must:
1. Create a timestamped backup of the data directory: `cp -r pb_data pb_data.backup.$(date +%Y%m%d_%H%M%S)`
2. State exactly what the operation will do and what cannot be undone
3. Wait for explicit user confirmation before executing

This applies even when the change seems trivial. A schema PATCH that adds one field can silently wipe all other fields if the API replaces instead of merges. Never assume.

### Read before PATCH on any array-shaped resource

When updating a resource via PATCH where the body contains an array (schema fields, ACL rules, permission lists), always GET the current state first, merge your change into the full array, and PATCH the complete result. Never send a partial array — most APIs replace the array, they do not append to it. Sending only the new element destroys everything else.

---

## Self-Improvement

After fixing any non-trivial bug, ask: *"What rule, if it had been in this file, would have prevented this?"*

If the answer is a clear, generalizable principle — add it here. Project-specific details go in `README.md`. Only add patterns that would apply to any future project.

---

## Recommended Project Structure

Keep the layout consistent across projects so any session can orient quickly.

```
project-root/
├── CLAUDE.md              ← Generic rules (this file — no project specifics)
├── README.md              ← Everything project-specific: stack, ports, schema, patterns, bug history
├── .env                   ← All secrets (gitignored)
├── .env.example           ← Committed template with empty values
├── docker-compose.yml
│
├── app/                   ← Frontend (if applicable)
│   ├── Dockerfile
│   ├── package.json
│   ├── serve.json         ← Static server config (cache headers, rewrites)
│   ├── vite.config.js     ← Or equivalent bundler config
│   └── src/
│       ├── main.jsx
│       ├── App.jsx        ← Root component, global state, data fetching
│       ├── components/    ← UI components, one file per component
│       └── utils/         ← Shared helpers: API clients, formatters, constants
│
├── proxy/ (or api/)       ← Backend proxy (if applicable)
│   ├── Dockerfile
│   ├── package.json
│   └── server.js          ← Single entry point; split into modules if it grows
│
├── data/                  ← Bind mount for persistent data (gitignored)
├── config/                ← Bind mount for runtime config (gitignored)
└── scripts/               ← Maintenance scripts, one-off imports, automation
```

**Rules for this structure:**
- `CLAUDE.md` contains only generic rules — nothing project-specific
- `README.md` contains everything a new session needs: architecture, ports, credentials, schema, known patterns, bug history
- Secrets never leave `.env` — document every required variable in `.env.example`
- `data/` and `config/` are bind mounts; create them before first `docker-compose up`
- One component per file; components only handle UI — data fetching belongs in the parent or a utility

---

### Single-container serving: proxy serves frontend + backend together

When there is only one external DNS entry, build the frontend inside a multi-stage Dockerfile and copy the `dist/` output into the backend image. The backend (Express, etc.) serves the static files via `express.static()` and acts as a catch-all SPA server. This eliminates a separate frontend container and a separate NPM/proxy entry.

In Express 5 with http-proxy-middleware v3, do NOT use `app.use('/api', proxy)` — this strips the `/api` prefix before forwarding to the upstream. Use `pathFilter` on the proxy config and mount it with `app.use(proxy)` instead:
```js
const proxy = createProxyMiddleware({
  target: UPSTREAM_URL,
  pathFilter: (pathname) => pathname.startsWith('/api/') || pathname.startsWith('/_'),
})
app.use(proxy)
```
Also: `app.get('*', handler)` is invalid in Express 5 — use `app.use(handler)` as the SPA fallback.

---

## Deployment

1. Copy core files to the tutorials repo and commit with `gacp_tutorials`
2. Deploy to the target host (tars, gargantua, etc.) via GitHub Actions or manual deploy
