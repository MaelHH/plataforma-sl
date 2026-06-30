// Escapa texto para incrustarlo de forma segura en el HTML de los reportes/PDF.
// Cubre &, <, >, ", ' y ` (los dos últimos faltaban y eran un hueco de XSS).
export function esc(s) {
  return String(s ?? "").replace(/[&<>"'`]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;",
  }[c]));
}
