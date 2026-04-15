"use client";


import React from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../../../../components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useMetodoStats } from "../../../../hooks/useMetodoStats";

function formatAmount(v) {
  const num = Number(v) || 0;
  return `Bs ${num.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PagosEfectivoPage() {
  const { loading, error, stats, rows, chartData, prevChartData, growth, insight, kpis, diasSinVentas } = useMetodoStats("cash", "Efectivo", ["efectivo", "cash"]);
  const total = kpis?.total || 0;

  return (
    <div style={{ maxWidth: 950, margin: "0 auto", padding: 24 }}>
      {/* KPIs en grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px #eee" }}>
          <div style={{ fontSize: 15, color: "#888" }}>Total Efectivo</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#4a0f0f" }}>{formatAmount(kpis?.total)}</div>
          <div style={{ fontSize: 14, color: growth >= 0 ? "green" : "red", fontWeight: 600 }}>
            {growth >= 0 ? "▲" : "▼"} {Math.abs(growth || 0).toFixed(1)}% vs periodo anterior
          </div>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px #eee" }}>
          <div style={{ fontSize: 15, color: "#888" }}>Promedio por pago</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0a7b83" }}>{formatAmount(kpis?.promedio)}</div>
          <div style={{ fontSize: 13, color: "#666" }}>Máx: {formatAmount(kpis?.maximo)} | Mín: {formatAmount(kpis?.minimo)}</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px #eee" }}>
          <div style={{ fontSize: 15, color: "#888" }}>% Sistema vs Manual</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: "#004080" }}>{(kpis?.pctSistema || 0).toFixed(1)}%</span> <span style={{ color: "#888" }}>|</span> <span style={{ color: "#4a0f0f" }}>{(kpis?.pctManual || 0).toFixed(1)}%</span>
          </div>
          <div style={{ fontSize: 13, color: "#666" }}>Sistema: {formatAmount(kpis?.totalSistema)} | Manual: {formatAmount(kpis?.totalManual)}</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px #eee" }}>
          <div style={{ fontSize: 15, color: "#888" }}>Flujo diario promedio</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0a7b83" }}>{formatAmount(kpis?.flujoDiario)}</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px #eee" }}>
          <div style={{ fontSize: 15, color: "#888" }}>Días sin ventas</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: diasSinVentas > 3 ? "#b91c1c" : "#004080" }}>{diasSinVentas}</div>
        </div>
      </div>

      {/* Insight automático */}
      {!loading && !error && insight && (
        <div style={{ marginBottom: 16, padding: 12, background: "#fef3c7", borderRadius: 8, fontWeight: 500, fontSize: 16, color: "#222" }}>
          💡 Insight: {insight}
        </div>
      )}

      {/* Gráfico comparativo */}
      <div style={{ width: "100%", height: 240, marginBottom: 32, background: "#f9fafb", borderRadius: 12, padding: 8 }}>
        {loading ? (
          <div style={{ width: "100%", height: 200, background: "#e5e7eb", borderRadius: 8, animation: "pulse 1.2s infinite" }} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <XAxis dataKey="date" tickFormatter={d => d.slice(5)} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={40} />
              <Tooltip formatter={formatAmount} labelFormatter={d => `Fecha: ${d}`} />
              <Legend />
              <Line type="monotone" dataKey="value" name="Actual" stroke="#4a0f0f" strokeWidth={2.5} dot={false} />
              {prevChartData && prevChartData.length > 0 && (
                <Line type="monotone" dataKey="value" name="Anterior" data={prevChartData} stroke="#bbb" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pagos recientes (Efectivo)</CardTitle>
          <CardDescription>Ordenados por monto. Filtros rápidos próximamente.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>
              <div style={{ height: 32, background: "#e5e7eb", borderRadius: 6, marginBottom: 16, animation: "pulse 1.2s infinite" }} />
              <div style={{ height: 32, background: "#e5e7eb", borderRadius: 6, marginBottom: 16, animation: "pulse 1.2s infinite" }} />
              <div style={{ height: 32, background: "#e5e7eb", borderRadius: 6, marginBottom: 16, animation: "pulse 1.2s infinite" }} />
            </div>
          ) : error ? (
            <div style={{ color: "red" }}>{error}</div>
          ) : !rows.length ? (
            <div>No hay pagos en efectivo en este periodo</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th style={{ textAlign: "left", padding: 6, color: "#222", fontWeight: 700 }}>Fecha</th>
                    <th style={{ textAlign: "left", padding: 6, color: "#222", fontWeight: 700 }}>Origen</th>
                    <th style={{ textAlign: "left", padding: 6, color: "#222", fontWeight: 700 }}>Descripción</th>
                    <th style={{ textAlign: "right", padding: 6, color: "#222", fontWeight: 700 }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} style={{ cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ padding: 6, color: "#222", fontWeight: 500 }}>{r.fecha ? String(r.fecha).slice(0, 10) : "-"}</td>
                      <td style={{ padding: 6 }}>
                        <span style={{ background: r.tipo === "Sistema" ? "#dbeafe" : "#fee2e2", padding: "2px 6px", borderRadius: 6, color: r.tipo === "Sistema" ? "#004080" : "#b91c1c", fontWeight: 700, fontSize: 15 }}>
                          {r.tipo}
                        </span>
                      </td>
                      <td style={{ padding: 6, color: "#222", fontWeight: 500 }}>{r.descripcion}</td>
                      <td style={{ padding: 6, textAlign: "right", fontWeight: "bold", color: r.monto > 80 ? "green" : "#111" }}>{formatAmount(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
