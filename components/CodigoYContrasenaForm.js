import { useRef } from 'react';

export default function CodigoYContrasenaForm({ email, setMessage, setLoading, setShowForgotPassword, loading }) {
  const codeRef = useRef();
  const pass1Ref = useRef();
  const pass2Ref = useRef();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const code = codeRef.current.value;
        const pass1 = pass1Ref.current.value;
        const pass2 = pass2Ref.current.value;
        if (pass1 !== pass2) {
          setMessage('Las contraseñas no coinciden');
          return;
        }
        setLoading(true);
        setMessage("");
        const res = await fetch('/api/auth/validate-reset-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, newPassword: pass1 })
        });
        const result = await res.json();
        setLoading(false);
        if (result.success) {
          setMessage('Contraseña restablecida correctamente. Ahora puedes iniciar sesión.');
          setTimeout(() => {
            setShowForgotPassword(false);
          }, 2000);
        } else {
          setMessage(result.error || 'Error al validar el código.');
        }
      }}
      className="space-y-4 mt-6"
    >
      <input
        type="text"
        ref={codeRef}
        placeholder="Código de verificación"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
        required
      />
      <input
        type="password"
        ref={pass1Ref}
        placeholder="Nueva contraseña"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
        required
      />
      <input
        type="password"
        ref={pass2Ref}
        placeholder="Confirmar nueva contraseña"
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-500"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition duration-200 disabled:bg-gray-400"
      >
        {loading ? 'Cambiando...' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
