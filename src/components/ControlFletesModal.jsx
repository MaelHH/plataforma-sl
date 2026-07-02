import { useState } from "react";
import { RefreshCw, FileText, X, Receipt } from "lucide-react";
import * as XLSX from "xlsx";
import SearchSelect from "./SearchSelect";
import { getFletesSAP } from "../store/api";

const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
const LBL = "text-xs text-gray-500 block mb-0.5";
const FL_ESTADO = {
  creada: { txt: "Creada", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  entrada: { txt: "Con entrada", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  facturada: { txt: "Facturada", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pagada: { txt: "Pagada", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};
const fmtMoney = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Modal de Control de fletes de acarreo (SAP, SOLO LECTURA). Se usa en M8 (tipo="fruta")
// y en M13 (tipo="material") para que cada módulo lleve su propio apartado.
export default function ControlFletesModal({ tipo, proyectos = [], onClose }) {
  const [project, setProject] = useState("");
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const titulo = tipo === "material" ? "Material" : "Fruta";

  const cargar = async () => {
    if (!project) { setError("Elige un proyecto."); return; }
    setCargando(true); setError("");
    try { setData(await getFletesSAP(project, tipo)); }
    catch (e) { setError(String(e?.message || e)); setData(null); }
    finally { setCargando(false); }
  };
  const exportar = () => {
    const rows = (data?.fletes || []).map((f) => ({
      Pedido: f.docNum, Proveedor: f.proveedor, Fecha: f.fecha,
      "Precio (s/IVA)": f.subtotal, IVA: f.iva, "Total (c/IVA)": f.total,
      Estado: (FL_ESTADO[f.estado] || {}).txt || f.estado, Factura: f.factura || "",
    }));
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Fletes ${titulo}`);
    XLSX.writeFile(wb, `fletes-${tipo}-${(project || "proyecto").replace(/[^\w-]/g, "_")}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1"><Receipt size={16} /> Control de fletes · {titulo} (SAP)</div>
            <div className="text-xs text-gray-500 mt-0.5">Órdenes de compra de acarreo de {titulo.toLowerCase()} por proyecto · solo lectura</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 inline-flex items-center"><X size={16} /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex items-end gap-2 flex-wrap">
          <div className="min-w-[240px]">
            <label className={LBL}>Proyecto</label>
            <SearchSelect className={INP} value={project} onChange={setProject} placeholder="— Elige proyecto —"
              options={proyectos.map((p) => ({ value: p.code, label: p.nombre }))} />
          </div>
          <button onClick={cargar} disabled={cargando} className="text-xs px-3 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1">
            {cargando ? "Consultando…" : <span className="inline-flex items-center gap-1"><RefreshCw size={14} /> Traer de SAP</span>}
          </button>
          {data?.fletes?.length ? (
            <button onClick={exportar} className="text-xs px-3 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 inline-flex items-center gap-1"><FileText size={14} /> Excel</button>
          ) : null}
        </div>

        {error && <div className="px-5 py-2 text-[11px] text-red-600">No se pudo consultar SAP: {error}</div>}

        {data?.totales && (
          <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-5 gap-2 border-b border-gray-100">
            <div className="rounded-lg border border-gray-200 px-3 py-2"><div className="text-[10px] text-gray-500 uppercase">Subtotal (s/IVA)</div><div className="text-sm font-semibold text-gray-800">{fmtMoney(data.totales.subtotal)}</div></div>
            <div className="rounded-lg border border-gray-200 px-3 py-2"><div className="text-[10px] text-gray-500 uppercase">IVA</div><div className="text-sm font-semibold text-gray-800">{fmtMoney(data.totales.iva)}</div></div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2"><div className="text-[10px] text-blue-600 uppercase">Total (c/IVA)</div><div className="text-sm font-bold text-blue-700">{fmtMoney(data.totales.total)}</div></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><div className="text-[10px] text-amber-600 uppercase">Por pagar</div><div className="text-sm font-bold text-amber-700">{fmtMoney(data.totales.porPagar)}</div></div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><div className="text-[10px] text-emerald-600 uppercase">Pagado</div><div className="text-sm font-bold text-emerald-700">{fmtMoney(data.totales.pagado)}</div></div>
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 py-3">
          {!data ? (
            <div className="text-xs text-gray-400 italic py-8 text-center">Elige un proyecto y da clic en "Traer de SAP".</div>
          ) : data.fletes.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-8 text-center">No hay OC de acarreo de {titulo.toLowerCase()} para ese proyecto.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-2">Pedido</th><th className="py-2 pr-2">Proveedor</th><th className="py-2 pr-2">Fecha</th>
                  <th className="py-2 pr-2 text-right">Precio</th><th className="py-2 pr-2 text-right">IVA</th>
                  <th className="py-2 pr-2 text-right">Total</th><th className="py-2 pr-2">Estado</th><th className="py-2 pr-2">Factura</th>
                </tr>
              </thead>
              <tbody>
                {data.fletes.map((f) => {
                  const e = FL_ESTADO[f.estado] || FL_ESTADO.creada;
                  return (
                    <tr key={f.docEntry} className="border-b border-gray-100">
                      <td className="py-2 pr-2 font-semibold text-gray-800">#{f.docNum}</td>
                      <td className="py-2 pr-2 text-gray-700">{f.proveedor}</td>
                      <td className="py-2 pr-2 text-gray-500">{f.fecha}</td>
                      <td className="py-2 pr-2 text-right text-gray-700">{fmtMoney(f.subtotal)}</td>
                      <td className="py-2 pr-2 text-right text-gray-500">{fmtMoney(f.iva)}</td>
                      <td className="py-2 pr-2 text-right font-semibold text-gray-800">{fmtMoney(f.total)}</td>
                      <td className="py-2 pr-2"><span className={`px-2 py-0.5 rounded-full border text-[10px] ${e.cls}`}>{e.txt}</span></td>
                      <td className="py-2 pr-2 text-gray-600">{f.factura ? `#${f.factura}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
