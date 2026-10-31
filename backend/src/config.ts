import "dotenv/config";
import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "cambia-esto-en-produccion",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  dbPath: process.env.DB_PATH ?? "tickets.db",
  produccion: process.env.NODE_ENV === "production",
  storageDir: path.resolve(process.env.STORAGE_DIR ?? "storage"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 100),
};