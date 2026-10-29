export default function ProgressRing({ percent, size = 96, label = '' }) {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: `conic-gradient(#06B6D4 ${percent}%, rgba(255,255,255,0.06) 0)` }}
    >
      <div className="rounded-full bg-surface-card flex flex-col items-center justify-center" style={{ width: size - 22, height: size - 22 }}>
        <b className="text-[17px]">{percent}%</b>
        {label && <span className="text-[9.5px] text-gray-400">{label}</span>}
      </div>
    </div>
  );
}
