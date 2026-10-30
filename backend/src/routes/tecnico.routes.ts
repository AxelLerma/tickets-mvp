import { Router } from "express";
import { autenticar, requiereRol } from "../middleware/auth";
import { listarColaTecnico } from "../services/ticket.service";

const router = Router();

router.get("/cola", autenticar, requiereRol("tecnico"), (req, res) => {
  res.json({ tickets: listarColaTecnico(req.usuario!.id) });
});

export default router;