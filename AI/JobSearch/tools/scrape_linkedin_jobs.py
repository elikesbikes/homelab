#!/usr/bin/env python3
"""
LinkedIn Job Scraper
Scrapes job listings from LinkedIn search results and exports to Excel.
Reads credentials from .env (li_at, FIRECRAWL_API_KEY not used - direct requests only).

Usage:
    python3 tools/scrape_linkedin_jobs.py
    python3 tools/scrape_linkedin_jobs.py --keywords "infrastructure" --geo-id 101098412 --max-jobs 200
"""

import argparse
import html as html_module
import json
import os
import re
import time
from datetime import datetime, timezone

import openpyxl
import requests
from dotenv import load_dotenv
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────

BASE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

API_HEADERS_EXTRA = {
    "Accept": "application/vnd.linkedin.normalized+json+2.1",
    "x-restli-protocol-version": "2.0.0",
    "x-li-lang": "en_US",
    "x-li-track": (
        '{"clientVersion":"1.13.17965","mpVersion":"1.13.17965",'
        '"osName":"web","timezoneOffset":0,"deviceFormFactor":"DESKTOP",'
        '"mpName":"voyager-web","displayDensity":1}'
    ),
}

PAGE_STEP = 14   # Jobs per page visible in initial HTML
DETAIL_DELAY = 0.8  # Seconds between detail API calls (be polite)
SEARCH_DELAY = 1.5  # Seconds between search page requests


# ── Session setup ──────────────────────────────────────────────────────────

def build_session(li_at: str) -> tuple[requests.Session, str]:
    """Create authenticated session and return (session, csrf_token)."""
    session = requests.Session()
    session.cookies.set("li_at", li_at, domain=".linkedin.com")
    resp = session.get("https://www.linkedin.com", headers=BASE_HEADERS, timeout=15)
    resp.raise_for_status()
    csrf = session.cookies.get("JSESSIONID", "").strip('"')
    if not csrf:
        raise RuntimeError("Could not get CSRF token — is li_at valid?")
    return session, csrf


# ── Search scraper ─────────────────────────────────────────────────────────

def parse_job_cards(html_text: str) -> list[dict]:
    """Extract JobPostingCard records from embedded JSON in LinkedIn HTML."""
    jobs = []
    codes = re.findall(r"<code[^>]*>(.*?)</code>", html_text, re.DOTALL)
    for block in codes:
        try:
            data = json.loads(html_module.unescape(block))
            for item in data.get("included", []):
                if not item.get("$type", "").endswith("JobPostingCard"):
                    continue
                job_id = item.get("jobPostingUrn", "").split(":")[-1]
                if not job_id:
                    continue
                jobs.append(
                    {
                        "job_id": job_id,
                        "title": item.get("jobPostingTitle", ""),
                        "company": item.get("primaryDescription", {}).get("text", ""),
                        "location_raw": item.get("secondaryDescription", {}).get(
                            "text", ""
                        ),
                        "url": f"https://www.linkedin.com/jobs/view/{job_id}/",
                    }
                )
        except (json.JSONDecodeError, KeyError):
            pass
    return jobs


