# Registro de cambios — Plataforma SL

> Bitácora **viva** de todo lo que cambiamos, para que **no se pase ningún cambio**. Cada entrada dice: qué se cambió, archivos/commits, **revisión de seguridad** (página + SAP) y estado (probado / desplegado). Regla: **cada cambio se revisa contra las reglas de seguridad antes de darlo por bueno.**

---

## 📌 Cómo funciona la app HOY (estructura nueva — tenerlo presente siempre)

- **Dos repos:** frontend `plataforma-sl` (React+Vite) y backend `plataforma-sl-backend` (FastAPI + MySQL). Front en VPS (nginx), backend en servidor Windows (NSSM `PlataformaSL-Backend`, :4104), MySQL en el mismo Windows.
- **Multi-empresa (multi-tenant):** cada **usuario** tiene una **empresa casa** (`usuarios.id_empresa` → tabla `empresas` con su `sap_company_db`) + **asignaciones** de temporadas/cultivos/proyectos (`usuario_cultivos`, `usuario_proyectos`). Un usuario **acotado** solo ve/opera lo asignado; admin/sin alcance ve todo (fail-safe). Regla de aislamiento: **etiqueta `null` = mío**; el id de empresa **NO es fijo** (nunca `?? 1`).
- **Ruteo SAP por empresa** (contextvar), flag `SAP_ROUTING_POR_EMPRESA` (default OFF; se enciende aparte).
- **RBAC:** permisos por módulo/acción en `catalogo_permisos.py` (fuente del código) → sembrados en la tabla `permisos` con `sembrar_permisos`. Roles: admin (super) / gerente / usuario. La pantalla *Roles y permisos* lee de la **tabla** (BD), no del código.
- **Empaque campo directo:** método de vaciado **por cultivo** (allowlist): **bins** (ejote SL, pesaje) por defecto; **taras** solo pepino/CACO (Nº de remisión directo a SAP). Ramas: feature en `feat/multiempresa`; refactor de arquitectura en `feat/arquitectura` (marcador: `src/models/cola_sap.py`).

## 🔒 Reglas que NO se rompen (checklist por cambio)
- **SAP:** solo `GET`/`POST`/`PATCH` vía `client.py`; **nunca** PUT/DELETE; **no** tocar `client.py`/`session.py`/`hana_client.py`/`produccion.py`/`compras.py`/`queries.py`; **no** cambiar la forma de mandar al Service Layer; **nunca** crear/escribir objetos globales de SAP (UDF, series, tasas, `SetCurrencyRate`). Avisar antes de tocar datos globales de SAP.
- **Seguridad de la página:** respetar auth JWT, RBAC, validación en fronteras, CORS; no debilitar candados "para que funcione"; no exponer datos/endpoints sin el patrón actual.
- **`.env`:** no leer/cargar (usar fake/py_compile).
- **Aditivo:** columnas/tablas nuevas nullable con default = estado de hoy; nada destructivo.
- **Deploy:** commit/push solo cuando se pide; nada a producción sin autorización; punto de retorno antes de cambios sensibles.

---

## 🏷️ Puntos de retorno (checkpoints)
- **`checkpoint-2026-08-18-antes-manifiestos`** (ambos repos) — antes de arrancar el módulo de manifiestos/embarques. Frontend `c272f0d`, backend `20d725f`.
- `pre-deploy-multiempresa-2026-08-13` (ambos repos) — antes del despliegue de multiempresa.

---

## 📝 Cambios

### 2026-09-01 — Manifiestos + OC de flete: sellar/editar nº en la Entrega, listado de OCs, Solicitud→Pedido y varios fixes
- **Qué (backend + frontend, rama `feat/manifiestos`):**
  - **OC de flete Solicitud→Pedido:** el `PurchaseOrders` ahora **nace de una `PurchaseRequests`** (regla de la empresa: ningún Pedido directo), calcado de `compras.py`. Moneda desde `sap_doc_currency` (ya no "MXP" fijo → arregló el `-5002`) y el dropdown **solo muestra fletes que existen en la company** (arregló el `-2028` por ItemCode fantasma).
  - **Nº de manifiesto en la Entrega:** `crear_entrega` devuelve `docEntry` aunque la OV ya estuviera entregada + "Generar entregas" re-sella; **captura/edición del nº por OV** en el drawer de Embarques (`POST /embarques/{id}/manifiesto`) → `PATCH DeliveryNotes.U_Manifiesto` **solo si la Entrega está abierta**, buscando la Entrega por **DocNum** (confiable; el filtro `any()` no lo soporta esta SAP). Badge **"Falta manifiesto"** en la lista + nº de **Entrega** en el drawer. El dropdown de OC lee el nº **por OV** (ya no llaves huérfanas).
  - **Listado de OCs de flete** (pestaña "OCs creadas"): estado del Pedido (Abierta/Cerrada) + entrada de mercancía + factura (best-effort).
  - **SD (stock disponible por PT)** en Asignar Pallets · **"Mandar a SAP" anti-doble-envío** (drawer con estado vivo) · **aviso al crear embarque** si falta el nº de manifiesto · **fix script** `ensanchar_pk_proyectos` (no truena si falta `movimientos.proyecto_id`).
