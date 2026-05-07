import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/SupabaseClient';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeExtraCosts(costosExtra) {
  const normalized = {
    envio: 0,
    comision: 0,
    impuestos: 0,
    publicidad: 0,
    rebajas: 0,
    descuento: 0,
    cobrar_impuestos: false,
  };

  if (!costosExtra || typeof costosExtra !== 'object') return normalized;

  normalized.envio = toNumber(costosExtra.envio);
  normalized.comision = toNumber(costosExtra.comision);
  normalized.impuestos = toNumber(costosExtra.impuestos);
  normalized.publicidad = toNumber(costosExtra.publicidad);
  normalized.rebajas = toNumber(costosExtra.rebajas);
  normalized.descuento = toNumber(costosExtra.descuento ?? costosExtra.descuentos);
  normalized.cobrar_impuestos = Boolean(costosExtra.cobrar_impuestos);

  return normalized;
}

function dateKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toISOString().slice(0, 10);
}

function joinWithY(values) {
  const clean = values.filter(Boolean);
  if (clean.length <= 1) return clean[0] || '';
  if (clean.length === 2) return `${clean[0]} y ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} y ${clean[clean.length - 1]}`;
}

function paymentMethodLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'efectivo') return 'Efectivo';
  if (normalized === 'tarjeta') return 'Tarjeta';
  if (normalized === 'qr') return 'QR';
  if (normalized === 'transferencia') return 'Transferencia';
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'No especificado';
}

