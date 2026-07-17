import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Megaphone, Plus, Check, RotateCcw, Trash2, Calendar, Clock, MapPin, Package, Truck, User, Loader2, AlertCircle, Sprout, FileText, Boxes } from "lucide-react";
import {
  getSolicitudesTrailer, crearSolicitudTrailer, cumplirSolicitudTrailer,
  reabrirSolicitudTrailer, borrarSolicitudTrailer,
} from "../store/api";
import { useDatos } from "../store/datos";
import SearchSelect from "../components/SearchSelect";
import ColaTabs from "../components/ColaTabs";

// Solicitud (necesidad) de trailer — la levanta el ENCARGADO DE CAMPO.
// Módulo aislado: usa su propio endpoint (/api/solicitudes-trailer), NO toca el store global
// ni otros módulos. Escalable: para un dato nuevo, se agrega un campo aquí y una columna en el
// backend. Por ahora se cierra con el botón "Ya se cumplió"; a futuro se podría autollenar.

const EMPTY = { responsable: "", fechaCorte: "", proyectoCode: "", temporada: "", rancho: "", departamento: "", tipoArticulo: "", tarasCortadas: "", cantidadTrailer: 1, horaEstimada: "", notas: "" };
const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400";

const fmtFechaHora = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};

const Stat = ({ label, valor, color }) => (
  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className={`text-2xl font-bold ${color}`}>{valor}</div>
  </div>
);

const Campo = ({ icon: Icon, label, valor }) => (
  <div className="flex items-center gap-1.5 text-xs text-gray-600 min-w-0">
    <Icon size={14} className="shrink-0 text-gray-400" />
    <span className="text-gray-400">{label}:</span>
    <span className="font-medium text-gray-800 truncate">{valor || "—"}</span>
  </div>
);

