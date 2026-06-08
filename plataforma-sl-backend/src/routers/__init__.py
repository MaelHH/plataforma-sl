"""Agregador de routers: api_router se monta en /api/v1 (ver main.py)."""
from fastapi import APIRouter

from src.routers import (
    bitacora,
    cargas,
    catalogos,
    estado,
    importaciones,
    monitoreo,
    movimientos,
    planeacion,
    trailers,
)

api_router = APIRouter()
api_router.include_router(estado.router)
api_router.include_router(catalogos.router)
api_router.include_router(trailers.router)
api_router.include_router(cargas.router)
api_router.include_router(monitoreo.router)
api_router.include_router(planeacion.router)
api_router.include_router(movimientos.router)
api_router.include_router(importaciones.router)
api_router.include_router(bitacora.router)
