"""Routers de catálogos — doc 01 §2. Estructurados vía CRUD genérico; listas simples y
defectos (agrupados por producto) con endpoints propios.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.models import (
    LISTAS_SIMPLES,
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
from src.routers._crud import crud_router
from src.schemas.modelos import (
    CargaCampoSchema,
    CultivoSchema,
    DefectoSchema,
    DestinoSchema,
    LineaSchema,
    MaterialSchema,
    OrigenSchema,
    PresentacionSchema,
)
from src.utils.ids import nuevo_id

router = APIRouter()

# Catálogos estructurados (CRUD genérico)
router.include_router(crud_router(model=Presentacion, schema_in=PresentacionSchema, schema_out=PresentacionSchema, prefix="/catalogo", tag="catalogo-presentaciones", id_prefix="PRES_"))
router.include_router(crud_router(model=Cultivo, schema_in=CultivoSchema, schema_out=CultivoSchema, prefix="/cultivos", tag="catalogo-cultivos", id_prefix="CUL_"))
router.include_router(crud_router(model=LineaTransporte, schema_in=LineaSchema, schema_out=LineaSchema, prefix="/lineas", tag="catalogo-lineas", id_prefix="LN_"))
router.include_router(crud_router(model=CargaCampo, schema_in=CargaCampoSchema, schema_out=CargaCampoSchema, prefix="/carga-campo", tag="catalogo-carga-campo", id_prefix="CC_"))
router.include_router(crud_router(model=OrigenUbicacion, schema_in=OrigenSchema, schema_out=OrigenSchema, prefix="/ubicaciones/origenes", tag="catalogo-origenes", id_prefix="OR_"))
router.include_router(crud_router(model=DestinoUbicacion, schema_in=DestinoSchema, schema_out=DestinoSchema, prefix="/ubicaciones/destinos", tag="catalogo-destinos", id_prefix="DE_"))
router.include_router(crud_router(model=Material, schema_in=MaterialSchema, schema_out=MaterialSchema, prefix="/materiales", tag="catalogo-materiales", id_prefix="mat_"))


# ─── Defectos de calidad (agrupados por producto, M12) ───
defectos = APIRouter(prefix="/defectos-calidad", tags=["catalogo-defectos"])


@defectos.get("", response_model=dict[str, list[DefectoSchema]])
def listar_defectos(db: Session = Depends(get_db)):
    """Devuelve { producto: [defecto,...] }, el shape que consume el front (defectosCalidad)."""
    filas = db.scalars(select(DefectoCalidad)).all()
    agrupado: dict[str, list] = {}
    for f in filas:
        agrupado.setdefault(f.producto, []).append(f)
    return agrupado


@defectos.post("", response_model=DefectoSchema, status_code=201)
def crear_defecto(payload: DefectoSchema, db: Session = Depends(get_db)):
    data = payload.model_dump(by_alias=False)
    data["id"] = data.get("id") or nuevo_id(f"{data['producto']}__")
    obj = DefectoCalidad(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@defectos.put("/{def_id}", response_model=DefectoSchema)
def actualizar_defecto(def_id: str, payload: DefectoSchema, db: Session = Depends(get_db)):
    obj = db.get(DefectoCalidad, def_id)
    if not obj:
        raise HTTPException(404, "No encontrado")
    data = payload.model_dump(by_alias=False)
    data.pop("id", None)
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@defectos.delete("/{def_id}", status_code=204)
def eliminar_defecto(def_id: str, db: Session = Depends(get_db)):
    obj = db.get(DefectoCalidad, def_id)
    if not obj:
        raise HTTPException(404, "No encontrado")
    db.delete(obj)
    db.commit()


router.include_router(defectos)


# ─── Listas simples de strings (zonas, consignados, inspectoresCalidad, lugaresCalidad, responsables) ───
listas = APIRouter(prefix="/listas", tags=["catalogo-listas"])


@listas.get("/{nombre}", response_model=list[str])
def obtener_lista(nombre: str, db: Session = Depends(get_db)):
    if nombre not in LISTAS_SIMPLES:
        raise HTTPException(404, f"Lista desconocida. Válidas: {LISTAS_SIMPLES}")
    filas = db.scalars(select(ValorLista).where(ValorLista.lista == nombre).order_by(ValorLista.orden)).all()
    return [f.valor for f in filas]


@listas.put("/{nombre}", response_model=list[str])
def reemplazar_lista(nombre: str, valores: list[str], db: Session = Depends(get_db)):
    """Reemplaza la lista completa (el front edita arreglos de strings)."""
    if nombre not in LISTAS_SIMPLES:
        raise HTTPException(404, f"Lista desconocida. Válidas: {LISTAS_SIMPLES}")
    db.query(ValorLista).filter(ValorLista.lista == nombre).delete()
    for i, v in enumerate(valores):
        db.add(ValorLista(lista=nombre, valor=v, orden=i))
    db.commit()
    return valores


router.include_router(listas)
