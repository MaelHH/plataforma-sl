import { useState } from "react";
import { useDatos, DC } from "../store/datos";

const EVENTOS = [
  { id: "tive", label: "Evidencia de TIVE", icon: "🛰️", color: "blue" },
  { id: "retenes", label: "Evidencia de Retenes", icon: "🚧", color: "amber" },
  { id: "aduanas", label: "Aduanas y Descargas", icon: "🛃", color: "purple" },
  { id: "accidente", label: "Evidencia de Accidente", icon: "⚠️", color: "red" },
];

const COLOR_MAP = {
  blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
};

export default function Modulo7() {
  const { trailers, setTrailers, monitoreo, setMonitoreo } = useDatos();
  const [tab, setTab] = useState("ruta");
  const [expandido, setExpandido] = useState(null); // trailerId abierto
  const [activePhoto, setActivePhoto] = useState(null);

  const enRuta = trailers.filter((t) => t.status === "en_ruta");
  const entregados = trailers.filter((t) => t.status === "entregado");

  // monitoreo = { [trailerId]: { [eventoId]: { hubo: true/false/null, fotos: [4] } } }
  const getEvento = (tId, eId) => monitoreo[tId]?.[eId] || { hubo: null, fotos: [null, null, null, null] };

  const setHubo = (tId, eId, hubo) => {
    setMonitoreo((prev) => ({
      ...prev,
      [tId]: { ...prev[tId], [eId]: { hubo, fotos: prev[tId]?.[eId]?.fotos || [null, null, null, null] } },
    }));
  };

  const confirmPhoto = () => {
    if (!activePhoto) return;
    const { trailerId, eventoId, slot } = activePhoto;
    setMonitoreo((prev) => {
      const ev = prev[trailerId]?.[eventoId] || { hubo: true, fotos: [null, null, null, null] };
      const fotos = [...ev.fotos];
      fotos[slot] = "photo";
      return { ...prev, [trailerId]: { ...prev[trailerId], [eventoId]: { ...ev, fotos } } };
    });
    setActivePhoto(null);
  };

  const marcarEntregado = (tId) => setTrailers((prev) => prev.map((t) => (t.id === tId ? { ...t, status: "entregado" } : t)));
  const reactivar = (tId) => setTrailers((prev) => prev.map((t) => (t.id === tId ? { ...t, status: "en_ruta" } : t)));

  function TrailerCard({ t, esHistorial }) {
    const isOpen = expandido === t.id;
    const eventos = monitoreo[t.id] || {};
    const conEvidencia = Object.values(eventos).filter((e) => e.hubo === true).length;

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-3">
        {/* Header con línea grande */}
        <div className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpandido(isOpen ? null : t.id)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
              <div>
                <div className="text-base font-semibold text-gray-900">{t.linea || "Sin línea de flete"}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${DC[t.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{t.dest}</span>
                  <span className="text-xs text-gray-500">{t.chofer || "Sin chofer"}</span>
                  {t.placaTracto && <span className="text-xs font-mono text-gray-400">{t.placaTracto}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {conEvidencia > 0 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{conEvidencia} evento{conEvidencia > 1 ? "s" : ""}</span>}
              {!esHistorial ? (
                <button onClick={() => marcarEntregado(t.id)} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700">✓ Llegó a destino</button>
              ) : (
                <button onClick={() => reactivar(t.id)} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100">↩ Regresar a ruta</button>
              )}
            </div>
          </div>
        </div>

        {/* Dropdown de eventos */}
        {isOpen && (
          <div className="border-t border-gray-100 p-3 space-y-2">
            {EVENTOS.map((ev) => {
              const c = COLOR_MAP[ev.color];
              const estado = getEvento(t.id, ev.id);
              const llenas = estado.fotos.filter(Boolean).length;
              return (
                <div key={ev.id} className={`border-2 rounded-xl p-3 ${estado.hubo === true ? c.border + " " + c.bg : "border-gray-200 bg-white"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ev.icon}</span>
                      <span className="text-sm font-medium text-gray-700">{ev.label}</span>
                    </div>
                    {/* Botón Sí / No */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 mr-1">¿Hubo?</span>
                      <button onClick={() => setHubo(t.id, ev.id, true)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium border ${estado.hubo === true ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>Sí</button>
                      <button onClick={() => setHubo(t.id, ev.id, false)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium border ${estado.hubo === false ? "bg-gray-600 text-white border-gray-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>No</button>
                    </div>
                  </div>

                  {/* Cuadros de fotos solo si Sí */}
                  {estado.hubo === true && (
                    <div className="mt-3">
                      <div className="text-xs text-gray-500 mb-1.5">{llenas}/4 fotos de evidencia</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {estado.fotos.map((f, slot) => (
                          <div key={slot} onClick={() => setActivePhoto({ trailerId: t.id, eventoId: ev.id, slot })}
                            className={`h-14 border-2 rounded-md flex items-center justify-center cursor-pointer ${f ? "border-green-400 bg-green-50" : "border-dashed border-gray-300 bg-white hover:border-gray-400"}`}>
                            {f ? <span className="text-sm">📷</span> : <span className="text-gray-300">+</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
        <h1 className="text-base font-semibold text-gray-900">Monitoreo en Ruta</h1>          <p className="text-sm text-gray-500 mt-0.5">Eventos en tránsito · TIVE · retenes · aduanas · accidentes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">FF</div>
          <span className="text-sm font-medium text-gray-700">Francisco / Kiko</span>
        </div>
      </div>

      <div className="flex border border-gray-200 rounded-lg overflow-hidden w-fit mb-4">
        <button onClick={() => setTab("ruta")} className={`px-4 py-1.5 text-sm ${tab === "ruta" ? "bg-gray-100 font-semibold text-gray-900" : "bg-white text-gray-500"}`}>En ruta ({enRuta.length})</button>
        <button onClick={() => setTab("historial")} className={`px-4 py-1.5 text-sm ${tab === "historial" ? "bg-gray-100 font-semibold text-gray-900" : "bg-white text-gray-500"}`}>Historial ({entregados.length})</button>
      </div>

      {tab === "ruta" && (
        enRuta.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <div className="text-2xl mb-3">🛣️</div>
            <div className="text-sm font-medium text-gray-700 mb-1">Sin trailers en ruta</div>
            <div className="text-xs text-gray-400">Aparecen aquí cuando Francisco los envía a Embarques</div>
          </div>
        ) : enRuta.map((t) => <TrailerCard key={t.id} t={t} esHistorial={false} />)
      )}

      {tab === "historial" && (
        entregados.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <div className="text-2xl mb-3">📦</div>
            <div className="text-sm font-medium text-gray-700 mb-1">Sin entregas registradas</div>
            <div className="text-xs text-gray-400">Los trailers que marques "Llegó a destino" aparecen aquí</div>
          </div>
        ) : entregados.map((t) => <TrailerCard key={t.id} t={t} esHistorial={true} />)
      )}

      {activePhoto !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="bg-gray-900 h-44 flex flex-col items-center justify-center gap-2">
              <span className="text-4xl">📷</span>
              <span className="text-gray-400 text-sm">{EVENTOS.find((e) => e.id === activePhoto.eventoId)?.label} · Foto {activePhoto.slot + 1}</span>
              <span className="text-gray-600 text-xs">Simulación — en producción abre la cámara</span>
            </div>
            <div className="px-5 py-4 flex gap-2 justify-end">
              <button onClick={() => setActivePhoto(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmPhoto} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">✓ Confirmar foto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}