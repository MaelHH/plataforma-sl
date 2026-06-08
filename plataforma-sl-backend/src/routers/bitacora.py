"""Bitácora (§5). GET lista (más reciente primero); POST registra un evento estampando
ts/tsLocal en el servidor (equivalente a registrarEvento del front)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.models import Bitacora
from src.schemas.modelos import BitacoraIn, BitacoraOut
from src.utils.ids import nuevo_id
from src.utils.tiempo import ahora

router = APIRouter(prefix="/bitacora", tags=["bitacora"])


@router.get("", response_model=list[BitacoraOut])
def listar(db: Session = Depends(get_db)):
    return db.scalars(select(Bitacora).order_by(Bitacora.ts.desc())).all()


@router.post("", response_model=BitacoraOut, status_code=201)
def registrar(payload: BitacoraIn, db: Session = Depends(get_db)):
    t = ahora()
    obj = Bitacora(id=nuevo_id(), ts=t["iso"], ts_local=t["local"], **payload.model_dump(by_alias=False))
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj
