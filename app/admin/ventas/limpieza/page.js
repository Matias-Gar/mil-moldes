"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/SupabaseClient";
import { showToast } from "../../../../components/ui/Toast";
import * as ventasService from "../../../../services/ventas.service";
import { useSucursalActiva } from "../../../../components/admin/SucursalContext";

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("es-BO");
  } catch {
    return String(value);
  }
}

function money(value) {
  return `Bs ${(Number(value) || 0).toFixed(2)}`;
}

function isSuspiciousSale(sale) {
  const detailsCount = Number(sale.detalles_count || 0);
  const estado = String(sale.estado || "").toLowerCase();
  return (
    detailsCount === 0 ||
    Boolean(sale.error_message) ||
    ["fallida", "error", "pendiente", "anulada", "rollback"].includes(estado)
  );
}

export default function LimpiezaVentasPage() {
  const router = useRouter();
  const { activeSucursalId } = useSucursalActiva();
  const [sessionUser, setSessionUser] = useState(null);
  const [role, setRole] = useState("");
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [target, setTarget] = useState(null);
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [motivo, setMotivo] = useState("");

  const loadVentas = useCallback(async () => {
    setLoading(true);
    try {
      let ventasQuery = supabase
        .from("ventas")
        .select("id, cliente_nombre, cliente_telefono, total, fecha, estado, modo_pago, usuario_email, error_message, costos_extra")
        .order("fecha", { ascending: false })
        .limit(300);
      if (activeSucursalId) ventasQuery = ventasQuery.eq("sucursal_id", activeSucursalId);
      const { data: ventasData, error: ventasError } = await ventasQuery;
      if (ventasError) throw ventasError;

      const ids = (ventasData || []).map((v) => v.id);
      const scopeSucursal = (query) => activeSucursalId ? query.eq("sucursal_id", activeSucursalId) : query;
      const [detallesRes, pagosRes, movimientosRes] = await Promise.all([
        ids.length
          ? scopeSucursal(supabase.from("ventas_detalle").select("id, venta_id").in("venta_id", ids))
          : Promise.resolve({ data: [] }),
        ids.length
          ? scopeSucursal(supabase.from("ventas_pagos").select("id, venta_id").in("venta_id", ids))
          : Promise.resolve({ data: [] }),
        ids.length
          ? scopeSucursal(supabase.from("stock_movimientos").select("id, venta_id, observaciones").in("venta_id", ids))
          : Promise.resolve({ data: [] }),
      ]);
      if (detallesRes.error) throw detallesRes.error;
      if (pagosRes.error) throw pagosRes.error;
      if (movimientosRes.error) throw movimientosRes.error;

      const countBy = (rows, key = "venta_id") =>
        (rows || []).reduce((acc, row) => {
          const id = String(row[key] || "");
          if (!id) return acc;
          acc[id] = (acc[id] || 0) + 1;
          return acc;
        }, {});
      const detalleCounts = countBy(detallesRes.data);
      const pagoCounts = countBy(pagosRes.data);
      const movimientoCounts = countBy(movimientosRes.data);

      setVentas((ventasData || []).map((v) => ({
        ...v,
        detalles_count: detalleCounts[String(v.id)] || 0,
        pagos_count: pagoCounts[String(v.id)] || 0,
        movimientos_count: movimientoCounts[String(v.id)] || 0,
      })));
    } catch (error) {
      showToast(`No se pudo cargar ventas: ${error.message || error}`, "error");
    } finally {
      setLoading(false);
    }
  }, [activeSucursalId]);

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user || null;
      setSessionUser(user);
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
      const userRole = String(profile?.rol || "").toLowerCase();
      setRole(userRole);
      if (userRole !== "admin") {
        showToast("Solo el administrador puede acceder a limpieza de ventas.", "error");
        router.push("/admin");
        return;
      }

      await loadVentas();
    }
    init();
  }, [loadVentas, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ventas
      .filter((sale) => showAll || isSuspiciousSale(sale))
      .filter((sale) => {
        if (!q) return true;
        return [
          sale.id,
          sale.cliente_nombre,
          sale.cliente_telefono,
          sale.estado,
          sale.usuario_email,
          sale.error_message,
        ].some((value) => String(value || "").toLowerCase().includes(q));
      });
  }, [ventas, search, showAll]);

  const openDelete = (sale) => {
    setTarget(sale);
    setPassword("");
    setPhrase("");
    setMotivo("");
  };

  const closeDelete = () => {
    if (deleting) return;
    setTarget(null);
    setPassword("");
    setPhrase("");
    setMotivo("");
  };

  const deleteSale = async () => {
    if (!target || !sessionUser?.email) return;
    const expected = `ELIMINAR ${target.id}`;
    if (phrase.trim() !== expected) {
      showToast(`Escribe exactamente: ${expected}`, "error");
      return;
    }
    if (!password) {
      showToast("Ingresa tu contraseña de administrador.", "error");
      return;
    }
    if (motivo.trim().length < 8) {
      showToast("Escribe un motivo claro para devolver stock y eliminar la venta.", "error");
      return;
    }

    setDeleting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: sessionUser.email,
        password,
      });
      if (authError) throw new Error("Contraseña incorrecta o sesión inválida.");

      const saleId = target.id;
      const { data, error: deleteError } = await ventasService.eliminarVentaConRestock({
        venta_id: saleId,
        admin_id: sessionUser.id,
        admin_email: sessionUser.email,
        motivo: motivo.trim(),
      });
      if (deleteError) {
        if (String(deleteError.message || "").includes("eliminar_venta_con_restock")) {
          throw new Error("Falta ejecutar el SQL actualizado de harden_sales_stock_flow.sql en Supabase.");
        }
        throw deleteError;
      }

      const restoredRows = Number(data?.stock_restored_rows || 0);
      showToast(`Venta #${saleId} eliminada y stock restaurado (${restoredRows} movimiento${restoredRows === 1 ? "" : "s"}).`, "success");
      closeDelete();
      await loadVentas();
    } catch (error) {
      showToast(`No se pudo eliminar: ${error.message || error}`, "error");
    } finally {
      setDeleting(false);
    }
  };

  if (role && role !== "admin") return null;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-slate-900">
          <h1 className="text-2xl font-black">Limpieza de ventas</h1>
          <p className="mt-1 text-sm font-semibold text-amber-800">
            Herramienta exclusiva de administrador. Sirve para eliminar ventas fallidas y tambien ventas reales
            cuando el cliente cambia la compra: primero devuelve stock y despues elimina la venta.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, cliente, estado, usuario o error"
            className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-slate-900"
          />
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Mostrar tambien ventas reales
          </label>
          <button
            onClick={loadVentas}
            disabled={loading}
            className="rounded bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-60"
          >
            Actualizar
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2">Pagos</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Accion</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No hay ventas para mostrar.</td></tr>
              ) : filtered.map((sale) => {
                const suspicious = isSuspiciousSale(sale);
                const reason = [
                  Number(sale.detalles_count) === 0 ? "Sin detalle" : null,
                  sale.error_message ? "Con error" : null,
                  ["fallida", "error", "pendiente", "anulada", "rollback"].includes(String(sale.estado || "").toLowerCase()) ? `Estado ${sale.estado}` : null,
                ].filter(Boolean).join(", ") || "Venta normal";
                return (
                  <tr key={sale.id} className={suspicious ? "border-b bg-rose-50" : "border-b"}>
                    <td className="px-3 py-2 font-black">#{sale.id}</td>
                    <td className="px-3 py-2">{formatDate(sale.fecha)}</td>
                    <td className="px-3 py-2">{sale.cliente_nombre || "Consumidor final"}</td>
                    <td className="px-3 py-2">{sale.estado || "-"}</td>
                    <td className="px-3 py-2 font-bold">{money(sale.total)}</td>
                    <td className="px-3 py-2">{sale.detalles_count}</td>
                    <td className="px-3 py-2">{sale.pagos_count}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={sale.error_message || reason}>
                      {sale.error_message || reason}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => openDelete(sale)}
                        className={`rounded px-3 py-1 font-bold text-white ${suspicious ? "bg-red-700 hover:bg-red-800" : "bg-amber-600 hover:bg-amber-700"}`}
                      >
                        Devolver y eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {target && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 text-slate-900 shadow-2xl">
            <h2 className="text-xl font-black text-red-700">Eliminar venta y devolver stock</h2>
            <p className="mt-2 text-sm">
              Vas a eliminar la venta <b>#{target.id}</b>. Primero se devolvera el stock de sus productos y despues se borraran pagos, detalle, caja y la venta.
            </p>
            <p className="mt-2 rounded bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Usala cuando el cliente cambio la compra despues de efectivizar. Si algo falla, la base de datos revierte todo y no deja el inventario a medias.
            </p>
            <label className="mt-4 block text-sm font-bold">Motivo</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Cliente cambio productos antes de salir, se elimina venta para hacer una nueva."
              className="mt-1 min-h-20 w-full rounded border border-slate-300 px-3 py-2"
            />
            <label className="mt-4 block text-sm font-bold">Escribe ELIMINAR {target.id}</label>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
            <label className="mt-4 block text-sm font-bold">Contrasena del administrador actual</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={closeDelete} disabled={deleting} className="rounded bg-slate-200 px-4 py-2 font-bold">
                Cancelar
              </button>
              <button onClick={deleteSale} disabled={deleting} className="rounded bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-60">
                {deleting ? "Restaurando y eliminando..." : "Devolver stock y eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
