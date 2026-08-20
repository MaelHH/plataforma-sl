# Plan — Módulo de Manifiestos (embarque → manifiesto → OC), con SAP real + plan B

> **Estado: PLAN. No se toca código todavía.** Objetivo: organizar lo que me platicaste, agregar recomendaciones y un enfoque por fases para que **todo sea de SAP** (lo que quieren los dueños) **sin cerrarle las posibilidades a logística** (que hoy usan el Excel porque SAP no siempre está listo). Fecha: 2026-08-18. Relacionado: [embarques-excel-vs-programa.md](./embarques-excel-vs-programa.md).

---

> [!important] Aclaración del dueño (2026-08-18) — así queda el alcance de corto plazo
> - **Los embarques SIEMPRE se crean en la app de logística; NO se mandan a SAP por ahora** (se deja la **puerta abierta** para enviarlos después).
> - Lo que se quiere YA: que los **PT asignados sean REALES de SAP y con stock**, para **no estimar** ni meter números inexactos — que el conteo sea real.
> - Si un PT **no tiene cajas en stock** → **BLOQUEO** (no se puede crear/asignar así) **hasta que el gerente (Kiko) lo autorice** = una **salida de emergencia**, y **siempre queda el usuario del responsable** que autorizó, por si hay algún problema.
> - Por eso el **corto plazo = §4a + §4b** (PT real + stock + bloqueo con salida de emergencia), todo **dentro de la app**. La OC/envío a SAP (§4c–§4d, fases 4-6) queda **para después** (puerta abierta).

## 1. La idea en una frase

Hacer que el **manifiesto** viva **anidado al embarque** dentro del programa, con sus **PT jalados reales de SAP**, y que de cada manifiesto salga una **Orden de Compra (OC) de flete** (como las de acarreo, pero con el manifiesto y su factura). Todo se **verifica contra SAP con GET**, y hay un **plan B controlado** para cuando SAP todavía no tiene el stock.

```
EMBARQUE ──► MANIFIESTO (anidado, con PT de SAP) ──► OC de flete (manifiesto + factura)
   │              │                                         │
   │              ├─ ¿todos los PT con cajas en SAP? ──► sí: sigue normal
   │              │                                    └─ no: AVISO + autoriza KIKO + marca ROJA + seguimiento GET
   │              │
   └──────────────┴──► LISTA / TABLERO de manifiestos (estado, OC, factura, sin-stock, re-ruteos)
```

---

## 2. Cómo encaja con lo que YA existe (no empezamos de cero)

| Módulo actual | Qué aporta a esto |
|---|---|
| **Embarques (Modulo5)** — Daniel/Cristina | Ya captura el **folio de manifiesto** y genera el **Manifiesto PDF** (`reportes/manifiestoEmbarque.js`). Aquí vive el "apartado del manifiesto". |
| **Consolidado y Fletes (Modulo6)** — Cristina | Es el **punto de integración con SAP** ("aquí se impacta SAP con el manifiesto y los fletes"). Reparte el flete por empresa. **OJO:** el mismo banner dice *"SAP es mono-empresa: en consolidados hay que dividir y subir por empresa"* → la OC del flete se divide por empresa. |
| **Evidencias (Modulo4)** | Captura la distribución de **PT por parrilla** (de dónde salen los PT del manifiesto). |
| **OC de acarreo/flete (ya existe)** | El patrón de crear OC de flete en SAP ya está (campo directo, materiales). La nueva OC de manifiesto **reusa ese patrón** + le agrega el manifiesto. Ver [[sap-control-fletes-acarreo]], [[sap-tabla-departamento-oc]]. |
| **Lectura de PT de SAP** | Ya se leen productos terminados de SAP (`getProductosTerminadosSAP`, solo lectura). Es la base para jalar los PT reales + su stock. |

> **Conclusión:** no es un módulo nuevo desde cero — es **conectar Embarques + Fletes con SAP** y agregarle el manifiesto anidado, la OC con manifiesto, el control de stock y el tablero.

---

## 🔑 El AddOn de SAP (del manual `DEV_01`) y cómo convivir con él — LA RECOMENDACIÓN CLAVE

### Qué hace el AddOn de SAP (flujo real)
**Pallets (PT reales en inventario) → Orden de Venta → Embarque → Entregas.**
1. **Asignación de pallets:** en una **Orden de Venta** (con cliente), se asignan **pallets REALES** ya producidos/en inventario.
2. **AddOn de embarques:** datos de transporte (línea/conductor) → se agrupan las **órdenes de venta** → acomodo (posiciones) → datos del manifiesto → **"Terminar" crea el embarque y genera las Entregas**.
3. **Lista de embarques** (borrador/terminados) y **Cancelación** (con contraseña + 2ª confirmación → libera las órdenes de venta).

