import { supabase } from './SupabaseClient';
import { CONFIG } from './config';

const SETTINGS_KEY = 'global_store_settings';
const LOCAL_STORAGE_KEY = 'store_settings_local';

export const DEFAULT_STORE_SETTINGS = {
  store_name: CONFIG.BUSINESS_NAME || 'Mi Tienda Online',
  whatsapp_number: CONFIG.WHATSAPP_BUSINESS || '',
  store_info: '',
  store_address: CONFIG.BUSINESS_ADDRESS || CONFIG.DIRECCION_COMERCIAL || '',
  store_logo_url: '',
};

function cleanWhatsappNumber(input) {
  return String(input || '').replace(/[^\d]/g, '');
}

function mergeWithDefaults(value) {
  const merged = {
    ...DEFAULT_STORE_SETTINGS,
    ...(value || {}),
  };

  merged.whatsapp_number = cleanWhatsappNumber(merged.whatsapp_number);
  merged.store_name = String(merged.store_name || DEFAULT_STORE_SETTINGS.store_name).trim();
  merged.store_info = String(merged.store_info || '').trim();
  merged.store_address = String(merged.store_address || DEFAULT_STORE_SETTINGS.store_address).trim();
  merged.store_logo_url = String(merged.store_logo_url || '').trim();

  return merged;
}

function getLocalSettings() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return null;
  }
}

function setLocalSettings(settings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergeWithDefaults(settings)));
  } catch {
    // noop
  }
}

export async function fetchStoreSettings() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('settings')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (!error && data?.settings) {
      const settings = mergeWithDefaults(data.settings);
      setLocalSettings(settings);
      return settings;
    }
  } catch {
    // noop
  }

  const local = getLocalSettings();
  return local || mergeWithDefaults(null);
}

export async function saveStoreSettings(input) {
  const settings = mergeWithDefaults(input);
  let persistedToSupabase = false;

  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    persistedToSupabase = !error;
  } catch {
    persistedToSupabase = false;
  }

  setLocalSettings(settings);

  return {
    settings,
    persistedToSupabase,
  };
}
