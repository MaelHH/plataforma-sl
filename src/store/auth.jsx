/* eslint-disable react-refresh/only-export-components --
   Este archivo expone a propósito el provider (AuthProvider) y su hook (useAuth) juntos,
   igual que store/datos.jsx. No afecta a producción (solo al fast-refresh en dev). */
// Contexto de autorización (RBAC): carga el usuario logueado UNA vez (/api/auth/me) y expone
// sus permisos + un helper `can(codigo)` para gatear menú y acciones en toda la app.
//
// El front NO es seguridad (se brinca con la consola): el backend valida lo crítico
// (SAP, usuarios, borrados). Aquí solo mostramos/ocultamos para guiar al usuario.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { me } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [alcance, setAlcance] = useState(null);   // { cultivos, proyectos, cruce_empresas } del usuario (§2.1)
  const [cargando, setCargando] = useState(true);
  // ¿alguna vez cargó /me con éxito en esta sesión? Si sí, un fallo POSTERIOR (parpadeo de red al
  // "recargar") NO debe borrar la sesión ni escalar a "*": eso apagaría el aislamiento por empresa
  // y volvería al usuario "ve todo" a media sesión. Ver auditoría multi-empresa (🟠 auth) y [[sap-reglas-garantia]].
  const huboSesion = useRef(false);

  // Refresca desde /me. El setState ocurre DESPUÉS del await (no síncrono en el efecto).
  const cargar = useCallback(async (marcarCargando = true) => {
    if (marcarCargando) setCargando(true);
    try {
      const u = await me();
      setUsuario(u);
      setPermisos(Array.isArray(u?.permisos) ? u.permisos : []);
      setAlcance(u?.asignaciones || null);
      huboSesion.current = true;
    } catch {
      // Backend inalcanzable (un 401 real ya te manda al login vía `sl-unauthorized`).
      // - Si YA hubo sesión buena → la CONSERVAMOS tal cual (no escalar a "*", no perder empresa);
      //   el backend revalida lo crítico cuando vuelva la conexión.
      // - Si NUNCA hubo sesión (primer arranque offline) → modo local: concedemos todo localmente
      //   para no bloquear la captura sin red (comportamiento offline-first deliberado).
      if (!huboSesion.current) {
        setUsuario(null);
        setPermisos(["*"]);
        setAlcance(null);
      }
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial: el setState va dentro de callbacks de la promesa (.then/.catch/.finally),
  // no síncrono en el cuerpo del efecto → mismo patrón que AppGate, sin warning de hooks.
  useEffect(() => {
    let vivo = true;
    me()
      .then((u) => { if (!vivo) return; setUsuario(u); setPermisos(Array.isArray(u?.permisos) ? u.permisos : []); setAlcance(u?.asignaciones || null); huboSesion.current = true; })
      .catch(() => { if (!vivo || huboSesion.current) return; setUsuario(null); setPermisos(["*"]); setAlcance(null); })
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
