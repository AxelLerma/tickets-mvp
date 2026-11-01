import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { config } from "../config";
import { ErrorNegocio } from "../core/errores";
import { ESTADOS, esUnoDe } from "../core/estados";
import { db } from "../db/connection";
import type { UsuarioSesion } from "../middleware/auth";
import { registrarEvento } from "./bitacora.service";
import { obtenerPorId, puedeVer, type TicketVista } from "./ticket.service";

export type Etapa = "inicial_reportante" | "inicial_tecnico" | "cierre";

// Se valida el contenido real del archivo, no la extensión que declara el usuario.
const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

export const DIR_TMP = path.join(config.storageDir, "tmp");
for (const dir of [DIR_TMP, path.join(config.storageDir, "evidencias"), path.join(config.storageDir, "miniaturas")]) {
  mkdirSync(dir, { recursive: true });
}

/** Etapas en las que la persona puede adjuntar evidencia según su rol y el estado del ticket. */
export function etapasPermitidas(usuario: UsuarioSesion, ticket: TicketVista): Etapa[] {
  if (!puedeVer(usuario, ticket)) return [];
  const e = ticket.estado;
  if (usuario.rol === "reportante") {
    return esUnoDe(e, ESTADOS.NUEVO, ESTADOS.ASIGNADO) ? ["inicial_reportante"] : [];
  }
  if (usuario.rol === "tecnico") {
    if (e === ESTADOS.ASIGNADO) return ["inicial_tecnico"];
    if (e === ESTADOS.EN_PROCESO) return ["inicial_tecnico", "cierre"];
  }
  return [];
}

interface DatosSubida {
  ticketId: number;
  etapa: Etapa;
  reemplazaId?: number;
  archivo: Express.Multer.File;
}

export async function guardarEvidencia(usuario: UsuarioSesion, datos: DatosSubida): Promise<number> {
  let destino: string | null = null;
  let miniatura: string | null = null;
  try {
    const ticket = obtenerPorId(datos.ticketId);
    if (!ticket || !puedeVer(usuario, ticket)) throw new ErrorNegocio("Ticket no encontrado.", 404);
    if (!etapasPermitidas(usuario, ticket).includes(datos.etapa)) {
      throw new ErrorNegocio("No es posible adjuntar esta evidencia en el estado actual del ticket.", 403);
    }

    const tipo = await fileTypeFromFile(datos.archivo.path);
    const extension = tipo ? TIPOS_PERMITIDOS[tipo.mime] : undefined;
    if (!tipo || !extension) {
      throw new ErrorNegocio("Tipo de archivo no permitido. Use imagen (JPG, PNG, WebP), PDF o video (MP4, WebM, MOV).", 415);
    }

    let anterior: { id: number; etapa: string; autorId: number } | undefined;
    if (datos.reemplazaId) {
      anterior = db
        .prepare(
          `SELECT id, etapa, subido_por_id AS autorId FROM ticket_evidencias
            WHERE id = ? AND ticket_id = ? AND reemplazada_por_id IS NULL`,
        )
        .get(datos.reemplazaId, ticket.id) as { id: number; etapa: string; autorId: number } | undefined;
      if (!anterior || anterior.etapa !== datos.etapa) {
        throw new ErrorNegocio("La evidencia que intenta reemplazar no existe o ya fue reemplazada.");
      }
      if (anterior.autorId !== usuario.id) {
        throw new ErrorNegocio("Solo quien adjuntó un archivo puede reemplazarlo.", 403);
      }
    }

    // El nombre en disco es un UUID: nadie controla la ruta final.
    const nombre = randomUUID();
    const rutaArchivo = path.join("evidencias", `${nombre}${extension}`);
    destino = path.join(config.storageDir, rutaArchivo);
    await rename(datos.archivo.path, destino);

    if (tipo.mime.startsWith("image/")) {
      try {
        const rutaMiniatura = path.join("miniaturas", `${nombre}.jpg`);
        miniatura = path.join(config.storageDir, rutaMiniatura);
        await sharp(destino).rotate().resize({ width: 320, height: 320, fit: "inside" }).jpeg({ quality: 70 }).toFile(miniatura);
        miniatura = rutaMiniatura;
      } catch {
        miniatura = null; // sin miniatura la evidencia sigue siendo válida
      }
    }

    // multer entrega el nombre en latin1; se convierte a UTF-8 para conservar acentos
    const nombreOriginal = path.basename(Buffer.from(datos.archivo.originalname, "latin1").toString("utf8")).slice(0, 150);

    return db.transaction(() => {
      const r = db
        .prepare(
          `INSERT INTO ticket_evidencias
             (ticket_id, subido_por_id, etapa, nombre_original, mime_type, tamano_bytes, ruta_archivo, ruta_miniatura, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(ticket.id, usuario.id, datos.etapa, nombreOriginal, tipo.mime, datos.archivo.size, rutaArchivo, miniatura, new Date().toISOString());
      const id = Number(r.lastInsertRowid);
      if (anterior) {
        db.prepare("UPDATE ticket_evidencias SET reemplazada_por_id = ? WHERE id = ?").run(id, anterior.id);
      }
      registrarEvento({
        usuarioId: usuario.id,
        entidad: "ticket",
        entidadId: ticket.id,
        evento: anterior ? "evidencia_reemplazada" : "evidencia_agregada",
        despues: { evidenciaId: id, etapa: datos.etapa, tipo: tipo.mime, reemplazaA: anterior?.id ?? null },
      });
      return id;
    })();
  } catch (error) {
    await rm(datos.archivo.path, { force: true });
    if (destino) await rm(destino, { force: true });
    if (miniatura) await rm(path.resolve(config.storageDir, miniatura), { force: true });
    throw error;
  }
}

/** Devuelve la ruta del archivo solo si la persona tiene derecho a verlo. */
export function localizarEvidencia(usuario: UsuarioSesion, id: number, miniatura: boolean) {
  const ev = db
    .prepare(
      `SELECT ticket_id AS ticketId, etapa, nombre_original AS nombre, mime_type AS mime,
              ruta_archivo AS ruta, ruta_miniatura AS miniatura
         FROM ticket_evidencias WHERE id = ?`,
    )
    .get(id) as
    | { ticketId: number; etapa: Etapa; nombre: string; mime: string; ruta: string; miniatura: string | null }
    | undefined;
  const ticket = ev ? obtenerPorId(ev.ticketId) : undefined;
  // El reportante solo accede a lo que él mismo adjuntó; nunca a evidencia técnica.
  const visible = ev && ticket && puedeVer(usuario, ticket) && (usuario.rol !== "reportante" || ev.etapa === "inicial_reportante");
  if (!ev || !visible) throw new ErrorNegocio("Archivo no encontrado.", 404);

  const usarMiniatura = miniatura && ev.miniatura;
  const absoluta = path.resolve(config.storageDir, usarMiniatura ? ev.miniatura! : ev.ruta);
  if (!absoluta.startsWith(config.storageDir + path.sep)) throw new ErrorNegocio("Archivo no encontrado.", 404);
  return { ruta: absoluta, mime: usarMiniatura ? "image/jpeg" : ev.mime, nombre: ev.nombre };
}