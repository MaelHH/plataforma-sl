import { Send, Trash2, RefreshCw, Check, Clock, AlertTriangle, Package, Loader2, User, Calendar } from "lucide-react";

// Lista de OV/manifiestos creados en la app (borradores + enviados a SAP). Presentacional:
// recibe los datos + callbacks de Modulo15. El envío a SAP y el cancelar viven en el padre.

const BADGE = {
  borrador:  { txt: "Borrador · en la app", cls: "bg-amber-100 text-amber-800", Icon: Clock },
  enviando:  { txt: "En proceso · verificar", cls: "bg-orange-100 text-orange-800", Icon: AlertTriangle },
  enviada:   { txt: "En SAP", cls: "bg-emerald-100 text-emerald-800", Icon: Check },
  error:     { txt: "Error", cls: "bg-red-100 text-red-700", Icon: AlertTriangle },
};

const fmtFecha = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};

export default function OrdenesVentaLista({ manifiestos, cargando, accionId, onEnviar, onCancelar, onRefrescar }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Órdenes de venta creadas
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold">{manifiestos.length} en total</span>
          <button onClick={onRefrescar} title="Recargar" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-50">
            <RefreshCw size={15} className={cargando ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="px-3 pb-3">
        {cargando && !manifiestos.length ? (
          <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Cargando órdenes…
          </div>
        ) : !manifiestos.length ? (
          <div className="py-14 px-6 text-center text-gray-400 text-sm">
            <Package size={32} className="mx-auto mb-2 text-gray-300" />
            Aún no hay órdenes de venta. Arma una en la pestaña <b>Asignar pallets</b> y guárdala.
          </div>
        ) : (
          <div className="space-y-2">
            {manifiestos.map((m) => {
              const b = BADGE[m.estado] || BADGE.borrador;
              const enSAP = m.estado === "enviada";
              const ocupado = accionId === m.id;
              return (
                <div key={m.id} className="border border-gray-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${b.cls}`}>
                        <b.Icon size={11} /> {b.txt}{enSAP && m.docNum ? ` · #${m.docNum}` : ""}
                      </span>
                      <span className="font-mono font-bold text-sm text-gray-800">{m.cardCode || "—"}</span>
                    </div>
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5 text-[11.5px] text-gray-500 font-medium">
                      <span className="inline-flex items-center gap-1"><Calendar size={12} className="text-gray-400" /> {fmtFecha(m.fecha)}</span>
                      <span className="tabular-nums"><b className="text-gray-700">{m.cajas}</b> cajas</span>
                      <span className="tabular-nums">{m.nPallets} pallets · {m.nLineas} líneas</span>
                      {m.creadoPor ? <span className="inline-flex items-center gap-1 truncate"><User size={12} className="text-gray-400" /> {m.creadoPor}</span> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {enSAP ? (
                      <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1 px-2">
                        <Check size={14} /> Lista para embarque
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => onEnviar(m)}
                          disabled={ocupado}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-[13px] bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                          {ocupado ? "Enviando…" : m.estado === "enviando" ? "Reintentar" : "Mandar a SAP"}
                        </button>
                        {m.estado === "borrador" ? (
                          <button
                            onClick={() => onCancelar(m)}
                            disabled={ocupado}
                            title="Cancelar (borrar de la app)"
                            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
