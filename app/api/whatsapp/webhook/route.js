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

// Token de verificación para WhatsApp Webhook (cámbialo por uno seguro)
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'tu_token_verificacion_whatsapp_2024';

// Token de acceso de WhatsApp Business API
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// ID del número de teléfono de WhatsApp Business
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Verificación del webhook (requerido por WhatsApp)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado exitosamente');
    return new Response(challenge, { status: 200 });
  } else {
    console.log('❌ Error en verificación del webhook');
    return new Response('Forbidden', { status: 403 });
  }
}

// Recibir mensajes de WhatsApp
export async function POST(request) {
  try {
    const body = await request.json();
    console.log('📱 Mensaje recibido:', JSON.stringify(body, null, 2));

    // Verificar que es un mensaje entrante
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const value = change.value;
            
            if (value.messages) {
              for (const message of value.messages) {
                await procesarMensaje(message, value.contacts[0]);
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ Error procesando webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function procesarMensaje(message, contact) {
  const telefono = message.from;
  const tipoMensaje = message.type;
  const nombreContacto = contact?.profile?.name || 'Cliente';
  
  console.log(`📞 Mensaje de ${nombreContacto} (${telefono}):`, message);

  // Solo procesar mensajes de texto
  if (tipoMensaje !== 'text') {
    await enviarMensaje(telefono, 
      "👋 ¡Hola! Solo puedo procesar mensajes de texto por ahora.\n\n" +
      "Escribe *catalogo* para ver nuestros productos 🛍️"
    );
    return;
  }

  const textoMensaje = message.text.body.toLowerCase().trim();
  
  // Guardar mensaje en la base de datos (opcional)
  await guardarMensajeEnBD(telefono, nombreContacto, textoMensaje, 'recibido');

  // Procesar comandos
  let respuesta;
  
  if (textoMensaje.includes('hola') || textoMensaje.includes('buenas') || textoMensaje.includes('buenos')) {
    respuesta = await generarMensajeBienvenida(nombreContacto);
  } else if (textoMensaje.includes('catalogo') || textoMensaje.includes('catálogo') || textoMensaje.includes('productos')) {
    respuesta = await obtenerCatalogo();
  } else if (textoMensaje.includes('promociones') || textoMensaje.includes('ofertas') || textoMensaje.includes('descuentos')) {
    respuesta = await obtenerPromociones();
  } else if (textoMensaje.includes('categorias') || textoMensaje.includes('categorías')) {
    respuesta = await obtenerCategorias();
  } else if (textoMensaje.startsWith('categoria ') || textoMensaje.startsWith('/categoria ')) {
    const categoria = textoMensaje.replace('categoria ', '').replace('/categoria ', '');
    respuesta = await obtenerProductosPorCategoria(categoria);
  } else if (textoMensaje.includes('ayuda') || textoMensaje.includes('help') || textoMensaje.includes('comandos')) {
    respuesta = await generarMensajeAyuda();
  } else if (textoMensaje.includes('precio') || textoMensaje.includes('costo') || textoMensaje.includes('cuanto')) {
    respuesta = await buscarProductoPorTexto(textoMensaje);
  } else if (textoMensaje.includes('stock') || textoMensaje.includes('disponible')) {
    respuesta = await buscarStockProducto(textoMensaje);
  } else {
    // Búsqueda general de productos
    respuesta = await buscarProductoPorTexto(textoMensaje);
  }

  // Enviar respuesta
  if (respuesta) {
    await enviarMensaje(telefono, respuesta);
    await guardarMensajeEnBD(telefono, 'Bot', respuesta, 'enviado');
  }
}

async function enviarMensaje(telefono, mensaje) {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.log('⚠️ WhatsApp API no configurada, simulando envío:', mensaje);
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text',
        text: {
          body: mensaje
        }
      })
    });

    const result = await response.json();
    console.log('✅ Mensaje enviado:', result);
    
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);
  }
}

