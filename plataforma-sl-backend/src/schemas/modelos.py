"""Schemas Pydantic (camelCase vía CamelModel).

Los sub-objetos de forma fija del front (inspeccionPrecarga, distEmpresas, monitoreo,
recepcion, muestreos, inspeccion, items, calidad) se tipan como dict/list libres a
propósito: el front es dueño de su forma y el backend los almacena VERBATIM (doc 01 §2).
`id` es opcional en entrada: si el front no lo manda, el backend lo genera con nuevoId().
"""
from __future__ import annotations

from typing import Any, Optional

from src.schemas.base import CamelModel

# ─── Trailer (M3) ───
class TrailerIn(CamelModel):
    id: Optional[str] = None
    fecha: str = ""
    origen: str = ""
    dest: str = "Sin asignar"
    status: str = "esperando"
    linea: str = ""
    contacto: str = ""
    numero: str = ""
    chofer: str = ""
    telefono: str = ""
    licencia: str = ""
    marca_modelo: str = ""
    placa_tracto: str = ""
    economico_caja: str = ""
    placa_caja: str = ""
    flete: str = ""
    inspeccion_precarga: Optional[dict[str, Any]] = None


class TrailerOut(TrailerIn):
    id: str


# ─── CargaEmbarque (M4/M5/M6/M12) ───
class CargaIn(CamelModel):
    id: Optional[str] = None
    fecha: str = ""
    trailer: dict[str, Any] = {}
    consolidado: bool = False
    empresas_sel: list[str] = []
    dist_empresas: dict[str, Any] = {}
    manifiestos: dict[str, str] = {}
    sap_status: str = "pendiente"
    carga_fotos: int = 0
    frontal_fotos: int = 0
    calidad: Optional[dict[str, Any]] = None


class CargaOut(CargaIn):
    id: str


# ─── Monitoreo (M7) ───
class MonitoreoIn(CamelModel):
    preenfriado: Optional[dict[str, Any]] = None
    tive: Optional[dict[str, Any]] = None
    retenes: Optional[dict[str, Any]] = None
    aduanas: Optional[dict[str, Any]] = None
    accidente: Optional[dict[str, Any]] = None


class MonitoreoOut(MonitoreoIn):
    trailer_id: str


# ─── Programa (M1) ───
class ProgramaFilaSchema(CamelModel):
    pres_id: str = ""
    cultivo: str = ""
    origen: str = ""
    dest: str = ""
    dias: list[int] = [0, 0, 0, 0, 0, 0, 0]


# ─── Requerimiento (M2) ───
class RequerimientoItemSchema(CamelModel):
    tipo: str = "Contrato"
    fecha: str = ""
    di_idx: int = 0
    origen: str = ""
    dest: str = ""
    cultivo: Optional[str] = None
    sol: int = 0


class RequerimientoMetaSchema(CamelModel):
    enviado_ts: str = ""
    enviado_local: str = ""
    actor: str = ""
    lineas: int = 0
    trailers: int = 0


class RequerimientoSemanaOut(CamelModel):
    items: list[RequerimientoItemSchema] = []
    meta: Optional[RequerimientoMetaSchema] = None


# ─── Movimiento (M8/M9) ───
class MovimientoIn(CamelModel):
    id: Optional[str] = None
    folio: str = ""
    fecha: str = ""
    viaje: str = ""
    rancho: str = ""
    lote: str = ""
    hora_inicio: str = ""
    hora_termino: str = ""
    responsable_cosecha: str = ""
    consignado: str = ""
    distribuidor: str = ""
    origen: str = ""
    destino: str = ""
    carga_items: list[dict[str, Any]] = []
    remision: str = ""
    peso_bascula: str = ""
    linea: str = ""
    contacto: str = ""
    numero: str = ""
    chofer: str = ""
    telefono: str = ""
    licencia: str = ""
    marca_modelo: str = ""
    placa_tracto: str = ""
    economico_caja: str = ""
    placa_caja: str = ""
    tel_operador: str = ""
    inicio_preenfriado: str = ""
    termino_preenfriado: str = ""
    flete: str = ""
    responsable: str = ""
    creado: Optional[str] = None
    actualizado: Optional[str] = None
    recepcion: Optional[dict[str, Any]] = None
    muestreos: Optional[list[dict[str, Any]]] = None
    inspeccion: Optional[dict[str, Any]] = None


class MovimientoOut(MovimientoIn):
    id: str


# ─── Importación (M10) ───
class ImportacionIn(CamelModel):
    id: Optional[str] = None
    folio: str = ""
    proveedor: str = ""
    pais_origen: str = ""
    factura: str = ""
    moneda: str = "USD"
    tipo_cambio: str = ""
    fecha_importacion: str = ""
    pedimento: str = ""
    aduana: str = ""
    agente_aduanal: str = ""
    patente: str = ""
    transportista: str = ""
    chofer: str = ""
    placas: str = ""
    estado: str = "borrador"
    observaciones: str = ""
    items: list[dict[str, Any]] = []
    creado: Optional[str] = None
    actualizado: Optional[str] = None


class ImportacionOut(ImportacionIn):
    id: str


# ─── Bitácora (§5) ───
class BitacoraIn(CamelModel):
    evento: str
    modulo: str = ""
    actor: Optional[str] = None
    destino: Optional[str] = None
    ref: Optional[str] = None
    detalle: Optional[Any] = None
    meta: Optional[dict[str, Any]] = None


class BitacoraOut(BitacoraIn):
    id: str
    ts: str
    ts_local: str = ""


# ─── Catálogos ───
class PresentacionSchema(CamelModel):
    id: Optional[str] = None
    label: str = ""
    color: str = ""
    cultivo: str = ""
    cajas_por_parrilla: int = 0
    libras_por_caja: int = 0


class CultivoSchema(CamelModel):
    id: Optional[str] = None
    label: str = ""
    color: str = ""


class LineaSchema(CamelModel):
    id: Optional[str] = None
    linea: str = ""
    contacto: str = ""
    numero: str = ""
    choferes: list[dict[str, Any]] = []
    tractos: list[dict[str, Any]] = []
    cajas: list[dict[str, Any]] = []


class CargaCampoSchema(CamelModel):
    id: Optional[str] = None
    label: str = ""


class OrigenSchema(CamelModel):
    id: Optional[str] = None
    nombre: str = ""
    lotes: list[str] = []
    responsables: list[str] = []


class DestinoSchema(CamelModel):
    id: Optional[str] = None
    nombre: str = ""


class MaterialSchema(CamelModel):
    id: Optional[str] = None
    codigo: str = ""
    descripcion: str = ""
    unidad: str = ""
    fraccion: str = ""
    dias_salida: int = 540


class DefectoSchema(CamelModel):
    id: Optional[str] = None
    producto: str = ""
    label: str = ""
    cat: str = "calidad"
