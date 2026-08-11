import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { Eye, Pencil, Trash2, Plus, FileText, RefreshCw, Truck, Receipt, Check, X, AlertTriangle, MapPin, Sprout, Boxes, Inbox, Package } from "lucide-react";
import InfoTip from "../components/InfoTip";
import { useDatos, nuevoId } from "../store/datos";
import { useAuth } from "../store/auth";
import { getCatalogoProyectosSAP, getProyectosSAP, getProveedoresFleteSAP, getItemsFleteSAP, getTaxCodesSAP, getCultivosSAP, getDepartamentosSAP, crearOrdenCompraSAP, getEstadoOCSAP } from "../store/api";
import { guardarFolioOC } from "../utils/folioOC";
import SearchSelect from "../components/SearchSelect";
import { useDialog } from "../components/Dialog";
import ControlFletesPagina from "../components/ControlFletesPagina";

import { hoyISO } from "../utils/fecha";

// Fecha en que el empaque recibió el flete. La estampa M9 (Recepción) al dar
// recepción (`recepcion.fechaLlegada`). Queda vacía mientras el flete no se reciba.
function fechaReciboEmpaque(m) {
  return m.recepcion?.estado === "recibido" ? (m.recepcion.fechaLlegada || "") : "";
}

// Días entre la salida de campo y el recibo en empaque (el "plazo" en que llegó).
function diasPlazo(salidaISO, reciboISO) {
  if (!salidaISO || !reciboISO) return null;
  const a = new Date(salidaISO + "T00:00:00");
  const b = new Date(reciboISO + "T00:00:00");
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export default function Modulo8() {
  const { movimientos, setMovimientos, cargaCampo, setCargaCampo, ubicaciones, setUbicaciones, lineas, setLineas, zonas, setZonas, consignados, setConsignados, proyectos, setProyectos, proveedores, setProveedores } = useDatos();
  const { alcance, usuario, can } = useAuth();   // proyectos/cultivos + empresa + permisos (§2.1)
  // Aislamiento por EMPRESA: cada quien ve solo el catálogo/datos de SU empresa. Un proyecto sin
  // etiqueta `empresa` se considera de la empresa ANCLA = 1 (SL Agrícola, la primera/original).
  const miEmpresa = usuario?.id_empresa ?? null;
  const acotaEmpresa = miEmpresa != null;
  const empresaDeProy = (code) => { const p = (proyectos || []).find((x) => x.code === code); return p?.empresa ?? null; };
  // "Es de mi empresa": sin etiqueta (null = viejo/no sincronizado) cuenta como MÍO; si está
  // etiquetado, debe coincidir. Así el catálogo sin etiqueta no se oculta (antes se asumía ancla=1).
  const esDeMiEmpresa = (emp) => !acotaEmpresa || emp == null || emp === miEmpresa;
  const dlg = useDialog();

  const [modal, setModal] = useState(false);
  const [verFletes, setVerFletes] = useState(false);   // página Control de fletes · FRUTA (SAP)
  const [editId, setEditId] = useState(null); // id del movimiento que se está editando (null = nuevo)
  const [catCarga, setCatCarga] = useState(false);
  const [catUbic, setCatUbic] = useState(false);
  const [catZonas, setCatZonas] = useState(false);
  const [catConsig, setCatConsig] = useState(false);
  const [verMov, setVerMov] = useState(null);

  // ── SAP: catálogo Proyecto → Ranchos (upsert al store `proyectos`) ──
  const [sapCargando, setSapCargando] = useState(false);
  const [sapError, setSapError] = useState("");
  const [sapInfo, setSapInfo] = useState("");
  const [sapFiltro, setSapFiltro] = useState(""); // filtra qué proyecto se muestra en el editor
  const [sapDisp, setSapDisp] = useState([]);     // temporadas DISPONIBLES en SAP (para el buscador)
  const [sapPick, setSapPick] = useState("");     // temporada elegida en el buscador

  // Merge SAP → store, conservando responsables manuales y SIN borrar nada local.
  const mergeProyectos = (prev, sapList, onlyExisting = false) => {
    const base = Array.isArray(prev) ? prev : [];
    const next = base.map((p) => ({ ...p, ranchos: (p.ranchos || []).map((r) => ({ ...r })) }));
    for (const sp of sapList) {
      // Empate por code: MI empresa o SIN etiqueta (null = viejo/pre-multiempresa). Un sync de OTRA
      // empresa con el mismo code crea su propia entrada. Si el existente estaba sin etiqueta, se
      // RE-ETIQUETA a mi empresa → el catálogo viejo queda tuyo y deja de ocultarse al recargar.
      let proj = next.find((p) => p.code === sp.code && (p.empresa == null || p.empresa === miEmpresa));
      if (!proj) { if (onlyExisting) continue; proj = { code: sp.code, nombre: sp.nombre, empresa: miEmpresa, ranchos: [] }; next.push(proj); }
      else if (miEmpresa != null && proj.empresa == null) proj.empresa = miEmpresa;
      for (const sr of (sp.ranchos || [])) {
        const sap = { item: sr.item, ordenes: sr.ordenes, plannedQty: sr.plannedQty, completedQty: sr.completedQty };
        // Identidad del rancho = (lote + cultivo): un mismo lote con 2 cultivos son 2 ranchos.
        // sapKey = Lote original (permite renombrar sin duplicar); el cultivo desambigua.
        const cul = sr.cultivo || "";
        const ex = proj.ranchos.find((r) => r.sapKey === sr.nombre && (r.cultivo || "") === cul)
          || proj.ranchos.find((r) => !r.sapKey && r.sap && r.nombre === sr.nombre && (r.cultivo || "") === cul);
        if (!ex) proj.ranchos.push({ nombre: sr.nombre, departamento: sr.departamento || "", cultivo: cul, responsables: [], sap, sapKey: sr.nombre });
        else { ex.sapKey = sr.nombre; ex.departamento = ex.departamento || sr.departamento || ""; ex.cultivo = cul || ex.cultivo || ""; ex.sap = sap; } // nombre/responsables editados se conservan
      }
    }
    return next;
  };
  // Carga las temporadas de SAP (con sus ranchos/lotes), acotadas a lo PERMITIDO del usuario:
  // - Usuario acotado (§2.1): agrega + refresca SOLO sus proyectos asignados.
  // - Admin/sin alcance: todas las de su empresa (el ruteo del Paso G ya limita a su company).
  // mergeProyectos las etiqueta con la empresa del usuario, así quedan en su catálogo.
  const actualizarDeSAP = async () => {
    if (!puedeActualizarSAP) { setSapError("Necesitas temporadas asignadas para actualizar de SAP. Pídele a un administrador que te asigne."); return; }
    setSapCargando(true); setSapError(""); setSapInfo("");
    try {
      const data = await getCatalogoProyectosSAP("");
      let lista = data.proyectos || [];
      if (acotado) lista = lista.filter((p) => proyectosAsignados.has(p.code)); // solo lo permitido
      setProyectos((prev) => mergeProyectos(prev, lista, false));
      setSapInfo(acotado
        ? `Se cargaron tus temporadas permitidas (${lista.length}) desde SAP, con sus ranchos.`
        : `Temporadas actualizadas desde SAP (${lista.length}).`);
    } catch (e) {
      setSapError(String(e?.message || e));
    } finally {
      setSapCargando(false);
    }
  };
  // Trae UNA temporada específica de SAP (la elegida en el buscador) y la agrega al catálogo.
  const agregarTemporadaDeSAP = async (code) => {
    if (!code) return;
    setSapCargando(true); setSapError(""); setSapInfo("");
    try {
      const data = await getCatalogoProyectosSAP(code);
      const lista = (data.proyectos || []).filter((p) => p.code === code);
      setProyectos((prev) => mergeProyectos(prev, lista));
      setSapPick("");
      setSapInfo(`Temporada "${code}" traída de SAP`);
    } catch (e) {
      setSapError(String(e?.message || e));
    } finally {
      setSapCargando(false);
    }
  };
  // Al abrir el modal, carga la lista de temporadas DISPONIBLES en SAP (para el buscador).
  useEffect(() => {
    if (!catUbic) return;
    let cancel = false;
    (async () => {
      try { const d = await getProyectosSAP(); if (!cancel) setSapDisp(Array.isArray(d?.value) ? d.value : []); }
      catch { if (!cancel) setSapDisp([]); }
    })();
    return () => { cancel = true; };
  }, [catUbic]);

  // ── Control de fletes de ACARREO · FRUTA (SAP, solo lectura) → componente compartido ──

  // ── SAP · Fleteros (proveedores) + Orden de compra de flete (Paso 4) ──
  const [catFleteros, setCatFleteros] = useState(false);
  const [flCargando, setFlCargando] = useState(false);
  const [flError, setFlError] = useState("");
  const [flInfo, setFlInfo] = useState("");
  const [flBuscar, setFlBuscar] = useState("");
  const [ocMov, setOcMov] = useState(null);       // movimiento para la OC
  const [ocCardCode, setOcCardCode] = useState("");
  const [ocItem, setOcItem] = useState("");
  const [ocTax, setOcTax] = useState("");
  const [ocCultivo, setOcCultivo] = useState("");
  const [ocDepto, setOcDepto] = useState("");    // Departamento (CostingCode3); editable, no siempre "Campo"
  const [ocFecha, setOcFecha] = useState("");   // "Fecha necesaria" (RequiredDate) del flete
  const [ocComentario, setOcComentario] = useState("");
  const [ocDetalle, setOcDetalle] = useState("");   // "Detalles de artículo" de la línea (POR1.FreeText)
  const [ocCargando, setOcCargando] = useState(false);
  const [ocError, setOcError] = useState("");
  const [ocConfirm, setOcConfirm] = useState(false); // 2do paso: confirmar antes de escribir en SAP
  const [itemsFlete, setItemsFlete] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [cultivos, setCultivos] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);

  // ── TABLAS (en SAP: "Departamento", norma de reparto dim 3) ──
  // SAP NO guarda qué tablas tiene cada rancho: las normas de reparto son catálogos planos
  // (dim2 = ranchos, dim3 = tablas) y no están relacionadas. Así que la lista es la COMPLETA de
  // SAP, pero se ordenan arriba las que ya se han usado en ese rancho (aprendido del histórico
  // de movimientos): sin capturar nada, la lista se va afinando sola con el uso.
  const tablasUsadas = (rancho) => {
    if (!rancho) return [];
    const cuenta = {};
    (movimientos || []).forEach((m) => {
      if (m.rancho !== rancho) return;
      const d = (m.departamento || "").trim();
      if (d) cuenta[d] = (cuenta[d] || 0) + 1;
    });
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([d]) => d);
  };
  // Opciones del selector: primero las usadas en ese rancho, luego el resto del catálogo de SAP.
  const opcionesTablas = (rancho, valorActual) => {
    const etiqueta = (code) => {
      const d = departamentos.find((x) => x.FactorCode === code);
      return d?.FactorDescription && d.FactorDescription !== code ? `${code} · ${d.FactorDescription}` : code;
    };
    const usadas = tablasUsadas(rancho);
    const resto = departamentos.map((d) => d.FactorCode).filter((c) => c && !usadas.includes(c));
    const opts = [
      ...usadas.map((c) => ({ value: c, label: `★ ${etiqueta(c)}` })),   // ya usadas en este rancho
      ...resto.map((c) => ({ value: c, label: etiqueta(c) })),
    ];
    // Si el movimiento trae una tabla que ya no está en el catálogo, no se pierde.
    if (valorActual && !opts.some((o) => o.value === valorActual)) opts.unshift({ value: valorActual, label: valorActual });
    return opts;
  };

  // Traer fleteros de SAP → upsert al catálogo `proveedores` (por cardCode).
  const cargarProveedoresSAP = async () => {
    setFlCargando(true); setFlError(""); setFlInfo("");
    try {
      const d = await getProveedoresFleteSAP(flBuscar);
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
    // Carga catálogos y fija los defaults al vuelo (en el cargador, no en un useEffect,
    // para no disparar renders en cascada — regla react-hooks/set-state-in-effect).
    try {
      const d = await getItemsFleteSAP();
      const items = d.value || [];
      setItemsFlete(items);
      const it = items.find((x) => /acarreo de fruta/i.test(x.ItemName || "")) || items[0];
      if (it) setOcItem(it.ItemCode || "");
    } catch { /* noop */ }
    try {
      const d = await getTaxCodesSAP();
      const txs = d.value || [];
      setTaxCodes(txs);
      const t = txs.find((x) => /16/.test(`${x.Code} ${x.Name}`)) || txs[0];
      if (t) setOcTax(t.Code || "");
    } catch { /* noop */ }
    try { const d = await getCultivosSAP(); setCultivos(d.value || []); } catch { /* noop */ }
    try { const d = await getDepartamentosSAP(); setDepartamentos(d.value || []); } catch { /* noop */ }
  };
  const abrirOC = (m) => {
    setOcError(""); setOcConfirm(false); setOcCardCode(""); setOcItem(""); setOcTax("");
    // Default del cultivo: el que viene anidado al proyecto/rancho (editable abajo).
    const proj = (proyectos || []).find((p) => p.code === m.proyecto);
    const r = proj?.ranchos?.find((x) => x.nombre === m.rancho);
    setOcCultivo(r?.cultivo || "");
    // Default del Departamento: PRIMERO la TABLA que eligió quien creó el movimiento (es quien sabe
    // de dónde salió el flete); si el movimiento no la trae (los viejos), se cae al del catálogo
    // como antes. Sigue siendo editable aquí por si hay que corregir.
    setOcDepto(m.departamento || r?.departamento || "");
    setOcFecha(new Date().toISOString().slice(0, 10)); // Fecha necesaria default = hoy (editable)
    setOcComentario(`Acarreo flete · Folio ${m.folio || ""} · ${m.rancho || ""} · ${m.fecha || ""}${m.chofer ? " · " + m.chofer : ""}`.trim());
    // "Detalles de artículo" default: acarreo + cultivo + lote (editable). Sin factura/pagar.
    setOcDetalle([`ACARREO`, r?.cultivo, m.rancho ? `Lote ${m.rancho}` : ""].filter(Boolean).join(" · "));
    setOcMov(m);
    cargarCatalogosOC();
  };
  const confirmarOC = async () => {
    const m = ocMov;
    const precio = parseFloat(m.flete) || 0;
    if (!ocCardCode) { setOcError("Elige el fletero."); return; }
    if (!ocItem) { setOcError("Elige el item de flete."); return; }
    if (!(precio > 0)) { setOcError("El movimiento no tiene 'Flete $' (precio)."); return; }
    const proj = (proyectos || []).find((p) => p.code === m.proyecto);
    const r = proj?.ranchos?.find((x) => x.nombre === m.rancho);
    setOcCargando(true); setOcError("");
    try {
      const res = await crearOrdenCompraSAP({
        cardCode: ocCardCode, item: ocItem, precio, taxCode: ocTax,
        proyecto: m.proyecto || null, cultivo: ocCultivo || r?.cultivo || null, lote: m.rancho || null,
        departamento: ocDepto || r?.departamento || m.departamento || null, comentario: ocComentario,
        detalle: ocDetalle || null,   // "Detalles de artículo" de la línea (POR1.FreeText)
        requiredDate: ocFecha || null,
        movimientoId: m.id, origen: "movimiento",   // idempotencia: evita doble OC en SAP
      });
      setMovimientos((prev) => prev.map((x) => x.id === m.id ? { ...x, ocSAP: { solicitud: res.solicitud, pedido: res.pedido, cardCode: ocCardCode, item: ocItem, precio, taxCode: ocTax, ts: new Date().toISOString() } } : x));
      await guardarFolioOC(res?.pedido?.docEntry, m.folio);   // el folio del movimiento → Control de Fletes
      setOcMov(null);
    } catch (e) { setOcError(String(e?.message || e)); }
    finally { setOcCargando(false); }
  };

  // ── Estado de la OC en SAP (SOLO LECTURA): ¿ya tiene factura de proveedor? ──
  // Estado de factura por movimiento, EFÍMERO (no persiste al backend) → auto-refresco sin churn.
  const [estadosOC, setEstadosOC] = useState({});   // { [movId]: { factura, estado } }
  const estadosOCRef = useRef(estadosOC);
  useEffect(() => { estadosOCRef.current = estadosOC; }, [estadosOC]);

  // Auto-refresca en SAP el estado de factura de las OC (solo lectura): al abrir y cada 5 min.
  // Una vez FACTURADO ya no cambia → se deja de consultar. Secuencial para ser gentil con SAP.
  const movsRef = useRef(movimientos);
  useEffect(() => { movsRef.current = movimientos; }, [movimientos]);
  const refrescandoOCRef = useRef(false);
  const refrescarEstadosOC = useCallback(async () => {
    if (refrescandoOCRef.current) return;
    refrescandoOCRef.current = true;
    try {
      const pendientes = (movsRef.current || []).filter((m) => {
        if (!m.ocSAP?.pedido?.docEntry) return false;
        const ya = estadosOCRef.current[m.id]?.factura ?? m.ocSAP?.factura;
        return !ya?.existe;   // ya facturado → no re-consultar
      });
      for (const m of pendientes) {
        try {
          const est = await getEstadoOCSAP(m.ocSAP.pedido.docEntry);
          setEstadosOC((prev) => ({ ...prev, [m.id]: { factura: est.factura, estado: est.pedido } }));
        } catch { /* SAP no respondió: se deja como estaba */ }
      }
    } finally {
      refrescandoOCRef.current = false;
    }
  }, []);
  // Firma del conjunto de OCs presentes: cambia cuando cargan los movimientos del backend
  // o cuando se crea una OC nueva → así el refresco se dispara AL cargar (no solo al montar,
  // cuando la lista aún venía vacía) y no espera 5 min.
  const ocKey = (movimientos || []).filter((m) => m.ocSAP?.pedido?.docEntry).map((m) => m.id).join(",");
  useEffect(() => {
    refrescarEstadosOC();                                        // al abrir / al cargar OCs / al crear una
    const id = setInterval(refrescarEstadosOC, 5 * 60 * 1000);   // y cada 5 min
    return () => clearInterval(id);
  }, [ocKey, refrescarEstadosOC]);

  // ── Editor de Temporadas (manual + SAP) · estilo unificado, todo se guarda en BD ──
  const upTemp = (fn) => setProyectos((prev) => (Array.isArray(prev) ? prev : []).map(fn));
  const addTemporada = () => setProyectos((prev) => [...(Array.isArray(prev) ? prev : []), { code: nuevoId("TMP_"), nombre: "Nueva temporada", empresa: miEmpresa, ranchos: [] }]);
  const updTemporada = (code, val) => upTemp((p) => p.code === code ? { ...p, nombre: val } : p);
  const delTemporada = (code) => setProyectos((prev) => (Array.isArray(prev) ? prev : []).filter((p) => p.code !== code));
  const addRancho = (code) => upTemp((p) => p.code === code ? { ...p, ranchos: [...(p.ranchos || []), { nombre: "Nuevo rancho", departamento: "", responsables: [] }] } : p);
  const updRanchoFld = (code, ri, campo, val) => upTemp((p) => p.code === code ? { ...p, ranchos: p.ranchos.map((r, j) => j === ri ? { ...r, [campo]: val } : r) } : p);
  const delRancho = (code, ri) => upTemp((p) => p.code === code ? { ...p, ranchos: p.ranchos.filter((_, j) => j !== ri) } : p);
  const addResp = (code, ri) => upTemp((p) => p.code === code ? { ...p, ranchos: p.ranchos.map((r, j) => j === ri ? { ...r, responsables: [...(r.responsables || []), "Nuevo responsable"] } : r) } : p);
  const updResp = (code, ri, i, val) => upTemp((p) => p.code === code ? { ...p, ranchos: p.ranchos.map((r, j) => j === ri ? { ...r, responsables: (r.responsables || []).map((x, k) => k === i ? val : x) } : r) } : p);
  const delResp = (code, ri, i) => upTemp((p) => p.code === code ? { ...p, ranchos: p.ranchos.map((r, j) => j === ri ? { ...r, responsables: (r.responsables || []).filter((_, k) => k !== i) } : r) } : p);

  // Filtros de búsqueda de movimientos
  const [q, setQ] = useState("");
  const [fDestino, setFDestino] = useState("");
  const [fRancho, setFRancho] = useState("");

  // modos "nuevo" en la ficha
  const [lineaNueva, setLineaNueva] = useState(false);
  const [choferNuevo, setChoferNuevo] = useState(false);
  const [tractoNuevo, setTractoNuevo] = useState(false);
  const [cajaNueva, setCajaNueva] = useState(false);

  const formVacio = {
    folio: "", fecha: hoyISO(), viaje: "",
    proyecto: "", cultivo: "", rancho: "", departamento: "", lote: "", horaInicio: "", horaTermino: "", responsableCosecha: "",
    consignado: "", origen: "", distribuidor: "", destino: "",
    cargaItems: [{ prod: "", parrillas: "", bultos: "" }],
    // transporte
    linea: "", contacto: "", numero: "", chofer: "", telefono: "", licencia: "",
    marcaModelo: "", placaTracto: "", economicoCaja: "", placaCaja: "",
    telOperador: "", inicioPreenfriado: "", terminoPreenfriado: "", flete: "",
    // extra
    remision: "", pesoBascula: "", pesoTrailer: "",
    responsable: "Oscar",
  };
  const [form, setForm] = useState(formVacio);

  const resetModos = () => { setLineaNueva(false); setChoferNuevo(false); setTractoNuevo(false); setCajaNueva(false); };

  // Catálogo de TABLAS (departamentos de SAP) para el selector del movimiento. Se pide una vez;
  // si SAP no responde, el resto del formulario sigue funcionando igual.
  const cargarTablas = () => {
    if (departamentos.length) return;
    getDepartamentosSAP().then((d) => setDepartamentos(d.value || [])).catch(() => { /* noop */ });
  };

  const abrirNuevo = () => { setForm(formVacio); setEditId(null); resetModos(); setModal(true); cargarTablas(); };

  // Editar un movimiento existente. Si ya fue recibido/rechazado en M9, avisa que la
  // base de datos ya se afectó y hay que notificar manualmente.
  const abrirEditar = (m) => {
    const estado = m.recepcion?.estado;
    if (estado === "recibido" || estado === "rechazado") {
      dlg.alerta({ title: "Atención", message: `Este flete ya fue ${estado === "recibido" ? "RECIBIDO" : "RECHAZADO"} en Recepción en Empaque.\n\nLos cambios que hagas aquí NO actualizan automáticamente lo que ya quedó registrado en recepción/empaque. Debes AVISAR MANUALMENTE al área, porque la base de datos ya se afectó.`, danger: true });
    }
    // Protege contra registros del backend que vienen sin todos los campos.
    setForm({ ...formVacio, ...m, cargaItems: m.cargaItems?.length ? m.cargaItems : [{ prod: "", parrillas: "", bultos: "" }] });
    setEditId(m.id);
    resetModos();
    setModal(true);
    cargarTablas();
  };

  const cerrarModal = () => { setModal(false); setEditId(null); resetModos(); };

  const lineaSel = lineas.find((l) => l.linea === form.linea);
  const proyectoSel = proyectos.find((p) => p.code === form.proyecto); // proyecto elegido → sus ranchos
  // Cultivos de la temporada (acotados a los asignados del usuario). El selector de cultivo solo
  // aparece si hay 2+; con 1 se elige solo. Cada lote pertenece a un cultivo → se filtran por él.
  const cultivosAsignadosSet = new Set(alcance?.cultivos || []);
  // Cultivos que trae la temporada (de sus lotes); los "" (lotes sin cultivo en SAP) no cuentan aquí.
  const cultivosTemporadaTodos = [...new Set((proyectoSel?.ranchos || []).map((r) => r.cultivo).filter(Boolean))];
  const cultivosTemporada = cultivosTemporadaTodos
    .filter((c) => cultivosAsignadosSet.size === 0 || cultivosAsignadosSet.has(c))
    .sort((a, b) => a.localeCompare(b));
  const multiCultivo = cultivosTemporada.length >= 2;
  const cultivoUnico = cultivosTemporada.length === 1 ? cultivosTemporada[0] : "";
  // Cultivo EFECTIVO del movimiento: el elegido (si hay 2+) o el único (auto, sin selector). Es el
  // que se guarda y con el que se filtran los lotes → el recibo va a la orden de ESE cultivo.
  const cultivoEfectivo = form.cultivo || cultivoUnico;
  // La temporada tiene cultivos pero NINGUNO es de los tuyos → no puedes crear aquí (evita mandar
  // el recibo a la orden de un cultivo que no te toca, y no muestra lotes ajenos).
  const sinCultivoValido = cultivosTemporadaTodos.length > 0 && cultivosTemporada.length === 0;
  // Rancho elegido → responsables; se identifica por (lote + cultivo efectivo).
  const ranchoSelForm = proyectoSel?.ranchos.find((r) => r.nombre === form.rancho && (!cultivoEfectivo || (r.cultivo || "") === cultivoEfectivo));

  // Visualización del movimiento: la TEMPORADA va en el campo "Rancho", y el RANCHO elegido va en "Lote".
  // (Movimientos viejos sin `proyecto` siguen mostrando su rancho/lote original.)
  const tempNombre = (m) => (proyectos.find((p) => p.code === m.proyecto)?.nombre) || m.proyecto || "";
  const ranchoDe = (m) => (m.proyecto ? tempNombre(m) : (m.rancho || ""));
  const loteDe = (m) => (m.proyecto ? (m.rancho || "") : (m.lote || ""));

  // ── Carga (descripción) ──
  const updCargaItem = (i, campo, val) => setForm((f) => ({ ...f, cargaItems: f.cargaItems.map((it, j) => j === i ? { ...it, [campo]: val } : it) }));
  const addCargaItem = () => setForm((f) => ({ ...f, cargaItems: [...f.cargaItems, { prod: "", parrillas: "", bultos: "" }] }));
  const delCargaItem = (i) => setForm((f) => ({ ...f, cargaItems: f.cargaItems.filter((_, j) => j !== i) }));

  const totalParrillas = form.cargaItems.reduce((a, it) => a + (parseFloat(it.parrillas) || 0), 0);
  const totalBultos = form.cargaItems.reduce((a, it) => a + (parseFloat(it.bultos) || 0), 0);

  // ── Transporte (mismos catálogos del Tablero) ──
  const elegirLinea = (valor) => {
    if (valor === "__nueva__") {
      setLineaNueva(true);
      setForm((f) => ({ ...f, linea: "", contacto: "", numero: "", chofer: "", telefono: "", licencia: "", marcaModelo: "", placaTracto: "", economicoCaja: "", placaCaja: "" }));
      return;
    }
    setLineaNueva(false); setChoferNuevo(false); setTractoNuevo(false); setCajaNueva(false);
    const l = lineas.find((x) => x.id === valor);
    if (l) setForm((f) => ({ ...f, linea: l.linea, contacto: l.contacto, numero: l.numero, chofer: "", telefono: "", licencia: "", marcaModelo: "", placaTracto: "", economicoCaja: "", placaCaja: "" }));
    else setForm((f) => ({ ...f, linea: "", contacto: "", numero: "" }));
  };
  const elegirChofer = (valor) => {
    if (valor === "__nuevo__") { setChoferNuevo(true); setForm((f) => ({ ...f, chofer: "", telefono: "", licencia: "" })); return; }
    setChoferNuevo(false);
    const ch = (lineaSel?.choferes || []).find((c) => c.id === valor);
    if (ch) setForm((f) => ({ ...f, chofer: ch.nombre, telefono: ch.telefono, licencia: ch.licencia }));
    else setForm((f) => ({ ...f, chofer: "", telefono: "", licencia: "" }));
  };
  const elegirTracto = (valor) => {
    if (valor === "__nuevo__") { setTractoNuevo(true); setForm((f) => ({ ...f, marcaModelo: "", placaTracto: "" })); return; }
    setTractoNuevo(false);
    const tr = (lineaSel?.tractos || []).find((t) => t.id === valor);
    if (tr) setForm((f) => ({ ...f, marcaModelo: tr.marcaModelo || "", placaTracto: tr.placa }));
    else setForm((f) => ({ ...f, marcaModelo: "", placaTracto: "" }));
  };
  const elegirCaja = (valor) => {
    if (valor === "__nueva__") { setCajaNueva(true); setForm((f) => ({ ...f, economicoCaja: "", placaCaja: "" })); return; }
    setCajaNueva(false);
    const cj = (lineaSel?.cajas || []).find((c) => c.id === valor);
    if (cj) setForm((f) => ({ ...f, economicoCaja: cj.economico, placaCaja: cj.placa }));
    else setForm((f) => ({ ...f, economicoCaja: "", placaCaja: "" }));
  };

  // ── Guardar movimiento (y subcatálogos nuevos) ──
  const guardar = () => {
    let lineasActualizadas = lineas;
    if (lineaNueva && (form.linea || "").trim()) {
      const existe = lineas.some((l) => l.linea.toLowerCase() === form.linea.trim().toLowerCase());
      if (!existe) {
        lineasActualizadas = [...lineasActualizadas, { id: nuevoId("LN_"), linea: form.linea.trim(), contacto: form.contacto || "", numero: form.numero || "", choferes: [], tractos: [], cajas: [] }];
      }
    }
    const idxL = lineasActualizadas.findIndex((l) => l.linea.toLowerCase() === (form.linea || "").trim().toLowerCase());
    if (idxL >= 0) {
      const L = { ...lineasActualizadas[idxL] };
      L.choferes = [...(L.choferes || [])]; L.tractos = [...(L.tractos || [])]; L.cajas = [...(L.cajas || [])];
      if (choferNuevo && (form.chofer || "").trim() && !L.choferes.some((c) => c.nombre.toLowerCase() === form.chofer.trim().toLowerCase()))
        L.choferes.push({ id: nuevoId("CH_"), nombre: form.chofer.trim(), telefono: form.telefono || "", licencia: form.licencia || "" });
      if (tractoNuevo && (form.placaTracto || "").trim() && !L.tractos.some((t) => t.placa.toLowerCase() === form.placaTracto.trim().toLowerCase()))
        L.tractos.push({ id: nuevoId("TR_"), marcaModelo: form.marcaModelo || "", placa: form.placaTracto.trim() });
      if (cajaNueva && (form.placaCaja || "").trim() && !L.cajas.some((c) => c.placa.toLowerCase() === form.placaCaja.trim().toLowerCase()))
        L.cajas.push({ id: nuevoId("CJ_"), economico: form.economicoCaja || "", placa: form.placaCaja.trim() });
      lineasActualizadas = lineasActualizadas.map((l, i) => (i === idxL ? L : l));
    }
    if (lineasActualizadas !== lineas) setLineas(lineasActualizadas);

    if (editId) {
      setMovimientos((prev) => prev.map((mm) => (mm.id === editId ? { ...form, cultivo: cultivoEfectivo, id: editId, actualizado: new Date().toLocaleString("es-MX") } : mm)));
    } else {
      const mov = { ...form, cultivo: cultivoEfectivo, id: nuevoId("MOV_"), empresa: miEmpresa, creado: new Date().toLocaleString("es-MX") };
      setMovimientos((prev) => [mov, ...prev]);
    }
    setEditId(null);
    setModal(false);
    resetModos();
  };

  const borrarMov = async (id) => { if (await dlg.confirm({ title: "Eliminar movimiento", message: "¿Eliminar este movimiento?", confirmText: "Eliminar", danger: true })) setMovimientos((prev) => prev.filter((m) => m.id !== id)); };

  // ── Editores de catálogos ──
  const updCarga = (id, val) => setCargaCampo((prev) => prev.map((c) => c.id === id ? { ...c, label: val } : c));
  const addCarga = () => setCargaCampo((prev) => [...prev, { id: nuevoId("CC_"), label: "Nuevo tipo" }]);
  const delCarga = (id) => setCargaCampo((prev) => prev.filter((c) => c.id !== id));

  const updUbic = (tipo, id, val) => setUbicaciones((prev) => ({ ...prev, [tipo]: prev[tipo].map((u) => u.id === id ? { ...u, nombre: val } : u) }));
  const addUbic = (tipo) => setUbicaciones((prev) => ({ ...prev, [tipo]: [...prev[tipo], tipo === "origenes" ? { id: nuevoId("U_"), nombre: "Nuevo rancho", lotes: [], responsables: [] } : { id: nuevoId("U_"), nombre: "Nuevo empaque" }] }));
  const delUbic = (tipo, id) => setUbicaciones((prev) => ({ ...prev, [tipo]: prev[tipo].filter((u) => u.id !== id) }));

  // Catálogo de zonas (Viaje) — arreglo de texto
  const addZona = () => setZonas((p) => [...p, "Nueva zona"]);
  const updZona = (i, val) => setZonas((p) => p.map((z, j) => j === i ? val : z));
  const delZona = (i) => setZonas((p) => p.filter((_, j) => j !== i));

  // Catálogo compartido Consignado/Distribuidor — arreglo de texto
  const addConsig = () => setConsignados((p) => [...p, "Nueva empresa"]);
  const updConsig = (i, val) => setConsignados((p) => p.map((c, j) => j === i ? val : c));
  const delConsig = (i) => setConsignados((p) => p.filter((_, j) => j !== i));

  // ── Exportar a Excel (respeta los filtros activos) ──
  const exportarExcel = () => {
    if (movsFiltrados.length === 0) { dlg.alerta({ title: "Sin datos", message: "No hay movimientos para exportar con los filtros actuales." }); return; }
    const filas = movsFiltrados.map((m) => {
      const par = (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.parrillas) || 0), 0);
      const bul = (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.bultos) || 0), 0);
      const flete = parseFloat(m.flete) || 0;
      const pesoKg = parseFloat(m.pesoBascula) || 0;
      return {
        Folio: m.folio || "", "Salida campo": m.fecha || "", "Recibo empaque": fechaReciboEmpaque(m) || "",
        "Días en tránsito": (() => { const d = diasPlazo(m.fecha, fechaReciboEmpaque(m)); return d != null ? d : ""; })(),
        Remisión: m.remision || "",
        Viaje: m.viaje || "", Temporada: ranchoDe(m), Lote: loteDe(m),
        Tabla: m.departamento || "",   // = "Departamento" en SAP (norma de reparto dim 3)
        "Resp. cosecha": m.responsableCosecha || "", Consignado: m.consignado || "",
        Distribuidor: m.distribuidor || "", Origen: m.origen || "", Destino: m.destino || "",
        Línea: m.linea || "", Chofer: m.chofer || "", "Placa tracto": m.placaTracto || "",
        "No. caja": m.economicoCaja || "",
        Productos: (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(", "),
        Parrillas: par, Bultos: bul, "Peso báscula (kg)": pesoKg || "",
        Flete: flete || "", "$/kg": flete > 0 && pesoKg > 0 ? Number((flete / pesoKg).toFixed(2)) : "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    const hoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Movimientos_Campo_${hoy}.xlsx`);
  };

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const INP_TBL = "w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none";
  const LBL = "text-xs text-gray-500 block mb-0.5";

  // Filtrado de la lista de movimientos
  const qLow = q.trim().toLowerCase();
  // Alcance por usuario (§2.1): si tiene proyectos asignados, solo ve ESOS; sin asignaciones
  // (admin/gerente u otros) ve TODO. Fail-safe: un movimiento SIN proyecto no se oculta.
  const proyectosAsignados = new Set(alcance?.proyectos || []);
  const acotado = proyectosAsignados.size > 0;
  // Solo se puede "Actualizar de SAP" si tienes temporadas asignadas; un admin/gerente (que
  // administra el catálogo) sí puede aunque no tenga asignaciones.
  const puedeActualizarSAP = acotado || (can ? can("usuarios.administrar") : false);
  // Aislamiento por EMPRESA (primario): solo el catálogo de MI empresa (sin etiqueta → ancla 1).
  const proyectosDeMiEmpresa = acotaEmpresa ? proyectos.filter((p) => esDeMiEmpresa(p.empresa)) : proyectos;
  // Temporadas visibles en el form de crear: mi empresa + acotadas a los proyectos asignados (si aplica).
  const proyectosVisibles = acotado ? proyectosDeMiEmpresa.filter((p) => proyectosAsignados.has(p.code)) : proyectosDeMiEmpresa;
  // Cultivos visibles en la OC: acotados a los cultivos asignados (si el usuario tiene alguno).
  const cultivosAsignados = new Set(alcance?.cultivos || []);
  const acotadoCultivo = cultivosAsignados.size > 0;
  const movsFiltrados = movimientos.filter((m) => {
    if (!esDeMiEmpresa(m.empresa ?? empresaDeProy(m.proyecto))) return false;
    if (acotado && m.proyecto && !proyectosAsignados.has(m.proyecto)) return false;
    if (fDestino && m.destino !== fDestino) return false;
    if (fRancho && ranchoDe(m) !== fRancho) return false;
    if (qLow) {
      const campos = [m.folio, m.remision, m.rancho, m.lote, m.linea, m.chofer, m.origen, m.destino, m.viaje, m.consignado, m.distribuidor];
      if (!campos.some((c) => String(c ?? "").toLowerCase().includes(qLow))) return false;
    }
    return true;
  // Más reciente arriba (por fecha; desempata con la marca de creación si existe).
  }).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.creado || "").localeCompare(String(a.creado || "")));
  const destinosMov = [...new Set(movimientos.map((m) => m.destino).filter(Boolean))];
  const ranchosMov = [...new Set(movimientos.map((m) => ranchoDe(m)).filter(Boolean))];
  const hayFiltros = q || fDestino || fRancho;

  // ── Semáforo $/kg POR RUTA (destino), con umbrales derivados de TUS datos ──
  // Antes cada flete/kg se comparaba contra un PROMEDIO GLOBAL; con dos niveles de precio (rutas
  // baratas ~$1.5 y caras ~$3.1) el promedio caía en el hueco y casi todo salía rojo. Ahora cada
  // flete se compara contra la MEDIANA de $/kg de SU MISMO destino (robusta a extremos), y las
  // bandas verde/amarillo/rojo se calculan de la dispersión REAL (no un 5/10% inventado).
  const _mediana = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const _kgDe = (m) => { const f = parseFloat(m.flete) || 0; const p = parseFloat(m.pesoBascula) || 0; return f > 0 && p > 0 ? f / p : 0; };
  // Ruta = origen → destino. A un mismo empaque llegan orígenes muy distintos (distancias
  // distintas = costo distinto), así que se compara DENTRO de la misma ruta, no solo por destino.
  const _rutaDe = (m) => `${m.origen || "—"} → ${m.destino || "—"}`;
  // Mediana de $/kg por ruta = la referencia "normal" de esa ruta.
  const refKgPorRuta = (() => {
    const grupos = {};
    movimientos.forEach((m) => { const c = _kgDe(m); if (c > 0) (grupos[_rutaDe(m)] ||= []).push(c); });
    const ref = {};
    for (const [d, arr] of Object.entries(grupos)) ref[d] = { mediana: _mediana(arr), n: arr.length };
    return ref;
  })();
  // Umbrales de color derivados de la dispersión real: la desviación TÍPICA (mediana) vs la ruta.
  const _desvKg = movimientos.map((m) => {
    const c = _kgDe(m); const r = refKgPorRuta[_rutaDe(m)];
    return c > 0 && r && r.mediana > 0 && r.n >= 2 ? Math.abs(c - r.mediana) / r.mediana * 100 : null;
  }).filter((x) => x != null);
  const umbralVerde = _desvKg.length ? Math.max(3, Math.round(_mediana(_desvKg))) : 8;  // desviación típica de la ruta
  const umbralAmarillo = umbralVerde * 2;                                                // el doble = "revisar"
  const haySemaforo = _desvKg.length > 0;
  const semaforoKg = (costo, ruta) => {
    const r = refKgPorRuta[ruta];
    if (!costo || !r || !r.mediana) return null;
    if (r.n < 2) return { neutral: true, ref: r.mediana };   // único flete de esa ruta → nada con qué comparar
    const desv = Math.abs(costo - r.mediana) / r.mediana * 100;
    if (desv <= umbralVerde) return { cls: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500", desv, ref: r.mediana };
    if (desv <= umbralAmarillo) return { cls: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500", desv, ref: r.mediana };
    return { cls: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", desv, ref: r.mediana };
  };
  const limpiarFiltros = () => { setQ(""); setFDestino(""); setFRancho(""); };

  // Resumen de GASTO del conjunto FILTRADO (por proyecto/temporada, destino, búsqueda):
  // cajas movidas (Σ bultos), gasto total (Σ flete), $/caja (gasto÷cajas) y $/movida (gasto÷#).
  const gRes = movsFiltrados.reduce((acc, m) => {
    acc.cajas += (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.bultos) || 0), 0);
    acc.gasto += parseFloat(m.flete) || 0;
    return acc;
  }, { cajas: 0, gasto: 0 });
  const gPorCaja = gRes.cajas > 0 ? gRes.gasto / gRes.cajas : 0;
  const gPorMovida = movsFiltrados.length > 0 ? gRes.gasto / movsFiltrados.length : 0;
  const fmt2 = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lineaActualId = lineaNueva ? "__nueva__" : (lineaSel?.id || "");
  const choferActualId = choferNuevo ? "__nuevo__" : ((lineaSel?.choferes || []).find((c) => c.nombre === form.chofer)?.id || "");
  const tractoActualId = tractoNuevo ? "__nuevo__" : ((lineaSel?.tractos || []).find((t) => t.placa === form.placaTracto)?.id || "");
  const cajaActualId = cajaNueva ? "__nueva__" : ((lineaSel?.cajas || []).find((c) => c.placa === form.placaCaja)?.id || "");
  const hayLinea = !!form.linea;

  // Control de fletes (FRUTA): abre una página completa dentro del módulo, con botón "Regresar".
  if (verFletes) return <ControlFletesPagina tipo="fruta" proyectos={proyectos} onBack={() => setVerFletes(false)} />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 gap-y-3 mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Movimientos Internos Campo → Empaques</h1>
          <p className="text-sm text-gray-500 mt-0.5">Oscar · manifiesto de carga nacional desde campo</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setCatCarga(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200 inline-flex items-center gap-1"><Package size={14} /> Carga</button>
          <button onClick={() => setCatUbic(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200 inline-flex items-center gap-1"><MapPin size={14} /> Ranchos / Empaques</button>
          <button onClick={() => setCatZonas(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200 inline-flex items-center gap-1"><MapPin size={14} /> Zonas</button>
          <button onClick={() => setCatConsig(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200 inline-flex items-center gap-1"><Inbox size={14} /> Consignados</button>
          <button onClick={() => setCatFleteros(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200 inline-flex items-center gap-1"><Truck size={14} /> Fleteros</button>
          <button onClick={() => setVerFletes(true)} className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 inline-flex items-center gap-1"><Receipt size={14} /> Control fletes</button>
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">OS</div>
          <span className="text-sm font-medium text-gray-700">Oscar</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">Movimientos registrados ({movsFiltrados.length}{hayFiltros ? ` de ${movimientos.length}` : ""})</span>
            {haySemaforo && (
              <span className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                <span className="text-gray-400">$/kg vs mediana de su ruta:</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>≤{umbralVerde}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>≤{umbralAmarillo}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>&gt;{umbralAmarillo}%</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={exportarExcel} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 flex items-center gap-1"><FileText size={14} /> Excel{hayFiltros ? " (filtrado)" : ""}</button>
            <button onClick={abrirNuevo} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700">+ Nuevo movimiento</button>
          </div>
        </div>
        {movimientos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-white">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, remisión, rancho, chofer, línea…"
              className="w-full sm:flex-1 sm:min-w-[220px] text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <div className="w-full sm:w-44"><SearchSelect className={INP} value={fDestino} onChange={setFDestino} placeholder="Destino: todos" options={[{ value: "", label: "Destino: todos" }, ...destinosMov.map((d) => ({ value: d, label: d }))]} /></div>
            <div className="w-full sm:w-44"><SearchSelect className={INP} value={fRancho} onChange={setFRancho} placeholder="Temporada: todas" options={[{ value: "", label: "Temporada: todas" }, ...ranchosMov.map((r) => ({ value: r, label: r }))]} /></div>
            {hayFiltros && <button onClick={limpiarFiltros} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Limpiar</button>}
          </div>
        )}
        {movsFiltrados.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-100 bg-white">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Gasto de acarreo {fRancho ? `· ${fRancho}` : "· todas las temporadas"}{fDestino ? ` · ${fDestino}` : ""}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="rounded-lg border border-gray-200 px-3 py-2"><div className="text-[10px] text-gray-500 uppercase tracking-wide">Movimientos</div><div className="text-base font-bold text-gray-800">{movsFiltrados.length.toLocaleString("en-US")}</div></div>
              <div className="rounded-lg border border-gray-200 px-3 py-2"><div className="text-[10px] text-gray-500 uppercase tracking-wide">Cajas movidas</div><div className="text-base font-bold text-gray-800">{gRes.cajas.toLocaleString("en-US")}</div></div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2"><div className="text-[10px] text-indigo-600 uppercase tracking-wide flex items-center gap-1">Gasto total (flete)<InfoTip className="text-indigo-400">Suma de todos los fletes de los movimientos mostrados (según el filtro).<br /><b className="text-indigo-300">Fórmula:</b> suma del "Flete $" de cada movimiento.</InfoTip></div><div className="text-base font-bold text-indigo-700">${fmt2(gRes.gasto)}</div></div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><div className="text-[10px] text-emerald-600 uppercase tracking-wide flex items-center gap-1">$ / caja<InfoTip className="text-emerald-500">Cuánto cuesta mover cada caja.<br /><b className="text-emerald-300">Fórmula:</b> Gasto total (flete) ÷ Cajas movidas (bultos).</InfoTip></div><div className="text-base font-bold text-emerald-700">${fmt2(gPorCaja)}</div></div>
              <div className="rounded-lg border border-gray-200 px-3 py-2"><div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">$ / movida<InfoTip>Costo promedio por movimiento (viaje/flete).<br /><b className="text-gray-300">Fórmula:</b> Gasto total (flete) ÷ número de movimientos.</InfoTip></div><div className="text-base font-bold text-gray-800">${fmt2(gPorMovida)}</div></div>
            </div>
          </div>
        )}
        {movimientos.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">Sin movimientos. Registra el primero con "+ Nuevo movimiento".</div>
        ) : movsFiltrados.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">Ningún movimiento coincide con la búsqueda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Folio</th>
                  <th className="text-left px-3 py-2 font-medium">Salida / Recibo</th>
                  <th className="text-left px-3 py-2 font-medium">Temporada · Ruta</th>
                  <th className="text-left px-3 py-2 font-medium">Línea / Chofer</th>
                  <th className="text-right px-3 py-2 font-medium">Parr · Bultos</th>
                  <th className="text-right px-3 py-2 font-medium">Flete · $/kg</th>
                  <th className="text-right px-3 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.map((m) => {
                  const par = (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.parrillas) || 0), 0);
                  const bul = (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.bultos) || 0), 0);
                  const flete = parseFloat(m.flete) || 0;
                  const pesoKg = parseFloat(m.pesoBascula) || 0;
                  const costoKg = flete > 0 && pesoKg > 0 ? flete / pesoKg : 0;
                  const rec = fechaReciboEmpaque(m);
                  const dias = rec ? diasPlazo(m.fecha, rec) : null;
                  const s = semaforoKg(costoKg, _rutaDe(m));
                  const fac = estadosOC[m.id]?.factura ?? m.ocSAP?.factura;
                  return (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-3 py-2.5 font-bold text-red-600 whitespace-nowrap align-top">
                        {m.folio || "—"}
                        {/* ¿Ya tiene el peso del trailer? (necesario para el ejote neto exacto en empaque) */}
                        {(parseFloat(m.pesoBascula) || 0) > 0 && (
                          (parseFloat(m.pesoTrailer) || 0) > 0
                            ? <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><Check size={11} /> trailer {parseFloat(m.pesoTrailer).toLocaleString()} kg</div>
                            : <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><AlertTriangle size={11} /> falta trailer</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap align-top">
                        <div className="text-gray-700"><span className="text-gray-400">Sal</span> {m.fecha || "—"}</div>
                        {rec
                          ? <div className="text-green-700"><span className="text-gray-400">Rec</span> {rec}{dias != null && <span className="text-[10px] text-gray-400"> · {dias} {dias === 1 ? "día" : "días"}</span>}</div>
                          : <div className="text-gray-300 italic">Rec pendiente</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-700">{ranchoDe(m) || "—"}{loteDe(m) ? ` · ${loteDe(m)}` : ""}</div>
                        {m.departamento ? <div className="text-[10px] text-gray-400">tabla: {m.departamento}</div> : null}
                        <div className="text-[11px] text-gray-500">{m.origen || "—"} → {m.destino || "—"}</div>
                      </td>
                      <td className="px-3 py-2.5"><div className="font-medium text-gray-700">{m.linea || "—"}</div><div className="text-gray-400">{m.chofer || "—"}</div></td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="font-semibold text-green-700">{par || "—"} <span className="text-[10px] font-normal text-gray-400">parr</span></div>
                        <div className="font-semibold text-blue-700">{bul ? bul.toLocaleString() : "—"} <span className="text-[10px] font-normal text-gray-400">bultos</span></div>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="font-semibold text-green-700">{flete ? "$" + flete.toLocaleString() : "—"}</div>
                        {s?.neutral
                          ? <span className="mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500 font-semibold" title="Único flete de esta ruta — sin comparación"><span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>${costoKg.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</span>
                          : s
                          ? <span className={`mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${s.cls}`} title={`${s.desv.toFixed(1)}% vs la mediana de su ruta ($${s.ref.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg)`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}></span>${costoKg.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setVerMov(m)} title="Ver" className="p-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600"><Eye size={14} /></button>
                          <button onClick={() => abrirEditar(m)} title="Editar" className="p-1.5 border border-blue-200 rounded-lg bg-white hover:bg-blue-50 text-blue-600"><Pencil size={14} /></button>
                          {!m.ocSAP && <button onClick={() => abrirOC(m)} title="Crear OC en SAP" className="p-1.5 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 text-indigo-600"><FileText size={14} /></button>}
                          <button onClick={() => borrarMov(m.id)} title="Borrar" className="p-1.5 border border-red-200 rounded-lg bg-white hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                        </div>
                        {m.ocSAP && (
                          <div className="mt-1 flex flex-wrap gap-1 justify-end">
                            <span title="Documentos creados en SAP" className="text-[10px] px-2 py-0.5 border border-green-200 rounded-lg bg-green-50 text-green-700 inline-flex items-center gap-1"><Check size={12} /> Sol #{m.ocSAP.solicitud?.docNum ?? "?"} · Ped #{m.ocSAP.pedido?.docNum ?? "?"}</span>
                            {fac?.existe ? (
                              <span title={`Factura de proveedor en SAP${fac.docNum ? " #" + fac.docNum : ""}`} className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1"><Receipt size={12} /> Fact{fac.docNum ? ` #${fac.docNum}` : ""}</span>
                            ) : fac ? (
                              <span title="Aún sin factura de proveedor" className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 inline-flex items-center gap-1"><Receipt size={12} /> Sin factura</span>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal nuevo movimiento ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="text-sm font-semibold text-gray-900">{editId ? "Editar movimiento" : "Nuevo movimiento"} — Manifiesto de carga nacional</div>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-700 text-lg inline-flex items-center"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-5">

              {/* Encabezado del viaje */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos del viaje</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div><label className={LBL}>Folio</label><input className={INP} value={form.folio} onChange={(e) => setForm((f) => ({ ...f, folio: e.target.value }))} placeholder="No. 0203" /></div>
                  <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} /></div>
                  <div><label className={LBL}>Viaje (zona)</label>
                    <SearchSelect className={INP} value={form.viaje} onChange={(v) => setForm((f) => ({ ...f, viaje: v }))} placeholder="— Zona —"
                      options={zonas.map((z) => ({ value: z, label: z }))} />
                  </div>
                </div>
                <div className={`grid grid-cols-1 ${multiCultivo ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-2 mt-2`}>
                  <div>
                    <label className={LBL}>Temporada</label>
                    <SearchSelect className={INP} value={form.proyecto} onChange={(v) => setForm((f) => ({ ...f, proyecto: v, cultivo: "", rancho: "", departamento: "", responsableCosecha: "" }))} placeholder="— Temporada —"
                      options={(() => {
                        const opts = proyectosVisibles.map((p) => ({ value: p.code, label: p.nombre }));
                        if (form.proyecto && !opts.some((o) => o.value === form.proyecto)) {
                          const cur = proyectos.find((p) => p.code === form.proyecto);
                          opts.unshift({ value: form.proyecto, label: cur?.nombre || form.proyecto });
                        }
                        return opts;
                      })()} />
                  </div>
                  {multiCultivo && (
                    <div>
                      <label className={LBL}>Cultivo</label>
                      <SearchSelect className={INP} value={form.cultivo} disabled={!proyectoSel}
                        onChange={(v) => setForm((f) => ({ ...f, cultivo: v, rancho: "", departamento: "", responsableCosecha: "" }))}
                        placeholder="— Cultivo —" options={cultivosTemporada.map((c) => ({ value: c, label: c }))} />
                    </div>
                  )}
                  <div><label className={LBL}>Rancho</label>
                    <SearchSelect className={INP} value={form.rancho} disabled={!proyectoSel || sinCultivoValido || (multiCultivo && !form.cultivo)}
                      onChange={(v) => { const rr = proyectoSel?.ranchos.find((x) => x.nombre === v && (!cultivoEfectivo || (x.cultivo || "") === cultivoEfectivo)); setForm((f) => ({ ...f, rancho: v, departamento: rr?.departamento || "", responsableCosecha: "" })); }}
                      placeholder={!proyectoSel ? "Elige temporada" : sinCultivoValido ? "Sin cultivo tuyo aquí" : (multiCultivo && !form.cultivo) ? "Elige cultivo" : "— Rancho —"}
                      options={sinCultivoValido ? [] : (proyectoSel?.ranchos || []).filter((r) => !cultivoEfectivo || (r.cultivo || "") === cultivoEfectivo).map((r) => ({ value: r.nombre, label: r.nombre }))} />
                    {sinCultivoValido && <div className="text-[10px] text-amber-600 mt-0.5">No tienes asignado ningún cultivo de esta temporada. Pide que te asignen el cultivo correspondiente.</div>}
                  </div>
                  <div><label className={LBL}>Responsable cosecha</label>
                    <SearchSelect className={INP} value={form.responsableCosecha} onChange={(v) => setForm((f) => ({ ...f, responsableCosecha: v }))} disabled={!ranchoSelForm}
                      placeholder={ranchoSelForm ? "— Responsable —" : "Elige rancho"} options={(ranchoSelForm?.responsables || []).map((r) => ({ value: r, label: r }))} />
                  </div>
                </div>
                {/* TABLAS = el "Departamento" de SAP (norma de reparto dim 3). Se elige AQUÍ, al crear
                    el movimiento, porque quien captura el flete es quien sabe de qué tabla salió; la
                    OC la manda otra persona después. NO afecta la orden de fabricación (esa se
                    resuelve con temporada + rancho y su departamento siempre es Campo). */}
                <div className="mt-2">
                  <label className={LBL}>Tablas <span className="text-gray-400 font-normal">· de qué tabla del rancho salió este flete (en SAP es el "Departamento")</span></label>
                  <SearchSelect className={INP} value={form.departamento} disabled={!form.rancho} searchThreshold={0}
                    onChange={(v) => setForm((f) => ({ ...f, departamento: v }))}
                    placeholder={form.rancho ? "— Tabla —" : "Elige rancho"}
                    options={opcionesTablas(form.rancho, form.departamento)} />
                  {form.rancho && tablasUsadas(form.rancho).length > 0 && (
                    <div className="text-[10px] text-gray-400 mt-0.5">Arriba salen las tablas que ya se han usado en {form.rancho}.</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div><label className={LBL}>Hora inicio cosecha</label><input type="time" className={INP} value={form.horaInicio} onChange={(e) => setForm((f) => ({ ...f, horaInicio: e.target.value }))} /></div>
                  <div><label className={LBL}>Hora término cosecha</label><input type="time" className={INP} value={form.horaTermino} onChange={(e) => setForm((f) => ({ ...f, horaTermino: e.target.value }))} /></div>
                </div>
              </div>

              {/* Empresa / ruta */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Consignado / ruta</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LBL}>Consignado</label>
                    <SearchSelect className={INP} value={form.consignado} onChange={(v) => setForm((f) => ({ ...f, consignado: v }))} placeholder="— Consignado —"
                      options={consignados.map((c) => ({ value: c, label: c }))} />
                  </div>
                  <div><label className={LBL}>Distribuidor</label>
                    <SearchSelect className={INP} value={form.distribuidor} onChange={(v) => setForm((f) => ({ ...f, distribuidor: v }))} placeholder="— Distribuidor —"
                      options={consignados.map((c) => ({ value: c, label: c }))} />
                  </div>
                  <div>
                    <label className={LBL}>Origen</label>
                    <input className={INP} list="dl-origenes2" value={form.origen} onChange={(e) => setForm((f) => ({ ...f, origen: e.target.value }))} placeholder="Origen" />
                    <datalist id="dl-origenes2">{ubicaciones.origenes.map((o) => <option key={o.id} value={o.nombre} />)}</datalist>
                  </div>
                  <div>
                    <label className={LBL}>Destino</label>
                    <input className={INP} list="dl-destinos" value={form.destino} onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))} placeholder="Empaque destino" />
                    <datalist id="dl-destinos">{ubicaciones.destinos.map((d) => <option key={d.id} value={d.nombre} />)}</datalist>
                  </div>
                </div>
              </div>

              {/* Descripción de la carga */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Descripción de la carga</div>
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-2 py-1.5 font-medium">Producto</th>
                        <th className="text-right px-2 py-1.5 font-medium w-24">Parrillas</th>
                        <th className="text-right px-2 py-1.5 font-medium w-24">Bultos</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.cargaItems.map((it, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-2 py-1">
                            <SearchSelect
                              className={INP}
                              value={it.prod}
                              onChange={(v) => updCargaItem(i, "prod", v)}
                              placeholder="— Selecciona —"
                              options={cargaCampo.map((c) => ({ value: c.label, label: c.label }))}
                            />
                          </td>
                          <td className="px-2 py-1"><input type="number" className={INP + " text-right"} value={it.parrillas} onChange={(e) => updCargaItem(i, "parrillas", e.target.value)} /></td>
                          <td className="px-2 py-1"><input type="number" className={INP + " text-right"} value={it.bultos} onChange={(e) => updCargaItem(i, "bultos", e.target.value)} /></td>
                          <td className="px-2 py-1 text-center">{form.cargaItems.length > 1 && <button onClick={() => delCargaItem(i)} className="text-gray-300 hover:text-red-500 inline-flex items-center"><Trash2 size={14} /></button>}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                        <td className="px-2 py-1.5 text-right text-gray-600">TOTAL</td>
                        <td className="px-2 py-1.5 text-right text-green-700">{totalParrillas || 0}</td>
                        <td className="px-2 py-1.5 text-right text-blue-700">{totalBultos ? totalBultos.toLocaleString() : 0}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <button onClick={addCargaItem} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar fila</button>
              </div>

              {/* Remisión + báscula (BRUTO con trailer) + peso del trailer vacío */}
              <div className="grid grid-cols-2 gap-2">
                <div><label className={LBL}>Remisión</label><input className={INP} value={form.remision} onChange={(e) => setForm((f) => ({ ...f, remision: e.target.value }))} /></div>
                <div><label className={LBL}>Peso de báscula (kg) <span className="text-gray-400 font-normal">· bruto, con trailer</span></label><input className={INP} value={form.pesoBascula} onChange={(e) => setForm((f) => ({ ...f, pesoBascula: e.target.value }))} placeholder="kg" /></div>
              </div>
              {/* PESO DEL TRAILER VACÍO: se resta del bruto para llegar a la carga. Se puede dejar en
                  blanco y capturar DESPUÉS (el trailer se pesa vacío hasta que se descarga). */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className={LBL}>Peso del trailer vacío (kg)</label>
                  <input type="number" className={INP} value={form.pesoTrailer} onChange={(e) => setForm((f) => ({ ...f, pesoTrailer: e.target.value }))} placeholder="se puede capturar después" />
                </div>
                <div className="flex items-end pb-1">
                  {(() => {
                    const bruto = parseFloat(form.pesoBascula) || 0;
                    const trailer = parseFloat(form.pesoTrailer) || 0;
                    if (!bruto) return <span className="text-[11px] text-gray-400">Captura el bruto de báscula.</span>;
                    if (!trailer) return <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1"><AlertTriangle size={13} /> Falta el peso del trailer (se puede poner luego)</span>;
                    return <span className="text-[11px] text-gray-600">Carga (bruto − trailer): <b className="text-green-700">{(bruto - trailer).toLocaleString()} kg</b> <span className="text-gray-400">· falta el destare para el ejote neto</span></span>;
                  })()}
                </div>
              </div>

              {/* Transporte */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos del transporte</div>
                <div className="mb-2">
                  <label className={LBL}>Línea (del catálogo)</label>
                  <SearchSelect
                    className={INP}
                    value={lineaActualId}
                    onChange={(v) => elegirLinea(v)}
                    placeholder="— Selecciona una línea —"
                    options={[
                      ...lineas.map((l) => ({ value: l.id, label: l.linea })),
                      { value: "__nueva__", label: "+ Nueva línea de transporte" },
                    ]}
                  />
                </div>
                {lineaNueva && <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-2 inline-flex items-center gap-1"><Pencil size={14} /> Capturando línea nueva — se guarda en el catálogo al guardar</div>}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div><label className={LBL}>Línea</label><input className={INP + (lineaNueva ? "" : " bg-gray-50")} value={form.linea} readOnly={!lineaNueva} onChange={(e) => setForm((f) => ({ ...f, linea: e.target.value }))} /></div>
                  <div><label className={LBL}>Contacto</label><input className={INP + (lineaNueva ? "" : " bg-gray-50")} value={form.contacto} readOnly={!lineaNueva} onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))} /></div>
                  <div><label className={LBL}>Número</label><input className={INP + (lineaNueva ? "" : " bg-gray-50")} value={form.numero} readOnly={!lineaNueva} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} /></div>
                </div>

                {hayLinea && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className={LBL}>Chofer</label>
                      <SearchSelect
                        className={INP}
                        value={choferActualId}
                        onChange={(v) => elegirChofer(v)}
                        placeholder="— Selecciona chofer —"
                        options={[
                          ...(lineaSel?.choferes || []).map((c) => ({ value: c.id, label: c.nombre })),
                          { value: "__nuevo__", label: "+ Nuevo chofer" },
                        ]}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                        <input className={INP + (choferNuevo ? "" : " bg-gray-50")} value={form.chofer} readOnly={!choferNuevo} placeholder="Nombre" onChange={(e) => setForm((f) => ({ ...f, chofer: e.target.value }))} />
                        <input className={INP + (choferNuevo ? "" : " bg-gray-50")} value={form.telefono} readOnly={!choferNuevo} placeholder="Teléfono" onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
                        <input className={INP + (choferNuevo ? "" : " bg-gray-50")} value={form.licencia} readOnly={!choferNuevo} placeholder="Licencia" onChange={(e) => setForm((f) => ({ ...f, licencia: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className={LBL}>Tracto</label>
                      <SearchSelect
                        className={INP}
                        value={tractoActualId}
                        onChange={(v) => elegirTracto(v)}
                        placeholder="— Selecciona tracto —"
                        options={[
                          ...(lineaSel?.tractos || []).map((t) => ({ value: t.id, label: `${t.marcaModelo} · ${t.placa}` })),
                          { value: "__nuevo__", label: "+ Nuevo tracto" },
                        ]}
                      />
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <input className={INP + (tractoNuevo ? "" : " bg-gray-50")} value={form.marcaModelo} readOnly={!tractoNuevo} placeholder="Marca y modelo" onChange={(e) => setForm((f) => ({ ...f, marcaModelo: e.target.value }))} />
                        <input className={INP + (tractoNuevo ? "" : " bg-gray-50")} value={form.placaTracto} readOnly={!tractoNuevo} placeholder="Placa tracto" onChange={(e) => setForm((f) => ({ ...f, placaTracto: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className={LBL}>Caja (No. de caja / placas)</label>
                      <SearchSelect
                        className={INP}
                        value={cajaActualId}
                        onChange={(v) => elegirCaja(v)}
                        placeholder="— Selecciona caja —"
                        options={[
                          ...(lineaSel?.cajas || []).map((c) => ({ value: c.id, label: `${c.economico} · ${c.placa}` })),
                          { value: "__nueva__", label: "+ Nueva caja" },
                        ]}
                      />
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <input className={INP + (cajaNueva ? "" : " bg-gray-50")} value={form.economicoCaja} readOnly={!cajaNueva} placeholder="No. de caja / económico" onChange={(e) => setForm((f) => ({ ...f, economicoCaja: e.target.value }))} />
                        <input className={INP + (cajaNueva ? "" : " bg-gray-50")} value={form.placaCaja} readOnly={!cajaNueva} placeholder="Placas caja" onChange={(e) => setForm((f) => ({ ...f, placaCaja: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div><label className={LBL}>Teléfono del operador</label><input className={INP} value={form.telOperador} onChange={(e) => setForm((f) => ({ ...f, telOperador: e.target.value }))} /></div>
                  <div><label className={LBL}>Flete $</label><input className={INP} value={form.flete} onChange={(e) => setForm((f) => ({ ...f, flete: e.target.value }))} /></div>
                  <div><label className={LBL}>Inicio de preenfriado</label><input type="time" className={INP} value={form.inicioPreenfriado} onChange={(e) => setForm((f) => ({ ...f, inicioPreenfriado: e.target.value }))} /></div>
                  <div><label className={LBL}>Término de preenfriado</label><input type="time" className={INP} value={form.terminoPreenfriado} onChange={(e) => setForm((f) => ({ ...f, terminoPreenfriado: e.target.value }))} /></div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end sticky bottom-0 bg-white">
              <button onClick={cerrarModal} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={guardar} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">{editId ? "Guardar cambios" : "Guardar movimiento"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ver movimiento ── */}
      {verMov && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Movimiento · Folio {verMov.folio || "—"}</div>
              <button onClick={() => setVerMov(null)} className="text-gray-400 hover:text-gray-700 text-lg inline-flex items-center"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  ["Salida campo", verMov.fecha], ["Recibo empaque", fechaReciboEmpaque(verMov)],
                  ["Plazo (días)", (() => { const d = diasPlazo(verMov.fecha, fechaReciboEmpaque(verMov)); return d != null ? `${d} ${d === 1 ? "día" : "días"}` : ""; })()],
                  ["Viaje", verMov.viaje], ["Temporada", ranchoDe(verMov)], ["Lote", loteDe(verMov)],
                  ["Departamento", verMov.departamento], ["Inicio cosecha", verMov.horaInicio], ["Término cosecha", verMov.horaTermino],
                  ["Resp. cosecha", verMov.responsableCosecha], ["Consignado", verMov.consignado], ["Distribuidor", verMov.distribuidor],
                  ["Origen", verMov.origen], ["Destino", verMov.destino], ["Remisión", verMov.remision],
                  ["Peso báscula (kg)", verMov.pesoBascula],
                ].map(([l, v]) => (
                  <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                ))}
              </div>
              <div>
                <div className="text-gray-400 mb-1 font-medium uppercase">Carga</div>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="text-gray-400"><th className="text-left py-1">Producto</th><th className="text-right py-1">Parrillas</th><th className="text-right py-1">Bultos</th></tr></thead>
                  <tbody>
                    {(verMov.cargaItems || []).map((it, i) => (
                      <tr key={i} className="border-t border-gray-100"><td className="py-1">{it.prod || "—"}</td><td className="py-1 text-right">{it.parrillas || "—"}</td><td className="py-1 text-right">{it.bultos || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="text-gray-400 mb-1 font-medium uppercase">Transporte</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    ["Línea", verMov.linea], ["Chofer", verMov.chofer], ["Teléfono", verMov.telefono],
                    ["Licencia", verMov.licencia], ["Marca/Modelo", verMov.marcaModelo], ["Placa tracto", verMov.placaTracto],
                    ["No. caja", verMov.economicoCaja], ["Placa caja", verMov.placaCaja], ["Tel. operador", verMov.telOperador],
                    ["Inicio preenf.", verMov.inicioPreenfriado], ["Término preenf.", verMov.terminoPreenfriado], ["Flete", verMov.flete ? "$" + verMov.flete : ""],
                  ].map(([l, v]) => (
                    <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setVerMov(null)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal catálogo de carga ── */}
      {catCarga && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Catálogo de carga (qué se carga)</div>
              <button onClick={() => setCatCarga(false)} className="text-gray-400 hover:text-gray-700 text-lg inline-flex items-center"><X size={16} /></button>
            </div>
            <div className="px-5 py-4">
              {cargaCampo.map((c) => (
                <div key={c.id} className="flex items-center gap-2 mb-2">
                  <input value={c.label} onChange={(e) => updCarga(c.id, e.target.value)} className={INP_TBL} />
                  <button onClick={() => delCarga(c.id)} className="text-gray-300 hover:text-red-500 text-sm inline-flex items-center"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={addCarga} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar tipo</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatCarga(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ubicaciones ── */}
      {catUbic && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Ranchos / Empaques</div>
              <button onClick={() => setCatUbic(false)} className="text-gray-400 hover:text-gray-700 text-lg inline-flex items-center"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-5">
              {/* ── Temporadas (proyectos SAP + manuales) · editable; todo se guarda en BD ── */}
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="text-xs font-bold text-gray-700 inline-flex items-center gap-1"><Sprout size={16} /> Temporadas · con sus ranchos y responsables de cosecha</div>
                  <button onClick={actualizarDeSAP} disabled={sapCargando || !puedeActualizarSAP}
                    title={!puedeActualizarSAP ? "Necesitas temporadas asignadas para actualizar de SAP" : acotado ? "Carga tus temporadas permitidas desde SAP, con sus ranchos y lotes" : "Carga/actualiza las temporadas de tu empresa desde SAP"}
                    className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {sapCargando ? "…" : <span className="inline-flex items-center gap-1"><RefreshCw size={14} /> Actualizar de SAP</span>}
                  </button>
                </div>
                {!puedeActualizarSAP && <div className="text-[11px] text-amber-600 mb-1">Necesitas <b>temporadas asignadas</b> para actualizar de SAP. Pídele a un administrador que te asigne.</div>}
                {sapError && <div className="text-[11px] text-red-600 mb-1">No se pudo traer de SAP: {sapError}</div>}
                {sapInfo && <div className="text-[11px] text-green-700 mb-2">{sapInfo}. Lo que edites a mano se conserva al volver a traer.</div>}
                {proyectosDeMiEmpresa.length > 1 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] text-gray-500">Ver:</span>
                    <select value={sapFiltro} onChange={(e) => setSapFiltro(e.target.value)} className={INP + " w-auto"}>
                      <option value="">Todas las temporadas</option>
                      {proyectosDeMiEmpresa.map((p) => <option key={p.code} value={p.code}>{p.nombre}</option>)}
                    </select>
                  </div>
                )}
                {proyectosDeMiEmpresa.filter((p) => !sapFiltro || p.code === sapFiltro).map((p) => (
                  <div key={p.code} className="border border-gray-200 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <input value={p.nombre} onChange={(e) => updTemporada(p.code, e.target.value)} className={INP_TBL + " font-semibold"} placeholder="Nombre de la temporada" />
                      <button onClick={async () => { if (await dlg.confirm({ title: "Quitar temporada", message: "¿Quitar esta temporada del catálogo? (no toca SAP)", confirmText: "Quitar", danger: true })) delTemporada(p.code); }} className="text-gray-300 hover:text-red-500 text-sm inline-flex items-center" title="Eliminar temporada"><Trash2 size={14} /></button>
                    </div>
                    <div className="space-y-2 pl-1">
                      {(p.ranchos || []).map((r, ri) => (
                        <div key={ri} className="border border-gray-100 rounded-md p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <input value={r.nombre} onChange={(e) => updRanchoFld(p.code, ri, "nombre", e.target.value)} className={INP_TBL + " font-medium"} placeholder="Rancho" />
                            {r.cultivo && <span title="Cultivo de este lote (de SAP)" className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700 text-[11px]"><Sprout size={11} /> {r.cultivo}</span>}
                            <button onClick={() => delRancho(p.code, ri)} className="text-gray-300 hover:text-red-500 text-xs inline-flex items-center" title="Eliminar rancho"><Trash2 size={14} /></button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Departamento {r.sap ? <span className="text-gray-300 normal-case">· de SAP</span> : null}</div>
                              <input value={r.departamento || ""} onChange={(e) => updRanchoFld(p.code, ri, "departamento", e.target.value)} className={INP_TBL} placeholder="Departamento" />
                              {r.sap ? <div className="text-[10px] text-gray-400 mt-0.5">term {r.sap.completedQty ?? 0} / plan {r.sap.plannedQty ?? 0}</div> : null}
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Responsables de cosecha</div>
                              {(r.responsables || []).map((rr, i) => (
                                <div key={i} className="flex items-center gap-1 mb-1">
                                  <input value={rr} onChange={(e) => updResp(p.code, ri, i, e.target.value)} className={INP_TBL} />
                                  <button onClick={() => delResp(p.code, ri, i)} className="text-gray-300 hover:text-red-500 text-xs inline-flex items-center"><Trash2 size={14} /></button>
                                </div>
                              ))}
                              <button onClick={() => addResp(p.code, ri)} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded font-medium">+ Responsable</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => addRancho(p.code)} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded font-medium">+ Rancho</button>
                    </div>
                  </div>
                ))}
                {proyectosDeMiEmpresa.length === 0 && <div className="text-[11px] text-gray-400 italic mb-2">Aún no hay temporadas de tu empresa. Agrega una a mano o da clic en "Actualizar de SAP".</div>}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-gray-500 inline-flex items-center gap-1"><Plus size={14} /> Agregar temporada de SAP:</span>
                  <div className="w-64">
                    <SearchSelect className={INP} value={sapPick}
                      onChange={(v) => agregarTemporadaDeSAP(v)}
                      placeholder={sapDisp.some((c) => !proyectosDeMiEmpresa.some((p) => p.code === c)) ? "Buscar temporada en SAP…" : "(no hay nuevas en SAP)"}
                      options={sapDisp.filter((c) => !proyectosDeMiEmpresa.some((p) => p.code === c)).map((c) => ({ value: c, label: c }))} />
                  </div>
                  <button onClick={addTemporada} className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1" title="Crear una temporada vacía a mano (sin SAP)">o crear vacía</button>
                </div>
              </div>
              {/* Editor manual de ranchos viejos (Los Mochis/Culiacán) OCULTO a propósito.
                  Los datos en `ubicaciones.origenes` se conservan en la BD; ahora el catálogo
                  vivo es el de Temporadas de arriba. Para reactivarlo, restaurar este bloque. */}
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2 inline-flex items-center gap-1"><Boxes size={16} /> Destinos (empaques)</div>
                {ubicaciones.destinos.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 mb-2">
                    <input value={d.nombre} onChange={(e) => updUbic("destinos", d.id, e.target.value)} className={INP_TBL} />
                    <button onClick={() => delUbic("destinos", d.id)} className="text-gray-300 hover:text-red-500 text-sm inline-flex items-center"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={() => addUbic("destinos")} className="mt-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar empaque</button>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatUbic(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal zonas (Viaje) ── */}
      {catZonas && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1"><MapPin size={16} /> Zonas (Viaje)</div>
              <button onClick={() => setCatZonas(false)} className="text-gray-400 hover:text-gray-700 text-lg inline-flex items-center"><X size={16} /></button>
            </div>
            <div className="px-5 py-4">
              {zonas.map((z, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={z} onChange={(e) => updZona(i, e.target.value)} className={INP_TBL} />
                  <button onClick={() => delZona(i)} className="text-gray-300 hover:text-red-500 text-sm inline-flex items-center"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={addZona} className="mt-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar zona</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatZonas(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal consignados / distribuidores (catálogo compartido) ── */}
      {catConsig && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1"><Inbox size={16} /> Consignados / Distribuidores</div>
                <div className="text-xs text-gray-500 mt-0.5">Mismo catálogo para ambos campos</div>
              </div>
              <button onClick={() => setCatConsig(false)} className="text-gray-400 hover:text-gray-700 text-lg inline-flex items-center"><X size={16} /></button>
            </div>
            <div className="px-5 py-4">
              {consignados.map((c, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={c} onChange={(e) => updConsig(i, e.target.value)} className={INP_TBL} />
                  <button onClick={() => delConsig(i)} className="text-gray-300 hover:text-red-500 text-sm inline-flex items-center"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={addConsig} className="mt-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar empresa</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatConsig(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Fleteros (proveedores SAP) ── */}
      {catFleteros && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1"><Truck size={16} /> Fleteros (proveedores SAP)</div>
                <div className="text-xs text-gray-500 mt-0.5">Para la orden de compra de flete</div>
              </div>
              <button onClick={() => setCatFleteros(false)} className="text-gray-400 hover:text-gray-700 text-lg inline-flex items-center"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <input value={flBuscar} onChange={(e) => setFlBuscar(e.target.value)} placeholder="Buscar por nombre/código…" className={INP + " flex-1 min-w-[180px]"} />
                <button onClick={cargarProveedoresSAP} disabled={flCargando} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {flCargando ? "Cargando…" : <span className="inline-flex items-center gap-1"><RefreshCw size={14} /> Traer de SAP</span>}
                </button>
              </div>
              {flError && <div className="text-[11px] text-red-600">No se pudo traer de SAP: {flError}</div>}
              {flInfo && <div className="text-[11px] text-green-700">{flInfo}.</div>}
              <div className="text-[11px] text-gray-500">{proveedores.length} fletero(s) en tu catálogo.</div>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {proveedores.length === 0 ? (
                  <div className="text-[11px] text-gray-400 italic px-3 py-3">Aún no hay fleteros. Da clic en "Traer de SAP".</div>
                ) : proveedores.map((p) => (
                  <div key={p.cardCode} className="px-3 py-2 text-xs">
                    <span className="font-semibold text-gray-800">{p.nombre}</span>
                    <span className="text-gray-400"> · {p.cardCode}{p.rfc ? " · " + p.rfc : ""}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatFleteros(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Control de fletes de acarreo - FRUTA (SAP, solo lectura) */}

      {/* ── Modal: Orden de compra de flete (Solicitud + Pedido) ── */}
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
                <button onClick={() => setOcMov(null)} className="text-gray-400 hover:text-gray-700 text-lg inline-flex items-center"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-400">Temporada</span><div className="font-medium text-gray-800">{m.proyecto || "—"}</div></div>
                  <div><span className="text-gray-400">Rancho</span><div className="font-medium text-gray-800">{m.rancho || "—"}</div></div>
                </div>
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 text-xs flex items-center justify-between">
                  <span className="text-gray-500">Precio (Flete $ del movimiento)</span>
                  <span className="text-lg font-bold text-indigo-700">${precio.toLocaleString()}</span>
                </div>
                {!(precio > 0) && <div className="text-[11px] text-amber-600 inline-flex items-center gap-1"><AlertTriangle size={14} /> Este movimiento no tiene "Flete $". Edítalo y captura el flete antes de mandar la OC.</div>}
                <div>
                  <label className={LBL}>Cultivo {r?.cultivo ? <span className="text-gray-400 font-normal">· del proyecto: {r.cultivo}</span> : null}</label>
                  <SearchSelect className={INP} value={ocCultivo} onChange={setOcCultivo} searchThreshold={0} placeholder="— Cultivo (norma de reparto) —"
                    options={(() => {
                      const base = acotadoCultivo ? cultivos.filter((c) => cultivosAsignados.has(c.FactorCode)) : cultivos;
                      const opts = base.map((c) => ({ value: c.FactorCode, label: `${c.FactorCode}${c.FactorDescription ? " · " + c.FactorDescription : ""}` }));
                      if (ocCultivo && !opts.some((o) => o.value === ocCultivo)) opts.unshift({ value: ocCultivo, label: ocCultivo });
                      return opts;
                    })()} />
                </div>
                <div>
                  <label className={LBL}>Departamento (tabla) {ocMov?.departamento
                    ? <span className="text-gray-400 font-normal">· tabla del movimiento: {ocMov.departamento}</span>
                    : (r?.departamento ? <span className="text-gray-400 font-normal">· del proyecto: {r.departamento}</span> : null)}</label>
                  <SearchSelect className={INP} value={ocDepto} onChange={setOcDepto} searchThreshold={0} placeholder="— Departamento (tabla) —"
                    options={opcionesTablas(ocMov?.rancho, ocDepto)} />
                  {ocMov?.departamento && ocDepto !== ocMov.departamento && (
                    <div className="text-[10px] text-amber-700 mt-0.5">Ojo: cambiaste la tabla; en el movimiento quedó <b>{ocMov.departamento}</b>.</div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className={LBL}>Fletero (proveedor)</label>
                    <button onClick={cargarProveedoresSAP} disabled={flCargando} className="text-[11px] text-indigo-600 hover:underline disabled:opacity-50">{flCargando ? "Trayendo…" : <span className="inline-flex items-center gap-1"><RefreshCw size={14} /> Traer de SAP</span>}{flInfo ? ` · ${flInfo}` : ""}</button>
                  </div>
                  <SearchSelect className={INP} value={ocCardCode} onChange={setOcCardCode} searchThreshold={0} placeholder={proveedores.length ? "— Elige fletero —" : "Primero trae fleteros desde SAP"}
                    options={proveedores.map((p) => ({ value: p.cardCode, label: `${p.nombre} · ${p.cardCode}` }))} />
                </div>
                <div>
                  <label className={LBL}>Item de flete</label>
                  <SearchSelect className={INP} value={ocItem} onChange={setOcItem} searchThreshold={0} placeholder="— Item —"
                    options={itemsFlete.map((it) => ({ value: it.ItemCode, label: `${it.ItemCode} · ${it.ItemName}` }))} />
                </div>
                <div>
                  <label className={LBL}>IVA</label>
                  <SearchSelect className={INP} value={ocTax} onChange={setOcTax} searchThreshold={0} placeholder="— IVA —"
                    options={taxCodes.map((t) => ({ value: t.Code, label: `${t.Code}${t.Name ? " · " + t.Name : ""}` }))} />
                </div>
                <div>
                  <label className={LBL}>Fecha necesaria</label>
                  <input type="date" value={ocFecha} onChange={(e) => setOcFecha(e.target.value)} className={INP} />
                </div>
                <div>
                  <label className={LBL}>Detalles de artículo <span className="text-gray-400">· en la línea de la OC (acarreo, cultivo, lote)</span></label>
                  <textarea value={ocDetalle} onChange={(e) => setOcDetalle(e.target.value)} rows={2} className={INP} placeholder="Ej. ACARREO · Chile Bell · Lote Angulo" />
                </div>
                <div>
                  <label className={LBL}>Comentario</label>
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
                  <div className="text-[12px] text-amber-800 font-medium mb-2"><AlertTriangle size={14} className="inline-block align-text-bottom mr-1" /> ¿Seguro? Esto va a <b>crear la OC directamente en SAP</b> (Solicitud de Pedido + Pedido). Esta acción no se puede deshacer desde aquí.</div>
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