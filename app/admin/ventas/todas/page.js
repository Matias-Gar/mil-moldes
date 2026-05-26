"use client";

import { useMemo, useState } from 'react';
import DateFilterBar from '../../../../components/venta/dashboard/DateFilterBar';
import KpiCard from '../../../../components/venta/dashboard/KpiCard';
import SalesChart from '../../../../components/venta/dashboard/SalesChart';
import SalesTable from '../../../../components/venta/dashboard/SalesTable';
import TopProductsCard from '../../../../components/venta/dashboard/TopProductsCard';
import { useVentasDashboard } from '../../../../hooks/useVentasDashboard';
import { useSucursalActiva } from '../../../../components/admin/SucursalContext';

function money(value) {
  const num = Number(value) || 0;
  return `Bs ${num.toFixed(2)}`;
}

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toISOString().slice(0, 10);
}

function paymentAmountFor(row, paymentFilter) {
  if (!paymentFilter || paymentFilter === 'all') return Number(row.pagoEntrante || row.total || 0);
  const pagos = Array.isArray(row.pagos) ? row.pagos : [];
  if (pagos.length === 0) {
    return (row.paymentKeys || []).includes(paymentFilter) ? Number(row.pagoEntrante || row.total || 0) : 0;
  }
  return pagos
    .filter((pago) => pago.metodo === paymentFilter)
    .reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
}

function buildFilteredRows(rows, filters) {
  return rows
    .map((row) => {
      const paymentAmount = paymentAmountFor(row, filters.payment);
      if (filters.payment !== 'all' && paymentAmount <= 0) return null;

      const text = normalized(filters.search);
      const hasItemFilters =
        filters.category !== 'all' ||
        filters.type !== 'all' ||
        filters.product !== 'all' ||
        text;

      const matchingItems = (row.items || []).filter((item) => {
        const categoryOk = filters.category === 'all' || item.categoria === filters.category;
        const typeOk = filters.type === 'all' || item.vistaProducto === filters.type;
        const productOk = filters.product === 'all' || String(item.productoId) === String(filters.product);
        const searchOk = !text || [
          item.nombre,
          item.categoria,
          item.color,
          row.cliente,
          row.id,
        ].some((value) => normalized(value).includes(text));
        return categoryOk && typeOk && productOk && searchOk;
      });

      if (hasItemFilters && matchingItems.length === 0) return null;

      const itemsForTotals = hasItemFilters ? matchingItems : (row.items || []);
      const baseIngreso = hasItemFilters
        ? itemsForTotals.reduce((sum, item) => sum + Number(item.ingresoNeto ?? item.ingreso ?? 0), 0)
        : Number(row.total || row.pagoEntrante || 0);
      const paymentShare = row.pagoEntrante > 0 ? Math.min(1, paymentAmount / row.pagoEntrante) : 1;
      const totalFiltrado = filters.payment === 'all'
        ? baseIngreso
        : Math.min(baseIngreso, baseIngreso * paymentShare);
      const costoFiltrado = itemsForTotals.reduce((sum, item) => sum + Number(item.costo || 0), 0) * (filters.payment === 'all' ? 1 : paymentShare);
      const rebajasFiltradas = Number(row.rebajas || 0) * (hasItemFilters && row.total > 0 ? baseIngreso / row.total : 1) * (filters.payment === 'all' ? 1 : paymentShare);
      const descuentosFiltrados = Number(row.descuentos || 0) * (hasItemFilters && row.total > 0 ? baseIngreso / row.total : 1) * (filters.payment === 'all' ? 1 : paymentShare);
      const gananciaFiltrada = totalFiltrado - costoFiltrado;

      return {
        ...row,
        items: itemsForTotals,
        total: totalFiltrado,
        costoMercaderia: costoFiltrado,
        costo: costoFiltrado,
        ganancia: gananciaFiltrada,
        margen: totalFiltrado > 0 ? (gananciaFiltrada / totalFiltrado) * 100 : 0,
        cantidadProductos: itemsForTotals.reduce((sum, item) => sum + Number(item.cantidad || 0), 0),
        ingresosItems: totalFiltrado,
        rebajas: rebajasFiltradas,
        descuentos: descuentosFiltrados,
        resumenCompra: hasItemFilters
          ? `${row.cliente} en filtro: ${itemsForTotals.map((item) => item.nombre).join(', ')}`
          : row.resumenCompra,
      };
    })
    .filter(Boolean);
}