### El nudo
- SAP **exige pallets reales**; **producción no registra el stock a tiempo** → logística no puede crear la OV/embarque en SAP cuando sale el camión → usan el **Excel** para preparar sin SAP, y crean la OV/embarque en SAP **después**.
- **Choque:** los dueños quieren "todo de SAP"; logística tiene razón en que **debe salir a tiempo**.

### Recomendación: la app = capa de **PREPARACIÓN + CONTROL** que ALIMENTA a SAP (no lo reemplaza)
1. La app **prepara** el embarque (acomodo, manifiesto, asignación de PT) como el Excel, **pero jalando datos REALES de SAP** (pallets/PT + stock por GET). → resuelve "que el número sea real, no estimado".
2. Cuando el pallet/PT **aún no está en SAP** → **salida de emergencia** (autoriza **Kiko**, marca roja, usuario responsable) → logística sale a tiempo, con trazabilidad.
3. **La app NO crea la Orden de Venta / Embarque / Entregas en SAP** — eso se queda en el **AddOn de SAP** (lo hace logística/producción cuando los pallets ya están). Así **no rompemos las reglas ni duplicamos el addon**.
4. La app **vincula y verifica por GET:** cuando la OV/embarque se crea en SAP, se liga al embarque de la app (por folio/referencia) y el tablero marca **"ya en SAP"**.
5. La app da la **lista de "faltantes en SAP":** qué pallets/PT faltan para los embarques pendientes → producción sabe **exactamente qué registrar** y logística ve qué está en rojo. Esto **presiona el cuello de botella real** (stock a destiempo) sin frenar la operación.

### Qué gana cada quien
- **Dueños:** el sistema de registro sigue siendo **SAP** (OV/embarque/entregas se crean allá). La app solo **prepara y controla**, con datos reales de SAP.
- **Logística:** **sale a tiempo** (salida de emergencia), con datos reales donde los hay, y una lista clara de lo que falta.
- **Producción:** ve la **presión/lista** de lo que falta registrar, con el **nombre del responsable** que autorizó cada salida de emergencia.

### ✅ Decisión (2026-08-18): leer PALLETS REALES de SAP (no estimar)
El **"cajas por parrilla" del Excel es un ESTIMADO** — y cuando no hay stock, en el Excel **"se lo inventan"**. La operación quiere que **todo sea de SAP**, así que lo correcto es **leer los PALLETS REALES de SAP** (como el AddOn: cada pallet con sus **cajas reales**), **NO** estimar con "cajas por parrilla".
- **DÓNDE VIVEN LOS PALLETS (resuelto):** tabla de usuario (UDT) **`P_PALLETS`** (en HANA: `"@P_PALLETS"`), con detalle `P_PALLETSDETAIL` y asignación `P_PALLET_ASGMNT` / `P_PALLET_ASGMNT_DET`. Cada pallet trae: **ItemCode (PT)**, **Número de cajas (real)**, **Activo (Y/N)**, **Agricultor (= empresa)**, **Cultivo**, **Lote**, **PalletId**, Tipo de pallet.
- **CÓMO SE LEE (respeta reglas):** NO por Service Layer (es UDT), sino por **HANA directo con `SELECT` (solo lectura)** — el MISMO patrón ya probado de [[SAP Control de Fletes Acarreo]] (`hana_client.py`, SELECT-only, no toca SAP). Cero escritura.
- **Pendiente para construir:** (1) el **`HANA_SCHEMA`** (el mismo que se iba a poner para los fletes de acarreo, por empresa/company); (2) los **nombres exactos de las columnas `U_...`** de `@P_PALLETS` y `@P_PALLET_ASGMNT` (se obtienen con un `SELECT TOP 1 * FROM "@P_PALLETS"` o del dev de SAP).
- **Diseño:** SELECT read-only de pallets **disponibles** (`Activo='Y'` y **no** en `P_PALLET_ASGMNT`), por empresa/cultivo → en la asignación se eligen **pallets reales** (cero estimación). Cuando **no haya pallets** → **bloqueo + salida de emergencia (Kiko)** para que no se inventen.
- Lo ya hecho (**Panel de PT + stock real**, Fase 1) **sigue sirviendo** (muestra el stock real de SAP); el "cajas por parrilla" queda solo como **respaldo** si un PT no tuviera pallets.

