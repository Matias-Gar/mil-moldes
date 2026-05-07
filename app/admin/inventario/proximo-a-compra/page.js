"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/SupabaseClient";
import { Card, CardHeader, CardTitle, CardContent } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { whatsappUtils } from "../../../../lib/config";
import ExpandableDescription from "../../../../components/ui/ExpandableDescription";
import { getOptimizedImageUrl, buildImageSrcSet } from "../../../../lib/imageOptimization";
import { useSucursalActiva } from "../../../../components/admin/SucursalContext";

export default function ProximoACompraPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [productos, setProductos] = useState([]);
  const [imagenes, setImagenes] = useState({});

  useEffect(() => {
    async function fetchProductos() {
      let query = supabase
        .from("productos")
        .select("user_id, nombre, descripcion, precio, stock, categoria");
      if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
      const { data, error } = await query;
      if (!error && data) {
        const bajos = data.filter(p => Number(p.stock) < 3);
        setProductos(bajos);
        // Obtener imágenes
        const ids = bajos.map(p => p.user_id);
        if (ids.length > 0) {
          let imgsQuery = supabase
            .from("producto_imagenes")
            .select("producto_id, imagen_url")
            .in("producto_id", ids);
          if (activeSucursalId) imgsQuery = imgsQuery.eq("sucursal_id", activeSucursalId);
          const { data: imgs } = await imgsQuery;
          if (imgs) {
            const agrupadas = {};
            imgs.forEach(img => {
              if (!agrupadas[img.producto_id]) agrupadas[img.producto_id] = [];
              agrupadas[img.producto_id].push(img.imagen_url);
            });
            setImagenes(agrupadas);
          }
        }
      }
    }
    fetchProductos();
  }, [activeSucursalId]);

  const enviarWhatsapp = (prod) => {
    const mensaje = `Hola, necesito reponer el producto: ${prod.nombre} (Stock actual: ${prod.stock})`;
    whatsappUtils.sendToBusinessWhatsApp(mensaje);
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-4">Productos próximos a compra</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {productos.length === 0 ? (
          <div className="col-span-full text-gray-900">No hay productos con stock bajo.</div>
        ) : (
          productos.map(prod => (
            <Card key={prod.user_id}>
              <CardHeader>
                <CardTitle className="text-gray-900">{prod.nombre}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-2 text-gray-900">
                  {imagenes[prod.user_id]?.[0] ? (
                    <img
                      src={getOptimizedImageUrl(imagenes[prod.user_id][0], 320)}
                      srcSet={buildImageSrcSet(imagenes[prod.user_id][0], [160, 320, 640], { quality: 95, format: "origin" })}
                      sizes="128px"
                      loading="lazy"
                      decoding="async"
                      alt="img"
                      className="h-32 w-32 object-cover rounded-lg border shadow"
                    />
                  ) : (
                    <span className="text-gray-400">Sin imagen</span>
                  )}
                    <ExpandableDescription
                      text={prod.descripcion}
                      lines={3}
                      className="mt-2"
                      textClassName="text-gray-900 text-sm"
                      buttonClassName="mt-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    />
                  <div className="text-gray-900 font-bold">Bs {Number(prod.precio).toFixed(2)}</div>
                  <div className="text-red-600 font-bold">Stock: {prod.stock}</div>
                  <div className="text-gray-900">Categoría: {prod.categoria || '-'}</div>
                  <Button onClick={() => enviarWhatsapp(prod)} className="w-full bg-green-700 hover:bg-green-800 text-white font-bold mt-2">Enviar mensaje de compra</Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
