#!/usr/bin/env python3
"""Import Costco receipts into purchase_history. Run from project root."""
import json, urllib.request, urllib.error

PB_URL         = "http://192.168.5.127:8090"
ADMIN_EMAIL    = "admin@grocery.local"
ADMIN_PASSWORD = "GroceryAdmin123!"

DEPT_CATEGORY = {
    65: "produce", 18: "frozen", 17: "dairy", 13: "pantry",
    14: "other",  12: "pantry", 19: "meat",  20: "other",
    61: "meat",   62: "pantry", 63: "meat",  27: "other",
    93: "other",  # health/vitamins
}

NAME_MAP = {
    # Produce
    "10LB BAKERS":  "Baker Potatoes 10lb",
    "OG CARROT6LB": "Organic Carrots 6lb",
    "ORG BELLAS":   "Organic Bella Mushrooms",
    "ORG BANANAS":  "Organic Bananas",
    "BANANAS":      "Bananas 3lb",
    "LIMES 3 LB.":  "Limes 3lb",
    "AVOCADOS":     "Avocados 6-count",
    "PINEAPPLE":    "Pineapple",
    "DEKOPON":      "Dekopon Citrus",
    "ROMA TOMATO":  "Roma Tomatoes 3lb",
    "ORG CELERY":   "Organic Celery",
    "ORANGES":      "Oranges 8lb",
    "ORG. DATES":   "Organic Dates",
    "CELERY SALAD": "Celery Salad",
    # Dairy
    "ORGANIC MILK": "Organic Milk",
    "2% MILK":      "2% Milk",
    "GREEK YOGURT": "Greek Yogurt",
    "PASTURE EGGS": "Pasture Raised Eggs 2dz",
    "KEFIR INDIV":  "Kefir Individual (Lifeway)",
    "KS MOZ SHRED": "KS Mozzarella Shredded",
    # Frozen
    "KS WLD BLBRY": "KS Wild Blueberries",
    "BEYOND BURGR": "Beyond Burger",
    "WONTON RAMEN": "Wonton Ramen",
    "DUMPLINGS":    "Dumplings",
    "TRU FRU":      "Tru Fru Frozen Fruit",
    "SPCY STRIPS":  "Spicy Chicken Strips (Just Bare)",
    "WILD SALMON":  "Wild Salmon",
    "PRAWN HACAO":  "Prawn Har Gow",
    "CALI COMBO":   "Cali Combo Sushi",
    "SPICY CRUNCH": "Spicy Crunch Sushi",
    # Pantry
    "PEETS DECAF":  "Peet's Decaf Coffee",
    "KS ORG EVOO":  "KS Organic Olive Oil",
    "CANNED CHCKN": "Canned Chicken",
    "KS PINK SALT": "KS Pink Salt",
    "CROUTONS":     "Croutons (Kooshy)",
    "KS BAGUETTE":  "KS Baguette",
    "KS ALMONDS":   "KS Almonds",
    "SALT & LIME":  "Salt & Lime Tortilla Chips",
    "ORG GUAVA JC": "Organic Guava Juice",
    "SPLENDA 1000": "Splenda 1000ct",
    "SOY SAUCE":    "Soy Sauce",
    "AVOCA SPRAY":  "Avocado Oil Spray",
    "CHOLULA HOT":  "Cholula Hot Sauce",
    "PUMPKIN SEED": "Pumpkin Seeds (Go Raw)",
    "DOTS PRETZEL": "Dots Pretzels",
    "BRN RICE RMN": "Brown Rice Ramen (Lotus Foods)",
    "BERTOLI SCE":  "Bertolli Pasta Sauce",
    "YELLOW TUNA":  "Yellowfin Tuna",
    # Meat
    "NAAN DIPPERS": "Naan Dippers",
    "KS ORG TOFU":  "KS Organic Tofu",
    "GRD BEEF PK":  "Ground Beef 93% Lean 4lb",
    "CHICKEN SLD":  "Rotisserie Chicken",
    "SALMON MILAN": "Salmon Milano",
    # Other / household
    "**KS BATH**":  "KS Bath Tissue",
    "SCOOP AWAY":   "Scoop Away Cat Litter",
    "IRISH SPRING": "Irish Spring Soap",
    "VENUS":        "Venus Razor",
    "PANTENE SH":   "Pantene Shampoo",
    "CREST MWASH":  "Crest Mouthwash",
    "KS SPARKLING": "KS Sparkling Water 35pk",
    "KS SPARK WAT": "KS Sparkling Water 24pk",
    "***KSWTR40PK": "KS Sparkling Water 40pk",
    "BC GRILLO":    "Grillo's Pickles",
    "POTTINGSOIL":  "Potting Soil",
    "NBSLEEP3":     "NatureMade Sleep3 120ct",
    "TOOTHPASTE":   "Act Complete Toothpaste 5pk",
    "VINE TOMATO":  "Vine Tomatoes",
    "GRAPE TOMATO": "Grape Tomatoes 2lb",
    "ROTINI PASTA": "Rotini Pasta 2.2lb",
    "ROMAINE":      "Romaine Hearts 6pk",
    "MEDJOOL DATE": "Medjool Dates 2lb",
    "TANGERINE JU": "Tangerine Juice 2/59oz",
    "LIVSFVARIETY": "Listerine Flosser Variety 30ct",
}

