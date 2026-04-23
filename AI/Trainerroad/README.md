# TrainerRoad Activity Scraper & Analyzer

A WAT-framework project that scrapes your TrainerRoad workout history into Excel and analyzes training load, TSS trends, and fitness metrics.

## Features

- Authenticates with TrainerRoad via Playwright (handles httpOnly session cookies)
- Paginates the full activity history API — no scroll limits
- Exports activities to a formatted `.xlsx` file with hyperlinks
- Analyzes training data: weekly TSS, ramp rate, streaks, power trends, and top workouts
- Outputs structured JSON for AI-driven training insights via the `trainerroad-insights` skill

## Prerequisites

- Python 3.11+
- Playwright (Chromium)
- A TrainerRoad account

## Installation

```bash
pip install playwright openpyxl python-dotenv requests
playwright install chromium
```

## Configuration

Create a `.env` file in the project root:

```env
TR_EMAIL=you@example.com
TR_PASSWORD=yourpassword
TR_USERNAME=yourtrainerroadusername
```

Credentials are **never** committed — `.env` is gitignored.

## Usage

### 1. Pre-flight check

Verify credentials and site reachability before scraping:

```bash
python3 tools/check_trainerroad.py
```

### 2. Scrape activities

```bash
python3 tools/scrape_trainerroad_activities.py
```

Output is saved to `.tmp/trainerroad_activities_YYYYMMDD_HHMM.xlsx`.

**Options:**

```bash
# Specify a username
python3 tools/scrape_trainerroad_activities.py --username elikesbikes

# Show browser window (debug mode)
python3 tools/scrape_trainerroad_activities.py --no-headless

# Custom output path
python3 tools/scrape_trainerroad_activities.py --output .tmp/my_activities.xlsx
```

### 3. Analyze workout data

```bash
python3 tools/analyze_workouts.py
```

Reads the latest `.xlsx` from `.tmp/` and prints JSON with training load analysis.

**Options:**

```bash
# Limit to last N weeks
python3 tools/analyze_workouts.py --weeks 8

# Use a specific file
python3 tools/analyze_workouts.py --file .tmp/trainerroad_activities_20260421_1934.xlsx
```

## Output

### Excel columns

| Column | Description |
|--------|-------------|
| Date | Activity date (YYYY-MM-DD) |
| Name | Workout name |
| Sport | Sport type |
| Activity Type | Internal activity classification |
| Duration (min) | Duration in minutes |
| TSS | Training Stress Score |
| IF | Intensity Factor |
| NP (watts) | Normalized Power |
| kJ | Kilojoules |
| Distance (mi) | Distance in miles |
| Progression Lvl | TrainerRoad progression level |
| Survey | Post-workout survey response |
| External | Whether activity was external |
| Device | Recording device name |
| URL | Link to activity on TrainerRoad |

### Analysis JSON

```json
{
  "meta": { "total_activities": 312, "date_range": { "earliest": "...", "latest": "..." } },
  "summary": { "total_tss": 14200, "avg_weekly_tss": 420, "tss_ramp_rate_pct": 8.2, ... },
  "weekly_tss": [...],
  "workout_type_breakdown": {...},
  "top_workouts_by_tss": [...],
  "power_trends": { "avg_power_mean": 215, "np_mean": 228 }
}
```

## Project Structure

```
.
├── tools/
│   ├── scrape_trainerroad_activities.py   # Main scraper (Playwright + API)
│   ├── analyze_workouts.py                # Workout data analysis
│   └── check_trainerroad.py              # Credential & connectivity check
├── workflows/
│   └── scrape_trainerroad_activities.md  # Step-by-step SOP
├── .tmp/                                  # Exported Excel files (gitignored)
├── .env                                   # Credentials (gitignored)
└── CLAUDE.md                              # Agent instructions (WAT framework)
```

## Troubleshooting

**Login fails** — Verify `TR_EMAIL`/`TR_PASSWORD` in `.env`. Run with `--no-headless` to see the browser. Note: 2FA is not supported.

**API returns 401** — The scraper logs a warning and stops. Re-run; the session may have expired.

**Empty activity list** — Confirm the username is correct and the account has completed workouts.

**Page selectors broken** — TrainerRoad updates their React app regularly. Run `--no-headless`, inspect the login form, and update `email_sel`/`password_sel` in the scraper.

## Rate Limiting

- 1 second delay between paginated API calls
- No known hard limits for normal single-user usage
