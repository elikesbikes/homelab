import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ai-ollama-prod-1:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2'
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'llava:7b'
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const SPROUTS_STORE_ID = process.env.SPROUTS_STORE_ID || '1216'

app.use(cors())
const parseJson = express.json({ limit: '20mb' })

function fuzzyMatch(itemName, historyName) {
  const a = itemName.toLowerCase().trim()
  const b = historyName.toLowerCase().trim()
  if (b.includes(a) || a.includes(b)) return true
  // Check significant words from both strings — handles abbreviated vs full names
  const wordsA = a.split(/\s+/).filter(w => w.length >= 4)
  const wordsB = b.split(/\s+/).filter(w => w.length >= 4)
  return wordsA.some(w => b.includes(w)) || wordsB.some(w => a.includes(w))
}

function expandCostcoAbbreviations(name) {
  return name
    // "K S" or "KS" at start or as a word → Kirkland Signature
    .replace(/\bK\s+S\b/gi, 'Kirkland Signature')
    .replace(/\bKS\b/gi, 'Kirkland Signature')
    .replace(/\bKRKLD\b/gi, 'Kirkland')
    // Common product word abbreviations
    .replace(/\bSPRK\b/gi, 'Sparkling')
    .replace(/\bPSARK\b/gi, 'Sparkling')
    .replace(/\bWTR\b/gi, 'Water')
    .replace(/\bWAT\b/gi, 'Water')
    .replace(/\bORG\b/gi, 'Organic')
    .replace(/\bOG\b/gi, 'Organic')
    .replace(/\bBLBRRS?\b/gi, 'Blueberries')
    .replace(/\bSTRWBRRS?\b/gi, 'Strawberries')
    .replace(/\bRASPBRRS?\b/gi, 'Raspberries')
    .replace(/\bCHKN\b/gi, 'Chicken')
    .replace(/\bSLMN\b/gi, 'Salmon')
    .replace(/\bGRND\b/gi, 'Ground')
    .replace(/\bBF\b/gi, 'Beef')
    .replace(/\bTRKY\b/gi, 'Turkey')
    .replace(/\bAVCD\b/gi, 'Avocado')
    .replace(/\bBROC\b/gi, 'Broccoli')
    .replace(/\bSPNCH\b/gi, 'Spinach')
    .replace(/\bYGRT\b/gi, 'Yogurt')
    // Bulk / grain abbreviations
    .replace(/\bSC\b/gi, 'Steel Cut')
    .replace(/\bSTL\s*CT\b/gi, 'Steel Cut')
    .replace(/\bWHL\b/gi, 'Whole')
    .replace(/\bWHT\b/gi, 'Wheat')
    .replace(/\bBRN\b/gi, 'Brown')
    .replace(/\bQK\b/gi, 'Quick')
    .replace(/\bRLD\b/gi, 'Rolled')
    .replace(/\bBTR\b/gi, 'Butter')
    .replace(/\bCHS\b/gi, 'Cheese')
    .replace(/\bMLK\b/gi, 'Milk')
    .replace(/\bEGS?\b/gi, 'Eggs')
    // Clean up extra spaces from replacements
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function searchSproutsAll(itemName, { waitFor = 8000, proxy = 'stealth' } = {}) {
  if (!FIRECRAWL_API_KEY) return []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), waitFor + 10000)
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url: `https://shop.sprouts.com/search?query=${encodeURIComponent(itemName)}&store_id=${SPROUTS_STORE_ID}`,
        formats: ['json'],
        jsonOptions: {
          prompt: `Extract the top 8 products from these search results. The user searched for "${itemName}" — prioritize products whose names most closely match those exact words. For example, if the search is "liquid eggs", prefer carton/liquid egg products over shell eggs. Return each product's exact name, price, and unit/size as shown on the page.`,
          schema: {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    price: { type: 'number' },
                    unit: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        waitFor,
        proxy,
      }),
    })
    if (!response.ok) return []
    const data = await response.json()
    return (data.data?.json?.products || []).filter(p => p.price > 0)
  } catch (err) {
    console.error(`{"level":"error","msg":"Sprouts search failed","item":${JSON.stringify(itemName)},"error":${JSON.stringify(err.message)}}`)
    return []
  } finally {
    clearTimeout(timeout)
  }
}

