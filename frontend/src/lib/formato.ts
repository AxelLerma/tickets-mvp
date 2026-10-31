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

export const ETIQUETAS_ETAPA: Record<string, string> = {
  inicial_reportante: "Inicial (reportante)",
  inicial_tecnico: "Inicial (técnico)",
  cierre: "Cierre",
};

export const ETIQUETAS_EVENTO: Record<string, string> = {
  creacion: "Ticket creado",
  asignacion_automatica: "Asignación automática",
  cambio_estado: "Cambio de estado",
  troubleshooting_agregado: "Paso de troubleshooting registrado",
  espera_iniciada: "Información solicitada al reportante",
  espera_terminada: "Atención reanudada",
  evidencia_agregada: "Evidencia agregada",
  evidencia_reemplazada: "Evidencia reemplazada",
  cierre: "Cierre validado",
  reapertura: "Reapertura",
  cancelacion: "Cancelación",
};

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}