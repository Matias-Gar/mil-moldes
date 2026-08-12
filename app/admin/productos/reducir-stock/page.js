"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/SupabaseClient";
import { useSucursalActiva } from "@/components/admin/SucursalContext";
import { showToast } from "@/components/ui/Toast";
import * as ventasService from "@/services/ventas.service";

const REASONS = [
  "Producto destinado a muestrario", "Falla de fábrica", "Producto dañado",
  "Pérdida o faltante físico", "Uso interno", "Otro",
];
const n = (value) => Number(value || 0);

function humanStock(product, base) {
  const factor = n(product.factor_conversion);
  const alt = product.unidades_alternativas?.[0];
  if (!factor || !alt) return `${base.toLocaleString("es-BO")} ${product.unidad_base || "unidad"}`;
  const closed = Math.floor(base);
  const remainder = Math.round((base - closed) * factor * 1000) / 1000;
  if (!remainder) return `${closed} ${product.unidad_base}${closed === 1 ? "" : "s"}`;
  return `${closed} ${product.unidad_base}${closed === 1 ? " cerrado" : "s cerrados"} + ${remainder} ${alt} en ${product.unidad_base} abierto`;
}

export default function ReducirStockPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState({});
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeSucursalId) return;
    (async () => {
      const { data: ps, error } = await supabase.from("productos")
        .select("user_id,nombre,categoria,codigo_barra,stock,unidad_base,unidades_alternativas,factor_conversion")
        .eq("sucursal_id", activeSucursalId).eq("archivado", false).order("nombre");
      if (error) return showToast(error.message, "error");
      const ids = (ps || []).map((p) => p.user_id);
      const { data: vs } = ids.length ? await supabase.from("producto_variantes")
        .select("id,producto_id,color,sku,stock,stock_decimal,activo").in("producto_id", ids).eq("activo", true) : { data: [] };
      setProducts(ps || []);
      setVariants((vs || []).reduce((acc, v) => ({ ...acc, [v.producto_id]: [...(acc[v.producto_id] || []), v] }), {}));
    })();
  }, [activeSucursalId]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => [p.nombre,p.categoria,p.codigo_barra,...(variants[p.user_id] || []).flatMap((v) => [v.color,v.sku])]
      .some((x) => String(x || "").toLowerCase().includes(q)));
  }, [products, variants, search]);
  const chosenVariant = (variants[selected?.user_id] || []).find((v) => String(v.id) === String(variantId));
  const current = selected ? (chosenVariant ? n(chosenVariant.stock_decimal ?? chosenVariant.stock) : n(selected.stock)) : 0;
  const selectedUnit = unit || selected?.unidad_base || "unidad";
  const factor = n(selected?.factor_conversion);
  const baseQuantity = selectedUnit === selected?.unidad_base || !factor ? n(quantity) : n(quantity) / factor;
  const after = current - baseQuantity;
  const finalReason = reason === "Otro" ? otherReason.trim() : reason;

  function prepare(product) {
    setSelected(product); setVariantId(""); setQuantity(""); setReason(""); setOtherReason("");
    setUnit(product.unidad_base || "unidad"); setConfirming(false);
  }
  function openConfirmation() {
    if ((variants[selected.user_id] || []).length && !variantId) return showToast("Selecciona una variante", "error");
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) return showToast("La cantidad debe ser mayor a cero", "error");
    if (after < 0) return showToast("No puedes retirar más que el stock disponible", "error");
    if (!finalReason || finalReason.length < 3) return showToast("El motivo es obligatorio", "error");
    setConfirming(true);
  }
  async function confirm() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await ventasService.reducirStockCompleto({
        producto_id: selected.user_id, variante_id: variantId || null, cantidad: n(quantity), unidad: selectedUnit,
        motivo: finalReason, usuario_id: user?.id, usuario_email: user?.email, sucursal_id: activeSucursalId,
        correlation_id: crypto.randomUUID(),
      });
      if (error) throw error;
      const next = n(data.stock_despues);
      if (chosenVariant) setVariants((prev) => ({ ...prev, [selected.user_id]: prev[selected.user_id].map((v) => v.id === chosenVariant.id ? { ...v, stock_decimal: next, stock: Math.floor(next) } : v) }));
      setProducts((prev) => prev.map((p) => p.user_id === selected.user_id ? { ...p, stock: n(data.producto_stock) } : p));
      showToast("Salida registrada atómicamente en auditoría"); setSelected(null); setConfirming(false);
    } catch (e) { showToast(e?.message || "No se pudo reducir el stock", "error"); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-6 p-4 text-slate-900">
    <div><h1 className="text-3xl font-bold">Reducir Stock</h1><p className="text-slate-600">Salida controlada y auditable. Disponible solo para Admin y Administración.</p></div>
    <input className="w-full rounded-xl border p-3" placeholder="Buscar nombre, categoría, código, SKU o color" value={search} onChange={(e) => setSearch(e.target.value)} />
    <div className="grid gap-3 md:grid-cols-2">{results.map((p) => <button key={p.user_id} onClick={() => prepare(p)} className="rounded-xl border bg-white p-4 text-left shadow-sm hover:border-indigo-500">
      <div className="font-bold">{p.nombre}</div><div className="text-sm text-slate-600">{p.categoria || "Sin categoría"} · Stock: {humanStock(p,n(p.stock))}</div>
      {!!(variants[p.user_id] || []).length && <div className="mt-1 text-xs text-indigo-700">{variants[p.user_id].map((v) => `${v.color}: ${humanStock(p,n(v.stock_decimal ?? v.stock))}`).join(" · ")}</div>}
    </button>)}</div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"><div className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
      <h2 className="text-xl font-bold">Preparar salida · {selected.nombre}</h2>
      {!!(variants[selected.user_id] || []).length && <select className="w-full rounded border p-3" value={variantId} onChange={(e) => setVariantId(e.target.value)}><option value="">Selecciona variante/color</option>{variants[selected.user_id].map((v) => <option key={v.id} value={v.id}>{v.color} · {humanStock(selected,n(v.stock_decimal ?? v.stock))}</option>)}</select>}
      <div className="grid grid-cols-2 gap-3"><input type="number" min="0" step="any" className="rounded border p-3" placeholder="Cantidad" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><select className="rounded border p-3" value={selectedUnit} onChange={(e) => setUnit(e.target.value)}>{[selected.unidad_base,...(selected.unidades_alternativas || [])].filter(Boolean).map((u) => <option key={u}>{u}</option>)}</select></div>
      <select className="w-full rounded border p-3" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Motivo obligatorio</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      {reason === "Otro" && <textarea className="w-full rounded border p-3" placeholder="Escribe el motivo" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />}
      <div className="rounded-xl bg-slate-100 p-4"><div>Antes: <b>{humanStock(selected,current)}</b></div><div>Después: <b>{after >= 0 ? humanStock(selected,after) : "Stock insuficiente"}</b></div>{factor > 0 && selectedUnit !== selected.unidad_base && <p className="mt-2 text-sm text-indigo-700">Se cortarán {quantity || 0} {selectedUnit} de {selected.unidad_base} de {factor} {selectedUnit}.</p>}</div>
      <div className="flex justify-end gap-2"><button className="rounded-lg border px-4 py-2" onClick={() => setSelected(null)}>Cancelar</button><button className="rounded-lg bg-red-700 px-4 py-2 font-bold text-white" onClick={openConfirmation}>Revisar salida</button></div>
    </div></div>}
    {confirming && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6"><h2 className="text-2xl font-bold text-red-800">Confirmar salida</h2><p><b>Producto:</b> {selected.nombre}</p><p><b>Variante:</b> {chosenVariant?.color || "Sin variante"}</p><p><b>Cantidad:</b> {quantity} {selectedUnit}</p><p><b>Stock actual:</b> {humanStock(selected,current)}</p><p><b>Stock resultante:</b> {humanStock(selected,after)}</p><p><b>Motivo:</b> {finalReason}</p><p className="rounded bg-amber-100 p-3 text-amber-900">Esta operación quedará permanentemente en auditoría.</p><div className="flex justify-end gap-2"><button disabled={saving} className="rounded border px-4 py-2" onClick={() => setConfirming(false)}>Cancelar</button><button disabled={saving} className="rounded bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50" onClick={confirm}>{saving ? "Procesando…" : "Confirmar salida"}</button></div></div></div>}
  </div>;
}
