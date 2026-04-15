export default function KpiCard({ title, value, tone = 'neutral', subtitle }) {
  const tones = {
    neutral: 'from-slate-50 to-white border-slate-200 text-slate-900',
    success: 'from-emerald-50 to-white border-emerald-200 text-emerald-900',
    warning: 'from-amber-50 to-white border-amber-200 text-amber-900',
    info: 'from-cyan-50 to-white border-cyan-200 text-cyan-900',
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${tones[tone] || tones.neutral}`}>
      <p className="text-sm font-medium opacity-75">{title}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      {subtitle ? <p className="mt-1 text-xs opacity-70">{subtitle}</p> : null}
    </div>
  );
}
