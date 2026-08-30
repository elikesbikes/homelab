#!/usr/bin/env python3
"""
import_jan_feb_2026.py — Import 8 Costco receipts (Jan 10 – Feb 22, 2026).

Handles:
  - Discount lines (unit < 0 referencing parent): applied to parent price
  - CA REDEMP lines and bare-ref lines: skipped
  - Multi-unit items (unit > 1): unit = qty, itemUnitPriceAmount = per-unit price
  - Weight in name (e.g. "LIMES 3 LB."): normalised to name/qty/unit/unit_price
  - Weight in itemDescription02 (e.g. "3 LB / 1.36 KG"): same normalisation
  - Duplicate guard: skips records already present (same name+date+store+unit_price)

Usage:
  python3 import_jan_feb_2026.py           # dry-run (prints what would be created)
  python3 import_jan_feb_2026.py --import  # preview + confirm before writing
"""

import re, sys, json, requests

PB_URL         = "http://localhost:8090"
ADMIN_EMAIL    = "admin@grocery.local"
ADMIN_PASSWORD = "GroceryAdmin123!"


# ---------------------------------------------------------------------------
# Costco abbreviation expansion (port of proxy/server.js expandCostcoAbbreviations)
# ---------------------------------------------------------------------------
def expand_abbrev(name):
    name = name.strip('*').strip()
    subs = [
        (r'\bK\s+S\b',   'Kirkland Signature'),
        (r'\bKS\b',       'Kirkland Signature'),
        (r'\bKRKLD\b',    'Kirkland'),
        (r'\bSPRK\b',     'Sparkling'),
        (r'\bSPARK\b',    'Sparkling'),
        (r'\bWTR\b',      'Water'),
        (r'\bWAT\b',      'Water'),
        (r'\bORG\.\s*',   'Organic '),
        (r'\bORG\b',      'Organic'),
        (r'\bOG\b',       'Organic'),
        (r'\bBLBRY\b',    'Blueberry'),
        (r'\bBLBRRS?\b',  'Blueberries'),
        (r'\bWLD\b',      'Wild'),
        (r'\bSLMN\b',     'Salmon'),
        (r'\bCHKN\b',     'Chicken'),
        (r'\bGRND\b',     'Ground'),
        (r'\bBRN\b',      'Brown'),
        (r'\bWHL\b',      'Whole'),
        (r'\bWHT\b',      'Wheat'),
        (r'\bBTR\b',      'Butter'),
        (r'\bCHS\b',      'Cheese'),
        (r'\bMLK\b',      'Milk'),
        (r'\bEGS?\b',     'Eggs'),
        (r'\bYGRT\b',     'Yogurt'),
        (r'\bTRKY\b',     'Turkey'),
        (r'\bAVCD\b',     'Avocado'),
        (r'\bBROC\b',     'Broccoli'),
        (r'\bSPNCH\b',    'Spinach'),
        (r'\bRMN\b',      'Ramen'),
        (r'\bRD\b',       'Roasted'),
        (r'\bPEPPR?\b',   'Pepper'),
        (r'\bJC\b',       'Juice'),
        (r'\bTOV\b',      'Tomatoes on the Vine'),
        (r'\bSC\b',       'Steel Cut'),
        (r'\bQK\b',       'Quick'),
        (r'\bRLD\b',      'Rolled'),
    ]
    for pat, repl in subs:
        name = re.sub(pat, repl, name, flags=re.IGNORECASE)
    name = re.sub(r'\s{2,}', ' ', name).strip()
    # Title-case but preserve all-caps brand exceptions already expanded
    return name.title()


