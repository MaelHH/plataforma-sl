import { useState, useEffect, useMemo, useCallback } from "react";
import { Truck, Search, Loader2, AlertCircle, Send, Check } from "lucide-react";
import {
  getFleteManifiestos, getFleteEntrega, getFleteProveedores, getFleteArticulos, crearOcFlete,
} from "../store/api";
import SearchSelect from "../components/SearchSelect";

// OC de flete desde manifiesto (Fase 7): buscas un manifiesto → su Entrega → capturas proveedor/flete/
// IVA/precio/diésel → se crea 1 OC (PurchaseOrders) en SAP con el flete PRORRATEADO POR CAJAS. Recrea el
// proyecto de escritorio de forma segura, corrigiendo la matemática. El backend recalcula al crear.

const INP = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white";
const LB = "block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1";
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const money = (n) => "$" + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

// Prorrateo proporcional a cajas (espejo del backend `oc_flete_calc.prorratear`; el backend es el autoritativo).
function prorratear(importe, lineas, ivaRate) {
  const total = lineas.reduce((a, l) => a + (Number(l.cajas) || 0), 0);
  if (!(importe > 0) || total <= 0) return null;
  const porCaja = importe / total;
  const bases = lineas.map((l) => r2(porCaja * (Number(l.cajas) || 0)));
  const residual = r2(importe - bases.reduce((a, b) => a + b, 0));
  let idx = 0; lineas.forEach((l, i) => { if ((Number(l.cajas) || 0) > (Number(lineas[idx].cajas) || 0)) idx = i; });
  bases[idx] = r2(bases[idx] + residual);
  const rows = lineas.map((l, i) => {
    const base = bases[i]; const cajas = Number(l.cajas) || 0;
    const iva = r2(base * ivaRate);
    return { ...l, base, iva, total: r2(base + iva), unit: cajas ? base / cajas : 0, ajuste: i === idx && residual !== 0, residual: i === idx ? residual : 0 };
  });
  const sumBase = r2(rows.reduce((a, x) => a + x.base, 0));
  const sumIva = r2(rows.reduce((a, x) => a + x.iva, 0));
  return { importe: r2(importe), totalCajas: total, porCaja, rows, sumBase, sumIva, docTotal: r2(sumBase + sumIva), residual };
}

