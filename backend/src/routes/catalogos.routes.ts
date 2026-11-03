import { Router } from "express";
import { consultar } from "../db/connection";
import { autenticar } from "../middleware/auth";

const router = Router();

router.get("/", autenticar, async (_req, res) => {
  const categorias = await consultar("SELECT id, nombre FROM categorias WHERE activo = TRUE ORDER BY nombre");
  const sedes = await consultar("SELECT id, nombre FROM sedes WHERE activo = TRUE ORDER BY nombre");
  res.json({ categorias, sedes });
});

export default router;