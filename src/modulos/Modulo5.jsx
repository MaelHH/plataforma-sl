import { useState } from "react";
import { useDatos, CAT_VACIO, EMPRESAS, DC } from "../store/datos";
import ColaTabs from "../components/ColaTabs";

export default function Modulo5() {
  const { cargasEmbarques, setCargasEmbarques, setTrailers, catalogo } = useDatos();
  const CATALOGO = [CAT_VACIO, ...catalogo];
  const [cargaSel, setCargaSel] = useState(null);

  const toggleSap = (id) =>
    setCargasEmbarques((prev) => prev.map((c) => (c.id === id ? { ...c, sapStatus: c.sapStatus === "pendiente" ? "cargado" : "pendiente" } : c)));

  // Guarda el manifiesto de una empresa específica dentro de la carga
  const setManifiesto = (id, empId, val) =>
    setCargasEmbarques((prev) => prev.map((c) => (c.id === id ? { ...c, manifiestos: { ...(c.manifiestos || {}), [empId]: val } } : c)));

  const devolver = (carga) => {
    setTrailers((prev) => prev.map((t) => (t.id === carga.trailer.id ? { ...t, status: "en_instalaciones" } : t)));
    setCargasEmbarques((prev) => prev.filter((c) => c.id !== carga.id));
  };

  const empBadge = { SL_AGR: "bg-green-100 text-green-800 border-green-200", CAT: "bg-blue-100 text-blue-800 border-blue-200", CACO: "bg-purple-100 text-purple-800 border-purple-200" };

  // Lista de empresas de una carga (consolidado o simple)
  const empresasDe = (carga) => carga.consolidado ? carga.empresasSel : (carga.empresasSel?.slice(0, 1) || []);

  // ¿Tiene todos los manifiestos capturados?
  const manifiestosCompletos = (carga) => {
    const emps = empresasDe(carga);
    return emps.length > 0 && emps.every((eid) => (carga.manifiestos?.[eid] || "").trim() !== "");
  };

  const pendientesArr = cargasEmbarques.filter((c) => c.sapStatus !== "cargado");
  const cargadasArr = cargasEmbarques.filter((c) => c.sapStatus === "cargado");
  const [tabEmb, setTabEmb] = useState("pendientes"); // pendientes | historial
  const listaEmb = tabEmb === "pendientes" ? pendientesArr : cargadasArr;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Embarques</h1>
          <p className="text-sm text-gray-500 mt-0.5">Daniel / Cristina · registro en SAP</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">DC</div>
          <span className="text-sm font-medium text-gray-700">Daniel / Cristina</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { l: "Total cargas", v: cargasEmbarques.length, c: "text-gray-900" },
          { l: "Pendientes SAP", v: cargasEmbarques.filter((c) => c.sapStatus === "pendiente").length, c: "text-orange-600" },
          { l: "Cargadas en SAP", v: cargasEmbarques.filter((c) => c.sapStatus === "cargado").length, c: "text-green-700" },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5"><div className="text-xs text-gray-500 mb-1">{s.l}</div><div className={`text-xl font-semibold ${s.c}`}>{s.v}</div></div>
        ))}
      </div>

      {cargasEmbarques.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="text-2xl mb-3">📋</div>
          <div className="text-sm font-medium text-gray-700 mb-1">Sin cargas recibidas</div>
          <div className="text-xs text-gray-400">Francisco debe enviar evidencias desde el Módulo 4</div>
        </div>
      ) : (
        <>
        <ColaTabs tab={tabEmb} setTab={setTabEmb} tabs={[
          { key: "pendientes", label: "Pendientes SAP", count: pendientesArr.length },
          { key: "historial", label: "Historial", count: cargadasArr.length },
        ]} />
        {listaEmb.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-xs text-gray-400 italic">{tabEmb === "pendientes" ? "No hay cargas pendientes de SAP." : "Aún no hay cargas registradas en SAP."}</div>
        ) : (
        <div className="grid grid-cols-1 gap-3">
          {listaEmb.map((carga) => {
            const isOpen = cargaSel === carga.id;
            const cajasTotal = carga.consolidado
              ? carga.empresasSel.reduce((a, eid) => a + (carga.distEmpresas[eid] || []).reduce((b, p) => { const c = CATALOGO.find((x) => x.id === p.prod); return b + (c?.cajasPorParrilla || 0); }, 0), 0)
              : 0;
            const completos = manifiestosCompletos(carga);
            return (
              <div key={carga.id} className={`bg-white border-2 rounded-xl overflow-hidden ${carga.sapStatus === "cargado" ? "border-green-300" : "border-orange-200"}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setCargaSel(isOpen ? null : carga.id)}>
                  <div className="flex flex-col"><span className="text-xs font-bold text-gray-700">{carga.fecha}</span><span className="text-xs text-gray-400">{carga.trailer.fecha}</span></div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${DC[carga.trailer.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{carga.trailer.dest}</span>
                  <div className="text-xs text-gray-500"><span className="font-medium">{carga.trailer.chofer || "Sin chofer"}</span>{carga.trailer.placaTracto && <span className="ml-1 font-mono text-gray-400">· {carga.trailer.placaTracto}</span>}</div>
                  {/* Indicador de manifiestos */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${completos ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    📄 {completos ? "Manifiestos ✓" : "Falta manifiesto"}
                  </span>
                  {carga.consolidado ? (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">{carga.empresasSel.length} empresas</span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${empBadge[carga.empresasSel?.[0]] || "bg-gray-100 text-gray-500 border-gray-200"}`}>{EMPRESAS.find((e) => e.id === carga.empresasSel?.[0])?.label || "Sin empresa"}</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); toggleSap(carga.id); }} className={`text-xs px-3 py-1 rounded-lg border font-medium ${carga.sapStatus === "cargado" ? "bg-green-50 border-green-300 text-green-700" : "bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"}`}>
                      {carga.sapStatus === "cargado" ? "✓ Cargado en SAP" : "⏳ Pendiente SAP"}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); devolver(carga); }} className="text-xs px-3 py-1 rounded-lg border font-medium bg-red-50 border-red-200 text-red-600 hover:bg-red-100">↩ Devolver</button>
                    <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos del trailer</div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        {[["Origen", carga.trailer.origen], ["Línea", carga.trailer.linea], ["Chofer", carga.trailer.chofer], ["Tel.", carga.trailer.telefono], ["Placas tracto", carga.trailer.placaTracto], ["Placas caja", carga.trailer.placaCaja], ["Económico", carga.trailer.economicoCaja], ["Flete", "$" + carga.trailer.flete]].map(([l, v]) => (
                          <div key={l}><div className="text-gray-400 mb-0.5">{l}</div><div className="font-semibold text-gray-900">{v || "—"}</div></div>
                        ))}
                      </div>
                    </div>

                    {/* Manifiestos por empresa */}
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">📄 Manifiesto por empresa</div>
                      <div className="space-y-2">
                        {empresasDe(carga).map((eid) => {
                          const emp = EMPRESAS.find((e) => e.id === eid);
                          return (
                            <div key={eid} className="flex items-center gap-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${empBadge[eid]}`} style={{ minWidth: "90px" }}>{emp?.label || eid}</span>
                              <input value={carga.manifiestos?.[eid] || ""} onChange={(e) => setManifiesto(carga.id, eid, e.target.value)} placeholder="Folio de manifiesto"
                                className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 font-mono" />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {carga.consolidado && (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-2">División por empresa</div>
                        {carga.empresasSel.map((eid) => {
                          const emp = EMPRESAS.find((e) => e.id === eid);
                          const data = carga.distEmpresas[eid] || [];
                          const cajasEmp = data.reduce((a, p) => { const c = CATALOGO.find((x) => x.id === p.prod); return a + (c?.cajasPorParrilla || 0); }, 0);
                          const pct = cajasTotal > 0 ? Math.round((cajasEmp / cajasTotal) * 100) : 0;
                          const flete = parseFloat(carga.trailer.flete) || 0;
                          const fProp = flete > 0 ? ((cajasEmp / cajasTotal) * flete).toFixed(2) : "—";
                          return (
                            <div key={eid} className="flex items-center justify-between px-3 py-2 rounded-lg mb-1 bg-gray-50">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${empBadge[eid]}`}>{emp.label}</span>
                              <span className="text-xs text-gray-600">{cajasEmp.toLocaleString()} cjs · {pct}%</span>
                              <span className="text-xs font-bold text-green-700">${fProp}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex gap-3 text-xs">
                      {[["Fotos carga", `${carga.cargaFotos}/30`], ["Fotos frontales", `${carga.frontalFotos}/6`]].map(([l, v]) => (
                        <div key={l} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"><div className="text-gray-400 mb-0.5">{l}</div><div className="font-semibold text-gray-700">{v}</div></div>
                      ))}
                    </div>

                    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="text-lg">🔗</span>
                      <div><div className="text-xs font-semibold text-gray-500">Consulta SAP — próximamente</div><div className="text-xs text-gray-400">OC fletero · Orden de venta · Factura cliente · Inventario</div></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
        </>
      )}
    </div>
  );
}