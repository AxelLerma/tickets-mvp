import { consultar, ejecutar, uno } from "../db/connection";

interface EventoTicket {
  usuarioId: number | null;
  entidadId: number;
  evento: string;
  antes?: unknown;
  despues?: unknown;
  comentario?: string;
}

interface Aviso {
  usuarioId: number;
  tipo: string;
  titulo: string;
  mensaje: string;
}

type Datos = Record<string, string | undefined>;

async function coordinadores(): Promise<number[]> {
  const filas = await consultar<{ id: number }>("SELECT id FROM usuarios WHERE rol = 'manager' AND activo = TRUE");
  return filas.map((f) => f.id);
}

export async function notificarEvento(e: EventoTicket): Promise<void> {
  const t = await uno<{ folio: string; titulo: string; reportanteId: number; tecnicoId: number | null }>(
    "SELECT folio, titulo, reportante_id, tecnico_id FROM tickets WHERE id = ?",
    [e.entidadId],
  );
  if (!t) return;

  const antes = (e.antes ?? {}) as Datos & { tecnicoId?: number };
  const despues = (e.despues ?? {}) as Datos & { tecnicoId?: number };
  const avisos: Aviso[] = [];
  const para = (destinos: (number | null | undefined)[], tipo: string, titulo: string, mensaje: string) => {
    for (const usuarioId of new Set(destinos)) {
      if (usuarioId && usuarioId !== e.usuarioId) avisos.push({ usuarioId, tipo, titulo, mensaje });
    }
  };

  switch (e.evento) {
    case "creacion":
      para([t.reportanteId], "creacion", `Reporte ${t.folio} registrado`, `Su reporte "${t.titulo}" fue registrado correctamente.`);
      para(await coordinadores(), "creacion", `Nuevo reporte ${t.folio}`, `Se registró un nuevo reporte: "${t.titulo}".`);
      break;
    case "asignacion_automatica":
    case "asignacion_manual":
    case "reasignacion": {
      const asignado = despues.tecnicoId ?? null;
      const tecnico = asignado ? await uno<{ nombre: string }>("SELECT nombre FROM usuarios WHERE id = ?", [asignado]) : undefined;
      para([asignado], "asignacion", `Ticket ${t.folio} asignado a usted`, `Se le asignó el ticket "${t.titulo}".`);
      para(
        [t.reportanteId],
        "asignacion",
        `Su reporte ${t.folio} tiene responsable`,
        `${tecnico?.nombre ?? "Un técnico"} atenderá su reporte "${t.titulo}".`,
      );
      break;
    }
    case "espera_iniciada":
      para(
        [t.reportanteId],
        "pregunta",
        `Se requiere información en ${t.folio}`,
        `El técnico necesita información sobre "${t.titulo}": ${e.comentario ?? ""}`,
      );
      break;
    case "cambio_prioridad":
      para(
        [t.tecnicoId, t.reportanteId],
        "prioridad",
        `Cambió la prioridad de ${t.folio}`,
        `La prioridad de "${t.titulo}" cambió de ${antes.prioridad ?? "—"} a ${despues.prioridad ?? "—"}.`,
      );
      break;
    case "cierre":
      para(
        [t.reportanteId],
        "cierre",
        `Su reporte ${t.folio} fue atendido`,
        `El ticket "${t.titulo}" se cerró. Si el problema continúa, puede reabrirlo durante 48 horas.`,
      );
      break;
    case "reapertura":
      para(
        [t.tecnicoId, ...(await coordinadores())],
        "reapertura",
        `Ticket ${t.folio} reabierto`,
        `El ticket "${t.titulo}" fue reabierto. Motivo: ${e.comentario ?? "no indicado"}.`,
      );
      break;
    case "cancelacion":
      para(
        [t.reportanteId, t.tecnicoId],
        "cancelacion",
        `Ticket ${t.folio} cancelado`,
        `El ticket "${t.titulo}" fue cancelado. Motivo: ${e.comentario ?? "no indicado"}.`,
      );
      break;
  }

  const ahora = new Date().toISOString();
  for (const a of avisos) {
    await ejecutar(
      "INSERT INTO notificaciones (usuario_id, ticket_id, tipo, titulo, mensaje, creada_en) VALUES (?, ?, ?, ?, ?, ?)",
      [a.usuarioId, e.entidadId, a.tipo, a.titulo, a.mensaje, ahora],
    );
  }
}