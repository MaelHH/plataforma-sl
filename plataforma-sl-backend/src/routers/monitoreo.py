"""Monitoreo en ruta (M7). Espeja el store `monitoreo = { [trailerId]: {...} }`:
GET devuelve el objeto completo; PUT hace upsert por trailerId."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.models import Monitoreo
from src.schemas.modelos import MonitoreoIn

router = APIRouter(prefix="/monitoreo", tags=["monitoreo"])


@router.get("", response_model=dict[str, Any])
def obtener_todo(db: Session = Depends(get_db)):
    """{ trailerId: {preenfriado, tive, retenes, aduanas, accidente} }."""
    out: dict[str, Any] = {}
    for m in db.scalars(select(Monitoreo)).all():
        out[m.trailer_id] = {
            "preenfriado": m.preenfriado, "tive": m.tive, "retenes": m.retenes,
            "aduanas": m.aduanas, "accidente": m.accidente,
        }
    return out


@router.put("/{trailer_id}", response_model=MonitoreoIn)
def upsert(trailer_id: str, payload: MonitoreoIn, db: Session = Depends(get_db)):
    obj = db.get(Monitoreo, trailer_id)
    data = payload.model_dump(by_alias=False)
    if not obj:
        obj = Monitoreo(trailer_id=trailer_id, **data)
        db.add(obj)
    else:
        for k, v in data.items():
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj
