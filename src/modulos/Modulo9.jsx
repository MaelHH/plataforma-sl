import { useState } from "react";
import { useDatos, DEFECTOS_QC, CATS_QC, MAX_MUESTREOS } from "../store/datos";

// Muestreo vacío (gramos por defecto en blanco)
const muestreoVacio = (lote) => ({
  inspector: "", folio: "", lote: lote || "", pesoMuestra: "", fecha: hoyISO(),
  defectos: Object.fromEntries(DEFECTOS_QC.map((d) => [d.id, ""])),
  fotos: {}, // 1 foto por defecto: { [defId]: dataURL }
});

// % de un defecto = gramos / peso muestra * 100
const pctDefecto = (gramos, pesoMuestra) => {
  const p = parseFloat(pesoMuestra) || 0;
  const g = parseFloat(gramos) || 0;
  return p > 0 ? (g / p) * 100 : 0;
};

// % por categoría (calidad / condición / plaga)
const pctCategoria = (mu, cat) =>
  DEFECTOS_QC.filter((d) => d.cat === cat).reduce((a, d) => a + pctDefecto(mu.defectos[d.id], mu.pesoMuestra), 0);

// QCI = 100 - total de defectos %
const calcQCI = (mu) => {
  const total = DEFECTOS_QC.reduce((a, d) => a + pctDefecto(mu.defectos[d.id], mu.pesoMuestra), 0);
  return Math.max(0, 100 - total);
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Suma de un campo numérico en los renglones de carga
const sumar = (items, campo) => (items || []).reduce((a, it) => a + (parseFloat(it[campo]) || 0), 0);

export default function Modulo9() {
  const { movimientos, setMovimientos } = useDatos();

  const [recibir, setRecibir] = useState(null); // movimiento que se está recibiendo
  const [form, setForm] = useState(null);

  // ── Muestreo de calidad ──
  const [muestreoMov, setMuestreoMov] = useState(null); // movimiento al que se le hace muestreo
  const [muestreos, setMuestreos] = useState([]); // muestreos en edición (hasta 3)
  const [mActivo, setMActivo] = useState(0); // pestaña activa

  const abrirMuestreo = (m) => {
    const existentes = m.muestreos && m.muestreos.length ? m.muestreos : [muestreoVacio(m.lote)];
    setMuestreos(existentes);
    setMActivo(0);
    setMuestreoMov(m);
  };
  const cerrarMuestreo = () => { setMuestreoMov(null); setMuestreos([]); setMActivo(0); };

  const updMuestreo = (campo, val) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, [campo]: val } : mu)));
  const updDefecto = (defId, val) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, defectos: { ...mu.defectos, [defId]: val } } : mu)));

  const agregarMuestreo = () => {
    if (muestreos.length >= MAX_MUESTREOS) return;
    setMuestreos((prev) => [...prev, muestreoVacio(muestreoMov?.lote)]);
    setMActivo(muestreos.length);
  };
  const eliminarMuestreo = (idx) => {
    setMuestreos((prev) => prev.filter((_, i) => i !== idx));
    setMActivo((a) => (a >= idx && a > 0 ? a - 1 : a));
  };

  const guardarMuestreo = () => {
    setMovimientos((prev) => prev.map((m) => (m.id === muestreoMov.id ? { ...m, muestreos } : m)));
    cerrarMuestreo();
  };

  // Foto (1 por defecto) → se guarda como dataURL base64
  const subirFoto = (defId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, fotos: { ...mu.fotos, [defId]: reader.result } } : mu)));
    reader.readAsDataURL(file);
  };
  const quitarFoto = (defId) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, fotos: { ...mu.fotos, [defId]: undefined } } : mu)));

  // ── Generar reporte PDF (imprimir → guardar como PDF) ──
  const colorQCI = (q) => (q >= 90 ? "#16a34a" : q >= 80 ? "#65a30d" : q >= 70 ? "#d97706" : "#dc2626");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const generarReporte = () => {
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
          <td>${esc(d.label)}${tieneFoto ? ' <span style="color:#6366f1">📷</span>' : ""}</td>
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
  };

  // ── Abrir ficha de recepción ──
  const abrirRecepcion = (m) => {
    const par = sumar(m.cargaItems, "parrillas");
    const bul = sumar(m.cargaItems, "bultos");
    const r = m.recepcion || {};
    setForm({
      fechaLlegada: r.fechaLlegada || hoyISO(),
      horaLlegada: r.horaLlegada || "",
      responsable: r.responsable || "",
      // se prellenan con lo declarado para que solo confirmen o ajusten
      parrillasRecibidas: r.parrillasRecibidas ?? String(par || ""),
      bultosRecibidos: r.bultosRecibidos ?? String(bul || ""),
      pesoRecibido: r.pesoRecibido ?? (m.pesoBascula || ""),
      condicion: r.condicion || "ok",
      observaciones: r.observaciones || "",
    });
    setRecibir(m);
  };

  const upd = (campo, val) => setForm((f) => ({ ...f, [campo]: val }));

  const confirmar = () => {
    const recepcion = { ...form, estado: "recibido", confirmado: new Date().toLocaleString("es-MX") };
    setMovimientos((prev) => prev.map((m) => (m.id === recibir.id ? { ...m, recepcion } : m)));
    setRecibir(null);
    setForm(null);
  };

  const reabrir = (id) => {
    if (!window.confirm("¿Reabrir esta recepción? Se marcará como pendiente otra vez.")) return;
    setMovimientos((prev) => prev.map((m) => (m.id === id ? { ...m, recepcion: undefined } : m)));
  };

  const recibidos = movimientos.filter((m) => m.recepcion?.estado === "recibido");
  const pendientes = movimientos.filter((m) => m.recepcion?.estado !== "recibido");
  const conNovedad = recibidos.filter((m) => m.recepcion?.condicion === "con_novedad");

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const LBL = "text-xs text-gray-500 block mb-0.5";

  // Compara declarado vs recibido para resaltar diferencias en la ficha
  const declaradoVsRecibido = (m, f) => {
    const par = sumar(m.cargaItems, "parrillas");
    const bul = sumar(m.cargaItems, "bultos");
    const peso = parseFloat(m.pesoBascula) || 0;
    return [
      { l: "Parrillas", sal: par || 0, lle: parseFloat(f.parrillasRecibidas) || 0 },
      { l: "Bultos", sal: bul || 0, lle: parseFloat(f.bultosRecibidos) || 0 },
      { l: "Peso (lb)", sal: peso || 0, lle: parseFloat(f.pesoRecibido) || 0 },
    ];
  };

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
          <h1 className="text-base font-semibold text-gray-900">Recepción en Empaque</h1>
          <p className="text-sm text-gray-500 mt-0.5">Confirmación de llegada de los fletes que salieron de campo</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">EM</div>
          <span className="text-sm font-medium text-gray-700">Empaque</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {stat("Total fletes", movimientos.length, "text-gray-900")}
        {stat("Por recibir", pendientes.length, "text-orange-600")}
        {stat("Recibidos", recibidos.length, "text-green-700")}
        {stat("Con novedad", conNovedad.length, "text-red-600")}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">Fletes para dar recepción ({movimientos.length})</span>
        </div>
        {movimientos.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">Aún no hay fletes salidos de campo. Aparecerán aquí en cuanto se registren en Movimientos.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "1080px" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Folio</th>
                  <th className="text-left px-3 py-2 font-medium">Fecha salida</th>
                  <th className="text-left px-3 py-2 font-medium">Origen → Destino</th>
                  <th className="text-left px-3 py-2 font-medium">Línea / Chofer</th>
                  <th className="text-right px-3 py-2 font-medium">Parrillas</th>
                  <th className="text-right px-3 py-2 font-medium">Bultos</th>
                  <th className="text-center px-3 py-2 font-medium">Estado</th>
                  <th className="text-center px-3 py-2 font-medium">Calidad (QCI)</th>
                  <th className="text-center px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const par = sumar(m.cargaItems, "parrillas");
                  const bul = sumar(m.cargaItems, "bultos");
                  const r = m.recepcion;
                  const recibido = r?.estado === "recibido";
                  const novedad = recibido && r?.condicion === "con_novedad";
                  const nMu = m.muestreos?.length || 0;
                  const qciProm = nMu ? m.muestreos.reduce((a, mu) => a + calcQCI(mu), 0) / nMu : null;
                  return (
                    <tr key={m.id} className={`border-b border-gray-100 ${recibido ? (novedad ? "bg-red-50/40" : "bg-green-50/40") : "hover:bg-gray-50"}`}>
                      <td className="px-3 py-2 font-bold text-red-600">{m.folio || "—"}</td>
                      <td className="px-3 py-2 font-semibold text-gray-700">{m.fecha || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{m.origen || "—"} → {m.destino || "—"}</td>
                      <td className="px-3 py-2 text-gray-700"><div className="font-medium">{m.linea || "—"}</div><div className="text-gray-400">{m.chofer || "—"}</div></td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{par || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">{bul ? bul.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {recibido ? (
                          <span className={`px-2 py-0.5 rounded-full font-semibold border ${novedad ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"}`}>
                            {novedad ? "⚠️ Con novedad" : "✓ Recibido"}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full font-semibold border bg-orange-100 text-orange-700 border-orange-200">⏳ Por recibir</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {qciProm !== null ? (
                          <span className={`px-2 py-0.5 rounded-full font-bold ${qciProm >= 90 ? "bg-green-100 text-green-700" : qciProm >= 80 ? "bg-lime-100 text-lime-700" : qciProm >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                            {qciProm.toFixed(2)}%
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                        {nMu > 0 && <div className="text-gray-400 text-[10px] mt-0.5">{nMu}/{MAX_MUESTREOS} muestreo{nMu > 1 ? "s" : ""}</div>}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button onClick={() => abrirMuestreo(m)} className="text-xs px-2 py-1 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 text-indigo-600 mr-1">🔬 {nMu ? "Calidad" : "Muestreo"}</button>
                        {recibido ? (
                          <>
                            <button onClick={() => abrirRecepcion(m)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 mr-1">👁️ Ver</button>
                            <button onClick={() => reabrir(m.id)} className="text-xs px-2 py-1 border border-amber-200 rounded-lg bg-white hover:bg-amber-50 text-amber-600">↩️ Reabrir</button>
                          </>
                        ) : (
                          <button onClick={() => abrirRecepcion(m)} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700">Dar recepción</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal de recepción ── */}
      {recibir && form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="text-sm font-semibold text-gray-900">Recepción — Folio {recibir.folio || "—"}</div>
              <button onClick={() => { setRecibir(null); setForm(null); }} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Datos declarados (lo que dijeron que salió) */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Lo que salió de campo (declarado)</div>
                <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3">
                  {[
                    ["Rancho", recibir.rancho], ["Origen", recibir.origen], ["Destino", recibir.destino],
                    ["Línea", recibir.linea], ["Chofer", recibir.chofer], ["Placa tracto", recibir.placaTracto],
                    ["No. caja", recibir.economicoCaja], ["Remisión", recibir.remision], ["Flete", recibir.flete ? "$" + recibir.flete : ""],
                  ].map(([l, v]) => (
                    <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                  ))}
                </div>
              </div>

              {/* Confirmación de cantidades: salió vs llegó */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Confirmar cantidades recibidas</div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">Concepto</th>
                        <th className="text-right px-3 py-2 font-medium">Salió</th>
                        <th className="text-right px-3 py-2 font-medium w-32">Llegó</th>
                        <th className="text-right px-3 py-2 font-medium">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {declaradoVsRecibido(recibir, form).map((row, i) => {
                        const dif = row.lle - row.sal;
                        const campo = ["parrillasRecibidas", "bultosRecibidos", "pesoRecibido"][i];
                        return (
                          <tr key={row.l} className="border-t border-gray-100">
                            <td className="px-3 py-1.5 text-gray-700 font-medium">{row.l}</td>
                            <td className="px-3 py-1.5 text-right text-gray-600">{row.sal.toLocaleString()}</td>
                            <td className="px-3 py-1.5">
                              <input type="number" className={INP + " text-right"} value={form[campo]} onChange={(e) => upd(campo, e.target.value)} />
                            </td>
                            <td className={`px-3 py-1.5 text-right font-semibold ${dif === 0 ? "text-gray-400" : "text-red-600"}`}>
                              {dif === 0 ? "✓ ok" : (dif > 0 ? "+" : "") + dif.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Datos de llegada */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos de la recepción</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={LBL}>Fecha de llegada</label><input type="date" className={INP} value={form.fechaLlegada} onChange={(e) => upd("fechaLlegada", e.target.value)} /></div>
                  <div><label className={LBL}>Hora de llegada</label><input type="time" className={INP} value={form.horaLlegada} onChange={(e) => upd("horaLlegada", e.target.value)} /></div>
                  <div><label className={LBL}>Recibe (responsable)</label><input className={INP} value={form.responsable} onChange={(e) => upd("responsable", e.target.value)} placeholder="Nombre de quien recibe" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className={LBL}>Condición de la carga</label>
                    <select className={INP} value={form.condicion} onChange={(e) => upd("condicion", e.target.value)}>
                      <option value="ok">✓ Llegó completo y en buen estado</option>
                      <option value="con_novedad">⚠️ Con novedad (faltante / daño)</option>
                    </select>
                  </div>
                  <div><label className={LBL}>Observaciones</label><input className={INP} value={form.observaciones} onChange={(e) => upd("observaciones", e.target.value)} placeholder="Notas de la recepción" /></div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end sticky bottom-0 bg-white">
              <button onClick={() => { setRecibir(null); setForm(null); }} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmar} className="text-xs px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700">✓ Confirmar recepción</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de muestreo de calidad ── */}
      {muestreoMov && muestreos[mActivo] && (() => {
        const mu = muestreos[mActivo];
        const qci = calcQCI(mu);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Control de Calidad — Recepción</div>
                  <div className="text-xs text-gray-500 mt-0.5">Folio {muestreoMov.folio || "—"} · {muestreoMov.rancho || "—"} → {muestreoMov.destino || "—"}</div>
                </div>
                <button onClick={cerrarMuestreo} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
              </div>

              {/* Pestañas de muestreos */}
              <div className="px-5 pt-3 flex items-center gap-2 border-b border-gray-100">
                {muestreos.map((_, i) => (
                  <button key={i} onClick={() => setMActivo(i)}
                    className={`text-xs px-3 py-1.5 rounded-t-lg font-medium border-b-2 -mb-px ${i === mActivo ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    Muestreo {i + 1}
                    {muestreos.length > 1 && <span onClick={(e) => { e.stopPropagation(); eliminarMuestreo(i); }} className="ml-2 text-gray-300 hover:text-red-500">✕</span>}
                  </button>
                ))}
                {muestreos.length < MAX_MUESTREOS && (
                  <button onClick={agregarMuestreo} className="text-xs px-3 py-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium">+ Agregar muestreo</button>
                )}
              </div>

              <div className="px-5 py-4">
                {/* Encabezado del muestreo */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div><label className={LBL}>Lote (paredes)</label><input className={INP} value={mu.lote} onChange={(e) => updMuestreo("lote", e.target.value)} placeholder="Paredes" /></div>
                  <div><label className={LBL}>Inspector</label><input className={INP} value={mu.inspector} onChange={(e) => updMuestreo("inspector", e.target.value)} placeholder="Quien muestrea" /></div>
                  <div><label className={LBL}>Folio muestreo / ID</label><input className={INP} value={mu.folio} onChange={(e) => updMuestreo("folio", e.target.value)} placeholder="201" /></div>
                  <div><label className={LBL}>Peso muestra</label><input type="number" className={INP} value={mu.pesoMuestra} onChange={(e) => updMuestreo("pesoMuestra", e.target.value)} placeholder="39.30" /></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Tabla de defectos (col 1-2) */}
                  <div className="md:col-span-2 border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                          <th className="text-left px-3 py-2 font-medium">Defecto</th>
                          <th className="text-right px-3 py-2 font-medium w-28">Defectos (g)</th>
                          <th className="text-right px-3 py-2 font-medium w-20">Promedio</th>
                          <th className="text-center px-3 py-2 font-medium w-16">Foto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DEFECTOS_QC.map((d) => {
                          const pct = pctDefecto(mu.defectos[d.id], mu.pesoMuestra);
                          const catColor = { calidad: "border-l-blue-400", condicion: "border-l-amber-400", plaga: "border-l-red-400" }[d.cat];
                          return (
                            <tr key={d.id} className={`border-t border-gray-100 border-l-2 ${catColor}`}>
                              <td className="px-3 py-1 text-gray-700">{d.label}</td>
                              <td className="px-2 py-1"><input type="number" step="0.01" className={INP + " text-right"} value={mu.defectos[d.id]} onChange={(e) => updDefecto(d.id, e.target.value)} placeholder="0.00" /></td>
                              <td className={`px-3 py-1 text-right font-semibold ${pct > 0 ? "text-gray-800" : "text-gray-300"}`}>{pct.toFixed(1)}%</td>
                              <td className="px-2 py-1 text-center">
                                {mu.fotos?.[d.id] ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <a href={mu.fotos[d.id]} target="_blank" rel="noreferrer"><img src={mu.fotos[d.id]} alt="" className="w-7 h-7 object-cover rounded border border-gray-200" /></a>
                                    <button onClick={() => quitarFoto(d.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                                  </div>
                                ) : (
                                  <label className="cursor-pointer text-indigo-400 hover:text-indigo-600 text-base" title="Agregar foto">
                                    📷
                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => subirFoto(d.id, e.target.files?.[0])} />
                                  </label>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen por categoría + QCI (col 3) */}
                  <div className="space-y-3">
                    {Object.entries(CATS_QC).map(([key, cfg]) => {
                      const pct = pctCategoria(mu, key);
                      return (
                        <div key={key} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">{cfg.label}</span>
                          <span className={`text-lg font-bold ${cfg.color}`}>{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                    <div className={`rounded-xl px-4 py-4 text-center ${qci >= 90 ? "bg-green-500" : qci >= 80 ? "bg-lime-500" : qci >= 70 ? "bg-amber-500" : "bg-red-500"}`}>
                      <div className="text-xs font-semibold text-white/90 uppercase">QCI Recepción</div>
                      <div className="text-3xl font-extrabold text-white mt-1">{qci.toFixed(2)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-between items-center sticky bottom-0 bg-white">
                <button onClick={generarReporte} className="text-xs px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 flex items-center gap-1">📄 Generar PDF / Reportar a empaque</button>
                <div className="flex gap-2">
                  <button onClick={cerrarMuestreo} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                  <button onClick={guardarMuestreo} className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">💾 Guardar muestreo{muestreos.length > 1 ? "s" : ""}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
