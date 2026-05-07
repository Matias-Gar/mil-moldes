"use client";

import { useState } from 'react';
import { supabase } from "../lib/SupabaseClient";

export default function RecuperarContrasenaForm({ setShowForgotPassword }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const emailNorm = email.trim().toLowerCase();
    const redirectTo = `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(emailNorm, {
      redirectTo,
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Te enviamos un correo de verificacion para restaurar tu contrasena.");
      setEmail("");
    }

    setLoading(false);
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Recuperar contrasena</h3>
      {message && (
        <div className={`mb-3 rounded-lg p-3 text-center text-sm ${message.startsWith("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {message}
        </div>
      )}
      <form onSubmit={handleSendReset} className="space-y-4">
        <input
          type="email"
          placeholder="Correo electronico"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setMessage("");
          }}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 !text-white py-3 rounded-lg font-semibold disabled:bg-gray-400 disabled:!text-white"
        >
          {loading ? "Enviando..." : "Enviar correo de recuperacion"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setShowForgotPassword(false)}
        className="mt-4 text-xs text-gray-500 hover:underline"
      >
        Volver al login
      </button>
    </div>
  );
}
