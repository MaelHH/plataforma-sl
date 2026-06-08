"""Importación temporal IMMEX — doc 01 §3 M10. items[] como JSON (forma del front)."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base, JsonType


class Importacion(Base):
    __tablename__ = "importaciones"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    folio: Mapped[Optional[str]] = mapped_column(String, default="")
    proveedor: Mapped[Optional[str]] = mapped_column(String, default="")
    pais_origen: Mapped[Optional[str]] = mapped_column(String, default="")
    factura: Mapped[Optional[str]] = mapped_column(String, default="")
    moneda: Mapped[Optional[str]] = mapped_column(String, default="USD")  # USD | MXN | EUR
    tipo_cambio: Mapped[Optional[str]] = mapped_column(String, default="")
    fecha_importacion: Mapped[Optional[str]] = mapped_column(String, default="")
    pedimento: Mapped[Optional[str]] = mapped_column(String, default="")
    aduana: Mapped[Optional[str]] = mapped_column(String, default="")
    agente_aduanal: Mapped[Optional[str]] = mapped_column(String, default="")
    patente: Mapped[Optional[str]] = mapped_column(String, default="")
    transportista: Mapped[Optional[str]] = mapped_column(String, default="")
    chofer: Mapped[Optional[str]] = mapped_column(String, default="")
    placas: Mapped[Optional[str]] = mapped_column(String, default="")
    estado: Mapped[str] = mapped_column(String, default="borrador", index=True)  # borrador|documentada|en_proceso|retornada
    observaciones: Mapped[Optional[str]] = mapped_column(String, default="")
    items: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    creado: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    actualizado: Mapped[Optional[str]] = mapped_column(String, nullable=True)
