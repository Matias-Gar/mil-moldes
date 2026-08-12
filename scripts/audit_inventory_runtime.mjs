import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y una clave service-role en .env.local");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const findings = [];
const add = (severity, code, message, sample = null) => findings.push({ severity, code, message, sample });
const num = (value) => Number(value ?? 0) || 0;
const keyOf = (...parts) => parts.map((part) => String(part ?? "-")).join(":");

async function all(table, columns, configure = (query) => query) {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await configure(db.from(table).select(columns).range(from, from + size - 1));
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}

function stressModel(iterations = 50000) {
  const branches = [1000, 1000, 1000];
  const applied = new Map();
  let rejected = 0;
  for (let i = 0; i < iterations; i += 1) {
    const from = Math.floor(Math.random() * branches.length);
    let to = Math.floor(Math.random() * branches.length);
    if (to === from) to = (to + 1) % branches.length;
    const qty = Math.floor(Math.random() * 25) + 1;
    const idempotencyKey = i % 17 === 0 ? `retry-${i - 1}` : `op-${i}`;
    const fingerprint = `${from}:${to}:${qty}`;
    if (applied.has(idempotencyKey)) {
      if (applied.get(idempotencyKey) !== fingerprint) rejected += 1;
      continue;
    }
    if (branches[from] < qty) { rejected += 1; continue; }
    branches[from] -= qty;
    branches[to] += qty;
    applied.set(idempotencyKey, fingerprint);
    if (branches.some((stock) => stock < 0)) throw new Error("El modelo permitió stock negativo");
    if (branches.reduce((sum, stock) => sum + stock, 0) !== 3000) throw new Error("El modelo perdió stock en transferencia");
  }
  return { iterations, rejected, finalStock: branches, conserved: branches.reduce((a, b) => a + b, 0) };
}

const [products, variants, reconciliation, transfers, movements, saleDetails, sales, cutovers] = await Promise.all([
  all("productos", "user_id,nombre,stock,sucursal_id,archivado"),
  all("producto_variantes", "id,producto_id,color,stock,stock_decimal,sucursal_id,activo"),
  all("inventory_reconciliation", "producto_id,variante_id,nombre,color,stock_sistema,stock_reconstruido,diferencia,estado"),
  all("transferencias_sucursal", "id,producto_origen_id,variante_origen_id,producto_destino_id,variante_destino_id,sucursal_origen_id,sucursal_destino_id,cantidad_base,created_at"),
  all("stock_movimientos", "id,producto_id,variante_id,tipo,cantidad_base,stock_antes,stock_despues,venta_id,detalle_id,sucursal_id,idempotency_key,metadata,created_at"),
  all("ventas_detalle", "id,venta_id,producto_id,variante_id,cantidad_base,cantidad,created_at"),
  all("ventas", "id,estado"),
  all("inventory_cutover_balances", "producto_id,variante_id,cutover_at"),
]);

const cutoverTimes = cutovers.map((row) => new Date(row.cutover_at).getTime()).filter(Number.isFinite);
const globalCutover = cutoverTimes.length ? Math.min(...cutoverTimes) : Number.POSITIVE_INFINITY;
const isPostCutover = (createdAt) => new Date(createdAt).getTime() >= globalCutover;

const badReconciliation = reconciliation.filter((row) => String(row.estado).toUpperCase() !== "OK" || Math.abs(num(row.diferencia)) > 0.0001);
if (badReconciliation.length) add("CRITICAL", "RECONCILIATION", `${badReconciliation.length} registros no cuadran`, badReconciliation.slice(0, 10));

const negativeProducts = products.filter((row) => num(row.stock) < -0.0001);
const negativeVariants = variants.filter((row) => num(row.stock_decimal ?? row.stock) < -0.0001);
if (negativeProducts.length || negativeVariants.length) add("CRITICAL", "NEGATIVE_STOCK", `${negativeProducts.length} productos y ${negativeVariants.length} variantes con stock negativo`, [...negativeProducts, ...negativeVariants].slice(0, 10));

const variantsByProduct = new Map();
for (const variant of variants.filter((row) => row.activo !== false)) {
  const id = String(variant.producto_id);
  variantsByProduct.set(id, [...(variantsByProduct.get(id) || []), variant]);
}
const productTotalsMismatch = products.filter((product) => {
  const rows = variantsByProduct.get(String(product.user_id)) || [];
  if (!rows.length) return false;
  const total = rows.reduce((sum, row) => sum + num(row.stock_decimal ?? row.stock), 0);
  return Math.abs(num(product.stock) - total) > 0.0001;
}).map((product) => ({ id: product.user_id, nombre: product.nombre, stock: product.stock, variantes: (variantsByProduct.get(String(product.user_id)) || []).reduce((sum, row) => sum + num(row.stock_decimal ?? row.stock), 0) }));
if (productTotalsMismatch.length) add("CRITICAL", "PRODUCT_VARIANT_TOTAL", `${productTotalsMismatch.length} productos no igualan la suma de variantes`, productTotalsMismatch.slice(0, 10));

