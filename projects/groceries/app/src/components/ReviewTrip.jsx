import { useState, useEffect, useRef } from 'react'
import { pb } from '../utils/pb'

const PROXY_URL = window.location.origin

// Used only for same-receipt consolidation (detecting near-identical lines at same unit price)
function fuzzyMatch(a, b) {
  const al = a.toLowerCase().trim()
  const bl = b.toLowerCase().trim()
  if (al.includes(bl) || bl.includes(al)) return true
  const wordsA = al.split(/\s+/).filter(w => w.length >= 4)
  const wordsB = bl.split(/\s+/).filter(w => w.length >= 4)
  return wordsA.some(w => bl.includes(w)) || wordsB.some(w => al.includes(w))
}

// Scored match between a DB record name and a receipt item name.
// Returns 0 = no match, higher = better match.
// Uses Jaccard word-overlap requiring ≥50% to avoid false positives from
// single shared words (e.g. "ground" matching both "Ground Beef" and "Ground Turkey").
function matchScore(a, b) {
  const al = a.toLowerCase().trim()
  const bl = b.toLowerCase().trim()
  if (al === bl) return 100
  if (al.includes(bl) || bl.includes(al)) return 80
  const wordsA = al.split(/\s+/).filter(w => w.length >= 3)
  const wordsB = bl.split(/\s+/).filter(w => w.length >= 3)
  if (wordsA.length === 0 || wordsB.length === 0) return 0
  const setB = new Set(wordsB)
  const matching = wordsA.filter(w => setB.has(w) || bl.includes(w))
  const union = new Set([...wordsA, ...wordsB])
  const jaccard = matching.length / union.size
  return jaccard >= 0.5 ? Math.round(jaccard * 60) : 0
}

function resizeImage(dataUrl, maxPx = 1024, quality = 0.90) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl) // fall back to original on error
    img.src = dataUrl
  })
}

function parseReceiptJson(json) {
  // Costco in-warehouse receipt format (receiptsWithCounts)
  try {
    const receipts = json?.data?.receiptsWithCounts?.receipts
    if (Array.isArray(receipts) && receipts[0]?.itemArray) {
      const receipt = receipts[0]
      const items = receipt.itemArray
        .filter(i => {
          const desc = i.itemDescription01 || ''
          if (desc.startsWith('/') || desc.startsWith('CA REDEMP')) return false
          if ((i.unit ?? 1) < 0) return false
          return true
        })
        .map(i => {
          const unitRaw = i.salesUom || i.unit || ''
          const unit = typeof unitRaw === 'string' ? unitRaw : ''
          const isWeight = unit && unit.toUpperCase() !== 'EA'
          const qty = isWeight ? Number(i.quantity || 1) : 1
          const totalPrice = Number(i.amount || 0)
          const unitPrice = Number(i.itemUnitPriceAmount || 0)
          return {
            name: String(i.itemDescription01 || '').trim(),
            price: totalPrice,
            quantity: qty,
            unit: isWeight ? unit.toLowerCase() : undefined,
            unitPrice: isWeight && unitPrice > 0 ? unitPrice : undefined,
          }
        })
        .filter(i => i.name && i.price > 0)
      if (items.length > 0) return { store: 'Costco', items }
    }
  } catch (_) {}

  // Costco GraphQL orderSummary format
  try {
    const orders =
      json?.data?.orderSummary?.orders ||
      json?.orderSummary?.orders ||
      json?.data?.orders ||
      (Array.isArray(json?.orders) ? json.orders : null)

    if (orders) {
      const items = []
      for (const order of (Array.isArray(orders) ? orders : [orders])) {
        for (const item of (order.orderItems || order.items || [])) {
          const name = item.itemDescription || item.description || item.name || item.productName
          const price = item.unitPrice ?? item.price ?? item.total
          if (name && price != null) items.push({ name: String(name).trim(), price: Number(price) })
        }
      }
      if (items.length > 0) return { store: 'Costco', items }
    }
  } catch (_) {}

  // Generic: top-level items array
  try {
    const raw = json?.items || json?.lineItems || json?.products
    if (Array.isArray(raw)) {
      const items = raw
        .map(i => ({
          name: String(i.name || i.description || i.itemDescription || '').trim(),
          price: Number(i.price || i.unitPrice || i.amount || 0),
        }))
        .filter(i => i.name && i.price > 0)
      if (items.length > 0) return { store: 'Unknown', items }
    }
  } catch (_) {}

  return null
}

