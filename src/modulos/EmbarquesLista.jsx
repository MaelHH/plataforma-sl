import { useState, useEffect, useCallback } from "react";
import { Truck, RefreshCw, Loader2, Check, Package, Send, AlertTriangle } from "lucide-react";
import { getEmbarques, reintentarEntregasEmbarque, getStockEmbarque } from "../store/api";

// Lista de EMBARQUES creados desde la app (como la "Lista de embarques" del AddOn): folio, camión,
// OVs, cajas, pallets, fecha. Solo lectura de la BD.

const fmtFecha = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }); }
  catch { return iso; }
};

export default function EmbarquesLista() {
  const [embarques, setEmbarques] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [accion, setAccion] = useState(null);   // id del embarque generando entregas
  const [stocks, setStocks] = useState({});     // id → { listo, items } (detector de stock)

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await getEmbarques();
      const list = Array.isArray(r?.embarques) ? r.embarques : [];
      setEmbarques(list); setError("");
      // detector de stock solo para los embarques que aún NO están completos
      const pend = list.filter((e) => !e.completo);
      const res = await Promise.all(pend.map((e) => getStockEmbarque(e.id).then((s) => [e.id, s]).catch(() => [e.id, null])));
      setStocks(Object.fromEntries(res));
    } catch (e) { setError(e?.message || "No se pudieron cargar los embarques."); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const generarEntregas = useCallback(async (e) => {
    setAccion(e.id);
    try { await reintentarEntregasEmbarque(e.id); await cargar(); }
    catch (err) { setError(err?.message || "No se pudieron generar las entregas."); }
    finally { setAccion(null); }
  }, [cargar]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-gray-700 flex items-center gap-2"><Truck size={16} className="text-emerald-600" /> Embarques creados <span className="text-gray-400 font-semibold">· {embarques.length}</span></div>
        <button onClick={cargar} title="Recargar" className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-100 border border-gray-200"><RefreshCw size={16} className={cargando ? "animate-spin" : ""} /></button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-gray-50">
                {["Embarque", "Fecha", "Transportista", "Productos", "Cajas", "Pallets", "OVs", "Estado"].map((h, i) => (
                  <th key={h} className={`text-[10.5px] font-bold uppercase tracking-wide text-gray-400 px-3.5 py-3 border-b border-gray-200 whitespace-nowrap ${i === 4 || i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando && !embarques.length ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-12"><Loader2 size={16} className="inline animate-spin mr-2" />Cargando embarques…</td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="text-center text-red-600 py-10">{error}</td></tr>
              ) : !embarques.length ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-12"><Package size={30} className="mx-auto mb-2 text-gray-300" />Aún no hay embarques. Créalos con <b>Nuevo embarque</b>.</td></tr>
              ) : (
                embarques.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-3.5 py-3 border-b border-gray-100"><span className="font-mono font-bold text-[15px] text-gray-800">{e.folio ? `#${e.folio}` : "—"}</span></td>
                    <td className="px-3.5 py-3 border-b border-gray-100 font-mono text-[12.5px] text-gray-500">{fmtFecha(e.fecha || e.creada)}</td>
                    <td className="px-3.5 py-3 border-b border-gray-100"><div className="font-semibold text-gray-800 text-[13px]">Línea {e.linea || "—"}</div>{e.agente ? <div className="text-[11px] text-gray-400">{e.agente}</div> : null}</td>
                    <td className="px-3.5 py-3 border-b border-gray-100">
                      <div className="flex gap-1 flex-wrap max-w-[190px]">
                        {(e.productos || []).slice(0, 3).map((p) => <span key={p} className="font-mono text-[10.5px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{p}</span>)}
                        {(e.productos || []).length > 3 ? <span className="font-mono text-[10.5px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">+{e.productos.length - 3}</span> : null}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 border-b border-gray-100 text-right font-mono font-bold text-[15px] text-gray-800">{(e.cajas || 0).toLocaleString("es-MX")}</td>
                    <td className="px-3.5 py-3 border-b border-gray-100 text-right font-mono font-bold text-[15px] text-gray-800">{e.nPallets}</td>
                    <td className="px-3.5 py-3 border-b border-gray-100 font-mono text-[12px] text-gray-500">{(e.ovs || []).join(", ") || "—"}</td>
                    <td className="px-3.5 py-3 border-b border-gray-100">
                      {e.completo ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1.5"><Check size={13} /> En SAP</span>
                      ) : (() => {
                        const st = stocks[e.id];
                        const listo = st?.listo;
                        const detalle = st?.items?.length
                          ? st.items.map((i) => `${i.pt}: hay ${i.hay} / necesita ${i.necesita}${i.ok ? " ✓" : " ✗"}`).join("\n")
                          : "";
                        return (
                          <div className="flex items-center gap-2">
                            {st === undefined ? (
                              <span className="text-[11px] font-semibold text-gray-400 inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> stock…</span>
                            ) : listo ? (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5" title={detalle}><Check size={12} /> Stock listo</span>
                            ) : (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 inline-flex items-center gap-1.5 whitespace-nowrap" title={detalle}><AlertTriangle size={12} /> Falta stock</span>
                            )}
                            <button onClick={() => generarEntregas(e)} disabled={accion === e.id}
                              title={listo ? "Generar las entregas (ya hay stock)" : "Intentar generar las entregas (puede quedar pendiente por stock)"}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-60 inline-flex items-center gap-1.5 ${listo ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-emerald-600 text-emerald-700 hover:bg-emerald-50"}`}>
                              {accion === e.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Generar entregas
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