export default function TodasVentasPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [monthFilter, setMonthFilter] = useState('');
  const [filters, setFilters] = useState({
    category: 'all',
    type: 'all',
    product: 'all',
    payment: 'all',
    search: '',
  });

  const {
    loading,
    error,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    salesRows,
  } = useVentasDashboard(activeSucursalId);

  const options = useMemo(() => {
    const items = salesRows.flatMap((row) => row.items || []);
    const payments = salesRows.flatMap((row) => row.paymentKeys || []);
    return {
      categories: uniqueSorted(items.map((item) => item.categoria || 'Sin categoria')),
      types: uniqueSorted(items.map((item) => item.vistaProducto || 'articulos')),
      products: uniqueSorted(items.map((item) => item.productoId ? `${item.productoId}::${item.nombre}` : '')),
      payments: uniqueSorted(payments),
    };
  }, [salesRows]);

  const filteredRows = useMemo(() => buildFilteredRows(salesRows, filters), [salesRows, filters]);

  const filteredKpis = useMemo(() => {
    const totalVentas = filteredRows.length;
    const totalIngresos = filteredRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const totalCosto = filteredRows.reduce((sum, row) => sum + Number(row.costoMercaderia || 0), 0);
    const totalGanancias = filteredRows.reduce((sum, row) => sum + Number(row.ganancia || 0), 0);
    const totalRebajas = filteredRows.reduce((sum, row) => sum + Number(row.rebajas || 0), 0);
    const totalDescuentos = filteredRows.reduce((sum, row) => sum + Number(row.descuentos || 0), 0);
    const productosVendidos = filteredRows.reduce((sum, row) => sum + Number(row.cantidadProductos || 0), 0);
    return {
      totalVentas,
      totalIngresos,
      totalCosto,
      totalGanancias,
      totalRebajas,
      totalDescuentos,
      productosVendidos,
      ticketPromedio: totalVentas > 0 ? totalIngresos / totalVentas : 0,
      margen: totalIngresos > 0 ? (totalGanancias / totalIngresos) * 100 : 0,
    };
  }, [filteredRows]);

  const salesByDay = useMemo(() => {
    const grouped = {};
    filteredRows.forEach((row) => {
      const key = dayKey(row.fecha);
      if (!grouped[key]) grouped[key] = { day: key, ventas: 0, ingresos: 0, ganancia: 0 };
      grouped[key].ventas += 1;
      grouped[key].ingresos += Number(row.total || 0);
      grouped[key].ganancia += Number(row.ganancia || 0);
    });
    return Object.values(grouped).sort((a, b) => a.day.localeCompare(b.day));
  }, [filteredRows]);

  const topProducts = useMemo(() => {
    const grouped = {};
    filteredRows.forEach((row) => {
      (row.items || []).forEach((item) => {
        const label = item.color ? `${item.nombre} (${item.color})` : item.nombre;
        if (!grouped[label]) grouped[label] = { name: label, cantidad: 0, total: 0 };
        grouped[label].cantidad += Number(item.cantidad || 0);
        grouped[label].total += Number(item.ingresoNeto ?? item.ingreso ?? 0);
      });
    });
    return Object.values(grouped).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filteredRows]);

  const handleMonthChange = (month) => {
    setMonthFilter(month || '');
    if (!month) {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const [year, monthPart] = String(month).split('-').map(Number);
    if (!year || !monthPart) return;
    const lastDay = new Date(year, monthPart, 0).getDate();
    setDateFrom(`${year}-${String(monthPart).padStart(2, '0')}-01`);
    setDateTo(`${year}-${String(monthPart).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  };

  const resetFilters = () => {
    setFilters({ category: 'all', type: 'all', product: 'all', payment: 'all', search: '' });
    setMonthFilter('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Ventas y rentabilidad</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Filtra por fechas, categoria, tipo, producto y metodo de pago. Los montos usan lo cobrado/neto cuando hay rebajas o pagos separados.
          </p>
        </div>

        <DateFilterBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          monthValue={monthFilter}
          onMonthChange={handleMonthChange}
          onDateFromChange={(value) => {
            setMonthFilter('');
            setDateFrom(value);
          }}
          onDateToChange={(value) => {
            setMonthFilter('');
            setDateTo(value);
          }}
          onClear={resetFilters}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Categoria</label>
              <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value, product: 'all' }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="all">Todas</option>
                {options.categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Tipo</label>
              <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, product: 'all' }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="all">Articulos e insumos</option>
                {options.types.map((type) => <option key={type} value={type}>{type === 'insumos' ? 'Insumos' : 'Articulos'}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Pago</label>
              <select value={filters.payment} onChange={(e) => setFilters((f) => ({ ...f, payment: e.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="all">Todos</option>
                {options.payments.map((method) => <option key={method} value={method}>{method === 'sin_pago' ? 'Sin especificar' : method.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Producto</label>
              <select value={filters.product} onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option value="all">Todos</option>
                {options.products.map((entry) => {
                  const [id, name] = entry.split('::');
                  const itemForOption = salesRows.flatMap((row) => row.items || []).find((item) => String(item.productoId) === id);
                  if (filters.category !== 'all' && itemForOption?.categoria !== filters.category) return null;
                  if (filters.type !== 'all' && itemForOption?.vistaProducto !== filters.type) return null;
                  return <option key={entry} value={id}>{name}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Buscar</label>
              <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Aretes, vinilo, cliente..." />
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard title="Ventas" value={loading ? '...' : filteredKpis.totalVentas} tone="info" />
          <KpiCard title="Cobrado neto" value={loading ? '...' : money(filteredKpis.totalIngresos)} tone="info" />
          <KpiCard title="Costo" value={loading ? '...' : money(filteredKpis.totalCosto)} tone="neutral" />
          <KpiCard title="Ganancia" value={loading ? '...' : money(filteredKpis.totalGanancias)} tone="success" />
          <KpiCard title="Margen" value={loading ? '...' : `${filteredKpis.margen.toFixed(2)}%`} tone="success" />
          <KpiCard title="Rebajas" value={loading ? '...' : money(filteredKpis.totalRebajas + filteredKpis.totalDescuentos)} tone="warning" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SalesChart data={salesByDay} />
          </div>
          <TopProductsCard products={topProducts} />
        </div>

        <SalesTable rows={filteredRows} />
      </div>
    </div>
  );
}