### No confundir: Orden de VENTA vs Orden de COMPRA
- **Orden de Venta** = el producto al cliente (pallets). Vive en el **AddOn de SAP**. La app la **prepara/vincula**, no la crea.
- **Orden de Compra (flete)** = el pago al transportista (como acarreo) + manifiesto + factura. Esa **sí** la puede crear la app con el patrón existente (fase futura).

### Dónde NO meterse (reglas)
- No duplicar el AddOn ni crear OV/embarque/entregas desde la app (por ahora) — es de SAP.
- Solo **GET** para leer pallets/stock/OV/embarque. Los pallets los crea **producción en SAP**; la app los lee.
- La **cancelación** de embarque en SAP (con contraseña) se queda en SAP.

---

## 3. Conceptos clave (para que quede claro el modelo)

- **Manifiesto = flete**, anidado a un **embarque**. Un embarque puede tener uno o varios manifiestos (consolidado / varias agrícolas).
- De un manifiesto sale **al menos una OC de flete** (como acarreo) que **lleva el manifiesto + su factura**.
- **Un manifiesto puede tener VARIAS OCs** (esto resuelve el problema del re-ruteo — ver §4d).
- **PT (producto terminado):** vienen **reales de SAP** (código, nombre, **cajas en stock**). Es lo más importante para los dueños.

---

## 4. Los flujos (detallados)

### 4a. Crear el manifiesto anidado al embarque (con PT de SAP)
1. Desde el embarque se crea el manifiesto (folio, destino, empresa/agrícola).
2. Los **PT se jalan reales de SAP** (GET): código, descripción, **cajas disponibles**. Ese es el catálogo autoritativo.
3. Se arma el manifiesto con sus PT y cantidades (cajas), como hoy pero con datos vivos de SAP.

### 4b. Sin stock → BLOQUEO con salida de emergencia (autoriza el gerente)
La meta es que el **número de cajas de cada PT sea REAL** (de SAP), no estimado. Al asignar los PT y crear el embarque, **el sistema verifica con GET si cada PT tiene cajas en SAP**:
- **Si todos tienen stock** → se asigna con el dato real y sigue normal.
- **Si algún PT NO tiene cajas en stock** → **BLOQUEO**: no se puede crear/asignar así (freno a propósito para no meter números inexactos).
  1. **Salida de emergencia:** solo el **gerente de embarques (Kiko)** puede destrabar el bloqueo, **desde su cuenta**. Es una **excepción**, no el camino normal.
  2. **Aviso fuerte estilo SAP** al autorizar (confirmación explícita de que se crea así, bajo su responsabilidad).
  3. **Siempre queda el usuario del responsable:** **"Autorizado por: <nombre> (<usuario>)"** + fecha/hora — por si después hay algún problema. *(Mismo patrón de 2ª persona que ya usamos en Empaque.)*
  4. El embarque/manifiesto queda **marcado en ROJO: "creado sin stock (salida de emergencia)"**.
  5. **Seguimiento por GET:** el sistema revisa en SAP si ya apareció el stock de ese PT; cuando aparece, se puede **limpiar la marca**.
- **Freno anti-abuso:** **cada** salida de emergencia **exige** la autorización del gerente — no queda como algo que cualquiera repite libremente.

> **Nota:** como los embarques **no se mandan a SAP por ahora**, este bloqueo es sobre todo de **calidad de dato** (que el conteo sea real y con respaldo). El día que se conecte el envío a SAP, este **mismo candado** evita mandar cantidades sin stock.

### 4c. OC al manifiesto (como acarreo + manifiesto + factura)
1. Con el manifiesto creado, se genera una **OC de flete** con el **patrón existente de acarreo** (no se cambia la forma de mandar a SAP), **agregándole el manifiesto**.
2. La OC **lleva el manifiesto y su factura**.
3. **Reconciliación (GET):** la **lista de manifiestos** sirve para saber si la OC ya trae el manifiesto correcto → se compara **el manifiesto de la página vs. el manifiesto puesto en la OC de SAP**; si son iguales, es el mismo → la OC queda ligada a ese manifiesto.
4. **Consolidados:** si el embarque junta varias empresas, la OC se **divide y sube por empresa** (SAP es mono-empresa) — ya lo contempla Modulo6.

