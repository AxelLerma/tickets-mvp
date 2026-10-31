import { ErrorNegocio } from "../core/errores";
import {
  ESTADOS,
  HORAS_OBJETIVO,
  PRIORIDAD_POR_IMPACTO,
  SQL_ESTADOS_ABIERTOS,
  type Impacto,
} from "../core/estados";
import { db } from "../db/connection";
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
  SELECT t.id, t.folio, t.titulo, t.area, t.equipo_activo AS equipoActivo, t.descripcion,
         t.impacto, t.prioridad, t.estado, t.creado_en AS creadoEn, t.asignado_en AS asignadoEn,
         t.fecha_objetivo AS fechaObjetivo, t.reportante_id AS reportanteId, t.tecnico_id AS tecnicoId,
         c.nombre AS categoria, s.nombre AS sede, r.nombre AS reportante, tec.nombre AS tecnico
    FROM tickets t
    JOIN categorias c ON c.id = t.categoria_id
    JOIN sedes s ON s.id = t.sede_id
    JOIN usuarios r ON r.id = t.reportante_id
    LEFT JOIN usuarios tec ON tec.id = t.tecnico_id`;

const ORDEN_PRIORIDAD = `CASE t.prioridad WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`;

export function crearTicket(reportanteId: number, datos: NuevoTicket): TicketVista {
  const ejecutar = db.transaction(() => {
    const sede = db
      .prepare("SELECT region_id AS regionId FROM sedes WHERE id = ? AND activo = 1")
      .get(datos.sedeId) as { regionId: number } | undefined;
    const categoria = db.prepare("SELECT id FROM categorias WHERE id = ? AND activo = 1").get(datos.categoriaId);
    if (!sede || !categoria) {
      throw new ErrorNegocio("Selecciona una categoría y una sede válidas.");
    }

    const ahora = new Date();
    const prioridad = PRIORIDAD_POR_IMPACTO[datos.impacto];
    const objetivo = new Date(ahora.getTime() + HORAS_OBJETIVO[prioridad] * 3_600_000);

    const resultado = db
      .prepare(
        `INSERT INTO tickets
           (titulo, categoria_id, sede_id, area, equipo_activo, descripcion, impacto,
            prioridad, estado, reportante_id, creado_en, fecha_objetivo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      );

    const id = Number(resultado.lastInsertRowid);
    const folio = `TCK-${ahora.getUTCFullYear()}-${String(id).padStart(5, "0")}`;
    db.prepare("UPDATE tickets SET folio = ? WHERE id = ?").run(folio, id);

    registrarEvento({
      usuarioId: reportanteId,
      entidad: "ticket",
      entidadId: id,
      evento: "creacion",
      despues: { folio, estado: ESTADOS.NUEVO, prioridad },
    });

    const tecnico = tecnicoParaRegion(sede.regionId);
    if (tecnico) {
      db.prepare("UPDATE tickets SET tecnico_id = ?, estado = ?, asignado_en = ? WHERE id = ?").run(
        tecnico.id,
        ESTADOS.ASIGNADO,
        new Date().toISOString(),
        id,
      );
      registrarEvento({
        usuarioId: null,
        entidad: "ticket",
        entidadId: id,
        evento: "asignacion_automatica",
        antes: { estado: ESTADOS.NUEVO, tecnicoId: null },
        despues: { estado: ESTADOS.ASIGNADO, tecnicoId: tecnico.id },
        comentario: `Asignado por región a ${tecnico.nombre}`,
      });
    }

    return id;
  });

  return obtenerPorId(ejecutar())!;
}

export function obtenerPorId(id: number): TicketVista | undefined {
  return db.prepare(`${SELECT_TICKET} WHERE t.id = ?`).get(id) as TicketVista | undefined;
}

export function listarDelReportante(reportanteId: number): TicketVista[] {
  return db
    .prepare(`${SELECT_TICKET} WHERE t.reportante_id = ? ORDER BY t.creado_en DESC`)
    .all(reportanteId) as TicketVista[];
}

export function listarColaTecnico(tecnicoId: number): TicketVista[] {
  return db
    .prepare(
      `${SELECT_TICKET}
        WHERE t.tecnico_id = ? AND t.estado IN (${SQL_ESTADOS_ABIERTOS})
        ORDER BY ${ORDEN_PRIORIDAD}, t.fecha_objetivo`,
    )
    .all(tecnicoId) as TicketVista[];
}

/** Control de acceso por propiedad: cada rol solo ve lo que le corresponde. */
export function puedeVer(usuario: UsuarioSesion, ticket: TicketVista): boolean {
  if (usuario.rol === "manager") return true;
  if (usuario.rol === "tecnico") return ticket.tecnicoId === usuario.id;
  return ticket.reportanteId === usuario.id;
}

export function resumenDashboard() {
  const tickets = db
    .prepare(`${SELECT_TICKET} WHERE t.estado IN (${SQL_ESTADOS_ABIERTOS}) ORDER BY t.fecha_objetivo`)
    .all() as TicketVista[];

  const ahora = new Date().toISOString();
  const totales = {
    abiertos: tickets.length,
    sinAsignar: tickets.filter((t) => t.estado === ESTADOS.NUEVO).length,
    vencidos: tickets.filter((t) => t.fechaObjetivo < ahora).length,
  };

  const carga = db
    .prepare(
      `SELECT u.id, u.nombre, r.nombre AS region, COUNT(t.id) AS activos
         FROM usuarios u
         LEFT JOIN regiones r ON r.id = u.region_id
         LEFT JOIN tickets t ON t.tecnico_id = u.id AND t.estado IN (${SQL_ESTADOS_ABIERTOS})
        WHERE u.rol = 'tecnico' AND u.activo = 1
        GROUP BY u.id
        ORDER BY u.nombre`,
    )
    .all();

  return { totales, carga, tickets };
}