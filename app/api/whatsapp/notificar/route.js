import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuración de Supabase directa
const supabaseUrl = 'https://gzvtuenpwndodnetnmzi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6dnR1ZW5wd25kb2RuZXRubXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MDUwODIsImV4cCI6MjA3NDA4MTA4Mn0.94z7ObbDdYydDTLtp5qZxIsB3XqFgGUBTxdP9pcf8z4';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

export async function POST(request) {
  try {
    const { tipo, datos } = await request.json();

    let mensaje = '';
    
    switch (tipo) {
      case 'nuevo_producto':
        mensaje = await generarMensajeNuevoProducto(datos);
        break;
      case 'promocion_activada':
        mensaje = await generarMensajeNuevaPromocion(datos);
        break;
      case 'promocion_desactivada':
        mensaje = await generarMensajePromocionTerminada(datos);
        break;
      case 'stock_bajo':
        mensaje = await generarMensajeStockBajo(datos);
        break;
      case 'catalogo_actualizado':
        mensaje = await generarMensajeCatalogoActualizado();
        break;
      default:
        return NextResponse.json({ error: 'Tipo de notificación no válido' }, { status: 400 });
    }

    // Aquí puedes agregar lógica para enviar el mensaje a una lista de suscriptores
    // Por ahora, devolvemos el mensaje generado
    
    return NextResponse.json({
      success: true,
      mensaje,
      tipo
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function generarMensajeNuevoProducto(producto) {
  return `🆕 *¡NUEVO PRODUCTO DISPONIBLE!* 🆕

✨ *${producto.nombre}*
📝 ${producto.descripcion}
💰 *Bs ${Number(producto.precio).toFixed(2)}*
📂 Categoría: ${producto.categoria}
📦 Stock: ${producto.stock}

¡Ya disponible en nuestro catálogo! 

Escribe *catalogo* para ver todos nuestros productos 🛍️`;
}

async function generarMensajeNuevaPromocion(promocion) {
  const { data: producto } = await supabase
    .from('productos')
    .select(`
      nombre,
      descripcion,
      precio,
      categorias (categori)
    `)
    .eq('user_id', promocion.producto_id)
    .single();

  if (!producto) return '';

  let precioFinal = producto.precio;
  switch (promocion.tipo) {
    case 'descuento':
      precioFinal = producto.precio * (1 - promocion.valor / 100);
      break;
    case 'precio_fijo':
      precioFinal = promocion.valor;
      break;
    case 'descuento_absoluto':
      precioFinal = Math.max(0, producto.precio - promocion.valor);
      break;
  }

  const descuentoPorcentaje = ((producto.precio - precioFinal) / producto.precio * 100).toFixed(0);

  return `🔥 *¡NUEVA OFERTA ESPECIAL!* 🔥

🎯 *${producto.nombre}*
📝 ${producto.descripcion}

💰 ~~Bs ${Number(producto.precio).toFixed(2)}~~ → *Bs ${Number(precioFinal).toFixed(2)}*
🏷️ *${descuentoPorcentaje}% OFF*

${promocion.descripcion ? `✨ ${promocion.descripcion}` : ''}

⏰ *¡Oferta por tiempo limitado!*
¡Aprovecha ya! Escribe el nombre del producto para hacer tu pedido 🛒`;
}

async function generarMensajePromocionTerminada(producto) {
  return `⏰ *OFERTA TERMINADA* ⏰

La promoción especial para *${producto.nombre}* ha finalizado.

💰 Precio regular: *Bs ${Number(producto.precio).toFixed(2)}*

¡Pero no te preocupes! Tenemos otras ofertas esperándote.
Escribe *promociones* para ver las ofertas activas 🔥`;
}

async function generarMensajeStockBajo(producto) {
  return `⚠️ *¡ÚLTIMAS UNIDADES!* ⚠️

*${producto.nombre}*
📦 Solo quedan ${producto.stock} unidades

💰 Bs ${Number(producto.precio).toFixed(2)}

¡No te quedes sin el tuyo! Haz tu pedido ahora 🏃‍♀️💨`;
}

async function generarMensajeCatalogoActualizado() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/whatsapp/catalogo`);
  const data = await response.json();

  return `📢 *¡CATÁLOGO ACTUALIZADO!* 📢

Hemos actualizado nuestro catálogo con:
• ${data.total_productos} productos disponibles
• ${data.productos_con_promocion} productos en oferta
• ${data.total_categorias} categorías

Escribe *catalogo* para ver todas las novedades 🛍️✨`;
}