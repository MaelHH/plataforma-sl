"""Bitácora / auditoría (append-only) — doc 01 §5.
Esquema: { id, ts, tsLocal, evento, modulo, actor?, destino?, ref?, detalle?, meta? }.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base, JsonType


class Bitacora(Base):
    __tablename__ = "bitacora"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ts: Mapped[str] = mapped_column(String, index=True)
    ts_local: Mapped[Optional[str]] = mapped_column(String, default="")
    evento: Mapped[str] = mapped_column(String, index=True)
    modulo: Mapped[Optional[str]] = mapped_column(String, default="")
    actor: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    destino: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    detalle: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    meta: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
