import { rm } from "node:fs/promises";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config";
import { ErrorNegocio } from "../core/errores";
import { autenticar, requiereRol } from "../middleware/auth";
import { DIR_TMP, guardarEvidencia, localizarEvidencia } from "../services/evidencia.service";

const router = Router();
router.use(autenticar);

// El archivo llega primero a una carpeta temporal; el servicio lo valida y lo mueve.
const subida = multer({ dest: DIR_TMP, limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });

const campos = z.object({
  ticketId: z.coerce.number().int().positive(),
  etapa: z.enum(["inicial_reportante", "inicial_tecnico", "cierre"]),
  reemplazaId: z.coerce.number().int().positive().optional(),
});

router.post("/", requiereRol("reportante", "tecnico"), subida.single("archivo"), async (req, res, next) => {
  try {
    if (!req.file) throw new ErrorNegocio("Seleccione un archivo.");
    const datos = campos.safeParse(req.body);
    if (!datos.success) {
      await rm(req.file.path, { force: true });
      throw new ErrorNegocio("Los datos de la evidencia no son válidos.");
    }
    const id = await guardarEvidencia(req.usuario!, { ...datos.data, archivo: req.file });
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

function enviar(req: Request, res: Response, miniatura: boolean) {
  const ev = localizarEvidencia(req.usuario!, Number(req.params.id), miniatura);
  res.setHeader("Content-Type", ev.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(ev.nombre)}`);
  res.sendFile(ev.ruta, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Archivo no encontrado." });
  });
}

router.get("/:id/archivo", (req, res) => enviar(req, res, false));
router.get("/:id/miniatura", (req, res) => enviar(req, res, true));

export default router;