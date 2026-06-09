# 📚 Documentación — Plataforma SL

Hub de documentación de la **Plataforma SL Logística** (SL Produce · SL Agrícola).
Pensado para que cualquier desarrollador que entre al equipo tenga el contexto
completo y todos documentemos **con el mismo formato**.

> Documento vivo. Se actualiza conforme crece la plataforma.

---

## 🚀 Para empezar (devs nuevos)

1. **Contexto del frontend** → [`../CLAUDE.md`](../CLAUDE.md) — qué es la app, stack,
   arquitectura (store + localStorage + backend), flujos de negocio y **detalle por
   módulo**. Es la mejor primera lectura.
2. **Backend (API)** → [`../backend/README.md`](../backend/README.md) — FastAPI +
   SQLite/PostgreSQL, cómo arrancarlo y los endpoints (colecciones y singletons).
3. **Cómo correr todo en local:**
   ```bash
   # Backend (API)
   cd backend && source .venv/bin/activate
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload   # → http://localhost:8000

   # Frontend (la app)
   npm install && npm run dev -- --host                        # → http://localhost:5173
   ```
   En la app, abajo a la izquierda debe decir **🟢 Backend conectado**.

---

## 📂 Estructura de la documentación

```
docs/
├─ README.md                 ← este índice
├─ _PLANTILLA-proceso.md     ← plantilla para documentar un proceso/automatización
└─ procesos/                 ← un archivo por proceso (en el formato del equipo)
   └─ recibo-pesaje-materia-prima.md
```

## 📝 Cómo documentar un proceso nuevo

1. Copia [`_PLANTILLA-proceso.md`](_PLANTILLA-proceso.md) a
   `docs/procesos/<nombre-del-proceso>.md`.
2. Rellena las secciones (contexto → objetivos → roles → flujo → etapas → estados →
   decisiones pendientes → próximos pasos). Usa tablas y los *callouts* indicados.
3. Agrégalo al índice de abajo y haz commit/PR.

## 🗂️ Índice de procesos / automatizaciones

| Proceso | Sistema destino | Estado | Doc |
|---|---|---|---|
| Recibo y Pesaje de Materia Prima | SAP Business One (Service Layer) | Borrador | [ver](procesos/recibo-pesaje-materia-prima.md) |

---

## 🔒 Reglas de negocio clave (leer antes de tocar SAP)

> [!important] SAP es mono-empresa (NO multiempresas)
> Cada empresa (SL Agrícola, CAT, CACO, SL Produce) se sube a SAP **por separado**. En
> viajes/registros **consolidados** hay que **dividir y subir la parte de cada empresa
> de forma independiente** — nunca de un solo golpe. Detalle y dónde aplica en
> [`../CLAUDE.md`](../CLAUDE.md) (sección *Restricciones del negocio*).

Otras decisiones y aclaraciones de roles/flujos viven en `CLAUDE.md`. Cuando definamos
una automatización de SAP, se documenta como un **proceso** aquí (usando la plantilla).

---

## 🧭 Convenciones del proyecto (resumen)

- **IDs únicos** con `nuevoId(prefix)` (nunca contadores módulo-globales).
- **Dropdowns**: componente `SearchSelect` (no `<select>` nativo).
- **Colas de trabajo**: pestañas `Pendientes / Historial` con `ColaTabs`.
- **PDFs**: `window.open` + HTML + `window.print()`.
- **Datos parciales del backend**: poner *guardas* (`?.`, `|| []`); hay un
  **ErrorBoundary** por módulo que avisa si algo truena sin tumbar la app.
- Mantener `npx eslint src` y `npx vite build` **limpios** antes de commitear.

(El detalle completo de convenciones y de cada módulo está en `CLAUDE.md`.)
