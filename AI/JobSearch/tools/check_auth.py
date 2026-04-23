#!/usr/bin/env python3
"""
Check if the li_at LinkedIn session cookie in .env is still valid.

Usage:
    python3 tools/check_auth.py
"""

import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

li_at = os.getenv("li_at")

if not li_at:
    print("❌ li_at not found in .env")
    sys.exit(1)

print("🔍 Checking LinkedIn session cookie...")

r = requests.get(
    "https://www.linkedin.com/jobs/search/?keywords=infrastructure&start=0",
    headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Cookie": f"li_at={li_at}",
    },
    timeout=15,
)

if "<code" in r.text:
    print("✅ Cookie valid — ready to scrape")
    sys.exit(0)
else:
    print("❌ Cookie expired — refresh li_at in .env")
    print("   Go to LinkedIn → F12 → Application → Cookies → www.linkedin.com → li_at")
    sys.exit(1)
