import type { Ticket } from "./tipos";

export const ETIQUETAS_ESTADO: Record<string, string> = {
  nuevo: "Nuevo",
  asignado: "Asignado",
  en_proceso: "En proceso",
  listo_para_cerrar: "Listo para cerrar",
  cerrado: "Cerrado",
  reabierto: "Reabierto",
  cancelado: "Cancelado",
};

export const ETIQUETAS_IMPACTO: Record<string, string> = {
  solo_yo: "Solo a mí",
  varias_personas: "A varias personas",
  operacion_detenida: "Operación detenida",
};

const ZONA = "America/Mexico_City";

export function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: ZONA }).format(
    new Date(iso),
  );
}

export function estaVencido(ticket: Ticket): boolean {
  return new Date(ticket.fechaObjetivo) < new Date();
}