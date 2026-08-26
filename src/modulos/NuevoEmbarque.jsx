import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Truck, Package, FileText, X, Check, Loader2, AlertCircle, Send, GripVertical, Building2,
} from "lucide-react";
import {
  getPalletsPorEmbarcar, getTransportistas, getConductores, getAgentesAduanales, crearEmbarqueSAP,
  getClienteDestino,
} from "../store/api";

// Nuevo embarque (Fase 6): 3 pestañas — Transporte (camión de catálogo), Pallets + distribución en el
// camión (Shift+click + arrastrar a posición), Manifiestos (uno por cliente, auto del destino). Crea todo
// en SAP con un POST idempotente. UX portada del mockup aprobado.

const CAP = 30;                                   // posiciones del camión
const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white";
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function NuevoEmbarque({ onClose, onCreated }) {
  const [tab, setTab] = useState(0);
  const [pallets, setPallets] = useState([]);
  const [transp, setTransp] = useState([]);
  const [conductores, setConductores] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [linea, setLinea] = useState("");
  const [flete, setFlete] = useState("0");
  const [anticipo, setAnticipo] = useState("0");
  const [agente, setAgente] = useState("");
  const [fecha, setFecha] = useState(hoyISO());

  const [bed, setBed] = useState(() => new Array(CAP).fill(null));   // posición → palletDet
  const [sel, setSel] = useState(() => new Set());                  // palletDet seleccionados
  const anchor = useRef({ last: null, state: false });
  const dragFrom = useRef(null);

  const [creando, setCreando] = useState(false);
  const [creado, setCreado] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, t, c, a] = await Promise.all([
          getPalletsPorEmbarcar(), getTransportistas(), getConductores(), getAgentesAduanales(),
        ]);
        setPallets(Array.isArray(p?.pallets) ? p.pallets : []);
        setTransp(Array.isArray(t?.value) ? t.value : []);
        setConductores(Array.isArray(c?.value) ? c.value : []);
        setAgentes(Array.isArray(a?.value) ? a.value : []);
        setError("");
      } catch (e) { setError(e?.message || "No se pudo cargar de SAP."); }
      finally { setCargando(false); }
    })();
  }, []);

  const byPd = useMemo(() => {
    const m = new Map(pallets.map((p) => [String(p.palletDet), p]));
    return (pd) => m.get(String(pd));
  }, [pallets]);
  const tp = useMemo(() => transp.find((t) => String(t.Code) === String(linea)), [transp, linea]);
  const conductor = useMemo(() => {
    if (!tp) return null;
    return conductores.find((c) => String(c.Code) === String(tp.U_Conductor));
  }, [tp, conductores]);

  const usados = useMemo(() => new Set(bed.filter((x) => x != null).map(String)), [bed]);
  const disponibles = useMemo(() => pallets.filter((p) => !usados.has(String(p.palletDet))), [pallets, usados]);
  const enCamion = useMemo(() => bed.map((pd, pos) => (pd != null ? { ...byPd(pd), position: pos } : null)).filter(Boolean), [bed, byPd]);
  const totCajas = useMemo(() => enCamion.reduce((a, p) => a + (p?.cajas || 0), 0), [enCamion]);
  const nSel = useMemo(() => [...sel].filter((pd) => !usados.has(String(pd))).length, [sel, usados]);
  const nextFree = () => bed.findIndex((x) => x == null);

  // agrupado por cliente (para la vista previa de manifiestos)
  const porCliente = useMemo(() => {
    const m = new Map();
    for (const p of enCamion) {
      const k = p.cardCode;
      if (!m.has(k)) m.set(k, { cardCode: k, cardName: p.cardName, cajas: 0, ovs: new Set(), pallets: 0 });
      const g = m.get(k); g.cajas += p.cajas || 0; g.ovs.add(p.ovNum); g.pallets += 1;
    }
    return [...m.values()];
  }, [enCamion]);

  // ── selección tipo OV ──
  const onRowClick = (e, pd) => {
    const vis = disponibles.map((p) => String(p.palletDet));
    if (e.shiftKey && anchor.current.last != null) {
      const a = vis.indexOf(String(anchor.current.last)), b = vis.indexOf(String(pd));
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        setSel((prev) => { const n = new Set(prev); for (let i = lo; i <= hi; i++) { if (anchor.current.state) n.add(vis[i]); else n.delete(vis[i]); } return n; });
        return;
      }
    }
    setSel((prev) => { const n = new Set(prev); const now = !n.has(String(pd)); if (now) n.add(String(pd)); else n.delete(String(pd)); anchor.current = { last: pd, state: now }; return n; });
  };
  const placeAt = (pos, pd) => setBed((prev) => {
    const n = [...prev];
    const cur = n.findIndex((x) => String(x) === String(pd)); if (cur >= 0) n[cur] = null;   // no duplicar
    if (n[pos] == null) n[pos] = pd;
    else { const occ = n[pos]; n[pos] = pd; const nf = n.findIndex((x) => x == null); if (nf >= 0) n[nf] = occ; }
    return n;
  });
  const placeNext = (pd) => { const i = nextFree(); if (i < 0) return; placeAt(i, pd); setSel((prev) => { const n = new Set(prev); n.delete(String(pd)); return n; }); };
  const acomodarSel = () => { let ids = disponibles.filter((p) => sel.has(String(p.palletDet))); setBed((prev) => { const n = [...prev]; for (const p of ids) { const f = n.findIndex((x) => x == null); if (f >= 0) n[f] = String(p.palletDet); } return n; }); setSel(new Set()); anchor.current.last = null; };
  const acomodarTodos = () => setBed((prev) => { const n = [...prev]; for (const p of disponibles) { const f = n.findIndex((x) => x == null); if (f >= 0) n[f] = String(p.palletDet); } return n; });
  const quitar = (pos) => setBed((prev) => { const n = [...prev]; n[pos] = null; return n; });

  // ── drag & drop en el camión ──
  const onDrop = (pos, e) => {
    e.preventDefault();
    let data = ""; try { data = e.dataTransfer.getData("text/plain"); } catch (_) { /* */ }
    if (data.indexOf("avail:") === 0) {                 // vino de la LISTA → a esa posición exacta
      placeAt(pos, data.slice(6));
    } else if (data.indexOf("bed:") === 0) {            // reordenar DENTRO del camión → mueve/intercambia
      const from = parseInt(data.slice(4), 10);
      if (!Number.isNaN(from) && from !== pos) {
        setBed((prev) => { const n = [...prev]; const t = n[pos]; n[pos] = n[from]; n[from] = t; return n; });
      }
    }
    dragFrom.current = null;
  };

  const crear = useCallback(async () => {
    if (!linea || !enCamion.length || creando) return;
    setCreando(true); setError("");
    try {
      const payload = {
        linea, flete: Number(flete) || 0, anticipo: Number(anticipo) || 0, agente, fecha,
        pallets: enCamion.map((p) => ({
          palletCode: p.palletCode, palletDet: p.palletDet, ovEntry: p.ovEntry, ovNum: p.ovNum,
          cardCode: p.cardCode, pt: p.pt, cajas: p.cajas, lote: p.lote, baseLine: p.baseLine, position: p.position,
        })),
      };
      const r = await crearEmbarqueSAP(payload);
      setCreado({ folio: r?.folio });
      onCreated?.(r);
    } catch (e) {
      setError((e?.sinRespuesta ? "Sin confirmación de SAP — verifica antes de reintentar. " : "") + (e?.message || "No se pudo crear el embarque."));
    } finally { setCreando(false); }
  }, [linea, flete, anticipo, agente, fecha, enCamion, creando, onCreated]);

  const TABS = [["Transporte", Truck], ["Pallets y distribución", Package], ["Manifiestos", FileText]];

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-40" onClick={creando ? undefined : onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center p-3 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-6xl bg-gray-50 rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[94vh]">
          {/* header */}
          <div className="px-5 py-3.5 border-b border-gray-200 bg-white rounded-t-2xl flex items-center gap-4 flex-wrap">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 grid place-items-center text-white shrink-0"><Truck size={19} /></div>
            <div><h2 className="text-base font-bold text-gray-800 leading-tight">Nuevo embarque</h2><p className="text-xs text-gray-500">Camión · pallets · manifiestos → SAP</p></div>
            <label className="flex flex-col gap-1 ml-2"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Fecha</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INP + " w-40 py-1.5"} /></label>
            <div className="ml-auto text-right leading-none"><div className="text-2xl font-bold text-gray-800 tabular-nums">{totCajas}</div><div className="text-[11px] text-gray-400 font-semibold">cajas · {enCamion.length} pallets</div></div>
            <button onClick={crear} disabled={!linea || !enCamion.length || creando}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm ${(!linea || !enCamion.length || creando) ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
              {creando ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} {creando ? "Creando…" : "Crear embarque"}
            </button>
            <button onClick={onClose} disabled={creando} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-40"><X size={18} /></button>
          </div>

          {/* tabs */}
          <div className="px-5 pt-3 bg-white flex gap-1">
            {TABS.map(([txt, Ic], i) => (
              <button key={txt} onClick={() => setTab(i)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-t-lg font-bold text-sm border-b-2 ${tab === i ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] ${tab === i ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-400"}`}>{i + 1}</span> <Ic size={15} /> {txt}
              </button>
            ))}
          </div>

          {/* body */}
          <div className="flex-1 overflow-y-auto p-4">
            {creado ? (
              <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-emerald-800 flex items-center gap-2"><Check size={16} /> Embarque creado en SAP · folio <b className="font-mono">#{creado.folio}</b> (cabecera + detalle + manifiesto + entrega).</div>
            ) : null}
            {error ? (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-700 flex items-start gap-2"><AlertCircle size={16} className="mt-0.5" /> {error}</div>
            ) : null}
            {cargando ? (
              <div className="py-16 text-center text-gray-400"><Loader2 size={18} className="inline animate-spin mr-2" />Cargando de SAP…</div>
            ) : tab === 0 ? (
              <Transporte {...{ transp, linea, setLinea, tp, conductor, flete, setFlete, anticipo, setAnticipo, agente, setAgente, agentes }} />
            ) : tab === 1 ? (
              <Distribucion {...{ disponibles, bed, sel, byPd, onRowClick, placeNext, acomodarSel, acomodarTodos, quitar, nSel, dragFrom, onDrop, totCajas }} />
            ) : (
              <Manifiestos porCliente={porCliente} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Transporte({ transp, linea, setLinea, tp, conductor, flete, setFlete, anticipo, setAnticipo, agente, setAgente, agentes }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 bg-white border border-gray-200 rounded-xl p-4">
      <div className="space-y-3">
        <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Línea (transportista) · de SAP</span>
          <select value={linea} onChange={(e) => setLinea(e.target.value)} className={INP + " mt-1"}>
            <option value="">— Elige transportista —</option>
            {transp.map((t) => <option key={t.Code} value={t.Code}>{t.Code} · {t.Name}</option>)}
          </select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Flete</span><input value={flete} onChange={(e) => setFlete(e.target.value)} inputMode="decimal" className={INP + " mt-1 font-mono"} /></label>
          <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Anticipo</span><input value={anticipo} onChange={(e) => setAnticipo(e.target.value)} inputMode="decimal" className={INP + " mt-1 font-mono"} /></label>
        </div>
        <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Agente aduanal · de SAP</span>
          <select value={agente} onChange={(e) => setAgente(e.target.value)} className={INP + " mt-1"}>
            <option value="">— Elige agente aduanal —</option>
            {agentes.map((a) => <option key={a.Code} value={a.Name || a.Code}>{a.Name || a.Code}</option>)}
          </select></label>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        {tp ? (
          <>
            <h3 className="text-base font-bold text-gray-800">{tp.Name}</h3>
            <div className="font-mono text-xs text-gray-500 mb-3">Línea {tp.Code} · {tp.U_MarcaCam} {tp.U_ModCam}</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              {[["Marca", tp.U_MarcaCam], ["Modelo", tp.U_ModCam], ["Placa camión", tp.U_PlacaCamion], ["Placa caja", tp.U_PlacaCaja], ["No. caja", tp.U_NumCaja], ["Conductor", conductor ? `${conductor.Code} · ${conductor.Name}` : (tp.U_Conductor || "—")]].map(([k, v]) => (
                <div key={k}><div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k}</div><div className="font-mono font-bold text-sm text-gray-800">{v || "—"}</div></div>
              ))}
            </div>
          </>
        ) : <div className="text-gray-400 text-sm grid place-items-center h-full py-10"><span>Elige una línea y se autollena el camión.</span></div>}
      </div>
    </div>
  );
}

function Distribucion({ disponibles, bed, sel, byPd, onRowClick, placeNext, acomodarSel, acomodarTodos, quitar, nSel, dragFrom, onDrop, totCajas }) {
  const nf = bed.findIndex((x) => x == null);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.35fr] gap-4">
      {/* disponibles */}
      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1"><span className="text-sm font-bold text-gray-700">Pallets por embarcar</span>
          <button onClick={acomodarTodos} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:border-emerald-500 hover:text-emerald-700">Acomodar todos</button></div>
        <div className="text-[11px] text-gray-400 font-medium mb-2"><b className="text-emerald-600">Shift+click</b> = rango · <b>+</b> acomoda uno · o <b className="text-emerald-600">arrastra</b> a la posición del camión.</div>
        <div className="max-h-[54vh] overflow-y-auto">
          {!disponibles.length ? <div className="py-10 text-center text-gray-400 text-sm">Sin pallets por embarcar.</div> :
            disponibles.map((p) => {
              const s = sel.has(String(p.palletDet));
              return (
                <div key={p.palletDet} draggable onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                  onDragStart={(e) => { try { e.dataTransfer.setData("text/plain", "avail:" + p.palletDet); } catch (_) { /* */ } }}
                  onClick={(e) => onRowClick(e, p.palletDet)}
                  className={`grid grid-cols-[18px_1fr_auto_24px] gap-2 items-center px-2 py-1.5 rounded-lg cursor-pointer select-none border ${s ? "bg-emerald-50 border-emerald-300" : "border-transparent hover:bg-gray-50"}`}>
                  <span className={`w-[17px] h-[17px] rounded-[5px] grid place-items-center border-[1.7px] ${s ? "bg-emerald-600 border-emerald-600" : "border-gray-300"}`}>{s ? <Check size={11} className="text-white" strokeWidth={3.5} /> : null}</span>
                  <span className="min-w-0"><span className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis"><span className="font-mono font-bold text-[13px]">{p.folio}</span><span className="font-mono font-extrabold text-[11px] text-gray-600">{p.pt}</span><span className="text-[11px] text-gray-400">OV {p.ovNum}</span></span>
                    <span className="block text-[10px] text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">{p.presentacion} · {p.cardName || p.cardCode}</span></span>
                  <span className="font-mono font-bold text-[13px] text-gray-500">{p.cajas}</span>
                  <button onClick={(e) => { e.stopPropagation(); placeNext(String(p.palletDet)); }} className="w-[22px] h-[22px] rounded-md grid place-items-center text-gray-400 hover:bg-emerald-600 hover:text-white border border-gray-200 text-base font-bold">+</button>
                </div>
              );
            })}
        </div>
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
          <span className="text-[12.5px] font-bold text-gray-500">{nSel ? <><b className="text-emerald-600">{nSel}</b> seleccionados</> : `${disponibles.length} disponibles`}</span>
          <button onClick={acomodarSel} disabled={!nSel} className="text-[13px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400">{nSel ? `Acomodar selección (${nSel})` : "Acomodar selección"}</button>
        </div>
      </div>

      {/* camión */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100 text-xs font-bold uppercase tracking-wide text-gray-500"><span>Camión · distribución</span><span className="font-mono">{bed.filter((x) => x != null).length} / {CAP} · {totCajas} cjs</span></div>
        <div className="text-center text-[11px] font-bold uppercase tracking-wide text-emerald-700 py-2 flex items-center justify-center gap-2"><Truck size={16} /> Frente · cabina</div>
        <div className="max-h-[52vh] overflow-y-auto px-3 pb-3">
          <div className="text-center text-[10.5px] text-gray-400 font-semibold pb-1.5">✋ Arrastra un pallet para moverlo (si está ocupada, se intercambian)</div>
          <div className="grid grid-cols-2 gap-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400 pb-1.5"><span>Impares</span><span>Pares</span></div>
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: CAP / 2 }).map((_, row) => (
              <div key={row} className="grid grid-cols-2 gap-2.5">
                {[0, 1].map((col) => {
                  const pos = row * 2 + col; const pd = bed[pos]; const p = pd != null ? byPd(pd) : null;
                  return (
                    <div key={pos} data-pos={pos} draggable={!!p}
                      onDragStart={(e) => { if (!p) { e.preventDefault(); return; } dragFrom.current = pos; try { e.dataTransfer.setData("text/plain", "bed:" + pos); e.dataTransfer.effectAllowed = "move"; } catch (_) { /* */ } }}
                      onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(pos, e)}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 min-h-[44px] border ${p ? "border-emerald-300 bg-white cursor-grab" : (pos === nf ? "border-emerald-500 border-dashed bg-emerald-50" : "border-gray-200 border-dashed bg-white")}`}>
                      <span className="font-mono font-bold text-[13px] text-gray-400 w-5 text-center shrink-0">{pos}</span>
                      {p ? (<>
                        <GripVertical size={13} className="text-gray-300 shrink-0" />
                        <span className="min-w-0 flex-1"><span className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis"><span className="font-mono font-bold text-[13px]">{p.folio}</span><span className="font-mono font-extrabold text-[11px] text-gray-600">{p.pt}</span></span><span className="block text-[9.5px] text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">{p.presentacion}</span></span>
                        <span className="font-mono font-bold text-[12px] text-gray-500">{p.cajas}</span>
                        <button onClick={() => quitar(pos)} className="w-[18px] h-[18px] rounded grid place-items-center text-gray-400 hover:bg-red-50 hover:text-red-500 text-sm">×</button>
                      </>) : <span className="text-[11.5px] text-gray-400">{pos === nf ? "◀ siguiente" : "— libre —"}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Manifiestos({ porCliente }) {
  const [dest, setDest] = useState({});   // cardCode → { suc, state, city, country } | null (cargando)
  useEffect(() => {
    porCliente.forEach((c) => {
      if (c.cardCode && !(c.cardCode in dest)) {
        setDest((d) => ({ ...d, [c.cardCode]: null }));
        getClienteDestino(c.cardCode)
          .then((r) => setDest((d) => ({ ...d, [c.cardCode]: r || {} })))
          .catch(() => setDest((d) => ({ ...d, [c.cardCode]: {} })));
      }
    });
  }, [porCliente]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!porCliente.length) return <div className="py-14 text-center text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">Acomoda pallets y aquí se arma un manifiesto por cliente (destino y consecutivos automáticos al crear).</div>;
  return (
    <div className="space-y-3">
      {porCliente.map((c) => {
        const d = dest[c.cardCode];
        return (
          <div key={c.cardCode} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50">
              <div className="flex items-center gap-2"><Building2 size={16} className="text-gray-400" /><b className="text-gray-800">{c.cardName || c.cardCode}</b><span className="font-mono text-[11.5px] text-gray-400">{c.cardCode}</span></div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-sky-700 bg-sky-100 px-2.5 py-1 rounded-full">{c.cajas} cajas · {c.ovs.size} OV · {c.pallets} pallets</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 py-3">
              {/* destino (auto del cliente) */}
              <div className="space-y-1.5 text-[12.5px]">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Destino (del cliente)</div>
                {d === null ? (
                  <div className="text-gray-400 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Cargando destino…</div>
                ) : d && (d.suc || d.state) ? (
                  <>
                    <div className="text-gray-700"><b>Sucursal:</b> {d.suc || "—"}</div>
                    <div className="text-gray-700 font-mono">{d.country || "—"} · {d.state || "—"} · {d.city || "—"}</div>
                  </>
                ) : (
                  <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-[11.5px]">El cliente no tiene dirección de embarque (ship-to) en SAP; se creará el manifiesto sin destino.</div>
                )}
              </div>
              {/* manual (número + sellos) */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11.5px] text-amber-800">
                <div className="font-bold uppercase tracking-wide text-[10px] mb-1 flex items-center gap-1.5"><AlertCircle size={12} /> Se captura después</div>
                <b>Consecutivos destino/embarcado</b>: automáticos al crear. <b>Número de manifiesto</b> y <b>sellos/pedimentos</b>: quedan en blanco para capturarlos en SAP.
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
