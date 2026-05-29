import { useState } from "react";
import "./index.css";
import { DatosProvider } from "./store/datos";
import Modulo1 from "./modulos/Modulo1";
import Modulo2 from "./modulos/Modulo2";
import Modulo3 from "./modulos/Modulo3";
import Modulo4 from "./modulos/Modulo4";
import Modulo5 from "./modulos/Modulo5";
import Modulo6 from "./modulos/Modulo6";
import Modulo7 from "./modulos/Modulo7";

const MODULOS = [
  { id: 1, nombre: "Programa SL Produce", icono: "📋" },
  { id: 2, nombre: "Cálculo de trailers", icono: "🚛" },
  { id: 3, nombre: "Tablero Mónica", icono: "📊" },
  { id: 4, nombre: "Dispatcher Francisco", icono: "📸" },
  { id: 5, nombre: "Embarques", icono: "📦" },
  { id: 6, nombre: "Consolidado Cristina", icono: "💰" },
  { id: 7, nombre: "Monitoreo Logístico", icono: "🛰️" },
];

export default function App() {
  const [moduloActivo, setModuloActivo] = useState(1);

  return (
    <DatosProvider>
      <div className="flex h-screen bg-gray-50">
        {/* Menú lateral */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h1 className="text-base font-bold text-gray-900">Plataforma Logística SL</h1>
            <p className="text-xs text-gray-500 mt-0.5">SL Produce · SL Agrícola</p>
          </div>
          <nav className="flex-1 p-2">
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
                <span>{m.icono}</span>
                <span>{m.nombre}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-100 text-xs text-gray-400">
            Los Mochis, Sinaloa
          </div>
        </div>

        {/* Contenido del módulo */}
        <div className="flex-1 overflow-auto">
          <div className="p-8">
            {moduloActivo === 1 && <Modulo1 />}
            {moduloActivo === 2 && <Modulo2 />}
            {moduloActivo === 3 && <Modulo3 />}
            {moduloActivo === 4 && <Modulo4 />}
            {moduloActivo === 5 && <Modulo5 />}
            {moduloActivo === 6 && <Modulo6 />}
            {moduloActivo === 7 && <Modulo7 />}
          </div>
        </div>
      </div>
    </DatosProvider>
  );
}