# Plataforma SL — Contexto de negocio y modelo de datos (fuente de verdad para el backend)

> **Propósito.** Este documento congela **qué hace cada área, qué lógica/proceso exige el
> cliente y la forma EXACTA de cada dato** tal como hoy funciona en el frontend. Es el
> contrato que el backend FastAPI debe respetar **sin cambiar la lógica de negocio**.
> El "cómo se construye" va en [`02-PLAN-BACKEND-FASTAPI.md`](./02-PLAN-BACKEND-FASTAPI.md).
>
> **Cómo leerlo.** Cada sección de módulo declara: *quién lo opera*, *qué lee/escribe*,
> *la forma de cada objeto* (nombres de campo TAL CUAL están en el código — son la base del
> esquema de BD), *las operaciones/transiciones* y *las reglas/validaciones*. Lo extraído
> del código (`src/store/datos.jsx` + `src/modulos/*.jsx`) es **autoritativo**; donde algo es
> ambiguo se marca con ⚠️ **VERIFICAR**.
>
> Regla de oro (estilo del proyecto): **no inventar datos**. Si un campo no existe hoy, no se
> agrega al contrato sin decisión explícita; los huecos conocidos se listan como tales.

---

## 0. Glosario del negocio

**Qué es.** Plataforma interna de **SL Logística** (SL Produce · SL Agrícola) para coordinar
el flujo de exportación de productos agrícolas (Bell Pepper, ejote, etc.): desde la planeación
semanal y la salida de campo hasta el embarque, la calidad, el monitoreo en ruta y la
documentación. Cada módulo corresponde a un rol/persona del proceso.

### Roles / personas (operan cada módulo)
| Rol | Módulo(s) | Qué hace |
|---|---|---|
| Dirección / Gerencia | Dashboard (0) | Visión general, KPIs, alertas |
| José Carlos | Programa Semanal (1) | Planea presentaciones × cajas/día |
| Kiko / Alfonso | Cálculo de Trailers (2) | Calcula y **genera el requerimiento** |
| Mónica | Tablero de Tráfico (3) | **Solo consigue trailers y confirma llegada** (los marca "en instalaciones") |
| Francisco | Evidencias de Carga (4) | Fotos + distribución por empresa → "envía a Embarques" |
| Daniel / Cristina | Embarques (5) | **Registra** el embarque: manifiestos + SAP |
| Cristina | Consolidado y Fletes (6) | **Reparte** el flete por empresa / reporta / cobra |
| Francisco / Kiko | Monitoreo en Ruta (7) | Sigue la ruta (mapa + eventos) |
| Oscar | Movimientos Campo→Empaque (8) | Registra el flete que sale de campo (remisión) |
| Empaque | Recepción en Empaque (9) | Confirma llegada + calidad/inspección/rechazo |
| Comercio Exterior | Importaciones (10) | Importación temporal IMMEX |
| — | Documentos (11) | Hub de impresión de expedientes (PDF) |
| Control de Calidad | QC - Bodegas (12) | Calidad de embarques ya en bodegas EE.UU. |

### Catálogos maestros (constantes hoy; semilla del backend)
- **Empresas** (`EMPRESAS`): `SL_AGR` (SL Agrícola), `CAT`, `CACO`. ⚠️ El catálogo
  `consignados` añade `SL Produce` como cuarta empresa para Campo. **VERIFICAR** si SAP/empresas
  debe incluir `SL Produce`.
- **Cultivos** (`cultivos`): `BP` (Bell Pepper SL), `EJ` (SL Agrícola Ejote). Editable/ampliable.
- **Destinos** (`DESTINOS_ALL`): Sin asignar, USA Texas, USA Nogales, McAllen, WM MEX, WM
  Culiacán, WM Guadalajara, WM Monterrey, WM Villahermosa, Hermosillo, Chihuahua, Torreón.
- **Orígenes** (`ORIGENES`): Los Mochis / Culiacán / Guasave, Sinaloa. `ORIGEN` por defecto = Los Mochis.
- **TOTAL = 30** parrillas por trailer (constante de cálculo).

