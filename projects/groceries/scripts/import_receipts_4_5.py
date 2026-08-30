#!/usr/bin/env python3
"""Import multiple Costco receipts into PocketBase grocery_items."""
import json, urllib.request, urllib.error

PB_URL = "http://192.168.5.127:8090"
ADMIN_EMAIL = "admin@grocery.local"
ADMIN_PASSWORD = "GroceryAdmin123!"

DEPT_CATEGORY = {
    65: "produce",
    18: "frozen",
    17: "dairy",
    13: "pantry",
    14: "other",   # household (toilet paper, etc)
    12: "pantry",  # snacks/nuts
    19: "meat",    # deli/tofu
    20: "other",   # health/beauty
    61: "meat",    # fresh meat
    62: "pantry",  # bakery
    63: "meat",    # prepared deli (rotisserie)
    27: "other",   # garden
}

NAME_MAP = {
    "10LB BAKERS":   "Baker Potatoes 10lb",
    "OG CARROT6LB":  "Organic Carrots 6lb",
    "ORG BELLAS":    "Organic Bella Mushrooms",
    "KS WLD BLBRY":  "KS Wild Blueberries",
    "PEETS DECAF":   "Peet's Decaf Coffee",
    "**KS BATH**":   "KS Bath Tissue",
    "ORG. DATES":    "Organic Dates",
    "KS ORG EVOO":   "KS Organic Olive Oil",
    "KS MOZ SHRED":  "KS Mozzarella Shredded",
    "CHICKEN SLD":   "Rotisserie Chicken",
    "CANNED CHCKN":  "Canned Chicken",
    "KS PINK SALT":  "KS Pink Salt Fine Grind",
    "BC GRILLO":     "Grillo's Pickles",
    "SPCY STRIPS":   "Spicy Chicken Strips (Just Bare)",
    "KS ORG TOFU":   "KS Organic Tofu",
    "KEFIR INDIV":   "Kefir Individual (Lifeway)",
    "GRD BEEF PK":   "Ground Beef 93% Lean 4lb",
    "POTTINGSOIL":   "Potting Soil",
    "IRISH SPRING":  "Irish Spring Soap",
    "SPLENDA 1000":  "Splenda 1000ct",
    "PANTENE SH":    "Pantene Shampoo",
    "ORG CELERY":    "Organic Celery",
    "KS ALMONDS":    "KS Almonds",
    "SALT & LIME":   "Salt & Lime Tortilla Chips",
    "VENUS":         "Venus Razor",
    "ORG GUAVA JC":  "Organic Guava Juice",
    "2% MILK":       "2% Milk",
    "WONTON RAMEN":  "Wonton Ramen",
    "BEYOND BURGR":  "Beyond Burger",
    "DEKOPON":       "Dekopon Citrus",
    "NAAN DIPPERS":  "Naan Dippers",
    "KS BAGUETTE":   "KS Baguette",
    "CROUTONS":      "Croutons (Kooshy)",
    "ORG BANANAS":   "Organic Bananas",
    "CELERY SALAD":  "Celery Salad",
    "SCOOP AWAY":    "Scoop Away Cat Litter",
    "AVOCA SPRAY":   "Avocado Oil Spray",
    "PASTURE EGGS":  "Pasture Raised Eggs 2dz",
    "CHOLULA HOT":   "Cholula Hot Sauce",
    "WILD SALMON":   "Wild Salmon",
    "PUMPKIN SEED":  "Pumpkin Seeds (Go Raw)",
    "KS SPARKLING":  "KS Sparkling Water",
    "PRAWN HACAO":   "Prawn Har Gow",
    "KS SPARK WAT":  "KS Sparkling Water",
    "GREEK YOGURT":  "Greek Yogurt",
    "ORGANIC MILK":  "Organic Milk",
    "SALMON MILAN":  "Salmon Milano",
    "BRN RICE RMN":  "Brown Rice Ramen (Lotus Foods)",
    "BERTOLI SCE":   "Bertolli Pasta Sauce",
    "ROMA TOMATO":   "Roma Tomatoes 3lb",
    "YELLOW TUNA":   "Yellowfin Tuna",
    "DOTS PRETZEL":  "Dots Pretzels",
    "AVOCADOS":      "Avocados 6-count",
    "BANANAS":       "Bananas 3lb",
    "LIMES 3 LB.":   "Limes 3lb",
    "PINEAPPLE":     "Pineapple",
    "SOY SAUCE":     "Soy Sauce",
    "CREST MWASH":   "Crest Mouthwash",
    "TRU FRU":       "Tru Fru Frozen Fruit",
    "CREST CMPLTE":  "Crest Complete Toothpaste",
    "CASCSHNBOOST":  "Cascade Dishwasher Pods",
    "KINDERS RUB":   "Kinder's Seasoning Rub",
    "SPICY CRUNCH":  "Spicy Crunch Sushi",
    "DUMPLINGS":     "Dumplings",
    "ORGANIC GRND":  "Organic Ground Beef 4lb",
    "DOVE ADV":      "Dove Body Wash",
}

