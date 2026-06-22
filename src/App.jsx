import { useState, Component } from "react";
import "./index.css";
import { DatosProvider, useDatos } from "./store/datos";

// Indicador de conexión al backend (verde = backend, ámbar = modo local).
function EstadoConexion() {
  const { fuente, cargando } = useDatos();
  if (cargando) return <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse"></span>Conectando…</span>;
  return fuente === "backend"
    ? <span className="flex items-center gap-1.5 text-green-600"><span className="w-2 h-2 rounded-full bg-green-500"></span>Backend conectado</span>
    : <span className="flex items-center gap-1.5 text-amber-600" title="El backend no respondió; los datos se guardan solo en este navegador."><span className="w-2 h-2 rounded-full bg-amber-500"></span>Modo local (sin backend)</span>;
}
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
import Modulo13 from "./modulos/Modulo13";

// `desc`: descripción corta visible en el front (banner arriba del módulo).
// El detalle profundo de cada módulo está en CLAUDE.md.
const MODULOS = [
  { id: 0, nombre: "Dashboard", sub: "Dirección / Gerencia", icono: "📈", desc: "Visión general para dirección: KPIs de la semana, avance por destino, costos y alertas." },
  { id: 13, nombre: "Movimiento Materiales", sub: "Materiales", icono: "🧱", desc: "Registra el movimiento de materiales con los mismos datos del fletero (línea/chofer/tracto/caja) y marca si los materiales iban arriba del trailer. Catálogo de materiales (a futuro desde SAP)." },
  { id: 8, nombre: "Movimientos Campo → Empaques", sub: "Oscar", icono: "🌾", desc: "Oscar registra cada flete que sale del campo hacia el empaque: remisión, rancho/lote, carga y transporte. Alimenta a Recepción." },
  { id: 9, nombre: "Empaque", sub: "Empaque", icono: "📥", desc: "Empaque confirma la llegada de los fletes (calidad/inspección/rechazo) y registra el vaciado de bins a producción (Vaciado a Empaque)." },
  { id: 1, nombre: "Programa Semanal", sub: "José Carlos", icono: "📋", desc: "Planeación semanal: presentaciones por cultivo y cajas por día." },
  { id: 2, nombre: "Cálculo de Trailers", sub: "Kiko / Alfonso", icono: "🚛", desc: "Calcula cuántos trailers se necesitan (contratos + mercado abierto) y genera el requerimiento que recibe Mónica." },
  { id: 3, nombre: "Tablero de Tráfico", sub: "Mónica", icono: "📊", desc: "Mónica consigue los trailers y confirma su llegada (los marca 'en instalaciones'). De ahí en adelante (carga, embarque…) es de otra área." },
  { id: 4, nombre: "Evidencias de Carga", sub: "Francisco", icono: "📸", desc: "Francisco sube fotos de carga y distribución por empresa del trailer, y lo envía a Embarques." },
  { id: 5, nombre: "Embarques", sub: "Daniel / Cristina", icono: "📦", desc: "Registro del embarque: se captura el manifiesto (folio) de cada empresa y se marca la carga como subida a SAP. (Aquí se REGISTRA.)" },
  { id: 6, nombre: "Consolidado y Fletes", sub: "Cristina", icono: "💰", desc: "Reparto del flete entre las empresas de un consolidado (cuánto cobra cada una), con vista base de datos y export a Excel. (Aquí se COBRA/REPORTA.)" },
  { id: 7, nombre: "Monitoreo en Ruta", sub: "Francisco / Kiko", icono: "🛰️", desc: "Seguimiento en ruta con mapa de México (TIVE) y eventos: preenfriado, retenes, aduanas, accidentes." },
  { id: 12, nombre: "QC - Bodegas", sub: "Control de Calidad", icono: "🔬", desc: "Control de calidad en las bodegas de EE.UU. (al llegar el embarque): inspección por producto y defectos (peso → %), con reporte QC tipo dashboard." },
  { id: 10, nombre: "Importaciones de Materiales", sub: "Comercio Exterior", icono: "🛃", desc: "Documenta la importación temporal de materiales y controla la fecha límite de salida (sin impuesto/multa)." },
  { id: 11, nombre: "Documentos / Impresiones", sub: "Expedientes en PDF", icono: "📄", desc: "Centro de impresión de expedientes en PDF: por Remisión (campo) y por Flete (exportación)." },
];

// Red de seguridad: si un módulo truena, muestra el error y deja seguir navegando.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Error en módulo:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="text-sm font-semibold text-red-700 mb-1">⚠️ Este módulo tuvo un error</div>
          <div className="text-xs text-red-600 mb-3 font-mono break-words">{String(this.state.error?.message || this.state.error)}</div>
          <div className="text-xs text-gray-500">Cambia de módulo en el menú o recarga la página. Si pasa seguido, dime qué dice el mensaje de arriba.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [moduloActivo, setModuloActivo] = useState(0);
  const modActivo = MODULOS.find((m) => m.id === moduloActivo);

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
          <div className="p-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
            <EstadoConexion />
            <div>📍 Los Mochis, Sinaloa</div>
          </div>
        </div>

        {/* Contenido del módulo */}
        <div className="flex-1 overflow-auto">
          <div className="p-8 max-w-6xl mx-auto">
            {modActivo?.desc && (
              <div className="mb-4 flex items-start gap-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
                <span className="text-base leading-none">{modActivo.icono}</span>
                <span><b className="text-gray-900">{modActivo.nombre}.</b> {modActivo.desc}</span>
              </div>
            )}
            <ErrorBoundary key={moduloActivo}>
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
              {moduloActivo === 13 && <Modulo13 />}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </DatosProvider>
  );
}