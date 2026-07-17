import { useState, useEffect } from "react";
import { ShieldCheck, Plus, Save, Loader2, Check } from "lucide-react";
import {
  getTiposUsuario, getPermisos, getRolPermisos, putRolPermisos, crearTipoUsuario,
} from "../store/api";

function msgError(e) {
  const s = String(e?.message || e);
  const m = s.match(/"detail":"([^"]+)"/);
  return m ? m[1] : s;
}

// Etiquetas de grupos que no son módulos del menú.
const EXTRA_MODULOS = { usuarios: "Usuarios y roles", datos: "Datos / borrado" };

// Agrupa los permisos del catálogo por módulo, conservando el orden de llegada.
function agrupar(permisos) {
  const grupos = [];
  const idx = {};
  for (const p of permisos) {
    if (!(p.modulo in idx)) { idx[p.modulo] = grupos.length; grupos.push({ modulo: p.modulo, items: [] }); }
    grupos[idx[p.modulo]].items.push(p);
  }
  return grupos;
}

// Pantalla de administración de ROLES y sus PERMISOS (módulo + acción).
export default function RolesPermisos() {
  const [roles, setRoles] = useState([]);
  const [cat, setCat] = useState({ modulos: {}, acciones: {}, permisos: [] });
  const [rolSel, setRolSel] = useState(null);        // rol seleccionado
  const [sel, setSel] = useState(new Set());          // códigos marcados
  const [esSuper, setEsSuper] = useState(false);      // rol admin = superusuario
  const [cargando, setCargando] = useState(true);
  const [cargandoRol, setCargandoRol] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [nuevo, setNuevo] = useState(null);           // { nombre } | null

  useEffect(() => {
    let vivo = true;
    Promise.all([getTiposUsuario(), getPermisos()])
      .then(([rs, c]) => { if (vivo) { setRoles(rs); setCat(c); } })
      .catch((e) => { if (vivo) setError(msgError(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const elegirRol = async (r) => {
    setError(""); setOk(""); setRolSel(r); setCargandoRol(true);
    try {
      const res = await getRolPermisos(r.id);
      setEsSuper(!!res.es_superusuario);
      setSel(new Set(res.es_superusuario ? [] : (res.codigos || [])));
    } catch (e) { setError(msgError(e)); }
    finally { setCargandoRol(false); }
  };

  const toggle = (codigo) => setSel((prev) => {
    const s = new Set(prev);
    if (s.has(codigo)) s.delete(codigo); else s.add(codigo);
    return s;
  });
  const toggleGrupo = (items, marcar) => setSel((prev) => {
    const s = new Set(prev);
    items.forEach((p) => (marcar ? s.add(p.codigo) : s.delete(p.codigo)));
    return s;
  });

  const guardar = async () => {
    if (!rolSel) return;
    setGuardando(true); setError(""); setOk("");
    try {
      await putRolPermisos(rolSel.id, [...sel]);
      setOk(`Permisos de "${rolSel.nombre}" guardados.`);
    } catch (e) { setError(msgError(e)); }
    finally { setGuardando(false); }
  };

  const crearRol = async () => {
    const nombre = (nuevo?.nombre || "").trim();
    if (!nombre) return setError("El nombre del rol es obligatorio.");
    setError(""); setOk("");
    try {
      const r = await crearTipoUsuario({ nombre });
      const rs = await getTiposUsuario();
      setRoles(rs); setNuevo(null);
      const creado = rs.find((x) => x.id === r.id) || r;
      await elegirRol({ id: creado.id, nombre: creado.nombre });
      setOk(`Rol "${creado.nombre}" creado. Marca sus permisos y guarda.`);
    } catch (e) { setError(msgError(e)); }
  };

  const grupos = agrupar(cat.permisos);
  const labelModulo = (mod) => cat.modulos?.[mod] || EXTRA_MODULOS[mod] || mod;

  if (cargando) return <div className="text-center text-gray-400 py-10"><Loader2 className="inline animate-spin mr-1" size={16} /> Cargando roles y permisos…</div>;

  return (
    <div>
      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>}
      {ok && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 inline-flex items-center gap-1"><Check size={13} /> {ok}</div>}
      {cat.permisos.length === 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          No hay permisos en la base de datos. Corre en el backend: <code>python -m src.scripts.sembrar_permisos</code>
        </div>
      )}

      <div className="grid md:grid-cols-[220px_1fr] gap-4">
        {/* Lista de roles */}
        <div className="border border-gray-200 rounded-xl p-2 h-fit">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1.5">Roles</div>
          {roles.map((r) => (
            <button key={r.id} onClick={() => elegirRol(r)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 ${rolSel?.id === r.id ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
              {r.nombre}{r.nombre === "admin" && <span className="text-[10px] text-indigo-500 ml-1">(super)</span>}
            </button>
          ))}
          {nuevo ? (
            <div className="p-2 border-t border-gray-100 mt-1 space-y-2">
              <input autoFocus value={nuevo.nombre} onChange={(e) => setNuevo({ nombre: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && crearRol()}
                placeholder="nombre del rol" className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded-lg" />
              <div className="flex gap-1">
                <button onClick={crearRol} className="flex-1 text-xs px-2 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Crear</button>
                <button onClick={() => setNuevo(null)} className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-500">Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setNuevo({ nombre: "" }); setError(""); }} className="w-full mt-1 flex items-center gap-1 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 rounded-lg font-medium"><Plus size={14} /> Nuevo rol</button>
          )}
        </div>

        {/* Permisos del rol seleccionado */}
        <div className="border border-gray-200 rounded-xl p-3 min-h-[200px]">
          {!rolSel ? (
            <div className="text-sm text-gray-400 text-center py-16 flex flex-col items-center gap-2">
              <ShieldCheck size={26} className="text-gray-300" />
              Elige un rol a la izquierda para ver y editar sus permisos.
            </div>
          ) : cargandoRol ? (
            <div className="text-center text-gray-400 py-16"><Loader2 className="inline animate-spin mr-1" size={16} /> Cargando permisos del rol…</div>
          ) : esSuper ? (
            <div className="text-sm text-gray-500 text-center py-16">
              <ShieldCheck size={26} className="text-indigo-400 mx-auto mb-2" />
              El rol <b>admin</b> es <b>superusuario</b>: tiene todos los permisos siempre y no se edita.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="text-sm font-semibold text-gray-800">Permisos de "{rolSel.nombre}" <span className="text-xs font-normal text-gray-400">({sel.size} marcados)</span></div>
                <button onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"><Save size={14} /> {guardando ? "Guardando…" : "Guardar permisos"}</button>
              </div>
              <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
                {grupos.map((g) => {
                  const todos = g.items.every((p) => sel.has(p.codigo));
                  return (
                    <div key={g.modulo} className="border border-gray-100 rounded-lg">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-t-lg">
                        <span className="text-xs font-semibold text-gray-700">{labelModulo(g.modulo)}</span>
                        <button onClick={() => toggleGrupo(g.items, !todos)} className="text-[11px] text-blue-600 hover:underline">{todos ? "Quitar todo" : "Marcar todo"}</button>
                      </div>
                      <div className="p-2 grid sm:grid-cols-2 gap-1">
                        {g.items.map((p) => (
                          <label key={p.codigo} className="flex items-start gap-2 text-xs text-gray-600 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={sel.has(p.codigo)} onChange={() => toggle(p.codigo)} className="mt-0.5" />
                            <span>{p.descripcion || p.codigo}<span className="block text-[10px] text-gray-300 font-mono">{p.codigo}</span></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
