import { Fragment, useState } from "react";
import * as XLSX from "xlsx";
import { Calendar, Plus, Trash2, Truck, Eye, Check, AlertTriangle, X, Send, Ban, FileText, Save, MessageCircle, RotateCcw, Clock, FlaskConical, Camera, Search, ArrowRight, Sprout } from "lucide-react";
import { useDatos, nuevoId, KG_POR_BIN_DEFAULT, DEFECTOS_QC, CATS_QC, MAX_MUESTREOS, INSP_VEHICULO, INSP_PRODUCTO } from "../store/datos";
import { reciboProduccionSAP, verificarReciboSAP, getOrdenFabricacionSAP } from "../store/api";
import { useAuth } from "../store/auth";
import {
  CAJAS_POR_PARRILLA, destareDe, kgRecibidosDe, recibidoProvisional, faltaPesoTrailer, netoPesada, netoHora, kgHorasDe, cubetasDe,
  taraPesada, kgVaciadosDe, kgAjustesDe, usaHoras, usoTotalSAP, tieneEnvioSAP, tienePendienteSAP, usaParcial, kgMermadosDe,
  kgEnPisoDe, cubetasEnviadasSAP, kgEnviadosSAP, kgPendienteSAP, esHistoricoSAP, estaTerminado, kgSobranteCierre,
} from "./helpers/empaque";
import SearchSelect from "../components/SearchSelect";
import { generarPDFVaciadoHora, generarExcelVaciadoHora } from "./reportes/vaciadoPorHora";
import InfoTip from "../components/InfoTip";
import { pctDefecto, pctCategoria, calcQCI } from "./helpers/calidad";
import { generarReporteCalidad, generarReporteInspeccion } from "./reportes/reporteCalidad";
import ColaTabs from "../components/ColaTabs";
import AvisoSAP from "../components/AvisoSAP";
import { useDialog } from "../components/Dialog";

// Muestreo vacío. Arrastra lote y fecha del movimiento de campo, y un folio
// consecutivo autogenerado.
const muestreoVacio = (m, folio) => ({
  inspector: "", folio: folio != null ? String(folio) : "", lote: m?.lote || "", pesoMuestra: "", fecha: m?.fecha || hoyISO(),
  defectos: Object.fromEntries(DEFECTOS_QC.map((d) => [d.id, ""])),
  fotos: {}, // 1 foto por defecto: { [defId]: dataURL }
});

import { hoyISO } from "../utils/fecha";
// Hora actual "HH:MM" (24h) para los inputs type=time.
function ahoraHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Suma de un campo numérico en los renglones de carga
const sumar = (items, campo) => (items || []).reduce((a, it) => a + (parseFloat(it[campo]) || 0), 0);

// ── Vaciado a Empaque ── Se maneja TODO en kg (la unidad que manda).
// El factor de bins (kg netos por bin) ahora es CONFIGURABLE (configEmpaque.kgPorBin, default 260).
// Ver `kgPorBin`/`binsDe` dentro del componente.
// Destare de empaque (ejote): la caja y la parrilla pesan; se restan del bruto para
// obtener el ejote neto. Defaults editables por recepción.
const TARA_PARRILLA = 14.8; // kg por parrilla
const TARA_CAJA = 0.85;     // kg por caja
const fmt = (n) => Math.round(n || 0).toLocaleString();

// Helpers PUROS de vaciado (destareDe, kgRecibidosDe, netoPesada/Hora, kgHorasDe, cubetasDe,
// kgVaciadosDe, usaHoras, usoTotalSAP, tieneEnvioSAP, usaParcial, kgMermadosDe, kgEnPisoDe) y
// CAJAS_POR_PARRILLA → viven en ./helpers/empaque (reusables en Dashboard/reportes). Se importan arriba.

