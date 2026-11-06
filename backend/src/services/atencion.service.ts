import { ErrorNegocio } from "../core/errores";
import {
  ESTADOS,
  HORAS_OBJETIVO,
  MIN_COMO_SE_ENCONTRO,
  TRANSICIONES,
  VENTANA_REAPERTURA_HORAS,
  esUnoDe,
} from "../core/estados";
import { consultar, ejecutar, transaccion, uno } from "../db/connection";
import type { UsuarioSesion } from "../middleware/auth";

interface SimilarTicket {
  id: number;
  folio: string;
  titulo: string;
  estado: string;
  creadoEn: string;
}
import { registrarEvento } from "./bitacora.service";
import { etapasPermitidas } from "./evidencia.service";
import { obtenerPorId, puedeVer, type TicketVista } from "./ticket.service";

export const MENSAJE_CIERRE = "Agrega la información mínima mandatoria y la evidencia de cierre para concluir este ticket.";

const ahoraIso = () => new Date().toISOString();

async function cargar(usuario: UsuarioSesion, id: number): Promise<TicketVista> {
  const ticket = await obtenerPorId(id);
  if (!ticket || !puedeVer(usuario, ticket)) throw new ErrorNegocio("Ticket no encontrado.", 404);
  return ticket;
}

async function cargarComoTecnico(usuario: UsuarioSesion, id: number, estados: string[], mensajeEstado: string): Promise<TicketVista> {
  const ticket = await cargar(usuario, id);
  if (usuario.rol !== "tecnico" || ticket.tecnicoId !== usuario.id) {
    throw new ErrorNegocio("Solo el técnico asignado puede realizar esta acción.", 403);
  }
  if (!estados.includes(ticket.estado)) throw new ErrorNegocio(mensajeEstado);
  return ticket;
}

async function motivoDe(id: number, tipo: "espera" | "cancelacion" | "cierre"): Promise<{ nombre: string }> {
  const motivo = await uno<{ nombre: string }>("SELECT nombre FROM motivos WHERE id = ? AND tipo = ? AND activo = TRUE", [id, tipo]);
  if (!motivo) throw new ErrorNegocio("Seleccione un motivo válido.");
  return motivo;
}

type ColumnaFecha = "iniciado_en" | "cerrado_en" | "reabierto_en" | "fecha_objetivo";

async function cambiarEstado(
  ticketId: number,
  hacia: string,
  usuarioId: number | null,
  opciones: { comentario?: string; fechas?: Partial<Record<ColumnaFecha, string>> } = {},
): Promise<void> {
  const actual = await uno<{ estado: string }>("SELECT estado FROM tickets WHERE id = ? FOR UPDATE", [ticketId]);
  const estado = actual!.estado;
  if (!TRANSICIONES[estado]?.includes(hacia)) {
    throw new ErrorNegocio(`No es posible cambiar el ticket de "${estado}" a "${hacia}".`);
  }
  const fechas = opciones.fechas ?? {};
  const set = ["estado = ?", ...Object.keys(fechas).map((c) => `${c} = ?`)].join(", ");
  await ejecutar(`UPDATE tickets SET ${set} WHERE id = ?`, [hacia, ...Object.values(fechas), ticketId]);
  await registrarEvento({
    usuarioId,
    entidad: "ticket",
    entidadId: ticketId,
    evento: "cambio_estado",
    antes: { estado },
    despues: { estado: hacia },
    comentario: opciones.comentario,
  });
}

async function agregarComentario(ticketId: number, usuarioId: number | null, texto: string, tipo: "comentario" | "sistema") {
  await ejecutar("INSERT INTO ticket_comentarios (ticket_id, usuario_id, texto, tipo, creado_en) VALUES (?, ?, ?, ?, ?)", [
    ticketId,
    usuarioId,
    texto,
    tipo,
    ahoraIso(),
  ]);
}

function dentroDeVentana(cerradoEn: string | null): boolean {
  return !!cerradoEn && Date.now() - new Date(cerradoEn).getTime() <= VENTANA_REAPERTURA_HORAS * 3_600_000;
}

export interface ControlesCierre {
  queSeHizo: boolean;
  comoSeDejo: boolean;
  troubleshooting: boolean;
  tiempo: boolean;
  evidencia: boolean;
  completo: boolean;
}

export async function evaluarCierre(ticketId: number): Promise<ControlesCierre> {
  const base = await uno<{ desde: string }>("SELECT COALESCE(reabierto_en, 'epoch'::timestamptz) AS desde FROM tickets WHERE id = ?", [ticketId]);
  const desde = base!.desde;
  const intervencion = await uno<{ queSeHizo: string | null; comoSeDejo: string | null }>(
    "SELECT que_se_hizo, como_se_dejo FROM ticket_intervencion WHERE ticket_id = ?",
    [ticketId],
  );
  const pasos = await uno<{ n: number; minutos: number }>(
    "SELECT COUNT(*) AS n, COALESCE(SUM(minutos), 0) AS minutos FROM ticket_troubleshooting WHERE ticket_id = ? AND creado_en > ?",
    [ticketId, desde],
  );
  const evidencia = await uno<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ticket_evidencias
      WHERE ticket_id = ? AND etapa = 'cierre' AND reemplazada_por_id IS NULL AND creado_en > ?`,
    [ticketId, desde],
  );

  const controles = {
    queSeHizo: !!intervencion?.queSeHizo?.trim(),
    comoSeDejo: !!intervencion?.comoSeDejo?.trim(),
    troubleshooting: (pasos?.n ?? 0) > 0,
    tiempo: (pasos?.minutos ?? 0) > 0,
    evidencia: (evidencia?.n ?? 0) > 0,
  };
  return { ...controles, completo: Object.values(controles).every(Boolean) };
}

export async function iniciarAtencion(usuario: UsuarioSesion, ticketId: number, comoSeEncontro: string): Promise<void> {
  await transaccion(async () => {
    const t = await cargarComoTecnico(usuario, ticketId, [ESTADOS.ASIGNADO, ESTADOS.REABIERTO], "Este ticket no está pendiente de iniciar.");
    const primeraVez = t.estado === ESTADOS.ASIGNADO;

    if (primeraVez) {
      if (comoSeEncontro.trim().length < MIN_COMO_SE_ENCONTRO) {
        throw new ErrorNegocio(`Describa cómo encontró el caso (mínimo ${MIN_COMO_SE_ENCONTRO} caracteres).`);
      }
      const evidencias = await uno<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ticket_evidencias
          WHERE ticket_id = ? AND etapa IN ('inicial_reportante', 'inicial_tecnico') AND reemplazada_por_id IS NULL`,
        [t.id],
      );
      if ((evidencias?.n ?? 0) === 0) {
        throw new ErrorNegocio("Adjunte al menos una evidencia inicial (foto, captura o archivo) antes de iniciar.");
      }

      await ejecutar(
        `INSERT INTO ticket_intervencion (ticket_id, como_se_encontro) VALUES (?, ?)
         ON CONFLICT (ticket_id) DO UPDATE SET como_se_encontro = EXCLUDED.como_se_encontro`,
        [t.id, comoSeEncontro.trim()],
      );
    }

    await cambiarEstado(t.id, ESTADOS.EN_PROCESO, usuario.id, {
      fechas: primeraVez ? { iniciado_en: ahoraIso() } : {},
      comentario: primeraVez ? undefined : "Atención retomada tras la reapertura",
    });
  });
}

