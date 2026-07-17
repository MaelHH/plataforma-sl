// Exportador de "Control de Fletes de Acarreo" a Excel PROFESIONAL (ExcelJS).
// A diferencia de `xlsx` (community, sin estilos), aquí sí hay colores, formato de
// moneda, encabezado corporativo, KPIs resaltados (subtotal/IVA/total/por pagar/pagado),
// filas cebra, bordes, fila de TOTALES, autofiltro y encabezado congelado.
//
// Pensado para nómina: se lee de un vistazo qué está pagado, qué falta y los montos.
//
// ExcelJS se carga DINÁMICAMENTE (solo al exportar) para no engordar el bundle inicial.

// Paleta corporativa (ARGB: "FF" + hex).
const C = {
  slate900: "FF0F172A", slate800: "FF1E293B", slate600: "FF475569", slate500: "FF64748B",
  slate100: "FFF1F5F9", slate50: "FFF8FAFC", border: "FFE2E8F0", white: "FFFFFFFF",
  blueBg: "FFEFF6FF", blueTx: "FF1D4ED8",
  amberBg: "FFFFFBEB", amberTx: "FFB45309",
  emerBg: "FFECFDF5", emerTx: "FF047857",
};
const MONEY = '"$"#,##0.00';
const thin = { style: "thin", color: { argb: C.border } };
const bordersAll = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

const ESTADO_LAB = { pagada: "Pagada", facturada: "Falta pago", entrada: "Con entrada", creada: "Creada" };
const ESTADO_TX = { pagada: C.emerTx, facturada: C.amberTx, entrada: C.blueTx, creada: C.slate500 };

const num = (v) => Number(v) || 0;

/**
 * Genera y descarga el Excel de fletes.
 * @param {{fletes: Array, totales: object}} data  respuesta de getFletesSAP
 * @param {{tipo: string, project: string}} opts
 */
export async function exportarFletesExcel(data, { tipo, project, folios = {} }) {
  const fletes = data?.fletes || [];
  if (!fletes.length) return;
  const titulo = tipo === "material" ? "Material" : "Fruta";
  const t = data.totales || {};

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma SL";
  const ws = wb.addWorksheet(`Fletes ${titulo}`, {
    views: [{ state: "frozen", ySplit: 7 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });

  ws.columns = [
    { width: 11 }, { width: 36 }, { width: 12 }, { width: 15 },
    { width: 13 }, { width: 16 }, { width: 13 }, { width: 12 }, { width: 14 },
  ];

  // ── Título + subtítulo ──────────────────────────────────────────────
  ws.mergeCells("A1:I1");
  const tit = ws.getCell("A1");
  tit.value = `Control de Fletes de Acarreo · ${titulo}`;
  tit.font = { bold: true, size: 15, color: { argb: C.slate900 } };
  tit.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:I2");
  ws.getCell("A2").value = `Proyecto: ${project || "—"}    ·    ${fletes.length} orden(es) de compra`;
  ws.getCell("A2").font = { size: 10, color: { argb: C.slate500 } };

  // ── KPIs (fila 4 etiquetas, fila 5 valores resaltados) ───────────────
  const kpis = [
    { lab: "SUBTOTAL (S/IVA)", val: t.subtotal, bg: null, tx: C.slate900 },
    { lab: "IVA", val: t.iva, bg: null, tx: C.slate900 },
    { lab: "TOTAL (C/IVA)", val: t.total, bg: C.blueBg, tx: C.blueTx },
    { lab: "POR PAGAR", val: t.porPagar, bg: C.amberBg, tx: C.amberTx },
    { lab: "PAGADO", val: t.pagado, bg: C.emerBg, tx: C.emerTx },
  ];
  kpis.forEach((k, i) => {
    const col = i + 1;
    const lab = ws.getCell(4, col);
    lab.value = k.lab;
    lab.font = { size: 8, bold: true, color: { argb: C.slate500 } };
    const val = ws.getCell(5, col);
    val.value = num(k.val);
    val.numFmt = MONEY;
    val.font = { bold: true, size: 12, color: { argb: k.tx } };
    val.alignment = { horizontal: "left", vertical: "middle" };
    val.border = bordersAll;
    if (k.bg) val.fill = fill(k.bg);
  });
  ws.getRow(5).height = 22;

  // ── Encabezado de la tabla (fila 7) ──────────────────────────────────
  const HR = 7;
  const headers = ["Pedido", "Proveedor", "Fecha", "Precio (s/IVA)", "IVA", "Total (c/IVA)", "Estado", "Factura", "Folio"];
  const derecha = new Set([3, 4, 5]); // columnas de dinero (0-based)
  const headRow = ws.getRow(HR);
  headers.forEach((h, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: C.white } };
    cell.fill = fill(C.slate800);
    cell.alignment = { horizontal: derecha.has(i) ? "right" : (i === 0 || i === 7 ? "center" : "left"), vertical: "middle" };
    cell.border = bordersAll;
  });
  headRow.height = 20;

  // ── Filas de datos ───────────────────────────────────────────────────
  fletes.forEach((f, idx) => {
    const r = ws.getRow(HR + 1 + idx);
    const zebra = idx % 2 === 1;
    const celdas = [
      f.docNum, f.proveedor, f.fecha,
      num(f.subtotal), num(f.iva), num(f.total),
      ESTADO_LAB[f.estado] || f.estado, f.factura ? num(f.factura) : "",
      folios[f.docEntry] || "",
    ];
    celdas.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.border = bordersAll;
      cell.font = { size: 10, color: { argb: C.slate600 } };
      if (zebra) cell.fill = fill(C.slate50);
      if (derecha.has(i)) { cell.numFmt = MONEY; cell.alignment = { horizontal: "right" }; }
      else if (i === 0 || i === 7) cell.alignment = { horizontal: "center" };
      else cell.alignment = { horizontal: "left" };
    });
    // Pedido en negrita oscuro.
    r.getCell(1).font = { size: 10, bold: true, color: { argb: C.slate900 } };
    // Estado coloreado por su valor.
    const est = r.getCell(7);
    est.font = { size: 10, bold: true, color: { argb: ESTADO_TX[f.estado] || C.slate500 } };
    est.alignment = { horizontal: "center" };
  });

  // ── Fila de TOTALES ──────────────────────────────────────────────────
  const TR = HR + 1 + fletes.length;
  const totRow = ws.getRow(TR);
  for (let i = 1; i <= 9; i++) {
    const cell = totRow.getCell(i);
    cell.fill = fill(C.slate100);
    cell.border = { top: { style: "medium", color: { argb: C.slate800 } }, bottom: thin, left: thin, right: thin };
  }
  totRow.getCell(2).value = "TOTALES";
  totRow.getCell(2).font = { bold: true, size: 10, color: { argb: C.slate900 } };
  totRow.getCell(2).alignment = { horizontal: "right" };
  [[4, t.subtotal], [5, t.iva], [6, t.total]].forEach(([col, val]) => {
    const cell = totRow.getCell(col);
    cell.value = num(val);
    cell.numFmt = MONEY;
    cell.font = { bold: true, size: 10, color: { argb: C.slate900 } };
    cell.alignment = { horizontal: "right" };
  });

  // Autofiltro sobre el encabezado.
  ws.autoFilter = { from: { row: HR, column: 1 }, to: { row: HR, column: 9 } };

  // ── Descargar ────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fletes-${tipo}-${(project || "proyecto").replace(/[^\w-]/g, "_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
