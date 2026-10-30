import { Router } from "express";
import { z } from "zod";
import { autenticar, requiereRol } from "../middleware/auth";
import { crearTicket, listarDelReportante, obtenerPorId, puedeVer } from "../services/ticket.service";

const router = Router();
router.use(autenticar);

const nuevoTicketSchema = z.object({
  titulo: z.string().trim().min(1, "Escribe un título corto para identificar el problema.").max(120),
  categoriaId: z.number().int().positive("Selecciona una categoría."),
  sedeId: z.number().int().positive("Selecciona una sede."),
  area: z.string().trim().min(1, "Indica el área o zona.").max(100),
  equipoActivo: z.string().trim().max(120).default(""),
  descripcion: z.string().trim().min(1, "Cuéntanos qué ocurre y desde cuándo.").max(4000),
  impacto: z.enum(["solo_yo", "varias_personas", "operacion_detenida"], {
    message: "Indica a quién afecta el problema.",
  }),
});

router.post("/", requiereRol("reportante"), (req, res) => {
  const datos = nuevoTicketSchema.safeParse(req.body);
  if (!datos.success) {
    return res.status(400).json({ error: datos.error.issues[0].message });
  }
  const ticket = crearTicket(req.usuario!.id, datos.data);
  res.status(201).json({ ticket });
});

// Debe ir antes de "/:id" para que "mios" no se interprete como un id
router.get("/mios", requiereRol("reportante"), (req, res) => {
  res.json({ tickets: listarDelReportante(req.usuario!.id) });
});

router.get("/:id", (req, res) => {
  const ticket = obtenerPorId(Number(req.params.id));
  // 404 y no 403: no se revela que el ticket de otra persona existe
  if (!ticket || !puedeVer(req.usuario!, ticket)) {
    return res.status(404).json({ error: "Ticket no encontrado." });
  }
  res.json({ ticket });
});

export default router;