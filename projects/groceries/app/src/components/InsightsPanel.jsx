import { useState, useEffect, useMemo } from 'react'
import { pb } from '../utils/pb'

function fmt(n) {
  return `$${Number(n).toFixed(2)}`
}

// --- Bar chart (horizontal) ---
function BarChart({ data, colorClass = 'bg-blue-500' }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 0.01)
  return (
    <div className="space-y-2">
      {data.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs text-navy-300 w-16 text-right shrink-0">{label}</span>
          <div className="flex-1 h-5 bg-navy-600 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${colorClass} transition-all`}
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-white w-14 shrink-0">{fmt(value)}</span>
        </div>
      ))}
    </div>
  )
}

// --- Sparkline SVG ---
function Sparkline({ points, width = 200, height = 48 }) {
  if (points.length < 2) {
    return (
      <svg width={width} height={height}>
        <circle cx={width / 2} cy={height / 2} r={3} fill="#6b7280" />
      </svg>
    )
  }
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 4
  const scaleX = maxX === minX ? x => width / 2 : x => pad + ((x - minX) / (maxX - minX)) * (width - 2 * pad)
  const scaleY = maxY === minY ? y => height / 2 : y => height - pad - ((y - minY) / (maxY - minY)) * (height - 2 * pad)

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x).toFixed(1)} ${scaleY(p.y).toFixed(1)}`).join(' ')

  return (
    <svg width={width} height={height}>
      <path d={d} fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={scaleX(p.x)} cy={scaleY(p.y)} r={3} fill="#16a34a" />
      ))}
    </svg>
  )
}

function monthKey(dateStr) {
  return dateStr?.slice(0, 7) || ''
}

function displayMonth(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`
}

export default function InsightsPanel() {
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNames, setSelectedNames] = useState(new Set())

  useEffect(() => {
    pb.collection('purchase_history')
      .getFullList({ sort: '-purchase_date', requestKey: null })
      .then(recs => setHistory(recs.filter(r => r.unit_price > 0)))
      .catch(err => setError(`Failed to load: ${err.message}`))
      .finally(() => setIsLoading(false))
  }, [])

  // Monthly spend — past 6 months (unit_price × quantity = actual total spent)
  const monthlySpend = useMemo(() => {
    const totals = {}
    history.forEach(r => {
      const k = monthKey(r.purchase_date)
      if (k) totals[k] = (totals[k] || 0) + r.unit_price * (r.quantity || 1)
    })
    return Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([k, v]) => ({ label: displayMonth(k), value: v }))
  }, [history])

  // Store breakdown
  const storeBreakdown = useMemo(() => {
    const totals = {}
    history.forEach(r => {
      const s = r.store || 'Unknown'
      totals[s] = (totals[s] || 0) + r.unit_price * (r.quantity || 1)
    })
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value]) => ({ label, value }))
  }, [history])

  // Fuzzy search results — unique item names matching the query
  const searchResults = useMemo(() => {
    const q = searchQuery.trim()
    if (q.length < 2) return []
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length >= 2)
    const seen = new Set()
    history.forEach(r => {
      const name = r.name.toLowerCase()
      if (words.every(w => name.includes(w))) seen.add(r.name)
    })
    return [...seen].sort()
  }, [history, searchQuery])

  // Price comparison data for selected item names.
  // Always uses unit_price (price-per-unit as stored in DB, e.g. $/lb for produce).
  // Total spent per trip = unit_price × quantity.
  const compareData = useMemo(() => {
    if (selectedNames.size === 0) return null
    const records = history
      .filter(r => selectedNames.has(r.name))
      .sort((a, b) => (a.purchase_date || '').localeCompare(b.purchase_date || ''))
    const costco = records.filter(r => r.store === 'Costco')
    const sprouts = records.filter(r => r.store === 'Sprouts')
    function storeStats(recs) {
      if (recs.length === 0) return null
      const last = recs[recs.length - 1]
      // Use the most common unit across all purchases for this store
      const unitCounts = {}
      recs.forEach(r => { const u = r.unit || ''; unitCounts[u] = (unitCounts[u] || 0) + 1 })
      const unit = Object.entries(unitCounts).sort(([,a],[,b]) => b - a)[0]?.[0] || ''
      return { last: last.unit_price, lastDate: last.purchase_date, count: recs.length, unit }
    }
    return {
      costco: storeStats(costco),
      sprouts: storeStats(sprouts),
      timeline: records.map((r, i) => ({
        x: i, y: r.unit_price, date: r.purchase_date,
        store: r.store, name: r.name, unit: r.unit || '',
      })),
    }
  }, [history, selectedNames])

  function toggleName(name) {
    setSelectedNames(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const totals = {}
    history.forEach(r => {
      const c = r.category || 'other'
      totals[c] = (totals[c] || 0) + r.unit_price * (r.quantity || 1)
    })
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value]) => ({ label, value }))
  }, [history])

  const totalSpend = useMemo(() => history.reduce((s, r) => s + r.unit_price * (r.quantity || 1), 0), [history])
  const tripCount = useMemo(() => {
    const dates = new Set(history.map(r => r.purchase_date))
    return dates.size
  }, [history])

  // Planned vs unplanned — only records that have explicit planned field set
  const plannedStats = useMemo(() => {
    const tracked = history.filter(r => r.planned != null)
    if (tracked.length === 0) return null
    const cost = r => r.unit_price * (r.quantity || 1)
    const plannedSpend = tracked.filter(r => r.planned).reduce((s, r) => s + cost(r), 0)
    const unplannedSpend = tracked.filter(r => !r.planned).reduce((s, r) => s + cost(r), 0)
    const unplannedItems = tracked
      .filter(r => !r.planned)
      .reduce((acc, r) => {
        acc[r.name] = (acc[r.name] || 0) + cost(r)
        return acc
      }, {})
    const topUnplanned = Object.entries(unplannedItems)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }))
    return { plannedSpend, unplannedSpend, topUnplanned, total: plannedSpend + unplannedSpend }
  }, [history])

  if (isLoading) {
    return <div className="text-center text-navy-300 py-16 text-sm">Loading history…</div>
  }

  if (error) {
    return <div className="text-center text-red-400 py-16 text-sm">{error}</div>
  }

  if (history.length === 0) {
    return (
      <div className="text-center text-navy-300 py-16 text-sm">
        No purchase history yet. Complete a shopping trip to see insights.
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-navy-700 rounded-2xl border border-navy-500 p-4 text-center">
          <div className="text-xl font-bold text-white">{fmt(totalSpend)}</div>
          <div className="text-xs text-navy-300 mt-1">Total tracked</div>
        </div>
        <div className="bg-navy-700 rounded-2xl border border-navy-500 p-4 text-center">
          <div className="text-xl font-bold text-white">{history.length}</div>
          <div className="text-xs text-navy-300 mt-1">Items recorded</div>
        </div>
        <div className="bg-navy-700 rounded-2xl border border-navy-500 p-4 text-center">
          <div className="text-xl font-bold text-white">{tripCount}</div>
          <div className="text-xs text-navy-300 mt-1">Shopping days</div>
        </div>
      </div>

      {/* Monthly spend */}
      {monthlySpend.length > 0 && (
        <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5">
          <h3 className="font-semibold text-white mb-4">Monthly Spend</h3>
          <BarChart data={monthlySpend} colorClass="bg-green-500" />
        </div>
      )}

      {/* By store */}
      {storeBreakdown.length > 0 && (
        <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5">
          <h3 className="font-semibold text-white mb-4">By Store</h3>
          <BarChart
            data={storeBreakdown}
            colorClass="bg-blue-500"
          />
        </div>
      )}

      {/* By category */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5">
          <h3 className="font-semibold text-white mb-4">By Category</h3>
          <BarChart data={categoryBreakdown} colorClass="bg-amber-400" />
        </div>
      )}

      {/* Planned vs Unplanned */}
      {plannedStats && (
        <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5">
          <h3 className="font-semibold text-white mb-4">Planned vs Unplanned</h3>
          <div className="flex gap-3 mb-4">
            <div className="flex-1 bg-navy-800 rounded-xl p-3 text-center border border-navy-500">
              <div className="text-lg font-bold text-green-400">{fmt(plannedStats.plannedSpend)}</div>
              <div className="text-xs text-navy-300 mt-1">Planned</div>
            </div>
            <div className="flex-1 bg-navy-800 rounded-xl p-3 text-center border border-navy-500">
              <div className="text-lg font-bold text-amber-400">{fmt(plannedStats.unplannedSpend)}</div>
              <div className="text-xs text-navy-300 mt-1">Unplanned</div>
            </div>
            <div className="flex-1 bg-navy-800 rounded-xl p-3 text-center border border-navy-500">
              <div className="text-lg font-bold text-white">
                {plannedStats.total > 0 ? Math.round((plannedStats.unplannedSpend / plannedStats.total) * 100) : 0}%
              </div>
              <div className="text-xs text-navy-300 mt-1">Impulse rate</div>
            </div>
          </div>
          {plannedStats.topUnplanned.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-2">Top Unplanned Items</h4>
              <BarChart data={plannedStats.topUnplanned} colorClass="bg-amber-500" />
            </>
          )}
        </div>
      )}

      {/* Price compare */}
      <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5">
        <h3 className="font-semibold text-white mb-3">Price Compare</h3>
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setSelectedNames(new Set()) }}
          placeholder="Search item (e.g. bananas, chicken, eggs)…"
          className="w-full bg-navy-800 border border-navy-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-3"
        />

        {/* Matching name chips */}
        {searchResults.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {searchResults.map(name => (
              <button
                key={name}
                onClick={() => toggleName(name)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedNames.has(name)
                    ? 'bg-green-600 border-green-500 text-white'
                    : 'bg-navy-800 border-navy-500 text-navy-300 hover:text-white hover:border-navy-400'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
          <p className="text-sm text-navy-400 text-center py-2 mb-3">No items found in history.</p>
        )}

        {/* Store comparison cards */}
        {compareData && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Costco */}
              <div className={`rounded-xl p-4 border ${compareData.costco ? 'bg-blue-900/30 border-blue-700/50' : 'bg-navy-800 border-navy-600 opacity-50'}`}>
                <div className="text-xs font-semibold text-blue-400 mb-2">Costco</div>
                {compareData.costco ? (
                  <>
                    <div className="text-2xl font-bold text-white">{fmt(compareData.costco.last)}</div>
                    <div className="text-xs text-navy-300 mt-1">
                      per {compareData.costco.unit || 'item'}
                    </div>
                    <div className="mt-2 space-y-0.5">
                      <div className="text-xs text-navy-400">{compareData.costco.lastDate} · {compareData.costco.count} purchase{compareData.costco.count !== 1 ? 's' : ''}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-navy-400 mt-2">Not purchased</div>
                )}
              </div>

              {/* Sprouts */}
              <div className={`rounded-xl p-4 border ${compareData.sprouts ? 'bg-green-900/30 border-green-700/50' : 'bg-navy-800 border-navy-600 opacity-50'}`}>
                <div className="text-xs font-semibold text-green-400 mb-2">Sprouts</div>
                {compareData.sprouts ? (
                  <>
                    <div className="text-2xl font-bold text-white">{fmt(compareData.sprouts.last)}</div>
                    <div className="text-xs text-navy-300 mt-1">
                      per {compareData.sprouts.unit || 'item'}
                    </div>
                    <div className="mt-2 space-y-0.5">
                      <div className="text-xs text-navy-400">{compareData.sprouts.lastDate} · {compareData.sprouts.count} purchase{compareData.sprouts.count !== 1 ? 's' : ''}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-navy-400 mt-2">Not purchased</div>
                )}
              </div>
            </div>

            {/* Better deal callout */}
            {compareData.costco && compareData.sprouts && (() => {
              const diff = Math.abs(compareData.costco.last - compareData.sprouts.last)
              const cheaper = compareData.costco.last < compareData.sprouts.last ? 'Costco' : 'Sprouts'
              const colorClass = cheaper === 'Costco' ? 'text-blue-400' : 'text-green-400'
              return (
                <div className={`text-center text-sm font-semibold mb-4 ${colorClass}`}>
                  {cheaper} is cheaper by {fmt(diff)}
                </div>
              )
            })()}

            {/* Price timeline */}
            {compareData.timeline.length > 0 && (
              <>
                <div className="overflow-x-auto mb-3">
                  <Sparkline
                    points={compareData.timeline}
                    width={Math.max(200, compareData.timeline.length * 56)}
                    height={64}
                  />
                </div>
                <div className="space-y-1">
                  {compareData.timeline.map((p, i) => (
                    <div key={i} className="flex justify-between items-center text-xs">
                      <span className="text-navy-400">{p.date}</span>
                      <span className={`font-medium px-2 py-0.5 rounded ${p.store === 'Costco' ? 'text-blue-400' : 'text-green-400'}`}>{p.store}</span>
                      <span className="text-navy-300 flex-1 text-center truncate px-1">{p.name}</span>
                      <span className="font-semibold text-white">{fmt(p.y)}{p.unit ? `/${p.unit}` : ''}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {searchQuery.trim().length < 2 && selectedNames.size === 0 && (
          <p className="text-xs text-navy-400 text-center py-2">Type at least 2 characters to search your purchase history.</p>
        )}
      </div>

    </div>
  )
}
