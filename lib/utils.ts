
// --- TIPOS E INTERFACES ---

export interface Imagen {
  id?: string | number;
  imagen_url: string;
  [key: string]: unknown;
}

export interface Variante {
  id?: string | number;
  color: string;
  stock: number | string | null;
  [key: string]: unknown;
}

export interface ProductoInput {
  nombre: string;
  descripcion: string;
  variantes: Variante[];
  imagenes: Imagen[];
  [key: string]: unknown;
}

// --- SINCRONIZACIÓN GLOBAL DE STOCK DE PRODUCTO ---
export async function sincronizarStockProducto(
  producto_id: string | number,
  supabase: unknown
): Promise<number> {
  const { data } = await (supabase as any)
    .from("producto_variantes")
    .select("stock, stock_decimal")
    .eq("producto_id", producto_id)
    .eq("activo", true);

  const variantes: Variante[] = Array.isArray(data)
    ? data.map((v) => ({ ...v, color: (v as any).color ?? "", id: (v as any).id ?? undefined }))
    : [];

  if (variantes.length === 0) {
    const { data: producto } = await (supabase as any)
      .from("productos")
      .select("stock")
      .eq("user_id", producto_id)
      .maybeSingle();

    const stockActual = Number((producto as any)?.stock ?? 0);
    return Number.isFinite(stockActual) ? Math.max(0, stockActual) : 0;
  }

  const stockTotal = variantes.reduce<number>(
    (sum: number, v: Variante) => {
      const decimal = Number((v as any).stock_decimal);
      const legacy = Number(v.stock);
      return sum + Math.max(0, Number.isFinite(decimal) && decimal > 0 ? decimal : legacy || 0);
    },
    0
  );

  await (supabase as any)
    .from("productos")
    .update({ stock: stockTotal })
    .eq("user_id", producto_id);

  return stockTotal;
}

// --- VALIDACIÓN GLOBAL DE PRODUCTO Y VARIANTES ---
export function validarProducto({ nombre, descripcion, variantes, imagenes }: ProductoInput): string[] {
  const errores: string[] = [];
  if (!nombre || nombre.trim().length < 2) errores.push("El nombre es obligatorio.");
  if (!descripcion || descripcion.trim().length < 5) errores.push("La descripción es obligatoria.");
  if (!imagenes || imagenes.length === 0) errores.push("Debes subir al menos una imagen.");
  if (!variantes || variantes.length === 0) errores.push("Debes definir al menos una variante.");
  const colores = new Set<string>();
  for (const v of variantes) {
    if (!v.color || v.color.trim().length === 0) errores.push("Todas las variantes deben tener color.");
    if (colores.has(v.color.trim().toLowerCase())) errores.push("No puede haber variantes con el mismo color.");
    colores.add(v.color.trim().toLowerCase());
    if (v.stock === undefined || v.stock === null || isNaN(Number(v.stock)) || Number(v.stock) < 0) errores.push("Todas las variantes deben tener stock válido.");
  }
  return errores;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
