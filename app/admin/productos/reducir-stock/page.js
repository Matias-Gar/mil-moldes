"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/SupabaseClient";
import { useSucursalActiva } from "@/components/admin/SucursalContext";
import { showToast } from "@/components/ui/Toast";
import * as ventasService from "@/services/ventas.service";
import { fetchAllRows, fetchRowsInChunks } from "@/lib/supabasePagination";

const REASONS = ["Producto destinado a muestrario", "Falla de fábrica", "Producto dañado", "Pérdida o faltante físico", "Uso interno", "Otro"];
const n = (value) => Number(value || 0);

function categoryName(product) {
  return String(product?.categorias?.categori || product?.categoria || "Sin categoría");
}

function humanStock(product, base) {
  const factor = n(product?.factor_conversion);
  const alt = product?.unidades_alternativas?.[0];
  const unit = product?.unidad_base || "unidad";
  if (!factor || !alt) return `${Number(base || 0).toLocaleString("es-BO")} ${unit}`;
  const closed = Math.floor(base + 0.000001);
  const remainder = Math.round((base - closed) * factor * 1000) / 1000;
  if (!remainder) return `${closed} ${unit}${closed === 1 ? "" : "s"}`;
  return `${closed} ${unit}${closed === 1 ? " cerrado" : "s cerrados"} + ${remainder} ${alt}`;
}

