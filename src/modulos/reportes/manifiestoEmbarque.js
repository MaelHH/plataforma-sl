import { EMPRESAS, ORIGEN } from "../../store/datos";
import { esc } from "../../utils/esc";

// ─────────────────────────────────────────────────────────────────────────────
// Manifiesto de Embarque (formato SL Agrícola) — 5 páginas:
//   1. Carátula/manifiesto: encabezado fiscal + datos del embarque + tabla de
//      productos (CLAVE · DESCRIPCION · TAMAÑO · BULTOS · LIBRAS) con total.
//   2-3. Detalle por tarima: cuadrícula 1..30 (PRODUCTOR/PRODUCTO/CODIGO/TAMAÑO/CAJAS)
//        + resumen inferior (destinatario, total de cajas, temperatura, firma).
//   4. Hoja de sellos: datos del transporte + campos de sello en blanco (a mano).
//   5. Formato de embarques: línea de transporte, operador, camión y flete.
//
// Mismo mecanismo que los demás expedientes: se arma un HTML y se manda a imprimir
// (el usuario elige "Guardar como PDF"). No usa librerías externas.
//
// Los campos que la plataforma NO captura hoy (agencia aduanal, distribuidor,
// municipio, No. de sello, temperatura, firmas) salen como LÍNEAS EN BLANCO para
// llenar a mano, igual que en el formato original.
// ─────────────────────────────────────────────────────────────────────────────

// Datos fiscales del emisor. SL Agrícola viene del formato oficial; CAT/CACO
// reutilizan estos datos hasta que se capturen los suyos (edítalos aquí si aplica).
const EMISOR_SL = {
  razon: "SL AGRICOLA SA DE CV",
  domicilio: "Carret. Federal Libre Culiacán-Los Mochis, km 175.6 Margen Derecho",
  poblacion: "Adolfo Ruiz Cortinez, Gve. Sinaloa",
  cp: "81121",
  rfc: "SAG070818I39",
  tels: "01 (687) 897 27 00, 897 27 01",
  municipio: "Guasave Sinaloa",
};
const EMISORES = { SL_AGR: EMISOR_SL, CAT: { ...EMISOR_SL }, CACO: { ...EMISOR_SL } };

// Línea en blanco para llenar a mano (sello, firma, agencia…)
const BLANK = '<span class="bl"></span>';

// Nombre del producto sin el prefijo "PT-0001 · " (el label es "código · nombre").
const nombreProd = (cat) => {
  if (!cat) return "";
  const l = cat.label || "";
  const i = l.indexOf(" · ");
  return i >= 0 ? l.slice(i + 3) : l;
};

// Resumen de productos de UNA empresa: agrupa las parrillas por código (PT) y suma
// bultos (cajas) y libras (cajas × libras/caja del producto terminado).
function resumenProductos(carga, eid, CATALOGO) {
  const parr = carga.distEmpresas?.[eid] || [];
  const map = new Map();
  parr.forEach((p) => {
    if (!p || !p.prod) return;
    const cat = CATALOGO.find((c) => c.id === p.prod);
    const cajas = cat?.cajasPorParrilla || 0;
    const lbCaja = cat?.librasPorCaja || 0;
    if (!map.has(p.prod)) map.set(p.prod, { clave: p.prod, desc: nombreProd(cat), tamano: cat?.tamano || cat?.cultivo || "", bultos: 0, libras: 0, tieneLb: lbCaja > 0 });
    const r = map.get(p.prod);
    r.bultos += cajas;
    r.libras += cajas * lbCaja;
    if (lbCaja > 0) r.tieneLb = true;
  });
  return [...map.values()];
}

// Celdas por número de parrilla (1..30) para una empresa (solo sus parrillas).
function parrillasPorNumero(carga, eid, CATALOGO) {
  const parr = carga.distEmpresas?.[eid] || [];
  const out = [];
  for (let n = 1; n <= 30; n++) {
    const idx = n % 2 === 1 ? (n - 1) / 2 : 15 + (n - 2) / 2; // inverso de idxToParr
    const p = parr[idx];
    const cat = p && p.prod ? CATALOGO.find((c) => c.id === p.prod) : null;
    out.push({ n, prod: p?.prod || "", cat });
  }
  return out;
}

