#!/usr/bin/env python3
"""
Dump the raw Voyager API response for a single job ID so you can inspect
what fields LinkedIn is actually returning and fix parsing accordingly.

Usage:
    python3 tools/debug_job.py 4234567890
    python3 tools/debug_job.py 4234567890 | jq '.data | keys'
    python3 tools/debug_job.py 4234567890 | jq '.data.companyDetails'
    python3 tools/debug_job.py 4234567890 | jq '.data.salaryInsights'
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_linkedin_jobs import load_cookie, make_session, get_csrf_token, VOYAGER_HEADERS


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 tools/debug_job.py <job_id>", file=sys.stderr)
        sys.exit(1)

    job_id = sys.argv[1]
    li_at = load_cookie()
    session = make_session(li_at)
    csrf = get_csrf_token(session)

    url = f"https://www.linkedin.com/voyager/api/jobs/jobPostings/{job_id}"
    headers = {
        **VOYAGER_HEADERS,
        "Csrf-Token": csrf,
        "Cookie": f'li_at={session.cookies.get("li_at")}; JSESSIONID="{csrf}"',
    }

    resp = session.get(
        url,
        params={"decorationId": "com.linkedin.voyager.deco.jobs.web.shared.WebFullJobPosting-65"},
        headers=headers,
        timeout=15,
    )

    if resp.status_code != 200:
        print(f"HTTP {resp.status_code}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(resp.json(), indent=2))


if __name__ == "__main__":
    main()
