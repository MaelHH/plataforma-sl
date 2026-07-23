import { esc } from "../../utils/esc";

// ── Reporte "Vaciado por hora" en BINS (el que revisan los jefes) ──
// Replica el Excel: columnas agrupadas BINS RECIBIDOS / BINS PROCESADOS / KG PROCESADOS por lote,
// + % MERMA EN KG, con el grid de 24 horas (arranca 08:00), TOTALES y el bloque de abajo.
// Todo se mide en BINS: cada `kgPorBin` kg NETOS = 1 bin. Solo lectura; no toca datos.
//
// Colores tomados del Excel: verde (#a9d08e) headers de grupo, naranja (#e9a020) columna HORA y
// sub-headers, amarillo (#ffff00) TOTALES y el resumen de kg. Borde negro fino.

const fmt = (n) => Math.round(n || 0).toLocaleString("es-MX");
const bins = (kg, kgPorBin) => Math.round((kg || 0) / (kgPorBin || 260));

export function generarPDFVaciadoHora({ dia, porHora, lotesHora, kgPorBin, totKgVacDia, binsRecibidosPorLote, mermaPorHora }) {
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }

  const lotes = lotesHora.length ? lotesHora : ["—"];
  const kgb = parseFloat(kgPorBin) || 260;
  // Mapa hora(número) → { kg, lotes:{} } para buscar rápido.
  const mapaH = Object.fromEntries(porHora.map(([h, v]) => [String(Number(h)), v]));

  // Grid de 24 horas arrancando a las 08:00 (como el Excel), dando la vuelta al día.
  const horas = Array.from({ length: 24 }, (_, i) => (8 + i) % 24);

  // Totales por lote.
  const totKgLote = {}, totBinRecLote = {};
  lotes.forEach((l) => {
    totKgLote[l] = porHora.reduce((a, [, v]) => a + (v.lotes[l] || 0), 0);
    totBinRecLote[l] = binsRecibidosPorLote?.[l] || 0;
  });
  const totMermaKg = Object.values(mermaPorHora || {}).reduce((a, v) => a + v, 0);
  const totBinsProc = bins(totKgVacDia, kgb);
  const totBinsRec = Object.values(totBinRecLote).reduce((a, v) => a + v, 0);

  // Una franja: 08:00 A 09:00
  const franja = (h) => `${String(h).padStart(2, "0")}:00 A ${String((h + 1) % 24).padStart(2, "0")}:00`;

  const filas = horas.map((h) => {
    const v = mapaH[String(h)];
    const kgHora = v?.kg || 0;
    const merKg = (mermaPorHora || {})[String(h)] || 0;
    const pctMerma = (kgHora + merKg) > 0 ? Math.round((merKg / (kgHora + merKg)) * 100) : null;
    const celdaKg = (l) => { const kg = v?.lotes?.[l] || 0; return kg ? fmt(kg) : ""; };
    const celdaBin = (l) => { const kg = v?.lotes?.[l] || 0; return kg ? fmt(bins(kg, kgb)) : ""; };
    return `<tr>
      <td class="hora">${franja(h)}</td>
      ${lotes.map(() => `<td></td>`).join("")}
      ${lotes.map((l) => `<td class="num">${celdaBin(l)}</td>`).join("")}
      ${lotes.map((l) => `<td class="num">${celdaKg(l)}</td>`).join("")}
      <td class="num">${pctMerma == null ? "" : pctMerma + "%"}</td>
    </tr>`;
  }).join("");

  const totMermaPct = (totKgVacDia + totMermaKg) > 0 ? Math.round((totMermaKg / (totKgVacDia + totMermaKg)) * 100) : 0;

  const filaTotales = `<tr class="totales">
    <td>TOTALES</td>
    ${lotes.map((l) => `<td class="num">${totBinRecLote[l] || ""}</td>`).join("")}
    ${lotes.map((l) => `<td class="num">${fmt(bins(totKgLote[l], kgb))}</td>`).join("")}
    ${lotes.map((l) => `<td class="num">${fmt(totKgLote[l])}</td>`).join("")}
    <td class="num">${totMermaPct}%</td>
  </tr>`;

  // Bloque de abajo: BINS PISO + bins procesados por lote + total del día + kg de SL.
  const bloqueAbajo = `
    <table class="resumen">
      <tr><td class="lbl">BINS PISO</td><td class="num">0</td></tr>
      ${lotes.map((l) => `<tr><td class="lote">${esc(String(l).toUpperCase())}</td><td class="num">${fmt(bins(totKgLote[l], kgb))}</td></tr>`).join("")}
      <tr class="tot-dia"><td>TOTAL DEL DÍA</td><td class="num">${fmt(totBinsProc)}</td></tr>
    </table>
    <div class="kg-sl">KG PROCESADOS DE SL : <b>${fmt(totKgVacDia)}</b></div>`;

  const nLotes = lotes.length;
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
  <title>Vaciado por hora — ${esc(dia || "")}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 18px; color: #000; }
    h1 { font-size: 15px; margin: 0 0 2px; }
    .sub { font-size: 11px; color: #444; margin-bottom: 10px; }
    table { border-collapse: collapse; }
    .grid { width: 100%; font-size: 11px; }
    .grid th, .grid td { border: 1px solid #000; padding: 3px 6px; }
    .grid td.num, .grid th.num { text-align: right; font-variant-numeric: tabular-nums; }
    /* Header de grupos (verde) */
    .grupo th { background: #a9d08e; font-weight: bold; text-align: center; }
    /* Sub-header por lote y HORA (naranja) */
    .sub-h th { background: #e9a020; font-weight: bold; text-align: center; color: #000; }
    .grid td.hora { background: #e9a020; font-weight: bold; white-space: nowrap; }
    /* Fila de totales (amarillo) */
    .grid tr.totales td { background: #ffff00; font-weight: bold; }
    /* Resumen de abajo */
    .resumen { margin-top: 14px; font-size: 12px; }
    .resumen td { border: 1px solid #000; padding: 4px 10px; }
    .resumen td.lbl { background: #cfe2b0; font-weight: bold; }
    .resumen td.lote { font-weight: bold; }
    .resumen td.num { text-align: right; font-weight: bold; min-width: 70px; }
    .resumen tr.tot-dia td { background: #f4b183; font-weight: bold; }
    .kg-sl { margin-top: 10px; display: inline-block; background: #ffff00; border: 1px solid #000;
             padding: 5px 12px; font-size: 12px; font-weight: bold; }
    @media print { body { margin: 0; } .noprint { display: none; } }
    .noprint { margin: 12px 0; }
    .btn { background: #4f46e5; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  </style></head><body>
    <div class="noprint"><button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button></div>
    <h1>Vaciado por hora — SL Logística</h1>
    <div class="sub">Reporte del día <b>${esc(dia || "—")}</b> · medido en BINS (cada ${fmt(kgb)} kg netos = 1 bin) · ${totBinsRec ? `bins recibidos: ${fmt(totBinsRec)} · ` : ""}${fmt(totBinsProc)} bins procesados</div>
    <table class="grid">
      <thead>
        <tr class="grupo">
          <th rowspan="2">HORA</th>
          <th colspan="${nLotes}">BINS RECIBIDOS</th>
          <th colspan="${nLotes}">BINS PROCESADOS</th>
          <th colspan="${nLotes}">KG PROCESADOS</th>
          <th rowspan="2" class="sub-h" style="background:#e9a020">% MERMA EN KG</th>
        </tr>
        <tr class="sub-h">
          ${lotes.map((l) => `<th>${esc(String(l).toUpperCase())}</th>`).join("")}
          ${lotes.map((l) => `<th>${esc(String(l).toUpperCase())}</th>`).join("")}
          ${lotes.map((l) => `<th>${esc(String(l).toUpperCase())}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${filas}
        ${filaTotales}
      </tbody>
    </table>
    ${bloqueAbajo}
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }</script>
  </body></html>`);
  win.document.close();
}
