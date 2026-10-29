import Card from './Card.jsx';

export default function StatCard({ label, value, unit, accentClass = 'bg-primary' }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentClass}`} />
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-[26px] font-extrabold mt-2 font-mono tabular-nums">
        {value}
        {unit && <small className="text-[13px] text-gray-400 font-semibold ml-1">{unit}</small>}
      </div>
    </Card>
  );
}
