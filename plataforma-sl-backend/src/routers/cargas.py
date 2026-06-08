"""Cargas de embarque (M4/M5/M6/M12). CRUD explícito porque deriva `trailer_id` del
snapshot y ofrece la transición transaccional `devolver` (M5)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.models import CargaEmbarque, Trailer
from src.schemas.modelos import CargaIn, CargaOut
from src.utils.ids import nuevo_id

router = APIRouter(prefix="/cargas", tags=["cargas"])


def _trailer_id_de(data: dict) -> str | None:
    t = data.get("trailer") or {}
    tid = t.get("id")
    return str(tid) if tid is not None else None


@router.get("", response_model=list[CargaOut])
def listar(db: Session = Depends(get_db)):
    return db.scalars(select(CargaEmbarque)).all()


@router.post("", response_model=CargaOut, status_code=201)
def crear(payload: CargaIn, db: Session = Depends(get_db)):
    data = payload.model_dump(by_alias=False)
    data["id"] = data.get("id") or nuevo_id("CARGA_")
    obj = CargaEmbarque(**data, trailer_id=_trailer_id_de(data))
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{carga_id}", response_model=CargaOut)
def actualizar(carga_id: str, payload: CargaIn, db: Session = Depends(get_db)):
    obj = db.get(CargaEmbarque, carga_id)
    if not obj:
        raise HTTPException(404, "No encontrada")
    data = payload.model_dump(by_alias=False)
    data.pop("id", None)
    for k, v in data.items():
        setattr(obj, k, v)
    obj.trailer_id = _trailer_id_de(data) or obj.trailer_id
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{carga_id}", status_code=204)
def eliminar(carga_id: str, db: Session = Depends(get_db)):
    obj = db.get(CargaEmbarque, carga_id)
    if not obj:
        raise HTTPException(404, "No encontrada")
    db.delete(obj)
    db.commit()


@router.post("/{carga_id}/devolver", status_code=204)
def devolver(carga_id: str, db: Session = Depends(get_db)):
    """M5 'Devolver': regresa el trailer a en_instalaciones y elimina la carga
    (comportamiento actual del front). Transaccional."""
    obj = db.get(CargaEmbarque, carga_id)
    if not obj:
        raise HTTPException(404, "No encontrada")
    if obj.trailer_id:
        tr = db.get(Trailer, obj.trailer_id)
        if tr:
            tr.status = "en_instalaciones"
    db.delete(obj)
    db.commit()
