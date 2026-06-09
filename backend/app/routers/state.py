"""Guardado de 'singletons': objetos únicos que no son listas con id.

Sirve para: programa, monitoreo, requerimientoGen, requerimientoMeta, ubicaciones,
defectosCalidad, responsables, inspectoresCalidad, lugaresCalidad.

Endpoints:
  GET /api/state/{clave}   → devuelve el objeto guardado (o null)
  PUT /api/state/{clave}   → guarda/reemplaza el objeto completo

Nota: "state" es palabra reservada; no la uses como nombre de colección.
"""
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/state", tags=["state"])


@router.get("/{clave}")
def obtener(clave: str, db: Session = Depends(get_db)):
    kv = db.get(models.KV, clave)
    return kv.data if kv else None


@router.put("/{clave}")
def guardar(clave: str, body=Body(default={}), db: Session = Depends(get_db)):
    kv = db.get(models.KV, clave)
    if kv:
        kv.data = body
    else:
        kv = models.KV(key=clave, data=body)
        db.add(kv)
    db.commit()
    return {"ok": True}
