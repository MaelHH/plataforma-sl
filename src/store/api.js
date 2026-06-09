// Cliente de la API del backend (FastAPI). Mapea el store:
//  - Colecciones (listas con id):  /api/{coleccion}      GET/POST/PUT/DELETE
//  - Singletons (objetos únicos):  /api/state/{clave}    GET/PUT
//  - Auth:                          /api/auth/...
//
// La URL base se toma de VITE_API_URL (en .env). Si no, usa el MISMO host desde el
// que se abrió la app, en el puerto 8000. Así funciona tanto en tu compu (localhost)
// como cuando un colega entra por tu IP local (http://192.168.x.x:5173 → :8000).
const hostBackend = typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000";
export const API_URL = (import.meta.env.VITE_API_URL || hostBackend).replace(/\/$/, "");

// Colecciones (arrays de objetos con `id`) y singletons (objetos / arrays simples).
export const COLECCIONES = [
  "trailers", "movimientos", "cargasEmbarques", "catalogo", "cultivos",
  "lineas", "materiales", "importaciones", "bitacora", "cargaCampo",
];
export const SINGLETONS = [
  "programa", "monitoreo", "requerimientoGen", "requerimientoMeta", "ubicaciones",
  "defectosCalidad", "responsables", "inspectoresCalidad", "lugaresCalidad",
  "zonas", "consignados",
];

const tokenKey = "plataforma_sl_token";
export const getToken = () => { try { return localStorage.getItem(tokenKey); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey); } catch { /* ignore */ } };

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → ${res.status} ${txt}`);
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
export const register = (datos) => req("POST", "/api/auth/register", datos);
// El endpoint /api/auth/token suele esperar form-urlencoded (OAuth2PasswordRequestForm).
export async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${API_URL}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`login → ${res.status}`);
  const data = await res.json();
  if (data.access_token) setToken(data.access_token);
  return data;
}

// ¿El backend está disponible?
export async function disponible() {
  try { await health(); return true; } catch { return false; }
}
