import { DEFECTOS_QC } from "../../store/datos";

// ── Matemática del Control de Calidad (QCI) ──
// Compartida entre el Módulo 9 (pantalla) y el generador de reportes PDF.

// % de un defecto = gramos / peso muestra * 100
export const pctDefecto = (gramos, pesoMuestra) => {
  const p = parseFloat(pesoMuestra) || 0;
  const g = parseFloat(gramos) || 0;
  return p > 0 ? (g / p) * 100 : 0;
};

// % por categoría (calidad / condición / plaga)
export const pctCategoria = (mu, cat) =>
  DEFECTOS_QC.filter((d) => d.cat === cat).reduce((a, d) => a + pctDefecto(mu.defectos[d.id], mu.pesoMuestra), 0);

// QCI = 100 - total de defectos %
export const calcQCI = (mu) => {
  const total = DEFECTOS_QC.reduce((a, d) => a + pctDefecto(mu.defectos[d.id], mu.pesoMuestra), 0);
  return Math.max(0, 100 - total);
};