const num = (v) => (v || 0).toLocaleString("es-MX");
const num2 = (v) => (v || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function generarManifiestoEmbarque(carga, eid, catalogoArr) {
  if (!carga) { alert("No hay datos de embarque."); return; }
  const CATALOGO = Array.isArray(catalogoArr) ? catalogoArr : [];
  const t = carga.trailer || {};
  const emp = EMPRESAS.find((e) => e.id === eid) || { label: eid };
  const em = EMISORES[eid] || EMISOR_SL;
  const folio = carga.manifiestos?.[eid] || "";
  const fecha = t.fecha || carga.fecha || "";

  const productos = resumenProductos(carga, eid, CATALOGO);
  const totalBultos = productos.reduce((a, r) => a + r.bultos, 0);
  const totalLibras = productos.reduce((a, r) => a + r.libras, 0);
  const hayLibras = productos.some((r) => r.tieneLb);
  const celdas = parrillasPorNumero(carga, eid, CATALOGO);
  const parrillasUsadas = celdas.filter((c) => c.prod).length;

  // Fila de dato con etiqueta chica arriba y valor abajo (dos columnas).
  const campo = (label, valor) => `<div class="f"><label>${esc(label)}</label><div class="v">${valor === 0 || valor ? esc(valor) : "—"}</div></div>`;

  // ── PÁGINA 1 — Manifiesto ──
  const filasProd = productos.length
    ? productos.map((r) => `<tr>
        <td>${esc(r.clave)}</td>
        <td>${esc(r.desc) || "—"}</td>
        <td>${esc(r.tamano) || ""}</td>
        <td class="r">${num(r.bultos)}</td>
        <td class="r">${r.tieneLb ? num2(r.libras) : ""}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="c muted">Sin productos asignados a esta empresa</td></tr>`;

  const pagina1 = `
    <section class="page">
      <div class="hd">
        <div class="logo"><b>SL</b><small>agrícola</small></div>
        <div class="hd-txt">
          <div class="razon">${esc(em.razon)}</div>
          <div>${esc(em.domicilio)}</div>
          <div>${esc(em.poblacion)} C.P. ${esc(em.cp)}</div>
          <div>RFC: ${esc(em.rfc)}</div>
          <div>TELS: ${esc(em.tels)}</div>
        </div>
      </div>

      <div class="mrow">
        <div><label>MANIFIESTO</label><div class="folio">${esc(folio) || "—"}</div></div>
        <div class="ar"><label>FECHA</label><div class="v">${esc(fecha) || "—"}</div></div>
      </div>

      <div class="grid2">
        ${campo("NOMBRE", emp.label)}
        ${campo("DESTINO", t.dest)}
        ${campo("DOMICILIO", em.domicilio)}
        <div class="f"><label>DISTRIBUIDOR</label><div class="v">${BLANK}</div></div>
        ${campo("POBLACION", em.poblacion)}
        <div class="f"><label>AGENCIA ADUANAL</label><div class="v">${BLANK}</div></div>
        ${campo("RFC", em.rfc)}
        <div class="f trio"><div><label>MARCA</label><div class="v">${esc(t.marcaModelo) || "—"}</div></div><div><label>PLACA CAMIÓN</label><div class="v">${esc(t.placaTracto) || "—"}</div></div></div>
        <div class="f"><label>MUNICIPIO PRODUCTOR</label><div class="v">${esc(em.municipio) || BLANK}</div></div>
        <div class="f trio"><div><label>PLACA CAJA</label><div class="v">${esc(t.placaCaja) || "—"}</div></div><div><label>No. DE CAJA</label><div class="v">${esc(t.economicoCaja) || "—"}</div></div></div>
        ${campo("TRANSPORTISTA", t.linea)}
        ${campo("CONDUCTOR", t.chofer)}
      </div>

      <table class="prod">
        <thead><tr><th>CLAVE</th><th>DESCRIPCION</th><th>TAMAÑO</th><th class="r">BULTOS</th><th class="r">LIBRAS</th></tr></thead>
        <tbody>${filasProd}</tbody>
        <tfoot><tr><td colspan="3" class="r b">TOTAL</td><td class="r b">${num(totalBultos)}</td><td class="r b">${hayLibras ? num2(totalLibras) + " lb" : ""}</td></tr></tfoot>
      </table>
    </section>`;

  // ── PÁGINAS 2-3 — Detalle por tarima ──
  const celdaTarima = (c) => {
    if (!c.prod) return `<div class="tar vacia"><div class="tn">${c.n}</div><div class="mix">—</div></div>`;
    return `<div class="tar">
      <div class="tn">${c.n}</div>
      <div class="tl"><span>PRODUCTOR</span><b>${esc(emp.label)}</b></div>
      <div class="tl"><span>PRODUCTO</span><b>${esc(nombreProd(c.cat)) || "—"}</b></div>
      <div class="tl"><span>CODIGO</span><b>${esc(c.prod)}</b></div>
      <div class="tl"><span>TAMAÑO</span><b>${esc(c.cat?.tamano || c.cat?.cultivo || "")}</b></div>
      <div class="tl"><span>CAJAS</span><b>${num(c.cat?.cajasPorParrilla || 0)}</b></div>
    </div>`;
  };
  const paginaTarimas = `
    <section class="page">
      <div class="hd-mini">
        <div class="logo sm"><b>SL</b></div>
        <div><b>${esc(em.razon)}</b><br/>${esc(em.domicilio)}<br/>${esc(em.poblacion)} C.P. ${esc(em.cp)} · RFC: ${esc(em.rfc)}</div>
        <div class="ar"><b>${esc(emp.label)}</b><br/>Manifiesto ${esc(folio) || "—"}</div>
      </div>
      <div class="tar-grid">
        ${celdas.map(celdaTarima).join("")}
      </div>
      <table class="resumen">
        <tr><td><label>MANIFIESTO</label><b>${esc(folio) || "—"}</b></td><td><label>OPERADOR</label><b>${esc(t.chofer) || "—"}</b></td></tr>
        <tr><td><label>DESTINATARIO</label><b>${BLANK}</b></td><td><label>TELEFONO</label><b>${esc(t.telefono) || "—"}</b></td></tr>
        <tr><td><label>DESTINO</label><b>${esc(t.dest) || "—"}</b></td><td><label>CAJA</label><b>${esc(t.economicoCaja) || "—"}</b></td></tr>
        <tr><td><label>A. ADUANAL</label><b>${BLANK}</b></td><td><label>TEMPERATURA</label><b>${BLANK} °F</b></td></tr>
        <tr><td><label>TOTAL DE CAJAS</label><b>${num(totalBultos)}</b></td><td><label>FIRMA</label><b>${BLANK}</b></td></tr>
      </table>
    </section>`;

  // ── PÁGINA 4 — Sellos ──
  const bloqueSello = (titulo) => `
    <div class="sello">
      <div class="sl"><span>${titulo || "No. de Sello:"}</span>${titulo ? "" : BLANK}</div>
      <div class="sl"><span>Sello Abierto por:</span>${BLANK}</div>
      <div class="sl"><span>Agencia:</span>${BLANK}</div>
      <div class="sl"><span>Firma:</span>${BLANK}</div>
      <div class="sl"><span>Fecha/Hora:</span>${BLANK}</div>
    </div>`;
  const pagina4 = `
    <section class="page">
      <div class="hd-mini">
        <div class="logo sm"><b>SL</b></div>
        <div><b>${esc(em.razon)}</b><br/>${esc(em.domicilio)}<br/>${esc(em.poblacion)} C.P. ${esc(em.cp)} · RFC: ${esc(em.rfc)}</div>
        <div class="ar"><label>FECHA</label><b>${esc(fecha) || "—"}</b></div>
      </div>
      <div class="grid2 chico" style="margin-top:14px">
        ${campo("No. de Factura/manifiesto", folio)}
        ${campo("Nombre del Chofer", t.chofer)}
        ${campo("Transporte", t.marcaModelo)}
        ${campo("Placas Camión", t.placaTracto)}
        ${campo("Placas Contenedor", t.placaCaja)}
        <div class="f"></div>
      </div>
      <div class="sellos">
        ${bloqueSello()} ${bloqueSello()}
        ${bloqueSello()} ${bloqueSello("SELLO CRUCE")}
        ${bloqueSello()} ${bloqueSello()}
      </div>
    </section>`;

  // ── PÁGINA 5 — Formato de embarques (flete) ──
  const rowKV = (k, v) => `<tr><th>${esc(k)}</th><td>${v === 0 || v ? esc(v) : ""}</td></tr>`;
  const pagina5 = `
    <section class="page">
      <div class="hd">
        <div class="logo"><b>SL</b><small>agrícola</small></div>
        <div class="hd-txt"><div class="razon">${esc(em.razon)}</div><div class="b">FORMATO DE EMBARQUES</div></div>
        <div class="ar"><label>FECHA</label><div class="v">${esc(fecha) || "—"}</div></div>
      </div>

      <table class="kv"><tr><th class="tit" colspan="2">DATOS DE LA LINEA DE TRANSPORTE</th></tr>
        ${rowKV("LINEA DE TRANSPORTE", t.linea)}
        ${rowKV("TELEFONO P. DE TRAFICO", t.contacto || t.numero)}
      </table>
      <table class="kv"><tr><th class="tit" colspan="2">DATOS PERSONALES</th></tr>
        ${rowKV("OPERADOR", t.chofer)}
        ${rowKV("LICENCIA", t.licencia)}
        ${rowKV("CELULAR", t.telefono)}
      </table>
      <table class="kv"><tr><th class="tit" colspan="2">DATOS DEL CAMION</th></tr>
        ${rowKV("MARCA DEL CAMION", t.marcaModelo)}
        ${rowKV("PLACAS DEL CAMION", t.placaTracto)}
        ${rowKV("NUMERO DE CAJA", t.economicoCaja)}
        ${rowKV("PLACAS DE LA CAJA", t.placaCaja)}
      </table>
      <table class="kv"><tr><th class="tit">DATOS DE LA CARGA</th><td class="flete">FLETE $ ${t.flete ? num2(parseFloat(t.flete)) : ""}</td></tr></table>

      <table class="emb">
        <thead><tr><th>AGRICOLA</th><th>MANF</th><th>DESTINO</th><th class="r">BULTOS</th><th class="r">P. EMBARQUE</th><th class="r">P. EN TRAILER</th><th class="r">FLETE</th></tr></thead>
        <tbody>
          <tr><td>${esc(emp.label)}</td><td>${esc(folio) || "—"}</td><td>${esc(t.dest) || "—"}</td><td class="r">${num(totalBultos)}</td><td class="r">${parrillasUsadas}</td><td class="r">${parrillasUsadas}</td><td class="r">$ ${t.flete ? num2(parseFloat(t.flete)) : "—"}</td></tr>
        </tbody>
        <tfoot><tr><td colspan="4"></td><td class="r b">TOTAL</td><td class="r b">${parrillasUsadas}</td><td class="r b">$ ${t.flete ? num2(parseFloat(t.flete)) : "—"}</td></tr></tfoot>
      </table>
      <div class="pie">Origen: ${esc(t.origen || ORIGEN)} · Generado desde Plataforma SL</div>
    </section>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
    <title>Manifiesto ${esc(folio) || esc(emp.label)} — ${esc(t.dest) || ""}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; font-size: 11px; }
      .page { padding: 16mm 14mm; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      /* Encabezado */
      .hd { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #16a34a; padding-bottom: 10px; }
      .hd-txt { flex: 1; text-align: center; line-height: 1.45; }
      .hd-txt .razon { font-weight: 800; font-size: 14px; }
      .hd-txt .b { font-weight: 700; margin-top: 2px; }
      .logo { width: 78px; height: 60px; border-radius: 8px; background: #15803d; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
      .logo b { font-size: 30px; font-weight: 900; font-style: italic; letter-spacing: -1px; }
      .logo small { font-size: 11px; letter-spacing: 1px; }
      .logo.sm { width: 46px; height: 36px; } .logo.sm b { font-size: 18px; }
      .hd-mini { display: flex; align-items: center; gap: 12px; font-size: 10px; line-height: 1.4; border-bottom: 1px solid #d1d5db; padding-bottom: 8px; }
      .hd-mini > div:nth-child(2) { flex: 1; }
      .ar { text-align: right; }
      /* Manifiesto nº */
      .mrow { display: flex; justify-content: space-between; align-items: flex-end; margin: 18px 0 10px; }
      .mrow label, .grid2 label, .f label, .resumen label, .kv .tit, .ar label { font-size: 8.5px; color: #6b7280; text-transform: uppercase; letter-spacing: .4px; font-weight: 700; }
      .folio { font-size: 26px; font-weight: 800; color: #15803d; }
      .v { font-weight: 700; }
      /* Grid de datos */
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; margin-top: 6px; }
      .grid2.chico { gap: 6px 22px; }
      .f { border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
      .f label { display: block; }
      .f .v { min-height: 14px; }
      .f.trio { display: flex; gap: 16px; } .f.trio > div { flex: 1; }
      .bl { display: inline-block; min-width: 130px; border-bottom: 1px solid #9ca3af; height: 12px; }
      /* Tabla de productos */
      table.prod { width: 100%; border-collapse: collapse; margin-top: 20px; }
      table.prod th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 9px; color: #374151; text-transform: uppercase; border: 1px solid #d1d5db; }
      table.prod td { padding: 5px 8px; border: 1px solid #e5e7eb; }
      table.prod tfoot td { border-top: 2px solid #9ca3af; }
      .r { text-align: right; } .c { text-align: center; } .b { font-weight: 800; } .muted { color: #9ca3af; font-style: italic; }
      /* Tarimas */
      .tar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 12px; }
      .tar { border: 1px solid #9ca3af; border-radius: 4px; padding: 5px 7px; position: relative; min-height: 78px; }
      .tar .tn { position: absolute; top: 3px; right: 6px; font-size: 12px; font-weight: 800; color: #9ca3af; }
      .tar.vacia { display: flex; align-items: center; justify-content: center; color: #d1d5db; }
      .tl { display: flex; gap: 8px; font-size: 9.5px; padding: 1px 0; }
      .tl span { width: 62px; color: #6b7280; text-transform: uppercase; font-size: 8px; padding-top: 1px; }
      .tl b { flex: 1; }
      .mix { font-weight: 800; }
      /* Resumen inferior */
      table.resumen { width: 100%; border-collapse: collapse; margin-top: 14px; border: 1px solid #9ca3af; }
      table.resumen td { border: 1px solid #d1d5db; padding: 5px 8px; width: 50%; }
      table.resumen label { display: inline-block; width: 110px; }
      table.resumen b { font-weight: 700; }
      /* Sellos */
      .sellos { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 30px; margin-top: 20px; }
      .sello .sl { display: flex; align-items: flex-end; gap: 8px; padding: 6px 0; font-size: 11px; }
      .sello .sl span { min-width: 110px; color: #111827; }
      .sello .sl:first-child span { font-weight: 700; }
      /* Formato embarques */
      table.kv { width: 100%; border-collapse: collapse; margin-top: 10px; }
      table.kv th, table.kv td { border: 1px solid #9ca3af; padding: 5px 8px; text-align: left; font-size: 10.5px; }
      table.kv th { background: #f3f4f6; width: 42%; font-weight: 700; }
      table.kv .tit { background: #e5e7eb; text-align: center; text-transform: uppercase; }
      table.kv .flete { text-align: right; font-weight: 800; }
      table.emb { width: 100%; border-collapse: collapse; margin-top: 16px; }
      table.emb th { background: #f3f4f6; border: 1px solid #9ca3af; padding: 6px 6px; font-size: 8.5px; text-transform: uppercase; }
      table.emb td { border: 1px solid #d1d5db; padding: 6px; }
      .pie { margin-top: 14px; font-size: 9px; color: #9ca3af; }
      @media print { .page { padding: 12mm; } }
      @page { size: letter; margin: 0; }
    </style></head><body>
    ${pagina1}
    ${paginaTarimas}
    ${pagina4}
    ${pagina5}
    <script>window.onload = function(){ setTimeout(function(){ try { window.print(); } catch(e){} }, 200); }</script>
    </body></html>`;

  abrirImprimible(html, `Manifiesto-${(folio || emp.label || "embarque")}`.replace(/[^\w.-]+/g, "_"));
}

// Abre el HTML en una pestaña nueva vía Blob URL (se renderiza mejor que document.write
// en navegadores/webviews restringidos). Si el popup está bloqueado, lo descarga como .html
// para que se abra en un navegador real (ahí se imprime → "Guardar como PDF").
function abrirImprimible(html, nombre) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nombre}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    alert("El navegador bloqueó la ventana. Se descargó el manifiesto como archivo .html — ábrelo en Chrome/Edge y usa Imprimir → Guardar como PDF.");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
