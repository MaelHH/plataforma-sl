"""Engine, sesión y Base declarativa de SQLAlchemy 2.0.

`JsonType` usa JSONB en PostgreSQL (objetivo) y JSON genérico en SQLite (dev),
para preservar 1:1 los sub-objetos del frontend (distEmpresas, monitoreo, etc.).
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from src.config.settings import get_settings

settings = get_settings()

# JSONB en Postgres, JSON en el resto (SQLite dev).
JsonType = JSON().with_variant(JSONB(), "postgresql")

_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