### 4d. Re-ruteo — mismo manifiesto, otra OC (el problema del "doble cobro")
- Un manifiesto **es un flete**. A veces el flete se **cancela en Culiacán** y desde ahí se va a **Chihuahua** → **es el MISMO manifiesto**, pero necesita **OTRA OC**.
- **Recomendación:** **un manifiesto → muchas OCs** (una por tramo/re-ruteo). **NO borrar** el flete/OC anterior (borrar es justo lo que hoy causa el **doble cobro** descontrolado):
  1. La OC anterior se **cancela/marca** (con su motivo y destino original).
  2. Se crea una **OC nueva** ligada al **mismo manifiesto**, con el **nuevo destino/ubicación**.
  3. El tablero muestra el historial: manifiesto → OC-1 (cancelada, Culiacán) → OC-2 (activa, Chihuahua).
- Así se **lleva el control** de todos los fletes: cuáles se **re-hicieron**, cuáles **no están facturados**, cuáles **no tienen OC**.

---

## 5. La LISTA / TABLERO de manifiestos (el control que pidieron)
Una tabla de todos los manifiestos creados, con **acciones por manifiesto** y su estado leído de SAP:

| Columna | De dónde |
|---|---|
| Folio de manifiesto | app |
| Embarque / empresa / destino | app |
| Estado stock | GET SAP (🟢 con stock · 🔴 sin stock, autorizado por Kiko) |
| **OV (orden de venta)** | **GET SAP — reconcilia contra las OV YA creadas: ¿este embarque ya tiene su orden de venta en SAP?** |
| OC de flete | app + GET SAP (Nº de OC, si el manifiesto de la OC coincide) |
| Factura | GET SAP |
| Manifiesto | app ↔ SAP (folio de la página vs el puesto en SAP) |
| Re-ruteos | app (historial de OCs del mismo manifiesto) |
| Autorización | quién/cuándo (si fue sin stock) |
| Acciones | ver, editar*, eliminar*, crear OC, re-rutear (*con permiso) |

> **Reconciliar contra las OV ya creadas (importante):** por cada embarque/manifiesto de la app, se **cruza con SAP por GET** si ya tiene: **Orden de Venta (OV), OC de flete, factura y manifiesto**. Así ves de un vistazo qué está **completo en SAP** y qué **falta** — que es justo el control que pidieron. Las OV se crean en el **AddOn de SAP** (no en la app); la app solo las **lee y vincula**.

---

## 6. Modelo de datos propuesto (aditivo, sin romper lo actual)
- **`manifiesto`** (anidado al embarque): `id`, `embarque_id`, `folio`, `empresa`, `destino`, `pts[]` (código SAP, descripción, cajas, **stock_ok** al momento), `estado`, `sin_stock` (bool), `autorizacion` `{por, porId, usuario, ts}`, `sap_stock_check` (último GET).
- **`oc_manifiesto`** (varias por manifiesto): `id`, `manifiesto_id`, `destino/ubicacion`, `oc_sap_docentry`, `factura`, `estado` (activa/cancelada), `motivo_cancelacion`.
- Todo **etiquetado por empresa** (multiempresa) y con el **bloque de auditoría** de la casa. Reusar el patrón de idempotencia de las OC ya existentes.

---

## 7. Permisos (RBAC) nuevos sugeridos
- `embarques.manifiesto.crear` / `.editar` / `.eliminar` (editar/eliminar = **gerente**, como pediste en tus notas).
- **`embarques.autorizar_sin_stock`** → **solo Kiko** (gerente de embarques). Es el candado del plan B.
- `embarques.oc.crear` (crear la OC del manifiesto).
- Todo se siembra en `catalogo_permisos.py` + `sembrar_permisos` (igual que hicimos con los de pestaña).

---

## 8. Reglas SAP (respetando lo innegociable)
- **Leer TODO lo posible de SAP con GET:** PT, **cajas/stock**, OC, factura, y la reconciliación manifiesto↔OC. Es lo más importante para los dueños.
- **Crear** solo lo que ya se crea hoy con el patrón permitido (la **OC de flete** vía el mismo POST de acarreo). **No** se cambia la forma de mandar al Service Layer.
- **Los embarques NO se mandan a SAP por ahora** — se crean y viven en la app (con la **puerta abierta** para enviarlos después). El candado de stock es hoy de **calidad de dato**; cuando se conecte SAP, el mismo candado evita mandar cantidades sin respaldo.
- **Nunca** crear/escribir objetos globales de SAP (PT, series, UDF, tasas). Los PT los crean/terminan **ellos en SAP**; la app solo los **lee** y, si faltan, usa el plan B. Ver [[Reglas SAP (innegociables)]].

---

## 9. Recomendaciones y optimizaciones (lo que me pediste)

