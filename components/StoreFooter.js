"use client";

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STORE_SETTINGS, fetchStoreSettings } from '../lib/storeSettings';

export default function StoreFooter() {
  const [storeSettings, setStoreSettings] = useState(DEFAULT_STORE_SETTINGS);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      const settings = await fetchStoreSettings();
      if (mounted) setStoreSettings(settings);
    };

    loadSettings();

    const handleStorage = (event) => {
      if (event.key === 'store_settings_local') {
        loadSettings();
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      mounted = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const whatsappLink = useMemo(() => {
    if (!storeSettings?.whatsapp_number) return '';
    return `https://wa.me/${storeSettings.whatsapp_number}`;
  }, [storeSettings?.whatsapp_number]);

  return (
    <footer className="border-t border-slate-200 bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-center items-center">
        <div className="text-lg font-black tracking-wide">{storeSettings?.store_name || 'Mi Tienda Online'}</div>
        {storeSettings?.store_info ? (
          <p className="max-w-3xl text-sm leading-6 text-slate-300">{storeSettings.store_info}</p>
        ) : null}
        {storeSettings?.store_address ? (
          <p className="text-sm font-medium text-slate-200">Ubicación: {storeSettings.store_address}</p>
        ) : null}
        {storeSettings?.whatsapp_number ? (
          <div>
            <a href={whatsappLink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200 hover:underline">
              WhatsApp: +{storeSettings.whatsapp_number}
            </a>
          </div>
        ) : null}
      </div>
    </footer>
  );
}