const movementByTransfer = new Map();
for (const movement of movements) {
  const transferId = movement.metadata?.transferencia_id;
  if (transferId) movementByTransfer.set(String(transferId), [...(movementByTransfer.get(String(transferId)) || []), movement]);
}
const malformedTransfers = [];
const incompleteTransferLedger = [];
for (const transfer of transfers) {
  const originVariants = variantsByProduct.get(String(transfer.producto_origen_id)) || [];
  const destinationVariants = variantsByProduct.get(String(transfer.producto_destino_id)) || [];
  if (String(transfer.sucursal_origen_id) === String(transfer.sucursal_destino_id) || num(transfer.cantidad_base) <= 0 || (originVariants.length && !transfer.variante_origen_id) || (destinationVariants.length && !transfer.variante_destino_id)) malformedTransfers.push(transfer);
  const ledger = movementByTransfer.get(String(transfer.id)) || [];
  const out = ledger.filter((row) => String(row.tipo).startsWith("transferencia_salida"));
  const incoming = ledger.filter((row) => String(row.tipo).startsWith("transferencia_entrada"));
  if (!out.length || !incoming.length || Math.abs(out.reduce((s, r) => s + num(r.cantidad_base), 0) - incoming.reduce((s, r) => s + num(r.cantidad_base), 0)) > 0.0001) incompleteTransferLedger.push({ ...transfer, ledger_rows: ledger.length });
}
const malformedCurrent = malformedTransfers.filter((row) => isPostCutover(row.created_at));
const malformedLegacy = malformedTransfers.filter((row) => !isPostCutover(row.created_at));
const incompleteCurrent = incompleteTransferLedger.filter((row) => isPostCutover(row.created_at));
const incompleteLegacy = incompleteTransferLedger.filter((row) => !isPostCutover(row.created_at));
if (malformedCurrent.length) add("CRITICAL", "MALFORMED_TRANSFER", `${malformedCurrent.length} transferencias posteriores al blindaje inválidas o sin variante`, malformedCurrent.slice(0, 10));
if (malformedLegacy.length) add("HISTORICAL", "MALFORMED_TRANSFER_LEGACY", `${malformedLegacy.length} transferencias históricas anteriores al blindaje sin variante`, malformedLegacy.slice(0, 10));
if (incompleteCurrent.length) add("CRITICAL", "TRANSFER_LEDGER", `${incompleteCurrent.length} transferencias posteriores al blindaje sin par completo entrada/salida`, incompleteCurrent.slice(0, 10));
if (incompleteLegacy.length) add("HISTORICAL", "TRANSFER_LEDGER_LEGACY", `${incompleteLegacy.length} transferencias históricas anteriores al blindaje sin par completo`, incompleteLegacy.slice(0, 10));

const salesById = new Map(sales.map((sale) => [String(sale.id), sale]));
const saleMovementKeys = new Set(movements.filter((row) => String(row.tipo).toLowerCase() === "venta" && row.detalle_id != null).map((row) => String(row.detalle_id)));
const missingSaleLedger = saleDetails.filter((detail) => {
  const sale = salesById.get(String(detail.venta_id));
  const cancelled = ["anulada", "cancelada", "eliminada"].includes(String(sale?.estado || "").toLowerCase());
  return !cancelled && !saleMovementKeys.has(String(detail.id));
});
const missingCurrentSales = missingSaleLedger.filter((row) => isPostCutover(row.created_at));
const missingLegacySales = missingSaleLedger.filter((row) => !isPostCutover(row.created_at));
if (missingCurrentSales.length) add("CRITICAL", "SALE_LEDGER", `${missingCurrentSales.length} detalles de ventas posteriores al blindaje sin movimiento de stock`, missingCurrentSales.slice(0, 10));
if (missingLegacySales.length) add("HISTORICAL", "SALE_LEDGER_LEGACY", `${missingLegacySales.length} detalles históricos anteriores al blindaje sin movimiento`, missingLegacySales.slice(0, 10));

const idempotencyCounts = new Map();
for (const movement of movements.filter((row) => row.idempotency_key)) {
  idempotencyCounts.set(movement.idempotency_key, (idempotencyCounts.get(movement.idempotency_key) || 0) + 1);
}
const duplicateKeys = [...idempotencyCounts].filter(([, count]) => count > 1);
if (duplicateKeys.length) add("CRITICAL", "DUPLICATE_IDEMPOTENCY", `${duplicateKeys.length} claves idempotentes repetidas en el ledger`, duplicateKeys.slice(0, 10));

const stress = stressModel();
const summary = {
  scanned: { products: products.length, variants: variants.length, reconciliation: reconciliation.length, transfers: transfers.length, movements: movements.length, saleDetails: saleDetails.length, cutover: Number.isFinite(globalCutover) ? new Date(globalCutover).toISOString() : null },
  stress,
  findings,
  result: findings.some((item) => item.severity === "CRITICAL") ? "FAIL" : "PASS",
};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.result === "PASS" ? 0 : 2;
