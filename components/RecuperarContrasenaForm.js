
import { useState } from 'react';

export default function RecuperarContrasenaForm({ setShowForgotPassword }) {
  const [email, setEmail] = useState("");
  const [ci, setCi] = useState("");
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [step, setStep] = useState(1); // 1: email, 2: ci, 3: nueva contraseña
  const [ciRequired, setCiRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Paso 1: Validar email y (si corresponde) CI
  const handleEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setCi("");
    setNuevaContrasena("");
    setConfirmarContrasena("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Error al buscar el correo");
      } else if (data.ci_required) {
        setCiRequired(true);
        setStep(2);
      } else if (data.require_new_password) {
        setStep(3);
        setMessage("Identidad confirmada, ingresa tu nueva contraseña");
      }
    } catch (err) {
      setMessage("Error de red o servidor");
    } finally {
      setLoading(false);
    }
  };

  // Paso 2: Validar CI si corresponde
  const handleCi = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ci })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error && data.error.toLowerCase().includes("ci incorrecto")) {
          setMessage("❌ El CI ingresado no es correcto. Intenta de nuevo.");
          setCi("");
        } else {
          setMessage(data.error || "CI incorrecto");
        }
      } else if (data.require_new_password) {
        setStep(3);
        setMessage("Identidad confirmada, ingresa tu nueva contraseña");
      }
    } catch (err) {
      setMessage("Error de red o servidor");
    } finally {
      setLoading(false);
    }
  };

  // Paso 3: Cambiar contraseña directamente
  const handleNuevaContrasena = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    if (nuevaContrasena !== confirmarContrasena) {
      setMessage("Las contraseñas no coinciden");
      setLoading(false);
      return;
    }
    if (nuevaContrasena.length < 6) {
      setMessage("La contraseña debe tener al menos 6 caracteres");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ci: ciRequired ? ci : undefined, newPassword: nuevaContrasena })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Error al cambiar la contraseña");
      } else {
        setMessage("Contraseña cambiada correctamente. Ahora puedes iniciar sesión.");
        setTimeout(() => setShowForgotPassword(false), 2000);
      }
    } catch (err) {
      setMessage("Error de red o servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">Recuperar contraseña</h3>
      {message && <div className="mb-2 text-center text-sm text-red-600">{message}</div>}
      {step === 1 && (
        <form onSubmit={handleEmail} className="space-y-4">
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            required
          />
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-lg">
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>
      )}
      {step === 2 && (
        <form onSubmit={handleCi} className="space-y-4">
          <input
            type="text"
            placeholder="CI registrado"
            value={ci}
            onChange={e => setCi(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            required
          />
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-lg">
            {loading ? "Validando..." : "Validar CI"}
          </button>
        </form>
      )}
      {step === 3 && (
        <form onSubmit={handleNuevaContrasena} className="space-y-4">
          <input
            type="password"
            placeholder="Nueva contraseña"
            value={nuevaContrasena}
            onChange={e => setNuevaContrasena(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            required
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmarContrasena}
            onChange={e => setConfirmarContrasena(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            required
          />
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-lg">
            {loading ? "Cambiando..." : "Cambiar contraseña"}
          </button>
        </form>
      )}
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
