import { useState } from "react";
import { useDatos, CATS_QC, CALIDAD_ESTADOS, ahora } from "../store/datos";
import ColaTabs from "../components/ColaTabs";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
const genId = () => "D_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Aprobación de calidad vacía para una carga.
const calidadVacia = (producto) => ({
  estado: "pendiente",
  producto: producto || "",
  inspector: "",
  lugar: "",
  fecha: hoyISO(),
  defectos: {}, // { [defId]: { presente, notas, fotos:[dataURL] } }
  observaciones: "",
  resueltoPor: "",
  resueltoTs: "",
});

export default function Modulo12() {
  const {
    cargasEmbarques, setCargasEmbarques,
    defectosCalidad, setDefectosCalidad,
    inspectoresCalidad, setInspectoresCalidad,
    lugaresCalidad, setLugaresCalidad,
  } = useDatos();

  const [cargaSel, setCargaSel] = useState(null); // carga en inspección
  const [insp, setInsp] = useState(null);

  // Catálogos (modales)
  const [catDef, setCatDef] = useState(false);
  const [catInsp, setCatInsp] = useState(false);
  const [catLug, setCatLug] = useState(false);

  const productos = Object.keys(defectosCalidad);

  const abrir = (carga) => {
    setInsp(carga.calidad ? { ...calidadVacia(productos[0]), ...carga.calidad } : calidadVacia(productos[0] || ""));
    setCargaSel(carga);
  };
  const cerrar = () => { setCargaSel(null); setInsp(null); };

  const upd = (campo, val) => setInsp((f) => ({ ...f, [campo]: val }));
  const updDefecto = (defId, campo, val) =>
    setInsp((f) => ({ ...f, defectos: { ...f.defectos, [defId]: { presente: false, notas: "", fotos: [], ...f.defectos[defId], [campo]: val } } }));

  // Fotos por defecto (varias) → se guardan como dataURL base64
  const subirFotos = (defId, fileList) => {
    Array.from(fileList || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setInsp((f) => {
          const d = f.defectos[defId] || { presente: true, notas: "", fotos: [] };
          return { ...f, defectos: { ...f.defectos, [defId]: { ...d, presente: true, fotos: [...(d.fotos || []), reader.result] } } };
        });
      reader.readAsDataURL(file);
    });
  };
  const quitarFoto = (defId, idx) =>
    setInsp((f) => {
      const d = f.defectos[defId];
      if (!d) return f;
      return { ...f, defectos: { ...f.defectos, [defId]: { ...d, fotos: d.fotos.filter((_, i) => i !== idx) } } };
    });

  const persistir = (calidad) => {
    const id = cargaSel.id;
    setCargasEmbarques((prev) => prev.map((c) => (c.id === id ? { ...c, calidad } : c)));
  };
  const guardar = () => { persistir(insp); cerrar(); };
  const resolver = (estado) => { persistir({ ...insp, estado, resueltoTs: ahora().local }); cerrar(); };

  // ── Edición de catálogos ──
  const updDefLabel = (prod, defId, val) => setDefectosCalidad((p) => ({ ...p, [prod]: p[prod].map((d) => d.id === defId ? { ...d, label: val } : d) }));
  const updDefCat = (prod, defId, val) => setDefectosCalidad((p) => ({ ...p, [prod]: p[prod].map((d) => d.id === defId ? { ...d, cat: val } : d) }));
  const addDef = (prod) => setDefectosCalidad((p) => ({ ...p, [prod]: [...(p[prod] || []), { id: genId(), label: "Nuevo defecto", cat: "calidad" }] }));
  const delDef = (prod, defId) => setDefectosCalidad((p) => ({ ...p, [prod]: p[prod].filter((d) => d.id !== defId) }));
  const addProd = (nombre) => {
    const n = (nombre || "").trim().toUpperCase();
    if (!n) return;
    setDefectosCalidad((p) => (p[n] ? p : { ...p, [n]: [] }));
  };
  const delProd = (prod) => {
    if (!window.confirm(`¿Eliminar el producto "${prod}" y todos sus defectos?`)) return;
    setDefectosCalidad((p) => { const c = { ...p }; delete c[prod]; return c; });
  };

  const updInspector = (i, val) => setInspectoresCalidad((p) => p.map((x, j) => (j === i ? val : x)));
  const addInspector = () => setInspectoresCalidad((p) => [...p, "NUEVO INSPECTOR"]);
  const delInspector = (i) => setInspectoresCalidad((p) => p.filter((_, j) => j !== i));

  const updLugar = (i, val) => setLugaresCalidad((p) => p.map((x, j) => (j === i ? val : x)));
  const addLugar = () => setLugaresCalidad((p) => [...p, "Nuevo lugar"]);
  const delLugar = (i) => setLugaresCalidad((p) => p.filter((_, j) => j !== i));

  // Conteos
  const estadoDe = (c) => c.calidad?.estado || "pendiente";
  const total = cargasEmbarques.length;
  const pendientesArr = cargasEmbarques.filter((c) => estadoDe(c) === "pendiente");
  const resueltosArr = cargasEmbarques.filter((c) => estadoDe(c) !== "pendiente");
  const pendientes = pendientesArr.length;
  const aprobados = cargasEmbarques.filter((c) => estadoDe(c) === "aprobado").length;
  const [tabQC, setTabQC] = useState("pendientes"); // pendientes | historial
  const listaQC = tabQC === "pendientes" ? pendientesArr : resueltosArr;

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const LBL = "text-xs text-gray-500 block mb-0.5";
  const BTN_CAT = "text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200";

  const stat = (l, v, c) => (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
      <div className="text-xs text-gray-500 mb-1">{l}</div>
      <div className={`text-xl font-semibold ${c}`}>{v}</div>
    </div>
  );

  const defectosProducto = insp ? defectosCalidad[insp.producto] || [] : [];
  const nConDefecto = insp ? defectosProducto.filter((d) => insp.defectos[d.id]?.presente).length : 0;

  // Editor de defectos: producto seleccionado
  const [catProdSel, setCatProdSel] = useState(productos[0] || "");
  const [nuevoProd, setNuevoProd] = useState("");
  const prodEditar = defectosCalidad[catProdSel] ? catProdSel : (productos[0] || "");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">QC - Bodegas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Inspección de calidad de los embarques antes de liberar · fotos por defecto, según el producto</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatDef(true)} className={BTN_CAT}>🔬 Defectos</button>
          <button onClick={() => setCatInsp(true)} className={BTN_CAT}>👤 Inspectores</button>
          <button onClick={() => setCatLug(true)} className={BTN_CAT}>📍 Lugares</button>
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">QC</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {stat("Total embarques", total, "text-gray-900")}
        {stat("Por inspeccionar", pendientes, "text-orange-600")}
        {stat("Inspeccionados", aprobados, "text-green-700")}
      </div>

      {cargasEmbarques.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="text-2xl mb-3">🔬</div>
          <div className="text-sm font-medium text-gray-700 mb-1">Sin embarques para inspeccionar</div>
          <div className="text-xs text-gray-400">Aparecerán aquí las cargas que salieron de Embarques</div>
        </div>
      ) : (
        <>
        <ColaTabs tab={tabQC} setTab={setTabQC} tabs={[
          { key: "pendientes", label: "Por inspeccionar", count: pendientesArr.length },
          { key: "historial", label: "Historial", count: resueltosArr.length },
        ]} />
        {listaQC.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-xs text-gray-400 italic">{tabQC === "pendientes" ? "No hay embarques por inspeccionar." : "Aún no hay embarques inspeccionados."}</div>
        ) : (
        <div className="grid grid-cols-1 gap-3">
          {listaQC.map((carga) => {
            const est = estadoDe(carga);
            const cfg = CALIDAD_ESTADOS[est];
            return (
              <div key={carga.id} className={`bg-white border-2 rounded-xl overflow-hidden ${est === "aprobado" ? "border-green-300" : est === "rechazado" ? "border-red-300" : "border-orange-200"}`}>
                <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                  <div className="flex flex-col"><span className="text-xs font-bold text-gray-700">{carga.fecha}</span><span className="text-xs text-gray-400">{carga.trailer?.fecha}</span></div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200">{carga.trailer?.dest || "—"}</span>
                  <div className="text-xs text-gray-500"><span className="font-medium">{carga.trailer?.chofer || "Sin chofer"}</span>{carga.trailer?.placaTracto && <span className="ml-1 font-mono text-gray-400">· {carga.trailer.placaTracto}</span>}</div>
                  {carga.calidad?.producto && (
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">🌱 {carga.calidad.producto}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${cfg.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}></span>{cfg.label}
                  </span>
                  {est !== "pendiente" && carga.calidad?.resueltoTs && (
                    <span className="text-xs text-gray-400">{carga.calidad.inspector || ""} · {carga.calidad.resueltoTs}</span>
                  )}
                  <div className="ml-auto">
                    <button onClick={() => abrir(carga)} className="text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700">
                      🔬 {est === "pendiente" ? "Inspeccionar" : "Ver / Editar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
        </>
      )}

      {/* ── Modal de inspección de calidad ── */}
      {cargaSel && insp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <div className="text-sm font-semibold text-gray-900">Inspección de calidad del embarque</div>
                <div className="text-xs text-gray-500 mt-0.5">{cargaSel.fecha} · {cargaSel.trailer?.dest || "—"} · {cargaSel.trailer?.chofer || "—"}</div>
              </div>
              <button onClick={cerrar} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Producto / Inspector / Lugar / Fecha */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={LBL}>Producto (define los defectos)</label>
                  <select className={INP} value={insp.producto} onChange={(e) => upd("producto", e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {productos.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LBL}>Inspector</label>
                  <select className={INP} value={insp.inspector} onChange={(e) => upd("inspector", e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {inspectoresCalidad.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LBL}>Lugar de inspección</label>
                  <select className={INP} value={insp.lugar} onChange={(e) => upd("lugar", e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {lugaresCalidad.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={insp.fecha} onChange={(e) => upd("fecha", e.target.value)} /></div>
              </div>

              {!insp.producto ? (
                <div className="text-center text-xs text-gray-400 italic py-8 border border-dashed border-gray-200 rounded-xl">Selecciona un producto para ver sus defectos.</div>
              ) : defectosProducto.length === 0 ? (
                <div className="text-center text-xs text-gray-400 italic py-8 border border-dashed border-gray-200 rounded-xl">Este producto no tiene defectos. Agrégalos en el catálogo 🔬 Defectos.</div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase">Defectos — {insp.producto}</div>
                    <div className="text-xs text-gray-500">{nConDefecto} con hallazgo</div>
                  </div>
                  <div className="space-y-4">
                    {Object.entries(CATS_QC).map(([catKey, catCfg]) => {
                      const defs = defectosProducto.filter((d) => d.cat === catKey);
                      if (!defs.length) return null;
                      return (
                        <div key={catKey}>
                          <div className={`text-xs font-semibold mb-1 ${catCfg.color}`}>{catCfg.label}</div>
                          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                            {defs.map((d) => {
                              const reg = insp.defectos[d.id] || { presente: false, notas: "", fotos: [] };
                              const catBorder = { calidad: "border-l-blue-400", condicion: "border-l-amber-400", plaga: "border-l-red-400" }[d.cat];
                              return (
                                <div key={d.id} className={`px-3 py-2 border-l-2 ${catBorder} ${reg.presente ? "bg-red-50/40" : ""}`}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-[160px]">
                                      <input type="checkbox" checked={!!reg.presente} onChange={(e) => updDefecto(d.id, "presente", e.target.checked)} className="accent-indigo-600" />
                                      <span className={`text-xs ${reg.presente ? "font-semibold text-gray-800" : "text-gray-600"}`}>{d.label}</span>
                                    </label>
                                    <input className={INP + " flex-1 min-w-[140px]"} value={reg.notas} onChange={(e) => updDefecto(d.id, "notas", e.target.value)} placeholder="Notas / % / observación" />
                                    <label className="cursor-pointer text-xs px-2 py-1.5 border border-indigo-200 rounded-md text-indigo-600 hover:bg-indigo-50 whitespace-nowrap" title="Agregar fotos">
                                      📷 Foto
                                      <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => subirFotos(d.id, e.target.files)} />
                                    </label>
                                  </div>
                                  {reg.fotos?.length > 0 && (
                                    <div className="flex gap-2 flex-wrap mt-2">
                                      {reg.fotos.map((src, idx) => (
                                        <div key={idx} className="relative">
                                          <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="w-14 h-14 object-cover rounded border border-gray-200" /></a>
                                          <button onClick={() => quitarFoto(d.id, idx)} className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 text-[10px]">✕</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className={LBL}>Observaciones / motivo de la decisión</label>
                <textarea rows={2} className={INP} value={insp.observaciones} onChange={(e) => upd("observaciones", e.target.value)} placeholder="Observaciones generales del embarque" />
              </div>

              {insp.estado !== "pendiente" && (
                <div className={`text-xs px-3 py-2 rounded-lg border ${CALIDAD_ESTADOS[insp.estado].color}`}>
                  Estado actual: <b>{CALIDAD_ESTADOS[insp.estado].label}</b>{insp.resueltoTs ? ` · ${insp.resueltoTs}` : ""}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-between items-center sticky bottom-0 bg-white">
              <button onClick={guardar} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">💾 Guardar (sin decidir)</button>
              <button onClick={() => resolver("aprobado")} className="text-xs px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">✓ Inspeccionar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Catálogo: Defectos por producto ── */}
      {catDef && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <div className="text-sm font-semibold text-gray-900">Catálogo de defectos por producto</div>
              <button onClick={() => setCatDef(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Selección / alta de producto */}
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className={LBL}>Producto</label>
                  <select className={INP} value={prodEditar} onChange={(e) => setCatProdSel(e.target.value)}>
                    {productos.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {prodEditar && <button onClick={() => delProd(prodEditar)} className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Eliminar producto</button>}
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1"><label className={LBL}>Nuevo producto</label><input className={INP} value={nuevoProd} onChange={(e) => setNuevoProd(e.target.value)} placeholder="p. ej. TOMATE" /></div>
                <button onClick={() => { addProd(nuevoProd); setCatProdSel(nuevoProd.trim().toUpperCase()); setNuevoProd(""); }} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">+ Agregar producto</button>
              </div>

              {/* Defectos del producto seleccionado */}
              {prodEditar && (
                <div className="border border-gray-200 rounded-lg">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-700">Defectos de {prodEditar} ({(defectosCalidad[prodEditar] || []).length})</div>
                  <div className="divide-y divide-gray-100">
                    {(defectosCalidad[prodEditar] || []).map((d) => (
                      <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                        <input value={d.label} onChange={(e) => updDefLabel(prodEditar, d.id, e.target.value)} className={INP + " flex-1"} />
                        <select value={d.cat} onChange={(e) => updDefCat(prodEditar, d.id, e.target.value)} className="text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white">
                          {Object.entries(CATS_QC).map(([k, cfg]) => <option key={k} value={k}>{cfg.label}</option>)}
                        </select>
                        <button onClick={() => delDef(prodEditar, d.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2">
                    <button onClick={() => addDef(prodEditar)} className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar defecto</button>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end sticky bottom-0 bg-white">
              <button onClick={() => setCatDef(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Catálogo: Inspectores ── */}
      {catInsp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Inspectores de calidad</div>
              <button onClick={() => setCatInsp(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              {inspectoresCalidad.map((x, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={x} onChange={(e) => updInspector(i, e.target.value)} className={INP} />
                  <button onClick={() => delInspector(i)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                </div>
              ))}
              <button onClick={addInspector} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar inspector</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatInsp(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Catálogo: Lugares de inspección ── */}
      {catLug && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Lugares de inspección</div>
              <button onClick={() => setCatLug(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              {lugaresCalidad.map((x, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={x} onChange={(e) => updLugar(i, e.target.value)} className={INP} />
                  <button onClick={() => delLugar(i)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                </div>
              ))}
              <button onClick={addLugar} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar lugar</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatLug(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
