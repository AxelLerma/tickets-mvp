import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db/connection";
import { autenticar, emitirSesion } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  correo: z.string().trim().toLowerCase().email("Escriba un correo válido."),
  password: z.string().min(1, "Escriba su contraseña."),
});

router.post("/login", (req, res) => {
  const datos = loginSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ error: datos.error.issues[0].message });
  }

  const usuario = db
    .prepare(
      `SELECT id, nombre, correo, rol, password_hash AS hash, sesion_version AS version
         FROM usuarios WHERE correo = ? AND activo = 1`,
    )
    .get(datos.data.correo) as
    | { id: number; nombre: string; correo: string; rol: string; hash: string; version: number }
    | undefined;

  // Mismo mensaje para correo inexistente y contraseña incorrecta
  if (!usuario || !bcrypt.compareSync(datos.data.password, usuario.hash)) {
    return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  }

  emitirSesion(res, usuario.id, usuario.version);
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