export async function registrarPaso(usuario: UsuarioSesion, ticketId: number, d: { descripcion: string; resultado: string; minutos: number }) {
  await transaccion(async () => {
    const t = await cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "Solo se registran pasos con el ticket en proceso.");
    await ejecutar(
      `INSERT INTO ticket_troubleshooting (ticket_id, tecnico_id, descripcion_paso, resultado, minutos, creado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [t.id, usuario.id, d.descripcion, d.resultado, d.minutos, ahoraIso()],
    );
    await registrarEvento({
      usuarioId: usuario.id,
      entidad: "ticket",
      entidadId: t.id,
      evento: "troubleshooting_agregado",
      despues: { minutos: d.minutos },
    });
  });
}

export async function solicitarInformacion(usuario: UsuarioSesion, ticketId: number, motivoId: number, detalle: string) {
  await transaccion(async () => {
    const t = await cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "Solo se puede esperar información con el ticket en proceso.");
    const motivo = await motivoDe(motivoId, "espera");
    const abierta = await uno("SELECT id FROM ticket_esperas WHERE ticket_id = ? AND fin IS NULL", [t.id]);
    if (abierta) throw new ErrorNegocio("Ya hay una solicitud de información abierta.");

    const texto = detalle ? `${motivo.nombre}: ${detalle}` : motivo.nombre;
    await ejecutar("INSERT INTO ticket_esperas (ticket_id, usuario_id, motivo, motivo_id, inicio) VALUES (?, ?, ?, ?, ?)", [
      t.id,
      usuario.id,
      texto,
      motivoId,
      ahoraIso(),
    ]);
    await agregarComentario(t.id, usuario.id, `Se requiere información — ${texto}`, "comentario");
    await registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "espera_iniciada", comentario: texto });
  });
}

export async function reanudarAtencion(usuario: UsuarioSesion, ticketId: number) {
  await transaccion(async () => {
    const t = await cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "El ticket no está en proceso.");
    const cambios = await ejecutar("UPDATE ticket_esperas SET fin = ? WHERE ticket_id = ? AND fin IS NULL", [ahoraIso(), t.id]);
    if (cambios === 0) throw new ErrorNegocio("No hay una solicitud de información abierta.");
    await registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "espera_terminada" });
  });
}

export async function guardarDatosCierre(
  usuario: UsuarioSesion,
  ticketId: number,
  d: { queSeHizo: string; comoSeDejo: string; materiales: string; motivoCierreId: number | null },
) {
  const t = await cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "Los datos de cierre se capturan con el ticket en proceso.");
  if (d.motivoCierreId) await motivoDe(d.motivoCierreId, "cierre");
  await ejecutar(
    `INSERT INTO ticket_intervencion (ticket_id, que_se_hizo, como_se_dejo, materiales, motivo_cierre_id) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (ticket_id) DO UPDATE SET
       que_se_hizo = EXCLUDED.que_se_hizo, como_se_dejo = EXCLUDED.como_se_dejo,
       materiales = EXCLUDED.materiales, motivo_cierre_id = EXCLUDED.motivo_cierre_id`,
    [t.id, d.queSeHizo, d.comoSeDejo, d.materiales || null, d.motivoCierreId],
  );
}

export async function cerrarTicket(usuario: UsuarioSesion, ticketId: number) {
  await transaccion(async () => {
    const t = await cargarComoTecnico(usuario, ticketId, [ESTADOS.EN_PROCESO], "Solo se puede cerrar un ticket en proceso.");
    if (!(await evaluarCierre(t.id)).completo) throw new ErrorNegocio(MENSAJE_CIERRE, 422);

    const ahora = ahoraIso();
    await ejecutar("UPDATE ticket_esperas SET fin = ? WHERE ticket_id = ? AND fin IS NULL", [ahora, t.id]);

    await cambiarEstado(t.id, ESTADOS.LISTO_PARA_CERRAR, usuario.id, { comentario: "Controles de cierre validados por el sistema" });
    await cambiarEstado(t.id, ESTADOS.CERRADO, null, { fechas: { cerrado_en: ahora }, comentario: "Cierre al cumplirse todos los controles" });

    const intervencion = await uno("SELECT que_se_hizo, como_se_dejo FROM ticket_intervencion WHERE ticket_id = ?", [t.id]);
    await registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "cierre", despues: intervencion });
    await agregarComentario(t.id, null, "Su solicitud fue atendida y el ticket se cerró. Si el problema continúa, puede reabrirlo durante 48 horas.", "sistema");
  });
}

export async function reabrirTicket(usuario: UsuarioSesion, ticketId: number, motivo: string) {
  await transaccion(async () => {
    const t = await cargar(usuario, ticketId);
    if (t.estado !== ESTADOS.CERRADO) throw new ErrorNegocio("Solo se puede reabrir un ticket cerrado.");

    const fila = await uno<{ cerradoEn: string | null }>("SELECT cerrado_en FROM tickets WHERE id = ?", [t.id]);
    if (usuario.rol === "reportante" && !dentroDeVentana(fila?.cerradoEn ?? null)) {
      throw new ErrorNegocio(
        `Han pasado más de ${VENTANA_REAPERTURA_HORAS} horas desde el cierre. Solicite al coordinador que lo reabra o registre un nuevo reporte relacionado.`,
      );
    }
    if (usuario.rol !== "reportante" && usuario.rol !== "manager") {
      throw new ErrorNegocio("No tiene permiso para reabrir tickets.", 403);
    }

    const previo = await uno("SELECT que_se_hizo, como_se_dejo FROM ticket_intervencion WHERE ticket_id = ?", [t.id]);
    await ejecutar(
      "UPDATE ticket_intervencion SET que_se_hizo = NULL, como_se_dejo = NULL, motivo_cierre_id = NULL WHERE ticket_id = ?",
      [t.id],
    );

    const ahora = new Date();
    const objetivo = new Date(ahora.getTime() + HORAS_OBJETIVO[t.prioridad] * 3_600_000);
    await cambiarEstado(t.id, ESTADOS.REABIERTO, usuario.id, {
      comentario: motivo,
      fechas: { reabierto_en: ahora.toISOString(), fecha_objetivo: objetivo.toISOString() },
    });
    await registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "reapertura", antes: previo, comentario: motivo });
    await agregarComentario(t.id, usuario.id, `Ticket reabierto. Motivo: ${motivo}`, "sistema");
  });
}

export async function cancelarTicket(usuario: UsuarioSesion, ticketId: number, motivoId: number, detalle: string) {
  await transaccion(async () => {
    const t = await cargar(usuario, ticketId);
    if (usuario.rol !== "manager") throw new ErrorNegocio("Solo la coordinación puede cancelar tickets.", 403);
    const motivo = await motivoDe(motivoId, "cancelacion");
    const texto = detalle ? `${motivo.nombre}. ${detalle}` : motivo.nombre;
    await cambiarEstado(t.id, ESTADOS.CANCELADO, usuario.id, { comentario: texto });
    await registrarEvento({ usuarioId: usuario.id, entidad: "ticket", entidadId: t.id, evento: "cancelacion", comentario: texto });
    await agregarComentario(t.id, usuario.id, `Ticket cancelado. Motivo: ${texto}`, "sistema");
  });
}

export async function comentar(usuario: UsuarioSesion, ticketId: number, texto: string) {
  const t = await cargar(usuario, ticketId);
  if (esUnoDe(t.estado, ESTADOS.CERRADO, ESTADOS.CANCELADO)) {
    throw new ErrorNegocio("El ticket ya no admite comentarios. Si el problema continúa, reábralo.");
  }
  await agregarComentario(t.id, usuario.id, texto, "comentario");
}

export async function obtenerDetalle(usuario: UsuarioSesion, id: number) {
  const ticket = await cargar(usuario, id);
  const esReportante = usuario.rol === "reportante";
  const esTecnicoAsignado = usuario.rol === "tecnico" && ticket.tecnicoId === usuario.id;
  const fila = await uno<{ cerradoEn: string | null }>("SELECT cerrado_en FROM tickets WHERE id = ?", [id]);
  const cerradoEn = fila?.cerradoEn ?? null;

  const comentarios = await consultar(
    `SELECT c.id, c.usuario_id AS autor_id, c.texto, c.tipo, c.creado_en,
            u.nombre AS autor, u.rol AS rol_autor
       FROM ticket_comentarios c LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.ticket_id = ? ORDER BY c.id`,
    [id],
  );

  const evidencias = await consultar(
    `SELECT e.id, e.subido_por_id AS autor_id, e.etapa, e.nombre_original AS nombre, e.mime_type AS mime,
            e.tamano_bytes AS tamano, (e.ruta_miniatura IS NOT NULL) AS tiene_miniatura,
            e.reemplazada_por_id AS reemplazada_por, e.creado_en, u.nombre AS autor
       FROM ticket_evidencias e JOIN usuarios u ON u.id = e.subido_por_id
      WHERE e.ticket_id = ? ${esReportante ? "AND e.etapa = 'inicial_reportante'" : ""}
      ORDER BY e.id`,
    [id],
  );

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
    (await uno(
      `SELECT i.como_se_encontro, i.que_se_hizo, i.como_se_dejo, i.materiales,
              i.motivo_cierre_id, m.nombre AS motivo_cierre
         FROM ticket_intervencion i LEFT JOIN motivos m ON m.id = i.motivo_cierre_id
        WHERE i.ticket_id = ?`,
      [id],
    )) ?? { comoSeEncontro: null, queSeHizo: null, comoSeDejo: null, materiales: null, motivoCierreId: null, motivoCierre: null };

  const pasos = await consultar(
    `SELECT p.id, p.descripcion_paso AS descripcion, p.resultado, p.minutos, p.creado_en, u.nombre AS autor
       FROM ticket_troubleshooting p JOIN usuarios u ON u.id = p.tecnico_id
      WHERE p.ticket_id = ? ORDER BY p.id`,
    [id],
  );
  const esperas = await consultar("SELECT id, motivo, inicio, fin FROM ticket_esperas WHERE ticket_id = ? ORDER BY id", [id]);

  const historial = await consultar(
    `SELECT b.id, b.fecha, b.evento, b.comentario, b.valor_anterior AS antes, b.valor_nuevo AS despues, u.nombre AS usuario
       FROM bitacora_auditoria b LEFT JOIN usuarios u ON u.id = b.usuario_id
      WHERE b.entidad = 'ticket' AND b.entidad_id = ? ORDER BY b.id`,
    [id],
  );

  let similares: SimilarTicket[] = [];
  if (usuario.rol === "tecnico" || usuario.rol === "manager") {
    const ref = await uno<{ sedeId: number; categoriaId: number; equipoActivo: string | null }>(
      "SELECT sede_id, categoria_id, equipo_activo FROM tickets WHERE id = ?",
      [id],
    );
    if (ref) {
      const condiciones: string[] = [];
      const params: unknown[] = [id];
      if (ref.equipoActivo && ref.equipoActivo.trim() !== "") {
        condiciones.push("s.equipo_activo = ?");
        params.push(ref.equipoActivo);
      }
      condiciones.push("s.sede_id = ? AND s.categoria_id = ?");
      params.push(ref.sedeId, ref.categoriaId);
      similares = await consultar<SimilarTicket>(
        `SELECT s.id, s.folio, s.titulo, s.estado, s.creado_en AS creadoEn
           FROM tickets s
          WHERE s.id <> ?
            AND (${condiciones.join(" OR ")})
          ORDER BY s.creado_en DESC LIMIT 5`,
        params,
      );
    }
  }

  return {
    ticket,
    comentarios,
    evidencias,
    acciones,
    tecnico: {
      intervencion,
      pasos,
      esperas,
      cierre: ticket.estado === ESTADOS.EN_PROCESO ? await evaluarCierre(id) : null,
    },
    historial,
    similares,
  };
}