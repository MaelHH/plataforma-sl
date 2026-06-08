"""Planeación (M1/M2). Espeja los store keys `programa`, `requerimientoGen` y
`requerimientoMeta` (objetos indexados por semana = lunes YYYY-MM-DD).

El cálculo de trailers / generación del requerimiento lo hace el FRONT (no se cambia esa
lógica); el backend persiste el resultado. PUT por semana reemplaza el arreglo completo.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.models import ProgramaFila, RequerimientoGenItem, RequerimientoMeta
from src.schemas.modelos import ProgramaFilaSchema, RequerimientoItemSchema, RequerimientoMetaSchema

router = APIRouter(tags=["planeacion"])


# ─── Programa (M1) ───
@router.get("/programa", response_model=dict[str, list[ProgramaFilaSchema]])
def obtener_programa(db: Session = Depends(get_db)):
    out: dict[str, list] = {}
    for f in db.scalars(select(ProgramaFila).order_by(ProgramaFila.semana, ProgramaFila.orden)).all():
        out.setdefault(f.semana, []).append(f)
    return out


@router.put("/programa/{semana}", response_model=list[ProgramaFilaSchema])
def reemplazar_programa(semana: str, filas: list[ProgramaFilaSchema], db: Session = Depends(get_db)):
    db.query(ProgramaFila).filter(ProgramaFila.semana == semana).delete()
    for i, f in enumerate(filas):
        db.add(ProgramaFila(semana=semana, orden=i, **f.model_dump(by_alias=False)))
    db.commit()
    return filas


# ─── Requerimiento generado (M2) ───
@router.get("/requerimiento-gen", response_model=dict[str, list[RequerimientoItemSchema]])
def obtener_requerimiento(db: Session = Depends(get_db)):
    out: dict[str, list] = {}
    for r in db.scalars(select(RequerimientoGenItem).order_by(RequerimientoGenItem.semana, RequerimientoGenItem.orden)).all():
        out.setdefault(r.semana, []).append(r)
    return out


@router.put("/requerimiento-gen/{semana}", response_model=list[RequerimientoItemSchema])
def reemplazar_requerimiento(semana: str, items: list[RequerimientoItemSchema], db: Session = Depends(get_db)):
    db.query(RequerimientoGenItem).filter(RequerimientoGenItem.semana == semana).delete()
    for i, it in enumerate(items):
        db.add(RequerimientoGenItem(semana=semana, orden=i, **it.model_dump(by_alias=False)))
    db.commit()
    return items


# ─── Requerimiento meta (M2) ───
@router.get("/requerimiento-meta", response_model=dict[str, RequerimientoMetaSchema])
def obtener_meta(db: Session = Depends(get_db)):
    return {m.semana: m for m in db.scalars(select(RequerimientoMeta)).all()}


@router.put("/requerimiento-meta/{semana}", response_model=RequerimientoMetaSchema)
def upsert_meta(semana: str, meta: RequerimientoMetaSchema, db: Session = Depends(get_db)):
    obj = db.get(RequerimientoMeta, semana)
    data = meta.model_dump(by_alias=False)
    if not obj:
        obj = RequerimientoMeta(semana=semana, **data)
        db.add(obj)
    else:
        for k, v in data.items():
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj
