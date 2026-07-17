import { Info } from "lucide-react";

// Icono ⓘ con tooltip ESTILIZADO (cuadrito oscuro que aparece al pasar el mouse).
// CSS puro (group-hover), sin estado. `children` = el contenido del tooltip (texto/fórmula).
export default function InfoTip({ children, className = "text-gray-400", width = "w-56" }) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      <Info size={11} className="cursor-help" />
      <span
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-30 hidden group-hover:block ${width} rounded-lg bg-gray-900 text-white text-[10px] leading-snug px-2.5 py-2 shadow-xl normal-case font-normal tracking-normal text-left`}
      >
        {children}
        <span className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 -mt-1 rotate-45 bg-gray-900"></span>
      </span>
    </span>
  );
}
