# TrainerRoad Activity Scraper & Analyzer

A WAT-framework project that scrapes your TrainerRoad workout history, classifies every session by training zone, and feeds structured data to an AI agent for personalized training insights.

## Table of Contents

- [Use Case](#use-case)
- [How It Works](#how-it-works)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [1. Pre-flight check](#1-pre-flight-check)
  - [2. Scrape activities](#2-scrape-activities)
  - [3. Analyze workout data](#3-analyze-workout-data)
- [Output](#output)
  - [Excel columns](#excel-columns)
  - [Workout Category — zone mapping](#workout-category--tr-progressionid-mapping)
  - [Analysis JSON](#analysis-json)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Rate Limiting](#rate-limiting)

---

## Use Case

TrainerRoad tracks your workouts but its built-in analytics are limited to high-level summaries. This project gives you the raw data and the AI-driven analysis layer on top of it.

The core problem it solves: **knowing whether your training mix actually matches your goals.**

For example, a cyclist who does long endurance events (gran fondos, centuries, gravel races) needs a very different zone distribution than a criterium racer. TrainerRoad doesn't tell you "you've been doing too much Threshold and not enough Tempo for your event type" — this project does.

Specifically, the workflow answers questions like:

- **What is my Sweet Spot vs VO2 Max vs Threshold split?** Not just by session count, but by TSS — so you can see where your actual training stress is going.
- **Is my weekly TSS trending up, down, or flat?** And is the ramp rate sustainable or are you heading toward overtraining?
- **What does my week-by-week schedule actually look like?** Day-by-day zone breakdown to spot gaps, imbalances, or patterns you're not aware of.
- **Given my event type and life context, what should I change?** The AI layer (via the `trainerroad-insights` Claude Code skill) takes the data and gives actionable recommendations tailored to the athlete — including factors like health, recovery, and schedule constraints.

This is most useful for self-coached athletes or anyone who wants a second opinion on their training structure beyond what a training plan alone provides.

---

## How It Works

The project follows the **WAT framework** (Workflows → Agent → Tools):

1. **Scraper** logs into TrainerRoad via Playwright, paginates the activity history API, and batch-fetches workout zone classification from a separate TR endpoint. Everything lands in a local Excel file.
2. **Analyzer** reads the Excel file and outputs structured JSON — weekly TSS, zone breakdown, streaks, top workouts.
3. **AI agent** (via the `trainerroad-insights` Claude Code skill) interprets the JSON and delivers training insights in plain language.

The separation matters: the scraper and analyzer are deterministic Python scripts that always produce the same output for the same input. The AI only handles reasoning and interpretation, not data collection — which keeps the analysis reliable.

---

## Features

- Authenticates with TrainerRoad via Playwright (handles httpOnly session cookies)
- Paginates the full activity history API — no scroll limits
- Batch-fetches workout zone classification (Sweet Spot, Threshold, VO2 Max, etc.) from the TR workout-information API
- Exports activities to a formatted `.xlsx` file with hyperlinks
- Analyzes training data: weekly TSS, ramp rate, streaks, zone breakdown, and top workouts
- Outputs structured JSON for AI-driven training insights via the `trainerroad-insights` skill

---

## Prerequisites

- Python 3.11+
- Playwright (Chromium)
- A TrainerRoad account

---

## Installation

```bash
pip install playwright openpyxl python-dotenv requests
playwright install chromium
```

---

## Configuration

Create a `.env` file in the project root:

```env
TR_EMAIL=you@example.com
TR_PASSWORD=yourpassword
TR_USERNAME=yourtrainerroadusername
```

Credentials are **never** committed — `.env` is gitignored.

---

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

# Print raw API JSON for first N activities (skips Excel export — useful for debugging)
python3 tools/scrape_trainerroad_activities.py --dump-raw 3

# Intercept all API calls when loading a specific activity page (useful for discovering new endpoints)
python3 tools/scrape_trainerroad_activities.py --dump-workout ACTIVITY_ID
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

---

## Output

### Excel columns

| Column | Description |
|--------|-------------|
| Date | Activity date (YYYY-MM-DD) |
| Name | Workout name |
| Sport | Sport type from TR API |
| Activity Type | Card type classification (Cycling, Running, Other) |
| Workout Category | Training zone: Sweet Spot, Threshold, VO2 Max, Endurance, Tempo, Anaerobic. Empty for unstructured/outdoor rides. |
| Duration (min) | Duration in minutes |
| TSS | Training Stress Score |
| IF | Intensity Factor |
| NP (watts) | Normalized Power |
| kJ | Kilojoules |
| Distance (mi) | Distance in miles |
| Progression Lvl | TrainerRoad progression level |
| Survey | Post-workout RPE survey response |
| External | Whether activity was synced from an external device |
| Device | Recording device name |
| URL | Link to activity on TrainerRoad |

### Workout Category — TR ProgressionId mapping

Zone classification works by calling `/app/api/workout-information?ids=...` (batch endpoint, 50 IDs per request) for all structured TR workouts and mapping the returned `ProgressionId` to a zone name. Outdoor and external activities (Garmin/Wahoo syncs without a TR workout ID) are left blank.

| ProgressionId | Zone |
|---|---|
| 16 | Tempo |
| 33 | Endurance |
| 79 | Anaerobic |
| 83 | Threshold |
| 84 | Sweet Spot |
| 85 | VO2 Max |

### Analysis JSON

```json
{
  "meta": { "total_activities": 3338, "date_range": { "earliest": "...", "latest": "..." } },
  "summary": { "total_tss": 183700, "avg_weekly_tss": 310, "tss_ramp_rate_pct": -2.3, ... },
  "weekly_tss": [...],
  "workout_type_breakdown": {
    "Sweet Spot": { "count": 178, "total_tss": 12728 },
    "Threshold":  { "count": 155, "total_tss": 13310 },
    "VO2 Max":    { "count": 127, "total_tss": 9860  },
    "Endurance":  { "count": 328, "total_tss": 11742 }
  },
  "top_workouts_by_tss": [...],
  "power_trends": {}
}
```

---

## Project Structure

```
.
├── tools/
│   ├── scrape_trainerroad_activities.py   # Main scraper (Playwright + batch API)
│   ├── analyze_workouts.py                # Workout data analysis
│   └── check_trainerroad.py              # Credential & connectivity check
├── workflows/
│   └── scrape_trainerroad_activities.md  # Step-by-step SOP
├── .tmp/                                  # Exported Excel files (gitignored)
├── .env                                   # Credentials (gitignored)
└── CLAUDE.md                              # Agent instructions (WAT framework)
```

---

## Troubleshooting

**Login fails** — Verify `TR_EMAIL`/`TR_PASSWORD` in `.env`. Run with `--no-headless` to see the browser. Note: 2FA is not supported.

**Workout Category empty** — The batch endpoint returns PascalCase keys (`Id`, `ProgressionId`). If the mapping breaks after a TR API update, run `--dump-raw 3` to inspect raw activity fields and `--dump-workout ACTIVITY_ID` to intercept live API calls from the activity page.

**API returns non-200** — Session may have expired. Re-run the scraper; it re-authenticates on each run.

**Empty activity list** — Confirm the username is correct and the account has completed workouts.

**Page selectors broken** — TrainerRoad updates their React app regularly. Run `--no-headless`, inspect the login form, and update selectors in the scraper.

---

## Rate Limiting

- 1 second delay between paginated activity API calls
- 0.5 second delay between workout-information batch requests (50 IDs per batch)
- No known hard limits for normal single-user usage
