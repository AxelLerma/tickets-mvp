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
  pisoZona: string | null;
  equipoActivo: string | null;
  descripcion: string;
  impacto: "solo_yo" | "varias_personas" | "operacion_detenida";
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
  similares?: {
    id: number;
    folio: string;
    titulo: string;
    estado: string;
    creadoEn: string;
  }[];
}

export interface Opcion {
  id: number;
  nombre: string;
}

export interface Subcategoria {
  id: number;
  categoriaId: number;
  nombre: string;
}

export interface Catalogos {
  categorias: Opcion[];
  sedes: Opcion[];
  subcategorias: Subcategoria[];
  motivos: { espera: Opcion[]; cancelacion: Opcion[]; cierre: Opcion[] };
}

export type Etapa = "inicial_reportante" | "inicial_tecnico" | "cierre";

export interface Comentario {
  id: number;
  autorId: number | null;
  texto: string;
  tipo: "comentario" | "sistema";
  creadoEn: string;
  autor: string | null;
  rolAutor: Rol | null;
}

export interface Evidencia {
  id: number;
  autorId: number;
  etapa: Etapa;
  nombre: string;
  mime: string;
  tamano: number;
  tieneMiniatura: boolean;
  reemplazadaPor: number | null;
  creadoEn: string;
  autor: string;
}

export interface Paso {
  id: number;
  descripcion: string;
  resultado: string;
  minutos: number;
  creadoEn: string;
  autor: string;
}

export interface Espera {
  id: number;
  motivo: string;
  inicio: string;
  fin: string | null;
}

export interface ControlesCierre {
  queSeHizo: boolean;
  comoSeDejo: boolean;
  troubleshooting: boolean;
  tiempo: boolean;
  evidencia: boolean;
  completo: boolean;
}

export interface DatosTecnico {
  intervencion: {
    comoSeEncontro: string | null;
    queSeHizo: string | null;
    comoSeDejo: string | null;
    materiales: string | null;
    motivoCierreId: number | null;
    motivoCierre: string | null;
  };
  pasos: Paso[];
  esperas: Espera[];
  cierre: ControlesCierre | null;
}

export interface EventoHistorial {
  id: number;
  fecha: string;
  evento: string;
  comentario: string | null;
  usuario: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

export interface Acciones {
  iniciar: boolean;
  registrarTrabajo: boolean;
  comentar: boolean;
  reabrir: boolean;
  cancelar: boolean;
  etapasEvidencia: Etapa[];
}

export interface Detalle {
  ticket: Ticket;
  comentarios: Comentario[];
  evidencias: Evidencia[];
  acciones: Acciones;
  tecnico?: DatosTecnico;
  historial?: EventoHistorial[];
}