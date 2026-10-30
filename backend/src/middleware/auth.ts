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

export function autenticar(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Inicia sesión para continuar." });
  }
  try {
    const { id } = jwt.verify(token, config.jwtSecret) as { id: number };
    // Se consulta la base en cada petición: si desactivan al usuario, pierde acceso de inmediato.
    const usuario = db
      .prepare("SELECT id, nombre, correo, rol, region_id AS regionId FROM usuarios WHERE id = ? AND activo = 1")
      .get(id) as UsuarioSesion | undefined;
    if (!usuario) {
      return res.status(401).json({ error: "Tu sesión ya no es válida." });
    }
    req.usuario = usuario;
    next();
  } catch {
    return res.status(401).json({ error: "Tu sesión expiró. Inicia sesión de nuevo." });
  }
}

export function requiereRol(...roles: Rol[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tienes permiso para esta acción." });
    }
    next();
  };
}