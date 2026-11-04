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

async function grupoParaRol(rol: Rol, grupoId: number | null): Promise<number | null> {
  if (rol !== "tecnico" || !grupoId) return null;
  const grupo = await uno("SELECT id FROM grupos_tecnicos WHERE id = ? AND activo = TRUE", [grupoId]);
  if (!grupo) throw new ErrorNegocio("Seleccione un grupo válido.");
  return grupoId;
}

interface FilaUsuario {
  id: number;
  nombre: string;
  telefono: string;
  rol: Rol;
  regionId: number | null;
  grupoId: number | null;
  activo: boolean;
}

router.get("/usuarios", async (_req, res) => {
  const usuarios = await consultar(
    `SELECT u.id, u.nombre, u.correo, u.telefono, u.rol, u.region_id, r.nombre AS region,
            u.grupo_id, g.nombre AS grupo, u.activo
       FROM usuarios u
       LEFT JOIN regiones r ON r.id = u.region_id
       LEFT JOIN grupos_tecnicos g ON g.id = u.grupo_id
      ORDER BY u.activo DESC, u.nombre`,
  );
  const regiones = await consultar("SELECT id, nombre FROM regiones WHERE activo = TRUE ORDER BY nombre");
  const grupos = await consultar("SELECT id, nombre FROM grupos_tecnicos WHERE activo = TRUE ORDER BY nombre");
  res.json({ usuarios, regiones, grupos });
});

const nuevoUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre.").max(120),
  correo: z.string().trim().toLowerCase().email("Escriba un correo válido."),
  telefono: z.string().trim().max(30).default(""),
  password: passwordSchema,
  rol: z.enum(ROLES, { message: "Seleccione un rol." }),
  regionId: z.number().int().positive().nullable().default(null),
  grupoId: z.number().int().positive().nullable().default(null),
});

