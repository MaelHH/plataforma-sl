import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Check, Trash2, Search, ScanLine, Loader2, AlertCircle,
  X, RefreshCw, Package, Building2, CalendarDays, Save, PackagePlus, ListChecks, Truck,
} from "lucide-react";
import {
  getPalletsDisponibles, getClientesVenta,
  guardarManifiesto, getManifiestos, enviarManifiestoSAP, cancelarManifiesto,
} from "../store/api";
import SearchSelect from "../components/SearchSelect";
import { useDialog } from "../components/Dialog";
import TableroEmbarques from "./TableroEmbarques";
import EmbarquesLista from "./EmbarquesLista";
import ConfirmarEnvioSAP from "./ConfirmarEnvioSAP";

// ── Módulo 15 · Asignar Pallets (arma la Orden de Venta para embarque) ──────────────
// FASE 2 (solo lectura): selecciona pallets REALES de SAP (GET /api/sap/pallets-disponibles),
// los agrupa igual que el AddOn (por PT + lote + departamento) y muestra la vista previa de la OV.
// El botón "Crear OV" queda DESHABILITADO — la escritura a SAP llega en la Fase 3. NO toca nada
// existente: módulo aislado, su propio endpoint de solo lectura. UX calcada del mockup aprobado
// (escaneo por folio, rango "25940-25960", clic/Shift+clic para seleccionar y deseleccionar).

const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white";
const norm = (s) => (s || "").toString().toLowerCase();
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// rango "A-B" / "A a B" / "A hasta B" → [lo, hi] o null
const rango = (raw) => {
  const m = (raw || "").trim().match(/^(\d{2,})\s*(?:-|a|hasta)\s*(\d{2,})$/i);
  return m ? [Math.min(+m[1], +m[2]), Math.max(+m[1], +m[2])] : null;
};
// clave ÚNICA de cada fila = el detalle del pallet (@P_PALLETSDETAIL.Code); el folio puede repetirse.
const cid = (p) => String(p.palletDet);
const claveLinea = (p) => `${p.pt}|${p.lote}|${p.depto || "—"}`;

const Stat = ({ label, valor, sub }) => (
  <div className="text-right leading-tight">
    <div className="text-3xl font-bold text-gray-800 tabular-nums">{valor}</div>
    <div className="text-[11px] text-gray-500 font-semibold">{label}</div>
    {sub ? <div className="text-[11px] text-gray-400 font-semibold">{sub}</div> : null}
  </div>
);

