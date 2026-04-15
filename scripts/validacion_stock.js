// scripts/validacion_stock.js
// Script de validación automática de stock y auditoría
// Simula aumentos y ventas por variantes y valida resultados

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// Simulación de datos
const producto = {
  nombre: 'TestProd',
  variantes: [
    { id: 1, color: 'Azul', stock_inicial: 3, stock: 2 },
    { id: 2, color: 'Amarillo', stock_inicial: 2, stock: 1 },
  ],
  stock: 3
};

const movimientos = [
  { producto_id: 1, variante_id: 1, tipo: 'aumento', cantidad: 3 },
  { producto_id: 1, variante_id: 2, tipo: 'aumento', cantidad: 2 },
  { producto_id: 1, variante_id: 1, tipo: 'venta', cantidad: -1 },
  { producto_id: 1, variante_id: 2, tipo: 'venta', cantidad: -1 },
];

// Reconstrucción de stock por variante
const stockReconstruido = { 1: 0, 2: 0 };
movimientos.forEach(m => {
  if (stockReconstruido[m.variante_id] !== undefined) {
    stockReconstruido[m.variante_id] += m.cantidad;
  }
});

const stockTotalReconstruido = Object.values(stockReconstruido).reduce((a, b) => a + b, 0);

// Validaciones
assert(stockReconstruido[1] === 2, 'Stock Azul incorrecto');
assert(stockReconstruido[2] === 1, 'Stock Amarillo incorrecto');
assert(stockTotalReconstruido === 3, 'Stock total incorrecto');
assert(producto.stock === stockTotalReconstruido, 'Stock total producto desincronizado');

console.log('Validación exitosa: stock y auditoría correctos.');
