"""Generación de IDs equivalente a `nuevoId(prefix)` del front (prefijo + UUID)."""
from __future__ import annotations

import uuid


def nuevo_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4()}"
