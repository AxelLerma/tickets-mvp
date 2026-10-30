import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { config } from "../config";

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function iniciarEsquema(): void {
  const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  db.exec(sql);
}