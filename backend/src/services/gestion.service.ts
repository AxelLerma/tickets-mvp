import { config } from "../config";
import { ErrorNegocio } from "../core/errores";
import { ESTADOS, ESTADOS_ABIERTOS, HORAS_OBJETIVO, SQL_ESTADOS_ABIERTOS } from "../core/estados";
import { consultar, ejecutar, transaccion, uno } from "../db/connection";
import type { UsuarioSesion } from "../middleware/auth";
import { registrarEvento } from "./bitacora.service";

export type Prioridad = "baja" | "normal" | "alta";
export type Capacidad = "disponible" | "balanceado" | "saturado";
type Riesgo = "vencido" | "riesgo" | null;

const ZONA = "America/Mexico_City";
const FRACCION_RIESGO = 0.25;
const UMBRAL_CATEGORIA_SEDE = 3;
const UMBRAL_EQUIPO = 2;
const PESO: Record<Prioridad, number> = { alta: 3, normal: 2, baja: 1 };
const ORDEN: Record<Prioridad, number> = { alta: 0, normal: 1, baja: 2 };
const REASIGNABLES: string[] = [ESTADOS.NUEVO, ESTADOS.ASIGNADO, ESTADOS.EN_PROCESO, ESTADOS.REABIERTO];

function riesgoDe(prioridad: Prioridad, fechaObjetivo: string, ahora: number): Riesgo {
  const restante = new Date(fechaObjetivo).getTime() - ahora;
  if (restante < 0) return "vencido";
  if (restante <= HORAS_OBJETIVO[prioridad] * 3_600_000 * FRACCION_RIESGO) return "riesgo";
  return null;
}

function capacidadDe(puntos: number): Capacidad {
  if (puntos >= config.capacidadSaturado) return "saturado";
  if (puntos >= config.capacidadBalanceado) return "balanceado";
  return "disponible";
}

interface FilaTicket {
  id: number;
  folio: string;
  titulo: string;
  estado: string;
  prioridad: Prioridad;
  fechaObjetivo: string;
  tecnicoId: number | null;
  sede: string;
  categoria: string;
  tecnico: string | null;
}

