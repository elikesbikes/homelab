# Workflow: Scrape TrainerRoad Activities

## Objective
Scrape all completed workout activities from a TrainerRoad public profile page and export them to a formatted Excel file for analysis and tracking.

## Inputs Required
- `TR_EMAIL` — TrainerRoad account email (stored in `.env`)
- `TR_PASSWORD` — TrainerRoad account password (stored in `.env`)
- `TR_USERNAME` — TrainerRoad username to scrape (default: `elikesbikes`, set in `.env` or via `--username` flag)

## Authentication
TrainerRoad requires a logged-in session to access activity data — even for your own public profile. The scraper handles this automatically using Playwright:
1. Launches a headless Chromium browser
2. Logs in with TR_EMAIL / TR_PASSWORD from `.env`
3. Transfers auth cookies to a `requests` session for fast API calls
4. Falls back to DOM scraping if the API approach doesn't work

**Credentials are stored ONLY in `.env`. Never commit `.env` to version control.**

## Step-by-Step Execution

### 1. Pre-flight check
```bash
python3 tools/check_trainerroad.py
```
Verifies credentials are set and the site is reachable. Fix any reported issues before proceeding.

### 2. Run the scraper
```bash
python3 tools/scrape_trainerroad_activities.py
```
Or with options:
```bash
# Custom username
python3 tools/scrape_trainerroad_activities.py --username elikesbikes

# Debug mode (show browser window)
python3 tools/scrape_trainerroad_activities.py --no-headless

# Custom output path
python3 tools/scrape_trainerroad_activities.py --output .tmp/my_activities.xlsx

# Inspect raw API fields for first N activities (skips Excel export — useful for debugging)
python3 tools/scrape_trainerroad_activities.py --dump-raw 3
```

Output is saved to `.tmp/trainerroad_activities_YYYYMMDD_HHMM.xlsx`.

### 3. Verify output
```bash
ls -lh .tmp/trainerroad_activities_*.xlsx
```
Open the file and confirm it has multiple rows of activity data with the expected columns.

## Expected Output Columns
| Column | Description |
|---|---|
| Date | Activity completion date (YYYY-MM-DD) |
| Name | Workout name |
| Sport | Raw Sport field from TR API (Training, Cycling, Running, etc.) |
| Activity Type | Card type from `$type` API field (Cycling, Running, Other) |
| Workout Category | Training zone classification — Sweet Spot, VO2 Max, Threshold, Endurance, etc. Populated from `WorkoutType` integer field on the TR API. Empty for unstructured/outdoor rides. |
| Duration (min) | Duration in minutes |
| TSS | Training Stress Score |
| IF | Intensity Factor |
| NP (watts) | Normalized Power |
| kJ | Kilojoules burned |
| Distance (mi) | Distance in miles |
| Progression Lvl | TR progression level for the workout |
| Survey | Post-workout RPE survey response |
| External | True if synced from external device (Garmin, Wahoo, etc.) |
| Device | Recording device name |
| URL | Link to activity on TrainerRoad |

### Workout Category values (from TR `WorkoutType` integer)
| Integer | Label |
|---|---|
| 1 | Endurance |
| 2 | Sweet Spot |
| 3 | Threshold |
| 4 | VO2 Max |
| 5 | Anaerobic |
| 6 | Sprint |
| 7 | Recovery |
| 8 | Tempo |
| 9 | Over-Under |
| 10 | Race |

> **Note**: If all Workout Category values are empty after a fresh scrape, use `--dump-raw 3` to inspect the raw API response and identify the actual field name. Update `WORKOUT_TYPE_MAP` and `parse_activity()` in `tools/scrape_trainerroad_activities.py` accordingly.

## Known Edge Cases

### Login fails
- Verify TR_EMAIL and TR_PASSWORD are correct in `.env`
- Check if TrainerRoad requires 2FA (not currently supported — disable it or use a session cookie approach)
- Run with `--no-headless` to see the browser window and debug

### API returns 401 after login
- The scraper will automatically fall back to DOM scraping
- DOM scraping uses scroll-to-load, which captures activities as they appear on the page
- May be slower and capture fewer historical activities if the page limits scroll depth

### Empty activity list
- Confirm the username is correct
- Verify the account has completed workouts
- Try running with `--no-headless` to see what the page shows

### Page structure changes
TrainerRoad updates their React app regularly. If the scraper breaks:
1. Run with `--no-headless` to inspect what the page looks like
2. Check if the login form selectors changed (look for `email_sel` and `password_sel` in the script)
3. Check if the API endpoint `/api/activities/{username}/activities` still returns data
4. Update selectors or endpoint accordingly and re-run

## Rate Limiting
- Scraper waits 2 seconds between paginated API calls
- Playwright scroll pauses 1.5 seconds between scroll events
- No known rate limits on TrainerRoad's activities API for normal usage

## File Locations
- **Tool**: `tools/scrape_trainerroad_activities.py`
- **Health check**: `tools/check_trainerroad.py`
- **Credentials**: `.env` (gitignored)
- **Output**: `.tmp/trainerroad_activities_YYYYMMDD_HHMM.xlsx`
