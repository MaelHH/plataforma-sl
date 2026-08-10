import { useState, useEffect } from "react";
import { Building2, Plus, Pencil, Ban, CircleCheck, X, Loader2, Search } from "lucide-react";
import { getEmpresas, crearEmpresa, actualizarEmpresa, cambiarActivoEmpresa, getDiagOrdenesSAP } from "../store/api";
import { useDialog } from "./Dialog";

// Administración de empresas (multi-empresa) — SOLO admin (el menú se gatea con
// can("empresas.administrar"); el backend valida con requiere_admin, así que un no-admin
// que forzara la URL recibe 403). Mismo molde que components/Usuarios.jsx.
//
// NO toca SAP: `sap_company_db` es solo el nombre de la company a la que hay que conectarse;
// aquí solo se guarda en nuestra tabla `empresas`.

function msgError(e) {
  const s = String(e?.message || e);
  const m = s.match(/"detail":"([^"]+)"/);
  return m ? m[1] : s;
}

const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400";

export default function Empresas({ onClose }) {
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);       // null = cerrado | { modo, id, nombre, sap_company_db, cultivo_default }
  const [guardando, setGuardando] = useState(false);
  const [diag, setDiag] = useState(null);       // null = cerrado | { empresa, cargando, data, error }
  const dlg = useDialog();

  // Diagnóstico SOLO LECTURA: ver cómo están armadas las órdenes de fabricación de esa empresa
  // (qué item usa cada cultivo, si están liberadas o cerradas). Sirve para decidir el filtro del
  // catálogo multi-empresa. No escribe nada en SAP.
  const abrirDiag = async (e) => {
    setDiag({ empresa: e, cargando: true, data: null, error: "" });
    try { const data = await getDiagOrdenesSAP(e.id); setDiag({ empresa: e, cargando: false, data, error: "" }); }
    catch (err) { setDiag({ empresa: e, cargando: false, data: null, error: msgError(err) }); }
  };

  const cargar = async () => {
    try { setEmpresas(await getEmpresas()); }
    catch (e) { setError(msgError(e)); }
    finally { setCargando(false); }
  };
  useEffect(() => {
    let vivo = true;
    getEmpresas()
      .then((es) => { if (vivo) setEmpresas(es); })
      .catch((e) => { if (vivo) setError(msgError(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const abrirNuevo = () => { setError(""); setForm({ modo: "nuevo", id: null, nombre: "", sap_company_db: "" }); };
  const abrirEditar = (e) => { setError(""); setForm({ modo: "editar", id: e.id, nombre: e.nombre, sap_company_db: e.sap_company_db || "" }); };

  const guardar = async () => {
    const f = form;
    setError("");
    if (!f.nombre.trim()) return setError("El nombre de la empresa es obligatorio.");
    setGuardando(true);
    try {
      const body = { nombre: f.nombre.trim(), sap_company_db: f.sap_company_db.trim() };
      if (f.modo === "nuevo") await crearEmpresa(body);
      else await actualizarEmpresa(f.id, body);
      setForm(null);
      await cargar();
    } catch (e) { setError(msgError(e)); }
    finally { setGuardando(false); }
  };

  const toggleActivo = async (e) => {
    setError("");
    // Confirmación solo al DESACTIVAR (la acción "destructiva"); reactivar es directo.
    if (e.es_activo) {
      const ok = await dlg.confirm({
        title: "Desactivar empresa",
        message: `¿Seguro que quieres desactivar “${e.nombre}”? No se borra: deja de estar disponible y puedes reactivarla cuando quieras.`,
        confirmText: "Desactivar",
        danger: true,
      });
      if (!ok) return;
    }
    try { await cambiarActivoEmpresa(e.id, !e.es_activo); await cargar(); }
    catch (err) { setError(msgError(err)); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Building2 size={18} /></div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Empresas</div>
              <div className="text-xs text-gray-400">Empresas y su base de datos de SAP</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={abrirNuevo} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus size={15} /> Nueva empresa
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
            Registra cada empresa y el nombre de su <b>base de datos (company) de SAP</b>. En pruebas usa las de prueba; en producción las reales. <b>No se toca SAP</b>: solo se guarda a qué company conectarse.
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>}

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">Empresa</th>
                  <th className="text-left px-4 py-2.5 font-medium">Company SAP</th>
                  <th className="text-center px-4 py-2.5 font-medium">Estado</th>
                  <th className="text-right px-4 py-2.5 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-8"><Loader2 className="inline animate-spin mr-1" size={16} /> Cargando…</td></tr>
                ) : empresas.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-gray-400 italic py-8">Sin empresas. Agrega la primera con “Nueva empresa”.</td></tr>
                ) : empresas.map((e) => (
                  <tr key={e.id} className={`border-t border-gray-100 ${e.es_activo ? "" : "opacity-55"}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{e.nombre}</td>
                    <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{e.sap_company_db || <span className="text-gray-300">— sin definir —</span>}</td>
                    <td className="px-4 py-2.5 text-center">
                      {e.es_activo
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">activa</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">inactiva</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirDiag(e)} title="Diagnóstico de órdenes SAP (solo lectura)" className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Search size={16} /></button>
                        <button onClick={() => abrirEditar(e)} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={16} /></button>
                        <button onClick={() => toggleActivo(e)} title={e.es_activo ? "Desactivar" : "Activar"}
                          className={`p-1.5 rounded-lg ${e.es_activo ? "text-gray-400 hover:text-red-600 hover:bg-red-50" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}>
                          {e.es_activo ? <Ban size={16} /> : <CircleCheck size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cerrar</button>
        </div>
      </div>

      {/* Modal Nueva / Editar */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-base font-semibold text-gray-900">{form.modo === "nuevo" ? "Nueva empresa" : "Editar empresa"}</div>
              <button onClick={() => setForm(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nombre <span className="text-red-500">*</span></label>
                <input className={INP} value={form.nombre} onChange={(ev) => setForm((f) => ({ ...f, nombre: ev.target.value }))} placeholder="SL Agrícola, CACO…" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Base de datos (company) de SAP</label>
                <input className={INP} value={form.sap_company_db} onChange={(ev) => setForm((f) => ({ ...f, sap_company_db: ev.target.value }))} placeholder="Ej. SBO_CACO_PROD" />
                <div className="text-[11px] text-gray-400 mt-1">El nombre técnico de la company en SAP. No se crea nada en SAP; solo se guarda a cuál conectarse.</div>
              </div>
              <div className="text-[11px] text-gray-400">Los cultivos que maneja cada persona se asignan por usuario (botón “Cultivos y proyectos”), no por empresa.</div>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                {guardando ? "Guardando…" : form.modo === "nuevo" ? "Crear empresa" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Diagnóstico de órdenes SAP (solo lectura) */}
      {diag && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <div>
                <div className="text-base font-semibold text-gray-900 inline-flex items-center gap-2"><Search size={16} /> Órdenes de SAP · {diag.empresa.nombre}</div>
                <div className="text-[11px] text-gray-400 font-mono">{diag.empresa.sap_company_db || "— sin company —"} · solo lectura</div>
              </div>
              <button onClick={() => setDiag(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {diag.cargando ? (
                <div className="text-center text-gray-400 py-8"><Loader2 className="inline animate-spin mr-1" size={16} /> Consultando SAP…</div>
              ) : diag.error ? (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{diag.error}</div>
              ) : !diag.data || diag.data.total === 0 ? (
                <div className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No se encontraron órdenes de fabricación en esta company (o SAP no respondió). Revisa que el <b>ruteo por empresa</b> esté activo y que la company tenga órdenes.
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-gray-500">
                    {diag.data.total} órdenes (las más recientes). El catálogo de temporadas solo usa las <b>liberadas</b>.
                  </div>
                  {/* Por estatus */}
                  <div>
                    <div className="text-xs font-bold text-gray-700 mb-1">Por estatus</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(diag.data.por_estatus || {}).map(([st, n]) => (
                        <span key={st} className={`text-[11px] px-2 py-0.5 rounded-full border ${st === "boposReleased" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          {st === "boposReleased" ? "Liberadas" : st === "boposClosed" ? "Cerradas" : st === "boposPlanned" ? "Planificadas" : st === "boposCancelled" ? "Canceladas" : st}: <b>{n}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Por item */}
                  <div>
                    <div className="text-xs font-bold text-gray-700 mb-1">Por item (producto) — <span className="font-normal text-gray-400">cada cultivo suele tener el suyo</span></div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                          <th className="text-left px-3 py-1.5 font-medium">Item</th>
                          <th className="text-center px-3 py-1.5 font-medium">Liberadas</th>
                          <th className="text-center px-3 py-1.5 font-medium">Total</th>
                          <th className="text-left px-3 py-1.5 font-medium">Cultivo</th>
                          <th className="text-left px-3 py-1.5 font-medium">Proyecto (ej.)</th>
                        </tr></thead>
                        <tbody>
                          {(diag.data.por_item || []).map((it) => (
                            <tr key={it.item} className="border-t border-gray-100">
                              <td className="px-3 py-1.5 font-mono text-gray-700">{it.item}</td>
                              <td className="px-3 py-1.5 text-center font-semibold text-green-700">{it.liberadas}</td>
                              <td className="px-3 py-1.5 text-center text-gray-500">{it.total}</td>
                              <td className="px-3 py-1.5 text-gray-600">{it.cultivoEjemplo || "—"}</td>
                              <td className="px-3 py-1.5 text-gray-600">{it.proyectoEjemplo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* Por proyecto */}
                  <div>
                    <div className="text-xs font-bold text-gray-700 mb-1">Por proyecto (temporada)</div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                          <th className="text-left px-3 py-1.5 font-medium">Proyecto</th>
                          <th className="text-center px-3 py-1.5 font-medium">Liberadas</th>
                          <th className="text-center px-3 py-1.5 font-medium">Total</th>
                          <th className="text-left px-3 py-1.5 font-medium">Item (ej.)</th>
                        </tr></thead>
                        <tbody>
                          {(diag.data.por_proyecto || []).map((pr) => (
                            <tr key={pr.proyecto} className="border-t border-gray-100">
                              <td className="px-3 py-1.5 text-gray-700">{pr.proyecto}</td>
                              <td className="px-3 py-1.5 text-center font-semibold text-green-700">{pr.liberadas}</td>
                              <td className="px-3 py-1.5 text-center text-gray-500">{pr.total}</td>
                              <td className="px-3 py-1.5 font-mono text-gray-600">{pr.itemEjemplo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setDiag(null)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
