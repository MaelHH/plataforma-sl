import { useState } from "react";

const PT = 30;
const ORIGEN = "Los Mochis, Sinaloa";
const FECHAS = ["Lun 26", "Mar 27", "Mié 28", "Jue 29", "Vie 30", "Sáb 31", "Dom 1"];

const rawData = [
  { dest: "WM MEX", fecha: "Lun 26", cajas: 56, cxp: 20 },
  { dest: "USA Texas", fecha: "Mar 27", cajas: 3100, cxp: 48 },
  { dest: "USA Nogales", fecha: "Mar 27", cajas: 1450, cxp: 48 },
  { dest: "McAllen", fecha: "Mar 27", cajas: 2304, cxp: 12 },
  { dest: "USA Nogales", fecha: "Mié 28", cajas: 400, cxp: 48 },
  { dest: "McAllen", fecha: "Mié 28", cajas: 1500, cxp: 48 },
  { dest: "USA Texas", fecha: "Vie 30", cajas: 400, cxp: 48 },
  { dest: "USA Texas", fecha: "Sáb 31", cajas: 1000, cxp: 48 },
];

const DC = {
  "WM MEX": "bg-orange-100 text-orange-800",
  "USA Texas": "bg-orange-100 text-orange-800",
  "USA Nogales": "bg-green-100 text-green-800",
  "McAllen": "bg-blue-100 text-blue-800",
};

