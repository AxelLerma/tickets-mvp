import { ErrorNegocio } from "../core/errores";
import { consultar, ejecutar, transaccion, uno } from "../db/connection";
import type { UsuarioSesion } from "../middleware/auth";
import { registrarEvento } from "./bitacora.service";
import { obtenerPorId, puedeVer, type TicketVista } from "./ticket.service";

const DIAS_SUGERENCIA = 60;

export interface TicketResumen {
  id: number;
  folio: string;
  titulo: string;
  estado: string;
  prioridad: string;
  sede: string;
  categoria: string;
  tecnico: string | null;
  mismoTecnico: boolean;
}

function resumir(t: TicketVista, base: TicketVista): TicketResumen {
  return {
    id: t.id,
    folio: t.folio,
    titulo: t.titulo,
    estado: t.estado,
    prioridad: t.prioridad,
    sede: t.sede,
    categoria: t.categoria,
    tecnico: t.tecnico,
    mismoTecnico: t.tecnicoId !== null && t.tecnicoId === base.tecnicoId,
  };
}

async function visibles(usuario: UsuarioSesion, ids: number[], base: TicketVista): Promise<TicketResumen[]> {
  const salida: TicketResumen[] = [];
  for (const id of ids) {
    const t = await obtenerPorId(id);
    if (t && puedeVer(usuario, t)) salida.push(resumir(t, base));
  }
  return salida;
}

async function cargarVisible(usuario: UsuarioSesion, ticketId: number): Promise<TicketVista> {
  const t = await obtenerPorId(ticketId);
  if (!t || !puedeVer(usuario, t)) throw new ErrorNegocio("Ticket no encontrado.", 404);
  return t;
}

function puedeGestionar(usuario: UsuarioSesion, t: TicketVista): boolean {
  return usuario.rol === "manager" || (usuario.rol === "tecnico" && t.tecnicoId === usuario.id);
}

function parOrdenado(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export async function relacionadosDe(usuario: UsuarioSesion, ticketId: number) {
  const ticket = await cargarVisible(usuario, ticketId);

  const enlaces = await consultar<{ otroId: number }>(
    `SELECT CASE WHEN ticket_id = ? THEN relacionado_id ELSE ticket_id END AS otro_id
       FROM ticket_relaciones
      WHERE activa = TRUE AND (ticket_id = ? OR relacionado_id = ?)
      ORDER BY id DESC`,
    [ticketId, ticketId, ticketId],
  );
  const relacionados = await visibles(usuario, enlaces.map((e) => e.otroId), ticket);

  const base = await uno<{ sedeId: number; categoriaId: number; equipoActivo: string | null }>(
    "SELECT sede_id, categoria_id, equipo_activo FROM tickets WHERE id = ?",
    [ticketId],
  );

  let sugeridos: TicketResumen[] = [];
  if (base) {
    const desde = new Date(Date.now() - DIAS_SUGERENCIA * 86_400_000).toISOString();
    const equipo = (base.equipoActivo ?? "").trim().toLowerCase();
    const parametros: unknown[] = [ticketId, base.sedeId, desde, base.categoriaId];
    let condicionEquipo = "";
    if (equipo) {
      condicionEquipo = " OR LOWER(TRIM(t.equipo_activo)) = ?";
      parametros.push(equipo);
    }
    parametros.push(ticketId, ticketId);

    const candidatos = await consultar<{ id: number }>(
      `SELECT t.id FROM tickets t
        WHERE t.id <> ? AND t.estado <> 'cancelado' AND t.sede_id = ? AND t.creado_en >= ?
          AND (t.categoria_id = ?${condicionEquipo})
          AND NOT EXISTS (
            SELECT 1 FROM ticket_relaciones r
             WHERE r.activa = TRUE
               AND ((r.ticket_id = t.id AND r.relacionado_id = ?) OR (r.relacionado_id = t.id AND r.ticket_id = ?))
          )
        ORDER BY t.creado_en DESC LIMIT 10`,
      parametros,
    );
    sugeridos = await visibles(usuario, candidatos.map((c) => c.id), ticket);
  }

  return {
    relacionados,
    sugeridos,
    puedeVincular: puedeGestionar(usuario, ticket),
    puedeDesvincular: usuario.rol === "manager",
  };
}

export async function vincular(usuario: UsuarioSesion, ticketId: number, folio: string): Promise<void> {
  await transaccion(async () => {
    const ticket = await cargarVisible(usuario, ticketId);
    if (!puedeGestionar(usuario, ticket)) {
      throw new ErrorNegocio("No tiene permiso para relacionar este ticket.", 403);
    }

    const fila = await uno<{ id: number }>("SELECT id FROM tickets WHERE UPPER(folio) = ?", [folio.trim().toUpperCase()]);
    const otro = fila ? await obtenerPorId(fila.id) : undefined;
    if (!otro || !puedeVer(usuario, otro)) throw new ErrorNegocio("No se encontró un ticket con ese folio.", 404);
    if (otro.id === ticket.id) throw new ErrorNegocio("No puede relacionar un ticket consigo mismo.");

    const [menor, mayor] = parOrdenado(ticket.id, otro.id);
    const existente = await uno<{ id: number; activa: boolean }>(
      "SELECT id, activa FROM ticket_relaciones WHERE ticket_id = ? AND relacionado_id = ?",
      [menor, mayor],
    );
    if (existente?.activa) throw new ErrorNegocio("Estos tickets ya están relacionados.");

    const ahora = new Date().toISOString();
    if (existente) {
      await ejecutar("UPDATE ticket_relaciones SET activa = TRUE, creada_por = ?, creada_en = ? WHERE id = ?", [
        usuario.id,
        ahora,
        existente.id,
      ]);
    } else {
      await ejecutar(
        "INSERT INTO ticket_relaciones (ticket_id, relacionado_id, creada_por, creada_en) VALUES (?, ?, ?, ?)",
        [menor, mayor, usuario.id, ahora],
      );
    }

    await registrarEvento({
      usuarioId: usuario.id,
      entidad: "ticket",
      entidadId: ticket.id,
      evento: "relacion_agregada",
      comentario: `Relacionado con ${otro.folio}`,
    });
    await registrarEvento({
      usuarioId: usuario.id,
      entidad: "ticket",
      entidadId: otro.id,
      evento: "relacion_agregada",
      comentario: `Relacionado con ${ticket.folio}`,
    });
  });
}

export async function desvincular(usuario: UsuarioSesion, ticketId: number, otroId: number): Promise<void> {
  await transaccion(async () => {
    const ticket = await cargarVisible(usuario, ticketId);
    const otro = await obtenerPorId(otroId);
    if (!otro) throw new ErrorNegocio("Ticket no encontrado.", 404);

    const [menor, mayor] = parOrdenado(ticket.id, otro.id);
    const cambios = await ejecutar(
      "UPDATE ticket_relaciones SET activa = FALSE WHERE ticket_id = ? AND relacionado_id = ? AND activa = TRUE",
      [menor, mayor],
    );
    if (cambios === 0) throw new ErrorNegocio("La relación no existe.", 404);

    await registrarEvento({
      usuarioId: usuario.id,
      entidad: "ticket",
      entidadId: ticket.id,
      evento: "relacion_quitada",
      comentario: `Relación con ${otro.folio} retirada`,
    });
    await registrarEvento({
      usuarioId: usuario.id,
      entidad: "ticket",
      entidadId: otro.id,
      evento: "relacion_quitada",
      comentario: `Relación con ${ticket.folio} retirada`,
    });
  });
}