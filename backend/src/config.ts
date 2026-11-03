import "dotenv/config";
import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "cambia-esto-en-produccion",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/tickets",
  produccion: process.env.NODE_ENV === "production",
  storageDir: path.resolve(process.env.STORAGE_DIR ?? "storage"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 100),
  ticketCooldownSeg: Number(process.env.TICKET_COOLDOWN_SEG ?? 30),
  ticketsPorHora: Number(process.env.TICKETS_POR_HORA ?? 10),
  capacidadBalanceado: Number(process.env.CAPACIDAD_BALANCEADO ?? 6),
  capacidadSaturado: Number(process.env.CAPACIDAD_SATURADO ?? 12),
};