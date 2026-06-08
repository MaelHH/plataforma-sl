"""Trailer (viaje de exportación) — doc 01 §3 M3. status: esperando→en_instalaciones→en_ruta→entregado."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base, JsonType


class Trailer(Base):
    __tablename__ = "trailers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    fecha: Mapped[Optional[str]] = mapped_column(String, default="")
    origen: Mapped[Optional[str]] = mapped_column(String, default="")
    dest: Mapped[Optional[str]] = mapped_column(String, default="Sin asignar")
    status: Mapped[str] = mapped_column(String, default="esperando", index=True)

    # Ficha de transporte (snapshot de la línea elegida)
    linea: Mapped[Optional[str]] = mapped_column(String, default="")
    contacto: Mapped[Optional[str]] = mapped_column(String, default="")
    numero: Mapped[Optional[str]] = mapped_column(String, default="")
    chofer: Mapped[Optional[str]] = mapped_column(String, default="")
    telefono: Mapped[Optional[str]] = mapped_column(String, default="")
    licencia: Mapped[Optional[str]] = mapped_column(String, default="")
    marca_modelo: Mapped[Optional[str]] = mapped_column(String, default="")
    placa_tracto: Mapped[Optional[str]] = mapped_column(String, default="")
    economico_caja: Mapped[Optional[str]] = mapped_column(String, default="")
    placa_caja: Mapped[Optional[str]] = mapped_column(String, default="")
    flete: Mapped[Optional[str]] = mapped_column(String, default="")

    # Inspección precarga REG-EMP-15 (JSON con la forma exacta del front)
    inspeccion_precarga: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
