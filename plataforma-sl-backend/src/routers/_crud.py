"""Fábrica de routers CRUD genéricos para catálogos con `id` string.

Evita repetir GET/POST/PUT/DELETE. El front genera el `id` (nuevoId); si no llega, se
genera aquí conservando el prefijo legible.

NOTA: NO usar `from __future__ import annotations` aquí. El tipo del body es un parámetro
dinámico (`schema_in`); con anotaciones diferidas se volvería el string "schema_in" y
FastAPI no podría resolverlo (lo tomaría como query param → 422).
"""
from typing import Type

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config.database import Base, get_db
from src.utils.ids import nuevo_id


def crud_router(*, model: Type[Base], schema_in, schema_out, prefix: str, tag: str, id_prefix: str = "") -> APIRouter:
    r = APIRouter(prefix=prefix, tags=[tag])

    @r.get("", response_model=list[schema_out])
    def listar(db: Session = Depends(get_db)):
        return db.scalars(select(model)).all()

    @r.post("", response_model=schema_out, status_code=201)
    def crear(payload: schema_in, db: Session = Depends(get_db)):
        data = payload.model_dump(by_alias=False)
        data["id"] = data.get("id") or nuevo_id(id_prefix)
        obj = model(**data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @r.put("/{item_id}", response_model=schema_out)
    def actualizar(item_id: str, payload: schema_in, db: Session = Depends(get_db)):
        obj = db.get(model, item_id)
        if not obj:
            raise HTTPException(404, "No encontrado")
        data = payload.model_dump(by_alias=False)
        data.pop("id", None)
        for k, v in data.items():
            setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        return obj

    @r.delete("/{item_id}", status_code=204)
    def eliminar(item_id: str, db: Session = Depends(get_db)):
        obj = db.get(model, item_id)
        if not obj:
            raise HTTPException(404, "No encontrado")
        db.delete(obj)
        db.commit()

    return r
