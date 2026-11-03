import { Router } from "express";
import { ErrorNegocio } from "../core/errores";
import { ESTADOS, SQL_ESTADOS_ABIERTOS } from "../core/estados";
import { consultar, uno } from "../db/connection";
import { autenticar, requiereRol } from "../middleware/auth";
import { resumenDashboard } from "../services/ticket.service";

const router = Router();
router.use(autenticar, requiereRol("manager"));

router.get("/dashboard", async (_req, res) => {
  res.json(await resumenDashboard());
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