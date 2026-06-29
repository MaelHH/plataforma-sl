import { useState } from "react";
import { useDatos, DC, EMPRESAS } from "../store/datos";
import SearchSelect from "../components/SearchSelect";
import MapaTive from "../components/MapaTive";
import { FileText, Check, Camera, Search, Route, Package, Snowflake, Satellite, TriangleAlert, ShieldCheck, AlertTriangle, Truck, RotateCcw } from "lucide-react";

const EVENTOS = [
  { id: "preenfriado", label: "Preenfriado", Icon: Snowflake, color: "blue" },
  { id: "tive", label: "Evidencia de TIVE", Icon: Satellite, color: "blue" },
  { id: "retenes", label: "Evidencia de Retenes", Icon: TriangleAlert, color: "amber" },
  { id: "aduanas", label: "Aduanas y Descargas", Icon: ShieldCheck, color: "purple" },
  { id: "accidente", label: "Evidencia de Accidente", Icon: AlertTriangle, color: "red" },
];

const COLOR_MAP = {
  blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
};

const empBadge = { SL_AGR: "bg-green-100 text-green-800", CAT: "bg-blue-100 text-blue-800", CACO: "bg-purple-100 text-purple-800" };

export default function Modulo7() {
  const { trailers, setTrailers, monitoreo, setMonitoreo, responsables, setResponsables, cargasEmbarques } = useDatos();
  const [tab, setTab] = useState("ruta");
  const [expandido, setExpandido] = useState(null);
  const [activePhoto, setActivePhoto] = useState(null);

  const [fDest, setFDest] = useState("");
  const [fOrigen, setFOrigen] = useState("");
  const [fLinea, setFLinea] = useState("");
  const [fChofer, setFChofer] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fFecha, setFFecha] = useState("");

  const cargaDeTrailer = (tId) => cargasEmbarques.find((c) => c.trailer?.id === tId);
  const empresasDeTrailer = (tId) => {
    const carga = cargaDeTrailer(tId);
    if (!carga) return [];
    return carga.consolidado ? carga.empresasSel : (carga.empresasSel?.slice(0, 1) || []);
  };
  const manifiestosDeTrailer = (tId) => {
    const carga = cargaDeTrailer(tId);
    if (!carga) return [];
    let emps = carga.consolidado ? carga.empresasSel : (carga.empresasSel?.slice(0, 1) || []);
    if (fEmpresa) emps = emps.filter((eid) => eid === fEmpresa);
    return emps.map((eid) => ({
      empresa: EMPRESAS.find((e) => e.id === eid)?.label || eid,
      eid,
      folio: carga.manifiestos?.[eid] || "",
    }));
  };

  const aplicarFiltros = (lista) => lista.filter((t) => {
    if (fDest && t.dest !== fDest) return false;
    if (fOrigen && t.origen !== fOrigen) return false;
    if (fLinea && !(t.linea || "").toLowerCase().includes(fLinea.toLowerCase())) return false;
    if (fChofer && !(t.chofer || "").toLowerCase().includes(fChofer.toLowerCase())) return false;
    if (fFecha && t.fecha !== fFecha) return false;
    if (fEmpresa && !empresasDeTrailer(t.id).includes(fEmpresa)) return false;
    return true;
  });

  const enRutaAll = trailers.filter((t) => t.status === "en_ruta");
  const entregadosAll = trailers.filter((t) => t.status === "entregado");
  const enRuta = aplicarFiltros(enRutaAll);
  const entregados = aplicarFiltros(entregadosAll);

  const baseList = [...enRutaAll, ...entregadosAll];
  const opcDest = [...new Set(baseList.map((t) => t.dest).filter(Boolean))];
  const opcOrigen = [...new Set(baseList.map((t) => t.origen).filter(Boolean))];
  const opcFecha = [...new Set(baseList.map((t) => t.fecha).filter(Boolean))];

  const hayFiltros = fDest || fOrigen || fLinea || fChofer || fEmpresa || fFecha;
  const limpiarFiltros = () => { setFDest(""); setFOrigen(""); setFLinea(""); setFChofer(""); setFEmpresa(""); setFFecha(""); };

  const getEvento = (tId, eId) => {
    const def = eId === "preenfriado"
      ? { hubo: null, responsable: "", horaEntrada: "", horaSalida: "", tempPrevia: Array(30).fill(""), tempFinal: Array(30).fill(""), fotos: Array(8).fill(null) }
      : { hubo: null, responsable: "", fotos: [null, null, null, null] };
    return monitoreo[tId]?.[eId] || def;
  };

  const setHubo = (tId, eId, hubo) => {
    setMonitoreo((prev) => {
      const ev = prev[tId]?.[eId] || {};
      const numFotos = eId === "preenfriado" ? 8 : 4;
      const fotos = ev.fotos || Array(numFotos).fill(null);
      const base = eId === "preenfriado"
        ? {
            responsable: ev.responsable || "", horaEntrada: ev.horaEntrada || "", horaSalida: ev.horaSalida || "",
            tempPrevia: ev.tempPrevia || Array(30).fill(""), tempFinal: ev.tempFinal || Array(30).fill(""), fotos,
          }
        : { responsable: ev.responsable || "", fotos };
      return { ...prev, [tId]: { ...prev[tId], [eId]: { ...base, hubo } } };
    });
  };

  const setCampo = (tId, eId, campo, val) => {
    setMonitoreo((prev) => {
      const numFotos = eId === "preenfriado" ? 8 : 4;
      const ev = prev[tId]?.[eId] || { hubo: true, fotos: Array(numFotos).fill(null) };
      return { ...prev, [tId]: { ...prev[tId], [eId]: { ...ev, [campo]: val } } };
    });
  };

  const setTemp = (tId, tipo, idx, val) => {
    setMonitoreo((prev) => {
      const ev = prev[tId]?.preenfriado || { hubo: true, tempPrevia: Array(30).fill(""), tempFinal: Array(30).fill(""), fotos: Array(8).fill(null) };
      const arr = [...(ev[tipo] || Array(30).fill(""))];
      arr[idx] = val;
      return { ...prev, [tId]: { ...prev[tId], preenfriado: { ...ev, [tipo]: arr } } };
    });
  };

  const registrarResponsable = (nombre) => {
    const limpio = nombre.trim();
    if (limpio && !responsables.includes(limpio)) {
      setResponsables((prev) => [...prev, limpio]);
    }
  };

  const confirmPhoto = () => {
    if (!activePhoto) return;
    const { trailerId, eventoId, slot } = activePhoto;
    setMonitoreo((prev) => {
      const numFotos = eventoId === "preenfriado" ? 8 : 4;
      const ev = prev[trailerId]?.[eventoId] || { hubo: true, fotos: Array(numFotos).fill(null) };
      const fotos = [...(ev.fotos || Array(numFotos).fill(null))];
      fotos[slot] = "photo";
      return { ...prev, [trailerId]: { ...prev[trailerId], [eventoId]: { ...ev, fotos } } };
    });
    setActivePhoto(null);
  };

  const marcarEntregado = (tId) => setTrailers((prev) => prev.map((t) => (t.id === tId ? { ...t, status: "entregado" } : t)));
  const reactivar = (tId) => setTrailers((prev) => prev.map((t) => (t.id === tId ? { ...t, status: "en_ruta" } : t)));

  function TempGrid({ titulo, tipo, valores, tId }) {
    const llenas = valores.filter((v) => v !== "" && v != null).length;
    return (
      <div className="bg-white border-2 border-blue-200 rounded-xl overflow-hidden mb-3">
        <div className="px-3 py-2 border-b border-blue-200 bg-blue-50 flex items-center justify-between">
          <span className="text-xs font-bold text-blue-700">{titulo}</span>
          <span className="text-xs font-semibold text-blue-700">{llenas}/30</span>
        </div>
        <div className="p-2 overflow-x-auto">
          <div style={{ minWidth: "640px" }}>
            <div className="grid gap-1 mb-0.5" style={{ gridTemplateColumns: "repeat(15,minmax(0,1fr))" }}>
              {Array.from({ length: 15 }, (_, i) => <div key={i} className={`text-center text-xs font-medium ${i === 0 ? "text-blue-600" : "text-gray-400"}`}>{i * 2 + 1}{i === 0 ? <Truck size={12} className="inline" /> : ""}</div>)}
            </div>
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: "repeat(15,minmax(0,1fr))" }}>
              {Array.from({ length: 15 }, (_, i) => (
                <input key={i} type="number" step="0.1" value={valores[i] || ""} onChange={(e) => setTemp(tId, tipo, i, e.target.value)} placeholder="°F"
                  className="h-9 text-xs text-center px-0.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400" />
              ))}
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(15,minmax(0,1fr))" }}>
              {Array.from({ length: 15 }, (_, i) => (
                <input key={i} type="number" step="0.1" value={valores[i + 15] || ""} onChange={(e) => setTemp(tId, tipo, i + 15, e.target.value)} placeholder="°F"
                  className="h-9 text-xs text-center px-0.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400" />
              ))}
            </div>
            <div className="grid gap-1 mt-0.5" style={{ gridTemplateColumns: "repeat(15,minmax(0,1fr))" }}>
              {Array.from({ length: 15 }, (_, i) => <div key={i} className={`text-center text-xs font-medium ${i === 0 ? "text-blue-600" : "text-gray-400"}`}>{i * 2 + 2}{i === 0 ? <Truck size={12} className="inline" /> : ""}</div>)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function TrailerCard({ t, esHistorial }) {
    const isOpen = expandido === t.id;
    const eventos = monitoreo[t.id] || {};
    const conEvidencia = Object.values(eventos).filter((e) => e.hubo === true).length;
    const manifiestos = manifiestosDeTrailer(t.id);

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-3">
        <div className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpandido(isOpen ? null : t.id)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
              <div>
                <div className="text-base font-semibold text-gray-900">{t.linea || "Sin línea de flete"}</div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${DC[t.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{t.dest}</span>
                  <span className="text-xs text-gray-500">{t.chofer || "Sin chofer"}</span>
                  {t.placaTracto && <span className="text-xs font-mono text-gray-400">{t.placaTracto}</span>}
                  {manifiestos.map((m) => (
                    <span key={m.eid} className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      <FileText size={14} /> {m.folio || <span className="text-amber-600 italic">s/folio</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {conEvidencia > 0 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{conEvidencia} evento{conEvidencia > 1 ? "s" : ""}</span>}
              {!esHistorial ? (
                <button onClick={() => marcarEntregado(t.id)} className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700"><Check size={14} /> Llegó a destino</button>
              ) : (
                <button onClick={() => reactivar(t.id)} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100"><span className="inline-flex items-center gap-1"><RotateCcw size={13} /> Regresar a ruta</span></button>
              )}
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-gray-100 p-3 space-y-2">
            {manifiestos.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <div className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase mb-2"><FileText size={14} /> Manifiestos{fEmpresa ? " (filtrado)" : ""}</div>
                <div className="space-y-1">
                  {manifiestos.map((m) => (
                    <div key={m.eid} className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${empBadge[m.eid] || "bg-gray-100 text-gray-700"}`}>{m.empresa}</span>
                      <span className="text-xs font-mono text-gray-700">{m.folio || <span className="text-amber-600 italic">sin folio capturado</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {EVENTOS.map((ev) => {
              const c = COLOR_MAP[ev.color];
              const estado = getEvento(t.id, ev.id);
              const llenas = (estado.fotos || []).filter(Boolean).length;
              const numFotos = ev.id === "preenfriado" ? 8 : 4;
              return (
                <div key={ev.id} className={`border-2 rounded-xl p-3 ${estado.hubo === true ? c.border + " " + c.bg : "border-gray-200 bg-white"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-lg ${c.text}`}><ev.Icon size={14} /></span>
                      <span className="text-sm font-medium text-gray-700">{ev.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 mr-1">¿Hubo?</span>
                      <button onClick={() => setHubo(t.id, ev.id, true)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium border ${estado.hubo === true ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>Sí</button>
                      <button onClick={() => setHubo(t.id, ev.id, false)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium border ${estado.hubo === false ? "bg-gray-600 text-white border-gray-600" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>No</button>
                    </div>
                  </div>

                  {estado.hubo === true && (
                    <div className="mt-3">
                      <div className="mb-3">
                        <label className="text-xs text-gray-500 block mb-1">Responsable</label>
                        <input list={`resp-${t.id}-${ev.id}`} value={estado.responsable || ""}
                          onChange={(e) => setCampo(t.id, ev.id, "responsable", e.target.value)}
                          onBlur={(e) => registrarResponsable(e.target.value)}
                          placeholder="Escribe o elige un responsable"
                          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400" />
                        <datalist id={`resp-${t.id}-${ev.id}`}>
                          {responsables.map((r) => <option key={r} value={r} />)}
                        </datalist>
                      </div>

                      {ev.id === "preenfriado" && (
                        <>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Hora de entrada</label>
                              <input type="time" value={estado.horaEntrada || ""} onChange={(e) => setCampo(t.id, ev.id, "horaEntrada", e.target.value)}
                                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Hora de salida</label>
                              <input type="time" value={estado.horaSalida || ""} onChange={(e) => setCampo(t.id, ev.id, "horaSalida", e.target.value)}
                                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400" />
                            </div>
                          </div>

                          <TempGrid titulo="Evidencia de Temperatura previa a Preenfriado" tipo="tempPrevia" valores={estado.tempPrevia || Array(30).fill("")} tId={t.id} />
                          <TempGrid titulo="Evidencia de Temperatura al finalizar Preenfriado" tipo="tempFinal" valores={estado.tempFinal || Array(30).fill("")} tId={t.id} />
                        </>
                      )}

                      <div className="text-xs text-gray-500 mb-1.5">{llenas}/{numFotos} fotos de evidencia</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(estado.fotos || Array(numFotos).fill(null)).map((f, slot) => (
                          <div key={slot} onClick={() => setActivePhoto({ trailerId: t.id, eventoId: ev.id, slot })}
                            className={`h-14 border-2 rounded-md flex items-center justify-center cursor-pointer ${f ? "border-green-400 bg-green-50" : "border-dashed border-gray-300 bg-white hover:border-gray-400"}`}>
                            {f ? <Camera size={14} className="text-green-600" /> : <span className="text-gray-300">+</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const SEL = "text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white";
  const listaActiva = tab === "ruta" ? enRuta : entregados;
  const totalActiva = tab === "ruta" ? enRutaAll.length : entregadosAll.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Monitoreo en Ruta</h1>
          <p className="text-sm text-gray-500 mt-0.5">Eventos en tránsito · preenfriado · TIVE · retenes · aduanas · accidentes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">FF</div>
          <span className="text-sm font-medium text-gray-700">Francisco / Kiko</span>
        </div>
      </div>

      <MapaTive trailers={enRutaAll} />

      <div className="flex border border-gray-200 rounded-lg overflow-hidden w-fit mb-4">
        <button onClick={() => setTab("ruta")} className={`px-4 py-1.5 text-sm ${tab === "ruta" ? "bg-gray-100 font-semibold text-gray-900" : "bg-white text-gray-500"}`}>En ruta ({enRuta.length})</button>
        <button onClick={() => setTab("historial")} className={`px-4 py-1.5 text-sm ${tab === "historial" ? "bg-gray-100 font-semibold text-gray-900" : "bg-white text-gray-500"}`}>Historial ({entregados.length})</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600"><Search size={14} /> Filtros</span>
          {hayFiltros && <button onClick={limpiarFiltros} className="text-xs text-blue-600 hover:underline">Limpiar filtros</button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <SearchSelect className={SEL} value={fFecha} onChange={(v) => setFFecha(v)}
            placeholder="Fecha: todas"
            options={opcFecha.map((f) => ({ value: f, label: f }))} />
          <SearchSelect className={SEL} value={fDest} onChange={(v) => setFDest(v)}
            placeholder="Destino: todos"
            options={opcDest.map((d) => ({ value: d, label: d }))} />
          <SearchSelect className={SEL} value={fOrigen} onChange={(v) => setFOrigen(v)}
            placeholder="Origen: todos"
            options={opcOrigen.map((o) => ({ value: o, label: o }))} />
          <SearchSelect className={SEL} value={fEmpresa} onChange={(v) => setFEmpresa(v)}
            placeholder="Empresa: todas"
            options={EMPRESAS.map((e) => ({ value: e.id, label: e.label }))} />
          <input className={SEL} value={fLinea} onChange={(e) => setFLinea(e.target.value)} placeholder="Línea..." />
          <input className={SEL} value={fChofer} onChange={(e) => setFChofer(e.target.value)} placeholder="Chofer..." />
        </div>
        {hayFiltros && (
          <div className="text-xs text-gray-400 mt-2">Mostrando {listaActiva.length} de {totalActiva}</div>
        )}
      </div>

      {tab === "ruta" && (
        enRuta.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <div className="flex justify-center mb-3"><Route size={28} className="text-gray-400" /></div>
            <div className="text-sm font-medium text-gray-700 mb-1">{hayFiltros ? "Sin resultados con estos filtros" : "Sin trailers en ruta"}</div>
            <div className="text-xs text-gray-400">{hayFiltros ? "Prueba limpiar los filtros" : "Aparecen aquí cuando Francisco los envía a Embarques"}</div>
          </div>
        ) : enRuta.map((t) => <TrailerCard key={t.id} t={t} esHistorial={false} />)
      )}

      {tab === "historial" && (
        entregados.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <div className="flex justify-center mb-3"><Package size={28} className="text-gray-400" /></div>
            <div className="text-sm font-medium text-gray-700 mb-1">{hayFiltros ? "Sin resultados con estos filtros" : "Sin entregas registradas"}</div>
            <div className="text-xs text-gray-400">{hayFiltros ? "Prueba limpiar los filtros" : "Los trailers que marques \"Llegó a destino\" aparecen aquí"}</div>
          </div>
        ) : entregados.map((t) => <TrailerCard key={t.id} t={t} esHistorial={true} />)
      )}

      {activePhoto !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="bg-gray-900 h-44 flex flex-col items-center justify-center gap-2">
              <Camera size={40} className="text-white" />
              <span className="text-gray-400 text-sm">{EVENTOS.find((e) => e.id === activePhoto.eventoId)?.label} · Foto {activePhoto.slot + 1}</span>
              <span className="text-gray-600 text-xs">Simulación — en producción abre la cámara</span>
            </div>
            <div className="px-5 py-4 flex gap-2 justify-end">
              <button onClick={() => setActivePhoto(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmPhoto} className="inline-flex items-center gap-1 text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold"><Check size={14} /> Confirmar foto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}