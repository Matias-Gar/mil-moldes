"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/SupabaseClient';
import { optimizeImageForUpload } from '../../../lib/imageUploadOptimization';
import { DEFAULT_STORE_SETTINGS, fetchStoreSettings, saveStoreSettings } from '../../../lib/storeSettings';

const STORE_LOGO_BUCKET = 'product_images';

function getFileExtension(fileName) {
  const parts = String(fileName || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg';
}

export default function StoreSettingsPage() {
  const [form, setForm] = useState(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const settings = await fetchStoreSettings();
      setForm(settings);
      setLoading(false);
    })();
  }, []);

  const whatsappLink = useMemo(() => {
    if (!form.whatsapp_number) return '';
    return `https://wa.me/${form.whatsapp_number}`;
  }, [form.whatsapp_number]);

  const onChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setStatus('');
  };

  const uploadLogoFile = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setUploadingLogo(true);
    setStatus('');

    try {
      const { file: preparedFile } = await optimizeImageForUpload(selectedFile, {
        maxDimension: 1800,
        targetMaxBytes: 1.8 * 1024 * 1024,
        hardMaxBytes: 3 * 1024 * 1024,
        preferredQuality: 0.96,
        minQuality: 0.88,
      });

      const extension = getFileExtension(preparedFile.name);
      const filePath = `store/logo-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(STORE_LOGO_BUCKET)
        .upload(filePath, preparedFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORE_LOGO_BUCKET)
        .getPublicUrl(filePath);

      onChange('store_logo_url', publicUrlData.publicUrl);
      setStatus('Logo subido correctamente. Ahora guarda los cambios para aplicarlo en toda la web.');
    } catch (error) {
      setStatus(`No se pudo subir el logo. ${error?.message || 'Revisa el bucket y los permisos de Supabase Storage.'}`);
    } finally {
      setUploadingLogo(false);
      event.target.value = '';
    }
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    const { settings, persistedToSupabase } = await saveStoreSettings(form);
    setForm(settings);

    if (persistedToSupabase) {
      setStatus('Configuración guardada correctamente y aplicada en toda la web.');
    } else {
      setStatus('Configuración guardada localmente en este navegador. Si quieres compartirlo para todos, crea la tabla app_settings en Supabase.');
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow">Cargando configuración...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Configuración Global de la Tienda</h1>
          <p className="mt-2 text-gray-600">
            Cambia aquí el nombre, la información, el WhatsApp, la dirección y el logo para que se actualice en toda la página.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow">
          <form className="space-y-4" onSubmit={onSave}>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Nombre de la tienda</label>
              <input
                type="text"
                value={form.store_name}
                onChange={(e) => onChange('store_name', e.target.value)}
                placeholder="Ej: Óptica Central"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Información de la tienda</label>
              <textarea
                value={form.store_info || ''}
                onChange={(e) => onChange('store_info', e.target.value)}
                placeholder="Ej: Ropa, accesorios, ventas por mayor y menor"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <p className="mt-1 text-xs text-gray-500">Este texto aparecerá en el pie de página como información general del negocio.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Número de WhatsApp</label>
              <input
                type="text"
                value={form.whatsapp_number}
                onChange={(e) => onChange('whatsapp_number', e.target.value)}
                placeholder="Ej: 59177777777"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <p className="mt-1 text-xs text-gray-500">Solo se usarán números para el enlace de WhatsApp.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Dirección</label>
              <textarea
                value={form.store_address || ''}
                onChange={(e) => onChange('store_address', e.target.value)}
                placeholder="Ej: Av. Principal 123, Cochabamba"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <p className="mt-1 text-xs text-gray-500">Esta dirección se usará en comprobantes y en cualquier sección que muestre la ubicación del negocio.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Imagen/logo de la tienda (URL)</label>
              <input
                type="url"
                value={form.store_logo_url}
                onChange={(e) => onChange('store_logo_url', e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-900">
                  {uploadingLogo ? 'Subiendo logo...' : 'Subir imagen'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={uploadLogoFile}
                  />
                </label>
                {form.store_logo_url && (
                  <button
                    type="button"
                    onClick={() => onChange('store_logo_url', '')}
                    className="rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-200"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                La imagen se sube a Supabase Storage. Si falla, revisa que exista el bucket {STORE_LOGO_BUCKET} y que permita upload.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 font-bold text-white shadow hover:bg-green-700 disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>

          {status && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              {status}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Vista previa</h2>
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            {form.store_logo_url ? (
              <img
                src={form.store_logo_url}
                alt="Logo de tienda"
                className="h-14 w-14 rounded-full border border-gray-200 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-gray-600">Logo</div>
            )}
            <div>
              <div className="font-extrabold text-gray-900">{form.store_name || 'Mi Tienda Online'}</div>
              {form.store_info ? <div className="text-sm text-gray-600">{form.store_info}</div> : null}
              <div className="text-sm text-gray-600">WhatsApp: {form.whatsapp_number || 'No configurado'}</div>
              {form.store_address ? <div className="text-sm text-gray-600">Dirección: {form.store_address}</div> : null}
              {whatsappLink && (
                <a href={whatsappLink} target="_blank" rel="noreferrer" className="text-sm text-green-700 hover:underline">
                  Abrir chat de WhatsApp
                </a>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}