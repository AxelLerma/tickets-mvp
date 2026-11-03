import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { ErrorNegocio } from "../core/errores";
import { SQL_ESTADOS_ABIERTOS } from "../core/estados";
import { consultar, ejecutar, insertar, transaccion, uno } from "../db/connection";
import { autenticar, emitirSesion, requiereRol, type Rol } from "../middleware/auth";
import { registrarEvento } from "../services/bitacora.service";

const router = Router();
router.use(autenticar, requiereRol("admin"));

const ROLES = ["reportante", "tecnico", "manager", "admin"] as const;

const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72, "La contraseña no puede exceder 72 caracteres.");

function validar<T extends z.ZodType>(esquema: T, cuerpo: unknown): z.infer<T> {
  const r = esquema.safeParse(cuerpo);
  if (!r.success) throw new ErrorNegocio(r.error.issues[0].message);
  return r.data;
}

async function regionParaRol(rol: Rol, regionId: number | null): Promise<number | null> {
  if (rol !== "tecnico") return null;
  const region = regionId ? await uno("SELECT id FROM regiones WHERE id = ? AND activo = TRUE", [regionId]) : undefined;
  if (!region) throw new ErrorNegocio("Seleccione la región del técnico.");
  return regionId;
}

interface FilaUsuario {
  id: number;
  nombre: string;
  telefono: string;
  rol: Rol;
  regionId: number | null;
  activo: boolean;
}

router.get("/usuarios", async (_req, res) => {
  const usuarios = await consultar(
    `SELECT u.id, u.nombre, u.correo, u.telefono, u.rol, u.region_id,
            r.nombre AS region, u.activo
       FROM usuarios u LEFT JOIN regiones r ON r.id = u.region_id
      ORDER BY u.activo DESC, u.nombre`,
  );
  const regiones = await consultar("SELECT id, nombre FROM regiones WHERE activo = TRUE ORDER BY nombre");
  res.json({ usuarios, regiones });
});

const nuevoUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre.").max(120),
  correo: z.string().trim().toLowerCase().email("Escriba un correo válido."),
  telefono: z.string().trim().max(30).default(""),
  password: passwordSchema,
  rol: z.enum(ROLES, { message: "Seleccione un rol." }),
  regionId: z.number().int().positive().nullable().default(null),
});

router.post("/usuarios", async (req, res) => {
  const d = validar(nuevoUsuarioSchema, req.body);
  const regionId = await regionParaRol(d.rol, d.regionId);
  const hash = await bcrypt.hash(d.password, 10);

  const id = await transaccion(async () => {
    const nuevoId = await insertar(
      "INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, region_id) VALUES (?, ?, ?, ?, ?, ?)",
      [d.nombre, d.correo, d.telefono, hash, d.rol, regionId],
    );
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: nuevoId,
      evento: "usuario_creado",
      despues: { correo: d.correo, rol: d.rol, regionId },
    });
    return nuevoId;
  });

  res.status(201).json({ id });
});

const editarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre.").max(120),
  telefono: z.string().trim().max(30).default(""),
  rol: z.enum(ROLES, { message: "Seleccione un rol." }),
  regionId: z.number().int().positive().nullable().default(null),
  activo: z.boolean(),
});

