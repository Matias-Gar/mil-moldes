"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../../lib/SupabaseClient";
import { useSucursalActiva } from "../../../../components/admin/SucursalContext";

function cleanNumber(value, decimals = 2) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return Number(numeric.toFixed(decimals)).toString();
}

function isIngreso(tipo) {
  return ["ingreso", "entrada", "aumento", "ajuste_positivo", "anulacion_venta"].includes(String(tipo || "").toLowerCase());
}

function isSalida(tipo) {
  return ["salida", "venta", "ajuste_negativo"].includes(String(tipo || "").toLowerCase());
}

function stockValue(row) {
  const decimal = Number(row?.stock_decimal);
  const legacy = Number(row?.stock);
  return Math.max(0, Number.isFinite(decimal) && decimal > 0 ? decimal : legacy || 0);
}

function qtyBase(row) {
  return Number(row?.cantidad_base ?? row?.cantidad ?? 0) || 0;
}

function hasConversion(producto) {
  return Boolean(
    Array.isArray(producto?.unidades_alternativas) &&
    producto.unidades_alternativas.length > 0 &&
    Number(producto?.factor_conversion || 0) > 0
  );
}

function unitNames(producto) {
  const base = String(producto?.unidad_base || "unidad");
  const alt = Array.isArray(producto?.unidades_alternativas) && producto.unidades_alternativas.length > 0
    ? String(producto.unidades_alternativas[0])
    : "metro";
  return { base, alt };
}

function formatQuantity(producto, value, options = {}) {
  const numeric = Number(value || 0);
  if (!hasConversion(producto)) {
    return `${cleanNumber(numeric)} ${unitNames(producto).base}`;
  }

  const factor = Number(producto.factor_conversion || 0);
  const { base, alt } = unitNames(producto);
  const sign = numeric < 0 ? "-" : "";
  const abs = Math.abs(numeric);
  const fullBase = Math.floor(abs + 0.000001);
  const leftoverAlt = Math.round((abs - fullBase) * factor);
  const totalAlt = Math.round(abs * factor);
  const parts = [];

  if (fullBase > 0) parts.push(`${fullBase} ${base}${fullBase === 1 ? "" : "s"}`);
  if (leftoverAlt > 0) parts.push(`${leftoverAlt} ${alt}${leftoverAlt === 1 ? "" : "s"}`);
  if (parts.length === 0) parts.push(`0 ${alt}`);

  if (options.compact) return `${sign}${parts.join(" + ")}`;
  return `${sign}${parts.join(" + ")} (${totalAlt} ${alt}${totalAlt === 1 ? "" : "s"})`;
}

function formatEventQuantity(producto, event) {
  const visible = Number(event.cantidad ?? 0) || 0;
  const base = Number(event.cantidad_base ?? event.cantidad ?? 0) || 0;
  const unidad = String(event.unidad || "").trim();

  if (hasConversion(producto)) {
    if (unidad && unidad !== producto.unidad_base) {
      return `${cleanNumber(visible)} ${unidad} (${formatQuantity(producto, base, { compact: true })})`;
    }
    return formatQuantity(producto, base, { compact: true });
  }

  return `${cleanNumber(visible)} ${unidad || unitNames(producto).base}`;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("es-BO");
  } catch {
    return String(value);
  }
}

function statusForDifference(value) {
  return Math.abs(Number(value || 0)) > 0.0001 ? "revisar" : "ok";
}