function TablaCalculadora() {
  const [vals, setVals] = useState({ ejote_taras: "", ejote_rel: "", bell_taras: "", bell_rel: "" });
  const upd = (k, v) => setVals((p) => ({ ...p, [k]: v }));

  const ejCajas = vals.ejote_taras && vals.ejote_rel ? ((parseFloat(vals.ejote_taras) * 250) / 6 / parseFloat(vals.ejote_rel)).toFixed(0) : "—";
  const ejParr = ejCajas !== "—" ? (parseFloat(ejCajas) / 56).toFixed(1) : "—";
  const ejTrail = ejParr !== "—" ? Math.ceil(parseFloat(ejParr) / PT) : "—";

  const bpCajas = vals.bell_taras && vals.bell_rel ? (parseFloat(vals.bell_taras) / parseFloat(vals.bell_rel)).toFixed(0) : "—";
  const bpParr = bpCajas !== "—" ? (parseFloat(bpCajas) / 52).toFixed(1) : "—";
  const bpTrail = bpParr !== "—" ? Math.ceil(parseFloat(bpParr) / PT) : "—";

  const inp = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 text-right";

  return (
    <div className="bg-white border border-blue-200 rounded-xl overflow-x-auto mb-6">
      <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
        <span className="text-blue-700 font-semibold text-xs">🧮 Calculadora de campo</span>
        <span className="text-blue-500 text-xs ml-2">Ejote: Bins×250÷6÷Rel · Bell Pepper: Taras÷Rel</span>
      </div>
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="bg-blue-50">
            <th className="text-xs font-medium px-2 py-2 text-left text-blue-700">Producto</th>
            <th className="text-xs font-medium px-2 py-2 text-center text-blue-700">Bins / Taras</th>
            <th className="text-xs font-medium px-2 py-2 text-center text-blue-700">Relación</th>
            <th className="text-xs font-medium px-2 py-2 text-center text-blue-700 bg-blue-100">Cajas</th>
            <th className="text-xs font-medium px-2 py-2 text-center text-blue-700 bg-blue-100">Parrillas</th>
            <th className="text-xs font-medium px-2 py-2 text-center text-blue-700 bg-blue-100">Trailers</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-2 py-1.5 border-b border-gray-100 text-xs font-semibold text-green-700">
              <div>Ejote</div><div className="text-gray-400 font-normal">Bins×250÷6÷Rel</div>
            </td>
            <td className="px-2 py-1.5 border-b border-gray-100"><input type="number" placeholder="ej. 120" value={vals.ejote_taras} onChange={(e) => upd("ejote_taras", e.target.value)} className={inp} /></td>
            <td className="px-2 py-1.5 border-b border-gray-100"><input type="number" placeholder="ej. 21.5" value={vals.ejote_rel} onChange={(e) => upd("ejote_rel", e.target.value)} className={inp} /></td>
            <td className="px-2 py-1.5 border-b border-gray-100 bg-blue-50 text-xs font-semibold text-right">{ejCajas !== "—" ? parseInt(ejCajas).toLocaleString() : "—"}</td>
            <td className="px-2 py-1.5 border-b border-gray-100 bg-blue-50 text-xs font-semibold text-right">{ejParr}</td>
            <td className="px-2 py-1.5 border-b border-gray-100 bg-blue-100 text-xs font-semibold text-right text-blue-800">{ejTrail}</td>
          </tr>
          <tr>
            <td className="px-2 py-1.5 border-b border-gray-100 text-xs font-semibold text-orange-700">
              <div>Bell Pepper</div><div className="text-gray-400 font-normal">Taras÷Rel</div>
            </td>
            <td className="px-2 py-1.5 border-b border-gray-100"><input type="number" placeholder="ej. 800" value={vals.bell_taras} onChange={(e) => upd("bell_taras", e.target.value)} className={inp} /></td>
            <td className="px-2 py-1.5 border-b border-gray-100"><input type="number" placeholder="ej. 18" value={vals.bell_rel} onChange={(e) => upd("bell_rel", e.target.value)} className={inp} /></td>
            <td className="px-2 py-1.5 border-b border-gray-100 bg-blue-50 text-xs font-semibold text-right">{bpCajas !== "—" ? parseInt(bpCajas).toLocaleString() : "—"}</td>
            <td className="px-2 py-1.5 border-b border-gray-100 bg-blue-50 text-xs font-semibold text-right">{bpParr}</td>
            <td className="px-2 py-1.5 border-b border-gray-100 bg-blue-100 text-xs font-semibold text-right text-blue-800">{bpTrail}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Modulo2() {
  const [diaFil, setDiaFil] = useState("Todos");
  const [maData, setMaData] = useState({});

  const filtered = diaFil === "Todos" ? rawData : rawData.filter((r) => r.fecha === diaFil);

  const setMa = (key, val) => setMaData((p) => ({ ...p, [key]: val }));
  const DESTINOS_MA = ["USA Nogales", "McAllen"];
  const fechasMA = diaFil === "Todos" ? FECHAS : [diaFil];
  const totMA = Object.values(maData).reduce((a, v) => a + (parseInt(v) || 0), 0);

  const TH = "text-xs font-medium px-2 py-2 border-b border-gray-100 text-left";
  const TD = "px-2 py-2 border-b border-gray-100 text-xs";

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Módulo 2 — Cálculo de trailers</h1>
        <p className="text-sm text-gray-500 mt-0.5">Semana 22 · datos desde Módulo 1</p>
      </div>

      {/* Filtro días */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["Todos", ...FECHAS].map((d) => (
          <button key={d} onClick={() => setDiaFil(d)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${diaFil === d ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-500 border-gray-200"}`}>
            {d}
          </button>
        ))}
      </div>

      {/* Contratos */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
        <span className="text-sm font-semibold text-gray-800">Contratos</span>
        <span className="text-xs text-gray-400">calculado automático</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="bg-gray-50">
              <th className={TH}>Fecha</th>
              <th className={TH}>Origen</th>
              <th className={TH}>Destino</th>
              <th className={TH + " text-right"}>Cajas</th>
              <th className={TH + " text-right bg-green-50 text-green-700"}>Parrillas</th>
              <th className={TH + " text-right bg-blue-50 text-blue-700"}>Trailers</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const parr = Math.ceil(r.cajas / r.cxp);
              const trail = Math.ceil(parr / PT);
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className={TD + " font-semibold"}>{r.fecha}</td>
                  <td className={TD + " text-gray-500"}>{ORIGEN}</td>
                  <td className={TD}><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DC[r.dest] || "bg-gray-100 text-gray-600"}`}>{r.dest}</span></td>
                  <td className={TD + " text-right font-medium"}>{r.cajas.toLocaleString()}</td>
                  <td className={TD + " text-right font-semibold text-green-700 bg-green-50"}>{parr}</td>
                  <td className={TD + " text-right font-bold text-blue-700 bg-blue-50"}>{trail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Calculadora */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-400"></div>
        <span className="text-sm font-semibold text-gray-800">Calculadora de campo</span>
      </div>
      <TablaCalculadora />

      {/* Mercado Abierto */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
        <span className="text-sm font-semibold text-gray-800">Mercado Abierto</span>
        <span className="text-xs text-gray-400">Kiko captura trailers directo</span>
      </div>
      <div className="bg-white border border-purple-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[400px]">
          <thead>
            <tr className="bg-purple-50">
              <th className={TH + " text-purple-700"}>Fecha</th>
              <th className={TH + " text-purple-700"}>Origen</th>
              <th className={TH + " text-purple-700"}>Destino</th>
              <th className={TH + " text-center text-purple-700"}>Trailers — Kiko</th>
            </tr>
          </thead>
          <tbody>
            {fechasMA.map((f) =>
              DESTINOS_MA.map((d, idx) => {
                const key = f + "||" + d;
                return (
                  <tr key={key} className={idx % 2 === 0 ? "bg-white" : "bg-purple-50/30"}>
                    <td className={TD + " font-semibold"}>{f}</td>
                    <td className={TD + " text-gray-500"}>{ORIGEN}</td>
                    <td className={TD}><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DC[d]}`}>{d}</span></td>
                    <td className="px-2 py-1.5 border-b border-gray-100 text-center">
                      <input type="number" min="0" placeholder="0" value={maData[key] || ""} onChange={(e) => setMa(key, e.target.value)}
                        className="w-20 text-center text-sm font-semibold px-2 py-1 border border-purple-200 rounded-md focus:outline-none focus:border-purple-500 bg-purple-50 text-purple-800" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-purple-50 font-semibold">
              <td colSpan={3} className="px-2 py-2 text-xs text-purple-700">Total Mercado Abierto</td>
              <td className="px-2 py-2 text-center text-sm text-purple-700">{totMA} trailers</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}