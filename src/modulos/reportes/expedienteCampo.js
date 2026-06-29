import { INSP_VEHICULO, INSP_PRODUCTO } from "../../store/datos";
import { calcQCI } from "../helpers/calidad";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sumar = (items, campo) => (items || []).reduce((a, it) => a + (parseFloat(it[campo]) || 0), 0);
const dash = (v) => (v === 0 || v ? esc(v) : "—");

// Bloque de pares etiqueta/valor
const infoGrid = (pares, cols = 4) =>
  `<div class="info" style="grid-template-columns:repeat(${cols},1fr)">${pares
    .map(([l, v]) => `<div><label>${esc(l)}</label><span>${dash(v) || "—"}</span></div>`)
    .join("")}</div>`;

// ── Expediente de Campo: todo lo amarrado a la Remisión de un movimiento ──
// (movimiento de campo + recepción en empaque + calidad + inspección REG-EMP-24)
export function generarExpedienteCampo(m) {
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }

  const par = sumar(m.cargaItems, "parrillas");
  const bul = sumar(m.cargaItems, "bultos");

  // Carga
  const filasCarga = (m.cargaItems || []).map((it) =>
    `<tr><td>${esc(it.prod) || "—"}</td><td style="text-align:right">${dash(it.parrillas)}</td><td style="text-align:right">${dash(it.bultos)}</td></tr>`).join("")
    || `<tr><td colspan="3" style="text-align:center;color:#999">Sin renglones de carga</td></tr>`;

  // Recepción
  const r = m.recepcion;
  const seccionRecepcion = r ? `
    <h2>Recepción en empaque</h2>
    ${infoGrid([
      ["Estado", r.estado === "recibido" ? "Recibido" : "Pendiente"],
      ["Condición", r.condicion === "con_novedad" ? "Con novedad" : "OK"],
      ["Fecha de llegada", r.fechaLlegada],
      ["Hora de llegada", r.horaLlegada],
      ["Recibe", r.responsable],
      ["Confirmado", r.confirmado],
    ])}
    <table>
      <thead><tr><th>Concepto</th><th style="text-align:right">Salió</th><th style="text-align:right">Llegó</th><th style="text-align:right">Diferencia</th></tr></thead>
      <tbody>
        ${[["Parrillas", par, parseFloat(r.parrillasRecibidas) || 0],
           ["Bultos", bul, parseFloat(r.bultosRecibidos) || 0],
           ["Peso (lb)", parseFloat(m.pesoBascula) || 0, parseFloat(r.pesoRecibido) || 0]]
          .map(([l, s, ll]) => {
            const dif = ll - s;
            return `<tr><td>${l}</td><td style="text-align:right">${s.toLocaleString()}</td><td style="text-align:right">${ll.toLocaleString()}</td><td style="text-align:right;color:${dif === 0 ? "#16a34a" : "#dc2626"};font-weight:700">${dif === 0 ? "ok" : (dif > 0 ? "+" : "") + dif.toLocaleString()}</td></tr>`;
          }).join("")}
      </tbody>
    </table>
    ${r.observaciones ? `<p class="note"><b>Observaciones:</b> ${esc(r.observaciones)}</p>` : ""}
  ` : `<h2>Recepción en empaque</h2><p class="vacio">Sin recepción registrada.</p>`;

  // Calidad (muestreos)
  const mu = m.muestreos || [];
  const qciProm = mu.length ? (mu.reduce((a, x) => a + calcQCI(x), 0) / mu.length) : null;
  const seccionCalidad = mu.length ? `
    <h2>Control de calidad (QCI)</h2>
    ${infoGrid([
      ["Muestreos", `${mu.length}`],
      ["QCI promedio", qciProm != null ? `${qciProm.toFixed(2)}%` : "—"],
    ], 2)}
    <table>
      <thead><tr><th>#</th><th>Lote</th><th>Inspector</th><th style="text-align:right">Peso muestra</th><th style="text-align:right">QCI</th></tr></thead>
      <tbody>${mu.map((x, i) => `<tr><td>${i + 1}</td><td>${dash(x.lote)}</td><td>${dash(x.inspector)}</td><td style="text-align:right">${dash(x.pesoMuestra)}</td><td style="text-align:right;font-weight:700">${calcQCI(x).toFixed(2)}%</td></tr>`).join("")}</tbody>
    </table>
  ` : `<h2>Control de calidad (QCI)</h2><p class="vacio">Sin muestreos registrados.</p>`;

  // Inspección de vehículo y producto (REG-EMP-24)
  const insp = m.inspeccion;
  const filaInsp = (grupo, c) => {
    const v = (insp?.[grupo]?.[c.id] || "").toUpperCase();
    const malo = insp?.[grupo]?.[c.id] === c.malo;
    return `<tr><td>${esc(c.label)}</td><td style="text-align:center;font-weight:700;color:${malo ? "#dc2626" : "#16a34a"}">${v || "—"}</td></tr>`;
  };
  const seccionInsp = insp ? `
    <h2>Inspección de vehículo y producto (REG-EMP-24)</h2>
    ${infoGrid([["Producto", insp.producto], ["Fecha", insp.fecha], ["Hora", insp.hora], ["Temp. producto (°F)", insp.tempProducto]])}
    <table>
      <thead><tr><th>Punto — Vehículo</th><th style="text-align:center;width:80px">Resultado</th></tr></thead>
      <tbody>${INSP_VEHICULO.map((c) => filaInsp("veh", c)).join("")}</tbody>
    </table>
    <table style="margin-top:6px">
      <thead><tr><th>Punto — Producto</th><th style="text-align:center;width:80px">Resultado</th></tr></thead>
      <tbody>${INSP_PRODUCTO.map((c) => filaInsp("prod", c)).join("")}</tbody>
    </table>
    ${insp.observaciones ? `<p class="note"><b>Observaciones:</b> ${esc(insp.observaciones)}</p>` : ""}
    ${insp.accionesCorrectivas ? `<p class="note"><b>Acciones correctivas:</b> ${esc(insp.accionesCorrectivas)}</p>` : ""}
  ` : `<h2>Inspección de vehículo y producto (REG-EMP-24)</h2><p class="vacio">Sin inspección registrada.</p>`;

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
    <title>Expediente Campo - Remisión ${esc(m.remision) || ""}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Arial, sans-serif; color: #1f2937; margin: 28px; font-size: 12px; }
      h1 { font-size: 18px; margin: 0; color: #047857; }
      h2 { font-size: 13px; margin: 20px 0 6px; color: #065f46; border-bottom: 1px solid #d1fae5; padding-bottom: 3px; }
      .sub { color: #6b7280; font-size: 12px; margin: 2px 0 14px; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
      .logo { font-weight: 800; font-size: 22px; color: #047857; }
      .info { display: grid; gap: 8px; margin: 10px 0; }
      .info div { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px; }
      .info label { display: block; color: #9ca3af; font-size: 10px; text-transform: uppercase; }
      .info span { font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th { background: #f3f4f6; text-align: left; padding: 5px 8px; font-size: 10px; color: #6b7280; text-transform: uppercase; border: 1px solid #e5e7eb; }
      td { padding: 4px 8px; border: 1px solid #eee; }
      .note { font-size: 11px; color: #374151; margin: 6px 0; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 8px; }
      .vacio { font-size: 11px; color: #9ca3af; font-style: italic; }
      @media print { body { margin: 12mm; } }
    </style></head><body>
    <div class="head">
      <div>
        <h1>Expediente de Campo</h1>
        <div class="sub">SL Logística · documentación amarrada a la Remisión</div>
      </div>
      <div class="logo">SL</div>
    </div>

    <h2>Datos del movimiento (campo → empaque)</h2>
    ${infoGrid([
      ["Remisión", m.remision], ["Folio", m.folio], ["Fecha", m.fecha], ["Viaje", m.viaje],
      ["Rancho", m.rancho], ["Lote", m.lote], ["Origen", m.origen], ["Destino", m.destino],
      ["Consignado", m.consignado], ["Distribuidor", m.distribuidor], ["Peso báscula (lb)", m.pesoBascula], ["Responsable", m.responsable],
    ])}

    <h2>Cosecha</h2>
    ${infoGrid([["Hora inicio", m.horaInicio], ["Hora término", m.horaTermino], ["Responsable cosecha", m.responsableCosecha]], 3)}

    <h2>Carga</h2>
    <table>
      <thead><tr><th>Producto</th><th style="text-align:right">Parrillas</th><th style="text-align:right">Bultos</th></tr></thead>
      <tbody>${filasCarga}</tbody>
      <tfoot><tr><td style="text-align:right;font-weight:700">Totales</td><td style="text-align:right;font-weight:700">${par.toLocaleString()}</td><td style="text-align:right;font-weight:700">${bul.toLocaleString()}</td></tr></tfoot>
    </table>

    <h2>Transporte</h2>
    ${infoGrid([
      ["Línea", m.linea], ["Contacto", m.contacto], ["Chofer", m.chofer], ["Tel. operador", m.telOperador || m.telefono],
      ["Licencia", m.licencia], ["Tracto", `${m.marcaModelo || ""} ${m.placaTracto || ""}`.trim()], ["Caja (econ./placa)", `${m.economicoCaja || ""} ${m.placaCaja || ""}`.trim()], ["Flete", m.flete ? "$" + m.flete : ""],
      ["Inicio preenfriado", m.inicioPreenfriado], ["Término preenfriado", m.terminoPreenfriado],
    ])}

    ${seccionRecepcion}
    ${seccionCalidad}
    ${seccionInsp}

    <script>window.onload = function(){ window.print(); }</script>
    </body></html>`);
  win.document.close();
}
