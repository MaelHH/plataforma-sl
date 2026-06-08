# Plan de implementación — Backend FastAPI para Plataforma SL

> Acompaña a [`01-CONTEXTO-NEGOCIO-Y-DATOS.md`](./01-CONTEXTO-NEGOCIO-Y-DATOS.md) (el contrato de
> negocio). Aquí va **cómo** se construye el backend **sin cambiar la lógica que el cliente
> ejecuta hoy**. Sigue tus estándares de la red de conocimiento (Obsidian): estructura FastAPI
> estándar, JWT con refresh httpOnly, `assert_production_ready`, checklists de seguridad,
> `.env.example`, "no inventar datos".
>
> **Estado actual:** Fase 0 + capa de datos **construida y verificada** en `../plataforma-sl-backend/`
> (PostgreSQL objetivo / SQLite dev; camelCase confirmado in/out; seed + import probados). Pendiente:
> auth/roles, conectar el frontend, y endurecimiento. Ver §10 Roadmap.

---

## 1. Objetivo y principios

1. **Cero cambios de lógica de negocio.** El backend implementa exactamente las transiciones,
   cálculos y reglas del documento 01. Los "huecos conocidos" se corrigen solo con decisión
   explícita del cliente (ver 01 §7).
2. **Preservar el contrato de datos del frontend.** El frontend (React + `useDatos()`) consume
   objetos con nombres camelCase concretos. El backend los respeta para minimizar el cambio en el
   front (ver §3, decisión de naming) — **decisión confirmada: camelCase**.
3. **Migración sin pérdida.** El estado actual vive en `localStorage` versionado
   (`plataforma_sl_estado_v1`). Hay un import único de ese JSON al backend (`import_localstorage`).
4. **Seguridad desde el día 1** (tus estándares): `assert_production_ready()`, CORS allowlist,
   refresh en cookie httpOnly+Secure, rate limiting en auth, errores genéricos al cliente, sin
   secretos en repo.
5. **Reutilizar tu starter.** Modelo de referencia para auth/SAP/seguridad: `bonos_backend`,
   `USDA_backend`, `SL_MainWeb_API`.

---

## 2. Stack y estructura

**Stack:** FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Alembic (migraciones) · uvicorn ·
**PostgreSQL** (decisión confirmada; JSONB para sub-objetos) · JWT (`pyjwt`, **no** `python-jose`) ·
bcrypt (cost ≥12) · pytest. Python 3.11+. En dev hay fallback SQLite (`JsonType` usa JSONB en
Postgres y JSON en SQLite).

**Estructura (implementada):**
```
plataforma-sl-backend/
├── src/
│   ├── config/        settings (env + assert_production_ready), database (engine/session/JsonType)
│   ├── models/        SQLAlchemy ORM (esquema completo de la BD)
│   ├── routers/       endpoints REST (CRUD genérico + entidades de flujo)
│   ├── schemas/       DTOs Pydantic camelCase (CamelModel)
│   ├── scripts/       seed idempotente, datos_iniciales, import_localstorage
│   ├── utils/         ids (nuevoId), tiempo (ahora ISO+local)
│   └── main.py
├── .env.example  ·  .gitignore  ·  requirements.txt  ·  README.md
└── (pendiente) alembic/ , tests/ , utils/ auth+security
```

---

## 3. Decisión clave: naming del contrato (camelCase) — CONFIRMADA

El frontend ya consume camelCase (`cargasEmbarques`, `sapStatus`, `distEmpresas`, `cargaItems`,
`requerimientoGen`…). Para no reescribir el store ni los módulos, **el API expone/recibe camelCase**
vía Pydantic v2 `CamelModel` (`alias_generator=to_camel` + `populate_by_name=True`).
- Internamente Python usa snake_case (estándar de código).
- El JSON in/out queda **idéntico** al shape del store → el front cambia solo el ORIGEN de datos
  (`fetch` en vez de `localStorage`). **Verificado** en smoke test (`cajasPorParrilla`, `marcaModelo`).

---

## 4. Mapa de entidades → tablas (implementado)

18 tablas. Campos semiestructurados → JSONB (Postgres) / JSON (SQLite) preservando el shape exacto.
Snapshots (`cargaEmbarque.trailer`, `cargaItems`, `items`) embebidos como JSON (inmutables por diseño).

| Tabla | PK | Notas |
|---|---|---|
| `trailers` | `id` (str) | ficha + `status` + `inspeccion_precarga` JSON |
| `cargas_embarque` | `id` (str) | `trailer` JSON(snapshot) + `trailer_id` (índice) + `dist_empresas`/`manifiestos`/`calidad` JSON + `sap_status` |
| `monitoreo` | `trailer_id` | 5 eventos JSON |
| `programa_filas` | `id` | `semana` + `orden` + fila |
| `requerimiento_gen` | `id` | `semana` + `orden` + item |
| `requerimiento_meta` | `semana` | meta del envío |
| `movimientos` | `id` (str) | ficha + `carga_items`/`recepcion`/`muestreos`/`inspeccion` JSON |
| `importaciones` | `id` (str) | ficha + `items` JSON |
| `bitacora` | `id` (str) | append‑only |
| catálogos | — | `presentaciones`, `cultivos`, `lineas_transporte`(+choferes/tractos/cajas JSON), `carga_campo`, `ubicaciones_origenes`, `ubicaciones_destinos`, `materiales`, `defectos_calidad`, `valores_lista`(zonas/consignados/inspectores/lugares/responsables) |

