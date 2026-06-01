import { createContext, useContext, useState } from "react";

// ─── CONSTANTES ───
export const ORIGEN = "Los Mochis, Sinaloa";
export const TOTAL = 30;
export const FECHAS = ["Lun 26", "Mar 27", "Mié 28", "Jue 29", "Vie 30", "Sáb 31", "Dom 1"];
export const ORIGENES = ["Los Mochis, Sinaloa", "Culiacán, Sinaloa", "Guasave, Sinaloa"];
export const DESTINOS_ALL = ["Sin asignar", "USA Texas", "USA Nogales", "McAllen", "WM MEX", "WM Culiacán", "WM Guadalajara", "WM Monterrey", "WM Villahermosa", "Hermosillo", "Chihuahua", "Torreón"];

export const EMPRESAS = [
  { id: "SL_AGR", label: "SL Agrícola", color: "bg-green-100 text-green-800", border: "border-green-300" },
  { id: "CAT", label: "CAT", color: "bg-blue-100 text-blue-800", border: "border-blue-300" },
  { id: "CACO", label: "CACO", color: "bg-purple-100 text-purple-800", border: "border-purple-300" },
];

// Cultivos (pestañas del programa) — ampliable a futuro
export const CULTIVOS_INICIAL = [
  { id: "BP", label: "Bell Pepper SL", color: "orange" },
  { id: "EJ", label: "SL Agrícola Ejote", color: "green" },
];

// Catálogo inicial de presentaciones (cajasPorParrilla es la clave del cálculo)
const CATALOGO_INICIAL = [
  { id: "BP_XL_11KG", label: "Bell Pepper XL 11 KG", color: "bg-orange-100 text-orange-800", cajasPorParrilla: 20, cultivo: "BP", librasPorCaja: 24 },
  { id: "BP_55CT", label: "Bell Pepper 55 CT WM USA", color: "bg-orange-100 text-orange-800", cajasPorParrilla: 48, cultivo: "BP", librasPorCaja: 25 },
  { id: "BP_65CT", label: "Bell Pepper 65 CT WM USA", color: "bg-orange-200 text-orange-900", cajasPorParrilla: 48, cultivo: "BP", librasPorCaja: 25 },
  { id: "BP_EURO48", label: "Bell Pepper Eurobox 48CT XLG", color: "bg-amber-100 text-amber-800", cajasPorParrilla: 35, cultivo: "BP", librasPorCaja: 22 },
  { id: "BP_BOLSA8X6", label: "Bell Pepper Bolsa 8x6", color: "bg-yellow-100 text-yellow-800", cajasPorParrilla: 48, cultivo: "BP", librasPorCaja: 18 },
  { id: "EJ_WM17", label: "Ejote Walmart 1.7 USA", color: "bg-green-100 text-green-800", cajasPorParrilla: 24, cultivo: "EJ", librasPorCaja: 20 },
  { id: "EJ_CONV5LBS", label: "Ejote Conv. 2 bolsas 5lbs", color: "bg-teal-100 text-teal-800", cajasPorParrilla: 12, cultivo: "EJ", librasPorCaja: 10 },
  { id: "EJ_MKT_WM", label: "Ejote Market Side WM", color: "bg-emerald-100 text-emerald-800", cajasPorParrilla: 16, cultivo: "EJ", librasPorCaja: 15 },
  { id: "EJ_ORG_ALS", label: "Ejote Orgánico 14 Bolsas Alsuper", color: "bg-lime-100 text-lime-800", cajasPorParrilla: 14, cultivo: "EJ", librasPorCaja: 14 },
];

// Opción "sin asignar" para los selects (no editable)
export const CAT_VACIO = { id: "", label: "— Sin asignar —", color: "bg-gray-100 text-gray-500", cajasPorParrilla: 0, librasPorCaja: 0 };

// Paleta de colores para nuevas presentaciones
export const COLORES_CAT = [
  "bg-orange-100 text-orange-800", "bg-green-100 text-green-800", "bg-blue-100 text-blue-800",
  "bg-purple-100 text-purple-800", "bg-teal-100 text-teal-800", "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-800", "bg-cyan-100 text-cyan-800", "bg-lime-100 text-lime-800",
];

export const DC = {
  "USA Texas": "bg-orange-100 text-orange-800 border-orange-200",
  "USA Nogales": "bg-green-100 text-green-800 border-green-200",
  "McAllen": "bg-blue-100 text-blue-800 border-blue-200",
  "WM MEX": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "WM Culiacán": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Sin asignar": "bg-gray-100 text-gray-500 border-gray-200",
};

export const STATUS_CFG = {
  esperando: { label: "Esperando", dot: "bg-gray-400", card: "border-gray-200 bg-white" },
  en_instalaciones: { label: "En instalaciones", dot: "bg-blue-500", card: "border-blue-300 bg-blue-50" },
  en_ruta: { label: "En ruta 🚛", dot: "bg-green-500", card: "border-green-300 bg-green-50" },
};

export function idxToParr(idx) { return idx < 15 ? idx * 2 + 1 : (idx - 15) * 2 + 2; }

// ─── MANEJO DE SEMANAS ───
const DIAS_ABREV = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES_ABREV = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Dada una fecha (lunes), devuelve los 7 días con etiqueta "Lun 26"
export function calcularDias(fechaLunes) {
  const base = new Date(fechaLunes + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return `${DIAS_ABREV[i]} ${d.getDate()}`;
  });
}

