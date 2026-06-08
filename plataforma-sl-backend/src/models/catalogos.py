"""Catálogos editables in-app — doc 01 §2.

Listas de strings (zonas, consignados, inspectores, lugares, responsables) se guardan en
una tabla genérica `valores_lista` (columna `lista` discrimina cuál). El resto son tablas
propias por su forma estructurada.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base, JsonType


class Presentacion(Base):
    """catalogo: presentaciones. cajasPorParrilla es la clave del cálculo (M1/M2)."""
    __tablename__ = "presentaciones"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String, default="")
    color: Mapped[Optional[str]] = mapped_column(String, default="")
    cultivo: Mapped[Optional[str]] = mapped_column(String, default="")
    cajas_por_parrilla: Mapped[int] = mapped_column(Integer, default=0)
    libras_por_caja: Mapped[int] = mapped_column(Integer, default=0)


class Cultivo(Base):
    __tablename__ = "cultivos"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String, default="")
    color: Mapped[Optional[str]] = mapped_column(String, default="")


class LineaTransporte(Base):
    """lineas: con subcatálogos choferes/tractos/cajas embebidos (forma del front)."""
    __tablename__ = "lineas_transporte"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    linea: Mapped[str] = mapped_column(String, default="")
    contacto: Mapped[Optional[str]] = mapped_column(String, default="")
    numero: Mapped[Optional[str]] = mapped_column(String, default="")
    choferes: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    tractos: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    cajas: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)


class CargaCampo(Base):
    """cargaCampo: catálogo de 'qué se carga' en movimientos de campo."""
    __tablename__ = "carga_campo"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String, default="")


class OrigenUbicacion(Base):
    """ubicaciones.origenes: ranchos con subcatálogo de lotes y responsables."""
    __tablename__ = "ubicaciones_origenes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    nombre: Mapped[str] = mapped_column(String, default="")
    lotes: Mapped[list[str]] = mapped_column(JsonType, default=list)
    responsables: Mapped[list[str]] = mapped_column(JsonType, default=list)


class DestinoUbicacion(Base):
    """ubicaciones.destinos: empaques."""
    __tablename__ = "ubicaciones_destinos"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    nombre: Mapped[str] = mapped_column(String, default="")


class Material(Base):
    """materiales: catálogo de materiales importables (IMMEX)."""
    __tablename__ = "materiales"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    codigo: Mapped[Optional[str]] = mapped_column(String, default="")
    descripcion: Mapped[Optional[str]] = mapped_column(String, default="")
    unidad: Mapped[Optional[str]] = mapped_column(String, default="")
    fraccion: Mapped[Optional[str]] = mapped_column(String, default="")
    dias_salida: Mapped[int] = mapped_column(Integer, default=540)


class DefectoCalidad(Base):
    """defectosCalidad: defectos por producto (QC embarques M12). Agrupar por `producto`."""
    __tablename__ = "defectos_calidad"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    producto: Mapped[str] = mapped_column(String, index=True)
    label: Mapped[str] = mapped_column(String, default="")
    cat: Mapped[str] = mapped_column(String, default="calidad")  # calidad | condicion


class ValorLista(Base):
    """Tabla genérica para listas de strings: zonas, consignados, inspectoresCalidad,
    lugaresCalidad, responsables. `lista` discrimina; `orden` preserva el orden."""
    __tablename__ = "valores_lista"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lista: Mapped[str] = mapped_column(String, index=True)
    valor: Mapped[str] = mapped_column(String, default="")
    orden: Mapped[int] = mapped_column(Integer, default=0)


# Nombres válidos de listas simples (para los routers)
LISTAS_SIMPLES = ("zonas", "consignados", "inspectoresCalidad", "lugaresCalidad", "responsables")