export default function OcFlete() {
  const [manifiesto, setManifiesto] = useState("");
  const [entrega, setEntrega] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [manifiestosDisp, setManifiestosDisp] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [fletes, setFletes] = useState([]);

  const [prov, setProv] = useState("");
  const [flete, setFlete] = useState("");
  const [ivaCode, setIvaCode] = useState("IVAA16");
  const [precio, setPrecio] = useState("");
  const [diesel, setDiesel] = useState("0");
  const [comentario, setComentario] = useState("");
  const [fecha, setFecha] = useState(hoyISO());

  const [creando, setCreando] = useState(false);
  const [creado, setCreado] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getFleteManifiestos().then((r) => setManifiestosDisp(r?.manifiestos || [])).catch(() => {});
    getFleteProveedores().then((r) => setProveedores(r?.value || [])).catch(() => {});
    getFleteArticulos().then((r) => setFletes(r?.value || [])).catch(() => {});
  }, []);

  const buscar = useCallback(async (mArg) => {
    const m = (typeof mArg === "string" ? mArg : manifiesto).trim();
    if (!m || buscando) return;
    setBuscando(true); setError(""); setEntrega(null); setCreado(null);
    try {
      setEntrega(await getFleteEntrega(m));
    } catch (e) {
      setError(e?.message || "No se encontró la Entrega de ese manifiesto.");
    } finally { setBuscando(false); }
  }, [manifiesto, buscando]);

  const elegirManifiesto = useCallback((v) => { setManifiesto(v); buscar(v); }, [buscar]);

  const importe = useMemo(() => r2((Number(precio) || 0) - (Number(diesel) || 0)), [precio, diesel]);
  const ivaRate = ivaCode === "IVAA16" ? 0.16 : 0;
  const calc = useMemo(
    () => (entrega ? prorratear(importe, entrega.lineas || [], ivaRate) : null),
    [entrega, importe, ivaRate]
  );
  const puede = !!(entrega && prov && flete && importe > 0 && calc && !creando && !creado);

  const crear = useCallback(async () => {
    if (!puede) return;
    setCreando(true); setError("");
    try {
      const r = await crearOcFlete({
        manifiesto: manifiesto.trim(), proveedor: prov, flete, ivaCode,
        precio: Number(precio) || 0, diesel: Number(diesel) || 0, comentario, fecha,
      });
      setCreado(r);
    } catch (e) {
      setError((e?.sinRespuesta ? "Sin confirmación de SAP — verifica antes de reintentar. " : "") + (e?.message || "No se pudo crear la OC."));
    } finally { setCreando(false); }
  }, [puede, manifiesto, prov, flete, ivaCode, precio, diesel, comentario, fecha]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      {/* ENTRADA */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 self-start">
        <div>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">1 · Manifiesto</span>
          <div className="flex gap-2 mt-2">
            <div className="flex-1 min-w-0">
              <SearchSelect value={manifiesto} onChange={elegirManifiesto} allowCustom
                placeholder="Elige o teclea un nº de manifiesto"
                className={INP + " font-mono"}
                options={manifiestosDisp.map((m) => ({
                  value: m.manifiesto,
                  label: `${m.manifiesto}${m.cardCode ? " · " + m.cardCode : ""}${m.ovNum ? " · OV " + m.ovNum : ""}${m.tieneOC ? " · ya tiene OC" : ""}`,
                }))} />
            </div>
            <button onClick={() => buscar()} disabled={!manifiesto.trim() || buscando}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400">
              {buscando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar
            </button>
          </div>
          {manifiestosDisp.length ? (
            <div className="text-[10.5px] text-gray-400 mt-1.5">{manifiestosDisp.length} manifiesto{manifiestosDisp.length === 1 ? "" : "s"} de tus embarques · o teclea uno manual</div>
          ) : null}
        </div>

        <div className="pt-1">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">2 · Transporte y flete</span>
          <div className="mt-2 space-y-3">
            <div>
              <label className={LB}>Proveedor (transportista)</label>
              <SearchSelect value={prov} onChange={setProv} placeholder="— selecciona —"
                options={proveedores.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))} />
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div>
                <label className={LB}>Flete (artículo)</label>
                <SearchSelect value={flete} onChange={setFlete} placeholder="— flete —"
                  options={fletes.map((f) => ({ value: f.code, label: `${f.code} · ${f.name}` }))} />
              </div>
              <div>
                <label className={LB}>IVA</label>
                <select value={ivaCode} onChange={(e) => setIvaCode(e.target.value)} className={INP + " font-mono"}>
                  <option value="IVAA16">IVAA16 · 16%</option>
                  <option value="IVAA0">IVAA0 · 0%</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LB}>Precio del flete</label>
                <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0.00"
                  inputMode="decimal" className={INP + " font-mono"} />
              </div>
              <div>
                <label className={LB}>Diésel (se resta)</label>
                <input value={diesel} onChange={(e) => setDiesel(e.target.value)} placeholder="0.00"
                  inputMode="decimal" className={INP + " font-mono"} />
              </div>
            </div>
            <div>
              <label className={LB}>Comentario</label>
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2}
                placeholder="Ej. Flete manifiesto…" className={INP} />
            </div>
            <div>
              <label className={LB}>Fecha de la OC</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INP + " font-mono"} />
            </div>
          </div>
        </div>
      </div>

      {/* SALIDA */}
      <div className="min-w-0">
        {error ? (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-700 flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}</div>
        ) : null}

        {creado ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-3">
            <div className="font-bold text-emerald-800 flex items-center gap-2"><Check size={17} /> OC de flete creada en SAP{creado.yaExistia ? " (ya existía)" : ""} · manifiesto {creado.manifiesto}</div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Kpi lab="Nº documento" val={creado.docNum ?? "—"} />
              <Kpi lab="Total sin impuestos" val={money(creado.sumBase)} />
              <Kpi lab="Total con IVA" val={creado.docTotal != null ? money(creado.docTotal) : "—"} />
            </div>
          </div>
        ) : null}

        {!entrega ? (
          <div className="py-20 text-center text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
            {buscando ? <><Loader2 size={18} className="inline animate-spin mr-2" />Buscando la Entrega…</> : "Busca un manifiesto para ver su Entrega y prorratear el flete."}
          </div>
        ) : (
          <div className="space-y-3">
            {/* cabecera entrega */}
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="text-[15px] font-extrabold uppercase tracking-tight">{entrega.cardName || entrega.cardCode}</span>
                <span className="font-mono text-[11.5px] text-gray-400 ml-2">{entrega.cardCode}</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-md">Entrega #{entrega.docNum} · {entrega.totalCajas} cajas</span>
            </div>

            {importe <= 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold text-amber-800 flex items-start gap-2"><AlertCircle size={15} className="mt-0.5 shrink-0" /> Captura el precio del flete: el Importe neto (precio − diésel = {money(importe)}) debe ser mayor a 0.</div>
            ) : calc ? (<>
              <div className="font-mono text-[11.5px] text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2">
                prorrateo = ( <b className="text-emerald-700">Importe</b> ÷ cajas ) × cajas del lote → ( {money(calc.importe)} ÷ {calc.totalCajas} ) = <b className="text-emerald-700">{money(calc.porCaja)}</b> por caja
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Kpi lab="Importe neto (pre-IVA)" val={money(calc.importe)} em />
                <Kpi lab="Total de cajas" val={calc.totalCajas} />
                <Kpi lab="Importe por caja" val={money(calc.porCaja)} />
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 text-[10px] font-bold uppercase tracking-wide">
                        <th className="text-left px-3 py-2">Lote</th><th className="text-left px-3 py-2">Cultivo</th>
                        <th className="text-right px-3 py-2">Cajas</th><th className="text-right px-3 py-2">P. unit</th>
                        <th className="text-right px-3 py-2">Base</th><th className="text-right px-3 py-2">IVA</th><th className="text-right px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.rows.map((x, i) => (
                        <tr key={i} className={`border-t border-gray-100 ${x.ajuste ? "bg-amber-50" : ""}`}>
                          <td className="px-3 py-2 font-mono">{x.lote || "—"}</td>
                          <td className="px-3 py-2">{x.cultivo || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{x.cajas}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-500">{money(x.unit)}</td>
                          <td className="px-3 py-2 text-right font-mono">{money(x.base)}{x.ajuste ? <span className="ml-1 text-[9px] font-bold text-amber-700">{x.residual >= 0 ? "+" : ""}{x.residual.toFixed(2)}</span> : null}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-500">{money(x.iva)}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold">{money(x.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 font-bold">
                        <td className="px-3 py-2 text-[10px] uppercase text-gray-400">Totales</td><td></td>
                        <td className="px-3 py-2 text-right font-mono">{calc.totalCajas}</td><td></td>
                        <td className="px-3 py-2 text-right font-mono">{money(calc.sumBase)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(calc.sumIva)}</td>
                        <td className="px-3 py-2 text-right font-mono">{money(calc.docTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div className={`text-[12.5px] font-bold flex items-center gap-2 ${calc.sumBase === calc.importe ? "text-emerald-700" : "text-red-600"}`}>
                {calc.sumBase === calc.importe ? "✓" : "✗"} Suma de bases {money(calc.sumBase)} {calc.sumBase === calc.importe ? "= Importe (cuadra exacto)" : `≠ Importe (${money(calc.importe)})`} · el IVA lo agrega SAP con el TaxCode.
              </div>
              <div className="flex justify-end pt-1">
                {creado ? null : (
                  <button onClick={crear} disabled={!puede}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm ${!puede ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                    {creando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {creando ? "Creando…" : "Crear OC de flete"}
                  </button>
                )}
              </div>
            </>) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ lab, val, em }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${em ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{lab}</div>
      <div className={`text-lg font-bold font-mono mt-0.5 ${em ? "text-emerald-700" : "text-gray-800"}`}>{val}</div>
    </div>
  );
}