---

## 5. Mapa de endpoints (implementado, prefijo `/api/v1`)

- **Catálogos:** `/catalogo`, `/cultivos`, `/lineas`, `/carga-campo`, `/ubicaciones/origenes`,
  `/ubicaciones/destinos`, `/materiales`, `/defectos-calidad` (GET agrupado por producto),
  `/listas/{zonas|consignados|inspectoresCalidad|lugaresCalidad|responsables}`.
- **Flujo:** `/trailers`, `/cargas` (+ `/cargas/{id}/devolver`), `/monitoreo` (GET todo, PUT por trailer),
  `/programa` (GET todo, PUT por semana), `/requerimiento-gen`, `/requerimiento-meta`,
  `/movimientos`, `/importaciones`, `/bitacora`.
- **Pendiente:** `/auth/*` (login/refresh/logout/me).

> El cálculo (trailers, reparto de flete, QCI, folio consecutivo) se queda en el FRONT — eso es
> "no cambiar la lógica". El backend persiste el resultado. Cuando se quiera mover lógica al
> servidor, se hará por decisión explícita.

---

## 6. Estrategia para los huecos conocidos

| Hueco (doc 01) | Decisión / estado |
|---|---|
| `sapStatus` único por carga | **Diferido por el cliente.** Backend preserva el flag único hoy; modelado extensible a "por empresa" más adelante. |
| M2 ignora filtro de día / Mercado Abierto entre semanas | Preservar comportamiento actual por ahora (front computa). |
| M6 `$NaN`/Infinity con `cajasTotal===0` | El front lo maneja; el backend solo persiste. |
| `devolver` borra físico | Implementado físico (igual que front), transaccional (trailer→en_instalaciones). Soft‑delete + bitácora: mejora futura. |
| QC `rechazado` sin botón/reversa | El backend acepta cualquier `estado` en `calidad`; el front decide cuándo exponerlo. |

---

## 7. Migración de datos (localStorage → backend) — implementado

1. **Script `import_localstorage.py`**: recibe el JSON de `plataforma_sl_estado_v1` y hace upsert
   idempotente por PK, respetando IDs (coacciona ids enteros de los mock a str). **Probado.**
2. **Seed idempotente al arranque**: siembra catálogos `*_INICIAL` solo si las tablas están vacías.
3. **Frontend (pendiente)**: reemplazar lectura/escritura de `localStorage` en `DatosProvider` por
   llamadas a la API (capa `services/api.js`), manteniendo `useDatos()` y los módulos intactos.

---

## 8. Autenticación y autorización (pendiente)

- **JWT access** (corto) + **refresh** (cookie httpOnly+Secure+SameSite) con rotación/detección de
  reuso (modelo `bonos_backend`). bcrypt ≥12.
- **Roles → permisos por módulo** (personas del doc 01 §0): Dirección, Planeación (M1/M2),
  Tráfico (M3), Carga (M4), Embarques (M5/M6), Monitoreo (M7), Campo (M8), Empaque/Calidad (M9/M12),
  Comercio Exterior (M10), Admin. **Matriz exacta a confirmar.**

---

## 9. Seguridad (checklist — tus estándares)

- [x] `.env.example` completo; `.env` en `.gitignore`.
- [x] `assert_production_ready()` (aborta si SECRET_KEY débil / CORS `*` / SQLite en prod).
- [x] CORS allowlist (orígenes del front).
- [ ] Auth: refresh en cookie httpOnly; rate limiting en `/auth/*`.
- [ ] Uploads de fotos: límite + validación real; storage fuera del repo.
- [x] `pyjwt` en requirements (no `python-jose`).
- [ ] **PDFs**: escapar lo interpolado en el HTML de los generadores (XSS) al pasar datos por API.
- [ ] Tests de endpoints críticos + lógica; pasar `Checklist de seguridad` + `Definition of Done`.

---

## 10. Roadmap por fases

- **Fase 0 — Cimientos:** ✅ scaffold, settings, DB+JsonType, CamelModel, CRUD genérico de catálogos,
  seed idempotente, import_localstorage, verificación de arranque. (Falta: Alembic, auth.)
- **Fase 1 — Conectar el frontend:** capa `services/api.js` + adaptar `DatosProvider` para hidratar
  desde la API y persistir cambios, **sin tocar la lógica de los módulos**. (← siguiente paso)
- **Fase 2 — Auth/roles:** JWT access/refresh httpOnly, guards por rol, rate limiting.
- **Fase 3 — Endurecimiento:** Alembic, storage de fotos, tests, bitácora en transiciones, checklist
  de seguridad; documentar lecciones en el vault.
- **Fase 4 — SAP por empresa** (cuando el cliente lo defina): `sapPorEmpresa` + compat.

---

## 11. Decisiones cerradas / abiertas

**Cerradas:** naming camelCase ✓ · PostgreSQL ✓ · SAP por empresa diferido (preservar flag) ✓ ·
huecos: preservar comportamiento actual ✓.

**Abiertas (confirmar cuando toque):** matriz de roles/permisos · `SL Produce` como 4ª empresa SAP ·
Export Excel (M6) y PDFs (M9/M11/M12) ¿se mantienen en el front (recomendado) o se mueven a backend? ·
storage de fotos (disco vs S3/MinIO).