### Constantes de proceso (no cambian la lógica; el backend las debe respetar)
- `idxToParr(idx)`: mapea índice 0..29 → número de parrilla físico (zigzag): `idx<15 ? idx*2+1 : (idx-15)*2+2`.
- `MAX_MUESTREOS = 3` (muestreos de calidad por flete de campo).
- `DIAS_ALERTA_SALIDA = 15` (umbral "por vencer" en importaciones).
- Folio de muestreo de campo: **consecutivo global = máx existente + 1, arranca en 201**.

---

## 1. Los tres flujos del negocio

### Flujo A — Planeación → Requerimiento
`Programa Semanal (M1)` → `Cálculo de Trailers (M2)` genera el *requerimiento* → lo recibe
`Tablero de Tráfico (M3)`.

### Flujo B — Exportación (el viaje del trailer)
`M3` asigna trailer y lo marca "en instalaciones" → `Evidencias (M4)` sube fotos + distribución
y "envía a Embarques" (trailer pasa a "en ruta", se crea una `cargaEmbarque`) → `Embarques (M5)`
captura manifiestos y marca SAP → `QC - Bodegas (M12)` inspecciona calidad al llegar a EE.UU. →
`Consolidado (M6)` divide el flete por empresa → `Monitoreo (M7)` sigue la ruta. `Documentos
(M11)` imprime el expediente de exportación.

```
trailer.status:  esperando ──(M3)──▶ en_instalaciones ──(M4 envía)──▶ en_ruta ──(M7)──▶ entregado
                                                                                    ◀──(M7 reactivar)──
```

### Flujo C — Campo (la remisión)
`Movimientos Campo→Empaques (M8)` registra el flete con su *remisión* → `Recepción en Empaque
(M9)` confirma llegada + calidad/inspección/rechazo. `Documentos (M11)` imprime el expediente de
campo por remisión.

### Flujo D (aparte) — Importaciones (M10)
Comercio exterior: importación temporal IMMEX con fecha límite de retorno.

---

## 2. Modelo de datos (entidades raíz del store → tablas del backend)

Todo el estado vive hoy en `src/store/datos.jsx` y se persiste en `localStorage`
(`plataforma_sl_estado_v1`). Cada clave de estado es una entidad raíz:

| Entidad (clave store) | Tipo | Rol | Persistencia objetivo |
|---|---|---|---|
| `trailers` | array | Viaje de exportación + ficha de transporte + inspección precarga | tabla |
| `cargasEmbarques` | array | Carga embarcada (snapshot trailer + distribución + manifiestos + SAP + calidad QC) | tabla |
| `monitoreo` | objeto `{[trailerId]: {...}}` | Eventos en ruta por trailer | tabla (1‑a‑1 con trailer) |
| `programa` | objeto `{[lunesISO]: [fila]}` | Programa semanal por presentación | tabla |
| `requerimientoGen` | objeto `{[lunesISO]: [req]}` | Requerimiento generado en M2 | tabla |
| `requerimientoMeta` | objeto `{[lunesISO]: {...}}` | Metadatos del envío del requerimiento | tabla |
| `movimientos` | array | Flete de campo (remisión) + recepción + muestreos + inspección | tabla |
| `importaciones` | array | Trámite de importación temporal + items | tabla |
| `bitacora` | array | Auditoría de eventos con timestamp | tabla (append‑only) |
| **Catálogos** | | | |
| `catalogo` | array | Presentaciones (`cajasPorParrilla` clave del cálculo) | catálogo |
| `cultivos` | array | Cultivos (pestañas del programa) | catálogo |
| `lineas` | array | Líneas de transporte + subcatálogos choferes/tractos/cajas | catálogo (anidado) |
| `cargaCampo` | array | "Qué se carga" en movimientos de campo | catálogo |
| `ubicaciones` | objeto `{origenes, destinos}` | Ranchos (con lotes/responsables) + empaques | catálogo (anidado) |
| `zonas` | array string | Zonas (campo "Viaje") | catálogo |
| `consignados` | array string | Empresas para Consignado/Distribuidor (compartido) | catálogo |
| `materiales` | array | Materiales importables (IMMEX) | catálogo |
| `defectosCalidad` | objeto `{[producto]: [defecto]}` | Defectos por producto (QC embarques) | catálogo |
| `inspectoresCalidad` | array string | Inspectores (compartido M9/M12) | catálogo |
| `lugaresCalidad` | array string | Lugares de inspección (QC) | catálogo |
| `responsables` | array string | Nombres usados en monitoreo | catálogo |

