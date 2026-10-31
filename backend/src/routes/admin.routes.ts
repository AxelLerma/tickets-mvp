import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { ErrorNegocio } from "../core/errores";
import { SQL_ESTADOS_ABIERTOS } from "../core/estados";
import { db } from "../db/connection";
import { autenticar, emitirSesion, requiereRol, type Rol } from "../middleware/auth";
import { registrarEvento } from "../services/bitacora.service";

const router = Router();
router.use(autenticar, requiereRol("admin"));

const ROLES = ["reportante", "tecnico", "manager", "admin"] as const;

const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72, "La contraseña no puede exceder 72 caracteres.");

/** La región solo aplica a técnicos (se usa para la asignación automática). */
function regionParaRol(rol: Rol, regionId: number | null): number | null {
  if (rol !== "tecnico") return null;
  const region = regionId && db.prepare("SELECT id FROM regiones WHERE id = ? AND activo = 1").get(regionId);
  if (!region) throw new ErrorNegocio("Seleccione la región del técnico.");
  return regionId;
}

interface FilaUsuario {
  id: number;
  nombre: string;
  telefono: string;
  rol: Rol;
  region_id: number | null;
  activo: number;
}

// ---------- Usuarios ----------

router.get("/usuarios", (_req, res) => {
  const filas = db
    .prepare(
      `SELECT u.id, u.nombre, u.correo, u.telefono, u.rol, u.region_id AS regionId,
              r.nombre AS region, u.activo
         FROM usuarios u LEFT JOIN regiones r ON r.id = u.region_id
        ORDER BY u.activo DESC, u.nombre`,
    )
    .all() as { activo: number }[];
  const regiones = db.prepare("SELECT id, nombre FROM regiones WHERE activo = 1 ORDER BY nombre").all();
  res.json({ usuarios: filas.map((u) => ({ ...u, activo: u.activo === 1 })), regiones });
});

const nuevoUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre.").max(120),
  correo: z.string().trim().toLowerCase().email("Escriba un correo válido."),
  telefono: z.string().trim().max(30).default(""),
  password: passwordSchema,
  rol: z.enum(ROLES, { message: "Seleccione un rol." }),
  regionId: z.number().int().positive().nullable().default(null),
});

router.post("/usuarios", (req, res) => {
  const datos = nuevoUsuarioSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ error: datos.error.issues[0].message });
  }
  const d = datos.data;
  const regionId = regionParaRol(d.rol, d.regionId);

  const id = db.transaction(() => {
    const r = db
      .prepare(
        "INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, region_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(d.nombre, d.correo, d.telefono, bcrypt.hashSync(d.password, 10), d.rol, regionId);
    const nuevoId = Number(r.lastInsertRowid);
    registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: nuevoId,
      evento: "usuario_creado",
      despues: { correo: d.correo, rol: d.rol, regionId },
    });
    return nuevoId;
  })();

  res.status(201).json({ id });
});

const editarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre.").max(120),
  telefono: z.string().trim().max(30).default(""),
  rol: z.enum(ROLES, { message: "Seleccione un rol." }),
  regionId: z.number().int().positive().nullable().default(null),
  activo: z.boolean(),
});

router.patch("/usuarios/:id", (req, res) => {
  const datos = editarUsuarioSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ error: datos.error.issues[0].message });
  }
  const d = datos.data;
  const id = Number(req.params.id);
  const actual = db
    .prepare("SELECT id, nombre, telefono, rol, region_id, activo FROM usuarios WHERE id = ?")
    .get(id) as FilaUsuario | undefined;
  if (!actual) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  const cambiaAcceso = d.rol !== actual.rol || !d.activo;
  if (id === req.usuario!.id && cambiaAcceso) {
    throw new ErrorNegocio("No puede cambiar su propio rol ni desactivar su propia cuenta.");
  }
  if (actual.rol === "tecnico" && cambiaAcceso) {
    const abiertos = db
      .prepare(`SELECT COUNT(*) AS n FROM tickets WHERE tecnico_id = ? AND estado IN (${SQL_ESTADOS_ABIERTOS})`)
      .get(id) as { n: number };
    if (abiertos.n > 0) {
      throw new ErrorNegocio(
        `Este técnico tiene ${abiertos.n} ticket(s) abierto(s). Reasígnelos antes de desactivarlo o cambiar su rol.`,
      );
    }
  }

  const regionId = regionParaRol(d.rol, d.regionId);
  db.transaction(() => {
    db.prepare(
      `UPDATE usuarios
          SET nombre = ?, telefono = ?, rol = ?, region_id = ?, activo = ?,
              sesion_version = sesion_version + ?
        WHERE id = ?`,
    ).run(d.nombre, d.telefono, d.rol, regionId, d.activo ? 1 : 0, d.rol !== actual.rol ? 1 : 0, id);

    registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: id,
      evento: "usuario_modificado",
      antes: { nombre: actual.nombre, rol: actual.rol, regionId: actual.region_id, activo: actual.activo === 1 },
      despues: { nombre: d.nombre, rol: d.rol, regionId, activo: d.activo },
    });
  })();

  res.json({ ok: true });
});

