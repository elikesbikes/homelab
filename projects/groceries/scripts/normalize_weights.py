#!/usr/bin/env python3
"""
normalize_weights.py — Find and fix purchase_history records where weight/volume
is embedded in the item name instead of being stored as quantity + unit + unit_price.

Example:
  BEFORE: name="Bananas 3lb",  quantity=1, unit="pkg", unit_price=1.99
  AFTER:  name="Bananas",      quantity=3, unit="lb",  unit_price=0.6633

  BEFORE: name="Limes 3lb",    quantity=2, unit="pkg", unit_price=6.99   (2 bags)
  AFTER:  name="Limes",        quantity=6, unit="lb",  unit_price=2.33   (6 lb total, $2.33/lb)

Count-based units (CT, PK, PKG, PC) are intentionally excluded — those prices
are per-package (e.g. "EGGS 18 CT" stays as $8.99/carton, not $0.50/egg).

Usage:
  python3 normalize_weights.py          # dry run — shows what would change
  python3 normalize_weights.py --fix    # preview + confirm before writing
"""

import re
import sys
import json
import datetime
import requests

PB_URL         = "http://localhost:8090"
ADMIN_EMAIL    = "admin@grocery.local"
ADMIN_PASSWORD = "GroceryAdmin123!"

# Weight/volume units to normalize. Count units (CT, PK, PKG) excluded by design.
WEIGHT_RE = re.compile(
    r'^(.*?)\s+(\d+(?:\.\d+)?)\s*(lb|oz|kg|g|gal|fl\.?\s*oz|qt|l|ml)\s*(?:bag|bags|pack|pk)?\s*$',
    re.IGNORECASE
)

# Units that mean "already properly normalized as weight/volume" — skip these
PROPER_WEIGHT_UNITS = {"lb", "oz", "kg", "g", "gal", "fl oz", "qt", "l", "ml"}

UNIT_NORMALIZE = {
    "lb": "lb", "oz": "oz", "kg": "kg", "g": "g",
    "gal": "gal", "floz": "fl oz", "fl.oz": "fl oz", "floz": "fl oz",
    "qt": "qt", "l": "l", "ml": "ml",
}


