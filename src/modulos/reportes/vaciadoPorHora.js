import { esc } from "../../utils/esc";

// ── Reporte "Vaciado por hora" en BINS (el que revisan los jefes) ──
// Réplica EXACTA del Excel: grupos BINS RECIBIDOS / BINS PROCESADOS / KG PROCESADOS (una columna
// por lote) + % MERMA EN KG, turno 8am–10pm en formato 12h, fila de comida en naranja, TOTALES y
// el bloque de abajo. Todo en BINS: cada `kgPorBin` kg NETOS = 1 bin. Solo lectura; no toca datos.
//
// Dos salidas que comparten los MISMOS números (`_preparar`): PDF (window.print) y Excel (ExcelJS).
// Colores: verde apagado #a9c48d headers de grupo, naranja dorado #f6a500 HORA/sub-headers/comida,
// amarillo #ffff00 TOTALES / KG de SL, salmón #f4b183 TOTAL DEL DÍA.

const fmt = (n) => Math.round(n || 0).toLocaleString("es-MX");
const bins = (kg, kgPorBin) => Math.round((kg || 0) / (kgPorBin || 260));
const BREAK_HOURS = [14];   // 02:00 A 03:00 (comida) → naranja, como el Excel. Editable.

// Colores (hex sin #; ARGB para ExcelJS lleva "FF" delante).
const COL = { verde: "a9c48d", naranja: "f6a500", amarillo: "ffff00", salmon: "f4b183", verdeClaro: "cfe2b0" };

// Prepara TODO lo que necesitan ambas salidas a partir de los datos del módulo.
function _preparar({ dia, porHora, lotesHora, kgPorBin, totKgVacDia, binsRecibidosPorLote, mermaPorHora }) {
  const kgb = parseFloat(kgPorBin) || 260;
  const reales = lotesHora.length ? lotesHora : [];
  const lotes = [...reales];
  while (lotes.length < 2) lotes.push({ ph: true });   // relleno "0" hasta 2 columnas (plantilla del Excel)
  const esPh = (l) => l && l.ph === true;
  const rotulo = (l) => (esPh(l) ? "0" : String(l).toUpperCase());

  const mapaH = Object.fromEntries(porHora.map(([h, v]) => [String(Number(h)), v]));
  const turno = Array.from({ length: 14 }, (_, i) => 8 + i);   // 8 → 21 (08:00 a 10:00)
  const extras = porHora.map(([h]) => Number(h)).filter((h) => !turno.includes(h)).sort((a, b) => a - b);
  const horas = [...turno, ...extras];

  const h12 = (h) => { const x = h % 12; return String(x === 0 ? 12 : x).padStart(2, "0"); };
  const franja = (h) => `${h12(h)}:00 A ${h12((h + 1) % 24)}:00`;
  const kgLoteHora = (v, l) => (esPh(l) ? 0 : (v?.lotes?.[l] || 0));

  const filas = horas.map((h) => {
    const v = mapaH[String(h)];
    const kgHora = v?.kg || 0;
    const merKg = (mermaPorHora || {})[String(h)] || 0;
    const pctMerma = (kgHora + merKg) > 0 ? Math.round((merKg / (kgHora + merKg)) * 100) : null;
    return {
      h, franja: franja(h), esBreak: BREAK_HOURS.includes(h),
      binsProc: lotes.map((l) => { const kg = kgLoteHora(v, l); return kg ? bins(kg, kgb) : null; }),
      kg: lotes.map((l) => { const kg = kgLoteHora(v, l); return kg || null; }),
      pctMerma,
    };
  });

  const totKgLote = {};
  reales.forEach((l) => { totKgLote[l] = porHora.reduce((a, [, v]) => a + (v.lotes[l] || 0), 0); });
  const totMermaKg = Object.values(mermaPorHora || {}).reduce((a, v) => a + v, 0);
  const totBinsProc = bins(totKgVacDia, kgb);
  const totMermaPct = (totKgVacDia + totMermaKg) > 0 ? Math.round((totMermaKg / (totKgVacDia + totMermaKg)) * 100) : 0;
  const totales = {
    binRec: lotes.map((l) => (esPh(l) ? 0 : (binsRecibidosPorLote?.[l] || 0))),
    binsProc: lotes.map((l) => (esPh(l) ? 0 : bins(totKgLote[l], kgb))),
    kg: lotes.map((l) => (esPh(l) ? 0 : totKgLote[l])),
    mermaPct: totMermaPct,
  };

  return { dia, kgb, lotes, reales, esPh, rotulo, horas, filas, totales, totKgLote, totBinsProc, totKgVacDia };
}

