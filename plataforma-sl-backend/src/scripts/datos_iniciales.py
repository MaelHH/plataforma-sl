"""Datos semilla — copia FIEL de los `*_INICIAL` de `src/store/datos.jsx` del frontend.

Solo catálogos (no se siembran trailers/cargas/movimientos demo: las tablas operativas
arrancan vacías y se llenan con la operación o con import_localstorage).
"""
from __future__ import annotations

CATALOGO_INICIAL = [
    {"id": "BP_XL_11KG", "label": "Bell Pepper XL 11 KG", "color": "bg-orange-100 text-orange-800", "cajasPorParrilla": 56, "cultivo": "BP", "librasPorCaja": 24},
    {"id": "BP_55CT", "label": "Bell Pepper 55 CT WM USA", "color": "bg-orange-100 text-orange-800", "cajasPorParrilla": 45, "cultivo": "BP", "librasPorCaja": 25},
    {"id": "BP_65CT", "label": "Bell Pepper 65 CT WM USA", "color": "bg-orange-200 text-orange-900", "cajasPorParrilla": 45, "cultivo": "BP", "librasPorCaja": 25},
    {"id": "BP_EURO48", "label": "Bell Pepper Eurobox 48CT XLG", "color": "bg-amber-100 text-amber-800", "cajasPorParrilla": 50, "cultivo": "BP", "librasPorCaja": 22},
    {"id": "BP_BOLSA8X6", "label": "Bell Pepper Bolsa 8x6", "color": "bg-yellow-100 text-yellow-800", "cajasPorParrilla": 50, "cultivo": "BP", "librasPorCaja": 18},
    {"id": "EJ_WM17", "label": "Ejote Walmart 1.7 USA", "color": "bg-green-100 text-green-800", "cajasPorParrilla": 50, "cultivo": "EJ", "librasPorCaja": 20},
    {"id": "EJ_CONV5LBS", "label": "Ejote Conv. 2 bolsas 5lbs", "color": "bg-teal-100 text-teal-800", "cajasPorParrilla": 88, "cultivo": "EJ", "librasPorCaja": 10},
    {"id": "EJ_MKT_WM", "label": "Ejote Market Side WM", "color": "bg-emerald-100 text-emerald-800", "cajasPorParrilla": 88, "cultivo": "EJ", "librasPorCaja": 15},
    {"id": "EJ_ORG_ALS", "label": "Ejote Orgánico 14 Bolsas Alsuper", "color": "bg-lime-100 text-lime-800", "cajasPorParrilla": 80, "cultivo": "EJ", "librasPorCaja": 14},
]

CULTIVOS_INICIAL = [
    {"id": "BP", "label": "Bell Pepper SL", "color": "orange"},
    {"id": "EJ", "label": "SL Agrícola Ejote", "color": "green"},
]

LINEAS_INICIAL = [
    {"id": "L1", "linea": "Transportes del Pacífico", "contacto": "Ramón Soto", "numero": "667-123-4567",
     "choferes": [{"id": "CH1", "nombre": "Carlos Mendoza", "telefono": "667-987-6543", "licencia": "LIC-88721"}],
     "tractos": [{"id": "TR1", "marcaModelo": "Kenworth T680", "placa": "ABC-1234"}],
     "cajas": [{"id": "CJ1", "economico": "C-0042", "placa": "XYZ-9876"}]},
    {"id": "L2", "linea": "Fletes del Norte", "contacto": "Sandra López", "numero": "668-555-9900",
     "choferes": [{"id": "CH2", "nombre": "Miguel Ángel Ruiz", "telefono": "668-321-7654", "licencia": "LIC-44502"}],
     "tractos": [{"id": "TR2", "marcaModelo": "International LT", "placa": "DEF-5678"}],
     "cajas": [{"id": "CJ2", "economico": "C-0087", "placa": "MNO-4321"}]},
    {"id": "L3", "linea": "Logística Sinaloa", "contacto": "Pedro Vega", "numero": "669-777-1122",
     "choferes": [{"id": "CH3", "nombre": "José Luis Torres", "telefono": "669-444-2211", "licencia": "LIC-33180"}],
     "tractos": [{"id": "TR3", "marcaModelo": "Freightliner Cascadia", "placa": "GHI-9012"}],
     "cajas": [{"id": "CJ3", "economico": "C-0103", "placa": "PQR-8765"}]},
]

