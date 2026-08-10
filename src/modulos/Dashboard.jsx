import { Fragment, useState } from "react";
import * as XLSX from "xlsx";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Truck, Bell, Check, Receipt, DollarSign, TrendingUp, AlertTriangle, ChevronLeft, ChevronRight, PackageOpen, FileSpreadsheet, ArrowRight } from "lucide-react";
import { useDatos, CAT_VACIO, DC, etiquetaSemana, moverSemana } from "../store/datos";
import { hoyISO, lunesActual } from "../utils/fecha";
import { useAuth } from "../store/auth";
import {
  esRecibidoEmpaque, kgRecibidosDe, kgVaciadosDe, kgMermadosDe, kgEnPisoDe, cubetasEnviadasSAP, kgEnviadosSAP, kgPendienteSAP, tienePendienteSAP, estaTerminado, kgSobranteCierre, netoPesada,
} from "./helpers/empaque";

// Semáforo vs promedio
function semaforo(valor, promedio) {
  if (!promedio || promedio === 0) return { color: "gray" };
  const ratio = valor / promedio;
  if (ratio <= 1.0) return { color: "green" };
  if (ratio <= 1.15) return { color: "amber" };
  return { color: "red" };
}
const SEMAFORO_DOT = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-gray-300",
};
const SEMAFORO_BG = {
  green: "bg-green-50",
  amber: "bg-amber-50",
  red: "bg-red-50",
  gray: "bg-white",
};

