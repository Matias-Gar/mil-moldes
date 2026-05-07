// Utilidades para manejar promociones
export const calcularPrecioConPromocion = (producto, promociones) => {
  const productId = String(producto.user_id ?? producto.id ?? '');
  const promocionesProducto = (promociones || []).filter(promo =>
    String(promo.producto_id ?? '') === productId &&
    promo.activa === true &&
    (!promo.fecha_fin || new Date(promo.fecha_fin) >= new Date())
  );

  if (promocionesProducto.length > 1) {
    console.warn('Multiples promociones activas para producto', productId, promocionesProducto);
  }

  const promocionActiva = promocionesProducto
    .sort((a, b) => new Date(b.fecha_inicio || 0).getTime() - new Date(a.fecha_inicio || 0).getTime())[0];

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

  switch (promocionActiva.tipo) {
    case 'descuento':
      precioFinal = precioBase * (1 - promocionActiva.valor / 100);
      break;
    case 'precio_fijo':
      precioFinal = promocionActiva.valor;
      break;
    case 'descuento_absoluto':
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

const formatPromotionEndDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const PromoCompactBanner = ({ porcentaje, descripcion = '', fechaFin = '' }) => {
  const endDate = formatPromotionEndDate(fechaFin);
  const title = String(descripcion || 'Promocion especial').trim();
  const titleSize = title.length > 18 ? 'text-[10px]' : 'text-[11px]';

  return (
    <div className="mt-2 flex w-full justify-center">
      <div className="relative flex min-h-[56px] w-full max-w-[270px] items-center justify-center overflow-visible px-1">
        <div className="absolute inset-x-7 bottom-1 top-2 rotate-[-4deg] border-2 border-black/80" />
        <div className="absolute left-3 top-1 h-0 w-0 border-b-[44px] border-r-[34px] border-b-rose-700 border-r-transparent" />
        <div
          className="relative flex min-h-[46px] w-[94%] items-center gap-1.5 bg-rose-600 px-2.5 py-2 text-white shadow-sm"
          style={{ clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)' }}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-rose-50 text-rose-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M12 13V9M12 13l3 2M9 3h6M12 3v3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </div>
          <div className="min-w-0 flex-1 text-center leading-tight">
            <div className={`${titleSize} whitespace-nowrap font-black uppercase tracking-normal`}>
              {title}
            </div>
            {endDate ? (
              <div className="mt-0.5 whitespace-nowrap text-[10px] font-black uppercase tracking-normal">
                Termina: {endDate}
              </div>
            ) : (
              <div className="mt-0.5 whitespace-nowrap text-[10px] font-bold uppercase tracking-normal">
                -{porcentaje}% de descuento
              </div>
            )}
          </div>
        </div>
        <div className="absolute right-2 top-0 flex flex-col gap-0.5">
          <span className="block h-4 w-2 rotate-12 bg-rose-600" />
          <span className="block h-3 w-2 rotate-45 bg-rose-600" />
        </div>
        {endDate && (
          <span className="sr-only">Descuento {porcentaje}%</span>
        )}
      </div>
    </div>
  );
};

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
          <span className="text-xs text-gray-800 line-through decoration-gray-800">
            Bs {precio.precioOriginal.toFixed(2)}
          </span>
          <span className="font-bold text-green-600 text-base">
            Bs {precio.precioFinal.toFixed(2)}
          </span>
        </div>
        {showBadge && (
          <PromoCompactBanner
            porcentaje={precio.porcentajeDescuento}
            descripcion={precio.promocion?.descripcion}
            fechaFin={precio.promocion?.fecha_fin}
          />
        )}
        {showPacks && <PacksDisponibles productoId={producto.user_id} />}
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="flex flex-col items-start">
        <span className="text-sm text-gray-800 line-through decoration-gray-800">
          Bs {precio.precioOriginal.toFixed(2)}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-green-600 text-lg">
            Bs {precio.precioFinal.toFixed(2)}
          </span>
        </div>
        {showBadge && (
          <PromoCompactBanner
            porcentaje={precio.porcentajeDescuento}
            descripcion={precio.promocion?.descripcion}
            fechaFin={precio.promocion?.fecha_fin}
          />
        )}
      </div>
      {showPacks && <PacksDisponibles productoId={producto.user_id} />}
    </div>
  );
};

const PacksDisponibles = ({ productoId: _ }) => {
  return null;
};
