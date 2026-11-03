import { Router } from "express";
import { autenticar, requiereRol } from "../middleware/auth";
import { listarColaTecnico } from "../services/ticket.service";

const router = Router();

router.get("/cola", autenticar, requiereRol("tecnico"), async (req, res) => {
  res.json({ tickets: await listarColaTecnico(req.usuario!.id) });
});

export default router;