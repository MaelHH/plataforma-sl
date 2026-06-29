import { useState } from "react";
import { login } from "../store/api";

// Pantalla de inicio de sesión. Se muestra como "puerta" antes de cargar la app.
export default function Login({ onOk }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await login(email.trim().toLowerCase(), password);
      onOk();
    } catch {
      setError("Correo o contraseña incorrectos.");
    } finally {
      setCargando(false);
    }
  };

  const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl shadow-sm w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold mx-auto mb-2">SL</div>
          <h1 className="text-lg font-semibold text-gray-900">SL Logística</h1>
          <p className="text-xs text-gray-500">Inicia sesión para continuar</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Correo</label>
          <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={INP} placeholder="tucorreo@sl.com" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={INP} placeholder="••••••••" />
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <button type="submit" disabled={cargando || !email || !password}
          className="w-full text-sm py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
