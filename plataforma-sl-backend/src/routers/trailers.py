"""Trailers (M3). CRUD fiel; el `status` se actualiza vía PUT como hace el front
(la máquina de estados esperando→en_instalaciones→en_ruta→entregado la dirige el front)."""
from __future__ import annotations

from src.models import Trailer
from src.routers._crud import crud_router
from src.schemas.modelos import TrailerIn, TrailerOut

router = crud_router(model=Trailer, schema_in=TrailerIn, schema_out=TrailerOut,
                     prefix="/trailers", tag="trailers", id_prefix="T_")
