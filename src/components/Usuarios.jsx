import { useState, useEffect } from "react";
import { getUsuarios, getTiposUsuario, crearUsuario, actualizarUsuario, cambiarActivoUsuario } from "../store/api";

// Extrae el "detail" del error del backend (req lanza un Error con el texto crudo).
function msgError(e) {
  const s = String(e?.message || e);
  const m = s.match(/"detail":"([^"]+)"/);
  return m ? m[1] : s;
}

// Gestión de usuarios (CRUD): listar, crear, cambiar tipo, activar/desactivar, reset password.
export default function Usuarios({ onClose }) {
  const [usuarios, setUsuarios] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [nuevo, setNuevo] = useState({ email: "", password: "", full_name: "", tipo_usuario_id: "usuario" });
  const [creando, setCreando] = useState(false);

  const cargar = async () => {
    try {
      const [us, ts] = await Promise.all([getUsuarios(), getTiposUsuario()]);
      setUsuarios(us); setTipos(ts);
    } catch (e) { setError(msgError(e)); }
    finally { setCargando(false); }
  };
  // Carga inicial: setState solo dentro de los callbacks (tras la promesa), no en el
  // cuerpo del efecto (evita react-hooks/set-state-in-effect).
  useEffect(() => {
    let vivo = true;
    Promise.all([getUsuarios(), getTiposUsuario()])
      .then(([us, ts]) => { if (vivo) { setUsuarios(us); setTipos(ts); } })
      .catch((e) => { if (vivo) setError(msgError(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const crear = async () => {
    setError(""); setCreando(true);
    try {
      await crearUsuario({ ...nuevo, email: nuevo.email.trim().toLowerCase() });
      setNuevo({ email: "", password: "", full_name: "", tipo_usuario_id: "usuario" });
      await cargar();
    } catch (e) { setError(msgError(e)); }
    finally { setCreando(false); }
  };
  const cambiarTipo = async (u, tipo) => {
    setError("");
    try { await actualizarUsuario(u.id, { tipo_usuario_id: tipo }); await cargar(); }
    catch (e) { setError(msgError(e)); }
  };
  const toggleActivo = async (u) => {
    setError("");
    try { await cambiarActivoUsuario(u.id, !u.es_activo); await cargar(); }
    catch (e) { setError(msgError(e)); }
  };
  const resetPass = async (u) => {
    const p = window.prompt(`Nueva contraseña para ${u.email} (mín. 8):`);
    if (!p) return;
    setError("");
    try { await actualizarUsuario(u.id, { password: p }); window.alert("Contraseña actualizada."); }
    catch (e) { setError(msgError(e)); }
  };

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div className="text-sm font-semibold text-gray-900">👥 Gestión de usuarios</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{error}</div>}

          {/* Crear */}
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Nuevo usuario</div>
            <div className="grid grid-cols-2 gap-2">
              <input className={INP} placeholder="Correo" value={nuevo.email} onChange={(e) => setNuevo((n) => ({ ...n, email: e.target.value }))} />
              <input className={INP} placeholder="Nombre" value={nuevo.full_name} onChange={(e) => setNuevo((n) => ({ ...n, full_name: e.target.value }))} />
              <input className={INP} type="password" placeholder="Contraseña (mín. 8)" value={nuevo.password} onChange={(e) => setNuevo((n) => ({ ...n, password: e.target.value }))} />
              <select className={INP} value={nuevo.tipo_usuario_id} onChange={(e) => setNuevo((n) => ({ ...n, tipo_usuario_id: e.target.value }))}>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <button onClick={crear} disabled={creando || !nuevo.email || nuevo.password.length < 8}
              className="mt-2 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {creando ? "Creando…" : "+ Crear usuario"}
            </button>
          </div>

          {/* Lista */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-2 py-1.5 font-medium">Correo</th>
                  <th className="text-left px-2 py-1.5 font-medium">Nombre</th>
                  <th className="text-left px-2 py-1.5 font-medium w-32">Tipo</th>
                  <th className="text-center px-2 py-1.5 font-medium">Estado</th>
                  <th className="text-right px-2 py-1.5 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 italic py-6">Cargando…</td></tr>
                ) : usuarios.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 italic py-6">Sin usuarios.</td></tr>
                ) : usuarios.map((u) => (
                  <tr key={u.id} className={`border-t border-gray-100 ${u.es_activo ? "" : "bg-gray-50 opacity-60"}`}>
                    <td className="px-2 py-1.5 text-gray-800">{u.email}</td>
                    <td className="px-2 py-1.5 text-gray-600">{u.full_name || "—"}</td>
                    <td className="px-2 py-1.5">
                      <select className={INP} value={u.tipo_usuario_id || ""} onChange={(e) => cambiarTipo(u, e.target.value)}>
                        {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {u.es_activo
                        ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">Activo</span>
                        : <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Inactivo</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => resetPass(u)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 mr-1">🔑 Clave</button>
                      <button onClick={() => toggleActivo(u)} className={`text-xs px-2 py-1 border rounded-lg bg-white ${u.es_activo ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                        {u.es_activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
