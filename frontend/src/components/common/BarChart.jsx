export default function BarChart({ data, max }) {
  const computedMax = max || Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2.5 h-36 pt-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5">
          <div
            className="w-full rounded-t-md rounded-b-sm bg-gradient-to-t from-primary to-accent min-h-[4px]"
            style={{ height: `${Math.round((d.value / computedMax) * 120)}px` }}
            title={`${d.label}: ${d.value}`}
          />
          <div className="text-[10.5px] text-gray-400">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
