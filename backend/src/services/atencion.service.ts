import { ErrorNegocio } from "../core/errores";
import {
  ESTADOS,
  HORAS_OBJETIVO,
  MIN_COMO_SE_ENCONTRO,
  TRANSICIONES,
  VENTANA_REAPERTURA_HORAS,
  esUnoDe,
} from "../core/estados";
import { db } from "../db/connection";
import type { UsuarioSesion } from "../middleware/auth";
import { registrarEvento } from "./bitacora.service";
import { etapasPermitidas } from "./evidencia.service";
import { obtenerPorId, puedeVer, type TicketVista } from "./ticket.service";

export const MENSAJE_CIERRE = "Agrega la información mínima mandatoria y la evidencia de cierre para concluir este ticket.";

const ahoraIso = () => new Date().toISOString();

// ---------- Utilidades internas ----------

function cargar(usuario: UsuarioSesion, id: number): TicketVista {
  const ticket = obtenerPorId(id);
  // 404 y no 403: no se revela la existencia de tickets ajenos
  if (!ticket || !puedeVer(usuario, ticket)) throw new ErrorNegocio("Ticket no encontrado.", 404);
  return ticket;
}

function cargarComoTecnico(usuario: UsuarioSesion, id: number, estados: string[], mensajeEstado: string): TicketVista {
  const ticket = cargar(usuario, id);
  if (usuario.rol !== "tecnico" || ticket.tecnicoId !== usuario.id) {
    throw new ErrorNegocio("Solo el técnico asignado puede realizar esta acción.", 403);
  }
  if (!estados.includes(ticket.estado)) throw new ErrorNegocio(mensajeEstado);
  return ticket;
}

type ColumnaFecha = "iniciado_en" | "cerrado_en" | "reabierto_en" | "fecha_objetivo";

/** Único punto por el que cambia el estado: valida la matriz y deja la bitácora. */
function cambiarEstado(
  ticketId: number,
  hacia: string,
  usuarioId: number | null,
  opciones: { comentario?: string; fechas?: Partial<Record<ColumnaFecha, string>> } = {},
): void {
  const { estado } = db.prepare("SELECT estado FROM tickets WHERE id = ?").get(ticketId) as { estado: string };
  if (!TRANSICIONES[estado]?.includes(hacia)) {
    throw new ErrorNegocio(`No es posible cambiar el ticket de "${estado}" a "${hacia}".`);
  }
  const fechas = opciones.fechas ?? {};
  // Los nombres de columna vienen del tipo ColumnaFecha (código), nunca del usuario.
  const set = ["estado = ?", ...Object.keys(fechas).map((c) => `${c} = ?`)].join(", ");
  db.prepare(`UPDATE tickets SET ${set} WHERE id = ?`).run(hacia, ...Object.values(fechas), ticketId);
  registrarEvento({
    usuarioId,
    entidad: "ticket",
    entidadId: ticketId,
    evento: "cambio_estado",
    antes: { estado },
    despues: { estado: hacia },
    comentario: opciones.comentario,
  });
}

function agregarComentario(ticketId: number, usuarioId: number | null, texto: string, tipo: "comentario" | "sistema") {
  db.prepare("INSERT INTO ticket_comentarios (ticket_id, usuario_id, texto, tipo, creado_en) VALUES (?, ?, ?, ?, ?)").run(
    ticketId,
    usuarioId,
    texto,
    tipo,
    ahoraIso(),
  );
}

function dentroDeVentana(cerradoEn: string | null): boolean {
  return !!cerradoEn && Date.now() - new Date(cerradoEn).getTime() <= VENTANA_REAPERTURA_HORAS * 3_600_000;
}

// ---------- Candado de cierre (sección 6) ----------

export interface ControlesCierre {
  queSeHizo: boolean;
  comoSeDejo: boolean;
  troubleshooting: boolean;
  tiempo: boolean;
  evidencia: boolean;
  completo: boolean;
}

/**
 * Evalúa los cinco controles. Tras una reapertura solo cuentan los pasos y la evidencia
 * posteriores a ella, para que un cierre anterior no valide el nuevo.
 */
