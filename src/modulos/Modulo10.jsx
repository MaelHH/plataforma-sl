import { useState } from "react";
import SearchSelect from "../components/SearchSelect";
import ColaTabs from "../components/ColaTabs";
import {
  useDatos, ahora,
  IMPORT_ESTADOS, DIAS_ALERTA_SALIDA,
  fechaLimiteSalida, diasRestantesSalida, estadoVencimiento,
} from "../store/datos";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function nuevoId(pref) {
  try {
    return crypto.randomUUID();
  } catch {
    return (pref || "id_") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}

// Renglón vacío de artículo (los datos del material se copian del catálogo al elegirlo)
const itemVacio = () => ({
  id: nuevoId("it_"), materialId: "", codigo: "", descripcion: "",
  unidad: "", fraccion: "", cantidad: "", valorUnitario: "", diasSalida: "",
});

// Importación vacía
const importacionVacia = () => ({
  id: nuevoId("imp_"),
  folio: "", proveedor: "", paisOrigen: "", factura: "", moneda: "USD", tipoCambio: "",
  fechaImportacion: hoyISO(),
  pedimento: "", aduana: "", agenteAduanal: "", patente: "",
  transportista: "", chofer: "", placas: "",
  estado: "borrador", observaciones: "",
  items: [itemVacio()],
});

// Total de un renglón (cantidad × valor unitario)
const totalItem = (it) => (parseFloat(it.cantidad) || 0) * (parseFloat(it.valorUnitario) || 0);
// Valor total de la importación
const totalImportacion = (imp) => (imp.items || []).reduce((a, it) => a + totalItem(it), 0);

// Para un renglón, calcula límite, días restantes y estado de vencimiento
const vencimientoItem = (imp, it) => {
  const limite = fechaLimiteSalida(imp.fechaImportacion, it.diasSalida);
  const dr = diasRestantesSalida(limite);
  return { limite, dr, est: estadoVencimiento(dr) };
};

// El límite más próximo de toda la importación (el renglón más urgente)
const vencimientoImportacion = (imp) => {
  const vencs = (imp.items || [])
    .map((it) => vencimientoItem(imp, it))
    .filter((v) => v.dr != null);
  if (!vencs.length) return null;
  return vencs.reduce((min, v) => (v.dr < min.dr ? v : min));
};

const fmtMoneda = (n, moneda) =>
  (n || 0).toLocaleString("es-MX", { style: "currency", currency: moneda || "USD" });

const fmtFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

// Badge de días restantes según urgencia
const BADGE_VENC = {
  vencido: "bg-red-100 text-red-700 border-red-200",
  por_vencer: "bg-amber-100 text-amber-700 border-amber-200",
  vigente: "bg-green-100 text-green-700 border-green-200",
};
const txtDias = (dr) => (dr == null ? "—" : dr < 0 ? `Vencido hace ${Math.abs(dr)} d` : `${dr} días`);

const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
const LBL = "text-xs text-gray-500 block mb-0.5";

export default function Modulo10() {
  const { importaciones, setImportaciones, materiales, setMateriales } = useDatos();

  const [edit, setEdit] = useState(null); // importación en edición (objeto) o null
  const [verCatalogo, setVerCatalogo] = useState(false);

  // ── Edición de importación ──
  const nueva = () => setEdit(importacionVacia());
  const abrir = (imp) => setEdit(JSON.parse(JSON.stringify(imp))); // copia editable
  const cerrar = () => setEdit(null);

  const upd = (campo, val) => setEdit((e) => ({ ...e, [campo]: val }));

  const updItem = (itId, campo, val) =>
    setEdit((e) => ({ ...e, items: e.items.map((it) => (it.id === itId ? { ...it, [campo]: val } : it)) }));

  // Al elegir un material del catálogo, copiamos sus datos al renglón
  const elegirMaterial = (itId, materialId) => {
    const mat = materiales.find((m) => m.id === materialId);
    setEdit((e) => ({
      ...e,
      items: e.items.map((it) =>
        it.id === itId
          ? {
              ...it, materialId,
              codigo: mat?.codigo || "", descripcion: mat?.descripcion || "",
              unidad: mat?.unidad || "", fraccion: mat?.fraccion || "",
              diasSalida: mat ? String(mat.diasSalida ?? "") : it.diasSalida,
            }
          : it
      ),
    }));
  };

  const agregarItem = () => setEdit((e) => ({ ...e, items: [...e.items, itemVacio()] }));
  const quitarItem = (itId) =>
    setEdit((e) => ({ ...e, items: e.items.length > 1 ? e.items.filter((it) => it.id !== itId) : e.items }));

  const guardar = () => {
    const limpio = { ...edit };
    if (!importaciones.some((i) => i.id === limpio.id)) {
      limpio.creado = ahora();
    }
    limpio.actualizado = ahora();
    setImportaciones((prev) => {
      const existe = prev.some((i) => i.id === limpio.id);
      return existe ? prev.map((i) => (i.id === limpio.id ? limpio : i)) : [limpio, ...prev];
    });
    cerrar();
  };

  const eliminar = (id) => {
    if (!window.confirm("¿Eliminar esta importación? No se podrá recuperar.")) return;
    setImportaciones((prev) => prev.filter((i) => i.id !== id));
  };

  // ── Catálogo de materiales (editable) ──
  const addMaterial = () =>
    setMateriales((prev) => [...prev, { id: nuevoId("mat_"), codigo: "", descripcion: "", unidad: "Pieza", fraccion: "", diasSalida: 540 }]);
  const updMaterial = (id, campo, val) =>
    setMateriales((prev) => prev.map((m) => (m.id === id ? { ...m, [campo]: campo === "diasSalida" ? (parseInt(val, 10) || 0) : val } : m)));
  const delMaterial = (id) =>
    setMateriales((prev) => prev.filter((m) => m.id !== id));

  // ── Reporte PDF ──
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const generarReporte = (imp) => {
    const win = window.open("", "_blank");
    if (!win) { alert("Permite las ventanas emergentes para generar el PDF."); return; }

    const filas = imp.items.map((it) => {
      const { limite, dr, est } = vencimientoItem(imp, it);
      const color = est === "vencido" ? "#dc2626" : est === "por_vencer" ? "#d97706" : "#16a34a";
      return `<tr>
        <td>${esc(it.codigo) || "—"}</td>
        <td>${esc(it.descripcion) || "—"}</td>
        <td style="text-align:center">${esc(it.fraccion) || "—"}</td>
        <td style="text-align:right">${(parseFloat(it.cantidad) || 0).toLocaleString()} ${esc(it.unidad)}</td>
        <td style="text-align:right">${fmtMoneda(totalItem(it), imp.moneda)}</td>
        <td style="text-align:center">${it.diasSalida || "—"}</td>
        <td style="text-align:center">${limite ? fmtFecha(limite) : "—"}</td>
        <td style="text-align:center;color:${color};font-weight:700">${txtDias(dr)}</td>
      </tr>`;
    }).join("");

    const estCfg = IMPORT_ESTADOS[imp.estado] || IMPORT_ESTADOS.borrador;

    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
      <title>Importación de Materiales - ${esc(imp.folio) || ""}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Arial, sans-serif; color: #1f2937; margin: 28px; font-size: 12px; }
        h1 { font-size: 18px; margin: 0; color: #0e7490; }
        .sub { color: #6b7280; font-size: 12px; margin: 2px 0 16px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .logo { font-weight: 800; font-size: 22px; color: #0e7490; }
        .info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
        .info div { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px; }
        .info label { display: block; color: #9ca3af; font-size: 10px; text-transform: uppercase; }
        .info span { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 10px; color: #6b7280; text-transform: uppercase; }
        td { padding: 5px 8px; border-top: 1px solid #f0f0f0; }
        .tot { text-align: right; font-size: 14px; font-weight: 800; margin-top: 10px; }
        .obs { margin-top: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; font-size: 11px; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <div class="head">
        <div>
          <h1>Importación de Materiales</h1>
          <div class="sub">SL Logística · documentación de comercio exterior · Estado: ${esc(estCfg.label)}</div>
        </div>
        <div class="logo">SL</div>
      </div>
      <div class="info">
        <div><label>Folio / Referencia</label><span>${esc(imp.folio) || "—"}</span></div>
        <div><label>Proveedor</label><span>${esc(imp.proveedor) || "—"}</span></div>
        <div><label>País de origen</label><span>${esc(imp.paisOrigen) || "—"}</span></div>
        <div><label>Factura / Invoice</label><span>${esc(imp.factura) || "—"}</span></div>
        <div><label>Fecha de importación</label><span>${fmtFecha(imp.fechaImportacion)}</span></div>
        <div><label>Pedimento</label><span>${esc(imp.pedimento) || "—"}</span></div>
        <div><label>Aduana</label><span>${esc(imp.aduana) || "—"}</span></div>
        <div><label>Agente / Patente</label><span>${esc(imp.agenteAduanal) || "—"} ${imp.patente ? "· " + esc(imp.patente) : ""}</span></div>
        <div><label>Transportista</label><span>${esc(imp.transportista) || "—"}</span></div>
        <div><label>Chofer</label><span>${esc(imp.chofer) || "—"}</span></div>
        <div><label>Placas</label><span>${esc(imp.placas) || "—"}</span></div>
        <div><label>Moneda · T.C.</label><span>${esc(imp.moneda) || "—"} ${imp.tipoCambio ? "· " + esc(imp.tipoCambio) : ""}</span></div>
      </div>
      <table>
        <thead><tr>
          <th>Código</th><th>Descripción</th><th style="text-align:center">Fracción</th>
          <th style="text-align:right">Cantidad</th><th style="text-align:right">Valor</th>
          <th style="text-align:center">Días salida</th><th style="text-align:center">Fecha límite</th><th style="text-align:center">Restante</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="tot">Valor total: ${fmtMoneda(totalImportacion(imp), imp.moneda)}</div>
      ${imp.observaciones ? `<div class="obs"><b>Observaciones:</b> ${esc(imp.observaciones)}</div>` : ""}
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`);
    win.document.close();
  };

  // ── Métricas ──
  const totDocs = importaciones.length;
  const porVencer = importaciones.filter((imp) => {
    const v = vencimientoImportacion(imp);
    return v && v.est === "por_vencer";
  }).length;
  const vencidas = importaciones.filter((imp) => {
    const v = vencimientoImportacion(imp);
    return v && v.est === "vencido";
  }).length;
  const enTramiteArr = importaciones.filter((imp) => imp.estado !== "retornada");
  const retornadasArr = importaciones.filter((imp) => imp.estado === "retornada");
  const retornadas = retornadasArr.length;
  const [tabImp, setTabImp] = useState("tramite"); // tramite | historial
  const listaImp = tabImp === "tramite" ? enTramiteArr : retornadasArr;

  const stat = (l, v, c) => (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
      <div className="text-xs text-gray-500 mb-1">{l}</div>
      <div className={`text-xl font-semibold ${c}`}>{v}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Importaciones de Materiales</h1>
          <p className="text-sm text-gray-500 mt-0.5">Documentación de importación temporal y control de fechas límite de salida</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVerCatalogo(true)} className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600">📚 Catálogo de materiales</button>
          <button onClick={nueva} className="text-xs px-3 py-2 bg-cyan-600 text-white rounded-lg font-semibold hover:bg-cyan-700">+ Nueva importación</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {stat("Importaciones", totDocs, "text-gray-900")}
        {stat("Por vencer", porVencer, "text-amber-600")}
        {stat("Vencidas", vencidas, "text-red-600")}
        {stat("Retornadas", retornadas, "text-green-700")}
      </div>

      {totDocs > 0 && (
        <ColaTabs tab={tabImp} setTab={setTabImp} tabs={[
          { key: "tramite", label: "En trámite", count: enTramiteArr.length },
          { key: "historial", label: "Retornadas", count: retornadasArr.length },
        ]} />
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">{totDocs === 0 ? "Importaciones registradas" : tabImp === "tramite" ? "Importaciones en trámite" : "Importaciones retornadas"} ({totDocs === 0 ? 0 : listaImp.length})</span>
        </div>
        {totDocs === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-2">🛃</div>
            <div className="text-sm text-gray-500 mb-3">Aún no hay importaciones registradas.</div>
            <button onClick={nueva} className="text-xs px-4 py-2 bg-cyan-600 text-white rounded-lg font-semibold hover:bg-cyan-700">+ Documentar primera importación</button>
          </div>
        ) : listaImp.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">{tabImp === "tramite" ? "No hay importaciones en trámite." : "Aún no hay importaciones retornadas."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "1080px" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Folio</th>
                  <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                  <th className="text-left px-3 py-2 font-medium">Origen</th>
                  <th className="text-left px-3 py-2 font-medium">Fecha import.</th>
                  <th className="text-left px-3 py-2 font-medium">Pedimento</th>
                  <th className="text-right px-3 py-2 font-medium">Artículos</th>
                  <th className="text-right px-3 py-2 font-medium">Valor total</th>
                  <th className="text-center px-3 py-2 font-medium">Límite más próximo</th>
                  <th className="text-center px-3 py-2 font-medium">Estado</th>
                  <th className="text-center px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {listaImp.map((imp) => {
                  const v = vencimientoImportacion(imp);
                  const estCfg = IMPORT_ESTADOS[imp.estado] || IMPORT_ESTADOS.borrador;
                  return (
                    <tr key={imp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-bold text-cyan-700">{imp.folio || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{imp.proveedor || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{imp.paisOrigen || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{fmtFecha(imp.fechaImportacion)}</td>
                      <td className="px-3 py-2 text-gray-600">{imp.pedimento || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-700">{imp.items?.length || 0}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmtMoneda(totalImportacion(imp), imp.moneda)}</td>
                      <td className="px-3 py-2 text-center">
                        {v ? (
                          <div>
                            <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full font-semibold border ${BADGE_VENC[v.est]}`}>{txtDias(v.dr)}</span>
                            <div className="text-gray-400 text-[10px] mt-0.5">{fmtFecha(v.limite)}</div>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span title={estCfg.label} className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-sm ${estCfg.color}`}>{estCfg.icono}</span>
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button onClick={() => abrir(imp)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 mr-1">✏️ Editar</button>
                        <button onClick={() => generarReporte(imp)} className="text-xs px-2 py-1 border border-cyan-200 rounded-lg bg-white hover:bg-cyan-50 text-cyan-700 mr-1">📄 PDF</button>
                        <button onClick={() => eliminar(imp.id)} className="text-xs px-2 py-1 border border-red-200 rounded-lg bg-white hover:bg-red-50 text-red-600">🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal nueva/editar importación ── */}
      {edit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[94vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="text-sm font-semibold text-gray-900">Importación de materiales {edit.folio ? `— ${edit.folio}` : "(nueva)"}</div>
              <button onClick={cerrar} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Datos generales */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos generales</div>
                <div className="grid grid-cols-4 gap-2">
                  <div><label className={LBL}>Folio / Referencia</label><input className={INP} value={edit.folio} onChange={(e) => upd("folio", e.target.value)} placeholder="IMP-2026-001" /></div>
                  <div><label className={LBL}>Proveedor</label><input className={INP} value={edit.proveedor} onChange={(e) => upd("proveedor", e.target.value)} placeholder="Nombre del proveedor" /></div>
                  <div><label className={LBL}>País de origen</label><input className={INP} value={edit.paisOrigen} onChange={(e) => upd("paisOrigen", e.target.value)} placeholder="USA" /></div>
                  <div><label className={LBL}>Factura / Invoice</label><input className={INP} value={edit.factura} onChange={(e) => upd("factura", e.target.value)} placeholder="No. de factura" /></div>
                  <div>
                    <label className={LBL}>Fecha de importación</label>
                    <input type="date" className={INP} value={edit.fechaImportacion} onChange={(e) => upd("fechaImportacion", e.target.value)} />
                  </div>
                  <div><label className={LBL}>Moneda</label>
                    <SearchSelect className={INP} value={edit.moneda} onChange={(v) => upd("moneda", v)} options={[{ value: "USD", label: "USD" }, { value: "MXN", label: "MXN" }, { value: "EUR", label: "EUR" }]} />
                  </div>
                  <div><label className={LBL}>Tipo de cambio</label><input type="number" step="0.0001" className={INP} value={edit.tipoCambio} onChange={(e) => upd("tipoCambio", e.target.value)} placeholder="17.50" /></div>
                  <div><label className={LBL}>Estado del trámite</label>
                    <SearchSelect className={INP} value={edit.estado} onChange={(v) => upd("estado", v)} options={Object.entries(IMPORT_ESTADOS).map(([k, c]) => ({ value: k, label: c.label }))} />
                  </div>
                </div>
              </div>

              {/* Datos aduanales y transporte */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Aduana y transporte</div>
                <div className="grid grid-cols-4 gap-2">
                  <div><label className={LBL}>Pedimento</label><input className={INP} value={edit.pedimento} onChange={(e) => upd("pedimento", e.target.value)} placeholder="No. de pedimento" /></div>
                  <div><label className={LBL}>Aduana</label><input className={INP} value={edit.aduana} onChange={(e) => upd("aduana", e.target.value)} placeholder="Nogales / Mexicali…" /></div>
                  <div><label className={LBL}>Agente aduanal</label><input className={INP} value={edit.agenteAduanal} onChange={(e) => upd("agenteAduanal", e.target.value)} placeholder="Nombre / Agencia" /></div>
                  <div><label className={LBL}>Patente</label><input className={INP} value={edit.patente} onChange={(e) => upd("patente", e.target.value)} placeholder="No. patente" /></div>
                  <div><label className={LBL}>Transportista</label><input className={INP} value={edit.transportista} onChange={(e) => upd("transportista", e.target.value)} placeholder="Línea" /></div>
                  <div><label className={LBL}>Chofer</label><input className={INP} value={edit.chofer} onChange={(e) => upd("chofer", e.target.value)} placeholder="Nombre" /></div>
                  <div><label className={LBL}>Placas</label><input className={INP} value={edit.placas} onChange={(e) => upd("placas", e.target.value)} placeholder="Tracto / Caja" /></div>
                </div>
              </div>

              {/* Artículos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase">Artículos a importar</div>
                  <button onClick={agregarItem} className="text-xs px-3 py-1.5 text-cyan-700 hover:bg-cyan-50 rounded-lg font-medium border border-cyan-200">+ Agregar artículo</button>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: "920px" }}>
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                        <th className="text-left px-2 py-2 font-medium">Material (catálogo)</th>
                        <th className="text-right px-2 py-2 font-medium w-20">Cantidad</th>
                        <th className="text-left px-2 py-2 font-medium w-20">Unidad</th>
                        <th className="text-right px-2 py-2 font-medium w-24">Valor unit.</th>
                        <th className="text-right px-2 py-2 font-medium w-24">Total</th>
                        <th className="text-right px-2 py-2 font-medium w-20">Días salida</th>
                        <th className="text-center px-2 py-2 font-medium w-28">Fecha límite</th>
                        <th className="text-center px-2 py-2 font-medium w-24">Restante</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {edit.items.map((it) => {
                        const { limite, dr, est } = vencimientoItem(edit, it);
                        return (
                          <tr key={it.id} className="border-t border-gray-100">
                            <td className="px-2 py-1">
                              <SearchSelect className={INP} value={it.materialId} onChange={(v) => elegirMaterial(it.id, v)} placeholder="— Elegir material —" options={materiales.map((m) => ({ value: m.id, label: (m.codigo ? m.codigo + " · " : "") + m.descripcion }))} />
                            </td>
                            <td className="px-2 py-1"><input type="number" className={INP + " text-right"} value={it.cantidad} onChange={(e) => updItem(it.id, "cantidad", e.target.value)} placeholder="0" /></td>
                            <td className="px-2 py-1"><input className={INP} value={it.unidad} onChange={(e) => updItem(it.id, "unidad", e.target.value)} placeholder="Pza" /></td>
                            <td className="px-2 py-1"><input type="number" step="0.01" className={INP + " text-right"} value={it.valorUnitario} onChange={(e) => updItem(it.id, "valorUnitario", e.target.value)} placeholder="0.00" /></td>
                            <td className="px-2 py-1 text-right font-semibold text-gray-700">{fmtMoneda(totalItem(it), edit.moneda)}</td>
                            <td className="px-2 py-1"><input type="number" className={INP + " text-right"} value={it.diasSalida} onChange={(e) => updItem(it.id, "diasSalida", e.target.value)} placeholder="540" /></td>
                            <td className="px-2 py-1 text-center text-gray-600">{limite ? fmtFecha(limite) : "—"}</td>
                            <td className="px-2 py-1 text-center">
                              {dr == null ? <span className="text-gray-300">—</span> :
                                <span className={`px-2 py-0.5 rounded-full font-semibold border ${BADGE_VENC[est]}`}>{txtDias(dr)}</span>}
                            </td>
                            <td className="px-2 py-1 text-center">
                              <button onClick={() => quitarItem(it.id)} className="text-gray-300 hover:text-red-500" title="Quitar">✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={4} className="px-2 py-2 text-right text-gray-500 font-medium">Valor total de la importación</td>
                        <td className="px-2 py-2 text-right font-bold text-gray-900">{fmtMoneda(totalImportacion(edit), edit.moneda)}</td>
                        <td colSpan={4}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Los “días de salida” se prellenan desde el catálogo del material, pero puedes ajustarlos por importación. La fecha límite = fecha de importación + días de salida. Se alerta cuando faltan {DIAS_ALERTA_SALIDA} días o menos.</p>
              </div>

              <div>
                <label className={LBL}>Observaciones</label>
                <textarea className={INP} rows={2} value={edit.observaciones} onChange={(e) => upd("observaciones", e.target.value)} placeholder="Notas del trámite, pendientes documentales, etc." />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-between items-center sticky bottom-0 bg-white">
              <button onClick={() => generarReporte(edit)} className="text-xs px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700">📄 Generar PDF</button>
              <div className="flex gap-2">
                <button onClick={cerrar} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                <button onClick={guardar} className="text-xs px-4 py-2 bg-cyan-600 text-white rounded-lg font-semibold hover:bg-cyan-700">💾 Guardar importación</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal catálogo de materiales ── */}
      {verCatalogo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <div className="text-sm font-semibold text-gray-900">Catálogo de materiales</div>
                <div className="text-xs text-gray-500 mt-0.5">Artículos importables y su periodo de salida (días para retornar sin impuesto/multa)</div>
              </div>
              <button onClick={() => setVerCatalogo(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                      <th className="text-left px-2 py-2 font-medium w-28">Código</th>
                      <th className="text-left px-2 py-2 font-medium">Descripción</th>
                      <th className="text-left px-2 py-2 font-medium w-24">Unidad</th>
                      <th className="text-left px-2 py-2 font-medium w-28">Fracción</th>
                      <th className="text-right px-2 py-2 font-medium w-24">Días salida</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiales.map((m) => (
                      <tr key={m.id} className="border-t border-gray-100">
                        <td className="px-2 py-1"><input className={INP} value={m.codigo} onChange={(e) => updMaterial(m.id, "codigo", e.target.value)} placeholder="COD-001" /></td>
                        <td className="px-2 py-1"><input className={INP} value={m.descripcion} onChange={(e) => updMaterial(m.id, "descripcion", e.target.value)} placeholder="Descripción del material" /></td>
                        <td className="px-2 py-1"><input className={INP} value={m.unidad} onChange={(e) => updMaterial(m.id, "unidad", e.target.value)} placeholder="Pieza" /></td>
                        <td className="px-2 py-1"><input className={INP} value={m.fraccion} onChange={(e) => updMaterial(m.id, "fraccion", e.target.value)} placeholder="0000.00.00" /></td>
                        <td className="px-2 py-1"><input type="number" className={INP + " text-right"} value={m.diasSalida} onChange={(e) => updMaterial(m.id, "diasSalida", e.target.value)} placeholder="540" /></td>
                        <td className="px-2 py-1 text-center"><button onClick={() => delMaterial(m.id)} className="text-gray-300 hover:text-red-500" title="Eliminar">✕</button></td>
                      </tr>
                    ))}
                    {materiales.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-gray-400 italic py-6">Sin materiales. Agrega el primero.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button onClick={addMaterial} className="mt-3 text-xs px-3 py-1.5 text-cyan-700 hover:bg-cyan-50 rounded-lg font-medium border border-cyan-200">+ Agregar material</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end sticky bottom-0 bg-white">
              <button onClick={() => setVerCatalogo(false)} className="text-xs px-4 py-2 bg-cyan-600 text-white rounded-lg font-semibold hover:bg-cyan-700">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
