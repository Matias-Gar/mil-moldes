// 🔗 INTEGRACIÓN FACEBOOK CATALOG API
// Conecta tu sistema con el catálogo de Facebook Business
import { supabase } from '@/lib/SupabaseClient';

export class FacebookCatalogAPI {
  constructor() {
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.catalogId = process.env.FACEBOOK_CATALOG_ID;
    this.baseURL = 'https://graph.facebook.com/v18.0';
  }

  // 📤 Subir producto a Facebook Catalog
  async uploadProduct(producto) {
    const productData = {
      retailer_id: producto.user_id.toString(),
      name: producto.nombre,
      description: producto.descripcion || '',
      price: `${producto.precio * 100} BOB`, // Precio en centavos
      currency: 'BOB', // Bolivianos
      availability: producto.stock > 0 ? 'in stock' : 'out of stock',
      condition: 'new',
      brand: 'Tu Marca',
      category: producto.categoria || 'General',
      inventory: producto.stock,
      image_url: producto.imagen_url || '',
      url: `${process.env.NEXT_PUBLIC_APP_URL}/productos?id=${producto.user_id}`
    };

    try {
      const response = await fetch(
        `${this.baseURL}/${this.catalogId}/products`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`
          },
          body: JSON.stringify(productData)
        }
      );

      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      console.error('Error subiendo producto a Facebook:', error);
      return { success: false, error: error.message };
    }
  }

  // 🔄 Sincronizar todos los productos
  async syncAllProducts() {
    try {
      // Obtener productos de tu base de datos
      const { data: productos } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true);

      const results = [];
      
      for (const producto of productos) {
        const result = await this.uploadProduct(producto);
        results.push({
          producto_id: producto.user_id,
          nombre: producto.nombre,
          result
        });
        
        // Pausa para evitar rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return {
        success: true,
        total_productos: productos.length,
        results
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 🗑️ Eliminar producto del catálogo
  async deleteProduct(retailerId) {
    try {
      const response = await fetch(
        `${this.baseURL}/${this.catalogId}/products/${retailerId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      return { success: response.ok };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 📊 Obtener estadísticas del catálogo
  async getCatalogStats() {
    try {
      const response = await fetch(
        `${this.baseURL}/${this.catalogId}/product_sets`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// 🚀 Función para usar en tu API
export async function syncProductsToFacebook() {
  const fbCatalog = new FacebookCatalogAPI();
  return await fbCatalog.syncAllProducts();
}