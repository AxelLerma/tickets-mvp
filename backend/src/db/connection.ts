import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import pg from "pg";
import { config } from "../config";

const leerFecha = pg.types.getTypeParser(1184, "text");
pg.types.setTypeParser(1184, (valor: string) => (leerFecha(valor) as Date).toISOString());
pg.types.setTypeParser(20, (valor: string) => Number(valor));

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const transaccionActual = new AsyncLocalStorage<pg.PoolClient>();

function aCamel(clave: string): string {
  return clave.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function mapear<T>(fila: Record<string, unknown>): T {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(fila)) salida[aCamel(clave)] = valor;
  return salida as T;
}

function numerar(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

function correr(sql: string, parametros: unknown[]) {
  const texto = numerar(sql);
  const cliente = transaccionActual.getStore();
  return cliente ? cliente.query(texto, parametros) : pool.query(texto, parametros);
}

export async function consultar<T>(sql: string, parametros: unknown[] = []): Promise<T[]> {
  const resultado = await correr(sql, parametros);
  return resultado.rows.map((fila) => mapear<T>(fila));
}

export async function uno<T>(sql: string, parametros: unknown[] = []): Promise<T | undefined> {
  return (await consultar<T>(sql, parametros))[0];
}

export async function ejecutar(sql: string, parametros: unknown[] = []): Promise<number> {
  const resultado = await correr(sql, parametros);
  return resultado.rowCount ?? 0;
}

export async function insertar(sql: string, parametros: unknown[] = []): Promise<number> {
  const resultado = await correr(`${sql} RETURNING id`, parametros);
  return resultado.rows[0].id as number;
}

export async function transaccion<T>(trabajo: () => Promise<T>): Promise<T> {
  if (transaccionActual.getStore()) return trabajo();
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await transaccionActual.run(cliente, trabajo);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

export async function iniciarEsquema(): Promise<void> {
  const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
}

export async function cerrarConexion(): Promise<void> {
  await pool.end();
}