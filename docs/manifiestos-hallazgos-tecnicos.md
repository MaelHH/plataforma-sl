# Manifiestos / Embarques — Hallazgos técnicos (para construir)

> Documento **vivo** con TODO lo investigado (solo lectura, sin tocar SAP) para el módulo de manifiestos/embarques. Objetivo: no olvidar nada al construir. Autorizado por el jefe de SAP a **recrear la asignación de pallets desde la app SIN romper reglas**, probando en la empresa **`TEST_SLA`**.

## 🔒 Reglas que NO se rompen (recordatorio)
- **Escritura a SAP:** solo `GET`/`POST`/`PATCH` vía Service Layer (`client.py`). **NUNCA** PUT/DELETE. No crear objetos globales (UDF/series/tasas).
- **HANA/ODBC:** **solo `SELECT`** (lectura). Nunca insert/update/delete por ODBC.
- **Pruebas:** solo en `TEST_SLA` (réplica). Reversible con el "cancelar" del addon.
- Sin `.env` en local. Cambios aditivos. Nada a producción sin autorización.

## 🌐 Service Layer
- **URL:** `https://192.169.46.251:50000/b1s/v1`
- **Login:** `POST /Login` con `{ "CompanyDB": "TEST_SLA", "UserName": "...", "Password": "..." }`
- **UDT expuestas** (nombre de entidad con prefijo **`U_`**): `U_P_PALLETS`, `U_P_PALLETSDETAIL`, `U_P_PALLET_ASGMNT`, `U_P_PALLET_ASGMNT_DET`, `U_P_PALLETS_BITACORA`, **`U_P_SHIPMENT`**, **`U_P_SHIPMENTDETAIL`**, **`U_P_SHIPMENT_MANIFEST`**.
- **Documentos estándar:** `Orders` (Orden de Venta), `DeliveryNotes` (Entrega).
- **Tipos de dato:** `Code` = número; campos de enlace (`U_BaseType/Entry/Num`) = string; fechas `YYYY-MM-DD`; hora string `"0922"`.
- **Nota:** las UDT tienen TAMBIÉN nombre HANA con `@` (ej. `@P_PALLET_ASGMNT`) — ese se usa para leer por HANA `SELECT`; el `U_...` es para Service Layer.

## 📦 Modelo de datos (UDT del addon)
| Tabla (HANA `@`) | Entidad SL (`U_`) | Qué es | Columnas clave |
|---|---|---|---|
| `@P_PALLETS` | `U_P_PALLETS` | Cabecera de pallet | `Code`, `U_Active` (Y/N), `U_IsSalesOrder` (Y/N), `U_IsDelivery` (Y/N), `U_Folio`, `U_PalletTag`, `U_Mixed`, `U_PalletFinished` |
| `@P_PALLETSDETAIL` | `U_P_PALLETSDETAIL` | Pallet físico (cajas) | `Code`, `U_PalletId`(→`@P_PALLETS.Code`), `U_Active`, `U_BoxQty` (cajas), `U_ItemCode` (PT), `U_ItemName`, `U_Batch` (lote), `U_Farming` (cultivo), `U_IdFarmer`, `U_TypePallet` |
| `@P_PALLET_ASGMNT` | `U_P_PALLET_ASGMNT` | Cabecera asignación (1 por OV) | `Code`, `U_Active`, `U_BaseType`(=`17` OV), `U_BaseEntry`(DocEntry OV), `U_BaseNum`(DocNum OV), `U_UserName`, `U_DateCreated`, `U_DateCreatedTime` |
| `@P_PALLET_ASGMNT_DET` | `U_P_PALLET_ASGMNT_DET` | Detalle asignación (1 por pallet) | `Code`, `U_PalletAsgmntId`(→cabecera), `U_PalletId`(→`@P_PALLETS`), `U_PalletsDetailId`(→`@P_PALLETSDETAIL`), `U_BaseLine`(línea OV 0,1,2…), `U_Active` |
| `@P_PALLETS_BITACORA` | `U_P_PALLETS_BITACORA` | Bitácora/log (producción/desmonte) | (no interviene en asignar) |
| `@P_SHIPMENT` | `U_P_SHIPMENT` | Embarque (camión/transporte) | ver §Embarque abajo |
| `@P_SHIPMENTDETAIL` | `U_P_SHIPMENTDETAIL` | Detalle de embarque | ver §Embarque abajo |
| `@P_SHIPMENT_MANIFEST` | `U_P_SHIPMENT_MANIFEST` | Manifiesto | ver §Embarque abajo |

