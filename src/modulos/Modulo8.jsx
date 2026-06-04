import { useState } from "react";
import { useDatos } from "../store/datos";
import SearchSelect from "../components/SearchSelect";

let nextMovId = 1;
let nextLineaId = 500;
let nextSubId = 500;
let nextCargaId = 500;
let nextUbiId = 500;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Modulo8() {
  const { movimientos, setMovimientos, cargaCampo, setCargaCampo, ubicaciones, setUbicaciones, lineas, setLineas } = useDatos();

  const [modal, setModal] = useState(false);
  const [catCarga, setCatCarga] = useState(false);
  const [catUbic, setCatUbic] = useState(false);
  const [verMov, setVerMov] = useState(null);

  // modos "nuevo" en la ficha
  const [lineaNueva, setLineaNueva] = useState(false);
  const [choferNuevo, setChoferNuevo] = useState(false);
  const [tractoNuevo, setTractoNuevo] = useState(false);
  const [cajaNueva, setCajaNueva] = useState(false);

  const formVacio = {
    folio: "", fecha: hoyISO(), viaje: "",
    rancho: "", lote: "", horaInicio: "", horaTermino: "", responsableCosecha: "",
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

  const abrirNuevo = () => { setForm(formVacio); resetModos(); setModal(true); };

  const lineaSel = lineas.find((l) => l.linea === form.linea);

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
        lineasActualizadas = [...lineasActualizadas, { id: "LN_" + nextLineaId++, linea: form.linea.trim(), contacto: form.contacto || "", numero: form.numero || "", choferes: [], tractos: [], cajas: [] }];
      }
    }
    const idxL = lineasActualizadas.findIndex((l) => l.linea.toLowerCase() === (form.linea || "").trim().toLowerCase());
    if (idxL >= 0) {
      const L = { ...lineasActualizadas[idxL] };
      L.choferes = [...(L.choferes || [])]; L.tractos = [...(L.tractos || [])]; L.cajas = [...(L.cajas || [])];
      if (choferNuevo && (form.chofer || "").trim() && !L.choferes.some((c) => c.nombre.toLowerCase() === form.chofer.trim().toLowerCase()))
        L.choferes.push({ id: "CH_" + nextSubId++, nombre: form.chofer.trim(), telefono: form.telefono || "", licencia: form.licencia || "" });
      if (tractoNuevo && (form.placaTracto || "").trim() && !L.tractos.some((t) => t.placa.toLowerCase() === form.placaTracto.trim().toLowerCase()))
        L.tractos.push({ id: "TR_" + nextSubId++, marcaModelo: form.marcaModelo || "", placa: form.placaTracto.trim() });
      if (cajaNueva && (form.placaCaja || "").trim() && !L.cajas.some((c) => c.placa.toLowerCase() === form.placaCaja.trim().toLowerCase()))
        L.cajas.push({ id: "CJ_" + nextSubId++, economico: form.economicoCaja || "", placa: form.placaCaja.trim() });
      lineasActualizadas = lineasActualizadas.map((l, i) => (i === idxL ? L : l));
    }
    if (lineasActualizadas !== lineas) setLineas(lineasActualizadas);

    const mov = { ...form, id: nextMovId++, creado: new Date().toLocaleString("es-MX") };
    setMovimientos((prev) => [mov, ...prev]);
    setModal(false);
    resetModos();
  };

  const borrarMov = (id) => { if (window.confirm("¿Eliminar este movimiento?")) setMovimientos((prev) => prev.filter((m) => m.id !== id)); };

  // ── Editores de catálogos ──
  const updCarga = (id, val) => setCargaCampo((prev) => prev.map((c) => c.id === id ? { ...c, label: val } : c));
  const addCarga = () => setCargaCampo((prev) => [...prev, { id: "CC_" + nextCargaId++, label: "Nuevo tipo" }]);
  const delCarga = (id) => setCargaCampo((prev) => prev.filter((c) => c.id !== id));

  const updUbic = (tipo, id, val) => setUbicaciones((prev) => ({ ...prev, [tipo]: prev[tipo].map((u) => u.id === id ? { ...u, nombre: val } : u) }));
  const addUbic = (tipo) => setUbicaciones((prev) => ({ ...prev, [tipo]: [...prev[tipo], { id: "U_" + nextUbiId++, nombre: tipo === "origenes" ? "Nuevo rancho" : "Nuevo empaque" }] }));
  const delUbic = (tipo, id) => setUbicaciones((prev) => ({ ...prev, [tipo]: prev[tipo].filter((u) => u.id !== id) }));

  const INP = "w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 bg-white";
  const INP_TBL = "w-full text-sm px-2 py-1 border border-gray-200 focus:border-blue-400 rounded-md focus:outline-none";
  const LBL = "text-xs text-gray-500 block mb-0.5";

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
          <button onClick={() => setCatCarga(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">📦 Catálogo de carga</button>
          <button onClick={() => setCatUbic(true)} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">📍 Ranchos / Empaques</button>
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">OS</div>
          <span className="text-sm font-medium text-gray-700">Oscar</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-900">Movimientos registrados ({movimientos.length})</span>
          <button onClick={abrirNuevo} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700">+ Nuevo movimiento</button>
        </div>
        {movimientos.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8 italic">Sin movimientos. Registra el primero con "+ Nuevo movimiento".</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "900px" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Folio</th>
                  <th className="text-left px-3 py-2 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium">Rancho</th>
                  <th className="text-left px-3 py-2 font-medium">Origen → Destino</th>
                  <th className="text-left px-3 py-2 font-medium">Línea / Chofer</th>
                  <th className="text-right px-3 py-2 font-medium">Parrillas</th>
                  <th className="text-right px-3 py-2 font-medium">Bultos</th>
                  <th className="text-right px-3 py-2 font-medium">Flete</th>
                  <th className="text-right px-3 py-2 font-medium">$/lb</th>
                  <th className="text-center px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const par = m.cargaItems.reduce((a, it) => a + (parseFloat(it.parrillas) || 0), 0);
                  const bul = m.cargaItems.reduce((a, it) => a + (parseFloat(it.bultos) || 0), 0);
                  const flete = parseFloat(m.flete) || 0;
                  const libras = parseFloat(m.pesoBascula) || 0;
                  const costoLb = flete > 0 && libras > 0 ? flete / libras : 0;
                  return (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-bold text-red-600">{m.folio || "—"}</td>
                      <td className="px-3 py-2 font-semibold text-gray-700">{m.fecha || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{m.rancho || "—"}{m.lote ? ` · ${m.lote}` : ""}</td>
                      <td className="px-3 py-2 text-gray-600">{m.origen || "—"} → {m.destino || "—"}</td>
                      <td className="px-3 py-2 text-gray-700"><div className="font-medium">{m.linea || "—"}</div><div className="text-gray-400">{m.chofer || "—"}</div></td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{par || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">{bul ? bul.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{flete ? "$" + flete.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-700">{costoLb ? "$" + costoLb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/lb" : "—"}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button onClick={() => setVerMov(m)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 mr-1">👁️ Ver</button>
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
              <div className="text-sm font-semibold text-gray-900">Nuevo movimiento — Manifiesto de carga nacional</div>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-5">

              {/* Encabezado del viaje */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos del viaje</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={LBL}>Folio</label><input className={INP} value={form.folio} onChange={(e) => setForm((f) => ({ ...f, folio: e.target.value }))} placeholder="No. 0203" /></div>
                  <div><label className={LBL}>Fecha</label><input type="date" className={INP} value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} /></div>
                  <div><label className={LBL}>Viaje (zona)</label><input className={INP} value={form.viaje} onChange={(e) => setForm((f) => ({ ...f, viaje: e.target.value }))} placeholder="San Quintín, B.C." /></div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label className={LBL}>Rancho</label>
                    <input className={INP} list="dl-origenes" value={form.rancho} onChange={(e) => setForm((f) => ({ ...f, rancho: e.target.value }))} placeholder="Rancho / campo" />
                    <datalist id="dl-origenes">{ubicaciones.origenes.map((o) => <option key={o.id} value={o.nombre} />)}</datalist>
                  </div>
                  <div><label className={LBL}>Lote</label><input className={INP} value={form.lote} onChange={(e) => setForm((f) => ({ ...f, lote: e.target.value }))} placeholder="Paredes" /></div>
                  <div><label className={LBL}>Responsable cosecha</label><input className={INP} value={form.responsableCosecha} onChange={(e) => setForm((f) => ({ ...f, responsableCosecha: e.target.value }))} /></div>
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
                  <div><label className={LBL}>Consignado</label><input className={INP} value={form.consignado} onChange={(e) => setForm((f) => ({ ...f, consignado: e.target.value }))} placeholder="SL Agrícola SA de CV" /></div>
                  <div><label className={LBL}>Distribuidor</label><input className={INP} value={form.distribuidor} onChange={(e) => setForm((f) => ({ ...f, distribuidor: e.target.value }))} placeholder="SL Agrícola SA de CV" /></div>
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
                <div className="border border-gray-200 rounded-lg overflow-hidden">
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
                <div><label className={LBL}>Peso de báscula</label><input className={INP} value={form.pesoBascula} onChange={(e) => setForm((f) => ({ ...f, pesoBascula: e.target.value }))} placeholder="kg / lb" /></div>
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
              <button onClick={() => setModal(false)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={guardar} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Guardar movimiento</button>
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
                  ["Fecha", verMov.fecha], ["Viaje", verMov.viaje], ["Rancho", verMov.rancho],
                  ["Lote", verMov.lote], ["Inicio cosecha", verMov.horaInicio], ["Término cosecha", verMov.horaTermino],
                  ["Resp. cosecha", verMov.responsableCosecha], ["Consignado", verMov.consignado], ["Distribuidor", verMov.distribuidor],
                  ["Origen", verMov.origen], ["Destino", verMov.destino], ["Remisión", verMov.remision],
                  ["Peso báscula", verMov.pesoBascula],
                ].map(([l, v]) => (
                  <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
                ))}
              </div>
              <div>
                <div className="text-gray-400 mb-1 font-medium uppercase">Carga</div>
                <table className="w-full">
                  <thead><tr className="text-gray-400"><th className="text-left py-1">Producto</th><th className="text-right py-1">Parrillas</th><th className="text-right py-1">Bultos</th></tr></thead>
                  <tbody>
                    {verMov.cargaItems.map((it, i) => (
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
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-900">Ranchos / Empaques</div>
              <button onClick={() => setCatUbic(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2">📍 Orígenes (ranchos)</div>
                {ubicaciones.origenes.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 mb-2">
                    <input value={o.nombre} onChange={(e) => updUbic("origenes", o.id, e.target.value)} className={INP_TBL} />
                    <button onClick={() => delUbic("origenes", o.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                  </div>
                ))}
                <button onClick={() => addUbic("origenes")} className="mt-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium">+ Agregar rancho</button>
              </div>
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
    </div>
  );
}