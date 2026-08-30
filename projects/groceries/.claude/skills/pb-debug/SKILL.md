---
name: pb-debug
description: Query and inspect PocketBase data for debugging. Use when checking what's stored in grocery_items or purchase_history, verifying a save worked, or investigating data issues.
allowed-tools: ["Bash"]
---

# PocketBase Debug

Direct curl queries against the local PocketBase API for debugging without needing the admin UI.

## Base URL

```
http://localhost:8090/api/collections
```

## Collections

| Collection | Purpose |
|---|---|
| `grocery_items` | Active shopping list |
| `purchase_history` | All past purchases (receipts + done shopping) |

## Common Queries

### Current grocery list

```bash
curl -s "http://localhost:8090/api/collections/grocery_items/records?sort=id" | python3 -m json.tool
```

### Purchase history — most recent 10

```bash
curl -s "http://localhost:8090/api/collections/purchase_history/records?perPage=10&sort=-purchase_date&fields=name,quantity,unit,unit_price,store,verified,planned,purchase_date" | python3 -m json.tool
```

### Unverified trips (needs Review)

```bash
curl -s "http://localhost:8090/api/collections/purchase_history/records?filter=verified=false&fields=name,quantity,unit_price,store,purchase_date" | python3 -m json.tool
```

### Search by item name

```bash
curl -s "http://localhost:8090/api/collections/purchase_history/records?filter=name~'banana'&sort=-purchase_date&fields=name,quantity,unit,unit_price,store,purchase_date" | python3 -m json.tool
```

### Records with quantity > 1 (weight/bulk items)

```bash
curl -s "http://localhost:8090/api/collections/purchase_history/records?filter=quantity>1&sort=-purchase_date&fields=name,quantity,unit,unit_price,store" | python3 -m json.tool
```

### Test a create (verify schema accepts a payload)

```bash
curl -s http://localhost:8090/api/collections/grocery_items/records \
  -H "Content-Type: application/json" \
  -d '{"name":"test","quantity":1,"unit":"","category":"other","notes":"","is_bought":false,"preferred_store":"Costco","added_by":"TARS"}' \
  | python3 -m json.tool
```

### Delete a test record

```bash
curl -s -X DELETE http://localhost:8090/api/collections/grocery_items/records/<id>
```

## Key schema facts (no need to re-read migrations)

**`grocery_items`** required fields: `name`, `added_by`
**`purchase_history`** `unit_price` is always per-unit (total ÷ qty), never the line total
**`purchase_history`** `planned=true` means came from Done Shopping (grocery list qty); `planned=false` means receipt import
**`purchase_history`** `verified=false` means pending Review Trip confirmation

## Filter syntax

PocketBase filter syntax for curl:
- Equals: `field=value`
- Contains: `field~'text'`
- Greater than: `field>number`
- AND: `field1=value&&field2=value`
- OR: `field1=value||field2=value`
- URL-encode filters: wrap in quotes and use `--data-urlencode` or encode manually
