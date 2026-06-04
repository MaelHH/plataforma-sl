import { createContext, useContext, useState, useEffect, useCallback } from "react";

// ─── PERSISTENCIA (localStorage) + ESTAMPADO DE TIEMPO ───
// Versionado de la llave para poder migrar el esquema cuando llegue el backend real.
const STORAGE_KEY = "plataforma_sl_estado_v1";

function leerEstado() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Devuelve el instante actual en formato backend-ready (ISO/UTC) + texto local.
export function ahora() {
  const d = new Date();
  return {
    iso: d.toISOString(),
    local: d.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }),
  };
}

function nuevoId() {
  try {
    return crypto.randomUUID();
  } catch {
    return "ev_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}

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
  { id: "BP_XL_11KG", label: "Bell Pepper XL 11 KG", color: "bg-orange-100 text-orange-800", cajasPorParrilla: 56, cultivo: "BP", librasPorCaja: 24 },
  { id: "BP_55CT", label: "Bell Pepper 55 CT WM USA", color: "bg-orange-100 text-orange-800", cajasPorParrilla: 45, cultivo: "BP", librasPorCaja: 25 },
  { id: "BP_65CT", label: "Bell Pepper 65 CT WM USA", color: "bg-orange-200 text-orange-900", cajasPorParrilla: 45, cultivo: "BP", librasPorCaja: 25 },
  { id: "BP_EURO48", label: "Bell Pepper Eurobox 48CT XLG", color: "bg-amber-100 text-amber-800", cajasPorParrilla: 50, cultivo: "BP", librasPorCaja: 22 },
  { id: "BP_BOLSA8X6", label: "Bell Pepper Bolsa 8x6", color: "bg-yellow-100 text-yellow-800", cajasPorParrilla: 50, cultivo: "BP", librasPorCaja: 18 },
  { id: "EJ_WM17", label: "Ejote Walmart 1.7 USA", color: "bg-green-100 text-green-800", cajasPorParrilla: 50, cultivo: "EJ", librasPorCaja: 20 },
  { id: "EJ_CONV5LBS", label: "Ejote Conv. 2 bolsas 5lbs", color: "bg-teal-100 text-teal-800", cajasPorParrilla: 88, cultivo: "EJ", librasPorCaja: 10 },
  { id: "EJ_MKT_WM", label: "Ejote Market Side WM", color: "bg-emerald-100 text-emerald-800", cajasPorParrilla: 88, cultivo: "EJ", librasPorCaja: 15 },
  { id: "EJ_ORG_ALS", label: "Ejote Orgánico 14 Bolsas Alsuper", color: "bg-lime-100 text-lime-800", cajasPorParrilla: 80, cultivo: "EJ", librasPorCaja: 14 },
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

// ─── CONTROL DE CALIDAD (recepción) ───
// Categorías de defectos: calidad, condición y plaga
export const CATS_QC = {
  calidad: { label: "% D. Calidad", color: "text-blue-700" },
  condicion: { label: "% D. Condición", color: "text-amber-700" },
  plaga: { label: "% D. Plaga", color: "text-red-700" },
};

// Catálogo de defectos en el orden de la hoja de QC (cada uno con su categoría)
export const DEFECTOS_QC = [
  { id: "DEFORME", label: "Deforme", cat: "calidad" },
  { id: "CICATRIZ", label: "Cicatriz", cat: "calidad" },
  { id: "QUEBRADO", label: "Quebrado", cat: "calidad" },
  { id: "MACHACADO", label: "Machacado", cat: "calidad" },
  { id: "EJOTE_CLARO", label: "Ejote claro", cat: "calidad" },
  { id: "FLOJO_TIERNO", label: "Flojo / Tierno", cat: "calidad" },
  { id: "MARCADO", label: "Marcado", cat: "calidad" },
  { id: "BEANY", label: "Beany", cat: "calidad" },
  { id: "BOFO", label: "Bofo", cat: "calidad" },
  { id: "HOJA_RACIMOS", label: "Hoja / Racimos", cat: "calidad" },
  { id: "DESHIDRATADO", label: "Deshidratado", cat: "condicion" },
  { id: "HONGO_BACTERIA", label: "Hongo / Bacteria", cat: "condicion" },
  { id: "OXIDADO", label: "Oxidado", cat: "condicion" },
  { id: "PUNTA_OXIDADA", label: "Punta oxidada", cat: "condicion" },
  { id: "GOTA_AGUA", label: "Gota de agua", cat: "condicion" },
  { id: "PUDRICION", label: "Pudrición", cat: "condicion" },
  { id: "DANO_CHINCHE", label: "Daño de chinche", cat: "plaga" },
  { id: "DANO_GUSANO", label: "Daño de gusano", cat: "plaga" },
  { id: "TRIP", label: "Trip", cat: "plaga" },
  { id: "DANO_RATA", label: "Daño de rata", cat: "plaga" },
  { id: "VIROSIS", label: "Virosis", cat: "plaga" },
];

export const MAX_MUESTREOS = 3;

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

// Catálogo inicial de líneas de transporte (con subcatálogos: choferes, tractos, cajas)
const LINEAS_INICIAL = [
  {
    id: "L1", linea: "Transportes del Pacífico", contacto: "Ramón Soto", numero: "667-123-4567",
    choferes: [{ id: "CH1", nombre: "Carlos Mendoza", telefono: "667-987-6543", licencia: "LIC-88721" }],
    tractos: [{ id: "TR1", marcaModelo: "Kenworth T680", placa: "ABC-1234" }],
    cajas: [{ id: "CJ1", economico: "C-0042", placa: "XYZ-9876" }],
  },
  {
    id: "L2", linea: "Fletes del Norte", contacto: "Sandra López", numero: "668-555-9900",
    choferes: [{ id: "CH2", nombre: "Miguel Ángel Ruiz", telefono: "668-321-7654", licencia: "LIC-44502" }],
    tractos: [{ id: "TR2", marcaModelo: "International LT", placa: "DEF-5678" }],
    cajas: [{ id: "CJ2", economico: "C-0087", placa: "MNO-4321" }],
  },
  {
    id: "L3", linea: "Logística Sinaloa", contacto: "Pedro Vega", numero: "669-777-1122",
    choferes: [{ id: "CH3", nombre: "José Luis Torres", telefono: "669-444-2211", licencia: "LIC-33180" }],
    tractos: [{ id: "TR3", marcaModelo: "Freightliner Cascadia", placa: "GHI-9012" }],
    cajas: [{ id: "CJ3", economico: "C-0103", placa: "PQR-8765" }],
  },
];

// Catálogo de "qué se carga" en movimientos de campo (producto/empaque)
const CARGA_CAMPO_INICIAL = [
  { id: "CC1", label: "Caja c/flete" },
  { id: "CC2", label: "Fresco" },
  { id: "CC3", label: "Cajas vacías" },
  { id: "CC4", label: "Bins" },
  { id: "CC5", label: "Taras" },
];

// Catálogo de orígenes (ranchos/campos) y destinos (empaques) para movimientos internos
const UBICACIONES_INICIAL = {
  origenes: [
    { id: "OR1", nombre: "San Quintín, B.C." },
    { id: "OR2", nombre: "Los Mochis, Sinaloa" },
    { id: "OR3", nombre: "Culiacán, Sinaloa" },
  ],
  destinos: [
    { id: "DE1", nombre: "Empaque Los Mochis" },
    { id: "DE2", nombre: "Empaque Culiacán" },
    { id: "DE3", nombre: "Empaque Guasave" },
  ],
};

const mockTrailers = [
  { id: 1, fecha: "Lun 26", origen: ORIGEN, dest: "USA Texas", status: "en_instalaciones", linea: "Transportes del Pacífico", contacto: "Ramón Soto", numero: "667-123-4567", chofer: "Carlos Mendoza", marcaModelo: "Kenworth T680", placaTracto: "ABC-1234", economicoCaja: "C-0042", placaCaja: "XYZ-9876", licencia: "LIC-88721", telefono: "667-987-6543", flete: "18500" },
  { id: 2, fecha: "Lun 26", origen: ORIGEN, dest: "WM MEX", status: "en_instalaciones", linea: "Fletes del Norte", contacto: "Sandra López", numero: "668-555-9900", chofer: "Miguel Ángel Ruiz", marcaModelo: "International LT", placaTracto: "DEF-5678", economicoCaja: "C-0087", placaCaja: "MNO-4321", licencia: "LIC-44502", telefono: "668-321-7654", flete: "9200" },
  { id: 3, fecha: "Mar 27", origen: ORIGEN, dest: "McAllen", status: "esperando", linea: "Logística Sinaloa", contacto: "Pedro Vega", numero: "669-777-1122", chofer: "José Luis Torres", marcaModelo: "Freightliner Cascadia", placaTracto: "GHI-9012", economicoCaja: "C-0103", placaCaja: "PQR-8765", licencia: "LIC-33180", telefono: "669-444-2211", flete: "22000" },
];

// ─── CONTEXT ───
const DatosContext = createContext(null);

export function DatosProvider({ children }) {
  const guardado = leerEstado(); // estado persistido en localStorage (o {})

  const [trailers, setTrailers] = useState(guardado.trailers ?? mockTrailers);
  const [cargasEmbarques, setCargasEmbarques] = useState(guardado.cargasEmbarques ?? []);
  const [monitoreo, setMonitoreo] = useState(guardado.monitoreo ?? {});
  const [catalogo, setCatalogo] = useState(guardado.catalogo ?? CATALOGO_INICIAL);
  const [cultivos, setCultivos] = useState(guardado.cultivos ?? CULTIVOS_INICIAL);
  const [programa, setPrograma] = useState(guardado.programa ?? {}); // { "2026-05-26": [ {presId, origen, dest, dias:[7]} ] }
  const [requerimientoGen, setRequerimientoGen] = useState(guardado.requerimientoGen ?? {}); // { "2026-05-26": [ {tipo, fecha, diIdx, origen, dest, sol} ] }
  const [requerimientoMeta, setRequerimientoMeta] = useState(guardado.requerimientoMeta ?? {}); // { semana: { enviadoTs, enviadoLocal, actor } }
  const [responsables, setResponsables] = useState(guardado.responsables ?? ["Francisco Flores", "Kiko"]); // nombres usados en monitoreo
  const [lineas, setLineas] = useState(guardado.lineas ?? LINEAS_INICIAL); // catálogo de líneas de transporte
  const [movimientos, setMovimientos] = useState(guardado.movimientos ?? []); // movimientos internos campo→empaque
  const [cargaCampo, setCargaCampo] = useState(guardado.cargaCampo ?? CARGA_CAMPO_INICIAL); // catálogo de qué se carga
  const [ubicaciones, setUbicaciones] = useState(guardado.ubicaciones ?? UBICACIONES_INICIAL); // ranchos/empaques
  const [bitacora, setBitacora] = useState(guardado.bitacora ?? []); // registro de eventos con timestamp (backend-ready)

  // Persistir todo el estado en localStorage ante cualquier cambio.
  useEffect(() => {
    const estado = { trailers, cargasEmbarques, monitoreo, catalogo, cultivos, programa, requerimientoGen, requerimientoMeta, responsables, lineas, movimientos, cargaCampo, ubicaciones, bitacora };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
    } catch (e) {
      // Puede excederse la cuota (p. ej. fotos base64 grandes). No rompemos la app.
      console.warn("No se pudo guardar en localStorage:", e);
    }
  }, [trailers, cargasEmbarques, monitoreo, catalogo, cultivos, programa, requerimientoGen, requerimientoMeta, responsables, lineas, movimientos, cargaCampo, ubicaciones, bitacora]);

  // Registra un evento en la bitácora con estampa de tiempo. Esquema listo para el backend:
  //   { id, ts (ISO/UTC), tsLocal, evento, modulo, actor, destino, ref, detalle, meta }
  const registrarEvento = useCallback((ev) => {
    const t = ahora();
    setBitacora((prev) => [{ id: nuevoId(), ts: t.iso, tsLocal: t.local, ...ev }, ...prev]);
  }, []);

  const value = {
    trailers, setTrailers, cargasEmbarques, setCargasEmbarques, monitoreo, setMonitoreo,
    catalogo, setCatalogo, cultivos, setCultivos, programa, setPrograma,
    requerimientoGen, setRequerimientoGen, requerimientoMeta, setRequerimientoMeta,
    responsables, setResponsables, lineas, setLineas, movimientos, setMovimientos,
    cargaCampo, setCargaCampo, ubicaciones, setUbicaciones,
    bitacora, setBitacora, registrarEvento,
  };
  return <DatosContext.Provider value={value}>{children}</DatosContext.Provider>;
}

export function useDatos() {
  return useContext(DatosContext);
}