"""Monitoreo en ruta — doc 01 §3 M7. Un registro por trailer (monitoreo[trailerId]).

5 eventos como JSON con la forma exacta del front (preenfriado tiene temps[30] y fotos[8];
los demás fotos[4]).
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base, JsonType


class Monitoreo(Base):
    __tablename__ = "monitoreo"

    trailer_id: Mapped[str] = mapped_column(String, primary_key=True)
    preenfriado: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
    tive: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
    retenes: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
    aduanas: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
    accidente: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
