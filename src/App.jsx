import { useState } from "react";
import "./index.css";
import { DatosProvider } from "./store/datos";
import Dashboard from "./modulos/Dashboard";
import Modulo1 from "./modulos/Modulo1";
import Modulo2 from "./modulos/Modulo2";
import Modulo3 from "./modulos/Modulo3";
import Modulo4 from "./modulos/Modulo4";
import Modulo5 from "./modulos/Modulo5";
import Modulo6 from "./modulos/Modulo6";
import Modulo7 from "./modulos/Modulo7";
import Modulo8 from "./modulos/Modulo8";
import Modulo9 from "./modulos/Modulo9";
import Modulo10 from "./modulos/Modulo10";
import Modulo11 from "./modulos/Modulo11";
import Modulo12 from "./modulos/Modulo12";

const MODULOS = [
  { id: 0, nombre: "Dashboard", sub: "Dirección / Gerencia", icono: "📈" },
  { id: 8, nombre: "Movimientos Campo → Empaques", sub: "Oscar", icono: "🌾" },
  { id: 9, nombre: "Recepción en Empaque", sub: "Empaque", icono: "📥" },
  { id: 1, nombre: "Programa Semanal", sub: "José Carlos", icono: "📋" },
  { id: 2, nombre: "Cálculo de Trailers", sub: "Kiko / Alfonso", icono: "🚛" },
  { id: 3, nombre: "Tablero de Tráfico", sub: "Mónica", icono: "📊" },
  { id: 4, nombre: "Evidencias de Carga", sub: "Francisco", icono: "📸" },
  { id: 5, nombre: "Embarques", sub: "Daniel / Cristina", icono: "📦" },
  { id: 12, nombre: "Aprobación de Calidad", sub: "Control de Calidad", icono: "🔬" },
  { id: 6, nombre: "Consolidado y Fletes", sub: "Cristina", icono: "💰" },
  { id: 7, nombre: "Monitoreo en Ruta", sub: "Francisco / Kiko", icono: "🛰️" },
  { id: 10, nombre: "Importaciones de Materiales", sub: "Comercio Exterior", icono: "🛃" },
  { id: 11, nombre: "Documentos / Impresiones", sub: "Expedientes en PDF", icono: "📄" },
];

export default function App() {
  const [moduloActivo, setModuloActivo] = useState(0);

  return (
    <DatosProvider>
      <div className="flex h-screen bg-gray-50">
        {/* Menú lateral */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">SL</div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">SL Logística</h1>
              <p className="text-xs text-gray-500">SL Produce · SL Agrícola</p>
            </div>
          </div>
          <nav className="flex-1 p-2 overflow-y-auto">
            {MODULOS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModuloActivo(m.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-1 transition-colors ${
                  moduloActivo === m.id
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="text-base">{m.icono}</span>
                <div className="text-left leading-tight">
                  <div>{m.nombre}</div>
                  <div className={`text-xs font-normal ${moduloActivo === m.id ? "text-blue-400" : "text-gray-400"}`}>{m.sub}</div>
                </div>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-100 text-xs text-gray-400">
            📍 Los Mochis, Sinaloa
          </div>
        </div>

        {/* Contenido del módulo */}
        <div className="flex-1 overflow-auto">
          <div className="p-8 max-w-6xl mx-auto">
            {moduloActivo === 0 && <Dashboard />}
            {moduloActivo === 1 && <Modulo1 />}
            {moduloActivo === 2 && <Modulo2 />}
            {moduloActivo === 3 && <Modulo3 />}
            {moduloActivo === 4 && <Modulo4 />}
            {moduloActivo === 5 && <Modulo5 />}
            {moduloActivo === 6 && <Modulo6 />}
            {moduloActivo === 7 && <Modulo7 />}
            {moduloActivo === 8 && <Modulo8 />}
            {moduloActivo === 9 && <Modulo9 />}
            {moduloActivo === 10 && <Modulo10 />}
            {moduloActivo === 11 && <Modulo11 />}
            {moduloActivo === 12 && <Modulo12 />}
          </div>
        </div>
      </div>
    </DatosProvider>
  );
}