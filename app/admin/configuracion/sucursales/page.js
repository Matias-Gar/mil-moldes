"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/SupabaseClient";

const EMPTY_BRANCH = {
  nombre: "",
  slug: "",
  direccion: "",
  telefono: "",
  activa: true,
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "administracion", label: "Administracion" },
  { value: "vendedor", label: "Vendedor" },
  { value: "almacen", label: "Almacen" },
];

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function displayUser(profile) {
  return profile?.nombre || profile?.email || profile?.id || "Usuario";
}

export default function SucursalesPage() {
  const [sucursales, setSucursales] = useState([]);
  const [perfiles, setPerfiles] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [form, setForm] = useState(EMPTY_BRANCH);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [assignment, setAssignment] = useState({
    usuario_id: "",
    sucursal_id: "",
    rol: "vendedor",
  });

  const perfilesById = useMemo(() => {
    return Object.fromEntries(perfiles.map((profile) => [profile.id, profile]));
  }, [perfiles]);

  const getAuthHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sesion no valida. Vuelve a iniciar sesion.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const requestSucursalesApi = async (payload = null) => {
    const headers = await getAuthHeaders();
    const response = await fetch("/api/admin/sucursales", {
      method: payload ? "POST" : "GET",
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || "No se pudo completar la operacion");
    }
    return result;
  };

  const fetchData = async () => {
    setLoading(true);
    setStatus("");
    try {
      const result = await requestSucursalesApi();
      const branches = result.sucursales || [];
      setSucursales(branches);
      setPerfiles(result.perfiles || []);
      setAsignaciones(result.asignaciones || []);

      setAssignment((prev) => ({
        ...prev,
        sucursal_id: prev.sucursal_id || branches[0]?.id || "",
      }));
    } catch (error) {
      setStatus(error?.message || "No se pudieron cargar sucursales.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateForm = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "nombre" && (!editingId || prev.slug === slugify(prev.nombre))) {
        next.slug = slugify(value);
      }
      if (field === "slug") next.slug = slugify(value);
      return next;
    });
    setStatus("");
  };

  const resetForm = () => {
    setForm(EMPTY_BRANCH);
    setEditingId(null);
    setStatus("");
  };

  const editBranch = (branch) => {
    setEditingId(branch.id);
    setForm({
      nombre: branch.nombre || "",
      slug: branch.slug || "",
      direccion: branch.direccion || "",
      telefono: branch.telefono || "",
      activa: branch.activa !== false,
    });
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveBranch = async (event) => {
    event.preventDefault();
    const nombre = form.nombre.trim();
    const slug = slugify(form.slug || nombre);

    if (!nombre || !slug) {
      setStatus("Escribe un nombre y un slug valido para la sucursal.");
      return;
    }

    setSaving(true);
    const payload = {
      nombre,
      slug,
      direccion: form.direccion.trim() || null,
      telefono: form.telefono.trim() || null,
      activa: form.activa,
      updated_at: new Date().toISOString(),
    };

    try {
      await requestSucursalesApi({ action: "save_branch", id: editingId, ...payload });
      setStatus(editingId ? "Sucursal actualizada correctamente." : "Sucursal creada correctamente.");
      resetForm();
      await fetchData();
    } catch (error) {
      setStatus(`No se pudo guardar la sucursal: ${error?.message || "Error desconocido"}`);
    }

    setSaving(false);
  };

  const toggleBranch = async (branch) => {
    try {
      await requestSucursalesApi({ action: "toggle_branch", id: branch.id, activa: !branch.activa });
      await fetchData();
    } catch (error) {
      setStatus(`No se pudo cambiar el estado: ${error?.message || "Error desconocido"}`);
    }
  };

  const saveAssignment = async (event) => {
    event.preventDefault();
    if (!assignment.usuario_id || !assignment.sucursal_id || !assignment.rol) {
      setStatus("Selecciona usuario, sucursal y rol.");
      return;
    }

    setSaving(true);
    try {
      await requestSucursalesApi({ action: "save_assignment", ...assignment });
      setStatus("Acceso guardado correctamente.");
      setAssignment((prev) => ({ ...prev, usuario_id: "", rol: "vendedor" }));
      await fetchData();
    } catch (error) {
      setStatus(`No se pudo asignar el acceso: ${error?.message || "Error desconocido"}`);
    }

    setSaving(false);
  };

  const toggleAssignment = async (row) => {
    try {
      await requestSucursalesApi({ action: "toggle_assignment", id: row.id, activo: !row.activo });
      await fetchData();
    } catch (error) {
      setStatus(`No se pudo cambiar el acceso: ${error?.message || "Error desconocido"}`);
    }
  };

  const branchName = (id) => sucursales.find((branch) => branch.id === id)?.nombre || "Sucursal";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
        <div className="mx-auto max-w-6xl rounded-lg bg-white p-6 shadow">Cargando sucursales...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="bg-white p-5 shadow">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900 sm:text-3xl">Configuracion de Sucursales</h1>
              <p className="mt-1 text-sm text-gray-600">
                Crea sucursales y asigna que usuarios pueden trabajar en cada una con su rol correspondiente.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              Actualizar
            </button>
          </div>
          {status && (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">
              {status}
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <form className="bg-white p-5 shadow" onSubmit={saveBranch}>
            <h2 className="text-lg font-black text-gray-900">{editingId ? "Editar sucursal" : "Nueva sucursal"}</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-700">Nombre</label>
                <input
                  value={form.nombre}
                  onChange={(event) => updateForm("nombre", event.target.value)}
                  placeholder="Ej: Sucursal Norte"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-700">Slug publico</label>
                <input
                  value={form.slug}
                  onChange={(event) => updateForm("slug", event.target.value)}
                  placeholder="sucursal-norte"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
                <p className="mt-1 text-xs text-gray-500">Luego servira para enlaces publicos como /s/sucursal-norte.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-700">Direccion</label>
                <textarea
                  value={form.direccion}
                  onChange={(event) => updateForm("direccion", event.target.value)}
                  rows={3}
                  placeholder="Direccion de la tienda"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-700">Telefono</label>
                <input
                  value={form.telefono}
                  onChange={(event) => updateForm("telefono", event.target.value)}
                  placeholder="591..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(event) => updateForm("activa", event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                />
                Sucursal activa
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear sucursal"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-md bg-gray-200 px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-300"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className="bg-white p-5 shadow">
            <h2 className="text-lg font-black text-gray-900">Sucursales registradas</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-100 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2">Slug</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sucursales.map((branch) => (
                    <tr key={branch.id}>
                      <td className="px-3 py-3">
                        <div className="font-bold text-gray-900">{branch.nombre}</div>
                        <div className="text-xs text-gray-500">{branch.direccion || "Sin direccion"}</div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{branch.slug}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${branch.activa ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {branch.activa ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => editBranch(branch)}
                            className="rounded-md bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-200"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleBranch(branch)}
                            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-200"
                          >
                            {branch.activa ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sucursales.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={4}>
                        No hay sucursales registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <form className="bg-white p-5 shadow" onSubmit={saveAssignment}>
            <h2 className="text-lg font-black text-gray-900">Asignar usuario a sucursal</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-700">Usuario</label>
                <select
                  value={assignment.usuario_id}
                  onChange={(event) => setAssignment((prev) => ({ ...prev, usuario_id: event.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Seleccionar usuario</option>
                  {perfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {displayUser(profile)} - {profile.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-700">Sucursal</label>
                <select
                  value={assignment.sucursal_id}
                  onChange={(event) => setAssignment((prev) => ({ ...prev, sucursal_id: event.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Seleccionar sucursal</option>
                  {sucursales.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-700">Rol en esa sucursal</label>
                <select
                  value={assignment.rol}
                  onChange={(event) => setAssignment((prev) => ({ ...prev, rol: event.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Guardar acceso
              </button>
            </div>
          </form>

          <div className="bg-white p-5 shadow">
            <h2 className="text-lg font-black text-gray-900">Accesos por sucursal</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-100 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Usuario</th>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2">Rol</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {asignaciones.map((row) => {
                    const profile = perfilesById[row.usuario_id];
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-3">
                          <div className="font-bold text-gray-900">{displayUser(profile)}</div>
                          <div className="text-xs text-gray-500">{profile?.email || row.usuario_id}</div>
                        </td>
                        <td className="px-3 py-3">{branchName(row.sucursal_id)}</td>
                        <td className="px-3 py-3 font-semibold">{row.rol}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-bold ${row.activo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {row.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleAssignment(row)}
                            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-200"
                          >
                            {row.activo ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {asignaciones.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                        No hay usuarios asignados a sucursales.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
