import { useState } from "react";
import { useDatos, DESTINOS_ALL, COLORES_CAT } from "../store/datos";

const DIAS = ["Lun 26", "Mar 27", "Mié 28", "Jue 29", "Vie 30", "Sáb 31", "Dom 1"];

const PRESETS_BP = [
  { presId: "BP_XL_11KG", dest: "WM MEX", dias: [56, 0, 0, 0, 224, 0, 0] },
  { presId: "BP_55CT", dest: "USA Texas", dias: [0, 550, 50, 0, 200, 1000, 0] },
  { presId: "BP_65CT", dest: "USA Texas", dias: [0, 2550, 0, 0, 0, 0, 0] },
  { presId: "BP_BOLSA8X6", dest: "McAllen", dias: [0, 0, 1500, 0, 1500, 0, 0] },
];

const PRESETS_EJ = [
  { presId: "EJ_WM17", dest: "USA Texas", dias: [1200, 500, 0, 0, 200, 1350, 0] },
  { presId: "EJ_WM17", dest: "USA Nogales", dias: [0, 1350, 0, 0, 350, 0, 0] },
  { presId: "EJ_CONV5LBS", dest: "McAllen", dias: [0, 2304, 0, 0, 0, 0, 0] },
  { presId: "EJ_MKT_WM", dest: "WM MEX", dias: [220, 0, 0, 0, 220, 220, 0] },
];

const DC = {
  "WM MEX": "bg-orange-100 text-orange-800",
  "WM Culiacán": "bg-blue-100 text-blue-800",
  "USA Texas": "bg-orange-100 text-orange-800",
  "USA Nogales": "bg-green-100 text-green-800",
  "McAllen": "bg-blue-100 text-blue-800",
  "Chihuahua": "bg-teal-100 text-teal-800",
};

let nextCatId = 1;

