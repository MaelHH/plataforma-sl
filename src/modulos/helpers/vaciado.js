// Métodos de vaciado de EMPAQUE CAMPO DIRECTO, por CULTIVO (extensible a empresa + cultivo).
// La idea: cada cultivo (y, a futuro, cada empresa) puede vaciarse DISTINTO — cómo se captura el
// folio y cómo se calcula la cantidad que va a SAP. Hoy hay dos métodos:
//   - "bins":  se pesan los bins (bruto − bins×tara = neto) → cubetas. Es el flujo de SL / ejote y
//              el DEFAULT de TODO cultivo (lo de siempre).
//   - "taras": NO se pesa ni destara; el folio lleva el NÚMERO de taras de la remisión y se manda TAL
//              CUAL a SAP (ej. 574 taras → cantidad 574). Hoy SOLO el pepino de CACO.
//
// REGLA (lista blanca, default seguro = BINS): un cultivo se vacía por TARAS solo si está en
// CULTIVOS_TARAS; CUALQUIER otro cultivo (ejote de SL, maíz, bell, lo que sea, en cualquier empresa)
// es BINS. Así, si un cultivo NO está listado, NUNCA se va por taras por error (antes era al revés y
// rompía a SL: "todo lo que no fuera ejcon-0001 → taras", y en SL_SBO los cultivos se llaman distinto).
// A futuro un EDITOR (mapa por empresa+cultivo, persistido en configEmpaque) llenará esto sin tocar el
// resto (p.ej. CAT pepino podría usar otro método distinto).
export const METODO_BINS = "bins";
export const METODO_TARAS = "taras";

// Cultivos que se vacían POR TARAS. Match por substring normalizado (sin espacios, en minúsculas):
// "pepino" cubre "Pepino-0001", "Pepino en Campo", "pepinoam", etc. Agregar aquí más cultivos-taras.
const CULTIVOS_TARAS = ["pepino"];

const norm = (s) => (s || "").trim().toLowerCase();

// Resuelve el método de vaciado de un folio por su cultivo (parámetro `empresa` reservado para el
// editor futuro por empresa+cultivo; hoy no se usa). Default SEGURO = BINS (el de hoy).
export function resolverMetodoVaciado({ cultivo, empresa } = {}) {   // eslint-disable-line no-unused-vars
  const c = norm(cultivo);
  if (c && CULTIVOS_TARAS.some((t) => c.includes(t))) return METODO_TARAS;   // pepino (CACO) → taras
  return METODO_BINS;                                                        // TODO lo demás → bins (ejote SL, etc.)
}

// Atajo: ¿este cultivo se vacía "por taras" (directo, sin pesar)?
export const esVaciadoPorTaras = (cultivo, empresa) =>
  resolverMetodoVaciado({ cultivo, empresa }) === METODO_TARAS;
