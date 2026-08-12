"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Compatibilidad con marcadores antiguos. La eliminación física fue retirada:
// cualquier producto con historia debe gestionarse mediante archivo lógico.
export default function EliminarProductosRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/productos/archivar"); }, [router]);
  return <div className="p-6 text-slate-700">Redirigiendo al archivo seguro de productos…</div>;
}
