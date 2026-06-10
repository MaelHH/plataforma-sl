import { useState } from "react";
import { useDatos, DEFECTOS_QC, CATS_QC, MAX_MUESTREOS, INSP_VEHICULO, INSP_PRODUCTO } from "../store/datos";
import SearchSelect from "../components/SearchSelect";
import { pctDefecto, pctCategoria, calcQCI } from "./helpers/calidad";
import { generarReporteCalidad, generarReporteInspeccion } from "./reportes/reporteCalidad";
import ColaTabs from "../components/ColaTabs";
import AvisoSAP from "../components/AvisoSAP";

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

// ── Vaciado a Empaque ── Se maneja TODO en kg (la unidad que manda).
// Solo en la visual "Vaciado por hora" mostramos bins teóricos = kg / 240.
const KG_POR_BIN_TEO = 240;
const fmt = (n) => Math.round(n || 0).toLocaleString();
// kg recibido: si no se capturó a mano, usa el PESO de la recepción (lo que realmente llegó).
const kgRecibidosDe = (m) => (m.vaciado && "kgRecibidos" in m.vaciado)
  ? (parseFloat(m.vaciado.kgRecibidos) || 0)
  : (parseFloat(m.recepcion?.pesoRecibido) || 0);
const kgVaciadosDe = (m) => (m.vaciado?.eventos || []).reduce((a, e) => a + (parseFloat(e.kg) || 0), 0);
// Mermado = kg que NO entraron a empaque (se descartan); también salen del piso.
const kgMermadosDe = (m) => (m.vaciado?.mermas || []).reduce((a, e) => a + (parseFloat(e.kg) || 0), 0);
const kgEnPisoDe = (m) => Math.max(0, kgRecibidosDe(m) - kgVaciadosDe(m) - kgMermadosDe(m));

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
  const [tabRec, setTabRec] = useState("pendientes"); // pendientes | vaciado | historial
  const [vaciarMov, setVaciarMov] = useState(null); // movimiento al que se le registra un vaciado
  const [vaciarKg, setVaciarKg] = useState("");
  const [mermarMov, setMermarMov] = useState(null); // movimiento al que se le registra una merma (no entró a empaque)
  const [mermarKg, setMermarKg] = useState("");
  const [mermarMotivo, setMermarMotivo] = useState("");
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

  // ⚠️ [SAP] Al dar recepción se generará en SAP: una ORDEN DE PRODUCCIÓN (materia prima)
  // y una ORDEN DE COMPRA (flete, documentado). Integración pendiente — ver docs/CLAUDE.md.
  const confirmar = () => {
    const recepcion = { ...form, estado: "recibido", confirmado: new Date().toLocaleString("es-MX") };
    setMovimientos((prev) => prev.map((m) => (m.id === recibir.id ? { ...m, recepcion } : m)));
    setRecibir(null);
    setForm(null);
  };

  const reabrir = (id) => {
    if (!window.confirm("¿Reabrir este flete? Volverá a 'Por recibir' y se borrará el vaciado registrado.")) return;
    setMovimientos((prev) => prev.map((m) => (m.id === id ? { ...m, recepcion: undefined, vaciado: undefined } : m)));
  };

  // ── Vaciado a Empaque ── (todo en kg, capturado a mano)
  // base() conserva todo el objeto vaciado (incluye mermas) para no perder datos al editar.
  const baseVac = (m) => ({ eventos: [], mermas: [], ...(m.vaciado || {}) });
  const setRecibido = (id, campo, val) =>
    setMovimientos((prev) => prev.map((m) => (m.id === id
      ? { ...m, vaciado: { ...baseVac(m), [campo]: val } }
      : m)));
  const abrirVaciar = (m) => { setVaciarKg(""); setVaciarMov(m); };
  const confirmarVaciado = () => {
    const kg = parseFloat(vaciarKg) || 0;
    if (kg <= 0) { setVaciarMov(null); return; }
    const hora = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const ev = { kg, hora };
    setMovimientos((prev) => prev.map((m) => (m.id === vaciarMov.id
      ? { ...m, vaciado: { ...baseVac(m), eventos: [...(m.vaciado?.eventos || []), ev] } }
      : m)));
    setVaciarMov(null); setVaciarKg("");
  };
  // Cancela un vaciado registrado: lo quita de eventos → sus kg vuelven al piso.
  const cancelarVaciado = (movId, idx) =>
    setMovimientos((prev) => prev.map((m) => (m.id === movId
      ? { ...m, vaciado: { ...m.vaciado, eventos: (m.vaciado?.eventos || []).filter((_, i) => i !== idx) } }
      : m)));

  // ── Mermado (no entró a empaque) ── también descuenta del piso.
  const abrirMermar = (m) => { setMermarKg(""); setMermarMotivo(""); setMermarMov(m); };
  const confirmarMerma = () => {
    const kg = parseFloat(mermarKg) || 0;
    if (kg <= 0) { setMermarMov(null); return; }
    const hora = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    const ev = { kg, hora, motivo: mermarMotivo.trim() };
    setMovimientos((prev) => prev.map((m) => (m.id === mermarMov.id
      ? { ...m, vaciado: { ...baseVac(m), mermas: [...(m.vaciado?.mermas || []), ev] } }
      : m)));
    setMermarMov(null); setMermarKg(""); setMermarMotivo("");
  };
  // Cancela una merma registrada: vuelve al piso.
  const cancelarMerma = (movId, idx) =>
    setMovimientos((prev) => prev.map((m) => (m.id === movId
      ? { ...m, vaciado: { ...m.vaciado, mermas: (m.vaciado?.mermas || []).filter((_, i) => i !== idx) } }
      : m)));

  // ── Rechazo del flete (desde muestreo o inspección) ──
  const abrirRechazo = (m) => { setRechazoComent(m.recepcion?.comentario || ""); setRechazoMov(m); };
  const confirmarRechazo = () => {
    const recepcion = { estado: "rechazado", comentario: rechazoComent, confirmado: new Date().toLocaleString("es-MX") };
    setMovimientos((prev) => prev.map((m) => (m.id === rechazoMov.id ? { ...m, recepcion, vaciado: undefined } : m)));
    setRechazoMov(null); setRechazoComent("");
    cerrarMuestreo(); cerrarInspeccion();
  };

  const atendido = (m) => m.recepcion?.estado === "recibido" || m.recepcion?.estado === "rechazado";
  const recibidos = movimientos.filter((m) => m.recepcion?.estado === "recibido");
  // El kg es lo que manda (los bins son guía a grosso modo): "completo" = sin kg en piso.
  const vaciadoCompleto = (m) => kgRecibidosDe(m) > 0 && kgEnPisoDe(m) === 0;
  const enPisoLista = recibidos.filter((m) => !vaciadoCompleto(m));   // pestaña "Vaciado a Empaque"
  // Historiales: manifiestos sin kg en piso, separados por a dónde se fue el producto.
  const vaciadosHist = recibidos.filter((m) => vaciadoCompleto(m) && kgVaciadosDe(m) > 0);  // entraron a empaque
  const mermadosHist = recibidos.filter((m) => vaciadoCompleto(m) && kgMermadosDe(m) > 0);  // NO entraron (merma)
  const filasVac = tabRec === "histVaciado" ? vaciadosHist : tabRec === "histMermado" ? mermadosHist : enPisoLista;
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

  // Totales del día para el resumen de Vaciado a Empaque (sobre los recibidos), todo en kg.
  const totKgRec = recibidos.reduce((a, m) => a + kgRecibidosDe(m), 0);
  const totKgVac = recibidos.reduce((a, m) => a + kgVaciadosDe(m), 0);
  const totKgMer = recibidos.reduce((a, m) => a + kgMermadosDe(m), 0);
  const totKgPiso = recibidos.reduce((a, m) => a + kgEnPisoDe(m), 0);

  // Desglose por hora: agrupa los vaciados del día por franja horaria (kg; bins teóricos = kg/240).
  const porHora = (() => {
    const acc = {};
    recibidos.forEach((m) => (m.vaciado?.eventos || []).forEach((e) => {
      const h = String(e.hora || "").split(":")[0] || "—";
      if (!acc[h]) acc[h] = { kg: 0 };
      acc[h].kg += parseFloat(e.kg) || 0;
    }));
    return Object.entries(acc).sort((a, b) => a[0].localeCompare(b[0]));
  })();

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
      { l: "Peso (kg)", sal: peso || 0, lle: parseFloat(f.pesoRecibido) || 0 },
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
          <h1 className="text-base font-semibold text-gray-900">Empaque</h1>
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

      <AvisoSAP>Al dar recepción se generará en SAP una <b>orden de producción</b> (materia prima) y una <b>orden de compra</b> (flete).</AvisoSAP>

      <ColaTabs tab={tabRec} setTab={setTabRec} tabs={[
        { key: "pendientes", label: "Por recibir", count: pendientes.length },
        { key: "vaciado", label: "Vaciado a Empaque", count: enPisoLista.length },
        { key: "historial", label: "Historial por Recibir", count: historialArr.length },
        { key: "histVaciado", label: "Historial Vaciado a Empaque", count: vaciadosHist.length },
        { key: "histMermado", label: "Historial Mermado (No entró a Empaque)", count: mermadosHist.length },
      ]} />

      {tabRec === "vaciado" || tabRec === "histVaciado" || tabRec === "histMermado" ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-900">
              {tabRec === "histVaciado"
                ? `Vaciados completos (${vaciadosHist.length})`
                : tabRec === "histMermado"
                  ? `Mermados — no entraron a empaque (${mermadosHist.length})`
                  : `En piso para vaciar a producción (${enPisoLista.length})`}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              {tabRec === "histVaciado"
                ? "· manifiestos ya vaciados por completo (en piso = 0)"
                : tabRec === "histMermado"
                  ? "· manifiestos terminados con kg que NO entraron a empaque"
                  : "· captura los kg recibidos; vacía a empaque o marca merma (no entró)"}
            </span>
          </div>
          {filasVac.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8 italic">
              {tabRec === "histVaciado"
                ? "Aún no hay manifiestos vaciados por completo. Cuando un flete llega a 0 en piso aparece aquí."
                : tabRec === "histMermado"
                  ? "Aún no hay mermas. Cuando marques kg que no entraron a empaque aparecen aquí."
                  : "No hay fletes en piso por vaciar. Al dar recepción pasan aquí para vaciarlos a producción."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "960px" }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <th className="text-left px-3 py-2 font-medium">Folio / Remisión</th>
                    <th className="text-left px-3 py-2 font-medium">Producto</th>
                    <th className="text-center px-3 py-2 font-medium">Recibido (kg)</th>
                    <th className="text-left px-3 py-2 font-medium">Vaciados a empaque</th>
                    <th className="text-left px-3 py-2 font-medium">Mermados (no entró)</th>
                    <th className="text-right px-3 py-2 font-medium">Piso (inventario)</th>
                    <th className="text-center px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filasVac.map((m) => {
                    const recK = kgRecibidosDe(m);
                    const pisoK = kgEnPisoDe(m);
                    const vacK = kgVaciadosDe(m);
                    const merK = kgMermadosDe(m);
                    const ev = m.vaciado?.eventos || [];
                    const mer = m.vaciado?.mermas || [];
                    const prod = (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(", ") || "—";
                    const completo = recK > 0 && pisoK === 0;  // kg manda
                    const rcp = m.recepcion || {};
                    // kg recibido a mostrar en el input: lo capturado, o el peso de la recepción.
                    const kgRecVal = (m.vaciado && "kgRecibidos" in m.vaciado) ? m.vaciado.kgRecibidos : (rcp.pesoRecibido ?? "");
                    return (
                      <tr key={m.id} className={`border-b border-gray-100 ${completo ? "bg-green-50/40" : "hover:bg-gray-50"}`}>
                        <td className="px-3 py-2 font-bold text-red-600 whitespace-nowrap align-top">{m.remision || m.folio || "—"}</td>
                        <td className="px-3 py-2 text-gray-700 align-top">{prod}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" className="w-24 text-right text-xs px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400" value={kgRecVal} onChange={(e) => setRecibido(m.id, "kgRecibidos", e.target.value)} placeholder="kg" />
                            <span className="text-[10px] text-gray-400">kg</span>
                          </div>
                          <div className="text-[10px] text-gray-400 text-center mt-1 leading-tight">peso recepción: {fmt(parseFloat(rcp.pesoRecibido) || 0)} kg</div>
                        </td>
                        <td className="px-3 py-2 text-gray-600 align-top">
                          {vacK > 0 ? (
                            <div>
                              <span className="font-semibold text-green-700">{fmt(vacK)} kg</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {ev.map((e, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                                    {e.hora} · {fmt(e.kg)} kg
                                    <button onClick={() => cancelarVaciado(m.id, i)} title="Cancelar este vaciado (regresa al piso)" className="text-red-400 hover:text-red-600 font-bold leading-none text-xs">×</button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600 align-top">
                          {merK > 0 ? (
                            <div>
                              <span className="font-semibold text-red-700">{fmt(merK)} kg</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {mer.map((e, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 rounded px-1.5 py-0.5" title={e.motivo || ""}>
                                    {e.hora} · {fmt(e.kg)} kg{e.motivo ? ` · ${e.motivo}` : ""}
                                    <button onClick={() => cancelarMerma(m.id, i)} title="Cancelar esta merma (regresa al piso)" className="text-red-400 hover:text-red-700 font-bold leading-none text-xs">×</button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap align-top">
                          {completo
                            ? <span className="font-semibold text-green-700">✓ sin piso</span>
                            : recK > 0
                              ? <div>
                                  <span className="font-semibold text-amber-700">{fmt(pisoK)} kg</span>
                                  <div className="text-[10px] text-gray-400">rec {fmt(recK)} − vac {fmt(vacK)}{merK ? ` − mer ${fmt(merK)}` : ""} = {fmt(pisoK)} kg</div>
                                </div>
                              : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          {recK > 0 && !completo && (
                            <div className="flex flex-col gap-1 items-stretch min-w-[96px]">
                              <button onClick={() => abrirVaciar(m)} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 whitespace-nowrap">⬇️ Vaciar</button>
                              <button onClick={() => abrirMermar(m)} className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 whitespace-nowrap">⚠️ Mermar</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 grid md:grid-cols-2 gap-4">
            {/* Resumen del día */}
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Resumen del día (kg)</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Recibidos", totKgRec, "text-gray-900"],
                  ["Vaciados a empaque", totKgVac, "text-green-700"],
                  ["Mermados (no entró)", totKgMer, "text-red-700"],
                  ["En piso", totKgPiso, "text-amber-700"],
                ].map(([l, k, c]) => (
                  <div key={l} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-center">
                    <div className="text-[10px] text-gray-500 mb-1">{l}</div>
                    <div className={`text-xl font-bold ${c}`}>{fmt(k)} <span className="text-xs font-medium">kg</span></div>
                  </div>
                ))}
              </div>
            </div>
            {/* Desglose por hora (kg + bins teóricos de 240 kg) */}
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Vaciado por hora <span className="text-gray-300 normal-case">· bins teóricos = kg / 240</span></div>
              {porHora.length === 0 ? (
                <div className="text-xs text-gray-400 italic py-2">Aún no se registran vaciados hoy.</div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                        <th className="text-left px-3 py-1.5 font-medium">Hora</th>
                        <th className="text-right px-3 py-1.5 font-medium">Kg</th>
                        <th className="text-right px-3 py-1.5 font-medium">Bins teóricos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porHora.map(([h, v]) => (
                        <tr key={h} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-1.5 font-medium text-gray-700">{h}:00 – {String(Number(h) + 1).padStart(2, "0")}:00</td>
                          <td className="px-3 py-1.5 text-right text-gray-700">{fmt(v.kg)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">≈{(v.kg / KG_POR_BIN_TEO).toFixed(1)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold text-gray-800">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right">{fmt(totKgVac)}</td>
                        <td className="px-3 py-1.5 text-right">≈{(totKgVac / KG_POR_BIN_TEO).toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
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
            <table className="w-full text-xs" style={{ minWidth: "1000px" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <th className="text-left px-2 py-2 font-medium">Folio</th>
                  <th className="text-left px-2 py-2 font-medium">Fecha</th>
                  <th className="text-left px-2 py-2 font-medium">Ruta</th>
                  <th className="text-left px-2 py-2 font-medium">Línea / Chofer</th>
                  <th className="text-left px-2 py-2 font-medium">Producto</th>
                  <th className="text-right px-2 py-2 font-medium">Parr/Bultos</th>
                  <th className="text-center px-2 py-2 font-medium">Estado</th>
                  <th className="text-center px-2 py-2 font-medium">QCI</th>
                  <th className="text-center px-2 py-2 font-medium"></th>
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
                      <td className="px-2 py-2 font-bold text-red-600">{m.folio || "—"}</td>
                      <td className="px-2 py-2 font-semibold text-gray-700 whitespace-nowrap">{m.fecha || "—"}</td>
                      <td className="px-2 py-2 text-gray-600">{m.origen || "—"} → {m.destino || "—"}</td>
                      <td className="px-2 py-2 text-gray-700"><div className="font-medium">{m.linea || "—"}</div><div className="text-gray-400">{m.chofer || "—"}</div></td>
                      <td className="px-2 py-2 text-gray-700">
                        {(m.cargaItems || []).filter((it) => it.prod).length ? (
                          (m.cargaItems || []).filter((it) => it.prod).map((it, i) => (
                            <div key={i} className="whitespace-nowrap"><span className="font-medium">{it.prod}</span>{(it.parrillas || it.bultos) ? <span className="text-gray-400"> · {it.parrillas || 0}p / {it.bultos || 0}b</span> : ""}</div>
                          ))
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap"><span className="font-semibold text-green-700">{par || 0}</span><span className="text-gray-300"> / </span><span className="font-semibold text-blue-700">{bul ? bul.toLocaleString() : 0}</span></td>
                      <td className="px-2 py-2 text-center">
                        {recibido ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span title={novedad ? "Con novedad (faltante / daño)" : "Recibido completo"} className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-sm ${novedad ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"}`}>{novedad ? "⚠️" : "✓"}</span>
                            <span className="text-[10px] text-green-700 font-semibold">Recepción</span>
                          </div>
                        ) : rechazado ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span title="Rechazado" className="inline-flex items-center justify-center w-6 h-6 rounded-full border text-sm bg-red-100 text-red-700 border-red-200">❌</span>
                            <span className="text-[10px] text-red-700 font-semibold">Rechazo</span>
                            {r?.comentario && <div className="text-[9px] text-gray-500 max-w-[110px] truncate" title={r.comentario}>{r.comentario}</div>}
                          </div>
                        ) : (
                          <span title="Por recibir" className="inline-flex items-center justify-center w-6 h-6 rounded-full border text-sm bg-orange-100 text-orange-700 border-orange-200">⏳</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {qciProm !== null ? (
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full font-bold ${qciProm >= 90 ? "bg-green-100 text-green-700" : qciProm >= 80 ? "bg-lime-100 text-lime-700" : qciProm >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                            {qciProm.toFixed(2)}%
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                        {nMu > 0 && <div className="text-gray-400 text-[10px] mt-0.5">{nMu}/{MAX_MUESTREOS} muestreo{nMu > 1 ? "s" : ""}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1 items-stretch min-w-[108px]">
                          <button onClick={() => abrirMuestreo(m)} className="text-xs px-2 py-1 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 text-indigo-600">🔬 {nMu ? "Calidad" : "Muestreo"}</button>
                          <button onClick={() => abrirInspeccion(m)} className={`text-xs px-2 py-1 border rounded-lg bg-white ${m.inspeccion ? (inspeccionConHallazgo(m.inspeccion) ? "border-red-200 hover:bg-red-50 text-red-600" : "border-teal-200 hover:bg-teal-50 text-teal-600") : "border-teal-200 hover:bg-teal-50 text-teal-600"}`}>🚛 {m.inspeccion ? (inspeccionConHallazgo(m.inspeccion) ? "Inspección ⚠️" : "Inspección ✓") : "Inspección"}</button>
                          {recibido ? (
                            <>
                              <button onClick={() => abrirRecepcion(m)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600">👁️ Ver</button>
                              <button onClick={() => reabrir(m.id)} className="text-xs px-2 py-1 border border-amber-200 rounded-lg bg-white hover:bg-amber-50 text-amber-600">↩️ Reabrir</button>
                            </>
                          ) : rechazado ? (
                            <button onClick={() => reabrir(m.id)} className="text-xs px-2 py-1 border border-amber-200 rounded-lg bg-white hover:bg-amber-50 text-amber-600">↩️ Reabrir</button>
                          ) : (
                            <button onClick={() => abrirRecepcion(m)} className="text-xs bg-emerald-600 text-white px-2 py-1.5 rounded-lg font-medium hover:bg-emerald-700">Dar recepción</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

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

      {/* ── Modal: registrar vaciado a producción ── */}
      {vaciarMov && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">⬇️ Vaciar a producción — {vaciarMov.remision || vaciarMov.folio || "—"}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Disponible en piso: <b>{fmt(kgEnPisoDe(vaciarMov))} kg</b></span>
                {kgEnPisoDe(vaciarMov) > 0 && (
                  <button type="button" onClick={() => setVaciarKg(String(kgEnPisoDe(vaciarMov)))}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 underline">usar todo el piso</button>
                )}
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className={LBL}>Kg vaciados</label>
                <input type="number" className={INP} value={vaciarKg} onChange={(e) => setVaciarKg(e.target.value)} placeholder="Ej: 1,180" autoFocus />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setVaciarMov(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmarVaciado} className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">Registrar vaciado</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: registrar merma (no entró a empaque) ── */}
      {mermarMov && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">⚠️ Mermar (no entró a empaque) — {mermarMov.remision || mermarMov.folio || "—"}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Disponible en piso: <b>{fmt(kgEnPisoDe(mermarMov))} kg</b> · se descartan (no se procesan).</span>
                {kgEnPisoDe(mermarMov) > 0 && (
                  <button type="button" onClick={() => setMermarKg(String(kgEnPisoDe(mermarMov)))}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 underline">usar todo el piso</button>
                )}
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className={LBL}>Kg mermados</label>
                <input type="number" className={INP} value={mermarKg} onChange={(e) => setMermarKg(e.target.value)} placeholder="Ej: 480" autoFocus />
              </div>
              <div>
                <label className={LBL}>Motivo (opcional)</label>
                <input className={INP} value={mermarMotivo} onChange={(e) => setMermarMotivo(e.target.value)} placeholder="Ej: dañado / podrido / fuera de especificación…" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setMermarMov(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmarMerma} className="text-xs px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">Registrar merma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