// ── Inspección de vehículo y producto (REG-EMP-24) ──
// Texto de los productos del flete para prellenar el campo "Producto".
const productosDeMov = (m) =>
  (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(", ") || m.rancho || "";

// Inspección vacía, prellenada con los datos del flete que ya conocemos.
const inspeccionVacia = (m) => ({
  producto: productosDeMov(m),
  fecha: m.fecha || hoyISO(),
  hora: "",
  remision: m.remision || "",
  tempProducto: "",
  veh: Object.fromEntries(INSP_VEHICULO.map((c) => [c.id, ""])),
  prod: Object.fromEntries(INSP_PRODUCTO.map((c) => [c.id, ""])),
  observaciones: "",
  accionesCorrectivas: "",
  elaboro: "",
  supervisor: "",
});

// ¿Hay al menos un chequeo con resultado indeseable? (para badge en la tabla)
const inspeccionConHallazgo = (insp) =>
  !!insp &&
  (INSP_VEHICULO.some((c) => insp.veh?.[c.id] === c.malo) ||
    INSP_PRODUCTO.some((c) => insp.prod?.[c.id] === c.malo));

export default function Modulo9() {
  const { movimientos, setMovimientos, inspectoresCalidad, setInspectoresCalidad, rezagas, setRezagas, proyectos, contenedores, setContenedores, configEmpaque, setConfigEmpaque, registrarEvento } = useDatos();
  const CONTS = Array.isArray(contenedores) && contenedores.length ? contenedores : [{ id: "bin", label: "Bin", tara: 36 }];
  const dlg = useDialog();
  // LÍNEA DE CORTE SAP: folios anteriores a esta fecha son HISTÓRICO → la app no los manda a SAP.
  const goLiveSAP = configEmpaque?.goLiveSAP || "";
  // Reporte por BINS (el que ven los jefes): cada `kgPorBin` kg NETOS = 1 bin. Configurable.
  const kgPorBin = parseFloat(configEmpaque?.kgPorBin) || KG_POR_BIN_DEFAULT;
  const binsDe = (kg) => (kg || 0) / kgPorBin;   // bins (con decimales); se redondea al mostrar
  // Cuánto se le tolera a un folio CERRADO haber salido de menos antes de marcarlo para revisar.
  // Default 0 = se marca cualquier faltante (el usuario quiere que cuadre exacto para detectar
  // cargas que llegan de menos); se puede subir si la báscula da diferencias chicas.
  const toleranciaKg = parseFloat(configEmpaque?.toleranciaKg) || 0;
  const esHist = (m) => esHistoricoSAP(m, goLiveSAP);

  const [recibir, setRecibir] = useState(null); // movimiento que se está recibiendo
  const [form, setForm] = useState(null);
  const [tabRec, setTabRec] = useState("pendientes"); // pendientes | vaciado | historial
  // Completar el DESTARE desde la tarjeta de En Piso (parrillas/cajas → ejote neto exacto).
  const [destareMov, setDestareMov] = useState(null);
  const [destareForm, setDestareForm] = useState({ parrillas: "", cajas: "", pP: String(TARA_PARRILLA), pC: String(TARA_CAJA) });
  const [mermarMov, setMermarMov] = useState(null); // movimiento al que se le registra una merma (no entró a empaque)
  const [mermarKg, setMermarKg] = useState("");
  const [mermarFecha, setMermarFecha] = useState("");
  const [mermarHora, setMermarHora] = useState("");
  const [mermarMotivo, setMermarMotivo] = useState("");
  const [mermarComentario, setMermarComentario] = useState("");
  const [mermarError, setMermarError] = useState("");
  const [rezagaForm, setRezagaForm] = useState(null); // alta de rezaga suelta (Historial Mermado); null = cerrado
  const [diaReporte, setDiaReporte] = useState(hoyISO()); // día que se ve en el resumen / por hora
  const [loteAbierto, setLoteAbierto] = useState(null);   // lote con el detalle de "revisar" desplegado
  const [avisosAbierto, setAvisosAbierto] = useState(false); // panel "Historial de avisos"
  const [avFiltro, setAvFiltro] = useState("todos");         // todos | pendiente | revisado
  const [avTipo, setAvTipo] = useState("todos");             // todos | sobra | falta
  const [q, setQ] = useState("");
  const [fDestino, setFDestino] = useState(""); // filtro dropdown por Destino (aplica a la pestaña activa)
  const [fTipo, setFTipo] = useState(""); // historial: "" | recibido | rechazado
  const [rechazoMov, setRechazoMov] = useState(null); // flete a rechazar
  const [rechazoComent, setRechazoComent] = useState("");

  // ── Envío a SAP (Recibo de producción) ──
  const [sapMov, setSapMov] = useState(null);       // movimiento que se manda a SAP
  const [sapKgCubeta, setSapKgCubeta] = useState(6); // factor kg→cubeta (editable)
  const [sapCargando, setSapCargando] = useState(false);
  const [sapError, setSapError] = useState("");
  // Resuelve la orden de fabricación (SAP) del movimiento desde el catálogo de Temporadas.
  const ordenSAPde = (m) => {
    const proj = (proyectos || []).find((p) => p.code === m.proyecto);
    const r = proj?.ranchos?.find((x) => x.nombre === m.rancho);
    const o0 = r?.sap?.ordenes?.[0];
    if (o0 == null) return null;
    // Compat: `ordenes` puede ser [number] (formato viejo) o [{absoluteEntry, docNum}].
    const absoluteEntry = (typeof o0 === "object") ? o0.absoluteEntry : o0;
    const docNum = (typeof o0 === "object") ? o0.docNum : null;
    if (absoluteEntry == null) return null;
    return { absoluteEntry, docNum, totalOrdenes: (r.sap.ordenes || []).length, item: r.sap.item, plannedQty: r.sap.plannedQty, completedQty: r.sap.completedQty, temporada: proj.nombre, rancho: r.nombre };
  };
  const abrirEnvioSAP = (m) => { setSapError(""); setSapKgCubeta(6); setSapMov(m); cargarOrdenSAP(ordenSAPde(m)?.absoluteEntry); };
  const confirmarEnvioSAP = async () => {
    const m = movimientos.find((x) => x.id === sapMov.id) || sapMov;   // datos VIVOS (G3), no snapshot
    // G3: revalida el candado justo antes del POST (por si otro dispositivo abrió horas/faltante).
    if (esHist(m)) { setSapError(`Este folio es HISTÓRICO (anterior al corte ${goLiveSAP}): ya se registró fuera de la app, no se manda a SAP desde aquí.`); return; }
    if (usaParcial(m)) { setSapError("Este folio se está enviando por hora/faltante; no se puede mandar el TOTAL (evita doble conteo)."); return; }
    if (tieneEnvioSAP(m) && !m.recepcion?.sapEnvio) { setSapError("Este folio ya tiene envíos parciales a SAP; no se puede mandar el total."); return; }
    const ord = ordenSAPde(m);
    const neto = kgRecibidosDe(m);
    const kgc = parseFloat(sapKgCubeta) || 6;
    const cubetas = Math.round(neto / kgc);
    if (!ord) { setSapError("Este movimiento no tiene orden de fabricación en SAP."); return; }
    if (!(cubetas > 0)) { setSapError("La cantidad calculada es 0."); return; }
    // ÚLTIMO AVISO. Este es el envío MÁS grande (el folio completo de una vez) → se pregunta siempre.
    const seguro = await dlg.confirm({
      title: "¿Mandar el folio COMPLETO a SAP?",
      message: `Se van a mandar ${cubetas.toLocaleString()} cubetas (${fmt(neto)} kg ÷ ${kgc}) a la ${refOrdenSAP(ord)}, del folio ${m.remision || m.folio || ""} (lote ${loteDe(m)}).\n\nEs el TOTAL del folio de una sola vez. Esto SUMA a la "Cantidad completada" en SAP y desde aquí NO se puede deshacer.`,
      confirmText: `Sí, mandar ${cubetas.toLocaleString()} cubetas`,
      danger: true,
    });
    if (!seguro) return;
    setSapCargando(true); setSapError("");
    try {
      // movimientoId → idempotencia server-side: si esto se reintenta, SAP no recibe doble recibo.
      const res = await reciboProduccionSAP({ absoluteEntry: ord.absoluteEntry, cantidad: cubetas, movimientoId: m.id });
      setMovimientos((prev) => prev.map((x) => x.id === m.id
        ? { ...x, recepcion: { ...x.recepcion, sapEnvio: { docEntry: res.docEntry, docNum: res.docNum, cubetas, kgPorCubeta: kgc, netoKg: neto, absoluteEntry: ord.absoluteEntry, ts: new Date().toISOString() } } }
        : x));
      registrarEvento?.({ evento: "recibo_produccion_sap", modulo: "M9", actor: "Empaque", destino: m.folio, ref: m.id,
        detalle: `${cubetas} cubetas (${Math.round(neto)} kg ÷ ${kgc}) → orden #${ord.docNum ?? ord.absoluteEntry} · SAP #${res.docNum}`,
        meta: { cubetas, netoKg: neto, absoluteEntry: ord.absoluteEntry, docNum: res.docNum } });
      setSapMov(null);
    } catch (e) {
      // G4: sin respuesta → NO decimos "falló" ni dejamos reenviar; queda ⏳ para verificar.
      if (e?.sinRespuesta) {
        marcarPendiente(m, { tipo: "total" }, { clave: m.id, absoluteEntry: ord.absoluteEntry, cubetas, kgPorCubeta: kgc, netoKg: neto });
        setSapError("");
      } else setSapError(String(e?.message || e));
    } finally {
      setSapCargando(false);
    }
  };

  // ── FICHA DE LA ORDEN DE FABRICACIÓN (leída EN VIVO de SAP, solo GET) ──
  // En Empaque no pueden meterse a SAP a investigar, así que antes de mandar se les enseña
  // CONTRA QUÉ ORDEN van a sumar, con los datos REALES de SAP (no los capturados aquí): Nº
  // visible, artículo, lote y departamento. Si el lote de la orden no coincide con el del
  // folio, se avisa en rojo ANTES de mandar.
  const [ordSap, setOrdSap] = useState(null);          // ficha traída de SAP
  const [ordSapCargando, setOrdSapCargando] = useState(false);
  const [ordSapError, setOrdSapError] = useState("");
  // Línea de "¿a qué orden de fabricación va a caer este folio?" para pintarla EN LA TARJETA.
  // Sale del catálogo de Temporadas (que se trae de SAP), cruzando proyecto + rancho del folio: es
  // el MISMO dato con el que se arma el envío, así que lo que se ve aquí es lo que se va a mandar.
  // Se pinta siempre, no solo al mandar, para que nadie tenga que abrir el modal para saberlo.
  const lineaOrdenSAP = (m) => {
    const o = ordenSAPde(m);
    // TABLA (en SAP: "Departamento") que eligieron al crear el movimiento. Es informativa aquí:
    // NO cambia la orden de fabricación (esa sale de temporada + rancho); va en la OC del flete.
    const chipTabla = m.departamento ? (
      <span title="Tabla del rancho de la que salió el flete (en SAP va como Departamento en la orden de compra)"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">
        <Sprout size={11} /> tabla {m.departamento}
      </span>
    ) : null;
    if (!o) {
      return (
        <span className="inline-flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
            <AlertTriangle size={11} /> Sin orden de fabricación en SAP (rancho «{m.rancho || "—"}» no está en el catálogo)
          </span>
          {chipTabla}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap text-[11px]">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold">
          <Send size={11} /> Orden SAP #{o.docNum ?? o.absoluteEntry}
        </span>
        {chipTabla}
        <span className="text-gray-500">{o.temporada || "—"} · {o.rancho || "—"}{o.item ? ` · ${o.item}` : ""}</span>
        {o.plannedQty ? <span className="text-gray-400">· lleva {fmt(o.completedQty)} de {fmt(o.plannedQty)} cub</span> : null}
        {o.totalOrdenes > 1 && (
          <span title="Este rancho tiene varias órdenes liberadas en SAP; se usará la que se muestra" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
            <AlertTriangle size={11} /> {o.totalOrdenes} órdenes en este rancho
          </span>
        )}
      </span>
    );
  };

  // Cómo se nombra la orden en el aviso final: si ya se leyó de SAP, con su lote y artículo
  // REALES (así se confirma que es la orden correcta sin tener que entrar a SAP).
  const refOrdenSAP = (ord) => (ordSap
    ? `orden #${ordSap.docNum ?? ordSap.absoluteEntry} (lote ${ordSap.lote || "?"} · ${ordSap.item || "?"})`
    : `orden de fabricación #${ord?.docNum ?? ord?.absoluteEntry}`);
  const cargarOrdenSAP = (absoluteEntry) => {
    setOrdSap(null); setOrdSapError("");
    if (!absoluteEntry) return;
    setOrdSapCargando(true);
    getOrdenFabricacionSAP(absoluteEntry)
      .then((r) => setOrdSap(r))
      .catch((e) => setOrdSapError(String(e?.message || e)))
      .finally(() => setOrdSapCargando(false));
  };

  // Panel de verificación que se pinta en los 3 modales de envío.
  const fichaOrdenSAP = (m) => {
    const loteFolio = (loteDe(m) || "").trim().toUpperCase();
    const loteSap = (ordSap?.lote || "").trim().toUpperCase();
    const difiere = !!(ordSap && loteSap && loteFolio && loteSap !== loteFolio);
    const fila = (l, v) => (
      <div className="flex items-start justify-between gap-3 px-2.5 py-1">
        <span className="text-gray-500 shrink-0">{l}</span>
        <span className="text-gray-800 font-semibold text-right break-words">{v ?? "—"}</span>
      </div>
    );
    return (
      <div className="text-[11px] border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-2.5 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
          <span className="font-semibold text-gray-700 inline-flex items-center gap-1"><Search size={12} /> Orden de fabricación (leída de SAP)</span>
          {ordSapCargando && <span className="text-gray-400">consultando…</span>}
        </div>
        {ordSapError ? (
          <div className="px-2.5 py-2 text-amber-700 bg-amber-50">
            No se pudo leer la orden en SAP para verificar ({ordSapError}). Revisa el número antes de mandar.
          </div>
        ) : ordSap ? (
          <div className="divide-y divide-gray-100">
            {fila("Nº de orden en SAP", <span className="text-indigo-700">#{ordSap.docNum ?? ordSap.absoluteEntry}</span>)}
            {fila("Artículo", <>{ordSap.item}{ordSap.descripcion ? ` · ${ordSap.descripcion}` : ""}</>)}
            {fila("Lote (rancho) en SAP", <span className={difiere ? "text-red-700" : "text-gray-800"}>{ordSap.lote || "—"}</span>)}
            {ordSap.departamento ? fila("Departamento en SAP", ordSap.departamento) : null}
            {ordSap.proyecto ? fila("Proyecto en SAP", ordSap.proyecto) : null}
            {fila("Avance de la orden", <>{fmt(ordSap.completado)} / {fmt(ordSap.planeado)} · faltan <b className="text-amber-700">{fmt(ordSap.restante)}</b></>)}
            {difiere && (
              <div className="px-2.5 py-2 bg-red-50 text-red-700">
                ⚠️ <b>El lote NO coincide.</b> La orden #{ordSap.docNum ?? ordSap.absoluteEntry} es del lote <b>{ordSap.lote}</b>, pero este folio es del lote <b>{loteDe(m)}</b>. Verifícalo antes de mandar.
              </div>
            )}
          </div>
        ) : (
          <div className="px-2.5 py-2 text-gray-400">Consultando la orden en SAP…</div>
        )}
      </div>
    );
  };

  // ── G4 · Envío "PENDIENTE DE CONFIRMAR" (se quedó enviando) ──────────────────────────────
  // Si el envío no devuelve respuesta (se cayó el internet / SAP tardó demasiado), NO sabemos si
  // el recibo se creó allá. Reintentar a ciegas duplicaría la Cantidad completada, así que el
  // envío queda marcado ⏳ y solo se ofrece "Verificar en SAP" (un GET que pregunta si ya existe).
  const [verificando, setVerificando] = useState("");   // clave que se está verificando
  const [verifMsg, setVerifMsg] = useState(null);       // { ok:bool, texto }

  // Parcha el lugar donde vive el envío: total → recepcion; por hora → esa hora; faltante → ese ajuste.
  const parcharDestino = (movId, destino, patch) => setMovimientos((prev) => prev.map((x) => {
    if (x.id !== movId) return x;
    if (destino.tipo === "total") return { ...x, recepcion: { ...x.recepcion, ...patch } };
    const vac = baseVac(x);
    const key = destino.tipo === "hora" ? "horas" : "ajustes";
    return { ...x, vaciado: { ...vac, [key]: (vac[key] || []).map((o) => (o.id === destino.id ? { ...o, ...patch } : o)) } };
  }));

  // Marca el envío como incierto (⏳). Guarda lo necesario para poder verificarlo después.
  const marcarPendiente = (m, destino, datos) => parcharDestino(m.id, destino, {
    sapPendiente: { ...datos, ts: new Date().toISOString() },
  });

  // Pregunta a SAP (SOLO GET) si el recibo ya existe. No reintenta ni escribe nada en SAP.
  const verificarPendiente = async (m, destino, pend) => {
    setVerifMsg(null); setVerificando(pend.clave);
    try {
      const r = await verificarReciboSAP({ clave: pend.clave, absoluteEntry: pend.absoluteEntry, cantidad: pend.cubetas });
      if (r.estado === "encontrado" || r.estado === "enviado") {
        const envio = { docEntry: r.docEntry, docNum: r.docNum, cubetas: pend.cubetas, kgPorCubeta: pend.kgPorCubeta,
          netoKg: pend.netoKg, absoluteEntry: pend.absoluteEntry, ts: new Date().toISOString(), verificado: true };
        parcharDestino(m.id, destino, destino.tipo === "hora"
          ? { estado: "enviada", sapEnvio: envio, sapPendiente: undefined }
          : { sapEnvio: envio, sapPendiente: undefined });
        setVerifMsg({ ok: true, texto: `Sí se creó en SAP (#${r.docNum}). Ya quedó registrado aquí; NO hay que volver a mandarlo.` });
        registrarEvento?.({ evento: "recibo_sap_verificado", modulo: "M9", actor: "Empaque", destino: m.folio, ref: m.id,
          detalle: `Verificado en SAP: el recibo de ${pend.cubetas} cub SÍ existe (SAP #${r.docNum}); no se reenvía.`,
          meta: { clave: pend.clave, docNum: r.docNum, cubetas: pend.cubetas } });
      } else if (r.estado === "no_encontrado") {
        parcharDestino(m.id, destino, { sapPendiente: undefined });   // libera el botón de enviar
        setVerifMsg({ ok: false, texto: "SAP NO tiene ese recibo: el envío no se completó. Ya puedes volver a mandarlo." });
      } else {
        setVerifMsg({ ok: false, texto: r.mensaje || "Hay varios recibos parecidos en SAP; revísalo allá antes de decidir." });
      }
    } catch (e) {
      setVerifMsg({ ok: false, texto: String(e?.message || e) });
    } finally { setVerificando(""); }
  };

  // Aviso ⏳ con el botón "Verificar en SAP" (se pinta en los 3 lugares de envío).
  const avisoPendiente = (m, destino, pend) => (
    <div className="text-xs bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 space-y-2">
      <div className="text-amber-800">
        <b>⏳ Pendiente de confirmar.</b> El envío de <b>{pend.cubetas} cubetas</b> se interrumpió y no
        sabemos si alcanzó a registrarse en SAP. <b>No lo vuelvas a mandar</b> sin verificar: podría
        quedar doble. Pregúntale a SAP si ya existe 👇
      </div>
      <button onClick={() => verificarPendiente(m, destino, pend)} disabled={verificando === pend.clave}
        className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1">
        <Search size={14} /> {verificando === pend.clave ? "Consultando SAP…" : "Verificar en SAP"}
      </button>
      {verifMsg && (
        <div className={`text-[11px] rounded-lg px-2 py-1.5 ${verifMsg.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-white text-gray-700 border border-gray-200"}`}>
          {verifMsg.texto}
        </div>
      )}
    </div>
  );

  // ── Vaciado POR HORA (envío a SAP por hora, anidado al folio) ──
  const [horasMov, setHorasMov] = useState(null);       // folio cuyo panel de horas está abierto
  const [pesForm, setPesForm] = useState({ bruto: "", tipo: CONTS[0].id, tara: CONTS[0].tara, num: "1", soporte: "", tara2: "", num2: "0" });  // form de pesada
  const [horaSap, setHoraSap] = useState(null);         // { m, hora } que se manda a SAP
  const [horaKgCub, setHoraKgCub] = useState(6);
  const [horaEnviando, setHoraEnviando] = useState(false);
  const [horaSapError, setHoraSapError] = useState("");
  const [editCont, setEditCont] = useState(false);     // editor del catálogo de contenedores
  // CANDADO POR PERMISO (RBAC) — apartado delicado (envío a SAP):
  //  - APROBAR el cálculo → solo quien tenga `empaque.vaciado.aprobar` (la encargada). La
  //    capturista mete kilos y cierra la hora, pero NO puede aprobarse sola.
  //  - MANDAR a SAP → `empaque.vaciado.enviar_sap` (la capturista puede, pero solo tras aprobar).
  //  - CAPTURAR el vaciado → `empaque.vaciado.editar`.
  // La aprobación se guarda en BD con el nombre del usuario que aprobó. Ver [[sap-reglas-garantia]].
  const { usuario: usuarioActual, can } = useAuth();
  const puedeAprobar = can("empaque.vaciado.aprobar");
  const puedeEnviarSap = can("empaque.vaciado.enviar_sap");
  const puedeEditarVaciado = can("empaque.vaciado.editar");

  // Aprobación del cálculo (2ª persona): la encargada revisa y confirma que el cálculo es
  // correcto ANTES de habilitar el envío a SAP. Se registra quién aprobó y cuándo.
  const aprobarHora = async (m, hora) => {
    if (!puedeAprobar) {   // defensa: el botón ya sale deshabilitado para la capturista
      await dlg.alerta({ title: "No puedes aprobar", message: "Solo la encargada (gerente o admin) puede aprobar el cálculo y habilitar el envío a SAP. Pídele que revise y apruebe desde su cuenta." });
      return;
    }
    const ord = ordenSAPde(m);
    const neto = netoHora(hora);
    const cub = cubetasDe(neto);
    const ok = await dlg.confirm({
      title: "Aprobar el cálculo antes de SAP",
      message: `¿Segura que el cálculo es correcto? Se enviarán ${cub} cubetas (${Math.round(neto)} kg ÷ 6) a la orden #${(ord?.docNum ?? ord?.absoluteEntry) ?? "—"}. Quedará registrado a TU nombre como responsable de esta hora. Al aprobar se habilita el botón de mandar a SAP.`,
      confirmText: "Sí, es correcto — aprobar",
    });
    if (!ok) return;
    const por = usuarioActual?.full_name || usuarioActual?.email || "encargado";
    const aprobacion = { por, porId: usuarioActual?.id ?? null, tipo: usuarioActual?.tipo_nombre ?? null, ts: new Date().toISOString() };
    setHoras(m.id, (hs) => hs.map((h) => (h.id === hora.id ? { ...h, aprobacion } : h)));
    registrarEvento?.({ evento: "vaciado_hora_aprobado", modulo: "M9", actor: por, destino: m.folio, ref: m.id,
      detalle: `${hora.etiqueta}: cálculo aprobado (${cub} cub) por ${por} [${aprobacion.tipo || "?"}] — habilita envío a SAP`, meta: { horaId: hora.id, cubetas: cub, porId: aprobacion.porId } });
  };

  // Catálogo de contenedores (persiste en BD): agregar / editar peso (tara) / quitar.
  const addCont = () => setContenedores((prev) => [...(Array.isArray(prev) ? prev : []), { id: nuevoId("CONT"), label: "Nuevo", tara: 0 }]);
  const updCont = (id, campo, val) => setContenedores((prev) => (Array.isArray(prev) ? prev : []).map((c) => (c.id === id ? { ...c, [campo]: val } : c)));
  const delCont = (id) => setContenedores((prev) => { const arr = (Array.isArray(prev) ? prev : []).filter((c) => c.id !== id); return arr.length ? arr : prev; });

  // Actualiza el array de horas de un movimiento (conserva el resto del vaciado).
  const setHoras = (movId, fn) => setMovimientos((prev) => prev.map((m) => (m.id === movId
    ? { ...m, vaciado: { ...baseVac(m), horas: fn(m.vaciado?.horas || []) } } : m)));

  const abrirPanelHoras = (m) => { setHorasMov(m); setPesForm({ bruto: "", tipo: CONTS[0].id, tara: CONTS[0].tara, num: "1", soporte: "", tara2: "", num2: "0" }); };

  const cerrarPanelHoras = () => setHorasMov(null);

  const nuevaHora = (m) => {
    const cont = CONTS.find((c) => c.id === pesForm.tipo) || CONTS[0];
    const n = (m.vaciado?.horas || []).length + 1;
    // `fecha`: un folio se puede vaciar en varios días, y sin esto había dos "Hora 1" sin forma
    // de distinguirlas al revisar. Es solo para mostrar; los kg siguen saliendo de las pesadas.
    const hora = { id: nuevoId("H"), etiqueta: `Hora ${n}`, fecha: hoyISO(), contenedorDefault: { tipo: cont.id, tara: cont.tara }, pesadas: [], estado: "abierta", creada: new Date().toISOString() };
    setHoras(m.id, (hs) => [...hs, hora]);
  };

  const addPesada = (m, horaId) => {
    const bruto = parseFloat(pesForm.bruto) || 0;
    if (bruto <= 0) return;
    const num = parseInt(pesForm.num, 10) || 1;
    const tara = parseFloat(pesForm.tara) || 0;
    // SOPORTE (parrilla/tarima): opcional. Si no se usa, num2 = 0 y no resta nada.
    const num2 = parseInt(pesForm.num2, 10) || 0;
    const tara2 = parseFloat(pesForm.tara2) || 0;
    // OJO: NO se guarda `neto`. El neto SIEMPRE se recalcula con `netoPesada` a partir de
    // bruto/tara/num, así que guardarlo solo creaba un dato que podía quedar viejo y mentir.
    const pes = { id: nuevoId("P"), bruto, tipo: pesForm.tipo, tara, num, fecha: hoyISO(), hora: ahoraHM() };
    if (num2 > 0 && tara2 > 0) { pes.soporte = pesForm.soporte; pes.num2 = num2; pes.tara2 = tara2; }
    setHoras(m.id, (hs) => hs.map((h) => (h.id === horaId ? { ...h, pesadas: [...(h.pesadas || []), pes] } : h)));
    setPesForm((f) => ({ ...f, bruto: "" }));   // limpia el bruto, mantiene tipo/tara/num para la siguiente
  };
  const delPesada = (m, horaId, pesId) =>
    setHoras(m.id, (hs) => hs.map((h) => (h.id === horaId ? { ...h, pesadas: (h.pesadas || []).filter((p) => p.id !== pesId) } : h)));

  const cerrarHoraFn = async (m, horaId) => {
    if (!(await dlg.confirm({ title: "Cerrar la hora", message: "¿Seguro que quieres terminar esta hora? Ya no podrás agregar más pesadas (sí podrás corregir antes de mandar a SAP).", confirmText: "Cerrar hora" }))) return;
    setHoras(m.id, (hs) => hs.map((h) => (h.id === horaId ? { ...h, estado: "cerrada", cerradaEn: new Date().toISOString() } : h)));
  };
  const reabrirHoraFn = (m, horaId) =>
    setHoras(m.id, (hs) => hs.map((h) => (h.id === horaId && h.estado === "cerrada" ? { ...h, estado: "abierta", cerradaEn: undefined, aprobacion: undefined } : h)));

  const abrirEnvioHora = (m, hora) => { setHoraSapError(""); setHoraKgCub(6); setHoraSap({ m, hora }); cargarOrdenSAP(ordenSAPde(m)?.absoluteEntry); };
  const confirmarEnvioHora = async () => {
    const m = movimientos.find((x) => x.id === horaSap.m.id) || horaSap.m;         // datos vivos
    const hora = (m.vaciado?.horas || []).find((h) => h.id === horaSap.hora.id) || horaSap.hora;
    const ord = ordenSAPde(m);
    const neto = netoHora(hora);
    const kgc = parseFloat(horaKgCub) || 6;
    const cubetas = cubetasDe(neto, kgc);
    if (esHist(m)) { setHoraSapError(`Este folio es HISTÓRICO (anterior al corte ${goLiveSAP}): ya se registró fuera de la app, no se manda a SAP desde aquí.`); return; }
    if (usoTotalSAP(m)) { setHoraSapError("Este folio ya se mandó COMPLETO a SAP; no se puede enviar por hora (evita doble conteo)."); return; }   // G3
    if (!hora.aprobacion) { setHoraSapError("Falta APROBAR el cálculo antes de mandar a SAP."); return; }
    if (!ord) { setHoraSapError("Este folio no tiene orden de fabricación en SAP."); return; }
    if (!(cubetas > 0)) { setHoraSapError("La cantidad calculada es 0."); return; }
    // ÚLTIMO AVISO. Aunque el cálculo ya esté aprobado, a SAP no se le puede deshacer desde aquí:
    // se pregunta SIEMPRE antes del POST.
    const seguro = await dlg.confirm({
      title: `¿Mandar ${hora.etiqueta} a SAP?`,
      message: `Se van a mandar ${cubetas.toLocaleString()} cubetas (${fmt(neto)} kg ÷ ${kgc}) a la ${refOrdenSAP(ord)}, del folio ${m.remision || m.folio || ""} (lote ${loteDe(m)}).\n\nEsto SUMA a la "Cantidad completada" en SAP y desde aquí NO se puede deshacer. Aprobado por ${hora.aprobacion?.por || "—"}.`,
      confirmText: `Sí, mandar ${cubetas.toLocaleString()} cubetas`,
      danger: true,
    });
    if (!seguro) return;
    setHoraEnviando(true); setHoraSapError("");
    try {
      // claveEnvio ÚNICA por hora → idempotencia server-side (no doble conteo aunque se reintente).
      // aprobadoPor/Id → se guarda en el recibo (auditoría: quién aprobó esta hora que fue a SAP).
      const res = await reciboProduccionSAP({ absoluteEntry: ord.absoluteEntry, cantidad: cubetas, movimientoId: m.id, claveEnvio: `${m.id}_${hora.id}`, aprobadoPor: hora.aprobacion?.por, aprobadoPorId: hora.aprobacion?.porId != null ? String(hora.aprobacion.porId) : undefined });
      setHoras(m.id, (hs) => hs.map((h) => (h.id === hora.id
        ? { ...h, estado: "enviada", sapEnvio: { docEntry: res.docEntry, docNum: res.docNum, cubetas, kgPorCubeta: kgc, netoKg: neto, absoluteEntry: ord.absoluteEntry, ts: new Date().toISOString() } }
        : h)));
      registrarEvento?.({ evento: "recibo_produccion_hora_sap", modulo: "M9", actor: "Empaque", destino: m.folio, ref: m.id,
        detalle: `${hora.etiqueta}: ${cubetas} cubetas (${Math.round(neto)} kg ÷ ${kgc}) → orden #${ord.docNum ?? ord.absoluteEntry} · SAP #${res.docNum}`,
        meta: { horaId: hora.id, cubetas, netoKg: neto, absoluteEntry: ord.absoluteEntry, docNum: res.docNum } });
      setHoraSap(null);
    } catch (e) {
      if (e?.sinRespuesta) {   // G4 — ver `verificarPendiente`
        marcarPendiente(m, { tipo: "hora", id: hora.id }, { clave: `${m.id}_${hora.id}`, absoluteEntry: ord.absoluteEntry, cubetas, kgPorCubeta: kgc, netoKg: neto });
        setHoraSapError("");
      } else setHoraSapError(String(e?.message || e));
    }
    finally { setHoraEnviando(false); }
  };

  // ── FALTANTE (ajuste) ── kg que SÍ entraron a producción pero no se alcanzaron a pesar por hora.
  // Se manda a SAP de una vez (cubetas = kg/6) con el MISMO candado: aprobación de 2 personas +
  // clave de idempotencia DETERMINISTA `${m.id}_ajuste_${seq}` (si se pierde el estado y se recrea,
  // conserva su clave → SAP no recibe doble). Máx. 1 faltante sin enviar por folio.
  const [faltanteMov, setFaltanteMov] = useState(null);
  const [faltanteKg, setFaltanteKg] = useState("");
  const [faltanteEnviando, setFaltanteEnviando] = useState(false);
  const [faltanteError, setFaltanteError] = useState("");

  const ajustePendienteDe = (m) => (m?.vaciado?.ajustes || []).find((a) => !a.sapEnvio) || null;

  const abrirFaltante = (m) => {
    setFaltanteError("");
    const pend = ajustePendienteDe(m);
    setFaltanteKg(pend ? String(Math.round(pend.kg)) : String(Math.round(kgEnPisoDe(m))));
    setFaltanteMov(m);
    cargarOrdenSAP(ordenSAPde(m)?.absoluteEntry);
  };

  // Crea o corrige el faltante PENDIENTE. Si se corrige el kg, se invalida la aprobación (hay que re-aprobar).
  const guardarFaltante = (m) => {
    const kg = parseFloat(faltanteKg) || 0;
    if (!(kg > 0)) { setFaltanteError("Escribe los kilos faltantes."); return; }
    setFaltanteError("");
    setMovimientos((prev) => prev.map((x) => {
      if (x.id !== m.id) return x;
      const vac = baseVac(x);
      const list = vac.ajustes || [];
      const pend = list.find((a) => !a.sapEnvio);
      if (pend) {
        return { ...x, vaciado: { ...vac, ajustes: list.map((a) => (a.id === pend.id
          ? { ...a, kg, aprobacion: a.kg === kg ? a.aprobacion : undefined } : a)) } };
      }
      const seq = vac.nextAjusteSeq || 1;   // contador estable; NUNCA se reutiliza
      // fecha/hora: SIN esto el faltante bajaba el "en piso" pero no aparecía en el "Vaciado del
      // día" ni en el pivote → los reportes del día no cuadraban con el inventario.
      return { ...x, vaciado: { ...vac, nextAjusteSeq: seq + 1,
        ajustes: [...list, { id: nuevoId("AJ"), seq, kg, fecha: hoyISO(), hora: ahoraHM(), creado: new Date().toISOString() }] } };
    }));
  };

  const aprobarFaltante = async (m, aj) => {
    if (!puedeAprobar) {
      await dlg.alerta({ title: "No puedes aprobar", message: "Solo la encargada (gerente o admin) puede aprobar el cálculo y habilitar el envío a SAP. Pídele que revise y apruebe desde su cuenta." });
      return;
    }
    const ord = ordenSAPde(m);
    const cub = cubetasDe(aj.kg);
    // Si el faltante pide MÁS de lo que queda en piso, la encargada tiene que aceptarlo a
    // sabiendas: no se bloquea (a veces llega más de lo declarado), pero se le dice en la cara.
    // El piso COMO SI este faltante no existiera (kgEnPisoDe ya lo tiene descontado, y además
    // se topa en 0, así que hay que rehacer la resta a mano para ver el exceso real).
    const kgAj = parseFloat(aj.kg) || 0;
    const pisoSinEste = kgRecibidosDe(m) - (kgVaciadosDe(m) - kgAj) - kgMermadosDe(m);
    const excedeKg = Math.max(0, kgAj - pisoSinEste);
    const ok = await dlg.confirm({
      title: "Aprobar el faltante antes de SAP",
      message: `¿Segura que el faltante es correcto? Se enviarán ${cub} cubetas (${Math.round(aj.kg)} kg ÷ 6) a la orden #${(ord?.docNum ?? ord?.absoluteEntry) ?? "—"}.`
        + (excedeKg > 0
          ? `\n\n⚠️ OJO: son ${fmt(excedeKg)} kg MÁS de los que quedan en piso (${fmt(Math.max(0, pisoSinEste))} kg). Este folio va a quedar con MÁS vaciado del que se recibió y saldrá marcado para revisar. Solo apruébalo si de verdad llegó más de lo declarado.`
          : "")
        + `\n\nQuedará registrado a TU nombre como responsable. Al aprobar se habilita el botón de mandar a SAP.`,
      confirmText: "Sí, es correcto — aprobar",
      danger: excedeKg > 0,
    });
    if (!ok) return;
    const por = usuarioActual?.full_name || usuarioActual?.email || "encargado";
    const aprobacion = { por, porId: usuarioActual?.id ?? null, tipo: usuarioActual?.tipo_nombre ?? null, ts: new Date().toISOString() };
    setMovimientos((prev) => prev.map((x) => (x.id === m.id
      ? { ...x, vaciado: { ...baseVac(x), ajustes: (x.vaciado?.ajustes || []).map((a) => (a.id === aj.id ? { ...a, aprobacion } : a)) } }
      : x)));
    registrarEvento?.({ evento: "faltante_aprobado", modulo: "M9", actor: por, destino: m.folio, ref: m.id,
      detalle: `Faltante #${aj.seq}: ${Math.round(aj.kg)} kg (${cub} cub) aprobado por ${por} [${aprobacion.tipo || "?"}]`,
      meta: { ajusteId: aj.id, kg: aj.kg, cubetas: cub, porId: aprobacion.porId } });
  };

  const enviarFaltanteSAP = async (m, aj) => {
    const mv = movimientos.find((x) => x.id === m.id) || m;                      // datos VIVOS
    const aju = (mv.vaciado?.ajustes || []).find((a) => a.id === aj.id) || aj;
    const ord = ordenSAPde(mv);
    const cub = cubetasDe(aju.kg);
    if (esHist(mv)) { setFaltanteError(`Este folio es HISTÓRICO (anterior al corte ${goLiveSAP}): ya se registró fuera de la app, no se manda a SAP desde aquí.`); return; }
    if (!aju.aprobacion) { setFaltanteError("Falta APROBAR el faltante antes de mandar a SAP."); return; }
    // El faltante SÍ escribe en SAP; con un recibido provisional (falta trailer/destare) el "en piso"
    // no es real todavía → se bloquea hasta afinar el peso. El vaciado por hora NO se afecta.
    if (recibidoProvisional(mv)) { setFaltanteError("El recibido es PROVISIONAL (falta el peso del trailer o el destare). Afina el peso en recepción/movimiento antes de mandar el faltante a SAP."); return; }
    if (usoTotalSAP(mv)) { setFaltanteError("Este folio ya se mandó COMPLETO a SAP; no se puede mandar un faltante (evita doble conteo)."); return; }
    if (!ord) { setFaltanteError("Este folio no tiene orden de fabricación en SAP."); return; }
    if (!(cub > 0)) { setFaltanteError("La cantidad calculada es 0."); return; }
    // ÚLTIMO AVISO antes del POST. Aunque ya esté aprobado, este botón manda de un solo clic y a
    // SAP no se le puede deshacer: se pregunta SIEMPRE (un clic de más = cubetas de más en SAP).
    const seguro = await dlg.confirm({
      title: "¿Mandar el faltante a SAP?",
      message: `Se van a mandar ${cub.toLocaleString()} cubetas (${fmt(aju.kg)} kg ÷ 6) a la ${refOrdenSAP(ord)}, del folio ${mv.remision || mv.folio || ""} (lote ${loteDe(mv)}).\n\nEsto SUMA a la "Cantidad completada" en SAP y desde aquí NO se puede deshacer. Aprobado por ${aju.aprobacion?.por || "—"}.`,
      confirmText: `Sí, mandar ${cub.toLocaleString()} cubetas`,
      danger: true,
    });
    if (!seguro) return;
    setFaltanteEnviando(true); setFaltanteError("");
    try {
      const res = await reciboProduccionSAP({
        absoluteEntry: ord.absoluteEntry, cantidad: cub, movimientoId: mv.id,
        claveEnvio: `${mv.id}_ajuste_${aju.seq}`,   // DETERMINISTA → idempotente aunque se recree
        aprobadoPor: aju.aprobacion?.por,
        aprobadoPorId: aju.aprobacion?.porId != null ? String(aju.aprobacion.porId) : undefined,
      });
      setMovimientos((prev) => prev.map((x) => (x.id === mv.id
        ? { ...x, vaciado: { ...baseVac(x), ajustes: (x.vaciado?.ajustes || []).map((a) => (a.id === aju.id
            ? { ...a, sapEnvio: { docEntry: res.docEntry, docNum: res.docNum, cubetas: cub, kgPorCubeta: 6, netoKg: aju.kg, absoluteEntry: ord.absoluteEntry, ts: new Date().toISOString() } }
            : a)) } }
        : x)));
      registrarEvento?.({ evento: "recibo_faltante_sap", modulo: "M9", actor: "Empaque", destino: mv.folio, ref: mv.id,
        detalle: `Faltante #${aju.seq}: ${cub} cubetas (${Math.round(aju.kg)} kg ÷ 6) → orden #${ord.docNum ?? ord.absoluteEntry} · SAP #${res.docNum}`,
        meta: { ajusteId: aju.id, cubetas: cub, netoKg: aju.kg, docNum: res.docNum } });
      setFaltanteMov(null);
    } catch (e) {
      if (e?.sinRespuesta) {   // G4 — ver `verificarPendiente`
        marcarPendiente(mv, { tipo: "ajuste", id: aju.id }, { clave: `${mv.id}_ajuste_${aju.seq}`, absoluteEntry: ord.absoluteEntry, cubetas: cub, kgPorCubeta: 6, netoKg: aju.kg });
        setFaltanteError("");
      } else setFaltanteError(String(e?.message || e));
    }
    finally { setFaltanteEnviando(false); }
  };

  const quitarFaltante = async (m, aj) => {
    if (aj.sapEnvio) return;   // ya está en SAP → no se quita
    if (!(await dlg.confirm({ title: "Quitar faltante", message: "¿Quitar este faltante? El \"en piso\" volverá a subir.", confirmText: "Quitar", danger: true }))) return;
    setMovimientos((prev) => prev.map((x) => (x.id === m.id
      ? { ...x, vaciado: { ...baseVac(x), ajustes: (x.vaciado?.ajustes || []).filter((a) => a.id !== aj.id) } } : x)));
    setFaltanteMov(null);
  };

  // ── Muestreo de calidad ──
  const [muestreoMov, setMuestreoMov] = useState(null); // movimiento al que se le hace muestreo
  const [muestreos, setMuestreos] = useState([]); // muestreos en edición (hasta 3)
  const [mActivo, setMActivo] = useState(0); // pestaña activa

  // Siguiente folio de muestreo: máximo numérico existente + 1 (arranca en 201).
  const siguienteFolioMuestreo = () => {
    const nums = [];
    movimientos.forEach((mov) => (mov.muestreos || []).forEach((mu) => { const n = parseInt(mu.folio, 10); if (!isNaN(n)) nums.push(n); }));
    muestreos.forEach((mu) => { const n = parseInt(mu.folio, 10); if (!isNaN(n)) nums.push(n); });
    return nums.length ? Math.max(...nums) + 1 : 201;
  };

  const abrirMuestreo = (m) => {
    const existentes = m.muestreos && m.muestreos.length ? m.muestreos : [muestreoVacio(m, siguienteFolioMuestreo())];
    setMuestreos(existentes);
    setMActivo(0);
    setMuestreoMov(m);
  };
  const cerrarMuestreo = () => { setMuestreoMov(null); setMuestreos([]); setMActivo(0); };

  const updMuestreo = (campo, val) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, [campo]: val } : mu)));
  const updDefecto = (defId, val) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, defectos: { ...mu.defectos, [defId]: val } } : mu)));

  const agregarMuestreo = () => {
    if (muestreos.length >= MAX_MUESTREOS) return;
    setMuestreos((prev) => [...prev, muestreoVacio(muestreoMov, siguienteFolioMuestreo())]);
    setMActivo(muestreos.length);
  };
  const eliminarMuestreo = (idx) => {
    setMuestreos((prev) => prev.filter((_, i) => i !== idx));
    setMActivo((a) => (a >= idx && a > 0 ? a - 1 : a));
  };

  const guardarMuestreo = () => {
    setMovimientos((prev) => prev.map((m) => (m.id === muestreoMov.id ? { ...m, muestreos } : m)));
    cerrarMuestreo();
  };

  // ── Inspección de vehículo y producto (REG-EMP-24) ──
  const [inspMov, setInspMov] = useState(null); // flete al que se le hace la inspección
  const [insp, setInsp] = useState(null);

  const abrirInspeccion = (m) => { setInsp(m.inspeccion ? { ...inspeccionVacia(m), ...m.inspeccion } : inspeccionVacia(m)); setInspMov(m); };
  const cerrarInspeccion = () => { setInspMov(null); setInsp(null); };
  const updInsp = (campo, val) => setInsp((f) => ({ ...f, [campo]: val }));
  const updInspCheck = (grupo, id, val) => setInsp((f) => ({ ...f, [grupo]: { ...f[grupo], [id]: val } }));
  const guardarInspeccion = () => {
    setMovimientos((prev) => prev.map((m) => (m.id === inspMov.id ? { ...m, inspeccion: insp } : m)));
    cerrarInspeccion();
  };

  // Foto (1 por defecto) → se guarda como dataURL base64
  const subirFoto = (defId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, fotos: { ...mu.fotos, [defId]: reader.result } } : mu)));
    reader.readAsDataURL(file);
  };
  const quitarFoto = (defId) => setMuestreos((prev) => prev.map((mu, i) => (i === mActivo ? { ...mu, fotos: { ...mu.fotos, [defId]: undefined } } : mu)));

  // ── Abrir ficha de recepción ──
  const abrirRecepcion = (m) => {
    const par = sumar(m.cargaItems, "parrillas");
    const bul = sumar(m.cargaItems, "bultos");
    const r = m.recepcion || {};
    setForm({
      fechaLlegada: r.fechaLlegada || hoyISO(),
      horaLlegada: r.horaLlegada || "",
      responsable: r.responsable || "",
      // se prellenan con lo declarado para que solo confirmen o ajusten
      parrillasRecibidas: r.parrillasRecibidas ?? String(par || ""),
      bultosRecibidos: r.bultosRecibidos ?? String(bul || ""),
      pesoRecibido: r.pesoRecibido ?? (m.pesoBascula || ""),
      condicion: r.condicion || "ok",
      observaciones: r.observaciones || "",
      clienteDirecto: r.clienteDirecto || false, // no entra a empaque, se va con el cliente
      // Destare de empaque (ejote): siempre activo; para anularlo se pone 0 en los pesos.
      destareAplicar: r.destareAplicar ?? true,
      destareParrillaKg: r.destareParrillaKg ?? String(TARA_PARRILLA),
      destareCajaKg: r.destareCajaKg ?? String(TARA_CAJA),
    });
    setRecibir(m);
  };

  const upd = (campo, val) => setForm((f) => ({ ...f, [campo]: val }));

  // ⚠️ [SAP] Al dar recepción se generará en SAP: una ORDEN DE PRODUCCIÓN (materia prima)
  // y una ORDEN DE COMPRA (flete, documentado). Integración pendiente — ver docs/CLAUDE.md.
  const confirmar = () => {
    // Al confirmar la recepción formal se limpia la marca de "provisional" (ya se afinó el destare).
    const recepcion = { ...form, estado: "recibido", confirmado: new Date().toLocaleString("es-MX"), recepcionPendiente: false };
    setMovimientos((prev) => prev.map((m) => (m.id === recibir.id ? { ...m, recepcion } : m)));
    setRecibir(null);
    setForm(null);
  };

  const reabrir = async (id) => {
    // Candado G2: si el folio ya tuvo CUALQUIER envío a SAP (total, por hora o faltante), NO se
    // puede reabrir (borraría el vaciado ya enviado y podría causar doble envío al recapturar).
    const mov = movimientos.find((x) => x.id === id);
    if (tieneEnvioSAP(mov)) {
      await dlg.alerta({ title: "No se puede reabrir", message: "Este folio ya tuvo envíos a SAP (total, por hora o faltante). Reabrirlo borraría lo ya enviado y dejaría la plataforma fuera de sincronía con SAP." });
      return;
    }
    if (!(await dlg.confirm({ title: "Reabrir flete", message: "¿Reabrir este flete? Volverá a 'Por recibir' y se borrará el vaciado registrado.", confirmText: "Reabrir", danger: true }))) return;
    setMovimientos((prev) => prev.map((m) => (m.id === id ? { ...m, recepcion: undefined, vaciado: undefined } : m)));
  };

  // ── Vaciado a Empaque ── (todo en kg, capturado a mano)
  // base() conserva todo el objeto vaciado (incluye mermas) para no perder datos al editar.
  const baseVac = (m) => ({ eventos: [], mermas: [], ...(m.vaciado || {}) });
  const setRecibido = (id, campo, val) =>
    setMovimientos((prev) => prev.map((m) => (m.id === id
      ? { ...m, vaciado: { ...baseVac(m), [campo]: val } }
      : m)));
  // El "vaciado simple" (un solo evento, sin desglose) se RETIRÓ: ahora TODO se vacía POR HORA, así
  // el inventario y lo que va a SAP salen de la MISMA captura (antes se podía capturar dos veces).
  // Los vaciados simples ya registrados se conservan, se ven y se pueden cancelar con el ✕.
  // Cancela un vaciado registrado: lo quita de eventos → sus kg vuelven al piso.
  const cancelarVaciado = (movId, idx) =>
    setMovimientos((prev) => prev.map((m) => (m.id === movId
      ? { ...m, vaciado: { ...m.vaciado, eventos: (m.vaciado?.eventos || []).filter((_, i) => i !== idx) } }
      : m)));

  // ── Mermado (no entró a empaque) ── también descuenta del piso.
  // ── COMPLETAR EL DESTARE desde la tarjeta (parrillas/cajas → ejote neto exacto) ──
  // El destare deja de hacerse SOLO en el modal de recepción: se puede afinar aquí, en Empaque,
  // cuando ya se tenga el peso del trailer. Al guardar, el recibido pasa de provisional al neto.
  const abrirDestare = (m) => {
    const r = m.recepcion || {};
    // Cajas/parrillas: lo capturado en recepción, o lo declarado en el manifiesto (cargaItems).
    const cajasMan = sumar(m.cargaItems, "bultos");
    const parrMan = sumar(m.cargaItems, "parrillas");
    setDestareForm({
      parrillas: r.parrillasRecibidas ?? (parrMan ? String(parrMan) : ""),
      cajas: r.bultosRecibidos ?? (cajasMan ? String(cajasMan) : ""),
      pP: r.destareParrillaKg ?? String(TARA_PARRILLA),
      pC: r.destareCajaKg ?? String(TARA_CAJA),
    });
    setDestareMov(m);
  };
  const guardarDestare = (m) => {
    const f = destareForm;
    setMovimientos((prev) => prev.map((x) => (x.id === m.id
      ? { ...x, recepcion: { ...(x.recepcion || {}), estado: "recibido",
          pesoRecibido: (x.recepcion?.pesoRecibido ?? x.pesoBascula) || "",
          parrillasRecibidas: f.parrillas, bultosRecibidos: f.cajas,
          destareParrillaKg: f.pP, destareCajaKg: f.pC,
          destareAplicar: true, recepcionPendiente: false } }
      : x)));
    registrarEvento?.({ evento: "destare_completado", modulo: "M9", actor: "Empaque", destino: m.folio, ref: m.id,
      detalle: `Destare completado: ${f.parrillas || 0} parrillas × ${f.pP} + ${f.cajas || 0} cajas × ${f.pC}` });
    setDestareMov(null);
  };

  const abrirMermar = (m) => { setMermarKg(""); setMermarMotivo(""); setMermarComentario(""); setMermarFecha(hoyISO()); setMermarHora(ahoraHM()); setMermarError(""); setMermarMov(m); };
  // Mermar es DESCARTAR producto: se valida como el resto del apartado (tope al piso, motivo
  // obligatorio) y queda registrado QUIÉN lo hizo, igual que la aprobación y el cierre.
  const confirmarMerma = () => {
    const kg = parseFloat(mermarKg) || 0;
    const piso = kgEnPisoDe(mermarMov);
    if (!(kg > 0)) { setMermarError("Escribe los kilos que se van a mermar."); return; }
    if (!mermarMotivo.trim()) { setMermarError("Elige el motivo: sin motivo no se puede descartar producto."); return; }
    if (kg > piso) { setMermarError(`No puedes mermar ${fmt(kg)} kg: en piso solo quedan ${fmt(piso)} kg.`); return; }
    const por = usuarioActual?.full_name || usuarioActual?.email || "—";
    const ev = { kg, fecha: mermarFecha || hoyISO(), hora: mermarHora || ahoraHM(), motivo: mermarMotivo.trim(), comentario: mermarComentario.trim(), por, porId: usuarioActual?.id ?? null };
    setMovimientos((prev) => prev.map((m) => (m.id === mermarMov.id
      ? { ...m, vaciado: { ...baseVac(m), mermas: [...(m.vaciado?.mermas || []), ev] } }
      : m)));
    registrarEvento?.({ evento: "merma_registrada", modulo: "M9", actor: por, destino: mermarMov.folio, ref: mermarMov.id,
      detalle: `Merma de ${fmt(kg)} kg · ${ev.motivo}${ev.comentario ? ` — ${ev.comentario}` : ""} (registrada por ${por})`,
      meta: { kg, motivo: ev.motivo, fecha: ev.fecha } });
    setMermarMov(null); setMermarKg(""); setMermarMotivo(""); setMermarComentario(""); setMermarError("");
  };
  // Cancela una merma registrada: vuelve al piso. También queda en la bitácora (es producto que
  // se había dado por perdido y regresa al inventario).
  const cancelarMerma = (movId, idx) => {
    const mv = movimientos.find((x) => x.id === movId);
    const ev = (mv?.vaciado?.mermas || [])[idx];
    setMovimientos((prev) => prev.map((m) => (m.id === movId
      ? { ...m, vaciado: { ...m.vaciado, mermas: (m.vaciado?.mermas || []).filter((_, i) => i !== idx) } }
      : m)));
    if (ev) registrarEvento?.({ evento: "merma_cancelada", modulo: "M9", actor: usuarioActual?.full_name || "—", destino: mv?.folio, ref: movId,
      detalle: `Se canceló una merma de ${fmt(ev.kg)} kg (${ev.motivo || "sin motivo"}): esos kg vuelven al piso.`, meta: { kg: ev.kg } });
  };

  // Devolver un manifiesto a "Vaciado a Empaque" (deshace vaciados y mermas; el piso vuelve completo).
  // ── DAR POR REVISADO un descuadre ──
  // Los folios descuadrados se acumulaban para siempre en "revisar". Aquí una persona dice
  // "ya lo vi" y deja de estorbar, PERO se guarda el tamaño de la diferencia: si el número
  // cambia después (siguen capturando o corrigen el recibido), el folio vuelve a salir solo.
  const marcarRevisado = async (f) => {
    const que = f.tipo === "falta"
      ? `salió ${fmt(f.dif)} kg MENOS de lo recibido`
      : `salió ${fmt(f.dif)} kg MÁS de lo recibido`;
    const ok = await dlg.confirm({
      title: "Dar por revisado",
      message: `Folio ${f.folio}: ${que}.\n\n¿Ya lo revisaste? Dejará de aparecer en "revisar" y quedará registrado a TU nombre.\n\nSi la diferencia cambia (siguen capturando o se corrige el recibido), el folio volverá a salir solo.`,
      confirmText: "Sí, ya lo revisé",
    });
    if (!ok) return;
    const por = usuarioActual?.full_name || usuarioActual?.email || "—";
    setMovimientos((prev) => prev.map((x) => (x.id === f.id
      ? { ...x, vaciado: { ...baseVac(x), revisado: { por, porId: usuarioActual?.id ?? null, ts: new Date().toISOString(), tipo: f.tipo, dif: f.dif } } }
      : x)));
    registrarEvento?.({ evento: "descuadre_revisado", modulo: "M9", actor: por, destino: f.folio, ref: f.id,
      detalle: `Descuadre revisado por ${por}: ${que} (recibido ${fmt(f.rec)} · vaciado ${fmt(f.vac)}).`,
      meta: { tipo: f.tipo, dif: f.dif } });
  };
  const quitarRevisado = (f) => setMovimientos((prev) => prev.map((x) => (x.id === f.id
    ? { ...x, vaciado: { ...baseVac(x), revisado: undefined } } : x)));

  // ── TERMINAR el vaciado de un folio (cierre a mano) ──
  // Casi nunca cierra en 0.00: quedan kg de diferencia de báscula que nadie va a vaciar y el folio
  // se quedaría "en piso" para siempre. Aquí una persona declara que ya se acabó. Se guarda quién y
  // cuándo, y la diferencia que quedaba (no se borra: queda auditable en `pisoAlCerrar`).
  const terminarVaciado = async (m) => {
    const piso = kgEnPisoDe(m);
    const pendSAP = kgPendienteSAP(m);
    // Un envío sin confirmar SÍ bloquea: hay que saber primero si quedó en SAP (G4).
    if (tienePendienteSAP(m)) {
      await dlg.alerta({ title: "Primero verifica el envío", message: "Este folio tiene un envío a SAP PENDIENTE DE CONFIRMAR. Abre el vaciado por hora y dale a \"Verificar en SAP\" antes de darlo por terminado." });
      return;
    }
    const horasAbiertas = (m.vaciado?.horas || []).filter((h) => h.estado === "abierta").length;
    const sinAprobar = (m.vaciado?.horas || []).filter((h) => h.estado === "cerrada" && !h.aprobacion && !h.sapEnvio).length;
    const avisos = [
      recibidoProvisional(m) ? `• El recibido es PROVISIONAL (falta ${faltaPesoTrailer(m) ? "el peso del trailer" : "el destare"}): el ejote neto estimado aún no es exacto, así que la comparación de "cuánto faltó/sobró" no será confiable.` : "",
      horasAbiertas > 0 ? `• Hay ${horasAbiertas} hora(s) TODAVÍA ABIERTA(S): ciérralas antes, o lo que se capture después no se podrá mandar.` : "",
      sinAprobar > 0 ? `• Hay ${sinAprobar} hora(s) cerrada(s) SIN APROBAR: como están, no se pueden mandar a SAP.` : "",
      piso > 0 ? `• Quedan ${fmt(piso)} kg en piso (≈ ${cubetasDe(piso)} cubetas) que YA NO se van a vaciar ni a mandar a SAP.` : "",
      pendSAP > 0 ? `• Hay ${fmt(pendSAP)} kg vaciados (≈ ${cubetasDe(pendSAP)} cubetas) que TODAVÍA NO se han reportado a SAP.` : "",
    ].filter(Boolean).join("\n");
    const ok = await dlg.confirm({
      title: "¿Ya se terminó este folio?",
      message: `¿Segura que ya se terminó de vaciar el folio ${m.remision || m.folio || ""}?\n\n${avisos ? avisos + "\n\n" : ""}Al terminarlo se archiva en el historial y sale de la lista de "en piso". Solo la encargada podrá reabrirlo. Quedará registrado a TU nombre.`,
      confirmText: "Sí, ya se terminó",
      danger: pendSAP > 0 || horasAbiertas > 0 || sinAprobar > 0,
    });
    if (!ok) return;
    const por = usuarioActual?.full_name || usuarioActual?.email || "—";
    setMovimientos((prev) => prev.map((x) => (x.id === m.id
      ? { ...x, vaciado: { ...baseVac(x), terminado: { por, porId: usuarioActual?.id ?? null, ts: new Date().toISOString(), pisoAlCerrar: piso } } }
      : x)));
    registrarEvento?.({ evento: "vaciado_terminado", modulo: "M9", actor: por, destino: m.folio, ref: m.id,
      detalle: `Vaciado terminado por ${por}${piso > 0 ? ` · quedaban ${fmt(piso)} kg sin vaciar` : " · cerró exacto"}${pendSAP > 0 ? ` · ${fmt(pendSAP)} kg sin reportar a SAP` : ""}`,
      meta: { pisoAlCerrar: piso, pendienteSAP: pendSAP } });
  };

  // Reabrir un folio terminado: SOLO la encargada (mismo permiso que aprobar el cálculo).
  const reabrirVaciado = async (m) => {
    if (!puedeAprobar) {
      await dlg.alerta({ title: "No puedes reabrir", message: "El folio ya se dio por terminado. Solo la encargada (gerente o admin) puede reabrirlo." });
      return;
    }
    if (!(await dlg.confirm({ title: "Reabrir el vaciado", message: "¿Reabrir este folio? Volverá a la lista de \"en piso\" con los kg que le quedaban. Los vaciados y los envíos a SAP NO se tocan.", confirmText: "Reabrir" }))) return;
    setMovimientos((prev) => prev.map((x) => (x.id === m.id
      ? { ...x, vaciado: { ...baseVac(x), terminado: undefined } } : x)));
    registrarEvento?.({ evento: "vaciado_reabierto", modulo: "M9", actor: usuarioActual?.full_name || "—", destino: m.folio, ref: m.id,
      detalle: `Vaciado reabierto por ${usuarioActual?.full_name || "—"}` });
  };

  const devolverManifiesto = async (id) => {
    if (!(await dlg.confirm({ title: "Devolver manifiesto", message: "¿Devolver este manifiesto a 'Vaciado a Empaque'? Se quitarán los vaciados y mermas registrados y el piso volverá completo.", confirmText: "Devolver", danger: true }))) return;
    setMovimientos((prev) => prev.map((m) => (m.id === id
      ? { ...m, vaciado: { ...baseVac(m), eventos: [], mermas: [], terminado: undefined } }
      : m)));
  };

  // ── Rezaga suelta (no viene de manifiesto) → Historial Mermado ──
  const abrirRezaga = () => setRezagaForm({ fecha: hoyISO(), hora: ahoraHM(), tipo: "Rezaga", origen: "Cuarto frío", kg: "", comentario: "" });
  const updRezaga = (campo, val) => setRezagaForm((f) => ({ ...f, [campo]: val }));
  const confirmarRezaga = () => {
    const f = rezagaForm;
    const item = {
      id: nuevoId("REZAGA"),
      fecha: f.fecha || hoyISO(), hora: f.hora || "",
      tipo: f.tipo || "", origen: f.origen || "",
      kg: parseFloat(f.kg) || 0, comentario: (f.comentario || "").trim(),
      creado: new Date().toLocaleString("es-MX"),
    };
    setRezagas((prev) => [item, ...prev]);
    setRezagaForm(null);
  };
  const eliminarRezaga = async (id) => { if (await dlg.confirm({ title: "Eliminar rezaga", message: "¿Eliminar esta rezaga?", confirmText: "Eliminar", danger: true })) setRezagas((prev) => prev.filter((r) => r.id !== id)); };

  // ── Rechazo del flete (desde muestreo o inspección) ──
  const abrirRechazo = async (m) => {
    // Candado G2: rechazar borra el vaciado; si ya hubo envíos a SAP, no se permite.
    if (tieneEnvioSAP(m)) {
      await dlg.alerta({ title: "No se puede rechazar", message: "Este folio ya tuvo envíos a SAP (total, por hora o faltante). Rechazarlo borraría el vaciado ya enviado y lo dejaría fuera de sincronía con SAP." });
      return;
    }
    setRechazoComent(m.recepcion?.comentario || ""); setRechazoMov(m);
  };
  const confirmarRechazo = () => {
    if (tieneEnvioSAP(rechazoMov)) { setRechazoMov(null); return; }   // defensa G2
    const recepcion = { estado: "rechazado", comentario: rechazoComent, confirmado: new Date().toLocaleString("es-MX") };
    setMovimientos((prev) => prev.map((m) => (m.id === rechazoMov.id ? { ...m, recepcion, vaciado: undefined } : m)));
    setRechazoMov(null); setRechazoComent("");
    cerrarMuestreo(); cerrarInspeccion();
  };

  const atendido = (m) => m.recepcion?.estado === "recibido" || m.recepcion?.estado === "rechazado";
  // "Cliente Directo": recibido pero NO entra a empaque (se va con el cliente) → su propia pestaña.
  const esClienteDirecto = (m) => m.recepcion?.estado === "recibido" && m.recepcion?.clienteDirecto;
  const clienteDirectoList = movimientos.filter(esClienteDirecto);
  // VACIABLE ("Vaciado a Empaque"): un folio se puede vaciar en cuanto tiene BRUTO de báscula
  // (ya llegó y se pesó), AUNQUE no se le haya dado recepción formal ni se tenga el peso del
  // trailer/destare. El peso neto se afina después (Recibidos) y NO limita el vaciado. También
  // entran los ya recibidos. Se excluyen rechazados y cliente directo.
  const recibidos = movimientos.filter((m) => !m.recepcion?.clienteDirecto && m.recepcion?.estado !== "rechazado"
    && ((parseFloat(m.pesoBascula) || 0) > 0 || m.recepcion?.estado === "recibido"));
  // El kg es lo que manda (los bins son guía a grosso modo): "completo" = sin kg en piso.
  // Un folio se archiva SOLO cuando una persona le da "Terminado". Antes se archivaba solo al
  // llegar el piso a 0, y eso escondía folios con trabajo pendiente: se podía tener todo vaciado
  // pero horas SIN APROBAR o SIN MANDAR a SAP, y el folio ya se había salido de la lista de trabajo.
  // Que los kg den 0 no quiere decir que se haya terminado el trabajo.
  const vaciadoCompleto = (m) => estaTerminado(m);
  const enPisoLista = recibidos.filter((m) => !vaciadoCompleto(m));   // pestaña "Vaciado a Empaque"
  // Historiales: manifiestos sin kg en piso, separados por a dónde se fue el producto.
  const vaciadosHist = recibidos.filter((m) => vaciadoCompleto(m) && kgVaciadosDe(m) > 0);  // entraron a empaque
  const mermadosHist = recibidos.filter((m) => vaciadoCompleto(m) && kgMermadosDe(m) > 0);  // NO entraron (merma)
  // Filtro de Destino (dropdown): aplica a la lista VISIBLE de la pestaña activa.
  const destinosMov = [...new Set(movimientos.map((m) => m.destino).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Búsqueda libre en las tablas de vaciado: folio, remisión, lote/rancho, producto, destino, línea, chofer.
  const buscaVac = (m) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const prod = (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(" ");
    return [m.folio, m.remision, m.lote, m.rancho, m.consignado, m.distribuidor, m.destino, m.linea, m.chofer, prod]
      .filter(Boolean).join(" ").toLowerCase().includes(t);
  };
  const filasVac = (tabRec === "histVaciado" ? vaciadosHist : tabRec === "histMermado" ? mermadosHist : enPisoLista)
    .filter((m) => !fDestino || m.destino === fDestino)
    .filter(buscaVac);
  const rechazados = movimientos.filter((m) => m.recepcion?.estado === "rechazado");
  const pendientes = movimientos.filter((m) => !atendido(m));
  const historialArr = movimientos.filter(atendido);
  const conNovedad = recibidos.filter((m) => m.recepcion?.condicion === "con_novedad");
  const qLow = q.trim().toLowerCase();
  const lista = (tabRec === "pendientes" ? pendientes : historialArr).filter((m) => {
    if (tabRec === "historial" && fTipo && (m.recepcion?.estado || "") !== fTipo) return false;
    if (fDestino && m.destino !== fDestino) return false;
    if (qLow) {
      const campos = [m.folio, m.remision, m.rancho, m.lote, m.linea, m.chofer, m.origen, m.destino, m.viaje];
      if (!campos.some((c) => String(c ?? "").toLowerCase().includes(qLow))) return false;
    }
    return true;
  });
  const hayFiltros = !!(q || fTipo || fDestino);

  // Inventario (acumulado, no por día): recibido / vaciado / mermado / en piso, todo en kg.
  const totKgRec = recibidos.reduce((a, m) => a + kgRecibidosDe(m), 0);
  const totKgVac = recibidos.reduce((a, m) => a + kgVaciadosDe(m), 0);
  const totKgMer = recibidos.reduce((a, m) => a + kgMermadosDe(m), 0);
  const totKgPiso = recibidos.reduce((a, m) => a + kgEnPisoDe(m), 0);

  // Eventos/mermas del DÍA seleccionado (los viejos sin fecha cuentan como hoy).
  // SOLO lo que trae FECHA de ese día. Los registros VIEJOS sin fecha ya NO se cuentan como "hoy"
  // (antes aparecían TODOS los días e inflaban el día); siguen contando en inventario / "en piso".
  const evDia = (m) => (m.vaciado?.eventos || []).filter((e) => e.fecha === diaReporte);
  const merDia = (m) => (m.vaciado?.mermas || []).filter((e) => e.fecha === diaReporte);
  const sumaKg = (arr) => arr.reduce((a, e) => a + (parseFloat(e.kg) || 0), 0);
  // Pesadas del vaciado POR HORA del día como pseudo-eventos {kg, fecha, hora}, para UNIR con evDia
  // en las vistas por día (card "Vaciado del día" y pivote "Vaciado por hora"). Usa netoPesada
  // (recalcula) para cuadrar con kgHorasDe/kgVaciadosDe. NO altera `eventos` ni `kgVaciadosDe`.
  const pesadasDia = (m) => (m.vaciado?.horas || []).flatMap((h) => (h.pesadas || [])
    .filter((p) => p.fecha === diaReporte)
    .map((p) => ({ kg: netoPesada(p), fecha: p.fecha, hora: p.hora })));
  // Faltantes (ajustes) del día. También son vaciado: bajan el piso, así que TIENEN que contar en
  // el día, si no el card y el pivote no cuadran con el inventario.
  const ajustesDia = (m) => (m.vaciado?.ajustes || []).filter((a) => a.fecha === diaReporte)
    .map((a) => ({ kg: a.kg, fecha: a.fecha, hora: a.hora, esAjuste: true }));
  const totKgVacDia = recibidos.reduce((a, m) => a + sumaKg(evDia(m)) + sumaKg(pesadasDia(m)) + sumaKg(ajustesDia(m)), 0);
  // Vaciado VIEJO sin fecha: no se puede ubicar en un día → se avisa para que no "desaparezca".
  const kgVacSinFecha = recibidos.reduce((a, m) => a
    + sumaKg((m.vaciado?.eventos || []).filter((e) => !e.fecha))
    + sumaKg((m.vaciado?.ajustes || []).filter((x) => !x.fecha)), 0);
  const totKgMerDia = recibidos.reduce((a, m) => a + sumaKg(merDia(m)), 0);

  // Lote/proveedor de un manifiesto (lo que se vacía y se inventaría).
  const loteDe = (m) => m.lote || m.rancho || m.consignado || "—";

  // Desglose por hora del DÍA seleccionado: por franja horaria y lote (kg; bins teóricos = kg/240).
  const porHora = (() => {
    const acc = {};
    recibidos.forEach((m) => {
      const lote = loteDe(m);
      [...evDia(m), ...pesadasDia(m), ...ajustesDia(m)].forEach((e) => {   // simple + POR HORA + faltantes
        const h = String(e.hora || "").split(":")[0] || "—";
        if (!acc[h]) acc[h] = { kg: 0, lotes: {} };
        const kg = parseFloat(e.kg) || 0;
        acc[h].kg += kg;
        acc[h].lotes[lote] = (acc[h].lotes[lote] || 0) + kg;
      });
    });
    return Object.entries(acc).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  // Merma por hora del día (para la columna "% MERMA EN KG" del reporte de bins). El % de la hora
  // = merma / (vaciado + merma) de esa hora.
  const mermaPorHora = (() => {
    const acc = {};
    recibidos.forEach((m) => merDia(m).forEach((e) => {
      const h = String(e.hora || "").split(":")[0] || "—";
      acc[h] = (acc[h] || 0) + (parseFloat(e.kg) || 0);
    }));
    return acc;
  })();
  // Bins RECIBIDOS por lote = conteo FÍSICO que capturan a mano (m.binsRecibidos), sumado por lote.
  const binsRecibidosPorLote = (() => {
    const acc = {};
    recibidos.forEach((m) => {
      const n = parseFloat(m.vaciado?.binsRecibidos) || 0;
      if (n > 0) acc[loteDe(m)] = (acc[loteDe(m)] || 0) + n;
    });
    return acc;
  })();

  // Inventario y merma por lote (sobre los recibidos del día).
  const porLote = (() => {
    const acc = {};
    recibidos.forEach((m) => {
      const lote = loteDe(m);
      if (!acc[lote]) acc[lote] = { rec: 0, vac: 0, mer: 0, piso: 0, malos: [], faltos: [], vistos: [] };
      const rec = kgRecibidosDe(m);
      const vac = kgVaciadosDe(m);
      const mer = kgMermadosDe(m);
      acc[lote].rec += rec;
      acc[lote].vac += vac;
      acc[lote].mer += mer;
      acc[lote].piso += kgEnPisoDe(m);
      // Se arrastra QUIÉN trajo la carga: los descuadres sueltos no dicen nada, pero repetidos con
      // el mismo chofer/línea/tabla sí — que es justo para lo que sirve el historial de avisos.
      const ref = { id: m.id, folio: m.folio || m.remision || m.id, rec, vac, mer,
        fecha: m.fecha || "", chofer: m.chofer || "", linea: m.linea || "", tabla: m.departamento || "" };
      // ¿Ya lo revisó alguien? Se guarda el tipo y el TAMAÑO de la diferencia al momento de
      // revisarla: si después el número cambia (siguen capturando), el folio VUELVE a salir.
      const rev = m.vaciado?.revisado;
      const yaVisto = (tipo, dif) => !!rev && rev.tipo === tipo && Math.abs((parseFloat(rev.dif) || 0) - dif) <= 1;
      // DOS descuadres que hay que vigilar, y por razones distintas:
      // 1) SOBRA — salió MÁS de lo que se recibió. Puede ser doble captura, o que la carga venga
      //    con peso inflado (les meten piedras a las cajas para que pesen más).
      // (el `> 1` evita el ruido de decimales: 24,353.2 vs 24,353.0 no es un descuadre real)
      if (vac - rec > 1) {
        const d = vac - rec;
        const fila = { ...ref, dif: d, tipo: "sobra", rev };
        (yaVisto("sobra", d) ? acc[lote].vistos : acc[lote].malos).push(fila);
      }
      // 2) FALTA — el folio ya se dio por TERMINADO y aun así salió MENOS de lo que se recibió
      //    (descontando lo mermado): nos mandaron de menos. Solo cuenta al cerrar, porque mientras
      //    se está vaciando es normal que falte. `pisoAlCerrar` es justo ese hueco.
      if (estaTerminado(m)) {
        const falta = kgSobranteCierre(m);
        if (falta > toleranciaKg) {
          const fila = { ...ref, dif: falta, pct: rec > 0 ? (falta / rec) * 100 : 0, tipo: "falta", rev };
          (yaVisto("falta", falta) ? acc[lote].vistos : acc[lote].faltos).push(fila);
        }
      }
    });
    return Object.entries(acc).sort((a, b) => a[0].localeCompare(b[0]));
  })();
  // ── HISTORIAL DE AVISOS ── Todos los descuadres (pendientes Y ya revisados) en una sola lista.
  // Los revisados salen de la tabla de lotes para no dejar ruido, pero NO se pierden: aquí se
  // pueden volver a consultar, filtrar y exportar cuando haya que reclamarle a alguien.
  const avisosTodos = porLote.flatMap(([lote, v]) => [
    ...v.malos.map((f) => ({ ...f, lote, estado: "pendiente" })),
    ...v.faltos.map((f) => ({ ...f, lote, estado: "pendiente" })),
    ...v.vistos.map((f) => ({ ...f, lote, estado: "revisado" })),
  ]).sort((a, b) => (a.estado === b.estado ? b.dif - a.dif : a.estado === "pendiente" ? -1 : 1));
  const avisosPend = avisosTodos.filter((a) => a.estado === "pendiente").length;
  const avisosFiltrados = avisosTodos
    .filter((a) => avFiltro === "todos" || a.estado === avFiltro)
    .filter((a) => avTipo === "todos" || a.tipo === avTipo);
  const exportarAvisos = () => {
    const rows = avisosFiltrados.map((a) => ({
      Folio: a.folio, Fecha: a.fecha, Lote: a.lote, Tabla: a.tabla,
      Línea: a.linea, Chofer: a.chofer,
      Aviso: a.tipo === "falta" ? "Llegó de MENOS" : "Salió de MÁS",
      "Recibido (kg)": Math.round(a.rec), "Vaciado (kg)": Math.round(a.vac), "Mermado (kg)": Math.round(a.mer),
      "Diferencia (kg)": Math.round(a.dif), "% del recibido": a.rec > 0 ? Number(((a.dif / a.rec) * 100).toFixed(2)) : "",
      Estado: a.estado === "revisado" ? "Revisado" : "Pendiente",
      "Revisado por": a.rev?.por || "", "Fecha revisión": (a.rev?.ts || "").slice(0, 10),
    }));
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Folio: "(sin avisos)" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Avisos");
    XLSX.writeFile(wb, `empaque-avisos-${hoyISO()}.xlsx`);
  };

  const totMermaPct = (totKgVac + totKgMer) > 0 ? (totKgMer / (totKgVac + totKgMer)) * 100 : 0;
  // Lotes que tuvieron algún vaciado hoy (columnas del pivote "Vaciado por hora").
  const lotesHora = [...new Set(porHora.flatMap(([, v]) => Object.keys(v.lotes)))].sort();

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const INP_FILTRO = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const LBL = "text-xs text-gray-500 block mb-0.5";

  // ── Exportar a Excel ── Exporta la lista de la PESTAÑA ACTIVA, tal como se ve
  // (ya filtrada por búsqueda `q` y por el dropdown de Destino). Las columnas usan
  // los campos reales del movimiento según la pestaña. No truena si no hay filas.
  const exportarExcel = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const NOMBRE_TAB = { pendientes: "Por_recibir", historial: "Historial_por_recibir", vaciado: "Vaciado_a_empaque", histVaciado: "Historial_vaciado", histMermado: "Historial_mermado" };
    const prodDe = (m) => (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(", ");
    let filas;
    if (tabRec === "pendientes" || tabRec === "historial") {
      filas = lista.map((m) => {
        const r = m.recepcion || {};
        const nMu = m.muestreos?.length || 0;
        const qciProm = nMu ? m.muestreos.reduce((a, mu) => a + calcQCI(mu), 0) / nMu : null;
        const base = {
          Folio: m.folio || "", Fecha: m.fecha || "", Remisión: m.remision || "",
          Rancho: m.rancho || "", Lote: m.lote || "", Tabla: m.departamento || "",
          Origen: m.origen || "", Destino: m.destino || "",
          Línea: m.linea || "", Chofer: m.chofer || "",
          Producto: prodDe(m),
          Parrillas: sumar(m.cargaItems, "parrillas") || "",
          Bultos: sumar(m.cargaItems, "bultos") || "",
          "Viaje/Zona": m.viaje || "",
          QCI: qciProm !== null ? Number(qciProm.toFixed(2)) : "",
        };
        if (tabRec === "historial") {
          return {
            ...base,
            Estado: r.estado === "recibido" ? "Recibido" : r.estado === "rechazado" ? "Rechazado" : "",
            Condición: r.estado === "recibido" ? (r.condicion === "con_novedad" ? "Con novedad" : "OK") : "",
            "Fecha llegada": r.fechaLlegada || "", "Hora llegada": r.horaLlegada || "",
            Responsable: r.responsable || "",
            "Parrillas recibidas": r.parrillasRecibidas || "", "Bultos recibidos": r.bultosRecibidos || "",
            "Peso recibido (kg)": r.pesoRecibido || "",
            "Neto (kg)": r.estado === "recibido" ? Math.round(kgRecibidosDe(m)) : "",
            "Cliente directo": r.clienteDirecto ? "Sí" : "",
            Observaciones: r.observaciones || r.comentario || "",
          };
        }
        return { ...base, "Peso báscula (kg)": m.pesoBascula || "" };
      });
    } else {
      // vaciado / histVaciado / histMermado → usan la lista visible `filasVac`
      filas = filasVac.map((m) => {
        const motivos = (m.vaciado?.mermas || []).map((e) => e.motivo).filter(Boolean).join(", ");
        return {
          "Folio/Remisión": m.remision || m.folio || "",
          Folio: m.folio || "", Remisión: m.remision || "",
          Lote: loteDe(m), Rancho: m.rancho || "", Tabla: m.departamento || "",
          Origen: m.origen || "", Destino: m.destino || "",
          Producto: prodDe(m),
          "Recibido (kg)": Math.round(kgRecibidosDe(m)),
          "Vaciado a empaque (kg)": Math.round(kgVaciadosDe(m)),
          "Mermado (kg)": Math.round(kgMermadosDe(m)),
          "En piso (kg)": Math.round(kgEnPisoDe(m)),
          ...(tabRec === "histMermado" ? { "Motivos de merma": motivos } : {}),
        };
      });
    }
    if (filas.length === 0) { dlg.alerta({ title: "Sin datos", message: "No hay fletes para exportar en esta pestaña con los filtros actuales." }); return; }
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Empaque");
    XLSX.writeFile(wb, `Empaque_${NOMBRE_TAB[tabRec] || tabRec}_${hoy}.xlsx`);
  };

  // Dropdown de inspector con catálogo compartido (mismo que Aprobación de Calidad).
  // Incluye opción para agregar uno nuevo al vuelo.
  const selectorInspector = (value, onSet) => (
    <SearchSelect className={INP} value={value} placeholder="— Inspector —"
      onChange={async (v) => {
        if (v === "__nuevo__") {
          const nombre = ((await dlg.prompt({ title: "Nuevo inspector", message: "Nombre del inspector:" })) || "").trim();
          if (nombre) { if (!inspectoresCalidad.includes(nombre)) setInspectoresCalidad((p) => [...p, nombre]); onSet(nombre); }
          return;
        }
        onSet(v);
      }}
      options={[...inspectoresCalidad.map((i) => ({ value: i, label: i })), { value: "__nuevo__", label: "+ Agregar inspector…" }]} />
  );

  // Compara declarado vs recibido para resaltar diferencias en la ficha
  const declaradoVsRecibido = (m, f) => {
    const par = sumar(m.cargaItems, "parrillas");
    const bul = sumar(m.cargaItems, "bultos");
    const peso = parseFloat(m.pesoBascula) || 0;
    return [
      { l: "Parrillas", sal: par || 0, lle: parseFloat(f.parrillasRecibidas) || 0 },
      { l: "Bultos", sal: bul || 0, lle: parseFloat(f.bultosRecibidos) || 0 },
      { l: "Peso (kg)", sal: peso || 0, lle: parseFloat(f.pesoRecibido) || 0 },
    ];
  };

  // Indicador de arriba. `dot` pinta el mismo código de color que se usa en todo el módulo, y al
  // hacer clic lleva a la pestaña donde están esos fletes (si aplica).
  const stat = (l, v, c, dot, tab) => {
    const clic = tab ? { onClick: () => setTabRec(tab), role: "button", tabIndex: 0, title: `Ver ${l.toLowerCase()}` } : {};
    return (
      <div {...clic} className={`bg-white border border-gray-200 rounded-xl px-3 py-2.5 ${tab ? "cursor-pointer hover:border-indigo-300 hover:shadow-sm transition" : ""}`}>
        <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1.5">{dot && <span className={`w-2 h-2 rounded-full ${dot}`}></span>}{l}</div>
        <div className={`text-xl font-semibold ${c}`}>{v}</div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2 gap-y-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Empaque</h1>
          <p className="text-sm text-gray-500 mt-0.5">Confirmación de llegada de los fletes que salieron de campo</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">EM</div>
          <span className="text-sm font-medium text-gray-700">Empaque</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {stat("Total fletes", movimientos.length, "text-gray-900", "bg-gray-400")}
        {stat("Recibidos", pendientes.length, "text-orange-600", "bg-orange-500", "pendientes")}
        {stat("Recibidos", recibidos.length, "text-green-700", "bg-green-500", "historial")}
        {stat("Rechazados", rechazados.length, "text-red-600", "bg-red-500", "historial")}
        {stat("Con novedad", conNovedad.length, "text-amber-600", "bg-amber-500", "historial")}
      </div>

      {/* ── LÍNEA DE CORTE SAP (solo encargada/admin) ── Folios anteriores = HISTÓRICO: se ven y se
          pueden vaciar, pero la app NUNCA los manda a SAP (ese periodo ya se registró a mano). ── */}
      {puedeAprobar && (
        <div className="mb-3 flex items-start gap-2 flex-wrap text-[11px] bg-indigo-50/60 border border-indigo-200 rounded-lg px-3 py-2">
          <span className="inline-flex items-center gap-1 font-semibold text-indigo-800 whitespace-nowrap"><Ban size={13} /> Línea de corte SAP:</span>
          <input type="date" value={goLiveSAP}
            onChange={(e) => setConfigEmpaque({ ...(configEmpaque || {}), goLiveSAP: e.target.value })}
            className="text-xs px-2 py-1 border border-indigo-200 rounded-md bg-white focus:outline-none focus:border-indigo-400" />
          {goLiveSAP ? (
            <>
              <span className="text-indigo-700 flex-1 min-w-[240px]">Los folios <b>anteriores</b> a esta fecha son <b>históricos</b>: se ven y se pueden vaciar normal, pero la app <b>NO</b> los manda a SAP (ya se registraron por fuera).</span>
              <button onClick={() => setConfigEmpaque({ ...(configEmpaque || {}), goLiveSAP: "" })} className="text-indigo-600 hover:text-indigo-800 underline whitespace-nowrap">quitar corte</button>
            </>
          ) : (
            <span className="text-gray-500 flex-1 min-w-[240px]">Sin corte: <b>todos</b> los folios pueden mandarse a SAP. Pon aquí la fecha desde la que la app empieza a registrar en SAP.</span>
          )}
          <span className="w-full border-t border-indigo-100 pt-1.5 flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-indigo-800 whitespace-nowrap">Tolerancia al cerrar:</span>
            <input type="number" min="0" step="1" value={configEmpaque?.toleranciaKg ?? ""}
              onChange={(e) => setConfigEmpaque({ ...(configEmpaque || {}), toleranciaKg: e.target.value })}
              placeholder="0" className="w-20 text-xs px-2 py-1 border border-indigo-200 rounded-md bg-white text-right focus:outline-none focus:border-indigo-400" />
            <span className="text-indigo-700">kg</span>
            <span className="text-gray-500 flex-1 min-w-[240px]">
              Al dar <b>Terminado</b>, si salió <b>menos</b> de lo recibido por más de estos kg, el folio se marca para <b>revisar</b> (llegó de menos). Con <b>0</b> se marca cualquier faltante.
            </span>
          </span>
          <span className="w-full border-t border-indigo-100 pt-1.5 flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-indigo-800 whitespace-nowrap">1 bin equivale a:</span>
            <input type="number" min="1" step="1" value={configEmpaque?.kgPorBin ?? ""}
              onChange={(e) => setConfigEmpaque({ ...(configEmpaque || {}), kgPorBin: e.target.value })}
              placeholder="260" className="w-20 text-xs px-2 py-1 border border-indigo-200 rounded-md bg-white text-right focus:outline-none focus:border-indigo-400" />
            <span className="text-indigo-700">kg netos</span>
            <span className="text-gray-500 flex-1 min-w-[240px]">
              El reporte de <b>Vaciado por hora</b> (el que ven los jefes) cuenta los <b>bins</b> vaciados: cada {kgPorBin} kg netos = 1 bin.
            </span>
          </span>
        </div>
      )}

      {(tabRec === "vaciado" || tabRec === "histVaciado" || tabRec === "histMermado") && (
        <div className="mb-3 space-y-4">
          {/* Selector de día del reporte */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500"><Calendar size={14} /> Reporte del día:</span>
            <input type="date" value={diaReporte} onChange={(e) => setDiaReporte(e.target.value)}
              className="text-xs px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400" />
            {diaReporte !== hoyISO() && <button onClick={() => setDiaReporte(hoyISO())} className="text-[11px] text-indigo-600 hover:text-indigo-800 underline">hoy</button>}
            <span className="text-[10px] text-gray-400">· Vaciado/Mermado son del día elegido; En piso es inventario actual.</span>
          </div>

          {/* Resumen del día */}
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Resumen del día (kg)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ["Vaciado a empaque (día)", totKgVacDia, "text-green-700", "border-green-200", "bg-green-500"],
                ["Mermado (día)", totKgMerDia, "text-red-700", "border-red-200", "bg-red-400"],
                ["En piso (inventario actual)", totKgPiso, "text-amber-700", "border-amber-200", "bg-amber-500"],
                ["Recibido (total)", totKgRec, "text-gray-900", "border-gray-200", "bg-gray-400"],
              ].map(([l, k, c, bd, dot]) => (
                <div key={l} className={`bg-white border rounded-xl px-3 py-2.5 text-center ${bd}`}>
                  <div className="text-[10px] text-gray-500 mb-1 inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${dot}`}></span>{l}</div>
                  <div className={`text-xl font-bold ${c}`}>{fmt(k)} <span className="text-xs font-medium">kg</span></div>
                  <div className="text-[10px] text-gray-400">≈ {Math.round(binsDe(k)).toLocaleString()} bins · ≈ {cubetasDe(k).toLocaleString()} cubetas</div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventario y merma por lote */}
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div className="text-[10px] font-semibold text-gray-400 uppercase">Inventario por lote (kg) <span className="text-gray-300 normal-case">· piso = recibido − vaciado − merma</span></div>
              {avisosTodos.length > 0 && (
                <button onClick={() => setAvisosAbierto(true)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 border ${avisosPend > 0
                    ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}>
                  <AlertTriangle size={13} /> Historial de avisos ({avisosTodos.length}){avisosPend > 0 ? ` · ${avisosPend} sin revisar` : ""}
                </button>
              )}
            </div>
            {porLote.length === 0 ? (
              <div className="text-xs text-gray-400 italic py-2">Aún no hay recibidos hoy.</div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: "620px" }}>
                  <thead>
                    <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="text-left px-3 py-2 font-semibold">Lote</th>
                      <th className="text-right px-3 py-2 font-semibold">Recibido</th>
                      <th className="text-right px-3 py-2 font-semibold">Vaciado</th>
                      <th className="text-right px-3 py-2 font-semibold">Mermado</th>
                      <th className="text-right px-3 py-2 font-semibold">% merma</th>
                      <th className="text-right px-3 py-2 font-semibold">En piso</th>
                      <th className="text-left px-3 py-2 font-semibold w-40">Avance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porLote.map(([lote, v]) => {
                      const disp = v.vac + v.mer;
                      const pct = disp > 0 ? (v.mer / disp) * 100 : 0;
                      const nMal = v.malos.length, nFal = v.faltos.length, nVis = v.vistos.length;
                      const pend = nMal + nFal;                 // descuadres que NADIE ha revisado
                      // La tabla solo enseña lo PENDIENTE. Lo ya revisado se consulta en el
                      // "Historial de avisos" (botón arriba), para no dejar ruido acumulado aquí.
                      const malo = pend > 0;
                      const abierto = loteAbierto === lote;
                      return (
                        <Fragment key={lote}>
                          <tr className="border-b border-gray-50 last:border-0">
                            <td className="px-3 py-1.5 font-semibold text-gray-700">{lote}
                              {malo && (
                                <button onClick={() => setLoteAbierto(abierto ? null : lote)}
                                  title={pend > 0
                                    ? "Ver los folios descuadrados: salió de más (peso inflado / doble captura) o salió de menos al cerrar (llegó de menos)"
                                    : "Todos los descuadres de este lote ya se revisaron; aquí puedes consultarlos"}
                                  className={`ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full align-middle border ${pend > 0
                                    ? "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
                                    : "text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100"}`}>
                                  {pend > 0
                                    ? <><AlertTriangle size={10} /> revisar ({pend})</>
                                    : <><Check size={10} className="text-green-600" /> revisados ({nVis})</>} {abierto ? "▾" : "▸"}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-700">{fmt(v.rec)}</td>
                            <td className="px-3 py-1.5 text-right text-green-700">{fmt(v.vac)}</td>
                            <td className="px-3 py-1.5 text-right text-red-700">{fmt(v.mer)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-600">{pct ? pct.toFixed(0) + "%" : "—"}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-amber-700">{fmt(v.piso)}</td>
                            {/* Barra de avance del lote: mismo lenguaje de colores que la tarjeta del folio. */}
                            <td className="px-3 py-1.5">
                              {(() => {
                                const bse = Math.max(1, v.rec, v.vac + v.mer);
                                const an = (x) => `${Math.max(0, Math.min(100, (x / bse) * 100))}%`;
                                return (
                                  <div title={`Vaciado ${fmt(v.vac)} · mermado ${fmt(v.mer)} · en piso ${fmt(v.piso)} kg`}
                                    className="h-2 rounded-full bg-gray-200 overflow-hidden flex min-w-[80px]">
                                    <span className="h-full bg-green-500" style={{ width: an(v.vac) }}></span>
                                    <span className="h-full bg-red-400" style={{ width: an(v.mer) }}></span>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                          {malo && abierto && (
                            <tr className="bg-amber-50/50 border-b border-amber-100">
                              <td colSpan={7} className="px-3 py-2 space-y-3">
                                {/* SALIÓ DE MÁS: doble captura o peso inflado (piedras en las cajas). */}
                                {nMal > 0 && (
                                  <div>
                                    <div className="text-[11px] text-amber-800 mb-1.5">
                                      {/* Se suma lo que sobra FOLIO POR FOLIO: el total del lote puede
                                          quedar en negativo si otros folios salieron de menos. */}
                                      <b>Salió de MÁS ({nMal}):</b> en <b>{lote}</b> sobran <b>{fmt(v.malos.reduce((a, f) => a + f.dif, 0))} kg</b> repartidos en estos folios.
                                      Revisa si el ejote se capturó <b>dos veces</b>, si el <b>Recibido</b> quedó de menos,
                                      o si la carga venía con <b>peso inflado</b> (piedras u otro material en las cajas).
                                    </div>
                                    <div className="space-y-1">
                                      {[...v.malos].sort((a, b) => b.dif - a.dif).map((f) => (
                                        <div key={f.id} className="flex items-center justify-between gap-2 text-[11px] bg-white border border-amber-200 rounded px-2 py-1 flex-wrap">
                                          <span className="font-semibold text-gray-800">Folio {f.folio}</span>
                                          <span className="text-gray-600 flex items-center gap-2 flex-wrap">
                                            recibido <b className="text-gray-800">{fmt(f.rec)}</b> · vaciado <b className="text-green-700">{fmt(f.vac)}</b> · <b className="text-amber-700">sobra {fmt(f.dif)} kg</b>
                                            <button onClick={() => marcarRevisado(f)} title="Ya lo revisé: quitarlo de esta lista" className="inline-flex items-center gap-1 px-2 py-0.5 border border-gray-300 text-gray-600 rounded-full hover:bg-gray-50"><Check size={11} /> ya lo revisé</button>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* LLEGÓ DE MENOS: folio ya cerrado que no alcanzó el peso que se recibió. */}
                                {nFal > 0 && (
                                  <div>
                                    <div className="text-[11px] text-red-800 mb-1.5">
                                      <b>Llegó de MENOS ({nFal}):</b> estos folios ya se dieron por <b>Terminado</b> y aun así salió
                                      menos ejote del que se recibió (ya descontando lo mermado). Es lo que hay que reclamar:
                                      <b> nos mandaron menos de lo que dice el manifiesto</b>.
                                      {toleranciaKg > 0 && <> Se ignoran diferencias de hasta <b>{fmt(toleranciaKg)} kg</b>.</>}
                                    </div>
                                    <div className="space-y-1">
                                      {[...v.faltos].sort((a, b) => b.dif - a.dif).map((f) => (
                                        <div key={f.id} className="flex items-center justify-between gap-2 text-[11px] bg-white border border-red-200 rounded px-2 py-1 flex-wrap">
                                          <span className="font-semibold text-gray-800">Folio {f.folio}</span>
                                          <span className="text-gray-600 flex items-center gap-2 flex-wrap">
                                            recibido <b className="text-gray-800">{fmt(f.rec)}</b> · vaciado <b className="text-green-700">{fmt(f.vac)}</b>
                                            {f.mer > 0 ? <> · mermado <b className="text-red-600">{fmt(f.mer)}</b></> : null}
                                            {" · "}<b className="text-red-700">faltaron {fmt(f.dif)} kg ({f.pct.toFixed(1)}%)</b>
                                            <button onClick={() => marcarRevisado(f)} title="Ya lo revisé: quitarlo de esta lista" className="inline-flex items-center gap-1 px-2 py-0.5 border border-gray-300 text-gray-600 rounded-full hover:bg-gray-50"><Check size={11} /> ya lo revisé</button>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {v.vistos.length > 0 && (
                                  <div className="text-[11px] text-gray-400">
                                    {v.vistos.length} aviso{v.vistos.length > 1 ? "s" : ""} de este lote ya se revisó; míralo en el <b>Historial de avisos</b> (arriba).
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    <tr className="bg-gray-50 font-semibold text-gray-800 border-t-2 border-gray-200">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{fmt(totKgRec)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmt(totKgVac)}</td>
                      <td className="px-3 py-2 text-right text-red-700">{fmt(totKgMer)}</td>
                      <td className="px-3 py-2 text-right">{totMermaPct ? totMermaPct.toFixed(0) + "%" : "—"}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{fmt(totKgPiso)}</td>
                      <td className="px-3 py-2 text-[10px] font-normal text-gray-400">
                        <span className="inline-flex items-center gap-1 mr-2"><span className="w-2 h-2 rounded-full bg-green-500"></span>vaciado</span>
                        <span className="inline-flex items-center gap-1 mr-2"><span className="w-2 h-2 rounded-full bg-red-400"></span>merma</span>
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300"></span>piso</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Aviso: vaciado VIEJO sin fecha (no se puede ubicar en un día) */}
          {kgVacSinFecha > 0 && (
            <div className="mb-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>Hay <b>{fmt(kgVacSinFecha)} kg</b> de vaciado <b>sin fecha</b> (registros viejos): no se muestran en ningún
                día, pero <b>sí cuentan</b> en el inventario por lote y en el "en piso".</span>
            </div>
          )}

          {/* Vaciado por hora y lote — medido en BINS (kg netos ÷ kgPorBin). Es lo que ven los jefes. */}
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div className="text-[10px] font-semibold text-gray-400 uppercase">Vaciado por hora <span className="text-gray-300 normal-case">· del día seleccionado · <b>bins = kg netos ÷ {kgPorBin}</b></span></div>
              {porHora.length > 0 && (() => {
                const args = { dia: diaReporte, porHora, lotesHora, kgPorBin, totKgVacDia, binsRecibidosPorLote, mermaPorHora };
                return (
                  <div className="flex items-center gap-2">
                    <button onClick={() => generarExcelVaciadoHora(args)}
                      className="text-[11px] bg-green-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-green-700 inline-flex items-center gap-1"><FileText size={13} /> Excel</button>
                    <button onClick={() => generarPDFVaciadoHora(args)}
                      className="text-[11px] bg-red-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-red-700 inline-flex items-center gap-1"><FileText size={13} /> PDF</button>
                  </div>
                );
              })()}
            </div>
            {porHora.length === 0 ? (
              <div className="text-xs text-gray-400 italic py-2">No hay vaciados registrados el día seleccionado.</div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: `${470 + lotesHora.length * 90}px` }}>
                  <thead>
                    <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="text-left px-3 py-2 font-semibold">Hora</th>
                      {lotesHora.map((lote) => (
                        <th key={lote} className="text-right px-3 py-2 font-semibold whitespace-nowrap normal-case">{lote} <span className="text-gray-300 font-normal">(kg)</span></th>
                      ))}
                      <th className="text-right px-3 py-2 font-semibold bg-gray-100">Total (kg)</th>
                      <th className="text-right px-3 py-2 font-bold bg-indigo-50 text-indigo-600 whitespace-nowrap">Bins</th>
                      <th className="text-left px-3 py-2 font-semibold w-28">Ritmo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => { const maxH = Math.max(1, ...porHora.map(([, v]) => v.kg)); return porHora.map(([h, v]) => (
                      <tr key={h} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">{h}:00 – {String(Number(h) + 1).padStart(2, "0")}:00</td>
                        {lotesHora.map((lote) => (
                          <td key={lote} className="px-3 py-1.5 text-right text-gray-700">{v.lotes[lote] ? fmt(v.lotes[lote]) : <span className="text-gray-300">—</span>}</td>
                        ))}
                        <td className="px-3 py-1.5 text-right font-semibold text-gray-800 bg-gray-50">{fmt(v.kg)}</td>
                        <td className="px-3 py-1.5 text-right font-bold text-indigo-700 bg-indigo-50/50">{Math.round(binsDe(v.kg)).toLocaleString()}</td>
                        {/* Ritmo: qué tan cargada estuvo esa hora contra la hora más fuerte del día. */}
                        <td className="px-3 py-1.5">
                          <div title={`${fmt(v.kg)} kg — ${Math.round((v.kg / maxH) * 100)}% de la hora más fuerte`} className="h-2 rounded-full bg-gray-200 overflow-hidden min-w-[60px]">
                            <div className={`h-full rounded-full ${v.kg >= maxH ? "bg-indigo-600" : "bg-indigo-400"}`} style={{ width: `${Math.max(4, (v.kg / maxH) * 100)}%` }}></div>
                          </div>
                        </td>
                      </tr>
                    )); })()}
                    <tr className="bg-gray-100 font-semibold text-gray-800">
                      <td className="px-3 py-1.5">Total (kg)</td>
                      {lotesHora.map((lote) => {
                        const t = porHora.reduce((a, [, v]) => a + (v.lotes[lote] || 0), 0);
                        return <td key={lote} className="px-3 py-1.5 text-right">{fmt(t)}</td>;
                      })}
                      <td className="px-3 py-1.5 text-right">{fmt(totKgVacDia)}</td>
                      <td className="px-3 py-1.5 text-right text-indigo-700 bg-indigo-100/60">{Math.round(binsDe(totKgVacDia)).toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-[10px] font-normal text-gray-400">hora más fuerte</td>
                    </tr>
                    <tr className="bg-gray-50 text-gray-500 text-[10px]">
                      <td className="px-3 py-1">Bins por lote (kg ÷ {kgPorBin})</td>
                      {lotesHora.map((lote) => {
                        const t = porHora.reduce((a, [, v]) => a + (v.lotes[lote] || 0), 0);
                        return <td key={lote} className="px-3 py-1 text-right">{Math.round(binsDe(t)).toLocaleString()}</td>;
                      })}
                      <td className="px-3 py-1 text-right font-semibold text-gray-700">{Math.round(binsDe(totKgVacDia)).toLocaleString()}</td>
                      <td className="px-3 py-1 text-right text-indigo-400">bins</td>
                      <td className="px-3 py-1"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <AvisoSAP>Al dar recepción se generará en SAP una <b>orden de producción</b> (materia prima) y una <b>orden de compra</b> (flete).</AvisoSAP>

      <ColaTabs tab={tabRec} setTab={setTabRec} tabs={[
        { key: "pendientes", label: "Recibidos", count: pendientes.length },
        { key: "vaciado", label: "Vaciado a Empaque", count: enPisoLista.length },
        // OCULTO (no se usa por ahora): pestaña "Cliente Directo". La lógica y los datos siguen
        // intactos; solo se quita el botón. Para reactivarla, descomenta esta línea:
        // { key: "clienteDirecto", label: "Cliente Directo", count: clienteDirectoList.length },
        { key: "historial", label: "Historial de recibidos", count: historialArr.length },
        { key: "histVaciado", label: "Historial Vaciado a Empaque", count: vaciadosHist.length },
        { key: "histMermado", label: "Historial Mermado (No entró a Empaque)", count: mermadosHist.length },
      ]} />

      {tabRec === "vaciado" || tabRec === "histVaciado" || tabRec === "histMermado" ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-sm font-semibold text-gray-900">
                {tabRec === "histVaciado"
                  ? `Vaciados completos (${filasVac.length})`
                  : tabRec === "histMermado"
                    ? `Mermados — no entraron a empaque (${filasVac.length})`
                    : `En piso para vaciar a producción (${filasVac.length})`}
              </span>
              <span className="text-xs text-gray-400 ml-2">
                {tabRec === "histVaciado"
                  ? "· folios cerrados con el botón \"Terminado\" (los kg en 0 NO cierran solos)"
                  : tabRec === "histMermado"
                    ? "· folios cerrados con kg que NO entraron a empaque"
                    : "· captura los kg recibidos; vacía a empaque o marca merma (no entró)"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, remisión, lote, producto…"
                className="w-full sm:w-56 min-w-0 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              <div className="w-full sm:w-44 min-w-0"><SearchSelect className={INP_FILTRO} value={fDestino} onChange={setFDestino} placeholder="Destino: todos"
                options={[{ value: "", label: "Destino: todos" }, ...destinosMov.map((d) => ({ value: d, label: d }))]} /></div>
              {(fDestino || q) && <button onClick={() => { setFDestino(""); setQ(""); }} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 whitespace-nowrap">Limpiar filtros</button>}
              <button onClick={exportarExcel} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 inline-flex items-center gap-1 whitespace-nowrap"><FileText size={14} /> Excel{(fDestino || q) ? " (filtrado)" : ""}</button>
              {tabRec === "histMermado" && (
                <button onClick={abrirRezaga} className="inline-flex items-center gap-1 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-red-700 whitespace-nowrap"><Plus size={14} /> Registrar rezaga</button>
              )}
            </div>
          </div>
          {filasVac.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8 italic">
              {tabRec === "histVaciado"
                ? "Aún no hay manifiestos vaciados por completo. Cuando un flete llega a 0 en piso aparece aquí."
                : tabRec === "histMermado"
                  ? "Aún no hay mermas. Cuando marques kg que no entraron a empaque aparecen aquí."
                  : "No hay fletes en piso por vaciar. Al dar recepción pasan aquí para vaciarlos a producción."}
            </div>
          ) : (
            <div className="p-3 space-y-3 bg-gray-50/70">
              {/* UNA TARJETA POR FOLIO (diseño aprobado): el mismo dato de siempre, pero contado
                  como una historia — Recibido → Vaciado → En piso → Enviado a SAP. */}
                  {filasVac.map((m) => {
                    const recK = kgRecibidosDe(m);
                    const pisoK = kgEnPisoDe(m);
                    const vacK = kgVaciadosDe(m);
                    const merK = kgMermadosDe(m);
                    const ev = m.vaciado?.eventos || [];
                    const mer = m.vaciado?.mermas || [];
                    // Desglose del vaciado: por hora + faltantes, y cuánto de eso ya está en SAP.
                    const horasM = m.vaciado?.horas || [];
                    const ajustesM = m.vaciado?.ajustes || [];
                    const cubSAP = cubetasEnviadasSAP(m);
                    const pendKg = kgPendienteSAP(m);
                    const prod = (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(", ") || "—";
                    const completo = recK > 0 && pisoK === 0;  // kg manda
                    const rcp = m.recepcion || {};
                    const des = destareDe(m); // desglose de destare (ejote)
                    // kg recibido a mostrar en el input: lo capturado, o el ejote neto (si hay
                    // destare), o el peso de la recepción.
                    // El número grande de RECIBIDO muestra SIEMPRE lo que de verdad se usa (kgRecibidosDe):
                    // ejote neto si hay destare, o bruto − trailer si es provisional. Así cuadra con el
                    // "en piso" de abajo (antes mostraba el bruto pelón y no coincidía).
                    const kgRecVal = (m.vaciado && "kgRecibidos" in m.vaciado)
                      ? m.vaciado.kgRecibidos
                      : (rcp.destareAplicar ? (des.neto || "") : (Math.round(kgRecibidosDe(m)) || ""));
                    // Barra de flujo (mismos helpers, solo lectura).
                    const enviadoKg = Math.min(kgEnviadosSAP(m), vacK);
                    const sinEnviarKg = Math.max(0, vacK - enviadoKg);
                    const base = Math.max(1, recK, vacK + merK);
                    const anch = (v) => `${Math.max(0, Math.min(100, (v / base) * 100))}%`;
                    const hayPend = tienePendienteSAP(m);
                    const term = m.vaciado?.terminado;
                    // Ya no queda nada en piso pero NADIE lo ha cerrado: puede que falte aprobar
                    // horas o mandarlas a SAP. Se avisa en vez de archivarlo solo.
                    const listoParaCerrar = !term && recK > 0 && pisoK === 0;
                    const estado = term ? { t: "Terminado", c: "bg-green-50 text-green-700 border-green-200", i: <Check size={13} /> }
                      : listoParaCerrar ? { t: pendKg > 0 ? "Falta mandarlo a SAP" : "Listo para cerrar", c: "bg-indigo-50 text-indigo-700 border-indigo-200", i: <Check size={13} /> }
                      : esHist(m) ? { t: "Histórico — no va a SAP", c: "bg-gray-100 text-gray-500 border-gray-300", i: <Ban size={13} /> }
                        : hayPend ? { t: "Pendiente de confirmar", c: "bg-amber-50 text-amber-700 border-amber-300", i: <Clock size={13} /> }
                          : usaHoras(m) ? { t: "Vaciando por hora", c: "bg-blue-50 text-blue-700 border-blue-200", i: <Clock size={13} /> }
                            : { t: "Sin vaciar", c: "bg-gray-50 text-gray-500 border-gray-200", i: null };
                    const paso = (etiqueta, cuerpo, sub, color) => (
                      <div className="px-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold truncate">{etiqueta}</div>
                        <div className={`text-lg font-bold leading-tight ${color || "text-gray-800"}`}>{cuerpo}</div>
                        <div className="text-[10px] text-gray-500 truncate">{sub}</div>
                      </div>
                    );
                    const flecha = <div className="hidden lg:grid place-items-center text-gray-300"><ArrowRight size={16} /></div>;
                    return (
                      <div key={m.id} className={`bg-white border rounded-xl overflow-hidden shadow-sm ${completo ? "border-green-200" : hayPend ? "border-amber-300" : "border-gray-200"}`}>
                        {/* Encabezado: quién es este folio */}
                        <div className="px-4 py-2.5 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-base font-bold text-red-600">{m.remision || m.folio || "—"}</span>
                              <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">lote {loteDe(m)}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              <b className="text-gray-700">{prod}</b>
                              {m.origen || m.destino ? <> · {m.origen || "—"} → {m.destino || "—"}</> : null}
                              {m.chofer ? <> · {m.chofer}</> : null}
                            </div>
                            {/* A qué orden de fabricación va a caer (visible sin abrir nada) */}
                            <div className="mt-1">{lineaOrdenSAP(m)}</div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {/* PROVISIONAL: el recibido aún no es el ejote neto exacto (falta trailer o destare). */}
                            {recibidoProvisional(m) && (
                              <span title="El recibido todavía no es el ejote neto exacto — falta el peso del trailer o el destare. El vaciado por hora no se afecta." className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap bg-amber-50 text-amber-700 border-amber-300"><AlertTriangle size={13} /> {faltaPesoTrailer(m) ? "Falta peso del trailer" : "Recibido provisional"}</span>
                            )}
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${estado.c}`}>{estado.i}{estado.t}</span>
                          </div>
                        </div>

                        {/* Barra de flujo: el estado del folio de un vistazo */}
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <div className="grid grid-cols-2 gap-y-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:gap-y-0 items-center">
                            {paso("Recibido",
                              <span className="inline-flex items-center gap-1">
                                {/* CONGELADO si ya se mandó algo a SAP: subir el recibido después
                                    fabricaría un "faltante" mandable ENCIMA de lo ya reportado. */}
                                <input type="number" disabled={tieneEnvioSAP(m)}
                                  title={tieneEnvioSAP(m) ? "Este folio ya tiene envíos a SAP: el recibido queda congelado para que nadie pueda inflar el faltante después de haber reportado." : undefined}
                                  className="w-24 text-right text-base font-bold px-2 py-0.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                  value={kgRecVal} onChange={(e) => setRecibido(m.id, "kgRecibidos", e.target.value)} placeholder="kg" />
                                <span className="text-[11px] font-semibold text-gray-400">kg</span>
                              </span>,
                              <span className="inline-flex items-center gap-1">
                                {rcp.destareAplicar
                                  ? <>bruto {fmt(des.bruto)} − material {fmt(des.taraTotal)} = <b className={des.bruto > 0 && des.taraTotal >= des.bruto ? "text-red-600" : "text-green-700"}>ejote {fmt(des.neto)}</b></>
                                  : (des.trailer > 0
                                      ? <>bruto {fmt(des.brutoBascula)} − trailer {fmt(des.trailer)} = {fmt(des.bruto)} <span className="text-amber-600">· falta destare</span></>
                                      : <>peso recepción: {fmt(des.brutoBascula)} kg <span className="text-amber-600">· falta trailer y destare</span></>)}
                                {/* Bins RECIBIDOS: conteo FÍSICO de bins que llegaron (para el reporte de jefes). */}
                                <span className="text-gray-400">· bins rec.</span>
                                <input type="number" min="0" value={m.vaciado?.binsRecibidos ?? ""} onChange={(e) => setRecibido(m.id, "binsRecibidos", e.target.value)} placeholder="—"
                                  title="Conteo físico de bins que llegaron en este folio (para el reporte por hora)"
                                  className="w-12 text-right text-[11px] px-1 py-0.5 border border-gray-200 rounded" />
                              </span>)}
                            {flecha}
                            {paso("Vaciado", <>{fmt(vacK)} <span className="text-[11px] font-semibold text-gray-400">kg</span></>, `≈ ${cubetasDe(vacK).toLocaleString()} cub`)}
                            {flecha}
                            {paso("En piso (falta)", <>{fmt(pisoK)} <span className="text-[11px] font-semibold text-gray-400">kg</span></>, `≈ ${cubetasDe(pisoK).toLocaleString()} cub`, completo ? "text-green-700" : "text-amber-600")}
                            {flecha}
                            {paso("Enviado a SAP", <>{cubSAP.toLocaleString()} <span className="text-[11px] font-semibold text-gray-400">cub</span></>,
                              pendKg > 0 ? `faltan ${cubetasDe(pendKg).toLocaleString()} cub` : (cubSAP > 0 ? "todo enviado" : "—"), "text-green-700")}
                          </div>
                          {des.bruto > 0 && des.taraTotal >= des.bruto && rcp.destareAplicar && (
                            <div className="text-[10px] text-red-600 font-semibold mt-1">⚠️ la tara supera al bruto — revisa la recepción</div>
                          )}
                          <div className="h-2 rounded-full bg-gray-200 overflow-hidden flex mt-3">
                            <span className="h-full bg-green-500" style={{ width: anch(enviadoKg) }}></span>
                            <span className="h-full bg-blue-500" style={{ width: anch(sinEnviarKg) }}></span>
                            <span className="h-full bg-red-300" style={{ width: anch(merK) }}></span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] text-gray-500">
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> En SAP {fmt(enviadoKg)} kg</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Vaciado sin enviar {fmt(sinEnviarKg)} kg</span>
                            {merK > 0 && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-300"></span> Mermado {fmt(merK)} kg</span>}
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300"></span> En piso {fmt(pisoK)} kg</span>
                          </div>
                        </div>

                        {/* Detalle: de dónde salen esos kg */}
                        <div className="px-4 py-3 grid md:grid-cols-2 gap-x-6 gap-y-3">
                        <div className="text-xs text-gray-600 min-w-0">
                          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Vaciado a empaque</div>
                          {vacK > 0 ? (
                            <div>
                              <span className="font-semibold text-green-700">{fmt(vacK)} kg</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {ev.map((e, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                                    {e.fecha ? `${e.fecha} ` : ""}{e.hora} · {fmt(e.kg)} kg
                                    <button onClick={() => cancelarVaciado(m.id, i)} title="Cancelar este vaciado (regresa al piso)" className="text-red-400 hover:text-red-600 font-bold leading-none text-xs">×</button>
                                  </span>
                                ))}
                              </div>

                              {/* Desglose POR HORA (con su estado en SAP) */}
                              {horasM.length > 0 && (
                                <div className="mt-1.5">
                                  <div className="text-[10px] text-gray-500 inline-flex items-center gap-1"><Clock size={11} /> Por hora: <b className="text-gray-700">{horasM.length} h · {fmt(kgHorasDe(m))} kg</b></div>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {horasM.map((h) => {
                                      const nk = netoHora(h);
                                      const cls = h.sapEnvio ? "bg-green-50 text-green-700 border-green-200"
                                        : h.estado === "abierta" ? "bg-blue-50 text-blue-600 border-blue-200"
                                        : "bg-amber-50 text-amber-700 border-amber-200";
                                      const est = h.sapEnvio ? `SAP #${h.sapEnvio.docNum}` : h.estado === "abierta" ? "abierta" : (h.aprobacion ? "aprobada, sin enviar" : "falta aprobar");
                                      return (
                                        <span key={h.id} className={`inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border ${cls}`}>
                                          {h.etiqueta}: {fmt(nk)} kg · {cubetasDe(nk)} cub · {est}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Faltantes (ajustes) */}
                              {ajustesM.length > 0 && (
                                <div className="mt-1.5">
                                  <div className="text-[10px] text-gray-500">Faltante: <b className="text-gray-700">{fmt(kgAjustesDe(m))} kg</b></div>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {ajustesM.map((a) => (
                                      <span key={a.id} className={`inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border ${a.sapEnvio ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                        Faltante #{a.seq}: {fmt(a.kg)} kg · {cubetasDe(a.kg)} cub · {a.sapEnvio ? `SAP #${a.sapEnvio.docNum}` : (a.aprobacion ? "aprobado, sin enviar" : "falta aprobar")}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Progreso a SAP: cuánto se envió y cuánto falta */}
                              {/* El progreso a SAP ya se ve arriba, en el paso "Enviado a SAP" de la barra de flujo. */}
                            </div>
                          ) : <span className="text-gray-300">Todavía no se vacía nada.</span>}
                        </div>
                        <div className="text-xs text-gray-600 min-w-0">
                          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Mermado (no entró a empaque)</div>
                          {merK > 0 ? (
                            <div>
                              <span className="font-semibold text-red-700">{fmt(merK)} kg</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {mer.map((e, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 rounded px-1.5 py-0.5" title={[e.motivo, e.comentario, e.por ? `registró: ${e.por}` : ""].filter(Boolean).join(" — ")}>
                                    {e.fecha ? `${e.fecha} ` : ""}{e.hora} · {fmt(e.kg)} kg{e.motivo ? ` · ${e.motivo}` : ""}{e.por ? ` · ${e.por}` : ""}{e.comentario ? <MessageCircle size={14} className="ml-1" /> : ""}
                                    <button onClick={() => cancelarMerma(m.id, i)} title="Cancelar esta merma (regresa al piso)" className="text-red-400 hover:text-red-700 font-bold leading-none text-xs">×</button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : <span className="text-gray-300">Sin merma.</span>}
                        </div>
                        </div>

                        {/* Pie: la cuenta del piso + los botones */}
                        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                          <span className="text-[11px] text-gray-500">
                            {term
                              ? <span className="inline-flex items-center gap-1 flex-wrap"><Check size={14} className="text-green-600" /> <b className="text-green-700">Terminado por {term.por}</b> · {(term.ts || "").slice(0, 10)}{term.pisoAlCerrar > 0 ? <> · quedaron <b className="text-amber-700">{fmt(term.pisoAlCerrar)} kg</b> sin vaciar</> : " · cerró exacto"}</span>
                              : listoParaCerrar
                                ? <span className="inline-flex items-center gap-1 flex-wrap text-indigo-700">Ya no queda nada en piso.{pendKg > 0 ? <> Pero <b>faltan {cubetasDe(pendKg).toLocaleString()} cub ({fmt(pendKg)} kg)</b> por mandar a SAP.</> : <> Dale a <b>Terminado</b> para cerrarlo.</>}</span>
                                : recK > 0
                                  ? <>En piso: rec {fmt(recK)} − vac {fmt(vacK)}{merK ? ` − mer ${fmt(merK)}` : ""} = <b className="text-amber-700">{fmt(pisoK)} kg</b></>
                                  : <>Captura los kg recibidos para empezar.</>}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {term ? (<>
                              <button onClick={() => reabrirVaciado(m)} title={puedeAprobar ? "Reabrir el folio (vuelve a 'en piso')" : "Solo la encargada puede reabrir un folio terminado"}
                                className={`text-xs px-3 py-1.5 border rounded-lg font-medium whitespace-nowrap inline-flex items-center gap-1 ${puedeAprobar ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-gray-200 text-gray-300 cursor-not-allowed"}`}>
                                <RotateCcw size={14} /> Reabrir
                              </button>
                              <button onClick={() => devolverManifiesto(m.id)} title="Devolver a 'Vaciado a Empaque' (deshace vaciados y mermas)" className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg font-medium hover:bg-gray-50 whitespace-nowrap"><span className="inline-flex items-center gap-1"><RotateCcw size={14} /> Devolver</span></button>
                            </>) : recK > 0 && (!puedeEditarVaciado ? (
                              <span title="No tienes permiso para capturar el vaciado (empaque.vaciado.editar) — solo lectura" className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg font-medium cursor-not-allowed whitespace-nowrap inline-flex items-center justify-center gap-1"><Ban size={13} /> Solo lectura</span>
                            ) : (<>
                              {pisoK > 0 && (
                                <button onClick={() => abrirMermar(m)} className="inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 whitespace-nowrap"><AlertTriangle size={14} /> Mermar</button>
                              )}
                              {/* Cierre a mano: los kg en 0 NO cierran el folio; lo cierra una persona. */}
                              {vacK > 0 && (
                                <button onClick={() => terminarVaciado(m)} title="Dar por terminado el vaciado de este folio: se archiva y sale de la lista de trabajo"
                                  className={`inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap ${listoParaCerrar && pendKg === 0 ? "bg-green-600 text-white hover:bg-green-700" : "border border-green-400 text-green-700 hover:bg-green-50"}`}><Check size={14} /> Terminado</button>
                              )}
                              {/* Sigue disponible aunque el piso esté en 0: puede faltar aprobar horas o mandarlas a SAP. */}
                              {usoTotalSAP(m) ? (
                                <span title="Ya se mandó el TOTAL a SAP — no se puede vaciar por hora (evita doble conteo)" className="text-xs px-3 py-1.5 border border-gray-200 text-gray-300 rounded-lg font-medium cursor-not-allowed whitespace-nowrap inline-flex items-center justify-center gap-1"><Clock size={14} /> Vaciar por hora</span>
                              ) : (
                                <button onClick={() => abrirPanelHoras(m)} title="Vaciar por hora y mandar a SAP por hora (en cubetas)" className={`text-xs px-4 py-1.5 rounded-lg font-semibold whitespace-nowrap ${pendKg > 0 ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-indigo-300 text-indigo-700 hover:bg-indigo-50"}`}><span className="inline-flex items-center gap-1"><Clock size={14} /> Vaciar por hora{usaHoras(m) ? ` (${horasM.length})` : ""}</span></button>
                              )}
                            </>))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          )}
          {/* Rezagas sueltas (no vienen de manifiesto) — solo en Historial Mermado */}
          {tabRec === "histMermado" && (
            <div className="border-t border-gray-200">
              <div className="px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-700">Rezagas registradas (sin manifiesto) ({rezagas.length})</div>
              {rezagas.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-6 italic">Sin rezagas. Usa “+ Registrar rezaga”.</div>
              ) : (
                <div className="p-3 space-y-2 bg-gray-50/70">
                  {rezagas.map((rz) => (
                    <div key={rz.id} className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${rz.tipo === "Rezaga muerta" ? "bg-gray-800 text-white" : "bg-amber-100 text-amber-700"}`}>{rz.tipo || "—"}</span>
                          <span className="text-base font-bold text-red-700">{rz.kg ? fmt(rz.kg) + " kg" : "—"}</span>
                          <span className="text-[11px] text-gray-500">{rz.fecha}{rz.hora ? ` · ${rz.hora}` : ""}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          <span className="text-gray-400">de dónde viene:</span> <b className="text-gray-700">{rz.origen || "—"}</b>
                          {rz.comentario ? <> · {rz.comentario}</> : null}
                        </div>
                      </div>
                      <button onClick={() => eliminarRezaga(rz.id)} title="Eliminar esta rezaga" className="inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 border border-red-200 rounded-lg bg-white hover:bg-red-50 text-red-500 whitespace-nowrap"><Trash2 size={14} /> Eliminar</button>
                    </div>
                  ))}
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-between font-semibold text-gray-800 text-xs">
                    <span>Total rezaga ({rezagas.length})</span>
                    <span className="text-red-700 text-base">{fmt(rezagas.reduce((a, r) => a + (parseFloat(r.kg) || 0), 0))} kg</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : tabRec === "clienteDirecto" ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Truck size={16} /> Cliente Directo ({clienteDirectoList.length})</span>
            <span className="text-xs text-gray-400 ml-2">· fletes que NO entran a empaque; se van directo con el cliente</span>
          </div>
          {clienteDirectoList.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8 italic">Sin fletes a cliente directo. Al dar recepción marca “Flete a Cliente Directo”.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "880px" }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <th className="text-left px-3 py-2 font-medium">Folio / Remisión</th>
                    <th className="text-left px-3 py-2 font-medium">Recepción</th>
                    <th className="text-left px-3 py-2 font-medium">Lote</th>
                    <th className="text-left px-3 py-2 font-medium">Producto</th>
                    <th className="text-right px-3 py-2 font-medium">Kg recibido</th>
                    <th className="text-left px-3 py-2 font-medium">Cliente / Destino</th>
                    <th className="text-center px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {clienteDirectoList.map((m) => {
                    const r = m.recepcion || {};
                    const kg = parseFloat(r.pesoRecibido) || parseFloat(m.pesoBascula) || 0;
                    const prod = (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(", ") || "—";
                    return (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-bold text-red-600 whitespace-nowrap align-top">{m.remision || m.folio || "—"}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap align-top">{r.fechaLlegada || "—"}{r.horaLlegada ? ` ${r.horaLlegada}` : ""}</td>
                        <td className="px-3 py-2 text-gray-700 align-top">{loteDe(m)}</td>
                        <td className="px-3 py-2 text-gray-700 align-top">{prod}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800 align-top">{fmt(kg)} kg</td>
                        <td className="px-3 py-2 text-gray-600 align-top">{m.consignado || m.distribuidor || m.destino || "—"}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap align-top">
                          <button onClick={() => abrirRecepcion(m)} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 mr-1"><Eye size={14} /> Ver</button>
                          {tieneEnvioSAP(m) ? (
                            <span title="No se puede reabrir: el folio ya tuvo envíos a SAP (total, por hora o faltante)" className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed inline-flex items-center gap-1"><Ban size={14} /> Reabrir</span>
                          ) : (
                            <button onClick={() => reabrir(m.id)} className="text-xs px-2 py-1 border border-amber-200 rounded-lg bg-white hover:bg-amber-50 text-amber-600"><span className="inline-flex items-center gap-1"><RotateCcw size={14} /> Reabrir</span></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {clienteDirectoList.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-2.5 bg-gray-50 text-xs text-gray-600">
              Total a cliente directo: <b>{fmt(clienteDirectoList.reduce((a, m) => a + (parseFloat(m.recepcion?.pesoRecibido) || parseFloat(m.pesoBascula) || 0), 0))} kg</b> · {clienteDirectoList.length} flete(s)
            </div>
          )}
        </div>
      ) : (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">{tabRec === "pendientes" ? "Fletes recibidos (falta destare / vaciado)" : "Historial (recibidos y rechazados)"} ({lista.length})</span>
        </div>
        {movimientos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, remisión, rancho, chofer, destino…"
              className="flex-1 min-w-0 sm:min-w-[220px] text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <div className="w-full sm:w-44 min-w-0"><SearchSelect className={INP_FILTRO} value={fDestino} onChange={setFDestino} placeholder="Destino: todos"
              options={[{ value: "", label: "Destino: todos" }, ...destinosMov.map((d) => ({ value: d, label: d }))]} /></div>
            {tabRec === "historial" && (
              <div className="w-full sm:w-48"><SearchSelect className={INP} value={fTipo} onChange={setFTipo} placeholder="Tipo: todos"
                options={[{ value: "", label: "Tipo: todos" }, { value: "recibido", label: "Recepción" }, { value: "rechazado", label: "Rechazo" }]} /></div>
            )}
            {hayFiltros && <button onClick={() => { setQ(""); setFTipo(""); setFDestino(""); }} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 whitespace-nowrap">Limpiar filtros</button>}
            <button onClick={exportarExcel} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 inline-flex items-center justify-center gap-1 whitespace-nowrap w-full sm:w-auto"><FileText size={14} /> Excel{hayFiltros ? " (filtrado)" : ""}</button>
          </div>
        )}
        {lista.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">{movimientos.length === 0 ? "Aún no hay fletes. Aparecerán en cuanto se registren en Movimientos." : "Ningún flete coincide con la búsqueda."}</div>
        ) : (
          <div className="p-3 space-y-3 bg-gray-50/70">
                {lista.map((m) => {
                  const par = sumar(m.cargaItems, "parrillas");
                  const bul = sumar(m.cargaItems, "bultos");
                  const r = m.recepcion;
                  const recibido = r?.estado === "recibido";
                  const rechazado = r?.estado === "rechazado";
                  const novedad = recibido && r?.condicion === "con_novedad";
                  const nMu = m.muestreos?.length || 0;
                  const qciProm = nMu ? m.muestreos.reduce((a, mu) => a + calcQCI(mu), 0) / nMu : null;
                  // Chip de estado: lo primero que se debe entender de un flete.
                  const est = recibido
                    ? (novedad
                      ? { t: "Recibido con novedad", c: "bg-red-50 text-red-700 border-red-200", i: <AlertTriangle size={13} /> }
                      : { t: "Recibido", c: "bg-green-50 text-green-700 border-green-200", i: <Check size={13} /> })
                    : rechazado
                      ? { t: "Rechazado", c: "bg-red-50 text-red-700 border-red-200", i: <X size={13} /> }
                      : { t: "Llegó · falta dar entrada", c: "bg-orange-50 text-orange-700 border-orange-200", i: <Clock size={13} /> };
                  const dato = (etiqueta, valor) => (
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{etiqueta}</div>
                      <div className="text-xs text-gray-700 truncate">{valor}</div>
                    </div>
                  );
                  return (
                    <div key={m.id} className={`bg-white border rounded-xl overflow-hidden shadow-sm ${novedad || rechazado ? "border-red-200" : recibido ? "border-green-200" : "border-gray-200"}`}>
                      {/* Encabezado: folio, fecha, ruta y en qué estado está */}
                      <div className="px-4 py-2.5 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-base font-bold text-red-600">{m.folio || "—"}</span>
                            <span className="text-[11px] text-gray-500">{m.fecha || "sin fecha"}</span>
                            {m.remision && <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">rem. {m.remision}</span>}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5 truncate">{m.origen || "—"} → {m.destino || "—"}</div>
                          {/* A qué orden de fabricación va a caer este flete (temporada · rancho) */}
                          <div className="mt-1">{lineaOrdenSAP(m)}</div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {r?.clienteDirecto && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200"><Truck size={13} /> Cliente directo</span>}
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${est.c}`}>{est.i}{est.t}</span>
                        </div>
                      </div>

                      {/* Los datos del flete, ya no en columnas apretadas */}
                      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 bg-gray-50 border-b border-gray-100">
                        {dato("Línea / Chofer", <><b className="text-gray-800">{m.linea || "—"}</b> · {m.chofer || "—"}</>)}
                        {dato("Producto", (m.cargaItems || []).filter((it) => it.prod).length
                          ? (m.cargaItems || []).filter((it) => it.prod).map((it) => it.prod).join(", ")
                          : <span className="text-gray-300">—</span>)}
                        {dato("Parrillas / Bultos", <><span className="font-semibold text-green-700">{par || 0}</span> <span className="text-gray-300">/</span> <span className="font-semibold text-blue-700">{bul ? bul.toLocaleString() : 0}</span></>)}
                        {dato("Calidad (QCI)", qciProm !== null
                          ? <span className={`inline-block px-2 py-0.5 rounded-full font-bold ${qciProm >= 90 ? "bg-green-100 text-green-700" : qciProm >= 80 ? "bg-lime-100 text-lime-700" : qciProm >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{qciProm.toFixed(2)}% <span className="font-normal opacity-70">· {nMu}/{MAX_MUESTREOS}</span></span>
                          : <span className="text-gray-300">sin muestreo</span>)}
                      </div>
                      {rechazado && r?.comentario && (
                        <div className="px-4 py-2 text-[11px] text-red-700 bg-red-50 border-b border-red-100"><b>Motivo del rechazo:</b> {r.comentario}</div>
                      )}

                      {/* Acciones */}
                      <div className="px-4 py-2.5 flex items-center justify-end gap-2 flex-wrap">
                          <button onClick={() => abrirMuestreo(m)} className="text-xs px-2 py-1 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 text-indigo-600"><span className="inline-flex items-center gap-1"><FlaskConical size={14} /> {nMu ? "Calidad" : "Muestreo"}</span></button>
                          <button onClick={() => abrirInspeccion(m)} className={`inline-flex items-center gap-1 text-xs px-2 py-1 border rounded-lg bg-white ${m.inspeccion ? (inspeccionConHallazgo(m.inspeccion) ? "border-red-200 hover:bg-red-50 text-red-600" : "border-teal-200 hover:bg-teal-50 text-teal-600") : "border-teal-200 hover:bg-teal-50 text-teal-600"}`}><Truck size={14} /> {m.inspeccion ? (inspeccionConHallazgo(m.inspeccion) ? <span className="inline-flex items-center gap-1">Inspección <AlertTriangle size={14} /></span> : <span className="inline-flex items-center gap-1">Inspección <Check size={14} /></span>) : "Inspección"}</button>
                          {recibido ? (
                            <>
                              <button onClick={() => abrirRecepcion(m)} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600"><Eye size={14} /> Ver</button>
                              {/* Progreso a SAP del folio: cubetas ya reportadas y cuánto falta */}
                              {(cubetasEnviadasSAP(m) > 0 || kgPendienteSAP(m) > 0) && (
                                <span title="Cubetas ya reportadas a SAP · lo que falta por mandar de lo ya vaciado"
                                  className="mr-auto inline-flex items-center justify-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 whitespace-nowrap">
                                  <Send size={12} className="text-green-600" /> SAP: <b className="text-green-700">{cubetasEnviadasSAP(m).toLocaleString()} cub</b>
                                  {kgPendienteSAP(m) > 0 && <b className="text-amber-700">· faltan {cubetasDe(kgPendienteSAP(m)).toLocaleString()}</b>}
                                </span>
                              )}
                              {m.recepcion?.sapEnvio ? (
                                <span title="Recibo de producción enviado a SAP" className="inline-flex items-center justify-center gap-1 text-xs px-2 py-1 border border-green-200 rounded-lg bg-green-50 text-green-700 text-center font-medium"><Check size={14} /> SAP #{m.recepcion.sapEnvio.docNum}</span>
                              ) : esHist(m) ? (
                                <span title={`Folio anterior al corte (${goLiveSAP}): ya se registró fuera de la app. La app no manda históricos a SAP.`} className="inline-flex items-center justify-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-center"><Ban size={14} /> Histórico</span>
                              ) : usaParcial(m) ? (
                                <span title="Este folio se está vaciando por hora/faltante — el envío del TOTAL está bloqueado para no mandar doble a SAP" className="inline-flex items-center justify-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-center"><Clock size={14} /> {usaHoras(m) ? "Por hora" : "Por faltante"}</span>
                              ) : ordenSAPde(m) ? (
                                puedeEnviarSap ? (
                                  <button onClick={() => abrirEnvioSAP(m)} className="inline-flex items-center justify-center gap-1 text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"><Send size={14} /> Mandar a SAP</button>
                                ) : (
                                  <span title="No tienes permiso para mandar a SAP (empaque.vaciado.enviar_sap)" className="inline-flex items-center justify-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"><Ban size={14} /> Sin permiso SAP</span>
                                )
                              ) : null}
                              {/* Faltante: mandar lo que no se alcanzó a capturar por hora (no si ya se mandó el TOTAL) */}
                              {ordenSAPde(m) && !usoTotalSAP(m) && !esHist(m) && (() => {
                                const pend = ajustePendienteDe(m);
                                const nEnv = (m.vaciado?.ajustes || []).filter((a) => a.sapEnvio).length;
                                const cls = pend
                                  ? (pend.aprobacion ? "border-green-300 text-green-700 bg-green-50" : "border-amber-300 text-amber-700 bg-amber-50")
                                  : (nEnv ? "border-green-200 text-green-700 bg-green-50" : "border-gray-200 text-gray-600 bg-white hover:bg-gray-50");
                                const txt = pend ? (pend.aprobacion ? "Faltante: mandar" : "Faltante: aprobar") : (nEnv ? `Faltante (${nEnv})` : "Enviar faltante");
                                return (
                                  <button onClick={() => abrirFaltante(m)} title="Mandar a SAP los kg que faltaron por registrar (sin dividirlos por hora)"
                                    className={`inline-flex items-center justify-center gap-1 text-xs px-2 py-1 rounded-lg font-medium border ${cls}`}>
                                    <Plus size={14} /> {txt}
                                  </button>
                                );
                              })()}
                              {tieneEnvioSAP(m) ? (
                                <span title="No se puede reabrir: el folio ya tuvo envíos a SAP (total, por hora o faltante)" className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed inline-flex items-center justify-center gap-1"><Ban size={14} /> Reabrir</span>
                              ) : (
                                <button onClick={() => reabrir(m.id)} className="text-xs px-2 py-1 border border-amber-200 rounded-lg bg-white hover:bg-amber-50 text-amber-600"><span className="inline-flex items-center gap-1"><RotateCcw size={14} /> Reabrir</span></button>
                              )}
                            </>
                          ) : rechazado ? (
                            <button onClick={() => reabrir(m.id)} className="text-xs px-2 py-1 border border-amber-200 rounded-lg bg-white hover:bg-amber-50 text-amber-600"><span className="inline-flex items-center gap-1"><RotateCcw size={14} /> Reabrir</span></button>
                          ) : (<>
                            {/* El DESTARE (parrillas/cajas → ejote neto) se hace aquí, en Recibidos, junto
                                con muestreo/inspección. Luego el folio pasa a "Vaciado a Empaque". */}
                            <button onClick={() => abrirDestare(m)} className="text-xs border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-50 inline-flex items-center gap-1"><FlaskConical size={14} /> Destare</button>
                            <button onClick={() => abrirRecepcion(m)} className="text-xs bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-emerald-700">Dar recepción</button>
                          </>)}
                      </div>
                    </div>
                  );
                })}
          </div>
        )}
      </div>
      )}

      {/* ── HISTORIAL DE AVISOS ── Todos los descuadres, revisados y sin revisar, en un solo lugar.
          Así la tabla de lotes queda limpia pero nada se pierde: aquí se vuelve a consultar. ── */}
      {avisosAbierto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setAvisosAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] shadow-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><AlertTriangle size={16} className="text-amber-500" /> Historial de avisos ({avisosTodos.length})</div>
                <div className="text-xs text-gray-400">Folios que no cuadraron: salió de más o llegó de menos. Se conservan aunque ya se hayan revisado.</div>
              </div>
              <button onClick={() => setAvisosAbierto(false)} className="text-gray-400 hover:text-gray-700 shrink-0"><X size={18} /></button>
            </div>
            <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
              {[["todos", `Todos (${avisosTodos.length})`], ["pendiente", `Sin revisar (${avisosPend})`], ["revisado", `Revisados (${avisosTodos.length - avisosPend})`]].map(([k, l]) => (
                <button key={k} onClick={() => setAvFiltro(k)} className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border ${avFiltro === k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{l}</button>
              ))}
              <span className="w-px h-5 bg-gray-200 mx-1"></span>
              {[["todos", "Los dos"], ["falta", "Llegó de menos"], ["sobra", "Salió de más"]].map(([k, l]) => (
                <button key={k} onClick={() => setAvTipo(k)} className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border ${avTipo === k ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{l}</button>
              ))}
              <button onClick={exportarAvisos} className="ml-auto text-[11px] bg-green-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-green-700 inline-flex items-center gap-1"><FileText size={13} /> Excel</button>
            </div>
            <div className="px-5 py-3 overflow-y-auto space-y-2">
              {avisosFiltrados.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-8 italic">No hay avisos con ese filtro.</div>
              ) : avisosFiltrados.map((a) => (
                <div key={`${a.id}_${a.tipo}`} className={`border rounded-xl px-3 py-2 ${a.estado === "revisado" ? "border-gray-200 bg-gray-50/60" : a.tipo === "falta" ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50"}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-800">Folio {a.folio} <span className="font-normal text-gray-500">· lote {a.lote}</span></span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${a.tipo === "falta" ? "border-red-200 bg-white text-red-700" : "border-amber-200 bg-white text-amber-700"}`}>
                      {a.tipo === "falta" ? `Llegó de MENOS · ${fmt(a.dif)} kg` : `Salió de MÁS · ${fmt(a.dif)} kg`}
                      {a.rec > 0 ? ` (${((a.dif / a.rec) * 100).toFixed(1)}%)` : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">
                    recibido <b className="text-gray-800">{fmt(a.rec)}</b> · vaciado <b className="text-green-700">{fmt(a.vac)}</b>
                    {a.mer > 0 ? <> · mermado <b className="text-red-600">{fmt(a.mer)}</b></> : null}
                  </div>
                  {/* De dónde vino: para cachar patrones (siempre el mismo chofer, la misma tabla…) */}
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {a.fecha || "sin fecha"}
                    {a.linea ? <> · {a.linea}</> : null}
                    {a.chofer ? <> · <b className="text-gray-700">{a.chofer}</b></> : null}
                    {a.tabla ? <> · tabla {a.tabla}</> : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap mt-1.5">
                    {a.estado === "revisado" ? (
                      <span className="text-[11px] text-gray-500 inline-flex items-center gap-1"><Check size={12} className="text-green-600" /> Revisado por <b>{a.rev?.por || "—"}</b> el {(a.rev?.ts || "").slice(0, 10)}</span>
                    ) : (
                      <span className="text-[11px] text-amber-700 font-semibold">Sin revisar</span>
                    )}
                    {a.estado === "revisado"
                      ? <button onClick={() => quitarRevisado(a)} className="text-[11px] px-2.5 py-1 border border-gray-300 text-gray-600 rounded-lg hover:bg-white inline-flex items-center gap-1"><RotateCcw size={12} /> Volver a revisar</button>
                      : <button onClick={() => marcarRevisado(a)} className="text-[11px] px-2.5 py-1 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"><Check size={12} /> Ya lo revisé</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de recepción ── */}
      {recibir && form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="text-sm font-semibold text-gray-900">Recepción — Folio {recibir.folio || "—"}</div>
              <button onClick={() => { setRecibir(null); setForm(null); }} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Datos declarados (lo que dijeron que salió) */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Lo que salió de campo (declarado)</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3">
                  {[
                    ["Rancho", recibir.rancho], ["Origen", recibir.origen], ["Destino", recibir.destino],
                    ["Línea", recibir.linea], ["Chofer", recibir.chofer], ["Placa tracto", recibir.placaTracto],
                    ["No. caja", recibir.economicoCaja], ["Remisión", recibir.remision], ["Flete", recibir.flete ? "$" + recibir.flete : ""],
                  ].map(([l, v]) => (
                    <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                  ))}
                </div>
              </div>

              {/* Confirmación de cantidades: salió vs llegó */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Confirmar cantidades recibidas</div>
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">Concepto</th>
                        <th className="text-right px-3 py-2 font-medium">Salió</th>
                        <th className="text-right px-3 py-2 font-medium w-32">Llegó</th>
                        <th className="text-right px-3 py-2 font-medium">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {declaradoVsRecibido(recibir, form).map((row, i) => {
                        const dif = row.lle - row.sal;
                        const campo = ["parrillasRecibidas", "bultosRecibidos", "pesoRecibido"][i];
                        return (
                          <tr key={row.l} className="border-t border-gray-100">
                            <td className="px-3 py-1.5 text-gray-700 font-medium">{row.l}</td>
                            <td className="px-3 py-1.5 text-right text-gray-600">{row.sal.toLocaleString()}</td>
                            <td className="px-3 py-1.5">
                              <input type="number" className={INP + " text-right"} value={form[campo]} onChange={(e) => upd(campo, e.target.value)} />
                            </td>
                            <td className={`px-3 py-1.5 text-right font-semibold ${dif === 0 ? "text-gray-400" : "text-red-600"}`}>
                              {dif === 0 ? <span className="inline-flex items-center gap-1"><Check size={14} /> ok</span> : (dif > 0 ? "+" : "") + dif.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Destare de empaque (ejote): siempre activo; para no usarlo, pon 0 en los pesos. */}
              {(() => {
                const cajas = parseFloat(form.bultosRecibidos) || 0;
                const parrillas = (parseFloat(form.parrillasRecibidas) || 0) || (cajas ? Math.round(cajas / CAJAS_POR_PARRILLA) : 0);
                const brutoBascula = parseFloat(form.pesoRecibido) || 0;
                const trailer = parseFloat(recibir?.pesoTrailer) || 0;     // viene del movimiento
                const bruto = Math.max(0, brutoBascula - trailer);          // carga (taras + fruta), sin trailer
                const pK = parseFloat(form.destareParrillaKg) || 0;
                const cK = parseFloat(form.destareCajaKg) || 0;
                const taraP = parrillas * pK, taraC = cajas * cK, taraT = taraP + taraC;
                const neto = Math.max(0, bruto - taraT);
                return (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Destare de empaque (ejote) <span className="text-gray-300 normal-case">· para no usarlo, pon 0 en los pesos</span></div>
                    <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className={LBL}>Peso por parrilla (kg)</label><input type="number" step="0.01" className={INP} value={form.destareParrillaKg} onChange={(e) => upd("destareParrillaKg", e.target.value)} /></div>
                        <div><label className={LBL}>Peso por caja (kg)</label><input type="number" step="0.01" className={INP} value={form.destareCajaKg} onChange={(e) => upd("destareCajaKg", e.target.value)} /></div>
                      </div>
                      <div className="text-xs bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
                        <div className="flex justify-between px-3 py-1.5"><span className="text-gray-600">Peso de báscula (bruto, con trailer)</span><b className="text-gray-800">{fmt(brutoBascula)} kg</b></div>
                        {trailer > 0 ? (
                          <>
                            <div className="flex justify-between px-3 py-1.5 bg-green-50/60"><span className="text-gray-700">Peso del trailer vacío <span className="text-green-700 font-semibold">✓ ya restado</span></span><span className="text-red-600 font-semibold">− {fmt(trailer)} kg</span></div>
                            <div className="flex justify-between px-3 py-1.5 bg-gray-50"><span className="text-gray-700 font-semibold">Carga (bruto − trailer)</span><b className="text-gray-800">{fmt(bruto)} kg</b></div>
                          </>
                        ) : (
                          <div className="px-3 py-1.5 text-[11px] text-amber-700 inline-flex items-center gap-1.5"><AlertTriangle size={13} /> Falta el <b>peso del trailer</b> (se captura en el movimiento) — el neto es <b>PROVISIONAL</b> (todavía trae el peso del trailer).</div>
                        )}
                        <div className="flex justify-between px-3 py-1.5"><span className="text-gray-600">Parrillas: {parrillas} × {pK} kg</span><span className="text-red-600">− {fmt(taraP)} kg</span></div>
                        <div className="flex justify-between px-3 py-1.5"><span className="text-gray-600">Cajas: {fmt(cajas)} × {cK} kg</span><span className="text-red-600">− {fmt(taraC)} kg</span></div>
                        <div className="flex justify-between px-3 py-1.5"><span className="text-gray-700 font-semibold">Material de empaque (tara)</span><b className="text-red-700">− {fmt(taraT)} kg</b></div>
                        <div className="flex justify-between px-3 py-1.5 bg-green-50"><span className="text-green-800 font-semibold">Ejote neto (a vaciar)</span><b className="text-green-700">{fmt(neto)} kg</b></div>
                      </div>
                      {bruto === 0 && <div className="text-[11px] text-amber-700">Captura el <b>peso recibido</b> arriba para calcular el neto.</div>}
                      {/* Candados de captura: los dos errores que dejan el ejote en 0 sin que nadie lo note. */}
                      {parrillas > 0 && cajas > 0 && parrillas > cajas && (
                        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                          <span>⚠️ <b>¿Parrillas y bultos están invertidos?</b> Hay más parrillas ({fmt(parrillas)}) que cajas ({fmt(cajas)}), y normalmente van ~{CAJAS_POR_PARRILLA} cajas por parrilla.</span>
                          <button type="button" onClick={() => setForm((f) => ({ ...f, parrillasRecibidas: f.bultosRecibidos, bultosRecibidos: f.parrillasRecibidas }))} className="shrink-0 px-2 py-1 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700">Intercambiar</button>
                        </div>
                      )}
                      {bruto > 0 && taraT >= bruto && (
                        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          ⚠️ <b>La tara ({fmt(taraT)} kg) es mayor o igual al peso recibido ({fmt(bruto)} kg)</b>, por eso el ejote neto queda en <b>0</b>. Revisa parrillas, bultos y los pesos antes de confirmar.
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400">≈ 1 parrilla por cada {CAJAS_POR_PARRILLA} cajas; si no capturas parrillas, se estiman con esa razón.</div>
                    </div>
                  </div>
                );
              })()}

              {/* Datos de llegada */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos de la recepción</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div><label className={LBL}>Fecha de llegada</label><input type="date" className={INP} value={form.fechaLlegada} onChange={(e) => upd("fechaLlegada", e.target.value)} /></div>
                  <div><label className={LBL}>Hora de llegada</label><input type="time" className={INP} value={form.horaLlegada} onChange={(e) => upd("horaLlegada", e.target.value)} /></div>
                  <div><label className={LBL}>Recibe (responsable)</label><input className={INP} value={form.responsable} onChange={(e) => upd("responsable", e.target.value)} placeholder="Nombre de quien recibe" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className={LBL}>Condición de la carga</label>
                    <SearchSelect className={INP} value={form.condicion} onChange={(v) => upd("condicion", v)} options={[
                      { value: "ok", label: "Llegó completo y en buen estado" },
                      { value: "con_novedad", label: "Con novedad (faltante / daño)" },
                    ]} />
                  </div>
                  <div><label className={LBL}>Observaciones</label><input className={INP} value={form.observaciones} onChange={(e) => upd("observaciones", e.target.value)} placeholder="Notas de la recepción" /></div>
                </div>
              </div>

              {/* Flete a Cliente Directo: no entra a empaque, se va con el cliente */}
              <div>
                <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${form.clienteDirecto ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white"}`}>
                  <input type="checkbox" className="mt-0.5" checked={!!form.clienteDirecto} onChange={(e) => upd("clienteDirecto", e.target.checked)} />
                  <span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Truck size={16} /> Flete a Cliente Directo</span>
                    <span className="block text-xs text-gray-500">No entra a empaque ni a Vaciado a Empaque: se va directo con el cliente. Aparecerá en la pestaña <b>Cliente Directo</b>.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end sticky bottom-0 bg-white">
              <button onClick={() => { setRecibir(null); setForm(null); }} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmar} className="inline-flex items-center justify-center gap-1 text-xs px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"><Check size={14} /> Confirmar recepción</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de muestreo de calidad ── */}
      {muestreoMov && muestreos[mActivo] && (() => {
        const mu = muestreos[mActivo];
        const qci = calcQCI(mu);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Control de Calidad — Recepción</div>
                  <div className="text-xs text-gray-500 mt-0.5">Folio {muestreoMov.folio || "—"} · {muestreoMov.rancho || "—"} → {muestreoMov.destino || "—"}</div>
                </div>
                <button onClick={cerrarMuestreo} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
              </div>

              {/* Pestañas de muestreos */}
              <div className="px-5 pt-3 flex items-center gap-2 border-b border-gray-100 overflow-x-auto">
                {muestreos.map((_, i) => (
                  <button key={i} onClick={() => setMActivo(i)}
                    className={`text-xs px-3 py-1.5 rounded-t-lg font-medium border-b-2 -mb-px whitespace-nowrap ${i === mActivo ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    Muestreo {i + 1}
                    {muestreos.length > 1 && <span onClick={(e) => { e.stopPropagation(); eliminarMuestreo(i); }} className="ml-2 inline-flex items-center text-gray-300 hover:text-red-500"><X size={14} /></span>}
                  </button>
                ))}
                {muestreos.length < MAX_MUESTREOS && (
                  <button onClick={agregarMuestreo} className="text-xs px-3 py-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium">+ Agregar muestreo</button>
                )}
              </div>

              <div className="px-5 py-4">
                {/* Datos arrastrados del movimiento de campo (solo lectura) */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Datos del movimiento de campo</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs">
                    {[["Remisión", muestreoMov.remision], ["Folio", muestreoMov.folio], ["Rancho", muestreoMov.rancho], ["Lote", muestreoMov.lote], ["Viaje / zona", muestreoMov.viaje], ["Consignado", muestreoMov.consignado], ["Distribuidor", muestreoMov.distribuidor], ["Resp. cosecha", muestreoMov.responsableCosecha], ["Origen → Destino", `${muestreoMov.origen || "—"} → ${muestreoMov.destino || "—"}`], ["Fecha salida", muestreoMov.fecha], ["Línea", muestreoMov.linea], ["Chofer", muestreoMov.chofer]].map(([l, v]) => (
                      <div key={l}><span className="text-gray-400">{l}: </span><span className="font-semibold text-gray-700">{v || "—"}</span></div>
                    ))}
                  </div>
                </div>

                {/* Encabezado del muestreo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  <div><label className={LBL}>Lote (paredes)</label><input className={INP} value={mu.lote} onChange={(e) => updMuestreo("lote", e.target.value)} placeholder="Paredes" /></div>
                  <div><label className={LBL}>Inspector</label>{selectorInspector(mu.inspector, (v) => updMuestreo("inspector", v))}</div>
                  <div><label className={LBL}>Folio muestreo / ID</label><input className={INP} value={mu.folio} onChange={(e) => updMuestreo("folio", e.target.value)} placeholder="201" /></div>
                  <div><label className={LBL}>Peso muestra</label><input type="number" className={INP} value={mu.pesoMuestra} onChange={(e) => updMuestreo("pesoMuestra", e.target.value)} placeholder="39.30" /></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Tabla de defectos (col 1-2) */}
                  <div className="md:col-span-2 border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                          <th className="text-left px-3 py-2 font-medium">Defecto</th>
                          <th className="text-right px-3 py-2 font-medium w-28">Defectos (g)</th>
                          <th className="text-right px-3 py-2 font-medium w-20">Promedio</th>
                          <th className="text-center px-3 py-2 font-medium w-16">Foto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DEFECTOS_QC.map((d) => {
                          const pct = pctDefecto(mu.defectos[d.id], mu.pesoMuestra);
                          const catColor = { calidad: "border-l-blue-400", condicion: "border-l-amber-400", plaga: "border-l-red-400" }[d.cat];
                          return (
                            <tr key={d.id} className={`border-t border-gray-100 border-l-2 ${catColor}`}>
                              <td className="px-3 py-1 text-gray-700">{d.label}</td>
                              <td className="px-2 py-1"><input type="number" step="0.01" className={INP + " text-right"} value={mu.defectos[d.id]} onChange={(e) => updDefecto(d.id, e.target.value)} placeholder="0.00" /></td>
                              <td className={`px-3 py-1 text-right font-semibold ${pct > 0 ? "text-gray-800" : "text-gray-300"}`}>{pct.toFixed(1)}%</td>
                              <td className="px-2 py-1 text-center">
                                {mu.fotos?.[d.id] ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <a href={mu.fotos[d.id]} target="_blank" rel="noreferrer"><img src={mu.fotos[d.id]} alt="" className="w-7 h-7 object-cover rounded border border-gray-200" /></a>
                                    <button onClick={() => quitarFoto(d.id)} className="inline-flex items-center text-gray-300 hover:text-red-500"><X size={14} /></button>
                                  </div>
                                ) : (
                                  <label className="cursor-pointer text-indigo-400 hover:text-indigo-600 text-base" title="Agregar foto">
                                    <Camera size={16} />
                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => subirFoto(d.id, e.target.files?.[0])} />
                                  </label>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen por categoría + QCI (col 3) */}
                  <div className="space-y-3">
                    {Object.entries(CATS_QC).map(([key, cfg]) => {
                      const pct = pctCategoria(mu, key);
                      return (
                        <div key={key} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">{cfg.label}</span>
                          <span className={`text-lg font-bold ${cfg.color}`}>{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                    <div className={`rounded-xl px-4 py-4 text-center ${qci >= 90 ? "bg-green-500" : qci >= 80 ? "bg-lime-500" : qci >= 70 ? "bg-amber-500" : "bg-red-500"}`}>
                      <div className="text-xs font-semibold text-white/90 uppercase">QCI Recepción</div>
                      <div className="text-3xl font-extrabold text-white mt-1">{qci.toFixed(2)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-2 gap-y-2 justify-between items-center sticky bottom-0 bg-white">
                <div className="flex gap-2">
                  <button onClick={() => generarReporteCalidad(muestreoMov, muestreos)} className="text-xs px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 flex items-center gap-1"><FileText size={14} /> Generar PDF</button>
                  <button onClick={() => abrirRechazo(muestreoMov)} className="inline-flex items-center gap-1 text-xs px-4 py-2 border border-red-300 text-red-600 rounded-lg font-semibold hover:bg-red-50"><Ban size={14} /> Rechazar flete</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={cerrarMuestreo} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                  <button onClick={guardarMuestreo} className="inline-flex items-center justify-center gap-1 text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"><Save size={14} /> Guardar muestreo{muestreos.length > 1 ? "s" : ""}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal de inspección de vehículo y producto (REG-EMP-24) ── */}
      {inspMov && insp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <div className="text-sm font-semibold text-gray-900">Inspección de vehículo y producto que llega a la planta</div>
                <div className="text-xs text-gray-500 mt-0.5">REG-EMP-24 · Folio {inspMov.folio || "—"} · {inspMov.linea || "—"} · {inspMov.chofer || "—"}</div>
              </div>
              <button onClick={cerrarInspeccion} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Encabezado del registro */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-1"><label className={LBL}>Producto</label><input className={INP} value={insp.producto} onChange={(e) => updInsp("producto", e.target.value)} placeholder="Producto" /></div>
                <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={insp.fecha} onChange={(e) => updInsp("fecha", e.target.value)} /></div>
                <div><label className={LBL}>Hora</label><input type="time" className={INP} value={insp.hora} onChange={(e) => updInsp("hora", e.target.value)} /></div>
                <div><label className={LBL}>No. de remisión</label><input className={INP} value={insp.remision} onChange={(e) => updInsp("remision", e.target.value)} placeholder="Remisión" /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vehículo */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">VEHÍCULO (SI / NO)</div>
                  <div className="divide-y divide-gray-100">
                    {INSP_VEHICULO.map((c) => {
                      const malo = insp.veh[c.id] === c.malo;
                      return (
                        <div key={c.id} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs text-gray-700">{c.label}</span>
                          <SearchSelect value={insp.veh[c.id]} onChange={(v) => updInspCheck("veh", c.id, v)} placeholder="—"
                            className={`text-xs px-2 py-1 border rounded-md focus:outline-none ${malo ? "border-red-300 bg-red-50 text-red-700 font-semibold" : "border-gray-200 bg-white"}`}
                            options={[
                              { value: "si", label: "SI" },
                              { value: "no", label: "NO" },
                            ]} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Condiciones del producto */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">CONDICIONES DEL PRODUCTO (SI / NO)</div>
                  <div className="divide-y divide-gray-100">
                    {INSP_PRODUCTO.map((c) => {
                      const malo = insp.prod[c.id] === c.malo;
                      return (
                        <div key={c.id} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs text-gray-700">{c.label}</span>
                          <SearchSelect value={insp.prod[c.id]} onChange={(v) => updInspCheck("prod", c.id, v)} placeholder="—"
                            className={`text-xs px-2 py-1 border rounded-md focus:outline-none ${malo ? "border-red-300 bg-red-50 text-red-700 font-semibold" : "border-gray-200 bg-white"}`}
                            options={[
                              { value: "si", label: "SI" },
                              { value: "no", label: "NO" },
                            ]} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label className={LBL}>Temperatura interna del producto (°F)</label><input type="number" step="0.1" className={INP} value={insp.tempProducto} onChange={(e) => updInsp("tempProducto", e.target.value)} placeholder="°F" /></div>
                <div className="col-span-2"><label className={LBL}>Observaciones y/o acciones correctivas</label><input className={INP} value={insp.observaciones} onChange={(e) => updInsp("observaciones", e.target.value)} placeholder="Observaciones" /></div>
              </div>

              <div>
                <label className={LBL}>Acciones correctivas</label>
                <textarea rows={2} className={INP} value={insp.accionesCorrectivas} onChange={(e) => updInsp("accionesCorrectivas", e.target.value)} placeholder="Acciones correctivas tomadas" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><label className={LBL}>Elaboró (inspector)</label>{selectorInspector(insp.elaboro, (v) => updInsp("elaboro", v))}</div>
                <div><label className={LBL}>Nombre del supervisor</label>{selectorInspector(insp.supervisor, (v) => updInsp("supervisor", v))}</div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-2 gap-y-2 justify-between items-center sticky bottom-0 bg-white">
              <div className="flex gap-2">
                <button onClick={() => generarReporteInspeccion(insp)} className="text-xs px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 flex items-center gap-1"><FileText size={14} /> Generar PDF</button>
                <button onClick={() => abrirRechazo(inspMov)} className="inline-flex items-center gap-1 text-xs px-4 py-2 border border-red-300 text-red-600 rounded-lg font-semibold hover:bg-red-50"><Ban size={14} /> Rechazar flete</button>
              </div>
              <div className="flex gap-2">
                <button onClick={cerrarInspeccion} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                <button onClick={guardarInspeccion} className="inline-flex items-center justify-center gap-1 text-xs px-4 py-2 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700"><Save size={14} /> Guardar inspección</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de rechazo del flete ── */}
      {rechazoMov && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Ban size={16} /> Rechazar flete — Folio {rechazoMov.folio || "—"}</div>
              <div className="text-xs text-gray-500 mt-0.5">El flete saldrá de "Por recibir" y pasará al Historial como Rechazo.</div>
            </div>
            <div className="px-5 py-4">
              <label className={LBL}>¿Qué se hará con el flete? (comentario)</label>
              <textarea className={INP} rows={4} value={rechazoComent} onChange={(e) => setRechazoComent(e.target.value)}
                placeholder="Ej: se regresa a campo / se reprocesa / se destina a merma / se notifica a calidad…" />
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => { setRechazoMov(null); setRechazoComent(""); }} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmarRechazo} className="text-xs px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">Confirmar rechazo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: registrar merma (no entró a empaque) ── */}
      {/* ── Completar DESTARE desde la tarjeta ── parrillas/cajas → ejote neto exacto ── */}
      {destareMov && (() => {
        const m = movimientos.find((x) => x.id === destareMov.id) || destareMov;
        const brutoBascula = (parseFloat(m.recepcion?.pesoRecibido) || 0) || (parseFloat(m.pesoBascula) || 0);
        const trailer = parseFloat(m.pesoTrailer) || 0;
        const carga = Math.max(0, brutoBascula - trailer);
        const parr = parseFloat(destareForm.parrillas) || 0;
        const cajas = parseFloat(destareForm.cajas) || 0;
        const pP = parseFloat(destareForm.pP) || 0;
        const pC = parseFloat(destareForm.pC) || 0;
        const taraP = parr * pP, taraC = cajas * pC, taraT = taraP + taraC;
        const neto = Math.max(0, carga - taraT);
        const inv = parr > 0 && cajas > 0 && parr > cajas;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4" onClick={() => setDestareMov(null)}>
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><FlaskConical size={16} /> Completar destare — Folio {m.remision || m.folio || "—"}</div>
                <button onClick={() => setDestareMov(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="text-[11px] text-gray-500">Captura las <b>parrillas</b> y <b>cajas</b> que llegaron para calcular el <b>ejote neto exacto</b>. El peso del trailer se toma del movimiento.</div>
                {trailer <= 0 && brutoBascula > 0 && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Todavía <b>falta el peso del trailer</b> (se captura en el movimiento). El neto seguirá <b>provisional</b> hasta ponerlo.</div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LBL}>Parrillas</label><input type="number" min="0" className={INP} value={destareForm.parrillas} onChange={(e) => setDestareForm((f) => ({ ...f, parrillas: e.target.value }))} placeholder="Nº" /></div>
                  <div><label className={LBL}>Cajas (bultos)</label><input type="number" min="0" className={INP} value={destareForm.cajas} onChange={(e) => setDestareForm((f) => ({ ...f, cajas: e.target.value }))} placeholder="Nº" /></div>
                  <div><label className={LBL}>Peso por parrilla (kg)</label><input type="number" step="0.01" className={INP} value={destareForm.pP} onChange={(e) => setDestareForm((f) => ({ ...f, pP: e.target.value }))} /></div>
                  <div><label className={LBL}>Peso por caja (kg)</label><input type="number" step="0.01" className={INP} value={destareForm.pC} onChange={(e) => setDestareForm((f) => ({ ...f, pC: e.target.value }))} /></div>
                </div>
                {inv && (
                  <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                    <span>⚠️ <b>¿Parrillas y cajas invertidas?</b> Hay más parrillas ({fmt(parr)}) que cajas ({fmt(cajas)}).</span>
                    <button type="button" onClick={() => setDestareForm((f) => ({ ...f, parrillas: f.cajas, cajas: f.parrillas }))} className="shrink-0 px-2 py-1 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700">Intercambiar</button>
                  </div>
                )}
                <div className="text-xs bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
                  <div className="flex justify-between px-3 py-1.5"><span className="text-gray-600">Peso de báscula (bruto)</span><b className="text-gray-800">{fmt(brutoBascula)} kg</b></div>
                  <div className="flex justify-between px-3 py-1.5"><span className="text-gray-600">Trailer vacío</span><span className={trailer > 0 ? "text-red-600" : "text-amber-600"}>{trailer > 0 ? `− ${fmt(trailer)} kg` : "falta"}</span></div>
                  <div className="flex justify-between px-3 py-1.5 bg-gray-50"><span className="text-gray-700 font-semibold">Carga (bruto − trailer)</span><b className="text-gray-800">{fmt(carga)} kg</b></div>
                  <div className="flex justify-between px-3 py-1.5"><span className="text-gray-600">Parrillas: {fmt(parr)} × {pP}</span><span className="text-red-600">− {fmt(taraP)} kg</span></div>
                  <div className="flex justify-between px-3 py-1.5"><span className="text-gray-600">Cajas: {fmt(cajas)} × {pC}</span><span className="text-red-600">− {fmt(taraC)} kg</span></div>
                  <div className="flex justify-between px-3 py-1.5 bg-green-50"><span className="text-green-800 font-semibold">Ejote neto (a vaciar)</span><b className="text-green-700">{fmt(neto)} kg</b></div>
                </div>
                {carga > 0 && taraT >= carga && <div className="text-[11px] text-red-600 font-semibold">⚠️ La tara supera a la carga — revisa parrillas/cajas.</div>}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
                <button onClick={() => setDestareMov(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                <button onClick={() => guardarDestare(m)} className="text-xs px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">Guardar destare</button>
              </div>
            </div>
          </div>
        );
      })()}

      {mermarMov && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><AlertTriangle size={16} /> Mermar (no entró a empaque) — {mermarMov.remision || mermarMov.folio || "—"}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Disponible en piso: <b>{fmt(kgEnPisoDe(mermarMov))} kg</b> · se descartan (no se procesan).</span>
                {kgEnPisoDe(mermarMov) > 0 && (
                  <button type="button" onClick={() => setMermarKg(String(kgEnPisoDe(mermarMov)))}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 underline">usar todo el piso</button>
                )}
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className={LBL}>Kg mermados</label>
                <input type="number" className={INP} value={mermarKg} onChange={(e) => setMermarKg(e.target.value)} placeholder="Ej: 480" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={LBL}>Fecha de merma</label>
                  <input type="date" className={INP} value={mermarFecha} onChange={(e) => setMermarFecha(e.target.value)} />
                </div>
                <div>
                  <label className={LBL}>Hora</label>
                  <input type="time" className={INP} value={mermarHora} onChange={(e) => setMermarHora(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={LBL}>Motivo de la merma</label>
                <SearchSelect className={INP} value={mermarMotivo} onChange={setMermarMotivo} placeholder="— Motivo —" searchThreshold={99}
                  options={[
                    { value: "Merma por Calidad", label: "Merma por Calidad" },
                    { value: "Merma por Inexistencia", label: "Merma por Inexistencia" },
                  ]} />
              </div>
              {mermarMotivo && (
                <div>
                  <label className={LBL}>Comentario (opcional)</label>
                  <input className={INP} value={mermarComentario} onChange={(e) => setMermarComentario(e.target.value)} placeholder="Detalle de la merma…" />
                </div>
              )}
              {mermarFecha && mermarFecha !== hoyISO() && <div className="inline-flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle size={14} /> Fecha distinta a hoy: esta merma contará en el día {mermarFecha}.</div>}
              <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                Estos kg <b>salen del piso y no entran a empaque</b>, así que <b>no van a SAP</b>. Quedará registrado a tu nombre ({usuarioActual?.full_name || usuarioActual?.email || "—"}).
              </div>
              {mermarError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{mermarError}</div>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setMermarMov(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmarMerma} disabled={!(parseFloat(mermarKg) > 0) || !mermarMotivo} className="text-xs px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50">Registrar merma</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: registrar rezaga suelta (Historial Mermado) ── */}
      {rezagaForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Plus size={16} /> Registrar rezaga</div>
              <div className="text-xs text-gray-500 mt-0.5">Rezaga suelta (no viene de un manifiesto). Se guarda en Historial Mermado.</div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={rezagaForm.fecha} onChange={(e) => updRezaga("fecha", e.target.value)} /></div>
                <div><label className={LBL}>Hora</label><input type="time" className={INP} value={rezagaForm.hora} onChange={(e) => updRezaga("hora", e.target.value)} /></div>
              </div>
              <div>
                <label className={LBL}>Tipo</label>
                <SearchSelect className={INP} value={rezagaForm.tipo} onChange={(v) => updRezaga("tipo", v)} placeholder="— Tipo —" searchThreshold={99}
                  options={[{ value: "Rezaga", label: "Rezaga" }, { value: "Rezaga muerta", label: "Rezaga muerta" }]} />
              </div>
              <div>
                <label className={LBL}>De dónde viene</label>
                <SearchSelect className={INP} value={rezagaForm.origen} onChange={(v) => updRezaga("origen", v)} placeholder="— Origen —" searchThreshold={99}
                  options={[{ value: "Cuarto frío", label: "Cuarto frío" }, { value: "Bandas", label: "Bandas" }]} />
              </div>
              <div><label className={LBL}>Kg (opcional)</label><input type="number" className={INP} value={rezagaForm.kg} onChange={(e) => updRezaga("kg", e.target.value)} placeholder="kg" /></div>
              <div><label className={LBL}>Comentario (opcional)</label><input className={INP} value={rezagaForm.comentario} onChange={(e) => updRezaga("comentario", e.target.value)} placeholder="Detalle…" /></div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setRezagaForm(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmarRezaga} className="text-xs px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">Guardar rezaga</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: mandar cantidad a SAP (Recibo de producción) ── */}
      {sapMov && (() => {
        const ord = ordenSAPde(sapMov);
        const neto = kgRecibidosDe(sapMov);
        const kgc = parseFloat(sapKgCubeta) || 6;
        const cubetas = Math.round(neto / kgc);
        const mVivo = movimientos.find((x) => x.id === sapMov.id) || sapMov;   // para ver el ⏳ (G4)
        const pendSap = mVivo.recepcion?.sapPendiente;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Send size={16} /> Mandar cantidad a SAP — Folio {sapMov.folio || "—"}</div>
                <button onClick={() => setSapMov(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-400">Temporada</span><div className="font-medium text-gray-800">{ord?.temporada || "—"}</div></div>
                  <div><span className="text-gray-400">Rancho</span><div className="font-medium text-gray-800">{ord?.rancho || sapMov.rancho || "—"}</div></div>
                  <div><span className="text-gray-400">Orden de fabricación</span><div className="font-medium text-gray-800">{ord ? `#${ord.docNum ?? ord.absoluteEntry}` : "—"}</div></div>
                  <div><span className="text-gray-400">Completada actual</span><div className="font-medium text-gray-800">{ord ? `${ord.completedQty} / ${ord.plannedQty}` : "—"}</div></div>
                </div>
                {ord && ord.totalOrdenes > 1 && <div className="inline-flex items-center gap-1 text-[11px] text-amber-600"><AlertTriangle size={14} /> Este rancho tiene {ord.totalOrdenes} órdenes liberadas en SAP; se usará la #{ord.docNum ?? ord.absoluteEntry}.</div>}
                {fichaOrdenSAP(sapMov)}
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Ejote neto recibido</span><span className="font-semibold text-gray-800">{Math.round(neto)} kg</span></div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">kg por cubeta</span>
                    <input type="number" step="0.1" value={sapKgCubeta} onChange={(e) => setSapKgCubeta(e.target.value)} className="w-24 text-sm px-2 py-1 border border-gray-200 rounded-md text-right focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="flex items-center justify-between border-t border-indigo-100 pt-2"><span className="text-xs font-semibold text-indigo-700">Cubetas a SAP</span><span className="text-lg font-bold text-indigo-700">{cubetas}</span></div>
                  <div className="text-[10px] text-gray-400">{Math.round(neto)} kg ÷ {kgc} kg/cubeta = {cubetas} cubetas → suma a "Cantidad completada".</div>
                </div>
                {!ord && <div className="inline-flex items-center gap-1 text-[11px] text-red-600"><AlertTriangle size={14} /> Este movimiento no tiene orden de fabricación en SAP (su rancho no está en el catálogo).</div>}
                {sapError && <div className="text-[11px] text-red-600">No se pudo enviar: {sapError}</div>}
                {pendSap && avisoPendiente(mVivo, { tipo: "total" }, pendSap)}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
                <button onClick={() => setSapMov(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                <button onClick={confirmarEnvioSAP} disabled={sapCargando || !ord || !(cubetas > 0) || !!pendSap} title={pendSap ? "Hay un envío pendiente de confirmar: verifícalo en SAP antes de volver a mandar" : undefined} className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">{sapCargando ? "Enviando…" : "Confirmar envío a SAP"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Panel: Vaciado POR HORA de un folio ── */}
      {horasMov && (() => {
        const m = movimientos.find((x) => x.id === horasMov.id) || horasMov;
        const horas = m.vaciado?.horas || [];
        const recibido = kgRecibidosDe(m);
        const vaciado = kgVaciadosDe(m);
        const enPiso = kgEnPisoDe(m);
        const pct = recibido > 0 ? Math.round((vaciado / recibido) * 100) : 0;
        const excede = recibido > 0 && vaciado > recibido;
        const cubTot = horas.reduce((a, h) => a + cubetasDe(netoHora(h)), 0);
        const hayAbierta = horas.some((h) => h.estado === "abierta");
        // ¿Este folio se vació en más de un día? Entonces conviene enseñar la fecha de cada hora
        // (si no, se ven dos "Hora 1" sin manera de distinguirlas).
        const variosDias = new Set(horas.map((h) => h.fecha || (h.pesadas || [])[0]?.fecha).filter(Boolean)).size > 1;
        const ord = ordenSAPde(m);
        // Preview con el MISMO helper que guarda la pesada (contenedores + soporte) → no se despegan.
        const netoPreview = netoPesada({ bruto: pesForm.bruto, num: pesForm.num, tara: pesForm.tara, num2: pesForm.num2, tara2: pesForm.tara2 });
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={cerrarPanelHoras}>
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] shadow-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Clock size={16} /> Vaciado por hora — Folio {m.folio || m.remision || "—"}</div>
                  <div className="text-xs text-gray-400 truncate">{ord?.temporada || m.proyecto || ""}{loteDe(m) !== "—" ? ` · ${loteDe(m)}` : ""} · orden SAP #{(ord?.docNum ?? ord?.absoluteEntry) ?? "—"}</div>
                </div>
                <button onClick={cerrarPanelHoras} className="text-gray-400 hover:text-gray-700 shrink-0"><X size={18} /></button>
              </div>
              {/* Barra de flujo (diseño aprobado): de un vistazo, en qué va el folio.
                  Recibido → Vaciado → En piso → Enviado a SAP. Solo LECTURA: los mismos helpers
                  de siempre, nada de cálculos nuevos. */}
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                {(() => {
                  const enviadoKg = Math.min(kgEnviadosSAP(m), vaciado);
                  const sinEnviarKg = Math.max(0, vaciado - enviadoKg);
                  const mermaKg = kgMermadosDe(m);
                  // Base de la barra: lo recibido, salvo que se haya vaciado de más (entonces no se desborda).
                  const base = Math.max(1, recibido, vaciado + mermaKg);
                  const anch = (v) => `${Math.max(0, Math.min(100, (v / base) * 100))}%`;
                  const cubSap = cubetasEnviadasSAP(m);
                  const horasEnv = horas.filter((h) => h.sapEnvio).length;
                  const paso = (etiqueta, valor, unidad, sub, color) => (
                    <div className="px-1">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{etiqueta}</div>
                      <div className={`text-lg font-bold leading-tight ${color || "text-gray-800"}`}>{valor} <span className="text-[11px] font-semibold text-gray-400">{unidad}</span></div>
                      <div className="text-[10px] text-gray-500">{sub}</div>
                    </div>
                  );
                  const flecha = <div className="hidden sm:grid place-items-center text-gray-300"><ArrowRight size={16} /></div>;
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:gap-y-0 items-center">
                        {paso("Recibido", fmt(recibido), "kg", `≈ ${cubetasDe(recibido).toLocaleString()} cub`)}
                        {flecha}
                        {paso("Vaciado", fmt(vaciado), "kg", `≈ ${cubetasDe(vaciado).toLocaleString()} cub`)}
                        {flecha}
                        {paso("En piso (falta)", fmt(enPiso), "kg", `≈ ${cubetasDe(enPiso).toLocaleString()} cub`, "text-amber-600")}
                        {flecha}
                        {paso("Enviado a SAP", cubSap.toLocaleString(), "cub", horas.length ? `${horasEnv} de ${horas.length} horas` : "—", "text-green-700")}
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden flex mt-3">
                        <span className="h-full bg-green-500" style={{ width: anch(enviadoKg) }}></span>
                        <span className="h-full bg-blue-500" style={{ width: anch(sinEnviarKg) }}></span>
                        <span className="h-full bg-red-300" style={{ width: anch(mermaKg) }}></span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] text-gray-500">
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Enviado a SAP {fmt(enviadoKg)} kg</span>
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Vaciado sin enviar {fmt(sinEnviarKg)} kg</span>
                        {mermaKg > 0 && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-300"></span> Mermado {fmt(mermaKg)} kg</span>}
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300"></span> En piso {fmt(enPiso)} kg</span>
                        <span className="text-gray-400">· {cubTot.toLocaleString()} cubetas vaciadas ({pct}%)</span>
                      </div>
                    </>
                  );
                })()}
                {excede && <div className="text-[11px] text-amber-600 mt-1 inline-flex items-center gap-1"><AlertTriangle size={13} /> Llevas {fmt(vaciado - recibido)} kg MÁS de lo recibido — revisa (a veces llega más; no bloquea).</div>}
                <div className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-500 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                  <InfoTip className="text-indigo-400 mt-0.5" width="w-64"><b>¿Cómo se sacan las cubetas?</b><br />1) De cada pesada: <b>neto = bruto − (Nº × peso del contenedor)</b>.<br />2) Cubetas de la hora = <b>neto total ÷ 6 kg</b> (redondeado).<br />Eso es lo que suma a "Cantidad completada" en SAP.</InfoTip>
                  <span className="leading-snug"><b className="text-gray-700">Fórmula:</b> neto = bruto − (Nº × tara) &nbsp;·&nbsp; <b className="text-gray-700">cubetas = neto ÷ 6 kg</b> (redondeado). Cambia los 6 kg/cubeta al mandar a SAP.</span>
                </div>
              </div>
              {/* Horas */}
              <div className="px-5 py-4 overflow-y-auto space-y-3">
                {horas.length === 0 && <div className="text-center text-sm text-gray-400 py-6">Aún no hay horas. Abre la primera abajo. ↓</div>}
                {horas.map((h) => {
                  const neto = netoHora(h);
                  const cub = cubetasDe(neto);
                  const borde = h.estado === "enviada" ? "border-green-200" : h.estado === "cerrada" ? "border-amber-200" : "border-indigo-200";
                  return (
                    <div key={h.id} className={`border rounded-xl ${borde}`}>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-wrap gap-2">
                        <span className="text-sm font-semibold text-gray-800 inline-flex items-center gap-2">{h.etiqueta}
                          {/* La fecha se enseña cuando el folio se vació en VARIOS días (si no, estorba). */}
                          {variosDias && (h.fecha || (h.pesadas || [])[0]?.fecha) && (
                            <span className="text-[10px] font-normal text-gray-500">{h.fecha || (h.pesadas || [])[0]?.fecha}</span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${h.estado === "enviada" ? "bg-green-50 text-green-700 border-green-200" : h.estado === "cerrada" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>{h.estado === "enviada" ? "Enviada" : h.estado === "cerrada" ? "Cerrada" : "Abierta"}</span>
                        </span>
                        <span className="text-xs text-gray-600 inline-flex items-center gap-1"><b className="text-gray-800">{fmt(neto)} kg</b> · {cub} cub<InfoTip>{fmt(neto)} kg ÷ 6 kg/cubeta = <b>{cub} cubetas</b> (redondeado). Es lo que se manda a SAP.</InfoTip></span>
                      </div>
                      <div className="p-3">
                        {(h.pesadas || []).length > 0 && (
                          <div className="space-y-1 mb-2">
                            {h.pesadas.map((p) => (
                              <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1 gap-2">
                                <span className="text-gray-600 min-w-0">
                                  {p.num}× {CONTS.find((c) => c.id === p.tipo)?.label || p.tipo}
                                  {p.num2 > 0 ? <> + {p.num2}× {CONTS.find((c) => c.id === p.soporte)?.label || p.soporte || "soporte"}</> : null}
                                  {" · "}bruto {fmt(p.bruto)} − tara {fmt(taraPesada(p))} = <b className="text-gray-800">{fmt(netoPesada(p))} kg</b> <span className="text-gray-400">({p.hora})</span>
                                </span>
                                {h.estado !== "enviada" && <button onClick={() => delPesada(m, h.id, p.id)} title="Quitar pesada" className="text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button>}
                              </div>
                            ))}
                          </div>
                        )}
                        {h.estado === "abierta" && (
                          <div className="flex items-end gap-2 flex-wrap bg-indigo-50/40 rounded-lg p-2">
                            <div className="flex-1 min-w-[80px]"><label className="text-[10px] text-gray-500 block">Bruto (kg)</label><input type="number" value={pesForm.bruto} onChange={(e) => setPesForm((f) => ({ ...f, bruto: e.target.value }))} className="w-full text-sm px-2 py-1 border border-gray-200 rounded" placeholder="kg" /></div>
                            <div className="w-24"><label className="text-[10px] text-gray-500 block">Contenedor</label>
                              <select value={pesForm.tipo} onChange={(e) => { const c = CONTS.find((x) => x.id === e.target.value); setPesForm((f) => ({ ...f, tipo: e.target.value, tara: c ? c.tara : f.tara })); }} className="w-full text-sm px-1 py-1 border border-gray-200 rounded bg-white">
                                {CONTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                            </div>
                            <div className="w-16"><label className="text-[10px] text-gray-500 block">Tara c/u</label><input type="number" value={pesForm.tara} onChange={(e) => setPesForm((f) => ({ ...f, tara: e.target.value }))} className="w-full text-sm px-1 py-1 border border-gray-200 rounded" /></div>
                            <div className="w-12"><label className="text-[10px] text-gray-500 block">Nº</label><input type="number" min="1" value={pesForm.num} onChange={(e) => setPesForm((f) => ({ ...f, num: e.target.value }))} className="w-full text-sm px-1 py-1 border border-gray-200 rounded" /></div>
                            {/* SOPORTE: cuando las cajas se pesan ARRIBA de una parrilla/tarima, hay
                                que restar también su peso. Opcional: en 0 no resta nada. */}
                            <div className="w-24"><label className="text-[10px] text-gray-500 block">Sobre (soporte)</label>
                              <select value={pesForm.soporte} onChange={(e) => { const c = CONTS.find((x) => x.id === e.target.value); setPesForm((f) => ({ ...f, soporte: e.target.value, tara2: c ? c.tara : f.tara2, num2: (parseInt(f.num2, 10) || 0) === 0 ? "1" : f.num2 })); }} className="w-full text-sm px-1 py-1 border border-gray-200 rounded bg-white">
                                <option value="">— sin soporte —</option>
                                {CONTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                            </div>
                            <div className="w-16"><label className="text-[10px] text-gray-500 block">Tara c/u</label><input type="number" value={pesForm.tara2} onChange={(e) => setPesForm((f) => ({ ...f, tara2: e.target.value }))} disabled={!pesForm.soporte} className="w-full text-sm px-1 py-1 border border-gray-200 rounded disabled:bg-gray-50" /></div>
                            <div className="w-12"><label className="text-[10px] text-gray-500 block">Nº</label><input type="number" min="0" value={pesForm.num2} onChange={(e) => setPesForm((f) => ({ ...f, num2: e.target.value }))} disabled={!pesForm.soporte} className="w-full text-sm px-1 py-1 border border-gray-200 rounded disabled:bg-gray-50" /></div>
                            <div className="text-xs text-gray-600 pb-1.5">= <b className="text-green-700">{fmt(netoPreview)} kg</b></div>
                            <button onClick={() => addPesada(m, h.id)} disabled={!(parseFloat(pesForm.bruto) > 0)} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1"><Plus size={14} /> Agregar</button>
                            <div className="w-full text-[10px] text-gray-500">
                              neto = bruto − ({parseInt(pesForm.num, 10) || 1} × {parseFloat(pesForm.tara) || 0} kg)
                              {(parseInt(pesForm.num2, 10) || 0) > 0 && <> − ({parseInt(pesForm.num2, 10)} × {parseFloat(pesForm.tara2) || 0} kg de {CONTS.find((c) => c.id === pesForm.soporte)?.label || "soporte"})</>}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap mt-2 justify-end">
                          {h.estado === "abierta" && <button onClick={() => cerrarHoraFn(m, h.id)} disabled={(h.pesadas || []).length === 0} className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg font-medium hover:bg-amber-50 disabled:opacity-40 inline-flex items-center gap-1"><Check size={14} /> Cerrar hora</button>}
                          {h.estado === "cerrada" && (
                            <>
                              {h.aprobacion && <span className="text-[11px] text-green-700 inline-flex items-center gap-1 mr-auto"><Check size={13} /> Aprobado por {h.aprobacion.por}</span>}
                              {/* No se reabre una hora con envío SIN CONFIRMAR: primero hay que
                                  saber si ese recibo quedó en SAP, si no se corrige a ciegas. */}
                              {h.sapPendiente ? (
                                <span title="Esta hora tiene un envío pendiente de confirmar: verifícalo en SAP antes de corregirla" className="text-xs px-3 py-1.5 border border-gray-200 text-gray-300 rounded-lg font-medium cursor-not-allowed inline-flex items-center gap-1"><RotateCcw size={14} /> Reabrir</span>
                              ) : (
                                <button onClick={() => reabrirHoraFn(m, h.id)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 inline-flex items-center gap-1"><RotateCcw size={14} /> Reabrir (corregir)</button>
                              )}
                              {h.aprobacion ? (
                                esHist(m) ? (
                                  <span title={`Folio anterior al corte (${goLiveSAP}): ya se registró fuera de la app`} className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-500 bg-gray-50 rounded-lg font-semibold inline-flex items-center gap-1"><Ban size={13} /> Histórico — no se manda a SAP</span>
                                ) : h.sapPendiente ? (
                                  // G4: el envío se interrumpió → NO se reenvía a ciegas, se verifica en SAP.
                                  <button onClick={() => verificarPendiente(m, { tipo: "hora", id: h.id }, h.sapPendiente)} disabled={verificando === h.sapPendiente.clave}
                                    className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1">
                                    <Search size={14} /> {verificando === h.sapPendiente.clave ? "Consultando SAP…" : "⏳ Verificar en SAP"}
                                  </button>
                                ) : puedeEnviarSap ? (
                                  <button onClick={() => abrirEnvioHora(m, h)} disabled={!(cub > 0)} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-40 inline-flex items-center gap-1"><Send size={14} /> Mandar a SAP ({cub} cub)</button>
                                ) : (
                                  <span title="No tienes permiso para mandar a SAP (empaque.vaciado.enviar_sap)" className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg font-semibold cursor-not-allowed inline-flex items-center gap-1"><Ban size={13} /> Sin permiso para enviar a SAP</span>
                                )
                              ) : (
                                <>
                                  {puedeAprobar ? (
                                    <button onClick={() => aprobarHora(m, h)} disabled={!(cub > 0)} className="text-xs px-3 py-1.5 border border-green-400 text-green-700 rounded-lg font-semibold hover:bg-green-50 disabled:opacity-40 inline-flex items-center gap-1"><Check size={14} /> Aprobar cálculo</button>
                                  ) : (
                                    <span title="Solo la encargada (gerente o admin) puede aprobar y habilitar el envío a SAP" className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg font-semibold cursor-not-allowed inline-flex items-center gap-1"><Ban size={13} /> Solo la encargada puede aprobar</span>
                                  )}
                                  <span title="Falta que la encargada apruebe el cálculo para habilitar el envío a SAP" className="text-xs px-3 py-1.5 border border-gray-200 text-gray-300 rounded-lg font-semibold cursor-not-allowed inline-flex items-center gap-1"><Send size={14} /> Mandar a SAP</span>
                                </>
                              )}
                            </>
                          )}
                          {h.estado === "enviada" && <span className="text-xs px-3 py-1.5 border border-green-200 bg-green-50 text-green-700 rounded-lg font-semibold inline-flex items-center gap-1"><Check size={14} /> SAP #{h.sapEnvio?.docNum} · {h.sapEnvio?.cubetas} cub</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Abrir hora */}
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-gray-500">{hayAbierta ? "Cierra la hora abierta para abrir otra." : "Puedes abrir varias horas (incluso en días distintos) hasta acabar el piso."}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setEditCont(true)} title="Editar los pesos (tara) de los contenedores" className="text-xs px-2 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"><Save size={13} /> Pesos</button>
                  <select value={pesForm.tipo} onChange={(e) => { const c = CONTS.find((x) => x.id === e.target.value); setPesForm((f) => ({ ...f, tipo: e.target.value, tara: c ? c.tara : f.tara })); }} className="text-xs px-2 py-1.5 border border-gray-200 rounded bg-white">{CONTS.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.tara}kg)</option>)}</select>
                  <button onClick={() => nuevaHora(m)} disabled={hayAbierta} className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1"><Plus size={14} /> Abrir hora</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Confirmación: mandar UNA hora a SAP ── */}
      {horaSap && (() => {
        const m = movimientos.find((x) => x.id === horaSap.m.id) || horaSap.m;
        const hora = (m.vaciado?.horas || []).find((h) => h.id === horaSap.hora.id) || horaSap.hora;
        const ord = ordenSAPde(m);
        const neto = netoHora(hora);
        const kgc = parseFloat(horaKgCub) || 6;
        const cubetas = cubetasDe(neto, kgc);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setHoraSap(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-gray-100 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 w-full"><Send size={16} /> Mandar {hora.etiqueta} a SAP — Folio {m.folio || "—"}</div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><div className="text-gray-400">Temporada</div><div className="font-semibold">{ord?.temporada || "—"}</div></div>
                  <div><div className="text-gray-400">Rancho</div><div className="font-semibold">{ord?.rancho || "—"}</div></div>
                  <div><div className="text-gray-400">Orden fabricación</div><div className="font-semibold">#{(ord?.docNum ?? ord?.absoluteEntry) ?? "—"}</div></div>
                  <div><div className="text-gray-400">Ejote neto de la hora</div><div className="font-semibold">{fmt(neto)} kg</div></div>
                </div>
                {hora.aprobacion && <div className="text-[11px] text-green-700 inline-flex items-center gap-1"><Check size={13} /> Cálculo aprobado por {hora.aprobacion.por}</div>}
                {fichaOrdenSAP(m)}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs mb-1"><span className="text-gray-500">kg por cubeta</span><input type="number" value={horaKgCub} onChange={(e) => setHoraKgCub(e.target.value)} className="w-20 text-sm px-2 py-1 border border-gray-200 rounded text-right" /></div>
                  <div className="flex items-center justify-between"><span className="text-sm font-semibold text-indigo-700">Cubetas a SAP</span><span className="text-2xl font-bold text-indigo-700">{cubetas.toLocaleString()}</span></div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{fmt(neto)} kg ÷ {kgc} = {cubetas} cubetas → suma a "Cantidad completada".</div>
                </div>
                {!ord && <div className="inline-flex items-center gap-1 text-[11px] text-red-600"><AlertTriangle size={14} /> Este folio no tiene orden de fabricación en SAP.</div>}
                {horaSapError && <div className="text-[11px] text-red-600">No se pudo enviar: {horaSapError}</div>}
                {hora.sapPendiente && avisoPendiente(m, { tipo: "hora", id: hora.id }, hora.sapPendiente)}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
                <button onClick={() => setHoraSap(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                <button onClick={confirmarEnvioHora} disabled={horaEnviando || !ord || !(cubetas > 0) || !!hora.sapPendiente} title={hora.sapPendiente ? "Hay un envío pendiente de confirmar: verifícalo en SAP antes de volver a mandar" : undefined} className="text-xs px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">{horaEnviando ? "Enviando…" : "Confirmar envío a SAP"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Editor del catálogo de contenedores (peso/tara editable, se guarda en BD) ── */}
      {editCont && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" onClick={() => setEditCont(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[85vh] shadow-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-900">Contenedores y su peso (tara)</span>
              <button onClick={() => setEditCont(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-2 text-xs text-gray-400 border-b border-gray-100">El peso vacío (tara) se resta al pesar el ejote. Ej. Cubeta = 7 kg. Se guarda en tu BD.</div>
            <div className="px-5 py-3 overflow-y-auto space-y-2">
              {CONTS.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input value={c.label} onChange={(e) => updCont(c.id, "label", e.target.value)} className="flex-1 min-w-0 text-sm px-2 py-1.5 border border-gray-200 rounded" placeholder="Nombre" />
                  <div className="inline-flex items-center gap-1"><input type="number" value={c.tara} onChange={(e) => updCont(c.id, "tara", e.target.value)} className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded text-right" /><span className="text-xs text-gray-400">kg</span></div>
                  <button onClick={() => delCont(c.id)} disabled={CONTS.length <= 1} title="Quitar" className="text-red-400 hover:text-red-600 disabled:opacity-30 shrink-0"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <button onClick={addCont} className="text-xs px-3 py-1.5 border border-indigo-200 text-indigo-700 rounded-lg font-medium hover:bg-indigo-50 inline-flex items-center gap-1"><Plus size={14} /> Agregar contenedor</button>
              <button onClick={() => setEditCont(false)} className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Faltante: mandar a SAP lo que no se alcanzó a capturar por hora ── */}
      {faltanteMov && (() => {
        const m = movimientos.find((x) => x.id === faltanteMov.id) || faltanteMov;
        const ord = ordenSAPde(m);
        const list = m.vaciado?.ajustes || [];
        const pend = list.find((a) => !a.sapEnvio);
        const enviados = list.filter((a) => a.sapEnvio);
        const piso = kgEnPisoDe(m);
        const kgNum = parseFloat(faltanteKg) || 0;
        const cub = cubetasDe(kgNum);
        const excede = kgNum > piso + (pend?.kg || 0);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setFaltanteMov(null)}>
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Plus size={16} /> Enviar faltante — Folio {m.folio || m.remision || "—"}</div>
                  <div className="text-xs text-gray-400 truncate">{ord?.temporada || m.proyecto || ""}{loteDe(m) !== "—" ? ` · ${loteDe(m)}` : ""} · orden SAP #{(ord?.docNum ?? ord?.absoluteEntry) ?? "—"}</div>
                </div>
                <button onClick={() => setFaltanteMov(null)} className="text-gray-400 hover:text-gray-700 shrink-0"><X size={18} /></button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Úsalo cuando <b>no se alcanzó a capturar todo por hora</b>: manda de una vez los kg que faltaron.
                  Cuentan como vaciado (baja el "en piso") y se registran en SAP como cubetas.
                </div>

                {fichaOrdenSAP(m)}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-gray-400">Recibido</div><div className="font-semibold">{fmt(kgRecibidosDe(m))} kg</div></div>
                  <div><div className="text-gray-400">Vaciado</div><div className="font-semibold text-green-700">{fmt(kgVaciadosDe(m))} kg</div></div>
                  <div><div className="text-gray-400">En piso</div><div className="font-semibold text-amber-700">{fmt(piso)} kg</div></div>
                </div>

                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[130px]">
                    <label className="text-[11px] text-gray-500 block mb-0.5">Kilos faltantes</label>
                    <input type="number" value={faltanteKg} onChange={(e) => setFaltanteKg(e.target.value)}
                      className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded-lg" placeholder="kg" />
                  </div>
                  <div className="text-sm text-gray-600 pb-1.5">÷ 6 = <b className="text-indigo-700">{cub} cubetas</b></div>
                </div>
                {excede && <div className="text-[11px] text-amber-600 inline-flex items-center gap-1"><AlertTriangle size={13} /> Es MÁS de lo que hay en piso ({fmt(piso)} kg) — revísalo antes de aprobar.</div>}

                {!pend ? (
                  <button onClick={() => guardarFaltante(m)} disabled={!(kgNum > 0)}
                    className="w-full text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center justify-center gap-1">
                    <Plus size={14} /> Registrar faltante
                  </button>
                ) : (
                  <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">Faltante #{pend.seq} · {fmt(pend.kg)} kg · {cubetasDe(pend.kg)} cub</span>
                      {pend.aprobacion
                        ? <span className="text-[11px] text-green-700 inline-flex items-center gap-1"><Check size={13} /> Aprobado por {pend.aprobacion.por}</span>
                        : <span className="text-[11px] text-amber-700">Falta aprobar</span>}
                    </div>
                    {Math.round(kgNum) !== Math.round(pend.kg) && kgNum > 0 && (
                      <button onClick={() => guardarFaltante(m)} className="text-xs px-3 py-1.5 border border-indigo-300 text-indigo-700 rounded-lg font-medium hover:bg-indigo-50">
                        Guardar {fmt(kgNum)} kg (habrá que re-aprobar)
                      </button>
                    )}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button onClick={() => quitarFaltante(m, pend)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 inline-flex items-center gap-1"><Trash2 size={14} /> Quitar</button>
                      {!pend.aprobacion && (puedeAprobar ? (
                        <button onClick={() => aprobarFaltante(m, pend)} className="text-xs px-3 py-1.5 border border-green-400 text-green-700 rounded-lg font-semibold hover:bg-green-50 inline-flex items-center gap-1"><Check size={14} /> Aprobar cálculo</button>
                      ) : (
                        <span title="Solo la encargada (gerente o admin) puede aprobar" className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg font-semibold inline-flex items-center gap-1"><Ban size={13} /> Solo la encargada puede aprobar</span>
                      ))}
                      {pend.aprobacion ? (pend.sapPendiente ? (
                        <span className="text-[11px] px-3 py-1.5 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg font-semibold">⏳ Pendiente de confirmar — verifícalo abajo</span>
                      ) : puedeEnviarSap ? (
                        <button onClick={() => enviarFaltanteSAP(m, pend)} disabled={faltanteEnviando}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1">
                          <Send size={14} /> {faltanteEnviando ? "Enviando…" : `Mandar a SAP (${cubetasDe(pend.kg)} cub)`}
                        </button>
                      ) : (
                        <span title="No tienes permiso para mandar a SAP" className="text-[11px] px-3 py-1.5 border border-gray-200 text-gray-400 rounded-lg font-semibold inline-flex items-center gap-1"><Ban size={13} /> Sin permiso para enviar</span>
                      )) : (
                        <span title="Falta que la encargada apruebe el cálculo" className="text-xs px-3 py-1.5 border border-gray-200 text-gray-300 rounded-lg font-semibold cursor-not-allowed inline-flex items-center gap-1"><Send size={14} /> Mandar a SAP</span>
                      )}
                    </div>
                  </div>
                )}

                {enviados.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Faltantes ya enviados</div>
                    {enviados.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 text-xs bg-green-50 border border-green-200 rounded-lg px-2 py-1.5 flex-wrap">
                        <span className="text-gray-700">Faltante #{a.seq} · {fmt(a.kg)} kg · {a.sapEnvio?.cubetas} cub</span>
                        <span className="text-green-700 font-semibold inline-flex items-center gap-1"><Check size={13} /> SAP #{a.sapEnvio?.docNum}</span>
                      </div>
                    ))}
                  </div>
                )}

                {faltanteError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{faltanteError}</div>}
                {pend?.sapPendiente && avisoPendiente(m, { tipo: "ajuste", id: pend.id }, pend.sapPendiente)}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
