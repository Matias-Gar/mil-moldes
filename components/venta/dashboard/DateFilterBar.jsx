export default function DateFilterBar({
  dateFrom,
  dateTo,
  monthValue,
  onMonthChange,
  onDateFromChange,
  onDateToChange,
  onClear,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label htmlFor="monthFilter" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mes
          </label>
          <input
            id="monthFilter"
            type="month"
            value={monthValue || ''}
            onChange={(e) => onMonthChange?.(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="dateFrom" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Desde
          </label>
          <input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="dateTo" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hasta
          </label>
          <input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500"
          />
        </div>
        <button
          type="button"
          onClick={onClear}
          className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Limpiar filtro
        </button>
      </div>
    </div>
  );
}