def scrape_search_pages(
    session: requests.Session,
    keywords: str,
    geo_id: str,
    time_filter: str,
    distance: int,
    max_jobs: int,
) -> list[dict]:
    """Paginate through search results and collect all job cards."""
    all_jobs: list[dict] = []
    seen_ids: set[str] = set()
    start = 0
    total_reported = None

    print(f"\n🔍 Searching: '{keywords}' | geoId={geo_id} | distance={distance}mi\n")

    while len(all_jobs) < max_jobs:
        url = (
            "https://www.linkedin.com/jobs/search/"
            f"?keywords={keywords}&geoId={geo_id}"
            f"&distance={distance}&f_TPR={time_filter}&start={start}"
        )
        resp = session.get(url, headers=BASE_HEADERS, timeout=20)
        if resp.status_code != 200:
            print(f"  ⚠ Search page returned {resp.status_code} at start={start}, stopping.")
            break

        # Pull total from metadata (first time only)
        if total_reported is None:
            codes = re.findall(r"<code[^>]*>(.*?)</code>", resp.text, re.DOTALL)
            for block in codes:
                try:
                    data = json.loads(html_module.unescape(block))
                    paging = data.get("data", {}).get("paging", {})
                    if "total" in paging:
                        total_reported = min(paging["total"], 1000)  # LinkedIn caps at ~1000
                        cap = min(total_reported, max_jobs)
                        print(f"  LinkedIn reports {paging['total']:,} results. Targeting {cap:,}.")
                        break
                except Exception:
                    pass

        page_jobs = parse_job_cards(resp.text)
        new_jobs = [j for j in page_jobs if j["job_id"] not in seen_ids]

        if not new_jobs:
            print(f"  No new jobs at start={start}, stopping.")
            break

        for job in new_jobs:
            seen_ids.add(job["job_id"])
            all_jobs.append(job)

        print(
            f"  Page start={start:4d} → {len(new_jobs):2d} new jobs "
            f"| Running total: {len(all_jobs)}"
        )

        if len(all_jobs) >= max_jobs:
            break

        start += PAGE_STEP
        time.sleep(SEARCH_DELAY)

    print(f"\n✅ Collected {len(all_jobs)} job cards from search results.\n")
    return all_jobs[:max_jobs]


# ── Detail scraper ─────────────────────────────────────────────────────────

def parse_description(desc: dict | None) -> str:
    """Extract plain text from LinkedIn description attribute structure."""
    if not desc:
        return ""
    text = desc.get("text", "")
    if not text:
        return ""
    # Basic cleanup
    return text.strip()[:2000]


def scrape_job_detail(
    session: requests.Session, csrf: str, job_id: str
) -> dict:
    """Fetch rich detail for a single job via Voyager API."""
    url = f"https://www.linkedin.com/voyager/api/jobs/jobPostings/{job_id}"
    headers = {**BASE_HEADERS, **API_HEADERS_EXTRA, "csrf-token": csrf}
    params = {
        "decorationId": "com.linkedin.voyager.deco.jobs.web.shared.WebFullJobPosting-65"
    }
    detail: dict = {}
    try:
        resp = session.get(url, params=params, headers=headers, timeout=15)
        if resp.status_code != 200:
            return detail

        payload = resp.json()
        data = payload.get("data", {})
        included = payload.get("included", [])

        # Build lookup map from URN → localizedName for resolved entities
        urn_to_name: dict[str, str] = {}
        company_name = ""
        for item in included:
            urn = item.get("entityUrn", "")
            name = item.get("localizedName") or item.get("name", "")
            if urn and name:
                urn_to_name[urn] = name
            # Grab company name while we're here
            t = item.get("$type", "")
            if ("Company" in t or "NormalizedCompany" in t) and not company_name:
                company_name = item.get("name", "")

        # Employment type (resolve URN via included lookup)
        emp_urn = data.get("employmentStatus", "")
        detail["employment_type"] = urn_to_name.get(emp_urn, emp_urn.split(":")[-1].replace("_", " ").title() if emp_urn else "")

        # Work type: workplaceTypesResolutionResults maps *urn → resolved urn
        workplace_map = data.get("workplaceTypesResolutionResults", {})
        work_type = ""
        for resolved_urn in workplace_map.values():
            if resolved_urn in urn_to_name:
                work_type = urn_to_name[resolved_urn]
                break
        if not work_type:
            work_type = "Remote" if data.get("workRemoteAllowed") else "On-site"
        detail["work_type"] = work_type

        # Date posted
        listed_at = data.get("listedAt")
        if listed_at:
            dt = datetime.fromtimestamp(listed_at / 1000, tz=timezone.utc)
            detail["date_posted"] = dt.strftime("%Y-%m-%d")
        else:
            detail["date_posted"] = ""

        # Salary
        salary = data.get("salaryInsights", {})
        if salary and salary.get("jobCompensationAvailable"):
            comp = salary.get("compensationBreakdown", {})
            detail["salary"] = str(comp) if comp else "Available (see listing)"
        else:
            detail["salary"] = ""

        # Easy Apply
        apply = data.get("applyMethod", {})
        detail["easy_apply"] = "Yes" if isinstance(apply, dict) and "easyApplyUrl" in apply else "No"

        # Seniority (resolve URN)
        sen_urn = data.get("seniorityLevel") or ""
        detail["seniority"] = urn_to_name.get(sen_urn, sen_urn.split(":")[-1].replace("_", " ").title() if sen_urn else "")

        # Company
        detail["company_full"] = company_name

        # Number of applicants
        applies = data.get("applies")
        detail["applicants"] = applies if applies else ""

        # Description
        detail["description"] = parse_description(data.get("description"))

    except Exception as e:
        detail["_error"] = str(e)

    return detail


