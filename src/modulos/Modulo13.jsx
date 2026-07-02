import { useState, useEffect, useRef, useCallback } from "react";
import { Eye, Pencil, Trash2, FileText, RefreshCw, Package, Receipt, Check, X, AlertTriangle, Plug } from "lucide-react";
import { useDatos, nuevoId, ORIGENES, DESTINOS_ALL } from "../store/datos";
import SearchSelect from "../components/SearchSelect";
import { getProveedoresFleteSAP, getItemsFleteSAP, getTaxCodesSAP, getDepartamentosSAP, getLotesSAP, getCultivosSAP, getProyectosSAPlist, crearOrdenCompraSAP, getEstadoOCSAP } from "../store/api";
import { useDialog } from "../components/Dialog";
import ControlFletesModal from "../components/ControlFletesModal";

// FactorCode de la norma "N/A" (cuando cultivo/lote no aplican; SAP no acepta vacío).
const esNA = (s) => /^n\s*\/?\s*a$/i.test(String(s || "").trim());

import { hoyISO } from "../utils/fecha";

// Movimiento Materiales (id 13)
// Registra el movimiento de materiales con los MISMOS datos del fletero/transporte
// que se llenan en el Tablero y en Movimientos Campo (línea/chofer/tracto/caja del
// catálogo `lineas`), y agrega un "cuadrito" para marcar que los materiales iban
// ARRIBA del trailer. El catálogo de materiales se comparte con el master `materiales`
// (a futuro se leerá de SAP).
export default function Modulo13() {
  const { movMateriales, setMovMateriales, lineas, setLineas, materiales, setMateriales, ubicaciones, proveedores, setProveedores, proyectos } = useDatos();
  const dlg = useDialog();
  const [verFletes, setVerFletes] = useState(false);   // modal Control de fletes · MATERIAL (SAP)

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null); // id del movimiento que se edita (null = nuevo)
  const [verMov, setVerMov] = useState(null);
  const [catMat, setCatMat] = useState(false); // modal catálogo de materiales

  const [q, setQ] = useState("");

  // modos "nuevo" en la ficha de transporte (igual que M8)
  const [lineaNueva, setLineaNueva] = useState(false);
  const [choferNuevo, setChoferNuevo] = useState(false);
  const [tractoNuevo, setTractoNuevo] = useState(false);
  const [cajaNueva, setCajaNueva] = useState(false);

  const formVacio = {
    folio: "", fecha: hoyISO(), proyecto: "", origen: "", destino: "",
    materialItems: [{ materialId: "", cantidad: "" }],
    // transporte (mismos datos del fletero)
    linea: "", contacto: "", numero: "", chofer: "", telefono: "", licencia: "",
    marcaModelo: "", placaTracto: "", economicoCaja: "", placaCaja: "",
    telOperador: "", flete: "",
    observaciones: "",
    responsable: "",
  };
  const [form, setForm] = useState(formVacio);

  const resetModos = () => { setLineaNueva(false); setChoferNuevo(false); setTractoNuevo(false); setCajaNueva(false); };
  // Carga la lista de proyectos SAP (con reintento en el backend si la SL corta).
  const cargarProyectosForm = () => { getProyectosSAPlist().then((d) => setProyectosSAP(d.value || [])).catch(() => {}); };
  const abrirNuevo = () => { setForm(formVacio); setEditId(null); resetModos(); cargarProyectosForm(); setModal(true); };
  const abrirEditar = (m) => {
    setForm({ ...formVacio, ...m, materialItems: m.materialItems?.length ? m.materialItems : [{ materialId: "", cantidad: "" }] });
    setEditId(m.id);
    resetModos();
    cargarProyectosForm();
    setModal(true);
  };
  const cerrarModal = () => { setModal(false); setEditId(null); resetModos(); };

  const lineaSel = lineas.find((l) => l.linea === form.linea);

  // ── Materiales del movimiento ──
  const updMatItem = (i, campo, val) => setForm((f) => ({ ...f, materialItems: f.materialItems.map((it, j) => j === i ? { ...it, [campo]: val } : it) }));
  const addMatItem = () => setForm((f) => ({ ...f, materialItems: [...f.materialItems, { materialId: "", cantidad: "" }] }));
  const delMatItem = (i) => setForm((f) => ({ ...f, materialItems: f.materialItems.filter((_, j) => j !== i) }));
  const matDe = (id) => materiales.find((m) => m.id === id);

  // ── Transporte (mismos catálogos del Tablero / M8) ──
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

  // ── Guardar movimiento (y subcatálogos de transporte nuevos, igual que M8) ──
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

    // Limpia filas de materiales vacías
    const materialItems = form.materialItems.filter((it) => it.materialId);
    const payload = { ...form, materialItems: materialItems.length ? materialItems : [] };

    if (editId) {
      setMovMateriales((prev) => prev.map((mm) => (mm.id === editId ? { ...payload, id: editId, actualizado: new Date().toLocaleString("es-MX") } : mm)));
    } else {
      const mov = { ...payload, id: nuevoId("MMT_"), creado: new Date().toLocaleString("es-MX") };
      setMovMateriales((prev) => [mov, ...prev]);
    }
    setEditId(null);
    setModal(false);
    resetModos();
  };

  const borrarMov = async (id) => { if (await dlg.confirm({ title: "Eliminar movimiento", message: "¿Eliminar este movimiento de materiales?", confirmText: "Eliminar", danger: true })) setMovMateriales((prev) => prev.filter((m) => m.id !== id)); };

  // ── Orden de compra de FLETE de materiales (SAP) ──
  // Igual que la OC de campo→empaque (Modulo8) pero SIMPLE: item FLETE-0003,
  // solo Departamento (default "Empaque"), sin cultivo/lote/proyecto. El resto del
  // movimiento ya vive en la BD; aquí solo se genera la Solicitud + Pedido en SAP.
  const DEPTO_DEFAULT = "Empaque";
  const ALMACEN_MATERIALES = "06"; // almacén de la línea de flete de materiales (ver ejemplo SAP)
  const [ocMov, setOcMov] = useState(null);
  const [ocCardCode, setOcCardCode] = useState("");
  const [ocItem, setOcItem] = useState("");
  const [ocTax, setOcTax] = useState("");
  const [ocCultivo, setOcCultivo] = useState("");     // SAP exige cultivo (N/A si no aplica)
  const [ocLote, setOcLote] = useState("");           // SAP exige lote (N/A si no aplica)
  const [ocDepto, setOcDepto] = useState("");
  const [ocProyecto, setOcProyecto] = useState("");   // SAP exige proyecto en cada línea
  const [ocFecha, setOcFecha] = useState("");
  const [ocComentario, setOcComentario] = useState("");
  const [ocConfirm, setOcConfirm] = useState(false);
  const [ocCargando, setOcCargando] = useState(false);
  const [ocError, setOcError] = useState("");
  const [itemsFlete, setItemsFlete] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [cultivos, setCultivos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [proyectosSAP, setProyectosSAP] = useState([]);
  const [flCargando, setFlCargando] = useState(false);
  const [flInfo, setFlInfo] = useState("");

  // Traer fleteros de SAP → upsert al catálogo `proveedores` (compartido con M8).
  const cargarProveedoresOC = async () => {
    setFlCargando(true); setFlInfo("");
    try {
      const d = await getProveedoresFleteSAP("");
      const lista = (d.value || []).map((b) => ({ cardCode: b.CardCode, nombre: b.CardName || b.CardCode, rfc: b.FederalTaxID || "", telefono: b.Phone1 || "", email: b.EmailAddress || "" }));
      setProveedores((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const byCode = new Map(base.map((p) => [p.cardCode, p]));
        for (const p of lista) byCode.set(p.cardCode, { ...byCode.get(p.cardCode), ...p });
        return Array.from(byCode.values()).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
      });
      setFlInfo(`${lista.length} fletero(s) de SAP`);
    } catch (e) { setOcError(String(e?.message || e)); }
    finally { setFlCargando(false); }
  };
  const cargarCatalogosOC = async () => {
    try {
      const d = await getItemsFleteSAP();
      const items = d.value || [];
      setItemsFlete(items);
      // Default: FLETE-0003 (acarreo de materiales); si no, el que mencione "material".
      const it = items.find((x) => /flete-?0003/i.test(x.ItemCode || "")) || items.find((x) => /material/i.test(`${x.ItemCode} ${x.ItemName}`)) || items[0];
      if (it) setOcItem(it.ItemCode || "");
    } catch { /* noop */ }
    try {
      const d = await getTaxCodesSAP();
      const txs = d.value || [];
      setTaxCodes(txs);
      const t = txs.find((x) => /16/.test(`${x.Code} ${x.Name}`)) || txs[0];
      if (t) setOcTax(t.Code || "");
    } catch { /* noop */ }
    try {
      const d = await getDepartamentosSAP();
      const deps = d.value || [];
      setDepartamentos(deps);
      // Default: "Empaque" si existe en la lista (si no, se deja el texto por defecto).
      const dep = deps.find((x) => /empaque/i.test(`${x.FactorCode} ${x.FactorDescription}`));
      if (dep) setOcDepto(dep.FactorCode);
    } catch { /* noop */ }
    try {
      const d = await getCultivosSAP();
      const cs = d.value || [];
      setCultivos(cs);
      const na = cs.find((x) => esNA(x.FactorCode)); // default N/A (no aplica a materiales)
      if (na) setOcCultivo(na.FactorCode);
    } catch { /* noop */ }
    try {
      const d = await getLotesSAP();
      const ls = d.value || [];
      setLotes(ls);
      const na = ls.find((x) => esNA(x.FactorCode));
      if (na) setOcLote(na.FactorCode);
    } catch { /* noop */ }
    try { const d = await getProyectosSAPlist(); setProyectosSAP(d.value || []); } catch { /* noop */ }
  };
  const abrirOC = (m) => {
    setOcError(""); setOcConfirm(false); setOcCardCode(""); setOcItem(""); setOcTax(""); setOcProyecto(m.proyecto || "");
    setOcDepto(DEPTO_DEFAULT);
    setOcCultivo("N/A"); setOcLote("N/A"); // fallback; el cargador fija el código N/A exacto de SAP
    setOcFecha(hoyISO());
    setOcComentario(`Acarreo materiales · Folio ${m.folio || ""} · ${m.origen || ""}→${m.destino || ""} · ${m.fecha || ""}${m.chofer ? " · " + m.chofer : ""}`.trim());
    setOcMov(m);
    cargarCatalogosOC();
  };
  const confirmarOC = async () => {
    const m = ocMov;
    const precio = parseFloat(m.flete) || 0;
    if (!ocCardCode) { setOcError("Elige el fletero."); return; }
    if (!ocItem) { setOcError("Elige el item de flete."); return; }
    if (!ocProyecto) { setOcError("Elige el proyecto (SAP lo exige en cada línea)."); return; }
    if (!ocCultivo || !ocLote) { setOcError("Cultivo y Lote no pueden ir vacíos (usa N/A si no aplica)."); return; }
    if (!(precio > 0)) { setOcError("El movimiento no tiene 'Flete $' (precio)."); return; }
    setOcCargando(true); setOcError("");
    try {
      const res = await crearOrdenCompraSAP({
        cardCode: ocCardCode, item: ocItem, precio, taxCode: ocTax,
        proyecto: ocProyecto, cultivo: ocCultivo, lote: ocLote,
        departamento: ocDepto || DEPTO_DEFAULT, comentario: ocComentario,
        requiredDate: ocFecha || null, warehouse: ALMACEN_MATERIALES,
        movimientoId: m.id, origen: "mov_material",   // idempotencia: evita doble OC en SAP
      });
      setMovMateriales((prev) => prev.map((x) => x.id === m.id ? { ...x, ocSAP: { solicitud: res.solicitud, pedido: res.pedido, cardCode: ocCardCode, item: ocItem, precio, taxCode: ocTax, departamento: ocDepto || DEPTO_DEFAULT, ts: new Date().toISOString() } } : x));
      setOcMov(null);
    } catch (e) { setOcError(String(e?.message || e)); }
    finally { setOcCargando(false); }
  };

  // ── Estado de la OC en SAP (SOLO LECTURA): ¿ya tiene factura de proveedor? ──
  // Estado de factura por movimiento, EFÍMERO (no persiste) → auto-refresco sin churn.
  const [estadosOC, setEstadosOC] = useState({});   // { [movId]: { factura, estado } }
  const estadosOCRef = useRef(estadosOC);
  useEffect(() => { estadosOCRef.current = estadosOC; }, [estadosOC]);

  // Auto-refresca en SAP el estado de factura de las OC (solo lectura): al cargar y cada 5 min.
  // Una vez FACTURADO ya no cambia → se deja de consultar. Secuencial para ser gentil con SAP.
  const movsRef = useRef(movMateriales);
  useEffect(() => { movsRef.current = movMateriales; }, [movMateriales]);
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
  // Firma de las OCs presentes → dispara el refresco al cargar los datos y al crear una OC.
  const ocKey = (movMateriales || []).filter((m) => m.ocSAP?.pedido?.docEntry).map((m) => m.id).join(",");
  useEffect(() => {
    refrescarEstadosOC();
    const id = setInterval(refrescarEstadosOC, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [ocKey, refrescarEstadosOC]);

  // ── Catálogo de materiales (master compartido `materiales`) ──
  const addMaterial = () => setMateriales((prev) => [...prev, { id: nuevoId("mat_"), codigo: "", descripcion: "", unidad: "Pieza" }]);
  const updMaterial = (id, campo, val) => setMateriales((prev) => prev.map((m) => (m.id === id ? { ...m, [campo]: val } : m)));
  const delMaterial = (id) => setMateriales((prev) => prev.filter((m) => m.id !== id));

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const INP_TBL = "w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none";
  const LBL = "text-xs text-gray-500 block mb-0.5";

  // Filtro de la lista
  const qLow = q.trim().toLowerCase();
  const movsFiltrados = movMateriales.filter((m) => {
    if (!qLow) return true;
    const matLabels = (m.materialItems || []).map((it) => matDe(it.materialId)?.descripcion || "").join(" ");
    const campos = [m.folio, m.origen, m.destino, m.linea, m.chofer, matLabels];
    return campos.some((c) => String(c ?? "").toLowerCase().includes(qLow));
  }).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.creado || "").localeCompare(String(a.creado || "")));

  const lineaActualId = lineaNueva ? "__nueva__" : (lineaSel?.id || "");
  const choferActualId = choferNuevo ? "__nuevo__" : ((lineaSel?.choferes || []).find((c) => c.nombre === form.chofer)?.id || "");
  const tractoActualId = tractoNuevo ? "__nuevo__" : ((lineaSel?.tractos || []).find((t) => t.placa === form.placaTracto)?.id || "");
  const cajaActualId = cajaNueva ? "__nueva__" : ((lineaSel?.cajas || []).find((c) => c.placa === form.placaCaja)?.id || "");
  const hayLinea = !!form.linea;

  const origenOpts = [...new Set([...ORIGENES, ...ubicaciones.origenes.map((o) => o.nombre), ...ubicaciones.destinos.map((d) => d.nombre)])];
  const destinoOpts = [...new Set([...DESTINOS_ALL.filter((d) => d !== "Sin asignar"), ...ubicaciones.destinos.map((d) => d.nombre)])];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Movimiento Materiales</h1>
          <p className="text-sm text-gray-500 mt-0.5">Materiales transportados con el flete · catálogo de materiales (a futuro desde SAP)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatMat(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200 inline-flex items-center gap-1"><Package size={14} /> Catálogo de materiales</button>
          <button onClick={() => setVerFletes(true)} className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 inline-flex items-center gap-1"><Receipt size={14} /> Control fletes</button>
          <button onClick={abrirNuevo} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700">+ Nuevo movimiento</button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 flex-wrap gap-2">
          <span className="text-sm font-semibold text-gray-900">Movimientos registrados ({movsFiltrados.length}{q ? ` de ${movMateriales.length}` : ""})</span>
          {movMateriales.length > 0 && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, origen, destino, línea, chofer, material…"
              className="flex-1 min-w-[240px] max-w-md text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
          )}
        </div>
        {movMateriales.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">Sin movimientos de materiales. Registra el primero con "+ Nuevo movimiento".</div>
        ) : movsFiltrados.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">Ningún movimiento coincide con la búsqueda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "880px" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Folio</th>
                  <th className="text-left px-3 py-2 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium">Origen → Destino</th>
                  <th className="text-left px-3 py-2 font-medium">Línea / Chofer</th>
                  <th className="text-left px-3 py-2 font-medium">Materiales</th>
                  <th className="text-right px-3 py-2 font-medium">Flete</th>
                  <th className="text-center px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.map((m) => {
                  const items = m.materialItems || [];
                  const flete = parseFloat(m.flete) || 0;
                  return (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-bold text-red-600">{m.folio || "—"}</td>
                      <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{m.fecha || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{m.origen || "—"} → {m.destino || "—"}</td>
                      <td className="px-3 py-2 text-gray-700"><div className="font-medium">{m.linea || "—"}</div><div className="text-gray-400">{m.chofer || "—"}</div></td>
                      <td className="px-3 py-2 text-gray-700">
                        {items.length === 0 ? <span className="text-gray-300">—</span> : (
                          <span title={items.map((it) => `${matDe(it.materialId)?.descripcion || "?"}${it.cantidad ? ` (${it.cantidad} ${matDe(it.materialId)?.unidad || ""})` : ""}`).join(", ")}>
                            <b className="text-gray-800">{items.length}</b> {items.length === 1 ? "material" : "materiales"}
                            <div className="text-gray-400 truncate max-w-[180px]">{matDe(items[0].materialId)?.descripcion || "—"}{items.length > 1 ? ` +${items.length - 1}` : ""}</div>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{flete ? "$" + flete.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        {m.ocSAP ? (
                          <span className="inline-flex items-center gap-1 mr-1 align-middle">
                            <span title="Documentos creados en SAP" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200"><Check size={14} /> Sol #{m.ocSAP.solicitud?.docNum ?? "?"} · Ped #{m.ocSAP.pedido?.docNum ?? "?"}</span>
                            {(() => {
                              const fac = estadosOC[m.id]?.factura ?? m.ocSAP.factura;
                              return fac?.existe ? (
                                <span title={`Factura de proveedor en SAP${fac.docNum ? " #" + fac.docNum : ""}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200"><Receipt size={14} /> Facturado{fac.docNum ? ` #${fac.docNum}` : ""}</span>
                              ) : fac ? (
                                <span title="Aún sin factura de proveedor" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-amber-50 text-amber-600 border border-amber-200"><Receipt size={14} /> Sin factura</span>
                              ) : null;
                            })()}
                          </span>
                        ) : (
                          <button onClick={() => abrirOC(m)} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 text-indigo-600 mr-1"><FileText size={14} /> OC</button>
                        )}
                        <button onClick={() => setVerMov(m)} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 mr-1"><Eye size={14} /> Ver</button>
                        <button onClick={() => abrirEditar(m)} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-blue-200 rounded-lg bg-white hover:bg-blue-50 text-blue-600 mr-1"><Pencil size={14} /> Editar</button>
                        <button onClick={() => borrarMov(m.id)} className="inline-flex items-center justify-center text-xs px-2 py-1 border border-red-200 rounded-lg bg-white hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal nuevo / editar movimiento ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="text-sm font-semibold text-gray-900">{editId ? "Editar movimiento de materiales" : "Nuevo movimiento de materiales"}</div>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-5">

              {/* Datos del viaje */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos del viaje</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LBL}>Folio</label><input className={INP} value={form.folio} onChange={(e) => setForm((f) => ({ ...f, folio: e.target.value }))} placeholder="No. 0001" /></div>
                  <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} /></div>
                  <div className="col-span-2">
                    <label className={LBL}>Proyecto <span className="text-gray-400 font-normal">· SAP (lo usa la OC)</span></label>
                    <SearchSelect className={INP} value={form.proyecto} onChange={(v) => setForm((f) => ({ ...f, proyecto: v }))} searchThreshold={0}
                      placeholder={proyectosSAP.length ? "— Elige proyecto —" : "Cargando proyectos de SAP…"}
                      options={(() => {
                        const opts = proyectosSAP.map((p) => ({ value: p.Code, label: `${p.Code}${p.Name ? " · " + p.Name : ""}` }));
                        if (form.proyecto && !opts.some((o) => o.value === form.proyecto)) opts.unshift({ value: form.proyecto, label: form.proyecto });
                        return opts;
                      })()} />
                  </div>
                  <div>
                    <label className={LBL}>Origen</label>
                    <input className={INP} list="dl-mmt-origen" value={form.origen} onChange={(e) => setForm((f) => ({ ...f, origen: e.target.value }))} placeholder="Origen" />
                    <datalist id="dl-mmt-origen">{origenOpts.map((o) => <option key={o} value={o} />)}</datalist>
                  </div>
                  <div>
                    <label className={LBL}>Destino</label>
                    <input className={INP} list="dl-mmt-destino" value={form.destino} onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))} placeholder="Destino" />
                    <datalist id="dl-mmt-destino">{destinoOpts.map((d) => <option key={d} value={d} />)}</datalist>
                  </div>
                </div>
              </div>

              {/* Materiales */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Materiales</div>
                <div className="border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-2 py-1.5 font-medium">Material (del catálogo)</th>
                        <th className="text-right px-2 py-1.5 font-medium w-24">Cantidad</th>
                        <th className="text-left px-2 py-1.5 font-medium w-20">Unidad</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.materialItems.map((it, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-2 py-1">
                            <SearchSelect className={INP} value={it.materialId} onChange={(v) => updMatItem(i, "materialId", v)} placeholder="— Elegir material —"
                              options={materiales.map((m) => ({ value: m.id, label: (m.codigo ? m.codigo + " · " : "") + m.descripcion }))} />
                          </td>
                          <td className="px-2 py-1"><input type="number" className={INP + " text-right"} value={it.cantidad} onChange={(e) => updMatItem(i, "cantidad", e.target.value)} /></td>
                          <td className="px-2 py-1 text-gray-500">{matDe(it.materialId)?.unidad || "—"}</td>
                          <td className="px-2 py-1 text-center">{form.materialItems.length > 1 && <button onClick={() => delMatItem(i)} className="text-gray-300 hover:text-red-500 inline-flex items-center justify-center"><X size={14} /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button onClick={addMatItem} className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar material</button>
                  <button onClick={() => setCatMat(true)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium"><Package size={14} /> Editar catálogo</button>
                </div>
              </div>

              {/* Transporte (mismos datos del fletero) */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos del transporte (fletero)</div>
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
                {lineaNueva && <div className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-2"><Pencil size={14} /> Capturando línea nueva — se guarda en el catálogo al guardar</div>}
                <div className="grid grid-cols-3 gap-2">
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
                      <div className="grid grid-cols-3 gap-2 mt-1">
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
                </div>
              </div>

              <div>
                <label className={LBL}>Observaciones</label>
                <textarea className={INP} rows={2} value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} placeholder="Notas del movimiento…" />
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
              <div className="text-sm font-semibold text-gray-900">Movimiento de materiales · Folio {verMov.folio || "—"}</div>
              <button onClick={() => setVerMov(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Proyecto", verMov.proyecto], ["Fecha", verMov.fecha], ["Origen", verMov.origen], ["Destino", verMov.destino],
                  ["Flete", verMov.flete ? "$" + verMov.flete : ""],
                ].map(([l, v]) => (
                  <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                ))}
              </div>
              <div>
                <div className="text-gray-400 mb-1 font-medium uppercase">Materiales</div>
                <table className="w-full">
                  <thead><tr className="text-gray-400"><th className="text-left py-1">Material</th><th className="text-right py-1">Cantidad</th><th className="text-left py-1 pl-2">Unidad</th></tr></thead>
                  <tbody>
                    {(verMov.materialItems || []).length === 0 ? (
                      <tr><td colSpan={3} className="py-1 text-gray-400 italic">Sin materiales</td></tr>
                    ) : (verMov.materialItems || []).map((it, i) => (
                      <tr key={i} className="border-t border-gray-100"><td className="py-1">{matDe(it.materialId)?.descripcion || "—"}</td><td className="py-1 text-right">{it.cantidad || "—"}</td><td className="py-1 pl-2">{matDe(it.materialId)?.unidad || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="text-gray-400 mb-1 font-medium uppercase">Transporte (fletero)</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Línea", verMov.linea], ["Contacto", verMov.contacto], ["Número", verMov.numero],
                    ["Chofer", verMov.chofer], ["Teléfono", verMov.telefono], ["Licencia", verMov.licencia],
                    ["Marca/Modelo", verMov.marcaModelo], ["Placa tracto", verMov.placaTracto], ["No. caja", verMov.economicoCaja],
                    ["Placa caja", verMov.placaCaja], ["Tel. operador", verMov.telOperador],
                  ].map(([l, v]) => (
                    <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                  ))}
                </div>
              </div>
              {verMov.observaciones && (
                <div className="border-t border-gray-100 pt-3">
                  <div className="text-gray-400 mb-1 font-medium uppercase">Observaciones</div>
                  <div className="text-gray-800">{verMov.observaciones}</div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setVerMov(null)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: OC de flete de materiales (Solicitud + Pedido) ── */}
      {ocMov && (() => {
        const m = ocMov;
        const precio = parseFloat(m.flete) || 0;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><FileText size={16} /> OC de flete (materiales) — Folio {m.folio || "—"}</div>
                <button onClick={() => setOcMov(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-400">Origen → Destino</span><div className="font-medium text-gray-800">{m.origen || "—"} → {m.destino || "—"}</div></div>
                  <div><span className="text-gray-400">Fecha</span><div className="font-medium text-gray-800">{m.fecha || "—"}</div></div>
                </div>
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 text-xs flex items-center justify-between">
                  <span className="text-gray-500">Precio (Flete $ del movimiento)</span>
                  <span className="text-lg font-bold text-indigo-700">${precio.toLocaleString()}</span>
                </div>
                {!(precio > 0) && <div className="inline-flex items-center gap-1 text-[11px] text-amber-600"><AlertTriangle size={14} /> Este movimiento no tiene "Flete $". Edítalo y captura el flete antes de mandar la OC.</div>}
                <div>
                  <div className="flex items-center justify-between">
                    <label className={LBL}>Fletero (proveedor)</label>
                    <button onClick={cargarProveedoresOC} disabled={flCargando} className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline disabled:opacity-50">{flCargando ? "Trayendo…" : <span className="inline-flex items-center gap-1"><RefreshCw size={14} /> Traer de SAP</span>}{flInfo ? ` · ${flInfo}` : ""}</button>
                  </div>
                  <SearchSelect className={INP} value={ocCardCode} onChange={setOcCardCode} searchThreshold={0} placeholder={(proveedores || []).length ? "— Elige fletero —" : "Primero trae fleteros desde SAP"}
                    options={(proveedores || []).map((p) => ({ value: p.cardCode, label: `${p.nombre} · ${p.cardCode}` }))} />
                </div>
                <div>
                  <label className={LBL}>Item de flete</label>
                  <SearchSelect className={INP} value={ocItem} onChange={setOcItem} searchThreshold={0} placeholder="— Item —"
                    options={itemsFlete.map((it) => ({ value: it.ItemCode, label: `${it.ItemCode} · ${it.ItemName}` }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LBL}>Cultivo <span className="text-gray-400 font-normal">· N/A si no aplica</span></label>
                    <SearchSelect className={INP} value={ocCultivo} onChange={setOcCultivo} searchThreshold={0} placeholder="— Cultivo —"
                      options={(() => {
                        const opts = cultivos.map((c) => ({ value: c.FactorCode, label: `${c.FactorCode}${c.FactorDescription ? " · " + c.FactorDescription : ""}` }));
                        if (ocCultivo && !opts.some((o) => o.value === ocCultivo)) opts.unshift({ value: ocCultivo, label: ocCultivo });
                        return opts;
                      })()} />
                  </div>
                  <div>
                    <label className={LBL}>Lote <span className="text-gray-400 font-normal">· N/A si no aplica</span></label>
                    <SearchSelect className={INP} value={ocLote} onChange={setOcLote} searchThreshold={0} placeholder="— Lote —"
                      options={(() => {
                        const opts = lotes.map((l) => ({ value: l.FactorCode, label: `${l.FactorCode}${l.FactorDescription ? " · " + l.FactorDescription : ""}` }));
                        if (ocLote && !opts.some((o) => o.value === ocLote)) opts.unshift({ value: ocLote, label: ocLote });
                        return opts;
                      })()} />
                  </div>
                </div>
                <div>
                  <label className={LBL}>Proyecto <span className="text-gray-400 font-normal">· del movimiento</span></label>
                  <SearchSelect className={INP} value={ocProyecto} onChange={setOcProyecto} searchThreshold={0} placeholder="— Elige proyecto —"
                    options={(() => {
                      const opts = proyectosSAP.map((p) => ({ value: p.Code, label: `${p.Code}${p.Name ? " · " + p.Name : ""}` }));
                      if (ocProyecto && !opts.some((o) => o.value === ocProyecto)) opts.unshift({ value: ocProyecto, label: ocProyecto });
                      return opts;
                    })()} />
                </div>
                <div>
                  <label className={LBL}>Departamento</label>
                  <SearchSelect className={INP} value={ocDepto} onChange={setOcDepto} searchThreshold={0} placeholder="— Departamento —"
                    options={(() => {
                      const opts = departamentos.map((d) => ({ value: d.FactorCode, label: `${d.FactorCode}${d.FactorDescription ? " · " + d.FactorDescription : ""}` }));
                      if (ocDepto && !opts.some((o) => o.value === ocDepto)) opts.unshift({ value: ocDepto, label: ocDepto });
                      return opts;
                    })()} />
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
                  <label className={LBL}>Comentario</label>
                  <textarea value={ocComentario} onChange={(e) => setOcComentario(e.target.value)} rows={2} className={INP} />
                </div>
                {ocError && <div className="text-[11px] text-red-600">No se pudo crear la OC: {ocError}</div>}
              </div>
              {!ocConfirm ? (
                <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
                  <button onClick={() => setOcMov(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                  <button onClick={() => { setOcError(""); setOcConfirm(true); }} disabled={ocCargando || !ocCardCode || !ocItem || !ocProyecto || !ocCultivo || !ocLote || !(precio > 0)} className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">Crear OC en SAP</button>
                </div>
              ) : (
                <div className="px-5 py-3 border-t border-amber-200 bg-amber-50/60">
                  <div className="inline-flex items-center gap-1 text-[12px] text-amber-800 font-medium mb-2"><AlertTriangle size={14} /> ¿Seguro? Esto va a <b>crear la OC directamente en SAP</b> (Solicitud + Pedido). No se puede deshacer desde aquí.</div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setOcConfirm(false)} disabled={ocCargando} className="text-xs px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white disabled:opacity-50">No, volver</button>
                    <button onClick={confirmarOC} disabled={ocCargando || !ocCardCode || !ocItem || !ocProyecto || !ocCultivo || !ocLote || !(precio > 0)} className="text-xs px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50">{ocCargando ? "Creando…" : "Sí, crear en SAP"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Modal catálogo de materiales (master compartido) ── */}
      {verFletes && <ControlFletesModal tipo="material" proyectos={proyectos} onClose={() => setVerFletes(false)} />}

      {catMat && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900">Catálogo de materiales</div>
                <div className="text-xs text-gray-500 mt-0.5"><span className="inline-flex items-center gap-1"><Plug size={14} /> A futuro se leerá de SAP · catálogo compartido con Importaciones de Materiales</span></div>
              </div>
              <button onClick={() => setCatMat(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left px-2 py-1.5 font-medium w-28">Código</th>
                      <th className="text-left px-2 py-1.5 font-medium">Descripción</th>
                      <th className="text-left px-2 py-1.5 font-medium w-24">Unidad</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiales.map((m) => (
                      <tr key={m.id} className="border-t border-gray-100">
                        <td className="px-2 py-1"><input className={INP_TBL} value={m.codigo || ""} onChange={(e) => updMaterial(m.id, "codigo", e.target.value)} placeholder="COD-001" /></td>
                        <td className="px-2 py-1"><input className={INP_TBL} value={m.descripcion || ""} onChange={(e) => updMaterial(m.id, "descripcion", e.target.value)} placeholder="Descripción del material" /></td>
                        <td className="px-2 py-1"><input className={INP_TBL} value={m.unidad || ""} onChange={(e) => updMaterial(m.id, "unidad", e.target.value)} placeholder="Pieza" /></td>
                        <td className="px-2 py-1 text-center"><button onClick={() => delMaterial(m.id)} className="text-gray-300 hover:text-red-500 inline-flex items-center justify-center"><X size={14} /></button></td>
                      </tr>
                    ))}
                    {materiales.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-gray-400 italic py-6">Sin materiales. Agrega el primero.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button onClick={addMaterial} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar material</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatMat(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
