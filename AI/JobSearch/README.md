# LinkedIn Job Scraper

Scrapes LinkedIn job listings across multiple keyword searches, deduplicates results, and exports everything to a single Excel file for review.

Built on the **WAT framework** (Workflows → Agent → Tools): the agent reads workflow instructions and orchestrates deterministic Python scripts so you get reliable, repeatable results.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [How It Works](#how-it-works)
- [Setup](#setup-one-time)
- [Running the Scraper](#running-the-scraper)
- [Re-running Weekly](#re-running-weekly)
- [Customizing the Search](#customizing-the-search)
- [Output Fields](#output-fields)
- [File Structure](#file-structure)
- [Troubleshooting](#troubleshooting)
- [Authored By](#authored-by)

---

## Quick Start

```bash
# 1. Install dependencies
pip3 install firecrawl-py openpyxl python-dotenv requests --break-system-packages

# 2. Add your LinkedIn session cookie to .env
echo "li_at=YOUR_COOKIE_VALUE_HERE" > .env

# 3. Run the batch scraper
python3 tools/batch_linkedin_jobs.py
```

Output lands in `.tmp/linkedin_jobs_batch_YYYYMMDD_HHMM.xlsx`.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Claude Code Pro** | Required to run the AI agent and MCP tools. [Get it here](https://claude.ai/code) |
| **Python 3.8+** | `python3 --version` to confirm |
| **pip packages** | `firecrawl-py`, `openpyxl`, `python-dotenv`, `requests` |
| **LinkedIn account** | Logged-in session required to extract the `li_at` cookie |
| **Firecrawl API key** | Optional — available for non-LinkedIn scraping workflows (LinkedIn blocks Firecrawl; not used here) |
| **`.env` file** | Must contain `li_at` (and optionally `FIRECRAWL_API_KEY`) |

---

## How It Works

1. **Authentication** — Uses your LinkedIn session cookie (`li_at`) to make authenticated requests. No browser automation needed.
2. **Multi-keyword search** — Runs 11 keyword searches (e.g. "infrastructure engineer", "cloud infrastructure", etc.) against the LinkedIn search HTML, which embeds job card data as JSON.
3. **Deduplication** — Tracks job IDs across all searches so each listing appears only once.
4. **Detail enrichment** — Hits the LinkedIn Voyager API once per unique job to pull employment type, work type, salary, easy apply, date posted, and description.
5. **Excel export** — Writes a formatted `.xlsx` with frozen headers and clickable URLs.

> LinkedIn limits programmatic access to ~70 results per search window. Running 11 keyword variations yields ~400 unique jobs per run.

---

## Setup (one-time)

### 1. Install dependencies

```bash
pip3 install firecrawl-py openpyxl python-dotenv requests --break-system-packages
```

### 2. Add your LinkedIn session cookie

1. Open LinkedIn in your browser and log in
2. Press `F12` → **Application** tab → **Cookies** → `www.linkedin.com`
3. Find the cookie named `li_at` and copy its value
4. Open `.env` and set it:

```env
li_at=YOUR_COOKIE_VALUE_HERE
```

> **Note:** The `li_at` cookie expires periodically (every few weeks). If the scraper returns 0 jobs, refresh this value.

### 3. Verify authentication

```bash
python3 tools/check_auth.py
```

Exits with `✅ Cookie valid` or `❌ Cookie expired` — run this before every session if you haven't scraped in a while.

### 4. Verify the MCP server (optional)

The Firecrawl MCP is registered and reads `FIRECRAWL_API_KEY` from `.env`. It is not used for LinkedIn (LinkedIn blocks Firecrawl), but is available for other scraping workflows.

---

## Running the Scraper

### Batch mode (recommended — 11 keywords, deduped)

```bash
python3 tools/batch_linkedin_jobs.py
```

Output: `.tmp/linkedin_jobs_batch_YYYYMMDD_HHMM.xlsx`

### Single-keyword mode

```bash
python3 tools/scrape_linkedin_jobs.py --keywords "devops engineer" --max-jobs 70
```

Full options:

```
--keywords      Search terms (default: "infrastructure")
--geo-id        LinkedIn geo ID (default: 101098412 = Massachusetts)
--distance      Distance in miles (default: 25)
--time-filter   r86400=24h | r604800=1 week | r2592000=1 month (default: r604800)
--max-jobs      Max results to collect (default: 650, LinkedIn caps ~70/search)
--no-details    Skip per-job detail API calls (faster, fewer fields)
--output        Custom output path (default: auto-named in .tmp/)
```

> **Geo-ID note:** The single-keyword scraper defaults to **Massachusetts** (`101098412`). The batch scraper defaults to **United States** (`103644278`). Override either with `--geo-id`.

---

## Re-running Weekly

Each week:

1. **Optionally verify `li_at`** — run `python3 tools/check_auth.py`
2. **Optionally refresh `li_at`** if it expired (you'll know because `check_auth.py` fails or the scraper returns 0 jobs)
3. Run:

```bash
python3 tools/batch_linkedin_jobs.py
```

The `TIME_FILTER = "r604800"` default means only jobs posted in the past 7 days are returned — so each weekly run gives you a clean set of new listings.

---

## Customizing the Search

Edit [`tools/batch_linkedin_jobs.py`](tools/batch_linkedin_jobs.py) to change keywords, location, or time window:

```python
KEYWORDS = [
    "infrastructure",
    "infrastructure engineer",
    "infrastructure manager",
    # add or remove keywords here
]

GEO_ID      = "103644278"   # United States
DISTANCE    = 25
TIME_FILTER = "r604800"     # Past week
```

### Common Geo IDs

| Location | ID |
|---|---|
| United States | `103644278` |
| Massachusetts | `101098412` |
| New York | `102571732` |
| California | `102095887` |
| Texas | `102748797` |
| Remote (no geo filter) | omit `--geo-id` |

---

## Output Fields

| Column | Description |
|---|---|
| Job ID | LinkedIn internal ID |
| Job Title | Listing title |
| Company | Company name |
| Location | City, State |
| Work Type | Remote / Hybrid / On-site |
| Employment Type | Full-time / Part-time / Contract |
| Seniority | When listed by employer |
| Date Posted | ISO date (YYYY-MM-DD) |
| Salary | When listed (~20-30% of jobs include this) |
| Easy Apply | Yes / No |
| Applicants | Number of applicants (when available) |
| URL | Clickable link to the LinkedIn listing |
| Description | First 2,000 characters of job description |

---

## File Structure

```
JobSearch/
├── README.md                        ← you are here
├── CLAUDE.md                        ← WAT framework instructions for the AI agent
├── .env                             ← API keys and credentials (never committed)
├── .gitignore
├── tools/
│   ├── scrape_linkedin_jobs.py      ← single keyword scraper + Excel exporter
│   ├── batch_linkedin_jobs.py       ← multi-keyword orchestrator with dedup
│   └── check_auth.py               ← validates your li_at cookie is still active
├── workflows/
│   └── scrape_linkedin_jobs.md      ← SOP: how to run, troubleshoot, and extend
└── .tmp/                            ← generated Excel files land here (gitignored)
```

---

## Troubleshooting

### Check if your cookie is still valid

```bash
python3 tools/check_auth.py
```

**0 jobs returned**
→ Your `li_at` cookie expired. Refresh it from LinkedIn DevTools and update `.env`.

**Same jobs every run**
→ Change `TIME_FILTER` to `r86400` (24h) if running daily, or confirm your cookie is fresh.

**Fewer jobs than expected**
→ LinkedIn caps programmatic access at ~70 results per search window regardless of how many are shown in the browser. Add more keyword variations to the `KEYWORDS` list to increase coverage.

**HTTP 429 or sudden empty pages (rate limited)**
→ Increase `SEARCH_DELAY` and `DETAIL_DELAY` constants in `scrape_linkedin_jobs.py`. The current defaults (1.5s search / 0.8s detail) work reliably for full batch runs; bump to 3s / 1.5s if you hit limits.

**`RuntimeError: Could not get CSRF token`**
→ The `li_at` cookie is invalid or the LinkedIn homepage returned an unexpected response. Refresh the cookie and retry.

---

## Authored By

Built by **TARS (Emmanuel Loaiza)** with [Claude Code](https://claude.ai/code) using the WAT framework (Workflows, Agents, Tools).
