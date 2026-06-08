"""Planeación — doc 01 §3 M1/M2.

- ProgramaFila: filas del programa semanal (programa[semanaLunesISO] = [fila]).
- RequerimientoGenItem: requerimiento generado (requerimientoGen[semana] = [req]).
- RequerimientoMeta: metadatos del envío del requerimiento (uno por semana).
La semana es el lunes en formato YYYY-MM-DD. `orden` preserva el orden del arreglo.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base, JsonType


class ProgramaFila(Base):
    __tablename__ = "programa_filas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    semana: Mapped[str] = mapped_column(String, index=True)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    pres_id: Mapped[Optional[str]] = mapped_column(String, default="")
    cultivo: Mapped[Optional[str]] = mapped_column(String, default="")
    origen: Mapped[Optional[str]] = mapped_column(String, default="")
    dest: Mapped[Optional[str]] = mapped_column(String, default="")
    dias: Mapped[list[int]] = mapped_column(JsonType, default=lambda: [0] * 7)


class RequerimientoGenItem(Base):
    __tablename__ = "requerimiento_gen"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    semana: Mapped[str] = mapped_column(String, index=True)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    tipo: Mapped[str] = mapped_column(String, default="Contrato")  # "Contrato" | "M. Abierto"
    fecha: Mapped[Optional[str]] = mapped_column(String, default="")
    di_idx: Mapped[int] = mapped_column(Integer, default=0)
    origen: Mapped[Optional[str]] = mapped_column(String, default="")
    dest: Mapped[Optional[str]] = mapped_column(String, default="")
    cultivo: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sol: Mapped[int] = mapped_column(Integer, default=0)


class RequerimientoMeta(Base):
    __tablename__ = "requerimiento_meta"

    semana: Mapped[str] = mapped_column(String, primary_key=True)
    enviado_ts: Mapped[Optional[str]] = mapped_column(String, default="")
    enviado_local: Mapped[Optional[str]] = mapped_column(String, default="")
    actor: Mapped[Optional[str]] = mapped_column(String, default="")
    lineas: Mapped[int] = mapped_column(Integer, default=0)
    trailers: Mapped[int] = mapped_column(Integer, default=0)
