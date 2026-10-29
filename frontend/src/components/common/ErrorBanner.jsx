export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[13px]">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold text-red-200 hover:underline whitespace-nowrap">
          Retry
        </button>
      )}
    </div>
  );
}