export function evaluarCierre(ticketId: number): ControlesCierre {
  const { desde } = db.prepare("SELECT COALESCE(reabierto_en, '') AS desde FROM tickets WHERE id = ?").get(ticketId) as {
    desde: string;
  };
  const intervencion = db
    .prepare("SELECT que_se_hizo AS queSeHizo, como_se_dejo AS comoSeDejo FROM ticket_intervencion WHERE ticket_id = ?")
    .get(ticketId) as { queSeHizo: string | null; comoSeDejo: string | null } | undefined;
  const pasos = db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(minutos), 0) AS minutos FROM ticket_troubleshooting WHERE ticket_id = ? AND creado_en > ?")
    .get(ticketId, desde) as { n: number; minutos: number };
  const evidencia = db
    .prepare(
      `SELECT COUNT(*) AS n FROM ticket_evidencias
        WHERE ticket_id = ? AND etapa = 'cierre' AND reemplazada_por_id IS NULL AND creado_en > ?`,
    )
    .get(ticketId, desde) as { n: number };

  const controles = {
    queSeHizo: !!intervencion?.queSeHizo?.trim(),
    comoSeDejo: !!intervencion?.comoSeDejo?.trim(),
    troubleshooting: pasos.n > 0,
    tiempo: pasos.minutos > 0,
    evidencia: evidencia.n > 0,
  };
  return { ...controles, completo: Object.values(controles).every(Boolean) };
}

// ---------- Acciones del técnico ----------

export function iniciarAtencion(usuario: UsuarioSesion, ticketId: number, comoSeEncontro: string): void {
  db.transaction(() => {
    const t = cargarComoTecnico(usuario, ticketId, [ESTADOS.ASIGNADO, ESTADOS.REABIERTO], "Este ticket no está pendiente de iniciar.");
    const primeraVez = t.estado === ESTADOS.ASIGNADO;

    if (primeraVez) {
      if (comoSeEncontro.trim().length < MIN_COMO_SE_ENCONTRO) {
        throw new ErrorNegocio(`Describa cómo encontró el caso (mínimo ${MIN_COMO_SE_ENCONTRO} caracteres).`);
      }
      const { n } = db
        .prepare(
          `SELECT COUNT(*) AS n FROM ticket_evidencias
            WHERE ticket_id = ? AND etapa IN ('inicial_reportante', 'inicial_tecnico') AND reemplazada_por_id IS NULL`,
        )
        .get(t.id) as { n: number };
      if (n === 0) throw new ErrorNegocio("Adjunte al menos una evidencia inicial (foto, captura o archivo) antes de iniciar.");

      db.prepare(
        `INSERT INTO ticket_intervencion (ticket_id, como_se_encontro) VALUES (?, ?)
         ON CONFLICT(ticket_id) DO UPDATE SET como_se_encontro = excluded.como_se_encontro`,
      ).run(t.id, comoSeEncontro.trim());
    }

    cambiarEstado(t.id, ESTADOS.EN_PROCESO, usuario.id, {
      fechas: primeraVez ? { iniciado_en: ahoraIso() } : {},
      comentario: primeraVez ? undefined : "Atención retomada tras la reapertura",
    });
  })();
}

