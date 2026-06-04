import { EMPRESAS, PRECARGA_PREGUNTAS, ALERGENOS_MX } from "../../store/datos";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dash = (v) => (v === 0 || v ? esc(v) : "—");

const EVENTOS = [
  { id: "preenfriado", label: "Preenfriado ❄️" },
  { id: "tive", label: "Evidencia de TIVE 🛰️" },
  { id: "retenes", label: "Evidencia de Retenes 🚧" },
  { id: "aduanas", label: "Aduanas y Descargas 🛃" },
  { id: "accidente", label: "Evidencia de Accidente ⚠️" },
];

const infoGrid = (pares, cols = 4) =>
  `<div class="info" style="grid-template-columns:repeat(${cols},1fr)">${pares
    .map(([l, v]) => `<div><label>${esc(l)}</label><span>${dash(v) || "—"}</span></div>`)
    .join("")}</div>`;

// ── Expediente de Exportación: todo lo del flete después del programa semanal ──
// (datos del flete + qué llevaba + inspección precarga REG-EMP-15 + monitoreo en ruta)
export function generarExpedienteExportacion(trailer, carga, monitoreoTrailer) {
  const t = trailer;
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }

  // Qué llevaba (de Evidencias/Embarques)
  let seccionCarga = `<h2>Qué llevaba</h2>`;
  if (carga) {
    const emps = carga.consolidado ? (carga.empresasSel || []) : (carga.empresasSel || []).slice(0, 1);
    const filasEmp = emps.map((eid) => {
      const emp = EMPRESAS.find((e) => e.id === eid);
      const dist = carga.distEmpresas?.[eid] || [];
      const parrAsignadas = dist.filter((p) => p && p.prod).length;
      const manifiesto = carga.manifiestos?.[eid] || "";
      return `<tr><td>${esc(emp?.label || eid)}</td><td style="text-align:right">${parrAsignadas}</td><td>${esc(manifiesto) || "—"}</td></tr>`;
    }).join("") || `<tr><td colspan="3" style="text-align:center;color:#999">Sin empresas asignadas</td></tr>`;
    seccionCarga += `
      ${infoGrid([
        ["Consolidado", carga.consolidado ? "Sí" : "No"],
        ["Fotos de carga", `${carga.cargaFotos ?? 0}/30`],
        ["Fotos frontales", `${carga.frontalFotos ?? 0}`],
        ["Estado SAP", carga.sapStatus],
      ])}
      <table>
        <thead><tr><th>Empresa</th><th style="text-align:right">Parrillas asignadas</th><th>Manifiesto</th></tr></thead>
        <tbody>${filasEmp}</tbody>
      </table>`;
  } else {
    seccionCarga += `<p class="vacio">Sin evidencias de carga registradas para este flete.</p>`;
  }

  // Inspección precarga REG-EMP-15
  const ip = t.inspeccionPrecarga;
  let seccionPrecarga = `<h2>Inspección precarga (REG-EMP-15)</h2>`;
  if (ip) {
    const hallazgos = PRECARGA_PREGUNTAS.filter((p) => ip.respuestas?.[p.id] && ip.respuestas[p.id] === p.malo);
    const filas = PRECARGA_PREGUNTAS.map((p) => {
      const r = ip.respuestas?.[p.id] || "";
      const malo = r && r === p.malo;
      return `<tr><td style="text-align:center">${p.num}</td><td>${esc(p.label)}</td><td style="text-align:center;font-weight:700;color:${malo ? "#dc2626" : "#16a34a"}">${r ? r.toUpperCase() : "—"}</td></tr>`;
    }).join("");
    const alergSi = ALERGENOS_MX.filter((a) => ip.alergenos?.[a] === "Sí");
    seccionPrecarga += `
      ${infoGrid([
        ["Manifiesto", ip.manifiesto], ["Hallazgos", `${hallazgos.length}`],
        ["Temp. llegada (°F)", ip.tempLlegada], ["Temp. al abrir (°F)", ip.tempAbrioPuerta],
        ["Sanitizó caja", ip.sanitizoCaja], ["Sanitizante", ip.sanitizante],
        ["¿Conoce alérgenos?", ip.conoceAlergenos ? ip.conoceAlergenos.toUpperCase() : ""],
        ["Alérgenos en operación", alergSi.length ? alergSi.join(", ") : "Ninguno"],
      ])}
      <table>
        <thead><tr><th style="width:30px;text-align:center">#</th><th>Punto a revisar</th><th style="width:80px;text-align:center">Resultado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>`;
  } else {
    seccionPrecarga += `<p class="vacio">Sin inspección precarga registrada para este flete.</p>`;
  }

  // Monitoreo en ruta
  let seccionMonitoreo = `<h2>Monitoreo en ruta</h2>`;
  const mon = monitoreoTrailer || {};
  const filasMon = EVENTOS.map((ev) => {
    const e = mon[ev.id];
    const hubo = e?.hubo;
    const estado = hubo === true ? "Sí" : hubo === false ? "No" : "—";
    const fotos = Array.isArray(e?.fotos) ? e.fotos.filter(Boolean).length : 0;
    return `<tr><td>${esc(ev.label)}</td><td style="text-align:center;font-weight:700">${estado}</td><td>${esc(e?.responsable) || "—"}</td><td style="text-align:right">${fotos}</td></tr>`;
  }).join("");
  seccionMonitoreo += `
    <table>
      <thead><tr><th>Evento</th><th style="text-align:center;width:60px">¿Hubo?</th><th>Responsable</th><th style="text-align:right;width:60px">Fotos</th></tr></thead>
      <tbody>${filasMon}</tbody>
    </table>`;

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
    <title>Expediente Exportación - ${esc(t.linea) || ""} ${esc(t.dest) || ""}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Arial, sans-serif; color: #1f2937; margin: 28px; font-size: 12px; }
      h1 { font-size: 18px; margin: 0; color: #1d4ed8; }
      h2 { font-size: 13px; margin: 20px 0 6px; color: #1e40af; border-bottom: 1px solid #dbeafe; padding-bottom: 3px; }
      .sub { color: #6b7280; font-size: 12px; margin: 2px 0 14px; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
      .logo { font-weight: 800; font-size: 22px; color: #1d4ed8; }
      .info { display: grid; gap: 8px; margin: 10px 0; }
      .info div { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px; }
      .info label { display: block; color: #9ca3af; font-size: 10px; text-transform: uppercase; }
      .info span { font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th { background: #f3f4f6; text-align: left; padding: 5px 8px; font-size: 10px; color: #6b7280; text-transform: uppercase; border: 1px solid #e5e7eb; }
      td { padding: 4px 8px; border: 1px solid #eee; }
      .vacio { font-size: 11px; color: #9ca3af; font-style: italic; }
      @media print { body { margin: 12mm; } }
    </style></head><body>
    <div class="head">
      <div>
        <h1>Expediente de Exportación</h1>
        <div class="sub">SL Logística · expediente del flete</div>
      </div>
      <div class="logo">SL</div>
    </div>

    <h2>Datos del flete</h2>
    ${infoGrid([
      ["Fecha", t.fecha], ["Origen", t.origen], ["Destino", t.dest], ["Estatus", t.status],
      ["Línea", t.linea], ["Contacto", t.contacto], ["Número", t.numero], ["Flete", t.flete ? "$" + t.flete : ""],
      ["Chofer", t.chofer], ["Teléfono", t.telefono], ["Licencia", t.licencia], ["Tracto", `${t.marcaModelo || ""} ${t.placaTracto || ""}`.trim()],
      ["Caja económico", t.economicoCaja], ["Placa caja", t.placaCaja],
    ])}

    ${seccionCarga}
    ${seccionPrecarga}
    ${seccionMonitoreo}

    <script>window.onload = function(){ window.print(); }</script>
    </body></html>`);
  win.document.close();
}
