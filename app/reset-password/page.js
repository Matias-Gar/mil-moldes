"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/SupabaseClient";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const ensureRecoverySession = async () => {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const code = new URLSearchParams(search).get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState(null, "", window.location.pathname);
      }

      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash && hash.includes("access_token")) {
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          window.history.replaceState(null, "", window.location.pathname);
        }
      }

      const { data } = await supabase.auth.getSession();
      setReady(Boolean(data.session));
      if (!data.session) {
        setMessage("El enlace expiro o no es valido. Solicita un nuevo correo de recuperacion.");
      }
    };

    ensureRecoverySession();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (password.length < 6) {
      setMessage("La contrasena debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Las contrasenas no coinciden.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      await supabase.auth.signOut();
      setPassword("");
      setConfirmPassword("");
      setReady(false);
      setMessage("Contrasena actualizada. Ya puedes iniciar sesion.");
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16">
      <section className="mx-auto w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <h1 className="mb-6 text-center text-3xl font-bold text-gray-900">Nueva contrasena</h1>

        {message && (
          <div className={`mb-4 rounded-lg p-3 text-center text-sm ${message.startsWith("Error") || message.includes("expiro") || message.includes("coinciden") || message.includes("menos") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {message}
          </div>
        )}

        {ready ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="Nueva contrasena"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500"
              required
            />
            <input
              type="password"
              placeholder="Confirmar nueva contrasena"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 py-3 font-semibold !text-white hover:bg-indigo-700 disabled:bg-gray-400 disabled:!text-white"
            >
              {loading ? "Guardando..." : "Actualizar contrasena"}
            </button>
          </form>
        ) : (
          <Link href="/login" className="block rounded-lg bg-gray-900 py-3 text-center font-semibold !text-white">
            Volver al login
          </Link>
        )}
      </section>
    </main>
  );
}
