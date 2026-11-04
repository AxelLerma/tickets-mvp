import { ejecutar } from "../db/connection";
import { notificarEvento } from "./notificacion.service";

interface EventoAuditoria {
  usuarioId: number | null;
  entidad: string;
  entidadId: number;
  evento: string;
  antes?: unknown;
  despues?: unknown;
  comentario?: string;
}

export async function registrarEvento(e: EventoAuditoria): Promise<void> {
  await ejecutar(
    `INSERT INTO bitacora_auditoria
       (fecha, usuario_id, entidad, entidad_id, evento, valor_anterior, valor_nuevo, comentario)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)`,
    [
      new Date().toISOString(),
      e.usuarioId,
      e.entidad,
      e.entidadId,
      e.evento,
      e.antes ? JSON.stringify(e.antes) : null,
      e.despues ? JSON.stringify(e.despues) : null,
      e.comentario ?? null,
    ],
  );
  if (e.entidad === "ticket") await notificarEvento(e);
}