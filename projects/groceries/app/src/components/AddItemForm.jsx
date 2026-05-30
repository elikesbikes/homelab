import { useState, useEffect, useRef } from 'react'
import { pb } from '../utils/pb'

const PROXY_URL = window.location.origin
const STORES = ['Costco', 'Sprouts']

const STORE_STYLES = {
  Costco:  { active: 'bg-blue-600 text-white',  badge: 'bg-blue-900/40 text-blue-400'  },
  Sprouts: { active: 'bg-green-600 text-white', badge: 'bg-green-900/40 text-green-400' },
}

export default function AddItemForm({ onAdd }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [selectedStore, setSelectedStore] = useState('Costco')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [allHistory, setAllHistory] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchingStore, setSearchingStore] = useState('')
  const isSearchingRef = useRef(false)
  const [selectedResult, setSelectedResult] = useState(null) // { storeProduct, price } from live search

  useEffect(() => {
    pb.collection('purchase_history').getFullList({ fields: 'name,store,unit_price,quantity,purchase_date', sort: '-purchase_date', requestKey: null })
      .then(records => {
        const seen = new Set()
        const unique = records
          .filter(r => { const k = `${r.name}|${r.store}`; if (seen.has(k)) return false; seen.add(k); return true })
          .sort((a, b) => a.name.localeCompare(b.name))
        setAllHistory(unique)
      })
      .catch(() => {})
  }, [])

  function handleNameChange(val) {
    let store = selectedStore
    let clean = val

    // s: or s<space> prefix → switch to Sprouts
    if (/^s[: ]/.test(val)) {
      store = 'Sprouts'
      clean = val.slice(2).trimStart()
      setSelectedStore('Sprouts')
    // c: or c<space> prefix → switch to Costco
    } else if (/^c[: ]/.test(val)) {
      store = 'Costco'
      clean = val.slice(2).trimStart()
      setSelectedStore('Costco')
    }

    setName(clean)

    if (clean.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const lower = clean.toLowerCase()

    const storeMatches = allHistory
      .filter(h => h.store === store && h.name.toLowerCase().includes(lower))
      .slice(0, 3)
      .map(h => ({ name: h.name, store: h.store, price: h.unit_price, quantity: h.quantity, isHistory: true }))

    const otherMatches = allHistory
      .filter(h => h.store !== store && h.name.toLowerCase().includes(lower))
      .slice(0, 2)
      .map(h => ({ name: h.name, store: h.store, price: h.unit_price, quantity: h.quantity, isHistory: true }))

    // Always offer live store search at the top
    const searchOption = { name: clean, store, isSearch: true }
    const all = [searchOption, ...storeMatches, ...otherMatches]
    setSuggestions(all)
    setShowSuggestions(true)
  }

  async function selectSuggestion(s) {
    if (s.isSearch) {
      isSearchingRef.current = true
      setIsSearching(true)
      setSearchingStore(s.store)
      setShowSuggestions(true)
      const searchAbort = new AbortController()
      const searchTimeout = setTimeout(() => searchAbort.abort(), 40000)
      try {
        const res = await fetch(`${PROXY_URL}/api/search-products?q=${encodeURIComponent(s.name)}&store=${encodeURIComponent(s.store)}`, { signal: searchAbort.signal })
        if (res.ok) {
          const { results } = await res.json()
          setSuggestions(results.map(r => ({ name: r.storeProduct, store: s.store, price: r.price, isResult: true })))
        } else {
          setSuggestions([{ name: s.name, store: s.store, isNotFound: true }])
        }
        setShowSuggestions(true)
      } catch {
        setSuggestions([{ name: s.name, store: s.store, isNotFound: true }])
        setShowSuggestions(true)
      } finally {
        clearTimeout(searchTimeout)
        isSearchingRef.current = false
        setIsSearching(false)
      }
      return
    }
    setName(s.name)
    setSelectedStore(s.store)
    if (s.isHistory && s.quantity) setQuantity(String(s.quantity))
    if (s.isResult || s.isHistory) {
      setSelectedResult({ storeProduct: s.name, price: s.price || null })
    } else {
      setSelectedResult(null)
    }
    setSuggestions([])
    setShowSuggestions(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return

    // If results are visible but user clicked Add without tapping one, auto-pick the first result
    let effectiveResult = selectedResult
    let effectiveName = name.trim()
    if (!effectiveResult) {
      const firstResult = suggestions.find(s => s.isResult)
      if (firstResult) {
        effectiveResult = { storeProduct: firstResult.name, price: firstResult.price }
        effectiveName = firstResult.name
      }
    }

    setIsSubmitting(true)
    setSubmitError('')
    try {
      await onAdd({ name: effectiveName, quantity, unit: '', notes: '', store: selectedStore, knownResult: effectiveResult })
      setName('')
      setQuantity('1')
      setSuggestions([])
      setShowSuggestions(false)
      setSelectedResult(null)
    } catch (err) {
      setSubmitError(err?.message || 'Failed to add item')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5">
      <h2 className="font-semibold text-white mb-4">Add Item</h2>
      <form onSubmit={handleSubmit} className="space-y-3">

        <div className="flex rounded-lg overflow-hidden border border-navy-500">
          {STORES.map(store => (
            <button
              key={store}
              type="button"
              onClick={() => setSelectedStore(store)}
              className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                selectedStore === store ? STORE_STYLES[store].active : 'bg-navy-700 text-navy-300 hover:bg-navy-600'
              }`}
            >
              {store}
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder={`Item name  (or type s: for Sprouts)`}
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => { if (!isSearchingRef.current) setShowSuggestions(false) }, 150)}
            required
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            className="w-full bg-navy-800 border border-navy-500 text-white placeholder-navy-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {showSuggestions && (suggestions.length > 0 || isSearching) && (
            <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-navy-700 border border-navy-500 rounded-lg shadow-lg overflow-hidden">
              {isSearching ? (
                <li className="px-3 py-2 text-sm text-navy-300 flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                  Searching {searchingStore}…
                </li>
              ) : suggestions.some(s => s.isResult || s.isNotFound) ? (
                <>
                  {suggestions.map((s, i) => (
                    <li
                      key={i}
                      onMouseDown={() => selectSuggestion(s)}
                      className="px-3 py-2 text-sm hover:bg-navy-600 cursor-pointer flex items-center justify-between"
                    >
                      {s.isResult ? (
                        <span className="flex items-center justify-between w-full gap-2">
                          <span className="text-white font-medium">{s.name}</span>
                          <span className="text-green-400 font-semibold text-xs shrink-0">${s.price?.toFixed(2)} · {s.store}</span>
                        </span>
                      ) : (
                        <span className="text-navy-400 text-xs italic">No results — tap to add anyway</span>
                      )}
                    </li>
                  ))}
                  <li className="border-t border-navy-500">
                    <form
                      onSubmit={e => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) selectSuggestion({ name: q, store: selectedStore, isSearch: true }) }}
                      className="flex items-center gap-1 px-2 py-1.5"
                    >
                      <input
                        name="q"
                        defaultValue={name}
                        autoComplete="off"
                        placeholder="Refine search…"
                        className="flex-1 text-xs bg-navy-800 border border-navy-500 text-white placeholder-navy-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                        onMouseDown={e => e.stopPropagation()}
                      />
                      <button type="submit" className="text-xs text-green-400 font-semibold px-2 py-1 hover:bg-navy-600 rounded">Search</button>
                    </form>
                  </li>
                </>
              ) : suggestions.map((s, i) => (
                <li
                  key={i}
                  onMouseDown={() => selectSuggestion(s)}
                  className="px-3 py-2 text-sm hover:bg-navy-600 cursor-pointer flex items-center justify-between"
                >
                  {s.isSearch ? (
                    <span className="text-indigo-500 text-xs">Search {s.store} for "{s.name}" →</span>
                  ) : (
                    <>
                      <span className="text-white">{s.name}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {s.quantity != null && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-navy-600 text-navy-200">
                            ×{s.quantity}
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STORE_STYLES[s.store]?.badge || 'bg-navy-600 text-navy-200'}`}>
                          {s.store}
                        </span>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {submitError && (
          <p className="text-red-400 text-xs">{submitError}</p>
        )}

        <div className="flex gap-2">
          <input
            type="number"
            min="0.01"
            step="any"
            placeholder="Qty"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className="w-24 bg-navy-800 border border-navy-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-navy-600 disabled:text-navy-400 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            {isSubmitting ? 'Adding…' : 'Add Item'}
          </button>
        </div>

      </form>
    </div>
  )
}
