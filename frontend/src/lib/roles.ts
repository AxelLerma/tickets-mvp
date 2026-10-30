import type { Rol } from "./tipos";

export const RUTA_INICIO: Record<Rol, string> = {
  reportante: "/reportante",
  tecnico: "/tecnico",
  manager: "/manager",
  admin: "/manager",
};

const SECCIONES: Record<string, Rol[]> = {
  "/reportante": ["reportante"],
  "/tecnico": ["tecnico"],
  "/manager": ["manager", "admin"],
};

/** Control de acceso de la interfaz. La autoridad real es el backend; esto solo evita pantallas que no corresponden. */
export function permitidoEn(ruta: string, rol: Rol): boolean {
  const seccion = Object.keys(SECCIONES).find((p) => ruta === p || ruta.startsWith(`${p}/`));
  return seccion ? SECCIONES[seccion].includes(rol) : true;
}