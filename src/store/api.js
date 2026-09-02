// Cliente de la API del backend (FastAPI). Mapea el store:
//  - Colecciones (listas con id):  /api/{coleccion}      GET/POST/PUT/DELETE
//  - Singletons (objetos únicos):  /api/state/{clave}    GET/PUT
//  - Auth:                          /api/auth/...
//
// La URL base se toma de VITE_API_URL (en .env). Si no, usa el MISMO host desde el
// que se abrió la app, en el puerto 4104 (puerto del backend FastAPI / servicio NSSM
// PlataformaSL-Backend). Así funciona tanto en tu compu (localhost) como cuando un
// colega entra por tu IP local (http://192.168.x.x:7890 → :4104).
// Fallback si no hay VITE_API_URL: en HTTP (dev/LAN) usa el backend en :4104 del mismo host
// (así un colega entra por tu IP local). En HTTPS usa ruta RELATIVA (mismo origen) para NO caer
// en mixed content: el navegador bloquearía un POST a http://…:4104 desde una página https.
const hostBackend =
  typeof window === "undefined"
    ? "http://localhost:4104"
    : window.location.protocol === "https:"
      ? ""  // relativo → mismo origen (nginx debe proxyear /api al backend)
      : `http://${window.location.hostname}:4104`;
export const API_URL = (import.meta.env.VITE_API_URL || hostBackend).replace(/\/$/, "");

const tokenKey = "plataforma_sl_token";
export const getToken = () => { try { return localStorage.getItem(tokenKey); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey); } catch { /* ignore */ } };

// Timeouts: sin esto, un backend colgado deja la app esperando para siempre
// ("Conectando…"/"Verificando sesión…" infinito). Abortamos con AbortController.
const TIMEOUT_MS = 15000;         // peticiones normales
const TIMEOUT_HEALTH_MS = 8000;   // health/login: más cortos
const TIMEOUT_SAP_WRITE = 120000; // escrituras a SAP (OC, recibo): lentas (varios round-trips)

