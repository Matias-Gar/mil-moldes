import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Falta acceso service-role para la auditoria");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function all(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const [products, variants, details, sales, movements, reconciliation, cutovers] = await Promise.all([
  all("productos", "user_id,nombre,stock,sucursal_id,archivado,created_at"),
  all("producto_variantes", "id,producto_id,color,stock,stock_decimal,sucursal_id,activo"),
  all("ventas_detalle", "id,venta_id,producto_id,variante_id,cantidad,cantidad_base,created_at"),
  all("ventas", "id,estado,fecha,sucursal_id"),
  all("stock_movimientos", "id,producto_id,variante_id,tipo,cantidad_base,stock_antes,stock_despues,venta_id,detalle_id,created_at,resultado"),
  all("inventory_reconciliation", "producto_id,variante_id,nombre,color,stock_sistema,stock_reconstruido,diferencia,estado"),
  all("inventory_cutover_balances", "producto_id,variante_id,cutover_at"),
]);

const n = (value) => Number(value ?? 0);
const cutoverMs = Math.min(...cutovers.map((row) => Date.parse(row.cutover_at)).filter(Number.isFinite));
const salesById = new Map(sales.map((row) => [String(row.id), row]));
const variantsById = new Map(variants.map((row) => [String(row.id), row]));
const variantsByProduct = new Map();
for (const row of variants.filter((item) => item.activo !== false)) {
  const key = String(row.producto_id);
  variantsByProduct.set(key, [...(variantsByProduct.get(key) || []), row]);
}
const saleMovements = movements.filter((row) => String(row.tipo).toLowerCase() === "venta" && row.resultado !== "rechazado");
const movementByDetail = new Map(saleMovements.filter((row) => row.detalle_id != null).map((row) => [String(row.detalle_id), row]));
const movementComposite = new Set(saleMovements.map((row) => `${row.venta_id}:${row.producto_id}:${row.variante_id ?? "-"}`));
const effectiveDetails = details.filter((row) => !["anulada", "cancelada", "eliminada"].includes(String(salesById.get(String(row.venta_id))?.estado || "").toLowerCase()));
const missing = effectiveDetails.filter((row) => !movementByDetail.has(String(row.id)) && !movementComposite.has(`${row.venta_id}:${row.producto_id}:${row.variante_id ?? "-"}`));
const invalidVariantLinks = details.filter((row) => row.variante_id != null && String(variantsById.get(String(row.variante_id))?.producto_id) !== String(row.producto_id));
const badSaleDeltas = saleMovements.filter((row) => row.stock_antes != null && row.stock_despues != null && Math.abs((n(row.stock_antes) - n(row.stock_despues)) - n(row.cantidad_base)) > 0.0001);
const productTotals = products.filter((product) => {
  const rows = variantsByProduct.get(String(product.user_id)) || [];
  return rows.length && Math.abs(n(product.stock) - rows.reduce((sum, row) => sum + n(row.stock_decimal ?? row.stock), 0)) > 0.0001;
}).map((product) => ({ id: product.user_id, nombre: product.nombre, producto_stock: n(product.stock), variantes_stock: (variantsByProduct.get(String(product.user_id)) || []).reduce((sum, row) => sum + n(row.stock_decimal ?? row.stock), 0) }));
const falseReconciliationAlerts = reconciliation.filter((row) => Math.abs(n(row.diferencia)) <= 0.0001 && !["OK", "SIN_CORTE"].includes(String(row.estado).toUpperCase()));
const withoutCutover = reconciliation.filter((row) => String(row.estado).toUpperCase() === "SIN_CORTE");
const targetPattern = /(kuromi|sti(?:t)?ch|gato\s+riendo|virgen)/i;
const targets = products.filter((row) => targetPattern.test(String(row.nombre))).map((product) => {
  const productVariants = variantsByProduct.get(String(product.user_id)) || [];
  const productDetails = details.filter((row) => String(row.producto_id) === String(product.user_id));
  const productMoves = saleMovements.filter((row) => String(row.producto_id) === String(product.user_id));
  return {
    id: product.user_id, nombre: product.nombre, stock: n(product.stock), archivado: product.archivado,
    variantes: productVariants.map((row) => ({ id: row.id, color: row.color, stock: n(row.stock_decimal ?? row.stock) })),
    ventas: productDetails.length, movimientos_venta: productMoves.length,
    ultima_venta: productDetails.map((row) => row.created_at).sort().at(-1) || null,
    ultimo_movimiento: productMoves.map((row) => row.created_at).sort().at(-1) || null,
  };
});

console.log(JSON.stringify({
  cutover: new Date(cutoverMs).toISOString(),
  counts: { products: products.length, variants: variants.length, sales: sales.length, details: details.length, movements: movements.length },
  sales_integrity: {
    missing_post_cutover: missing.filter((row) => Date.parse(row.created_at) >= cutoverMs),
    missing_legacy_count: missing.filter((row) => Date.parse(row.created_at) < cutoverMs).length,
    invalid_variant_links: invalidVariantLinks,
    invalid_sale_deltas: badSaleDeltas,
  },
  stock_integrity: { product_variant_mismatches: productTotals, false_reconciliation_alerts: falseReconciliationAlerts, without_cutover_count: withoutCutover.length, without_cutover_sample: withoutCutover.slice(0, 20) },
  requested_products: targets,
}, null, 2));
