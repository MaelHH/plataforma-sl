import { useState } from "react";
import { useDatos, ORIGEN, ORIGENES, DESTINOS_ALL, DC, STATUS_CFG, EMPTY_TRAILER, calcularDias, etiquetaSemana, moverSemana } from "../store/datos";

let nextId = 100;
let nextLineaId = 1;

function lunesActual() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  hoy.setDate(hoy.getDate() + diff);
  return hoy.toISOString().slice(0, 10);
}

export default function Modulo3() {
  const { trailers, setTrailers, requerimientoGen, lineas, setLineas } = useDatos();
  const [semana, setSemana] = useState(lunesActual());
  const dias = calcularDias(semana);
  const [diaFil, setDiaFil] = useState(dias[0]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [catLineas, setCatLineas] = useState(false);

  const reqSemana = requerimientoGen[semana] || [];

  const hoy = trailers.filter((t) => t.fecha === diaFil);
  const reqsHoy = reqSemana.filter((r) => r.fecha === diaFil);
  const destinos = [...new Set(reqsHoy.map((r) => r.dest))];

  const totalSol = reqsHoy.reduce((a, r) => a + r.sol, 0);
  const sinAsignar = hoy.filter((t) => !t.dest || t.dest === "Sin asignar").length;
  const enInstal = hoy.filter((t) => t.status === "en_instalaciones").length;
  const enRuta = hoy.filter((t) => t.status === "en_ruta").length;

  const resumenSemana = {};
  reqSemana.forEach((r) => {
    if (!resumenSemana[r.dest]) resumenSemana[r.dest] = { dest: r.dest, total: 0, contrato: 0, abierto: 0 };
    resumenSemana[r.dest].total += r.sol;
    if (r.tipo === "M. Abierto") resumenSemana[r.dest].abierto += r.sol;
    else resumenSemana[r.dest].contrato += r.sol;
  });
  const resumenArr = Object.values(resumenSemana).sort((a, b) => b.total - a.total);
  const totalSemana = resumenArr.reduce((a, r) => a + r.total, 0);

  const addTrailer = () => {
    const t = { ...EMPTY_TRAILER, id: nextId++, fecha: diaFil, origen: ORIGEN, dest: "Sin asignar", status: "esperando" };
    setTrailers((prev) => [...prev, t]);
    setForm({ ...t });
    setModal(t.id);
  };
  const openModal = (t) => { setForm({ ...t }); setModal(t.id); };
  const saveForm = () => { setTrailers((prev) => prev.map((t) => (t.id === modal ? { ...form } : t))); setModal(null); };
  const setDest = (id, dest) => setTrailers((prev) => prev.map((t) => (t.id === id ? { ...t, dest } : t)));
  const setStatus = (id, status) => setTrailers((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  const delTrailer = (id) => {
    if (window.confirm("¿Eliminar este trailer? Esta acción no se puede deshacer.")) {
      setTrailers((prev) => prev.filter((t) => t.id !== id));
    }
  };

  // Al elegir una línea del catálogo, auto-llena los 3 datos
  const elegirLinea = (lineaId) => {
    const l = lineas.find((x) => x.id === lineaId);
    if (l) setForm((f) => ({ ...f, linea: l.linea, contacto: l.contacto, numero: l.numero }));
    else setForm((f) => ({ ...f, linea: "", contacto: "", numero: "" }));
  };

  // ── Editor de catálogo de líneas ──
  const updLinea = (id, campo, val) => setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, [campo]: val } : l)));
  const addLinea = () => setLineas((prev) => [...prev, { id: "LN_" + nextLineaId++, linea: "Nueva línea", contacto: "", numero: "" }]);
  const delLinea = (id) => setLineas((prev) => prev.filter((l) => l.id !== id));

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";

  function MiniCard({ t, showDestSel }) {
    const s = STATUS_CFG[t.status] || STATUS_CFG.esperando;
    const dc = DC[t.dest] || DC["Sin asignar"];
    const has = t.chofer || t.placaTracto || t.linea;
    return (
      <div className={`rounded-xl border ${s.card} p-2.5`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${s.dot}`}></div>
            <span className="text-xs font-semibold text-gray-700">{s.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">{(t.origen || ORIGEN).split(",")[0]}</span>
            <span className="text-gray-300 text-xs">→</span>
            {showDestSel ? (
              <select value={t.dest || "Sin asignar"} onChange={(e) => setDest(t.id, e.target.value)}
                className={`text-xs font-medium px-1.5 py-0.5 rounded-full border cursor-pointer ${dc}`}>
                {DESTINOS_ALL.map((d) => <option key={d}>{d}</option>)}
              </select>
            ) : (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${dc}`}>{t.dest}</span>
            )}
          </div>
        </div>
        {has ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mb-2 text-xs">
            {t.linea && <div className="truncate font-medium text-gray-800">{t.linea}</div>}
            {t.chofer && <div className="truncate">🧑 {t.chofer}</div>}
            {t.placaTracto && <div>🚛 {t.placaTracto}</div>}
            {t.flete && <div>💵 <span className="font-semibold text-green-700">${t.flete}</span></div>}
          </div>
        ) : (
          <div className="text-xs text-gray-400 mb-2 italic">Sin datos — edita la ficha</div>
        )}
        <div className="flex gap-1 flex-wrap items-center">
          <button onClick={() => openModal(t)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600">✏️ Editar</button>
          <button onClick={() => delTrailer(t.id)} className="text-xs px-2 py-1 border border-red-200 rounded-lg bg-white hover:bg-red-50 text-red-500">🗑️</button>
          {t.status === "en_ruta" ? (
            <span className="text-xs px-2 py-1 bg-green-100 border border-green-300 text-green-700 rounded-lg font-semibold">🚛 En ruta</span>
          ) : (
            <select value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}
              className={`text-xs px-2 py-1 rounded-lg border font-medium ${t.status === "en_instalaciones" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-600"}`}>
              <option value="esperando">⏳ Esperando</option>
              <option value="en_instalaciones">📍 En instalaciones</option>
            </select>
          )}
        </div>
      </div>
    );
  }

  // ID de línea actual del form (para que el dropdown muestre la seleccionada)
  const lineaActualId = lineas.find((l) => l.linea === form.linea)?.id || "";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Tablero de Tráfico</h1>
          <p className="text-sm text-gray-500 mt-0.5">Mónica · asignación y seguimiento de trailers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatLineas(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
            ⚙️ Catálogo de líneas
          </button>
          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">MO</div>
          <span className="text-sm font-medium text-gray-700">Mónica</span>
        </div>
      </div>

      {/* Selector de semana */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex items-center justify-between">
        <button onClick={() => setSemana(moverSemana(semana, -1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600">◀ Anterior</button>
        <div className="text-center">
          <div className="text-xs text-gray-400">Semana</div>
          <div className="text-sm font-semibold text-gray-900">{etiquetaSemana(semana)}</div>
        </div>
        <button onClick={() => setSemana(moverSemana(semana, 1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600">Siguiente ▶</button>
      </div>

      {/* RESUMEN EJECUTIVO de la semana */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold text-gray-900">📋 Resumen de la semana — qué conseguir</div>
            <div className="text-xs text-gray-500 mt-0.5">Requerimiento total enviado desde Cálculo de Trailers</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-700">{totalSemana}</div>
            <div className="text-xs text-gray-500">trailers en total</div>
          </div>
        </div>
        {resumenArr.length === 0 ? (
          <div className="text-xs text-gray-400 italic text-center py-3 bg-white/60 rounded-lg">
            Aún no hay requerimiento. Genéralo desde Cálculo de Trailers (botón "Generar requerimiento").
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {resumenArr.map((r) => (
              <div key={r.dest} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[r.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{r.dest}</span>
                  <span className="text-lg font-bold text-gray-900">{r.total}</span>
                </div>
                <div className="flex gap-2 text-xs text-gray-500">
                  {r.contrato > 0 && <span>📄 {r.contrato} contrato</span>}
                  {r.abierto > 0 && <span className="text-purple-600">🔓 {r.abierto} abierto</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filtro de días */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {dias.map((d) => (
          <button key={d} onClick={() => setDiaFil(d)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${diaFil === d ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}>
            {d}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { l: "Solicitados (día)", v: totalSol, c: "text-gray-900" },
          { l: "Sin asignar", v: sinAsignar, c: "text-gray-500" },
          { l: "En instalaciones", v: enInstal, c: "text-blue-700" },
          { l: "En ruta", v: enRuta, c: "text-green-700" },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="text-xs text-gray-500 mb-1">{s.l}</div>
            <div className={`text-xl font-semibold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Pool */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">Trailers registrados · {diaFil}</span>
          <button onClick={addTrailer} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700">+ Registrar trailer</button>
        </div>
        {hoy.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-6 italic">Ningún trailer registrado este día</div>
        ) : (
          <div className="p-3 grid grid-cols-2 gap-2">{hoy.map((t) => <MiniCard key={t.id} t={t} showDestSel={true} />)}</div>
        )}
      </div>

      {/* Bloques por destino */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
        <span className="text-sm font-semibold text-gray-800">Por destino · {diaFil}</span>
      </div>
      {destinos.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center text-xs text-gray-400 italic">
          Sin requerimiento para este día
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {destinos.map((dest) => {
            const sol = reqsHoy.filter((r) => r.dest === dest).reduce((a, r) => a + r.sol, 0);
            const tD = hoy.filter((t) => t.dest === dest);
            const pct = sol > 0 ? Math.min(Math.round((tD.length / sol) * 100), 100) : 0;
            const dc = DC[dest] || "bg-gray-100 text-gray-600 border-gray-200";
            return (
              <div key={dest} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${dc}`}>{dest}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-gray-600 font-medium">{tD.length}/{sol}</span>
                    <div className="w-20 h-1.5 bg-gray-200 rounded overflow-hidden">
                      <div className={`h-full rounded ${pct >= 100 ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  {tD.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-3 italic">Sin trailers asignados</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">{tD.map((t) => <MiniCard key={t.id} t={t} showDestSel={false} />)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal ficha trailer */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Ficha del trailer</div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Ruta</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500 block mb-0.5">Origen</label>
                    <select className={INP} value={form.origen || ORIGEN} onChange={(e) => setForm((f) => ({ ...f, origen: e.target.value }))}>
                      {ORIGENES.map((o) => <option key={o}>{o}</option>)}
                    </select></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Destino</label>
                    <select className={INP} value={form.dest || "Sin asignar"} onChange={(e) => setForm((f) => ({ ...f, dest: e.target.value }))}>
                      {DESTINOS_ALL.map((d) => <option key={d}>{d}</option>)}
                    </select></div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Línea de transporte</div>
                <div className="mb-2">
                  <label className="text-xs text-gray-500 block mb-0.5">Elegir del catálogo</label>
                  <select className={INP} value={lineaActualId} onChange={(e) => elegirLinea(e.target.value)}>
                    <option value="">— Selecciona una línea —</option>
                    {lineas.map((l) => <option key={l.id} value={l.id}>{l.linea}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-xs text-gray-500 block mb-0.5">Línea</label>
                    <input className={INP + " bg-gray-50"} value={form.linea || ""} readOnly /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Contacto</label>
                    <input className={INP + " bg-gray-50"} value={form.contacto || ""} readOnly /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Número</label>
                    <input className={INP + " bg-gray-50"} value={form.numero || ""} readOnly /></div>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-500 block mb-0.5">Flete $</label>
                  <input className={INP} value={form.flete || ""} onChange={(e) => setForm((f) => ({ ...f, flete: e.target.value }))} />
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Chofer y unidad</div>
                <div className="grid grid-cols-2 gap-2">
                  {[["chofer", "Chofer"], ["telefono", "Teléfono"], ["placaTracto", "Placas tracto"], ["placaCaja", "Placas caja"], ["economicoCaja", "Económico"], ["licencia", "Licencia"]].map(([k, l]) => (
                    <div key={k}><label className="text-xs text-gray-500 block mb-0.5">{l}</label>
                      <input className={INP} value={form[k] || ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={saveForm} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Guardar ficha</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal catálogo de líneas */}
      {catLineas && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900">Catálogo de líneas de transporte</div>
                <div className="text-xs text-gray-500 mt-0.5">Registra las líneas para elegirlas al llenar la ficha del trailer</div>
              </div>
              <button onClick={() => setCatLineas(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 font-medium">Línea</th>
                    <th className="text-left py-2 font-medium">Contacto</th>
                    <th className="text-left py-2 font-medium">Número</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50">
                      <td className="py-1.5 pr-2">
                        <input value={l.linea} onChange={(e) => updLinea(l.id, "linea", e.target.value)}
                          className="w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={l.contacto} onChange={(e) => updLinea(l.id, "contacto", e.target.value)}
                          className="w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={l.numero} onChange={(e) => updLinea(l.id, "numero", e.target.value)}
                          className="w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                      </td>
                      <td className="py-1.5 text-center">
                        <button onClick={() => delLinea(l.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addLinea} className="mt-3 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar línea</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatLineas(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}