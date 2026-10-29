/** Interactive 1-5 star rating input, used in the peer evaluation feedback form. */
export default function StarRating({ label, value, onChange }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-gray-400 mb-1.5">{label}</div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`text-2xl leading-none transition-colors ${n <= value ? 'text-amber-400' : 'text-white/15'}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