SKIP_DEPTS = {39}  # clothing

def should_skip(item):
    d = item["itemDescription01"]
    if d and (d.startswith("/") or d.startswith("CA REDEMP")):
        return True
    if item.get("unit", 1) is not None and item.get("unit", 1) < 0:
        return True
    if item.get("itemDepartmentNumber") in SKIP_DEPTS:
        return True
    return False

def clean_name(raw):
    raw = raw.strip()
    return NAME_MAP.get(raw, raw.title())

def dept_to_category(dept):
    return DEPT_CATEGORY.get(dept, "other")

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

def import_receipt(token, receipt_json):
    receipt = receipt_json["data"]["receiptsWithCounts"]["receipts"][0]
    date = receipt["transactionDate"]
    total = receipt["total"]
    label = f"Costco {date} ${total:.2f}"
    items = receipt["itemArray"]
    ok = skipped = 0
    for item in items:
        if should_skip(item):
            skipped += 1
            continue
        name = clean_name(item["itemDescription01"])
        qty  = item.get("unit") or 1
        dept = item.get("itemDepartmentNumber", 0)
        cat  = dept_to_category(dept)
        price = item.get("itemUnitPriceAmount", 0)
        notes = f"Costco ${price:.2f} ({date})"
        payload = {
            "name":      name,
            "quantity":  qty,
            "unit":      "pkg",
            "category":  cat,
            "notes":     notes,
            "added_by":  "TARS",
            "is_bought": False,
        }
        try:
            pb_request("/api/collections/grocery_items/records", payload, token)
            print(f"  OK  [{cat:7s}] {name} x{qty}")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"  ERR {name}: {e.code} {e.read().decode()}")
    print(f"  → {label}: {ok} imported, {skipped} skipped\n")

# ── Receipts with actual JSON ─────────────────────────────────────────────────

RECEIPT_MAR17_A = {"data":{"receiptsWithCounts":{"receipts":[{"warehouseName":"CARMEL MOUNTAIN","transactionDate":"2026-03-17","total":19.98,"itemArray":[{"itemDescription01":"ORG. DATES","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":11.99},{"itemDescription01":"PASTURE EGGS","itemDepartmentNumber":17,"unit":1,"itemUnitPriceAmount":7.99}]}]}}}

RECEIPT_MAR17_B = {"data":{"receiptsWithCounts":{"receipts":[{"warehouseName":"CARMEL MOUNTAIN","transactionDate":"2026-03-17","total":66.93,"itemArray":[{"itemDescription01":"ORG BANANAS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":2.49},{"itemDescription01":"GREEK YOGURT","itemDepartmentNumber":17,"unit":3,"itemUnitPriceAmount":7.49},{"itemDescription01":"DEKOPON","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":8.99},{"itemDescription01":"BEYOND BURGR","itemDepartmentNumber":18,"unit":1,"itemUnitPriceAmount":15.99},{"itemDescription01":"WONTON RAMEN","itemDepartmentNumber":18,"unit":1,"itemUnitPriceAmount":16.99}]}]}}}

RECEIPT_MAR12 = {"data":{"receiptsWithCounts":{"receipts":[{"warehouseName":"CARMEL MOUNTAIN","transactionDate":"2026-03-12","total":102.13,"itemArray":[{"itemDescription01":"TRU FRU","itemDepartmentNumber":18,"unit":1,"itemUnitPriceAmount":13.89},{"itemDescription01":"2% MILK","itemDepartmentNumber":17,"unit":1,"itemUnitPriceAmount":6.39},{"itemDescription01":"ORG GUAVA JC","itemDepartmentNumber":13,"unit":1,"itemUnitPriceAmount":6.29},{"itemDescription01":"CA REDEMP VAL N EE/1078110","itemDepartmentNumber":0,"unit":1,"itemUnitPriceAmount":0},{"itemDescription01":"VENUS","itemDepartmentNumber":20,"unit":1,"itemUnitPriceAmount":34.99},{"itemDescription01":"DEKOPON","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":8.99},{"itemDescription01":"BANANAS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":1.99},{"itemDescription01":"KS WLD BLBRY","itemDepartmentNumber":18,"unit":1,"itemUnitPriceAmount":12.99},{"itemDescription01":"DUMPLINGS","itemDepartmentNumber":18,"unit":1,"itemUnitPriceAmount":13.69}]}]}}}

