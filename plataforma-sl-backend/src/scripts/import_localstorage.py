"""Importa el estado de `localStorage` del front (llave plataforma_sl_estado_v1) al backend.

Uso:
    python -m src.scripts.import_localstorage ruta/al/estado.json

Cómo obtener el JSON: en el navegador, consola →
    copy(localStorage.getItem("plataforma_sl_estado_v1"))
y pegar en un archivo .json.

Reutiliza los schemas In (camelCase→snake) para convertir cada entidad. Idempotente por
PK: hace upsert (merge) respetando los IDs existentes.
"""
from __future__ import annotations

import json
import sys
from typing import Any

from sqlalchemy.orm import Session

from src.config.database import Base, SessionLocal, engine
from src.models import (
    Bitacora,
    CargaCampo,
    CargaEmbarque,
    Cultivo,
    DefectoCalidad,
    DestinoUbicacion,
    Importacion,
    LineaTransporte,
    Material,
    Monitoreo,
    Movimiento,
    OrigenUbicacion,
    Presentacion,
    ProgramaFila,
    RequerimientoGenItem,
    RequerimientoMeta,
    Trailer,
    ValorLista,
)
from src.schemas.modelos import (
    CargaIn,
    ImportacionIn,
    MovimientoIn,
    TrailerIn,
)


def _str_id(d: dict) -> dict:
    """Coacciona id a str (mockTrailers usa ids enteros)."""
    if d.get("id") is not None:
        d["id"] = str(d["id"])
    return d


def _upsert(db: Session, modelo, pk: str, data: dict) -> None:
    obj = db.get(modelo, data[pk])
    if obj:
        for k, v in data.items():
            if k != pk:
                setattr(obj, k, v)
    else:
        db.add(modelo(**data))


