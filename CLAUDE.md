# Plataforma SL — Contexto del Frontend

> Documento vivo. Lo actualizamos conforme crece la app. Es la fuente de verdad del
> contexto para entender qué hace cada parte del front.

## Qué es

Plataforma interna de **SL Logística** (SL Produce · SL Agrícola) para coordinar el
flujo logístico de exportación de productos agrícolas (Bell Pepper, ejote, etc.):
desde la planeación semanal y la salida de campo, hasta el embarque, la calidad, el
monitoreo en ruta y la documentación. Cada módulo corresponde a un rol/persona del
proceso.

Hoy es un **frontend con datos de demo** que persisten en el navegador
(`localStorage`). Más adelante se conectará un backend real (y APIs externas como
**TIVE** para rastreo).

## Stack técnico

- **React 19** + **Vite** (build con `vite build`, dev con `vite`/Vite).
- **Tailwind CSS v4** (`@tailwindcss/vite`).
- **recharts** (gráficas del Dashboard), **xlsx** (export Excel en Consolidado),
  **leaflet** (mapa real en Monitoreo).
- ESLint (incluye reglas de react-hooks). Mantener `npx eslint src` y `npx vite build`
  limpios antes de commitear.

## Arquitectura

### Estado global y persistencia
- Todo el estado vive en `src/store/datos.jsx` (`DatosProvider` + `useDatos()`).
- **La base de datos (backend) es la fuente de verdad.** Carga inicial desde el backend
  (`api.js`); el front sincroniza cada cambio a la BD (debounced 800 ms) vía el contrato
  `/api/{coleccion}` + `/api/state/{clave}` (la capa **compat** del backend
  `plataforma-sl-backend` de Ronaldo sirve ese contrato; los datos viven en su tabla
  `documents`/`kv` de `plataforma_sl.db`).
- **`localStorage` (`plataforma_sl_estado_v1`) NO se usa cuando hay backend**: al estar
  conectado se borra ese espejo para que el navegador no compita ni guarde data vieja
  (ese split-brain ya causó sobrescrituras). Solo en **modo local (sin backend)** se usa
  `localStorage` como buffer temporal, que se sube a la BD al reconectar.
- `fuente` (`"backend"`/`"local"`) y `cargando` se exponen en el store; el indicador en
  `App.jsx` muestra verde (BD) / ámbar (modo local).

### Piezas clave del store (estado)
`trailers`, `cargasEmbarques`, `monitoreo`, `catalogo` (presentaciones), `cultivos`,
`programa`, `requerimientoGen`, `requerimientoMeta`, `responsables`, `lineas`
(catálogo de transporte con subcatálogos choferes/tractos/cajas), `movimientos`,
`cargaCampo`, `ubicaciones` (`origenes` = ranchos con subcatálogo `lotes` y
`responsables`; `destinos` = empaques), `bitacora`, `materiales`, `importaciones`,
`defectosCalidad` (defectos por producto), `inspectoresCalidad`, `lugaresCalidad`,
`zonas` (campo Viaje), `consignados` (catálogo compartido Consignado/Distribuidor).

### IDs únicos (importante)
Usar **`nuevoId(prefix)`** del store para todo ID nuevo (usa `crypto.randomUUID`).
NO usar contadores módulo-globales: se reinician al recargar mientras los datos
persisten, generando IDs duplicados que hacen que borrar/editar afecte el registro
equivocado. (Bug ya corregido en M1, M3, M4, M8.)

### Componentes compartidos (`src/components/`)
- **`SearchSelect.jsx`**: dropdown con búsqueda que reemplaza a `<select>` en toda la
  app. El panel se dibuja en un **portal** (sobre `document.body`, posición fija) para
  que NO lo recorte ningún contenedor con overflow (tablas/modales). El buscador
  aparece solo si hay > `searchThreshold` opciones. `onChange(v)` entrega el valor.
  - Ojo: si se le pasa una clase de ancho en `className`, puede chocar con el `w-full`
    base; envolver en un contenedor con ancho o usar clases explícitas sin `w-full`.
- **`ColaTabs.jsx`**: barra de pestañas reutilizable "Pendientes / Historial" con
  contador. Patrón usado en M9, M12, M5, M10, M3, M4 (y referencia M7).
- **`MapaTive.jsx`**: mapa real de México (Leaflet + OpenStreetMap) con pines por
  destino. Coordenadas por ciudad en `COORDS`. Placeholder listo para el API de TIVE.

