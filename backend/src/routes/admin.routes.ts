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
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72, "La contraseña no puede exceder 72 caracteres.").optional(),
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
  let incrementoVersion = d.rol !== actual.rol ? 1 : 0;
  await transaccion(async () => {
    const setCampos = [
      "nombre = ?",
      "telefono = ?",
      "rol = ?",
      "region_id = ?",
      "grupo_id = ?",
      "activo = ?",
    ];
    const valores: unknown[] = [d.nombre, d.telefono, d.rol, regionId, grupoId, d.activo];
    if (d.password) {
      const hash = await bcrypt.hash(d.password, 10);
      setCampos.push("password_hash = ?");
      valores.push(hash);
      incrementoVersion = 1;
    }
    setCampos.push("sesion_version = sesion_version + ?");
    valores.push(incrementoVersion);
    valores.push(id);
    await ejecutar(`UPDATE usuarios SET ${setCampos.join(", ")} WHERE id = ?`, valores);
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: id,
      evento: d.password ? "password_restablecida" : "usuario_modificado",
      antes: { nombre: actual.nombre, rol: actual.rol, regionId: actual.regionId, grupoId: actual.grupoId, activo: actual.activo },
      despues: { nombre: d.nombre, rol: d.rol, regionId, grupoId, activo: d.activo, password: !!d.password },
    });
  });

  res.json({ ok: true });
});

router.delete("/usuarios/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario!.id) throw new ErrorNegocio("No puede eliminar su propio usuario.", 403);

  const actual = await uno<{ id: number; nombre: string; correo: string; rol: Rol }>(
    "SELECT id, nombre, correo, rol FROM usuarios WHERE id = ?",
    [id],
  );
  if (!actual) throw new ErrorNegocio("Usuario no encontrado.", 404);

  await transaccion(async () => {
    await ejecutar("SELECT set_config('app.bypass_inmutabilidad', '1', true)");

    const ticketsReportante = await consultar<{ id: number }>("SELECT id FROM tickets WHERE reportante_id = ?", [id]);
    const ticketIds = ticketsReportante.map((t) => t.id);

    if (actual.rol === "reportante" && ticketIds.length > 0) {
      const idsLista = ticketIds.join(", ");
      await ejecutar(`DELETE FROM notificaciones WHERE ticket_id IN (${idsLista})`);
      await ejecutar(`DELETE FROM ticket_relaciones WHERE ticket_id IN (${idsLista}) OR relacionado_id IN (${idsLista})`);
      await ejecutar(`DELETE FROM ticket_esperas WHERE ticket_id IN (${idsLista})`);
      await ejecutar(`DELETE FROM ticket_comentarios WHERE ticket_id IN (${idsLista})`);
      await ejecutar(`DELETE FROM ticket_troubleshooting WHERE ticket_id IN (${idsLista})`);
      await ejecutar(`DELETE FROM ticket_evidencias WHERE ticket_id IN (${idsLista})`);
      await ejecutar(`DELETE FROM ticket_intervencion WHERE ticket_id IN (${idsLista})`);
      await ejecutar(`DELETE FROM bitacora_auditoria WHERE entidad = 'ticket' AND entidad_id IN (${idsLista})`);
      await ejecutar(`DELETE FROM tickets WHERE id IN (${idsLista})`);
    }

    if (actual.rol === "tecnico") {
      const ticketsTecnico = await consultar<{
        id: number; folio: string; titulo: string; cerrado_en: string | null;
      }>("SELECT id, folio, titulo, cerrado_en FROM tickets WHERE tecnico_id = ? AND estado <> 'cancelado'", [id]);
      for (const t of ticketsTecnico) {
        await ejecutar(
          `UPDATE tickets SET estado = 'reabierto', tecnico_id = NULL, reabierto_en = NOW() WHERE id = ?`,
          [t.id],
        );
        await ejecutar(
          `UPDATE ticket_intervencion SET que_se_hizo = NULL, como_se_dejo = NULL, motivo_cierre_id = NULL WHERE ticket_id = ?`,
          [t.id],
        );
        await ejecutar(
          `INSERT INTO ticket_comentarios (ticket_id, usuario_id, texto, tipo, creado_en) VALUES (?, NULL, ?, 'sistema', NOW())`,
          [t.id, "Ticket reabierto automáticamente por eliminación del perfil del técnico asignado"],
        );
        await registrarEvento({
          usuarioId: null,
          entidad: "ticket",
          entidadId: t.id,
          evento: "reapertura",
          comentario: "Ticket reabierto automáticamente por eliminación del perfil del técnico asignado",
        });
      }
    }

    await ejecutar("DELETE FROM notificaciones WHERE usuario_id = ?", [id]);
    await ejecutar("UPDATE bitacora_auditoria SET usuario_id = NULL WHERE usuario_id = ?", [id]);
    await ejecutar("UPDATE ticket_comentarios SET usuario_id = NULL WHERE usuario_id = ?", [id]);
    await ejecutar("UPDATE ticket_esperas SET usuario_id = NULL WHERE usuario_id = ?", [id]);
    await ejecutar("UPDATE ticket_troubleshooting SET tecnico_id = NULL WHERE tecnico_id = ?", [id]);
    await ejecutar("UPDATE ticket_evidencias SET subido_por_id = NULL WHERE subido_por_id = ?", [id]);
    await ejecutar("UPDATE ticket_relaciones SET creada_por = NULL WHERE creada_por = ?", [id]);

    await ejecutar("DELETE FROM usuarios WHERE id = ?", [id]);
    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: "usuario",
      entidadId: id,
      evento: "usuario_eliminado",
      despues: { nombre: actual.nombre, correo: actual.correo, rol: actual.rol },
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
    const donde = c.fijo ? `WHERE x.${c.fijo.columna} = ?` : "WHERE";
    const clausulaOculto = c.fijo ? ` AND x.oculto = FALSE` : ` x.oculto = FALSE`;
    resultado[clave] = await consultar(
      `SELECT x.id, x.nombre, x.activo${columnasPadre} FROM ${c.tabla} x ${unirPadre} ${donde}${clausulaOculto} ORDER BY x.nombre`,
      c.fijo ? [c.fijo.valor] : [],
    );
  }
  res.json(resultado);
});