export default function Modulo15() {
  const [pool, setPool] = useState([]);            // filas disponibles (detalle de pallet) de SAP
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [clientes, setClientes] = useState([]);
  const [cardCode, setCardCode] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorOV, setErrorOV] = useState(null); // { msg, verificar } si falló el envío a SAP
  const [vista, setVista] = useState("asignar"); // 'asignar' | 'ordenes'
  const [manifiestos, setManifiestos] = useState([]);
  const [cargandoM, setCargandoM] = useState(false);
  const [accionM, setAccionM] = useState(null); // id del manifiesto en proceso (enviar/cancelar)
  const [porEnviar, setPorEnviar] = useState(null); // manifiesto en el panel de confirmación
  const dlg = useDialog();
  const [addedIds, setAddedIds] = useState(() => new Set());   // detalles agregados a la OV
  const [selIds, setSelIds] = useState(() => new Set());       // detalles seleccionados en la lista
  const [filtro, setFiltro] = useState("");
  const [scanVal, setScanVal] = useState("");
  const [toast, setToast] = useState("");
  const anchor = useRef({ lastId: null, state: false });       // ancla para Shift+clic (por id, no índice)
  const visibleRef = useRef([]);                               // ids visibles en orden (para el rango)
  const scanRef = useRef(null);
  const toastT = useRef(null);

  const avisar = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await getPalletsDisponibles();
      setPool(Array.isArray(r?.pallets) ? r.pallets : []);
      setError("");
    } catch (e) {
      setError(e?.message || "No se pudieron cargar los pallets de SAP.");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => () => clearTimeout(toastT.current), []);
  useEffect(() => {
    getClientesVenta().then((r) => setClientes(Array.isArray(r?.value) ? r.value : [])).catch(() => {});
  }, []);

  // Lista visible: disponibles (no agregados) filtrados por texto o por rango de folios.
  const visibles = useMemo(() => {
    const rg = rango(filtro);
    const f = norm(filtro.trim());
    return pool
      .filter((p) => !addedIds.has(cid(p)))
      .filter((p) => {
        if (rg) return p.folio >= rg[0] && p.folio <= rg[1];
        return !f ||
          norm(p.folio).includes(f) || norm(p.pt).includes(f) || norm(p.lote).includes(f) ||
          norm(p.presentacion).includes(f) || norm(p.cultivoNombre).includes(f);
      });
  }, [pool, addedIds, filtro]);
  useEffect(() => { visibleRef.current = visibles.map(cid); }, [visibles]);

  const disponibles = useMemo(() => pool.filter((p) => !addedIds.has(cid(p))).length, [pool, addedIds]);
  const added = useMemo(() => pool.filter((p) => addedIds.has(cid(p))), [pool, addedIds]);
  const nSel = useMemo(() => [...selIds].filter((k) => !addedIds.has(k)).length, [selIds, addedIds]);

  // Agrupado como el AddOn: una línea de OV por (PT + lote + depto).
  const grupos = useMemo(() => {
    const m = new Map();
    for (const p of added) {
      const k = claveLinea(p);
      if (!m.has(k)) m.set(k, {
        key: k, pt: p.pt, nombre: p.presentacion, lote: p.lote, depto: p.depto,
        cultivo: p.cultivo, cultivoNombre: p.cultivoNombre, cultivoCod: p.cultivoCod,
        corregido: p.corregido, cajas: 0, pallets: [],
      });
      const g = m.get(k);
      g.cajas += Number(p.cajas) || 0;
      g.pallets.push(p);
    }
    return [...m.values()];
  }, [added]);

  const totCajas = useMemo(() => grupos.reduce((a, l) => a + l.cajas, 0), [grupos]);
  const totPallets = useMemo(() => new Set(added.map((p) => p.palletCode)).size, [added]);

  const cargarManifiestos = useCallback(async () => {
    setCargandoM(true);
    try {
      const r = await getManifiestos();
      setManifiestos(Array.isArray(r?.manifiestos) ? r.manifiestos : []);
    } catch { /* silencioso: la lista queda como estaba */ }
    finally { setCargandoM(false); }
  }, []);
  useEffect(() => { cargarManifiestos(); }, [cargarManifiestos]);

  // Arma las líneas del payload desde la vista previa agrupada.
  const lineasDePreview = useCallback(() => grupos.map((g) => {
    const p0 = g.pallets[0] || {};
    return {
      pt: g.pt, cajas: g.cajas, cultivo: g.cultivo, lote: g.lote, depto: g.depto,
      fraccion: p0.fraccion, unidadAduana: p0.unidadAduana, pesoKg: p0.pesoKg,
      pallets: g.pallets.map((p) => ({ palletCode: p.palletCode, palletDet: p.palletDet, folio: p.folio })),
    };
  }), [grupos]);

  // GUARDAR la OV como borrador EN LA APP (NO va a SAP). Aparece en "Órdenes de venta".
  const guardarOV = useCallback(async () => {
    if (!cardCode || !grupos.length || creando) return;
    setCreando(true);
    try {
      await guardarManifiesto({ cardCode, fecha, lineas: lineasDePreview() });
      setAddedIds(new Set());
      avisar("OV guardada — en la app, aún NO en SAP");
      cargar();              // recarga disponibles (los del borrador quedan reservados)
      await cargarManifiestos();
      setVista("ordenes");   // llévalo a la lista para que la vea guardada
    } catch (e) {
      avisar(e?.message || "No se pudo guardar la OV");
    } finally {
      setCreando(false);
    }
  }, [cardCode, grupos, fecha, creando, lineasDePreview, avisar, cargar, cargarManifiestos]);

  // MANDAR A SAP una OV guardada (crea la OV real + asignación + PATCH).
  const enviarM = useCallback(async (m) => {
    setAccionM(m.id);
    setErrorOV(null);
    try {
      const r = await enviarManifiestoSAP(m.id);
      avisar(`OV en SAP · #${r?.docNum}`);
      await cargarManifiestos();
      cargar();
    } catch (e) {
      // sinRespuesta (timeout/500/504) = NO sabemos si la OV se creó → verificar en SAP, no reintentar a ciegas.
      setErrorOV({ msg: e?.message || "No se pudo mandar a SAP.", verificar: !!e?.sinRespuesta });
      avisar(e?.sinRespuesta ? "Sin confirmación de SAP — revisa antes de reintentar" : (e?.message || "No se pudo mandar a SAP"));
    } finally {
      setAccionM(null);
    }
  }, [avisar, cargarManifiestos, cargar]);

  // Abre el panel de confirmación (muestra lo que se mandará). El envío real ocurre al confirmar.
  const pedirEnviar = useCallback((m) => setPorEnviar(m), []);
  const confirmarEnvio = useCallback(async () => {
    const m = porEnviar;
    if (!m) return;
    await enviarM(m);      // hace la escritura + refresca (maneja sus errores internamente)
    setPorEnviar(null);    // cierra el panel
  }, [porEnviar, enviarM]);

  const cancelarM = useCallback(async (m) => {
    const ok = await dlg.confirm({
      title: "Cancelar OV",
      message: `¿Borrar el borrador de OV de ${m.cardCode} (${m.cajas} cajas · ${m.nPallets} pallets)? Solo se borra de la app; no toca SAP.`,
      confirmText: "Sí, cancelar", danger: true,
    });
    if (!ok) return;
    setAccionM(m.id);
    try { await cancelarManifiesto(m.id); avisar("Borrador cancelado"); await cargarManifiestos(); cargar(); }
    catch (e) { avisar(e?.message || "No se pudo cancelar"); }
    finally { setAccionM(null); }
  }, [dlg, avisar, cargarManifiestos, cargar]);

  const nBorradores = useMemo(() => manifiestos.filter((m) => m.estado !== "enviada").length, [manifiestos]);

  // ── acciones sobre la OV ──
  const agregar = useCallback((ids, quiet) => {
    const nuevos = ids.filter((k) => !addedIds.has(k));
    if (!nuevos.length) { if (!quiet) avisar("Ese pallet ya está en la OV"); return 0; }
    setAddedIds((prev) => { const n = new Set(prev); nuevos.forEach((k) => n.add(k)); return n; });
    setSelIds((prev) => { const n = new Set(prev); nuevos.forEach((k) => n.delete(k)); return n; });
    return nuevos.length;
  }, [addedIds, avisar]);

  const agregarFolio = useCallback((folioRaw, quiet) => {
    const folio = parseInt(folioRaw, 10);
    const ids = pool.filter((p) => p.folio === folio).map(cid);
    if (!ids.length) { if (!quiet) avisar(`Folio ${folioRaw} no disponible`); return 0; }
    return agregar(ids, quiet);
  }, [pool, agregar, avisar]);

  const onScan = (e) => {
    if (e.key !== "Enter") return;
    const v = scanVal.trim(); if (!v) return;
    const rg = rango(v);
    if (rg) {
      const ids = pool.filter((p) => p.folio >= rg[0] && p.folio <= rg[1]).map(cid);
      const n = agregar(ids, true);
      avisar(n ? `Se agregaron ${n} pallets del rango` : "Ningún pallet en ese rango");
    } else {
      agregarFolio(v);
    }
    setScanVal("");
  };

  const quitarUno = (k) => setAddedIds((prev) => { const n = new Set(prev); n.delete(k); return n; });
  const quitarLinea = (key) => {
    const ids = added.filter((p) => claveLinea(p) === key).map(cid);
    setAddedIds((prev) => { const n = new Set(prev); ids.forEach((k) => n.delete(k)); return n; });
  };
  const vaciar = () => { setAddedIds(new Set()); avisar("OV vaciada"); };
  const agregarVisibles = () => { const n = agregar(visibles.map(cid), true); if (n) avisar(`Se agregaron ${n} pallets`); };
  const agregarSeleccion = () => {
    const n = agregar([...selIds].filter((k) => !addedIds.has(k)), true);
    setSelIds(new Set());
    if (n) avisar(`Se agregaron ${n} pallets`);
  };

  // ── selección con clic / Shift+clic (rango, seleccionar Y deseleccionar) ──
  const onRowClick = (e, key, idx) => {
    if (e.shiftKey && anchor.current.lastId != null) {
      const vis = visibleRef.current;
      const aIdx = vis.indexOf(anchor.current.lastId);
      if (aIdx >= 0) {
        const lo = Math.min(aIdx, idx), hi = Math.max(aIdx, idx);
        setSelIds((prev) => {
          const n = new Set(prev);
          for (let i = lo; i <= hi; i++) {
            const f = vis[i]; if (f == null) continue;
            if (anchor.current.state) n.add(f); else n.delete(f);
          }
          return n;
        });
        return;
      }
    }
    setSelIds((prev) => {
      const n = new Set(prev);
      const ahora = !n.has(key);
      if (ahora) n.add(key); else n.delete(key);
      anchor.current = { lastId: key, state: ahora };
      return n;
    });
  };

  const TabBtn = ({ id, icon: Icon, children, badge }) => (
    <button
      onClick={() => setVista(id)}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
        vista === id ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30" : "text-gray-500 hover:bg-gray-100"
      }`}
    >
      <Icon size={16} /> {children}
      {badge ? (
        <span className={`text-[11px] font-bold px-1.5 rounded-full ${vista === id ? "bg-white/25" : "bg-gray-200 text-gray-600"}`}>{badge}</span>
      ) : null}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Pestañas: armar la OV vs. la lista de OV creadas */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        <TabBtn id="asignar" icon={PackagePlus}>Asignar pallets</TabBtn>
        <TabBtn id="ordenes" icon={ListChecks} badge={nBorradores || undefined}>Órdenes de venta</TabBtn>
        <TabBtn id="embarques" icon={Truck}>Embarques</TabBtn>
      </div>

      {errorOV ? (
        <div className={`rounded-xl px-4 py-2.5 flex items-start justify-between gap-3 border ${
          errorOV.verificar ? "bg-amber-50 border-amber-300" : "bg-red-50 border-red-200"
        }`}>
          <span className={`text-sm font-semibold flex items-start gap-2 ${errorOV.verificar ? "text-amber-800" : "text-red-700"}`}>
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              {errorOV.msg}
              {errorOV.verificar ? <><br /><b>Verifica en SAP</b> si la OV ya se creó (busca una OV reciente de este cliente con estos pallets) ANTES de volver a intentar — la OV no se puede borrar.</> : null}
            </span>
          </span>
          <button onClick={() => setErrorOV(null)} className="p-1 rounded-md text-gray-500 hover:bg-black/5 shrink-0" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>
      ) : null}

      {vista === "embarques" ? (
        <EmbarquesLista />
      ) : vista === "ordenes" ? (
        <TableroEmbarques
          manifiestos={manifiestos} clientes={clientes} cargando={cargandoM} accionId={accionM}
          onEnviar={pedirEnviar} onCancelar={cancelarM} onRefrescar={cargarManifiestos}
        />
      ) : (
      <>
      {/* Barra de control: fecha + cliente + totales + Guardar OV */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
          <label className="flex flex-col gap-1.5">
            <span className="h-4 flex items-center text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Fecha</span>
            <div className="relative">
              <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="h-10 w-44 pl-9 pr-2 text-sm font-medium text-gray-800 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5 flex-1 min-w-[240px] max-w-md">
            <span className="h-4 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
              <span>Cliente</span>
              {clientes.length ? <span className="font-medium normal-case tracking-normal text-gray-300">{clientes.length} en SAP</span> : null}
            </span>
            <div className="relative">
              <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-gray-400 pointer-events-none" />
              <SearchSelect
                value={cardCode}
                onChange={setCardCode}
                options={clientes.map((c) => ({ value: c.CardCode, label: `${c.CardCode} · ${c.CardName}` }))}
                placeholder="Elige cliente…"
                className="h-10 w-full pl-9 pr-3 text-sm font-medium text-gray-800 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </label>
        </div>

        <div className="flex items-center gap-4 lg:pl-5 lg:border-l lg:border-gray-100 shrink-0">
          <Stat label="cajas" valor={totCajas} sub={`${totPallets} pallets · ${grupos.length} líneas`} />
          <button
            onClick={guardarOV}
            disabled={!grupos.length || !cardCode || creando}
            title={!cardCode ? "Elige un cliente" : !grupos.length ? "Agrega pallets" : "Guardar la OV en la app (se manda a SAP después)"}
            className={`h-11 inline-flex items-center gap-2 px-5 rounded-lg font-bold text-sm transition-colors ${
              !grupos.length || !cardCode || creando
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/30"
            }`}
          >
            {creando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {creando ? "Guardando…" : "Guardar OV"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ── Disponibles ── */}
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Pallets disponibles
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-semibold">{disponibles} sin asignar</span>
              <button onClick={cargar} title="Recargar de SAP" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-50">
                <RefreshCw size={15} className={cargando ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Escaneo */}
          <div className="px-4 pb-2">
            <div className="relative flex items-center">
              <ScanLine size={18} className="absolute left-3 text-emerald-600 pointer-events-none" />
              <input
                ref={scanRef} value={scanVal} inputMode="numeric" autoComplete="off"
                onChange={(e) => setScanVal(e.target.value)} onKeyDown={onScan}
                placeholder="Escanea o escribe el folio y Enter (o 25940-25960 para un rango)…"
                className="w-full font-mono text-[15px] font-semibold pl-11 pr-3 py-2.5 rounded-lg border-2 border-gray-200 bg-gray-50 focus:outline-none focus:border-emerald-500 focus:bg-white tabular-nums"
              />
            </div>
          </div>

          {/* Filtro */}
          <div className="px-4 pb-2">
            <div className="relative flex items-center">
              <Search size={15} className="absolute left-3 text-gray-400 pointer-events-none" />
              <input
                value={filtro} autoComplete="off"
                onChange={(e) => { setFiltro(e.target.value); anchor.current.lastId = null; }}
                placeholder="Filtrar por folio, PT, lote… o rango 25940-25960"
                className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="text-[11px] text-gray-400 mt-1.5 pl-1 font-medium">
              Clic para seleccionar · <b className="text-emerald-600">Shift+clic</b> = rango · rango de folios: <b className="text-emerald-600 font-mono">25940-25960</b>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-[52vh] overflow-y-auto px-2 pb-1">
            {cargando ? (
              <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Cargando pallets de SAP…
              </div>
            ) : error ? (
              <div className="py-10 px-4 text-center text-red-600 text-sm flex flex-col items-center gap-2">
                <AlertCircle size={20} /> {error}
                <button onClick={cargar} className="mt-1 text-xs font-semibold text-emerald-700 hover:underline">Reintentar</button>
              </div>
            ) : !visibles.length ? (
              <div className="py-10 text-center text-gray-400 text-sm">No hay pallets que coincidan.</div>
            ) : (
              visibles.map((p, i) => {
                const sel = selIds.has(cid(p));
                return (
                  <div
                    key={cid(p)} role="button" tabIndex={0} aria-pressed={sel}
                    onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                    onClick={(e) => onRowClick(e, cid(p), i)}
                    className={`grid grid-cols-[18px_1fr_auto_26px] gap-2.5 items-center px-2 py-1.5 rounded-lg cursor-pointer select-none border ${
                      sel ? "bg-emerald-50 border-emerald-300" : "border-transparent hover:bg-gray-50"
                    }`}
                  >
                    <span className={`w-[17px] h-[17px] rounded-[5px] grid place-items-center border-[1.7px] ${
                      sel ? "bg-emerald-600 border-emerald-600" : "border-gray-300"
                    }`}>
                      {sel ? <Check size={11} className="text-white" strokeWidth={3.5} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                        <span className="font-mono font-semibold text-[13.5px] text-gray-800">{p.folio}</span>
                        <span className="font-mono font-extrabold text-[12.5px] text-gray-700">{p.pt}</span>
                        <span className="text-[11.5px] text-gray-500 font-semibold">· Lote {p.lote}</span>
                      </span>
                      <span className="block text-[10.5px] text-gray-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis mt-px">
                        <b className="text-emerald-600 font-bold">Cultivo {p.cultivoCod || "—"} {p.cultivoNombre || p.cultivo || ""}</b>
                        {" · "}{p.presentacion}{" · "}{p.fecha}{p.agricultor ? " · " + p.agricultor : ""}{p.tag ? " · #" + p.tag : ""}
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-[13px] text-gray-500 text-right tabular-nums">{p.cajas}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); agregar([cid(p)]); }}
                      title={`Agregar ${p.folio}`}
                      className="w-[22px] h-[22px] rounded-md grid place-items-center text-gray-400 hover:bg-emerald-600 hover:text-white text-base font-bold"
                    >+</button>
                  </div>
                );
              })
            )}
          </div>

          {/* Barra de selección */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <span className="text-[12.5px] font-bold text-gray-500">
              {nSel ? <><b className="text-emerald-600">{nSel}</b> seleccionados</> : `${visibles.length} visible${visibles.length === 1 ? "" : "s"}`}
            </span>
            <div className="flex gap-2">
              <button onClick={agregarVisibles} disabled={!visibles.length}
                className="text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                Agregar visibles
              </button>
              <button onClick={agregarSeleccion} disabled={!nSel}
                className="text-[13px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
                {nSel ? `Agregar selección (${nSel})` : "Agregar selección"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Vista previa OV ── */}
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Orden de venta · vista previa
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-semibold">
                {grupos.length ? `${grupos.length} línea${grupos.length > 1 ? "s" : ""} · ${totPallets} pallets` : "vacía"}
              </span>
              {grupos.length ? (
                <button onClick={vaciar} className="text-xs font-bold text-red-500 hover:bg-red-50 px-2 py-1 rounded-md">Vaciar</button>
              ) : null}
            </div>
          </div>

          <div className="max-h-[64vh] overflow-y-auto px-3 pb-3">
            {!grupos.length ? (
              <div className="py-14 px-6 text-center text-gray-400 text-sm">
                <Package size={32} className="mx-auto mb-2 text-gray-300" />
                Escanea, toca o selecciona pallets.<br />Se agrupan solos por producto, lote y departamento.
              </div>
            ) : (
              grupos.map((l) => (
                <div key={l.key} className="border border-gray-200 rounded-lg my-2 bg-gray-50 overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-mono font-extrabold text-[14.5px] text-gray-800">{l.pt}</span>
                      <span className="text-xs text-gray-500 font-semibold truncate">{l.nombre}</span>
                    </div>
                    <div className="text-right leading-none">
                      <div className="font-mono font-bold text-[17px] text-gray-800 tabular-nums">{l.cajas}</div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">cajas</div>
                    </div>
                    <button onClick={() => quitarLinea(l.key)} title="Quitar toda la línea"
                      className="w-[26px] h-[26px] rounded-md grid place-items-center text-gray-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                      Cultivo <b>{l.cultivoCod ? l.cultivoCod + " " : ""}{l.cultivoNombre || l.cultivo}</b>
                      {l.corregido ? <span className="text-amber-600 font-bold" title="El artículo tenía el código mal; se tomó de la orden de fabricación">⚠ de OF</span> : null}
                    </span>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Lote <b className="text-gray-800">{l.lote}</b></span>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Depto <b className="text-gray-800">{l.depto || "—"}</b></span>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">{l.pallets.length} pallet{l.pallets.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 px-2.5 py-2 border-t border-gray-200">
                    {l.pallets.map((p) => (
                      <span key={cid(p)} className="font-mono text-[11px] font-medium bg-white border border-gray-200 rounded pl-1.5 pr-0.5 py-px inline-flex items-center gap-0.5 text-gray-500">
                        {p.folio}
                        <button onClick={() => quitarUno(cid(p))} title={`Quitar ${p.folio}`}
                          className="w-[15px] h-[15px] rounded grid place-items-center text-gray-400 hover:bg-red-50 hover:text-red-500 text-xs leading-none">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      </>
      )}

      {/* Panel de confirmación antes de mandar a SAP */}
      {porEnviar ? (
        <ConfirmarEnvioSAP
          m={porEnviar}
          cliente={clientes.find((c) => c.CardCode === porEnviar.cardCode)?.CardName || porEnviar.cardCode}
          enviando={accionM === porEnviar.id}
          onConfirm={confirmarEnvio}
          onCancel={() => setPorEnviar(null)}
        />
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-lg font-semibold text-[13.5px] shadow-lg z-50 flex items-center gap-2">
          <Check size={16} className="text-emerald-400" /> {toast}
        </div>
      ) : null}
    </div>
  );
}
