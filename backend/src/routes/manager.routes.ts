import { Router } from "express";
import { z } from "zod";
import { ErrorNegocio } from "../core/errores";
import { ESTADOS, SQL_ESTADOS_ABIERTOS } from "../core/estados";
import { consultar, uno } from "../db/connection";
import { autenticar, requiereRol } from "../middleware/auth";
import { cambiarPrioridad, panelGestion, reasignarTickets } from "../services/gestion.service";

const router = Router();
router.use(autenticar, requiereRol("manager"));

function validar<T extends z.ZodType>(esquema: T, cuerpo: unknown): z.infer<T> {
  const r = esquema.safeParse(cuerpo);
  if (!r.success) throw new ErrorNegocio(r.error.issues[0].message);
  return r.data;
}

const reasignarSchema = z.object({
  ticketIds: z.array(z.number().int().positive()).min(1, "Seleccione al menos un ticket.").max(50, "Seleccione máximo 50 tickets a la vez."),
  tecnicoId: z.number({ message: "Seleccione un técnico." }).int().positive("Seleccione un técnico."),
  comentario: z.string().trim().max(500).default(""),
});

const prioridadSchema = z.object({
  prioridad: z.enum(["baja", "normal", "alta"], { message: "Seleccione una prioridad válida." }),
  comentario: z.string().trim().max(500).default(""),
});

router.get("/dashboard", async (req, res) => {
  const dias = [7, 30, 90].includes(Number(req.query.dias)) ? Number(req.query.dias) : 30;
  res.json(await panelGestion(dias));
});

router.post("/reasignar", async (req, res) => {
  const d = validar(reasignarSchema, req.body);
  const reasignados = await reasignarTickets(req.usuario!, d.ticketIds, d.tecnicoId, d.comentario);
  res.json({ reasignados });
});

router.patch("/tickets/:id/prioridad", async (req, res) => {
  const d = validar(prioridadSchema, req.body);
  await cambiarPrioridad(req.usuario!, Number(req.params.id), d.prioridad, d.comentario);
  res.json({ ok: true });
});

router.get("/tickets", async (req, res) => {
  const estado = String(req.query.estado ?? "cerrado");
  const sedeId = Number(req.query.sedeId) || null;
  const tecnicoId = Number(req.query.tecnicoId) || null;
  const texto = String(req.query.q ?? "").trim().slice(0, 100);

  const condiciones: string[] = [];
  const parametros: (string | number)[] = [];

  if (estado === "abiertos") {
    condiciones.push(`t.estado IN (${SQL_ESTADOS_ABIERTOS})`);
  } else if (estado !== "todos") {
    if (!(Object.values(ESTADOS) as string[]).includes(estado)) throw new ErrorNegocio("Estado no válido.");
    condiciones.push("t.estado = ?");
    parametros.push(estado);
  }
  if (sedeId) {
    condiciones.push("t.sede_id = ?");
    parametros.push(sedeId);
  }
  if (tecnicoId) {
    condiciones.push("t.tecnico_id = ?");
    parametros.push(tecnicoId);
  }
  if (texto) {
    condiciones.push("(t.folio ILIKE ? OR t.titulo ILIKE ?)");
    parametros.push(`%${texto}%`, `%${texto}%`);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const tickets = await consultar(
    `SELECT t.id, t.folio, t.titulo, t.estado, t.prioridad, t.creado_en, t.cerrado_en,
            s.nombre AS sede, c.nombre AS categoria, tec.nombre AS tecnico
       FROM tickets t
       JOIN sedes s ON s.id = t.sede_id
       JOIN categorias c ON c.id = t.categoria_id
       LEFT JOIN usuarios tec ON tec.id = t.tecnico_id
       ${donde}
      ORDER BY COALESCE(t.cerrado_en, t.creado_en) DESC
      LIMIT 200`,
    parametros,
  );

  const cierres = async (horas: number) =>
    (await uno<{ n: number }>("SELECT COUNT(*) AS n FROM tickets WHERE cerrado_en >= ?", [new Date(Date.now() - horas * 3_600_000).toISOString()]))?.n ?? 0;

  res.json({
    tickets,
    resumen: { ultimas24h: await cierres(24), ultimos7d: await cierres(24 * 7), ultimos30d: await cierres(24 * 30) },
    sedes: await consultar("SELECT id, nombre FROM sedes ORDER BY nombre"),
    tecnicos: await consultar("SELECT id, nombre FROM usuarios WHERE rol = 'tecnico' ORDER BY nombre"),
  });
});

export default router;