## 🧾 RECETA CONFIRMADA — asignar pallets a una OV
Verificado con antes/después real (2026-08-24, TEST_SLA). Son **2 escrituras**. **NO** cambia `U_Active` del pallet (sigue en `Y`; el flip a `N` es al **embarcar**, no al asignar).

**1) `POST U_P_PALLET_ASGMNT`** (1 cabecera):
```json
{ "Code": <máx+1>, "U_Active": "Y", "U_BaseType": "17",
  "U_BaseEntry": "<DocEntry OV>", "U_BaseNum": "<DocNum OV>",
  "U_UserName": "<usuario>", "U_DateCreated": "YYYY-MM-DD", "U_DateCreatedTime": "HHMM" }
```
**2) `POST U_P_PALLET_ASGMNT_DET`** (1 por cada pallet-detalle):
```json
{ "Code": <máx+1>, "U_PalletAsgmntId": "<Code cabecera>",
  "U_PalletId": "<Code @P_PALLETS>", "U_PalletsDetailId": "<Code @P_PALLETSDETAIL>",
  "U_BaseLine": "<índice de línea de la OV: 0,1,2...>", "U_Active": "Y" }
```
**Ejemplo real capturado:** cabecera `Code 1609` (`U_BaseEntry=2468`, `U_BaseNum=2538`, `U_UserName=Sistemas`); detalles `25606-25609` (`U_PalletAsgmntId=1609`, `U_BaseLine` 0/1/1/2). Un mismo `@P_PALLETS` puede tener varios `@P_PALLETSDETAIL` que van a líneas distintas.

## 🔄 Flujo real del addon (importante para replicar)
1. Se abre una OV, se pone el **cliente**.
2. Botón **"Asignar Pallets"** → se eligen pallets disponibles (panel izq → der).
3. Sale **"Lista de normas de reparto"** (dimensiones SAP `OOCR`: Cultivos/Lotes/Departamentos) → se seleccionan.
4. El addon **CREA las líneas de la OV** (agrupa por PT, cantidad = suma de cajas, con las dimensiones) **y** prepara la asignación.
5. **Todo se graba SOLO al guardar la OV** (botón **"Agregar"**/"Actualizar"). Si no se guarda la OV, no se escribe nada.

➡️ **Para replicar desde la app:** crear la **OV con sus líneas + dimensiones** (Service Layer `Orders`, con `CostingCode`/`CostingCode2`/`CostingCode3`) **y** escribir la asignación (`U_P_PALLET_ASGMNT` + `_DET`) con el `U_BaseLine` que corresponda a cada línea — **coordinado**, en un solo flujo con manejo de error (compensación) y cálculo de `Code` (máx+1).

**DECISIÓN de diseño (2026-08-24):** el input del usuario es el **PALLET por su `U_Folio`** (`@P_PALLETS.U_Folio`), NO el artículo. La app **deriva** de cada pallet: `U_ItemCode` (PT), `U_BoxQty` (cajas), `U_Batch` (lote), y su `@P_PALLETSDETAIL.Code` (= `U_PalletsDetailId`). Con los pallets elegidos, la app **agrupa por PT → arma las líneas de la OV → asigna**. Ojo: un `U_Folio` puede tener **varios** renglones en `@P_PALLETSDETAIL` (varias cajas) → asignar todos los del folio. Es como trabaja el addon (eliges pallets, él saca el PT).

## 📖 Cómo LEER pallets (procedimiento del proveedor)
`SP_ADDON_PROD_GETPALLETS(DateFrom, DateTo)` — SOLO lee. Devuelve pallets **asignados a OV abiertas, pendientes de embarcar**. Cadena:
```
@P_PALLETS P → @P_PALLETSDETAIL PD (PD.U_PalletId=P.Code, ambos U_Active='Y')
  → @P_PALLET_ASGMNT_DET PASG (PASG.U_PalletsDetailId=PD.Code, U_Active='Y')
  → @P_PALLET_ASGMNT PA (PA.Code=PASG.U_PalletAsgmntId, U_Active='Y')
  → ORDR (ORDR.DocEntry=PA.U_BaseEntry, ObjType=PA.U_BaseType, DocStatus='O', CANCELED='N')
  LEFT JOIN RDR1 (RDR1.ItemCode=PD.U_ItemCode AND RDR1.CogsOcrCo2=PD.U_Batch)
WHERE P.U_IsDelivery='N'
```
No existe procedimiento de "asignar" (esa lógica vive en el `.exe` del addon).