- **Archivos:** back `src/sap/{fletes,embarques,service,router}.py`, `src/scripts/ensanchar_pk_proyectos.py`. Front `src/modulos/{OcFlete,OcFleteLista,EmbarquesLista,TableroEmbarques,NuevoEmbarque,Modulo15}.jsx`, `src/store/api.js`.
- **Seguridad:** ✅ [[sap-reglas-garantia]]: solo GET/POST/PATCH vía `client.py`, nunca PUT/DELETE; el PATCH es a `U_Manifiesto` (campo existente); ningún objeto global; permisos `manifiestos.ver`/`editar`.
- **Estado:** ✅ probado local con SAP de prueba (OC **8742** Solicitud→Pedido; nº **14524** sellado en Entrega **2451**). No desplegado. **Sin cambios de esquema de BD.**
- **Plan nuevo (solo doc):** `docs/plan-manifiestos-alternativo-y-pdf.md` — manifiesto **app-only** (sin PT en SAP, permiso del gerente) + tablero unificado SAP/app + PDF para todos.

### 2026-08-27 — Fase 7 Manifiestos: OC de flete desde el manifiesto (pestaña nueva)
- **Qué:** nueva pestaña **"OC de flete"** en el módulo Asignar Pallets (Modulo15). Se busca un **nº de manifiesto** → se lee su **Entrega** (por `U_Manifiesto`) → se capturan **proveedor/flete/IVA/precio/diésel/comentario** → se crea **1 OC (`PurchaseOrders`)** en SAP con el flete **prorrateado POR CAJAS** (fórmula correcta: `Importe/total_cajas × cajas_línea`, residual a la de más cajas, Σ = Importe exacto; `Importe = precio − diésel`, pre-IVA; el IVA lo agrega SAP con el `TaxCode`). Recrea el proyecto de escritorio `SL_Pedidos_Fletes` corrigiendo su matemática (repartía en partes iguales). Preview en vivo en el front; el **backend recalcula** al crear (autoritativo).
- **Archivos:** front `src/modulos/OcFlete.jsx` (nuevo), pestaña en `src/modulos/Modulo15.jsx`, funciones en `src/store/api.js`. Back `src/models/oc_fletes.py`, `src/sap/fletes.py`, `src/sap/oc_flete_calc.py`, `crear_oc_flete` en `src/sap/service.py`, endpoints `/flete/*` en `src/sap/router.py`. Doc: `plataforma-sl-backend/docs/cambios/2026-08-27-oc-flete.md` + `CAMBIOS-BD.md` (tabla `oc_fletes`, aditiva).
- **Seguridad:** ✅ **[[sap-reglas-garantia]]**: solo **GET/POST** vía `client.py`, nunca PUT/DELETE; **no** se crean objetos globales de SAP (los UDF `U_Manifiesto`/`U_Precio_Flete`/`U_PrecioDiesel` ya existen en OPOR, los usa el AddOn); solo se fija `LineTotal`+`TaxCode`+dimensiones. Idempotente/resumible (tabla `oc_fletes`, candado atómico + adopt-by-GET + `po_docentry` UNIQUE) — **revisado por agente adversarial** (arreglados TOCTOU, candado pegado ante caída de red, `IntegrityError`). `$filter` con comilla escapada (anti-inyección). Permisos `manifiestos.ver`/`editar`. Ruteo por empresa.
- **Estado:** ✅ en código (rama `feat/manifiestos`, tag de retorno `pre-oc-flete-2026-08-27`). **Pendiente: probar en company de PRUEBA** (crear una OC real y verificar Σ bases = Importe, IVA y dimensiones en SAP). No desplegado.

