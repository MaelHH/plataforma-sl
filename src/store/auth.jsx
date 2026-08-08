/* eslint-disable react-refresh/only-export-components --
   Este archivo expone a propósito el provider (AuthProvider) y su hook (useAuth) juntos,
   igual que store/datos.jsx. No afecta a producción (solo al fast-refresh en dev). */
// Contexto de autorización (RBAC): carga el usuario logueado UNA vez (/api/auth/me) y expone
// sus permisos + un helper `can(codigo)` para gatear menú y acciones en toda la app.
//
// El front NO es seguridad (se brinca con la consola): el backend valida lo crítico
// (SAP, usuarios, borrados). Aquí solo mostramos/ocultamos para guiar al usuario.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { me } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [alcance, setAlcance] = useState(null);   // { cultivos, proyectos, cruce_empresas } del usuario (§2.1)
  const [cargando, setCargando] = useState(true);

  // Refresca desde /me. El setState ocurre DESPUÉS del await (no síncrono en el efecto).
  const cargar = useCallback(async (marcarCargando = true) => {
    if (marcarCargando) setCargando(true);
    try {
      const u = await me();
      setUsuario(u);
      setPermisos(Array.isArray(u?.permisos) ? u.permisos : []);
      setAlcance(u?.asignaciones || null);
    } catch {
      // Backend inalcanzable (un 401 real ya te manda al login vía `sl-unauthorized`). En modo
      // local/offline no bloqueamos la UI por falta de red: concedemos todo localmente. El backend
      // igual valida lo crítico cuando vuelva la conexión.
      setUsuario(null);
      setPermisos(["*"]);
      setAlcance(null);
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial: el setState va dentro de callbacks de la promesa (.then/.catch/.finally),
  // no síncrono en el cuerpo del efecto → mismo patrón que AppGate, sin warning de hooks.
  useEffect(() => {
    let vivo = true;
    me()
      .then((u) => { if (!vivo) return; setUsuario(u); setPermisos(Array.isArray(u?.permisos) ? u.permisos : []); setAlcance(u?.asignaciones || null); })
      .catch(() => { if (!vivo) return; setUsuario(null); setPermisos(["*"]); setAlcance(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const can = useCallback(
    (codigo) => permisos.includes("*") || permisos.includes(codigo),
    [permisos],
  );

  return (
    <AuthCtx.Provider value={{ usuario, permisos, alcance, cargando, recargar: () => cargar(true), can }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
