# 🧭 Estado y pendientes — Plataforma SL

Tablero único para ver **dónde va todo**: qué está hecho, qué está corriendo/conectado y
qué falta (con quién decide). Se actualiza conforme avanzamos.

> Última actualización: junio 2026 · Documento vivo.

---

## ✅ Hecho y funcionando (Frontend)

- **13 módulos** operativos (Dashboard + M1–M12). Detalle de cada uno en
  [`../CLAUDE.md`](../CLAUDE.md).
- **Flujos cubiertos:** Planeación (M1→M2→M3), Campo (M8→M9), Exportación
  (M3→M4→M5→M6→M7→M12), Documentos (M11), Importaciones (M10).
- **Componentes compartidos:** `SearchSelect` (dropdown con búsqueda, en portal para no
  recortarse), `ColaTabs` (Pendientes/Historial), `MapaTive` (mapa real de México con
  Leaflet).
- **Calidad de código:** IDs únicos (`nuevoId`), catálogos editables in-app, generadores
  de PDF, **ErrorBoundary** por módulo + guardas contra datos parciales del backend.
- **Últimos agregados:** rechazo de fletes (M9), QC Report tipo dashboard (M12), vista
  "Base de datos" del consolidado (M6), mapa TIVE (M7), catálogos de
  zonas/ranchos/consignados (M8), filtros y edición de movimientos.

## 🔌 Conectado / corriendo

| Pieza | Dónde | Estado |
|---|---|---|
| **Frontend** (React + Vite) | `http://localhost:5173` · red: `http://192.168.11.101:5173` | ✅ corriendo |
| **Backend** (FastAPI + SQLite) | `http://localhost:8000` · `/docs` para probar | ✅ corriendo |
| **Conexión store ↔ backend** | carga + guarda vía API; `localStorage` como caché offline | ✅ activa |
| **Compartido en red local** | el colega entra por la IP (misma WiFi) | ✅ listo |

> [!warning] Para que siga vivo
> El backend y el front corren **en tu compu**. Si la apagas/duermes, se cae para tu
> colega. Para volver a prenderlos:
> ```bash
> cd backend && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
> npm run dev -- --host
> ```

## 🎯 Pendientes y decisiones (con dueño)

| Tema | Qué falta | Dueño |
|---|---|---|
| **SAP por empresa** | Implementar `sapStatus` por empresa (hoy es por carga). Decidido: **documentado, no implementado**. | Mael + Ronaldo |
| **Automatización báscula → SAP** | Definir las decisiones del proceso (báscula, remisión, tolerancia…). Ver [proceso](procesos/recibo-pesaje-materia-prima.md) §7. | Equipo |
| **Login** | Activar auth (rutas hoy sin login); luego Microsoft 365 / Entra ID. | Ronaldo / TI |
| **API de TIVE** | Reemplazar coordenadas fijas del mapa por ubicación en tiempo real. | Esperar API TIVE |
| **Correo / WhatsApp (QC)** | Hoy abren el cliente con texto prellenado; falta destinatario fijo / envío automático. | Backend |
| **PostgreSQL** | Pasar de SQLite (dev) a Postgres (producción) + migraciones Alembic. | Ronaldo / TI |
| **Fotos reales** | Hoy simuladas/base64; subir a storage al conectar backend. | Backend |
| **Bugs menores** | M2 (filtro de día / mercado abierto entre semanas), M6 (`$NaN` si cajasTotal=0), M12 (sin reversa a "pendiente"). | Front |

## 🗂️ Cómo está organizado el repo

```
plataforma-sl/
├─ src/            ← frontend (React): store/, modulos/, components/
├─ backend/        ← API de Ronaldo (FastAPI). NO la tocamos sin él.
├─ docs/           ← esta documentación
│  ├─ README.md            (índice / onboarding)
│  ├─ ESTADO.md            (este tablero)
│  ├─ _PLANTILLA-proceso.md
│  └─ procesos/            (un archivo por proceso/automatización)
└─ CLAUDE.md       ← contexto técnico profundo del front
```

## 📌 Próxima acción sugerida

1. **Subir todo a GitHub** (hay varios commits locales sin pushear).
2. Decidir el arranque de **SAP por empresa** (o dejarlo agendado).
3. Cuando entren los devs de SL: que lean `docs/README.md` → `CLAUDE.md` → corran local.