### 2026-08-24 — PLAN (sin código): Empaque OFFLINE en APK para el vaciado por hora
- **Qué:** se documentó el plan para capturar el **vaciado por hora sin internet** desde un **APK** (Ionic React + Capacitor) que sincroniza a la BD real al reconectar y recién entonces permite mandar a SAP. **Hallazgo clave del diagnóstico:** hoy las pesadas viven dentro del blob `raw.vaciado` del movimiento y se guardan con **PUT del documento completo** (`src/compat/router.py`) + diff de colecciones enteras (`src/store/datos.jsx` → `sincronizarBackend`), o sea **last-write-wins**. Si el celular offline guardara así, **al reconectar pisaría lo capturado en la PC y se perderían kilos en silencio** (y el recibo de producción de SAP es ACUMULATIVO). → El diseño se basa en **eventos append-only** con **id generado en el dispositivo** (idempotencia natural), **SQLite + outbox** en el celular, tablas nuevas `empaque_horas`/`empaque_pesadas` en el backend, y **SAP online-only** con gate de 4 condiciones (conexión real + hora cerrada + 0 pendientes en outbox + aprobación). Pesada que llega tarde a una hora ya enviada → `409` → propuesta de **ajuste/faltante** (flujo que ya existe en `Modulo9.jsx`).
- **Archivos:** `plataforma-sl-backend/docs/plan-empaque-offline-apk.md` (nuevo, solo documentación). **Cero cambios de código** en ambos repos.
- **Seguridad:** ✅ solo lectura de código para el diagnóstico; no se cargó `.env`. El plan **respeta [[sap-reglas-garantia]]**: no toca `client.py`/`session.py`/`produccion.py`, conserva `claveEnvio` + `recibos_produccion_sap` + `recibo-verificar` (G4), el APK **nunca** postea a SAP offline, y las tablas nuevas son **aditivas** (nullable, con `id_empresa` para el aislamiento multiempresa).
- **Estado:** 📝 plan escrito, **pendiente el Paso 0** (4 decisiones: horas máx. sin internet, nº de celulares simultáneos, URL estable del backend para el celular, y quién aprueba/envía a SAP). Nada implementado ni desplegado.

### 2026-08-21 — Investigación (solo lectura): asignación de pallets vía Service Layer + hallazgo SHIPMENT/MANIFEST
- **Qué:** se investigó cómo el AddOn de SAP asigna pallets a la Orden de Venta, para evaluar **recrearlo desde la app sin romper reglas** (autorizado por el jefe de SAP, a probar en `TEST_SLA`). Hallazgos:
  - La asignación son **UDT planas** (NO es UDO — `OUDO` vacío). Modelo: cabecera **`@P_PALLET_ASGMNT`** (`U_BaseType=17`, `U_BaseEntry`=DocEntry OV, `U_BaseNum`=DocNum, `U_Active`, `U_UserName`) + detalle **`@P_PALLET_ASGMNT_DET`** (`U_PalletAsgmntId`→cabecera, `U_PalletId`→`@P_PALLETS`, `U_PalletsDetailId`→`@P_PALLETSDETAIL`, `U_BaseLine`=línea OV, `U_Active`) + pallets **`@P_PALLETSDETAIL`** (`U_Active` Y/N).
  - Procedimiento del proveedor **`SP_ADDON_PROD_GETPALLETS(DateFrom,DateTo)`** (SOLO lee) revela toda la cadena `@P_PALLETS→@P_PALLETSDETAIL→@P_PALLET_ASGMNT_DET→@P_PALLET_ASGMNT→ORDR→RDR1`, filtrando `ORDR.DocStatus='O'`, `CANCELED='N'`, `U_IsDelivery='N'`. **No existe** procedimiento de "asignar" → la lógica de escritura vive en el `.exe` del addon.
  - **Gate 1 PASADO:** Service Layer **EXPONE** las UDT con prefijo `U_`: `U_P_PALLETS`, `U_P_PALLETSDETAIL`, `U_P_PALLET_ASGMNT`, `U_P_PALLET_ASGMNT_DET` — y además **`U_P_SHIPMENT` / `U_P_SHIPMENTDETAIL` / `U_P_SHIPMENT_MANIFEST`** (embarque + manifiesto). → se puede `GET` (y previsiblemente `POST`/`PATCH`) por Service Layer, **sin ODBC**.
- **Archivos:** ninguno del proyecto (investigación). Script **desechable de SOLO-LECTURA** en scratchpad (`sondear_pallets_sap.py`, Login+GET+Logout, credenciales tecleadas por el user, no lee `.env`).
- **Seguridad:** ✅ solo `SELECT` en HANA + `Login`/`GET` en Service Layer; **NADA escrito en SAP**; sin `.env`. Respeta [[sap-reglas-garantia]] (GET/POST/PATCH, nunca PUT/DELETE; ODBC solo lectura).
- **RECETA CONFIRMADA (antes/después real, 2026-08-24, TEST_SLA):** asignar pallets = **2 escrituras** (NO cambia `U_Active` del pallet; el flip a `N` es al embarcar):
  1. `POST @P_PALLET_ASGMNT` (1 cabecera): `Code`=máx+1, `U_Active='Y'`, `U_BaseType='17'`, `U_BaseEntry`=DocEntry OV, `U_BaseNum`=DocNum OV, `U_UserName`, `U_DateCreated`/`U_DateCreatedTime`.
  2. `POST @P_PALLET_ASGMNT_DET` (1 por pallet-detalle): `Code`=máx+1, `U_PalletAsgmntId`=Code cabecera, `U_PalletId`=Code `@P_PALLETS`, `U_PalletsDetailId`=Code `@P_PALLETSDETAIL`, `U_BaseLine`=índice de línea de la OV (0,1,2…), `U_Active='Y'`.
  - **OJO:** el addon **crea las líneas de la OV** (con dimensiones/normas de reparto) en el MISMO guardado, y todo se graba **solo al guardar la OV** (Agregar). → replicar = la app crea la OV con líneas+dimensiones (Service Layer `Orders`) **y** escribe la asignación con `U_BaseLine` correcto, coordinado.
- **Estado:** ✅ **GATE 2/3 CERRADO (2026-08-24)** — POC en `TEST_SLA` crea, 100% por Service Layer, una **OV + asignación de pallets BYTE-IDENTICAL a la del addon** (comparador `comparar_ov.py`: cero campos faltantes en cabecera y línea; solo difieren totales/fechas/usuario/Reference1/JournalMemo, naturales). Mecanismo automático confirmado: cultivo=`Items.U_PrcCode`, lote=`pallet.U_Batch`, depto=`OF.OcrCode3`, aduana=`Items.U_CE_*`+`U_PesoKG`, cabecera aduana=`BusinessPartners.U_Incoterm/U_ClavePedimento/UnifiedFederalTaxID`, propietario=empleado del usuario. Scripts POC en scratchpad (desechables, GET/POST solo TEST_SLA, sin `.env`). **Siguiente:** (1) reverse-engineer EMBARQUE/MANIFIESTO (`@P_SHIPMENT*`) igual; (2) construir el módulo real en la app vía `client.py` con [[cambio-seguro]]. Detalle técnico completo en `docs/manifiestos-hallazgos-tecnicos.md`.

### 2026-08-18 — Fase 1 Manifiestos: stock real de SAP + Panel de PT (Evidencias/Modulo4)
- **Qué:** en la asignación de PT se **separa el stock real de SAP** (cajas disponibles, `cajasStock`) del campo **"cajas por parrilla"** (densidad de empaque). El stock se muestra en el dropdown de PT (`N disp` / `SIN STOCK`) y en un nuevo **Panel de PT** (Código · Producto · Stock 🟢/🔴 · Cajas/parrilla **editable** · buscar · traer de SAP · resumen con/sin stock). "cajas por parrilla" ahora se **conserva** al actualizar de SAP (antes se pisaba con el stock → inflaba el conteo del manifiesto). Es el Método 2 (recomendado).
- **Archivos:** `src/modulos/Modulo4.jsx`. **Commit:** `75daf32`.
- **Seguridad:** ✅ solo **GET** (`getProductosTerminadosSAP`, empresa-aware, company del usuario); **sin escritura a SAP**; editar cajas/parrilla solo toca el catálogo local (store, ya persistido); sin nuevos endpoints ni cambios de auth. Ver [[sap-reglas-garantia]].
- **Nota:** los PT ya cargados conservan su "cajas por parrilla" actual (si venía del stock por el bug viejo, corregirla en el Panel). PT nuevos empiezan en 0 (se definen en el Panel).
- **Estado:** ~~probado local~~ **REVERTIDO 2026-08-20** (`git checkout checkpoint-2026-08-18-antes-manifiestos -- src/modulos/Modulo4.jsx`). El enfoque cambió: en vez de PT + "cajas por parrilla" estimado, se usarán **pallets reales de SAP** (`@P_PALLETSDETAIL` por HANA). El commit `75daf32` queda en el historial por si algo sirve. Ver `docs/plan-modulo-manifiestos.md` (flujo definitivo).

### 2026-08-18 — Documentación: plan de manifiestos + comparación con el Excel/AddOn SAP
- **Qué:** análisis del Excel de embarques y del manual del AddOn de SAP; **plan del módulo de manifiestos** (embarque → manifiesto → OC, con PT reales de SAP + salida de emergencia autorizada por Kiko + tablero que reconcilia OV/OC/factura/manifiesto contra SAP). **Solo documentos, NO código.**
- **Archivos:** `docs/embarques-excel-vs-programa.md`, `docs/plan-modulo-manifiestos.md`.
- **Seguridad:** N/A (documentos). El plan respeta las reglas SAP (la app **no** crea OV/embarque/entregas en SAP; solo GET + el patrón de OC existente en fase futura).
- **Estado:** plan aprobado en enfoque; pendiente confirmar preguntas abiertas antes de la Fase 1.

### 2026-08-18 — Empaque campo directo: barra de vaciado de 3 colores
- **Qué:** en la tarjeta de LOTE (bins/ejote) la barra ahora muestra 🟢 enviado a SAP · 🔵 vaciado sin enviar · 🔴 merma; % grande = lo enviado a SAP; barra más grande. Merma **solo en ejote** (CACO/taras se dejó pendiente por decisión del dueño).
- **Archivos:** `src/modulos/EmpaqueCampoDirecto.jsx`. **Commit:** `c272f0d`.
- **Seguridad:** ✅ display-only; **no** cambia el cálculo ni el envío a SAP.
- **Estado:** probado local; frontend → subir `dist`.

### 2026-08-13/18 — Empaque campo directo: "Actualizar de SAP" para usuario solo-empaque
- **Qué:** botón "Actualizar de SAP" (cargar temporadas/lotes asignados) también en Empaque campo directo, para usuarios que no entran a Movimientos Campo. Helper compartido `helpers/catalogoSAP.js`.
- **Archivos:** `src/modulos/helpers/catalogoSAP.js` (nuevo), `src/modulos/EmpaqueCampoDirecto.jsx`. **Commit:** `d3d09f5`.
- **Seguridad:** ✅ solo **GET** de catálogo (`getCatalogoProyectosSAP`); no toca Modulo8 ni el envío a SAP.
- **Estado:** frontend → `dist`.

### 2026-08-13 — Empaque campo directo: método TARAS (CACO/pepino), reporte, MF3, fix regresión
- **Qué:** vaciado por **taras** (Nº de remisión directo a SAP) para CACO/pepino; método por cultivo = **allowlist** (default bins) tras corregir la regresión que mandaba a taras cualquier cultivo ≠ ejote; reporte Excel/PDF de taras; recuadros de resumen en modo taras.
- **Archivos:** `src/modulos/helpers/vaciado.js`, `src/modulos/reportes/vaciadoTaras.js` (nuevo), `src/modulos/EmpaqueCampoDirecto.jsx`. **Commits:** `d179235`, `84be10b`, `15dc739`, `a6f68fb`.
- **Seguridad:** ✅ `cantidad = taras` exacto, idempotente (`RP_{folio}`), fail-closed; revisión adversarial OK; **no** cambia la forma de mandar a SAP.
- **Estado:** validado local SL+CACO→SAP; desplegado a producción.

### 2026-08-13 — Permisos por pestaña en Empaque + gateo del switch
- **Qué:** 2 permisos nuevos `empaque.logistica.ver` / `empaque.campo_directo.ver`; el switch de Empaque se oculta según el permiso (sin ninguno = ve ambas).
- **Archivos:** backend `src/auth/catalogo_permisos.py` (commits `f57ece8` en feat/multiempresa, `20d725f` cherry-pick en feat/arquitectura); frontend `src/modulos/Modulo9.jsx` (commit `238bcb5`).
- **Seguridad:** ✅ aditivo; la pantalla lee de la tabla `permisos` → requiere `sembrar_permisos`. No debilita ningún candado (el backend sigue validando lo crítico).
- **Estado:** desplegado (sembrado en prod).

### 2026-08-13 — Despliegue de multiempresa a producción
- **Qué:** migraciones de esquema (empresas, usuarios.id_empresa, asignaciones, proyectos.empresa, ranchos 191, id_empresa operativas) + backend nuevo + frontend `dist`. Corridas con scripts Python (sin cliente mysql).
- **Seguridad:** ✅ aditivo; flag `SAP_ROUTING_POR_EMPRESA` OFF; SAP intacto.
- **Estado:** desplegado. Detalle en `docs/DESPLIEGUE-MULTIEMPRESA.md` (backend) y memoria.

### 2026-08-25 — Módulo Manifiestos · Fase 1: GET pallets disponibles (solo lectura)
- **Qué:** endpoint `GET /api/sap/pallets-disponibles` que lista pallets activos NO asignados con la info del AddOn + dimensiones ya derivadas (cultivo/lote/depto) para armar la OV. Es la pantalla de selección del módulo nuevo de asignación de pallets (calca `fletes_acarreo`). Permiso nuevo `manifiestos.*`.
- **Archivos (backend `feat/manifiestos`):** `src/sap/queries.py` (`pallets_disponibles`), `src/sap/router.py` (endpoint gateado por `manifiestos.ver`), `src/auth/catalogo_permisos.py` (módulo `manifiestos`). Doc: `docs/cambios/2026-08-25-manifiestos-fase1.md`, `docs/CAMBIOS-BD.md`.
- **Seguridad:** ✅ **SOLO LECTURA** — un `SELECT` HANA (candado `execute_select`), cero POST/PATCH; no toca `client.py`/`session.py`/`hana_client.py`; schema validado anti-inyección; bind params; empresa-aware (Paso G). BD: solo permiso nuevo → falta `sembrar_permisos`.
- **Estado:** en código, sin desplegar. Punto de retorno tag `pre-manifiestos-2026-08-25` (ambos repos). `py_compile` OK; falta probar el GET contra HANA real.

### 2026-08-25 — Módulo Manifiestos · Fase 2: pantalla "Asignar Pallets" (Modulo15, solo lectura)
- **Qué:** módulo nuevo `Asignar Pallets` (id 15, permiso `manifiestos`) que lee los pallets disponibles de SAP (`getPalletsDisponibles` → GET solo lectura), permite seleccionarlos rápido (escaneo por folio, rango `25940-25960`, clic y **Shift+clic** para seleccionar/deseleccionar) y muestra la **vista previa de la OV agrupada** (por PT+lote+depto) con cultivo/lote/depto/cajas. Botón **"Crear OV" DESHABILITADO** (la escritura a SAP es Fase 3). Selector de **fecha** incluido.
- **Archivos (front `feat/manifiestos`):** `src/modulos/Modulo15.jsx` (nuevo), `src/store/api.js` (`getPalletsDisponibles`), `src/App.jsx` (import icono + lazy + MODULOS + render). Backend: `src/sap/queries.py` expone flag `corregido` (cultivo tomado de la OF) — sigue solo lectura, sin cambio de esquema.
- **Seguridad:** ✅ **aditivo** — módulo aislado, no toca ningún módulo existente ni el store global; solo consume el GET de solo lectura; gateado por `manifiestos.ver`; no escribe nada a SAP. `vite build` OK.
- **Estado:** en código, sin desplegar. Falta: `sembrar_permisos` (para ver el módulo) + probar el GET contra HANA real. Próximo: Fase 3 (crear la OV en SAP, TEST_SLA primero).

### 2026-08-25 — Módulo Manifiestos · Fase 3: crear OV + asignación de pallets en SAP (ESCRITURA)
- **Qué:** la app crea la Orden de Venta + asignación de pallets en SAP (Service Layer, solo GET/POST/PATCH), replicando el POC probado. Idempotente/resumible. Módulo nuevo tabla `manifiestos` + `POST /api/sap/orden-venta` + `GET /api/sap/clientes-venta`. Frontend: botón "Crear OV" conectado (cliente + fecha) con aviso del DocNum.
- **Archivos:** backend `feat/manifiestos` (`src/sap/manifiestos.py` nuevo, `src/sap/service.py` `crear_orden_venta`, `src/sap/router.py`, `src/sap/queries.py`, `src/models/manifiestos.py` nuevo; commits `8596f9a`, `3aed3a0`); frontend (`src/modulos/Modulo15.jsx`, `src/store/api.js`; commit `49eb540`). Docs: `docs/cambios/2026-08-25-manifiestos-fase3.md`, `docs/CAMBIOS-BD.md`.
- **Seguridad:** ✅ **solo GET/POST/PATCH** (cero PUT/DELETE); no toca `client.py`/`session.py`; idempotente/resumible (la OV no se puede borrar → clave por conjunto de pallets, `order_docentry` UNIQUE); `_exigir_company_resuelta` + permiso `manifiestos.editar`; no crea objetos globales de SAP. Revisión adversarial hecha.
- **Estado:** en código, **SIN desplegar**. **Falta probar en `TEST_SLA`** (crear OV real, verificar líneas/asignación/embarque + reintento no duplica) antes de cualquier company productiva. `py_compile` + `vite build` OK.

