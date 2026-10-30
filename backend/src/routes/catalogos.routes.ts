import { Router } from "express";
import { db } from "../db/connection";
import { autenticar } from "../middleware/auth";

const router = Router();

router.get("/", autenticar, (_req, res) => {
  const categorias = db.prepare("SELECT id, nombre FROM categorias WHERE activo = 1 ORDER BY nombre").all();
  const sedes = db.prepare("SELECT id, nombre FROM sedes WHERE activo = 1 ORDER BY nombre").all();
  res.json({ categorias, sedes });
});

export default router;