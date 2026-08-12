import { esc } from "../../utils/esc";

// ── Reporte "Taras por hora" — EMPAQUE CAMPO DIRECTO (CACO / pepino) ──
// Los folios de taras NO se pesan ni se destaran: el folio lleva el Nº de taras de la remisión y ese
// número se manda TAL CUAL a SAP. Este reporte NO usa bins ni kg. Muestra, para el día elegido:
//   1) un pivote POR HORA DE CREACIÓN × LOTE (las taras que llegaron cada hora, por lote) + totales,
//   2) el detalle por folio (folio, lote, hora, taras, estado en SAP),
//   3) el total de taras del día.
// Solo lectura; no toca datos ni SAP. Comparte los MISMOS números entre PDF (window.print) y Excel.
// Colores calcados del reporte de bins para que se vean igual (verde headers, naranja HORA, amarillo
// totales, salmón "sin enviar"/detalle SAP).

const fmt = (n) => Math.round(n || 0).toLocaleString("es-MX");
const COL = { verde: "a9c48d", naranja: "f6a500", amarillo: "ffff00", salmon: "f4b183", verdeClaro: "cfe2b0", pisoBg: "fde9d9" };

const h12 = (h) => { const x = h % 12; return String(x === 0 ? 12 : x).padStart(2, "0"); };
const franja = (h) => `${h12(h)}:00 A ${h12((h + 1) % 24)}:00`;

// Prepara TODO lo que necesitan ambas salidas a partir de los args del módulo.
function _preparar({ dia, temporada, porHora = [], lotesTaras = [], totalPorLote = {}, totalDia = 0, detalle = [] }) {
  const lotes = lotesTaras.length ? lotesTaras : ["—"];
  const rotulo = (l) => String(l || "—").toUpperCase();
  const mapaH = Object.fromEntries(porHora.map(([h, v]) => [Number(h), v]));
  const horas = porHora.map(([h]) => Number(h)).sort((a, b) => a - b);   // solo horas con actividad
  const filas = horas.map((h) => {
    const v = mapaH[h];
    return {
      franja: franja(h),
      porLote: lotes.map((l) => (v?.lotes?.[l] || null)),
      total: v?.total || 0,
    };
  });
  const totales = { porLote: lotes.map((l) => totalPorLote[l] || 0), total: totalDia };
  return { dia, temporada, lotes, rotulo, filas, totales, detalle, totalDia };
}

