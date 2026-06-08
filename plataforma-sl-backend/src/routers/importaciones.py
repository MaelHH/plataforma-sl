"""Importaciones IMMEX (M10). CRUD fiel; items[] anidados."""
from __future__ import annotations

from src.models import Importacion
from src.routers._crud import crud_router
from src.schemas.modelos import ImportacionIn, ImportacionOut

router = crud_router(model=Importacion, schema_in=ImportacionIn, schema_out=ImportacionOut,
                     prefix="/importaciones", tag="importaciones", id_prefix="imp_")
