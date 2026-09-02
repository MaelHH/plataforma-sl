# Plan — Manifiesto SIN PT en SAP (ruta de emergencia) + Tablero de manifiestos (SAP / app) + PDF para todos

> **Estado: PLAN. No se toca código todavía.** Continúa [plan-modulo-manifiestos.md](./plan-modulo-manifiestos.md) y [embarques-excel-vs-programa.md](./embarques-excel-vs-programa.md). Arranca el **Camino B** (sin pallets en SAP) + el **apartado unificado de manifiestos con PDF para todos**. Fecha: 2026-09-01.

---

## 0. Lo que se pidió (en corto)

1. **Manifiesto sin PT en SAP** — cuando no hay pallets/stock en SAP, poder **crear EL MANIFIESTO igual** (como en el Excel), para salir a tiempo. App-only, con **permiso del gerente**, marcado como **pendiente de SAP**.
2. **Apartado de manifiestos: los que están en SAP y los que no** — entrar a un manifiesto, **ver su info**, y **agregarle la información que NO sale de SAP** (sellos, camión, pesos, agencia, distribuidor…), como en el Excel.
3. **PDF para TODOS los manifiestos** — incluso los de SAP (que hoy mandan en físico). Un solo formato de manifiesto, se genere de donde se genere.

> Aclaración del Excel: el archivo del repo `FLETES CACALUTA Y SAN QUINTIN 2026.xlsx` es el **ledger de costos de flete** (semana/referencia/destino/flete/IVA/factura/OC). El del **manifiesto** es el `SQGUIA CLUSTER EMBARQUES MACROS.xlsm` (capturan TODO en la hoja **MENU** y las macros imprimen **Guía, Manifiesto, Acomodo, Sellos, Datos del transportista, Remisiones**). Ver el desglose en [embarques-excel-vs-programa.md](./embarques-excel-vs-programa.md).

---

## 1. Idea en una frase

Un **manifiesto** siempre puede existir en la app (venga o no de SAP). Se le **agrega la info manual que el Excel captura y SAP no** (sellos, camión, pesos reales, agencia, distribuidor, acomodo), y de **cualquier** manifiesto sale **el mismo PDF**. Si NO hay pallets en SAP, con permiso del gerente se crea **app-only** (pendiente) para salir a tiempo; cuando lleguen los pallets reales, se **liga** al manifiesto real de SAP.

```
Manifiesto (una sola vista/tablero)
 ├─ origen = SAP   → datos vienen de SAP (embarque/entrega/OV) + overlay manual (sellos, camión, pesos…)
 └─ origen = APP   → TODO manual (permiso del gerente), marcado "pendiente de SAP"
       (ambos) ──► MISMO PDF de manifiesto  +  botón "ligar a SAP" cuando aparezca el real
```

---

## 2. Lo que YA tenemos (no empezamos de cero)

| Ya existe | Sirve para |
|---|---|
| Embarque → **manifiesto en SAP** (`U_P_SHIPMENT_MANIFEST`) + sella `Entrega.U_Manifiesto` | Los manifiestos "origen SAP" |
| **Capturar/editar el nº de manifiesto** por OV (recién hecho) + tablero de embarques | Base del apartado |
| Tabla **`manifiestos`** (OV/embarque) + **`embarques_sap`** | Persistencia local por embarque |
| **PDF de manifiesto** en Modulo5 (`reportes/manifiestoEmbarque.js`, 5 páginas) | Reusar/extender para el PDF único |
| RBAC `manifiestos.*` + patrón "2ª persona" (autoriza + queda usuario) de Empaque | Permiso del gerente |
| Lectura de PT/stock de SAP por GET | Marcar 🟢/🔴 stock |

**Conclusión:** falta (a) el **overlay de datos manuales** por manifiesto, (b) el **manifiesto app-only** (emergencia), (c) el **tablero unificado SAP/app**, y (d) el **PDF para todos** desde una sola fuente.

---

## 3. Qué info es "de SAP" y qué es "manual" (del Excel)

