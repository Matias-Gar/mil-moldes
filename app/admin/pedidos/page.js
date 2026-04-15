"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/SupabaseClient";

export default function PedidosPage() {
  const [carritos, setCarritos] = useState([]);
  const router = useRouter();

  useEffect(() => {
    fetchCarritos();
  }, []);

  async function fetchCarritos() {
    const { data, error } = await supabase
      .from("carritos_pendientes")
      .select("id, cliente_nombre, usuario_email, productos, fecha, confirmado_pago")
      .order("fecha", { ascending: false });
    
    if (!error && data) {
      const currentDate = new Date();

      // Elimina los carritos que han pasado más de 5 días sin confirmación de pago
      const carritosActualizados = data.filter(carrito => {
        const carritoDate = new Date(carrito.fecha);
        const diferenciaEnDias = (currentDate - carritoDate) / (1000 * 3600 * 24); // Diferencia en días
        return diferenciaEnDias <= 5 && !carrito.confirmado_pago;  // El carrito es válido solo si no ha pasado más de 5 días y no está confirmado
      });

      setCarritos(carritosActualizados);

      // Eliminar carritos vencidos
      const carritosVencidos = data.filter(carrito => {
        const carritoDate = new Date(carrito.fecha);
        const diferenciaEnDias = (currentDate - carritoDate) / (1000 * 3600 * 24); // Diferencia en días
        return diferenciaEnDias > 5 && !carrito.confirmado_pago;  // Si el carrito está vencido y no tiene pago confirmado
      });

      // Eliminar los carritos vencidos de la base de datos
      for (const carrito of carritosVencidos) {
        await supabase.from("carritos_pendientes").delete().eq("id", carrito.id);
      }
    }
  }

  async function eliminarCarrito(id) {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este pedido? Esta acción no se puede deshacer.")) return;
    await supabase.from("carritos_pendientes").delete().eq("id", id);
    fetchCarritos();
  }

  function efectivizarVenta(carrito) {
    // Guardar el pedido en sessionStorage y redirigir a ventas/nueva
    sessionStorage.setItem('pedido_a_efectivizar', JSON.stringify(carrito));
    router.push('/admin/ventas/nueva');
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start py-8 px-2 bg-gray-100">
      <h1 className="text-3xl font-extrabold mb-8 text-gray-900 w-full text-center">Pedidos Pendientes</h1>
      <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {carritos.length === 0 ? (
          <div className="text-gray-900 mb-4 col-span-full">No hay pedidos pendientes.</div>
        ) : (
          carritos.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-xl border border-gray-900 p-4 flex flex-col gap-2">
              <div className="font-bold text-lg text-blue-900 mb-1">Pedido #{c.id}</div>
              <div className="text-gray-900 font-semibold">Cliente: {c.cliente_nombre || `Pedido #${c.id}`}</div>
              <div className="text-gray-700 text-sm mb-1">Email: {c.usuario_email || '-'}</div>
              <div className="text-gray-900 text-sm mb-1">Fecha: {new Date(c.fecha).toLocaleString()}</div>
              <div className="mb-2">
                <div className="font-bold text-gray-800">Productos:</div>
                <ul className="list-disc pl-4">
                  {Array.isArray(c.productos) ? c.productos.map((p, i) => (
                    <li key={i} className="text-gray-900">
                      {p.producto_id} {p.color ? `(${p.color})` : ''} x{p.cantidad} (Bs {Number(p.precio_unitario).toFixed(2)})
                    </li>
                  )) : null}
                </ul>
              </div>
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => efectivizarVenta(c)}
                  className="flex-1 bg-blue-700 hover:bg-blue-800 text-white px-3 py-2 rounded font-bold disabled:opacity-60"
                >
                  Efectivizar venta
                </button>
                <button onClick={() => eliminarCarrito(c.id)} className="flex-1 bg-red-700 hover:bg-red-800 text-white px-3 py-2 rounded font-bold">Eliminar</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
