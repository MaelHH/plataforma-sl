# Embarques: el Excel de macros vs. el programa (Plataforma SL)

> Análisis del archivo **`SQGUIA CLUSTER EMBARQUES MACROS ACTUALIZADO 04-05-2026 SQ.xlsm`** (Excel con macros) que te mandaron, y cómo se compara con el proceso de embarques que **ya existe** en la app. Fecha: 2026-08-18.

---

## 1. ¿Qué es ese Excel? (en corto)

Es una **herramienta manual en Excel** para preparar y **imprimir TODO el papeleo de un embarque de exportación** desde **una sola hoja de captura**. No tiene base de datos, ni login, ni SAP: es un archivo que una persona llena a mano y las **macros** arman/imprimen los formatos.

- **17 hojas.** Una de captura (**MENU**), varias de salida (los documentos que se imprimen) y otras de apoyo (matrices y catálogo).
- **Macros (VBA)** detectadas:
  - `EMBARQUE_NUEVO` → limpia la hoja MENU para empezar un embarque nuevo.
  - `VistaPreviaGUIAMANIFIESTOARRFS` → arma e imprime la **Guía + Manifiesto + ARRFS**.
  - `Imprime_REMISION_CARTON` / `_RPC` / `_BOLSAS` / `_COLIMAN` → imprime las **remisiones de material de empaque**.
  - Todas **leen de `MENU`** y rellenan las demás hojas (`Sheets("MENU").Range(...)`).

### Cómo funciona el flujo del Excel
```
        [ MENU ] ← se captura TODO a mano (una sola vez)
           │  (macros leen MENU y llenan/imprimen)
           ▼
  ┌────────┬────────────┬─────────┬─────────┬───────────────┬─────────────────┐
  ▼        ▼            ▼         ▼         ▼               ▼                 ▼
GUIA     MANIFIESTO   ACOMODO   SELLOS   DATOS          REM. CARTON/RPC/    (MATRIX = tablas
BARATA/                                  TRANSPORTISTA  BOLSAS/COLIMAN       de apoyo/lookup)
ARRFS                                                   (para aduana)
```

---

## 2. Qué se captura en la hoja **MENU**

Todo el embarque se teclea en un solo lugar:

- **Datos del embarque:** fecha, manifiesto, cliente, destino, agencia aduanal, transportista + teléfono, conductor + teléfono + licencia, **camión** (marca, modelo, placas, número económico), **caja** (placas, económico), **sellos 1/2/3 + sello de cruce**, flete, **total de palets (en embarque y en camión)**, temperatura, **consolidados** (agrícola 2 a 6, cada una con su manifiesto/destino/cajas/palets).
- **Artículos:** clave `PT-XXXX`, descripción, bultos, tamaño, peso por caja, peso total.
- **Descuentos de material de empaque:** por **cartón, RPC, bolsas y Coliman**, cada uno con cantidad, descripción, **factura / pedimento** y precio (USD/MXN). Esto es para el manejo aduanal del empaque (envase temporal).
- **Acomodo de mixtos e incompletas:** las tarimas que llevan **mezcla de productos** o van **incompletas**.
- **Catálogo interno** (parte baja de MENU): productos `PT-XXXX` (peso lb/kg, cajas por palet, productor) + listas de **marcas de camión, modelos, destinos, agencias aduanales, distribuidores, agrícolas y tipos de empaque** (cartón 1 1/9, eurobox, RPC 6419/6423/6425/6429, bolsa, Coliman). Estas listas alimentan los menús desplegables.

---

## 3. Los documentos que genera (salida por salida)

| Hoja / documento | Qué es y para qué sirve |
|---|---|
| **GUIA BARATA / GUIA ARRFS** | La **guía / carta porte** de transporte (dos formatos). Lleva datos fiscales de SL Agrícola, agencia, placas de la caja y el desglose de **bultos / kg**. |
| **MANIFIESTO** | El **manifiesto del embarque**: emisor (SL), transportista, conductor, destino, distribuidor, agencia aduanal, camión (marca/modelo/placas), y la tabla de **artículos** (clave, descripción, tamaño, bultos, kg) con total. |
| **ACOMODO** | El **diagrama de acomodo de tarimas** (posiciones 1 a 30, más filas **MIX**), con manifiesto/destinatario/destino/agencia, **total de cajas, total de parrillas**, operador, teléfono, caja, **temperatura y firma**. |
| **SELLOS** | El **registro de sellos**: No. de factura/manifiesto, chofer, transporte, placas del camión y del contenedor, **3 sellos + sello de cruce**, con "quién lo abrió", agencia, firma y fecha/hora. |
| **DATOS TRANSPORTISTA** | El **formato de la línea de transporte**: línea, teléfono de tráfico, operador, licencia, celular, camión (marca/modelo/placas/caja), y por cada agrícola: manifiesto, destino, bultos, **peso de embarque, peso en trailer y flete**. |
| **REM. CARTON / RPC / BOLSAS / COLIMAN** | Las **remisiones del material de empaque** (cartón, RPC, bolsas, caja Coliman) ligadas a **facturas/pedimentos** — el papeleo aduanal del envase. |
| **MATRIX CARTON / RPC / BOLSA / COLIMAN** | Tablas de apoyo (lookup) que usan las macros para armar las remisiones. |

