import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Mapa real de México (Leaflet + OpenStreetMap) para Monitoreo en Ruta.
// Coloca un pin por destino con los trailers en ruta. Listo para el API de TIVE:
// cuando llegue, se reemplazan estas coordenadas por las del rastreador real.
const COORDS = {
  "Los Mochis, Sinaloa": [25.79, -108.99],
  "Culiacán, Sinaloa": [24.81, -107.39],
  "WM Culiacán": [24.81, -107.39],
  "Guasave, Sinaloa": [25.57, -108.47],
  "Hermosillo": [29.07, -110.96],
  "USA Nogales": [31.31, -110.94],
  "Nogales": [31.31, -110.94],
  "Chihuahua": [28.63, -106.08],
  "Torreón": [25.54, -103.41],
  "USA Texas": [27.6, -99.5],
  "McAllen": [26.20, -98.23],
  "WM Monterrey": [25.69, -100.32],
  "WM MEX": [19.43, -99.13],
  "WM Guadalajara": [20.67, -103.35],
  "WM Villahermosa": [17.99, -92.93],
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export default function MapaTive({ trailers = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Inicializa el mapa una sola vez
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([23.6, -102.5], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  // Actualiza los pines cuando cambian los trailers
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const porDestino = {};
    trailers.forEach((t) => { const d = t.dest || "Sin destino"; (porDestino[d] = porDestino[d] || []).push(t); });
    Object.entries(porDestino).forEach(([dest, ts]) => {
      const c = COORDS[dest];
      if (!c) return;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:140px;height:38px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px">
          <div style="background:#fff;border:1px solid #cbd5e1;border-radius:9999px;padding:1px 7px;font-size:10px;font-weight:600;color:#374151;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.18)">${esc(dest)} · ${ts.length}</div>
          <div style="width:14px;height:14px;border-radius:9999px;background:#22c55e;border:2px solid #fff;box-shadow:0 0 0 3px rgba(34,197,94,.35)"></div>
        </div>`,
        iconSize: [140, 38],
        iconAnchor: [70, 38],
      });
      L.marker(c, { icon }).addTo(layer).bindPopup(`<b>${esc(dest)}</b><br/>${ts.length} trailer(s) en ruta`);
    });
  }, [trailers]);

  const sinUbic = [...new Set(trailers.map((t) => t.dest || "Sin destino"))].filter((d) => !COORDS[d]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-900">🛰️ Mapa en vivo — México</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">TIVE · tiempo real (se conectará el API)</span>
      </div>
      <div ref={containerRef} style={{ height: "360px", width: "100%", zIndex: 0 }} />
      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
        <span>🟢 {trailers.length} trailer{trailers.length === 1 ? "" : "s"} en ruta</span>
        {sinUbic.length > 0 && <span className="text-amber-600">Sin coordenadas: {sinUbic.join(", ")}</span>}
      </div>
    </div>
  );
}
