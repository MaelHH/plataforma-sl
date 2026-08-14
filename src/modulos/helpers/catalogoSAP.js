// Carga/merge del catálogo de temporadas+lotes (proyectos/ranchos) desde SAP — SOLO GET — acotado a
// lo PERMITIDO del usuario. Se comparte entre "Movimientos Campo" (Modulo8) y "Empaque campo directo"
// para que un usuario SOLO-empaque también pueda traer sus temporadas/lotes sin entrar a Modulo8.
//
// NOTA: `mergeProyectos` refleja la MISMA lógica que la de Modulo8 (empresa: null=mío + re-etiquetar;
// identidad de rancho = lote+cultivo; conserva responsables/nombre editados). Si cambias una, cambia
// la otra. No borra nada local. No manda NADA a SAP (solo lee el catálogo).
import { getCatalogoProyectosSAP } from "../../store/api";

// Merge SAP → store, conservando lo manual y SIN borrar nada local. `miEmpresa` = empresa del usuario
// (null = admin/sin empresa). `onlyExisting` = no crear temporadas nuevas, solo refrescar las que ya hay.
export function mergeProyectos(prev, sapList, miEmpresa, onlyExisting = false) {
  const base = Array.isArray(prev) ? prev : [];
  const next = base.map((p) => ({ ...p, ranchos: (p.ranchos || []).map((r) => ({ ...r })) }));
  for (const sp of sapList) {
    // Empate por code: MI empresa o SIN etiqueta (null = viejo). Si estaba sin etiqueta, se RE-ETIQUETA
    // a mi empresa (deja de ocultarse al recargar). Otra empresa con el mismo code = su propia entrada.
    let proj = next.find((p) => p.code === sp.code && (p.empresa == null || p.empresa === miEmpresa));
    if (!proj) { if (onlyExisting) continue; proj = { code: sp.code, nombre: sp.nombre, empresa: miEmpresa, ranchos: [] }; next.push(proj); }
    else if (miEmpresa != null && proj.empresa == null) proj.empresa = miEmpresa;
    for (const sr of (sp.ranchos || [])) {
      const sap = { item: sr.item, ordenes: sr.ordenes, plannedQty: sr.plannedQty, completedQty: sr.completedQty };
      // Identidad del rancho = (lote + cultivo): un mismo lote con 2 cultivos son 2 ranchos.
      const cul = sr.cultivo || "";
      const ex = proj.ranchos.find((r) => r.sapKey === sr.nombre && (r.cultivo || "") === cul)
        || proj.ranchos.find((r) => !r.sapKey && r.sap && r.nombre === sr.nombre && (r.cultivo || "") === cul);
      if (!ex) proj.ranchos.push({ nombre: sr.nombre, departamento: sr.departamento || "", cultivo: cul, responsables: [], sap, sapKey: sr.nombre });
      else { ex.sapKey = sr.nombre; ex.departamento = ex.departamento || sr.departamento || ""; ex.cultivo = cul || ex.cultivo || ""; ex.sap = sap; }
    }
  }
  return next;
}

// Trae las temporadas PERMITIDAS del usuario desde SAP y devuelve { lista, updater }. El `updater` se
// pasa a setProyectos. Acotado (§2.1) → solo sus proyectos asignados; admin/sin alcance → las de su
// company (el ruteo del Paso G ya limita). Re-etiqueta lo null → miEmpresa (no borra las sin etiqueta).
export async function cargarProyectosPermitidos({ acotado, proyectosAsignados, miEmpresa }) {
  const data = await getCatalogoProyectosSAP("");
  let lista = data.proyectos || [];
  if (acotado) lista = lista.filter((p) => proyectosAsignados.has(p.code));
  const updater = (prev) => {
    let next = mergeProyectos(prev, lista, miEmpresa, false);
    if (miEmpresa != null) next = next.map((p) => (p.empresa == null ? { ...p, empresa: miEmpresa } : p));
    return next;
  };
  return { lista, updater };
}
