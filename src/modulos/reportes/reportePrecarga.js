import { PRECARGA_PREGUNTAS, ALERGENOS_MX } from "../../store/datos";
import { esc } from "../../utils/esc";

const escI = esc;

// ── Reporte PDF: Revisión precarga de transporte refrigerado (REG-EMP-15)
//    + manifiesto de alérgenos (2 páginas) ──
export function generarPrecargaPDF(inspForm) {
  const f = inspForm;
  const win = window.open("", "_blank");
  if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }

  const filasCheck = PRECARGA_PREGUNTAS.map((p) => {
    const r = f.respuestas?.[p.id] || "";
    const hallazgo = r && r === p.malo;
    return `<tr>
        <td style="text-align:center">${p.num}</td>
        <td>${escI(p.label)}</td>
        <td style="text-align:center;font-weight:700;color:${hallazgo ? "#dc2626" : "#16a34a"}">${r ? r.toUpperCase() : "—"}</td>
      </tr>`;
  }).join("");

  const filasAlerg = ALERGENOS_MX.map((a) =>
    `<tr><td>${escI(a)}</td><td style="text-align:center">${escI(f.alergenos?.[a] || "No")}</td></tr>`).join("");

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
      <title>Inspección precarga - ${escI(f.companiaTransporte) || ""}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Arial, sans-serif; color: #1f2937; margin: 24px; font-size: 12px; }
        .doc { page-break-after: always; }
        .doc:last-child { page-break-after: auto; }
        .head { display: flex; justify-content: space-between; align-items: center; border: 1px solid #9ca3af; }
        .head .logo { width: 90px; text-align: center; font-weight: 800; color: #ea580c; padding: 6px; }
        .head .cat { color: #166534; }
        .head .tit { text-align: center; flex: 1; }
        .head .tit h1 { font-size: 15px; margin: 0; color: #374151; }
        .head .tit .st { font-size: 11px; color: #6b7280; }
        .codes { display: flex; border: 1px solid #9ca3af; border-top: none; font-size: 10px; color: #6b7280; }
        .codes div { flex: 1; padding: 3px 6px; border-right: 1px solid #d1d5db; }
        .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 16px; margin: 14px 0; }
        .meta div { border-bottom: 1px solid #e5e7eb; padding: 3px 0; }
        .meta label { color: #9ca3af; font-size: 10px; text-transform: uppercase; }
        .meta b { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #f3f4f6; text-align: left; padding: 5px 8px; font-size: 10px; color: #6b7280; text-transform: uppercase; border: 1px solid #e5e7eb; }
        td { padding: 4px 8px; border: 1px solid #e5e7eb; }
        h2 { font-size: 13px; margin: 16px 0 4px; color: #0e7490; }
        .note { font-size: 11px; color: #6b7280; margin: 4px 0; }
        .firmas { display: flex; justify-content: space-between; margin-top: 40px; gap: 40px; }
        .firmas div { flex: 1; border-top: 1px solid #374151; padding-top: 4px; text-align: center; font-size: 11px; }
        .prev { font-size: 11px; }
        .prev li { margin-bottom: 2px; }
        @media print { body { margin: 12mm; } }
      </style></head><body>

      <div class="doc">
        <div class="head">
          <div class="logo">SL<br/><span style="font-size:9px">agrícola</span></div>
          <div class="tit"><h1>SL AGRÍCOLA SA DE CV</h1><div class="st">REVISIÓN PRECARGA DE TRANSPORTE REFRIGERADO</div></div>
          <div class="logo cat">CAT<br/><span style="font-size:9px">SA DE CV</span></div>
        </div>
        <div class="codes"><div>REG-EMP-15</div><div>ELABORACIÓN: 20 OCT 2020</div><div>REVISIÓN: 10 OCT 2025</div><div>POE-MP-09</div></div>
        <p class="note">Este formato debe ser llenado para cada camión que sale de esta empresa.</p>
        <div class="meta">
          <div><label>Manifiesto</label> <b>${escI(f.manifiesto) || "—"}</b></div>
          <div><label>Fecha</label> <b>${escI(f.fecha) || "—"}</b></div>
          <div><label>Compañía de transporte</label> <b>${escI(f.companiaTransporte) || "—"}</b></div>
          <div><label>Nombre del chofer</label> <b>${escI(f.nombreChofer) || "—"}</b></div>
          <div><label>Placas del termo</label> <b>${escI(f.placasTermo) || "—"}</b></div>
          <div><label>No. Económico</label> <b>${escI(f.noEconomico) || "—"}</b></div>
          <div><label>Hora y temp. de llegada al empaque</label> <b>${escI(f.horaLlegada) || "—"} / ${escI(f.tempLlegada) || "—"} °F</b></div>
          <div><label>Hora y temp. en que se abrió la puerta</label> <b>${escI(f.horaAbrioPuerta) || "—"} / ${escI(f.tempAbrioPuerta) || "—"} °F</b></div>
          <div><label>Destino</label> <b>${escI(f.destino) || "—"}</b></div>
        </div>
        <p class="note">Marque cualquier área con problemas que encuentre y repórtelo al supervisor ANTES de cargar.</p>
        <table>
          <thead><tr><th style="width:30px;text-align:center">#</th><th>Punto a revisar</th><th style="width:90px;text-align:center">Respuesta</th></tr></thead>
          <tbody>${filasCheck}</tbody>
        </table>
        <div class="meta" style="margin-top:12px">
          <div><label>12. Temp. del producto</label> <b>${escI(f.tempProducto) || "—"} °F</b></div>
          <div><label>12. Temp. del termo al cargar</label> <b>${escI(f.tempTermoCargar) || "—"} °F</b></div>
          <div><label>13. ¿Se sanitizó la caja?</label> <b>${escI(f.sanitizoCaja) || "—"}</b></div>
          <div><label>13. Sanitizante · concentración</label> <b>${escI(f.sanitizante) || "—"} · ${escI(f.concentracion) || "—"}</b></div>
        </div>
        <div class="firmas">
          <div>${escI(f.aprobadoPor) || ""}<br/>Aprobado para cargar por</div>
          <div>${escI(f.nombreChofer) || ""}<br/>Firma del operador</div>
        </div>
      </div>

      <div class="doc">
        <div class="head">
          <div class="logo">SL<br/><span style="font-size:9px">agrícola</span></div>
          <div class="tit"><h1>SL AGRÍCOLA SA DE CV</h1><div class="st">MANIFIESTO DE ALÉRGENOS — CAPACITACIÓN AL OPERADOR</div></div>
          <div class="logo cat">CAT<br/><span style="font-size:9px">SA DE CV</span></div>
        </div>
        <div class="meta">
          <div><label>Manifiesto</label> <b>${escI(f.manifiesto) || "—"}</b></div>
          <div><label>Fecha</label> <b>${escI(f.fecha) || "—"}</b></div>
          <div><label>Compañía de transporte</label> <b>${escI(f.companiaTransporte) || "—"}</b></div>
          <div><label>Nombre del operador</label> <b>${escI(f.nombreChofer) || "—"}</b></div>
          <div><label>Placas del termo</label> <b>${escI(f.placasTermo) || "—"}</b></div>
          <div><label>No. Económico</label> <b>${escI(f.noEconomico) || "—"}</b></div>
          <div><label>Destino</label> <b>${escI(f.destino) || "—"}</b></div>
        </div>
        <div class="meta" style="grid-template-columns:1fr">
          <div><label>1. ¿Cuáles han sido sus cargas anteriores?</label> <b>${escI(f.cargasAnteriores) || "—"}</b></div>
          <div><label>2. ¿Tiene conocimiento sobre alérgenos?</label> <b>${f.conoceAlergenos ? f.conoceAlergenos.toUpperCase() : "—"}</b></div>
        </div>
        <table style="width:60%">
          <thead><tr><th>Principales alérgenos en México</th><th style="width:120px;text-align:center">¿Dentro de las operaciones?</th></tr></thead>
          <tbody>${filasAlerg}</tbody>
        </table>
        <h2>3. Consecuencias</h2>
        <p class="prev">Después de ingerir un alérgeno alimentario una persona con alergia puede experimentar una reacción alérgica de riesgo vital grave, llamada anafilaxis, además de urticaria, hormigueo y comezón, inflamaciones, vómitos, diarrea, dificultades para respirar.</p>
        <h2>4. Medidas preventivas</h2>
        <p class="prev">SL AGRÍCOLA desarrolló un plan de capacitaciones preventivas, entre ellas esta información a los operadores de las cajas refrigeradas:</p>
        <ul class="prev">
          <li>No abrir la caja.</li>
          <li>No introducir alimentos considerados como alérgenos ni productos diferentes a la carga (aceites, detergentes, sustancias químicas en general, etc.).</li>
          <li>Reportar cualquier anomalía en el trayecto.</li>
        </ul>
        <div class="firmas">
          <div>${escI(f.aprobadoPor) || ""}<br/>Aprobado para cargar por</div>
          <div>${escI(f.nombreChofer) || ""}<br/>Firma del operador</div>
        </div>
      </div>

      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`);
  win.document.close();
}
