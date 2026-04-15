"use client";

import React from "react";
import { useBusinessIntelligence } from "@/hooks/useBusinessIntelligence";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

function formatAmount(v) {
  const num = Number(v) || 0;
  return `Bs ${num.toLocaleString("es-BO", {
    minimumFractionDigits: 2,
  })}`;
}

const COLORS = {
  cash: "#004080",
  qr: "#4a0f0f",
  card: "#0a7b83",
  transfer: "#7b3f00",
  other: "#666",
};

export default function BusinessDashboardPro() {
  const { data, loading } = useBusinessIntelligence();

  if (loading || !data) {
    return <div style={{ padding: 24 }}>Cargando inteligencia...</div>;
  }

  const {
    totalGeneral,
    totalNeto,
    ticketPromedio,
    flujoDiario,
    volatilidad,
    prediccion,
    topMetodo,
    dependencia,
    diasSinVentas,
    metodos,
    insights,
    score,
    estado,
  } = data;

  const pieData = Object.entries(metodos).map(([k, v]) => ({
    name: k,
    value: v.total,
  }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      {/* 🔥 HEADER PRINCIPAL */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 34, margin: 0, color: "#222" }}>
          {formatAmount(totalGeneral)}
        </h1>
        <div style={{ color: "#222", fontWeight: 500 }}>Ingresos últimos 30 días</div>
        <div style={{ marginTop: 8, fontSize: 15, color: "#0a7b83", fontWeight: 600 }}>
          💰 Neto: <strong style={{ color: "#0a7b83" }}>{formatAmount(totalNeto)}</strong>
        </div>
      </div>

      {/* 🧠 SCORE */}
      <div
        style={{
          background:
            score > 75 ? "#dcfce7" : score > 50 ? "#fef9c3" : "#fee2e2",
          padding: 16,
          borderRadius: 12,
          marginBottom: 24,
        }}
      >
        <strong>Score del negocio: {score}/100</strong> — {estado}
      </div>

      {/* 📊 KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KPI title="Ticket promedio" value={formatAmount(ticketPromedio)} />
        <KPI title="Flujo diario" value={formatAmount(flujoDiario)} />
        <KPI title="Predicción mañana" value={formatAmount(prediccion)} />
        <div
          style={{
            background:
              score > 75 ? "#dcfce7" : score > 50 ? "#fef9c3" : "#fee2e2",
            padding: 16,
            borderRadius: 12,
            marginBottom: 24,
            color: "#222",
            fontWeight: 600,
          }}
        >
          <strong style={{ color: score > 75 ? "#166534" : score > 50 ? "#a16207" : "#b91c1c" }}>Score del negocio: {score}/100</strong> — <span style={{ color: score > 75 ? "#166534" : score > 50 ? "#a16207" : "#b91c1c", fontWeight: 700 }}>{estado}</span>
        </div>
        <div style={card}>
          <h3>Flujo de ingresos</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={Object.entries(data.metodos).map(([k, v]) => ({
                name: k,
                value: v.total,
              }))}
            >
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={formatAmount} />
              <Line dataKey="value" stroke="#004080" />
            </LineChart>
          </ResponsiveContainer>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {pieData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[entry.name] || "#999"} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 🧠 INSIGHTS */}
      <div style={{ marginTop: 32 }}>
        <h3>Insights inteligentes</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {insights.map((i, idx) => (
            <div key={idx} style={insightBox}>
              💡 {i}
            </div>
          ))}
        </div>
      </div>

      {/* ⚠️ ALERTAS */}
      <div style={{ marginTop: 24 }}>
        <h3>Alertas</h3>
        {dependencia > 0.7 && (
          <Alert text="Dependes demasiado de un solo método de pago" />
        )}
        {volatilidad > flujoDiario * 0.5 && (
          <Alert text="Ingresos muy inestables" />
        )}
      </div>

      {/* 🧾 DETALLE MÉTODOS */}
      <div style={{ marginTop: 24 }}>
        <h3>Detalle por método</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {Object.entries(metodos).map(([k, v]) => {
            const pct = (v.total / totalGeneral) * 100;
            return (
              <div key={k} style={methodCard}>
                <div style={{ fontWeight: 700 }}>{k.toUpperCase()}</div>
                <div>{formatAmount(v.total)}</div>
                <div style={{ fontSize: 12 }}>{pct.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ================= COMPONENTES UI =================

function KPI({ title, value, danger }) {
  return (
    <div
      style={{
        background: "#fff",
        padding: 16,
        borderRadius: 12,
        border: "1px solid #eee",
      }}
    >
      <div style={{ fontSize: 14, color: "#222", fontWeight: 500 }}>{title}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: danger ? "#b91c1c" : "#0a7b83",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Alert({ text }) {
  return (
    <div
      style={{
        background: "#fee2e2",
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
        color: "#b91c1c",
        fontWeight: 600,
      }}
    >
      ⚠️ {text}
    </div>
  );
}

// ================= STYLES =================

const card = {
  background: "#fff",
  padding: 16,
  borderRadius: 12,
  border: "1px solid #eee",
};

const insightBox = {
  background: "#fef3c7",
  padding: 10,
  borderRadius: 8,
  color: "#7b3f00",
  fontWeight: 600,
};

const methodCard = {
  border: "1px solid #eee",
  padding: 12,
  borderRadius: 10,
  minWidth: 120,
  color: "#222",
  fontWeight: 600,
};
