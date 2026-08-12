# Auditoría y blindaje de inventario v2

## Mapa de mutaciones encontrado

- Alta de producto: `app/admin/productos/nuevo/page.js` crea producto, variantes y movimientos mediante llamadas separadas del cliente. Puede quedar parcialmente aplicado.
- Edición: `app/admin/productos/editar/page.js` escribía `productos.stock`, `producto_variantes.stock`, `stock_decimal`, iniciales, SKU y código; también eliminaba variantes físicamente.
- Aumento: la pantalla usa `aumentar_stock_completo`, que bloquea filas y registra ledger en la transacción. El historial descriptivo posterior sigue siendo best-effort y no es contabilidad.
- Ventas/packs: `NuevaVenta.tsx` usa `crear_venta_completa`; la RPC antigua aceptaba `cantidad_base` del navegador y no tenía idempotencia persistente.
- Pedido pendiente: se marca confirmado desde el cliente después de la venta. Aún debe integrarse dentro de la RPC para bloquear el pedido y cerrar ambos estados atómicamente.
- Cancelación/limpieza: `eliminar_venta_con_restock` restaura stock pero luego borra venta, detalle, pagos, caja y movimientos originales. Es incompatible con ledger inmutable y debe retirarse de operación al desplegar v2.
- Transferencia: `transferir_stock_sucursal` bloquea origen/destino, pero recibe `p_cantidad_base` del navegador, usa fallbacks `stock_decimal > 0` y puede crear copias de producto. Requiere una v2 antes de considerarse cerrada.
- Eliminación: `app/admin/productos/eliminar/page.js` borra movimientos y entidades. Debe deshabilitarse; el flujo válido es archivo lógico.
- Escritura directa de ledger: `lib/stockMovimientos.js` inserta desde el cliente. Los grants de v2 hacen que falle; debe eliminarse cuando ya no queden consumidores.

## Causas de fuga

1. Lectura-cálculo-update-auditoría en llamadas distintas: carreras y estados parciales.
2. Confianza en `cantidad_base`: un cliente manipulado puede descontar una equivalencia distinta.
3. `coalesce(nullif(stock_decimal,0),stock,0)`: interpreta cero decimal válido como ausencia y revive stock entero antiguo.
4. Redondeo temprano con `Math.floor`/campos enteros: pierde fracciones de rollo.
5. Cancelaciones destructivas: eliminan la evidencia necesaria para reconstruir balances.
6. Confirmación de pedidos posterior a la venta: permite reintentos/doble procesamiento.
7. Permisos de tabla: permiten fabricar o borrar ledger fuera de funciones controladas.

## Implementado en el repositorio

- Edición general sin stock/código; SKU existente de solo lectura, variante nueva en cero y desactivación bloqueada si tiene existencias.
- Pantalla separada Reducir Stock, modal no nativo, equivalencia humana y permisos Admin/Administración.
- RPC `reducir_stock_completo`: rol servidor, conversión servidor, `FOR UPDATE`, validación, snapshot y ledger en una transacción.
- Wrapper de venta idempotente con hash, bloqueo de clave y recálculo servidor de `cantidad_base`.
- Columnas de correlación/transacción/conversión/resultado, índice único por detalle, tablas de rechazos/eventos y grants cerrados.
- Trigger inmutable de ledger y vista `inventory_reconciliation` por producto/variante.
- Clave de venta estable durante retries y rotada solo al éxito.

## Matriz de permisos

| Operación | admin | administracion | almacen | vendedor |
|---|---:|---:|---:|---:|
| Aumentar | Sí | Sí | Sí | No |
| Reducir | Sí | Sí | No | No |
| Vender | Sí | Sí | No | Sí |
| Archivar | Sí | No | No | No |
| Escribir/borrar ledger directamente | No | No | No | No |

Las RPC vuelven a validar el rol; ocultar una ruta no constituye autorización.

## Despliegue

1. Crear backup y clon de staging.
2. Ejecutar los scripts históricos requeridos por el entorno y después `scripts/inventory_integrity_v2.sql`.
3. Ejecutar `scripts/inventory_integrity_v2_tests.sql` en staging.
4. Consultar `inventory_reconciliation`; exportar y revisar todos los `SIN_LEDGER` e `INCONSISTENCIA_CRITICA`.
5. No corregir snapshots directamente. Preparar movimientos de apertura/compensación revisados por negocio.
6. Desplegar la aplicación solo tras migrar la función de transferencia y cancelación señaladas como pendientes.
7. Probar concurrencia con conexiones PostgreSQL independientes y 2/5/10/50/100 clientes sobre fixtures aislados.

## Rollback

Revertir primero la aplicación. La migración añade objetos de forma compatible, pero activar el trigger inmutable rompe deliberadamente las rutas destructivas antiguas. Para rollback de emergencia en staging, deshabilitar `trg_stock_ledger_immutable` y revocar las RPC v2; no borrar columnas/tablas hasta exportar idempotencia y auditoría. En producción, usar una migración de rollback revisada, nunca editar el ledger.

## Pendiente antes de producción

- Reescribir transferencia para ignorar `p_cantidad_base`, rechazar archivados y no clonar/“reparar” productos automáticamente.
- Reemplazar limpieza por anulación compensatoria que conserve venta/pagos/detalles/caja.
- Integrar el bloqueo y cambio de estado del pedido pendiente dentro de la venta RPC.
- Convertir el alta con stock inicial en una RPC única o crear siempre en cero y usar Aumentar Stock.
- Cerrar las escrituras directas restantes mediante RLS/grants verificados contra el esquema efectivo.
- Ejecutar las pruebas de integración y concurrencia contra staging. Esta sesión no tiene una base PostgreSQL aislada configurada y no se tocaron datos reales.

## Operaciones v3

Después de v2 debe ejecutarse `scripts/inventory_integrity_v3_operations.sql`. Esta migración mantiene funcionando Limpieza de ventas, pedidos y transferencias, pero cambia su semántica insegura:

- “Limpieza” anula la venta, restaura stock con movimientos inversos y compensa caja; no borra evidencia.
- La confirmación del pedido se bloquea y completa dentro de la misma transacción de venta.
- Descartar o vencer un pedido cambia su estado y registra auditoría; no elimina la fila.
- Transferencia recalcula cantidad base en PostgreSQL y usa idempotencia persistente.
- Las firmas RPC antiguas quedan revocadas para impedir saltarse las fachadas seguras.
- La reconciliación distingue `HISTORICO_INCOMPLETO` de una `INCONSISTENCIA_CRITICA` demostrable.

Los resultados históricos recibidos con diferencias repetidas de ±10/20/30 no deben repararse automáticamente. Primero se vuelve a consultar la vista v3 y se investiga solamente lo que continúe como `INCONSISTENCIA_CRITICA`.

## Corte final v4

Una vez resueltas todas las inconsistencias críticas confirmadas, ejecutar `scripts/inventory_integrity_v4_cutover_and_guards.sql`.

- Toma un corte inmutable del stock actual sin modificar cantidades.
- Convierte los historiales incompletos y sin ledger en un punto de partida verificable.
- La reconciliación posterior debe quedar completamente `OK`.
- Agrega triggers que impiden editar stock o eliminar productos/variantes desde clientes `anon` y `authenticated`.
- Las RPC `SECURITY DEFINER` continúan operando y registrando movimientos atómicos.

Orden final: v2 → pruebas v2 → v3 → regularizaciones aprobadas → v4 → despliegue de aplicación → pruebas funcionales.
