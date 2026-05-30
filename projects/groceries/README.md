# Grocery Forecast App

Shared household grocery list with AI-powered spending forecasts. Real-time sync across devices. Three users: **TARS**, **Wife**, **Son**. Fully self-hosted except the Claude API.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Stack](#2-stack)
3. [Ports & Access](#3-ports--access)
4. [Environment Variables](#4-environment-variables)
5. [PocketBase Schema](#5-pocketbase-schema)
6. [Features](#6-features)
7. [Key Implementation Patterns](#7-key-implementation-patterns)
8. [Deploy](#8-deploy)
9. [File Structure](#9-file-structure)
10. [Costco Receipt Import](#10-costco-receipt-import)
11. [Firecrawl Notes](#11-firecrawl-notes)
12. [Bugs Fixed](#12-bugs-fixed)

---

## 1. Architecture

```
[Browser] → groceries.home.elikesbikes.com → grocery-proxy:3001
  ├── /          React SPA (served as static files from proxy)
  ├── /api/*     Our API routes (forecast, search, parse-receipt)
  ├── /api/*     PocketBase REST API (proxied to grocery-pb:8090 internally)
  └── /_/*       PocketBase admin UI (proxied to grocery-pb:8090 internally)

grocery-proxy → Anthropic API   (Claude — forecasting + receipt OCR)
grocery-proxy → Firecrawl API   (web scraping — real product prices)
```

Two containers, one external DNS entry. The Express proxy serves the built React frontend as static files AND forwards PocketBase traffic to the internal container. All containers on the `FRONTEND` Docker network. Logs to Graylog at `192.168.5.16:514`.

---

## 2. Stack

| Layer | Tech | Version |
|---|---|---|
| Frontend | Vite + React + Tailwind CSS | React 19, Vite 8, Tailwind 3 |
| Database | PocketBase (SQLite, realtime SSE) | latest |
| Backend proxy | Express.js | v5 |
| AI model | `claude-haiku-4-5-20251001` | configurable via `CLAUDE_MODEL` |
| Web scraping | Firecrawl (`proxy: 'stealth'`) | required for retail sites |
| Build | Multi-stage Dockerfile | React built in Alpine, output copied to proxy image |

---

## 3. Ports & Access

| Service | Port | Purpose |
|---|---|---|
| `grocery-pb` | 8090 | PocketBase API + admin UI (internal only) |
| `grocery-proxy` | 3001 | React SPA + Claude/Firecrawl API + PocketBase proxy |

**External URL**: `https://groceries.home.elikesbikes.com` → NPM → `grocery-proxy:3001`

Only **one** DNS entry needed. The proxy handles everything: static files, our API routes, and PocketBase forwarding.

All URLs use `window.location.origin` — no build-time URL baking. App works from any hostname, IP:port, Tailscale, or custom domain without a rebuild.

**PocketBase Admin UI**: `https://groceries.home.elikesbikes.com/_/`
Credentials: `admin@grocery.local` / `GroceryAdmin123!`
All collection API rules: `""` (open, no auth required)

---

## 4. Environment Variables

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

```env
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5-20251001
FIRECRAWL_API_KEY=fc-...
SPROUTS_STORE_ID=1216

# Single domain — proxy serves frontend AND forwards PocketBase traffic
VITE_PB_URL=https://groceries.home.elikesbikes.com
VITE_PROXY_URL=https://groceries.home.elikesbikes.com

PB_ADMIN_EMAIL=admin@grocery.local
PB_ADMIN_PASSWORD=...
```

> `VITE_PB_URL` and `VITE_PROXY_URL` are set but **not used by the frontend**. The frontend derives all URLs from `window.location.origin` at runtime — no build-time baking. They exist as documentation and for future tooling.

---

## 5. PocketBase Schema

### Collection: `grocery_items`

| Field | Type | Notes |
|---|---|---|
| `name` | text | User-typed or selected from search |
| `quantity` | number | Supports decimals (e.g. 2.5 lb) |
| `unit` | text | Optional (lb, oz, pkg, etc.) |
| `category` | text | produce / dairy / meat / frozen / pantry / other |
| `notes` | text | Optional |
| `added_by` | text | **Required** — TARS / Wife / Son |
| `is_bought` | bool | Checkbox state |
| `preferred_store` | text | Costco or Sprouts |
| `ai_price` | number | Unit price saved from last forecast |
| `ai_store` | text | Store from last forecast |
| `ai_product` | text | Exact product name from store (pinned if user-selected) |

### Collection: `purchase_history`

| Field | Type | Notes |
|---|---|---|
| `name` | text | Product name |
| `quantity` | number | Weight or count purchased |
| `unit` | text | lb / oz / ct / etc. |
| `category` | text | Same categories as grocery_items |
| `unit_price` | number | **Always per-unit** — total ÷ quantity. Enables fair price comparison across trips |
| `notes` | text | Optional |
| `purchase_date` | text | YYYY-MM-DD |
| `store` | text | Costco or Sprouts |
| `verified` | bool | `true` = confirmed price; `false` = needs Review Trip |
| `planned` | bool | `true` = came from grocery list (Done Shopping); `false` = receipt import |

---

## 6. Features

### User Identity

On first visit, a name picker modal asks **Who are you?** (TARS / Wife / Son). The selection is saved to `localStorage` and included as `added_by` on every item create. Required by the PocketBase schema.

### Add Item Form

- **Store toggle**: Costco (default) / Sprouts
- **Shortcut prefixes**: `s:` or `s ` switches to Sprouts; `c:` switches to Costco
- **History autocomplete**: matches from `purchase_history`, sorted newest-first, showing `×N` qty badge for last purchased quantity. Selecting pre-fills both name and qty.
- **Live search**: `Search [Store] for "X" →` option calls `/api/search-products` via Firecrawl, shows a spinner during the 5–12s fetch, returns real products with current prices
- **Refine search**: inline input to adjust query without dismissing results
- **Known result pinning**: selecting a live search result passes `knownResult: { storeProduct, price }` to `addItem`, which pins it in `pinnedAiIds` so the auto-forecast never overwrites it
- **Decimal qty**: accepts `2.5`, `0.37`, etc.

### Grocery List

- Columns: item name · **Qty** · **Total** (unit price × quantity) · Store
- `displayName = aiData[id].storeProduct || item.name` — shows the exact store product name when known
- Category badge (color-coded) + store badge (blue = Costco, green = Sprouts)
- Check off items → **Done Shopping** button appears → store picker modal → saves to `purchase_history` with `verified=false, planned=true`

### Forecast (auto, 2s debounce)

Triggers automatically 2 seconds after the list changes. Three-tier lookup per item:

1. **History match** — `purchase_history`, store-strict fuzzy match, most recent price wins
2. **Firecrawl scrape** — real current price from store website (Sprouts or Costco)
3. **Claude estimate** — fallback only; prompt includes `[buy at: Store]` annotation

`totalEstimate` and `categoryBreakdown` both multiply `unit_price × quantity` — adding 3 yogurts triples the forecast cost correctly.

Web-scraped prices are saved to `purchase_history` as `verified=true` — the next forecast hits history instead of Firecrawl again.

On page load: `ai_price/ai_store/ai_product` are restored from PocketBase fields — no forecast call on refresh.

### Done Shopping → Review Trips (History Tab)

Bought items are saved to `purchase_history` with `verified=false` and deleted from `grocery_items`. The History tab shows an amber badge with the unverified count.

**Review flow** (`TripGroup`):
- Upload a receipt photo or Costco JSON to auto-match prices
- Each item row shows: name · estimated price · total $ input · qty/unit fields · per-unit price
- **Receipt photo**: Claude Vision extracts line items and matches them against the trip's known item names using `matchScore` (Jaccard word-overlap, requires ≥50% match to prevent false positives like "Ground Beef" matching "Ground Turkey")
- **Costco JSON**: parses `data.receiptsWithCounts.receipts[0].itemArray`; extracts `salesUom`/`quantity` for weight items automatically
- **Weight-in-name parsing**: Claude prompt explicitly handles cases like "Limes 3 lb bag" → name=Limes, qty=3, unit=lb, unitPrice=price÷3
- Unmatched receipt items appear as "Also on this receipt" extras — can be added to history with one tap, carrying through qty/unit and computing `unit_price = total ÷ qty`
- **Editable receipt date**: auto-detected from photo, always overridable
- **Re-open**: any verified trip can be re-opened for correction

**Add Receipt** (for new receipts not tied to a shopping list):
- Same photo / JSON / paste flow
- Auto-detects date from receipt
- All items editable before saving

**Past trips**: grouped by month, no date limit.

### Insights Tab

- Total spend, items tracked, shopping days
- Monthly spend chart (last 6 months), by store, by category
- Item price-over-time: dropdown selector, sparkline SVG, price history table

---

## 7. Key Implementation Patterns

### `pinnedAiIds` — prevent forecast overwriting user-selected product

When a user picks a product from live search, `addItem` is called with `knownResult`. App.jsx immediately sets `aiData`, saves to PocketBase, and adds the item ID to `pinnedAiIds = useRef(new Set())`. The forecast skips all pinned IDs. Pin is cleared on `deleteItem`.

### `isSearchingRef` — keep dropdown open during Firecrawl fetch

Firecrawl takes 5–12 seconds. Without protection, `onBlur` closes the dropdown before results arrive. Fix: `isSearchingRef = useRef(false)`. The blur handler checks `if (!isSearchingRef.current) setShowSuggestions(false)`. Must use `useRef` not `useState` — a setTimeout closure captures the stale state value from when it was created.

### `lastForecastSig` — prevent forecast infinite loop

The forecast saves AI data back to PocketBase, which triggers a realtime `update` event, which changes `items`, which would re-trigger the forecast. Fix: build a signature from `id:name:quantity:preferred_store:is_bought` per active item. `ai_price`/`ai_store`/`ai_product` are intentionally excluded from the sig.

### `addItem` dependency array — stale closure with `useCallback`

`addItem` captures `currentUser` from the render it was created in. Using `useCallback(fn, [])` would permanently capture the initial empty string. The dependency array is `[currentUser]` so the callback recreates when the user name changes.

### `requestKey: null` — PocketBase iOS auto-cancellation

All `getFullList` / `getList` calls need `{ requestKey: null }`. Without it, the PocketBase SDK auto-cancels duplicate requests — on iPhone, multiple components mounting simultaneously cancel each other's requests silently.

### `queryMatchScore` — filter Firecrawl results

Firecrawl returns everything on the search page. Post-filter: count query words (≥3 chars, handles plural/singular) that appear in the product name. Show products matching ALL words first; relax to all-but-one only for queries with 3+ words. Prevents "liquid eggs" from returning shell egg products.

### `unit_price` always stored per unit

`purchase_history.unit_price` is always the per-unit price (total ÷ quantity), never the line total. This enables fair price comparison across trips where different quantities were purchased.

### Single-domain architecture

Express proxy serves the React SPA (`./public/`) AND forwards PocketBase API traffic internally. The browser talks to one domain only.

- `pathFilter: (pathname) => pathname.startsWith('/_') || pathname.startsWith('/api/')` — Express does NOT strip the prefix before forwarding (critical in Express 5 / http-proxy-middleware v3)
- SPA fallback: `app.use((_req, res) => res.sendFile(...index.html))` — `app.get('*', ...)` is invalid in Express 5

---

## 8. Deploy

```bash
cd /home/ecloaiza/devops/projects/groceries

# Full rebuild (frontend + proxy):
docker compose up --build -d

# Rebuild proxy only (frontend is built inside — no separate step):
docker compose build --no-cache grocery-proxy
docker compose up -d grocery-proxy
```

NPM entry: `groceries.home.elikesbikes.com` → `localhost:3001`

### Auto-start on boot

Managed by systemd: `/etc/systemd/system/groceries.service` — enabled, starts automatically after reboot.

```bash
sudo systemctl start groceries     # start manually
sudo systemctl stop groceries      # stop
sudo systemctl status groceries    # check status
```

---

## 9. File Structure

```
groceries/
├── CLAUDE.md                        ← Generic homelab rules (no project specifics)
├── README.md                        ← This file — all project specifics
├── .env                             ← Secrets (gitignored)
├── .env.example                     ← Committed template with empty values
├── Dockerfile                       ← Multi-stage: React built in Alpine, dist/ copied to proxy image
├── docker-compose.yml
├── pb_data/                         ← PocketBase bind mount (gitignored)
├── pb_migrations/                   ← Schema migrations (JS format, run by PocketBase on startup)
├── scripts/
│   ├── backup-db.sh                 ← Timestamped pb_data backup
│   ├── import_receipts_4_5.py       ← Costco GraphQL + Sprouts text receipt importer
│   ├── import_to_history.py         ← Bulk history import
│   ├── import_jan_feb_2026.py       ← Jan/Feb 2026 Sprouts import
│   ├── migrate_to_history.py        ← Schema migration helper
│   └── normalize_weights.py         ← Normalize weight-based purchase records
├── proxy/
│   ├── package.json
│   └── server.js                    ← Express: our API routes + PB proxy + static file serving
└── app/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx                  ← Global state, forecast logic, pinnedAiIds, currentUser
        ├── utils/
        │   ├── pb.js                ← PocketBase client (window.location.origin)
        │   ├── categories.js        ← Keyword → category detection
        │   └── prompts.js
        └── components/
            ├── NamePickerModal.jsx  ← First-visit user selector (TARS / Wife / Son)
            ├── AddItemForm.jsx      ← Live store search, history autocomplete, isSearchingRef
            ├── GroceryList.jsx      ← Qty column, Total (price × qty) column
            ├── ForecastPanel.jsx    ← totalEstimate display, category breakdown
            ├── ReviewTrip.jsx       ← Receipt upload, trip verification, purchase history
            └── InsightsPanel.jsx    ← Spend charts, price-over-time
```

---

## 10. Costco Receipt Import

Costco order history is available via GraphQL (Network tab at the orders page). Akamai blocks headless browser login, so capture is manual from an authenticated browser session.

**Script**: `scripts/import_receipts_4_5.py`

- Auth to PocketBase as admin, then POST to `purchase_history`
- Skip lines: description starts with `/`, starts with `CA REDEMP`, unit < 0, dept 39 (clothing)
- Dept → category: 65=produce, 18=frozen, 17=dairy, 13/12=pantry, 61/63/19=meat, rest=other
- Sets `added_by="TARS"`, `verified=true`
- **Not idempotent** — don't run twice for the same receipt

Receipts imported (all 2026):
- **Costco**: Mar 5, Mar 12 (×2), Mar 17, Mar 24, Apr 8, Apr 20, Apr 26, May 2, May 4, May 9, May 15, May 22
- **Sprouts**: Dec 19, Dec 24, Jan 16, Feb 1, Feb 8, Mar 21, May 19 (×2)

---

## 11. Firecrawl Notes

- **Always `proxy: 'stealth'`** — `'basic'` is blocked by both Costco and Sprouts, returns bot-detection pages; AI hallucinates products from those pages
- Costco `waitFor`: 12000ms (slow JS rendering), AbortController: `waitFor + 20000`
- Sprouts `waitFor`: 5000ms, AbortController: `waitFor + 10000`
- Frontend search timeout: 40000ms (must exceed proxy's worst-case)
- Costco search URL: `https://www.costco.com/s?keyword=X`
- Sprouts search URL: `https://shop.sprouts.com/search?query=X&store_id=1216`

---

## 12. Bugs Fixed

| Bug | Fix |
|---|---|
| `added_by` required field never sent → every create silently failed | `addItem` now sends `added_by: currentUser`; NamePickerModal gates app on first visit, persists to localStorage |
| `useCallback(fn, [])` stale closure sent empty `added_by` even after name picked | Added `currentUser` to `addItem` dependency array |
| Forecast total ignored quantity — 3 yogurts showed price of 1 | `totalEstimate` and `categoryBreakdown` now multiply by `item.quantity` |
| Qty input rejected decimals | Changed `step="1"` → `step="any"`, `min="1"` → `min="0.01"` |
| History suggestion pre-filled qty but `parseJsonText` hardcoded qty:1/unit:pkg | `parseJsonText` now uses `it.quantity`/`it.unit` from parsed result |
| `addExtra` always saved `quantity: 1` | Now saves `extra.qty` and computes `unit_price = total ÷ qty` |
| Costco JSON parser ignored salesUom/quantity fields | Now extracts weight items using `salesUom`, `quantity`, `itemUnitPriceAmount` |
| Two DNS entries required | Single-domain: proxy serves frontend + proxies PocketBase internally |
| Photo upload failing from external domain | Same-origin architecture — all requests go to one URL |
| `app.use('/api', pbProxy)` stripped path prefix | Use `pathFilter` on proxy + `app.use(pbProxy)` — no prefix stripping |
| `app.get('*', ...)` crashed in Express 5 | Use `app.use((_req, res) => ...)` as SPA fallback |
| Global `express.json()` broke PB proxy writes | Per-route `parseJson` middleware — only applied to `/api/forecast` and `/api/parse-receipt` |
| Photo upload HTTP 500 (Claude rejects large images) | Client-side `resizeImage()` — Canvas API, max 1600px, 85% JPEG quality before sending |
| NewReceiptForm save "request aborted" | `requestKey: null` on all parallel `Promise.all` creates |
| Costco imported trips showing $0 prices | `parseReceiptJson` handles `data.receiptsWithCounts.receipts[0].itemArray` format |
| App inaccessible from IP:port, Tailscale, other hostnames | Removed all VITE env var usage; `window.location.origin` is the sole URL source |
| Per-unit pricing lost in photo upload (NewReceiptForm) | Store `totalPrice` and `unitPrice` separately; show qty/unit row for weighted items |
| import_to_history.py created 116 duplicates | Added `if __name__ == "__main__"` guard; renamed `r` var that overwrote function |
| import_to_history.py sort=created returned 400 | Fetch without sort, sort in Python |
| DELETE request 400 with Content-Type header | Removed Content-Type from headers on requests with no body |
| Empty list on Tailscale / remote access | `window.location.origin` fallback in `pb.js` and all `PROXY_URL` consts |
| Forecast infinite loop | `lastForecastSig` ref excludes AI fields |
| Cross-store price bleed | Store-strict `findMatch` — no cross-store fallback |
| Claude ignoring preferred store | `[buy at: Store]` annotation in item list |
| iPhone silent request cancellation | `requestKey: null` on all PocketBase list calls |
| Photo upload 413 error | `express.json({ limit: '20mb' })` |
| Receipt OCR "KS" → "Kansas" | `knownItems` list + `expandCostcoAbbreviations()` post-processing |
| Dropdown closes before results arrive | `isSearchingRef = useRef(false)` blocks onBlur |
| Forecast overwrites user-picked product | `pinnedAiIds = useRef(new Set())` skips pinned IDs |
| Wrong search results (shell eggs for liquid eggs) | `queryMatchScore` word-match filtering |
| Hardcoded "Sprouts" in 5 places across AddItemForm | Grep'd and fixed all; use `s.store` / `selectedStore` throughout |
| `proxy: 'basic'` broke scraping | Reverted to `'stealth'` — retail sites block basic crawlers |
| Costco search AbortController fired too early | `waitFor: 12000`, abort at `waitFor + 20000` |