async function fetchConTimeout(url, opts = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function req(method, path, body, timeoutMs) {
  const headers = { "Content-Type": "application/json" };
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let res;
  try {
    res = await fetchConTimeout(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, timeoutMs);   // timeout opcional (las escrituras a SAP son lentas → más largo)
  } catch (e) {
    // NO hubo respuesta (timeout, se cayó el internet, el servidor no contestó). En una ESCRITURA
    // esto NO significa "no se hizo": la operación pudo completarse allá. Se marca `sinRespuesta`
    // para que quien llama NO reintente a ciegas (ver G4 "Verificar en SAP"). Ver [[sap-reglas-garantia]].
    const err = new Error(e?.name === "AbortError"
      ? "La petición tardó demasiado y se canceló; no sabemos si alcanzó a completarse."
      : "Se perdió la conexión con el servidor; no sabemos si alcanzó a completarse.");
    err.sinRespuesta = true;
    throw err;
  }
  if (!res.ok) {
    if (res.status === 401) {
      // Token vencido/ausente → limpiar y avisar a la app para mostrar el login.
      setToken(null);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("sl-unauthorized"));
    }
    const raw = await res.text().catch(() => "");
    // El detalle completo (incl. respuestas de SAP/HANA) va SOLO a la consola, nunca a la vista.
    if (raw) console.error(`API ${method} ${path} → ${res.status}:`, raw);
    // Al usuario: solo el `detail` limpio que manda el backend; si el body no es JSON, mensaje genérico.
    let msg = `Error ${res.status}`;
    try { const j = JSON.parse(raw); if (j && typeof j.detail === "string") msg = j.detail; } catch { /* body no-JSON → genérico */ }
    const err = new Error(msg);
    err.status = res.status;
    // 500/504 = el backend murió o tardó demasiado a media operación → resultado DESCONOCIDO
    // (a diferencia de 400/409/502, donde sabemos que se rechazó y NO se creó nada).
    if (res.status === 500 || res.status === 504) err.sinRespuesta = true;
    throw err;
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// ── Salud ──
export const health = () => req("GET", "/api/health");

// ── Colecciones ──
export const getColeccion = (col) => req("GET", `/api/${col}`);
export const crear = (col, item) => req("POST", `/api/${col}`, item);
export const actualizar = (col, id, item) => req("PUT", `/api/${col}/${encodeURIComponent(id)}`, item);
export const borrar = (col, id) => req("DELETE", `/api/${col}/${encodeURIComponent(id)}`);

// ── Singletons ──
export const getState = (clave) => req("GET", `/api/state/${clave}`);
export const putState = (clave, obj) => req("PUT", `/api/state/${clave}`, obj ?? {});

// ── Auth ──
export const me = () => req("GET", "/api/auth/me");

// ── Gestión de usuarios ──
export const getUsuarios = () => req("GET", "/api/usuarios");
export const getTiposUsuario = () => req("GET", "/api/tipos-usuario");
export const crearUsuario = (body) => req("POST", "/api/usuarios", body);
export const actualizarUsuario = (id, body) => req("PUT", `/api/usuarios/${encodeURIComponent(id)}`, body);
export const cambiarActivoUsuario = (id, esActivo) => req("PATCH", `/api/usuarios/${encodeURIComponent(id)}/activo`, { es_activo: esActivo });

// ── Gestión de empresas (multi-empresa · solo admin) ──
export const getEmpresas = () => req("GET", "/api/empresas");
export const crearEmpresa = (body) => req("POST", "/api/empresas", body);
export const actualizarEmpresa = (id, body) => req("PUT", `/api/empresas/${encodeURIComponent(id)}`, body);
export const cambiarActivoEmpresa = (id, esActivo) => req("PATCH", `/api/empresas/${encodeURIComponent(id)}/activo`, { es_activo: esActivo });

// ── Asignaciones por usuario (cultivos + proyectos + cruce) ──
export const getAsignacionesUsuario = (id) => req("GET", `/api/usuarios/${encodeURIComponent(id)}/asignaciones`);
export const putAsignacionesUsuario = (id, body) => req("PUT", `/api/usuarios/${encodeURIComponent(id)}/asignaciones`, body);

// ── Roles y permisos (RBAC) ──
export const crearTipoUsuario = (body) => req("POST", "/api/tipos-usuario", body);
export const actualizarTipoUsuario = (id, body) => req("PUT", `/api/tipos-usuario/${encodeURIComponent(id)}`, body);
export const borrarTipoUsuario = (id) => req("DELETE", `/api/tipos-usuario/${encodeURIComponent(id)}`);
export const getPermisos = () => req("GET", "/api/permisos");
export const getRolPermisos = (id) => req("GET", `/api/tipos-usuario/${encodeURIComponent(id)}/permisos`);
export const putRolPermisos = (id, codigos) => req("PUT", `/api/tipos-usuario/${encodeURIComponent(id)}/permisos`, { codigos });
// El endpoint /api/auth/token suele esperar form-urlencoded (OAuth2PasswordRequestForm).
export async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetchConTimeout(`${API_URL}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, TIMEOUT_HEALTH_MS);
  if (!res.ok) throw new Error(`login → ${res.status}`);
  const data = await res.json();
  if (data.access_token) setToken(data.access_token);
  return data;
}

// ¿El backend está disponible? Timeout corto para no quedar colgado si no responde.
export async function disponible() {
  try {
    const res = await fetchConTimeout(`${API_URL}/api/health`, {}, TIMEOUT_HEALTH_MS);
    return res.ok;
  } catch { return false; }
}

// ── SAP (solo lectura · Paso 1) ──
// Órdenes de fabricación de SAP anidadas como ranchos(=Lote) → lotes(=Departamento).
const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : "";
};
export const getProyectosSAP = () => req("GET", "/api/sap/proyectos");
// Catálogo anidado: Proyecto → Ranchos(=SAP Lote) con departamento + cantidades + refs SAP.
// Timeout holgado (45s): el catálogo trae TODAS las temporadas liberadas de la empresa (varios cultivos).
export const getCatalogoProyectosSAP = (project, idEmpresa) => req("GET", `/api/sap/catalogo${qs({ project, id_empresa: idEmpresa })}`, undefined, 45000);
// Diagnóstico SOLO LECTURA: cómo se reparten las órdenes de fabricación de una empresa (item/estatus/proyecto).
export const getDiagOrdenesSAP = (idEmpresa) => req("GET", `/api/sap/ordenes-diag${qs({ id_empresa: idEmpresa })}`);
// ESCRITURA: Recibo de producción → suma `cantidad` (cubetas) a la Cantidad completada de la orden.
// body: { absoluteEntry, cantidad, warehouse?, fecha? }. Único POST a SAP.
export const reciboProduccionSAP = (body) => req("POST", "/api/sap/recibo-produccion", body, TIMEOUT_SAP_WRITE);
// Ficha EN VIVO de una orden de fabricacion (solo GET): para VERIFICAR contra que orden se
// va a sumar el recibo (Nº visible, articulo, lote/departamento reales y avance).
export const getOrdenFabricacionSAP = (absoluteEntry) =>
  req("GET", `/api/sap/orden-fabricacion${qs({ absoluteEntry })}`);
// Resuelve una OF por su NÚMERO VISIBLE (docNum → AbsoluteEntry), para fijar la OF a mano en un lote.
export const getOrdenPorNumeroSAP = (docNum) =>
  req("GET", `/api/sap/orden-por-numero${qs({ docNum })}`, undefined, 60000);
// G4 · VERIFICAR (solo GET, no escribe en SAP): ¿el recibo que se quedó "enviando" sí se creó?
// Evita el reintento a ciegas que duplicaría la Cantidad completada. Ver [[sap-reglas-garantia]].
export const verificarReciboSAP = ({ clave, absoluteEntry, cantidad, fecha }) =>
  req("GET", `/api/sap/recibo-verificar${qs({ clave, absoluteEntry, cantidad, fecha })}`, undefined, TIMEOUT_SAP_WRITE);

// ── SAP · Orden de compra de flete (Paso 4) ──
export const getProveedoresFleteSAP = (q) => req("GET", `/api/sap/proveedores-flete${qs({ q })}`);
export const getItemsFleteSAP = () => req("GET", "/api/sap/items-flete");
// Productos Terminados (PT) de SAP para la distribución de Evidencias de Carga (solo lectura).
// conStock=true → solo los PT con existencia (>0), ordenados por stock desc.
export const getProductosTerminadosSAP = (conStock = false) =>
  req("GET", `/api/sap/productos-terminados${qs({ con_stock: conStock ? "true" : undefined })}`, undefined, 60000);
export const getItemGruposSAP = () => req("GET", "/api/sap/item-grupos");
// Pallets DISPONIBLES para asignar a una OV de embarque (solo lectura; HANA directo, empresa-aware).
// Trae los activos NO asignados con la info del AddOn + dimensiones ya derivadas (cultivo/lote/depto).
export const getPalletsDisponibles = ({ pt, desde, top } = {}) =>
  req("GET", `/api/sap/pallets-disponibles${qs({ pt, desde, top })}`, undefined, 60000);
// Clientes (BusinessPartners cCustomer) para elegir el de la OV (solo lectura).
export const getClientesVenta = (q) => req("GET", `/api/sap/clientes-venta${qs({ q })}`, undefined, 60000);
// ESCRITURA: crea la OV + asignación de pallets en SAP (idempotente/resumible).
// body: { cardCode, fecha, lineas:[{ pt, cajas, cultivo, lote, depto, fraccion, unidadAduana, pesoKg, pallets:[{palletCode,palletDet,folio}] }] }.
export const crearOrdenVentaSAP = (body) => req("POST", "/api/sap/orden-venta", body, TIMEOUT_SAP_WRITE);
// ── Embarque (Fase 6) ──
// Pallets listos para embarcar (asignados a una OV, aún no embarcados). Solo lectura.
export const getPalletsPorEmbarcar = ({ desde, top } = {}) =>
  req("GET", `/api/sap/pallets-por-embarcar${qs({ desde, top })}`, undefined, 60000);
export const getTransportistas = () => req("GET", "/api/sap/transportistas", undefined, 60000);
export const getClienteDestino = (card) => req("GET", `/api/sap/cliente-destino${qs({ card })}`, undefined, 60000);
export const getConductores = () => req("GET", "/api/sap/conductores", undefined, 60000);
export const getAgentesAduanales = () => req("GET", "/api/sap/agentes-aduanales", undefined, 60000);
// ESCRITURA: crea el embarque completo (cabecera + detalle + manifiesto + entrega) en SAP.
// body: { linea, flete, anticipo, agente, fecha, pallets:[{palletCode,palletDet,ovEntry,ovNum,cardCode,pt,cajas,lote,baseLine,position}] }.
export const crearEmbarqueSAP = (body) => req("POST", "/api/sap/embarque", body, TIMEOUT_SAP_WRITE);
export const getEmbarques = () => req("GET", "/api/sap/embarques");
// Detalle de un embarque: info + sus PT con cajas y stock + lista de pallets.
export const getEmbarqueDetalle = (id) => req("GET", `/api/sap/embarques/${encodeURIComponent(id)}`, undefined, 60000);
// Reintenta las Entregas pendientes de un embarque (cuando ya hay stock en SAP).
export const reintentarEntregasEmbarque = (id) =>
  req("POST", `/api/sap/embarques/${encodeURIComponent(id)}/entregas`, undefined, TIMEOUT_SAP_WRITE);
// Detector de stock: por PT, necesita vs hay; dice si ya se pueden generar las entregas pendientes.
export const getStockEmbarque = (id) => req("GET", `/api/sap/embarques/${encodeURIComponent(id)}/stock`, undefined, 60000);
// Captura/edita el nº de manifiesto de una OV del embarque y lo sella en su Entrega (solo si está abierta).
export const actualizarManifiestoEmbarque = (id, ovEntry, numero) =>
  req("POST", `/api/sap/embarques/${encodeURIComponent(id)}/manifiesto`, { ovEntry, numero }, TIMEOUT_SAP_WRITE);
// ── OC de flete desde manifiesto (Fase 7) ──
// Manifiestos que la app ya generó (de los embarques), para elegirlos en la OC de flete. Solo lectura (BD local).
export const getFleteManifiestos = () => req("GET", "/api/sap/flete/manifiestos");
// Entrega asociada a un manifiesto (cliente + líneas con cajas y dimensiones). Solo lectura.
export const getFleteEntrega = (manifiesto) => req("GET", `/api/sap/flete/entrega${qs({ manifiesto })}`, undefined, 60000);
export const getFleteProveedores = (q) => req("GET", `/api/sap/flete/proveedores${qs({ q })}`, undefined, 60000);
export const getFleteArticulos = (q) => req("GET", `/api/sap/flete/articulos${qs({ q })}`, undefined, 60000);
// Lista de OC de flete creadas + su estado en SAP (pedido / entrada de mercancía / factura). Solo lectura.
export const getOcsFlete = () => req("GET", "/api/sap/flete/ocs", undefined, 90000);
// Tablero unificado de manifiestos (los que están en SAP + los app-only). Solo lectura (BD local).
export const getManifiestosTablero = () => req("GET", "/api/sap/manifiestos-tablero");
// ESCRITURA: crea la OC de flete (POST PurchaseOrders) con prorrateo por cajas. body:
// { manifiesto, proveedor, flete, ivaCode, precio, diesel, comentario, fecha }.
export const crearOcFlete = (body) => req("POST", "/api/sap/flete/oc", body, TIMEOUT_SAP_WRITE);
// ── Manifiestos / OV: guardar en la app (borrador) → lista → mandar a SAP ──
// Guarda la OV como BORRADOR en la app (NO toca SAP). Mismo body que crearOrdenVentaSAP.
export const guardarManifiesto = (body) => req("POST", "/api/sap/manifiestos", body);
// Lista las OV/manifiestos (borradores + enviadas) de la empresa del usuario.
export const getManifiestos = () => req("GET", "/api/sap/manifiestos");
// Manda a SAP una OV guardada (crea la OV + asignación). Lento (escritura a SAP).
export const enviarManifiestoSAP = (id) => req("POST", `/api/sap/manifiestos/${encodeURIComponent(id)}/enviar`, undefined, TIMEOUT_SAP_WRITE);
// Cancela (borra de la app) un borrador que aún no se envió a SAP.
export const cancelarManifiesto = (id) => req("POST", `/api/sap/manifiestos/${encodeURIComponent(id)}/cancelar`);

// ── Solicitud (necesidad) de trailer — la levanta el encargado de campo ──
export const getSolicitudesTrailer = (estado) => req("GET", `/api/solicitudes-trailer${qs({ estado })}`);
export const crearSolicitudTrailer = (body) => req("POST", "/api/solicitudes-trailer", body);
export const cumplirSolicitudTrailer = (id) => req("PATCH", `/api/solicitudes-trailer/${id}/cumplir`);
export const reabrirSolicitudTrailer = (id) => req("PATCH", `/api/solicitudes-trailer/${id}/reabrir`);
export const borrarSolicitudTrailer = (id) => req("DELETE", `/api/solicitudes-trailer/${id}`);

// ── Fotos de ficha de trailer (Cloudinary: la imagen va a la nube, la BD guarda la URL) ──
export const getFotosTrailer = (trailerId) => req("GET", `/api/fotos-trailer${qs({ trailer_id: trailerId })}`);
export const subirFotoTrailer = (trailerId, imagen) => req("POST", "/api/fotos-trailer", { trailerId, imagen }, 60000);
export const borrarFotoTrailer = (id) => req("DELETE", `/api/fotos-trailer/${encodeURIComponent(id)}`);
// Borra TODAS las fotos de un trailer (al eliminar el trailer, para no dejar basura en la nube).
export const borrarFotosDeTrailer = (trailerId) => req("DELETE", `/api/fotos-trailer/de-trailer/${encodeURIComponent(trailerId)}`);
export const getTaxCodesSAP = () => req("GET", "/api/sap/tax-codes");
export const getCultivosSAP = (idEmpresa) => req("GET", `/api/sap/cultivos${qs({ id_empresa: idEmpresa })}`);
export const getDepartamentosSAP = () => req("GET", "/api/sap/departamentos");
export const getLotesSAP = () => req("GET", "/api/sap/lotes");
export const getProyectosSAPlist = () => req("GET", "/api/sap/proyectos-sap");
export const getEstadoOCSAP = (pedidoEntry) => req("GET", `/api/sap/oc-estado${qs({ pedido_entry: pedidoEntry })}`);
// Control de fletes de ACARREO por proyecto (solo lectura): Pedidos + Entradas + Facturas cruzadas + totales.
export const getFletesSAP = (project, tipo) => req("GET", `/api/sap/fletes${qs({ project, tipo })}`, undefined, 120000);
// ESCRITURA: crea Solicitud de Pedido + Pedido de flete. body: { cardCode, item, precio, taxCode, proyecto, cultivo, lote, departamento, comentario }.
export const crearOrdenCompraSAP = (body) => req("POST", "/api/sap/orden-compra", body, TIMEOUT_SAP_WRITE);
