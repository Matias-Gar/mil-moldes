"use client";
import React, { useEffect, useRef, useCallback } from 'react';
import { useCarrito } from '../../../../hooks/useCarrito';
import { useCliente } from '../../../../hooks/useCliente';
import { useProductos } from '../../../../hooks/useProductos';
import { usePromociones } from '../../../../lib/usePromociones';
import { usePacks } from '../../../../lib/packs';
import { calcularPrecioConPromocion } from '../../../../lib/promociones';
import * as ventasService from '../../../../services/ventas.service';
import { sincronizarStockProducto } from '../../../../lib/utils';
import ClienteForm from '../../../../components/venta/ClienteForm';
import BuscadorProductos from '../../../../components/venta/BuscadorProductos';
import { calcularDescuentoPack } from '../../../../lib/packs';
import CarritoPanel from '../../../../components/venta/CarritoPanel';
import dynamic from 'next/dynamic';
const TicketPrinter = dynamic(() => import('../../../../components/venta/TicketPrinter'), { ssr: false });
import type { TicketPrinterHandle } from '../../../../components/venta/TicketPrinter';
import { Pack, Producto } from '../../../../hooks/useCarrito';
import { supabase } from '../../../../lib/SupabaseClient';
import { showToast } from '../../../../components/ui/Toast';
import { useSucursalActiva } from '../../../../components/admin/SucursalContext';

type VariantMatch = {
  variante_id?: number | string;
  id?: number | string;
  color?: string;
  precio?: number;
  stock?: number;
  stock_decimal?: number;
  sku?: string;
  codigo_barra?: string;
};

type VentaCajaPayload = {
  id?: number | string;
  fecha?: string;
  total?: number;
  modo_pago?: string;
};

type ProductoDB = {
  user_id: string | number;
  nombre?: string;
  precio?: number;
  precio_compra?: number;
  stock?: number;
  unidad_base?: string;
  unidades_alternativas?: string[];
  factor_conversion?: number;
  producto_variantes?: Array<{
    id?: string | number;
    color?: string;
    precio?: number;
    stock?: number;
    stock_decimal?: number;
  }>;
};

type StockRequest = {
  nombre: string;
  color?: string | null;
  disponible: number;
  solicitado: number;
};

type PackDB = {
  id: string | number;
  nombre?: string;
  precio_pack?: number;
  pack_productos?: Array<{
    cantidad?: number;
    variante_id?: string | number | null;
    productos?: {
      user_id?: string | number;
      nombre?: string;
      precio?: number;
      stock?: number;
      producto_variantes?: Array<{
        id?: string | number;
        color?: string;
        precio?: number;
        stock?: number;
        stock_decimal?: number;
      }>;
    };
  }>;
};

