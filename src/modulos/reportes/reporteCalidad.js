import { DEFECTOS_QC, CATS_QC, INSP_VEHICULO, INSP_PRODUCTO } from "../../store/datos";
import { pctDefecto, pctCategoria, calcQCI } from "../helpers/calidad";

const colorQCI = (q) => (q >= 90 ? "#16a34a" : q >= 80 ? "#65a30d" : q >= 70 ? "#d97706" : "#dc2626");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Reporte PDF de Control de Calidad (muestreos de recepción) ──
export function generarReporteCalidad(muestreoMov, muestreos) {
  const m = muestreoMov;
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el reporte PDF."); return; }

  const bloques = muestreos.map((mu, idx) => {
    const qci = calcQCI(mu);
    const filas = DEFECTOS_QC.map((d) => {
      const pct = pctDefecto(mu.defectos[d.id], mu.pesoMuestra);
      const g = parseFloat(mu.defectos[d.id]) || 0;
      const tieneFoto = !!mu.fotos?.[d.id];
      return `<tr>
          <td>${esc(d.label)}${tieneFoto ? ' <span style="color:#6366f1;font-size:10px">(foto)</span>' : ""}</td>
          <td style="text-align:right">${g.toFixed(2)}</td>
          <td style="text-align:right;${pct > 0 ? "font-weight:700" : "color:#bbb"}">${pct.toFixed(1)}%</td>
        </tr>`;
    }).join("");

    const cats = Object.entries(CATS_QC).map(([k, cfg]) =>
      `<div class="cat"><span>${esc(cfg.label)}</span><b>${pctCategoria(mu, k).toFixed(1)}%</b></div>`).join("");

    const fotos = DEFECTOS_QC.filter((d) => mu.fotos?.[d.id]).map((d) =>
      `<figure><img src="${mu.fotos[d.id]}" /><figcaption>${esc(d.label)}</figcaption></figure>`).join("");

    return `
        <section class="muestreo">
          <h2>Muestreo ${idx + 1}</h2>
          <div class="meta">
            <div><label>Lote</label><span>${esc(mu.lote) || "—"}</span></div>
            <div><label>Inspector</label><span>${esc(mu.inspector) || "—"}</span></div>
            <div><label>Folio / ID</label><span>${esc(mu.folio) || "—"}</span></div>
            <div><label>Peso muestra</label><span>${esc(mu.pesoMuestra) || "—"}</span></div>
            <div><label>Fecha</label><span>${esc(mu.fecha) || "—"}</span></div>
          </div>
          <div class="cols">
            <table class="defectos">
              <thead><tr><th>Defecto</th><th style="text-align:right">Defectos (g)</th><th style="text-align:right">Promedio</th></tr></thead>
              <tbody>${filas}</tbody>
            </table>
            <div class="resumen">
              ${cats}
              <div class="qci" style="background:${colorQCI(qci)}">
                <span>QCI RECEPCIÓN</span><b>${qci.toFixed(2)}%</b>
              </div>
            </div>
          </div>
          ${fotos ? `<h3>Evidencia fotográfica</h3><div class="fotos">${fotos}</div>` : ""}
        </section>`;
  }).join("");

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
      <title>Control de Calidad - Folio ${esc(m.folio) || ""}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Arial, sans-serif; color: #1f2937; margin: 28px; font-size: 12px; }
        h1 { font-size: 18px; margin: 0; color: #ea580c; }
        .sub { color: #6b7280; font-size: 12px; margin: 2px 0 16px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .logo { font-weight: 800; font-size: 22px; color: #ea580c; }
        .info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
        .info div { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px; }
        .info label { display: block; color: #9ca3af; font-size: 10px; text-transform: uppercase; }
        .info span { font-weight: 700; }
        .muestreo { margin-top: 22px; }
        .muestreo h2 { font-size: 14px; background: #eef2ff; color: #4338ca; padding: 6px 10px; border-radius: 6px; }
        .meta { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 10px 0; }
        .meta label { display: block; color: #9ca3af; font-size: 9px; text-transform: uppercase; }
        .meta span { font-weight: 600; }
        .cols { display: flex; gap: 14px; align-items: flex-start; }
        table.defectos { flex: 1; border-collapse: collapse; width: 100%; }
        table.defectos th { background: #f3f4f6; text-align: left; padding: 5px 8px; font-size: 10px; color: #6b7280; }
        table.defectos td { padding: 4px 8px; border-top: 1px solid #f0f0f0; }
        .resumen { width: 200px; }
        .cat { display: flex; justify-content: space-between; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; font-size: 12px; }
        .cat b { font-size: 15px; }
        .qci { color: #fff; border-radius: 10px; padding: 14px; text-align: center; }
        .qci span { display: block; font-size: 11px; opacity: .9; }
        .qci b { font-size: 28px; }
        h3 { font-size: 12px; margin: 14px 0 6px; color: #374151; }
        .fotos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .fotos figure { margin: 0; }
        .fotos img { width: 100%; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; }
        .fotos figcaption { font-size: 10px; color: #6b7280; text-align: center; margin-top: 2px; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <div class="head">
        <div>
          <h1>Control de Calidad — Recepción</h1>
          <div class="sub">SL Logística · reporte para grupo de empaque</div>
        </div>
        <div class="logo">SL</div>
      </div>
      <div class="info">
        <div><label>Folio flete</label><span>${esc(m.folio) || "—"}</span></div>
        <div><label>Fecha salida</label><span>${esc(m.fecha) || "—"}</span></div>
        <div><label>Origen → Destino</label><span>${esc(m.origen) || "—"} → ${esc(m.destino) || "—"}</span></div>
        <div><label>Línea / Chofer</label><span>${esc(m.linea) || "—"} · ${esc(m.chofer) || "—"}</span></div>
      </div>
      ${bloques}
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`);
  win.document.close();
}

// ── Reporte PDF: Inspección de vehículo y producto (REG-EMP-24) ──
export function generarReporteInspeccion(insp) {
  const i = insp;
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el reporte PDF."); return; }

  const cell = (grupo, c) => {
    const v = (i[grupo]?.[c.id] || "").toUpperCase();
    const malo = i[grupo]?.[c.id] === c.malo;
    return `<td class="chk${malo ? " malo" : ""}">${v}</td>`;
  };
  const subVeh = INSP_VEHICULO.map((c) => `<th class="rot">${esc(c.label)}</th>`).join("");
  const subProd = INSP_PRODUCTO.map((c) => `<th class="rot">${esc(c.label)}</th>`).join("");
  const celdasVeh = INSP_VEHICULO.map((c) => cell("veh", c)).join("");
  const celdasProd = INSP_PRODUCTO.map((c) => cell("prod", c)).join("");

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
      <title>Inspección de vehículo y producto - Remisión ${esc(i.remision) || ""}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: "Times New Roman", Georgia, serif; color: #111; margin: 18px; font-size: 12px; }
        .marco { border: 1px solid #333; }
        .cab { display: flex; align-items: stretch; border-bottom: 1px solid #333; }
        .cab .logo { width: 200px; display: flex; align-items: center; justify-content: center; padding: 8px; border-right: 1px solid #333; }
        .cab .logo b { font-size: 26px; color: #e11d48; font-weight: 800; }
        .cab .logo small { color: #f59e0b; font-weight: 700; letter-spacing: 3px; }
        .cab .tit { flex: 1; text-align: center; padding: 10px; display: flex; flex-direction: column; justify-content: center; }
        .cab .tit b { font-size: 14px; }
        .cab .cat { width: 150px; display: flex; align-items: center; justify-content: center; border-left: 1px solid #333; font-weight: 800; font-size: 20px; }
        .codes { display: flex; border-bottom: 1px solid #333; font-weight: 700; }
        .codes div { padding: 5px 10px; }
        .codes .c1 { width: 200px; border-right: 1px solid #333; }
        .codes .c2 { flex: 1; text-align: center; border-right: 1px solid #333; }
        .codes .c3 { width: 150px; text-align: center; }
        .instr { padding: 8px 10px; font-size: 11px; border-bottom: 1px solid #333; }
        table.insp { width: 100%; border-collapse: collapse; }
        table.insp th, table.insp td { border: 1px solid #333; padding: 4px; text-align: center; vertical-align: middle; }
        table.insp th { font-size: 10px; font-weight: 700; }
        table.insp th.rot { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; height: 120px; }
        table.insp td { font-size: 12px; height: 34px; }
        table.insp td.chk { font-weight: 700; }
        table.insp td.malo { color: #dc2626; background: #fef2f2; }
        .acc { border: 1px solid #333; border-top: none; padding: 8px 10px; min-height: 46px; }
        .acc b { display: block; margin-bottom: 4px; }
        .firmas { display: flex; gap: 30px; margin-top: 26px; padding: 0 6px; font-size: 12px; }
        .firmas div { flex: 1; }
        .ln { border-bottom: 1px solid #333; display: inline-block; min-width: 180px; }
        @media print { body { margin: 10mm; } }
      </style></head><body>
      <div class="marco">
        <div class="cab">
          <div class="logo"><div><b>SL</b><br/><small>agrícola</small></div></div>
          <div class="tit">
            <b>SL AGRÍCOLA SA DE CV</b>
            <b>INSPECCIÓN DE VEHÍCULO Y PRODUCTO QUE LLEGA A LA PLANTA</b>
          </div>
          <div class="cat">CAT<br/>SA DE CV</div>
        </div>
        <div class="codes">
          <div class="c1">REG-EMP-24</div>
          <div class="c2">ELABORACIÓN: FEBRERO 2024</div>
          <div class="c3">POE-ADM-11</div>
        </div>
        <div class="instr"><b>Instrucciones:</b> Inspeccione el producto que está llegando para revisar la presencia de objetos extraños. Si se encuentra, separe el producto, notifique a su supervisor, remueva y verifique nuevamente el producto. Inspeccione cada carga a la llegada.</div>
        <table class="insp">
          <thead>
            <tr>
              <th rowspan="2">Producto</th>
              <th rowspan="2">Fecha</th>
              <th rowspan="2">Hora</th>
              <th rowspan="2">No. De remisión</th>
              <th colspan="${INSP_VEHICULO.length}">VEHÍCULO (SI / NO)</th>
              <th rowspan="2">Temperatura interna del producto (°F)</th>
              <th colspan="${INSP_PRODUCTO.length}">CONDICIONES DEL PRODUCTO (SI / NO)</th>
              <th rowspan="2">Observaciones y/o acciones correctivas</th>
            </tr>
            <tr>${subVeh}${subProd}</tr>
          </thead>
          <tbody>
            <tr>
              <td>${esc(i.producto)}</td>
              <td>${esc(i.fecha)}</td>
              <td>${esc(i.hora)}</td>
              <td>${esc(i.remision)}</td>
              ${celdasVeh}
              <td class="chk">${esc(i.tempProducto)}</td>
              ${celdasProd}
              <td style="text-align:left">${esc(i.observaciones)}</td>
            </tr>
          </tbody>
        </table>
        <div class="acc"><b>ACCIONES CORRECTIVAS</b>${esc(i.accionesCorrectivas)}</div>
      </div>
      <div class="firmas">
        <div>Elaboró <span class="ln">${esc(i.elaboro)}</span></div>
        <div>Nombre y firma del supervisor <span class="ln">${esc(i.supervisor)}</span></div>
        <div>Fecha <span class="ln">${esc(i.fecha)}</span></div>
      </div>
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`);
  win.document.close();
}