1. **Fail-soft con candado, no fail-hard.** No bloquear cuando SAP no tiene stock → **permitir con autorización de Kiko + marca roja + seguimiento GET**. Respeta "todo de SAP" (se reconcilia después) sin frenar a logística. *Es el corazón del plan B.*
2. **Snapshot de los PT al crear el manifiesto.** Guardar código/descr/cajas tal como estaban en SAP en ese momento. Así, si SAP se cae o el PT cambia, el manifiesto no se rompe ni pierde el histórico (patrón que ya usamos: guardar el dato + reconciliar por GET).
3. **PT manual SOLO como plan B, y marcado.** Si un PT no existe en SAP, permitir capturarlo a mano **pero rotulado "fuera de SAP"** → obliga a que después se cree en SAP y no se vuelva costumbre.
4. **Seguimiento automático por GET** (no manual): un chequeo periódico de stock que **limpia solo** la marca roja cuando el stock llega, y una vista de "manifiestos pendientes de stock" para que Kiko/logística la vean.
5. **Un manifiesto → muchas OCs** desde el diseño (re-ruteo). Cancelar-y-recrear, **nunca borrar**, para matar el doble-cobro y dejar rastro.
6. **Reconciliación por el folio del manifiesto** (página ↔ OC de SAP). Que el folio del manifiesto viaje en la OC (en el campo que ya usan) para poder cruzarlos por GET sin UDFs nuevas.
7. **Consolidados:** dividir la OC por empresa (SAP mono-empresa) reusando lo de Modulo6 + el ruteo por empresa que ya montamos ([[Multiempresa - aislamiento por empresa y asignaciones]]).
8. **Todo con trazabilidad:** quién autorizó, cuándo, qué se mandó sin stock, qué re-ruteo — en bitácora (ya existe).

---

## 10. Fases sugeridas (para no meter todo de golpe, estilo cambio-seguro)

| Fase | Qué | Riesgo |
|---|---|---|
| **0** | Congelar este plan + confirmar las preguntas abiertas (§11) con Kiko/dueños. | — |
| **1** | **Manifiesto anidado al embarque** + jalar **PT reales de SAP (GET)** + snapshot. (Sin OC todavía.) | Bajo (lectura) |
| **2** | **Validación de stock** al crear + **plan B**: aviso + **autorización de Kiko** + marca roja + seguimiento GET. | Medio (RBAC + GET) |
| **3** | **Lista/tablero de manifiestos** con estado (stock, OC, factura, autorización). | Bajo (lectura) |
| **4** | **OC al manifiesto** (patrón acarreo + manifiesto + factura) + reconciliación página↔SAP. | **Sensible** (escribe OC a SAP) |
| **5** | **Re-ruteo** (mismo manifiesto, nueva OC; cancelar sin borrar) + control anti-doble-cobro. | **Sensible** |
| **6** | Consolidados: dividir OC por empresa. | Sensible |

> Cada fase con su punto de retorno, revisión adversarial y prueba en entorno de prueba antes de prod (como venimos haciendo).

---

## 11. Preguntas abiertas (a confirmar antes de la Fase 1)
1. **La OC del flete, ¿la crea la app en SAP (POST, como acarreo) o se captura en SAP y la app solo la lee/vincula?** (Cambia mucho el alcance de la Fase 4.)
2. **Un embarque "sin stock", ¿puede tener OC de flete de todas formas** (el camión se mueve igual), o la OC espera a que haya stock?
3. **Cuando llega el stock a SAP, ¿el embarque se sube a SAP manual (ellos) o la app lo empuja?** (Dijiste que ellos lo agregan; confirmo que la app solo avisa.)
4. **El folio de manifiesto**, ¿en qué campo de la OC de SAP viaja hoy? (Para reconciliar sin inventar UDFs.)
5. **PT sin cajas: ¿se permite mandarlo con cantidad manual, o cantidad 0** hasta que haya stock?
6. **¿Quién más (además de Kiko) puede autorizar** si Kiko no está? (Suplente o solo él.)

---

## 12. Resumen para los jefes (1 párrafo)
Se llevará el manifiesto y sus fletes **al programa, conectados con SAP**: los productos y su stock se **leen reales de SAP** (lo que ustedes quieren), y de cada manifiesto sale su **OC de flete con factura**, todo con un **tablero de control** (qué está facturado, con OC, o se re-ruteó). Para no frenar la operación cuando SAP aún no tiene el stock, hay un **plan B con candado**: se puede crear el embarque **solo con autorización de Kiko**, queda **marcado en rojo "sin stock"** y el sistema **vigila SAP** hasta que el stock llegue — así nada se queda sin registrar en SAP y no se acumula.
