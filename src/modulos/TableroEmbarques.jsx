import { useState, useMemo } from "react";
import {
  Search, RefreshCw, Loader2, Check, Clock, Send, Trash2, X, Package, AlertTriangle, Truck,
} from "lucide-react";
import NuevoEmbarque from "./NuevoEmbarque";

// Tablero de Embarques: la lista de OV/manifiestos de la app + su control. Portado del mockup.
// Muestra los DOS caminos: 'En SAP' (OV real en SAP) y 'En la app' (borrador / macro, aún sin SAP).
// El pipeline ASIG→EMB→MANIF→FLETE→FACT: por ahora solo ASIG (en SAP); el resto se reconcilia
// automático desde SAP en la siguiente fase (por eso van como pendientes).

const PASOS = ["Asig", "Emb", "Manif", "Flete", "Fact"];
const PASOS_F = ["Asignación", "Embarque", "Manifiesto", "OC de flete", "Factura"];

// s = [asig, emb, manif, flete, fact] (1 = completado). Hoy solo sabemos ASIG (en SAP).
const pasosDe = (m) => [m.estado === "enviada" ? 1 : 0, 0, 0, 0, 0];

const fmtFecha = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }); }
  catch { return iso; }
};

function Pipe({ s, full }) {
  const L = full ? PASOS_F : PASOS;
  return (
    <div className="flex items-center">
      {L.map((t, i) => {
        const done = s[i] === 1;
        const active = !done && (i === 0 || s[i - 1] === 1);
        return (
          <div key={t} className="flex items-center">
            <div className="flex flex-col items-center gap-1" style={{ minWidth: full ? 62 : 48 }}>
              <span className={`w-6 h-6 rounded-full grid place-items-center border-2 text-[11px] font-bold ${
                done ? "bg-emerald-600 border-emerald-600 text-white"
                : active ? "border-emerald-500 border-dashed text-emerald-600 bg-white"
                : "border-gray-300 text-gray-400 bg-white"
              }`}>
                {done ? <Check size={12} strokeWidth={3.5} /> : i + 1}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-wide ${done ? "text-gray-500" : "text-gray-400"}`}>{t}</span>
            </div>
            {i < 4 ? <span className={`h-0.5 w-4 -mt-4 ${done ? "bg-emerald-600" : "bg-gray-300"}`} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function SapBadge({ m }) {
  return m.estado === "enviada" ? (
    <span className="text-[11px] font-bold px-2 py-1 rounded-full inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 whitespace-nowrap">
      <Check size={13} /> En SAP{m.docNum ? ` #${m.docNum}` : ""}
    </span>
  ) : (
    <span className="text-[11px] font-bold px-2 py-1 rounded-full inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 whitespace-nowrap">
      <Clock size={13} /> Por enviar
    </span>
  );
}

function EstadoPill({ m }) {
  const map = {
    borrador: ["bg-amber-100 text-amber-800", "Borrador · en la app"],
    enviando: ["bg-orange-100 text-orange-800", "En proceso"],
    enviada: ["bg-emerald-50 text-emerald-700", "Asignada · por embarcar"],
    error: ["bg-red-100 text-red-700", "Error"],
  };
  const [cls, txt] = map[m.estado] || map.borrador;
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>{txt}</span>;
}

export default function TableroEmbarques({ manifiestos, clientes, cargando, accionId, onEnviar, onCancelar, onRefrescar }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [sel, setSel] = useState(null); // manifiesto abierto en el drawer
  const [nuevoEmb, setNuevoEmb] = useState(false); // pantalla "Nuevo embarque"

  const nombreCliente = useMemo(() => {
    const m = new Map((clientes || []).map((c) => [c.CardCode, c.CardName]));
    return (cc) => m.get(cc) || cc || "—";
  }, [clientes]);

  const kpis = useMemo(() => {
    const cajas = manifiestos.reduce((a, m) => a + (m.cajas || 0), 0);
    const pallets = manifiestos.reduce((a, m) => a + (m.nPallets || 0), 0);
    const enApp = manifiestos.filter((m) => m.estado !== "enviada").length;
    const enSAP = manifiestos.filter((m) => m.estado === "enviada").length;
    return [
      { v: manifiestos.length, l: "Órdenes", s: "en total", c: "border-emerald-500" },
      { v: cajas.toLocaleString("es-MX"), l: "Cajas totales", s: "en todas las OV", c: "border-sky-500" },
      { v: enApp, l: "En la app", s: "por mandar a SAP", c: enApp ? "border-amber-500" : "border-gray-300" },
      { v: enSAP, l: "En SAP", s: "OV creadas", c: "border-emerald-500" },
      { v: pallets, l: "Pallets", s: "asignados", c: "border-gray-300" },
    ];
  }, [manifiestos]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return manifiestos.filter((m) => {
      if (filtro === "borrador" && m.estado === "enviada") return false;
      if (filtro === "sap" && m.estado !== "enviada") return false;
      if (t) {
        const hay = `${m.docNum || ""} ${m.cardCode || ""} ${nombreCliente(m.cardCode)} ${(m.productos || []).join(" ")}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [manifiestos, filtro, q, nombreCliente]);

  const SEGS = [
    { id: "todas", txt: "Todas" },
    { id: "borrador", txt: "En la app" },
    { id: "sap", txt: "En SAP" },
  ];

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.l} className={`bg-white border border-gray-200 rounded-xl px-4 py-3 border-l-[3px] ${k.c}`}>
            <div className="text-2xl font-extrabold text-gray-800 tabular-nums leading-none">{k.v}</div>
            <div className="text-[11.5px] text-gray-500 font-semibold mt-1.5">{k.l}</div>
            <div className="text-[11px] text-gray-400 font-medium">{k.s}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por OV, cliente o producto…"
            className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex gap-0.5 bg-gray-100 border border-gray-200 rounded-lg p-1">
          {SEGS.map((s) => (
            <button key={s.id} onClick={() => setFiltro(s.id)}
              className={`text-[12.5px] font-bold px-3 py-1.5 rounded-md ${filtro === s.id ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {s.txt}
            </button>
          ))}
        </div>
        <button onClick={() => setNuevoEmb(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700">
          <Truck size={16} /> Nuevo embarque
        </button>
        <button onClick={onRefrescar} title="Recargar" className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-100 border border-gray-200">
          <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
        </button>
      </div>

      {nuevoEmb ? (
        <NuevoEmbarque onClose={() => setNuevoEmb(false)} onCreated={() => { onRefrescar && onRefrescar(); }} />
      ) : null}

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[920px]">
            <thead>
              <tr className="bg-gray-50">
                {["OV", "Fecha", "Cliente", "Productos", "Cajas", "Pallets", "Control (asignar → embarque → manifiesto → flete → factura)", "Estado", "SAP"].map((h, i) => (
                  <th key={h} className={`text-[10.5px] font-bold uppercase tracking-wide text-gray-400 px-3.5 py-3 border-b border-gray-200 whitespace-nowrap ${i === 4 || i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando && !lista.length ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-12"><Loader2 size={16} className="inline animate-spin mr-2" />Cargando órdenes…</td></tr>
              ) : !lista.length ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-12">
                  <Package size={30} className="mx-auto mb-2 text-gray-300" />
                  Sin órdenes que coincidan. Arma una en <b>Asignar pallets</b>.
                </td></tr>
              ) : (
                lista.map((m) => (
                  <tr key={m.id} onClick={() => setSel(m)} className="hover:bg-gray-50 cursor-pointer group">
                    <td className="px-3.5 py-3 border-b border-gray-100">
                      <span className="font-mono font-bold text-[15px] text-gray-800">{m.docNum ? m.docNum : <span className="text-amber-600 text-xs">Borrador</span>}</span>
                    </td>
                    <td className="px-3.5 py-3 border-b border-gray-100 font-mono text-[12.5px] text-gray-500">{fmtFecha(m.fecha)}</td>
                    <td className="px-3.5 py-3 border-b border-gray-100">
                      <div className="font-bold text-gray-800 text-[13.5px] leading-tight truncate max-w-[160px]">{nombreCliente(m.cardCode)}</div>
                      <div className="font-mono text-[11px] text-gray-400">{m.cardCode}</div>
                    </td>
                    <td className="px-3.5 py-3 border-b border-gray-100">
                      <div className="flex gap-1 flex-wrap max-w-[190px]">
                        {(m.productos || []).slice(0, 3).map((p) => <span key={p} className="font-mono text-[10.5px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{p}</span>)}
                        {(m.productos || []).length > 3 ? <span className="font-mono text-[10.5px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">+{m.productos.length - 3}</span> : null}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 border-b border-gray-100 text-right"><span className="font-mono font-bold text-[15px] text-gray-800">{(m.cajas || 0).toLocaleString("es-MX")}</span></td>
                    <td className="px-3.5 py-3 border-b border-gray-100 text-right"><span className="font-mono font-bold text-[15px] text-gray-800">{m.nPallets}</span><div className="text-[11px] text-gray-400 font-semibold">pallets</div></td>
                    <td className="px-3.5 py-3 border-b border-gray-100"><Pipe s={pasosDe(m)} /></td>
                    <td className="px-3.5 py-3 border-b border-gray-100"><EstadoPill m={m} /></td>
                    <td className="px-3.5 py-3 border-b border-gray-100"><SapBadge m={m} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer detalle */}
      {sel ? <Drawer m={sel} nombreCliente={nombreCliente} accionId={accionId} onEnviar={onEnviar} onCancelar={onCancelar} onClose={() => setSel(null)} /> : null}
    </div>
  );
}

function Drawer({ m, nombreCliente, accionId, onEnviar, onCancelar, onClose }) {
  const ocupado = accionId === m.id;
  const enSAP = m.estado === "enviada";
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[min(520px,94vw)] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">
        <div className="px-5 pt-5 pb-4 border-b border-gray-200 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono font-extrabold text-2xl text-gray-800 leading-none">{m.docNum ? `OV ${m.docNum}` : "Borrador"}</div>
              <div className="text-xs text-gray-400 font-semibold mt-1">Orden de venta · embarque</div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 grid place-items-center hover:text-red-500 hover:border-red-300"><X size={17} /></button>
          </div>
          <div className="flex gap-2 flex-wrap"><EstadoPill m={m} /><SapBadge m={m} /></div>
          <div className="flex gap-5 flex-wrap">
            {[["Cliente", nombreCliente(m.cardCode)], ["Fecha", fmtFecha(m.fecha)], ["Cajas", (m.cajas || 0).toLocaleString("es-MX")], ["Pallets", m.nPallets]].map(([k, v]) => (
              <div key={k}><div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k}</div><div className="font-bold text-sm text-gray-800">{v}</div></div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2.5">Control del embarque</div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 flex justify-center mb-5"><Pipe s={pasosDe(m)} full /></div>

          {!enSAP ? (
            <div className="mb-4 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Esta OV está <b>en la app</b>, aún no en SAP. Al mandarla a SAP se crea la OV real + la asignación de pallets.
            </div>
          ) : null}

          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2.5">Líneas y pallets · {m.nPallets} pallets</div>
          {(m.lineas || []).map((l, i) => (
            <div key={i} className="border border-gray-200 rounded-lg mb-2.5 bg-gray-50 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono font-extrabold text-sm text-gray-800">{l.pt}</span>
                </div>
                <div className="text-right leading-none"><div className="font-mono font-bold text-base text-gray-800">{l.cajas}</div><div className="text-[10px] text-gray-400 font-bold uppercase">cajas</div></div>
              </div>
              <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Cultivo <b>{l.cultivo || "—"}</b></span>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Lote <b className="text-gray-800">{l.lote}</b></span>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Depto <b className="text-gray-800">{l.depto || "—"}</b></span>
              </div>
              <div className="flex flex-wrap gap-1 px-2.5 py-2 border-t border-gray-200">
                {(l.pallets || []).map((p) => (
                  <span key={p.palletDet} className="font-mono text-[11px] font-medium bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-500">{p.folio}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50 flex gap-2.5">
          {enSAP ? (
            <span className="flex-1 text-center text-sm font-semibold text-emerald-700 inline-flex items-center justify-center gap-1.5 py-2"><Check size={16} /> Lista para embarque (en SAP)</span>
          ) : (
            <>
              <button onClick={() => onEnviar(m)} disabled={ocupado}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {ocupado ? "Enviando…" : m.estado === "enviando" ? "Reintentar envío" : "Mandar a SAP"}
              </button>
              {m.estado === "borrador" ? (
                <button onClick={() => onCancelar(m)} disabled={ocupado}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-bold text-sm border border-gray-300 text-gray-600 hover:border-red-400 hover:text-red-600 disabled:opacity-40">
                  <Trash2 size={15} /> Cancelar
                </button>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
