# Plataforma SL — Backend (FastAPI)

Backend de la plataforma logística de SL. Implementa la **persistencia y el API** del
frontend React **sin cambiar su lógica de negocio**: el API expone/recibe los mismos
objetos camelCase que hoy viven en `localStorage`, para que el front solo cambie su
**origen de datos** (`fetch` en vez de `localStorage`).

> Contexto y contrato: ver `../docs/01-CONTEXTO-NEGOCIO-Y-DATOS.md` y `../docs/02-PLAN-BACKEND-FASTAPI.md`.

## Stack
FastAPI · SQLAlchemy 2.0 · Pydantic v2 (alias camelCase) · PostgreSQL (objetivo) /
SQLite (dev) · pyjwt. Python 3.11+.

## Estructura
```
src/
├── config/    settings (env + assert_production_ready), database (engine/JsonType)
├── models/    modelos SQLAlchemy (esquema completo de la BD)
├── schemas/   DTOs Pydantic camelCase (CamelModel)
├── routers/   endpoints REST (CRUD genérico + entidades de flujo)
├── scripts/   seed idempotente, datos_iniciales, import_localstorage
├── utils/     ids (nuevoId), tiempo (ahora ISO+local)
└── main.py    app FastAPI (lifespan: create_all + seed)
```

## Puesta en marcha (dev)
```powershell
# 1) Entorno (Python 3.11)
& "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe" -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2) Config
Copy-Item .env.example .env   # ajusta SECRET_KEY, DATABASE_URL, CORS_ORIGINS

# 3) Arrancar (crea tablas y siembra catálogos automáticamente en dev)
uvicorn src.main:app --reload --port 8000
```
- Docs interactivas: http://localhost:8000/docs · Salud: http://localhost:8000/health
- Base por defecto: SQLite (`./plataforma_sl.db`). Para PostgreSQL, ajusta `DATABASE_URL`
  en `.env` (`postgresql+psycopg://usuario:pass@host:5432/plataforma_sl`).

## API (prefijo `/api/v1`)
Cada clave del store del front tiene su endpoint, con el mismo shape camelCase:
- **Catálogos:** `/catalogo`, `/cultivos`, `/lineas`, `/carga-campo`,
  `/ubicaciones/origenes`, `/ubicaciones/destinos`, `/materiales`, `/defectos-calidad`
  (agrupado por producto), `/listas/{zonas|consignados|inspectoresCalidad|lugaresCalidad|responsables}`.
- **Flujo:** `/trailers`, `/cargas` (+ `/cargas/{id}/devolver`), `/monitoreo`,
  `/programa`, `/requerimiento-gen`, `/requerimiento-meta`, `/movimientos`,
  `/importaciones`, `/bitacora`.

## Migrar datos del navegador (localStorage → backend)
En la consola del navegador: `copy(localStorage.getItem("plataforma_sl_estado_v1"))`,
pega en `estado.json`, y:
```powershell
python -m src.scripts.import_localstorage estado.json
```
Idempotente (upsert por ID); respeta los IDs existentes.

## Notas
- **SAP**: por ahora `sapStatus` se mantiene como un solo flag por carga (igual que el
  front). La evolución a "SAP por empresa" se decidirá después (ver doc 01 §4.1).
- **Auth/roles**: pendiente (Fase 0 del plan). Hoy el API es abierto para desarrollo.
- **Producción**: usar PostgreSQL + Alembic + JWT; `assert_production_ready` aborta si la
  config es insegura (`APP_ENV=production`).