| Dato | ¿De dónde? |
|---|---|
| Cliente, destino ship-to, OV, PT + cajas, nº manifiesto | **SAP** (GET) — para origen SAP |
| **Sellos** (origen, reemplazo, lateral, cruce) + quién abrió | **Manual** (el Excel los captura; SAP los deja en blanco) |
| **Camión/caja** (línea, marca, modelo, placas tracto/caja, económico) | Manual (SAP tiene línea; el resto se captura) |
| **Conductor** (nombre, licencia, teléfono) | Manual / catálogo |
| **Pesos reales (kg)** por PT y total | Manual (hoy el manifiesto imprime libras / nº de parrillas) |
| **Agencia aduanal, distribuidor** | Manual / catálogo (hoy salen en blanco) |
| **Acomodo** (posiciones 1–30, MIX/incompletas), temperatura | Manual (parcial hoy) |
| **Flete, anticipo, observaciones** | Manual |

> El **overlay manual** es lo mismo para un manifiesto de SAP y uno app-only. Por eso conviene **una sola estructura** de datos manuales, ligada al manifiesto por su folio/embarque.

---

## 4. Modelo de datos propuesto (aditivo)

**Tabla nueva `manifiesto_doc`** (el "documento de manifiesto" unificado, local en la app):
- `id`, `id_empresa`, `folio` (nº de manifiesto), `origen` (`sap` | `app`), `estado` (`borrador` | `emitido` | `ligado_sap` | `cancelado`).
- **Vínculo SAP** (si origen=sap): `embarque_id`, `ov_docentry`/`ov_docnum`, `entrega_docentry`/`docnum`, `card_code`.
- **Overlay manual (JSON)**: `sellos{origen,reemplazo,lateral,cruce,abrio}`, `camion{linea,marca,modelo,placasTracto,placasCaja,economico}`, `conductor{nombre,licencia,tel}`, `agencia`, `distribuidor`, `temperatura`, `flete`, `anticipo`, `observaciones`.
- **Líneas** (JSON o tabla hija): `pt`, `descripcion`, `cajas`, `pesoKg`, `lote`, `cultivo` (de SAP si origen=sap; a mano si app).
- **Acomodo** (JSON): posiciones 1–30 + filas MIX/incompletas.
- **Autorización** (si origen=app): `{por, porId, usuario, ts}` (gerente) — patrón 2ª persona.
- `AuditMixin` (quién/cuándo) + `raw` snapshot de SAP al ligar.

> Se **reutiliza** cuanto exista: si origen=sap, muchos campos se llenan del `embarques_sap`/`manifiestos`/GET; el overlay solo guarda lo que el usuario agrega.

---

## 5. El tablero (apartado unificado)

Pestaña **"Manifiestos"** (o dentro de la de Embarques): tabla de TODOS los manifiestos.

| Columna | Origen |
|---|---|
| Folio | app |
| Cliente / Destino | SAP (origen sap) o manual (app) |
| **En SAP / En la app** | badge (origen + estado) |
| Cajas / PT | SAP o manual |
| Sellos / Pesos / Camión | ✔ si ya se capturó el overlay, ✖ si falta |
| Autorización | quién/cuándo (si app-only) |
| **Acciones** | **Ver**, **Editar info** (overlay), **Generar PDF**, **Ligar a SAP** (app→sap), (app: **Crear** con permiso) |

- **En SAP:** se leen de los embarques/manifiestos que ya creamos + GET de estado. Muestra "listo, solo falta la info manual" o "completo".
- **En la app (pendientes):** los app-only, marcados 🔴 "pendiente de SAP", con su autorización.

---

## 6. El PDF único (para todos)

- **Reusar/extender** `reportes/manifiestoEmbarque.js` (ya hace 5 páginas: manifiesto, acomodo, sellos, datos del transportista).
- La fuente de datos es **`manifiesto_doc`** (SAP + overlay) → **el mismo PDF** para origen sap y app.
- Cerrar los huecos que ya listamos del Excel, por valor: **sellos capturados** (no plantilla en blanco), **pesos reales kg**, **agencia/distribuidor**, **acomodo MIX**. (Guía/Carta Porte y remisiones de aduana = fase aparte, son formatos nuevos.)

