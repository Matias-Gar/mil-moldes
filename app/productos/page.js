"use client";

// --- IMPORTS Y HOOKS NECESARIOS ---
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { usePromociones } from "@/lib/usePromociones";
import { usePacks, calcularDescuentoPack } from "@/lib/packs";
import { supabase } from "@/lib/SupabaseClient";
import { DEFAULT_STORE_SETTINGS, fetchStoreSettings, resolveBranchWhatsapp } from "@/lib/storeSettings";
import { PrecioConPromocion, calcularPrecioConPromocion, PromoCompactBanner } from "@/lib/promociones";
import { getOptimizedImageUrl } from "@/lib/imageOptimization";
import { normalizeProductView } from "@/lib/productViews";
import PublicSucursalSelector, { usePublicSucursal } from "@/components/PublicSucursalSelector";

function UnitPricePanel({ conversionInfo, factor, className = "mb-3" }) {
    if (!conversionInfo) return null;
    const PriceValue = ({ original, final }) => (
        <span className="flex shrink-0 flex-col items-end leading-tight">
            {conversionInfo.tienePromocion && (
                <span className="text-xs text-gray-800 line-through decoration-gray-800">
                    Bs {original.toFixed(2)}
                </span>
            )}
            <span className={`font-bold ${conversionInfo.tienePromocion ? 'text-green-600' : 'text-blue-700'}`}>
                Bs {final.toFixed(2)}
            </span>
        </span>
    );

    return (
        <div className={`${className} space-y-1 text-left`}>
            <div className="space-y-0.5">
                {conversionInfo.showBasePrice && (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-600 sm:text-sm">Por {conversionInfo.unidadBase}</span>
                        <PriceValue original={conversionInfo.precioBaseOriginal} final={conversionInfo.precioBase} />
                    </div>
                )}
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-600 sm:text-sm">Por {conversionInfo.unidadAlternativa}</span>
                    <PriceValue original={conversionInfo.precioAlternativoOriginal} final={conversionInfo.precioAlternativo} />
                </div>
            </div>
            <div className="text-[11px] leading-tight text-gray-500">
                1 {conversionInfo.unidadBase} = {Number(factor || 0).toFixed(2).replace(/\.00$/, '')} {conversionInfo.unidadAlternativa}
            </div>
            {conversionInfo.tienePromocion && (
                <PromoCompactBanner
                    porcentaje={conversionInfo.porcentajeDescuento}
                    descripcion={conversionInfo.promocionDescripcion}
                    fechaFin={conversionInfo.promocionFechaFin}
                />
            )}
        </div>
    );
}


// --- INICIO DEL FLUJO AVANZADO DEL CATÁLOGO ---
function getEffectiveVariantStock(variant) {
    const decimal = Number(variant?.stock_decimal);
    const legacy = Number(variant?.stock);
    return Math.max(0, Number.isFinite(decimal) && decimal > 0 ? decimal : legacy || 0);
}