router.patch("/usuarios/:id", async (req, res) => {
  const d = validar(editarUsuarioSchema, req.body);
  const id = Number(req.params.id);
  const actual = await uno<FilaUsuario>("SELECT id, nombre, telefono, rol, region_id, activo FROM usuarios WHERE id = ?", [id]);
  if (!actual) throw new ErrorNegocio("Usuario no encontrado.", 404);

  const cambiaAcceso = d.rol !== actual.rol || !d.activo;
  if (id === req.usuario!.id && cambiaAcceso) {
    throw new ErrorNegocio("No puede cambiar su propio rol ni desactivar su propia cuenta.");
  }
  if (actual.rol === "tecnico" && cambiaAcceso) {
    const abiertos = await uno<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tickets WHERE tecnico_id = ? AND estado IN (${SQL_ESTADOS_ABIERTOS})`,
      [id],
    );
    if ((abiertos?.n ?? 0) > 0) {
      throw new ErrorNegocio(
        `Este técnico tiene ${abiertos!.n} ticket(s) abierto(s). Reasígnelos antes de desactivarlo o cambiar su rol.`,
      );
    }
  }

  const regionId = await regionParaRol(d.rol, d.regionId);
  await transaccion(async () => {
    await ejecutar(
      `UPDATE usuarios
          SET nombre = ?, telefono = ?, rol = ?, region_id = ?, activo = ?,
              sesion_version = sesion_version + ?
        WHERE id = ?`,
      [d.nombre, d.telefono, d.rol, regionId, d.activo, d.rol !== actual.rol ? 1 : 0, id],
    );
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: id,
      evento: "usuario_modificado",
      antes: { nombre: actual.nombre, rol: actual.rol, regionId: actual.regionId, activo: actual.activo },
      despues: { nombre: d.nombre, rol: d.rol, regionId, activo: d.activo },
    });
  });

  res.json({ ok: true });
});

router.post("/usuarios/:id/password", async (req, res) => {
  const { password } = validar(z.object({ password: passwordSchema }), req.body);
  const id = Number(req.params.id);
  const existe = await uno("SELECT id FROM usuarios WHERE id = ?", [id]);
  if (!existe) throw new ErrorNegocio("Usuario no encontrado.", 404);

  const hash = await bcrypt.hash(password, 10);
  const version = await transaccion(async () => {
    await ejecutar("UPDATE usuarios SET password_hash = ?, sesion_version = sesion_version + 1 WHERE id = ?", [hash, id]);
    await registrarEvento({ usuarioId: req.usuario!.id, entidad: "usuario", entidadId: id, evento: "password_restablecida" });
    const fila = await uno<{ v: number }>("SELECT sesion_version AS v FROM usuarios WHERE id = ?", [id]);
    return fila!.v;
  });

  if (id === req.usuario!.id) emitirSesion(res, id, version);
  res.json({ ok: true });
});

const TABLAS = { regiones: "regiones", sedes: "sedes", categorias: "categorias" } as const;
type Tipo = keyof typeof TABLAS;

function esTipo(valor: string): valor is Tipo {
  return Object.hasOwn(TABLAS, valor);
}

router.get("/catalogos", async (_req, res) => {
  res.json({
    regiones: await consultar("SELECT id, nombre, activo FROM regiones ORDER BY nombre"),
    sedes: await consultar(
      `SELECT s.id, s.nombre, s.activo, s.region_id, r.nombre AS region
         FROM sedes s JOIN regiones r ON r.id = s.region_id ORDER BY s.nombre`,
    ),
    categorias: await consultar("SELECT id, nombre, activo FROM categorias ORDER BY nombre"),
  });
});

const nuevoCatalogoSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba un nombre.").max(120),
  regionId: z.number().int().positive("Seleccione una región.").optional(),
});

router.post("/catalogos/:tipo", async (req, res) => {
  const tipo = req.params.tipo;
  if (!esTipo(tipo)) throw new ErrorNegocio("Catálogo no encontrado.", 404);

  const { nombre, regionId } = validar(nuevoCatalogoSchema, req.body);

  const id = await transaccion(async () => {
    let nuevoId: number;
    if (tipo === "sedes") {
      if (!regionId || !(await uno("SELECT id FROM regiones WHERE id = ? AND activo = TRUE", [regionId]))) {
        throw new ErrorNegocio("Seleccione una región válida.");
      }
      nuevoId = await insertar("INSERT INTO sedes (nombre, region_id) VALUES (?, ?)", [nombre, regionId]);
    } else {
      nuevoId = await insertar(`INSERT INTO ${TABLAS[tipo]} (nombre) VALUES (?)`, [nombre]);
    }
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: `catalogo_${tipo}`,
      entidadId: nuevoId,
      evento: "catalogo_creado",
      despues: { nombre, regionId: regionId ?? null },
    });
    return nuevoId;
  });

  res.status(201).json({ id });
});

const cambioCatalogoSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba un nombre.").max(120).optional(),
  activo: z.boolean().optional(),
});

router.patch("/catalogos/:tipo/:id", async (req, res) => {
  const tipo = req.params.tipo;
  if (!esTipo(tipo)) throw new ErrorNegocio("Catálogo no encontrado.", 404);

  const cambios = validar(cambioCatalogoSchema, req.body);
  const id = Number(req.params.id);
  const tabla = TABLAS[tipo];
  const actual = await uno<{ nombre: string; activo: boolean }>(`SELECT nombre, activo FROM ${tabla} WHERE id = ?`, [id]);
  if (!actual) throw new ErrorNegocio("Elemento no encontrado.", 404);

  const nombre = cambios.nombre ?? actual.nombre;
  const activo = cambios.activo ?? actual.activo;

  await transaccion(async () => {
    await ejecutar(`UPDATE ${tabla} SET nombre = ?, activo = ? WHERE id = ?`, [nombre, activo, id]);
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: `catalogo_${tipo}`,
      entidadId: id,
      evento: "catalogo_modificado",
      antes: { nombre: actual.nombre, activo: actual.activo },
      despues: { nombre, activo },
    });
  });

  res.json({ ok: true });
});

export default router;