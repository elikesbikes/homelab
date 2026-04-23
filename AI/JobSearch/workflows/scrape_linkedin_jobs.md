# Workflow: Scrape LinkedIn Job Listings

## Objective
Collect job listings from a LinkedIn search URL and export them to Excel for review and analysis.

## Required Inputs
| Input | Where | Notes |
|---|---|---|
| `li_at` | `.env` | LinkedIn session cookie. Get from: DevTools → Application → Cookies → `www.linkedin.com` → `li_at`. Expires periodically — refresh if scraping fails with auth errors. |
| `FIRECRAWL_API_KEY` | `.env` | Not used for LinkedIn (Firecrawl blocks it). Present for other workflows. |

## Tool
`tools/scrape_linkedin_jobs.py`

## Usage

```bash
# Default: 650 jobs, keywords=infrastructure, geoId=101098412 (Massachusetts), past week
python3 tools/scrape_linkedin_jobs.py

# Custom search
python3 tools/scrape_linkedin_jobs.py \
  --keywords "devops" \
  --geo-id 103644278 \
  --distance 25 \
  --time-filter r604800 \
  --max-jobs 500 \
  --output .tmp/devops_jobs.xlsx

# Fast mode (no detail scraping — only title, company, location, URL)
python3 tools/scrape_linkedin_jobs.py --no-details --max-jobs 650
```

## Arguments
| Arg | Default | Description |
|---|---|---|
| `--keywords` | `infrastructure` | Search keywords |
| `--geo-id` | `101098412` | LinkedIn geo ID (101098412 = Massachusetts) |
| `--distance` | `25` | Distance in miles |
| `--time-filter` | `r604800` | `r86400`=24h, `r604800`=1 week, `r2592000`=1 month |
| `--max-jobs` | `650` | Max results to collect (LinkedIn caps at ~1000) |
| `--no-details` | False | Skip per-job detail scraping (much faster) |
| `--output` | auto | Output path (default: `.tmp/linkedin_jobs_{kw}_{ts}.xlsx`) |

## Output Fields
| Column | Source |
|---|---|
| Job ID | Search results |
| Job Title | Search results |
| Company | Detail API |
| Location | Search results |
| Work Type | Detail API (On-site / Remote / Hybrid) |
| Employment Type | Detail API (Full-time / Part-time / Contract) |
| Seniority | Detail API (when listed) |
| Date Posted | Detail API |
| Salary | Detail API (when listed) |
| Easy Apply | Detail API |
| Applicants | Detail API |
| URL | Constructed from Job ID |
| Description | Detail API (first 2000 chars) |

## How It Works
1. LinkedIn renders job card data as escaped JSON in `<code>` blocks in the HTML
2. We paginate the search URL using `start=0, 14, 28, ...` (14 jobs visible per HTML load)
3. For each job card, we call the Voyager API (`/voyager/api/jobs/jobPostings/{id}`) to get rich detail
4. The Voyager API returns URN references; resolved human-readable names are in the `included` array
5. Results are written to a formatted Excel file with frozen header row and clickable URLs

## Common Issues

### No jobs found / auth error
- `li_at` cookie has expired. Refresh it from LinkedIn DevTools.
- Update `.env` with the new value.

### Rate limiting (HTTP 429 or sudden empty pages)
- Increase `SEARCH_DELAY` and `DETAIL_DELAY` constants in the script
- Tried: 1.5s search / 0.8s detail — worked for 650 jobs without issues

### Firecrawl tried first, blocked
- Firecrawl explicitly blocks LinkedIn. Do not attempt. Direct requests with `li_at` cookie work reliably.

### LinkedIn reports 6000+ results but you wanted only 622
- LinkedIn caps accessible results at ~1000 regardless of total
- Use `--max-jobs` to control how many you want

## LinkedIn Geo IDs Reference
- Massachusetts: `101098412`
- United States: `103644278`
- New York: `102571732`
- Remote (no geo): omit `--geo-id`