def auth():
    for endpoint in [
        "/api/collections/_superusers/auth-with-password",
        "/api/admins/auth-with-password",
    ]:
        r = requests.post(
            f"{PB_URL}{endpoint}",
            json={"identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10,
        )
        if r.ok:
            return r.json()["token"]
    r.raise_for_status()


def get_all_records(token):
    headers = {"Authorization": f"Bearer {token}"}
    records, page = [], 1
    while True:
        r = requests.get(
            f"{PB_URL}/api/collections/purchase_history/records",
            params={"page": page, "perPage": 200, "sort": "name,purchase_date"},
            headers=headers,
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        records.extend(data["items"])
        if page >= data["totalPages"]:
            break
        page += 1
    return records


def find_candidates(records):
    candidates = []
    for r in records:
        name      = (r.get("name") or "").strip()
        cur_unit  = (r.get("unit") or "").lower().strip()
        unit_price = float(r.get("unit_price") or 0)
        old_qty   = float(r.get("quantity") or 1)

        m = WEIGHT_RE.match(name)
        if not m:
            continue

        # Already properly normalized to a weight unit — skip
        if cur_unit in PROPER_WEIGHT_UNITS:
            continue

        if unit_price <= 0:
            continue  # can't normalize without a price

        clean_name     = m.group(1).strip()
        embedded_weight = float(m.group(2))
        raw_unit       = m.group(3).lower().replace(" ", "").replace(".", "")
        unit           = UNIT_NORMALIZE.get(raw_unit, raw_unit)

        if not clean_name:
            continue

        # old_qty is the number of packages bought (e.g. 2 bags of 3lb = 6lb total)
        # unit_price is the per-package price
        new_qty        = embedded_weight * old_qty
        new_unit_price = round(unit_price / embedded_weight, 4)
        total_spent    = round(unit_price * old_qty, 2)

        candidates.append({
            "id":             r["id"],
            "store":          r.get("store", ""),
            "purchase_date":  r.get("purchase_date", ""),
            "old_name":       name,
            "new_name":       clean_name,
            "old_qty":        old_qty,
            "new_qty":        new_qty,
            "old_unit":       cur_unit,
            "new_unit":       unit,
            "old_unit_price": unit_price,
            "new_unit_price": new_unit_price,
            "total_spent":    total_spent,
        })

    return candidates


def print_report(candidates):
    if not candidates:
        print("\n✓ No non-normalized records found. Data looks clean.")
        return

    by_name: dict = {}
    for c in candidates:
        by_name.setdefault(c["new_name"], []).append(c)

    print(f"\n{'='*100}")
    print(f"  Found {len(candidates)} non-normalized record(s) across {len(by_name)} item type(s)")
    print(f"{'='*100}")

    for item_name, recs in sorted(by_name.items()):
        print(f"\n  {item_name}")
        print(f"    {'Store':<10} {'Date':<12} {'Old Name':<30} {'Bags':>4} {'Total $':>8}  →  {'Qty':>6} {'Unit':<5} {'$/unit':>8}")
        print(f"    {'-'*95}")
        for c in sorted(recs, key=lambda x: x["purchase_date"]):
            bags_note = f"×{int(c['old_qty'])}" if c["old_qty"] > 1 else "×1"
            print(
                f"    {c['store']:<10} {c['purchase_date']:<12} {c['old_name']:<30} {bags_note:>4} "
                f"${c['total_spent']:>7.2f}  →  {c['new_qty']:>6.2f} {c['new_unit']:<5} ${c['new_unit_price']:>8.4f}"
            )

    print(f"\n  Verification (total_spent = new_unit_price × new_qty must hold):")
    all_ok = True
    for c in candidates:
        check = round(c["new_unit_price"] * c["new_qty"], 2)
        ok = abs(check - c["total_spent"]) < 0.02
        if not ok:
            print(f"    MISMATCH: {c['old_name']} — expected ${c['total_spent']:.2f}, got ${check:.2f}")
            all_ok = False
    if all_ok:
        print(f"    ✓ All {len(candidates)} records check out.")


def save_backup(candidates):
    ts   = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"/home/ecloaiza/devops/projects/groceries/scripts/normalize_backup_{ts}.json"
    with open(path, "w") as f:
        json.dump(candidates, f, indent=2)
    print(f"\n  Backup saved → {path}")
    return path


def apply_fixes(candidates, token):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    success = errors = 0
    for c in candidates:
        r = requests.patch(
            f"{PB_URL}/api/collections/purchase_history/records/{c['id']}",
            json={
                "name":       c["new_name"],
                "quantity":   c["new_qty"],
                "unit":       c["new_unit"],
                "unit_price": c["new_unit_price"],
            },
            headers=headers,
            timeout=10,
        )
        if r.ok:
            success += 1
        else:
            print(f"  ERROR {c['id']} ({c['old_name']}): {r.text[:120]}")
            errors += 1
    print(f"\n  Done: {success} updated, {errors} errors.")


if __name__ == "__main__":
    fix_mode = "--fix" in sys.argv

    print("Authenticating…")
    try:
        token = auth()
    except Exception as e:
        print(f"Auth failed: {e}\nIs PocketBase running? (docker compose up)")
        sys.exit(1)

    print("Fetching purchase_history…")
    records = get_all_records(token)
    print(f"  {len(records)} records loaded.")

    candidates = find_candidates(records)
    print_report(candidates)

    if not candidates:
        sys.exit(0)

    if not fix_mode:
        print("\n  Run with --fix to apply these changes.")
        sys.exit(0)

    save_backup(candidates)

    print(f"\n  Apply {len(candidates)} fix(es)? [y/N] ", end="", flush=True)
    if input().strip().lower() != "y":
        print("  Aborted. No changes made.")
        sys.exit(0)

    print("\n  Applying…")
    apply_fixes(candidates, token)
