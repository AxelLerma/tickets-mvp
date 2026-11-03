import { SQL_ESTADOS_ABIERTOS } from "../core/estados";
import { uno } from "../db/connection";

export async function tecnicoParaRegion(regionId: number): Promise<{ id: number; nombre: string } | undefined> {
  return uno<{ id: number; nombre: string }>(
    `SELECT u.id, u.nombre
       FROM usuarios u
       LEFT JOIN tickets t ON t.tecnico_id = u.id AND t.estado IN (${SQL_ESTADOS_ABIERTOS})
      WHERE u.rol = 'tecnico' AND u.activo = TRUE AND u.region_id = ?
      GROUP BY u.id, u.nombre
      ORDER BY COUNT(t.id), u.id
      LIMIT 1`,
    [regionId],
  );
}