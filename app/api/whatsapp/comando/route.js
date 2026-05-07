import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuración de Supabase directa
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase para WhatsApp.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
import { calcularPrecioConPromocion } from '../../../../lib/promociones';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const comando = searchParams.get('comando') || 'catalogo';
    const categoria = searchParams.get('categoria');
    const formato = searchParams.get('formato') || 'texto'; // texto, json, imagen

    let respuesta;

    switch (comando.toLowerCase()) {
      case 'catalogo':
        respuesta = await generarCatalogoCompleto(formato, categoria);
        break;
      case 'promociones':
        respuesta = await generarCatalogoPromociones(formato);
        break;
      case 'categorias':
        respuesta = await listarCategorias();
        break;
      case 'categoria':
        if (!categoria) {
          return NextResponse.json({ error: 'Especifica una categoría' }, { status: 400 });
        }
        respuesta = await generarCatalogoPorCategoria(categoria, formato);
        break;
      case 'stock':
        respuesta = await generarReporteStock();
        break;
      default:
        return NextResponse.json({ error: 'Comando no reconocido' }, { status: 400 });
    }

    return NextResponse.json(respuesta);

  } catch (error) {
    console.error('Error en comando WhatsApp:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function obtenerProductosConDatos() {
  // Obtener productos
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
    .gt('stock', 0);

  if (productosError) throw new Error(`Error al obtener productos: ${productosError.message}`);

  // Obtener promociones
  const { data: promociones } = await supabase
    .from('promociones')
    .select('*')
    .eq('activa', true);

  // Obtener imágenes
  const productIds = productos.map(p => p.user_id);
  const { data: imagenes } = await supabase
    .from('producto_imagenes')
    .select('producto_id, imagen_url')
    .in('producto_id', productIds);

  // Agrupar imágenes
  const imagenesAgrupadas = {};
  if (imagenes) {
    imagenes.forEach(img => {
      if (!imagenesAgrupadas[img.producto_id]) {
        imagenesAgrupadas[img.producto_id] = [];
      }
      imagenesAgrupadas[img.producto_id].push(img.imagen_url);
    });
  }

  // Procesar productos
  return productos.map(producto => {
    const precioInfo = calcularPrecioConPromocion(producto, promociones || []);
    return {
      id: producto.user_id,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      categoria: producto.categorias?.categori || 'Sin categoría',
      precio_original: Number(producto.precio).toFixed(2),
      precio_final: Number(precioInfo.precioFinal).toFixed(2),
      tiene_promocion: precioInfo.tienePromocion,
      descuento_porcentaje: precioInfo.tienePromocion ? precioInfo.porcentajeDescuento : null,
      descuento_monto: precioInfo.tienePromocion ? precioInfo.descuento.toFixed(2) : null,
      stock: producto.stock,
      imagen: imagenesAgrupadas[producto.user_id]?.[0] || null,
      promocion_descripcion: precioInfo.promocion?.descripcion || null
    };
  });
}

async function generarCatalogoCompleto(formato, categoriaFiltro) {
  const productos = await obtenerProductosConDatos();
  
  let productosFiltrados = productos;
  if (categoriaFiltro) {
    productosFiltrados = productos.filter(p => 
      p.categoria.toLowerCase().includes(categoriaFiltro.toLowerCase())
    );
  }

  if (formato === 'json') {
    return { productos: productosFiltrados };
  }

  // Generar texto para WhatsApp
  let texto = categoriaFiltro 
    ? `🛍️ *CATÁLOGO - ${categoriaFiltro.toUpperCase()}* 🛍️\n\n`
    : "🛍️ *CATÁLOGO COMPLETO* 🛍️\n\n";

  // Agrupar por categorías
  const categorias = {};
  productosFiltrados.forEach(producto => {
    if (!categorias[producto.categoria]) {
      categorias[producto.categoria] = [];
    }
    categorias[producto.categoria].push(producto);
  });

  Object.keys(categorias).forEach(nombreCategoria => {
    texto += `📂 *${nombreCategoria.toUpperCase()}*\n`;
    texto += "━━━━━━━━━━━━━━━━━━━━━━\n";
    
    categorias[nombreCategoria].forEach((producto, index) => {
      texto += `${index + 1}. *${producto.nombre}*\n`;
      texto += `📝 ${producto.descripcion}\n`;
      
      if (producto.tiene_promocion) {
        texto += `💰 ~~Bs ${producto.precio_original}~~ *Bs ${producto.precio_final}*\n`;
        texto += `🔥 *${producto.descuento_porcentaje}% OFF*\n`;
      } else {
        texto += `💰 *Bs ${producto.precio_final}*\n`;
      }
      
      texto += `📦 Stock: ${producto.stock}\n\n`;
    });
    
    texto += "\n";
  });

  texto += "📱 *Para hacer tu pedido escribe:*\n";
  texto += "\"Quiero: [nombre del producto] x [cantidad]\"\n\n";
  texto += "💬 *Más comandos útiles:*\n";
  texto += "• /promociones - Ver solo ofertas\n";
  texto += "• /categorias - Ver todas las categorías\n";
  texto += "• /categoria [nombre] - Ver productos de una categoría\n\n";

  return { 
    texto_whatsapp: texto,
    total_productos: productosFiltrados.length,
    categorias: Object.keys(categorias)
  };
}

async function generarCatalogoPromociones(formato) {
  const productos = await obtenerProductosConDatos();
  const promociones = productos.filter(p => p.tiene_promocion);

  if (formato === 'json') {
    return { promociones };
  }

  let texto = "🔥 *OFERTAS ESPECIALES* 🔥\n\n";
  
  if (promociones.length === 0) {
    texto += "😔 No hay promociones activas en este momento.\n";
    texto += "¡Pero tenemos excelentes productos a precios regulares!\n\n";
    texto += "Escribe /catalogo para ver todos nuestros productos.";
    return { texto_whatsapp: texto, total_promociones: 0 };
  }

  promociones.forEach((producto, index) => {
    texto += `${index + 1}. 🎯 *${producto.nombre}*\n`;
    texto += `📝 ${producto.descripcion}\n`;
    texto += `💰 ~~Bs ${producto.precio_original}~~ → *Bs ${producto.precio_final}*\n`;
    texto += `🏷️ *${producto.descuento_porcentaje}% OFF* (Ahorras Bs ${producto.descuento_monto})\n`;
    if (producto.promocion_descripcion) {
      texto += `✨ ${producto.promocion_descripcion}\n`;
    }
    texto += `📦 Stock: ${producto.stock}\n`;
    texto += `📂 Categoría: ${producto.categoria}\n\n`;
  });

  texto += "⏰ *¡Ofertas por tiempo limitado!*\n";
  texto += "📱 Haz tu pedido ahora escribiendo el nombre del producto.\n\n";

  return { 
    texto_whatsapp: texto, 
    total_promociones: promociones.length 
  };
}

async function listarCategorias() {
  const { data: categorias, error } = await supabase
    .from('categorias')
    .select('id, categori')
    .order('categori');

  if (error) throw new Error(`Error al obtener categorías: ${error.message}`);

  let texto = "📂 *NUESTRAS CATEGORÍAS* 📂\n\n";
  
  categorias.forEach((categoria, index) => {
    texto += `${index + 1}. *${categoria.categori}*\n`;
  });

  texto += "\n💡 *Para ver productos de una categoría escribe:*\n";
  texto += "/categoria [nombre de la categoría]\n\n";
  texto += "*Ejemplo:* /categoria accesorios\n";

  return { 
    texto_whatsapp: texto,
    categorias: categorias.map(c => c.categori)
  };
}

async function generarCatalogoPorCategoria(categoria, formato) {
  return await generarCatalogoCompleto(formato, categoria);
}

async function generarReporteStock() {
  const productos = await obtenerProductosConDatos();
  const stockBajo = productos.filter(p => p.stock <= 3);
  const sinStock = productos.filter(p => p.stock === 0);

  let texto = "📊 *REPORTE DE STOCK* 📊\n\n";
  
  texto += `📈 *Total productos:* ${productos.length}\n`;
  texto += `⚠️ *Stock bajo (≤3):* ${stockBajo.length}\n`;
  texto += `❌ *Sin stock:* ${sinStock.length}\n\n`;

  if (stockBajo.length > 0) {
    texto += "⚠️ *PRODUCTOS CON STOCK BAJO:*\n";
    stockBajo.forEach(producto => {
      texto += `• ${producto.nombre}: ${producto.stock} unidades\n`;
    });
    texto += "\n";
  }

  return { 
    texto_whatsapp: texto,
    estadisticas: {
      total: productos.length,
      stock_bajo: stockBajo.length,
      sin_stock: sinStock.length
    }
  };
}
