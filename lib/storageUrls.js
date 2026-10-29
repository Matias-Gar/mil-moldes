// Public Storage addresses are resolved here; database values stay untouched.
export const LEGACY_STORAGE_HOST = "tsqpyzvdaxzjujysyawv.supabase.co";
export const DELL_API_URL = "https://milmoldes.duckdns.org";
const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";
const PUBLIC_RENDER_PATH = "/storage/v1/render/image/public/";

/** @param {string | undefined} [configured] */
export function getStorageBaseUrl(configured = process.env.NEXT_PUBLIC_STORAGE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const parsed = new URL(configured || DELL_API_URL);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Storage requiere una URL HTTP(S) sin credenciales.");
  }
  if (parsed.hostname === LEGACY_STORAGE_HOST) return DELL_API_URL;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

/**
 * Resolve only public Storage objects from this project's old origin, the
 * configured origin, or an explicit /storage/v1 path. Never rewrite unrelated
 * providers, signed URLs, local placeholders, data: or blob: URLs.
 * @param {string | null | undefined} value
 * @param {string | undefined} [configured]
 */
export function resolveStorageImageUrl(value, configured) {
  if (!value || typeof value !== "string") return "";
  const input = value.trim();
  if (!input) return "";
  const base = getStorageBaseUrl(configured);
  let source;
  try {
    source = new URL(input, input.startsWith("/storage/v1/") ? base : undefined);
  } catch {
    return input;
  }
  const target = new URL(base);
  const prefix = target.pathname.replace(/\/+$/, "");
  const isLegacy = source.hostname === LEGACY_STORAGE_HOST && source.protocol === "https:";
  const isRelative = input.startsWith("/storage/v1/");
  const isCurrent = source.origin === target.origin;
  if (!isLegacy && !isRelative && !isCurrent) return input;
  if (source.username || source.password) return input;
  const path = isCurrent && prefix && source.pathname.startsWith(`${prefix}/`)
    ? source.pathname.slice(prefix.length) : source.pathname;
  const marker = [PUBLIC_OBJECT_PATH, PUBLIC_RENDER_PATH].find(p => path.startsWith(p));
  if (!marker) return input;
  const objectPath = path.slice(marker.length);
  if (!objectPath || !objectPath.includes("/")) return input;
  const resolved = new URL(`${base}${PUBLIC_OBJECT_PATH}${objectPath}`);
  resolved.search = source.search;
  // The Dell serves originals. Do not request Cloud image transformations.
  for (const key of ["width", "height", "quality", "format", "resize"]) resolved.searchParams.delete(key);
  resolved.hash = source.hash;
  return resolved.toString();
}

/** @param {string} value */
export function isSelfHostedStorageImage(value) {
  try {
    const url = new URL(value);
    const base = getStorageBaseUrl();
    return url.origin === new URL(base).origin &&
      url.pathname.startsWith(`${new URL(base).pathname.replace(/\/+$/, "")}${PUBLIC_OBJECT_PATH}`);
  } catch {
    return false;
  }
}
