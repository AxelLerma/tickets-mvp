export type Rol = "reportante" | "tecnico" | "manager" | "admin";

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
}

export interface Ticket {
  id: number;
  folio: string;
  titulo: string;
  area: string;
  equipoActivo: string | null;
  descripcion: string;
  impacto: "solo_yo" | "varias_personas" | "operacion_detenida";
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

export interface Opcion {
  id: number;
  nombre: string;
}