export default function Dashboard() {
  const { trailers, requerimientoGen, cargasEmbarques, monitoreo, catalogo, movimientos } = useDatos();
  // Aislamiento por EMPRESA: los KPIs de empaque solo cuentan folios de MI empresa (sin etiqueta → ancla 1).
  const { usuario } = useAuth();
  const miEmpresa = usuario?.id_empresa ?? null;
  const [semana, setSemana] = useState(lunesActual());
  const [vistaCosto, setVistaCosto] = useState("linea");
  const [empDestino, setEmpDestino] = useState("");   // filtro por empaque destino (sección Empaque)

  const reqSemana = requerimientoGen[semana] || [];

  // ── KPIs ──
  const totalSolicitados = reqSemana.reduce((a, r) => a + r.sol, 0);
  const enRuta = trailers.filter((t) => t.status === "en_ruta");
  const entregados = trailers.filter((t) => t.status === "entregado");
  const enInstal = trailers.filter((t) => t.status === "en_instalaciones");
  const conseguidos = enRuta.length + entregados.length + enInstal.length;
  const pctAvance = totalSolicitados > 0 ? Math.min(Math.round((conseguidos / totalSolicitados) * 100), 100) : 0;

  // ── Avance por destino ──
  const porDestino = {};
  reqSemana.forEach((r) => {
    if (!porDestino[r.dest]) porDestino[r.dest] = { dest: r.dest, sol: 0, conseguidos: 0 };
    porDestino[r.dest].sol += r.sol;
  });
  trailers.forEach((t) => {
    if (t.dest && porDestino[t.dest] && t.status !== "esperando") porDestino[t.dest].conseguidos += 1;
  });
  const destinosArr = Object.values(porDestino).sort((a, b) => b.sol - a.sol);

  // ── Dinero (suma de fletes de trailers activos) ──
  const trailersActivos = trailers.filter((t) => t.status !== "esperando");
  const totalFletes = trailersActivos.reduce((a, t) => a + (parseFloat(t.flete) || 0), 0);

  // ── Pendiente de facturar en SAP ──
  const cargasPendientesSap = cargasEmbarques.filter((c) => c.sapStatus === "pendiente");
  const totalPendienteSap = cargasPendientesSap.reduce((a, c) => a + (parseFloat(c.trailer?.flete) || 0), 0);

  // ── ANÁLISIS DE COSTOS ──
  const CATALOGO = [CAT_VACIO, ...catalogo];
  const librasDe = (presId) => {
    const c = CATALOGO.find((x) => x.id === presId);
    return c ? (c.cajasPorParrilla || 0) * (c.librasPorCaja || 0) : 0;
  };

  const viajes = cargasEmbarques.map((carga) => {
    const flete = parseFloat(carga.trailer?.flete) || 0;
    let libras = 0;
    const porProducto = {};
    if (carga.consolidado) {
      carga.empresasSel?.forEach((eid) => {
        (carga.distEmpresas[eid] || []).forEach((p) => {
          if (!p.prod) return;
          const lbs = librasDe(p.prod);
          libras += lbs;
          porProducto[p.prod] = (porProducto[p.prod] || 0) + lbs;
        });
      });
    }
    return {
      linea: carga.trailer?.linea || "Sin línea",
      dest: carga.trailer?.dest || "Sin destino",
      flete, libras,
      costoLb: libras > 0 ? flete / libras : 0,
      porProducto,
    };
  });
  const viajesValidos = viajes.filter((v) => v.libras > 0 && v.flete > 0);
  const promedioGlobal = viajesValidos.length > 0 ? viajesValidos.reduce((a, v) => a + v.costoLb, 0) / viajesValidos.length : 0;
  const totalLibras = viajesValidos.reduce((a, v) => a + v.libras, 0);

  const agruparPor = (campo) => {
    const map = {};
    viajesValidos.forEach((v) => {
      const key = v[campo];
      if (!map[key]) map[key] = { key, flete: 0, libras: 0 };
      map[key].flete += v.flete;
      map[key].libras += v.libras;
    });
    return Object.values(map).map((m) => ({ ...m, costoLb: m.libras > 0 ? m.flete / m.libras : 0 })).sort((a, b) => b.costoLb - a.costoLb);
  };
  const porLinea = agruparPor("linea");
  const porRuta = agruparPor("dest");

  const prodMap = {};
  viajesValidos.forEach((v) => {
    Object.entries(v.porProducto).forEach(([presId, lbs]) => {
      if (!prodMap[presId]) prodMap[presId] = { presId, libras: 0, flete: 0 };
      const propor = v.libras > 0 ? (lbs / v.libras) * v.flete : 0;
      prodMap[presId].libras += lbs;
      prodMap[presId].flete += propor;
    });
  });
  const porProducto = Object.values(prodMap).map((m) => {
    const cat = CATALOGO.find((c) => c.id === m.presId);
    return { key: cat?.label || m.presId, libras: m.libras, flete: m.flete, costoLb: m.libras > 0 ? m.flete / m.libras : 0 };
  }).sort((a, b) => b.costoLb - a.costoLb);

  const datosCosto = vistaCosto === "linea" ? porLinea : vistaCosto === "ruta" ? porRuta : porProducto;
  const promParaSemaforo = vistaCosto === "producto"
    ? (porProducto.length > 0 ? porProducto.reduce((a, p) => a + p.costoLb, 0) / porProducto.length : 0)
    : promedioGlobal;

  // ── Alertas ──
  const alertas = [];
  destinosArr.forEach((d) => {
    if (d.conseguidos < d.sol) alertas.push({ tipo: "ruta", txt: `${d.dest}: faltan ${d.sol - d.conseguidos} de ${d.sol} trailers`, color: "amber" });
  });
  const pendientesSap = cargasPendientesSap.length;
  if (pendientesSap > 0) alertas.push({ tipo: "sap", txt: `${pendientesSap} carga(s) pendiente(s) de registrar en SAP`, color: "blue" });
  porLinea.forEach((l) => {
    if (promedioGlobal > 0 && l.costoLb / promedioGlobal > 1.15) alertas.push({ tipo: "costo", txt: `${l.key}: costo/lb ${Math.round((l.costoLb / promedioGlobal - 1) * 100)}% sobre el promedio`, color: "red" });
  });
  Object.entries(monitoreo).forEach(([tId, eventos]) => {
    const t = trailers.find((x) => String(x.id) === String(tId));
    if (!t) return;
    if (eventos.accidente?.hubo === true) alertas.push({ tipo: "acc", txt: `Accidente reportado — ${t.linea || t.dest}`, color: "red" });
    if (eventos.retenes?.hubo === true) alertas.push({ tipo: "ret", txt: `Retén reportado — ${t.linea || t.dest}`, color: "amber" });
  });

  const ALERT_COLORS = {
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };

  // ── EMPAQUE · Vaciado a producción (lee `movimientos` con los MISMOS helpers del módulo → cuadra) ──
  const hoyEmp = hoyISO();
  const recibidosEmp = (movimientos || []).filter((m) => (miEmpresa == null || (m.empresa ?? 1) === miEmpresa) && esRecibidoEmpaque(m));
  const empLoteDe = (m) => m.lote || m.rancho || m.consignado || "—";
  const empDestinoDe = (m) => m.consignado || m.distribuidor || m.destino || "—";
  const empDestinos = [...new Set(recibidosEmp.map(empDestinoDe).filter((d) => d && d !== "—"))].sort();
  const empList = empDestino ? recibidosEmp.filter((m) => empDestinoDe(m) === empDestino) : recibidosEmp;

  // kg vaciado de un día (eventos simples + pesadas por hora de ese día).
  // Los registros VIEJOS sin fecha NO se cuentan como "hoy" (antes inflaban el día, todos los días).
  const kgVacDiaDe = (m, dia) =>
    (m.vaciado?.eventos || []).filter((e) => e.fecha === dia).reduce((a, e) => a + (parseFloat(e.kg) || 0), 0)
    + (m.vaciado?.horas || []).flatMap((h) => h.pesadas || []).filter((p) => p.fecha === dia).reduce((a, p) => a + netoPesada(p), 0)
    // Los faltantes también son vaciado (bajan el piso) → cuentan en el día, igual que en el módulo.
    + (m.vaciado?.ajustes || []).filter((x) => x.fecha === dia).reduce((a, x) => a + (parseFloat(x.kg) || 0), 0);

  const empVaciadoHoy = empList.reduce((a, m) => a + kgVacDiaDe(m, hoyEmp), 0);
  const empEnPiso = empList.reduce((a, m) => a + kgEnPisoDe(m), 0);
  const empVacTot = empList.reduce((a, m) => a + kgVaciadosDe(m), 0);
  const empMerma = empList.reduce((a, m) => a + kgMermadosDe(m), 0);
  const empMermaPct = (empVacTot + empMerma) > 0 ? (empMerma / (empVacTot + empMerma)) * 100 : 0;
  const empCubetasSAP = empList.reduce((a, m) => a + cubetasEnviadasSAP(m), 0);
  const empPendientes = empList.filter((m) => kgEnPisoDe(m) > 0).length;

  const empPorLote = (() => {
    const acc = {};
    empList.forEach((m) => {
      const lote = empLoteDe(m);
      if (!acc[lote]) acc[lote] = { lote, rec: 0, vac: 0, mer: 0, piso: 0, cub: 0 };
      acc[lote].rec += kgRecibidosDe(m); acc[lote].vac += kgVaciadosDe(m);
      acc[lote].mer += kgMermadosDe(m); acc[lote].piso += kgEnPisoDe(m); acc[lote].cub += cubetasEnviadasSAP(m);
    });
    return Object.values(acc).sort((a, b) => a.lote.localeCompare(b.lote));
  })();
  const empTot = empPorLote.reduce((t, l) => ({ rec: t.rec + l.rec, vac: t.vac + l.vac, mer: t.mer + l.mer, piso: t.piso + l.piso, cub: t.cub + l.cub }), { rec: 0, vac: 0, mer: 0, piso: 0, cub: 0 });

  // Tendencia real: kg vaciados por día (últimos 7 días).
  const empTendencia = (() => {
    const base = new Date(hoyEmp + "T00:00:00");   // medianoche LOCAL de hoy
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(base.getDate() - i);
      dias.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    const mapa = Object.fromEntries(dias.map((d) => [d, 0]));
    empList.forEach((m) => {
      (m.vaciado?.eventos || []).forEach((e) => { if (e.fecha && e.fecha in mapa) mapa[e.fecha] += parseFloat(e.kg) || 0; });
      (m.vaciado?.horas || []).forEach((h) => (h.pesadas || []).forEach((p) => { if (p.fecha && p.fecha in mapa) mapa[p.fecha] += netoPesada(p); }));
      (m.vaciado?.ajustes || []).forEach((x) => { if (x.fecha && x.fecha in mapa) mapa[x.fecha] += parseFloat(x.kg) || 0; });
    });
    const enSap = Object.fromEntries(dias.map((d) => [d, 0]));
    const sumaEnvio = (env) => { const d = (env?.ts || "").slice(0, 10); if (d in enSap) enSap[d] += env?.netoKg || 0; };
    // OJO: `mapa` (lo vaciado) ya se llenó arriba. Aquí SOLO se suma lo reportado a SAP ese día,
    // por la fecha del propio envío → la gráfica compara "se vació" contra "se reportó".
    empList.forEach((m) => {
      sumaEnvio(m.recepcion?.sapEnvio);
      (m.vaciado?.horas || []).forEach((h) => sumaEnvio(h.sapEnvio));
      (m.vaciado?.ajustes || []).forEach((a) => sumaEnvio(a.sapEnvio));
    });
    return dias.map((d) => ({ dia: d.slice(5), kg: Math.round(mapa[d]), sap: Math.round(enSap[d]) }));
  })();

  // ── Lo que de verdad le importa a Dirección: qué falta por mandar a SAP y qué necesita atención ──
  const empPendSAP = empList.reduce((a, m) => a + kgPendienteSAP(m), 0);       // vaciado que NO se ha reportado
  const empEnviadoSAP = empList.reduce((a, m) => a + kgEnviadosSAP(m), 0);
  const empRecTot = empList.reduce((a, m) => a + kgRecibidosDe(m), 0);
  const empFoliosPendSAP = empList.filter((m) => kgPendienteSAP(m) > 0).length;

  const tienePendiente = tienePendienteSAP;   // helper compartido con el módulo
  const folioDe = (m) => m.remision || m.folio || "—";
  // Descuadres ya revisados por alguien en Empaque: dejan de alertar aquí también (mismo criterio
  // que el módulo — si la diferencia cambia, la marca ya no aplica y vuelve a salir).
  const yaRevisado = (m, tipo, dif) => {
    const r = m?.vaciado?.revisado;
    return !!r && r.tipo === tipo && Math.abs((parseFloat(r.dif) || 0) - dif) <= 1;
  };

  // Merma POR MOTIVO: saber cuánto se descarta no sirve si no se sabe POR QUÉ (calidad vs
  // inexistencia se atacan de formas distintas).
  const empMermaMotivos = (() => {
    const acc = {};
    empList.forEach((m) => (m.vaciado?.mermas || []).forEach((e) => {
      const k = (e.motivo || "").trim() || "Sin motivo";
      acc[k] = (acc[k] || 0) + (parseFloat(e.kg) || 0);
    }));
    return Object.entries(acc).map(([motivo, kg]) => ({ motivo, kg })).sort((a, b) => b.kg - a.kg);
  })();

  const empAlertas = [
    { clave: "pend", tono: "amber", titulo: "Envíos sin confirmar",
      ayuda: "Se cortó la conexión al mandar a SAP. Hay que verificar en SAP si quedó (nunca reenviar a ciegas).",
      items: empList.filter(tienePendiente).map(folioDe) },
    { clave: "desc", tono: "red", titulo: "Salió MÁS de lo recibido",
      ayuda: "Doble captura, recibido capturado de menos, o carga con peso inflado (piedras en las cajas).",
      items: empList.filter((m) => kgRecibidosDe(m) > 0 && kgVaciadosDe(m) > kgRecibidosDe(m)
        && !yaRevisado(m, "sobra", kgVaciadosDe(m) - kgRecibidosDe(m))).map(folioDe) },
    { clave: "falto", tono: "red", titulo: "Llegó MENOS de lo recibido",
      ayuda: "Folios ya cerrados que no alcanzaron el peso del manifiesto (descontando merma): nos mandaron de menos.",
      items: empList.filter((m) => estaTerminado(m) && kgSobranteCierre(m) > 0
        && !yaRevisado(m, "falta", kgSobranteCierre(m)))
        .sort((a, b) => kgSobranteCierre(b) - kgSobranteCierre(a))
        .map((m) => `${folioDe(m)} (−${Math.round(kgSobranteCierre(m)).toLocaleString()} kg)`) },
    { clave: "apro", tono: "blue", titulo: "Horas cerradas sin aprobar",
      ayuda: "La encargada tiene que revisar y aprobar el cálculo para que se pueda mandar a SAP.",
      items: empList.filter((m) => (m.vaciado?.horas || []).some((h) => h.estado === "cerrada" && !h.aprobacion && !h.sapEnvio)).map(folioDe) },
    { clave: "term", tono: "amber", titulo: "Terminados pero falta mandarlos a SAP",
      ayuda: "Ya no queda nada en piso, pero hay kg vaciados que todavía no se reportaron.",
      items: empList.filter((m) => kgEnPisoDe(m) === 0 && kgRecibidosDe(m) > 0 && kgPendienteSAP(m) > 0).map(folioDe) },
  ].filter((a) => a.items.length > 0);

  // Excel con DOS hojas: el resumen por lote y el detalle folio por folio (lo que piden los jefes
  // para revisar en frío: qué se recibió, qué se vació, qué falta y qué ya está en SAP).
  const exportarEmpExcel = () => {
    const rows = empPorLote.map((l) => ({
      Lote: l.lote, "Recibido (kg)": Math.round(l.rec), "Vaciado (kg)": Math.round(l.vac),
      "Mermado (kg)": Math.round(l.mer), "En piso (kg)": Math.round(l.piso), "Cubetas a SAP": Math.round(l.cub),
      Revisar: l.vac > l.rec ? "vaciado > recibido" : "",
    }));
    const detalle = empList.map((m) => {
      const rec = kgRecibidosDe(m), vac = kgVaciadosDe(m), pend = kgPendienteSAP(m);
      return {
        Folio: folioDe(m), Lote: empLoteDe(m), Tabla: m.departamento || "", Empaque: empDestinoDe(m),
        Producto: (m.cargaItems || []).map((it) => it.prod).filter(Boolean).join(", ") || m.rancho || "",
        Fecha: m.fecha || "",
        "Recibido (kg)": Math.round(rec), "Vaciado (kg)": Math.round(vac),
        "Mermado (kg)": Math.round(kgMermadosDe(m)), "En piso (kg)": Math.round(kgEnPisoDe(m)),
        "Cubetas a SAP": Math.round(cubetasEnviadasSAP(m)),
        "Reportado a SAP (kg)": Math.round(kgEnviadosSAP(m)),
        "Falta reportar (kg)": Math.round(pend),
        Horas: (m.vaciado?.horas || []).length,
        Estado: estaTerminado(m) ? "Terminado (cerrado a mano)" : (kgEnPisoDe(m) === 0 && rec > 0 ? "Terminado" : "En piso"),
        "Quedo sin vaciar (kg)": Math.round(kgSobranteCierre(m)),
        "Terminado por": m.vaciado?.terminado?.por || "",
        Atención: [
          tienePendiente(m) ? "envío sin confirmar" : "",
          rec > 0 && vac > rec ? "salio de mas (" + Math.round(vac - rec) + " kg)" : "",
          estaTerminado(m) && kgSobranteCierre(m) > 0 ? "llego de menos (" + Math.round(kgSobranteCierre(m)) + " kg)" : "",
          (m.vaciado?.horas || []).some((h) => h.estado === "cerrada" && !h.aprobacion && !h.sapEnvio) ? "horas sin aprobar" : "",
        ].filter(Boolean).join(" · "),
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Lote: "(sin datos)" }]), "Por lote");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Folio: "(sin datos)" }]), "Por folio");
    XLSX.writeFile(wb, `empaque-inventario-${hoyEmp}.xlsx`);
  };
  const fmtKg = (n) => Math.round(n || 0).toLocaleString();

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 gap-y-3 mb-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Dashboard Ejecutivo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visión general de la operación · {etiquetaSemana(semana)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSemana(moverSemana(semana, -1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600"><ChevronLeft size={16} /></button>
          <button onClick={() => setSemana(moverSemana(semana, 1))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium text-gray-600"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* KPIs grandes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
          <div className="text-xs opacity-80 mb-1">Avance de la semana</div>
          <div className="text-3xl font-bold">{pctAvance}%</div>
          <div className="text-xs opacity-80 mt-1">{conseguidos} de {totalSolicitados} trailers</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Solicitados</div>
          <div className="text-3xl font-bold text-gray-900">{totalSolicitados}</div>
          <div className="text-xs text-gray-400 mt-1">esta semana</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1">En ruta <Truck size={14} /></div>
          <div className="text-3xl font-bold text-green-600">{enRuta.length}</div>
          <div className="text-xs text-gray-400 mt-1">{entregados.length} entregados</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Fletes activos</div>
          <div className="text-2xl font-bold text-gray-900">${totalFletes.toLocaleString()}</div>
          <div className="text-xs text-orange-600 mt-1 font-medium">${totalPendienteSap.toLocaleString()} pend. SAP</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Avance por destino */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">Avance por destino</div>
          {destinosArr.length === 0 ? (
            <div className="text-xs text-gray-400 italic text-center py-6">Sin requerimiento esta semana</div>
          ) : (
            <div className="space-y-3">
              {destinosArr.map((d) => {
                const pct = d.sol > 0 ? Math.min(Math.round((d.conseguidos / d.sol) * 100), 100) : 0;
                return (
                  <div key={d.dest}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[d.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{d.dest}</span>
                      <span className="text-xs text-gray-600 font-medium">{d.conseguidos}/{d.sol}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-1"><Bell size={16} /> Alertas y pendientes</div>
          {alertas.length === 0 ? (
            <div className="text-xs text-gray-400 italic text-center py-6 inline-flex items-center justify-center gap-1 w-full">Todo en orden <Check size={14} /></div>
          ) : (
            <div className="space-y-2">
              {alertas.map((a, i) => (
                <div key={i} className={`text-xs px-3 py-2 rounded-lg border ${ALERT_COLORS[a.color]}`}>{a.txt}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Viajes en ruta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-1"><Truck size={16} /> Viajes activos en ruta</div>
        {enRuta.length === 0 ? (
          <div className="text-xs text-gray-400 italic text-center py-6">Ningún trailer en ruta ahora</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {enRuta.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[t.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{t.dest}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-800 truncate">{t.linea || "Sin línea"}</div>
                  <div className="text-xs text-gray-400 truncate">{t.chofer || "Sin chofer"} {t.placaTracto && `· ${t.placaTracto}`}</div>
                </div>
                {t.flete && <span className="text-xs font-semibold text-green-700">${parseFloat(t.flete).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pendiente de facturar en SAP */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1"><Receipt size={16} /> Pendiente de registrar en SAP</div>
          {totalPendienteSap > 0 && <span className="text-sm font-bold text-orange-600">${totalPendienteSap.toLocaleString()}</span>}
        </div>
        {cargasPendientesSap.length === 0 ? (
          <div className="text-xs text-gray-400 italic text-center py-6 inline-flex items-center justify-center gap-1 w-full">Todo registrado en SAP <Check size={14} /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {cargasPendientesSap.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border border-orange-100 bg-orange-50/40 rounded-lg px-3 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[c.trailer?.dest] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{c.trailer?.dest || "—"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-800 truncate">{c.trailer?.linea || "Sin línea"}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {c.consolidado ? `Consolidado · ${c.empresasSel?.length || 0} empresas` : "Carga simple"}
                  </div>
                </div>
                {c.trailer?.flete && <span className="text-xs font-semibold text-orange-700">${parseFloat(c.trailer.flete).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── EMPAQUE · Vaciado a producción ─── */}
      <div className="border-t border-gray-200 pt-5 mt-2 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2 gap-y-2 mb-3">
          <div className="text-sm font-bold text-gray-900 inline-flex items-center gap-1"><PackageOpen size={16} /> Empaque · Vaciado a producción</div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={empDestino} onChange={(e) => setEmpDestino(e.target.value)} className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700">
              <option value="">Empaque: todos</option>
              {empDestinos.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={exportarEmpExcel} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"><FileSpreadsheet size={14} /> Excel</button>
          </div>
        </div>

        {recibidosEmp.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center text-xs text-gray-400">Aún no hay fletes recibidos en empaque.</div>
        ) : (
          <>
            {/* Barra de flujo GLOBAL — el mismo lenguaje que ve la operadora en su módulo,
                para que jefes y piso hablen de los mismos números. */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-2 gap-y-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:gap-y-0 items-center">
                {[
                  ["Recibido", fmtKg(empRecTot), "kg", `${empList.length} fletes`, "text-gray-800"],
                  ["Vaciado", fmtKg(empVacTot), "kg", `≈ ${Math.round(empVacTot / 6).toLocaleString()} cub`, "text-blue-700"],
                  ["En piso (falta)", fmtKg(empEnPiso), "kg", `${empPendientes} folios por terminar`, "text-amber-600"],
                  ["Reportado a SAP", empCubetasSAP.toLocaleString(), "cub", empPendSAP > 0 ? `faltan ${Math.round(empPendSAP / 6).toLocaleString()} cub` : "todo reportado", "text-green-700"],
                ].map(([et, val, uni, sub, col], i) => (
                  <Fragment key={et}>
                    {i > 0 && <div className="hidden lg:grid place-items-center text-gray-300"><ArrowRight size={16} /></div>}
                    <div className="px-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold truncate">{et}</div>
                      <div className={`text-xl font-bold leading-tight ${col}`}>{val} <span className="text-[11px] font-semibold text-gray-400">{uni}</span></div>
                      <div className="text-[10px] text-gray-500 truncate">{sub}</div>
                    </div>
                  </Fragment>
                ))}
              </div>
              {(() => {
                const base = Math.max(1, empRecTot, empVacTot + empMerma);
                const an = (v) => `${Math.max(0, Math.min(100, (v / base) * 100))}%`;
                return (<>
                  <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden flex mt-3">
                    <span className="h-full bg-green-500" style={{ width: an(empEnviadoSAP) }}></span>
                    <span className="h-full bg-blue-500" style={{ width: an(empPendSAP) }}></span>
                    <span className="h-full bg-red-300" style={{ width: an(empMerma) }}></span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Reportado a SAP {fmtKg(empEnviadoSAP)} kg</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Vaciado sin reportar {fmtKg(empPendSAP)} kg</span>
                    {empMerma > 0 && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-300"></span> Mermado {fmtKg(empMerma)} kg</span>}
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300"></span> En piso {fmtKg(empEnPiso)} kg</span>
                  </div>
                </>);
              })()}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="text-xs text-gray-500 mb-1">Vaciado hoy</div>
                <div className="text-2xl font-bold text-blue-600">{fmtKg(empVaciadoHoy)} <span className="text-xs font-medium text-gray-400">kg</span></div>
                <div className="text-[10px] text-gray-400">≈ {Math.round(empVaciadoHoy / 6).toLocaleString()} cubetas</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="text-xs text-gray-500 mb-1">Cubetas a SAP</div>
                <div className="text-2xl font-bold text-green-700">{empCubetasSAP.toLocaleString()}</div>
                <div className="text-[10px] text-gray-400">{fmtKg(empEnviadoSAP)} kg reportados</div>
              </div>
              <div className={`border rounded-xl p-3 ${empPendSAP > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
                <div className="text-xs text-gray-500 mb-1">Falta mandar a SAP</div>
                <div className={`text-2xl font-bold ${empPendSAP > 0 ? "text-amber-700" : "text-green-700"}`}>{Math.round(empPendSAP / 6).toLocaleString()} <span className="text-xs font-medium text-gray-400">cub</span></div>
                <div className="text-[10px] text-gray-400">{fmtKg(empPendSAP)} kg · {empFoliosPendSAP} folios</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="text-xs text-gray-500 mb-1">En piso (inventario)</div>
                <div className="text-2xl font-bold text-amber-600">{fmtKg(empEnPiso)} <span className="text-xs font-medium text-gray-400">kg</span></div>
                <div className="text-[10px] text-gray-400">{empPendientes} folios por terminar</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="text-xs text-gray-500 mb-1">% merma</div>
                <div className="text-2xl font-bold text-gray-900">{empMermaPct.toFixed(1)}%</div>
                <div className="text-[10px] text-gray-400">{fmtKg(empMerma)} kg no entraron</div>
                {empMermaMotivos.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {empMermaMotivos.slice(0, 3).map((x) => (
                      <div key={x.motivo} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-gray-500 truncate" title={x.motivo}>{x.motivo.replace(/^Merma por /, "")}</span>
                        <span className="text-red-700 font-semibold whitespace-nowrap">{fmtKg(x.kg)} kg</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Requiere atención: lo accionable, no solo números bonitos */}
            {empAlertas.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
                <div className="text-sm font-semibold text-gray-900 mb-2 inline-flex items-center gap-1"><AlertTriangle size={16} className="text-amber-500" /> Requiere atención</div>
                <div className="grid md:grid-cols-2 gap-2">
                  {empAlertas.map((a) => {
                    const tono = a.tono === "red" ? "bg-red-50 border-red-200 text-red-800"
                      : a.tono === "blue" ? "bg-blue-50 border-blue-200 text-blue-800"
                        : "bg-amber-50 border-amber-200 text-amber-800";
                    return (
                      <div key={a.clave} className={`border rounded-lg px-3 py-2 ${tono}`}>
                        <div className="text-xs font-semibold">{a.titulo} ({a.items.length})</div>
                        <div className="text-[11px] opacity-80 mt-0.5">{a.ayuda}</div>
                        <div className="text-[11px] font-medium mt-1">Folios: {a.items.slice(0, 8).join(", ")}{a.items.length > 8 ? ` y ${a.items.length - 8} más` : ""}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-gray-900 mb-1 inline-flex items-center gap-1"><TrendingUp size={16} /> Vaciado vs reportado a SAP <span className="text-xs font-normal text-gray-400">· últimos 7 días · kg</span></div>
                <div className="text-[11px] text-gray-400 mb-2">Si la línea verde va por debajo de la azul, ese día se vació más de lo que se reportó a SAP.</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={empTendencia} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v, n) => [`${v.toLocaleString()} kg`, n === "sap" ? "Reportado a SAP" : "Vaciado"]} />
                    <Legend formatter={(v) => (v === "sap" ? "Reportado a SAP" : "Vaciado")} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="kg" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: "#2563eb" }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="sap" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3, fill: "#16a34a" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="text-sm font-semibold text-gray-900 px-4 pt-4 pb-2">Inventario por lote <span className="text-xs font-normal text-gray-400">· en piso = recibido − vaciado − merma</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 520 }}>
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-3 py-2 font-medium">Lote</th>
                        <th className="text-right px-3 py-2 font-medium">Recibido</th>
                        <th className="text-right px-3 py-2 font-medium">Vaciado</th>
                        <th className="text-right px-3 py-2 font-medium">Cub SAP</th>
                        <th className="text-right px-3 py-2 font-medium">En piso</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {empPorLote.map((l) => (
                        <tr key={l.lote} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium text-gray-800">{l.lote}
                            {l.vac > l.rec && <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"><AlertTriangle size={10} /> revisar</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">{fmtKg(l.rec)}</td>
                          <td className="px-3 py-2 text-right text-green-700 font-medium">{fmtKg(l.vac)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{Math.round(l.cub).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-amber-600 font-medium">{fmtKg(l.piso)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-gray-800">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right">{fmtKg(empTot.rec)}</td>
                        <td className="px-3 py-2 text-right">{fmtKg(empTot.vac)}</td>
                        <td className="px-3 py-2 text-right">{Math.round(empTot.cub).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{fmtKg(empTot.piso)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── ANÁLISIS DE COSTOS ─── */}
      <div className="border-t border-gray-200 pt-5 mt-2">
        <div className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-1"><DollarSign size={16} /> Análisis de Costos · costo por libra</div>

        {viajesValidos.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 md:p-6 text-center">
            <div className="text-xs text-gray-400">El análisis de costos se calcula con cargas consolidadas que tengan distribución de presentaciones y flete (desde Evidencias de Carga).</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl p-4 text-white">
                <div className="text-xs opacity-80 mb-1">Costo promedio</div>
                <div className="text-3xl font-bold">${promedioGlobal.toFixed(3)}</div>
                <div className="text-xs opacity-80 mt-1">por libra · {viajesValidos.length} viajes</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Libras movidas</div>
                <div className="text-2xl font-bold text-gray-900">{Math.round(totalLibras).toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-1">lbs</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">Fletes analizados</div>
                <div className="text-2xl font-bold text-gray-900">${viajesValidos.reduce((a, v) => a + v.flete, 0).toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-1">{viajesValidos.length} cargas</div>
              </div>
            </div>

            {/* Selector de vista */}
            <div className="flex flex-wrap gap-2 mb-3">
              {[["linea", "Por línea"], ["ruta", "Por ruta"], ["producto", "Por producto"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setVistaCosto(id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium ${vistaCosto === id ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-500 border border-gray-200"}`}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap gap-4 mb-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Bajo el promedio</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Hasta +15%</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> +15% o más</span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                      {vistaCosto === "linea" ? "Línea de transporte" : vistaCosto === "ruta" ? "Ruta / Destino" : "Producto"}
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Libras</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Flete</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Costo / lb</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">vs. prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {datosCosto.map((d, i) => {
                    const sem = semaforo(d.costoLb, promParaSemaforo);
                    const esRuta = vistaCosto === "ruta";
                    return (
                      <tr key={i} className={`border-b border-gray-100 ${SEMAFORO_BG[sem.color]}`}>
                        <td className="px-4 py-2.5">
                          {esRuta ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DC[d.key] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{d.key}</span>
                          ) : (
                            <span className="font-medium text-gray-800">{d.key}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{Math.round(d.libras).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">${Math.round(d.flete).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">${d.costoLb.toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-center"><span className={`inline-block w-2.5 h-2.5 rounded-full ${SEMAFORO_DOT[sem.color]}`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-400 mt-3 italic">
              * El promedio es de las cargas actuales. Con la base de datos, el semáforo comparará contra el histórico real (temporada, mes, semana).
            </div>
          </>
        )}

        {/* Tendencia de costo/lb con histórico real: pendiente hasta tener esa data en BD.
            (Se quitaron los DATOS DEMO). La tendencia real de EMPAQUE está arriba: "Vaciado por día". */}
      </div>
    </div>
  );
}