"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/SupabaseClient";
import Toast, { showToast } from "@/components/ui/Toast";
import { useSucursalActiva } from "@/components/admin/SucursalContext";

const SEARCH_LIMIT = 1200;

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return Number(parsed.toFixed(3)).toString();
}

function getEffectiveVariantStock(variant) {
  const decimal = Number(variant?.stock_decimal);
  const legacy = Number(variant?.stock);
  return Math.max(0, Number.isFinite(decimal) && decimal > 0 ? decimal : legacy || 0);
}

function getUnitInfo(product) {
  const unidadBase = String(product?.unidad_base || "unidad").trim() || "unidad";
  const alternativas = Array.isArray(product?.unidades_alternativas)
    ? product.unidades_alternativas.map((u) => String(u || "").trim()).filter(Boolean)
    : [];
  const unidadAlternativa = alternativas.find((u) => u && u !== unidadBase);
  const factor = Number(product?.factor_conversion || 0);
  const hasConversion = Boolean(unidadAlternativa && Number.isFinite(factor) && factor > 0);
  return { unidadBase, unidadAlternativa, factor, hasConversion };
}

function getSelectableUnits(product) {
  const { unidadBase, unidadAlternativa, hasConversion } = getUnitInfo(product);
  return hasConversion ? [unidadBase, unidadAlternativa] : [unidadBase];
}

