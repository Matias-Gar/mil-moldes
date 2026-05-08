"use client";

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STORE_SETTINGS, fetchStoreSettings } from '../lib/storeSettings';

const PUBLIC_SUCURSAL_KEY = 'mil-moldes.public_sucursal_id';
const ADMIN_SUCURSAL_KEY = 'mil-moldes.active_sucursal_id';

function getSavedSucursalId() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(PUBLIC_SUCURSAL_KEY) || window.localStorage.getItem(ADMIN_SUCURSAL_KEY) || '';
}

export default function StoreFooter() {
  const [storeSettings, setStoreSettings] = useState(DEFAULT_STORE_SETTINGS);
  const [sucursales, setSucursales] = useState([]);
  const [activeSucursalId, setActiveSucursalId] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      const settings = await fetchStoreSettings();
      if (mounted) setStoreSettings(settings);
    };

    const loadSucursales = async () => {
      try {
        const response = await fetch('/api/public/sucursales');
        const result = await response.json();
        const branches = response.ok && result.success && Array.isArray(result.sucursales) ? result.sucursales : [];
        if (!mounted) return;

        setSucursales(branches);
        const savedId = getSavedSucursalId();
        setActiveSucursalId(savedId || branches[0]?.id || '');
      } catch {
        if (mounted) setActiveSucursalId(getSavedSucursalId());
      }
    };

    loadSettings();
    loadSucursales();

    const handleStorage = (event) => {
      if (event.key === 'store_settings_local') {
        loadSettings();
      }
      if (event.key === PUBLIC_SUCURSAL_KEY || event.key === ADMIN_SUCURSAL_KEY) {
        setActiveSucursalId(getSavedSucursalId());
      }
    };

    const handleSucursalChanged = (event) => {
      setActiveSucursalId(event?.detail?.sucursalId || getSavedSucursalId());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('public-sucursal:changed', handleSucursalChanged);
    window.addEventListener('sucursal:changed', handleSucursalChanged);

    return () => {
      mounted = false;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('public-sucursal:changed', handleSucursalChanged);
      window.removeEventListener('sucursal:changed', handleSucursalChanged);
    };
  }, []);

  const whatsappLink = useMemo(() => {
    if (!storeSettings?.whatsapp_number) return '';
    return `https://wa.me/${storeSettings.whatsapp_number}`;
  }, [storeSettings?.whatsapp_number]);

  const activeSucursal = useMemo(
    () => sucursales.find((branch) => branch.id === activeSucursalId) || null,
    [activeSucursalId, sucursales]
  );

  const storeAddress = activeSucursal?.direccion || storeSettings?.store_address || '';

  return (
    <footer className="border-t border-slate-200 bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-center items-center">
        <div className="text-lg font-black tracking-wide">{storeSettings?.store_name || 'Mi Tienda Online'}</div>
        {storeSettings?.store_info ? (
          <p className="max-w-3xl text-sm leading-6 text-slate-300">{storeSettings.store_info}</p>
        ) : null}
        {storeAddress ? (
          <p className="text-sm font-medium text-slate-200">Ubicacion: {storeAddress}</p>
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
