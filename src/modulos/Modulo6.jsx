import { useState } from "react";
import * as XLSX from "xlsx";
import { useDatos, CAT_VACIO, EMPRESAS, DC, idxToParr } from "../store/datos";

export default function Modulo6() {
  const { cargasEmbarques, setCargasEmbarques, catalogo } = useDatos();
  const CATALOGO = [CAT_VACIO, ...catalogo];
  const [cargaSel, setCargaSel] = useState(null);

  const toggleSap = (i) =>
    setCargasEmbarques((prev) => prev.map((c, j) => (j === i ? { ...c, sapStatus: c.sapStatus === "pendiente" ? "cargado" : "pendiente" } : c)));

  const empBadge = { SL_AGR: "bg-green-100 text-green-800", CAT: "bg-blue-100 text-blue-800", CACO: "bg-purple-100 text-purple-800" };

  const cajasDe = (data) => data.reduce((a, p) => { const c = CATALOGO.find((x) => x.id === p.prod); return a + (c?.cajasPorParrilla || 0); }, 0);

  const exportarExcel = () => {
    const filas = [];
    cargasEmbarques.forEach((carga) => {
      const flete = parseFloat(carga.trailer.flete) || 0;
      if (!carga.consolidado) {
        const eid = carga.empresasSel?.[0];
        const emp = EMPRESAS.find((e) => e.id === eid);
        filas.push({
          Manifiesto: carga.manifiestos?.[eid] || "",
          Fecha: carga.trailer.fecha || "",
          Destino: carga.trailer.dest || "",
          Linea: carga.trailer.linea || "",
          Chofer: carga.trailer.chofer || "",
          Placas: carga.trailer.placaTracto || "",
          Tipo: "Simple",
          Empresa: emp?.label || "Sin empresa",
          Cajas: "",
          "% Flete": "100%",
          "Flete a cobrar": flete,
          "Flete total": flete,
          SAP: carga.sapStatus === "cargado" ? "Cargado" : "Pendiente",
        });
      } else {
        const cajasTotal = carga.empresasSel.reduce((a, eid) => a + cajasDe(carga.distEmpresas[eid] || []), 0);
        carga.empresasSel.forEach((eid) => {
          const emp = EMPRESAS.find((e) => e.id === eid);
          const cajasEmp = cajasDe(carga.distEmpresas[eid] || []);
          const pct = cajasTotal > 0 ? Math.round((cajasEmp / cajasTotal) * 100) : 0;
          const fProp = flete > 0 && cajasTotal > 0 ? Number(((cajasEmp / cajasTotal) * flete).toFixed(2)) : 0;
          filas.push({
            Manifiesto: carga.manifiestos?.[eid] || "",
            Fecha: carga.trailer.fecha || "",
            Destino: carga.trailer.dest || "",
            Linea: carga.trailer.linea || "",
            Chofer: carga.trailer.chofer || "",
            Placas: carga.trailer.placaTracto || "",
            Tipo: "Consolidado",
            Empresa: emp?.label || "",
            Cajas: cajasEmp,
            "% Flete": pct + "%",
            "Flete a cobrar": fProp,
            "Flete total": flete,
            SAP: carga.sapStatus === "cargado" ? "Cargado" : "Pendiente",
          });
        });
      }
    });

    if (filas.length === 0) {
      alert("No hay cargas para exportar.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
    const hoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Consolidado_Fletes_${hoy}.xlsx`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Consolidado y Fletes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cristina · división de fletes por empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">CR</div>
          <span className="text-sm font-medium text-gray-700">Cristina</span>
        </div>
      </div>

      {cargasEmbarques.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="text-2xl mb-3">📋</div>
          <div className="text-sm font-medium text-gray-700 mb-1">Sin cargas disponibles</div>
          <div className="text-xs text-gray-400">Las cargas enviadas por Francisco aparecerán aquí</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { l: "Total cargas", v: cargasEmbarques.length, c: "text-gray-900" },
              { l: "Pendientes SAP", v: cargasEmbarques.filter((c) => c.sapStatus === "pendiente").length, c: "text-orange-600" },
              { l: "Cargadas en SAP", v: cargasEmbarques.filter((c) => c.sapStatus === "cargado").length, c: "text-green-700" },
              { l: "Consolidadas", v: cargasEmbarques.filter((c) => c.consolidado).length, c: "text-purple-700" },
            ].map((s, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5"><div className="text-xs text-gray-500 mb-1">{s.l}</div><div className={`text-xl font-semibold ${s.c}`}>{s.v}</div></div>
            ))}
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={exportarExcel} className="text-xs bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 flex items-center gap-2">
              📊 Descargar a Excel
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "700px" }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Destino</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Línea / Chofer</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Placas</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Flete total</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-500">Tipo</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-500">SAP</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody>
                {cargasEmbarques.map((carga, ci) => {
                  const isOpen = cargaSel === carga.id;
                  const cajasTotal = carga.consolidado
                    ? carga.empresasSel.reduce((a, eid) => a + cajasDe(carga.distEmpresas[eid] || []), 0)
                    : 0;
                  return (
                    <>
                      <tr key={carga.id} className={`border-b border-gray-100 cursor-pointer ${isOpen ? "bg-blue-50" : carga.sapStatus === "cargado" ? "bg-green-50/40" : "hover:bg-gray-50"}`} onClick={() => setCargaSel(isOpen ? null : carga.id)}>
                        <td className="px-3 py-2 font-semibold text-gray-700">{carga.trailer.fecha || "—"}</td>
                        <td className="px-3 py-2"><span className={`font-medium px-2 py-0.5 rounded-full border ${DC[carga.trailer.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{carga.trailer.dest || "—"}</span></td>
                        <td className="px-3 py-2 text-gray-700"><div className="font-medium">{carga.trailer.linea || "—"}</div><div className="text-gray-400">{carga.trailer.chofer || "—"}</div></td>
                        <td className="px-3 py-2 font-mono text-gray-600">{carga.trailer.placaTracto || "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold text-green-700">${carga.trailer.flete || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          {carga.consolidado
                            ? <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">{carga.empresasSel.length} empresas</span>
                            : <span className={`px-2 py-0.5 rounded-full font-medium ${empBadge[carga.empresasSel?.[0]] || "bg-gray-100 text-gray-500"}`}>{EMPRESAS.find((e) => e.id === carga.empresasSel?.[0])?.label || "Sin empresa"}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={(e) => { e.stopPropagation(); toggleSap(ci); }} className={`px-2 py-0.5 rounded-full font-semibold border ${carga.sapStatus === "cargado" ? "bg-green-100 text-green-700 border-green-200" : "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200"}`}>
                            {carga.sapStatus === "cargado" ? "✓ Cargado" : "⏳ Pendiente"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-400">{isOpen ? "▲" : "▼"}</td>
                      </tr>
                      {isOpen && (
                        <tr key={carga.id + "_det"}>
                          <td colSpan={8} className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400">
                                  <th className="text-left py-1 font-medium">Empresa</th>
                                  <th className="text-left py-1 font-medium">Manifiesto</th>
                                  <th className="text-left py-1 font-medium">Productos (parrillas)</th>
                                  <th className="text-right py-1 font-medium">Cajas</th>
                                  <th className="text-right py-1 font-medium">% flete</th>
                                  <th className="text-right py-1 font-medium">Flete a cobrar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {!carga.consolidado ? (
                                  <tr className="border-t border-gray-200">
                                    <td className="py-1.5"><span className={`px-2 py-0.5 rounded font-semibold ${empBadge[carga.empresasSel?.[0]] || "bg-gray-100 text-gray-700"}`}>{EMPRESAS.find((e) => e.id === carga.empresasSel?.[0])?.label || "—"}</span></td>
                                    <td className="py-1.5 font-mono text-gray-700">{carga.manifiestos?.[carga.empresasSel?.[0]] || <span className="text-amber-600 italic">falta</span>}</td>
                                    <td className="py-1.5 text-gray-500">Carga completa</td>
                                    <td className="py-1.5 text-right">—</td>
                                    <td className="py-1.5 text-right">100%</td>
                                    <td className="py-1.5 text-right font-bold text-green-700">${carga.trailer.flete || "—"}</td>
                                  </tr>
                                ) : (
                                  carga.empresasSel.map((eid) => {
                                    const emp = EMPRESAS.find((e) => e.id === eid);
                                    const data = carga.distEmpresas[eid] || [];
                                    const cajasEmp = cajasDe(data);
                                    const pct = cajasTotal > 0 ? Math.round((cajasEmp / cajasTotal) * 100) : 0;
                                    const flete = parseFloat(carga.trailer.flete) || 0;
                                    const fProp = flete > 0 ? ((cajasEmp / cajasTotal) * flete).toFixed(2) : "—";
                                    const prods = CATALOGO.filter((c) => c.id).map((cat) => {
                                      const nums = data.map((p, idx) => ({ ...p, idx })).filter((p) => p.prod === cat.id).map((p) => idxToParr(p.idx)).sort((a, b) => a - b);
                                      return nums.length ? `${cat.label} (${nums.join(",")})` : null;
                                    }).filter(Boolean).join(" · ");
                                    return (
                                      <tr key={eid} className="border-t border-gray-200">
                                        <td className="py-1.5"><span className={`px-2 py-0.5 rounded font-semibold ${empBadge[eid]}`}>{emp.label}</span></td>
                                        <td className="py-1.5 font-mono text-gray-700">{carga.manifiestos?.[eid] || <span className="text-amber-600 italic">falta</span>}</td>
                                        <td className="py-1.5 text-gray-500">{prods || "—"}</td>
                                        <td className="py-1.5 text-right">{cajasEmp.toLocaleString()}</td>
                                        <td className="py-1.5 text-right">{pct}%</td>
                                        <td className="py-1.5 text-right font-bold text-green-700">${fProp}</td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                            <div className="flex items-center gap-2 text-xs text-gray-400 border-t border-gray-200 pt-2 mt-2">
                              🔗 Consulta SAP — próximamente · OC fletero · Orden de venta · Factura cliente
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}