async function searchCostcoAll(itemName, { waitFor = 12000 } = {}) {
  if (!FIRECRAWL_API_KEY) return []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), waitFor + 20000)
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url: `https://www.costco.com/s?keyword=${encodeURIComponent(itemName)}`,
        formats: ['json'],
        jsonOptions: {
          prompt: `Extract the top 8 products from these search results. The user searched for "${itemName}" — prioritize products whose names most closely match those exact words. Prefer Kirkland Signature brand when available. Return each product's exact name, price, and unit/size as shown on the page.`,
          schema: {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    price: { type: 'number' },
                    unit: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        waitFor,
        // No proxy param — Firecrawl stealth tunnels are blocked by Costco's CDN
      }),
    })
    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      console.error(`{"level":"error","msg":"Costco Firecrawl HTTP error","status":${response.status},"body":${JSON.stringify(errBody.slice(0, 200))}}`)
      return []
    }
    const data = await response.json()
    const products = (data.data?.json?.products || []).filter(p => p.price > 0)
    console.log(`{"level":"info","msg":"Costco raw results","item":${JSON.stringify(itemName)},"count":${products.length}}`)
    return products
  } catch (err) {
    console.error(`{"level":"error","msg":"Costco search failed","item":${JSON.stringify(itemName)},"error":${JSON.stringify(err.message)}}`)
    return []
  } finally {
    clearTimeout(timeout)
  }
}

async function searchStore(storeName, itemName) {
  const products = storeName === 'Costco'
    ? await searchCostcoAll(itemName)
    : await searchSproutsAll(itemName)
  if (!products.length) return null
  const best = products.find(p => fuzzyMatch(itemName, p.name)) || products[0]
  const unitSuffix = best.unit ? ` (${best.unit})` : ''
  return {
    name: itemName,
    storeProduct: `${best.name}${unitSuffix}`,
    price: best.price,
    store: storeName,
    source: storeName === 'Costco' ? 'costco_web' : 'sprouts_web',
  }
}

async function searchSprouts(itemName) {
  return searchStore('Sprouts', itemName)
}

function queryMatchScore(query, productName) {
  // Words >= 3 chars from the query that must appear in the product name (handles plural/singular)
  const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
  const pLower = productName.toLowerCase()
  return qWords.filter(w =>
    pLower.includes(w) ||
    (w.endsWith('s') && pLower.includes(w.slice(0, -1))) ||
    (!w.endsWith('s') && pLower.includes(w + 's'))
  ).length
}

async function searchProductsFiltered(q, store) {
  const products = store === 'Costco'
    ? await searchCostcoAll(q, { waitFor: 12000, proxy: 'stealth' })
    : await searchSproutsAll(q, { waitFor: 5000, proxy: 'stealth' })
  if (!products.length) return []

  const qWords = q.split(/\s+/).filter(w => w.length >= 3)
  const scored = products
    .map(p => ({ ...p, _score: queryMatchScore(q, p.name) }))
    .sort((a, b) => b._score - a._score)

  const maxScore = qWords.length
  let filtered = scored.filter(p => p._score === maxScore)
  // Only relax to all-but-one for 3+ word queries — for 1-2 word queries every word must match
  if (filtered.length < 2 && qWords.length >= 3) {
    filtered = scored.filter(p => p._score >= maxScore - 1)
  }
  // If still nothing matches all required words, return empty so caller falls back to Claude
  if (filtered.length === 0) return []

  return filtered.map(p => ({
    storeProduct: p.unit ? `${p.name} (${p.unit})` : p.name,
    price: p.price,
  }))
}

app.get('/api/search-products', async (req, res) => {
  const { q, store } = req.query
  if (!q) return res.status(400).json({ error: 'Missing q param' })
  const targetStore = store || 'Sprouts'

  // Try Firecrawl first
  if (FIRECRAWL_API_KEY) {
    const results = await searchProductsFiltered(q, targetStore)
    if (results.length) return res.json({ results })
    console.log(`{"level":"warn","msg":"Firecrawl returned no results, falling back to Claude","store":${JSON.stringify(targetStore)},"q":${JSON.stringify(q)}}`)
  }

  // Fallback: ask Ollama for a price estimate when Firecrawl fails
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: 'system', content: 'You are a grocery price assistant. Return ONLY valid JSON with no markdown, no explanation, no trailing text.' },
          { role: 'user', content: `List 3 products matching "${q}" sold at ${targetStore} in San Diego. Prefer Kirkland Signature at Costco. Respond with ONLY this JSON and nothing else:\n{"results":[{"storeProduct":"name","price":0.00},{"storeProduct":"name","price":0.00},{"storeProduct":"name","price":0.00}]}` },
        ],
      }),
    })
    if (!response.ok) throw new Error(`Ollama ${response.status}`)
    const data = await response.json()
    const rawText = data.message?.content || ''
    let parsed
    try { parsed = JSON.parse(rawText) } catch {
      const m = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (m) parsed = JSON.parse(m[1])
    }
    const results = (parsed?.results || []).filter(r => r.price > 0)
    if (!results.length) return res.status(404).json({ error: 'No results found' })
    console.log(`{"level":"info","msg":"Ollama fallback search","store":${JSON.stringify(targetStore)},"q":${JSON.stringify(q)},"count":${results.length}}`)
    return res.json({ results, source: 'ollama' })
  } catch (err) {
    console.error(`{"level":"error","msg":"Ollama fallback search failed","error":${JSON.stringify(err.message)}}`)
    return res.status(404).json({ error: 'No results found' })
  }
})

