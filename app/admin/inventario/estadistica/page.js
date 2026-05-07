"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/SupabaseClient";
import dynamic from "next/dynamic";
import { useSucursalActiva } from "../../../../components/admin/SucursalContext";

const Pie = dynamic(() => import("react-chartjs-2").then(mod => mod.Pie), { ssr: false });
const Line = dynamic(() => import("react-chartjs-2").then(mod => mod.Line), { ssr: false });
const Bar = dynamic(() => import("react-chartjs-2").then(mod => mod.Bar), { ssr: false });

import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement } from "chart.js";
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement);

export default function InventarioEstadisticaPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters / parameters
  const [periodDays, setPeriodDays] = useState(30);
  const [leadTimeDays, setLeadTimeDays] = useState(7);
  const [safetyDays, setSafetyDays] = useState(7);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      // 1) productos
      let prodsQuery = supabase
        .from("productos")
        .select("user_id, nombre, precio, stock, categoria")
        .limit(5000);
      if (activeSucursalId) prodsQuery = prodsQuery.eq("sucursal_id", activeSucursalId);
      const { data: prodsData } = await prodsQuery;
      const prods = Array.isArray(prodsData) ? prodsData : [];
      setProductos(prods);

      // 2) ventas en rango
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - periodDays);

      let ventasQuery = supabase
        .from("ventas")
        .select("id, total, fecha")
        .gte("fecha", fromDate.toISOString())
        .lte("fecha", toDate.toISOString())
        .order("fecha", { ascending: true });
      if (activeSucursalId) ventasQuery = ventasQuery.eq("sucursal_id", activeSucursalId);
      const { data: ventasData } = await ventasQuery;
      const vData = Array.isArray(ventasData) ? ventasData : [];
      setVentas(vData);

      // 3) detalles de ventas en rango
      const ventaIds = vData.map(v => v.id).filter(Boolean);
      let dets = [];
      if (ventaIds.length > 0) {
        let detallesQuery = supabase
          .from("ventas_detalle")
          .select("venta_id, producto_id, cantidad, precio_unitario")
          .in("venta_id", ventaIds);
        if (activeSucursalId) detallesQuery = detallesQuery.eq("sucursal_id", activeSucursalId);
        const { data: detData } = await detallesQuery;
        dets = Array.isArray(detData) ? detData : [];
      }
      setDetalles(dets);

      setLoading(false);
    }

    loadAll();
  }, [periodDays, activeSucursalId]);

  // Basic KPIs
  const totalProductos = productos.length;
  const stockTotal = productos.reduce((acc, p) => acc + Number(p.stock || 0), 0);
  const productosBajoStock = productos.filter(p => Number(p.stock) < 3).length;

  // Sales aggregates
  const totalVentas = ventas.length;
  const montoTotal = ventas.reduce((acc, v) => acc + Number(v.total || 0), 0);
  const ticketPromedio = totalVentas > 0 ? (montoTotal / totalVentas) : 0;

  // Sales per day (time series)
  const ventasPorDiaMap = {};
  ventas.forEach(v => {
    const fecha = new Date(v.fecha).toLocaleDateString();
    ventasPorDiaMap[fecha] = (ventasPorDiaMap[fecha] || 0) + 1;
  });
  const ventasPorDiaLabels = Object.keys(ventasPorDiaMap);
  const ventasPorDiaData = Object.values(ventasPorDiaMap);

  // Top products by units sold and by revenue
  const ventasPorProducto = {};
  detalles.forEach(d => {
    if (!d.producto_id) return;
    ventasPorProducto[d.producto_id] = ventasPorProducto[d.producto_id] || { qty:0, revenue:0 };
    ventasPorProducto[d.producto_id].qty += Number(d.cantidad || 0);
    ventasPorProducto[d.producto_id].revenue += Number(d.cantidad || 0) * Number(d.precio_unitario || 0);
  });
  const topProducts = Object.entries(ventasPorProducto).map(([pid, v]) => ({ producto_id: Number(pid), ...v }))
    .sort((a,b) => b.qty - a.qty)
    .slice(0, 10);

  // Revenue by category
  const revenueByCategory = {};
  topProducts.forEach(tp => {
    const prod = productos.find(p => Number(p.user_id) === Number(tp.producto_id) || Number(p.id) === Number(tp.producto_id));
    const cat = prod ? (prod.categoria || 'Sin categoría') : 'Sin categoría';
    revenueByCategory[cat] = (revenueByCategory[cat] || 0) + tp.revenue;
  });
  const revenueCategoriesLabels = Object.keys(revenueByCategory);
  const revenueCategoriesData = Object.values(revenueByCategory);

  // Days since last sale per product
  const lastSaleMap = {}; // producto_id -> lastDate
  detalles.forEach(d => {
    const fechaVenta = ventas.find(v => v.id === d.venta_id)?.fecha;
    if (!fechaVenta) return;
    const prev = lastSaleMap[d.producto_id];
    const date = new Date(fechaVenta);
    if (!prev || date > new Date(prev)) lastSaleMap[d.producto_id] = date.toISOString();
  });

  const now = new Date();
  const aging = productos.map(p => {
    const pid = p.user_id ?? p.id;
    const last = lastSaleMap[pid];
    const days = last ? Math.round((now - new Date(last)) / (1000*60*60*24)) : null;
    return { producto: p, lastSold: last, daysSinceLastSale: days };
  }).sort((a,b) => (b.daysSinceLastSale || 99999) - (a.daysSinceLastSale || 99999));

  // Reorder suggestion (simple heuristic)
  const avgDailySalesMap = {};
  // Compute avg daily qty sold per product over periodDays
  Object.keys(ventasPorProducto).forEach(pid => {
    avgDailySalesMap[pid] = (ventasPorProducto[pid].qty || 0) / Math.max(1, periodDays);
  });

  const reorderSuggestions = productos.map(p => {
    const pid = p.user_id ?? p.id;
    const avgDaily = avgDailySalesMap[pid] || 0;
    const reorderPoint = avgDaily * Number(leadTimeDays || 7) + avgDaily * Number(safetyDays || 7);
    const suggestedQty = reorderPoint > Number(p.stock || 0) ? Math.ceil(reorderPoint - Number(p.stock || 0)) : 0;
    return { producto: p, avgDaily, reorderPoint: Number(reorderPoint.toFixed(2)), suggestedQty };
  }).filter(r => r.suggestedQty > 0).sort((a,b) => b.suggestedQty - a.suggestedQty);

  // Chart data
  const ventasLineaData = {
    labels: ventasPorDiaLabels,
    datasets: [{ label: 'Ventas por día', data: ventasPorDiaData, borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.1)' }]
  };

  const topProdBarData = {
    labels: topProducts.map(t => (productos.find(p => Number(p.user_id)===t.producto_id || Number(p.id)===t.producto_id)?.nombre) || String(t.producto_id)),
    datasets: [{ label: 'Unidades vendidas', data: topProducts.map(t => t.qty), backgroundColor: '#F59E0B' }]
  };

  const pieRevenueByCategory = {
    labels: revenueCategoriesLabels,
    datasets: [{ data: revenueCategoriesData, backgroundColor: ['#60A5FA', '#FBBF24', '#34D399', '#F472B6', '#A78BFA'] }]
  };

  // Stock by category and by product (for classic inventory pies)
  const categorias = [...new Set(productos.map(p => p.categoria || "Sin categoría"))];
  const stockPorCategoria = categorias.map(cat => productos.filter(p => (p.categoria || "Sin categoría") === cat).reduce((acc, p) => acc + Number(p.stock || 0), 0));
  const pieDataCategoria = {
    labels: categorias,
    datasets: [{ data: stockPorCategoria, backgroundColor: ['#34D399', '#60A5FA', '#FBBF24', '#F87171', '#A78BFA', '#F472B6'] }]
  };
  const pieDataProducto = {
    labels: productos.map(p => p.nombre || "-"),
    datasets: [{ data: productos.map(p => Number(p.stock || 0)), backgroundColor: ['#4ade80', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#f472b6'] }]
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Estadísticas de Inventario</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Rango:</label>
          <select value={periodDays} onChange={e=>setPeriodDays(Number(e.target.value))} className="border rounded px-2 py-1">
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
            <option value={180}>Últimos 180 días</option>
            <option value={365}>Último año</option>
          </select>
          <label className="text-sm text-gray-600 ml-4">Lead time (días)</label>
          <input type="number" value={leadTimeDays} onChange={e=>setLeadTimeDays(Number(e.target.value))} className="w-20 border rounded px-2 py-1" />
          <label className="text-sm text-gray-600 ml-2">Safety (días)</label>
          <input type="number" value={safetyDays} onChange={e=>setSafetyDays(Number(e.target.value))} className="w-20 border rounded px-2 py-1" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow p-6">
              <div className="text-sm text-gray-600">Productos</div>
              <div className="text-2xl font-extrabold">{totalProductos}</div>
              <div className="text-sm text-gray-500 mt-1">Stock total: <span className="font-bold">{stockTotal}</span></div>
            </div>
            <div className="bg-white rounded-xl shadow p-6">
              <div className="text-sm text-gray-600">Ventas ({periodDays}d)</div>
              <div className="text-2xl font-extrabold">{totalVentas}</div>
              <div className="text-sm text-gray-500 mt-1">Monto: <span className="font-bold">Bs {Number(montoTotal).toFixed(2)}</span></div>
            </div>
            <div className="bg-white rounded-xl shadow p-6">
              <div className="text-sm text-gray-600">Ticket promedio</div>
              <div className="text-2xl font-extrabold">Bs {Number(ticketPromedio).toFixed(2)}</div>
              <div className="text-sm text-gray-500 mt-1">Productos con stock bajo: <span className="text-red-600 font-bold">{productosBajoStock}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
              <div className="text-sm text-gray-600 mb-3 font-bold">Ventas por día</div>
              {ventasPorDiaLabels.length > 0 ? <Line data={ventasLineaData} /> : <div className="text-sm text-gray-500">No hay ventas en este periodo</div>}
            </div>

            <div className="bg-white rounded-xl shadow p-6 flex flex-col gap-4">
              <div className="text-sm text-gray-600 font-bold">Top productos</div>
              {topProducts.length > 0 ? (
                <Bar data={topProdBarData} />
              ) : (
                <div className="text-sm text-gray-500">Sin datos</div>
              )}

              <div className="text-sm text-gray-600 font-bold">Ingresos por categoría</div>
              {revenueCategoriesLabels.length > 0 ? <Pie data={pieRevenueByCategory} /> : <div className="text-sm text-gray-500">Sin datos</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-bold text-gray-600">Sugerencias de reabastecimiento</div>
                <div className="text-sm text-gray-500">Basado en venta promedio de {periodDays} días</div>
              </div>
              {reorderSuggestions.length === 0 ? (
                <div className="text-sm text-gray-500">No se requieren reabastecimientos.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead>
                      <tr className="text-xs text-gray-500">
                        <th className="py-2">Producto</th>
                        <th className="py-2">Stock</th>
                        <th className="py-2">Promedio diario</th>
                        <th className="py-2">Punto de reorder</th>
                        <th className="py-2">Qty sugerida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reorderSuggestions.map(r => (
                        <tr key={(r.producto.user_id??r.producto.id)} className="border-t">
                          <td className="py-2">{r.producto.nombre}</td>
                          <td className="py-2">{r.producto.stock}</td>
                          <td className="py-2">{r.avgDaily.toFixed(2)}</td>
                          <td className="py-2">{r.reorderPoint}</td>
                          <td className="py-2 font-bold text-red-600">{r.suggestedQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow p-6">
              <div className="text-sm font-bold text-gray-600 mb-3">Productos sin venta reciente</div>
              <div className="text-sm text-gray-500 mb-4">Última venta y días desde entonces</div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {aging.slice(0, 20).map(a => (
                  <div key={(a.producto.user_id ?? a.producto.id)} className="flex items-center justify-between">
                    <div>
                      <div className="font-bold">{a.producto.nombre}</div>
                      <div className="text-xs text-gray-500">Última venta: {a.lastSold ? new Date(a.lastSold).toLocaleDateString() : 'Nunca'}</div>
                    </div>
                    <div className="text-sm font-bold text-gray-700">{a.daysSinceLastSale ?? '—'}d</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-6">
              <div className="text-sm font-bold text-gray-600 mb-3">Stock por categoría</div>
              {productos.length > 0 && <Pie data={pieDataCategoria} />}
            </div>
            <div className="bg-white rounded-xl shadow p-6">
              <div className="text-sm font-bold text-gray-600 mb-3">Stock por producto</div>
              {productos.length > 0 && <Pie data={pieDataProducto} />}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
