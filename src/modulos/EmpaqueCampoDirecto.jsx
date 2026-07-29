import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, Truck, Save, X, Sprout, Pencil, Package, ChevronDown, ChevronUp, Check, RotateCcw, Clock } from "lucide-react";
import { useDatos, nuevoId, ahora, CAMPO_DIRECTO_DEFAULT } from "../store/datos";
import { useAuth } from "../store/auth";
import { useDialog } from "../components/Dialog";
import SearchSelect from "../components/SearchSelect";
import { kgRecibidosDe, kgVaciadosDe, kgEnPisoDe, kgMermadosDe, cubetasDe, estaTerminado, kgSobranteCierre } from "./helpers/empaque";
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
  const totVaciado = lista.reduce((a, m) => a + kgVaciadosDe(m), 0);
  const totPiso = lista.reduce((a, m) => a + kgEnPisoDe(m), 0);

  const netoDe = (m) => parseFloat(m.netoTeorico) || (parseFloat(m.bins) || 0) * netoPorBin;

  // ── VACIADO (por bins) ──
  // Neto por bin de ESTE folio (usa sus binParams congelados; si no, los defaults actuales).
  const netoPorBinDe = (m) => Math.max(0, (parseFloat(m.binParams?.brutoPorBin) || brutoPorBin) - (parseFloat(m.binParams?.taraBin) || taraBin));
  // Muta el vaciado de un folio (crea el objeto base si no existe). kgRecibidos = neto teórico
  // sembrado al crear el folio → los helpers de empaque (kgEnPisoDe, etc.) funcionan igual.
  const updVac = (id, fn) => setMovimientosCampo((prev) => prev.map((m) => m.id === id
    ? { ...m, vaciado: fn({ kgRecibidos: m.netoTeorico || 0, eventos: [], mermas: [], ...(m.vaciado || {}) }), actualizado: ahora().iso }
    : m));

  const registrarVaciado = (m, binsN, hora) => {
    const b = parseFloat(binsN) || 0;
    if (b <= 0) return;
    const npb = netoPorBinDe(m);
    const ev = { id: nuevoId("VD_"), bins: b, kg: b * npb, fecha: hoyISO(), hora: hora || ahoraHM() };
    updVac(m.id, (v) => ({ ...v, eventos: [...(v.eventos || []), ev] }));
    registrarEvento?.({ evento: "campo_directo_vaciado", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Vació ${b} bins (${fmt(b * npb)} kg) del folio ${m.folio}` });
  };
  const delVaciado = (m, evId) => updVac(m.id, (v) => ({ ...v, eventos: (v.eventos || []).filter((e) => e.id !== evId) }));

  const registrarMermaCD = (m, kg, motivo) => {
    const k = parseFloat(kg) || 0;
    if (k <= 0) return;
    updVac(m.id, (v) => ({ ...v, mermas: [...(v.mermas || []), { id: nuevoId("MR_"), kg: k, motivo: (motivo || "").trim(), fecha: hoyISO(), hora: ahoraHM() }] }));
    registrarEvento?.({ evento: "campo_directo_merma", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Merma ${fmt(k)} kg del folio ${m.folio}${motivo ? ` (${motivo})` : ""}` });
  };
  const delMermaCD = (m, id) => updVac(m.id, (v) => ({ ...v, mermas: (v.mermas || []).filter((x) => x.id !== id) }));

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
    updVac(m.id, (v) => ({ ...v, terminado: { por: usuario?.nombre || "Empaque", porId: usuario?.id || "", ts: ahora().iso, pisoAlCerrar: piso } }));
    registrarEvento?.({ evento: "campo_directo_terminado", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Terminó el folio ${m.folio} (quedaban ${fmt(piso)} kg en piso)` });
  };
  const reabrirCD = async (m) => {
    const ok = await dlg.confirm({ title: "Reabrir folio", message: "El folio volverá a contar como en piso para seguir vaciando. ¿Reabrir?", confirmText: "Sí, reabrir" });
    if (!ok) return;
    updVac(m.id, (v) => { const c = { ...v }; delete c.terminado; return c; });
    registrarEvento?.({ evento: "campo_directo_reabierto", modulo: "M9-CD", actor: usuario?.nombre || "Empaque", destino: m.folio, ref: m.id, detalle: `Reabrió el folio ${m.folio}` });
  };

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
          { lab: "Vaciado (kg)", val: fmt(totVaciado), color: "text-green-700" },
          { lab: "En piso (kg)", val: fmt(totPiso), color: "text-amber-700", sub: `de ${fmt(totNeto)} kg teóricos` },
        ].map((s) => (
          <div key={s.lab} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="text-[11px] text-gray-500">{s.lab}</div>
            <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
            {s.sub && <div className="text-[10px] text-gray-400">{s.sub}</div>}
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
            const rec = kgRecibidosDe(m);
            const vac = kgVaciadosDe(m);
            const piso = kgEnPisoDe(m);
            const term = estaTerminado(m);
            const pct = rec > 0 ? Math.min(100, Math.round((vac / rec) * 100)) : 0;
            const npb = netoPorBinDe(m);
            const binsPiso = npb > 0 ? Math.round(piso / npb) : 0;
            return (
              <div key={m.id} className={`bg-white border rounded-xl overflow-hidden ${term ? "border-gray-200" : abierto ? "border-emerald-300 ring-1 ring-emerald-100" : "border-gray-200"}`}>
                <div className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                  <div className="flex items-center gap-2 min-w-[110px]">
                    <span className="text-[10px] font-bold text-white bg-emerald-600 rounded px-1.5 py-0.5">FOLIO</span>
                    <span className="font-bold text-gray-900">{m.folio}</span>
                  </div>
                  <div className="text-xs text-gray-600 flex items-center gap-1"><Sprout size={13} className="text-emerald-500" /> {m.rancho || "—"}<span className="text-gray-300">·</span><span className="text-gray-400">{temporadaDe(m.rancho) || (proyectos || []).find((p) => p.code === m.proyecto)?.nombre || "—"}</span></div>
                  {m.departamento && <span className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">Tabla: {m.departamento}</span>}
                  <div className="flex-1" />
                  {/* Progreso Vaciado / En piso */}
                  {term ? (
                    <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><Check size={12} /> Terminado{kgSobranteCierre(m) > 1 ? ` · sobraron ${fmt(kgSobranteCierre(m))} kg` : ""}</span>
                  ) : (
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">{pct}%</span>
                      <span className="text-xs whitespace-nowrap"><span className="text-amber-700 font-bold">{fmt(piso)}</span> <span className="text-gray-400">kg piso{binsPiso > 0 ? ` · ~${binsPiso} bins` : ""}</span></span>
                    </div>
                  )}
                  <button onClick={() => setExpandido(abierto ? null : m.id)} className={`text-xs font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${abierto ? "bg-emerald-600 text-white" : "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>{abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Vaciar</button>
                  <button onClick={() => abrirEditar(m)} className="text-gray-400 hover:text-emerald-700 p-1" title="Editar"><Pencil size={15} /></button>
                  <button onClick={() => borrar(m)} className="text-gray-300 hover:text-red-600 p-1" title="Borrar"><Trash2 size={15} /></button>
                </div>
                {abierto && (
                  <div className="border-t border-gray-100">
                    <VaciadoPanel
                      m={m} netoPorBin={npb} fmt={fmt} orden={ordenDe(m)}
                      onRegistrar={(bins, hora) => registrarVaciado(m, bins, hora)}
                      onDelEvento={(evId) => delVaciado(m, evId)}
                      onMerma={(kg, mot) => registrarMermaCD(m, kg, mot)}
                      onDelMerma={(id) => delMermaCD(m, id)}
                      onTerminar={() => terminarCD(m)}
                      onReabrir={() => reabrirCD(m)}
                    />
                    <div className="px-3 py-3 bg-gray-50/60 text-xs grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 border-t border-gray-100">
                      <Dato lab="Cultivo" val={m.cultivo} />
                      <Dato lab="Transporte" val={m.transporte || "—"} />
                      <Dato lab="Chofer" val={m.chofer || "—"} />
                      <Dato lab="Fecha" val={m.fecha || "—"} />
                      <Dato lab="Hora salida" val={m.horaSalida || "—"} />
                      <Dato lab="Hora llegada" val={m.horaLlegada || "—"} />
                      <Dato lab="Bruto teórico" val={`${fmt((parseFloat(m.bins) || 0) * (parseFloat(m.binParams?.brutoPorBin) || brutoPorBin))} kg`} />
                      <Dato lab="Neto teórico" val={`${fmt(netoDe(m))} kg`} />
                      {m.observaciones && <div className="col-span-2 sm:col-span-4"><span className="text-gray-400">Observaciones:</span> {m.observaciones}</div>}
                      <div className="col-span-2 sm:col-span-4 mt-1 text-[11px] text-gray-400 italic">El envío a SAP (recibo + OC) de este folio se habilita en las siguientes fases.</div>
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

// ── Panel de VACIADO por bins de un folio ──
// Registran cuántos bins vaciaron (y a qué hora si quieren): cada bin = su neto calculado.
// Total = "Vaciar lo que resta" (un registro con todos los bins); por hora = varios registros.
// El "en piso" y las cubetas a SAP (neto ÷ 6) salen de los helpers de empaque (mismos números).
function VaciadoPanel({ m, netoPorBin, fmt, orden, onRegistrar, onDelEvento, onMerma, onDelMerma, onTerminar, onReabrir }) {
  const rec = kgRecibidosDe(m);
  const vac = kgVaciadosDe(m);
  const mer = kgMermadosDe(m);
  const piso = kgEnPisoDe(m);
  const term = estaTerminado(m);
  const evs = m.vaciado?.eventos || [];
  const mrs = m.vaciado?.mermas || [];
  const binsPiso = netoPorBin > 0 ? Math.round(piso / netoPorBin) : 0;
  const cubetas = cubetasDe(vac);   // neto ÷ 6, lo que irá a SAP

  const [bins, setBins] = useState("");
  const [reloj, setReloj] = useState(ahoraHM());   // reloj en tiempo real (no editable)
  const [mermaOpen, setMermaOpen] = useState(false);
  const [mermaKg, setMermaKg] = useState("");
  const [mermaMot, setMermaMot] = useState("");

  // Tic tac: la hora del registro es SIEMPRE la hora real del momento (no se puede cambiar).
  useEffect(() => { const t = setInterval(() => setReloj(ahoraHM()), 1000); return () => clearInterval(t); }, []);

  const binsN = parseFloat(bins) || 0;
  const kgPrev = binsN * netoPorBin;

  const doRegistrar = () => { if (binsN <= 0) return; onRegistrar(binsN, ahoraHM()); setBins(""); };
  const vaciarResto = () => { if (binsPiso <= 0) return; onRegistrar(binsPiso, ""); };
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

      {term ? (
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 flex-wrap gap-2">
          <span className="text-sm text-gray-600 inline-flex items-center gap-1.5"><Check size={15} className="text-gray-500" /> Folio <b>terminado</b> por {m.vaciado?.terminado?.por || "—"}{kgSobranteCierre(m) > 1 ? ` · sobraron ${fmt(kgSobranteCierre(m))} kg` : ""}</span>
          <button onClick={onReabrir} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 inline-flex items-center gap-1"><RotateCcw size={13} /> Reabrir</button>
        </div>
      ) : (
        <>
          {/* Registrar vaciado */}
          <div className="flex items-end gap-2 flex-wrap bg-white border border-emerald-200 rounded-lg p-2.5">
            <div className="w-28">
              <label className="text-[10px] text-gray-500 block mb-0.5">Bins vaciados</label>
              <input type="number" min="0" step="1" value={bins} onChange={(e) => setBins(e.target.value)} placeholder={binsPiso > 0 ? String(binsPiso) : "0"} className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5 inline-flex items-center gap-1"><Clock size={11} /> Hora (automática)</label>
              <div className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-semibold tabular-nums inline-flex items-center gap-1.5" title="Se registra con la hora real del momento; no se puede cambiar">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> {hm12(reloj)}
              </div>
            </div>
            <div className="text-xs text-gray-600 pb-2">= <b className="text-green-700">{fmt(kgPrev)} kg</b> <span className="text-gray-400">({binsN || 0} × {fmt(netoPorBin)})</span></div>
            <button onClick={doRegistrar} disabled={binsN <= 0} className="text-xs px-3 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1"><Plus size={14} /> Registrar</button>
            {binsPiso > 0 && <button onClick={vaciarResto} className="text-xs px-3 py-2 border border-emerald-300 text-emerald-700 rounded-lg font-semibold hover:bg-emerald-50 inline-flex items-center gap-1"><Truck size={14} /> Vaciar lo que resta ({binsPiso} bins)</button>}
            <div className="flex-1" />
            <button onClick={onTerminar} className="text-xs px-3 py-2 border border-amber-300 text-amber-700 rounded-lg font-semibold hover:bg-amber-50 inline-flex items-center gap-1"><Check size={14} /> Terminar</button>
          </div>

          {/* Registros de vaciado */}
          {evs.length > 0 && (
            <div className="mt-2 space-y-1">
              {evs.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded px-2 py-1 gap-2">
                  <span className="text-gray-600"><b className="text-gray-800">{fmt(e.bins)} bins</b> · {fmt(e.kg)} kg <span className="text-gray-400">· {hm12(e.hora)}{e.fecha ? ` · ${e.fecha}` : ""}</span></span>
                  <button onClick={() => onDelEvento(e.id)} title="Quitar" className="text-red-400 hover:text-red-600 shrink-0"><X size={13} /></button>
                </div>
              ))}
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
