import { db } from "../db/connection";

interface EventoAuditoria {
  usuarioId: number | null;
  entidad: string;
  entidadId: number;
  evento: string;
  antes?: unknown;
  despues?: unknown;
  comentario?: string;
}

export function registrarEvento(e: EventoAuditoria): void {
  db.prepare(
    `INSERT INTO bitacora_auditoria
       (fecha, usuario_id, entidad, entidad_id, evento, valor_anterior, valor_nuevo, comentario)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    e.usuarioId,
    e.entidad,
    e.entidadId,
    e.evento,
    e.antes ? JSON.stringify(e.antes) : null,
    e.despues ? JSON.stringify(e.despues) : null,
    e.comentario ?? null,
  );
}