export async function panelGestion(dias: number) {
  const ahora = Date.now();
  const periodos = (await uno<{ hoy: string; semana: string; mes: string }>(
    `SELECT date_trunc('day', NOW() AT TIME ZONE '${ZONA}') AT TIME ZONE '${ZONA}' AS hoy,
            date_trunc('week', NOW() AT TIME ZONE '${ZONA}') AT TIME ZONE '${ZONA}' AS semana,
            date_trunc('month', NOW() AT TIME ZONE '${ZONA}') AT TIME ZONE '${ZONA}' AS mes`,
  ))!;
  const desde = new Date(ahora - dias * 86_400_000).toISOString();

  const filas = await consultar<FilaTicket>(
    `SELECT t.id, t.folio, t.titulo, t.estado, t.prioridad, t.fecha_objetivo, t.tecnico_id,
            s.nombre AS sede, c.nombre AS categoria, tec.nombre AS tecnico
       FROM tickets t
       JOIN sedes s ON s.id = t.sede_id
       JOIN categorias c ON c.id = t.categoria_id
       LEFT JOIN usuarios tec ON tec.id = t.tecnico_id
      WHERE t.estado IN (${SQL_ESTADOS_ABIERTOS})
      ORDER BY t.fecha_objetivo`,
  );
  const tickets = filas
    .map((t) => ({ ...t, riesgo: riesgoDe(t.prioridad, t.fechaObjetivo, ahora) }))
    .sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad] || a.fechaObjetivo.localeCompare(b.fechaObjetivo));

  const tecnicosBase = await consultar<{ id: number; nombre: string; region: string | null }>(
    `SELECT u.id, u.nombre, r.nombre AS region
       FROM usuarios u LEFT JOIN regiones r ON r.id = u.region_id
      WHERE u.rol = 'tecnico' AND u.activo = TRUE ORDER BY u.nombre`,
  );
  const minutos = await consultar<{ tecnicoId: number; minutos: number }>(
    "SELECT tecnico_id, SUM(minutos) AS minutos FROM ticket_troubleshooting WHERE creado_en >= ? GROUP BY tecnico_id",
    [periodos.semana],
  );
  const cierresSemana = await consultar<{ tecnicoId: number; n: number }>(
    "SELECT tecnico_id, COUNT(*) AS n FROM tickets WHERE cerrado_en >= ? AND tecnico_id IS NOT NULL GROUP BY tecnico_id",
    [periodos.semana],
  );

  const tecnicos = tecnicosBase.map((tec) => {
    const propios = tickets.filter((t) => t.tecnicoId === tec.id);
    const puntos = propios.reduce((suma, t) => suma + PESO[t.prioridad], 0);
    const masAlta = propios.length ? propios.reduce((a, t) => (ORDEN[t.prioridad] < ORDEN[a] ? t.prioridad : a), propios[0].prioridad) : null;
    return {
      id: tec.id,
      nombre: tec.nombre,
      region: tec.region,
      activos: propios.length,
      enProceso: propios.filter((t) => t.estado === ESTADOS.EN_PROCESO).length,
      vencidos: propios.filter((t) => t.riesgo === "vencido").length,
      porVencer: propios.filter((t) => t.riesgo === "riesgo").length,
      minutosSemana: minutos.find((m) => m.tecnicoId === tec.id)?.minutos ?? 0,
      cierresSemana: cierresSemana.find((c) => c.tecnicoId === tec.id)?.n ?? 0,
      prioridadMaxima: masAlta,
      puntos,
      capacidad: capacidadDe(puntos),
    };
  });

  const cierresPorTecnico = await consultar(
    `SELECT u.nombre,
            COUNT(*) FILTER (WHERE t.cerrado_en >= ?) AS hoy,
            COUNT(*) FILTER (WHERE t.cerrado_en >= ?) AS semana,
            COUNT(*) AS mes
       FROM tickets t JOIN usuarios u ON u.id = t.tecnico_id
      WHERE t.cerrado_en >= ?
      GROUP BY u.nombre ORDER BY mes DESC, u.nombre`,
    [periodos.hoy, periodos.semana, periodos.mes],
  );
  const cierresPorCategoria = await consultar(
    `SELECT c.nombre,
            COUNT(*) FILTER (WHERE t.cerrado_en >= ?) AS hoy,
            COUNT(*) FILTER (WHERE t.cerrado_en >= ?) AS semana,
            COUNT(*) AS mes
       FROM tickets t JOIN categorias c ON c.id = t.categoria_id
      WHERE t.cerrado_en >= ?
      GROUP BY c.nombre ORDER BY mes DESC, c.nombre`,
    [periodos.hoy, periodos.semana, periodos.mes],
  );

  const reabiertos = await consultar(
    `SELECT t.id, t.folio, t.titulo, t.reabierto_en, c.nombre AS categoria, tec.nombre AS tecnico
       FROM tickets t
       JOIN categorias c ON c.id = t.categoria_id
       LEFT JOIN usuarios tec ON tec.id = t.tecnico_id
      WHERE t.reabierto_en >= ?
      ORDER BY t.reabierto_en DESC LIMIT 20`,
    [desde],
  );

  const repetidosCategoriaSede = await consultar(
    `SELECT c.nombre AS categoria, s.nombre AS sede, COUNT(*) AS total
       FROM tickets t
       JOIN categorias c ON c.id = t.categoria_id
       JOIN sedes s ON s.id = t.sede_id
      WHERE t.creado_en >= ? AND t.estado <> 'cancelado'
      GROUP BY c.nombre, s.nombre
     HAVING COUNT(*) >= ${UMBRAL_CATEGORIA_SEDE}
      ORDER BY total DESC, c.nombre LIMIT 10`,
    [desde],
  );
  const repetidosEquipo = await consultar(
    `SELECT MIN(t.equipo_activo) AS equipo, COUNT(*) AS total
       FROM tickets t
      WHERE t.creado_en >= ? AND t.estado <> 'cancelado'
        AND t.equipo_activo IS NOT NULL AND TRIM(t.equipo_activo) <> ''
      GROUP BY LOWER(TRIM(t.equipo_activo))
     HAVING COUNT(*) >= ${UMBRAL_EQUIPO}
      ORDER BY total DESC LIMIT 10`,
    [desde],
  );

  return {
    periodo: { dias, inicioHoy: periodos.hoy, inicioSemana: periodos.semana, inicioMes: periodos.mes },
    totales: {
      abiertos: tickets.length,
      sinAsignar: tickets.filter((t) => t.estado === ESTADOS.NUEVO).length,
      enRiesgo: tickets.filter((t) => t.riesgo === "riesgo").length,
      vencidos: tickets.filter((t) => t.riesgo === "vencido").length,
      reabiertos: reabiertos.length,
    },
    tickets,
    tecnicos,
    cierres: { porTecnico: cierresPorTecnico, porCategoria: cierresPorCategoria },
    reabiertos,
    repetidos: { categoriaSede: repetidosCategoriaSede, equipos: repetidosEquipo },
  };
}

