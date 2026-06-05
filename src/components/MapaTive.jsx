// Mapa de México (placeholder) para Monitoreo en Ruta.
// Muestra pines por destino con los trailers en ruta. Está listo para conectar
// el API de TIVE: cuando llegue, se reemplazan estas posiciones aproximadas por
// las coordenadas reales (lat/lng) de cada rastreador.

// Posición aproximada (% dentro del recuadro) de los destinos/orígenes conocidos.
const PUNTOS = {
  "Los Mochis, Sinaloa": { x: 27, y: 34 },
  "Culiacán, Sinaloa": { x: 31, y: 40 },
  "WM Culiacán": { x: 31, y: 40 },
  "Guasave, Sinaloa": { x: 29, y: 37 },
  "Hermosillo": { x: 22, y: 22 },
  "USA Nogales": { x: 20, y: 8 },
  "Nogales": { x: 20, y: 8 },
  "Chihuahua": { x: 41, y: 20 },
  "Torreón": { x: 48, y: 33 },
  "USA Texas": { x: 72, y: 10 },
  "McAllen": { x: 66, y: 20 },
  "WM Monterrey": { x: 60, y: 27 },
  "WM MEX": { x: 56, y: 62 },
  "WM Guadalajara": { x: 44, y: 56 },
  "WM Villahermosa": { x: 76, y: 72 },
};

export default function MapaTive({ trailers = [] }) {
  // Agrupa trailers en ruta por destino
  const porDestino = {};
  trailers.forEach((t) => {
    const d = t.dest || "Sin destino";
    (porDestino[d] = porDestino[d] || []).push(t);
  });
  const grupos = Object.entries(porDestino);
  const sinUbicacion = grupos.filter(([d]) => !PUNTOS[d]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-900">🛰️ Mapa en vivo — México</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">TIVE · tiempo real (se conectará el API)</span>
      </div>

      <div className="relative w-full" style={{ height: "340px", background: "linear-gradient(160deg,#eff6ff 0%,#ecfdf5 100%)" }}>
        {/* Silueta estilizada de México (placeholder) */}
        <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-30">
          <path d="M10 9 L26 7 L33 12 L44 13 L52 9 L66 8 L74 9 L70 16 L64 22 L60 27 L58 33 L62 40 L60 48 L54 55 L48 50 L44 44 L40 47 L36 44 L33 40 L30 42 L27 38 L22 30 L18 22 L14 16 Z"
            fill="#a7f3d0" stroke="#34d399" strokeWidth="0.5" />
        </svg>
        <div className="absolute top-2 left-3 text-[11px] font-bold tracking-widest text-emerald-700/40">MÉXICO</div>

        {/* Pines por destino */}
        {grupos.map(([dest, ts]) => {
          const p = PUNTOS[dest];
          if (!p) return null;
          return (
            <div key={dest} className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center" style={{ left: `${p.x}%`, top: `${p.y}%` }} title={`${dest} · ${ts.length} en ruta`}>
              <div className="px-2 py-0.5 rounded-full bg-white border border-gray-300 shadow-sm text-[10px] font-semibold text-gray-700 whitespace-nowrap mb-0.5">{dest} · {ts.length}</div>
              <div className="w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white shadow ring-2 ring-green-500/30"></div>
            </div>
          );
        })}

        {trailers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl mb-1">🛰️</div>
              <div className="text-xs text-gray-500">No hay trailers en ruta para mostrar en el mapa.</div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
        <span>🟢 {trailers.length} trailer{trailers.length === 1 ? "" : "s"} en ruta</span>
        {sinUbicacion.length > 0 && (
          <span className="text-amber-600">Sin punto en el mapa: {sinUbicacion.map(([d, ts]) => `${d} (${ts.length})`).join(", ")}</span>
        )}
      </div>
    </div>
  );
}