### Generadores de PDF (`src/modulos/reportes/`) y helpers
- `reporteCalidad.js`: `generarReporteCalidad` (muestreos QCI) y
  `generarReporteInspeccion` (REG-EMP-24).
- `reportePrecarga.js`: `generarPrecargaPDF` (REG-EMP-15 + manifiesto de alérgenos).
- `expedienteCampo.js` / `expedienteExportacion.js`: expedientes consolidados (M11).
- `helpers/calidad.js`: `pctDefecto`, `pctCategoria`, `calcQCI` (matemática del QCI por
  gramos). Los PDFs se generan con `window.open` + `window.print()`.

## Flujos del negocio

1. **Planeación**: `Programa Semanal (M1)` → `Cálculo de Trailers (M2)` genera el
   *requerimiento* → lo recibe `Tablero de Tráfico (M3)`.
2. **Exportación (el viaje del trailer)**: `M3` asigna trailer y lo marca "en
   instalaciones" → `Evidencias (M4)` sube fotos + distribución y "envía a Embarques"
   (trailer pasa a "en ruta", se crea `cargaEmbarque`) → `Embarques (M5)` captura
   manifiestos y marca SAP → `QC - Bodegas (M12)` inspecciona calidad → `Consolidado
   (M6)` divide el flete por empresa → `Monitoreo (M7)` sigue la ruta. `Documentos
   (M11)` imprime el expediente de exportación.
3. **Campo (la remisión)**: `Movimientos Campo→Empaques (M8)` registra el flete con su
   *remisión* → `Recepción en Empaque (M9)` confirma llegada + calidad/inspección/
   rechazo. `Documentos (M11)` imprime el expediente de campo por remisión.
4. **Importaciones (M10)**: flujo aparte de comercio exterior (importación temporal).

## Módulos (detalle)

> El `id` es el del menú en `App.jsx` (no es orden de pantalla). La descripción corta
> visible en el front está en el arreglo `MODULOS` de `App.jsx` (campo `desc`).

### Dashboard (id 0) — Dirección / Gerencia
Visión general: KPIs de la semana, avance por destino (solicitados vs conseguidos),
análisis de costos y alertas. Las gráficas de tendencia de costo son **datos demo**
hardcodeados. Navegación por semana afecta solo los KPIs de requerimiento.

### Programa Semanal (id 1) — José Carlos
Planeación de **presentaciones por cultivo** y cajas por día (7 días). Catálogo de
presentaciones editable (`catalogo`: `cajasPorParrilla` es la clave del cálculo). El
programa se guarda por semana (`programa[lunesISO]`).

### Cálculo de Trailers (id 2) — Kiko / Alfonso
Calcula trailers necesarios (contratos + mercado abierto) y con **"Generar
requerimiento"** lo guarda en `requerimientoGen[semana]` + estampa meta. Eso es lo que
ve Mónica en el Tablero. (Pendiente: el botón ignora el filtro de día; Mercado Abierto
no se aísla por semana — ver TODO.)

### Tablero de Tráfico (id 3) — Mónica
**El rol de Mónica es solo conseguir los trailers y confirmar que llegaron** (los marca
"en instalaciones"). De ahí en adelante (carga, evidencias, embarque…) es chamba de otra
área. Recibe el requerimiento generado en M2 y registra/asigna los trailers. Catálogos:
líneas de transporte con subcatálogos (choferes, tractos, cajas). `status`:
`esperando → en_instalaciones` (lo de Mónica) `→ en_ruta` (lo pone M4 al despachar; en
M3 no hay reversa de en_ruta). Incluye **inspección precarga REG-EMP-15** + manifiesto de
alérgenos por trailer con PDF (la llena quien revisa el transporte antes de cargar).
Pestañas del pool: Activos / En ruta.

### Evidencias de Carga (id 4) — Francisco
Para trailers "en instalaciones": sube **fotos de carga** (30 parrillas, zigzag) y
**frontales**, y la **distribución por empresa** (simple o consolidado). "Enviar a
Embarques" crea el registro en `cargasEmbarques` y pasa el trailer a "en ruta".
Pestañas: Preparar / Enviados. (Las fotos hoy son simuladas, no se persisten imágenes
reales.)

### Embarques (id 5) — Daniel / Cristina
**Es donde se REGISTRA el embarque** (paso operativo). Captura **manifiestos por
empresa** (folio) y marca **SAP** (pendiente/cargado). "Devolver" borra la carga y
regresa el trailer a instalaciones (¡cuidado: borra datos asociados!). Pestañas:
Pendientes SAP / Historial. Acciones por `id` (no por índice).

