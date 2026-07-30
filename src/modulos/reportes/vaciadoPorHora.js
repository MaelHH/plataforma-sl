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

// ═══════════════ Variante LOTES (una sola tabla, columnas por lote) — EMPAQUE CAMPO DIRECTO ═══════════════
// Prepara TODO lo que necesitan ambas salidas a partir de los datos del módulo.
function _prepararLotes({ dia, porHora, lotesHora, kgPorBin, totKgVacDia, binsRecibidosPorLote, mermaPorHora, enPisoPorLote, mermaHoraLote }) {
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

  // "En piso" que va quedando por lote. El inventario REAL al final del día es `enPisoPorLote`; el
  // running arranca en (inventario final + lo que se vació/mermó HOY) y baja cada hora, terminando
  // exactamente en el inventario real. Así el "falta en piso" cuadra con las tarjetas.
  const restante = {};
  reales.forEach((l) => {
    const vacHoy = porHora.reduce((a, [, v]) => a + (v.lotes[l] || 0), 0);
    const merHoy = horas.reduce((a, h) => a + ((mermaHoraLote?.[String(h)]?.[l]) || 0), 0);
    restante[l] = (enPisoPorLote?.[l] || 0) + vacHoy + merHoy;
  });
  const filas = horas.map((h) => {
    const v = mapaH[String(h)];
    const kgHora = v?.kg || 0;
    const merKg = (mermaPorHora || {})[String(h)] || 0;
    const pctMerma = (kgHora + merKg) > 0 ? Math.round((merKg / (kgHora + merKg)) * 100) : null;
    // Descontar del restante lo que se vació/mermó ESTA hora, por lote. El "en piso" solo se
    // muestra en las horas donde ese lote tuvo movimiento (cuánto quedaba en ese momento).
    const enPiso = lotes.map((l) => {
      if (esPh(l)) return null;
      const vac = kgLoteHora(v, l);
      const mer = (mermaHoraLote?.[String(h)]?.[l]) || 0;
      restante[l] = Math.max(0, (restante[l] || 0) - vac - mer);
      return (vac > 0 || mer > 0) ? restante[l] : null;
    });
    return {
      h, franja: franja(h), esBreak: BREAK_HOURS.includes(h),
      binsProc: lotes.map((l) => { const kg = kgLoteHora(v, l); return kg ? bins(kg, kgb) : null; }),
      kg: lotes.map((l) => { const kg = kgLoteHora(v, l); return kg || null; }),
      enPiso, pctMerma,
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
    enPiso: lotes.map((l) => (esPh(l) ? 0 : restante[l] || 0)),   // lo que quedó en piso al final
    mermaPct: totMermaPct,
  };

  // Total EN PISO (todos los lotes) para el resumen de abajo, en kg y en bins.
  const totEnPisoKg = reales.reduce((a, l) => a + (enPisoPorLote?.[l] || 0), 0);
  const totBinsPiso = bins(totEnPisoKg, kgb);
  const enPisoLote = enPisoPorLote || {};

  return { dia, kgb, lotes, reales, esPh, rotulo, horas, filas, totales, totKgLote, totBinsProc, totKgVacDia, totBinsPiso, totEnPisoKg, enPisoLote };
}

// ─────────────────────────── PDF (window.print) ───────────────────────────
export function generarPDFVaciadoLotes(args) {
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }
  const D = _prepararLotes(args);
  const nL = D.lotes.length;

  const filasHTML = D.filas.map((f) => `<tr>
    <td class="hora${f.esBreak ? " break" : ""}">${f.franja}</td>
    ${D.lotes.map(() => `<td></td>`).join("")}
    ${f.binsProc.map((b) => `<td class="num">${b == null ? "" : fmt(b)}</td>`).join("")}
    ${f.kg.map((k) => `<td class="num">${k == null ? "" : fmt(k)}</td>`).join("")}
    ${f.enPiso.map((p) => `<td class="num piso">${p == null ? "" : fmt(p)}</td>`).join("")}
    <td class="num">${f.pctMerma == null ? "" : f.pctMerma + "%"}</td>
  </tr>`).join("");

  const filaTotales = `<tr class="totales">
    <td>TOTALES</td>
    ${D.totales.binRec.map((b) => `<td class="num">${b || 0}</td>`).join("")}
    ${D.totales.binsProc.map((b) => `<td class="num">${fmt(b)}</td>`).join("")}
    ${D.totales.kg.map((k) => `<td class="num">${fmt(k)}</td>`).join("")}
    ${D.totales.enPiso.map((p) => `<td class="num">${fmt(p)}</td>`).join("")}
    <td class="num">${D.totales.mermaPct}%</td>
  </tr>`;

  // Bloque de abajo: por lote, bins procesados Y lo que FALTA EN PISO (kg) del lote completo.
  const filasAbajo = D.reales.map((l) =>
    `<tr><td class="lote">${esc(String(l).toUpperCase())}</td><td class="num">${fmt(bins(D.totKgLote[l], D.kgb))}</td><td class="num piso">${fmt(D.enPisoLote[l] || 0)}</td></tr>`).join("")
    + Array.from({ length: Math.max(0, 4 - D.reales.length) }, () => `<tr><td class="lote">0</td><td class="num">0</td><td class="num piso">0</td></tr>`).join("");

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
    .grid th.grupo.piso { background: #${COL.salmon}; }
    .grid td.piso { background: #fde9d9; font-weight: bold; }
    .grid tr.totales td { background: #${COL.amarillo}; font-weight: bold; }
    .abajo { margin-top: 16px; display: flex; gap: 40px; align-items: flex-start; flex-wrap: wrap; }
    .resumen { font-size: 12px; }
    .resumen td { border: 1px solid #000; padding: 4px 12px; }
    .resumen td.hdr { background: #${COL.verde}; font-weight: bold; }
    .resumen td.lbl { background: #${COL.verdeClaro}; font-weight: bold; }
    .resumen td.lote { font-weight: bold; }
    .resumen td.num { text-align: right; font-weight: bold; min-width: 70px; }
    .resumen tr.tot-dia td.lbl { background: #${COL.salmon}; }
    .resumen td.hdr.piso { background: #${COL.salmon}; }
    .resumen td.piso { background: #fde9d9; }
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
          <th class="grupo piso" colspan="${nL}">FALTA EN PISO (kg)</th>
          <th class="sub" rowspan="2">% MERMA<br/>EN KG</th>
        </tr>
        <tr>
          <th class="sub">HORA</th>
          ${D.lotes.map((l) => `<th class="sub">${esc(D.rotulo(l))}</th>`).join("")}
          ${D.lotes.map((l) => `<th class="sub">${esc(D.rotulo(l))}</th>`).join("")}
          ${D.lotes.map((l) => `<th class="sub">${esc(D.rotulo(l))}</th>`).join("")}
          ${D.lotes.map((l) => `<th class="sub">${esc(D.rotulo(l))}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${filasHTML}${filaTotales}</tbody>
    </table>
    <div class="abajo">
      <table class="resumen">
        <tr><td class="hdr">TOTAL</td><td class="hdr">BINS PROC.</td><td class="hdr piso">FALTA PISO (kg)</td></tr>
        <tr><td class="lbl">BINS EN PISO</td><td class="num">${fmt(D.totBinsPiso)}</td><td class="num piso">${fmt(D.totEnPisoKg)}</td></tr>
        ${filasAbajo}
        <tr class="tot-dia"><td class="lbl">TOTAL DEL DÍA</td><td class="num">${fmt(D.totBinsProc)}</td><td class="num piso">${fmt(D.totEnPisoKg)}</td></tr>
      </table>
      <div class="kg-sl">KG PROCESADOS DE SL : ${fmt(D.totKgVacDia)}</div>
    </div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }</script>
  </body></html>`);
  win.document.close();
}

// ─────────────────────────── Excel (ExcelJS, con colores) ───────────────────────────
export async function generarExcelVaciadoLotes(args) {
  const D = _prepararLotes(args);
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

  // Layout: 1=HORA, luego nL (recibidos) + nL (procesados) + nL (kg) + nL (en piso) + 1 (%merma).
  const cRecIni = 2, cProcIni = 2 + nL, cKgIni = 2 + 2 * nL, cPisoIni = 2 + 3 * nL, cMerma = 2 + 4 * nL;
  const totCols = cMerma;
  ws.columns = Array.from({ length: totCols }, (_, i) => ({ width: i === 0 ? 14 : 12 }));

  // Fila 1: grupos (verde; en piso salmón) + esquina + %merma (naranja, merge 1-2).
  set(1, 1, "", { bg: COL.verde });
  const grupo = (cIni, txt, bg = COL.verde) => {
    ws.mergeCells(1, cIni, 1, cIni + nL - 1);
    set(1, cIni, txt, { bg, bold: true });
    for (let c = cIni + 1; c < cIni + nL; c++) { ws.getRow(1).getCell(c).border = borde; ws.getRow(1).getCell(c).fill = fill(bg); }
  };
  grupo(cRecIni, "BINS RECIBIDOS");
  grupo(cProcIni, "BINS PROCESADOS");
  grupo(cKgIni, "KG PROCESADOS");
  grupo(cPisoIni, "FALTA EN PISO (kg)", COL.salmon);
  ws.mergeCells(1, cMerma, 2, cMerma);
  set(1, cMerma, "% MERMA EN KG", { bg: COL.naranja, bold: true });
  ws.getRow(2).getCell(cMerma).border = borde;

  // Fila 2: HORA + sub-headers de lote (naranja).
  set(2, 1, "HORA", { bg: COL.naranja, bold: true });
  [cRecIni, cProcIni, cKgIni, cPisoIni].forEach((cIni) => {
    D.lotes.forEach((l, i) => set(2, cIni + i, D.rotulo(l), { bg: COL.naranja, bold: true }));
  });

  // Filas de datos.
  let r = 3;
  D.filas.forEach((f) => {
    set(r, 1, f.franja, { bg: f.esBreak ? COL.naranja : undefined, bold: true, align: { horizontal: "left", vertical: "middle" } });
    D.lotes.forEach((_, i) => set(r, cRecIni + i, "", {}));          // bins recibidos por hora: en blanco
    f.binsProc.forEach((b, i) => set(r, cProcIni + i, b == null ? "" : b, { align: der, num: true }));
    f.kg.forEach((k, i) => set(r, cKgIni + i, k == null ? "" : k, { align: der, num: true }));
    f.enPiso.forEach((p, i) => set(r, cPisoIni + i, p == null ? "" : p, { bg: p == null ? undefined : "fde9d9", align: der, num: true }));
    set(r, cMerma, f.pctMerma == null ? "" : f.pctMerma / 100, {});
    if (f.pctMerma != null) { const c = ws.getRow(r).getCell(cMerma); c.numFmt = "0%"; c.alignment = der; }
    r++;
  });

  // Fila TOTALES (amarillo).
  set(r, 1, "TOTALES", { bg: COL.amarillo, bold: true });
  D.totales.binRec.forEach((b, i) => set(r, cRecIni + i, b || 0, { bg: COL.amarillo, bold: true, align: der, num: true }));
  D.totales.binsProc.forEach((b, i) => set(r, cProcIni + i, b, { bg: COL.amarillo, bold: true, align: der, num: true }));
  D.totales.kg.forEach((k, i) => set(r, cKgIni + i, k, { bg: COL.amarillo, bold: true, align: der, num: true }));
  D.totales.enPiso.forEach((p, i) => set(r, cPisoIni + i, p, { bg: COL.amarillo, bold: true, align: der, num: true }));
  { const c = ws.getRow(r).getCell(cMerma); c.value = D.totales.mermaPct / 100; c.numFmt = "0%"; c.fill = fill(COL.amarillo); c.font = { bold: true, name: "Arial", size: 10 }; c.border = borde; c.alignment = der; }
  const rTot = r; r += 2;

  // Bloque de abajo (TOTAL / BINS PISO / por lote: bins proc. + falta en piso kg / TOTAL DEL DÍA).
  set(r, 1, "TOTAL", { bg: COL.verde, bold: true, align: { horizontal: "left" } });
  set(r, 2, "BINS PROC.", { bg: COL.verde, bold: true }); set(r, 3, "FALTA PISO (kg)", { bg: COL.salmon, bold: true }); r++;
  set(r, 1, "BINS EN PISO", { bg: COL.verdeClaro, bold: true, align: { horizontal: "left" } });
  set(r, 2, D.totBinsPiso, { bold: true, align: der, num: true }); set(r, 3, D.totEnPisoKg, { bg: "fde9d9", bold: true, align: der, num: true }); r++;
  D.reales.forEach((l) => {
    set(r, 1, String(l).toUpperCase(), { bold: true, align: { horizontal: "left" } });
    set(r, 2, bins(D.totKgLote[l], D.kgb), { bold: true, align: der, num: true });
    set(r, 3, D.enPisoLote[l] || 0, { bg: "fde9d9", bold: true, align: der, num: true }); r++;
  });
  for (let k = D.reales.length; k < 4; k++) { set(r, 1, "0", { bold: true, align: { horizontal: "left" } }); set(r, 2, 0, { bold: true, align: der, num: true }); set(r, 3, 0, { bg: "fde9d9", bold: true, align: der, num: true }); r++; }
  set(r, 1, "TOTAL DEL DÍA", { bg: COL.salmon, bold: true, align: { horizontal: "left" } });
  set(r, 2, D.totBinsProc, { bg: COL.salmon, bold: true, align: der, num: true });
  set(r, 3, D.totEnPisoKg, { bg: COL.salmon, bold: true, align: der, num: true }); r += 2;

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
