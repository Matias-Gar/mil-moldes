// 📊 Componente para Facebook Pixel - JavaScript version
"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function FacebookPixel() {
  const pathname = usePathname();

  useEffect(() => {
    // Solo cargar si tenemos el píxel configurado
    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
    if (!pixelId || typeof pixelId !== 'string' || pixelId.trim() === '') return;

    // Función fbq global
    if (typeof window !== 'undefined') {
      if (!window.fbq) {
        window.fbq = function() {
          (window.fbq.q = window.fbq.q || []).push(arguments);
        };
      }

      // Script del píxel
      if (!document.getElementById('facebook-pixel')) {
        const script = document.createElement('script');
        script.id = 'facebook-pixel';
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        script.onerror = () => {
          console.error('No se pudo cargar Facebook Pixel.');
        };
        document.head.appendChild(script);

        // Inicializar píxel solo si pixelId es válido y fbq está definido
        script.onload = () => {
          if (pixelId && typeof window.fbq === 'function') {
            try {
              window.fbq('init', pixelId);
              window.fbq('track', 'PageView');
            } catch (e) {
              console.error('Error inicializando Facebook Pixel:', e);
            }
          }
        };
      }
    }
  }, []);

  // Track de cambios de página
  useEffect(() => {
    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
    if (
      typeof window !== 'undefined' &&
      typeof window.fbq === 'function' &&
      pixelId &&
      pixelId.trim() !== ''
    ) {
      window.fbq('track', 'PageView');
    }
  }, [pathname]);

  // No renderizar nada visible
  return (
    <>
      {/* Facebook Pixel - No Script */}
      <noscript>
        {process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID ? (
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        ) : null}
      </noscript>
    </>
  );
}

// Hook para usar tracking en componentes
export const useFacebookPixel = () => {
  const trackPurchase = (value, currency = 'BOB') => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'Purchase', { value, currency });
    }
  };

  const trackAddToCart = (productId, value) => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'AddToCart', { 
        content_ids: [productId], 
        value, 
        currency: 'BOB' 
      });
    }
  };

  const trackViewContent = (productId, productName) => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'ViewContent', {
        content_ids: [productId],
        content_name: productName,
        content_type: 'product'
      });
    }
  };

  return {
    trackPurchase,
    trackAddToCart,
    trackViewContent
  };
};