**Diferencia con M6 (Consolidado):** M5 = *registrar* (manifiestos + SAP). M6 =
*repartir el flete por empresa / reportar / cobrar*. Ambos tocan `cargasEmbarques` y el
SAP, por eso aplica aquí la regla de **SAP por empresa** (ver Restricciones).

### Consolidado y Fletes (id 6) — Cristina
**Es donde se REPARTE el flete por empresa / se reporta / se cobra** (paso de
análisis). Calcula cuánto del flete le toca a cada empresa (proporcional a las cajas).
Vista **Tarjetas** (expandible) y vista **Base de datos** (aplanado: una fila por
carga×empresa; en consolidado se repite el viaje y solo cambian empresa/productos/flete
a cobrar — resaltadas en amarillo). **Export a Excel**. Filtros por
fecha/destino/origen/empresa/SAP/línea/chofer.

**Diferencia con M5 (Embarques):** M6 *no captura manifiestos*; los lee y los usa para
el reporte. M5 es el registro; M6 es el reparto/cobro.

### Monitoreo en Ruta (id 7) — Francisco / Kiko
**Mapa real de México** (Leaflet) con pines por destino de los trailers en ruta
(placeholder para el **API de TIVE**). Eventos en tránsito: preenfriado, TIVE, retenes,
aduanas, accidentes (sí/no + responsable + fotos + temperaturas). El `monitoreo` se
guarda por `trailer.id`, separado de `trailers`. Pestañas: En ruta / Historial
(entregado), con reversa no destructiva.

### Movimientos Campo → Empaques (id 8) — Oscar
Registra cada **flete que sale del campo** hacia el empaque: folio, **remisión**, viaje
(zona), rancho + lote + responsable de cosecha, consignado/distribuidor, origen/destino,
**descripción de la carga** (`cargaItems`: producto/parrillas/bultos) y transporte
(reusa el catálogo de `lineas`). Catálogos: **zonas**, **ranchos** (con subcatálogo de
lotes y responsables), **consignados** (compartido consignado/distribuidor), carga,
ubicaciones. Filtros (texto + destino + rancho) y **botón Editar** (avisa si el flete ya
se recibió/rechazó en M9: la BD ya se afectó, hay que avisar manual). Alimenta a M9.

### Empaque (id 9) — Empaque
Antes "Recepción en Empaque". Pestañas: **Por recibir** / **Vaciado a Empaque** /
**Historial por Recibir** / **Historial Vaciado a Empaque** / **Historial Mermado (No
entró a Empaque)**. El **Vaciado a Empaque se maneja TODO en kg** (la unidad que manda):
el **kg recibido** se prellena con el peso de la recepción (editable). Por manifiesto se
puede **Vaciar** (entra a empaque, con hora) o **Mermar** (NO entra a empaque, se
descarta, con motivo); ambos descuentan del piso. Piso (inventario) = recibido − vaciado
− merma. Al quedar **0 kg en piso** sale a su historial (Vaciado o Mermado según a dónde
se fue el producto). El ✕ en cada vaciado/merma lo regresa al piso. Cada manifiesto y los
reportes se agrupan por **lote** (`lote || rancho || consignado`). Abajo: resumen del día
(recibidos / vaciados / mermados / en piso, en kg), **Inventario por lote** (recibido /
vaciado / mermado / % merma / en piso) y **Vaciado por hora y lote** (kg + bins teóricos
= kg/240, solo en esa visual). Guardado en `m.vaciado` =
`{ kgRecibidos, eventos:[{kg,hora}], mermas:[{kg,hora,motivo}] }`.
Confirma la **llegada de los fletes** de M8. Por flete: **muestreo de calidad** (QCI por
gramos, folio autogenerado, arrastra datos del movimiento), **inspección REG-EMP-24**
(vehículo/producto), **dar recepción** (declarado vs recibido), y **Rechazo** (con
comentario de qué se hará → va al Historial como "Rechazo"). Columnas: Producto (de la
carga), Estado, Tipo (Recepción/Rechazo). Pestañas: Por recibir / Historial. Filtros
(texto + tipo). Inspector usa el catálogo compartido `inspectoresCalidad`.

### Importaciones de Materiales (id 10) — Comercio Exterior
Documenta **importación temporal (IMMEX)**: cada material tiene un *periodo de salida*
(días) y se calcula la **fecha límite** para retornar/exportar sin impuesto/multa
(alerta vigente/por vencer/vencido). Catálogo de materiales editable. PDF. Pestañas:
En trámite / Retornadas.