### 2026-08-25 — Módulo Manifiestos · Fase 4: guardar OV en la app (borrador) → lista → "Mandar a SAP"
- **Qué:** cambia el flujo — "Crear OV" ya NO pega a SAP directo. Ahora **"Guardar OV"** guarda la orden en la app (borrador, con sus pallets); aparece en una nueva pestaña **"Órdenes de venta"** con su estado (Borrador · en la app / En proceso / En SAP), y un botón **"Mandar a SAP"** la envía cuando esté lista (+ "Cancelar" para borradores). Los pallets de un borrador se **reservan** (no aparecen como disponibles para no ponerlos en dos OV). Alinea con el diagrama (la app prepara y ALIMENTA a SAP). La ruta de emergencia (sin pallets/gerente) queda para después.
- **Archivos:** backend `feat/manifiestos` (`src/models/manifiestos.py` col `estado`, `src/sap/service.py` `guardar_borrador`/`enviar_a_sap`/`listar_manifiestos`/`palletdets_reservados`/`cancelar_borrador`, `src/sap/router.py` endpoints `POST/GET /manifiestos`, `POST /manifiestos/{id}/enviar|cancelar`, `src/scripts/agregar_estado_manifiestos.py`; commit `8eb3275`); frontend (`src/modulos/Modulo15.jsx` pestañas + guardar, `src/modulos/OrdenesVentaLista.jsx` nuevo, `src/store/api.js`, `src/App.jsx`).
- **Seguridad:** ✅ guardar borrador NO toca SAP; el envío sigue con las mismas garantías (solo GET/POST/PATCH, idempotente/resumible, candado in-flight, `_exigir_company_resuelta`, permiso `manifiestos.editar`). BD: columna `estado` **aditiva** → correr `python -m src.scripts.agregar_estado_manifiestos` en BDs donde la tabla ya existía.
- **Estado:** en código, sin desplegar. `vite build` + `py_compile` OK. **Falta:** correr el script de la columna `estado` en local, y probar el flujo (guardar → lista → Mandar a SAP) en TEST_SLA.

### 2026-08-25 — Módulo Manifiestos · panel de confirmación antes de "Mandar a SAP"
- **Qué:** al dar **Mandar a SAP** ahora sale un **panel de confirmación** (`ConfirmarEnvioSAP.jsx`) que muestra EXACTAMENTE lo que se creará en SAP (cliente, fecha, cada línea con cultivo/lote/depto + folios, totales) + advertencia "la OV no se puede borrar" → botón "Sí, mandar a SAP" / "Cancelar". Igual que el vaciado ("esto se manda, ¿seguro?"). Aplica a todos los botones de Mandar a SAP.
- **Archivos:** `src/modulos/ConfirmarEnvioSAP.jsx` (nuevo), `src/modulos/Modulo15.jsx` (estado `porEnviar` + `pedirEnviar`/`confirmarEnvio`; el envío real corre al confirmar).
- **Seguridad:** ✅ solo UX; no cambia la escritura a SAP (mismas garantías). Refuerza el control (nada se manda sin ver qué se manda).
- **Estado:** en código, `vite build` OK.

### 2026-08-25 — Módulo Manifiestos · Fase 5a: pestaña "Órdenes de venta" = Tablero de Embarques
- **Qué:** la pestaña de OV se convierte en el **Tablero de Embarques** (del mockup): KPIs (Órdenes/Cajas/En la app/En SAP/Pallets), buscador + filtros (Todas/En la app/En SAP), tabla con **pipeline ASIG→EMB→MANIF→FLETE→FACT**, columna **Estado** y columna **SAP** (En SAP / Por enviar), y un **drawer** de detalle con líneas+pallets y acciones (Mandar a SAP / Cancelar). Muestra los **dos caminos** (En SAP vs En la app). Por ahora el pipeline solo enciende **ASIG** (en SAP); EMB/MANIF/FLETE/FACT se reconciliarán **automático desde SAP** en la Fase 5b.
- **Archivos:** frontend (`src/modulos/TableroEmbarques.jsx` nuevo, `src/modulos/Modulo15.jsx`, se eliminó `OrdenesVentaLista.jsx`); backend (`src/sap/service.py` `_resumen` ahora incluye `productos` + `lineas`; commit `6b57ce2`). Commit front `ccef452`.
- **Seguridad:** ✅ solo lectura de la BD local + acciones ya existentes (Mandar a SAP mantiene sus garantías). No toca SAP de más.
- **Estado:** en código, sin desplegar. `vite build` + `py_compile` OK. **Falta (Fase 5b):** reconciliación automática desde SAP (embarque/entrega/factura/flete) para encender el resto del pipeline + alerta "generado en la app, falta en SAP"; y la ruta de emergencia (manifiesto sin pallets, permiso del gerente).

