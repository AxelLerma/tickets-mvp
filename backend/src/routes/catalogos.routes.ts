import { Router } from "express";
import { consultar } from "../db/connection";
import { autenticar } from "../middleware/auth";

const router = Router();

router.get("/", autenticar, async (_req, res) => {
  const categorias = await consultar("SELECT id, nombre FROM categorias WHERE activo = TRUE ORDER BY nombre");
  const sedes = await consultar("SELECT id, nombre FROM sedes WHERE activo = TRUE ORDER BY nombre");
  const subcategorias = await consultar(
    "SELECT id, categoria_id, nombre FROM subcategorias WHERE activo = TRUE ORDER BY nombre",
  );
  const motivos = await consultar<{ id: number; tipo: string; nombre: string }>(
    "SELECT id, tipo, nombre FROM motivos WHERE activo = TRUE ORDER BY nombre",
  );
  const porTipo = (tipo: string) => motivos.filter((m) => m.tipo === tipo).map((m) => ({ id: m.id, nombre: m.nombre }));

  res.json({
    categorias,
    sedes,
    subcategorias,
    motivos: { espera: porTipo("espera"), cancelacion: porTipo("cancelacion"), cierre: porTipo("cierre") },
  });
});

export default router;