### Documentos / Impresiones (id 11) — Expedientes en PDF
**Hub de impresión**: dos pestañas.
- **Campo** (por Remisión): expediente consolidado del movimiento + recepción + calidad
  + inspección REG-EMP-24, con accesos a los PDFs individuales.
- **Exportación** (por flete): expediente del trailer + carga + precarga REG-EMP-15 +
  monitoreo.

### QC - Bodegas (id 12) — Control de Calidad
**Control de calidad en las bodegas de EE.UU.**, cuando el embarque ya llegó a destino
(por eso en el menú va **después de Monitoreo en Ruta**). Inspección de calidad de los
**embarques** (de `cargasEmbarques`). Por producto, se
capturan defectos con **peso (g)** → el **% se calcula** (peso/peso muestra), agrupados
en QUALITY (calidad) y CONDITION (condición + plaga). **Resumen de calificación (KPIs)**
arriba: COUNT, % GOOD, % DEFECTS, % QUALITY, % CONDITION, TEMP. Botón **📊 QC Report**
genera un PDF estilo dashboard (Power BI): filtros, GROWER/PRODUCT, tabla, KPIs,
desglose de defectos y barra apilada. Botones **Mandar Correo** (mailto) y **Mandar
WhatsApp** (wa.me) con el resumen prellenado. Catálogos: defectos por producto,
inspectores, lugares.

## Restricciones del negocio (importantes)

- **SAP es mono-empresa (NO multiempresas).** Cada empresa (SL Agrícola, CAT, CACO, SL
  Produce) se sube a SAP por separado. En viajes **consolidados** NO se sube una sola
  vez: hay que **dividir y subir la parte de cada empresa de forma independiente**.
  - **Puntos de integración con SAP (definidos por el negocio):**
    - **Recepción en Empaque (M9):** al dar recepción → genera una **orden de producción**
      (materia prima) y una **orden de compra** (flete, documentado).
    - **Consolidado y Fletes (M6):** impacta SAP con el **manifiesto** y los **fletes**
      (por empresa).
  - **Cómo ubicarlos:** en el código busca el marcador `[SAP]` (comentarios
    `// ⚠️ [SAP] …`); en la app, el componente `AvisoSAP` pone un letrero amarillo en
    esos módulos. (Integración real **pendiente de implementar**.)
  - **Hueco actual / a corregir**: `carga.sapStatus` es **un solo flag por carga**, pero
    debería ser **por empresa** (como ya están `carga.manifiestos[eid]` y el reparto de
    flete). Plan: `sapStatus` por empresa (`{ [eid]: "pendiente"|"cargado", docSAP? }`);
    la carga está "completa en SAP" solo cuando todas sus empresas están cargadas. La
    vista "Base de datos" de M6 (una fila por empresa) ya encaja con esto.
  - Regla general: **donde se suba a SAP, siempre dividir el trabajo por empresa.**

## Convenciones / cómo extender

- **Catálogos editables in-app**, sembrados con `*_INICIAL` en el store y persistidos.
- **IDs**: siempre `nuevoId(prefix)`.
- **Dropdowns**: usar `SearchSelect` (no `<select>` nativo).
- **Colas de trabajo**: usar `ColaTabs` (Pendientes/Historial) cuando el flujo tenga
  ítems que se "atienden".
- **PDFs**: `window.open("", "_blank")` + HTML + `window.print()`.
- **Front**: cada módulo tiene una descripción corta en `App.jsx` (`MODULOS[].desc`),
  que se muestra como banner arriba del contenido.
- **Documentación de procesos/automatizaciones** (incl. las de SAP): en `docs/` con el
  formato estándar del equipo. Ver `docs/README.md` y la plantilla
  `docs/_PLANTILLA-proceso.md`. Cada proceso nuevo = un archivo en `docs/procesos/`.

## TODO / pendientes conocidos

- **Backend real** + migración del esquema de `localStorage`.
- **API de TIVE**: reemplazar coordenadas fijas de `MapaTive` por ubicación en tiempo
  real; mover los pines automáticamente.
- **Envío real** de Correo/WhatsApp en QC-Bodegas (hoy abren el cliente con texto
  prellenado; falta destinatario fijo / envío automático).
- **M2**: el "Generar requerimiento" ignora el filtro de día; Mercado Abierto se cruza
  entre semanas.
- **M6**: `$NaN`/Infinity en reparto de flete cuando `cajasTotal === 0`.
- **M12**: estado `rechazado` definido pero sin botón de "Rechazar"; no hay reversa a
  "pendiente".
- **Fotos reales**: hoy son simuladas/base64; al conectar backend, subir a storage.