export async function reasignarTickets(
  usuario: UsuarioSesion,
  ticketIds: number[],
  tecnicoId: number,
  comentario: string,
): Promise<number> {
  const ids = [...new Set(ticketIds)].sort((a, b) => a - b);

  return transaccion(async () => {
    const tecnico = await uno<{ id: number; nombre: string }>(
      "SELECT id, nombre FROM usuarios WHERE id = ? AND rol = 'tecnico' AND activo = TRUE",
      [tecnicoId],
    );
    if (!tecnico) throw new ErrorNegocio("Seleccione un técnico activo.");

    let reasignados = 0;
    for (const id of ids) {
      const t = await uno<{ id: number; folio: string; estado: string; tecnicoId: number | null; tecnico: string | null }>(
        `SELECT t.id, t.folio, t.estado, t.tecnico_id, tec.nombre AS tecnico
           FROM tickets t LEFT JOIN usuarios tec ON tec.id = t.tecnico_id
          WHERE t.id = ? FOR UPDATE OF t`,
        [id],
      );
      if (!t) throw new ErrorNegocio("Uno de los tickets seleccionados no existe.", 404);
      if (!REASIGNABLES.includes(t.estado)) {
        throw new ErrorNegocio(`El ticket ${t.folio} no se puede reasignar en su estado actual.`);
      }
      if (t.tecnicoId === tecnico.id) continue;

      const ahora = new Date().toISOString();
      if (t.estado === ESTADOS.NUEVO) {
        await ejecutar("UPDATE tickets SET tecnico_id = ?, estado = ?, asignado_en = ? WHERE id = ?", [
          tecnico.id,
          ESTADOS.ASIGNADO,
          ahora,
          id,
        ]);
        await registrarEvento({
          usuarioId: usuario.id,
          entidad: "ticket",
          entidadId: id,
          evento: "cambio_estado",
          antes: { estado: ESTADOS.NUEVO },
          despues: { estado: ESTADOS.ASIGNADO },
        });
      } else {
        await ejecutar("UPDATE tickets SET tecnico_id = ?, asignado_en = ? WHERE id = ?", [tecnico.id, ahora, id]);
      }

      await registrarEvento({
        usuarioId: usuario.id,
        entidad: "ticket",
        entidadId: id,
        evento: t.tecnicoId ? "reasignacion" : "asignacion_manual",
        antes: { tecnicoId: t.tecnicoId },
        despues: { tecnicoId: tecnico.id },
        comentario: comentario || `${t.tecnico ?? "Sin asignar"} → ${tecnico.nombre}`,
      });
      await ejecutar(
        "INSERT INTO ticket_comentarios (ticket_id, usuario_id, texto, tipo, creado_en) VALUES (?, NULL, ?, 'sistema', ?)",
        [id, `Atención asignada a ${tecnico.nombre}.`, ahora],
      );
      reasignados++;
    }

    if (reasignados === 0) throw new ErrorNegocio("Los tickets seleccionados ya están asignados a ese técnico.");
    return reasignados;
  });
}

export async function cambiarPrioridad(usuario: UsuarioSesion, ticketId: number, prioridad: Prioridad, comentario: string) {
  await transaccion(async () => {
    const t = await uno<{ estado: string; prioridad: Prioridad; fechaObjetivo: string; base: string }>(
      `SELECT estado, prioridad, fecha_objetivo, COALESCE(reabierto_en, creado_en) AS base
         FROM tickets WHERE id = ? FOR UPDATE`,
      [ticketId],
    );
    if (!t) throw new ErrorNegocio("Ticket no encontrado.", 404);
    if (!(ESTADOS_ABIERTOS as string[]).includes(t.estado)) {
      throw new ErrorNegocio("Solo se puede cambiar la prioridad de tickets abiertos.");
    }
    if (t.prioridad === prioridad) throw new ErrorNegocio("El ticket ya tiene esa prioridad.");

    const objetivo = new Date(new Date(t.base).getTime() + HORAS_OBJETIVO[prioridad] * 3_600_000).toISOString();
    await ejecutar("UPDATE tickets SET prioridad = ?, fecha_objetivo = ? WHERE id = ?", [prioridad, objetivo, ticketId]);
    await registrarEvento({
      usuarioId: usuario.id,
      entidad: "ticket",
      entidadId: ticketId,
      evento: "cambio_prioridad",
      antes: { prioridad: t.prioridad, fechaObjetivo: t.fechaObjetivo },
      despues: { prioridad, fechaObjetivo: objetivo },
      comentario: comentario || undefined,
    });
    await ejecutar(
      "INSERT INTO ticket_comentarios (ticket_id, usuario_id, texto, tipo, creado_en) VALUES (?, NULL, ?, 'sistema', ?)",
      [ticketId, `La prioridad cambió de ${t.prioridad} a ${prioridad}.`, new Date().toISOString()],
    );
  });
}