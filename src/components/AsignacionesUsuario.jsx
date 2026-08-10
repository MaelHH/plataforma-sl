import { useState, useEffect } from "react";
import { X, Loader2, Sprout, FolderTree, AlertTriangle } from "lucide-react";
import { getCultivosSAP, getCatalogoProyectosSAP, getAsignacionesUsuario, putAsignacionesUsuario } from "../store/api";

// Asignar a un usuario QUÉ cultivos y QUÉ proyectos puede vaciar/trabajar (plan §2.1).
// Cultivos y proyectos se LEEN de SAP (GET, endpoints que ya existen); las asignaciones se
// guardan en nuestras tablas vía PUT /api/usuarios/{id}/asignaciones. Solo admin/gerente
// llegan aquí (el apartado Usuarios ya está gateado con usuarios.administrar).

function msgError(e) {
  const s = String(e?.message || e);
  const m = s.match(/"detail":"([^"]+)"/);
  return m ? m[1] : s;
}

const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400";

// Multi-select con búsqueda (lista de checkboxes).
function ListaSeleccion({ titulo, Icon, items, seleccion, onToggle, vacio, disabled }) {
  const [q, setQ] = useState("");
  const filtrados = q ? items.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())) : items;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1">
        <Icon size={14} /> {titulo} <span className="text-gray-400 font-normal">({seleccion.size} de {items.length})</span>
      </div>
      <input className={INP + " mb-1"} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled} />
      <div className={`border border-gray-200 rounded-lg max-h-52 overflow-y-auto ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        {items.length === 0 ? (
          <div className="text-xs text-gray-400 italic p-3">{vacio}</div>
        ) : filtrados.map((it) => (
          <label key={it.value} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer border-t border-gray-50 first:border-t-0">
            <input type="checkbox" checked={seleccion.has(it.value)} onChange={() => onToggle(it.value)} />
            <span className="truncate">{it.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function AsignacionesUsuario({ usuario, onClose }) {
  const [cultivos, setCultivos] = useState([]);     // {value, label}
  const [proyectos, setProyectos] = useState([]);   // {value, label}
  const [selCult, setSelCult] = useState(new Set());
  const [selProy, setSelProy] = useState(new Set());
  const [cruce, setCruce] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [avisoSAP, setAvisoSAP] = useState("");
  const [guardando, setGuardando] = useState(false);

  const sinEmpresa = !usuario.id_empresa;

  useEffect(() => {
    let vivo = true;
    // Catálogos de SAP DE LA EMPRESA del usuario editado (id_empresa → company de esa empresa):
    // así a un usuario de CACO se le ofrecen los cultivos/proyectos de CACO, no los de quien edita.
    // (independientes: si SAP no responde, avisa pero no bloquea).
    getCultivosSAP(usuario.id_empresa)
      .then((d) => { if (vivo) setCultivos((d.value || []).map((c) => ({ value: c.FactorCode, label: `${c.FactorCode}${c.FactorDescription ? " · " + c.FactorDescription : ""}` }))); })
      .catch(() => { if (vivo) setAvisoSAP("No se pudieron leer los cultivos de SAP."); });
    // Catálogo: cada proyecto trae sus ranchos, y cada rancho su cultivo → así se filtra por cultivo.
    getCatalogoProyectosSAP("", usuario.id_empresa)
      .then((d) => {
        if (!vivo) return;
        setProyectos((d.proyectos || []).map((p) => ({
          value: p.code,
          label: p.nombre || p.code,
          cultivos: [...new Set((p.ranchos || []).map((r) => r.cultivo).filter(Boolean))],
        })));
      })
      .catch(() => { if (vivo) setAvisoSAP((s) => s || "No se pudieron leer los proyectos de SAP."); });
    // Asignaciones actuales del usuario.
    getAsignacionesUsuario(usuario.id)
      .then((a) => {
        if (!vivo) return;
        setSelCult(new Set(a.cultivos || []));
        setSelProy(new Set((a.proyectos || []).map((p) => p.proyecto_codigo)));
        setCruce(!!a.cruce_empresas);
      })
      .catch((e) => { if (vivo) setError(msgError(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [usuario.id, usuario.id_empresa]);

  const toggle = (setter) => (v) => setter((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });

  const guardar = async () => {
    setError("");
    setGuardando(true);
    try {
      const body = {
        cultivos: [...selCult],
        // Por ahora los proyectos son de la empresa casa del usuario (cruce pleno = Paso G).
        proyectos: sinEmpresa ? [] : [...selProy].map((code) => ({ id_empresa: usuario.id_empresa, proyecto_codigo: code })),
        cruce_empresas: cruce,
      };
      await putAsignacionesUsuario(usuario.id, body);
      onClose(true);
    } catch (e) { setError(msgError(e)); }
    finally { setGuardando(false); }
  };

  // Proyectos filtrados por los cultivos elegidos (si no hay cultivo elegido, se muestran todos).
  const proyectosFiltrados = selCult.size
    ? proyectos.filter((p) => p.cultivos.some((c) => selCult.has(c)))
    : proyectos;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><FolderTree size={18} /></div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Cultivos y proyectos</div>
              <div className="text-xs text-gray-400">{usuario.full_name || usuario.email}</div>
            </div>
          </div>
          <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-700 p-1"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {sinEmpresa && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Este usuario no tiene <b>empresa</b> asignada. Asígnale una primero (botón Editar) para poder guardarle proyectos.
            </div>
          )}
          {avisoSAP && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{avisoSAP}</div>}
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          {cargando ? (
            <div className="text-center text-gray-400 py-10"><Loader2 className="inline animate-spin mr-1" size={16} /> Cargando de SAP…</div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <ListaSeleccion titulo="Cultivos (pedidos / OC)" Icon={Sprout} items={cultivos} seleccion={selCult}
                  onToggle={toggle(setSelCult)} vacio="Sin cultivos de SAP." />
                <ListaSeleccion titulo={selCult.size ? "Proyectos del cultivo elegido" : "Proyectos que vacía"} Icon={FolderTree} items={proyectosFiltrados} seleccion={selProy}
                  onToggle={toggle(setSelProy)} vacio={selCult.size ? "Ningún proyecto con ese cultivo." : "Sin proyectos de SAP."} disabled={sinEmpresa} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <input type="checkbox" checked={cruce} onChange={(e) => setCruce(e.target.checked)} />
                <span>Permitir proyectos de <b>otras empresas</b> (caso raro). <span className="text-gray-400">Los proyectos de otra empresa se podrán elegir cuando esté el ruteo por empresa.</span></span>
              </label>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={() => onClose(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando || cargando} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar asignaciones"}
          </button>
        </div>
      </div>
    </div>
  );
}
