import nodemailer from "nodemailer";
import { config } from "../config";
import { consultar, ejecutar } from "../db/connection";

const MAX_INTENTOS = 3;
const INTERVALO_MS = 15_000;

const transporte = config.smtpHost
  ? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    })
  : null;

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Pendiente {
  id: number;
  ticketId: number | null;
  titulo: string;
  mensaje: string;
  intentos: number;
  correo: string;
  nombre: string;
}

function contenido(n: Pendiente) {
  const enlace = n.ticketId ? `${config.appUrl}/tickets/${n.ticketId}` : config.appUrl;
  return {
    text: `Hola ${n.nombre},\n\n${n.mensaje}\n\nVer ticket: ${enlace}\n\nInstituto Electoral del Estado de Querétaro\nSistema interno de soporte`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;color:#231830">
  <div style="background:#4b2377;color:#fff;padding:14px 18px;font-weight:600">Instituto Electoral del Estado de Querétaro</div>
  <div style="padding:18px;border:1px solid #cbbde0;border-top:0">
    <p>Hola ${escapar(n.nombre)},</p>
    <p>${escapar(n.mensaje)}</p>
    <p><a href="${escapar(enlace)}" style="background:#0e5e66;color:#fff;padding:10px 18px;text-decoration:none;display:inline-block">Ver ticket</a></p>
    <p style="color:#5d4d73;font-size:12px">Sistema interno de soporte y atención de tickets</p>
  </div>
</div>`,
  };
}

let procesando = false;

export async function procesarCorreos(): Promise<void> {
  if (procesando) return;
  procesando = true;
  try {
    const pendientes = await consultar<Pendiente>(
      `SELECT n.id, n.ticket_id, n.titulo, n.mensaje, n.correo_intentos AS intentos, u.correo, u.nombre
         FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
        WHERE n.correo_estado = 'pendiente' ORDER BY n.id LIMIT 20`,
    );
    for (const n of pendientes) {
      if (!transporte) {
        await ejecutar("UPDATE notificaciones SET correo_estado = 'omitido' WHERE id = ?", [n.id]);
        continue;
      }
      try {
        await transporte.sendMail({ from: config.smtpFrom, to: n.correo, subject: n.titulo, ...contenido(n) });
        await ejecutar(
          "UPDATE notificaciones SET correo_estado = 'enviado', correo_intentos = correo_intentos + 1, correo_error = NULL WHERE id = ?",
          [n.id],
        );
      } catch (error) {
        const detalle = error instanceof Error ? error.message.slice(0, 300) : "Error desconocido";
        const estado = n.intentos + 1 >= MAX_INTENTOS ? "error" : "pendiente";
        await ejecutar(
          "UPDATE notificaciones SET correo_estado = ?, correo_intentos = correo_intentos + 1, correo_error = ? WHERE id = ?",
          [estado, detalle, n.id],
        );
      }
    }
  } finally {
    procesando = false;
  }
}

export function iniciarCorreo(): void {
  setInterval(() => {
    procesarCorreos().catch((error) => console.error("Cola de correo:", error.message));
  }, INTERVALO_MS).unref();
}