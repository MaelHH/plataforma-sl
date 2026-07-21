// Helpers PUROS del vaciado a empaque (Modulo9). Se extrajeron aquí para poder REUSARLOS en el
// Dashboard y reportes sin duplicar lógica ni depender del componente. NO importan nada de
// Modulo9 (evita ciclos) y no tocan estado de React: reciben el movimiento `m` y devuelven números.
//
// Nota: `ordenSAPde/loteDe/porHora/porLote` NO están aquí porque dependen de `proyectos`/estado del
// componente. Y `KG_POR_BIN_TEO/TARA_*/fmt/sumar` se quedan en Modulo9 (los usa el JSX/form).

// Cajas por parrilla (para estimar parrillas cuando no se capturan). También lo usa el modal de
// recepción en Modulo9, por eso se exporta.
export const CAJAS_POR_PARRILLA = 64;

// Destare de una recepción: { aplicar, bruto, parrillas, cajas, taraParrillas, taraCajas, taraTotal, neto }.
export const destareDe = (m) => {
  const r = m.recepcion || {};
  const bruto = (parseFloat(r.pesoRecibido) || 0) || (parseFloat(m.pesoBascula) || 0);
  const cajas = parseFloat(r.bultosRecibidos) || 0;
  // parrillas: las capturadas; si no hay, se estiman por la razón cajas/parrilla.
  const parrillas = (parseFloat(r.parrillasRecibidas) || 0) || (cajas ? Math.round(cajas / CAJAS_POR_PARRILLA) : 0);
  // Pesos: lo capturado; vacío o 0 = sin tara de ese elemento (el form los prellena con los defaults).
  const pK = parseFloat(r.destareParrillaKg) || 0;
  const cK = parseFloat(r.destareCajaKg) || 0;
  const taraParrillas = parrillas * pK;
  const taraCajas = cajas * cK;
  const taraTotal = taraParrillas + taraCajas;
  const neto = Math.max(0, bruto - taraTotal);
  return { aplicar: !!r.destareAplicar, bruto, parrillas, cajas, parrillaKg: pK, cajaKg: cK, taraParrillas, taraCajas, taraTotal, neto };
};
// kg recibido para vaciar: el override manual, o el ejote NETO si hay destare, o el bruto
// (peso de recepción / báscula).
export const kgRecibidosDe = (m) => {
  if (m.vaciado && "kgRecibidos" in m.vaciado) return parseFloat(m.vaciado.kgRecibidos) || 0;
  if (m.recepcion?.destareAplicar) return destareDe(m).neto;
  return (parseFloat(m.recepcion?.pesoRecibido) || 0) || (parseFloat(m.pesoBascula) || 0);
};
// ── Vaciado POR HORA ── Cada pesada se pesa CON el contenedor: neto = bruto − (Nº contenedores × tara).
export const netoPesada = (p) => Math.max(0, (parseFloat(p.bruto) || 0) - ((parseFloat(p.num) || 1) * (parseFloat(p.tara) || 0)));
export const netoHora = (h) => (h?.pesadas || []).reduce((a, p) => a + netoPesada(p), 0);
export const kgHorasDe = (m) => (m.vaciado?.horas || []).reduce((a, h) => a + netoHora(h), 0);
export const cubetasDe = (kg, kgPorCubeta = 6) => Math.round((kg || 0) / (kgPorCubeta || 6));
// FALTANTE (ajuste): kg que SÍ entraron a producción pero no se alcanzaron a pesar por hora.
// Cuenta como vaciado desde que se registra (reserva) → el "en piso" baja.
export const kgAjustesDe = (m) => (m?.vaciado?.ajustes || []).reduce((a, x) => a + (parseFloat(x?.kg) || 0), 0);
// Vaciado total = eventos legacy (vaciado simple) + pesadas de las horas + faltantes (ajustes).
export const kgVaciadosDe = (m) =>
  (m.vaciado?.eventos || []).reduce((a, e) => a + (parseFloat(e.kg) || 0), 0) + kgHorasDe(m) + kgAjustesDe(m);
