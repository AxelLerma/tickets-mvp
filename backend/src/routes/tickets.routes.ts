import { Router } from "express";
import { z } from "zod";
import { ErrorNegocio } from "../core/errores";
import { autenticar, requiereRol } from "../middleware/auth";
import {
  cancelarTicket,
  cerrarTicket,
  comentar,
  guardarDatosCierre,
  iniciarAtencion,
  obtenerDetalle,
  reabrirTicket,
  reanudarAtencion,
  registrarPaso,
  solicitarInformacion,
} from "../services/atencion.service";
import { desvincular, relacionadosDe, vincular } from "../services/relacion.service";
import { crearTicket, listarDelReportante } from "../services/ticket.service";

const router = Router();
router.use(autenticar);

function validar<T extends z.ZodType>(esquema: T, cuerpo: unknown): z.infer<T> {
  const r = esquema.safeParse(cuerpo);
  if (!r.success) throw new ErrorNegocio(r.error.issues[0].message);
  return r.data;
}

const idDe = (req: { params: Record<string, string | string[] | undefined> }) => Number(req.params.id);

const nuevoTicketSchema = z.object({
  titulo: z.string().trim().min(1, "Escriba un título corto para identificar el problema.").max(120),
  categoriaId: z.number().int().positive("Seleccione una categoría."),
  subcategoriaId: z.number().int().positive().nullable().default(null),
  sedeId: z.number().int().positive("Seleccione una sede."),
  area: z.string().trim().min(1, "Indique el área o zona.").max(100),
  pisoZona: z.string().trim().max(100).default(""),
  equipoActivo: z.string().trim().max(120).default(""),
  descripcion: z.string().trim().min(1, "Cuéntenos qué ocurre y desde cuándo.").max(4000),
  impacto: z.enum(["solo_yo", "varias_personas", "operacion_detenida"], { message: "Indique a quién afecta el problema." }),
  relacionadoId: z.number().int().positive().nullable().default(null),
});

const iniciarSchema = z.object({ comoSeEncontro: z.string().trim().max(4000).default("") });
const pasoSchema = z.object({
  descripcion: z.string().trim().min(1, "Describa el paso realizado.").max(2000),
  resultado: z.string().trim().min(1, "Indique el resultado del paso.").max(2000),
  minutos: z
    .number({ message: "Indique los minutos dedicados." })
    .int("Indique los minutos como número entero.")
    .min(1, "Registre al menos 1 minuto.")
    .max(1440, "El tiempo máximo por paso es de 24 horas."),
});
const motivoIdSchema = z
  .number({ message: "Seleccione un motivo." })
  .int("Seleccione un motivo.")
  .positive("Seleccione un motivo.");
const esperaSchema = z.object({ motivoId: motivoIdSchema, detalle: z.string().trim().max(1000).default("") });
const cancelarSchema = z.object({ motivoId: motivoIdSchema, detalle: z.string().trim().max(1000).default("") });
const cierreSchema = z.object({
  queSeHizo: z.string().trim().max(4000).default(""),
  comoSeDejo: z.string().trim().max(4000).default(""),
  materiales: z.string().trim().max(1000).default(""),
  motivoCierreId: z.number().int().positive().nullable().default(null),
});
const motivoSchema = z.object({ motivo: z.string().trim().min(5, "Escriba el motivo (mínimo 5 caracteres).").max(1000) });
const comentarioSchema = z.object({ texto: z.string().trim().min(1, "Escriba un comentario.").max(2000) });
const vincularSchema = z.object({ folio: z.string().trim().min(1, "Escriba el folio del ticket.").max(30) });

router.post("/", requiereRol("reportante"), async (req, res) => {
  const ticket = await crearTicket(req.usuario!.id, validar(nuevoTicketSchema, req.body));
  res.status(201).json({ ticket });
});

router.get("/mios", requiereRol("reportante"), async (req, res) => {
  res.json({ tickets: await listarDelReportante(req.usuario!.id) });
});

router.get("/:id", async (req, res) => {
  res.json(await obtenerDetalle(req.usuario!, idDe(req)));
});

router.post("/:id/iniciar", requiereRol("tecnico"), async (req, res) => {
  await iniciarAtencion(req.usuario!, idDe(req), validar(iniciarSchema, req.body).comoSeEncontro);
  res.json({ ok: true });
});

router.post("/:id/pasos", requiereRol("tecnico"), async (req, res) => {
  await registrarPaso(req.usuario!, idDe(req), validar(pasoSchema, req.body));
  res.status(201).json({ ok: true });
});

router.post("/:id/espera", requiereRol("tecnico"), async (req, res) => {
  const d = validar(esperaSchema, req.body);
  await solicitarInformacion(req.usuario!, idDe(req), d.motivoId, d.detalle);
  res.json({ ok: true });
});

router.post("/:id/espera/terminar", requiereRol("tecnico"), async (req, res) => {
  await reanudarAtencion(req.usuario!, idDe(req));
  res.json({ ok: true });
});

router.put("/:id/cierre", requiereRol("tecnico"), async (req, res) => {
  await guardarDatosCierre(req.usuario!, idDe(req), validar(cierreSchema, req.body));
  res.json({ ok: true });
});

router.post("/:id/cerrar", requiereRol("tecnico"), async (req, res) => {
  await cerrarTicket(req.usuario!, idDe(req));
  res.json({ ok: true });
});

router.post("/:id/reabrir", requiereRol("reportante", "manager"), async (req, res) => {
  await reabrirTicket(req.usuario!, idDe(req), validar(motivoSchema, req.body).motivo);
  res.json({ ok: true });
});

router.post("/:id/cancelar", requiereRol("manager"), async (req, res) => {
  const d = validar(cancelarSchema, req.body);
  await cancelarTicket(req.usuario!, idDe(req), d.motivoId, d.detalle);
  res.json({ ok: true });
});

router.post("/:id/comentarios", requiereRol("reportante", "tecnico", "manager"), async (req, res) => {
  await comentar(req.usuario!, idDe(req), validar(comentarioSchema, req.body).texto);
  res.status(201).json({ ok: true });
});

router.get("/:id/relacionados", requiereRol("tecnico", "manager"), async (req, res) => {
  res.json(await relacionadosDe(req.usuario!, idDe(req)));
});

router.post("/:id/relacionados", requiereRol("tecnico", "manager"), async (req, res) => {
  await vincular(req.usuario!, idDe(req), validar(vincularSchema, req.body).folio);
  res.status(201).json({ ok: true });
});

router.delete("/:id/relacionados/:otroId", requiereRol("manager"), async (req, res) => {
  await desvincular(req.usuario!, idDe(req), Number(req.params.otroId));
  res.json({ ok: true });
});

export default router;