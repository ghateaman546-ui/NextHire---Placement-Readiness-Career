export default function SearchInput({ placeholder = 'Search…', ...rest }) {
  return (
    <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 w-72 text-gray-400 text-sm">
      <span>🔍</span>
      <input className="bg-transparent outline-none w-full placeholder:text-gray-500 text-white" placeholder={placeholder} {...rest} />
    </div>
  );
}
