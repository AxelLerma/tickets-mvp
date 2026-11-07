import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { ErrorNegocio } from "../core/errores";
import { consultar, uno, insertar } from "../db/connection";
import { autenticar, emitirSesion } from "../middleware/auth";

const recuperarSchema = z.object({ correo: z.string().trim().toLowerCase().email("Escriba un correo válido.") });

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

router.post("/recuperar", async (req, res) => {
  const { correo } = validarRecuperar(req.body);
  const usuario = await uno<{ id: number; nombre: string; correo: string; rol: string }>(
    "SELECT id, nombre, correo, rol FROM usuarios WHERE correo = ? AND activo = TRUE",
    [correo],
  );
  if (!usuario) {
    res.json({ ok: true });
    return;
  }

  const admins = await consultar<{ id: number }>("SELECT id FROM usuarios WHERE rol IN ('admin', 'manager') AND activo = TRUE");
  const ahora = new Date().toISOString();
  for (const a of admins) {
    if (a.id === usuario.id) continue;
    await insertar(
      "INSERT INTO notificaciones (usuario_id, ticket_id, tipo, titulo, mensaje, creada_en) VALUES (?, NULL, 'recuperacion', ?, ?, ?)",
      [
        a.id,
        "Solicitud de recuperación de contraseña",
        `El usuario ${usuario.nombre} (${usuario.correo}) solicita restablecer su contraseña.`,
        ahora,
      ],
    );
  }

  res.json({ ok: true });
});

function validarRecuperar(cuerpo: unknown) {
  const r = recuperarSchema.safeParse(cuerpo);
  if (!r.success) throw new ErrorNegocio(r.error.issues[0].message);
  return r.data;
}

export default router;