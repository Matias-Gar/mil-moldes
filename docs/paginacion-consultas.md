# Consultas completas de Supabase

Las búsquedas locales, exportaciones, estadísticas y cálculos de stock/caja deben
leer todas las páginas. Aumentar `.limit()` no elimina el máximo del servidor.

Usar `fetchCompleteQuery` de `lib/supabasePagination.js` para un SELECT completo:

```js
const { data, error } = await fetchCompleteQuery(
  supabase.from('productos').select('*').eq('sucursal_id', sucursalId),
  'user_id'
);
if (error) throw error;
```

La columna indicada debe ser única en el resultado. Se agrega al orden existente
para desempatar nombres o fechas iguales. Productos usa `user_id`; la vista del
catálogo usa `producto_id`; las tablas de movimientos, imágenes y variantes usan
`id`. La carga avanza por las filas recibidas hasta obtener una página vacía,
incluso si el servidor impone un máximo menor que el solicitado.

Para consultas por listas de IDs, pasar una función que construya una consulta
nueva **sin el filtro IN**. El helper divide los IDs y pagina las filas de cada
grupo. Esto evita URLs demasiado largas y filtros acumulados por reutilizar el
mismo builder mutable entre grupos.

```js
const { data, error } = await fetchCompleteQuery(
  () => supabase.from('producto_imagenes').select('*').eq('sucursal_id', sucursalId),
  'id',
  { column: 'producto_id', values: productIds }
);
if (error) throw error;
```

No usar con escrituras, `single()`, `maybeSingle()`, conteos HEAD ni consultas que
intencionalmente devuelven una vista previa. Se conservan los límites de las
sugerencias de búsqueda, últimas transferencias, últimos cierres y búsquedas de
un solo cliente. Los movimientos de caja de un período se cargan completos; la
vista reciente sin fechas conserva su límite explícito.

La revisión abarca productos e insumos (rutas compartidas), catálogos, imágenes,
variantes, reposición, transferencias, reportes de inventario, promociones, packs,
pedidos, historial y estadísticas de ventas, limpieza de ventas y cálculos de caja.
Las consultas mantienen sus filtros de sucursal, fechas y estado.

Validación:

```sh
node --test --experimental-test-isolation=none scripts/test_complete_queries.mjs scripts/test_edit_product_catalog.mjs scripts/test_stock_audit_data.mjs
node scripts/audit_pagination_runtime.mjs
```

La segunda orden necesita `.env.local` y solo realiza lecturas. Compara las filas
cargadas con los conteos exactos de doce fuentes, además de imágenes y variantes
por sucursal. Si hay escrituras concurrentes durante la lectura, repetir la
verificación antes de atribuir una diferencia a la paginación.
