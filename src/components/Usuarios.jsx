import { useState, useEffect } from "react";
import { Users, UserPlus, Pencil, Ban, CircleCheck, Eye, EyeOff, X, Loader2 } from "lucide-react";
import { getUsuarios, getTiposUsuario, crearUsuario, actualizarUsuario, cambiarActivoUsuario } from "../store/api";

function msgError(e) {
  const s = String(e?.message || e);
  const m = s.match(/"detail":"([^"]+)"/);
  return m ? m[1] : s;
}

const COLOR_ROL = {
  admin: "bg-indigo-50 text-indigo-700 border-indigo-200",
  gerente: "bg-blue-50 text-blue-700 border-blue-200",
  usuario: "bg-gray-100 text-gray-600 border-gray-200",
};

const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400";

// Input de contraseña con mostrar/ocultar (ojo).
function PasswordInput({ value, onChange, placeholder }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input type={ver ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} className={INP + " pr-9"} />
      <button type="button" onClick={() => setVer((v) => !v)} title={ver ? "Ocultar" : "Mostrar"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {ver ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function Usuarios({ onClose }) {
  const [usuarios, setUsuarios] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);       // null = cerrado | { modo, id, ...campos }
  const [guardando, setGuardando] = useState(false);

  const tipoDefault = () => (tipos.find((t) => t.nombre === "usuario") || tipos[0])?.id ?? "";

  const cargar = async () => {
    try {
      const [us, ts] = await Promise.all([getUsuarios(), getTiposUsuario()]);
      setUsuarios(us); setTipos(ts);
    } catch (e) { setError(msgError(e)); }
    finally { setCargando(false); }
  };
  useEffect(() => {
    let vivo = true;
    Promise.all([getUsuarios(), getTiposUsuario()])
      .then(([us, ts]) => { if (vivo) { setUsuarios(us); setTipos(ts); } })
      .catch((e) => { if (vivo) setError(msgError(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const abrirNuevo = () => { setError(""); setForm({ modo: "nuevo", id: null, email: "", full_name: "", telefono: "", tipo_usuario_id: tipoDefault(), password: "", confirm: "" }); };
  const abrirEditar = (u) => { setError(""); setForm({ modo: "editar", id: u.id, email: u.email, full_name: u.full_name || "", telefono: u.telefono || "", tipo_usuario_id: u.tipo_usuario_id || tipoDefault(), password: "", confirm: "" }); };

  const guardar = async () => {
    const f = form;
    setError("");
    if (!f.full_name.trim()) return setError("El nombre es obligatorio.");
    if (f.modo === "nuevo" && !f.email.trim()) return setError("El correo es obligatorio.");
    const cambiaPass = f.modo === "nuevo" || !!f.password;
    if (cambiaPass) {
      if (f.password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
      if (f.password !== f.confirm) return setError("Las contraseñas no coinciden.");
    }
    setGuardando(true);
    try {
      if (f.modo === "nuevo") {
        await crearUsuario({ email: f.email.trim().toLowerCase(), password: f.password, full_name: f.full_name.trim(), telefono: f.telefono.trim(), tipo_usuario_id: f.tipo_usuario_id });
      } else {
        const body = { full_name: f.full_name.trim(), telefono: f.telefono.trim(), tipo_usuario_id: f.tipo_usuario_id };
        if (f.password) body.password = f.password;
        await actualizarUsuario(f.id, body);
      }
      setForm(null);
      await cargar();
    } catch (e) { setError(msgError(e)); }
    finally { setGuardando(false); }
  };

  const toggleActivo = async (u) => {
    setError("");
    try { await cambiarActivoUsuario(u.id, !u.es_activo); await cargar(); }
    catch (e) { setError(msgError(e)); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Users size={18} /></div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Usuarios</div>
              <div className="text-xs text-gray-400">Administración de usuarios y roles</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={abrirNuevo} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <UserPlus size={15} /> Nuevo usuario
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-4">
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>}

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">Nombre</th>
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium">Rol</th>
                  <th className="text-center px-4 py-2.5 font-medium">Estado</th>
                  <th className="text-right px-4 py-2.5 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8"><Loader2 className="inline animate-spin mr-1" size={16} /> Cargando…</td></tr>
                ) : usuarios.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 italic py-8">Sin usuarios.</td></tr>
                ) : usuarios.map((u) => (
                  <tr key={u.id} className={`border-t border-gray-100 ${u.es_activo ? "" : "opacity-55"}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{u.full_name || "—"}</div>
                      {u.telefono && <div className="text-xs text-gray-400">{u.telefono}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${COLOR_ROL[u.tipo_nombre] || COLOR_ROL.usuario}`}>{u.tipo_nombre || "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {u.es_activo
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">activo</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">inactivo</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(u)} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={16} /></button>
                        <button onClick={() => toggleActivo(u)} title={u.es_activo ? "Desactivar" : "Activar"}
                          className={`p-1.5 rounded-lg ${u.es_activo ? "text-gray-400 hover:text-red-600 hover:bg-red-50" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}>
                          {u.es_activo ? <Ban size={16} /> : <CircleCheck size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cerrar</button>
        </div>
      </div>

      {/* Modal Nuevo / Editar */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-base font-semibold text-gray-900">{form.modo === "nuevo" ? "Nuevo usuario" : "Editar usuario"}</div>
              <button onClick={() => setForm(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nombre <span className="text-red-500">*</span></label>
                <input className={INP} value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Nombre completo" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Email <span className="text-red-500">*</span></label>
                  <input className={INP + (form.modo === "editar" ? " bg-gray-50 text-gray-500" : "")} value={form.email} readOnly={form.modo === "editar"}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="correo@sl.com" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Teléfono</label>
                  <input className={INP} value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Rol <span className="text-red-500">*</span></label>
                <select className={INP} value={form.tipo_usuario_id} onChange={(e) => setForm((f) => ({ ...f, tipo_usuario_id: Number(e.target.value) }))}>
                  {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  {form.modo === "nuevo" ? <>Contraseña <span className="text-red-500">*</span></> : "Nueva contraseña (opcional)"}
                </label>
                <PasswordInput value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Confirmar contraseña {form.modo === "nuevo" && <span className="text-red-500">*</span>}</label>
                <PasswordInput value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} placeholder="Repite la contraseña" />
                {form.confirm && form.password !== form.confirm && <div className="text-xs text-red-500 mt-1">No coinciden.</div>}
              </div>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                {guardando ? "Guardando…" : form.modo === "nuevo" ? "Crear usuario" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
