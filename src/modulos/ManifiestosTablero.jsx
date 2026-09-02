import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Loader2, FileText, Check, AlertTriangle, X, Save, Pencil } from "lucide-react";
import { getManifiestosTablero, getManifiestoInfo, guardarManifiestoInfo, getManifiestoCatalogos, agregarValorCatalogo } from "../store/api";
import SearchSelect from "../components/SearchSelect";

// Tablero UNIFICADO de manifiestos (Fase 1+2): los que están EN SAP (sellados desde un embarque) y los
// EN LA APP (creados sin PT en SAP, ruta de emergencia). Clic en un renglón → drawer para capturar la
// INFO MANUAL (sellos, camión, pesos…) que el Excel captura y SAP no. Ver docs/plan-manifiestos-alternativo-y-pdf.md.

const INP = "w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white";
const LBL = "block text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1";

export default function ManifiestosTablero() {
  const [rows, setRows] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | sap | app
  const [sel, setSel] = useState(null);          // manifiesto abierto en el drawer

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
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-gray-50">
                {["Folio", "Origen", "Cliente", "Embarque / OV", "Cajas", "Info manual", "Estado", ""].map((h, i) => (
                  <th key={h + i} className={`text-[10.5px] font-bold uppercase tracking-wide text-gray-400 px-3.5 py-3 border-b border-gray-200 whitespace-nowrap ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-12"><Loader2 size={26} className="mx-auto mb-2 animate-spin text-gray-300" />Cargando…</td></tr>
              ) : !vis.length ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-12"><FileText size={28} className="mx-auto mb-2 text-gray-300" />Sin manifiestos {filtro === "app" ? "en la app" : filtro === "sap" ? "en SAP" : "aún"}.</td></tr>
              ) : vis.map((m) => (
                <tr key={m.id} onClick={() => setSel(m)} className="hover:bg-gray-50 cursor-pointer">
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
                  <td className="px-3.5 py-3 border-b border-gray-100 text-right"><span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Pencil size={12} /> Info</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[11px] text-gray-400">Clic en un manifiesto para <b>capturar su info manual</b> (sellos, camión, pesos…). <b>En SAP</b> = sellado desde un embarque · <b>En la app</b> = sin PT en SAP (emergencia). Próximo: el PDF único para todos.</div>

      {sel ? <InfoDrawer m={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); cargar(); }} /> : null}
    </div>
  );
}

// ── Drawer: capturar/editar la INFO MANUAL del manifiesto (overlay tipo hoja "MENU" del Excel) ──
function InfoDrawer({ m, onClose, onSaved }) {
  const [ov, setOv] = useState({ sellos: {}, camion: {}, conductor: {}, agencia: "", distribuidor: "", temperatura: "", flete: "", anticipo: "", observaciones: "" });
  const [cat, setCat] = useState({});   // catálogos editables (transportistas, marcasCamion, agencias…)
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getManifiestoCatalogos().then((r) => setCat(r || {})).catch(() => {}); }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const r = await getManifiestoInfo(m.folio);
        const o = r?.overlay || {};
        if (vivo) setOv({ sellos: o.sellos || {}, camion: o.camion || {}, conductor: o.conductor || {}, agencia: o.agencia || "", distribuidor: o.distribuidor || "", temperatura: o.temperatura || "", flete: o.flete || "", anticipo: o.anticipo || "", observaciones: o.observaciones || "" });
      } catch { /* aún sin capturar */ }
      finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [m.folio]);

  const g = (grp, f) => (e) => setOv((p) => ({ ...p, [grp]: { ...(p[grp] || {}), [f]: e.target.value } }));
  const t = (f) => (e) => setOv((p) => ({ ...p, [f]: e.target.value }));
  const vg = (grp, f) => (ov[grp] || {})[f] || "";
  const setG = (grp, f, val) => setOv((p) => ({ ...p, [grp]: { ...(p[grp] || {}), [f]: val } }));
  const setT = (f, val) => setOv((p) => ({ ...p, [f]: val }));
  const catOpts = (lista) => (cat[lista] || []).map((v) => ({ value: v, label: v }));
  // elige de la lista o escribe uno nuevo: si es nuevo, se GUARDA en el catálogo (BD) y aparece luego.
  const pickCat = (lista, apply) => (v) => {
    apply(v);
    if (v && !(cat[lista] || []).includes(v)) {
      agregarValorCatalogo(lista, v).catch(() => {});
      setCat((p) => ({ ...p, [lista]: [...(p[lista] || []), v] }));
    }
  };

  const guardar = async () => {
    setGuardando(true); setError("");
    try {
      await guardarManifiestoInfo({ folio: m.folio, origen: m.origen, embarqueId: m.embarqueId, ovNum: m.ovNum, cardCode: m.cardCode, overlay: ov });
      onSaved();
    } catch (e) { setError(e?.message || "No se pudo guardar la info."); setGuardando(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={guardando ? undefined : onClose} />
      <aside className="fixed top-0 right-0 h-full w-[min(560px,96vw)] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">
        <div className="px-5 pt-5 pb-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <div className="font-mono font-extrabold text-2xl text-gray-800 leading-none">Manifiesto {m.folio}</div>
            <div className="text-xs text-gray-400 font-semibold mt-1">{m.cliente || m.cardCode || "—"} · {m.origen === "sap" ? "en SAP" : "en la app"}</div>
          </div>
          <button onClick={onClose} disabled={guardando} className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 grid place-items-center hover:text-red-500 hover:border-red-300 disabled:opacity-40"><X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {cargando ? (
            <div className="py-16 text-center text-gray-400"><Loader2 size={24} className="mx-auto mb-2 animate-spin" />Cargando info…</div>
          ) : (<>
            <Sec title="Sellos">
              <Field lbl="Origen"><input className={INP} value={vg("sellos", "origen")} onChange={g("sellos", "origen")} /></Field>
              <Field lbl="Reemplazo"><input className={INP} value={vg("sellos", "reemplazo")} onChange={g("sellos", "reemplazo")} /></Field>
              <Field lbl="Lateral"><input className={INP} value={vg("sellos", "lateral")} onChange={g("sellos", "lateral")} /></Field>
              <Field lbl="Cruce"><input className={INP} value={vg("sellos", "cruce")} onChange={g("sellos", "cruce")} /></Field>
              <Field lbl="¿Quién abrió?" full><input className={INP} value={vg("sellos", "abrio")} onChange={g("sellos", "abrio")} /></Field>
            </Sec>
            <Sec title="Camión / caja">
              <Field lbl="Línea de transporte" full><SearchSelect className={INP} allowCustom placeholder="Elige o escribe…" value={vg("camion", "linea")} options={catOpts("transportistas")} onChange={pickCat("transportistas", (v) => setG("camion", "linea", v))} /></Field>
              <Field lbl="Marca"><SearchSelect className={INP} allowCustom placeholder="Elige o escribe…" value={vg("camion", "marca")} options={catOpts("marcasCamion")} onChange={pickCat("marcasCamion", (v) => setG("camion", "marca", v))} /></Field>
              <Field lbl="Modelo"><input className={INP} value={vg("camion", "modelo")} onChange={g("camion", "modelo")} /></Field>
              <Field lbl="Placas tracto"><input className={INP} value={vg("camion", "placasTracto")} onChange={g("camion", "placasTracto")} /></Field>
              <Field lbl="Placas caja"><input className={INP} value={vg("camion", "placasCaja")} onChange={g("camion", "placasCaja")} /></Field>
              <Field lbl="Económico"><input className={INP} value={vg("camion", "economico")} onChange={g("camion", "economico")} /></Field>
            </Sec>
            <Sec title="Conductor">
              <Field lbl="Nombre" full><SearchSelect className={INP} allowCustom placeholder="Elige o escribe…" value={vg("conductor", "nombre")} options={catOpts("conductores")} onChange={pickCat("conductores", (v) => setG("conductor", "nombre", v))} /></Field>
              <Field lbl="Licencia"><input className={INP} value={vg("conductor", "licencia")} onChange={g("conductor", "licencia")} /></Field>
              <Field lbl="Teléfono"><input className={INP} value={vg("conductor", "tel")} onChange={g("conductor", "tel")} /></Field>
            </Sec>
            <Sec title="Aduana / destino / flete">
              <Field lbl="Agencia aduanal"><SearchSelect className={INP} allowCustom placeholder="Elige o escribe…" value={ov.agencia} options={catOpts("agenciasAduanales")} onChange={pickCat("agenciasAduanales", (v) => setT("agencia", v))} /></Field>
              <Field lbl="Distribuidor"><SearchSelect className={INP} allowCustom placeholder="Elige o escribe…" value={ov.distribuidor} options={catOpts("distribuidores")} onChange={pickCat("distribuidores", (v) => setT("distribuidor", v))} /></Field>
              <Field lbl="Temperatura"><input className={INP} value={ov.temperatura} onChange={t("temperatura")} /></Field>
              <Field lbl="Flete"><input className={INP} value={ov.flete} onChange={t("flete")} inputMode="decimal" /></Field>
              <Field lbl="Anticipo"><input className={INP} value={ov.anticipo} onChange={t("anticipo")} inputMode="decimal" /></Field>
            </Sec>
            <Sec title="Observaciones">
              <Field lbl="" full><textarea rows={2} className={INP} value={ov.observaciones} onChange={t("observaciones")} /></Field>
            </Sec>
          </>)}
        </div>

        <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50 space-y-2">
          {error ? <div className="text-[12.5px] font-semibold text-red-600">{error}</div> : null}
          <button onClick={guardar} disabled={cargando || guardando}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {guardando ? "Guardando…" : "Guardar info"}
          </button>
        </div>
      </aside>
    </>
  );
}

function Sec({ title, children }) {
  return (
    <section>
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{title}</div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}
function Field({ lbl, full, children }) {
  return <div className={full ? "col-span-2" : ""}>{lbl ? <label className={LBL}>{lbl}</label> : null}{children}</div>;
}
