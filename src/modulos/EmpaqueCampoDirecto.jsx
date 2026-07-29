import { useState, useMemo } from "react";
import { Plus, Trash2, Truck, Save, X, Sprout, Pencil, Package, ChevronDown, ChevronUp } from "lucide-react";
import { useDatos, nuevoId, ahora, CAMPO_DIRECTO_DEFAULT } from "../store/datos";
import { useAuth } from "../store/auth";
import { useDialog } from "../components/Dialog";
import SearchSelect from "../components/SearchSelect";
import { hoyISO } from "../utils/fecha";

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
});

const INP = "w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-emerald-400";

export default function EmpaqueCampoDirecto() {
  const { movimientosCampo, setMovimientosCampo, proyectos, configEmpaque, setConfigEmpaque, registrarEvento } = useDatos();
  const { usuario } = useAuth() || {};
  const dlg = useDialog();

  const lista = useMemo(() => (Array.isArray(movimientosCampo) ? movimientosCampo : []), [movimientosCampo]);

  // Parámetros del bin (editables en configEmpaque.campoDirecto).
  const cd = { ...CAMPO_DIRECTO_DEFAULT, ...(configEmpaque?.campoDirecto || {}) };
  const brutoPorBin = parseFloat(cd.brutoPorBin) || CAMPO_DIRECTO_DEFAULT.brutoPorBin;
  const taraBin = parseFloat(cd.taraBin) || CAMPO_DIRECTO_DEFAULT.taraBin;
  const cubetasPorBin = parseFloat(cd.cubetasPorBin) || CAMPO_DIRECTO_DEFAULT.cubetasPorBin;
  const netoPorBin = Math.max(0, brutoPorBin - taraBin);
  const setCd = (patch) => setConfigEmpaque({ ...(configEmpaque || {}), campoDirecto: { ...cd, ...patch } });

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
    if (!folio) { dlg.alerta({ title: "Falta el folio", message: "Captura el número de folio del ticket." }); return; }
    if (bins <= 0) { dlg.alerta({ title: "Faltan los bins", message: "Captura cuántos bins se mandaron desde campo." }); return; }
    // Folio duplicado (dentro de campo directo).
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
      // Parámetros con los que se calculó el neto (se congelan por folio para auditar).
      binParams: { brutoPorBin, taraBin, cubetasPorBin },
      // Neto teórico como "recibido": así los helpers de empaque (kgRecibidosDe/kgEnPisoDe) y el
      // vaciado (fases siguientes) funcionan igual que en logística. `kgRecibidos` es el override
      // que lee kgRecibidosDe.
      netoTeorico: bins * (brutoPorBin - taraBin),
    };
    if (editId) {
      setMovimientosCampo((prev) => prev.map((m) => m.id === editId
        ? { ...m, ...base, actualizado: t.iso, vaciado: { ...(m.vaciado || {}), kgRecibidos: base.netoTeorico } }
        : m));
      registrarEvento?.({ evento: "campo_directo_editado", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: folio, ref: editId, detalle: `Editó folio campo directo ${folio} (${bins} bins)` });
    } else {
      const id = nuevoId("MOVCD_");
      const mov = { ...base, id, creado: t.iso, vaciado: { kgRecibidos: base.netoTeorico } };
      setMovimientosCampo((prev) => [mov, ...prev]);
      registrarEvento?.({ evento: "campo_directo_creado", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: folio, ref: id, detalle: `Creó folio campo directo ${folio} · ${bins} bins · ${fmt(base.netoTeorico)} kg neto teórico` });
    }
    cerrarForm();
  };

  const borrar = async (m) => {
    const ok = await dlg.confirm({ title: "Borrar folio", message: `¿Borrar el folio ${m.folio} de campo directo? Esta acción no se puede deshacer.`, confirmText: "Sí, borrar", danger: true });
    if (!ok) return;
    setMovimientosCampo((prev) => prev.filter((x) => x.id !== m.id));
    registrarEvento?.({ evento: "campo_directo_borrado", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Borró folio campo directo ${m.folio}` });
  };

  // Totales para el resumen.
  const totBins = lista.reduce((a, m) => a + (parseFloat(m.bins) || 0), 0);
  const totNeto = lista.reduce((a, m) => a + (parseFloat(m.netoTeorico) || 0), 0);
  const totCub = lista.reduce((a, m) => a + (parseFloat(m.bins) || 0) * (parseFloat(m.binParams?.cubetasPorBin) || cubetasPorBin), 0);

  const netoDe = (m) => parseFloat(m.netoTeorico) || (parseFloat(m.bins) || 0) * netoPorBin;
  const cubDe = (m) => (parseFloat(m.bins) || 0) * (parseFloat(m.binParams?.cubetasPorBin) || cubetasPorBin);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2 gap-y-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Sprout size={18} className="text-emerald-600" /> Empaque campo directo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Carros que llegan directo de campo (sin pasar por logística). Se pesan y se vacían aquí.</p>
        </div>
        <button onClick={abrirNuevo} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-emerald-700 shadow-sm">
          <Plus size={16} /> Nuevo folio
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { lab: "Folios", val: lista.length, color: "text-gray-900" },
          { lab: "Bins mandados", val: fmt(totBins), color: "text-emerald-700" },
          { lab: "Neto teórico (kg)", val: fmt(totNeto), color: "text-indigo-700" },
          { lab: "Cubetas (ticket)", val: fmt(totCub), color: "text-amber-700" },
        ].map((s) => (
          <div key={s.lab} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="text-[11px] text-gray-500">{s.lab}</div>
            <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Config del bin */}
      <div className="mb-4 bg-emerald-50/50 border border-emerald-200 rounded-xl">
        <button onClick={() => setCfgAbierto((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold text-emerald-800">
          <span className="inline-flex items-center gap-1.5"><Package size={14} /> Parámetros del bin · 1 bin = {fmt(brutoPorBin)} kg bruto · tara {fmt(taraBin)} kg · <b>{fmt(netoPorBin)} kg neto</b> · {fmt(cubetasPorBin)} cubetas</span>
          {cfgAbierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {cfgAbierto && (
          <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-emerald-100 pt-3">
            {[
              { k: "brutoPorBin", lab: "Bruto por bin (kg)", val: cd.brutoPorBin },
              { k: "taraBin", lab: "Tara del bin vacío (kg)", val: cd.taraBin },
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

      {/* Lista de folios */}
      {lista.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl py-10 text-center text-sm text-gray-400">
          No hay folios de campo directo todavía. Da clic en <b className="text-gray-600">Nuevo folio</b> para capturar uno.
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((m) => {
            const abierto = expandido === m.id;
            return (
              <div key={m.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <span className="text-[10px] font-bold text-white bg-emerald-600 rounded px-1.5 py-0.5">FOLIO</span>
                    <span className="font-bold text-gray-900">{m.folio}</span>
                  </div>
                  <div className="text-xs text-gray-600 flex items-center gap-1"><Sprout size={13} className="text-emerald-500" /> {m.rancho || "—"}<span className="text-gray-300">·</span><span className="text-gray-400">{temporadaDe(m.rancho) || (proyectos || []).find((p) => p.code === m.proyecto)?.nombre || "—"}</span></div>
                  {m.departamento && <span className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">Tabla: {m.departamento}</span>}
                  <div className="flex-1" />
                  <div className="text-xs text-gray-700 inline-flex items-center gap-3">
                    <span><b>{fmt(m.bins)}</b> bins</span>
                    <span className="text-indigo-700"><b>{fmt(netoDe(m))}</b> kg neto</span>
                    <span className="text-amber-700">{fmt(cubDe(m))} cub</span>
                  </div>
                  <button onClick={() => setExpandido(abierto ? null : m.id)} className="text-gray-400 hover:text-gray-700 p-1" title="Ver detalle">{abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                  <button onClick={() => abrirEditar(m)} className="text-gray-400 hover:text-emerald-700 p-1" title="Editar"><Pencil size={15} /></button>
                  <button onClick={() => borrar(m)} className="text-gray-300 hover:text-red-600 p-1" title="Borrar"><Trash2 size={15} /></button>
                </div>
                {abierto && (
                  <div className="border-t border-gray-100 px-3 py-3 bg-gray-50/60 text-xs grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4">
                    <Dato lab="Cultivo" val={m.cultivo} />
                    <Dato lab="Transporte" val={m.transporte || "—"} />
                    <Dato lab="Chofer" val={m.chofer || "—"} />
                    <Dato lab="Fecha" val={m.fecha || "—"} />
                    <Dato lab="Hora salida" val={m.horaSalida || "—"} />
                    <Dato lab="Hora llegada" val={m.horaLlegada || "—"} />
                    <Dato lab="Bruto teórico" val={`${fmt((parseFloat(m.bins) || 0) * (parseFloat(m.binParams?.brutoPorBin) || brutoPorBin))} kg`} />
                    <Dato lab="Neto teórico" val={`${fmt(netoDe(m))} kg`} />
                    {m.observaciones && <div className="col-span-2 sm:col-span-4"><span className="text-gray-400">Observaciones:</span> {m.observaciones}</div>}
                    <div className="col-span-2 sm:col-span-4 mt-1 text-[11px] text-gray-400 italic">El vaciado y el envío a SAP (recibo + OC) de este folio se habilitan en las siguientes fases.</div>
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
              <Campo lab="Folio *">
                <input value={form.folio} onChange={(e) => upd({ folio: e.target.value })} placeholder="002038" className={INP} />
              </Campo>
              <Campo lab="Cultivo (fijo)">
                <input value={form.cultivo} readOnly disabled className={`${INP} bg-gray-50 text-gray-500`} />
              </Campo>
              <Campo lab="Lote (escribe o elige)">
                <SearchSelect value={form.rancho} onChange={onLote} options={loteOpts} allowCustom placeholder="Ramos…" className={INP} />
                <span className="text-[11px] text-gray-400 mt-0.5 block">Temporada: <b className="text-gray-600">{temporadaDe(form.rancho) || "— se resuelve al elegir el lote —"}</b></span>
              </Campo>
              <Campo lab="Tabla (departamento)">
                <SearchSelect value={form.departamento} onChange={(v) => upd({ departamento: v })} options={tablaOpts} allowCustom placeholder="Tabla…" className={INP} />
              </Campo>
              <Campo lab="Transporte">
                <SearchSelect value={form.transporte} onChange={(v) => upd({ transporte: v })} options={transporteOpts} allowCustom placeholder="Camión blanco Z-JN3 607" className={INP} />
              </Campo>
              <Campo lab="Chofer">
                <SearchSelect value={form.chofer} onChange={(v) => upd({ chofer: v })} options={choferOpts} allowCustom placeholder="Rubén Cota" className={INP} />
              </Campo>
              <Campo lab="Bins mandados *">
                <input type="number" min="0" step="1" value={form.bins} onChange={(e) => upd({ bins: e.target.value })} placeholder="36" className={INP} />
              </Campo>
              <Campo lab="Fecha de llegada">
                <input type="date" value={form.fecha} onChange={(e) => upd({ fecha: e.target.value })} className={INP} />
              </Campo>
              <Campo lab="Hora de salida">
                <input type="time" value={form.horaSalida} onChange={(e) => upd({ horaSalida: e.target.value })} className={INP} />
              </Campo>
              <Campo lab="Hora de llegada">
                <input type="time" value={form.horaLlegada} onChange={(e) => upd({ horaLlegada: e.target.value })} className={INP} />
              </Campo>
              <div className="sm:col-span-2">
                <Campo lab="Observaciones">
                  <input value={form.observaciones} onChange={(e) => upd({ observaciones: e.target.value })} placeholder="(opcional)" className={INP} />
                </Campo>
              </div>

              {/* Cálculo en vivo */}
              <div className="sm:col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-center gap-4 flex-wrap text-sm">
                <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold"><Truck size={15} /> {fmt(bins)} bins</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-700">Bruto: <b>{fmt(brutoTotal)}</b> kg</span>
                <span className="text-gray-700">Tara: <b>{fmt(bins * taraBin)}</b> kg</span>
                <span className="text-indigo-700">Neto teórico: <b>{fmt(netoTeorico)}</b> kg</span>
                <span className="text-amber-700">Cubetas: <b>{fmt(cubetasTicket)}</b></span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
              <button onClick={cerrarForm} className="text-sm text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100">Cancelar</button>
              <button onClick={guardar} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700"><Save size={15} /> {editId ? "Guardar cambios" : "Guardar folio"}</button>
            </div>
          </div>
        </div>
      )}
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

function Dato({ lab, val }) {
  return (
    <div><span className="text-gray-400">{lab}:</span> <span className="text-gray-800 font-medium">{val}</span></div>
  );
}