CARGA_CAMPO_INICIAL = [
    {"id": "CC1", "label": "Caja c/flete"},
    {"id": "CC2", "label": "Fresco"},
    {"id": "CC3", "label": "Cajas vacías"},
    {"id": "CC4", "label": "Bins"},
    {"id": "CC5", "label": "Taras"},
]

UBICACIONES_ORIGENES_INICIAL = [
    {"id": "OR1", "nombre": "San Quintín, B.C.", "lotes": ["Paredes", "El Llano"], "responsables": ["Juan Pérez"]},
    {"id": "OR2", "nombre": "Los Mochis, Sinaloa", "lotes": [], "responsables": []},
    {"id": "OR3", "nombre": "Culiacán, Sinaloa", "lotes": [], "responsables": []},
]

UBICACIONES_DESTINOS_INICIAL = [
    {"id": "DE1", "nombre": "Empaque Los Mochis"},
    {"id": "DE2", "nombre": "Empaque Culiacán"},
    {"id": "DE3", "nombre": "Empaque Guasave"},
]

ZONAS_INICIAL = ["Baja California", "Jalisco", "Sinaloa", "Sonora", "McAllen", "Nogales"]
CONSIGNADOS_INICIAL = ["SL Agrícola", "CACO", "CAT", "SL Produce"]
INSPECTORES_QC_INICIAL = ["ALDO ESTRADA", "FERNANDO BELTRAN", "JESUS GAXIOLA", "LUIS GAXIOLA"]
LUGARES_QC_INICIAL = ["Traveler", "Agripacking", "Divine Flavour"]
RESPONSABLES_INICIAL = ["Francisco Flores", "Kiko"]

MATERIALES_INICIAL = [
    {"id": "MAT1", "codigo": "CART-001", "descripcion": "Cartón corrugado para caja", "unidad": "Pieza", "fraccion": "4819.10.01", "diasSalida": 540},
    {"id": "MAT2", "codigo": "ETI-001", "descripcion": "Etiqueta adhesiva PLU", "unidad": "Rollo", "fraccion": "4821.10.01", "diasSalida": 540},
    {"id": "MAT3", "codigo": "PEL-001", "descripcion": "Película plástica (clamshell)", "unidad": "Kg", "fraccion": "3920.20.99", "diasSalida": 540},
    {"id": "MAT4", "codigo": "FLE-001", "descripcion": "Fleje plástico", "unidad": "Rollo", "fraccion": "3923.50.99", "diasSalida": 540},
    {"id": "MAT5", "codigo": "RPC-6419", "descripcion": "Contenedor plástico retornable RPC 6419 (60×40×19 cm)", "unidad": "Pieza", "fraccion": "3923.10.01", "diasSalida": 540},
]

