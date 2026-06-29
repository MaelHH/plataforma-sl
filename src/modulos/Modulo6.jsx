import { useState, Fragment } from "react";
import * as XLSX from "xlsx";
import { ClipboardList, Filter, Boxes, ListChecks, FileSpreadsheet, Check, Circle } from "lucide-react";
import { useDatos, CAT_VACIO, EMPRESAS, DC, idxToParr } from "../store/datos";
import SearchSelect from "../components/SearchSelect";
import AvisoSAP from "../components/AvisoSAP";

export default function Modulo6() {
  const { cargasEmbarques, setCargasEmbarques, catalogo } = useDatos();
  const CATALOGO = [CAT_VACIO, ...catalogo];
  const [cargaSel, setCargaSel] = useState(null);
  const [vista, setVista] = useState("tarjetas"); // tarjetas | tabla

  // ── Filtros ──
  const [fDest, setFDest] = useState("");
  const [fOrigen, setFOrigen] = useState("");
  const [fLinea, setFLinea] = useState("");
  const [fChofer, setFChofer] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fFecha, setFFecha] = useState("");
  const [fSap, setFSap] = useState("");

  // ⚠️ [SAP] Punto de integración: aquí se impacta SAP con el MANIFIESTO y los FLETES,
  // dividido por empresa (SAP es mono-empresa). Hoy solo togglea sapStatus; integración
  // real pendiente — ver docs/CLAUDE.md.
  const toggleSap = (i) =>
    setCargasEmbarques((prev) => prev.map((c, j) => (j === i ? { ...c, sapStatus: c.sapStatus === "pendiente" ? "cargado" : "pendiente" } : c)));

  const empBadge = { SL_AGR: "bg-green-100 text-green-800", CAT: "bg-blue-100 text-blue-800", CACO: "bg-purple-100 text-purple-800" };

  const cajasDe = (data) => data.reduce((a, p) => { const c = CATALOGO.find((x) => x.id === p.prod); return a + (c?.cajasPorParrilla || 0); }, 0);

  const empresasDe = (carga) => carga.consolidado ? carga.empresasSel : (carga.empresasSel?.slice(0, 1) || []);

  // Aplica filtros a cada carga (con su índice real para toggleSap)
  const cargasFiltradas = cargasEmbarques.map((c, i) => ({ c, i })).filter(({ c }) => {
    const t = c.trailer || {};
    if (fDest && t.dest !== fDest) return false;
    if (fOrigen && t.origen !== fOrigen) return false;
    if (fLinea && !(t.linea || "").toLowerCase().includes(fLinea.toLowerCase())) return false;
    if (fChofer && !(t.chofer || "").toLowerCase().includes(fChofer.toLowerCase())) return false;
    if (fFecha && t.fecha !== fFecha) return false;
    if (fSap && c.sapStatus !== fSap) return false;
    if (fEmpresa && !empresasDe(c).includes(fEmpresa)) return false;
    return true;
  });

  const opcDest = [...new Set(cargasEmbarques.map((c) => c.trailer?.dest).filter(Boolean))];
  const opcOrigen = [...new Set(cargasEmbarques.map((c) => c.trailer?.origen).filter(Boolean))];
  const opcFecha = [...new Set(cargasEmbarques.map((c) => c.trailer?.fecha).filter(Boolean))];
  const hayFiltros = fDest || fOrigen || fLinea || fChofer || fEmpresa || fFecha || fSap;
  const limpiarFiltros = () => { setFDest(""); setFOrigen(""); setFLinea(""); setFChofer(""); setFEmpresa(""); setFFecha(""); setFSap(""); };

  // Productos (etiquetas) de la distribución de una empresa
  const productosDe = (data) => {
    const labels = [...new Set((data || []).map((p) => { const c = CATALOGO.find((x) => x.id === p.prod); return c && c.id ? c.label : null; }).filter(Boolean))];
    return labels.join(", ");
  };

  // ── Aplanado tipo base de datos: una fila por (carga × empresa) ──
  // En consolidado, los datos del viaje se repiten y solo cambian empresa,
  // productos y flete a cobrar.
  const construirFilas = () => {
    const filas = [];
    cargasFiltradas.forEach(({ c: carga, i: ci }) => {
      const t = carga.trailer || {};
      const flete = parseFloat(t.flete) || 0;
      const emps = empresasDe(carga);
      const empsF = fEmpresa ? emps.filter((e) => e === fEmpresa) : emps;
      if (!carga.consolidado) {
        empsF.forEach((eid) => {
          const emp = EMPRESAS.find((e) => e.id === eid);
          filas.push({ key: carga.id + "_" + eid, ci, eid, sap: carga.sapStatus, manifiesto: carga.manifiestos?.[eid] || "", fecha: t.fecha || "", destino: t.dest || "", origen: t.origen || "", linea: t.linea || "", chofer: t.chofer || "", placas: t.placaTracto || "", economico: t.economicoCaja || "", tipo: "Simple", empresa: emp?.label || "Sin empresa", productos: productosDe(carga.distEmpresas?.[eid]), cajas: "", pct: "100%", fProp: flete, fleteTotal: flete });
        });
      } else {
        const cajasTotal = carga.empresasSel.reduce((a, eid) => a + cajasDe(carga.distEmpresas[eid] || []), 0);
        empsF.forEach((eid) => {
          const emp = EMPRESAS.find((e) => e.id === eid);
          const cajasEmp = cajasDe(carga.distEmpresas[eid] || []);
          const pct = cajasTotal > 0 ? Math.round((cajasEmp / cajasTotal) * 100) : 0;
          const fProp = flete > 0 && cajasTotal > 0 ? Number(((cajasEmp / cajasTotal) * flete).toFixed(2)) : 0;
          filas.push({ key: carga.id + "_" + eid, ci, eid, sap: carga.sapStatus, manifiesto: carga.manifiestos?.[eid] || "", fecha: t.fecha || "", destino: t.dest || "", origen: t.origen || "", linea: t.linea || "", chofer: t.chofer || "", placas: t.placaTracto || "", economico: t.economicoCaja || "", tipo: "Consolidado", empresa: emp?.label || "", productos: productosDe(carga.distEmpresas[eid]), cajas: cajasEmp, pct: pct + "%", fProp, fleteTotal: flete });
        });
      }
    });
    return filas;
  };

  // ── Exportar a Excel (solo lo filtrado) ──
  const exportarExcel = () => {
    const filas = construirFilas().map((f) => ({
      Manifiesto: f.manifiesto, Fecha: f.fecha, Origen: f.origen, Destino: f.destino, Linea: f.linea, Chofer: f.chofer, Placas: f.placas, Economico: f.economico, Tipo: f.tipo, Empresa: f.empresa, Productos: f.productos, Cajas: f.cajas, "% Flete": f.pct, "Flete a cobrar": f.fProp, "Flete total": f.fleteTotal, SAP: f.sap === "cargado" ? "Cargado" : "Pendiente",
    }));
    if (filas.length === 0) {
      alert("No hay cargas para exportar con los filtros actuales.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
    const hoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Consolidado_Fletes_${hoy}.xlsx`);
  };

  const SEL = "text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white";
  const filasPlanas = construirFilas();

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

      <AvisoSAP monoEmpresa>Aquí se impacta SAP con el <b>manifiesto</b> y los <b>fletes</b>.</AvisoSAP>

      {cargasEmbarques.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="flex justify-center mb-3"><ClipboardList size={24} className="text-gray-400" /></div>
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

          {/* Barra de filtros */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 inline-flex items-center gap-1"><Filter size={14} /> Filtros</span>
              {hayFiltros && <button onClick={limpiarFiltros} className="text-xs text-blue-600 hover:underline">Limpiar filtros</button>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              <SearchSelect className={SEL} value={fFecha} onChange={(v) => setFFecha(v)} placeholder="Fecha: todas"
                options={opcFecha.map((f) => ({ value: f, label: f }))} />
              <SearchSelect className={SEL} value={fDest} onChange={(v) => setFDest(v)} placeholder="Destino: todos"
                options={opcDest.map((d) => ({ value: d, label: d }))} />
              <SearchSelect className={SEL} value={fOrigen} onChange={(v) => setFOrigen(v)} placeholder="Origen: todos"
                options={opcOrigen.map((o) => ({ value: o, label: o }))} />
              <SearchSelect className={SEL} value={fEmpresa} onChange={(v) => setFEmpresa(v)} placeholder="Empresa: todas"
                options={EMPRESAS.map((e) => ({ value: e.id, label: e.label }))} />
              <SearchSelect className={SEL} value={fSap} onChange={(v) => setFSap(v)} placeholder="SAP: todos"
                options={[{ value: "pendiente", label: "Pendiente" }, { value: "cargado", label: "Cargado" }]} />
              <input className={SEL} value={fLinea} onChange={(e) => setFLinea(e.target.value)} placeholder="Línea..." />
              <input className={SEL} value={fChofer} onChange={(e) => setFChofer(e.target.value)} placeholder="Chofer..." />
            </div>
            {hayFiltros && <div className="text-xs text-gray-400 mt-2">Mostrando {cargasFiltradas.length} de {cargasEmbarques.length}</div>}
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              <button onClick={() => setVista("tarjetas")} className={`text-xs px-3 py-1.5 font-medium inline-flex items-center gap-1 ${vista === "tarjetas" ? "bg-gray-100 text-gray-900 font-semibold" : "bg-white text-gray-500 hover:bg-gray-50"}`}><Boxes size={14} /> Tarjetas</button>
              <button onClick={() => setVista("tabla")} className={`text-xs px-3 py-1.5 font-medium inline-flex items-center gap-1 ${vista === "tabla" ? "bg-gray-100 text-gray-900 font-semibold" : "bg-white text-gray-500 hover:bg-gray-50"}`}><ListChecks size={14} /> Base de datos</button>
            </div>
            <button onClick={exportarExcel} className="text-xs bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 flex items-center gap-2">
              <FileSpreadsheet size={14} /> Descargar a Excel{hayFiltros ? " (filtrado)" : ""}
            </button>
          </div>

          {vista === "tarjetas" ? (
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
                {cargasFiltradas.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-xs text-gray-400 italic py-6">Sin resultados con estos filtros</td></tr>
                ) : cargasFiltradas.map(({ c: carga, i: ci }) => {
                  const isOpen = cargaSel === carga.id;
                  const cajasTotal = carga.consolidado
                    ? carga.empresasSel.reduce((a, eid) => a + cajasDe(carga.distEmpresas[eid] || []), 0)
                    : 0;
                  return (
                    <Fragment key={carga.id}>
                      <tr className={`border-b border-gray-100 cursor-pointer ${isOpen ? "bg-blue-50" : carga.sapStatus === "cargado" ? "bg-green-50/40" : "hover:bg-gray-50"}`} onClick={() => setCargaSel(isOpen ? null : carga.id)}>
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
                          <button onClick={(e) => { e.stopPropagation(); toggleSap(ci); }} className={`px-2 py-0.5 rounded-full font-semibold border inline-flex items-center gap-1 ${carga.sapStatus === "cargado" ? "bg-green-100 text-green-700 border-green-200" : "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200"}`}>
                            {carga.sapStatus === "cargado" ? <><Check size={14} /> Cargado</> : "Pendiente"}
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
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "1320px" }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <th className="text-left px-2 py-2 font-medium whitespace-nowrap">Fecha</th>
                    <th className="text-left px-2 py-2 font-medium">Destino</th>
                    <th className="text-left px-2 py-2 font-medium">Origen</th>
                    <th className="text-left px-2 py-2 font-medium">Línea</th>
                    <th className="text-left px-2 py-2 font-medium">Chofer</th>
                    <th className="text-left px-2 py-2 font-medium">Placas</th>
                    <th className="text-left px-2 py-2 font-medium">Económico</th>
                    <th className="text-center px-2 py-2 font-medium">Tipo</th>
                    <th className="text-left px-2 py-2 font-medium bg-yellow-50">Empresa</th>
                    <th className="text-left px-2 py-2 font-medium bg-yellow-50">Productos</th>
                    <th className="text-right px-2 py-2 font-medium">Cajas</th>
                    <th className="text-right px-2 py-2 font-medium">% Flete</th>
                    <th className="text-right px-2 py-2 font-medium bg-yellow-50">Flete a cobrar</th>
                    <th className="text-right px-2 py-2 font-medium">Flete total</th>
                    <th className="text-left px-2 py-2 font-medium">Manifiesto</th>
                    <th className="text-center px-2 py-2 font-medium">SAP</th>
                  </tr>
                </thead>
                <tbody>
                  {filasPlanas.length === 0 ? (
                    <tr><td colSpan={16} className="text-center text-xs text-gray-400 italic py-6">Sin resultados con estos filtros</td></tr>
                  ) : filasPlanas.map((f) => (
                    <tr key={f.key} className={`border-b border-gray-100 ${f.sap === "cargado" ? "bg-green-50/40" : "hover:bg-gray-50"}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-gray-700">{f.fecha || "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{f.destino || "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{f.origen || "—"}</td>
                      <td className="px-2 py-1.5 text-gray-700">{f.linea || "—"}</td>
                      <td className="px-2 py-1.5 text-gray-600">{f.chofer || "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-600 whitespace-nowrap">{f.placas || "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-600 whitespace-nowrap">{f.economico || "—"}</td>
                      <td className="px-2 py-1.5 text-center"><span className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${f.tipo === "Consolidado" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>{f.tipo}</span></td>
                      <td className="px-2 py-1.5 bg-yellow-50/60"><span className={`px-2 py-0.5 rounded font-semibold whitespace-nowrap ${empBadge[f.eid] || "bg-gray-100 text-gray-700"}`}>{f.empresa}</span></td>
                      <td className="px-2 py-1.5 bg-yellow-50/60 text-gray-600">{f.productos || "—"}</td>
                      <td className="px-2 py-1.5 text-right">{f.cajas !== "" ? Number(f.cajas).toLocaleString() : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{f.pct}</td>
                      <td className="px-2 py-1.5 text-right bg-yellow-50/60 font-bold text-green-700">${Number(f.fProp).toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">${Number(f.fleteTotal).toLocaleString()}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-700">{f.manifiesto || <span className="text-amber-600 italic">falta</span>}</td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => toggleSap(f.ci)} className={`px-2 py-0.5 rounded-full font-semibold border inline-flex items-center justify-center ${f.sap === "cargado" ? "bg-green-100 text-green-700 border-green-200" : "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200"}`}>{f.sap === "cargado" ? <Check size={14} /> : <Circle size={14} />}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}