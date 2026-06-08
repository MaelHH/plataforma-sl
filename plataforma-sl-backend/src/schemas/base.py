"""Base Pydantic v2 con alias camelCase.

DECISIÓN (doc 02 §3): el API expone/recibe camelCase IDÉNTICO al shape del store del
front (cargasEmbarques, sapStatus, distEmpresas, ...), para que el frontend solo cambie
su ORIGEN de datos (fetch en vez de localStorage) sin tocar lógica. Internamente Python
usa snake_case; `populate_by_name=True` permite poblar por ambos nombres.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
