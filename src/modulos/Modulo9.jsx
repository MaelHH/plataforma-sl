import { useState } from "react";
import { useDatos, DEFECTOS_QC, CATS_QC, MAX_MUESTREOS, INSP_VEHICULO, INSP_PRODUCTO } from "../store/datos";
import SearchSelect from "../components/SearchSelect";
import { pctDefecto, pctCategoria, calcQCI } from "./helpers/calidad";
import { generarReporteCalidad, generarReporteInspeccion } from "./reportes/reporteCalidad";
import ColaTabs from "../components/ColaTabs";

// Muestreo vacío. Arrastra lote y fecha del movimiento de campo, y un folio
// consecutivo autogenerado.
const muestreoVacio = (m, folio) => ({
  inspector: "", folio: folio != null ? String(folio) : "", lote: m?.lote || "", pesoMuestra: "", fecha: m?.fecha || hoyISO(),
  defectos: Object.fromEntries(DEFECTOS_QC.map((d) => [d.id, ""])),
  fotos: {}, // 1 foto por defecto: { [defId]: dataURL }
});

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Suma de un campo numérico en los renglones de carga
const sumar = (items, campo) => (items || []).reduce((a, it) => a + (parseFloat(it[campo]) || 0), 0);

// ── Inspección de vehículo y producto (REG-EMP-24) ──
// Texto de los productos del flete para prellenar el campo "Producto".
const productosDeMov = (m) =>
  (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(", ") || m.rancho || "";

// Inspección vacía, prellenada con los datos del flete que ya conocemos.
const inspeccionVacia = (m) => ({
  producto: productosDeMov(m),
  fecha: m.fecha || hoyISO(),
  hora: "",
  remision: m.remision || "",
  tempProducto: "",
  veh: Object.fromEntries(INSP_VEHICULO.map((c) => [c.id, ""])),
  prod: Object.fromEntries(INSP_PRODUCTO.map((c) => [c.id, ""])),
  observaciones: "",
  accionesCorrectivas: "",
  elaboro: "",
  supervisor: "",
});

// ¿Hay al menos un chequeo con resultado indeseable? (para badge en la tabla)
const inspeccionConHallazgo = (insp) =>
  !!insp &&
  (INSP_VEHICULO.some((c) => insp.veh?.[c.id] === c.malo) ||
    INSP_PRODUCTO.some((c) => insp.prod?.[c.id] === c.malo));

export default function Modulo9() {
  const { movimientos, setMovimientos, inspectoresCalidad, setInspectoresCalidad } = useDatos();

  const [recibir, setRecibir] = useState(null); // movimiento que se está recibiendo
  const [form, setForm] = useState(null);
  const [tabRec, setTabRec] = useState("pendientes"); // pendientes | historial
  const [q, setQ] = useState("");
  const [fTipo, setFTipo] = useState(""); // historial: "" | recibido | rechazado
  const [rechazoMov, setRechazoMov] = useState(null); // flete a rechazar
  const [rechazoComent, setRechazoComent] = useState("");

  // ── Muestreo de calidad ──
  const [muestreoMov, setMuestreoMov] = useState(null); // movimiento al que se le hace muestreo
  const [muestreos, setMuestreos] = useState([]); // muestreos en edición (hasta 3)
  const [mActivo, setMActivo] = useState(0); // pestaña activa

  // Siguiente folio de muestreo: máximo numérico existente + 1 (arranca en 201).
  const siguienteFolioMuestreo = () => {
    const nums = [];
    movimientos.forEach((mov) => (mov.muestreos || []).forEach((mu) => { const n = parseInt(mu.folio, 10); if (!isNaN(n)) nums.push(n); }));
    muestreos.forEach((mu) => { const n = parseInt(mu.folio, 10); if (!isNaN(n)) nums.push(n); });
    return nums.length ? Math.max(...nums) + 1 : 201;
  };

  const abrirMuestreo = (m) => {
    const existentes = m.muestreos && m.muestreos.length ? m.muestreos : [muestreoVacio(m, siguienteFolioMuestreo())];
    setMuestreos(existentes);
    setMActivo(0);
    setMuestreoMov(m);
  };
  const cerrarMuestreo = () => { setMuestreoMov(null); setMuestreos([]); setMActivo(0); };

  const updMuestreo = (campo, val) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, [campo]: val } : mu)));
  const updDefecto = (defId, val) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, defectos: { ...mu.defectos, [defId]: val } } : mu)));

  const agregarMuestreo = () => {
    if (muestreos.length >= MAX_MUESTREOS) return;
    setMuestreos((prev) => [...prev, muestreoVacio(muestreoMov, siguienteFolioMuestreo())]);
    setMActivo(muestreos.length);
  };
  const eliminarMuestreo = (idx) => {
    setMuestreos((prev) => prev.filter((_, i) => i !== idx));
    setMActivo((a) => (a >= idx && a > 0 ? a - 1 : a));
  };

  const guardarMuestreo = () => {
    setMovimientos((prev) => prev.map((m) => (m.id === muestreoMov.id ? { ...m, muestreos } : m)));
    cerrarMuestreo();
  };

  // ── Inspección de vehículo y producto (REG-EMP-24) ──
  const [inspMov, setInspMov] = useState(null); // flete al que se le hace la inspección
  const [insp, setInsp] = useState(null);

  const abrirInspeccion = (m) => { setInsp(m.inspeccion ? { ...inspeccionVacia(m), ...m.inspeccion } : inspeccionVacia(m)); setInspMov(m); };
  const cerrarInspeccion = () => { setInspMov(null); setInsp(null); };
  const updInsp = (campo, val) => setInsp((f) => ({ ...f, [campo]: val }));
  const updInspCheck = (grupo, id, val) => setInsp((f) => ({ ...f, [grupo]: { ...f[grupo], [id]: val } }));
  const guardarInspeccion = () => {
    setMovimientos((prev) => prev.map((m) => (m.id === inspMov.id ? { ...m, inspeccion: insp } : m)));
    cerrarInspeccion();
  };

  // Foto (1 por defecto) → se guarda como dataURL base64
  const subirFoto = (defId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, fotos: { ...mu.fotos, [defId]: reader.result } } : mu)));
    reader.readAsDataURL(file);
  };
  const quitarFoto = (defId) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, fotos: { ...mu.fotos, [defId]: undefined } } : mu)));

  // ── Abrir ficha de recepción ──
  const abrirRecepcion = (m) => {
    const par = sumar(m.cargaItems, "parrillas");
    const bul = sumar(m.cargaItems, "bultos");
    const r = m.recepcion || {};
    setForm({
      fechaLlegada: r.fechaLlegada || hoyISO(),
      horaLlegada: r.horaLlegada || "",
      responsable: r.responsable || "",
      // se prellenan con lo declarado para que solo confirmen o ajusten
      parrillasRecibidas: r.parrillasRecibidas ?? String(par || ""),
      bultosRecibidos: r.bultosRecibidos ?? String(bul || ""),
      pesoRecibido: r.pesoRecibido ?? (m.pesoBascula || ""),
      condicion: r.condicion || "ok",
      observaciones: r.observaciones || "",
    });
    setRecibir(m);
  };

  const upd = (campo, val) => setForm((f) => ({ ...f, [campo]: val }));

  const confirmar = () => {
    const recepcion = { ...form, estado: "recibido", confirmado: new Date().toLocaleString("es-MX") };
    setMovimientos((prev) => prev.map((m) => (m.id === recibir.id ? { ...m, recepcion } : m)));
    setRecibir(null);
    setForm(null);
  };

  const reabrir = (id) => {
    if (!window.confirm("¿Reabrir este flete? Volverá a 'Por recibir'.")) return;
    setMovimientos((prev) => prev.map((m) => (m.id === id ? { ...m, recepcion: undefined } : m)));
  };

  // ── Rechazo del flete (desde muestreo o inspección) ──
  const abrirRechazo = (m) => { setRechazoComent(m.recepcion?.comentario || ""); setRechazoMov(m); };
  const confirmarRechazo = () => {
    const recepcion = { estado: "rechazado", comentario: rechazoComent, confirmado: new Date().toLocaleString("es-MX") };
    setMovimientos((prev) => prev.map((m) => (m.id === rechazoMov.id ? { ...m, recepcion } : m)));
    setRechazoMov(null); setRechazoComent("");
    cerrarMuestreo(); cerrarInspeccion();
  };

  const atendido = (m) => m.recepcion?.estado === "recibido" || m.recepcion?.estado === "rechazado";
  const recibidos = movimientos.filter((m) => m.recepcion?.estado === "recibido");
  const rechazados = movimientos.filter((m) => m.recepcion?.estado === "rechazado");
  const pendientes = movimientos.filter((m) => !atendido(m));
  const historialArr = movimientos.filter(atendido);
  const conNovedad = recibidos.filter((m) => m.recepcion?.condicion === "con_novedad");
  const qLow = q.trim().toLowerCase();
  const lista = (tabRec === "pendientes" ? pendientes : historialArr).filter((m) => {
    if (tabRec === "historial" && fTipo && (m.recepcion?.estado || "") !== fTipo) return false;
    if (qLow) {
      const campos = [m.folio, m.remision, m.rancho, m.lote, m.linea, m.chofer, m.origen, m.destino, m.viaje];
      if (!campos.some((c) => String(c ?? "").toLowerCase().includes(qLow))) return false;
    }
    return true;
  });

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const LBL = "text-xs text-gray-500 block mb-0.5";

  // Dropdown de inspector con catálogo compartido (mismo que Aprobación de Calidad).
  // Incluye opción para agregar uno nuevo al vuelo.
  const selectorInspector = (value, onSet) => (
    <SearchSelect className={INP} value={value} placeholder="— Inspector —"
      onChange={(v) => {
        if (v === "__nuevo__") {
          const nombre = (window.prompt("Nombre del inspector:") || "").trim();
          if (nombre) { if (!inspectoresCalidad.includes(nombre)) setInspectoresCalidad((p) => [...p, nombre]); onSet(nombre); }
          return;
        }
        onSet(v);
      }}
      options={[...inspectoresCalidad.map((i) => ({ value: i, label: i })), { value: "__nuevo__", label: "➕ Agregar inspector…" }]} />
  );

  // Compara declarado vs recibido para resaltar diferencias en la ficha
  const declaradoVsRecibido = (m, f) => {
    const par = sumar(m.cargaItems, "parrillas");
    const bul = sumar(m.cargaItems, "bultos");
    const peso = parseFloat(m.pesoBascula) || 0;
    return [
      { l: "Parrillas", sal: par || 0, lle: parseFloat(f.parrillasRecibidas) || 0 },
      { l: "Bultos", sal: bul || 0, lle: parseFloat(f.bultosRecibidos) || 0 },
      { l: "Peso (lb)", sal: peso || 0, lle: parseFloat(f.pesoRecibido) || 0 },
    ];
  };

  const stat = (l, v, c) => (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
      <div className="text-xs text-gray-500 mb-1">{l}</div>
      <div className={`text-xl font-semibold ${c}`}>{v}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Recepción en Empaque</h1>
          <p className="text-sm text-gray-500 mt-0.5">Confirmación de llegada de los fletes que salieron de campo</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">EM</div>
          <span className="text-sm font-medium text-gray-700">Empaque</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-4">
        {stat("Total fletes", movimientos.length, "text-gray-900")}
        {stat("Por recibir", pendientes.length, "text-orange-600")}
        {stat("Recibidos", recibidos.length, "text-green-700")}
        {stat("Rechazados", rechazados.length, "text-red-600")}
        {stat("Con novedad", conNovedad.length, "text-amber-600")}
      </div>

      <ColaTabs tab={tabRec} setTab={setTabRec} tabs={[
        { key: "pendientes", label: "Por recibir", count: pendientes.length },
        { key: "historial", label: "Historial", count: historialArr.length },
      ]} />

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">{tabRec === "pendientes" ? "Fletes por recibir" : "Historial (recibidos y rechazados)"} ({lista.length})</span>
        </div>
        {movimientos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, remisión, rancho, chofer, destino…"
              className="flex-1 min-w-[220px] text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
            {tabRec === "historial" && (
              <div className="w-48"><SearchSelect className={INP} value={fTipo} onChange={setFTipo} placeholder="Tipo: todos"
                options={[{ value: "", label: "Tipo: todos" }, { value: "recibido", label: "Recepción" }, { value: "rechazado", label: "Rechazo" }]} /></div>
            )}
            {(q || fTipo) && <button onClick={() => { setQ(""); setFTipo(""); }} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Limpiar</button>}
          </div>
        )}
        {lista.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">{movimientos.length === 0 ? "Aún no hay fletes. Aparecerán en cuanto se registren en Movimientos." : "Ningún flete coincide con la búsqueda."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "1320px" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Folio</th>
                  <th className="text-left px-3 py-2 font-medium">Fecha salida</th>
                  <th className="text-left px-3 py-2 font-medium">Origen → Destino</th>
                  <th className="text-left px-3 py-2 font-medium">Línea / Chofer</th>
                  <th className="text-left px-3 py-2 font-medium">Producto (carga)</th>
                  <th className="text-right px-3 py-2 font-medium">Parrillas</th>
                  <th className="text-right px-3 py-2 font-medium">Bultos</th>
                  <th className="text-center px-3 py-2 font-medium">Estado</th>
                  <th className="text-center px-3 py-2 font-medium">Tipo</th>
                  <th className="text-center px-3 py-2 font-medium">Calidad (QCI)</th>
                  <th className="text-center px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => {
                  const par = sumar(m.cargaItems, "parrillas");
                  const bul = sumar(m.cargaItems, "bultos");
                  const r = m.recepcion;
                  const recibido = r?.estado === "recibido";
                  const rechazado = r?.estado === "rechazado";
                  const novedad = recibido && r?.condicion === "con_novedad";
                  const nMu = m.muestreos?.length || 0;
                  const qciProm = nMu ? m.muestreos.reduce((a, mu) => a + calcQCI(mu), 0) / nMu : null;
                  return (
                    <tr key={m.id} className={`border-b border-gray-100 ${recibido ? (novedad ? "bg-red-50/40" : "bg-green-50/40") : rechazado ? "bg-red-50/40" : "hover:bg-gray-50"}`}>
                      <td className="px-3 py-2 font-bold text-red-600">{m.folio || "—"}</td>
                      <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{m.fecha || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{m.origen || "—"} → {m.destino || "—"}</td>
                      <td className="px-3 py-2 text-gray-700"><div className="font-medium">{m.linea || "—"}</div><div className="text-gray-400">{m.chofer || "—"}</div></td>
                      <td className="px-3 py-2 text-gray-700">
                        {(m.cargaItems || []).filter((it) => it.prod).length ? (
                          (m.cargaItems || []).filter((it) => it.prod).map((it, i) => (
                            <div key={i} className="whitespace-nowrap"><span className="font-medium">{it.prod}</span>{(it.parrillas || it.bultos) ? <span className="text-gray-400"> · {it.parrillas || 0}p / {it.bultos || 0}b</span> : ""}</div>
                          ))
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{par || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">{bul ? bul.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {recibido ? (
                          <span title={novedad ? "Con novedad (faltante / daño)" : "Recibido completo"} className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-sm ${novedad ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"}`}>
                            {novedad ? "⚠️" : "✓"}
                          </span>
                        ) : rechazado ? (
                          <span title="Rechazado" className="inline-flex items-center justify-center w-7 h-7 rounded-full border text-sm bg-red-100 text-red-700 border-red-200">❌</span>
                        ) : (
                          <span title="Por recibir" className="inline-flex items-center justify-center w-7 h-7 rounded-full border text-sm bg-orange-100 text-orange-700 border-orange-200">⏳</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {recibido ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-semibold whitespace-nowrap">Recepción</span>
                        ) : rechazado ? (
                          <div>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold whitespace-nowrap">Rechazo</span>
                            {r?.comentario && <div className="text-[10px] text-gray-500 mt-0.5 max-w-[160px] mx-auto truncate" title={r.comentario}>{r.comentario}</div>}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {qciProm !== null ? (
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full font-bold ${qciProm >= 90 ? "bg-green-100 text-green-700" : qciProm >= 80 ? "bg-lime-100 text-lime-700" : qciProm >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                            {qciProm.toFixed(2)}%
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                        {nMu > 0 && <div className="text-gray-400 text-[10px] mt-0.5">{nMu}/{MAX_MUESTREOS} muestreo{nMu > 1 ? "s" : ""}</div>}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button onClick={() => abrirMuestreo(m)} className="text-xs px-2 py-1 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 text-indigo-600 mr-1">🔬 {nMu ? "Calidad" : "Muestreo"}</button>
                        <button onClick={() => abrirInspeccion(m)} className={`text-xs px-2 py-1 border rounded-lg bg-white mr-1 ${m.inspeccion ? (inspeccionConHallazgo(m.inspeccion) ? "border-red-200 hover:bg-red-50 text-red-600" : "border-teal-200 hover:bg-teal-50 text-teal-600") : "border-teal-200 hover:bg-teal-50 text-teal-600"}`}>🚛 {m.inspeccion ? (inspeccionConHallazgo(m.inspeccion) ? "Inspección ⚠️" : "Inspección ✓") : "Inspección"}</button>
                        {recibido ? (
                          <>
                            <button onClick={() => abrirRecepcion(m)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 mr-1">👁️ Ver</button>
                            <button onClick={() => reabrir(m.id)} className="text-xs px-2 py-1 border border-amber-200 rounded-lg bg-white hover:bg-amber-50 text-amber-600">↩️ Reabrir</button>
                          </>
                        ) : rechazado ? (
                          <button onClick={() => reabrir(m.id)} className="text-xs px-2 py-1 border border-amber-200 rounded-lg bg-white hover:bg-amber-50 text-amber-600">↩️ Reabrir</button>
                        ) : (
                          <button onClick={() => abrirRecepcion(m)} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700">Dar recepción</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal de recepción ── */}
      {recibir && form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="text-sm font-semibold text-gray-900">Recepción — Folio {recibir.folio || "—"}</div>
              <button onClick={() => { setRecibir(null); setForm(null); }} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Datos declarados (lo que dijeron que salió) */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Lo que salió de campo (declarado)</div>
                <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3">
                  {[
                    ["Rancho", recibir.rancho], ["Origen", recibir.origen], ["Destino", recibir.destino],
                    ["Línea", recibir.linea], ["Chofer", recibir.chofer], ["Placa tracto", recibir.placaTracto],
                    ["No. caja", recibir.economicoCaja], ["Remisión", recibir.remision], ["Flete", recibir.flete ? "$" + recibir.flete : ""],
                  ].map(([l, v]) => (
                    <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                  ))}
                </div>
              </div>

              {/* Confirmación de cantidades: salió vs llegó */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Confirmar cantidades recibidas</div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">Concepto</th>
                        <th className="text-right px-3 py-2 font-medium">Salió</th>
                        <th className="text-right px-3 py-2 font-medium w-32">Llegó</th>
                        <th className="text-right px-3 py-2 font-medium">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {declaradoVsRecibido(recibir, form).map((row, i) => {
                        const dif = row.lle - row.sal;
                        const campo = ["parrillasRecibidas", "bultosRecibidos", "pesoRecibido"][i];
                        return (
                          <tr key={row.l} className="border-t border-gray-100">
                            <td className="px-3 py-1.5 text-gray-700 font-medium">{row.l}</td>
                            <td className="px-3 py-1.5 text-right text-gray-600">{row.sal.toLocaleString()}</td>
                            <td className="px-3 py-1.5">
                              <input type="number" className={INP + " text-right"} value={form[campo]} onChange={(e) => upd(campo, e.target.value)} />
                            </td>
                            <td className={`px-3 py-1.5 text-right font-semibold ${dif === 0 ? "text-gray-400" : "text-red-600"}`}>
                              {dif === 0 ? "✓ ok" : (dif > 0 ? "+" : "") + dif.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Datos de llegada */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos de la recepción</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={LBL}>Fecha de llegada</label><input type="date" className={INP} value={form.fechaLlegada} onChange={(e) => upd("fechaLlegada", e.target.value)} /></div>
                  <div><label className={LBL}>Hora de llegada</label><input type="time" className={INP} value={form.horaLlegada} onChange={(e) => upd("horaLlegada", e.target.value)} /></div>
                  <div><label className={LBL}>Recibe (responsable)</label><input className={INP} value={form.responsable} onChange={(e) => upd("responsable", e.target.value)} placeholder="Nombre de quien recibe" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className={LBL}>Condición de la carga</label>
                    <SearchSelect className={INP} value={form.condicion} onChange={(v) => upd("condicion", v)} options={[
                      { value: "ok", label: "✓ Llegó completo y en buen estado" },
                      { value: "con_novedad", label: "⚠️ Con novedad (faltante / daño)" },
                    ]} />
                  </div>
                  <div><label className={LBL}>Observaciones</label><input className={INP} value={form.observaciones} onChange={(e) => upd("observaciones", e.target.value)} placeholder="Notas de la recepción" /></div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end sticky bottom-0 bg-white">
              <button onClick={() => { setRecibir(null); setForm(null); }} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmar} className="text-xs px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700">✓ Confirmar recepción</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de muestreo de calidad ── */}
      {muestreoMov && muestreos[mActivo] && (() => {
        const mu = muestreos[mActivo];
        const qci = calcQCI(mu);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Control de Calidad — Recepción</div>
                  <div className="text-xs text-gray-500 mt-0.5">Folio {muestreoMov.folio || "—"} · {muestreoMov.rancho || "—"} → {muestreoMov.destino || "—"}</div>
                </div>
                <button onClick={cerrarMuestreo} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
              </div>

              {/* Pestañas de muestreos */}
              <div className="px-5 pt-3 flex items-center gap-2 border-b border-gray-100">
                {muestreos.map((_, i) => (
                  <button key={i} onClick={() => setMActivo(i)}
                    className={`text-xs px-3 py-1.5 rounded-t-lg font-medium border-b-2 -mb-px ${i === mActivo ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    Muestreo {i + 1}
                    {muestreos.length > 1 && <span onClick={(e) => { e.stopPropagation(); eliminarMuestreo(i); }} className="ml-2 text-gray-300 hover:text-red-500">✕</span>}
                  </button>
                ))}
                {muestreos.length < MAX_MUESTREOS && (
                  <button onClick={agregarMuestreo} className="text-xs px-3 py-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium">+ Agregar muestreo</button>
                )}
              </div>

              <div className="px-5 py-4">
                {/* Datos arrastrados del movimiento de campo (solo lectura) */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Datos del movimiento de campo</div>
                  <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-xs">
                    {[["Remisión", muestreoMov.remision], ["Folio", muestreoMov.folio], ["Rancho", muestreoMov.rancho], ["Lote", muestreoMov.lote], ["Viaje / zona", muestreoMov.viaje], ["Consignado", muestreoMov.consignado], ["Distribuidor", muestreoMov.distribuidor], ["Resp. cosecha", muestreoMov.responsableCosecha], ["Origen → Destino", `${muestreoMov.origen || "—"} → ${muestreoMov.destino || "—"}`], ["Fecha salida", muestreoMov.fecha], ["Línea", muestreoMov.linea], ["Chofer", muestreoMov.chofer]].map(([l, v]) => (
                      <div key={l}><span className="text-gray-400">{l}: </span><span className="font-semibold text-gray-700">{v || "—"}</span></div>
                    ))}
                  </div>
                </div>

                {/* Encabezado del muestreo */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div><label className={LBL}>Lote (paredes)</label><input className={INP} value={mu.lote} onChange={(e) => updMuestreo("lote", e.target.value)} placeholder="Paredes" /></div>
                  <div><label className={LBL}>Inspector</label>{selectorInspector(mu.inspector, (v) => updMuestreo("inspector", v))}</div>
                  <div><label className={LBL}>Folio muestreo / ID</label><input className={INP} value={mu.folio} onChange={(e) => updMuestreo("folio", e.target.value)} placeholder="201" /></div>
                  <div><label className={LBL}>Peso muestra</label><input type="number" className={INP} value={mu.pesoMuestra} onChange={(e) => updMuestreo("pesoMuestra", e.target.value)} placeholder="39.30" /></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Tabla de defectos (col 1-2) */}
                  <div className="md:col-span-2 border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                          <th className="text-left px-3 py-2 font-medium">Defecto</th>
                          <th className="text-right px-3 py-2 font-medium w-28">Defectos (g)</th>
                          <th className="text-right px-3 py-2 font-medium w-20">Promedio</th>
                          <th className="text-center px-3 py-2 font-medium w-16">Foto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DEFECTOS_QC.map((d) => {
                          const pct = pctDefecto(mu.defectos[d.id], mu.pesoMuestra);
                          const catColor = { calidad: "border-l-blue-400", condicion: "border-l-amber-400", plaga: "border-l-red-400" }[d.cat];
                          return (
                            <tr key={d.id} className={`border-t border-gray-100 border-l-2 ${catColor}`}>
                              <td className="px-3 py-1 text-gray-700">{d.label}</td>
                              <td className="px-2 py-1"><input type="number" step="0.01" className={INP + " text-right"} value={mu.defectos[d.id]} onChange={(e) => updDefecto(d.id, e.target.value)} placeholder="0.00" /></td>
                              <td className={`px-3 py-1 text-right font-semibold ${pct > 0 ? "text-gray-800" : "text-gray-300"}`}>{pct.toFixed(1)}%</td>
                              <td className="px-2 py-1 text-center">
                                {mu.fotos?.[d.id] ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <a href={mu.fotos[d.id]} target="_blank" rel="noreferrer"><img src={mu.fotos[d.id]} alt="" className="w-7 h-7 object-cover rounded border border-gray-200" /></a>
                                    <button onClick={() => quitarFoto(d.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                                  </div>
                                ) : (
                                  <label className="cursor-pointer text-indigo-400 hover:text-indigo-600 text-base" title="Agregar foto">
                                    📷
                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => subirFoto(d.id, e.target.files?.[0])} />
                                  </label>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen por categoría + QCI (col 3) */}
                  <div className="space-y-3">
                    {Object.entries(CATS_QC).map(([key, cfg]) => {
                      const pct = pctCategoria(mu, key);
                      return (
                        <div key={key} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">{cfg.label}</span>
                          <span className={`text-lg font-bold ${cfg.color}`}>{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                    <div className={`rounded-xl px-4 py-4 text-center ${qci >= 90 ? "bg-green-500" : qci >= 80 ? "bg-lime-500" : qci >= 70 ? "bg-amber-500" : "bg-red-500"}`}>
                      <div className="text-xs font-semibold text-white/90 uppercase">QCI Recepción</div>
                      <div className="text-3xl font-extrabold text-white mt-1">{qci.toFixed(2)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-between items-center sticky bottom-0 bg-white">
                <div className="flex gap-2">
                  <button onClick={() => generarReporteCalidad(muestreoMov, muestreos)} className="text-xs px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 flex items-center gap-1">📄 Generar PDF</button>
                  <button onClick={() => abrirRechazo(muestreoMov)} className="text-xs px-4 py-2 border border-red-300 text-red-600 rounded-lg font-semibold hover:bg-red-50">🚫 Rechazar flete</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={cerrarMuestreo} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                  <button onClick={guardarMuestreo} className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">💾 Guardar muestreo{muestreos.length > 1 ? "s" : ""}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal de inspección de vehículo y producto (REG-EMP-24) ── */}
      {inspMov && insp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <div className="text-sm font-semibold text-gray-900">Inspección de vehículo y producto que llega a la planta</div>
                <div className="text-xs text-gray-500 mt-0.5">REG-EMP-24 · Folio {inspMov.folio || "—"} · {inspMov.linea || "—"} · {inspMov.chofer || "—"}</div>
              </div>
              <button onClick={cerrarInspeccion} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Encabezado del registro */}
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-1"><label className={LBL}>Producto</label><input className={INP} value={insp.producto} onChange={(e) => updInsp("producto", e.target.value)} placeholder="Producto" /></div>
                <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={insp.fecha} onChange={(e) => updInsp("fecha", e.target.value)} /></div>
                <div><label className={LBL}>Hora</label><input type="time" className={INP} value={insp.hora} onChange={(e) => updInsp("hora", e.target.value)} /></div>
                <div><label className={LBL}>No. de remisión</label><input className={INP} value={insp.remision} onChange={(e) => updInsp("remision", e.target.value)} placeholder="Remisión" /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vehículo */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">VEHÍCULO (SI / NO)</div>
                  <div className="divide-y divide-gray-100">
                    {INSP_VEHICULO.map((c) => {
                      const malo = insp.veh[c.id] === c.malo;
                      return (
                        <div key={c.id} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs text-gray-700">{c.label}</span>
                          <SearchSelect value={insp.veh[c.id]} onChange={(v) => updInspCheck("veh", c.id, v)} placeholder="—"
                            className={`text-xs px-2 py-1 border rounded-md focus:outline-none ${malo ? "border-red-300 bg-red-50 text-red-700 font-semibold" : "border-gray-200 bg-white"}`}
                            options={[
                              { value: "si", label: "SI" },
                              { value: "no", label: "NO" },
                            ]} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Condiciones del producto */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">CONDICIONES DEL PRODUCTO (SI / NO)</div>
                  <div className="divide-y divide-gray-100">
                    {INSP_PRODUCTO.map((c) => {
                      const malo = insp.prod[c.id] === c.malo;
                      return (
                        <div key={c.id} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs text-gray-700">{c.label}</span>
                          <SearchSelect value={insp.prod[c.id]} onChange={(v) => updInspCheck("prod", c.id, v)} placeholder="—"
                            className={`text-xs px-2 py-1 border rounded-md focus:outline-none ${malo ? "border-red-300 bg-red-50 text-red-700 font-semibold" : "border-gray-200 bg-white"}`}
                            options={[
                              { value: "si", label: "SI" },
                              { value: "no", label: "NO" },
                            ]} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div><label className={LBL}>Temperatura interna del producto (°F)</label><input type="number" step="0.1" className={INP} value={insp.tempProducto} onChange={(e) => updInsp("tempProducto", e.target.value)} placeholder="°F" /></div>
                <div className="col-span-2"><label className={LBL}>Observaciones y/o acciones correctivas</label><input className={INP} value={insp.observaciones} onChange={(e) => updInsp("observaciones", e.target.value)} placeholder="Observaciones" /></div>
              </div>

              <div>
                <label className={LBL}>Acciones correctivas</label>
                <textarea rows={2} className={INP} value={insp.accionesCorrectivas} onChange={(e) => updInsp("accionesCorrectivas", e.target.value)} placeholder="Acciones correctivas tomadas" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><label className={LBL}>Elaboró (inspector)</label>{selectorInspector(insp.elaboro, (v) => updInsp("elaboro", v))}</div>
                <div><label className={LBL}>Nombre del supervisor</label>{selectorInspector(insp.supervisor, (v) => updInsp("supervisor", v))}</div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-between items-center sticky bottom-0 bg-white">
              <div className="flex gap-2">
                <button onClick={() => generarReporteInspeccion(insp)} className="text-xs px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 flex items-center gap-1">📄 Generar PDF</button>
                <button onClick={() => abrirRechazo(inspMov)} className="text-xs px-4 py-2 border border-red-300 text-red-600 rounded-lg font-semibold hover:bg-red-50">🚫 Rechazar flete</button>
              </div>
              <div className="flex gap-2">
                <button onClick={cerrarInspeccion} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                <button onClick={guardarInspeccion} className="text-xs px-4 py-2 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700">💾 Guardar inspección</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de rechazo del flete ── */}
      {rechazoMov && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">🚫 Rechazar flete — Folio {rechazoMov.folio || "—"}</div>
              <div className="text-xs text-gray-500 mt-0.5">El flete saldrá de "Por recibir" y pasará al Historial como Rechazo.</div>
            </div>
            <div className="px-5 py-4">
              <label className={LBL}>¿Qué se hará con el flete? (comentario)</label>
              <textarea className={INP} rows={4} value={rechazoComent} onChange={(e) => setRechazoComent(e.target.value)}
                placeholder="Ej: se regresa a campo / se reprocesa / se destina a merma / se notifica a calidad…" />
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => { setRechazoMov(null); setRechazoComent(""); }} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmarRechazo} className="text-xs px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">Confirmar rechazo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