function SelectorPresentacion({ value, catalogo, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const sel = catalogo.find((c) => c.id === value);
  const filtrados = catalogo.filter((c) => c.label.toLowerCase().includes(busqueda.toLowerCase()));

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
  const { catalogo, setCatalogo } = useDatos();
  const [tab, setTab] = useState("bp");
  const [imagen, setImagen] = useState(null);
  const [dataBP, setDataBP] = useState(PRESETS_BP);
  const [dataEJ, setDataEJ] = useState(PRESETS_EJ);
  const [catAbierto, setCatAbierto] = useState(false);

  const data = tab === "bp" ? dataBP : dataEJ;
  const setData = tab === "bp" ? setDataBP : setDataEJ;

  const cajasDeFila = (r) => r.dias.reduce((b, c) => b + c, 0);
  const totalCajas = data.reduce((a, r) => a + cajasDeFila(r), 0);

  const subirImagen = (e) => {
    const file = e.target.files[0];
    if (file) setImagen(URL.createObjectURL(file));
  };

  const updRow = (i, campo, val) => setData((prev) => prev.map((r, j) => (j === i ? { ...r, [campo]: val } : r)));
  const updDia = (i, di, val) => setData((prev) => prev.map((r, j) => (j === i ? { ...r, dias: r.dias.map((d, k) => (k === di ? parseInt(val) || 0 : d)) } : r)));
  const addRow = () => setData((prev) => [...prev, { presId: catalogo[0]?.id || "", dest: "USA Texas", dias: [0, 0, 0, 0, 0, 0, 0] }]);
  const delRow = (i) => setData((prev) => prev.filter((_, j) => j !== i));

  const updCat = (id, campo, val) => setCatalogo((prev) => prev.map((c) => (c.id === id ? { ...c, [campo]: campo === "cajasPorParrilla" ? (parseInt(val) || 0) : val } : c)));
  const addCat = () => {
    const id = "NUEVO_" + nextCatId++;
    const color = COLORES_CAT[catalogo.length % COLORES_CAT.length];
    setCatalogo((prev) => [...prev, { id, label: "Nueva presentación", color, cajasPorParrilla: 0 }]);
  };
  const delCat = (id) => setCatalogo((prev) => prev.filter((c) => c.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Módulo 1 — Programa SL Produce</h1>
          <p className="text-sm text-gray-500 mt-0.5">Semana 22 · 26 mayo – 1 jun 2026 · José Carlos Preciado</p>
        </div>
        <button onClick={() => setCatAbierto(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
          ⚙️ Catálogo de presentaciones
        </button>
      </div>

      {/* Subir imagen */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parrilla recibida (WhatsApp / Excel)</div>
          <label className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 cursor-pointer">
            📷 Subir imagen
            <input type="file" accept="image/*" onChange={subirImagen} className="hidden" />
          </label>
        </div>
        {imagen ? (
          <div className="flex items-start gap-3">
            <img src={imagen} alt="Parrilla" className="max-h-48 rounded-lg border border-gray-200" />
            <div className="text-xs text-gray-400 flex-1">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700">
                🤖 <span className="font-semibold">Lectura automática con IA</span> — se activará al conectar el backend. Por ahora ajusta la tabla manualmente abajo.
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic text-center py-4 border border-dashed border-gray-200 rounded-lg">
            Sube la foto o screenshot del programa que manda José Carlos
          </div>
        )}
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab("bp")} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === "bp" ? "bg-orange-100 text-orange-700" : "bg-white text-gray-500 border border-gray-200"}`}>Bell Pepper SL</button>
        <button onClick={() => setTab("ej")} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === "ej" ? "bg-green-100 text-green-700" : "bg-white text-gray-500 border border-gray-200"}`}>SL Agrícola Ejote</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 inline-block">
        <div className="text-xs text-gray-500">Total cajas semana</div>
        <div className="text-2xl font-semibold text-gray-900">{totalCajas.toLocaleString()}</div>
      </div>

      {/* Tabla editable */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "800px" }}>
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Presentación</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Destino</th>
              {DIAS.map((d) => <th key={d} className="text-center px-1 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">{d}</th>)}
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Total</th>
              <th className="border-b border-gray-100"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const total = cajasDeFila(r);
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-2 py-1 border-b border-gray-100" style={{ minWidth: "180px" }}>
                    <SelectorPresentacion value={r.presId} catalogo={catalogo} onChange={(id) => updRow(i, "presId", id)} />
                  </td>
                  <td className="px-2 py-1 border-b border-gray-100">
                    <select value={r.dest} onChange={(e) => updRow(i, "dest", e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded-full border-transparent focus:outline-none ${DC[r.dest] || "bg-gray-100 text-gray-600"}`}>
                      {DESTINOS_ALL.filter((d) => d !== "Sin asignar").map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </td>
                  {r.dias.map((c, j) => (
                    <td key={j} className="px-0.5 py-1 border-b border-gray-100">
                      <input type="number" value={c || ""} onChange={(e) => updDia(i, j, e.target.value)} placeholder="0"
                        className="w-14 text-center text-xs px-1 py-1 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                    </td>
                  ))}
                  <td className="text-right px-3 py-1 text-xs font-semibold border-b border-gray-100">{total.toLocaleString()}</td>
                  <td className="px-2 py-1 border-b border-gray-100 text-center">
                    <button onClick={() => delRow(i)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-2 border-t border-gray-100">
          <button onClick={addRow} className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar fila</button>
        </div>
      </div>

      {/* Modal catálogo */}
      {catAbierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900">Catálogo de presentaciones</div>
                <div className="text-xs text-gray-500 mt-0.5">Las cajas por parrilla alimentan el cálculo de trailers en toda la plataforma</div>
              </div>
              <button onClick={() => setCatAbierto(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 font-medium">Presentación</th>
                    <th className="text-center py-2 font-medium w-32">Cajas / parrilla</th>
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
                        <input type="number" value={c.cajasPorParrilla} onChange={(e) => updCat(c.id, "cajasPorParrilla", e.target.value)}
                          className="w-24 text-center text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                      </td>
                      <td className="py-1.5 text-center">
                        <button onClick={() => delCat(c.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addCat} className="mt-3 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar presentación</button>
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