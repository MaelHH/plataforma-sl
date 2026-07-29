import { esc } from "../../utils/esc";

// ── Reporte "Vaciado por hora" en BINS (el que revisan los jefes) ──
// UNA TABLA POR FOLIO (no se mezclan folios): cada folio muestra su vaciado por hora en BINS y KG,
// sus bins recibidos y lo que le va FALTANDO EN PISO a ESE folio, hora por hora. Turno 8am–10pm en
// formato 12h, fila de comida en naranja, TOTALES por folio y un resumen del día al final.
// Todo en BINS: cada `kgPorBin` kg NETOS = 1 bin. Solo lectura; no toca datos.
//
// Dos salidas que comparten los MISMOS números (`_folio`): PDF (window.print) y Excel (ExcelJS).
// Colores: verde apagado #a9c48d headers de grupo, naranja dorado #f6a500 HORA/comida/%merma,
// amarillo #ffff00 TOTALES, salmón #f4b183 FALTA EN PISO.

const fmt = (n) => Math.round(n || 0).toLocaleString("es-MX");
const bins = (kg, kgPorBin) => Math.round((kg || 0) / (kgPorBin || 260));
const BREAK_HOURS = [14];   // 02:00 A 03:00 (comida) → naranja, como el Excel. Editable.

// Colores (hex sin #; ARGB para ExcelJS lleva "FF" delante).
const COL = { verde: "a9c48d", naranja: "f6a500", amarillo: "ffff00", salmon: "f4b183", verdeClaro: "cfe2b0", pisoBg: "fde9d9" };

const h12 = (h) => { const x = h % 12; return String(x === 0 ? 12 : x).padStart(2, "0"); };
const franja = (h) => `${h12(h)}:00 A ${h12((h + 1) % 24)}:00`;

// Prepara las filas de UN folio: turno completo (8→21) + horas extra con actividad; "falta en piso"
// running que arranca en (piso final + lo vaciado/mermado hoy) y baja cada hora, terminando EXACTO
// en el piso real de ese folio. Así el "falta en piso" cuadra con la tarjeta del folio.
function _folio(f, kgb) {
  // Normaliza las horas: las capturadas vienen con cero adelante ("08","09") y aquí se buscan por
  // número ("8","9") → sin normalizar, las horas antes de las 10am no cuadraban (no salían en su
  // fila pero sí en el total, y el "falta en piso" no las restaba). Se colapsan a clave numérica.
  const norm = (obj) => {
    const o = {};
    Object.entries(obj || {}).forEach(([k, v]) => { const n = Number(k); if (!Number.isNaN(n)) o[String(n)] = (o[String(n)] || 0) + v; });
    return o;
  };
  const vac = norm(f.vacPorHora), mer = norm(f.merPorHora);
  const turno = Array.from({ length: 14 }, (_, i) => 8 + i);   // 8 → 21 (08:00 a 10:00)
  const conActividad = [...new Set([...Object.keys(vac), ...Object.keys(mer)])].map(Number).filter((n) => !Number.isNaN(n));
  const extras = conActividad.filter((h) => !turno.includes(h)).sort((a, b) => a - b);
  const horas = [...turno, ...extras];

  let restante = (f.enPiso || 0) + (f.totVac || 0) + (f.totMer || 0);
  const filas = horas.map((h) => {
    const kg = vac[String(h)] || 0;
    const merKg = mer[String(h)] || 0;
    const pctMerma = (kg + merKg) > 0 ? Math.round((merKg / (kg + merKg)) * 100) : null;
    restante = Math.max(0, restante - kg - merKg);
    return {
      franja: franja(h), esBreak: BREAK_HOURS.includes(h),
      binsProc: kg ? bins(kg, kgb) : null,
      kg: kg || null,
      enPiso: (kg > 0 || merKg > 0) ? restante : null,   // solo se muestra en horas con movimiento
      pctMerma,
    };
  });
  const totMermaPct = (f.totVac + f.totMer) > 0 ? Math.round((f.totMer / (f.totVac + f.totMer)) * 100) : 0;
  return {
    ...f, horas, filas,
    totBinsProc: bins(f.totVac, kgb),
    totBinsRec: f.binsRecibidos || 0,
    totMermaPct,
  };
}