router.post("/usuarios", async (req, res) => {
  const d = validar(nuevoUsuarioSchema, req.body);
  const regionId = await regionParaRol(d.rol, d.regionId);
  const grupoId = await grupoParaRol(d.rol, d.grupoId);
  const hash = await bcrypt.hash(d.password, 10);

  const id = await transaccion(async () => {
    const nuevoId = await insertar(
      "INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, region_id, grupo_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [d.nombre, d.correo, d.telefono, hash, d.rol, regionId, grupoId],
    );
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: nuevoId,
      evento: "usuario_creado",
      despues: { correo: d.correo, rol: d.rol, regionId, grupoId },
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
  grupoId: z.number().int().positive().nullable().default(null),
  activo: z.boolean(),
});

router.patch("/usuarios/:id", async (req, res) => {
  const d = validar(editarUsuarioSchema, req.body);
  const id = Number(req.params.id);
  const actual = await uno<FilaUsuario>(
    "SELECT id, nombre, telefono, rol, region_id, grupo_id, activo FROM usuarios WHERE id = ?",
    [id],
  );
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
  const grupoId = await grupoParaRol(d.rol, d.grupoId);
  await transaccion(async () => {
    await ejecutar(
      `UPDATE usuarios
          SET nombre = ?, telefono = ?, rol = ?, region_id = ?, grupo_id = ?, activo = ?,
              sesion_version = sesion_version + ?
        WHERE id = ?`,
      [d.nombre, d.telefono, d.rol, regionId, grupoId, d.activo, d.rol !== actual.rol ? 1 : 0, id],
    );
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: id,
      evento: "usuario_modificado",
      antes: { nombre: actual.nombre, rol: actual.rol, regionId: actual.regionId, grupoId: actual.grupoId, activo: actual.activo },
      despues: { nombre: d.nombre, rol: d.rol, regionId, grupoId, activo: d.activo },
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

interface ConfigCatalogo {
  tabla: string;
  padre?: { columna: string; tabla: string; mensaje: string };
  fijo?: { columna: string; valor: string };
}

const CATALOGOS: Record<string, ConfigCatalogo> = {
  regiones: { tabla: "regiones" },
  sedes: { tabla: "sedes", padre: { columna: "region_id", tabla: "regiones", mensaje: "Seleccione una región válida." } },
  categorias: { tabla: "categorias" },
  subcategorias: {
    tabla: "subcategorias",
    padre: { columna: "categoria_id", tabla: "categorias", mensaje: "Seleccione una categoría válida." },
  },
  grupos: { tabla: "grupos_tecnicos" },
  "motivos-espera": { tabla: "motivos", fijo: { columna: "tipo", valor: "espera" } },
  "motivos-cancelacion": { tabla: "motivos", fijo: { columna: "tipo", valor: "cancelacion" } },
  "motivos-cierre": { tabla: "motivos", fijo: { columna: "tipo", valor: "cierre" } },
};

function configDe(tipo: string): ConfigCatalogo {
  if (!Object.hasOwn(CATALOGOS, tipo)) throw new ErrorNegocio("Catálogo no encontrado.", 404);
  return CATALOGOS[tipo];
}

router.get("/catalogos", async (_req, res) => {
  const resultado: Record<string, unknown[]> = {};
  for (const [clave, c] of Object.entries(CATALOGOS)) {
    const columnasPadre = c.padre ? `, x.${c.padre.columna} AS padre_id, p.nombre AS padre` : "";
    const unirPadre = c.padre ? `LEFT JOIN ${c.padre.tabla} p ON p.id = x.${c.padre.columna}` : "";
    const donde = c.fijo ? `WHERE x.${c.fijo.columna} = ?` : "";
    resultado[clave] = await consultar(
      `SELECT x.id, x.nombre, x.activo${columnasPadre} FROM ${c.tabla} x ${unirPadre} ${donde} ORDER BY x.nombre`,
      c.fijo ? [c.fijo.valor] : [],
    );
  }
  res.json(resultado);
});

const nuevoCatalogoSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba un nombre.").max(120),
  padreId: z.number().int().positive().optional(),
});

router.post("/catalogos/:tipo", async (req, res) => {
  const tipo = String(req.params.tipo);
  const c = configDe(tipo);
  const { nombre, padreId } = validar(nuevoCatalogoSchema, req.body);

  const id = await transaccion(async () => {
    const columnas = ["nombre"];
    const valores: unknown[] = [nombre];
    if (c.padre) {
      const existe = padreId ? await uno(`SELECT id FROM ${c.padre.tabla} WHERE id = ? AND activo = TRUE`, [padreId]) : undefined;
      if (!existe) throw new ErrorNegocio(c.padre.mensaje);
      columnas.push(c.padre.columna);
      valores.push(padreId);
    }
    if (c.fijo) {
      columnas.push(c.fijo.columna);
      valores.push(c.fijo.valor);
    }
    const nuevoId = await insertar(
      `INSERT INTO ${c.tabla} (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
      valores,
    );
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: `catalogo_${tipo}`,
      entidadId: nuevoId,
      evento: "catalogo_creado",
      despues: { nombre, padreId: padreId ?? null },
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
  const tipo = String(req.params.tipo);
  const c = configDe(tipo);
  const cambios = validar(cambioCatalogoSchema, req.body);
  const id = Number(req.params.id);

  const filtroFijo = c.fijo ? ` AND ${c.fijo.columna} = ?` : "";
  const actual = await uno<{ nombre: string; activo: boolean }>(
    `SELECT nombre, activo FROM ${c.tabla} WHERE id = ?${filtroFijo}`,
    c.fijo ? [id, c.fijo.valor] : [id],
  );
  if (!actual) throw new ErrorNegocio("Elemento no encontrado.", 404);

  const nombre = cambios.nombre ?? actual.nombre;
  const activo = cambios.activo ?? actual.activo;

  await transaccion(async () => {
    await ejecutar(`UPDATE ${c.tabla} SET nombre = ?, activo = ? WHERE id = ?`, [nombre, activo, id]);
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