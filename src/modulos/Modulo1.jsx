import { useState } from "react";
import { ClipboardList, X, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useDatos, ORIGENES, DESTINOS_ALL, COLORES_CAT, nuevoId, calcularDias, etiquetaSemana, moverSemana } from "../store/datos";
import SearchSelect from "../components/SearchSelect";

// Lunes de la semana actual en formato YYYY-MM-DD
import { lunesActual } from "../utils/fecha";

// Selector buscable de presentación (filtrado por cultivo)
function SelectorPresentacion({ value, opciones, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const sel = opciones.find((c) => c.id === value);
  const filtrados = opciones.filter((c) => c.label.toLowerCase().includes(busqueda.toLowerCase()));
  return (
    <div className="relative">
      <button onClick={() => setAbierto(!abierto)}
        className="w-full text-left text-xs px-2 py-1 border border-gray-200 hover:border-blue-400 rounded-md bg-white truncate">
        {sel ? sel.label : "— Elegir —"}
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setAbierto(false); setBusqueda(""); }}></div>
          <div className="absolute z-20 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
            <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar presentación..."
              className="text-xs px-3 py-2 border-b border-gray-100 focus:outline-none" />
            <div className="overflow-y-auto">
              {filtrados.length === 0 ? (
                <div className="text-xs text-gray-400 italic px-3 py-2">Sin resultados</div>
              ) : (
                filtrados.map((c) => (
                  <button key={c.id} onClick={() => { onChange(c.id); setAbierto(false); setBusqueda(""); }}
                    className={`w-full text-left text-xs px-3 py-1.5 hover:bg-blue-50 ${c.id === value ? "bg-blue-100 font-medium" : ""}`}>
                    {c.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Modulo1() {
  const { catalogo, setCatalogo, cultivos, programa, setPrograma } = useDatos();
  const [semana, setSemana] = useState(lunesActual());
  const [tab, setTab] = useState(cultivos[0]?.id || "BP");
  const [catAbierto, setCatAbierto] = useState(false);

  const dias = calcularDias(semana);
  const filasSemana = programa[semana] || [];
  const filasTab = filasSemana.map((f, idxGlobal) => ({ ...f, idxGlobal })).filter((f) => {
    const pres = catalogo.find((c) => c.id === f.presId);
    return pres ? pres.cultivo === tab : f.cultivo === tab;
  });

  const presDelCultivo = catalogo.filter((c) => c.cultivo === tab);

  // Total de cajas de la pestaña actual
  const totalCajas = filasTab.reduce((a, f) => a + f.dias.reduce((b, c) => b + c, 0), 0);

  // ── Guardar en el store ──
  const setFilas = (nuevasFilasSemana) => setPrograma((prev) => ({ ...prev, [semana]: nuevasFilasSemana }));

  const addFila = () => {
    const nueva = { presId: presDelCultivo[0]?.id || "", cultivo: tab, origen: ORIGENES[0], dest: "USA Texas", dias: [0, 0, 0, 0, 0, 0, 0] };
    setFilas([...(programa[semana] || []), nueva]);
  };
  const updFila = (idxGlobal, campo, val) =>
    setFilas((programa[semana] || []).map((f, j) => (j === idxGlobal ? { ...f, [campo]: val } : f)));
  const updDia = (idxGlobal, di, val) =>
    setFilas((programa[semana] || []).map((f, j) => (j === idxGlobal ? { ...f, dias: f.dias.map((d, k) => (k === di ? parseInt(val) || 0 : d)) } : f)));
  const delFila = (idxGlobal) =>
    setFilas((programa[semana] || []).filter((_, j) => j !== idxGlobal));

  // ── Editor de catálogo ──
  const updCat = (id, campo, val) => setCatalogo((prev) => prev.map((c) => (c.id === id ? { ...c, [campo]: (campo === "cajasPorParrilla" || campo === "librasPorCaja") ? (parseInt(val) || 0) : val } : c)));
  const addCat = () => {
    const id = nuevoId("PRES_");
    const color = COLORES_CAT[catalogo.length % COLORES_CAT.length];
    setCatalogo((prev) => [...prev, { id, label: "Nueva presentación", color, cajasPorParrilla: 0, cultivo: tab, librasPorCaja: 0 }]);
  };
  const delCat = (id) => setCatalogo((prev) => prev.filter((c) => c.id !== id));

  const DC_TAB = { orange: "bg-orange-100 text-orange-700", green: "bg-green-100 text-green-700", blue: "bg-blue-100 text-blue-700", purple: "bg-purple-100 text-purple-700", teal: "bg-teal-100 text-teal-700" };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Programa Semanal</h1>
          <p className="text-sm text-gray-500 mt-0.5">José Carlos Preciado · planeación de cajas por presentación</p>
        </div>
        <button onClick={() => setCatAbierto(true)} className="inline-flex items-center gap-1 text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
          <ClipboardList size={14} /> Catálogo de presentaciones
        </button>
      </div>

      {/* Selector de semana */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex items-center justify-between">
        <button onClick={() => setSemana(moverSemana(semana, -1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600"><span className="inline-flex items-center gap-1"><ChevronLeft size={16} /> Anterior</span></button>
        <div className="text-center">
          <div className="text-xs text-gray-400">Semana del programa</div>
          <div className="text-sm font-semibold text-gray-900">{etiquetaSemana(semana)}</div>
          <input type="date" value={semana} onChange={(e) => { if (e.target.value) setSemana(e.target.value); }}
            className="text-xs text-gray-400 mt-1 border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={() => setSemana(moverSemana(semana, 1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600"><span className="inline-flex items-center gap-1">Siguiente <ChevronRight size={16} /></span></button>
      </div>

      {/* Pestañas de cultivo */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {cultivos.map((cu) => (
          <button key={cu.id} onClick={() => setTab(cu.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === cu.id ? (DC_TAB[cu.color] || "bg-gray-100 text-gray-700") : "bg-white text-gray-500 border border-gray-200"}`}>
            {cu.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 inline-block">
        <div className="text-xs text-gray-500">Total cajas semana · {cultivos.find((c) => c.id === tab)?.label}</div>
        <div className="text-2xl font-semibold text-gray-900">{totalCajas.toLocaleString()}</div>
      </div>

      {/* Tabla editable */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "950px" }}>
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100" style={{ minWidth: "180px" }}>Presentación</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Origen</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Destino</th>
              {dias.map((d) => <th key={d} className="text-center px-1 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">{d}</th>)}
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Total</th>
              <th className="border-b border-gray-100"></th>
            </tr>
          </thead>
          <tbody>
            {filasTab.length === 0 ? (
              <tr><td colSpan={dias.length + 5} className="text-center text-xs text-gray-400 italic py-6">Sin presentaciones esta semana. Agrega una fila abajo.</td></tr>
            ) : (
              filasTab.map((r) => {
                const total = r.dias.reduce((a, b) => a + b, 0);
                return (
                  <tr key={r.idxGlobal} className="hover:bg-gray-50">
                    <td className="px-2 py-1 border-b border-gray-100" style={{ minWidth: "180px" }}>
                      <SelectorPresentacion value={r.presId} opciones={presDelCultivo} onChange={(id) => updFila(r.idxGlobal, "presId", id)} />
                    </td>
                    <td className="px-2 py-1 border-b border-gray-100">
                      <SearchSelect value={r.origen} onChange={(v) => updFila(r.idxGlobal, "origen", v)}
                        className="text-xs px-2 py-1 rounded-md border border-gray-200 focus:border-blue-400 focus:outline-none bg-white"
                        options={ORIGENES.map((o) => ({ value: o, label: o }))} />
                    </td>
                    <td className="px-2 py-1 border-b border-gray-100">
                      <SearchSelect value={r.dest} onChange={(v) => updFila(r.idxGlobal, "dest", v)}
                        className="text-xs px-2 py-1 rounded-md border border-gray-200 focus:border-blue-400 focus:outline-none bg-white"
                        options={DESTINOS_ALL.filter((d) => d !== "Sin asignar").map((d) => ({ value: d, label: d }))} />
                    </td>
                    {r.dias.map((c, j) => (
                      <td key={j} className="px-0.5 py-1 border-b border-gray-100">
                        <input type="number" value={c || ""} onChange={(e) => updDia(r.idxGlobal, j, e.target.value)} placeholder="0"
                          className="w-14 text-center text-xs px-1 py-1 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                      </td>
                    ))}
                    <td className="text-right px-3 py-1 text-xs font-semibold border-b border-gray-100">{total.toLocaleString()}</td>
                    <td className="px-2 py-1 border-b border-gray-100 text-center">
                      <button onClick={() => delFila(r.idxGlobal)} className="inline-flex items-center justify-center text-gray-300 hover:text-red-500"><X size={14} /></button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="p-2 border-t border-gray-100">
          <button onClick={addFila} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium"><Plus size={14} /> Agregar fila</button>
        </div>
      </div>

      {/* Modal catálogo */}
      {catAbierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900">Catálogo de presentaciones</div>
                <div className="text-xs text-gray-500 mt-0.5">Cajas por parrilla y libras por caja alimentan los cálculos de toda la plataforma</div>
              </div>
              <button onClick={() => setCatAbierto(false)} className="inline-flex items-center justify-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 font-medium">Presentación</th>
                    <th className="text-center py-2 font-medium w-28">Cultivo</th>
                    <th className="text-center py-2 font-medium w-28">Cajas / parrilla</th>
                    <th className="text-center py-2 font-medium w-28">Libras / caja</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {catalogo.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50">
                      <td className="py-1.5">
                        <input value={c.label} onChange={(e) => updCat(c.id, "label", e.target.value)}
                          className="w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                      </td>
                      <td className="py-1.5 text-center">
                        <SearchSelect value={c.cultivo || ""} onChange={(v) => updCat(c.id, "cultivo", v)}
                          className="text-xs px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none bg-white"
                          options={cultivos.map((cu) => ({ value: cu.id, label: cu.label }))} />
                      </td>
                      <td className="py-1.5 text-center">
                        <input type="number" value={c.cajasPorParrilla} onChange={(e) => updCat(c.id, "cajasPorParrilla", e.target.value)}
                          className="w-20 text-center text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                      </td>
                      <td className="py-1.5 text-center">
                        <input type="number" value={c.librasPorCaja || 0} onChange={(e) => updCat(c.id, "librasPorCaja", e.target.value)}
                          className="w-20 text-center text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                      </td>
                      <td className="py-1.5 text-center">
                        <button onClick={() => delCat(c.id)} className="inline-flex items-center justify-center text-gray-300 hover:text-red-500"><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addCat} className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium"><Plus size={14} /> Agregar presentación</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatAbierto(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}