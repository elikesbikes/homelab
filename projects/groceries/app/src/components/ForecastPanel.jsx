const CATEGORY_LABELS = {
  produce: 'Produce',
  dairy: 'Dairy',
  meat: 'Meat & Seafood',
  frozen: 'Frozen',
  pantry: 'Pantry',
  other: 'Other',
}

export default function ForecastPanel({ forecast, isLoading }) {
  if (isLoading && !forecast) {
    return (
      <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5 flex items-center gap-3 text-navy-300 text-sm">
        <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Calculating forecast…
      </div>
    )
  }

  const { totalEstimate, categoryBreakdown, tips, confidence, generatedAt } = forecast

  const categories = Object.entries(categoryBreakdown || {}).filter(([, v]) => v > 0)

  return (
    <div className="bg-navy-700 rounded-2xl border border-navy-500 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white">Forecast</h2>
        {isLoading && (
          <span className="text-xs text-indigo-400 flex items-center gap-1">
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Updating…
          </span>
        )}
      </div>

      <div className="text-center mb-6">
        <div className="text-4xl font-bold text-green-400">${totalEstimate?.toFixed(2)}</div>
        <div className="text-sm text-navy-300 mt-1">
          estimated total · {Math.round((confidence || 0) * 100)}% confidence
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-2">By Category</h3>
          <div className="space-y-1.5">
            {categories.map(([cat, amount]) => (
              <div key={cat} className="flex justify-between text-sm">
                <span className="text-navy-200">{CATEGORY_LABELS[cat] || cat}</span>
                <span className="font-medium text-white">${amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tips?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-navy-300 uppercase tracking-wide mb-2">Save Money</h3>
          <ul className="space-y-2">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-navy-200">
                <span className="text-green-400 flex-shrink-0">✓</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {generatedAt && (
        <div className="mt-4 pt-4 border-t border-navy-500 text-xs text-navy-400 text-right">
          Generated {new Date(generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  )
}
