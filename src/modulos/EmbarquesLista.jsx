import { useState, useEffect, useCallback } from "react";
import { Truck, RefreshCw, Loader2, Check, Package, Send, AlertTriangle, X } from "lucide-react";
import { getEmbarques, reintentarEntregasEmbarque, getStockEmbarque, getEmbarqueDetalle, actualizarManifiestoEmbarque } from "../store/api";

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
  const [detalle, setDetalle] = useState(null); // embarque abierto (drawer)
  const [cargandoDet, setCargandoDet] = useState(false);
  const [guardandoMan, setGuardandoMan] = useState(null); // ovEntry cuyo nº de manifiesto se está guardando

  const guardarManifiesto = useCallback(async (id, ovEntry, numero) => {
    setGuardandoMan(ovEntry);
    try {
      await actualizarManifiestoEmbarque(id, ovEntry, numero);
      const d = await getEmbarqueDetalle(id);                       // refresca el drawer (nº + estado)
      setDetalle((prev) => (prev && prev.id === id ? d : prev));
      // refresca el badge "Falta manifiesto" de la LISTA con el detalle recién traído (¿alguna OV sin nº?)
      const faltaMan = (d?.manifiestos || []).some((m) => !String(m.numero || "").trim());
      setEmbarques((prev) => prev.map((e) => (e.id === id ? { ...e, faltaManifiesto: faltaMan } : e)));
    } catch (e) { setError(e?.message || "No se pudo guardar el nº de manifiesto."); }
    finally { setGuardandoMan(null); }
  }, []);

  const abrir = useCallback(async (id) => {
    setDetalle({ id }); setCargandoDet(true);
    try { const d = await getEmbarqueDetalle(id); setDetalle(d); }
    catch { setDetalle(null); }
    finally { setCargandoDet(false); }
  }, []);

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
    try {
      await reintentarEntregasEmbarque(e.id);
      await cargar();
      // si el drawer de este embarque está abierto, refréscalo (functional setter → sin dep de `detalle`)
      try { const d = await getEmbarqueDetalle(e.id); setDetalle((prev) => (prev && prev.id === e.id ? d : prev)); } catch { /* */ }
    }
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
                  <tr key={e.id} onClick={() => abrir(e.id)} className="hover:bg-gray-50 cursor-pointer">
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
                      <div className="flex flex-col gap-1 items-start">
                      {e.completo ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1.5"><Check size={13} /> En SAP</span>
                      ) : (() => {
                        const st = stocks[e.id];
                        const listo = st?.listo === true;         // SÉ que hay stock
                        const faltaStock = st && st.listo === false; // SÉ que falta
                        const cargandoStock = st === undefined;    // aún consultando
                        const detalle = st?.items?.length
                          ? st.items.map((i) => `${i.pt}: hay ${i.hay} / necesita ${i.necesita}${i.ok ? " ✓" : " ✗"}`).join("\n")
                          : "";
                        // se bloquea el botón mientras carga o mientras falte stock (para no picar a cada rato)
                        const bloqueado = cargandoStock || faltaStock || accion === e.id;
                        return (
                          <div className="flex items-center gap-2">
                            {cargandoStock ? (
                              <span className="text-[11px] font-semibold text-gray-400 inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> stock…</span>
                            ) : listo ? (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5" title={detalle}><Check size={12} /> Stock listo</span>
                            ) : faltaStock ? (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 inline-flex items-center gap-1.5 whitespace-nowrap" title={detalle}><AlertTriangle size={12} /> Falta stock</span>
                            ) : (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap" title="No se pudo leer el stock">Sin entrega</span>
                            )}
                            <button onClick={(ev) => { ev.stopPropagation(); generarEntregas(e); }} disabled={bloqueado}
                              title={faltaStock ? "Falta stock: espera a que producción registre los pallets en SAP" : "Generar las entregas (ya hay stock)"}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 ${
                                bloqueado ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"
                              }`}>
                              {accion === e.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Generar entregas
                            </button>
                          </div>
                        );
                      })()}
                      {e.faltaManifiesto ? (
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 inline-flex items-center gap-1 whitespace-nowrap"
                          title="Alguna OV no tiene número de manifiesto. Ábrelo para capturarlo (mientras la entrega esté abierta).">
                          <AlertTriangle size={11} /> Falta manifiesto
                        </span>
                      ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detalle ? (
        <DrawerEmbarque d={detalle} cargando={cargandoDet} accion={accion} onGenerar={generarEntregas} onClose={() => setDetalle(null)}
          onGuardarManifiesto={guardarManifiesto} guardandoMan={guardandoMan} />
      ) : null}
    </div>
  );
}

// Un renglón de manifiesto (por OV): input editable del nº mientras la Entrega esté ABIERTA; si ya está
// cerrada, read-only. El input viene prellenado con el nº de la creación (no doble captura).
function ManifiestoRow({ m, embId, onGuardar, guardando }) {
  const [val, setVal] = useState(m.numero || "");
  useEffect(() => { setVal(m.numero || ""); }, [m.numero]);
  const cerrada = m.entregada && !m.entregaAbierta;                 // Entrega existe pero cerrada → no editable
  const guardandoEsta = guardando === m.ovEntry;
  return (
    <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2">
      <div className="min-w-0">
        <div className="font-semibold text-gray-800 text-[13px] truncate">{m.cardName || m.cardCode}</div>
        <div className="font-mono text-[11px] text-gray-400">OV {m.ovNum}
          {m.entregaDocNum ? <span className="text-emerald-600 font-semibold"> · Entrega #{m.entregaDocNum}</span> : <span className="text-gray-300"> · sin entrega</span>}
        </div>
      </div>
      {cerrada ? (
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Nº manifiesto</div>
          {m.numero ? <div className="font-mono font-bold text-sm text-gray-800">{m.numero}</div>
                    : <div className="text-[11px] text-amber-600 font-semibold">sin número</div>}
          <div className="text-[10px] text-gray-400">entrega cerrada · ya no se edita</div>
        </div>
      ) : (
        <div className="shrink-0 flex items-center gap-2">
          {!m.numero ? <span className="text-[10px] text-amber-600 font-bold uppercase" title="Falta el nº de manifiesto">falta</span> : null}
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Nº manifiesto"
            className="w-32 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:border-emerald-500 outline-none" />
          <button onClick={() => onGuardar(embId, m.ovEntry, val.trim())} disabled={guardandoEsta || !val.trim()}
            title="Guardar y sellar el nº en la Entrega"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
            {guardandoEsta ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Guardar
          </button>
        </div>
      )}
    </div>
  );
}

function DrawerEmbarque({ d, cargando, accion, onGenerar, onClose, onGuardarManifiesto, guardandoMan }) {
  const pend = d.entregasPendientes;
  const listo = (d.pts || []).length && d.pts.every((p) => p.ok);
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[min(560px,95vw)] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">
        <div className="px-5 pt-5 pb-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <div className="font-mono font-extrabold text-2xl text-gray-800 leading-none">Embarque #{d.folio || "—"}</div>
            <div className="text-xs text-gray-400 font-semibold mt-1">Camión · pallets · entregas</div>
          </div>
          <div className="flex items-center gap-2">
            {d.completo
              ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1.5"><Check size={13} /> En SAP</span>
              : <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">{pend ? `${pend} sin entrega` : "Sin entrega"}</span>}
            <button onClick={onClose} className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 grid place-items-center hover:text-red-500 hover:border-red-300"><X size={17} /></button>
          </div>
        </div>

        {cargando || !d.pts ? (
          <div className="flex-1 grid place-items-center text-gray-400"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando…</span></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* transporte + resumen */}
            <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
              {[["Transportista", `Línea ${d.linea || "—"}`], ["Agente aduanal", d.agente || "—"],
                ["Flete", d.flete != null ? `$${Number(d.flete).toLocaleString("es-MX")}` : "—"],
                ["Anticipo", d.anticipo != null ? `$${Number(d.anticipo).toLocaleString("es-MX")}` : "—"],
                ["Cajas", (d.cajas || 0).toLocaleString("es-MX")], ["Pallets", d.nPallets],
                ["OVs", (d.ovs || []).join(", ") || "—"], ["Creado por", d.creadoPor || "—"]].map(([k, v]) => (
                <div key={k}><div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k}</div><div className="font-semibold text-sm text-gray-800 break-words">{v}</div></div>
              ))}
            </div>

            {/* manifiestos (nº por OV) */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Manifiestos · nº por OV</div>
              <div className="space-y-2">
                {(d.manifiestos || []).map((m) => (
                  <ManifiestoRow key={m.ovEntry} m={m} embId={d.id} onGuardar={onGuardarManifiesto} guardando={guardandoMan} />
                ))}
              </div>
            </div>

            {/* PTs y stock */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center justify-between">
                <span>Productos y stock</span>
                {!d.completo ? (listo ? <span className="text-emerald-600 inline-flex items-center gap-1"><Check size={12} /> stock listo</span> : <span className="text-amber-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> falta stock</span>) : null}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-[10.5px] uppercase tracking-wide text-gray-400 font-bold">
                    <th className="text-left px-3 py-2">PT</th><th className="text-right px-3 py-2">Cajas</th><th className="text-right px-3 py-2">Stock</th><th className="text-center px-3 py-2">¿Alcanza?</th>
                  </tr></thead>
                  <tbody>
                    {d.pts.map((p) => (
                      <tr key={p.pt} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono font-bold text-gray-800">{p.pt}</td>
                        <td className="px-3 py-2 text-right font-mono">{Number(p.cajas).toLocaleString("es-MX")}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${p.ok ? "text-emerald-700" : "text-amber-700"}`}>{Number(p.hay).toLocaleString("es-MX")}</td>
                        <td className="px-3 py-2 text-center">{p.ok ? <Check size={15} className="inline text-emerald-600" /> : <span className="text-amber-600 font-bold">✗</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[11px] text-gray-400 mt-1.5">Stock del almacén de PT en SAP. "¿Alcanza?" compara las cajas del embarque contra el stock disponible.</div>
            </div>

            {/* pallets */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Pallets · {(d.pallets || []).length}</div>
              <div className="flex flex-wrap gap-1.5">
                {(d.pallets || []).map((p) => (
                  <span key={`${p.folio}-${p.position}`} className={`font-mono text-[11px] font-medium border rounded px-2 py-0.5 ${p.entregada ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-500"}`} title={`${p.pt} · ${p.cajas} cajas · lote ${p.lote || "—"} · OV ${p.ovNum}${p.entregada ? " · entregado" : ""}`}>
                    {p.folio}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {!d.completo && d.pts ? (
          <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50">
            <button onClick={() => onGenerar({ id: d.id })} disabled={accion === d.id || !listo}
              title={listo ? "Generar las entregas (ya hay stock)" : "Falta stock: espera a que producción registre los pallets en SAP"}
              className={`w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm ${(accion === d.id || !listo) ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
              {accion === d.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Generar entregas
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
