import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, Truck, Save, X, Sprout, Pencil, Package, ChevronDown, ChevronUp, Check, RotateCcw, Clock, Send, Ban, Search, AlertTriangle, FileText, RefreshCw } from "lucide-react";
import { useDatos, nuevoId, ahora, CAMPO_DIRECTO_DEFAULT } from "../store/datos";
import { useAuth } from "../store/auth";
import { useDialog } from "../components/Dialog";
import SearchSelect from "../components/SearchSelect";
import { reciboProduccionSAP, verificarReciboSAP, getOrdenFabricacionSAP, getProveedoresFleteSAP, getItemsFleteSAP, getTaxCodesSAP, getCultivosSAP, getDepartamentosSAP, crearOrdenCompraSAP, getEstadoOCSAP } from "../store/api";
import { guardarFolioOC } from "../utils/folioOC";
import { generarPDFVaciadoHora, generarExcelVaciadoHora } from "./reportes/vaciadoPorHora";
import { kgRecibidosDe, kgVaciadosDe, kgEnPisoDe, kgMermadosDe, cubetasDe, estaTerminado, kgSobranteCierre, esHistoricoSAP } from "./helpers/empaque";
import { hoyISO } from "../utils/fecha";

// Hora actual "HH:MM" (24h) para GUARDAR los registros de vaciado (formato inequívoco).
function ahoraHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
// Convierte "HH:MM" (24h) a 12h para MOSTRAR, ej. "5:55 PM".
function hm12(hm) {
  const [h, m] = String(hm || "").split(":").map(Number);
  if (Number.isNaN(h)) return hm || "—";
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ap}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPAQUE CAMPO DIRECTO — flujo INDEPENDIENTE del de logística.
// Son carros que llegan DIRECTO de campo: se pesan y se vacían aquí sin pasar por
// el flujo campo→empaque→empaque. Crea su propio "movimiento" (colección
// `movimientosCampo`, aparte de `movimientos`) con solo lo que trae el ticket:
// folio, cultivo (fijo ejcon-0001), transporte, chofer, bins mandados, lote (→ su
// temporada), tabla (departamento), horas y fecha. El neto se ESTIMA por bin:
//   neto teórico = bins × (brutoPorBin − taraBin)   [default 260 − 43 = 217 kg/bin]
// Cubetas informativas del ticket: bins × cubetasPorBin (1 bin = 40 cubetas).
// El vaciado y el envío a SAP (recibo + OC) se conectan en fases siguientes,
// REUSANDO los mismos endpoints del flujo actual (SAP no cambia).
// ─────────────────────────────────────────────────────────────────────────────

const CULTIVO_FIJO = "ejcon-0001";
const fmt = (n) => Math.round(n || 0).toLocaleString("es-MX");

const formVacio = () => ({
  folio: "", cultivo: CULTIVO_FIJO, fecha: hoyISO(),
  transporte: "", chofer: "", bins: "",
  rancho: "", proyecto: "", departamento: "",
  horaSalida: "", horaLlegada: "", observaciones: "",
  flete: "",   // precio del flete (OPCIONAL; se puede llenar después para la OC)
});

const INP = "w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-emerald-400";

export default function EmpaqueCampoDirecto() {
  const { movimientosCampo, setMovimientosCampo, vaciadoCampoLotes, setVaciadoCampoLotes, proyectos, proveedores, setProveedores, configEmpaque, setConfigEmpaque, registrarEvento } = useDatos();
  const { usuario, can } = useAuth() || {};
  const dlg = useDialog();
  // Candados RBAC del envío a SAP (igual que logística): aprobar (encargada) y enviar a SAP.
  const puedeAprobar = can ? can("empaque.vaciado.aprobar") : false;
  const puedeEnviarSap = can ? can("empaque.vaciado.enviar_sap") : false;
  // Línea de corte SAP: folios anteriores a esta fecha son HISTÓRICO → no se mandan a SAP.
  const goLiveSAP = configEmpaque?.goLiveSAP || "";
  const actorNombre = usuario?.full_name || usuario?.nombre || usuario?.email || "Empaque";

  const lista = useMemo(() => (Array.isArray(movimientosCampo) ? movimientosCampo : []), [movimientosCampo]);

  // Parámetros del bin (editables en configEmpaque.campoDirecto).
  const cd = { ...CAMPO_DIRECTO_DEFAULT, ...(configEmpaque?.campoDirecto || {}) };
  const brutoPorBin = parseFloat(cd.brutoPorBin) || CAMPO_DIRECTO_DEFAULT.brutoPorBin;
  const taraBin = parseFloat(cd.taraBin) || CAMPO_DIRECTO_DEFAULT.taraBin;
  const cubetasPorBin = parseFloat(cd.cubetasPorBin) || CAMPO_DIRECTO_DEFAULT.cubetasPorBin;
  const netoPorBin = Math.max(0, brutoPorBin - taraBin);
  const setCd = (patch) => setConfigEmpaque({ ...(configEmpaque || {}), campoDirecto: { ...cd, ...patch } });
  // Factor del reporte por BINS (el que ven los jefes): cada `kgPorBin` kg netos = 1 bin (mismo que logística).
  const kgPorBin = parseFloat(configEmpaque?.kgPorBin) || 260;
  // Clave del LOTE (temporada + rancho) = la unidad que se vacía (1 orden de fabricación).
  const loteKeyDe = (proyecto, rancho) => `${proyecto || ""}::${rancho || ""}`;

  // Índice lote→temporada: recorre proyectos[].ranchos[] (en esta app rancho = "Lote", proyecto =
  // "Temporada", departamento = "Tabla"). Al elegir/escribir un lote conocido, autollena su temporada.
  const loteIndex = useMemo(() => {
    const idx = {};
    (proyectos || []).forEach((p) => (p.ranchos || []).forEach((r) => {
      if (r?.nombre && !idx[r.nombre]) idx[r.nombre] = { proyecto: p.code, temporada: p.nombre, departamento: r.departamento || "", cultivo: r.cultivo || "" };
    }));
    return idx;
  }, [proyectos]);
  const loteOpts = useMemo(() => Object.keys(loteIndex).sort((a, b) => a.localeCompare(b)).map((l) => ({ value: l, label: l })), [loteIndex]);
  const temporadaDe = (rancho) => loteIndex[rancho]?.temporada || "";
  // Orden de fabricación (SAP) del folio: se resuelve igual que en logística (ordenSAPde),
  // cruzando proyecto (temporada) + rancho (lote) contra el catálogo, y tomando su 1ª orden.
  const ordenDe = (m) => {
    const proj = (proyectos || []).find((p) => p.code === m.proyecto);
    const r = proj?.ranchos?.find((x) => x.nombre === m.rancho);
    const ords = r?.sap?.ordenes || [];
    const o0 = ords[0];
    const absoluteEntry = (o0 && typeof o0 === "object") ? o0.absoluteEntry : o0;
    const docNum = (o0 && typeof o0 === "object") ? (o0.docNum ?? o0.DocNum) : undefined;
    return { absoluteEntry, docNum, item: r?.sap?.item, temporada: proj?.nombre, rancho: r?.nombre, varias: ords.length > 1, hayCatalogo: !!r };
  };
  // Tablas (departamento) conocidas: las de los ranchos + las ya usadas en campo directo.
  const tablaOpts = useMemo(() => {
    const s = new Set();
    Object.values(loteIndex).forEach((x) => x.departamento && s.add(x.departamento));
    lista.forEach((m) => m.departamento && s.add(m.departamento));
    return [...s].sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t }));
  }, [loteIndex, lista]);
  // Transportes y choferes YA usados antes en campo directo (para reelegir sin re-teclear).
  const usados = (campo) => {
    const s = new Set();
    lista.forEach((m) => { const v = (m[campo] || "").trim(); if (v) s.add(v); });
    return [...s].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  };
  const transporteOpts = useMemo(() => usados("transporte"), [lista]);   // eslint-disable-line react-hooks/exhaustive-deps
  const choferOpts = useMemo(() => usados("chofer"), [lista]);           // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState(null);   // null = form cerrado; objeto = creando/editando
  const [editId, setEditId] = useState(null);
  const [cfgAbierto, setCfgAbierto] = useState(false);
  const [expandido, setExpandido] = useState(null);   // id del folio con detalle abierto
  const [diaReporte, setDiaReporte] = useState(hoyISO());   // día del reporte PDF/Excel

  const upd = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Cálculos del form en vivo.
  const bins = parseFloat(form?.bins) || 0;
  const brutoTotal = bins * brutoPorBin;
  const netoTeorico = bins * netoPorBin;
  const cubetasTicket = bins * cubetasPorBin;

  const abrirNuevo = () => { setEditId(null); setForm(formVacio()); };
  const abrirEditar = (m) => {
    setEditId(m.id);
    setForm({
      folio: m.folio || "", cultivo: m.cultivo || CULTIVO_FIJO, fecha: m.fecha || hoyISO(),
      transporte: m.transporte || "", chofer: m.chofer || "", bins: m.bins ?? "",
      rancho: m.rancho || "", proyecto: m.proyecto || "", departamento: m.departamento || "",
      horaSalida: m.horaSalida || "", horaLlegada: m.horaLlegada || "", observaciones: m.observaciones || "",
      flete: m.flete ?? "",
    });
  };
  const cerrarForm = () => { setForm(null); setEditId(null); };

  // Al cambiar el lote, resolver su temporada (y prellenar tabla si el rancho la trae).
  const onLote = (val) => {
    const info = loteIndex[val];
    upd({ rancho: val, proyecto: info?.proyecto || "", departamento: (form?.departamento || info?.departamento || "") });
  };

  const guardar = () => {
    const folio = (form.folio || "").trim();
    const rancho = (form.rancho || "").trim();
    const tabla = (form.departamento || "").trim();
    // OBLIGATORIOS al crear rápido: folio (la remisión, para saber de dónde viene cada carga), lote
    // (para anidar a la temporada), tabla y bins. El resto (transporte, chofer, flete, horas…) se
    // llena DESPUÉS con calma para completar la OC.
    if (!folio) { dlg.alerta({ title: "Falta el folio", message: "Captura el número de folio del ticket (la remisión) para saber de qué carga es." }); return; }
    if (!rancho) { dlg.alerta({ title: "Falta el lote", message: "El lote es obligatorio: con él se anida a su temporada y orden de fabricación." }); return; }
    if (!tabla) { dlg.alerta({ title: "Falta la tabla", message: "Captura la tabla (departamento) de donde salió el carro." }); return; }
    if (bins <= 0) { dlg.alerta({ title: "Faltan los bins", message: "Captura cuántos bins llegaron." }); return; }
    // Folio duplicado dentro de campo directo.
    const dup = lista.find((m) => (m.folio || "").trim() === folio && m.id !== editId);
    if (dup) { dlg.alerta({ title: "Folio repetido", message: `Ya existe un folio ${folio} en campo directo.` }); return; }

    const t = ahora();
    const base = {
      folio, cultivo: form.cultivo || CULTIVO_FIJO, fecha: form.fecha || hoyISO(),
      transporte: (form.transporte || "").trim(), chofer: (form.chofer || "").trim(),
      bins, rancho: (form.rancho || "").trim(), proyecto: form.proyecto || temporadaDe(form.rancho) || "",
      departamento: (form.departamento || "").trim(),
      horaSalida: form.horaSalida || "", horaLlegada: form.horaLlegada || "",
      observaciones: (form.observaciones || "").trim(),
      flete: (form.flete ?? "").toString().trim(),   // precio del flete (opcional)
      // Parámetros con los que se calculó el neto (se congelan por folio para auditar).
      binParams: { brutoPorBin, taraBin, cubetasPorBin },
      // Neto teórico como "recibido": así los helpers de empaque (kgRecibidosDe/kgEnPisoDe) y el
      // vaciado (fases siguientes) funcionan igual que en logística. `kgRecibidos` es el override
      // que lee kgRecibidosDe.
      netoTeorico: bins * (brutoPorBin - taraBin),
    };
    if (editId) {
      setMovimientosCampo((prev) => prev.map((m) => {
        if (m.id !== editId) return m;
        // Si ya tocó SAP (recibo por hora u OC), NO se re-escribe todo: solo se permite cambiar el
        // PRECIO del flete (y solo si la OC aún no tiene Nº de pedido; si ya lo tiene, ni eso).
        if (tieneSAPcd(m)) {
          const ocConPedido = !!(m.ocSAP?.pedido?.docNum ?? m.ocSAP?.pedido?.docEntry);
          return ocConPedido ? m : { ...m, flete: base.flete, actualizado: t.iso };
        }
        return { ...m, ...base, actualizado: t.iso, vaciado: { ...(m.vaciado || {}), kgRecibidos: base.netoTeorico } };
      }));
      registrarEvento?.({ evento: "campo_directo_editado", modulo: "M9-CD", actor: actorNombre, destino: folio || rancho, ref: editId, detalle: `Editó folio campo directo ${folio || rancho}` });
    } else {
      const id = nuevoId("MOVCD_");
      const mov = { ...base, id, creado: t.iso, vaciado: { kgRecibidos: base.netoTeorico } };
      setMovimientosCampo((prev) => [mov, ...prev]);
      registrarEvento?.({ evento: "campo_directo_creado", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: folio || rancho, ref: id, detalle: `Creó folio ${folio || "(s/folio)"} · lote ${rancho} · ${bins} bins` });
    }
    cerrarForm();
  };

  // ¿El folio se puede tocar (borrar/editar bins)? NO si tiene OC, o si su LOTE ya mandó algo a SAP
  // (cambiar los bins desincronizaría el recibido del lote contra lo ya enviado).
  const loteConEnvio = (proyecto, rancho) => ((vaciadoCampoLotes || []).find((v) => v.id === loteKeyDe(proyecto, rancho))?.vaciado?.horas || []).some((h) => h.sapEnvio || h.sapPendiente);
  const tieneSAPcd = (m) => !!m.ocSAP || loteConEnvio(m.proyecto, m.rancho);
  // Empezar limpio: borra TODOS los folios y vaciados de campo directo (para arrancar el nuevo modelo).
  const limpiarTodo = async () => {
    const ok = await dlg.confirm({ title: "Limpiar campo directo", message: `¿Borrar TODOS los folios (${lista.length}) y sus vaciados de campo directo? Esto es para empezar de cero; no se puede deshacer.`, confirmText: "Sí, borrar todo", danger: true });
    if (!ok) return;
    setMovimientosCampo([]);
    setVaciadoCampoLotes([]);
    registrarEvento?.({ evento: "campo_directo_limpiado", modulo: "M9-CD", actor: actorNombre, detalle: "Limpió todos los folios y vaciados de campo directo (empezar limpio)" });
  };
  const borrar = async (m) => {
    if (tieneSAPcd(m)) {
      await dlg.alerta({ title: "No se puede borrar", message: `Este folio tiene OC en SAP o su lote ya mandó vaciado a SAP. Borrarlo desincronizaría con SAP, así que no se puede eliminar.` });
      return;
    }
    const ok = await dlg.confirm({ title: "Borrar folio", message: `¿Borrar este folio (${m.folio || "s/folio"} · ${m.bins} bins · lote ${m.rancho}) de campo directo?`, confirmText: "Sí, borrar", danger: true });
    if (!ok) return;
    setMovimientosCampo((prev) => prev.filter((x) => x.id !== m.id));
    registrarEvento?.({ evento: "campo_directo_borrado", modulo: "M9-CD", actor: actorNombre, destino: m.folio || m.rancho, ref: m.id, detalle: `Borró folio ${m.folio || "(s/folio)"} · lote ${m.rancho}` });
  };

  // ── AGRUPAR FOLIOS POR LOTE (temporada + rancho) — la unidad que se VACÍA (1 orden de fabricación) ──
  const lotes = useMemo(() => {
    const map = {};
    lista.forEach((m) => {
      const key = loteKeyDe(m.proyecto, m.rancho);
      if (!map[key]) map[key] = { key, proyecto: m.proyecto || "", rancho: m.rancho || "", folios: [], binsRec: 0 };
      map[key].folios.push(m);
      map[key].binsRec += parseFloat(m.bins) || 0;
    });
    return Object.values(map).sort((a, b) => (a.rancho || "").localeCompare(b.rancho || ""));
  }, [lista]);
  const loteVacDe = (key) => (vaciadoCampoLotes || []).find((v) => v.id === key)?.vaciado || {};
  // "Movimiento" pseudo del LOTE, para reusar VaciadoPanel/helpers de empaque tal cual. El vaciado
  // vive en `vaciadoCampoLotes`; kgRecibidos = neto teórico del lote (bins de sus folios × 217).
  const loteMov = (lt) => {
    const netoTeorico = lt.binsRec * netoPorBin;
    return {
      id: lt.key, folio: lt.rancho || "(lote)", rancho: lt.rancho, proyecto: lt.proyecto,
      bins: lt.binsRec, binParams: { brutoPorBin, taraBin, cubetasPorBin }, netoTeorico,
      vaciado: { eventos: [], mermas: [], horas: [], ...loteVacDe(lt.key), kgRecibidos: netoTeorico },
    };
  };
  const loteMovByKey = (key) => { const lt = lotes.find((x) => x.key === key); return lt ? loteMov(lt) : null; };

  // Totales del resumen (a nivel lote, neto).
  const totBins = lista.reduce((a, m) => a + (parseFloat(m.bins) || 0), 0);
  const totVaciado = lotes.reduce((a, lt) => a + kgVaciadosDe(loteMov(lt)), 0);
  const totPiso = lotes.reduce((a, lt) => a + kgEnPisoDe(loteMov(lt)), 0);
  const totRecibido = lotes.reduce((a, lt) => a + lt.binsRec * netoPorBin, 0);

  // ── Reporte (jefes): una tabla por LOTE. Conteo = neto vaciado ÷ 260 (así lo cuentan ellas). ──
  const foliosReporteCD = useMemo(() => {
    const porHoraDe = (arr) => {
      const acc = {};
      arr.forEach((e) => { const h = String(e.hora || "").split(":")[0] || "—"; acc[h] = (acc[h] || 0) + (parseFloat(e.kg) || 0); });
      return acc;
    };
    return lotes.map((lt) => {
      const lm = loteMov(lt);
      const evsDia = (lm.vaciado.eventos || []).filter((e) => (e.fecha || hoyISO()) === diaReporte);
      const merDia = (lm.vaciado.mermas || []).filter((e) => (e.fecha || hoyISO()) === diaReporte);
      const vacPorHora = porHoraDe(evsDia);   // neto vaciado por hora
      const merPorHora = porHoraDe(merDia);
      const totVac = Object.values(vacPorHora).reduce((a, b) => a + b, 0);
      const totMer = Object.values(merPorHora).reduce((a, b) => a + b, 0);
      return {
        folio: lt.rancho || "—", lote: lt.rancho || "—", remision: temporadaDe(lt.rancho) || "",
        binsRecibidos: lt.binsRec, recibido: kgRecibidosDe(lm), enPiso: kgEnPisoDe(lm),
        vacPorHora, merPorHora, totVac, totMer,
      };
    }).filter((f) => f.totVac > 0 || Object.keys(f.merPorHora).length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, vaciadoCampoLotes, diaReporte]);
  const totKgVacDiaCD = foliosReporteCD.reduce((a, f) => a + f.totVac, 0);
  const argsReporte = { dia: diaReporte, kgPorBin, foliosReporte: foliosReporteCD, totKgVacDia: totKgVacDiaCD };

  const netoPorBinDe = (m) => Math.max(0, (parseFloat(m.binParams?.brutoPorBin) || brutoPorBin) - (parseFloat(m.binParams?.taraBin) || taraBin));

  // ── VACIADO por LOTE ── El vaciado vive en `vaciadoCampoLotes` (id = loteKey). Los mutadores
  // reciben el `loteMov` (id = loteKey); se reusa VaciadoPanel/HoraCampo tal cual.
  const updVac = (lm, fn) => setVaciadoCampoLotes((prev) => {
    const arr = Array.isArray(prev) ? prev : [];
    const idx = arr.findIndex((v) => v.id === lm.id);
    const curVac = idx >= 0 ? (arr[idx].vaciado || {}) : {};
    const nextVac = fn({ eventos: [], mermas: [], horas: [], ...curVac });
    const row = { id: lm.id, proyecto: lm.proyecto || "", rancho: lm.rancho || "", vaciado: nextVac, actualizado: ahora().iso };
    if (idx >= 0) { const c = [...arr]; c[idx] = { ...arr[idx], ...row }; return c; }
    return [row, ...arr];
  });

  // ── HORAS (para poder pesar por hora y mandar cada hora a SAP, como logística) ──
  // Cada hora es un bloque: se abre, se registran bins DENTRO de ella (evento con horaId), se
  // cierra y luego se manda a SAP. El kg de una hora = suma de sus eventos. Solo UNA hora abierta
  // a la vez (se pesa la hora en curso, se cierra y se abre la siguiente).
  const abrirHoraCD = (m) => {
    updVac(m, (v) => ({ ...v, horas: [...(v.horas || []), { id: nuevoId("HCD_"), etiqueta: `Hora ${(v.horas || []).length + 1}`, estado: "abierta", fecha: hoyISO(), ts: ahora().iso }] }));
    registrarEvento?.({ evento: "campo_directo_hora_abierta", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Abrió una hora en el folio ${m.folio}` });
  };
  // Se pesa el BRUTO real de báscula y se restan los bins (cada uno pesa `taraBin`, ej. 43 kg):
  //   neto real = bruto − (bins × taraBin).  Así el neto es el de verdad (no todo pesa igual) y se
  // puede comparar contra el teórico para ver si viene de más o de menos.
  const registrarVaciado = (m, horaId, bruto, binsN) => {
    const br = parseFloat(bruto) || 0;
    const b = parseFloat(binsN) || 0;
    if (br <= 0 || !horaId) return;
    const tara = parseFloat(m.binParams?.taraBin) || taraBin;
    const kg = Math.max(0, br - b * tara);
    const ev = { id: nuevoId("VD_"), horaId, bruto: br, bins: b, tara, kg, fecha: hoyISO(), hora: ahoraHM() };
    updVac(m, (v) => ({ ...v, eventos: [...(v.eventos || []), ev] }));
    registrarEvento?.({ evento: "campo_directo_vaciado", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Vació ${b} bins · bruto ${fmt(br)} − peso bins ${fmt(b * tara)} = ${fmt(kg)} kg (folio ${m.folio})` });
  };
  const delVaciado = (m, evId) => updVac(m, (v) => ({ ...v, eventos: (v.eventos || []).filter((e) => e.id !== evId) }));
  const cerrarHoraCD = (m, horaId) => updVac(m, (v) => ({ ...v, horas: (v.horas || []).map((h) => h.id === horaId ? { ...h, estado: "cerrada" } : h) }));
  // Reabrir para corregir: vuelve a "abierta" y BORRA la aprobación (hay que re-aprobar antes de SAP).
  const reabrirHoraCD = (m, horaId) => updVac(m, (v) => ({ ...v, horas: (v.horas || []).map((h) => h.id === horaId ? { ...h, estado: "abierta", aprobacion: undefined } : h) }));
  // kg neto de una hora = suma de sus eventos (registros con ese horaId).
  const kgHoraDe = (m, horaId) => (m.vaciado?.eventos || []).filter((e) => e.horaId === horaId).reduce((a, e) => a + (parseFloat(e.kg) || 0), 0);
  const cancelarHoraCD = async (m, horaId) => {
    const v = m.vaciado || {};
    const h = (v.horas || []).find((x) => x.id === horaId);
    if (!h) return;
    if (h.sapEnvio || h.sapPendiente) { dlg.alerta({ title: "No se puede cancelar", message: "Esta hora ya tiene envío a SAP (o pendiente de confirmar)." }); return; }
    const regs = (v.eventos || []).filter((e) => e.horaId === horaId);
    const ok = await dlg.confirm({ title: "Cancelar hora", message: regs.length ? `Esta hora tiene ${regs.length} registro(s). Si la cancelas, se PIERDEN. ¿Cancelarla?` : "¿Cancelar esta hora vacía?", confirmText: "Sí, cancelar hora", danger: regs.length > 0 });
    if (!ok) return;
    updVac(m, (v2) => ({ ...v2, horas: (v2.horas || []).filter((x) => x.id !== horaId), eventos: (v2.eventos || []).filter((e) => e.horaId !== horaId) }));
  };

  const registrarMermaCD = (m, kg, motivo) => {
    const k = parseFloat(kg) || 0;
    if (k <= 0) return;
    updVac(m, (v) => ({ ...v, mermas: [...(v.mermas || []), { id: nuevoId("MR_"), kg: k, motivo: (motivo || "").trim(), fecha: hoyISO(), hora: ahoraHM() }] }));
    registrarEvento?.({ evento: "campo_directo_merma", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Merma ${fmt(k)} kg del folio ${m.folio}${motivo ? ` (${motivo})` : ""}` });
  };
  const delMermaCD = (m, id) => updVac(m, (v) => ({ ...v, mermas: (v.mermas || []).filter((x) => x.id !== id) }));

  const terminarCD = async (m) => {
    const piso = kgEnPisoDe(m);
    const npb = netoPorBinDe(m);
    const ok = await dlg.confirm({
      title: "Terminar vaciado",
      message: piso > 1
        ? `Quedan ${fmt(piso)} kg en piso (~${npb > 0 ? Math.round(piso / npb) : 0} bins). Al terminar, el folio se cierra y deja de contar como piso, pero la diferencia queda guardada para auditar. ¿Terminar?`
        : "¿Marcar este folio como terminado?",
      confirmText: "Sí, terminar",
    });
    if (!ok) return;
    updVac(m, (v) => ({ ...v, terminado: { por: usuario?.nombre || "Empaque", porId: usuario?.id || "", ts: ahora().iso, pisoAlCerrar: piso } }));
    registrarEvento?.({ evento: "campo_directo_terminado", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Terminó el folio ${m.folio} (quedaban ${fmt(piso)} kg en piso)` });
  };
  const reabrirCD = async (m) => {
    const ok = await dlg.confirm({ title: "Reabrir folio", message: "El folio volverá a contar como en piso para seguir vaciando. ¿Reabrir?", confirmText: "Sí, reabrir" });
    if (!ok) return;
    updVac(m, (v) => { const c = { ...v }; delete c.terminado; return c; });
    registrarEvento?.({ evento: "campo_directo_reabierto", modulo: "M9-CD", actor: actorNombre, destino: m.folio, ref: m.id, detalle: `Reabrió el folio ${m.folio}` });
  };

  // ── ENVÍO A SAP POR HORA (mismo patrón que logística: aprobar → mandar → estados/verificar) ──
  const [enviandoHora, setEnviandoHora] = useState("");   // clave de la hora que se está enviando
  const [verificandoCD, setVerificandoCD] = useState(""); // clave que se está verificando (G4)
  const [verifMsgCD, setVerifMsgCD] = useState(null);     // { horaId, ok, texto }
  const [sapErrHora, setSapErrHora] = useState(null);     // { horaId, msg }
  // Modal de envío a SAP (rico, como logística): { m, h } + factor kg/cubeta + ficha de la orden
  // leída EN VIVO de SAP (solo GET) para confirmar contra qué orden se suma.
  const [horaSapModal, setHoraSapModal] = useState(null); // { mId, hId }
  const [horaKgCub, setHoraKgCub] = useState(6);
  const [ordSap, setOrdSap] = useState(null);
  const [ordSapCargando, setOrdSapCargando] = useState(false);
  const [ordSapError, setOrdSapError] = useState("");
  const cargarOrdenSAP = (absoluteEntry) => {
    setOrdSap(null); setOrdSapError("");
    if (!absoluteEntry) return;
    setOrdSapCargando(true);
    getOrdenFabricacionSAP(absoluteEntry).then((r) => setOrdSap(r)).catch((e) => setOrdSapError(String(e?.message || e))).finally(() => setOrdSapCargando(false));
  };
  const abrirEnvioHora = (m, h) => { setSapErrHora(null); setVerifMsgCD(null); setHoraKgCub(6); setHoraSapModal({ mId: m.id, hId: h.id }); cargarOrdenSAP(ordenDe(m)?.absoluteEntry); };

  // Aprobación del cálculo (2ª persona): la encargada revisa y habilita el envío a SAP.
  const aprobarHoraCD = async (m, h) => {
    if (!puedeAprobar) { await dlg.alerta({ title: "No puedes aprobar", message: "Solo la encargada (gerente o admin) puede aprobar el cálculo y habilitar el envío a SAP. Pídele que revise y apruebe desde su cuenta." }); return; }
    const neto = kgHoraDe(m, h.id);
    const cub = cubetasDe(neto);
    const ord = ordenDe(m);
    const ok = await dlg.confirm({
      title: "Aprobar el cálculo antes de SAP",
      message: `¿Seguro que el cálculo es correcto? Se enviarán ${cub} cubetas (${fmt(neto)} kg ÷ 6) a la orden #${(ord?.docNum ?? ord?.absoluteEntry) ?? "—"}. Quedará registrado a TU nombre. Al aprobar se habilita el botón de mandar a SAP.`,
      confirmText: "Sí, es correcto — aprobar",
    });
    if (!ok) return;
    const aprobacion = { por: actorNombre, porId: usuario?.id ?? null, tipo: usuario?.tipo_nombre ?? null, ts: ahora().iso };
    updVac(m, (v) => ({ ...v, horas: (v.horas || []).map((x) => x.id === h.id ? { ...x, aprobacion } : x) }));
    registrarEvento?.({ evento: "campo_directo_hora_aprobada", modulo: "M9-CD", actor: actorNombre, destino: m.folio, ref: m.id, detalle: `${h.etiqueta}: cálculo aprobado (${cub} cub) por ${actorNombre} — habilita envío a SAP`, meta: { horaId: h.id, cubetas: cub, porId: aprobacion.porId } });
  };

  // Confirmar el envío DESDE EL MODAL: reciboProduccionSAP (cubetas = neto ÷ kgc) a la orden de
  // fabricación, con clave idempotente `${folio}_${hora}` (anti doble conteo) y el aprobador. Si no
  // hay respuesta, queda PENDIENTE (G4) y solo se ofrece "Verificar en SAP" (nunca reenvío a ciegas).
  const confirmarEnvioHoraModal = async () => {
    if (!horaSapModal) return;
    const m = loteMovByKey(horaSapModal.mId);   // lote vivo
    const h = (m?.vaciado?.horas || []).find((x) => x.id === horaSapModal.hId);
    if (!m || !h) { setHoraSapModal(null); return; }
    const ord = ordenDe(m);
    const neto = kgHoraDe(m, h.id);
    const kgc = parseFloat(horaKgCub) || 6;
    const cub = cubetasDe(neto, kgc);
    setSapErrHora(null);
    if (esHistoricoSAP(m, goLiveSAP)) { setSapErrHora({ horaId: h.id, msg: `Este folio es HISTÓRICO (anterior al corte ${goLiveSAP}): no se manda a SAP desde aquí.` }); return; }
    if (!h.aprobacion) { setSapErrHora({ horaId: h.id, msg: "Falta APROBAR el cálculo antes de mandar a SAP." }); return; }
    if (!ord?.absoluteEntry) { setSapErrHora({ horaId: h.id, msg: "Este folio no tiene orden de fabricación en SAP." }); return; }
    if (!(cub > 0)) { setSapErrHora({ horaId: h.id, msg: "La cantidad calculada es 0." }); return; }
    setEnviandoHora(h.id); setSapErrHora(null);
    try {
      const res = await reciboProduccionSAP({ absoluteEntry: ord.absoluteEntry, cantidad: cub, movimientoId: m.id, claveEnvio: `${m.id}_${h.id}`, aprobadoPor: h.aprobacion?.por, aprobadoPorId: h.aprobacion?.porId != null ? String(h.aprobacion.porId) : undefined });
      updVac(m, (v) => ({ ...v, horas: (v.horas || []).map((x) => x.id === h.id
        ? { ...x, estado: "enviada", sapEnvio: { docEntry: res.docEntry, docNum: res.docNum, cubetas: cub, kgPorCubeta: kgc, netoKg: neto, absoluteEntry: ord.absoluteEntry, ts: ahora().iso } }
        : x) }));
      registrarEvento?.({ evento: "campo_directo_recibo_hora_sap", modulo: "M9-CD", actor: actorNombre, destino: m.folio, ref: m.id, detalle: `${h.etiqueta}: ${cub} cubetas (${fmt(neto)} kg ÷ ${kgc}) → orden #${ord.docNum ?? ord.absoluteEntry} · SAP #${res.docNum}`, meta: { horaId: h.id, cubetas: cub, netoKg: neto, docNum: res.docNum } });
      setHoraSapModal(null);
    } catch (e) {
      if (e?.sinRespuesta) {   // G4: no sabemos si quedó en SAP → PENDIENTE, no reenviar a ciegas
        updVac(m, (v) => ({ ...v, horas: (v.horas || []).map((x) => x.id === h.id ? { ...x, sapPendiente: { clave: `${m.id}_${h.id}`, absoluteEntry: ord.absoluteEntry, cubetas: cub, kgPorCubeta: kgc, netoKg: neto, ts: ahora().iso } } : x) }));
        setHoraSapModal(null);
      } else setSapErrHora({ horaId: h.id, msg: String(e?.message || e) });
    } finally { setEnviandoHora(""); }
  };

  // G4: preguntar a SAP (SOLO GET) si el recibo ya existe; adopta su doc o libera el reenvío.
  const verificarHoraCD = async (m, h) => {
    const pend = h.sapPendiente;
    if (!pend) return;
    setVerifMsgCD(null); setVerificandoCD(pend.clave);
    try {
      const r = await verificarReciboSAP({ clave: pend.clave, absoluteEntry: pend.absoluteEntry, cantidad: pend.cubetas });
      if (r.estado === "encontrado" || r.estado === "enviado") {
        updVac(m, (v) => ({ ...v, horas: (v.horas || []).map((x) => x.id === h.id ? { ...x, estado: "enviada", sapEnvio: { docEntry: r.docEntry, docNum: r.docNum, cubetas: pend.cubetas, kgPorCubeta: pend.kgPorCubeta, netoKg: pend.netoKg, absoluteEntry: pend.absoluteEntry, ts: ahora().iso, verificado: true }, sapPendiente: undefined } : x) }));
        setVerifMsgCD({ horaId: h.id, ok: true, texto: `Sí se creó en SAP (#${r.docNum}). Ya quedó registrado; NO hay que reenviarlo.` });
      } else if (r.estado === "no_encontrado") {
        updVac(m, (v) => ({ ...v, horas: (v.horas || []).map((x) => x.id === h.id ? { ...x, sapPendiente: undefined } : x) }));
        setVerifMsgCD({ horaId: h.id, ok: false, texto: "SAP NO tiene ese recibo: el envío no se completó. Ya puedes volver a mandarlo." });
      } else {
        setVerifMsgCD({ horaId: h.id, ok: false, texto: r.mensaje || "Hay varios recibos parecidos en SAP; revísalo allá antes de decidir." });
      }
    } catch (e) {
      setVerifMsgCD({ horaId: h.id, ok: false, texto: String(e?.message || e) });
    } finally { setVerificandoCD(""); }
  };

  // ── ORDEN DE COMPRA DE FLETE (igual que el movimiento de logística) ──
  const [ocMov, setOcMov] = useState(null);        // folio para el que se crea la OC
  const [ocCardCode, setOcCardCode] = useState("");
  const [ocItem, setOcItem] = useState("");
  const [ocTax, setOcTax] = useState("");
  const [ocCultivo, setOcCultivo] = useState("");
  const [ocDepto, setOcDepto] = useState("");
  const [ocFecha, setOcFecha] = useState("");
  const [ocComentario, setOcComentario] = useState("");
  const [ocDetalle, setOcDetalle] = useState("");
  const [ocCargando, setOcCargando] = useState(false);
  const [ocError, setOcError] = useState("");
  const [ocConfirm, setOcConfirm] = useState(false);   // 2do paso: confirmar antes de escribir en SAP
  const [itemsFlete, setItemsFlete] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [cultivosOC, setCultivosOC] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [flCargando, setFlCargando] = useState(false);
  const [flError, setFlError] = useState("");
  const [flInfo, setFlInfo] = useState("");

  // Tablas (Departamento SAP, dim 3): catálogo COMPLETO de SAP, con las ya usadas en ese rancho arriba.
  const tablasUsadas = (rancho) => {
    if (!rancho) return [];
    const cuenta = {};
    (movimientosCampo || []).forEach((m) => { if (m.rancho !== rancho) return; const d = (m.departamento || "").trim(); if (d) cuenta[d] = (cuenta[d] || 0) + 1; });
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([d]) => d);
  };
  const opcionesTablas = (rancho, valorActual) => {
    const etiqueta = (code) => { const d = departamentos.find((x) => x.FactorCode === code); return d?.FactorDescription && d.FactorDescription !== code ? `${code} · ${d.FactorDescription}` : code; };
    const usadas = tablasUsadas(rancho);
    const resto = departamentos.map((d) => d.FactorCode).filter((c) => c && !usadas.includes(c));
    const opts = [...usadas.map((c) => ({ value: c, label: `★ ${etiqueta(c)}` })), ...resto.map((c) => ({ value: c, label: etiqueta(c) }))];
    if (valorActual && !opts.some((o) => o.value === valorActual)) opts.unshift({ value: valorActual, label: valorActual });
    return opts;
  };

  const cargarProveedoresSAP = async () => {
    setFlCargando(true); setFlError(""); setFlInfo("");
    try {
      const d = await getProveedoresFleteSAP("");
      const lista = (d.value || []).map((b) => ({ cardCode: b.CardCode, nombre: b.CardName || b.CardCode, rfc: b.FederalTaxID || "", telefono: b.Phone1 || "", email: b.EmailAddress || "" }));
      setProveedores((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const byCode = new Map(base.map((p) => [p.cardCode, p]));
        for (const p of lista) byCode.set(p.cardCode, { ...byCode.get(p.cardCode), ...p });
        return Array.from(byCode.values()).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
      });
      setFlInfo(`${lista.length} fletero(s) traídos de SAP`);
    } catch (e) { setFlError(String(e?.message || e)); }
    finally { setFlCargando(false); }
  };
  const cargarCatalogosOC = async () => {
    try { const d = await getItemsFleteSAP(); const items = d.value || []; setItemsFlete(items); const it = items.find((x) => /acarreo de fruta/i.test(x.ItemName || "")) || items[0]; if (it) setOcItem(it.ItemCode || ""); } catch { /* noop */ }
    try { const d = await getTaxCodesSAP(); const txs = d.value || []; setTaxCodes(txs); const t = txs.find((x) => /16/.test(`${x.Code} ${x.Name}`)) || txs[0]; if (t) setOcTax(t.Code || ""); } catch { /* noop */ }
    try { const d = await getCultivosSAP(); setCultivosOC(d.value || []); } catch { /* noop */ }
    try { const d = await getDepartamentosSAP(); setDepartamentos(d.value || []); } catch { /* noop */ }
  };
  const abrirOC = (m) => {
    setOcError(""); setOcConfirm(false); setOcCardCode(""); setOcItem(""); setOcTax("");
    const proj = (proyectos || []).find((p) => p.code === m.proyecto);
    const r = proj?.ranchos?.find((x) => x.nombre === m.rancho);
    setOcCultivo(r?.cultivo || m.cultivo || "");
    setOcDepto(m.departamento || r?.departamento || "");
    setOcFecha(hoyISO());
    setOcComentario(`Acarreo flete · Folio ${m.folio || ""} · ${m.rancho || ""} · ${m.fecha || ""}${m.chofer ? " · " + m.chofer : ""}`.trim());
    setOcDetalle([`ACARREO`, r?.cultivo || m.cultivo, m.rancho ? `Lote ${m.rancho}` : ""].filter(Boolean).join(" · "));
    setOcMov(m);
    cargarCatalogosOC();
  };
  const confirmarOC = async () => {
    const m = ocMov;
    const precio = parseFloat(m.flete) || 0;
    if (!ocCardCode) { setOcError("Elige el fletero."); return; }
    if (!ocItem) { setOcError("Elige el item de flete."); return; }
    if (!(precio > 0)) { setOcError("El folio no tiene 'Flete $' (precio). Edítalo y captura el flete antes de mandar la OC."); return; }
    const proj = (proyectos || []).find((p) => p.code === m.proyecto);
    const r = proj?.ranchos?.find((x) => x.nombre === m.rancho);
    setOcCargando(true); setOcError("");
    try {
      const res = await crearOrdenCompraSAP({
        cardCode: ocCardCode, item: ocItem, precio, taxCode: ocTax,
        proyecto: m.proyecto || null, cultivo: ocCultivo || r?.cultivo || m.cultivo || null, lote: m.rancho || null,
        departamento: ocDepto || r?.departamento || m.departamento || null, comentario: ocComentario,
        detalle: ocDetalle || null, requiredDate: ocFecha || null,
        movimientoId: m.id, origen: "campo-directo",   // idempotencia: evita doble OC en SAP
      });
      setMovimientosCampo((prev) => prev.map((x) => x.id === m.id ? { ...x, ocSAP: { solicitud: res.solicitud, pedido: res.pedido, cardCode: ocCardCode, item: ocItem, precio, taxCode: ocTax, ts: ahora().iso } } : x));
      await guardarFolioOC(res?.pedido?.docEntry, m.folio);   // folio → Control de Fletes
      registrarEvento?.({ evento: "campo_directo_oc_sap", modulo: "M9-CD", actor: actorNombre, destino: m.folio, ref: m.id, detalle: `OC de flete: Sol #${res.solicitud?.docNum ?? "?"} · Ped #${res.pedido?.docNum ?? "?"} ($${precio})` });
      setOcMov(null);
    } catch (e) { setOcError(String(e?.message || e)); }
    finally { setOcCargando(false); }
  };

  // Estado de factura de las OC en SAP (solo lectura): al abrir y cada 5 min; una vez facturado no re-consulta.
  const [estadosOC, setEstadosOC] = useState({});   // { [movId]: { factura, estado } }
  const estadosOCRef = useRef(estadosOC);
  useEffect(() => { estadosOCRef.current = estadosOC; }, [estadosOC]);
  const movsRef = useRef(movimientosCampo);
  useEffect(() => { movsRef.current = movimientosCampo; }, [movimientosCampo]);
  const refrescandoOCRef = useRef(false);
  const refrescarEstadosOC = useCallback(async () => {
    if (refrescandoOCRef.current) return;
    refrescandoOCRef.current = true;
    try {
      const pend = (movsRef.current || []).filter((m) => m.ocSAP?.pedido?.docEntry && !((estadosOCRef.current[m.id]?.factura ?? m.ocSAP?.factura)?.existe));
      for (const m of pend) {
        try { const est = await getEstadoOCSAP(m.ocSAP.pedido.docEntry); setEstadosOC((prev) => ({ ...prev, [m.id]: { factura: est.factura, estado: est.pedido } })); } catch { /* SAP no respondió */ }
      }
    } finally { refrescandoOCRef.current = false; }
  }, []);
  const ocKey = (movimientosCampo || []).filter((m) => m.ocSAP?.pedido?.docEntry).map((m) => m.id).join(",");
  useEffect(() => {
    refrescarEstadosOC();
    const id = setInterval(refrescarEstadosOC, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [ocKey, refrescarEstadosOC]);

  // Bloqueo de edición del folio: si ya tocó SAP, solo el PRECIO es editable; si la OC ya tiene Nº
  // de pedido, ni el precio (todo bloqueado).
  const mEditando = editId ? lista.find((x) => x.id === editId) : null;
  const lockCamposEdit = mEditando ? tieneSAPcd(mEditando) : false;
  const lockPrecioEdit = !!(mEditando?.ocSAP?.pedido?.docNum ?? mEditando?.ocSAP?.pedido?.docEntry);
  const inpLock = lockCamposEdit ? `${INP} bg-gray-50 text-gray-400 cursor-not-allowed` : INP;
  const inpPrecio = lockPrecioEdit ? `${INP} bg-gray-50 text-gray-400 cursor-not-allowed` : INP;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2 gap-y-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Sprout size={18} className="text-emerald-600" /> Empaque campo directo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Carros que llegan directo de campo (sin pasar por logística). Se pesan y se vacían aquí.</p>
        </div>
        <div className="flex items-center gap-2">
          {lista.length > 0 && <button onClick={limpiarTodo} className="text-[11px] text-gray-400 hover:text-red-600 underline">Limpiar todo (prueba)</button>}
          <button onClick={abrirNuevo} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-emerald-700 shadow-sm">
            <Plus size={16} /> Nuevo folio
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { lab: "Folios", val: lista.length, color: "text-gray-900" },
          { lab: "Bins mandados", val: fmt(totBins), color: "text-emerald-700" },
          { lab: "Vaciado (kg)", val: fmt(totVaciado), color: "text-green-700" },
          { lab: "En piso (kg)", val: fmt(totPiso), color: "text-amber-700", sub: `de ${fmt(totRecibido)} kg teóricos` },
        ].map((s) => (
          <div key={s.lab} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="text-[11px] text-gray-500">{s.lab}</div>
            <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
            {s.sub && <div className="text-[10px] text-gray-400">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Reporte del día (PDF/Excel) — tabla por folio, igual que logística */}
      <div className="mb-4 flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-xl px-3 py-2.5">
        <span className="text-[13px] font-semibold text-gray-700 inline-flex items-center gap-1.5"><FileText size={15} className="text-gray-400" /> Reporte de vaciado por hora</span>
        <span className="text-[11px] text-gray-400">· una tabla por folio · bins = {fmt(kgPorBin)} kg</span>
        <label className="text-xs text-gray-500 inline-flex items-center gap-1 ml-1">Día:
          <input type="date" value={diaReporte} onChange={(e) => setDiaReporte(e.target.value)} className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white" />
        </label>
        <div className="flex-1" />
        {foliosReporteCD.length === 0 ? (
          <span className="text-[11px] text-gray-400 italic">Sin vaciados el día seleccionado</span>
        ) : (
          <>
            <button onClick={() => generarExcelVaciadoHora(argsReporte)} className="text-[11px] bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700 inline-flex items-center gap-1"><FileText size={13} /> Excel</button>
            <button onClick={() => generarPDFVaciadoHora(argsReporte)} className="text-[11px] bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 inline-flex items-center gap-1"><FileText size={13} /> PDF</button>
          </>
        )}
      </div>

      {/* Config del bin */}
      <div className="mb-4 bg-emerald-50/50 border border-emerald-200 rounded-xl">
        <button onClick={() => setCfgAbierto((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold text-emerald-800">
          <span className="inline-flex items-center gap-1.5"><Package size={14} /> Parámetros del bin · 1 bin = {fmt(brutoPorBin)} kg bruto · peso del bin {fmt(taraBin)} kg · <b>{fmt(netoPorBin)} kg neto</b> · {fmt(cubetasPorBin)} cubetas</span>
          {cfgAbierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {cfgAbierto && (
          <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-emerald-100 pt-3">
            {[
              { k: "brutoPorBin", lab: "Bruto por bin (kg)", val: cd.brutoPorBin },
              { k: "taraBin", lab: "Peso del bin vacío (kg)", val: cd.taraBin },
              { k: "cubetasPorBin", lab: "Cubetas por bin (ticket)", val: cd.cubetasPorBin },
            ].map((c) => (
              <label key={c.k} className="block">
                <span className="text-[11px] text-gray-600">{c.lab}</span>
                <input type="number" min="0" step="0.01" value={c.val ?? ""} onChange={(e) => setCd({ [c.k]: e.target.value })} className={INP} />
              </label>
            ))}
            <p className="sm:col-span-3 text-[11px] text-emerald-700">El neto teórico de cada folio se calcula con estos valores al momento de guardarlo (se conservan por folio para auditar). Cambiarlos aquí afecta solo a los folios nuevos o reeditados.</p>
          </div>
        )}
      </div>

      {/* Lista por LOTE (junta los folios de cada temporada+lote; se vacía a nivel lote) */}
      {lotes.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl py-10 text-center text-sm text-gray-400">
          No hay folios de campo directo todavía. Da clic en <b className="text-gray-600">Nuevo folio</b> para capturar uno.
        </div>
      ) : (
        <div className="space-y-2">
          {lotes.map((lt) => {
            const lm = loteMov(lt);
            const abierto = expandido === lt.key;
            const rec = kgRecibidosDe(lm);
            const vac = kgVaciadosDe(lm);
            const piso = kgEnPisoDe(lm);
            const term = estaTerminado(lm);
            const pct = rec > 0 ? Math.min(100, Math.round((vac / rec) * 100)) : 0;
            const npb = netoPorBinDe(lm);
            const binsPiso = npb > 0 ? Math.round(piso / npb) : 0;
            const ord = ordenDe(lm);
            return (
              <div key={lt.key} className={`bg-white border rounded-xl overflow-hidden ${term ? "border-gray-200" : abierto ? "border-emerald-300 ring-1 ring-emerald-100" : "border-gray-200"}`}>
                <div className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <span className="text-[10px] font-bold text-white bg-emerald-600 rounded px-1.5 py-0.5">LOTE</span>
                    <span className="font-bold text-gray-900">{lt.rancho || "—"}</span>
                  </div>
                  <span className="text-xs text-gray-400">{temporadaDe(lt.rancho) || (proyectos || []).find((p) => p.code === lt.proyecto)?.nombre || "—"}</span>
                  {ord?.absoluteEntry != null && <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5">Orden #{ord.docNum ?? ord.absoluteEntry}</span>}
                  <span className="text-[11px] text-gray-600"><b className="text-gray-800">{fmt(lt.binsRec)}</b> bins · {lt.folios.length} folio{lt.folios.length !== 1 ? "s" : ""}</span>
                  <div className="flex-1" />
                  {term ? (
                    <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><Check size={12} /> Terminado{kgSobranteCierre(lm) > 1 ? ` · sobraron ${fmt(kgSobranteCierre(lm))} kg` : ""}</span>
                  ) : (
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">{pct}%</span>
                      <span className="text-xs whitespace-nowrap"><span className="text-amber-700 font-bold">{fmt(piso)}</span> <span className="text-gray-400">kg piso{binsPiso > 0 ? ` · ~${binsPiso} bins` : ""}</span></span>
                    </div>
                  )}
                  <button onClick={() => setExpandido(abierto ? null : lt.key)} className={`text-xs font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${abierto ? "bg-emerald-600 text-white" : "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>{abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Vaciar</button>
                </div>
                {abierto && (
                  <div className="border-t border-gray-100">
                    <VaciadoPanel
                      m={lm} fmt={fmt} orden={ord}
                      onAbrirHora={() => abrirHoraCD(lm)}
                      onRegistrar={(horaId, bruto, bins) => registrarVaciado(lm, horaId, bruto, bins)}
                      taraBin={taraBin}
                      onDelEvento={(evId) => delVaciado(lm, evId)}
                      onCerrarHora={(horaId) => cerrarHoraCD(lm, horaId)}
                      onReabrirHora={(horaId) => reabrirHoraCD(lm, horaId)}
                      onCancelarHora={(horaId) => cancelarHoraCD(lm, horaId)}
                      onMerma={(kg, mot) => registrarMermaCD(lm, kg, mot)}
                      onDelMerma={(id) => delMermaCD(lm, id)}
                      onTerminar={() => terminarCD(lm)}
                      onReabrir={() => reabrirCD(lm)}
                      sap={{
                        puedeAprobar, puedeEnviarSap,
                        esHist: esHistoricoSAP({ fecha: lt.folios[0]?.fecha }, goLiveSAP), goLiveSAP,
                        onAprobar: (h) => aprobarHoraCD(lm, h),
                        onEnviar: (h) => abrirEnvioHora(lm, h),
                        onVerificar: (h) => verificarHoraCD(lm, h),
                        enviandoClave: enviandoHora, verificandoClave: verificandoCD,
                        verifMsg: verifMsgCD, error: sapErrHora,
                      }}
                    />
                    {/* Folios (entradas de bins) de este lote */}
                    <div className="px-3 py-3 bg-gray-50/60 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-gray-500 uppercase">Folios de este lote ({lt.folios.length})</span>
                        <button onClick={() => { setEditId(null); setForm({ ...formVacio(), rancho: lt.rancho, proyecto: lt.proyecto, departamento: lt.folios[0]?.departamento || "" }); }} className="text-[11px] text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"><Plus size={12} /> Agregar bins a este lote</button>
                      </div>
                      <div className="space-y-1">
                        {lt.folios.map((f) => (
                          <div key={f.id} className="flex items-center gap-2 text-xs bg-white border border-gray-100 rounded px-2 py-1.5 flex-wrap">
                            <span className="font-semibold text-gray-800">{f.folio || "(sin folio)"}</span>
                            <span className="text-emerald-700"><b>{fmt(f.bins)}</b> bins</span>
                            {f.transporte && <span className="text-gray-400 truncate">· {f.transporte}</span>}
                            {f.departamento && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">Tabla: {f.departamento}</span>}
                            <div className="flex-1" />
                            {!f.ocSAP ? (
                              <button onClick={() => abrirOC(f)} title="Crear OC de flete de este folio" className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-1"><FileText size={12} /> OC</button>
                            ) : (
                              <span title="OC en SAP" className="text-[10px] px-1.5 py-0.5 border border-green-200 rounded bg-green-50 text-green-700 inline-flex items-center gap-1"><Check size={11} /> Sol #{f.ocSAP.solicitud?.docNum ?? "?"} · Ped #{f.ocSAP.pedido?.docNum ?? "?"}{(estadosOC[f.id]?.factura ?? f.ocSAP?.factura)?.existe ? " · Fact." : ""}</span>
                            )}
                            <button onClick={() => abrirEditar(f)} title="Editar / completar datos" className="text-gray-400 hover:text-emerald-700 p-0.5"><Pencil size={14} /></button>
                            {tieneSAPcd(f) ? (
                              <span title="No se puede borrar: tiene OC, o su lote ya mandó a SAP" className="text-gray-200 p-0.5 cursor-not-allowed"><Trash2 size={14} /></span>
                            ) : (
                              <button onClick={() => borrar(f)} title="Borrar folio" className="text-gray-300 hover:text-red-600 p-0.5"><Trash2 size={14} /></button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar folio */}
      {form && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onMouseDown={cerrarForm}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Sprout size={17} className="text-emerald-600" /> {editId ? "Editar folio" : "Nuevo folio"} · campo directo</h3>
              <button onClick={cerrarForm} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(lockCamposEdit || lockPrecioEdit) && (
                <div className="sm:col-span-2 text-[12px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
                  <Ban size={14} className="mt-0.5 shrink-0" />
                  {lockPrecioEdit
                    ? <span>Este folio ya tiene <b>OC creada en SAP</b> (Nº de pedido): ya <b>no se puede editar</b> nada.</span>
                    : <span>Este folio ya <b>vació a SAP</b>: solo se puede cambiar el <b>Flete $</b> (por si el precio cambia antes de hacer la OC). Lo demás queda bloqueado para no desincronizar con SAP.</span>}
                </div>
              )}
              <Campo lab="Lote * (escribe o elige)">
                <SearchSelect value={form.rancho} onChange={onLote} options={loteOpts} allowCustom disabled={lockCamposEdit} placeholder="Ramos…" className={inpLock} />
                <span className="text-[11px] text-gray-400 mt-0.5 block">Temporada: <b className="text-gray-600">{temporadaDe(form.rancho) || "— se resuelve al elegir el lote —"}</b></span>
              </Campo>
              <Campo lab="Tabla (departamento) *">
                <SearchSelect value={form.departamento} onChange={(v) => upd({ departamento: v })} options={tablaOpts} allowCustom disabled={lockCamposEdit} placeholder="Tabla…" className={inpLock} />
              </Campo>
              <Campo lab="Folio * (remisión)">
                <input value={form.folio} onChange={(e) => upd({ folio: e.target.value })} disabled={lockCamposEdit} placeholder="002038" className={inpLock} />
              </Campo>
              <Campo lab="Bins mandados *">
                <input type="number" min="0" step="1" value={form.bins} onChange={(e) => upd({ bins: e.target.value })} disabled={lockCamposEdit} placeholder="36" className={inpLock} />
              </Campo>
              <Campo lab="Cultivo (fijo)">
                <input value={form.cultivo} readOnly disabled className={`${INP} bg-gray-50 text-gray-500`} />
              </Campo>
              <Campo lab="Transporte">
                <SearchSelect value={form.transporte} onChange={(v) => upd({ transporte: v })} options={transporteOpts} allowCustom disabled={lockCamposEdit} placeholder="Camión blanco Z-JN3 607" className={inpLock} />
              </Campo>
              <Campo lab="Chofer">
                <SearchSelect value={form.chofer} onChange={(v) => upd({ chofer: v })} options={choferOpts} allowCustom disabled={lockCamposEdit} placeholder="Rubén Cota" className={inpLock} />
              </Campo>
              <Campo lab="Fecha de llegada">
                <input type="date" value={form.fecha} onChange={(e) => upd({ fecha: e.target.value })} disabled={lockCamposEdit} className={inpLock} />
              </Campo>
              <Campo lab="Hora de salida">
                <input type="time" value={form.horaSalida} onChange={(e) => upd({ horaSalida: e.target.value })} disabled={lockCamposEdit} className={inpLock} />
              </Campo>
              <Campo lab="Hora de llegada">
                <input type="time" value={form.horaLlegada} onChange={(e) => upd({ horaLlegada: e.target.value })} disabled={lockCamposEdit} className={inpLock} />
              </Campo>
              <Campo lab="Flete $ (opcional)">
                <input type="number" min="0" step="0.01" value={form.flete} onChange={(e) => upd({ flete: e.target.value })} disabled={lockPrecioEdit} placeholder="se puede llenar después" className={inpPrecio} />
                <span className="text-[11px] text-gray-400 mt-0.5 block">Precio del flete para la OC. Puede quedar vacío y llenarse después.</span>
              </Campo>
              <div className="sm:col-span-2">
                <Campo lab="Observaciones">
                  <input value={form.observaciones} onChange={(e) => upd({ observaciones: e.target.value })} disabled={lockCamposEdit} placeholder="(opcional)" className={inpLock} />
                </Campo>
              </div>

              {/* Cálculo en vivo */}
              <div className="sm:col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-center gap-4 flex-wrap text-sm">
                <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold"><Truck size={15} /> {fmt(bins)} bins</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-700">Bruto: <b>{fmt(brutoTotal)}</b> kg</span>
                <span className="text-gray-700">Peso de bins: <b>{fmt(bins * taraBin)}</b> kg</span>
                <span className="text-indigo-700">Neto teórico: <b>{fmt(netoTeorico)}</b> kg</span>
                <span className="text-amber-700">Cubetas: <b>{fmt(cubetasTicket)}</b></span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
              <button onClick={cerrarForm} className="text-sm text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100">{lockPrecioEdit ? "Cerrar" : "Cancelar"}</button>
              {!lockPrecioEdit && (
                <button onClick={guardar} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700"><Save size={15} /> {editId ? "Guardar cambios" : "Guardar folio"}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de envío a SAP (rico, como logística) */}
      {horaSapModal && (() => {
        const m = loteMovByKey(horaSapModal.mId);
        const h = (m?.vaciado?.horas || []).find((x) => x.id === horaSapModal.hId);
        if (!m || !h) return null;
        const ord = ordenDe(m);
        const neto = kgHoraDe(m, h.id);
        const kgc = parseFloat(horaKgCub) || 6;
        const cubetas = cubetasDe(neto, kgc);
        const loteFolio = (m.rancho || "").trim().toUpperCase();
        const loteSap = (ordSap?.lote || "").trim().toUpperCase();
        const difiere = !!(ordSap && loteSap && loteFolio && loteSap !== loteFolio);
        const errMsg = sapErrHora?.horaId === h.id ? sapErrHora.msg : null;
        const fila = (l, v) => (
          <div className="flex items-start justify-between gap-3 px-2.5 py-1">
            <span className="text-gray-500 shrink-0">{l}</span>
            <span className="text-gray-800 font-semibold text-right break-words">{v ?? "—"}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setHoraSapModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-gray-100 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 w-full"><Send size={16} /> Mandar {h.etiqueta} a SAP — Folio {m.folio || "—"}</div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><div className="text-gray-400">Temporada</div><div className="font-semibold">{ord?.temporada || "—"}</div></div>
                  <div><div className="text-gray-400">Rancho</div><div className="font-semibold">{ord?.rancho || "—"}</div></div>
                  <div><div className="text-gray-400">Orden fabricación</div><div className="font-semibold">#{(ord?.docNum ?? ord?.absoluteEntry) ?? "—"}</div></div>
                  <div><div className="text-gray-400">Ejote neto de la hora</div><div className="font-semibold">{fmt(neto)} kg</div></div>
                </div>
                {h.aprobacion && <div className="text-[11px] text-green-700 inline-flex items-center gap-1"><Check size={13} /> Cálculo aprobado por {h.aprobacion.por}</div>}
                {/* Ficha de la orden leída EN VIVO de SAP (solo GET) */}
                <div className="text-[11px] border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-2.5 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-700 inline-flex items-center gap-1"><Search size={12} /> Orden de fabricación (leída de SAP)</span>
                    {ordSapCargando && <span className="text-gray-400">consultando…</span>}
                  </div>
                  {ordSapError ? (
                    <div className="px-2.5 py-2 text-amber-700 bg-amber-50">No se pudo leer la orden en SAP para verificar ({ordSapError}). Revisa el número antes de mandar.</div>
                  ) : ordSap ? (
                    <div className="divide-y divide-gray-100">
                      {fila("Nº de orden en SAP", <span className="text-indigo-700">#{ordSap.docNum ?? ordSap.absoluteEntry}</span>)}
                      {fila("Artículo", <>{ordSap.item}{ordSap.descripcion ? ` · ${ordSap.descripcion}` : ""}</>)}
                      {fila("Lote (rancho) en SAP", <span className={difiere ? "text-red-700" : "text-gray-800"}>{ordSap.lote || "—"}</span>)}
                      {ordSap.departamento ? fila("Departamento en SAP", ordSap.departamento) : null}
                      {ordSap.proyecto ? fila("Proyecto en SAP", ordSap.proyecto) : null}
                      {fila("Avance de la orden", <>{fmt(ordSap.completado)} / {fmt(ordSap.planeado)} · faltan <b className="text-amber-700">{fmt(ordSap.restante)}</b></>)}
                      {difiere && (
                        <div className="px-2.5 py-2 bg-red-50 text-red-700">⚠️ <b>El lote NO coincide.</b> La orden #{ordSap.docNum ?? ordSap.absoluteEntry} es del lote <b>{ordSap.lote}</b>, pero este folio es del lote <b>{m.rancho}</b>. Verifícalo antes de mandar.</div>
                      )}
                    </div>
                  ) : (
                    <div className="px-2.5 py-2 text-gray-400">Consultando la orden en SAP…</div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs mb-1"><span className="text-gray-500">kg por cubeta</span><input type="number" value={horaKgCub} onChange={(e) => setHoraKgCub(e.target.value)} className="w-20 text-sm px-2 py-1 border border-gray-200 rounded text-right" /></div>
                  <div className="flex items-center justify-between"><span className="text-sm font-semibold text-indigo-700">Cubetas a SAP</span><span className="text-2xl font-bold text-indigo-700">{cubetas.toLocaleString()}</span></div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{fmt(neto)} kg ÷ {kgc} = {cubetas} cubetas → suma a "Cantidad completada".</div>
                </div>
                {!ord?.absoluteEntry && <div className="inline-flex items-center gap-1 text-[11px] text-red-600"><AlertTriangle size={14} /> Este folio no tiene orden de fabricación en SAP.</div>}
                {errMsg && <div className="text-[11px] text-red-600">No se pudo enviar: {errMsg}</div>}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
                <button onClick={() => setHoraSapModal(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                <button onClick={confirmarEnvioHoraModal} disabled={enviandoHora === h.id || !ord?.absoluteEntry || !(cubetas > 0)} className="text-xs px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">{enviandoHora === h.id ? "Enviando…" : "Confirmar envío a SAP"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Orden de compra de flete (Solicitud + Pedido) — igual que logística */}
      {ocMov && (() => {
        const m = ocMov;
        const precio = parseFloat(m.flete) || 0;
        const proj = (proyectos || []).find((p) => p.code === m.proyecto);
        const r = proj?.ranchos?.find((x) => x.nombre === m.rancho);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1"><FileText size={16} /> Orden de compra de flete — Folio {m.folio || "—"}</div>
                <button onClick={() => setOcMov(null)} className="text-gray-400 hover:text-gray-700 inline-flex items-center"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-400">Temporada</span><div className="font-medium text-gray-800">{temporadaDe(m.rancho) || m.proyecto || "—"}</div></div>
                  <div><span className="text-gray-400">Rancho (lote)</span><div className="font-medium text-gray-800">{m.rancho || "—"}</div></div>
                </div>
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 text-xs flex items-center justify-between">
                  <span className="text-gray-500">Precio (Flete $ del folio)</span>
                  <span className="text-lg font-bold text-indigo-700">${precio.toLocaleString()}</span>
                </div>
                {!(precio > 0) && <div className="text-[11px] text-amber-600 inline-flex items-center gap-1"><AlertTriangle size={14} /> Este folio no tiene "Flete $". Edítalo y captura el flete antes de mandar la OC.</div>}
                <div>
                  <label className="text-[11px] font-medium text-gray-600 mb-0.5 block">Cultivo {r?.cultivo ? <span className="text-gray-400 font-normal">· del proyecto: {r.cultivo}</span> : null}</label>
                  <SearchSelect className={INP} value={ocCultivo} onChange={setOcCultivo} searchThreshold={0} placeholder="— Cultivo (norma de reparto) —"
                    options={(() => { const opts = cultivosOC.map((c) => ({ value: c.FactorCode, label: `${c.FactorCode}${c.FactorDescription ? " · " + c.FactorDescription : ""}` })); if (ocCultivo && !opts.some((o) => o.value === ocCultivo)) opts.unshift({ value: ocCultivo, label: ocCultivo }); return opts; })()} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-600 mb-0.5 block">Departamento (tabla) {m.departamento ? <span className="text-gray-400 font-normal">· tabla del folio: {m.departamento}</span> : (r?.departamento ? <span className="text-gray-400 font-normal">· del proyecto: {r.departamento}</span> : null)}</label>
                  <SearchSelect className={INP} value={ocDepto} onChange={setOcDepto} searchThreshold={0} placeholder="— Departamento (tabla) —" options={opcionesTablas(m.rancho, ocDepto)} />
                  {m.departamento && ocDepto !== m.departamento && (<div className="text-[10px] text-amber-700 mt-0.5">Ojo: cambiaste la tabla; en el folio quedó <b>{m.departamento}</b>.</div>)}
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-gray-600 mb-0.5 block">Fletero (proveedor)</label>
                    <button onClick={cargarProveedoresSAP} disabled={flCargando} className="text-[11px] text-indigo-600 hover:underline disabled:opacity-50">{flCargando ? "Trayendo…" : <span className="inline-flex items-center gap-1"><RefreshCw size={14} /> Traer de SAP</span>}{flInfo ? ` · ${flInfo}` : ""}</button>
                  </div>
                  <SearchSelect className={INP} value={ocCardCode} onChange={setOcCardCode} searchThreshold={0} placeholder={proveedores.length ? "— Elige fletero —" : "Primero trae fleteros desde SAP"}
                    options={proveedores.map((p) => ({ value: p.cardCode, label: `${p.nombre} · ${p.cardCode}` }))} />
                  {flError && <div className="text-[11px] text-red-600 mt-0.5">{flError}</div>}
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-600 mb-0.5 block">Item de flete</label>
                  <SearchSelect className={INP} value={ocItem} onChange={setOcItem} searchThreshold={0} placeholder="— Item —" options={itemsFlete.map((it) => ({ value: it.ItemCode, label: `${it.ItemCode} · ${it.ItemName}` }))} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-600 mb-0.5 block">IVA</label>
                  <SearchSelect className={INP} value={ocTax} onChange={setOcTax} searchThreshold={0} placeholder="— IVA —" options={taxCodes.map((t) => ({ value: t.Code, label: `${t.Code}${t.Name ? " · " + t.Name : ""}` }))} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-600 mb-0.5 block">Fecha necesaria</label>
                  <input type="date" value={ocFecha} onChange={(e) => setOcFecha(e.target.value)} className={INP} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-600 mb-0.5 block">Detalles de artículo <span className="text-gray-400">· en la línea de la OC</span></label>
                  <textarea value={ocDetalle} onChange={(e) => setOcDetalle(e.target.value)} rows={2} className={INP} placeholder="Ej. ACARREO · Ejote · Lote Ramos" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-600 mb-0.5 block">Comentario</label>
                  <textarea value={ocComentario} onChange={(e) => setOcComentario(e.target.value)} rows={2} className={INP} />
                </div>
                {ocError && <div className="text-[11px] text-red-600">No se pudo crear la OC: {ocError}</div>}
              </div>
              {!ocConfirm ? (
                <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
                  <button onClick={() => setOcMov(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                  <button onClick={() => { setOcError(""); setOcConfirm(true); }} disabled={ocCargando || !ocCardCode || !ocItem || !(precio > 0)} className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">Crear OC en SAP</button>
                </div>
              ) : (
                <div className="px-5 py-3 border-t border-amber-200 bg-amber-50/60">
                  <div className="text-[12px] text-amber-800 font-medium mb-2"><AlertTriangle size={14} className="inline-block align-text-bottom mr-1" /> ¿Seguro? Esto va a <b>crear la OC directamente en SAP</b> (Solicitud + Pedido). No se puede deshacer desde aquí.</div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setOcConfirm(false)} disabled={ocCargando} className="text-xs px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white disabled:opacity-50">No, volver</button>
                    <button onClick={confirmarOC} disabled={ocCargando || !ocCardCode || !ocItem || !(precio > 0)} className="text-xs px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50">{ocCargando ? "Creando…" : "Sí, crear en SAP"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Campo({ lab, children }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600 mb-0.5 block">{lab}</span>
      {children}
    </label>
  );
}


// ── Panel de VACIADO por HORAS de un folio ──
// Como logística: se ABRE una hora, se registran bins DENTRO de ella, se CIERRA y luego se manda
// esa hora a SAP (Fase 3) a su orden de fabricación. El kg de cada hora = suma de sus registros;
// el "en piso" y las cubetas (neto ÷ 6) salen de los helpers de empaque (mismos números).
function VaciadoPanel({ m, netoPorBin, taraBin, fmt, orden, sap, onAbrirHora, onRegistrar, onDelEvento, onCerrarHora, onReabrirHora, onCancelarHora, onMerma, onDelMerma, onTerminar, onReabrir }) {
  const rec = kgRecibidosDe(m);
  const vac = kgVaciadosDe(m);
  const mer = kgMermadosDe(m);
  const piso = kgEnPisoDe(m);
  const term = estaTerminado(m);
  const horas = m.vaciado?.horas || [];
  const evs = m.vaciado?.eventos || [];
  const mrs = m.vaciado?.mermas || [];
  const sueltos = evs.filter((e) => !e.horaId);   // registros viejos sin hora (datos previos)
  const binsPiso = netoPorBin > 0 ? Math.round(piso / netoPorBin) : 0;
  const cubetas = cubetasDe(vac);   // neto ÷ 6, lo que irá a SAP
  const hayAbierta = horas.some((h) => h.estado === "abierta");
  const evsDe = (horaId) => evs.filter((e) => e.horaId === horaId);
  const kgDe = (horaId) => evsDe(horaId).reduce((a, e) => a + (parseFloat(e.kg) || 0), 0);

  const [reloj, setReloj] = useState(ahoraHM());   // reloj en tiempo real (no editable)
  const [mermaOpen, setMermaOpen] = useState(false);
  const [mermaKg, setMermaKg] = useState("");
  const [mermaMot, setMermaMot] = useState("");
  useEffect(() => { const t = setInterval(() => setReloj(ahoraHM()), 1000); return () => clearInterval(t); }, []);

  const doMerma = () => { const k = parseFloat(mermaKg) || 0; if (k <= 0) return; onMerma(k, mermaMot); setMermaKg(""); setMermaMot(""); setMermaOpen(false); };

  return (
    <div className="p-3 bg-emerald-50/30">
      {/* Orden de fabricación (SAP) a la que corresponde este folio */}
      <div className="mb-2.5">
        {orden?.absoluteEntry != null ? (
          <span className="inline-flex items-center gap-1.5 text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5">
            <Package size={13} className="text-indigo-600" />
            <span className="text-gray-600">Orden de fabricación:</span>
            <b className="text-indigo-700">{orden.docNum != null ? `#${orden.docNum}` : `entry ${orden.absoluteEntry}`}</b>
            {orden.item && <span className="text-gray-400">· art. {orden.item}</span>}
            {orden.varias && <span className="text-amber-600" title="El lote tiene varias órdenes; se usa la primera">· (varias, se usa la 1ª)</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-2.5 py-1.5">
            <Package size={13} />
            {orden?.hayCatalogo
              ? "Este lote no tiene orden de fabricación en SAP."
              : "Lote fuera del catálogo SAP: no se podrá mandar a SAP hasta elegir un lote válido."}
          </span>
        )}
      </div>
      {/* Barra de flujo: Recibido → Vaciado → En piso */}
      <div className="flex items-stretch gap-2 mb-3 flex-wrap">
        <Flujo lab="Recibido (teórico)" val={`${fmt(rec)} kg`} color="text-gray-800" />
        <Flecha />
        <Flujo lab="Vaciado" val={`${fmt(vac)} kg`} sub={`${cubetas} cub a SAP`} color="text-green-700" />
        <Flecha />
        <Flujo lab="En piso" val={`${fmt(piso)} kg`} sub={binsPiso > 0 ? `~${binsPiso} bins` : undefined} color="text-amber-700" big />
        {mer > 0 && (<><Flecha /><Flujo lab="Mermado" val={`${fmt(mer)} kg`} color="text-red-600" /></>)}
      </div>

      {/* Real (pesado) vs teórico (bins × neto/bin): para ver si viene de MÁS o de MENOS */}
      {(() => {
        const binsVac = evs.reduce((a, e) => a + (parseFloat(e.bins) || 0), 0);
        if (binsVac <= 0) return null;
        const teorico = binsVac * netoPorBin;
        const diff = Math.round(vac - teorico);
        const cuadra = Math.abs(diff) <= 1;
        return (
          <div className="mb-3">
            <span className={`text-[11px] px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 ${cuadra ? "bg-gray-50 text-gray-500 border-gray-200" : diff > 0 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
              <b>Real vs teórico</b> ({fmt(binsVac)} bins pesados): {fmt(vac)} kg reales vs {fmt(teorico)} teóricos →{" "}
              {cuadra ? "cuadra ✓" : diff > 0 ? `viene de MÁS +${fmt(diff)} kg` : `viene de MENOS ${fmt(diff)} kg`}
            </span>
          </div>
        );
      })()}

      {term ? (
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 flex-wrap gap-2">
          <span className="text-sm text-gray-600 inline-flex items-center gap-1.5"><Check size={15} className="text-gray-500" /> Folio <b>terminado</b> por {m.vaciado?.terminado?.por || "—"}{kgSobranteCierre(m) > 1 ? ` · sobraron ${fmt(kgSobranteCierre(m))} kg` : ""}</span>
          <button onClick={onReabrir} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 inline-flex items-center gap-1"><RotateCcw size={13} /> Reabrir</button>
        </div>
      ) : (
        <>
          {/* Acciones: abrir hora + terminar */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <button onClick={onAbrirHora} disabled={hayAbierta} title={hayAbierta ? "Cierra la hora abierta antes de abrir otra" : ""} className="text-xs px-3 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1"><Plus size={14} /> Abrir hora</button>
            {hayAbierta && <span className="text-[11px] text-gray-400">Registra los bins en la hora abierta; ciérrala para abrir otra.</span>}
            <div className="flex-1" />
            <button onClick={onTerminar} className="text-xs px-3 py-2 border border-amber-300 text-amber-700 rounded-lg font-semibold hover:bg-amber-50 inline-flex items-center gap-1"><Check size={14} /> Terminar folio</button>
          </div>

          {/* Horas */}
          {horas.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-2">Aún no hay horas. Da clic en <b className="text-gray-500">Abrir hora</b> para empezar a registrar el vaciado.</div>
          ) : (
            <div className="space-y-2">
              {horas.map((h) => (
                <HoraCampo key={h.id} h={h} taraBin={taraBin} fmt={fmt} reloj={reloj} sap={sap}
                  registros={evsDe(h.id)} kgHora={kgDe(h.id)}
                  onRegistrar={(bruto, bins) => onRegistrar(h.id, bruto, bins)}
                  onDelEvento={onDelEvento}
                  onCerrar={() => onCerrarHora(h.id)}
                  onReabrirHora={() => onReabrirHora(h.id)}
                  onCancelar={() => onCancelarHora(h.id)}
                />
              ))}
            </div>
          )}

          {/* Registros viejos sin hora (datos previos) */}
          {sueltos.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-lg p-2 bg-white">
              <div className="text-[11px] text-gray-500 mb-1">Vaciado sin hora (registros previos)</div>
              <div className="space-y-1">
                {sueltos.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1 gap-2">
                    <span className="text-gray-600"><b className="text-gray-800">{fmt(e.bins)} bins</b> · {fmt(e.kg)} kg <span className="text-gray-400">· {hm12(e.hora)}</span></span>
                    <button onClick={() => onDelEvento(e.id)} title="Quitar" className="text-red-400 hover:text-red-600 shrink-0"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Merma */}
          <div className="mt-2">
            {!mermaOpen ? (
              <button onClick={() => setMermaOpen(true)} className="text-[11px] text-red-600 hover:text-red-700 inline-flex items-center gap-1"><Plus size={12} /> Registrar merma (no entró a empaque)</button>
            ) : (
              <div className="flex items-end gap-2 flex-wrap bg-red-50/60 border border-red-200 rounded-lg p-2">
                <div className="w-24"><label className="text-[10px] text-gray-500 block mb-0.5">Merma (kg)</label><input type="number" min="0" value={mermaKg} onChange={(e) => setMermaKg(e.target.value)} className="w-full text-sm px-2 py-1 border border-gray-200 rounded" /></div>
                <div className="flex-1 min-w-[140px]"><label className="text-[10px] text-gray-500 block mb-0.5">Motivo</label><input value={mermaMot} onChange={(e) => setMermaMot(e.target.value)} placeholder="(opcional)" className="w-full text-sm px-2 py-1 border border-gray-200 rounded" /></div>
                <button onClick={doMerma} disabled={!(parseFloat(mermaKg) > 0)} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-40">Registrar</button>
                <button onClick={() => { setMermaOpen(false); setMermaKg(""); setMermaMot(""); }} className="text-xs px-2 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
              </div>
            )}
            {mrs.length > 0 && (
              <div className="mt-1 space-y-1">
                {mrs.map((x) => (
                  <div key={x.id} className="flex items-center justify-between text-xs bg-white border border-red-100 rounded px-2 py-1 gap-2">
                    <span className="text-red-600"><b>{fmt(x.kg)} kg</b> merma{x.motivo ? ` · ${x.motivo}` : ""} <span className="text-gray-400">· {hm12(x.hora)}</span></span>
                    <button onClick={() => onDelMerma(x.id)} className="text-red-400 hover:text-red-600 shrink-0"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Una HORA del vaciado: se pesan bins mientras está abierta (bruto de báscula − bins×tara = neto
// real); al cerrarla queda lista para SAP.
function HoraCampo({ h, taraBin, fmt, reloj, sap, registros, kgHora, onRegistrar, onDelEvento, onCerrar, onReabrirHora, onCancelar }) {
  const [bruto, setBruto] = useState("");
  const [bins, setBins] = useState("");
  const brutoN = parseFloat(bruto) || 0;
  const binsN = parseFloat(bins) || 0;
  const taraTotal = binsN * taraBin;
  const netoPrev = Math.max(0, brutoN - taraTotal);
  const cub = cubetasDe(kgHora);   // neto ÷ 6 → lo que se manda a SAP de esta hora
  const abierta = h.estado === "abierta";
  const enviada = h.estado === "enviada";
  const pendiente = !!h.sapPendiente;
  const aprobada = !!h.aprobacion;
  const enviando = sap?.enviandoClave === h.id;
  const verificando = sap?.verificandoClave === h.sapPendiente?.clave;
  const verifMsg = sap?.verifMsg?.horaId === h.id ? sap.verifMsg : null;
  const errMsg = sap?.error?.horaId === h.id ? sap.error.msg : null;
  // Al registrar se limpia SOLO el bruto; el Nº bins se queda pegado (pesan de 1 en 1 o de 2 en 2
  // sin re-teclearlo cada vez).
  const doReg = () => { if (brutoN <= 0) return; onRegistrar(brutoN, binsN); setBruto(""); };

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/70 gap-2 flex-wrap">
        <span className="inline-flex items-center gap-2">
          <b className="text-sm text-gray-800">{h.etiqueta}</b>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${enviada ? "bg-green-50 text-green-700 border-green-200" : abierta ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{enviada ? "Enviada" : abierta ? "Abierta" : "Cerrada"}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-gray-600"><b className="text-gray-800">{fmt(kgHora)} kg</b> · {cub} cub</span>
          {!h.sapEnvio && !h.sapPendiente && (
            <button onClick={onCancelar} title="Cancelar esta hora (borrarla) — por si se abrió por error" className="text-gray-300 hover:text-red-600 shrink-0"><X size={15} /></button>
          )}
        </span>
      </div>
      <div className="p-2.5">
        {/* Registros de la hora */}
        {registros.length > 0 && (
          <div className="space-y-1 mb-2">
            {registros.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1 gap-2">
                <span className="text-gray-600 min-w-0">
                  <b className="text-gray-800">{fmt(e.bins)} bins</b> · bruto {fmt(e.bruto)} − peso bins {fmt((parseFloat(e.bins) || 0) * (parseFloat(e.tara) || taraBin))} = <b className="text-green-700">{fmt(e.kg)} kg</b> <span className="text-gray-400">· {hm12(e.hora)}</span>
                </span>
                {abierta && <button onClick={() => onDelEvento(e.id)} title="Quitar" className="text-red-400 hover:text-red-600 shrink-0"><X size={13} /></button>}
              </div>
            ))}
          </div>
        )}
        {/* Pesar bins en la hora abierta (bruto de báscula − bins×tara) */}
        {abierta && (
          <div className="flex items-end gap-2 flex-wrap bg-emerald-50/50 rounded-lg p-2">
            <div className="w-28">
              <label className="text-[10px] text-gray-500 block mb-0.5">Bruto báscula (kg)</label>
              <input type="number" min="0" step="0.1" value={bruto} onChange={(e) => setBruto(e.target.value)} placeholder="kg" className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded-lg" />
            </div>
            <div className="w-20">
              <label className="text-[10px] text-gray-500 block mb-0.5">Nº bins</label>
              <input type="number" min="0" step="1" value={bins} onChange={(e) => setBins(e.target.value)} placeholder="0" className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5 inline-flex items-center gap-1"><Clock size={11} /> Hora (automática)</label>
              <div className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 font-semibold tabular-nums inline-flex items-center gap-1.5" title="Se registra con la hora real del momento">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> {hm12(reloj)}
              </div>
            </div>
            <div className="text-xs text-gray-600 pb-2">− peso bins {fmt(taraTotal)} = <b className="text-green-700">{fmt(netoPrev)} kg</b> <span className="text-gray-400">({binsN || 0} × {fmt(taraBin)})</span></div>
            <button onClick={doReg} disabled={brutoN <= 0} className="text-xs px-3 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1"><Plus size={14} /> Registrar</button>
          </div>
        )}
        {/* Error de envío a SAP de esta hora */}
        {errMsg && <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{errMsg}</div>}

        {/* Aviso ⏳ pendiente de confirmar (G4) + verificar en SAP */}
        {pendiente && (
          <div className="mt-2 text-xs bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 space-y-2">
            <div className="text-amber-800"><b>⏳ Pendiente de confirmar.</b> El envío de <b>{h.sapPendiente.cubetas} cubetas</b> se interrumpió y no sabemos si quedó en SAP. <b>No lo vuelvas a mandar</b> sin verificar: podría quedar doble.</div>
            <button onClick={() => sap.onVerificar(h)} disabled={verificando} className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1"><Search size={14} /> {verificando ? "Consultando SAP…" : "Verificar en SAP"}</button>
            {verifMsg && <div className={`text-[11px] rounded-lg px-2 py-1.5 ${verifMsg.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-white text-gray-700 border border-gray-200"}`}>{verifMsg.texto}</div>}
          </div>
        )}

        {/* Acciones de la hora */}
        <div className="flex items-center gap-2 flex-wrap justify-end mt-2">
          {abierta && <button onClick={onCerrar} disabled={registros.length === 0} className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg font-medium hover:bg-amber-50 disabled:opacity-40 inline-flex items-center gap-1"><Check size={14} /> Cerrar hora</button>}
          {h.estado === "cerrada" && !pendiente && (
            <>
              {aprobada && <span className="text-[11px] text-green-700 inline-flex items-center gap-1 mr-auto"><Check size={13} /> Aprobado por {h.aprobacion.por}</span>}
              <button onClick={onReabrirHora} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 inline-flex items-center gap-1"><RotateCcw size={14} /> Reabrir (corregir)</button>
              {sap?.esHist ? (
                <span title={`Folio anterior al corte (${sap.goLiveSAP}): ya se registró fuera de la app`} className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-500 bg-gray-50 rounded-lg font-semibold inline-flex items-center gap-1"><Ban size={13} /> Histórico — no se manda a SAP</span>
              ) : !aprobada ? (
                sap?.puedeAprobar ? (
                  <button onClick={() => sap.onAprobar(h)} disabled={!(cub > 0)} className="text-xs px-3 py-1.5 border border-green-400 text-green-700 rounded-lg font-semibold hover:bg-green-50 disabled:opacity-40 inline-flex items-center gap-1"><Check size={14} /> Aprobar cálculo</button>
                ) : (
                  <span title="Solo la encargada (gerente o admin) puede aprobar y habilitar el envío a SAP" className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg font-semibold cursor-not-allowed inline-flex items-center gap-1"><Ban size={13} /> Solo la encargada aprueba</span>
                )
              ) : sap?.puedeEnviarSap ? (
                <button onClick={() => sap.onEnviar(h)} disabled={!(cub > 0) || enviando} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1"><Send size={14} /> {enviando ? "Enviando…" : `Mandar a SAP (${cub} cub)`}</button>
              ) : (
                <span title="No tienes permiso para mandar a SAP (empaque.vaciado.enviar_sap)" className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg font-semibold cursor-not-allowed inline-flex items-center gap-1"><Ban size={13} /> Sin permiso para enviar</span>
              )}
            </>
          )}
          {enviada && h.sapEnvio && (
            <span className="text-[11px] text-green-700 inline-flex items-center gap-1"><Check size={13} /> Enviado a SAP{h.sapEnvio.docNum ? ` · #${h.sapEnvio.docNum}` : ""}{h.sapEnvio.verificado ? " (verificado)" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Flujo({ lab, val, sub, color, big }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg px-3 py-1.5 ${big ? "min-w-[110px]" : ""}`}>
      <div className="text-[10px] text-gray-400">{lab}</div>
      <div className={`font-bold ${big ? "text-lg" : "text-sm"} ${color}`}>{val}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}
function Flecha() { return <div className="flex items-center text-gray-300 font-bold">→</div>; }