## 🚚 §Embarque — modelo de EMBARQUE / MANIFIESTO (confirmado por CUFD)
El flujo completo ya está modelado y expuesto en Service Layer:
```
Pallets → Asignación a OV → EMBARQUE (@P_SHIPMENT) → detalle (@P_SHIPMENTDETAIL) → MANIFIESTO (@P_SHIPMENT_MANIFEST) → Entrega (Delivery)
```

**`@P_SHIPMENT` (embarque = camión/transporte):** `Active`, `Folio`, `DateCreated/Time`, `Conductor`, `TelefonoConductor`, `TransportCode`, `TransportName`, `TransportType`, `MarcaCam`, `ModCam`, `NoCam`, `NumCaja`, `PlacaCamion`, `PlacaCaja`, `SCAC`, `CAAT`, `AgenteAduanal`, `Freight` (flete), `Anticipo`, `DescriptionE`, `DescriptionT`, `DocDelivery` (creó entrega).

**`@P_SHIPMENTDETAIL` (qué va en el embarque):** `Active`, `BaseLine`, `Position`, `CardCode` (cliente), `ItemCode`, `Quantity`, `PalletId`, `BatchBox`, `SalesOrder_DocEntry` (OV), `DeliveryId` (entrega), `OrderP_DocEntry` (orden producción), `ReceiptP_DocEntry` (recibo producción), `Removed` (borrado suave).

**`@P_SHIPMENT_MANIFEST` (el manifiesto):** `Active`, `ManifestNumber` (Nº manifiesto), `LineNum`, `CardCode`/`CardName` (cliente), `Farmer` (agricultor), `Destination`/`DestinationId`/`DestinationNum`, `City`/`State`/`Country`, `Dist`/`DistId`/`DistNumber` (distribuidor/embarcador), `SalesOrdersDocEntry`/`SalesOrdersDocNum` (OV que agrupa), `DeliveryId`, `ShipmentDate`/`ShipmentTime`, `DeliveryDate`/`DeliveryTime`, `Freight`, `Suc` (sucursal), `Comments`, **sellos:** `StampOri`, `StampAdd1`, `StampAdd2`, `StampAdd3`, `StampReplace`, `StampSide`.

**Procedimientos del proveedor (SOLO lectura):** `SP_ADDON_PROD_GETPALLETS`, `SP_ADDON_PROD_GETPALLETSBYID` (pallets); `TMSP_TAXABLEDELIVERYREPORT` (reporte de entregas — útil para el tablero). No hay proc de "asignar" ni de "embarcar" → esa lógica vive en el `.exe` del addon.

## 🔁 Ciclo de vida del pallet (banderas en `@P_PALLETS`)
- Creado: `U_Active='Y'`, `U_IsSalesOrder='N'`, `U_IsDelivery='N'`.
- Asignado a OV: se crean filas de asignación (Active sigue `Y`); `U_IsSalesOrder` pasa a `Y` *(confirmar)*.
- Embarcado/entregado: `U_IsDelivery='Y'` (y aquí el pallet deja de estar "disponible").

## ⚠️ Gate 2/3 — hallazgo (2026-08-24): la OV DEBE llevar las dimensiones
En la POC, el `POST /Orders` creó la línea **sin** las normas de reparto (Cultivos/Lotes/Departamentos = "Precio de coste"). Resultado: la OV quedó incompleta **y el addon marcó "Pallets asignados: 0"** (su contador depende de que la línea tenga las dimensiones — coincide con el `LEFT JOIN RDR1.CogsOcrCo2 = PD.U_Batch` del proc `GETPALLETS`).
- ✅ El **write de la asignación funciona** (POST cabecera + detalle OK).
- ❌ Falta que la **línea de la OV lleve las dimensiones**. Campos confirmados (de una OV del addon, `ver_ov_dimensiones.py`): en cada `DocumentLine` → `CostingCode`, `CostingCode2`, `CostingCode3` (venta) + `COGSCostingCode`, `COGSCostingCode2`, `COGSCostingCode3` (costo) + `DistributeExpense: "tYES"`. NO se crean distribution rules (existen en SAP, tabla `OOCR`); solo se **referencian** (permitido).

