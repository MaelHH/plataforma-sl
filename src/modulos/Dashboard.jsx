import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useDatos, CAT_VACIO, DC, etiquetaSemana, moverSemana } from "../store/datos";

// DATOS DEMO — BORRAR AL CONECTAR BACKEND
const TENDENCIA_DEMO = {
  semanal: [
    { periodo: "Sem 18", costo: 0.412 },
    { periodo: "Sem 19", costo: 0.438 },
    { periodo: "Sem 20", costo: 0.401 },
    { periodo: "Sem 21", costo: 0.455 },
    { periodo: "Sem 22", costo: 0.447 },
  ],
  mensual: [
    { periodo: "Ene", costo: 0.392 },
    { periodo: "Feb", costo: 0.421 },
    { periodo: "Mar", costo: 0.408 },
    { periodo: "Abr", costo: 0.439 },
    { periodo: "May", costo: 0.447 },
  ],
  temporada: [
    { periodo: "2023-24", costo: 0.385 },
    { periodo: "2024-25", costo: 0.412 },
    { periodo: "2025-26", costo: 0.431 },
  ],
};
// FIN DATOS DEMO

function lunesActual() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  hoy.setDate(hoy.getDate() + diff);
  return hoy.toISOString().slice(0, 10);
}

// Semáforo vs promedio
function semaforo(valor, promedio) {
  if (!promedio || promedio === 0) return { color: "gray", label: "—" };
  const ratio = valor / promedio;
  if (ratio <= 1.0) return { color: "green", label: "🟢" };
  if (ratio <= 1.15) return { color: "amber", label: "🟡" };
  return { color: "red", label: "🔴" };
}
const SEMAFORO_BG = {
  green: "bg-green-50",
  amber: "bg-amber-50",
  red: "bg-red-50",
  gray: "bg-white",
};

