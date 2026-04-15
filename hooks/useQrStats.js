
import { useState, useEffect } from "react";
import { supabase } from "../lib/SupabaseClient";

export function useQrStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [prevChartData, setPrevChartData] = useState([]);
  const [growth, setGrowth] = useState(null);
  const [insight, setInsight] = useState("");
  const [kpis, setKpis] = useState(null);
  const [diasSinVentas, setDiasSinVentas] = useState(0);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        // Fechas actuales
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - 29);
        const startDate = start.toISOString().slice(0, 10);
        const endDate = today.toISOString().slice(0, 10);

        // Fechas anteriores
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 30);
        const prevStartDate = prevStart.toISOString().slice(0, 10);
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevEndDate = prevEnd.toISOString().slice(0, 10);

        const { getCashSummary } = await import("../services/cash.service.js");
        // Actual
        const summary = await getCashSummary(supabase, {
          start_date: startDate,
          end_date: endDate,
        });
        // Anterior
        const prevSummary = await getCashSummary(supabase, {
          start_date: prevStartDate,
          end_date: prevEndDate,
        });

        // QR actual
        const pagosSistema = (summary.sales || []).filter(s => s.modo_pago && s.modo_pago.toLowerCase() === "qr");
        const pagosManual = (summary.movements || []).filter(m => m.payment_method === "qr" && m.type === "income");
        const totalSistema = pagosSistema.reduce((acc, s) => acc + Number(s.total || 0), 0);
        const totalManual = pagosManual.reduce((acc, m) => acc + Number(m.amount || 0), 0);
        const countSistema = pagosSistema.length;
        const countManual = pagosManual.length;
        const total = totalSistema + totalManual;
        const allPagos = [...pagosSistema, ...pagosManual];
        const totalPagos = countSistema + countManual;
        const promedio = totalPagos > 0 ? total / totalPagos : 0;
        const maximo = allPagos.length > 0 ? Math.max(...allPagos.map(p => Number(p.total || p.amount || 0))) : 0;
        const minimo = allPagos.length > 0 ? Math.min(...allPagos.map(p => Number(p.total || p.amount || 0))) : 0;
        const pctSistema = total > 0 ? (totalSistema / total) * 100 : 0;
        const pctManual = total > 0 ? (totalManual / total) * 100 : 0;

        // QR anterior
        const prevPagosSistema = (prevSummary.sales || []).filter(s => s.modo_pago && s.modo_pago.toLowerCase() === "qr");
        const prevPagosManual = (prevSummary.movements || []).filter(m => m.payment_method === "qr" && m.type === "income");
        const prevTotal = prevPagosSistema.reduce((acc, s) => acc + Number(s.total || 0), 0) + prevPagosManual.reduce((acc, m) => acc + Number(m.amount || 0), 0);

        // Crecimiento
        let growth = null;
        if (prevTotal > 0) {
          growth = ((total - prevTotal) / prevTotal) * 100;
        } else if (total > 0) {
          growth = 100;
        } else {
          growth = 0;
        }
        setGrowth(growth);

        // KPIs avanzados
        setKpis({
          total,
          promedio,
          maximo,
          minimo,
          pctSistema,
          pctManual,
          totalSistema,
          totalManual,
          countSistema,
          countManual,
          flujoDiario: total / 30,
        });

        setStats({ totalSistema, totalManual, countSistema, countManual, total });

        // Insight avanzado
        let insightText = "Rendimiento estable";
        if (growth < 0) {
          insightText = "Tus ingresos por QR están bajando. Revisa promociones o incentivos.";
        } else if (totalManual > totalSistema) {
          insightText = "La mayoría de pagos son manuales. Considera incentivar QR automático.";
        } else if (promedio < 50 && totalPagos > 0) {
          insightText = "Ticket promedio QR bajo. Analiza promociones o combos.";
        } else if (total > 500) {
          insightText = "El sistema QR está funcionando bien y dominando las ventas.";
        }
        setInsight(insightText);

        // Tabla avanzada: pagos recientes (ordenados por monto)
        const pagosRecientes = [
          ...pagosSistema.map(s => ({
            id: `venta-${s.id}`,
            fecha: s.fecha,
            tipo: "Sistema",
            monto: Number(s.total),
            ref: s.id,
            descripcion: `Venta #${s.id}`,
          })),
          ...pagosManual.map(m => ({
            id: `manual-${m.id}`,
            fecha: m.date,
            tipo: "Manual",
            monto: Number(m.amount),
            ref: m.id,
            descripcion: m.description || "Ingreso manual QR",
          })),
        ].sort((a, b) => b.monto - a.monto).slice(0, 20);
        setRows(pagosRecientes);

        // Gráfico: ingresos por día (actual)
        const ingresosPorDia = {};
        for (let i = 0; i < 30; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          ingresosPorDia[key] = 0;
        }
        pagosSistema.forEach(s => {
          const key = String(s.fecha).slice(0, 10);
          if (ingresosPorDia[key] !== undefined) ingresosPorDia[key] += Number(s.total || 0);
        });
        pagosManual.forEach(m => {
          const key = String(m.date).slice(0, 10);
          if (ingresosPorDia[key] !== undefined) ingresosPorDia[key] += Number(m.amount || 0);
        });
        const chartArr = Object.entries(ingresosPorDia).map(([date, value]) => ({ date, value }));
        setChartData(chartArr);

        // Gráfico: ingresos por día (periodo anterior)
        const prevIngresosPorDia = {};
        for (let i = 0; i < 30; i++) {
          const d = new Date(prevStart);
          d.setDate(d.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          prevIngresosPorDia[key] = 0;
        }
        prevPagosSistema.forEach(s => {
          const key = String(s.fecha).slice(0, 10);
          if (prevIngresosPorDia[key] !== undefined) prevIngresosPorDia[key] += Number(s.total || 0);
        });
        prevPagosManual.forEach(m => {
          const key = String(m.date).slice(0, 10);
          if (prevIngresosPorDia[key] !== undefined) prevIngresosPorDia[key] += Number(m.amount || 0);
        });
        const prevChartArr = Object.entries(prevIngresosPorDia).map(([date, value]) => ({ date, value }));
        setPrevChartData(prevChartArr);

        // Días sin ventas
        const diasSin = chartArr.filter(d => d.value === 0).length;
        setDiasSinVentas(diasSin);

      } catch (err) {
        console.error(err);
        setError(err.message || "Error cargando datos");
        setInsight("");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return { loading, error, stats, rows, chartData, prevChartData, growth, insight, kpis, diasSinVentas };
}
