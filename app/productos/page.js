"use client";

// --- IMPORTS Y HOOKS NECESARIOS ---
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { usePromociones } from "@/lib/usePromociones";
import { usePacks } from "@/lib/packs";
import { supabase } from "@/lib/SupabaseClient";
import { DEFAULT_STORE_SETTINGS, fetchStoreSettings } from "@/lib/storeSettings";
import { PrecioConPromocion } from "@/lib/promociones";
import { getOptimizedImageUrl } from "@/lib/imageOptimization";


// --- INICIO DEL FLUJO AVANZADO DEL CATÁLOGO ---
export default function CatalogoPage() {
        const [modalWarning, setModalWarning] = useState("");
    const [modalImg, setModalImg] = useState(null);
    const [addToCartModal, setAddToCartModal] = useState(null);
    const [showCart, setShowCart] = useState(false);
    const [showConfirmOrder, setShowConfirmOrder] = useState(false);
    const [customerData, setCustomerData] = useState({ nombre: '', nit_ci: '' });
    // --- Declarar promociones usando el hook personalizado ---
    const { promociones } = usePromociones();
                                const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');
                                const [imagenesProductos, setImagenesProductos] = useState({});
                            const [productos, setProductos] = useState([]);
                        const { packs, loading: loadingPacks } = usePacks();
                    const [categorias, setCategorias] = useState([]);
                const [storeSettings, setStoreSettings] = useState(DEFAULT_STORE_SETTINGS);
            const [cart, setCart] = useState([]);
        const [usuario, setUsuario] = useState(null);
    // --- Refactor: función de fetch fuera del useEffect para poder reutilizarla ---
    const fetchProductosYCategoriasYImagenes = async () => {
        // Traer productos junto con sus variantes desde la tabla productos
        const { data: productosData, error: productosError } = await supabase
            .from('productos')
            .select('user_id, nombre, descripcion, precio, imagen_url, category_id, categoria, stock, codigo_barra, producto_variantes(id, color, stock, precio, imagen_url)');
        if (productosError || !productosData) {
            setProductos([]);
            setImagenesProductos({});
            return;
        }
        const normalizedProducts = productosData.map((p) => ({
            ...p,
            user_id: p.user_id,
            precio: Number(p.precio || 0),
            stock: Array.isArray(p.producto_variantes) && p.producto_variantes.length > 0
                ? p.producto_variantes.reduce((acc, v) => acc + Number(v.stock || 0), 0)
                : Number(p.stock || 0),
            variantes: Array.isArray(p.producto_variantes) ? p.producto_variantes : [],
            imagen_url: p.imagen_url || null
        }));
        setProductos(normalizedProducts);

        // Traer categorías
        const { data: categoriasData, error: categoriasError } = await supabase
            .from('categorias')
            .select('*');
        if (!categoriasError && categoriasData) {
            setCategorias(categoriasData);
        }

        // Traer imágenes asociadas
        const { data: imagenesData, error: imagenesError } = await supabase
            .from('producto_imagenes')
            .select('producto_id, imagen_url');
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
    }, []);

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
    }, []);

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


    // 1. Cargar productos y sus imágenes desde Supabase
    useEffect(() => {
        fetchProductosYCategoriasYImagenes();
    }, []);

    // 2. Cargar carrito desde localStorage al inicio
    useEffect(() => {
        const stored = localStorage.getItem('carrito_temporal');
        if (stored) setCart(JSON.parse(stored));
    }, []);

    // 3. Guardar carrito en localStorage cada vez que cambia
    useEffect(() => {
        localStorage.setItem('carrito_temporal', JSON.stringify(cart));
    }, [cart]);

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

    const getStockDisponibleProducto = (producto, varianteId = null) => {
        const variantes = getVariantes(producto);

        if (variantes.length > 0) {
            if (varianteId !== null && varianteId !== undefined) {
                // Usar función tradicional para evitar error de tipado implícito en JS
                const variante = variantes.find(function(v) { return String(v.variante_id ?? v.id) === String(varianteId); });
                return Math.max(0, Number(variante?.stock || 0));
            }
            const totalDisponible = variantes.reduce(function(acc, v) { return acc + Math.max(0, Number(v?.stock || 0)); }, 0);
            return Math.max(0, totalDisponible);
        }

        return Math.max(0, Number(producto?.stock || 0));
    };

    const isProductoAgotado = (producto) => getStockDisponibleProducto(producto) <= 0;

    const getStockDisponibleItem = (item) => {
        if (item?.tipo === 'pack') return 999;

        const producto = productos.find(function(p) { return String(p.user_id) === String(item.user_id); });
        if (!producto) return Math.max(0, Number(item.stock || 0));

        return getStockDisponibleProducto(producto, item.variante_id ?? null);
    };

    const openAddToCartModal = (producto) => {
        const variantes = getVariantes(producto);
        const defaultVariante = variantes.find(function(v) { return Number(v?.stock || 0) > 0; }) || null;
        const defaultVarianteId = defaultVariante ? (defaultVariante.variante_id ?? defaultVariante.id) : null;

        setAddToCartModal({
            producto,
            variantes,
            selectedVarianteId: defaultVarianteId,
            cantidad: 1
        });
    };

    const confirmAddToCart = async () => {
        if (!addToCartModal?.producto) return;
        setModalWarning("");
        const { producto, variantes, selectedVarianteId, cantidad } = addToCartModal;
        const quantity = Math.max(1, Number(cantidad) || 1);
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
            const { data: prod } = await supabase
                .from('productos')
                .select('user_id, nombre, precio, imagen_url, stock')
                .eq('user_id', producto.user_id)
                .maybeSingle();
            productoDB = prod;
            if (variantes.length > 0) {
                if (!selectedVarianteId) {
                    setModalWarning('Debes seleccionar un color para continuar.');
                    return;
                }
                const { data: varData } = await supabase
                    .from('producto_variantes')
                    .select('id, color, stock, precio, imagen_url')
                    .eq('id', selectedVarianteId)
                    .maybeSingle();
                varianteDB = varData;
            }
        } catch (e) {
            setModalWarning('Error consultando stock en base de datos. Intenta de nuevo.');
            return;
        }

        if (variantes.length > 0) {
            if (!selectedVarianteId) {
                setModalWarning('Debes seleccionar un color para continuar.');
                return;
            }
            const selected = variantes.find(function(v) { return String(v.variante_id ?? v.id) === String(selectedVarianteId); });
            if (!selected || !varianteDB) {
                setModalWarning('Selecciona un color válido para continuar.');
                return;
            }
            if (Number(varianteDB.stock || 0) <= 0) {
                setModalWarning('Esa opción está agotada. Elige otra disponible.');
                return;
            }
            varianteSeleccionada = {
                variante_id: varianteDB.id,
                color: varianteDB.color || null,
                precio: Number(varianteDB.precio ?? productoDB.precio ?? 0)
            };
            stockDisponible = Math.max(0, Number(varianteDB.stock || 0));
        } else if (!productoDB || stockDisponible <= 0) {
            setModalWarning('Producto agotado por el momento.');
            return;
        } else {
            stockDisponible = Math.max(0, Number(productoDB.stock || 0));
        }

        const productoConVariante = {
            ...producto,
            nombre: productoDB?.nombre || producto.nombre,
            imagen_url: varianteDB?.imagen_url || productoDB?.imagen_url || producto.imagen_url,
            variante_id: varianteSeleccionada.variante_id,
            color: varianteSeleccionada.color,
            precio: varianteSeleccionada.precio
        };

        const precioFinal = getPrecioFinal(productoConVariante);
        const cartKey = getCartKey(productoConVariante);

        // Validar stock antes de modificar el carrito
        const idx = cart.findIndex(p => (p.cart_key || getCartKey(p)) === cartKey);
        const cantidadActual = idx !== -1 ? Number(cart[idx].cantidad || 0) : 0;
        const disponibleParaAgregar = Math.max(0, stockDisponible - cantidadActual);

        if (disponibleParaAgregar <= 0) {
            setModalWarning(`Lo sentimos, el stock actual que puede pedir es ${stockDisponible}.`);
            return;
        }

        if (quantity > disponibleParaAgregar) {
            const mensaje = cantidadActual > 0
                ? `Lo sentimos, el stock actual que puede pedir es ${stockDisponible}. Ya tienes ${cantidadActual} en tu cesta, puedes agregar hasta ${disponibleParaAgregar} más.`
                : `Lo sentimos, el stock actual que puede pedir es ${stockDisponible}.`;
            setModalWarning(mensaje);
            return;
        }

        // Si pasa la validación, agregar al carrito
        setCart(prev => {
            const idxPrev = prev.findIndex(p => (p.cart_key || getCartKey(p)) === cartKey);
            if (idxPrev !== -1) {
                const updated = [...prev];
                updated[idxPrev] = { ...updated[idxPrev], cantidad: updated[idxPrev].cantidad + quantity };
                return updated;
            }
            return [...prev, { ...productoConVariante, cart_key: cartKey, cantidad: quantity, precio: precioFinal }];
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

                const requested = Math.max(1, Number(newQty) || 1);
                if (requested > maxStock) {
                    alert(`Lo sentimos, el stock actual que puede pedir es ${maxStock}.`);
                }
                const quantity = Math.max(1, Math.min(requested, maxStock));
                return [{ ...item, cantidad: quantity }];
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
        
        // Insertar y obtener el número de pedido (id)
        const { data, error } = await supabase.from("carritos_pendientes").insert([
            {
                cliente_nombre: nombreFinal || null,
                cliente_telefono: nitciLlenado || null, // Usar NIT/CI en lugar de teléfono
                usuario_id: usuario ? usuario.id : null,
                usuario_email: emailFinal || null,
                productos: cart.map(p => {
                    if (p.tipo === 'pack') {
                        return {
                            tipo: 'pack',
                            pack_id: p.pack_id,
                            nombre: p.nombre,
                            cantidad: p.cantidad,
                            precio_unitario: p.precio,
                            productos: p.pack_data?.pack_productos?.map(pp => ({
                                producto_id: pp.productos.user_id,
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
                        cantidad: p.cantidad,
                        precio_unitario: p.precio
                    };
                }),
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
            const subtotal = (item.precio * item.cantidad).toFixed(2); 
            return `*${item.cantidad}x* ${item.nombre} - (Bs ${subtotal})`;
        }).join('\n');
        
        const total = cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0).toFixed(2);
        const nombreTexto = nombreFinal ? `Nombre: ${nombreFinal}\n` : '';
        const nitciTexto = nitciLlenado ? `NIT/CI: ${nitciLlenado}\n` : '';
        const pedidoTexto = `N° Pedido: ${pedidoId}`;
        
        const message = encodeURIComponent(
            `¡Hola! Me gustaría hacer el siguiente pedido:\n\n${pedidoTexto}\n${nombreTexto}${nitciTexto}\n${itemsList}\n\n*Total:* Bs ${total}\n\n¡Gracias!`
        );
        
        const whatsappNumber = storeSettings?.whatsapp_number || CONFIG.WHATSAPP_BUSINESS;
        const whatsappURL = `https://wa.me/${whatsappNumber}?text=${message}`;
        window.open(whatsappURL, '_blank');
        
        // Limpiar carrito y cerrar modales
        setShowConfirmOrder(false);
        setCart([]);
        setCustomerData({ nombre: '', nit_ci: '' });
        localStorage.removeItem('carrito_temporal');
        
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

    // --- Renderizado ---

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8 relative">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-extrabold text-gray-900 text-center flex items-center gap-2">
                    {storeSettings?.store_logo_url ? (
                                <Image src={storeSettings.store_logo_url} alt="logo tienda" width={36} height={36} className="h-9 w-9 inline-block align-middle mr-2 rounded-full object-cover" />
                            ) : (
                                <Image src="/free-shopping-icons-vector.jpg" alt="icono pedido" width={36} height={36} className="inline-block align-middle mr-2 rounded" />
                            )}
                    {storeSettings?.store_name ? `Pedido en ${storeSettings.store_name}` : 'Realiza tu pedido'}
                </h1>
            </div>


            {/* FILTRO POR CATEGORÍA - DESPLEGABLE COMPACTO PARA MÓVIL */}
            {categorias.length > 0 && (
                <div className="mb-6">
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
            )}

            {/* SECCIÓN DE PACKS ESPECIALES */}
            {!loadingPacks && packs.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-purple-800 mb-4 text-center">
                        📦 Packs Especiales - ¡Combos con Descuento!
                    </h2>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        {packs.map((pack) => {
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
                                                const variantes = Array.isArray(productoReal?.variantes) ? productoReal.variantes.filter(v => Number(v?.stock || 0) > 0) : [];
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                {Array.isArray(productos) && productos.length > 0 ? (
                    (() => {
                        const productosFiltrados = productos.filter(producto => {
                            if (!categoriaSeleccionada) return true;
                            const match = Number(producto.category_id) === Number(categoriaSeleccionada);
                            return match;
                        });
                        
                        // ...existing code...
                        
                        return productosFiltrados.map((producto, idx) => {
                            const quantityInCart = cart
                                .filter(item => item.tipo !== 'pack' && String(item.user_id) === String(producto.user_id))
                                .reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
                            const isInCart = quantityInCart > 0;
                            const agotado = isProductoAgotado(producto);
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
                                    className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-lg flex flex-col transition-shadow duration-300 hover:shadow-xl"
                                >
                                    <div className="relative">
                                        {Array.isArray(imagenes) && imagenes.length > 0 && typeof imagenes[0] === 'string' ? (
                                            <div className="w-full h-32 sm:h-40 mb-2 overflow-hidden rounded-lg relative group cursor-pointer">
                                                <Image
                                                    src={getOptimizedImageUrl(imagenes[0], 900, { quality: 96, format: 'origin' })}
                                                    alt={producto.nombre}
                                                    width={300}
                                                    height={200}
                                                    quality={96}
                                                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                                                    className="object-cover w-full h-full transition-transform duration-200 group-hover:scale-105"
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
                                            <div className="w-full h-40 mb-2 bg-gray-100 flex flex-col items-center justify-center rounded-lg relative">
                                                <span className="text-gray-400 text-center">Sin imagen</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">{categoria ? (categoria.categori || categoria.nombre) : '-'}</div>
                                        <div className="text-sm sm:text-lg font-bold mb-2 line-clamp-2 text-gray-900">{producto.nombre}</div>
                                        
                                        {/* Usar el componente de precio con promoción */}
                                        <PrecioConPromocion 
                                            producto={producto} 
                                            promociones={promociones}
                                            className="mb-1"
                                        />
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
                                                                                                    return Number(v?.stock || 0) > 0 && colorNormalizado && colorNormalizado !== 'unico';
                                                                                                })
                                                                                            : [];
                                            if (coloresEnStock.length <= 1) return null;
                                            return (
                                              <div className="mt-2">
                                                  <p className="text-xs text-gray-600 font-medium mb-1.5">Disponible en color:</p>
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
                                        {agotado && (
                                            <span className="mt-2 inline-flex self-start bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-md">
                                                Agotado
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        disabled={agotado}
                                        className={`mt-3 sm:mt-4 w-full sm:w-auto sm:self-end ${agotado ? 'bg-gray-400 cursor-not-allowed' : isInCart ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'} text-white rounded-lg sm:rounded-full px-4 py-2 sm:w-9 sm:h-9 flex items-center justify-center text-sm sm:text-2xl font-bold shadow-xl focus:outline-none transition-colors duration-150`}
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
                                    ? Math.max(0, Number(selectedVariante?.stock || 0))
                                    : Math.max(0, Number(addToCartModal.producto?.stock || 0));
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
                                        {addToCartModal.variantes.length > 0 && (
                                            <div className="mb-4">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                                                <select
                                                    value={addToCartModal.selectedVarianteId ?? ''}
                                                    onChange={(e) => setAddToCartModal(prev => ({
                                                        ...prev,
                                                        selectedVarianteId: e.target.value
                                                    }))}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                >
                                                    {addToCartModal.variantes.map((v, idx) => {
                                                        const optionValue = v.variante_id ?? v.id;
                                                        const disponible = Number(v.stock || 0) > 0;
                                                        return (
                                                            <option key={optionValue + '-' + idx} value={optionValue} disabled={!disponible}>
                                                                {v.color || 'Sin color'}{disponible ? '' : ' - Agotado'}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        )}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                                            <input
                                                type="number"
                                                min={1}
                                                disabled={maxCantidad <= 0}
                                                value={addToCartModal.cantidad}
                                                onChange={(e) => setAddToCartModal(prev => ({
                                                    ...prev,
                                                    cantidad: Math.max(1, Number(e.target.value) || 1)
                                                }))}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
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
                                            return variante && Number(variante.stock || 0) >= count;
                                        });
                                    } else if (p.variantes.length === 1) {
                                        return Number(p.variantes[0].stock || 0) >= totalUnidades;
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
                                                                        const disponible = Number(v.stock || 0) > 0;
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
                                                <p className="text-sm text-gray-600">Bs {item.precio.toFixed(2)} c/u</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-7 h-7 flex items-center justify-center font-bold text-lg"
                                                    title="Disminuir"
                                                    onClick={() => updateCartQty(item.cart_key || getCartKey(item), Math.max(1, item.cantidad - 1))}
                                                    disabled={item.cantidad <= 1}
                                                >
                                                    −
                                                </button>
                                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-semibold min-w-[2.5rem] text-center">
                                                    x{item.cantidad}
                                                </span>
                                                <button
                                                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-7 h-7 flex items-center justify-center font-bold text-lg"
                                                    title="Aumentar"
                                                    onClick={() => updateCartQty(item.cart_key || getCartKey(item), item.cantidad + 1)}
                                                >
                                                    +
                                                </button>
                                                <span className="font-bold text-green-600 ml-2">
                                                    Bs {(item.precio * item.cantidad).toFixed(2)}
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
                                <span className="text-2xl text-blue-800 bg-yellow-200 px-3 py-1 rounded-lg shadow">Bs {cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0).toFixed(2)}</span>
                            </div>
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
                                            <div key={item.user_id} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-gray-800">{item.nombre}</h4>
                                                    <p className="text-sm text-gray-600">Bs {item.precio.toFixed(2)} c/u</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-semibold">
                                                        x{item.cantidad}
                                                    </span>
                                                    <span className="font-bold text-green-600">
                                                        Bs {(item.precio * item.cantidad).toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 pt-4 border-t-2 border-green-500">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xl font-bold text-gray-800">Total:</span>
                                            <span className="text-2xl font-bold text-green-600 bg-green-100 px-4 py-2 rounded-lg">
                                                Bs {cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0).toFixed(2)}
                                            </span>
                                        </div>
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