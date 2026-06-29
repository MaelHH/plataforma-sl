import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

// Dropdown con búsqueda. Reemplaza a <select> en toda la app para soportar
// listas gigantes. El buscador aparece solo cuando hay más de `searchThreshold`
// opciones (en listas chicas se comporta como un select normal).
//
// El panel de opciones se dibuja en un PORTAL (sobre document.body, posición
// fija) para que NUNCA lo recorte un contenedor con overflow (tablas con scroll,
// modales, etc.).
//
// Props:
//   value        valor seleccionado
//   onChange(v)  recibe el valor directamente (no el evento)
//   options      [{ value, label, disabled? }]
//   placeholder  texto cuando no hay selección
//   className    clases del botón (mismo look que los inputs/INP de la app)
//   disabled     deshabilita el control
//   searchThreshold  cuántas opciones para mostrar el buscador (default 7)
export default function SearchSelect({
  value,
  onChange,
  options = [],
  placeholder = "— Selecciona —",
  className = "",
  disabled = false,
  searchThreshold = 7,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0); // índice resaltado por teclado
  const [coords, setCoords] = useState(null); // { top, left, width } del panel flotante
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value) || null;

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => String(o.label).toLowerCase().includes(t));
  }, [q, options]);

  const mostrarBuscador = options.length > searchThreshold;

  // Calcula la posición del panel a partir del botón (posición fija en viewport).
  const recalcular = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  const toggle = () => {
    if (disabled) return;
    setOpen((o) => {
      if (!o) { setQ(""); setHi(0); recalcular(); }
      return !o;
    });
  };

  // Mientras está abierto: reposicionar al hacer scroll/resize, cerrar al clic fuera,
  // enfocar el buscador.
  useEffect(() => {
    if (!open) return;
    recalcular();
    if (mostrarBuscador) setTimeout(() => inputRef.current?.focus(), 0);

    const onScroll = () => recalcular();
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, mostrarBuscador, recalcular]);

  const elegir = (op) => {
    if (op.disabled) return;
    onChange?.(op.value);
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtradas.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtradas[hi]) elegir(filtradas[hi]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={`${className} flex items-center justify-between gap-1 text-left ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={`truncate ${selected ? "" : "text-gray-400"}`}>{selected ? selected.label : placeholder}</span>
        <span className="text-gray-400 text-[10px] shrink-0">▾</span>
      </button>

      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
        >
          {mostrarBuscador && (
            <div className="p-1.5 border-b border-gray-100">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setHi(0); }}
                onKeyDown={onKey}
                placeholder="Buscar…"
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400"
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400 italic">Sin resultados</div>
            ) : (
              filtradas.map((o, i) => {
                const activo = o.value === value;
                const resaltado = i === hi;
                return (
                  <button
                    key={o.value + "_" + i}
                    type="button"
                    disabled={o.disabled}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => elegir(o)}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                      o.disabled ? "text-gray-300 cursor-not-allowed" : resaltado ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                    } ${activo ? "font-semibold" : ""}`}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {activo && <Check size={14} className="text-blue-500 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
