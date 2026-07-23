import { esc } from "../../utils/esc";

// ── Reporte "Vaciado por hora" en BINS (el que revisan los jefes) ──
// Réplica EXACTA del Excel: grupos BINS RECIBIDOS / BINS PROCESADOS / KG PROCESADOS (cada uno con
// una columna por lote), + % MERMA EN KG, grid de 24 h (arranca 08:00), fila TOTALES y el bloque
// de abajo. Todo en BINS: cada `kgPorBin` kg NETOS = 1 bin. Solo lectura; no toca datos.
//
// Colores del Excel: verde apagado (#a9c48d) headers de grupo, naranja dorado (#f6a500) HORA y
// sub-headers de lote, amarillo (#ffff00) TOTALES / KG de SL, salmón (#f4b183) TOTAL DEL DÍA.
// La columna HORA (los datos) va en BLANCO; solo el encabezado es naranja. Borde negro fino.

const fmt = (n) => Math.round(n || 0).toLocaleString("es-MX");
const bins = (kg, kgPorBin) => Math.round((kg || 0) / (kgPorBin || 260));

export function generarPDFVaciadoHora({ dia, porHora, lotesHora, kgPorBin, totKgVacDia, binsRecibidosPorLote, mermaPorHora }) {
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }

  const kgb = parseFloat(kgPorBin) || 260;
  // Lotes reales del día + relleno con placeholders "0" hasta mínimo 2 columnas (plantilla del Excel).
  const reales = lotesHora.length ? lotesHora : [];
  const lotes = [...reales];
  while (lotes.length < 2) lotes.push({ ph: true });          // placeholder (columna "0" vacía)
  const esPh = (l) => l && l.ph === true;
  const rotulo = (l) => (esPh(l) ? "0" : String(l).toUpperCase());
  const nL = lotes.length;

  const mapaH = Object.fromEntries(porHora.map(([h, v]) => [String(Number(h)), v]));
  // Turno del Excel: 08:00 a 22:00 (start hours 8..21 = 14 franjas). Si hubo vaciado FUERA de ese
  // rango, se agregan esas horas al final para no esconder datos.
  const turno = Array.from({ length: 14 }, (_, i) => 8 + i);          // 8 → 21
  const extras = porHora.map(([h]) => Number(h)).filter((h) => !turno.includes(h)).sort((a, b) => a - b);
  const horas = [...turno, ...extras];
  const BREAK_HOURS = [14];   // 02:00 A 03:00 (comida) → se pinta naranja, como en el Excel

  // Totales por lote.
  const totKgLote = {};
  reales.forEach((l) => { totKgLote[l] = porHora.reduce((a, [, v]) => a + (v.lotes[l] || 0), 0); });
  const totMermaKg = Object.values(mermaPorHora || {}).reduce((a, v) => a + v, 0);
  const totBinsProc = bins(totKgVacDia, kgb);
  const totMermaPct = (totKgVacDia + totMermaKg) > 0 ? Math.round((totMermaKg / (totKgVacDia + totMermaKg)) * 100) : 0;

  // Formato de 12 horas SIN am/pm (como el Excel): 12:00 A 01:00, 01:00 A 02:00…
  const h12 = (h) => { const x = h % 12; return String(x === 0 ? 12 : x).padStart(2, "0"); };
  const franja = (h) => `${h12(h)}:00 A ${h12((h + 1) % 24)}:00`;
  const kgLoteHora = (v, l) => (esPh(l) ? 0 : (v?.lotes?.[l] || 0));

  const filas = horas.map((h) => {
    const v = mapaH[String(h)];
    const kgHora = v?.kg || 0;
    const merKg = (mermaPorHora || {})[String(h)] || 0;
    const pctMerma = (kgHora + merKg) > 0 ? Math.round((merKg / (kgHora + merKg)) * 100) : null;
    const cel = (val) => `<td class="num">${val || ""}</td>`;
    const esBreak = BREAK_HOURS.includes(h);
    return `<tr>
      <td class="hora${esBreak ? " break" : ""}">${franja(h)}</td>
      ${lotes.map(() => `<td></td>`).join("")}
      ${lotes.map((l) => { const kg = kgLoteHora(v, l); return cel(kg ? fmt(bins(kg, kgb)) : ""); }).join("")}
      ${lotes.map((l) => { const kg = kgLoteHora(v, l); return cel(kg ? fmt(kg) : ""); }).join("")}
      ${cel(pctMerma == null ? "" : pctMerma + "%")}
    </tr>`;
  }).join("");

  const binRecTot = (l) => (esPh(l) ? 0 : (binsRecibidosPorLote?.[l] || 0));
  const filaTotales = `<tr class="totales">
    <td>TOTALES</td>
    ${lotes.map((l) => `<td class="num">${binRecTot(l) || 0}</td>`).join("")}
    ${lotes.map((l) => `<td class="num">${esPh(l) ? 0 : fmt(bins(totKgLote[l], kgb))}</td>`).join("")}
    ${lotes.map((l) => `<td class="num">${esPh(l) ? 0 : fmt(totKgLote[l])}</td>`).join("")}
    <td class="num">${totMermaPct}%</td>
  </tr>`;

  // Bloque inferior: TOTAL / BINS PISO / bins por lote (+ relleno "0") / TOTAL DEL DÍA.
  const filasLotesAbajo = reales.map((l) =>
    `<tr><td class="lote">${esc(String(l).toUpperCase())}</td><td class="num">${fmt(bins(totKgLote[l], kgb))}</td></tr>`).join("")
    + Array.from({ length: Math.max(0, 4 - reales.length) }, () => `<tr><td class="lote">0</td><td class="num">0</td></tr>`).join("");

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
  <title>Vaciado por hora — ${esc(dia || "")}</title>
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
    /* Header de grupos: verde apagado */
    .grid th.grupo { background: #a9c48d; font-weight: bold; text-align: center; }
    .grid th.corner { background: #a9c48d; }
    /* Sub-headers de lote + HORA (encabezado): naranja dorado */
    .grid th.sub { background: #f6a500; font-weight: bold; text-align: center; }
    /* Celdas de la columna HORA (datos): BLANCAS, texto negro en negrita */
    .grid td.hora { background: #fff; font-weight: bold; white-space: nowrap; }
    /* Fila de descanso (comida): la hora va en naranja, como en el Excel */
    .grid td.hora.break { background: #f6a500; }
    /* Fila de totales: amarillo */
    .grid tr.totales td { background: #ffff00; font-weight: bold; }
    /* Resumen de abajo */
    .abajo { margin-top: 16px; display: flex; gap: 40px; align-items: flex-start; flex-wrap: wrap; }
    .resumen { font-size: 12px; }
    .resumen td { border: 1px solid #000; padding: 4px 12px; }
    .resumen td.hdr { background: #a9c48d; font-weight: bold; }
    .resumen td.lbl { background: #cfe2b0; font-weight: bold; }
    .resumen td.lote { font-weight: bold; }
    .resumen td.num { text-align: right; font-weight: bold; min-width: 70px; }
    .resumen tr.tot-dia td.lbl { background: #f4b183; }
    .kg-sl { background: #ffff00; border: 1px solid #000; padding: 6px 14px; font-size: 12px; font-weight: bold; }
    @media print { body { margin: 0; } .noprint { display: none; } }
    .noprint { margin: 10px 0; }
    .btn { background: #4f46e5; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  </style></head><body>
    <div class="noprint"><button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button></div>
    <h1>Vaciado por hora — SL Logística</h1>
    <div class="sub">Reporte del día <b>${esc(dia || "—")}</b> · medido en BINS (cada ${fmt(kgb)} kg netos = 1 bin) · ${fmt(totBinsProc)} bins procesados</div>
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
          ${lotes.map((l) => `<th class="sub">${esc(rotulo(l))}</th>`).join("")}
          ${lotes.map((l) => `<th class="sub">${esc(rotulo(l))}</th>`).join("")}
          ${lotes.map((l) => `<th class="sub">${esc(rotulo(l))}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${filas}
        ${filaTotales}
      </tbody>
    </table>
    <div class="abajo">
      <table class="resumen">
        <tr><td class="hdr" colspan="2">TOTAL</td></tr>
        <tr><td class="lbl">BINS PISO</td><td class="num">0</td></tr>
        ${filasLotesAbajo}
        <tr class="tot-dia"><td class="lbl">TOTAL DEL DÍA</td><td class="num">${fmt(totBinsProc)}</td></tr>
      </table>
      <div class="kg-sl">KG PROCESADOS DE SL : ${fmt(totKgVacDia)}</div>
    </div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }</script>
  </body></html>`);
  win.document.close();
}
