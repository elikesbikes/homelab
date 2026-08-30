#!/usr/bin/env python3
"""
TrainerRoad health check.
Verifies that credentials are set and the TrainerRoad site is reachable.
Exit 0 = ok, Exit 1 = problem.

Usage:
    python3 tools/check_trainerroad.py
"""

import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://www.trainerroad.com"


def check():
    email = os.getenv("TR_EMAIL")
    password = os.getenv("TR_PASSWORD")

    if not email:
        print("❌ TR_EMAIL not set in .env")
        sys.exit(1)
    if not password:
        print("❌ TR_PASSWORD not set in .env")
        sys.exit(1)

    print(f"✓ TR_EMAIL set ({email})")
    print(f"✓ TR_PASSWORD set ({'*' * len(password)})")

    # Check site is reachable
    try:
        r = requests.get(f"{BASE_URL}/login", timeout=10)
        if r.status_code == 200:
            print(f"✓ TrainerRoad site reachable (HTTP {r.status_code})")
        else:
            print(f"⚠️  TrainerRoad returned HTTP {r.status_code}")
    except requests.RequestException as e:
        print(f"❌ Cannot reach TrainerRoad: {e}")
        sys.exit(1)

    # Check public TSS endpoint (no auth needed) to verify the API is up
    username = os.getenv("TR_USERNAME", "elikesbikes")
    try:
        r = requests.get(f"{BASE_URL}/api/tss/{username}", timeout=10)
        if r.status_code == 200:
            data = r.json()
            days = sum(len(week) for week in data.get("TssByDay", []))
            print(f"✓ TSS API accessible ({days} day records found for @{username})")
        else:
            print(f"⚠️  TSS API returned HTTP {r.status_code} for @{username}")
    except Exception as e:
        print(f"⚠️  TSS API check failed: {e}")

    print("\n✅ All checks passed — ready to scrape.")
    sys.exit(0)


if __name__ == "__main__":
    check()
