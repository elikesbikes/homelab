#!/usr/bin/env python3
"""
LinkedIn Batch Job Scraper
Runs multiple keyword searches, deduplicates by job_id, fetches details once per unique job.

Usage:
    python3 tools/batch_linkedin_jobs.py
"""

import os
import time
from datetime import datetime

from dotenv import load_dotenv

# Import core functions from the existing tool
import sys
sys.path.insert(0, os.path.dirname(__file__))
from scrape_linkedin_jobs import (
    build_session,
    scrape_search_pages,
    scrape_job_detail,
    export_to_excel,
    DETAIL_DELAY,
)

load_dotenv()

# ── Keyword list ───────────────────────────────────────────────────────────

KEYWORDS = [
    "infrastructure",
    "infrastructure engineer",
    "infrastructure manager",
    "infrastructure architect",
    "infrastructure operations",
    "infrastructure lead",
    "network infrastructure",
    "cloud infrastructure",
    "IT infrastructure",
    "infrastructure specialist",
    "infrastructure director",
]

# Search config (same geo/filters for all)
GEO_ID     = "103644278"   # United States
DISTANCE   = 25
TIME_FILTER = "r604800"    # Past week
MAX_PER_KEYWORD = 70       # LinkedIn typically caps around 63-70 per search window


def main():
    li_at = os.getenv("li_at")
    if not li_at:
        raise SystemExit("❌ li_at not found in .env")

    print("🔐 Authenticating with LinkedIn...")
    session, csrf = build_session(li_at)
    print(f"   CSRF: {csrf[:20]}...\n")

    all_jobs: dict[str, dict] = {}  # job_id → job dict (dedup key)

    # ── Phase 1: collect all job cards ────────────────────────────────────
    print("=" * 60)
    print("PHASE 1: Collecting job cards across all keywords")
    print("=" * 60)

    for kw in KEYWORDS:
        jobs = scrape_search_pages(
            session=session,
            keywords=kw,
            geo_id=GEO_ID,
            time_filter=TIME_FILTER,
            distance=DISTANCE,
            max_jobs=MAX_PER_KEYWORD,
        )
        new = 0
        for job in jobs:
            if job["job_id"] not in all_jobs:
                all_jobs[job["job_id"]] = job
                new += 1
        print(f'  "{kw}" → {len(jobs)} scraped, {new} new unique | Total unique: {len(all_jobs)}\n')
        time.sleep(2)  # pause between keyword searches

    print(f"\n✅ Phase 1 complete: {len(all_jobs)} unique jobs collected.\n")

    # ── Phase 2: fetch details for all unique jobs ─────────────────────────
    print("=" * 60)
    print(f"PHASE 2: Fetching details for {len(all_jobs)} unique jobs")
    print("=" * 60 + "\n")

    jobs_list = list(all_jobs.values())
    for i, job in enumerate(jobs_list, start=1):
        detail = scrape_job_detail(session, csrf, job["job_id"])
        job.update(detail)
        if detail.get("company_full"):
            job["company"] = detail["company_full"]
        if i % 50 == 0:
            print(f"   {i}/{len(jobs_list)} details fetched...")
        time.sleep(DETAIL_DELAY)

    print(f"\n✅ Phase 2 complete.\n")

    # ── Phase 3: export ────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    output_path = f".tmp/linkedin_jobs_batch_{ts}.xlsx"
    os.makedirs(".tmp", exist_ok=True)
    export_to_excel(jobs_list, output_path)
    print(f"\n🎉 Done. {len(jobs_list)} jobs → {output_path}")


if __name__ == "__main__":
    main()
