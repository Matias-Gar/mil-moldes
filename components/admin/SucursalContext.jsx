"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/SupabaseClient";

const STORAGE_KEY = "mil-moldes.active_sucursal_id";
const SucursalContext = createContext(null);

function getSavedSucursalId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

export function SucursalProvider({ children, showShell = true }) {
  const [sucursales, setSucursales] = useState([]);
  const [activeSucursalId, setActiveSucursalIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);

  const setActiveSucursalId = useCallback((id) => {
    setActiveSucursalIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
      window.dispatchEvent(new CustomEvent("sucursal:changed", { detail: { sucursalId: id } }));
    }
  }, []);

  const loadSucursales = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch("/api/admin/sucursal-context", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudieron cargar sucursales.");
      }

      const branches = result.sucursales || [];
      const savedId = getSavedSucursalId();
      const savedStillValid = branches.some((branch) => branch.id === savedId);
      const nextId = savedStillValid ? savedId : branches[0]?.id || "";

      setSucursales(branches);
      if (nextId) setActiveSucursalId(nextId);
      setSelectorOpen(branches.length > 1 && !savedStillValid);
    } catch (requestError) {
      setError(requestError?.message || "No se pudieron cargar sucursales.");
    } finally {
      setLoading(false);
    }
  }, [setActiveSucursalId]);

  useEffect(() => {
    loadSucursales();
  }, [loadSucursales]);

  const activeSucursal = useMemo(
    () => sucursales.find((branch) => branch.id === activeSucursalId) || null,
    [activeSucursalId, sucursales]
  );

  const value = useMemo(
    () => ({
      sucursales,
      activeSucursal,
      activeSucursalId,
      loading,
      error,
      setActiveSucursalId,
      reloadSucursales: loadSucursales,
    }),
    [activeSucursal, activeSucursalId, error, loadSucursales, loading, setActiveSucursalId, sucursales]
  );

  return (
    <SucursalContext.Provider value={value}>
      <SucursalShell
        activeSucursal={activeSucursal}
        activeSucursalId={activeSucursalId}
        error={error}
        loading={loading}
        selectorOpen={selectorOpen}
        setActiveSucursalId={setActiveSucursalId}
        setSelectorOpen={setSelectorOpen}
        showShell={showShell}
        sucursales={sucursales}
      >
        {children}
      </SucursalShell>
    </SucursalContext.Provider>
  );
}

function SucursalShell({
  activeSucursal,
  activeSucursalId,
  children,
  error,
  loading,
  selectorOpen,
  setActiveSucursalId,
  setSelectorOpen,
  showShell,
  sucursales,
}) {
  const needsSelection = !loading && sucursales.length > 1 && selectorOpen;

  if (!showShell) return <>{children}</>;

  return (
    <>
      <div className="mb-4 rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Sucursal activa</p>
            <p className="text-base font-black text-gray-900">
              {loading ? "Cargando sucursal..." : activeSucursal?.nombre || "Sin sucursal asignada"}
            </p>
            {error && <p className="mt-1 text-sm font-semibold text-red-600">{error}</p>}
          </div>

          {sucursales.length > 1 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
                value={activeSucursalId}
                onChange={(event) => setActiveSucursalId(event.target.value)}
              >
                {sucursales.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.nombre}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-bold !text-white hover:bg-gray-800 disabled:bg-gray-400 disabled:!text-white"
                onClick={() => setSelectorOpen(true)}
              >
                Cambiar
              </button>
            </div>
          )}
        </div>
      </div>

      {children}

      {needsSelection && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl">
            <h2 className="text-xl font-black text-gray-900">Selecciona la sucursal</h2>
            <p className="mt-1 text-sm text-gray-600">
              Trabajaras solo con los datos de la sucursal elegida en esta sesion.
            </p>

            <div className="mt-4 grid gap-2">
              {sucursales.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  className={`rounded-md border px-4 py-3 text-left transition ${
                    branch.id === activeSucursalId
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200 bg-white hover:border-gray-400"
                  }`}
                  onClick={() => {
                    setActiveSucursalId(branch.id);
                    setSelectorOpen(false);
                  }}
                >
                  <span className="block font-black text-gray-900">{branch.nombre}</span>
                  <span className="block text-sm text-gray-500">{branch.direccion || branch.slug}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function useSucursalActiva() {
  const context = useContext(SucursalContext);
  if (!context) {
    throw new Error("useSucursalActiva debe usarse dentro de SucursalProvider");
  }
  return context;
}
