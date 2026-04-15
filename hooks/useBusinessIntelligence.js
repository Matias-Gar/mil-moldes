import { useEffect, useState } from "react";
import { supabase } from "../lib/SupabaseClient";

const COSTOS_METODO = {
  cash: 0,
  qr: 0.01,
  card: 0.03,
  transfer: 0.005,
  other: 0,
};

const normalizeMetodo = (m) => {
  const map = {
    efectivo: "cash",
    tarjeta: "card",
    transferencia: "transfer",
    qr: "qr",
  };
  return map[m?.toLowerCase()] || "other";
};

export function useBusinessIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBI();
  }, []);

  async function fetchBI() {
    setLoading(true);

    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 29);

    const { data: ventas } = await supabase
      .from("ventas")
      .select("*")
      .gte("fecha", start.toISOString())
      .lte("fecha", today.toISOString());

    const { data: movimientos } = await supabase
      .from("cash_movements")
      .select("*")
      .gte("date", start.toISOString())
      .lte("date", today.toISOString());

    // =========================
    // 🔢 AGRUPACIÓN BASE
    // =========================
    const metodos = {};
    const flujo = {};
    let totalGeneral = 0;
    let totalNeto = 0;
    let totalPagos = 0;

    ventas?.forEach(v => {
      const metodo = normalizeMetodo(v.modo_pago);
      const monto = Number(v.total || 0);

      if (!metodos[metodo]) {
        metodos[metodo] = { total: 0, count: 0 };
      }

      metodos[metodo].total += monto;
      metodos[metodo].count += 1;

      totalGeneral += monto;
      totalPagos++;

      // neto
      totalNeto += monto * (1 - COSTOS_METODO[metodo]);

      const d = v.fecha.slice(0, 10);
      flujo[d] = (flujo[d] || 0) + monto;
    });

    movimientos?.filter(m => m.type === "income").forEach(m => {
      const metodo = normalizeMetodo(m.payment_method);
      const monto = Number(m.amount || 0);

      totalGeneral += monto;
      totalNeto += monto * (1 - COSTOS_METODO[metodo]);

      const d = m.date.slice(0, 10);
      flujo[d] = (flujo[d] || 0) + monto;
    });

    // =========================
    // 📊 MÉTRICAS CLAVE
    // =========================

    const ticketPromedio = totalGeneral / (totalPagos || 1);

    // método dominante
    let topMetodo = { key: null, total: 0 };
    Object.entries(metodos).forEach(([k, v]) => {
      if (v.total > topMetodo.total) {
        topMetodo = { key: k, total: v.total };
      }
    });

    const dependencia = topMetodo.total / (totalGeneral || 1);

    // días sin ventas
    let diasSinVentas = 0;
    Object.values(flujo).forEach(v => {
      if (v === 0) diasSinVentas++;
    });

    // promedio diario
    const dias = Object.keys(flujo).length;
    const flujoDiario = totalGeneral / (dias || 1);

    // volatilidad simple
    const valores = Object.values(flujo);
    const promedio = flujoDiario;

    const varianza =
      valores.reduce((acc, v) => acc + Math.pow(v - promedio, 2), 0) /
      (valores.length || 1);

    const volatilidad = Math.sqrt(varianza);

    // predicción simple
    const ultimos7 = valores.slice(-7);
    const prediccion =
      ultimos7.reduce((a, b) => a + b, 0) / (ultimos7.length || 1);

    // =========================
    // 🧠 INSIGHTS AUTOMÁTICOS
    // =========================

    const insights = [];

    if (dependencia > 0.7) {
      insights.push("Alta dependencia de un solo método de pago.");
    }

    if (ticketPromedio < 50) {
      insights.push("Ticket promedio bajo: negocio basado en volumen.");
    }

    if (volatilidad > flujoDiario * 0.5) {
      insights.push("Ingresos inestables (alta volatilidad).");
    }

    if (diasSinVentas > 2) {
      insights.push("Varios días sin ventas detectados.");
    }

    if (totalNeto < totalGeneral * 0.9) {
      insights.push("Costos de pago impactan significativamente la utilidad.");
    }

    // =========================
    // 🧮 SCORE DEL NEGOCIO
    // =========================

    let score = 0;

    if (dependencia < 0.6) score += 25;
    if (ticketPromedio > 80) score += 25;
    if (diasSinVentas < 2) score += 25;
    if (volatilidad < flujoDiario * 0.3) score += 25;

    let estado = "Crítico";
    if (score > 75) estado = "Saludable";
    else if (score > 50) estado = "Estable";

    setData({
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
    });

    setLoading(false);
  }

  return { data, loading };
}
