import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, X } from "lucide-react";

// Sistema de diálogos con el estilo de la app (reemplaza window.confirm/alert/prompt).
// Uso dentro de cualquier componente bajo <DialogProvider>:
//   const dlg = useDialog();
//   if (await dlg.confirm({ title, message, danger: true })) { ... }
//   await dlg.alerta({ title, message });
//   const txt = await dlg.prompt({ title, message, placeholder });
// Cada método admite un string suelto como atajo: dlg.confirm("¿Seguro?").
const DialogCtx = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useDialog() {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error("useDialog debe usarse dentro de <DialogProvider>");
  return ctx;
}

export function DialogProvider({ children }) {
  const [cfg, setCfg] = useState(null); // { tipo, title, message, confirmText, cancelText, danger, placeholder }
  const [valor, setValor] = useState("");
  const resolver = useRef(null);

  const cerrar = useCallback((resultado) => {
    setCfg(null);
    const r = resolver.current;
    resolver.current = null;
    if (r) r(resultado);
  }, []);

  const abrir = useCallback((tipo, opts) => {
    const o = typeof opts === "string" ? { message: opts } : (opts || {});
    setValor(o.defaultValue || "");
    return new Promise((resolve) => {
      resolver.current = resolve;
      setCfg({ tipo, ...o });
    });
  }, []);

  const api = useMemo(() => ({
    confirm: (opts) => abrir("confirm", opts),
    alerta: (opts) => abrir("alert", opts),
    prompt: (opts) => abrir("prompt", opts),
  }), [abrir]);

  const aceptar = useCallback(() => {
    if (cfg?.tipo === "prompt") cerrar(valor.trim());
    else cerrar(true);
  }, [cfg, valor, cerrar]);

  const cancelar = useCallback(() => {
    // confirm → false · prompt → null · alert → true (no tiene "cancelar" real)
    cerrar(cfg?.tipo === "alert" ? true : cfg?.tipo === "prompt" ? null : false);
  }, [cfg, cerrar]);

  useEffect(() => {
    if (!cfg) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cancelar(); }
      else if (e.key === "Enter" && cfg.tipo !== "prompt") { e.preventDefault(); aceptar(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cfg, aceptar, cancelar]);

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {cfg && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
          onMouseDown={(e) => { if (e.target === e.currentTarget) cancelar(); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-[fadeIn_.12s_ease-out]">
            <div className="flex items-start gap-3 px-5 pt-5 pb-3">
              <span className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full ${
                cfg.danger ? "bg-red-100 text-red-600" : cfg.tipo === "alert" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
              }`}>
                {cfg.danger ? <AlertTriangle size={18} /> : <Info size={18} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">
                  {cfg.title || (cfg.tipo === "alert" ? "Aviso" : "Confirmar")}
                </div>
                {cfg.message && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line break-words">{cfg.message}</p>}
                {cfg.tipo === "prompt" && (
                  <input
                    autoFocus
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aceptar(); } }}
                    placeholder={cfg.placeholder || ""}
                    className="w-full mt-3 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                )}
              </div>
              <button onClick={cancelar} className="shrink-0 text-gray-300 hover:text-gray-600" title="Cerrar"><X size={16} /></button>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
              {cfg.tipo !== "alert" && (
                <button onClick={cancelar} className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">
                  {cfg.cancelText || "Cancelar"}
                </button>
              )}
              <button
                autoFocus={cfg.tipo !== "prompt"}
                onClick={aceptar}
                className={`text-xs px-4 py-2 rounded-lg font-semibold text-white ${
                  cfg.danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {cfg.confirmText || (cfg.tipo === "alert" ? "Entendido" : "Aceptar")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DialogCtx.Provider>
  );
}