function parseMoneyInput(value: string) {
  const normalized = String(value || '').replace(',', '.').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatMoneyInput(value: number) {
  if (!value) return '';
  return String(value).replace('.', ',');
}

function parsePositiveNumber(value: string | number) {
  const parsed = parseMoneyInput(String(value ?? ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeQuantity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function getVariantStock(variant?: { stock?: number; stock_decimal?: number } | null) {
  const decimal = Number(variant?.stock_decimal);
  const legacy = Number(variant?.stock);
  return normalizeQuantity(Number.isFinite(decimal) && decimal > 0 ? decimal : legacy || 0);
}

function getProductStock(product?: { stock?: number } | null) {
  return normalizeQuantity(product?.stock ?? 0);
}

function hasUnitConversion(product?: { unidades_alternativas?: string[]; factor_conversion?: number } | null) {
  return Boolean(
    Array.isArray(product?.unidades_alternativas) &&
    product.unidades_alternativas.length > 0 &&
    Number(product?.factor_conversion || 0) > 0
  );
}

function shouldUseProductStockForVariant(product?: { unidades_alternativas?: string[]; factor_conversion?: number; producto_variantes?: unknown[] } | null) {
  return hasUnitConversion(product);
}

function getStockForVariantSale(product: ProductoDB, variant?: { stock?: number; stock_decimal?: number } | null) {
  return shouldUseProductStockForVariant(product) ? getProductStock(product) : getVariantStock(variant);
}

function formatStockQuantity(value: number) {
  return Number(value.toFixed(3)).toString();
}

function getSaleBaseQuantity(
  item: {
    cantidad?: number;
    cantidad_base?: number;
    cantidad_display?: number;
    unidad?: string;
    unidad_base?: string;
    factor_conversion?: number;
  },
  product?: { unidad_base?: string; factor_conversion?: number } | null
) {
  const unidadBase = String(product?.unidad_base || item.unidad_base || item.unidad || 'unidad');
  const unidadVenta = String(item.unidad || unidadBase);
  const factor = Number(item.factor_conversion || product?.factor_conversion || 0);
  const visible = normalizeQuantity(item.cantidad_display ?? item.cantidad ?? item.cantidad_base ?? 1);
  if (unidadVenta !== unidadBase && Number.isFinite(factor) && factor > 0) {
    return visible / factor;
  }
  return normalizeQuantity(item.cantidad_base ?? item.cantidad ?? visible);
}

function toIntegerDetailQuantity(cantidadBase: number) {
  const parsed = Number(cantidadBase);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.max(1, Math.floor(parsed));
}


export default function NuevaVenta() {
  // hooks
  const { activeSucursalId } = useSucursalActiva();
  const { cliente, cambiarCampo, buscarPorCarnet, guardar, buscarEmailHistorico } = useCliente(activeSucursalId);
  const { promociones } = usePromociones(activeSucursalId);
  const { packs } = usePacks(activeSucursalId) as { packs: Pack[] };
  const {
    carrito,
    agregar,
    quitar,
    cambiarCantidad,
    cambiarUnidadYCantidad,
    subtotal,
    totalDescuento,
    total,
    setCarrito,
    stockWarning,
    clearStockWarning
  } = useCarrito(promociones);

  const {
    productos,
    imagenes,
    searchResults,
    searchLoading,
    fetchProductos,
    searchProductos
  } = useProductos(false, activeSucursalId); // no incluir precio de compra para vendedores

  const [busqueda, setBusqueda] = React.useState('');
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [packResults, setPackResults] = React.useState<Pack[]>([]);
  const lastAutoAddRef = React.useRef({ code: '', timestamp: 0 });

  const scanBuffer = React.useRef('');
  const scanTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scanFeedback, setScanFeedback] = React.useState(false);
  const beepRef = useRef<HTMLAudioElement | null>(null);

  const [efectivizando, setEfectivizando] = React.useState(false);

  // NUEVO: hasta 2 métodos de pago
  const [pagos, setPagos] = React.useState([
    { metodo: '', monto: 0 },
  ]);
  const [mostrarSegundoPago, setMostrarSegundoPago] = React.useState(false);

  // campos contables adicionales
  const [cobrarImpuestos, setCobrarImpuestos] = React.useState(false);
  const tasaImpuestos = 0.16;
  const [envio, setEnvio] = React.useState(0);
  const [comision, setComision] = React.useState(0);
  const [publicidad, setPublicidad] = React.useState(0);
  const [rebajas, setRebajas] = React.useState(0);
  const [showInsufficientPaymentWarning, setShowInsufficientPaymentWarning] = React.useState(false);

  const totalBaseOperacion = Math.max(0, Number(total) + Number(envio) + Number(comision) - Number(publicidad) - Number(rebajas));
  const impuestosCalculados = cobrarImpuestos ? Number((totalBaseOperacion * tasaImpuestos).toFixed(2)) : 0;
  const totalCobrar = Number((totalBaseOperacion + impuestosCalculados).toFixed(2));
  const sumaPagos = pagos.reduce((acc, p) => acc + Number(p.monto || 0), 0);
  const tienePagoEnEfectivo = pagos.some((p) => p.metodo === 'efectivo' && Number(p.monto || 0) > 0);
  const cambio = tienePagoEnEfectivo && sumaPagos > totalCobrar ? Number((sumaPagos - totalCobrar).toFixed(2)) : 0;
  const pagoInsuficiente = sumaPagos > 0 && (sumaPagos + 0.009) < totalCobrar;

  const printerRef = useRef<TicketPrinterHandle>(null);
  const efectivizarBtnRef = useRef<HTMLButtonElement>(null);

  // Cargar carrito desde pedidos si existe
  // Dependencias fijas para evitar warning de React
  const packsKey = Array.isArray(packs) ? packs.map(p => p.id).join(',') : '';
  const productosKey = Array.isArray(productos) ? productos.map(p => p.user_id).join(',') : '';

  // Carga robusta: siempre consulta productos y packs desde la base de datos
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const pedido = sessionStorage.getItem('pedido_a_efectivizar');
    if (!pedido) return;
    (async () => {
      try {
        const pedidoObj = JSON.parse(pedido);
        if (!Array.isArray(pedidoObj.productos)) return;
        // Agrupar productos por producto_id, variante_id y color
        const grouped: { [key: string]: any } = {};
        for (const p of pedidoObj.productos) {
          // Sanitizar: si es pack y user_id es 'pack-<id>', usar solo pack_id numérico
          let producto_id = p.producto_id || p.user_id || '';
          if (p.pack_id && typeof producto_id === 'string' && producto_id.startsWith('pack-')) {
            producto_id = '';
          }
          const variante_id = p.variante_id || 'default';
          const color = p.color || '';
          const unidad = p.unidad || p.unidad_base || 'unidad';
          const key = `${producto_id}|${variante_id}|${color}|${p.pack_id || ''}|${unidad}`;
          const cantidadDisplay = normalizeQuantity(p.cantidad_display ?? p.cantidad ?? 1);
          const cantidadBase = normalizeQuantity(p.cantidad_base ?? p.cantidad ?? 1);
          if (!grouped[key]) {
            grouped[key] = { ...p };
            grouped[key].cantidad = cantidadDisplay;
            grouped[key].cantidad_display = cantidadDisplay;
            grouped[key].cantidad_base = cantidadBase;
          } else {
            grouped[key].cantidad += cantidadDisplay;
            grouped[key].cantidad_display = Number(grouped[key].cantidad_display || 0) + cantidadDisplay;
            grouped[key].cantidad_base = Number(grouped[key].cantidad_base || 0) + cantidadBase;
          }
        }
        const productosAgrupados = Object.values(grouped);

        // Separar productos y packs
        const productosIds = productosAgrupados.filter(p => !p.pack_id).map(p => p.producto_id || p.user_id).filter(Boolean);
        const packsIds = productosAgrupados.filter(p => p.pack_id).map(p => p.pack_id).filter(Boolean);

        // Consultar productos desde la base de datos, trayendo también la imagen principal
        let productosDB = [];
        let imagenesDB: { [key: string]: string[] } = {};
        let unidadesByProducto: Record<string, any> = {};
        if (productosIds.length > 0) {
          const supabaseClient = supabase;
          let productosQuery = supabaseClient
            .from('v_productos_catalogo')
            .select('*')
            .in('producto_id', productosIds);
          if (activeSucursalId) productosQuery = productosQuery.eq('sucursal_id', activeSucursalId);
          const { data: productosData, error: productosError } = await productosQuery;
          if (productosError) throw productosError;
          productosDB = Array.isArray(productosData) ? productosData : [];

          let unidadesQuery = supabaseClient
            .from('productos')
            .select('user_id, stock, unidad_base, unidades_alternativas, factor_conversion')
            .in('user_id', productosIds);
          if (activeSucursalId) unidadesQuery = unidadesQuery.eq('sucursal_id', activeSucursalId);
          const { data: unidadesData } = await unidadesQuery;
          unidadesByProducto = Object.fromEntries((Array.isArray(unidadesData) ? unidadesData : []).map((row) => [String(row.user_id), row]));

          // Traer imágenes asociadas
          let imgsQuery = supabaseClient
            .from('producto_imagenes')
            .select('producto_id, imagen_url')
            .in('producto_id', productosIds);
          if (activeSucursalId) imgsQuery = imgsQuery.eq('sucursal_id', activeSucursalId);
          const { data: imgs } = await imgsQuery;
          if (Array.isArray(imgs)) {
            imgs.forEach(i => {
              if (!imagenesDB[i.producto_id]) imagenesDB[i.producto_id] = [];
              if (i.imagen_url) imagenesDB[i.producto_id].push(i.imagen_url);
            });
          }
        }

        // Consultar packs desde la base de datos
        let packsDB = [];
        if (packsIds.length > 0) {
          let packsQuery = supabase
            .from('packs')
            .select(`*, pack_productos ( cantidad, producto_id, variante_id, productos!pack_productos_producto_id_fkey ( user_id, nombre, precio, categoria, stock, producto_variantes ( id, color, precio, stock, stock_decimal, sku ) ) )`)
            .in('id', packsIds);
          if (activeSucursalId) packsQuery = packsQuery.eq('sucursal_id', activeSucursalId);
          const { data: packsData, error: packsError } = await packsQuery;
          if (packsError) throw packsError;
          packsDB = Array.isArray(packsData) ? packsData : [];
        }

        // Reconstruir carrito solo con productos/packs válidos
        const carritoReconstruido = productosAgrupados.map((p) => {
          if (p.pack_id) {
            const pack = packsDB.find((pk: { id: string | number }) => String(pk.id) === String(p.pack_id));
            if (!pack) return { ...p, error: 'Pack no encontrado en base de datos' };
            return {
              tipo: 'pack',
              pack_id: pack.id,
              pack_data: pack,
              nombre: pack.nombre || 'Pack especial',
              cantidad: normalizeQuantity(p.cantidad_base ?? p.cantidad ?? 1),
              cantidad_base: normalizeQuantity(p.cantidad_base ?? p.cantidad ?? 1),
              cantidad_display: normalizeQuantity(p.cantidad_display ?? p.cantidad ?? 1),
              precio: pack.precio_pack,
              precio_pack: pack.precio_pack,
              precio_individual: (pack.pack_productos ?? []).reduce((t: number, i: { productos: { precio: number }, cantidad: number }) => t + (i.productos.precio * i.cantidad), 0),
              descuento: ((pack.pack_productos ?? []).reduce((t: number, i: { productos: { precio: number }, cantidad: number }) => t + (i.productos.precio * i.cantidad), 0)) - pack.precio_pack,
              productos: pack.pack_productos ?? [],
              cart_key: `pack:${pack.id}`,
              imagen_url: pack.imagen_url || '/sin-imagen.png',
            };
          }
          // Producto normal
          const prodId = p.producto_id || p.user_id;
          // Si prodId es string tipo 'pack-<id>', ignorar este item
          if (typeof prodId === 'string' && prodId.startsWith('pack-')) {
            return { ...p, error: 'ID inválido para producto (pack-xx)' };
          }
          const productoCompleto = productosDB.find((prod: { producto_id: string | number }) => String(prod.producto_id) === String(prodId));
          if (!productoCompleto) return { ...p, error: 'Producto no encontrado en base de datos' };
          const unidadesProducto = unidadesByProducto[String(prodId)] || {};
          const variantesProducto = Array.isArray(productoCompleto.variantes) ? productoCompleto.variantes : [];
          const varianteSeleccionada = p.variante_id
            ? variantesProducto.find((v: VariantMatch) => String(v.variante_id ?? v.id) === String(p.variante_id))
            : null;
          // Siempre usar la imagen del producto
          const imagenesProducto = imagenesDB[productoCompleto.producto_id] || [];
          const imagen_url = imagenesProducto.length > 0 ? imagenesProducto[0] : '/sin-imagen.png';
          const unidadBase = p.unidad_base || unidadesProducto.unidad_base || productoCompleto.unidad_base || p.unidad || 'unidad';
          const unidadesAlternativas = Array.isArray(p.unidades_alternativas)
            ? p.unidades_alternativas
            : Array.isArray(unidadesProducto.unidades_alternativas)
              ? unidadesProducto.unidades_alternativas
              : [];
          const factorConversion = Number(p.factor_conversion ?? unidadesProducto.factor_conversion ?? productoCompleto.factor_conversion ?? 0) || undefined;
          const cantidadBase = normalizeQuantity(p.cantidad_base ?? p.cantidad ?? 1);
          const cantidadDisplay = normalizeQuantity(p.cantidad_display ?? p.cantidad ?? 1);
          return {
            ...productoCompleto,
            cantidad: cantidadBase,
            cantidad_base: cantidadBase,
            cantidad_display: cantidadDisplay,
            unidad: p.unidad || unidadBase,
            unidad_base: unidadBase,
            unidades_alternativas: unidadesAlternativas,
            unidades_disponibles: [unidadBase, ...unidadesAlternativas.filter((u: string) => u !== unidadBase)],
            factor_conversion: factorConversion,
            tipo: 'producto',
            cart_key: `prod:${productoCompleto.producto_id}:${p.variante_id || 'default'}:${p.unidad || unidadBase}`,
            variante_id: p.variante_id || productoCompleto.variante_id,
            color: p.color || productoCompleto.color,
            precio: p.precio_unitario || productoCompleto.precio,
            precio_original: p.precio_original ?? p.precio_unitario ?? productoCompleto.precio,
            promocion_aplicada: p.promocion_aplicada || null,
            nombre: productoCompleto.nombre || 'Producto sin nombre',
            stock: varianteSeleccionada ? getVariantStock(varianteSeleccionada) : Number(unidadesProducto.stock ?? productoCompleto.stock ?? 0),
            categoria: productoCompleto.categoria,
            categorias: productoCompleto.categorias,
            variantes: variantesProducto,
            codigo_barra: productoCompleto.codigo_barra,
            codigo: productoCompleto.codigo,
            imagenes: productoCompleto.imagenes,
            imagen_url,
          };
        });

        // Si hay algún error, bloquear venta y mostrar error
        const errores = carritoReconstruido.filter(i => i.error);
        if (errores.length > 0) {
          showToast('Error: Hay productos o packs que ya no existen en la base de datos. Corrige el pedido antes de continuar.', 'error');
          setCarrito([]);
        } else {
          setCarrito(carritoReconstruido);
        }

        // Cargar datos de cliente si existen
        if (pedidoObj.cliente_nombre) cambiarCampo('nombre', pedidoObj.cliente_nombre);
        if (pedidoObj.usuario_email || pedidoObj.cliente_email) cambiarCampo('email', pedidoObj.usuario_email || pedidoObj.cliente_email);
        if (pedidoObj.cliente_telefono) cambiarCampo('telefono', pedidoObj.cliente_telefono);
        if (pedidoObj.cliente_nit) cambiarCampo('nit', pedidoObj.cliente_nit);
      } catch (e: unknown) {
        console.error('Error cargando pedido:', e);
        let errorMsg = '';
        if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') {
          errorMsg = (e as any).message;
        } else {
          errorMsg = String(e);
        }
        showToast('Error cargando pedido: ' + errorMsg, 'error');
        setCarrito([]);
      }
      sessionStorage.removeItem('pedido_a_efectivizar');
    })();
    // Solo dependencias estables para evitar warning de React
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCarrito, cambiarCampo]);

  // shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); document.querySelector<HTMLInputElement>('input[placeholder="Escanea o ingresa código de barra"]')?.focus(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); document.querySelector<HTMLInputElement>('input[placeholder*="Buscar producto"]')?.focus(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector<HTMLInputElement>('input[placeholder*="Carnet"]')?.focus(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); document.querySelector<HTMLButtonElement>('button[aria-label="efectivizar-venta"]')?.click(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // fetch iniciales
  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // sonido beep
  useEffect(() => {
    beepRef.current = new Audio('/beep.mp3');
  }, []);

  // pago auto

  // Sincroniza pagos con total
  useEffect(() => {
    // Si método no es efectivo, autollenar monto
    setPagos((prev) => prev.map((p, idx) => {
      if (p.metodo && p.metodo !== 'efectivo' && Number(p.monto) === 0) {
        // Si hay dos pagos, el segundo es el resto
        if (mostrarSegundoPago && idx === 1) {
          return { ...p, monto: Math.max(0, totalCobrar - (Number(prev[0]?.monto) || 0)) };
        }
        return { ...p, monto: totalCobrar };
      }
      return p;
    }));
  }, [pagos[0]?.metodo, pagos[1]?.metodo, totalCobrar, mostrarSegundoPago]);

  useEffect(() => {
    setShowInsufficientPaymentWarning(pagoInsuficiente);
  }, [pagoInsuficiente]);

  useEffect(() => {
    if (!stockWarning) return;
    const timeoutId = setTimeout(() => clearStockWarning(), 2500);
    return () => clearTimeout(timeoutId);
  }, [stockWarning, clearStockWarning]);

  useEffect(() => {
    if (!Array.isArray(productos) || productos.length === 0 || carrito.length === 0) return;

    setCarrito((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.tipo === 'pack' || item.user_id == null) return item;
        const product = productos.find((p) => String(p.user_id) === String(item.user_id));
        if (!product || !hasUnitConversion(product)) return item;

        const unidadBase = String(product.unidad_base || item.unidad_base || 'unidad');
        const alternativas = Array.isArray(product.unidades_alternativas)
          ? product.unidades_alternativas.filter((u) => u && u !== unidadBase)
          : [];
        const unidadAlternativa = alternativas[0];
        const factor = Number(product.factor_conversion || item.factor_conversion || 0);
        const stockBase = getProductStock(product);
        if (!unidadAlternativa || !Number.isFinite(factor) || factor <= 0) return item;

        const unidadesDisponibles = [
          ...(stockBase >= 1 ? [unidadBase] : []),
          ...(stockBase * factor > 0 ? [unidadAlternativa] : []),
        ];
        const unidadActual = String(item.unidad || item.unidad_base || unidadBase);
        const unidadVenta = unidadesDisponibles.includes(unidadActual)
          ? unidadActual
          : (unidadesDisponibles[0] || unidadAlternativa);
        const cantidadDisplay = normalizeQuantity(item.cantidad_display ?? item.cantidad ?? 1) || 1;
        const cantidadBase = unidadVenta === unidadBase ? cantidadDisplay : cantidadDisplay / factor;

        const patched = {
          ...item,
          stock: stockBase,
          unidad_base: unidadBase,
          unidades_alternativas: alternativas,
          unidades_disponibles: unidadesDisponibles,
          factor_conversion: factor,
          unidad: unidadVenta,
          cantidad: cantidadBase,
          cantidad_base: cantidadBase,
          cantidad_display: cantidadDisplay,
        };

        const same =
          Number(item.stock || 0) === stockBase &&
          item.unidad_base === patched.unidad_base &&
          item.unidad === patched.unidad &&
          Number(item.factor_conversion || 0) === factor &&
          Number(item.cantidad_base || 0) === cantidadBase &&
          Number(item.cantidad_display || 0) === cantidadDisplay &&
          JSON.stringify(item.unidades_disponibles || []) === JSON.stringify(unidadesDisponibles);

        if (!same) changed = true;
        return same ? item : patched;
      });
      return changed ? next : prev;
    });
  }, [productos, carrito, setCarrito]);

  // Escaneo: si el producto está en un pack, ofrecer opción de agregar pack o individual
  const procesarCodigo = useCallback(async (codigo: string) => {
    const normalizeCode = (value: unknown) => String(value ?? '').replace(/\D/g, '');
    const matchesBarcode = (input: string, stored: unknown) => {
      const a = normalizeCode(input);
      const b = normalizeCode(stored);
      if (!a || !b) return false;
      return a === b || (a.length === 13 && a.slice(0, 12) === b) || (b.length === 13 && b.slice(0, 12) === a);
    };

    const buildScannedProduct = (p: Producto) => {
      const variants = Array.isArray(p.variantes) ? p.variantes : [];
      const matchedVariant = variants.find((variant) => {
        const currentVariant = variant as VariantMatch;
        return matchesBarcode(codigo, currentVariant?.codigo_barra) || matchesBarcode(codigo, currentVariant?.sku);
      }) as VariantMatch | undefined;
      if (!matchedVariant) return null;
      const productHasConversion = hasUnitConversion(p as {
        unidades_alternativas?: string[];
        factor_conversion?: number;
      });

      return {
        ...p,
        variante_id: matchedVariant?.variante_id ?? matchedVariant?.id,
        color: matchedVariant?.color || 'Sin color',
        precio: Number(matchedVariant?.precio ?? p.precio ?? 0),
        stock: productHasConversion
          ? Number((p as Producto & { stock?: number }).stock ?? 0)
          : Number((matchedVariant as VariantMatch & { stock_decimal?: number })?.stock_decimal ?? matchedVariant?.stock ?? 0),
        codigo: String(matchedVariant?.sku || '')
      } as Producto;
    };

    let productoEncontrado: Producto | null = null;
    for (const p of productos) {
      const candidate = buildScannedProduct(p);
      if (candidate) {
        productoEncontrado = candidate;
        break;
      }
    }

    // Fallback: buscar en DB por si el producto se creó recientemente y la página sigue abierta
    if (!productoEncontrado) {
      const resultados = await searchProductos(codigo);
      if (Array.isArray(resultados) && resultados.length > 0) {
        const conVariante = resultados.find((resultado) => resultado.variante_id != null);
        if (conVariante) {
          productoEncontrado = conVariante;
        }
      }
    }

    if (!productoEncontrado) {
      return false;
    }

    // Buscar si el producto está en algún pack activo
    const packsConEsteProducto = packs.filter(pack =>
      Array.isArray(pack.pack_productos) &&
      pack.pack_productos.some(item => item.productos.user_id === productoEncontrado.user_id)
    );

    if (packsConEsteProducto.length > 0) {
      // Mostrar confirmación al usuario
      if (window.confirm(`Este producto está en un pack: ${packsConEsteProducto.map(p=>p.nombre).join(', ')}.\n¿Agregar el pack (OK) o solo el producto individual (Cancelar)?`)) {
        // Agregar el primer pack encontrado
        agregar({
          user_id: null,
          tipo: 'pack',
          pack_id: packsConEsteProducto[0].id,
          pack_data: packsConEsteProducto[0],
          nombre: packsConEsteProducto[0].nombre,
          cantidad: 1,
          precio: packsConEsteProducto[0].precio_pack,
          precio_pack: packsConEsteProducto[0].precio_pack,
          precio_individual: (packsConEsteProducto[0].pack_productos ?? []).reduce((t: number, i: { productos: { precio: number }, cantidad: number }) => t + (i.productos.precio * i.cantidad), 0),
          descuento: calcularDescuentoPack(packsConEsteProducto[0]).descuentoAbsoluto,
          productos: packsConEsteProducto[0].pack_productos,
          cart_key: `pack:${packsConEsteProducto[0].id}`
        });
      } else {
        // Agregar solo el producto individual con su precio original
        agregar({ ...productoEncontrado, precio: productoEncontrado.precio, tipo: 'producto' });
      }
    } else {
      agregar(productoEncontrado);
    }

    // Sonido y feedback
    beepRef.current?.play().catch(() => {});
    if (navigator.vibrate) navigator.vibrate(80);
    setScanFeedback(true);
    setTimeout(() => setScanFeedback(false), 200);
    return true;
  }, [productos, agregar, searchProductos, packs]);

  const handleBuscadorSubmit = useCallback(async () => {
    const raw = busqueda.trim();
    if (!raw) {
      await searchProductos('');
      setShowSuggestions(true);
      // Mostrar todos los packs activos si no hay búsqueda
      setPackResults(packs);
      return;
    }

    const codigoNumerico = raw.replace(/\D/g, '');
    if (codigoNumerico.length >= 6) {
      const now = Date.now();
      const last = lastAutoAddRef.current;
      if (!(last.code === codigoNumerico && now - last.timestamp < 700)) {
        const agregado = await procesarCodigo(codigoNumerico);
        if (agregado) {
          lastAutoAddRef.current = { code: codigoNumerico, timestamp: now };
          setBusqueda('');
          setShowSuggestions(false);
          setPackResults([]);
          return;
        }
      }
    }

    await searchProductos(raw);
    // Filtrar packs por nombre o productos incluidos
    const lower = raw.toLowerCase();
    const filteredPacks = packs.filter(pack => {
      if (pack.nombre?.toLowerCase().includes(lower)) return true;
      if (pack.descripcion?.toLowerCase().includes(lower)) return true;
      if (Array.isArray(pack.pack_productos)) {
        return pack.pack_productos.some(item => item.productos?.nombre?.toLowerCase().includes(lower));
      }
      return false;
    });
    setPackResults(filteredPacks);
    setShowSuggestions(true);
  }, [busqueda, procesarCodigo, searchProductos, packs]);

  // detector de scanner real (teclado rápido + ENTER)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const active = document.activeElement as HTMLElement | null;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);
      const isBarcodeInput = isInput && active instanceof HTMLInputElement && active.placeholder?.includes('Escanea o ingresa código de barra');

      // ignorar teclas especiales
      if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return;

      // ENTER = terminar escaneo (solo si no estamos en un campo normal o estamos en campo de barcode)
      if (key === 'Enter') {
        if (isInput && !isBarcodeInput) return; // no ligar con enter de formulario normal

        const codigo = scanBuffer.current;

        if (codigo.length >= 6) {
          procesarCodigo(codigo);
        }

        scanBuffer.current = '';
        setBusqueda('');
        setShowSuggestions(false);

        if (scanTimer.current) {
          clearTimeout(scanTimer.current);
          scanTimer.current = null;
        }

        return;
      }

      // solo números
      if (/^[0-9]$/.test(key)) {
        if (isInput && !isBarcodeInput) return; // dejamos escribir cantidades y pagos normales

        e.preventDefault();
        scanBuffer.current += key;

        // reset timer (detectar si no es scanner)
        if (scanTimer.current) clearTimeout(scanTimer.current);

        scanTimer.current = setTimeout(() => {
          scanBuffer.current = '';
          scanTimer.current = null;
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (scanTimer.current) clearTimeout(scanTimer.current);
    };
  }, [procesarCodigo]);


  // acciones de venta
  const registrarIngresoEnCaja = useCallback(async (venta: VentaCajaPayload) => {
    try {
      const modo = String(venta?.modo_pago || "").toLowerCase();
      const payment_method =
        modo === "efectivo"
          ? "cash"
          : modo === "qr"
            ? "qr"
            : modo === "tarjeta"
              ? "card"
            : modo === "transferencia"
              ? "transfer"
              : "other";

      const amount = Number(venta?.total || 0);
      if (!Number.isFinite(amount) || amount <= 0) return;

      const saleDate = String(venta?.fecha || "").slice(0, 10) || new Date().toISOString().slice(0, 10);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;

      const response = await fetch('/api/cash/movements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: saleDate,
          type: 'income',
          payment_method,
          amount,
          description: `Ingreso automatico por venta #${venta?.id}`,
          cashbox_id: 'main',
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'No se pudo registrar el ingreso automatico en caja');
      }
    } catch (cashError) {
      // No bloqueamos la venta por un error de sincronizacion de caja.
      console.error('No se pudo registrar ingreso automatico en caja:', cashError);
      showToast('La venta se guardo, pero no se pudo reflejar en flujo de caja automaticamente.', 'info');
    }
  }, []);

  const efectivizarVenta = useCallback(async () => {
      // ...existing code...
    if (carrito.length === 0) { showToast('El carrito esta vacio', 'error'); return; }
    if (!pagos[0].metodo || pagos[0].monto <= 0) { showToast('Selecciona al menos un método de pago y monto', 'error'); return; }
    if (mostrarSegundoPago && (!pagos[1].metodo || pagos[1].monto <= 0)) { showToast('Completa el segundo método de pago y monto', 'error'); return; }
    if (sumaPagos + 0.009 < totalCobrar) { showToast('La suma de los pagos es insuficiente', 'error'); return; }
    if (!tienePagoEnEfectivo && sumaPagos > totalCobrar + 0.01) { showToast('La suma de los pagos supera el total', 'error'); return; }
    if (cliente.requiereFactura && (!cliente.nombre.trim() || !cliente.nit.trim())) { showToast('Completa los datos de facturacion (nombre y NIT)', 'error'); return; }

    setEfectivizando(true);
    let ventaCreadaId: string | number | null = null;
    const stockSnapshots: Array<
      | { type: 'product'; productId: string | number; stock: number }
      | { type: 'variant'; variantId: string | number; stock: number; productId?: string | number; productStock?: number }
    > = [];

    const rollbackVenta = async () => {
      if (!ventaCreadaId) return;
      const ventaId = ventaCreadaId;
      const errors: string[] = [];

      for (const snapshot of [...stockSnapshots].reverse()) {
        if (snapshot.type === 'variant') {
          const { error } = await ventasService.establecerStockVariante(snapshot.variantId, snapshot.stock);
          if (error) errors.push(`stock variante ${snapshot.variantId}: ${error.message || String(error)}`);
          if (snapshot.productId != null && snapshot.productStock != null) {
            const { error: productError } = await ventasService.establecerStockProducto(snapshot.productId, snapshot.productStock);
            if (productError) errors.push(`stock producto ${snapshot.productId}: ${productError.message || String(productError)}`);
          }
        } else {
          const { error } = await ventasService.establecerStockProducto(snapshot.productId, snapshot.stock);
          if (error) errors.push(`stock producto ${snapshot.productId}: ${error.message || String(error)}`);
        }
      }

      const cleanupSteps = [
        supabase.from('stock_movimientos').delete().ilike('observaciones', `%venta #${ventaId}%`),
        supabase.from('ventas_pagos').delete().eq('venta_id', ventaId),
        supabase.from('ventas_detalle').delete().eq('venta_id', ventaId),
        supabase.from('ventas').delete().eq('id', ventaId),
      ];
      for (const step of cleanupSteps) {
        const { error } = await step;
        if (error) errors.push(error.message || String(error));
      }

      if (errors.length > 0) {
        console.error('Rollback de venta incompleto:', errors);
        showToast('La venta fallo y se intento revertir, pero revisa la base de datos.', 'error');
      }
    };

    try {
      // Obtener token y usuario solo una vez
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const userId = sessionData?.session?.user?.id || null;
      const userEmail = sessionData?.session?.user?.email || null;
      // 1. Agrupar productos y packs del carrito
      const productosIds = carrito.filter(p => p.tipo !== 'pack' && p.user_id).map(p => String(p.user_id));
      const packsIds = carrito.filter(p => p.tipo === 'pack' && p.pack_id).map(p => String(p.pack_id));

      // 2. Consultar productos y variantes desde la base de datos
      let productosDB: ProductoDB[] = [];
      if (productosIds.length > 0) {
        let productosQuery = supabase
          .from('productos')
          .select('user_id, nombre, precio, precio_compra, stock, categoria, codigo_barra, unidad_base, unidades_alternativas, factor_conversion, producto_variantes ( id, color, precio, stock, stock_decimal, sku )')
          .in('user_id', productosIds);
        if (activeSucursalId) productosQuery = productosQuery.eq('sucursal_id', activeSucursalId);
        const { data: productosData, error: productosError } = await productosQuery;
        if (productosError) throw productosError;
        productosDB = Array.isArray(productosData) ? productosData : [];
      }

      // 3. Consultar packs y sus productos desde la base de datos
      let packsDB: PackDB[] = [];
      if (packsIds.length > 0) {
        let packsQuery = supabase
          .from('packs')
          .select('*, pack_productos ( cantidad, producto_id, variante_id, productos!pack_productos_producto_id_fkey ( user_id, nombre, precio, categoria, stock, producto_variantes ( id, color, precio, stock, stock_decimal, sku ) ) )')
          .in('id', packsIds);
        if (activeSucursalId) packsQuery = packsQuery.eq('sucursal_id', activeSucursalId);
        const { data: packsData, error: packsError } = await packsQuery;
        if (packsError) throw packsError;
        packsDB = Array.isArray(packsData) ? packsData : [];
      }

      const stockRequests = new Map<string, StockRequest>();
      const addStockRequest = (key: string, request: StockRequest) => {
        const current = stockRequests.get(key);
        if (current) {
          current.solicitado += request.solicitado;
          return;
        }
        stockRequests.set(key, request);
      };

      for (const p of carrito) {
        const cantidadBase = normalizeQuantity(p.cantidad_base ?? p.cantidad ?? 1);
        if (cantidadBase <= 0) throw new Error(`Cantidad invalida para ${p.nombre || 'producto'}`);

        if (p.tipo === 'pack') {
          const pack = packsDB.find(pk => String(pk.id) === String(p.pack_id));
          if (!pack) throw new Error('Pack no encontrado en base de datos');

          for (const item of pack.pack_productos ?? []) {
            const productoPack = item.productos;
            if (!productoPack?.user_id) throw new Error('Producto de pack no encontrado en base de datos');
            const cantidadTotal = normalizeQuantity(item.cantidad) * cantidadBase;
            if (item.variante_id) {
              const variante = productoPack.producto_variantes?.find((v: { id?: string | number }) => String(v.id) === String(item.variante_id));
              if (!variante) throw new Error(`Variante de pack no encontrada para ${productoPack.nombre || 'producto'}`);
              addStockRequest(`var:${String(variante.id)}`, {
                nombre: productoPack.nombre || 'Producto',
                color: variante.color || null,
                disponible: getVariantStock(variante),
                solicitado: cantidadTotal
              });
            } else {
              addStockRequest(`prod:${String(productoPack.user_id)}`, {
                nombre: productoPack.nombre || 'Producto',
                color: null,
                disponible: getProductStock(productoPack),
                solicitado: cantidadTotal
              });
            }
          }
          continue;
        }

        if (p.user_id == null) throw new Error('Producto invalido en carrito');
        const productoCompleto = productosDB.find(prod => String(prod.user_id) === String(p.user_id));
        if (!productoCompleto) throw new Error(`Producto no encontrado en base de datos: ${p.nombre || p.user_id}`);
        const cantidadBaseVenta = getSaleBaseQuantity(p, productoCompleto);

        if (p.variante_id) {
          const variante = (productoCompleto.producto_variantes || []).find((v) => String(v.id) === String(p.variante_id));
          if (!variante) throw new Error(`Color no encontrado para ${productoCompleto.nombre || p.nombre}`);
          addStockRequest(`var:${String(variante.id)}`, {
            nombre: productoCompleto.nombre || p.nombre || 'Producto',
            color: variante.color || p.color || null,
            disponible: getStockForVariantSale(productoCompleto, variante),
            solicitado: cantidadBaseVenta
          });
        } else {
          addStockRequest(`prod:${String(productoCompleto.user_id)}`, {
            nombre: productoCompleto.nombre || p.nombre || 'Producto',
            color: null,
            disponible: getProductStock(productoCompleto),
            solicitado: cantidadBaseVenta
          });
        }
      }

      for (const request of stockRequests.values()) {
        if (request.solicitado > request.disponible + 0.0001) {
          throw new Error(
            `Stock insuficiente para ${request.nombre}${request.color ? ` color ${request.color}` : ''} ` +
            `(stock=${formatStockQuantity(request.disponible)}, solicitado=${formatStockQuantity(request.solicitado)})`
          );
        }
      }

      // 4. Armar objeto de costos extra
      const costos_extra = {
        envio: Number(envio) || 0,
        comision: Number(comision) || 0,
        impuestos: Number(impuestosCalculados.toFixed(2)) || 0,
        cobrar_impuestos: cobrarImpuestos,
        publicidad: Number(publicidad) || 0,
        rebajas: Number(rebajas) || 0,
        descuento: Number(totalDescuento) || 0
      };

      // 5. Usuario actual
      // (ya definido arriba)

      // 6. Crear venta

      // Guardar venta principal
      const { data: venta, error: ventaError } = await ventasService.crearVenta({
        cliente_nombre: cliente.nombre,
        cliente_telefono: cliente.telefono,
        cliente_email: cliente.email,
        cliente_nit: cliente.nit,
        requiere_factura: cliente.requiereFactura,
        modo_pago: pagos.map(p=>p.metodo).join(' + '),
        total: totalCobrar,
        pago: sumaPagos,
        cambio,
        usuario_id: userId,
        usuario_email: userEmail,
        descuentos: totalDescuento,
        costos_extra
        ,
        sucursal_id: activeSucursalId || undefined
      });
      if (ventaError || !venta) throw ventaError || new Error('no venta');
      ventaCreadaId = venta.id as string | number;

      // Guardar pagos en ventas_pagos
      // Definir saleDate después de crear venta
      const saleDate = venta?.fecha || new Date().toISOString();
      // Insertar cada pago en ventas_pagos
      for (const pagoObj of pagos) {
        if (!pagoObj.metodo || pagoObj.monto <= 0) continue;
        const pagoVenta = {
          venta_id: venta.id,
          monto: pagoObj.monto,
          metodo_pago: pagoObj.metodo,
          usuario_email: userEmail,
          sucursal_id: activeSucursalId || undefined,
          created_at: new Date().toISOString(),
        };
        (Object.keys(pagoVenta) as Array<keyof typeof pagoVenta>).forEach(k => {
          if (pagoVenta[k] === undefined) delete pagoVenta[k];
        });
        await ventasService.insertarVentaPago(pagoVenta);
      }

      // 7. Insertar detalles robustos
      for (const p of carrito) {
        const cantidadVisible = Number(p.cantidad_display ?? p.cantidad ?? 1);
        const unidadVenta = String(p.unidad || p.unidad_base || 'unidad');
        const unidadBaseVenta = String(p.unidad_base || unidadVenta || 'unidad');
        if (p.tipo === 'pack') {
          const cantidadBase = Number(p.cantidad_base ?? p.cantidad ?? 1);
          const cantidadDetalle = toIntegerDetailQuantity(cantidadBase);
          // Buscar pack completo en DB
          const pack = packsDB.find(pk => String(pk.id) === String(p.pack_id));
          if (!pack) throw new Error('Pack no encontrado en base de datos');
          // Insertar detalle de pack
          const { error: detallePackError } = await ventasService.insertarVentaDetalle({
            venta_id: venta.id,
            producto_id: null, // always null for packs
            cantidad: cantidadDetalle,
            cantidad_base: cantidadBase,
            unidad: unidadBaseVenta,
            precio_unitario: pack.precio_pack,
            costo_unitario: 0,
            color: null,
            descripcion: `📦 Pack: ${pack.nombre}`,
            tipo: 'pack',
            pack_id: pack.id,
            created_at: new Date().toISOString(),
            sucursal_id: activeSucursalId || undefined,
            usuario_email: userEmail
          });
          if (detallePackError) throw detallePackError;
          // Descontar stock de cada producto del pack
          for (const item of pack.pack_productos ?? []) {
            const cantidadTotal = normalizeQuantity(item.cantidad) * cantidadBase;
            const productoPack = item.productos;
            if (!productoPack?.user_id) throw new Error('Producto de pack no encontrado en base de datos');
            // Si el producto tiene variante, descontar stock de variante
            if (item.variante_id) {
              const variante = productoPack.producto_variantes?.find(v => String(v.id) === String(item.variante_id));
              if (variante) {
                // Aquí podrías llamar a un servicio para descontar stock de variante si aplica
                // await descontarStockVariante(variante.id, cantidadTotal);
                // Después de descontar stock de la variante, actualizar el stock total del producto
                // 1. Descontar stock de la variante (debería implementarse en ventasService)
                // 2. Recalcular y actualizar el stock total del producto
                if (variante.id == null) throw new Error(`Variante de pack sin ID para ${productoPack.nombre || 'producto'}`);
                const stockEsperado = getVariantStock(variante) - cantidadTotal;
                stockSnapshots.push({
                  type: 'variant',
                  variantId: variante.id,
                  stock: getVariantStock(variante),
                  productId: productoPack.user_id,
                  productStock: getProductStock(productoPack),
                });
                const { error: stockPackVarianteError } = await ventasService.establecerStockVariante(variante.id, stockEsperado);
                if (stockPackVarianteError) throw stockPackVarianteError;
                const { error: movPackVarianteError } = await supabase.from('stock_movimientos').insert([{
                  producto_id: productoPack.user_id,
                  variante_id: variante.id,
                  tipo: 'venta',
                  cantidad: cantidadTotal,
                  unidad: 'unidad',
                  cantidad_base: cantidadTotal,
                  usuario_id: userId,
                  usuario_email: userEmail,
                  sucursal_id: activeSucursalId || undefined,
                  observaciones: `Salida automatica por venta #${venta.id}`
                }]);
                if (movPackVarianteError) throw movPackVarianteError;
                await actualizarStockTotalProducto(productoPack.user_id);
              }
            } else {
              const stockEsperado = getProductStock(productoPack) - cantidadTotal;
              stockSnapshots.push({
                type: 'product',
                productId: productoPack.user_id,
                stock: getProductStock(productoPack),
              });
              const { error: stockPackError } = await ventasService.establecerStockProducto(productoPack.user_id, stockEsperado);
              if (stockPackError) throw stockPackError;
              const { error: movPackError } = await supabase.from('stock_movimientos').insert([{
                producto_id: productoPack.user_id,
                variante_id: null,
                tipo: 'venta',
                cantidad: cantidadTotal,
                unidad: 'unidad',
                cantidad_base: cantidadTotal,
                usuario_id: userId,
                usuario_email: userEmail,
                sucursal_id: activeSucursalId || undefined,
                observaciones: `Salida automatica por venta #${venta.id}`
              }]);
              if (movPackError) throw movPackError;
              // Actualizar el stock total del producto
              await actualizarStockTotalProducto(productoPack.user_id);
            }
          }
        } else {
          // Buscar producto completo en DB
          // Ignore items with user_id: null (should only be for packs)
          if (p.user_id == null) continue;
          const productoCompleto = productosDB.find(prod => String(prod.user_id) === String(p.user_id));
          if (!productoCompleto) throw new Error('Producto no encontrado en base de datos');
          const cantidadBase = getSaleBaseQuantity(p, productoCompleto);
          const cantidadDetalle = toIntegerDetailQuantity(cantidadBase);
          let variante = null;
          if (p.variante_id) {
            variante = (productoCompleto.producto_variantes || []).find((v: { id?: string | number }) => String(v.id) === String(p.variante_id));
          }
          const precioUnitario = Number(p.precio ?? variante?.precio ?? productoCompleto.precio ?? 0);
          const costoUnitario = productoCompleto.precio_compra || 0;
          const descripcionItem = `${productoCompleto.nombre}${variante?.color ? ` ${variante.color}` : p.color ? ` ${p.color}` : ''}${unidadVenta !== unidadBaseVenta ? ` (${cantidadVisible} ${unidadVenta} = ${formatStockQuantity(cantidadBase)} ${unidadBaseVenta})` : ''}`.trim();
          let stockSnapshotRegistrado = false;
          if (variante?.id && shouldUseProductStockForVariant(productoCompleto)) {
            stockSnapshots.push({
              type: 'variant',
              variantId: variante.id,
              stock: getStockForVariantSale(productoCompleto, variante),
              productId: productoCompleto.user_id,
              productStock: getProductStock(productoCompleto),
            });
            stockSnapshotRegistrado = true;
            const stockLegacyDisponible = Number(variante.stock || 0);
            const stockLegacyNecesario = Math.ceil(Math.max(1, cantidadVisible));
            if (stockLegacyDisponible < stockLegacyNecesario) {
              const { error: legacyStockError } = await ventasService.establecerStockLegacyVariante(variante.id, stockLegacyNecesario);
              if (legacyStockError) throw legacyStockError;
            }
          }
          const { error: detalleProductoError } = await ventasService.insertarVentaDetalle({
            venta_id: venta.id,
            producto_id: productoCompleto.user_id,
            cantidad: cantidadVisible,
            cantidad_base: cantidadBase,
            unidad: unidadVenta,
            precio_unitario: precioUnitario,
            costo_unitario: costoUnitario,
            variante_id: variante?.id || null,
            color: variante?.color || p.color || null,
            descripcion: descripcionItem,
            tipo: 'producto',
            created_at: new Date().toISOString(),
            sucursal_id: activeSucursalId || undefined,
            usuario_email: userEmail
          });
          if (detalleProductoError) throw detalleProductoError;
          if (variante?.id) {
            const stockEsperado = getStockForVariantSale(productoCompleto, variante) - cantidadBase;
            if (!stockSnapshotRegistrado) {
              stockSnapshots.push({
                type: 'variant',
                variantId: variante.id,
                stock: getStockForVariantSale(productoCompleto, variante),
                productId: productoCompleto.user_id,
                productStock: getProductStock(productoCompleto),
              });
            }
            const { error: stockVarianteError } = await ventasService.establecerStockVariante(variante.id, stockEsperado);
            if (stockVarianteError) throw stockVarianteError;
            const { error: movVarianteError } = await supabase.from('stock_movimientos').insert([{
              producto_id: productoCompleto.user_id,
              variante_id: variante.id,
              tipo: 'venta',
              cantidad: cantidadVisible,
              unidad: unidadVenta,
              cantidad_base: cantidadBase,
              usuario_id: userId,
              usuario_email: userEmail,
              sucursal_id: activeSucursalId || undefined,
              observaciones: `Salida automatica por venta #${venta.id}`
            }]);
            if (movVarianteError) throw movVarianteError;
          } else {
            const stockEsperado = getProductStock(productoCompleto) - cantidadBase;
            stockSnapshots.push({
              type: 'product',
              productId: productoCompleto.user_id,
              stock: getProductStock(productoCompleto),
            });
            const { error: stockProductoError } = await ventasService.establecerStockProducto(productoCompleto.user_id, stockEsperado);
            if (stockProductoError) throw stockProductoError;
            const { error: movProductoError } = await supabase.from('stock_movimientos').insert([{
              producto_id: productoCompleto.user_id,
              variante_id: null,
              tipo: 'venta',
              cantidad: cantidadVisible,
              unidad: unidadVenta,
              cantidad_base: cantidadBase,
              usuario_id: userId,
              usuario_email: userEmail,
              sucursal_id: activeSucursalId || undefined,
              observaciones: `Salida automatica por venta #${venta.id}`
            }]);
            if (movProductoError) throw movProductoError;
          }
          // Actualizar el stock total del producto
          await actualizarStockTotalProducto(productoCompleto.user_id);
        }
      }

      // --- Función para recalcular y actualizar el stock total del producto ---
      async function actualizarStockTotalProducto(productoId: string | number) {
        await sincronizarStockProducto(productoId, supabase);
      }


      // Sincroniza automáticamente ingresos de ventas con flujo de caja, uno por cada método de pago
      // Usa sessionData, token y saleDate ya definidos arriba
      for (const pagoObj of pagos) {
        if (!pagoObj.metodo || pagoObj.monto <= 0) continue;
        let payment_method = 'other';
        if (pagoObj.metodo === 'efectivo') payment_method = 'cash';
        else if (pagoObj.metodo === 'qr') payment_method = 'qr';
        else if (pagoObj.metodo === 'tarjeta') payment_method = 'other';
        else if (pagoObj.metodo === 'transferencia') payment_method = 'transfer';
        if (token) {
          const response = await fetch('/api/cash/movements', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              date: saleDate.slice(0, 10),
              type: 'income',
              payment_method,
              amount: pagoObj.monto,
              description: `Ingreso por venta #${venta?.id} (${pagoObj.metodo})`,
              cashbox_id: 'main',
              sucursal_id: activeSucursalId || undefined,
            }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.success) {
            showToast(`Error al registrar en caja: ${payload?.error || 'Error desconocido'}`, 'error');
            console.error('Error cash_movements:', payload?.error || response.statusText);
          }
        }
      }

      // snapshot ticket y imprimir
      const _ticket = {
        venta,
        items: carrito.map((it: Producto) => ({ ...it })),
        fecha: new Date().toLocaleString(),
        cliente_nombre: cliente.nombre,
        cliente_nit: cliente.nit,
        modo_pago: pagos.map(p=>`${p.metodo}: Bs ${p.monto}`).join(' + '),
        requiere_factura: cliente.requiereFactura,
        subtotal,
        descuento: totalDescuento,
        total: totalCobrar,
        envio,
        comision,
        publicidad,
        rebajas,
        impuestos: Number(impuestosCalculados.toFixed(2)),
        cobrar_impuestos: cobrarImpuestos,
        pago: sumaPagos,
        cambio
      };
      printerRef.current?.printComprobante();
      // limpieza de carrito y cliente después de impresión
      setCarrito([]);
      setPagos([{ metodo: '', monto: 0 }]);
      // reset costos
      setEnvio(0); setComision(0); setPublicidad(0); setRebajas(0); setCobrarImpuestos(false);
      cambiarCampo('nombre',''); cambiarCampo('carnet',''); cambiarCampo('telefono',''); cambiarCampo('email',''); cambiarCampo('nit',''); cambiarCampo('guardado',false); cambiarCampo('requiereFactura',false);
      setEfectivizando(false);
      showToast('Venta efectivizada y stock actualizado');
    } catch (err) {
      await rollbackVenta();
      const errorContext = err && typeof err === 'object'
        ? ['message', 'details', 'hint']
            .map((key) => {
              const value = (err as Record<string, unknown>)[key];
              return typeof value === 'string' && value.trim() ? value : null;
            })
            .filter(Boolean)
            .join(' | ')
        : '';
      const errorMessage = err instanceof Error
        ? err.message
        : errorContext || String(err);
      showToast('Error al crear venta: ' + errorMessage, 'error');
      setEfectivizando(false);
    }
  }, [carrito, cliente, pagos, cambio, totalCobrar, subtotal, totalDescuento, packs, setCarrito, cambiarCampo, envio, comision, publicidad, rebajas, impuestosCalculados, cobrarImpuestos, registrarIngresoEnCaja]);

  // ...continued building UI mostly replicates previous layout using components

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start py-8 px-2 bg-gradient-to-br from-gray-100 to-gray-300">
      <h1 className="text-3xl font-extrabold mb-8 text-gray-900 w-full text-center">Nueva Venta</h1>
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white rounded-xl shadow-xl p-0 mb-8 border border-gray-900">
        <div className="col-span-1 lg:col-span-1 bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-200 p-6 sticky top-16 z-0 print:hidden flex flex-col h-full">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="font-bold text-gray-900 text-lg">Resumen de la venta</span>
              <span className="text-gray-900">Subtotal: <span className="font-bold">Bs {subtotal.toFixed(2)}</span></span>
              {totalDescuento > 0 && <span className="text-green-700">Descuentos: -Bs {totalDescuento.toFixed(2)}</span>}
              <span className="text-gray-900">Base operativa: <span className="font-bold">Bs {totalBaseOperacion.toFixed(2)}</span></span>
              {cobrarImpuestos && <span className="text-amber-700">IVA+IT (16%): +Bs {impuestosCalculados.toFixed(2)}</span>}
              <span className="text-2xl font-extrabold text-gray-900">Total a cobrar: Bs {totalCobrar.toFixed(2)}</span>
            </div>
            {/* costos adicionales configurables por admin */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-700">Envio</label>
                <input type="number" step="0.01" min="0" value={envio} onChange={e=>setEnvio(parsePositiveNumber(e.target.value))} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-gray-700">Comision</label>
                <input type="number" step="0.01" min="0" value={comision} onChange={e=>setComision(parsePositiveNumber(e.target.value))} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-gray-700">Impuestos</label>
                <input type="number" step="0.01" min="0" value={Number(impuestosCalculados.toFixed(2))} readOnly className="w-full border p-2 rounded bg-gray-100" />
              </div>
              <div>
                <label className="block text-gray-700">Publicidad</label>
                <input type="number" step="0.01" min="0" value={publicidad} onChange={e=>setPublicidad(parsePositiveNumber(e.target.value))} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-gray-700">Rebajas</label>
                <input type="number" step="0.01" min="0" value={rebajas} onChange={e=>setRebajas(parsePositiveNumber(e.target.value))} className="w-full border p-2 rounded" />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                checked={cobrarImpuestos}
                onChange={(e) => setCobrarImpuestos(e.target.checked)}
                className="w-4 h-4"
              />
              Cobrar IVA + IT (16% sobre precio final)
            </label>
            <button
              type="button"
              onClick={() => printerRef.current?.printCotizacion()}
              className="mt-6 w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-lg text-base disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={efectivizando || carrito.length === 0}
            >
              Imprimir cotización
            </button>
          </div>
        </div>
        <div className="col-span-2 p-6">
          <ClienteForm
            cliente={cliente}
            onChange={cambiarCampo}
            onBuscar={buscarPorCarnet}
            onGuardar={guardar}
            onBuscarEmailHistorico={buscarEmailHistorico}
          />

          {/* Métodos de pago */}
          <div className="mb-4 flex flex-col gap-2">
            <label className="font-bold text-gray-900">Modo de pago:</label>
            {[0, mostrarSegundoPago ? 1 : null].filter(i => i !== null).map((idx) => (
              <div key={idx} className="flex gap-2 flex-wrap items-center mb-2">
                {['efectivo','tarjeta','qr','transferencia'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPagos(p => p.map((pago, i) => i === idx ? { ...pago, metodo: m } : pago))}
                    className={`px-3 py-2 rounded-full font-semibold transition ${(pagos[idx] && pagos[idx].metodo === m) ? 'bg-green-700 text-white shadow' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                  >
                    {m.charAt(0).toUpperCase()+m.slice(1)}
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-40 border border-gray-900 bg-white text-gray-900 rounded px-3 py-2 placeholder-gray-700 focus:border-gray-900 focus:ring focus:ring-gray-900/30"
                  placeholder="Monto"
                  value={pagos[idx]?.monto ?? ''}
                  onChange={e => setPagos(p => p.map((pago, i) => i === idx ? { ...pago, monto: parsePositiveNumber(e.target.value) } : pago))}
                />
                {idx === 0 && (
                  <span className="text-sm text-gray-700">Cambio: <span className={cambio < 0 ? 'text-red-700' : 'text-green-700'}>Bs {cambio.toFixed(2)}</span></span>
                )}
              </div>
            ))}
            {/* Checkbox para segundo método */}
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 mt-2">
              <input
                type="checkbox"
                checked={mostrarSegundoPago}
                onChange={e => {
                  setMostrarSegundoPago(e.target.checked);
                  setPagos(p => e.target.checked ? (p.length === 1 ? [...p, { metodo: '', monto: 0 }] : p) : [p[0]]);
                }}
                className="w-4 h-4"
              />
              ¿Tienes otro método de pago?
            </label>
          </div>

          {/* ...existing code... */}

          <BuscadorProductos
            busqueda={busqueda}
            onChange={val => { setBusqueda(val); searchProductos(val); }}
            onSubmit={handleBuscadorSubmit}
            searchResults={searchResults}
            searchLoading={searchLoading}
            imagenes={imagenes}
            onAdd={agregar}
            showSuggestions={showSuggestions}
            setShowSuggestions={setShowSuggestions}
            packResults={packResults}
            onAddPack={pack => {
              // Estructura para agregar pack al carrito
              agregar({
                user_id: null,
                tipo: 'pack',
                pack_id: pack.id,
                pack_data: pack,
                nombre: pack.nombre,
                cantidad: 1,
                precio: pack.precio_pack,
                precio_pack: pack.precio_pack,
                precio_individual: (pack.pack_productos ?? []).reduce((t: number, i: { productos: { precio: number }, cantidad: number }) => t + (i.productos.precio * i.cantidad), 0),
                descuento: calcularDescuentoPack(pack).descuentoAbsoluto,
                productos: pack.pack_productos ?? [],
                cart_key: `pack:${pack.id}`
              });
              setShowSuggestions(false);
              setBusqueda('');
              setPackResults([]);
            }}
            promociones={promociones}
          />

          <CarritoPanel
            carrito={carrito}
            imagenes={imagenes}
            quitar={quitar}
            cambiarCantidad={cambiarCantidad}
            cambiarUnidadYCantidad={cambiarUnidadYCantidad}
            subtotal={subtotal}
            totalDescuento={totalDescuento}
            total={total}
            envio={envio}
            comision={comision}
            publicidad={publicidad}
            rebajas={rebajas}
            impuestos={impuestosCalculados}
            totalCobrar={totalCobrar}
            modoPago={pagos.map(p=>p.metodo).join(' + ')}
            pago={sumaPagos}
            cambio={cambio}
            packs={packs}
            promociones={promociones}
          />

          {stockWarning && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="font-bold text-amber-800">Stock insuficiente</p>
              <p className="text-sm text-amber-700">{stockWarning}</p>
            </div>
          )}

          {showInsufficientPaymentWarning && (
            <div className="mt-4 p-4 rounded-lg border border-red-300 bg-red-50">
              <p className="text-red-800 font-bold">El pago recibido es insuficiente</p>
              <p className="text-red-700 text-sm">Faltan: Bs {(totalCobrar - sumaPagos).toFixed(2)}</p>
            </div>
          )}

          <button
            ref={efectivizarBtnRef}
            aria-label="efectivizar-venta"
            onClick={efectivizarVenta}
            className="mt-4 w-full bg-black hover:bg-gray-900 text-white font-bold py-3 rounded-lg text-lg disabled:opacity-60"
            disabled={efectivizando || showInsufficientPaymentWarning}
          >
            {efectivizando ? "Procesando..." : "Efectivizar venta"}
          </button>
        </div>
      </div>
      {efectivizando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl font-bold text-black">Procesando venta...</div>
        </div>
      )}

      {scanFeedback && (
        <>
          <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
            <div className="bg-green-500/90 text-white px-6 py-3 rounded-xl text-xl font-bold shadow-2xl animate-pulse">
              ✔ Producto agregado
            </div>
          </div>
          <div className="fixed inset-0 bg-green-400/20 z-40 pointer-events-none" />
        </>
      )}

      <TicketPrinter
        ref={printerRef}
        carrito={carrito}
        clienteNombre={cliente.nombre}
        clienteNIT={cliente.nit}
        modoPago={pagos.map(p=>`${p.metodo}: Bs ${p.monto}`).join(' + ')}
        requiereFactura={cliente.requiereFactura}
        subtotal={subtotal}
        totalDescuento={totalDescuento}
        total={totalCobrar}
        envio={envio}
        comision={comision}
        publicidad={publicidad}
        rebajas={rebajas}
        impuestos={Number(impuestosCalculados.toFixed(2))}
        cobrarImpuestos={cobrarImpuestos}
        pago={sumaPagos}
        cambio={cambio}
        ultimoTicket={undefined}
        setUltimoTicket={() => {}}
      />
    </div>
  );
}
