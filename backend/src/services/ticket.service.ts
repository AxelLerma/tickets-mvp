import { config } from "../config";
import { ErrorNegocio } from "../core/errores";
import {
  ESTADOS,
  HORAS_OBJETIVO,
  PRIORIDAD_POR_IMPACTO,
  SQL_ESTADOS_ABIERTOS,
  type Impacto,
} from "../core/estados";
import { consultar, ejecutar, insertar, transaccion, uno } from "../db/connection";
import type { UsuarioSesion } from "../middleware/auth";
import { tecnicoParaRegion } from "./asignacion.service";
import { registrarEvento } from "./bitacora.service";

export interface NuevoTicket {
  titulo: string;
  categoriaId: number;
  sedeId: number;
  area: string;
  equipoActivo: string;
  descripcion: string;
  impacto: Impacto;
}

export interface TicketVista {
  id: number;
  folio: string;
  titulo: string;
  area: string;
  equipoActivo: string | null;
  descripcion: string;
  impacto: Impacto;
  prioridad: "baja" | "normal" | "alta";
  estado: string;
  creadoEn: string;
  asignadoEn: string | null;
  fechaObjetivo: string;
  categoria: string;
  sede: string;
  reportante: string;
  reportanteId: number;
  tecnico: string | null;
  tecnicoId: number | null;
}

const SELECT_TICKET = `
  SELECT t.id, t.folio, t.titulo, t.area, t.equipo_activo, t.descripcion,
         t.impacto, t.prioridad, t.estado, t.creado_en, t.asignado_en,
         t.fecha_objetivo, t.reportante_id, t.tecnico_id,
         c.nombre AS categoria, s.nombre AS sede, r.nombre AS reportante, tec.nombre AS tecnico
    FROM tickets t
    JOIN categorias c ON c.id = t.categoria_id
    JOIN sedes s ON s.id = t.sede_id
    JOIN usuarios r ON r.id = t.reportante_id
    LEFT JOIN usuarios tec ON tec.id = t.tecnico_id`;

const ORDEN_PRIORIDAD = `CASE t.prioridad WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`;