function isDefaultUniqueVariant(variant) {
    const color = String(variant?.color || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    return !color || color === 'unico' || color === 'sin color';
}

function hasRealVariantId(variant) {
    const id = variant?.variante_id ?? variant?.id;
    return id !== undefined && id !== null && String(id).trim() !== '' && String(id) !== 'undefined';
}

export default function CatalogoPage() {
        const pathname = usePathname();
        const currentPublicView = pathname?.startsWith('/insumos') ? 'insumos' : 'articulos';
        const {
            sucursales,
            activeSucursal,
            activeSucursalId,
            loading: sucursalesLoading,
            error: sucursalesError,
            setActiveSucursalId,
        } = usePublicSucursal();
        const cartStorageKey = `carrito_temporal_${activeSucursalId || 'global'}`;
        const legacyCartStorageKeys = [
            `carrito_temporal_insumos_${activeSucursalId || 'global'}`,
            `carrito_temporal_${activeSucursalId || 'global'}`,
            'carrito_temporal',
        ];
    const [modalWarning, setModalWarning] = useState("");
    const [modalImg, setModalImg] = useState(null);
    const [addToCartModal, setAddToCartModal] = useState(null);
    const [showCart, setShowCart] = useState(false);
    const [showConfirmOrder, setShowConfirmOrder] = useState(false);
    const [customerData, setCustomerData] = useState({ nombre: '', nit_ci: '' });
    // --- Declarar promociones usando el hook personalizado ---
    const { promociones } = usePromociones(activeSucursalId);
                                const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');
                                const [busqueda, setBusqueda] = useState('');
                                const [imagenesProductos, setImagenesProductos] = useState({});
                            const [productos, setProductos] = useState([]);
                        const { packs, loading: loadingPacks } = usePacks(activeSucursalId);
                    const [categorias, setCategorias] = useState([]);
                const [storeSettings, setStoreSettings] = useState(DEFAULT_STORE_SETTINGS);
            const [cart, setCart] = useState([]);
        const [usuario, setUsuario] = useState(null);
    const getAvailableUnits = (producto, stockBaseInput = null) => {
        const unidadBase = String(producto?.unidad_base || 'unidad').trim() || 'unidad';
        const alternativas = Array.isArray(producto?.unidades_alternativas)
            ? producto.unidades_alternativas.map((u) => String(u || '').trim()).filter(Boolean)
            : [];
        const factor = Number(producto?.factor_conversion || 0);
        const unidadAlternativa = alternativas.find((u) => u && u !== unidadBase);
        if (!unidadAlternativa || !Number.isFinite(factor) || factor <= 0 || stockBaseInput === null) {
            return [unidadBase, ...alternativas.filter((u) => u !== unidadBase)];
        }
        const stockBase = Math.max(0, Number(stockBaseInput) || 0);
        const units = [];
        if (stockBase >= 1) units.push(unidadBase);
        if (stockBase * factor > 0) units.push(unidadAlternativa);
        return units.length > 0 ? units : [unidadBase];
    };
    const toBaseQuantity = (cantidad, unidad, producto) => {
        const qty = Number(cantidad || 0);
        const factor = Number(producto?.factor_conversion || 0);
        const unidadBase = String(producto?.unidad_base || 'unidad').trim() || 'unidad';
        if (!Number.isFinite(qty) || qty <= 0) return 0;
        if (unidad === unidadBase || !factor || factor <= 0) return qty;
        return qty / factor;
    };
    const fromBaseQuantity = (cantidadBase, unidad, producto) => {
        const qty = Number(cantidadBase || 0);
        const factor = Number(producto?.factor_conversion || 0);
        const unidadBase = String(producto?.unidad_base || 'unidad').trim() || 'unidad';
        if (!Number.isFinite(qty) || qty <= 0) return 0;
        if (unidad === unidadBase || !factor || factor <= 0) return qty;
        return qty * factor;
    };
    const formatQuantity = (value) => {
        const parsed = Number(value || 0);
        if (!Number.isFinite(parsed)) return '0';
        return Number(parsed.toFixed(2)).toString();
    };
    const normalizeUnitName = (unit) => String(unit || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    const isDiscreteUnit = (unit) => {
        const normalized = normalizeUnitName(unit);
        return ['unidad', 'unidades', 'pieza', 'piezas', 'pza', 'pzas', 'par', 'pares', 'item', 'items', 'articulo', 'articulos'].includes(normalized);
    };
    const normalizeQuantityForUnit = (value, unit) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return isDiscreteUnit(unit) ? 1 : 0.01;
        return isDiscreteUnit(unit) ? Math.max(1, Math.floor(parsed)) : Math.max(0.01, parsed);
    };
    const getQuantityStepForUnit = (unit) => isDiscreteUnit(unit) ? 1 : 0.01;
    const getQuantityMinForUnit = (unit) => isDiscreteUnit(unit) ? 1 : 0.01;
    const getProductStockBase = (producto, varianteId = null) => {
        const variantes = Array.isArray(producto?.variantes) ? producto.variantes : [];
        const productStock = Math.max(0, Number(producto?.stock ?? producto?.stock_total ?? 0));
        const totalVariantStock = variantes.reduce((acc, variante) => acc + getEffectiveVariantStock(variante), 0);
        if (variantes.length > 0) {
            if (varianteId !== null && varianteId !== undefined) {
                const variante = variantes.find((v) => String(v.variante_id ?? v.id) === String(varianteId));
                return getEffectiveVariantStock(variante);
            }
            return totalVariantStock > 0 || productStock <= 0 ? totalVariantStock : productStock;
        }
        return productStock;
    };
    const getCatalogIdentity = (producto) => {
        const barcode = String(producto?.codigo_barra || '').trim();
        if (barcode) return `barcode:${barcode}`;
        return `name:${String(producto?.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()}`;
    };
    const dedupeCatalogProducts = (items) => {
        const byIdentity = new Map();
        (items || []).forEach((producto) => {
            const key = getCatalogIdentity(producto);
            const current = byIdentity.get(key);
            const stock = getProductStockBase(producto);
            const currentStock = current ? getProductStockBase(current) : -1;
            if (!current || stock > currentStock || (stock === currentStock && Number(producto?.user_id || 0) < Number(current?.user_id || 0))) {
                byIdentity.set(key, producto);
            }
        });
        return Array.from(byIdentity.values());
    };
    const getStockBreakdown = (producto, stockBaseInput = null) => {
        const stockBase = Math.max(0, Number(stockBaseInput ?? getProductStockBase(producto)) || 0);
        const unidadBase = String(producto?.unidad_base || 'unidad').trim() || 'unidad';
        const alternativas = Array.isArray(producto?.unidades_alternativas)
            ? producto.unidades_alternativas.map((u) => String(u || '').trim()).filter(Boolean)
            : [];
        const unidadAlternativa = alternativas.find((u) => u && u !== unidadBase);
        const factor = Number(producto?.factor_conversion || 0);
        if (!unidadAlternativa || !Number.isFinite(factor) || factor <= 0) {
            return {
                agotado: stockBase <= 0,
                principal: `${formatQuantity(stockBase)} ${unidadBase}`,
                detalle: '',
                fullBase: Math.floor(stockBase),
                totalAlt: 0,
            };
        }
        const fullBase = Math.floor(stockBase + 0.000001);
        const remainingAlt = Math.max(0, (stockBase - fullBase) * factor);
        const totalAlt = stockBase * factor;
        let principal = `${formatQuantity(totalAlt)} ${unidadAlternativa}`;
        let detalle = '';
        if (fullBase > 0) {
            principal = `${fullBase} ${unidadBase}${fullBase === 1 ? '' : 's'}`;
            detalle = remainingAlt > 0
                ? `+ ${formatQuantity(remainingAlt)} ${unidadAlternativa} sueltos`
                : `${formatQuantity(totalAlt)} ${unidadAlternativa} en total`;
        }
        return { agotado: stockBase <= 0, principal, detalle, fullBase, totalAlt };
    };
    const getItemDisplayQuantity = (item) => Number(item?.cantidad_display ?? item?.cantidad ?? 0);
    const getItemBaseQuantity = (item) => Number(item?.cantidad_base ?? item?.cantidad ?? 0);
    const getItemPricing = (item) => {
        if (item?.tipo === 'pack') {
            return {
                precioOriginal: Number(item?.precio_individual ?? item?.precio ?? 0),
                precioFinal: Number(item?.precio ?? 0),
                descuento: Number(item?.descuento_pack ?? 0),
                tienePromocion: Number(item?.descuento_pack ?? 0) > 0,
                promocion: item?.descuento_pack ? { descripcion: 'Pack especial' } : null,
                porcentajeDescuento: '0',
            };
        }
        return calcularPrecioConPromocion({
            ...item,
            precio_original: Number(item?.precio_original ?? item?.precio ?? 0),
            cantidad_base: getItemBaseQuantity(item),
            cantidad: getItemBaseQuantity(item),
        }, promociones);
    };
    const getItemSubtotal = (item) => getItemPricing(item).precioFinal * getItemBaseQuantity(item);
    const getItemDiscountTotal = (item) => Math.max(0, getItemPricing(item).descuento || 0) * getItemBaseQuantity(item);
    const getCartSubtotalOriginal = () => cart.reduce((sum, item) => sum + Number(getItemPricing(item).precioOriginal || 0) * getItemBaseQuantity(item), 0);
    const getCartDiscountTotal = () => cart.reduce((sum, item) => sum + getItemDiscountTotal(item), 0);
    const getCartTotal = () => cart.reduce((sum, item) => sum + getItemSubtotal(item), 0);
    const getItemQuantityText = (item) => item?.tipo === 'pack'
        ? `x${getItemDisplayQuantity(item)}`
        : `${getItemDisplayQuantity(item)} ${item?.unidad || item?.unidad_base || 'unidad'}`;
    const getConversionPriceInfo = (producto, stockBaseInput = null) => {
        const unidadBase = String(producto?.unidad_base || 'unidad').trim() || 'unidad';
        const alternativas = Array.isArray(producto?.unidades_alternativas)
            ? producto.unidades_alternativas.map((u) => String(u || '').trim()).filter(Boolean)
            : [];
        const unidadAlternativa = alternativas.find((u) => u && u !== unidadBase);
        const factor = Number(producto?.factor_conversion || 0);
        const stockBase = Math.max(0, Number(stockBaseInput ?? getProductStockBase(producto)) || 0);

        if (!unidadAlternativa || !Number.isFinite(factor) || factor <= 0) {
            return null;
        }

        const precioInfo = calcularPrecioConPromocion(producto, promociones);

        return {
            unidadBase,
            unidadAlternativa,
            precioBase: Number(precioInfo.precioFinal || 0),
            precioBaseOriginal: Number(precioInfo.precioOriginal || 0),
            precioAlternativo: Number(precioInfo.precioFinal || 0) / factor,
            precioAlternativoOriginal: Number(precioInfo.precioOriginal || 0) / factor,
            tienePromocion: precioInfo.tienePromocion,
            porcentajeDescuento: precioInfo.porcentajeDescuento,
            promocionDescripcion: precioInfo.promocion?.descripcion || '',
            promocionFechaFin: precioInfo.promocion?.fecha_fin || '',
            showBasePrice: stockBase >= 1,
        };
    };
    const mergeProductUnits = async (items) => {
        const ids = items.map((item) => item.user_id).filter(Boolean);
        if (ids.length === 0) return items;
        try {
            let productDetailsQuery = supabase
                .from('productos')
                .select('user_id, unidad_base, unidades_alternativas, factor_conversion, vista_producto, stock')
                .in('user_id', ids);
            let variantsQuery = supabase
                .from('producto_variantes')
                .select('producto_id, id, color, stock, stock_decimal, precio, imagen_url, sku')
                .in('producto_id', ids);
            if (activeSucursalId) {
                productDetailsQuery = productDetailsQuery.eq('sucursal_id', activeSucursalId);
                variantsQuery = variantsQuery.eq('sucursal_id', activeSucursalId);
            }
            const [{ data, error }, { data: variantRows }] = await Promise.all([
                productDetailsQuery,
                variantsQuery,
            ]);
            if (error || !Array.isArray(data)) return items;
            const byId = new Map(data.map((row) => [String(row.user_id), row]));
            const variantsByProductId = (Array.isArray(variantRows) ? variantRows : []).reduce((acc, row) => {
                const key = String(row.producto_id);
                if (!acc[key]) acc[key] = [];
                acc[key].push({
                    ...row,
                    variante_id: row.id,
                    stock_decimal: getEffectiveVariantStock(row),
                    stock: Number(row.stock ?? 0),
                });
                return acc;
            }, {});
            return items.map((item) => {
                const extra = byId.get(String(item.user_id));
                const variantesReales = variantsByProductId[String(item.user_id)];
                const variantes = Array.isArray(variantesReales) && variantesReales.length > 0
                    ? variantesReales
                    : item.variantes;
                if (!extra) return item;
                const variantStock = Array.isArray(variantes) && variantes.length > 0
                    ? variantes.reduce((acc, v) => acc + getEffectiveVariantStock(v), 0)
                    : 0;
                const productStock = Number.isFinite(Number(extra.stock)) ? Math.max(0, Number(extra.stock)) : Math.max(0, Number(item.stock || 0));
                const hasUnitConversion = Array.isArray(extra.unidades_alternativas) && extra.unidades_alternativas.length > 0 && Number(extra.factor_conversion || 0) > 0;
                return {
                    ...item,
                    variantes,
                    unidad_base: extra.unidad_base || item.unidad_base || 'unidad',
                    unidades_alternativas: Array.isArray(extra.unidades_alternativas) ? extra.unidades_alternativas : item.unidades_alternativas,
                    factor_conversion: Number(extra.factor_conversion || 0) || item.factor_conversion,
                    vista_producto: normalizeProductView(extra.vista_producto),
                    stock: hasUnitConversion
                        ? (productStock > 0 ? productStock : variantStock)
                        : (variantStock > 0 || productStock <= 0 ? variantStock : productStock)
                };
            });
        } catch {
            return items;
        }
    };
    const visiblePacks = packs.filter((pack) =>
        Array.isArray(pack.pack_productos) &&
        pack.pack_productos.length > 0 &&
        pack.pack_productos.every((item) =>
            normalizeProductView(item.productos?.vista_producto) === currentPublicView ||
            !item.productos?.vista_producto && productos.some((p) => String(p.user_id) === String(item.productos?.user_id))
        )
    );
    // --- Refactor: función de fetch fuera del useEffect para poder reutilizarla ---
    const fetchProductosYCategoriasYImagenes = async () => {
        if (sucursalesLoading) return;
        // Usar la misma vista pública que la home para evitar desajustes entre rutas.
        let catalogQuery = supabase
            .from('v_productos_catalogo')
            .select('producto_id, nombre, descripcion, precio_base, imagen_base, category_id, categoria, stock_total, codigo_barra, variantes');
        if (activeSucursalId) catalogQuery = catalogQuery.eq('sucursal_id', activeSucursalId);
        const { data: productosData, error: productosError } = await catalogQuery;
        if (productosError || !productosData) {
            setProductos([]);
            setImagenesProductos({});
            return;
        }
        const normalizedBase = productosData.map((p) => ({
                        ...p,
                        user_id: p.producto_id,
                        precio: Number(p.precio_base || 0),
                        variantes: Array.isArray(p.variantes) ? p.variantes : [],
                        imagen_url: p.imagen_base || null,
                        stock: (() => {
                                // Si tiene variantes, sumar stock de variantes
                                if (Array.isArray(p.variantes) && p.variantes.length > 0) {
                                        const stockBase = Number(p.stock_total || 0);
                                const variantStock = p.variantes.reduce((acc, v) => acc + getEffectiveVariantStock(v), 0);
                                const hasUnitConversion = Array.isArray(p.unidades_alternativas) && p.unidades_alternativas.length > 0 && Number(p.factor_conversion) > 0;
                                return hasUnitConversion ? stockBase : (variantStock > 0 || stockBase <= 0 ? variantStock : stockBase);
                                }
                                const stockBase = Number(p.stock_total || 0);
                                // Si hay conversión y unidades alternativas, calcular stock alternativo
                                if (
                                    Array.isArray(p.unidades_alternativas) &&
                                    p.unidades_alternativas.length > 0 &&
                                    Number(p.factor_conversion) > 0 &&
                                    p.unidad_base
                                ) {
                                    const stockAlternativo = stockBase * Number(p.factor_conversion);
                                    if (stockBase === 0 && stockAlternativo > 0) {
                                        return stockAlternativo;
                                    }
                                }
                                return stockBase;
                        })()
                }));
        const normalizedProducts = dedupeCatalogProducts((await mergeProductUnits(normalizedBase))
            .filter((p) => normalizeProductView(p.vista_producto) === currentPublicView));
        setProductos(normalizedProducts);

        // Traer categorías
        let categoriasQuery = supabase
            .from('categorias')
            .select('*');
        if (activeSucursalId) categoriasQuery = categoriasQuery.eq('sucursal_id', activeSucursalId);
        const { data: categoriasData, error: categoriasError } = await categoriasQuery;
        if (!categoriasError && categoriasData) {
            setCategorias(categoriasData);
        }

        // Traer imágenes asociadas
        let imagenesQuery = supabase
            .from('producto_imagenes')
            .select('producto_id, imagen_url');
        if (activeSucursalId) imagenesQuery = imagenesQuery.eq('sucursal_id', activeSucursalId);
        const { data: imagenesData, error: imagenesError } = await imagenesQuery;
        if (imagenesError || !imagenesData) {
            setImagenesProductos({});
            return;
        }
        // Agrupar imágenes por producto_id (usar tipo number para coincidir con producto.user_id)
        const imgs = {};
        imagenesData.forEach(img => {
            const key = Number(img.producto_id);
            if (!imgs[key]) imgs[key] = [];
            imgs[key].push(img.imagen_url);
        });
        setImagenesProductos(imgs);
    };

    useEffect(() => {
        fetchProductosYCategoriasYImagenes();
    }, [currentPublicView, activeSucursalId, sucursalesLoading]);

    // --- Recarga productos e imágenes al volver a la pestaña ---
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchProductosYCategoriasYImagenes();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [activeSucursalId, sucursalesLoading]);

    // Obtener usuario y perfil
    useEffect(() => {
        const getUser = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session && session.user) {
                    let nombre = session.user.email;
                    let nit_ci = '';
                    const { data: perfil, error } = await supabase
                        .from('perfiles')
                        .select('nombre, nit_ci')
                        .eq('id', session.user.id)
                        .maybeSingle();
                    if (error) {
                        // ...existing code...
                    }
                    if (perfil) {
                        if (perfil.nombre) nombre = perfil.nombre;
                        if (perfil.nit_ci) nit_ci = perfil.nit_ci;
                    }
                    // ...existing code...
                    setUsuario({ id: session.user.id, email: session.user.email, nombre, nit_ci });
                } else {
                    // ...existing code...
                    setUsuario(null);
                }
            } catch (error) {
                // ...existing code...
                setUsuario(null);
            }
        };
        getUser();
    }, []);


    useEffect(() => {
        let mounted = true;

        const loadStoreSettings = async () => {
            const settings = await fetchStoreSettings();
            if (mounted) setStoreSettings(settings);
        };

        loadStoreSettings();
        return () => {
            mounted = false;
        };
    }, []);

    // --- Recarga productos e imágenes al volver a la pestaña ---
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                // Re-ejecutar el fetch de productos e imágenes
                if (typeof fetchProductosYCategoriasYImagenes === 'function') {
                    fetchProductosYCategoriasYImagenes();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    // Auto-llenar datos del cliente cuando el usuario esté logueado
    useEffect(() => {
        if (usuario) {
            // ...existing code...
            setCustomerData(prevData => {
                const newData = {
                    nombre: usuario.nombre || prevData.nombre || '',
                    nit_ci: usuario.nit_ci || prevData.nit_ci || ''
                };
                // ...existing code...
                return newData;
            });
        } else {
            // ...existing code...
            setCustomerData({ nombre: '', nit_ci: '' });
        }
    }, [usuario]);

    // 2. Cargar carrito desde localStorage al inicio
    useEffect(() => {
        const byKey = new Map();
        const readCart = (key) => {
            try {
                const stored = localStorage.getItem(key);
                const parsed = stored ? JSON.parse(stored) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        };

        [cartStorageKey, ...legacyCartStorageKeys].forEach((key) => {
            readCart(key).forEach((item) => {
                const itemKey = item.cart_key || getCartKey(item);
                if (!byKey.has(itemKey)) byKey.set(itemKey, item);
            });
        });

        const mergedCart = Array.from(byKey.values());
        setCart(mergedCart);
        localStorage.setItem(cartStorageKey, JSON.stringify(mergedCart));
        legacyCartStorageKeys
            .filter((key) => key !== cartStorageKey)
            .forEach((key) => localStorage.removeItem(key));
    }, [cartStorageKey]);

    // 3. Guardar carrito en localStorage cada vez que cambia
    useEffect(() => {
        localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    }, [cart, cartStorageKey]);

    // --- Funciones del Carrito ---

    // Función helper para obtener el precio final de un producto (con promoción si aplica)
    const getPrecioFinal = (producto) => {
        const promocion = promociones.find(function(promo) {
            return (
                promo.producto_id === producto.user_id &&
                promo.activa === true &&
                (!promo.fecha_fin || new Date(promo.fecha_fin) >= new Date())
            );
        });

        if (!promocion) {
            return producto.precio;
        }

        let precioFinal = producto.precio;
        switch (promocion.tipo) {
            case 'descuento':
                precioFinal = producto.precio * (1 - promocion.valor / 100);
                break;
            case 'precio_fijo':
                precioFinal = promocion.valor;
                break;
            case 'descuento_absoluto':
                precioFinal = Math.max(0, producto.precio - promocion.valor);
                break;
            default:
                precioFinal = producto.precio;
        }
        return Math.max(0, precioFinal);
    };

    const getCartKey = (producto) => `prod:${String(producto.user_id)}:${String(producto.variante_id ?? 'default')}`;

    // Buscar producto en el carrito por id y variante
    const getVariantes = (producto) => (Array.isArray(producto.variantes) ? producto.variantes : []);
    const isPseudoUniqueProduct = (variantes) =>
        Array.isArray(variantes) &&
        variantes.length === 1 &&
        isDefaultUniqueVariant(variantes[0]) &&
        !hasRealVariantId(variantes[0]);

    const getStockDisponibleProducto = (producto, varianteId = null) => {
                const variantes = getVariantes(producto);
                const productStock = Math.max(0, Number(producto?.stock || 0));
                if (variantes.length > 0) {
                        if (varianteId !== null && varianteId !== undefined) {
                                const variante = variantes.find(function(v) { return String(v.variante_id ?? v.id) === String(varianteId); });
                                return getEffectiveVariantStock(variante);
                        }
                        const totalDisponible = variantes.reduce(function(acc, v) { return acc + getEffectiveVariantStock(v); }, 0);
                        return totalDisponible > 0 || productStock <= 0 ? Math.max(0, totalDisponible) : productStock;
                }

                // Stock base
                const stockBase = productStock;
                // Si hay conversión y unidades alternativas, calcular stock alternativo
                if (
                    Array.isArray(producto.unidades_alternativas) &&
                    producto.unidades_alternativas.length > 0 &&
                    Number(producto.factor_conversion) > 0 &&
                    producto.unidad_base
                ) {
                    // Si el stock base es 0, pero el alternativo es mayor a 0, devolver stock alternativo
                    const stockAlternativo = stockBase * Number(producto.factor_conversion);
                    if (stockBase === 0 && stockAlternativo > 0) {
                        return stockAlternativo;
                    }
                }
                return stockBase;
    };

        const isProductoAgotado = (producto) => {
            const stockBase = Math.max(0, Number(producto?.stock || 0));
            // Si hay conversión y unidades alternativas, considerar stock alternativo
            if (
                Array.isArray(producto.unidades_alternativas) &&
                producto.unidades_alternativas.length > 0 &&
                Number(producto.factor_conversion) > 0 &&
                producto.unidad_base
            ) {
                const stockAlternativo = stockBase * Number(producto.factor_conversion);
                if (stockBase === 0 && stockAlternativo > 0) {
                    return false; // No está agotado si hay stock alternativo
                }
            }
            return getStockDisponibleProducto(producto) <= 0;
        };

    const getStockDisponibleItem = (item) => {
        if (item?.tipo === 'pack') return 999;

        const producto = productos.find(function(p) { return String(p.user_id) === String(item.user_id); });
        if (!producto) return Math.max(0, Number(item.stock || 0));

        return getStockDisponibleProducto(producto, item.variante_id ?? null);
    };

    const openAddToCartModal = (producto) => {
        const rawVariantes = getVariantes(producto);
        const variantes = isPseudoUniqueProduct(rawVariantes) ? [] : rawVariantes;
        const productStockBase = getProductStockBase(producto);
        const hasUnitConversion =
            Array.isArray(producto?.unidades_alternativas) &&
            producto.unidades_alternativas.length > 0 &&
            Number(producto?.factor_conversion || 0) > 0;
        const defaultVariante =
            variantes.find(function(v) { return getEffectiveVariantStock(v) > 0; }) ||
            (variantes.length === 1 && (hasUnitConversion ? productStockBase > 0 : true) ? variantes[0] : null);
        const defaultVarianteId = defaultVariante ? (defaultVariante.variante_id ?? defaultVariante.id) : null;
        const defaultStockBase = defaultVariante
            ? (getEffectiveVariantStock(defaultVariante) || productStockBase)
            : productStockBase;
        const unidades = getAvailableUnits(producto, defaultStockBase);

        setAddToCartModal({
            producto,
            variantes,
            selectedVarianteId: defaultVarianteId,
            cantidad: 1,
            unidad: unidades[0]
        });
    };

    const confirmAddToCart = async () => {
        if (!addToCartModal?.producto) return;
        setModalWarning("");
        const { producto, variantes, cantidad, unidad } = addToCartModal;
        const singleUniqueVariant = variantes.length === 1 && isDefaultUniqueVariant(variantes[0]);
        const selectedVarianteId = addToCartModal.selectedVarianteId || (variantes.length === 1 ? (variantes[0].variante_id ?? variantes[0].id) : null);
        let varianteSeleccionada = {
            variante_id: null,
            color: null,
            precio: Number(producto.precio || 0)
        };
        let stockDisponible = getStockDisponibleProducto(producto);

        // Consulta a la base de datos para obtener datos actualizados
        let productoDB = null;
        let varianteDB = null;
        try {
            let prodWithUnitsQuery = supabase
                .from('productos')
                .select('user_id, nombre, precio, imagen_url, stock, unidad_base, unidades_alternativas, factor_conversion')
                .eq('user_id', producto.user_id);
            if (activeSucursalId) prodWithUnitsQuery = prodWithUnitsQuery.eq('sucursal_id', activeSucursalId);
            const { data: prodWithUnits, error: prodWithUnitsError } = await prodWithUnitsQuery.maybeSingle();
            if (prodWithUnitsError) {
                let prodFallbackQuery = supabase
                    .from('productos')
                    .select('user_id, nombre, precio, imagen_url, stock')
                    .eq('user_id', producto.user_id);
                if (activeSucursalId) prodFallbackQuery = prodFallbackQuery.eq('sucursal_id', activeSucursalId);
                const { data: prodFallback } = await prodFallbackQuery.maybeSingle();
                productoDB = prodFallback;
            } else {
                productoDB = prodWithUnits;
            }
            if (variantes.length > 0 && !(singleUniqueVariant && !selectedVarianteId)) {
                if (!selectedVarianteId) {
                    setModalWarning('Debes seleccionar un color para continuar.');
                    return;
                }
                let variantQuery = supabase
                    .from('producto_variantes')
                    .select('id, color, stock, stock_decimal, precio, imagen_url')
                    .eq('id', selectedVarianteId);
                if (activeSucursalId) variantQuery = variantQuery.eq('sucursal_id', activeSucursalId);
                const { data: varData } = await variantQuery.maybeSingle();
                varianteDB = varData;
            }
        } catch (e) {
            setModalWarning('Error consultando stock en base de datos. Intenta de nuevo.');
            return;
        }

        if (variantes.length > 0 && !(singleUniqueVariant && !varianteDB)) {
            if (!selectedVarianteId) {
                setModalWarning('Debes seleccionar un color para continuar.');
                return;
            }
            const selected = variantes.find(function(v) { return String(v.variante_id ?? v.id) === String(selectedVarianteId); });
            if (!selected || !varianteDB) {
                setModalWarning('Selecciona un color válido para continuar.');
                return;
            }
            const stockVarianteActual = getEffectiveVariantStock(varianteDB);
            if (stockVarianteActual <= 0) {
                setModalWarning('Esa opción está agotada. Elige otra disponible.');
                return;
            }
            varianteSeleccionada = {
                variante_id: varianteDB.id,
                color: varianteDB.color || null,
                precio: Number(varianteDB.precio ?? productoDB.precio ?? 0)
            };
            stockDisponible = stockVarianteActual;
        } else if (!productoDB || stockDisponible <= 0) {
            setModalWarning('Producto agotado por el momento.');
            return;
        } else {
            stockDisponible = Math.max(0, Number(productoDB.stock || 0));
        }

        const productoConVariante = {
            ...producto,
            unidad_base: productoDB?.unidad_base || producto.unidad_base,
            unidades_alternativas: Array.isArray(productoDB?.unidades_alternativas) ? productoDB.unidades_alternativas : producto.unidades_alternativas,
            factor_conversion: Number(productoDB?.factor_conversion || producto.factor_conversion || 0) || undefined,
            nombre: productoDB?.nombre || producto.nombre,
            imagen_url: varianteDB?.imagen_url || productoDB?.imagen_url || producto.imagen_url,
            variante_id: varianteSeleccionada.variante_id,
            color: varianteSeleccionada.color,
            precio: varianteSeleccionada.precio
        };

        const precioFinal = getPrecioFinal(productoConVariante);
        const selectedUnit = String(unidad || productoConVariante.unidad_base || 'unidad');
        const quantity = normalizeQuantityForUnit(cantidad, selectedUnit);
        const unidadesVenta = getAvailableUnits(productoConVariante, stockDisponible);
        if (!unidadesVenta.includes(selectedUnit)) {
            setModalWarning(`Ya no queda ${productoConVariante.unidad_base || 'unidad'} completo. Selecciona ${(unidadesVenta[0] || 'otra unidad')}.`);
            setAddToCartModal(prev => prev ? { ...prev, unidad: unidadesVenta[0] || selectedUnit } : prev);
            return;
        }
        const requestedBaseQuantity = toBaseQuantity(quantity, selectedUnit, productoConVariante);
        const cartKey = `${getCartKey(productoConVariante)}:${selectedUnit}`;

        // Validar stock antes de modificar el carrito
        const idx = cart.findIndex(p => (p.cart_key || getCartKey(p)) === cartKey);
        const cantidadActual = idx !== -1 ? getItemBaseQuantity(cart[idx]) : 0;
        const disponibleParaAgregar = Math.max(0, stockDisponible - cantidadActual);

        if (disponibleParaAgregar <= 0) {
            setModalWarning(`Lo sentimos, el stock actual que puede pedir es ${fromBaseQuantity(stockDisponible, selectedUnit, productoConVariante)} ${selectedUnit}.`);
            return;
        }

        if (requestedBaseQuantity > disponibleParaAgregar) {
            const mensaje = cantidadActual > 0
                ? `Lo sentimos, el stock actual que puede pedir es ${stockDisponible}. Ya tienes ${cantidadActual} en tu cesta, puedes agregar hasta ${disponibleParaAgregar} más.`
                : `Lo sentimos, el stock actual que puede pedir es ${fromBaseQuantity(stockDisponible, selectedUnit, productoConVariante)} ${selectedUnit}.`;
            setModalWarning(mensaje);
            return;
        }

        // Si pasa la validación, agregar al carrito
        setCart(prev => {
            const idxPrev = prev.findIndex(p => (p.cart_key || getCartKey(p)) === cartKey);
            if (idxPrev !== -1) {
                const updated = [...prev];
                updated[idxPrev] = {
                    ...updated[idxPrev],
                    unidad: selectedUnit,
                    cantidad: getItemDisplayQuantity(updated[idxPrev]) + quantity,
                    cantidad_display: getItemDisplayQuantity(updated[idxPrev]) + quantity,
                    cantidad_base: getItemBaseQuantity(updated[idxPrev]) + requestedBaseQuantity
                };
                return updated;
            }
            return [...prev, {
                ...productoConVariante,
                cart_key: cartKey,
                unidad: selectedUnit,
                cantidad: quantity,
                cantidad_display: quantity,
                cantidad_base: requestedBaseQuantity,
                precio: precioFinal
            }];
        });
        setAddToCartModal(null);
        setModalWarning("");
    };

    // Cambiar cantidad de producto en el carrito (por id)
    const updateCartQty = (itemKey, newQty) => {
        setCart(prev =>
            prev.flatMap(item => {
                if ((item.cart_key || getCartKey(item)) !== itemKey) return [item];

                const maxStock = getStockDisponibleItem(item);
                if (maxStock <= 0) return [];

                const requested = Math.max(0.01, Number(newQty) || 1);
                const requestedBase = toBaseQuantity(requested, item.unidad, item);
                if (requestedBase > maxStock) {
                    alert(`Lo sentimos, el stock actual que puede pedir es ${fromBaseQuantity(maxStock, item.unidad, item)} ${item.unidad || item.unidad_base || 'unidad'}.`);
                }
                const quantityBase = Math.max(0.01, Math.min(requestedBase, maxStock));
                const quantityDisplay = fromBaseQuantity(quantityBase, item.unidad, item);
                return [{ ...item, cantidad: quantityDisplay, cantidad_display: quantityDisplay, cantidad_base: quantityBase }];
            })
        );
    };

    // Eliminar producto del carrito (por id)
    const removeFromCart = (itemKey) => {
        setCart(prev => prev.filter(item => (item.cart_key || getCartKey(item)) !== itemKey));
    };

    // --- Función para abrir confirmación de pedido ---
    const openOrderConfirmation = () => {
        if (cart.length === 0) {
            alert("Tu cesta está vacía. Agrega productos para enviar un pedido.");
            return;
        }

        // Auto-llenar datos si el usuario está logueado
        if (usuario) {
            // ...existing code...
            setCustomerData(prevData => ({
                nombre: usuario.nombre || prevData.nombre || '',
                nit_ci: usuario.nit_ci || prevData.nit_ci || ''
            }));
        }

        setShowCart(false);
        setShowConfirmOrder(true);
    };

    // --- Función de WhatsApp (MEJORADA) ---
    const confirmAndSendWhatsapp = async () => {
        if (cart.length === 0) {
            alert("Tu cesta está vacía. Agrega productos para enviar un pedido.");
            return;
        }

        // 1. Guardar carrito en carritos_pendientes
        let nombreFinal = customerData.nombre || (usuario && usuario.nombre) || null;
        let nitciLlenado = customerData.nit_ci || (usuario && usuario.nit_ci) || null;
        let emailFinal = usuario && usuario.email ? usuario.email : null;

        // Importar el token anónimo
        let carritoToken = null;
        if (typeof window !== 'undefined') {
            try {
                carritoToken = localStorage.getItem('carrito_token');
            } catch {}
        }

        // Insertar y obtener el número de pedido (id)
        const { data, error } = await supabase.from("carritos_pendientes").insert([
            {
                cliente_nombre: nombreFinal || null,
                cliente_telefono: nitciLlenado || null, // Usar NIT/CI en lugar de teléfono
                usuario_id: usuario ? usuario.id : null,
                usuario_email: emailFinal || null,
                productos: cart.map(p => {
                    const precioInfo = getItemPricing(p);
                    if (p.tipo === 'pack') {
                        return {
                            tipo: 'pack',
                            pack_id: p.pack_id,
                            nombre: p.nombre,
                            cantidad: getItemDisplayQuantity(p),
                            cantidad_base: getItemBaseQuantity(p),
                            precio_unitario: p.precio,
                            precio_original: precioInfo.precioOriginal ?? p.precio,
                            descuento_item: getItemDiscountTotal(p) / Math.max(1, getItemBaseQuantity(p)),
                            promocion_aplicada: precioInfo.promocion || null,
                            productos: p.pack_data?.pack_productos?.map(pp => ({
                                producto_id: pp.productos.user_id,
                                variante_id: pp.variante_id || null,
                                nombre: pp.productos.nombre,
                                cantidad: pp.cantidad
                            })) || []
                        };
                    }
                    return {
                        tipo: 'producto',
                        producto_id: p.user_id,
                        variante_id: p.variante_id || null,
                        color: p.color || null,
                        unidad: p.unidad || p.unidad_base || 'unidad',
                        unidad_base: p.unidad_base || p.unidad || 'unidad',
                        unidades_alternativas: Array.isArray(p.unidades_alternativas) ? p.unidades_alternativas : [],
                        factor_conversion: Number(p.factor_conversion || 0) || null,
                        cantidad: getItemDisplayQuantity(p),
                        cantidad_base: getItemBaseQuantity(p),
                        precio_unitario: precioInfo.precioFinal,
                        precio_original: precioInfo.precioOriginal ?? p.precio,
                        descuento_item: precioInfo.descuento || 0,
                        promocion_aplicada: precioInfo.promocion || p.promocion_aplicada || null,
                        nombre: p.nombre || null
                    };
                }),
                carrito_token: carritoToken || null,
                sucursal_id: activeSucursalId || null,
            }
        ]).select('id').single();

        if (error || !data) {
            alert(`No se pudo guardar el pedido. Error: ${error?.message || 'Error desconocido'}. Por favor intenta de nuevo.`);
            return;
        }

        const pedidoId = data.id;

        // 📊 Track Facebook Pixel - Purchase
        // const totalValue = cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
        // trackPurchase(totalValue, 'BOB');

        // 2. Preparar mensaje WhatsApp
        const itemsList = cart.map(item => {
            const cantidadTexto = getItemQuantityText(item);
            const precioInfo = getItemPricing(item);
            const subtotal = getItemSubtotal(item).toFixed(2);
            const descuentoTexto = precioInfo.promocion?.descripcion && getItemDiscountTotal(item) > 0
                ? `\n   ${precioInfo.promocion.descripcion}: -Bs ${getItemDiscountTotal(item).toFixed(2)}`
                : '';
            return `*${cantidadTexto}* ${item.nombre} - (Bs ${subtotal})${descuentoTexto}`;
        }).join('\n');

        const descuentoTotal = getCartDiscountTotal();
        const subtotalOriginal = getCartSubtotalOriginal();
        const total = getCartTotal().toFixed(2);
        const nombreTexto = nombreFinal ? `Nombre: ${nombreFinal}\n` : '';
        const nitciTexto = nitciLlenado ? `NIT/CI: ${nitciLlenado}\n` : '';
        const pedidoTexto = `N° Pedido: ${pedidoId}`;

        const descuentoResumen = descuentoTotal > 0
            ? `\n*Subtotal:* Bs ${subtotalOriginal.toFixed(2)}\n*Descuento al por mayor/promos:* -Bs ${descuentoTotal.toFixed(2)}`
            : '';

        const message = encodeURIComponent(
            `¡Hola! Me gustaría hacer el siguiente pedido:\n\n${pedidoTexto}\n${nombreTexto}${nitciTexto}\n${itemsList}\n${descuentoResumen}\n\n*Total:* Bs ${total}\n\n¡Gracias!`
        );

        const whatsappNumber = resolveBranchWhatsapp(activeSucursal, storeSettings) || CONFIG.WHATSAPP_BUSINESS;
        const whatsappURL = `https://wa.me/${whatsappNumber}?text=${message}`;
        window.open(whatsappURL, '_blank');

        // Limpiar carrito y cerrar modales
        setShowConfirmOrder(false);
        setCart([]);
        setCustomerData({ nombre: '', nit_ci: '' });
        localStorage.removeItem(cartStorageKey);

        // Mensaje de éxito
        alert("¡Pedido enviado exitosamente! Se ha abierto WhatsApp para completar tu pedido.");
    };

    const normalizeColorName = (colorName) =>
        String(colorName || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

    const resolveColorHex = (rawName = '') => {
        const name = normalizeColorName(rawName);
        if (!name) return null;

        if (name.includes('negro') || name.includes('black')) return '#111827';
        if (name.includes('blanco') || name.includes('white')) return '#FFFFFF';
        if (name.includes('plateado') || name.includes('silver') || name.includes('plata')) return '#C0C0C0';
        if (name.includes('dorado') || name.includes('gold') || name.includes('oro')) return '#D4AF37';
        if (name.includes('gris') || name.includes('gray') || name.includes('plomo')) return '#6B7280';

        if (name.includes('beige') || name.includes('nude') || name.includes('natural') || name.includes('crema') || name.includes('camel') || name.includes('taupe')) return '#D9B995';
        if (name.includes('marron') || name.includes('cafe') || name.includes('brown') || name.includes('cobre') || name.includes('bronce')) return '#8B5A3C';

        if (name.includes('guindo') || name.includes('vino') || name.includes('bordo') || name.includes('ciruela') || name.includes('berenjena')) return '#7F1D1D';
        if (name.includes('rojo') || name.includes('red') || name.includes('coral') || name.includes('salmon') || name.includes('durazno')) return '#DC2626';
        if (name.includes('fucsia') || name.includes('magenta') || name.includes('rosa') || name.includes('rosado') || name.includes('pink')) return '#EC4899';

        if (name.includes('azul') || name.includes('blue') || name.includes('navy') || name.includes('celeste') || name.includes('cielo') || name.includes('petroleo') || name.includes('teal')) return '#2563EB';
        if (name.includes('turquesa') || name.includes('verde agua') || name.includes('menta')) return '#14B8A6';
        if (name.includes('verde') || name.includes('green') || name.includes('oliva') || name.includes('kaki') || name.includes('esmeralda') || name.includes('emerald') || name.includes('pistacho') || name.includes('lima')) return '#16A34A';

        if (name.includes('amarillo') || name.includes('yellow') || name.includes('mostaza')) return '#FACC15';
        if (name.includes('naranja') || name.includes('orange') || name.includes('mandarina')) return '#F97316';

        if (name.includes('morado') || name.includes('lila') || name.includes('violeta') || name.includes('lavanda') || name.includes('purpura') || name.includes('purple')) return '#7C3AED';

        return null;
    };

    // Devuelve estilos visuales para mostrar el color de forma fiel en el swatch.
    const getColorStyle = (colorName) => {
        const normalized = normalizeColorName(colorName);

        if (!normalized) return { backgroundColor: '#9CA3AF' };

        if (normalized.includes('animal print')) {
            return {
                backgroundColor: '#C7A06B',
                backgroundImage:
                    'radial-gradient(circle at 25% 25%, #3A2515 14%, transparent 15%), radial-gradient(circle at 70% 55%, #4A2E1B 15%, transparent 16%), radial-gradient(circle at 45% 78%, #2E1C12 11%, transparent 12%)',
                backgroundSize: '16px 16px',
            };
        }

        if (normalized.includes('multicolor') || normalized.includes('iridiscente') || normalized.includes('holografico') || normalized.includes('tie dye') || normalized.includes('degradado') || normalized.includes('ombre')) {
            return {
                backgroundImage: 'linear-gradient(135deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7)',
            };
        }

        if (normalized.includes('transparente') || normalized.includes('traslucido')) {
            return {
                backgroundColor: '#FFFFFF',
                opacity: 0.45,
            };
        }

        const parts = normalized
            .split(/\s+con\s+/i)
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length > 1) {
            const comboHexes = parts
                .map((part) => resolveColorHex(part))
                .filter(Boolean);

            if (comboHexes.length >= 2) {
                const uniqueHexes = Array.from(new Set(comboHexes));
                return {
                    backgroundImage: `linear-gradient(135deg, ${uniqueHexes.join(', ')})`,
                };
            }
        }

        const singleHex = resolveColorHex(normalized);
        if (singleHex) return { backgroundColor: singleHex };

        return { backgroundColor: '#9CA3AF' };
    };

    const categoriasVisibles = Array.isArray(categorias)
        ? categorias.filter((cat) => productos.some((producto) => Number(producto.category_id) === Number(cat.id)))
        : [];

    // --- Renderizado ---

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8 relative">
            <PublicSucursalSelector
                activeSucursal={activeSucursal}
                activeSucursalId={activeSucursalId}
                currentPublicView={currentPublicView}
                error={sucursalesError}
                loading={sucursalesLoading}
                setActiveSucursalId={setActiveSucursalId}
                sucursales={sucursales}
            />
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-900 text-center flex items-center gap-2">
                    {storeSettings?.store_logo_url ? (
                                <Image src={storeSettings.store_logo_url} alt="logo tienda" width={36} height={36} className="h-9 w-9 inline-block align-middle mr-2 rounded-full object-cover" />
                            ) : (
                                <Image src="/free-shopping-icons-vector.jpg" alt="icono pedido" width={36} height={36} className="inline-block align-middle mr-2 rounded" />
                            )}
                    {storeSettings?.store_name
                        ? `${currentPublicView === 'insumos' ? 'Pedido de insumos en' : 'Pedido en'} ${storeSettings.store_name}`
                        : currentPublicView === 'insumos' ? 'Realiza tu pedido de insumos' : 'Realiza tu pedido'}
                </h1>
            </div>


            {/* FILTRO POR CATEGORÍA - DESPLEGABLE COMPACTO PARA MÓVIL */}
            <div className="mb-5 rounded-xl bg-white p-3 shadow-lg">
                <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder={currentPublicView === 'insumos' ? 'Buscar insumo, color o categoria' : 'Buscar producto, color o categoria'}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-200"
                />
            </div>

            {categoriasVisibles.length > 0 && (
                <>
                <div className="mb-6">
                    <div className="flex gap-2 overflow-x-auto px-2 pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
                        <button
                            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-all duration-200 ${!categoriaSeleccionada ? 'bg-violet-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                            onClick={() => setCategoriaSeleccionada('')}
                        >
                            Todas las Categorias
                        </button>
                        {categoriasVisibles.map(cat => (
                            <button
                                key={cat.id}
                                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-all duration-200 ${Number(categoriaSeleccionada) === Number(cat.id) ? 'bg-violet-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                                onClick={() => setCategoriaSeleccionada(cat.id.toString())}
                            >
                                {cat.categori || cat.nombre || '-'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="hidden">
                    {/* Versión móvil - Selector desplegable compacto */}
                    <div className="block sm:hidden">
                        <div className="bg-white rounded-xl shadow-lg p-3 mx-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                📂 Filtrar por categoría:
                            </label>
                            <select
                                value={categoriaSeleccionada}
                                onChange={e => setCategoriaSeleccionada(e.target.value)}
                            >
                                <option value="">Todas</option>
                                {categorias.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
                </>
            )}

            {/* SECCIÓN DE PACKS ESPECIALES */}
            {!loadingPacks && visiblePacks.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-purple-800 mb-4 text-center">
                        📦 Packs Especiales - ¡Combos con Descuento!
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        {visiblePacks.map((pack) => {
                            const { precioIndividual, descuentoAbsoluto, descuentoPorcentaje } = calcularDescuentoPack(pack);

                            return (
                                <div key={pack.id} className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg p-4 shadow-md hover:shadow-lg transition-all duration-200">
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-lg font-bold text-purple-800">
                                            📦 {pack.nombre}
                                        </h3>
                                        <span className="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                                            -{descuentoPorcentaje.toFixed(0)}% OFF
                                        </span>
                                    </div>

                                    {/* Productos incluidos (compacto) */}
                                    <div className="mb-3">
                                        <span className="font-semibold text-purple-700 text-xs">Incluye:</span>
                                        <ul className="ml-2 mt-1 space-y-0.5">
                                            {pack.pack_productos.map((item, index) => {
                                                const prod = item.productos;
                                                const imgUrl = prod?.imagen_base || (Array.isArray(imagenesProductos[prod?.user_id]) && imagenesProductos[prod.user_id][0]) || 'https://placehold.co/40x40/cccccc/333333?text=Sin+Imagen';
                                                return (
                                                    <li key={index} className="flex items-center gap-2 bg-purple-50 rounded px-2 py-0.5">
                                                        <button
                                                            type="button"
                                                            className="w-8 h-8 rounded border border-gray-300 bg-white flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-purple-400 transition"
                                                            title={`Ver imagen de ${prod?.nombre}`}
                                                            onClick={() => setModalImg({ urls: [imgUrl], index: 0, nombre: prod?.nombre })}
                                                        >
                                                            <img
                                                                src={imgUrl}
                                                                alt={prod?.nombre}
                                                                width={32}
                                                                height={32}
                                                                className="object-cover w-8 h-8"
                                                                onError={e => { e.target.onerror = null; e.target.src = 'https://placehold.co/40x40/cccccc/333333?text=Sin+Imagen'; }}
                                                            />
                                                        </button>
                                                        <span className="font-semibold text-purple-900">{item.cantidad}x {prod?.nombre}</span>
                                                        <span className="text-xs text-gray-500">Bs {Number(prod?.precio).toFixed(2)}</span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>

                                    {/* Precios */}
                                    <div className="bg-white/70 rounded-md p-3 mb-3">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs text-gray-600">Individual:</span>
                                            <span className="text-xs text-gray-500 line-through">
                                                Bs {precioIndividual.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-purple-800">Pack:</span>
                                            <span className="text-lg font-bold text-green-600">
                                                Bs {pack.precio_pack}
                                            </span>
                                        </div>
                                        <div className="text-center text-xs font-bold text-green-700 mt-1">
                                            💰 Ahorras: Bs {descuentoAbsoluto.toFixed(2)}
                                        </div>
                                    </div>

                                    {/* Botón para agregar pack al carrito con selección de variantes */}
                                    <button
                                        onClick={() => {
                                            // Consultar variantes reales de cada producto del pack desde la lista global de productos
                                            const productosConVariantes = (pack.pack_productos || []).map((item, idx) => {
                                                // Buscar el producto real en la lista global para obtener variantes actualizadas
                                                const productoReal = productos.find(p => String(p.user_id) === String(item.productos.user_id));
                                                const variantes = Array.isArray(productoReal?.variantes) ? productoReal.variantes.filter(v => getEffectiveVariantStock(v) > 0) : [];
                                                return {
                                                    ...item,
                                                    productos: productoReal || item.productos,
                                                    variantes,
                                                    selectedVarianteIds: [], // Para packs múltiples, array de variantes por unidad
                                                    idx
                                                };
                                            });
                                            setAddToCartModal({
                                                producto: null,
                                                pack: pack,
                                                productosConVariantes,
                                                cantidad: 1
                                            });
                                        }}
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-3 rounded-md font-bold text-sm transition-colors duration-200"
                                    >
                                        🛒 Agregar Pack al Carrito
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Separador */}
                    <div className="flex items-center justify-center mb-4">
                        <div className="flex-grow border-t border-gray-300"></div>
                        <span className="px-3 text-gray-500 text-sm">O elige productos individuales</span>
                        <div className="flex-grow border-t border-gray-300"></div>
                    </div>
                </div>
            )}

            {/* LISTA DE PRODUCTOS - OPTIMIZADA PARA MÓVIL */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-6">
                {Array.isArray(productos) && productos.length > 0 ? (
                    (() => {
                        const productosFiltrados = productos.filter(producto => {
                            const term = busqueda.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                            const matchesBusqueda = !term || [
                                producto.nombre,
                                producto.descripcion,
                                producto.categoria,
                                producto.categorias?.categori,
                                producto.codigo_barra,
                                ...(Array.isArray(producto.variantes) ? producto.variantes.map((v) => v?.color) : []),
                            ].some((value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(term));
                            if (!matchesBusqueda) return false;
                            if (!categoriaSeleccionada) return true;
                            return Number(producto.category_id) === Number(categoriaSeleccionada);
                        });

                        // ...existing code...

                        return productosFiltrados.map((producto, idx) => {
                            const quantityInCart = cart
                                .filter(item => item.tipo !== 'pack' && String(item.user_id) === String(producto.user_id))
                                .reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
                            const isInCart = quantityInCart > 0;
                            const agotado = isProductoAgotado(producto);
                            const conversionInfo = !agotado ? getConversionPriceInfo(producto) : null;
                            const imagenes = (() => {
                                const imgs = Array.isArray(imagenesProductos[producto.user_id]) ? imagenesProductos[producto.user_id] : [];
                                // Si hay más de una imagen, la segunda es la principal (como miniatura portada)
                                if (imgs.length > 1) {
                                    return [imgs[1], imgs[0], ...imgs.slice(2)];
                                } else if (imgs.length === 1) {
                                    return [imgs[0]];
                                } else {
                                    return [];
                                }
                            })();
                            // Definir la variable categoria justo antes del return
                            const categoria = Array.isArray(categorias) ? categorias.find(c => c.id === producto.category_id) : null;
                            return (
                                <div
                                    key={producto.user_id ? producto.user_id : 'producto-' + idx}
                                    className={`relative overflow-hidden bg-white border rounded-lg p-1.5 sm:p-3 shadow-lg flex flex-col transition-shadow duration-300 hover:shadow-xl ${agotado ? 'border-gray-900' : 'border-gray-200'}`}
                                >
                                    <div className="relative">
                                        {Array.isArray(imagenes) && imagenes.length > 0 && typeof imagenes[0] === 'string' ? (
                                            <div className={`w-full ${agotado ? 'h-24 sm:h-32 mb-1' : 'h-28 sm:h-36 mb-1.5'} overflow-hidden rounded-lg relative group cursor-pointer`}>
                                                <Image
                                                    src={getOptimizedImageUrl(imagenes[0], 900, { quality: 96, format: 'origin' })}
                                                    alt={producto.nombre}
                                                    width={300}
                                                    height={200}
                                                    quality={96}
                                                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
                                                    className={`object-cover w-full h-full transition-transform duration-200 group-hover:scale-105 ${agotado ? 'grayscale' : ''}`}
                                                    onClick={() => setModalImg({ urls: imagenes, index: 0, nombre: producto.nombre })}
                                                    onError={e => { e.target.onerror = null; e.target.src = 'https://placehold.co/300x200/cccccc/333333?text=Sin+Imagen'; }}
                                                />
                                                {/* Miniaturas si hay más de una imagen */}
                                                {imagenes.length > 1 && (
                                                    <div className="absolute bottom-2 left-2 flex gap-1">
                                                        {imagenes.map((img, idx2) => (
                                                            <button
                                                                key={img + '-' + idx2}
                                                                className={`w-3 h-3 rounded-full border-2 ${idx2 === 0 ? 'bg-green-600 border-green-700' : 'bg-white border-gray-400'} focus:outline-none`}
                                                                title={`Ver imagen ${idx2 + 1}`}
                                                                onClick={e => { e.stopPropagation(); setModalImg({ urls: imagenes, index: idx2, nombre: producto.nombre }); }}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="w-full h-28 sm:h-36 mb-1.5 bg-gray-100 flex flex-col items-center justify-center rounded-lg relative">
                                                <span className="text-gray-400 text-center">Sin imagen</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`flex-1 flex flex-col ${agotado ? 'pb-9' : ''}`}>
                                        <div className={`text-xs sm:text-sm text-gray-600 font-medium ${agotado ? 'mb-0.5' : 'mb-1'}`}>{categoria ? (categoria.categori || categoria.nombre) : '-'}</div>
                                        <div className={`${agotado ? 'text-[13px] sm:text-base mb-0.5 leading-tight' : 'text-[13px] sm:text-base mb-1 leading-tight'} font-bold line-clamp-2 text-gray-900`}>{producto.nombre}</div>

                                        {/* Usar el componente de precio con promoción */}
                                        {!agotado && !conversionInfo && (
                                            <PrecioConPromocion
                                                producto={producto}
                                                promociones={promociones}
                                                className="mb-0.5"
                                            />
                                        )}
                                        {(() => {
                                            if (!conversionInfo) return null;
                                            return <UnitPricePanel conversionInfo={conversionInfo} factor={producto.factor_conversion} />;
                                        })()}
                                        {/* Mostrar colores disponibles como paleta de círculos */}
                                        {/* Mostrar colores disponibles como paleta de círculos */}
                                        {(() => {
                                                                                        const coloresEnStock = Array.isArray(producto.variantes)
                                                                                            ? producto.variantes.filter(v => {
                                                                                                    const colorNormalizado = String(v?.color || '')
                                                                                                        .normalize('NFD')
                                                                                                        .replace(/[\u0300-\u036f]/g, '')
                                                                                                        .toLowerCase()
                                                                                                        .trim();
                                                                                                    return getEffectiveVariantStock(v) > 0 && colorNormalizado && colorNormalizado !== 'unico';
                                                                                                })
                                                                                            : [];
                                            if (coloresEnStock.length <= 1) return null;
                                            return (
                                              <div className="mt-1.5">
                                                  <p className="text-[11px] text-gray-600 font-medium mb-1">Disponible en color:</p>
                                                  <div className="flex gap-1.5 flex-wrap">
                                                      {coloresEnStock.map((v, vIdx) => {
                                                              const colorStyle = getColorStyle(v.color);
                                                              return (
                                                                  <div
                                                                      key={`${producto.user_id}-${vIdx}`}
                                                                      className="relative group"
                                                                  >
                                                                      <div
                                                                          className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-gray-500 transition-all cursor-pointer shadow-sm hover:shadow-md hover:scale-110"
                                                                          style={colorStyle}
                                                                      />
                                                                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-blue-700 !text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md">
                                                                          {v.color}
                                                                      </div>
                                                                  </div>
                                                              );
                                                          })}
                                                  </div>
                                              </div>
                                            );
                                        })()}
                                                                                {agotado ? (
                                                                                        <span className="mt-1 inline-flex self-start bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded-md">
                                                                                                Agotado
                                                                                        </span>
                                                                                ) : (
                                                                                    <span className="mt-1 inline-flex self-start bg-green-100 text-green-700 text-[11px] font-bold px-2 py-0.5 rounded-md">
                                                                                        Disponible
                                                                                    </span>
                                                                                )}
                                    </div>
                                    <button
                                        disabled={agotado}
                                        className={`mt-2 sm:mt-3 w-full sm:w-auto sm:self-end ${agotado ? 'bg-gray-400 cursor-not-allowed' : isInCart ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'} text-white rounded-lg sm:rounded-full px-3 py-1.5 sm:w-8 sm:h-8 flex items-center justify-center text-sm sm:text-xl font-bold shadow-xl focus:outline-none transition-colors duration-150`}
                                        onClick={() => {
                                            if (agotado) return;
                                            openAddToCartModal(producto);
                                        }}
                                        title={agotado ? 'Producto agotado' : isInCart ? `Agregar más unidades (actual: ${quantityInCart})` : 'Agregar a la cesta'}
                                    >
                                        <span className="sm:hidden">
                                            {agotado ? 'Agotado' : isInCart ? `+ Agregar (${quantityInCart} en cesta)` : '🛒 Agregar al carrito'}
                                        </span>
                                        <span className="hidden sm:inline">{agotado ? '×' : '+'}</span>
                                    </button>
                                    {agotado && (
                                        <>
                                            <div className="pointer-events-none absolute inset-0 bg-gray-950/55" />
                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gray-950/90 px-3 py-2 text-center">
                                                <span className="text-sm font-black uppercase tracking-wide text-red-500 sm:text-base">Agotado</span>
                                                <span className="text-xs leading-tight text-gray-100 sm:text-sm">No disponible</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        });
                    })()
                ) : (
                    <div className="col-span-full text-center text-gray-400 py-8">
                        {productos.length === 0 ? 'No hay productos disponibles.' : null}
                    </div>
                )}
            </div>

            {/* MODAL DE IMAGEN COMPLETA CON CARRUSEL */}
            {modalImg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setModalImg(null)}>
                    <div className="relative max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
                        <button
                            className="absolute top-2 right-2 bg-white/80 hover:bg-white text-gray-700 rounded-full w-9 h-9 flex items-center justify-center text-2xl font-bold shadow-lg z-10"
                            onClick={() => setModalImg(null)}
                            title="Cerrar"
                        >
                            ×
                        </button>
                        {/* Flechas de navegación */}
                        {modalImg.urls.length > 1 && (
                            <>
                                <button
                                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-700 rounded-full w-10 h-10 flex items-center justify-center text-2xl font-bold shadow-lg z-10"
                                    onClick={() => setModalImg(m => ({ ...m, index: (m.index - 1 + m.urls.length) % m.urls.length }))}
                                    title="Anterior"
                                >
                                    &#8592;
                                </button>
                                <button
                                    className="absolute right-12 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-700 rounded-full w-10 h-10 flex items-center justify-center text-2xl font-bold shadow-lg z-10"
                                    onClick={() => setModalImg(m => ({ ...m, index: (m.index + 1) % m.urls.length }))}
                                    title="Siguiente"
                                >
                                    &#8594;
                                </button>
                            </>
                        )}
                        <Image
                            src={getOptimizedImageUrl(modalImg.urls[modalImg.index], 2200, { quality: 99, format: 'origin' })}
                            alt={modalImg.nombre}
                            width={800}
                            height={600}
                            quality={99}
                            sizes="(max-width: 768px) 100vw, 80vw"
                            className="w-full max-h-[80vh] object-contain rounded-xl bg-white"
                        />
                        <div className="text-center text-white font-bold mt-2 text-lg drop-shadow-lg">{modalImg.nombre}</div>
                        {/* Miniaturas */}
                        {modalImg.urls.length > 1 && (
                            <div className="flex justify-center gap-2 mt-2">
                                {modalImg.urls.map((img, idx) => (
                                    <Image
                                        key={img + '-' + idx}
                                        src={getOptimizedImageUrl(img, 180, { quality: 95, format: 'origin' })}
                                        alt={modalImg.nombre + ' miniatura ' + (idx + 1)}
                                        width={56}
                                        height={56}
                                        quality={95}
                                        sizes="56px"
                                        className={`w-14 h-14 object-cover rounded border-2 cursor-pointer ${idx === modalImg.index ? 'border-green-600' : 'border-gray-300'}`}
                                        onClick={() => setModalImg(m => ({ ...m, index: idx }))}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL PARA AGREGAR PRODUCTO (COLOR + CANTIDAD) */}
            {addToCartModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setAddToCartModal(null); setModalWarning(""); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                        {/* Modal unificado para producto individual y packs */}
                        {(() => {
                            // Si es producto individual
                            if (addToCartModal.producto) {
                                const selectedVariante = addToCartModal.variantes.find(
                                    v => String(v.variante_id ?? v.id) === String(addToCartModal.selectedVarianteId)
                                );
                                const maxCantidad = addToCartModal.variantes.length > 0
                                    ? getEffectiveVariantStock(selectedVariante)
                                    : Math.max(0, Number(addToCartModal.producto?.stock || 0));
                                const unidadesDisponibles = getAvailableUnits(addToCartModal.producto, maxCantidad);
                                return (
                                    <>
                                        {modalWarning && (
                                            <div className="mb-3 px-3 py-2 rounded bg-yellow-100 text-yellow-800 text-sm font-semibold border border-yellow-300 flex items-center gap-2">
                                                <span>⚠️</span> {modalWarning}
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-xl font-bold text-gray-900">Agregar a la cesta</h3>
                                            <button
                                                onClick={() => setAddToCartModal(null)}
                                                className="text-gray-500 hover:text-red-600 text-2xl leading-none"
                                                title="Cerrar"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500">Producto</p>
                                            <p className="font-semibold text-gray-900">{addToCartModal.producto.nombre}</p>
                                        </div>
                                        {(() => {
                                            if (maxCantidad <= 0) return null;
                                            const conversionInfo = getConversionPriceInfo(addToCartModal.producto, maxCantidad);
                                            if (!conversionInfo) return null;
                                            return <UnitPricePanel conversionInfo={conversionInfo} factor={addToCartModal.producto.factor_conversion} className="mb-4" />;
                                        })()}
                                        {maxCantidad <= 0 && (
                                            <span className="mb-4 inline-flex bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-md">
                                                Agotado
                                            </span>
                                        )}
                                        {addToCartModal.variantes.length > 0 && (
                                            <div className="mb-4">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                                                <select
                                                    value={addToCartModal.selectedVarianteId ?? ''}
                                                    onChange={(e) => setAddToCartModal(prev => {
                                                        const nextVariante = prev.variantes.find(v => String(v.variante_id ?? v.id) === String(e.target.value));
                                                        const nextStock = getEffectiveVariantStock(nextVariante);
                                                        const nextUnits = getAvailableUnits(prev.producto, nextStock);
                                                        return {
                                                            ...prev,
                                                            selectedVarianteId: e.target.value,
                                                            unidad: nextUnits.includes(prev.unidad) ? prev.unidad : nextUnits[0]
                                                        };
                                                    })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                >
                                                    {addToCartModal.variantes.map((v, idx) => {
                                                        const optionValue = v.variante_id ?? v.id;
                                                        const disponible = getEffectiveVariantStock(v) > 0;
                                                        return (
                                                            <option key={optionValue + '-' + idx} value={optionValue} disabled={!disponible}>
                                                                {v.color || 'Sin color'}{disponible ? '' : ' - Agotado'}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        )}
                                        {unidadesDisponibles.length > 1 && (
                                            <div className="mb-4">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
                                                <select
                                                    value={addToCartModal.unidad ?? unidadesDisponibles[0]}
                                                    onChange={(e) => setAddToCartModal(prev => ({
                                                        ...prev,
                                                        unidad: e.target.value,
                                                        cantidad: prev.cantidad === '' ? '' : normalizeQuantityForUnit(prev.cantidad, e.target.value)
                                                    }))}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                >
                                                    {unidadesDisponibles.map((unidadDisponible) => (
                                                        <option key={unidadDisponible} value={unidadDisponible}>
                                                            {unidadDisponible}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                                            {(() => {
                                                const selectedUnit = addToCartModal.unidad ?? unidadesDisponibles[0] ?? addToCartModal.producto.unidad_base ?? 'unidad';
                                                return (
                                            <input
                                                type="number"
                                                min={getQuantityMinForUnit(selectedUnit)}
                                                step={getQuantityStepForUnit(selectedUnit)}
                                                disabled={maxCantidad <= 0}
                                                value={addToCartModal.cantidad}
                                                onChange={(e) => setAddToCartModal(prev => ({
                                                    ...prev,
                                                    cantidad: e.target.value
                                                }))}
                                                inputMode={isDiscreteUnit(selectedUnit) ? "numeric" : "decimal"}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                                );
                                            })()}
                                            {unidadesDisponibles.length > 1 && (
                                                <p className="mt-2 text-xs text-gray-500">
                                                    1 {addToCartModal.producto.unidad_base || 'unidad'} = {Number(addToCartModal.producto.factor_conversion || 0) || 0} {(addToCartModal.producto.unidades_alternativas || [])[0] || 'unidad'}
                                                </p>
                                            )}
                                            {maxCantidad <= 0 && (
                                                <p className="mt-2 text-sm text-red-600 font-semibold">Agotado</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => setAddToCartModal(null)}
                                                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={confirmAddToCart}
                                                disabled={maxCantidad <= 0}
                                                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
                                            >
                                                Agregar
                                            </button>
                                        </div>
                                    </>
                                );
                            }
                            // Si es pack
                            if (addToCartModal.pack) {
                                const { productosConVariantes, cantidad } = addToCartModal;
                                const totalUnidades = Math.max(1, cantidad);
                                // Para cada producto con variantes, debe elegirse color para cada unidad
                                const isReady = productosConVariantes.every(p => {
                                    if (p.variantes.length > 1) {
                                        return p.selectedVarianteIds.length === totalUnidades && p.selectedVarianteIds.every(Boolean);
                                    }
                                    return true;
                                });
                                // Validar stock para cada selección
                                const stockOk = productosConVariantes.every(p => {
                                    if (p.variantes.length > 1) {
                                        // Contar cuántas veces se selecciona cada variante
                                        const counts = {};
                                        p.selectedVarianteIds.forEach(vid => {
                                            counts[vid] = (counts[vid] || 0) + 1;
                                        });
                                        return Object.entries(counts).every(([vid, count]) => {
                                            const variante = p.variantes.find(vv => String(vv.variante_id ?? vv.id) === String(vid));
                                            return variante && getEffectiveVariantStock(variante) >= count;
                                        });
                                    } else if (p.variantes.length === 1) {
                                        return getEffectiveVariantStock(p.variantes[0]) >= totalUnidades;
                                    } else {
                                        return Number(p.productos.stock || 0) >= totalUnidades;
                                    }
                                });
                                return (
                                    <>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-xl font-bold text-gray-900">Agregar pack a la cesta</h3>
                                            <button
                                                onClick={() => setAddToCartModal(null)}
                                                className="text-gray-500 hover:text-red-600 text-2xl leading-none"
                                                title="Cerrar"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500">Pack: <span className="font-semibold text-purple-800">{addToCartModal.pack.nombre}</span></p>
                                        </div>
                                        <div className="mb-4 space-y-3">
                                            {productosConVariantes.map((p, idx) => (
                                                <div key={p.productos.user_id + '-' + idx} className="border rounded-lg p-2 bg-purple-50">
                                                    <div className="font-semibold text-gray-800 text-sm mb-1">{p.productos.nombre} <span className="text-xs text-gray-500">x{p.cantidad}</span></div>
                                                    {p.variantes.length > 1 && (
                                                        <div className="space-y-1">
                                                            {[...Array(totalUnidades)].map((_, unidadIdx) => (
                                                                <select
                                                                    key={unidadIdx}
                                                                    value={p.selectedVarianteIds[unidadIdx] ?? ''}
                                                                    onChange={e => {
                                                                        setAddToCartModal(prev => ({
                                                                            ...prev,
                                                                            productosConVariantes: prev.productosConVariantes.map((pp, i) => i === idx ? {
                                                                                ...pp,
                                                                                selectedVarianteIds: (() => {
                                                                                    const arr = Array.from(pp.selectedVarianteIds || []);
                                                                                    arr[unidadIdx] = e.target.value;
                                                                                    return arr;
                                                                                })()
                                                                            } : pp)
                                                                        }));
                                                                    }}
                                                                    className="w-full border border-gray-300 rounded-lg px-2 py-1 mt-1"
                                                                >
                                                                    <option value="">Selecciona color para unidad #{unidadIdx + 1}</option>
                                                                    {p.variantes.map((v, vIdx) => {
                                                                        const optionValue = v.variante_id ?? v.id;
                                                                        const disponible = getEffectiveVariantStock(v) > 0;
                                                                        return (
                                                                            <option key={optionValue + '-' + vIdx} value={optionValue} disabled={!disponible}>
                                                                                {v.color || 'Sin color'}{disponible ? '' : ' - Agotado'}
                                                                            </option>
                                                                        );
                                                                    })}
                                                                </select>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {p.variantes.length === 1 && (
                                                        <div className="text-xs text-blue-700 mt-1">Color: {p.variantes[0].color}</div>
                                                    )}
                                                    {p.variantes.length === 0 && (
                                                        <div className="text-xs text-gray-500 mt-1">Sin variantes</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de packs</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={cantidad}
                                                onChange={e => {
                                                    const nuevaCantidad = Math.max(1, Number(e.target.value) || 1);
                                                    setAddToCartModal(prev => ({
                                                        ...prev,
                                                        cantidad: nuevaCantidad,
                                                        productosConVariantes: prev.productosConVariantes.map(pcv => ({
                                                            ...pcv,
                                                            selectedVarianteIds: (pcv.selectedVarianteIds || []).slice(0, nuevaCantidad)
                                                        }))
                                                    }));
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        {!stockOk && (
                                            <div className="mb-3 text-red-600 font-semibold text-sm">No hay suficiente stock para alguna variante seleccionada.</div>
                                        )}
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => setAddToCartModal(null)}
                                                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={() => {
                                                    // Validar selección y stock
                                                    if (!isReady) {
                                                        alert('Selecciona color para todos los productos y unidades que lo requieran.');
                                                        return;
                                                    }
                                                    if (!stockOk) {
                                                        alert('No hay suficiente stock para alguna variante seleccionada.');
                                                        return;
                                                    }
                                                    // Construir itemPack con variantes seleccionadas por unidad
                                                    const variantesSeleccionadas = productosConVariantes.map(p => {
                                                        if (p.variantes.length > 1) {
                                                            return p.selectedVarianteIds.map(vid => {
                                                                const variante = p.variantes.find(vv => String(vv.variante_id ?? vv.id) === String(vid));
                                                                return {
                                                                    producto_id: p.productos.user_id,
                                                                    variante_id: variante ? (variante.variante_id ?? variante.id) : null,
                                                                    color: variante ? variante.color : null
                                                                };
                                                            });
                                                        } else if (p.variantes.length === 1) {
                                                            return Array(totalUnidades).fill({
                                                                producto_id: p.productos.user_id,
                                                                variante_id: p.variantes[0].variante_id ?? p.variantes[0].id,
                                                                color: p.variantes[0].color
                                                            });
                                                        } else {
                                                            return Array(totalUnidades).fill({
                                                                producto_id: p.productos.user_id,
                                                                variante_id: null,
                                                                color: null
                                                            });
                                                        }
                                                    }).flat();
                                                    const itemPack = {
                                                        user_id: `pack-${addToCartModal.pack.id}`,
                                                        nombre: `📦 ${addToCartModal.pack.nombre}`,
                                                        precio: addToCartModal.pack.precio_pack,
                                                        stock: 999,
                                                        categoria: 'Pack Especial',
                                                        cantidad: totalUnidades,
                                                        tipo: 'pack',
                                                        pack_id: addToCartModal.pack.id,
                                                        pack_data: addToCartModal.pack,
                                                        descuento_pack: calcularDescuentoPack(addToCartModal.pack).descuentoAbsoluto,
                                                        variantesSeleccionadas
                                                    };
                                                    setCart(prev => {
                                                        const existe = prev.find(p => p.user_id === itemPack.user_id);
                                                        if (existe) {
                                                            return prev.map(p =>
                                                                p.user_id === itemPack.user_id
                                                                    ? { ...p, cantidad: p.cantidad + totalUnidades, variantesSeleccionadas: [...(p.variantesSeleccionadas || []), ...variantesSeleccionadas] }
                                                                    : p
                                                            );
                                                        } else {
                                                            return [...prev, itemPack];
                                                        }
                                                    });
                                                    setAddToCartModal(null);
                                                    alert(`¡Pack "${addToCartModal.pack.nombre}" agregado al carrito!`);
                                                }}
                                                disabled={!isReady || !stockOk}
                                                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
                                            >
                                                Agregar Pack
                                            </button>
                                        </div>
                                    </>
                                );
                            }
                            return null;
                        })()}
                    </div>
                </div>
            )}
            {/* ICONO DE CESTA GLOBAL */}
            <button
                className="fixed bottom-4 right-4 z-50 bg-white border border-gray-300 rounded-full shadow-xl p-3 flex items-center justify-center hover:bg-green-50 transition-colors focus:outline-none focus:ring-4 focus:ring-green-500/50"
                onClick={() => setShowCart(v => !v)}
                aria-label="Ver cesta"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-green-700">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.023.832l.71 4.256c.068.406.402.696.818.696h11.332a.973.973 0 00.916-.658l3.1-9.289a1.001 1.001 0 00-.916-1.348H3.64c-.536 0-1.033.433-1.033.97s.497.97 1.033.97zm2.4 12.75a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm12.75 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                </svg>

                {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse">
                        {cart.reduce((a, p) => a + p.cantidad, 0)}
                    </span>
                )}
            </button>

            {/* MODAL DE CESTA */}
            {showCart && (
                <div className="fixed bottom-20 right-4 z-50 w-full max-w-xs bg-white border border-gray-300 rounded-xl shadow-2xl p-4 transition-all duration-300 transform animate-fade-in-up">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b">
                        <h2 className="text-xl font-bold">🛒 Tu cesta</h2>
                        <button className="text-gray-500 hover:text-red-600 text-2xl font-bold ml-2 transition-colors" onClick={() => setShowCart(false)} title="Cerrar">&times;</button>
                    </div>

                    {cart.length === 0 ? (
                        <div className="text-gray-400 text-sm text-center py-4">La cesta está vacía.</div>
                    ) : (
                        <>
                            <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto mb-4">
                                {cart.length > 0 ? (
                                    cart.map(item => (
                                        <li key={item.cart_key || getCartKey(item)} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-gray-800">{item.nombre}</h4>
                                                <p className="text-sm text-gray-600">Bs {getItemPricing(item).precioFinal.toFixed(2)} c/u</p>
                                                {getItemDiscountTotal(item) > 0 && (
                                                    <p className="text-xs font-semibold text-green-700">
                                                        {getItemPricing(item).promocion?.descripcion || 'Descuento'}: -Bs {getItemDiscountTotal(item).toFixed(2)}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-7 h-7 flex items-center justify-center font-bold text-lg"
                                                    title="Disminuir"
                                                    onClick={() => updateCartQty(item.cart_key || getCartKey(item), Math.max(0.01, getItemDisplayQuantity(item) - 1))}
                                                    disabled={getItemDisplayQuantity(item) <= 1}
                                                >
                                                    −
                                                </button>
                                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-semibold min-w-[2.5rem] text-center">
                                                    {getItemQuantityText(item)}
                                                </span>
                                                <button
                                                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-7 h-7 flex items-center justify-center font-bold text-lg"
                                                    title="Aumentar"
                                                    onClick={() => updateCartQty(item.cart_key || getCartKey(item), getItemDisplayQuantity(item) + 1)}
                                                >
                                                    +
                                                </button>
                                                <span className="font-bold text-green-600 ml-2">
                                                    Bs {getItemSubtotal(item).toFixed(2)}
                                                </span>
                                                <button
                                                    className="ml-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-full w-7 h-7 flex items-center justify-center font-bold text-lg"
                                                    title="Eliminar"
                                                    onClick={() => removeFromCart(item.cart_key || getCartKey(item))}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </li>
                                    ))
        ) : null}
                            </ul>
                            <div className="flex justify-between items-center mb-3 pt-2 border-t-2 border-green-600 font-extrabold">
                                <span className="text-lg text-green-800">Total:</span>
                                <span className="text-2xl text-blue-800 bg-yellow-200 px-3 py-1 rounded-lg shadow">Bs {getCartTotal().toFixed(2)}</span>
                            </div>
                            {getCartDiscountTotal() > 0 && (
                                <div className="mb-3 text-right text-sm font-bold text-green-700">
                                    Descuento al por mayor/promos: -Bs {getCartDiscountTotal().toFixed(2)}
                                </div>
                            )}
                        </>
                    )}

                    <button
                        className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white py-2 rounded-xl font-bold shadow-xl transition-colors duration-150 flex items-center justify-center gap-2 text-base disabled:bg-gray-400"
                        onClick={openOrderConfirmation}
                        disabled={cart.length === 0}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Revisar y confirmar pedido
                    </button>
                </div>
            )}

            {/* MODAL DE CONFIRMACIÓN DE PEDIDO */}
            {showConfirmOrder && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        {/* Header del modal */}
                        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 rounded-t-2xl">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-bold flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Confirmar Pedido
                                </h2>
                                <button
                                    onClick={() => setShowConfirmOrder(false)}
                                    className="text-white hover:text-red-200 text-3xl font-bold transition-colors"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Contenido del modal */}
                        <div className="p-6">
                            {/* Datos del cliente */}
                            <div className="mb-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                    </svg>
                                    Datos del cliente
                                    {usuario && (
                                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold ml-2">
                                            Usuario logueado: {usuario.email}
                                        </span>
                                    )}
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Nombre completo (opcional)
                                            {usuario && usuario.nombre && (
                                                <span className="text-green-600 text-xs ml-2">
                                                    ✓ Auto-completado desde tu perfil
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={customerData.nombre}
                                            onChange={(e) => setCustomerData({...customerData, nombre: e.target.value})}
                                            placeholder="Ingresa tu nombre completo"
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                                usuario && usuario.nombre
                                                    ? 'border-green-300 bg-green-50'
                                                    : 'border-gray-300'
                                            }`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            NIT/CI {!usuario && '(opcional)'}
                                            {usuario && usuario.nit_ci && (
                                                <span className="text-green-600 text-xs ml-1">✓ Auto-completado</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={customerData.nit_ci}
                                            onChange={(e) => setCustomerData({...customerData, nit_ci: e.target.value})}
                                            placeholder="Ej: 4157852"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Resumen del pedido */}
                            <div className="mb-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                                    </svg>
                                    Resumen del pedido
                                </h3>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="space-y-3">
                                        {cart.map(item => (
                                            <div key={item.cart_key || getCartKey(item)} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-gray-800">{item.nombre}</h4>
                                                    <p className="text-sm text-gray-600">Bs {getItemPricing(item).precioFinal.toFixed(2)} c/u</p>
                                                    {getItemDiscountTotal(item) > 0 && (
                                                        <p className="text-xs font-semibold text-green-700">
                                                            {getItemPricing(item).promocion?.descripcion || 'Descuento'}: -Bs {getItemDiscountTotal(item).toFixed(2)}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-semibold">
                                                        {getItemQuantityText(item)}
                                                    </span>
                                                    <span className="font-bold text-green-600">
                                                        Bs {getItemSubtotal(item).toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 pt-4 border-t-2 border-green-500">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xl font-bold text-gray-800">Total:</span>
                                            <span className="text-2xl font-bold text-green-600 bg-green-100 px-4 py-2 rounded-lg">
                                                Bs {getCartTotal().toFixed(2)}
                                            </span>
                                        </div>
                                        {getCartDiscountTotal() > 0 && (
                                            <div className="mt-2 text-right text-sm font-bold text-green-700">
                                                Descuento al por mayor/promos: -Bs {getCartDiscountTotal().toFixed(2)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Mensaje informativo */}
                            <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
                                <div className="flex">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-400 mr-2 mt-0.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                    </svg>
                                    <div>
                                        <p className="text-sm text-blue-700">
                                            <strong>¿Todo correcto?</strong> Revisa tu pedido antes de enviarlo.
                                            Se abrirá WhatsApp para completar tu compra con nosotros.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Botones de acción */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowConfirmOrder(false);
                                        setShowCart(true);
                                    }}
                                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                    Editar cesta
                                </button>
                                <button
                                    onClick={confirmAndSendWhatsapp}
                                    disabled={false}
                                    className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                                    </svg>
                                    Enviar por WhatsApp
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
