// Helpers de fecha compartidos (antes estaban duplicados en varios módulos).

// Formatea una fecha como 'YYYY-MM-DD' usando la hora LOCAL (no UTC).
// IMPORTANTE: `toISOString()` da la fecha en UTC → en México (UTC−7/−6) por la TARDE ya marca el
// día siguiente. Usar getFullYear/getMonth/getDate (locales) evita ese "salto de día".
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Fecha de hoy en formato ISO corto 'YYYY-MM-DD' (hora LOCAL).
export function hoyISO() {
  return isoLocal(new Date());
}

// Lunes de la semana actual en 'YYYY-MM-DD' (getDay: 0=dom, 1=lun…), hora LOCAL.
export function lunesActual() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  hoy.setDate(hoy.getDate() + diff);
  return isoLocal(hoy);
}
