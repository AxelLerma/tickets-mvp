import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { ErrorNegocio } from "../core/errores";
import { uno } from "../db/connection";

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

export function emitirSesion(res: Response, id: number, version: number): void {
  const token = jwt.sign({ id, v: version }, config.jwtSecret, { expiresIn: "8h" });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.produccion,
    maxAge: 8 * 60 * 60 * 1000,
  });
}

export async function autenticar(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.token;
  if (!token) throw new ErrorNegocio("Inicie sesión para continuar.", 401);

  let carga: { id: number; v?: number };
  try {
    carga = jwt.verify(token, config.jwtSecret) as { id: number; v?: number };
  } catch {
    throw new ErrorNegocio("Su sesión expiró. Inicie sesión de nuevo.", 401);
  }

  const fila = await uno<UsuarioSesion & { sesionVersion: number }>(
    `SELECT id, nombre, correo, rol, region_id, sesion_version
       FROM usuarios WHERE id = ? AND activo = TRUE`,
    [carga.id],
  );
  if (!fila || fila.sesionVersion !== carga.v) {
    throw new ErrorNegocio("Su sesión ya no es válida. Inicie sesión de nuevo.", 401);
  }

  const { sesionVersion: _version, ...usuario } = fila;
  req.usuario = usuario;
  next();
}

export function requiereRol(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      throw new ErrorNegocio("No tiene permiso para esta acción.", 403);
    }
    next();
  };
}