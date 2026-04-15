"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/SupabaseClient";

import Toast, { showToast } from '../../../../components/ui/Toast';


import { registrarMovimientoStock } from "@/lib/stockMovimientos";
import { registrarHistorialProducto } from "@/lib/productosHistorial";
import { sincronizarStockProducto } from "@/lib/utils";

export default function AumentarStockPage() {
  const QZ_PRINTER_NAME = "POS-80C";
  const ENABLE_QZ_DIRECT_LABEL_PRINT = true;

  const [productos, setProductos] = useState([]);
  const [variantesByProducto, setVariantesByProducto] = useState({});
  const [imagenPrincipalByProducto, setImagenPrincipalByProducto] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [increments, setIncrements] = useState({});
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    fetchData();
  }, []);

  const loadQzTray = () =>
    new Promise((resolve, reject) => {
      if (!ENABLE_QZ_DIRECT_LABEL_PRINT) {
        reject(new Error("QZ Tray desactivado"));
        return;
      }

      if (window.qz) {
        resolve(window.qz);
        return;
      }

      const existing = document.getElementById("qz-tray-script");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.qz));
        existing.addEventListener("error", () => reject(new Error("No se pudo cargar QZ Tray.")));
        return;
      }
      // Ya no se carga por CDN, solo se usa window.qz global
      reject(new Error("QZ Tray no está disponible"));
    });

  const ensureQzConnection = async () => {
    const qz = await loadQzTray();
    if (!qz) throw new Error("QZ Tray no disponible");

    if (qz.security) {
      qz.security.setCertificatePromise((resolve) => resolve(null));
      qz.security.setSignaturePromise(() => (resolve) => resolve(""));
    }

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({ retries: 1, delay: 0 });
    }

    return qz;
  };

  // QZ se verifica solo al momento de imprimir para evitar ruido visual al entrar.

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getBarcodeImageUrl(code) {
    return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(String(code || ""))}&scale=2&height=10&includetext=true`;
  }

  async function printLabels({ code, label, copies }) {
    const safeCode = String(code || "").trim();
    const safeLabel = String(label || "").trim();
    const safeCopies = Number(copies || 0);

    if (!safeCode || safeCopies <= 0) {
      showToast("No hay datos para imprimir etiquetas", "info");
      return;
    }

    const barcodeUrl = getBarcodeImageUrl(safeCode);
    const buildSingleLabelHtml = () => `
      <html>
        <head>
          <style>
            @page { size: 70mm 22mm; margin: 0; }
            html, body { margin: 0; padding: 0; width: 70mm; height: 22mm; font-family: Arial, sans-serif; }
            .label { width: 70mm; height: 22mm; box-sizing: border-box; border: 1px solid #000; display: flex; }
            .left { width: 48mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            .left img { width: 100%; max-height: 12mm; object-fit: contain; }
            .code { font-size: 8pt; line-height: 1; }
            .right { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 8pt; padding: 1mm; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="left">
              <img src="${barcodeUrl}" alt="${escapeHtml(safeCode)}" />
              <div class="code">${escapeHtml(safeCode)}</div>
            </div>
            <div class="right">${escapeHtml(safeLabel)}</div>
          </div>
        </body>
      </html>
    `;

    const labelHtml = buildSingleLabelHtml();

    if (ENABLE_QZ_DIRECT_LABEL_PRINT) {
      try {
        const qz = await ensureQzConnection();
        const printer = await qz.printers.find(QZ_PRINTER_NAME);
        if (!printer) throw new Error(`No se encontró la impresora ${QZ_PRINTER_NAME}.`);

        const config = qz.configs.create(printer);
        for (let i = 0; i < safeCopies; i++) {
          await qz.print(config, [{
            type: "pixel",
            format: "html",
            flavor: "plain",
            data: labelHtml,
          }]);
          if (i < safeCopies - 1) {
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
        }

        showToast(`Etiquetas enviadas por QZ Tray (${safeCopies})`);
        return;
      } catch (err) {
        console.warn("QZ Tray no disponible, se usa impresión del navegador:", err);
      }
    }

    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) {
      showToast("El navegador bloqueó la ventana de impresión", "error");
      return;
    }

    const labelsHtml = Array.from({ length: safeCopies })
      .map(() => `
        <div class="label">
          <div class="title">${escapeHtml(safeLabel)}</div>
          <img src="${barcodeUrl}" alt="${escapeHtml(safeCode)}" />
          <div class="code">${escapeHtml(safeCode)}</div>
        </div>
      `)
      .join("");

    popup.document.write(`
      <html>
        <head>
          <title>Etiquetas - ${escapeHtml(safeLabel)}</title>
          <style>
            @page { size: auto; margin: 8mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
              gap: 10px;
              padding: 10px;
            }
            .label {
              border: 1px solid #d1d5db;
              border-radius: 8px;
              padding: 8px;
              text-align: center;
              break-inside: avoid;
            }
            .title {
              font-size: 12px;
              font-weight: bold;
              color: #111827;
              margin-bottom: 6px;
              min-height: 28px;
            }
            img {
              width: 100%;
              max-height: 78px;
              object-fit: contain;
            }
            .code {
              margin-top: 4px;
              font-size: 11px;
              color: #374151;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="grid">${labelsHtml}</div>
          <script>
            window.onload = function () { window.print(); };
          </script>
        </body>
      </html>
    `);
    popup.document.close();
  }

  async function fetchData() {
    setLoading(true);

    const { data: prods, error: prodsError } = await supabase
      .from("productos")
      .select(`
        user_id,
        nombre,
        stock,
        codigo_barra,
        category_id,
        categorias (categori)
      `)
      .order("nombre", { ascending: true })
      .limit(1200);

    if (prodsError) {
      console.error("Error cargando productos:", prodsError);
      showToast("No se pudieron cargar productos", "error");
      setLoading(false);
      return;
    }

    const productosData = prods || [];
    setProductos(productosData);

    const productIds = productosData.map((p) => p.user_id).filter(Boolean);

    // Filtrar y convertir a número solo IDs válidos antes de consultar variantes
    const validProductIds = productIds
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0);

    // Limitar la cantidad de IDs por petición para evitar error 400
    const CHUNK_SIZE = 80;
    let allVars = [];
    if (validProductIds.length > 0) {
      for (let i = 0; i < validProductIds.length; i += CHUNK_SIZE) {
        const chunk = validProductIds.slice(i, i + CHUNK_SIZE);
        let vars = [];
        const withActive = await supabase
          .from("producto_variantes")
          .select("id, producto_id, color, stock, activo, codigo_barra, sku")
          .in("producto_id", chunk)
          .eq("activo", true)
          .order("color", { ascending: true });
        if (withActive.error) {
          const fallbackWithoutActive = await supabase
            .from("producto_variantes")
            .select("id, producto_id, color, stock, codigo_barra, sku")
            .in("producto_id", chunk)
            .order("color", { ascending: true });
          if (fallbackWithoutActive.error) {
            const minimalFallback = await supabase
              .from("producto_variantes")
              .select("id, producto_id, color, stock")
              .in("producto_id", chunk)
              .order("color", { ascending: true });
            if (minimalFallback.error) {
              console.warn("Variantes no disponibles en este esquema:", minimalFallback.error);
              vars = [];
            } else {
              vars = (minimalFallback.data || []).map((row) => ({
                ...row,
                codigo_barra: null,
                sku: null,
              }));
            }
          } else {
            vars = fallbackWithoutActive.data;
          }
        } else {
          vars = withActive.data;
        }
        allVars = allVars.concat(vars || []);
      }
      // Agrupar resultados
      const grouped = {};
      (allVars || []).forEach((v) => {
        const pid = String(v.producto_id);
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push(v);
      });
      setVariantesByProducto(grouped);
    } else {
      setVariantesByProducto({});
    }

    setLoading(false);
  }

  function getCategoryName(prod) {
    return String(prod?.categorias?.categori || prod?.categoria || prod?.category_id || "Sin categoria");
  }

  function setIncrementValue(key, rawValue) {
    const parsed = Number(String(rawValue || "").replace(/\D/g, ""));
    const value = Number.isFinite(parsed) ? parsed : 0;
    setIncrements((prev) => ({ ...prev, [key]: value }));
  }

  async function aumentarStockProducto(prod, shouldPrint = false) {
    const pid = prod.user_id;
    const key = `p-${pid}`;
    const increaseBy = Number(increments[key] || 0);

    if (increaseBy <= 0) {
      showToast("Ingresa una cantidad mayor a 0", "info");
      return;
    }

    const currentStock = Number(prod.stock || 0);
    const newStock = currentStock + increaseBy;

    try {
      setSavingKey(key);

      const { error } = await supabase
        .from("productos")
        .update({ stock: newStock })
        .eq("user_id", pid);

      if (error) throw error;

      // Sincroniza el stock del producto como suma de variantes
      await sincronizarStockProducto(pid, supabase);

      setProductos((prev) =>
        prev.map((p) => (p.user_id === pid ? { ...p, stock: newStock } : p))
      );
      setIncrements((prev) => ({ ...prev, [key]: 0 }));

      // Registrar movimiento e historial de aumento de stock
      try {
        const user = (await supabase.auth.getUser())?.data?.user;
        // Obtener datos anteriores
        const { data: actual } = await supabase
          .from("productos")
          .select("*")
          .eq("user_id", pid)
          .single();
        const movimientoPayload = {
          producto_id: Number(pid),
          tipo: 'aumento',
          cantidad: Number(increaseBy),
          usuario_id: user?.id || null,
          usuario_email: user?.email || '',
          observaciones: 'Aumento de stock desde panel'
        };
        console.log('registrarMovimientoStock payload:', movimientoPayload);
        await registrarMovimientoStock(movimientoPayload);
        await registrarHistorialProducto({
          producto_id: pid,
          accion: "UPDATE",
          datos_anteriores: actual,
          datos_nuevos: { ...actual, stock: newStock },
          usuario_email: user?.email || null
        });
      } catch (err) {
        console.warn('No se pudo registrar movimiento/historial de aumento:', err);
      }

      if (shouldPrint) {
        const barcode = String(prod.codigo_barra || "").trim();
        if (!barcode) {
          showToast("No se puede imprimir: el producto no tiene código de barras", "error");
          return;
        }
        await printLabels({ code: barcode, label: prod.nombre, copies: increaseBy });
      }

      showToast(`Stock actualizado para ${prod.nombre}`);
    } catch (err) {
      console.error("Error aumentando stock de producto:", err);
      showToast("No se pudo actualizar el stock", "error");
    } finally {
      setSavingKey(null);
    }
  }

  async function aumentarStockVariante(prod, variante, shouldPrint = false) {
    const pid = prod.user_id;
    const variantId = variante.id;
    const key = `v-${variantId}`;
    const increaseBy = Number(increments[key] || 0);

    if (increaseBy <= 0) {
      showToast("Ingresa una cantidad mayor a 0", "info");
      return;
    }

    const currentVariantStock = Number(variante.stock || 0);
    const nextVariantStock = currentVariantStock + increaseBy;

    try {
      setSavingKey(key);

      const { error: variantError } = await supabase
        .from("producto_variantes")
        .update({ stock: nextVariantStock })
        .eq("id", variantId);

      if (variantError) throw variantError;


      // Sincroniza el stock del producto como suma de variantes
      await sincronizarStockProducto(pid, supabase);

      // Registrar movimiento e historial de aumento de stock para variante
      try {
        const user = (await supabase.auth.getUser())?.data?.user;
        // Obtener datos anteriores
        const { data: actual } = await supabase
          .from("productos")
          .select("*")
          .eq("user_id", pid)
          .single();
        const movimientoPayload = {
          producto_id: Number(pid),
          variante_id: Number(variantId),
          tipo: 'aumento',
          cantidad: Number(increaseBy),
          usuario_id: user?.id || null,
          usuario_email: user?.email || '',
          observaciones: `Aumento de stock en variante (${variante.color || 'Unico'}) desde panel`
        };
        console.log('registrarMovimientoStock payload:', movimientoPayload);
        await registrarMovimientoStock(movimientoPayload);
        await registrarHistorialProducto({
          producto_id: pid,
          accion: "UPDATE",
          datos_anteriores: actual,
          datos_nuevos: { ...actual, stock: totalStock },
          usuario_email: user?.email || null
        });
      } catch (err) {
        console.warn('No se pudo registrar movimiento/historial de aumento (variante):', err);
      }

      setVariantesByProducto((prev) => ({
        ...prev,
        [String(pid)]: (prev[String(pid)] || []).map((v) =>
          v.id === variantId ? { ...v, stock: nextVariantStock } : v
        ),
      }));

      setProductos((prev) =>
        prev.map((p) => (p.user_id === pid ? { ...p, stock: totalStock } : p))
      );

      setIncrements((prev) => ({ ...prev, [key]: 0 }));

      if (shouldPrint) {
        const barcode = String(variante.codigo_barra || variante.sku || prod.codigo_barra || "").trim();
        if (!barcode) {
          showToast("No se puede imprimir: la variante/producto no tiene código de barras", "error");
          return;
        }
        const label = `${prod.nombre} - ${variante.color || "Unico"}`;
        await printLabels({ code: barcode, label, copies: increaseBy });
      }

      showToast(`Stock aumentado en ${variante.color || "Unico"}`);
    } catch (err) {
      console.error("Error aumentando stock de variante:", err);
      showToast("No se pudo actualizar el stock de color", "error");
    } finally {
      setSavingKey(null);
    }
  }

  const categories = useMemo(() => {
    return Array.from(new Set(productos.map((p) => getCategoryName(p)))).sort((a, b) => a.localeCompare(b, "es"));
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return productos.filter((prod) => {
      const categoryName = getCategoryName(prod);
      const matchesCategory = categoryFilter === "all" || categoryName === categoryFilter;
      const matchesSearch =
        !term ||
        [prod.nombre, prod.codigo_barra, categoryName].some((value) =>
          String(value || "").toLowerCase().includes(term)
        );
      return matchesCategory && matchesSearch;
    });
  }, [productos, search, categoryFilter]);

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-white via-slate-50 to-gray-100 px-4 py-8 sm:px-6 lg:px-8">
      <Toast />

      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-3xl font-black text-slate-900">Aumentar Stock</h1>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow md:grid-cols-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, codigo o categoria"
            className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />

          <select
            className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas las categorias</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
            }}
            className="h-10 rounded-md border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Limpiar filtros
          </button>
        </section>

        <div className="mb-4 text-sm text-slate-600">
          Mostrando {productosFiltrados.length} producto(s)
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-600 shadow">Cargando productos...</div>
        ) : productosFiltrados.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-600 shadow">No hay productos para mostrar.</div>
        ) : (
          <div className="space-y-4">
            {productosFiltrados.map((prod) => {
              const pid = String(prod.user_id ?? prod.id ?? "");
              const variants = variantesByProducto[pid] || [];
              const hasVariants = Array.isArray(variants) && variants.length > 0;
              const productKey = `p-${pid}`;
              const productIncrement = increments[productKey] ?? 0;

              return (
                <article key={pid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        {imagenPrincipalByProducto[pid] ? (
                          <img
                            src={imagenPrincipalByProducto[pid]}
                            alt={prod.nombre}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">IMG</div>
                        )}
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">{prod.nombre}</h2>
                        <p className="text-xs text-slate-500">
                          ID: {prod.user_id ?? prod.id} | Categoria: {getCategoryName(prod)} | Codigo: {prod.codigo_barra || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                      Stock actual: {Number(prod.stock || 0)}
                    </div>
                  </div>

                  {hasVariants ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-600">
                            <th className="py-2 text-left">Color</th>
                            <th className="py-2 text-center">Stock actual</th>
                            <th className="py-2 text-center">Aumentar</th>
                            <th className="py-2 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variants.map((variant) => {
                            const variantKey = `v-${variant.id}`;
                            const increment = increments[variantKey] ?? 0;
                            const isSaving = savingKey === variantKey;
                            return (
                              <tr key={variant.id} className="border-b border-slate-100">
                                <td className="py-2 font-medium text-slate-800">{variant.color || "Unico"}</td>
                                <td className="py-2 text-center text-slate-700">{Number(variant.stock || 0)}</td>
                                <td className="py-2 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    value={increment}
                                    onChange={(e) => setIncrementValue(variantKey, e.target.value)}
                                    className="h-9 w-24 rounded-md border border-gray-200 px-2 text-right"
                                  />
                                </td>
                                <td className="py-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => aumentarStockVariante(prod, variant, false)}
                                      disabled={isSaving}
                                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
                                    >
                                      {isSaving ? "Guardando..." : "Aumentar"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => aumentarStockVariante(prod, variant, true)}
                                      disabled={isSaving}
                                      className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold !text-white hover:bg-slate-900 disabled:bg-slate-400 disabled:!text-white"
                                    >
                                      {isSaving ? "Guardando..." : "Aumentar e imprimir"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-sm text-slate-600">Producto unico (sin colores). Aumenta stock directo:</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="number"
                          min="0"
                          value={productIncrement}
                          onChange={(e) => setIncrementValue(productKey, e.target.value)}
                          className="h-9 w-32 rounded-md border border-gray-200 px-2 text-right"
                        />
                        <button
                          type="button"
                          onClick={() => aumentarStockProducto(prod, false)}
                          disabled={savingKey === productKey}
                          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
                        >
                          {savingKey === productKey ? "Guardando..." : "Aumentar stock"}
                        </button>
                        <button
                          type="button"
                          onClick={() => aumentarStockProducto(prod, true)}
                          disabled={savingKey === productKey}
                          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold !text-white hover:bg-slate-900 disabled:bg-slate-400 disabled:!text-white"
                        >
                          {savingKey === productKey ? "Guardando..." : "Aumentar e imprimir"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