export default function ReducirStockPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState({});
  const [images, setImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
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
    let cancelled = false;
    queueMicrotask(async () => {
      setLoading(true);
      const { data: ps, error } = await fetchAllRows((from, to) => supabase.from("productos")
        .select("user_id,nombre,categoria,codigo_barra,stock,unidad_base,unidades_alternativas,factor_conversion,categorias(categori)")
        .eq("sucursal_id", activeSucursalId).eq("archivado", false).order("nombre").order("user_id").range(from, to));
      if (cancelled) return;
      if (error) {
        showToast(error.message, "error");
        setLoading(false);
        return;
      }
      const ids = (ps || []).map((p) => p.user_id);
      const [variantsResult, imagesResult] = await Promise.all([
        fetchRowsInChunks(ids, (chunk) => supabase.from("producto_variantes").select("id,producto_id,color,sku,stock,stock_decimal,activo").in("producto_id", chunk).eq("sucursal_id", activeSucursalId).eq("activo", true)),
        fetchRowsInChunks(ids, (chunk) => supabase.from("producto_imagenes").select("producto_id,imagen_url").in("producto_id", chunk).eq("sucursal_id", activeSucursalId).order("id")),
      ]);
      if (cancelled) return;
      setProducts(ps || []);
      setVariants((variantsResult.data || []).reduce((acc, v) => {
        const key = String(v.producto_id);
        acc[key] = [...(acc[key] || []), v];
        return acc;
      }, {}));
      setImages((imagesResult.data || []).reduce((acc, image) => {
        const key = String(image.producto_id);
        if (!acc[key]) acc[key] = image.imagen_url;
        return acc;
      }, {}));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeSucursalId]);

  const categories = useMemo(() => Array.from(new Set(products.map(categoryName))).sort((a, b) => a.localeCompare(b, "es")), [products]);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory = categoryFilter === "all" || categoryName(p) === categoryFilter;
      const values = [p.nombre, categoryName(p), p.codigo_barra, ...(variants[String(p.user_id)] || []).flatMap((v) => [v.color, v.sku])];
      return matchesCategory && (!q || values.some((value) => String(value || "").toLowerCase().includes(q)));
    });
  }, [products, variants, search, categoryFilter]);

  const chosenVariant = (variants[String(selected?.user_id)] || []).find((v) => String(v.id) === String(variantId));
  const current = selected ? (chosenVariant ? n(chosenVariant.stock_decimal ?? chosenVariant.stock) : n(selected.stock)) : 0;
  const selectedUnit = unit || selected?.unidad_base || "unidad";
  const factor = n(selected?.factor_conversion);
  const baseQuantity = selectedUnit === selected?.unidad_base || !factor ? n(quantity) : n(quantity) / factor;
  const after = current - baseQuantity;
  const finalReason = reason === "Otro" ? otherReason.trim() : reason;

  function prepare(product, variant = null) {
    setSelected(product);
    setVariantId(variant ? String(variant.id) : "");
    setQuantity("");
    setReason("");
    setOtherReason("");
    setUnit(product.unidad_base || "unidad");
    setConfirming(false);
  }

  function openConfirmation() {
    if ((variants[String(selected.user_id)] || []).length && !variantId) return showToast("Selecciona una variante", "error");
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) return showToast("La cantidad debe ser mayor a cero", "error");
    if (after < -0.000001) return showToast("No puedes retirar más que el stock disponible", "error");
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
      if (chosenVariant) setVariants((prev) => ({ ...prev, [String(selected.user_id)]: prev[String(selected.user_id)].map((v) => v.id === chosenVariant.id ? { ...v, stock_decimal: next, stock: Math.floor(next) } : v) }));
      setProducts((prev) => prev.map((p) => p.user_id === selected.user_id ? { ...p, stock: n(data.producto_stock) } : p));
      showToast("Salida registrada atómicamente en auditoría");
      setSelected(null);
      setConfirming(false);
    } catch (error) {
      showToast(error?.message || "No se pudo reducir el stock", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white via-slate-50 to-gray-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-3xl font-black text-slate-900">Reducir Stock</h1>
          <p className="mt-1 text-sm text-slate-600">Salida controlada, atómica y registrada permanentemente en auditoría.</p>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow md:grid-cols-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, código o categoría" className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300">
            <option value="all">Todas las categorías</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <button type="button" onClick={() => { setSearch(""); setCategoryFilter("all"); }} className="h-10 rounded-md border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">Limpiar filtros</button>
        </section>

        <div className="mb-4 text-sm text-slate-600">Mostrando {results.length} producto(s)</div>
        {loading ? <div className="rounded-xl bg-white p-8 text-center text-slate-600 shadow">Cargando productos...</div> : results.length === 0 ? <div className="rounded-xl bg-white p-8 text-center text-slate-600 shadow">No hay productos para mostrar.</div> : (
          <div className="space-y-4">
            {results.map((product) => {
              const pid = String(product.user_id);
              const productVariants = variants[pid] || [];
              return <article key={pid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">{images[pid] ? <img src={images[pid]} alt={product.nombre} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">IMG</div>}</div>
                    <div><h2 className="text-lg font-bold text-slate-900">{product.nombre}</h2><p className="text-xs text-slate-500">ID: {product.user_id} | Categoría: {categoryName(product)} | Código: {product.codigo_barra || "-"}</p></div>
                  </div>
                  <div className="rounded-xl bg-slate-100 px-3 py-2 text-right text-sm font-semibold text-slate-700">Stock actual: {humanStock(product, n(product.stock))}</div>
                </div>
                {productVariants.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-slate-600"><th className="py-2 text-left">Color</th><th className="py-2 text-center">Stock actual</th><th className="py-2 text-right">Acciones</th></tr></thead><tbody>{productVariants.map((variant) => <tr key={variant.id} className="border-b border-slate-100"><td className="py-2 font-medium text-slate-800">{variant.color || "Único"}</td><td className="py-2 text-center font-semibold text-slate-700">{humanStock(product, n(variant.stock_decimal ?? variant.stock))}</td><td className="py-2 text-right"><button type="button" disabled={n(variant.stock_decimal ?? variant.stock) <= 0} onClick={() => prepare(product, variant)} className="rounded-md bg-red-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:bg-slate-300">Reducir stock</button></td></tr>)}</tbody></table></div> : <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">Producto único (sin colores). Retira stock directamente.</p><button type="button" disabled={n(product.stock) <= 0} onClick={() => prepare(product)} className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:bg-slate-300">Reducir stock</button></div>}
              </article>;
            })}
          </div>
        )}
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"><div className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-bold">Preparar salida · {selected.nombre}</h2>{(variants[String(selected.user_id)] || []).length > 0 && <select className="w-full rounded border p-3" value={variantId} onChange={(e) => setVariantId(e.target.value)}><option value="">Selecciona variante/color</option>{variants[String(selected.user_id)].map((v) => <option key={v.id} value={v.id}>{v.color} · {humanStock(selected, n(v.stock_decimal ?? v.stock))}</option>)}</select>}<div className="grid grid-cols-2 gap-3"><input type="number" min="0" step="any" className="rounded border p-3" placeholder="Cantidad" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><select className="rounded border p-3" value={selectedUnit} onChange={(e) => setUnit(e.target.value)}>{[selected.unidad_base, ...(selected.unidades_alternativas || [])].filter(Boolean).map((u) => <option key={u}>{u}</option>)}</select></div><select className="w-full rounded border p-3" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Motivo obligatorio</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>{reason === "Otro" && <textarea className="w-full rounded border p-3" placeholder="Escribe el motivo" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />}<div className="rounded-xl bg-slate-100 p-4"><div>Antes: <b>{humanStock(selected, current)}</b></div><div>Después: <b>{after >= 0 ? humanStock(selected, after) : "Stock insuficiente"}</b></div></div><div className="flex justify-end gap-2"><button className="rounded-lg border px-4 py-2" onClick={() => setSelected(null)}>Cancelar</button><button className="rounded-lg bg-red-700 px-4 py-2 font-bold text-white" onClick={openConfirmation}>Revisar salida</button></div></div></div>}
      {confirming && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6"><h2 className="text-2xl font-bold text-red-800">Confirmar salida</h2><p><b>Producto:</b> {selected.nombre}</p><p><b>Variante:</b> {chosenVariant?.color || "Sin variante"}</p><p><b>Cantidad:</b> {quantity} {selectedUnit}</p><p><b>Stock actual:</b> {humanStock(selected, current)}</p><p><b>Stock resultante:</b> {humanStock(selected, after)}</p><p><b>Motivo:</b> {finalReason}</p><p className="rounded bg-amber-100 p-3 text-amber-900">Esta operación quedará permanentemente en auditoría.</p><div className="flex justify-end gap-2"><button disabled={saving} className="rounded border px-4 py-2" onClick={() => setConfirming(false)}>Cancelar</button><button disabled={saving} className="rounded bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50" onClick={confirm}>{saving ? "Procesando..." : "Confirmar salida"}</button></div></div></div>}
    </div>
  );
}
