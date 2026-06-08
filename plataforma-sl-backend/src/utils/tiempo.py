"""Estampado de tiempo equivalente a `ahora()` del front: ISO/UTC + texto local es-MX.

El front guarda SIEMPRE ambos (`ts`/`tsLocal`, `creado`, etc.); los replicamos para
no romper la UI. El texto local se arma en español (sin depender del locale del SO).
"""
from __future__ import annotations

from datetime import datetime, timezone

_MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ahora_local() -> str:
    """Aproxima el formato es-MX 'medium' usado por toLocaleString en el front."""
    d = datetime.now()
    return f"{d.day} {_MESES[d.month - 1]} {d.year}, {d.hour:02d}:{d.minute:02d}"


def ahora() -> dict[str, str]:
    return {"iso": ahora_iso(), "local": ahora_local()}