**Reglas transversales del modelo (no negociables):**
1. **IDs** siempre con `nuevoId(prefix)` (UUID; prefijos legibles `T_`, `CARGA_`, `MOV_`,
   `LN_`, `CH_`, `TR_`, `CJ_`, `imp_`, `it_`, `mu_`…). El backend debe aceptar IDs string y
   conservar el prefijo. Nunca contadores módulo‑globales.
2. **Timestamps**: el store guarda `ts` (ISO/UTC) **y** `tsLocal` / `creado` / `actualizado` /
   `confirmado` (texto `es-MX`). El backend debe seguir entregando ambos para no romper la UI.
3. **Snapshots vs. referencias**: `cargaEmbarque.trailer` y `cargaItems`/`items` guardan un
   **snapshot** de datos al momento del evento (no una FK viva). Esto es **intencional** (el
   expediente debe reflejar lo que se cargó ese día aunque el catálogo cambie después).
4. **Catálogos editables in‑app** (sembrados con `*_INICIAL`): el backend los expone como CRUD,
   no como enums fijos.

---

## 3. Especificación por módulo

> Para cada objeto se listan los campos **con el nombre exacto** que usa el frontend. El backend
> debe exponer/recibir esos mismos nombres (ver decisión de naming en el plan, §3).

### Dashboard (id 0) — Dirección
- **Lee:** `trailers`, `requerimientoGen[semana]`, `cargasEmbarques`, `monitoreo`, `catalogo`.
- **KPIs reales:** avance semanal `conseguidos/solicitados` (conseguidos = trailers con
  `status !== "esperando"`), en ruta, entregados, fletes activos (Σ `trailer.flete`), pendiente
  SAP (Σ fletes de cargas con `sapStatus === "pendiente"`), avance por destino.
- **Análisis de costos (real):** por carga `costoLb = flete / Σ librasDe(prod)`; agrupa por
  línea/destino/producto; semáforo vs `promedioGlobal` (verde ≤1.0, amarillo ≤1.15, rojo >1.15).
- **Alertas:** faltan trailers, pendiente SAP, costo anómalo (>1.15× promedio),
  accidente (`monitoreo[t].accidente.hubo===true`), retenes.
- ⚠️ **DEMO (NO migrar como dato real):** las gráficas de **tendencia de costo** (`TENDENCIA_DEMO`:
  semanal/mensual/temporada) están hardcodeadas. El backend debe alimentarlas con histórico real.

### Programa Semanal (id 1) — José Carlos
- **Lee/escribe:** `catalogo`, `cultivos`, `programa`.
- **Presentación (`catalogo[]`):** `{ id, label, color, cultivo, cajasPorParrilla:int, librasPorCaja:int }`.
- **Fila de programa (`programa[semanaLunesISO][]`):** `{ presId, cultivo, origen, dest, dias:int[7] }`
  (cada `dias[i]` = cajas programadas ese día; semana = lunes `YYYY-MM-DD`).
- **Operaciones:** CRUD de filas y de presentaciones; editar cajas por día; cambiar semana (solo UI).
- **Cálculo:** `totalCajas = Σ filas Σ dias`. Filtro por cultivo según `pres.cultivo`.
- **Validación:** `cajasPorParrilla ≥ 1` (imprescindible); `dias[i] ≥ 0`.
- **Bitácora:** no registra eventos propios.

### Cálculo de Trailers (id 2) — Kiko / Alfonso
- **Lee:** `programa`, `catalogo`, `cultivos`, `requerimientoGen`, `requerimientoMeta`.
- **Escribe:** `requerimientoGen`, `requerimientoMeta`, `bitacora`.
- **Requerimiento (`requerimientoGen[semana][]`):** `{ tipo:"Contrato"|"M. Abierto", fecha, diIdx:int,
  origen, dest, cultivo?, sol:int }`.