> **En una frase:** el Excel toma UNA captura y escupe TODO el paquete de papeles del embarque listo para imprimir (guía, manifiesto, acomodo, sellos, datos del transportista y remisiones de aduana).

---

## 4. Comparación con lo que YA hace tu programa

El programa **ya cubre buena parte de esto**, con la ventaja enorme de que **los datos fluyen solos entre módulos** (Tráfico → Evidencias → Embarques → Fletes), tiene **login/permisos, base de datos y lee stock real de SAP** — cosas que el Excel no tiene.

| # | Salida del Excel | ¿En el programa? | Dónde / cómo |
|---|---|---|---|
| 1 | **Manifiesto** | ✅ **Sí** (lo más completo) | `Modulo5` (Embarques) → `reportes/manifiestoEmbarque.js` genera un **PDF de 5 páginas** con transportista, camión, artículos (clave/desc/tamaño/bultos), totales. |
| 2 | **Guía / Carta Porte** (BARATA / ARRFS) | ❌ **No** | No existe carta porte/guía en ningún módulo. |
| 3 | **Acomodo de tarimas** | ⚠️ **Parcial** | `Modulo4` (Evidencias) captura 30 parrillas por empresa; el manifiesto (pág. 2-3) las dibuja. **Falta lo MIX/incompleto** (hoy 1 producto por parrilla, cajas fijas). |
| 4 | **Sellos** | ⚠️ **Solo plantilla** | El manifiesto (pág. 4) imprime los bloques de sello **en blanco para llenar a mano**; no se capturan ni guardan los sellos. |
| 5 | **Datos del transportista** | ✅ **Sí** | `Modulo3` (Tráfico) captura línea/chofer/tracto/caja/flete; el manifiesto (pág. 5) imprime el formato con la tabla por agrícola. |
| 6 | **Remisiones de material de empaque (aduana)** | ❌ **No** (hay algo adyacente) | No existen remisiones de cartón/RPC/bolsas/**Coliman** ligadas a facturas/pedimentos. Lo más cercano: `Modulo10` (Importaciones IMMEX) y `Modulo13` (Movimiento de materiales), pero no es lo mismo. |
| 7 | **Consolidados** (varias agrícolas) | ✅ **Sí** (limitado) | `Modulo4` + `Modulo6` juntan hasta **3 empresas** (SL/CAT/CACO) y reparten el flete por cajas. El Excel admite hasta **6 orígenes**. |
| 8 | **Catálogo de productos + listas** | ⚠️ **Parcial** | ✅ Productos `PT-XXXX` (y **stock real desde SAP**) + destinos. ❌ Falta catálogo de **agencias aduanales** y **distribuidores** conectado al manifiesto (hoy salen en blanco). |

---

## 5. Qué le falta al programa para igualar (o superar) al Excel

Ordenado por lo que más se nota:

1. **Tarimas MIX / mixtas / incompletas** en el acomodo (hoy solo 1 producto por parrilla con cajas fijas). *— es el hueco más pedido.*
2. **Sellos como dato capturado y guardado** (3 sellos + cruce, quién abrió, agencia, hora), no como plantilla en blanco.
3. **Guía / Carta Porte** (formatos BARATA / ARRFS) — inexistente en el programa.
4. **Remisiones de material de empaque para aduana** (cartón/RPC/bolsas/Coliman ligadas a facturas/pedimentos).
5. **Pesos reales** en el manifiesto y en el formato de transportista: hoy el manifiesto imprime **libras** y en "peso de embarque/trailer" pone el **nº de parrillas**, no kg reales.
6. **Consolidados de hasta 6 orígenes** (hoy topado a 3 empresas fijas).
7. **Catálogos de agencias aduanales y distribuidores** enganchados al manifiesto (hoy en blanco, se llenan a mano).
8. **Datos fiscales propios de CAT y CACO** (hoy reusan los de SL Agrícola).

## 6. Qué tiene el programa que el Excel NO

- Los datos **fluyen solos** entre Tráfico → Evidencias → Embarques → Fletes (en el Excel se recaptura todo a mano cada vez).
- **Login, permisos por rol, base de datos** y trazabilidad (quién/cuándo).
- **Stock real de productos desde SAP**.
- **Reparto automático de flete por cajas** + export a Excel.
- **Inspección de precarga (REG-EMP-15)**, **expediente de exportación** consolidado y **monitoreo en ruta con mapa**.

---

## 7. Conclusión / siguiente paso sugerido

El Excel y el programa **hacen lo mismo en el fondo** (armar el papeleo del embarque), pero el programa lo hace **conectado, con datos que ya existen** y sin recaptura. **No hay que cambiar de sistema**: conviene **acercar el programa a lo que el Excel ya resuelve** cerrando los huecos de arriba, en este orden sugerido (rápido → grande):

1. **Sellos capturables** (dato + guardar) y **pesos reales en kg** en el manifiesto. *(chico, alto valor)*
2. **Tarimas MIX / incompletas** en el acomodo. *(medio)*
3. **Catálogos de agencias aduanales y distribuidores** + datos fiscales de CAT/CACO. *(chico-medio)*
4. **Guía / Carta Porte** y **remisiones de material de empaque para aduana**. *(grande — son formatos y lógica aduanal nuevos)*

> Recomendación: **usar este Excel como "lista de requisitos"** de lo que la operación necesita en papel, e ir migrando esos formatos al programa (donde ya viven los datos), en vez de mantener los dos en paralelo.