RECEIPT_MAR05 = {"data":{"receiptsWithCounts":{"receipts":[{"warehouseName":"CARMEL MOUNTAIN","transactionDate":"2026-03-05","total":158.21,"itemArray":[{"itemDescription01":"10LB BAKERS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":4.99},{"itemDescription01":"KS WLD BLBRY","itemDepartmentNumber":18,"unit":1,"itemUnitPriceAmount":12.99},{"itemDescription01":"GREEK YOGURT","itemDepartmentNumber":17,"unit":3,"itemUnitPriceAmount":7.49},{"itemDescription01":"OG CARROT6LB","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":5.49},{"itemDescription01":"AVOCADOS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":5.99},{"itemDescription01":"ORG BELLAS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":6.99},{"itemDescription01":"BANANAS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":1.99},{"itemDescription01":"LIMES 3 LB.","itemDepartmentNumber":65,"unit":2,"itemUnitPriceAmount":6.99},{"itemDescription01":"ADIDASHOODIE","itemDepartmentNumber":39,"unit":1,"itemUnitPriceAmount":19.99},{"itemDescription01":"/ 1935728","itemDepartmentNumber":39,"unit":-1,"itemUnitPriceAmount":0},{"itemDescription01":"PASTURE EGGS","itemDepartmentNumber":17,"unit":1,"itemUnitPriceAmount":7.99},{"itemDescription01":"PEETS DECAF","itemDepartmentNumber":13,"unit":1,"itemUnitPriceAmount":22.99},{"itemDescription01":"**KS BATH**","itemDepartmentNumber":14,"unit":1,"itemUnitPriceAmount":20.99},{"itemDescription01":"ORGANIC MILK","itemDepartmentNumber":17,"unit":1,"itemUnitPriceAmount":12.49}]}]}}}

RECEIPT_MAY09 = {"data":{"receiptsWithCounts":{"receipts":[{"warehouseName":"POWAY","transactionDate":"2026-05-09","total":166.91,"itemArray":[{"itemDescription01":"BC GRILLO","itemDepartmentNumber":12,"unit":1,"itemUnitPriceAmount":7.29},{"itemDescription01":"/1930576","itemDepartmentNumber":12,"unit":-1,"itemUnitPriceAmount":0},{"itemDescription01":"CANNED CHCKN","itemDepartmentNumber":13,"unit":1,"itemUnitPriceAmount":13.99},{"itemDescription01":"ORG BELLAS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":6.99},{"itemDescription01":"WV TECH PANT","itemDepartmentNumber":39,"unit":1,"itemUnitPriceAmount":19.99},{"itemDescription01":"CHICKEN SLD","itemDepartmentNumber":63,"unit":1,"itemUnitPriceAmount":5.99},{"itemDescription01":"KS PINK SALT","itemDepartmentNumber":13,"unit":1,"itemUnitPriceAmount":6.59},{"itemDescription01":"CROUTONS","itemDepartmentNumber":13,"unit":1,"itemUnitPriceAmount":7.99},{"itemDescription01":"KS BAGUETTE","itemDepartmentNumber":62,"unit":1,"itemUnitPriceAmount":4.99},{"itemDescription01":"KS WLD BLBRY","itemDepartmentNumber":18,"unit":1,"itemUnitPriceAmount":12.99},{"itemDescription01":"KS ORG EVOO","itemDepartmentNumber":13,"unit":1,"itemUnitPriceAmount":16.89},{"itemDescription01":"AVOCADOS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":6.99},{"itemDescription01":"KS MOZ SHRED","itemDepartmentNumber":17,"unit":1,"itemUnitPriceAmount":12.59},{"itemDescription01":"GREEK YOGURT","itemDepartmentNumber":17,"unit":2,"itemUnitPriceAmount":7.49},{"itemDescription01":"NAAN DIPPERS","itemDepartmentNumber":19,"unit":1,"itemUnitPriceAmount":6.79},{"itemDescription01":"/1433996","itemDepartmentNumber":19,"unit":-1,"itemUnitPriceAmount":0},{"itemDescription01":"SPCY STRIPS","itemDepartmentNumber":18,"unit":1,"itemUnitPriceAmount":14.99}]}]}}}