- **Meta (`requerimientoMeta[semana]`):** `{ enviadoTs, enviadoLocal, actor, lineas:int, trailers:int }`.
- **Cálculo (contratos):** `parrillas = ceil(cajas / cajasPorParrilla)`; `trailers = ceil(parrillas / 30)`;
  agrupa por `cultivo||dest||diIdx`. **Mercado Abierto** se captura manual (destinos USA Nogales,
  McAllen).
- **Operación clave — "Generar requerimiento":** ensambla Contratos + M. Abierto, guarda
  `requerimientoGen[semana]` + `requerimientoMeta[semana]`, y registra bitácora.
- **Bitácora:** `evento:"requerimiento_enviado"`, `modulo:"Cálculo de Trailers"`, `actor`,
  `destino:"Tablero de Tráfico (Mónica)"`, `ref:semana`, `detalle`, `meta:{semana,lineas,trailers}`.
- ⚠️ **Hueco conocido:** "Generar requerimiento" ignora el filtro de día; Mercado Abierto no se aísla
  por semana. El backend NO debe replicar el bug; ver decisión en el plan.

### Tablero de Tráfico (id 3) — Mónica
- **Lee:** `trailers`, `requerimientoGen`, `requerimientoMeta`, `lineas`.
- **Escribe:** `trailers`, `lineas` (catálogo).
- **Trailer (`trailers[]`):**
  `{ id, fecha, origen, dest, status:"esperando"|"en_instalaciones"|"en_ruta"|"entregado",
     linea, contacto, numero, chofer, telefono, licencia, marcaModelo, placaTracto,
     economicoCaja, placaCaja, flete:string, inspeccionPrecarga? }`.
- **inspeccionPrecarga (REG‑EMP‑15 / POE‑MP‑09):**
  `{ manifiesto, fecha, companiaTransporte, nombreChofer, placasTermo, noEconomico, destino,
     horaLlegada, tempLlegada, horaAbrioPuerta, tempAbrioPuerta,
     respuestas:{[preguntaId]:"si"|"no"|""}, tempProducto, tempTermoCargar, sanitizoCaja,
     sanitizante, concentracion, cargasAnteriores, conoceAlergenos,
     alergenos:{[alergeno]:"Sí"|"No"}, aprobadoPor, guardado }`.
  Las 11 preguntas = `PRECARGA_PREGUNTAS` (cada una con `malo:"si"|"no"`); alérgenos = `ALERGENOS_MX`.
- **Línea de transporte (`lineas[]`):** `{ id, linea, contacto, numero,
  choferes:[{id,nombre,telefono,licencia}], tractos:[{id,marcaModelo,placa}],
  cajas:[{id,economico,placa}] }`.
- **Transiciones:** Mónica solo lleva `esperando → en_instalaciones`. **`en_ruta` lo pone M4**;
  en M3 no hay reversa desde `en_ruta`.
- **Cálculo:** resumen por destino (Σ `sol` por `dest`, separa contrato/abierto); % cumplimiento
  `min(ceil(asignados/sol*100),100)`; `hallazgosInsp` = nº de respuestas == `malo`.
- **Validación:** `dest ∈ DESTINOS_ALL`; `status ∈ {esperando,en_instalaciones,en_ruta,entregado}`.

### Evidencias de Carga (id 4) — Francisco
- **Lee:** `trailers` (solo `en_instalaciones`), `cargasEmbarques`, `catalogo`.
- **Escribe:** `cargasEmbarques` (crea), `trailers` (→ `en_ruta`).
- **cargaEmbarque creada:**
  `{ id:"CARGA_…", fecha:hh:mm, trailer:{snapshot completo del trailer}, consolidado:bool,
     empresasSel:string[], distEmpresas:{[empresaId]: Slot[30]}, cargaFotos:int, frontalFotos:int,
     sapStatus:"pendiente" }`.
- **`distEmpresas[empresaId]`** ✅ (verificado en código): **arreglo posicional de 30 slots**,
  cada slot `{ prod:string("" si vacío), cajas:string }`. El índice del arreglo = parrilla
  (vía `idxToParr`). En consolidado, un slot ocupado por una empresa bloquea ese índice para otras.
