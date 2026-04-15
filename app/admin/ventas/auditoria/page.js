"use client";


import { useEffect, useState, useRef } from "react";
import { supabase } from "../../../../lib/SupabaseClient";

export default function AuditoriaStockPage() {
  const [productos, setProductos] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [variantes, setVariantes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtrados, setFiltrados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [sugerencias, setSugerencias] = useState([]);
  const inputRef = useRef();

  // Auditoría contable universal: stock_actual = stock_inicial + ingresos - salidas
  // stock_inicial: productos.stock_inicial
  // ingresos: suma de stock_movimientos tipo 'ingreso' para el producto
  // salidas: suma de stock_movimientos tipo 'salida' y ventas para el producto

  // Auditoría extendida y detallada
  const auditarProducto = (producto) => {
    const vars = variantes.filter(v => v.producto_id === producto.user_id)
      .sort((a, b) => String(a.color || '').localeCompare(String(b.color || ''), 'es', { sensitivity: 'base' }));
    const ventasProducto = detalles.filter(d => d.producto_id === producto.user_id);
    // Stock inicial por variante y total
    const stockInicialTotal = vars.reduce((sum, v) => sum + (Number(v.stock_inicial) || 0), 0);
    // Stock actual por variante y total
    const stockActualTotal = vars.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    // Ventas por variante y total
    const ventasPorVariante = vars.map(v => {
      const ventas = detalles.filter(d => d.variante_id === v.id).reduce((sum, d) => sum + Number(d.cantidad), 0);
      return { color: v.color, ventas, id: v.id };
    });
    const ventasTotal = ventasPorVariante.reduce((sum, v) => sum + v.ventas, 0);
    // Stock calculado por variante y total
    const stockCalculadoPorVariante = vars.map((v, i) => {
      const ventas = ventasPorVariante[i].ventas;
      const inicial = Number(v.stock_inicial) || 0;
      return { color: v.color, calculado: inicial - ventas, id: v.id };
    });
    const stockCalculadoTotal = stockInicialTotal - ventasTotal;
    // Diferencia por variante y total
    const diferenciaPorVariante = vars.map((v, i) => {
      const actual = Number(v.stock) || 0;
      const calculado = stockCalculadoPorVariante[i].calculado;
      return { color: v.color, diferencia: actual - calculado, id: v.id };
    });
    const diferenciaTotal = stockActualTotal - stockCalculadoTotal;

    return {
      ...producto,
      variantes: vars,
      stockInicialTotal,
      stockActualTotal,
      ventasPorVariante,
      ventasTotal,
      stockCalculadoPorVariante,
      stockCalculadoTotal,
      diferenciaPorVariante,
      diferenciaTotal
    };
  };


  // Línea de tiempo extendida
  const getEventos = (productoId) => {
    const eventos = [];
    // Movimientos de stock
    movimientos.filter(m => m.producto_id === productoId).forEach(m => {
      eventos.push({
        tipo: m.tipo,
        fecha: m.created_at,
        usuario: m.usuario_email,
        variante: m.variante_id,
        cantidad: m.cantidad,
        observaciones: m.observaciones || ""
      });
    });
    // Historial de producto (creación, edición)
    historial.filter(h => h.producto_id === productoId).forEach(h => {
      eventos.push({
        tipo: h.accion,
        fecha: h.fecha,
        usuario: h.usuario_email,
        datos_anteriores: h.datos_anteriores,
        datos_nuevos: h.datos_nuevos
      });
    });
    // Ventas
    detalles.filter(d => d.producto_id === productoId).forEach(d => {
      eventos.push({
        tipo: "venta",
        fecha: d.created_at,
        usuario: d.usuario_email,
        variante: d.variante_id,
        cantidad: d.cantidad
      });
    });
    // Ordenar cronológicamente ascendente
    return eventos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // Traer productos con stock_inicial
      const { data: prods } = await supabase.from("productos").select("user_id, nombre, stock, stock_inicial");
      // Traer ventas detalle (incluyendo usuario_email)
      const { data: dets } = await supabase.from("ventas_detalle").select("producto_id, cantidad, variante_id, created_at, usuario_email");
      // Traer variantes
      const { data: vars } = await supabase.from("producto_variantes").select("*");
      // Traer movimientos de stock
      const { data: movs } = await supabase.from("stock_movimientos").select("*");
      setProductos(prods || []);
      setDetalles(dets || []);
      setVariantes(vars || []);
      setMovimientos(movs || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!selected) {
      setMovimientos([]);
      setHistorial([]);
      return;
    }
    async function fetchMovimientos() {
      const { data } = await supabase.from("stock_movimientos").select("id, tipo, cantidad, usuario_email, observaciones, created_at, producto_id").eq("producto_id", selected.user_id).order("created_at", { ascending: false });
      setMovimientos(data || []);
    }
    async function fetchHistorial() {
      const { data } = await supabase.from("productos_historial").select("id, accion, datos_anteriores, datos_nuevos, usuario_email, fecha, producto_id").eq("producto_id", selected.user_id).order("fecha", { ascending: false });
      setHistorial(data || []);
    }
    fetchMovimientos();
    fetchHistorial();
  }, [selected]);

  useEffect(() => {
    const b = busqueda.toLowerCase();
    if (!busqueda) {
      setFiltrados(productos);
    } else {
      setFiltrados(productos.filter(p => p.nombre?.toLowerCase().includes(b) || String(p.user_id).includes(b)));
    }
    setSelected(null);
  }, [busqueda, productos]);

  const auditoria = (filtrados || []).map(auditarProducto);
  const alertas = auditoria.filter(p => p.diferencia !== 0 || Math.abs(p.diferencia) > 10);

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-4">Auditoría de Stock</h1>
      <div className="mb-4 flex gap-2 items-center relative">
        <input
          ref={inputRef}
          className="border rounded px-3 py-2 w-full max-w-md text-gray-900 placeholder-gray-600"
          placeholder="Buscar producto por nombre o ID..."
          value={busqueda}
          onChange={e => {
            const valor = e.target.value;
            setBusqueda(valor);
            if (valor.length > 0) {
              const b = valor.toLowerCase();
              setSugerencias(productos.filter(p => p.nombre?.toLowerCase().includes(b) || String(p.user_id).includes(b)).slice(0, 8));
            } else {
              setSugerencias([]);
            }
          }}
          onFocus={() => {
            if (busqueda.length > 0) {
              const b = busqueda.toLowerCase();
              setSugerencias(productos.filter(p => p.nombre?.toLowerCase().includes(b) || String(p.user_id).includes(b)).slice(0, 8));
            }
          }}
          autoFocus
        />
        <button
          className="ml-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => {
            const b = busqueda.toLowerCase();
            setFiltrados(productos.filter(p => p.nombre?.toLowerCase().includes(b) || String(p.user_id).includes(b)));
            setSelected(null);
            setBusqueda(busqueda);
            inputRef.current.blur();
          }}
        >Buscar</button>
        {busqueda && (
          <button
            className="ml-2 px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-gray-700"
            onClick={() => {
              setBusqueda("");
              setFiltrados(productos);
              setSelected(null);
              setSugerencias([]);
            }}
            title="Limpiar búsqueda"
          >
            Limpiar
          </button>
        )}
        {sugerencias.length > 0 && (
          <ul className="absolute z-10 bg-white border rounded shadow w-full max-w-md mt-12 left-0">
            {sugerencias.map((p, idx) => (
              <li
                key={p.user_id}
                className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-gray-900"
                onMouseDown={() => {
                  setBusqueda(p.nombre);
                  setFiltrados([p]);
                  setSelected(null);
                  setSugerencias([]);
                }}
              >
                {p.nombre}
              </li>
            ))}
          </ul>
        )}
      </div>
      {loading ? (
        <div>Cargando...</div>
      ) : (
        <>
          {alertas.length > 0 && (
            <div className="mb-4 bg-red-100 text-red-700 p-4 rounded-xl font-semibold shadow">
              ⚠️ {alertas.length} productos con diferencia de stock detectados
            </div>
          )}
          <div className="mb-4 bg-white p-4 rounded-xl shadow text-gray-900">
            <div className="font-bold mb-2">Resumen de auditoría</div>
            <ul className="list-disc list-inside text-sm">
              <li>Total productos auditados: {auditoria.length}</li>
              <li>Productos con diferencia: {alertas.length}</li>
              <li>Recomendación: Revisa los productos en rojo y corrige el stock si es necesario.</li>
            </ul>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Nombre</th>
                  <th className="px-4 py-2">Stock Inicial</th>
                  <th className="px-4 py-2">Ingresos</th>
                  <th className="px-4 py-2">Salidas</th>
                  <th className="px-4 py-2">Ventas</th>
                  <th className="px-4 py-2">Stock Actual</th>
                  <th className="px-4 py-2">Stock Calculado</th>
                  <th className="px-4 py-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-500 py-6">
                      No se encontraron productos.
                    </td>
                  </tr>
                ) : (
                  auditoria.map(p => (
                    <tr key={p.user_id} className={p.diferencia !== 0 ? "bg-red-100 cursor-pointer" : "cursor-pointer"} onClick={() => setSelected(p)}>
                      <td className="px-4 py-2 font-bold text-gray-800">{p.user_id}</td>
                      <td className="px-4 py-2 font-bold text-gray-800">{p.nombre}</td>
                      <td className="px-4 py-2">{p.stockInicial}</td>
                      <td className="px-4 py-2">{p.ingresos}</td>
                      <td className="px-4 py-2">{p.salidas}</td>
                      <td className="px-4 py-2">{p.ventas}</td>
                      <td className="px-4 py-2">{p.stockActual}</td>
                      <td className="px-4 py-2">{p.stockCalculado}</td>
                      <td className={p.diferencia !== 0 ? "px-4 py-2 font-bold text-red-600" : "px-4 py-2 text-green-600"}>{p.diferencia}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {selected && (
            <div className="mt-8 bg-white rounded-xl shadow p-6 text-gray-900">
              <h2 className="text-lg font-bold mb-2">{selected.nombre} (ID: {selected.user_id})</h2>
              <div className="mb-2">
                <b>Stock inicial total:</b> {selected.stockInicialTotal}
                <ul className="ml-4 text-sm">
                  {selected.variantes.map(v => (
                    <li key={v.id}>- {v.color || 'Único'}: {v.stock_inicial ?? 0}</li>
                  ))}
                </ul>
              </div>
              <div className="mb-2">
                <b>Stock actual total:</b> {selected.stockActualTotal}
                <ul className="ml-4 text-sm">
                  {selected.variantes.map(v => (
                    <li key={v.id}>- {v.color || 'Único'}: {v.stock ?? 0}</li>
                  ))}
                </ul>
              </div>
              <div className="mb-2">
                <b>Ventas totales:</b> {selected.ventasTotal}
                <ul className="ml-4 text-sm">
                  {selected.ventasPorVariante.map(v => (
                    <li key={v.id}>- {v.color || 'Único'}: {v.ventas}</li>
                  ))}
                </ul>
              </div>
              <div className="mb-2">
                <b>Stock calculado total:</b> {selected.stockCalculadoTotal}
                <ul className="ml-4 text-sm">
                  {selected.stockCalculadoPorVariante.map(v => (
                    <li key={v.id}>- {v.color || 'Único'}: {v.calculado}</li>
                  ))}
                </ul>
              </div>
              <div className="mb-2">
                <b>Diferencia total:</b> <span className={selected.diferenciaTotal !== 0 ? "text-red-700" : "text-green-700"}>{selected.diferenciaTotal}</span>
                <ul className="ml-4 text-sm">
                  {selected.diferenciaPorVariante.map(v => (
                    <li key={v.id}>- {v.color || 'Único'}: <span className={v.diferencia !== 0 ? "text-red-700" : "text-green-700"}>{v.diferencia}</span></li>
                  ))}
                </ul>
              </div>
              <h3 className="mt-6 font-semibold">Línea de tiempo de eventos</h3>
              <ol className="border-l-2 border-blue-400 pl-4">
                {getEventos(selected.user_id).length === 0 && (
                  <li className="text-gray-500">No hay eventos registrados para este producto.</li>
                )}
                {getEventos(selected.user_id).map((e, idx) => (
                  <li key={idx} className="mb-2 relative">
                    <span className="absolute -left-4 top-1 w-2 h-2 rounded-full bg-blue-400"></span>
                    <span className="font-bold capitalize">{e.tipo}</span> <span className="text-xs text-gray-500">({new Date(e.fecha).toLocaleString()})</span>
                    {e.usuario && <span className="ml-2 text-xs text-blue-700">{e.usuario}</span>}
                    {e.variante && <span className="ml-2 text-xs text-purple-700">Variante: {e.variante}</span>}
                    {e.cantidad !== undefined && <span className="ml-2 text-xs">Cantidad: {e.cantidad}</span>}
                    {e.observaciones && <span className="ml-2 text-xs italic text-gray-500">{e.observaciones}</span>}
                    {e.datos_anteriores && <span className="ml-2 text-xs text-orange-700">(Antes: {JSON.stringify(e.datos_anteriores)})</span>}
                    {e.datos_nuevos && <span className="ml-2 text-xs text-green-700">(Ahora: {JSON.stringify(e.datos_nuevos)})</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
      <div className="mt-8 text-sm text-gray-700">
        <p>• Si la diferencia es distinta de 0, hay un posible error de stock.</p>
        <p>• Puedes buscar por nombre o ID para auditar un producto específico. Haz clic en una fila para ver el historial.</p>
      </div>
    </div>
  );
}
