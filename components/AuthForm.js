"use client";

import { useState } from 'react';
import RecuperarContrasenaForm from './RecuperarContrasenaForm';
import { supabase } from "../lib/SupabaseClient";

export default function AuthForm({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nitCi, setNitCi] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setNombre('');
    setTelefono('');
    setNitCi('');
  };

  const toggleRegister = () => {
    setIsRegistering((prev) => !prev);
    setMessage('');
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    let data;
    let error;

    if (isRegistering) {
      const cleanNombre = nombre.trim();
      const cleanTelefono = telefono.trim();
      const cleanNitCi = nitCi.trim();
      const emailNorm = email.trim().toLowerCase();

      if (!cleanNombre || !cleanTelefono || !cleanNitCi) {
        setMessage("Error: Completa nombre, telefono y NIT/CI antes de registrarte.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailNorm }),
        });
        const result = await response.json();

        if (!response.ok) {
          setMessage(`Error: ${result.error || "No se pudo validar el correo"}`);
          setLoading(false);
          return;
        }

        if (result.exists) {
          setMessage("Error: Usted ya cuenta con una cuenta. Inicie sesion o recupere su contrasena.");
          setLoading(false);
          return;
        }
      } catch (_error) {
        setMessage("Error: No se pudo validar si el correo ya esta registrado.");
        setLoading(false);
        return;
      }

      ({ data, error } = await supabase.auth.signUp({
        email: emailNorm,
        password,
        options: {
          data: {
            nombre: cleanNombre,
            telefono: cleanTelefono,
            nit_ci: cleanNitCi,
            rol: 'cliente',
          },
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
        },
      }));
    } else {
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    }

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else if (isRegistering) {
      if (data?.session) {
        await supabase.auth.signOut();
      }
      setMessage("Registro recibido. Revisa tu correo para confirmar la cuenta antes de iniciar sesion.");
      resetForm();
    } else if (data?.session) {
      onLoginSuccess(data.session.user.id);
    } else {
      setMessage("Operacion completada. Revisa tu estado de sesion o intenta de nuevo.");
    }

    setPassword('');
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center p-8 bg-white shadow-xl rounded-xl w-full max-w-md">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">
        {isRegistering ? 'Crear Cuenta' : 'Acceso de Usuario'}
      </h2>

      {message && (
        <div className={`p-3 mb-4 rounded-lg w-full text-center ${message.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      {!showForgotPassword ? (
        <>
          <form onSubmit={handleSubmit} className="space-y-4 w-full">
            {isRegistering && (
              <>
                <input
                  type="text"
                  placeholder="Nombre completo"
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    setMessage("");
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
                  required
                />
                <input
                  type="tel"
                  placeholder="Telefono"
                  value={telefono}
                  onChange={(e) => {
                    setTelefono(e.target.value);
                    setMessage("");
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
                  required
                />
                <input
                  type="text"
                  placeholder="NIT/CI"
                  value={nitCi}
                  onChange={(e) => {
                    setNitCi(e.target.value);
                    setMessage("");
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
                  required
                />
              </>
            )}
            <input
              type="email"
              placeholder="Correo electronico"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setMessage("");
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
              required
            />
            <input
              type="password"
              placeholder="Contrasena"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 !text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition duration-200 disabled:bg-gray-400 disabled:!text-white"
            >
              {loading ? 'Cargando...' : (isRegistering ? 'Registrarse' : 'Iniciar Sesion')}
            </button>
          </form>
          <button
            type="button"
            onClick={toggleRegister}
            className="mt-6 text-sm text-indigo-700 hover:text-indigo-900 font-medium transition duration-200"
          >
            {isRegistering ? 'Ya tengo una cuenta' : 'Necesitas una cuenta?'}
          </button>
          {!isRegistering && (
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(true);
                setMessage("");
                resetForm();
              }}
              className="mt-2 text-xs text-indigo-600 hover:underline"
            >
              Olvidaste tu contrasena?
            </button>
          )}
        </>
      ) : (
        <RecuperarContrasenaForm setShowForgotPassword={setShowForgotPassword} />
      )}
    </div>
  );
}
