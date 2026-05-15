#!/usr/bin/env python3
"""
Multi-keyword LinkedIn job scraper.

Runs 11 keyword searches, deduplicates by job ID, and exports one combined Excel file.
Edit KEYWORDS, GEO_ID, or TIME_FILTER below to customize.
"""

import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_linkedin_jobs import scrape, export_to_excel

KEYWORDS = [
    "infrastructure",
    "infrastructure engineer",
    "infrastructure manager",
    "cloud infrastructure",
    "devops engineer",
    "platform engineer",
    "site reliability engineer",
    "systems engineer",
    "cloud engineer",
    "kubernetes engineer",
    "terraform engineer",
]

GEO_ID            = "103644278"  # United States
DISTANCE          = 25
TIME_FILTER       = "r604800"    # Past week
MAX_JOBS_PER_KW   = 70           # ~LinkedIn's cap per search window
INTER_KW_DELAY    = 3            # seconds to wait between keyword batches


def main() -> None:
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    output = f".tmp/linkedin_jobs_batch_{ts}.xlsx"
    Path(".tmp").mkdir(exist_ok=True)

    all_jobs: dict[str, dict] = {}  # job_id → job dict

    for i, kw in enumerate(KEYWORDS):
        print(f"\n[{i + 1}/{len(KEYWORDS)}] Keyword: '{kw}'")
        try:
            jobs = scrape(
                keywords=kw,
                geo_id=GEO_ID,
                distance=DISTANCE,
                time_filter=TIME_FILTER,
                max_jobs=MAX_JOBS_PER_KW,
                fetch_details=True,
                output=None,
            )
        except Exception as e:
            print(f"  ❌ Failed for '{kw}': {e}")
            jobs = []

        new = 0
        for job in jobs:
            jid = job.get("job_id")
            if jid and jid not in all_jobs:
                all_jobs[jid] = job
                new += 1

        print(f"  +{new} new | total unique: {len(all_jobs)}")

        if i < len(KEYWORDS) - 1:
            time.sleep(INTER_KW_DELAY)

    jobs_list = list(all_jobs.values())
    print(f"\n📊 Total unique jobs across all keywords: {len(jobs_list)}")
    export_to_excel(jobs_list, output)


if __name__ == "__main__":
    main()
