import { useState } from "react";
import { useDatos, ORIGEN, TOTAL, calcularDias, etiquetaSemana, moverSemana } from "../store/datos";

const PT = TOTAL;

const DC = {
  "WM MEX": "bg-orange-100 text-orange-800",
  "USA Texas": "bg-orange-100 text-orange-800",
  "USA Nogales": "bg-green-100 text-green-800",
  "McAllen": "bg-blue-100 text-blue-800",
};

// Lunes de la semana actual en formato YYYY-MM-DD
function lunesActual() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  hoy.setDate(hoy.getDate() + diff);
  return hoy.toISOString().slice(0, 10);
}

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
const { programa, catalogo, setRequerimientoGen } = useDatos();
  const [semana, setSemana] = useState(lunesActual());
  const [diaFil, setDiaFil] = useState("Todos");
  const [maData, setMaData] = useState({});

  const dias = calcularDias(semana);
  const filasSemana = programa[semana] || [];

  // ── Cálculo de contratos desde el programa de M1 ──
  // Agrupar parrillas por destino+día. Cada presentación redondea sus parrillas por separado.
  const cxpDe = (presId) => catalogo.find((c) => c.id === presId)?.cajasPorParrilla || 0;

  // mapa: { "destino||díaIdx": parrillasTotales }
  const acumulado = {};
  filasSemana.forEach((fila) => {
    const cxp = cxpDe(fila.presId);
    if (!cxp) return;
    fila.dias.forEach((cajas, di) => {
      if (!cajas) return;
      const parr = Math.ceil(cajas / cxp); // redondeo por presentación
      const key = fila.dest + "||" + di;
      acumulado[key] = (acumulado[key] || 0) + parr;
    });
  });

  // Convertir a filas para la tabla
  let contratos = Object.entries(acumulado).map(([key, parr]) => {
    const [dest, diStr] = key.split("||");
    const di = parseInt(diStr);
    return { dest, di, fecha: dias[di], parrillas: parr, trailers: Math.ceil(parr / PT) };
  });
  // Filtrar por día seleccionado
  if (diaFil !== "Todos") contratos = contratos.filter((c) => c.fecha === diaFil);
  // Ordenar por día y destino
  contratos.sort((a, b) => a.di - b.di || a.dest.localeCompare(b.dest));

  const totalTrailers = contratos.reduce((a, c) => a + c.trailers, 0);

  const setMa = (key, val) => setMaData((p) => ({ ...p, [key]: val }));
  const DESTINOS_MA = ["USA Nogales", "McAllen"];
  const fechasMA = diaFil === "Todos" ? dias : [diaFil];
  const totMA = Object.values(maData).reduce((a, v) => a + (parseInt(v) || 0), 0);
  const [generado, setGenerado] = useState(false);
  const generarRequerimiento = () => {
    const reqs = [];
    // Contratos (de todo lo calculado, sin filtro de día)
    Object.entries(acumulado).forEach(([key, parr]) => {
      const [dest, diStr] = key.split("||");
      const di = parseInt(diStr);
      const trailers = Math.ceil(parr / PT);
      if (trailers > 0) reqs.push({ tipo: "Contrato", fecha: dias[di], diIdx: di, origen: ORIGEN, dest, sol: trailers });
    });
    // Mercado Abierto (lo que capturó Kiko)
    Object.entries(maData).forEach(([key, val]) => {
      const sol = parseInt(val) || 0;
      if (sol <= 0) return;
      const [fecha, dest] = key.split("||");
      const di = dias.indexOf(fecha);
      reqs.push({ tipo: "M. Abierto", fecha, diIdx: di, origen: ORIGEN, dest, sol });
    });
    setRequerimientoGen((prev) => ({ ...prev, [semana]: reqs }));
    setGenerado(true);
    setTimeout(() => setGenerado(false), 2500);
  };

  const TH = "text-xs font-medium px-2 py-2 border-b border-gray-100 text-left";
  const TD = "px-2 py-2 border-b border-gray-100 text-xs";

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gray-900">Módulo 2 — Cálculo de trailers</h1>
        <p className="text-sm text-gray-500 mt-0.5">Datos automáticos del programa (Módulo 1)</p>
      </div>

      {/* Selector de semana */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex items-center justify-between">
        <button onClick={() => setSemana(moverSemana(semana, -1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600">◀ Anterior</button>
        <div className="text-center">
          <div className="text-xs text-gray-400">Semana</div>
          <div className="text-sm font-semibold text-gray-900">{etiquetaSemana(semana)}</div>
          <input type="date" value={semana} onChange={(e) => { if (e.target.value) setSemana(e.target.value); }}
            className="text-xs text-gray-400 mt-1 border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={() => setSemana(moverSemana(semana, 1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600">Siguiente ▶</button>
      </div>

      {/* Filtro días */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["Todos", ...dias].map((d) => (
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
        <span className="text-xs text-gray-400">calculado automático desde el programa</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="bg-gray-50">
              <th className={TH}>Fecha</th>
              <th className={TH}>Origen</th>
              <th className={TH}>Destino</th>
              <th className={TH + " text-right bg-green-50 text-green-700"}>Parrillas</th>
              <th className={TH + " text-right bg-blue-50 text-blue-700"}>Trailers</th>
            </tr>
          </thead>
          <tbody>
            {contratos.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-xs text-gray-400 italic py-6">Sin programa para esta semana. José Carlos debe llenarlo en el Módulo 1.</td></tr>
            ) : (
              contratos.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className={TD + " font-semibold"}>{r.fecha}</td>
                  <td className={TD + " text-gray-500"}>{ORIGEN}</td>
                  <td className={TD}><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DC[r.dest] || "bg-gray-100 text-gray-600"}`}>{r.dest}</span></td>
                  <td className={TD + " text-right font-semibold text-green-700 bg-green-50"}>{r.parrillas}</td>
                  <td className={TD + " text-right font-bold text-blue-700 bg-blue-50"}>{r.trailers}</td>
                </tr>
              ))
            )}
          </tbody>
          {contratos.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={4} className="px-2 py-2 text-xs text-gray-600 text-right">Total trailers de contrato</td>
                <td className="px-2 py-2 text-right text-sm text-blue-700">{totalTrailers}</td>
              </tr>
            </tfoot>
          )}
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
                    <td className={TD}><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DC[d] || "bg-gray-100 text-gray-600"}`}>{d}</span></td>
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

      {/* Generar requerimiento a Mónica */}
      <div className="mt-6 flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4">
        <div>
          <div className="text-sm font-semibold text-gray-800">Enviar requerimiento a Mónica</div>
          <div className="text-xs text-gray-500 mt-0.5">Junta contratos + mercado abierto de esta semana y los manda al Módulo 3</div>
        </div>
        <button onClick={generarRequerimiento}
          className={`text-sm font-semibold px-5 py-2 rounded-lg ${generado ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
          {generado ? "✓ Enviado a Mónica" : "📤 Generar requerimiento"}
        </button>
      </div>
    </div>
  );
}