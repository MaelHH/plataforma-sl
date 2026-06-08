// Capa de acceso al backend (Plataforma SL API).
// El backend expone el estado completo con el MISMO shape del store (camelCase), así que
// el front solo cambia su ORIGEN de datos: hidrata con GET /estado y sincroniza los
// cambios por colección con PUT /estado. La lógica de los módulos no cambia.

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export const API_BASE = BASE;

// Trae TODO el estado en el shape del store (para hidratar el DatosProvider).
export async function getEstado() {
  const r = await fetch(`${BASE}/estado`);
  if (!r.ok) throw new Error(`GET /estado → ${r.status}`);
  return r.json();
}

// Reemplaza SOLO las colecciones presentes en `parcial` (sync por colección).
export async function guardarColecciones(parcial) {
  const r = await fetch(`${BASE}/estado`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parcial),
  });
  if (!r.ok) throw new Error(`PUT /estado → ${r.status}`);
  return r.json();
}
