import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Loader2, FileText, Check, AlertTriangle } from "lucide-react";
import { getManifiestosTablero } from "../store/api";

// Tablero UNIFICADO de manifiestos (Fase 1, solo lectura): los que están EN SAP (sellados desde un
// embarque) y los que están EN LA APP (creados sin PT en SAP, ruta de emergencia). Ver
// docs/plan-manifiestos-alternativo-y-pdf.md.

export default function ManifiestosTablero() {
  const [rows, setRows] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | sap | app

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const r = await getManifiestosTablero(); setRows(Array.isArray(r?.manifiestos) ? r.manifiestos : []); setError(""); }
    catch (e) { setError(e?.message || "No se pudieron cargar los manifiestos."); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const vis = useMemo(() => rows.filter((m) => filtro === "todos" || m.origen === filtro), [rows, filtro]);
  const nSap = useMemo(() => rows.filter((m) => m.origen === "sap").length, [rows]);
  const nApp = useMemo(() => rows.filter((m) => m.origen === "app").length, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm font-bold text-gray-700 flex items-center gap-2"><FileText size={16} className="text-emerald-600" /> Manifiestos <span className="text-gray-400 font-semibold">· {rows.length}</span></div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[["todos", `Todos (${rows.length})`], ["sap", `En SAP (${nSap})`], ["app", `En la app (${nApp})`]].map(([v, txt]) => (
              <button key={v} onClick={() => setFiltro(v)} className={`px-3 py-1.5 rounded-md text-[12px] font-bold ${filtro === v ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{txt}</button>
            ))}
          </div>
          <button onClick={cargar} title="Recargar" className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-100 border border-gray-200"><RefreshCw size={16} className={cargando ? "animate-spin" : ""} /></button>
        </div>
      </div>
      {error ? <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-gray-50">
                {["Folio", "Origen", "Cliente", "Embarque / OV", "Cajas", "Info manual", "Estado"].map((h, i) => (
                  <th key={h} className={`text-[10.5px] font-bold uppercase tracking-wide text-gray-400 px-3.5 py-3 border-b border-gray-200 whitespace-nowrap ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={7} className="text-center text-gray-400 py-12"><Loader2 size={26} className="mx-auto mb-2 animate-spin text-gray-300" />Cargando…</td></tr>
              ) : !vis.length ? (
                <tr><td colSpan={7} className="text-center text-gray-400 py-12"><FileText size={28} className="mx-auto mb-2 text-gray-300" />Sin manifiestos {filtro === "app" ? "en la app" : filtro === "sap" ? "en SAP" : "aún"}.</td></tr>
              ) : vis.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-3.5 py-3 border-b border-gray-100 font-mono font-bold text-[13.5px] text-gray-800">{m.folio || "—"}</td>
                  <td className="px-3.5 py-3 border-b border-gray-100">
                    {m.origen === "sap"
                      ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1"><Check size={12} /> En SAP</span>
                      : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 inline-flex items-center gap-1"><AlertTriangle size={12} /> En la app</span>}
                  </td>
                  <td className="px-3.5 py-3 border-b border-gray-100 text-[12.5px] text-gray-700">{m.cliente || "—"}</td>
                  <td className="px-3.5 py-3 border-b border-gray-100 font-mono text-[12px] text-gray-500">{m.embarqueFolio ? `#${m.embarqueFolio}` : "—"}{m.ovNum ? ` · OV ${m.ovNum}` : ""}</td>
                  <td className="px-3.5 py-3 border-b border-gray-100 text-right font-mono font-bold text-[13px] text-gray-800">{(m.cajas || 0).toLocaleString("es-MX")}</td>
                  <td className="px-3.5 py-3 border-b border-gray-100">{m.tieneInfo ? <span className="text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> Sí</span> : <span className="text-[11px] font-semibold text-amber-600">falta</span>}</td>
                  <td className="px-3.5 py-3 border-b border-gray-100 text-[11.5px] font-semibold text-gray-500 capitalize">{m.estado || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[11px] text-gray-400">Fase 1 (solo lectura): <b>En SAP</b> = manifiestos sellados en la Entrega desde un embarque · <b>En la app</b> = creados sin PT en SAP (ruta de emergencia). Próximo: capturar la info manual (sellos, camión, pesos…) y generar el PDF para todos.</div>
    </div>
  );
}
