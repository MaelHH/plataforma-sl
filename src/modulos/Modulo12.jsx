import { useState } from "react";
import { useDatos, CATS_QC, CALIDAD_ESTADOS, ahora } from "../store/datos";
import ColaTabs from "../components/ColaTabs";
import { FlaskConical, User, MapPin, Sprout, X, Camera, BarChart3, Send, Phone, Save, Check } from "lucide-react";
import { useDialog } from "../components/Dialog";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
const genId = () => "D_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Aprobación de calidad vacía para una carga.
const calidadVacia = (producto) => ({
  estado: "pendiente",
  producto: producto || "",
  inspector: "",
  lugar: "",
  fecha: hoyISO(),
  folio: "", pesoMuestra: "",
  grower: "SL Agrícola, SA de CV", lote: "", size: "", count: "",
  temperatura: "", conteos: "", truck: "", manifiesto: "",
  defectos: {}, // { [defId]: { presente, pct, notas, fotos:[dataURL] } }
  observaciones: "",
  resueltoPor: "",
  resueltoTs: "",
});

export default function Modulo12() {
  const {
    cargasEmbarques, setCargasEmbarques,
    defectosCalidad, setDefectosCalidad,
    inspectoresCalidad, setInspectoresCalidad,
    lugaresCalidad, setLugaresCalidad,
  } = useDatos();
  const dlg = useDialog();

  const [cargaSel, setCargaSel] = useState(null); // carga en inspección
  const [insp, setInsp] = useState(null);

  // Catálogos (modales)
  const [catDef, setCatDef] = useState(false);
  const [catInsp, setCatInsp] = useState(false);
  const [catLug, setCatLug] = useState(false);

  const productos = Object.keys(defectosCalidad);

  const abrir = (carga) => {
    setInsp(carga.calidad ? { ...calidadVacia(productos[0]), ...carga.calidad } : calidadVacia(productos[0] || ""));
    setCargaSel(carga);
  };
  const cerrar = () => { setCargaSel(null); setInsp(null); };

  const upd = (campo, val) => setInsp((f) => ({ ...f, [campo]: val }));
  const updDefecto = (defId, campo, val) =>
    setInsp((f) => ({ ...f, defectos: { ...f.defectos, [defId]: { presente: false, notas: "", fotos: [], ...f.defectos[defId], [campo]: val } } }));

  // Fotos por defecto (varias) → se guardan como dataURL base64
  const subirFotos = (defId, fileList) => {
    Array.from(fileList || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setInsp((f) => {
          const d = f.defectos[defId] || { presente: true, notas: "", fotos: [] };
          return { ...f, defectos: { ...f.defectos, [defId]: { ...d, presente: true, fotos: [...(d.fotos || []), reader.result] } } };
        });
      reader.readAsDataURL(file);
    });
  };
  const quitarFoto = (defId, idx) =>
    setInsp((f) => {
      const d = f.defectos[defId];
      if (!d) return f;
      return { ...f, defectos: { ...f.defectos, [defId]: { ...d, fotos: d.fotos.filter((_, i) => i !== idx) } } };
    });

  const persistir = (calidad) => {
    const id = cargaSel.id;
    setCargasEmbarques((prev) => prev.map((c) => (c.id === id ? { ...c, calidad } : c)));
  };
  const guardar = () => { persistir(insp); cerrar(); };
  const resolver = (estado) => { persistir({ ...insp, estado, resueltoTs: ahora().local }); cerrar(); };

  // ── Edición de catálogos ──
  const updDefLabel = (prod, defId, val) => setDefectosCalidad((p) => ({ ...p, [prod]: p[prod].map((d) => d.id === defId ? { ...d, label: val } : d) }));
  const updDefCat = (prod, defId, val) => setDefectosCalidad((p) => ({ ...p, [prod]: p[prod].map((d) => d.id === defId ? { ...d, cat: val } : d) }));
  const addDef = (prod) => setDefectosCalidad((p) => ({ ...p, [prod]: [...(p[prod] || []), { id: genId(), label: "Nuevo defecto", cat: "calidad" }] }));
  const delDef = (prod, defId) => setDefectosCalidad((p) => ({ ...p, [prod]: p[prod].filter((d) => d.id !== defId) }));
  const addProd = (nombre) => {
    const n = (nombre || "").trim().toUpperCase();
    if (!n) return;
    setDefectosCalidad((p) => (p[n] ? p : { ...p, [n]: [] }));
  };
  const delProd = async (prod) => {
    if (!(await dlg.confirm({ title: "Eliminar producto", message: `¿Eliminar el producto "${prod}" y todos sus defectos?`, confirmText: "Eliminar", danger: true }))) return;
    setDefectosCalidad((p) => { const c = { ...p }; delete c[prod]; return c; });
  };

  const updInspector = (i, val) => setInspectoresCalidad((p) => p.map((x, j) => (j === i ? val : x)));
  const addInspector = () => setInspectoresCalidad((p) => [...p, "NUEVO INSPECTOR"]);
  const delInspector = (i) => setInspectoresCalidad((p) => p.filter((_, j) => j !== i));

  const updLugar = (i, val) => setLugaresCalidad((p) => p.map((x, j) => (j === i ? val : x)));
  const addLugar = () => setLugaresCalidad((p) => [...p, "Nuevo lugar"]);
  const delLugar = (i) => setLugaresCalidad((p) => p.filter((_, j) => j !== i));

  // Conteos
  const estadoDe = (c) => c.calidad?.estado || "pendiente";
  const total = cargasEmbarques.length;
  const pendientesArr = cargasEmbarques.filter((c) => estadoDe(c) === "pendiente");
  const resueltosArr = cargasEmbarques.filter((c) => estadoDe(c) !== "pendiente");
  const pendientes = pendientesArr.length;
  const aprobados = cargasEmbarques.filter((c) => estadoDe(c) === "aprobado").length;
  const [tabQC, setTabQC] = useState("pendientes"); // pendientes | historial
  const listaQC = tabQC === "pendientes" ? pendientesArr : resueltosArr;

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const LBL = "text-xs text-gray-500 block mb-0.5";
  const BTN_CAT = "text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200";

  const stat = (l, v, c) => (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
      <div className="text-xs text-gray-500 mb-1">{l}</div>
      <div className={`text-xl font-semibold ${c}`}>{v}</div>
    </div>
  );

  const defectosProducto = insp ? defectosCalidad[insp.producto] || [] : [];
  const nConDefecto = insp ? defectosProducto.filter((d) => (parseFloat(insp.defectos[d.id]?.peso) || 0) > 0).length : 0;

  // Editor de defectos: producto seleccionado
  const [catProdSel, setCatProdSel] = useState(productos[0] || "");
  const [nuevoProd, setNuevoProd] = useState("");
  const prodEditar = defectosCalidad[catProdSel] ? catProdSel : (productos[0] || "");

  // ── KPIs estilo QC REPORT ──
  // El % de cada defecto se calcula con el peso (g) capturado / el peso de la muestra.
  const pesoMuestraNum = parseFloat(insp?.pesoMuestra) || 0;
  const pctDe = (d) => { const g = parseFloat(insp?.defectos?.[d.id]?.peso) || 0; return pesoMuestraNum > 0 ? (g / pesoMuestraNum) * 100 : 0; };
  const pctQuality = defectosProducto.filter((d) => d.cat === "calidad").reduce((a, d) => a + pctDe(d), 0);
  const pctCondition = defectosProducto.filter((d) => d.cat === "condicion" || d.cat === "plaga").reduce((a, d) => a + pctDe(d), 0);
  const pctDefects = pctQuality + pctCondition;
  const pctGood = Math.max(0, 100 - pctDefects);

  // ── Resumen, PDF y envío (correo / WhatsApp) ──
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const defectosConHallazgo = () => (insp ? defectosProducto.filter((d) => (parseFloat(insp.defectos[d.id]?.peso) || 0) > 0) : []);

  const resumenTexto = () => {
    const c = cargaSel;
    const hall = defectosConHallazgo().map((d) => d.label);
    return [
      "Inspección de Calidad — QC Bodegas",
      `Embarque: ${c?.fecha || ""} · ${c?.trailer?.dest || ""} · ${c?.trailer?.chofer || ""}`,
      `Producto: ${insp.producto || "—"}`,
      `Folio: ${insp.folio || "—"} · Peso muestra: ${insp.pesoMuestra || "—"}`,
      `Inspector: ${insp.inspector || "—"} · Lugar: ${insp.lugar || "—"} · Fecha: ${insp.fecha || "—"}`,
      `% Good Quality: ${pctGood.toFixed(1)}% · % Defects: ${pctDefects.toFixed(2)}% (Calidad ${pctQuality.toFixed(2)}% / Condición ${pctCondition.toFixed(2)}%)`,
      `Defectos con hallazgo (${hall.length}): ${hall.join(", ") || "ninguno"}`,
      `Estado: ${CALIDAD_ESTADOS[insp.estado]?.label || "Pendiente"}`,
      insp.observaciones ? `Observaciones: ${insp.observaciones}` : "",
    ].filter(Boolean).join("\n");
  };

  const mandarCorreo = () => {
    const asunto = `Calidad QC Bodegas — ${cargaSel?.trailer?.dest || ""} ${cargaSel?.fecha || ""}`.trim();
    window.location.assign(`mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(resumenTexto())}`);
  };
  const mandarWapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(resumenTexto())}`, "_blank");
  };

  // QC REPORT estilo dashboard (Power BI)
  const generarReporteQC = () => {
    const win = window.open("", "_blank");
    if (!win) { dlg.alerta({ title: "Ventanas bloqueadas", message: "Permite las ventanas emergentes para generar el reporte." }); return; }

    const defsConPct = defectosProducto.map((d) => ({ d, pct: pctDe(d) })).filter((x) => x.pct > 0);
    const filasDef = defsConPct.length ? defsConPct.map(({ d, pct }) =>
      `<tr><td>${esc(d.label)}</td><td style="text-transform:uppercase">${esc((CATS_QC[d.cat]?.label || d.cat).replace("% D. ", ""))}</td><td style="text-align:right;font-weight:700">${pct.toFixed(2)}%</td></tr>`
    ).join("") : `<tr><td colspan="3" style="text-align:center;color:#999">Sin defectos capturados (captura el % por defecto)</td></tr>`;

    const colores = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
    const segs = defsConPct.map(({ d, pct }, i) => {
      const w = pctDefects > 0 ? (pct / pctDefects) * 100 : 0;
      return `<div style="width:${w}%;background:${colores[i % colores.length]};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;overflow:hidden" title="${esc(d.label)}">${pct.toFixed(2)}%</div>`;
    }).join("");
    const leyenda = defsConPct.map(({ d }, i) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px"><span style="width:9px;height:9px;border-radius:9999px;display:inline-block;background:${colores[i % colores.length]}"></span>${esc(d.label)}</span>`).join("");

    const kpi = (label, val, green) => `<div class="kpi"><div class="kl">${label}</div><div class="kv" style="${green ? "background:#22c55e;color:#fff" : ""}">${val}</div></div>`;
    const countTxt = insp.count ? Number(insp.count).toLocaleString() : "—";

    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
      <title>QC Report - ${esc(insp.folio) || ""}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; margin: 16px; font-size: 12px; background:#fff; }
        .topbar { display:flex; align-items:stretch; gap:6px; margin-bottom:8px; }
        .title { background:#e5e7eb; color:#16a34a; font-weight:800; font-size:24px; padding:8px 18px; border-radius:4px; display:flex; align-items:center; }
        .filt { border:1px solid #d1d5db; border-radius:4px; min-width:88px; overflow:hidden; }
        .filt .l { font-size:9px; font-weight:700; text-align:center; background:#111; color:#fff; padding:2px; }
        .filt .v { font-size:12px; padding:5px 8px; }
        .band { display:flex; gap:6px; margin-bottom:8px; }
        .band > div { flex:1; border:1px solid #d1d5db; }
        .band .bh { background:#111; color:#fff; text-align:center; font-weight:700; font-size:11px; padding:3px; }
        .band .bv { text-align:center; font-size:18px; padding:8px; }
        table.meta { width:100%; border-collapse:collapse; margin-bottom:8px; }
        table.meta th { background:#111; color:#fff; text-align:left; padding:4px 8px; font-size:10px; }
        table.meta td { border:1px solid #e5e7eb; padding:4px 8px; }
        .kpis { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:10px; }
        .kpi { border:1px solid #d1d5db; }
        .kpi .kl { background:#111; color:#fff; text-align:center; font-weight:700; font-size:10px; padding:3px; }
        .kpi .kv { text-align:center; font-size:24px; font-weight:800; padding:10px 4px; }
        .cols { display:flex; gap:10px; }
        .cols .left { width:42%; }
        .cols .right { flex:1; }
        table.def { width:100%; border-collapse:collapse; }
        table.def th { background:#111; color:#fff; text-align:left; padding:4px 8px; font-size:10px; }
        table.def td { border:1px solid #e5e7eb; padding:4px 8px; }
        .bar { display:flex; height:42px; border:1px solid #e5e7eb; border-radius:4px; overflow:hidden; }
        @media print { body { margin: 8mm; } }
      </style></head><body>
      <div class="topbar">
        <div class="title">QC REPORT</div>
        <div class="filt"><div class="l">GROWER</div><div class="v">${esc(insp.grower) || "All"}</div></div>
        <div class="filt"><div class="l">PRODUCT</div><div class="v">${esc(insp.producto) || "All"}</div></div>
        <div class="filt"><div class="l">DATE</div><div class="v">${esc(insp.fecha) || "—"}</div></div>
        <div class="filt"><div class="l">MANIFIESTO</div><div class="v">${esc(insp.manifiesto) || "All"}</div></div>
        <div class="filt"><div class="l">ID MUESTRA</div><div class="v">${esc(insp.folio) || "—"}</div></div>
        <div class="filt"><div class="l">SUPERVISOR</div><div class="v">${esc(insp.inspector) || "—"}</div></div>
      </div>
      <div class="band">
        <div><div class="bh">GROWER</div><div class="bv">${esc(insp.grower) || "—"}</div></div>
        <div><div class="bh">PRODUCT</div><div class="bv">${esc(insp.producto) || "—"}${insp.size ? " — " + esc(insp.size) : ""}</div></div>
      </div>
      <table class="meta">
        <thead><tr><th>FECHA REAL</th><th>LOTE</th><th>GROWER</th><th>PRODUCT</th><th>SIZE</th><th>LOCATION</th><th>INSPECTOR</th><th>COMMENTS</th></tr></thead>
        <tbody><tr>
          <td>${esc(insp.fecha) || "—"}</td><td>${esc(insp.lote) || "—"}</td><td>${esc(insp.grower) || "—"}</td><td>${esc(insp.producto) || "—"}</td><td>${esc(insp.size) || "—"}</td><td>${esc(insp.lugar) || "—"}</td><td>${esc(insp.inspector) || "—"}</td><td>${esc(insp.observaciones) || "—"}</td>
        </tr></tbody>
      </table>
      <div class="kpis">
        ${kpi("COUNT", countTxt)}
        ${kpi("% GOOD QUALITY", pctGood.toFixed(1) + "%", true)}
        ${kpi("% DEFECTS", pctDefects.toFixed(2) + "%")}
        ${kpi("% DEFECTS QUALITY", pctQuality > 0 ? pctQuality.toFixed(2) + "%" : "(Blank)")}
        ${kpi("% DEFECTS CONDITION", pctCondition > 0 ? pctCondition.toFixed(2) + "%" : "(Blank)")}
        ${kpi("TEMPERATURA", insp.temperatura ? esc(insp.temperatura) : "—", !!insp.temperatura)}
        ${kpi("CONTEOS", insp.conteos ? esc(insp.conteos) : "(Blank)")}
      </div>
      <div class="cols">
        <div class="left">
          <table class="def">
            <thead><tr><th>DEFECTS</th><th>DEFECT</th><th style="text-align:right">% CALIDAD</th></tr></thead>
            <tbody>${filasDef}</tbody>
          </table>
          <div style="margin-top:8px;font-size:11px;border:1px solid #d1d5db"><div style="background:#111;color:#fff;text-align:center;font-weight:700;padding:3px">TRUCK</div><div style="text-align:center;padding:6px">${esc(insp.truck) || "(Blank)"}</div></div>
        </div>
        <div class="right">
          <div style="background:#111;color:#fff;text-align:center;font-weight:700;padding:3px;font-size:11px">% DEFECTS</div>
          <div style="margin:6px 0">${leyenda || '<span style="color:#999;font-size:11px">Sin defectos</span>'}</div>
          <div class="bar">${segs || '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#999">Sin defectos capturados</div>'}</div>
          <div style="text-align:right;font-size:11px;color:#6b7280;margin-top:4px">Total defectos: <b>${pctDefects.toFixed(2)}%</b></div>
        </div>
      </div>
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">QC - Bodegas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Inspección de calidad de los embarques antes de liberar · fotos por defecto, según el producto</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatDef(true)} className={BTN_CAT + " inline-flex items-center gap-1"}><FlaskConical size={14} /> Defectos</button>
          <button onClick={() => setCatInsp(true)} className={BTN_CAT + " inline-flex items-center gap-1"}><User size={14} /> Inspectores</button>
          <button onClick={() => setCatLug(true)} className={BTN_CAT + " inline-flex items-center gap-1"}><MapPin size={14} /> Lugares</button>
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">QC</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {stat("Total embarques", total, "text-gray-900")}
        {stat("Por inspeccionar", pendientes, "text-orange-600")}
        {stat("Inspeccionados", aprobados, "text-green-700")}
      </div>

      {cargasEmbarques.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="flex justify-center mb-3"><FlaskConical size={28} className="text-gray-400" /></div>
          <div className="text-sm font-medium text-gray-700 mb-1">Sin embarques para inspeccionar</div>
          <div className="text-xs text-gray-400">Aparecerán aquí las cargas que salieron de Embarques</div>
        </div>
      ) : (
        <>
        <ColaTabs tab={tabQC} setTab={setTabQC} tabs={[
          { key: "pendientes", label: "Por inspeccionar", count: pendientesArr.length },
          { key: "historial", label: "Historial", count: resueltosArr.length },
        ]} />
        {listaQC.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-xs text-gray-400 italic">{tabQC === "pendientes" ? "No hay embarques por inspeccionar." : "Aún no hay embarques inspeccionados."}</div>
        ) : (
        <div className="grid grid-cols-1 gap-3">
          {listaQC.map((carga) => {
            const est = estadoDe(carga);
            const cfg = CALIDAD_ESTADOS[est];
            return (
              <div key={carga.id} className={`bg-white border-2 rounded-xl overflow-hidden ${est === "aprobado" ? "border-green-300" : est === "rechazado" ? "border-red-300" : "border-orange-200"}`}>
                <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                  <div className="flex flex-col"><span className="text-xs font-bold text-gray-700">{carga.fecha}</span><span className="text-xs text-gray-400">{carga.trailer?.fecha}</span></div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200">{carga.trailer?.dest || "—"}</span>
                  <div className="text-xs text-gray-500"><span className="font-medium">{carga.trailer?.chofer || "Sin chofer"}</span>{carga.trailer?.placaTracto && <span className="ml-1 font-mono text-gray-400">· {carga.trailer.placaTracto}</span>}</div>
                  {carga.calidad?.producto && (
                    <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium"><Sprout size={14} /> {carga.calidad.producto}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${cfg.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>{cfg.label}
                  </span>
                  {est !== "pendiente" && carga.calidad?.resueltoTs && (
                    <span className="text-xs text-gray-400">{carga.calidad.inspector || ""} · {carga.calidad.resueltoTs}</span>
                  )}
                  <div className="ml-auto">
                    <button onClick={() => abrir(carga)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700">
                      <FlaskConical size={14} /> {est === "pendiente" ? "Inspeccionar" : "Ver / Editar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
        </>
      )}

      {/* ── Modal de inspección de calidad ── */}
      {cargaSel && insp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <div className="text-sm font-semibold text-gray-900">Inspección de calidad del embarque</div>
                <div className="text-xs text-gray-500 mt-0.5">{cargaSel.fecha} · {cargaSel.trailer?.dest || "—"} · {cargaSel.trailer?.chofer || "—"}</div>
              </div>
              <button onClick={cerrar} className="inline-flex items-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Producto / Inspector / Lugar / Fecha */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className={LBL}>Producto (define los defectos)</label>
                  <select className={INP} value={insp.producto} onChange={(e) => upd("producto", e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {productos.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LBL}>Inspector</label>
                  <select className={INP} value={insp.inspector} onChange={(e) => upd("inspector", e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {inspectoresCalidad.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LBL}>Lugar de inspección</label>
                  <select className={INP} value={insp.lugar} onChange={(e) => upd("lugar", e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {lugaresCalidad.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={insp.fecha} onChange={(e) => upd("fecha", e.target.value)} /></div>
                <div><label className={LBL}>Folio (ID muestra)</label><input className={INP} value={insp.folio || ""} onChange={(e) => upd("folio", e.target.value)} placeholder="No." /></div>
                <div><label className={LBL}>Peso muestra</label><input type="number" className={INP} value={insp.pesoMuestra || ""} onChange={(e) => upd("pesoMuestra", e.target.value)} placeholder="g" /></div>
              </div>

              {/* Datos de cabecera del QC Report */}
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Datos del reporte QC</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className={LBL}>Grower</label><input className={INP} value={insp.grower || ""} onChange={(e) => upd("grower", e.target.value)} /></div>
                  <div><label className={LBL}>Lote</label><input className={INP} value={insp.lote || ""} onChange={(e) => upd("lote", e.target.value)} /></div>
                  <div><label className={LBL}>Size</label><input className={INP} value={insp.size || ""} onChange={(e) => upd("size", e.target.value)} placeholder="Bolsas" /></div>
                  <div><label className={LBL}>Count (unidades)</label><input type="number" className={INP} value={insp.count || ""} onChange={(e) => upd("count", e.target.value)} /></div>
                  <div><label className={LBL}>Temperatura</label><input type="number" className={INP} value={insp.temperatura || ""} onChange={(e) => upd("temperatura", e.target.value)} placeholder="°F" /></div>
                  <div><label className={LBL}>Conteos</label><input className={INP} value={insp.conteos || ""} onChange={(e) => upd("conteos", e.target.value)} /></div>
                  <div><label className={LBL}>Truck</label><input className={INP} value={insp.truck || ""} onChange={(e) => upd("truck", e.target.value)} /></div>
                  <div><label className={LBL}>Manifiesto</label><input className={INP} value={insp.manifiesto || ""} onChange={(e) => upd("manifiesto", e.target.value)} /></div>
                </div>
              </div>

              {insp.producto && (
                <div>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Resumen QC (calificación)</div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {[
                      ["COUNT", insp.count ? Number(insp.count).toLocaleString() : "—", "text-gray-900"],
                      ["% GOOD", pctGood.toFixed(1) + "%", "bg-green-500 text-white"],
                      ["% DEFECTS", pctDefects.toFixed(2) + "%", "text-gray-900"],
                      ["% QUALITY", pctQuality > 0 ? pctQuality.toFixed(2) + "%" : "—", "text-blue-700"],
                      ["% CONDITION", pctCondition > 0 ? pctCondition.toFixed(2) + "%" : "—", "text-amber-700"],
                      ["TEMP", insp.temperatura || "—", insp.temperatura ? "bg-green-500 text-white" : "text-gray-900"],
                    ].map(([l, v, cls]) => (
                      <div key={l} className="border border-gray-200 rounded-lg overflow-hidden text-center">
                        <div className="bg-gray-800 text-white text-[9px] font-bold py-0.5">{l}</div>
                        <div className={`text-base font-extrabold py-1.5 ${cls}`}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!insp.producto ? (
                <div className="text-center text-xs text-gray-400 italic py-8 border border-dashed border-gray-200 rounded-xl">Selecciona un producto para ver sus defectos.</div>
              ) : defectosProducto.length === 0 ? (
                <div className="text-center text-xs text-gray-400 italic py-8 border border-dashed border-gray-200 rounded-xl inline-flex items-center justify-center gap-1 w-full">Este producto no tiene defectos. Agrégalos en el catálogo <FlaskConical size={14} className="inline" /> Defectos.</div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase">Defectos — {insp.producto}</div>
                    <div className="text-xs text-gray-500">{nConDefecto} con hallazgo</div>
                  </div>
                  <div className="space-y-4">
                    {Object.entries(CATS_QC).map(([catKey, catCfg]) => {
                      const defs = defectosProducto.filter((d) => d.cat === catKey);
                      if (!defs.length) return null;
                      return (
                        <div key={catKey}>
                          <div className={`text-xs font-semibold mb-1 ${catCfg.color}`}>{catCfg.label}</div>
                          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                            {defs.map((d) => {
                              const reg = insp.defectos[d.id] || { peso: "", fotos: [] };
                              const tienePeso = (parseFloat(reg.peso) || 0) > 0;
                              const catBorder = { calidad: "border-l-blue-400", condicion: "border-l-amber-400", plaga: "border-l-red-400" }[d.cat];
                              return (
                                <div key={d.id} className={`px-3 py-2 border-l-2 ${catBorder} ${tienePeso ? "bg-red-50/40" : ""}`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs truncate flex-1 min-w-0 ${tienePeso ? "font-semibold text-gray-800" : "text-gray-600"}`}>{d.label}</span>
                                    <input type="number" step="0.01" className="w-20 shrink-0 text-right text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white" value={reg.peso || ""} onChange={(e) => updDefecto(d.id, "peso", e.target.value)} placeholder="g" title="Peso del defecto (g)" />
                                    <span className="w-12 shrink-0 text-right text-[10px] text-gray-400">{pctDe(d).toFixed(1)}%</span>
                                    <label className="cursor-pointer inline-flex items-center gap-1 text-xs px-2 py-1.5 border border-indigo-200 rounded-md text-indigo-600 hover:bg-indigo-50 whitespace-nowrap shrink-0" title="Agregar fotos">
                                      <Camera size={14} />{reg.fotos?.length ? ` ${reg.fotos.length}` : ""}
                                      <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => subirFotos(d.id, e.target.files)} />
                                    </label>
                                  </div>
                                  {reg.fotos?.length > 0 && (
                                    <div className="flex gap-2 flex-wrap mt-2">
                                      {reg.fotos.map((src, idx) => (
                                        <div key={idx} className="relative">
                                          <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="w-14 h-14 object-cover rounded border border-gray-200" /></a>
                                          <button onClick={() => quitarFoto(d.id, idx)} className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500"><X size={10} /></button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className={LBL}>Observaciones / motivo de la decisión</label>
                <textarea rows={2} className={INP} value={insp.observaciones} onChange={(e) => upd("observaciones", e.target.value)} placeholder="Observaciones generales del embarque" />
              </div>

              {insp.estado !== "pendiente" && (
                <div className={`text-xs px-3 py-2 rounded-lg border ${CALIDAD_ESTADOS[insp.estado].color}`}>
                  Estado actual: <b>{CALIDAD_ESTADOS[insp.estado].label}</b>{insp.resueltoTs ? ` · ${insp.resueltoTs}` : ""}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 flex-wrap justify-between items-center sticky bottom-0 bg-white">
              <div className="flex gap-2 flex-wrap">
                <button onClick={generarReporteQC} className="inline-flex items-center gap-1 text-xs px-3 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700"><BarChart3 size={14} /> QC Report</button>
                <button onClick={mandarCorreo} className="inline-flex items-center gap-1 text-xs px-3 py-2 border border-blue-300 text-blue-700 rounded-lg font-semibold hover:bg-blue-50"><Send size={14} /> Mandar Correo</button>
                <button onClick={mandarWapp} className="inline-flex items-center gap-1 text-xs px-3 py-2 border border-green-300 text-green-700 rounded-lg font-semibold hover:bg-green-50"><Phone size={14} /> Mandar WhatsApp</button>
              </div>
              <div className="flex gap-2">
                <button onClick={guardar} className="inline-flex items-center gap-1 text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"><Save size={14} /> Guardar (sin decidir)</button>
                <button onClick={() => resolver("aprobado")} className="inline-flex items-center gap-1 text-xs px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"><Check size={14} /> Inspeccionar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Catálogo: Defectos por producto ── */}
      {catDef && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <div className="text-sm font-semibold text-gray-900">Catálogo de defectos por producto</div>
              <button onClick={() => setCatDef(false)} className="inline-flex items-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Selección / alta de producto */}
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className={LBL}>Producto</label>
                  <select className={INP} value={prodEditar} onChange={(e) => setCatProdSel(e.target.value)}>
                    {productos.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {prodEditar && <button onClick={() => delProd(prodEditar)} className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Eliminar producto</button>}
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1"><label className={LBL}>Nuevo producto</label><input className={INP} value={nuevoProd} onChange={(e) => setNuevoProd(e.target.value)} placeholder="p. ej. TOMATE" /></div>
                <button onClick={() => { addProd(nuevoProd); setCatProdSel(nuevoProd.trim().toUpperCase()); setNuevoProd(""); }} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">+ Agregar producto</button>
              </div>

              {/* Defectos del producto seleccionado */}
              {prodEditar && (
                <div className="border border-gray-200 rounded-lg">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-700">Defectos de {prodEditar} ({(defectosCalidad[prodEditar] || []).length})</div>
                  <div className="divide-y divide-gray-100">
                    {(defectosCalidad[prodEditar] || []).map((d) => (
                      <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                        <input value={d.label} onChange={(e) => updDefLabel(prodEditar, d.id, e.target.value)} className={INP + " flex-1"} />
                        <select value={d.cat} onChange={(e) => updDefCat(prodEditar, d.id, e.target.value)} className="text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white">
                          {Object.entries(CATS_QC).map(([k, cfg]) => <option key={k} value={k}>{cfg.label}</option>)}
                        </select>
                        <button onClick={() => delDef(prodEditar, d.id)} className="inline-flex items-center text-gray-300 hover:text-red-500"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2">
                    <button onClick={() => addDef(prodEditar)} className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar defecto</button>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end sticky bottom-0 bg-white">
              <button onClick={() => setCatDef(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Catálogo: Inspectores ── */}
      {catInsp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Inspectores de calidad</div>
              <button onClick={() => setCatInsp(false)} className="inline-flex items-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4">
              {inspectoresCalidad.map((x, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={x} onChange={(e) => updInspector(i, e.target.value)} className={INP} />
                  <button onClick={() => delInspector(i)} className="inline-flex items-center text-gray-300 hover:text-red-500"><X size={14} /></button>
                </div>
              ))}
              <button onClick={addInspector} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar inspector</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatInsp(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Catálogo: Lugares de inspección ── */}
      {catLug && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Lugares de inspección</div>
              <button onClick={() => setCatLug(false)} className="inline-flex items-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4">
              {lugaresCalidad.map((x, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={x} onChange={(e) => updLugar(i, e.target.value)} className={INP} />
                  <button onClick={() => delLugar(i)} className="inline-flex items-center text-gray-300 hover:text-red-500"><X size={14} /></button>
                </div>
              ))}
              <button onClick={addLugar} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar lugar</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatLug(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
