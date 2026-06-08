"""Estado completo en el shape EXACTO del store del front (camelCase).

Permite conectar el frontend con cambios mínimos (estrategia "sync por colección"):
- `leer_estado(db)`  → devuelve TODO el estado con las mismas llaves que el store
  (trailers, cargasEmbarques, monitoreo, catalogo, ...).
- `reemplazar_estado(parcial, db)` → recibe SOLO las colecciones que cambiaron y las
  reemplaza por completo (el front es el dueño de la verdad, igual que con localStorage).
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

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
    BitacoraOut,
    CargaCampoSchema,
    CargaOut,
    CultivoSchema,
    ImportacionIn,
    ImportacionOut,
    LineaSchema,
    MaterialSchema,
    MovimientoIn,
    MovimientoOut,
    PresentacionSchema,
    ProgramaFilaSchema,
    RequerimientoItemSchema,
    RequerimientoMetaSchema,
    TrailerIn,
    TrailerOut,
)

LISTAS = ("zonas", "consignados", "inspectoresCalidad", "lugaresCalidad", "responsables")


def _dump_list(rows, schema) -> list[dict]:
    return [schema.model_validate(r).model_dump(by_alias=True) for r in rows]


# ─────────────────────────── LECTURA ───────────────────────────
def leer_estado(db: Session) -> dict[str, Any]:
    out: dict[str, Any] = {}

    out["trailers"] = _dump_list(db.scalars(select(Trailer)).all(), TrailerOut)
    out["cargasEmbarques"] = _dump_list(db.scalars(select(CargaEmbarque)).all(), CargaOut)

    out["monitoreo"] = {
        m.trailer_id: {"preenfriado": m.preenfriado, "tive": m.tive, "retenes": m.retenes,
                       "aduanas": m.aduanas, "accidente": m.accidente}
        for m in db.scalars(select(Monitoreo)).all()
    }

    out["catalogo"] = _dump_list(db.scalars(select(Presentacion)).all(), PresentacionSchema)
    out["cultivos"] = _dump_list(db.scalars(select(Cultivo)).all(), CultivoSchema)
    out["lineas"] = _dump_list(db.scalars(select(LineaTransporte)).all(), LineaSchema)
    out["cargaCampo"] = _dump_list(db.scalars(select(CargaCampo)).all(), CargaCampoSchema)
    out["materiales"] = _dump_list(db.scalars(select(Material)).all(), MaterialSchema)
    out["movimientos"] = _dump_list(db.scalars(select(Movimiento)).all(), MovimientoOut)
    out["importaciones"] = _dump_list(db.scalars(select(Importacion)).all(), ImportacionOut)
    out["bitacora"] = _dump_list(db.scalars(select(Bitacora).order_by(Bitacora.ts.desc())).all(), BitacoraOut)

    # programa: { semana: [filas] }
    prog: dict[str, list] = {}
    for f in db.scalars(select(ProgramaFila).order_by(ProgramaFila.semana, ProgramaFila.orden)).all():
        prog.setdefault(f.semana, []).append(ProgramaFilaSchema.model_validate(f).model_dump(by_alias=True))
    out["programa"] = prog

    # requerimientoGen: { semana: [items] }
    rg: dict[str, list] = {}
    for r in db.scalars(select(RequerimientoGenItem).order_by(RequerimientoGenItem.semana, RequerimientoGenItem.orden)).all():
        rg.setdefault(r.semana, []).append(RequerimientoItemSchema.model_validate(r).model_dump(by_alias=True))
    out["requerimientoGen"] = rg

    # requerimientoMeta: { semana: {...} }
    out["requerimientoMeta"] = {
        m.semana: RequerimientoMetaSchema.model_validate(m).model_dump(by_alias=True)
        for m in db.scalars(select(RequerimientoMeta)).all()
    }

    # ubicaciones: { origenes:[...], destinos:[...] }
    out["ubicaciones"] = {
        "origenes": [{"id": o.id, "nombre": o.nombre, "lotes": o.lotes or [], "responsables": o.responsables or []}
                     for o in db.scalars(select(OrigenUbicacion)).all()],
        "destinos": [{"id": d.id, "nombre": d.nombre} for d in db.scalars(select(DestinoUbicacion)).all()],
    }

    # defectosCalidad: { producto: [ {id,label,cat} ] }  (sin 'producto' dentro, como el front)
    dc: dict[str, list] = {}
    for f in db.scalars(select(DefectoCalidad)).all():
        dc.setdefault(f.producto, []).append({"id": f.id, "label": f.label, "cat": f.cat})
    out["defectosCalidad"] = dc

    # listas simples
    for nombre in LISTAS:
        filas = db.scalars(select(ValorLista).where(ValorLista.lista == nombre).order_by(ValorLista.orden)).all()
        out[nombre] = [r.valor for r in filas]

    return out


# ─────────────────────────── ESCRITURA (reemplazo total por colección) ───────────────────────────
def _trailer_id_de(carga: dict) -> str | None:
    tid = (carga.get("trailer") or {}).get("id")
    return str(tid) if tid is not None else None


def reemplazar_estado(parcial: dict[str, Any], db: Session) -> dict[str, int]:
    """Para cada llave presente en `parcial`, borra esa colección y la reinserta."""
    n: dict[str, int] = {}

    if "trailers" in parcial:
        db.query(Trailer).delete()
        for t in parcial["trailers"]:
            db.add(Trailer(**TrailerIn.model_validate(t).model_dump(by_alias=False) | {"id": str(t.get("id"))}))
        n["trailers"] = len(parcial["trailers"])

    if "cargasEmbarques" in parcial:
        db.query(CargaEmbarque).delete()
        for ce in parcial["cargasEmbarques"]:
            data = CargaOut.model_validate(ce).model_dump(by_alias=False)
            data["trailer_id"] = _trailer_id_de(ce)
            db.add(CargaEmbarque(**data))
        n["cargasEmbarques"] = len(parcial["cargasEmbarques"])

    if "monitoreo" in parcial:
        db.query(Monitoreo).delete()
        for tid, ev in parcial["monitoreo"].items():
            db.add(Monitoreo(trailer_id=str(tid), preenfriado=ev.get("preenfriado"), tive=ev.get("tive"),
                             retenes=ev.get("retenes"), aduanas=ev.get("aduanas"), accidente=ev.get("accidente")))
        n["monitoreo"] = len(parcial["monitoreo"])

    if "catalogo" in parcial:
        db.query(Presentacion).delete()
        for p in parcial["catalogo"]:
            db.add(Presentacion(**PresentacionSchema.model_validate(p).model_dump(by_alias=False)))
        n["catalogo"] = len(parcial["catalogo"])

    if "cultivos" in parcial:
        db.query(Cultivo).delete()
        for c in parcial["cultivos"]:
            db.add(Cultivo(**CultivoSchema.model_validate(c).model_dump(by_alias=False)))
        n["cultivos"] = len(parcial["cultivos"])

    if "lineas" in parcial:
        db.query(LineaTransporte).delete()
        for l in parcial["lineas"]:
            db.add(LineaTransporte(**LineaSchema.model_validate(l).model_dump(by_alias=False)))
        n["lineas"] = len(parcial["lineas"])

    if "cargaCampo" in parcial:
        db.query(CargaCampo).delete()
        for cc in parcial["cargaCampo"]:
            db.add(CargaCampo(**CargaCampoSchema.model_validate(cc).model_dump(by_alias=False)))
        n["cargaCampo"] = len(parcial["cargaCampo"])

    if "materiales" in parcial:
        db.query(Material).delete()
        for m in parcial["materiales"]:
            db.add(Material(**MaterialSchema.model_validate(m).model_dump(by_alias=False)))
        n["materiales"] = len(parcial["materiales"])

    if "movimientos" in parcial:
        db.query(Movimiento).delete()
        for mv in parcial["movimientos"]:
            db.add(Movimiento(**MovimientoIn.model_validate(mv).model_dump(by_alias=False) | {"id": str(mv.get("id"))}))
        n["movimientos"] = len(parcial["movimientos"])

    if "importaciones" in parcial:
        db.query(Importacion).delete()
        for imp in parcial["importaciones"]:
            db.add(Importacion(**ImportacionIn.model_validate(imp).model_dump(by_alias=False) | {"id": str(imp.get("id"))}))
        n["importaciones"] = len(parcial["importaciones"])

    if "bitacora" in parcial:
        db.query(Bitacora).delete()
        for b in parcial["bitacora"]:
            db.add(Bitacora(id=str(b.get("id")), ts=b.get("ts", ""), ts_local=b.get("tsLocal", ""),
                            evento=b.get("evento", ""), modulo=b.get("modulo", ""), actor=b.get("actor"),
                            destino=b.get("destino"), ref=b.get("ref"), detalle=b.get("detalle"), meta=b.get("meta")))
        n["bitacora"] = len(parcial["bitacora"])

    if "programa" in parcial:
        db.query(ProgramaFila).delete()
        for semana, filas in parcial["programa"].items():
            for i, f in enumerate(filas):
                db.add(ProgramaFila(semana=semana, orden=i, pres_id=f.get("presId", ""), cultivo=f.get("cultivo", ""),
                                    origen=f.get("origen", ""), dest=f.get("dest", ""), dias=f.get("dias", [0] * 7)))
        n["programa"] = sum(len(v) for v in parcial["programa"].values())

    if "requerimientoGen" in parcial:
        db.query(RequerimientoGenItem).delete()
        for semana, items in parcial["requerimientoGen"].items():
            for i, it in enumerate(items):
                db.add(RequerimientoGenItem(semana=semana, orden=i, tipo=it.get("tipo", "Contrato"), fecha=it.get("fecha", ""),
                                            di_idx=it.get("diIdx", 0), origen=it.get("origen", ""), dest=it.get("dest", ""),
                                            cultivo=it.get("cultivo"), sol=it.get("sol", 0)))
        n["requerimientoGen"] = sum(len(v) for v in parcial["requerimientoGen"].values())

    if "requerimientoMeta" in parcial:
        db.query(RequerimientoMeta).delete()
        for semana, meta in parcial["requerimientoMeta"].items():
            db.add(RequerimientoMeta(semana=semana, enviado_ts=meta.get("enviadoTs", ""), enviado_local=meta.get("enviadoLocal", ""),
                                     actor=meta.get("actor", ""), lineas=meta.get("lineas", 0), trailers=meta.get("trailers", 0)))
        n["requerimientoMeta"] = len(parcial["requerimientoMeta"])

    if "ubicaciones" in parcial:
        ub = parcial["ubicaciones"] or {}
        db.query(OrigenUbicacion).delete()
        for o in ub.get("origenes", []):
            db.add(OrigenUbicacion(id=str(o.get("id")), nombre=o.get("nombre", ""), lotes=o.get("lotes", []), responsables=o.get("responsables", [])))
        db.query(DestinoUbicacion).delete()
        for d in ub.get("destinos", []):
            db.add(DestinoUbicacion(id=str(d.get("id")), nombre=d.get("nombre", "")))
        n["ubicaciones"] = len(ub.get("origenes", [])) + len(ub.get("destinos", []))

    if "defectosCalidad" in parcial:
        db.query(DefectoCalidad).delete()
        cnt = 0
        for prod, defs in parcial["defectosCalidad"].items():
            for d in defs:
                db.add(DefectoCalidad(id=str(d.get("id")), producto=prod, label=d.get("label", ""), cat=d.get("cat", "calidad")))
                cnt += 1
        n["defectosCalidad"] = cnt

    for nombre in LISTAS:
        if nombre in parcial:
            db.query(ValorLista).filter(ValorLista.lista == nombre).delete()
            for i, v in enumerate(parcial[nombre]):
                db.add(ValorLista(lista=nombre, valor=v, orden=i))
            n[nombre] = len(parcial[nombre])

    db.commit()
    return n