# ---------------------------------------------------------------------------
# Category detection (port of categories.js)
# ---------------------------------------------------------------------------
CATEGORY_KW = {
    'produce':  ['apple','banana','orange','grape','berry','strawberr','blueberr','lemon','lime',
                 'avocado','tomato','lettuce','spinach','kale','broccoli','cauliflower','carrot',
                 'celery','cucumber','zucchini','pepper','onion','garlic','potato','sweet potato',
                 'mushroom','corn','asparagus','beet','cabbage','herb','cilantro','parsley',
                 'basil','mint','ginger','jalapeño','mango','pineapple','watermelon','melon',
                 'date','fig','date'],
    'dairy':    ['milk','cheese','yogurt','greek','kefir','butter','cream','egg','sour cream',
                 'cottage cheese','cream cheese','half and half','oat milk','almond milk'],
    'meat':     ['chicken','beef','pork','lamb','turkey','salmon','tuna','shrimp','tilapia',
                 'cod','steak','ground beef','ground turkey','sausage','bacon','ham','deli',
                 'hot dog','brisket','ribs','fish','seafood','scallop','sablefish','shabu'],
    'frozen':   ['frozen','ice cream','gelato','sorbet','popsicle','pizza','burrito','waffle',
                 'edamame'],
    'pantry':   ['pasta','rice','bread','cereal','oat','flour','sugar','salt','oil',
                 'olive oil','vinegar','sauce','salsa','ketchup','mustard','mayonnaise',
                 'mayo','soy sauce','hot sauce','soup','broth','stock','bean','lentil',
                 'chickpea','can','canned','jar','honey','syrup','peanut butter',
                 'almond butter','jam','jelly','chip','cracker','cookie','snack',
                 'coffee','tea','juice','water','soda','sparkling','wine','beer',
                 'tortilla','wrap','almond','seed','nut','ramen','tofu','spray'],
}

def detect_category(name):
    lower = name.lower()
    for cat, kws in CATEGORY_KW.items():
        if any(kw in lower for kw in kws):
            return cat
    return 'other'


# ---------------------------------------------------------------------------
# Weight parsing
# ---------------------------------------------------------------------------
WEIGHT_NAME_RE = re.compile(
    r'^(.*?)\s+(\d+(?:\.\d+)?)\s*(lb|oz|kg|g)\s*\.?\s*$',
    re.IGNORECASE
)
UNIT_NORM = {'lb': 'lb', 'oz': 'oz', 'kg': 'kg', 'g': 'g'}

# Strict desc02 patterns — only match when desc02 is PURELY a weight expression.
# Rejects multi-pack specs like "24/500ML 16.9OZ", "840G LOTUS FOODS P240", "2/13.5Z".
_W = r'\d+(?:\.\d+)?'
_U = r'(?:lb|oz|kg|g)\s*\.?'
# Single unit: "3LB", "1.36 KG"
DESC_SINGLE_RE = re.compile(rf'^\s*({_W})\s*({_U})\s*$', re.IGNORECASE)
# Dual unit: "3 LB / 1.36 KG", "907 G / 2 LB", "680 G / 1.5 LB", "4.5KG / 10 LB"
DESC_DUAL_RE   = re.compile(
    rf'^\s*({_W})\s*({_U})\s*/\s*({_W})\s*({_U})\s*$', re.IGNORECASE
)


def _parse_desc02_weight(desc02):
    """
    Returns (qty_lb_preferred, unit) from desc02, or (None, None) if not
    a pure weight expression. Prefers lb > oz > kg > g.
    """
    if not desc02:
        return None, None
    m = DESC_SINGLE_RE.match(desc02)
    if m:
        return float(m.group(1)), UNIT_NORM.get(m.group(2).rstrip('. ').lower(), m.group(2).lower())
    m = DESC_DUAL_RE.match(desc02)
    if m:
        v1, u1, v2, u2 = float(m.group(1)), m.group(2).rstrip('. ').lower(), float(m.group(3)), m.group(4).rstrip('. ').lower()
        # Prefer lb; then oz; then kg; then g
        for pref in ('lb', 'oz', 'kg', 'g'):
            if u1 == pref: return v1, pref
            if u2 == pref: return v2, pref
    return None, None


def try_normalize_weight(raw_name, desc02, total_price, json_qty):
    """
    Returns (clean_name, qty, unit, unit_price) with weight normalised,
    or None if no weight info found.
    """
    # 1. Weight at end of name ("LIMES 3 LB.")
    m = WEIGHT_NAME_RE.match(raw_name)
    if m:
        clean = expand_abbrev(m.group(1).strip())
        qty   = float(m.group(2)) * json_qty   # bags × lbs-per-bag
        unit  = UNIT_NORM.get(m.group(3).lower(), m.group(3).lower())
        return clean, qty, unit, round(total_price / qty, 4)

    # 2. Weight from desc02 — only pure weight expressions (no packaging info)
    per_pkg, unit = _parse_desc02_weight(desc02)
    if per_pkg is not None:
        qty   = per_pkg * json_qty
        clean = expand_abbrev(raw_name.strip())
        return clean, qty, unit, round(total_price / qty, 4)

    return None


