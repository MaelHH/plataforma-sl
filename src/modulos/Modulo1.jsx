import { useState } from "react";

const DIAS = ["Lun 26", "Mar 27", "Mié 28", "Jue 29", "Vie 30", "Sáb 31", "Dom 1"];

const PRESETS_BP = [
  { pres: "Bell Pepper XL 11 KG", dest: "WM MEX", dias: [56, 0, 0, 0, 224, 0, 0] },
  { pres: "Bell Pepper 55 CT WM USA", dest: "USA Texas", dias: [0, 550, 50, 0, 200, 1000, 0] },
  { pres: "Bell Pepper 65 CT WM USA", dest: "USA Texas", dias: [0, 2550, 0, 0, 0, 0, 0] },
  { pres: "Bell Pepper Bolsa 8x6", dest: "McAllen", dias: [0, 0, 1500, 0, 1500, 0, 0] },
];

const PRESETS_EJ = [
  { pres: "Ejote Walmart 1.7 USA", dest: "USA Texas", dias: [1200, 500, 0, 0, 200, 1350, 0] },
  { pres: "Ejote Walmart 1.7 USA", dest: "USA Nogales", dias: [0, 1350, 0, 0, 350, 0, 0] },
  { pres: "Ejote Conv. 2 bolsas 5lbs", dest: "McAllen", dias: [0, 2304, 0, 0, 0, 0, 0] },
  { pres: "Ejote Market Side WM", dest: "WM MEX", dias: [220, 0, 0, 0, 220, 220, 0] },
];

const DC = {
  "WM MEX": "bg-orange-100 text-orange-800",
  "WM Culiacán": "bg-blue-100 text-blue-800",
  "USA Texas": "bg-orange-100 text-orange-800",
  "USA Nogales": "bg-green-100 text-green-800",
  "McAllen": "bg-blue-100 text-blue-800",
  "Chihuahua": "bg-teal-100 text-teal-800",
};

export default function Modulo1() {
  const [tab, setTab] = useState("bp");
  const [imagen, setImagen] = useState(null);
  const [dataBP, setDataBP] = useState(PRESETS_BP);
  const [dataEJ, setDataEJ] = useState(PRESETS_EJ);

  const data = tab === "bp" ? dataBP : dataEJ;
  const setData = tab === "bp" ? setDataBP : setDataEJ;
  const totalCajas = data.reduce((a, r) => a + r.dias.reduce((b, c) => b + c, 0), 0);

  const subirImagen = (e) => {
    const file = e.target.files[0];
    if (file) setImagen(URL.createObjectURL(file));
  };

  const updRow = (i, campo, val) => {
    setData((prev) => prev.map((r, j) => (j === i ? { ...r, [campo]: val } : r)));
  };
  const updDia = (i, di, val) => {
    setData((prev) => prev.map((r, j) => (j === i ? { ...r, dias: r.dias.map((d, k) => (k === di ? parseInt(val) || 0 : d)) } : r)));
  };
  const addRow = () => setData((prev) => [...prev, { pres: "", dest: "USA Texas", dias: [0, 0, 0, 0, 0, 0, 0] }]);
  const delRow = (i) => setData((prev) => prev.filter((_, j) => j !== i));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Módulo 1 — Programa SL Produce</h1>
          <p className="text-sm text-gray-500 mt-0.5">Semana 22 · 26 mayo – 1 jun 2026 · José Carlos Preciado</p>
        </div>
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
              const total = r.dias.reduce((a, b) => a + b, 0);
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-2 py-1 border-b border-gray-100">
                    <input value={r.pres} onChange={(e) => updRow(i, "pres", e.target.value)} placeholder="Presentación"
                      className="w-full text-xs px-2 py-1 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded-md focus:outline-none" />
                  </td>
                  <td className="px-2 py-1 border-b border-gray-100">
                    <select value={r.dest} onChange={(e) => updRow(i, "dest", e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded-full border-transparent focus:outline-none ${DC[r.dest] || "bg-gray-100 text-gray-600"}`}>
                      {Object.keys(DC).map((d) => <option key={d}>{d}</option>)}
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
    </div>
  );
}