async function guardarMensajeEnBD(telefono, nombre, mensaje, tipo) {
  try {
    await supabase.from('mensajes_whatsapp').insert({
      telefono,
      nombre_contacto: nombre,
      mensaje,
      tipo, // 'recibido' o 'enviado'
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.log('⚠️ No se pudo guardar mensaje en BD:', error.message);
  }
}

async function generarMensajeBienvenida(nombre) {
  return `👋 ¡Hola ${nombre}! Bienvenido/a a nuestra tienda online 🛍️

🤖 Soy tu asistente virtual y puedo ayudarte con:

🛍️ *catalogo* - Ver todos nuestros productos
🔥 *promociones* - Ver ofertas especiales  
📂 *categorias* - Ver categorías disponibles
🔍 *[nombre producto]* - Buscar producto específico
❓ *ayuda* - Ver más comandos

¿En qué puedo ayudarte hoy? 😊`;
}

async function obtenerCatalogo() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/whatsapp/comando?comando=catalogo`);
    const data = await response.json();
    return data.texto_whatsapp;
  } catch (_error) {
    return "❌ Error al obtener el catálogo. Por favor intenta más tarde.";
  }
}

async function obtenerPromociones() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/whatsapp/comando?comando=promociones`);
    const data = await response.json();
    return data.texto_whatsapp;
  } catch (_error) {
    return "❌ Error al obtener las promociones. Por favor intenta más tarde.";
  }
}

async function obtenerCategorias() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/whatsapp/comando?comando=categorias`);
    const data = await response.json();
    return data.texto_whatsapp;
  } catch (_error) {
    return "❌ Error al obtener las categorías. Por favor intenta más tarde.";
  }
}

async function obtenerProductosPorCategoria(categoria) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/whatsapp/comando?comando=categoria&categoria=${encodeURIComponent(categoria)}`);
    const data = await response.json();
    return data.texto_whatsapp;
  } catch (_error) {
    return `❌ Error al obtener productos de la categoría "${categoria}".`;
  }
}

async function buscarProductoPorTexto(texto) {
  try {
    // Buscar productos que coincidan con el texto
    const { data: productos, error } = await supabase
      .from('productos')
      .select(`
        user_id,
        nombre,
        descripcion,
        precio,
        stock,
        categorias (categori)
      `)
      .or(`nombre.ilike.%${texto}%,descripcion.ilike.%${texto}%`)
      .gt('stock', 0)
      .limit(5);

    if (error || !productos || productos.length === 0) {
      return `🔍 No encontré productos relacionados con "${texto}".\n\n` +
             "💡 Prueba escribiendo:\n" +
             "• *catalogo* - Para ver todos los productos\n" +
             "• *categorias* - Para ver las categorías disponibles";
    }

    let respuesta = `🔍 *Encontré ${productos.length} producto(s) relacionado(s):*\n\n`;
    
    productos.forEach((producto, index) => {
      respuesta += `${index + 1}. *${producto.nombre}*\n`;
      respuesta += `📝 ${producto.descripcion}\n`;
      respuesta += `💰 Bs ${Number(producto.precio).toFixed(2)}\n`;
      respuesta += `📦 Stock: ${producto.stock}\n`;
      respuesta += `📂 ${producto.categorias?.categori || 'Sin categoría'}\n\n`;
    });

    respuesta += "💬 *Para hacer tu pedido escribe:*\n";
    respuesta += "\"Quiero: [nombre del producto] x [cantidad]\"";

    return respuesta;

  } catch (_error) {
    return "❌ Error en la búsqueda. Por favor intenta más tarde.";
  }
}

async function buscarStockProducto(texto) {
  // Similar a buscarProductoPorTexto pero enfocado en stock
  return await buscarProductoPorTexto(texto);
}

async function generarMensajeAyuda() {
  return `❓ *COMANDOS DISPONIBLES* ❓

🛍️ *Productos:*
• *catalogo* - Ver todo el catálogo
• *promociones* - Ver ofertas especiales
• *categorias* - Ver categorías
• *categoria [nombre]* - Productos por categoría

🔍 *Búsqueda:*
• Escribe el nombre de cualquier producto
• Ejemplo: "moños", "pendientes", etc.

🛒 *Pedidos:*
• "Quiero: [producto] x [cantidad]"
• Ejemplo: "Quiero: moños con cera x 2"

📱 *También puedes hacer pedidos online:*
${process.env.NEXT_PUBLIC_APP_URL || 'https://tu-tienda.com'}/productos

¡Estoy aquí para ayudarte! 😊`;
}