router.delete("/catalogos/:tipo/:id", async (req, res) => {
  const tipo = String(req.params.tipo);
  const c = configDe(tipo);
  const id = Number(req.params.id);

  const actual = await uno<{ nombre: string }>(`SELECT nombre FROM ${c.tabla} WHERE id = ?`, [id]);
  if (!actual) throw new ErrorNegocio("Elemento no encontrado.", 404);

  await transaccion(async () => {
    let tieneReferencias = false;

    if (tipo === "regiones") {
      const [usuariosRef, sedesRef] = await Promise.all([
        uno<{ n: number }>("SELECT COUNT(*) AS n FROM usuarios WHERE region_id = ?", [id]),
        uno<{ n: number }>("SELECT COUNT(*) AS n FROM sedes WHERE region_id = ?", [id]),
      ]);
      if ((usuariosRef!.n ?? 0) > 0 || (sedesRef!.n ?? 0) > 0) tieneReferencias = true;
      if (tieneReferencias) {
        await ejecutar("UPDATE usuarios SET region_id = NULL WHERE region_id = ?", [id]);
        await ejecutar("UPDATE sedes SET activo = FALSE, oculto = TRUE WHERE region_id = ?", [id]);
      }
    } else if (tipo === "grupos") {
      const ref = await uno<{ n: number }>("SELECT COUNT(*) AS n FROM usuarios WHERE grupo_id = ?", [id]);
      if ((ref!.n ?? 0) > 0) tieneReferencias = true;
      if (tieneReferencias) {
        await ejecutar("UPDATE usuarios SET grupo_id = NULL WHERE grupo_id = ?", [id]);
      }
    } else if (tipo === "categorias") {
      const ref = await uno<{ n: number }>("SELECT COUNT(*) AS n FROM tickets WHERE categoria_id = ?", [id]);
      const subs = await uno<{ n: number }>("SELECT COUNT(*) AS n FROM subcategorias WHERE categoria_id = ?", [id]);
      if ((ref!.n ?? 0) > 0 || (subs!.n ?? 0) > 0) tieneReferencias = true;
      if (tieneReferencias) {
        await ejecutar("UPDATE subcategorias SET oculto = TRUE WHERE categoria_id = ?", [id]);
      }
    } else if (tipo === "sedes") {
      const ref = await uno<{ n: number }>("SELECT COUNT(*) AS n FROM tickets WHERE sede_id = ?", [id]);
      if ((ref!.n ?? 0) > 0) tieneReferencias = true;
    } else if (tipo === "subcategorias") {
      const ref = await uno<{ n: number }>("SELECT COUNT(*) AS n FROM tickets WHERE subcategoria_id = ?", [id]);
      if ((ref!.n ?? 0) > 0) tieneReferencias = true;
    } else if (tipo.startsWith("motivos-")) {
      const ref = await uno<{ n: number }>("SELECT COUNT(*) AS n FROM ticket_esperas WHERE motivo_id = ?", [id]);
      const ref2 = await uno<{ n: number }>("SELECT COUNT(*) AS n FROM ticket_intervencion WHERE motivo_cierre_id = ?", [id]);
      if ((ref!.n ?? 0) > 0 || (ref2!.n ?? 0) > 0) tieneReferencias = true;
    }

    if (tieneReferencias) {
      await ejecutar(`UPDATE ${c.tabla} SET activo = FALSE, oculto = TRUE WHERE id = ?`, [id]);
    } else {
      await ejecutar(`DELETE FROM ${c.tabla} WHERE id = ?`, [id]);
    }

    await registrarEvento({
      usuarioId: req.usuario!.id,
      entidad: `catalogo_${tipo}`,
      entidadId: id,
      evento: "catalogo_eliminado",
      despues: { nombre: actual.nombre, oculto: tieneReferencias },
    });
  });

  res.json({ ok: true });
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