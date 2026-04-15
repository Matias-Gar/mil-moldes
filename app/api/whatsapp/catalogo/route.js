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

// Función para calcular precio con promoción (copiada localmente)
function calcularPrecioConPromocion(producto, promociones) {
  const promocionActiva = promociones.find(
    promo => 
      promo.producto_id === producto.user_id && 
      promo.activa === true &&
      (!promo.fecha_fin || new Date(promo.fecha_fin) >= new Date())
  );

  if (!promocionActiva) {
    return {
      precioOriginal: producto.precio,
      precioFinal: producto.precio,
      tienePromocion: false,
      promocion: null
    };
  }

  let precioFinal = producto.precio;

  switch (promocionActiva.tipo) {
    case 'descuento':
      precioFinal = producto.precio * (1 - promocionActiva.valor / 100);
      break;
    case 'precio_fijo':
      precioFinal = promocionActiva.valor;
      break;
    case 'descuento_absoluto':
      precioFinal = Math.max(0, producto.precio - promocionActiva.valor);
      break;
    default:
      precioFinal = producto.precio;
  }

  return {
    precioOriginal: producto.precio,
    precioFinal: Math.max(0, precioFinal),
    tienePromocion: true,
    promocion: promocionActiva,
    descuento: producto.precio - precioFinal,
    porcentajeDescuento: ((producto.precio - precioFinal) / producto.precio * 100).toFixed(0)
  };
}

export async function GET() {
  try {
    // 1. Obtener productos de la base de datos
    const { data: productos, error: productosError } = await supabase
      .from('productos')
      .select(`
        user_id,
        nombre,
        descripcion,
        precio,
        stock,
        categorias (
          id,
          categori
        )
      `)
      .gt('stock', 0); // Solo productos con stock

    if (productosError) {
      throw new Error(`Error al obtener productos: ${productosError.message}`);
    }

    // 2. Obtener promociones activas
    const { data: promociones, error: promocionesError } = await supabase
      .from('promociones')
      .select('*')
      .eq('activa', true);

    if (promocionesError) {
      console.warn('Error al obtener promociones:', promocionesError.message);
    }

    // 3. Obtener imágenes de productos
    const productIds = productos.map(p => p.user_id);
    const { data: imagenes, error: imagenesError } = await supabase
      .from('producto_imagenes')
      .select('producto_id, imagen_url')
      .in('producto_id', productIds);

    if (imagenesError) {
      console.warn('Error al obtener imágenes:', imagenesError.message);
    }

    // 4. Agrupar imágenes por producto
    const imagenesAgrupadas = {};
    if (imagenes) {
      imagenes.forEach(img => {
        if (!imagenesAgrupadas[img.producto_id]) {
          imagenesAgrupadas[img.producto_id] = [];
        }
        imagenesAgrupadas[img.producto_id].push(img.imagen_url);
      });
    }

    // 5. Generar catálogo formateado para WhatsApp
    const catalogoCompleto = productos.map(producto => {
      const precioInfo = calcularPrecioConPromocion(producto, promociones || []);
      const categoria = producto.categorias?.categori || 'Sin categoría';
      const imagenPrincipal = imagenesAgrupadas[producto.user_id]?.[0] || null;

      return {
        id: producto.user_id,
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        categoria: categoria,
        precio_original: Number(producto.precio).toFixed(2),
        precio_final: Number(precioInfo.precioFinal).toFixed(2),
        tiene_promocion: precioInfo.tienePromocion,
        descuento_porcentaje: precioInfo.tienePromocion ? precioInfo.porcentajeDescuento : null,
        descuento_monto: precioInfo.tienePromocion ? precioInfo.descuento.toFixed(2) : null,
        stock: producto.stock,
        imagen: imagenPrincipal,
        promocion_descripcion: precioInfo.promocion?.descripcion || null
      };
    });

    // 6. Agrupar por categorías
    const categorias = {};
    catalogoCompleto.forEach(producto => {
      if (!categorias[producto.categoria]) {
        categorias[producto.categoria] = [];
      }
      categorias[producto.categoria].push(producto);
    });

    // 7. Generar texto del catálogo para WhatsApp
    let catalogoTexto = "🛍️ *CATÁLOGO DE PRODUCTOS* 🛍️\n\n";
    catalogoTexto += "💰 *Productos con promociones activas tienen descuentos especiales*\n\n";

    Object.keys(categorias).forEach(nombreCategoria => {
      catalogoTexto += `📂 *${nombreCategoria.toUpperCase()}*\n`;
      catalogoTexto += "━━━━━━━━━━━━━━━━━━━━━━\n";
      
      categorias[nombreCategoria].forEach((producto, index) => {
        catalogoTexto += `${index + 1}. *${producto.nombre}*\n`;
        catalogoTexto += `📝 ${producto.descripcion}\n`;
        
        if (producto.tiene_promocion) {
          catalogoTexto += `💰 ~~Bs ${producto.precio_original}~~ *Bs ${producto.precio_final}*\n`;
          catalogoTexto += `🏷️ *${producto.descuento_porcentaje}% OFF* (Ahorras Bs ${producto.descuento_monto})\n`;
          if (producto.promocion_descripcion) {
            catalogoTexto += `🎯 ${producto.promocion_descripcion}\n`;
          }
        } else {
          catalogoTexto += `💰 *Bs ${producto.precio_final}*\n`;
        }
        
        catalogoTexto += `📦 Stock: ${producto.stock}\n`;
        catalogoTexto += "\n";
      });
      
      catalogoTexto += "\n";
    });

    catalogoTexto += "📱 *¿Cómo hacer tu pedido?*\n";
    catalogoTexto += "1️⃣ Dime qué productos quieres\n";
    catalogoTexto += "2️⃣ Te confirmo disponibilidad y total\n";
    catalogoTexto += "3️⃣ Coordinamos entrega\n\n";
    catalogoTexto += "🚀 *También puedes hacer tu pedido online:*\n";
    catalogoTexto += `${process.env.NEXT_PUBLIC_APP_URL || 'https://tu-tienda.com'}/productos\n\n`;
    catalogoTexto += "¡Gracias por tu preferencia! 💕";

    // 8. Respuesta con diferentes formatos
    const respuesta = {
      success: true,
      timestamp: new Date().toISOString(),
      total_productos: catalogoCompleto.length,
      total_categorias: Object.keys(categorias).length,
      productos_con_promocion: catalogoCompleto.filter(p => p.tiene_promocion).length,
      data: {
        catalogo_completo: catalogoCompleto,
        por_categorias: categorias,
        texto_whatsapp: catalogoTexto,
        resumen: {
          total_productos: catalogoCompleto.length,
          categorias: Object.keys(categorias),
          promociones_activas: catalogoCompleto.filter(p => p.tiene_promocion).length
        }
      }
    };

    return NextResponse.json(respuesta);

  } catch (error) {
    console.error('Error al generar catálogo WhatsApp:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}