RECEIPT_MAY04 = {"data":{"receiptsWithCounts":{"receipts":[{"warehouseName":"CARMEL MOUNTAIN","transactionDate":"2026-05-04","total":57.17,"itemArray":[{"itemDescription01":"32D MENS PNT","itemDepartmentNumber":39,"unit":1,"itemUnitPriceAmount":16.99},{"itemDescription01":"KS ORG TOFU","itemDepartmentNumber":19,"unit":1,"itemUnitPriceAmount":5.89},{"itemDescription01":"GREEK YOGURT","itemDepartmentNumber":17,"unit":1,"itemUnitPriceAmount":7.49},{"itemDescription01":"PUMPKIN SEED","itemDepartmentNumber":12,"unit":1,"itemUnitPriceAmount":10.99},{"itemDescription01":"KEFIR INDIV","itemDepartmentNumber":17,"unit":1,"itemUnitPriceAmount":14.49}]}]}}}

RECEIPT_MAY02 = {"data":{"receiptsWithCounts":{"receipts":[{"warehouseName":"CARMEL MOUNTAIN","transactionDate":"2026-05-02","total":169.98,"itemArray":[{"itemDescription01":"BANANAS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":1.99},{"itemDescription01":"IRISH SPRING","itemDepartmentNumber":20,"unit":1,"itemUnitPriceAmount":11.99},{"itemDescription01":"POTTINGSOIL","itemDepartmentNumber":27,"unit":1,"itemUnitPriceAmount":11.99},{"itemDescription01":"/1372969","itemDepartmentNumber":27,"unit":-1,"itemUnitPriceAmount":0},{"itemDescription01":"SPLENDA 1000","itemDepartmentNumber":13,"unit":1,"itemUnitPriceAmount":18.69},{"itemDescription01":"WV TECH PANT","itemDepartmentNumber":39,"unit":1,"itemUnitPriceAmount":19.99},{"itemDescription01":"/1841928","itemDepartmentNumber":39,"unit":-1,"itemUnitPriceAmount":0},{"itemDescription01":"ROMA TOMATO","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":6.99},{"itemDescription01":"GRD BEEF PK","itemDepartmentNumber":61,"unit":1,"itemUnitPriceAmount":24.99},{"itemDescription01":"PANTENE SH","itemDepartmentNumber":20,"unit":1,"itemUnitPriceAmount":12.99},{"itemDescription01":"/1903627","itemDepartmentNumber":20,"unit":-1,"itemUnitPriceAmount":0},{"itemDescription01":"ORG BELLAS","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":6.99},{"itemDescription01":"ORG CELERY","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":6.49},{"itemDescription01":"PINEAPPLE","itemDepartmentNumber":65,"unit":1,"itemUnitPriceAmount":3.39},{"itemDescription01":"PASTURE EGGS","itemDepartmentNumber":17,"unit":1,"itemUnitPriceAmount":7.99},{"itemDescription01":"KS ALMONDS","itemDepartmentNumber":12,"unit":1,"itemUnitPriceAmount":12.99},{"itemDescription01":"**KS BATH**","itemDepartmentNumber":14,"unit":1,"itemUnitPriceAmount":20.99},{"itemDescription01":"SALT & LIME","itemDepartmentNumber":12,"unit":1,"itemUnitPriceAmount":6.79}]}]}}}

# ── Hardcoded receipts (no original JSON) ─────────────────────────────────────
# Apr 8 and Mar 24 from session summary

def import_hardcoded(token, items, label):
    ok = 0
    for name, qty, unit, cat, price, date in items:
        payload = {"name": name, "quantity": qty, "unit": unit,
                   "category": cat, "notes": f"Costco ${price:.2f} ({date})",
                   "added_by": "TARS", "is_bought": False}
        try:
            pb_request("/api/collections/grocery_items/records", payload, token)
            print(f"  OK  [{cat:7s}] {name} x{qty}")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"  ERR {name}: {e.code} {e.read().decode()}")
    print(f"  → {label}: {ok}/{len(items)} imported\n")

