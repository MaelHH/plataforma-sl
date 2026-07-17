import { getState, putState } from "../store/api";

// Guarda el folio de una OC creada DESDE la plataforma en el mapa compartido "folios_fletes"
// (el mismo que edita el Control de Fletes), ligado al DocEntry del Pedido que devolvió SAP.
// Así las OC creadas aquí ya salen con su folio, y las de SAP se llenan a mano en la vista.
// Read-modify-write: lee el mapa actual, agrega/actualiza esta llave y lo vuelve a guardar.
export async function guardarFolioOC(pedidoDocEntry, folio) {
  if (pedidoDocEntry == null || !folio) return;
  try {
    const map = (await getState("folios_fletes")) || {};
    map[pedidoDocEntry] = String(folio);
    await putState("folios_fletes", map);
  } catch { /* si falla el guardado del folio, no rompe la creación de la OC */ }
}
