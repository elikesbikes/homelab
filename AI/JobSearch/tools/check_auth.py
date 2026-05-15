#!/usr/bin/env python3
"""Validate that the li_at LinkedIn session cookie is still active."""

import os
import sys

import requests
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()
    li_at = os.getenv("li_at")
    if not li_at:
        print("❌ li_at not found in .env")
        sys.exit(1)

    session = requests.Session()
    session.cookies.set("li_at", li_at, domain=".linkedin.com")
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    })

    try:
        resp = session.get(
            "https://www.linkedin.com/feed/",
            timeout=15,
            allow_redirects=False,
        )
    except Exception as e:
        print(f"❌ Request failed: {e}")
        sys.exit(1)

    location = resp.headers.get("Location", "")

    if resp.status_code == 200:
        print("✅ Cookie valid — authenticated to LinkedIn")
        sys.exit(0)
    elif resp.status_code in (301, 302, 303) and ("login" in location or "authwall" in location):
        print("❌ Cookie expired — refresh li_at from LinkedIn DevTools and update .env")
        sys.exit(1)
    else:
        # Check body for auth wall indicators
        body = resp.text
        if "session_redirect" in body or "authwall" in body or "uas/login" in body:
            print("❌ Cookie expired — refresh li_at from LinkedIn DevTools and update .env")
            sys.exit(1)
        print(f"✅ Cookie appears valid (HTTP {resp.status_code})")
        sys.exit(0)


if __name__ == "__main__":
    main()
