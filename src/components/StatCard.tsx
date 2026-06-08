export function StatCard({
  title,
  value,
  hint,
}: {
  title: string
  value: string
  hint?: string
}) {
  return (
    <div className="group rounded-xl border border-surface-800 bg-surface-900/50 p-4 transition-all duration-200 hover:border-surface-700 hover:bg-surface-900/80">
      <div className="text-[11px] font-medium tracking-wider text-surface-500 uppercase">
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-surface-100">{value}</div>
      {hint ? (
        <div className="mt-1.5 text-[11px] text-surface-500">{hint}</div>
      ) : null}
    </div>
  )
}