router.post("/usuarios/:id/password", (req, res) => {
  const datos = z.object({ password: passwordSchema }).safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ error: datos.error.issues[0].message });
  }
  const id = Number(req.params.id);
  const existe = db.prepare("SELECT id FROM usuarios WHERE id = ?").get(id);
  if (!existe) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  const version = db.transaction(() => {
    db.prepare("UPDATE usuarios SET password_hash = ?, sesion_version = sesion_version + 1 WHERE id = ?").run(
      bcrypt.hashSync(datos.data.password, 10),
      id,
    );
    // Nunca se registra la contraseña, solo el hecho de que se restableció.
    registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: id,
      evento: "password_restablecida",
    });
    return (db.prepare("SELECT sesion_version AS v FROM usuarios WHERE id = ?").get(id) as { v: number }).v;
  })();

  // Si el administrador cambió la suya, se renueva su sesión para no sacarlo.
  if (id === req.usuario!.id) emitirSesion(res, id, version);
  res.json({ ok: true });
});

// ---------- Catálogos (solo se desactivan, nunca se borran) ----------

const TABLAS = { regiones: "regiones", sedes: "sedes", categorias: "categorias" } as const;
type Tipo = keyof typeof TABLAS;

function esTipo(valor: string): valor is Tipo {
  return Object.hasOwn(TABLAS, valor);
}

router.get("/catalogos", (_req, res) => {
  const conEstado = <T extends { activo: number }>(filas: T[]) =>
    filas.map((f) => ({ ...f, activo: f.activo === 1 }));

  res.json({
    regiones: conEstado(db.prepare("SELECT id, nombre, activo FROM regiones ORDER BY nombre").all() as { activo: number }[]),
    sedes: conEstado(
      db
        .prepare(
          `SELECT s.id, s.nombre, s.activo, s.region_id AS regionId, r.nombre AS region
             FROM sedes s JOIN regiones r ON r.id = s.region_id ORDER BY s.nombre`,
        )
        .all() as { activo: number }[],
    ),
    categorias: conEstado(db.prepare("SELECT id, nombre, activo FROM categorias ORDER BY nombre").all() as { activo: number }[]),
  });
});

const nuevoCatalogoSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba un nombre.").max(120),
  regionId: z.number().int().positive("Seleccione una región.").optional(),
});

router.post("/catalogos/:tipo", (req, res) => {
  const tipo = req.params.tipo;
  if (!esTipo(tipo)) return res.status(404).json({ error: "Catálogo no encontrado." });

  const datos = nuevoCatalogoSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ error: datos.error.issues[0].message });
  }
  const { nombre, regionId } = datos.data;

  const id = db.transaction(() => {
    let resultado;
    if (tipo === "sedes") {
      if (!regionId || !db.prepare("SELECT id FROM regiones WHERE id = ? AND activo = 1").get(regionId)) {
        throw new ErrorNegocio("Seleccione una región válida.");
      }
      resultado = db.prepare("INSERT INTO sedes (nombre, region_id) VALUES (?, ?)").run(nombre, regionId);
    } else {
      resultado = db.prepare(`INSERT INTO ${TABLAS[tipo]} (nombre) VALUES (?)`).run(nombre);
    }
    const nuevoId = Number(resultado.lastInsertRowid);
    registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: `catalogo_${tipo}`,
      entidadId: nuevoId,
      evento: "catalogo_creado",
      despues: { nombre, regionId: regionId ?? null },
    });
    return nuevoId;
  })();

  res.status(201).json({ id });
});

const cambioCatalogoSchema = z.object({
  nombre: z.string().trim().min(1, "Escriba un nombre.").max(120).optional(),
  activo: z.boolean().optional(),
});

router.patch("/catalogos/:tipo/:id", (req, res) => {
  const tipo = req.params.tipo;
  if (!esTipo(tipo)) return res.status(404).json({ error: "Catálogo no encontrado." });

  const datos = cambioCatalogoSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ error: datos.error.issues[0].message });
  }
  const id = Number(req.params.id);
  const tabla = TABLAS[tipo]; // viene de una lista fija, no del usuario
  const actual = db.prepare(`SELECT nombre, activo FROM ${tabla} WHERE id = ?`).get(id) as
    | { nombre: string; activo: number }
    | undefined;
  if (!actual) return res.status(404).json({ error: "Elemento no encontrado." });

  const nombre = datos.data.nombre ?? actual.nombre;
  const activo = datos.data.activo ?? actual.activo === 1;

  db.transaction(() => {
    db.prepare(`UPDATE ${tabla} SET nombre = ?, activo = ? WHERE id = ?`).run(nombre, activo ? 1 : 0, id);
    registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: `catalogo_${tipo}`,
      entidadId: id,
      evento: "catalogo_modificado",
      antes: { nombre: actual.nombre, activo: actual.activo === 1 },
      despues: { nombre, activo },
    });
  })();

  res.json({ ok: true });
});

export default router;