export function registrarPaso(usuario: UsuarioSesion, ticketId: number, d: { descripcion: string; resultado: string; minutos: number }) {
  db.transaction(() => {
    const t = cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "Solo se registran pasos con el ticket en proceso.");
    db.prepare(
      `INSERT INTO ticket_troubleshooting (ticket_id, tecnico_id, descripcion_paso, resultado, minutos, creado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(t.id, usuario.id, d.descripcion, d.resultado, d.minutos, ahoraIso());
    registrarEvento({
      usuarioId: usuario.id,
      entidad: "ticket",
      entidadId: t.id,
      evento: "troubleshooting_agregado",
      despues: { minutos: d.minutos },
    });
  })();
}

export function solicitarInformacion(usuario: UsuarioSesion, ticketId: number, motivo: string) {
  db.transaction(() => {
    const t = cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "Solo se puede esperar información con el ticket en proceso.");
    const abierta = db.prepare("SELECT id FROM ticket_esperas WHERE ticket_id = ? AND fin IS NULL").get(t.id);
    if (abierta) throw new ErrorNegocio("Ya hay una solicitud de información abierta.");

    db.prepare("INSERT INTO ticket_esperas (ticket_id, usuario_id, motivo, inicio) VALUES (?, ?, ?, ?)").run(t.id, usuario.id, motivo, ahoraIso());
    // La pregunta queda en los comentarios para que el reportante la vea y responda.
    agregarComentario(t.id, usuario.id, `Se requiere información: ${motivo}`, "comentario");
    registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "espera_iniciada", comentario: motivo });
  })();
}

export function reanudarAtencion(usuario: UsuarioSesion, ticketId: number) {
  db.transaction(() => {
    const t = cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "El ticket no está en proceso.");
    const r = db.prepare("UPDATE ticket_esperas SET fin = ? WHERE ticket_id = ? AND fin IS NULL").run(ahoraIso(), t.id);
    if (r.changes === 0) throw new ErrorNegocio("No hay una solicitud de información abierta.");
    registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "espera_terminada" });
  })();
}

export function guardarDatosCierre(
  usuario: UsuarioSesion,
  ticketId: number,
  d: { queSeHizo: string; comoSeDejo: string; materiales: string },
) {
  const t = cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "Los datos de cierre se capturan con el ticket en proceso.");
  db.prepare(
    `INSERT INTO ticket_intervencion (ticket_id, que_se_hizo, como_se_dejo, materiales) VALUES (?, ?, ?, ?)
     ON CONFLICT(ticket_id) DO UPDATE SET
       que_se_hizo = excluded.que_se_hizo, como_se_dejo = excluded.como_se_dejo, materiales = excluded.materiales`,
  ).run(t.id, d.queSeHizo, d.comoSeDejo, d.materiales || null);
}

export function cerrarTicket(usuario: UsuarioSesion, ticketId: number) {
  db.transaction(() => {
    const t = cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "Solo se puede cerrar un ticket en proceso.");
    if (!evaluarCierre(t.id).completo) throw new ErrorNegocio(MENSAJE_CIERRE, 422);

    const ahora = ahoraIso();
    db.prepare("UPDATE ticket_esperas SET fin = ? WHERE ticket_id = ? AND fin IS NULL").run(ahora, t.id);

    // El técnico deja la intervención lista; el sistema valida y concluye el caso.
    cambiarEstado(t.id, ESTADOS.LISTO_PARA_CERRAR, usuario.id, { comentario: "Controles de cierre validados por el sistema" });
    cambiarEstado(t.id, ESTADOS.CERRADO, null, { fechas: { cerrado_en: ahora }, comentario: "Cierre al cumplirse todos los controles" });

    const i = db
      .prepare("SELECT que_se_hizo AS queSeHizo, como_se_dejo AS comoSeDejo FROM ticket_intervencion WHERE ticket_id = ?")
      .get(t.id);
    registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "cierre", despues: i });
    agregarComentario(t.id, null, "Su solicitud fue atendida y el ticket se cerró. Si el problema continúa, puede reabrirlo durante 48 horas.", "sistema");
  })();
}

// ---------- Reportante y manager ----------

export function reabrirTicket(usuario: UsuarioSesion, ticketId: number, motivo: string) {
  db.transaction(() => {
    const t = cargar(usuario, ticketId);
    if (t.estado !== ESTADOS.CERRADO) throw new ErrorNegocio("Solo se puede reabrir un ticket cerrado.");

    const { cerradoEn } = db.prepare("SELECT cerrado_en AS cerradoEn FROM tickets WHERE id = ?").get(t.id) as { cerradoEn: string | null };
    if (usuario.rol === "reportante" && !dentroDeVentana(cerradoEn)) {
      throw new ErrorNegocio(
        `Han pasado más de ${VENTANA_REAPERTURA_HORAS} horas desde el cierre. Solicite al coordinador que lo reabra o registre un nuevo reporte.`,
      );
    }
    if (usuario.rol !== "reportante" && usuario.rol !== "manager") {
      throw new ErrorNegocio("No tiene permiso para reabrir tickets.", 403);
    }

    // El texto de cierre anterior queda en la bitácora; el nuevo cierre debe documentarse de nuevo.
    const previo = db.prepare("SELECT que_se_hizo AS queSeHizo, como_se_dejo AS comoSeDejo FROM ticket_intervencion WHERE ticket_id = ?").get(t.id);
    db.prepare("UPDATE ticket_intervencion SET que_se_hizo = NULL, como_se_dejo = NULL WHERE ticket_id = ?").run(t.id);

    const ahora = new Date();
    const objetivo = new Date(ahora.getTime() + HORAS_OBJETIVO[t.prioridad] * 3_600_000);
    cambiarEstado(t.id, ESTADOS.REABIERTO, usuario.id, {
      comentario: motivo,
      fechas: { reabierto_en: ahora.toISOString(), fecha_objetivo: objetivo.toISOString() },
    });
    registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "reapertura", antes: previo, comentario: motivo });
    agregarComentario(t.id, usuario.id, `Ticket reabierto. Motivo: ${motivo}`, "sistema");
  })();
}

export function cancelarTicket(usuario: UsuarioSesion, ticketId: number, motivo: string) {
  db.transaction(() => {
    const t = cargar(usuario, ticketId);
    if (usuario.rol !== "manager") throw new ErrorNegocio("Solo la coordinación puede cancelar tickets.", 403);
    cambiarEstado(t.id, ESTADOS.CANCELADO, usuario.id, { comentario: motivo });
    registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "cancelacion", comentario: motivo });
    agregarComentario(t.id, usuario.id, `Ticket cancelado. Motivo: ${motivo}`, "sistema");
  })();
}

export function comentar(usuario: UsuarioSesion, ticketId: number, texto: string) {
  const t = cargar(usuario, ticketId);
  if (esUnoDe(t.estado, ESTADOS.CERRADO, ESTADOS.CANCELADO)) {
    throw new ErrorNegocio("El ticket ya no admite comentarios. Si el problema continúa, reábralo.");
  }
  agregarComentario(t.id, usuario.id, texto, "comentario");
}

// ---------- Detalle según rol ----------

export function obtenerDetalle(usuario: UsuarioSesion, id: number) {
  const ticket = cargar(usuario, id);
  const esReportante = usuario.rol === "reportante";
  const esTecnicoAsignado = usuario.rol === "tecnico" && ticket.tecnicoId === usuario.id;
  const { cerradoEn } = db.prepare("SELECT cerrado_en AS cerradoEn FROM tickets WHERE id = ?").get(id) as { cerradoEn: string | null };

  const comentarios = db
    .prepare(
      `SELECT c.id, c.usuario_id AS autorId, c.texto, c.tipo, c.creado_en AS creadoEn,
              u.nombre AS autor, u.rol AS rolAutor
         FROM ticket_comentarios c LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.ticket_id = ? ORDER BY c.id`,
    )
    .all(id);

  // Al reportante nunca se le muestra evidencia técnica.
  const evidencias = (
    db
      .prepare(
        `SELECT e.id, e.subido_por_id AS autorId, e.etapa, e.nombre_original AS nombre, e.mime_type AS mime,
                e.tamano_bytes AS tamano, e.ruta_miniatura IS NOT NULL AS tieneMiniatura,
                e.reemplazada_por_id AS reemplazadaPor, e.creado_en AS creadoEn, u.nombre AS autor
           FROM ticket_evidencias e JOIN usuarios u ON u.id = e.subido_por_id
          WHERE e.ticket_id = ? ${esReportante ? "AND e.etapa = 'inicial_reportante'" : ""}
          ORDER BY e.id`,
      )
      .all(id) as { tieneMiniatura: number }[]
  ).map((e) => ({ ...e, tieneMiniatura: Boolean(e.tieneMiniatura) }));

  const acciones = {
    iniciar: esTecnicoAsignado && esUnoDe(ticket.estado, ESTADOS.ASIGNADO, ESTADOS.REABIERTO),
    registrarTrabajo: esTecnicoAsignado && ticket.estado === ESTADOS.EN_PROCESO,
    comentar: !esUnoDe(ticket.estado, ESTADOS.CERRADO, ESTADOS.CANCELADO) && usuario.rol !== "admin",
    reabrir: ticket.estado === ESTADOS.CERRADO && (usuario.rol === "manager" || (esReportante && dentroDeVentana(cerradoEn))),
    cancelar: usuario.rol === "manager" && !esUnoDe(ticket.estado, ESTADOS.CERRADO, ESTADOS.CANCELADO),
    etapasEvidencia: etapasPermitidas(usuario, ticket),
  };

  if (esReportante) return { ticket, comentarios, evidencias, acciones };

  const intervencion =
    (db
      .prepare(
        `SELECT como_se_encontro AS comoSeEncontro, que_se_hizo AS queSeHizo, como_se_dejo AS comoSeDejo, materiales
           FROM ticket_intervencion WHERE ticket_id = ?`,
      )
      .get(id) as object | undefined) ?? { comoSeEncontro: null, queSeHizo: null, comoSeDejo: null, materiales: null };

  const pasos = db
    .prepare(
      `SELECT p.id, p.descripcion_paso AS descripcion, p.resultado, p.minutos, p.creado_en AS creadoEn, u.nombre AS autor
         FROM ticket_troubleshooting p JOIN usuarios u ON u.id = p.tecnico_id
        WHERE p.ticket_id = ? ORDER BY p.id`,
    )
    .all(id);
  const esperas = db.prepare("SELECT id, motivo, inicio, fin FROM ticket_esperas WHERE ticket_id = ? ORDER BY id").all(id);

  const historial = (
    db
      .prepare(
        `SELECT b.id, b.fecha, b.evento, b.comentario, b.valor_anterior AS antes, b.valor_nuevo AS despues, u.nombre AS usuario
           FROM bitacora_auditoria b LEFT JOIN usuarios u ON u.id = b.usuario_id
          WHERE b.entidad = 'ticket' AND b.entidad_id = ? ORDER BY b.id`,
      )
      .all(id) as { antes: string | null; despues: string | null }[]
  ).map((e) => ({
    ...e,
    antes: e.antes ? JSON.parse(e.antes) : null,
    despues: e.despues ? JSON.parse(e.despues) : null,
  }));

  return {
    ticket,
    comentarios,
    evidencias,
    acciones,
    tecnico: {
      intervencion,
      pasos,
      esperas,
      cierre: ticket.estado === ESTADOS.EN_PROCESO ? evaluarCierre(id) : null,
    },
    historial,
  };
}