# Workflow: Scrape Past SharkNinja Employees from LinkedIn

## Objective
Discover and export LinkedIn profiles of people who **previously worked** at SharkNinja (company ID `73959`).
Produces an Excel file with Name, Headline, Location, Connection Degree, and Profile URL.

## How It Works

**Phase 1 — LinkedIn GraphQL Search**
Calls LinkedIn's `voyagerSearchDashClusters` GraphQL API with `pastCompany=73959` and `resultType=PEOPLE`.
This is the exact same filter as the LinkedIn people search UI — returns **only past employees**, never current ones.
LinkedIn reports ~4,159 total past employees; the API caps accessible results at 1,000.
Paginates 10 results per page with 1–1.5s delay between pages.

**Phase 2 — Profile Enrichment (requests + li_at)**
Fetches each profile page HTML and extracts cleaner name, headline, and location from `og:` meta tags.

## Required Inputs

| Input | Where | Notes |
|---|---|---|
| `li_at` | `.env` | LinkedIn session cookie (Premium account required for full access) |

## Pre-flight Check
Always validate your LinkedIn session before running:
```bash
python3 tools/check_auth.py
```
Output should show: `Logged in as: ... | ✅ Premium`

## Tool
`tools/scrape_linkedin_people.py`

## Usage

```bash
# Default: up to 200 profiles
python3 tools/scrape_linkedin_people.py

# Full run (LinkedIn caps at ~1000 accessible results)
python3 tools/scrape_linkedin_people.py --max-profiles 1000

# Discovery only, skip profile enrichment (faster)
python3 tools/scrape_linkedin_people.py --skip-profile-scrape

# Custom output path
python3 tools/scrape_linkedin_people.py --output .tmp/sharkninja_alumni_custom.xlsx
```

## Arguments

| Arg | Default | Description |
|---|---|---|
| `--max-profiles` | `200` | Max profiles to collect |
| `--skip-profile-scrape` | off | Skip Phase 2 enrichment |
| `--output` | auto | Output path (default: `.tmp/sharkninja_alumni_YYYYMMDD_HHMM.xlsx`) |

## Output Fields

| Column | Source | Notes |
|---|---|---|
| Full Name | LinkedIn search result | Name as shown in search |
| Headline / Title | LinkedIn search result | Current role (enriched by Phase 2) |
| Left SharkNinja | *empty* | Requires profile-level API — see below |
| Location | LinkedIn search result | City/region |
| Connection | LinkedIn search result | 1st / 2nd / 3rd+ |
| LinkedIn Profile URL | LinkedIn search result | Clickable link |

## Known Limitations

### Result Cap
LinkedIn caps people search results at ~1,000 regardless of total (4,159+ past employees exist).
No workaround — this is enforced server-side even with Premium.

### Departure Date Not Available
The `Left SharkNinja` column will be empty. LinkedIn does not expose end-date data through
the people search API. It is only available via the full profile view API, which returns
accurate data only for 1st-degree connections.

**Manual workaround**: Click each profile URL, find the SharkNinja entry in their Experience section.

### Rate Limiting
LinkedIn enforces rate limits. If you hit HTTP 429, the script sleeps 30s and retries automatically.
For runs >500 profiles, expect occasional slowdowns.

## Common Issues

### `li_at` cookie expired
LinkedIn sessions expire, especially after extended automated use.
- Symptom: `check_auth.py` fails with redirect loop or JSESSIONID missing
- Fix: F12 → Application → Cookies → www.linkedin.com → `li_at` → copy → paste into `.env`

### Zero profiles found
- Run `python3 tools/check_auth.py` first
- Check that the cookie is for a **Premium** account

### GraphQL queryId stale
LinkedIn occasionally updates the `queryId` hash in the GraphQL endpoint.
- Symptom: HTTP 400 or empty results on page 0
- Fix: Open the search page in Chrome → F12 → Network → filter "graphql" → reload →
  copy the `queryId` parameter from the request → update `QUERY_ID` in `scrape_linkedin_people.py`

## API Reference

**LinkedIn GraphQL endpoint:**
```
GET https://www.linkedin.com/voyager/api/graphql
  ?includeWebMetadata=true
  &variables=(start:0,origin:FACETED_SEARCH,query:(flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:pastCompany,value:List(73959)),(key:resultType,value:List(PEOPLE))),includeFiltersInResponse:false))
  &queryId=voyagerSearchDashClusters.843215f2a3455f1bed85762a45d71be8
```

Increment `start` by 10 per page. Stop when `elements` returns empty results.

**Required headers:**
```
csrf-token: <JSESSIONID value>
x-restli-protocol-version: 2.0.0
Cookie: li_at=<value>
```
