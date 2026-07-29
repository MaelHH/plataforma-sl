import { useState, useRef, useEffect, useMemo } from "react";
import { Check } from "lucide-react";

// Combo de TEXTO LIBRE con sugerencias (autocompletar). A diferencia de SearchSelect,
// aquí el valor puede ser cualquier texto que el usuario escriba; las opciones solo
// sugieren mientras teclea. Reemplaza al <datalist> nativo (que no se puede estilizar).
//
// Props:
//   value        texto actual
//   onChange(v)  recibe el texto (al teclear o al elegir una sugerencia)
//   options      string[]  sugerencias
//   placeholder, className (mismas clases que los inputs de la app)
//   maxList      máximo de sugerencias a mostrar (default 50)
export default function ComboLibre({ value, onChange, options = [], placeholder = "", className = "", maxList = 50 }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const rootRef = useRef(null);

  const filtradas = useMemo(() => {
    const t = String(value || "").trim().toLowerCase();
    const base = t ? options.filter((o) => String(o).toLowerCase().includes(t)) : options;
    return base.slice(0, maxList);
  }, [value, options, maxList]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const elegir = (v) => { onChange?.(v); setOpen(false); setHi(-1); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, filtradas.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { if (open && filtradas[hi]) { e.preventDefault(); elegir(filtradas[hi]); } }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value || ""}
        onChange={(e) => { onChange?.(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && filtradas.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto py-1">
          {filtradas.map((o, i) => {
            const activo = o === value;
            return (
              <button
                key={o + "_" + i}
                type="button"
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => { e.preventDefault(); elegir(o); }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${i === hi ? "bg-emerald-50 text-emerald-700" : "text-gray-700 hover:bg-gray-50"} ${activo ? "font-semibold" : ""}`}
              >
                <span className="flex-1 truncate">{o}</span>
                {activo && <Check size={13} className="text-emerald-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
