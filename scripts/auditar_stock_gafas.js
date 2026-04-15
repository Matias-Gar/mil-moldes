// scripts/auditar_stock_gafas.js
// Script de auditoría para revisar el historial de stock de un producto específico en Supabase
// Producto: Gafas Lentes Vintage Oval Slim
// Busca ventas, detalles y stock actual para detectar duplicaciones o errores

import { createClient } from '@supabase/supabase-js';

// Configura tus claves aquí (solo para uso local seguro)
const supabaseUrl = 'https://gzvtuenpwndodnetnmzi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6dnR1ZW5wd25kb2RuZXRubXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MDUwODIsImV4cCI6MjA3NDA4MTA4Mn0.94z7ObbDdYydDTLtp5qZxIsB3XqFgGUBTxdP9pcf8z4';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const NOMBRE_PRODUCTO = 'Gafas Lentes Vintage Oval Slim';

async function main() {
  // 1. Buscar el producto por nombre
  const { data: productos, error: prodError } = await supabase
    .from('productos')
    .select('user_id, nombre, stock')
    .ilike('nombre', `%${NOMBRE_PRODUCTO}%`);
  if (prodError || !productos || productos.length === 0) {
    console.error('No se encontró el producto:', prodError);
    return;
  }
  const producto = productos[0];
  console.log('Producto encontrado:', producto);

  // 2. Buscar detalles de venta de ese producto
  const { data: detalles, error: detError } = await supabase
    .from('ventas_detalle')
    .select('id, venta_id, producto_id, cantidad')
    .eq('producto_id', producto.user_id);
  if (detError) {
    console.error('Error buscando detalles de venta:', detError);
    return;
  }
  const totalVendido = detalles.reduce((a, d) => a + Number(d.cantidad || 0), 0);
  console.log('Total vendido según ventas_detalle:', totalVendido);
  console.log('Detalles de venta:', detalles);

  // 3. Buscar ventas de packs que incluyan este producto
  const { data: packs, error: packsError } = await supabase
    .from('pack_productos')
    .select('pack_id, producto_id, cantidad')
    .eq('producto_id', producto.user_id);
  if (packsError) {
    console.error('Error buscando packs:', packsError);
    return;
  }
  if (packs.length > 0) {
    // Buscar ventas de esos packs
    const packIds = packs.map(p => p.pack_id);
    const { data: detallesPacks, error: detPackError } = await supabase
      .from('ventas_detalle')
      .select('id, venta_id, pack_id, cantidad')
      .in('pack_id', packIds);
    if (detPackError) {
      console.error('Error buscando detalles de packs:', detPackError);
      return;
    }
    // Calcular cuántas unidades del producto se vendieron por packs
    let totalPorPacks = 0;
    detallesPacks.forEach(dp => {
      const pack = packs.find(p => p.pack_id === dp.pack_id);
      if (pack) {
        totalPorPacks += Number(pack.cantidad || 0) * Number(dp.cantidad || 0);
      }
    });
    console.log('Total vendido por packs:', totalPorPacks);
  } else {
    console.log('No se encontraron packs que incluyan este producto.');
  }

  // 4. Stock actual
  console.log('Stock actual registrado:', producto.stock);

  // 5. Resumen
  // Stock inicial estimado = stock actual + total vendido (directo y por packs)
  // Si hay inconsistencias, revisar duplicaciones o errores en ventas_detalle
}

main();