def importar(estado: dict[str, Any], db: Session) -> dict[str, int]:
    n: dict[str, int] = {}

    # ── Catálogos estructurados ──
    for p in estado.get("catalogo", []):
        _upsert(db, Presentacion, "id", {
            "id": p["id"], "label": p.get("label", ""), "color": p.get("color", ""),
            "cultivo": p.get("cultivo", ""), "cajas_por_parrilla": p.get("cajasPorParrilla", 0),
            "libras_por_caja": p.get("librasPorCaja", 0)})
    n["catalogo"] = len(estado.get("catalogo", []))

    for c in estado.get("cultivos", []):
        _upsert(db, Cultivo, "id", {"id": c["id"], "label": c.get("label", ""), "color": c.get("color", "")})
    n["cultivos"] = len(estado.get("cultivos", []))

    for l in estado.get("lineas", []):
        _upsert(db, LineaTransporte, "id", {
            "id": l["id"], "linea": l.get("linea", ""), "contacto": l.get("contacto", ""),
            "numero": l.get("numero", ""), "choferes": l.get("choferes", []),
            "tractos": l.get("tractos", []), "cajas": l.get("cajas", [])})
    n["lineas"] = len(estado.get("lineas", []))

    for cc in estado.get("cargaCampo", []):
        _upsert(db, CargaCampo, "id", {"id": cc["id"], "label": cc.get("label", "")})
    n["cargaCampo"] = len(estado.get("cargaCampo", []))

    ubic = estado.get("ubicaciones", {}) or {}
    for o in ubic.get("origenes", []):
        _upsert(db, OrigenUbicacion, "id", {"id": o["id"], "nombre": o.get("nombre", ""),
                                            "lotes": o.get("lotes", []), "responsables": o.get("responsables", [])})
    for d in ubic.get("destinos", []):
        _upsert(db, DestinoUbicacion, "id", {"id": d["id"], "nombre": d.get("nombre", "")})
    n["ubicaciones"] = len(ubic.get("origenes", [])) + len(ubic.get("destinos", []))

    for m in estado.get("materiales", []):
        _upsert(db, Material, "id", {"id": m["id"], "codigo": m.get("codigo", ""), "descripcion": m.get("descripcion", ""),
                                     "unidad": m.get("unidad", ""), "fraccion": m.get("fraccion", ""),
                                     "dias_salida": m.get("diasSalida", 540)})
    n["materiales"] = len(estado.get("materiales", []))

    # defectosCalidad: { producto: [ {id,label,cat} ] }
    dc = estado.get("defectosCalidad", {}) or {}
    cnt = 0
    for prod, defs in dc.items():
        for d in defs:
            _upsert(db, DefectoCalidad, "id", {"id": d["id"], "producto": prod, "label": d.get("label", ""), "cat": d.get("cat", "calidad")})
            cnt += 1
    n["defectosCalidad"] = cnt

    # Listas simples (reemplaza por completo)
    for nombre in ("zonas", "consignados", "inspectoresCalidad", "lugaresCalidad", "responsables"):
        valores = estado.get(nombre)
        if valores is None:
            continue
        db.query(ValorLista).filter(ValorLista.lista == nombre).delete()
        for i, v in enumerate(valores):
            db.add(ValorLista(lista=nombre, valor=v, orden=i))
        n[nombre] = len(valores)

    # ── Entidades de flujo (vía schemas In: camelCase→snake) ──
    for t in estado.get("trailers", []):
        data = TrailerIn.model_validate(_str_id(dict(t))).model_dump(by_alias=False)
        _upsert(db, Trailer, "id", data)
    n["trailers"] = len(estado.get("trailers", []))

    for ce in estado.get("cargasEmbarques", []):
        data = CargaIn.model_validate(_str_id(dict(ce))).model_dump(by_alias=False)
        data["trailer_id"] = str((ce.get("trailer") or {}).get("id")) if (ce.get("trailer") or {}).get("id") is not None else None
        _upsert(db, CargaEmbarque, "id", data)
    n["cargasEmbarques"] = len(estado.get("cargasEmbarques", []))

    for mv in estado.get("movimientos", []):
        data = MovimientoIn.model_validate(_str_id(dict(mv))).model_dump(by_alias=False)
        _upsert(db, Movimiento, "id", data)
    n["movimientos"] = len(estado.get("movimientos", []))

    for imp in estado.get("importaciones", []):
        data = ImportacionIn.model_validate(_str_id(dict(imp))).model_dump(by_alias=False)
        _upsert(db, Importacion, "id", data)
    n["importaciones"] = len(estado.get("importaciones", []))

    # monitoreo: { trailerId: {preenfriado, tive, retenes, aduanas, accidente} }
    mon = estado.get("monitoreo", {}) or {}
    for tid, ev in mon.items():
        _upsert(db, Monitoreo, "trailer_id", {
            "trailer_id": str(tid), "preenfriado": ev.get("preenfriado"), "tive": ev.get("tive"),
            "retenes": ev.get("retenes"), "aduanas": ev.get("aduanas"), "accidente": ev.get("accidente")})
    n["monitoreo"] = len(mon)

    # programa: { semana: [filas] }  → reemplaza por semana
    prog = estado.get("programa", {}) or {}
    for semana, filas in prog.items():
        db.query(ProgramaFila).filter(ProgramaFila.semana == semana).delete()
        for i, f in enumerate(filas):
            db.add(ProgramaFila(semana=semana, orden=i, pres_id=f.get("presId", ""), cultivo=f.get("cultivo", ""),
                                origen=f.get("origen", ""), dest=f.get("dest", ""), dias=f.get("dias", [0] * 7)))
    n["programa"] = sum(len(v) for v in prog.values())

    # requerimientoGen: { semana: [items] }
    rg = estado.get("requerimientoGen", {}) or {}
    for semana, items in rg.items():
        db.query(RequerimientoGenItem).filter(RequerimientoGenItem.semana == semana).delete()
        for i, it in enumerate(items):
            db.add(RequerimientoGenItem(semana=semana, orden=i, tipo=it.get("tipo", "Contrato"), fecha=it.get("fecha", ""),
                                        di_idx=it.get("diIdx", 0), origen=it.get("origen", ""), dest=it.get("dest", ""),
                                        cultivo=it.get("cultivo"), sol=it.get("sol", 0)))
    n["requerimientoGen"] = sum(len(v) for v in rg.values())

    # requerimientoMeta: { semana: {...} }
    rm = estado.get("requerimientoMeta", {}) or {}
    for semana, meta in rm.items():
        _upsert(db, RequerimientoMeta, "semana", {
            "semana": semana, "enviado_ts": meta.get("enviadoTs", ""), "enviado_local": meta.get("enviadoLocal", ""),
            "actor": meta.get("actor", ""), "lineas": meta.get("lineas", 0), "trailers": meta.get("trailers", 0)})
    n["requerimientoMeta"] = len(rm)

    # bitacora: [ {...} ]
    for b in estado.get("bitacora", []):
        _upsert(db, Bitacora, "id", {
            "id": b["id"], "ts": b.get("ts", ""), "ts_local": b.get("tsLocal", ""), "evento": b.get("evento", ""),
            "modulo": b.get("modulo", ""), "actor": b.get("actor"), "destino": b.get("destino"),
            "ref": b.get("ref"), "detalle": b.get("detalle"), "meta": b.get("meta")})
    n["bitacora"] = len(estado.get("bitacora", []))

    db.commit()
    return n


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python -m src.scripts.import_localstorage ruta/al/estado.json")
        raise SystemExit(1)
    with open(sys.argv[1], encoding="utf-8") as fh:
        raw = fh.read()
    estado = json.loads(raw)
    if isinstance(estado, str):  # por si se guardó el string crudo de localStorage
        estado = json.loads(estado)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        resumen = importar(estado, db)
    finally:
        db.close()
    print("Importado:", json.dumps(resumen, ensure_ascii=False))


if __name__ == "__main__":
    main()
