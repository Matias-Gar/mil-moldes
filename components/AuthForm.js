"use client";
import { useState } from 'react';
import RecuperarContrasenaForm from './RecuperarContrasenaForm';
import { supabase } from "../lib/SupabaseClient"; // Ajusta esta ruta si es necesario

export default function AuthForm({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState(''); // Para mostrar mensajes de éxito/error
  const [showForgotPassword, setShowForgotPassword] = useState(false); // Estado para mostrar el formulario de recuperación

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    let data, error;

    if (isRegistering) {
      // Lógica de REGISTRO (signUp)
      ({ data, error } = await supabase.auth.signUp({ email, password }));
    } else {
      // Lógica de INICIO DE SESIÓN (signInWithPassword)
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    }

    if (error) {
      // Manejo de errores de Supabase
      // console.error(`Error de autenticación: ${error.message}`);
      setMessage(`Error: ${error.message}`);
      
    } else if (isRegistering && data.user && !data.session) {
      // 💡 CORRECCIÓN: CASO 1 - REGISTRO EXITOSO, PERO REQUIERE CONFIRMACIÓN
      // Muestra el mensaje de éxito, pero NO llama a onLoginSuccess (no hay sesión activa)
      setMessage("¡Registro exitoso! Por favor, revisa tu correo para confirmar la cuenta.");
      
    } else if (data.session) {
      // 💡 CASO 2 - INICIO DE SESIÓN EXITOSO o REGISTRO con autoconfirmación (si la tienes activa)
      // Llama a la función de éxito que redirigirá por rol.
      onLoginSuccess(data.session.user.id); 
      
    } else {
      // Manejo de otros casos raros (seguridad, etc.)
      setMessage("Operación completada. Revisa tu estado de sesión o intenta de nuevo.");
    }
    
    // Limpiamos la contraseña y paramos la carga
    setPassword('');
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center p-8 bg-white shadow-xl rounded-xl w-full max-w-md">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">
        {isRegistering ? 'Crear Cuenta' : 'Acceso de Usuario'}
      </h2>

      {/* Muestra el mensaje de error o éxito */}
      {message && (
        <div className={`p-3 mb-4 rounded-lg w-full text-center ${message.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      {!showForgotPassword ? (
        <>
          <form onSubmit={handleSubmit} className="space-y-4 w-full">
            <input
              type="email"
              placeholder="Correo electrónico"
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
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition duration-200 disabled:bg-gray-400"
            >
              {loading ? 'Cargando...' : (isRegistering ? 'Registrarse' : 'Iniciar Sesión')}
            </button>
          </form>
          <button 
            onClick={() => {
                setIsRegistering(!isRegistering);
                setMessage('');
                setEmail('');
                setPassword('');
            }}
            className="mt-6 text-sm text-indigo-700 hover:text-indigo-900 font-medium transition duration-200"
          >
            {isRegistering ? 'Ya tengo una cuenta' : '¿Necesitas una cuenta?'}
          </button>
          {/* Enlace Olvidé mi contraseña */}
          {!isRegistering && (
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(true);
                setMessage("");
                setEmail("");
                setPassword("");
              }}
              className="mt-2 text-xs text-indigo-600 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
        </>
      ) : (
        <RecuperarContrasenaForm setShowForgotPassword={setShowForgotPassword} />
      )}
    </div>
  );
}