- **Reglas:** simple = 1 empresa; consolidado = hasta 3. `cargaFotos ∈ [0,30]`, `frontalFotos ∈ [0,7]`.
- **Operación "Enviar a Embarques":** crea la `cargaEmbarque` (con `sapStatus:"pendiente"`) y pone el
  trailer en `en_ruta`.
- **Cálculo cajas por empresa:** Σ `cajasPorParrilla` de los `prod` asignados.
- ⚠️ **Fotos**: hoy simuladas (no se persisten imágenes reales). En backend → subir a storage.

### Embarques (id 5) — Daniel / Cristina
- **Lee/escribe:** `cargasEmbarques`, `trailers`.
- **Añade a la cargaEmbarque:** `manifiestos:{[empresaId]: folio}` y togglea `sapStatus`.
- **empresasDe(carga):** consolidado → `empresasSel`; simple → `empresasSel.slice(0,1)`.
- **Operaciones:**
  - `setManifiesto(id, empId, val)` → `manifiestos[empId]`.
  - `manifiestosCompletos(carga)` = todas las empresas de la carga tienen folio no vacío.
  - `toggleSap(id)` → alterna `sapStatus` "pendiente"↔"cargado".
  - **`devolver(carga)`** ⚠️ **destructivo**: pone el trailer en `en_instalaciones` **y elimina la
    carga** de `cargasEmbarques` (borra manifiestos/distribución/calidad asociados). El backend debe
    confirmar y, preferible, hacer soft‑delete + auditar (ver plan).
- **Bitácora:** hoy no registra (recomendado agregar `embarque_creado`, `sap_status_cambio`,
  `manifiesto_capturado`, `embarque_devuelto`).

### Consolidado y Fletes (id 6) — Cristina
- **Lee:** `cargasEmbarques`, `catalogo`. **Escribe:** `cargasEmbarques` (toggle SAP).
- **No captura manifiestos**; los lee. Construye un **aplanado** (vista "Base de datos"): una fila por
  `carga × empresa`:
  `{ key:"cargaId_eid", eid, sap, manifiesto, fecha, destino, origen, linea, chofer, placas,
     economico, tipo:"Simple"|"Consolidado", empresa(label), productos(texto), cajas, pct, fProp,
     fleteTotal }`.
- **Cálculo (reparto de flete):**
  - Simple: `cajas=""`, `pct="100%"`, `fProp = flete`.
  - Consolidado: `cajasTotal = Σ cajasDe(distEmpresas[e])`; `cajasEmp = cajasDe(distEmpresas[eid])`;
    `pct = round(cajasEmp/cajasTotal*100)`; `fProp = (cajasEmp/cajasTotal)*flete` (2 decimales).
  - `cajasDe(data) = Σ cajasPorParrilla(prod)`; `productosDe` etiqueta `"PRODUCTO (par1,par2)"` con `idxToParr`.
- **Export a Excel** (columnas: Manifiesto, Fecha, Origen, Destino, Linea, Chofer, Placas, Economico,
  Tipo, Empresa, Productos, Cajas, % Flete, Flete a cobrar, Flete total, SAP).
- **Filtros:** dest, origen, línea (contiene, lowercase), chofer (contiene, lowercase), empresa, fecha, sap.
- ⚠️ **Hueco conocido:** `$NaN`/Infinity cuando `cajasTotal === 0`. El backend debe devolver 0/“—” seguro.

### Monitoreo en Ruta (id 7) — Francisco / Kiko
- **Lee:** `trailers` (status `en_ruta`/`entregado`), `monitoreo`, `responsables`, `cargasEmbarques`.
- **Escribe:** `trailers` (status), `monitoreo`, `responsables`.
- **`monitoreo[trailerId]`** (5 eventos):
  - `preenfriado: { hubo:null|bool, responsable, horaEntrada, horaSalida, tempPrevia:string[30],
    tempFinal:string[30], fotos:(null|"photo")[8] }`.
  - `tive | retenes | aduanas | accidente: { hubo:null|bool, responsable, fotos:(null|"photo")[4] }`.