// Keep old endpoint as alias
app.get('/api/search-sprouts', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'Missing q param' })
  if (!FIRECRAWL_API_KEY) return res.status(503).json({ error: 'Firecrawl not configured' })
  const results = await searchProductsFiltered(q, 'Sprouts')
  if (!results.length) return res.status(404).json({ error: 'No results found' })
  res.json({ results })
})

app.post('/api/forecast', parseJson, async (req, res) => {
  const { items, history } = req.body

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items provided' })
  }

  // Sort history by date descending so most recent price wins on ties
  const sortedHistory = (history || [])
    .filter(h => h.unit_price > 0)
    .sort((a, b) => (b.purchase_date || '').localeCompare(a.purchase_date || ''))

  function findMatch(itemName, preferredStore) {
    if (preferredStore) {
      // Only match within the preferred store — cross-store prices are not useful
      return sortedHistory.find(h => h.store === preferredStore && fuzzyMatch(itemName, h.name)) || null
    }
    return sortedHistory.find(h => fuzzyMatch(itemName, h.name)) || null
  }

  const matched = []
  const unmatched = []

  for (const item of items) {
    const hit = findMatch(item.name, item.preferred_store)
    if (hit) {
      matched.push({
        name: item.name,
        storeProduct: hit.name,
        price: hit.unit_price,
        store: hit.store || 'Costco',
      })
    } else {
      unmatched.push(item)
    }
  }

  // Unmatched items: try Firecrawl for Sprouts and Costco before falling back to Claude
  const sproutsUnmatched = unmatched.filter(i => i.preferred_store === 'Sprouts')
  const costcoUnmatched = unmatched.filter(i => i.preferred_store === 'Costco')
  const otherUnmatched = unmatched.filter(i => i.preferred_store !== 'Sprouts' && i.preferred_store !== 'Costco')

  let webScraped = []
  const fallbackToClaude = [...otherUnmatched]

  if (FIRECRAWL_API_KEY) {
    const [sproutsResults, costcoResults] = await Promise.all([
      Promise.all(sproutsUnmatched.map(item => searchStore('Sprouts', item.name))),
      Promise.all(costcoUnmatched.map(item => searchStore('Costco', item.name))),
    ])
    sproutsResults.forEach((result, i) => {
      if (result) {
        webScraped.push(result)
        console.log(`{"level":"info","msg":"Sprouts scraped","item":${JSON.stringify(sproutsUnmatched[i].name)},"price":${result.price}}`)
      } else {
        fallbackToClaude.push(sproutsUnmatched[i])
      }
    })
    costcoResults.forEach((result, i) => {
      if (result) {
        webScraped.push(result)
        console.log(`{"level":"info","msg":"Costco scraped","item":${JSON.stringify(costcoUnmatched[i].name)},"price":${result.price}}`)
      } else {
        fallbackToClaude.push(costcoUnmatched[i])
      }
    })
  } else {
    fallbackToClaude.push(...sproutsUnmatched, ...costcoUnmatched)
  }

  const unmatched_for_claude = fallbackToClaude

  let claudeItems = []
  let tips = []

  if (unmatched_for_claude.length > 0) {
    const itemList = unmatched_for_claude
      .map(i => {
        const base = `- ${i.quantity || 1}${i.unit ? ' ' + i.unit : ''} ${i.name}`.trim()
        return i.preferred_store ? `${base} [buy at: ${i.preferred_store}]` : base
      })
      .join('\n')

    const systemPrompt = `You are a grocery budget assistant for a family in San Diego.
Estimate the price for each item at the store specified in [buy at: ...].
If no store is specified, pick the most likely local store (Costco, Sprouts, Trader Joe's, Vons, etc.).
When the store is Costco, prefer Kirkland Signature brand if available.
IMPORTANT: Use the exact store specified in [buy at: ...] — do not substitute a different store.
Respond ONLY with valid JSON — no markdown, no extra text:
{
  "items": [
    { "name": "item name from list", "storeProduct": "exact product name as sold in that store", "price": number, "store": "store name" }
  ],
  "tips": ["tip1", "tip2"]
}`

    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Estimate prices for:\n${itemList}` },
          ],
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`{"level":"error","msg":"Ollama API error","status":${response.status},"body":${JSON.stringify(errText)}}`)
      } else {
        const data = await response.json()
        const rawText = data.message?.content || ''
        let parsed
        try {
          parsed = JSON.parse(rawText)
        } catch {
          const m = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
          if (m) parsed = JSON.parse(m[1])
        }
        if (parsed) {
          claudeItems = parsed.items || []
          tips = parsed.tips || []
        }
      }
    } catch (err) {
      console.error(`{"level":"error","msg":"Ollama call failed","error":${JSON.stringify(err.message)}}`)
    }
  }

  const allItems = [...matched, ...webScraped, ...claudeItems]

  function itemQty(name) {
    return (items.find(i => i.name === name)?.quantity) || 1
  }

  const totalEstimate = allItems.reduce((sum, i) => sum + (i.price || 0) * itemQty(i.name), 0)

  // Compute category breakdown from item categories passed in the request
  const categoryBreakdown = { produce: 0, dairy: 0, meat: 0, frozen: 0, pantry: 0, other: 0 }
  for (const item of items) {
    const result = allItems.find(r => r.name === item.name)
    if (result?.price) {
      const cat = item.category || 'other'
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + result.price * (item.quantity || 1)
    }
  }

  const fromWeb = webScraped.length
  console.log(`{"level":"info","msg":"Forecast generated","total":${totalEstimate.toFixed(2)},"fromHistory":${matched.length},"fromWeb":${fromWeb},"fromOllama":${claudeItems.length}}`)

  res.json({
    totalEstimate,
    items: allItems,
    categoryBreakdown,
    tips,
    confidence: allItems.length > 0 ? matched.length / allItems.length : 0,
    generatedAt: new Date().toISOString(),
  })
})

app.post('/api/parse-receipt', parseJson, async (req, res) => {
  const { image } = req.body
  if (!image) return res.status(400).json({ error: 'No image provided' })

  const { knownItems, store } = req.body

  const match = image.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return res.status(400).json({ error: 'Invalid image format' })

  const mediaType = match[1]
  const base64Data = match[2]
  console.log(`{"level":"info","msg":"parse-receipt called","mediaType":${JSON.stringify(mediaType)},"imageBytes":${Math.round(base64Data.length * 0.75)},"store":${JSON.stringify(store || 'none')}}`)

  const storeHints = {
    Costco: `Store abbreviation guide for Costco receipts:
- KS or KRKLD = Kirkland Signature (e.g. "KS SPRK WAT" = "Kirkland Signature Sparkling Water")
- PSARK or SPRK = Sparkling
- WAT or WTR = Water
- OG or ORG = Organic
- Do NOT expand KS as "Kansas" — KS always means Kirkland Signature on Costco receipts`,
    Sprouts: `Store abbreviation guide for Sprouts receipts:
- OG or ORG = Organic
- Product names may be truncated — expand to full names`,
  }

  const storeContext = store
    ? `\nThis is a ${store} receipt. ${storeHints[store] || ''}`
    : ''

  const knownSection = knownItems?.length
    ? `\n\nExact item names already in our database — when a receipt item matches one of these, use that EXACT name (same capitalization and wording):\n${knownItems.map(n => `- ${n}`).join('\n')}`
    : ''

  const promptText = `Extract the purchase date and EVERY SINGLE line item from this grocery receipt. Do not stop early — list all items you can see, from top to bottom.${storeContext}
Expand abbreviated or truncated product names into full readable names using the store guide above.
When a receipt item matches one of the known database names listed below, use that EXACT name.
For items not in the list, expand to a clean full product name.
Skip non-product lines like tax, subtotal, total, membership fees, and discounts.

For ANY item where a weight, count, or size is visible — whether printed on the receipt line OR embedded in the product name/description (e.g. "Limes 3 lb bag", "Chicken Wings 2.45 lb", "Oats 10 lb") — extract:
- quantity: the numeric amount (e.g. 3 for "3 lb bag", 2.45 for "2.45 lb")
- unit: the unit of measure (e.g. "lb", "oz", "kg", "ct")
- unitPrice: price ÷ quantity (compute it if not explicitly printed)
- name: the CLEAN product name with the weight/size removed (e.g. "Limes" not "Limes 3 lb bag")
The "price" field is ALWAYS the total paid for that line.

Examples:
- "Limes 3 lb bag  $3.99" → name="Limes", price=3.99, quantity=3, unit="lb", unitPrice=1.33
- "Organic Chicken Wings 2.45 lb @ $2.99/lb  $7.33" → name="Organic Chicken Wings", price=7.33, quantity=2.45, unit="lb", unitPrice=2.99
- "Steel Cut Oats 10 lb  $12.99" → name="Steel Cut Oats", price=12.99, quantity=10, unit="lb", unitPrice=1.30
- "Kirkland Sparkling Water 35-ct  $9.99" → name="Kirkland Sparkling Water", price=9.99, quantity=35, unit="ct", unitPrice=0.29
- "Greek Yogurt  $7.49" → name="Greek Yogurt", price=7.49 (no weight shown — omit quantity/unit/unitPrice)

For fixed-price packaged items with no visible weight or count, omit quantity, unit, and unitPrice.${knownSection}
Respond ONLY with valid JSON, no markdown:
{"date": "YYYY-MM-DD", "items": [{"name": "product name", "price": 4.72, "quantity": 2.37, "unit": "lb", "unitPrice": 1.99}]}
If no date is visible, omit the date field.`

  try {
    const controller = new AbortController()
    const ollamaTimeout = setTimeout(() => controller.abort(), 180000) // 3 min for large images
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        stream: false,
        format: 'json',
        prompt: promptText,
        images: [base64Data],
        options: { num_predict: 4096 },
      }),
    })
    clearTimeout(ollamaTimeout)

    if (!response.ok) {
      const errText = await response.text()
      console.error(`{"level":"error","msg":"parse-receipt Ollama error","status":${response.status},"body":${JSON.stringify(errText)}}`)
      return res.status(500).json({ error: `Ollama error ${response.status}` })
    }

    const data = await response.json()
    const rawText = data.response || ''
    console.log(`{"level":"info","msg":"Ollama vision raw response","text":${JSON.stringify(rawText.slice(0, 300))}}`)
    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch {
      const m = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (m) try { parsed = JSON.parse(m[1]) } catch {}
    }

    if (!parsed?.items) {
      console.error(`{"level":"error","msg":"No items in Ollama response","parsed":${JSON.stringify(parsed)}}`)
      return res.status(500).json({ error: 'Could not extract receipt items' })
    }

    // Post-process: expand known abbreviations that Claude may have missed
    if (store === 'Costco') {
      parsed.items = parsed.items.map(item => ({
        ...item,
        name: expandCostcoAbbreviations(item.name),
      }))
    }

    console.log(`{"level":"info","msg":"Receipt parsed","items":${parsed.items.length}}`)
    res.json(parsed)
  } catch (err) {
    const isTimeout = err.name === 'AbortError'
    console.error(`{"level":"error","msg":"parse-receipt failed","error":${JSON.stringify(err.message)},"timeout":${isTimeout}}`)
    res.status(503).json({ error: isTimeout ? 'Ollama timed out — try a smaller or clearer photo' : 'Failed to reach Ollama' })
  }
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Serve built frontend from ./public (populated by multi-stage Dockerfile)
app.use(express.static(join(__dirname, 'public')))

// Forward /api/* and /_/* to PocketBase — our own /api/* routes above take precedence.
// Using pathFilter so Express does not strip the prefix before forwarding.
const PB_INTERNAL = process.env.PB_INTERNAL_URL || 'http://grocery-pb:8090'
const pbProxy = createProxyMiddleware({
  target: PB_INTERNAL,
  changeOrigin: true,
  pathFilter: (pathname) => pathname.startsWith('/_') || pathname.startsWith('/api/'),
  on: {
    proxyRes: (proxyRes) => {
      if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
        proxyRes.headers['x-accel-buffering'] = 'no'
      }
    },
  },
})
app.use(pbProxy)

// SPA fallback — serve index.html for all remaining routes (React Router)
app.use((_req, res) => res.sendFile(join(__dirname, 'public', 'index.html')))

app.listen(PORT, () => {
  console.log(`{"level":"info","msg":"Grocery proxy listening","port":${PORT},"pb_internal":${JSON.stringify(PB_INTERNAL)}}`)
})
