const USERS = ['TARS', 'Wife', 'Son']

export default function NamePickerModal({ onSelect }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-4">🛒</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Grocery Forecast</h1>
        <p className="text-gray-500 mb-8">Who are you?</p>
        <div className="space-y-3">
          {USERS.map(name => (
            <button
              key={name}
              onClick={() => onSelect(name)}
              className="w-full py-3 px-6 rounded-xl bg-green-50 hover:bg-green-100 text-green-800 font-semibold text-lg transition-colors border border-green-200 hover:border-green-300"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
