function formatMoney(value) {
  const num = Number(value) || 0;
  return `Bs ${num.toFixed(2)}`;
}

export default function TopProductsCard({ products }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-slate-900">Top productos vendidos</h3>
      <p className="mb-4 text-xs text-slate-500">Ranking por unidades vendidas</p>

      {products.length === 0 ? (
        <p className="text-sm text-slate-500">Sin datos para el rango seleccionado.</p>
      ) : (
        <ul className="space-y-3">
          {products.map((product, idx) => (
            <li key={`${product.name}-${idx}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">{idx + 1}. {product.name}</p>
                <p className="text-xs text-slate-500">{formatMoney(product.total)} vendidos</p>
              </div>
              <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-bold text-cyan-800">
                {product.cantidad} uds
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
