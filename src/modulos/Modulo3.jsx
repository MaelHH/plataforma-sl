import { useState } from "react";
import { useDatos, ORIGEN, ORIGENES, DESTINOS_ALL, DC, STATUS_CFG, EMPTY_TRAILER, calcularDias, etiquetaSemana, moverSemana } from "../store/datos";

let nextId = 100;
let nextLineaId = 1;
let nextSubId = 1;

function lunesActual() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  hoy.setDate(hoy.getDate() + diff);
  return hoy.toISOString().slice(0, 10);
}

export default function Modulo3() {
  const { trailers, setTrailers, requerimientoGen, lineas, setLineas } = useDatos();
  const [semana, setSemana] = useState(lunesActual());
  const dias = calcularDias(semana);
  const [diaFil, setDiaFil] = useState(dias[0]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [catLineas, setCatLineas] = useState(false);
  const [catChoferes, setCatChoferes] = useState(false);
  const [lineaNueva, setLineaNueva] = useState(false);
  const [choferNuevo, setChoferNuevo] = useState(false);
  const [tractoNuevo, setTractoNuevo] = useState(false);
  const [cajaNueva, setCajaNueva] = useState(false);

  const reqSemana = requerimientoGen[semana] || [];

  const hoy = trailers.filter((t) => t.fecha === diaFil);
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

  const resetModos = () => { setLineaNueva(false); setChoferNuevo(false); setTractoNuevo(false); setCajaNueva(false); };

  const addTrailer = () => {
    const t = { ...EMPTY_TRAILER, id: nextId++, fecha: diaFil, origen: ORIGEN, dest: "Sin asignar", status: "esperando" };
    setTrailers((prev) => [...prev, t]);
    setForm({ ...t });
    resetModos();
    setModal(t.id);
  };
  const openModal = (t) => { setForm({ ...t }); resetModos(); setModal(t.id); };
  const delTrailer = (id) => {
    if (window.confirm("¿Eliminar este trailer? Esta acción no se puede deshacer.")) {
      setTrailers((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const lineaSel = lineas.find((l) => l.linea === form.linea);

  const saveForm = () => {
    let lineasActualizadas = lineas;

    if (lineaNueva && (form.linea || "").trim()) {
      const existe = lineas.some((l) => l.linea.toLowerCase() === form.linea.trim().toLowerCase());
      if (!existe) {
        const nueva = { id: "LN_" + nextLineaId++, linea: form.linea.trim(), contacto: form.contacto || "", numero: form.numero || "", choferes: [], tractos: [], cajas: [] };
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
        if (!existe) L.choferes.push({ id: "CH_" + nextSubId++, nombre: form.chofer.trim(), telefono: form.telefono || "", licencia: form.licencia || "" });
      }
      if (tractoNuevo && (form.placaTracto || "").trim()) {
        const existe = L.tractos.some((t) => t.placa.toLowerCase() === form.placaTracto.trim().toLowerCase());
        if (!existe) L.tractos.push({ id: "TR_" + nextSubId++, marcaModelo: form.marcaModelo || "", placa: form.placaTracto.trim() });
      }
      if (cajaNueva && (form.placaCaja || "").trim()) {
        const existe = L.cajas.some((c) => c.placa.toLowerCase() === form.placaCaja.trim().toLowerCase());
        if (!existe) L.cajas.push({ id: "CJ_" + nextSubId++, economico: form.economicoCaja || "", placa: form.placaCaja.trim() });
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
  const addLinea = () => setLineas((prev) => [...prev, { id: "LN_" + nextLineaId++, linea: "Nueva línea", contacto: "", numero: "", choferes: [], tractos: [], cajas: [] }]);
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
    const nuevo = tipo === "choferes" ? { id: "CH_" + nextSubId++, nombre: "Nuevo chofer", telefono: "", licencia: "" }
      : tipo === "tractos" ? { id: "TR_" + nextSubId++, marcaModelo: "Marca/Modelo", placa: "Placa" }
      : { id: "CJ_" + nextSubId++, economico: "Económico", placa: "Placa" };
    setLineas((prev) => prev.map((l) => l.id === lineaId ? { ...l, [tipo]: [...(l[tipo] || []), nuevo] } : l));
  };

  const aplanar = (tipo) => lineas.flatMap((l) => (l[tipo] || []).map((s) => ({ ...s, lineaId: l.id, lineaNombre: l.linea })));

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const INP_TBL = "w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none";

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
              <select value={t.dest || "Sin asignar"} onChange={(e) => setDest(t.id, e.target.value)}
                className={`text-xs font-medium px-1.5 py-0.5 rounded-full border cursor-pointer ${dc}`}>
                {DESTINOS_ALL.map((d) => <option key={d}>{d}</option>)}
              </select>
            ) : (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${dc}`}>{t.dest}</span>
            )}
          </div>
        </div>
        {has ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mb-2 text-xs">
            {t.linea && <div className="truncate font-medium text-gray-800">{t.linea}</div>}
            {t.chofer && <div className="truncate">🧑 {t.chofer}</div>}
            {t.placaTracto && <div>🚛 {t.placaTracto}</div>}
            {t.flete && <div>💵 <span className="font-semibold text-green-700">${t.flete}</span></div>}
          </div>
        ) : (
          <div className="text-xs text-gray-400 mb-2 italic">Sin datos — edita la ficha</div>
        )}
        <div className="flex gap-1 flex-wrap items-center">
          <button onClick={() => openModal(t)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600">✏️ Editar</button>
          <button onClick={() => delTrailer(t.id)} className="text-xs px-2 py-1 border border-red-200 rounded-lg bg-white hover:bg-red-50 text-red-500">🗑️</button>
          {t.status === "en_ruta" ? (
            <span className="text-xs px-2 py-1 bg-green-100 border border-green-300 text-green-700 rounded-lg font-semibold">🚛 En ruta</span>
          ) : (
            <select value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}
              className={`text-xs px-2 py-1 rounded-lg border font-medium ${t.status === "en_instalaciones" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-600"}`}>
              <option value="esperando">⏳ Esperando</option>
              <option value="en_instalaciones">📍 En instalaciones</option>
            </select>
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
          <button onClick={() => setCatChoferes(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
            👤 Choferes y unidades
          </button>
          <button onClick={() => setCatLineas(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
            ⚙️ Catálogo de líneas
          </button>
          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">MO</div>
          <span className="text-sm font-medium text-gray-700">Mónica</span>
        </div>
      </div>

      {/* Selector de semana */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex items-center justify-between">
        <button onClick={() => setSemana(moverSemana(semana, -1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600">◀ Anterior</button>
        <div className="text-center">
          <div className="text-xs text-gray-400">Semana</div>
          <div className="text-sm font-semibold text-gray-900">{etiquetaSemana(semana)}</div>
        </div>
        <button onClick={() => setSemana(moverSemana(semana, 1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600">Siguiente ▶</button>
      </div>

      {/* RESUMEN EJECUTIVO */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold text-gray-900">📋 Resumen de la semana — qué conseguir</div>
            <div className="text-xs text-gray-500 mt-0.5">Requerimiento total enviado desde Cálculo de Trailers</div>
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
                  {r.contrato > 0 && <span>📄 {r.contrato} contrato</span>}
                  {r.abierto > 0 && <span className="text-purple-600">🔓 {r.abierto} abierto</span>}
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
          <button onClick={addTrailer} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700">+ Registrar trailer</button>
        </div>
        {hoy.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-6 italic">Ningún trailer registrado este día</div>
        ) : (
          <div className="p-3 grid grid-cols-2 gap-2">{hoy.map((t) => <MiniCard key={t.id} t={t} showDestSel={true} />)}</div>
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
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Ruta</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500 block mb-0.5">Origen</label>
                    <select className={INP} value={form.origen || ORIGEN} onChange={(e) => setForm((f) => ({ ...f, origen: e.target.value }))}>
                      {ORIGENES.map((o) => <option key={o}>{o}</option>)}
                    </select></div>
                  <div><label className="text-xs text-gray-500 block mb-0.5">Destino</label>
                    <select className={INP} value={form.dest || "Sin asignar"} onChange={(e) => setForm((f) => ({ ...f, dest: e.target.value }))}>
                      {DESTINOS_ALL.map((d) => <option key={d}>{d}</option>)}
                    </select></div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Línea de transporte</div>
                <div className="mb-2">
                  <label className="text-xs text-gray-500 block mb-0.5">Elegir del catálogo</label>
                  <select className={INP} value={lineaActualId} onChange={(e) => elegirLinea(e.target.value)}>
                    <option value="">— Selecciona una línea —</option>
                    {lineas.map((l) => <option key={l.id} value={l.id}>{l.linea}</option>)}
                    <option value="__nueva__">➕ Nueva línea de transporte</option>
                  </select>
                </div>
                {lineaNueva && (
                  <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-2">
                    ✏️ Capturando línea nueva — se guardará en el catálogo al guardar la ficha
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
                      <select className={INP} value={choferActualId} onChange={(e) => elegirChofer(e.target.value)}>
                        <option value="">— Selecciona chofer —</option>
                        {(lineaSel?.choferes || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        <option value="__nuevo__">➕ Nuevo chofer</option>
                      </select>
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
                      <select className={INP} value={tractoActualId} onChange={(e) => elegirTracto(e.target.value)}>
                        <option value="">— Selecciona tracto —</option>
                        {(lineaSel?.tractos || []).map((t) => <option key={t.id} value={t.id}>{t.marcaModelo} · {t.placa}</option>)}
                        <option value="__nuevo__">➕ Nuevo tracto</option>
                      </select>
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
                      <select className={INP} value={cajaActualId} onChange={(e) => elegirCaja(e.target.value)}>
                        <option value="">— Selecciona caja —</option>
                        {(lineaSel?.cajas || []).map((c) => <option key={c.id} value={c.id}>{c.economico} · {c.placa}</option>)}
                        <option value="__nueva__">➕ Nueva caja</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <input className={INP + (cajaNueva ? "" : " bg-gray-50")} value={form.economicoCaja || ""} readOnly={!cajaNueva} placeholder="Económico"
                          onChange={(e) => setForm((f) => ({ ...f, economicoCaja: e.target.value }))} />
                        <input className={INP + (cajaNueva ? "" : " bg-gray-50")} value={form.placaCaja || ""} readOnly={!cajaNueva} placeholder="Placa caja"
                          onChange={(e) => setForm((f) => ({ ...f, placaCaja: e.target.value }))} />
                      </div>
                    </div>

                    {(choferNuevo || tractoNuevo || cajaNueva) && (
                      <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                        ✏️ Los datos nuevos se guardarán en el catálogo de {form.linea} al guardar la ficha
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

      {/* Modal catálogo de líneas */}
      {catLineas && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-sm font-semibold text-gray-900">Catálogo de líneas de transporte</div>
                <div className="text-xs text-gray-500 mt-0.5">Los choferes y unidades se editan en "Choferes y unidades"</div>
              </div>
              <button onClick={() => setCatLineas(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
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
                      <td className="py-1.5 text-center text-xs text-gray-500">🧑 {(l.choferes || []).length} · 🚛 {(l.tractos || []).length} · 📦 {(l.cajas || []).length}</td>
                      <td className="py-1.5 text-center"><button onClick={() => delLinea(l.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addLinea} className="mt-3 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar línea</button>
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
              <button onClick={() => setCatChoferes(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-6">
              {/* Choferes */}
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2">🧑 Choferes</div>
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
                          <select value={c.lineaId} onChange={(e) => moverSub("choferes", c.lineaId, c.id, e.target.value)} className={INP_TBL}>
                            {lineas.map((l) => <option key={l.id} value={l.id}>{l.linea}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2"><input value={c.nombre} onChange={(e) => updSub("choferes", c.lineaId, c.id, "nombre", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 pr-2"><input value={c.telefono} onChange={(e) => updSub("choferes", c.lineaId, c.id, "telefono", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 pr-2"><input value={c.licencia} onChange={(e) => updSub("choferes", c.lineaId, c.id, "licencia", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 text-center"><button onClick={() => delSub("choferes", c.lineaId, c.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addSub("choferes")} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar chofer</button>
              </div>

              {/* Tractos: marca/modelo + placa */}
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2">🚛 Tractos</div>
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
                          <select value={t.lineaId} onChange={(e) => moverSub("tractos", t.lineaId, t.id, e.target.value)} className={INP_TBL}>
                            {lineas.map((l) => <option key={l.id} value={l.id}>{l.linea}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2"><input value={t.marcaModelo || ""} onChange={(e) => updSub("tractos", t.lineaId, t.id, "marcaModelo", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 pr-2"><input value={t.placa} onChange={(e) => updSub("tractos", t.lineaId, t.id, "placa", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 text-center"><button onClick={() => delSub("tractos", t.lineaId, t.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addSub("tractos")} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar tracto</button>
              </div>

              {/* Cajas: económico + placa */}
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2">📦 Cajas</div>
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
                          <select value={c.lineaId} onChange={(e) => moverSub("cajas", c.lineaId, c.id, e.target.value)} className={INP_TBL}>
                            {lineas.map((l) => <option key={l.id} value={l.id}>{l.linea}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2"><input value={c.economico} onChange={(e) => updSub("cajas", c.lineaId, c.id, "economico", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 pr-2"><input value={c.placa} onChange={(e) => updSub("cajas", c.lineaId, c.id, "placa", e.target.value)} className={INP_TBL} /></td>
                        <td className="py-1.5 text-center"><button onClick={() => delSub("cajas", c.lineaId, c.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addSub("cajas")} className="mt-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar caja</button>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setCatChoferes(false)} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}