import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config";
import { ErrorNegocio } from "./core/errores";
import authRoutes from "./routes/auth.routes";
import catalogosRoutes from "./routes/catalogos.routes";
import managerRoutes from "./routes/manager.routes";
import tecnicoRoutes from "./routes/tecnico.routes";
import ticketsRoutes from "./routes/tickets.routes";

export const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/catalogos", catalogosRoutes);
app.use("/api/tickets", ticketsRoutes);
app.use("/api/tecnico", tecnicoRoutes);
app.use("/api/manager", managerRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ErrorNegocio) {
    return res.status(err.estado).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});