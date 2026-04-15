import { Fragment, useState } from 'react';

function money(value) {
  const num = Number(value) || 0;
  return `Bs ${num.toFixed(2)}`;
}

function pct(value) {
  const num = Number(value) || 0;
  return `${num.toFixed(2)}%`;
}

function metricTone(value) {
  return Number(value) >= 0 ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100';
}

export default function SalesTable({ rows }) {
  const [openRow, setOpenRow] = useState(null);

  const toggleRow = (rowId) => {
    setOpenRow((prev) => (prev === rowId ? null : rowId));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-bold text-slate-900">Detalle de ventas</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Compra</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Costo</th>
              <th className="px-3 py-2">Ganancia</th>
              <th className="px-3 py-2">Margen %</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No hay ventas para el rango seleccionado.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isOpen = openRow === row.id;
                const totalItems = (row.items || []).reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0);
                const totalGananciaItems = (row.items || []).reduce((sum, item) => sum + (Number(item.ganancia) || 0), 0);

                return (
                  <Fragment key={`sale-group-${row.id}`}>
                    <tr
                      onClick={() => toggleRow(row.id)}
                      className={`cursor-pointer border-b text-slate-700 transition ${isOpen ? 'border-cyan-200 bg-cyan-50/60' : 'border-slate-100 hover:bg-slate-50'}`}
                    >
                      <td className="px-3 py-3 font-semibold">{row.cliente}</td>
                      <td className="px-3 py-3 text-slate-600">{row.resumenCompra}</td>
                      <td className="px-3 py-3">{money(row.total)}</td>
                      <td className="px-3 py-3">{money(row.costoMercaderia)}</td>
                      <td className={`px-3 py-3 font-semibold ${row.ganancia >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {row.puedeAnalizar ? money(row.ganancia) : 'Sin detalle'}
                      </td>
                      <td className="px-3 py-3">{row.puedeAnalizar ? pct(row.margen) : '-'}</td>
                      <td className="px-3 py-3">{row.fecha ? new Date(row.fecha).toLocaleString() : '-'}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(row.id);
                          }}
                          className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-800 hover:bg-cyan-100"
                        >
                          {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
                        </button>
                      </td>
                    </tr>

                    {isOpen ? (
                      <tr className="border-b border-slate-100">
                        <td colSpan={8} className="px-3 py-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                              <h4 className="text-sm font-black uppercase tracking-wide text-slate-700">Detalle completo</h4>
                              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                                <span className="rounded-full bg-white px-2 py-1 text-slate-700">Productos: {totalItems}</span>
                                <span className={`rounded-full px-2 py-1 ${totalGananciaItems >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                  Ganancia items: {money(totalGananciaItems)}
                                </span>
                                <span className="rounded-full bg-white px-2 py-1 text-slate-700">Pago: {row.metodoPago}</span>
                              </div>
                            </div>

                            <div className="mb-4 rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-900">
                              {row.resumenCompra}
                            </div>

                            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Total cobrado</div>
                                <div className="mt-1 text-lg font-black text-slate-900">{money(row.total)}</div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Costo mercaderia</div>
                                <div className="mt-1 text-lg font-black text-slate-900">{money(row.costoMercaderia)}</div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Venta productos</div>
                                <div className="mt-1 text-lg font-black text-slate-900">{money(row.ingresosItems)}</div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Ganancia real</div>
                                <div className={`mt-1 inline-flex rounded-full px-3 py-1 text-lg font-black ${metricTone(row.ganancia)}`}>
                                  {row.puedeAnalizar ? money(row.ganancia) : 'Sin detalle'}
                                </div>
                              </div>
                            </div>

                            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Ajustes de operacion</div>
                                <div className="space-y-1">
                                  <div>Envio: {money(row.envio)}</div>
                                  <div>Comision: {money(row.comision)}</div>
                                  <div>Publicidad: {money(row.publicidad)}</div>
                                  <div>Rebajas: {money(row.rebajas)}</div>
                                  <div>Impuestos: {money(row.impuestos)}</div>
                                  <div>Descuentos promo: {money(row.descuentos)}</div>
                                </div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Lectura financiera</div>
                                <div className="space-y-1">
                                  <div>Ganancia productos: {money(row.gananciaProductos)}</div>
                                  <div>Ajustes netos: {money(row.ajustesOperativos)}</div>
                                  <div>Metodo de pago: {row.metodoPago}</div>
                                  <div>Margen: {row.puedeAnalizar ? pct(row.margen) : '-'}</div>
                                </div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Estado del analisis</div>
                                <div className="space-y-1">
                                  <div>{row.puedeAnalizar ? 'Venta analizada con detalle por producto.' : 'Faltan filas en ventas_detalle para reconstruir esta venta.'}</div>
                                  {!row.puedeAnalizar ? <div className="text-amber-700">Las ventas antiguas sin detalle no pueden reconstruirse automaticamente.</div> : null}
                                </div>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="min-w-full text-left text-xs sm:text-sm">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-500">
                                    <th className="px-2 py-2">Producto / Pack</th>
                                    <th className="px-2 py-2">Variante</th>
                                    <th className="px-2 py-2">Cant</th>
                                    <th className="px-2 py-2">Precio venta</th>
                                    <th className="px-2 py-2">Costo unitario</th>
                                    <th className="px-2 py-2">Costo total</th>
                                    <th className="px-2 py-2">Ingreso</th>
                                    <th className="px-2 py-2">Ganancia</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(row.items || []).length === 0 ? (
                                    <tr>
                                      <td colSpan={8} className="px-2 py-4 text-center text-slate-500">No hay detalle registrado para esta venta.</td>
                                    </tr>
                                  ) : (
                                    (row.items || []).map((item, idx) => (
                                      <tr key={`item-${row.id}-${idx}`} className="border-b border-slate-100">
                                        <td className="px-2 py-2 font-medium text-slate-800">
                                          {item.nombre}
                                          {item.tipo === 'pack' ? <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700">Pack</span> : null}
                                        </td>
                                        <td className="px-2 py-2 text-slate-600">{item.color || '-'}</td>
                                        <td className="px-2 py-2">{item.cantidad}</td>
                                        <td className="px-2 py-2">{money(item.precio)}</td>
                                        <td className="px-2 py-2">{money(item.costoUnitario)}</td>
                                        <td className="px-2 py-2">{money(item.costo)}</td>
                                        <td className="px-2 py-2">{money(item.ingreso)}</td>
                                        <td className={`px-2 py-2 font-semibold ${item.ganancia >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                          {money(item.ganancia)}
                                          {item.lowProfit ? <span className="ml-2 text-[10px] uppercase text-rose-600">Baja ganancia</span> : null}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