# defectosCalidad: producto -> [ [grupo, token] ]  (Q=QUALITY/calidad, C=CONDITION/condicion)
DEFECTOS_ROWS = {
    "ZUCCHINI": [["Q", "ABNORMALCOLOR"], ["C", "BRUISES"], ["C", "DECAY"], ["Q", "DEFORMED"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "SCARS"], ["Q", "SCUFFING"], ["C", "SOFT"], ["C", "SUNKENAREAS"], ["Q", "UNDERSIZE"]],
    "YELLOW SQUASH": [["Q", "ABNORMALCOLOR"], ["C", "BRUISES"], ["C", "DECAY"], ["Q", "DEFORMED"], ["Q", "FUERADETAMAÑO"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "SCARS"], ["Q", "SCUFFING"], ["C", "SOFT"], ["Q", "UNDERSIZE"]],
    "SPAGHETTI": [["Q", "ABNORMALCOLOR"], ["C", "DECAY"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "SCARS"], ["Q", "SCUFFING"], ["C", "SOFT"], ["Q", "UNDERSIZE"]],
    "RED BELL PEPPER": [["Q", "ABNORMALCOLOR"], ["C", "BLOSSOM"], ["C", "DECAY"], ["Q", "DEFORMED"], ["Q", "Fumagina"], ["Q", "IMMATURE"], ["C", "INSECTDAMAGE"], ["C", "LIVEINSECT"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "NOTCLEAN"], ["Q", "PITTING"], ["Q", "SCARS"], ["C", "SHRIVELED"], ["Q", "SUNSCALD"], ["Q", "TURNED"], ["C", "VIROSIS"], ["Q", "WETSTEM"]],
    "GREEN BELL PEPPER": [["Q", "ABNORMALCOLOR"], ["C", "BLOSSOM"], ["Q", "BROWNSTEM"], ["C", "BRUISES"], ["Q", "ChillDamage"], ["Q", "CRUSHED"], ["C", "DECAY"], ["Q", "DEFORMED"], ["Q", "FUERADETAMAÑO"], ["Q", "Fumagina"], ["Q", "HOLLOW"], ["Q", "IMMATURE"], ["C", "INSECTDAMAGE"], ["C", "LIVEINSECT"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "NOTCLEAN"], ["Q", "PITTING"], ["C", "RUSSETING"], ["Q", "SCARS"], ["C", "SHRIVELED"], ["C", "SHRIVELEDENDS"], ["Q", "SILVERDISCOLORATION"], ["C", "SOFT"], ["C", "SOFTTIPS"], ["C", "SUNKENAREAS"], ["Q", "SUNSCALD"], ["Q", "TURNED"], ["Q", "UNDERSIZE"], ["C", "VIROSIS"], ["Q", "WETSTEM"], ["Q", "YELLOWBELLY"], ["Q", "YELLOWTIPS"]],
    "GREEN BEANS": [["Q", "BEANNY"], ["Q", "CRUSHED"], ["C", "DECAY"], ["Q", "IMMATURE"], ["C", "INSECTDAMAGE"], ["C", "MATURE"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["C", "RUSSETING"], ["Q", "SCARS"], ["C", "SHRIVELED"]],
    "GRAY SQUASH": [["Q", "ABNORMALCOLOR"], ["C", "BRUISES"], ["C", "DECAY"], ["Q", "DEFORMED"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "SCARS"], ["Q", "SCUFFING"], ["C", "SOFT"], ["Q", "UNDERSIZE"]],
    "CUCUMBER": [["Q", "ABNORMALCOLOR"], ["C", "BRUISEDTIP"], ["Q", "ChillDamage"], ["C", "DECAY"], ["Q", "DEFORMED"], ["Q", "FUERADETAMAÑO"], ["Q", "HOLLOW"], ["C", "INSECTDAMAGE"], ["Q", "INTERNALDISCOLORATION"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "NOTCLEAN"], ["Q", "PITTING"], ["C", "RUSSETING"], ["Q", "SCARS"], ["C", "SHRIVELED"], ["C", "SHRIVELEDENDS"], ["Q", "SILVERDISCOLORATION"], ["C", "SOFT"], ["C", "SOFTTIPS"], ["C", "SUNKENAREAS"], ["Q", "SUNSCALD"], ["Q", "UNDERSIZE"], ["Q", "WETSTEM"], ["Q", "YELLOWBELLY"], ["Q", "YELLOWTIPS"]],
    "CORN": [["C", "DECAY"], ["C", "DEHYDRATED"], ["Q", "IMMATURE"], ["C", "LIVEINSECT"], ["Q", "MISSIZED"], ["Q", "UNDERSIZE"]],
    "BUTTERNUT": [["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "SCARS"], ["Q", "UNDERSIZE"]],
    "BERENJENA": [["Q", "ABNORMALCOLOR"], ["Q", "BROWNSTEM"], ["C", "BRUISES"], ["C", "DECAY"], ["C", "MECHANICALDAMAGE"], ["Q", "SCARS"], ["C", "SOFT"], ["C", "SUNKENAREAS"], ["Q", "UNDERSIZE"]],
    "ACORN": [["Q", "ABNORMALCOLOR"], ["C", "DECAY"], ["C", "MECHANICALDAMAGE"], ["C", "MOLD"], ["Q", "SCARS"]],
}


def defectos_iniciales() -> list[dict]:
    """Aplana DEFECTOS_ROWS al shape de la tabla: {id, producto, label, cat}."""
    filas: list[dict] = []
    for prod, rows in DEFECTOS_ROWS.items():
        for grupo, tok in rows:
            filas.append({
                "id": f"{prod}__{tok}",
                "producto": prod,
                "label": tok,
                "cat": "calidad" if grupo == "Q" else "condicion",
            })
    return filas