export default function AuditoriaStockPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [productos, setProductos] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [variantes, setVariantes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [sugerencias, setSugerencias] = useState([]);
  const inputRef = useRef(null);

  const auditarProducto = (producto) => {
    const vars = variantes
      .filter((v) => String(v.producto_id) === String(producto.user_id))
      .sort((a, b) => String(a.color || "").localeCompare(String(b.color || ""), "es", { sensitivity: "base" }));
    const ventasProducto = detalles.filter((d) => String(d.producto_id) === String(producto.user_id));
    const movimientosProducto = movimientos.filter((m) => String(m.producto_id) === String(producto.user_id));
    const converted = hasConversion(producto);
    const hasVariants = vars.length > 0;

    const stockInicialTotal = hasVariants && !converted
      ? vars.reduce((sum, v) => sum + (Number(v.stock_inicial_decimal ?? v.stock_inicial) || 0), 0)
      : Number(producto.stock_inicial || 0);

    const stockActualTotal = hasVariants && !converted
      ? vars.reduce((sum, v) => sum + stockValue(v), 0)
      : Number(producto.stock || 0);

    const ingresos = movimientosProducto.filter((m) => isIngreso(m.tipo)).reduce((sum, m) => sum + qtyBase(m), 0);
    const salidasMovimientos = movimientosProducto.filter((m) => isSalida(m.tipo)).reduce((sum, m) => sum + qtyBase(m), 0);
    const ventasTotalDetalle = ventasProducto.reduce((sum, d) => sum + qtyBase(d), 0);
    const salidas = salidasMovimientos > 0 ? salidasMovimientos : ventasTotalDetalle;
    const stockCalculadoTotal = stockInicialTotal + ingresos - salidas;
    const diferenciaTotal = stockActualTotal - stockCalculadoTotal;

    const ventasPorVariante = vars.map((v) => ({
      id: v.id,
      color: v.color || "Unico",
      ventas: detalles
        .filter((d) => String(d.variante_id) === String(v.id))
        .reduce((sum, d) => sum + qtyBase(d), 0),
    }));

    const detallePorVariante = vars.map((v) => {
      const inicial = Number(v.stock_inicial_decimal ?? v.stock_inicial) || 0;
      const ventas = ventasPorVariante.find((row) => String(row.id) === String(v.id))?.ventas || 0;
      const actual = stockValue(v);
      const calculado = inicial - ventas;
      return {
        id: v.id,
        color: v.color || "Unico",
        inicial,
        ventas,
        actual,
        calculado,
        diferencia: actual - calculado,
      };
    });

    return {
      ...producto,
      variantes: vars,
      converted,
      stockInicial: stockInicialTotal,
      ingresos,
      salidas,
      ventas: ventasTotalDetalle,
      stockActual: stockActualTotal,
      stockCalculado: stockCalculadoTotal,
      diferencia: diferenciaTotal,
      detallePorVariante,
      eventos: getEventos(producto.user_id, producto),
    };
  };

  const getEventos = (productoId, productoForFormat = selected) => {
    const eventos = [];

    movimientos.filter((m) => String(m.producto_id) === String(productoId)).forEach((m) => {
      eventos.push({
        tipo: m.tipo,
        fecha: m.created_at,
        usuario: m.usuario_email,
        variante: m.variante_id,
        cantidad: m.cantidad,
        cantidad_base: m.cantidad_base,
        unidad: m.unidad,
        stock_antes: m.stock_antes,
        stock_despues: m.stock_despues,
        venta_id: m.venta_id,
        observaciones: m.observaciones || "",
        textoCantidad: formatEventQuantity(productoForFormat, m),
      });
    });

    historial.filter((h) => String(h.producto_id) === String(productoId)).forEach((h) => {
      eventos.push({
        tipo: h.accion,
        fecha: h.fecha,
        usuario: h.usuario_email,
        datos_anteriores: h.datos_anteriores,
        datos_nuevos: h.datos_nuevos,
      });
    });

    detalles.filter((d) => String(d.producto_id) === String(productoId)).forEach((d) => {
      eventos.push({
        tipo: "venta",
        fecha: d.created_at,
        usuario: d.usuario_email,
        variante: d.variante_id,
        cantidad: d.cantidad,
        cantidad_base: d.cantidad_base,
        unidad: d.unidad,
        textoCantidad: formatEventQuantity(productoForFormat, d),
      });
    });

    return eventos.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const scopeSucursal = (query) => activeSucursalId ? query.eq("sucursal_id", activeSucursalId) : query;
      const [prodsRes, detsRes, varsRes, movsRes] = await Promise.all([
        scopeSucursal(supabase.from("productos").select("user_id, nombre, stock, stock_inicial, unidad_base, unidades_alternativas, factor_conversion")),
        scopeSucursal(supabase.from("ventas_detalle").select("producto_id, cantidad, cantidad_base, unidad, variante_id, created_at, usuario_email")),
        scopeSucursal(supabase.from("producto_variantes").select("*")),
        scopeSucursal(supabase.from("stock_movimientos").select("*")),
      ]);

      setProductos(prodsRes.data || []);
      setDetalles(detsRes.data || []);
      setVariantes(varsRes.data || []);
      setMovimientos(movsRes.data || []);
      setLoading(false);
    }

    fetchData();
  }, [activeSucursalId]);

  useEffect(() => {
    if (!selected) {
      setHistorial([]);
      return;
    }

    async function fetchHistorial() {
      let query = supabase
        .from("productos_historial")
        .select("id, accion, datos_anteriores, datos_nuevos, usuario_email, fecha, producto_id")
        .eq("producto_id", selected.user_id)
        .order("fecha", { ascending: false });
      if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
      const { data } = await query;
      setHistorial(data || []);
    }

    fetchHistorial();
  }, [selected?.user_id, activeSucursalId]);

  const auditoria = useMemo(() => {
    const query = busqueda.trim().toLowerCase();
    const base = query
      ? productos.filter((p) => String(p.nombre || "").toLowerCase().includes(query) || String(p.user_id).includes(query))
      : productos;
    return base.map(auditarProducto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, variantes, detalles, movimientos, busqueda, historial]);

  const alertas = auditoria.filter((p) => statusForDifference(p.diferencia) === "revisar");
  const okCount = auditoria.length - alertas.length;
  const selectedAudit = selected ? auditoria.find((p) => String(p.user_id) === String(selected.user_id)) || selected : null;

  function updateSuggestions(value) {
    const query = value.trim().toLowerCase();
    if (!query) {
      setSugerencias([]);
      return;
    }
    setSugerencias(
      productos
        .filter((p) => String(p.nombre || "").toLowerCase().includes(query) || String(p.user_id).includes(query))
        .slice(0, 8)
    );
  }

  function renderAuditDetails(product) {
    if (!product) return null;

    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-inner">
        <div className="flex flex-col gap-2 border-b border-blue-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-black">{product.nombre}</h2>
            <p className="text-sm text-slate-600">ID {product.user_id}</p>
          </div>
          <span className={`w-fit rounded px-3 py-1 text-sm font-black ${statusForDifference(product.diferencia) === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
            {statusForDifference(product.diferencia) === "ok" ? "Stock cuadra" : "Hay diferencia"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Stock actual</p>
            <p className="mt-1 text-lg font-black">{formatQuantity(product, product.stockActual)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Stock calculado</p>
            <p className="mt-1 text-lg font-black">{formatQuantity(product, product.stockCalculado)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Diferencia</p>
            <p className={`mt-1 text-lg font-black ${statusForDifference(product.diferencia) === "ok" ? "text-emerald-700" : "text-red-700"}`}>
              {formatQuantity(product, product.diferencia)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Unidad</p>
            <p className="mt-1 text-lg font-black">{hasConversion(product) ? `${unitNames(product).base} / ${unitNames(product).alt}` : unitNames(product).base}</p>
          </div>
        </div>

        {product.detallePorVariante.length > 0 && (
          <div className="mt-5">
            <h3 className="font-black">Detalle por color</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white text-left">
                  <tr>
                    <th className="px-3 py-2">Color</th>
                    <th className="px-3 py-2">Actual</th>
                    <th className="px-3 py-2">Calculado</th>
                    <th className="px-3 py-2">Ventas</th>
                    <th className="px-3 py-2">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {product.detallePorVariante.map((v) => (
                    <tr key={v.id} className="border-b border-blue-100 bg-white/80">
                      <td className="px-3 py-2 font-bold">{v.color}</td>
                      <td className="px-3 py-2">{formatQuantity(product, v.actual)}</td>
                      <td className="px-3 py-2">{formatQuantity(product, v.calculado)}</td>
                      <td className="px-3 py-2">{formatQuantity(product, v.ventas, { compact: true })}</td>
                      <td className={`px-3 py-2 font-black ${statusForDifference(v.diferencia) === "ok" ? "text-emerald-700" : "text-red-700"}`}>
                        {formatQuantity(product, v.diferencia, { compact: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6">
          <h3 className="font-black">Movimientos y ventas recientes</h3>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
            {getEventos(product.user_id, product).length === 0 ? (
              <p className="text-sm text-slate-500">No hay eventos registrados para este producto.</p>
            ) : getEventos(product.user_id, product).slice(0, 80).map((event, index) => (
              <div key={`${event.tipo}-${event.fecha}-${index}`} className="rounded border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <p className="font-black capitalize">{String(event.tipo || "evento").replaceAll("_", " ")}</p>
                  <p className="text-xs text-slate-500">{formatDate(event.fecha)}</p>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                  {event.usuario && <span>Usuario: {event.usuario}</span>}
                  {event.variante && <span>Variante: {event.variante}</span>}
                  {event.textoCantidad && <span>Cantidad: {event.textoCantidad}</span>}
                  {event.stock_antes !== undefined && event.stock_despues !== undefined && (
                    <span>
                      Stock: {formatQuantity(product, event.stock_antes, { compact: true })} a {formatQuantity(product, event.stock_despues, { compact: true })}
                    </span>
                  )}
                  {event.venta_id && <span>Venta #{event.venta_id}</span>}
                </div>
                {event.observaciones && <p className="mt-1 text-xs italic text-slate-500">{event.observaciones}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-black">Auditoria de stock</h1>
          <p className="mt-1 text-sm text-slate-600">
            Busca un producto y revisa si lo que dice el sistema coincide con lo que deberia quedar por compras, ventas y ajustes.
          </p>
        </header>

        <section className="rounded-lg bg-white p-4 shadow">
          <div className="relative flex flex-col gap-3 md:flex-row">
            <input
              ref={inputRef}
              value={busqueda}
              onChange={(event) => {
                setBusqueda(event.target.value);
                updateSuggestions(event.target.value);
                setSelected(null);
              }}
              onFocus={() => updateSuggestions(busqueda)}
              placeholder="Buscar por nombre o codigo del producto"
              className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-500"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                updateSuggestions(busqueda);
                inputRef.current?.blur();
              }}
              className="rounded bg-slate-900 px-5 py-2 font-bold text-white hover:bg-slate-800"
            >
              Buscar
            </button>
            {busqueda && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  setSelected(null);
                  setSugerencias([]);
                }}
                className="rounded bg-slate-200 px-4 py-2 font-bold text-slate-800 hover:bg-slate-300"
              >
                Limpiar
              </button>
            )}

            {sugerencias.length > 0 && (
              <ul className="absolute left-0 top-12 z-20 max-h-72 w-full max-w-xl overflow-auto rounded border border-slate-200 bg-white shadow-lg">
                {sugerencias.map((p) => (
                  <li
                    key={p.user_id}
                    className="cursor-pointer px-3 py-2 hover:bg-blue-50"
                    onMouseDown={() => {
                      setBusqueda(p.nombre || String(p.user_id));
                      setSelected(p);
                      setSugerencias([]);
                    }}
                  >
                    <p className="font-bold">{p.nombre || "Producto sin nombre"}</p>
                    <p className="text-xs text-slate-500">ID {p.user_id}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {loading ? (
          <div className="rounded-lg bg-white p-8 text-center text-slate-500 shadow">Cargando auditoria...</div>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow">
                <p className="text-sm font-bold text-slate-500">Productos revisados</p>
                <p className="mt-1 text-3xl font-black">{auditoria.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow">
                <p className="text-sm font-bold text-emerald-700">Todo bien</p>
                <p className="mt-1 text-3xl font-black">{okCount}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow">
                <p className="text-sm font-bold text-red-700">Necesitan revision</p>
                <p className="mt-1 text-3xl font-black">{alertas.length}</p>
              </div>
            </section>

            <section className="overflow-x-auto rounded-lg bg-white shadow">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3">Producto</th>
                    <th className="px-3 py-3">Stock actual</th>
                    <th className="px-3 py-3">Stock calculado</th>
                    <th className="px-3 py-3">Diferencia</th>
                    <th className="px-3 py-3">Entradas</th>
                    <th className="px-3 py-3">Salidas</th>
                    <th className="px-3 py-3">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-slate-500">No se encontraron productos.</td>
                    </tr>
                  ) : auditoria.map((p) => {
                    const status = statusForDifference(p.diferencia);
                    const isExpanded = selectedAudit && String(selectedAudit.user_id) === String(p.user_id);
                    return (
                      <Fragment key={p.user_id}>
                        <tr
                          onClick={() => setSelected(isExpanded ? null : p)}
                          className={`cursor-pointer border-b hover:bg-blue-50 ${status === "revisar" ? "bg-red-50" : ""} ${isExpanded ? "bg-blue-50" : ""}`}
                        >
                          <td className="px-3 py-3">
                            <span className={`rounded px-2 py-1 text-xs font-black ${status === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {status === "ok" ? "OK" : "Revisar"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-black">{p.nombre}</p>
                            <p className="text-xs text-slate-500">ID {p.user_id}</p>
                          </td>
                          <td className="px-3 py-3 font-bold">{formatQuantity(p, p.stockActual)}</td>
                          <td className="px-3 py-3 font-bold">{formatQuantity(p, p.stockCalculado)}</td>
                          <td className={`px-3 py-3 font-black ${status === "ok" ? "text-emerald-700" : "text-red-700"}`}>
                            {formatQuantity(p, p.diferencia, { compact: true })}
                          </td>
                          <td className="px-3 py-3">{formatQuantity(p, p.ingresos, { compact: true })}</td>
                          <td className="px-3 py-3">{formatQuantity(p, p.salidas, { compact: true })}</td>
                          <td className="px-3 py-3">{formatQuantity(p, p.ventas, { compact: true })}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="bg-white px-3 py-4">
                              {renderAuditDetails(selectedAudit)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
