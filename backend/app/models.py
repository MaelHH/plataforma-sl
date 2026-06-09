"""Tablas de la base de datos.

Estrategia de arranque (pragmática): en vez de modelar a mano las decenas de
campos anidados que hoy tiene el frontend, guardamos cada registro como un
documento con su JSON. Así reemplazamos localStorage SIN reescribir el frontend,
y más adelante normalizamos tabla por tabla lo que convenga.

- users      → usuarios y login
- documents  → colecciones (trailers, movimientos, cargasEmbarques, ...). Cada
               item es una fila: { id, collection, data }
- kv         → "singletons" (programa, monitoreo, defectosCalidad, ...) guardados
               como un solo objeto por clave
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, JSON
from .database import Base


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, default="")
    role = Column(String, default="usuario")  # ej. direccion, trafico, calidad, campo...
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_now)


class Document(Base):
    __tablename__ = "documents"
    id = Column(String, primary_key=True, default=_uuid)
    collection = Column(String, index=True, nullable=False)
    data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class KV(Base):
    __tablename__ = "kv"
    key = Column(String, primary_key=True)
    data = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=_now, onupdate=_now)