SKIP_DEPTS = {39}  # clothing

def should_skip(item):
    d = item.get("itemDescription01") or ""
    if d.startswith("/") or d.startswith("CA REDEMP"):
        return True
    if (item.get("unit") or 1) < 0:
        return True
    if item.get("itemDepartmentNumber") in SKIP_DEPTS:
        return True
    return False

def clean_name(raw):
    return NAME_MAP.get(raw.strip(), raw.strip().title())

def pb_request(path, data=None, token=None, method=None):
    url = f"{PB_URL}{path}"
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers,
                                  method=method or ("POST" if data else "GET"))
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def get_token():
    r = pb_request("/api/collections/_superusers/auth-with-password",
                   {"identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    return r["token"]

def import_receipt_json(token, receipt_json):
    receipt = receipt_json["data"]["receiptsWithCounts"]["receipts"][0]
    date = receipt["transactionDate"]
    ok = skipped = 0
    for item in receipt["itemArray"]:
        if should_skip(item):
            skipped += 1
            continue
        dept = item.get("itemDepartmentNumber", 0)
        payload = {
            "name":          clean_name(item["itemDescription01"]),
            "quantity":      item.get("unit") or 1,
            "unit":          "pkg",
            "category":      DEPT_CATEGORY.get(dept, "other"),
            "unit_price":    item.get("itemUnitPriceAmount") or 0,
            "notes":         item.get("itemDescription02") or "",
            "purchase_date": date,
            "store":         "Costco",
            "verified":      True,
            "planned":       True,
        }
        try:
            pb_request("/api/collections/purchase_history/records", payload, token)
            print(f"  OK  {payload['name']} x{payload['quantity']} ${payload['unit_price']:.2f}")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"  ERR {payload['name']}: {e.read().decode()}")
    print(f"  → {date}: {ok} imported, {skipped} skipped\n")

def import_hardcoded(token, items, label):
    ok = 0
    for name, qty, unit, cat, price, date in items:
        payload = {
            "name": name, "quantity": qty, "unit": unit, "category": cat,
            "unit_price": price, "notes": "", "purchase_date": date,
            "store": "Costco", "verified": True, "planned": True,
        }
        try:
            pb_request("/api/collections/purchase_history/records", payload, token)
            print(f"  OK  {name}")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"  ERR {name}: {e.read().decode()}")
    print(f"  → {label}: {ok}/{len(items)} imported\n")

# ── Receipt JSON data ─────────────────────────────────────────────────────────
# Compacted to only the fields the parser reads.

def r(date, items):
    """Build a receipt dict from (desc01, desc02, dept, unit, price) tuples."""
    return {"data": {"receiptsWithCounts": {"receipts": [{"transactionDate": date, "itemArray": [
        {"itemDescription01": d1, "itemDescription02": d2,
         "itemDepartmentNumber": dept, "unit": u, "itemUnitPriceAmount": p}
        for d1, d2, dept, u, p in items
    ]}]}}}

RECEIPT_MAY22 = r("2026-05-22", [
    ("VINE TOMATO",  "CAMPARI T 1.4KG/3LB",           65,  1,  7.79),
    ("ROTINI PASTA", "1KG/2.2LB",                      13,  1,  9.89),
    ("SALT & LIME",  "TORTILLA 40OZ",                  12,  1,  6.79),
    ("PASTURE EGGS", "2 DZ",                            17,  1,  7.99),
    ("LIVSFVARIETY", "FLOSSERS 30CT VARIETY",           20,  1, 20.97),
    ("KS SPARK WAT", "SPARKLING 24PK",                  14,  1, 17.59),
    ("KS WLD BLBRY", "T9H6 P324",                       18,  1, 12.99),
    ("GRAPE TOMATO", "2LB",                             65,  1,  6.59),
    ("KS SPARKLING", "SPARKLING 35PK",                  14,  1, 12.79),
    ("PRAWN HACAO",  "HAR GOW FROZEN",                  18,  1, 15.99),
    ("ROMAINE",      "6PK HEARTS",                      65,  1,  4.49),
    ("MEDJOOL DATE", "2LB",                             65,  1, 10.99),
    ("10LB BAKERS",  "4.5KG / 10 LB",                  65,  1,  4.99),
    ("TANGERINE JU", "2/59OZ",                          17,  1,  9.39),
    ("AVOCADOS",     "6-COUNT",                         65,  1,  6.99),
    ("LIMES 3 LB.",  "1.36 KG / 3 LB.",                65,  1,  6.99),
])

