"use client";

import { useState } from 'react';
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

export default function TodasVentasPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [monthFilter, setMonthFilter] = useState('');

  const {
    loading,
    error,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    kpis,
    salesRows,
    salesByDay,
    topProducts,
  } = useVentasDashboard(activeSucursalId);

  const handleMonthChange = (month) => {
    setMonthFilter(month || '');

    if (!month) {
      setDateFrom('');
      setDateTo('');
      return;
    }

    const [year, monthPart] = String(month).split('-').map(Number);
    if (!year || !monthPart) return;

    const from = `${year}-${String(monthPart).padStart(2, '0')}-01`;
    const lastDay = new Date(year, monthPart, 0).getDate();
    const to = `${year}-${String(monthPart).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    setDateFrom(from);
    setDateTo(to);
  };

  const handleDateFromChange = (value) => {
    setMonthFilter('');
    setDateFrom(value);
  };

  const handleDateToChange = (value) => {
    setMonthFilter('');
    setDateTo(value);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#e0f2fe,_#f8fafc_42%,_#f1f5f9_78%)] p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <DateFilterBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          monthValue={monthFilter}
          onMonthChange={handleMonthChange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onClear={() => {
            setMonthFilter('');
            setDateFrom('');
            setDateTo('');
          }}
        />

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            ❌ {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard title="Total ventas" value={loading ? '...' : kpis.totalVentas} tone="info" />
          <KpiCard title="Total ganancias" value={loading ? '...' : money(kpis.totalGanancias)} tone="success" />
          <KpiCard title="Total descuentos" value={loading ? '...' : money(kpis.totalDescuentos)} tone="warning" />
          <KpiCard title="Ticket promedio" value={loading ? '...' : money(kpis.ticketPromedio)} tone="neutral" />
          <KpiCard title="Productos vendidos" value={loading ? '...' : kpis.productosVendidos} tone="info" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SalesChart data={salesByDay} />
          </div>
          <TopProductsCard products={topProducts} />
        </div>

        <SalesTable rows={salesRows} />
      </div>
    </div>
  );
}
