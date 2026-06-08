"""Registro de todos los modelos para que Base.metadata los conozca (create_all/alembic)."""
from src.models.bitacora import Bitacora
from src.models.cargas import CargaEmbarque
from src.models.catalogos import (
    LISTAS_SIMPLES,
    CargaCampo,
    Cultivo,
    DefectoCalidad,
    DestinoUbicacion,
    LineaTransporte,
    Material,
    OrigenUbicacion,
    Presentacion,
    ValorLista,
)
from src.models.importaciones import Importacion
from src.models.monitoreo import Monitoreo
from src.models.movimientos import Movimiento
from src.models.planeacion import ProgramaFila, RequerimientoGenItem, RequerimientoMeta
from src.models.trailers import Trailer

__all__ = [
    "Bitacora",
    "CargaEmbarque",
    "CargaCampo",
    "Cultivo",
    "DefectoCalidad",
    "DestinoUbicacion",
    "LineaTransporte",
    "Material",
    "OrigenUbicacion",
    "Presentacion",
    "ValorLista",
    "LISTAS_SIMPLES",
    "Importacion",
    "Monitoreo",
    "Movimiento",
    "ProgramaFila",
    "RequerimientoGenItem",
    "RequerimientoMeta",
    "Trailer",
]