RECEIPT_MAY15 = r("2026-05-15", [
    ("ORGANIC MILK", "T33H4 P132 DOM70 SL40",   17,  1, 12.49),
    ("GREEK YOGURT", "DOM55 SL35",               17,  1,  7.49),
    ("***KSWTR40PK", None,                       14,  1,  3.99),
    ("CA REDEMP VAL N EE/782796", None,           0,  1,  0),
])

RECEIPT_APR26 = r("2026-04-26", [
    ("LIMES 3 LB.",   "1.36 KG / 3 LB.",          65,  1,  6.99),
    ("GREEK YOGURT",  "DOM55 SL35",                17,  2,  7.49),
    ("10LB BAKERS",   "4.5KG / 10 LB",             65,  1,  4.99),
    ("PEETS DECAF",   "DECAF COFFEE P216",          13,  1, 22.99),
    ("ORGANIC MILK",  "T33H4 P132 DOM70 SL40",      17,  1, 12.49),
    ("ORG. DATES",    "907 G / 2 LB",               65,  1, 11.99),
    ("KS WLD BLBRY",  "T9H6 P324",                  18,  1, 12.99),
    ("ORG GUAVA JC",  "SUN TROP 25%JCE",            13,  1,  6.29),
    ("CA REDEMP VAL N EE/1078110", None,             0,  1,  0),
    ("CALI COMBO",    "SUSHI 6/16.9 OZ",            19,  1, 10.99),
    ("SPICY CRUNCH",  "SUSHI C6 18.8 OZ",           19,  1, 12.89),
    ("BANANAS",       "3 LB / 1.36 KG",             65,  2,  1.99),
    ("ORANGES",       "3.63 KG / 8 LB",             65,  1,  9.99),
])

RECEIPT_APR20 = r("2026-04-20", [
    ("NBSLEEP3",    "120 TABLETS T11H7 MPK20",    93,  1, 21.99),
    ("/1392697",    None,                          93, -1,  0),
    ("TOOTHPASTE",  "ACT PREVNT 5PK/6.4OZ P360",  20,  1, 16.99),
    ("/1285702",    None,                          20, -1,  0),
])

RECEIPT_APR16 = r("2026-04-16", [
    ("GREEK YOGURT", "DOM55 SL35",       17,  2,  7.49),
    ("KS WLD BLBRY", "T9H6 P324",        18,  1, 12.99),
    ("BC GRILLO",    "T40H3 P120 SL110", 12,  1,  7.29),
    ("ORG. DATES",   "907 G / 2 LB",     65,  1, 11.99),
    ("10LB BAKERS",  "4.5KG / 10 LB",    65,  1,  4.99),
])

