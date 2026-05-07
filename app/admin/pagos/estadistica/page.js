
"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../../lib/SupabaseClient";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../../../../components/ui/card";
import { PieChart, Pie, Cell, Tooltip as PieTooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as LineTooltip } from "recharts";

function formatAmount(v) {
  const num = Number(v) || 0;
  return `Bs ${num.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const normalizeMetodo = (m) => {
  const map = {
    efectivo: "cash",
    tarjeta: "card",
    transferencia: "transfer",
    qr: "qr",
  };
  return map[m?.toLowerCase()] || "other";
};

const METODOS = [
  { key: "cash", label: "Efectivo", color: "#004080" },
  { key: "qr", label: "QR", color: "#4a0f0f" },
  { key: "card", label: "Tarjeta", color: "#0a7b83" },
  { key: "transfer", label: "Transferencia", color: "#7b3f00" },
  { key: "other", label: "Otro", color: "#666" },
];

export default function PagosEstadisticaPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        // Rango: últimos 30 días
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - 29);
        const startDate = start.toISOString().slice(0, 10);
        const endDate = today.toISOString().slice(0, 10);

        // Traer resumen de caja (incluye ventas y movimientos manuales)
        const { getCashSummary } = await import("../../../../services/cash.service.js");
        const summary = await getCashSummary(supabase, {
          start_date: startDate,
          end_date: endDate,
        });

        // Totales por método y tipo
        const totales = {};
        METODOS.forEach(m => {
          totales[m.key] = {
            sistema: 0,
            manual: 0,
            countSistema: 0,
            countManual: 0,
          };
        });
        (summary.sales || []).forEach(s => {
          const metodo = normalizeMetodo(s.modo_pago);
          if (totales[metodo]) {
            totales[metodo].sistema += Number(s.total || 0);
            totales[metodo].countSistema += 1;
          }
        });
        (summary.movements || []).forEach(m => {
          if (m && m.type === "income") {
            const metodo = normalizeMetodo(m.payment_method);
            if (totales[metodo]) {
              totales[metodo].manual += Number(m.amount || 0);
              totales[metodo].countManual += 1;
            }
          }
        });

        // Flujo por día
        const flujoPorDia = {};
        (summary.sales || []).forEach(s => {
          const date = s.fecha?.slice(0, 10);
          if (!date) return;
          flujoPorDia[date] = (flujoPorDia[date] || 0) + Number(s.total || 0);
        });
        (summary.movements || []).forEach(m => {
          if (m && m.type === "income") {
            const date = m.date?.slice(0, 10);
            if (!date) return;
            flujoPorDia[date] = (flujoPorDia[date] || 0) + Number(m.amount || 0);
          }
        });
        const lineData = Object.entries(flujoPorDia)
          .map(([date, total]) => ({ date, total }))
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        setStats({ totales, lineData });
      } catch (err) {
        setError("Error cargando estadísticas generales de pagos");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  // --- UI ---
  const totalGeneral = stats
    ? METODOS.reduce(
        (acc, m) => acc + (stats.totales[m.key]?.sistema || 0) + (stats.totales[m.key]?.manual || 0),
        0
      )
    : 0;

  const pieData = stats
    ? METODOS.map(m => ({
        name: m.label,
        value: (stats.totales[m.key]?.sistema || 0) + (stats.totales[m.key]?.manual || 0),
      }))
    : [];

  const topMetodo = stats
    ? METODOS.reduce(
        (max, m) => {
          const total = (stats.totales[m.key]?.sistema || 0) + (stats.totales[m.key]?.manual || 0);
          return total > max.total ? { key: m.label, total } : max;
        },
        { key: null, total: 0 }
      )
    : { key: null, total: 0 };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      {/* HEADER KPI PRINCIPAL */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, margin: 0, color: "#222" }}>{formatAmount(totalGeneral)}</h1>
        <p style={{ color: "#222", fontWeight: 500 }}>Ingresos totales (últimos 30 días)</p>
      </div>

      <Card style={{ marginBottom: 32 }}>
        <CardHeader>
          <CardTitle style={{ color: "#222" }}>Distribución por método</CardTitle>
          <CardDescription style={{ color: "#444" }}>¿Cómo se distribuyen los ingresos?</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Cargando...</div>
          ) : error ? (
            <div style={{ color: "red" }}>{error}</div>
          ) : (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={100}
                    label
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={METODOS[index].color} />
                    ))}
                  </Pie>
                  <PieTooltip formatter={v => formatAmount(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card style={{ marginBottom: 32 }}>
        <CardHeader>
          <CardTitle style={{ color: "#222" }}>Flujo de ingresos</CardTitle>
          <CardDescription style={{ color: "#444" }}>¿Cómo evolucionaron los ingresos?</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Cargando...</div>
          ) : error ? (
            <div style={{ color: "red" }}>{error}</div>
          ) : (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={stats.lineData}>
                  <XAxis dataKey="date" tick={{ fill: "#222" }} />
                  <YAxis tick={{ fill: "#222" }} />
                  <LineTooltip formatter={v => formatAmount(v)} />
                  <Line type="monotone" dataKey="total" stroke="#004080" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#222" }}>Detalle por método</CardTitle>
          <CardDescription style={{ color: "#444" }}>Desglose profesional por método de pago</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Cargando...</div>
          ) : error ? (
            <div style={{ color: "red" }}>{error}</div>
          ) : (
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 32 }}>
              {METODOS.map(m => {
                const metodoTotal = (stats.totales[m.key]?.sistema || 0) + (stats.totales[m.key]?.manual || 0);
                const porcentaje = totalGeneral ? (metodoTotal / totalGeneral) * 100 : 0;
                return (
                  <div key={m.key} style={{ minWidth: 180, flex: 1, border: "1px solid #eee", borderRadius: 12, padding: 16, background: "#fff" }}>
                    <div style={{ fontWeight: 600, color: m.color, fontSize: 18 }}>{m.label}</div>
                    <div style={{ fontSize: 22, color: m.color, fontWeight: 700 }}>{formatAmount(metodoTotal)}</div>
                    <div style={{ fontSize: 13, color: "#222" }}>Sistema: {formatAmount(stats.totales[m.key]?.sistema)} ({stats.totales[m.key]?.countSistema} pagos)</div>
                    <div style={{ fontSize: 13, color: "#222" }}>Manual: {formatAmount(stats.totales[m.key]?.manual)} ({stats.totales[m.key]?.countManual} pagos)</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{porcentaje.toFixed(1)}% del total</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* INSIGHT AUTOMÁTICO */}
      {!loading && !error && topMetodo.key && (
        <div style={{ marginTop: 20, padding: 12, background: "#f9fafb", borderRadius: 8, color: "#222" }}>
          Método dominante: <strong>{topMetodo.key}</strong>
        </div>
      )}
    </div>
  );
}