- **Operaciones:** `setHubo`, `setCampo`, `setTemp(tipo,idx,val)`, `registrarResponsable`,
  `confirmPhoto`, `marcarEntregado` (`en_ruta→entregado`), `reactivar` (`entregado→en_ruta`, **reversa
  no destructiva**).
- **Cálculo:** manifiestos/empresas del trailer vía la `cargaEmbarque` ligada (`c.trailer.id`);
  `conEvidencia` = nº eventos con `hubo===true`; `tempsLlenas` = nº temperaturas no vacías.
- ⚠️ **TIVE**: coordenadas del mapa fijas (`MapaTive.COORDS`); placeholder del API de TIVE (futuro tiempo real).

### Movimientos Campo → Empaques (id 8) — Oscar
- **Lee/escribe:** `movimientos`; catálogos `cargaCampo`, `ubicaciones`, `zonas`, `consignados`, `lineas`.
- **`movimiento`:**
  `{ id:"MOV_…", folio, fecha(ISO), viaje(zona), rancho, lote, horaInicio, horaTermino,
     responsableCosecha, consignado, distribuidor, origen, destino,
     cargaItems:[{prod, parrillas, bultos}], remision, pesoBascula,
     linea, contacto, numero, chofer, telefono, licencia, marcaModelo, placaTracto, economicoCaja,
     placaCaja, telOperador, inicioPreenfriado, terminoPreenfriado, flete,
     responsable:"Oscar", creado, actualizado?,
     recepcion?, muestreos?:[], inspeccion? }`  (recepcion/muestreos/inspeccion los llena M9).
- **Operaciones:** CRUD; al crear puede dar de alta líneas/choferes/tractos/cajas al vuelo;
  `cargaItems` mínimo 1. **Editar** avisa si `recepcion.estado ∈ {recibido,rechazado}` (la BD de M9 ya
  se afectó → aviso manual). Eliminar = físico con confirmación.
- **Catálogos anidados:** `ubicaciones.origenes[]={id,nombre,lotes:string[],responsables:string[]}`,
  `ubicaciones.destinos[]={id,nombre}`; `zonas`/`consignados` = arrays de string; `cargaCampo[]={id,label}`.

### Recepción en Empaque (id 9) — Empaque
- **Lee/escribe:** `movimientos` (anida recepción/muestreos/inspección), `inspectoresCalidad`.
- **`recepcion` (anidado en movimiento):**
  `{ fechaLlegada, horaLlegada, responsable, parrillasRecibidas, bultosRecibidos, pesoRecibido,
     condicion:"ok"|"con_novedad", observaciones, estado:"recibido"|"rechazado"|undefined,
     confirmado, comentario?(solo rechazo) }`.
- **`muestreos[]` (máx 3):**
  `{ id:"mu_…", inspector, folio(consecutivo global, arranca 201), lote, pesoMuestra(g), fecha,
     defectos:{[defId]: gramos(string)}, fotos:{[defId]: dataURL} }`.
  `defId ∈ DEFECTOS_QC` (cat: calidad/condicion/plaga).
- **`inspeccion` (REG‑EMP‑24 / POE‑ADM‑11):**
  `{ producto, fecha, hora, remision, tempProducto,
     veh:{[id]:"si"|"no"|""}(INSP_VEHICULO), prod:{[id]:...}(INSP_PRODUCTO),
     observaciones, accionesCorrectivas, elaboro, supervisor }`.
- **Operaciones:** dar recepción (declarado vs recibido), rechazar (estado `rechazado` + comentario),
  reabrir (borra `recepcion`), agregar/guardar muestreos (folio autogenerado consecutivo), guardar
  inspección, generar PDFs (`generarReporteCalidad`, `generarReporteInspeccion`).
- **Cálculos de calidad** (`helpers/calidad.js`): `calcQCI`, `pctDefecto`, `pctCategoria` (por gramos).

