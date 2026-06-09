/* eslint-disable react-refresh/only-export-components --
   El store expone a propósito constantes/utilidades junto al DatosProvider. */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import * as api from "./api";

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

// Genera un ID único (no colisiona aunque se recargue la página). Acepta un
// prefijo opcional para mantener el formato legible de cada catálogo (LN_, CH_…).
export function nuevoId(prefix = "") {
  try {
    return prefix + crypto.randomUUID();
  } catch {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

// ─── INSPECCIÓN DE VEHÍCULO Y PRODUCTO QUE LLEGA A LA PLANTA ───
// Formato REG-EMP-24 / POE-ADM-11 (SL Agrícola). Checklist SI/NO que se llena
// por cada carro/remisión/flete que llega a planta. `malo` indica qué respuesta
// representa una condición indeseable (para resaltarla en pantalla y en el PDF).
export const INSP_VEHICULO = [
  { id: "veh_lodo", label: "Lodo / tierra", malo: "si" },
  { id: "veh_quimica", label: "Contaminación química", malo: "si" },
  { id: "veh_plagas", label: "Plagas, contaminación fecal", malo: "si" },
];

export const INSP_PRODUCTO = [
  { id: "prod_cubierto", label: "Material cubierto", malo: "no" },
  { id: "prod_lodo", label: "Lodo / tierra", malo: "si" },
  { id: "prod_plagas", label: "Plagas, contaminación fecal", malo: "si" },
  { id: "prod_quimica", label: "Contaminación química", malo: "si" },
  { id: "prod_specs", label: "Cumplen con especificaciones", malo: "no" },
];

// ─── REVISIÓN PRECARGA DE TRANSPORTE REFRIGERADO (REG-EMP-15 / POE-MP-09) ───
// Checklist SI/NO que se llena para cada trailer ANTES de cargar. En las áreas
// 1-7 "si" = se encontró problema (hay que reportar al supervisor). En 8-9 lo
// indeseable es "no"; en 10-11 lo indeseable es "si".
export const PRECARGA_PREGUNTAS = [
  { id: "exterior", num: 1, label: "Exterior / sección inferior", malo: "si" },
  { id: "puertas", num: 2, label: "Puertas interiores / exteriores", malo: "si" },
  { id: "lado_der", num: 3, label: "Lado derecho", malo: "si" },
  { id: "lado_izq", num: 4, label: "Lado izquierdo", malo: "si" },
  { id: "pared_del", num: 5, label: "Pared delantera", malo: "si" },
  { id: "techo", num: 6, label: "Techo exterior / interior", malo: "si" },
  { id: "piso", num: 7, label: "Piso", malo: "si" },
  { id: "interior_limpio", num: 8, label: "¿Interior limpio y sin olor?", malo: "no" },
  { id: "preenfrio", num: 9, label: "¿Se pre-enfrió el termo antes de cargar?", malo: "no" },
  { id: "usada_ganado", num: 10, label: "¿La caja se usó antes para ganado / productos de animales no envasados?", malo: "si" },
  { id: "quimicos_plagas", num: 11, label: "¿Se observaron químicos, derrames, plagas o contaminación fecal?", malo: "si" },
];

// Principales alérgenos en México (manifiesto de capacitación al operador)
export const ALERGENOS_MX = ["Soya", "Huevos", "Leche", "Pescado", "Mariscos (crustáceos)", "Trigo", "Cacahuates", "Nueces de árbol", "Sulfito"];

// ─── APROBACIÓN DE CALIDAD DE EMBARQUES (por producto) ───
// Cada producto tiene su propia lista de defectos. Al seleccionar el producto en
// la inspección se cargan SOLO sus defectos. Cada defecto pertenece al grupo
// QUALITY (cat "calidad") o CONDITION (cat "condicion"), coloreados con CATS_QC.
// ⚠️ Catálogo oficial de QC. Para editar: agrega/quita filas en DEFECTOS_ROWS
// ([grupo, defecto]) — "Q" = QUALITY, "C" = CONDITION.

// Filas tal cual el catálogo: producto → [ [grupo, defecto], ... ]  (Q=QUALITY, C=CONDITION)
const DEFECTOS_ROWS = {
  "ZUCCHINI": [["Q","ABNORMALCOLOR"],["C","BRUISES"],["C","DECAY"],["Q","DEFORMED"],["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","SCARS"],["Q","SCUFFING"],["C","SOFT"],["C","SUNKENAREAS"],["Q","UNDERSIZE"]],
  "YELLOW SQUASH": [["Q","ABNORMALCOLOR"],["C","BRUISES"],["C","DECAY"],["Q","DEFORMED"],["Q","FUERADETAMAÑO"],["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","SCARS"],["Q","SCUFFING"],["C","SOFT"],["Q","UNDERSIZE"]],
  "SPAGHETTI": [["Q","ABNORMALCOLOR"],["C","DECAY"],["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","SCARS"],["Q","SCUFFING"],["C","SOFT"],["Q","UNDERSIZE"]],
  "RED BELL PEPPER": [["Q","ABNORMALCOLOR"],["C","BLOSSOM"],["C","DECAY"],["Q","DEFORMED"],["Q","Fumagina"],["Q","IMMATURE"],["C","INSECTDAMAGE"],["C","LIVEINSECT"],["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","NOTCLEAN"],["Q","PITTING"],["Q","SCARS"],["C","SHRIVELED"],["Q","SUNSCALD"],["Q","TURNED"],["C","VIROSIS"],["Q","WETSTEM"]],
  "GREEN BELL PEPPER": [["Q","ABNORMALCOLOR"],["C","BLOSSOM"],["Q","BROWNSTEM"],["C","BRUISES"],["Q","ChillDamage"],["Q","CRUSHED"],["C","DECAY"],["Q","DEFORMED"],["Q","FUERADETAMAÑO"],["Q","Fumagina"],["Q","HOLLOW"],["Q","IMMATURE"],["C","INSECTDAMAGE"],["C","LIVEINSECT"],["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","NOTCLEAN"],["Q","PITTING"],["C","RUSSETING"],["Q","SCARS"],["C","SHRIVELED"],["C","SHRIVELEDENDS"],["Q","SILVERDISCOLORATION"],["C","SOFT"],["C","SOFTTIPS"],["C","SUNKENAREAS"],["Q","SUNSCALD"],["Q","TURNED"],["Q","UNDERSIZE"],["C","VIROSIS"],["Q","WETSTEM"],["Q","YELLOWBELLY"],["Q","YELLOWTIPS"]],
  "GREEN BEANS": [["Q","BEANNY"],["Q","CRUSHED"],["C","DECAY"],["Q","IMMATURE"],["C","INSECTDAMAGE"],["C","MATURE"],["C","MECHANICALDAMAGE"],["C","MOLD"],["C","RUSSETING"],["Q","SCARS"],["C","SHRIVELED"]],
  "GRAY SQUASH": [["Q","ABNORMALCOLOR"],["C","BRUISES"],["C","DECAY"],["Q","DEFORMED"],["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","SCARS"],["Q","SCUFFING"],["C","SOFT"],["Q","UNDERSIZE"]],
  "CUCUMBER": [["Q","ABNORMALCOLOR"],["C","BRUISEDTIP"],["Q","ChillDamage"],["C","DECAY"],["Q","DEFORMED"],["Q","FUERADETAMAÑO"],["Q","HOLLOW"],["C","INSECTDAMAGE"],["Q","INTERNALDISCOLORATION"],["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","NOTCLEAN"],["Q","PITTING"],["C","RUSSETING"],["Q","SCARS"],["C","SHRIVELED"],["C","SHRIVELEDENDS"],["Q","SILVERDISCOLORATION"],["C","SOFT"],["C","SOFTTIPS"],["C","SUNKENAREAS"],["Q","SUNSCALD"],["Q","UNDERSIZE"],["Q","WETSTEM"],["Q","YELLOWBELLY"],["Q","YELLOWTIPS"]],
  "CORN": [["C","DECAY"],["C","DEHYDRATED"],["Q","IMMATURE"],["C","LIVEINSECT"],["Q","MISSIZED"],["Q","UNDERSIZE"]],
  "BUTTERNUT": [["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","SCARS"],["Q","UNDERSIZE"]],
  "BERENJENA": [["Q","ABNORMALCOLOR"],["Q","BROWNSTEM"],["C","BRUISES"],["C","DECAY"],["C","MECHANICALDAMAGE"],["Q","SCARS"],["C","SOFT"],["C","SUNKENAREAS"],["Q","UNDERSIZE"]],
  "ACORN": [["Q","ABNORMALCOLOR"],["C","DECAY"],["C","MECHANICALDAMAGE"],["C","MOLD"],["Q","SCARS"]],
};

// Mapa inicial: producto → [ { id, label, cat } ]. El id se prefija con el producto
// para que no se mezclen defectos del mismo nombre entre productos distintos.
// Este es el VALOR INICIAL; el catálogo vivo es editable (estado defectosCalidad).
export const DEFECTOS_POR_CULTIVO_INICIAL = Object.fromEntries(
  Object.entries(DEFECTOS_ROWS).map(([prod, rows]) => [
    prod,
    rows.map(([g, tok]) => ({ id: `${prod}__${tok}`, label: tok, cat: g === "Q" ? "calidad" : "condicion" })),
  ])
);

// Inspectores de calidad (valor inicial; editable en el catálogo)
export const INSPECTORES_QC_INICIAL = ["ALDO ESTRADA", "FERNANDO BELTRAN", "JESUS GAXIOLA", "LUIS GAXIOLA"];

// Lugares de inspección (valor inicial; editable en el catálogo)
export const LUGARES_QC_INICIAL = ["Traveler", "Agripacking", "Divine Flavour"];

// Estados de la aprobación de calidad de un embarque
export const CALIDAD_ESTADOS = {
  pendiente: { label: "Pendiente", color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-400" },
  aprobado: { label: "Inspeccionado", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500" },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
};

// ─── IMPORTACIONES DE MATERIALES (importación temporal IMMEX) ───
// Catálogo EDITABLE de materiales que se pueden importar. `diasSalida` es el
// periodo (en días) que se tiene para retornar/exportar el material desde la
// fecha de importación SIN generar impuestos/multa. ⚠️ Estos son ejemplos:
// reemplázalos con el catálogo real (código, descripción, unidad, fracción y días).
export const MATERIALES_INICIAL = [
  { id: "MAT1", codigo: "CART-001", descripcion: "Cartón corrugado para caja", unidad: "Pieza", fraccion: "4819.10.01", diasSalida: 540 },
  { id: "MAT2", codigo: "ETI-001", descripcion: "Etiqueta adhesiva PLU", unidad: "Rollo", fraccion: "4821.10.01", diasSalida: 540 },
  { id: "MAT3", codigo: "PEL-001", descripcion: "Película plástica (clamshell)", unidad: "Kg", fraccion: "3920.20.99", diasSalida: 540 },
  { id: "MAT4", codigo: "FLE-001", descripcion: "Fleje plástico", unidad: "Rollo", fraccion: "3923.50.99", diasSalida: 540 },
  { id: "MAT5", codigo: "RPC-6419", descripcion: "Contenedor plástico retornable RPC 6419 (60×40×19 cm)", unidad: "Pieza", fraccion: "3923.10.01", diasSalida: 540 },
];

// Estados del trámite de importación
export const IMPORT_ESTADOS = {
  borrador: { label: "Borrador", icono: "📝", color: "bg-gray-100 text-gray-600 border-gray-200" },
  documentada: { label: "Documentada", icono: "📋", color: "bg-blue-100 text-blue-700 border-blue-200" },
  en_proceso: { label: "En proceso", icono: "⏳", color: "bg-amber-100 text-amber-700 border-amber-200" },
  retornada: { label: "Retornada / Exportada", icono: "✓", color: "bg-green-100 text-green-700 border-green-200" },
};

// Umbral (días) para marcar una fecha límite como "por vencer"
export const DIAS_ALERTA_SALIDA = 15;

// Fecha límite de salida = fecha de importación + días de salida del material
export function fechaLimiteSalida(fechaImportacionISO, diasSalida) {
  if (!fechaImportacionISO) return "";
  const d = new Date(fechaImportacionISO + "T00:00:00");
  d.setDate(d.getDate() + (parseInt(diasSalida, 10) || 0));
  return d.toISOString().slice(0, 10);
}

// Días restantes desde hoy hasta la fecha límite (negativo = vencido)
export function diasRestantesSalida(fechaLimiteISO) {
  if (!fechaLimiteISO) return null;
  const hoy = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  const lim = new Date(fechaLimiteISO + "T00:00:00");
  return Math.round((lim - hoy) / 86400000);
}

// Clasifica la urgencia de la fecha límite
export function estadoVencimiento(diasRestantes) {
  if (diasRestantes == null) return null;
  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= DIAS_ALERTA_SALIDA) return "por_vencer";
  return "vigente";
}

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

// Catálogo de orígenes (ranchos/campos) y destinos (empaques) para movimientos internos.
// Cada rancho tiene su subcatálogo de lotes y responsables de cosecha.
const UBICACIONES_INICIAL = {
  origenes: [
    { id: "OR1", nombre: "San Quintín, B.C.", lotes: ["Paredes", "El Llano"], responsables: ["Juan Pérez"] },
    { id: "OR2", nombre: "Los Mochis, Sinaloa", lotes: [], responsables: [] },
    { id: "OR3", nombre: "Culiacán, Sinaloa", lotes: [], responsables: [] },
  ],
  destinos: [
    { id: "DE1", nombre: "Empaque Los Mochis" },
    { id: "DE2", nombre: "Empaque Culiacán" },
    { id: "DE3", nombre: "Empaque Guasave" },
  ],
};

// Catálogo de zonas (campo "Viaje" en movimientos internos)
export const ZONAS_INICIAL = ["Baja California", "Jalisco", "Sinaloa", "Sonora", "McAllen", "Nogales"];

// Catálogo compartido de empresas para Consignado y Distribuidor
export const CONSIGNADOS_INICIAL = ["SL Agrícola", "CACO", "CAT", "SL Produce"];

const mockTrailers = [
  { id: 1, fecha: "Lun 26", origen: ORIGEN, dest: "USA Texas", status: "en_instalaciones", linea: "Transportes del Pacífico", contacto: "Ramón Soto", numero: "667-123-4567", chofer: "Carlos Mendoza", marcaModelo: "Kenworth T680", placaTracto: "ABC-1234", economicoCaja: "C-0042", placaCaja: "XYZ-9876", licencia: "LIC-88721", telefono: "667-987-6543", flete: "18500" },
  { id: 2, fecha: "Lun 26", origen: ORIGEN, dest: "WM MEX", status: "en_instalaciones", linea: "Fletes del Norte", contacto: "Sandra López", numero: "668-555-9900", chofer: "Miguel Ángel Ruiz", marcaModelo: "International LT", placaTracto: "DEF-5678", economicoCaja: "C-0087", placaCaja: "MNO-4321", licencia: "LIC-44502", telefono: "668-321-7654", flete: "9200" },
  { id: 3, fecha: "Mar 27", origen: ORIGEN, dest: "McAllen", status: "esperando", linea: "Logística Sinaloa", contacto: "Pedro Vega", numero: "669-777-1122", chofer: "José Luis Torres", marcaModelo: "Freightliner Cascadia", placaTracto: "GHI-9012", economicoCaja: "C-0103", placaCaja: "PQR-8765", licencia: "LIC-33180", telefono: "669-444-2211", flete: "22000" },
];

// ─── CONEXIÓN AL BACKEND ───
// Configuración de cada clave del estado: `tipo` ("col" = colección con id, "kv" =
// objeto único) y `seed` (catálogo inicial a sembrar si el backend viene vacío).
const CONFIG = {
  trailers: { tipo: "col", seed: null },
  cargasEmbarques: { tipo: "col", seed: null },
  monitoreo: { tipo: "kv", seed: null },
  catalogo: { tipo: "col", seed: CATALOGO_INICIAL },
  cultivos: { tipo: "col", seed: CULTIVOS_INICIAL },
  programa: { tipo: "kv", seed: null },
  requerimientoGen: { tipo: "kv", seed: null },
  requerimientoMeta: { tipo: "kv", seed: null },
  responsables: { tipo: "kv", seed: ["Francisco Flores", "Kiko"] },
  lineas: { tipo: "col", seed: LINEAS_INICIAL },
  movimientos: { tipo: "col", seed: null },
  cargaCampo: { tipo: "col", seed: CARGA_CAMPO_INICIAL },
  ubicaciones: { tipo: "kv", seed: UBICACIONES_INICIAL },
  bitacora: { tipo: "col", seed: null },
  materiales: { tipo: "col", seed: MATERIALES_INICIAL },
  importaciones: { tipo: "col", seed: null },
  defectosCalidad: { tipo: "kv", seed: DEFECTOS_POR_CULTIVO_INICIAL },
  inspectoresCalidad: { tipo: "kv", seed: INSPECTORES_QC_INICIAL },
  lugaresCalidad: { tipo: "kv", seed: LUGARES_QC_INICIAL },
  zonas: { tipo: "kv", seed: ZONAS_INICIAL },
  consignados: { tipo: "kv", seed: CONSIGNADOS_INICIAL },
};

// Sincroniza el estado contra el backend (solo lo que cambió vs el último snapshot).
// Colecciones: upsert por id (PUT) + borrar lo que ya no está. Singletons: PUT completo.
async function sincronizarBackend(snap, prevRef) {
  const prev = prevRef.current || {};
  for (const k of Object.keys(CONFIG)) {
    const cfg = CONFIG[k];
    const nuevo = snap[k];
    const anterior = prev[k];
    if (JSON.stringify(nuevo) === JSON.stringify(anterior)) continue;
    try {
      if (cfg.tipo === "col") {
        const prevArr = Array.isArray(anterior) ? anterior : [];
        const nuevoArr = Array.isArray(nuevo) ? nuevo : [];
        const prevMap = new Map(prevArr.map((x) => [x.id, x]));
        const ids = new Set(nuevoArr.map((x) => x.id));
        for (const item of nuevoArr) {
          if (item.id == null) continue;
          const p = prevMap.get(item.id);
          if (!p || JSON.stringify(p) !== JSON.stringify(item)) await api.actualizar(k, item.id, item);
        }
        for (const item of prevArr) {
          if (item.id != null && !ids.has(item.id)) await api.borrar(k, item.id);
        }
      } else {
        await api.putState(k, nuevo);
      }
    } catch (e) {
      console.warn("Error sincronizando", k, e);
    }
  }
  return snap;
}

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
  const [materiales, setMateriales] = useState(guardado.materiales ?? MATERIALES_INICIAL); // catálogo de materiales importables
  const [importaciones, setImportaciones] = useState(guardado.importaciones ?? []); // importaciones de materiales documentadas
  const [defectosCalidad, setDefectosCalidad] = useState(guardado.defectosCalidad ?? DEFECTOS_POR_CULTIVO_INICIAL); // catálogo editable: producto → defectos
  const [inspectoresCalidad, setInspectoresCalidad] = useState(guardado.inspectoresCalidad ?? INSPECTORES_QC_INICIAL); // inspectores de calidad
  const [lugaresCalidad, setLugaresCalidad] = useState(guardado.lugaresCalidad ?? LUGARES_QC_INICIAL); // lugares de inspección
  const [zonas, setZonas] = useState(guardado.zonas ?? ZONAS_INICIAL); // catálogo de zonas (campo Viaje)
  const [consignados, setConsignados] = useState(guardado.consignados ?? CONSIGNADOS_INICIAL); // catálogo compartido consignado/distribuidor

  const [fuente, setFuente] = useState("local"); // "local" | "backend"
  const [cargando, setCargando] = useState(true);

  const setters = {
    trailers: setTrailers, cargasEmbarques: setCargasEmbarques, monitoreo: setMonitoreo,
    catalogo: setCatalogo, cultivos: setCultivos, programa: setPrograma,
    requerimientoGen: setRequerimientoGen, requerimientoMeta: setRequerimientoMeta,
    responsables: setResponsables, lineas: setLineas, movimientos: setMovimientos,
    cargaCampo: setCargaCampo, ubicaciones: setUbicaciones, bitacora: setBitacora,
    materiales: setMateriales, importaciones: setImportaciones, defectosCalidad: setDefectosCalidad,
    inspectoresCalidad: setInspectoresCalidad, lugaresCalidad: setLugaresCalidad,
    zonas: setZonas, consignados: setConsignados,
  };
  const valores = { trailers, cargasEmbarques, monitoreo, catalogo, cultivos, programa, requerimientoGen, requerimientoMeta, responsables, lineas, movimientos, cargaCampo, ubicaciones, bitacora, materiales, importaciones, defectosCalidad, inspectoresCalidad, lugaresCalidad, zonas, consignados };
  const prevRef = useRef(null);
  const debRef = useRef(null);

  // Carga inicial: intenta el backend; si no responde, se queda en modo local.
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!(await api.disponible())) { setCargando(false); return; }
      try {
        const cargado = {};
        for (const k of Object.keys(CONFIG)) {
          const cfg = CONFIG[k];
          let val;
          if (cfg.tipo === "col") {
            val = await api.getColeccion(k);
            if ((!Array.isArray(val) || val.length === 0) && cfg.seed) {
              for (const item of cfg.seed) await api.crear(k, item);
              val = cfg.seed;
            }
            val = Array.isArray(val) ? val : [];
          } else {
            val = await api.getState(k);
            if (val == null && cfg.seed != null) { await api.putState(k, cfg.seed); val = cfg.seed; }
            if (val == null) val = {};
          }
          if (cancel) return;
          cargado[k] = val;
          setters[k]?.(val);
        }
        if (cancel) return;
        prevRef.current = cargado;
        setFuente("backend");
      } catch (e) {
        console.warn("No se pudo cargar del backend; se usa modo local:", e);
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistencia: localStorage SIEMPRE (caché offline); backend si está conectado (debounced).
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(valores)); }
    catch (e) { console.warn("No se pudo guardar en localStorage:", e); }

    if (fuente !== "backend" || cargando) return;
    clearTimeout(debRef.current);
    const snap = valores;
    debRef.current = setTimeout(() => {
      sincronizarBackend(snap, prevRef).then((s) => { prevRef.current = s; });
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailers, cargasEmbarques, monitoreo, catalogo, cultivos, programa, requerimientoGen, requerimientoMeta, responsables, lineas, movimientos, cargaCampo, ubicaciones, bitacora, materiales, importaciones, defectosCalidad, inspectoresCalidad, lugaresCalidad, zonas, consignados, fuente, cargando]);

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
    zonas, setZonas, consignados, setConsignados,
    bitacora, setBitacora, registrarEvento,
    materiales, setMateriales, importaciones, setImportaciones,
    defectosCalidad, setDefectosCalidad, inspectoresCalidad, setInspectoresCalidad, lugaresCalidad, setLugaresCalidad,
    fuente, cargando, // estado de conexión al backend
  };
  return <DatosContext.Provider value={value}>{children}</DatosContext.Provider>;
}

export function useDatos() {
  return useContext(DatosContext);
}