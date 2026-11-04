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
  subcategoriaId: number | null;
  sedeId: number;
  area: string;
  pisoZona: string;
  equipoActivo: string;
  descripcion: string;
  impacto: Impacto;
  relacionadoId: number | null;
}

export interface TicketVista {
  id: number;
  folio: string;
  titulo: string;
  area: string;
  pisoZona: string | null;
  equipoActivo: string | null;
  descripcion: string;
  impacto: Impacto;
  prioridad: "baja" | "normal" | "alta";
  estado: string;
  creadoEn: string;
  asignadoEn: string | null;
  fechaObjetivo: string;
  categoria: string;
  subcategoria: string | null;
  sede: string;
  reportante: string;
  reportanteId: number;
  reportanteCorreo: string;
  reportanteTelefono: string;
  tecnico: string | null;
  tecnicoId: number | null;
  tecnicoGrupoId: number | null;
}

const SELECT_TICKET = `
  SELECT t.id, t.folio, t.titulo, t.area, t.piso_zona, t.equipo_activo, t.descripcion,
         t.impacto, t.prioridad, t.estado, t.creado_en, t.asignado_en,
         t.fecha_objetivo, t.reportante_id, t.tecnico_id,
         c.nombre AS categoria, sc.nombre AS subcategoria, s.nombre AS sede,
         r.nombre AS reportante, r.correo AS reportante_correo, r.telefono AS reportante_telefono,
         tec.nombre AS tecnico, tec.grupo_id AS tecnico_grupo_id
    FROM tickets t
    JOIN categorias c ON c.id = t.categoria_id
    LEFT JOIN subcategorias sc ON sc.id = t.subcategoria_id
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

    if (datos.subcategoriaId) {
      const subcategoria = await uno(
        "SELECT id FROM subcategorias WHERE id = ? AND categoria_id = ? AND activo = TRUE",
        [datos.subcategoriaId, datos.categoriaId],
      );
      if (!subcategoria) throw new ErrorNegocio("Seleccione una subcategoría válida.");
    }

    if (datos.relacionadoId) {
      const previo = await uno("SELECT id FROM tickets WHERE id = ? AND reportante_id = ?", [datos.relacionadoId, reportanteId]);
      if (!previo) throw new ErrorNegocio("El reporte relacionado no existe.", 404);
    }

    const ahora = new Date();
    const prioridad = PRIORIDAD_POR_IMPACTO[datos.impacto];
    const objetivo = new Date(ahora.getTime() + HORAS_OBJETIVO[prioridad] * 3_600_000);

    const nuevoId = await insertar(
      `INSERT INTO tickets
         (titulo, categoria_id, subcategoria_id, sede_id, area, piso_zona, equipo_activo, descripcion, impacto,
          prioridad, estado, reportante_id, creado_en, fecha_objetivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.titulo,
        datos.categoriaId,
        datos.subcategoriaId,
        datos.sedeId,
        datos.area,
        datos.pisoZona || null,
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

    if (datos.relacionadoId) {
      const [menor, mayor] =
        datos.relacionadoId < nuevoId ? [datos.relacionadoId, nuevoId] : [nuevoId, datos.relacionadoId];
      await ejecutar(
        "INSERT INTO ticket_relaciones (ticket_id, relacionado_id, creada_por, creada_en) VALUES (?, ?, ?, ?)",
        [menor, mayor, reportanteId, ahora.toISOString()],
      );
      await registrarEvento({
        usuarioId: reportanteId,
        entidad: "ticket",
        entidadId: nuevoId,
        evento: "relacion_agregada",
        comentario: "Reporte registrado como seguimiento de un reporte anterior",
      });
    }

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

export function listarGrupo(tecnicoId: number, grupoId: number): Promise<TicketVista[]> {
  return consultar<TicketVista>(
    `${SELECT_TICKET}
      WHERE tec.grupo_id = ? AND t.tecnico_id <> ? AND t.estado IN (${SQL_ESTADOS_ABIERTOS})
      ORDER BY ${ORDEN_PRIORIDAD}, t.fecha_objetivo`,
    [grupoId, tecnicoId],
  );
}

export function puedeVer(usuario: UsuarioSesion, ticket: TicketVista): boolean {
  if (usuario.rol === "manager") return true;
  if (usuario.rol === "tecnico") {
    const mismoGrupo = usuario.grupoId != null && ticket.tecnicoGrupoId === usuario.grupoId;
    return ticket.tecnicoId === usuario.id || mismoGrupo;
  }
  return ticket.reportanteId === usuario.id;
}