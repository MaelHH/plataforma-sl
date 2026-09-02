import { esc } from "../../utils/esc";

// PDF de MANIFIESTO unificado (Fase 3): funciona para CUALQUIER manifiesto (de SAP o app-only). Junta la
// info de SAP (cliente, líneas PT/cajas) + la info MANUAL (overlay: sellos, camión, conductor, agencia…).
// Mismo mecanismo que los otros reportes: se arma HTML y se imprime (el usuario elige "Guardar como PDF").
// Ver docs/plan-manifiestos-alternativo-y-pdf.md.

const EMISOR = {
  razon: "SL AGRICOLA SA DE CV",
  domicilio: "Carret. Federal Libre Culiacán-Los Mochis, km 175.6 Margen Derecho",
  poblacion: "Adolfo Ruiz Cortinez, Gve. Sinaloa",
  cp: "81121", rfc: "SAG070818I39", tels: "01 (687) 897 27 00, 897 27 01",
};

const bl = (v) => (v == null || v === "" ? '<span class="bl"></span>' : esc(String(v)));
const nfmt = (n) => Number(n || 0).toLocaleString("es-MX");

export function generarManifiestoPDF(d) {
  const o = d?.overlay || {};
  const camion = o.camion || {}, sellos = o.sellos || {}, conductor = o.conductor || {};
  const lineas = d?.lineas || [];
  const filas = lineas.map((l) => `<tr><td>${esc(l.pt || "")}</td><td>${esc(l.descripcion || "")}</td><td>${esc(l.lote || "")}</td><td class="r">${nfmt(l.cajas)}</td></tr>`).join("");
  const fecha = d?.fecha ? esc(d.fecha) : new Date().toLocaleDateString("es-MX");
  const origenBadge = d?.origen === "sap" ? "EN SAP" : "EN LA APP (sin PT en SAP)";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Manifiesto ${esc(d?.folio || "")}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; }
    .page { padding: 12mm; }
    .bl { display: inline-block; min-width: 110px; border-bottom: 1px solid #9ca3af; height: 12px; }
    .hdr { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 8px; }
    .hdr .r { font-size: 15px; font-weight: 800; }
    .hdr .s { font-size: 9.5px; color: #374151; }
    .folio { text-align: right; font-size: 12px; font-weight: 800; }
    .folio .b { font-size: 9px; color: #6b7280; }
    .tit { text-align: center; font-size: 13px; font-weight: 800; margin: 6px 0 10px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    .kv td { border: 1px solid #9ca3af; padding: 4px 7px; font-size: 10.5px; }
    .kv td.k { background: #f3f4f6; font-weight: 700; width: 22%; }
    .prod th { background: #e5e7eb; border: 1px solid #9ca3af; padding: 5px; font-size: 9.5px; text-transform: uppercase; }
    .prod td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 10.5px; }
    .prod td.r, .prod th.r { text-align: right; }
    .sec { font-size: 11px; font-weight: 800; text-transform: uppercase; margin: 14px 0 6px; color: #065f46; }
    .obs { border: 1px solid #d1d5db; min-height: 40px; padding: 6px; font-size: 10.5px; }
    .pie { margin-top: 14px; font-size: 9px; color: #9ca3af; }
    @media print { .page { padding: 10mm; } }
    @page { size: letter; margin: 0; }
  </style></head><body><div class="page">
    <div class="hdr"><div class="r">${esc(EMISOR.razon)}</div><div class="s">${esc(EMISOR.domicilio)} · ${esc(EMISOR.poblacion)} · CP ${esc(EMISOR.cp)} · RFC ${esc(EMISOR.rfc)} · Tel ${esc(EMISOR.tels)}</div></div>
    <div class="folio">MANIFIESTO Nº ${esc(d?.folio || "—")} <span class="b">(${origenBadge})</span></div>
    <div class="tit">Manifiesto de embarque</div>

    <table class="kv"><tbody>
      <tr><td class="k">Cliente / Distribuidor</td><td>${bl(d?.cliente)}${o.distribuidor ? " · " + esc(o.distribuidor) : ""}</td><td class="k">Fecha</td><td>${fecha}</td></tr>
      <tr><td class="k">Agencia aduanal</td><td>${bl(o.agencia)}</td><td class="k">Temperatura</td><td>${bl(o.temperatura)}</td></tr>
      <tr><td class="k">Línea de transporte</td><td>${bl(camion.linea)}</td><td class="k">Flete / Anticipo</td><td>${bl(o.flete)} / ${bl(o.anticipo)}</td></tr>
      <tr><td class="k">Camión (marca/modelo)</td><td>${bl(camion.marca)} ${esc(camion.modelo || "")}</td><td class="k">Económico caja</td><td>${bl(camion.economico)}</td></tr>
      <tr><td class="k">Placas tracto / caja</td><td>${bl(camion.placasTracto)} / ${bl(camion.placasCaja)}</td><td class="k">Conductor</td><td>${bl(conductor.nombre)}</td></tr>
      <tr><td class="k">Licencia / Tel conductor</td><td>${bl(conductor.licencia)} / ${bl(conductor.tel)}</td><td class="k">Cajas total</td><td>${nfmt(d?.totalCajas)}</td></tr>
    </tbody></table>

    <div class="sec">Productos</div>
    <table class="prod"><thead><tr><th>Clave (PT)</th><th>Descripción</th><th>Lote</th><th class="r">Cajas</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="4" style="text-align:center;color:#9ca3af">Sin líneas</td></tr>'}
      <tr><td colspan="3" style="text-align:right;font-weight:800">TOTAL</td><td class="r" style="font-weight:800">${nfmt(d?.totalCajas)}</td></tr></tbody></table>

    <div class="sec">Sellos</div>
    <table class="kv"><tbody>
      <tr><td class="k">Sello origen</td><td>${bl(sellos.origen)}</td><td class="k">Sello lateral</td><td>${bl(sellos.lateral)}</td></tr>
      <tr><td class="k">Sello reemplazo</td><td>${bl(sellos.reemplazo)}</td><td class="k">Sello de cruce</td><td>${bl(sellos.cruce)}</td></tr>
      <tr><td class="k">¿Quién abrió?</td><td colspan="3">${bl(sellos.abrio)}</td></tr>
    </tbody></table>

    <div class="sec">Observaciones</div>
    <div class="obs">${esc(o.observaciones || "")}</div>

    <div class="pie">Generado por Plataforma SL · ${new Date().toLocaleString("es-MX")}</div>
  </div>
  <script>window.onload=function(){setTimeout(function(){try{window.print()}catch(e){}},200)}</script>
  </body></html>`;

  abrirImprimible(html, `Manifiesto-${(d?.folio || "manifiesto")}`.replace(/[^\w.-]+/g, "_"));
}

// Abre el HTML en una pestaña nueva vía Blob URL; si el popup está bloqueado, lo descarga como .html.
function abrirImprimible(html, nombre) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url; a.download = `${nombre}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    alert("El navegador bloqueó la ventana. Se descargó el manifiesto como .html — ábrelo en Chrome/Edge y usa Imprimir → Guardar como PDF.");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
