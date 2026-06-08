"""Movimientos Campo→Empaque (M8/M9). CRUD fiel; recepción/muestreos/inspección viajan
anidados dentro del movimiento (el front los escribe sobre el objeto completo)."""
from __future__ import annotations

from src.models import Movimiento
from src.routers._crud import crud_router
from src.schemas.modelos import MovimientoIn, MovimientoOut

router = crud_router(model=Movimiento, schema_in=MovimientoIn, schema_out=MovimientoOut,
                     prefix="/movimientos", tag="movimientos", id_prefix="MOV_")
