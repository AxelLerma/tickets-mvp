import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { db } from "../db/connection";

export type Rol = "reportante" | "tecnico" | "manager" | "admin";

export interface UsuarioSesion {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  regionId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioSesion;
    }
  }
}

/** Crea la cookie de sesión. La versión permite invalidar sesiones al cambiar contraseña o rol. */
export function emitirSesion(res: Response, id: number, version: number): void {
  const token = jwt.sign({ id, v: version }, config.jwtSecret, { expiresIn: "8h" });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.produccion,
    maxAge: 8 * 60 * 60 * 1000,
  });
}

export function autenticar(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Inicie sesión para continuar." });
  }
  try {
    const { id, v } = jwt.verify(token, config.jwtSecret) as { id: number; v?: number };
    // Se consulta la base en cada petición: si desactivan al usuario o cambian su acceso, pierde la sesión de inmediato.
    const fila = db
      .prepare(
        `SELECT id, nombre, correo, rol, region_id AS regionId, sesion_version AS version
           FROM usuarios WHERE id = ? AND activo = 1`,
      )
      .get(id) as (UsuarioSesion & { version: number }) | undefined;
    if (!fila || fila.version !== v) {
      return res.status(401).json({ error: "Su sesión ya no es válida. Inicie sesión de nuevo." });
    }
    const { version: _version, ...usuario } = fila;
    req.usuario = usuario;
    next();
  } catch {
    return res.status(401).json({ error: "Su sesión expiró. Inicie sesión de nuevo." });
  }
}

export function requiereRol(...roles: Rol[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tiene permiso para esta acción." });
    }
    next();
  };
}