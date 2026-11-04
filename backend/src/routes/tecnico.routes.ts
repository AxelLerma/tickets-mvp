import { Router } from "express";
import { autenticar, requiereRol } from "../middleware/auth";
import { listarColaTecnico, listarGrupo } from "../services/ticket.service";

const router = Router();

router.get("/cola", autenticar, requiereRol("tecnico"), async (req, res) => {
  const usuario = req.usuario!;
  const tickets = await listarColaTecnico(usuario.id);
  const grupo = usuario.grupoId != null ? await listarGrupo(usuario.id, usuario.grupoId) : [];
  res.json({ tickets, grupo });
});

export default router;