### Mecanismo COMPLETO (todo AUTOMÁTICO — CONFIRMADO por POC 2026-08-24)
Dándole solo los **pallets (por folio)**, cada línea de la OV se arma así:
| Campo de la línea OV | Fuente | Cómo se deriva |
|---|---|---|
| **Cultivo** (`CostingCode` + `COGSCostingCode`) | ARTÍCULO **si es válido**, si no la **OF** | `Items(PT).U_PrcCode` si existe como norma de reparto (`OOCR`/`ProfitCenters` dim1); si NO (dato mal capturado, ej. chiles con `CPMV` en vez de `CPMVMS`), se usa el `OcrCode` de la OF. Casos: ejote org → item `EjoteOrg` (válido); chile → OF `CPMVMS` (porque item `CPMV` es inválido). |
| **Lote** (`CostingCode2` + `COGSCostingCode2`) | el **pallet** | `@P_PALLETSDETAIL.U_Batch` (ej. Sufragio/ElVenado) |
| **Departamento** (`CostingCode3` + `COGSCostingCode3`) | la **Orden de Fabricación** | enlace `@P_PALLETS_BITACORA.U_ProductionOrderNum` → `OWOR`/`ProductionOrders` `OcrCode3`/`DistributionRule3` (ej. Empaque) |
| `DistributeExpense` | constante | `"tYES"` |
| `U_CE_FraccionArancelaria` (UDF línea) | el **ARTÍCULO** | `Items(PT).U_CE_FraccionArancelaria` (ej. `0708200100`) |
| `U_CE_UnidadAduana` (UDF línea) | el **ARTÍCULO** | `Items(PT).U_CE_UnidadAduana` (ej. `01`) |
| `U_CE_CantidadAduana` (UDF línea) | **calculada** | `cajas × Items(PT).U_PesoKG` (kg; ej. 13.61) |
| `U_DiotTipoOp` (UDF línea) | constante | `"O"` |

**Nota:** `U_PrcCode` es literalmente la columna "Precio de coste Cultivos" del artículo. El cultivo es propiedad del PRODUCTO, no de la OF (eso resolvió el desajuste EjoteOrg-vs-Ejote). El contador "Pallets asignados" del addon a veces muestra 0/6 en OVs hechas por Service Layer (formatted-search quirk); la asignación real (cabecera+detalle) SÍ se escribe correcta.

### Campos de CABECERA de la OV (comparación script vs addon, 2026-08-24)
El comparador `comparar_ov.py` mostró que, además de la línea, la OV del addon lleva estos campos de **cabecera** (fuente CONFIRMADA):
| Campo cabecera OV | Sale de |
|---|---|
| `U_CE_Incoterm` | Cliente (`BusinessPartners.U_Incoterm`, ej. `CPT`) |
| `U_CE_ClaveDePedimento` | Cliente (`U_ClavePedimento`, ej. `A1`) |
| `U_NumRegIdTrib_Prop` | Cliente (`UnifiedFederalTaxID`, ej. `650033002`) |
| `DocumentsOwner` (Propietario) | el **empleado del usuario** que crea (addon=103 COTA JORGE) |
| `VatGroup` (línea) | impuesto de exportación del artículo (`IVAT0`) |
Diferencias que NO importan (naturales): totales (según cantidad), fechas/hora, usuario, `Reference1` (el addon copia su propio DocNum), `JournalMemo` (idioma del UI).

**MULTI-PALLET + VALIDACIÓN (2026-08-25):** el POC acepta VARIOS folios → agrupa por (PT+lote+depto) en líneas (cantidad = suma de cajas), 1 detalle por pallet con `U_BaseLine`=índice de su línea. Regla del cultivo afinada: `Items.U_PrcCode` **si es una norma de reparto válida** (`ProfitCenters`/`OOCR`), si no el `OcrCode` de la OF (los chiles tienen `U_PrcCode='CPMV'` inválido → toman `CPMVMS` de la OF). Hay un **SELECT validador** (une asignación→pallet→RDR1→OITM→OWOR) que da OK/MAL por pallet comparando lote (pallet vs `RDR1.CogsOcrCo2`), depto (OF vs `CogsOcrCo3`), cultivo (`CogsOcrCod` ∈ {item, OF}) y aduana (cajas×`U_PesoKG` vs `RDR1.U_CE_CantidadAduana`). Probado OV multi-pallet 2549: **todo OK**. La app puede correr este mismo chequeo antes de dar por buena una OV.