function normalizeUnitName(unit) {
  return String(unit || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isDiscreteUnit(unit) {
  return ["unidad", "unidades", "pieza", "piezas", "pza", "pzas", "par", "pares", "item", "items", "articulo", "articulos"].includes(normalizeUnitName(unit));
}

function normalizeQuantityForUnit(value, unit) {
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return isDiscreteUnit(unit) ? String(Math.floor(parsed)) : String(parsed);
}

function getQuantityStep(unit) {
  return isDiscreteUnit(unit) ? 1 : 0.01;
}

function getBaseQuantity(product, amount, unit) {
  const { unidadBase, factor, hasConversion } = getUnitInfo(product);
  const parsed = toNumber(amount);
  if (!hasConversion || unit === unidadBase) return parsed;
  return parsed / factor;
}

function getItemKey(item) {
  if (!item) return "";
  return item.variantId ? `v-${item.variantId}` : `p-${item.productId}`;
}

function getErrorProps(error) {
  if (!error || typeof error !== "object") return {};
  return Object.getOwnPropertyNames(error).reduce((acc, key) => {
    acc[key] = error[key];
    return acc;
  }, {});
}

function describeSupabaseError(error) {
  if (!error) return "Error desconocido";
  if (typeof error === "string") return error;

  const props = { ...getErrorProps(error), ...error };
  const messageParts = [
    props.message,
    props.details,
    props.hint ? `Hint: ${props.hint}` : "",
    props.code ? `Codigo: ${props.code}` : "",
    props.status ? `Status: ${props.status}` : "",
  ].filter(Boolean);

  if (messageParts.length > 0) return messageParts.join(" | ");

  try {
    const json = JSON.stringify(props);
    if (json && json !== "{}") return json;
  } catch (_) {
    // Ignore stringify errors and fall back below.
  }

  return "No se pudo transferir stock. Revisa la consola y el SQL de transferencia.";
}

function isMissingSchemaError(error, fields = []) {
  const message = describeSupabaseError(error).toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("could not find") ||
    message.includes("does not exist") ||
    fields.some((field) => message.includes(field.toLowerCase()))
  );
}

export default function TransferenciaSucursalPage() {
  const { activeSucursalId, activeSucursal, sucursales, loading: sucursalesLoading } = useSucursalActiva();
  const scanRef = useRef(null);

  const [productos, setProductos] = useState([]);
  const [variantesByProducto, setVariantesByProducto] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("unidad");
  const [destinoId, setDestinoId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [recentTransfers, setRecentTransfers] = useState([]);

  const fallbackDestinoId = useMemo(
    () => sucursales.find((branch) => branch.id !== activeSucursalId)?.id || "",
    [activeSucursalId, sucursales]
  );
  const effectiveDestinoId = destinoId && destinoId !== activeSucursalId ? destinoId : fallbackDestinoId;

  const fetchData = useCallback(async () => {
    setLoading(true);

    let productosQuery = supabase
      .from("productos")
      .select(`
        user_id,
        nombre,
        descripcion,
        stock,
        codigo_barra,
        category_id,
        categoria,
        unidad_base,
        unidades_alternativas,
        factor_conversion,
        categorias (categori)
      `)
      .eq("sucursal_id", activeSucursalId)
      .order("nombre", { ascending: true })
      .limit(SEARCH_LIMIT);

    const { data: productosData, error: productosError } = await productosQuery;
    if (productosError) {
      console.error("Error cargando productos para transferencia:", productosError);
      showToast("No se pudieron cargar productos", "error");
      setLoading(false);
      return;
    }

    const rows = productosData || [];
    setProductos(rows);

    const ids = rows.map((p) => Number(p.user_id)).filter((id) => Number.isFinite(id) && id > 0);
    const grouped = {};
    const CHUNK_SIZE = 80;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const variantsQuery = supabase
        .from("producto_variantes")
        .select("id, producto_id, color, stock, stock_decimal, activo, codigo_barra, sku")
        .in("producto_id", chunk)
        .eq("sucursal_id", activeSucursalId)
        .order("color", { ascending: true });

      let { data, error } = await variantsQuery;
      if (error) {
        if (isMissingSchemaError(error, ["codigo_barra", "activo", "stock_decimal"])) {
          let fallbackQuery = supabase
            .from("producto_variantes")
            .select("id, producto_id, color, stock, sku")
            .in("producto_id", chunk)
            .order("color", { ascending: true });

          if (!isMissingSchemaError(error, ["sucursal_id"])) {
            fallbackQuery = fallbackQuery.eq("sucursal_id", activeSucursalId);
          }

          const fallback = await fallbackQuery;
          data = (fallback.data || []).map((row) => ({
            ...row,
            activo: true,
            codigo_barra: null,
            stock_decimal: null,
          }));
          error = fallback.error;
        }

        if (error) {
          console.warn("No se pudieron cargar variantes:", error);
          continue;
        }
      }

      (data || []).forEach((variant) => {
        if (variant.activo === false) return;
        const pid = String(variant.producto_id);
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push(variant);
      });
    }

    setVariantesByProducto(grouped);
    setLoading(false);
  }, [activeSucursalId]);

  const fetchRecentTransfers = useCallback(async () => {
    const { data, error } = await supabase
      .from("transferencias_sucursal")
      .select(`
        id,
        created_at,
        cantidad,
        unidad,
        cantidad_base,
        estado,
        producto_nombre,
        variante_nombre,
        sucursal_origen:sucursales!transferencias_sucursal_sucursal_origen_id_fkey(nombre),
        sucursal_destino:sucursales!transferencias_sucursal_sucursal_destino_id_fkey(nombre)
      `)
      .or(`sucursal_origen_id.eq.${activeSucursalId},sucursal_destino_id.eq.${activeSucursalId}`)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      if (!isMissingSchemaError(error, ["transferencias_sucursal"])) {
        console.warn("Historial de transferencias no disponible:", error);
      }
      setRecentTransfers([]);
      return;
    }
    setRecentTransfers(data || []);
  }, [activeSucursalId]);

  useEffect(() => {
    if (!activeSucursalId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      fetchData();
      fetchRecentTransfers();
    });
    return () => {
      cancelled = true;
    };
  }, [activeSucursalId, fetchData, fetchRecentTransfers]);

  function getCategoryName(product) {
    return String(product?.categorias?.categori || product?.categoria || product?.category_id || "Sin categoria");
  }

  const buildSearchItems = useCallback(() => {
    return productos.flatMap((product) => {
      const variants = variantesByProducto[String(product.user_id)] || [];
      if (variants.length === 0) {
        return [{
          key: `p-${product.user_id}`,
          type: "producto",
          product,
          productId: product.user_id,
          variantId: null,
          label: product.nombre,
          detail: getCategoryName(product),
          stock: Math.max(0, Number(product.stock || 0)),
          code: product.codigo_barra || "",
          searchText: [product.nombre, product.codigo_barra, getCategoryName(product)].join(" "),
        }];
      }

      return variants.map((variant) => ({
        key: `v-${variant.id}`,
        type: "variante",
        product,
        productId: product.user_id,
        variantId: variant.id,
        label: product.nombre,
        detail: variant.color || "Unico",
        stock: getEffectiveVariantStock(variant),
        code: variant.codigo_barra || variant.sku || product.codigo_barra || "",
        searchText: [product.nombre, product.codigo_barra, variant.codigo_barra, variant.sku, variant.color, getCategoryName(product)].join(" "),
      }));
    });
  }, [productos, variantesByProducto]);

  const categories = useMemo(() => {
    return Array.from(new Set(productos.map((p) => getCategoryName(p)))).sort((a, b) => a.localeCompare(b, "es"));
  }, [productos]);

  const searchItems = useMemo(() => buildSearchItems(), [buildSearchItems]);

  const filteredItems = useMemo(() => {
    const term = normalizeText(search);
    return searchItems.filter((item) => {
      const matchesCategory = categoryFilter === "all" || getCategoryName(item.product) === categoryFilter;
      const matchesSearch = !term || normalizeText(item.searchText).includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, search, searchItems]);

  const destino = sucursales.find((branch) => branch.id === effectiveDestinoId) || null;
  const selectedUnits = selectedItem ? getSelectableUnits(selectedItem.product) : ["unidad"];
  const cantidadBase = selectedItem ? getBaseQuantity(selectedItem.product, cantidad, unidad) : 0;
  const hasEnoughStock = selectedItem && cantidadBase > 0 && cantidadBase <= Number(selectedItem.stock || 0);

  function selectItem(item) {
    setSelectedItem(item);
    setSearch(item.code || item.label);
    setCantidad("");
    const units = getSelectableUnits(item.product);
    setUnidad(units[0]);
  }

  function handleScanSubmit(event) {
    event.preventDefault();
    const code = normalizeText(scanCode);
    if (!code) return;

    const found = searchItems.find((item) => {
      const codes = [item.code, item.product?.codigo_barra].map(normalizeText).filter(Boolean);
      return codes.includes(code);
    });

    if (!found) {
      setSearch(scanCode);
      showToast("No se encontro ese codigo en la sucursal activa", "info");
      return;
    }

    selectItem(found);
    setScanCode("");
    showToast(`Producto seleccionado: ${found.label}`);
  }

  async function transferir() {
    if (!selectedItem) {
      showToast("Selecciona un producto", "info");
      return;
    }
    if (!effectiveDestinoId || effectiveDestinoId === activeSucursalId) {
      showToast("Selecciona una sucursal destino distinta", "info");
      return;
    }
    if (!hasEnoughStock) {
      showToast("Cantidad invalida o stock insuficiente", "error");
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      const rpcPayload = {
        p_producto_origen_id: Number(selectedItem.productId),
        p_variante_origen_id: selectedItem.variantId ? Number(selectedItem.variantId) : null,
        p_sucursal_origen_id: activeSucursalId,
        p_sucursal_destino_id: effectiveDestinoId,
        p_cantidad: Number(cantidad),
        p_unidad: unidad,
        p_cantidad_base: Number(cantidadBase),
        p_usuario_id: user?.id || null,
        p_usuario_email: user?.email || "",
        p_observaciones: motivo || null,
      };

      const { error } = await supabase.rpc("transferir_stock_sucursal", rpcPayload);

      if (error) {
        const message = describeSupabaseError(error);
        console.error("RPC transferir_stock_sucursal fallo:", {
          message,
          error,
          errorProps: getErrorProps(error),
          rpcPayload,
        });
        throw new Error(message);
      }

      showToast("Transferencia registrada y stock actualizado");
      setCantidad("");
      setMotivo("");
      setSelectedItem(null);
      setSearch("");
      await fetchData();
      await fetchRecentTransfers();
      scanRef.current?.focus();
    } catch (error) {
      const message = describeSupabaseError(error);
      console.error("Error transfiriendo stock:", {
        message,
        error,
        errorProps: getErrorProps(error),
      });
      if (
        message.includes("transferir_stock_sucursal") ||
        message.toLowerCase().includes("schema cache") ||
        message.toLowerCase().includes("could not find the function")
      ) {
        showToast("Falta correr scripts/enable_transferencia_sucursal.sql en Supabase", "error");
      } else {
        showToast(message || "No se pudo transferir stock", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-white via-slate-50 to-gray-100 px-4 py-8 sm:px-6 lg:px-8">
      <Toast />

      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black text-slate-900">Transferencia Sucursal</h1>
              <p className="mt-1 text-sm text-slate-600">
                Origen: <span className="font-bold">{activeSucursal?.nombre || "Sucursal activa"}</span>
              </p>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
              {filteredItems.length} item(s) disponibles
            </div>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <form onSubmit={handleScanSubmit} className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <input
                ref={scanRef}
                type="text"
                value={scanCode}
                onChange={(event) => setScanCode(event.target.value)}
                placeholder="Lector QR / codigo de barras"
                className="h-11 rounded-md border border-gray-300 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              <button
                type="submit"
                className="h-11 rounded-md bg-gray-900 px-4 text-sm font-bold !text-white hover:bg-gray-800 disabled:bg-gray-400 disabled:!text-white"
              >
                Buscar codigo
              </button>
            </form>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, categoria, codigo, SKU o color"
                className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300 md:col-span-2"
              />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                <option value="all">Todas las categorias</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="mt-4 max-h-[620px] overflow-y-auto rounded-lg border border-slate-200">
              {loading || sucursalesLoading ? (
                <div className="p-8 text-center text-slate-600">Cargando productos...</div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center text-slate-600">No hay coincidencias.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const isSelected = getItemKey(selectedItem) === item.key;
                    const unitInfo = getUnitInfo(item.product);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => selectItem(item)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-emerald-50 ${
                          isSelected ? "bg-emerald-50 ring-1 ring-inset ring-emerald-400" : "bg-white"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-slate-900">{item.label}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.type === "variante" ? `Color: ${item.detail}` : item.detail} | Codigo: {item.code || "-"}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-md bg-slate-100 px-3 py-1 text-right text-xs font-bold text-slate-700">
                          {formatQuantity(item.stock)} {unitInfo.unidadBase}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Datos de transferencia</h2>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {selectedItem ? (
                <>
                  <div className="text-sm font-black text-slate-900">{selectedItem.label}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {selectedItem.type === "variante" ? `Variante: ${selectedItem.detail}` : "Producto unico"}
                  </div>
                  <div className="mt-2 text-sm font-bold text-emerald-700">
                    Stock origen: {formatQuantity(selectedItem.stock)} {getUnitInfo(selectedItem.product).unidadBase}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-600">Selecciona un producto de la lista o escanea su codigo.</div>
              )}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase text-slate-500">Sucursal destino</label>
            <select
              value={effectiveDestinoId}
              onChange={(event) => setDestinoId(event.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800"
            >
              <option value="">Selecciona destino</option>
              {sucursales
                .filter((branch) => branch.id !== activeSucursalId)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.nombre}</option>
                ))}
            </select>

            <label className="mt-4 block text-xs font-bold uppercase text-slate-500">Cantidad</label>
            <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
              <input
                type="number"
                min="0"
                step={getQuantityStep(unidad)}
                value={cantidad}
                onChange={(event) => setCantidad(normalizeQuantityForUnit(event.target.value, unidad))}
                className="h-11 rounded-md border border-gray-300 px-3 text-right text-sm text-gray-800"
              />
              <select
                value={unidad}
                onChange={(event) => {
                  setUnidad(event.target.value);
                  setCantidad((current) => normalizeQuantityForUnit(current, event.target.value));
                }}
                className="h-11 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800"
              >
                {selectedUnits.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>

            {selectedItem && cantidadBase > 0 && (
              <div className={`mt-2 rounded-md px-3 py-2 text-xs font-bold ${
                hasEnoughStock ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}>
                Sale de origen: {formatQuantity(cantidadBase)} {getUnitInfo(selectedItem.product).unidadBase}
                {!hasEnoughStock ? " | stock insuficiente" : ""}
              </div>
            )}

            <label className="mt-4 block text-xs font-bold uppercase text-slate-500">Nota</label>
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Motivo, responsable, guia o detalle interno"
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800"
            />

            <button
              type="button"
              onClick={transferir}
              disabled={saving || !selectedItem || !destino || !hasEnoughStock}
              className="mt-4 h-11 w-full rounded-md bg-emerald-600 px-4 text-sm font-black !text-white hover:bg-emerald-700 disabled:bg-emerald-300 disabled:!text-white"
            >
              {saving ? "Transfiriendo..." : "Transferir inventario"}
            </button>

            <div className="mt-5">
              <h3 className="text-sm font-black text-slate-900">Ultimas transferencias</h3>
              <div className="mt-2 space-y-2">
                {recentTransfers.length === 0 ? (
                  <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">Sin movimientos recientes.</div>
                ) : (
                  recentTransfers.map((row) => (
                    <div key={row.id} className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
                      <div className="font-bold text-slate-900">
                        {row.producto_nombre}{row.variante_nombre ? ` - ${row.variante_nombre}` : ""}
                      </div>
                      <div>
                        {row.sucursal_origen?.nombre || "Origen"} &gt; {row.sucursal_destino?.nombre || "Destino"}
                      </div>
                      <div>
                        {formatQuantity(row.cantidad)} {row.unidad || "unidad"} | {row.estado}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
