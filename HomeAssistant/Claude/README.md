claude --resume 0846e491-a312-4cf4-8750-6eeaf6e64b31
---

## What's Been Built

### 1. Dashboard Management (via Claude Code Skill)

The skill can read, edit, and deploy any Lovelace dashboard without manual UI work. It knows:

- All 12 dashboard file names and their URL paths
- The full area → dashboard section mapping so devices get placed correctly
- The correct deploy sequence: edit locally → scp → `ha core restart` (browser refresh alone is not enough)

**What you can ask it to do:**
- Add new devices to a dashboard grouped by their HA area
- Create new dashboard sections for areas that don't exist yet
- Validate JSON before deploying to avoid silent failures

### 2. ZHA Zigbee Device Management (via Claude Code Skill)

The skill understands how Zigbee devices are structured in HA and can look them up efficiently:

- Finds ZHA plug/switch entities by reading the registry files directly (faster than API calls)
- Knows that ZHA entity `area_id` is usually `null` — area is on the **device**, not the entity
- Cross-references `core.entity_registry` → `core.device_registry` to get the correct area
- Knows all currently mapped ZHA plug devices and which dashboard section they belong to

**What you can ask it to do:**
- Find all ZHA outlets or switches and add them to the correct dashboard section
- Identify which Zigbee devices are plugs vs sensors (by `device_class` and model)

### 3. ZHA On-Demand Diagnostic Report (`HA_ZHA_Monitor.json`)

An n8n workflow that produces a full Zigbee network health snapshot on demand. Run it manually any time you want to understand the state of your mesh.

**What it reports:**
- ZHA-related errors from the HA error log
- Offline devices (unavailable state) with timestamps
- Weak signal devices (LQI < 50), sorted weakest-first
- Recent ZHA logbook events

See **[HA_ZHA_Monitor.md](HA_ZHA_Monitor.md)** for full documentation.

### 4. ZHA Proactive Alerting Workflow

A scheduled n8n workflow that runs daily at 4PM and sends push notifications if it detects offline devices or low battery. Uses ntfy and Signal via CallMeBot.

**What triggers an alert:**
- Any ZHA device goes offline
- Any device battery drops below 10%

See **[HA_ZHA_Monitor.md](HA_ZHA_Monitor.md)** for full documentation.

---

## Key Gotchas Learned

These are non-obvious behaviors that have been encoded into the skill so they don't cause failures:

| Gotcha | Detail |
|--------|--------|
| `homeassistant.local` doesn't resolve | Always use `192.168.5.18` for SSH and API calls |
| scp requires a restart | Writing to `.storage/` directly requires `ha core restart` — HA does not hot-reload dashboard files |
| Lovelace REST API is broken for named dashboards | `POST /api/lovelace/config` returns 404 — only works for the default dashboard |
| ZHA entity area is on the device, not the entity | `core.entity_registry` area_id is usually null — look in `core.device_registry` |
| Entity IDs can be misleading | e.g. `switch.sonoff_garage_g_door` lives in the Kitchen area, not Garage |
| `/api/logbook` can crash HA | Triggers a heavy DB query — removed from automated/scheduled workflows |
