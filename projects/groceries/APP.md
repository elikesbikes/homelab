# Grocery Forecast App - Build Plan

## Project Overview
A real-time, web-based shared grocery list with AI-powered spending forecasts powered by Claude API. Designed for three household members (TARS, wife, son) to collaboratively add items and get live spending estimates before weekend shopping.

---

## Requirements & Specifications

### Core Features
✅ **Shared Grocery List**
- Real-time item additions (no page refresh needed)
- Three users can add items simultaneously
- Items display immediately across all browsers/devices
- Mobile-friendly UI (works on iPhone, iPad, laptop)

✅ **Live AI Spending Forecast**
- One-click forecast button triggers Claude API
- Returns: Total estimated spending + cost-saving tips
- Updates instantly as items are added/removed
- No backend server required (client-side API calls)

✅ **Item Management**
- Add new items with quantity/optional notes
- Mark items as "bought" (checkbox)
- Delete items
- Categories auto-tagged (produce, dairy, meat, frozen, pantry, etc.)

✅ **Cost-Saving Tips**
- Claude provides budget-friendly suggestions
- Example: "You're at $85 for 7 items. Buy store brand pasta (-$2), frozen vegetables (-$3)"

✅ **History Tracking**
- Store past week's lists (browser localStorage)
- Compare current forecast to last week
- Optional: View historical patterns

### Non-Requirements (Out of Scope)
❌ Copilot.money integration (closed API, skip for now)
❌ User authentication/logins (simple shared URL)
❌ Automatic actual spending sync (you manually compare in Copilot)

---

## Tech Stack

### Frontend
- **React** (Functional components, hooks)
- **Tailwind CSS** (Responsive design, clean UI)
- **localStorage** (Persist lists across sessions)
- **Real-time state updates** (no polling needed)

### AI/API
- **Anthropic Claude API** (Sonnet 4, $0.003/1K input tokens)
- **Direct client-side calls** (no backend auth needed if using Claude API key)

### Hosting
- **Vercel** or **GitHub Pages** (static deployment, free)
- Or run locally on your homelab (Portainer/Docker)

---

## Architecture

### File Structure
```
grocery-forecast-app/
├── index.html
├── src/
│   ├── components/
│   │   ├── GroceryList.jsx       (Add/remove items, display list)
│   │   ├── ForecastPanel.jsx     (Show forecast results)
│   │   └── HistoryPanel.jsx      (Past week comparison)
│   ├── utils/
│   │   ├── api.js                (Claude API calls)
│   │   ├── storage.js            (localStorage helpers)
│   │   └── prompts.js            (System/user prompts for Claude)
│   ├── styles/
│   │   └── globals.css           (Tailwind config)
│   └── App.jsx                   (Main component)
├── package.json
└── README.md
```

### Data Model

**Item Object**
```javascript
{
  id: "uuid",
  name: "Chicken Breast",
  quantity: 2,
  unit: "lbs",
  category: "meat",
  notes: "preferably organic",
  addedBy: "TARS",
  addedAt: "2026-05-21T14:30:00Z",
  isBought: false
}
```

**Forecast Object**
```javascript
{
  totalEstimate: 87.50,
  categoryBreakdown: {
    produce: 22,
    dairy: 15,
    meat: 35,
    frozen: 10,
    pantry: 5.50
  },
  tips: [
    "Buy store brand milk instead of name brand (-$2)",
    "Frozen broccoli cheaper than fresh (-$3)"
  ],
  confidence: 0.92,
  generatedAt: "2026-05-21T14:35:00Z"
}
```

**Historical Record**
```javascript
{
  week: "2026-05-18", // Monday date
  items: [item, item, ...],
  forecast: { ...forecastObject },
  actualSpent: 82.34, // Manually logged from Copilot
  savedAmount: 5.16
}
```

---

## Claude API Integration

### Prompt Strategy
**System Prompt:**
```
You are a grocery budget assistant. Analyze a list of grocery items and:
1. Estimate the total spending (consider regional prices, store brand vs name brand)
2. Break down costs by category (produce, dairy, meat, frozen, pantry, etc.)
3. Provide 2-3 specific cost-saving tips

Be realistic with prices. Use your knowledge of typical US grocery pricing (San Diego area if relevant).

Output format (JSON):
{
  "totalEstimate": number,
  "categoryBreakdown": { category: price, ... },
  "tips": [string, string, ...],
  "confidence": number (0-1)
}
```

**User Prompt (Dynamic):**
```
Here's my grocery list for this week:
- 2 lbs Chicken Breast
- 1 Gallon Milk
- 6 Eggs
- 1 lb Broccoli
[... full list ...]

Estimate total cost and give 2 money-saving tips.
```

### API Call Flow
1. User clicks "Get Forecast"
2. Gather all items from state
3. Format item list as text
4. Call Claude API (Sonnet 4, max_tokens: 500)
5. Parse JSON response
6. Display forecast in ForecastPanel
7. Store result in localStorage for history

### Error Handling
- API key missing → show error banner, link to get API key
- API rate limit → show retry button + backoff message
- Invalid JSON response → fallback to generic message
- Network error → show "Try again" button

---

## UI Layout (Wireframe)