export default function Modulo14() {
  const { proyectos } = useDatos();   // catálogo SAP compartido: Temporada → Ranchos (se llena en Movimientos Campo)
  const proyectosArr = Array.isArray(proyectos) ? proyectos : [];
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState("");
  const [tab, setTab] = useState("pendientes");
  const [ocupado, setOcupado] = useState(null); // id en proceso (cumplir/reabrir/eliminar)
  const [q, setQ] = useState("");
  const [fTemporada, setFTemporada] = useState("");
  const [fRancho, setFRancho] = useState("");

  const cargar = useCallback(async () => {
    try {
      const data = await getSolicitudesTrailer();   // el await va antes del primer setState
      setLista(data);
      setError("");
    } catch (e) { setError(String(e?.message || e)); }
    finally { setCargando(false); }
  }, []);
  // Carga inicial: el setState ocurre DESPUÉS del await (no síncrono en el effect → sin renders en cascada).
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const data = await getSolicitudesTrailer();
        if (vivo) { setLista(data); setError(""); }
      } catch (e) { if (vivo) setError(String(e?.message || e)); }
      finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const proyectoSel = proyectosArr.find((p) => p.code === form.proyectoCode);   // temporada elegida → sus ranchos

  const registrar = async () => {
    if (!form.responsable.trim()) { setFormError("Escribe el responsable (encargado de campo)."); return; }
    if (!form.proyectoCode) { setFormError("Elige la temporada."); return; }
    if (!form.rancho) { setFormError("Elige el rancho."); return; }
    setGuardando(true); setFormError("");
    try {
      await crearSolicitudTrailer({ ...form, cantidadTrailer: parseInt(form.cantidadTrailer, 10) || 1 });
      setForm(EMPTY);
      await cargar();
    } catch (e) { setFormError(String(e?.message || e)); }
    finally { setGuardando(false); }
  };

  const accion = async (id, fn) => {
    setOcupado(id);
    try { await fn(id); await cargar(); }
    catch (e) { setError(String(e?.message || e)); }
    finally { setOcupado(null); }
  };
  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta solicitud? (se conserva en el histórico, solo se oculta)")) return;
    accion(id, borrarSolicitudTrailer);
  };

  const pendientes = lista.filter((s) => s.estado !== "cumplida");
  const cumplidas = lista.filter((s) => s.estado === "cumplida");
  const trailersPend = pendientes.reduce((a, s) => a + (s.cantidadTrailer || 0), 0);

  // ── Búsqueda + filtros (sobre la pestaña activa) — mismo patrón que Movimiento de Materiales ──
  const baseTab = tab === "cumplidas" ? cumplidas : pendientes;
  const qLow = q.trim().toLowerCase();
  const filas = baseTab.filter((s) => {
    if (fTemporada && s.temporada !== fTemporada) return false;
    if (fRancho && s.rancho !== fRancho) return false;
    if (qLow) {
      const campos = [s.responsable, s.temporada, s.rancho, s.departamento, s.tipoArticulo, s.tarasCortadas, s.notas, s.fechaCorte];
      if (!campos.some((c) => String(c ?? "").toLowerCase().includes(qLow))) return false;
    }
    return true;
  });
  const temporadasOpts = [...new Set(lista.map((s) => s.temporada).filter(Boolean))];
  const ranchosOpts = [...new Set(lista.map((s) => s.rancho).filter(Boolean))];
  // Catálogo "libre" que se arma solo: lo que ya escribieron antes se ofrece como sugerencia.
  const articulosUsados = [...new Set(lista.map((s) => s.tipoArticulo).filter(Boolean))].sort();
  const hayFiltros = q || fTemporada || fRancho;
  const limpiarFiltros = () => { setQ(""); setFTemporada(""); setFRancho(""); };
  const INP_FILTRO = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";

  // ── Exportar a Excel (respeta pestaña activa + filtros) ──
  const exportarExcel = () => {
    if (filas.length === 0) return;
    const filasXls = filas.map((s) => ({
      Estado: s.estado === "cumplida" ? "Cumplida" : "Pendiente",
      Responsable: s.responsable || "",
      Temporada: s.temporada || "",
      Rancho: s.rancho || "",
      Departamento: s.departamento || "",
      "Tipo de artículo": s.tipoArticulo || "",
      "Fecha de corte": s.fechaCorte || "",
      "Hora estimada": s.horaEstimada || "",
      "Taras cortadas": s.tarasCortadas || "",
      "Cantidad de trailers": s.cantidadTrailer || 0,
      Notas: s.notas || "",
      Registrada: s.creadaEn ? new Date(s.creadaEn).toLocaleString("es-MX") : "",
      "Cumplida el": s.cumplidaEn ? new Date(s.cumplidaEn).toLocaleString("es-MX") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(filasXls);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
    const hoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Solicitudes_Trailer_${tab}_${hoy}.xlsx`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 gap-y-3 mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Solicitud de Trailer</h1>
          <p className="text-sm text-gray-500 mt-0.5">Encargado de Campo · necesidad de trailer (rancho, corte, taras, cantidad y hora)</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><Megaphone size={16} /></div>
      </div>

      {/* Conteo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Stat label="Necesidades pendientes" valor={pendientes.length} color="text-amber-600" />
        <Stat label="Trailers solicitados" valor={trailersPend} color="text-blue-600" />
        <Stat label="Cumplidas" valor={cumplidas.length} color="text-green-600" />
        <Stat label="Total registradas" valor={lista.length} color="text-gray-700" />
      </div>

      {/* Formulario de nueva solicitud */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase mb-3 inline-flex items-center gap-1"><Plus size={14} /> Nueva necesidad de trailer</div>
        {proyectosArr.length === 0 && (
          <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>No hay temporadas/ranchos cargados. Ábrelos primero en <b>Movimientos Campo → Empaque</b> → <b>Ranchos/Empaques</b> → <b>Actualizar de SAP</b> (se comparten con este módulo).</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Responsable (encargado de campo) *</label>
            <input className={INP} value={form.responsable} onChange={(e) => set("responsable", e.target.value)} placeholder="Ej. Juan Pérez" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fecha de corte</label>
            <input type="date" className={INP} value={form.fechaCorte} onChange={(e) => set("fechaCorte", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Hora estimada</label>
            <input type="time" className={INP} value={form.horaEstimada} onChange={(e) => set("horaEstimada", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Temporada * <span className="text-gray-300 font-normal">· de SAP</span></label>
            <SearchSelect className={INP} value={form.proyectoCode}
              onChange={(v) => { const p = proyectosArr.find((x) => x.code === v); setForm((f) => ({ ...f, proyectoCode: v, temporada: p?.nombre || "", rancho: "", departamento: "" })); }}
              placeholder="— Temporada —" options={proyectosArr.map((p) => ({ value: p.code, label: p.nombre }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Rancho * <span className="text-gray-300 font-normal">· de SAP</span></label>
            <SearchSelect className={INP} value={form.rancho} disabled={!proyectoSel}
              onChange={(v) => { const r = proyectoSel?.ranchos?.find((x) => x.nombre === v); setForm((f) => ({ ...f, rancho: v, departamento: r?.departamento || "" })); }}
              placeholder={proyectoSel ? "— Rancho —" : "Elige temporada"} options={(proyectoSel?.ranchos || []).map((r) => ({ value: r.nombre, label: r.nombre }))} />
            {form.departamento ? <div className="text-[10px] text-gray-400 mt-0.5">Depto: {form.departamento}</div> : null}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tipo de artículo <span className="text-gray-300 font-normal">· libre</span></label>
            <input className={INP} value={form.tipoArticulo} onChange={(e) => set("tipoArticulo", e.target.value)}
              placeholder="Ej. Bins, Taras…" list="articulos-libres" autoComplete="off" />
            {/* Sugerencias de lo ya escrito antes (se va armando el catálogo libre solo). */}
            <datalist id="articulos-libres">
              {articulosUsados.map((a) => <option key={a} value={a} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Taras cortadas</label>
            <input className={INP} value={form.tarasCortadas} onChange={(e) => set("tarasCortadas", e.target.value)} placeholder="Ej. 500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Cantidad de trailers</label>
            <input type="number" min="1" className={INP} value={form.cantidadTrailer} onChange={(e) => set("cantidadTrailer", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Notas (opcional)</label>
            <input className={INP} value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Detalle adicional…" />
          </div>
        </div>
        {formError && <div className="mt-3 text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={14} /> {formError}</div>}
        <div className="flex justify-end mt-3">
          <button onClick={registrar} disabled={guardando}
            className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1">
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Registrar solicitud
          </button>
        </div>
      </div>

      {/* Pestañas + lista */}
      <ColaTabs tab={tab} setTab={setTab} tabs={[
        { key: "pendientes", label: "Pendientes", count: pendientes.length },
        { key: "cumplidas", label: "Cumplidas", count: cumplidas.length },
      ]} />

      {/* Barra: búsqueda + filtros + Excel (respeta la pestaña activa) */}
      {lista.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between flex-wrap gap-2 gap-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{tab === "cumplidas" ? "Cumplidas" : "Pendientes"} ({filas.length}{hayFiltros ? ` de ${baseTab.length}` : ""})</span>
            {hayFiltros && <button onClick={limpiarFiltros} className="text-xs text-blue-600 hover:underline">Limpiar filtros</button>}
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar responsable, rancho, temporada, taras…"
              className="flex-1 min-w-0 sm:min-w-[200px] max-w-md text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <div className="w-full sm:w-40"><SearchSelect className={INP_FILTRO} value={fTemporada} onChange={setFTemporada} placeholder="Temporada: todas" options={[{ value: "", label: "Temporada: todas" }, ...temporadasOpts.map((t) => ({ value: t, label: t }))]} /></div>
            <div className="w-full sm:w-40"><SearchSelect className={INP_FILTRO} value={fRancho} onChange={setFRancho} placeholder="Rancho: todos" options={[{ value: "", label: "Rancho: todos" }, ...ranchosOpts.map((r) => ({ value: r, label: r }))]} /></div>
            <button onClick={exportarExcel} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 inline-flex items-center gap-1 whitespace-nowrap"><FileText size={14} /> Excel{hayFiltros ? " (filtrado)" : ""}</button>
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-600 mb-3 inline-flex items-center gap-1"><AlertCircle size={14} /> {error}</div>}

      {cargando ? (
        <div className="text-center text-sm text-gray-400 py-10 inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-sm text-gray-400">
          {hayFiltros ? "Ninguna solicitud coincide con los filtros." : tab === "cumplidas" ? "Aún no hay solicitudes cumplidas." : "No hay necesidades de trailer pendientes. Registra una arriba."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filas.map((s) => {
            const cumplida = s.estado === "cumplida";
            const busy = ocupado === s.id;
            return (
              <div key={s.id} className={`bg-white border rounded-xl p-4 ${cumplida ? "border-green-200" : "border-amber-200"}`}>
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900 truncate">
                      <MapPin size={15} className="shrink-0 text-blue-500" />
                      {s.rancho || "—"}
                    </span>
                    {s.temporada ? <div className="text-xs text-gray-400 truncate pl-5">{s.temporada}</div> : null}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cumplida ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {cumplida ? "Cumplida" : "Pendiente"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
                  <Campo icon={User} label="Responsable" valor={s.responsable} />
                  <Campo icon={Truck} label="Trailers" valor={s.cantidadTrailer} />
                  <Campo icon={Sprout} label="Depto" valor={s.departamento} />
                  <Campo icon={Boxes} label="Artículo" valor={s.tipoArticulo} />
                  <Campo icon={Package} label="Taras" valor={s.tarasCortadas} />
                  <Campo icon={Calendar} label="Corte" valor={s.fechaCorte} />
                  <Campo icon={Clock} label="Hora est." valor={s.horaEstimada} />
                  <Campo icon={Clock} label="Registrada" valor={fmtFechaHora(s.creadaEn)} />
                </div>
                {s.notas && <div className="text-xs text-gray-500 mb-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">{s.notas}</div>}
                {cumplida && s.cumplidaEn && <div className="text-xs text-green-600 mb-3 inline-flex items-center gap-1"><Check size={13} /> Cumplida el {fmtFechaHora(s.cumplidaEn)}</div>}

                <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-3">
                  {!cumplida ? (
                    <button onClick={() => accion(s.id, cumplirSolicitudTrailer)} disabled={busy}
                      className="text-xs px-3 py-1.5 rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Ya se cumplió
                    </button>
                  ) : (
                    <button onClick={() => accion(s.id, reabrirSolicitudTrailer)} disabled={busy}
                      className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium inline-flex items-center gap-1 disabled:opacity-50">
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reabrir
                    </button>
                  )}
                  <button onClick={() => eliminar(s.id)} disabled={busy}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-red-500 hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