// ─────────────────────────── PDF (window.print) ───────────────────────────
export function generarPDFVaciadoHora(args) {
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }
  const D = _preparar(args);
  const nL = D.lotes.length;

  const filasHTML = D.filas.map((f) => `<tr>
    <td class="hora${f.esBreak ? " break" : ""}">${f.franja}</td>
    ${D.lotes.map(() => `<td></td>`).join("")}
    ${f.binsProc.map((b) => `<td class="num">${b == null ? "" : fmt(b)}</td>`).join("")}
    ${f.kg.map((k) => `<td class="num">${k == null ? "" : fmt(k)}</td>`).join("")}
    <td class="num">${f.pctMerma == null ? "" : f.pctMerma + "%"}</td>
  </tr>`).join("");

  const filaTotales = `<tr class="totales">
    <td>TOTALES</td>
    ${D.totales.binRec.map((b) => `<td class="num">${b || 0}</td>`).join("")}
    ${D.totales.binsProc.map((b) => `<td class="num">${fmt(b)}</td>`).join("")}
    ${D.totales.kg.map((k) => `<td class="num">${fmt(k)}</td>`).join("")}
    <td class="num">${D.totales.mermaPct}%</td>
  </tr>`;

  const filasAbajo = D.reales.map((l) =>
    `<tr><td class="lote">${esc(String(l).toUpperCase())}</td><td class="num">${fmt(bins(D.totKgLote[l], D.kgb))}</td></tr>`).join("")
    + Array.from({ length: Math.max(0, 4 - D.reales.length) }, () => `<tr><td class="lote">0</td><td class="num">0</td></tr>`).join("");

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
  <title>Vaciado por hora — ${esc(D.dia || "")}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 16px; color: #000; }
    h1 { font-size: 15px; margin: 0 0 2px; }
    .sub { font-size: 11px; color: #444; margin-bottom: 10px; }
    table { border-collapse: collapse; }
    .grid { width: 100%; font-size: 11px; }
    .grid th, .grid td { border: 1px solid #000; padding: 3px 7px; }
    .grid td.num, .grid th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .grid th.grupo { background: #${COL.verde}; font-weight: bold; text-align: center; }
    .grid th.corner { background: #${COL.verde}; }
    .grid th.sub { background: #${COL.naranja}; font-weight: bold; text-align: center; }
    .grid td.hora { background: #fff; font-weight: bold; white-space: nowrap; }
    .grid td.hora.break { background: #${COL.naranja}; }
    .grid tr.totales td { background: #${COL.amarillo}; font-weight: bold; }
    .abajo { margin-top: 16px; display: flex; gap: 40px; align-items: flex-start; flex-wrap: wrap; }
    .resumen { font-size: 12px; }
    .resumen td { border: 1px solid #000; padding: 4px 12px; }
    .resumen td.hdr { background: #${COL.verde}; font-weight: bold; }
    .resumen td.lbl { background: #${COL.verdeClaro}; font-weight: bold; }
    .resumen td.lote { font-weight: bold; }
    .resumen td.num { text-align: right; font-weight: bold; min-width: 70px; }
    .resumen tr.tot-dia td.lbl { background: #${COL.salmon}; }
    .kg-sl { background: #${COL.amarillo}; border: 1px solid #000; padding: 6px 14px; font-size: 12px; font-weight: bold; }
    @media print { body { margin: 0; } .noprint { display: none; } }
    .noprint { margin: 10px 0; }
    .btn { background: #4f46e5; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  </style></head><body>
    <div class="noprint"><button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button></div>
    <h1>Vaciado por hora — SL Logística</h1>
    <div class="sub">Reporte del día <b>${esc(D.dia || "—")}</b> · medido en BINS (cada ${fmt(D.kgb)} kg netos = 1 bin) · ${fmt(D.totBinsProc)} bins procesados</div>
    <table class="grid">
      <thead>
        <tr>
          <th class="corner"></th>
          <th class="grupo" colspan="${nL}">BINS RECIBIDOS</th>
          <th class="grupo" colspan="${nL}">BINS PROCESADOS</th>
          <th class="grupo" colspan="${nL}">KG PROCESADOS</th>
          <th class="sub" rowspan="2">% MERMA<br/>EN KG</th>
        </tr>
        <tr>
          <th class="sub">HORA</th>
          ${D.lotes.map((l) => `<th class="sub">${esc(D.rotulo(l))}</th>`).join("")}
          ${D.lotes.map((l) => `<th class="sub">${esc(D.rotulo(l))}</th>`).join("")}
          ${D.lotes.map((l) => `<th class="sub">${esc(D.rotulo(l))}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${filasHTML}${filaTotales}</tbody>
    </table>
    <div class="abajo">
      <table class="resumen">
        <tr><td class="hdr" colspan="2">TOTAL</td></tr>
        <tr><td class="lbl">BINS PISO</td><td class="num">0</td></tr>
        ${filasAbajo}
        <tr class="tot-dia"><td class="lbl">TOTAL DEL DÍA</td><td class="num">${fmt(D.totBinsProc)}</td></tr>
      </table>
      <div class="kg-sl">KG PROCESADOS DE SL : ${fmt(D.totKgVacDia)}</div>
    </div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }</script>
  </body></html>`);
  win.document.close();
}

// ─────────────────────────── Excel (ExcelJS, con colores) ───────────────────────────
export async function generarExcelVaciadoHora(args) {
  const D = _preparar(args);
  const nL = D.lotes.length;
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma SL";
  const ws = wb.addWorksheet("Vaciado por hora");

  const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } });
  const thin = { style: "thin", color: { argb: "FF000000" } };
  const borde = { top: thin, left: thin, right: thin, bottom: thin };
  const centro = { horizontal: "center", vertical: "middle" };
  const der = { horizontal: "right", vertical: "middle" };
  const set = (r, c, value, { bg, bold, align, num } = {}) => {
    const cell = ws.getRow(r).getCell(c);
    cell.value = value;
    cell.border = borde;
    if (bg) cell.fill = fill(bg);
    cell.font = { bold: !!bold, name: "Arial", size: 10 };
    cell.alignment = align || centro;
    if (num) cell.numFmt = "#,##0";
  };

  // Layout de columnas: 1=HORA, luego nL (recibidos) + nL (procesados) + nL (kg) + 1 (%merma).
  const cRecIni = 2, cProcIni = 2 + nL, cKgIni = 2 + 2 * nL, cMerma = 2 + 3 * nL;
  const totCols = cMerma;
  ws.columns = Array.from({ length: totCols }, (_, i) => ({ width: i === 0 ? 14 : 12 }));

  // Fila 1: grupos (verde) + esquina + %merma (naranja, merge 1-2).
  set(1, 1, "", { bg: COL.verde });
  const grupo = (cIni, txt) => {
    ws.mergeCells(1, cIni, 1, cIni + nL - 1);
    set(1, cIni, txt, { bg: COL.verde, bold: true });
    for (let c = cIni + 1; c < cIni + nL; c++) { ws.getRow(1).getCell(c).border = borde; ws.getRow(1).getCell(c).fill = fill(COL.verde); }
  };
  grupo(cRecIni, "BINS RECIBIDOS");
  grupo(cProcIni, "BINS PROCESADOS");
  grupo(cKgIni, "KG PROCESADOS");
  ws.mergeCells(1, cMerma, 2, cMerma);
  set(1, cMerma, "% MERMA EN KG", { bg: COL.naranja, bold: true });
  ws.getRow(2).getCell(cMerma).border = borde;

  // Fila 2: HORA + sub-headers de lote (naranja).
  set(2, 1, "HORA", { bg: COL.naranja, bold: true });
  [cRecIni, cProcIni, cKgIni].forEach((cIni) => {
    D.lotes.forEach((l, i) => set(2, cIni + i, D.rotulo(l), { bg: COL.naranja, bold: true }));
  });

  // Filas de datos.
  let r = 3;
  D.filas.forEach((f) => {
    set(r, 1, f.franja, { bg: f.esBreak ? COL.naranja : undefined, bold: true, align: { horizontal: "left", vertical: "middle" } });
    D.lotes.forEach((_, i) => set(r, cRecIni + i, "", {}));          // bins recibidos por hora: en blanco
    f.binsProc.forEach((b, i) => set(r, cProcIni + i, b == null ? "" : b, { align: der, num: true }));
    f.kg.forEach((k, i) => set(r, cKgIni + i, k == null ? "" : k, { align: der, num: true }));
    set(r, cMerma, f.pctMerma == null ? "" : f.pctMerma / 100, {});
    if (f.pctMerma != null) { const c = ws.getRow(r).getCell(cMerma); c.numFmt = "0%"; c.alignment = der; }
    r++;
  });

  // Fila TOTALES (amarillo).
  set(r, 1, "TOTALES", { bg: COL.amarillo, bold: true });
  D.totales.binRec.forEach((b, i) => set(r, cRecIni + i, b || 0, { bg: COL.amarillo, bold: true, align: der, num: true }));
  D.totales.binsProc.forEach((b, i) => set(r, cProcIni + i, b, { bg: COL.amarillo, bold: true, align: der, num: true }));
  D.totales.kg.forEach((k, i) => set(r, cKgIni + i, k, { bg: COL.amarillo, bold: true, align: der, num: true }));
  { const c = ws.getRow(r).getCell(cMerma); c.value = D.totales.mermaPct / 100; c.numFmt = "0%"; c.fill = fill(COL.amarillo); c.font = { bold: true, name: "Arial", size: 10 }; c.border = borde; c.alignment = der; }
  const rTot = r; r += 2;

  // Bloque de abajo (TOTAL / BINS PISO / lotes / TOTAL DEL DÍA).
  set(r, 1, "TOTAL", { bg: COL.verde, bold: true, align: { horizontal: "left" } }); set(r, 2, "", { bg: COL.verde }); r++;
  set(r, 1, "BINS PISO", { bg: COL.verdeClaro, bold: true, align: { horizontal: "left" } }); set(r, 2, 0, { bold: true, align: der, num: true }); r++;
  D.reales.forEach((l) => { set(r, 1, String(l).toUpperCase(), { bold: true, align: { horizontal: "left" } }); set(r, 2, bins(D.totKgLote[l], D.kgb), { bold: true, align: der, num: true }); r++; });
  for (let k = D.reales.length; k < 4; k++) { set(r, 1, "0", { bold: true, align: { horizontal: "left" } }); set(r, 2, 0, { bold: true, align: der, num: true }); r++; }
  set(r, 1, "TOTAL DEL DÍA", { bg: COL.salmon, bold: true, align: { horizontal: "left" } }); set(r, 2, D.totBinsProc, { bg: COL.salmon, bold: true, align: der, num: true }); r += 2;

  // KG PROCESADOS DE SL (amarillo).
  set(r, 1, "KG PROCESADOS DE SL", { bg: COL.amarillo, bold: true, align: { horizontal: "left" } });
  set(r, 2, D.totKgVacDia, { bg: COL.amarillo, bold: true, align: der, num: true });

  ws.getRow(1).height = 20; ws.getRow(2).height = 18; ws.getRow(rTot).height = 18;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `vaciado-por-hora-${D.dia || "reporte"}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
