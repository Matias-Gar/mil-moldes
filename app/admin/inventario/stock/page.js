"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/SupabaseClient";
import { CONFIG, whatsappUtils } from "../../../../lib/config";
import { DEFAULT_STORE_SETTINGS, fetchStoreSettings } from "../../../../lib/storeSettings";
import { Toast, showToast } from "../../../../components/ui/Toast";

export default function StockPage() {
    // --- Mover funciones dependientes arriba para evitar ReferenceError ---
    const getStockMinimo = useCallback((prod) => {
      return Number(prod?.stock_minimo ?? CONFIG.INVENTARIO.STOCK_MINIMO_ALERTA ?? 3);
    }, []);

    // Calcular el stock como la suma de los stocks de las variantes si existen
    const getStockState = useCallback((prod) => {
      let stock = Number(prod?.stock || 0);
      if (prod?.variantes && Array.isArray(prod.variantes) && prod.variantes.length > 0) {
        stock = prod.variantes.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      }
      const stockMinimo = getStockMinimo(prod);
      if (stock <= 0) return "sin-stock";
      if (stock <= Math.min(stockMinimo, 2)) return "critico";
      if (stock <= stockMinimo) return "bajo";
      return "normal";
    }, [getStockMinimo]);

  const PAGE_SIZE = 30;
  const [productos, setProductos] = useState([]);
  const [variantesByProducto, setVariantesByProducto] = useState({});
  const [availableCategories, setAvailableCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState("desc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [printCategory, setPrintCategory] = useState("all");
  const [printMode, setPrintMode] = useState("total");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sendingAlertId, setSendingAlertId] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [storeSettings, setStoreSettings] = useState(DEFAULT_STORE_SETTINGS);

  useEffect(() => {
    fetchProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden, page]);

  useEffect(() => {
    fetchCategorias();
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadStoreSettings = async () => {
      const settings = await fetchStoreSettings();
      if (mounted) setStoreSettings(settings);
    };
    loadStoreSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, categoryFilter, stockFilter]);

  async function fetchProductos() {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let data = null;
    let error = null;
    let count = 0;

    const enrichedQuery = supabase.from("productos").select(`
      user_id,
      nombre,
      precio,
      stock,
      stock_minimo,
      imagen_url,
      category_id,
      codigo_barra,
      categorias (categori)
    `, { count: "exact" });

    const orderField = orden === "stock-desc" || orden === "stock-asc" ? "stock" : "user_id";
    const enrichedResult = await enrichedQuery
      .order(orderField, { ascending: orden === "asc" || orden === "stock-asc" })
      .range(from, to);

    if (enrichedResult.error) {
      const fallbackQuery = supabase.from("productos").select(`
        user_id,
        nombre,
        precio,
        stock,
        imagen_url,
        category_id,
        codigo_barra,
        categorias (categori)
      `, { count: "exact" });

      const orderField = orden === "stock-desc" || orden === "stock-asc" ? "stock" : "user_id";
      const fallbackResult = await fallbackQuery
        .order(orderField, { ascending: orden === "asc" || orden === "stock-asc" })
        .range(from, to);

      data = fallbackResult.data;
      error = fallbackResult.error;
      count = fallbackResult.count || 0;
    } else {
      data = enrichedResult.data;
      error = enrichedResult.error;
      count = enrichedResult.count || 0;
    }

    if (error) {
      console.error("Error al obtener productos:", error);
      setProductos([]);
      setVariantesByProducto({});
      setTotalCount(0);
      showToast("Error al cargar productos", "error");
    } else {
      const loadedProductos = data || [];
      setProductos(loadedProductos);
      setTotalCount(count || 0);
      await fetchVariantesPorProductos(loadedProductos);
    }
    setLoading(false);
  }

  async function fetchVariantesPorProductos(productosPage) {
    const ids = (productosPage || [])
      .map((p) => p?.user_id ?? p?.id)
      .filter(Boolean);

    if (ids.length === 0) {
      setVariantesByProducto({});
      return;
    }

    let data = null;

    // Traer todas las variantes activas, incluidas las de stock 0
    const withActive = await supabase
      .from("producto_variantes")
      .select("producto_id, color, stock, activo")
      .in("producto_id", ids)
      .eq("activo", true);

    if (withActive.error) {
      const fallback = await supabase
        .from("producto_variantes")
        .select("producto_id, color, stock, activo")
        .in("producto_id", ids);

      if (fallback.error) {
        console.error("Error al obtener variantes de productos:", fallback.error);
        setVariantesByProducto({});
        return;
      }

      data = fallback.data || [];
    } else {
      data = withActive.data || [];
    }

    // Mostrar todas las variantes activas, aunque tengan stock 0
    const grouped = {};
    for (const variant of data) {
      const productoId = String(variant?.producto_id ?? "");
      if (!productoId) continue;

      const color = String(variant?.color || "").trim() || "Sin color";
      const stock = Number(variant?.stock || 0);

      if (!grouped[productoId]) grouped[productoId] = {};
      if (!grouped[productoId][color]) grouped[productoId][color] = 0;
      grouped[productoId][color] += stock;
    }

    const normalized = {};
    for (const [productoId, colorsMap] of Object.entries(grouped)) {
      normalized[productoId] = Object.entries(colorsMap)
        .map(([color, stock]) => ({ color, stock: Number(stock || 0) }))
        // Ya no filtramos por stock > 0, mostramos todas
        .sort((a, b) => b.stock - a.stock || a.color.localeCompare(b.color, "es"));
    }

    setVariantesByProducto(normalized);
  }

  function getColorStockDisplay(prod) {
    const pid = String(prod?.user_id ?? prod?.id ?? "");
    const variants = variantesByProducto[pid] || [];
    if (!Array.isArray(variants) || variants.length === 0) return "Sin variantes";
    return variants.map((v) => `${v.color} (${v.stock})`).join(", ");
  }

  async function fetchCategorias() {
    const { data, error } = await supabase
      .from("categorias")
      .select("categori")
      .order("categori", { ascending: true });

    if (error) {
      console.error("Error al obtener categorías:", error);
      return;
    }

    setAvailableCategories((data || []).map((item) => String(item.categori || "")).filter(Boolean));
  }

  async function sendWhatsappAlerta(prod) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showToast("Debes iniciar sesión para enviar alertas", "error");
      return;
    }

    const pid = prod.user_id ?? prod.id ?? prod.codigo_barra ?? prod.nombre;
    const stockMinimo = getStockMinimo(prod);
    const phone = storeSettings?.whatsapp_number || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || CONFIG.WHATSAPP_BUSINESS;
    if (!phone) {
      showToast("Configura NEXT_PUBLIC_WHATSAPP_NUMBER para enviar alertas", "error");
      return;
    }

    const mensaje = `ALERTA DE STOCK BAJO\nProducto: ${prod.nombre}\nStock actual: ${prod.stock}\nStock mínimo: ${stockMinimo}`;
    if (!window.__whatsapp_alertas) window.__whatsapp_alertas = {};
    const lastSentAt = window.__whatsapp_alertas[pid] || 0;
    if (Date.now() - lastSentAt < 60 * 1000) {
      showToast(`Espera un minuto antes de reenviar alerta para ${prod.nombre}`, "info");
      return;
    }

    try {
      setSendingAlertId(pid);
      window.__whatsapp_alertas[pid] = Date.now();
      whatsappUtils.openWhatsApp(phone, mensaje);
      showToast(`Alerta preparada para ${prod.nombre}`);
    } catch (err) {
      showToast(err?.message || "No se pudo abrir WhatsApp", "error");
    } finally {
      setSendingAlertId(null);
    }
  }

  function getCategoryName(prod) {
    return String(prod.categorias?.categori || prod.categoria || prod.category_id || "Sin categoria");
  }

  const matchesFilters = useCallback((prod, searchTerm = search.trim().toLowerCase(), category = categoryFilter, stock = stockFilter) => {
    const categoryName = getCategoryName(prod);
    const matchesSearch = !searchTerm || [prod.nombre, prod.codigo_barra, categoryName]
      .some((value) => String(value || "").toLowerCase().includes(searchTerm));
    const matchesCategory = category === "all" || categoryName === category;
    const state = getStockState(prod);
    const highStockThreshold = 20;
    const matchesStock = stock === "all"
      || (stock === "low" && (state === "bajo" || state === "critico" || state === "sin-stock"))
      || (stock === "out" && state === "sin-stock")
      || (stock === "normal" && state === "normal")
      || (stock === "high" && Number(prod?.stock || 0) >= highStockThreshold);

    return matchesSearch && matchesCategory && matchesStock;
  }, [search, categoryFilter, stockFilter, getStockState]);

  async function fetchAllProductos() {
    const orderField = orden === "stock-desc" || orden === "stock-asc" ? "stock" : "user_id";
    const ascending = orden === "asc" || orden === "stock-asc";

    const enrichedResult = await supabase.from("productos").select(`
      user_id,
      nombre,
      precio,
      stock,
      stock_minimo,
      imagen_url,
      category_id,
      codigo_barra,
      categorias (categori)
    `).order(orderField, { ascending });

    if (!enrichedResult.error) {
      return enrichedResult.data || [];
    }

    const fallbackResult = await supabase.from("productos").select(`
      user_id,
      nombre,
      precio,
      stock,
      imagen_url,
      category_id,
      codigo_barra,
      categorias (categori)
    `).order(orderField, { ascending });

    if (fallbackResult.error) {
      throw fallbackResult.error;
    }

    return fallbackResult.data || [];
  }

  function openPrintWindow(title, bodyHtml) {
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      showToast("Tu navegador bloqueó la ventana de impresión", "error");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 24px; }
            p { margin: 0 0 16px; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 12px; }
            th { background: #e2e8f0; }
            .meta { margin-top: 4px; font-size: 12px; color: #64748b; }
            .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #e2e8f0; font-size: 11px; font-weight: bold; }
          </style>
        </head>
        <body>
          ${bodyHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function handlePrintStockReport(mode, targetCategory = null) {
    try {
      setPrinting(true);
      const allProductos = await fetchAllProductos();
      const searchTerm = search.trim().toLowerCase();
      const visibles = allProductos.filter((prod) => {
        if (mode === "selected-category") {
          return matchesFilters(prod, "", targetCategory || "all", "all");
        }

        return matchesFilters(prod, searchTerm);
      });

      if (visibles.length === 0) {
        showToast("No hay productos para imprimir con los filtros actuales", "info");
        return;
      }

      const now = new Date().toLocaleString("es-BO");

      if (mode === "selected-category") {
        if (!targetCategory || targetCategory === "all") {
          showToast("Escoge una categoría para imprimir", "info");
          return;
        }

        const rows = visibles.map((prod) => `
          <tr>
            <td>${prod.user_id ?? prod.id ?? "-"}</td>
            <td>${prod.nombre}</td>
            <td>${prod.codigo_barra || "-"}</td>
            <td>${prod.stock ?? 0}</td>
            <td>Bs ${Number(prod.precio || 0).toFixed(2)}</td>
            <td>${getStockLabel(prod)}</td>
          </tr>
        `).join("");

        const totalUnidades = visibles.reduce((sum, prod) => sum + Number(prod.stock || 0), 0);
        const totalValor = visibles.reduce((sum, prod) => sum + (Number(prod.stock || 0) * Number(prod.precio || 0)), 0);

        openPrintWindow(
          `Reporte de stock - ${targetCategory}`,
          `
            <h1>Reporte de stock de la categoría: ${targetCategory}</h1>
            <p>Generado el ${now}</p>
            <div class="meta">WhatsApp: ${storeSettings?.whatsapp_number || CONFIG.WHATSAPP_BUSINESS_DISPLAY} | Correo: ${CONFIG.NOTIFICATION_EMAIL}</div>
            <div class="meta">Productos: ${visibles.length} | Unidades: ${totalUnidades} | Valor estimado: Bs ${totalValor.toFixed(2)}</div>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Producto</th>
                  <th>Codigo</th>
                  <th>Stock</th>
                  <th>Precio</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `
        );
        return;
      }

      if (mode === "categories") {
        const grouped = visibles.reduce((acc, prod) => {
          const categoryName = getCategoryName(prod);
          if (!acc[categoryName]) {
            acc[categoryName] = { categoria: categoryName, productos: 0, unidades: 0, valor: 0 };
          }
          acc[categoryName].productos += 1;
          acc[categoryName].unidades += Number(prod.stock || 0);
          acc[categoryName].valor += Number(prod.stock || 0) * Number(prod.precio || 0);
          return acc;
        }, {});

        const rows = Object.values(grouped).map((item) => `
          <tr>
            <td>${item.categoria}</td>
            <td>${item.productos}</td>
            <td>${item.unidades}</td>
            <td>Bs ${Number(item.valor).toFixed(2)}</td>
          </tr>
        `).join("");

        openPrintWindow(
          "Reporte de stock por categorias",
          `
            <h1>Reporte de stock por categorias</h1>
            <p>Generado el ${now}</p>
            <div class="meta">WhatsApp: ${storeSettings?.whatsapp_number || CONFIG.WHATSAPP_BUSINESS_DISPLAY} | Correo: ${CONFIG.NOTIFICATION_EMAIL}</div>
            <table>
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Productos</th>
                  <th>Unidades</th>
                  <th>Valor estimado</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `
        );
        return;
      }

      const rows = visibles.map((prod) => `
        <tr>
          <td>${prod.user_id ?? prod.id ?? "-"}</td>
          <td>${prod.nombre}</td>
          <td>${getCategoryName(prod)}</td>
          <td>${prod.codigo_barra || "-"}</td>
          <td>${prod.stock ?? 0}</td>
          <td>Bs ${Number(prod.precio || 0).toFixed(2)}</td>
          <td>${getStockLabel(prod)}</td>
        </tr>
      `).join("");

      const totalUnidades = visibles.reduce((sum, prod) => sum + Number(prod.stock || 0), 0);
      const totalValor = visibles.reduce((sum, prod) => sum + (Number(prod.stock || 0) * Number(prod.precio || 0)), 0);

      openPrintWindow(
        "Reporte total de stock",
        `
          <h1>Reporte total de stock</h1>
          <p>Generado el ${now}</p>
          <div class="meta">WhatsApp: ${storeSettings?.whatsapp_number || CONFIG.WHATSAPP_BUSINESS_DISPLAY} | Correo: ${CONFIG.NOTIFICATION_EMAIL}</div>
          <div class="meta">Productos: ${visibles.length} | Unidades: ${totalUnidades} | Valor estimado: Bs ${totalValor.toFixed(2)}</div>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Producto</th>
                <th>Categoria</th>
                <th>Codigo</th>
                <th>Stock</th>
                <th>Precio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        `
      );
    } catch (error) {
      console.error("Error al imprimir stock:", error);
      showToast("No se pudo generar el reporte de impresión", "error");
    } finally {
      setPrinting(false);
    }
  }

  function handlePrintAction() {
    if (printMode === "selected-category" && (!printCategory || printCategory === "all")) {
      showToast("Escoge una categoría para imprimir", "info");
      return;
    }
    handlePrintStockReport(printMode, printCategory);
  }

  async function handleNotifyLowStock() {
    try {
      setNotifying(true);
      const allProductos = await fetchAllProductos();
      const lowStockProductos = allProductos.filter((prod) => {
        const state = getStockState(prod);
        return state === "bajo" || state === "critico" || state === "sin-stock";
      });

      if (lowStockProductos.length === 0) {
        showToast("No hay productos con stock bajo para notificar", "info");
        return;
      }

      const resumen = lowStockProductos
        .slice(0, 25)
        .map((prod) => `- ${prod.nombre}: ${prod.stock} u. (min ${getStockMinimo(prod)})`)
        .join("\n");
      const extra = lowStockProductos.length > 25 ? `\n...y ${lowStockProductos.length - 25} producto(s) más.` : "";
      const mensaje = `ALERTA GENERAL DE STOCK BAJO\n\nSe detectaron ${lowStockProductos.length} producto(s) con stock bajo.\n\n${resumen}${extra}`;

      whatsappUtils.sendToBusinessWhatsApp(mensaje);
      whatsappUtils.sendStockAlertEmail({
        to: CONFIG.NOTIFICATION_EMAIL,
        subject: `Alerta de stock bajo (${lowStockProductos.length} productos)`,
        body: mensaje,
      });

      showToast(`Notificación preparada para ${lowStockProductos.length} producto(s)`);
    } catch (error) {
      console.error("Error al preparar notificación:", error);
      showToast(error?.message || "No se pudo preparar la notificación", "error");
    } finally {
      setNotifying(false);
    }
  }


  function getStockColor(prod) {
    const state = getStockState(prod);
    if (state === "sin-stock") return "bg-red-700 text-white ring-1 ring-red-600";
    if (state === "critico") return "bg-red-600 text-white ring-1 ring-red-500";
    if (state === "bajo") return "bg-yellow-300 text-black ring-1 ring-yellow-400";
    return "bg-green-600 text-white ring-1 ring-green-500";
  }

  function getStockLabel(prod) {
    const state = getStockState(prod);
    if (state === "sin-stock") return "SIN STOCK";
    if (state === "critico") return "CRITICO";
    if (state === "bajo") return "BAJO";
    return "NORMAL";
  }

  const categories = useMemo(() => {
    if (availableCategories.length > 0) {
      return availableCategories;
    }
    return Array.from(new Set(productos.map((prod) => getCategoryName(prod))));
  }, [availableCategories, productos]);

  const filteredProductos = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return productos.filter((prod) => matchesFilters(prod, searchTerm));
  }, [productos, search, matchesFilters]);

  const kpis = useMemo(() => {
    const total = filteredProductos.length;
    const low = filteredProductos.filter((prod) => {
      const state = getStockState(prod);
      return state === "bajo" || state === "critico";
    }).length;
    const out = filteredProductos.filter((prod) => getStockState(prod) === "sin-stock").length;
    return { total, low, out };
  }, [filteredProductos, getStockState]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-white via-slate-50 to-gray-100 px-4 py-10 sm:px-6 lg:px-8">
      <Toast />

      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex flex-col items-center gap-4 text-center">
          <div>
            <h1 className="bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
              Inventario - Stock
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Vista clara y responsiva del stock para detectar productos criticos y enviar alertas rapido.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <label className="text-sm font-semibold text-gray-700">Ordenar:</label>
            <select
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
            >
              <option value="desc">Mas actuales primero</option>
              <option value="asc">Mas antiguos primero</option>
              <option value="stock-desc">Mayor stock primero</option>
              <option value="stock-asc">Menor stock primero</option>
            </select>

            <a
              href="/admin/productos/catalogo"
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-indigo-700"
            >
              Ver Catalogo
            </a>
          </div>

          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-700">Impresión de inventario</div>
            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <select
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                value={printMode}
                onChange={(e) => setPrintMode(e.target.value)}
              >
                <option value="total">Reporte total de stock</option>
                <option value="categories">Resumen por categorías</option>
                <option value="selected-category">Una categoría específica</option>
              </select>

              {printMode === "selected-category" && (
                <select
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                  value={printCategory}
                  onChange={(e) => setPrintCategory(e.target.value)}
                >
                  <option value="all">Escoge categoría a imprimir</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              )}

            <button
              type="button"
              onClick={handlePrintAction}
              disabled={printing}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-slate-900 disabled:bg-slate-400"
            >
              {printing ? "Imprimiendo..." : "Imprimir reporte"}
            </button>
          </div>
          </div>
        </header>

        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-slate-700 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="text-center lg:text-left">
            <div className="font-semibold text-slate-900">Canales de notificación de stock bajo</div>
            <div className="mt-1">WhatsApp: {storeSettings?.whatsapp_number || CONFIG.WHATSAPP_BUSINESS_DISPLAY}</div>
            <div>Correo: {CONFIG.NOTIFICATION_EMAIL}</div>
          </div>
          <button
            type="button"
            onClick={handleNotifyLowStock}
            disabled={notifying}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:bg-amber-300"
          >
            {notifying ? "Preparando notificación..." : "Notificar stock bajo"}
          </button>
        </div>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Productos totales</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{kpis.total}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-600">Stock bajo</p>
            <p className="mt-2 text-3xl font-black text-amber-700">{kpis.low}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="text-xs font-bold uppercase tracking-wide text-red-600">Sin stock</p>
            <p className="mt-2 text-3xl font-black text-red-700">{kpis.out}</p>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow md:grid-cols-4 lg:grid-cols-5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto, código o categoría"
            className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />

          <select
            className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas las categorías</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          >
            <option value="all">Todo el stock</option>
            <option value="low">Solo stock bajo</option>
            <option value="out">Solo sin stock</option>
            <option value="normal">Solo stock normal</option>
            <option value="high">Mayor stock (20+)</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
              setStockFilter("all");
            }}
            className="h-10 rounded-md border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Limpiar filtros
          </button>
        </section>

        <div className="mb-4 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Mostrando {filteredProductos.length} producto(s) de {totalCount}</span>
          <span>Pagina {page + 1} de {totalPages}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse rounded-lg bg-sky-100 px-6 py-4 text-sky-700 shadow">
              Cargando productos...
            </div>
          </div>
        ) : productos.length === 0 ? (
          <div className="py-12 text-center">
            <div className="inline-block rounded-lg bg-white p-6 shadow-md">
              <h3 className="font-semibold text-gray-800">No hay productos para mostrar</h3>
              <p className="mt-1 text-sm text-gray-500">Agrega productos desde el panel para que aparezcan aqui.</p>
            </div>
          </div>
        ) : filteredProductos.length === 0 ? (
          <div className="py-12 text-center">
            <div className="inline-block rounded-lg bg-white p-6 shadow-md">
              <h3 className="font-semibold text-gray-800">No hay resultados con esos filtros</h3>
              <p className="mt-1 text-sm text-gray-500">Ajusta la búsqueda o limpia los filtros para ver más productos.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-lg border border-gray-200 shadow-lg md:block">
              <table className="w-full table-auto bg-white text-sm md:text-base">
                <thead>
                  <tr className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white">
                    <th className="p-3 text-center">ID</th>
                    <th className="p-3 text-left">Nombre</th>
                    <th className="p-3 text-center">Precio</th>
                    <th className="p-3 text-center">Categoria</th>
                    <th className="p-3 text-center">Stock</th>
                    <th className="p-3 text-left">Colores (cantidad)</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Codigo</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProductos.map((prod) => {
                    const pid = prod.user_id ?? prod.id ?? prod.codigo_barra ?? prod.nombre;
                    const categoryName = prod.categorias?.categori || prod.categoria || prod.category_id || "Sin categoria";

                    return (
                      <tr key={pid} className="transition hover:bg-gray-50">
                        <td className="p-3 text-center text-slate-600">{prod.user_id ?? prod.id}</td>
                        <td className="p-3 font-semibold text-slate-900">{prod.nombre}</td>
                        <td className="p-3 text-center font-semibold text-indigo-600">Bs {Number(prod.precio).toFixed(2)}</td>
                        <td className="p-3 text-center text-slate-600">{categoryName}</td>
                        <td className="p-3 text-center">
                          <span className={"inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold " + getStockColor(prod)}>
                            {prod.stock}
                          </span>
                        </td>
                        <td className="p-3 text-left text-xs text-slate-700 max-w-[320px] break-words">
                          {getColorStockDisplay(prod)}
                        </td>
                        <td className="p-3 text-center">
                          <span className={"inline-flex items-center rounded-full px-3 py-1 text-xs font-bold " + getStockColor(prod)}>
                            {getStockLabel(prod)}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-500">{prod.codigo_barra || "-"}</td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => sendWhatsappAlerta(prod)}
                            disabled={sendingAlertId === pid}
                            className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-600 disabled:bg-amber-300"
                          >
                            {sendingAlertId === pid ? "Enviando..." : "Enviar alerta"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 md:hidden">
              {filteredProductos.map((prod, idx) => {
                const pid = prod.user_id ?? prod.id ?? prod.codigo_barra ?? `${prod.nombre ?? "producto"}-${idx}`;
                const categoryName = prod.categorias?.categori || prod.categoria || prod.category_id || "Sin categoria";

                return (
                  <div key={pid} className="rounded-lg bg-white p-4 shadow">
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{prod.nombre}</div>
                          <div className="mt-1 text-xs text-slate-500">Categoria: {categoryName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-indigo-600">Bs {Number(prod.precio).toFixed(2)}</div>
                          <div className="mt-1 text-xs text-slate-500">ID: {prod.user_id ?? prod.id}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={"inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold " + getStockColor(prod)}>
                          Stock: {prod.stock}
                        </span>
                        <span className="text-xs text-slate-500">{categoryName}</span>
                        <span className={"inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold " + getStockColor(prod)}>
                          {getStockLabel(prod)}
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        Codigo: {prod.codigo_barra || "-"}
                      </div>

                      <div className="mt-1 text-xs text-slate-600">
                        Colores: {getColorStockDisplay(prod)}
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => sendWhatsappAlerta(prod)}
                          disabled={sendingAlertId === pid}
                          className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-600 disabled:bg-amber-300"
                        >
                          {sendingAlertId === pid ? "Enviando..." : "Alerta"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm text-slate-600">Pagina {page + 1} de {totalPages}</span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
