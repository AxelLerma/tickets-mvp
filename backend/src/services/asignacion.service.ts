import { SQL_ESTADOS_ABIERTOS } from "../core/estados";
import { db } from "../db/connection";

/** Técnico activo de la región con menos tickets abiertos. */
export function tecnicoParaRegion(regionId: number): { id: number; nombre: string } | undefined {
  return db
    .prepare(
      `SELECT u.id, u.nombre
         FROM usuarios u
         LEFT JOIN tickets t ON t.tecnico_id = u.id AND t.estado IN (${SQL_ESTADOS_ABIERTOS})
        WHERE u.rol = 'tecnico' AND u.activo = 1 AND u.region_id = ?
        GROUP BY u.id
        ORDER BY COUNT(t.id), u.id
        LIMIT 1`,
    )
    .get(regionId) as { id: number; nombre: string } | undefined;
}