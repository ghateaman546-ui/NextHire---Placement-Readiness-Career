export default function Input({ label, error, className = '', ...rest }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-xs font-semibold text-gray-400 mb-1.5">{label}</label>}
      <input
        className={`w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border text-sm text-white placeholder:text-gray-500 outline-none transition-colors
          ${error ? 'border-red-500/60' : 'border-white/10 focus:border-primary/60 focus:bg-primary/[0.06]'} ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
