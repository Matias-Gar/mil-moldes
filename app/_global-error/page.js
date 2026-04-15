import GlobalErrorClient from "@/components/ui/GlobalErrorClient";

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body>
        <main className="p-6">
          <h1 className="text-2xl font-bold">Algo salió mal</h1>
          <p className="mt-2 text-sm text-gray-300">
            {error?.message || "Ha ocurrido un error inesperado."}
          </p>
          {/* interacción (reintentar) en cliente */}
          <GlobalErrorClient reset={reset} />
        </main>
      </body>
    </html>
  );
}