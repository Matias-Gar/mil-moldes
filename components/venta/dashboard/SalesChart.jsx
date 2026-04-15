import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function currency(value) {
  const n = Number(value) || 0;
  return `Bs ${n.toFixed(2)}`;
}

export default function SalesChart({ data }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-slate-900">Ventas por día</h3>
      <p className="mb-4 text-xs text-slate-500">Ingresos diarios del rango filtrado</p>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ingresosFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0891b2" stopOpacity={0.36} />
                <stop offset="95%" stopColor="#0891b2" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#475569' }} />
            <YAxis tickFormatter={(v) => `Bs ${Number(v || 0).toFixed(0)}`} tick={{ fontSize: 12, fill: '#475569' }} />
            <Tooltip
              formatter={(value) => [currency(value), 'Ingresos']}
              labelFormatter={(label) => `Fecha: ${label}`}
              contentStyle={{ borderRadius: '12px', borderColor: '#cbd5e1' }}
            />
            <Area type="monotone" dataKey="ingresos" stroke="#0891b2" strokeWidth={2.5} fill="url(#ingresosFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