function fmt(n) {
  return n > 0 ? `$${Number(n).toFixed(2)}` : '—'
}

function TripGroup({ trip, onSaved }) {
  const [records, setRecords] = useState(trip.records)
  const [prices, setPrices] = useState(() => {
    const init = {}
    trip.records.forEach(r => { init[r.id] = r.unit_price > 0 ? String(r.unit_price) : '' })
    return init
  })
  const [quantities, setQuantities] = useState(() => {
    const init = {}
    trip.records.forEach(r => { init[r.id] = r.quantity > 1 ? String(r.quantity) : '1' })
    return init
  })
  const [units, setUnits] = useState(() => {
    const init = {}
    trip.records.forEach(r => { init[r.id] = r.unit || '' })
    return init
  })
  const [unitPrices, setUnitPrices] = useState(() => {
    const init = {}
    trip.records.forEach(r => { init[r.id] = r.unit_price > 0 ? r.unit_price : 0 })
    return init
  })
  const [matched, setMatched] = useState({})
  const [extras, setExtras] = useState([])
  const [addingExtra, setAddingExtra] = useState({})
  const [deletingId, setDeletingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [tripDate, setTripDate] = useState(trip.date)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const jsonInputRef = useRef()
  const photoInputRef = useRef()

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await pb.collection('purchase_history').delete(id)
      setRecords(prev => prev.filter(r => r.id !== id))
      setPrices(prev => { const n = { ...prev }; delete n[id]; return n })
      setMatched(prev => { const n = { ...prev }; delete n[id]; return n })
      if (records.length === 1) onSaved(0) // last item deleted — close the group
    } catch (err) {
      setError(`Delete failed: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  function applyReceiptItems(receiptItems) {
    // Consolidate only identical-priced duplicates of the same product.
    // Different prices = different brands/variants — keep them separate even if names are similar.
    const consolidated = []
    for (const ri of receiptItems) {
      const perUnit = ri.unitPrice ?? ri.price
      const existing = consolidated.find(c =>
        fuzzyMatch(c.name, ri.name) && Math.abs((c.price / c.qty) - perUnit) < 0.02
      )
      if (existing) {
        existing.price += ri.price
        existing.qty += ri.quantity ?? 1  // was incorrectly += 1
      } else {
        consolidated.push({
          name: ri.name,
          price: ri.price,
          qty: ri.quantity ?? 1,
          unit: ri.unit ?? '',
          unitPrice: ri.unitPrice ?? null,
        })
      }
    }

    // Score every (DB record, receipt item) pair and assign best matches first.
    // This prevents greedy first-match from giving a mediocre match to one record
    // and leaving another record with no match even though it's a perfect fit.
    const scorePairs = []
    for (let ri = 0; ri < consolidated.length; ri++) {
      for (let di = 0; di < records.length; di++) {
        const rec = records[di]
        if (matched[rec.id]) continue  // already matched by prior upload — don't overwrite
        const score = matchScore(rec.name, consolidated[ri].name)
        if (score > 0) scorePairs.push({ ri, di, score })
      }
    }
    scorePairs.sort((a, b) => b.score - a.score)

    const newPrices = { ...prices }
    const newMatched = { ...matched }
    const newQuantities = { ...quantities }
    const newUnitPrices = { ...unitPrices }
    const newUnits = { ...units }
    const usedRi = new Set()
    const usedDi = new Set()

    for (const { ri, di } of scorePairs) {
      if (usedRi.has(ri) || usedDi.has(di)) continue
      const rec = records[di]
      const item = consolidated[ri]
      newPrices[rec.id] = String(item.price.toFixed(2))
      newMatched[rec.id] = true
      if (item.qty !== 1 || item.unit) newQuantities[rec.id] = String(item.qty)
      if (item.unit) newUnits[rec.id] = item.unit
      newUnitPrices[rec.id] = item.unitPrice ?? (item.price / item.qty)
      usedRi.add(ri)
      usedDi.add(di)
    }

    const unmatched = consolidated
      .filter((_, i) => !usedRi.has(i) && consolidated[i].price > 0)
      .map(item => ({ name: item.name, price: item.price, qty: item.qty, unit: item.unit }))

    setPrices(newPrices)
    setMatched(newMatched)
    setQuantities(newQuantities)
    setUnitPrices(newUnitPrices)
    setUnits(newUnits)
    setExtras(unmatched)
  }

  async function addExtra(idx) {
    const extra = extras[idx]
    setAddingExtra(prev => ({ ...prev, [idx]: true }))
    try {
      const qty = extra.qty || 1
      await pb.collection('purchase_history').create({
        name: extra.name,
        quantity: qty,
        unit: extra.unit || '',
        category: 'other',
        unit_price: qty > 1 ? +(extra.price / qty).toFixed(4) : extra.price,
        purchase_date: trip.date,
        store: trip.store,
        verified: true,
        planned: false,
      }, { requestKey: null })
      setExtras(prev => prev.filter((_, i) => i !== idx))
    } catch (err) {
      setError(`Could not add item: ${err.message}`)
    } finally {
      setAddingExtra(prev => { const n = { ...prev }; delete n[idx]; return n })
    }
  }

  async function handleJsonUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const result = parseReceiptJson(json)
      if (!result) { setError('Could not read receipt format. Try photo upload instead.'); return }
      applyReceiptItems(result.items)
    } catch (err) {
      setError(`Invalid JSON: ${err.message}`)
    }
    e.target.value = ''
  }

  function handlePasteJson(text) {
    setError('')
    try {
      const json = JSON.parse(text.trim())
      const result = parseReceiptJson(json)
      if (!result) { setError('Could not read receipt format. Try photo upload instead.'); return }
      applyReceiptItems(result.items)
      setShowPaste(false)
      setPasteText('')
    } catch (err) {
      setError(`Invalid JSON: ${err.message}`)
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    setIsParsing(true)
    try {
      const raw = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const base64 = await resizeImage(raw)
      // Only send this trip's item names — keeps Claude's prompt focused.
      // Sending all historical names (200+) degrades Claude's matching accuracy.
      // Client-side matchScore handles the fuzzy mapping regardless of what Claude names things.
      const knownItems = records.map(r => r.name)

      const res = await fetch(`${PROXY_URL}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, store: trip.store, knownItems }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.items?.length) throw new Error('No items found in receipt')
      applyReceiptItems(data.items)
    } catch (err) {
      setError(`Photo parse failed: ${err.message}`)
    } finally {
      setIsParsing(false)
      e.target.value = ''
    }
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      await Promise.all(records.map(rec => {
        const totalPrice = parseFloat(prices[rec.id]) || 0
        const qty = parseFloat(quantities[rec.id]) || 1
        const unitVal = units[rec.id]?.trim() || ''
        // Always store price-per-unit so insights can compare fairly across different quantities
        const unitPrice = qty > 1 ? +(totalPrice / qty).toFixed(4) : totalPrice
        return pb.collection('purchase_history').update(rec.id, {
          unit_price: unitPrice,
          quantity: qty,
          unit: unitVal,
          purchase_date: tripDate,
          verified: true,
        })
      }))
      onSaved(records.length)
    } catch (err) {
      setError(`Save failed: ${err.message}`)
      setIsSaving(false)
    }
  }

  const matchedCount = Object.values(matched).filter(Boolean).length
  const storeColor = trip.store === 'Costco'
    ? 'bg-blue-900/40 border-blue-700/50 text-blue-400'
    : trip.store === 'Sprouts'
      ? 'bg-green-900/40 border-green-700/50 text-green-400'
      : 'bg-navy-600 border-navy-500 text-navy-200'

  return (
    <div className="bg-navy-700 rounded-2xl border border-navy-500 overflow-hidden mb-4">
      {/* Trip header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-navy-600 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${storeColor}`}>
            {trip.store}
          </span>
          <span className="text-sm font-medium text-white">{trip.date}</span>
          <span className="text-xs text-navy-400">{records.length} items</span>
        </div>
        <span className="text-navy-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-navy-500 px-4 pb-4">
          {/* Receipt upload — scoped to this trip's store */}
          <div className="py-3 border-b border-navy-600 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-navy-400">Fill prices from {trip.store} receipt:</span>
              <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleJsonUpload} />
              <button
                onClick={() => jsonInputRef.current.click()}
                className="flex items-center gap-1 px-3 py-1.5 border border-navy-500 rounded-lg text-xs text-navy-200 hover:bg-navy-600"
              >
                📋 JSON file
              </button>
              <button
                onClick={() => { setShowPaste(p => !p); setPasteText(''); setError('') }}
                className={`flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs transition-colors ${
                  showPaste
                    ? 'bg-navy-600 border-navy-400 text-white'
                    : 'border-navy-500 text-navy-200 hover:bg-navy-600'
                }`}
              >
                📋 Paste JSON
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              <button
                onClick={() => photoInputRef.current.click()}
                disabled={isParsing}
                className="flex items-center gap-1 px-3 py-1.5 border border-navy-500 rounded-lg text-xs text-navy-200 hover:bg-navy-600 disabled:opacity-50"
              >
                📷 {isParsing ? 'Reading…' : 'Photo'}
              </button>
            </div>

            {showPaste && (
              <div className="space-y-2">
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text')
                    setTimeout(() => handlePasteJson(text), 0)
                  }}
                  placeholder="Paste Costco receipt JSON here — auto-parses on paste"
                  rows={4}
                  className="w-full bg-navy-800 border border-navy-500 text-white text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-navy-500 resize-none"
                />
                {pasteText.trim() && (
                  <button
                    onClick={() => handlePasteJson(pasteText)}
                    className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Parse
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-navy-400 w-20 shrink-0">Receipt date</span>
              <input
                type="date"
                value={tripDate}
                onChange={e => setTripDate(e.target.value)}
                className="bg-navy-800 border border-navy-500 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {matchedCount > 0 && (
            <p className="text-xs text-green-400 mb-2">✓ {matchedCount} of {records.length} matched from receipt</p>
          )}
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          {/* Items table */}
          <div className="border border-navy-500 rounded-xl overflow-hidden mb-3">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] text-xs font-semibold text-navy-300 px-3 py-2 border-b border-navy-500 bg-navy-800">
              <span>Item</span>
              <span className="w-12 text-right">Est.</span>
              <span className="w-24 text-center">Total $</span>
              <span className="w-5"></span>
              <span className="w-5"></span>
            </div>
            {records.map(rec => {
              const qty = parseFloat(quantities[rec.id]) || 1
              const unitVal = units[rec.id]?.trim() || ''
              const total = parseFloat(prices[rec.id]) || 0
              const perUnit = qty > 1 && total > 0 ? (total / qty).toFixed(2) : null
              const perUnitLabel = unitVal || 'ea'
              return (
              <div key={rec.id} className="border-b border-navy-600 last:border-0">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-3 py-2.5">
                  <span className="text-sm text-white truncate pr-2">{rec.name}</span>
                  <span className="w-12 text-right text-xs text-navy-400">{fmt(rec.unit_price)}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={prices[rec.id] ?? ''}
                    onChange={e => {
                      const newTotal = e.target.value
                      const q = parseFloat(quantities[rec.id]) || 1
                      setPrices(p => ({ ...p, [rec.id]: newTotal }))
                      setUnitPrices(u => ({ ...u, [rec.id]: (parseFloat(newTotal) || 0) / q }))
                    }}
                    className="w-24 text-right text-sm bg-navy-800 border border-navy-500 text-white rounded-lg px-2 py-1 mx-1 focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0.00"
                  />
                  <span className="w-5 text-center text-green-500 text-xs">{matched[rec.id] ? '✓' : ''}</span>
                  <button
                    onClick={() => handleDelete(rec.id)}
                    disabled={deletingId === rec.id}
                    className="w-5 text-center text-navy-500 hover:text-red-400 disabled:opacity-40 text-lg leading-none transition-colors"
                    title="Delete"
                  >
                    {deletingId === rec.id ? '…' : '×'}
                  </button>
                </div>
                {/* Qty / unit row for produce & bulk — shows per-unit price when filled */}
                <div className="flex items-center gap-2 px-3 pb-2.5">
                  <span className="text-xs text-navy-400 w-16 shrink-0">Qty / unit</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={quantities[rec.id] ?? '1'}
                    onChange={e => {
                      const newQty = e.target.value
                      setQuantities(q => ({ ...q, [rec.id]: newQty }))
                      const up = unitPrices[rec.id]
                      if (up > 0) {
                        const newTotal = (up * (parseFloat(newQty) || 1)).toFixed(2)
                        setPrices(p => ({ ...p, [rec.id]: newTotal }))
                      }
                    }}
                    className="w-16 text-right text-xs bg-navy-800 border border-navy-500 text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                    placeholder="1"
                  />
                  <input
                    type="text"
                    value={units[rec.id] ?? ''}
                    onChange={e => setUnits(u => ({ ...u, [rec.id]: e.target.value }))}
                    className="w-14 text-xs bg-navy-800 border border-navy-500 text-white placeholder-navy-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                    placeholder="lb / oz"
                  />
                  {perUnit && (
                    <span className="text-xs text-green-400 font-medium">${perUnit}/{perUnitLabel}</span>
                  )}
                </div>
              </div>
              )
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {isSaving ? 'Saving…' : `Confirm ${records.length} items`}
          </button>

          {/* Extra receipt items not on the shopping list */}
          {extras.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-navy-300 mb-2">
                Also on this receipt — not on your list ({extras.length})
              </p>
              <div className="border border-dashed border-navy-500 rounded-xl overflow-hidden">
                {extras.map((ex, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b border-navy-600 last:border-0">
                    <div className="flex-1 min-w-0 pr-3">
                      <span className="text-sm text-navy-200 truncate block">{ex.name}</span>
                      <span className="text-xs text-navy-400">{fmt(ex.price)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => addExtra(i)}
                        disabled={addingExtra[i]}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-green-900/40 hover:bg-green-900/60 text-green-400 font-bold text-lg leading-none disabled:opacity-40 transition-colors"
                        title="Add to price history"
                      >
                        {addingExtra[i] ? '…' : '+'}
                      </button>
                      <button
                        onClick={() => setExtras(prev => prev.filter((_, j) => j !== i))}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-navy-600 text-navy-500 hover:text-navy-200 text-lg leading-none transition-colors"
                        title="Dismiss"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function groupByDateStore(recs) {
  const groups = {}
  recs.forEach(r => {
    const key = `${r.purchase_date}||${r.store || 'Unknown'}`
    if (!groups[key]) groups[key] = { date: r.purchase_date, store: r.store || 'Unknown', records: [] }
    groups[key].records.push(r)
  })
  return Object.values(groups).sort((a, b) =>
    b.date.localeCompare(a.date) || a.store.localeCompare(b.store)
  )
}

function PastTripCard({ trip, onReopen }) {
  const [isReopening, setIsReopening] = useState(false)

  const total = trip.records.reduce((s, r) => s + (r.unit_price || 0) * (r.quantity || 1), 0)
  const preview = trip.records.slice(0, 4).map(r => r.name).join(' · ')
  const overflow = trip.records.length > 4 ? ` +${trip.records.length - 4}` : ''

  const isCostco  = trip.store === 'Costco'
  const isSprouts = trip.store === 'Sprouts'
  const accentBorder = isCostco ? 'border-l-blue-600' : isSprouts ? 'border-l-green-600' : 'border-l-navy-500'
  const badgeColor   = isCostco
    ? 'bg-blue-900/50 text-blue-300'
    : isSprouts
      ? 'bg-green-900/50 text-green-300'
      : 'bg-navy-600 text-navy-200'

  const dateLabel = new Date(trip.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  async function handleReopen() {
    setIsReopening(true)
    try {
      await Promise.all(trip.records.map(r =>
        pb.collection('purchase_history').update(r.id, { verified: false })
      ))
      onReopen()
    } catch (err) {
      console.error('Reopen failed', err)
      setIsReopening(false)
    }
  }

  return (
    <div className={`bg-navy-700 border border-navy-600 border-l-4 ${accentBorder} rounded-xl mb-2 px-4 py-3 flex items-start gap-3`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeColor}`}>{trip.store}</span>
          <span className="text-sm font-semibold text-white">{dateLabel}</span>
          <span className="text-xs text-navy-400">{trip.records.length} items</span>
          <span className="ml-auto text-sm font-semibold text-green-400">${total.toFixed(2)}</span>
        </div>
        <p className="text-xs text-navy-500 truncate">{preview}{overflow}</p>
      </div>
      <button
        onClick={handleReopen}
        disabled={isReopening}
        className="text-xs text-navy-500 active:text-amber-400 disabled:opacity-40 transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-end"
      >
        {isReopening ? '…' : 'Re-open'}
      </button>
    </div>
  )
}

const CATEGORY_MAP = {
  produce: ['apple', 'banana', 'onion', 'tomato', 'mango', 'papaya', 'pepper', 'cilantro', 'lettuce', 'romaine', 'mushroom', 'avocado', 'lime', 'lemon', 'grape', 'berry', 'pear', 'orange', 'pineapple', 'tomatillo', 'sprout', 'celery', 'carrot', 'broccoli', 'brussels'],
  dairy:   ['egg', 'milk', 'yogurt', 'cheese', 'butter', 'cream', 'kefir', 'cottage'],
  meat:    ['chicken', 'beef', 'turkey', 'ham', 'pork', 'salmon', 'tuna', 'steak', 'tempeh', 'sausage', 'frank', 'corned', 'sirloin', 'drumstick', 'ground'],
  frozen:  ['pizza', 'frozen', 'ice cream', 'dumpling', 'wonton', 'ramen', 'blueberr'],
  pantry:  ['pasta', 'sauce', 'oil', 'oat', 'bread', 'cracker', 'chip', 'pretzel', 'coffee', 'tea', 'chocolate', 'salt', 'pepper', 'spice', 'seasoning', 'bean', 'rice', 'cereal', 'granola', 'flaxseed', 'pretzel'],
}
function guessCategory(name) {
  const lower = name.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => lower.includes(k))) return cat
  }
  return 'other'
}

function NewReceiptForm({ onSaved }) {
  const [store, setStore] = useState('Sprouts')
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [items, setItems] = useState([])
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const photoRef = useRef()
  const jsonRef = useRef()

  async function handlePhoto(e) {
    const file = e.target.files[0]
    if (!file) return
    setError(''); setIsParsing(true)
    try {
      const raw = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
      })
      const base64 = await resizeImage(raw)
      const res = await fetch(`${PROXY_URL}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, store, knownItems: [] }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.items?.length) throw new Error('No items found')
      if (data.date) setDate(data.date)
      setItems(data.items.map((it, i) => ({
        id: i,
        name: it.name,
        price: it.price ?? 0,               // total charged for this line
        unitPrice: it.unitPrice ?? null,    // per-unit (lb/oz) price when weighted
        qty: it.quantity ?? 1,
        unit: it.unit ?? '',
        category: guessCategory(it.name),
      })))
    } catch (err) {
      setError(`Photo parse failed: ${err.message}`)
    } finally {
      setIsParsing(false); e.target.value = ''
    }
  }

  async function handleJson(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    try {
      parseJsonText(await file.text())
    } catch (err) {
      setError(`Invalid JSON: ${err.message}`)
    }
    e.target.value = ''
  }

  function parseJsonText(text) {
    const json = JSON.parse(text.trim())
    const result = parseReceiptJson(json)
    if (!result) { setError('Unrecognized receipt format'); return }
    if (result.store && (result.store === 'Costco' || result.store === 'Sprouts')) setStore(result.store)
    if (result.date) setDate(result.date)
    setItems(result.items.map((it, i) => ({
      id: i,
      name: it.name,
      price: it.price ?? 0,
      unitPrice: it.unitPrice ?? null,
      qty: it.quantity || 1,
      unit: it.unit || '',
      category: guessCategory(it.name),
    })))
    setShowPaste(false)
    setPasteText('')
  }

  function updateItem(id, field, val) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: val } : it))
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      await Promise.all(items.map(it => {
        const qty = parseFloat(it.qty) || 1
        const totalPrice = parseFloat(it.price) || 0
        const unitPrice = it.unitPrice != null
          ? it.unitPrice
          : qty > 1 ? +(totalPrice / qty).toFixed(4) : totalPrice
        return pb.collection('purchase_history').create({
          name: it.name,
          quantity: qty,
          unit: it.unit || '',
          category: it.category,
          unit_price: unitPrice,
          purchase_date: date,
          store,
          verified: true,
          planned: true,
        }, { requestKey: null })
      }))
      onSaved()
    } catch (err) {
      setError(`Save failed: ${err.message}`)
      setIsSaving(false)
    }
  }

  const STORES = ['Sprouts', 'Costco']
  const STORE_STYLES = {
    Sprouts: { active: 'bg-green-600 text-white', badge: 'bg-green-900/40 text-green-400' },
    Costco:  { active: 'bg-blue-600 text-white',  badge: 'bg-blue-900/40 text-blue-400'  },
  }

  return (
    <div className="bg-navy-700 border border-navy-500 rounded-2xl p-4 mb-6">
      <h3 className="text-sm font-semibold text-white mb-4">Add Receipt</h3>

      {/* Store */}
      <div className="flex rounded-lg overflow-hidden border border-navy-500 mb-3">
        {STORES.map(s => (
          <button key={s} type="button" onClick={() => setStore(s)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${store === s ? STORE_STYLES[s].active : 'bg-navy-800 text-navy-300'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Date — always visible and editable; auto-filled from receipt when photo is parsed */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-navy-400 w-20 shrink-0">Receipt date</span>
        <input
          type="date" value={date} onChange={e => setDate(e.target.value)}
          className="bg-navy-800 border border-navy-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <span className="text-xs text-navy-500">auto-detected · tap to edit</span>
      </div>

      {/* Upload buttons */}
      <div className="flex gap-2 mb-3">
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
        <button onClick={() => photoRef.current.click()} disabled={isParsing}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 border border-navy-500 rounded-xl text-sm text-navy-200 hover:bg-navy-600 active:bg-navy-600 disabled:opacity-50 transition-colors">
          📷 {isParsing ? 'Reading…' : 'Photo'}
        </button>
        <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={handleJson} />
        <button onClick={() => jsonRef.current.click()} disabled={isParsing}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 border border-navy-500 rounded-xl text-sm text-navy-200 hover:bg-navy-600 active:bg-navy-600 disabled:opacity-50 transition-colors">
          📋 JSON file
        </button>
        <button
          onClick={() => { setShowPaste(p => !p); setPasteText(''); setError('') }}
          disabled={isParsing}
          className={`flex-1 min-h-[44px] flex items-center justify-center gap-2 border rounded-xl text-sm transition-colors disabled:opacity-50 ${
            showPaste ? 'bg-navy-600 border-navy-400 text-white' : 'border-navy-500 text-navy-200 hover:bg-navy-600 active:bg-navy-600'
          }`}>
          📋 Paste
        </button>
      </div>

      {showPaste && (
        <div className="space-y-2 mb-3">
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            onPaste={e => {
              const text = e.clipboardData.getData('text')
              setTimeout(() => {
                try { parseJsonText(text) } catch (err) { setError(`Invalid JSON: ${err.message}`) }
              }, 0)
            }}
            placeholder="Paste Costco receipt JSON here — auto-parses on paste"
            rows={4}
            className="w-full bg-navy-800 border border-navy-500 text-white text-xs font-mono rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-navy-500 resize-none"
          />
          {pasteText.trim() && (
            <button
              onClick={() => { try { parseJsonText(pasteText) } catch (err) { setError(`Invalid JSON: ${err.message}`) } }}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Parse
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {/* Parsed items */}
      {items.length > 0 && (
        <>
          <div className="border border-navy-500 rounded-xl overflow-hidden mb-3">
            <div className="grid grid-cols-[1fr_80px_32px] text-xs font-semibold text-navy-300 px-3 py-2 bg-navy-800 border-b border-navy-500">
              <span>Item</span><span className="text-right">Total $</span><span />
            </div>
            {items.map(it => {
              const isWeighted = it.qty !== 1 || (it.unit && it.unit !== '')
              const perUnit = it.unitPrice ?? (it.qty > 1 ? (parseFloat(it.price) / it.qty) : null)
              const unitLabel = it.unit || 'ea'
              return (
              <div key={it.id} className="border-b border-navy-600 last:border-0">
                <div className="grid grid-cols-[1fr_80px_32px] items-center px-3 pt-2.5 pb-1">
                  <input value={it.name} onChange={e => updateItem(it.id, 'name', e.target.value)}
                    className="bg-transparent text-sm text-white focus:outline-none w-full pr-2 truncate" />
                  <input type="number" value={it.price} onChange={e => updateItem(it.id, 'price', e.target.value)}
                    className="w-full text-right text-sm bg-navy-800 border border-navy-500 text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500" />
                  <button onClick={() => setItems(prev => prev.filter(i => i.id !== it.id))}
                    className="w-8 h-8 flex items-center justify-center text-navy-500 hover:text-red-400 text-lg transition-colors">×</button>
                </div>
                {isWeighted && (
                  <div className="flex items-center gap-2 px-3 pb-2.5">
                    <span className="text-xs text-navy-400 w-16 shrink-0">Qty / unit</span>
                    <input type="number" min="0.01" step="0.01" value={it.qty}
                      onChange={e => updateItem(it.id, 'qty', parseFloat(e.target.value) || 1)}
                      className="w-16 text-right text-xs bg-navy-800 border border-navy-500 text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500" />
                    <input type="text" value={it.unit}
                      onChange={e => updateItem(it.id, 'unit', e.target.value)}
                      className="w-14 text-xs bg-navy-800 border border-navy-500 text-white placeholder-navy-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                      placeholder="lb / oz" />
                    {perUnit != null && (
                      <span className="text-xs text-green-400 font-medium">${perUnit.toFixed(2)}/{unitLabel}</span>
                    )}
                  </div>
                )}
              </div>
              )
            })}
          </div>
          <button onClick={handleSave} disabled={isSaving}
            className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 active:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
            {isSaving ? 'Saving…' : `Save ${items.length} items`}
          </button>
        </>
      )}
    </div>
  )
}

export default function ReviewTrip({ onSaved }) {
  const [trips, setTrips] = useState([])
  const [pastTrips, setPastTrips] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddReceipt, setShowAddReceipt] = useState(false)
  const [error, setError] = useState('')

  function fetchUnverified() {
    return pb.collection('purchase_history')
      .getFullList({ filter: 'verified = false', sort: '-purchase_date', requestKey: null })
      .then(recs => { setTrips(groupByDateStore(recs)); return recs })
  }

  function fetchVerified() {
    return pb.collection('purchase_history')
      .getFullList({ filter: 'verified = true', sort: '-purchase_date', requestKey: null })
      .then(recs => setPastTrips(groupByDateStore(recs)))
  }

  useEffect(() => {
    Promise.all([fetchUnverified(), fetchVerified()])
      .catch(err => setError(`Failed to load: ${err.message}`))
      .finally(() => setIsLoading(false))
  }, [])

  function handleTripSaved() {
    fetchUnverified()
      .then(recs => { if (recs.length === 0) onSaved() })
      .catch(() => {})
    fetchVerified().catch(() => {})
  }

  function handleReopen() {
    fetchUnverified().catch(() => {})
    fetchVerified().catch(() => {})
  }

  const totalItems = trips.reduce((s, t) => s + t.records.length, 0)

  return (
    <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-white">Purchase History</h2>
          <button
            onClick={() => setShowAddReceipt(p => !p)}
            className="text-sm text-green-400 font-medium active:text-green-300 transition-colors"
          >
            {showAddReceipt ? 'Cancel' : '+ Add Receipt'}
          </button>
        </div>

        {totalItems > 0 && (
          <p className="text-sm text-navy-300 mb-6">
            {trips.length} trip{trips.length !== 1 ? 's' : ''} · {totalItems} items need price confirmation
          </p>
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {showAddReceipt && (
          <NewReceiptForm onSaved={() => {
            setShowAddReceipt(false)
            fetchVerified().catch(() => {})
          }} />
        )}

        {isLoading ? (
          <div className="text-center text-navy-300 py-16">Loading…</div>
        ) : (
          <>
            {trips.length === 0 ? (
              <div className="text-center text-navy-300 py-10">All trips confirmed — you're caught up.</div>
            ) : (
              trips.map(trip => (
                <TripGroup
                  key={`${trip.date}||${trip.store}`}
                  trip={trip}
                  onSaved={handleTripSaved}
                />
              ))
            )}

            {pastTrips.length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-semibold text-navy-400 uppercase tracking-widest mb-4">
                  Purchase History
                </p>
                {(() => {
                  const byMonth = {}
                  pastTrips.forEach(trip => {
                    const [y, m] = trip.date.split('-')
                    const key = `${y}-${m}`
                    if (!byMonth[key]) {
                      byMonth[key] = {
                        label: new Date(`${y}-${m}-15`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                        trips: [],
                      }
                    }
                    byMonth[key].trips.push(trip)
                  })
                  return Object.entries(byMonth)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([key, { label, trips }]) => (
                      <div key={key} className="mb-6">
                        <p className="text-xs font-semibold text-navy-500 mb-2 px-1">{label}</p>
                        {trips.map(trip => (
                          <PastTripCard
                            key={`past-${trip.date}||${trip.store}`}
                            trip={trip}
                            onReopen={handleReopen}
                          />
                        ))}
                      </div>
                    ))
                })()}
              </div>
            )}
          </>
        )}

    </div>
  )
}
