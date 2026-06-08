"""Estado completo (shape del store del front) — para conectar el frontend con cambios
mínimos (sync por colección). Ver src/services/estado_service.py."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.services.estado_service import leer_estado, reemplazar_estado

router = APIRouter(prefix="/estado", tags=["estado"])


@router.get("")
def obtener_estado(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Todo el estado con las mismas llaves del store (hidratación del front)."""
    return leer_estado(db)


@router.put("")
def guardar_estado(parcial: dict[str, Any] = Body(...), db: Session = Depends(get_db)) -> dict[str, int]:
    """Reemplaza SOLO las colecciones presentes en el body (sync por colección)."""
    return reemplazar_estado(parcial, db)
