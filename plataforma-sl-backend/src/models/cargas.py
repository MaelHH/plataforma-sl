"""CargaEmbarque — doc 01 §3 M4/M5/M6/M12.

Guarda un SNAPSHOT del trailer (inmutable por diseño) + distribución por empresa +
manifiestos + estado SAP + inspección de calidad (QC). `trailer_id` se deriva del
snapshot para que M7 (monitoreo) pueda ligar carga↔trailer.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base, JsonType


class CargaEmbarque(Base):
    __tablename__ = "cargas_embarque"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    fecha: Mapped[Optional[str]] = mapped_column(String, default="")
    trailer_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)

    trailer: Mapped[dict[str, Any]] = mapped_column(JsonType)  # snapshot completo del trailer
    consolidado: Mapped[bool] = mapped_column(Boolean, default=False)
    empresas_sel: Mapped[list[str]] = mapped_column(JsonType, default=list)
    dist_empresas: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)  # {eid: Slot[30] {prod,cajas}}
    manifiestos: Mapped[dict[str, str]] = mapped_column(JsonType, default=dict)    # {eid: folio}

    # SAP: hoy un solo flag por carga (doc 01 §4.1). Extensible a "por empresa" más adelante.
    sap_status: Mapped[str] = mapped_column(String, default="pendiente", index=True)

    carga_fotos: Mapped[int] = mapped_column(Integer, default=0)
    frontal_fotos: Mapped[int] = mapped_column(Integer, default=0)

    # Inspección de calidad QC (M12), forma exacta del front
    calidad: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
