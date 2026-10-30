import { Router } from "express";
import { autenticar, requiereRol } from "../middleware/auth";
import { resumenDashboard } from "../services/ticket.service";

const router = Router();

router.get("/dashboard", autenticar, requiereRol("manager", "admin"), (_req, res) => {
  res.json(resumenDashboard());
});

export default router;