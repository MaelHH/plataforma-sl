"""Movimiento Campo→Empaque (la remisión) — doc 01 §3 M8/M9.

Recepción, muestreos (máx 3) e inspección REG-EMP-24 se anidan como JSON dentro del
movimiento, tal como hace el front (M9 los escribe sobre el movimiento de M8).
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base, JsonType


class Movimiento(Base):
    __tablename__ = "movimientos"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    # Encabezado del viaje
    folio: Mapped[Optional[str]] = mapped_column(String, default="")
    fecha: Mapped[Optional[str]] = mapped_column(String, default="")
    viaje: Mapped[Optional[str]] = mapped_column(String, default="")
    rancho: Mapped[Optional[str]] = mapped_column(String, default="")
    lote: Mapped[Optional[str]] = mapped_column(String, default="")
    hora_inicio: Mapped[Optional[str]] = mapped_column(String, default="")
    hora_termino: Mapped[Optional[str]] = mapped_column(String, default="")
    responsable_cosecha: Mapped[Optional[str]] = mapped_column(String, default="")

    # Empresa / ruta
    consignado: Mapped[Optional[str]] = mapped_column(String, default="")
    distribuidor: Mapped[Optional[str]] = mapped_column(String, default="")
    origen: Mapped[Optional[str]] = mapped_column(String, default="")
    destino: Mapped[Optional[str]] = mapped_column(String, index=True, default="")

    # Carga + remisión + peso
    carga_items: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)  # [{prod,parrillas,bultos}]
    remision: Mapped[Optional[str]] = mapped_column(String, index=True, default="")
    peso_bascula: Mapped[Optional[str]] = mapped_column(String, default="")

    # Transporte (snapshot)
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
    tel_operador: Mapped[Optional[str]] = mapped_column(String, default="")
    inicio_preenfriado: Mapped[Optional[str]] = mapped_column(String, default="")
    termino_preenfriado: Mapped[Optional[str]] = mapped_column(String, default="")
    flete: Mapped[Optional[str]] = mapped_column(String, default="")

    responsable: Mapped[Optional[str]] = mapped_column(String, default="")
    creado: Mapped[Optional[str]] = mapped_column(String, default="")
    actualizado: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Anidados que llena M9 (Recepción en Empaque)
    recepcion: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
    muestreos: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JsonType, nullable=True)
    inspeccion: Mapped[Optional[dict[str, Any]]] = mapped_column(JsonType, nullable=True)
