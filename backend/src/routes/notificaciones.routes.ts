import { Router } from "express";
import { consultar, ejecutar, uno } from "../db/connection";
import { autenticar } from "../middleware/auth";

const router = Router();
router.use(autenticar);

router.get("/", async (req, res) => {
  const notificaciones = await consultar(
    `SELECT id, ticket_id, tipo, titulo, mensaje, creada_en, leida_en
       FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 30`,
    [req.usuario!.id],
  );
  const sinLeer = await uno<{ n: number }>(
    "SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND leida_en IS NULL",
    [req.usuario!.id],
  );
  res.json({ notificaciones, sinLeer: sinLeer?.n ?? 0 });
});

router.post("/leer-todas", async (req, res) => {
  await ejecutar("UPDATE notificaciones SET leida_en = ? WHERE usuario_id = ? AND leida_en IS NULL", [
    new Date().toISOString(),
    req.usuario!.id,
  ]);
  res.json({ ok: true });
});

router.post("/:id/leer", async (req, res) => {
  await ejecutar("UPDATE notificaciones SET leida_en = ? WHERE id = ? AND usuario_id = ? AND leida_en IS NULL", [
    new Date().toISOString(),
    Number(req.params.id),
    req.usuario!.id,
  ]);
  res.json({ ok: true });
});

export default router;