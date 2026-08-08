import { useState, useEffect, useRef } from "react";
import { RefreshCw, FileText, ArrowLeft, Receipt } from "lucide-react";
import SearchSelect from "./SearchSelect";
import { getFletesSAP, getState, putState } from "../store/api";
import { useAuth } from "../store/auth";
import { exportarFletesExcel } from "../utils/exportFletes";

const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white";
const LBL = "text-xs text-gray-500 block mb-1";
const FL_ESTADO = {
  creada: { txt: "Creada", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  entrada: { txt: "Con entrada", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  facturada: { txt: "Falta pago", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pagada: { txt: "Pagada", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};
const fmtMoney = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Página (SOLO LECTURA) de Control de fletes de acarreo (SAP). Se abre DENTRO de su módulo:
// M8 con tipo="fruta" y M13 con tipo="material" — independientes. `onBack` regresa al módulo.
export default function ControlFletesPagina({ tipo, proyectos = [], onBack }) {
  const [project, setProject] = useState("");
  // Alcance por usuario (§2.1): el selector de proyecto solo ofrece los proyectos asignados.
  const { alcance } = useAuth();
  const proyectosAsignados = new Set(alcance?.proyectos || []);
  const acotado = proyectosAsignados.size > 0;
  const proyectosVisibles = acotado ? proyectos.filter((p) => proyectosAsignados.has(p.code)) : proyectos;
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const titulo = tipo === "material" ? "Material" : "Fruta";

  // Folio por pedido: se guarda en la BD (state singleton "folios_fletes"), mapa {docEntry: folio}.
  // Global y persistente → sigue ahí aunque vuelvas a "Traer de SAP". docEntry = clave estable del pedido.
  const [folios, setFolios] = useState({});
  const foliosRef = useRef(folios);
  useEffect(() => { foliosRef.current = folios; }, [folios]);
  useEffect(() => {
    let vivo = true;
    getState("folios_fletes").then((m) => { if (vivo && m && typeof m === "object") setFolios(m); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const guardarFolios = () => { putState("folios_fletes", foliosRef.current).catch(() => {}); };

  const cargar = async () => {
    if (!project) { setError("Elige un proyecto."); return; }
    setCargando(true); setError("");
    try { setData(await getFletesSAP(project, tipo)); }
    catch (e) { setError(String(e?.message || e)); setData(null); }
    finally { setCargando(false); }
  };
  const [exportando, setExportando] = useState(false);
  const exportar = async () => {
    if (!data?.fletes?.length) return;
    setExportando(true);
    try { await exportarFletesExcel(data, { tipo, project, folios }); }
    catch (e) { setError("No se pudo generar el Excel: " + String(e?.message || e)); }
    finally { setExportando(false); }
  };

  return (
    <div className="space-y-4">
      {/* Encabezado con botón Regresar */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-sm px-3 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1.5">
          <ArrowLeft size={15} /> Regresar
        </button>
        <div>
          <div className="text-base font-semibold text-gray-900 inline-flex items-center gap-1.5"><Receipt size={18} /> Control de fletes · {titulo} (SAP)</div>
          <div className="text-xs text-gray-500">Órdenes de compra de acarreo de {titulo.toLowerCase()} por proyecto · solo lectura</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-auto sm:min-w-[260px]">
          <label className={LBL}>Proyecto</label>
          <SearchSelect className={INP} value={project} onChange={setProject} placeholder="— Elige proyecto —"
            options={proyectosVisibles.map((p) => ({ value: p.code, label: p.nombre }))} />
        </div>
        <button onClick={cargar} disabled={cargando}
          className="text-sm px-3 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          <RefreshCw size={15} className={cargando ? "animate-spin" : ""} /> {cargando ? "Consultando…" : "Traer de SAP"}
        </button>
        {data?.fletes?.length ? (
          <button onClick={exportar} disabled={exportando}
            className="text-sm px-3 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            <FileText size={15} /> {exportando ? "Generando…" : "Excel"}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-600">No se pudo consultar SAP: {error}</div>
      )}

      {/* Totales */}
      {data?.totales && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3"><div className="text-[10px] text-gray-500 uppercase tracking-wide">Subtotal (s/IVA)</div><div className="text-lg font-semibold text-gray-800">{fmtMoney(data.totales.subtotal)}</div></div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3"><div className="text-[10px] text-gray-500 uppercase tracking-wide">IVA</div><div className="text-lg font-semibold text-gray-800">{fmtMoney(data.totales.iva)}</div></div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"><div className="text-[10px] text-blue-600 uppercase tracking-wide">Total (c/IVA)</div><div className="text-lg font-bold text-blue-700">{fmtMoney(data.totales.total)}</div></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><div className="text-[10px] text-amber-600 uppercase tracking-wide">Por pagar</div><div className="text-lg font-bold text-amber-700">{fmtMoney(data.totales.porPagar)}</div></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"><div className="text-[10px] text-emerald-600 uppercase tracking-wide">Pagado</div><div className="text-lg font-bold text-emerald-700">{fmtMoney(data.totales.pagado)}</div></div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {!data ? (
          <div className="text-sm text-gray-400 italic py-16 text-center">Elige un proyecto y da clic en "Traer de SAP".</div>
        ) : data.fletes.length === 0 ? (
          <div className="text-sm text-gray-400 italic py-16 text-center">No hay OC de acarreo de {titulo.toLowerCase()} para ese proyecto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 bg-gray-50">
                  <th className="py-2.5 px-3">Pedido</th><th className="py-2.5 px-3">Proveedor</th><th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3 text-right">Precio</th><th className="py-2.5 px-3 text-right">IVA</th>
                  <th className="py-2.5 px-3 text-right">Total</th><th className="py-2.5 px-3">Estado</th><th className="py-2.5 px-3">Factura</th>
                  <th className="py-2.5 px-3">Folio</th>
                </tr>
              </thead>
              <tbody>
                {data.fletes.map((f) => {
                  const e = FL_ESTADO[f.estado] || FL_ESTADO.creada;
                  return (
                    <tr key={f.docEntry} className="border-b border-gray-100 hover:bg-gray-50/60">
                      <td className="py-2.5 px-3 font-semibold text-gray-800">#{f.docNum}</td>
                      <td className="py-2.5 px-3 text-gray-700">{f.proveedor}</td>
                      <td className="py-2.5 px-3 text-gray-500">{f.fecha}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">{fmtMoney(f.subtotal)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-500">{fmtMoney(f.iva)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-gray-800">{fmtMoney(f.total)}</td>
                      <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full border text-[10px] ${e.cls}`}>{e.txt}</span></td>
                      <td className="py-2.5 px-3 text-gray-600">{f.factura ? `#${f.factura}` : "—"}</td>
                      <td className="py-2.5 px-3">
                        <input value={folios[f.docEntry] || ""}
                          onChange={(ev) => setFolios((p) => ({ ...p, [f.docEntry]: ev.target.value }))}
                          onBlur={guardarFolios}
                          placeholder="—"
                          className="w-24 text-sm px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.fletes?.length ? (
        <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-4 gap-y-1 px-1">
          <span><b className="text-emerald-700">Pagada</b> = tiene pago efectuado en SAP.</span>
          <span><b className="text-amber-700">Falta pago</b> = tiene factura y entrada, pero <b>aún no se paga</b>.</span>
          <span><b className="text-blue-700">Con entrada</b> = sin factura todavía.</span>
          <span><b className="text-gray-600">Creada</b> = solo el pedido.</span>
        </div>
      ) : null}
    </div>
  );
}
