import { Send, X, AlertTriangle, Loader2, Building2, Calendar } from "lucide-react";

// Panel de confirmación antes de MANDAR A SAP: muestra EXACTAMENTE lo que se creará en SAP
// (cliente, fecha, cada línea con sus dimensiones y folios, totales) + advertencia de que la OV
// no se puede borrar. Igual que el vaciado: "esto es lo que se manda, ¿seguro?".

export default function ConfirmarEnvioSAP({ m, cliente, enviando, onConfirm, onCancel }) {
  if (!m) return null;
  const lineas = m.lineas || [];
  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-50" onClick={enviando ? undefined : onCancel} />
      <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-600 grid place-items-center text-white shrink-0"><Send size={19} /></div>
                <div>
                  <h3 className="text-base font-bold text-gray-800 leading-tight">¿Mandar esta OV a SAP?</h3>
                  <p className="text-xs text-gray-500">Revisa lo que se va a crear en SAP antes de enviar.</p>
                </div>
              </div>
              <button onClick={onCancel} disabled={enviando} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-40"><X size={18} /></button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3.5 text-sm">
              <span className="inline-flex items-center gap-1.5 text-gray-700 font-semibold"><Building2 size={14} className="text-gray-400" /> {cliente} <span className="font-mono text-gray-400 font-normal">({m.cardCode})</span></span>
              <span className="inline-flex items-center gap-1.5 text-gray-700 font-semibold"><Calendar size={14} className="text-gray-400" /> {m.fecha || "—"}</span>
            </div>
          </div>

          {/* Advertencia */}
          <div className="mx-5 mt-4 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>Se creará la <b>Orden de Venta + la asignación de pallets</b> en SAP. Una vez creada, <b>no se puede borrar desde la app</b> (solo se cancela en SAP).</span>
          </div>

          {/* Líneas que se mandan */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Se enviará · {m.nLineas} línea{m.nLineas === 1 ? "" : "s"}</div>
            {lineas.map((l, i) => (
              <div key={i} className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="font-mono font-extrabold text-sm text-gray-800">{l.pt}</span>
                  <div className="text-right leading-none"><div className="font-mono font-bold text-base text-gray-800">{l.cajas}</div><div className="text-[10px] text-gray-400 font-bold uppercase">cajas</div></div>
                </div>
                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Cultivo <b>{l.cultivo || "—"}</b></span>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Lote <b className="text-gray-800">{l.lote}</b></span>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Depto <b className="text-gray-800">{l.depto || "—"}</b></span>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">{(l.pallets || []).length} pallet{(l.pallets || []).length === 1 ? "" : "s"}</span>
                </div>
                <div className="flex flex-wrap gap-1 px-2.5 py-2 border-t border-gray-200">
                  {(l.pallets || []).map((p) => (
                    <span key={p.palletDet} className="font-mono text-[11px] font-medium bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">{p.folio}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer: totales + acciones */}
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500 font-semibold tabular-nums">
              <b className="text-gray-800">{(m.cajas || 0).toLocaleString("es-MX")}</b> cajas · {m.nPallets} pallets · {m.nLineas} líneas
            </div>
            <div className="flex gap-2">
              <button onClick={onCancel} disabled={enviando} className="px-4 py-2.5 rounded-lg font-bold text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Cancelar</button>
              <button onClick={onConfirm} disabled={enviando} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-70">
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {enviando ? "Enviando…" : "Sí, mandar a SAP"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
