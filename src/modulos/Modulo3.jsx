import { useState } from "react";
import { User, Users, Truck, DollarSign, Pencil, Thermometer, AlertTriangle, Check, Trash2, ClipboardList, Bell, Inbox, FileText, PackageOpen, X, Save, Plus, Package, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import SearchSelect from "../components/SearchSelect";
import ColaTabs from "../components/ColaTabs";
import { useDialog } from "../components/Dialog";
import { generarPrecargaPDF } from "./reportes/reportePrecarga";
import { useDatos, ORIGEN, ORIGENES, DESTINOS_ALL, DC, STATUS_CFG, EMPTY_TRAILER, PRECARGA_PREGUNTAS, ALERGENOS_MX, nuevoId, calcularDias, etiquetaSemana, moverSemana } from "../store/datos";

import { lunesActual } from "../utils/fecha";

export default function Modulo3() {
  const { trailers, setTrailers, requerimientoGen, requerimientoMeta, setRequerimientoMeta, lineas, setLineas, bitacora } = useDatos();
  const dlg = useDialog();
  const [semana, setSemana] = useState(lunesActual());
  const dias = calcularDias(semana);
  const [diaFil, setDiaFil] = useState(dias[0]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [catLineas, setCatLineas] = useState(false);
  const [catChoferes, setCatChoferes] = useState(false);
  const [inspTrailer, setInspTrailer] = useState(null); // trailer al que se le hace inspección precarga
  const [inspForm, setInspForm] = useState(null);
  const [inspTab, setInspTab] = useState("precarga"); // "precarga" | "alergenos"
  const [tabPool, setTabPool] = useState("activos"); // activos | historial
  const [verHistorial, setVerHistorial] = useState(false); // historial de cambios del requerimiento
  const [lineaNueva, setLineaNueva] = useState(false);
  const [choferNuevo, setChoferNuevo] = useState(false);
  const [tractoNuevo, setTractoNuevo] = useState(false);
  const [cajaNueva, setCajaNueva] = useState(false);

  const reqSemana = requerimientoGen[semana] || [];
  // Historial de envíos/cambios del requerimiento de esta semana (de la bitácora, ya persistida en el backend)
  const histReq = bitacora.filter((e) => e.evento === "requerimiento_enviado" && e.meta?.semana === semana);

  const hoy = trailers.filter((t) => t.fecha === diaFil);
  const hoyActivos = hoy.filter((t) => t.status !== "en_ruta");
  const hoyEnRuta = hoy.filter((t) => t.status === "en_ruta");
  const listaPool = tabPool === "activos" ? hoyActivos : hoyEnRuta;
  const reqsHoy = reqSemana.filter((r) => r.fecha === diaFil);
  const destinos = [...new Set(reqsHoy.map((r) => r.dest))];

  const totalSol = reqsHoy.reduce((a, r) => a + r.sol, 0);
  const sinAsignar = hoy.filter((t) => !t.dest || t.dest === "Sin asignar").length;
  const enInstal = hoy.filter((t) => t.status === "en_instalaciones").length;
  const enRuta = hoy.filter((t) => t.status === "en_ruta").length;

  const resumenSemana = {};
  reqSemana.forEach((r) => {
    if (!resumenSemana[r.dest]) resumenSemana[r.dest] = { dest: r.dest, total: 0, contrato: 0, abierto: 0 };
    resumenSemana[r.dest].total += r.sol;
    if (r.tipo === "M. Abierto") resumenSemana[r.dest].abierto += r.sol;
    else resumenSemana[r.dest].contrato += r.sol;
  });
  const resumenArr = Object.values(resumenSemana).sort((a, b) => b.total - a.total);
  const totalSemana = resumenArr.reduce((a, r) => a + r.total, 0);

  // Mónica vio el aviso de cambio de Kiko → se marca como visto (deja de aparecer).
  const marcarAvisoVisto = () => setRequerimientoMeta((prev) => ({ ...prev, [semana]: { ...prev[semana], avisoVisto: true } }));

  const resetModos = () => { setLineaNueva(false); setChoferNuevo(false); setTractoNuevo(false); setCajaNueva(false); };

  const addTrailer = () => {
    const t = { ...EMPTY_TRAILER, id: nuevoId("T_"), fecha: diaFil, origen: ORIGEN, dest: "Sin asignar", status: "esperando" };
    setTrailers((prev) => [...prev, t]);
    setForm({ ...t });
    resetModos();
    setModal(t.id);
  };
  const openModal = (t) => { setForm({ ...t }); resetModos(); setModal(t.id); };
  const delTrailer = async (id) => {
    if (await dlg.confirm({ title: "Eliminar trailer", message: "¿Eliminar este trailer? Esta acción no se puede deshacer.", confirmText: "Eliminar", danger: true })) {
      setTrailers((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const lineaSel = lineas.find((l) => l.linea === form.linea);

  const saveForm = () => {
    let lineasActualizadas = lineas;

    if (lineaNueva && (form.linea || "").trim()) {
      const existe = lineas.some((l) => l.linea.toLowerCase() === form.linea.trim().toLowerCase());
      if (!existe) {
        const nueva = { id: nuevoId("LN_"), linea: form.linea.trim(), contacto: form.contacto || "", numero: form.numero || "", choferes: [], tractos: [], cajas: [] };
        lineasActualizadas = [...lineasActualizadas, nueva];
      }
    }

    const idxLinea = lineasActualizadas.findIndex((l) => l.linea.toLowerCase() === (form.linea || "").trim().toLowerCase());
    if (idxLinea >= 0) {
      const L = { ...lineasActualizadas[idxLinea] };
      L.choferes = [...(L.choferes || [])];
      L.tractos = [...(L.tractos || [])];
      L.cajas = [...(L.cajas || [])];

      if (choferNuevo && (form.chofer || "").trim()) {
        const existe = L.choferes.some((c) => c.nombre.toLowerCase() === form.chofer.trim().toLowerCase());
        if (!existe) L.choferes.push({ id: nuevoId("CH_"), nombre: form.chofer.trim(), telefono: form.telefono || "", licencia: form.licencia || "" });
      }
      if (tractoNuevo && (form.placaTracto || "").trim()) {
        const existe = L.tractos.some((t) => t.placa.toLowerCase() === form.placaTracto.trim().toLowerCase());
        if (!existe) L.tractos.push({ id: nuevoId("TR_"), marcaModelo: form.marcaModelo || "", placa: form.placaTracto.trim() });
      }
      if (cajaNueva && (form.placaCaja || "").trim()) {
        const existe = L.cajas.some((c) => c.placa.toLowerCase() === form.placaCaja.trim().toLowerCase());
        if (!existe) L.cajas.push({ id: nuevoId("CJ_"), economico: form.economicoCaja || "", placa: form.placaCaja.trim() });
      }

      lineasActualizadas = lineasActualizadas.map((l, i) => (i === idxLinea ? L : l));
    }

    if (lineasActualizadas !== lineas) setLineas(lineasActualizadas);
    setTrailers((prev) => prev.map((t) => (t.id === modal ? { ...form } : t)));
    setModal(null);
    resetModos();
  };

  const setDest = (id, dest) => setTrailers((prev) => prev.map((t) => (t.id === id ? { ...t, dest } : t)));
  const setStatus = (id, status) => setTrailers((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));

  // ── Inspección precarga de transporte refrigerado (REG-EMP-15) + manifiesto de alérgenos ──
  // Lo que ya se capturó en la ficha del trailer se autollena aquí.
  const inspVacia = (t) => ({
    manifiesto: "",
    fecha: t?.fecha || "",
    companiaTransporte: t?.linea || "",
    nombreChofer: t?.chofer || "",
    placasTermo: t?.placaCaja || "",
    noEconomico: t?.economicoCaja || "",
    destino: t?.dest || "",
    // precarga refrigerado
    horaLlegada: "", tempLlegada: "",
    horaAbrioPuerta: "", tempAbrioPuerta: "",
    respuestas: Object.fromEntries(PRECARGA_PREGUNTAS.map((p) => [p.id, ""])),
    tempProducto: "", tempTermoCargar: "",
    sanitizoCaja: "", sanitizante: "", concentracion: "",
    // alérgenos
    cargasAnteriores: "",
    conoceAlergenos: "",
    alergenos: Object.fromEntries(ALERGENOS_MX.map((a) => [a, "No"])),
    aprobadoPor: "",
  });

  const openInsp = (t) => {
    // Re-autollena los datos del trailer por si cambiaron desde la última vez
    const base = inspVacia(t);
    const guardada = t.inspeccionPrecarga;
    setInspForm(guardada ? { ...base, ...guardada, respuestas: { ...base.respuestas, ...guardada.respuestas }, alergenos: { ...base.alergenos, ...guardada.alergenos } } : base);
    setInspTab("precarga");
    setInspTrailer(t);
  };
  const cerrarInsp = () => { setInspTrailer(null); setInspForm(null); };
  const updInsp = (campo, val) => setInspForm((f) => ({ ...f, [campo]: val }));
  const updRespuesta = (id, val) => setInspForm((f) => ({ ...f, respuestas: { ...f.respuestas, [id]: val } }));
  const updAlergeno = (a, val) => setInspForm((f) => ({ ...f, alergenos: { ...f.alergenos, [a]: val } }));
  const guardarInsp = () => {
    setTrailers((prev) => prev.map((t) => (t.id === inspTrailer.id ? { ...t, inspeccionPrecarga: { ...inspForm, guardado: new Date().toLocaleString("es-MX") } } : t)));
    cerrarInsp();
  };
  // Cuenta de hallazgos (respuestas indeseables) para el badge
  const hallazgosInsp = (insp) => {
    if (!insp) return 0;
    return PRECARGA_PREGUNTAS.reduce((a, p) => a + (insp.respuestas?.[p.id] && insp.respuestas[p.id] === p.malo ? 1 : 0), 0);
  };

  const elegirLinea = (valor) => {
    if (valor === "__nueva__") {
      setLineaNueva(true);
      setForm((f) => ({ ...f, linea: "", contacto: "", numero: "", chofer: "", telefono: "", licencia: "", marcaModelo: "", placaTracto: "", placaCaja: "", economicoCaja: "" }));
      return;
    }
    setLineaNueva(false); setChoferNuevo(false); setTractoNuevo(false); setCajaNueva(false);
    const l = lineas.find((x) => x.id === valor);
    if (l) setForm((f) => ({ ...f, linea: l.linea, contacto: l.contacto, numero: l.numero, chofer: "", telefono: "", licencia: "", marcaModelo: "", placaTracto: "", placaCaja: "", economicoCaja: "" }));
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

  // ── Editor catálogo de líneas ──
  const updLinea = (id, campo, val) => setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, [campo]: val } : l)));
  const addLinea = () => setLineas((prev) => [...prev, { id: nuevoId("LN_"), linea: "Nueva línea", contacto: "", numero: "", choferes: [], tractos: [], cajas: [] }]);
  const delLinea = (id) => setLineas((prev) => prev.filter((l) => l.id !== id));

  // ── Editor catálogo de choferes/tractos/cajas ──
  const updSub = (tipo, lineaId, subId, campo, val) => {
    setLineas((prev) => prev.map((l) => l.id === lineaId ? { ...l, [tipo]: (l[tipo] || []).map((s) => s.id === subId ? { ...s, [campo]: val } : s) } : l));
  };
  const moverSub = (tipo, fromLineaId, subId, toLineaId) => {
    if (fromLineaId === toLineaId) return;
    setLineas((prev) => {
      let item = null;
      const sinItem = prev.map((l) => {
        if (l.id === fromLineaId) {
          const arr = (l[tipo] || []).filter((s) => { if (s.id === subId) { item = s; return false; } return true; });
          return { ...l, [tipo]: arr };
        }
        return l;
      });
      if (!item) return prev;
      return sinItem.map((l) => l.id === toLineaId ? { ...l, [tipo]: [...(l[tipo] || []), item] } : l);
    });
  };
  const delSub = (tipo, lineaId, subId) => {
    setLineas((prev) => prev.map((l) => l.id === lineaId ? { ...l, [tipo]: (l[tipo] || []).filter((s) => s.id !== subId) } : l));
  };
  const addSub = (tipo) => {
    if (lineas.length === 0) return;
    const lineaId = lineas[0].id;
    const nuevo = tipo === "choferes" ? { id: nuevoId("CH_"), nombre: "Nuevo chofer", telefono: "", licencia: "" }
      : tipo === "tractos" ? { id: nuevoId("TR_"), marcaModelo: "Marca/Modelo", placa: "Placa" }
      : { id: nuevoId("CJ_"), economico: "Económico", placa: "Placa" };
    setLineas((prev) => prev.map((l) => l.id === lineaId ? { ...l, [tipo]: [...(l[tipo] || []), nuevo] } : l));
  };

  const aplanar = (tipo) => lineas.flatMap((l) => (l[tipo] || []).map((s) => ({ ...s, lineaId: l.id, lineaNombre: l.linea })));

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const INP_TBL = "w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none";

  // Control segmentado Sí/No para la inspección. `malo` resalta en rojo la respuesta indeseable.
  const sino = (val, onSet, malo) => (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
      {["si", "no"].map((op) => {
        const activo = val === op;
        const esMalo = malo && op === malo;
        return (
          <button key={op} onClick={() => onSet(op)} type="button"
            className={`text-xs px-3 py-1 font-semibold ${activo ? (esMalo ? "bg-red-500 text-white" : "bg-green-500 text-white") : "bg-white text-gray-500 hover:bg-gray-50"}`}>
            {op === "si" ? "Sí" : "No"}
          </button>
        );
      })}
    </div>
  );

  function MiniCard({ t, showDestSel }) {
    const s = STATUS_CFG[t.status] || STATUS_CFG.esperando;
    const dc = DC[t.dest] || DC["Sin asignar"];
    const has = t.chofer || t.placaTracto || t.linea;
    return (
      <div className={`rounded-xl border ${s.card} p-2.5`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${s.dot}`}></div>
            <span className="text-xs font-semibold text-gray-700">{s.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">{(t.origen || ORIGEN).split(",")[0]}</span>
            <span className="text-gray-300 text-xs">→</span>
            {showDestSel ? (
              <SearchSelect value={t.dest || "Sin asignar"} onChange={(v) => setDest(t.id, v)}
                className={`min-w-[120px] text-xs font-medium px-1.5 py-0.5 rounded-full border cursor-pointer ${dc}`}
                options={DESTINOS_ALL.map((d) => ({ value: d, label: d }))} />
            ) : (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${dc}`}>{t.dest}</span>
            )}
          </div>
        </div>
        {has ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mb-2 text-xs">
            {t.linea && <div className="truncate font-medium text-gray-800">{t.linea}</div>}
            {t.chofer && <div className="truncate inline-flex items-center gap-1"><User size={14} /> {t.chofer}</div>}
            {t.placaTracto && <div className="inline-flex items-center gap-1"><Truck size={14} /> {t.placaTracto}</div>}
            {t.flete && <div className="inline-flex items-center gap-1"><DollarSign size={14} /> <span className="font-semibold text-green-700">${t.flete}</span></div>}
          </div>
        ) : (
          <div className="text-xs text-gray-400 mb-2 italic">Sin datos — edita la ficha</div>
        )}
        <div className="flex gap-1 flex-wrap items-center">
          <button onClick={() => openModal(t)} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600"><Pencil size={14} /> Editar</button>
          {(() => {
            const hall = hallazgosInsp(t.inspeccionPrecarga);
            const hecha = !!t.inspeccionPrecarga;
            return (
              <button onClick={() => openInsp(t)} title="Inspección precarga de transporte refrigerado"
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 border rounded-lg bg-white ${hecha ? (hall > 0 ? "border-red-200 hover:bg-red-50 text-red-600" : "border-teal-200 hover:bg-teal-50 text-teal-600") : "border-cyan-200 hover:bg-cyan-50 text-cyan-600"}`}>
                <Thermometer size={14} /> {hecha ? (hall > 0 ? <span className="inline-flex items-center gap-0.5">Inspección <AlertTriangle size={14} />{hall}</span> : <span className="inline-flex items-center gap-0.5">Inspección <Check size={14} /></span>) : "Inspección"}
              </button>
            );
          })()}
          <button onClick={() => delTrailer(t.id)} className="inline-flex items-center justify-center text-xs px-2 py-1 border border-red-200 rounded-lg bg-white hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
          {t.status === "en_ruta" ? (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-green-100 border border-green-300 text-green-700 rounded-lg font-semibold"><Truck size={14} /> En ruta</span>
          ) : (
            <SearchSelect value={t.status} onChange={(v) => setStatus(t.id, v)}
              className={`w-44 text-xs px-2 py-1 rounded-lg border font-medium ${t.status === "en_instalaciones" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-600"}`}
              options={[{ value: "esperando", label: "Esperando" }, { value: "en_instalaciones", label: "En instalaciones" }]} />
          )}
        </div>
      </div>
    );
  }

  const lineaActualId = lineaNueva ? "__nueva__" : (lineaSel?.id || "");
  const choferActualId = choferNuevo ? "__nuevo__" : ((lineaSel?.choferes || []).find((c) => c.nombre === form.chofer)?.id || "");
  const tractoActualId = tractoNuevo ? "__nuevo__" : ((lineaSel?.tractos || []).find((t) => t.placa === form.placaTracto)?.id || "");
  const cajaActualId = cajaNueva ? "__nueva__" : ((lineaSel?.cajas || []).find((c) => c.placa === form.placaCaja)?.id || "");
  const hayLinea = !!form.linea;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Tablero de Tráfico</h1>
          <p className="text-sm text-gray-500 mt-0.5">Mónica · asignación y seguimiento de trailers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatChoferes(true)} className="inline-flex items-center gap-1 text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
            <Users size={14} /> Choferes y unidades
          </button>
          <button onClick={() => setCatLineas(true)} className="inline-flex items-center gap-1 text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
            <ClipboardList size={14} /> Catálogo de líneas
          </button>
          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">MO</div>
          <span className="text-sm font-medium text-gray-700">Mónica</span>
        </div>
      </div>

      {/* Selector de semana */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex items-center justify-between">
        <button onClick={() => setSemana(moverSemana(semana, -1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600"><span className="inline-flex items-center gap-1"><ChevronLeft size={16} /> Anterior</span></button>
        <div className="text-center">
          <div className="text-xs text-gray-400">Semana</div>
          <div className="text-sm font-semibold text-gray-900">{etiquetaSemana(semana)}</div>
        </div>
        <button onClick={() => setSemana(moverSemana(semana, 1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600"><span className="inline-flex items-center gap-1">Siguiente <ChevronRight size={16} /></span></button>
      </div>

      {/* Aviso: Kiko actualizó el requerimiento (resumen de qué cambió) */}
      {requerimientoMeta[semana]?.cambios && !requerimientoMeta[semana]?.avisoVisto && (() => {
        const c = requerimientoMeta[semana].cambios;
        const dT = c.totalAhora - c.totalAntes;
        return (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="inline-flex items-center gap-1 text-sm font-bold text-amber-800"><Bell size={16} /> Kiko actualizó el requerimiento</div>
                <div className="text-xs text-amber-700 mb-2">Ya se actualizó lo que ves abajo · {c.ts}</div>
                {c.items.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                    {c.items.map((it) => {
                      const d = it.ahora - it.antes;
                      return (
                        <div key={it.dest} className="text-xs bg-white border border-amber-200 rounded-lg px-2 py-1 flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-700 truncate">{it.dest}</span>
                          <span className="whitespace-nowrap"><span className="text-gray-400">{it.antes}</span> <span className="text-gray-300">→</span> <b className="text-gray-800">{it.ahora}</b> <span className={d > 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>({d > 0 ? "+" : ""}{d})</span></span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-amber-700">Se ajustaron detalles (fechas/tipo) sin cambiar los totales por destino.</div>
                )}
                <div className="text-xs text-gray-600 mt-2">Total: <span className="text-gray-400">{c.totalAntes}</span> → <b>{c.totalAhora}</b> trailer(s) <span className={dT > 0 ? "text-green-600 font-semibold" : dT < 0 ? "text-red-600 font-semibold" : "text-gray-400"}>({dT > 0 ? "+" : ""}{dT})</span></div>
              </div>
              <button onClick={marcarAvisoVisto} className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 whitespace-nowrap shrink-0">Entendido</button>
            </div>
          </div>
        );
      })()}

      {/* RESUMEN EJECUTIVO */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="inline-flex items-center gap-1 text-sm font-bold text-gray-900"><ClipboardList size={16} /> Resumen de la semana — qué conseguir</div>
            <div className="text-xs text-gray-500 mt-0.5">Requerimiento total enviado desde Cálculo de Trailers</div>
            {requerimientoMeta[semana]?.enviadoLocal && (
              <div className="inline-flex items-center gap-1 text-xs text-blue-600 mt-1 font-medium"><Inbox size={14} /> Recibido de {requerimientoMeta[semana].actor || "Kiko"}: {requerimientoMeta[semana].enviadoLocal}</div>
            )}
            {histReq.length > 0 && (
              <button onClick={() => setVerHistorial(true)} className="inline-flex items-center gap-1 text-xs mt-1 px-2 py-0.5 border border-blue-200 rounded-lg bg-white hover:bg-blue-50 text-blue-700 font-medium"><Calendar size={14} /> Historial de cambios ({histReq.length})</button>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-700">{totalSemana}</div>
            <div className="text-xs text-gray-500">trailers en total</div>
          </div>
        </div>
        {resumenArr.length === 0 ? (
          <div className="text-xs text-gray-400 italic text-center py-3 bg-white/60 rounded-lg">
            Aún no hay requerimiento. Genéralo desde Cálculo de Trailers (botón "Generar requerimiento").
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {resumenArr.map((r) => (
              <div key={r.dest} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[r.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{r.dest}</span>
                  <span className="text-lg font-bold text-gray-900">{r.total}</span>
                </div>
                <div className="flex gap-2 text-xs text-gray-500">
                  {r.contrato > 0 && <span className="inline-flex items-center gap-1"><FileText size={14} /> {r.contrato} contrato</span>}
                  {r.abierto > 0 && <span className="inline-flex items-center gap-1 text-purple-600"><PackageOpen size={14} /> {r.abierto} abierto</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filtro de días */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {dias.map((d) => (
          <button key={d} onClick={() => setDiaFil(d)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${diaFil === d ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}>
            {d}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { l: "Solicitados (día)", v: totalSol, c: "text-gray-900" },
          { l: "Sin asignar", v: sinAsignar, c: "text-gray-500" },
          { l: "En instalaciones", v: enInstal, c: "text-blue-700" },
          { l: "En ruta", v: enRuta, c: "text-green-700" },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="text-xs text-gray-500 mb-1">{s.l}</div>
            <div className={`text-xl font-semibold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Pool */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">Trailers registrados · {diaFil}</span>
          <button onClick={addTrailer} className="inline-flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700"><Plus size={14} /> Registrar trailer</button>
        </div>
        {hoy.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-6 italic">Ningún trailer registrado este día</div>
        ) : (
          <div className="p-3">
            <ColaTabs tab={tabPool} setTab={setTabPool} tabs={[
              { key: "activos", label: "Activos", count: hoyActivos.length },
              { key: "historial", label: "En ruta", count: hoyEnRuta.length },
            ]} />
            {listaPool.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-4 italic">{tabPool === "activos" ? "Sin trailers activos este día." : "Ningún trailer en ruta este día."}</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">{listaPool.map((t) => <MiniCard key={t.id} t={t} showDestSel={true} />)}</div>
            )}
          </div>
        )}
      </div>

      {/* Bloques por destino */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
        <span className="text-sm font-semibold text-gray-800">Por destino · {diaFil}</span>
      </div>
      {destinos.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center text-xs text-gray-400 italic">
          Sin requerimiento para este día
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {destinos.map((dest) => {
            const sol = reqsHoy.filter((r) => r.dest === dest).reduce((a, r) => a + r.sol, 0);
            const tD = hoy.filter((t) => t.dest === dest);
            const pct = sol > 0 ? Math.min(Math.round((tD.length / sol) * 100), 100) : 0;
            const dc = DC[dest] || "bg-gray-100 text-gray-600 border-gray-200";
            return (
              <div key={dest} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${dc}`}>{dest}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-gray-600 font-medium">{tD.length}/{sol}</span>
                    <div className="w-20 h-1.5 bg-gray-200 rounded overflow-hidden">
                      <div className={`h-full rounded ${pct >= 100 ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  {tD.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-3 italic">Sin trailers asignados</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">{tD.map((t) => <MiniCard key={t.id} t={t} showDestSel={false} />)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal ficha trailer */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Ficha del trailer</div>
              <button onClick={() => setModal(null)} className="inline-flex items-center justify-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Ruta</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500 block mb-0.5">Origen</label>
                    <SearchSelect className={INP} value={form.origen || ORIGEN} onChange={(v) => setForm((f) => ({ ...f, origen: v }))}
                      options={ORIGENES.map((o) => ({ value: o, label: o }))} /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Destino</label>
                    <SearchSelect className={INP} value={form.dest || "Sin asignar"} onChange={(v) => setForm((f) => ({ ...f, dest: v }))}
                      options={DESTINOS_ALL.map((d) => ({ value: d, label: d }))} /></div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Línea de transporte</div>
                <div className="mb-2">
                  <label className="text-xs text-gray-500 block mb-0.5">Elegir del catálogo</label>
                  <SearchSelect className={INP} value={lineaActualId} onChange={(v) => elegirLinea(v)}
                    placeholder="— Selecciona una línea —"
                    options={[...lineas.map((l) => ({ value: l.id, label: l.linea })), { value: "__nueva__", label: "+ Nueva línea de transporte" }]} />
                </div>
                {lineaNueva && (
                  <div className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-2">
                    <Pencil size={14} /> Capturando línea nueva — se guardará en el catálogo al guardar la ficha
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-xs text-gray-500 block mb-0.5">Línea</label>
                    <input className={INP + (lineaNueva ? "" : " bg-gray-50")} value={form.linea || ""} readOnly={!lineaNueva}
                      onChange={(e) => setForm((f) => ({ ...f, linea: e.target.value }))} /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Contacto</label>
                    <input className={INP + (lineaNueva ? "" : " bg-gray-50")} value={form.contacto || ""} readOnly={!lineaNueva}
                      onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))} /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Número</label>
                    <input className={INP + (lineaNueva ? "" : " bg-gray-50")} value={form.numero || ""} readOnly={!lineaNueva}
                      onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} /></div>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-500 block mb-0.5">Flete $</label>
                  <input className={INP} value={form.flete || ""} onChange={(e) => setForm((f) => ({ ...f, flete: e.target.value }))} />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Chofer y unidad</div>
                {!hayLinea ? (
                  <div className="text-xs text-gray-400 italic bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                    Primero elige una línea de transporte para ver sus choferes y unidades.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Chofer */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Chofer</label>
                      <SearchSelect className={INP} value={choferActualId} onChange={(v) => elegirChofer(v)}
                        placeholder="— Selecciona chofer —"
                        options={[...(lineaSel?.choferes || []).map((c) => ({ value: c.id, label: c.nombre })), { value: "__nuevo__", label: "+ Nuevo chofer" }]} />
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <input className={INP + (choferNuevo ? "" : " bg-gray-50")} value={form.chofer || ""} readOnly={!choferNuevo} placeholder="Nombre"
                          onChange={(e) => setForm((f) => ({ ...f, chofer: e.target.value }))} />
                        <input className={INP + (choferNuevo ? "" : " bg-gray-50")} value={form.telefono || ""} readOnly={!choferNuevo} placeholder="Teléfono"
                          onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
                        <input className={INP + (choferNuevo ? "" : " bg-gray-50")} value={form.licencia || ""} readOnly={!choferNuevo} placeholder="Licencia"
                          onChange={(e) => setForm((f) => ({ ...f, licencia: e.target.value }))} />
                      </div>
                    </div>

                    {/* Tracto: marca/modelo + placa */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Tracto</label>
                      <SearchSelect className={INP} value={tractoActualId} onChange={(v) => elegirTracto(v)}
                        placeholder="— Selecciona tracto —"
                        options={[...(lineaSel?.tractos || []).map((t) => ({ value: t.id, label: `${t.marcaModelo} · ${t.placa}` })), { value: "__nuevo__", label: "+ Nuevo tracto" }]} />
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <input className={INP + (tractoNuevo ? "" : " bg-gray-50")} value={form.marcaModelo || ""} readOnly={!tractoNuevo} placeholder="Marca y modelo"
                          onChange={(e) => setForm((f) => ({ ...f, marcaModelo: e.target.value }))} />
                        <input className={INP + (tractoNuevo ? "" : " bg-gray-50")} value={form.placaTracto || ""} readOnly={!tractoNuevo} placeholder="Placa tracto"
                          onChange={(e) => setForm((f) => ({ ...f, placaTracto: e.target.value }))} />
                      </div>
                    </div>

                    {/* Caja: económico + placa */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Caja</label>
                      <SearchSelect className={INP} value={cajaActualId} onChange={(v) => elegirCaja(v)}
                        placeholder="— Selecciona caja —"
                        options={[...(lineaSel?.cajas || []).map((c) => ({ value: c.id, label: `${c.economico} · ${c.placa}` })), { value: "__nueva__", label: "+ Nueva caja" }]} />
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <input className={INP + (cajaNueva ? "" : " bg-gray-50")} value={form.economicoCaja || ""} readOnly={!cajaNueva} placeholder="Económico"
                          onChange={(e) => setForm((f) => ({ ...f, economicoCaja: e.target.value }))} />
                        <input className={INP + (cajaNueva ? "" : " bg-gray-50")} value={form.placaCaja || ""} readOnly={!cajaNueva} placeholder="Placa caja"
                          onChange={(e) => setForm((f) => ({ ...f, placaCaja: e.target.value }))} />
                      </div>
                    </div>

                    {(choferNuevo || tractoNuevo || cajaNueva) && (
                      <div className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                        <Pencil size={14} /> Los datos nuevos se guardarán en el catálogo de {form.linea} al guardar la ficha
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={saveForm} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Guardar ficha</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal inspección precarga + alérgenos */}
      {inspTrailer && inspForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <div className="text-sm font-semibold text-gray-900">Inspección precarga de transporte refrigerado</div>
                <div className="text-xs text-gray-500 mt-0.5">REG-EMP-15 · POE-MP-09 · {inspForm.companiaTransporte || "—"} → {inspForm.destino || "—"}</div>
              </div>
              <button onClick={cerrarInsp} className="inline-flex items-center justify-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>

            {/* Pestañas */}
            <div className="px-5 pt-3 flex items-center gap-2 border-b border-gray-100">
              {[["precarga", <><Thermometer size={14} /> Precarga refrigerado</>], ["alergenos", <><AlertTriangle size={14} /> Alérgenos</>]].map(([k, label]) => (
                <button key={k} onClick={() => setInspTab(k)}
                  className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-t-lg font-medium border-b-2 -mb-px ${inspTab === k ? "border-cyan-500 text-cyan-700 bg-cyan-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Datos generales (autollenados, editables) */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos del transporte <span className="font-normal text-gray-400 normal-case">— autollenados de la ficha</span></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-xs text-gray-500 block mb-0.5">Manifiesto</label><input className={INP} value={inspForm.manifiesto} onChange={(e) => updInsp("manifiesto", e.target.value)} placeholder="No." /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Fecha</label><input className={INP} value={inspForm.fecha} onChange={(e) => updInsp("fecha", e.target.value)} /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Destino</label><input className={INP} value={inspForm.destino} onChange={(e) => updInsp("destino", e.target.value)} /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Compañía de transporte</label><input className={INP} value={inspForm.companiaTransporte} onChange={(e) => updInsp("companiaTransporte", e.target.value)} /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Nombre del chofer / operador</label><input className={INP} value={inspForm.nombreChofer} onChange={(e) => updInsp("nombreChofer", e.target.value)} /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Placas del termo</label><input className={INP} value={inspForm.placasTermo} onChange={(e) => updInsp("placasTermo", e.target.value)} /></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">No. Económico</label><input className={INP} value={inspForm.noEconomico} onChange={(e) => updInsp("noEconomico", e.target.value)} /></div>
                </div>
              </div>

              {inspTab === "precarga" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-gray-500 block mb-0.5">Hora de llegada al empaque</label><input type="time" className={INP} value={inspForm.horaLlegada} onChange={(e) => updInsp("horaLlegada", e.target.value)} /></div>
                    <div><label className="text-xs text-gray-500 block mb-0.5">Temp. de llegada (°F)</label><input type="number" className={INP} value={inspForm.tempLlegada} onChange={(e) => updInsp("tempLlegada", e.target.value)} /></div>
                    <div><label className="text-xs text-gray-500 block mb-0.5">Hora en que se abrió la puerta</label><input type="time" className={INP} value={inspForm.horaAbrioPuerta} onChange={(e) => updInsp("horaAbrioPuerta", e.target.value)} /></div>
                    <div><label className="text-xs text-gray-500 block mb-0.5">Temp. al abrir la puerta (°F)</label><input type="number" className={INP} value={inspForm.tempAbrioPuerta} onChange={(e) => updInsp("tempAbrioPuerta", e.target.value)} /></div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-2">Marque cualquier área con problemas y repórtela al supervisor <b>ANTES</b> de cargar.</div>
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {PRECARGA_PREGUNTAS.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                          <span className="w-5 text-xs text-gray-400 font-medium">{p.num}</span>
                          <span className="flex-1 text-xs text-gray-700">{p.label}</span>
                          {sino(inspForm.respuestas[p.id], (v) => updRespuesta(p.id, v), p.malo)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-gray-500 block mb-0.5">12. Temp. del producto (°F)</label><input type="number" className={INP} value={inspForm.tempProducto} onChange={(e) => updInsp("tempProducto", e.target.value)} /></div>
                    <div><label className="text-xs text-gray-500 block mb-0.5">12. Temp. del termo al cargar (°F)</label><input type="number" className={INP} value={inspForm.tempTermoCargar} onChange={(e) => updInsp("tempTermoCargar", e.target.value)} /></div>
                    <div><label className="text-xs text-gray-500 block mb-0.5">13. ¿Se sanitizó la caja?</label><input className={INP} value={inspForm.sanitizoCaja} onChange={(e) => updInsp("sanitizoCaja", e.target.value)} placeholder="Sí / No" /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-xs text-gray-500 block mb-0.5">Sanitizante</label><input className={INP} value={inspForm.sanitizante} onChange={(e) => updInsp("sanitizante", e.target.value)} /></div>
                      <div><label className="text-xs text-gray-500 block mb-0.5">Concentración</label><input className={INP} value={inspForm.concentracion} onChange={(e) => updInsp("concentracion", e.target.value)} /></div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">1. ¿Cuáles han sido sus cargas anteriores?</label>
                    <input className={INP} value={inspForm.cargasAnteriores} onChange={(e) => updInsp("cargasAnteriores", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-700 font-medium">2. ¿Tiene conocimiento sobre alérgenos?</label>
                    {sino(inspForm.conoceAlergenos, (v) => updInsp("conoceAlergenos", v))}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Principales alérgenos en México · ¿dentro de las operaciones?</div>
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {ALERGENOS_MX.map((a) => (
                        <div key={a} className="flex items-center gap-2 px-3 py-1.5">
                          <span className="flex-1 text-xs text-gray-700">{a}</span>
                          {sino(inspForm.alergenos[a] === "Sí" ? "si" : "no", (v) => updAlergeno(a, v === "si" ? "Sí" : "No"))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <b>Consecuencias:</b> tras ingerir un alérgeno, una persona alérgica puede sufrir anafilaxis (riesgo vital), urticaria, hormigueo, comezón, inflamaciones, vómitos, diarrea y dificultad para respirar.
                    <div className="mt-2"><b>Medidas preventivas:</b> no abrir la caja · no introducir alérgenos ni productos ajenos a la carga (aceites, detergentes, químicos) · reportar cualquier anomalía en el trayecto.</div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500 block mb-0.5">Aprobado para cargar por</label><input className={INP} value={inspForm.aprobadoPor} onChange={(e) => updInsp("aprobadoPor", e.target.value)} placeholder="Nombre del supervisor" /></div>
                <div><label className="text-xs text-gray-500 block mb-0.5">Firma del operador</label><input className={INP + " bg-gray-50"} value={inspForm.nombreChofer} readOnly /></div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-between items-center sticky bottom-0 bg-white">
              <button onClick={() => generarPrecargaPDF(inspForm)} className="inline-flex items-center gap-1 text-xs px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700"><FileText size={14} /> Descargar PDF</button>
              <div className="flex gap-2">
                <button onClick={cerrarInsp} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
                <button onClick={guardarInsp} className="inline-flex items-center gap-1 text-xs px-4 py-2 bg-cyan-600 text-white rounded-lg font-semibold hover:bg-cyan-700"><Save size={14} /> Guardar inspección</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal catálogo de líneas */}
      {catLineas && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900">Catálogo de líneas de transporte</div>
                <div className="text-xs text-gray-500 mt-0.5">Los choferes y unidades se editan en "Choferes y unidades"</div>
              </div>
              <button onClick={() => setCatLineas(false)} className="inline-flex items-center justify-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 font-medium">Línea</th>
                    <th className="text-left py-2 font-medium">Contacto</th>
                    <th className="text-left py-2 font-medium">Número</th>
                    <th className="text-center py-2 font-medium">Choferes / Unidades</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50">
                      <td className="py-1.5 pr-2"><input value={l.linea} onChange={(e) => updLinea(l.id, "linea", e.target.value)} className={INP_TBL} /></td>
                      <td className="py-1.5 pr-2"><input value={l.contacto} onChange={(e) => updLinea(l.id, "contacto", e.target.value)} className={INP_TBL} /></td>
                      <td className="py-1.5 pr-2"><input value={l.numero} onChange={(e) => updLinea(l.id, "numero", e.target.value)} className={INP_TBL} /></td>
                      <td className="py-1.5 text-center text-xs text-gray-500"><span className="inline-flex items-center gap-1"><User size={14} /> {(l.choferes || []).length} · <Truck size={14} /> {(l.tractos || []).length} · <Package size={14} /> {(l.cajas || []).length}</span></td>
                      <td className="py-1.5 text-center"><button onClick={() => delLinea(l.id)} className="inline-flex items-center justify-center text-gray-300 hover:text-red-500"><X size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addLinea} className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium"><Plus size={14} /> Agregar línea</button>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatLineas(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal catálogo de choferes y unidades */}
      {catChoferes && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900">Choferes y unidades</div>
                <div className="text-xs text-gray-500 mt-0.5">Cada registro pertenece a una línea de transporte (cámbiala con el selector)</div>
              </div>
              <button onClick={() => setCatChoferes(false)} className="inline-flex items-center justify-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-6">
              {/* Choferes */}
              <div>
                <div className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 mb-2"><User size={16} /> Choferes</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left py-2 font-medium w-48">Línea</th>
                      <th className="text-left py-2 font-medium">Nombre</th>
                      <th className="text-left py-2 font-medium">Teléfono</th>
                      <th className="text-left py-2 font-medium">Licencia</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {aplanar("choferes").length === 0 ? (
                      <tr><td colSpan={5} className="text-xs text-gray-400 italic py-3 text-center">Sin choferes registrados</td></tr>
                    ) : aplanar("choferes").map((c) => (
                      <tr key={c.id} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2">
                          <SearchSelect value={c.lineaId} onChange={(v) => moverSub("choferes", c.lineaId, c.id, v)} className={INP_TBL}
                            options={lineas.map((l) => ({ value: l.id, label: l.linea }))} />
                        </td>
                        <td className="py-1.5 pr-2"><input value={c.nombre} onChange={(e) => updSub("choferes", c.lineaId, c.id, "nombre", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 pr-2"><input value={c.telefono} onChange={(e) => updSub("choferes", c.lineaId, c.id, "telefono", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 pr-2"><input value={c.licencia} onChange={(e) => updSub("choferes", c.lineaId, c.id, "licencia", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 text-center"><button onClick={() => delSub("choferes", c.lineaId, c.id)} className="inline-flex items-center justify-center text-gray-300 hover:text-red-500"><X size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addSub("choferes")} className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium"><Plus size={14} /> Agregar chofer</button>
              </div>

              {/* Tractos: marca/modelo + placa */}
              <div>
                <div className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 mb-2"><Truck size={16} /> Tractos</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left py-2 font-medium w-48">Línea</th>
                      <th className="text-left py-2 font-medium">Marca y modelo</th>
                      <th className="text-left py-2 font-medium">Placa tracto</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {aplanar("tractos").length === 0 ? (
                      <tr><td colSpan={4} className="text-xs text-gray-400 italic py-3 text-center">Sin tractos registrados</td></tr>
                    ) : aplanar("tractos").map((t) => (
                      <tr key={t.id} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2">
                          <SearchSelect value={t.lineaId} onChange={(v) => moverSub("tractos", t.lineaId, t.id, v)} className={INP_TBL}
                            options={lineas.map((l) => ({ value: l.id, label: l.linea }))} />
                        </td>
                        <td className="py-1.5 pr-2"><input value={t.marcaModelo || ""} onChange={(e) => updSub("tractos", t.lineaId, t.id, "marcaModelo", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 pr-2"><input value={t.placa} onChange={(e) => updSub("tractos", t.lineaId, t.id, "placa", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 text-center"><button onClick={() => delSub("tractos", t.lineaId, t.id)} className="inline-flex items-center justify-center text-gray-300 hover:text-red-500"><X size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addSub("tractos")} className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium"><Plus size={14} /> Agregar tracto</button>
              </div>

              {/* Cajas: económico + placa */}
              <div>
                <div className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 mb-2"><Package size={16} /> Cajas</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left py-2 font-medium w-48">Línea</th>
                      <th className="text-left py-2 font-medium">Económico</th>
                      <th className="text-left py-2 font-medium">Placa caja</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {aplanar("cajas").length === 0 ? (
                      <tr><td colSpan={4} className="text-xs text-gray-400 italic py-3 text-center">Sin cajas registradas</td></tr>
                    ) : aplanar("cajas").map((c) => (
                      <tr key={c.id} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2">
                          <SearchSelect value={c.lineaId} onChange={(v) => moverSub("cajas", c.lineaId, c.id, v)} className={INP_TBL}
                            options={lineas.map((l) => ({ value: l.id, label: l.linea }))} />
                        </td>
                        <td className="py-1.5 pr-2"><input value={c.economico} onChange={(e) => updSub("cajas", c.lineaId, c.id, "economico", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 pr-2"><input value={c.placa} onChange={(e) => updSub("cajas", c.lineaId, c.id, "placa", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 text-center"><button onClick={() => delSub("cajas", c.lineaId, c.id)} className="inline-flex items-center justify-center text-gray-300 hover:text-red-500"><X size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addSub("cajas")} className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium"><Plus size={14} /> Agregar caja</button>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatChoferes(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: historial de cambios del requerimiento (auditoría, desde la bitácora) */}
      {verHistorial && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <div className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900"><Calendar size={16} /> Historial de cambios del requerimiento</div>
                <div className="text-xs text-gray-500 mt-0.5">Semana {etiquetaSemana(semana)} · cada envío de Kiko queda guardado (auditoría)</div>
              </div>
              <button onClick={() => setVerHistorial(false)} className="inline-flex items-center justify-center text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {histReq.length === 0 ? (
                <div className="text-xs text-gray-400 italic text-center py-6">Sin envíos registrados para esta semana.</div>
              ) : histReq.map((e, idx) => {
                const c = e.meta?.cambios;
                const esUltimo = idx === 0;
                return (
                  <div key={e.id} className={`border rounded-xl p-3 ${esUltimo ? "border-blue-300 bg-blue-50/40" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold text-gray-800">{e.actor || "Kiko"} · {e.tsLocal}{esUltimo && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">actual</span>}</div>
                      <div className="text-xs text-gray-500">{e.meta?.trailers ?? "—"} trailer(s) · {e.meta?.lineas ?? "—"} línea(s)</div>
                    </div>
                    {c ? (
                      c.items?.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.items.map((it) => {
                            const d = it.ahora - it.antes;
                            return <span key={it.dest} className="text-[11px] bg-white border border-gray-200 rounded px-1.5 py-0.5">{it.dest}: {it.antes}→{it.ahora} <span className={d > 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>({d > 0 ? "+" : ""}{d})</span></span>;
                          })}
                        </div>
                      ) : <div className="text-[11px] text-gray-500 mt-1">Se ajustaron detalles (fechas/tipo) sin cambiar totales por destino.</div>
                    ) : (
                      <div className="text-[11px] text-gray-500 mt-1">Envío inicial del requerimiento.</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end sticky bottom-0 bg-white">
              <button onClick={() => setVerHistorial(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}