APR08_ITEMS = [
    # (name, qty, unit, category, unit_price, date)
    ("Salmon Milano",             1,"pkg","meat",   0,    "2026-04-08"),
    ("Brown Rice Ramen (Lotus)",  1,"pkg","pantry", 0,    "2026-04-08"),
    ("Bertolli Pasta Sauce",      1,"jar","pantry", 0,    "2026-04-08"),
    ("Roma Tomatoes 3lb",         1,"pkg","produce",0,    "2026-04-08"),
    ("Yellowfin Tuna",            1,"pkg","pantry", 0,    "2026-04-08"),
    ("Limes 3lb",                 2,"bag","produce",0,    "2026-04-08"),
    ("KS Wild Blueberries",       1,"bag","frozen", 0,    "2026-04-08"),
    ("Bananas 3lb",               1,"bunch","produce",0,  "2026-04-08"),
    ("Celery Salad",              1,"pkg","produce",0,    "2026-04-08"),
    ("Scoop Away Cat Litter",     1,"pkg","other",  0,    "2026-04-08"),
    ("Beyond Burger",             1,"pkg","frozen", 0,    "2026-04-08"),
    ("Soy Sauce",                 1,"btl","pantry", 0,    "2026-04-08"),
    ("Organic Milk",              1,"gal","dairy",  0,    "2026-04-08"),
    ("Crest Mouthwash",           1,"btl","other",  0,    "2026-04-08"),
    ("Dots Pretzels",             1,"bag","pantry", 0,    "2026-04-08"),
    ("Greek Yogurt",              2,"tub","dairy",  0,    "2026-04-08"),
    ("Avocado Oil Spray",         1,"can","pantry", 0,    "2026-04-08"),
    ("Pasture Raised Eggs 2dz",   1,"pkg","dairy",  0,    "2026-04-08"),
    ("Avocados 6-count",          1,"bag","produce",0,    "2026-04-08"),
    ("Cholula Hot Sauce",         1,"btl","pantry", 0,    "2026-04-08"),
    ("Wild Salmon",               1,"pkg","meat",   0,    "2026-04-08"),
    ("Pumpkin Seeds (Go Raw)",    2,"bag","pantry", 0,    "2026-04-08"),
    ("KS Sparkling Water 35pk",   35,"pk","other",  0,    "2026-04-08"),
    ("Prawn Har Gow",             1,"pkg","frozen", 0,    "2026-04-08"),
    ("KS Sparkling Water 24pk",   24,"pk","other",  0,    "2026-04-08"),
]

MAR24_ITEMS = [
    ("Tru Fru Frozen Fruit",      1,"bag","frozen", 0,    "2026-03-24"),
    ("Crest Complete Toothpaste", 1,"pkg","other",  0,    "2026-03-24"),
    ("Bananas 3lb",               1,"bunch","produce",0,  "2026-03-24"),
    ("Cascade Dishwasher Pods",   1,"pkg","other",  0,    "2026-03-24"),
    ("Kinder's Seasoning Rub",    1,"pkg","pantry", 0,    "2026-03-24"),
    ("Spicy Crunch Sushi",        1,"pkg","other",  0,    "2026-03-24"),
    ("Dumplings",                 1,"pkg","frozen", 0,    "2026-03-24"),
    ("Organic Ground Beef 4lb",   4,"lb", "meat",   0,    "2026-03-24"),
    ("Grillo's Pickles",          1,"jar","pantry", 0,    "2026-03-24"),
    ("Dove Body Wash",            1,"pkg","other",  0,    "2026-03-24"),
]

# ── Run ───────────────────────────────────────────────────────────────────────
token = get_token()
print("Auth OK\n")

receipts = [
    ("May 9, 2026",  RECEIPT_MAY09),
    ("May 4, 2026",  RECEIPT_MAY04),
    ("May 2, 2026",  RECEIPT_MAY02),
    ("Mar 17a 2026", RECEIPT_MAR17_A),
    ("Mar 17b 2026", RECEIPT_MAR17_B),
    ("Mar 12, 2026", RECEIPT_MAR12),
    ("Mar 5, 2026",  RECEIPT_MAR05),
]

for label, r in receipts:
    print(f"--- {label} ---")
    import_receipt(token, r)

print("--- Apr 8, 2026 (hardcoded) ---")
import_hardcoded(token, APR08_ITEMS, "Apr 8")

print("--- Mar 24, 2026 (hardcoded) ---")
import_hardcoded(token, MAR24_ITEMS, "Mar 24")

print("All done.")