### 2026-08-26 — Módulo Manifiestos · Fase 6: Crear Embarque (camión + pallets + manifiesto + entrega)
- **Qué:** módulo nuevo para armar el **embarque completo en SAP** (Service Layer), replicando el AddOn (POC probado, embarque 881). Pantalla "Nuevo embarque" (3 pestañas: Transporte con camión de catálogo, Pallets con **Shift+click + distribución drag&drop** en el camión, Manifiestos auto por cliente) abierta desde el botón del Tablero de Embarques. Backend: GET pallets-por-embarcar + catálogos (transportistas/conductores/agentes) + `POST /api/sap/embarque` (crea `U_P_SHIPMENT`+`_DETAIL`+`_MANIFEST` + Entrega `DeliveryNotes` BaseType 17 + PATCH `IsDelivery`), idempotente/resumible. Tabla `embarques_sap`.
- **Archivos:** backend `feat/manifiestos` (`src/sap/embarques.py` nuevo, `src/sap/service.py` `crear_embarque`, `src/sap/queries.py`, `src/sap/router.py`, `src/models/embarques.py` nuevo; commits `87b4d11`/`9c0dd28`/`9c6b497`); frontend (`src/modulos/NuevoEmbarque.jsx` nuevo, `src/modulos/TableroEmbarques.jsx`, `src/store/api.js`). Doc `docs/cambios/2026-08-26-manifiestos-fase6-embarque.md`, `docs/CAMBIOS-BD.md`.
- **Seguridad:** ✅ solo GET/POST/PATCH (cero PUT/DELETE); no toca `client.py`/`session.py`; idempotente/resumible (embarque + Entrega no se borran → clave `EMB_{hash}`, `shipment_code` UNIQUE, candado in-flight, adopt-by-GET del detalle/manifiesto, y la Entrega reconcilia re-leyendo la OV); `_exigir_company_resuelta` + permiso `manifiestos.editar`; HANA solo SELECT. **Revisión adversarial hecha** (se endureció la Entrega). Residual: consecutivos de manifiesto entre embarques concurrentes (raro).
- **Estado:** en código, **SIN desplegar**. **Falta probar en `TEST_SLA`** (embarque real desde la app). `py_compile` + `vite build` OK.

### 2026-08-26 — Módulo Manifiestos · Fase 6 (cont.): número de manifiesto + tablero embarcada + lista de embarques
- **Qué:** (1) **Número de manifiesto desde la app** (pestaña Manifiestos de Nuevo embarque, un input por OV): se escribe en `U_P_SHIPMENT_MANIFEST.U_ManifestNumber` **y** en la Entrega `ODLN.U_Manifiesto` (queda anidado) — todo PATCH/POST a campos que YA existen. (2) El **tablero marca la OV como "Embarcada"** y avanza el paso EMB cuando la OV ya está en un embarque de la app. (3) Nueva pestaña **"Embarques"** con la **lista** de embarques creados (folio/camión/OVs/cajas/pallets), como la del AddOn. Y la pestaña Manifiestos ahora **carga el destino real** (ship-to) del cliente.
- **Archivos:** backend (`src/sap/embarques.py` `crear_manifest`+`patch_entrega_manifiesto`, `src/sap/service.py` `crear_embarque`+`listar_embarques`+`ovnums_embarcadas`, `src/sap/router.py` `/embarques`+`/cliente-destino`+`numeros`); frontend (`src/modulos/NuevoEmbarque.jsx`, `EmbarquesLista.jsx` nuevo, `TableroEmbarques.jsx`, `Modulo15.jsx`, `store/api.js`).
- **Seguridad:** ✅ solo GET/POST/PATCH a campos existentes (autorizado por el gerente); el nº de manifiesto en la Entrega es un PATCH best-effort (no rompe el embarque si falla). Lista de embarques = solo lectura de la BD. Multiempresa respetado. Residual conocido: consecutivos de manifiesto entre embarques concurrentes; nº de manifiesto solo se escribe al crear (editar después = fase futura).
- **Estado:** en código, `vite build` + `py_compile` OK. Falta probar en `TEST_SLA` (crear embarque con nº de manifiesto y ver que quede en el manifiesto + la Entrega).

---

> **Formato para las próximas entradas:** fecha · qué · archivos/commits · **revisión de seguridad (página + SAP)** · estado (probado/desplegado). Nada se cierra sin la revisión de seguridad.
