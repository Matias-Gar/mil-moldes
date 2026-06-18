// 🔗 API para sincronizar productos con Facebook Catalog
import { supabase } from '@/lib/SupabaseClient';
import { FacebookCatalogAPI } from '@/lib/FacebookCatalogAPI';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const fbCatalog = new FacebookCatalogAPI();

    switch (action) {
      case 'sync_all':
        // 🔄 Sincronizar todos los productos
        const syncResult = await fbCatalog.syncAllProducts();
        return NextResponse.json({
          success: true,
          message: 'Sincronización completada',
          data: syncResult
        });

      case 'sync_single':
        // 📤 Sincronizar un producto específico
        const { producto_id } = body;
        
        const { data: producto } = await supabase
          .from('productos')
          .select('*')
          .eq('user_id', producto_id)
          .eq('archivado', false)
          .single();

        if (!producto) {
          return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
        }

        const uploadResult = await fbCatalog.uploadProduct(producto);
        return NextResponse.json({
          success: true,
          message: 'Producto sincronizado',
          data: uploadResult
        });

      case 'delete':
        // 🗑️ Eliminar producto del catálogo
        const { retailer_id } = body;
        const deleteResult = await fbCatalog.deleteProduct(retailer_id);
        return NextResponse.json({
          success: true,
          message: 'Producto eliminado del catálogo',
          data: deleteResult
        });

      case 'stats':
        // 📊 Obtener estadísticas
        const statsResult = await fbCatalog.getCatalogStats();
        return NextResponse.json({
          success: true,
          data: statsResult
        });

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

  } catch (error) {
    console.error('Error en Facebook Catalog API:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Facebook Catalog API activa',
    endpoints: ['sync_all', 'sync_single', 'delete', 'stats']
  });
}
