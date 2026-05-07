"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/SupabaseClient";
import { canAccessAdminPath, isAdminPanelRole } from "../../lib/adminPermissions";

export default function AdminDashboard() {
    const [userRole, setUserRole] = useState(null);
    const router = useRouter();

    useEffect(() => {
        const checkAuthAndRole = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                router.push("/login");
                setUserRole("not_logged");
                return;
            }

            const { data: profile, error } = await supabase
                .from("perfiles")
                .select("rol")
                .eq("id", user.id)
                .single();

            if (error) {
                console.error("Error al obtener perfil:", error.message);
                setUserRole("cliente");
                router.push("/");
                return;
            }

            if (profile) {
                setUserRole(profile.rol);
            } else {
                setUserRole("cliente");
                router.push("/");
                return;
            }

            if (!isAdminPanelRole(profile.rol) || !canAccessAdminPath(profile.rol, "/admin")) {
                router.push("/");
            }
        };

        checkAuthAndRole();
    }, [router]);

    if (userRole === null) {
        return (
            <div className="min-h-screen flex items-center justify-center text-xl font-medium text-gray-700">
                Verificando permisos, por favor espera...
            </div>
        );
    }

    if (!isAdminPanelRole(userRole) || !canAccessAdminPath(userRole, "/admin")) {
        return (
            <div className="min-h-screen flex items-center justify-center text-xl font-medium text-red-500">
                Acceso denegado. Redirigiendo...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 px-6 py-10">
            <div className="mx-auto flex max-w-5xl flex-col items-center">
                <h1 className="mb-4 text-center text-4xl font-bold text-gray-800">
                    Panel de Administracion
                </h1>
                <p className="mb-10 max-w-2xl text-center text-lg text-gray-600">
                    Elige a que vista quieres entrar. Articulos e insumos quedan separados
                    visualmente, pero siguen funcionando dentro de la misma app.
                </p>

                <div className="grid w-full gap-6 md:grid-cols-2">
                    <Link
                        href="/"
                        className="group rounded-3xl bg-white p-7 shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-1 hover:shadow-lg"
                    >
                        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.8}
                                stroke="currentColor"
                                className="h-7 w-7"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M2.25 12.75 11.204 3.796a1.125 1.125 0 0 1 1.591 0l8.955 8.954M4.5 10.5v8.25A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25V10.5"
                                />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-semibold text-gray-900">Ver articulos</h2>
                        <p className="mt-3 text-sm leading-6 text-gray-600">
                            Abre el catalogo publico de articulos para revisar exactamente como lo
                            ven tus clientes antes de hacer un pedido.
                        </p>
                        <span className="mt-5 inline-flex text-sm font-semibold text-violet-700 group-hover:text-violet-800">
                            Ir a vista publica
                        </span>
                    </Link>

                    <Link
                        href="/insumos"
                        className="group rounded-3xl bg-white p-7 shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-1 hover:shadow-lg"
                    >
                        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.8}
                                stroke="currentColor"
                                className="h-7 w-7"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3.75 21h16.5M4.5 3h15l-.75 11.25a2.25 2.25 0 0 1-2.245 2.1H7.495a2.25 2.25 0 0 1-2.245-2.1L4.5 3Z"
                                />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7.5h6" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 12h3" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-semibold text-gray-900">Ver insumos</h2>
                        <p className="mt-3 text-sm leading-6 text-gray-600">
                            Abre la vista publica separada de insumos para confirmar que no se
                            mezclen con los articulos y revisar su experiencia completa.
                        </p>
                        <span className="mt-5 inline-flex text-sm font-semibold text-amber-700 group-hover:text-amber-800">
                            Ir a vista publica
                        </span>
                    </Link>
                </div>

                <button
                    onClick={() => supabase.auth.signOut()}
                    className="mt-10 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                >
                    Cerrar sesion
                </button>
            </div>
        </div>
    );
}