### Importaciones de Materiales (id 10) — Comercio Exterior
- **Lee/escribe:** `importaciones`, `materiales`.
- **`importacion`:**
  `{ id:"imp_…", folio, proveedor, paisOrigen, factura, moneda:"USD"|"MXN"|"EUR", tipoCambio,
     fechaImportacion(ISO), pedimento, aduana, agenteAduanal, patente, transportista, chofer, placas,
     estado:"borrador"|"documentada"|"en_proceso"|"retornada", observaciones,
     items:[{id:"it_…", materialId, codigo, descripcion, unidad, fraccion, cantidad, valorUnitario,
     diasSalida}], creado?, actualizado }`.
- **`material` (catálogo):** `{ id, codigo, descripcion, unidad, fraccion, diasSalida:int }`.
- **Cálculos:** `totalItem = cantidad*valorUnitario`; `fechaLimite = fechaImportacion + diasSalida`;
  `diasRestantes = fechaLimite - hoy`; `estadoVencimiento`: vencido (<0), por_vencer (≤15), vigente.
  El más urgente (menor diasRestantes) marca la importación.
- **Operaciones:** CRUD; items mínimo 1; cambiar material copia `codigo/descripcion/unidad/fraccion/
  diasSalida`. PDF del trámite.

### Documentos / Impresiones (id 11) — Hub de PDF (solo lectura)
- **Lee:** `movimientos`, `trailers`, `cargasEmbarques`, `monitoreo`.
- **Pestaña Campo (por remisión):** `generarExpedienteCampo(m)` + accesos a `generarReporteCalidad`,
  `generarReporteInspeccion`. Chips: Recepción / Calidad / Inspección según existan.
- **Pestaña Exportación (por flete):** `generarExpedienteExportacion(trailer, carga, monitoreo[id])` +
  `generarPrecargaPDF(inspeccionPrecarga)`. Chips: Precarga / Carga / Monitoreo.
- **Generadores** (`src/modulos/reportes/*`): consumen los objetos completos arriba descritos. PDFs vía
  `window.open` + HTML + `window.print()`.

### QC - Bodegas (id 12) — Control de Calidad (EE.UU.)
- **Lee/escribe:** `cargasEmbarques` (anida `calidad`), catálogos `defectosCalidad`,
  `inspectoresCalidad`, `lugaresCalidad`.
- **`carga.calidad`:**
  `{ estado:"pendiente"|"aprobado"|"rechazado", producto, inspector, lugar, fecha, folio,
     pesoMuestra(g), grower, lote, size, count, temperatura, conteos, truck, manifiesto,
     defectos:{[defId]:{presente:bool, peso(g), notas, fotos:dataURL[]}},
     observaciones, resueltoPor?, resueltoTs? }`.
- **`defectosCalidad[producto][]`:** `{ id:"PRODUCTO__TOKEN", label, cat:"calidad"|"condicion" }`
  (12 productos sembrados: ZUCCHINI, RED/GREEN BELL PEPPER, GREEN BEANS, CUCUMBER, CORN, etc.).
- **Cálculos (por gramos):** `pctDe(def) = peso/pesoMuestra*100`; `pctQuality = Σ cat calidad`;
  `pctCondition = Σ cat condicion(+plaga)`; `pctDefects = Q+C`; `pctGood = max(0, 100−pctDefects)`.
  KPIs: COUNT, %GOOD, %DEFECTS, %QUALITY, %CONDITION, TEMP, CONTEOS.
- **Operaciones:** abrir/guardar inspección, `resolver("aprobado"|"rechazado")` (estampa `resueltoTs`),
  subir/quitar fotos; QC Report (PDF estilo dashboard); botones Correo (mailto) / WhatsApp (wa.me).
- **El hallazgo de un defecto se determina por `peso > 0`** (no por checkbox — fix reciente).
- ⚠️ **Hueco conocido:** estado `rechazado` definido pero falta botón "Rechazar"; no hay reversa a
  "pendiente". Decidir en el plan si el backend lo soporta desde ya.

---

## 4. Reglas de negocio / invariantes (el backend DEBE hacerlas cumplir)

