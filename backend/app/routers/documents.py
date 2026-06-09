"""CRUD genérico de colecciones.

Una "colección" es cada lista de tu store: trailers, movimientos, cargasEmbarques,
catalogo, cultivos, lineas, materiales, importaciones, bitacora, cargaCampo...

Endpoints:
  GET    /api/{coleccion}            → lista todos los items
  POST   /api/{coleccion}            → crea (o reemplaza si el body trae id)
  PUT    /api/{coleccion}/{id}       → crea o actualiza ese item
  DELETE /api/{coleccion}/{id}       → elimina ese item
"""
import uuid
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db

router = APIRouter(prefix="/api", tags=["colecciones"])


def _con_id(doc: models.Document) -> dict:
    data = dict(doc.data or {})
    data["id"] = doc.id
    return data


@router.get("/{coleccion}")
def listar(coleccion: str, db: Session = Depends(get_db)):
    docs = db.query(models.Document).filter(models.Document.collection == coleccion).all()
    return [_con_id(d) for d in docs]


@router.post("/{coleccion}")
def crear(coleccion: str, body: dict = Body(default={}), db: Session = Depends(get_db)):
    doc_id = str(body.get("id") or uuid.uuid4())
    data = {k: v for k, v in body.items() if k != "id"}
    doc = db.get(models.Document, doc_id)
    if doc:
        doc.data, doc.collection = data, coleccion
    else:
        doc = models.Document(id=doc_id, collection=coleccion, data=data)
        db.add(doc)
    db.commit()
    db.refresh(doc)
    return _con_id(doc)


@router.put("/{coleccion}/{doc_id}")
def guardar(coleccion: str, doc_id: str, body: dict = Body(default={}), db: Session = Depends(get_db)):
    data = {k: v for k, v in body.items() if k != "id"}
    doc = db.get(models.Document, doc_id)
    if doc:
        doc.data, doc.collection = data, coleccion
    else:
        doc = models.Document(id=doc_id, collection=coleccion, data=data)
        db.add(doc)
    db.commit()
    db.refresh(doc)
    return _con_id(doc)


@router.delete("/{coleccion}/{doc_id}")
def eliminar(coleccion: str, doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(models.Document, doc_id)
    if doc:
        db.delete(doc)
        db.commit()
    return {"ok": True}