# ---------------------------------------------------------------------------
# Process raw Costco itemArray into normalised line items
# ---------------------------------------------------------------------------
def process_receipt(item_array, receipt_date, warehouse_name):
    # First pass: collect discount amounts keyed by parent item number
    discounts = {}
    for i in item_array:
        unit = i.get('unit') or 1
        if unit < 0:
            desc = (i.get('itemDescription01') or '').strip()
            amount = abs(i.get('amount') or 0)
            # Reference looks like "/1798566" or "/ 1891143" or "CA REDEMP VAL N EE/1078110"
            ref = re.search(r'/\s*(\d+)', desc)
            if ref:
                discounts[ref.group(1)] = discounts.get(ref.group(1), 0) + amount

    results = []
    for i in item_array:
        unit = i.get('unit') or 1
        if unit < 0:
            continue  # skip discount / negative lines
        desc = (i.get('itemDescription01') or '').strip()
        if not desc:
            continue
        if 'CA REDEMP' in desc.upper():
            continue  # California redemption surcharge
        if re.match(r'^/?\s*\d+$', desc):
            continue  # bare item-number reference line
        amount = i.get('amount') or 0
        if amount <= 0:
            continue

        item_number = str(i.get('itemNumber') or '')
        discount    = discounts.get(item_number, 0)
        net_amount  = round(amount - discount, 4)
        if net_amount <= 0:
            continue

        unit_price_per_pkg = i.get('itemUnitPriceAmount') or 0
        if discount > 0 and unit > 0:
            unit_price_per_pkg = round(unit_price_per_pkg - discount / unit, 4)

        desc02 = (i.get('itemDescription02') or '').strip()

        # Try weight normalisation
        wn = try_normalize_weight(desc, desc02, net_amount, unit)
        if wn:
            name, qty, wt_unit, up = wn
            results.append({
                'name':          name,
                'quantity':      qty,
                'unit':          wt_unit,
                'unit_price':    up,
                'purchase_date': receipt_date,
                'store':         'Costco',
                'category':      detect_category(name),
                'verified':      True,
                'planned':       None,
            })
        else:
            # Count-based item
            name = expand_abbrev(desc)
            qty  = float(unit)
            up   = unit_price_per_pkg if unit_price_per_pkg > 0 else round(net_amount / qty, 4)
            results.append({
                'name':          name,
                'quantity':      qty,
                'unit':          '',
                'unit_price':    round(up, 4),
                'purchase_date': receipt_date,
                'store':         'Costco',
                'category':      detect_category(name),
                'verified':      True,
                'planned':       None,
            })

    return results


# ---------------------------------------------------------------------------
# Receipt data (all 8 trips)
# ---------------------------------------------------------------------------
RECEIPTS_RAW = [
    {
        "date": "2026-02-22",
        "warehouse": "CARMEL MOUNTAIN",
        "items": [
            {"itemNumber":"1874996","itemDescription01":"KS WLD BLBRY","itemDescription02":"T9H6 P324","unit":1,"amount":12.99,"itemUnitPriceAmount":12.99},
            {"itemNumber":"1895","itemDescription01":"CHERRY TOV","itemDescription02":"680 G / 1.5 LB","unit":1,"amount":6.49,"itemUnitPriceAmount":6.49},
            {"itemNumber":"7445","itemDescription01":"10LB BAKERS","itemDescription02":"4.5KG / 10 LB","unit":1,"amount":4.99,"itemUnitPriceAmount":4.99},
            {"itemNumber":"316689","itemDescription01":"BRN RICE RMN","itemDescription02":"840G LOTUS FOODS P240","unit":1,"amount":8.69,"itemUnitPriceAmount":8.69},
            {"itemNumber":"218073","itemDescription01":"ORGANIC MILK","itemDescription02":"T33H4 P132 DOM70 SL40","unit":1,"amount":12.49,"itemUnitPriceAmount":12.49},
            {"itemNumber":"647465","itemDescription01":"AVOCADOS","itemDescription02":"6 COUNT","unit":1,"amount":5.99,"itemUnitPriceAmount":5.99},
            {"itemNumber":"1078110","itemDescription01":"ORG GUAVA JC","itemDescription02":"SUN TROP 25%JCE T12H4P192","unit":1,"amount":6.29,"itemUnitPriceAmount":6.29},
            {"itemNumber":"1497","itemDescription01":"CA REDEMP VAL N EE/1078110","unit":1,"amount":0.2,"itemUnitPriceAmount":0},
            {"itemNumber":"1048072","itemDescription01":"GREEK YOGURT","itemDescription02":"DOM55 SL35","unit":2,"amount":14.98,"itemUnitPriceAmount":7.49},
            {"itemNumber":"1896526","itemDescription01":"CALI COMBO","itemDescription02":"SUSHI 6/16.9 OZ","unit":1,"amount":10.99,"itemUnitPriceAmount":10.99},
        ]
    },
    {
        "date": "2026-02-14",
        "warehouse": "CARMEL MOUNTAIN",
        "items": [
            {"itemNumber":"1555531","itemDescription01":"WHOLE EARTH","itemDescription02":"MONKFRUIT  32OZ  P288/360","unit":1,"amount":8.99,"itemUnitPriceAmount":8.99},
            {"itemNumber":"1048072","itemDescription01":"GREEK YOGURT","itemDescription02":"DOM55 SL35","unit":3,"amount":22.47,"itemUnitPriceAmount":7.49},
            {"itemNumber":"30669","itemDescription01":"BANANAS","itemDescription02":"3 LB / 1.36 KG","unit":1,"amount":1.99,"itemUnitPriceAmount":1.99},
            {"itemNumber":"1109194","itemDescription01":"2DZN ROSES","itemDescription02":None,"unit":1,"amount":36.99,"itemUnitPriceAmount":36.99},
            {"itemNumber":"1344","itemDescription01":"ROMA TOMATO","itemDescription02":"3LB","unit":1,"amount":6.49,"itemUnitPriceAmount":6.49},
            {"itemNumber":"3923","itemDescription01":"LIMES 3 LB.","itemDescription02":"1.36 KG / 3 LB.","unit":1,"amount":6.99,"itemUnitPriceAmount":6.99},
            {"itemNumber":"777891","itemDescription01":"KS SCALLOPS","itemDescription02":"NW/NE/SE/TE 6X6","unit":1,"amount":46.99,"itemUnitPriceAmount":46.99},
            {"itemNumber":"1874996","itemDescription01":"KS WLD BLBRY","itemDescription02":"T9H6 P324","unit":1,"amount":12.99,"itemUnitPriceAmount":12.99},
        ]
    },
    {
        "date": "2026-02-01",
        "warehouse": "CARMEL MOUNTAIN",
        "items": [
            {"itemNumber":"9262015","itemDescription01":"KS SPARK WAT","itemDescription02":"24/500ML 16.9OZ T12H5 P60","unit":1,"amount":16.99,"itemUnitPriceAmount":16.99},
            {"itemNumber":"4113","itemDescription01":"CA REDEMP VAL T EE/9262015","unit":1,"amount":1.2,"itemUnitPriceAmount":0},
            {"itemNumber":"7445","itemDescription01":"10LB BAKERS","itemDescription02":"4.5KG / 10 LB","unit":1,"amount":4.99,"itemUnitPriceAmount":4.99},
            {"itemNumber":"1068080","itemDescription01":"PASTURE EGGS","itemDescription02":"2DZ GRADE A P360/300 SL22","unit":1,"amount":7.99,"itemUnitPriceAmount":7.99},
            {"itemNumber":"9877788","itemDescription01":"KS ORG TOFU","itemDescription02":"SL45 7X5 MW 6X7 TE 6X6","unit":1,"amount":5.79,"itemUnitPriceAmount":5.79},
            {"itemNumber":"121288","itemDescription01":"ORG BELLAS","itemDescription02":None,"unit":1,"amount":6.99,"itemUnitPriceAmount":6.99},
            {"itemNumber":"30669","itemDescription01":"BANANAS","itemDescription02":"3 LB / 1.36 KG","unit":1,"amount":1.99,"itemUnitPriceAmount":1.99},
            {"itemNumber":"796993","itemDescription01":"ORG AVOCADOS","itemDescription02":None,"unit":1,"amount":7.99,"itemUnitPriceAmount":7.99},
            {"itemNumber":"3923","itemDescription01":"LIMES 3 LB.","itemDescription02":"1.36 KG / 3 LB.","unit":1,"amount":6.99,"itemUnitPriceAmount":6.99},
            {"itemNumber":"4164501","itemDescription01":"KS SPARKLING","itemDescription02":"35/12OZ LIME LMN GPFT P70","unit":1,"amount":11.99,"itemUnitPriceAmount":11.99},
            {"itemNumber":"5180","itemDescription01":"CA REDEMP VAL T EE/4164501","unit":1,"amount":1.75,"itemUnitPriceAmount":0},
            {"itemNumber":"1344","itemDescription01":"ROMA TOMATO","itemDescription02":"3LB","unit":1,"amount":6.49,"itemUnitPriceAmount":6.49},
            {"itemNumber":"1048072","itemDescription01":"GREEK YOGURT","itemDescription02":"DOM55 SL35","unit":3,"amount":20.67,"itemUnitPriceAmount":6.89},
        ]
    },
    {
        "date": "2026-01-30",
        "warehouse": "CARMEL MOUNTAIN",
        "items": [
            {"itemNumber":"1798566","itemDescription01":"AVO OIL CHIP","itemDescription02":"BOULDER CANYON P120 SL136","unit":1,"amount":6.59,"itemUnitPriceAmount":6.59},
            {"itemNumber":"372825","itemDescription01":"/1798566","unit":-1,"amount":-1.7,"itemUnitPriceAmount":0},
            {"itemNumber":"1048072","itemDescription01":"GREEK YOGURT","itemDescription02":"DOM55 SL35","unit":1,"amount":6.89,"itemUnitPriceAmount":6.89},
        ]
    },
    {
        "date": "2026-01-27",
        "warehouse": "POWAY",
        "items": [
            {"itemNumber":"3923","itemDescription01":"LIMES 3 LB.","itemDescription02":"1.36 KG / 3 LB.","unit":1,"amount":5.99,"itemUnitPriceAmount":5.99},
        ]
    },
    {
        "date": "2026-01-25",
        "warehouse": "CARMEL MOUNTAIN",
        "items": [
            {"itemNumber":"1798566","itemDescription01":"AVO OIL CHIP","itemDescription02":"BOULDER CANYON P120 SL136","unit":1,"amount":6.59,"itemUnitPriceAmount":6.59},
            {"itemNumber":"372825","itemDescription01":"/1798566","unit":-1,"amount":-1.7,"itemUnitPriceAmount":0},
            {"itemNumber":"1491866","itemDescription01":"PUMPKIN SEED","itemDescription02":"GO RAW P460 SL270","unit":1,"amount":9.99,"itemUnitPriceAmount":9.99},
        ]
    },
    {
        "date": "2026-01-19",
        "warehouse": "CARMEL MOUNTAIN",
        "items": [
            {"itemNumber":"1048072","itemDescription01":"GREEK YOGURT","itemDescription02":"DOM55 SL35","unit":2,"amount":13.78,"itemUnitPriceAmount":6.89},
            {"itemNumber":"1874996","itemDescription01":"KS WLD BLBRY","itemDescription02":"T9H6 P324","unit":1,"amount":12.99,"itemUnitPriceAmount":12.99},
            {"itemNumber":"1068080","itemDescription01":"PASTURE EGGS","itemDescription02":"2DZ GRADE A P360/300 SL22","unit":1,"amount":7.99,"itemUnitPriceAmount":7.99},
            {"itemNumber":"3923","itemDescription01":"LIMES 3 LB.","itemDescription02":"1.36 KG / 3 LB.","unit":1,"amount":5.99,"itemUnitPriceAmount":5.99},
            {"itemNumber":"12","itemDescription01":"NON FAT MILK","itemDescription02":"SL 14","unit":1,"amount":6.29,"itemUnitPriceAmount":6.29},
        ]
    },
    {
        "date": "2026-01-10",
        "warehouse": "CARMEL MOUNTAIN",
        "items": [
            {"itemNumber":"1891143","itemDescription01":"WILDE BUFF","itemDescription02":"PROTEIN CHIPS P240 SL210","unit":1,"amount":9.99,"itemUnitPriceAmount":9.99},
            {"itemNumber":"371808","itemDescription01":"/ 1891143","unit":-1,"amount":-3,"itemUnitPriceAmount":0},
            {"itemNumber":"777891","itemDescription01":"KS SCALLOPS","itemDescription02":"NW/NE/SE/TE 6X6","unit":1,"amount":46.99,"itemUnitPriceAmount":46.99},
            {"itemNumber":"1491866","itemDescription01":"PUMPKIN SEED","itemDescription02":"GO RAW P460 SL270","unit":1,"amount":9.99,"itemUnitPriceAmount":9.99},
            {"itemNumber":"6262016","itemDescription01":"**KS BATH**","itemDescription02":"1425 SQFT P30 W/US P66","unit":1,"amount":20.99,"itemUnitPriceAmount":20.99},
            {"itemNumber":"1078110","itemDescription01":"ORG GUAVA JC","itemDescription02":"SUN TROP 25%JCE T12H4P192","unit":1,"amount":6.29,"itemUnitPriceAmount":6.29},
            {"itemNumber":"1497","itemDescription01":"CA REDEMP VAL N EE/1078110","unit":1,"amount":0.2,"itemUnitPriceAmount":0},
            {"itemNumber":"1392843","itemDescription01":"AVOCA SPRAY","itemDescription02":"2/13.5Z 2/382G P=480","unit":1,"amount":13.79,"itemUnitPriceAmount":13.79},
            {"itemNumber":"1710454","itemDescription01":"KEW MAYO","itemDescription02":"C16T10H5P800 SL270","unit":1,"amount":5.99,"itemUnitPriceAmount":5.99},
            {"itemNumber":"1874996","itemDescription01":"KS WLD BLBRY","itemDescription02":"T9H6 P324","unit":1,"amount":11.69,"itemUnitPriceAmount":11.69},
            {"itemNumber":"7445","itemDescription01":"10LB BAKERS","itemDescription02":"4.5KG / 10 LB","unit":1,"amount":4.49,"itemUnitPriceAmount":4.49},
            {"itemNumber":"782796","itemDescription01":"***KSWTR40PK***","itemDescription02":"P48=SE   P56=PR","unit":1,"amount":3.99,"itemUnitPriceAmount":3.99},
            {"itemNumber":"4469","itemDescription01":"CA REDEMP VAL N EE/782796","unit":1,"amount":2,"itemUnitPriceAmount":0},
            {"itemNumber":"284601","itemDescription01":"KS ALMONDS","itemDescription02":"1.36 KG C13 T6 H5 P390","unit":1,"amount":12.49,"itemUnitPriceAmount":12.49},
            {"itemNumber":"979855","itemDescription01":"KS GREEN TEA","itemDescription02":"BAGS 100CT","unit":1,"amount":11.99,"itemUnitPriceAmount":11.99},
            {"itemNumber":"1026537","itemDescription01":"KOKUSAI RICE","itemDescription02":"5T 9H               P45","unit":1,"amount":26.99,"itemUnitPriceAmount":26.99},
            {"itemNumber":"2619","itemDescription01":"ORG BANANAS","itemDescription02":"3 LB / 1.36 KG","unit":1,"amount":2.49,"itemUnitPriceAmount":2.49},
            {"itemNumber":"522779","itemDescription01":"KS RD PEPPER","itemDescription02":"T9H6  20/10Z","unit":1,"amount":3.99,"itemUnitPriceAmount":3.99},
            {"itemNumber":"370586","itemDescription01":"ORG. DATES","itemDescription02":"907 G / 2 LB","unit":1,"amount":11.99,"itemUnitPriceAmount":11.99},
            {"itemNumber":"371710","itemDescription01":"/ 370586","unit":-1,"amount":-2,"itemUnitPriceAmount":0},
            {"itemNumber":"3923","itemDescription01":"LIMES 3 LB.","itemDescription02":"1.36 KG / 3 LB.","unit":1,"amount":5.49,"itemUnitPriceAmount":5.49},
            {"itemNumber":"1832874","itemDescription01":"SABLEFISH","itemDescription02":"C12 T10H5 P600","unit":1,"amount":23.89,"itemUnitPriceAmount":23.89},
        ]
    },
]


# ---------------------------------------------------------------------------
# PocketBase auth + helpers
# ---------------------------------------------------------------------------
def auth():
    for endpoint in [
        "/api/collections/_superusers/auth-with-password",
        "/api/admins/auth-with-password",
    ]:
        r = requests.post(f"{PB_URL}{endpoint}",
                          json={"identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=10)
        if r.ok:
            return r.json()["token"]
    r.raise_for_status()


def get_existing(token):
    """Return a set of (name_lower, purchase_date, store, unit_price) for dedup."""
    headers = {"Authorization": f"Bearer {token}"}
    existing, page = set(), 1
    while True:
        r = requests.get(
            f"{PB_URL}/api/collections/purchase_history/records",
            params={"page": page, "perPage": 200, "sort": "purchase_date"},
            headers=headers, timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        for rec in data["items"]:
            existing.add((
                (rec.get("name") or "").lower().strip(),
                rec.get("purchase_date", ""),
                rec.get("store", ""),
                float(rec.get("unit_price") or 0),
            ))
        if page >= data["totalPages"]:
            break
        page += 1
    return existing


def create_record(token, payload):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r = requests.post(
        f"{PB_URL}/api/collections/purchase_history/records",
        json=payload, headers=headers, timeout=10,
    )
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import_mode = "--import" in sys.argv

    print("Authenticating…")
    try:
        token = auth()
    except Exception as e:
        print(f"Auth failed: {e}\nIs PocketBase running? (docker compose up)")
        sys.exit(1)

    print("Loading existing records for dedup check…")
    existing = get_existing(token)
    print(f"  {len(existing)} existing records loaded.\n")

    # Build full list of items to import
    all_items = []
    for receipt in RECEIPTS_RAW:
        items = process_receipt(receipt["items"], receipt["date"], receipt["warehouse"])
        all_items.extend(items)

    # Check for duplicates
    to_import = []
    skipped   = []
    for item in all_items:
        key = (item["name"].lower().strip(), item["purchase_date"], item["store"], float(item["unit_price"]))
        if key in existing:
            skipped.append(item)
        else:
            to_import.append(item)

    # Print report
    print(f"{'='*90}")
    print(f"  {len(all_items)} items parsed across {len(RECEIPTS_RAW)} receipts")
    print(f"  {len(to_import)} to import  |  {len(skipped)} already exist (skipped)")
    print(f"{'='*90}\n")

    by_date = {}
    for item in to_import:
        by_date.setdefault(item["purchase_date"], []).append(item)

    for date in sorted(by_date):
        items = by_date[date]
        total = sum(item["unit_price"] * item["quantity"] for item in items)
        print(f"  {date}  ({len(items)} items, ~${total:.2f})")
        for it in items:
            qty_str = f"{it['quantity']:.2f} {it['unit']}" if it['unit'] else f"×{int(it['quantity']) if it['quantity'] == int(it['quantity']) else it['quantity']}"
            print(f"    {it['name']:<42} {qty_str:>10}   ${it['unit_price']:.4f}/{it['unit'] or 'pkg'}   [{it['category']}]")
        print()

    if skipped:
        print(f"  Skipped (already in DB):")
        for it in skipped:
            print(f"    {it['purchase_date']}  {it['name']}")
        print()

    if not to_import:
        print("  Nothing to import.")
        sys.exit(0)

    if not import_mode:
        print("  Run with --import to write these records.")
        sys.exit(0)

    print(f"\n  Import {len(to_import)} record(s)? [y/N] ", end="", flush=True)
    if input().strip().lower() != "y":
        print("  Aborted.")
        sys.exit(0)

    print("\n  Writing…")
    success = errors = 0
    for item in to_import:
        try:
            create_record(token, item)
            success += 1
        except Exception as e:
            print(f"  ERROR {item['name']} {item['purchase_date']}: {e}")
            errors += 1

    print(f"\n  Done: {success} created, {errors} errors.")
