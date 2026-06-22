import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { useDatos, nuevoId } from "../store/datos";
import { getCatalogoProyectosSAP, getProyectosSAP, getProveedoresFleteSAP, getItemsFleteSAP, getTaxCodesSAP, getCultivosSAP, crearOrdenCompraSAP } from "../store/api";
import SearchSelect from "../components/SearchSelect";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Modulo8() {
  const { movimientos, setMovimientos, cargaCampo, setCargaCampo, ubicaciones, setUbicaciones, lineas, setLineas, zonas, setZonas, consignados, setConsignados, proyectos, setProyectos, proveedores, setProveedores } = useDatos();

  const [modal, setModal] = useState(false);
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
      let proj = next.find((p) => p.code === sp.code);
      if (!proj) { if (onlyExisting) continue; proj = { code: sp.code, nombre: sp.nombre, ranchos: [] }; next.push(proj); }
      for (const sr of (sp.ranchos || [])) {
        const sap = { item: sr.item, ordenes: sr.ordenes, plannedQty: sr.plannedQty, completedQty: sr.completedQty };
        // match por sapKey (Lote original) para permitir renombrar sin duplicar;
        // compat con datos viejos (tienen `sap` y nombre igual, sin sapKey aún).
        const ex = proj.ranchos.find((r) => r.sapKey === sr.nombre)
          || proj.ranchos.find((r) => !r.sapKey && r.sap && r.nombre === sr.nombre);
        if (!ex) proj.ranchos.push({ nombre: sr.nombre, departamento: sr.departamento || "", cultivo: sr.cultivo || "", responsables: [], sap, sapKey: sr.nombre });
        else { ex.sapKey = sr.nombre; ex.departamento = ex.departamento || sr.departamento || ""; ex.cultivo = sr.cultivo || ex.cultivo || ""; ex.sap = sap; } // nombre/responsables editados se conservan
      }
    }
    return next;
  };
  // Refresca SOLO las temporadas que YA están en el catálogo (actualiza cantidades; no agrega nuevas).
  const actualizarDeSAP = async () => {
    setSapCargando(true); setSapError(""); setSapInfo("");
    try {
      const data = await getCatalogoProyectosSAP("");
      setProyectos((prev) => mergeProyectos(prev, data.proyectos || [], true));
      setSapInfo("Cantidades actualizadas desde SAP");
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
  const [ocComentario, setOcComentario] = useState("");
  const [ocCargando, setOcCargando] = useState(false);
  const [ocError, setOcError] = useState("");
  const [ocConfirm, setOcConfirm] = useState(false); // 2do paso: confirmar antes de escribir en SAP
  const [itemsFlete, setItemsFlete] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [cultivos, setCultivos] = useState([]);

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
    try { const d = await getItemsFleteSAP(); setItemsFlete(d.value || []); } catch { /* noop */ }
    try { const d = await getTaxCodesSAP(); setTaxCodes(d.value || []); } catch { /* noop */ }
    try { const d = await getCultivosSAP(); setCultivos(d.value || []); } catch { /* noop */ }
  };
  const abrirOC = (m) => {
    setOcError(""); setOcConfirm(false); setOcCardCode(""); setOcItem(""); setOcTax("");
    // Default del cultivo: el que viene anidado al proyecto/rancho (editable abajo).
    const proj = (proyectos || []).find((p) => p.code === m.proyecto);
    const r = proj?.ranchos?.find((x) => x.nombre === m.rancho);
    setOcCultivo(r?.cultivo || "");
    setOcComentario(`Acarreo flete · Folio ${m.folio || ""} · ${m.rancho || ""} · ${m.fecha || ""}${m.chofer ? " · " + m.chofer : ""}`.trim());
    setOcMov(m);
    cargarCatalogosOC();
  };
  // Defaults cuando llegan los catálogos y hay modal de OC abierto.
  useEffect(() => {
    if (!ocMov) return;
    if (!ocItem && itemsFlete.length) {
      const it = itemsFlete.find((x) => /acarreo de fruta/i.test(x.ItemName || "")) || itemsFlete[0];
      setOcItem(it?.ItemCode || "");
    }
    if (!ocTax && taxCodes.length) {
      const t = taxCodes.find((x) => /16/.test(`${x.Code} ${x.Name}`)) || taxCodes[0];
      setOcTax(t?.Code || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocMov, itemsFlete, taxCodes]);
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
        departamento: r?.departamento || m.departamento || null, comentario: ocComentario,
      });
      setMovimientos((prev) => prev.map((x) => x.id === m.id ? { ...x, ocSAP: { solicitud: res.solicitud, pedido: res.pedido, cardCode: ocCardCode, item: ocItem, precio, taxCode: ocTax, ts: new Date().toISOString() } } : x));
      setOcMov(null);
    } catch (e) { setOcError(String(e?.message || e)); }
    finally { setOcCargando(false); }
  };

  // ── Editor de Temporadas (manual + SAP) · estilo unificado, todo se guarda en BD ──
  const upTemp = (fn) => setProyectos((prev) => (Array.isArray(prev) ? prev : []).map(fn));
  const addTemporada = () => setProyectos((prev) => [...(Array.isArray(prev) ? prev : []), { code: nuevoId("TMP_"), nombre: "Nueva temporada", ranchos: [] }]);
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
    proyecto: "", rancho: "", departamento: "", lote: "", horaInicio: "", horaTermino: "", responsableCosecha: "",
    consignado: "", origen: "", distribuidor: "", destino: "",
    cargaItems: [{ prod: "", parrillas: "", bultos: "" }],
    // transporte
    linea: "", contacto: "", numero: "", chofer: "", telefono: "", licencia: "",
    marcaModelo: "", placaTracto: "", economicoCaja: "", placaCaja: "",
    telOperador: "", inicioPreenfriado: "", terminoPreenfriado: "", flete: "",
    // extra
    remision: "", pesoBascula: "",
    responsable: "Oscar",
  };
  const [form, setForm] = useState(formVacio);

  const resetModos = () => { setLineaNueva(false); setChoferNuevo(false); setTractoNuevo(false); setCajaNueva(false); };

  const abrirNuevo = () => { setForm(formVacio); setEditId(null); resetModos(); setModal(true); };

  // Editar un movimiento existente. Si ya fue recibido/rechazado en M9, avisa que la
  // base de datos ya se afectó y hay que notificar manualmente.
  const abrirEditar = (m) => {
    const estado = m.recepcion?.estado;
    if (estado === "recibido" || estado === "rechazado") {
      window.alert(`⚠️ Este flete ya fue ${estado === "recibido" ? "RECIBIDO" : "RECHAZADO"} en Recepción en Empaque.\n\nLos cambios que hagas aquí NO actualizan automáticamente lo que ya quedó registrado en recepción/empaque. Debes AVISAR MANUALMENTE al área, porque la base de datos ya se afectó.`);
    }
    // Protege contra registros del backend que vienen sin todos los campos.
    setForm({ ...formVacio, ...m, cargaItems: m.cargaItems?.length ? m.cargaItems : [{ prod: "", parrillas: "", bultos: "" }] });
    setEditId(m.id);
    resetModos();
    setModal(true);
  };

  const cerrarModal = () => { setModal(false); setEditId(null); resetModos(); };

  const lineaSel = lineas.find((l) => l.linea === form.linea);
  const proyectoSel = proyectos.find((p) => p.code === form.proyecto); // proyecto elegido → sus ranchos
  const ranchoSelForm = proyectoSel?.ranchos.find((r) => r.nombre === form.rancho); // rancho elegido → responsables

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
      setMovimientos((prev) => prev.map((mm) => (mm.id === editId ? { ...form, id: editId, actualizado: new Date().toLocaleString("es-MX") } : mm)));
    } else {
      const mov = { ...form, id: nuevoId("MOV_"), creado: new Date().toLocaleString("es-MX") };
      setMovimientos((prev) => [mov, ...prev]);
    }
    setEditId(null);
    setModal(false);
    resetModos();
  };

  const borrarMov = (id) => { if (window.confirm("¿Eliminar este movimiento?")) setMovimientos((prev) => prev.filter((m) => m.id !== id)); };

  // ── Editores de catálogos ──
  const updCarga = (id, val) => setCargaCampo((prev) => prev.map((c) => c.id === id ? { ...c, label: val } : c));
  const addCarga = () => setCargaCampo((prev) => [...prev, { id: nuevoId("CC_"), label: "Nuevo tipo" }]);
  const delCarga = (id) => setCargaCampo((prev) => prev.filter((c) => c.id !== id));

  const updUbic = (tipo, id, val) => setUbicaciones((prev) => ({ ...prev, [tipo]: prev[tipo].map((u) => u.id === id ? { ...u, nombre: val } : u) }));
  const addUbic = (tipo) => setUbicaciones((prev) => ({ ...prev, [tipo]: [...prev[tipo], tipo === "origenes" ? { id: nuevoId("U_"), nombre: "Nuevo rancho", lotes: [], responsables: [] } : { id: nuevoId("U_"), nombre: "Nuevo empaque" }] }));
  const delUbic = (tipo, id) => setUbicaciones((prev) => ({ ...prev, [tipo]: prev[tipo].filter((u) => u.id !== id) }));

  // Subcatálogos del rancho (lotes / responsables de cosecha) — arreglos de texto
  const addRanchoSub = (ranchoId, sub) => setUbicaciones((prev) => ({ ...prev, origenes: prev.origenes.map((o) => o.id === ranchoId ? { ...o, [sub]: [...(o[sub] || []), sub === "lotes" ? "Nuevo lote" : "Nuevo responsable"] } : o) }));
  const updRanchoSub = (ranchoId, sub, idx, val) => setUbicaciones((prev) => ({ ...prev, origenes: prev.origenes.map((o) => o.id === ranchoId ? { ...o, [sub]: (o[sub] || []).map((x, j) => j === idx ? val : x) } : o) }));
  const delRanchoSub = (ranchoId, sub, idx) => setUbicaciones((prev) => ({ ...prev, origenes: prev.origenes.map((o) => o.id === ranchoId ? { ...o, [sub]: (o[sub] || []).filter((_, j) => j !== idx) } : o) }));

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
    if (movsFiltrados.length === 0) { alert("No hay movimientos para exportar con los filtros actuales."); return; }
    const filas = movsFiltrados.map((m) => {
      const par = (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.parrillas) || 0), 0);
      const bul = (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.bultos) || 0), 0);
      const flete = parseFloat(m.flete) || 0;
      const pesoKg = parseFloat(m.pesoBascula) || 0;
      return {
        Folio: m.folio || "", Fecha: m.fecha || "", Remisión: m.remision || "",
        Viaje: m.viaje || "", Temporada: ranchoDe(m), Lote: loteDe(m),
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
  const movsFiltrados = movimientos.filter((m) => {
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

  // Semáforo $/kg: promedio (sobre todos los movimientos con flete y peso válidos) y
  // desviación de cada fila. ≤5% verde · ≤10% amarillo · >10% rojo.
  const costosKg = movimientos
    .map((m) => { const f = parseFloat(m.flete) || 0; const p = parseFloat(m.pesoBascula) || 0; return f > 0 && p > 0 ? f / p : 0; })
    .filter((x) => x > 0);
  const promedioKg = costosKg.length ? costosKg.reduce((a, x) => a + x, 0) / costosKg.length : 0;
  const semaforoKg = (costo) => {
    if (!costo || !promedioKg) return null;
    const desv = Math.abs(costo - promedioKg) / promedioKg * 100;
    if (desv <= 5) return { cls: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500", desv };
    if (desv <= 10) return { cls: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500", desv };
    return { cls: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", desv };
  };
  const limpiarFiltros = () => { setQ(""); setFDestino(""); setFRancho(""); };

  const lineaActualId = lineaNueva ? "__nueva__" : (lineaSel?.id || "");
  const choferActualId = choferNuevo ? "__nuevo__" : ((lineaSel?.choferes || []).find((c) => c.nombre === form.chofer)?.id || "");
  const tractoActualId = tractoNuevo ? "__nuevo__" : ((lineaSel?.tractos || []).find((t) => t.placa === form.placaTracto)?.id || "");
  const cajaActualId = cajaNueva ? "__nueva__" : ((lineaSel?.cajas || []).find((c) => c.placa === form.placaCaja)?.id || "");
  const hayLinea = !!form.linea;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Movimientos Internos Campo → Empaques</h1>
          <p className="text-sm text-gray-500 mt-0.5">Oscar · manifiesto de carga nacional desde campo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatCarga(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">📦 Carga</button>
          <button onClick={() => setCatUbic(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">📍 Ranchos / Empaques</button>
          <button onClick={() => setCatZonas(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">🗺️ Zonas</button>
          <button onClick={() => setCatConsig(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">🏢 Consignados</button>
          <button onClick={() => setCatFleteros(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">🚚 Fleteros</button>
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">OS</div>
          <span className="text-sm font-medium text-gray-700">Oscar</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">Movimientos registrados ({movsFiltrados.length}{hayFiltros ? ` de ${movimientos.length}` : ""})</span>
            {promedioKg > 0 && (
              <span className="text-[11px] text-gray-500 flex items-center gap-2">
                <span>$/kg prom: <b className="text-gray-700">${promedioKg.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>≤5%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>≤10%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>&gt;10%</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportarExcel} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 flex items-center gap-1">📊 Excel{hayFiltros ? " (filtrado)" : ""}</button>
            <button onClick={abrirNuevo} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700">+ Nuevo movimiento</button>
          </div>
        </div>
        {movimientos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-white">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, remisión, rancho, chofer, línea…"
              className="flex-1 min-w-[220px] text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <div className="w-44"><SearchSelect className={INP} value={fDestino} onChange={setFDestino} placeholder="Destino: todos" options={[{ value: "", label: "Destino: todos" }, ...destinosMov.map((d) => ({ value: d, label: d }))]} /></div>
            <div className="w-44"><SearchSelect className={INP} value={fRancho} onChange={setFRancho} placeholder="Temporada: todas" options={[{ value: "", label: "Temporada: todas" }, ...ranchosMov.map((r) => ({ value: r, label: r }))]} /></div>
            {hayFiltros && <button onClick={limpiarFiltros} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Limpiar</button>}
          </div>
        )}
        {movimientos.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">Sin movimientos. Registra el primero con "+ Nuevo movimiento".</div>
        ) : movsFiltrados.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">Ningún movimiento coincide con la búsqueda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "900px" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Folio</th>
                  <th className="text-left px-3 py-2 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium">Temporada</th>
                  <th className="text-left px-3 py-2 font-medium">Origen → Destino</th>
                  <th className="text-left px-3 py-2 font-medium">Línea / Chofer</th>
                  <th className="text-right px-3 py-2 font-medium">Parrillas</th>
                  <th className="text-right px-3 py-2 font-medium">Bultos</th>
                  <th className="text-right px-3 py-2 font-medium">Flete</th>
                  <th className="text-right px-3 py-2 font-medium">$/kg</th>
                  <th className="text-center px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.map((m) => {
                  const par = (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.parrillas) || 0), 0);
                  const bul = (m.cargaItems || []).reduce((a, it) => a + (parseFloat(it.bultos) || 0), 0);
                  const flete = parseFloat(m.flete) || 0;
                  const pesoKg = parseFloat(m.pesoBascula) || 0;
                  const costoKg = flete > 0 && pesoKg > 0 ? flete / pesoKg : 0;
                  return (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-bold text-red-600">{m.folio || "—"}</td>
                      <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{m.fecha || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{ranchoDe(m) || "—"}{loteDe(m) ? ` · ${loteDe(m)}` : ""}</td>
                      <td className="px-3 py-2 text-gray-600">{m.origen || "—"} → {m.destino || "—"}</td>
                      <td className="px-3 py-2 text-gray-700"><div className="font-medium">{m.linea || "—"}</div><div className="text-gray-400">{m.chofer || "—"}</div></td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{par || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">{bul ? bul.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{flete ? "$" + flete.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {(() => {
                          const s = semaforoKg(costoKg);
                          if (!s) return <span className="text-gray-300">—</span>;
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-semibold ${s.cls}`} title={`${s.desv.toFixed(1)}% vs promedio ($${promedioKg.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg)`}>
                              <span className={`w-2 h-2 rounded-full ${s.dot}`}></span>
                              ${costoKg.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button onClick={() => setVerMov(m)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 mr-1">👁️ Ver</button>
                        <button onClick={() => abrirEditar(m)} className="text-xs px-2 py-1 border border-blue-200 rounded-lg bg-white hover:bg-blue-50 text-blue-600 mr-1">✏️ Editar</button>
                        {m.ocSAP ? (
                          <span title="Orden de compra creada en SAP" className="text-xs px-2 py-1 border border-green-200 rounded-lg bg-green-50 text-green-700 mr-1">✓ OC #{m.ocSAP.pedido?.docNum ?? m.ocSAP.solicitud?.docNum}</span>
                        ) : (
                          <button onClick={() => abrirOC(m)} className="text-xs px-2 py-1 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 text-indigo-600 mr-1">📄 OC</button>
                        )}
                        <button onClick={() => borrarMov(m.id)} className="text-xs px-2 py-1 border border-red-200 rounded-lg bg-white hover:bg-red-50 text-red-500">🗑️</button>
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
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-5">

              {/* Encabezado del viaje */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos del viaje</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={LBL}>Folio</label><input className={INP} value={form.folio} onChange={(e) => setForm((f) => ({ ...f, folio: e.target.value }))} placeholder="No. 0203" /></div>
                  <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} /></div>
                  <div><label className={LBL}>Viaje (zona)</label>
                    <SearchSelect className={INP} value={form.viaje} onChange={(v) => setForm((f) => ({ ...f, viaje: v }))} placeholder="— Zona —"
                      options={zonas.map((z) => ({ value: z, label: z }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label className={LBL}>Temporada</label>
                    <SearchSelect className={INP} value={form.proyecto} onChange={(v) => setForm((f) => ({ ...f, proyecto: v, rancho: "", departamento: "", responsableCosecha: "" }))} placeholder="— Temporada —"
                      options={proyectos.map((p) => ({ value: p.code, label: p.nombre }))} />
                  </div>
                  <div><label className={LBL}>Rancho</label>
                    <SearchSelect className={INP} value={form.rancho} disabled={!proyectoSel}
                      onChange={(v) => { const rr = proyectoSel?.ranchos.find((x) => x.nombre === v); setForm((f) => ({ ...f, rancho: v, departamento: rr?.departamento || "", responsableCosecha: "" })); }}
                      placeholder={proyectoSel ? "— Rancho —" : "Elige temporada"} options={(proyectoSel?.ranchos || []).map((r) => ({ value: r.nombre, label: r.nombre }))} />
                    {form.departamento ? <div className="text-[10px] text-gray-400 mt-0.5">Depto: {form.departamento}</div> : null}
                  </div>
                  <div><label className={LBL}>Responsable cosecha</label>
                    <SearchSelect className={INP} value={form.responsableCosecha} onChange={(v) => setForm((f) => ({ ...f, responsableCosecha: v }))} disabled={!ranchoSelForm}
                      placeholder={ranchoSelForm ? "— Responsable —" : "Elige rancho"} options={(ranchoSelForm?.responsables || []).map((r) => ({ value: r, label: r }))} />
                  </div>
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
                <div className="border border-gray-200 rounded-lg">
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
                          <td className="px-2 py-1 text-center">{form.cargaItems.length > 1 && <button onClick={() => delCargaItem(i)} className="text-gray-300 hover:text-red-500">✕</button>}</td>
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

              {/* Remisión + báscula */}
              <div className="grid grid-cols-2 gap-2">
                <div><label className={LBL}>Remisión</label><input className={INP} value={form.remision} onChange={(e) => setForm((f) => ({ ...f, remision: e.target.value }))} /></div>
                <div><label className={LBL}>Peso de báscula (kg)</label><input className={INP} value={form.pesoBascula} onChange={(e) => setForm((f) => ({ ...f, pesoBascula: e.target.value }))} placeholder="kg" /></div>
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
                      { value: "__nueva__", label: "➕ Nueva línea de transporte" },
                    ]}
                  />
                </div>
                {lineaNueva && <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-2">✏️ Capturando línea nueva — se guarda en el catálogo al guardar</div>}
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
                          { value: "__nuevo__", label: "➕ Nuevo chofer" },
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
                          { value: "__nuevo__", label: "➕ Nuevo tracto" },
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
                          { value: "__nueva__", label: "➕ Nueva caja" },
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
              <button onClick={() => setVerMov(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Fecha", verMov.fecha], ["Viaje", verMov.viaje], ["Temporada", ranchoDe(verMov)],
                  ["Lote", loteDe(verMov)], ["Departamento", verMov.departamento], ["Inicio cosecha", verMov.horaInicio], ["Término cosecha", verMov.horaTermino],
                  ["Resp. cosecha", verMov.responsableCosecha], ["Consignado", verMov.consignado], ["Distribuidor", verMov.distribuidor],
                  ["Origen", verMov.origen], ["Destino", verMov.destino], ["Remisión", verMov.remision],
                  ["Peso báscula (kg)", verMov.pesoBascula],
                ].map(([l, v]) => (
                  <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                ))}
              </div>
              <div>
                <div className="text-gray-400 mb-1 font-medium uppercase">Carga</div>
                <table className="w-full">
                  <thead><tr className="text-gray-400"><th className="text-left py-1">Producto</th><th className="text-right py-1">Parrillas</th><th className="text-right py-1">Bultos</th></tr></thead>
                  <tbody>
                    {(verMov.cargaItems || []).map((it, i) => (
                      <tr key={i} className="border-t border-gray-100"><td className="py-1">{it.prod || "—"}</td><td className="py-1 text-right">{it.parrillas || "—"}</td><td className="py-1 text-right">{it.bultos || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="text-gray-400 mb-1 font-medium uppercase">Transporte</div>
                <div className="grid grid-cols-3 gap-2">
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
              <button onClick={() => setCatCarga(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              {cargaCampo.map((c) => (
                <div key={c.id} className="flex items-center gap-2 mb-2">
                  <input value={c.label} onChange={(e) => updCarga(c.id, e.target.value)} className={INP_TBL} />
                  <button onClick={() => delCarga(c.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
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
              <button onClick={() => setCatUbic(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-5">
              {/* ── Temporadas (proyectos SAP + manuales) · editable; todo se guarda en BD ── */}
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="text-xs font-bold text-gray-700">🌱 Temporadas · con sus ranchos y responsables de cosecha</div>
                  <button onClick={actualizarDeSAP} disabled={sapCargando} title="Actualiza cantidades de las temporadas que ya tienes (no agrega nuevas)"
                    className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">
                    {sapCargando ? "…" : "🔄 Actualizar de SAP"}
                  </button>
                </div>
                {sapError && <div className="text-[11px] text-red-600 mb-1">No se pudo traer de SAP: {sapError}</div>}
                {sapInfo && <div className="text-[11px] text-green-700 mb-2">{sapInfo}. Lo que edites a mano se conserva al volver a traer.</div>}
                {proyectos.length > 1 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] text-gray-500">Ver:</span>
                    <select value={sapFiltro} onChange={(e) => setSapFiltro(e.target.value)} className={INP + " w-auto"}>
                      <option value="">Todas las temporadas</option>
                      {proyectos.map((p) => <option key={p.code} value={p.code}>{p.nombre}</option>)}
                    </select>
                  </div>
                )}
                {proyectos.filter((p) => !sapFiltro || p.code === sapFiltro).map((p) => (
                  <div key={p.code} className="border border-gray-200 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <input value={p.nombre} onChange={(e) => updTemporada(p.code, e.target.value)} className={INP_TBL + " font-semibold"} placeholder="Nombre de la temporada" />
                      <button onClick={() => { if (window.confirm("¿Quitar esta temporada del catálogo? (no toca SAP)")) delTemporada(p.code); }} className="text-gray-300 hover:text-red-500 text-sm" title="Eliminar temporada">✕</button>
                    </div>
                    <div className="space-y-2 pl-1">
                      {(p.ranchos || []).map((r, ri) => (
                        <div key={ri} className="border border-gray-100 rounded-md p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <input value={r.nombre} onChange={(e) => updRanchoFld(p.code, ri, "nombre", e.target.value)} className={INP_TBL + " font-medium"} placeholder="Rancho" />
                            <button onClick={() => delRancho(p.code, ri)} className="text-gray-300 hover:text-red-500 text-xs" title="Eliminar rancho">✕</button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
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
                                  <button onClick={() => delResp(p.code, ri, i)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
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
                {proyectos.length === 0 && <div className="text-[11px] text-gray-400 italic mb-2">Aún no hay temporadas. Agrega una a mano o da clic en "Traer de SAP".</div>}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-gray-500">➕ Agregar temporada de SAP:</span>
                  <div className="w-64">
                    <SearchSelect className={INP} value={sapPick}
                      onChange={(v) => agregarTemporadaDeSAP(v)}
                      placeholder={sapDisp.some((c) => !proyectos.some((p) => p.code === c)) ? "Buscar temporada en SAP…" : "(no hay nuevas en SAP)"}
                      options={sapDisp.filter((c) => !proyectos.some((p) => p.code === c)).map((c) => ({ value: c, label: c }))} />
                  </div>
                  <button onClick={addTemporada} className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1" title="Crear una temporada vacía a mano (sin SAP)">o crear vacía</button>
                </div>
              </div>
              {/* Editor manual de ranchos viejos (Los Mochis/Culiacán) OCULTO a propósito.
                  Los datos en `ubicaciones.origenes` se conservan en la BD; ahora el catálogo
                  vivo es el de Temporadas de arriba. Para reactivarlo, restaurar este bloque. */}
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2">🏭 Destinos (empaques)</div>
                {ubicaciones.destinos.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 mb-2">
                    <input value={d.nombre} onChange={(e) => updUbic("destinos", d.id, e.target.value)} className={INP_TBL} />
                    <button onClick={() => delUbic("destinos", d.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
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
              <div className="text-sm font-semibold text-gray-900">🗺️ Zonas (Viaje)</div>
              <button onClick={() => setCatZonas(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              {zonas.map((z, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={z} onChange={(e) => updZona(i, e.target.value)} className={INP_TBL} />
                  <button onClick={() => delZona(i)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
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
                <div className="text-sm font-semibold text-gray-900">🏢 Consignados / Distribuidores</div>
                <div className="text-xs text-gray-500 mt-0.5">Mismo catálogo para ambos campos</div>
              </div>
              <button onClick={() => setCatConsig(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              {consignados.map((c, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={c} onChange={(e) => updConsig(i, e.target.value)} className={INP_TBL} />
                  <button onClick={() => delConsig(i)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
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
                <div className="text-sm font-semibold text-gray-900">🚚 Fleteros (proveedores SAP)</div>
                <div className="text-xs text-gray-500 mt-0.5">Para la orden de compra de flete</div>
              </div>
              <button onClick={() => setCatFleteros(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <input value={flBuscar} onChange={(e) => setFlBuscar(e.target.value)} placeholder="Buscar por nombre/código…" className={INP + " flex-1 min-w-[180px]"} />
                <button onClick={cargarProveedoresSAP} disabled={flCargando} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {flCargando ? "Cargando…" : "🔄 Traer de SAP"}
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
                <div className="text-sm font-semibold text-gray-900">📄 Orden de compra de flete — Folio {m.folio || "—"}</div>
                <button onClick={() => setOcMov(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-400">Temporada</span><div className="font-medium text-gray-800">{m.proyecto || "—"}</div></div>
                  <div><span className="text-gray-400">Rancho</span><div className="font-medium text-gray-800">{m.rancho || "—"}</div></div>
                  <div><span className="text-gray-400">Departamento</span><div className="font-medium text-gray-800">{r?.departamento || m.departamento || "—"}</div></div>
                </div>
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 text-xs flex items-center justify-between">
                  <span className="text-gray-500">Precio (Flete $ del movimiento)</span>
                  <span className="text-lg font-bold text-indigo-700">${precio.toLocaleString()}</span>
                </div>
                {!(precio > 0) && <div className="text-[11px] text-amber-600">⚠️ Este movimiento no tiene "Flete $". Edítalo y captura el flete antes de mandar la OC.</div>}
                <div>
                  <label className={LBL}>Cultivo {r?.cultivo ? <span className="text-gray-400 font-normal">· del proyecto: {r.cultivo}</span> : null}</label>
                  <SearchSelect className={INP} value={ocCultivo} onChange={setOcCultivo} searchThreshold={0} placeholder="— Cultivo (norma de reparto) —"
                    options={(() => {
                      const opts = cultivos.map((c) => ({ value: c.FactorCode, label: `${c.FactorCode}${c.FactorDescription ? " · " + c.FactorDescription : ""}` }));
                      if (ocCultivo && !opts.some((o) => o.value === ocCultivo)) opts.unshift({ value: ocCultivo, label: ocCultivo });
                      return opts;
                    })()} />
                </div>
                <div>
                  <label className={LBL}>Fletero (proveedor)</label>
                  <SearchSelect className={INP} value={ocCardCode} onChange={setOcCardCode} searchThreshold={0} placeholder={proveedores.length ? "— Elige fletero —" : "Trae fleteros en 🚚 Fleteros"}
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
                  <div className="text-[12px] text-amber-800 font-medium mb-2">⚠️ ¿Seguro? Esto va a <b>crear la OC directamente en SAP</b> (Solicitud de Pedido + Pedido). Esta acción no se puede deshacer desde aquí.</div>
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