// Resumen del día (todos los folios juntos) para el bloque final.
function _resumen(folios, kgb) {
  const totVac = folios.reduce((a, f) => a + (f.totVac || 0), 0);
  const totPiso = folios.reduce((a, f) => a + (f.enPiso || 0), 0);
  return { totVac, totPiso, totBinsProc: bins(totVac, kgb), totBinsPiso: bins(totPiso, kgb) };
}

// ─────────────────────────── PDF (window.print) ───────────────────────────
export function generarPDFVaciadoHora({ dia, kgPorBin, foliosReporte = [], totKgVacDia }) {
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }
  const kgb = parseFloat(kgPorBin) || 260;
  const folios = foliosReporte.map((f) => _folio(f, kgb));
  const R = _resumen(foliosReporte, kgb);
  const totBins = R.totBinsProc;
  const kgDia = totKgVacDia != null ? totKgVacDia : R.totVac;

  const tablaFolio = (F) => {
    const filasHTML = F.filas.map((f) => `<tr>
      <td class="hora${f.esBreak ? " break" : ""}">${f.franja}</td>
      <td class="num"></td>
      <td class="num">${f.binsProc == null ? "" : fmt(f.binsProc)}</td>
      <td class="num">${f.kg == null ? "" : fmt(f.kg)}</td>
      <td class="num piso">${f.enPiso == null ? "" : fmt(f.enPiso)}</td>
      <td class="num">${f.pctMerma == null ? "" : f.pctMerma + "%"}</td>
    </tr>`).join("");
    const filaTot = `<tr class="totales">
      <td>TOTALES</td>
      <td class="num">${fmt(F.totBinsRec)}</td>
      <td class="num">${fmt(F.totBinsProc)}</td>
      <td class="num">${fmt(F.totVac)}</td>
      <td class="num piso">${fmt(F.enPiso)}</td>
      <td class="num">${F.totMermaPct}%</td>
    </tr>`;
    return `<div class="folio">
      <div class="folio-hdr">Folio <b>${esc(String(F.folio))}</b> · Lote <b>${esc(String(F.lote || "—").toUpperCase())}</b>${F.remision ? ` · Rem. ${esc(String(F.remision))}` : ""} · Recibido ${fmt(F.recibido)} kg · Bins recibidos ${fmt(F.totBinsRec)}</div>
      <table class="grid">
        <thead><tr>
          <th class="sub">HORA</th>
          <th class="grupo">BINS<br/>RECIBIDOS</th>
          <th class="grupo">BINS<br/>PROCESADOS</th>
          <th class="grupo">KG<br/>PROCESADOS</th>
          <th class="grupo piso">FALTA EN<br/>PISO (kg)</th>
          <th class="sub">% MERMA<br/>EN KG</th>
        </tr></thead>
        <tbody>${filasHTML}${filaTot}</tbody>
      </table>
    </div>`;
  };

  const cuerpo = folios.length
    ? folios.map(tablaFolio).join("")
    : `<div class="vacio">No hay vaciados registrados el día seleccionado.</div>`;

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
  <title>Vaciado por hora — ${esc(dia || "")}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 16px; color: #000; }
    h1 { font-size: 15px; margin: 0 0 2px; }
    .sub-top { font-size: 11px; color: #444; margin-bottom: 14px; }
    table { border-collapse: collapse; }
    .folio { margin-bottom: 20px; page-break-inside: avoid; }
    .folio-hdr { font-size: 12px; font-weight: bold; background: #${COL.verdeClaro}; border: 1px solid #000; border-bottom: 0; padding: 5px 9px; }
    .grid { width: 100%; font-size: 11px; }
    .grid th, .grid td { border: 1px solid #000; padding: 3px 7px; }
    .grid td.num, .grid th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .grid th.grupo { background: #${COL.verde}; font-weight: bold; text-align: center; }
    .grid th.sub { background: #${COL.naranja}; font-weight: bold; text-align: center; }
    .grid th.grupo.piso { background: #${COL.salmon}; }
    .grid td.hora { background: #fff; font-weight: bold; white-space: nowrap; }
    .grid td.hora.break { background: #${COL.naranja}; }
    .grid td.piso { background: #${COL.pisoBg}; font-weight: bold; }
    .grid tr.totales td { background: #${COL.amarillo}; font-weight: bold; }
    .vacio { font-size: 12px; color: #666; font-style: italic; padding: 12px 0; }
    .resumen { margin-top: 8px; font-size: 12px; }
    .resumen td { border: 1px solid #000; padding: 5px 14px; }
    .resumen td.hdr { background: #${COL.verde}; font-weight: bold; }
    .resumen td.hdr.piso { background: #${COL.salmon}; }
    .resumen td.lbl { background: #${COL.verdeClaro}; font-weight: bold; }
    .resumen td.num { text-align: right; font-weight: bold; min-width: 80px; }
    .resumen td.piso { background: #${COL.pisoBg}; }
    .kg-sl { margin-top: 8px; display: inline-block; background: #${COL.amarillo}; border: 1px solid #000; padding: 6px 14px; font-size: 12px; font-weight: bold; }
    @media print { body { margin: 0; } .noprint { display: none; } }
    .noprint { margin: 10px 0; }
    .btn { background: #4f46e5; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  </style></head><body>
    <div class="noprint"><button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button></div>
    <h1>Vaciado por hora — SL Logística</h1>
    <div class="sub-top">Reporte del día <b>${esc(dia || "—")}</b> · una tabla por folio · medido en BINS (cada ${fmt(kgb)} kg = 1 bin) · ${fmt(totBins)} bins procesados en total</div>
    ${cuerpo}
    <table class="resumen">
      <tr><td class="hdr">RESUMEN DEL DÍA</td><td class="hdr">BINS</td><td class="hdr piso">KG</td></tr>
      <tr><td class="lbl">BINS PROCESADOS</td><td class="num">${fmt(R.totBinsProc)}</td><td class="num">${fmt(kgDia)}</td></tr>
      <tr><td class="lbl">FALTA EN PISO</td><td class="num piso">${fmt(R.totBinsPiso)}</td><td class="num piso">${fmt(R.totPiso)}</td></tr>
    </table>
    <div class="kg-sl">KG PROCESADOS DE SL : ${fmt(kgDia)}</div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }</script>
  </body></html>`);
  win.document.close();
}

// ─────────────────────────── Excel (ExcelJS, con colores) ───────────────────────────
export async function generarExcelVaciadoHora({ dia, kgPorBin, foliosReporte = [], totKgVacDia }) {
  const kgb = parseFloat(kgPorBin) || 260;
  const folios = foliosReporte.map((f) => _folio(f, kgb));
  const R = _resumen(foliosReporte, kgb);
  const kgDia = totKgVacDia != null ? totKgVacDia : R.totVac;

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma SL";
  const ws = wb.addWorksheet("Vaciado por hora");

  const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } });
  const thin = { style: "thin", color: { argb: "FF000000" } };
  const borde = { top: thin, left: thin, right: thin, bottom: thin };
  const centro = { horizontal: "center", vertical: "middle" };
  const der = { horizontal: "right", vertical: "middle" };
  const izq = { horizontal: "left", vertical: "middle" };
  const set = (r, c, value, { bg, bold, align, num, pct } = {}) => {
    const cell = ws.getRow(r).getCell(c);
    cell.value = value;
    cell.border = borde;
    if (bg) cell.fill = fill(bg);
    cell.font = { bold: !!bold, name: "Arial", size: 10 };
    cell.alignment = align || centro;
    if (num) cell.numFmt = "#,##0";
    if (pct) cell.numFmt = "0%";
  };

  // 6 columnas: HORA | BINS RECIBIDOS | BINS PROCESADOS | KG PROCESADOS | FALTA EN PISO | % MERMA.
  ws.columns = [{ width: 15 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 11 }];

  let r = 1;
  // Título.
  ws.mergeCells(r, 1, r, 6);
  set(r, 1, `Vaciado por hora — SL Logística · ${dia || "—"} · bins = ${fmt(kgb)} kg`, { bold: true, align: izq });
  ws.getRow(r).getCell(1).font = { bold: true, name: "Arial", size: 12 };
  r += 2;

  folios.forEach((F) => {
    // Encabezado del folio (merge, verde claro).
    ws.mergeCells(r, 1, r, 6);
    set(r, 1, `Folio ${F.folio} · Lote ${String(F.lote || "—").toUpperCase()}${F.remision ? ` · Rem. ${F.remision}` : ""} · Recibido ${fmt(F.recibido)} kg · Bins recibidos ${fmt(F.totBinsRec)}`, { bg: COL.verdeClaro, bold: true, align: izq });
    for (let c = 2; c <= 6; c++) { ws.getRow(r).getCell(c).border = borde; ws.getRow(r).getCell(c).fill = fill(COL.verdeClaro); }
    r++;
    // Encabezado de columnas.
    set(r, 1, "HORA", { bg: COL.naranja, bold: true });
    set(r, 2, "BINS RECIBIDOS", { bg: COL.verde, bold: true });
    set(r, 3, "BINS PROCESADOS", { bg: COL.verde, bold: true });
    set(r, 4, "KG PROCESADOS", { bg: COL.verde, bold: true });
    set(r, 5, "FALTA EN PISO (kg)", { bg: COL.salmon, bold: true });
    set(r, 6, "% MERMA EN KG", { bg: COL.naranja, bold: true });
    r++;
    // Filas de datos.
    F.filas.forEach((f) => {
      set(r, 1, f.franja, { bg: f.esBreak ? COL.naranja : undefined, bold: true, align: izq });
      set(r, 2, "", {});
      set(r, 3, f.binsProc == null ? "" : f.binsProc, { align: der, num: true });
      set(r, 4, f.kg == null ? "" : f.kg, { align: der, num: true });
      set(r, 5, f.enPiso == null ? "" : f.enPiso, { bg: f.enPiso == null ? undefined : COL.pisoBg, align: der, num: true });
      set(r, 6, f.pctMerma == null ? "" : f.pctMerma / 100, { align: der, pct: f.pctMerma != null });
      r++;
    });
    // TOTALES del folio (amarillo).
    set(r, 1, "TOTALES", { bg: COL.amarillo, bold: true });
    set(r, 2, F.totBinsRec, { bg: COL.amarillo, bold: true, align: der, num: true });
    set(r, 3, F.totBinsProc, { bg: COL.amarillo, bold: true, align: der, num: true });
    set(r, 4, F.totVac, { bg: COL.amarillo, bold: true, align: der, num: true });
    set(r, 5, F.enPiso, { bg: COL.amarillo, bold: true, align: der, num: true });
    set(r, 6, F.totMermaPct / 100, { bg: COL.amarillo, bold: true, align: der, pct: true });
    r += 2;   // espacio antes del siguiente folio
  });

  if (!folios.length) { set(r, 1, "No hay vaciados registrados el día seleccionado.", { align: izq }); r += 2; }

  // Resumen del día.
  ws.mergeCells(r, 1, r, 6);
  set(r, 1, "RESUMEN DEL DÍA", { bg: COL.verde, bold: true, align: izq });
  for (let c = 2; c <= 6; c++) { ws.getRow(r).getCell(c).border = borde; ws.getRow(r).getCell(c).fill = fill(COL.verde); }
  r++;
  set(r, 1, "BINS PROCESADOS", { bg: COL.verdeClaro, bold: true, align: izq });
  set(r, 2, R.totBinsProc, { bold: true, align: der, num: true });
  set(r, 3, "KG PROCESADOS DE SL", { bg: COL.amarillo, bold: true });
  set(r, 4, kgDia, { bg: COL.amarillo, bold: true, align: der, num: true });
  set(r, 5, "", {}); set(r, 6, "", {});
  r++;
  set(r, 1, "FALTA EN PISO", { bg: COL.salmon, bold: true, align: izq });
  set(r, 2, R.totBinsPiso, { bg: COL.pisoBg, bold: true, align: der, num: true });
  set(r, 3, "KG EN PISO", { bg: COL.salmon, bold: true });
  set(r, 4, R.totPiso, { bg: COL.pisoBg, bold: true, align: der, num: true });
  set(r, 5, "", {}); set(r, 6, "", {});

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `vaciado-por-hora-${dia || "reporte"}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