# ── Excel export ───────────────────────────────────────────────────────────

COLUMNS = [
    ("job_id",          "Job ID",           12),
    ("title",           "Job Title",        40),
    ("company",         "Company",          28),
    ("location_raw",    "Location",         30),
    ("work_type",       "Work Type",        14),
    ("employment_type", "Employment Type",  18),
    ("seniority",       "Seniority",        16),
    ("date_posted",     "Date Posted",      14),
    ("salary",          "Salary",           20),
    ("easy_apply",      "Easy Apply",       12),
    ("applicants",      "Applicants",       12),
    ("url",             "URL",              50),
    ("description",     "Description",      60),
]


def export_to_excel(jobs: list[dict], output_path: str) -> None:
    """Write jobs list to a formatted Excel workbook."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "LinkedIn Jobs"

    header_fill = PatternFill("solid", fgColor="1A1A2E")
    header_font = Font(bold=True, color="FFFFFF", size=11)

    # Header row
    for col_idx, (_, header, width) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    ws.freeze_panes = "A2"

    # Data rows
    for row_idx, job in enumerate(jobs, start=2):
        for col_idx, (field, _, _) in enumerate(COLUMNS, start=1):
            value = job.get(field, "")
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            # Make URL clickable
            if field == "url" and value:
                cell.hyperlink = value
                cell.font = Font(color="0563C1", underline="single")

    wb.save(output_path)
    print(f"📊 Saved {len(jobs)} jobs → {output_path}")


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape LinkedIn job listings to Excel")
    parser.add_argument("--keywords",   default="infrastructure",  help="Search keywords")
    parser.add_argument("--geo-id",     default="101098412",       help="LinkedIn geoId")
    parser.add_argument("--distance",   default=25,   type=int,    help="Distance in miles")
    parser.add_argument("--time-filter",default="r604800",         help="Time filter (r604800=1 week)")
    parser.add_argument("--max-jobs",   default=650,  type=int,    help="Max jobs to collect")
    parser.add_argument("--no-details", action="store_true",       help="Skip detail scraping")
    parser.add_argument("--output",     default="",                help="Output Excel path")
    args = parser.parse_args()

    li_at = os.getenv("li_at")
    if not li_at:
        raise SystemExit("❌ li_at not found in .env")

    # Build session
    print("🔐 Authenticating with LinkedIn...")
    session, csrf = build_session(li_at)
    print(f"   CSRF token obtained: {csrf[:20]}...")

    # Scrape search pages
    jobs = scrape_search_pages(
        session=session,
        keywords=args.keywords,
        geo_id=args.geo_id,
        time_filter=args.time_filter,
        distance=args.distance,
        max_jobs=args.max_jobs,
    )

    if not jobs:
        raise SystemExit("❌ No jobs found. Check your search parameters or li_at cookie.")

    # Scrape individual job details
    if not args.no_details:
        print(f"📋 Fetching details for {len(jobs)} jobs...\n")
        for i, job in enumerate(jobs, start=1):
            detail = scrape_job_detail(session, csrf, job["job_id"])
            job.update(detail)
            # Use richer company name if available
            if detail.get("company_full"):
                job["company"] = detail["company_full"]
            if i % 25 == 0:
                print(f"   {i}/{len(jobs)} details fetched...")
            time.sleep(DETAIL_DELAY)
        print(f"\n✅ Details fetched for all {len(jobs)} jobs.\n")

    # Export
    if not args.output:
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        kw = args.keywords.replace(" ", "_")
        output_path = f".tmp/linkedin_jobs_{kw}_{ts}.xlsx"
    else:
        output_path = args.output

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    export_to_excel(jobs, output_path)


if __name__ == "__main__":
    main()
