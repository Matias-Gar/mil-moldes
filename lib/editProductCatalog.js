import { fetchAllRows, fetchRowsInChunks } from "./supabasePagination.js";

// Every table is paginated; related IDs are also chunked to keep URLs bounded.
export async function loadEditProductCatalog(supabase, sucursalId) {
  const scoped = (table, columns) => {
    const query = supabase.from(table).select(columns);
    return sucursalId ? query.eq("sucursal_id", sucursalId) : query;
  };
  const unwrap = ({ data, error }) => {
    if (error) throw error;
    return data || [];
  };
  const productosData = unwrap(await fetchAllRows((from, to) =>
    scoped("productos", "*").order("nombre").order("user_id").range(from, to)
  ));
  const ids = [...new Set(productosData.map((p) => p.user_id).filter((id) => id != null))];
  const related = (table, columns) => fetchRowsInChunks(ids, (chunk) =>
    fetchAllRows((from, to) => scoped(table, columns)
      .in("producto_id", chunk).order("id").range(from, to))
  );
  const results = await Promise.all([
    related("producto_imagenes", "id, producto_id, imagen_url, sucursal_id"),
    related("producto_variantes", "*"),
    fetchAllRows((from, to) => scoped("categorias", "id, categori")
      .order("id").range(from, to)),
  ]);
  const [imagenesData, variantesData, categoriesData] = results.map(unwrap);
  return { productosData, imagenesData, variantesData, categoriesData };
}