// Modo del folio: si ya tiene horas → "hora"; si ya se mandó el total a SAP → "total". Candado mutuo.
export const usaHoras = (m) => (m.vaciado?.horas || []).length > 0;
export const usoTotalSAP = (m) => !!m.recepcion?.sapEnvio;
// G2: ¿el folio ya tuvo CUALQUIER envío a SAP? (total, por hora o faltante) → no se puede
// reabrir ni rechazar (borraría lo enviado y desincronizaría con SAP → riesgo de doble envío).
// Cuenta también los envíos PENDIENTES DE CONFIRMAR (G4): si se borran, se pierde la clave con
// la que se verifica en SAP y ya no habría forma de saber si el recibo quedó allá.
export const tieneEnvioSAP = (m) => !!m?.recepcion?.sapEnvio || !!m?.recepcion?.sapPendiente
  || (m?.vaciado?.horas || []).some((h) => h?.sapEnvio || h?.sapPendiente)
  || (m?.vaciado?.ajustes || []).some((a) => a?.sapEnvio || a?.sapPendiente);
// G3: ¿el folio usa envío PARCIAL (por hora o faltante)? → bloquea el envío TOTAL (evita doble conteo).
export const usaParcial = (m) => usaHoras(m) || (m?.vaciado?.ajustes || []).length > 0;
// Mermado = kg que NO entraron a empaque (se descartan); también salen del piso.
export const kgMermadosDe = (m) => (m.vaciado?.mermas || []).reduce((a, e) => a + (parseFloat(e.kg) || 0), 0);
export const kgEnPisoDe = (m) => Math.max(0, kgRecibidosDe(m) - kgVaciadosDe(m) - kgMermadosDe(m));

// ── Para el Dashboard (Dirección): predicados/agregados reusables ──
// ¿el folio está RECIBIDO en empaque (no cliente directo)? — mismo predicado que usa Empaque (M9),
// para que los números del dashboard cuadren EXACTO con el módulo.
export const esRecibidoEmpaque = (m) => m?.recepcion?.estado === "recibido" && !m?.recepcion?.clienteDirecto;
// Cubetas ya enviadas a SAP de un folio: total + por hora + faltante (ajustes).
export const cubetasEnviadasSAP = (m) =>
  (m?.recepcion?.sapEnvio?.cubetas || 0)
  + (m?.vaciado?.horas || []).reduce((a, h) => a + (h?.sapEnvio?.cubetas || 0), 0)
  + (m?.vaciado?.ajustes || []).reduce((a, x) => a + (x?.sapEnvio?.cubetas || 0), 0);
// kg que YA se reportaron a SAP (los netos de cada envío: total + por hora + faltantes).
export const kgEnviadosSAP = (m) =>
  (m?.recepcion?.sapEnvio?.netoKg || 0)
  + (m?.vaciado?.horas || []).reduce((a, h) => a + (h?.sapEnvio?.netoKg || 0), 0)
  + (m?.vaciado?.ajustes || []).reduce((a, x) => a + (x?.sapEnvio?.netoKg || 0), 0);
// kg ya vaciados que AÚN no se han reportado a SAP (lo que falta por mandar).
export const kgPendienteSAP = (m) => Math.max(0, kgVaciadosDe(m) - kgEnviadosSAP(m));

// ── LÍNEA DE CORTE (go-live SAP) ──
// Un folio es HISTÓRICO si su fecha es ANTERIOR a la fecha de corte: se conserva y se ve en los
// reportes, pero la app NUNCA lo manda a SAP (ese periodo ya se registró por fuera, a mano).
// Sin fecha de corte configurada → nada es histórico (no bloquea nada).
// Folio sin fecha → se trata como HISTÓRICO (no se puede ubicar en el tiempo → mejor no mandarlo).
export const esHistoricoSAP = (m, goLiveSAP) => {
  if (!goLiveSAP) return false;
  const f = m?.fecha || "";
  return !f || f < goLiveSAP;
};
