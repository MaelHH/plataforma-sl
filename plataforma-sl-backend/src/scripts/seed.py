"""Seed idempotente de catálogos (lección del vault: 'migraciones idempotentes al arranque').

Solo siembra una tabla si está VACÍA — nunca pisa datos reales. Seguro de re-ejecutar.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.models import (
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
from src.scripts import datos_iniciales as D


def _vacia(db: Session, modelo) -> bool:
    return db.scalar(select(func.count()).select_from(modelo)) == 0


def _sembrar_lista(db: Session, nombre: str, valores: list[str]) -> None:
    existe = db.scalar(select(func.count()).select_from(ValorLista).where(ValorLista.lista == nombre))
    if existe:
        return
    for i, v in enumerate(valores):
        db.add(ValorLista(lista=nombre, valor=v, orden=i))


def seed_catalogos(db: Session) -> None:
    if _vacia(db, Presentacion):
        for p in D.CATALOGO_INICIAL:
            db.add(Presentacion(id=p["id"], label=p["label"], color=p["color"], cultivo=p["cultivo"],
                                cajas_por_parrilla=p["cajasPorParrilla"], libras_por_caja=p["librasPorCaja"]))
    if _vacia(db, Cultivo):
        for c in D.CULTIVOS_INICIAL:
            db.add(Cultivo(id=c["id"], label=c["label"], color=c["color"]))
    if _vacia(db, LineaTransporte):
        for l in D.LINEAS_INICIAL:
            db.add(LineaTransporte(id=l["id"], linea=l["linea"], contacto=l["contacto"], numero=l["numero"],
                                   choferes=l["choferes"], tractos=l["tractos"], cajas=l["cajas"]))
    if _vacia(db, CargaCampo):
        for cc in D.CARGA_CAMPO_INICIAL:
            db.add(CargaCampo(id=cc["id"], label=cc["label"]))
    if _vacia(db, OrigenUbicacion):
        for o in D.UBICACIONES_ORIGENES_INICIAL:
            db.add(OrigenUbicacion(id=o["id"], nombre=o["nombre"], lotes=o["lotes"], responsables=o["responsables"]))
    if _vacia(db, DestinoUbicacion):
        for d in D.UBICACIONES_DESTINOS_INICIAL:
            db.add(DestinoUbicacion(id=d["id"], nombre=d["nombre"]))
    if _vacia(db, Material):
        for m in D.MATERIALES_INICIAL:
            db.add(Material(id=m["id"], codigo=m["codigo"], descripcion=m["descripcion"], unidad=m["unidad"],
                            fraccion=m["fraccion"], dias_salida=m["diasSalida"]))
    if _vacia(db, DefectoCalidad):
        for f in D.defectos_iniciales():
            db.add(DefectoCalidad(id=f["id"], producto=f["producto"], label=f["label"], cat=f["cat"]))

    _sembrar_lista(db, "zonas", D.ZONAS_INICIAL)
    _sembrar_lista(db, "consignados", D.CONSIGNADOS_INICIAL)
    _sembrar_lista(db, "inspectoresCalidad", D.INSPECTORES_QC_INICIAL)
    _sembrar_lista(db, "lugaresCalidad", D.LUGARES_QC_INICIAL)
    _sembrar_lista(db, "responsables", D.RESPONSABLES_INICIAL)

    db.commit()