// Etiqueta de la semana, ej. "26 may – 1 jun 2026"
export function etiquetaSemana(fechaLunes) {
  const base = new Date(fechaLunes + "T00:00:00");
  const fin = new Date(base);
  fin.setDate(base.getDate() + 6);
  const ini = `${base.getDate()} ${MESES_ABREV[base.getMonth()]}`;
  const finStr = `${fin.getDate()} ${MESES_ABREV[fin.getMonth()]} ${fin.getFullYear()}`;
  return `${ini} – ${finStr}`;
}

// Suma o resta semanas a una fecha de lunes (devuelve nueva fecha YYYY-MM-DD)
export function moverSemana(fechaLunes, deltas) {
  const d = new Date(fechaLunes + "T00:00:00");
  d.setDate(d.getDate() + deltas * 7);
  return d.toISOString().slice(0, 10);
}

export const requerimiento = [
  { id: 0, tipo: "Contrato", fecha: "Lun 26", origen: ORIGEN, dest: "USA Texas", sol: 4 },
  { id: 1, tipo: "Contrato", fecha: "Lun 26", origen: ORIGEN, dest: "WM MEX", sol: 2 },
  { id: 2, tipo: "Contrato", fecha: "Mar 27", origen: ORIGEN, dest: "USA Texas", sol: 6 },
  { id: 3, tipo: "Contrato", fecha: "Mar 27", origen: ORIGEN, dest: "USA Nogales", sol: 4 },
  { id: 4, tipo: "Contrato", fecha: "Mar 27", origen: ORIGEN, dest: "McAllen", sol: 7 },
  { id: 5, tipo: "M. Abierto", fecha: "Lun 26", origen: ORIGEN, dest: "USA Nogales", sol: 2 },
  { id: 6, tipo: "M. Abierto", fecha: "Lun 26", origen: ORIGEN, dest: "McAllen", sol: 1 },
];

export const EMPTY_TRAILER = { linea: "", contacto: "", numero: "", chofer: "", marcaModelo: "", placaTracto: "", economicoCaja: "", placaCaja: "", licencia: "", telefono: "", flete: "" };

// Catálogo inicial de líneas de transporte
const LINEAS_INICIAL = [
  { id: "L1", linea: "Transportes del Pacífico", contacto: "Ramón Soto", numero: "667-123-4567" },
  { id: "L2", linea: "Fletes del Norte", contacto: "Sandra López", numero: "668-555-9900" },
  { id: "L3", linea: "Logística Sinaloa", contacto: "Pedro Vega", numero: "669-777-1122" },
];

const mockTrailers = [
  { id: 1, fecha: "Lun 26", origen: ORIGEN, dest: "USA Texas", status: "en_instalaciones", linea: "Transportes del Pacífico", contacto: "Ramón Soto", numero: "667-123-4567", chofer: "Carlos Mendoza", marcaModelo: "Kenworth T680", placaTracto: "ABC-1234", economicoCaja: "C-0042", placaCaja: "XYZ-9876", licencia: "LIC-88721", telefono: "667-987-6543", flete: "18500" },
  { id: 2, fecha: "Lun 26", origen: ORIGEN, dest: "WM MEX", status: "en_instalaciones", linea: "Fletes del Norte", contacto: "Sandra López", numero: "668-555-9900", chofer: "Miguel Ángel Ruiz", marcaModelo: "International LT", placaTracto: "DEF-5678", economicoCaja: "C-0087", placaCaja: "MNO-4321", licencia: "LIC-44502", telefono: "668-321-7654", flete: "9200" },
  { id: 3, fecha: "Mar 27", origen: ORIGEN, dest: "McAllen", status: "esperando", linea: "Logística Sinaloa", contacto: "Pedro Vega", numero: "669-777-1122", chofer: "José Luis Torres", marcaModelo: "Freightliner Cascadia", placaTracto: "GHI-9012", economicoCaja: "C-0103", placaCaja: "PQR-8765", licencia: "LIC-33180", telefono: "669-444-2211", flete: "22000" },
];

// ─── CONTEXT ───
const DatosContext = createContext(null);

export function DatosProvider({ children }) {
  const [trailers, setTrailers] = useState(mockTrailers);
  const [cargasEmbarques, setCargasEmbarques] = useState([]);
  const [monitoreo, setMonitoreo] = useState({});
  const [catalogo, setCatalogo] = useState(CATALOGO_INICIAL);
  const [cultivos, setCultivos] = useState(CULTIVOS_INICIAL);
  const [programa, setPrograma] = useState({}); // { "2026-05-26": [ {presId, origen, dest, dias:[7]} ] }
  const [requerimientoGen, setRequerimientoGen] = useState({}); // { "2026-05-26": [ {tipo, fecha, diIdx, origen, dest, sol} ] }
  const [responsables, setResponsables] = useState(["Francisco Flores", "Kiko"]); // nombres usados en monitoreo
  const [lineas, setLineas] = useState(LINEAS_INICIAL); // catálogo de líneas de transporte

  const value = { trailers, setTrailers, cargasEmbarques, setCargasEmbarques, monitoreo, setMonitoreo, catalogo, setCatalogo, cultivos, setCultivos, programa, setPrograma, requerimientoGen, setRequerimientoGen, responsables, setResponsables, lineas, setLineas };
  return <DatosContext.Provider value={value}>{children}</DatosContext.Provider>;
}

export function useDatos() {
  return useContext(DatosContext);
}