export default function Dashboard() {
  const { trailers, requerimientoGen, cargasEmbarques, monitoreo, catalogo } = useDatos();
  const [semana, setSemana] = useState(lunesActual());
  const [vistaCosto, setVistaCosto] = useState("linea");
  const [vistaTendencia, setVistaTendencia] = useState("semanal"); // DATOS DEMO
  // DATOS DEMO — cálculos de la tendencia de ejemplo
  const dataTendencia = TENDENCIA_DEMO[vistaTendencia];
  const promPeriodo = dataTendencia.reduce((a, p) => a + p.costo, 0) / dataTendencia.length;
  const minPeriodo = Math.min(...dataTendencia.map((p) => p.costo));
  const maxPeriodo = Math.max(...dataTendencia.map((p) => p.costo));

  const reqSemana = requerimientoGen[semana] || [];

  // ── KPIs ──
  const totalSolicitados = reqSemana.reduce((a, r) => a + r.sol, 0);
  const enRuta = trailers.filter((t) => t.status === "en_ruta");
  const entregados = trailers.filter((t) => t.status === "entregado");
  const enInstal = trailers.filter((t) => t.status === "en_instalaciones");
  const conseguidos = enRuta.length + entregados.length + enInstal.length;
  const pctAvance = totalSolicitados > 0 ? Math.min(Math.round((conseguidos / totalSolicitados) * 100), 100) : 0;

  // ── Avance por destino ──
  const porDestino = {};
  reqSemana.forEach((r) => {
    if (!porDestino[r.dest]) porDestino[r.dest] = { dest: r.dest, sol: 0, conseguidos: 0 };
    porDestino[r.dest].sol += r.sol;
  });
  trailers.forEach((t) => {
    if (t.dest && porDestino[t.dest] && t.status !== "esperando") porDestino[t.dest].conseguidos += 1;
  });
  const destinosArr = Object.values(porDestino).sort((a, b) => b.sol - a.sol);

  // ── Dinero (suma de fletes de trailers activos) ──
  const trailersActivos = trailers.filter((t) => t.status !== "esperando");
  const totalFletes = trailersActivos.reduce((a, t) => a + (parseFloat(t.flete) || 0), 0);

  // ── Pendiente de facturar en SAP ──
  const cargasPendientesSap = cargasEmbarques.filter((c) => c.sapStatus === "pendiente");
  const totalPendienteSap = cargasPendientesSap.reduce((a, c) => a + (parseFloat(c.trailer?.flete) || 0), 0);

  // ── ANÁLISIS DE COSTOS ──
  const CATALOGO = [CAT_VACIO, ...catalogo];
  const librasDe = (presId) => {
    const c = CATALOGO.find((x) => x.id === presId);
    return c ? (c.cajasPorParrilla || 0) * (c.librasPorCaja || 0) : 0;
  };

  const viajes = cargasEmbarques.map((carga) => {
    const flete = parseFloat(carga.trailer?.flete) || 0;
    let libras = 0;
    const porProducto = {};
    if (carga.consolidado) {
      carga.empresasSel?.forEach((eid) => {
        (carga.distEmpresas[eid] || []).forEach((p) => {
          if (!p.prod) return;
          const lbs = librasDe(p.prod);
          libras += lbs;
          porProducto[p.prod] = (porProducto[p.prod] || 0) + lbs;
        });
      });
    }
    return {
      linea: carga.trailer?.linea || "Sin línea",
      dest: carga.trailer?.dest || "Sin destino",
      flete, libras,
      costoLb: libras > 0 ? flete / libras : 0,
      porProducto,
    };
  });
  const viajesValidos = viajes.filter((v) => v.libras > 0 && v.flete > 0);
  const promedioGlobal = viajesValidos.length > 0 ? viajesValidos.reduce((a, v) => a + v.costoLb, 0) / viajesValidos.length : 0;
  const totalLibras = viajesValidos.reduce((a, v) => a + v.libras, 0);

  const agruparPor = (campo) => {
    const map = {};
    viajesValidos.forEach((v) => {
      const key = v[campo];
      if (!map[key]) map[key] = { key, flete: 0, libras: 0 };
      map[key].flete += v.flete;
      map[key].libras += v.libras;
    });
    return Object.values(map).map((m) => ({ ...m, costoLb: m.libras > 0 ? m.flete / m.libras : 0 })).sort((a, b) => b.costoLb - a.costoLb);
  };
  const porLinea = agruparPor("linea");
  const porRuta = agruparPor("dest");

  const prodMap = {};
  viajesValidos.forEach((v) => {
    Object.entries(v.porProducto).forEach(([presId, lbs]) => {
      if (!prodMap[presId]) prodMap[presId] = { presId, libras: 0, flete: 0 };
      const propor = v.libras > 0 ? (lbs / v.libras) * v.flete : 0;
      prodMap[presId].libras += lbs;
      prodMap[presId].flete += propor;
    });
  });
  const porProducto = Object.values(prodMap).map((m) => {
    const cat = CATALOGO.find((c) => c.id === m.presId);
    return { key: cat?.label || m.presId, libras: m.libras, flete: m.flete, costoLb: m.libras > 0 ? m.flete / m.libras : 0 };
  }).sort((a, b) => b.costoLb - a.costoLb);

  const datosCosto = vistaCosto === "linea" ? porLinea : vistaCosto === "ruta" ? porRuta : porProducto;
  const promParaSemaforo = vistaCosto === "producto"
    ? (porProducto.length > 0 ? porProducto.reduce((a, p) => a + p.costoLb, 0) / porProducto.length : 0)
    : promedioGlobal;

  // ── Alertas ──
  const alertas = [];
  destinosArr.forEach((d) => {
    if (d.conseguidos < d.sol) alertas.push({ tipo: "ruta", txt: `${d.dest}: faltan ${d.sol - d.conseguidos} de ${d.sol} trailers`, color: "amber" });
  });
  const pendientesSap = cargasPendientesSap.length;
  if (pendientesSap > 0) alertas.push({ tipo: "sap", txt: `${pendientesSap} carga(s) pendiente(s) de registrar en SAP`, color: "blue" });
  porLinea.forEach((l) => {
    if (promedioGlobal > 0 && l.costoLb / promedioGlobal > 1.15) alertas.push({ tipo: "costo", txt: `💲 ${l.key}: costo/lb ${Math.round((l.costoLb / promedioGlobal - 1) * 100)}% sobre el promedio`, color: "red" });
  });
  Object.entries(monitoreo).forEach(([tId, eventos]) => {
    const t = trailers.find((x) => String(x.id) === String(tId));
    if (!t) return;
    if (eventos.accidente?.hubo === true) alertas.push({ tipo: "acc", txt: `⚠️ Accidente reportado — ${t.linea || t.dest}`, color: "red" });
    if (eventos.retenes?.hubo === true) alertas.push({ tipo: "ret", txt: `🚧 Retén reportado — ${t.linea || t.dest}`, color: "amber" });
  });

  const ALERT_COLORS = {
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Dashboard Ejecutivo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visión general de la operación · {etiquetaSemana(semana)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSemana(moverSemana(semana, -1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600">◀</button>
          <button onClick={() => setSemana(moverSemana(semana, 1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600">▶</button>
        </div>
      </div>

      {/* KPIs grandes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
          <div className="text-xs opacity-80 mb-1">Avance de la semana</div>
          <div className="text-3xl font-bold">{pctAvance}%</div>
          <div className="text-xs opacity-80 mt-1">{conseguidos} de {totalSolicitados} trailers</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Solicitados</div>
          <div className="text-3xl font-bold text-gray-900">{totalSolicitados}</div>
          <div className="text-xs text-gray-400 mt-1">esta semana</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">En ruta 🚛</div>
          <div className="text-3xl font-bold text-green-600">{enRuta.length}</div>
          <div className="text-xs text-gray-400 mt-1">{entregados.length} entregados</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Fletes activos</div>
          <div className="text-2xl font-bold text-gray-900">${totalFletes.toLocaleString()}</div>
          <div className="text-xs text-orange-600 mt-1 font-medium">${totalPendienteSap.toLocaleString()} pend. SAP</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Avance por destino */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">Avance por destino</div>
          {destinosArr.length === 0 ? (
            <div className="text-xs text-gray-400 italic text-center py-6">Sin requerimiento esta semana</div>
          ) : (
            <div className="space-y-3">
              {destinosArr.map((d) => {
                const pct = d.sol > 0 ? Math.min(Math.round((d.conseguidos / d.sol) * 100), 100) : 0;
                return (
                  <div key={d.dest}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[d.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{d.dest}</span>
                      <span className="text-xs text-gray-600 font-medium">{d.conseguidos}/{d.sol}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">🔔 Alertas y pendientes</div>
          {alertas.length === 0 ? (
            <div className="text-xs text-gray-400 italic text-center py-6">Todo en orden ✓</div>
          ) : (
            <div className="space-y-2">
              {alertas.map((a, i) => (
                <div key={i} className={`text-xs px-3 py-2 rounded-lg border ${ALERT_COLORS[a.color]}`}>{a.txt}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Viajes en ruta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-semibold text-gray-900 mb-3">🚛 Viajes activos en ruta</div>
        {enRuta.length === 0 ? (
          <div className="text-xs text-gray-400 italic text-center py-6">Ningún trailer en ruta ahora</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {enRuta.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[t.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{t.dest}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-800 truncate">{t.linea || "Sin línea"}</div>
                  <div className="text-xs text-gray-400 truncate">{t.chofer || "Sin chofer"} {t.placaTracto && `· ${t.placaTracto}`}</div>
                </div>
                {t.flete && <span className="text-xs font-semibold text-green-700">${parseFloat(t.flete).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pendiente de facturar en SAP */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-900">🧾 Pendiente de registrar en SAP</div>
          {totalPendienteSap > 0 && <span className="text-sm font-bold text-orange-600">${totalPendienteSap.toLocaleString()}</span>}
        </div>
        {cargasPendientesSap.length === 0 ? (
          <div className="text-xs text-gray-400 italic text-center py-6">Todo registrado en SAP ✓</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {cargasPendientesSap.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border border-orange-100 bg-orange-50/40 rounded-lg px-3 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[c.trailer?.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{c.trailer?.dest || "—"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-800 truncate">{c.trailer?.linea || "Sin línea"}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {c.consolidado ? `Consolidado · ${c.empresasSel?.length || 0} empresas` : "Carga simple"}
                  </div>
                </div>
                {c.trailer?.flete && <span className="text-xs font-semibold text-orange-700">${parseFloat(c.trailer.flete).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── ANÁLISIS DE COSTOS ─── */}
      <div className="border-t border-gray-200 pt-5 mt-2">
        <div className="text-sm font-bold text-gray-900 mb-3">💲 Análisis de Costos · costo por libra</div>

        {viajesValidos.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center">
            <div className="text-xs text-gray-400">El análisis de costos se calcula con cargas consolidadas que tengan distribución de presentaciones y flete (desde Evidencias de Carga).</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl p-4 text-white">
                <div className="text-xs opacity-80 mb-1">Costo promedio</div>
                <div className="text-3xl font-bold">${promedioGlobal.toFixed(3)}</div>
                <div className="text-xs opacity-80 mt-1">por libra · {viajesValidos.length} viajes</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Libras movidas</div>
                <div className="text-2xl font-bold text-gray-900">{Math.round(totalLibras).toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-1">lbs</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Fletes analizados</div>
                <div className="text-2xl font-bold text-gray-900">${viajesValidos.reduce((a, v) => a + v.flete, 0).toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-1">{viajesValidos.length} cargas</div>
              </div>
            </div>

            {/* Selector de vista */}
            <div className="flex gap-2 mb-3">
              {[["linea", "Por línea"], ["ruta", "Por ruta"], ["producto", "Por producto"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setVistaCosto(id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium ${vistaCosto === id ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-500 border border-gray-200"}`}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Leyenda */}
            <div className="flex gap-4 mb-2 text-xs text-gray-500">
              <span>🟢 Bajo el promedio</span>
              <span>🟡 Hasta +15%</span>
              <span>🔴 +15% o más</span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                      {vistaCosto === "linea" ? "Línea de transporte" : vistaCosto === "ruta" ? "Ruta / Destino" : "Producto"}
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Libras</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Flete</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Costo / lb</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">vs. prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {datosCosto.map((d, i) => {
                    const sem = semaforo(d.costoLb, promParaSemaforo);
                    const esRuta = vistaCosto === "ruta";
                    return (
                      <tr key={i} className={`border-b border-gray-100 ${SEMAFORO_BG[sem.color]}`}>
                        <td className="px-4 py-2.5">
                          {esRuta ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[d.key] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{d.key}</span>
                          ) : (
                            <span className="font-medium text-gray-800">{d.key}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{Math.round(d.libras).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">${Math.round(d.flete).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">${d.costoLb.toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-center text-lg">{sem.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-400 mt-3 italic">
              * El promedio es de las cargas actuales. Con la base de datos, el semáforo comparará contra el histórico real (temporada, mes, semana).
            </div>
          </>
        )}

        {/* ─── TENDENCIA DE COSTO (DATOS DEMO — BORRAR AL CONECTAR BACKEND) ─── */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-gray-900">📈 Tendencia de costo por libra</div>
            <div className="flex gap-2">
              {[["semanal", "Semanal"], ["mensual", "Mensual"], ["temporada", "Temporada"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setVistaTendencia(id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium ${vistaTendencia === id ? "bg-indigo-100 text-indigo-700" : "bg-white text-gray-500 border border-gray-200"}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* KPIs del periodo */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">Promedio del periodo</div>
              <div className="text-xl font-bold text-gray-900">${promPeriodo.toFixed(3)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">Más bajo</div>
              <div className="text-xl font-bold text-green-600">${minPeriodo.toFixed(3)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">Más alto</div>
              <div className="text-xl font-bold text-red-600">${maxPeriodo.toFixed(3)}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dataTendencia} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="periodo" tick={{ fontSize: 12, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} domain={["auto", "auto"]} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <Tooltip formatter={(v) => [`$${v.toFixed(3)}/lb`, "Costo"]} />
                <Line type="monotone" dataKey="costo" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4, fill: "#4f46e5" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-amber-600 mt-2 italic">⚠️ Datos de ejemplo — se reemplazan con el histórico real al conectar la base de datos.</div>
        </div>
      </div>
    </div>
  );
}