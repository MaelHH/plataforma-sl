import { useState } from "react";
import { useDatos, PRECARGA_PREGUNTAS } from "../store/datos";
import { calcQCI } from "./helpers/calidad";
import { generarExpedienteCampo } from "./reportes/expedienteCampo";
import { generarExpedienteExportacion } from "./reportes/expedienteExportacion";
import { generarReporteCalidad, generarReporteInspeccion } from "./reportes/reporteCalidad";
import { generarPrecargaPDF } from "./reportes/reportePrecarga";

// Chip de documento disponible / faltante
const Chip = ({ ok, children }) => (
  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${ok ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
    {ok ? "✓ " : "○ "}{children}
  </span>
);

const Btn = ({ onClick, disabled, color = "gray", children }) => {
  const c = disabled
    ? "border-gray-200 text-gray-300 cursor-not-allowed"
    : { emerald: "border-emerald-200 text-emerald-700 hover:bg-emerald-50", indigo: "border-indigo-200 text-indigo-700 hover:bg-indigo-50", blue: "border-blue-200 text-blue-700 hover:bg-blue-50", cyan: "border-cyan-200 text-cyan-700 hover:bg-cyan-50", gray: "border-gray-200 text-gray-600 hover:bg-gray-50" }[color];
  return (
    <button onClick={onClick} disabled={disabled} className={`text-xs px-2 py-1 border rounded-lg bg-white ${c}`}>{children}</button>
  );
};

export default function Modulo11() {
  const { movimientos, trailers, cargasEmbarques, monitoreo } = useDatos();
  const [tab, setTab] = useState("campo"); // "campo" | "exportacion"
  const [q, setQ] = useState("");

  const t = q.trim().toLowerCase();
  const match = (...campos) => !t || campos.some((c) => String(c ?? "").toLowerCase().includes(t));

  // ── Campo: por remisión (movimientos) ──
  const movsFiltrados = movimientos.filter((m) => match(m.remision, m.folio, m.rancho, m.destino, m.chofer, m.linea));

  // ── Exportación: por flete (trailers) ──
  const cargaDe = (tid) => cargasEmbarques.find((c) => c.trailer?.id === tid);
  const trailersFiltrados = trailers.filter((tr) => match(tr.linea, tr.chofer, tr.dest, tr.placaTracto, tr.economicoCaja, tr.numero));

  const hallazgosPrecarga = (ip) => (ip ? PRECARGA_PREGUNTAS.filter((p) => ip.respuestas?.[p.id] && ip.respuestas[p.id] === p.malo).length : 0);
  const tieneMonitoreo = (tid) => {
    const mon = monitoreo[tid];
    return !!mon && Object.values(mon).some((e) => e && e.hubo != null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Documentos / Impresiones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Descarga e impresión de expedientes en PDF</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-bold">📄</div>
      </div>

      {/* Pestañas */}
      <div className="flex items-center gap-2 border-b border-gray-200 mb-4">
        {[["campo", "🌾 Campo", "movimientos de campo + recepción en empaque"], ["exportacion", "🚢 Exportación", "flete completo: transporte, carga, inspecciones y monitoreo"]].map(([k, label, sub]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-blue-500 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            title={sub}>
            {label}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "campo" ? "Buscar por remisión, folio, rancho, destino…" : "Buscar por línea, chofer, destino, placas…"}
          className="w-full max-w-md text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
      </div>

      {tab === "campo" ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-900">Expedientes de Campo · por Remisión ({movsFiltrados.length})</span>
          </div>
          {movsFiltrados.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8 italic">No hay movimientos de campo que coincidan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "920px" }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <th className="text-left px-3 py-2 font-medium">Remisión</th>
                    <th className="text-left px-3 py-2 font-medium">Folio</th>
                    <th className="text-left px-3 py-2 font-medium">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium">Rancho → Destino</th>
                    <th className="text-left px-3 py-2 font-medium">Documentos</th>
                    <th className="text-center px-3 py-2 font-medium">Imprimir</th>
                  </tr>
                </thead>
                <tbody>
                  {movsFiltrados.map((m) => {
                    const tieneRec = m.recepcion?.estado === "recibido";
                    const tieneCal = (m.muestreos?.length || 0) > 0;
                    const tieneInsp = !!m.inspeccion;
                    const qci = tieneCal ? m.muestreos.reduce((a, x) => a + calcQCI(x), 0) / m.muestreos.length : null;
                    return (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-bold text-emerald-700">{m.remision || <span className="text-gray-300 font-normal">sin remisión</span>}</td>
                        <td className="px-3 py-2 text-gray-700">{m.folio || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{m.fecha || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{m.rancho || "—"} → {m.destino || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Chip ok={tieneRec}>Recepción</Chip>
                            <Chip ok={tieneCal}>Calidad{qci != null ? ` ${qci.toFixed(0)}%` : ""}</Chip>
                            <Chip ok={tieneInsp}>Inspección</Chip>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1 justify-center">
                            <Btn color="emerald" onClick={() => generarExpedienteCampo(m)}>📄 Expediente</Btn>
                            <Btn color="indigo" disabled={!tieneCal} onClick={() => generarReporteCalidad(m, m.muestreos)}>🔬 Calidad</Btn>
                            <Btn color="cyan" disabled={!tieneInsp} onClick={() => generarReporteInspeccion(m.inspeccion)}>🚛 REG-EMP-24</Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-900">Expedientes de Exportación · por Flete ({trailersFiltrados.length})</span>
          </div>
          {trailersFiltrados.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8 italic">No hay fletes que coincidan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "960px" }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <th className="text-left px-3 py-2 font-medium">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium">Ruta</th>
                    <th className="text-left px-3 py-2 font-medium">Línea / Chofer</th>
                    <th className="text-left px-3 py-2 font-medium">Documentos</th>
                    <th className="text-center px-3 py-2 font-medium">Imprimir</th>
                  </tr>
                </thead>
                <tbody>
                  {trailersFiltrados.map((tr) => {
                    const carga = cargaDe(tr.id);
                    const ip = tr.inspeccionPrecarga;
                    const hall = hallazgosPrecarga(ip);
                    const mon = tieneMonitoreo(tr.id);
                    return (
                      <tr key={tr.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700 font-semibold">{tr.fecha || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{(tr.origen || "").split(",")[0] || "—"} → {tr.dest || "—"}</td>
                        <td className="px-3 py-2 text-gray-700"><div className="font-medium">{tr.linea || "—"}</div><div className="text-gray-400">{tr.chofer || "—"}</div></td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Chip ok={!!ip}>Precarga{ip && hall > 0 ? ` ⚠️${hall}` : ""}</Chip>
                            <Chip ok={!!carga}>Carga</Chip>
                            <Chip ok={mon}>Monitoreo</Chip>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1 justify-center">
                            <Btn color="blue" onClick={() => generarExpedienteExportacion(tr, carga, monitoreo[tr.id])}>📄 Expediente</Btn>
                            <Btn color="cyan" disabled={!ip} onClick={() => generarPrecargaPDF(ip)}>🌡️ REG-EMP-15</Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        El botón <b>Expediente</b> arma un PDF con toda la información disponible. Los demás botones abren los formatos individuales (se habilitan cuando hay datos capturados). Cada PDF se abre en una pestaña nueva lista para imprimir o guardar como PDF.
      </p>
    </div>
  );
}