---

## 7. Fases (cambio-seguro)

| Fase | Qué | Riesgo |
|---|---|---|
| **0** | Congelar este plan + resolver §10 (con Kiko/dueños). | — |
| **1** | **Tabla `manifiesto_doc`** + **tablero unificado** (lista SAP + app, solo lectura) + "ligar" un manifiesto de SAP a su doc. | Bajo (BD + GET) |
| **2** | **Editar info manual (overlay)** por manifiesto (sellos, camión, pesos, agencia, distribuidor) + persistir. | Bajo (BD, sin SAP) |
| **3** | **PDF único** desde `manifiesto_doc` (extender el de Modulo5) para SAP y app. | Bajo (front) |
| **4** | **Manifiesto app-only** (emergencia): crear TODO manual con **permiso del gerente** (`embarques.autorizar_sin_stock`), marcado "pendiente de SAP". | Medio (RBAC) |
| **5** | **Ligar app→SAP**: cuando aparezca el embarque/manifiesto real de SAP, vincular el app-only y marcar "ligado". Reconciliación por GET. | Medio (GET) |
| **6** | Cerrar huecos del Excel (acomodo MIX, pesos, catálogos agencia/distribuidor). Guía/Carta Porte y remisiones = fase futura. | Medio |

> **SAP:** todo esto es **local + GET**. El manifiesto app-only **NO escribe nada en SAP**. Cuando haya pallets reales, la OV/embarque/manifiesto reales se crean por el flujo que ya existe; el app-only solo se **liga**. Cero PUT/DELETE, cero objetos globales.

---

## 8. RBAC (permisos nuevos)

- `manifiestos.editar_info` — capturar/editar el overlay manual (logística).
- `embarques.autorizar_sin_stock` — **solo el gerente (Kiko)**: crear un manifiesto app-only (emergencia). Queda su usuario + fecha.
- `manifiestos.pdf` — generar el PDF (o reusar `manifiestos.ver`).

---

## 9. Reglas SAP (innegociables)

- Origen SAP: **solo GET** para leer el manifiesto/entrega/OV. El overlay manual vive **solo en la app**.
- Origen app: **nada a SAP** hasta que exista el real (creado por el flujo actual). Se **liga**, no se duplica.
- **Nunca** objetos globales (UDF/series/tasas). El nº de manifiesto en la Entrega ya se sella con el campo existente (`U_Manifiesto`).

---

## 10. Preguntas abiertas

**RESUELTAS (2026-09-01):**
1. ✅ **Tablero = pestaña nueva "Manifiestos"** (propia, no dentro de Embarques).
3. ✅ **App-only: los PT/cajas SÍ se capturan a mano** — cuentan para armar el "embarque falso" (sacar el manifiesto y salir a tiempo). Después se manda a SAP con los PT reales y el app-only se **liga** al real.
7. ✅ **PDF por ahora = Manifiesto + Acomodo + Sellos + Transportista** (el alcance actual). Guía/Carta Porte + remisiones de aduana = fase futura.

**Pendientes (se pueden resolver sobre la marcha):**
2. Overlay manual: qué campos obligatorios vs opcionales para el PDF.
4. Ligar app→SAP: ¿por folio de manifiesto (buscar el de SAP con ese folio) o manual? (Recomiendo por folio.)
5. Catálogos de agencias aduanales y distribuidores: ¿tabla nueva en la app o ya existen?
6. Suplente de Kiko para autorizar si no está.

---

## 11. Arranque sugerido

**Fase 1 primero** (tabla `manifiesto_doc` + tablero unificado, solo lectura): bajo riesgo, y de inmediato ves TODOS los manifiestos (SAP + los que falten). Con eso encima, Fase 2 (editar overlay) y Fase 3 (PDF) dan el valor grande; la Fase 4 (app-only) cierra la ruta de emergencia.
