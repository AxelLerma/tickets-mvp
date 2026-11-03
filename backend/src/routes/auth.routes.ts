import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { ErrorNegocio } from "../core/errores";
import { uno } from "../db/connection";
import { autenticar, emitirSesion } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  correo: z.string().trim().toLowerCase().email("Escriba un correo válido."),
  password: z.string().min(1, "Escriba su contraseña."),
});

router.post("/login", async (req, res) => {
  const datos = loginSchema.safeParse(req.body);
  if (!datos.success) throw new ErrorNegocio(datos.error.issues[0].message);

  const usuario = await uno<{ id: number; nombre: string; correo: string; rol: string; passwordHash: string; sesionVersion: number }>(
    "SELECT id, nombre, correo, rol, password_hash, sesion_version FROM usuarios WHERE correo = ? AND activo = TRUE",
    [datos.data.correo],
  );

  if (!usuario || !(await bcrypt.compare(datos.data.password, usuario.passwordHash))) {
    throw new ErrorNegocio("Correo o contraseña incorrectos.", 401);
  }

  emitirSesion(res, usuario.id, usuario.sesionVersion);
  res.json({ usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol } });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/me", autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

export default router;