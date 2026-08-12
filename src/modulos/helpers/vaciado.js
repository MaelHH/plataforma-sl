// Métodos de vaciado de EMPAQUE CAMPO DIRECTO, por CULTIVO (extensible a empresa + cultivo).
// La idea: cada cultivo (y, a futuro, cada empresa) puede vaciarse DISTINTO — cómo se captura el
// folio y cómo se calcula la cantidad que va a SAP. Hoy hay dos métodos:
//   - "bins":  se pesan los bins (bruto − bins×tara = neto) → cubetas. Es el flujo de SL / ejote (hoy).
//   - "taras": NO se pesa ni destara; el folio lleva el NÚMERO de taras de la remisión y se manda TAL
//              CUAL a SAP (ej. 574 taras → cantidad 574). Es el de CACO / pepino.
//
// v1 (CACO pepino): la regla está SEMBRADA por cultivo — ejote → bins; cualquier otro cultivo → taras.
// A futuro un EDITOR (mapa por empresa+cultivo, persistido en configEmpaque) llenará esto sin tocar el
// resto: cada empresa/cultivo apuntará a su método (p.ej. CAT pepino podría usar otro método distinto).
export const METODO_BINS = "bins";
export const METODO_TARAS = "taras";

// Cultivo del ejote (el único flujo "por bins/pesaje" hoy). En minúsculas para comparar sin importar caso.
const CULTIVO_EJOTE = "ejcon-0001";

// Resuelve el método de vaciado de un folio por su cultivo (parámetro `empresa` reservado para el
// editor futuro por empresa+cultivo; hoy no se usa). Sin cultivo → bins (default seguro = el de hoy).
export function resolverMetodoVaciado({ cultivo, empresa } = {}) {   // eslint-disable-line no-unused-vars
  const c = (cultivo || "").trim().toLowerCase();       // trim: un espacio en el seed NO debe convertir ejote en taras
  if (!c || c === CULTIVO_EJOTE) return METODO_BINS;   // SL / ejote → pesaje por bins (flujo de hoy)
  return METODO_TARAS;                                  // CACO pepino (y demás no-ejote) → taras directo
}

// Atajo: ¿este cultivo se vacía "por taras" (directo, sin pesar)?
export const esVaciadoPorTaras = (cultivo, empresa) =>
  resolverMetodoVaciado({ cultivo, empresa }) === METODO_TARAS;