function isWithinDateRange(dateValue, from, to) {
  if (!from && !to) return true;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;

  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

export function useVentasDashboard(sucursalId = null) {
  const [ventas, setVentas] = useState([]);
  const [detallesPorVenta, setDetallesPorVenta] = useState({});
  const [productMap, setProductMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadDashboardData() {
      setLoading(true);
      setError('');
      try {
        let ventasQuery = supabase
          .from('ventas')
          .select('id, cliente_nombre, total, fecha, descuentos, costos_extra, modo_pago')
          .order('fecha', { ascending: false });
        if (sucursalId) ventasQuery = ventasQuery.eq('sucursal_id', sucursalId);
        const { data: ventasData, error: ventasError } = await ventasQuery;

        if (ventasError) throw ventasError;

        const safeVentas = Array.isArray(ventasData) ? ventasData : [];

        let detallesData = [];
        let detalleQuery = supabase
          .from('ventas_detalle')
          .select(`
            venta_id,
            cantidad,
            cantidad_base,
            unidad,
            precio_unitario,
            costo_unitario,
            color,
            tipo,
            descripcion,
            producto_id,
            pack_id,
            productos (
              nombre
            ),
            packs (
              nombre
            )
          `);
        if (sucursalId) detalleQuery = detalleQuery.eq('sucursal_id', sucursalId);
        const detalleEnriquecido = await detalleQuery;

        if (detalleEnriquecido.error) {
          let fallbackQuery = supabase
            .from('ventas_detalle')
            .select('*');
          if (sucursalId) fallbackQuery = fallbackQuery.eq('sucursal_id', sucursalId);
          const detalleFallback = await fallbackQuery;
          if (detalleFallback.error) throw detalleEnriquecido.error;
          detallesData = detalleFallback.data || [];
        } else {
          detallesData = detalleEnriquecido.data || [];
        }

        const safeDetalles = Array.isArray(detallesData) ? detallesData : [];
        const detallesMap = {};
        const productIds = new Set();

        safeDetalles.forEach((item) => {
          const ventaId = item?.venta_id;
          if (!ventaId) return;

          if (!detallesMap[ventaId]) detallesMap[ventaId] = [];
          detallesMap[ventaId].push(item);

          if (item?.producto_id != null) {
            productIds.add(item.producto_id);
          }
        });

        let products = [];
        if (productIds.size > 0) {
          const ids = Array.from(productIds);
          let productsQuery = supabase
            .from('productos')
            .select('user_id, nombre, precio_compra, unidad_base, unidades_alternativas, factor_conversion')
            .in('user_id', ids);
          if (sucursalId) productsQuery = productsQuery.eq('sucursal_id', sucursalId);
          const { data: productsData, error: productsError } = await productsQuery;

          if (productsError) throw productsError;
          products = Array.isArray(productsData) ? productsData : [];
        }

        const nextProductMap = {};
        products.forEach((p) => {
          if (p?.user_id != null) nextProductMap[p.user_id] = p;
        });

        if (!mounted) return;
        setVentas(safeVentas);
        setDetallesPorVenta(detallesMap);
        setProductMap(nextProductMap);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'No se pudo cargar el dashboard de ventas');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboardData();
    return () => {
      mounted = false;
    };
  }, [sucursalId]);

  const salesRows = useMemo(() => {
    return ventas
      .filter((venta) => isWithinDateRange(venta?.fecha, dateFrom, dateTo))
      .map((venta) => {
        const details = detallesPorVenta[venta.id] || [];
        const items = [];

        let ingresosItems = 0;
        let costoItems = 0;
        let cantidadProductos = 0;

        details.forEach((item) => {
          const qtyDisplayRaw = toNumber(item?.cantidad || 0);
          const qtyBase = toNumber(item?.cantidad_base || 0) || qtyDisplayRaw;
          const precioUnitario = toNumber(item?.precio_unitario || 0);

          const productInfo = productMap[item?.producto_id] || null;
          const costoUnitarioDetalle = item?.costo_unitario;
          const costoUnitario = costoUnitarioDetalle != null
            ? toNumber(costoUnitarioDetalle)
            : (item?.pack_id || item?.tipo === 'pack')
              ? 0
              : toNumber(productInfo?.precio_compra || 0);

          const factorConversion = toNumber(productInfo?.factor_conversion || 0);
          const unidadBase = String(productInfo?.unidad_base || '').trim();
          const unidadDetalle = String(item?.unidad || '').trim();
          const unidadAlternativa = Array.isArray(productInfo?.unidades_alternativas)
            ? String(productInfo.unidades_alternativas[0] || '').trim()
            : '';
          const displayFromBase = qtyBase > 0 && factorConversion > 0 && unidadAlternativa
            ? qtyBase * factorConversion
            : qtyBase;
          const displayUnit = unidadDetalle && unidadDetalle !== unidadBase
            ? unidadDetalle
            : (factorConversion > 0 && unidadAlternativa ? unidadAlternativa : unidadDetalle || unidadBase || 'unidad');
          const qtyDisplay = unidadDetalle && unidadDetalle !== unidadBase
            ? qtyDisplayRaw || displayFromBase
            : displayFromBase || qtyDisplayRaw;

          const ingreso = precioUnitario * qtyBase;
          const costo = costoUnitario * qtyBase;
          const gananciaItem = ingreso - costo;

          const itemName =
            item?.productos?.nombre ||
            productInfo?.nombre ||
            item?.packs?.nombre ||
            item?.descripcion ||
            (item?.pack_id || item?.tipo === 'pack'
              ? `Pack #${item?.pack_id ?? 'N/A'}`
              : `Producto #${item?.producto_id ?? 'N/A'}`);

          items.push({
            nombre: itemName,
            cantidad: qtyDisplay,
            cantidadBase: qtyBase,
            unidad: displayUnit,
            precio: precioUnitario,
            costo,
            costoUnitario,
            ingreso,
            ganancia: gananciaItem,
            color: item?.color || '',
            tipo: item?.pack_id || item?.tipo === 'pack' ? 'pack' : 'producto',
            lowProfit: gananciaItem < 0,
          });

          ingresosItems += ingreso;
          costoItems += costo;
          cantidadProductos += qtyDisplay;
        });

        const extraCosts = normalizeExtraCosts(venta?.costos_extra);
        const totalVenta = toNumber(venta?.total || items.reduce((sum, item) => sum + item.ingreso, 0));
        const costoMercaderia = costoItems;
        const puedeAnalizar = items.length > 0;
        const gananciaProductos = ingresosItems - costoMercaderia;
        const ajustesOperativos = extraCosts.envio + extraCosts.comision - extraCosts.publicidad - extraCosts.rebajas;
        const ganancia = puedeAnalizar ? totalVenta - costoMercaderia - extraCosts.impuestos : 0;
        const costoTotal = costoMercaderia;
        const margen = totalVenta > 0 ? (ganancia / totalVenta) * 100 : 0;
        const cliente = venta?.cliente_nombre?.trim() || 'Consumidor final';
        const resumenItems = items.map((item) => {
          const cantidad = toNumber(item?.cantidad || 0);
          const nombre = String(item?.nombre || 'producto').trim();
          const color = String(item?.color || '').trim();
          const unidad = String(item?.unidad || '').trim();
          return `${cantidad} ${unidad ? `${unidad} de ` : ''}${nombre}${color ? ` ${color}` : ''}`;
        });
        const resumenCompra = resumenItems.length > 0
          ? `${cliente} compro ${joinWithY(resumenItems)}`
          : `${cliente} no tiene productos detallados en esta venta`;

        return {
          id: venta.id,
          cliente,
          fecha: venta?.fecha,
          total: totalVenta,
          costo: costoTotal,
          ganancia,
          margen,
          descuentos: toNumber(venta?.descuentos || extraCosts.descuento || 0),
          costosExtra: extraCosts,
          cantidadProductos,
          details,
          items,
          resumenCompra,
          ingresosItems,
          costoMercaderia,
          gananciaProductos,
          ajustesOperativos,
          metodoPago: paymentMethodLabel(venta?.modo_pago),
          impuestos: extraCosts.impuestos,
          envio: extraCosts.envio,
          comision: extraCosts.comision,
          publicidad: extraCosts.publicidad,
          rebajas: extraCosts.rebajas,
          puedeAnalizar,
        };
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [ventas, detallesPorVenta, productMap, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const totalVentas = salesRows.length;
    const totalIngresos = salesRows.reduce((sum, row) => sum + row.total, 0);
    const totalGanancias = salesRows.reduce((sum, row) => sum + row.ganancia, 0);
    const totalDescuentosPromocion = salesRows.reduce((sum, row) => sum + (Number(row.descuentos) || 0), 0);
    const totalRebajas = salesRows.reduce((sum, row) => sum + (Number(row.rebajas) || 0), 0);
    const totalDescuentos = totalDescuentosPromocion + totalRebajas;
    const productosVendidos = salesRows.reduce((sum, row) => sum + row.cantidadProductos, 0);
    const ticketPromedio = totalVentas > 0 ? totalIngresos / totalVentas : 0;

    return {
      totalVentas,
      totalIngresos,
      totalGanancias,
      totalDescuentos,
      totalDescuentosPromocion,
      totalRebajas,
      ticketPromedio,
      productosVendidos,
    };
  }, [salesRows]);

  const salesByDay = useMemo(() => {
    const grouped = {};
    salesRows.forEach((row) => {
      const key = dateKey(row.fecha);
      if (!grouped[key]) {
        grouped[key] = { day: key, ventas: 0, ingresos: 0, ganancia: 0 };
      }
      grouped[key].ventas += 1;
      grouped[key].ingresos += row.total;
      grouped[key].ganancia += row.ganancia;
    });

    return Object.values(grouped).sort((a, b) => a.day.localeCompare(b.day));
  }, [salesRows]);

  const topProducts = useMemo(() => {
    const grouped = {};
    salesRows.forEach((row) => {
      row.items.forEach((item) => {
        const label = item.color ? `${item.nombre} (${item.color})` : item.nombre;
        const key = `${item.tipo}:${label}`;
        if (!grouped[key]) {
          grouped[key] = { name: label, cantidad: 0, total: 0 };
        }

        const qty = toNumber(item?.cantidad || 0);
        grouped[key].cantidad += qty;
        grouped[key].total += toNumber(item?.ingreso || 0);
      });
    });

    return Object.values(grouped)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 8);
  }, [salesRows]);

  return {
    loading,
    error,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    kpis,
    salesRows,
    salesByDay,
    topProducts,
  };
}
