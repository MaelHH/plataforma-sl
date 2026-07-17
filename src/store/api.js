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
  const res = await fetchConTimeout(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, timeoutMs);   // timeout opcional (las escrituras a SAP son lentas → más largo)
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
export const getCatalogoProyectosSAP = (project) => req("GET", `/api/sap/catalogo${qs({ project })}`);
// ESCRITURA: Recibo de producción → suma `cantidad` (cubetas) a la Cantidad completada de la orden.
// body: { absoluteEntry, cantidad, warehouse?, fecha? }. Único POST a SAP.
export const reciboProduccionSAP = (body) => req("POST", "/api/sap/recibo-produccion", body, TIMEOUT_SAP_WRITE);

// ── SAP · Orden de compra de flete (Paso 4) ──
export const getProveedoresFleteSAP = (q) => req("GET", `/api/sap/proveedores-flete${qs({ q })}`);
export const getItemsFleteSAP = () => req("GET", "/api/sap/items-flete");
// Productos Terminados (PT) de SAP para la distribución de Evidencias de Carga (solo lectura).
// conStock=true → solo los PT con existencia (>0), ordenados por stock desc.
export const getProductosTerminadosSAP = (conStock = false) =>
  req("GET", `/api/sap/productos-terminados${qs({ con_stock: conStock ? "true" : undefined })}`, undefined, 60000);
export const getItemGruposSAP = () => req("GET", "/api/sap/item-grupos");

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
export const getCultivosSAP = () => req("GET", "/api/sap/cultivos");
export const getDepartamentosSAP = () => req("GET", "/api/sap/departamentos");
export const getLotesSAP = () => req("GET", "/api/sap/lotes");
export const getProyectosSAPlist = () => req("GET", "/api/sap/proyectos-sap");
export const getEstadoOCSAP = (pedidoEntry) => req("GET", `/api/sap/oc-estado${qs({ pedido_entry: pedidoEntry })}`);
// Control de fletes de ACARREO por proyecto (solo lectura): Pedidos + Entradas + Facturas cruzadas + totales.
export const getFletesSAP = (project, tipo) => req("GET", `/api/sap/fletes${qs({ project, tipo })}`, undefined, 120000);
// ESCRITURA: crea Solicitud de Pedido + Pedido de flete. body: { cardCode, item, precio, taxCode, proyecto, cultivo, lote, departamento, comentario }.
export const crearOrdenCompraSAP = (body) => req("POST", "/api/sap/orden-compra", body, TIMEOUT_SAP_WRITE);