1. **SAP es mono‑empresa (NO multiempresas).** Cada empresa (SL Agrícola, CAT, CACO, SL Produce) se
   sube a SAP **por separado**. En consolidados hay que **dividir y subir la parte de cada empresa de
   forma independiente**. El "subir a SAP" vive en **M5** y **M6**.
   - ⚠️ **Hueco actual a corregir:** hoy `carga.sapStatus` es **un solo flag por carga**. Debe ser
     **por empresa**: `{ [empresaId]: "pendiente"|"cargado", docSAP? }`. Una carga está "completa en
     SAP" solo cuando **todas** sus empresas están cargadas. La vista "Base de datos" de M6 (una fila
     por empresa) ya encaja con esto. **(Decisión del cliente: se deja para después; el backend hoy
     preserva el flag único y se diseñó para extender sin romper la UI.)**
2. **Máquina de estados del trailer:** `esperando → en_instalaciones → en_ruta → entregado`.
   `en_instalaciones` solo lo pone M3; `en_ruta` solo M4 (al enviar); `entregado`/reactivar solo M7.
   No saltar estados.
3. **Crear `cargaEmbarque` ⇄ trailer `en_ruta`** es atómico (M4). **`devolver` (M5)** revierte trailer
   a `en_instalaciones` y elimina la carga: en backend debe ser transaccional + auditable (preferible
   soft‑delete).
4. **Folio de muestreo de campo:** consecutivo **global** = máx existente + 1, arranca en 201. El
   backend lo debe generar server‑side (evitar carreras).
5. **Importación:** `fechaLimite = fechaImportacion + diasSalida`; clasificación de vencimiento con
   `DIAS_ALERTA_SALIDA = 15`. El item más urgente domina la alerta de la importación.
6. **Snapshots inmutables:** los datos copiados a `cargaEmbarque.trailer`, `cargaItems`, `items` de
   importación no se re‑resuelven desde catálogo; se guardan tal cual al momento del evento.
7. **División atómica al subir a SAP:** "donde se suba a SAP, siempre dividir el trabajo por empresa".

---

## 5. Bitácora / auditoría (`bitacora`, append‑only)

Esquema ya definido en el store (`registrarEvento`), listo para backend:
```
{ id, ts(ISO/UTC), tsLocal, evento, modulo, actor, destino?, ref?, detalle?, meta? }
```
Hoy solo M2 emite `requerimiento_enviado`. **Recomendado** (no cambia lógica, agrega trazabilidad):
emitir eventos en transiciones clave — `trailer_status_cambio`, `carga_creada`, `embarque_devuelto`,
`sap_cargado` (por empresa), `recepcion_confirmada`, `flete_rechazado`, `qc_resuelto`,
`importacion_estado`. Confirmar alcance con el cliente antes de implementar.

---

## 6. Inventario de "qué es demo / qué es real" (para la migración)

| Cosa | Estado | Acción al migrar |
|---|---|---|
| `mockTrailers`, catálogos `*_INICIAL` | semilla demo | seed inicial del backend (idempotente) |
| Gráficas de tendencia de costo (Dashboard) | **hardcode demo** | reemplazar por histórico real (no migrar) |
| Fotos (carga/frontales/monitoreo) | simuladas (`"photo"`/base64) | subir a storage real; guardar URL |
| Coordenadas del mapa (TIVE) | fijas | integrar API TIVE (tiempo real) |
| `sapStatus` único por carga | hueco | modelar **por empresa** en backend (después, por decisión del cliente) |
| Envío real Correo/WhatsApp (QC) | abre cliente con texto | destinatario fijo / envío server‑side (futuro) |

---

## 7. Ambigüedades a confirmar con el cliente / verificar en código (⚠️)

1. ¿`SL Produce` es una empresa SAP más (4ª) o solo etiqueta de Consignado/Distribuidor en Campo?
2. Forma exacta del PDF de calidad (M9) y QC Report (M12): confirmar campos contra `reportes/*`.
3. ¿`devolver` (M5) debe ser borrado físico o soft‑delete? (recomendación: soft‑delete + auditoría).
4. ¿Se corrige en backend el hueco de M2 ("Generar requerimiento" ignora día / Mercado Abierto entre
   semanas) o se preserva el comportamiento actual? (recomendación: corregir + aislar por semana).
5. ¿QC (M12) habilita ya el flujo de `rechazado` + reversa a `pendiente`?
6. Roles/permisos exactos por módulo (quién puede qué) para el modelo de autorización del backend.
