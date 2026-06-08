"""Punto de entrada FastAPI — Plataforma SL backend.

Arranque: valida config de producción, crea tablas (dev/Alembic en prod) y siembra
catálogos idempotentemente.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config.database import Base, SessionLocal, engine
from src.config.settings import assert_production_ready, get_settings
from src.models import *  # noqa: F401,F403  (registra todos los modelos en Base.metadata)
from src.routers import api_router
from src.scripts.seed import seed_catalogos

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    assert_production_ready(settings)
    # En dev creamos tablas directo; en prod, usar Alembic (create_all es idempotente).
    Base.metadata.create_all(bind=engine)
    if settings.seed_on_startup:
        db = SessionLocal()
        try:
            seed_catalogos(db)
        finally:
            db.close()
    yield


app = FastAPI(title="Plataforma SL — API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "env": settings.app_env}
