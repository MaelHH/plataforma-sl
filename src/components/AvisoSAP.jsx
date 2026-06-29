// Letrero visible en los módulos donde se sube / impacta SAP.
// Los PUNTOS de SAP los definió el negocio (ver docs/CLAUDE.md → Restricciones):
//   - Recepción en Empaque (M9): orden de producción (materia prima) + orden de compra (flete).
//   - Consolidado y Fletes (M6): manifiesto y fletes.
// `monoEmpresa` añade el recordatorio de que SAP es mono-empresa (consolidados → por empresa).
import { Link2 } from "lucide-react";

export default function AvisoSAP({ children, monoEmpresa = false }) {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-800 mb-4">
      <Link2 size={15} className="shrink-0 mt-0.5 text-amber-700" />
      <div>
        <b>Punto de integración con SAP</b> <span className="text-amber-600">(pendiente de implementar)</span>. {children}
        {monoEmpresa && <> SAP es <b>mono-empresa</b>: en consolidados hay que <b>dividir y subir por empresa</b>.</>}
      </div>
    </div>
  );
}