```
┌─────────────────────────────────────────────────────────┐
│  🛒 Grocery Forecast                    [Your List Sync] │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  📝 Add Item                                              │
│  ┌──────────────────────────────────────┐                │
│  │ Item: [Chicken Breast            ]   │                │
│  │ Qty:  [2        ] Unit: [lbs     ]   │                │
│  │ Notes: [optional field...]           │                │
│  │                      [Add Item]      │                │
│  └──────────────────────────────────────┘                │
│                                                           │
│  📋 Your List (7 items)                                   │
│  ☐ 2 lbs Chicken Breast        (meat)                    │
│  ☐ 1 gal Milk                  (dairy)                   │
│  ☐ 6 Eggs                      (dairy)                   │
│  ☐ 1 lb Broccoli               (produce)                 │
│  [more items...]                                         │
│                                                           │
│  [💰 Get Forecast]  [📊 History]                          │
│                                                           │
├─────────────────────────────────────────────────────────┤
│  💰 Forecast Results                                      │
│  ──────────────────────────────────────────              │
│  Total Estimate: $87.50                                  │
│                                                           │
│  By Category:                                            │
│  • Produce: $22.00                                       │
│  • Dairy: $15.00                                         │
│  • Meat: $35.00                                          │
│  • Frozen: $10.00                                        │
│  • Pantry: $5.50                                         │
│                                                           │
│  💡 Save Money:                                          │
│  ✓ Buy store brand milk instead of name brand (-$2)     │
│  ✓ Frozen broccoli cheaper than fresh (-$3)             │
│  ✓ Buy eggs on sale this week (-$1.50)                  │
│                                                           │
│  Generated: 2026-05-21 14:35 UTC                         │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Steps (Phase 1 - MVP)

### Step 1: Project Setup
- [ ] Create React app (`create-react-app` or Vite)
- [ ] Install dependencies: React, Tailwind, UUID
- [ ] Setup folder structure
- [ ] Create `.env.local` with `REACT_APP_CLAUDE_API_KEY`

### Step 2: Build Core Components
- [ ] `GroceryList.jsx` — Add/display/remove items
- [ ] `ForecastPanel.jsx` — Show forecast results
- [ ] `App.jsx` — State management (items array, forecast state)

### Step 3: localStorage Integration
- [ ] Save items to localStorage on every change
- [ ] Load items from localStorage on app start
- [ ] Add "Clear List" button (confirm dialog)
- [ ] Add "Save to History" after forecast

### Step 4: Claude API Integration
- [ ] Create `api.js` utility function
- [ ] Call Anthropic `/v1/messages` endpoint
- [ ] Parse forecast JSON response
- [ ] Handle errors (missing key, rate limit, invalid JSON)
- [ ] Add loading state during API call

### Step 5: History Feature
- [ ] Store past forecasts (max 4 weeks)
- [ ] Display "Last Week's Forecast" for comparison
- [ ] Show trend (↑ up, ↓ down, → same)

### Step 6: Polish & Deploy
- [ ] Responsive design (mobile-first)
- [ ] Add loading spinners
- [ ] Test on iPhone Safari
- [ ] Deploy to Vercel or GitHub Pages
- [ ] Share URL with wife and son

---

## Environment Variables

```env
# .env.local (do NOT commit)
REACT_APP_CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxx
REACT_APP_CLAUDE_MODEL=claude-sonnet-4-20250514
```

**Get API Key:**
1. Go to https://console.anthropic.com/
2. Create account (free $5 credit)
3. Generate API key
4. Add to `.env.local`

---

## Testing Checklist

- [ ] Add item without quantity (should default to 1)
- [ ] Add item, refresh page, verify it persists
- [ ] Get forecast with empty list (should show error)
- [ ] Get forecast with 5 items (should return estimate in <3 seconds)
- [ ] Mark item as "bought" (visual feedback, doesn't delete)
- [ ] Delete item (can undo? or confirm?)
- [ ] Load history from last week (compare forecast)
- [ ] Test on iPhone Safari (no console errors)
- [ ] Test with API key missing (friendly error message)

---

## Future Enhancements (Phase 2)

- [ ] **User identification** — Name shows when you add item ("Added by TARS")
- [ ] **Shared sync** — WebSocket for real-time updates (remove need to refresh)
- [ ] **Actual spending tracker** — Manually log what you spent, compare forecast vs actual
- [ ] **Budget alerts** — "You're $10 over budget, remove one item?"
- [ ] **Store picker** — "Forecast for Trader Joe's vs Costco" (different price models)
- [ ] **Recipe suggestions** — "Based on your list, here are 3 meals you can make"
- [ ] **Grocery store integration** — Pull real prices from API (Kroger, Safeway, etc.)

---

## Notes for Claude Code

1. **API Calls:** Use `fetch()` directly to Anthropic API (no SDK needed for browser)
2. **State Management:** React hooks (`useState`) are sufficient; no Redux needed
3. **Styling:** Use Tailwind utility classes (already responsive)
4. **localStorage:** Built-in browser API, works everywhere
5. **Error Handling:** Show user-friendly messages, log to console for debugging

---

## Questions/Assumptions

- **Budget target:** No fixed target, let forecast float (user decides if under/over)
- **Item categories:** Auto-detect from item name (e.g., "milk" → dairy, "chicken" → meat)
- **Regional pricing:** Assume San Diego area for default estimates
- **Sharing method:** Everyone bookmarks same URL (no login needed)
- **Weekly reset:** Manually clear list and start fresh each week

---

## Contact/Support

- **API issues:** Check Anthropic docs: https://docs.anthropic.com/
- **React help:** React docs: https://react.dev/
- **Deploy help:** Vercel docs: https://vercel.com/docs/

---

**Ready to build?** Clone/fork the repo and start with Step 1 in Claude Code! 🚀
