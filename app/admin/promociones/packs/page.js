import PacksClient from "@/components/promociones/PacksClient";
import { supabase } from "@/lib/SupabaseClient";

export default async function Page() {
  // fetch en server (no usar hooks ni window aquí)
  const { data: packs = [], error } = await supabase
    .from("packs")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("Error al cargar packs:", error);
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-white">Promociones — Packs</h1>
        <div className="text-red-500">
          Ocurrió un error al cargar los packs. Por favor, intenta nuevamente más tarde.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4 text-white">Promociones — Packs</h1>
      {/* pasar datos iniciales al Client Component */}
      <PacksClient initialPacks={packs} />
    </div>
  );
}