RECEIPT_APR08 = r("2026-04-08", [
    ("SALMON MILAN", "PESTO BUTTER",              63,  1, 14.99),
    ("BRN RICE RMN", "840G LOTUS FOODS P240",     13,  1,  8.69),
    ("BERTOLI SCE",  "PASTA SAUCE SL 240 P198",   13,  1, 11.89),
    ("ROMA TOMATO",  "3LB",                        65,  1,  6.79),
    ("YELLOW TUNA",  "TUNA 6/5 OZ SL420 P528",    13,  1, 14.99),
    ("LIMES 3 LB.",  "1.36 KG / 3 LB.",           65,  2,  7.49),
    ("KS WLD BLBRY", "T9H6 P324",                  18,  1, 12.99),
    ("BANANAS",      "3 LB / 1.36 KG",             65,  1,  1.99),
    ("CELERY SALAD", "APPLE CIDER VINAIGRETTE",    63,  1,  4.99),
    ("SCOOP AWAY",   "4X10.5LB P=52",             14,  1, 16.49),
    ("BEYOND BURGR", "P360 T6H4 SL180",            18,  1, 15.99),
    ("SOY SAUCE",    "1.89L 64Z US P240",          13,  1,  7.99),
    ("ORGANIC MILK", "T33H4 P132 DOM70 SL40",      17,  1, 12.49),
    ("CREST MWASH",  "3PK/33.8FL OZ P144",         20,  1, 11.99),
    ("DOTS PRETZEL", "PRETZELS P240 SL110",        12,  1,  9.99),
    ("GREEK YOGURT", "DOM55 SL35",                 17,  2,  7.49),
    ("AVOCA SPRAY",  "2/13.5Z 2/382G P=480",       13,  1, 14.79),
    ("PASTURE EGGS", "2DZ GRADE A",                17,  1,  7.99),
    ("AVOCADOS",     "6 COUNT",                    65,  1,  6.99),
    ("CHOLULA HOT",  "ORIGINAL DOM600 P480",       13,  1,  9.99),
    ("WILD SALMON",  "12/36OZ T10XH5 P600",        18,  1, 21.99),
    ("PUMPKIN SEED", "GO RAW P460 SL270",          12,  2, 10.99),
    ("KS SPARKLING", "35/12OZ LIME LMN GPFT P70",  14,  1, 11.99),
    ("CA REDEMP VAL T EE/4164501", None,            0,  1,  0),
    ("PRAWN HACAO",  "2.45LBS 8X4 P512",           18,  1, 15.99),
    ("/1116045",     None,                          18, -1,  0),
    ("KS SPARK WAT", "24/500ML 16.9OZ T12H5 P60",  14,  1, 16.99),
    ("CA REDEMP VAL T EE/9262015", None,            0,  1,  0),
])

RECEIPT_MAY09 = r("2026-05-09", [
    ("BC GRILLO",    "T40H3 P120 SL110",   12,  1,  7.29),
    ("/1930576",     None,                  12, -1,  0),
    ("CANNED CHCKN", "6X354G P336 SL730",  13,  1, 13.99),
    ("ORG BELLAS",   None,                 65,  1,  6.99),
    ("WV TECH PANT", "FY26 APR MVM P340",  39,  1, 19.99),
    ("CHICKEN SLD",  "ROTISSERIE CHICKEN", 63,  1,  5.99),
    ("KS PINK SALT", "FINE GRIND T13H6",   13,  1,  6.59),
    ("CROUTONS",     "KOOSHY T54H4 P216",  13,  1,  7.99),
    ("KS BAGUETTE",  None,                 62,  1,  4.99),
    ("KS WLD BLBRY", "T9H6 P324",          18,  1, 12.99),
    ("KS ORG EVOO",  "SL365 P240/P320",    13,  1, 16.89),
    ("AVOCADOS",     "6 COUNT",            65,  1,  6.99),
    ("KS MOZ SHRED", "T5H5 C6 P150",       17,  1, 12.59),
    ("GREEK YOGURT", "DOM55 SL35",         17,  2,  7.49),
    ("NAAN DIPPERS", "T10H3 DOM32 SL21",   19,  1,  6.79),
    ("/1433996",     None,                  19, -1,  0),
    ("SPCY STRIPS",  "JUST BARE T9H5",     18,  1, 14.99),
])

RECEIPT_MAY04 = r("2026-05-04", [
    ("32D MENS PNT", "FY26 P300",         39,  1, 16.99),
    ("KS ORG TOFU",  "SL45 TE 7X5",       19,  1,  5.89),
    ("GREEK YOGURT", "DOM55 SL35",        17,  1,  7.49),
    ("PUMPKIN SEED", "GO RAW P460 SL270", 12,  1, 10.99),
    ("KEFIR INDIV",  "LIFEWAY T29H7",     17,  1, 14.49),
])

RECEIPT_MAY02 = r("2026-05-02", [
    ("BANANAS",      "3 LB / 1.36 KG",    65,  1,  1.99),
    ("IRISH SPRING", "4.5OZ 20CT P200",   20,  1, 11.99),
    ("POTTINGSOIL",  "50 QT P=39",        27,  1, 11.99),
    ("/1372969",     None,                 27, -1,  0),
    ("SPLENDA 1000", "P225",              13,  1, 18.69),
    ("WV TECH PANT", "FY26 APR MVM P340", 39,  1, 19.99),
    ("/1841928",     None,                 39, -1,  0),
    ("ROMA TOMATO",  "3LB",               65,  1,  6.99),
    ("GRD BEEF PK",  "93% LEAN 4LBS",     61,  1, 24.99),
    ("PANTENE SH",   "ROSE AND HONEY",    20,  1, 12.99),
    ("/1903627",     None,                 20, -1,  0),
    ("ORG BELLAS",   None,                65,  1,  6.99),
    ("ORG CELERY",   None,                65,  1,  6.49),
    ("PINEAPPLE",    "EACH",              65,  1,  3.39),
    ("PASTURE EGGS", "2DZ GRADE A",       17,  1,  7.99),
    ("KS ALMONDS",   "1.36 KG",           12,  1, 12.99),
    ("**KS BATH**",  "1425 SQFT P30",     14,  1, 20.99),
    ("SALT & LIME",  "TORT CHIPS P102",   12,  1,  6.79),
])

