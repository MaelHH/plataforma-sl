"""Punto de entrada de la API. Arranca con:  uvicorn app.main:app --reload"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import Base, engine
from . import models  # noqa: F401  (registra las tablas)
from .config import CORS_ORIGINS
from .routers import auth, state, documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    # En desarrollo creamos las tablas automáticamente.
    # En producción se usará Alembic (migraciones) — ver README.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Plataforma SL · API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["salud"])
def health():
    return {"status": "ok"}


# El orden importa: rutas específicas (auth, state) antes de la genérica (documents).
app.include_router(auth.router)
app.include_router(state.router)
app.include_router(documents.router)
