import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, pbUrl } from './utils/pb'
import { detectCategory } from './utils/categories'
import AddItemForm from './components/AddItemForm'
import GroceryList from './components/GroceryList'
import ForecastPanel from './components/ForecastPanel'
import ReviewTrip from './components/ReviewTrip'
import InsightsPanel from './components/InsightsPanel'

const PROXY_URL = window.location.origin
const FORECAST_DELAY_MS = 2000

function matchForecastItem(itemName, forecastItems) {
  const name = itemName.toLowerCase()
  return forecastItems?.find(f =>
    f.name.toLowerCase().includes(name) || name.includes(f.name.toLowerCase())
  ) || null
}

export default function App() {
  const [items, setItems] = useState([])
  const [aiData, setAiData] = useState({})       // { [itemId]: { price, store, storeProduct } }
  const [forecast, setForecast] = useState(null)
  const [isLoadingForecast, setIsLoadingForecast] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [initError, setInitError] = useState('')
  const [showStoreModal, setShowStoreModal] = useState(false)
  const [unverifiedCount, setUnverifiedCount] = useState(0)
  const [activeTab, setActiveTab] = useState('list')
  const forecastTimer = useRef(null)
  const isInitialLoad = useRef(false)
  const lastForecastSig = useRef('')
  const pinnedAiIds = useRef(new Set()) // item IDs whose storeProduct was user-selected — forecast must not overwrite

  useEffect(() => {
    let unsubscribe

    async function init() {
      try {
        setInitError('')
        const records = await pb.collection('grocery_items').getFullList({ sort: 'id', requestKey: null })

        // Restore saved AI data from DB — no forecast call needed on load
        const savedAiData = {}
        records.forEach(r => {
          if (r.ai_price != null) {
            savedAiData[r.id] = { price: r.ai_price, store: r.ai_store || '', storeProduct: r.ai_product || '' }
          }
          // Re-pin items whose stored product name differs from the generic typed name —
          // these were enriched by live search or Firecrawl and must not be overwritten by the next forecast
          if (r.ai_product && r.ai_product !== r.name) {
            pinnedAiIds.current.add(r.id)
          }
        })
        setAiData(savedAiData)

        isInitialLoad.current = true
        setItems(records)
        setIsConnected(true)

        // Check for unverified trip items
        const unverified = await pb.collection('purchase_history').getList(1, 1, { filter: 'verified = false', requestKey: null })
        setUnverifiedCount(unverified.totalItems)
      } catch (err) {
        console.error('getFullList failed:', err)
        setInitError(`Load failed: ${err?.message || err}`)
        setIsConnected(false)
        return
      }

      try {
        unsubscribe = await pb.collection('grocery_items').subscribe('*', (e) => {
          if (e.action === 'create') {
            setItems(prev => prev.some(i => i.id === e.record.id) ? prev : [...prev, e.record])
          } else if (e.action === 'update') {
            setItems(prev => prev.map(i => i.id === e.record.id ? e.record : i))
          } else if (e.action === 'delete') {
            setItems(prev => prev.filter(i => i.id !== e.record.id))
            setAiData(prev => { const next = { ...prev }; delete next[e.record.id]; return next })
          }
        })
      } catch (err) {
        console.error('Realtime subscribe failed:', err)
      }
    }

    init()
    return () => { if (unsubscribe) unsubscribe() }
  }, [])

  // Auto-forecast: debounce 2s after list changes, skip initial page load
  // Only re-run when item content changes (name/qty/store), not when AI data is written back
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }

    const activeItems = items.filter(i => !i.is_bought)

    if (activeItems.length === 0) {
      setForecast(null)
      setIsLoadingForecast(false)
      clearTimeout(forecastTimer.current)
      lastForecastSig.current = ''
      return
    }

    const sig = activeItems.map(i => `${i.id}:${i.name}:${i.quantity}:${i.preferred_store}:${i.is_bought}`).join('|')
    if (sig === lastForecastSig.current) return
    lastForecastSig.current = sig

    setIsLoadingForecast(true)
    clearTimeout(forecastTimer.current)
    forecastTimer.current = setTimeout(async () => {
      try {
        const historyRecords = await pb.collection('purchase_history').getFullList({ sort: 'id', requestKey: null })
        const res = await fetch(`${PROXY_URL}/api/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: activeItems, history: historyRecords }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        setForecast(data)

        // Save AI enrichment per item to DB and local state
        const newAiData = {}
        activeItems.forEach(item => {
          const match = matchForecastItem(item.name, data.items)
          if (match) {
            newAiData[item.id] = {
              price: match.price,
              store: match.store,
              storeProduct: match.storeProduct || '',
            }
          }
        })
        setAiData(prev => {
          const next = { ...prev }
          Object.entries(newAiData).forEach(([id, data]) => {
            if (!pinnedAiIds.current.has(id)) next[id] = data
          })
          return next
        })

        // Save Firecrawl-sourced prices to purchase_history so future forecasts skip the scrape
        const today = new Date().toLocaleDateString('en-CA')
        const webScrapedItems = data.items.filter(i => i.source === 'sprouts_web' || i.source === 'costco_web')
        webScrapedItems.forEach(item => {
          const groceryItem = activeItems.find(ai => ai.name === item.name)
          pb.collection('purchase_history').create({
            name: item.storeProduct || item.name,
            quantity: 1,
            unit: '',
            category: groceryItem?.category || 'other',
            unit_price: item.price,
            purchase_date: today,
            store: item.store,
            verified: true,
          }, { requestKey: null }).catch(() => {})
        })

        Object.entries(newAiData).forEach(([id, d]) => {
          if (pinnedAiIds.current.has(id)) return
          pb.collection('grocery_items').update(id, {
            ai_price: d.price,
            ai_store: d.store,
            ai_product: d.storeProduct,
          }).catch(() => {})
        })
      } catch (err) {
        console.error('Forecast failed:', err)
      } finally {
        setIsLoadingForecast(false)
      }
    }, FORECAST_DELAY_MS)
  }, [items])

  const addItem = useCallback(async ({ name, quantity, unit, notes, store, knownResult }) => {
    // When user picked a real product from live search, that name is authoritative
    const savedName = knownResult?.storeProduct || name
    const record = await pb.collection('grocery_items').create({
      name: savedName,
      quantity: parseFloat(quantity) || 1,
      unit: unit || '',
      category: detectCategory(savedName),
      notes: notes || '',
      is_bought: false,
      preferred_store: store || 'Costco',
    })

    if (knownResult) {
      const { storeProduct, price } = knownResult
      pinnedAiIds.current.add(record.id)
      setAiData(prev => ({ ...prev, [record.id]: { price, store, storeProduct } }))
      pb.collection('grocery_items').update(record.id, {
        ai_price: price,
        ai_store: store,
        ai_product: storeProduct,
      }, { requestKey: null }).catch(() => {})
      const today = new Date().toLocaleDateString('en-CA')
      pb.collection('purchase_history').create({
        name: storeProduct,
        quantity: 1,
        unit: '',
        category: detectCategory(savedName),
        unit_price: price,
        purchase_date: today,
        store,
        verified: true,
      }, { requestKey: null }).catch(() => {})
    }

    setItems(prev => prev.some(i => i.id === record.id) ? prev : [...prev, record])
  }, [])

  const toggleBought = useCallback(async (item) => {
    await pb.collection('grocery_items').update(item.id, { is_bought: !item.is_bought })
  }, [])

  const deleteItem = useCallback(async (id) => {
    await pb.collection('grocery_items').delete(id)
    setAiData(prev => { const next = { ...prev }; delete next[id]; return next })
    pinnedAiIds.current.delete(id)
  }, [])

  const clearList = useCallback(async () => {
    if (!confirm('Clear the entire list? This cannot be undone.')) return
    await Promise.all(items.map(i => pb.collection('grocery_items').delete(i.id)))
    setAiData({})
  }, [items])

  const doneShopping = useCallback(async (store) => {
    const bought = items.filter(i => i.is_bought)
    if (bought.length === 0) return
    setShowStoreModal(false)
    const today = new Date().toLocaleDateString('en-CA')
    await Promise.all(bought.map(async (item) => {
      const ai = aiData[item.id] || {}
      try {
        await pb.collection('purchase_history').create({
          name: ai.storeProduct || item.name,
          quantity: item.quantity || 1,
          unit: item.unit || '',
          category: item.category || 'other',
          unit_price: ai.price || 0,
          notes: item.notes || '',
          purchase_date: today,
          store,
          verified: false,
          planned: true,
        })
      } catch (_) {}
      await pb.collection('grocery_items').delete(item.id)
    }))
    setItems(prev => prev.filter(i => !i.is_bought))
    setAiData(prev => {
      const next = { ...prev }
      bought.forEach(item => delete next[item.id])
      return next
    })
    setUnverifiedCount(prev => prev + bought.length)
  }, [items, aiData])

  return (
    <div className="min-h-screen bg-navy-900">
      <header className="bg-navy-800 border-b border-navy-500 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">Grocery Forecast</h1>
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'list'
                ? 'border border-navy-400 text-white'
                : 'text-navy-400 hover:text-white'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'insights'
                ? 'border border-navy-400 text-white'
                : 'text-navy-400 hover:text-white'
            }`}
          >
            Insights
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-colors relative ${
              activeTab === 'history'
                ? 'border border-navy-400 text-white'
                : 'text-navy-400 hover:text-white'
            }`}
          >
            History
            {unverifiedCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unverifiedCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {initError && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-red-400">{initError}</p>
            <p className="text-red-500 text-xs mt-1">PB URL: {pbUrl}</p>
            <button onClick={() => window.location.reload()} className="mt-2 text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 px-3 py-1 rounded">Retry</button>
          </div>
        )}

        {activeTab === 'list' && (
          <>
            {unverifiedCount > 0 && (
              <button
                onClick={() => setActiveTab('history')}
                className="w-full rounded-xl px-4 py-3 flex items-center justify-between bg-amber-900/20 border border-amber-700/50 hover:bg-amber-900/30 transition-colors"
              >
                <span className="text-sm text-amber-400 font-medium">🧾 {unverifiedCount} items need price review</span>
                <span className="text-sm text-amber-400 font-semibold">Review →</span>
              </button>
            )}

            <AddItemForm onAdd={addItem} />

            <GroceryList
              items={items}
              aiData={aiData}
              isLoadingForecast={isLoadingForecast}
              onToggle={toggleBought}
              onDelete={deleteItem}
              onClear={clearList}
              onDoneShopping={() => setShowStoreModal(true)}
            />

            {(forecast || isLoadingForecast) && (
              <ForecastPanel forecast={forecast} isLoading={isLoadingForecast} />
            )}
          </>
        )}

        {activeTab === 'insights' && <InsightsPanel />}

        {activeTab === 'history' && (
          <ReviewTrip
            onSaved={() => setUnverifiedCount(0)}
          />
        )}
      </main>

      {showStoreModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-navy-700 border border-navy-500 rounded-2xl p-6 w-full max-w-sm shadow-xl mb-4">
            <h3 className="text-center font-semibold text-white mb-6 text-lg">Where did you shop?</h3>
            <div className="flex gap-3">
              <button
                onClick={() => doneShopping('Costco')}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-5 rounded-xl text-lg transition-colors"
              >
                Costco
              </button>
              <button
                onClick={() => doneShopping('Sprouts')}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-5 rounded-xl text-lg transition-colors"
              >
                Sprouts
              </button>
            </div>
            <button
              onClick={() => setShowStoreModal(false)}
              className="w-full mt-4 text-sm text-navy-300 hover:text-white py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
