import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { config } from "./config";
import { ErrorNegocio } from "./core/errores";
import adminRoutes from "./routes/admin.routes";
import authRoutes from "./routes/auth.routes";
import catalogosRoutes from "./routes/catalogos.routes";
import evidenciasRoutes from "./routes/evidencias.routes";
import managerRoutes from "./routes/manager.routes";
import tecnicoRoutes from "./routes/tecnico.routes";
import ticketsRoutes from "./routes/tickets.routes";

export const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/catalogos", catalogosRoutes);
app.use("/api/tickets", ticketsRoutes);
app.use("/api/evidencias", evidenciasRoutes);
app.use("/api/tecnico", tecnicoRoutes);
app.use("/api/manager", managerRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ErrorNegocio) {
    res.status(err.estado).json({ error: err.message });
    return;
  }
  if ((err as { code?: string }).code === "23505") {
    res.status(409).json({ error: "Ya existe un registro con ese nombre o correo." });
    return;
  }
  if (err instanceof multer.MulterError) {
    const demasiadoGrande = err.code === "LIMIT_FILE_SIZE";
    res
      .status(demasiadoGrande ? 413 : 400)
      .json({ error: demasiadoGrande ? `El archivo excede el límite de ${config.maxUploadMb} MB.` : "No fue posible recibir el archivo." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});