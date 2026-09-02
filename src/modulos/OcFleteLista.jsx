import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Check, X, FileText } from "lucide-react";
import { getOcsFlete } from "../store/api";

// Listado de OC de flete creadas por la app + su estado REAL en SAP: Pedido (Abierta/Cerrada),
// entrada de mercancía y factura. Solo lectura. Ver [[oc-flete-desde-manifiesto]].

const money = (n) => (n == null ? "—" : Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const fmtFecha = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }); } catch { return iso; } };

// Pastilla sí / no / desconocido (— cuando SAP no pudo confirmarlo).
function Flag({ v, siTxt, noTxt }) {
  if (v === true) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1"><Check size={12} /> {siTxt}</span>;
  if (v === false) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 inline-flex items-center gap-1"><X size={12} /> {noTxt}</span>;
  return <span className="text-[11px] font-semibold text-gray-300" title="No se pudo confirmar en SAP">—</span>;
}

export default function OcFleteLista() {
  const [ocs, setOcs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const r = await getOcsFlete(); setOcs(Array.isArray(r?.ocs) ? r.ocs : []); setError(""); }
    catch (e) { setError(e?.message || "No se pudieron cargar las OC de flete."); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-gray-700 flex items-center gap-2"><FileText size={16} className="text-emerald-600" /> OC de flete creadas <span className="text-gray-400 font-semibold">· {ocs.length}</span></div>
        <button onClick={cargar} title="Recargar" className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-100 border border-gray-200"><RefreshCw size={16} className={cargando ? "animate-spin" : ""} /></button>
      </div>
      {error ? <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-gray-50">
                {["OC", "Manifiesto", "Proveedor", "Total", "Pedido", "Entrada mercancía", "Facturada"].map((h, i) => (
                  <th key={h} className={`text-[10.5px] font-bold uppercase tracking-wide text-gray-400 px-3.5 py-3 border-b border-gray-200 whitespace-nowrap ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={7} className="text-center text-gray-400 py-12"><Loader2 size={26} className="mx-auto mb-2 animate-spin text-gray-300" />Consultando SAP…</td></tr>
              ) : !ocs.length ? (
                <tr><td colSpan={7} className="text-center text-gray-400 py-12"><FileText size={28} className="mx-auto mb-2 text-gray-300" />Aún no hay OC de flete creadas.</td></tr>
              ) : ocs.map((o) => (
                <tr key={o.docEntry} className="hover:bg-gray-50">
                  <td className="px-3.5 py-3 border-b border-gray-100"><span className="font-mono font-bold text-[14px] text-gray-800">{o.docNum ? `#${o.docNum}` : "—"}</span><div className="text-[10px] text-gray-400">{fmtFecha(o.creada)}</div></td>
                  <td className="px-3.5 py-3 border-b border-gray-100 font-mono text-[12.5px] text-gray-700">{o.manifiesto || "—"}</td>
                  <td className="px-3.5 py-3 border-b border-gray-100 text-[12.5px] text-gray-700">{o.proveedor || "—"}</td>
                  <td className="px-3.5 py-3 border-b border-gray-100 text-right font-mono font-bold text-[13px] text-gray-800">{money(o.total != null ? o.total : o.importe)}</td>
                  <td className="px-3.5 py-3 border-b border-gray-100">
                    {o.estado === "Cerrada" ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Cerrada</span>
                      : o.estado === "Abierta" ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Abierta</span>
                      : <span className="text-[11px] text-gray-300">—</span>}
                  </td>
                  <td className="px-3.5 py-3 border-b border-gray-100"><Flag v={o.entrada} siTxt="Sí" noTxt="No" /></td>
                  <td className="px-3.5 py-3 border-b border-gray-100"><Flag v={o.factura} siTxt="Facturada" noTxt="Pendiente" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[11px] text-gray-400">El estado del <b>Pedido</b> (Abierta/Cerrada) viene directo de SAP. "Entrada de mercancía" y "Facturada" también se consultan de SAP; si tu Service Layer no permite esa consulta, salen "—" y la facturación se infiere del cierre del Pedido.</div>
    </div>
  );
}
