#!/usr/bin/env python3
"""Move grocery_items (Costco imports) to purchase_history, then delete from grocery list."""
import json, urllib.request, urllib.error, re

PB_URL = "http://192.168.5.127:8090"
ADMIN_EMAIL = "admin@grocery.local"
ADMIN_PASSWORD = "GroceryAdmin123!"

def pb_request(path, data=None, token=None, method=None):
    url = f"{PB_URL}{path}"
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if method is None:
        method = "POST" if data else "GET"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def get_token():
    r = pb_request("/api/collections/_superusers/auth-with-password",
                   {"identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    return r["token"]

def get_all(token, collection):
    page, items = 1, []
    while True:
        r = pb_request(f"/api/collections/{collection}/records?page={page}&perPage=200&sort=id", token=token)
        items += r["items"]
        if page >= r["totalPages"]:
            break
        page += 1
    return items

token = get_token()
print("Auth OK")

# Fetch all grocery_items
items = get_all(token, "grocery_items")
print(f"Found {len(items)} items to move")

# Parse price and date from notes field: "Costco $12.49 (2026-03-05)"
note_re = re.compile(r"Costco \$([0-9.]+)(?: \(([^)]+)\))?")

moved = 0
failed = 0
for item in items:
    notes = item.get("notes", "")
    m = note_re.match(notes)
    unit_price = float(m.group(1)) if m else 0
    purchase_date = m.group(2) if m and m.group(2) else ""

    payload = {
        "name":          item["name"],
        "quantity":      item.get("quantity") or 1,
        "unit":          item.get("unit") or "",
        "category":      item.get("category") or "other",
        "unit_price":    unit_price,
        "notes":         notes,
        "purchase_date": purchase_date,
        "store":         "Costco",
    }
    try:
        pb_request("/api/collections/purchase_history/records", payload, token)
        moved += 1
    except urllib.error.HTTPError as e:
        print(f"  ERR moving {item['name']}: {e.code}")
        failed += 1

print(f"Moved {moved} items to purchase_history ({failed} failed)")

# Delete all from grocery_items
deleted = 0
for item in items:
    try:
        pb_request(f"/api/collections/grocery_items/records/{item['id']}", token=token, method="DELETE")
        deleted += 1
    except urllib.error.HTTPError as e:
        print(f"  ERR deleting {item['name']}: {e.code}")

print(f"Deleted {deleted} items from grocery_items")
print("Done — grocery list is now empty, history is in purchase_history.")
