const STORE_COLORS = {
  Costco:  'bg-blue-900/40 text-blue-400',
  Sprouts: 'bg-green-900/40 text-green-400',
}

const CATEGORY_COLORS = {
  produce: 'bg-green-900/40 text-green-400',
  dairy:   'bg-blue-900/40 text-blue-400',
  meat:    'bg-red-900/40 text-red-400',
  frozen:  'bg-cyan-900/40 text-cyan-400',
  pantry:  'bg-amber-900/40 text-amber-400',
  other:   'bg-navy-600 text-navy-200',
}

function fmt(n) {
  return n != null ? `$${Number(n).toFixed(2)}` : '—'
}

function PriceCell({ price, store, isLoading }) {
  if (isLoading) {
    return (
      <div className="flex gap-3 text-xs text-navy-400 shrink-0">
        <span className="w-12 text-right animate-pulse">···</span>
        <span className="w-16 text-right animate-pulse">···</span>
      </div>
    )
  }
  if (price == null) return <div className="w-32 shrink-0" />
  return (
    <div className="flex gap-3 text-xs shrink-0 items-center">
      <span className="w-12 text-right font-semibold text-white">{fmt(price)}</span>
      <span className="w-16 text-right text-navy-300">{store || '—'}</span>
    </div>
  )
}

export default function GroceryList({ items, aiData, isLoadingForecast, onToggle, onDelete, onClear, onDoneShopping }) {
  const activeCount = items.filter(i => !i.is_bought).length
  const boughtCount = items.length - activeCount
  const hasPrices = items.some(i => aiData[i.id]?.price != null)

  return (
    <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white">
          Your List{' '}
          <span className="text-navy-300 font-normal text-sm">({items.length} items)</span>
        </h2>
        {items.length > 0 && (
          <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300">
            Clear all
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-navy-300 text-sm text-center py-6">No items yet. Add something above!</p>
      ) : (
        <>
          <div className="flex justify-end gap-3 mb-1 pr-8">
            <span className="w-8 text-right text-xs font-semibold text-navy-300">Qty</span>
            {(hasPrices || isLoadingForecast) && (
              <>
                <span className="w-12 text-right text-xs font-semibold text-navy-300">Total</span>
                <span className="w-16 text-right text-xs font-semibold text-navy-300">Store</span>
              </>
            )}
          </div>

          <ul className="space-y-2 mb-4">
            {items.map(item => {
              const ai = aiData[item.id] || {}
              const displayName = ai.storeProduct || item.name
              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    item.is_bought
                      ? 'bg-navy-800 border-navy-600 opacity-60'
                      : 'bg-navy-800 border-navy-500 hover:border-navy-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.is_bought}
                    onChange={() => onToggle(item)}
                    className="w-4 h-4 accent-green-500 cursor-pointer flex-shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${item.is_bought ? 'line-through text-navy-400' : 'text-white'}`}>
                      {displayName}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other}`}>
                        {item.category}
                      </span>
                      {item.preferred_store && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STORE_COLORS[item.preferred_store] || 'bg-navy-600 text-navy-200'}`}>
                          {item.preferred_store}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="w-8 text-right text-xs font-semibold text-navy-300 shrink-0">
                    {item.quantity ?? 1}
                  </span>

                  {(hasPrices || isLoadingForecast) && (
                    <PriceCell
                      price={ai.price != null ? ai.price * (item.quantity || 1) : null}
                      store={ai.store}
                      isLoading={isLoadingForecast && ai.price == null}
                    />
                  )}

                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-navy-400 hover:text-red-400 transition-colors flex-shrink-0 text-lg leading-none"
                    title="Delete"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {boughtCount > 0 && (
        <button
          onClick={onDoneShopping}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
        >
          Done Shopping ({boughtCount} checked)
        </button>
      )}
    </div>
  )
}