export async function crearTicket(reportanteId: number, datos: NuevoTicket): Promise<TicketVista> {
  const id = await transaccion(async () => {
    await uno("SELECT pg_advisory_xact_lock(?)", [reportanteId]);

    const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString();
    const previos = await uno<{ ultimo: string | null; enLaHora: number | null }>(
      `SELECT MAX(creado_en) AS ultimo,
              SUM(CASE WHEN creado_en > ? THEN 1 ELSE 0 END) AS en_la_hora
         FROM tickets WHERE reportante_id = ?`,
      [haceUnaHora, reportanteId],
    );

    if (previos?.ultimo) {
      const faltan = Math.ceil(config.ticketCooldownSeg - (Date.now() - new Date(previos.ultimo).getTime()) / 1000);
      if (faltan > 0) {
        throw new ErrorNegocio(`Su reporte anterior se acaba de registrar. Espere ${faltan} segundos para enviar otro.`, 429);
      }
    }
    if ((previos?.enLaHora ?? 0) >= config.ticketsPorHora) {
      throw new ErrorNegocio(
        `Alcanzó el máximo de ${config.ticketsPorHora} reportes por hora. Si es urgente, comuníquese con la coordinación.`,
        429,
      );
    }

    const sede = await uno<{ regionId: number }>("SELECT region_id FROM sedes WHERE id = ? AND activo = TRUE", [datos.sedeId]);
    const categoria = await uno("SELECT id FROM categorias WHERE id = ? AND activo = TRUE", [datos.categoriaId]);
    if (!sede || !categoria) throw new ErrorNegocio("Seleccione una categoría y una sede válidas.");

    const ahora = new Date();
    const prioridad = PRIORIDAD_POR_IMPACTO[datos.impacto];
    const objetivo = new Date(ahora.getTime() + HORAS_OBJETIVO[prioridad] * 3_600_000);

    const nuevoId = await insertar(
      `INSERT INTO tickets
         (titulo, categoria_id, sede_id, area, equipo_activo, descripcion, impacto,
          prioridad, estado, reportante_id, creado_en, fecha_objetivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.titulo,
        datos.categoriaId,
        datos.sedeId,
        datos.area,
        datos.equipoActivo || null,
        datos.descripcion,
        datos.impacto,
        prioridad,
        ESTADOS.NUEVO,
        reportanteId,
        ahora.toISOString(),
        objetivo.toISOString(),
      ],
    );

    const folio = `TCK-${ahora.getUTCFullYear()}-${String(nuevoId).padStart(5, "0")}`;
    await ejecutar("UPDATE tickets SET folio = ? WHERE id = ?", [folio, nuevoId]);

    await registrarEvento({
      usuarioId: reportanteId,
      entidad: "ticket",
      entidadId: nuevoId,
      evento: "creacion",
      despues: { folio, estado: ESTADOS.NUEVO, prioridad },
    });

    const tecnico = await tecnicoParaRegion(sede.regionId);
    if (tecnico) {
      await ejecutar("UPDATE tickets SET tecnico_id = ?, estado = ?, asignado_en = ? WHERE id = ?", [
        tecnico.id,
        ESTADOS.ASIGNADO,
        new Date().toISOString(),
        nuevoId,
      ]);
      await registrarEvento({
        usuarioId: null,
        entidad: "ticket",
        entidadId: nuevoId,
        evento: "asignacion_automatica",
        antes: { estado: ESTADOS.NUEVO, tecnicoId: null },
        despues: { estado: ESTADOS.ASIGNADO, tecnicoId: tecnico.id },
        comentario: `Asignado por región a ${tecnico.nombre}`,
      });
    }

    return nuevoId;
  });

  return (await obtenerPorId(id))!;
}

export function obtenerPorId(id: number): Promise<TicketVista | undefined> {
  return uno<TicketVista>(`${SELECT_TICKET} WHERE t.id = ?`, [id]);
}

export function listarDelReportante(reportanteId: number): Promise<TicketVista[]> {
  return consultar<TicketVista>(`${SELECT_TICKET} WHERE t.reportante_id = ? ORDER BY t.creado_en DESC`, [reportanteId]);
}

export function listarColaTecnico(tecnicoId: number): Promise<TicketVista[]> {
  return consultar<TicketVista>(
    `${SELECT_TICKET}
      WHERE t.tecnico_id = ? AND t.estado IN (${SQL_ESTADOS_ABIERTOS})
      ORDER BY ${ORDEN_PRIORIDAD}, t.fecha_objetivo`,
    [tecnicoId],
  );
}

export function puedeVer(usuario: UsuarioSesion, ticket: TicketVista): boolean {
  if (usuario.rol === "manager") return true;
  if (usuario.rol === "tecnico") return ticket.tecnicoId === usuario.id;
  return ticket.reportanteId === usuario.id;
}

export async function resumenDashboard() {
  const tickets = await consultar<TicketVista>(
    `${SELECT_TICKET} WHERE t.estado IN (${SQL_ESTADOS_ABIERTOS}) ORDER BY t.fecha_objetivo`,
  );

  const ahora = new Date().toISOString();
  const totales = {
    abiertos: tickets.length,
    sinAsignar: tickets.filter((t) => t.estado === ESTADOS.NUEVO).length,
    vencidos: tickets.filter((t) => t.fechaObjetivo < ahora).length,
  };

  const carga = await consultar(
    `SELECT u.id, u.nombre, r.nombre AS region, COUNT(t.id) AS activos
       FROM usuarios u
       LEFT JOIN regiones r ON r.id = u.region_id
       LEFT JOIN tickets t ON t.tecnico_id = u.id AND t.estado IN (${SQL_ESTADOS_ABIERTOS})
      WHERE u.rol = 'tecnico' AND u.activo = TRUE
      GROUP BY u.id, u.nombre, r.nombre
      ORDER BY u.nombre`,
  );

  return { totales, carga, tickets };
}