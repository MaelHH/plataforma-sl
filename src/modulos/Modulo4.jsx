import { useState } from "react";
import { useDatos, TOTAL, CAT_VACIO, EMPRESAS, DC, nuevoId } from "../store/datos";
import SearchSelect from "../components/SearchSelect";
import ColaTabs from "../components/ColaTabs";

const FRONTAL_FIELDS = [
  { id: "temp_antes", label: "Temp. antes de carga", icon: "🌡️" },
  { id: "temp_despues", label: "Temp. después de carga", icon: "🌡️" },
  { id: "sello", label: "Sello de carga", icon: "🔒" },
  { id: "placa_trailer", label: "Placas del trailer", icon: "🚛" },
  { id: "placa_caja", label: "Placas de la caja", icon: "📦" },
  { id: "economico", label: "Económico de la caja", icon: "🔢" },
  { id: "tive", label: "TIVE", icon: "🛰️" },
];

export default function Modulo4() {
  const { trailers, setTrailers, cargasEmbarques, setCargasEmbarques, catalogo } = useDatos();
  const CATALOGO = [CAT_VACIO, ...catalogo];
  const [tabM4, setTabM4] = useState("preparar"); // preparar | enviados
  const [trailerSel, setTrailerSel] = useState(null);
  const [cargaPhotos, setCargaPhotos] = useState(Array(TOTAL).fill(null));
  const [frontalPhotos, setFrontalPhotos] = useState({});
  const [activePhoto, setActivePhoto] = useState(null);
  const [enviado, setEnviado] = useState(false);
  const [consolidado, setConsolidado] = useState(false);
  const [empresasSel, setEmpresasSel] = useState([]);
  const [distEmpresas, setDistEmpresas] = useState({});

  const disponibles = trailers.filter((t) => t.status === "en_instalaciones");

  const selectTrailer = (t) => {
    setTrailerSel(t);
    setCargaPhotos(Array(TOTAL).fill(null));
    setFrontalPhotos({});
    setConsolidado(false);
    setEmpresasSel([]);
    setDistEmpresas({});
    setEnviado(false);
  };

  const resetTodo = () => {
    setTrailerSel(null);
    setCargaPhotos(Array(TOTAL).fill(null));
    setFrontalPhotos({});
    setConsolidado(false);
    setEmpresasSel([]);
    setDistEmpresas({});
    setEnviado(false);
  };

  const confirmPhoto = () => {
    if (!activePhoto) return;
    const { type, index } = activePhoto;
    if (type === "carga") setCargaPhotos((p) => { const n = [...p]; n[index] = "photo"; return n; });
    if (type === "frontal") setFrontalPhotos((p) => ({ ...p, [index]: "photo" }));
    setActivePhoto(null);
  };

  const cargaFilled = cargaPhotos.filter(Boolean).length;
  const frontalFilled = Object.keys(frontalPhotos).length;

  const enviar = () => {
    const nueva = {
      id: nuevoId("CARGA_"),
      fecha: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      trailer: { ...trailerSel },
      consolidado,
      empresasSel: [...empresasSel],
      distEmpresas: JSON.parse(JSON.stringify(distEmpresas)),
      cargaFotos: cargaFilled,
      frontalFotos: frontalFilled,
      sapStatus: "pendiente",
    };
    setCargasEmbarques((prev) => [nueva, ...prev]);
    setTrailers((prev) => prev.map((t) => (t.id === trailerSel.id ? { ...t, status: "en_ruta" } : t)));
    setEnviado(true);
  };

  // Grid de fotos de carga (zigzag 1,2,3,4...)
  function cargaGrid() {
    const filled = cargaPhotos.filter(Boolean).length;
    const renderRow = (offset) =>
      Array.from({ length: 15 }, (_, i) => {
        const idx = offset + i;
        const has = cargaPhotos[idx];
        const isFront = i === 0;
        return (
          <div key={idx} onClick={() => setActivePhoto({ type: "carga", index: idx })}
            className={`h-11 border-2 rounded-md flex items-center justify-center cursor-pointer relative ${has ? "border-green-400 bg-green-50" : isFront ? "border-blue-300 bg-blue-50 hover:bg-blue-100" : "border-dashed border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"}`}>
            {isFront && !has && <span className="absolute text-xs font-bold text-blue-200">Frente</span>}
            {has ? <span className="text-sm">📷</span> : !isFront && <span className="text-gray-300 text-base">+</span>}
          </div>
        );
      });
    return (
      <div className="bg-white border-2 border-blue-200 rounded-xl overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-blue-200 bg-blue-50 flex items-center justify-between">
          <span className="text-xs font-bold text-blue-700">Evidencia de carga · {filled}/30 fotos</span>
          <span className="text-xs font-semibold text-blue-700">{Math.round((filled / TOTAL) * 100)}%</span>
        </div>
        <div className="p-2">
          <div className="grid gap-1 mb-0.5" style={{ gridTemplateColumns: "repeat(15,minmax(0,1fr))" }}>
            {Array.from({ length: 15 }, (_, i) => <div key={i} className={`text-center text-xs font-medium ${i === 0 ? "text-blue-600" : "text-gray-400"}`}>{i * 2 + 1}</div>)}
          </div>
          <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: "repeat(15,minmax(0,1fr))" }}>{renderRow(0)}</div>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(15,minmax(0,1fr))" }}>{renderRow(15)}</div>
          <div className="grid gap-1 mt-0.5" style={{ gridTemplateColumns: "repeat(15,minmax(0,1fr))" }}>
            {Array.from({ length: 15 }, (_, i) => <div key={i} className={`text-center text-xs font-medium ${i === 0 ? "text-blue-600" : "text-gray-400"}`}>{i * 2 + 2}</div>)}
          </div>
        </div>
      </div>
    );
  }

  // Grid de distribución de productos
  function parrillaGrid({ key, title, color, border, data, onChange, blockedIdxs = [] }) {
    const asig = data.filter((p) => p.prod).length;
    const totalCajas = data.reduce((a, p) => { const c = CATALOGO.find((x) => x.id === p.prod); return a + (c?.cajasPorParrilla || 0); }, 0);    
    const renderCol = (start, parrFn) =>
      Array.from({ length: 15 }, (_, i) => {
        const idx = start + i, parrNum = parrFn(i);
        const p = data[idx], cat = CATALOGO.find((c) => c.id === p.prod);
        const blocked = blockedIdxs.includes(idx);
        const isFront = parrNum <= 2;
        return (
          <div key={idx} className={`flex items-center gap-1.5 py-1 border-b border-gray-100 ${blocked ? "opacity-30" : ""}`}>
            <div className={`w-6 text-center text-xs font-bold ${isFront ? "text-blue-500" : "text-gray-500"}`}>{parrNum}{isFront ? "🚛" : ""}</div>
            <SearchSelect value={p.prod} disabled={blocked}
              onChange={(v) => { const n = [...data]; n[idx] = { ...n[idx], prod: v }; onChange(n); }}
              className={`flex-1 text-xs px-1.5 py-1 rounded-md border ${blocked ? "bg-gray-100 border-gray-200 cursor-not-allowed text-gray-400" : ""} ${!blocked && p.prod && cat ? cat.color + " border-transparent" : "bg-white border-gray-200 text-gray-400"}`}
              options={CATALOGO.map((c) => ({ value: c.id, label: c.label }))} />
            <div className={`w-14 text-center text-xs font-semibold rounded px-1 py-1 ${!blocked && cat && p.prod ? "bg-gray-100 text-gray-700" : "text-gray-300"}`}>{!blocked && cat && p.prod ? cat.cajasPorParrilla + " cjs" : "—"}</div>
          </div>
        );
      });
    return (
      <div key={key} className={`bg-white border-2 rounded-xl overflow-hidden mb-4 ${border}`}>
        <div className={`px-3 py-2 border-b flex items-center justify-between ${color}`}>
          <span className="text-xs font-bold text-gray-800">{title}</span>
          <span className="text-xs text-gray-600">{asig}/30 · {totalCajas.toLocaleString()} cjs</span>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
            <span className="font-medium text-blue-500">← Frente (parrillas 1 y 2)</span>
            <span className="ml-auto">Trasera →</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <div><div className="text-xs text-gray-400 mb-1 text-center font-medium">Impares</div>{renderCol(0, (i) => i * 2 + 1)}</div>
            <div><div className="text-xs text-gray-400 mb-1 text-center font-medium">Pares</div>{renderCol(15, (i) => i * 2 + 2)}</div>
          </div>
        </div>
      </div>
    );
  }

  // Sección empresa / consolidado
  function consolidadoSection() {
    const ocupadas = {};
    empresasSel.forEach((eid) => { (distEmpresas[eid] || []).forEach((p, idx) => { if (p.prod) ocupadas[idx] = eid; }); });
    const toggleEmpresa = (eid) => {
      setEmpresasSel((prev) => {
        if (prev.includes(eid)) { const next = prev.filter((e) => e !== eid); setDistEmpresas((d) => { const n = { ...d }; delete n[eid]; return n; }); if (next.length <= 1) setConsolidado(false); return next; }
        if (!consolidado && prev.length >= 1) return prev;
        if (prev.length >= 3) return prev;
        setDistEmpresas((d) => ({ ...d, [eid]: Array(TOTAL).fill({ prod: "", cajas: "" }) }));
        return [...prev, eid];
      });
    };
    const updEmpresa = (eid, nd) => setDistEmpresas((prev) => ({ ...prev, [eid]: nd }));
    const COLORS = { SL_AGR: "bg-green-50", CAT: "bg-blue-50", CACO: "bg-purple-50" };
    const BORDERS = { SL_AGR: "border-green-200", CAT: "border-blue-200", CACO: "border-purple-200" };
    return (
      <div className="mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Paso 1 — ¿De qué empresa es esta carga?</div>
          <div className="text-xs text-gray-400 mb-3">Selecciona una. Si lleva varias empresas, activa "Consolidado".</div>
          <div className="flex gap-2 flex-wrap">
            {EMPRESAS.map((e) => {
              const sel = empresasSel.includes(e.id);
              const maxed = !sel && !consolidado && empresasSel.length >= 1;
              return (
                <button key={e.id} onClick={() => !maxed && toggleEmpresa(e.id)}
                  className={`text-sm px-4 py-2 rounded-lg border-2 font-semibold ${maxed ? "opacity-25 cursor-not-allowed border-gray-200 bg-white text-gray-400" : sel ? e.border + " " + e.color : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"}`}>
                  {sel ? "✓ " : ""}{e.label}
                </button>
              );
            })}
          </div>
          {empresasSel.length >= 1 && (
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100">
              <input type="checkbox" id="chk" checked={consolidado} onChange={(e) => { setConsolidado(e.target.checked); if (!e.target.checked && empresasSel.length > 1) { const f = empresasSel[0]; setEmpresasSel([f]); setDistEmpresas((d) => { const n = {}; if (d[f]) n[f] = d[f]; return n; }); } }} className="w-4 h-4 accent-blue-600" />
              <label htmlFor="chk" className="text-sm font-medium text-gray-800 cursor-pointer">¿Viene consolidado? <span className="font-normal text-gray-400 text-xs">— más de una empresa</span></label>
            </div>
          )}
        </div>
        {empresasSel.length === 0 && <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center text-sm text-gray-400">Selecciona una empresa arriba para asignar la distribución</div>}
        {empresasSel.map((eid) => {
          const emp = EMPRESAS.find((e) => e.id === eid);
          const data = distEmpresas[eid] || Array(TOTAL).fill({ prod: "", cajas: "" });
          const blocked = consolidado ? Array.from({ length: TOTAL }, (_, idx) => (ocupadas[idx] && ocupadas[idx] !== eid ? idx : -1)).filter((x) => x >= 0) : [];
          return parrillaGrid({ key: eid, title: `Distribución — ${emp.label}`, color: COLORS[eid], border: BORDERS[eid], data, onChange: (d) => updEmpresa(eid, d), blockedIdxs: blocked });
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
<h1 className="text-base font-semibold text-gray-900">Evidencias de Carga</h1>
          <p className="text-sm text-gray-500 mt-0.5">Francisco Flores · fotos y distribución del trailer</p>        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">FF</div>
          <span className="text-sm font-medium text-gray-700">Francisco</span>
        </div>
      </div>

      <ColaTabs tab={tabM4} setTab={setTabM4} tabs={[
        { key: "preparar", label: "Preparar", count: disponibles.length },
        { key: "enviados", label: "Enviados", count: cargasEmbarques.length },
      ]} />

      {tabM4 === "enviados" ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-900">Cargas enviadas a Embarques ({cargasEmbarques.length})</span>
          </div>
          {cargasEmbarques.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8 italic">Aún no has enviado cargas a Embarques.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "720px" }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <th className="text-left px-3 py-2 font-medium">Enviado</th>
                    <th className="text-left px-3 py-2 font-medium">Destino</th>
                    <th className="text-left px-3 py-2 font-medium">Línea / Chofer</th>
                    <th className="text-right px-3 py-2 font-medium">Fotos carga</th>
                    <th className="text-right px-3 py-2 font-medium">Fotos frontales</th>
                    <th className="text-center px-3 py-2 font-medium">SAP</th>
                  </tr>
                </thead>
                <tbody>
                  {cargasEmbarques.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600">{c.fecha}</td>
                      <td className="px-3 py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${DC[c.trailer?.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{c.trailer?.dest || "—"}</span></td>
                      <td className="px-3 py-2 text-gray-700"><div className="font-medium">{c.trailer?.linea || "—"}</div><div className="text-gray-400">{c.trailer?.chofer || "—"}</div></td>
                      <td className="px-3 py-2 text-right">{c.cargaFotos ?? 0}/30</td>
                      <td className="px-3 py-2 text-right">{c.frontalFotos ?? 0}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${c.sapStatus === "cargado" ? "bg-green-100 text-green-700 border-green-200" : "bg-orange-100 text-orange-700 border-orange-200"}`}>{c.sapStatus === "cargado" ? "✓ Cargado" : "⏳ Pendiente"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase mb-3">
          Seleccionar trailer en instalaciones
          {disponibles.length === 0 && !enviado && <span className="ml-2 font-normal text-orange-600 normal-case">— Mónica aún no pone ninguno</span>}
          {enviado && <span className="ml-2 font-normal text-green-600 normal-case">— carga enviada ✓</span>}
        </div>
        {disponibles.length === 0 ? (
          <div className="text-xs text-gray-400 italic text-center py-3">Cuando Mónica marque "En instalaciones" aparecerá aquí</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {disponibles.map((t) => {
              const sel = trailerSel?.id === t.id;
              return (
                <div key={t.id} onClick={() => selectTrailer(t)} className={`border-2 rounded-xl p-3 cursor-pointer ${sel ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[t.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{t.dest || "Sin destino"}</span>
                    {sel && <span className="text-xs text-blue-600 font-bold">✓ Seleccionado</span>}
                  </div>
                  <div className="text-xs text-gray-700 font-medium">{t.linea || "Sin línea"}</div>
                  <div className="text-xs text-gray-500">{t.chofer || "Sin chofer"}</div>
                  <div className="text-xs font-mono text-gray-600">{t.placaTracto || "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!trailerSel && disponibles.length > 0 && !enviado && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center text-sm text-gray-400">
          👆 Selecciona un trailer para cargar evidencias y distribución
        </div>
      )}

      {enviado && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-sm font-semibold text-green-800 mb-1">Información enviada a Embarques</div>
          <div className="text-xs text-green-600 mb-4">Daniel y Cristina ya pueden verla y registrarla en SAP</div>
          <button onClick={resetTodo} className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700">Preparar siguiente trailer</button>
        </div>
      )}

      {trailerSel && !enviado && (
        <div>
<div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <div className="text-xs font-semibold text-blue-700 uppercase mb-3">Datos del trailer — pre-llenados de Mónica</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                ["Fecha", trailerSel.fecha],
                ["Origen", trailerSel.origen],
                ["Destino", trailerSel.dest],
                ["Línea", trailerSel.linea],
                ["Contacto", trailerSel.contacto],
                ["Número línea", trailerSel.numero],
                ["Chofer", trailerSel.chofer],
                ["Teléfono", trailerSel.telefono],
                ["Licencia", trailerSel.licencia],
                ["Marca/Modelo tracto", trailerSel.marcaModelo],
                ["Placas tracto", trailerSel.placaTracto],
                ["Económico caja", trailerSel.economicoCaja],
                ["Placas caja", trailerSel.placaCaja],
                ["Flete", trailerSel.flete ? "$" + trailerSel.flete : ""],              ].map(([l, v]) => (
                <div key={l}><div className="text-blue-600 font-medium mb-0.5">{l}</div><div className="text-gray-800 font-semibold">{v || "—"}</div></div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
{[{ l: "Fotos carga", v: `${cargaFilled}/30`, c: "text-blue-700" }, { l: "Fotos frontales", v: `${frontalFilled}/${FRONTAL_FIELDS.length}`, c: "text-purple-700" }, { l: "Empresas", v: empresasSel.length, c: "text-green-700" }].map((s, i) => (              <div key={i} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5"><div className="text-xs text-gray-500 mb-1">{s.l}</div><div className={`text-lg font-semibold ${s.c}`}>{s.v}</div></div>
            ))}
          </div>

          {/* Frontal */}
          <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-purple-500"></div><span className="text-sm font-semibold text-gray-800">Parte frontal del trailer</span></div>
          <div className="bg-white border border-purple-200 rounded-xl p-3 mb-5">
            <div className="grid grid-cols-3 gap-3">
              {FRONTAL_FIELDS.map((f) => (
                <div key={f.id} onClick={() => setActivePhoto({ type: "frontal", index: f.id })}
                  className={`border-2 rounded-xl p-3 cursor-pointer flex flex-col items-center justify-center gap-1 ${frontalPhotos[f.id] ? "border-green-400 bg-green-50" : "border-dashed border-gray-300 bg-gray-50 hover:border-purple-400"}`} style={{ minHeight: "72px" }}>
                  <span className="text-2xl">{frontalPhotos[f.id] ? "📷" : f.icon}</span>
                  <span className="text-xs font-medium text-center text-gray-700">{f.label}</span>
                  {frontalPhotos[f.id] ? <span className="text-xs text-green-600 font-semibold">✓ Con foto</span> : <span className="text-xs text-gray-400">Toca para subir</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-sm font-semibold text-gray-800">Interior — 30 parrillas</span></div>
          {cargaGrid()}
          {consolidadoSection()}

          <div className="flex items-center justify-end mt-4">
            <button onClick={enviar} className="bg-green-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-green-700">↗ Enviar a Embarques</button>
          </div>
        </div>
      )}

        </>
      )}

      {/* Modal cámara */}
      {activePhoto !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="bg-gray-900 h-44 flex flex-col items-center justify-center gap-2">
              <span className="text-4xl">📷</span>
              <span className="text-gray-400 text-sm">
                {activePhoto.type === "carga" && `Carga · Parrilla ${activePhoto.index + 1}`}
                {activePhoto.type === "frontal" && FRONTAL_FIELDS.find((f) => f.id === activePhoto.index)?.label}
              </span>
              <span className="text-gray-600 text-xs">Simulación — en producción abre la cámara</span>
            </div>
            <div className="px-5 py-4 flex gap-2 justify-end">
              <button onClick={() => setActivePhoto(null)} className="text-xs px-4 py-2 border border-gray-200 rounded-lg text-gray-600">Cancelar</button>
              <button onClick={confirmPhoto} className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">✓ Confirmar foto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
