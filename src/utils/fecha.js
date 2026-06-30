// Helpers de fecha compartidos (antes estaban duplicados en varios módulos).
// Mismo comportamiento exacto que las copias locales que reemplazan.

// Fecha de hoy en formato ISO corto 'YYYY-MM-DD'.
export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Lunes de la semana actual en 'YYYY-MM-DD' (getDay: 0=dom, 1=lun…).
export function lunesActual() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  hoy.setDate(hoy.getDate() + diff);
  return hoy.toISOString().slice(0, 10);
}