// ─────────────────────────── PDF (window.print) ───────────────────────────
export function generarPDFVaciadoTaras(args) {
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }
  const D = _preparar(args);

  const filasHTML = D.filas.map((f) => `<tr>
    <td class="hora">${f.franja}</td>
    ${f.porLote.map((t) => `<td class="num">${t == null ? "" : fmt(t)}</td>`).join("")}
    <td class="num tot">${fmt(f.total)}</td>
  </tr>`).join("");

  const filaTotales = `<tr class="totales">
    <td>TOTALES</td>
    ${D.totales.porLote.map((t) => `<td class="num">${fmt(t)}</td>`).join("")}
    <td class="num">${fmt(D.totales.total)}</td>
  </tr>`;

  const detalleHTML = D.detalle.length
    ? D.detalle.map((d) => `<tr>
        <td>${esc(String(d.folio || "—"))}</td>
        <td>${esc(String(d.lote || "—").toUpperCase())}</td>
        <td class="hora">${esc(String(d.hora || "—"))}</td>
        <td class="num">${fmt(d.taras)}</td>
        <td class="${d.enviado ? "sap-ok" : "sap-no"}">${esc(String(d.sap || "—"))}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="vacio">Sin folios de taras el día seleccionado.</td></tr>`;

  const cuerpo = D.filas.length
    ? `<table class="grid">
        <thead><tr>
          <th class="sub">HORA</th>
          ${D.lotes.map((l) => `<th class="grupo">${esc(D.rotulo(l))}</th>`).join("")}
          <th class="grupo tot">TOTAL TARAS</th>
        </tr></thead>
        <tbody>${filasHTML}${filaTotales}</tbody>
      </table>`
    : `<div class="vacio">Sin folios de taras el día seleccionado.</div>`;

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
  <title>Taras por hora — ${esc(D.dia || "")}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 16px; color: #000; }
    h1 { font-size: 15px; margin: 0 0 2px; }
    .sub-top { font-size: 11px; color: #444; margin-bottom: 12px; }
    h2 { font-size: 13px; margin: 18px 0 6px; }
    table { border-collapse: collapse; }
    .grid, .det { width: 100%; font-size: 11px; }
    .grid th, .grid td, .det th, .det td { border: 1px solid #000; padding: 3px 7px; }
    .grid td.num, .grid th.num, .det td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .grid th.grupo, .det th { background: #${COL.verde}; font-weight: bold; text-align: center; }
    .grid th.sub { background: #${COL.naranja}; font-weight: bold; text-align: center; }
    .grid th.grupo.tot { background: #${COL.verdeClaro}; }
    .grid td.hora, .det td.hora { background: #fff; font-weight: bold; white-space: nowrap; }
    .grid td.num.tot { background: #${COL.verdeClaro}; font-weight: bold; }
    .grid tr.totales td { background: #${COL.amarillo}; font-weight: bold; }
    .det td.sap-ok { background: #${COL.verdeClaro}; font-weight: bold; }
    .det td.sap-no { background: #${COL.salmon}; }
    .vacio { font-size: 12px; color: #666; font-style: italic; padding: 12px; text-align: center; }
    .kg-sl { margin-top: 12px; display: inline-block; background: #${COL.amarillo}; border: 1px solid #000; padding: 6px 14px; font-size: 12px; font-weight: bold; }
    @media print { body { margin: 0; } .noprint { display: none; } }
    .noprint { margin: 10px 0; }
    .btn { background: #4f46e5; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  </style></head><body>
    <div class="noprint"><button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button></div>
    <h1>Taras por hora — Empaque campo directo</h1>
    <div class="sub-top">Reporte del día <b>${esc(D.dia || "—")}</b>${D.temporada ? ` · ${esc(D.temporada)}` : ""} · por hora de creación del folio · Nº de taras de la remisión (sin pesar) · ${fmt(D.totalDia)} taras en total</div>
    ${cuerpo}
    <h2>Detalle por folio</h2>
    <table class="det">
      <thead><tr><th>FOLIO</th><th>LOTE</th><th>HORA</th><th>TARAS</th><th>SAP</th></tr></thead>
      <tbody>${detalleHTML}</tbody>
    </table>
    <div class="kg-sl">TOTAL DE TARAS DEL DÍA : ${fmt(D.totalDia)}</div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }</script>
  </body></html>`);
  win.document.close();
}

// ─────────────────────────── Excel (ExcelJS, con colores) ───────────────────────────
export async function generarExcelVaciadoTaras(args) {
  const D = _preparar(args);
  const nL = D.lotes.length;
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma SL";
  const ws = wb.addWorksheet("Taras por hora");

  const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } });
  const thin = { style: "thin", color: { argb: "FF000000" } };
  const borde = { top: thin, left: thin, right: thin, bottom: thin };
  const centro = { horizontal: "center", vertical: "middle" };
  const der = { horizontal: "right", vertical: "middle" };
  const izq = { horizontal: "left", vertical: "middle" };
  const set = (r, c, value, { bg, bold, align, num } = {}) => {
    const cell = ws.getRow(r).getCell(c);
    cell.value = value;
    cell.border = borde;
    if (bg) cell.fill = fill(bg);
    cell.font = { bold: !!bold, name: "Arial", size: 10 };
    cell.alignment = align || centro;
    if (num) cell.numFmt = "#,##0";
  };

  // Layout pivote: 1=HORA, 2..(1+nL)=lotes, (2+nL)=TOTAL.
  const cTot = 2 + nL;
  ws.columns = Array.from({ length: cTot }, (_, i) => ({ width: i === 0 ? 15 : 13 }));

  let r = 1;
  ws.mergeCells(r, 1, r, cTot);
  set(r, 1, `Taras por hora — Empaque campo directo · ${D.dia || "—"}${D.temporada ? ` · ${D.temporada}` : ""}`, { bold: true, align: izq });
  ws.getRow(r).getCell(1).font = { bold: true, name: "Arial", size: 12 };
  r += 2;

  // Encabezado del pivote.
  set(r, 1, "HORA", { bg: COL.naranja, bold: true });
  D.lotes.forEach((l, i) => set(r, 2 + i, D.rotulo(l), { bg: COL.verde, bold: true }));
  set(r, cTot, "TOTAL TARAS", { bg: COL.verdeClaro, bold: true });
  r++;

  if (D.filas.length) {
    D.filas.forEach((f) => {
      set(r, 1, f.franja, { bold: true, align: izq });
      f.porLote.forEach((t, i) => set(r, 2 + i, t == null ? "" : t, { align: der, num: true }));
      set(r, cTot, f.total, { bg: COL.verdeClaro, bold: true, align: der, num: true });
      r++;
    });
    // TOTALES (amarillo).
    set(r, 1, "TOTALES", { bg: COL.amarillo, bold: true });
    D.totales.porLote.forEach((t, i) => set(r, 2 + i, t, { bg: COL.amarillo, bold: true, align: der, num: true }));
    set(r, cTot, D.totales.total, { bg: COL.amarillo, bold: true, align: der, num: true });
    r += 2;
  } else {
    ws.mergeCells(r, 1, r, cTot);
    set(r, 1, "Sin folios de taras el día seleccionado.", { align: izq });
    r += 2;
  }

  // Detalle por folio: FOLIO | LOTE | HORA | TARAS | SAP (5 columnas, empieza en col 1).
  ws.mergeCells(r, 1, r, Math.max(cTot, 5));
  set(r, 1, "DETALLE POR FOLIO", { bg: COL.verde, bold: true, align: izq });
  for (let c = 2; c <= Math.max(cTot, 5); c++) { ws.getRow(r).getCell(c).border = borde; ws.getRow(r).getCell(c).fill = fill(COL.verde); }
  r++;
  ["FOLIO", "LOTE", "HORA", "TARAS", "SAP"].forEach((t, i) => set(r, 1 + i, t, { bg: COL.verdeClaro, bold: true }));
  r++;
  if (D.detalle.length) {
    D.detalle.forEach((d) => {
      set(r, 1, d.folio || "—", { align: izq });
      set(r, 2, String(d.lote || "—").toUpperCase(), { align: izq });
      set(r, 3, d.hora || "—", {});
      set(r, 4, d.taras || 0, { align: der, num: true });
      set(r, 5, d.sap || "—", { bg: d.enviado ? COL.verdeClaro : COL.salmon, align: izq });
      r++;
    });
  } else {
    set(r, 1, "Sin folios de taras.", { align: izq }); r++;
  }
  r++;

  // Total de taras del día.
  set(r, 1, "TOTAL DE TARAS DEL DÍA", { bg: COL.amarillo, bold: true, align: izq });
  set(r, 2, D.totalDia, { bg: COL.amarillo, bold: true, align: der, num: true });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `taras-por-hora-${D.dia || "reporte"}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
