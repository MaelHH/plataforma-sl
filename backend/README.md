# Backend — Plataforma SL (FastAPI + PostgreSQL)

API en **Python + FastAPI**. Guarda los datos en una base de datos (SQLite en tu
laptop para desarrollo, PostgreSQL en el servidor de producción).

---

## 1. Instalar en tu Mac (una sola vez)

1. **Homebrew** (gestor de programas de Mac). Abre la app **Terminal** y pega:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. **Python**:
   ```bash
   brew install python
   ```
3. **PyCharm**: descárgalo de https://www.jetbrains.com/pycharm/download (la edición
   *Community* es gratis) e instálalo.

> PostgreSQL **no** hace falta instalarlo todavía: empezamos con SQLite (no instala nada).

---

## 2. Arrancar el backend

En la Terminal, dentro de la carpeta `backend/`:

```bash
cd backend
python3 -m venv .venv           # crea un entorno aislado (una sola vez)
source .venv/bin/activate       # actívalo (cada vez que trabajes)
pip install -r requirements.txt # instala las librerías (una sola vez)
cp .env.example .env            # crea tu configuración local
uvicorn app.main:app --reload   # ¡arranca la API!
```

Listo. Abre en el navegador:
- **http://localhost:8000/api/health** → debe decir `{"status":"ok"}`
- **http://localhost:8000/docs** → documentación interactiva (puedes probar todo ahí)

Para abrirlo en PyCharm: *File → Open →* carpeta `backend`. PyCharm detecta el
entorno `.venv` solo.

---

## 3. Cómo se conecta con tu app de React

La API replica tu "store" actual (`src/store/datos.jsx`). Cada parte tiene su URL:

### Listas (con id) — endpoint `/api/{coleccion}`
`trailers`, `movimientos`, `cargasEmbarques`, `catalogo`, `cultivos`, `lineas`,
`materiales`, `importaciones`, `bitacora`, `cargaCampo`

- `GET    /api/movimientos`        → trae todos
- `POST   /api/movimientos`        → crea uno
- `PUT    /api/movimientos/{id}`   → actualiza uno
- `DELETE /api/movimientos/{id}`   → borra uno

### Objetos únicos — endpoint `/api/state/{clave}`
`programa`, `monitoreo`, `requerimientoGen`, `requerimientoMeta`, `ubicaciones`,
`defectosCalidad`, `responsables`, `inspectoresCalidad`, `lugaresCalidad`

- `GET /api/state/defectosCalidad` → trae el objeto
- `PUT /api/state/defectosCalidad` → lo guarda completo

> Cuando estemos listos, cambiamos `DatosProvider` en `src/store/datos.jsx` para que
> lea/guarde por estas URLs en vez de `localStorage`. El resto del frontend casi no se toca.

---

## 4. Login (cuando lo activemos)

- `POST /api/auth/register` → crea usuario
- `POST /api/auth/token`    → inicia sesión (devuelve un token)
- `GET  /api/auth/me`       → quién soy

Por ahora las rutas **no** exigen login (para probar rápido). Para exigirlo, se agrega
`Depends(get_current_user)` a las rutas. Más adelante conectamos el login con
**Microsoft 365** (Azure / Entra ID).

---

## 5. Pasar a PostgreSQL (producción, con TI)

1. Pide a TI: host, puerto, usuario, contraseña y nombre de la base PostgreSQL.
2. En `.env`, cambia `DATABASE_URL` por la línea de PostgreSQL (está de ejemplo ahí).
3. Para crear/actualizar tablas de forma controlada se usa **Alembic** (migraciones).
   Lo configuramos cuando lleguemos a esa fase.

---

## Estructura
```
backend/
├─ requirements.txt        # librerías de Python
├─ .env.example            # plantilla de configuración
└─ app/
   ├─ main.py              # arranque de la API + CORS
   ├─ config.py            # lee el .env
   ├─ database.py          # conexión a la base
   ├─ models.py            # tablas (users, documents, kv)
   ├─ schemas.py           # validación de datos
   ├─ auth.py              # contraseñas y tokens
   └─ routers/
      ├─ auth.py           # registrar / login / perfil
      ├─ documents.py      # CRUD de colecciones
      └─ state.py          # objetos únicos
```