RECEIPT_MAR17_A = r("2026-03-17", [
    ("ORG. DATES",   "907 G / 2 LB",   65, 1, 11.99),
    ("PASTURE EGGS", "2DZ GRADE A",    17, 1,  7.99),
])

RECEIPT_MAR17_B = r("2026-03-17", [
    ("ORG BANANAS",  "3 LB / 1.36 KG",   65, 1,  2.49),
    ("GREEK YOGURT", "DOM55 SL35",        17, 3,  7.49),
    ("DEKOPON",      "1.36 KG / 3 LBS",  65, 1,  8.99),
    ("BEYOND BURGR", "P360 T6H4 SL180",  18, 1, 15.99),
    ("WONTON RAMEN", "CHOY C6 T7H2 P84", 18, 1, 16.99),
])

RECEIPT_MAR12 = r("2026-03-12", [
    ("TRU FRU",      "P360 T6H4 C15",        18, 1, 13.89),
    ("2% MILK",      "SL 14",                17, 1,  6.39),
    ("ORG GUAVA JC", "SUN TROP 25%JCE",      13, 1,  6.29),
    ("CA REDEMP VAL N EE/1078110", None,       0, 1,  0),
    ("VENUS",        "SENSITIVE CN P270",     20, 1, 34.99),
    ("DEKOPON",      "1.36 KG / 3 LBS",      65, 1,  8.99),
    ("BANANAS",      "3 LB / 1.36 KG",       65, 1,  1.99),
    ("KS WLD BLBRY", "T9H6 P324",            18, 1, 12.99),
    ("DUMPLINGS",    "10/36CT (39.6 OZ)",    18, 1, 13.69),
])

RECEIPT_MAR05 = r("2026-03-05", [
    ("10LB BAKERS",  "4.5KG / 10 LB",      65,  1,  4.99),
    ("KS WLD BLBRY", "T9H6 P324",           18,  1, 12.99),
    ("GREEK YOGURT", "DOM55 SL35",          17,  3,  7.49),
    ("OG CARROT6LB", None,                  65,  1,  5.49),
    ("AVOCADOS",     "6 COUNT",             65,  1,  5.99),
    ("ORG BELLAS",   None,                  65,  1,  6.99),
    ("BANANAS",      "3 LB / 1.36 KG",      65,  1,  1.99),
    ("LIMES 3 LB.",  "1.36 KG / 3 LB.",     65,  2,  6.99),
    ("ADIDASHOODIE", "FY26 FEB MVM",        39,  1, 19.99),
    ("/ 1935728",    None,                   39, -1,  0),
    ("PASTURE EGGS", "2DZ GRADE A",          17,  1,  7.99),
    ("PEETS DECAF",  "DECAF COFFEE P216",    13,  1, 22.99),
    ("**KS BATH**",  "1425 SQFT P30",        14,  1, 20.99),
    ("ORGANIC MILK", "T33H4 P132 DOM70 SL40",17,  1, 12.49),
])

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
if __name__ == "__main__":
    token = get_token()
    print("Auth OK\n")

    receipts = [
        ("May 22", RECEIPT_MAY22),
        ("May 15", RECEIPT_MAY15),
        ("May 9",  RECEIPT_MAY09),
        ("May 4",  RECEIPT_MAY04),
        ("May 2",  RECEIPT_MAY02),
        ("Apr 26", RECEIPT_APR26),
        ("Apr 20", RECEIPT_APR20),
        ("Apr 16", RECEIPT_APR16),
        ("Apr 8",  RECEIPT_APR08),
        ("Mar 17a",RECEIPT_MAR17_A),
        ("Mar 17b",RECEIPT_MAR17_B),
        ("Mar 12", RECEIPT_MAR12),
        ("Mar 5",  RECEIPT_MAR05),
    ]

    for label, receipt in receipts:
        print(f"--- {label} ---")
        import_receipt_json(token, receipt)

    print("--- Mar 24 (no JSON) ---")
    import_hardcoded(token, MAR24_ITEMS, "Mar 24")

    resp = json.loads(urllib.request.urlopen(
        f"{PB_URL}/api/collections/purchase_history/records?perPage=1").read())
    print(f"\nDone. purchase_history now has {resp['totalItems']} records.")