**PASO 7 IMPRESCINDIBLE — marcar el pallet (2026-08-25):** al asignar hay que hacer `PATCH U_P_PALLETS(<Code>)` con `U_IsSalesOrder='Y'`, `U_PalletFinished='Y'`, `U_DateFinished`=hoy. **Sin esto el Addon Embarques NO lista el pallet** (filtra por esas banderas + fecha). Confirmado: tras el PATCH, los pallets asignados por el script aparecen en el embarque (pestaña "Ordenes de venta", Fecha pallet=hoy) igual que los del addon → flujo **pallet → OV → EMBARQUE** completo por Service Layer. Recordatorio: **nunca PUT/DELETE** (PUT reemplaza el registro completo y borra lo no enviado); solo `PATCH` (actualización parcial).

**RESULTADO POC (Gate 2/3) — 2026-08-24:** el script crea, 100% por Service Layer, una **OV + asignación** equivalente a la del addon (cultivo del artículo `U_PrcCode`, lote del pallet `U_Batch`, depto de la OF `OcrCode3`, aduana del artículo `U_CE_*`+`U_PesoKG`, y cabecera de aduana/propietario del cliente). Único detalle: `U_CE_CantidadAduana` sale con `U_PesoKG=13.61` (762.16) vs 13.62 del addon (762.72) — factor de kg, ajustable.

**CONFIRMADO con caso limpio (2026-08-24, folio 25965 → OV 2544):** pallet Ejote Conv / lote Sifon 18 / (sin depto) + su OF 4226 (Ejote / — / Empaque) → la OV quedó **Ejote / Sifon 18 / Empaque**. Por lo tanto:
- **Lote = del PALLET** (`U_Batch`; la OF no trae lote). ✅
- **Departamento = de la OF** (`OcrCode3`; el pallet no trae depto). ✅
- **Cultivo = de la OF** (`OcrCode`; coincide con el del pallet). ✅ (regla de trabajo; un caso Ejote-Org lo confirmaría al 100% pero es consistente).

Enlace pallet→OF: `@P_PALLETS_BITACORA.U_ProductionOrderNum` → `OWOR`/Service Layer `ProductionOrders`. `OOCR`: DimCode 1=Cultivos, 2=Lotes, 3=Departamentos, 4=Activos. El "Portal Pallets" (DEV_01) al crear el pallet captura Agricultor+Cultivo+PT+Lote+cajas (NO departamento). `@CAT_CULTIVOS` mapea grupo de artículos→nombre de cultivo (para el portal), NO al OcrCode.
- **Nota Service Layer:** campo de dimensión de la OF probablemente `DistributionRule`/`DistributionRule3` en `ProductionOrders` (a confirmar al correr el POC).

## ✅ Estado de las puertas (gates)
- **Gate 1 — Service Layer expone las UDT:** ✅ PASADO (`U_P_...`).
- **Receta de asignación:** ✅ confirmada (antes/después real).
- **Gate 2 — POC de `POST` por Service Layer en TEST_SLA:** ⏳ pendiente (crear OV + escribir asignación → verificar en el addon).
- **Gate 3 — validar en el addon:** ⏳ pendiente.
- **Construir en la app:** solo tras Gate 2+3 OK, en micro-fases (cambio-seguro), con el addon como fuente de verdad + reconciliación.

## ❓ Pendientes por confirmar
- Columnas de embarque/manifiesto ✅ (ya documentadas). **Falta la "receta"** de cómo el addon escribe embarque + manifiesto (otro antes/después cuando se haga un embarque real en TEST_SLA).
- ¿Asignar cambia `U_IsSalesOrder` a `Y`? (revisar en el antes/después de `@P_PALLETS`).
- Estrategia de `Code` (máx+1) segura ante concurrencia (¿lock en MySQL propio? ¿reintento ante colisión?).
- Cómo crear la OV con las dimensiones correctas por línea (mapear cultivo/lote/departamento del pallet → `CostingCode`/2/3).
- `HANA_SCHEMA` por empresa (para lectura por HANA) — reutilizar el patrón de fletes de acarreo.
