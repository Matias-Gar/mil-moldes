// Utilidades para manejar promociones
export const calcularPrecioConPromocion = (producto, promociones) => {
  // Buscar promoción activa para este producto
  const productId = String(producto.user_id ?? producto.id ?? '');
  const promocionesProducto = (promociones || []).filter(promo =>
    String(promo.producto_id ?? '') === productId &&
    promo.activa === true &&
    (!promo.fecha_fin || new Date(promo.fecha_fin) >= new Date())
  );

  if (promocionesProducto.length > 1) {
    console.warn('Múltiples promociones activas para producto', productId, promocionesProducto);
  }

  const promocionActiva = promocionesProducto
    .sort((a,b) => new Date(b.fecha_inicio || 0).getTime() - new Date(a.fecha_inicio || 0).getTime())[0];

  const precioBase = Number(producto.precio_original ?? producto.precio ?? 0);

  if (!promocionActiva) {
    return {
      precioOriginal: precioBase,
      precioFinal: precioBase,
      tienePromocion: false,
      promocion: null,
      descuento: 0,
      porcentajeDescuento: '0'
    };
  }

  let precioFinal = precioBase;

  // Calcular precio según tipo de promoción
  switch (promocionActiva.tipo) {
    case 'descuento':
      // Descuento en porcentaje
      precioFinal = precioBase * (1 - promocionActiva.valor / 100);
      break;
    case 'precio_fijo':
      // Precio fijo
      precioFinal = promocionActiva.valor;
      break;
    case 'descuento_absoluto':
      // Descuento en cantidad fija
      precioFinal = Math.max(0, precioBase - promocionActiva.valor);
      break;
    default:
      precioFinal = precioBase;
  }

  const descuento = Math.max(0, precioBase - precioFinal);
  const porcentajeDescuento = precioBase > 0 ? ((descuento / precioBase) * 100).toFixed(0) : '0';

  return {
    precioOriginal: precioBase,
    precioFinal: Math.max(0, precioFinal),
    tienePromocion: true,
    promocion: promocionActiva,
    descuento,
    porcentajeDescuento
  };
};

// Componente mejorado para mostrar precio con promoción
export const PrecioConPromocion = ({ producto, promociones, className = "", compact = false, showBadge = true, showPacks = false }) => {
  const precio = calcularPrecioConPromocion(producto, promociones);

  if (!precio.tienePromocion) {
    return (
      <div className={className}>
        <span className="font-bold text-blue-700">
          Bs {precio.precioFinal.toFixed(2)}
        </span>
        {showPacks && <PacksDisponibles productoId={producto.user_id} />}
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center flex-wrap gap-1">
          <span className="text-red-500 line-through text-sm">
            Bs {precio.precioOriginal.toFixed(2)}
          </span>
          <span className="font-bold text-green-600">
            Bs {precio.precioFinal.toFixed(2)}
          </span>
          {showBadge && (
            <span className="bg-red-500 text-white px-1 py-0.5 rounded text-xs font-bold">
              -{precio.porcentajeDescuento}%
            </span>
          )}
        </div>
        {precio.promocion?.descripcion && (
          <div className="text-xs text-green-600 font-medium mt-1">
            {precio.promocion.descripcion}
          </div>
        )}
        {showPacks && <PacksDisponibles productoId={producto.user_id} />}
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="flex flex-col items-start">
        <span className="text-red-500 line-through text-sm">
          Bs {precio.precioOriginal.toFixed(2)}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-green-600 text-lg">
            Bs {precio.precioFinal.toFixed(2)}
          </span>
          {showBadge && (
            <span className="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
              -{precio.porcentajeDescuento}%
            </span>
          )}
        </div>
        {precio.promocion?.descripcion && (
          <div className="text-xs text-green-600 font-medium mt-1">
            🎯 {precio.promocion.descripcion}
          </div>
        )}
      </div>
      {showPacks && <PacksDisponibles productoId={producto.user_id} />}
    </div>
  );
};

// Componente de Packs Disponibles (importado desde packs.js cuando esté disponible)
const PacksDisponibles = ({ productoId: _ }) => {
  // Este componente será reemplazado por el import real cuando se integre
  return null;
};