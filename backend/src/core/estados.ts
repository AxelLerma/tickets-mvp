export const ESTADOS = {
  NUEVO: "nuevo",
  ASIGNADO: "asignado",
  EN_PROCESO: "en_proceso",
  LISTO_PARA_CERRAR: "listo_para_cerrar",
  CERRADO: "cerrado",
  REABIERTO: "reabierto",
  CANCELADO: "cancelado",
} as const;

export const ESTADOS_ABIERTOS = [
  ESTADOS.NUEVO,
  ESTADOS.ASIGNADO,
  ESTADOS.EN_PROCESO,
  ESTADOS.LISTO_PARA_CERRAR,
  ESTADOS.REABIERTO,
];


export const SQL_ESTADOS_ABIERTOS = ESTADOS_ABIERTOS.map((e) => `'${e}'`).join(", ");

export const PRIORIDAD_POR_IMPACTO = {
  solo_yo: "baja",
  varias_personas: "normal",
  operacion_detenida: "alta",
} as const;


export const HORAS_OBJETIVO = { alta: 4, normal: 24, baja: 72 } as const;

export type Impacto = keyof typeof PRIORIDAD_POR_IMPACTO;

export const VENTANA_REAPERTURA_HORAS = 48;
export const MIN_COMO_SE_ENCONTRO = 100;

export const esUnoDe = (valor: string, ...lista: string[]) => lista.includes(valor);

/** Matriz de transiciones válidas. Cualquier otro cambio de estado se rechaza. */
export const TRANSICIONES: Record<string, string[]> = {
  [ESTADOS.NUEVO]: [ESTADOS.ASIGNADO, ESTADOS.CANCELADO],
  [ESTADOS.ASIGNADO]: [ESTADOS.EN_PROCESO, ESTADOS.CANCELADO],
  [ESTADOS.EN_PROCESO]: [ESTADOS.LISTO_PARA_CERRAR, ESTADOS.CANCELADO],
  [ESTADOS.LISTO_PARA_CERRAR]: [ESTADOS.CERRADO, ESTADOS.CANCELADO],
  [ESTADOS.CERRADO]: [ESTADOS.REABIERTO],
  [ESTADOS.REABIERTO]: [ESTADOS.EN_PROCESO, ESTADOS.CANCELADO],
  [ESTADOS.CANCELADO]: [],
};